// Utilitários dos testes E2E: contas/personagens novos pela API, entrar no mundo, chat/comandos de dev e leitura do
// estado do jogo pela sonda window.__lq (WorldScene.installE2EProbe, ligada com ?e2e na URL).
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { E2E_NAMES } from "./names.ts";

export type Vocation = "knight" | "paladin" | "sorcerer" | "druid";

export interface Player {
  account: string;
  password: string;
  name: string;
  vocation: Vocation;
  session: string;
}

interface Tile { x: number; y: number }
export interface MonsterInfo extends Tile { id: string; defId?: string; name?: string; hp?: number; maxHp?: number }
export interface GroundInfo extends Tile { id: string; defId: string; count: number }

let nameCursor = -1;
/** Próximo nome da lista de admins (cada worker começa num trecho diferente). */
function nextName(): string {
  if (nameCursor < 0) nameCursor = (test.info().workerIndex * 97 + test.info().retry * 31) % E2E_NAMES.length;
  nameCursor = (nameCursor + 1) % E2E_NAMES.length;
  return E2E_NAMES[nameCursor]!;
}

let accSeq = 0;
export function freshAccount(): string {
  return `e2e${Date.now().toString(36)}${test.info().workerIndex}${(accSeq++).toString(36)}`.slice(0, 20);
}

/** Cria conta + personagem pela API (sem UI). */
export async function createPlayer(request: APIRequestContext, vocation: Vocation = "knight"): Promise<Player> {
  const account = freshAccount();
  const password = "senha-e2e-123";
  const login = await (await request.post("/api/login", { data: { account, password, create: true } })).json();
  expect(login.ok, JSON.stringify(login)).toBe(true);
  // A lista inteira: depois de uma falha o Playwright troca de worker e o novo começa em outro trecho, que pode já estar
  // gasto (com 40 tentativas a falha de um teste derrubava o seguinte com "nenhum nome livre").
  for (let i = 0; i < E2E_NAMES.length; i++) {
    const name = nextName();
    const r = await (await request.post("/api/characters", { data: { session: login.session, name, vocation } })).json();
    if (r.ok) return { account, password, name, vocation, session: login.session };
    expect(r.error, JSON.stringify(r)).toBe("name_taken");
  }
  throw new Error("nenhum nome livre");
}

/** Abre o jogo já com a sessão da conta (vai direto à lista de personagens). */
export async function openWithSession(page: Page, p: Player): Promise<void> {
  await page.addInitScript(([s]) => {
    if (!sessionStorage.getItem("lemonquest.accountSession")) sessionStorage.setItem("lemonquest.accountSession", s!);
  }, [p.session]);
  await page.goto("/?e2e");
}

/** Lista de personagens → Jogar → espera o personagem no mundo e o HUD. */
export async function playFromList(page: Page, p: Player): Promise<void> {
  const btn = page.getByRole("button", { name: `Jogar com ${p.name}` });
  await expect(btn).toBeVisible({ timeout: 30_000 });
  await btn.click();
  await waitInWorld(page);
}

export async function waitInWorld(page: Page): Promise<void> {
  await page.waitForFunction(() => !!(window as any).__lq?.me(), null, { timeout: 30_000 });
  await expect(page.locator(".hud-rail")).toBeVisible();
  // Overlay "Entrando no mundo…" some.
  await expect(page.locator("#boot")).toBeHidden({ timeout: 15_000 });
}

/** Conta nova + personagem + entra no mundo. */
export async function enterGame(page: Page, vocation: Vocation = "knight"): Promise<Player> {
  const p = await createPlayer(page.request, vocation);
  await openWithSession(page, p);
  await playFromList(page, p);
  return p;
}

/**
 * Fala no chat (Enter abre, Enter envia). Um Enter só às vezes se perde logo depois de uma janela fechar (a de roupas
 * trata o Enter em captura até desmontar): repete até o campo receber o foco, como os cliques do mundo.
 */
export async function say(page: Page, text: string): Promise<void> {
  const input = page.locator(".chat-input");
  await expect.poll(async () => {
    await page.keyboard.press("Enter");
    await page.waitForTimeout(150);
    return input.evaluate((el) => el === document.activeElement);
  }, { timeout: 10_000, intervals: [300], message: "Enter abre o chat" }).toBe(true);
  await input.fill(text);
  await input.press("Enter");
  await expect(input).not.toBeFocused();
}

export const me = (page: Page) => page.evaluate(() => (window as any).__lq.me() as { x: number; y: number; tileX: number; tileY: number; moving: boolean } | null);
export const meState = (page: Page) => page.evaluate(() => (window as any).__lq.meState() as Record<string, any> | null);
export const monsters = (page: Page) => page.evaluate(() => (window as any).__lq.monsters() as MonsterInfo[]);
export const ground = (page: Page) => page.evaluate(() => (window as any).__lq.ground() as GroundInfo[]);
export const inventory = (page: Page) => page.evaluate(() => (window as any).__lq.inventory() as { backpack: ({ defId: string; count: number } | null)[]; equipment: Record<string, unknown>; gold: number } | null);

/** /level N e espera o level aplicado. */
export async function setLevel(page: Page, level: number): Promise<void> {
  await say(page, `/level ${level}`);
  await expect.poll(async () => (await meState(page))?.level, { timeout: 10_000 }).toBe(level);
}

/**
 * /tp x y e espera chegar de verdade: o estado do servidor (x,y) E o ator na tela (tileX,tileY — o salto visual é
 * aplicado ~40 ms depois do estado) e então a câmera centrada nele. Só com o estado, `tileToClient` usava a câmera
 * ainda no lugar antigo e o clique caía fora da janela.
 */
export async function teleport(page: Page, x: number, y: number): Promise<void> {
  await say(page, `/tp ${x} ${y}`);
  await expect.poll(async () => { const m = await me(page); return m ? `${m.x},${m.y}|${m.tileX},${m.tileY}` : ""; }, { timeout: 10_000 })
    .toBe(`${x},${y}|${x},${y}`);
  await waitSettled(page);
}

/** Jogador parado e câmera parada e centrada nele: coordenadas de tela confiáveis. */
export async function waitSettled(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as any).__lq.settled(), null, { timeout: 15_000 });
}

/** Centro do tile em px da página. `fy` = fração vertical dentro do tile (0 topo, 1 base). */
export const tileToClient = (page: Page, x: number, y: number, fy = 0.5) =>
  page.evaluate(([x, y, fy]) => (window as any).__lq.tileToClient(x, y, fy) as { x: number; y: number }, [x, y, fy] as const);

export async function clickTile(page: Page, x: number, y: number, opts: { button?: "left" | "right"; modifiers?: ("Control")[]; fy?: number } = {}): Promise<void> {
  const c = await tileToClient(page, x, y, opts.fy);
  // mouse.click não aceita modificadores: segura as teclas em volta do clique.
  for (const k of opts.modifiers ?? []) await page.keyboard.down(k);
  await page.mouse.click(c.x, c.y, { button: opts.button ?? "left" });
  for (const k of opts.modifiers ?? []) await page.keyboard.up(k);
}

/** Arrasta com o mouse real (pointer events), em passos. */
export async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 12): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 6, from.y + 6, { steps: 3 });
  await page.mouse.move(to.x, to.y, { steps });
  await page.mouse.up();
}

export async function center(page: Page, selector: string | import("@playwright/test").Locator) {
  const loc = typeof selector === "string" ? page.locator(selector) : selector;
  const b = await loc.boundingBox();
  if (!b) throw new Error(`sem caixa: ${selector}`);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

/** Tiles andáveis livres ao redor de (x,y) até `r`. */
export async function walkableNear(page: Page, x: number, y: number, r = 3): Promise<Tile[]> {
  return page.evaluate(([x, y, r]) => {
    const lq = (window as any).__lq;
    const out: { x: number; y: number }[] = [];
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (lq.walkable(x + dx, y + dy)) out.push({ x: x + dx, y: y + dy });
    return out;
  }, [x, y, r] as const);
}

/**
 * Dois tiles vizinhos (A, B) livres e longe de qualquer outro jogador: os testes rodam em paralelo e todo personagem novo
 * nasce no mesmo spawn, então um par fixo se atropela (o clique direito pegaria o jogador errado). `mine` = ids a ignorar.
 */
export async function quietPair(page: Page, cx: number, cy: number, mine: string[], radius = 14, clear = 5): Promise<[Tile, Tile]> {
  const pair = await page.evaluate(([cx, cy, mine, radius, clear]) => {
    const lq = (window as any).__lq;
    const others = (lq.players() as { id: string; x: number; y: number }[]).filter((p) => !(mine as string[]).includes(p.id));
    const free = (x: number, y: number) => lq.walkable(x, y) && others.every((o) => Math.max(Math.abs(o.x - x), Math.abs(o.y - y)) > (clear as number));
    const spots: { a: { x: number; y: number }; b: { x: number; y: number } }[] = [];
    for (let dy = -(radius as number); dy <= (radius as number); dy++) for (let dx = -(radius as number); dx <= (radius as number); dx++) {
      const a = { x: (cx as number) + dx, y: (cy as number) + dy }, b = { x: a.x + 1, y: a.y };
      if (free(a.x, a.y) && free(b.x, b.y)) spots.push({ a, b });
    }
    return spots.length ? spots[Math.floor(Math.random() * spots.length)]! : null;
  }, [cx, cy, mine, radius, clear] as const);
  if (!pair) throw new Error("nenhum par de tiles livre perto de " + cx + "," + cy);
  return [pair.a, pair.b];
}

/** Liga/desliga "seguir o alvo" (F8) até o estado pedido (personagem novo já começa seguindo). */
export async function setChase(page: Page, on: boolean): Promise<void> {
  await expect.poll(async () => {
    if (((await meState(page))?.chase ?? false) !== on) await page.keyboard.press("F8");
    await page.waitForTimeout(250);
    return (await meState(page))?.chase ?? false;
  }, { timeout: 10_000 }).toBe(on);
}

/**
 * Clica no monstro mais perto até virar o alvo. `timeoutMs`: quanto esperar até haver alvo (curto em laços que também
 * vigiam outra coisa, como a pausa do Coliseu). Tentativa sim, tentativa não, clica na linha dele na Batalha: o clique
 * vai no tile do servidor e, com a máquina lenta (CI), o desenho do monstro andando ainda está no tile anterior.
 */
export async function targetNearest(page: Page, filter?: (defId: string) => boolean, timeoutMs = 30_000): Promise<string> {
  let id = "", tries = 0;
  await expect.poll(async () => {
    const m = (await me(page))!;
    const list = (await monsters(page)).filter((x) => !filter || filter(x.defId ?? ""))
      .sort((a, b) => Math.max(Math.abs(a.x - m.x), Math.abs(a.y - m.y)) - Math.max(Math.abs(b.x - m.x), Math.abs(b.y - m.y)));
    const t = list[0];
    if (!t) return "";
    const cur = await page.evaluate(() => (window as any).__lq.target());
    if (cur && list.some((x) => x.id === cur)) { id = cur; return cur; }
    const row = t.name ? page.locator(`.battle-row.monster[data-tip="${t.name}"]`).first() : null;
    if (tries++ % 2 === 1 && row && (await row.count())) await row.click();
    else await clickTile(page, t.x, t.y, { fy: 0.6 });
    await page.waitForTimeout(150);
    id = await page.evaluate(() => (window as any).__lq.target());
    if (id && !list.some((x) => x.id === id)) return ""; // a linha da Batalha pegou outro (filtrado): tenta de novo
    return id;
  }, { timeout: timeoutMs, intervals: [300] }).not.toBe("");
  return id;
}


/**
 * Mira ESTE monstro (por id) até `__lq.target() === id`: alterna a linha dele na Batalha (`data-id`, não tira o
 * jogador do lugar) e o clique no tile dele. false = ele sumiu (morreu ou saiu da tela) antes de pegar a mira.
 */
export async function targetMonster(page: Page, id: string, timeoutMs = 10_000): Promise<boolean> {
  const end = Date.now() + timeoutMs;
  for (let tries = 0; Date.now() < end; tries++) {
    if ((await page.evaluate(() => (window as any).__lq.target())) === id) return true;
    const t = (await monsters(page)).find((m) => m.id === id);
    if (!t) return false;
    const row = page.locator(`.battle-row.monster[data-id="${id}"]`);
    if (tries % 2 === 0 && (await row.count())) {
      await row.first().click();
      // O botão da linha fica com o foco: o Enter que abre o chat (say) o "clicaria" de novo e tiraria a mira.
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    } else await clickTile(page, t.x, t.y, { fy: 0.6 });
    await page.waitForTimeout(200);
  }
  return (await page.evaluate(() => (window as any).__lq.target())) === id;
}

/** Linha de visão entre dois tiles pela regra do servidor (sonda `__lq.los`). */
export const los = (page: Page, x0: number, y0: number, x1: number, y1: number) =>
  page.evaluate(([x0, y0, x1, y1]) => (window as any).__lq.los(x0, y0, x1, y1) as boolean, [x0, y0, x1, y1] as const);

/** Captura para revisão visual (só com E2E_SNAPS=1): test-results/snaps/<nome>.png. */
export async function snap(page: Page, name: string): Promise<void> {
  if (process.env.E2E_SNAPS !== "1") return;
  await page.screenshot({ path: `test-results/snaps/${name}.png` });
}

/** Quantos `defId` há na mochila. */
export const countOf = async (page: Page, defId: string): Promise<number> =>
  ((await inventory(page))?.backpack ?? []).reduce((n, b) => n + (b?.defId === defId ? b.count : 0), 0);

/**
 * Vai até o NPC (teleporte para um tile livre ao lado) e clica nele até a janela abrir. `name` = título da janela
 * (NpcDef.name). O NPC anda um pouco: cada tentativa relê o tile.
 */
export async function openNpc(page: Page, npcId: string, name: string) {
  const tile = () => page.evaluate((id) => (window as any).__lq.npcTile(id) as { x: number; y: number } | null, npcId);
  const t = (await tile())!;
  if (!t) throw new Error(`NPC sem tile: ${npcId}`);
  const spot = (await walkableNear(page, t.x, t.y + 2, 1)).find((s) => !(s.x === t.x && s.y === t.y))!;
  await teleport(page, spot.x, spot.y);
  const win = page.getByRole("dialog", { name });
  await expect.poll(async () => {
    if (await win.isVisible()) return true;
    const c = (await tile()) ?? t;
    await clickTile(page, c.x, c.y, { fy: 0.6 });
    await page.waitForTimeout(800);
    return win.isVisible();
  }, { timeout: 20_000, intervals: [300], message: `janela "${name}"` }).toBe(true);
  return win;
}

/**
 * Grava o texto de cada toast no instante em que aparece (MutationObserver): um toast dura 3 s e, com a máquina
 * ocupada, a asserção chegava depois. Chame antes da ação; depois use `seenToast`.
 */
export async function recordToasts(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as any;
    if (w.__toastsSeen) return;
    w.__toastsSeen = [] as string[];
    const scan = () => {
      for (const el of document.querySelectorAll(".toast")) {
        const text = el.textContent ?? "";
        if (!w.__toastsSeen.includes(text)) w.__toastsSeen.push(text);
      }
    };
    new MutationObserver(scan).observe(document.body, { subtree: true, childList: true, characterData: true });
    scan();
  });
}

/** Primeiro toast gravado que contém `text` (espera até aparecer). */
export async function seenToast(page: Page, text: string, timeout = 15_000): Promise<string> {
  let hit = "";
  await expect.poll(async () => {
    hit = (await page.evaluate((t) => ((window as any).__toastsSeen as string[] | undefined)?.find((s) => s.includes(t)) ?? "", text)) as string;
    return hit;
  }, { timeout, message: `toast com "${text}"` }).not.toBe("");
  return hit;
}

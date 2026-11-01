// Estagiário (bot de caça executado pelo servidor): gravar uma rota andando com o teclado na floresta, salvar com nome,
// ligar; o crachá do Estagiário aparece ao lado do próprio nome, o acompanhante surge (fora da battle list, e o dono passa por cima dele) e um rato
// morre sem comando (o XP sobe). Desligar tira o crachá e some com o acompanhante.
import { expect, test, type Page } from "@playwright/test";
import { enterGame, me, meState, monsters, say, setLevel, teleport, waitSettled, walkableNear } from "./helpers.ts";

/** Floresta ao norte da vila (fora da PZ, com ratos). */
const FOREST = { x: 70, y: 62 };

const DIRS: Record<string, [number, number]> = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };

const walkable = (page: Page, x: number, y: number) => page.evaluate(([x, y]) => (window as any).__lq.walkable(x, y) as boolean, [x, y] as const);

/** Segura a seta até o jogador sair do tile (um passo) e espera parar. */
async function stepKey(page: Page, key: string): Promise<{ x: number; y: number }> {
  const m0 = (await me(page))!;
  await page.keyboard.down(key);
  await expect.poll(async () => { const m = (await me(page))!; return `${m.x},${m.y}`; }, { timeout: 10_000 }).not.toBe(`${m0.x},${m0.y}`);
  await page.keyboard.up(key);
  await waitSettled(page);
  const m = (await me(page))!;
  return { x: m.x, y: m.y };
}

/** Um passo para um vizinho andável e sem monstro (preferindo a direita): a rota grava o caminho. */
async function stepAnywhere(page: Page): Promise<void> {
  const m = (await me(page))!;
  const busy = new Set((await monsters(page)).map((k) => `${k.x},${k.y}`));
  for (const [key, [dx, dy]] of Object.entries(DIRS)) {
    const x = m.x + dx, y = m.y + dy;
    if (!busy.has(`${x},${y}`) && (await walkable(page, x, y))) { await stepKey(page, key); return; }
  }
  throw new Error(`sem vizinho livre em ${m.x},${m.y}`);
}

const companionOf = async (page: Page) => {
  const myId = await page.evaluate(() => (window as any).__lq.myId() as string);
  return (await monsters(page)).find((k) => k.defId === "estagiario" && (!k.ownerId || k.ownerId === myId)) ?? null;
};

test("Estagiário: grava a rota, liga, crachá no nome, acompanhante fora da batalha e atravessável, mata um rato sozinho e desliga", async ({ page }) => {
  test.setTimeout(180_000);
  const p = await enterGame(page, "knight");
  await setLevel(page, 8);
  await say(page, "/item health_potion 20");

  // Um tile com 3 vizinhos livres à direita (a gravação anda 3 passos), senão o primeiro livre.
  const spots = await walkableNear(page, FOREST.x, FOREST.y, 4);
  let spot = spots[0]!;
  for (const s of spots) {
    if ((await walkable(page, s.x + 1, s.y)) && (await walkable(page, s.x + 2, s.y)) && (await walkable(page, s.x + 3, s.y))) { spot = s; break; }
  }
  await teleport(page, spot.x, spot.y);

  // Janela pelo botão do trilho → aba Rota → gravar.
  await page.getByTestId("rail-estagiario").click();
  const win = page.getByRole("dialog", { name: "Estagiário" });
  await expect(win).toBeVisible();
  await win.getByTestId("est-tab-rota").click();
  await win.getByTestId("est-gravar").click();
  await expect(win.getByTestId("est-parar")).toBeVisible({ timeout: 10_000 });
  // O botão clicado fica com o foco; as setas são do mundo (não é campo de texto), mas solta o foco por garantia.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  for (let i = 0; i < 3; i++) await stepAnywhere(page);

  await win.getByTestId("est-parar").click();
  await win.getByTestId("est-nome").fill("Teste");
  await win.getByTestId("est-salvar-rota").click();
  const ligarBtn = win.getByTestId("est-ligar-Teste");
  await expect(ligarBtn).toBeVisible({ timeout: 10_000 });
  await ligarBtn.click();
  await expect.poll(async () => (await meState(page))?.bot, { timeout: 15_000 }).toBe(true);
  await expect(win.getByTestId("est-desligar")).toBeVisible();

  // O próprio nome ganha o crachá do Estagiário (o texto do nome não muda).
  const myId = await page.evaluate(() => (window as any).__lq.myId() as string);
  await expect.poll(() => page.evaluate((id) => (window as any).__lq.botBadge(id) as boolean, myId), { timeout: 10_000 }).toBe(true);
  expect(await page.evaluate((id) => (window as any).__lq.nameLabel(id) as string | null, myId)).toBe(p.name);

  // O acompanhante existe e não aparece na battle list (não é alvo).
  await expect.poll(async () => !!(await companionOf(page)), { timeout: 15_000, message: "acompanhante na tela" }).toBe(true);
  await expect(page.locator(".battle-list, .battle-empty").first()).toBeVisible();
  await expect.poll(() => page.locator(".battle-row").evaluateAll((rows) => rows.filter((r) => (r.getAttribute("data-tip") ?? "").includes("Estagiário")).length))
    .toBe(0);

  // Um rato morre sem comando: o XP sobe com a rota rodando.
  const xp0 = (await meState(page))!.xp as number;
  await expect.poll(async () => (await meState(page))?.xp as number, { timeout: 60_000, intervals: [1000], message: "XP subir pela rota" })
    .toBeGreaterThan(xp0);

  // O dono passa por cima do próprio acompanhante: teleporta para um vizinho ortogonal livre dele (o acompanhante só
  // anda com o dono a mais de 1 tile, então fica onde está) e aperta a seta na direção dele. A rota ainda roda até a
  // seta (que a pausa) e pode dar um passo antes: tenta de novo com o tile relido.
  let pisou = "";
  for (let tentativa = 0; tentativa < 5 && pisou !== "pisou"; tentativa++) {
    const c = await companionOf(page);
    expect(c, "acompanhante na tela").not.toBeNull();
    const busy = new Set((await monsters(page)).map((k) => `${k.x},${k.y}`));
    let lado: { key: string; x: number; y: number } | null = null;
    for (const [key, [dx, dy]] of Object.entries(DIRS)) {
      const x = c!.x - dx, y = c!.y - dy; // de (x,y), a seta `key` leva ao tile do acompanhante
      if (!busy.has(`${x},${y}`) && (await walkable(page, x, y))) { lado = { key, x, y }; break; }
    }
    if (!lado) { pisou = `sem vizinho livre do acompanhante em ${c!.x},${c!.y}`; await page.waitForTimeout(1000); continue; }
    // Pausa a rota antes do /tp (mexer à mão pausa 10 s): a rota do teste tem 3 passos e puxaria o personagem de volta
    // ao ponto dela antes de o teleporte ser conferido (falha do CI de 2026-11-01).
    await stepAnywhere(page);
    await teleport(page, lado.x, lado.y);
    const m = (await me(page))!, alvo = await companionOf(page); // tile do acompanhante na hora da seta
    const key = alvo && Object.entries(DIRS).find(([, [dx, dy]]) => m.x + dx === alvo.x && m.y + dy === alvo.y)?.[0];
    if (!alvo || !key) { pisou = `não ficou ao lado (${m.x},${m.y} × ${alvo?.x},${alvo?.y})`; continue; }
    await page.keyboard.down(key);
    await expect.poll(async () => { const n = (await me(page))!; return `${n.x},${n.y}`; }, { timeout: 10_000 }).not.toBe(`${m.x},${m.y}`)
      .catch(() => undefined);
    await page.keyboard.up(key);
    await waitSettled(page);
    pisou = await expect.poll(async () => {
      const n = (await me(page))!, c2 = await companionOf(page);
      return (n.x === alvo.x && n.y === alvo.y) || (!!c2 && n.x === c2.x && n.y === c2.y);
    }, { timeout: 5_000 }).toBe(true).then(() => "pisou", () => "não pisou");
  }
  expect(pisou, "dono pisa no tile do acompanhante").toBe("pisou");

  // Desligar: sem crachá e sem acompanhante.
  await win.getByTestId("est-desligar").click();
  await expect.poll(async () => (await meState(page))?.bot, { timeout: 15_000 }).toBe(false);
  await expect.poll(async () => !!(await companionOf(page)), { timeout: 15_000, message: "acompanhante sumiu" }).toBe(false);
  await expect.poll(() => page.evaluate((id) => (window as any).__lq.botBadge(id) as boolean, myId), { timeout: 10_000 }).toBe(false);
});

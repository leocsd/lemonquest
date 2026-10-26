// Siderúrgica (ciclo 19, docs/regioes/siderurgica.md §7.3; mapa em tools/mapgen/expansion6.mjs): trem da Vila e da Malha
// até a Estação do Minério e de volta; o atalho oculto da casinha de cargas da Malha (lv 10) que deixa a região alcançável
// a pé (e por isso quem desloga lá volta lá); a porta de level com a saída sem level ao lado; um monstro do setor; o posto
// avançado da Sala de Controle; o evento da segunda que chama o Golem do Convertedor; e as capturas de cada setor.
import { expect, test, type Page } from "@playwright/test";
import { clickTile, enterGame, inventory, me, monsters, openNpc, say, setLevel, snap, teleport, waitInWorld, waitSettled, walkableNear } from "./helpers.ts";

/** Coordenadas globais de expansion6.mjs e shared/data/npcs.ts (o servidor usa o tile ou o livre mais perto). */
const MINERIO_ARRIVAL = { x: 24, y: 594 };
const VILLAGE_ARRIVAL = { x: 97, y: 98 };
const MALHA_DOOR = { x: 46, y: 384 }; // porta da casinha de cargas (lv 10)
const MALHA_RETURN = { x: 46, y: 385 };
const MINERIO_PORTAL = { x: 8, y: 591 };
const MINERIO_PORTAL_ARRIVAL = { x: 11, y: 593 };
/** Porta D2 (Pátio → Correias, lv 25): porta, chegada, saída sem level, volta. */
const D2 = { door: { x: 99, y: 604 }, arrive: { x: 102, y: 604 }, exit: { x: 101, y: 605 }, back: { x: 98, y: 605 } };
/** Retângulo da zona "Estação do Minério" (BLOCK6 4,580 + local 3,3, 34×25). */
const STATION = { x0: 7, y0: 583, x1: 40, y1: 607 };
const ZONE = "Estação do Minério";

const gold = async (p: Page) => (await inventory(p))!.gold;
const distTo = async (p: Page, t: { x: number; y: number }) => { const m = (await me(p))!; return Math.max(Math.abs(m.x - t.x), Math.abs(m.y - t.y)); };
const inStation = async (p: Page) => { const m = await me(p); return !!m && m.x >= STATION.x0 && m.x <= STATION.x1 && m.y >= STATION.y0 && m.y <= STATION.y1; };
const zoneFooter = (page: Page) => page.locator(".minimap-zone-name").textContent().catch(() => "");

/** Grava cada faixa de zona (".zone-banner") assim que aparece: ela dura 2,4 s (como em malha.spec). */
async function recordZones(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as any;
    w.__zones = [] as string[];
    const scan = () => { for (const el of document.querySelectorAll(".zone-banner")) { const t = el.textContent ?? ""; if (!w.__zones.includes(t)) w.__zones.push(t); } };
    new MutationObserver(scan).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
}
const zonesSeen = (page: Page) => page.evaluate(() => (window as any).__zones as string[]);

async function travel(page: Page, npcId: string, npcName: string, dest: string, price: number) {
  const win = await openNpc(page, npcId, npcName);
  await win.getByRole("tab", { name: "Viagem" }).click();
  const row = win.locator(".shop-row", { hasText: dest });
  await expect(row).toContainText(String(price));
  await row.getByRole("button", { name: "Viajar" }).click();
  await expect(win).toBeHidden();
}

/** Pisa num portal a partir de um tile livre ao lado (como em malha.spec), reclicando até chegar. */
async function stepOnPortal(page: Page, portal: { x: number; y: number }, arrived: () => Promise<boolean>, from?: { x: number; y: number }): Promise<void> {
  const spot = from ?? (await walkableNear(page, portal.x, portal.y, 1)).find((t) => !(t.x === portal.x && t.y === portal.y));
  if (!spot) throw new Error(`nenhum tile livre ao lado do portal ${portal.x},${portal.y}`);
  await teleport(page, spot.x, spot.y);
  await page.waitForTimeout(1100); // espera do portal (PORTAL_COOLDOWN_MS) depois de um teleporte para perto dele
  await expect.poll(async () => {
    if (await arrived()) return true;
    await clickTile(page, portal.x, portal.y);
    await page.waitForTimeout(700);
    return arrived();
  }, { timeout: 20_000, intervals: [300], message: `portal ${portal.x},${portal.y}` }).toBe(true);
}

/** Teleporta para um tile andável perto de (x,y). */
async function goNear(page: Page, x: number, y: number, r = 3) {
  const spot = (await walkableNear(page, x, y, r))[0];
  if (!spot) throw new Error(`nada andável perto de ${x},${y}`);
  await teleport(page, spot.x, spot.y);
}

test("trem da Vila leva à Estação do Minério (250) e o Chefe da Estação traz de volta", async ({ page }) => {
  await enterGame(page, "knight");
  await setLevel(page, 30); // acima do level 8 a passagem é paga
  await say(page, "/gold 500");
  await expect.poll(() => gold(page)).toBe(500);
  await recordZones(page);

  await travel(page, "chefe_estacao_vila", "Chefe da Estação de Pedra Clara", ZONE, 250);
  await expect.poll(() => distTo(page, MINERIO_ARRIVAL), { timeout: 10_000 }).toBeLessThanOrEqual(2);
  await expect.poll(() => gold(page)).toBe(250);
  await expect.poll(() => zonesSeen(page)).toContain(ZONE);
  await expect.poll(() => zoneFooter(page)).toBe(ZONE);

  await travel(page, "chefe_estacao_minerio", "Chefe da Estação do Minério", "Vila de Pedra Clara", 250);
  await expect.poll(() => distTo(page, VILLAGE_ARRIVAL), { timeout: 10_000 }).toBeLessThanOrEqual(2);
  await expect.poll(() => gold(page)).toBe(0);
});

test("trem da Estação Central da Malha leva à Estação do Minério por 200", async ({ page }) => {
  await enterGame(page, "paladin");
  await setLevel(page, 30);
  await say(page, "/gold 200");
  await expect.poll(() => gold(page)).toBe(200);
  await teleport(page, 60, 374);
  await travel(page, "chefe_estacao_malha", "Chefe da Estação Central", ZONE, 200);
  await expect.poll(() => distTo(page, MINERIO_ARRIVAL), { timeout: 10_000 }).toBeLessThanOrEqual(2);
  await expect.poll(() => gold(page)).toBe(0);
});

test("atalho oculto: a casinha de cargas da Malha barra o lv 9; no lv 10 leva à Estação e o portal da Estação volta", async ({ page }) => {
  await enterGame(page, "druid");
  await setLevel(page, 9);
  await teleport(page, MALHA_RETURN.x, MALHA_RETURN.y);
  await page.waitForTimeout(1100);
  for (let i = 0; i < 3; i++) { await clickTile(page, MALHA_DOOR.x, MALHA_DOOR.y); await page.waitForTimeout(700); }
  expect((await me(page))!.y).toBeLessThan(500); // continua na Malha

  await setLevel(page, 10);
  await stepOnPortal(page, MALHA_DOOR, () => inStation(page), MALHA_RETURN);
  await expect.poll(() => distTo(page, MINERIO_PORTAL_ARRIVAL), { timeout: 10_000 }).toBeLessThanOrEqual(1);

  await stepOnPortal(page, MINERIO_PORTAL, async () => (await me(page))!.y < 500);
  await expect.poll(() => distTo(page, MALHA_RETURN), { timeout: 10_000 }).toBeLessThanOrEqual(1);
});

test("deslogar na Estação do Minério volta na Estação (o atalho deixa a região alcançável do templo)", async ({ page }) => {
  const p = await enterGame(page, "sorcerer");
  await setLevel(page, 30);
  await teleport(page, MINERIO_ARRIVAL.x, MINERIO_ARRIVAL.y);
  expect(await inStation(page)).toBe(true);
  // Recarrega e espera a janela de reconexão (2 s no E2E): o próximo login só aceita a posição salva se ela for
  // alcançável a pé do templo (como a Malha, pelo portal oculto).
  await page.reload();
  const btn = page.getByRole("button", { name: `Jogar com ${p.name}` });
  await expect(btn).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(4_000);
  await btn.click();
  await waitInWorld(page);
  await expect.poll(() => distTo(page, MINERIO_ARRIVAL), { timeout: 10_000 }).toBeLessThanOrEqual(1);
  expect(await inStation(page)).toBe(true);
});

test("porta das Correias: barra o lv 24, abre no lv 25; a saída sem level devolve quem perdeu level", async ({ page }) => {
  await enterGame(page, "knight");
  await setLevel(page, 24);
  await teleport(page, D2.back.x, D2.back.y);
  await page.waitForTimeout(1100);
  for (let i = 0; i < 3; i++) { await clickTile(page, D2.door.x, D2.door.y); await page.waitForTimeout(700); }
  expect((await me(page))!.x).toBeLessThanOrEqual(D2.door.x); // continua no Pátio

  await setLevel(page, 25);
  await stepOnPortal(page, D2.door, async () => (await me(page))!.x >= D2.exit.x, D2.back);
  await expect.poll(() => distTo(page, D2.arrive), { timeout: 10_000 }).toBeLessThanOrEqual(1);
  await expect.poll(() => zoneFooter(page)).toBe("Correias e Coqueria");

  await setLevel(page, 20);
  await stepOnPortal(page, D2.exit, async () => (await me(page))!.x <= D2.back.x, D2.arrive);
  await expect.poll(() => distTo(page, D2.back), { timeout: 10_000 }).toBeLessThanOrEqual(1);
});

test("Serpente da Correia nasce nas Correias e Coqueria", async ({ page }) => {
  await enterGame(page, "knight");
  await setLevel(page, 60); // aguenta a serpente (lv 27) enquanto espera o spawn
  await goNear(page, 128, 606);
  await expect.poll(async () => (await monsters(page)).map((m) => m.defId), { timeout: 30_000 }).toContain("serpente_correia");
  const m = (await monsters(page)).find((x) => x.defId === "serpente_correia")!;
  expect(m.name).toMatch(/Serpente da Correia$/); // pode nascer elite
  await expect.poll(() => zoneFooter(page)).toBe("Correias e Coqueria");
});

test("posto avançado: a Supervisora da Sala de Controle tem viagem (3 destinos) e depot", async ({ page }) => {
  await enterGame(page, "paladin");
  await setLevel(page, 90);
  await teleport(page, 15, 634);
  await expect.poll(() => zoneFooter(page)).toBe("Sala de Controle");
  const win = await openNpc(page, "supervisora_controle", "Supervisora da Sala de Controle");
  await win.getByRole("tab", { name: "Viagem" }).click();
  await expect(win.locator(".shop-row")).toHaveCount(3);
  for (const dest of ["Vila de Pedra Clara", "Estação do Minério", "Estação Central da Malha"]) await expect(win.locator(".shop-row", { hasText: dest })).toHaveCount(1);
  await win.getByRole("tab", { name: "Depot" }).click();
  await expect(win.getByTestId("depot-search")).toBeVisible();
});

test("evento Sangria do Alto-Forno chama o Golem do Convertedor na Aciaria", async ({ page }) => {
  await enterGame(page, "knight");
  await setLevel(page, 120);
  await goNear(page, 80, 646);
  await say(page, "/evento sangria_do_alto_forno 5");
  await expect.poll(async () => {
    const g = (await monsters(page)).find((m) => m.defId === "golem_convertedor");
    return g ? Math.max(Math.abs(g.x - 80), Math.abs(g.y - 638)) : 99;
  }, { timeout: 20_000 }).toBeLessThanOrEqual(8);
  await snap(page, "siderurgica-evento");
  await say(page, "/evento parar");
});

test("capturas dos setores da Siderúrgica (E2E_SNAPS=1)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await enterGame(page, "knight");
  await setLevel(page, 130);
  for (const [name, x, y, zone] of [
    ["estacao", 20, 598, "Estação do Minério"], ["patio", 60, 606, "Pátio de Minério"], ["correias", 140, 600, "Correias e Coqueria"],
    ["alto-forno", 148, 660, "Alto-Forno"], ["aciaria", 90, 660, "Aciaria"], ["laminacao", 40, 664, "Lingotamento e Laminação"],
    ["coracao", 64, 700, "Coração do Forno"],
  ] as const) {
    await goNear(page, x, y);
    await expect.poll(() => zoneFooter(page)).toBe(zone);
    await waitSettled(page);
    await snap(page, `siderurgica-${name}`);
  }
  expect(errors).toEqual([]);
});

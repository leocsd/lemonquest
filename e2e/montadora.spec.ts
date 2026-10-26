// Montadora (ciclo 20, docs/regioes/montadora.md §13.2; mapa em tools/mapgen/expansion7.mjs): a cegonha da Vila e o
// Cocheiro Dito até a Portaria e a volta; o atalho oculto do Pátio de Encomendas da Oficina (lv 10), que deixa a região
// alcançável a pé (e por isso quem desloga lá volta lá); a porta de level da Estamparia com a saída sem level ao lado; um
// monstro do Pátio; o Crash Test (alavanca, sala, porta dos troféus e baú); o Caminhão de Bobinas entre a Portaria e a
// Estação do Minério; o posto avançado da Sala de Descanso; e as capturas de cada setor.
import { expect, test, type Page } from "@playwright/test";
import { clickTile, enterGame, inventory, me, monsters, openNpc, say, setLevel, snap, teleport, waitInWorld, waitSettled, walkableNear } from "./helpers.ts";

/** Coordenadas globais de expansion7.mjs e shared/data/npcs.ts (o servidor usa o tile ou o livre mais perto). */
const PORTARIA_ARRIVAL = { x: 232, y: 758 };
const VILLAGE_ARRIVAL = { x: 97, y: 98 };
const MINERIO_ARRIVAL = { x: 24, y: 594 };
const OFICINA_PORTAL = { x: 83, y: 332 }; // recanto do Pátio de Encomendas (lv 10)
const OFICINA_RETURN = { x: 83, y: 331 };
const SERVICE_GATE = { x: 219, y: 776 };   // portão de serviço da Portaria → Oficina
const SHORTCUT_ARRIVAL = { x: 222, y: 774 };
/** Porta da Estamparia (Pátio → Estamparia, lv 25): vão da parede, chegada, saída sem level, volta. */
const DOOR = { door: { x: 320, y: 766 }, arrive: { x: 323, y: 766 }, exit: { x: 320, y: 769 }, back: { x: 318, y: 769 } };
/** Retângulo da zona "Portaria da Montadora" (BLOCK7 216,746 + local 3,3, 28×30). */
const PORTARIA = { x0: 219, y0: 749, x1: 246, y1: 778 };
/** Crash Test: alavanca, as duas placas da ponta (quem puxa fica na do lado da alavanca), destinos dessas placas, sala. */
const LEVER = { x: 355, y: 835 };
const PLATES = [{ x: 352, y: 835 }, { x: 354, y: 835 }];
const DESTS = [{ x: 224, y: 858 }, { x: 224, y: 860 }];
const ROOM = { x0: 220, y0: 852, x1: 260, y1: 864 };
const ARENA_DOOR = { x: 261, y: 858 };
const KNIGHT_CHEST = { x: 273, y: 855 };

const gold = async (p: Page) => (await inventory(p))!.gold;
const distTo = async (p: Page, t: { x: number; y: number }) => { const m = (await me(p))!; return Math.max(Math.abs(m.x - t.x), Math.abs(m.y - t.y)); };
const inRect = (r: { x0: number; y0: number; x1: number; y1: number }, t: { x: number; y: number }) => t.x >= r.x0 && t.x <= r.x1 && t.y >= r.y0 && t.y <= r.y1;
const inPortaria = async (p: Page) => { const m = await me(p); return !!m && inRect(PORTARIA, m); };
const zoneFooter = (page: Page) => page.locator(".minimap-zone-name").textContent().catch(() => "");

async function travel(page: Page, npcId: string, npcName: string, dest: string, price: number) {
  const win = await openNpc(page, npcId, npcName);
  await win.getByRole("tab", { name: "Viagem" }).click();
  const row = win.locator(".shop-row", { hasText: dest });
  await expect(row).toContainText(String(price));
  await row.getByRole("button", { name: "Viajar" }).click();
  await expect(win).toBeHidden();
}

/** Pisa num portal a partir de um tile livre ao lado (como em siderurgica.spec), reclicando até chegar. */
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

test("cegonha da Vila leva à Portaria da Montadora (250) e o Motorista traz de volta à Vila", async ({ page }) => {
  await enterGame(page, "knight");
  await setLevel(page, 30); // acima do level 8 a viagem é paga
  await say(page, "/gold 500");
  await expect.poll(() => gold(page)).toBe(500);

  await travel(page, "mt_cegonha_vila", "Motorista da Cegonha", "Portaria da Montadora", 250);
  await expect.poll(() => distTo(page, PORTARIA_ARRIVAL), { timeout: 10_000 }).toBeLessThanOrEqual(2);
  await expect.poll(() => gold(page)).toBe(250);
  await expect.poll(() => zoneFooter(page)).toBe("Portaria da Montadora");

  await travel(page, "mt_motorista", "Motorista da Cegonha", "Vila de Pedra Clara", 250);
  await expect.poll(() => distTo(page, VILLAGE_ARRIVAL), { timeout: 10_000 }).toBeLessThanOrEqual(2);
  await expect.poll(() => gold(page)).toBe(0);
});

test("Cocheiro Dito leva da Oficina à Portaria da Montadora por 200", async ({ page }) => {
  await enterGame(page, "paladin");
  await setLevel(page, 30);
  await say(page, "/gold 200");
  await expect.poll(() => gold(page)).toBe(200);
  await travel(page, "coach_oficina", "Cocheiro Dito", "Portaria da Montadora", 200);
  await expect.poll(() => distTo(page, PORTARIA_ARRIVAL), { timeout: 10_000 }).toBeLessThanOrEqual(2);
  await expect.poll(() => gold(page)).toBe(0);
});

test("atalho oculto: o recanto da Oficina barra o lv 9; no lv 10 leva ao portão de serviço e o portão volta", async ({ page }) => {
  await enterGame(page, "druid");
  await setLevel(page, 9);
  await teleport(page, OFICINA_RETURN.x, OFICINA_RETURN.y);
  await page.waitForTimeout(1100);
  for (let i = 0; i < 3; i++) { await clickTile(page, OFICINA_PORTAL.x, OFICINA_PORTAL.y); await page.waitForTimeout(700); }
  expect((await me(page))!.y).toBeLessThan(500); // continua na Oficina

  await setLevel(page, 10);
  await stepOnPortal(page, OFICINA_PORTAL, () => inPortaria(page), OFICINA_RETURN);
  await expect.poll(() => distTo(page, SHORTCUT_ARRIVAL), { timeout: 10_000 }).toBeLessThanOrEqual(1);

  await stepOnPortal(page, SERVICE_GATE, async () => (await me(page))!.y < 500);
  await expect.poll(() => distTo(page, OFICINA_RETURN), { timeout: 10_000 }).toBeLessThanOrEqual(1);
});

test("deslogar na Portaria volta na Portaria (o atalho deixa a região alcançável do templo)", async ({ page }) => {
  const p = await enterGame(page, "sorcerer");
  await setLevel(page, 30);
  await teleport(page, PORTARIA_ARRIVAL.x, PORTARIA_ARRIVAL.y);
  expect(await inPortaria(page)).toBe(true);
  // Recarrega e espera a janela de reconexão (2 s no E2E): o próximo login só aceita a posição salva se ela for
  // alcançável a pé do templo (pelo portal do Pátio de Encomendas).
  await page.reload();
  const btn = page.getByRole("button", { name: `Jogar com ${p.name}` });
  await expect(btn).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(4_000);
  await btn.click();
  await waitInWorld(page);
  await expect.poll(() => distTo(page, PORTARIA_ARRIVAL), { timeout: 10_000 }).toBeLessThanOrEqual(1);
  expect(await inPortaria(page)).toBe(true);
});

test("porta da Estamparia: barra o lv 24, abre no lv 25; a saída sem level devolve ao Pátio", async ({ page }) => {
  const front = { x: DOOR.door.x - 1, y: DOOR.door.y }; // tile do Pátio encostado no vão
  await enterGame(page, "knight");
  await setLevel(page, 24);
  await teleport(page, front.x, front.y);
  await page.waitForTimeout(1100);
  for (let i = 0; i < 3; i++) { await clickTile(page, DOOR.door.x, DOOR.door.y); await page.waitForTimeout(700); }
  expect((await me(page))!.x).toBeLessThan(DOOR.door.x); // continua no Pátio

  await setLevel(page, 25);
  await stepOnPortal(page, DOOR.door, async () => (await me(page))!.x > DOOR.door.x, front);
  await expect.poll(() => distTo(page, DOOR.arrive), { timeout: 10_000 }).toBeLessThanOrEqual(1);
  await expect.poll(() => zoneFooter(page)).toBe("Estamparia");

  await setLevel(page, 20);
  await stepOnPortal(page, DOOR.exit, async () => (await me(page))!.x < DOOR.door.x, { x: DOOR.exit.x + 1, y: DOOR.exit.y });
  await expect.poll(() => distTo(page, DOOR.back), { timeout: 10_000 }).toBeLessThanOrEqual(1);
  await expect.poll(() => zoneFooter(page)).toBe("Pátio de Carros");
});

test("Calota Rolante nasce no Pátio de Carros", async ({ page }) => {
  await enterGame(page, "knight");
  await setLevel(page, 40); // aguenta a calota (lv 12) enquanto espera o spawn
  await goNear(page, 261, 756);
  await expect.poll(async () => (await monsters(page)).map((m) => m.defId), { timeout: 30_000 }).toContain("mt_calota");
  const m = (await monsters(page)).find((x) => x.defId === "mt_calota")!;
  expect(m.name).toMatch(/Calota Rolante$/); // pode nascer elite
  await expect.poll(() => zoneFooter(page)).toBe("Pátio de Carros");
});

test("Crash Test: dois nas placas, a alavanca leva os dois para a sala com 3 monstros; a porta leva aos troféus e o baú dá o anel", async ({ browser }) => {
  const ca = await browser.newContext(), cb = await browser.newContext();
  const a = await ca.newPage(), b = await cb.newPage();
  try {
    await enterGame(a, "knight");
    await enterGame(b, "paladin");
    for (const p of [a, b]) await setLevel(p, 100); // a alavanca pede lv 95; 100 aguenta os bonecos enquanto o teste anda
    await teleport(b, PLATES[0]!.x, PLATES[0]!.y);
    await teleport(a, PLATES[1]!.x, PLATES[1]!.y); // a placa do lado da alavanca: quem puxa precisa estar numa placa
    await expect.poll(() => distTo(b, PLATES[0]!), { timeout: 10_000 }).toBe(0);
    await expect.poll(async () => {
      if ((await distTo(a, DESTS[1]!)) <= 1) return true;
      await clickTile(a, LEVER.x, LEVER.y);
      await a.waitForTimeout(800);
      return (await distTo(a, DESTS[1]!)) <= 1;
    }, { timeout: 20_000, intervals: [300], message: "alavanca do Crash Test" }).toBe(true);
    await expect.poll(() => distTo(b, DESTS[0]!), { timeout: 10_000 }).toBeLessThanOrEqual(1);
    await expect.poll(async () => (await monsters(a)).filter((m) => inRect(ROOM, m)).length, { timeout: 10_000 }).toBe(3);
    await expect.poll(() => zoneFooter(a)).toBe("Pista do Crash Test");

    // a porta da parede de impacto leva ao Boxe dos Troféus; o baú do cavaleiro dá o Anel do Para-Choque
    await stepOnPortal(a, ARENA_DOOR, async () => (await me(a))!.x > ARENA_DOOR.x, { x: ARENA_DOOR.x - 1, y: ARENA_DOOR.y });
    await expect.poll(() => zoneFooter(a)).toBe("Boxe dos Troféus");
    await teleport(a, KNIGHT_CHEST.x - 1, KNIGHT_CHEST.y);
    await expect.poll(async () => {
      const has = (await inventory(a))!.backpack.some((it) => it?.defId === "mt_anel_para_choque");
      if (!has) { await clickTile(a, KNIGHT_CHEST.x, KNIGHT_CHEST.y); await a.waitForTimeout(800); }
      return has;
    }, { timeout: 20_000, intervals: [500], message: "baú mt_crash_knight" }).toBe(true);
  } finally {
    await ca.close();
    await cb.close();
  }
});

test("Caminhão de Bobinas: Portaria → Estação do Minério → Portaria (200 cada)", async ({ page }) => {
  await enterGame(page, "druid");
  await setLevel(page, 30);
  await say(page, "/gold 400");
  await expect.poll(() => gold(page)).toBe(400);
  await teleport(page, PORTARIA_ARRIVAL.x, PORTARIA_ARRIVAL.y);
  await travel(page, "mt_bobinas", "Motorista do Caminhão de Bobinas", "Estação do Minério", 200);
  await expect.poll(() => distTo(page, MINERIO_ARRIVAL), { timeout: 10_000 }).toBeLessThanOrEqual(2);
  await expect.poll(() => gold(page)).toBe(200);
  await travel(page, "mt_bobinas_sid", "Motorista do Caminhão de Bobinas", "Portaria da Montadora", 200);
  await expect.poll(() => distTo(page, PORTARIA_ARRIVAL), { timeout: 10_000 }).toBeLessThanOrEqual(2);
  await expect.poll(() => gold(page)).toBe(0);
});

test("posto avançado: a Supervisora da Sala de Descanso tem depot e só viagem para fora (Vila e Portaria)", async ({ page }) => {
  await enterGame(page, "paladin");
  await setLevel(page, 90);
  await teleport(page, 228, 826);
  await expect.poll(() => zoneFooter(page)).toBe("Sala de Descanso");
  const win = await openNpc(page, "mt_supervisora", "Supervisora de Linha");
  await win.getByRole("tab", { name: "Viagem" }).click();
  await expect(win.locator(".shop-row")).toHaveCount(2);
  for (const dest of ["Vila de Pedra Clara", "Portaria da Montadora"]) await expect(win.locator(".shop-row", { hasText: dest })).toHaveCount(1);
  await win.getByRole("tab", { name: "Depot" }).click();
  await expect(win.getByTestId("depot-search")).toBeVisible();
});

test("capturas dos setores da Montadora (E2E_SNAPS=1)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await enterGame(page, "knight");
  await setLevel(page, 130);
  for (const [name, x, y, zone] of [
    ["portaria", 232, 760, "Portaria da Montadora"], ["patio", 270, 770, "Pátio de Carros"], ["lava-jato", 300, 780, "Lava-Jato"],
    ["estamparia", 340, 770, "Estamparia"], ["funilaria", 262, 800, "Funilaria e Armação"], ["cabines", 320, 800, "Cabines de Pintura"],
    ["estufa", 372, 810, "Estufa"], ["montagem", 262, 830, "Montagem Final"], ["descanso", 228, 826, "Sala de Descanso"],
    ["pista", 342, 832, "Pista de Testes"], ["prototipos", 300, 866, "Sala dos Protótipos"],
  ] as const) {
    await goNear(page, x, y);
    await expect.poll(() => zoneFooter(page)).toBe(zone);
    await waitSettled(page);
    await snap(page, `montadora-${name}`);
  }
  expect(errors).toEqual([]);
});

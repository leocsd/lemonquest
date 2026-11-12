// Siderúrgica (ciclo 19, docs/regioes/siderurgica.md §7.3; mapa em tools/mapgen/expansion6.mjs): trem da Vila e da Malha
// até a Estação do Minério e de volta (desde o ciclo 22 sem o atalho oculto da Malha: quem desloga lá volta lá porque o
// servidor conta as viagens no alcance); a porta de sala com level; um monstro do setor; o posto
// avançado da Sala de Controle; o evento da segunda que chama o Golem do Convertedor; e as capturas de cada setor.
import { expect, test, type Page } from "@playwright/test";
import { clickTile, doorRefuses, enterGame, passDoor, inventory, sameTile, me, monsters, openNpc, say, setLevel, snap, teleport, waitInWorld, waitSettled, walkableNear, npcTab } from "./helpers.ts";

/** Coordenadas globais de expansion6.mjs e shared/data/npcs.ts (o servidor usa o tile ou o livre mais perto). */
const MINERIO_ARRIVAL = { x: 24, y: 594 };
const VILLAGE_ARRIVAL = { x: 97, y: 98 };
/** Porta D2 (Pátio → Correias, lv 25; porta de sala desde o ciclo 22): a porta na parede e os tiles dos dois lados. */
const D2 = { door: { x: 100, y: 604 }, front: { x: 99, y: 604 }, inside: { x: 101, y: 604 } };
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
  await npcTab(win, "Viagem");
  const row = win.locator(".shop-row", { hasText: dest });
  await expect(row).toContainText(String(price));
  await row.getByRole("button", { name: "Viajar" }).click();
  await expect(win).toBeHidden();
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


test("deslogar na Estação do Minério volta na Estação (o atalho deixa a região alcançável do templo)", async ({ page }) => {
  const p = await enterGame(page, "sorcerer");
  await setLevel(page, 30);
  await teleport(page, MINERIO_ARRIVAL.x, MINERIO_ARRIVAL.y);
  expect(await inStation(page)).toBe(true);
  // Recarrega e espera a janela de reconexão (2 s no E2E): o próximo login só aceita a posição salva se ela for
  // alcançável do templo (desde o ciclo 22, pelas viagens dos NPCs).
  await page.reload();
  const btn = page.getByRole("button", { name: `Jogar com ${p.name}` });
  await expect(btn).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(4_000);
  await btn.click();
  await waitInWorld(page);
  await expect.poll(() => distTo(page, MINERIO_ARRIVAL), { timeout: 10_000 }).toBeLessThanOrEqual(1);
  expect(await inStation(page)).toBe(true);
});

test("porta das Correias (porta de sala): barra o lv 24, deixa o lv 25 entrar e sair pela mesma porta", async ({ page }) => {
  await enterGame(page, "knight");
  await setLevel(page, 24);
  await doorRefuses(page, D2.door, D2.front);
  expect((await me(page))!.x).toBeLessThan(D2.door.x); // continua no Pátio

  await setLevel(page, 25);
  await passDoor(page, D2.door, D2.front, D2.inside);
  await expect.poll(() => zoneFooter(page)).toBe("Correias e Coqueria");
  await passDoor(page, D2.door, D2.inside, D2.front);
  await expect.poll(() => zoneFooter(page)).toBe("Pátio de Minério");
});

test("cancela do Pátio (porta lv 10): o lv 10 entra na cancela, que se ergue enquanto ele está nela, e sai no Pátio", async ({ page }) => {
  const door = { x: 24, y: 607 }, front = { x: 24, y: 606 }, inside = { x: 24, y: 608 };
  await enterGame(page, "knight");
  await setLevel(page, 10);
  await teleport(page, front.x, front.y);
  await waitSettled(page);
  await snap(page, "porta-patio-fechada");
  await expect.poll(async () => {
    if (sameTile(await me(page), door)) return true;
    await clickTile(page, door.x, door.y);
    await page.waitForTimeout(600);
    return sameTile(await me(page), door);
  }, { timeout: 15_000, intervals: [300] }).toBe(true);
  await expect.poll(async () => ((await page.evaluate(() => (window as any).__lq.doors())) as { id: string; open: boolean }[]).find((d) => d.id === "sid_patio")?.open).toBe(true);
  await snap(page, "porta-patio-aberta");
  await passDoor(page, door, door, inside);
  await expect.poll(() => zoneFooter(page)).toBe("Pátio de Minério");
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
  await npcTab(win, "Viagem");
  await expect(win.locator(".shop-row")).toHaveCount(3);
  for (const dest of ["Vila de Pedra Clara", "Estação do Minério", "Estação Central da Malha"]) await expect(win.locator(".shop-row", { hasText: dest })).toHaveCount(1);
  await npcTab(win, "Depot");
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

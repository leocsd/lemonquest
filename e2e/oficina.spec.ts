// Oficina dos Engenhos (ciclo 10): desde o ciclo 22 não há mais o portal escondido da Vila (99,79): chega-se só pela
// carroça (viagem só nos NPCs); a Geladeira da Copa vende o Ensopado do Viajante; a carroça do Bastião tem o destino
// "Oficina dos Engenhos" (100 de ouro); o Rato Cinzento nasce na floresta antiga perto de (47,42).
import { expect, test, type Page } from "@playwright/test";
import { clickTile, enterGame, inventory, me, monsters, openNpc, say, setLevel, snap, teleport, walkableNear, npcTab } from "./helpers.ts";

/** Coordenadas de tools/mapgen/expansion3.mjs (VILLAGE_DOOR = o antigo portal, VILLAGE_RETURN, WORKSHOP_COACH). */
const VILLAGE_DOOR = { x: 99, y: 79 };
const VILLAGE_RETURN = { x: 98, y: 80 };
const WORKSHOP_COACH = { x: 83, y: 330 };
/** Retângulo do bloco da Oficina, em tiles (x 60..89 × y 312..333). */
const WORKSHOP = { x0: 60, y0: 312, x1: 89, y1: 333 };
const DATACENTER_RAT_SPAWN = { x: 47, y: 42 };
const ZONE = "Oficina dos Engenhos";

const gold = async (p: Page) => (await inventory(p))!.gold;
const distTo = async (p: Page, t: { x: number; y: number }) => { const m = (await me(p))!; return Math.max(Math.abs(m.x - t.x), Math.abs(m.y - t.y)); };
const inWorkshop = async (p: Page) => { const m = (await me(p))!; return m.x >= WORKSHOP.x0 && m.x <= WORKSHOP.x1 && m.y >= WORKSHOP.y0 && m.y <= WORKSHOP.y1; };

/** Grava cada faixa de zona (".zone-banner") assim que aparece: ela dura 2,4 s (como em travel.spec). */
async function recordZones(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as any;
    w.__zones = [] as string[];
    const scan = () => { for (const el of document.querySelectorAll(".zone-banner")) { const t = el.textContent ?? ""; if (!w.__zones.includes(t)) w.__zones.push(t); } };
    new MutationObserver(scan).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
}
const zonesSeen = (page: Page) => page.evaluate(() => (window as any).__zones as string[]);


test("sem portal na Vila (ciclo 22: viagem só pelos NPCs): pisar no antigo tile não leva à Oficina", async ({ page }) => {
  await enterGame(page, "knight");
  await teleport(page, VILLAGE_RETURN.x, VILLAGE_RETURN.y);
  for (let i = 0; i < 3; i++) { await clickTile(page, VILLAGE_DOOR.x, VILLAGE_DOOR.y); await page.waitForTimeout(700); }
  await expect.poll(() => distTo(page, VILLAGE_DOOR), { timeout: 10_000 }).toBe(0);
  expect(await inWorkshop(page)).toBe(false);
});

test("Geladeira da Copa abre a loja com o Ensopado do Viajante", async ({ page }) => {
  await enterGame(page, "druid");
  const win = await openNpc(page, "geladeira", "Geladeira da Copa");
  // A fala sai letra a letra (Typewriter), mas o texto inteiro já está no DOM em dois spans.
  await expect(win).toContainText("Marmita sem nome é marmita de todos.");
  await npcTab(win, "Comprar");
  const row = win.locator(".shop-row", { hasText: "Ensopado do Viajante" });
  await expect(row).toBeVisible();
  await expect(row.getByRole("button", { name: "Comprar" })).toBeVisible();
  await snap(page, "oficina-geladeira");
});

test("carroça do Bastião leva à Oficina por 100 de ouro", async ({ page }) => {
  await enterGame(page, "paladin");
  await setLevel(page, 10); // acima do level 8 a viagem é paga
  await say(page, "/gold 300");
  await expect.poll(() => gold(page)).toBe(300);
  await recordZones(page);

  const win = await openNpc(page, "coach_village", "Cocheiro Bastião");
  await npcTab(win, "Viagem");
  const row = win.locator(".shop-row", { hasText: ZONE });
  await expect(row).toContainText("100");
  await row.getByRole("button", { name: "Viajar" }).click();
  await expect(win).toBeHidden();

  await expect.poll(() => distTo(page, WORKSHOP_COACH), { timeout: 10_000 }).toBeLessThanOrEqual(2);
  expect(await inWorkshop(page)).toBe(true);
  await expect.poll(() => gold(page)).toBe(200);
  await expect.poll(() => zonesSeen(page)).toContain(ZONE);
  await snap(page, "oficina-coach");
});

test("Rato Cinzento aparece na Floresta", async ({ page }) => {
  await enterGame(page, "knight");
  const spot = (await walkableNear(page, DATACENTER_RAT_SPAWN.x, DATACENTER_RAT_SPAWN.y, 3))[0]!;
  await teleport(page, spot.x, spot.y);
  await expect.poll(async () => (await monsters(page)).map((m) => m.defId), { timeout: 30_000 }).toContain("datacenter_rat");
  const rat = (await monsters(page)).find((m) => m.defId === "datacenter_rat")!;
  expect(rat.name).toBe("Rato Cinzento");
});

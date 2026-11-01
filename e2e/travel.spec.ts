// Carroça: Vila → Posto da Fronteira com o Cocheiro Bastião (paga 150), volta com a Cocheira Zuleica, e sem ouro o
// botão "Viajar" fica travado com o aviso "Ouro insuficiente".
import { expect, test, type Page } from "@playwright/test";
import { enterGame, inventory, me, openNpc, say, setLevel, snap, npcTab } from "./helpers.ts";

/** Chegadas (shared/data/npcs.ts): o servidor usa o tile ou o livre mais perto. */
const FRONTIER = { x: 214, y: 61 };
const VILLAGE = { x: 97, y: 98 };

const gold = async (p: Page) => (await inventory(p))!.gold;
const distTo = async (p: Page, t: { x: number; y: number }) => { const m = (await me(p))!; return Math.max(Math.abs(m.x - t.x), Math.abs(m.y - t.y)); };

/** Grava cada faixa de zona (".zone-banner") assim que aparece: ela dura 2,4 s. */
async function recordZones(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as any;
    w.__zones = [] as string[];
    const scan = () => { for (const el of document.querySelectorAll(".zone-banner")) { const t = el.textContent ?? ""; if (!w.__zones.includes(t)) w.__zones.push(t); } };
    new MutationObserver(scan).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
}
const zonesSeen = (page: Page) => page.evaluate(() => (window as any).__zones as string[]);

async function travel(page: Page, npcId: string, npcName: string, dest: string) {
  const win = await openNpc(page, npcId, npcName);
  await npcTab(win, "Viagem");
  const row = win.locator(".shop-row", { hasText: dest });
  await expect(row).toContainText("150");
  await row.getByRole("button", { name: "Viajar" }).click();
  await expect(win).toBeHidden();
}

test("carroça: Vila → Posto da Fronteira → Vila, cobrando 150 por trecho e anunciando a zona", async ({ page }) => {
  await enterGame(page, "paladin");
  await setLevel(page, 10); // acima do level 8 a viagem é paga
  await say(page, "/gold 300");
  await expect.poll(() => gold(page)).toBe(300);
  await recordZones(page);

  await travel(page, "coach_village", "Cocheiro Bastião", "Posto da Fronteira");
  await expect.poll(() => distTo(page, FRONTIER), { timeout: 10_000 }).toBeLessThanOrEqual(2);
  await expect.poll(() => gold(page)).toBe(150);
  await expect.poll(() => zonesSeen(page)).toContain("Posto da Fronteira");
  await snap(page, "travel-frontier");

  await travel(page, "coach_frontier", "Cocheira Zuleica", "Vila de Pedra Clara");
  await expect.poll(() => distTo(page, VILLAGE), { timeout: 10_000 }).toBeLessThanOrEqual(2);
  await expect.poll(() => gold(page)).toBe(0);
  await expect.poll(() => zonesSeen(page)).toContain("Vila de Pedra Clara");
});

test("carroça: sem ouro o botão fica travado com 'Ouro insuficiente'", async ({ page }) => {
  await enterGame(page, "druid");
  await setLevel(page, 10);
  expect(await gold(page)).toBeLessThan(150);
  const win = await openNpc(page, "coach_village", "Cocheiro Bastião");
  await npcTab(win, "Viagem");
  const row = win.locator(".shop-row", { hasText: "Posto da Fronteira" });
  const btn = row.getByRole("button", { name: "Viajar" });
  await expect(btn).toBeDisabled();
  await expect(btn).toHaveAttribute("data-tip", "Ouro insuficiente");
  await expect(row.locator(".shop-price .bad")).toHaveText("150");
  await snap(page, "travel-no-gold");
  // Nada aconteceu: continua na vila.
  expect(await distTo(page, FRONTIER)).toBeGreaterThan(20);
});

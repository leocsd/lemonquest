// Depot: com a mochila dobrada (padrão em tela baixa), abrir o depot abre a mochila para arrastar; guardar um item
// arrastando e outro com clique direito (e retirar do mesmo jeito); ao fechar, a mochila volta a ficar dobrada.
import { expect, test, type Page } from "@playwright/test";
import { center, clickTile, countOf, drag, enterGame, inventory, teleport, waitSettled, walkableNear } from "./helpers.ts";

const section = (page: Page, id: string) => page.locator(`.hud-panel [data-panel-id="${id}"]`);
const isOpen = async (page: Page, id: string) => (await section(page, id).getAttribute("class"))?.includes(" open") ?? false;

test("depot abre a mochila dobrada, guarda um item arrastando e devolve a mochila como estava", async ({ page }) => {
  await enterGame(page, "knight");
  if (await isOpen(page, "backpack")) await section(page, "backpack").locator(".hud-section-head").click();
  await expect.poll(() => isOpen(page, "backpack")).toBe(false);

  const depot = (await page.evaluate(() => (window as any).__lq.npcTile("depot")))!;
  const spot = (await walkableNear(page, depot.x, depot.y + 1, 1))[0]!;
  await teleport(page, spot.x, spot.y);
  const win = page.locator(".npc-window");
  await expect.poll(async () => {
    if (await win.isVisible()) return true;
    await clickTile(page, depot.x, depot.y, { fy: 0.3 });
    await page.waitForTimeout(500);
    return win.isVisible();
  }, { timeout: 15_000 }).toBe(true);
  await expect(win.locator(".depot-grid")).toBeVisible();
  await expect.poll(() => isOpen(page, "backpack")).toBe(true);

  // Arrasta a carne do kit inicial para o primeiro slot do depot.
  const inv = (await inventory(page))!;
  const i = inv.backpack.findIndex((s) => s?.defId === "meat");
  expect(i).toBeGreaterThanOrEqual(0);
  const from = section(page, "backpack").locator(`[data-loc="bp:${i}"]`);
  await expect(from).toBeInViewport();
  await waitSettled(page);
  await drag(page, await center(page, from), await center(page, win.locator('[data-loc="dp:0"]')));
  await expect(win.locator('[data-loc="dp:0"]')).toHaveClass(/filled/, { timeout: 10_000 });
  await expect.poll(async () => (await inventory(page))!.backpack.some((s) => s?.defId === "meat")).toBe(false);

  // Clique direito com o depot aberto guarda a pilha inteira (antes bebia a poção); no depot, devolve para a mochila.
  const potions = () => countOf(page, "health_potion");
  const hp0 = await potions();
  expect(hp0).toBeGreaterThan(0);
  const p = (await inventory(page))!.backpack.findIndex((s) => s?.defId === "health_potion");
  const potionSlot = section(page, "backpack").locator(`[data-loc="bp:${p}"]`);
  await expect(potionSlot).toBeInViewport();
  await potionSlot.click({ button: "right" });
  await expect.poll(potions, { timeout: 10_000 }).toBe(0);
  await expect(win.locator('[data-loc="dp:1"]')).toHaveClass(/filled/, { timeout: 10_000 });
  await win.locator('[data-loc="dp:1"]').click({ button: "right" });
  await expect.poll(potions, { timeout: 10_000 }).toBe(hp0);
  await expect(win.locator('[data-loc="dp:1"]')).not.toHaveClass(/filled/, { timeout: 10_000 });

  await page.keyboard.press("Escape");
  await expect(win).toBeHidden();
  await expect.poll(() => isOpen(page, "backpack")).toBe(false);
});

// Montaria: desbloqueio único por conta (Cocheiro Bastião), liga/desliga na janela de roupas, sem bônus de
// velocidade. Server já cobre validação/persistência (outfit.test.ts, m4.test.ts); aqui só a ponta do cliente
// (janela do NPC → compra → janela de roupas → estado sincronizado), que nenhum teste de unidade enxerga.
import { expect, test } from "@playwright/test";
import { clickTile, enterGame, meState, say, teleport, walkableNear } from "./helpers.ts";

test("montaria: compra no cocheiro e liga na janela de roupas", async ({ page }) => {
  await enterGame(page, "knight");
  await say(page, "/gold 20000");
  await page.waitForTimeout(300);

  const npc = (await page.evaluate(() => (window as any).__lq.npcTile("coach_village")))!;
  const spot = (await walkableNear(page, npc.x, npc.y + 1, 2))[0]!;
  await teleport(page, spot.x, spot.y);

  const win = page.locator(".npc-window");
  for (let i = 0; i < 15 && !(await win.isVisible()); i++) { await clickTile(page, npc.x, npc.y, { fy: 0.3 }); await page.waitForTimeout(500); }
  await expect(win).toBeVisible({ timeout: 5000 });
  await expect(win.locator(".shop-name", { hasText: "Montaria" })).toBeVisible();

  await win.getByRole("button", { name: "Comprar" }).last().click();
  await expect(win.getByText('Já tem: ligue em "Roupas" (O).')).toBeVisible();
  await page.keyboard.press("Escape");

  expect((await meState(page))?.mount).toBe(false); // comprar não liga sozinho
  await page.keyboard.press("o");
  const outfitWin = page.locator(".outfit-win");
  await expect(outfitWin).toBeVisible();
  await outfitWin.locator("label.outfit-addon").filter({ hasText: "Montaria" }).click();
  await page.getByRole("button", { name: "OK" }).click();
  await expect.poll(async () => (await meState(page))?.mount).toBe(true);
});

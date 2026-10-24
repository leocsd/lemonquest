// Loja em lote: digitar a quantidade, comprar de uma vez e o "Máx" (o maior lote que cabe no ouro e na mochila).
import { expect, test } from "@playwright/test";
import { countOf, enterGame, inventory, openNpc, say, snap } from "./helpers.ts";

test("loja do Bento: compra 25 poções de uma vez e o Máx respeita o ouro", async ({ page }) => {
  await enterGame(page, "knight");
  await say(page, "/gold 2000");
  await expect.poll(async () => (await inventory(page))?.gold ?? 0).toBeGreaterThanOrEqual(2000);
  const gold0 = (await inventory(page))!.gold;
  const potions0 = await countOf(page, "health_potion");

  const win = await openNpc(page, "shop", "Bento, o Mercador");
  await win.getByRole("tab", { name: "Comprar" }).click();
  const row = win.locator(".shop-row", { hasText: "Poção de Vida" }).first();
  const qty = row.getByRole("spinbutton");
  await qty.fill("25");
  await expect(row.getByRole("button", { name: "Comprar 25" })).toBeEnabled();
  await snap(page, "shop-lote");
  await row.getByRole("button", { name: "Comprar 25" }).click();

  // Poção de Vida custa 40: 25 × 40 = 1000.
  await expect.poll(() => countOf(page, "health_potion")).toBe(potions0 + 25);
  await expect.poll(async () => (await inventory(page))!.gold).toBe(gold0 - 1000);

  // Com o ouro que sobrou, o Máx da Carne Assada (12) é o que o ouro paga, limitado a 100 por compra.
  const left = (await inventory(page))!.gold;
  const meat = win.locator(".shop-row", { hasText: "Carne Assada" }).first();
  await meat.getByRole("button", { name: /Quantidade máxima/ }).click();
  await expect(meat.getByRole("spinbutton")).toHaveValue(String(Math.min(100, Math.floor(left / 12))));
});

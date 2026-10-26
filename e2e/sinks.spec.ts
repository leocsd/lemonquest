// Sumidouros de ouro: encantamento na Dona Marta (ouro + material), tingimento na janela de roupas (8 000 por tom,
// vale pra conta) e ficha de cassino na Hanna (1 000; prêmio aleatório sempre avisado com "Ficha:").
import { expect, test, type Page } from "@playwright/test";
import { countOf, enterGame, inventory, openNpc, recordToasts, say, seenToast, snap } from "./helpers.ts";

const gold = async (p: Page) => (await inventory(p))!.gold;

test("sinks: encantamento (Dona Marta), tingimento (janela de roupas) e ficha de cassino (Hanna)", async ({ page }) => {
  test.setTimeout(120_000);
  await enterGame(page, "knight");
  await say(page, "/gold 20000");
  await expect.poll(() => gold(page)).toBe(20_000);
  await say(page, "/item wolf_fang 5");
  await expect.poll(() => countOf(page, "wolf_fang")).toBe(5);
  await recordToasts(page);

  // Encantamento (aba Encantar, grade efeito × tier): Dreno de Vida I = 5 000 + 5 presas de lobo, 10 h de combate. A
  // célula vira "Renovar" (o servidor reabre a janela) e a faixa de condições mostra o ícone com "10h" (sem combate,
  // o tempo não anda).
  const marta = await openNpc(page, "herbalist", "Dona Marta, Ervanária");
  await marta.getByRole("tab", { name: "Encantar" }).click();
  await expect(marta.locator(".imbue-status")).toContainText("Nenhum encantamento ativo.");
  const lifesteal = marta.locator('[data-imbue="lifesteal:1"]');
  await expect(lifesteal).toContainText("5/5");
  await lifesteal.getByRole("button", { name: "Comprar Dreno de Vida I" }).click(); // sem ativo: compra direto
  await expect(lifesteal).toHaveClass(/active/);
  await expect(lifesteal.getByRole("button", { name: "Renovar Dreno de Vida I" })).toBeDisabled(); // acabou o material
  await expect(marta.locator(".imbue-status")).toContainText("Ativo: Dreno de Vida I · 10h de combate");
  await seenToast(page, "Encantamento ativo: Dreno de Vida I");
  await expect.poll(() => gold(page)).toBe(15_000);
  await expect.poll(() => countOf(page, "wolf_fang")).toBe(0);
  await expect(page.locator('.conditions .cond[data-tip="Encantado"] .cond-time')).toHaveText("10h");
  // Sem material, outro efeito fica travado; tier II pede level 60.
  await expect(marta.locator('[data-imbue="thorns:1"]').getByRole("button")).toBeDisabled();
  await expect(marta.locator('[data-imbue="lifesteal:2"]')).toContainText("Lv 60");
  await expect(marta.locator('[data-imbue="lifesteal:2"]').getByRole("button")).toBeDisabled();
  await snap(page, "sink-imbuement");
  await marta.getByRole("button", { name: "Fechar" }).click();
  await expect(marta).toBeHidden();

  // Tingimento: na janela de roupas (botão do trilho = tecla O) o tom nasce trancado; clicar nele só faz a prévia no
  // boneco; o botão "Comprar (8.000)" pede um 2º clique para confirmar e só então compra; OK aplica. (O estado
  // sincronizado não expõe o tom à sonda: confere-se o desbloqueio e o ouro.)
  await page.locator('.rail-btn[data-tip="Roupas"]').click();
  const outfit = page.getByRole("dialog", { name: "Roupas" });
  await expect(outfit).toBeVisible();
  const crimson = outfit.getByRole("listbox", { name: "Tons de tingimento" }).getByRole("button", { name: "Carmesim" });
  await expect(crimson).toHaveClass(/locked/);
  await expect(crimson).toHaveAttribute("data-tip", "Carmesim · 8.000 de ouro");
  const before = await gold(page);
  await crimson.click();
  await expect(crimson).toHaveAttribute("aria-selected", "true");
  await expect(crimson).toHaveClass(/locked/); // prévia: nada comprado
  const buy = outfit.getByRole("button", { name: "Comprar (8.000)" });
  await buy.click();
  await expect(outfit.getByRole("button", { name: "Clique de novo para comprar (8.000)" })).toBeVisible();
  expect(await gold(page)).toBe(before);
  await outfit.getByRole("button", { name: "Clique de novo para comprar (8.000)" }).click();
  await expect(crimson).not.toHaveClass(/locked/);
  await expect.poll(() => gold(page)).toBe(7_000);
  await expect(outfit.getByRole("button", { name: /Comprar|comprar/ })).toHaveCount(0);
  await expect(crimson).toHaveAttribute("aria-selected", "true");
  await snap(page, "sink-tone");
  await outfit.getByRole("button", { name: "OK" }).click();
  await expect(outfit).toBeHidden();
  // Comprado uma vez: reabrir mostra o tom livre (sem cadeado) e o ouro não muda.
  await page.locator('.rail-btn[data-tip="Roupas"]').click();
  await expect(outfit).toBeVisible();
  await expect(crimson).not.toHaveClass(/locked/);
  await outfit.getByRole("button", { name: "Cancelar" }).click();
  await expect(outfit).toBeHidden();
  expect(await gold(page)).toBe(7_000);
  // Cassino: a ficha custa 1 000; o resultado chega como aviso "Ficha: …" e o ouro reflete o prêmio
  // (nada: 6 000 · 40 % de volta: 6 400 · material: 6 000 · prêmio grande 3×: 9 000).
  const hanna = await openNpc(page, "frontier_trader", "Hanna, a Mascate");
  const ticket = hanna.locator(".shop-row", { hasText: "Ficha de cassino" });
  await expect(ticket).toContainText("1.000");
  await ticket.getByRole("button", { name: "Comprar" }).click();
  const result = await seenToast(page, "Ficha:");
  await expect.poll(() => gold(page)).not.toBe(7_000);
  const g = await gold(page);
  expect([6_000, 6_400, 9_000]).toContain(g);
  if (g === 6_400) expect(result).toContain("+400 de ouro de volta");
  if (g === 9_000) expect(result).toContain("PRÊMIO GRANDE");
  await snap(page, "sink-casino");
});

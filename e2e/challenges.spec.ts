// Desafios da semana: abre pelo botão do trilho (ciclo 18) e pelo diário de missões (L); mostra as 3 metas sorteadas
// da semana zeradas e o bônus bloqueado.
import { expect, test } from "@playwright/test";
import { weekChallenges } from "../packages/shared/src/data/challenges.ts";
import { weekId } from "../packages/shared/src/data/weekly.ts";
import { enterGame } from "./helpers.ts";

test("desafios da semana: metas da semana, progresso zerado e bônus bloqueado", async ({ page }) => {
  test.setTimeout(60_000);
  await enterGame(page, "knight");
  await page.getByTestId("rail-challenges").click();
  const win = page.getByRole("dialog", { name: "Desafios da semana" });
  await expect(win).toBeVisible();
  // O sorteio é pela semana do servidor (mesma máquina do teste).
  const ids = weekChallenges(weekId(new Date())).map((d) => d.id);
  expect(ids).toHaveLength(3);
  await expect(win.locator("[data-goal]:not([data-goal=bonus])")).toHaveCount(3);
  for (const id of ids) {
    const goal = win.locator(`[data-goal="${id}"]`);
    await expect(goal).toBeVisible();
    await expect(goal).toContainText(/\b0 \/ \d/);
    await expect(goal.getByRole("button", { name: "Resgatar" })).toBeDisabled();
  }
  await expect(win.locator('[data-goal="bonus"]').getByRole("button")).toBeDisabled();
  await expect(win).toContainText("Zera em");
  await page.keyboard.press("Escape");
  await expect(win).toHaveCount(0);
  // Também abre pelo diário de missões.
  await page.keyboard.press("l");
  await page.getByRole("button", { name: "Desafios semanais" }).click();
  await expect(win).toBeVisible();
});

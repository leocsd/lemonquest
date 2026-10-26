// Seta-guia do novato: aponta o Capitão, depois a floresta dos ratos, e some quando o personagem passa do level inicial;
// depois o botão "Guiar" do rastreador religa a seta para a missão (ciclo 17).
import { expect, test, type Page } from "@playwright/test";
import { clickTile, enterGame, setLevel, teleport, walkableNear } from "./helpers.ts";

const guide = (page: Page) => page.evaluate(() => (window as any).__lq.guide() as { onScreen: boolean; label: string; dist: number } | null);

test("seta-guia: Capitão → floresta → some ao subir de level", async ({ page }) => {
  test.setTimeout(120_000);
  await enterGame(page, "knight");

  // Missão ainda não aceita: aponta o Capitão.
  await expect.poll(() => guide(page)).toMatchObject({ label: expect.stringContaining("Capitão Rodrigo") });

  // Aceita a missão: a seta passa a apontar a floresta.
  const t = (await page.evaluate(() => (window as any).__lq.npcTile("guard_captain"))) as { x: number; y: number };
  const spot = (await walkableNear(page, t.x, t.y + 2, 1))[0]!;
  await teleport(page, spot.x, spot.y);
  const win = page.getByRole("dialog", { name: "Capitão Rodrigo" });
  await expect.poll(async () => {
    if (await win.isVisible()) return true;
    await clickTile(page, t.x, t.y, { fy: 0.6 });
    await page.waitForTimeout(800);
    return win.isVisible();
  }, { timeout: 20_000, intervals: [300] }).toBe(true);
  await win.getByRole("tab", { name: "Missões" }).click();
  await win.locator('.quest-card[data-quest="rats_barn"]').getByRole("button", { name: "Aceitar" }).click();
  await win.getByRole("button", { name: "Fechar" }).click();
  await expect.poll(() => guide(page)).toMatchObject({ label: expect.stringContaining("Ratos") });
  // A floresta fica fora da tela a partir da vila: seta na borda, com a distância.
  expect((await guide(page))!.onScreen).toBe(false);
  expect((await guide(page))!.dist).toBeGreaterThan(5);

  // Passou do level inicial: a seta some.
  await setLevel(page, 10);
  await expect.poll(() => guide(page)).toBeNull();

  // Ciclo 17: "Guiar" no rastreador liga a seta para a missão (qualquer level) e "Guiando" desliga.
  const row = page.locator('.quest-tracker li[data-quest="rats_barn"]');
  await row.getByRole("button", { name: "Guiar" }).click();
  await expect.poll(() => guide(page)).toMatchObject({ label: expect.stringContaining("Ratos — Floresta Sussurrante") });
  await row.getByRole("button", { name: "Guiando" }).click();
  await expect.poll(() => guide(page)).toBeNull();
});

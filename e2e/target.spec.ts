// Espaço mira o bicho mais próximo e, de novo, troca pro próximo da lista de Batalha (ui/items/keys.ts; a tecla é
// reservada em hotkeys.ts, não pode virar atalho de magia).
import { expect, test, type Page } from "@playwright/test";
import { enterGame, monsters, teleport, walkableNear } from "./helpers.ts";

/** Floresta ao norte da vila (fora da PZ; vários ratos/gosmas por perto). */
const FOREST = { x: 70, y: 62 };

const target = (page: Page) => page.evaluate(() => (window as any).__lq.target() as string | null);

test("Espaço mira o bicho mais próximo; de novo, cicla pro próximo sem travar num só", async ({ page }) => {
  test.setTimeout(60_000);
  await enterGame(page, "knight");
  const spot = (await walkableNear(page, FOREST.x, FOREST.y, 4))[0]!;
  await teleport(page, spot.x, spot.y);

  // Pelo menos 2 bichos por perto, pra provar o ciclo (não só a mira inicial).
  await expect.poll(async () => (await monsters(page)).length, { timeout: 15_000 }).toBeGreaterThanOrEqual(2);

  await page.keyboard.press("Space");
  await expect.poll(() => target(page), { timeout: 5000 }).not.toBeNull();
  const first = await target(page);
  await expect(page.locator(".battle-row.monster.selected")).toHaveCount(1);

  const seen = new Set([first]);
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press("Space");
    await expect.poll(() => target(page), { timeout: 5000 }).not.toBe([...seen].at(-1));
    seen.add(await target(page));
  }
  // Com só 2-3 bichos por perto, 4 apertos repetem algum já visto (ciclo), não ficam todos diferentes.
  expect(seen.size).toBeGreaterThanOrEqual(2);
});

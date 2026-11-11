// Morte de verdade (fora do Coliseu): perde XP, renasce no templo com vida cheia e vê a tela "Você morreu".
// Com a bênção da Sacerdotisa Liora a XP fica intacta e chega o aviso "Sua bênção te protegeu".
import { expect, test, type Page } from "@playwright/test";
import { enterGame, inventory, me, meState, monsters, openNpc, recordToasts, say, seenToast, setChase, setLevel, snap, targetNearest, teleport, walkableNear } from "./helpers.ts";

/** Espíritos de Chama (lv 38, 4 deles, alcance 4): matam um level 20 parado em poucos segundos. */
const DEADLY = { x: 148, y: 10 };
/** Ratos ao norte da vila: um abate rápido para a XP ficar acima do piso do level. */
const RATS = { x: 70, y: 62 };
/** Templo: spawn_player do mapa (o morto renasce aqui). */
const TEMPLE = { x: 79, y: 92 };

const xpOf = async (p: Page) => (await meState(p))!.xp as number;

/**
 * `/level N` deixa a XP exatamente no piso do level e a penalidade nunca derruba o level: sem um abate antes, a morte
 * não teria o que descontar. Mata um rato (um golpe no level 20) e volta com o alvo limpo.
 */
async function earnSomeXp(page: Page): Promise<void> {
  const floor = await xpOf(page);
  const spot = (await walkableNear(page, RATS.x, RATS.y, 4))[0]!;
  await teleport(page, spot.x, spot.y);
  await setChase(page, true);
  await expect.poll(async () => {
    if (!(await page.evaluate(() => (window as any).__lq.target())) && (await monsters(page)).some((m) => m.defId === "rat")) {
      await targetNearest(page, (d) => d === "rat", 5000).catch(() => "");
    }
    return xpOf(page);
  }, { timeout: 40_000, intervals: [500] }).toBeGreaterThan(floor);
  await setChase(page, false);
  await page.keyboard.press("Escape");
  await expect.poll(() => page.evaluate(() => (window as any).__lq.target())).toBeFalsy();
}

/** Teleporta para o meio dos espíritos (sem esperar "assentar": a morte vem antes) e espera a tela de morte. */
async function dieTo(page: Page) {
  const spot = (await walkableNear(page, DEADLY.x, DEADLY.y, 3))[0]!;
  await say(page, `/tp ${spot.x} ${spot.y}`);
  const overlay = page.getByRole("alertdialog", { name: "Você morreu" });
  await expect(overlay).toBeVisible({ timeout: 45_000 });
  return overlay;
}

test("morte: perde XP, renasce no templo com vida cheia e vê a tela de morte", async ({ page }) => {
  test.setTimeout(120_000);
  await enterGame(page, "knight");
  await setLevel(page, 20);
  await earnSomeXp(page);
  const before = (await meState(page))!;

  const overlay = await dieTo(page);
  await expect(overlay).toContainText("Derrotado por Espírito de Chama");
  await expect(overlay).toContainText(/−[\d.]+ XP/); // milhar com ponto: "−19.328 XP"
  await snap(page, "death-overlay");
  // XP menor (sem derrubar o level), vida e mana cheias, de volta ao templo.
  await expect.poll(() => xpOf(page)).toBeLessThan(before.xp);
  const after = (await meState(page))!;
  expect(after.level).toBe(before.level);
  await expect.poll(async () => { const s = (await meState(page))!; return s.hp === s.maxHp && s.mana === s.maxMana; }).toBe(true);
  await expect.poll(async () => { const p = (await me(page))!; return Math.max(Math.abs(p.x - TEMPLE.x), Math.abs(p.y - TEMPLE.y)); }).toBeLessThanOrEqual(4);
  // "Voltar" fecha a tela (o botão só libera ~1,5 s depois, junto com "qualquer tecla").
  await overlay.getByRole("button", { name: "Voltar" }).click();
  await expect(overlay).toBeHidden();
});

test("morte com bênção: XP intacta e aviso de proteção", async ({ page }) => {
  test.setTimeout(120_000);
  await enterGame(page, "knight");
  await setLevel(page, 20);
  await say(page, "/gold 5000");
  await expect.poll(async () => (await inventory(page))?.gold).toBe(5000);

  // Compra na Liora: a linha da bênção passa a "Ativa" e o ouro cai (50 × level = 1 000).
  const win = await openNpc(page, "priest", "Sacerdotisa Liora");
  const row = win.locator(".blessing-row");
  await expect(row).toContainText("Bênção");
  await row.getByRole("button", { name: "Comprar" }).click();
  await expect(row).toContainText("Ativa: sua próxima morte não custa XP.");
  await expect.poll(async () => (await inventory(page))?.gold).toBe(4000);
  await win.getByRole("button", { name: "Fechar" }).click();
  await expect(win).toBeHidden();

  await earnSomeXp(page);
  const before = (await meState(page))!;
  await recordToasts(page);
  const overlay = await dieTo(page);
  await expect(overlay).toContainText("Derrotado por Espírito de Chama");
  // Sem a linha "−N XP" (a tela pode trazer outra linha sobre a bênção; só a perda não pode aparecer).
  await expect(overlay.locator(".death-sub")).not.toContainText("XP");
  await seenToast(page, "Sua bênção te protegeu");
  await snap(page, "death-blessed");
  expect(await xpOf(page)).toBe(before.xp);
  await expect.poll(async () => (await meState(page))!.hp).toBe(before.maxHp);
  await overlay.getByRole("button", { name: "Voltar" }).click();
  await expect(overlay).toBeHidden();
});

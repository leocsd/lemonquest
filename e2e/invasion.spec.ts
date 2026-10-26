// Invasão da Vila (ciclo 18): um admin dispara o evento (/evento invasao_da_vila 10); a barra da invasão aparece na pilha
// do topo (onda 1/5, invasores vivos), os invasores nascem fora da Vila e nunca entram na PZ; derrotar um invasor soma
// contribuição na barra; a Agenda marca a invasão; /evento parar fecha com o resultado. Com o personagem no lv 10 (faixa
// ≤ 12) só nasce a faixa baixa — os ids abaixo — e outros specs podem ter deixado monstros perto: o filtro é por eles.
import { expect, test } from "@playwright/test";
import { enterGame, me, monsters, say, setLevel, snap, targetNearest, teleport } from "./helpers.ts";

/** Faixa baixa da invasão (shared/data/invasion.ts) e o líder dela. */
const INVADERS = ["slime", "bee", "wolf", "snake"];
/** Zona da Vila de Pedra Clara (PZ). */
const VILA = { x0: 58, y0: 76, x1: 103, y1: 115 };
const inVila = (x: number, y: number) => x >= VILA.x0 && x <= VILA.x1 && y >= VILA.y0 && y <= VILA.y1;

test("invasão: barra no topo, invasores fora da Vila, contribuição, agenda e resultado", async ({ page }) => {
  test.setTimeout(180_000);
  await enterGame(page, "knight");
  await setLevel(page, 10);
  // Fora da Vila ANTES de começar: só conta como defensor quem está fora da PZ (ciclo 18); dentro, a onda 1 traz só os
  // 3 invasores-base, que podem nascer nos outros portões. Lado de fora do portão norte (invasion_n em 72,67 → 72,75).
  await teleport(page, 72, 72);

  await say(page, "/evento invasao_da_vila 10");
  const bar = page.locator('[data-testid="invasion-bar"]');
  await expect(bar).toBeVisible({ timeout: 15_000 });
  await expect(bar).toContainText("Invasão da Vila");
  await expect(bar).toContainText("Onda 1/5");
  await expect.poll(async () => Number((await page.locator('[data-testid="invasion-alive"]').textContent())?.match(/\d+/)?.[0] ?? 0), { timeout: 10_000 })
    .toBeGreaterThan(0);
  await snap(page, "invasao-barra");

  // Agenda: a linha da invasão (a da quarta) diz que é invasão.
  await page.getByRole("button", { name: "Agenda de eventos" }).click();
  const win = page.getByRole("dialog", { name: "Agenda de eventos" });
  await expect(win.locator('.ag-row[data-event="invasao_da_vila"]').first()).toContainText("invasão");
  await page.keyboard.press("Escape");

  // Invasores por perto (norte, nordeste ou oeste: até ~20 tiles do portão norte).
  await expect.poll(async () => {
    const m = (await me(page))!;
    return (await monsters(page)).filter((x) => INVADERS.includes(x.defId ?? "") && Math.max(Math.abs(x.x - m.x), Math.abs(x.y - m.y)) <= 20).length;
  }, { timeout: 30_000 }).toBeGreaterThan(0);

  // Nenhum monstro dentro da Vila (a PZ): os invasores param na borda.
  for (let i = 0; i < 3; i++) {
    const inside = (await monsters(page)).filter((x) => inVila(x.x, x.y));
    expect(inside, JSON.stringify(inside)).toEqual([]);
    await page.waitForTimeout(1000);
  }

  // Derrota invasores até a barra mostrar contribuição (5 pontos por invasor inteiro).
  const mine = page.locator('[data-testid="invasion-mine"]');
  await expect.poll(async () => {
    const txt = (await mine.textContent()) ?? "";
    if (/Você: [1-9]/.test(txt)) return true;
    if (!(await page.evaluate(() => (window as any).__lq.target()))) await targetNearest(page, (d) => INVADERS.includes(d), 10_000).catch(() => "");
    return false;
  }, { timeout: 90_000, intervals: [1000] }).toBe(true);
  await snap(page, "invasao-contribuicao");

  // Fim antecipado pelo admin: a barra dá lugar ao resultado e os invasores somem.
  await say(page, "/evento parar");
  const res = page.locator('[data-testid="invasion-result"]');
  await expect(res).toBeVisible({ timeout: 10_000 });
  await expect(res).toContainText(/A Vila (resistiu|não resistiu)/);
  await expect(bar).toHaveCount(0);
  await expect.poll(async () => {
    const m = (await me(page))!;
    return (await monsters(page)).filter((x) => INVADERS.includes(x.defId ?? "") && Math.max(Math.abs(x.x - m.x), Math.abs(x.y - m.y)) <= 4).length;
  }, { timeout: 10_000 }).toBe(0);
});

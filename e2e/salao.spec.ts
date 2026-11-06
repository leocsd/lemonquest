// Salão de Minijogos (JJ-5): a porta da casinha laranja da Vila leva ao saguão; o Mestre do Salão abre a janela; uma
// sala solo de Chuva de Limões começa (contagem → onda na barra do topo, jogador dentro da sala 11×11) e "Sair" devolve
// ao saguão. Coordenadas de tools/mapgen/expansion8.mjs.
import { expect, test } from "@playwright/test";
import { clickTile, enterGame, me, openNpc, snap, teleport } from "./helpers.ts";

const VILA_DOOR = { x: 79, y: 106 };
const SALAO = { x0: 60, y0: 912, x1: 100, y1: 928 };
const SALA1 = { x0: 75, y0: 915, x1: 85, y1: 925 };
const BACK = { x: 68, y: 922 };

test("Salão de Minijogos: porta da Vila, janela do Mestre, partida solo e sair", async ({ page }) => {
  await enterGame(page);
  // Porta da casinha: um passo para cima a partir do tile de baixo.
  await teleport(page, VILA_DOOR.x, VILA_DOOR.y + 1);
  await expect.poll(async () => {
    const p = await me(page);
    if (p && p.tileY >= SALAO.y0) return true;
    await clickTile(page, VILA_DOOR.x, VILA_DOOR.y);
    return false;
  }, { timeout: 20_000, intervals: [800] }).toBe(true);
  const p0 = (await me(page))!;
  expect(p0.tileX).toBeGreaterThanOrEqual(SALAO.x0);
  expect(p0.tileX).toBeLessThanOrEqual(SALAO.x1);

  const win = await openNpc(page, "salao_mestre", "Salão de Minijogos");
  await expect(win.getByText("Chuva de Limões").first()).toBeVisible();
  await snap(page, "salao-janela");
  await win.getByRole("button", { name: "Abrir" }).first().click();
  await win.getByRole("button", { name: /Começar/ }).click();

  const bar = page.getByTestId("minigame-bar");
  await expect(bar).toContainText("começa em", { timeout: 10_000 });
  await expect.poll(async () => {
    const p = await me(page);
    return !!p && p.tileX >= SALA1.x0 && p.tileX <= SALA1.x1 && p.tileY >= SALA1.y0 && p.tileY <= SALA1.y1;
  }, { timeout: 10_000 }).toBe(true);
  await expect(bar).toContainText("onda", { timeout: 15_000 });
  await expect(bar).toContainText("♥");
  await snap(page, "salao-partida");

  await bar.getByRole("button", { name: "Sair" }).click();
  await expect(bar).toBeHidden({ timeout: 10_000 });
  await expect.poll(async () => { const p = await me(page); return p ? [p.tileX, p.tileY] : null; }, { timeout: 10_000 }).toEqual([BACK.x, BACK.y]);
});

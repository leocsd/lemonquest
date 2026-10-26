// Navegação (ciclo 17): rótulo sobre o portal ("Minas Abandonadas · lv 10+", vermelho abaixo do level), "olhar" no
// portal com o mesmo rótulo, e a faixa de level em volta do destino na janela de viagem (com o alerta de perigo).
import { expect, test, type Page } from "@playwright/test";
import { enterGame, openNpc, setLevel, snap, teleport, tileToClient, waitSettled } from "./helpers.ts";

/** Porta das Minas (tools/mapgen/expansion5.mjs) e o tile de retorno ao lado dela. */
const MINAS = { door: { x: 89, y: 74 }, ret: { x: 88, y: 74 } };
const RED = "#ff6b6b";

type Shown = { x: number; y: number; label: string; color: string };
const portalLabels = (p: Page) => p.evaluate(() => (window as any).__lq.portalLabels() as Shown[]);
const minasLabel = async (p: Page) => (await portalLabels(p)).find((l) => l.x === MINAS.door.x && l.y === MINAS.door.y) ?? null;

test("portal: rótulo da cave vermelho abaixo do level, normal no level; olhar mostra o mesmo rótulo", async ({ page }) => {
  await enterGame(page, "knight");
  await setLevel(page, 5);
  await teleport(page, MINAS.ret.x, MINAS.ret.y);
  await expect.poll(() => minasLabel(page)).toMatchObject({ label: "Minas Abandonadas · lv 10+", color: RED });
  await snap(page, "portal-label");

  // Olhar (Shift+clique) no tile do portal: mesmo rótulo e o motivo de não passar. O clique pode cair num rato que
  // passa: repete até o cartão ser o do portal.
  const card = page.locator(".look-card");
  await expect.poll(async () => {
    await waitSettled(page);
    const c = await tileToClient(page, MINAS.door.x, MINAS.door.y, 0.6);
    await page.keyboard.down("Shift");
    await page.mouse.click(c.x, c.y);
    await page.keyboard.up("Shift");
    await page.waitForTimeout(250);
    const text = (await card.textContent({ timeout: 500 }).catch(() => "")) ?? "";
    if (!text.includes("Minas Abandonadas")) await page.keyboard.press("Escape");
    return text;
  }, { timeout: 15_000, intervals: [400] }).toContain("Minas Abandonadas · lv 10+");
  await expect(card).toContainText("level 10 ou mais");
  await page.keyboard.press("Escape");

  // No level: a cor volta ao normal sem recarregar.
  await setLevel(page, 12);
  await expect.poll(async () => (await minasLabel(page))?.color).not.toBe(RED);
});

test("viagem: faixa de level em volta do destino e alerta para quem está abaixo", async ({ page }) => {
  await enterGame(page, "paladin");
  const win = await openNpc(page, "coach_village", "Cocheiro Bastião");
  await win.getByRole("tab", { name: "Viagem" }).click();
  const frontier = win.locator(".shop-row", { hasText: "Posto da Fronteira" }).getByTestId("travel-levels");
  await expect(frontier).toHaveText(/^Monstros em volta: lv \d+–\d+ · perigoso para o seu level$/);
  await expect(win.locator(".shop-row", { hasText: "Oficina dos Engenhos" }).getByTestId("travel-levels")).toHaveText("Sem monstros por perto");
  await snap(page, "travel-levels");
});

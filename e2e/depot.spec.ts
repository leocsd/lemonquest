// Depot: com a mochila dobrada (padrão em tela baixa), abrir o depot abre a mochila para arrastar; guardar um item
// arrastando e outro com clique direito (e retirar do mesmo jeito); ao fechar, a mochila volta a ficar dobrada.
import { expect, test, type Page } from "@playwright/test";
import { center, clickTile, countOf, drag, enterGame, inventory, say, teleport, waitSettled, walkableNear } from "./helpers.ts";

const section = (page: Page, id: string) => page.locator(`.hud-panel [data-panel-id="${id}"]`);
const isOpen = async (page: Page, id: string) => (await section(page, id).getAttribute("class"))?.includes(" open") ?? false;

test("depot abre a mochila dobrada, guarda um item arrastando e devolve a mochila como estava", async ({ page }) => {
  await enterGame(page, "knight");
  if (await isOpen(page, "backpack")) await section(page, "backpack").locator(".hud-section-head").click();
  await expect.poll(() => isOpen(page, "backpack")).toBe(false);

  const depot = (await page.evaluate(() => (window as any).__lq.npcTile("depot")))!;
  const spot = (await walkableNear(page, depot.x, depot.y + 1, 1))[0]!;
  await teleport(page, spot.x, spot.y);
  const win = page.locator(".npc-window");
  await expect.poll(async () => {
    if (await win.isVisible()) return true;
    await clickTile(page, depot.x, depot.y, { fy: 0.3 });
    await page.waitForTimeout(500);
    return win.isVisible();
  }, { timeout: 15_000 }).toBe(true);
  await expect(win.locator(".depot-grid")).toBeVisible();
  await expect.poll(() => isOpen(page, "backpack")).toBe(true);

  // Arrasta a carne do kit inicial para o primeiro slot do depot.
  const inv = (await inventory(page))!;
  const i = inv.backpack.findIndex((s) => s?.defId === "meat");
  expect(i).toBeGreaterThanOrEqual(0);
  const from = section(page, "backpack").locator(`[data-loc="bp:${i}"]`);
  await expect(from).toBeInViewport();
  await waitSettled(page);
  await drag(page, await center(page, from), await center(page, win.locator('[data-loc="dp:0"]')));
  await expect(win.locator('[data-loc="dp:0"]')).toHaveClass(/filled/, { timeout: 10_000 });
  await expect.poll(async () => (await inventory(page))!.backpack.some((s) => s?.defId === "meat")).toBe(false);

  // Clique direito com o depot aberto guarda a pilha inteira (antes bebia a poção); no depot, devolve para a mochila.
  const potions = () => countOf(page, "health_potion");
  const hp0 = await potions();
  expect(hp0).toBeGreaterThan(0);
  const p = (await inventory(page))!.backpack.findIndex((s) => s?.defId === "health_potion");
  const potionSlot = section(page, "backpack").locator(`[data-loc="bp:${p}"]`);
  await expect(potionSlot).toBeInViewport();
  await potionSlot.click({ button: "right" });
  await expect.poll(potions, { timeout: 10_000 }).toBe(0);
  await expect(win.locator('[data-loc="dp:1"]')).toHaveClass(/filled/, { timeout: 10_000 });
  await win.locator('[data-loc="dp:1"]').click({ button: "right" });
  await expect.poll(potions, { timeout: 10_000 }).toBe(hp0);
  await expect(win.locator('[data-loc="dp:1"]')).not.toHaveClass(/filled/, { timeout: 10_000 });

  await page.keyboard.press("Escape");
  await expect(win).toBeHidden();
  await expect.poll(() => isOpen(page, "backpack")).toBe(false);
});

// Ciclo 17: "Organizar" junta as pilhas iguais e põe tudo no começo do depot; a busca mostra só o que bate com o texto.
test("depot: Organizar junta as pilhas e a busca filtra pelo nome", async ({ page }) => {
  await enterGame(page, "knight");
  const depot = (await page.evaluate(() => (window as any).__lq.npcTile("depot")))!;
  const spot = (await walkableNear(page, depot.x, depot.y + 1, 1))[0]!;
  await teleport(page, spot.x, spot.y);
  const win = page.locator(".npc-window");
  await expect.poll(async () => {
    if (await win.isVisible()) return true;
    await clickTile(page, depot.x, depot.y, { fy: 0.3 });
    await page.waitForTimeout(500);
    return win.isVisible();
  }, { timeout: 15_000 }).toBe(true);
  const bp = section(page, "backpack");
  const slot = (i: number) => win.locator(`[data-loc="dp:${i}"]`);
  const store = async (defId: string, to: number) => {
    const i = (await inventory(page))!.backpack.findIndex((s) => s?.defId === defId);
    expect(i).toBeGreaterThanOrEqual(0);
    await expect(bp.locator(`[data-loc="bp:${i}"]`)).toBeInViewport();
    await waitSettled(page);
    await drag(page, await center(page, bp.locator(`[data-loc="bp:${i}"]`)), await center(page, slot(to)));
    await expect(slot(to)).toHaveClass(/filled/, { timeout: 10_000 });
  };

  // Duas pilhas de carne em espaços separados (o kit traz 5; /item dá mais 3) e as poções do kit num terceiro.
  await store("meat", 7);
  await say(page, "/item meat 3");
  await expect.poll(() => countOf(page, "meat"), { timeout: 10_000 }).toBe(3);
  await store("meat", 3);
  await store("health_potion", 12);

  await win.getByTestId("depot-sort").click();
  // Poções antes de comida (categoria); a carne virou uma pilha só; o resto ficou vazio.
  await expect(slot(0)).toHaveClass(/filled/, { timeout: 10_000 });
  await expect(slot(1)).toHaveClass(/filled/);
  for (const i of [2, 3, 7, 12]) await expect(slot(i)).not.toHaveClass(/filled/);

  // Busca: "carne" deixa só um espaço à vista; nada encontrado avisa; vazio volta às 60 casas.
  const search = win.getByTestId("depot-search");
  await search.fill("carne");
  await expect(win.locator(".depot-slot")).toHaveCount(1);
  await expect(win.locator(".depot-slot.filled")).toHaveCount(1);
  await search.fill("xyz");
  await expect(win.locator(".depot-slot")).toHaveCount(0);
  await expect(win.locator(".depot-empty")).toContainText('Nada com "xyz"');
  await search.fill("");
  await expect(win.locator(".depot-slot")).toHaveCount(60);
});

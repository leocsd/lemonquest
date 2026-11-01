// Painéis Batalha/Mochila: alça de redimensionar (arrastar em linhas inteiras, duplo clique = padrão, persiste),
// rolagem interna e rolagem automática ao arrastar um item perto da borda.
import { expect, test, type Page } from "@playwright/test";
import { center, enterGame, inventory, say } from "./helpers.ts";

const body = (page: Page, id: "battle" | "backpack") => page.locator(`.sized-${id}`);
const grip = (page: Page, id: "battle" | "backpack") => page.locator(`[data-panel-id="${id}"] .size-grip`);
const height = async (page: Page, id: "battle" | "backpack") => Math.round((await body(page, id).boundingBox())!.height);

async function dragGrip(page: Page, id: "battle" | "backpack", dy: number) {
  await grip(page, id).scrollIntoViewIfNeeded();
  const c = await center(page, grip(page, id));
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x, c.y + dy, { steps: 8 });
  await page.mouse.up();
}

// Alturas pela mesma fórmula do cliente (ui/hud/panelSize.ts, rowsToPx): batalha linha de 34 px; mochila (grade de 5,
// desde 2026-10-27) linha de 41 px mais 1 de respiro. Arrastar 45 px = uma linha, com o snap em linhas inteiras.
const BATTLE = (rows: number) => rows * 34;
const BACKPACK = (rows: number) => rows * 41 + 1;

test("redimensionar Batalha e Mochila: arrastar, duplo clique volta ao padrão, tamanho lembrado", async ({ page }) => {
  await enterGame(page);
  // Padrões: batalha 5 linhas, mochila 3.
  await expect.poll(() => height(page, "battle")).toBe(BATTLE(5));
  await expect.poll(() => height(page, "backpack")).toBe(BACKPACK(3));

  await dragGrip(page, "battle", -70); // −2 linhas
  await expect.poll(() => height(page, "battle")).toBe(BATTLE(3));
  await dragGrip(page, "backpack", 45); // +1 linha
  await expect.poll(() => height(page, "backpack")).toBe(BACKPACK(4));
  // Limites: mochila no máximo 5 linhas.
  await dragGrip(page, "backpack", 400);
  await expect.poll(() => height(page, "backpack")).toBe(BACKPACK(5));

  // Persistência: recarregar mantém o tamanho.
  await page.reload();
  await page.getByRole("button", { name: /Jogar com/ }).click();
  await page.waitForFunction(() => !!(window as any).__lq?.me(), null, { timeout: 30_000 });
  await expect.poll(() => height(page, "battle")).toBe(BATTLE(3));
  await expect.poll(() => height(page, "backpack")).toBe(BACKPACK(5));

  // Duplo clique: tamanho padrão.
  await grip(page, "battle").scrollIntoViewIfNeeded();
  await grip(page, "battle").dblclick();
  await expect.poll(() => height(page, "battle")).toBe(BATTLE(5));
  await grip(page, "backpack").scrollIntoViewIfNeeded();
  await grip(page, "backpack").dblclick();
  await expect.poll(() => height(page, "backpack")).toBe(BACKPACK(3));
});

test("mochila rola por dentro e rola sozinha ao arrastar um item perto da borda", async ({ page }) => {
  await enterGame(page);
  // Mochila com 2 linhas: os 60 slots do cavaleiro (12 linhas) rolam.
  await dragGrip(page, "backpack", -45);
  await expect.poll(() => height(page, "backpack")).toBe(BACKPACK(2));
  const sc = body(page, "backpack");
  const metrics = () => sc.evaluate((el) => ({ top: el.scrollTop, max: el.scrollHeight - el.clientHeight }));
  expect((await metrics()).max).toBeGreaterThan(100);

  // Roda do mouse rola a lista (e não o mapa/zoom).
  await sc.scrollIntoViewIfNeeded();
  await sc.hover();
  await page.mouse.wheel(0, 120);
  await expect.poll(async () => (await metrics()).top).toBeGreaterThan(0);
  await sc.evaluate((el) => { el.scrollTop = 0; });

  // Item no 1º slot; arrastar e segurar perto da borda de baixo: a lista rola até o fim.
  await say(page, "/item health_potion 5");
  await expect.poll(async () => (await inventory(page))?.backpack[0]?.defId).toBe("health_potion");
  await sc.scrollIntoViewIfNeeded();
  const from = await center(page, page.locator('[data-loc="bp:0"]'));
  const box = (await sc.boundingBox())!;
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 8, from.y + 8, { steps: 3 });
  await page.mouse.move(box.x + box.width / 2, box.y + box.height - 4, { steps: 6 });
  await expect.poll(async () => { const m = await metrics(); return m.top >= m.max - 1; }, { timeout: 8000 }).toBe(true);
  // Solta no último slot (agora visível): a mochila se organiza sozinha, então nada muda de lugar.
  const n = (await inventory(page))!.backpack.length;
  const last = page.locator(`[data-loc="bp:${n - 1}"]`);
  const lc = await center(page, last);
  await page.mouse.move(lc.x, lc.y, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  expect((await inventory(page))!.backpack[0]?.defId).toBe("health_potion");
  expect((await inventory(page))!.backpack[n - 1]).toBeNull();
});

// Itens no chão: arrastar da mochila para o mundo (fica no chão, visível para outro jogador) e pegar com
// botão direito, Ctrl+clique, duplo clique e arrastando até a mochila.
import { expect, test, type Page } from "@playwright/test";
import { center, clickTile, drag, enterGame, ground, inventory, say, snap, teleport, tileToClient, waitSettled, walkableNear } from "./helpers.ts";

const bpSlot = (page: Page, i: number) => page.locator(`[data-loc="bp:${i}"]`);
const countOf = async (page: Page, defId: string) =>
  ((await inventory(page))?.backpack ?? []).reduce((n, s) => n + (s?.defId === defId ? s.count : 0), 0);

/** Índice do slot da mochila com o item. */
async function slotOf(page: Page, defId: string): Promise<number> {
  return ((await inventory(page))?.backpack ?? []).findIndex((s) => s?.defId === defId);
}

/** Repete o clique até o item chegar na mochila: um monstro que passe pelo tile (o canto é fora da vila) faz o clique
 *  virar ataque. */
async function pickUntil(page: Page, defId: string, click: () => Promise<void>): Promise<void> {
  await expect.poll(async () => {
    if ((await countOf(page, defId)) >= 1) return 1;
    await click();
    await page.waitForTimeout(700);
    return countOf(page, defId);
  }, { timeout: 15_000, intervals: [200] }).toBe(1);
}

/** Arrasta o item da mochila até o tile (x,y) do mundo e espera ele aparecer no chão. */
async function dropToTile(page: Page, defId: string, x: number, y: number): Promise<void> {
  const i = await slotOf(page, defId);
  expect(i).toBeGreaterThanOrEqual(0);
  await bpSlot(page, i).scrollIntoViewIfNeeded();
  await waitSettled(page);
  const from = await center(page, bpSlot(page, i));
  const to = await tileToClient(page, x, y);
  await drag(page, from, to);
  await expect.poll(async () => (await ground(page)).some((g) => g.defId === defId && g.x === x && g.y === y), { timeout: 10_000 }).toBe(true);
}

test("itens no chão: largar arrastando e outro jogador pega (direito, Ctrl, duplo clique, arrastar)", async ({ browser }) => {
  // Dois navegadores e muitos passos: no CI (sem GPU) passa de 2 min.
  test.setTimeout(240_000);
  const ca = await browser.newContext(), cb = await browser.newContext();
  const a = await ca.newPage(), b = await cb.newPage();
  try {
    await enterGame(a, "knight");
    await enterGame(b, "paladin");
    // Um canto fora da vila, longe do spawn — e longe de quem ainda está no mundo (jogadores de um teste anterior ficam
    // 20 s pela janela de reconexão; clicar no tile deles abre o menu do grupo em vez de pegar) e de itens que sobraram.
    const busy = [
      ...(await a.evaluate(() => (window as any).__lq.players() as { x: number; y: number }[])),
      ...(await ground(a)),
    ];
    // Monstro por perto também atrapalha: o clique vira ataque e o loot dele cai no tile (visto: lodo na mochila).
    const mobs = await a.evaluate(() => (window as any).__lq.monsters() as { x: number; y: number }[]);
    const near = (o: { x: number; y: number }, x: number, y: number, d: number) => Math.max(Math.abs(o.x - x), Math.abs(o.y - y)) <= d;
    const clear = (x: number, y: number) => !busy.some((o) => near(o, x, y, 1)) && !mobs.some((o) => near(o, x, y, 6));
    const spots = (await walkableNear(a, 60, 80, 8)).filter((t, _i, all) =>
      all.some((o) => o.x === t.x + 1 && o.y === t.y) && all.some((o) => o.x === t.x + 2 && o.y === t.y)
      && clear(t.x, t.y) && clear(t.x + 1, t.y) && clear(t.x + 2, t.y));
    const base = spots[0]!;
    const drop = { x: base.x + 1, y: base.y };
    await teleport(a, base.x, base.y);
    await teleport(b, base.x + 2, base.y);
    // Nada do kit inicial (3 poções de vida + carnes): cada item começa com 0 e o teste conta 1.
    const items = ["mana_potion", "health_potion_medium", "mana_potion_medium", "health_potion_large"];
    for (const id of items) await say(a, `/item ${id} 1`);
    await expect.poll(async () => (await Promise.all(items.map((id) => countOf(a, id)))).every((n) => n === 1), { timeout: 10_000 }).toBe(true);

    // 1) botão direito
    await dropToTile(a, items[0]!, drop.x, drop.y);
    await expect.poll(() => countOf(a, items[0]!), { timeout: 10_000 }).toBe(0); // a mochila atualiza com a resposta do servidor
    await expect.poll(async () => (await ground(b)).some((g) => g.defId === items[0]), { timeout: 10_000 }).toBe(true);
    await snap(b, "ground-item-seen-by-b");
    await waitSettled(b);
    await pickUntil(b, items[0]!, () => clickTile(b, drop.x, drop.y, { button: "right" }));
    await expect.poll(async () => (await ground(a)).filter((g) => g.x === drop.x && g.y === drop.y).length, { timeout: 10_000 }).toBe(0);

    // 2) Ctrl + clique
    await dropToTile(a, items[1]!, drop.x, drop.y);
    await expect.poll(async () => (await ground(b)).some((g) => g.defId === items[1]), { timeout: 10_000 }).toBe(true);
    await pickUntil(b, items[1]!, () => clickTile(b, drop.x, drop.y, { modifiers: ["Control"] }));

    // 3) duplo clique
    await dropToTile(a, items[2]!, drop.x, drop.y);
    await expect.poll(async () => (await ground(b)).some((g) => g.defId === items[2]), { timeout: 10_000 }).toBe(true);
    await pickUntil(b, items[2]!, async () => {
      const c = await tileToClient(b, drop.x, drop.y);
      await b.mouse.dblclick(c.x, c.y);
    });
    // O duplo clique não fez o personagem andar até o tile do item.
    await expect.poll(async () => (await b.evaluate(() => (window as any).__lq.me().x))).toBe(base.x + 2);

    // 4) arrastar do chão até um slot vazio da mochila
    await dropToTile(a, items[3]!, drop.x, drop.y);
    await expect.poll(async () => (await ground(b)).some((g) => g.defId === items[3]), { timeout: 10_000 }).toBe(true);
    const empty = ((await inventory(b))!.backpack).findIndex((s) => !s);
    await bpSlot(b, empty).scrollIntoViewIfNeeded();
    await waitSettled(b);
    await drag(b, await tileToClient(b, drop.x, drop.y), await center(b, bpSlot(b, empty)));
    await expect.poll(async () => (await inventory(b))!.backpack[empty]?.defId, { timeout: 10_000 }).toBe(items[3]);
    await expect.poll(async () => (await ground(a)).filter((g) => g.x === drop.x && g.y === drop.y).length, { timeout: 10_000 }).toBe(0); // o patch do chão chega a A depois
  } finally {
    await ca.close();
    await cb.close();
  }
});

test("itens no chão: arrastar um item do chão para outro tile", async ({ page }) => {
  test.setTimeout(120_000);
  await enterGame(page, "knight");
  // Canto fora da vila com três tiles livres em linha (largar no do meio, mover para o da direita).
  const mobs = await page.evaluate(() => (window as any).__lq.monsters() as { x: number; y: number }[]);
  const items = await ground(page);
  const clear = (x: number, y: number) => !mobs.some((o) => Math.max(Math.abs(o.x - x), Math.abs(o.y - y)) <= 6)
    && !items.some((o) => Math.max(Math.abs(o.x - x), Math.abs(o.y - y)) <= 1);
  const spots = (await walkableNear(page, 60, 80, 8)).filter((t, _i, all) =>
    all.some((o) => o.x === t.x + 1 && o.y === t.y) && all.some((o) => o.x === t.x + 2 && o.y === t.y) && clear(t.x, t.y) && clear(t.x + 2, t.y));
  const base = spots[0]!;
  // Só as poções deste canto: o chão dura 10 min e outros testes (ou repetições) deixam poções em outros lugares.
  const potions = async () => (await ground(page))
    .filter((g) => g.defId === "mana_potion" && Math.abs(g.y - base.y) <= 1 && g.x >= base.x - 1 && g.x <= base.x + 3)
    .map((g) => `${g.x},${g.y}`);
  await teleport(page, base.x, base.y);
  await say(page, "/item mana_potion 1");
  await expect.poll(() => countOf(page, "mana_potion"), { timeout: 10_000 }).toBe(1);
  await dropToTile(page, "mana_potion", base.x + 1, base.y);
  await waitSettled(page);
  // Arrasta do tile do meio para o da direita.
  const from = await tileToClient(page, base.x + 1, base.y, 0.6);
  const to = await tileToClient(page, base.x + 2, base.y, 0.6);
  await drag(page, from, to);
  await expect.poll(potions, { timeout: 10_000 })
    .toEqual([`${base.x + 2},${base.y}`]);
  expect(await countOf(page, "mana_potion")).toBe(0);

  // Longe do item (fora do alcance de 3): arrastar faz o personagem andar até ele e mover ao chegar.
  const far = (await walkableNear(page, base.x - 4, base.y, 3)).find((t) => Math.max(Math.abs(t.x - (base.x + 2)), Math.abs(t.y - base.y)) >= 5)!;
  await teleport(page, far.x, far.y);
  await waitSettled(page);
  await drag(page, await tileToClient(page, base.x + 2, base.y, 0.6), await tileToClient(page, base.x + 1, base.y, 0.6));
  await expect.poll(potions, { timeout: 15_000 })
    .toEqual([`${base.x + 1},${base.y}`]);
});

// Estagiário, caçar com amigo (v3): dois jogadores no mesmo grupo; B manda o Estagiário seguir A pela aba Rota, ganha o
// crachá, anda atrás quando A se afasta e para quando pede. Só colega do grupo aparece na lista.
import { expect, test, type Page } from "@playwright/test";
import { clickTile, enterGame, me, meState, teleport, waitSettled, walkableNear } from "./helpers.ts";

/** Floresta ao norte da vila. */
const FOREST = { x: 70, y: 62 };

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

test("Estagiário em grupo: seguir um colega, andar atrás dele e parar", async ({ browser }) => {
  test.setTimeout(240_000);
  const ca = await browser.newContext(), cb = await browser.newContext();
  const a = await ca.newPage(), b = await cb.newPage();
  try {
    const pa = await enterGame(a, "knight");
    await enterGame(b, "druid");
    // Lado a lado na floresta.
    const tiles = await walkableNear(a, FOREST.x, FOREST.y, 4);
    const ta = tiles[0]!;
    const tb = tiles.find((t) => dist(t, ta) === 2)!;
    await teleport(a, ta.x, ta.y);
    await teleport(b, tb.x, tb.y);
    const bId = await b.evaluate(() => (window as any).__lq.myId() as string);
    await expect.poll(() => a.evaluate((id) => (window as any).__lq.players().some((p: any) => p.id === id), bId)).toBe(true);
    await waitSettled(a);

    // Sem grupo: a aba Rota explica que precisa de um.
    await b.getByTestId("rail-estagiario").click();
    const win = b.getByRole("dialog", { name: "Estagiário" });
    await expect(win).toBeVisible();
    await win.getByTestId("est-tab-rota").click();
    await expect(win.getByTestId("est-sem-grupo")).toBeVisible();

    // Grupo: A convida B pelo clique direito; B aceita.
    const posB = (await me(b))!;
    await clickTile(a, posB.x, posB.y, { button: "right", fy: 0.6 });
    await a.locator(".ctx-menu").getByRole("menuitem", { name: "Convidar para o grupo" }).click();
    const invite = b.locator(".party-invite");
    await expect(invite).toContainText(pa.name);
    await invite.getByRole("button", { name: "Aceitar" }).click();
    await expect.poll(async () => (await meState(b))!.partyId).not.toBe("");

    // Agora A aparece na lista de colegas; "Seguir" liga o crachá do Estagiário em B.
    const seguir = win.getByTestId(`est-seguir-${pa.name}`);
    await expect(seguir).toBeVisible({ timeout: 10_000 });
    await seguir.click();
    await expect.poll(async () => (await meState(b))?.bot, { timeout: 15_000 }).toBe(true);
    await expect(win.getByTestId("est-parar-seguir")).toBeVisible();
    await expect(win.locator(".est-head")).toContainText(pa.name);

    // A se afasta 5 tiles: B anda atrás até ficar ao lado.
    const longe = tiles.find((t) => dist(t, ta) >= 5 && dist(t, ta) <= 7) ?? tiles.at(-1)!;
    await teleport(a, longe.x, longe.y);
    await expect.poll(async () => dist((await me(b))!, (await me(a))!), { timeout: 20_000, intervals: [500], message: "B chega ao lado de A" }).toBeLessThanOrEqual(2);

    // Parar de seguir: sem crachá.
    await win.getByTestId("est-parar-seguir").click();
    await expect.poll(async () => (await meState(b))?.bot, { timeout: 15_000 }).toBe(false);
  } finally {
    await ca.close();
    await cb.close();
  }
});

// Caves profundas (ciclo 13): a entrada é um portal com level mínimo num recanto da região de origem
// (tools/mapgen/expansion5.mjs). Abaixo do level a porta não abre; no level, leva à sala de entrada da cave, e a porta
// norte da sala devolve ao lado da entrada.
import { expect, test, type Page } from "@playwright/test";
import { enterGame, me, setLevel, snap, teleport, walkableNear } from "./helpers.ts";

/** [entrada (portal), retorno (tile ao lado), chegada na cave, saída (porta norte)] — expansion5.mjs. */
const MINAS = { door: { x: 89, y: 74 }, ret: { x: 88, y: 74 }, arrival: { x: 17, y: 504 }, exit: { x: 17, y: 501 } };
const PROFUNDO = { door: { x: 256, y: 136 }, ret: { x: 255, y: 136 }, arrival: { x: 313, y: 504 } };

const at = async (p: Page) => { const m = (await me(p))!; return `${m.x},${m.y}`; };
/**
 * Aperta `key` até chegar em `to`, mas só enquanto ainda está do lado de partida (`before`): se o teleporte chega
 * depois da leitura, apertar de novo andava além do tile de chegada e o poll nunca batia.
 */
const stepUntil = (p: Page, key: string, before: (y: number) => boolean, to: { x: number; y: number }) =>
  expect.poll(async () => { if (before((await me(p))!.y)) await p.keyboard.press(key); return at(p); }, { timeout: 15_000 })
    .toBe(`${to.x},${to.y}`);

test("Minas Abandonadas: a porta barra abaixo do lv 10; no lv 12 entra e a porta norte devolve à floresta", async ({ page }) => {
  await enterGame(page, "druid");
  await setLevel(page, 8);
  await teleport(page, MINAS.ret.x, MINAS.ret.y);
  await page.locator("#game canvas").hover({ position: { x: 300, y: 300 } });
  await page.keyboard.press("d"); // pisa na porta (leste)
  await page.waitForTimeout(800);
  expect(await at(page)).not.toBe(`${MINAS.arrival.x},${MINAS.arrival.y}`);
  expect((await me(page))!.y).toBeLessThan(400);

  await setLevel(page, 12);
  await teleport(page, MINAS.ret.x, MINAS.ret.y);
  await page.locator("#game canvas").hover({ position: { x: 300, y: 300 } });
  await stepUntil(page, "d", (y) => y < 400, MINAS.arrival);
  await expect(page.locator(".zone-banner")).toContainText("Minas Abandonadas");
  await snap(page, "caves-minas");
  // Volta: do tile logo abaixo da porta da parede norte, um passo para o norte.
  await teleport(page, MINAS.exit.x, MINAS.exit.y + 1);
  await page.waitForTimeout(1100); // portal tem 1 s de espera entre usos (PORTAL_COOLDOWN_MS): acabamos de chegar por um
  await stepUntil(page, "w", (y) => y >= 400, MINAS.ret);
});

test("Abismo Profundo: no lv 100 entra pelo salão do Abismo e encontra os monstros novos", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await enterGame(page, "knight");
  await setLevel(page, 100);
  await teleport(page, PROFUNDO.ret.x, PROFUNDO.ret.y);
  await page.locator("#game canvas").hover({ position: { x: 300, y: 300 } });
  await stepUntil(page, "d", (y) => y < 400, PROFUNDO.arrival);
  await expect(page.locator(".zone-banner")).toContainText("Abismo Profundo");
  // Na primeira sala de caça (ao sul da entrada) vive o Tengu Rubro.
  await teleport(page, 316, 520);
  await expect.poll(async () => {
    const ms = (await page.evaluate(() => (window as any).__lq.monsters())) as { defId?: string }[];
    return ms.some((m) => m.defId === "abyss_tengu");
  }, { timeout: 15_000 }).toBe(true);
  await snap(page, "caves-profundo");
  // Samurai Rubro (ciclo 14): a tira tem 6 quadros de 96×48; com 12 de 48 desenhava meio samurai.
  const [near] = await walkableNear(page, 346, 540, 4);
  await teleport(page, near!.x, near!.y);
  await expect.poll(async () => {
    const ms = (await page.evaluate(() => (window as any).__lq.monsters())) as { defId?: string }[];
    return ms.some((m) => m.defId === "abyss_samurai");
  }, { timeout: 15_000 }).toBe(true);
  await snap(page, "caves-samurai");
  expect(errors).toEqual([]);
});

test("Porta lv 80 do Vulcão: pisar de novo dentro da espera do portal não atravessa abaixo do level (ciclo 14)", async ({ page }) => {
  // Antes do ciclo 14 a espera de 1 s do portal (PORTAL_COOLDOWN_MS) saía antes de conferir o level: o 2º passo
  // ficava na porta sem ser devolvido e o 3º atravessava para o outro lado.
  await enterGame(page, "knight");
  await setLevel(page, 50);
  await teleport(page, 372, 95);
  await page.locator("#game canvas").hover({ position: { x: 300, y: 300 } });
  let maxY = 0;
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press("s");
    await page.waitForTimeout(250);
    maxY = Math.max(maxY, (await me(page))!.y);
  }
  await page.waitForTimeout(1500);
  expect(maxY).toBeLessThan(97);
  expect((await me(page))!.y).toBe(95);
  // A saída sem level ao lado (374,96 → 374,95): parado em cima dela dentro da espera, o passo seguinte entrava.
  await teleport(page, 374, 95);
  await page.locator("#game canvas").hover({ position: { x: 300, y: 300 } });
  maxY = 0;
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press("s");
    await page.waitForTimeout(250);
    maxY = Math.max(maxY, (await me(page))!.y);
  }
  await page.waitForTimeout(1500);
  expect(maxY).toBeLessThan(97);
  expect((await me(page))!.y).toBe(95);
});

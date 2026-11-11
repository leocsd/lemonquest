// "Olhar" (como no Tibia): os dois botões do mouse juntos ou Shift+clique mostram o que está sob o mouse (criatura,
// jogador, item do chão). E o rótulo de classe sobre os baús de quest.
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { findQuestObjects } from "../packages/shared/src/data/questWorld.ts";
import type { TiledMap } from "../packages/shared/src/map.ts";
import { center, drag, enterGame, ground, me, monsters, say, snap, teleport, tileToClient, waitSettled, walkableNear } from "./helpers.ts";

const FOREST = { x: 70, y: 62 };

/** Pressiona os dois botões no ponto (esquerdo, depois direito) e solta. */
async function chordAt(page: Page, x: number, y: number): Promise<void> {
  await page.mouse.move(x, y);
  await page.mouse.down({ button: "left" });
  await page.mouse.down({ button: "right" });
  await page.mouse.up({ button: "right" });
  await page.mouse.up({ button: "left" });
}

test("olhar: dois botões numa criatura (sem mirar nela) e Shift+clique em você", async ({ page }) => {
  await enterGame(page, "knight");
  const spot = (await walkableNear(page, FOREST.x, FOREST.y, 4))[0]!;
  await teleport(page, spot.x, spot.y);
  await waitSettled(page);
  const card = page.locator(".look-card");
  // Criatura: tenta a mais perto até o cartão abrir (ela anda: o clique vai no tile do servidor e, no meio de um passo,
  // ela ainda está desenhada no anterior). Logo depois do /tp os ratos vêm na direção do personagem, então o 1º clique
  // erra com frequência; a leitura do cartão não pode bloquear (sem timeout, `textContent` esperava o cartão até o fim
  // do poll e um erro só derrubava o teste).
  await expect.poll(async () => {
    const m = (await me(page))!;
    const mob = (await monsters(page)).sort((a, b) => Math.max(Math.abs(a.x - m.x), Math.abs(a.y - m.y)) - Math.max(Math.abs(b.x - m.x), Math.abs(b.y - m.y)))[0];
    if (!mob) return "";
    const c = await tileToClient(page, mob.x, mob.y, 0.6);
    await chordAt(page, c.x, c.y);
    await page.waitForTimeout(250);
    return (await card.textContent({ timeout: 500 }).catch(() => "")) ?? "";
  }, { timeout: 20_000, intervals: [400] }).toMatch(/Level \d+ · .*Vida/);
  await snap(page, "look-creature");
  expect(await page.evaluate(() => (window as any).__lq.target())).toBeFalsy(); // o primeiro botão não deixou o alvo
  // Esc fecha (um clique no chão também fecharia, mas viraria "andar" e tiraria o personagem do lugar antes do
  // Shift+clique nele); Shift+clique em você mostra "(você)". Usa o tile do ATOR, não o do estado.
  await page.keyboard.press("Escape");
  await expect(card).toHaveCount(0);
  await waitSettled(page);
  // Um rato pode passar pelo tile no instante do clique (o cartão abre "Rato"): repete até ser você.
  await expect.poll(async () => {
    const m = (await me(page))!;
    const mc = await tileToClient(page, m.tileX, m.tileY, 0.6);
    await page.keyboard.down("Shift");
    await page.mouse.click(mc.x, mc.y);
    await page.keyboard.up("Shift");
    await page.waitForTimeout(250);
    const text = (await card.textContent({ timeout: 500 }).catch(() => "")) ?? "";
    if (!text.includes("(você)")) await page.keyboard.press("Escape");
    return text;
  }, { timeout: 15_000, intervals: [400] }).toContain("(você)");
  await expect(card).toContainText("Level 1 · Cavaleiro");
});

test("olhar: item do chão abre o balão de detalhes do item", async ({ page }) => {
  await enterGame(page, "knight");
  // Tile de destino sem nada no chão: o chão não tem dono e dura 10 min, então rodadas anteriores (ou outros testes)
  // deixam poções pelo caminho e "existe poção em algum lugar" não prova que o arrasto desta rodada terminou.
  const tiles = await walkableNear(page, 60, 80, 6);
  const busy = new Set((await ground(page)).map((g) => `${g.x},${g.y}`));
  const base = tiles.find((t) => tiles.some((o) => o.x === t.x + 1 && o.y === t.y) && !busy.has(`${t.x + 1},${t.y}`))!;
  const target = { x: base.x + 1, y: base.y };
  await teleport(page, base.x, base.y);
  await say(page, "/item mana_potion 1");
  await expect.poll(async () => ((await page.evaluate(() => (window as any).__lq.inventory()))?.backpack ?? []).some((s: any) => s?.defId === "mana_potion")).toBe(true);
  const i = ((await page.evaluate(() => (window as any).__lq.inventory()))?.backpack ?? []).findIndex((s: any) => s?.defId === "mana_potion");
  const slot = page.locator(`[data-loc="bp:${i}"]`);
  await slot.scrollIntoViewIfNeeded();
  await waitSettled(page);
  await drag(page, await center(page, slot), await tileToClient(page, target.x, target.y));
  await expect.poll(async () => (await ground(page)).some((g) => g.defId === "mana_potion" && g.x === target.x && g.y === target.y)).toBe(true);
  // O chord logo depois de soltar o arrasto às vezes não abre o balão: tenta até abrir.
  const tip = page.locator(".item-tooltip.show");
  await expect.poll(async () => {
    const c = await tileToClient(page, target.x, target.y, 0.6);
    await chordAt(page, c.x, c.y);
    await page.waitForTimeout(300);
    return (await tip.textContent({ timeout: 500 }).catch(() => "")) ?? "";
  }, { timeout: 15_000, intervals: [500] }).toContain("Poção de Mana");
  await snap(page, "look-item");
});

test("baús de quest mostram a classe em cima", async ({ page }) => {
  const map = JSON.parse(readFileSync("assets/maps/world.json", "utf8")) as TiledMap;
  const chest = findQuestObjects(map).find((s) => s.kind === "chest" && s.id === "hero_sword")!;
  await enterGame(page, "knight");
  await say(page, "/level 70");
  const near = (await walkableNear(page, chest.x, chest.y + 2, 2))[0]!;
  await teleport(page, near.x, near.y);
  await waitSettled(page);
  await snap(page, "chest-labels");
  // O rótulo é texto do Phaser (canvas): confere pelo objeto da cena.
  const labels = await page.evaluate(() => {
    const scene = (window as any).__lq?.scene?.();
    return scene ? scene.children.list.filter((o: any) => o.type === "Text").map((o: any) => o.text) : null;
  });
  if (labels) expect(labels).toEqual(expect.arrayContaining(["Cavaleiro", "Paladino"]));
});

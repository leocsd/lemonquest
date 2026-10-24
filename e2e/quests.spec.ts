// Missões: aceitar "Ratos no Celeiro" com o Capitão, matar os ratos (level 30 + seguir), entregar e ver a recompensa.
// Quadro de Recompensas: as 3 recompensas do dia aparecem e dá para aceitar uma.
import { expect, test, type Page } from "@playwright/test";
import { clickTile, enterGame, inventory, me, monsters, say, setChase, setLevel, snap, targetNearest, teleport, walkableNear } from "./helpers.ts";

const RAT_SPAWNS = [{ x: 70, y: 62 }, { x: 26, y: 72 }];

/** Clica no NPC (de perto) até a janela abrir. */
async function talkTo(page: Page, npcId: string, name: string) {
  const t = (await page.evaluate((id) => (window as any).__lq.npcTile(id), npcId)) as { x: number; y: number };
  const spot = (await walkableNear(page, t.x, t.y + 2, 1))[0]!;
  await teleport(page, spot.x, spot.y);
  const win = page.getByRole("dialog", { name });
  await expect.poll(async () => {
    if (await win.isVisible()) return true;
    await clickTile(page, t.x, t.y, { fy: 0.6 });
    await page.waitForTimeout(800);
    return win.isVisible();
  }, { timeout: 20_000, intervals: [300] }).toBe(true);
  return win;
}

const marker = (page: Page, id: string) => page.evaluate((i) => (window as any).__lq.npcMarker(i), id);

test("missão de matar: aceitar no NPC, matar, entregar e receber a recompensa", async ({ page }) => {
  test.setTimeout(300_000);
  await enterGame(page, "knight");
  await setLevel(page, 30);
  // O Capitão também oferece a Pesquisa de Clima (lv 3, ciclo 10); concluída antes, ele fica só com os ratos e o
  // marcador pode passar de "!" (disponível) para "?" (em andamento) depois de aceitar.
  await say(page, "/quest complete pesquisa_de_clima");
  await expect.poll(() => marker(page, "guard_captain")).toBe("available");

  let win = await talkTo(page, "guard_captain", "Capitão Rodrigo");
  await win.getByRole("tab", { name: "Missões" }).click();
  const card = win.locator('.quest-card[data-quest="rats_barn"]');
  await expect(card).toContainText("Ratos no Celeiro");
  await card.getByRole("button", { name: "Aceitar" }).click();
  await expect(card).toContainText("Em andamento");
  const tracker = page.locator(".quest-tracker");
  await expect(tracker).toContainText("Ratos no Celeiro");
  await expect(tracker).toContainText("0/5");
  await expect.poll(() => marker(page, "guard_captain")).toBe("progress");
  await snap(page, "quest-accepted");
  await win.getByRole("button", { name: "Fechar" }).click();

  // Matar 5 ratos (alterna entre os dois spawns se acabarem).
  await setChase(page, true);
  const progress = async () => Number((await tracker.locator(".qt-step span").last().textContent())?.split("/")[0] ?? 0);
  let spawn = 0;
  const deadline = Date.now() + 200_000;
  while ((await progress()) < 5 && Date.now() < deadline) {
    const m = (await me(page))!;
    const rats = (await monsters(page)).filter((x) => x.defId === "rat" && Math.max(Math.abs(x.x - m.x), Math.abs(x.y - m.y)) <= 9);
    if (rats.length === 0) {
      const s = RAT_SPAWNS[spawn++ % RAT_SPAWNS.length]!;
      const spot = (await walkableNear(page, s.x, s.y, 3))[0]!;
      await teleport(page, spot.x, spot.y);
      await page.waitForTimeout(1500);
      continue;
    }
    const id = await targetNearest(page, (d) => d === "rat").catch(() => "");
    if (!id) continue;
    await expect.poll(async () => (await monsters(page)).some((x) => x.id === id), { timeout: 30_000 }).toBe(false).catch(() => {});
  }
  await expect(tracker).toContainText("5/5", { timeout: 10_000 });
  await expect.poll(() => marker(page, "guard_captain")).toBe("ready");
  // O rastreador diz onde entregar.
  await expect(tracker.locator(".qt-hint")).toHaveText("→ Fale com Capitão Rodrigo");
  await snap(page, "quest-ready");

  const gold0 = (await inventory(page))!.gold;
  // O kit inicial já traz poções de vida: a recompensa (5) é conferida pelo total.
  const potions = async () => (await inventory(page))!.backpack.reduce((n, b) => n + (b?.defId === "health_potion" ? b.count : 0), 0);
  const potions0 = await potions();
  win = await talkTo(page, "guard_captain", "Capitão Rodrigo");
  const ready = win.locator('.quest-card[data-quest="rats_barn"]');
  await expect(ready).toContainText("Pronta");
  await ready.getByRole("button", { name: "Entregar" }).click();
  const done = page.locator(".quest-done");
  await expect(done).toContainText("Missão concluída");
  await expect(done).toContainText("Ratos no Celeiro");
  await expect(done).toContainText("+30 de ouro");
  await snap(page, "quest-done");
  await expect.poll(async () => (await inventory(page))!.gold).toBeGreaterThanOrEqual(gold0 + 30);
  await expect.poll(potions).toBe(potions0 + 5);
  await expect(tracker).toBeHidden();

  // Diário (L): aparece em concluídas.
  await win.getByRole("button", { name: "Fechar" }).click();
  await expect(win).toBeHidden();
  await page.locator("#game canvas").hover({ position: { x: 700, y: 500 }, timeout: 5000 });
  await page.keyboard.press("l");
  const log = page.getByRole("dialog", { name: "Diário de missões" });
  await expect(log).toBeVisible();
  await expect(log.locator(".ql-item.done", { hasText: "Ratos no Celeiro" })).toBeVisible();
  // O listener de Esc do diário é registrado num efeito (próximo frame): um Esc que chega antes se perde. Repete.
  await expect.poll(async () => { await page.keyboard.press("Escape"); return log.isVisible(); }, { timeout: 10_000, intervals: [200] }).toBe(false);
});

test("quadro de recompensas: 3 recompensas do dia e aceitar uma", async ({ page }) => {
  await enterGame(page, "paladin");
  await expect.poll(() => marker(page, "bounty_board")).toBe("available");
  const win = await talkTo(page, "bounty_board", "Quadro de Recompensas");
  await win.getByRole("tab", { name: "Recompensas" }).click();
  const cards = win.locator(".quest-card.bounty");
  await expect(cards).toHaveCount(3);
  await expect(cards.first()).toContainText(/Mate \d+ /);
  await expect(win.locator(".bounty-reset")).toContainText("Novas recompensas em");
  await cards.first().getByRole("button", { name: "Aceitar" }).click();
  await expect(cards.first()).toContainText("Em andamento");
  await expect(cards.first().locator(".bounty-bar")).toContainText("0/");
  await snap(page, "bounty-board");
});

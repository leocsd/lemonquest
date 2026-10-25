// Magias do fim de jogo (lv 35–90) no jogo de verdade: palavras no chat → conjura (o slot entra em recarga). A Fúria do cavaleiro
// aparece na faixa de condições.
import { expect, test, type Page } from "@playwright/test";
import { enterGame, me, monsters, say, setLevel, targetNearest, teleport, walkableNear } from "./helpers.ts";

/** Floresta ao norte da vila (fora da PZ; ratos e gosmas para os alvos). */
const FOREST = { x: 70, y: 62 };

/**
 * Fala as palavras e confere que a magia saiu: ela entra em recarga (confirmação do servidor; vale também dentro de uma
 * família da barra). Mana não serve de prova no lv 90: a regeneração por tique cobre o custo de algumas magias.
 */
async function castWorks(page: Page, words: string, spellId: string, needsTarget: boolean): Promise<void> {
  // Alvo de rato morre fácil (queimadura/veneno das magias anteriores) entre a mira e a magia: até 3 tentativas.
  for (let attempt = 0; attempt < 3; attempt++) {
    if (needsTarget) {
      // As magias de área anteriores limpam os ratos de perto, e um rato longe pode estar embaixo do HUD (o clique não
      // pega): vai para o lado do monstro mais próximo e então mira.
      // Prefere quem não é rato: o rato foge a 15% de vida e some do alcance entre a mira e a magia.
      const pos = (await me(page))!;
      const all = (await monsters(page)).sort((a, b) => Math.max(Math.abs(a.x - pos.x), Math.abs(a.y - pos.y)) - Math.max(Math.abs(b.x - pos.x), Math.abs(b.y - pos.y)));
      const notRat = all.filter((x) => x.defId !== "rat");
      const t = (notRat.length ? notRat : all)[0];
      const near = t && (await walkableNear(page, t.x, t.y, 2)).find((w) => w.x !== t.x || w.y !== t.y);
      if (near) await teleport(page, near.x, near.y);
      await targetNearest(page, notRat.length ? (d) => d !== "rat" : undefined);
    }
    await say(page, words);
    const ok = await page.evaluate((id) => new Promise<boolean>((res) => {
      const t0 = performance.now();
      const check = () => {
        if ((window as any).__lq.spellCd(id) > 0) return res(true);
        if (performance.now() - t0 > 4000) return res(false);
        requestAnimationFrame(check);
      };
      check();
    }), spellId);
    if (ok || !needsTarget) { expect(ok, words).toBe(true); await page.waitForTimeout(1100); return; }
    await page.waitForTimeout(1100);
  }
  throw new Error(`${words}: não conjurou em 3 tentativas`);
}

test("feiticeiro lv 90: as 4 magias novas conjuram pelas palavras", async ({ page }) => {
  test.setTimeout(120_000);
  await enterGame(page, "sorcerer");
  await setLevel(page, 90);
  const spot = (await walkableNear(page, FOREST.x, FOREST.y, 4))[0]!;
  await teleport(page, spot.x, spot.y);
  // Primeiro as de alvo, com os ratos de vida cheia (morrem de um golpe). Depois das de área, os que sobram fogem
  // com pouca vida (ratos fogem a 15%) e saem do alcance.
  await castWorks(page, "exori mort", "sudden_death", true);
  await castWorks(page, "exori gran flam", "eternal_flame", true);
  await castWorks(page, "exevo flam hur", "fire_wave", false);
  await castWorks(page, "exevo gran mas vis", "electric_storm", false);
  // Barra recomendada: 13 magias em 8 teclas, com as famílias ◆ (alvo, área, onda). No lv 90 aparecem 7: a tecla 8 é a
  // Ruptura Elemental (lv 100), e a barra só mostra o que já está liberado.
  await expect(page.locator(".action-slot")).toHaveCount(7);
  await expect(page.locator(".action-slot.family")).toHaveCount(3);
  await expect(page.locator(".action-slot").nth(6).locator(".action-key")).toHaveText("7");
});

test("cavaleiro lv 50: Fúria (utito tempo) gasta mana e aparece nas condições", async ({ page }) => {
  await enterGame(page, "knight");
  await setLevel(page, 50);
  const spot = (await walkableNear(page, FOREST.x, FOREST.y, 4))[0]!;
  await teleport(page, spot.x, spot.y);
  await castWorks(page, "utito tempo", "berserk", false);
  await expect(page.locator(".conditions [data-tip^='Fúria']")).toHaveCount(1);
  await castWorks(page, "exori min", "front_sweep", false);
});

test("cavaleiro lv 100: Muralha de Escudos (utamo mas res) protege e aparece nas condições; a tecla 9 aparece na barra", async ({ page }) => {
  await enterGame(page, "knight");
  await setLevel(page, 100);
  const spot = (await walkableNear(page, FOREST.x, FOREST.y, 4))[0]!;
  await teleport(page, spot.x, spot.y);
  await castWorks(page, "utamo mas res", "shield_wall", false);
  await expect(page.locator(".conditions [data-tip^='Protegido']")).toHaveCount(1);
  // Barra recomendada do cavaleiro: 9 teclas; no lv 100 todas liberadas, a última é a Muralha.
  await expect(page.locator(".action-slot")).toHaveCount(9);
});

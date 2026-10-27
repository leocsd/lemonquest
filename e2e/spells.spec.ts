// Magias do fim de jogo (lv 35–90) no jogo de verdade: palavras no chat → conjura (o slot entra em recarga). A Fúria do cavaleiro
// aparece na faixa de condições.
import { expect, test, type Page } from "@playwright/test";
import { DEFAULT_SPELL_RANGE, spellDef } from "../packages/shared/src/data/spells.ts";
import { enterGame, say, setLevel, targetMonster, teleport, walkableNear } from "./helpers.ts";

/** Floresta ao norte da vila (fora da PZ; ratos e gosmas para as magias de área). */
const FOREST = { x: 70, y: 62 };
/**
 * Campo de treino da vila (bonecos em 48..56 × 104..110, na PZ, onde se conjura ofensivo só contra eles): alvo que não
 * morre, não foge e não anda entre a mira e a palavra — o que derrubava as magias de alvo no CI ("Sem alvo").
 */
const DUMMY_YARD = { x: 52, y: 107 };

/**
 * Escolhe um alvo para uma magia de alcance `range` e um tile para ficar: o tile é andável, livre de monstros, a até 2
 * do alvo e com linha de visão até ele (`__lq.los`, a regra do servidor) — árvores entre os dois davam "Sem linha de
 * visão". Prefere o boneco de treino (não morre), depois quem não é rato (rato foge a 15% de vida), o mais perto.
 */
async function pickTarget(page: Page, range: number): Promise<{ id: string; stand: { x: number; y: number } } | null> {
  return page.evaluate((range) => {
    const lq = (window as any).__lq;
    const me = lq.me() as { x: number; y: number } | null;
    if (!me) return null;
    const mons = lq.monsters() as { id: string; x: number; y: number; defId?: string }[];
    const cheb = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
    const rank = (m: { defId?: string }) => (m.defId === "training_dummy" ? 0 : m.defId === "rat" ? 2 : 1);
    const taken = new Set(mons.map((m) => `${m.x},${m.y}`));
    const list = [...mons].sort((a, b) => rank(a) - rank(b) || cheb(a, me) - cheb(b, me));
    for (const m of list) {
      const spots: { x: number; y: number; d: number }[] = [];
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const x = m.x + dx, y = m.y + dy, d = Math.max(Math.abs(dx), Math.abs(dy));
        if (d === 0 || d > Math.min(2, range) || taken.has(`${x},${y}`) || !lq.walkable(x, y) || !lq.los(x, y, m.x, m.y)) continue;
        spots.push({ x, y, d: d * 10 + (dx !== 0 && dy !== 0 ? 1 : 0) }); // perto e em linha reta primeiro
      }
      spots.sort((a, b) => a.d - b.d);
      if (spots[0]) return { id: m.id, stand: { x: spots[0].x, y: spots[0].y } };
    }
    return null;
  }, range);
}

/**
 * Fala as palavras e confere que a magia saiu: ela entra em recarga (confirmação do servidor; vale também dentro de uma
 * família da barra). Mana não serve de prova no lv 90: a regeneração por tique cobre o custo de algumas magias.
 * Magia de alvo: escolhe o alvo (pickTarget), teleporta para o tile escolhido ao lado DELE, mira nele pelo id e, logo
 * antes de falar, confere de novo alcance e linha de visão (ele pode ter andado); senão, escolhe outra vez.
 */
async function castWorks(page: Page, words: string, spellId: string, needsTarget: boolean): Promise<void> {
  const range = spellDef(spellId)?.range ?? DEFAULT_SPELL_RANGE;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (needsTarget) {
      const t = await pickTarget(page, range);
      if (!t) { await page.waitForTimeout(1000); continue; }
      await teleport(page, t.stand.x, t.stand.y);
      if (!(await targetMonster(page, t.id))) continue;
      const ready = await page.evaluate(([id, range]) => {
        const lq = (window as any).__lq;
        const me = lq.me(), m = (lq.monsters() as { id: string; x: number; y: number }[]).find((x) => x.id === id);
        return !!me && !!m && lq.target() === id && Math.max(Math.abs(me.x - m.x), Math.abs(me.y - m.y)) <= range && lq.los(me.x, me.y, m.x, m.y);
      }, [t.id, range] as const);
      if (!ready) continue;
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
  throw new Error(`${words}: não conjurou em 4 tentativas`);
}

test("feiticeiro lv 90: as 4 magias novas conjuram pelas palavras", async ({ page }) => {
  test.setTimeout(120_000);
  await enterGame(page, "sorcerer");
  await setLevel(page, 90);
  // As de alvo no campo de treino (o boneco não morre nem anda); as de área na floresta, fora da PZ.
  const yard = (await walkableNear(page, DUMMY_YARD.x, DUMMY_YARD.y, 2))[0]!;
  await teleport(page, yard.x, yard.y);
  await castWorks(page, "exori mort", "sudden_death", true);
  await castWorks(page, "exori gran flam", "eternal_flame", true);
  const spot = (await walkableNear(page, FOREST.x, FOREST.y, 4))[0]!;
  await teleport(page, spot.x, spot.y);
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

test("cavaleiro lv 100: Muralha de Escudos (utamo mas res) protege e aparece nas condições; a tecla 10 aparece na barra", async ({ page }) => {
  await enterGame(page, "knight");
  await setLevel(page, 100);
  const spot = (await walkableNear(page, FOREST.x, FOREST.y, 4))[0]!;
  await teleport(page, spot.x, spot.y);
  await castWorks(page, "utamo mas res", "shield_wall", false);
  await expect(page.locator(".conditions [data-tip^='Protegido']")).toHaveCount(1);
  // Barra recomendada do cavaleiro: 10 teclas desde o Limpar Feridas (2026-10-27); no lv 100 todas liberadas, a última é a Muralha.
  await expect(page.locator(".action-slot")).toHaveCount(10);
});

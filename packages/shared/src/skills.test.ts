import { describe, expect, it } from "vitest";
import { SKILLS, SKILL_ESTIMATE, SKILL_ESTIMATE_LEVELS, SKILL_START, skillEstimate, skillTriesFor } from "./skills.ts";
import type { Vocation } from "./types.ts";

const VOCS: Vocation[] = ["knight", "paladin", "sorcerer", "druid"];

describe("skillEstimate (modelos de balanço)", () => {
  it("pela produção (2026-10-25): ML do mago 20/29/37 e skill da arma 30/33/35 nos lv 30/60/100", () => {
    for (const v of ["sorcerer", "druid"] as const) {
      expect([30, 60, 100].map((L) => skillEstimate(v, L).magic), v).toEqual([20, 29, 37]);
    }
    expect([30, 60, 100].map((L) => skillEstimate("knight", L).melee)).toEqual([30, 33, 35]);
    expect([30, 60, 100].map((L) => skillEstimate("paladin", L).distance)).toEqual([30, 33, 35]);
    // O estimador antigo (0,75 × level) dava ML 75 ao mago lv 100.
    expect(skillEstimate("sorcerer", 100).magic).toBeLessThan(0.5 * 100);
  });

  it("começa nas skills do personagem novo, cresce com o level e segue a última inclinação depois do lv 100", () => {
    for (const v of VOCS) {
      expect(skillEstimate(v, 1), v).toEqual(SKILL_START);
      for (let L = 2; L <= 140; L++) {
        const a = skillEstimate(v, L - 1), b = skillEstimate(v, L);
        for (const s of SKILLS) expect(b[s], `${v} ${s} lv ${L}`).toBeGreaterThanOrEqual(a[s]);
      }
    }
    expect(skillEstimate("sorcerer", 120).magic).toBe(41);
    expect(skillEstimate("knight", 120).melee).toBe(36);
    expect(skillEstimate("knight", 0)).toEqual(skillEstimate("knight", 1));
  });

  it("outra tabela no lugar de SKILL_ESTIMATE (comparar hipóteses)", () => {
    const flat = { ...SKILL_ESTIMATE, sorcerer: { ...SKILL_ESTIMATE.sorcerer, magic: [0, 10, 10, 10] } };
    expect(skillEstimate("sorcerer", 60, flat).magic).toBe(10);
    expect(skillEstimate("sorcerer", 60).magic).toBe(29);
  });

  it("ML: cavaleiro < paladino < mago; escudo do cavaleiro = arma, o do mago (livro) abaixo", () => {
    for (const v of VOCS) for (const s of SKILLS) expect(SKILL_ESTIMATE[v][s]).toHaveLength(SKILL_ESTIMATE_LEVELS.length);
    for (const L of [30, 60, 100]) {
      const k = skillEstimate("knight", L), p = skillEstimate("paladin", L), s = skillEstimate("sorcerer", L);
      expect(k.magic).toBeLessThan(p.magic);
      expect(p.magic).toBeLessThan(s.magic);
      expect(k.shield).toBe(k.melee);
      expect(s.shield).toBeLessThan(k.shield);
    }
  });

  it("coerente com a curva de tentativas: o ML do mago lv 100 pede ~5× a mana do lv 60", () => {
    const manaTo = (ml: number) => { let sum = 0; for (let n = 0; n < ml; n++) sum += skillTriesFor("magic", n, "sorcerer"); return sum; };
    const r = manaTo(skillEstimate("sorcerer", 100).magic) / manaTo(skillEstimate("sorcerer", 60).magic);
    expect(r).toBeGreaterThan(3);
    expect(r).toBeLessThan(8);
  });
});

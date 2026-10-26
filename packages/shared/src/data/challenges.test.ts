import { describe, expect, it } from "vitest";
import { itemDef } from "./items.ts";
import { xpForLevel } from "../formulas.ts";
import {
  CHALLENGES, CHALLENGES_PER_WEEK, challengeBonus, challengeGain, challengeGold, challengeReward, challengeTarget,
  potionForLevel, weekChallenges, weekIndex,
} from "./challenges.ts";
import { WEEKLY_EXTRA_KEYS, weekId } from "./weekly.ts";

/** Semanas ISO de um ano ("2027-W01" … "2027-W52"). */
const weeksOf = (year: number) => Array.from({ length: 52 }, (_, i) => `${year}-W${String(i + 1).padStart(2, "0")}`);

describe("desafios: catálogo", () => {
  it("lote de 9, ids únicos, 3 por grupo, metas positivas e prêmio com ouro", () => {
    expect(CHALLENGES).toHaveLength(9);
    expect(new Set(CHALLENGES.map((c) => c.id)).size).toBe(9);
    for (const g of [0, 1, 2]) expect(CHALLENGES.filter((c) => c.group === g)).toHaveLength(3);
    for (const c of CHALLENGES) {
      expect(challengeTarget(c, 1), c.id).toBeGreaterThan(0);
      expect(c.prize.gold, c.id).toBeGreaterThan(0);
      expect(c.desc, c.id).toContain("{n}");
    }
    // Todo contador extra é medido por algum desafio (senão não precisava ir para a linha de base).
    for (const k of WEEKLY_EXTRA_KEYS) expect(CHALLENGES.some((c) => c.key === k), k).toBe(true);
  });
});

describe("desafios: sorteio da semana", () => {
  it("3 por semana, um de cada grupo, sempre os mesmos para a mesma semana", () => {
    for (const w of weeksOf(2027)) {
      const a = weekChallenges(w);
      expect(a).toHaveLength(CHALLENGES_PER_WEEK);
      expect(a.map((c) => c.group)).toEqual([0, 1, 2]);
      expect(weekChallenges(w).map((c) => c.id)).toEqual(a.map((c) => c.id));
    }
  });

  it("nenhum desafio sai duas semanas seguidas (nem na virada do ano) e cada um sai 1× a cada ciclo de 3 semanas", () => {
    // 2026 tem 53 semanas ISO: a 53 e a 01 de 2027 são vizinhas.
    expect(weekIndex("2027-W01")! - weekIndex("2026-W53")!).toBe(1);
    expect(weekIndex("2026-W45")! - weekIndex("2026-W44")!).toBe(1);
    expect(weekIndex("lixo")).toBeNull();
    const weeks = ["2026-W44", "2026-W45", "2026-W46", "2026-W47", "2026-W48", "2026-W49", "2026-W50", "2026-W51", "2026-W52", "2026-W53", ...weeksOf(2027), ...weeksOf(2028)];
    const seen = new Map<string, number>();
    const combos = new Set<string>();
    let prev: string[] = [];
    for (const w of weeks) {
      const ids = weekChallenges(w).map((c) => c.id);
      for (const id of ids) expect(prev, `${w}: ${id} repetido`).not.toContain(id);
      prev = ids;
      combos.add(ids.join(","));
      for (const id of ids) seen.set(id, (seen.get(id) ?? 0) + 1);
      const n = weekIndex(w)!;
      if (n % 3 === 2) {
        // Fim de um ciclo: as 3 semanas dele tiveram os 9 desafios.
        const cycle = [n - 2, n - 1, n].flatMap((k) => weekChallenges(weeks.find((x) => weekIndex(x) === k) ?? "").map((c) => c.id));
        if (weeks.some((x) => weekIndex(x) === n - 2)) expect(new Set(cycle).size, w).toBe(9);
      }
    }
    expect([...seen.keys()].sort()).toEqual(CHALLENGES.map((c) => c.id).sort());
    expect(combos.size).toBeGreaterThan(10);
  });

  it("a semana do servidor vira o id do sorteio (segunda a domingo iguais)", () => {
    const mon = weekChallenges(weekId(new Date(2026, 9, 26, 9))).map((c) => c.id);
    const sun = weekChallenges(weekId(new Date(2026, 10, 1, 22))).map((c) => c.id);
    expect(sun).toEqual(mon);
  });
});

describe("desafios: prêmio escalado pelo level", () => {
  it("ouro cresce 10% por level acima do 1", () => {
    expect(challengeGold(400, 1)).toBe(400);
    expect(challengeGold(400, 11)).toBe(800);
    expect(challengeGold(400, 101)).toBe(4400);
    expect(challengeGold(400, 0)).toBe(400);
  });

  it("a poção é a maior que o level já bebe — nunca acima do level", () => {
    expect(potionForLevel("heal", 1)).toBe("health_potion");
    expect(potionForLevel("heal", 14)).toBe("health_potion");
    expect(potionForLevel("heal", 15)).toBe("health_potion_medium");
    expect(potionForLevel("mana", 30)).toBe("mana_potion_large");
    expect(potionForLevel("mana", 120)).toBe("mana_potion_large");
    for (const lv of [1, 5, 14, 15, 29, 30, 60, 120]) {
      for (const c of CHALLENGES) {
        for (const i of challengeReward(c, lv).items ?? []) expect(itemDef(i.itemId)?.level ?? 1, `${c.id} lv ${lv}`).toBeLessThanOrEqual(lv);
      }
      for (const i of challengeBonus(lv).items ?? []) expect(itemDef(i.itemId)?.level ?? 1, `bônus lv ${lv}`).toBeLessThanOrEqual(lv);
    }
  });

  it("bônus: XP = 20% do level do começo da semana (mín. 200), ouro escalado", () => {
    expect(challengeBonus(1).xp).toBe(200);
    expect(challengeBonus(100).xp).toBe(Math.round((xpForLevel(101) - xpForLevel(100)) * 0.2));
    expect(challengeBonus(50).gold).toBe(challengeGold(1500, 50));
    expect(challengeBonus(100).gold!).toBeGreaterThan(challengeBonus(10).gold!);
  });
});

describe("desafios: ganho da semana", () => {
  const cur = { xp: 1500, kills: 40, fish: 12, bosses: 2, party: 30, steps: 9000, foods: 5, offline: 200, waves: 4, bounties: 3 };
  const base = { id: "2026-W44", xp: 1000, kills: 30, fish: 10, bosses: 2, extra: { party: 10, steps: 1000, foods: 5, offline: 0, waves: 0, bounties: 1 } };
  it("chaves do ranking e extras; base de outra semana ou sem o extra = 0", () => {
    expect(challengeGain(base, cur, "2026-W44", "kills")).toBe(10);
    expect(challengeGain(base, cur, "2026-W44", "party")).toBe(20);
    expect(challengeGain(base, cur, "2026-W44", "bounties")).toBe(2);
    expect(challengeGain(base, cur, "2026-W45", "party")).toBe(0);
    expect(challengeGain({ ...base, extra: undefined }, cur, "2026-W44", "steps")).toBe(0); // base antiga (antes do ciclo 18)
    expect(challengeGain(base, { ...cur, steps: 10 }, "2026-W44", "steps")).toBe(0); // nunca negativo
    expect(challengeGain(undefined, cur, "2026-W44", "xp")).toBe(0);
  });
});

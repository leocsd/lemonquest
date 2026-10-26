import { describe, expect, it } from "vitest";
import {
  INVASION_BASE, INVASION_MAX_ALIVE, INVASION_MIN_POINTS, INVASION_PER_PLAYER, INVASION_TIERS, INVASION_WAVES, invasionChests,
  invasionDamagePoints, invasionHealPoints, invasionLeaderHpMult, invasionMonsterIds, invasionNextWaveAt, invasionPresence,
  invasionSide, invasionTierOf, invasionWaveIndex, invasionWavePlan, invasionWaveStart, isInvasionMonsterOk, villageDefended,
} from "./invasion.ts";
import { MONSTERS } from "./monsters.ts";

const MIN = 60_000;
const rng0 = () => 0;

describe("invasão da vila: dados", () => {
  it("faixas cobrem todos os levels sem buraco (≤ 12, 13–20, ≥ 21)", () => {
    expect(INVASION_TIERS.map((t) => t.id)).toEqual(["low", "mid", "high"]);
    for (let i = 1; i < INVASION_TIERS.length; i++) expect(INVASION_TIERS[i]!.minLevel).toBe(INVASION_TIERS[i - 1]!.maxLevel + 1);
    expect(invasionTierOf(1)).toBe("low");
    expect(invasionTierOf(12)).toBe("low");
    expect(invasionTierOf(13)).toBe("mid");
    expect(invasionTierOf(20)).toBe("mid");
    expect(invasionTierOf(21)).toBe("high");
    expect(invasionTierOf(150)).toBe("high");
  });

  it("monstros existem no jogo, não são chefes, e cada faixa tem bichos do tamanho dela", () => {
    for (const id of invasionMonsterIds()) expect(isInvasionMonsterOk(id), id).toBe(true);
    for (const t of INVASION_TIERS) {
      const levels = t.monsters.map((id) => MONSTERS[id]!.level);
      // Nenhum invasor comum passa do topo da faixa + 10 (a faixa alta vai até o 30: goblins, macacos, piratas).
      for (const [i, l] of levels.entries()) expect(l, t.monsters[i]).toBeLessThanOrEqual(Math.min(t.maxLevel, t.minLevel + 9) + 10);
      if (t.id !== "low") for (const l of levels) expect(l).toBeGreaterThanOrEqual(t.minLevel);
      // O líder é o mais forte da faixa, sem passar de ~20 levels acima do começo dela.
      const leader = MONSTERS[t.leader]!.level;
      expect(leader).toBeGreaterThanOrEqual(Math.max(...levels));
      expect(leader).toBeLessThanOrEqual(t.minLevel + 20);
    }
  });

  it("ondas: começam no 0, em ordem, dentro da duração; só a última traz o líder", () => {
    expect(INVASION_WAVES[0]!.at).toBe(0);
    for (let i = 1; i < INVASION_WAVES.length; i++) expect(INVASION_WAVES[i]!.at).toBeGreaterThan(INVASION_WAVES[i - 1]!.at);
    expect(INVASION_WAVES.at(-1)!.at).toBeLessThan(1);
    expect(INVASION_WAVES.filter((w) => w.leader)).toEqual([INVASION_WAVES.at(-1)]);
  });
});

describe("invasão da vila: ondas pelo relógio", () => {
  const start = Date.UTC(2026, 9, 28, 15, 15), end = start + 40 * MIN; // 40 min, como a de quarta

  it("onda atual por fração da duração: -1 antes, null no fim (exclusivo)", () => {
    expect(invasionWaveIndex(start, end, start - 1)).toBe(-1);
    expect(invasionWaveIndex(start, end, start)).toBe(0);
    expect(invasionWaveIndex(start, end, start + 8 * MIN - 1)).toBe(0);
    expect(invasionWaveIndex(start, end, start + 8 * MIN)).toBe(1); // 20%
    expect(invasionWaveIndex(start, end, start + 16 * MIN)).toBe(2);
    expect(invasionWaveIndex(start, end, start + 24 * MIN)).toBe(3);
    expect(invasionWaveIndex(start, end, start + 32 * MIN)).toBe(4); // 80%: a do líder
    expect(invasionWaveIndex(start, end, end - 1)).toBe(4);
    expect(invasionWaveIndex(start, end, end)).toBeNull();
  });

  it("depois de um reinício o mesmo instante dá a mesma onda (só depende do relógio)", () => {
    const t = start + 19 * MIN;
    expect(invasionWaveIndex(start, end, t)).toBe(invasionWaveIndex(start, end, t));
    expect(invasionWaveIndex(start, end, t)).toBe(2);
    // Janela manual de 10 min: as frações valem do mesmo jeito.
    expect(invasionWaveIndex(start, start + 10 * MIN, start + 8 * MIN)).toBe(4);
  });

  it("horário de cada onda e da próxima", () => {
    expect(INVASION_WAVES.map((_, i) => (invasionWaveStart(start, end, i) - start) / MIN)).toEqual([0, 8, 16, 24, 32]);
    expect(invasionNextWaveAt(start, end, 0)).toBe(start + 8 * MIN);
    expect(invasionNextWaveAt(start, end, 4)).toBeNull();
  });
});

describe("invasão da vila: tamanho das ondas", () => {
  const none = { low: 0, mid: 0, high: 0 };

  it("sem ninguém: só a base da faixa baixa (a Vila é invadida de qualquer jeito)", () => {
    const p = invasionWavePlan(0, none, 0, rng0);
    expect(p.monsters).toHaveLength(INVASION_BASE);
    expect(p.monsters.every((m) => m.tier === "low")).toBe(true);
    expect(p.leader).toBeUndefined();
  });

  it("escala com os presentes de cada faixa; a faixa alta só com jogador alto presente", () => {
    const pres = invasionPresence([5, 8, 15, 30]); // 2 baixos, 1 médio, 1 alto
    expect(pres).toEqual({ low: 2, mid: 1, high: 1 });
    const p = invasionWavePlan(0, pres, 0, rng0);
    const by = (t: string) => p.monsters.filter((m) => m.tier === t).length;
    expect(by("low")).toBe(INVASION_BASE + INVASION_PER_PLAYER * 2);
    expect(by("mid")).toBe(INVASION_PER_PLAYER);
    expect(by("high")).toBe(INVASION_PER_PLAYER);
    const noHigh = invasionWavePlan(0, invasionPresence([5, 15, 18]), 0, rng0);
    expect(noHigh.monsters.some((m) => m.tier === "high")).toBe(false);
    // Ondas posteriores crescem pelo multiplicador.
    const late = invasionWavePlan(2, pres, 0, rng0);
    expect(late.monsters.length).toBeGreaterThan(p.monsters.length);
    // Cada vaga é um monstro da faixa certa.
    for (const m of late.monsters) expect(INVASION_TIERS.find((t) => t.id === m.tier)!.monsters).toContain(m.defId);
  });

  it("teto de vivos: o que não cabe não nasce, e o corte não apaga uma faixa inteira", () => {
    const many = invasionPresence([...Array(10).fill(5), ...Array(10).fill(15), ...Array(10).fill(40)]);
    const full = invasionWavePlan(4, many, 0, rng0);
    expect(full.monsters.length + (full.leader ? 1 : 0)).toBe(INVASION_MAX_ALIVE);
    for (const t of ["low", "mid", "high"]) expect(full.monsters.some((m) => m.tier === t), t).toBe(true);
    const almost = invasionWavePlan(1, many, INVASION_MAX_ALIVE - 3, rng0);
    expect(almost.monsters).toHaveLength(3);
    expect(invasionWavePlan(1, many, INVASION_MAX_ALIVE, rng0).monsters).toHaveLength(0);
    // Na onda do líder, ele vem primeiro: com 1 vaga, só ele.
    const last = invasionWavePlan(4, many, INVASION_MAX_ALIVE - 1, rng0);
    expect(last.leader).toBeDefined();
    expect(last.monsters).toHaveLength(0);
    // Teto cheio (ou já estourado): o líder nasce mesmo assim, sozinho; sem ele a última onda ficava sem chefe.
    for (const alive of [INVASION_MAX_ALIVE, INVASION_MAX_ALIVE + 5]) {
      const over = invasionWavePlan(4, many, alive, rng0);
      expect(over.leader, String(alive)).toMatchObject({ tier: "high" });
      expect(over.monsters).toHaveLength(0);
    }
  });

  it("líder elite da faixa mais alta presente, mais forte com mais gente", () => {
    expect(invasionWavePlan(4, { low: 0, mid: 0, high: 0 }, 0, rng0).leader).toMatchObject({ tier: "low", defId: "snake", hpMult: 1 });
    expect(invasionWavePlan(4, { low: 3, mid: 1, high: 0 }, 0, rng0).leader).toMatchObject({ tier: "mid", defId: "skeleton", hpMult: 2.5 });
    expect(invasionWavePlan(4, { low: 1, mid: 0, high: 1 }, 0, rng0).leader).toMatchObject({ tier: "high", defId: "pirate_buccaneer" });
    expect(invasionLeaderHpMult(1)).toBe(1);
    expect(invasionLeaderHpMult(3)).toBe(2);
    expect(invasionLeaderHpMult(30)).toBe(4);
    for (let i = 0; i < INVASION_WAVES.length - 1; i++) expect(invasionWavePlan(i, { low: 1, mid: 1, high: 1 }, 0, rng0).leader).toBeUndefined();
  });
});

describe("invasão da vila: contribuição e prêmio", () => {
  it("pontos: 5 por vida-base de invasor (dano) e 5 por vida máxima do curado (cura)", () => {
    expect(invasionDamagePoints(100, 100)).toBe(5);
    expect(invasionDamagePoints(50, 100)).toBe(2.5);
    expect(invasionDamagePoints(0, 100)).toBe(0);
    expect(invasionDamagePoints(10, 0)).toBe(0);
    expect(invasionHealPoints(300, 300)).toBe(5);
    expect(invasionHealPoints(-5, 300)).toBe(0);
    // O mínimo do prêmio = dois invasores inteiros (ou duas vidas cheias curadas).
    expect(invasionDamagePoints(2 * 34, 34)).toBe(INVASION_MIN_POINTS);
  });

  it("Vila defendida: 75% dos invasores derrotados e o líder (se apareceu)", () => {
    expect(villageDefended({ spawned: 40, killed: 30, leaderSpawned: true, leaderKilled: true })).toBe(true);
    expect(villageDefended({ spawned: 40, killed: 29, leaderSpawned: true, leaderKilled: true })).toBe(false);
    expect(villageDefended({ spawned: 40, killed: 40, leaderSpawned: true, leaderKilled: false })).toBe(false);
    expect(villageDefended({ spawned: 10, killed: 8, leaderSpawned: false, leaderKilled: false })).toBe(true); // parada antes do líder
    expect(villageDefended({ spawned: 0, killed: 0, leaderSpawned: false, leaderKilled: false })).toBe(false);
  });

  it("baús: nada abaixo de 10 pontos, 1 por ajudar, +1 com a Vila defendida", () => {
    expect(invasionChests(9.99, true)).toBe(0);
    expect(invasionChests(10, false)).toBe(1);
    expect(invasionChests(10, true)).toBe(2);
    expect(invasionChests(Number.NaN, true)).toBe(0);
  });

  it("lado da Vila de onde vem a coluna", () => {
    const vila = { x0: 58, y0: 76, x1: 103, y1: 115 };
    expect(invasionSide(72, 67, vila)).toBe("norte");
    expect(invasionSide(112, 97, vila)).toBe("leste");
    expect(invasionSide(49, 86, vila)).toBe("oeste");
    expect(invasionSide(112, 67, vila)).toBe("nordeste");
  });
});

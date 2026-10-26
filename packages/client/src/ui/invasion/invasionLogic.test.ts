import { describe, expect, it } from "vitest";
import type { InvasionState } from "@lemonquest/shared";
import { invasionKillsLeft, invasionMineText, invasionOnTrack, invasionResultText, invasionWaveText } from "./invasionLogic.ts";

const MIN = 60_000;
const base: InvasionState = {
  name: "Invasão da Vila", start: 0, end: 40 * MIN, wave: 3, waves: 5, nextWaveAt: 24 * MIN,
  alive: 12, spawned: 32, killed: 20, defendPct: 0.75, leader: null, points: [], mine: 7, goal: 10,
};

describe("HUD da invasão", () => {
  it("onda e próxima onda", () => {
    expect(invasionWaveText(base, 20 * MIN)).toBe("Onda 3/5 · próxima em 4 min");
    expect(invasionWaveText(base, 24 * MIN - 1000)).toBe("Onda 3/5 · próxima em 1 min"); // nunca "0 min"
    expect(invasionWaveText({ ...base, wave: 5, nextWaveAt: null }, 35 * MIN)).toBe("Onda 5/5 · última");
    expect(invasionWaveText({ ...base, wave: 0, nextWaveAt: 2 * MIN }, 0)).toBe("Começa em 2 min");
  });

  it("meta de defesa: abates que faltam e se a Vila está segura", () => {
    expect(invasionKillsLeft(base)).toBe(4); // 75% de 32 = 24
    expect(invasionOnTrack(base)).toBe(false);
    expect(invasionOnTrack({ ...base, killed: 24 })).toBe(true);
    expect(invasionOnTrack({ ...base, killed: 24, leader: { name: "Pirata", alive: true } })).toBe(false);
    expect(invasionOnTrack({ ...base, spawned: 0, killed: 0 })).toBe(false);
  });

  it("sua contribuição e o resultado", () => {
    expect(invasionMineText(base)).toBe("Você: 7/10 pts");
    expect(invasionMineText({ ...base, mine: 12 })).toBe("Você: 12 pts ✔");
    expect(invasionResultText({ defended: true, killed: 30, spawned: 36, points: 14, chests: 2 }))
      .toBe("A Vila resistiu! 30/36 invasores derrotados. Você ganhou 2 Baús de Recompensa (14 pontos).");
    expect(invasionResultText({ defended: false, killed: 3, spawned: 20, points: 4, chests: 0 }))
      .toBe("A Vila não resistiu (3/20 derrotados). Sua contribuição: 4 pontos (o prêmio pede 10).");
    expect(invasionResultText({ defended: false, killed: 3, spawned: 20, points: 12, chests: 1 })).toMatch(/1 Baú de Recompensa/);
  });
});

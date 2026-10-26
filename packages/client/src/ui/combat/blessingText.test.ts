import { describe, expect, it } from "vitest";
import { xpForLevel } from "@lemonquest/shared";
import { blessingLine, blessingProtects, lastHitsRows } from "./blessingText.ts";

describe("blessingLine (tela de morte)", () => {
  it("bênção gasta: diz quanto salvou, em qualquer level", () => {
    expect(blessingLine({ level: 100, lostXp: 0, blessed: true, blessingUsed: true, savedXp: 19328 })).toBe("Sua bênção salvou 19.328 XP.");
    expect(blessingLine({ level: 5, lostXp: 0, blessed: true, blessingUsed: true, savedXp: 3 })).toBe("Sua bênção salvou 3 XP.");
  });

  it("abençoado sem perda: a bênção não foi gasta; sem bênção e perdendo: a dica; abaixo do lv 8: nada", () => {
    expect(blessingLine({ level: 30, lostXp: 0, blessed: true })).toBe("Nada a perder neste level: sua bênção continua ativa.");
    expect(blessingLine({ level: 30, lostXp: 500, blessed: false })).toMatch(/^Dica: a Bênção/);
    expect(blessingLine({ level: 5, lostXp: 10, blessed: false })).toBe("");
    expect(blessingLine({ level: 30, lostXp: 0, blessed: false })).toBe("");
  });
});

describe("blessingProtects (sacerdotisa)", () => {
  it("a perda da próxima morte pela conta do servidor; recém-subido mostra a perda cheia do level", () => {
    expect(blessingProtects(100, xpForLevel(101) - 1)).toBe("Protege ~19.328 XP agora.");
    expect(blessingProtects(100, xpForLevel(100) + 5000)).toBe("Protege ~5.000 XP agora.");
    expect(blessingProtects(100, xpForLevel(100) + 5000, "red")).toBe("Protege ~5.000 XP agora."); // limitado ao piso
    expect(blessingProtects(100, xpForLevel(100) + 30_000, "red")).toBe("Protege ~30.000 XP agora.");
    expect(blessingProtects(100, xpForLevel(100))).toBe("Protege até 19.328 XP neste level.");
    // Caveira vermelha: o teto do level também dobra (a mesma conta da morte).
    expect(blessingProtects(100, xpForLevel(100), "red")).toBe("Protege até 38.656 XP neste level.");
  });
});

describe("lastHitsRows (tela de morte, ciclo 18)", () => {
  it("fonte com inicial maiúscula, dano formatado e barra relativa ao maior", () => {
    expect(lastHitsRows([{ source: "Dragão", amount: 1240 }, { source: "veneno", amount: 310 }])).toEqual([
      { source: "Dragão", amount: "1.240", pct: 100 },
      { source: "Veneno", amount: "310", pct: 25 },
    ]);
  });
  it("ausente ou malformado: nada", () => {
    expect(lastHitsRows(undefined)).toEqual([]);
    expect(lastHitsRows([{ source: 3, amount: 1 }, null, { source: "Rato", amount: Number.NaN }, { source: "Rato", amount: 0 }])).toEqual([]);
  });
});

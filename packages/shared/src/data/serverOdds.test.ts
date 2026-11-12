import { describe, expect, it } from "vitest";
import {
  CASINO_ODDS, CHEST_GEM_RANGES, CHEST_POTION_RANGES, FISH_ODDS, chestFallbackGem, chestGold, chestPotion,
} from "./serverOdds.ts";
import { ITEMS } from "./items.ts";

describe("números dos sorteios do servidor (WK-3)", () => {
  it("poção e gema do baú mudam de faixa nos mesmos levels de antes", () => {
    expect([1, 14, 15, 29, 30, 120].map((l) => chestPotion(l, false))).toEqual([
      "health_potion", "health_potion", "health_potion_medium", "health_potion_medium", "health_potion_large", "health_potion_large",
    ]);
    expect(chestPotion(30, true)).toBe("mana_potion_large");
    expect([1, 34, 35, 59, 60].map(chestFallbackGem)).toEqual(["gem_green", "gem_green", "gem_yellow", "gem_yellow", "gem_purple"]);
  });

  it("as faixas da wiki saem das mesmas listas (sem buraco nem sobreposição)", () => {
    expect(CHEST_POTION_RANGES).toEqual({
      health_potion_large: [30, null], mana_potion_large: [30, null],
      health_potion_medium: [15, 29], mana_potion_medium: [15, 29],
      health_potion: [1, 14], mana_potion: [1, 14],
    });
    expect(CHEST_GEM_RANGES).toEqual({ gem_purple: [60, null], gem_yellow: [35, 59], gem_green: [1, 34] });
    for (const id of [...Object.keys(CHEST_POTION_RANGES), ...Object.keys(CHEST_GEM_RANGES), ...Object.keys(FISH_ODDS)]) {
      expect(ITEMS[id], id).toBeDefined();
    }
  });

  it("ouro do baú: sorteio × (1 + level ÷ 5)", () => {
    expect(chestGold(50, 15)).toBe(165);
    expect(chestGold(50, 40)).toBe(440);
    expect(chestGold(0, 15)).toBe(chestGold(1, 15)); // level mínimo 1
  });

  it("as faixas de cada sorteio somam 100 %", () => {
    const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
    expect(sum(CASINO_ODDS)).toBeCloseTo(1, 10);
    expect(sum(FISH_ODDS)).toBeCloseTo(1, 10);
  });
});

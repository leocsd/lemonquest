import { describe, expect, it } from "vitest";
import { ITEMS, itemDef, type ItemDef } from "./data/items.ts";
import {
  DEFAULT_LOOT_FILTER, LOOT_MIN_VALUES, autoLoots, isDefaultLootFilter, lootFilterSummary, sanitizeLootFilter, snapMinValue, type LootFilter,
} from "./lootFilter.ts";

const f = (over: Partial<LootFilter> = {}): LootFilter => ({ ...DEFAULT_LOOT_FILTER, ...over });
const def = (id: string): ItemDef => { const d = itemDef(id); if (!d) throw new Error(`item ${id} não existe`); return d; };
const ALL = Object.values(ITEMS);

describe("lootFilter: sanitize", () => {
  it("lixo vira o padrão; campos válidos ficam", () => {
    expect(sanitizeLootFilter(undefined)).toEqual(DEFAULT_LOOT_FILTER);
    expect(sanitizeLootFilter("x")).toEqual(DEFAULT_LOOT_FILTER);
    expect(sanitizeLootFilter({ gear: "legendary", materials: "sim", minValue: -5 })).toEqual(DEFAULT_LOOT_FILTER);
    expect(sanitizeLootFilter({ gear: "rare", materials: false, potions: false, food: false, minValue: 1000 }))
      .toEqual({ gear: "rare", materials: false, potions: false, food: false, minValue: 1000 });
  });
  it("valor mínimo encaixa no degrau de baixo", () => {
    expect(snapMinValue(0)).toBe(0);
    expect(snapMinValue(99)).toBe(50);
    expect(snapMinValue(250)).toBe(250);
    expect(snapMinValue(999_999)).toBe(LOOT_MIN_VALUES.at(-1));
    expect(snapMinValue(NaN)).toBe(0);
    expect(snapMinValue("100")).toBe(0);
  });
  it("padrão é reconhecido", () => {
    expect(isDefaultLootFilter(f())).toBe(true);
    expect(isDefaultLootFilter(f({ food: false }))).toBe(false);
    expect(isDefaultLootFilter(f({ minValue: 50 }))).toBe(false);
  });
});

describe("lootFilter: o que entra sozinho", () => {
  it("padrão pega tudo", () => {
    for (const d of ALL) expect(autoLoots(f(), d, "common")).toBe(true);
  });
  it("ouro, missão e chave entram sempre, mesmo com tudo desligado", () => {
    const strict = f({ gear: "rare", materials: false, potions: false, food: false, minValue: 2500 });
    expect(autoLoots(strict, def("gold_coin"), "common")).toBe(true);
    expect(autoLoots(strict, def("bounty_chest"), "common")).toBe(true);
    expect(autoLoots(strict, def("crypt_key"), "common")).toBe(true);
  });
  it("raro ou melhor entra sempre (a linha do Vender tudo), abaixo disso o equipamento segue a raridade mínima", () => {
    const sword = ALL.find((d) => d.kind === "weapon")!;
    const strict = f({ gear: "rare", minValue: 2500 });
    expect(autoLoots(strict, sword, "rare")).toBe(true);
    expect(autoLoots(strict, sword, "epic")).toBe(true);
    expect(autoLoots(strict, sword, "uncommon")).toBe(false);
    expect(autoLoots(f({ gear: "uncommon" }), sword, "uncommon")).toBe(true);
    expect(autoLoots(f({ gear: "uncommon" }), sword, "common")).toBe(false);
  });
  it("material, poção e comida têm interruptor próprio", () => {
    const material = ALL.find((d) => d.kind === "material" && d.id !== "gold_coin" && d.value > 0)!;
    const potion = ALL.find((d) => d.kind === "potion")!;
    const food = ALL.find((d) => d.kind === "food")!;
    expect(autoLoots(f({ materials: false }), material, "common")).toBe(false);
    expect(autoLoots(f({ materials: false }), potion, "common")).toBe(true);
    expect(autoLoots(f({ potions: false }), potion, "common")).toBe(false);
    expect(autoLoots(f({ food: false }), food, "common")).toBe(false);
    expect(autoLoots(f({ food: false }), material, "common")).toBe(true);
  });
  it("valor mínimo corta o barato de qualquer categoria, inclusive equipamento comum", () => {
    const cheap = ALL.find((d) => d.kind === "material" && d.id !== "gold_coin" && d.value > 0 && d.value < 50)!;
    const rich = ALL.find((d) => d.kind === "material" && d.value >= 1000)!;
    const cheapGear = ALL.find((d) => d.slot && d.value < 100)!;
    expect(autoLoots(f({ minValue: 50 }), cheap, "common")).toBe(false);
    expect(autoLoots(f({ minValue: 1000 }), rich, "common")).toBe(true);
    expect(autoLoots(f({ minValue: 100 }), cheapGear, "common")).toBe(false);
    expect(autoLoots(f({ minValue: 100 }), cheapGear, "rare")).toBe(true);
  });
});

describe("lootFilter: resumo", () => {
  it("descreve só o que mudou", () => {
    expect(lootFilterSummary(f())).toBe("Pega tudo");
    expect(lootFilterSummary(f({ gear: "rare" }))).toBe("equipamento raro+");
    expect(lootFilterSummary(f({ gear: "uncommon", food: false, materials: false, minValue: 100 })))
      .toBe("equipamento incomum+ · sem materiais, comida · só o que vale 100+");
  });
});

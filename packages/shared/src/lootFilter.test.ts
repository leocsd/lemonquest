import { describe, expect, it } from "vitest";
import { ITEMS, itemDef, type ItemDef } from "./data/items.ts";
import { MONSTERS } from "./data/monsters.ts";
import {
  DEFAULT_LOOT_FILTER, LOOTABLE_ITEMS, LOOT_GROUPS, LOOT_GROUP_ORDER, LOOT_SKIP_MAX, autoLoots, isDefaultLootFilter, lootFilterSummary, lootGroupOf,
  sanitizeLootFilter,
} from "./lootFilter.ts";

const def = (id: string): ItemDef => { const d = itemDef(id); if (!d) throw new Error(`item ${id} não existe`); return d; };

describe("lootFilter: lista de itens lootáveis", () => {
  it("todo item que cai de monstro está na lista, menos ouro, missão e chave; nada fora da tabela de loot", () => {
    const dropped = new Set(Object.values(MONSTERS).flatMap((m) => (m.loot ?? []).map((e) => e.itemId)));
    for (const d of LOOTABLE_ITEMS) {
      expect(dropped.has(d.id)).toBe(true);
      expect(["quest", "key"]).not.toContain(d.kind);
      expect(d.id).not.toBe("gold_coin");
    }
    for (const id of dropped) {
      const d = ITEMS[id]!;
      if (lootGroupOf(d) !== undefined) expect(LOOTABLE_ITEMS.some((x) => x.id === id)).toBe(true);
    }
    expect(LOOTABLE_ITEMS.length).toBeGreaterThan(200);
    expect(LOOTABLE_ITEMS.length).toBeLessThan(LOOT_SKIP_MAX);
  });
  it("grupos na ordem da janela, sem grupo vazio, e os itens em ordem de level/valor", () => {
    const order = LOOT_GROUPS.map((g) => LOOT_GROUP_ORDER.indexOf(g.id));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    for (const g of LOOT_GROUPS) {
      expect(g.items.length).toBeGreaterThan(0);
      for (let i = 1; i < g.items.length; i++) {
        const a = g.items[i - 1]!, b = g.items[i]!;
        expect((a.level ?? 0) < (b.level ?? 0) || ((a.level ?? 0) === (b.level ?? 0) && a.value <= b.value)).toBe(true);
      }
    }
    expect(LOOT_GROUPS.reduce((n, g) => n + g.items.length, 0)).toBe(LOOTABLE_ITEMS.length);
  });
});

describe("lootFilter: sanitize", () => {
  it("lixo vira o padrão; ids válidos ficam únicos e curtos; a lista tem teto", () => {
    expect(sanitizeLootFilter(undefined)).toEqual(DEFAULT_LOOT_FILTER);
    expect(sanitizeLootFilter("x")).toEqual(DEFAULT_LOOT_FILTER);
    expect(sanitizeLootFilter({ skip: "bone" })).toEqual(DEFAULT_LOOT_FILTER);
    expect(sanitizeLootFilter({ skip: ["bone", 7, "", "bone", "x".repeat(49), "vest"] })).toEqual({ skip: ["bone", "vest"] });
    expect(sanitizeLootFilter({ skip: Array.from({ length: LOOT_SKIP_MAX + 50 }, (_, i) => `i${i}`) }).skip).toHaveLength(LOOT_SKIP_MAX);
  });
  it("formato antigo (categorias e valor mínimo) vira a lista equivalente", () => {
    const noFood = sanitizeLootFilter({ gear: "common", materials: true, potions: true, food: false, minValue: 0 });
    expect(noFood.skip.length).toBeGreaterThan(0);
    for (const id of noFood.skip) expect(def(id).kind).toBe("food");
    const cheap = sanitizeLootFilter({ minValue: 100 });
    for (const d of LOOTABLE_ITEMS) expect(cheap.skip.includes(d.id)).toBe(d.value < 100);
    const gear = sanitizeLootFilter({ gear: "rare" });
    for (const d of LOOTABLE_ITEMS) expect(gear.skip.includes(d.id)).toBe(!!d.slot);
    expect(sanitizeLootFilter({ gear: "common", materials: true, potions: true, food: true, minValue: 0 })).toEqual(DEFAULT_LOOT_FILTER);
  });
  it("padrão é reconhecido", () => {
    expect(isDefaultLootFilter({ skip: [] })).toBe(true);
    expect(isDefaultLootFilter({ skip: ["bone"] })).toBe(false);
  });
});

describe("lootFilter: o que entra sozinho", () => {
  const material = LOOTABLE_ITEMS.find((d) => d.kind === "material")!;
  const other = LOOTABLE_ITEMS.find((d) => d.id !== material.id)!;
  it("sem lista tudo entra", () => {
    for (const d of Object.values(ITEMS)) expect(autoLoots(DEFAULT_LOOT_FILTER, d, "common")).toBe(true);
  });
  it("item da lista fica no chão; os outros entram", () => {
    const f = { skip: [material.id] };
    expect(autoLoots(f, material, "common")).toBe(false);
    expect(autoLoots(f, material, "uncommon")).toBe(false);
    expect(autoLoots(f, other, "common")).toBe(true);
  });
  it("ouro, missão e chave entram sempre, mesmo na lista", () => {
    const f = { skip: ["gold_coin", "bounty_chest", "crypt_key"] };
    expect(autoLoots(f, def("gold_coin"), "common")).toBe(true);
    expect(autoLoots(f, def("bounty_chest"), "common")).toBe(true);
    expect(autoLoots(f, def("crypt_key"), "common")).toBe(true);
  });
  it("raro ou melhor entra sempre (a linha do Vender tudo), mesmo com o item na lista", () => {
    const sword = LOOTABLE_ITEMS.find((d) => d.kind === "weapon")!;
    const f = { skip: [sword.id] };
    expect(autoLoots(f, sword, "common")).toBe(false);
    expect(autoLoots(f, sword, "uncommon")).toBe(false);
    expect(autoLoots(f, sword, "rare")).toBe(true);
    expect(autoLoots(f, sword, "epic")).toBe(true);
    expect(autoLoots(f, sword, "legendary")).toBe(true);
  });
});

describe("lootFilter: resumo", () => {
  it("conta o que fica no chão", () => {
    expect(lootFilterSummary({ skip: [] })).toBe("Pega tudo");
    expect(lootFilterSummary({ skip: ["a"] })).toBe("1 item fica no chão");
    expect(lootFilterSummary({ skip: ["a", "b", "c"] })).toBe("3 itens ficam no chão");
  });
});

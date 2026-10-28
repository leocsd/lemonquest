import { describe, expect, it } from "vitest";
import type { ItemDef, MonsterDef } from "@lemonquest/shared";
import { NO_VIEW, applyLootView, cheaperThan, isNoView, itemZonesIndex, lootZones, searchItems, takenCount, withSkipped } from "./lootFilterLogic.ts";

const icon = { url: "x.png" };
const items: ItemDef[] = [
  { id: "osso", name: "Osso", kind: "material", value: 10, icon },
  { id: "pocao", name: "Poção de Vida Grande", kind: "potion", value: 300, level: 30, vocations: ["knight", "paladin"], icon },
  { id: "espada", name: "Espada Rúnica", kind: "weapon", slot: "weapon", weaponType: "sword", value: 3000, level: 60, vocations: ["knight"], icon },
  { id: "elmo", name: "Elmo de Couro", kind: "helmet", slot: "helmet", value: 20, level: 1, icon },
  { id: "cajado", name: "Bastão de Gelo", kind: "weapon", slot: "weapon", weaponType: "rod", value: 3000, level: 90, vocations: ["druid"], icon },
];
const monsters = [
  { id: "rato", loot: [{ itemId: "osso", chance: 1 }] },
  { id: "dragao", loot: [{ itemId: "espada", chance: 0.1 }, { itemId: "osso", chance: 0.5 }] },
  { id: "chefe", loot: [{ itemId: "cajado", chance: 1 }] }, // só em missão: sem spawn
] as unknown as MonsterDef[];
const idx = {
  spawnsOf: (id: string) => (id === "rato" ? [{ zone: "Vila", count: 5 }] : id === "dragao" ? [{ zone: "Vulcão", count: 2 }, { zone: "Vila", count: 1 }] : []),
  npcAt: () => null,
} as never;
const zones = itemZonesIndex(idx, monsters);
const ctx = { myLevel: 50, zones };

describe("lootFilterLogic: busca e lote", () => {
  it("busca sem acento e sem caixa", () => {
    expect(searchItems(items, "pocao").map((d) => d.id)).toEqual(["pocao"]);
    expect(searchItems(items, "RÚN").map((d) => d.id)).toEqual(["espada"]);
    expect(searchItems(items, "  ")).toHaveLength(5);
  });
  it("tirar e devolver ids sem repetir, mantendo a ordem", () => {
    expect(withSkipped([], ["osso", "pocao"], true)).toEqual(["osso", "pocao"]);
    expect(withSkipped(["osso"], ["osso", "espada"], true)).toEqual(["osso", "espada"]);
    expect(withSkipped(["osso", "pocao"], ["osso"], false)).toEqual(["pocao"]);
  });
  it("conta o que entra e lista o que vale menos", () => {
    expect(takenCount(items, ["osso"])).toBe(4);
    expect(cheaperThan(items, 50)).toEqual(["osso", "elmo"]);
    expect(cheaperThan(items, 10)).toEqual([]);
  });
});

describe("lootFilterLogic: filtros de visualização", () => {
  it("zonas: item → zonas dos monstros que o soltam; sem índice, nada", () => {
    expect([...zones.get("osso")!].sort()).toEqual(["Vila", "Vulcão"]);
    expect([...zones.get("espada")!].sort()).toEqual(["Vila", "Vulcão"]);
    expect(zones.get("cajado")).toBeUndefined(); // chefe sem spawn
    expect(lootZones(zones)).toEqual(["Vila", "Vulcão"]);
    expect(itemZonesIndex(null, monsters).size).toBe(0);
  });
  it("sem filtro passa tudo; cada filtro corta a sua dimensão", () => {
    expect(isNoView(NO_VIEW)).toBe(true);
    expect(applyLootView(items, NO_VIEW, ctx)).toHaveLength(5);
    expect(applyLootView(items, { ...NO_VIEW, category: "gear" }, ctx).map((d) => d.id)).toEqual(["espada", "elmo", "cajado"]);
    expect(applyLootView(items, { ...NO_VIEW, category: "material" }, ctx).map((d) => d.id)).toEqual(["osso"]);
    // Vocação: o que o cavaleiro usa (sem restrição conta); a Fada usa o que é de druida.
    expect(applyLootView(items, { ...NO_VIEW, vocation: "knight" }, ctx).map((d) => d.id)).toEqual(["osso", "pocao", "espada", "elmo"]);
    expect(applyLootView(items, { ...NO_VIEW, vocation: "fairy" }, ctx).map((d) => d.id)).toEqual(["osso", "elmo", "cajado"]);
    // Level: só filtra quem tem level; "mine" = até o meu (50); faixa 51–80 pega a espada (60), não o bastão (90).
    expect(applyLootView(items, { ...NO_VIEW, level: "mine" }, ctx).map((d) => d.id)).toEqual(["osso", "pocao", "elmo"]);
    expect(applyLootView(items, { ...NO_VIEW, level: 2 }, ctx).map((d) => d.id)).toEqual(["osso", "espada"]);
    expect(applyLootView(items, { ...NO_VIEW, level: 3 }, ctx).map((d) => d.id)).toEqual(["osso", "cajado"]);
    // Zona: cai de monstro que nasce lá.
    expect(applyLootView(items, { ...NO_VIEW, zone: "Vulcão" }, ctx).map((d) => d.id)).toEqual(["osso", "espada"]);
    expect(applyLootView(items, { ...NO_VIEW, zone: "Vila", category: "gear" }, ctx).map((d) => d.id)).toEqual(["espada"]);
    // Combinação com a busca.
    expect(applyLootView(items, { ...NO_VIEW, query: "es", vocation: "druid" }, ctx).map((d) => d.id)).toEqual([]);
    expect(applyLootView(items, { ...NO_VIEW, query: "bast", vocation: "druid" }, ctx).map((d) => d.id)).toEqual(["cajado"]);
  });
});

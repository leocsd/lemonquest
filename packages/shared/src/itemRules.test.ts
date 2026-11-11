import { describe, expect, it } from "vitest";
import { blendFood, levelNeeded, pickQuickPotion, potionAmount, stackTarget } from "./itemRules.ts";
import { FOOD_MAX_MS, ITEMS, itemDef, type ItemDef, type ItemInstance, type Rarity } from "./data/items.ts";

const inst = (defId: string, count = 1, rarity: Rarity = "common") => ({ uid: defId + count, defId, count, rarity, bonuses: [] }) as ItemInstance;

describe("level dos usáveis", () => {
  it("poções e comidas do catálogo com level pedem esse level; sem level, qualquer um usa", () => {
    expect(levelNeeded(itemDef("health_potion_large"), 1)).toBe(30);
    expect(levelNeeded(itemDef("health_potion_large"), 29)).toBe(30);
    expect(levelNeeded(itemDef("health_potion_large"), 30)).toBe(0);
    expect(levelNeeded(itemDef("dragon_ham"), 10)).toBe(30);
    expect(levelNeeded(itemDef("meat"), 1)).toBe(0);
    expect(levelNeeded(undefined, 1)).toBe(0);
  });

  it("comida e baú não contam como poção para as teclas Q/E", () => {
    expect(potionAmount(itemDef("health_potion_medium"), "hp")).toBe(180);
    expect(potionAmount(itemDef("health_potion_medium"), "mana")).toBe(0);
    expect(potionAmount(itemDef("meat"), "hp")).toBe(0);
    expect(potionAmount(itemDef("bounty_chest"), "hp")).toBe(0);
  });
});

describe("poção das teclas Q/E", () => {
  const bp = [inst("health_potion_large"), inst("meat"), inst("health_potion"), inst("mana_potion_medium"), null, inst("health_potion_medium")];

  it("a melhor que o level permite (não a primeira da mochila)", () => {
    expect(pickQuickPotion(bp, "hp", 1, itemDef)).toEqual({ index: 2, needLevel: 0 });
    expect(pickQuickPotion(bp, "hp", 15, itemDef)).toEqual({ index: 5, needLevel: 0 });
    expect(pickQuickPotion(bp, "hp", 30, itemDef)).toEqual({ index: 0, needLevel: 0 });
    expect(pickQuickPotion(bp, "mana", 15, itemDef)).toEqual({ index: 3, needLevel: 0 });
  });

  it("nenhuma permitida: diz o menor level que destrava; nenhuma na mochila: needLevel 0", () => {
    expect(pickQuickPotion(bp, "mana", 1, itemDef)).toEqual({ index: -1, needLevel: 15 });
    expect(pickQuickPotion([inst("health_potion_large"), inst("health_potion_medium")], "hp", 1, itemDef)).toEqual({ index: -1, needLevel: 15 });
    expect(pickQuickPotion([inst("meat"), null], "hp", 50, itemDef)).toEqual({ index: -1, needLevel: 0 });
  });

  it("empate: a primeira da mochila", () => {
    expect(pickQuickPotion([inst("health_potion", 3), inst("health_potion", 5)], "hp", 1, itemDef).index).toBe(0);
  });

  it("todas as poções do catálogo, em todo level de 1 a 60: a escolhida é a de maior efeito com level ≤ o do jogador", () => {
    const potions = Object.values(ITEMS).filter((d) => potionAmount(d, "hp") > 0 || potionAmount(d, "mana") > 0);
    expect(potions.length).toBeGreaterThanOrEqual(6);
    const all = potions.map((d) => inst(d.id));
    for (const kind of ["hp", "mana"] as const) {
      for (let lv = 1; lv <= 60; lv++) {
        const allowed = potions.filter((d) => potionAmount(d, kind) > 0 && (d.level ?? 0) <= lv);
        const best = Math.max(0, ...allowed.map((d) => potionAmount(d, kind)));
        const r = pickQuickPotion(all, kind, lv, itemDef);
        expect(r.index >= 0 ? potionAmount(potions[r.index], kind) : 0).toBe(best);
        if (r.index >= 0) expect((potions[r.index]!.level ?? 0) <= lv).toBe(true);
      }
    }
  });
});

describe("clique rápido: onde guardar", () => {
  const pot = { id: "health_potion", stackable: true, maxStack: 20 } as ItemDef;
  const sword = { id: "short_sword", stackable: false } as ItemDef;

  it("primeira pilha igual com espaço; pilha cheia ou de outra raridade não conta; senão o primeiro vazio", () => {
    expect(stackTarget([inst("short_sword"), null, inst("health_potion", 7)], inst("health_potion", 5), pot)).toBe(2);
    expect(stackTarget([inst("health_potion", 20), null, inst("health_potion", 7)], inst("health_potion", 5), pot)).toBe(2);
    expect(stackTarget([inst("health_potion", 20), null], inst("health_potion", 5), pot)).toBe(1);
    expect(stackTarget([inst("health_potion", 3, "rare"), null], inst("health_potion", 5), pot)).toBe(1);
    expect(stackTarget([inst("short_sword"), null], inst("short_sword"), sword)).toBe(1);
  });

  it("cheio de verdade: -1 (sem vazio e sem pilha igual com espaço)", () => {
    expect(stackTarget([inst("short_sword"), inst("health_potion", 20)], inst("health_potion", 5), pot)).toBe(-1);
    expect(stackTarget([inst("short_sword"), inst("health_potion", 19)], inst("health_potion", 5), pot)).toBe(1);
  });
});

describe("comida em cima de comida", () => {
  const ham = { hpPerTick: 12, manaPerTick: 4, durationMs: 10 * 60_000 };
  const nuts = { hpPerTick: 1, manaPerTick: 1, durationMs: 3 * 60_000 };

  it("de estômago vazio: a taxa e a duração da própria comida", () => {
    expect(blendFood(undefined, ham, FOOD_MAX_MS)).toEqual({ remainingMs: 600_000, hpPerTick: 12, manaPerTick: 4 });
  });

  it("fraca em cima de forte baixa a taxa; forte em cima de fraca sobe, mas não até a forte", () => {
    const a = blendFood(undefined, ham, FOOD_MAX_MS);
    const weakOnStrong = blendFood(a, nuts, FOOD_MAX_MS);
    expect(weakOnStrong.remainingMs).toBe(13 * 60_000);
    expect(weakOnStrong.hpPerTick).toBeCloseTo((12 * 10 + 1 * 3) / 13, 3);
    expect(weakOnStrong.hpPerTick).toBeLessThan(12);
    const n = blendFood(undefined, nuts, FOOD_MAX_MS);
    const strongOnWeak = blendFood(n, ham, FOOD_MAX_MS);
    expect(strongOnWeak.hpPerTick).toBeCloseTo((1 * 3 + 12 * 10) / 13, 3);
    expect(strongOnWeak.hpPerTick).toBeLessThan(12);
    expect(strongOnWeak.manaPerTick).toBeCloseTo((1 * 3 + 4 * 10) / 13, 3);
  });

  it("a mesma comida repetida mantém a taxa exata", () => {
    let f = blendFood(undefined, ham, FOOD_MAX_MS);
    f = blendFood({ ...f, remainingMs: f.remainingMs - 60_000 }, ham, FOOD_MAX_MS);
    expect([f.hpPerTick, f.manaPerTick]).toEqual([12, 4]);
  });

  it("teto de duração: só conta o pedaço da nova que coube; a regeneração total nunca passa da soma das comidas", () => {
    const a = blendFood(undefined, ham, FOOD_MAX_MS);
    const b = blendFood({ ...a, remainingMs: 15 * 60_000 }, ham, FOOD_MAX_MS);
    expect(b.remainingMs).toBe(FOOD_MAX_MS);
    // Presunto + 20 nozes: o total de vida é o do presunto + o das nozes que couberam no teto, nunca o presunto por 20 min.
    let f = blendFood(undefined, ham, FOOD_MAX_MS);
    let budget = ham.hpPerTick * ham.durationMs;
    for (let i = 0; i < 20; i++) {
      const before = f.remainingMs;
      f = blendFood(f, nuts, FOOD_MAX_MS);
      budget += nuts.hpPerTick * (f.remainingMs - before);
    }
    expect(f.remainingMs).toBe(FOOD_MAX_MS);
    expect(f.hpPerTick * f.remainingMs).toBeCloseTo(budget, -4);
    expect(f.hpPerTick).toBeLessThan(7); // antes: 12 por 20 min
  });
});

import { describe, expect, it } from "vitest";
import { ITEMS, itemDef, type ItemDef, type ItemInstance } from "./items.ts";
import {
  REFINE_BASE_GOLD, REFINE_FAIL_CHANCE, REFINE_MATERIAL, REFINE_MAX, REFINE_TIER_LEVEL, REFINE_TIERS, instanceStats, isRefinable, refineBlock, refineBonus,
  refineCost, refineExpectedGold, refineLevel, refineSuffix, refineTier, refinedName,
} from "./refine.ts";

const inst = (defId: string, refine?: number, bonuses: ItemInstance["bonuses"] = []): ItemInstance =>
  ({ uid: "u", defId, count: 1, rarity: "rare", bonuses, ...(refine === undefined ? {} : { refine }) });

describe("refino: o que pode ser refinado", () => {
  it("tier pelo level do item: 35 → 5, 50 → 6, 70 → 7, 100 → 8 (peças fora da tabela caem no tier certo)", () => {
    expect(REFINE_TIER_LEVEL).toEqual({ 5: 35, 6: 50, 7: 70, 8: 100 });
    expect(refineTier(itemDef("mithril_katana"))).toBe(5);
    expect(refineTier(itemDef("capacete_lanterna"))).toBe(5); // lv 35, recompensa da Malha
    expect(refineTier(itemDef("botina_seguranca"))).toBe(5);  // lv 45
    expect(refineTier(itemDef("fire_sword"))).toBe(6);
    expect(refineTier(itemDef("boots_haste"))).toBe(6);       // lv 50, armadura 1
    expect(refineTier(itemDef("demon_axe"))).toBe(7);
    expect(refineTier(itemDef("stonecutter_axe"))).toBe(8);
  });

  it("abaixo do tier 5, anel, amuleto, livro de magia e item sem nada para refinar: não", () => {
    for (const id of ["steel_blade", "colete_refletivo", "ring_dragon", "amulet_orshabaal", "spellbook_archmage", "spellbook_ferumbras", "gem_green", "health_potion"]) {
      expect(isRefinable(itemDef(id)), id).toBe(false);
      expect(refineBlock(itemDef(id)), id).toBeTruthy();
    }
    expect(refineBlock(undefined)).toBeTruthy();
    // Escudo do cavaleiro e manto dos magos refinam (o livro, não).
    expect(isRefinable(itemDef("mithril_shield"))).toBe(true);
    expect(isRefinable(itemDef("archmage_armor"))).toBe(true);
  });

  it("todo equipável de tier 5+ com ataque/armadura é refinável, menos anéis, amuletos e livros", () => {
    const eligible = Object.values(ITEMS).filter((d) => isRefinable(d));
    expect(eligible.length).toBeGreaterThan(30);
    for (const d of eligible) {
      expect(d.level!).toBeGreaterThanOrEqual(35);
      expect(["ring", "amulet"]).not.toContain(d.slot);
      expect(d.slot === "weapon" ? d.stats!.attack! : d.stats!.armor!).toBeGreaterThan(0);
    }
  });

  it("nível válido é inteiro 1..5 em item refinável; o resto vira 0", () => {
    const k = itemDef("mithril_katana");
    expect([1, 3, 5].map((n) => refineLevel(k, n))).toEqual([1, 3, 5]);
    expect([0, 6, -1, 2.5, "3", null, undefined, NaN].map((n) => refineLevel(k, n))).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(refineLevel(itemDef("ring_dragon"), 3)).toBe(0);
  });
});

describe("refino: custo e chance", () => {
  it("chance de falha 0/10/25/40/50% pelo nível alvo", () => {
    const k = itemDef("mithril_katana");
    expect([1, 2, 3, 4, 5].map((t) => refineCost(k, t)!.failChance)).toEqual([0, 0.1, 0.25, 0.4, 0.5]);
    expect(REFINE_FAIL_CHANCE).toHaveLength(REFINE_MAX);
  });

  it("ouro por tentativa: tier 5 de 3 a 18 mil, tier 8 de 25 a 150 mil; gema do tier", () => {
    const gold = (id: string) => [1, 2, 3, 4, 5].map((t) => refineCost(itemDef(id), t)!.gold);
    expect(gold("mithril_katana")).toEqual([3000, 6000, 9000, 12000, 18000]);
    expect(gold("fire_sword")).toEqual([6000, 12000, 18000, 24000, 36000]);
    expect(gold("demon_axe")).toEqual([12000, 24000, 36000, 48000, 72000]);
    expect(gold("stonecutter_axe")).toEqual([25000, 50000, 75000, 100000, 150000]);
    expect(REFINE_TIERS.map((t) => REFINE_MATERIAL[t])).toEqual(["gem_green", "gem_yellow", "gem_purple", "abyss_shard"]);
    expect(refineCost(itemDef("mithril_katana"), 1)).toMatchObject({ materialId: "gem_green", materialCount: 1, target: 1 });
    // Mais caro a cada tier e a cada nível.
    for (const t of REFINE_TIERS.slice(1)) expect(REFINE_BASE_GOLD[t]).toBeGreaterThan(REFINE_BASE_GOLD[(t - 1) as 5 | 6 | 7]);
  });

  it("gemas e fragmento existem no catálogo e são materiais empilháveis", () => {
    for (const t of REFINE_TIERS) {
      const d = itemDef(REFINE_MATERIAL[t]);
      expect(d, REFINE_MATERIAL[t]).toBeDefined();
      expect([d!.kind, d!.stackable]).toEqual(["material", true]);
    }
  });

  it("fora da faixa ou não refinável: sem custo", () => {
    const k = itemDef("mithril_katana");
    expect(refineCost(k, 0)).toBeNull();
    expect(refineCost(k, 6)).toBeNull();
    expect(refineCost(itemDef("ring_dragon"), 1)).toBeNull();
  });

  it("meta do plano: as 4 peças abissais de +0 a +5 custam ~2,5 milhões em média (falhas incluídas)", () => {
    const set = 4 * refineExpectedGold(8);
    expect(set).toBeGreaterThan(2_300_000);
    expect(set).toBeLessThan(2_800_000);
    // Um item tier 5 em +5: ~78 mil, perto do dobro do valor da própria Katana de Mithril (38 mil).
    expect(Math.round(refineExpectedGold(5))).toBe(77_667);
    expect(refineExpectedGold(5, 1)).toBe(3000); // +1 nunca falha
  });
});

describe("refino: atributos (instanceStats, a conta única)", () => {
  it("arma: +3 de ataque por nível; armadura: +1 por nível; somados à definição e aos bônus da raridade", () => {
    const k = itemDef("mithril_katana")!;
    expect(instanceStats(k, inst("mithril_katana"))).toEqual({ attack: 70, melee: 2, crit: 2 });
    expect(instanceStats(k, inst("mithril_katana", 5, [{ stat: "attack", value: 4 }]))).toEqual({ attack: 89, melee: 2, crit: 2 });
    const a = itemDef("mithril_armor")!;
    expect(instanceStats(a, inst("mithril_armor", 3))).toEqual({ armor: 8, hpMax: 60 });
    expect(refineBonus(itemDef("boots_haste"), 2)).toEqual({ armor: 2 });
  });

  it("refino inválido (ou em item não refinável) não soma nada", () => {
    const r = itemDef("ring_dragon")!;
    expect(instanceStats(r, inst("ring_dragon", 4))).toEqual(r.stats);
    expect(instanceStats(itemDef("mithril_katana"), inst("mithril_katana", 9))).toEqual({ attack: 70, melee: 2, crit: 2 });
    expect(instanceStats(undefined, inst("x", 2, [{ stat: "hpMax", value: 5 }]))).toEqual({ hpMax: 5 });
  });

  it("nome com o refino", () => {
    const k = itemDef("mithril_katana") as ItemDef;
    expect(refinedName(k, inst("mithril_katana", 3))).toBe("Katana de Mithril +3");
    expect(refinedName(k, inst("mithril_katana"))).toBe("Katana de Mithril");
    expect(refinedName(undefined, inst("sumiu", 2))).toBe("sumiu +2");
    expect([refineSuffix(0), refineSuffix(undefined), refineSuffix(4)]).toEqual(["", "", " +4"]);
  });
});

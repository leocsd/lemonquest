import { describe, expect, it } from "vitest";
import type { ItemDef, ItemInstance } from "@lemonquest/shared";
import { autoAttackRange, itemDef } from "@lemonquest/shared";
import { canEquip, compareStats, fmtStat, sellPrice, statLines, totalStats, useText, weaponDamage } from "./itemInfo.ts";

const sword: ItemDef = { id: "s", name: "Espada", kind: "weapon", slot: "weapon", icon: { url: "x.png" }, value: 100, stats: { attack: 10 }, level: 5, vocations: ["knight"] };
const better: ItemDef = { ...sword, id: "s2", stats: { attack: 12, armor: 1 } };
const inst = (defId: string, bonuses: ItemInstance["bonuses"] = []): ItemInstance => ({ uid: defId, defId, count: 1, rarity: "rare", bonuses });

describe("itemInfo", () => {
  it("soma base e bônus", () => {
    expect(totalStats(sword, inst("s", [{ stat: "attack", value: 2 }, { stat: "crit", value: 3 }]))).toEqual({ attack: 12, crit: 3 });
    const l = statLines(sword, inst("s", [{ stat: "attack", value: 2 }]));
    expect(l[0]).toMatchObject({ stat: "attack", total: 12, base: 10, bonus: 2 });
  });
  it("refino entra no total e aparece separado do bônus da raridade (mesma conta do servidor)", () => {
    const katana = itemDef("mithril_katana")!;
    const it = { ...inst("mithril_katana", [{ stat: "attack", value: 2 }]), refine: 3 };
    expect(statLines(katana, it)[0]).toMatchObject({ stat: "attack", total: 81, base: 70, bonus: 2, refine: 9 });
    expect(compareStats(katana, it, katana, inst("mithril_katana"))).toEqual([{ stat: "attack", label: "Ataque", delta: 11 }]);
  });
  it("compara com o equipado", () => {
    expect(compareStats(better, inst("s2"), sword, inst("s"))).toEqual([
      { stat: "attack", label: "Ataque", delta: 2 }, { stat: "armor", label: "Armadura", delta: 1 },
    ]);
  });
  it("formata percentuais", () => {
    expect(fmtStat("speed", 5)).toBe("+5%");
    expect(fmtStat("armor", -2)).toBe("−2");
  });
  it("valida equipar", () => {
    const get = (id: string) => (id === "s" ? sword : undefined);
    expect(canEquip(sword, "weapon", { level: 5, vocation: "knight" }, {}, get)).toEqual({ ok: true });
    expect(canEquip(sword, "weapon", { level: 4, vocation: "knight" }, {}, get)).toEqual({ ok: false, reason: "level" });
    expect(canEquip(sword, "weapon", { level: 9, vocation: "druid" }, {}, get)).toEqual({ ok: false, reason: "vocation" });
    expect(canEquip(sword, "shield", { level: 9, vocation: "knight" }, {}, get)).toEqual({ ok: false, reason: "slot" });
  });
  it("preço de venda", () => {
    expect(sellPrice(sword, 0.3)).toBe(30);
    expect(sellPrice({ ...sword, value: 1 }, 0.3)).toBe(1);
    expect(sellPrice(sword, 0.3, "rare")).toBe(75);
  });
});

describe("useText", () => {
  it("describes food as regen over time", () => {
    const food: ItemDef = { id: "f", name: "Bife", kind: "food", icon: { url: "x.png" }, value: 1, use: { food: { hpPerTick: 6, manaPerTick: 1, durationMs: 360_000 }, cooldownMs: 1000 } };
    expect(useText(food)).toBe("Recupera +6 vida e +1 mana a cada 2 s por 6 min");
  });
});

describe("itemInfo: dano da arma no balão", () => {
  const me = { vocation: "knight" as const, level: 20, skillMelee: 25, skillDistance: 10, magicLevel: 0 };
  const mk = (defId: string): ItemInstance => ({ uid: defId, defId, count: 1, rarity: "common", bonuses: [] });

  it("mesma conta do servidor: com a arma candidata vs. a equipada; arma fraca = igual ao punho", () => {
    const eq = { weapon: mk("short_sword") };
    const d = weaponDamage(itemDef("longsword"), mk("longsword"), me, eq, itemDef)!;
    const skills = { melee: 25, distance: 10, magic: 0 };
    expect(d.with).toEqual(autoAttackRange("knight", 20, skills, itemDef("longsword"), (s) => (s === "attack" ? itemDef("longsword")!.stats!.attack! : 0)));
    expect(d.now).toEqual(autoAttackRange("knight", 20, skills, itemDef("short_sword"), (s) => (s === "attack" ? itemDef("short_sword")!.stats!.attack! : 0)));
    expect(d.with[0] + d.with[1]).toBeGreaterThan(d.now[0] + d.now[1]);
    expect(d.likeFists).toBe(false);
    // Espada Curta no level 60: não supera o punho.
    const weak = weaponDamage(itemDef("short_sword"), mk("short_sword"), { ...me, level: 60 }, {}, itemDef)!;
    expect(weak.likeFists).toBe(true);
    expect(weak.with).toEqual(weak.now); // sem arma equipada, "agora" é o punho
  });

  it("só para armas da vocação do jogador", () => {
    expect(weaponDamage(itemDef("short_bow"), mk("short_bow"), me, {}, itemDef)).toBeNull();
    expect(weaponDamage(itemDef("leather_helmet"), mk("leather_helmet"), me, {}, itemDef)).toBeNull();
    expect(weaponDamage(itemDef("short_bow"), mk("short_bow"), { ...me, vocation: "paladin" }, {}, itemDef)).not.toBeNull();
  });
});

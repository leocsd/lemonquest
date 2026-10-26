/// <reference types="node" />
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ABYSS_ITEM_IDS, ABYSS_TINT, BOW_ATTACK_MULT, GEAR_SHAPES, GEAR_TIERS, HEALTH_POTION_CD_MS, MANA_POTION_CD_MS, MATERIAL_ICONS, ITEMS, TIER_LEVEL,
  gearFrame, isEquipable, isExclusiveItem, type ItemDef,
} from "./items.ts";
import { MONSTERS } from "./monsters.ts";
import { NPCS } from "./npcs.ts";
import { QUEST_CHESTS } from "./questWorld.ts";
import { playerDamageRange } from "../formulas.ts";
import { VOCATIONS, type Vocation } from "../types.ts";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const gear = JSON.parse(readFileSync(root + "assets/icons/gear.json", "utf8")) as { count: number; frames: Record<string, number> };
const mats = JSON.parse(readFileSync(root + "assets/icons/materials.json", "utf8")) as { count: number; frames: Record<string, number> };
const all = Object.values(ITEMS);
const weapons = all.filter((d) => d.kind === "weapon");

describe("ITEMS", () => {
  it("ids batem com as chaves", () => {
    for (const [k, d] of Object.entries(ITEMS)) expect(d.id).toBe(k);
    expect(all.length).toBeGreaterThanOrEqual(60);
  });

  it("frames do atlas de equipamento batem com gear.json", () => {
    for (const s of GEAR_SHAPES) for (const t of GEAR_TIERS) expect(gearFrame(s, t), `${s}_${t}`).toBe(gear.frames[`${s}_${t}`]);
    for (const t of GEAR_TIERS) {
      expect(gearFrame("ring", t)).toBe(gear.frames[`ring_${t}`]);
      expect(gearFrame("amulet", t)).toBe(gear.frames[`amulet_${t}`]);
    }
  });

  it("ícones existem em disco e frames estão dentro do atlas", () => {
    for (const d of all) {
      expect(existsSync(root + "assets/" + d.icon.url), `${d.id}: ${d.icon.url}`).toBe(true);
      const atlased = d.icon.url === "icons/gear.png" || d.icon.url === "icons/materials.png";
      // Outras folhas com frame (ex.: baú de 2 quadros): frame 0, 16x16.
      if (d.icon.frame !== undefined && !atlased) {
        expect(d.icon.frame, d.id).toBe(0);
        expect([d.icon.frameWidth, d.icon.frameHeight], d.id).toEqual([16, 16]);
      } else if (d.icon.frame !== undefined) {
        const atlas = d.icon.url === "icons/gear.png" ? gear : mats;
        expect(d.icon.frame, d.id).toBeGreaterThanOrEqual(0);
        expect(d.icon.frame, d.id).toBeLessThan(atlas.count);
        expect(d.icon.frameWidth).toBe(16);
        expect(d.icon.frameHeight).toBe(16);
      }
    }
  });

  it("equipáveis têm slot compatível com o kind", () => {
    const slotKinds = new Set(["weapon", "shield", "helmet", "armor", "legs", "boots", "ring", "amulet"]);
    for (const d of all) {
      if (slotKinds.has(d.kind)) { expect(d.slot, d.id).toBe(d.kind); expect(isEquipable(d)).toBe(true); expect(d.stats, d.id).toBeDefined(); }
      else expect(d.slot, d.id).toBeUndefined();
    }
  });

  it("armas têm range, damageKind, weaponType e attack", () => {
    for (const d of weapons) {
      expect(d.range, d.id).toBeGreaterThanOrEqual(1);
      expect(d.damageKind, d.id).toBeDefined();
      expect(d.weaponType, d.id).toBeDefined();
      expect(d.stats?.attack, d.id).toBeGreaterThan(0);
      expect(d.vocations?.length, d.id).toBe(1);
    }
    for (const d of weapons.filter((w) => w.weaponType === "bow")) { expect(d.range).toBe(6); expect(d.damageKind).toBe("physical"); }
    for (const d of weapons.filter((w) => w.weaponType === "wand" || w.weaponType === "rod")) expect(d.range).toBe(4);
    for (const d of weapons.filter((w) => w.weaponType === "sword" || w.weaponType === "axe" || w.weaponType === "club")) expect(d.range).toBe(1);
  });

  it("arcos do paladino: +15 % de ataque do tier 2 em diante (GD-05), sem passar a melhor arma do cavaleiro no mesmo level", () => {
    expect(BOW_ATTACK_MULT).toBe(1.15);
    // Tabela original 9/19/32/46/62/80/100 (corsário 66), arredondada para cima; o arco inicial fica em 9 (ver items.ts).
    const expected = { short_bow: 9, hunting_bow: 22, long_bow: 37, composite_bow: 53, elven_bow: 72, royal_crossbow: 92, celestial_bow: 115, corsair_bow: 76 };
    for (const [id, attack] of Object.entries(expected)) expect(ITEMS[id]!.stats!.attack, id).toBe(attack);
    const knightBest = (level: number) => Math.max(...weapons.filter((w) => w.vocations![0] === "knight" && w.level === level).map((w) => w.stats!.attack!));
    for (const b of weapons.filter((w) => w.weaponType === "bow")) expect(b.stats!.attack!, b.id).toBeLessThan(knightBest(b.level!));
  });

  it("empilháveis têm maxStack sensato; poções têm uso", () => {
    for (const d of all) {
      if (d.stackable) expect(d.maxStack ?? 100, d.id).toBeGreaterThanOrEqual(1);
      else expect(d.maxStack, d.id).toBeUndefined();
      if (d.kind === "potion") { expect(d.stackable).toBe(true); expect(d.use?.heal || d.use?.mana, d.id).toBeTruthy(); }
      if (!d.stackable) expect(["weapon", "shield", "helmet", "armor", "legs", "boots", "ring", "amulet", "key", "quest"]).toContain(d.kind);
    }
  });

  it("preços sensatos", () => {
    for (const d of all) {
      expect(Number.isInteger(d.value), d.id).toBe(true);
      expect(d.value, d.id).toBeGreaterThanOrEqual(0);
      if (d.kind !== "key" && d.kind !== "quest") expect(d.value, d.id).toBeGreaterThan(0);
      if (d.level !== undefined) expect(d.level).toBeGreaterThanOrEqual(1);
    }
    expect(ITEMS.health_potion!.value).toBe(40);
    // Preço cresce com o level dentro do mesmo tipo de arma/vocação.
    for (const voc of VOCATIONS) {
      const ws = weapons.filter((w) => w.vocations![0] === voc);
      for (const w of ws) for (const o of ws.filter((x) => x.level! < w.level!)) expect(w.value, `${voc} ${w.id} vs ${o.id}`).toBeGreaterThan(o.value);
    }
  });

  it("loot de monstros referencia itens existentes", () => {
    for (const m of Object.values(MONSTERS)) {
      if (m.invulnerable) { expect(m.loot).toBeUndefined(); expect(m.gold).toBeUndefined(); continue; } // boneco de treino
      if (m.id.startsWith("summoned_")) { expect(m.loot).toBeUndefined(); continue; }
      expect(m.gold, m.id).toBeDefined();
      expect(m.gold![0]).toBeLessThanOrEqual(m.gold![1]);
      expect(m.loot?.length, m.id).toBeGreaterThan(0);
      for (const e of m.loot!) {
        expect(ITEMS[e.itemId], `${m.id} -> ${e.itemId}`).toBeDefined();
        expect(e.chance).toBeGreaterThan(0);
        expect(e.chance).toBeLessThanOrEqual(1);
        if (e.min !== undefined || e.max !== undefined) expect(e.min!).toBeLessThanOrEqual(e.max!);
      }
      if (m.boss) for (const id of ["crypt_key", "goblin_crown"]) void id;
    }
    expect(MONSTERS.swamp_lich!.loot!.some((e) => e.itemId === "crypt_key" && e.chance === 1)).toBe(true);
  });

  it("ouro dos monstros cresce com o level", () => {
    // Por faixa de 10 levels (média do ouro máximo) e sem passar de nenhum monstro 20+ levels acima. Monotônico um a um
    // não vale mais: Selva e Piratas pagam mais ouro que ghost/homem-lagarto da mesma faixa (o loot deles é mais pobre).
    const ms = Object.values(MONSTERS).filter((m) => !m.boss && m.gold).sort((a, b) => a.level - b.level);
    const bands = new Map<number, number[]>();
    for (const m of ms) bands.set(Math.floor(m.level / 10), [...(bands.get(Math.floor(m.level / 10)) ?? []), m.gold![1]]);
    const avg = [...bands.entries()].sort((a, b) => a[0] - b[0]).map(([, g]) => g.reduce((x, y) => x + y, 0) / g.length);
    for (let i = 1; i < avg.length; i++) expect(avg[i], `faixa ${i}`).toBeGreaterThanOrEqual(avg[i - 1]!);
    for (const m of ms) for (const n of ms) if (n.level >= m.level + 20) expect(n.gold![1], `${n.id} vs ${m.id}`).toBeGreaterThanOrEqual(m.gold![1]);
  });

  it("toda vocação tem arma de level 1 e de ~level 8", () => {
    for (const voc of VOCATIONS) {
      const ws = weapons.filter((w) => w.vocations!.includes(voc));
      expect(ws.some((w) => w.level === 1), voc).toBe(true);
      expect(ws.some((w) => w.level! >= 6 && w.level! <= 10), voc).toBe(true);
    }
  });

  it("dano médio da arma (skill 10) >= dano desarmado da vocação no level exigido", () => {
    const rows: Record<string, string | number>[] = [];
    for (const w of weapons.sort((a, b) => a.level! - b.level!)) {
      const voc = w.vocations![0] as Vocation;
      const [lo, hi] = playerDamageRange(voc, w.level!);
      const unarmed = (lo + hi) / 2;
      const weaponAvg = w.stats!.attack! + w.level! * 0.3;
      rows.push({ item: w.id, voc, lv: w.level!, attack: w.stats!.attack!, weaponAvg: +weaponAvg.toFixed(1), unarmed, ratio: +(weaponAvg / unarmed).toFixed(2) });
      expect(weaponAvg, w.id).toBeGreaterThanOrEqual(unarmed);
    }
    console.table(rows);
  });

  it("armadura total por tier fica em ~25-35% do dano médio dos monstros da zona", () => {
    const sum = (prefix: string, slots: string[]) => slots.reduce((s, sl) => s + (ITEMS[`${prefix}_${sl}`]?.stats?.armor ?? 0), 0);
    const melee = ["helmet", "armor", "legs", "boots", "shield"];
    const zoneAvg = (names: string[]) => names.reduce((s, n) => { const m = MONSTERS[n]!; return s + (m.damage[0] + m.damage[1]) / 2; }, 0) / names.length;
    const tiers: [string, number, string[]][] = [
      ["leather", 3, ["rat", "slime", "bee"]], ["bronze", 5, ["wolf", "snake"]], ["iron", 7, ["spider", "bat"]],
      ["steel", 10, ["skeleton", "goblin"]], ["mithril", 14, ["ghost", "lizardman", "flame_spirit"]],
    ];
    const rows = tiers.map(([p, total, ms]) => {
      const a = sum(p, melee), avg = zoneAvg(ms);
      expect(a, p).toBe(total);
      return { set: p, armor: a, zoneAvgDmg: +avg.toFixed(1), pct: Math.round((a / avg) * 100) };
    });
    console.table(rows);
    for (const r of rows.slice(1)) { expect(r.pct).toBeGreaterThanOrEqual(22); expect(r.pct).toBeLessThanOrEqual(40); }
  });

  it("economia: ouro+loot esperado por abate em lv 1-10 paga uma arma tier 2 em ~20-30 min", () => {
    const sellRate = 0.3;
    const ev = (id: string) => {
      const m = MONSTERS[id]!;
      const gold = (m.gold![0] + m.gold![1]) / 2;
      const loot = m.loot!.reduce((s, e) => { const d = ITEMS[e.itemId]!; const q = ((e.min ?? 1) + (e.max ?? 1)) / 2; return s + (d.kind === "material" || d.kind === "food" ? d.value * sellRate * e.chance * q : 0); }, 0);
      return gold + loot;
    };
    const mix = ["rat", "slime", "bee", "wolf"];
    const perKill = mix.reduce((s, id) => s + ev(id), 0) / mix.length;
    const killsPerMin = 3;
    const target = ITEMS.longsword!.value;
    const minutes = target / (perKill * killsPerMin);
    console.table({ perKill: +perKill.toFixed(1), killsPerMin, target, minutes: +minutes.toFixed(1) });
    expect(minutes).toBeGreaterThan(10);
    expect(minutes).toBeLessThan(40);
  });
});

describe("uso dos itens por vocação", () => {
  it("cada vocação tem conjunto equipável de tier 1 (compartilhado)", () => {
    for (const d of all.filter((x) => x.id.startsWith("leather_"))) expect(d.vocations).toBeUndefined();
  });
  it("itens de dois-mãos são armas", () => {
    for (const d of all.filter((x: ItemDef) => x.twoHanded)) expect(d.kind).toBe("weapon");
  });
});

describe("ícones de materiais", () => {
  it("MATERIAL_ICONS bate com materials.json e cada material usa seu frame", () => {
    MATERIAL_ICONS.forEach((n, i) => expect(mats.frames[n], n).toBe(i));
    for (const n of MATERIAL_ICONS) expect(ITEMS[n]?.icon.frame, n).toBe(mats.frames[n]);
  });
});

describe("cobertura de armaduras", () => {
  it("cada vocação tem elmo, armadura, calças e botas próprios (ou gerais) em todos os tiers (lv 1/8/15/25/35)", () => {
    const fits = (d: ItemDef, v: Vocation) => !d.vocations || d.vocations.includes(v);
    for (const v of VOCATIONS) {
      for (const level of [1, 8, 15, 25, 35]) {
        for (const slot of ["helmet", "armor", "legs", "boots"] as const) {
          expect(all.some((d) => d.slot === slot && d.level === level && fits(d, v)), `${v} ${slot} lv ${level}`).toBe(true);
        }
      }
    }
  });
});

describe("livros de magia (escudo dos magos)", () => {
  it("um por tier 2-8, só magos; menos armadura que o escudo do cavaleiro, mais mana a cada tier, mesmo valor", () => {
    const books = all.filter((d) => d.slot === "shield" && d.vocations?.includes("sorcerer")).sort((a, b) => a.level! - b.level!);
    const knight = all.filter((d) => d.slot === "shield" && d.vocations?.includes("knight"));
    expect(books.map((b) => b.level)).toEqual([8, 15, 25, 35, 50, 70, 100]);
    for (const [i, b] of books.entries()) {
      expect(b.vocations).toEqual(["sorcerer", "druid"]);
      const k = knight.find((s) => s.level === b.level)!;
      expect(b.stats!.armor!, b.id).toBeLessThanOrEqual(k.stats!.armor!);
      expect(b.value, b.id).toBe(k.value);
      if (i > 0) expect(b.stats!.manaMax!, b.id).toBeGreaterThan(books[i - 1]!.stats!.manaMax!);
    }
    expect(ITEMS.spellbook_ferumbras!.stats).toEqual({ armor: 3, manaMax: 180, magic: 2 });
  });
});

describe("ciclo 8: recarga das poções", () => {
  it("vida 2 s, mana 1 s (o temporizador é um só para qualquer poção)", () => {
    for (const it of Object.values(ITEMS)) {
      if (it.kind !== "potion") continue;
      expect(it.use!.cooldownMs, it.id).toBe(it.use!.heal ? HEALTH_POTION_CD_MS : MANA_POTION_CD_MS);
    }
    expect([HEALTH_POTION_CD_MS, MANA_POTION_CD_MS]).toEqual([2000, 1000]);
    expect(ITEMS.health_potion_large!.use!.cooldownMs).toBe(2000);
  });
});

// ---------------------------------------------------------------------------
// Ciclo 16: botas dos tiers 6–7, itens únicos e tier 8 "Abissal"
// ---------------------------------------------------------------------------
const MAGES: Vocation[] = ["sorcerer", "druid"];
const fits = (d: ItemDef, v: Vocation) => !d.vocations || d.vocations.includes(v);
const sold = new Set(Object.values(NPCS).flatMap((n) => (n.shop?.sells ?? []).map((s) => s.itemId)));
const dropsOf = (id: string) => Object.values(MONSTERS).filter((m) => (m.loot ?? []).some((e) => e.itemId === id));
const chance = (monster: string, id: string) => MONSTERS[monster]?.loot?.find((e) => e.itemId === id)?.chance;

describe("ciclo 16: botas dos tiers 6 e 7", () => {
  const BOOTS: [string, number, Vocation[]][] = [
    ["crown_boots", 50, ["knight"]], ["demon_boots", 70, ["knight"]], ["royal_boots", 50, ["paladin"]],
    ["dragon_scale_boots", 70, ["paladin"]], ["mystic_boots", 50, MAGES], ["ferumbras_boots", 70, MAGES],
  ];

  it("uma por forma (cavaleiro, paladino, magos) em cada tier, abaixo do valor das Botas da Pressa", () => {
    const haste = ITEMS.boots_haste!;
    for (const [id, level, vocs] of BOOTS) {
      const d = ITEMS[id]!;
      expect(d, id).toBeDefined();
      expect([d.kind, d.slot, d.level, d.vocations], id).toEqual(["boots", "boots", level, vocs]);
      expect(d.value, id).toBeLessThan(haste.value);
      expect(d.stats!.speed!, id).toBeLessThan(haste.stats!.speed!);
      expect(d.stats!.armor!, id).toBeGreaterThanOrEqual(haste.stats!.armor!);
      expect(d.unique, id).toBeUndefined();
      // Fonte: monstro comum e a encomenda semanal da loja, como as outras peças dos tiers 6 e 7.
      expect(dropsOf(id).some((m) => !m.boss), id).toBe(true);
      expect(sold.has(id), id).toBe(true);
    }
    // O modelo de balanço (balanceKit.ts) escolhe o mais caro do slot: as Botas da Pressa continuam as escolhidas.
    for (const v of VOCATIONS) {
      const boots = all.filter((d) => d.slot === "boots" && fits(d, v));
      expect(Math.max(...boots.map((d) => d.value)), v).toBe(haste.value);
    }
  });

  it("valor e armadura crescem do tier 5 ao 7 em cada forma", () => {
    for (const [t5, t6, t7] of [["mithril_boots", "crown_boots", "demon_boots"], ["master_archer_boots", "royal_boots", "dragon_scale_boots"],
      ["archmage_boots", "mystic_boots", "ferumbras_boots"]]) {
      const [a, b, c] = [ITEMS[t5!]!, ITEMS[t6!]!, ITEMS[t7!]!];
      expect(a.value).toBeLessThan(b.value);
      expect(b.value).toBeLessThan(c.value);
      expect(b.stats!.speed!).toBeGreaterThan(a.stats!.speed!);
      expect(c.stats!.speed!).toBeGreaterThan(b.stats!.speed!);
      expect(c.stats!.armor!).toBeGreaterThanOrEqual(b.stats!.armor!);
    }
  });
});

describe("ciclo 16: itens únicos (Aniquilação)", () => {
  const uniques = all.filter((d) => d.unique);

  it("um por vocação, lv 100, 320 mil; só saem dos baús da Aniquilação (nem loja, nem monstro)", () => {
    expect(uniques.map((d) => d.id).sort()).toEqual(["annihilator_bow", "annihilator_rod", "annihilator_wand", "stonecutter_axe"]);
    expect(uniques.flatMap((d) => d.vocations!).sort()).toEqual([...VOCATIONS].sort());
    for (const d of uniques) {
      expect([d.kind, d.level, d.value], d.id).toEqual(["weapon", 100, 320000]);
      expect(isExclusiveItem(d), d.id).toBe(true);
      expect(sold.has(d.id), d.id).toBe(false);
      expect(dropsOf(d.id).map((m) => m.id), d.id).toEqual([]);
      // Melhor que a arma do tier 8 da vocação (é o prêmio da quest mais difícil).
      const t8 = ABYSS_ITEM_IDS.map((id) => ITEMS[id]!).find((w) => w.slot === "weapon" && w.vocations![0] === d.vocations![0])!;
      expect(d.stats!.attack!, d.id).toBeGreaterThan(t8.stats!.attack!);
    }
  });

  it("os 4 baús mantêm o id; cada um dá a arma única de uma vocação e o urso", () => {
    const anni = Object.values(QUEST_CHESTS).filter((c) => c.group === "annihilator");
    expect(anni.map((c) => c.id)).toEqual(["anni_armor", "anni_sword", "anni_axe", "anni_bear"]);
    const vocs = anni.map((c) => {
      const ids = c.items!.map((i) => i.itemId);
      expect(ids, c.id).toContain("annihilation_bear");
      const weapon = ids.map((id) => ITEMS[id]!).filter((d) => d.unique);
      expect(weapon, c.id).toHaveLength(1);
      expect(c.unlock, c.id).toBe("title:aniquilador");
      return weapon[0]!.vocations![0];
    });
    expect(vocs).toEqual(["knight", "paladin", "sorcerer", "druid"]);
    for (const d of uniques) expect(Object.values(QUEST_CHESTS).some((c) => c.items?.some((i) => i.itemId === d.id)), d.id).toBe(true);
  });
});

describe("ciclo 16: tier 8 \"Abissal\"", () => {
  const t8 = ABYSS_ITEM_IDS.map((id) => ITEMS[id]!);
  const COMMON = new Set(["abyss_tengu", "abyss_samurai"]);
  // O Shogun Abissal (`lair_shogun`) é criado pela frente dos covis: se ainda não existir, o teste segue sem ele.
  const BOSSES = new Set(["orshabaal", "ferumbras", "lair_shogun"]);
  // Ciclo 19: chefes finais das regiões (Siderúrgica; a Montadora entra no ciclo 20 com `mt_prototipo`) dão o tier 8 a
  // 5–8% por peça (plano), abaixo dos 10–12% dos chefes do Profundo. O teste não exige que existam.
  const REGION_FINAL_BOSSES = new Set(["fornalha_primordial", "mt_prototipo"]);

  it("13 peças de lv 100, ícone com o tint abissal, 110–300 mil", () => {
    expect(TIER_LEVEL).toEqual([1, 8, 15, 25, 35, 50, 70, 100]);
    expect(t8).toHaveLength(13);
    for (const d of t8) {
      expect(d.level, d.id).toBe(TIER_LEVEL[7]);
      expect(d.icon.tint, d.id).toBe(ABYSS_TINT);
      expect(d.value, d.id).toBeGreaterThanOrEqual(110_000);
      expect(d.value, d.id).toBeLessThanOrEqual(300_000);
      expect(isEquipable(d), d.id).toBe(true);
      expect(isExclusiveItem(d), d.id).toBe(true);
      expect(d.unique, d.id).toBeUndefined();
    }
  });

  it("por vocação: cavaleiro lâmina/elmo/armadura/escudo, paladino arco/elmo/couraça/grevas, magos arma/capuz/manto/grimório", () => {
    const slotsOf = (v: Vocation) => t8.filter((d) => fits(d, v)).map((d) => d.slot).sort();
    expect(slotsOf("knight")).toEqual(["armor", "helmet", "shield", "weapon"]);
    expect(slotsOf("paladin")).toEqual(["armor", "helmet", "legs", "weapon"]);
    for (const v of MAGES) expect(slotsOf(v), v).toEqual(["armor", "helmet", "shield", "weapon"]);
    const weapon = (v: Vocation) => t8.find((d) => d.slot === "weapon" && d.vocations![0] === v)!;
    expect(weapon("knight")).toMatchObject({ weaponType: "sword", stats: { attack: 160 } });
    expect(weapon("knight").twoHanded).toBeUndefined(); // lâmina de uma mão: o Escudo Abissal tem uso
    expect(weapon("paladin")).toMatchObject({ weaponType: "bow", stats: { attack: Math.ceil(125 * BOW_ATTACK_MULT) } });
    expect(weapon("paladin").stats!.attack).toBe(144);
    expect(weapon("sorcerer")).toMatchObject({ weaponType: "wand", damageKind: "death", stats: { attack: 105, magic: 6 } });
    expect(weapon("druid")).toMatchObject({ weaponType: "rod", damageKind: "earth", stats: { attack: 105, magic: 6 } });
    expect(ITEMS.spellbook_abyss).toMatchObject({ kind: "shield", vocations: MAGES });
  });

  it("coerente com a progressão do slot: acima da melhor peça do tier 7 da vocação em valor, armadura e ataque", () => {
    for (const d of t8) {
      for (const v of d.vocations!) {
        const t7 = all.filter((x) => x.slot === d.slot && x.level === TIER_LEVEL[6] && !x.unique && x.vocations && fits(x, v));
        expect(t7.length, `${d.id} ${v}`).toBeGreaterThan(0);
        for (const o of t7) {
          expect(d.value, `${d.id} vs ${o.id}`).toBeGreaterThan(o.value);
          if (d.slot === "weapon") expect(d.stats!.attack!, `${d.id} vs ${o.id}`).toBeGreaterThan(o.stats!.attack!);
          else expect(d.stats!.armor!, `${d.id} vs ${o.id}`).toBeGreaterThan(o.stats!.armor!);
        }
      }
    }
  });

  it("só cai do Profundo (0,15–0,3%), dos chefes listados (10–12%) e dos chefes finais de região (5–8%); toda peça tem fonte comum", () => {
    const ids = new Set(ABYSS_ITEM_IDS);
    for (const m of Object.values(MONSTERS)) {
      for (const e of m.loot ?? []) {
        if (!ids.has(e.itemId)) continue;
        const regionFinal = REGION_FINAL_BOSSES.has(m.id);
        expect(COMMON.has(m.id) || BOSSES.has(m.id) || regionFinal, `${m.id} -> ${e.itemId}`).toBe(true);
        expect(!!m.boss, m.id).toBe(BOSSES.has(m.id) || regionFinal);
        const [lo, hi] = regionFinal ? [0.05, 0.08] : m.boss ? [0.1, 0.12] : [0.0015, 0.003];
        expect(e.chance, `${m.id} -> ${e.itemId}`).toBeGreaterThanOrEqual(lo);
        expect(e.chance, `${m.id} -> ${e.itemId}`).toBeLessThanOrEqual(hi);
      }
    }
    for (const d of t8) expect(dropsOf(d.id).some((m) => COMMON.has(m.id)), d.id).toBe(true);
    for (const b of ["orshabaal", "ferumbras"]) expect(MONSTERS[b]!.loot!.some((e) => ids.has(e.itemId)), b).toBe(true);
    if (MONSTERS.lair_shogun) expect(MONSTERS.lair_shogun.loot!.some((e) => ids.has(e.itemId)), "lair_shogun").toBe(true);
    for (const b of REGION_FINAL_BOSSES) if (MONSTERS[b]) expect(MONSTERS[b].loot!.some((e) => ids.has(e.itemId)), b).toBe(true);
  });

  it("Fragmento Abissal: Tengu 25%, Samurai 30%, Orshabaal, Ferumbras e Shogun sempre", () => {
    expect(ITEMS.abyss_shard).toMatchObject({ kind: "material", stackable: true, name: "Fragmento Abissal" });
    expect([chance("abyss_tengu", "abyss_shard"), chance("abyss_samurai", "abyss_shard")]).toEqual([0.25, 0.3]);
    expect([chance("orshabaal", "abyss_shard"), chance("ferumbras", "abyss_shard")]).toEqual([1, 1]);
    if (MONSTERS.lair_shogun) expect(chance("lair_shogun", "abyss_shard")).toBe(1);
  });

  it("tier 8 e únicos nunca em loja", () => {
    for (const n of Object.values(NPCS)) {
      for (const e of n.shop?.sells ?? []) expect(isExclusiveItem(ITEMS[e.itemId]!), `${n.id} -> ${e.itemId}`).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Ciclo 19: Siderúrgica (docs/regioes/siderurgica.md §3.3–3.4)
// ---------------------------------------------------------------------------
describe("ciclo 19: Siderúrgica", () => {
  const MATS: [string, number][] = [
    ["lasca_ferrugem", 20], ["pedra_carvao", 45], ["fuligem", 75], ["tira_correia", 240], ["gota_gusa", 300], ["pena_fuligem", 380],
    ["escama_salamandra", 560], ["bloco_escoria", 720], ["placa_aco_fundido", 1300], ["gem_red", 1500], ["frasco_aco_liquido", 4200],
  ];
  // [id, slot, level, valor, cai de monstro comum (entra no Baú de Recompensa)]. Avental e Elmo do Laminador: só Fornalha
  // e missão (peça lv 80+ de comum subiria o piso do baú acima do tier 7; server/systems/quests.test.ts, lv 100).
  const GEAR: [string, ItemDef["slot"], number, number, boolean][] = [
    ["capacete_fundidor", "helmet", 40, 5200, true], ["botas_fundidor", "boots", 50, 22000, false],
    ["calca_antichama", "legs", 60, 26000, true], ["anel_alto_forno", "ring", 60, 48000, false],
    ["botas_termicas", "boots", 70, 45000, true], ["amuleto_rubi", "amulet", 70, 42000, false],
    ["avental_forjador", "armor", 80, 110000, false], ["elmo_laminador", "helmet", 85, 48000, false],
  ];
  const SID_GEAR = new Set(GEAR.map(([id]) => id));

  it("11 materiais com o valor da tabela, todos com monstro que derruba; Rubi empilha 50", () => {
    for (const [id, value] of MATS) {
      const d = ITEMS[id]!;
      expect(d, id).toBeDefined();
      expect([d.kind, d.stackable, d.value], id).toEqual(["material", true, value]);
      expect(dropsOf(id).length, id).toBeGreaterThan(0);
    }
    expect(ITEMS.gem_red).toMatchObject({ name: "Rubi", maxStack: 50, icon: { url: "ninja/Items/Resource/GemRed.png" } });
  });

  it("provas dos três chefes: troféus (quest, valor 0) que não prometem abrir nada", () => {
    for (const id of ["apito_contramestre", "nucleo_convertedor", "coracao_fornalha"]) {
      const d = ITEMS[id]!;
      expect([d.kind, d.value, d.stackable], id).toEqual(["quest", 0, undefined]);
      expect(d.description, id).not.toMatch(/abre/i);
    }
  });

  it("comida do turno: Limonada (mana, lv 10) e Prato Feito (equilibrado, lv 25)", () => {
    expect(ITEMS.limonada_turno).toMatchObject({ kind: "food", level: 10, value: 40, use: { food: { hpPerTick: 1, manaPerTick: 4, durationMs: 6 * 60_000 } } }); // mana 4: com 5 batia o Macarrão (2/4, 60) pela metade do preço
    expect(ITEMS.prato_feito).toMatchObject({ kind: "food", level: 25, value: 160, use: { food: { hpPerTick: 9, manaPerTick: 5, durationMs: 10 * 60_000 } } });
  });

  it("8 peças para todas as vocações, cada uma abaixo do melhor item do slot no level dela (calculado por vocação)", () => {
    for (const [id, slot, level, value] of GEAR) {
      const d = ITEMS[id]!;
      expect([d.slot, d.level, d.value, d.vocations, d.unique], id).toEqual([slot, level, value, undefined, undefined]);
      expect(isExclusiveItem(d), id).toBe(false);
      for (const v of VOCATIONS) {
        const ref = all.filter((x) => x.slot === slot && !SID_GEAR.has(x.id) && fits(x, v) && (x.level ?? 1) <= level)
          .reduce<ItemDef | undefined>((b, x) => (!b || x.value > b.value ? x : b), undefined)!;
        expect(ref, `${id} ${v}`).toBeDefined();
        expect(d.value, `${id} ${v}: referência ${ref.id} (${ref.value})`).toBeLessThan(ref.value);
      }
    }
  });

  it("o modelo de balanço (balanceKit.ts: o mais caro do slot) nunca escolhe uma peça da Siderúrgica, do lv 1 ao 150", () => {
    const equip = all.filter((d) => d.slot);
    for (const v of VOCATIONS) {
      for (let L = 1; L <= 150; L++) {
        const best = new Map<string, ItemDef>();
        for (const d of equip) {
          if (!fits(d, v) || (d.level ?? 0) > L) continue;
          const b = best.get(d.slot!);
          if (!b || d.value > b.value) best.set(d.slot!, d);
        }
        for (const d of best.values()) expect(SID_GEAR.has(d.id), `${v} lv ${L}: ${d.id}`).toBe(false);
      }
    }
  });

  it("fontes: capacete, calças e botas térmicas caem de comum (Baú); o resto só de missão ou chefe (nem loja)", () => {
    for (const [id, , , , common] of GEAR) {
      expect(dropsOf(id).some((m) => !m.boss), id).toBe(common);
      if (!common) expect(sold.has(id), id).toBe(false);
    }
    expect([chance("fornalha_primordial", "avental_forjador"), chance("fornalha_primordial", "elmo_laminador")]).toEqual([0.15, 0.15]);
    expect([chance("golem_convertedor", "anel_alto_forno"), chance("golem_convertedor", "amuleto_rubi")]).toEqual([0.1, 0.1]);
  });

  it("Fornalha Primordial: Fragmento Abissal sempre e 4 peças do tier 8 a 6% (os elmos e o grimório ficam para o ciclo 20)", () => {
    expect(chance("fornalha_primordial", "abyss_shard")).toBe(1);
    const t8 = MONSTERS.fornalha_primordial!.loot!.filter((e) => ABYSS_ITEM_IDS.includes(e.itemId) && e.itemId !== "abyss_shard");
    expect(t8.map((e) => [e.itemId, e.chance])).toEqual([
      ["abyss_armor", 0.06], ["abyss_archer_armor", 0.06], ["abyss_mage_armor", 0.06], ["abyss_shield", 0.06],
    ]);
  });
});

// ---------------------------------------------------------------------------
// Ciclo 20: Montadora (docs/regioes/montadora.md §4)
// ---------------------------------------------------------------------------
describe("ciclo 20: Montadora", () => {
  const MATS: [string, number][] = [
    ["mt_parafuso", 18], ["mt_fio_cobre", 60], ["mt_graxa", 140], ["mt_chapa_amassada", 260], ["mt_faisca", 420], ["mt_eletrodo", 650],
    ["mt_tinta", 900], ["mt_motor", 1500], ["mt_airbag", 2200], ["mt_cromo", 3800],
  ];
  // [id, slot, level, valor, vocações (undefined = todas)]
  const GEAR: [string, ItemDef["slot"], number, number, Vocation[] | undefined][] = [
    ["mt_bone_visitante", "helmet", 12, 95, undefined], ["mt_calca_impermeavel", "legs", 20, 850, undefined],
    ["mt_escudo_porta", "shield", 30, 2900, ["knight"]], ["mt_mascara_solda", "helmet", 45, 5200, undefined],
    ["mt_avental_pintor", "armor", 65, 46000, undefined], ["mt_macacao", "legs", 85, 64000, undefined],
    ["mt_amuleto_cromado", "amulet", 100, 180000, undefined],
  ];
  const RINGS: [string, Vocation][] = [
    ["mt_anel_para_choque", "knight"], ["mt_anel_retrovisor", "paladin"], ["mt_anel_ignicao", "sorcerer"], ["mt_anel_radiador", "druid"],
  ];
  const MT_GEAR = new Set([...GEAR.map(([id]) => id), ...RINGS.map(([id]) => id)]);

  it("10 materiais em ordem de valor (18 → 3.800), cada um com monstro que derruba", () => {
    for (const [id, value] of MATS) {
      const d = ITEMS[id]!;
      expect(d, id).toBeDefined();
      expect([d.kind, d.stackable, d.value], id).toEqual(["material", true, value]);
      expect(dropsOf(id).length, id).toBeGreaterThan(0);
    }
    for (let i = 1; i < MATS.length; i++) expect(MATS[i]![1], MATS[i]![0]).toBeGreaterThan(MATS[i - 1]![1]);
    // O Cromo cai do Tengu, do Piloto e do Protótipo (e sai dos baús do Crash Test).
    expect(dropsOf("mt_cromo").map((m) => m.id).sort()).toEqual(["mt_piloto_fantasma", "mt_prototipo", "mt_tengu_cromado"]);
  });

  it("provas dos três chefes: troféus (quest, valor 0) que não prometem abrir nada", () => {
    for (const [id, boss] of [["mt_coroa_espuma", "mt_sapao"], ["mt_brasa_estufa", "mt_monstro_estufa"], ["mt_chave_prototipo", "mt_prototipo"]] as const) {
      const d = ITEMS[id]!;
      expect([d.kind, d.value, d.stackable], id).toEqual(["quest", 0, undefined]);
      expect(d.description, id).not.toMatch(/abre/i);
      expect(chance(boss, id), id).toBe(1);
    }
  });

  it("7 peças: cada uma abaixo do melhor item do slot no level dela, por vocação (a Siderúrgica entra na referência)", () => {
    for (const [id, slot, level, value, vocations] of GEAR) {
      const d = ITEMS[id]!;
      expect([d.slot, d.level, d.value, d.vocations, d.unique], id).toEqual([slot, level, value, vocations, undefined]);
      expect(isExclusiveItem(d), id).toBe(false);
      for (const v of vocations ?? VOCATIONS) {
        const ref = all.filter((x) => x.slot === slot && !MT_GEAR.has(x.id) && fits(x, v) && (x.level ?? 1) <= level)
          .reduce<ItemDef | undefined>((b, x) => (!b || x.value > b.value ? x : b), undefined)!;
        expect(ref, `${id} ${v}`).toBeDefined();
        expect(d.value, `${id} ${v}: referência ${ref.id} (${ref.value})`).toBeLessThan(ref.value);
      }
    }
  });

  it("o modelo de balanço (balanceKit.ts: o mais caro do slot) nunca escolhe uma peça da Montadora, do lv 1 ao 150", () => {
    const equip = all.filter((d) => d.slot);
    for (const v of VOCATIONS) {
      for (let L = 1; L <= 150; L++) {
        const best = new Map<string, ItemDef>();
        for (const d of equip) {
          if (!fits(d, v) || (d.level ?? 0) > L) continue;
          const b = best.get(d.slot!);
          if (!b || d.value > b.value) best.set(d.slot!, d);
        }
        for (const d of best.values()) expect(MT_GEAR.has(d.id), `${v} lv ${L}: ${d.id}`).toBe(false);
      }
    }
  });

  it("fontes: as 7 peças caem de monstro comum (entram no Baú de Recompensa) e nenhuma é vendida", () => {
    for (const [id] of GEAR) {
      expect(dropsOf(id).some((m) => !m.boss), id).toBe(true);
      expect(sold.has(id), id).toBe(false);
    }
  });

  it("anéis do Crash Test: um por vocação, lv 95, abaixo do Anel de Demodras, só dos baús (nenhum monstro, nenhuma loja)", () => {
    const demodras = ITEMS.ring_demodras!;
    for (const [id, voc] of RINGS) {
      const d = ITEMS[id]!;
      expect([d.kind, d.slot, d.level, d.vocations, d.unique], id).toEqual(["ring", "ring", 95, [voc], undefined]);
      expect(d.value, id).toBe(96000);
      expect(d.value, id).toBeLessThan(demodras.value);
      expect(dropsOf(id).map((m) => m.id), id).toEqual([]);
      expect(sold.has(id), id).toBe(false);
    }
    // Os baús do Crash Test (frente das missões, questWorld.ts): quando existirem, cada anel sai de um deles.
    const crash = Object.values(QUEST_CHESTS).filter((c) => c.group === "crash_test");
    if (crash.length) for (const [id] of RINGS) expect(crash.some((c) => c.items?.some((i) => i.itemId === id)), id).toBe(true);
    // O trinket sem vocação continua de todas.
    expect(ITEMS.ring_demodras!.vocations).toBeUndefined();
  });

  it("O Protótipo: Fragmento Abissal sempre e os elmos e o grimório do tier 8 a 6% (a Fornalha dá as armaduras e o escudo)", () => {
    expect(chance("mt_prototipo", "abyss_shard")).toBe(1);
    const t8 = MONSTERS.mt_prototipo!.loot!.filter((e) => ABYSS_ITEM_IDS.includes(e.itemId) && e.itemId !== "abyss_shard");
    expect(t8.map((e) => [e.itemId, e.chance])).toEqual([
      ["abyss_helmet", 0.06], ["abyss_archer_helmet", 0.06], ["abyss_mage_helmet", 0.06], ["spellbook_abyss", 0.06],
    ]);
    // Os dois chefes finais de região juntos dão uma peça de cada forma de vocação (sem repetir).
    const both = ["fornalha_primordial", "mt_prototipo"].flatMap((b) => MONSTERS[b]!.loot!.filter((e) => ABYSS_ITEM_IDS.includes(e.itemId) && e.itemId !== "abyss_shard").map((e) => e.itemId));
    expect(new Set(both).size).toBe(8);
  });
});

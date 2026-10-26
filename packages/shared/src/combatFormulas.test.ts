import { describe, expect, it } from "vitest";
import {
  VOCATIONS, baseStats, blessingPrice, deathPenalty, levelForXp, mitigate, playerAttackDamage, playerDamageRange, regenAmount, rollInt, splitXp,
  xpForLevel, XP_STAGES, applyXpStage, xpStage, shieldArmorBonus, keptBySellAll, RARITIES,
  DEATH_PENALTY_STAGES, MANA_SHIELD_ABSORB, RED_SKULL_DEATH_XP_MULT, SPELLS, deathPenaltyPct, deathXpLoss, manaShieldSplit, spellPower,
} from "./index.ts";

function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("combat formulas", () => {
  it("damage range scales with vocation and level (knight > paladin > mages)", () => {
    expect(playerDamageRange("knight", 1)).toEqual([5, 9]);
    const at = (lvl: number) => VOCATIONS.map((v) => playerDamageRange(v, lvl)[1]);
    const [k, p, s, d] = at(20);
    expect(k).toBeGreaterThan(p);
    expect(p).toBeGreaterThan(s);
    expect(s).toBe(d);
    expect(playerDamageRange("knight", 20)[1]).toBeGreaterThan(playerDamageRange("knight", 5)[1]);
  });

  it("rolls stay inside [min, max*1.5], with ~5% misses and crits only for knight/paladin", () => {
    const rng = seeded(1);
    for (const v of VOCATIONS) {
      const [min, max] = playerDamageRange(v, 10);
      let miss = 0, crit = 0;
      const bad: string[] = [];
      const N = 20_000;
      // Conta as violações e confere uma vez no fim: 160 mil expect() no laço passavam do tempo limite com a CPU ocupada.
      for (let i = 0; i < N; i++) {
        const r = playerAttackDamage(v, 10, rng);
        if (r.miss) { miss++; if (r.amount !== 0) bad.push(`errou com ${r.amount}`); continue; }
        if (r.crit) crit++;
        const hi = r.crit ? Math.round(max * 1.5) : max;
        if (r.amount < min || r.amount > hi) bad.push(`${r.amount} fora de [${min}, ${hi}]`);
      }
      expect(bad.slice(0, 5), v).toEqual([]);
      expect(miss / N).toBeGreaterThan(0.035);
      expect(miss / N).toBeLessThan(0.065);
      if (v === "knight" || v === "paladin") expect(crit / N).toBeGreaterThan(0.05);
      else expect(crit).toBe(0);
    }
  });

  it("rollInt is inclusive and never exceeds max even with rng≈1", () => {
    expect(rollInt(3, 7, () => 0)).toBe(3);
    expect(rollInt(3, 7, () => 0.999999999)).toBe(7);
  });

  it("armor mitigation never goes negative", () => {
    expect(mitigate(10, 3)).toBe(7);
    expect(mitigate(2, 5)).toBe(0);
    expect(mitigate(5, -2)).toBe(5);
  });

  it("death penalty is 10% of the level span up to lv 59 and never drops a level", () => {
    const span = xpForLevel(6) - xpForLevel(5);
    expect(deathPenalty(5, xpForLevel(5) + span - 1)).toBe(Math.round(span * 0.1));
    expect(deathPenalty(5, xpForLevel(5) + 3)).toBe(3);
    expect(deathPenalty(5, xpForLevel(5))).toBe(0);
    for (let lvl = 1; lvl < 150; lvl++) {
      for (const xp of [xpForLevel(lvl), xpForLevel(lvl) + 1, xpForLevel(lvl + 1) - 1]) {
        expect(levelForXp(xp - deathPenalty(lvl, xp))).toBe(lvl);
        expect(levelForXp(xp - deathXpLoss(lvl, xp, RED_SKULL_DEATH_XP_MULT))).toBe(lvl);
      }
    }
  });

  it("morte por faixa (ciclo 15): 10% até o 59, 20% no 60–79, 25% no 80–99, 30% no 100+", () => {
    expect(DEATH_PENALTY_STAGES[0]).toEqual({ fromLevel: 1, pct: 0.1 });
    for (let i = 1; i < DEATH_PENALTY_STAGES.length; i++) {
      expect(DEATH_PENALTY_STAGES[i]!.fromLevel).toBeGreaterThan(DEATH_PENALTY_STAGES[i - 1]!.fromLevel);
      expect(DEATH_PENALTY_STAGES[i]!.pct).toBeGreaterThan(DEATH_PENALTY_STAGES[i - 1]!.pct);
    }
    expect([1, 59, 60, 79, 80, 99, 100, 150].map(deathPenaltyPct)).toEqual([0.1, 0.1, 0.2, 0.2, 0.25, 0.25, 0.3, 0.3]);
    // Perda cheia (fim do level), antes → depois: lv 60 2.427 → 4.853 · lv 80 4.195 → 10.487 · lv 100 6.443 → 19.328.
    const full = (lvl: number) => deathPenalty(lvl, Infinity);
    const span = (lvl: number) => xpForLevel(lvl + 1) - xpForLevel(lvl);
    expect(full(59)).toBe(Math.round(span(59) * 0.1));
    expect([full(60), full(80), full(100)]).toEqual([4853, 10487, 19328]);
    expect([60, 80, 100].map((l) => Math.round(span(l) * 0.1))).toEqual([2427, 4195, 6443]);
    // XP no meio do level: a mesma fração, limitada ao que há acima do piso do level.
    expect(deathPenalty(100, xpForLevel(100) + 5000)).toBe(5000);
  });

  it("deathXpLoss: perda × caveira vermelha, sem derrubar o level; é o que a bênção salva", () => {
    const xp = xpForLevel(100) + 30_000;
    expect(deathXpLoss(100, xp)).toBe(19328);
    expect(deathXpLoss(100, xp, 2)).toBe(30_000); // dobro limitado ao piso do level
    expect(deathXpLoss(100, xpForLevel(100) + 100_000, 2)).toBe(38656);
    expect(deathXpLoss(100, xpForLevel(100))).toBe(0); // acabou de subir: nada a perder (a bênção não é gasta)
    expect(deathXpLoss(30, xpForLevel(31) - 1, 0.5)).toBe(deathPenalty(30, xpForLevel(31) - 1)); // mult < 1 não reduz
  });

  it("blessing price scales linearly with level", () => {
    expect(blessingPrice(1)).toBe(50);
    expect(blessingPrice(80)).toBe(4000);
    expect(blessingPrice(0)).toBe(50); // nunca menos que o level 1
  });

  it("levelForXp inverts xpForLevel (multi-level jumps)", () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(xpForLevel(2) - 1)).toBe(1);
    expect(levelForXp(xpForLevel(7))).toBe(7);
  });

  it("xp split is proportional, rounded, min 1 per damager", () => {
    const s = splitXp(100, [["a", 75], ["b", 25]]);
    expect(s.get("a")).toBe(75);
    expect(s.get("b")).toBe(25);
    const t = splitXp(6, [["a", 999], ["b", 1]]);
    expect(t.get("a")).toBe(6);
    expect(t.get("b")).toBe(1);
    expect(splitXp(10, [["a", 0]]).size).toBe(0);
  });

  it("regen is at least 1 and 3x in PZ", () => {
    expect(regenAmount(150, 1, false)).toBe(2);
    expect(regenAmount(150, 1, true)).toBe(6);
    expect(regenAmount(10, 1, false)).toBeGreaterThanOrEqual(1);
  });
});

describe("baseStats", () => {
  it("magos ganham 6 de vida por level (lv 30: 324), ainda bem abaixo do paladino e do cavaleiro", () => {
    expect(baseStats("sorcerer", 1).maxHp).toBe(150);
    expect(baseStats("sorcerer", 30).maxHp).toBe(324);
    expect(baseStats("druid", 30).maxHp).toBe(324);
    expect(baseStats("paladin", 30).maxHp).toBeGreaterThan(baseStats("druid", 30).maxHp);
    expect(baseStats("knight", 30).maxHp).toBeGreaterThan(baseStats("paladin", 30).maxHp);
  });

  it("paladino ganha 13 de vida por level (ciclo 15-13; era 10, depois 12): lv 100 1.140 → 1.437 sem equipamento", () => {
    expect(baseStats("paladin", 1).maxHp).toBe(150);
    expect(baseStats("paladin", 30).maxHp).toBe(527);
    expect(baseStats("paladin", 100).maxHp).toBe(1437);
    expect(baseStats("paladin", 100).maxMana).toBe(50 + 15 * 99); // mana igual
    expect(baseStats("knight", 100).maxHp).toBe(1635);
  });
});

describe("Escudo de Mana (ciclo 15)", () => {
  it("metade do dano na mana, metade na vida; o que a mana não cobre vai na vida", () => {
    expect(MANA_SHIELD_ABSORB).toBe(0.5);
    expect(manaShieldSplit(100, 1000)).toEqual({ fromMana: 50, fromHp: 50 });
    expect(manaShieldSplit(101, 1000)).toEqual({ fromMana: 51, fromHp: 50 }); // arredonda, soma sempre o dano
    expect(manaShieldSplit(100, 20)).toEqual({ fromMana: 20, fromHp: 80 });
    expect(manaShieldSplit(100, 0)).toEqual({ fromMana: 0, fromHp: 100 });
    expect(manaShieldSplit(1, 10)).toEqual({ fromMana: 1, fromHp: 0 });
    expect(manaShieldSplit(0, 10)).toEqual({ fromMana: 0, fromHp: 0 });
    expect(manaShieldSplit(100, 1000, 0.6)).toEqual({ fromMana: 60, fromHp: 40 });
    expect(manaShieldSplit(100, 1000, 1)).toEqual({ fromMana: 100, fromHp: 0 }); // a regra antiga
    expect(manaShieldSplit(Number.NaN, 10)).toEqual({ fromMana: 0, fromHp: 0 });
    for (const [d, m] of [[7, 3], [250, 9999], [33, 16]] as const) {
      const s = manaShieldSplit(d, m);
      expect(s.fromMana + s.fromHp).toBe(d);
      expect(s.fromMana).toBeLessThanOrEqual(m);
    }
  });

  it("vida efetiva com o escudo e mana cheios cai para 2× a vida (feiticeiro lv 100 sem itens: 3.764 → 1.488)", () => {
    const { maxHp, maxMana } = baseStats("sorcerer", 100);
    // Golpes de 2 até a vida acabar: quanto dano o feiticeiro aguenta.
    const effective = (absorb: number) => {
      let hp = maxHp, mana = maxMana, taken = 0;
      while (hp > 0) { const s = manaShieldSplit(2, mana, absorb); mana -= s.fromMana; hp -= s.fromHp; taken += 2; }
      return taken;
    };
    expect(effective(1)).toBe(maxHp + maxMana);
    expect(effective(1)).toBe(3764);
    expect(effective(MANA_SHIELD_ABSORB)).toBe(2 * maxHp);
    expect(effective(MANA_SHIELD_ABSORB)).toBe(1488);
    expect(effective(MANA_SHIELD_ABSORB)).toBeLessThan(baseStats("knight", 100).maxHp);
  });
});

describe("spellPower (ciclo 15)", () => {
  it("cavaleiro/paladino: max(ML, ⌊(skill + bônus + level − 10)/2⌋) (level desde o 15-13); magos: o ML", () => {
    expect(spellPower("knight", 10, 66, 4, 100)).toBe(80);
    expect(spellPower("knight", 10, 66, 0, 100)).toBe(78);
    expect(spellPower("paladin", 22, 66, 10, 100)).toBe(83);
    expect(spellPower("knight", 0, 10, 0, 1)).toBe(0); // personagem novo: ⌊(10 + 1 − 10)/2⌋ = 0
    expect(spellPower("knight", 10, 10, 0, 1)).toBe(10); // skill inicial no lv 1: segue o ML
    expect(spellPower("knight", 90, 66, 4, 100)).toBe(90); // ML maior vence
    expect(spellPower("sorcerer", 48, 90, 10, 100)).toBe(48);
    expect(spellPower("druid", 48, 90, 10, 100)).toBe(48);
    expect(spellPower("knight", 5, Number.NaN, 0, Number.NaN)).toBe(5);
    expect(spellPower("knight", 0, 30, 0, -5)).toBe(10); // level inválido conta 0
    // Skills reais da produção (out/2026): cavaleiro lv 74 (melee 30, ML 6) e paladino lv 61 (distância 25, ML 12).
    // Só com a skill davam 10 e 12 (o ML); com o level, 47 e 38.
    expect(spellPower("knight", 6, 30, 0, 74)).toBe(47);
    expect(spellPower("paladin", 12, 25, 0, 61)).toBe(38);
  });

  it("Golpe Aniquilador lv 100: 680 só com o ML → 1.442 (15-13: +40% e level na potência); Julgamento Divino 458 → 702", () => {
    const avg = (id: string, lvl: number, power: number) => {
      const f = SPELLS[id]!.damage!;
      return Math.round(f.base + lvl * f.perLevel + power * f.perMagic);
    };
    // Plano (15-5): 680 → ~790 e 458 → ~502 só com a skill da arma (66 + bônus). Ciclo 15-13: magias de dano do
    // cavaleiro +40% e o level dentro do spellPower — com a skill da produção (35 + 9 no lv 100), o Golpe Aniquilador
    // médio fica em 1.351.
    expect(avg("annihilation_strike", 100, 10)).toBe(952);
    expect(avg("annihilation_strike", 100, spellPower("knight", 10, 66, 4, 100))).toBe(1442);
    expect(avg("annihilation_strike", 100, spellPower("knight", 10, 66, 8, 100))).toBe(1456);
    expect(avg("annihilation_strike", 100, spellPower("knight", 10, 35, 9, 100))).toBe(1351);
    expect(avg("divine_judgment", 100, 22)).toBe(458);
    expect(avg("divine_judgment", 100, spellPower("paladin", 22, 66, 10, 100))).toBe(702);
  });
});

describe("armadura da skill Escudo", () => {
  it("+1 a cada 4 níveis acima de 10; nunca negativa", () => {
    expect(shieldArmorBonus(10)).toBe(0);
    expect(shieldArmorBonus(13)).toBe(0);
    expect(shieldArmorBonus(14)).toBe(1);
    expect(shieldArmorBonus(30)).toBe(5);
    expect(shieldArmorBonus(50)).toBe(10);
    expect(shieldArmorBonus(5)).toBe(0);
    expect(shieldArmorBonus(Number.NaN)).toBe(0);
  });
});

describe("estágios de XP", () => {
  it("faixas em ordem, começando no level 1 com XP cheia e sempre caindo", () => {
    expect(XP_STAGES[0]).toEqual({ fromLevel: 1, mult: 1 });
    for (let i = 1; i < XP_STAGES.length; i++) {
      expect(XP_STAGES[i]!.fromLevel).toBeGreaterThan(XP_STAGES[i - 1]!.fromLevel);
      expect(XP_STAGES[i]!.mult).toBeLessThan(XP_STAGES[i - 1]!.mult);
    }
  });

  it("xpStage e applyXpStage", () => {
    expect(xpStage(1).mult).toBe(1);
    expect(xpStage(39).mult).toBe(1);
    expect(xpStage(40).mult).toBe(0.5);
    expect(xpStage(60).mult).toBe(0.3);
    expect(xpStage(80).mult).toBe(0.2);
    expect(xpStage(150).mult).toBe(0.12);
    expect(applyXpStage(1000, 30)).toBe(1000);
    expect(applyXpStage(1000, 85)).toBe(200);
    expect(applyXpStage(1, 120)).toBe(1); // nunca zera um abate
    expect(applyXpStage(0, 120)).toBe(0);
  });
});

describe("vender tudo (NPC)", () => {
  it("deixa na mochila raro ou melhor; comum e incomum vendem", () => {
    expect(RARITIES.filter((r) => keptBySellAll(r))).toEqual(["rare", "epic", "legendary"]);
  });
});

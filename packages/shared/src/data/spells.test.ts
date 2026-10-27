import { describe, expect, it } from "vitest";
import { SPELLS, spellsFor, spellByWords, spellMana, type ConditionId, type SpellDef, type SpellFormula } from "./spells.ts";
import { MONSTERS } from "./monsters.ts";
import { MANA_SHIELD_ABSORB, baseStats, playerDamageRange, weaponDamageRange } from "../formulas.ts";
import { HOTKEY_MAX } from "../hotkeys.ts";
import { skillEstimate } from "../skills.ts";
import { ITEMS } from "./items.ts";
import type { Vocation } from "../types.ts";

const VOCS: Vocation[] = ["knight", "paladin", "sorcerer", "druid"];
const LEVELS = [1, 5, 10, 15, 20, 30];
const CONDITIONS: ConditionId[] = [
  "combat", "poison", "burn", "energy", "bleed", "freeze", "protect", "haste", "slow", "drunk", "regen", "pz",
  "manashield", "rooted", "taunted", "berserk", "exposed",
];

/** Magic level estimado (shared/skills.ts; ciclo 15, pela produção: mago 20/29/37 nos lv 30/60/100 — era 0,75 × level). */
const mlEstimate = (voc: Vocation, level: number): number => skillEstimate(voc, level).magic;

const avg = (f: SpellFormula, voc: Vocation, level: number) => f.base + level * f.perLevel + mlEstimate(voc, level) * f.perMagic;
/** Valor esperado da magia para uma vocação (padrão: a primeira que a conjura). */
const value = (s: SpellDef, level = s.level, voc: Vocation = s.vocations[0]!) => {
  const f = s.damage ?? s.heal;
  return f ? avg(f, voc, level) : 0;
};
/** Auto-ataque médio de quem usa a melhor arma da vocação liberada no level (o punho fica bem abaixo de propósito). */
const autoAvg = (voc: Vocation, level: number) => {
  const magic = voc === "sorcerer" || voc === "druid";
  let best = playerDamageRange(voc, level);
  for (const it of Object.values(ITEMS)) {
    if (it.kind !== "weapon" || !it.vocations?.includes(voc) || (it.level ?? 1) > level) continue;
    const r = weaponDamageRange(it.stats?.attack ?? 0, magic ? 0 : 10, level, magic);
    if (r[0] + r[1] > best[0] + best[1]) best = r;
  }
  return (best[0] + best[1]) / 2;
};
const healPct = (id: string, voc: Vocation, level: number) => value(SPELLS[id]!, level, voc) / baseStats(voc, level).maxHp;
const HEALS = ["light_heal"];

describe("SPELLS", () => {
  it("cada vocação tem 11-14 magias, com UMA cura própria (cabem nos atalhos pelas famílias: hotkeys.test.ts)", () => {
    for (const v of VOCS) {
      const list = spellsFor(v);
      expect(list.length, v).toBeGreaterThanOrEqual(11);
      // Desde as famílias (ciclo 11) uma tecla junta várias magias: o que precisa caber em HOTKEY_MAX é a barra
      // recomendada, não a lista (o feiticeiro e o druida passaram de 12 com as magias do lv 100; o druida chegou a 14
      // com o Escudo de Mana no ciclo 15, e a barra recomendada dele tem 11 teclas).
      expect(list.length, v).toBeLessThanOrEqual(HOTKEY_MAX + 2);
      expect(list.map((s) => s.level), v).toEqual([...list.map((s) => s.level)].sort((a, b) => a - b));
      expect(list.some((s) => s.id === "light_heal"), v).toBe(true);
      // Cura em si mesmo: a Cura de todos e, como no Tibia (2026-10-27), a própria do cavaleiro (Limpar Feridas) e a do
      // paladino (Cura Divina); a cura em grupo do druida é outra coisa.
      const SELF_HEALS: Record<Vocation, string[]> = { knight: ["light_heal", "wound_cleansing"], paladin: ["light_heal", "divine_healing"], sorcerer: ["light_heal"], druid: ["light_heal"] };
      expect(list.filter((s) => s.target === "self" && s.heal).map((s) => s.id), v).toEqual(SELF_HEALS[v]);
      expect(list.every((s) => s.vocations.includes(v))).toBe(true);
    }
    expect(Object.fromEntries(VOCS.map((v) => [v, spellsFor(v).length]))).toEqual({ knight: 13, paladin: 12, sorcerer: 13, druid: 14 });
    expect(Object.keys(SPELLS).length).toBe(45);
  });

  it("descrição do Escudo de Mana acompanha MANA_SHIELD_ABSORB (mudar a constante exige reescrever o texto)", () => {
    expect(MANA_SHIELD_ABSORB, "o texto diz \"metade\": reescreva a descrição de mana_shield").toBe(0.5);
    expect(SPELLS.mana_shield!.description).toMatch(/metade/);
  });

  it("Escudo de Mana (utamo vita, lv 15): feiticeiro e druida, a mesma magia (ciclo 15)", () => {
    expect(spellByWords("utamo vita")).toBe(SPELLS.mana_shield);
    expect(SPELLS.mana_shield).toMatchObject({ vocations: ["sorcerer", "druid"], level: 15, condition: { id: "manashield" } });
    expect(spellsFor("druid").map((s) => s.id)).toContain("mana_shield");
    expect(spellsFor("knight").map((s) => s.id)).not.toContain("mana_shield");
    expect(spellsFor("paladin").map((s) => s.id)).not.toContain("mana_shield");
  });

  it("cura única: exura (lv1) para todas as vocações; sem exura gran/vita; druida mantém exura mas sio", () => {
    expect(spellByWords("exura")).toMatchObject({ id: "light_heal", name: "Cura", level: 1, vocations: VOCS });
    expect(spellByWords("exura gran")).toBeUndefined();
    expect(spellByWords("exura vita")).toBeUndefined();
    expect(SPELLS.great_heal).toBeUndefined();
    expect(SPELLS.vital_heal).toBeUndefined();
    expect(spellByWords("exura mas sio")).toMatchObject({ id: "group_heal", vocations: ["druid"], target: "party" });
    expect(spellsFor("knight").map((s) => s.words)).not.toContain("exura mas sio");
  });

  it("ids batem com a chave, palavras únicas e minúsculas", () => {
    const words = new Set<string>();
    for (const [key, s] of Object.entries(SPELLS)) {
      expect(s.id).toBe(key);
      expect(s.words).toBe(s.words.trim().toLowerCase().replace(/\s+/g, " "));
      expect(words.has(s.words), `palavras duplicadas: ${s.words}`).toBe(false);
      words.add(s.words);
      expect(spellByWords(s.words)).toBe(s);
    }
  });

  it("campos exigidos por tipo de alvo e dados válidos", () => {
    for (const s of Object.values(SPELLS)) {
      const tag = s.id;
      if (s.target === "target" || s.target === "area_target") expect(s.range, tag).toBeGreaterThan(0);
      if (s.target === "area_self" || s.target === "area_target" || s.target === "party") expect(s.radius, tag).toBeGreaterThan(0);
      if (s.target === "wave") { expect(s.length, tag).toBeGreaterThan(0); expect(s.width, tag).toBeGreaterThan(0); }
      if (s.summon) {
        expect(MONSTERS[s.summon.monsterId], tag).toBeDefined();
        expect(s.summon.count).toBeGreaterThan(0);
        expect(s.summon.durationMs).toBeGreaterThan(0);
      }
      if (s.condition) {
        expect(CONDITIONS, tag).toContain(s.condition.id);
        expect(s.condition.durationMs).toBeGreaterThan(0);
      }
      if (s.dash) expect(s.target).toBe("target");
      if (s.taunt) expect(s.target).toBe("area_self");
      expect(s.mana, tag).toBeGreaterThan(0);
      expect(s.cooldownMs, tag).toBeGreaterThanOrEqual(1000);
      expect(s.name.length, tag).toBeGreaterThan(0);
      expect(s.description.trim().length, tag).toBeGreaterThan(0);
      expect(Boolean(s.damage || s.heal || s.condition || s.summon || s.taunt), tag).toBe(true);
    }
  });

  it("summoned_wolf é um aliado válido", () => {
    const w = MONSTERS.summoned_wolf;
    expect(w.name).toBe("Lobo Espiritual");
    expect(w.aggroRange).toBe(0);
    expect(w.xp).toBe(0);
    expect(w.respawnMs).toBe(0);
  });

  it("tabela de balanceamento (valor esperado no level de desbloqueio)", () => {
    const rows = VOCS.flatMap((v) => spellsFor(v).map((s) => ({ s, v })))
      .map(({ s, v }) => {
        const { maxHp, maxMana } = baseStats(v, s.level);
        return {
          voc: v, lvl: s.level, spell: s.name, words: s.words, ML: mlEstimate(v, s.level),
          mana: s.mana, "mana%": Math.round((s.mana / maxMana) * 100), cd: s.cooldownMs / 1000,
          dmg: s.damage ? Math.round(avg(s.damage, v, s.level)) : "",
          heal: s.heal ? Math.round(avg(s.heal, v, s.level)) : "",
          "heal%hp": s.heal ? Math.round((avg(s.heal, v, s.level) / maxHp) * 100) : "",
          "x auto": s.damage ? +(avg(s.damage, v, s.level) / autoAvg(v, s.level)).toFixed(1) : "",
        };
      });
    console.table(rows);
    expect(rows.length).toBe(VOCS.flatMap((v) => spellsFor(v)).length);
  });

  describe("metas de balanceamento", () => {
    // Base = auto-ataque com a arma inicial (o personagem novo já começa com ela): a Bola de Fogo fica em ~1,8×.
    it("magia de ataque do level 1 vale 1,5-3x o auto-ataque, mana 10-20% de 50", () => {
      for (const [v, id] of [["sorcerer", "fireball"], ["druid", "ice_shard"], ["paladin", "piercing_arrow"], ["knight", "spin_strike"]] as const) {
        const s = SPELLS[id];
        expect(s.vocations).toEqual([v]);
        const ratio = value(s) / autoAvg(v, 1);
        expect(ratio, id).toBeGreaterThanOrEqual(1.5);
        expect(ratio, id).toBeLessThanOrEqual(3);
        expect(s.mana / 50, id).toBeGreaterThanOrEqual(0.1);
        expect(s.mana / 50, id).toBeLessThanOrEqual(0.2);
        expect(s.cooldownMs, id).toBeLessThanOrEqual(4000);
      }
      expect(SPELLS.fireball.cooldownMs).toBe(2000);
      expect(SPELLS.piercing_arrow.cooldownMs).toBe(2000);
    });

    it("Cura (exura) escala por ML, como no Tibia: ~14% no level 1; mago 30-38%; paladino 12-18%; cavaleiro 9-13%", () => {
      // Decisão do dono (2026-10-27): o cavaleiro cura pouco com magia e compensa com as poções de vida fortes
      // (items.ts); o mago cura por magia. Era 15% para todos em qualquer level.
      for (const v of VOCS) {
        expect(healPct("light_heal", v, 1), v).toBeGreaterThanOrEqual(0.12);
        expect(healPct("light_heal", v, 1), v).toBeLessThanOrEqual(0.17);
      }
      const RANGE: Record<Vocation, [number, number]> = { sorcerer: [0.30, 0.38], druid: [0.30, 0.38], knight: [0.09, 0.13], paladin: [0.12, 0.18] };
      for (const lvl of [20, 30, 60, 100]) {
        for (const v of VOCS) {
          expect(healPct("light_heal", v, lvl), `${v}@${lvl}`).toBeGreaterThanOrEqual(RANGE[v][0]);
          expect(healPct("light_heal", v, lvl), `${v}@${lvl}`).toBeLessThanOrEqual(RANGE[v][1]);
        }
      }
      expect(healPct("light_heal", "druid", 20)).toBeGreaterThan(healPct("light_heal", "paladin", 20));
      expect(healPct("light_heal", "paladin", 20)).toBeGreaterThan(healPct("light_heal", "knight", 20));
    });

    it("Limpar Feridas (cavaleiro, lv 15) e Cura Divina (paladino, lv 35): ~15–19% da vida, por level, em todo level", () => {
      expect(spellByWords("exura ico")).toMatchObject({ id: "wound_cleansing", vocations: ["knight"], level: 15, cooldownMs: 1000 });
      expect(spellByWords("exura san")).toMatchObject({ id: "divine_healing", vocations: ["paladin"], level: 35, cooldownMs: 1000 });
      for (const lvl of [15, 30, 60, 100, 130]) {
        expect(healPct("wound_cleansing", "knight", lvl), `cav@${lvl}`).toBeGreaterThanOrEqual(0.14);
        expect(healPct("wound_cleansing", "knight", lvl), `cav@${lvl}`).toBeLessThanOrEqual(0.16);
        // A própria cura de cada um é maior que a Cura geral: é ela que a tecla inteligente/o jogador deve usar.
        expect(healPct("wound_cleansing", "knight", lvl), `cav@${lvl}`).toBeGreaterThan(healPct("light_heal", "knight", lvl));
      }
      for (const lvl of [35, 60, 100, 130]) {
        expect(healPct("divine_healing", "paladin", lvl), `pal@${lvl}`).toBeGreaterThanOrEqual(0.15);
        expect(healPct("divine_healing", "paladin", lvl), `pal@${lvl}`).toBeLessThanOrEqual(0.20);
        expect(healPct("divine_healing", "paladin", lvl), `pal@${lvl}`).toBeGreaterThan(healPct("light_heal", "paladin", lvl));
      }
    });

    it("custo de mana da Cura cresce com o level (20 + 1.5/level) e tem teto", () => {
      const s = SPELLS.light_heal!;
      expect(spellMana(s, 1)).toBe(22);
      expect(spellMana(s, 10)).toBe(35);
      expect(spellMana(s, 20)).toBe(50);
      expect(spellMana(s, 30)).toBe(65);
      expect(spellMana(s, 100)).toBe(70);
      expect(spellMana(SPELLS.fireball!, 30)).toBe(SPELLS.fireball!.mana); // sem manaPerLevel: fixo
      expect(s.cooldownMs).toBe(1000);
    });

    it("curas custam mais mana por PV que ataques de nível 1 e respeitam cooldown >= 1 s", () => {
      for (const id of HEALS) expect(SPELLS[id]!.cooldownMs).toBeGreaterThanOrEqual(1000);
    });

    it("cura em grupo: por segundo e por alvo, bem menos que a cura leve do mesmo level (do 15 ao 120)", () => {
      // Ciclo 7: a cura por alvo de um cast passou da Cura no lv 15 (72 contra 60), mas o cooldown de 5 s mantém a
      // vazão por alvo em ~1/4 da Cura (cd 1 s): ela complementa, não substitui a cura própria de cada um.
      const g = SPELLS.group_heal!, h = SPELLS.light_heal!;
      for (const lvl of [15, 30, 60, 90, 120]) {
        const perSec = value(g, lvl, "druid") / (g.cooldownMs / 1000);
        const healPerSec = value(h, lvl, "druid") / (h.cooldownMs / 1000);
        expect(perSec, `lv ${lvl}`).toBeLessThan(healPerSec * 0.35);
      }
    });

    it("AoE de mago nos levels 15-20 mata um bando (~175 HP) em 3-4 casts", () => {
      const packHp = 175; // aranha 180 / morcego 170
      for (const [id, lvl] of [["fire_burst", 15], ["fire_burst", 20], ["ice_rain", 15], ["ice_rain", 20]] as const) {
        const casts = Math.ceil(packHp / value(SPELLS[id], lvl));
        expect(casts, `${id}@${lvl}`).toBeGreaterThanOrEqual(3);
        expect(casts, `${id}@${lvl}`).toBeLessThanOrEqual(4);
      }
    });

    it("AoE de mago no level 30 supera a do paladino; Golpe Giratório não substitui o auto-ataque", () => {
      expect(value(SPELLS.inferno)).toBeGreaterThan(value(SPELLS.holy_wave));
      expect(value(SPELLS.blizzard)).toBeGreaterThan(value(SPELLS.holy_wave));
      expect(value(SPELLS.spin_strike, 20)).toBeLessThan(autoAvg("knight", 20) * 1.6);
    });

    it("mana limita os magos, mas nenhuma magia custa mais de 35% da mana máxima", () => {
      for (const v of VOCS) for (const s of spellsFor(v)) {
        // Curas são caras de propósito (mana cresce com o level): quem tem pouca mana dá poucos casts (mana potions!).
        if (HEALS.includes(s.id)) continue;
        expect(s.mana / baseStats(v, s.level).maxMana, `${s.id}/${v}`).toBeLessThanOrEqual(0.35);
      }
      // Só AoE no level 20: gasto por segundo é da ordem do regen (2% + 0.5*lvl por 2 s), não muito menor nem maior.
      const { maxMana } = baseStats("sorcerer", 20);
      const regenPerSec = (maxMana * 0.02 + 20 * 0.5) / 2;
      const burnPerSec = SPELLS.fire_burst.mana / (SPELLS.fire_burst.cooldownMs / 1000);
      expect(burnPerSec).toBeGreaterThan(regenPerSec * 0.5);
      expect(burnPerSec).toBeLessThan(regenPerSec * 2.5);
    });

    it("fim de jogo: magias novas por vocação nos lv 35, 50, 70, 90 e 100; cura nova só a Cura Divina do paladino (lv 35)", () => {
      for (const v of VOCS) {
        const late = spellsFor(v).filter((s) => s.level > 30);
        expect(late.filter((s) => !s.heal).map((s) => s.level), v).toEqual([35, 50, 70, 90, 100]);
        expect(late.filter((s) => s.heal).map((s) => s.id), v).toEqual(v === "paladin" ? ["divine_healing"] : []);
      }
    });

    it("lv 100 (ciclo 12): uma magia de utilidade por vocação, sem dano, para o grupo ou contra o alvo", () => {
      const u = Object.fromEntries(VOCS.map((v) => [v, spellsFor(v).find((s) => s.level === 100)!]));
      for (const v of VOCS) {
        expect(u[v]!.damage, v).toBeUndefined();
        expect(u[v]!.heal, v).toBeUndefined();
        expect(u[v]!.condition, v).toBeDefined();
        expect(u[v]!.cooldownMs, v).toBeGreaterThanOrEqual(20_000);
      }
      // Cavaleiro: protege o grupo, mas menos que a Pele de Ferro só nele (30%).
      expect(u.knight).toMatchObject({ target: "party", condition: { id: "protect", value: 20 } });
      expect(u.knight!.condition!.value!).toBeLessThan(SPELLS.iron_skin!.condition!.value!);
      // Paladino: regen do grupo = 450 de vida em 10 s, abaixo de uma Poção de Vida Grande por aliado.
      expect(u.paladin).toMatchObject({ target: "party", condition: { id: "regen" } });
      expect(u.paladin!.condition!.value! * (u.paladin!.condition!.durationMs / 1000)).toBeLessThanOrEqual(450);
      // Ciclo 15: recarga 30 s → 20 s (regen ativa metade do tempo: ~22 de vida/s por aliado em média).
      expect(u.paladin!.cooldownMs).toBe(20_000);
      // Feiticeiro: Ruptura no alvo; Druida: raiz em área.
      expect(u.sorcerer).toMatchObject({ target: "target", condition: { id: "exposed" } });
      expect(u.druid).toMatchObject({ target: "area_self", condition: { id: "rooted" } });
    });

    it("magia nova de dano rende 1-1,7x a melhor magia antiga da mesma categoria no level em que libera", () => {
      const area = (s: SpellDef) => s.target === "area_self" || s.target === "area_target" || s.target === "wave";
      const best = (list: { s: SpellDef; v: Vocation }[], lvl: number) => Math.max(0, ...list.map(({ s, v }) => value(s, lvl, v)));
      for (const v of VOCS) {
        for (const s of spellsFor(v).filter((x) => x.level > 30 && x.damage)) {
          const mine = value(s, s.level, v);
          // Antecessora "de verdade" (lv 10+) da própria vocação na mesma categoria.
          const own = spellsFor(v).filter((o) => o.level >= 10 && o.level < s.level && o.damage && area(o) === area(s)).map((o) => ({ s: o, v }));
          if (own.length) {
            const ratio = mine / best(own, s.level);
            expect(ratio, `${s.id} (${ratio.toFixed(2)})`).toBeGreaterThanOrEqual(1);
            expect(ratio, `${s.id} (${ratio.toFixed(2)})`).toBeLessThanOrEqual(1.7);
          } else {
            // Primeira da categoria (ex.: alvo único do druida, área do cavaleiro): não passa da melhor de qualquer
            // vocação naquele level e supera a magia inicial da própria vocação.
            const any = VOCS.flatMap((w) => spellsFor(w).filter((o) => o.level < s.level && o.damage && area(o) === area(s)).map((o) => ({ s: o, v: w })));
            expect(mine, s.id).toBeLessThanOrEqual(best(any, s.level));
            const starter = spellsFor(v).filter((o) => o.level < 10 && o.damage && area(o) === area(s)).map((o) => ({ s: o, v }));
            expect(mine, s.id).toBeGreaterThanOrEqual(best(starter, s.level) * 1.2);
          }
        }
      }
    });

    it("Fúria (utito tempo): +25% de dano por 10 s, recarga 30 s, só cavaleiro", () => {
      expect(SPELLS.berserk).toMatchObject({ vocations: ["knight"], level: 50, cooldownMs: 30_000, condition: { id: "berserk", durationMs: 10_000, value: 25 } });
    });

    it("cooldowns por categoria: AoE 4-8 s, buffs/utilidade >= 15 s, invocação >= 60 s", () => {
      for (const s of Object.values(SPELLS)) {
        if (s.summon) expect(s.cooldownMs, s.id).toBeGreaterThanOrEqual(60_000);
        else if (s.condition && !s.damage) expect(s.cooldownMs, s.id).toBeGreaterThanOrEqual(15_000);
        else if (s.target === "area_self" || s.target === "area_target" || s.target === "wave") {
          expect(s.cooldownMs, s.id).toBeGreaterThanOrEqual(4000);
          expect(s.cooldownMs, s.id).toBeLessThanOrEqual(8000);
        }
      }
    });
  });
});

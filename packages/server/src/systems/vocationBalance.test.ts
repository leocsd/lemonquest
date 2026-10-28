import { describe, expect, it } from "vitest";
import { MANA_SHIELD_ABSORB, SKILL_ESTIMATE, skillEstimate, type Vocation } from "@lemonquest/shared";
import {
  BALANCE_LEVELS, BALANCE_PACKS, effectiveHp, fighter, fighterBuilds, measure, packDps, packSurvival,
  type Fighter, type Measure,
} from "./balanceKit.ts";

/**
 * Balanço entre vocações (ciclo 15). Para cada vocação nos lv 30/60/100, contra o pacote de referência da faixa
 * (BALANCE_PACKS em balanceKit.ts, três monstros da faixa com elementos misturados):
 * - dano: dano por segundo no pacote com todas as magias e as poções de mana, sem ninguém batendo nele;
 * - sobrevivência: quantas vezes o dano do pacote ele aguenta por um minuto, só se defendendo (escudo, Cura, poções);
 * - P = dano × sobrevivência; o cavaleiro vale pela melhor montagem (escudo ou duas mãos).
 * Calibração (15-13): mexer nas regras do shared (MANA_SHIELD_ABSORB, magias, VOC_GROWTH...) e rodar
 * `npx vitest run packages/server/src/systems/vocationBalance.test.ts --silent=false`; as tabelas saem no console.
 */
const VOCS: Vocation[] = ["knight", "paladin", "sorcerer", "druid"];
type Level = (typeof BALANCE_LEVELS)[number];
type SkillTable = typeof SKILL_ESTIMATE;
/** Sensibilidade: as skills de cavaleiro e paladino da meta do plano (arma 28/46/66) no lugar das da produção. */
const PLAN_SKILLS: SkillTable = {
  ...SKILL_ESTIMATE,
  knight: { melee: [10, 28, 46, 66], distance: [10, 10, 10, 10], magic: [0, 4, 7, 10], shield: [10, 28, 46, 66] },
  paladin: { melee: [10, 10, 10, 10], distance: [10, 28, 46, 66], magic: [0, 8, 15, 22], shield: [10, 10, 10, 10] },
};

interface Row { f: Fighter; m: Measure }
const cache = new Map<SkillTable, Map<number, Row[]>>();
function rows(L: Level, table = SKILL_ESTIMATE): Row[] {
  let byLevel = cache.get(table);
  if (!byLevel) cache.set(table, (byLevel = new Map()));
  let list = byLevel.get(L);
  if (!list) {
    list = VOCS.flatMap((v) => fighterBuilds(v, L, table)).map((f) => ({ f, m: measure(f, BALANCE_PACKS[L]) }));
    byLevel.set(L, list);
  }
  return list;
}
/** Melhor montagem de cada vocação (maior P). */
const best = (L: Level, table = SKILL_ESTIMATE) =>
  VOCS.map((v) => rows(L, table).filter((r) => r.f.v === v).reduce((a, b) => (b.m.p > a.m.p ? b : a)));
/** Pior P ÷ melhor P entre as vocações. */
const spread = (L: Level, table = SKILL_ESTIMATE) => {
  const ps = best(L, table).map((r) => r.m.p);
  return Math.min(...ps) / Math.max(...ps);
};
const leader = (list: Row[], key: "dps" | "survival") => list.reduce((a, b) => (b.m[key] > a.m[key] ? b : a)).f.v;

describe("balanço das vocações (P = dano × sobrevivência)", () => {
  it("tabela por level (console); o pacote pressiona todo mundo (sobrevivência finita)", () => {
    for (const L of BALANCE_LEVELS) {
      const top = Math.max(...best(L).map((r) => r.m.p));
      console.log(`lv ${L} — pacote: ${BALANCE_PACKS[L].join(", ")} — pior/melhor ${spread(L).toFixed(2)}`);
      console.table(rows(L).map(({ f, m }) => ({
        vocação: f.v, montagem: f.build, vida: f.hp, mana: f.mana, armadura: f.armor, ML: f.ml, potência: f.power,
        "dano/s": Math.round(m.dps), "dano/s sem poção de mana": Math.round(packDps(f, BALANCE_PACKS[L], { manaPotions: false })),
        "golpes/s do pacote": Math.round(m.incoming), "aguenta ×": +m.survival.toFixed(2),
        "aguenta × (escudo antigo)": +packSurvival(f, BALANCE_PACKS[L], { absorb: 1 }).toFixed(2),
        P: Math.round(m.p), "P/melhor": +(m.p / top).toFixed(2), "vida efetiva": m.ehp,
      })));
      for (const { f, m } of rows(L)) {
        expect(m.survival, `${f.v}/${f.build} lv ${L}`).toBeGreaterThan(0.5);
        expect(m.survival, `${f.v}/${f.build} lv ${L}`).toBeLessThan(10);
        expect(m.dps, `${f.v}/${f.build} lv ${L}`).toBeGreaterThan(0);
      }
    }
  });

  it("15-13: pior/melhor ≥ 0,65 nos lv 30/60/100", () => {
    // Antes do 15-13 (skills da produção, já com 15-3/4/5/6/9): 0,52 / 0,39 / 0,49, o cavaleiro o pior nos três levels.
    // Depois (Chuva de Gelo de 4 s, paladino com 13 de vida/level, magias de dano do cavaleiro +40%, level no
    // spellPower): 0,74 / 0,66 / 0,86. MANA_SHIELD_ABSORB fica 0,5: 0,6 quase não mexe no P e leva a vida efetiva do
    // mago lv 100 a 1,28× a do cavaleiro.
    for (const L of BALANCE_LEVELS) expect(spread(L), `lv ${L}`).toBeGreaterThanOrEqual(0.65);
  });

  it("Fada (vocação oculta, 2026-10-28): druida de outro elemento — nunca a mais forte com folga, nunca abaixo do piso", () => {
    // Vida/mana e magias espelham o druida; só o elemento muda (sagrado em vez de gelo/terra), e o pacote de cada level
    // responde a ele: lv 30 (fantasma) 1,07× o druida; lv 60 (Bonelord fraco a sagrado, Bruxa do Gelo resiste a gelo)
    // 1,22×; lv 100 (demônios resistem a sagrado) 0,95×. Contra o feiticeiro: 0,85 / 0,93 / 1,07. Medido em 2026-10-28.
    for (const L of BALANCE_LEVELS) {
      const bestOf = (v: Vocation) => fighterBuilds(v, L).map((f) => measure(f, BALANCE_PACKS[L])).reduce((a, b) => (b.p > a.p ? b : a));
      const fairy = bestOf("fairy"), druid = bestOf("druid");
      const top = Math.max(...best(L).map((r) => r.m.p));
      expect(fairy.p / druid.p, `lv ${L}: fada ${fairy.p.toFixed(0)} vs druida ${druid.p.toFixed(0)}`).toBeGreaterThanOrEqual(0.85);
      expect(fairy.p / top, `lv ${L}: fada ${fairy.p.toFixed(0)} vs a melhor ${top.toFixed(0)}`).toBeLessThanOrEqual(1.1);
      const ps = [...best(L).map((r) => r.m.p), fairy.p];
      expect(Math.min(...ps) / Math.max(...ps), `lv ${L} com a Fada`).toBeGreaterThanOrEqual(0.65);
    }
  });

  it("15-13: o feiticeiro não lidera dano e sobrevivência ao mesmo tempo", () => {
    for (const L of BALANCE_LEVELS) {
      const list = best(L);
      expect(leader(list, "dps") === "sorcerer" && leader(list, "survival") === "sorcerer", `lv ${L}`).toBe(false);
    }
  });

  it("sensibilidade: com a arma da meta do plano (28/46/66) cavaleiro e paladino não lideram com folga (console)", () => {
    // Medido no 15-13: 0,74 / 0,73 / 0,83; no lv 100 o cavaleiro de duas mãos fica 2% à frente do paladino.
    for (const L of BALANCE_LEVELS) {
      const list = best(L, PLAN_SKILLS), top = Math.max(...list.map((r) => r.m.p));
      console.log(`arma 28/46/66, lv ${L}: pior/melhor ${spread(L, PLAN_SKILLS).toFixed(2)} — ` +
        list.map(({ f, m }) => `${f.v} ${Math.round(m.dps)}/s × ${m.survival.toFixed(2)} = ${Math.round(m.p)} (${(m.p / top).toFixed(2)})`).join(", "));
      const p = (v: Vocation) => list.find((r) => r.f.v === v)!.m.p;
      const mages = Math.max(p("sorcerer"), p("druid"));
      for (const v of ["knight", "paladin"] as const) expect(p(v) / mages, `${v} lv ${L}`).toBeLessThanOrEqual(1.25);
      expect(Math.max(p("knight"), p("paladin")) / Math.min(p("knight"), p("paladin")), `lv ${L}`).toBeLessThanOrEqual(1.25);
      expect(spread(L, PLAN_SKILLS), `lv ${L}`).toBeGreaterThanOrEqual(0.65);
    }
  });

  it("Escudo de Mana: vida efetiva do mago lv 100 com o escudo cheio ≤ 1,1× a do cavaleiro (era 2,3× com tudo na mana)", () => {
    const s = fighter("sorcerer", 100)!, k = fighter("knight", 100, "shield")!;
    expect(effectiveHp(s, 1)).toBe(s.hp + s.mana); // escudo de antes: 1.144 de vida + 3.980 de mana
    expect(effectiveHp(s, 1) / effectiveHp(k)).toBeGreaterThan(2);
    expect(effectiveHp(s, MANA_SHIELD_ABSORB) / effectiveHp(k)).toBeLessThanOrEqual(1.1);
    expect(effectiveHp(fighter("druid", 100)!)).toBe(effectiveHp(s)); // o druida tem o mesmo escudo
    expect(effectiveHp(fighter("paladin", 100)!)).toBe(fighter("paladin", 100)!.hp);
  });
});

describe("balanceKit: o jogador bem equipado", () => {
  it("montagens: cavaleiro com escudo (uma mão) e de duas mãos (sem escudo); paladino nunca tem escudo; magos com livro", () => {
    for (const L of [30, 60, 100]) {
      const [sh, two] = fighterBuilds("knight", L);
      expect(sh!.build).toBe("shield");
      expect(sh!.gear.find((g) => g.slot === "weapon")!.twoHanded).toBeFalsy();
      expect(sh!.gear.some((g) => g.slot === "shield")).toBe(true);
      expect(two!.build).toBe("twoHanded");
      expect(two!.gear.find((g) => g.slot === "weapon")!.twoHanded).toBe(true);
      expect(two!.gear.some((g) => g.slot === "shield")).toBe(false);
      expect(two!.armor).toBeLessThan(sh!.armor); // sem o escudo e sem a skill Escudo
      const p = fighterBuilds("paladin", L);
      expect(p).toHaveLength(1);
      expect(p[0]!.gear.some((g) => g.slot === "shield")).toBe(false);
      for (const v of ["sorcerer", "druid"] as const) expect(fighter(v, L)!.gear.find((g) => g.slot === "shield")!.icon.url).toContain("Book");
    }
    expect(fighter("knight", 10, "twoHanded")).toBeUndefined(); // martelo de duas mãos só no lv 15
  });

  it("skills de skillEstimate (sem o bônus do equipamento); ML e potência com o equipamento", () => {
    const s = fighter("sorcerer", 60)!, k = fighter("knight", 100, "shield")!;
    expect(s.skills).toEqual(skillEstimate("sorcerer", 60));
    expect(s.ml).toBeGreaterThan(s.skills.magic);
    expect(s.power).toBe(s.ml); // mago: potência = ML
    expect(k.power).toBeGreaterThan(k.ml); // cavaleiro: a skill da arma rende mais que o ML (spellPower)
  });
});

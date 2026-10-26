import { describe, expect, it } from "vitest";
import { BOSS_ROOT_SLOW_PCT, SPELLS } from "@lemonquest/shared";
import { ConditionSystem } from "./conditions.ts";
import { def, openGrid, world } from "./testkit.ts";

/** Um chefe e um monstro comum parados, e o sistema de condições ligado ao mundo de teste. */
function setup() {
  const w = world({
    grid: openGrid(30, 30),
    spawns: [{ defId: "chefe", x: 5, y: 5, count: 1, radius: 0 }, { defId: "comum", x: 9, y: 5, count: 1, radius: 0 }],
    defs: (id) => def({ id, hp: 5000, aggroRange: 0, boss: id === "chefe" }),
  });
  w.mm.spawnAll();
  const conditions = new ConditionSystem({
    monsters: w.mm, combat: w.combat, getPlayer: (id) => w.players.get(id), players: () => w.players.values(), send: () => {},
  });
  const by = (id: string) => [...w.mm.all()].find((m) => m.def.id === id)!;
  return { ...w, conditions, boss: by("chefe"), mob: by("comum") };
}

describe("controle em chefe (ciclo 15)", () => {
  it("raiz vira lentidão de 30% no chefe; no monstro comum continua prendendo", () => {
    const w = setup();
    const roots = SPELLS.earth_roots!.condition!;
    for (const m of [w.boss, w.mob]) w.conditions.apply(m.s.id, roots.id, roots.durationMs, roots.value, "druida", w.now());
    expect(w.conditions.has(w.boss.s.id, "rooted")).toBe(false);
    expect(w.conditions.value(w.boss.s.id, "slow")).toBe(BOSS_ROOT_SLOW_PCT);
    expect(w.boss.speedPct).toBe(70);
    expect(w.conditions.has(w.mob.s.id, "rooted")).toBe(true);
    expect(w.mob.speedPct).toBe(0);
  });

  it("lentidão vale metade no chefe (Fúria da Natureza 50% → 25%) e não rebaixa a lentidão da raiz", () => {
    const w = setup();
    const fury = SPELLS.nature_fury!.condition!;
    w.conditions.apply(w.boss.s.id, fury.id, fury.durationMs, fury.value, "druida", w.now());
    w.conditions.apply(w.mob.s.id, fury.id, fury.durationMs, fury.value, "druida", w.now());
    expect(w.conditions.value(w.boss.s.id, "slow")).toBe(25);
    expect(w.boss.speedPct).toBe(75);
    expect(w.conditions.value(w.mob.s.id, "slow")).toBe(50);
    // A raiz (30%) passa por cima dos 25%; uma Chuva de Gelo depois (40% → 20%) não rebaixa.
    w.conditions.apply(w.boss.s.id, "rooted", 3000, undefined, "druida", w.now());
    expect(w.conditions.value(w.boss.s.id, "slow")).toBe(30);
    const rain = SPELLS.ice_rain!.condition!;
    w.conditions.apply(w.boss.s.id, rain.id, rain.durationMs, rain.value, "druida", w.now());
    expect(w.conditions.value(w.boss.s.id, "slow")).toBe(30);
  });

  it("as outras condições no chefe não mudam", () => {
    const w = setup();
    w.conditions.apply(w.boss.s.id, "burn", 4000, 12, "mago", w.now());
    w.conditions.apply(w.boss.s.id, "exposed", 12_000, 15, "mago", w.now());
    expect([w.conditions.value(w.boss.s.id, "burn"), w.conditions.value(w.boss.s.id, "exposed")]).toEqual([12, 15]);
  });
});

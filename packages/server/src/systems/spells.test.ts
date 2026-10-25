import { describe, expect, it, vi } from "vitest";
import {
  HOTKEY_MAX, defaultHotkeys,
  BASE_STEP_MS, Dir, evalSpellFormula, mitigateSpell, playerDamageRange, GLOBAL_SPELL_COOLDOWN_MS, S2C, SKILL_START, TICK_MS, skillTriesFor, stepDuration,
  MONSTERS, SPELLS, spellMana, spellsFor, type MonsterDef, type SpellDef, type Vocation,
} from "@lemonquest/shared";
import { ConditionSystem } from "./conditions.ts";
import { SkillSystem } from "./skills.ts";
import { SummonSystem } from "./summons.ts";
import { SpellSystem, circleTiles, waveTiles } from "./spells.ts";
import { MovementSystem } from "./movement.ts";
import { handleChat } from "./chat.ts";
import { def, grid, openGrid, player, world } from "./testkit.ts";
import type { CollisionGrid } from "@lemonquest/shared";
import type { PlayerState } from "../state.ts";

const F = (base: number) => ({ base, perLevel: 0, perMagic: 0, variance: 0 });

const SP: Record<string, SpellDef> = {
  heal: { id: "heal", name: "h", words: "exura", vocations: ["druid"], level: 1, mana: 20, cooldownMs: 2000, target: "self", heal: F(30), fx: "heal", description: "" },
  bolt: { id: "bolt", name: "b", words: "exori", vocations: ["druid"], level: 1, mana: 10, cooldownMs: 3000, target: "target", range: 4, damage: { ...F(20), kind: "ice" }, fx: "ice", description: "" },
  big: { id: "big", name: "g", words: "exori gran", vocations: ["druid"], level: 20, mana: 10, cooldownMs: 1000, target: "self", heal: F(1), fx: "heal", description: "" },
  free: { id: "free", name: "f", words: "utani", vocations: ["druid"], level: 1, mana: 0, cooldownMs: 500, global: false, target: "self", condition: { id: "haste", durationMs: 4000, value: 100 }, fx: "buff", description: "" },
  ring: { id: "ring", name: "r", words: "exevo", vocations: ["druid"], level: 1, mana: 0, cooldownMs: 0, target: "area_self", radius: 1, damage: { ...F(10), kind: "fire" }, condition: { id: "burn", durationMs: 4000, value: 3 }, fx: "fire", description: "" },
  wave: { id: "wave", name: "w", words: "exevo vis", vocations: ["druid"], level: 1, mana: 0, cooldownMs: 0, target: "wave", length: 4, width: 3, damage: { ...F(10), kind: "energy" }, fx: "energy", description: "" },
  root: { id: "root", name: "rt", words: "exori tera", vocations: ["druid"], level: 1, mana: 0, cooldownMs: 0, target: "target", range: 4, condition: { id: "rooted", durationMs: 3000 }, fx: "root", description: "" },
  shield: { id: "shield", name: "ms", words: "utamo vita", vocations: ["druid"], level: 1, mana: 0, cooldownMs: 0, target: "self", condition: { id: "manashield", durationMs: 10_000 }, fx: "buff", description: "" },
  prot: { id: "prot", name: "pr", words: "utamo tempo", vocations: ["druid"], level: 1, mana: 0, cooldownMs: 0, target: "self", condition: { id: "protect", durationMs: 10_000, value: 50 }, fx: "buff", description: "" },
  regen: { id: "regen", name: "rg", words: "utura", vocations: ["druid"], level: 1, mana: 0, cooldownMs: 0, target: "self", condition: { id: "regen", durationMs: 3000, value: 5 }, fx: "heal", description: "" },
  party: { id: "party", name: "pt", words: "exura mas sio", vocations: ["druid"], level: 1, mana: 0, cooldownMs: 0, target: "party", radius: 3, heal: F(10), fx: "heal", description: "" },
  summon: { id: "summon", name: "s", words: "utevo res", vocations: ["druid"], level: 1, mana: 0, cooldownMs: 0, target: "self", summon: { monsterId: "pet", count: 1, durationMs: 20_000 }, fx: "summon", description: "" },
  taunt: { id: "taunt", name: "t", words: "exeta res", vocations: ["knight"], level: 1, mana: 0, cooldownMs: 0, target: "area_self", radius: 3, taunt: true, condition: { id: "taunted", durationMs: 5000 }, fx: "taunt", description: "" },
  dash: { id: "dash", name: "d", words: "exori hur", vocations: ["knight"], level: 1, mana: 0, cooldownMs: 0, target: "target", range: 4, dash: true, damage: { ...F(5), kind: "physical" }, fx: "charge", description: "" },
};

// Curas reais do catálogo (ids não colidem com as fixtures).
Object.assign(SP, { light_heal: SPELLS.light_heal });
// Magias de utilidade do lv 100 (ciclo 12), reais do catálogo.
Object.assign(SP, {
  shield_wall: SPELLS.shield_wall, iron_skin: SPELLS.iron_skin, restoring_light: SPELLS.restoring_light,
  elemental_rupture: SPELLS.elemental_rupture, earth_roots: SPELLS.earth_roots,
});

// Fixtures fora do cooldown global (exceto heal/bolt/big/free), para os testes de efeito.
for (const s of Object.values(SP)) if (!["heal", "bolt", "big", "free", "light_heal"].includes(s.id)) s.global = false;

interface SetupOpts { grid?: CollisionGrid; monsters?: { x: number; y: number; def?: Partial<MonsterDef> }[]; safeZones?: { x0: number; y0: number; x1: number; y1: number }[]; isAlly?: (a: PlayerState, b: PlayerState) => boolean }

function setup(o: SetupOpts = {}) {
  const mons = o.monsters ?? [{ x: 10, y: 10 }];
  const defs: Record<string, MonsterDef> = { pet: def({ id: "pet", name: "Pet", hp: 100, damage: [7, 7], aggroRange: 0, xp: 0, stepMs: 200 }) };
  mons.forEach((m, i) => { defs[`d${i}`] = def({ id: `d${i}`, hp: 1000, aggroRange: 0, armor: 0, ...m.def }); });
  const w = world({
    grid: o.grid ?? openGrid(40, 40), safeZones: o.safeZones,
    spawns: mons.map((m, i) => ({ defId: `d${i}`, x: m.x, y: m.y, count: 1, radius: 0 })),
    defs: (id) => defs[id], spawn: { x: 35, y: 35 },
  });
  w.mm.spawnAll();
  const send = (to: string, type: string, msg: unknown) => w.sent.push({ to, type, msg });
  const skills = new SkillSystem(send);
  const conditions = new ConditionSystem({ monsters: w.mm, combat: w.combat, getPlayer: (id) => w.players.get(id), players: () => w.players.values(), send });
  const summons = new SummonSystem({ monsters: w.mm, combat: w.combat, getPlayer: (id) => w.players.get(id), defs: (id) => defs[id] });
  const spells = new SpellSystem({
    grid: o.grid ?? openGrid(40, 40), monsters: w.mm, combat: w.combat, conditions, summons, skills,
    players: () => w.players.values(), getPlayer: (id) => w.players.get(id),
    teleport: (p, x, y) => { p.x = x; p.y = y; }, send, broadcast: (type, msg) => send("*", type, msg),
    now: w.now, rng: () => 0.5, spells: (id) => SP[id], isAlly: o.isAlly,
  });
  w.combat.hooks = {
    damageTakenPct: (id) => conditions.damageTakenPct(id),
    manaShield: (id) => conditions.manaShield(id),
    onPlayerDied: (p) => { conditions.clear(p.id); summons.despawnOwner(p.id); },
  };
  const ms = [...w.mm.all()];
  const run = (ms: number) => {
    const end = w.now() + ms;
    while (w.now() < end) {
      w.setClock(w.now() + TICK_MS);
      w.mm.tick(w.now());
      w.combat.tick(w.now());
      conditions.tick(w.now());
      conditions.sync(w.now());
      w.combat.flush();
    }
  };
  const addP = (id: string, x: number, y: number, over: Partial<PlayerState> = {}) => {
    const p = w.add(player(id, x, y, { vocation: "druid", mana: 500, maxMana: 500, hp: 100, maxHp: 200, magicLevel: 0, speedPct: 100, ...over }));
    skills.load(p);
    w.mm.playerList = [...w.players.values()];
    return p;
  };
  const results = (to: string) => w.sent.filter((s) => s.to === to && s.type === S2C.CastResult).map((s) => s.msg);
  const events = () => { w.combat.flush(); return w.sent.filter((s) => s.type === S2C.Combat).flatMap((s) => s.msg.events); };
  return { ...w, ms, skills, conditions, summons, spells, run, addP, results, events, defs };
}

describe("cast validation", () => {
  it("fails with each reason, only to the caster", () => {
    const w = setup({ safeZones: [{ x0: 0, y0: 0, x1: 2, y1: 2 }] });
    const p = w.addP("p", 11, 10);
    expect(w.spells.cast(p, "nope")).toMatchObject({ ok: false, reason: "unknown" });
    expect(w.spells.cast(p, "taunt")).toMatchObject({ ok: false, reason: "vocation" });
    expect(w.spells.cast(p, "big")).toMatchObject({ ok: false, reason: "level" });
    expect(w.spells.cast(p, "bolt")).toMatchObject({ ok: false, reason: "target" }); // sem alvo
    p.targetId = w.ms[0].s.id;
    p.x = 20;
    expect(w.spells.cast(p, "bolt")).toMatchObject({ ok: false, reason: "range" });
    p.x = 1; p.y = 1;
    expect(w.spells.cast(p, "bolt")).toMatchObject({ ok: false, reason: "pz" });
    expect(w.spells.cast(p, "heal")).toMatchObject({ ok: true }); // cura na PZ pode
    p.x = 11; p.y = 10;
    w.run(GLOBAL_SPELL_COOLDOWN_MS);
    p.mana = 5;
    expect(w.spells.cast(p, "bolt")).toMatchObject({ ok: false, reason: "mana" });
    p.hp = 0;
    expect(w.spells.cast(p, "bolt")).toMatchObject({ ok: false, reason: "dead" });
    const all = w.sent.filter((s) => s.type === S2C.CastResult);
    expect(all.every((s) => s.to === "p")).toBe(true);
    expect(w.sent.filter((s) => s.type === S2C.SpellCast)).toHaveLength(1);
  });

  it("spends mana, sets per-spell and global cooldowns, broadcasts SpellCast", () => {
    const w = setup();
    const p = w.addP("p", 11, 10);
    const r = w.spells.cast(p, "bolt", w.ms[0].s.id);
    expect(r).toEqual({ spellId: "bolt", ok: true, cooldownMs: 3000, globalMs: GLOBAL_SPELL_COOLDOWN_MS });
    expect(p.mana).toBe(490);
    expect(w.sent.find((s) => s.type === S2C.SpellCast)).toMatchObject({ to: "*", msg: { spellId: "bolt", casterId: "p", targetId: w.ms[0].s.id, x: 10, y: 10 } });
    expect(w.events()[0]).toMatchObject({ sourceId: "p", targetId: w.ms[0].s.id, amount: 20, kind: "ice" });
    // global bloqueia outra magia
    expect(w.spells.cast(p, "heal")).toMatchObject({ ok: false, reason: "cooldown", globalMs: GLOBAL_SPELL_COOLDOWN_MS });
    // global:false ignora o global
    expect(w.spells.cast(p, "free")).toMatchObject({ ok: true, globalMs: 0 });
    w.run(GLOBAL_SPELL_COOLDOWN_MS);
    expect(w.spells.cast(p, "heal")).toMatchObject({ ok: true });
    w.run(GLOBAL_SPELL_COOLDOWN_MS);
    const cd = w.spells.cast(p, "bolt", w.ms[0].s.id);
    expect(cd).toMatchObject({ ok: false, reason: "cooldown" });
    expect(cd.cooldownMs).toBeGreaterThan(0);
    w.run(1000);
    expect(w.spells.cast(p, "bolt", w.ms[0].s.id)).toMatchObject({ ok: true });
  });

  it("targeted spells default to the current target; heals emit kind heal on the healed id", () => {
    const w = setup();
    const p = w.addP("p", 11, 10);
    p.targetId = w.ms[0].s.id;
    expect(w.spells.cast(p, "bolt")).toMatchObject({ ok: true });
    w.run(GLOBAL_SPELL_COOLDOWN_MS);
    p.hp = 100;
    w.spells.cast(p, "heal");
    const heal = w.events().find((e: any) => e.kind === "heal");
    expect(heal).toEqual({ sourceId: "p", targetId: "p", amount: 30, kind: "heal" });
    expect(p.hp).toBe(130);
  });

  it("party heal reaches all players within radius", () => {
    const w = setup();
    const p = w.addP("p", 20, 20);
    const a = w.addP("a", 22, 20, { hp: 50 });
    const b = w.addP("b", 30, 20, { hp: 50 });
    w.spells.cast(p, "party");
    expect([p.hp, a.hp, b.hp]).toEqual([110, 60, 50]);
  });

  it("party heal with a party: only self + party members within radius (strangers nearby are skipped)", () => {
    const party = new Set(["p", "a", "far"]);
    const w = setup({ isAlly: (x, y) => party.has(x.id) && party.has(y.id) });
    const p = w.addP("p", 20, 20, { hp: 100 });
    const a = w.addP("a", 22, 20, { hp: 50 });
    const stranger = w.addP("s", 21, 20, { hp: 50 });
    const far = w.addP("far", 30, 20, { hp: 50 });
    w.spells.cast(p, "party");
    expect([p.hp, a.hp, stranger.hp, far.hp]).toEqual([110, 60, 50, 50]);
    // Sem grupo: só o próprio conjurador.
    party.clear();
    w.spells.cast(p, "party");
    expect([p.hp, a.hp, stranger.hp]).toEqual([120, 60, 50]);
  });
});

describe("areas", () => {
  it("circle tiles: r1 = 3x3, r2 = 5x5 without corners, walls excluded", () => {
    expect(circleTiles(5, 5, 1)).toHaveLength(9);
    const r2 = circleTiles(5, 5, 2);
    expect(r2).toHaveLength(21);
    expect(r2).not.toContainEqual({ x: 3, y: 3 });
    expect(circleTiles(5, 5, 1, (x, y) => x === 6 && y === 5)).toHaveLength(8);
  });

  it("Golpe Frontal: retângulo 3×3 à frente (pega as diagonais encostadas); as outras ondas seguem em cone", () => {
    const s = SPELLS.front_sweep!;
    expect(s).toMatchObject({ target: "wave", length: 3, width: 3, rect: true });
    const t = waveTiles(10, 10, Dir.N, s.length!, s.width!, undefined, s.rect);
    expect(t).toHaveLength(9);
    for (const y of [9, 8, 7]) for (const x of [9, 10, 11]) expect(t).toContainEqual({ x, y });
    // Parede bem à frente para só a coluna do meio; as diagonais encostadas continuam.
    const wall = waveTiles(10, 10, Dir.E, 3, 3, (x, y) => x === 11 && y === 10, true);
    expect(wall).toHaveLength(6);
    expect(wall).toContainEqual({ x: 11, y: 9 });
    expect(wall).toContainEqual({ x: 11, y: 11 });
    expect(wall).not.toContainEqual({ x: 12, y: 10 });
    // Sem `rect`, a mesma onda é o cone de antes (1 + 3 + 3).
    expect(waveTiles(10, 10, Dir.N, 3, 3)).toHaveLength(7);
    expect(Object.values(SPELLS).filter((x) => x.rect).map((x) => x.id)).toEqual(["front_sweep"]);
  });

  it("wave tiles: cone forward, widening, diagonal facing uses horizontal, walls stop rays", () => {
    const t = waveTiles(10, 10, Dir.N, 4, 3);
    expect(t).toEqual([
      { x: 10, y: 9 }, { x: 10, y: 8 },
      { x: 9, y: 7 }, { x: 10, y: 7 }, { x: 11, y: 7 },
      { x: 9, y: 6 }, { x: 10, y: 6 }, { x: 11, y: 6 },
    ]);
    expect(waveTiles(10, 10, Dir.NE, 2, 1)).toEqual([{ x: 11, y: 10 }, { x: 12, y: 10 }]);
    // Parede logo à frente bloqueia tudo.
    expect(waveTiles(10, 10, Dir.S, 4, 3, (x, y) => x === 10 && y === 11)).toEqual([]);
    // Parede no meio corta só o raio central (e os laterais que nasceriam atrás dela ainda passam se abertos antes).
    const cut = waveTiles(10, 10, Dir.E, 4, 3, (x, y) => x === 12 && y === 10);
    expect(cut).toContainEqual({ x: 11, y: 10 });
    expect(cut).not.toContainEqual({ x: 13, y: 10 });
    expect(cut).not.toContainEqual({ x: 13, y: 9 });
  });

  it("area damage hits wild monsters on tiles, not summons, and applies dot", () => {
    const w = setup({ monsters: [{ x: 11, y: 10 }, { x: 13, y: 10 }] });
    const p = w.addP("p", 10, 10);
    w.spells.cast(p, "summon");
    const pet = w.mm.get(w.summons.ownedBy("p")[0])!;
    w.mm.place(pet, 9, 10);
    w.spells.cast(p, "ring");
    expect(w.ms[0].s.hp).toBe(990);
    expect(w.ms[1].s.hp).toBe(1000);
    expect(pet.s.hp).toBe(100);
    const sc = w.sent.filter((s) => s.type === S2C.SpellCast).at(-1)!.msg;
    expect(sc.tiles).toHaveLength(18);
    w.summons.despawnOwner("p");
    // burn: 3 a cada 2 s por 4 s → 2 tiques
    w.run(4100);
    expect(w.ms[0].s.hp).toBe(984);
    w.run(3000);
    expect(w.ms[0].s.hp).toBe(984);
  });

  it("wave hits monsters in front only", () => {
    const w = setup({ monsters: [{ x: 13, y: 9 }, { x: 8, y: 10 }] });
    const p = w.addP("p", 10, 10, { dir: Dir.E });
    w.spells.cast(p, "wave");
    expect(w.ms[0].s.hp).toBe(990);
    expect(w.ms[1].s.hp).toBe(1000);
  });
});

describe("conditions", () => {
  it("haste shortens player steps (speedPct) and expires", () => {
    const w = setup();
    const now = { t: 0 };
    const p = w.addP("p", 20, 20);
    const mv = new MovementSystem(openGrid(40, 40), { now: () => now.t });
    mv.addPlayer(p);
    w.spells.cast(p, "free");
    expect(p.speedPct).toBe(200);
    mv.onMove(p, { dir: Dir.E, seq: 1 });
    expect(p.stepMs).toBe(Math.round(BASE_STEP_MS / 2));
    expect(p.stepMs).toBe(stepDuration(1, Dir.E, 100, 200));
    w.run(200);
    const c = w.sent.filter((s) => s.type === S2C.Conditions && s.to === "p").at(-1)!.msg;
    expect(c.list).toContainEqual(expect.objectContaining({ id: "haste", value: 100 }));
    w.run(4000);
    expect(p.speedPct).toBe(100);
    expect(w.sent.filter((s) => s.type === S2C.Conditions && s.to === "p").at(-1)!.msg.list.some((x: any) => x.id === "haste")).toBe(false);
  });

  it("conditions list includes combat and pz", () => {
    const w = setup({ safeZones: [{ x0: 0, y0: 0, x1: 3, y1: 3 }] });
    const p = w.addP("p", 1, 1);
    w.run(100);
    expect(w.sent.filter((s) => s.type === S2C.Conditions).at(-1)!.msg.list).toEqual([{ id: "pz" }]);
    p.x = 11; p.y = 10;
    w.spells.cast(p, "bolt", w.ms[0].s.id);
    w.run(100);
    expect(w.sent.filter((s) => s.type === S2C.Conditions).at(-1)!.msg.list).toEqual([{ id: "combat" }]);
  });

  it("manashield takes damage from mana first; protect reduces damage", () => {
    const w = setup({ monsters: [{ x: 11, y: 10, def: { aggroRange: 5, damage: [20, 20], attackMs: 1000 } }] });
    const p = w.addP("p", 10, 10, { mana: 15, hp: 200 });
    w.spells.cast(p, "shield");
    w.run(600);
    expect(p.mana).toBe(0);
    expect(p.hp).toBe(195);
    const ev = w.events().filter((e: any) => e.targetId === "p");
    expect(ev[0]).toMatchObject({ kind: "mana", amount: 15 });
    expect(ev[1]).toMatchObject({ kind: "physical", amount: 5 });
    w.conditions.clear("p");
    w.spells.cast(p, "prot");
    w.run(1000);
    expect(p.hp).toBe(185);
  });

  it("regen heals every second", () => {
    const w = setup();
    const p = w.addP("p", 20, 20, { hp: 100 });
    w.spells.cast(p, "regen");
    w.run(3100);
    expect(p.hp).toBe(115);
  });

  it("rooted monsters cannot step; taunt forces target", () => {
    const w = setup({ monsters: [{ x: 14, y: 10, def: { aggroRange: 8 } }] });
    const p = w.addP("p", 10, 10);
    w.spells.cast(p, "root", w.ms[0].s.id);
    w.run(2500);
    expect([w.ms[0].s.x, w.ms[0].s.y]).toEqual([14, 10]);
    w.run(2000);
    expect(w.ms[0].s.x).toBeLessThan(14);

    const t = setup({ monsters: [{ x: 14, y: 10, def: { aggroRange: 8 } }] });
    const a = t.addP("a", 12, 10);
    const k = t.addP("k", 16, 12, { vocation: "knight" });
    t.run(300);
    expect(t.ms[0].s.targetId).toBe("a");
    t.spells.cast(k, "taunt");
    t.run(300);
    expect(t.ms[0].s.targetId).toBe("k");
    expect(a.hp).toBeGreaterThan(0);
  });
});

describe("dash", () => {
  it("moves the knight next to the target; a wall in the line blocks the cast (no_los)", () => {
    const w = setup({ monsters: [{ x: 14, y: 10 }] });
    const k = w.addP("k", 10, 10, { vocation: "knight" });
    expect(w.spells.cast(k, "dash", w.ms[0].s.id)).toMatchObject({ ok: true });
    expect([k.x, k.y]).toEqual([13, 10]);
    expect(w.ms[0].s.hp).toBe(995);

    const g = grid(["..........", "..........", "....#.....", ".........."]);
    const v = setup({ grid: g, monsters: [{ x: 6, y: 2 }] });
    const k2 = v.addP("k", 2, 2, { vocation: "knight" });
    expect(v.spells.cast(k2, "dash", v.ms[0].s.id)).toMatchObject({ ok: false, reason: "no_los" });
    expect([k2.x, k2.y]).toEqual([2, 2]);
  });
});

describe("summons", () => {
  it("a invocação escala com o level do invocador: lv 20 = catálogo, lv 46 = vida 570 e dano ×1,75 (GD-05)", () => {
    const w = setup();
    w.defs.wolf = { ...MONSTERS.summoned_wolf! };
    const spec = { monsterId: "wolf", count: 1, durationMs: 10_000 };
    const a = w.addP("a", 10, 10, { level: 20 });
    w.summons.summon(a, spec, w.now());
    const wolf20 = w.mm.get(w.summons.ownedBy("a")[0]!)!;
    expect([wolf20.s.hp, wolf20.s.maxHp, wolf20.def.damage]).toEqual([180, 180, [14, 26]]);
    const b = w.addP("b", 14, 14, { level: 46 });
    w.summons.summon(b, spec, w.now());
    const wolf46 = w.mm.get(w.summons.ownedBy("b")[0]!)!;
    expect([wolf46.s.hp, wolf46.s.maxHp, wolf46.def.damage]).toEqual([570, 570, [25, 46]]);
    expect(w.defs.wolf).toMatchObject({ hp: 180, damage: [14, 26] }); // o catálogo não muda
  });

  it("follows the owner, attacks the owner's target (owner gets credit), replaces on recast, despawns", () => {
    const w = setup({ monsters: [{ x: 22, y: 10, def: { hp: 1000, aggroRange: 0, damage: [0, 0] } }] });
    const p = w.addP("p", 10, 10);
    expect(w.spells.cast(p, "summon")).toMatchObject({ ok: true });
    const [id] = w.summons.ownedBy("p");
    const pet = w.mm.get(id)!;
    expect(pet.s.ownerId).toBe("p");
    // Segue o dono
    p.x = 16; w.mm.playerList = [...w.players.values()];
    w.run(3000);
    expect(Math.max(Math.abs(pet.s.x - p.x), Math.abs(pet.s.y - p.y))).toBeLessThanOrEqual(3);
    // Ataca o alvo do dono
    p.targetId = w.ms[0].s.id;
    w.run(4000);
    expect(w.ms[0].s.hp).toBeLessThan(1000);
    expect(w.ms[0].damageBy.get("p")).toBeGreaterThan(0);
    expect(w.ms[0].s.targetId).toBe(pet.s.id); // revida na invocação
    // owner can't auto-attack / target own summon
    w.combat.onAttack(p, { targetId: pet.s.id });
    expect(p.targetId).not.toBe(pet.s.id);
    // Reconjurar substitui
    w.spells.cast(p, "summon");
    expect(w.mm.get(id)).toBeUndefined();
    expect(w.summons.ownedBy("p")).toHaveLength(1);
    // Expira
    w.run(20_100);
    expect(w.summons.ownedBy("p")).toHaveLength(0);
    // Dono a mais de 20 tiles → some
    w.spells.cast(p, "summon");
    expect(w.summons.ownedBy("p")).toHaveLength(1);
    p.x = 39; p.y = 39;
    w.run(100);
    expect(w.summons.ownedBy("p")).toHaveLength(0);
    // Dono saiu → some
    w.spells.cast(p, "summon");
    w.run(100);
    expect(w.summons.ownedBy("p")).toHaveLength(1);
    w.players.delete("p");
    w.run(100);
    expect(w.summons.ownedBy("p")).toHaveLength(0);
  });

  it("wild monsters kill summons without giving xp or respawning them", () => {
    const w = setup({ monsters: [{ x: 13, y: 10, def: { hp: 1000, aggroRange: 0, damage: [60, 60], attackMs: 500 } }] });
    const p = w.addP("p", 10, 10, { xp: 0 });
    w.spells.cast(p, "summon");
    const pet = w.mm.get(w.summons.ownedBy("p")[0])!;
    w.ms[0].s.targetId = pet.s.id; w.ms[0].mode = "chase";
    w.run(5000);
    expect(w.summons.ownedBy("p")).toHaveLength(0);
    expect(w.mm.pendingRespawns).toBe(0);
    expect(p.xp).toBe(0);
  });
});

describe("skills", () => {
  it("magic levels up from mana spent; SkillUp sent; pct tracked; persistence roundtrip", () => {
    const sent: any[] = [];
    const sk = new SkillSystem((to, type, msg) => sent.push({ to, type, msg }));
    const p = player("p", 0, 0, { vocation: "druid" });
    sk.load(p);
    expect([p.magicLevel, p.skillMelee, p.skillDistance, p.skillShield]).toEqual([SKILL_START.magic, 10, 10, 10]);
    const need = skillTriesFor("magic", 0, "druid");
    sk.addTries(p, "magic", need + 10);
    expect(p.magicLevel).toBe(1);
    expect(p.magicPct).toBe(Math.floor((10 * 100) / skillTriesFor("magic", 1, "druid")));
    expect(sent).toEqual([{ to: "p", type: S2C.SkillUp, msg: { skill: "magic", level: 1 } }]);
    const saved = JSON.parse(JSON.stringify(sk.serialize("p")));
    const q = player("p", 0, 0, { vocation: "druid" });
    const sk2 = new SkillSystem();
    sk2.load(q, saved);
    expect(q.magicLevel).toBe(1);
    expect(sk2.get("p", "magic")).toEqual({ level: 1, tries: 10 });
  });

  it("knight melee tries per auto-attack and skill raises damage", () => {
    const w = setup({ monsters: [{ x: 11, y: 10 }] });
    const k = w.addP("k", 10, 10, { vocation: "knight" });
    w.combat.hooks.onAutoAttack = (p) => w.skills.addTries(p, "melee", 1);
    w.combat.onAttack(k, { targetId: w.ms[0].s.id });
    w.run(2000 * 3 + 100);
    expect(w.skills.get("k", "melee")!.tries).toBe(4);
    expect(playerDamageRange("knight", 1, 10)).toEqual(playerDamageRange("knight", 1));
    expect(playerDamageRange("knight", 10, 30)[1]).toBeGreaterThan(playerDamageRange("knight", 10, 10)[1]);
    expect(evalSpellFormula({ base: 10, perLevel: 1, perMagic: 2, variance: 0.2 }, 10, 5, () => 0.5)).toBe(30);
    expect(mitigateSpell(30, 10, "fire")).toBe(25);
    expect(mitigateSpell(30, 10, "physical")).toBe(20);
  });

  it("cast spends mana into magic tries", () => {
    const w = setup();
    const p = w.addP("p", 20, 20);
    w.spells.cast(p, "heal");
    expect(w.skills.get("p", "magic")!.tries).toBe(20);
  });
});

describe("chat incantations", () => {
  it("words cast the spell and never reach the chat log; failures too", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const w = setup();
    const p = w.addP("p", 20, 20, { name: "Dru" });
    const broadcast = vi.fn();
    const client = { sessionId: "chat-p", send: vi.fn() } as any;
    const castWords = (pl: PlayerState, t: string) => {
      const known = Object.values(SP).find((s) => s.words === t.toLowerCase().trim());
      if (!known) return false;
      w.spells.cast(pl, known.id);
      return true;
    };
    handleChat({ broadcast } as any, client, p, { text: "EXURA", channel: "global" }, { castWords });
    handleChat({ broadcast } as any, client, p, { text: "exura", channel: "global" }, { castWords });
    handleChat({ broadcast } as any, client, p, { text: "olá", channel: "global" }, { castWords });
    expect(broadcast).toHaveBeenCalledTimes(1);
    expect(broadcast.mock.calls[0]![1]).toMatchObject({ text: "olá" });
    expect(w.results("p").map((r: any) => r.ok)).toEqual([true, false]);
  });

  it("castWords uses the real catalog (spellByWords)", () => {
    const w = setup();
    const p = w.addP("p", 20, 20);
    expect(w.spells.castWords(p, "nao e magia")).toBe(false);
  });
});

describe("curas de todas as vocações (catálogo real)", () => {
  const VOCS: Vocation[] = ["knight", "paladin", "sorcerer", "druid"];
  const rangeOf = (id: string, lvl: number, ml: number) => {
    const f = SPELLS[id]!.heal!;
    const avg = f.base + lvl * f.perLevel + ml * f.perMagic;
    return [Math.floor(avg * (1 - f.variance)), Math.ceil(avg * (1 + f.variance))] as const;
  };

  it.each(VOCS)("%s conjura exura: gasta mana (cresce com o level), cura e respeita cooldown", (voc) => {
    const w = setup();
    const p = w.addP("p", 11, 10, { vocation: voc, level: 10, magicLevel: 3, mana: 500, maxMana: 500, hp: 100, maxHp: 1000 });
    const cost = spellMana(SPELLS.light_heal!, 10);
    expect(cost).toBeGreaterThan(SPELLS.light_heal!.mana);
    expect(w.spells.castWords(p, "exura")).toBe(true);
    expect(w.results("p").at(-1)).toMatchObject({ ok: true, spellId: "light_heal" });
    expect(p.mana).toBe(500 - cost);
    const [lo1, hi1] = rangeOf("light_heal", 10, 3);
    expect(p.hp - 100).toBeGreaterThanOrEqual(lo1);
    expect(p.hp - 100).toBeLessThanOrEqual(hi1);
    // cooldown: segunda conjuração imediata falha e não gasta mana
    expect(w.spells.castWords(p, "exura")).toBe(true);
    expect(w.results("p").at(-1)).toMatchObject({ ok: false });
    expect(p.mana).toBe(500 - cost);
    w.run(GLOBAL_SPELL_COOLDOWN_MS + 100);
    expect(w.spells.castWords(p, "exura")).toBe(true);
    expect(w.results("p").at(-1)).toMatchObject({ ok: true });
    expect(p.mana).toBe(500 - 2 * cost);
  });

  it("Cura: sem mana suficiente (custo do level) falha; exura gran/vita não existem mais", () => {
    const w = setup();
    const p = w.addP("p", 11, 10, { vocation: "sorcerer", level: 30, hp: 100, maxHp: 1000, mana: 64, maxMana: 500 });
    expect(spellMana(SPELLS.light_heal!, 30)).toBe(65);
    expect(w.spells.cast(p, "light_heal")).toMatchObject({ ok: false, reason: "mana" });
    p.mana = 65;
    expect(w.spells.cast(p, "light_heal")).toMatchObject({ ok: true });
    expect(p.mana).toBe(0);
    expect(w.spells.cast(p, "great_heal")).toMatchObject({ ok: false });
    expect(w.spells.cast(p, "vital_heal")).toMatchObject({ ok: false });
    expect(w.spells.castWords(p, "exura gran")).toBe(false);
  });

  it("os atalhos (HOTKEY_MAX) comportam todas as magias de cada vocação (a barra recomendada, com as famílias)", () => {
    for (const v of VOCS) expect(defaultHotkeys(v).length, v).toBeLessThanOrEqual(HOTKEY_MAX);
  });
});

describe("magias de utilidade do lv 100 (ciclo 12)", () => {
  it("Ruptura Elemental: o alvo perde a resistência ao próprio elemento e toma +15% de dano elemental; físico igual", () => {
    const w = setup({ monsters: [{ x: 10, y: 10, def: { damageKind: "fire", hp: 100_000 } }] });
    w.combat.hooks.exposedPct = (id) => w.conditions.value(id, "exposed");
    const p = w.addP("p", 12, 10, { vocation: "sorcerer", level: 100, mana: 5000, maxMana: 5000 });
    const m = w.ms[0]!;
    expect(w.combat.damageMonster(m, "p", 100, "fire", w.now())).toBe(50); // resistente ao próprio fogo
    p.targetId = m.s.id;
    expect(w.spells.cast(p, "elemental_rupture")).toMatchObject({ ok: true });
    expect(w.combat.damageMonster(m, "p", 100, "fire", w.now())).toBe(115);
    expect(w.combat.damageMonster(m, "p", 100, "ice", w.now())).toBe(115);
    expect(w.combat.damageMonster(m, "p", 100, "physical", w.now())).toBe(100);
    w.run(12_500); // passou o efeito
    expect(w.combat.damageMonster(m, "p", 100, "fire", w.now())).toBe(50);
  });

  it("Muralha de Escudos: protege o grupo (20%) sem rebaixar a Pele de Ferro (30%) de quem já tem", () => {
    const w = setup({ monsters: [{ x: 30, y: 30 }], isAlly: () => true });
    const k = w.addP("k", 10, 10, { vocation: "knight", level: 100, mana: 5000, maxMana: 5000 });
    const ally = w.addP("a", 12, 10);
    const far = w.addP("f", 20, 10);
    expect(w.spells.cast(k, "iron_skin")).toMatchObject({ ok: true });
    expect(w.spells.cast(k, "shield_wall")).toMatchObject({ ok: true });
    expect(w.conditions.value(k.id, "protect")).toBe(30);
    expect(w.conditions.value(ally.id, "protect")).toBe(20);
    expect(w.conditions.value(far.id, "protect")).toBe(0);
  });

  it("Luz Restauradora: regen de 45/s no grupo a até 4 tiles", () => {
    const w = setup({ monsters: [{ x: 30, y: 30 }], isAlly: () => true });
    const pal = w.addP("pal", 10, 10, { vocation: "paladin", level: 100, mana: 5000, maxMana: 5000 });
    const ally = w.addP("a", 13, 10, { hp: 100, maxHp: 2000 });
    expect(w.spells.cast(pal, "restoring_light")).toMatchObject({ ok: true });
    w.run(3100);
    expect(ally.hp).toBeGreaterThanOrEqual(100 + 3 * 45);
  });

  it("Raízes da Terra: prende os monstros num raio de 3; o de fora continua livre", () => {
    const w = setup({ monsters: [{ x: 12, y: 10 }, { x: 10, y: 13 }, { x: 18, y: 10 }] });
    const d = w.addP("d", 10, 10, { vocation: "druid", level: 100, mana: 5000, maxMana: 5000 });
    expect(w.spells.cast(d, "earth_roots")).toMatchObject({ ok: true });
    expect(w.ms.map((m) => w.conditions.has(m.s.id, "rooted"))).toEqual([true, true, false]);
  });
});

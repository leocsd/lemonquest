// Ciclo 8 — caça mais difícil e variada: elites, pedido de reforço dos bandos, cura dos aliados e o Coliseu compensado.
import { describe, expect, it } from "vitest";
import {
  ARENA_HP_MULT, ELITE, PLAYER_ATTACK_MS, S2C, arenaWaveMult, arenaWaveSpawns, monsterDamageMult, monsterDef, type MonsterAbility,
  type MonsterDef,
} from "@lemonquest/shared";
import { rollLoot } from "./loot.ts";
import { MonsterAbilitySystem } from "./monsterAbilities.ts";
import { HELP_FIRST_HIT, HELP_HALF_HP } from "./monsters.ts";
import { itemsFx } from "./m4kit.ts";
import { def, openGrid, player, world } from "./testkit.ts";

const of = (sent: { type: string; msg: any }[], type: string) => sent.filter((s) => s.type === type);

describe("elites", () => {
  const spawnWith = (eliteChance: number, over: Partial<MonsterDef> = {}) => {
    const w = world({
      grid: openGrid(30, 30), spawns: [{ defId: "dummy", x: 10, y: 10, count: 1, radius: 0 }], eliteChance,
      defs: () => def({ level: 20, hp: 100, xp: 10, aggroRange: 0, ...over }),
    });
    w.mm.spawnAll();
    return { ...w, m: [...w.mm.all()][0]! };
  };

  it("nasce elite pela chance: vida ×2,5, dano ×1,3 e campo sincronizado", () => {
    const { m } = spawnWith(1);
    expect(m.elite).toBe(true);
    expect(m.s.elite).toBe(true);
    expect([m.s.hp, m.s.maxHp]).toEqual([250, 250]);
    expect(m.dmgMult).toBe(ELITE.dmg);
    const plain = spawnWith(0).m;
    expect([plain.elite, plain.s.elite, plain.s.maxHp]).toEqual([undefined, false, 100]);
  });

  it("chefe, level < 10 e invocação nunca viram elite", () => {
    expect(spawnWith(1, { boss: true }).m.elite).toBeUndefined();
    expect(spawnWith(1, { level: 9 }).m.elite).toBeUndefined();
    expect(spawnWith(1, { xp: 0 }).m.elite).toBeUndefined();
  });

  it("elite nunca em onda do Coliseu, sala de quest nem ajudante (que também não herda o dano da elite)", () => {
    const w = spawnWith(1);
    expect(w.m.elite).toBe(true);
    const d = def({ id: "dummy", level: 20, hp: 100, xp: 10 });
    const bounds = { x0: 0, y0: 0, x1: 29, y1: 29 };
    const arena = w.mm.spawnArena(d, 3, 3, { arenaId: 1, bounds, allow: () => true });
    const quest = w.mm.spawnQuest(d, 5, 5, { leverId: "l", bounds })!;
    const minion = w.mm.spawnMinion(d, w.m)!;
    for (const x of [arena, quest, minion]) expect([x.elite, x.s.elite, x.s.maxHp]).toEqual([undefined, false, 100]);
    expect(minion.dmgMult).toBeUndefined();
  });

  it("respawn sorteia a elite de novo", () => {
    const w = spawnWith(1);
    const first = w.m.s.id;
    w.mm.kill(w.m, w.now());
    w.run(def({ level: 20 }).respawnMs + 6000);
    const again = [...w.mm.all()][0]!;
    expect(again.s.id).not.toBe(first);
    expect(again.elite).toBe(true);
  });

  it("elite dá XP ×3", () => {
    const w = spawnWith(1, { armor: 0 });
    const p = w.add(player("k", 11, 10, { hp: 5000, maxHp: 5000 }));
    w.combat.onAttack(p, { targetId: w.m.s.id });
    for (let i = 0; i < 100 && w.mm.get(w.m.s.id); i++) w.run(PLAYER_ATTACK_MS);
    expect(of(w.sent, S2C.XpGain).map((s) => s.msg.amount)).toEqual([30]);
  });

  it("ouro da elite ×2 (rollLoot goldMult); a chance ×2 entra no chanceMult", () => {
    const d = { id: "x", gold: [10, 10], loot: [{ itemId: "bone", chance: 0.3 }] } as unknown as MonsterDef;
    expect(rollLoot(d, () => 0.5, itemsFx, 1, ELITE.gold).gold).toBe(20);
    expect(rollLoot(d, () => 0.5, itemsFx, 1).items).toHaveLength(0); // 0,5 ≥ 0,3
    expect(rollLoot(d, () => 0.5, itemsFx, ELITE.loot).items).toHaveLength(1); // 0,5 < 0,6
  });
});

describe("pedido de reforço (bandos)", () => {
  /** Três lobos passivos da família "wolf": dois perto (a até 6 tiles) e um longe; e um rato de outra família perto. */
  const setup = (over: Partial<MonsterDef> = {}) => {
    const pack = { family: "wolf", shout: "Auuuu!" };
    const w = world({
      grid: openGrid(40, 40),
      spawns: [
        { defId: "w1", x: 10, y: 10, count: 1, radius: 0 }, { defId: "w2", x: 14, y: 10, count: 1, radius: 0 },
        { defId: "w3", x: 30, y: 30, count: 1, radius: 0 }, { defId: "rat", x: 12, y: 12, count: 1, radius: 0 },
      ],
      defs: (id) => def({ id, hp: 100, aggroRange: 0, ...(id === "rat" ? {} : { pack }), ...over }),
    });
    w.mm.spawnAll();
    const by = (id: string) => [...w.mm.all()].find((m) => m.def.id === id)!;
    const sent: unknown[] = [];
    new MonsterAbilitySystem({
      grid: openGrid(40, 40), monsters: w.mm, combat: w.combat, conditions: { apply: () => {} },
      players: () => w.players.values(), broadcast: (type, msg) => sent.push({ type, msg }), rng: () => 0,
    });
    const p = w.add(player("a", 11, 11, { hp: 5000, maxHp: 5000 }));
    return { ...w, p, sent, w1: by("w1"), w2: by("w2"), w3: by("w3"), rat: by("rat") };
  };

  it("1º golpe: grita e chama os da mesma família a até 6 tiles contra quem bateu", () => {
    const w = setup();
    w.combat.damageMonster(w.w1, "a", 5, "physical", w.now());
    expect(w.sent).toEqual([{ type: S2C.SpellCast, msg: expect.objectContaining({ spellId: "m:w1:call_help", casterId: w.w1.s.id }) }]);
    expect([w.w2.mode, w.w2.s.targetId]).toEqual(["chase", "a"]);
    expect(w.w3.mode).toBe("idle"); // longe demais
    expect(w.rat.mode).toBe("idle"); // outra família
    // Mais golpes acima de 50%: não grita de novo.
    w.combat.damageMonster(w.w1, "a", 5, "physical", w.now());
    expect(w.sent).toHaveLength(1);
  });

  it("abaixo de 50% chama de novo (uma vez)", () => {
    const w = setup();
    w.combat.damageMonster(w.w1, "a", 5, "physical", w.now());
    w.setClock(w.now() + 1000); // passa o intervalo do grito da família
    w.w2.mode = "idle"; w.w2.s.targetId = "";
    w.combat.damageMonster(w.w1, "a", 50, "physical", w.now()); // 95 → 45: abaixo da metade
    expect(w.w1.helpCalled).toBe(HELP_FIRST_HIT | HELP_HALF_HP);
    expect(w.sent).toHaveLength(2);
    expect(w.w2.s.targetId).toBe("a");
    w.combat.damageMonster(w.w1, "a", 5, "physical", w.now());
    expect(w.sent).toHaveLength(2);
  });

  it("fugindo (fleeAtHpPct) também chama o bando", () => {
    const w = setup({ fleeAtHpPct: 0.2 });
    w.w1.helpCalled = HELP_FIRST_HIT | HELP_HALF_HP; // já gritou pelos outros motivos
    w.w1.mode = "chase"; w.w1.s.targetId = "a"; w.w1.s.hp = 10;
    w.run(300);
    expect(w.w1.mode).toBe("flee");
    expect(w.sent).toHaveLength(1);
    expect([w.w2.mode, w.w2.s.targetId]).toEqual(["chase", "a"]);
  });

  it("não puxa monstro do Coliseu nem de sala de quest", () => {
    const w = setup();
    const d = def({ id: "w9", hp: 100, aggroRange: 0, pack: { family: "wolf", shout: "Auuuu!" } });
    const bounds = { x0: 0, y0: 0, x1: 39, y1: 39 };
    const arena = w.mm.spawnArena(d, 12, 12, { arenaId: 1, bounds, allow: () => true });
    const quest = w.mm.spawnQuest(d, 9, 12, { leverId: "l", bounds })!;
    arena.mode = "idle"; quest.mode = "idle";
    w.combat.damageMonster(w.w1, "a", 5, "physical", w.now());
    expect(w.w2.s.targetId).toBe("a");
    expect([arena.mode, arena.s.targetId, quest.mode, quest.s.targetId]).toEqual(["idle", "", "idle", ""]);
  });

  it("no máximo um grito por família por segundo (o reforço continua)", () => {
    const w = setup();
    w.combat.damageMonster(w.w1, "a", 5, "physical", w.now());
    w.combat.damageMonster(w.w2, "a", 5, "physical", w.now()); // mesmo instante: grita uma vez só
    expect(w.sent).toHaveLength(1);
    expect(w.w2.helpCalled).toBe(HELP_FIRST_HIT);
    w.run(1000);
    w.combat.damageMonster(w.w3, "a", 5, "physical", w.now());
    expect(w.sent).toHaveLength(2);
  });

  it("quem já luta com outro alvo válido não larga a luta", () => {
    const w = setup();
    w.add(player("b", 15, 11, { hp: 5000, maxHp: 5000 }));
    w.w2.mode = "chase"; w.w2.s.targetId = "b";
    w.combat.damageMonster(w.w1, "a", 5, "physical", w.now());
    expect(w.w2.s.targetId).toBe("b");
  });
});

describe("cura dos aliados (conjuradores)", () => {
  const healAllies: MonsterAbility = {
    id: "heal_allies", name: "Bênção", shape: "self", cooldownMs: 5000, fx: "heal", healAllies: { pct: 0.2, radius: 4, belowHpPct: 0.7 },
  };
  const setup = () => {
    const w = world({
      grid: openGrid(30, 30),
      spawns: [
        { defId: "shaman", x: 10, y: 10, count: 1, radius: 0 }, { defId: "orc", x: 12, y: 10, count: 1, radius: 0 },
        { defId: "far", x: 20, y: 20, count: 1, radius: 0 },
      ],
      defs: (id) => def({ id, hp: 500, damage: [1, 1], attackMs: 1000, aggroRange: id === "shaman" ? 6 : 0, ...(id === "shaman" ? { abilities: [healAllies] } : {}) }),
    });
    w.mm.spawnAll();
    const by = (id: string) => [...w.mm.all()].find((m) => m.def.id === id)!;
    const abil = new MonsterAbilitySystem({
      grid: openGrid(30, 30), monsters: w.mm, combat: w.combat, conditions: { apply: () => {} },
      players: () => w.players.values(), broadcast: (type, msg) => w.sent.push({ to: "*", type, msg }), rng: () => 0,
    });
    return { ...w, abil, shaman: by("shaman"), orc: by("orc"), far: by("far") };
  };

  it("cura % da vida de cada aliado ferido no raio (com o efeito em cada um); fora do raio não", () => {
    const w = setup();
    w.add(player("a", 11, 11, { hp: 5000, maxHp: 5000 }));
    w.orc.s.hp = 100; w.far.s.hp = 100;
    for (let i = 0; i < 200 && w.orc.s.hp === 100; i++) w.run(50);
    expect(w.orc.s.hp).toBe(200); // +20% de 500
    expect(w.far.s.hp).toBe(100);
    const cast = of(w.sent, S2C.SpellCast).find((s) => s.msg.spellId === "m:shaman:heal_allies")!;
    expect(cast.msg.tiles).toEqual([12, 10]);
  });

  it("não cura chefe, invocação de jogador, monstro de outra arena nem de outra sala", () => {
    const w = setup();
    w.add(player("a", 11, 11, { hp: 5000, maxHp: 5000 }));
    const d = def({ id: "x", hp: 500 });
    const bounds = { x0: 0, y0: 0, x1: 29, y1: 29 };
    const boss = w.mm.spawnArena(def({ id: "chefe", hp: 500, boss: true }), 9, 9, { arenaId: 0, bounds, allow: () => true });
    delete boss.arenaId; delete boss.allow; delete boss.bounds; // chefe selvagem no raio
    const summon = w.mm.spawnSummon(d, 9, 11, "a");
    const arena = w.mm.spawnArena(d, 11, 9, { arenaId: 7, bounds, allow: () => true });
    const quest = w.mm.spawnQuest(d, 8, 10, { leverId: "sala", bounds })!;
    w.orc.s.hp = 100;
    for (const o of [boss, summon, arena, quest]) o.s.hp = 100;
    for (let i = 0; i < 200 && w.orc.s.hp === 100; i++) w.run(50);
    expect(w.orc.s.hp).toBe(200);
    expect([boss, summon, arena, quest].map((o) => o.s.hp)).toEqual([100, 100, 100, 100]);
  });

  it("ninguém abaixo de 70%: não gasta o turno (ataca normalmente)", () => {
    const w = setup();
    w.add(player("a", 11, 11, { hp: 5000, maxHp: 5000 }));
    w.orc.s.hp = 400; // 80%
    w.run(6000);
    expect(of(w.sent, S2C.SpellCast)).toHaveLength(0);
    expect(w.orc.s.hp).toBe(400);
  });
});

describe("Coliseu: dano novo + multiplicador próprio", () => {
  it("a onda usa o dano por level dos dados e soma o multiplicador da arena", () => {
    // Onda 42 (cavaleiros negros, lv 65 → ×1,5 nos dados), solo: dano da arena interpolado entre 3,68 (onda 40) e 4,52
    // (50) — cura como no Tibia, 2026-10-27 (era 3,5/4,3 no ciclo 15-14 → 3,66 aqui; 3,3 na onda 50 antes disso).
    const [bk] = arenaWaveSpawns(42, 1, 64);
    expect(bk!.defId).toBe("black_knight");
    expect(arenaWaveMult(42)).toEqual({ hp: ARENA_HP_MULT, dmg: expect.closeTo(3.848, 6) });
    expect(bk!.dmgMult).toBeCloseTo(3.848, 6);
    expect(bk!.hpMult).toBe(2.5);
    expect(monsterDamageMult(monsterDef("black_knight")!)).toBe(1.5);
    // Golpe médio no Coliseu: dados de antes [80, 150] × 1,5 × 3,848 ≈ 664 (era 115 no ciclo 7, 597 até o ciclo 15, 631 até aqui).
    const d = monsterDef("black_knight")!;
    expect(Math.round(((d.damage[0] + d.damage[1]) / 2) * bk!.dmgMult)).toBe(664);
  });

  it("solo não tem mais desconto grande: Orshabaal com 80% da vida de grupo (antes 30%) × 2,5", () => {
    const solo = arenaWaveSpawns(60, 1, 110)[0]!, quad = arenaWaveSpawns(60, 4, 110)[0]!;
    expect(solo.hpMult).toBeCloseTo(0.8 * 2.5, 6);
    expect(quad.hpMult).toBeCloseTo(2.5, 6);
  });
});

// Acompanhante do Estagiário: invocação "de enfeite" (MonsterDef.companion) — segue o dono, não luta, não é atacado.
import { describe, expect, it } from "vitest";
import { Dir, MONSTERS, TICK_MS, stepDuration, type MonsterAbility, type MonsterDef } from "@lemonquest/shared";
import { vi } from "vitest";
import { MonsterAbilitySystem } from "./monsterAbilities.ts";
import { cheb } from "./monsters.ts";
import { COMPANION_STEP_FACTOR, SummonSystem } from "./summons.ts";
import { def, openGrid, player, world } from "./testkit.ts";

const stomp: MonsterAbility = {
  id: "stomp", name: "Pisão", shape: "area_self", radius: 1, cooldownMs: 5000, windupMs: 800,
  damage: { min: 40, max: 40, kind: "physical" }, fx: "physical",
};

/** Mundo 40×40 com um monstro selvagem em (20,20) e o dono "p" em (10,10). */
function setup(wildOver: Partial<MonsterDef> = {}) {
  const defs: Record<string, MonsterDef> = {
    brute: def({ id: "brute", hp: 1000, aggroRange: 0, armor: 0, ...wildOver }),
    pet: def({ id: "pet", hp: 100, damage: [7, 7], aggroRange: 0, xp: 0 }),
    estagiario: MONSTERS.estagiario!,
  };
  const w = world({
    grid: openGrid(40, 40), spawns: [{ defId: "brute", x: 20, y: 20, count: 1, radius: 0 }],
    defs: (id) => defs[id],
  });
  w.mm.spawnAll();
  const wild = [...w.mm.all()][0]!;
  const summons = new SummonSystem({ monsters: w.mm, combat: w.combat, getPlayer: (id) => w.players.get(id), defs: (id) => defs[id] });
  const p = w.add(player("p", 10, 10, { hp: 500, maxHp: 500 }));
  w.mm.playerList = [...w.players.values()];
  return { ...w, wild, summons, p };
}

describe("acompanhante do Estagiário", () => {
  it("spawnCompanion cria o estagiario com dono, ao lado; não entra em ownedBy; repetir devolve o mesmo", () => {
    const w = setup();
    const c = w.summons.spawnCompanion(w.p, w.now())!;
    expect(c).toBeDefined();
    expect(c.s.defId).toBe("estagiario");
    expect(c.s.ownerId).toBe("p");
    expect(cheb(c.s.x, c.s.y, w.p.x, w.p.y)).toBe(1);
    expect(w.mm.isCompanion(c)).toBe(true);
    expect(w.summons.companionOf("p")).toBe(c);
    expect(w.summons.ownedBy("p")).toEqual([]);
    expect(w.summons.spawnCompanion(w.p, w.now())).toBe(c);
    expect([...w.mm.all()].filter((m) => m.s.defId === "estagiario")).toHaveLength(1);
  });

  it("sem tile livre ao redor, nasce no tile do dono", () => {
    const w = setup();
    w.p.x = 0; w.p.y = 0;
    for (const [x, y] of [[1, 0], [0, 1], [1, 1], [2, 0], [2, 1], [2, 2], [0, 2], [1, 2]]) w.mm.spawnSummon(def({ id: "pedra" }), x!, y!, "x", w.now());
    const c = w.summons.spawnCompanion(w.p, w.now())!;
    expect([c.s.x, c.s.y]).toEqual([0, 0]);
  });

  it("monstros não o miram nem o ferem: validTarget falso, monsterAttack e damageMonster sem efeito", () => {
    const w = setup();
    const c = w.summons.spawnCompanion(w.p, w.now())!;
    expect(w.mm.validTarget(c.s.id)).toBeUndefined();
    expect(w.combat.damageMonster(c, w.wild.s.id, 50, "physical", w.now())).toBe(0);
    w.combat.monsterAttack(w.wild, c.s, w.now());
    expect(c.s.hp).toBe(c.s.maxHp);
    expect(w.mm.get(c.s.id)).toBe(c);
    // Revide: um golpe vindo do acompanhante não faz o monstro persegui-lo.
    w.mm.onDamaged(w.wild, c.s.id, 0, w.now(), "");
    expect(w.wild.s.targetId).not.toBe(c.s.id);
  });

  it("habilidade em área do monstro acerta o dono e poupa o acompanhante", () => {
    const w = setup({ abilities: [stomp], aggroRange: 6, damage: [1, 1], hp: 500 });
    const abil = new MonsterAbilitySystem({
      grid: openGrid(40, 40), monsters: w.mm, combat: w.combat,
      conditions: { apply: () => {} }, players: () => w.players.values(),
      broadcast: (type, msg) => w.sent.push({ to: "*", type, msg }), rng: () => 0,
    });
    w.p.x = 21; w.p.y = 20;
    const c = w.summons.spawnCompanion(w.p, w.now())!;
    // Encosta o acompanhante no monstro (dentro do pisão 3×3).
    w.mm.place(c, 21, 21);
    const hp0 = w.p.hp;
    w.run(8000, () => { abil.tick(w.now()); w.mm.place(c, 21, 21); });
    expect(hp0 - w.p.hp).toBeGreaterThanOrEqual(40);
    expect(c.s.hp).toBe(c.s.maxHp);
    expect(w.mm.get(c.s.id)).toBe(c);
  });

  it("não ataca o alvo do dono", () => {
    const w = setup();
    w.p.x = 18; w.p.y = 20;
    const c = w.summons.spawnCompanion(w.p, w.now())!;
    w.p.targetId = w.wild.s.id;
    w.run(5000);
    expect(w.wild.s.hp).toBe(1000);
    expect(c.s.targetId).toBe("");
  });

  it("segue o dono e para a 2 tiles (sem colar); reaparece ao lado se ele for para longe (> 6)", () => {
    const w = setup();
    const c = w.summons.spawnCompanion(w.p, w.now())!;
    w.p.x = 15; // 5 tiles: anda
    w.run(4000);
    expect(cheb(c.s.x, c.s.y, w.p.x, w.p.y)).toBe(2);
    w.p.x = 5; w.p.y = 30; // teletransporte
    w.run(100);
    expect(cheb(c.s.x, c.s.y, w.p.x, w.p.y)).toBe(1);
  });

  it("anda na velocidade do dono (com pressa também): acompanha a caminhada sem ficar para trás nem teleportar", () => {
    const w = setup();
    w.p.level = 40; w.p.speedPct = 150; // Pés Ligeiros
    w.p.x = 5; w.p.y = 20;
    const c = w.summons.spawnCompanion(w.p, w.now())!;
    const place = vi.spyOn(w.mm, "place");
    const passo = stepDuration(w.p.level, Dir.E, 100, 150);
    let acc = 0, maxD = 0;
    w.run(passo * 28, () => {
      acc += TICK_MS;
      if (acc >= passo && w.p.x < 33) { acc -= passo; w.p.x++; }
      maxD = Math.max(maxD, cheb(c.s.x, c.s.y, w.p.x, w.p.y));
    });
    expect(w.p.x).toBe(33);
    expect(c.stepBaseMs).toBe(Math.round(stepDuration(40, Dir.S, 100, 150) * COMPANION_STEP_FACTOR));
    expect(place).not.toHaveBeenCalled(); // nunca precisou reaparecer
    expect(maxD).toBeLessThanOrEqual(3);
    w.run(1000);
    expect(cheb(c.s.x, c.s.y, w.p.x, w.p.y)).toBe(2); // parou: fica a 2 tiles, sem colar no boneco
  });

  it("fica sempre atrás do dono: 2 tiles contra a direção em que ele olha (vira junto; andando, termina atrás)", () => {
    const w = setup();
    w.p.x = 10; w.p.y = 10; w.p.dir = Dir.N;
    const c = w.summons.spawnCompanion(w.p, w.now())!;
    w.run(3000);
    expect([c.s.x, c.s.y]).toEqual([10, 12]); // dono olhando para o norte: ao sul
    w.p.dir = Dir.W;
    w.run(3000);
    expect([c.s.x, c.s.y]).toEqual([12, 10]); // virou para o oeste: contorna para o leste
    // Andando para o leste: termina 2 tiles a oeste do dono.
    w.p.dir = Dir.E;
    const passo = stepDuration(w.p.level, Dir.E, 100, 100);
    let acc = 0;
    w.run(passo * 8, () => { acc += TICK_MS; if (acc >= passo && w.p.x < 16) { acc -= passo; w.p.x++; } });
    w.run(2000);
    expect([c.s.x, c.s.y]).toEqual([w.p.x - 2, w.p.y]);
  });

  it("reconjurar o Lobo não apaga o acompanhante; despawnCompanion e despawnOwner o removem", () => {
    const w = setup();
    const c = w.summons.spawnCompanion(w.p, w.now())!;
    expect(w.summons.summon(w.p, { monsterId: "pet", count: 1, durationMs: 20_000 }, w.now())).toBe(1);
    expect(w.summons.summon(w.p, { monsterId: "pet", count: 1, durationMs: 20_000 }, w.now())).toBe(1);
    expect(w.mm.get(c.s.id)).toBe(c);
    expect(w.summons.ownedBy("p")).toHaveLength(1);
    // A invocação expira; o acompanhante não.
    w.run(21_000);
    expect(w.summons.ownedBy("p")).toHaveLength(0);
    expect(w.mm.get(c.s.id)).toBe(c);
    w.summons.despawnCompanion("p");
    expect(w.mm.get(c.s.id)).toBeUndefined();
    expect(w.summons.companionOf("p")).toBeUndefined();
    const c2 = w.summons.spawnCompanion(w.p, w.now())!;
    w.summons.summon(w.p, { monsterId: "pet", count: 1, durationMs: 20_000 }, w.now());
    w.summons.despawnOwner("p");
    expect(w.mm.get(c2.s.id)).toBeUndefined();
    expect(w.summons.companionOf("p")).toBeUndefined();
    expect(w.summons.ownedBy("p")).toHaveLength(0);
  });

  it("some com o dono ausente ou morto (sem respawn)", () => {
    const w = setup();
    const c = w.summons.spawnCompanion(w.p, w.now())!;
    w.p.hp = 0;
    w.run(100);
    expect(w.mm.get(c.s.id)).toBeUndefined();
    expect(w.summons.companionOf("p")).toBeUndefined();
    w.p.hp = 500;
    const c2 = w.summons.spawnCompanion(w.p, w.now())!;
    w.players.delete("p");
    w.run(100);
    expect(w.mm.get(c2.s.id)).toBeUndefined();
    expect(w.mm.pendingRespawns).toBe(0);
  });
});

describe("MonsterManager.blocksPlayer", () => {
  it("monstro no tile bloqueia; o acompanhante só não bloqueia o próprio dono", () => {
    const w = setup();
    const c = w.summons.spawnCompanion(w.p, w.now())!;
    expect(w.mm.blocksPlayer(c.s.x, c.s.y, "p")).toBe(false);
    expect(w.mm.blocksPlayer(c.s.x, c.s.y, "outro")).toBe(true);
    expect(w.mm.blocksPlayer(w.wild.s.x, w.wild.s.y, "p")).toBe(true);
    expect(w.mm.blocksPlayer(30, 30, "p")).toBe(false);
    expect(w.mm.isMonsterAt(c.s.x, c.s.y)).toBe(true); // monstros continuam sem entrar no tile dele
  });
});

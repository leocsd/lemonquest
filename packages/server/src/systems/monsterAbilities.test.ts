import { describe, expect, it } from "vitest";
import { HEAL_ALLIES_LOCKOUT_MS, MONSTERS, PLAYER_ATTACK_MS, S2C, monsterAbilitySpell, monsterDef, type MonsterAbility } from "@lemonquest/shared";
import { MonsterAbilitySystem } from "./monsterAbilities.ts";
import { def, openGrid, player, world } from "./testkit.ts";

const stomp: MonsterAbility = {
  id: "stomp", name: "Pisão", shape: "area_self", radius: 1, cooldownMs: 5000, windupMs: 800,
  damage: { min: 40, max: 40, kind: "physical" }, fx: "physical",
};

/** Um monstro com `abilities` em (10,10), agressivo; ataque básico fraco (1) para separar do dano da habilidade. */
function setup(abilities: MonsterAbility[], over: Parameters<typeof def>[0] = {}) {
  const w = world({
    grid: openGrid(30, 30), spawns: [{ defId: "dummy", x: 10, y: 10, count: 1, radius: 0 }],
    defs: () => def({ hp: 500, damage: [1, 1], attackMs: 1000, aggroRange: 6, abilities, ...over }),
  });
  w.mm.spawnAll();
  const m = [...w.mm.all()][0]!;
  const applied: { id: string; cond: string; value: number }[] = [];
  const abil = new MonsterAbilitySystem({
    grid: openGrid(30, 30), monsters: w.mm, combat: w.combat,
    conditions: { apply: (id, cond, _ms, value) => applied.push({ id, cond, value: value ?? 0 }) },
    players: () => w.players.values(),
    broadcast: (type, msg) => w.sent.push({ to: "*", type, msg }),
    rng: () => 0,
  });
  const run = (ms: number, each?: () => void) => w.run(ms, () => { abil.tick(w.now()); each?.(); });
  return { ...w, m, abil, applied, run };
}

const of = (sent: { type: string; msg: any }[], type: string) => sent.filter((s) => s.type === type);

describe("habilidades de monstros", () => {
  it("golpe com aviso: marca os tiles, e o dano cai só em quem ficou neles", () => {
    const w = setup([stomp]);
    const stay = w.add(player("a", 11, 10, { hp: 500, maxHp: 500 }));
    const leave = w.add(player("b", 10, 11, { hp: 500, maxHp: 500 }));
    for (let i = 0; i < 200 && !w.abil.pendingCount; i++) w.run(50); // até o aviso começar
    const tele = of(w.sent, S2C.MonsterTelegraph);
    expect(tele).toHaveLength(1);
    expect(tele[0]!.msg).toMatchObject({ casterId: w.m.s.id, ms: 800, fx: "physical" });
    expect(tele[0]!.msg.tiles).toHaveLength(16); // 3×3 sem o tile do monstro = 8 tiles (16 números)
    leave.x = 20; leave.y = 20; // saiu da área durante o aviso
    const hpStay = stay.hp;
    w.run(900);
    expect(of(w.sent, S2C.SpellCast).some((s) => s.msg.spellId === "m:dummy:stomp")).toBe(true);
    expect(hpStay - stay.hp).toBeGreaterThanOrEqual(40);
    expect(leave.hp).toBe(500);
  });

  it("matar o monstro durante o aviso cancela o golpe", () => {
    const w = setup([stomp]);
    const p = w.add(player("a", 11, 10, { hp: 500, maxHp: 500 }));
    for (let i = 0; i < 200 && !w.abil.pendingCount; i++) w.run(50); // até o aviso começar
    expect(w.abil.pendingCount).toBe(1);
    w.combat.damageMonster(w.m, "a", 10_000, "physical", w.now());
    const hp = p.hp;
    w.run(1000);
    expect(w.abil.pendingCount).toBe(0);
    expect(p.hp).toBe(hp);
    expect(of(w.sent, S2C.SpellCast)).toHaveLength(0);
  });

  it("usar uma habilidade gasta o turno do ataque básico (sem golpe duplo)", () => {
    const bolt: MonsterAbility = { id: "bolt", name: "Raio", shape: "target", range: 1, cooldownMs: 40_000, damage: { min: 30, max: 30, kind: "energy" }, fx: "energy" };
    const w = setup([bolt], { attackMs: 1000 });
    const p = w.add(player("a", 11, 10, { hp: 500, maxHp: 500 }));
    w.run(50_000); // pronta ~20 s depois do 1º turno; a 2ª vez só depois de 60 s
    const hits = (w.sent.filter((s) => s.type === S2C.Combat).flatMap((s) => s.msg.events) as { targetId: string; amount: number }[])
      .filter((e) => e.targetId === "a");
    // ~50 turnos em 50 s: um deles foi o raio (30), os outros o básico (1).
    expect(hits.filter((e) => e.amount === 30)).toHaveLength(1);
    expect(hits.length).toBeGreaterThanOrEqual(48);
    expect(hits.length).toBeLessThanOrEqual(51);
    expect(p.hp).toBeGreaterThan(0);
  });

  it("condição de quem é atingido (lentidão do raio)", () => {
    const bolt: MonsterAbility = {
      id: "bolt", name: "Raio", shape: "target", range: 4, cooldownMs: 8000,
      damage: { min: 10, max: 10, kind: "ice" }, condition: { id: "slow", durationMs: 3000, value: 40 }, fx: "ice",
    };
    const w = setup([bolt], { attackRange: 4 });
    w.add(player("a", 13, 10, { hp: 500, maxHp: 500 }));
    w.run(4500);
    expect(w.applied).toEqual([{ id: "a", cond: "slow", value: 40 }]);
  });

  it("golpe letal com condição: o morto renasce sem a condição", () => {
    const bolt: MonsterAbility = {
      id: "bolt", name: "Raio", shape: "target", range: 4, cooldownMs: 8000,
      damage: { min: 10, max: 10, kind: "ice" }, condition: { id: "slow", durationMs: 3000, value: 40 }, fx: "ice",
    };
    const w = setup([bolt], { attackRange: 4 });
    const p = w.add(player("a", 13, 10, { hp: 5, maxHp: 500 }));
    w.run(4500);
    expect(p.hp).toBe(500); // morreu e renasceu com a vida cheia
    expect(w.applied).toEqual([]);
  });

  it("cura só abaixo da fração de vida", () => {
    const heal: MonsterAbility = { id: "heal", name: "Cura", shape: "self", cooldownMs: 4000, heal: { pct: 0.2, belowHpPct: 0.5 }, fx: "heal" };
    const w = setup([heal]);
    w.add(player("a", 11, 10, { hp: 500, maxHp: 500 }));
    w.run(3000);
    expect(w.m.s.hp).toBe(500);
    expect(of(w.sent, S2C.SpellCast)).toHaveLength(0);
    w.m.s.hp = 200;
    w.run(1000);
    expect(w.m.s.hp).toBe(300);
  });

  it("invocação: respeita o máximo, não dá XP nem crédito de abate e some com o invocador", () => {
    const sum: MonsterAbility = { id: "summon", name: "Venham!", shape: "self", cooldownMs: 2000, summon: { monsterId: "rat", count: 2, max: 3 }, fx: "summon" };
    const w = setup([sum]);
    const p = w.add(player("a", 14, 10, { hp: 5000, maxHp: 5000 }));
    const killed: string[] = [];
    w.combat.hooks = { onMonsterKilled: (m) => killed.push(m.def.id), onKillCredit: (_pid, m) => killed.push(`credit:${m.def.id}`) };
    w.run(6000);
    expect(w.abil.minionCount(w.m.s.id)).toBe(3);
    const minion = [...w.mm.all()].find((x) => x.minionOf === w.m.s.id)!;
    expect(minion.def.id).toBe("rat");
    const xp = p.xp;
    w.combat.damageMonster(minion, "a", 10_000, "physical", w.now());
    expect(p.xp).toBe(xp);
    expect(killed).toEqual([]);
    expect(w.mm.pendingRespawns).toBe(0);
    // O invocador morre: os ajudantes que sobraram somem no próximo tique.
    w.combat.damageMonster(w.m, "a", 10_000, "physical", w.now());
    w.run(100);
    expect([...w.mm.all()].filter((x) => x.minionOf)).toHaveLength(0);
  });

  it("chance é sorteada uma vez por turno de ataque, não a cada tique", () => {
    const bolt: MonsterAbility = { id: "bolt", name: "Raio", shape: "target", range: 1, cooldownMs: 1000, chance: 0.5, damage: { min: 1, max: 1, kind: "fire" }, fx: "fire" };
    const w = setup([bolt]);
    let rolls = 0;
    (w.abil as any).rng = () => { rolls++; return 0.99; }; // sempre falha
    w.add(player("a", 11, 10, { hp: 5000, maxHp: 5000 }));
    w.run(10_000);
    expect(rolls).toBeGreaterThan(5);
    expect(rolls).toBeLessThanOrEqual(11); // ~1 por turno de 1 s (não 200 tiques)
  });

  it("dados reais: toda habilidade é coerente e o cliente consegue desenhá-la", () => {
    for (const m of Object.values(MONSTERS)) {
      const ids = new Set<string>();
      for (const a of m.abilities ?? []) {
        expect(ids.has(a.id), `${m.id}.${a.id} repetido`).toBe(false);
        ids.add(a.id);
        expect(a.cooldownMs, `${m.id}.${a.id}`).toBeGreaterThanOrEqual(m.attackMs);
        if (a.damage) {
          expect(a.damage.min).toBeLessThanOrEqual(a.damage.max);
          // Golpe da habilidade ≤ 2× o máximo do ataque básico (área/condição são o diferencial, não um "one-shot").
          expect(a.damage.max, `${m.id}.${a.id}`).toBeLessThanOrEqual(m.damage[1] * 2);
        }
        if (a.summon) {
          const s = monsterDef(a.summon.monsterId);
          expect(s, `${m.id} invoca ${a.summon.monsterId}`).toBeDefined();
          expect(s!.abilities?.some((x) => x.summon) ?? false, "invocado não invoca").toBe(false);
          expect(a.summon.max).toBeGreaterThanOrEqual(a.summon.count);
        }
        if (a.shape === "area_self" || a.shape === "area_target") expect(a.radius).toBeGreaterThanOrEqual(1);
        if (a.shape === "wave") expect(a.length).toBeGreaterThanOrEqual(2);
        expect(monsterAbilitySpell(`m:${m.id}:${a.id}`)?.words).toBe(a.name);
      }
    }
    expect(monsterAbilitySpell("m:nao_existe:x")).toBeUndefined();
    expect(monsterAbilitySpell("exura")).toBeUndefined();
  });

  it("onda só é usada se o alvo estiver no cone (na diagonal fica o ataque básico)", () => {
    const breath: MonsterAbility = { id: "breath", name: "Sopro", shape: "wave", length: 4, width: 1, range: 4, cooldownMs: 2000, damage: { min: 10, max: 10, kind: "fire" }, fx: "fire" };
    const diag = setup([breath], { attackRange: 4 });
    diag.add(player("a", 14, 14, { hp: 500, maxHp: 500 })); // a 4 tiles: o monstro de longe fica parado
    diag.run(6000);
    expect(of(diag.sent, S2C.SpellCast)).toHaveLength(0);
    const line = setup([breath], { attackRange: 4 });
    line.add(player("a", 14, 10, { hp: 500, maxHp: 500 }));
    line.run(6000);
    expect(of(line.sent, S2C.SpellCast).length).toBeGreaterThan(0);
  });

  it("monstro sem habilidades ataca como antes", () => {
    const w = setup([]);
    const p = w.add(player("a", 11, 10, { hp: 500, maxHp: 500 }));
    w.run(PLAYER_ATTACK_MS * 3);
    expect(p.hp).toBeLessThan(500);
    expect(of(w.sent, S2C.SpellCast)).toHaveLength(0);
  });
});

describe("curandeiros com limite (ciclo 15)", () => {
  /** Bando de 3 Necromantes (vida 1.500 e o Pacto Sombrio de verdade, sem a invocação) em volta de um jogador. */
  function pack() {
    const pact = MONSTERS.necromancer!.abilities!.find((a) => a.healAllies)!;
    const spots = [{ x: 10, y: 10 }, { x: 12, y: 10 }, { x: 10, y: 12 }];
    const w = world({
      grid: openGrid(30, 30), spawns: spots.map((s) => ({ defId: "necro", ...s, count: 1, radius: 0 })),
      defs: () => def({ id: "necro", hp: 1500, damage: [1, 1], attackMs: MONSTERS.necromancer!.attackMs, aggroRange: 6, abilities: [pact] }),
    });
    w.mm.spawnAll();
    const abil = new MonsterAbilitySystem({
      grid: openGrid(30, 30), monsters: w.mm, combat: w.combat, conditions: { apply: () => {} },
      players: () => w.players.values(), broadcast: (type, msg) => w.sent.push({ to: "*", type, msg }), rng: () => 0,
    });
    const p = w.add(player("a", 11, 11, { hp: 1_000_000, maxHp: 1_000_000 }));
    return { ...w, abil, p, pact, necros: [...w.mm.all()] };
  }

  it("cada monstro recebe a cura em grupo no máximo 1× a cada 10 s: 3 Necromantes curam 54 de vida/s, não 162", () => {
    expect(HEAL_ALLIES_LOCKOUT_MS).toBe(10_000);
    const w = pack();
    const heals = new Map<string, number[]>(w.necros.map((m) => [m.s.id, []]));
    // Sempre feridos (40% da vida): todo turno de qualquer um dos 3 poderia curar.
    const hurt = () => { for (const m of w.necros) m.s.hp = 600; };
    hurt();
    const WINDOW = 60_000;
    w.run(WINDOW, () => {
      for (const m of w.necros) {
        const at = m.healedAt;
        const list = heals.get(m.s.id)!;
        if (at !== undefined && list.at(-1) !== at) list.push(at);
      }
      hurt();
    });
    let total = 0;
    for (const list of heals.values()) {
      expect(list.length).toBeGreaterThanOrEqual(5); // cura de verdade (~1 a cada 10–12 s)
      for (let i = 1; i < list.length; i++) expect(list[i]! - list[i - 1]!).toBeGreaterThanOrEqual(HEAL_ALLIES_LOCKOUT_MS);
      total += list.length * Math.round(1500 * w.pact.healAllies!.pct);
    }
    // Teto: 3 monstros × 180 a cada 10 s = 54/s (antes cada um recebia a cura dos 3: 162/s).
    expect(total / (WINDOW / 1000)).toBeLessThanOrEqual(54 + 1e-9);
    expect(total / (WINDOW / 1000)).toBeGreaterThan(40);
  });

  it("com todos no limite, o curandeiro não gasta o turno: ataca normalmente até o limite passar", () => {
    const w = pack();
    const [a, b, c] = w.necros as [typeof w.necros[0], typeof w.necros[0], typeof w.necros[0]];
    for (const m of [a, b, c]) m.healedAt = w.now(); // acabaram de ser curados
    for (const m of [a, b, c]) m.s.hp = 600;
    const hp = w.p.hp;
    w.run(HEAL_ALLIES_LOCKOUT_MS - 1000);
    expect(of(w.sent, S2C.SpellCast)).toHaveLength(0);
    expect([a, b, c].map((m) => m.s.hp)).toEqual([600, 600, 600]);
    expect(w.p.hp).toBeLessThan(hp); // os turnos viraram ataque básico
    w.run(4000);
    expect(of(w.sent, S2C.SpellCast).filter((s) => s.msg.spellId === "m:necro:heal_allies")).toHaveLength(1);
    expect([a, b, c].map((m) => m.s.hp)).toEqual([780, 780, 780]); // +12% de 1.500
  });
});

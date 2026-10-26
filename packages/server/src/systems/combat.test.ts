import { describe, expect, it } from "vitest";
import { IMBUE_SPELL_MULT, OUT_OF_COMBAT_MS, PLAYER_ATTACK_MS, imbuementBonus, REGEN_INTERVAL_MS, S2C, baseStats, deathPenalty, xpForLevel } from "@lemonquest/shared";
import { RegenSystem } from "./regen.ts";
import { LootSystem } from "./loot.ts";
import { KILL_CREDIT_RANGE } from "./monsters.ts";
import { def, openGrid, player, world } from "./testkit.ts";

const types = (sent: { type: string }[]) => sent.map((s) => s.type);

function setup(over: Parameters<typeof def>[0] = {}, extra: Partial<Parameters<typeof world>[0]> = {}) {
  const w = world({
    grid: openGrid(30, 30), spawns: [{ defId: "dummy", x: 10, y: 10, count: 1, radius: 0 }],
    defs: () => def({ aggroRange: 0, ...over }), spawn: { x: 25, y: 25 }, ...extra,
  });
  w.mm.spawnAll();
  const m = [...w.mm.all()][0];
  return { ...w, m };
}

describe("player combat", () => {
  it("evento com bônus: a XP do abate é multiplicada (hooks.xpMult); sem o gancho ou com ×1 não muda", () => {
    const run = (mult?: number) => {
      const w = setup({ hp: 20, xp: 40, armor: 0 });
      if (mult !== undefined) w.combat.hooks = { xpMult: () => mult };
      const p = w.add(player("k", 11, 10, { name: "Leo", hp: 100 }));
      w.combat.onAttack(p, { targetId: w.m.s.id });
      w.run(PLAYER_ATTACK_MS * 6);
      return (w.sent.find((s) => s.type === S2C.XpGain)!.msg as { amount: number }).amount;
    };
    expect(run()).toBe(40);
    expect(run(1)).toBe(40);
    expect(run(2)).toBe(80);
    expect(run(1.5)).toBe(60);
    expect(run(0.5)).toBe(40); // nunca reduz
  });

  it("estágio de XP: lv 100 recebe 12% da XP do abate (o bônus de evento multiplica antes)", () => {
    const run = (level: number, mult = 1) => {
      const w = setup({ hp: 20, xp: 1000, armor: 0 });
      w.combat.hooks = { xpMult: () => mult };
      const p = w.add(player("k", 11, 10, { name: "Leo", hp: 5000 }));
      p.level = level; p.xp = xpForLevel(level);
      w.combat.onAttack(p, { targetId: w.m.s.id });
      w.run(PLAYER_ATTACK_MS * 6);
      return (w.sent.find((s) => s.type === S2C.XpGain)!.msg as { amount: number }).amount;
    };
    expect(run(39)).toBe(1000);
    expect(run(40)).toBe(500);
    expect(run(60)).toBe(300);
    expect(run(100)).toBe(120);
    expect(run(100, 2)).toBe(240);
  });

  it("subir para um novo estágio de XP avisa o jogador (só ele)", () => {
    const w = setup({ hp: 20, xp: xpForLevel(40) - xpForLevel(39) + 1, armor: 0 });
    const p = w.add(player("k", 11, 10, { name: "Leo", hp: 5000 }));
    p.level = 39; p.xp = xpForLevel(39);
    w.combat.onAttack(p, { targetId: w.m.s.id });
    w.run(PLAYER_ATTACK_MS * 6);
    expect(p.level).toBe(40);
    const notes = w.sent.filter((s) => s.type === S2C.Notice && /estágio de XP/.test((s.msg as { text: string }).text));
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ to: "k" });
  });

  it("knight kills a monster: batched combat events, xp, multi level up, notices", () => {
    const w = setup({ hp: 20, xp: xpForLevel(6) + 5, armor: 0 });
    const p = w.add(player("k", 11, 10, { name: "Leo", hp: 100 }));
    w.combat.onAttack(p, { targetId: w.m.s.id });
    expect(p.targetId).toBe(w.m.s.id);
    w.run(PLAYER_ATTACK_MS * 6);
    expect(w.mm.size).toBe(0);
    expect(w.collection.size).toBe(0);
    expect(p.targetId).toBe("");
    // Evento de combate antes de CreatureDied; XP depois.
    const t = types(w.sent);
    expect(t.indexOf(S2C.Combat)).toBeLessThan(t.indexOf(S2C.CreatureDied));
    const xp = w.sent.find((s) => s.type === S2C.XpGain)!;
    expect(xp).toMatchObject({ to: "k", msg: { amount: xpForLevel(6) + 5, x: 10, y: 10 } });
    expect(p.level).toBe(6);
    const stats = baseStats("knight", 6);
    expect([p.maxHp, p.hp, p.maxMana, p.mana]).toEqual([stats.maxHp, stats.maxHp, stats.maxMana, stats.maxMana]);
    expect(w.sent.find((s) => s.type === S2C.LevelUp)!.msg).toEqual({ level: 6, maxHp: stats.maxHp, maxMana: stats.maxMana });
    expect(w.sent.find((s) => s.type === S2C.Notice)!.msg).toEqual({ text: "Leo chegou ao level 6!", kind: "good" });
    const ev = w.sent.filter((s) => s.type === S2C.Combat).flatMap((s) => s.msg.events);
    const mine = ev.filter((e: any) => e.sourceId === "k");
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((e: any) => e.kind === "physical" && e.ranged === undefined)).toBe(true);
  });

  it("attacks every 2s only when in range; melee does not chase", () => {
    const w = setup({ hp: 10_000 });
    const p = w.add(player("k", 13, 10));
    w.combat.onAttack(p, { targetId: w.m.s.id });
    w.run(5000);
    expect(w.sent.filter((s) => s.type === S2C.Combat).length).toBe(0);
    expect(p.x).toBe(13);
    p.x = 11;
    w.run(4000);
    const ev = w.sent.filter((s) => s.type === S2C.Combat).flatMap((s) => s.msg.events);
    expect(ev.filter((e: any) => e.sourceId === "k").length).toBe(2);
  });

  it("paladin/sorcerer/druid attack at range with ranged + kind", () => {
    for (const [voc, range, kind] of [["paladin", 6, "physical"], ["sorcerer", 4, "energy"], ["druid", 4, "ice"]] as const) {
      const w = setup({ hp: 10_000 });
      const p = w.add(player("r", 10 + range, 10, { vocation: voc }));
      w.combat.onAttack(p, { targetId: w.m.s.id });
      w.run(100);
      const ev = w.sent.filter((s) => s.type === S2C.Combat).flatMap((s) => s.msg.events);
      expect(ev[0]).toMatchObject({ sourceId: "r", kind, ranged: true });
    }
  });

  it("armor can block everything (miss with 0)", () => {
    const w = setup({ hp: 10_000, armor: 1000 });
    const p = w.add(player("k", 11, 10));
    w.combat.onAttack(p, { targetId: w.m.s.id });
    w.run(100);
    const ev = w.sent.filter((s) => s.type === S2C.Combat).flatMap((s) => s.msg.events);
    expect(ev[0]).toMatchObject({ amount: 0, miss: true });
    expect(w.m.s.hp).toBe(10_000);
  });

  it("splits xp proportionally between online damagers (min 1)", () => {
    const w = setup({ hp: 100, xp: 50 });
    const a = w.add(player("a", 11, 10));
    const b = w.add(player("b", 9, 10));
    w.m.damageBy.set("a", 60);
    w.m.damageBy.set("b", 30);
    w.m.damageBy.set("gone", 10);
    w.m.s.hp = 1;
    w.combat.onAttack(a, { targetId: w.m.s.id });
    w.run(2100);
    expect(w.mm.size).toBe(0);
    const gains = Object.fromEntries(w.sent.filter((s) => s.type === S2C.XpGain).map((s) => [s.to, s.msg.amount]));
    // a: 60+1 dano, b: 30 → 50*61/91 ≈ 34, 50*30/91 ≈ 16
    expect(gains).toEqual({ a: 34, b: 16 });
    expect(a.xp).toBe(34);
    expect(b.xp).toBe(16);
  });

  it("cannot target from or into the protection zone", () => {
    const w = setup({}, { safeZones: [{ x0: 0, y0: 0, x1: 5, y1: 29 }] });
    const p = w.add(player("k", 4, 10));
    w.combat.onAttack(p, { targetId: w.m.s.id });
    expect(p.targetId).toBe("");
    expect(w.sent.at(-1)).toMatchObject({ to: "k", type: S2C.Notice });
    w.combat.onAttack(p, { targetId: "m999" });
    expect(p.targetId).toBe("");
    p.x = 9;
    w.combat.onAttack(p, { targetId: w.m.s.id });
    expect(p.targetId).toBe(w.m.s.id);
    w.combat.onAttack(p, { targetId: null });
    expect(p.targetId).toBe("");
  });
});

describe("imbuement (encantamento)", () => {
  // Monstro com dano 0 e muita vida: o revide não tira vida e ele não morre, isolando o efeito do próprio ataque.
  it("dreno de vida: cura % do dano causado contra monstro selvagem", () => {
    const w = setup({ hp: 3000, armor: 0, aggroRange: 0, damage: [0, 0] });
    w.combat.hooks = { imbuement: () => imbuementBonus("lifesteal", 1) };
    const p = w.add(player("k", 11, 10, { name: "Leo", hp: 50, maxHp: 500 }));
    w.combat.onAttack(p, { targetId: w.m.s.id });
    w.run(PLAYER_ATTACK_MS + 10);
    const dealt = w.sent.filter((s) => s.type === S2C.Combat).flatMap((s: any) => s.msg.events).find((e: any) => e.targetId === w.m.s.id)!.amount;
    expect(dealt).toBeGreaterThan(0);
    expect(p.hp).toBe(50 + Math.round(dealt * imbuementBonus("lifesteal", 1).value));
  });

  it("dreno de mana: recupera % do dano causado", () => {
    const w = setup({ hp: 3000, armor: 0, aggroRange: 0, damage: [0, 0] });
    w.combat.hooks = { imbuement: () => imbuementBonus("manasteal", 1) };
    const p = w.add(player("k", 11, 10, { name: "Leo", mana: 10, maxMana: 500 }));
    w.combat.onAttack(p, { targetId: w.m.s.id });
    w.run(PLAYER_ATTACK_MS + 10);
    const dealt = w.sent.filter((s) => s.type === S2C.Combat).flatMap((s: any) => s.msg.events).find((e: any) => e.targetId === w.m.s.id)!.amount;
    expect(p.mana).toBe(10 + Math.round(dealt * imbuementBonus("manasteal", 1).value));
  });

  it("dreno não cura ao bater no boneco de treino (dano só mostrado)", () => {
    const w = setup({ hp: 30, armor: 0, aggroRange: 0, invulnerable: true });
    w.combat.hooks = { imbuement: () => imbuementBonus("lifesteal", 1) };
    const p = w.add(player("k", 11, 10, { name: "Leo", hp: 50, maxHp: 500 }));
    w.combat.onAttack(p, { targetId: w.m.s.id });
    w.run(PLAYER_ATTACK_MS + 10);
    expect(w.sent.filter((s) => s.type === S2C.Combat).flatMap((s: any) => s.msg.events).some((e: any) => e.targetId === w.m.s.id)).toBe(true);
    expect(p.hp).toBe(50);
  });

  // Jogador nunca ataca (targetId sempre ""): só o monstro (aggroRange 5) bate, isolando o reflexo dos espinhos.
  it("espinhos: devolve % do dano recebido pro monstro que bateu", () => {
    const w = setup({ hp: 100_000, armor: 0, aggroRange: 5, damage: [40, 40], name: "Lobo" });
    w.combat.hooks = { imbuement: () => imbuementBonus("thorns", 1) };
    w.add(player("v", 11, 10, { name: "Ana", hp: 5000, maxHp: 5000, targetId: "" }));
    w.run(PLAYER_ATTACK_MS + 10);
    const ev = w.sent.filter((s) => s.type === S2C.Combat).flatMap((s: any) => s.msg.events);
    const taken = ev.find((e: any) => e.targetId === "v" && e.sourceId === w.m.s.id)!.amount;
    const reflected = ev.find((e: any) => e.sourceId === "v" && e.targetId === w.m.s.id);
    expect(reflected).toBeTruthy();
    expect(reflected.amount).toBe(Math.round(taken * imbuementBonus("thorns", 1).value));
  });

  it("perfurante: mesma rolagem, mais dano contra monstro com armadura (armadura efetiva menor)", () => {
    const dealtWith = (imbuement: boolean) => {
      const w = setup({ hp: 100_000, armor: 6, aggroRange: 0, damage: [0, 0] });
      if (imbuement) w.combat.hooks = { imbuement: () => imbuementBonus("pierce", 1) };
      const p = w.add(player("k", 11, 10, { name: "Leo", hp: 500, maxHp: 500 }));
      w.combat.onAttack(p, { targetId: w.m.s.id });
      w.run(PLAYER_ATTACK_MS + 10);
      return w.sent.filter((s) => s.type === S2C.Combat).flatMap((s: any) => s.msg.events).find((e: any) => e.targetId === w.m.s.id)!.amount;
    };
    expect(dealtWith(true)).toBeGreaterThan(dealtWith(false));
  });

  const hitsIn = (o: { haste: boolean; invulnerable?: boolean; tier?: 1 | 2 | 3 }) => {
    const w = setup({ hp: 100_000, armor: 0, aggroRange: 0, damage: [0, 0], invulnerable: o.invulnerable });
    if (o.haste) w.combat.hooks = { imbuement: () => imbuementBonus("haste", o.tier ?? 1) };
    const p = w.add(player("k", 11, 10, { name: "Leo", hp: 500, maxHp: 500 }));
    w.combat.onAttack(p, { targetId: w.m.s.id });
    w.run(PLAYER_ATTACK_MS * 25);
    return w.sent.filter((s) => s.type === S2C.Combat).flatMap((s: any) => s.msg.events).filter((e: any) => e.targetId === w.m.s.id).length;
  };

  it("veloz: ataca mais vezes no mesmo tempo (intervalo reduzido); tier III mais que o I", () => {
    expect(hitsIn({ haste: true })).toBeGreaterThan(hitsIn({ haste: false }));
    expect(hitsIn({ haste: true, tier: 3 })).toBeGreaterThan(hitsIn({ haste: true, tier: 1 }));
  });

  it("no boneco de treino o encantamento não vale (lá o tempo não gasta): Veloz não acelera o treino", () => {
    expect(hitsIn({ haste: true, invulnerable: true })).toBe(hitsIn({ haste: false, invulnerable: true }));
  });

  it("dreno de vida tier III cura o dobro do tier I", () => {
    const healed = (tier: 1 | 3) => {
      const w = setup({ hp: 100_000, armor: 0, aggroRange: 0, damage: [0, 0] });
      w.combat.hooks = { imbuement: () => imbuementBonus("lifesteal", tier) };
      const p = w.add(player("k", 11, 10, { name: "Leo", hp: 50, maxHp: 100_000, level: 100 }));
      w.combat.onAttack(p, { targetId: w.m.s.id });
      w.run(PLAYER_ATTACK_MS - 100); // um golpe só
      const hits = w.sent.filter((s) => s.type === S2C.Combat).flatMap((s: any) => s.msg.events).filter((e: any) => e.targetId === w.m.s.id);
      expect(hits).toHaveLength(1);
      return { dealt: hits[0].amount as number, healed: p.hp - 50 };
    };
    const t1 = healed(1), t3 = healed(3);
    expect(t1.dealt).toBe(t3.dealt); // mesma rolagem
    expect(t1.healed).toBe(Math.round(t1.dealt * 0.05));
    expect(t3.healed).toBe(Math.round(t3.dealt * 0.10));
  });
});

describe("encantamento em magia (spellHitMonster): metade do efeito", () => {
  it("dreno de vida/mana devolvem metade do valor sobre o dano da magia", () => {
    const w = setup({ hp: 100_000, armor: 0, aggroRange: 0, damage: [0, 0] });
    w.combat.hooks = { imbuement: (p) => imbuementBonus(p.id === "k" ? "lifesteal" : "manasteal", 3) };
    const k = w.add(player("k", 11, 10, { hp: 50, maxHp: 5000 }));
    const s = w.add(player("s", 9, 10, { mana: 10, maxMana: 5000 }));
    expect(w.combat.spellHitMonster(k, w.m, 400, "fire", w.now())).toBe(400);
    expect(k.hp).toBe(50 + Math.round(400 * 0.10 * IMBUE_SPELL_MULT)); // 20
    expect(w.combat.spellHitMonster(s, w.m, 400, "fire", w.now())).toBe(400);
    expect(s.mana).toBe(10 + Math.round(400 * 0.08 * IMBUE_SPELL_MULT)); // 16
  });

  it("perfurante corta metade da armadura que cortaria; sem encantamento é o mitigateSpell normal", () => {
    const hit = (pierce: boolean, kind: "physical" | "fire") => {
      const w = setup({ hp: 100_000, armor: 40, aggroRange: 0, damage: [0, 0] });
      if (pierce) w.combat.hooks = { imbuement: () => imbuementBonus("pierce", 3) };
      const p = w.add(player("k", 11, 10));
      return w.combat.spellHitMonster(p, w.m, 200, kind, w.now());
    };
    expect(hit(false, "physical")).toBe(160);
    expect(hit(true, "physical")).toBe(200 - Math.round(40 * (1 - 0.3 * IMBUE_SPELL_MULT))); // armadura 34
    expect(hit(false, "fire")).toBe(180); // magia elemental: metade da armadura
    expect(hit(true, "fire")).toBe(183); // 20 × (1 − 0,15) = 17
  });

  it("veloz e espinhos não mexem na magia; boneco de treino não drena", () => {
    for (const effect of ["haste", "thorns"] as const) {
      const w = setup({ hp: 100_000, armor: 40, aggroRange: 0, damage: [0, 0] });
      w.combat.hooks = { imbuement: () => imbuementBonus(effect, 3) };
      const p = w.add(player("k", 11, 10, { hp: 50, maxHp: 5000, mana: 10, maxMana: 5000 }));
      expect(w.combat.spellHitMonster(p, w.m, 200, "physical", w.now()), effect).toBe(160);
      expect([p.hp, p.mana], effect).toEqual([50, 10]);
    }
    const w = setup({ hp: 100_000, armor: 0, aggroRange: 0, damage: [0, 0], invulnerable: true });
    w.combat.hooks = { imbuement: () => imbuementBonus("lifesteal", 3) };
    const p = w.add(player("k", 11, 10, { hp: 50, maxHp: 5000 }));
    w.combat.spellHitMonster(p, w.m, 400, "fire", w.now());
    expect(p.hp).toBe(50);
  });
});

describe("combate PvE (relógio do encantamento)", () => {
  it("bater em monstro e apanhar de monstro contam; passa depois de OUT_OF_COMBAT_MS", () => {
    const w = setup({ hp: 100_000, armor: 0, aggroRange: 0, damage: [0, 0] });
    const p = w.add(player("k", 11, 10, { hp: 500, maxHp: 500 }));
    expect(w.combat.inPveCombat("k", w.now())).toBe(false);
    w.combat.onAttack(p, { targetId: w.m.s.id });
    w.run(PLAYER_ATTACK_MS - 100);
    expect(w.combat.inPveCombat("k", w.now())).toBe(true);
    // Relógio adiantado sem tique (o monstro revidando também seria combate PvE).
    w.setClock(w.now() + OUT_OF_COMBAT_MS);
    expect(w.combat.inPveCombat("k", w.now())).toBe(false);
    w.combat.damagePlayer(p, w.m.s.id, 0, "physical", w.now()); // golpe de monstro (mesmo errando)
    expect(w.combat.inPveCombat("k", w.now())).toBe(true);
  });

  it("boneco de treino marca combate, mas não combate PvE", () => {
    const w = setup({ hp: 30, armor: 0, aggroRange: 0, invulnerable: true });
    const p = w.add(player("k", 11, 10, { hp: 500, maxHp: 500 }));
    w.combat.onAttack(p, { targetId: w.m.s.id });
    w.run(PLAYER_ATTACK_MS * 3);
    expect(w.combat.inCombat("k", w.now())).toBe(true);
    expect(w.combat.inPveCombat("k", w.now())).toBe(false);
  });

  it("PvP marca combate, mas não combate PvE (nem para quem bate nem para quem apanha)", () => {
    const w = setup({ hp: 30, armor: 0, aggroRange: 0 });
    w.combat.hooks = { canAttackPlayer: () => null };
    const a = w.add(player("a", 20, 20, { hp: 5000, maxHp: 5000 }));
    w.add(player("b", 21, 20, { hp: 5000, maxHp: 5000 }));
    w.combat.onAttack(a, { targetId: "b" });
    w.run(PLAYER_ATTACK_MS * 3);
    expect(w.combat.inCombat("a", w.now())).toBe(true);
    expect(w.combat.inCombat("b", w.now())).toBe(true);
    expect(w.combat.inPveCombat("a", w.now())).toBe(false);
    expect(w.combat.inPveCombat("b", w.now())).toBe(false);
  });
});

describe("skill Escudo", () => {
  type Hit = { shield?: boolean; skill?: number; attackRange?: number; monsterLevel?: number; playerLevel?: number; damage?: number; attackMs?: number; ms?: number };
  const hit = (o: Hit = {}) => {
    const dmg = o.damage ?? 40;
    const w = setup({ aggroRange: 5, damage: [dmg, dmg], attackRange: o.attackRange ?? 1, armor: 0, level: o.monsterLevel ?? 1, attackMs: o.attackMs ?? 2000 });
    let tries = 0;
    w.combat.hooks = { armor: () => 2, hasShield: () => o.shield ?? true, onShieldTry: () => { tries++; } };
    const far = (o.attackRange ?? 1) > 1;
    const p = w.add(player("k", far ? 12 : 11, 10, { level: o.playerLevel ?? 1, hp: 5000, maxHp: 5000, skillShield: o.skill ?? 10, targetId: "" }));
    w.run(o.ms ?? 2100);
    const hits = w.sent.filter((x) => x.type === S2C.Combat).flatMap((x) => x.msg.events).filter((e: { targetId: string }) => e.targetId === "k");
    return { hits: hits.length, perHit: hits.map((e: { amount: number }) => e.amount), tries, armor: w.combat.armorOf(p) };
  };

  it("com escudo: +floor((shield−10)/4) de armadura; sem escudo, só a do equipamento", () => {
    const a = hit({ skill: 30 }), b = hit({ shield: false, skill: 30 });
    expect(a.armor).toBe(7);
    expect(new Set(a.perHit)).toEqual(new Set([33]));
    expect(b.armor).toBe(2);
    expect(new Set(b.perHit)).toEqual(new Set([38]));
    expect(hit({ skill: 10 }).armor).toBe(2);
  });

  it("golpe corpo a corpo ou à distância treina o escudo, só com escudo equipado", () => {
    const melee = hit({ ms: 500 }), ranged = hit({ attackRange: 3, ms: 500 });
    expect(melee).toMatchObject({ hits: 1, tries: 1 });
    expect(ranged).toMatchObject({ hits: 1, tries: 1 });
    expect(hit({ shield: false, ms: 500 })).toMatchObject({ hits: 1, tries: 0 });
  });

  it("no máximo uma tentativa a cada 2 s, mesmo com golpes mais rápidos", () => {
    const r = hit({ attackMs: 400, ms: 5900 });
    expect(r.hits).toBeGreaterThanOrEqual(10);
    expect(r.tries).toBe(3); // 0, 2 e 4 s
  });

  it("monstro fraco (level < 1/3 do jogador) com golpe zerado pela armadura não treina; forte ou que fura a armadura treina", () => {
    expect(hit({ monsterLevel: 1, playerLevel: 30, damage: 2, ms: 500 })).toMatchObject({ hits: 1, tries: 0 }); // rato AFK
    expect(hit({ monsterLevel: 1, playerLevel: 30, damage: 40, ms: 500 }).tries).toBe(1); // passa da armadura (2)
    expect(hit({ monsterLevel: 10, playerLevel: 30, damage: 2, ms: 500 }).tries).toBe(1); // level ≥ 1/3
    expect(hit({ monsterLevel: 9, playerLevel: 30, damage: 2, ms: 500 }).tries).toBe(0);
  });
});

describe("player death", () => {
  it("monster kills player: penalty (no level loss), teleport to spawn, full hp, Died + notice, targets cleared", () => {
    const w = setup({ aggroRange: 5, damage: [40, 40], name: "Lobo" });
    const level = 5, xp = xpForLevel(5) + 100;
    const p = w.add(player("v", 11, 10, { name: "Ana", level, xp, hp: 70, maxHp: 210, targetId: "" }));
    w.combat.onAttack(p, { targetId: w.m.s.id });
    w.run(1200);
    const lost = deathPenalty(level, xp);
    expect(lost).toBeGreaterThan(0);
    expect(p.xp).toBe(xp - lost);
    expect(p.level).toBe(5);
    expect([p.x, p.y]).toEqual([25, 25]);
    expect(p.hp).toBe(210);
    expect(p.targetId).toBe("");
    expect(w.sent.find((s) => s.type === S2C.Died)).toMatchObject({ to: "v", msg: { lostXp: lost, killerName: "Lobo" } });
    expect(w.sent.find((s) => s.type === S2C.Notice && s.to === "*")!.msg.text).toBe("Ana foi derrotado por Lobo");
    expect(w.m.s.targetId).toBe("");
  });

  it("blessed player loses no XP on death, consuming the blessing", () => {
    const w = setup({ aggroRange: 5, damage: [40, 40], name: "Lobo" });
    const level = 5, xp = xpForLevel(5) + 100;
    const p = w.add(player("v", 11, 10, { name: "Ana", level, xp, hp: 70, maxHp: 210, targetId: "", blessed: true }));
    w.combat.onAttack(p, { targetId: w.m.s.id });
    w.run(1200);
    expect(p.xp).toBe(xp);
    expect(p.blessed).toBe(false);
    expect(w.sent.find((s) => s.type === S2C.Died)).toMatchObject({ to: "v", msg: { lostXp: 0, killerName: "Lobo" } });
    expect(w.sent.find((s) => s.to === "v" && s.type === S2C.Notice && s.msg.text.includes("bênção"))).toBeTruthy();
  });

  it("bênção não é gasta numa morte sem XP a perder (ciclo 14: recém-subido de level)", () => {
    const w = setup({ aggroRange: 5, damage: [40, 40], name: "Lobo" });
    const level = 5, xp = xpForLevel(5);
    const p = w.add(player("v", 11, 10, { name: "Ana", level, xp, hp: 70, maxHp: 210, targetId: "", blessed: true }));
    w.combat.onAttack(p, { targetId: w.m.s.id });
    w.run(1200);
    expect(w.sent.find((s) => s.type === S2C.Died)).toMatchObject({ to: "v", msg: { lostXp: 0 } });
    expect(w.sent.find((s) => s.type === S2C.Died)!.msg.blessingUsed).toBeUndefined();
    expect(p.blessed).toBe(true);
    expect(w.sent.find((s) => s.to === "v" && s.type === S2C.Notice && s.msg.text.includes("bênção"))).toBeUndefined();
  });

  it("morte no lv 100 (ciclo 15): perde 30% da XP do level; com bênção, o Died diz quanto ela salvou", () => {
    const xp = xpForLevel(101) - 1; // fim do level: a perda cheia cabe
    const die = (blessed: boolean) => {
      // Vida alta: o lv 100 não mata o lobo antes de levar o golpe.
      const w = setup({ aggroRange: 5, damage: [40, 40], name: "Lobo", hp: 100_000 });
      const p = w.add(player("v", 11, 10, { name: "Ana", level: 100, xp, hp: 30, maxHp: 1338, targetId: "", blessed }));
      w.combat.onAttack(p, { targetId: w.m.s.id });
      w.run(1200);
      return { p, died: w.sent.find((s) => s.type === S2C.Died)!.msg, notices: w.sent.filter((s) => s.to === "v" && s.type === S2C.Notice).map((s) => s.msg.text as string) };
    };
    const plain = die(false);
    expect(plain.died).toEqual({ lostXp: 19328, killerName: "Lobo" });
    expect(plain.p.xp).toBe(xp - 19328);
    expect(plain.p.level).toBe(100);
    const saved = die(true);
    expect(saved.died).toEqual({ lostXp: 0, killerName: "Lobo", blessingUsed: true, savedXp: 19328 });
    expect(saved.p.xp).toBe(xp);
    expect(saved.p.blessed).toBe(false);
    expect(saved.notices).toContain("Sua bênção te protegeu: 19.328 XP salvos.");
  });

  it("removePlayer clears monster targets", () => {
    const w = setup({ aggroRange: 5 });
    w.add(player("v", 12, 10));
    w.run(300);
    expect(w.m.s.targetId).toBe("v");
    w.players.delete("v");
    w.combat.removePlayer("v");
    expect(w.m.s.targetId).toBe("");
  });
});

describe("regen", () => {
  it("regens out of combat every 2s, faster in PZ, not in combat", () => {
    let combat = true;
    const pz = { on: false };
    const r = new RegenSystem({ inCombat: () => combat, inPz: () => pz.on });
    const p = player("p", 0, 0, { hp: 50, mana: 10 });
    let t = 0;
    r.tick(t, [p]);
    t += REGEN_INTERVAL_MS; r.tick(t, [p]);
    expect(p.hp).toBe(50);
    combat = false;
    t += REGEN_INTERVAL_MS; r.tick(t, [p]);
    expect(p.hp).toBe(52);
    t += 100; r.tick(t, [p]);
    expect(p.hp).toBe(52);
    pz.on = true;
    t += REGEN_INTERVAL_MS; r.tick(t, [p]);
    expect(p.hp).toBe(58);
    expect(p.mana).toBeGreaterThan(10);
    for (let i = 0; i < 100; i++) { t += REGEN_INTERVAL_MS; r.tick(t, [p]); }
    expect(p.hp).toBe(150);
    expect(p.mana).toBe(50);
  });

  it("combat marks both sides as in combat for 6s", () => {
    const w = setup({ aggroRange: 5, damage: [1, 1], hp: 10_000 });
    w.add(player("v", 11, 10));
    w.run(1000);
    expect(w.combat.inCombat("v", w.now())).toBe(true);
    expect(w.combat.inCombat("other", w.now())).toBe(false);
  });
});

describe("crédito do abate: só quem está perto", () => {
  it("quem bateu e foi para longe não leva XP nem loot; sem ninguém perto, vale o último golpe", () => {
    const w = setup({ hp: 100, xp: 90, armor: 0 });
    const far = w.add(player("far", 10 + KILL_CREDIT_RANGE + 2, 10, { name: "Longe" }));
    const near = w.add(player("near", 11, 10, { name: "Perto" }));
    const loot = new LootSystem({ inventory: {} as any, getPlayer: (id) => w.players.get(id), send: () => {}, broadcast: () => {} });
    w.mm.onDamaged(w.m, "far", 80, w.now());
    w.mm.onDamaged(w.m, "near", 10, w.now());
    expect(loot.topDamager(w.m)?.id).toBe("near"); // "far" bateu mais, mas está longe
    // Ninguém perto: fica com quem deu o último golpe.
    near.x = 10 - KILL_CREDIT_RANGE - 2;
    expect(loot.topDamager(w.m)?.id).toBe("near");
    near.x = 11;

    w.combat.damageMonster(w.m, "near", 1e9, "physical", w.now());
    w.combat.flush();
    const xp = w.sent.filter((s) => s.type === S2C.XpGain);
    expect(xp.map((s) => s.to)).toEqual(["near"]);
    expect(xp[0]!.msg.amount).toBe(90);
    expect(far.xp).toBe(0);
  });
});

describe("resistência elemental", () => {
  it("bicho do elemento toma metade do dano desse elemento; outros elementos e físico, normal; resist do dado manda", () => {
    const w = setup({ hp: 10_000, armor: 0, damageKind: "fire" });
    expect(w.combat.damageMonster(w.m, "p", 100, "fire", w.now())).toBe(50);
    expect(w.combat.damageMonster(w.m, "p", 100, "energy", w.now())).toBe(100);
    expect(w.combat.damageMonster(w.m, "p", 100, "ice", w.now())).toBe(115); // fraqueza do bicho de fogo (ciclo 15)
    expect(w.combat.damageMonster(w.m, "p", 100, "physical", w.now())).toBe(100);
    w.m.def = { ...w.m.def, resist: { fire: 1, ice: 1.25 } };
    expect(w.combat.damageMonster(w.m, "p", 100, "fire", w.now())).toBe(100);
    expect(w.combat.damageMonster(w.m, "p", 100, "ice", w.now())).toBe(125);
  });
});

describe("telemetria de dano (ciclo 12)", () => {
  it("onDealt recebe o dano tirado do monstro e o que a resistência cortou; dano em boneco não conta", () => {
    const w = setup({ hp: 10_000, armor: 0, damageKind: "fire" });
    w.add(player("p", 11, 10));
    const got: [string, number, number][] = [];
    w.combat.hooks = { ...w.combat.hooks, onDealt: (id, d, r) => got.push([id, d, r]) };
    w.combat.damageMonster(w.m, "p", 100, "fire", w.now());
    w.combat.damageMonster(w.m, "p", 100, "energy", w.now()); // elemento neutro (gelo seria fraqueza: 115)
    w.combat.damageMonster(w.m, "ninguem", 100, "energy", w.now()); // fonte que não é jogador
    expect(got).toEqual([["p", 50, 50], ["p", 100, 0]]);
    const d = setup({ hp: 10_000, armor: 0, invulnerable: true });
    d.add(player("q", 11, 10));
    const got2: unknown[] = [];
    d.combat.hooks = { ...d.combat.hooks, onDealt: (...a) => got2.push(a) };
    d.combat.damageMonster(d.m, "q", 100, "physical", d.now());
    expect(got2).toEqual([]);
  });
});

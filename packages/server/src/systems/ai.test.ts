// IA dos monstros (ai.ts): dormir/acordar, perseguição, fuga e volta ao spawn, coleira, grito do bando e busca de
// tile com linha de visão. Mundo do testkit: relógio injetado e RNG semeado (resultado sempre igual).
import { describe, expect, it } from "vitest";
import { HELP_RADIUS } from "@lemonquest/shared";
import { FLEE_GIVE_UP_MS, LEASH_DIST, LOST_TARGET_MS, THINK_MS, findLosTilePath } from "./ai.ts";
import { HELP_FIRST_HIT, HELP_FLEE, HELP_HALF_HP, HELP_SHOUT_MS, SLEEP_DIST, cheb, type Monster } from "./monsters.ts";
import { def, grid, openGrid, player, world } from "./testkit.ts";

const sp = (x: number, y: number, defId = "dummy", radius = 0) => ({ defId, x, y, count: 1, radius });
const first = (w: { mm: { all(): IterableIterator<Monster> } }) => [...w.mm.all()][0]!;
/** Roda `ms` e devolve onde/como o monstro estava no instante em que voltou a ficar ocioso (antes de passear). */
function runUntilIdle(w: { run(ms: number, each?: () => void): void }, m: Monster, ms: number) {
  let arrived: { x: number; y: number; hp: number; targetId: string } | null = null;
  w.run(ms, () => { if (!arrived && m.mode === "idle") arrived = { x: m.s.x, y: m.s.y, hp: m.s.hp, targetId: m.s.targetId }; });
  return arrived as { x: number; y: number; hp: number; targetId: string } | null;
}

describe("dormir e acordar", () => {
  it("ocioso sem jogador a mais de SLEEP_DIST tiles dorme (não anda); acorda com jogador a SLEEP_DIST", () => {
    const w = world({ grid: openGrid(60, 60), spawns: [sp(10, 10, "dummy", 3)], defs: () => def({ aggroRange: 0 }) });
    w.mm.spawnAll();
    const m = first(w);
    w.run(THINK_MS * 2);
    expect(m.sleeping).toBe(true);
    const at = { x: m.s.x, y: m.s.y };
    w.run(20_000); // vinte segundos dormindo: nem um passo de passeio
    expect([m.s.x, m.s.y]).toEqual([at.x, at.y]);
    const p = w.add(player("p", m.s.x + SLEEP_DIST + 1, m.s.y));
    w.run(THINK_MS * 2);
    expect(m.sleeping).toBe(true); // 17 tiles: ainda longe
    p.x = m.s.x + SLEEP_DIST;
    w.run(THINK_MS * 2);
    expect(m.sleeping).toBe(false);
    expect(m.mode).toBe("idle"); // passivo (aggroRange 0): acordado mas sem perseguir
  });

  it("acordado e passivo, passeia (RNG semeado) mas fica a até radius + 3 do spawn", () => {
    const w = world({ grid: openGrid(60, 60), spawns: [sp(20, 20, "dummy", 1)], defs: () => def({ aggroRange: 0 }), seed: 7 });
    w.mm.spawnAll();
    const m = first(w);
    w.add(player("p", 30, 20)); // a 10 tiles: acordado, fora do aggro
    let moved = false, maxD = 0;
    w.run(60_000, () => { if (m.s.x !== 20 || m.s.y !== 20) moved = true; maxD = Math.max(maxD, cheb(m.s.x, m.s.y, 20, 20)); });
    expect(moved).toBe(true);
    expect(maxD).toBeLessThanOrEqual(1 + 3);
    expect(m.mode).toBe("idle");
  });
});

describe("perseguição", () => {
  it("jogador dentro do aggroRange vira alvo; o monstro anda até ficar adjacente e bate", () => {
    const w = world({ grid: openGrid(40, 40), spawns: [sp(10, 10)], defs: () => def({ aggroRange: 6, stepMs: 100, damage: [3, 3], attackMs: 500 }) });
    w.mm.spawnAll();
    const m = first(w);
    const p = w.add(player("p", 16, 10, { hp: 5000, maxHp: 5000 }));
    w.run(THINK_MS * 2);
    expect([m.mode, m.s.targetId]).toEqual(["chase", "p"]);
    w.run(3000);
    expect(cheb(m.s.x, m.s.y, p.x, p.y)).toBe(1);
    expect(p.hp).toBeLessThan(5000);
    // Jogador a 7 tiles (fora do aggro 6) não é percebido.
    const w2 = world({ grid: openGrid(40, 40), spawns: [sp(10, 10)], defs: () => def({ aggroRange: 6 }) });
    w2.mm.spawnAll();
    w2.add(player("p", 17, 10));
    w2.run(2000);
    expect(first(w2).mode).toBe("idle");
  });

  it("coleira: perseguindo além de LEASH_DIST do spawn desiste, volta e cura", () => {
    const w = world({ grid: openGrid(80, 40), spawns: [sp(10, 10)], defs: () => def({ aggroRange: 6, stepMs: 100, hp: 100 }) });
    w.mm.spawnAll();
    const m = first(w);
    const p = w.add(player("p", 15, 10, { hp: 50_000, maxHp: 50_000 }));
    w.run(THINK_MS * 2);
    expect(m.mode).toBe("chase");
    m.s.hp = 40;
    p.x = 60; // o alvo "sumiu" para longe: o monstro corre atrás até a coleira
    const modes = new Set<string>();
    let maxD = 0, arrived: { x: number; y: number; hp: number; targetId: string } | null = null;
    w.run(12_000, () => {
      modes.add(m.mode);
      maxD = Math.max(maxD, cheb(m.s.x, m.s.y, 10, 10));
      if (!arrived && m.mode === "idle") arrived = { x: m.s.x, y: m.s.y, hp: m.s.hp, targetId: m.s.targetId };
    });
    expect(modes.has("return")).toBe(true);
    expect(maxD).toBeGreaterThan(LEASH_DIST);
    expect(maxD).toBeLessThanOrEqual(LEASH_DIST + 2); // entre um "pensar" e outro dá no máximo um par de passos
    expect(m.mode).toBe("idle");
    expect(arrived).toEqual({ x: 10, y: 10, hp: 100, targetId: "" }); // chegou no spawn curado (depois pode passear)
  });

  it("dança da coleira (ciclo 14): voltando pela coleira fica imune, não revida e chega ao spawn curado", () => {
    const w = world({ grid: openGrid(80, 40), spawns: [sp(10, 10)], defs: () => def({ aggroRange: 6, stepMs: 100, hp: 100 }) });
    w.mm.spawnAll();
    const m = first(w);
    const p = w.add(player("p", 15, 10, { hp: 50_000, maxHp: 50_000 }));
    w.run(THINK_MS * 2);
    m.s.hp = 40;
    p.x = 60; // foge para longe: o monstro passa da coleira e começa a voltar
    let shots = 0, dealt = 0, chasedAgain = false, arrived: { hp: number } | null = null;
    w.run(12_000, () => {
      // Quem ataca de longe continua batendo no monstro que volta (era assim que nunca curava nem revidava).
      if (m.mode === "return") { shots++; dealt += w.combat.damageMonster(m, "p", 10, "physical", w.now()); }
      if (m.evading && m.mode === "chase") chasedAgain = true;
      if (!arrived && m.mode === "idle" && shots > 0) arrived = { hp: m.s.hp };
    });
    expect(shots).toBeGreaterThan(0);
    expect(dealt).toBe(0);
    expect(chasedAgain).toBe(false);
    expect(arrived).toEqual({ hp: 100 });
    expect(m.evading).toBe(false);
    // Voltando por perder o alvo (sem coleira) segue normal: o golpe acerta e ele revida.
    p.x = 13; p.hp = 50_000;
    w.run(THINK_MS * 2);
    expect(w.combat.damageMonster(m, "p", 10, "physical", w.now())).toBeGreaterThan(0);
  });

  it("voltando pela coleira ignora a provocação (senão perseguia imune para sempre dentro da coleira)", () => {
    const w = world({ grid: openGrid(80, 40), spawns: [sp(10, 10)], defs: () => def({ aggroRange: 6, stepMs: 100, hp: 100 }) });
    w.mm.spawnAll();
    const m = first(w);
    const p = w.add(player("p", 15, 10, { hp: 50_000, maxHp: 50_000 }));
    w.run(THINK_MS * 2);
    p.x = 60;
    let taunted = false, chased = false, arrived = false;
    w.run(20_000, () => {
      if (!taunted && m.evading) {
        // O cavaleiro provoca o monstro que volta, colado nele.
        const k = w.add(player("k", m.s.x + 1, m.s.y, { hp: 50_000, maxHp: 50_000 }));
        m.tauntBy = k.id; m.tauntUntil = w.now() + 6_000; taunted = true;
      }
      if (taunted && m.mode === "idle") arrived = true;
      if (taunted && !arrived && m.mode === "chase") chased = true; // atendeu a provocação antes de chegar ao spawn
    });
    expect(taunted).toBe(true);
    expect(arrived).toBe(true);
    expect(chased).toBe(false);
    expect(m.evading).toBe(false);
    expect(m.s.hp).toBe(100);
  });

  it("sem alvo válido por LOST_TARGET_MS (jogador morreu) volta ao spawn", () => {
    const w = world({ grid: openGrid(40, 40), spawns: [sp(10, 10)], defs: () => def({ aggroRange: 6, stepMs: 100 }) });
    w.mm.spawnAll();
    const m = first(w);
    const p = w.add(player("p", 15, 10, { hp: 5000, maxHp: 5000 }));
    w.run(2000);
    expect(m.mode).toBe("chase");
    p.hp = 0;
    w.run(LOST_TARGET_MS - 500);
    expect(m.mode).toBe("chase"); // ainda esperando o alvo voltar
    expect(m.s.targetId).toBe("");
    w.run(1000);
    expect(m.mode).toBe("return");
    const arrived = runUntilIdle(w, m, 3000);
    expect(m.mode).toBe("idle");
    expect(arrived).toMatchObject({ x: 10, y: 10 });
  });
});

describe("fuga", () => {
  it("abaixo de fleeAtHpPct foge (afasta-se, dentro da coleira) e, perdido o alvo, volta ao spawn curado", () => {
    const w = world({ grid: openGrid(40, 40), spawns: [sp(10, 10)], defs: () => def({ aggroRange: 6, stepMs: 100, hp: 100, fleeAtHpPct: 0.3 }) });
    w.mm.spawnAll();
    const m = first(w);
    const p = w.add(player("p", 12, 10, { hp: 5000, maxHp: 5000 }));
    w.run(1000);
    expect([m.mode, cheb(m.s.x, m.s.y, p.x, p.y)]).toEqual(["chase", 1]);
    m.s.hp = 29; // 29% < 30%
    w.run(3000);
    expect(m.mode).toBe("flee");
    expect(cheb(m.s.x, m.s.y, p.x, p.y)).toBeGreaterThan(3);
    expect(cheb(m.s.x, m.s.y, 10, 10)).toBeLessThanOrEqual(LEASH_DIST);
    expect(p.hp).toBeLessThan(5000); // bateu antes de fugir
    const hpBefore = p.hp;
    w.run(2000);
    expect(p.hp).toBe(hpBefore); // corpo a corpo fugindo não ataca
    w.players.delete("p");
    const arrived = runUntilIdle(w, m, LOST_TARGET_MS + 6000);
    expect(m.mode).toBe("idle");
    expect(arrived).toMatchObject({ x: 10, y: 10, hp: 100 });
  });

  it("fuga com prazo (ciclo 14): 10 s fugindo sem levar dano desiste, volta ao spawn e cura", () => {
    const w = world({ grid: openGrid(60, 60), spawns: [sp(30, 30)], defs: () => def({ aggroRange: 6, stepMs: 100, hp: 100, fleeAtHpPct: 0.3 }) });
    w.mm.spawnAll();
    const m = first(w);
    const p = w.add(player("p", 32, 30, { hp: 50_000, maxHp: 50_000 }));
    w.run(1000);
    m.s.hp = 29;
    let lastHit = 0;
    // Enquanto apanha, segue fugindo (o golpe renova o prazo).
    w.run(FLEE_GIVE_UP_MS + 4000, () => {
      if (w.now() - lastHit >= 2000) { lastHit = w.now(); w.mm.onDamaged(m, "p", 0, w.now()); }
    });
    expect(m.mode).toBe("flee");
    // Para de bater: desiste dentro do prazo (o jogador continua ali, alvo válido) e chega curado.
    let gaveUpAt = 0;
    w.run(FLEE_GIVE_UP_MS + 500, () => { if (!gaveUpAt && m.mode !== "flee") gaveUpAt = w.now(); });
    expect(gaveUpAt).toBeGreaterThan(0);
    expect(m.mode === "return" || m.mode === "idle" || m.mode === "chase").toBe(true);
    p.x = 59; p.y = 59; // longe do aggro: volta e fica
    const arrived = runUntilIdle(w, m, 20_000);
    expect(arrived).toMatchObject({ hp: 100 });
  });

  it("com fleeAtHpPct 0 nunca foge, mesmo com 1 de vida", () => {
    const w = world({ grid: openGrid(40, 40), spawns: [sp(10, 10)], defs: () => def({ aggroRange: 6, hp: 100, fleeAtHpPct: 0 }) });
    w.mm.spawnAll();
    const m = first(w);
    w.add(player("p", 11, 10, { hp: 5000, maxHp: 5000 }));
    w.run(1000);
    m.s.hp = 1;
    w.run(2000);
    expect(m.mode).toBe("chase");
  });
});

describe("grito de reforço do bando (callForHelp)", () => {
  const pack = { family: "wolf", shout: "Auuuu!" };
  /** Lobo líder em (10,10); lobos a 6 (limite) e a 7 tiles; um rato de outra família colado. */
  const setup = () => {
    const w = world({
      grid: openGrid(40, 40),
      spawns: [sp(10, 10, "lead"), sp(16, 10, "edge"), sp(17, 10, "far"), sp(11, 11, "rat")],
      defs: (id) => def({ id, aggroRange: 0, ...(id === "rat" ? {} : { pack }) }),
    });
    w.mm.spawnAll();
    const by = (id: string) => [...w.mm.all()].find((m) => m.def.id === id)!;
    let shouts = 0;
    w.mm.onCallHelp = () => { shouts++; };
    w.add(player("a", 9, 10, { hp: 5000, maxHp: 5000 }));
    return { ...w, lead: by("lead"), edge: by("edge"), far: by("far"), rat: by("rat"), shouts: () => shouts };
  };

  it("só a mesma família a até HELP_RADIUS tiles atende; um motivo só grita uma vez por vida", () => {
    const w = setup();
    expect(HELP_RADIUS).toBe(6);
    expect(w.mm.callForHelp(w.lead, "a", w.now(), HELP_FIRST_HIT)).toBe(1);
    expect([w.edge.mode, w.edge.s.targetId, w.edge.sleeping]).toEqual(["chase", "a", false]);
    expect([w.far.mode, w.rat.mode]).toEqual(["idle", "idle"]);
    expect(w.shouts()).toBe(1);
    expect(w.lead.helpCalled).toBe(HELP_FIRST_HIT);
    expect(w.mm.callForHelp(w.lead, "a", w.now(), HELP_FIRST_HIT)).toBe(0); // repetido: nada
    expect(w.shouts()).toBe(1);
    expect(w.mm.callForHelp(w.lead, "a", w.now() + HELP_SHOUT_MS, HELP_HALF_HP)).toBe(0); // ninguém livre, mas grita
    expect(w.shouts()).toBe(2);
    expect(w.lead.helpCalled).toBe(HELP_FIRST_HIT | HELP_HALF_HP);
  });

  it("no máximo um grito por família por segundo; sem família (não é bando) nem grita nem chama", () => {
    const w = setup();
    const t = w.now();
    w.mm.callForHelp(w.lead, "a", t, HELP_FIRST_HIT);
    w.edge.mode = "idle"; w.edge.s.targetId = "";
    // O lobo da borda chama: o líder (a 6) e o de longe (a 1 dele) atendem, mas ainda sem grito novo (< 1 s).
    expect(w.mm.callForHelp(w.edge, "a", t + HELP_SHOUT_MS - 1, HELP_FIRST_HIT)).toBe(2);
    expect(w.shouts()).toBe(1);
    w.lead.mode = "idle"; w.lead.s.targetId = "";
    w.mm.callForHelp(w.far, "a", t + HELP_SHOUT_MS, HELP_FIRST_HIT);
    expect(w.shouts()).toBe(2);
    expect(w.mm.callForHelp(w.rat, "a", t + 5000, HELP_FIRST_HIT)).toBe(0);
    expect(w.shouts()).toBe(2);
    expect(w.rat.helpCalled).toBeUndefined();
  });

  it("fugindo (IA) chama o bando com HELP_FLEE e o grito fica registrado no monstro", () => {
    const w = world({
      grid: openGrid(40, 40), spawns: [sp(10, 10, "lead"), sp(13, 10, "mate")],
      defs: (id) => def({ id, aggroRange: 0, hp: 100, fleeAtHpPct: 0.5, pack }),
    });
    w.mm.spawnAll();
    const lead = [...w.mm.all()].find((m) => m.def.id === "lead")!, mate = [...w.mm.all()].find((m) => m.def.id === "mate")!;
    let shouts = 0;
    w.mm.onCallHelp = () => { shouts++; };
    w.add(player("a", 11, 10, { hp: 5000, maxHp: 5000 }));
    lead.mode = "chase"; lead.s.targetId = "a"; lead.s.hp = 10;
    w.run(THINK_MS * 2);
    expect(lead.mode).toBe("flee");
    expect(lead.helpCalled).toBe(HELP_FLEE);
    expect([mate.mode, mate.s.targetId]).toEqual(["chase", "a"]);
    expect(shouts).toBe(1);
  });
});

describe("monstro à distância sem linha de visão (findLosTilePath)", () => {
  // Parede vertical em x=8, y=2..8; o resto aberto.
  const WALL = grid(Array.from({ length: 14 }, (_, y) => Array.from({ length: 20 }, (_, x) => (x === 8 && y >= 2 && y <= 8 ? "#" : ".")).join("")));

  it("acha um caminho de passos adjacentes até um tile a ≤ range do alvo com visão", () => {
    const w = world({ grid: WALL, spawns: [sp(11, 5, "m")], defs: () => def({ id: "m", aggroRange: 8, attackRange: 4 }) });
    w.mm.spawnAll();
    const m = first(w);
    const target = { x: 7, y: 5 }; // a 4 tiles, atrás da parede
    expect(w.mm.los(m.s.x, m.s.y, target.x, target.y)).toBe(false);
    const path = findLosTilePath(m, w.mm, target, 4)!;
    expect(path).not.toBeNull();
    expect(path.length).toBeGreaterThan(0);
    let prev = { x: m.s.x, y: m.s.y };
    for (const t of path) {
      expect(cheb(prev.x, prev.y, t.x, t.y)).toBe(1);
      expect(WALL.isWalkable(t.x, t.y)).toBe(true);
      expect(cheb(t.x, t.y, 11, 5)).toBeLessThanOrEqual(LEASH_DIST);
      prev = t;
    }
    const end = path[path.length - 1]!;
    expect(cheb(end.x, end.y, target.x, target.y)).toBeGreaterThanOrEqual(1);
    expect(cheb(end.x, end.y, target.x, target.y)).toBeLessThanOrEqual(4);
    expect(w.mm.los(end.x, end.y, target.x, target.y)).toBe(true);
    // Nenhum tile anterior do caminho já servia (o BFS devolve o mais próximo).
    for (const t of path.slice(0, -1)) {
      const d = cheb(t.x, t.y, target.x, target.y);
      expect(d >= 1 && d <= 4 && w.mm.los(t.x, t.y, target.x, target.y)).toBe(false);
    }
  });

  it("confinado (bounds) não sai do retângulo; preso numa caixa fechada devolve null", () => {
    const w = world({ grid: WALL, spawns: [sp(11, 5, "m")], defs: () => def({ id: "m", attackRange: 4 }) });
    w.mm.spawnAll();
    const m = first(w);
    m.bounds = { x0: 0, y0: 0, x1: 19, y1: 6 }; // só a metade de cima: obriga a contornar a parede por cima
    const path = findLosTilePath(m, w.mm, { x: 7, y: 5 }, 4)!;
    expect(path).not.toBeNull();
    for (const t of path) expect(t.y).toBeLessThanOrEqual(6);
    const end = path[path.length - 1]!;
    expect(end.y).toBeLessThanOrEqual(1); // a visão só abre acima da parede
    expect(w.mm.los(end.x, end.y, 7, 5)).toBe(true);
    // Do lado direito da parede não existe tile com visão a ≤ 4 do alvo: null, e a IA cai no caminho direto.
    m.bounds = { x0: 9, y0: 0, x1: 19, y1: 13 };
    expect(findLosTilePath(m, w.mm, { x: 7, y: 5 }, 4)).toBeNull();
    // Caixa fechada em volta: nenhum vizinho livre.
    const BOX = grid(["#####", "#...#", "#.#.#", "#...#", "#####", ".....", "....."]);
    const w2 = world({ grid: BOX, spawns: [sp(1, 1, "m")], defs: () => def({ id: "m", attackRange: 4 }) });
    w2.mm.spawnAll();
    expect(findLosTilePath(first(w2), w2.mm, { x: 0, y: 6 }, 4)).toBeNull();
  });

  it("de ponta a ponta: o arqueiro contorna a parede e atira só com visão", () => {
    const w = world({ grid: WALL, spawns: [sp(11, 5, "m")], defs: () => def({ id: "m", aggroRange: 8, attackRange: 4, damage: [2, 2], attackMs: 500, stepMs: 100 }) });
    w.mm.spawnAll();
    const m = first(w);
    const p = w.add(player("p", 7, 5, { hp: 10_000, maxHp: 10_000 }));
    const hook = w.mm.attackHook;
    const shots: boolean[] = [];
    w.mm.attackHook = (mm, t, now) => { shots.push(w.mm.los(mm.s.x, mm.s.y, t.x, t.y)); hook(mm, t, now); };
    w.run(6000);
    expect(shots.length).toBeGreaterThan(0);
    expect(shots.every(Boolean)).toBe(true);
    expect(w.mm.los(m.s.x, m.s.y, p.x, p.y)).toBe(true);
    expect(cheb(m.s.x, m.s.y, p.x, p.y)).toBeLessThanOrEqual(4);
  });
});

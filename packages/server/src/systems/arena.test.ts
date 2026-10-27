import { describe, expect, it } from "vitest";
import {
  ARENA_BREAK_MS, ARENA_COUNTDOWN_MS, ARENA_MAX_WAVE, arenaWave, ARENA_INTRO_MS, ARENA_SHOP_PAUSE_MS, ARENA_SPAWN_DELAY_MS, S2C, arenaWaveGold,
  ARENA_COMPLETE_GOLD, ARENA_MILESTONE_GOLD, ARENA_MILESTONE_WAVE, ARENA_MOD_FROM_WAVE, ARENA_MOD_ORDER, ARENA_MODS, ARENA_PAUSE_HEAL,
  ARENA_WAVES, arenaModAt, arenaPauseMs, arenaShopAfter, arenaTimeText, arenaWaveMult, arenaWaveSpawns, arenaWeekMod, monsterDef,
  weekId, type ArenaModId, type TiledMap, type Vocation,
} from "@lemonquest/shared";
import type { PlayerState } from "../state.ts";
import { ArenaSystem, parseArenas, type ArenaLayout } from "./arena.ts";
import { ARENA_WAVE_CAP_S, Battle, arenaRun, fighterBuilds, type Fighter, type SimOptions } from "./balanceKit.ts";
import { openGrid, player, world } from "./testkit.ts";
import { loadMap } from "../world/map.ts";

const MASTER = { x: 5, y: 5 };
const EXIT = { x: 5, y: 8 };

function layout(n: number): ArenaLayout {
  return {
    exit: EXIT,
    arenas: Array.from({ length: n }, (_, i) => {
      const x0 = 20 + i * 20;
      return {
        id: i + 1, rect: { x0, y0: 2, x1: x0 + 15, y1: 17 }, entry: { x: x0 + 2, y: 10 },
        spawns: [{ x: x0 + 13, y: 5 }, { x: x0 + 13, y: 10 }, { x: x0 + 13, y: 15 }],
      };
    }),
  };
}

function setup(nArenas = 1, extra: Partial<ConstructorParameters<typeof ArenaSystem>[0]> = {}) {
  const w = world({ grid: openGrid(20 + nArenas * 20 + 5, 25), spawns: [] });
  const gold = new Map<string, number>();
  const best = new Map<string, number>();
  const exited: string[] = [];
  const arena = new ArenaSystem({
    layout: layout(nArenas), master: () => MASTER, fallbackExit: { x: 1, y: 1 },
    monsters: w.mm, combat: w.combat,
    players: () => w.players.values(), getPlayer: (id) => w.players.get(id),
    teleport: (p, x, y) => { p.x = x; p.y = y; },
    isFree: (x, y, self) => w.mm.grid.isWalkable(x, y) && !w.mm.isMonsterAt(x, y) &&
      ![...w.players.values()].some((o) => o.id !== self && o.x === x && o.y === y),
    addGold: (p, n) => gold.set(p.id, (gold.get(p.id) ?? 0) + n),
    getBest: (id) => best.get(id) ?? 0, setBest: (id, n) => best.set(id, n),
    onExit: (p) => exited.push(p.id),
    send: (to, type, msg) => w.sent.push({ to, type, msg }),
    broadcast: (type, msg) => w.sent.push({ to: "*", type, msg }),
    now: w.now, rng: () => 0.5, ...extra,
  });
  w.combat.hooks.interceptDeath = (p) => arena.interceptDeath(p);
  const run = (ms: number) => w.run(ms, () => arena.tick(w.now()));
  const add = (id: string, over: Partial<PlayerState> = {}) =>
    w.add(player(id, MASTER.x + 1 + w.players.size, MASTER.y + 1, { level: 1, ...over }));
  const arenaMonsters = () => [...w.mm.all()].filter((m) => m.arenaId);
  const killAll = () => { for (const m of arenaMonsters()) w.combat.damageMonster(m, "", 1e9, "physical", w.now()); };
  const lastOf = (to: string, type: string) => [...w.sent].reverse().find((s) => s.to === to && s.type === type)?.msg;
  const notices = (to: string) => w.sent.filter((s) => s.to === to && s.type === S2C.Notice).map((s) => s.msg.text as string);
  /** Do "iniciar" até a onda 1 começar a nascer (contagem + teleporte + 3-2-1 + aviso do spawn). */
  const toWave1 = () => run(ARENA_COUNTDOWN_MS + ARENA_INTRO_MS + ARENA_SPAWN_DELAY_MS + 1000);
  /**
   * Vence a onda atual de `id` (espera todos nascerem, mata, 100 ms) e devolve onda/fase/duração do intervalo; depois
   * pula o intervalo (Pronto na pausa). null = a partida acabou.
   */
  const clearWave = (id: string) => {
    const party = () => arena.partyFor(id);
    for (let g = 0; g < 100 && party() && (party()!.phase !== "fight" || party()!.pending.length); g++) run(200);
    for (const p of w.players.values()) p.hp = p.maxHp;
    killAll();
    run(100);
    const p = party();
    if (!p) return null;
    const out = { wave: p.wave, phase: p.phase, ms: p.phaseEndsAt - w.now() };
    if (p.phase === "pause") for (const m of p.members) { const pl = w.players.get(m.id); if (pl) arena.onAction(pl, { action: "ready" }); }
    return out;
  };
  return { w, arena, gold, best, exited, run, add, arenaMonsters, killAll, lastOf, notices, toWave1, clearWave };
}

describe("coliseu: mapa", () => {
  it("lê arenas, entradas, spawns e saída de objetos do mapa", () => {
    const obj = (id: number, type: string, x: number, y: number, props: Record<string, unknown> = {}, w = 0, h = 0) =>
      ({ id, name: "", type, x: x * 16, y: y * 16, width: w * 16, height: h * 16, properties: Object.entries(props).map(([name, value]) => ({ name, type: "int", value })) });
    const map: TiledMap = {
      width: 50, height: 50, tilewidth: 16, tileheight: 16, tilesets: [],
      layers: [{ name: "objects", type: "objectgroup", objects: [
        obj(1, "arena", 10, 10, { arenaId: 2 }, 5, 4), obj(2, "arena_entry", 11, 12, { arenaId: 2 }),
        obj(3, "arena_spawn", 13, 11, { arenaId: 2 }), obj(4, "arena_spawn", 13, 12, { arenaId: 2 }),
        obj(5, "arena_spawn", 30, 30, { arenaId: 1 }), obj(6, "arena_exit", 3, 4),
      ] }],
    };
    const l = parseArenas(map);
    expect(l.exit).toEqual({ x: 3, y: 4 });
    expect(l.arenas).toEqual([{ id: 2, rect: { x0: 10, y0: 10, x1: 14, y1: 13 }, entry: { x: 11, y: 12 }, spawns: [{ x: 13, y: 11 }, { x: 13, y: 12 }] }]);
  });

  it("o mapa real tem as 4 arenas com entrada e spawns dentro do retângulo", () => {
    const m = loadMap("world");
    const l = parseArenas(m.tiled);
    expect(l.arenas.map((a) => a.id)).toEqual([1, 2, 3, 4]);
    expect(l.exit).not.toBeNull();
    for (const a of l.arenas) {
      const inside = (p: { x: number; y: number }) => p.x >= a.rect.x0 && p.x <= a.rect.x1 && p.y >= a.rect.y0 && p.y <= a.rect.y1;
      expect(inside(a.entry) && m.grid.isWalkable(a.entry.x, a.entry.y)).toBe(true);
      expect(a.spawns.length).toBeGreaterThanOrEqual(4);
      for (const s of a.spawns) expect(inside(s) && m.grid.isWalkable(s.x, s.y)).toBe(true);
    }
  });
});

describe("coliseu: lobbies", () => {
  it("criar com o grupo (party): membros perto do Mestre entram juntos; longe/ocupado fica de fora", () => {
    const mates: Record<string, string[]> = { a: ["b", "c", "d"] };
    const k = setup(1, { partyMates: (id) => mates[id] ?? [], isPartyLeader: (id) => id === "a" });
    const a = k.add("a"), b = k.add("b"), c = k.add("c");
    k.add("d", { x: 19, y: 19 }); // longe do Mestre
    k.arena.onAction(c, { action: "create" }); // c já está em outro lobby
    k.arena.onAction(a, { action: "create", withParty: true });
    expect(k.arena.partyFor("a")!.members.map((m) => m.id)).toEqual(["a", "b"]);
    expect(k.notices("b")).toContain("a te colocou no grupo do Coliseu.");
    expect(k.notices("a").pop()).toMatch(/Ficaram de fora.*c, d/);
    // Quem não é líder do grupo não traz ninguém.
    k.arena.onAction(b, { action: "leave" });
    k.arena.onAction(b, { action: "create", withParty: true });
    expect(k.arena.partyFor("b")!.members.map((m) => m.id)).toEqual(["b"]);
  });

  it("criar, entrar, sair; líder passa adiante; sem limite de membros", () => {
    const k = setup();
    const [a, b, c, d, e, f] = ["a", "b", "c", "d", "e", "f"].map((id) => k.add(id));
    k.arena.onAction(a!, { action: "create" });
    const id = k.arena.partyFor("a")!.id;
    for (const p of [b, c, d, e]) k.arena.onAction(p!, { action: "join", lobbyId: id });
    expect(k.arena.partyFor("a")!.members.map((m) => m.id)).toEqual(["a", "b", "c", "d", "e"]);
    k.arena.onAction(b!, { action: "start" });
    expect(k.notices("b")).toContain("Só o líder pode iniciar.");
    k.arena.onAction(f!, { action: "list" }); // abriu a janela: passa a receber atualizações
    k.arena.onAction(a!, { action: "leave" });
    expect(k.arena.partyFor("a")).toBeUndefined();
    expect(k.arena.partyFor("b")!.leader).toBe("b");
    k.run(100);
    const lobbies = k.lastOf("f", S2C.ArenaLobbies);
    expect(lobbies.lobbies).toEqual([{ id, leader: "b", members: ["b", "c", "d", "e"], avgLevel: 1 }]);
    expect(lobbies.freeArenas).toBe(1);
  });

  it("quem se afasta do mestre sai do lobby", () => {
    const k = setup();
    const a = k.add("a"), b = k.add("b");
    k.arena.onAction(a, { action: "create" });
    k.arena.onAction(b, { action: "join", lobbyId: k.arena.partyFor("a")!.id });
    b.x = MASTER.x + 9;
    k.run(100);
    expect(k.arena.partyFor("b")).toBeUndefined();
    expect(k.arena.partyFor("a")!.members).toHaveLength(1);
    expect(k.notices("b").some((t) => t.includes("afastou"))).toBe(true);
    expect(k.lastOf("b", S2C.ArenaState)).toEqual({ state: null });
  });

  it("criar longe do mestre é recusado", () => {
    const k = setup();
    const a = k.add("a", { x: 40 });
    k.arena.onAction(a, { action: "create" });
    expect(k.arena.partyFor("a")).toBeUndefined();
  });
});

describe("coliseu: partida", () => {
  it("solo: contagem, teletransporte para a entrada, onda 1 com 3 ratos", () => {
    const k = setup();
    const a = k.add("a");
    k.arena.onAction(a, { action: "create" });
    k.arena.onAction(a, { action: "start" });
    expect(k.lastOf("a", S2C.ArenaState).state.phase).toBe("countdown");
    k.run(ARENA_COUNTDOWN_MS + 100);
    expect(a.x).toBeGreaterThanOrEqual(20);
    expect(k.lastOf("a", S2C.ArenaState).state).toMatchObject({ phase: "countdown", arenaId: 1 });
    expect(k.arenaMonsters()).toHaveLength(0);
    k.run(ARENA_INTRO_MS + ARENA_SPAWN_DELAY_MS + 500);
    const ms = k.arenaMonsters();
    expect(ms.map((m) => m.s.defId)).toEqual(["rat", "rat", "rat"]);
    expect(k.lastOf("a", S2C.ArenaState).state).toMatchObject({ phase: "fight", wave: 1, monstersLeft: 3 });
    expect(k.arena.freeArenas).toBe(0);
  });

  it("quantidade escala com o grupo (2 → ×1,2, 4 → ×1,6; antes ×1,6 / ×2,8)", () => {
    expect(arenaWaveSpawns(1, 1, 1)).toHaveLength(3);
    expect(arenaWaveSpawns(1, 2, 1)).toHaveLength(4);
    expect(arenaWaveSpawns(1, 4, 1)).toHaveLength(5);
    // elite: sempre 1, a vida escala com o grupo (×1,6 de quantidade × 1,3 de grupo)
    const solo = arenaWaveSpawns(5, 1, 6).find((s) => s.elite)!, quad = arenaWaveSpawns(5, 4, 6).find((s) => s.elite)!;
    expect(quad.hpMult / solo.hpMult).toBeCloseTo(2.08, 6);
    const k = setup();
    const a = k.add("a"), b = k.add("b");
    k.arena.onAction(a, { action: "create" });
    k.arena.onAction(b, { action: "join", lobbyId: k.arena.partyFor("a")!.id });
    k.arena.onAction(a, { action: "start" });
    k.toWave1();
    expect(k.arenaMonsters()).toHaveLength(4);
  });

  it("monstros da arena ficam no retângulo e só atacam membros", () => {
    const k = setup();
    const a = k.add("a");
    k.arena.onAction(a, { action: "create" });
    k.arena.onAction(a, { action: "start" });
    k.toWave1();
    const outsider = k.add("x");
    outsider.x = 27; outsider.y = 3; // dentro da arena, mas não é membro
    a.hp = 1e9; a.maxHp = 1e9;
    k.run(8000);
    for (const m of k.arenaMonsters()) {
      expect(m.s.x).toBeGreaterThanOrEqual(20);
      expect(m.s.x).toBeLessThanOrEqual(35);
      expect(m.s.targetId).not.toBe("x");
    }
    expect(outsider.hp).toBe(150);
    expect(a.hp).toBeLessThan(1e9);
  });

  it("vencer a onda paga XP e ouro divididos, cura 30% e dá um respiro curto; sem loot nem XP por abate", () => {
    const k = setup();
    const a = k.add("a"), b = k.add("b");
    k.arena.onAction(a, { action: "create" });
    k.arena.onAction(b, { action: "join", lobbyId: k.arena.partyFor("a")!.id });
    k.arena.onAction(a, { action: "start" });
    k.toWave1();
    a.hp = 50;
    const xp = Math.round((5 * monsterDef("rat")!.xp * 1.2) / 2);
    k.killAll();
    expect(a.xp).toBe(0); // abate não dá XP
    k.run(100);
    expect(a.xp).toBe(xp);
    expect(b.xp).toBe(xp);
    expect(k.gold.get("a")).toBe(arenaWaveGold(1));
    expect(a.hp).toBe(Math.min(a.maxHp, 50 + Math.round(a.maxHp * 0.3)));
    const st = k.lastOf("a", S2C.ArenaState).state;
    expect(st).toMatchObject({ phase: "break", wave: 1, earned: { xp, gold: arenaWaveGold(1) } });
    expect(st.phaseEndsAt - k.w.now()).toBeLessThanOrEqual(ARENA_BREAK_MS);
    expect(k.w.sent.some((s) => s.type === S2C.Loot)).toBe(false);
  });

  it("XP e ouro das ondas só para quem está na faixa de level do grupo (2/3 do maior)", () => {
    const k = setup();
    const hi = k.add("hi", { level: 30 }), lo = k.add("lo", { level: 5 }), mid = k.add("mid", { level: 20 });
    k.arena.onAction(hi, { action: "create" });
    for (const p of [lo, mid]) k.arena.onAction(p, { action: "join", lobbyId: k.arena.partyFor("hi")!.id });
    k.arena.onAction(hi, { action: "start" });
    k.toWave1();
    const xp0 = { hi: hi.xp, lo: lo.xp, mid: mid.xp };
    k.killAll();
    k.run(100);
    expect(hi.xp).toBeGreaterThan(xp0.hi);
    expect(mid.xp - xp0.mid).toBe(hi.xp - xp0.hi); // 20 ≥ 2/3 de 30
    expect(lo.xp).toBe(xp0.lo);
    expect(k.gold.get("lo") ?? 0).toBe(0);
    expect(k.gold.get("mid")).toBe(arenaWaveGold(1));
    expect(k.notices("lo").at(-1)).toMatch(/Sem XP nem ouro: level abaixo de 20/);
    expect(k.lastOf("lo", S2C.ArenaState).state.earned.xp).toBe(0);
    // A janela mostra o level de cada membro (para marcar quem fica sem XP).
    expect(k.lastOf("lo", S2C.ArenaState).state.members.map((m: any) => m.level).sort((x: number, y: number) => x - y)).toEqual([5, 20, 30]);
  });

  it("ondas comuns emendam: respiro de 3 s, sem loja nem Pronto", () => {
    const k = setup();
    const a = k.add("a"), b = k.add("b");
    k.arena.onAction(a, { action: "create" });
    k.arena.onAction(b, { action: "join", lobbyId: k.arena.partyFor("a")!.id });
    k.arena.onAction(a, { action: "start" });
    k.toWave1();
    k.killAll();
    k.run(100);
    expect(k.arena.partyFor("a")!.phase).toBe("break");
    k.arena.onAction(a, { action: "ready" }); // ignorado no respiro
    expect(k.lastOf("a", S2C.ArenaState).state.members.every((m: any) => m.ready === undefined)).toBe(true);
    expect(k.arena.canUseShop(a, "arena_shop_1")).toBe(false);
    k.run(ARENA_BREAK_MS);
    expect(k.arena.partyFor("a")).toMatchObject({ phase: "fight", wave: 2 });
  });

  it("pausa com vendedor só depois da onda-chefe (5); acaba no tempo ou quando todos clicam em Pronto", () => {
    const k = setup();
    const a = k.add("a", { level: 50, maxHp: 1e6, hp: 1e6 }), b = k.add("b", { level: 50, maxHp: 1e6, hp: 1e6 });
    k.arena.onAction(a, { action: "create" });
    k.arena.onAction(b, { action: "join", lobbyId: k.arena.partyFor("a")!.id });
    k.arena.onAction(a, { action: "start" });
    k.toWave1();
    for (let w = 1; w <= 5; w++) {
      k.killAll();
      k.run(100);
      if (w < 5) {
        expect(k.arena.partyFor("a")!.phase).toBe("break");
        k.run(ARENA_BREAK_MS + ARENA_SPAWN_DELAY_MS + 2000);
      }
    }
    const st = k.lastOf("a", S2C.ArenaState).state;
    expect(st).toMatchObject({ phase: "pause", wave: 5 });
    expect(st.phaseEndsAt - k.w.now()).toBeGreaterThan(ARENA_SHOP_PAUSE_MS - 500);
    expect(k.arena.canUseShop(a, "arena_shop_1")).toBe(true);
    k.arena.onAction(a, { action: "ready" });
    expect(k.lastOf("b", S2C.ArenaState).state.members).toEqual([
      { name: "a", alive: true, level: 50, ready: true }, { name: "b", alive: true, level: 50, ready: false },
    ]);
    k.run(3500);
    expect(k.arena.partyFor("a")!.phase).toBe("pause");
    k.arena.onAction(b, { action: "ready" });
    k.run(3100);
    expect(k.arena.partyFor("a")).toMatchObject({ phase: "fight", wave: 6 });
  });

  it("morte: sem penalidade, volta na saída com vida cheia, resultado; o grupo segue; wipe libera a arena", () => {
    const k = setup();
    const a = k.add("a"), b = k.add("b");
    k.arena.onAction(a, { action: "create" });
    k.arena.onAction(b, { action: "join", lobbyId: k.arena.partyFor("a")!.id });
    k.arena.onAction(a, { action: "start" });
    k.toWave1();
    k.killAll();
    k.run(100);
    const xp = a.xp;
    k.run(ARENA_BREAK_MS + ARENA_SPAWN_DELAY_MS + 2000);
    k.w.combat.damagePlayer(a, "", 1e6, "physical", k.w.now(), { killerName: "Rato" });
    expect(a.xp).toBe(xp);
    expect(a.hp).toBe(a.maxHp);
    expect(Math.max(Math.abs(a.x - EXIT.x), Math.abs(a.y - EXIT.y))).toBeLessThanOrEqual(1);
    expect(k.lastOf("a", S2C.ArenaResult)).toEqual({ wavesCleared: 1, xp, gold: arenaWaveGold(1), best: 1, reason: "wiped" });
    expect(k.w.sent.some((s) => s.type === S2C.Died)).toBe(false);
    expect(k.best.get("a")).toBe(1);
    expect(k.exited).toContain("a");
    expect(k.arena.partyFor("b")!.members.find((m) => m.id === "a")!.alive).toBe(false);
    expect(k.arenaMonsters().length).toBeGreaterThan(0);
    // b morre → wipe: monstros somem, arena livre
    k.w.combat.damagePlayer(b, "", 1e6, "physical", k.w.now(), { killerName: "Rato" });
    expect(k.arenaMonsters()).toHaveLength(0);
    expect(k.arena.freeArenas).toBe(1);
    expect(k.lastOf("b", S2C.ArenaResult).reason).toBe("wiped");
    // livre para outro lobby
    k.arena.onAction(a, { action: "create" });
    expect(k.arena.partyFor("a")!.phase).toBe("lobby");
  });

  it("desistir ('leave') na arena: gave_up e libera a arena", () => {
    const k = setup();
    const a = k.add("a");
    k.arena.onAction(a, { action: "create" });
    k.arena.onAction(a, { action: "start" });
    k.toWave1();
    k.arena.onAction(a, { action: "leave" });
    expect(k.lastOf("a", S2C.ArenaResult)).toMatchObject({ wavesCleared: 0, reason: "gave_up" });
    expect(k.arena.freeArenas).toBe(1);
    expect(a.x).toBeLessThan(20);
  });

  it("fila: com as arenas ocupadas o grupo espera e começa sozinho quando uma libera", () => {
    const k = setup(1);
    const a = k.add("a"), b = k.add("b");
    k.arena.onAction(a, { action: "create" });
    k.arena.onAction(a, { action: "start" });
    k.arena.onAction(b, { action: "create" });
    k.arena.onAction(b, { action: "start" });
    expect(k.arena.partyFor("b")!.phase).toBe("queued");
    expect(k.arena.queueLength).toBe(1);
    k.toWave1();
    expect(k.arena.partyFor("b")!.phase).toBe("queued");
    k.arena.onAction(a, { action: "leave" });
    expect(k.arena.partyFor("b")!.phase).toBe("countdown");
    expect(k.notices("b")).toContain("Uma arena ficou livre! Prepare-se.");
    k.toWave1();
    expect(k.arena.partyFor("b")).toMatchObject({ phase: "fight", wave: 1 });
    expect(b.x).toBeGreaterThanOrEqual(20);
  });

  it("4 arenas em paralelo; a 5ª entra na fila", () => {
    const k = setup(4);
    const ps = ["a", "b", "c", "d", "e"].map((id) => k.add(id));
    for (const p of ps) { k.arena.onAction(p, { action: "create" }); k.arena.onAction(p, { action: "start" }); }
    expect(ps.map((p) => k.arena.partyFor(p.id)!.phase)).toEqual(["countdown", "countdown", "countdown", "countdown", "queued"]);
    k.toWave1();
    expect(new Set(ps.slice(0, 4).map((p) => k.arena.partyFor(p.id)!.arena!.id)).size).toBe(4);
  });

  it("desconexão (fim da janela de reconexão) = desistência sem penalidade, salvo na saída", () => {
    const k = setup();
    const a = k.add("a");
    k.arena.onAction(a, { action: "create" });
    k.arena.onAction(a, { action: "start" });
    k.toWave1();
    k.killAll();
    k.run(100);
    k.arena.removePlayer("a");
    expect(a.x).toBeLessThan(20);
    expect(k.best.get("a")).toBe(1);
    expect(k.arena.freeArenas).toBe(1);
    expect(k.arenaMonsters()).toHaveLength(0);
  });

  it("posição salva dentro de uma arena → saída do coliseu", () => {
    const k = setup();
    expect(k.arena.loginPosition(25, 10)).toEqual(EXIT);
    expect(k.arena.loginPosition(5, 5)).toBeNull();
    expect(k.arena.loginPosition(null, null)).toBeNull();
  });

  it("loja da arena só na pausa (depois da onda-chefe) e só para a partida daquela arena", () => {
    const k = setup();
    const a = k.add("a", { level: 50, maxHp: 1e6, hp: 1e6 });
    expect(k.arena.canUseShop(a, "arena_shop_1")).toBe(false);
    expect(k.arena.canUseShop(a, "shop")).toBe(true);
    k.arena.onAction(a, { action: "create" });
    k.arena.onAction(a, { action: "start" });
    k.toWave1();
    expect(k.arena.canUseShop(a, "arena_shop_1")).toBe(false);
    for (let w = 1; w <= 5; w++) {
      k.killAll();
      k.run(100);
      if (w < 5) { expect(k.arena.canUseShop(a, "arena_shop_1")).toBe(false); k.run(ARENA_BREAK_MS + ARENA_SPAWN_DELAY_MS + 2000); }
    }
    expect(k.arena.canUseShop(a, "arena_shop_1")).toBe(true);
    expect(k.arena.canUseShop(a, "arena_shop_2")).toBe(false);
  });

  it("feed global para resultados notáveis", () => {
    const k = setup();
    const a = k.add("a", { level: 99, maxHp: 1e7, hp: 1e7 }), b = k.add("b", { level: 99, maxHp: 1e7, hp: 1e7 });
    k.arena.onAction(a, { action: "create" });
    k.arena.onAction(b, { action: "join", lobbyId: k.arena.partyFor("a")!.id });
    k.arena.onAction(a, { action: "start" });
    k.toWave1();
    for (let w = 1; w <= 10; w++) {
      k.killAll();
      k.run(100);
      k.arena.onAction(a, { action: "ready" });
      k.arena.onAction(b, { action: "ready" });
      k.run(3100 + ARENA_SPAWN_DELAY_MS + 3000);
    }
    k.arena.onAction(a, { action: "leave" });
    k.arena.onAction(b, { action: "leave" });
    const feed = k.w.sent.filter((s) => s.type === S2C.Feed).map((s) => s.msg.text);
    expect(feed).toContain("🏟️ a e b chegaram à onda 10 do Coliseu! Novo recorde!");
  });
});

/**
 * Balanço do Coliseu no modelo de `balanceKit.ts` (ciclo 15, 15-1): jogador bem equipado por level com as montagens de
 * verdade (duas mãos sem escudo; o cavaleiro testa as duas), skills de `skillEstimate`, magias no tempo de recarga,
 * Cura e Escudo de Mana (20 s de escudo, 30 s de recarga), poções no temporizador único e +30% de vida e mana entre
 * ondas. Grupo: os golpes se espalham na proporção da vida máxima (a hipótese do modelo do ciclo 8; a tabela mostra
 * também o caso em que o da frente — o cavaleiro — leva todos os golpes, como a IA faz com quem chega perto). O antigo
 * (ciclo 8) não tinha Cura nem escudo, dava escudo ao paladino e ao cavaleiro de duas mãos e usava ML = 0,75 × level.
 * Resultado: a onda em que o time cai (71 = completou as 70).
 */
const VOCS: Vocation[] = ["sorcerer", "druid", "knight", "paladin"];
const GROUP: Vocation[] = ["knight", "paladin", "sorcerer", "druid"];
const DONE = ARENA_MAX_WAVE + 1;
const fell = (w: number) => (w === 0 ? DONE : w);
const reached = new Map<string, number>();

/**
 * `arenaRun` do balanceKit com o modificador da semana nas ondas 61–70: ondas de `arenaWaveSpawns(..., mod)` e o
 * intervalo de `arenaPauseMs(wave, mod)` (Sem Trégua e Calmaria mudam o respiro; o `Battle.arenaPause` usa o padrão).
 */
function arenaRunMod(team: readonly Fighter[], mod: ArenaModId): number {
  const avg = team.reduce((s, f) => s + f.L, 0) / team.length;
  const b = new Battle(team);
  for (let w = 1; w <= ARENA_MAX_WAVE; w++) {
    b.setFoes(arenaWaveSpawns(w, team.length, avg, mod).map((s) => ({ def: monsterDef(s.defId)!, hpMult: s.hpMult, dmgMult: s.dmgMult })));
    if (b.run("mixed", ARENA_WAVE_CAP_S) !== "won") return w;
    for (const u of b.units) {
      if (!u.alive) continue;
      u.hp = Math.min(u.f.hp, u.hp + u.f.hp * ARENA_PAUSE_HEAL);
      u.mana = Math.min(u.f.mana, u.mana + u.f.mana * ARENA_PAUSE_HEAL);
    }
    b.setFoes([]);
    b.run("mixed", arenaPauseMs(w, mod) / 1000, false);
  }
  return 0;
}

/** Onda em que o time cai (71 = completou), com a melhor montagem de cada um; `mod` = modificador da semana. */
function reach(vocs: readonly Vocation[], L: number, o: SimOptions = {}, mod?: ArenaModId): number {
  const key = `${vocs.join()}@${L}:${JSON.stringify(o)}:${mod ?? ""}`;
  let w = reached.get(key);
  if (w === undefined) {
    let teams: Fighter[][] = [[]];
    for (const v of vocs) teams = teams.flatMap((t) => fighterBuilds(v, L).map((f) => [...t, f]));
    w = Math.max(...teams.map((t) => fell(mod ? arenaRunMod(t, mod) : arenaRun(t, o))));
    reached.set(key, w);
  }
  return w;
}

describe("coliseu: balanço (modelo de balanceKit.ts)", () => {
  it("tabela: onda em que cada um cai sozinho e o grupo de 4 (console)", () => {
    const solo = [34, 60, 120].map((L) => ({ level: L, ...Object.fromEntries(VOCS.map((v) => [v, reach([v], L)])) }));
    console.table(solo);
    const group = [...[40, 45, 50, 55, 60, 65, 70].map((x) => ({ grupo: `justo da ${x}`, level: arenaWave(x)!.level })),
      ...[100, 110, 120, 130, 140].map((L) => ({ grupo: `lv ${L}`, level: L }))]
      .map((g) => ({ ...g, onda: reach(GROUP, g.level), "golpes no da frente": reach(GROUP, g.level, { targeting: "front" }) }));
    console.table(group);
    // Modificador da semana (ondas 61–70): onda em que o grupo de 4 cai em cada semana.
    console.table([110, 115, 120, 125, 130, 140].map((L) => ({
      level: L, sem: reach(GROUP, L), ...Object.fromEntries(ARENA_MOD_ORDER.map((m) => [ARENA_MODS[m].name, reach(GROUP, L, {}, m)])),
    })));
    expect(solo.length).toBe(3);
  }, 60_000);

  // Ciclo 15-14 (ARENA_DMG_POINTS em shared/data/arena.ts). Antes da recalibração, com as vocações do ciclo 15 e as
  // skills da produção: solo lv 34 — magos 18; solo lv 120 — druida 34, cavaleiro de duas mãos 35; grupo no justo da
  // 40/45/50/55/60 — 44/54/61/61/61 e o lv 100 completava. Depois: solo lv 34 22/22/23/23, lv 120 29/29/30/29; grupo
  // 38/46/48/54/61, lv 100 cai na 54.
  it("solo no level justo da 25 (lv 34) cai entre a onda 20 e a 25; no lv 60 não passa da 28", () => {
    for (const v of VOCS) {
      expect(reach([v], 34), `${v} lv 34`).toBeGreaterThanOrEqual(20);
      expect(reach([v], 34), `${v} lv 34`).toBeLessThanOrEqual(25);
      expect(reach([v], 60), `${v} lv 60`).toBeLessThanOrEqual(28);
    }
  });

  it("solo: ninguém passa da onda 30, nem no level 120 (o muro da onda 30)", () => {
    for (const v of VOCS) expect(reach([v], 120), `${v} lv 120`).toBeLessThanOrEqual(30);
  });

  it("feiticeiro solo lv 120 nem com o escudo de antes (tudo na mana) passa da 30: o buraco de 10 s do escudo derruba", () => {
    // O plano (15-1) esperava 34–35 com o escudo de antes (modelo de planejamento, escudo sempre ativo). Com a recarga
    // de verdade (20 s de escudo a cada 30 s) a onda 29 cai no buraco, e os espíritos de chama das ondas 26–30 resistem
    // ao fogo.
    expect(reach(["sorcerer"], 120, { absorb: 1 })).toBeLessThanOrEqual(30);
  });

  it("grupo de 4 no level justo da onda X cai entre X−5 e X+3 (na 60, até o portão do Abismo)", () => {
    for (const x of [40, 45, 50, 55, 60]) {
      const w = reach(GROUP, arenaWave(x)!.level);
      expect(w, `justo da ${x}`).toBeGreaterThanOrEqual(x - 5);
      // 2026-10-27 (cura como no Tibia): o grupo justo da 60 fecha o bloco e cai dentro do Abismo (62–69), não antes.
      expect(w, `justo da ${x}`).toBeLessThanOrEqual(x === 60 ? 70 : x + 3);
    }
  });

  it("passar do portão do Abismo (61) pede grupo de level alto: lv 100 não passa, lv 120 passa", () => {
    // 2026-10-27 (cura como no Tibia): o grupo lv 100 passou a aguentar a onda 60 e cai no portão (61, ×2,6); a meta
    // virou "não passa do portão" (era "não passa da 60").
    expect(reach(GROUP, 100)).toBeLessThanOrEqual(61);
    expect(reach(GROUP, 120)).toBeGreaterThan(61);
  });

  // Ciclo 16 (16-6): ondas 61–70. Medido com o Shogun Abissal dos covis e sem o tier 8: grupo lv 110 cai na 61 (o
  // portão do Abismo), lv 115 na 63, lv 120 em diante completa.
  it("completar as 70 pede ainda mais: lv 110 não completa, lv 130 completa", () => {
    expect(reach(GROUP, 110)).toBeLessThanOrEqual(ARENA_MAX_WAVE);
    expect(reach(GROUP, 130)).toBe(DONE);
    expect(reach(GROUP, 140)).toBe(DONE);
  });

  // 2026-10-27 (cura como no Tibia): era "com todos o lv 130 completa"; com a cura nova a semana de Fúria segura o lv
  // 130 na 69 e o lv 135 completa em todas (escada medida: 110 ≤ 69 · 120 completa sem modificador · 135 completa sempre).
  it("modificador da semana: nenhum deixa o lv 110 completar as 70 e com todos o lv 135 completa", () => {
    for (const m of ARENA_MOD_ORDER) {
      expect(reach(GROUP, 110, {}, m), `${m} lv 110`).toBeLessThanOrEqual(ARENA_MAX_WAVE);
      expect(reach(GROUP, 135, {}, m), `${m} lv 135`).toBe(DONE);
    }
  }, 30_000);

  it("modificador da semana: a Calmaria não é mais difícil que a semana sem modificador (±1 onda do modelo); Fúria e Enxame derrubam o lv 120", () => {
    // ±1: a Calmaria muda o ritmo das pausas e o modelo determinístico oscila uma onda em volta do mesmo resultado.
    for (const L of [110, 115, 120, 125]) expect(reach(GROUP, L, {}, "calmaria"), `lv ${L}`).toBeGreaterThanOrEqual(reach(GROUP, L) - 1);
    expect(reach(GROUP, 120)).toBe(DONE);
    expect(reach(GROUP, 120, {}, "furia")).toBeLessThanOrEqual(ARENA_MAX_WAVE);
    expect(reach(GROUP, 120, {}, "enxame")).toBeLessThanOrEqual(ARENA_MAX_WAVE);
  }, 30_000);

  it("o golpe médio dos monstros cresce a cada bloco de 10 ondas", () => {
    const hit = (b: number) => {
      let sum = 0, n = 0;
      for (let w = b * 10 + 1; w <= b * 10 + 10; w++) {
        for (const s of arenaWaveSpawns(w, 1, 1)) { const d = monsterDef(s.defId)!; sum += ((d.damage[0] + d.damage[1]) / 2) * s.dmgMult; n++; }
      }
      return sum / n;
    };
    for (let b = 1; b < 6; b++) expect(hit(b), `bloco ${b + 1}`).toBeGreaterThan(hit(b - 1));
  });

  it("ondas 31–70 seguem com o level justo crescente", () => {
    expect(ARENA_MAX_WAVE).toBe(70);
    for (let w = 31; w <= ARENA_MAX_WAVE; w++) expect(arenaWave(w)!.level).toBeGreaterThan(arenaWave(w - 1)!.level);
  });
});

describe("coliseu: ondas 61–70 (ciclo 16)", () => {
  it("monstros do Abismo Profundo; chefes Shogun Abissal (65) e Ferumbras (70); comuns de 1 a 3 por entrada", () => {
    expect(ARENA_WAVES).toHaveLength(70);
    const ids = new Set<string>();
    for (let w = 61; w <= 70; w++) {
      const wave = arenaWave(w)!;
      expect(wave.wave).toBe(w);
      expect(!!wave.boss, `onda ${w}`).toBe(w % 5 === 0);
      for (const e of wave.monsters) {
        ids.add(e.id);
        expect(monsterDef(e.id), e.id).toBeDefined();
        if (e.elite === undefined) expect(e.count, `onda ${w} ${e.id}`).toBeGreaterThanOrEqual(1);
        if (e.elite === undefined) expect(e.count, `onda ${w} ${e.id}`).toBeLessThanOrEqual(3);
      }
    }
    expect([...ids].sort()).toEqual(["abyss_samurai", "abyss_tengu", "ferumbras", "juggernaut", "lair_shogun"]);
    expect(arenaWave(65)!.monsters).toEqual([{ id: "lair_shogun", count: 1, elite: 1 }]);
    expect(arenaWave(70)!.monsters).toEqual([{ id: "ferumbras", count: 1, elite: 1 }]);
    expect(monsterDef("lair_shogun")!.boss && monsterDef("ferumbras")!.boss).toBe(true);
    // Chefes: um só, vida de grupo de 4 (×2,5 da arena), mínimo de 80% dela para o solo.
    expect(arenaWaveSpawns(70, 4, 130)).toEqual([expect.objectContaining({ defId: "ferumbras", elite: true, hpMult: 2.5 })]);
    expect(arenaWaveSpawns(70, 1, 130)[0]!.hpMult).toBeCloseTo(2.5 * 0.8, 6);
    // Dano: portão na 61 e ×1,73 da 62 à 70 (era 1,5 antes da cura como no Tibia, 2026-10-27).
    expect(arenaWaveMult(61).dmg).toBeCloseTo(2.6, 6);
    for (let w = 62; w <= 70; w++) expect(arenaWaveMult(w).dmg, `onda ${w}`).toBeCloseTo(1.73, 6);
  });

  it("o bando não diminui da 62 à 69 (grupo de 4: de 4 a 5 monstros, a 69 com 5 Samurais Rubros)", () => {
    const commons = [62, 63, 64, 66, 67, 68, 69];
    const n = commons.map((w) => arenaWaveSpawns(w, 4, 120).length);
    for (let i = 1; i < n.length; i++) expect(n[i], `onda ${commons[i]}`).toBeGreaterThanOrEqual(n[i - 1]!);
    expect(n.at(-1)).toBeGreaterThan(n[0]!);
    expect(arenaWaveSpawns(69, 4, 120).map((s) => s.defId)).toEqual(Array(5).fill("abyss_samurai"));
  });

  it("vendedor e pausas: depois da 60 e da 65 (ondas-chefe); a 70 encerra", () => {
    expect(arenaShopAfter(60)).toBe(true);
    expect(arenaShopAfter(65)).toBe(true);
    expect(arenaShopAfter(64)).toBe(false);
    expect(arenaPauseMs(60)).toBe(ARENA_SHOP_PAUSE_MS);
    expect(arenaPauseMs(66)).toBe(ARENA_BREAK_MS);
  });
});

describe("coliseu: modificador da semana", () => {
  it("rodízio determinístico pela semana: nunca repete em semanas seguidas e passa pelos 5", () => {
    expect(arenaWeekMod("2026-W43")).toBe(arenaWeekMod("2026-W43"));
    expect(arenaWeekMod("2026-W43")).toBe("calmaria");
    expect(arenaWeekMod("2026-W44")).toBe("carapaca");
    expect(arenaModAt(new Date(2026, 9, 25, 23, 59).getTime())).toBe(arenaWeekMod("2026-W43"));
    expect(arenaModAt(new Date(2026, 9, 26, 0, 0).getTime())).toBe(arenaWeekMod("2026-W44"));
    let prev = "";
    const seen = new Set<string>();
    for (let t = new Date(2026, 0, 5).getTime(), i = 0; i < 160; i++, t += 7 * 86_400_000) {
      const m = arenaModAt(t);
      expect(m, weekId(new Date(t))).not.toBe(prev);
      prev = m;
      seen.add(m);
    }
    expect([...seen].sort()).toEqual([...ARENA_MOD_ORDER].sort());
    expect(Object.keys(ARENA_MODS).sort()).toEqual([...ARENA_MOD_ORDER].sort());
  });

  it("só pesa nas ondas 61–70: Fúria (+10% de dano), Carapaça (+25% de vida), Enxame (mais monstros e mais fracos)", () => {
    for (const m of ARENA_MOD_ORDER) expect(arenaWaveSpawns(ARENA_MOD_FROM_WAVE - 1, 4, 120, m)).toEqual(arenaWaveSpawns(ARENA_MOD_FROM_WAVE - 1, 4, 120));
    const base = arenaWaveSpawns(63, 4, 120);
    const furia = arenaWaveSpawns(63, 4, 120, "furia"), cara = arenaWaveSpawns(63, 4, 120, "carapaca");
    expect(furia.map((s) => s.dmgMult / base[0]!.dmgMult)).toEqual(base.map(() => expect.closeTo(1.1, 6)));
    expect(cara.map((s) => s.hpMult / base[0]!.hpMult)).toEqual(base.map(() => expect.closeTo(1.25, 6)));
    // Chefes também (Fúria/Carapaça); Enxame só mexe nos comuns.
    expect(arenaWaveSpawns(70, 4, 130, "furia")[0]!.dmgMult / arenaWaveSpawns(70, 4, 130)[0]!.dmgMult).toBeCloseTo(1.1, 6);
    expect(arenaWaveSpawns(70, 4, 130, "enxame")).toEqual(arenaWaveSpawns(70, 4, 130));
    // Enxame: samurai e colosso (1 cada → 2 num grupo de 4) viram 3 cada, com 60% da vida e 75% do dano; a XP da onda não muda.
    const swarm = arenaWaveSpawns(63, 4, 120, "enxame");
    expect(base.map((s) => s.defId)).toEqual(["abyss_samurai", "abyss_samurai", "juggernaut", "juggernaut"]);
    expect(swarm.map((s) => s.defId)).toEqual(["abyss_samurai", "abyss_samurai", "abyss_samurai", "juggernaut", "juggernaut", "juggernaut"]);
    expect(swarm[0]!.hpMult / base[0]!.hpMult).toBeCloseTo(0.6, 6);
    expect(swarm[0]!.dmgMult / base[0]!.dmgMult).toBeCloseTo(0.75, 6);
    const xp = (l: { xp: number }[]) => l.reduce((a, b) => a + b.xp, 0);
    expect(xp(swarm)).toBeCloseTo(xp(base), 6);
  });

  it("Sem Trégua: respiro de 1 s nas 61–69 e sem vendedor depois da 65 (o da 60 fica); Calmaria: respiro de 10 s", () => {
    expect(arenaPauseMs(61, "sem_tregua")).toBe(1000);
    expect(arenaShopAfter(65, "sem_tregua")).toBe(false);
    expect(arenaPauseMs(65, "sem_tregua")).toBe(1000);
    expect(arenaShopAfter(60, "sem_tregua")).toBe(true);
    expect(arenaPauseMs(59, "sem_tregua")).toBe(ARENA_BREAK_MS);
    expect(arenaPauseMs(62, "calmaria")).toBe(10_000);
    expect(arenaPauseMs(65, "calmaria")).toBe(ARENA_SHOP_PAUSE_MS);
    expect(arenaPauseMs(62, "furia")).toBe(ARENA_BREAK_MS);
  });

  it("servidor: o modificador vai no lobby e na partida, fica o da largada mesmo se a semana virar, e muda as pausas", () => {
    let mod: ArenaModId = "sem_tregua";
    const k = setup(1, { weekMod: () => mod });
    const a = k.add("a", { level: 130, maxHp: 1e9, hp: 1e9 });
    k.arena.onAction(a, { action: "list" });
    expect(k.lastOf("a", S2C.ArenaLobbies).week).toMatchObject({ mod: "sem_tregua" });
    k.arena.onAction(a, { action: "create" });
    expect(k.lastOf("a", S2C.ArenaState).state.mod).toBe("sem_tregua");
    k.arena.onAction(a, { action: "start" });
    k.toWave1();
    const st = k.lastOf("a", S2C.ArenaState).state;
    expect(st).toMatchObject({ mod: "sem_tregua", wave: 1 });
    expect(st.startedAt).toBeGreaterThan(0);
    mod = "furia"; // a semana virou no meio da partida
    const after = new Map<number, { phase: string; ms: number }>();
    for (let g = 0; g < 200; g++) {
      const r = k.clearWave("a");
      if (!r) break;
      after.set(r.wave, r);
      k.run(r.phase === "pause" ? 3100 : r.ms + 50);
    }
    expect(after.get(60)).toMatchObject({ phase: "pause" });
    expect(after.get(60)!.ms).toBeGreaterThan(ARENA_SHOP_PAUSE_MS - 500);
    expect(after.get(61)).toMatchObject({ phase: "break" });
    expect(after.get(61)!.ms).toBeLessThanOrEqual(1000);
    expect(after.get(65)).toMatchObject({ phase: "break" });
    expect(k.lastOf("a", S2C.ArenaResult)).toMatchObject({ reason: "completed", wavesCleared: 70 });
    expect(k.notices("a").filter((t) => t.startsWith("Ondas 61–70 desta semana"))).toEqual([
      `Ondas 61–70 desta semana: ⏩ Sem Trégua — ${ARENA_MODS.sem_tregua.desc}`,
    ]);
  });
});

describe("arena: fim do Coliseu", () => {
  it(`vencer as ${ARENA_MAX_WAVE} ondas: resultado "completed", marco da 60, bônus de ouro e XP, recorde e arena liberada`, () => {
    const k = setup();
    const a = k.add("a", { level: 120, maxHp: 1e9, hp: 1e9 });
    k.arena.onAction(a, { action: "create" });
    k.arena.onAction(a, { action: "start" });
    k.toWave1();
    for (let guard = 0; !k.lastOf("a", S2C.ArenaResult) && guard < 400; guard++) {
      a.hp = a.maxHp;
      k.killAll();
      k.run(1000);
      k.arena.onAction(a, { action: "ready" });
      k.run(3000);
    }
    const res = k.lastOf("a", S2C.ArenaResult);
    expect(res).toMatchObject({ reason: "completed", wavesCleared: ARENA_MAX_WAVE, best: ARENA_MAX_WAVE });
    let waveGold = 0;
    for (let w = 1; w <= ARENA_MAX_WAVE; w++) waveGold += arenaWaveGold(w);
    expect(waveGold).toBe(136_675);
    expect(res.gold).toBe(waveGold + ARENA_MILESTONE_GOLD + ARENA_COMPLETE_GOLD);
    const marco = `+${arenaWaveGold(ARENA_MILESTONE_WAVE) + ARENA_MILESTONE_GOLD} de ouro (${ARENA_MILESTONE_GOLD} do marco da onda ${ARENA_MILESTONE_WAVE}).`;
    expect(k.notices("a").filter((t) => t.startsWith(`Onda ${ARENA_MILESTONE_WAVE} vencida!`) && t.endsWith(marco))).toHaveLength(1);
    expect(k.gold.get("a")).toBe(res.gold);
    expect(a.xp).toBe(res.xp); // começou com 0: tudo veio das ondas + 25% de bônus
    expect(k.best.get("a")).toBe(ARENA_MAX_WAVE);
    expect(k.arena.inMatch("a")).toBe(false);
    expect(k.arena.freeArenas).toBe(1);
    expect(k.arenaMonsters()).toHaveLength(0);
    expect([a.x, a.y]).toEqual([EXIT.x, EXIT.y]);
  });

  it("ranking de tempo: grava o tempo das 70 no kv (sobreviventes na faixa de level), mostra no lobby, no resultado e no feed", () => {
    const kv = new Map<string, string>();
    const k = setup(1, { getKv: (key) => kv.get(key), setKv: (key, v) => kv.set(key, v), weekMod: () => "furia" });
    const hi = k.add("hi", { name: "Hi", level: 130, maxHp: 1e9, hp: 1e9 }), lo = k.add("lo", { name: "Lo", level: 60, maxHp: 1e9, hp: 1e9 });
    const play = (slowMs: number) => {
      k.arena.onAction(hi, { action: "create" });
      k.arena.onAction(lo, { action: "join", lobbyId: k.arena.partyFor("hi")!.id });
      k.arena.onAction(hi, { action: "start" });
      k.toWave1();
      const t0 = k.lastOf("hi", S2C.ArenaState).state.startedAt as number;
      for (let g = 0; g < 200; g++) {
        if (slowMs) k.run(slowMs); // luta mais longa
        const r = k.clearWave("hi");
        if (!r) break;
        k.run(r.phase === "pause" ? 3100 : r.ms + 50);
      }
      return { res: k.lastOf("hi", S2C.ArenaResult), t0 };
    };
    const first = play(0);
    expect(first.res).toMatchObject({ reason: "completed", wavesCleared: 70, timeRecord: "server" });
    expect(first.res.timeMs).toBeGreaterThan(60_000);
    const week = weekId(new Date(k.w.now()));
    const saved = JSON.parse(kv.get(`arena.time.week.${week}`)!);
    expect(saved).toMatchObject({ ms: first.res.timeMs, names: ["Hi"], week, mod: "furia" }); // Lo (fora da faixa) não entra
    expect(kv.get("arena.time.best")).toBe(kv.get(`arena.time.week.${week}`));
    const feed = k.w.sent.filter((s) => s.type === S2C.Feed).map((s) => s.msg.text as string);
    expect(feed).toContain(`🏟️ Hi e Lo venceram as 70 ondas do Coliseu em ${arenaTimeText(first.res.timeMs)}! Novo recorde de tempo!`);
    k.arena.onAction(hi, { action: "list" });
    expect(k.lastOf("hi", S2C.ArenaLobbies).week).toMatchObject({ mod: "furia", best: { names: ["Hi"] }, record: { names: ["Hi"] } });
    // Mais devagar: não troca o recorde.
    const second = play(2000);
    expect(second.res.timeMs).toBeGreaterThan(first.res.timeMs);
    expect(second.res.timeRecord).toBeUndefined();
    expect(JSON.parse(kv.get("arena.time.best")!).ms).toBe(first.res.timeMs);
  });

  it("ranking de tempo: partida que vira a semana conta na semana em que começou (a do modificador que ela usou)", () => {
    const kv = new Map<string, string>();
    const k = setup(1, { getKv: (key) => kv.get(key), setKv: (key, v) => kv.set(key, v) }); // modificador de verdade (weekId)
    k.w.setClock(new Date(2026, 9, 25, 23, 58).getTime()); // domingo 23:58 da 2026-W43
    const a = k.add("a", { name: "Ana", level: 130, maxHp: 1e9, hp: 1e9 });
    k.arena.onAction(a, { action: "create" });
    k.arena.onAction(a, { action: "start" });
    k.toWave1();
    expect(k.arena.partyFor("a")!.mod).toBe(arenaWeekMod("2026-W43"));
    for (let g = 0; g < 200; g++) {
      k.run(2000); // lutas mais longas: a partida passa da meia-noite
      const r = k.clearWave("a");
      if (!r) break;
      k.run(r.phase === "pause" ? 3100 : r.ms + 50);
    }
    expect(k.lastOf("a", S2C.ArenaResult)).toMatchObject({ reason: "completed", timeRecord: "server" });
    expect(weekId(new Date(k.w.now()))).toBe("2026-W44");
    expect(JSON.parse(kv.get("arena.time.week.2026-W43")!)).toMatchObject({ week: "2026-W43", mod: arenaWeekMod("2026-W43"), names: ["Ana"] });
    expect(kv.has("arena.time.week.2026-W44")).toBe(false);
    // A janela já mostra a semana nova: outro modificador, sem tempo da semana, recorde mantido.
    k.arena.onAction(a, { action: "list" });
    const week = k.lastOf("a", S2C.ArenaLobbies).week;
    expect(week.mod).toBe(arenaWeekMod("2026-W44"));
    expect(week.best).toBeUndefined();
    expect(week.record).toMatchObject({ week: "2026-W43", names: ["Ana"] });
  });
});

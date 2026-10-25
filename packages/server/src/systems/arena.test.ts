import { describe, expect, it } from "vitest";
import {
  ARENA_BREAK_MS, ARENA_COUNTDOWN_MS, ARENA_MAX_WAVE, arenaWave, ARENA_INTRO_MS, ARENA_SHOP_PAUSE_MS, ARENA_SPAWN_DELAY_MS, S2C, arenaWaveGold,
  ARENA_COMPLETE_GOLD, ITEMS, arenaWaveSpawns, autoAttackRange, baseStats, manaRegenAmount, mitigateSpell, monsterDef,
  damageTakenMult, shieldArmorBonus, spellMana, spellsFor, type DamageKind, type ItemDef, type MonsterDef, type TiledMap, type Vocation,
} from "@lemonquest/shared";
import type { PlayerState } from "../state.ts";
import { ArenaSystem, parseArenas, type ArenaLayout } from "./arena.ts";
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
  return { w, arena, gold, best, exited, run, add, arenaMonsters, killAll, lastOf, notices, toWave1 };
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
 * Modelo de balanço do Coliseu (ciclo 8), com o poder REAL do jogador (o modelo antigo usava 6 + 1,6·L de dano e
 * subestimava o jogador ~4×: um mago completava o Coliseu sozinho):
 * - Jogador "bem equipado": melhor item da vocação até o level, skill da arma 10 + 0,6·L, magic level de
 *   `spells.test.ts` (mago 0,75·L) — um teto otimista; Fúria do cavaleiro contada como média.
 * - Dano: ataque automático + rotação de magias no cooldown global (as de área pegam até 4 monstros, as ondas 3),
 *   com a armadura do monstro em foco; mana: regeneração em combate + poções de mana (400).
 * - Cura: Poção de Vida Grande (450 a cada 2 s); o tempo gasto em poções de mana sai dela (o temporizador é um só).
 *   Sem exura, cura em grupo ou kiting.
 * - Grupo: vida e cura somadas; o grupo foca um monstro (as áreas acertam os outros); todos os vivos batem.
 * - Entre ondas +30% da vida (ARENA_PAUSE_HEAL); depois de onda-chefe (pausa de 45 s com loja), vida cheia.
 * Resultado: a onda em que o grupo cai (0 = completou).
 */
const SLOTS = ["helmet", "amulet", "armor", "weapon", "shield", "legs", "ring", "boots"] as const;
const AREA_CAP: Record<string, number> = { target: 1, area_target: 4, area_self: 4, wave: 3 };

function fighter(v: Vocation, L: number) {
  const gear: ItemDef[] = [];
  for (const sl of SLOTS) {
    let best: ItemDef | undefined;
    for (const it of Object.values(ITEMS)) {
      if (it.slot !== sl || (it.vocations && !it.vocations.includes(v)) || (it.level ?? 0) > L) continue;
      if (!best || it.value > best.value) best = it;
    }
    if (best) gear.push(best);
  }
  const bonus = (st: string) => gear.reduce((s, it) => s + ((it.stats as Record<string, number> | undefined)?.[st] ?? 0), 0);
  const mage = v === "sorcerer" || v === "druid";
  const ml = (mage ? Math.floor(0.75 * L) : v === "paladin" ? Math.floor(L / 4) : Math.floor(L / 7)) + bonus("magic");
  const wsk = Math.min(10 + Math.floor(0.6 * L), 80);
  const skills = { melee: v === "knight" ? wsk : 10, distance: v === "paladin" ? wsk : 10, magic: ml };
  const { maxHp, maxMana } = baseStats(v, L);
  const weapon = gear.find((g) => g.slot === "weapon");
  const r = autoAttackRange(v, L, skills, weapon, (st) => bonus(st));
  const crit = (v === "knight" || v === "paladin" ? 0.07 : 0) + bonus("crit") / 100;
  const mana = maxMana + bonus("manaMax");
  return {
    v, L, ml, hp: maxHp + bonus("hpMax"),
    armor: bonus("armor") + (gear.some((g) => g.slot === "shield") ? shieldArmorBonus(v === "knight" ? wsk : 10) : 0),
    auto: ((r[0] + r[1]) / 2) * (1 + 0.5 * crit) * 0.95,
    autoKind: (weapon?.damageKind ?? "physical") as DamageKind,
    regen: manaRegenAmount(mana, L, true, false) / 2,
    spells: spellsFor(v).filter((s) => s.damage && s.level <= L),
  };
}
type Fighter = ReturnType<typeof fighter>;

/**
 * Dano por segundo no foco e em área (por alvo) contra `k` monstros como `foe` (armadura e resistência elemental);
 * cura de poção por segundo. A rotação prefere o que rende mais contra esse monstro (como o jogador com os grupos).
 */
function rotation(f: Fighter, k: number, foe: MonsterDef) {
  const arm = foe.armor;
  const list = f.spells.map((s) => {
    const raw = s.damage!.base + f.L * s.damage!.perLevel + f.ml * s.damage!.perMagic;
    const cap = AREA_CAP[s.target] ?? 1;
    const d = mitigateSpell(raw, arm, s.damage!.kind) * damageTakenMult(foe, s.damage!.kind);
    return { d, t: Math.min(k, cap), area: cap > 1, cd: s.cooldownMs / 1000, mana: spellMana(s, f.L) };
  }).sort((a, b) => b.d * b.t - a.d * a.t);
  let gcd = 1, st = (Math.max(0, f.auto - arm) * damageTakenMult(foe, f.autoKind)) / 2, aoe = 0, manaPs = 0;
  for (const x of list) {
    const rate = Math.min(1 / x.cd, gcd);
    if (rate <= 0) break;
    gcd -= rate;
    manaPs += x.mana * rate;
    if (x.area) aoe += x.d * rate; else st += x.d * rate;
  }
  const potsMana = Math.max(0, manaPs - f.regen) / 900; // poções de mana (grande, 900 — ciclo 9) por segundo
  const scale = potsMana > 1 ? 1 / potsMana : 1;
  const fury = f.v === "knight" && f.L >= 50 ? 1 + 0.25 / 3 : 1; // Fúria: +25% por 10 s a cada 30 s
  return { st: st * scale * fury, aoe: aoe * scale * fury, heal: (450 * (1 - Math.min(1, potsMana))) / 2 };
}

/** Dano por segundo de um monstro da onda contra a armadura `armor` (habilidades com aviso: 60% acertam). */
function monsterDps(s: { defId: string; dmgMult: number }, armor: number): number {
  const d = monsterDef(s.defId)!;
  const avg = ((d.damage[0] + d.damage[1]) / 2) * s.dmgMult;
  let dps = Math.max(0, avg - armor) / (d.attackMs / 1000);
  for (const a of d.abilities ?? []) {
    if (!a.damage) continue;
    const ad = Math.max(0, ((a.damage.min + a.damage.max) / 2) * s.dmgMult - armor);
    dps += (((ad - Math.max(0, avg - armor)) * (d.attackMs / a.cooldownMs)) / (d.attackMs / 1000)) * (a.windupMs ? 0.6 : 1);
  }
  return Math.max(0, dps);
}

/** Onda em que o grupo cai (0 = venceu as 60). */
function arenaRun(vocs: Vocation[], L: number): number {
  const fs = vocs.map((v) => fighter(v, L));
  const n = fs.length, maxHp = fs.reduce((s, f) => s + f.hp, 0), armor = fs.reduce((s, f) => s + f.armor, 0) / n;
  let hp = maxHp;
  for (let w = 1; w <= ARENA_MAX_WAVE; w++) {
    const mons = arenaWaveSpawns(w, n, L).map((s) => ({ def: monsterDef(s.defId)!, hp: monsterDef(s.defId)!.hp * s.hpMult, dps: monsterDps(s, armor) }));
    for (let t = 0; mons.some((m) => m.hp > 0); t += 0.25) {
      const alive = mons.filter((m) => m.hp > 0);
      let st = 0, aoe = 0, heal = 0;
      for (const f of fs) { const r = rotation(f, alive.length, alive[0]!.def); st += r.st; aoe += r.aoe; heal += r.heal; }
      alive[0]!.hp -= st * 0.25;
      for (const m of alive.slice(0, 4)) m.hp -= aoe * 0.25;
      hp = Math.min(maxHp, hp + (heal - alive.reduce((s, m) => s + m.dps, 0)) * 0.25);
      if (hp <= 0 || t > 600) return w;
    }
    hp = w % 5 === 0 ? maxHp : Math.min(maxHp, hp + maxHp * 0.3);
  }
  return 0;
}

const VOCS: Vocation[] = ["sorcerer", "druid", "knight", "paladin"];
const GROUP: Vocation[] = ["knight", "paladin", "sorcerer", "druid"];
const fell = (w: number) => (w === 0 ? ARENA_MAX_WAVE + 1 : w);

describe("coliseu: balanço (modelo com o poder real do jogador)", () => {
  it("solo do mago (e de qualquer vocação) não passa da onda ~25, nem no level 120", () => {
    // Modelo: lv 34 (justo da 25) cai na 22–23; lv 60 na 24–26; lv 120 na 27–30.
    for (const v of VOCS) {
      expect(fell(arenaRun([v], 34)), `${v} lv 34`).toBeGreaterThanOrEqual(20);
      expect(fell(arenaRun([v], 34)), `${v} lv 34`).toBeLessThanOrEqual(25);
      expect(fell(arenaRun([v], 60)), `${v} lv 60`).toBeLessThanOrEqual(28);
      expect(fell(arenaRun([v], 120)), `${v} lv 120`).toBeLessThanOrEqual(32);
    }
    expect(fell(arenaRun(["sorcerer"], 120))).toBeLessThanOrEqual(30);
  });

  it("grupo de 4 no level justo da onda X cai perto de X (no justo da 45: entre 40 e 48)", () => {
    // Modelo (justo da 40/45/50/55/60): 37, 44, 48, 54, 58 com poção de mana de 400; com a de 900 (ciclo 9) os
    // magos sustentam a rotação e o grupo passa 1–3 ondas além do justo.
    for (const x of [40, 45, 50, 55, 60]) {
      const w = fell(arenaRun(GROUP, arenaWave(x)!.level));
      expect(w, `justo da ${x}`).toBeGreaterThanOrEqual(x - 5);
      expect(w, `justo da ${x}`).toBeLessThanOrEqual(x + 3);
    }
    expect(fell(arenaRun(GROUP, arenaWave(45)!.level))).toBeGreaterThanOrEqual(40);
  });

  it("completar as 60 pede grupo de level alto: lv 100 não completa, lv 120 completa", () => {
    // Com a poção de mana de 900 o grupo no level justo da 60 (110) já completa no modelo; a barreira fica no lv 100.
    expect(arenaRun(GROUP, 100)).toBeGreaterThan(0);
    expect(arenaRun(GROUP, 120)).toBe(0);
  });

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

  it("ondas 31–60 seguem com o level justo crescente", () => {
    expect(ARENA_MAX_WAVE).toBe(60);
    for (let w = 31; w <= ARENA_MAX_WAVE; w++) expect(arenaWave(w)!.level).toBeGreaterThan(arenaWave(w - 1)!.level);
  });
});

describe("arena: fim do Coliseu", () => {
  it(`vencer as ${ARENA_MAX_WAVE} ondas: resultado "completed", bônus de ouro e XP, recorde e arena liberada`, () => {
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
    expect(res.gold).toBe(waveGold + ARENA_COMPLETE_GOLD);
    expect(k.gold.get("a")).toBe(res.gold);
    expect(a.xp).toBe(res.xp); // começou com 0: tudo veio das ondas + 25% de bônus
    expect(k.best.get("a")).toBe(ARENA_MAX_WAVE);
    expect(k.arena.inMatch("a")).toBe(false);
    expect(k.arena.freeArenas).toBe(1);
    expect(k.arenaMonsters()).toHaveLength(0);
    expect([a.x, a.y]).toEqual([EXIT.x, EXIT.y]);
  });
});

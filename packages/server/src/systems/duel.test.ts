import { describe, expect, it } from "vitest";
import { DUEL_COUNTDOWN_MS, DUEL_INVITE_MS, DUEL_MAX_MS, S2C, duelTimeWinner, duelTop, type DuelMsg } from "@lemonquest/shared";
import type { PlayerState } from "../state.ts";
import type { ArenaDef } from "./arena.ts";
import { DuelSystem } from "./duel.ts";
import { player } from "./testkit.ts";

const ARENA: ArenaDef = { id: 1, rect: { x0: 100, y0: 100, x1: 129, y1: 125 }, entry: { x: 114, y: 112 }, spawns: [] };

function setup(o: { arenas?: number } = {}) {
  let clock = 1_000_000;
  const players = new Map<string, PlayerState>();
  const sent: { to: string; type: string; msg: any }[] = [];
  const kv = new Map<string, string>();
  const party = new Map<string, string[]>();
  let free = o.arenas ?? 1;
  const released: number[] = [];
  const wins: string[] = [];
  const exits: string[] = [];
  const duel = new DuelSystem({
    getPlayer: (id) => players.get(id), players: () => players.values(),
    send: (to, type, msg) => sent.push({ to, type, msg }), broadcast: (type, msg) => sent.push({ to: "*", type, msg }),
    reserve: () => (free > 0 ? (free--, ARENA) : undefined),
    release: (id) => { free++; released.push(id); },
    teleport: (p, x, y) => { p.x = x; p.y = y; },
    isFree: (x, y, self) => ![...players.values()].some((p) => p.id !== self && p.x === x && p.y === y),
    partyMates: (id) => party.get(id) ?? [],
    onExit: (p) => exits.push(p.name),
    onWin: (p) => wins.push(p.name),
    getKv: (k) => kv.get(k), setKv: (k, v) => { kv.set(k, v); },
    now: () => clock,
  });
  const add = (id: string, x: number, y: number, extra: Partial<PlayerState> = {}) => {
    const p = player(id, x, y, { hp: 500, maxHp: 500, mana: 100, maxMana: 100, ...extra });
    players.set(p.id, p);
    return p;
  };
  const advance = (ms: number) => { clock += ms; duel.tick(clock); };
  const last = (to: string) => sent.filter((s) => s.to === to && s.type === S2C.Duel).at(-1)?.msg as DuelMsg | undefined;
  const feeds = () => sent.filter((s) => s.type === S2C.Feed).map((s) => s.msg.text as string);
  return { duel, players, add, advance, last, feeds, kv, party, released, wins, exits, sent, now: () => clock };
}

describe("dados do duelo", () => {
  it("tempo esgotado: vence quem tem mais vida somada (em %); empate = null", () => {
    expect(duelTimeWinner([0.8], [0.5])).toBe(0);
    expect(duelTimeWinner([0.2, 0.3], [0.6])).toBe(1);
    expect(duelTimeWinner([0.5], [0.5])).toBeNull();
  });

  it("ranking: mais vitórias primeiro, empate por nome, só quem venceu", () => {
    expect(duelTop({ Bia: 3, Ana: 3, Caio: 5, Zé: 0 })).toEqual([{ name: "Caio", wins: 5 }, { name: "Ana", wins: 3 }, { name: "Bia", wins: 3 }]);
  });
});

describe("DuelSystem", () => {
  it("1×1: convite, sala, contagem sem ataque, luta, quem cai sai de vida cheia e o outro vence (sem caveira, com ranking)", () => {
    const { duel, add, advance, last, feeds, released, wins, exits, kv } = setup();
    const a = add("a", 10, 10), b = add("b", 12, 10);
    duel.onAction(a, { action: "challenge", targetId: b.id, mode: "1x1" });
    expect(last(b.id)!.invites).toMatchObject([{ fromId: a.id, mode: "1x1" }]);
    b.hp = 100;
    duel.onAction(b, { action: "accept", fromId: a.id });
    expect(duel.inDuel(a.id) && duel.inDuel(b.id)).toBe(true);
    // Os dois na sala, de vida cheia; na contagem ninguém ataca.
    for (const p of [a, b]) expect(p.x >= 100 && p.x <= 129 && p.y >= 100 && p.y <= 125).toBe(true);
    expect(b.hp).toBe(500);
    expect(duel.canAttack(a, b)).toBe("Aguarde a contagem do duelo.");
    advance(DUEL_COUNTDOWN_MS);
    expect(duel.canAttack(a, b)).toBeNull();
    expect(duel.isDuelHit(a, b)).toBe(true);
    // Terceiro de fora não entra na briga, e quem duela não ataca o terceiro.
    const c = add("c", 11, 11);
    expect(duel.canAttack(c, a)).toBe("a está num duelo.");
    expect(duel.canAttack(a, c)).toBe("Você está num duelo: só vale atacar o outro lado.");
    expect(duel.canAttack(c, c)).toBeUndefined();
    // b "morre": a morte não acontece, b volta para onde estava de vida cheia e o duelo acaba.
    b.hp = 0;
    expect(duel.interceptDeath(b)).toBe(true);
    expect([b.x, b.y, b.hp]).toEqual([12, 10, 500]);
    expect([a.x, a.y]).toEqual([10, 10]);
    expect(duel.inDuel(a.id)).toBe(false);
    expect(released).toEqual([1]);
    expect(wins).toEqual(["a"]);
    expect(exits.sort()).toEqual(["a", "b"]);
    expect(last(a.id)!.result).toMatchObject({ won: true, reason: "wiped", opponents: "b" });
    expect(last(b.id)!.result).toMatchObject({ won: false });
    expect(feeds().at(-1)).toBe("⚔ Duelo 1×1: a venceu b.");
    expect(JSON.parse([...kv.values()][0]!)).toEqual({ a: 1 });
  });

  it("2×2 com os grupos de 2; o lado só perde quando os dois caem", () => {
    const { duel, add, advance, party, wins } = setup();
    const a = add("a", 10, 10), a2 = add("a2", 10, 11), b = add("b", 12, 10), b2 = add("b2", 12, 11);
    party.set(a.id, [a2.id]); party.set(a2.id, [a.id]); party.set(b.id, [b2.id]); party.set(b2.id, [b.id]);
    duel.onAction(a, { action: "challenge", targetId: b.id, mode: "2x2" });
    duel.onAction(b, { action: "accept", fromId: a.id });
    advance(DUEL_COUNTDOWN_MS);
    expect(duel.canAttack(a, a2)).toBe("É do seu lado no duelo.");
    expect(duel.canAttack(a2, b2)).toBeNull();
    duel.interceptDeath(b);
    expect(duel.inDuel(a.id)).toBe(true);
    expect(duel.canAttack(a, b)).toBe("Fora do duelo.");
    duel.interceptDeath(b2);
    expect(duel.inDuel(a.id)).toBe(false);
    expect(wins.sort()).toEqual(["a", "a2"]);
  });

  it("2×2 sem grupo de 2 não sai; todas as salas ocupadas avisa; convite expira", () => {
    const { duel, add, advance, last, players } = setup({ arenas: 0 });
    const a = add("a", 10, 10), b = add("b", 12, 10);
    duel.onAction(a, { action: "challenge", targetId: b.id, mode: "2x2" });
    expect(last(b.id)).toBeUndefined();
    duel.onAction(a, { action: "challenge", targetId: b.id, mode: "1x1" });
    duel.onAction(b, { action: "accept", fromId: a.id });
    expect(duel.inDuel(a.id)).toBe(false);
    duel.onAction(a, { action: "challenge", targetId: b.id, mode: "1x1" });
    advance(DUEL_INVITE_MS + 1);
    expect(last(b.id)!.invites).toEqual([]);
    expect(players.size).toBe(2);
  });

  it("tempo esgotado: vence quem tem mais vida; desistir (logout) entrega a vitória", () => {
    const t = setup();
    const a = t.add("a", 10, 10), b = t.add("b", 12, 10);
    t.duel.onAction(a, { action: "challenge", targetId: b.id, mode: "1x1" });
    t.duel.onAction(b, { action: "accept", fromId: a.id });
    t.advance(DUEL_COUNTDOWN_MS);
    a.hp = 100;
    t.advance(DUEL_MAX_MS);
    expect(t.wins).toEqual(["b"]);
    expect(t.last(a.id)!.result).toMatchObject({ won: false, reason: "time" });

    const u = setup();
    const c = u.add("c", 10, 10), d = u.add("d", 12, 10);
    u.duel.onAction(c, { action: "challenge", targetId: d.id, mode: "1x1" });
    u.duel.onAction(d, { action: "accept", fromId: c.id });
    u.duel.removePlayer(c.id);
    expect(u.wins).toEqual(["d"]);
    expect(u.last(d.id)!.result).toMatchObject({ won: true, reason: "forfeit" });
    expect(u.released).toEqual([1]);
  });

  it("ranking da semana pelo /duelos: vazio e depois com o vencedor", () => {
    const { duel, add, sent } = setup();
    const a = add("a", 10, 10), b = add("b", 12, 10);
    const notes = () => sent.filter((x) => x.to === a.id && x.type === S2C.Notice).map((x) => x.msg.text as string);
    duel.onAction(a, { action: "ranking" });
    expect(notes().at(-1)).toMatch(/ninguém venceu ainda/);
    duel.onAction(a, { action: "challenge", targetId: b.id, mode: "1x1" });
    duel.onAction(b, { action: "accept", fromId: a.id });
    duel.interceptDeath(b);
    duel.onAction(a, { action: "ranking" });
    expect(notes().at(-1)).toBe("Duelos da semana: 1º a (1)");
  });
});

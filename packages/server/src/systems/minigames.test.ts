import { describe, expect, it } from "vitest";
import {
  GENIUS_PADS, MINIGAME_COUNTDOWN_MS, MINIGAME_DAILY_FICHAS, MINIGAME_END_MS, MINIGAME_LIVES, MINIGAME_ROOM_SIZE, PEGA_MS, S2C,
  findObjects, npcDef, type MinigameFxMsg, type MinigameLobbyMsg, type MinigameStateMsg, type TiledMap,
} from "@lemonquest/shared";
import type { PlayerState } from "../state.ts";
import { MinigameSystem, kvFichasDay, parseMinigames, type MinigameLayout } from "./minigames.ts";

const N = MINIGAME_ROOM_SIZE;
const LAYOUT: MinigameLayout = { rooms: [{ id: 1, x0: 100, y0: 100 }, { id: 2, x0: 120, y0: 100 }], exit: { x: 90, y: 90 } };
const SALAO = { x0: 85, y0: 85, x1: 135, y1: 115 };

function setup(seed = 1) {
  let s = seed >>> 0;
  const rng = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  let now = 1_000_000;
  const players = new Map<string, PlayerState>();
  const sent: { id: string; type: string; msg: any }[] = [];
  const feed: string[] = [];
  const kv = new Map<string, string>();
  const fichas = new Map<string, number>();
  const played: [string, string, number, boolean][] = [];
  const mg = new MinigameSystem({
    layout: LAYOUT,
    getPlayer: (id) => players.get(id),
    players: () => players.values(),
    send: (id, type, msg) => sent.push({ id, type, msg }),
    broadcast: (type, msg: any) => { if (type === S2C.Feed) feed.push(msg.text); },
    teleport: (p, x, y) => { p.x = x; p.y = y; },
    isFree: (x, y, self) => ![...players.values()].some((p) => p.id !== self && p.x === x && p.y === y),
    inSalao: (x, y) => x >= SALAO.x0 && x <= SALAO.x1 && y >= SALAO.y0 && y <= SALAO.y1,
    giveFichas: (p, n) => fichas.set(p.name, (fichas.get(p.name) ?? 0) + n),
    buyTone: () => null,
    onPlayed: (p, g, sc, won) => played.push([p.name, g, sc, won]),
    getKv: (k) => kv.get(k), setKv: (k, v) => { kv.set(k, v); },
    now: () => now, rng,
  });
  const add = (name: string) => {
    const p = { id: name, name, x: 90, y: 91 + players.size } as PlayerState;
    players.set(name, p);
    return p;
  };
  const run = (ms: number, step = 50, each?: () => void) => { for (let t = 0; t < ms; t += step) { now += step; each?.(); mg.tick(now); } };
  const state = (id: string): MinigameStateMsg | null | undefined => sent.filter((x) => x.id === id && x.type === S2C.Minigame).at(-1)?.msg;
  const fxs = (id: string) => sent.filter((x) => x.id === id && x.type === S2C.MinigameFx).map((x) => x.msg as MinigameFxMsg);
  const local = (p: PlayerState, room = LAYOUT.rooms[0]!) => (p.y - room.y0) * N + (p.x - room.x0);
  const to = (p: PlayerState, i: number, room = LAYOUT.rooms[0]!) => { p.x = room.x0 + (i % N); p.y = room.y0 + Math.floor(i / N); };
  return { mg, players, sent, feed, kv, fichas, played, add, run, state, fxs, local, to, get now() { return now; } };
}

describe("Salão de Minijogos: mapa", () => {
  it("o mapa tem as duas salas 11×11 andáveis, a volta no saguão e o Mestre do Salão, tudo dentro da zona PZ do Salão", async () => {
    const { readFileSync } = await import("node:fs");
    const map = JSON.parse(readFileSync(new URL("../../../../assets/maps/world.json", import.meta.url), "utf8")) as TiledMap;
    const layout = parseMinigames(map);
    expect(layout.rooms.map((r) => r.id)).toEqual([1, 2]);
    const zo = findObjects(map, "zone").find((z) => z.name === "Salão de Minijogos")!;
    expect(zo.properties?.find((p) => p.name === "pz")?.value).toBe(true);
    const zone = { x0: zo.x / 16, y0: zo.y / 16, x1: (zo.x + zo.width) / 16 - 1, y1: (zo.y + zo.height) / 16 - 1 };
    const inZone = (x: number, y: number) => x >= zone.x0 && x <= zone.x1 && y >= zone.y0 && y <= zone.y1;
    const col = map.layers.find((l) => l.name === "collision")!.data!;
    for (const r of layout.rooms) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      expect(col[(r.y0 + j) * map.width + r.x0 + i]).toBe(0);
      expect(inZone(r.x0 + i, r.y0 + j)).toBe(true);
    }
    expect(inZone(layout.exit!.x, layout.exit!.y)).toBe(true);
    const npc = map.layers.flatMap((l) => l.objects ?? []).find((o) => o.properties?.some((p) => p.name === "npcId" && p.value === "salao_mestre"));
    expect(npc && npcDef("salao_mestre")).toBeTruthy();
    expect(inZone(Math.floor(npc!.x / 16), Math.floor(npc!.y / 16))).toBe(true);
  });
});

describe("Salão de Minijogos: salas", () => {
  it("abrir sala pede jogo; quem abre é o anfitrião; só ele começa; fora do Salão não entra", () => {
    const k = setup();
    const a = k.add("a"), b = k.add("b"), c = k.add("c");
    c.x = 10;
    k.mg.onAction(a, { action: "join", room: 1 });
    expect(k.mg.roomOf("a")).toBeUndefined();
    k.mg.onAction(a, { action: "join", room: 1, game: "chuva" });
    k.mg.onAction(b, { action: "join", room: 1 });
    k.mg.onAction(c, { action: "join", room: 1 });
    expect(k.mg.roomOf("c")).toBeUndefined();
    k.mg.onAction(b, { action: "start" });
    expect(k.mg.roomOf("a")!.phase).toBe("lobby");
    k.run(400);
    const lobby = k.sent.filter((x) => x.id === "a" && x.type === S2C.MinigameLobby).at(-1)!.msg as MinigameLobbyMsg;
    expect(lobby.rooms[0]).toMatchObject({ game: "chuva", phase: "lobby", players: ["a", "b"], host: "a" });
    k.mg.onAction(a, { action: "start" });
    expect(k.mg.roomOf("a")!.phase).toBe("countdown");
    // Os dois foram para a sala, em tiles diferentes.
    for (const p of [a, b]) expect(k.local(p)).toBeGreaterThanOrEqual(0);
    expect(k.local(a)).not.toBe(k.local(b));
    expect(k.mg.inGame("a")).toBe(true);
    k.run(MINIGAME_COUNTDOWN_MS + 100);
    expect(k.mg.roomOf("a")!.phase).toBe("playing");
    // Sala em jogo não aceita mais ninguém.
    const d = k.add("d");
    k.mg.onAction(d, { action: "join", room: 1 });
    expect(k.mg.roomOf("d")).toBeUndefined();
  });

  it("anfitrião sai do lobby: passa para o próximo; sala vazia volta a ficar livre", () => {
    const k = setup();
    const a = k.add("a"), b = k.add("b");
    k.mg.onAction(a, { action: "join", room: 2, game: "pega" });
    k.mg.onAction(b, { action: "join", room: 2 });
    k.mg.onAction(a, { action: "leave" });
    expect(k.mg.roomOf("b")!.host).toBe("b");
    k.mg.removePlayer("b");
    k.run(400);
    const lobby = k.sent.filter((x) => x.type === S2C.MinigameLobby).at(-1)!.msg as MinigameLobbyMsg;
    expect(lobby.rooms[1]).toMatchObject({ phase: "idle", game: null, players: [] });
  });

  it("anfitrião sai do Salão a pé: perde a vaga em até 1 s e a sala não fica presa", () => {
    const k = setup();
    const a = k.add("a"), b = k.add("b");
    k.mg.onAction(a, { action: "join", room: 1, game: "genius" });
    k.mg.onAction(b, { action: "join", room: 1 });
    a.x = 10; a.y = 10; // foi caçar
    k.run(1100);
    expect(k.mg.roomOf("a")).toBeUndefined();
    expect(k.mg.roomOf("b")!.host).toBe("b");
    b.x = 10; b.y = 12;
    k.run(1100);
    expect(k.mg.roomOf("b")).toBeUndefined();
    const last = k.sent.filter((x) => x.type === S2C.MinigameLobby).at(-1)!.msg as MinigameLobbyMsg;
    expect(last.rooms[0]).toMatchObject({ phase: "idle", players: [] });
  });
});

describe("Chuva de Limões", () => {
  it("parado no meio, leva golpe, perde as 3 vidas e volta ao saguão; fichas e recorde", () => {
    const k = setup(3);
    const a = k.add("a");
    k.mg.onAction(a, { action: "join", room: 1, game: "chuva" });
    k.mg.onAction(a, { action: "start" });
    k.run(MINIGAME_COUNTDOWN_MS + 60_000);
    expect(k.state("a")).toBeNull(); // partida acabou e a sala fechou
    expect([a.x, a.y]).toEqual([90, 90]);
    expect(k.played[0]![0]).toBe("a");
    expect(k.played[0]![1]).toBe("chuva");
  });

  it("quem sai dos tiles marcados sobrevive onda após onda (o golpe só cai em cima do aviso)", () => {
    const k = setup(5);
    const a = k.add("a");
    k.mg.onAction(a, { action: "join", room: 1, game: "chuva" });
    k.mg.onAction(a, { action: "start" });
    let seen = 0;
    k.run(MINIGAME_COUNTDOWN_MS + 45_000, 50, () => {
      const warns = k.fxs("a").filter((f) => f.kind === "warn");
      if (warns.length === seen) return;
      seen = warns.length;
      const tiles = warns.at(-1)!.tiles;
      const hit = new Set<number>();
      for (let i = 0; i + 1 < tiles.length; i += 2) hit.add((tiles[i + 1]! - 100) * N + (tiles[i]! - 100));
      for (let i = 0; i < N * N; i++) if (!hit.has(i)) { k.to(a, i); break; }
    });
    const st = k.state("a")!;
    expect(st.players[0]!.lives).toBe(MINIGAME_LIVES);
    expect(st.round).toBeGreaterThan(20);
    expect(st.players[0]!.score).toBeGreaterThan(20);
  });

  it("2 jogadores: quando sobra um, ele vence (feed); vitória relâmpago (outro desistiu na hora) não rende ficha", () => {
    const k = setup(9);
    const a = k.add("a"), b = k.add("b");
    k.mg.onAction(a, { action: "join", room: 1, game: "chuva" });
    k.mg.onAction(b, { action: "join", room: 1 });
    k.mg.onAction(a, { action: "start" });
    k.run(MINIGAME_COUNTDOWN_MS + 200);
    k.mg.onAction(b, { action: "leave" }); // desistiu: a sobra sozinho
    k.run(200);
    expect(k.state("a")!.phase).toBe("ended");
    expect(k.state("a")!.winners).toEqual(["a"]);
    expect(k.feed.at(-1)).toMatch(/a venceu Chuva de Limões/);
    expect(k.fichas.get("a")).toBeUndefined();
    k.run(MINIGAME_END_MS + 200);
    expect([a.x, a.y]).toEqual([90, 90]);
  });
});

describe("Chão que Cai", () => {
  it("pisar num buraco tira uma vida e devolve o jogador para um tile de pé", () => {
    const k = setup(2);
    const a = k.add("a");
    k.mg.onAction(a, { action: "join", room: 1, game: "chao" });
    k.mg.onAction(a, { action: "start" });
    k.run(MINIGAME_COUNTDOWN_MS + 3000);
    const holes = k.state("a")!.holes!;
    expect(holes.length).toBeGreaterThan(0);
    k.to(a, holes[0]!);
    k.run(1500);
    const st = k.state("a")!;
    expect(st.players[0]!.lives).toBeLessThan(MINIGAME_LIVES);
    expect(st.holes!.includes(k.local(a))).toBe(false);
  });
});

describe("Pega-Limão", () => {
  it("pisar no limão soma ponto; acaba em 60 s; com 2 jogadores vence quem pegou mais", () => {
    const k = setup(4);
    const a = k.add("a"), b = k.add("b");
    k.mg.onAction(a, { action: "join", room: 2, game: "pega" });
    k.mg.onAction(b, { action: "join", room: 2 });
    k.mg.onAction(a, { action: "start" });
    const room = LAYOUT.rooms[1]!;
    k.run(MINIGAME_COUNTDOWN_MS + 2000);
    const lemons = k.state("a")!.lemons!;
    expect(lemons.length).toBeGreaterThan(0);
    k.to(a, lemons[0]![0], room);
    k.run(100);
    expect(k.state("a")!.players.find((x) => x.id === "a")!.score).toBeGreaterThan(0);
    // a corre atrás dos limões; b fica parado.
    k.run(PEGA_MS, 50, () => { const l = k.state("a")?.lemons; if (l?.length) k.to(a, l[0]![0], room); });
    expect(k.state("a")!.phase).toBe("ended");
    expect(k.state("a")!.winners).toEqual(["a"]);
  });
});

describe("Genius do Escritório", () => {
  it("repetir a sequência passa de rodada; pisar na placa errada tira uma vida do time e repete", () => {
    const k = setup(6);
    const a = k.add("a");
    k.mg.onAction(a, { action: "join", room: 1, game: "genius" });
    k.mg.onAction(a, { action: "start" });
    k.run(MINIGAME_COUNTDOWN_MS + 200);
    const center = 5 * N + 5;
    const padOf = (f: MinigameFxMsg) => GENIUS_PADS.findIndex((p) => p.color === f.color);
    const waitShow = () => { for (let i = 0; i < 400 && k.state("a")!.genius!.showing !== false; i++) k.run(50); k.run(100); };
    const step = (pad: number) => { k.to(a, center); k.run(100); const p = GENIUS_PADS[pad]!; k.to(a, p.y0 * N + p.x0); k.run(100); };
    // Rodada 1: lê a vitrine (placas acesas) e repete.
    waitShow();
    const seq = k.fxs("a").filter((f) => f.kind === "pad").map(padOf);
    expect(seq).toHaveLength(3);
    for (const p of seq) step(p);
    k.to(a, center);
    k.run(200);
    expect(k.state("a")!.round).toBe(2);
    expect(k.state("a")!.players[0]!.score).toBe(1);
    // Rodada 2: erra de propósito.
    waitShow();
    const shown = k.fxs("a").filter((f) => f.kind === "pad").map(padOf).slice(-4);
    step((shown[0]! + 1) % 4);
    expect(k.state("a")!.teamLives).toBe(MINIGAME_LIVES - 1);
  });
});

describe("fichas e saída", () => {
  it("teto diário de fichas; quem cai/reconecta dentro de uma sala volta ao saguão", () => {
    const k = setup(7);
    const a = k.add("a");
    k.kv.set(kvFichasDay(new Date(k.now).toISOString().slice(0, 10).replace(/T.*/, ""), "a"), "0");
    expect(k.mg.fichasToday("a", k.now)).toBe(0);
    expect(k.mg.loginPosition(LAYOUT.rooms[0]!.x0 + 3, LAYOUT.rooms[0]!.y0 + 3)).toEqual({ x: 90, y: 90 });
    expect(k.mg.loginPosition(10, 10)).toBeNull();
    // Teto: já ganhou quase tudo hoje.
    const d = new Date(k.now);
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    k.kv.set(kvFichasDay(day, "a"), String(MINIGAME_DAILY_FICHAS - 1));
    k.mg.onAction(a, { action: "join", room: 1, game: "chuva" });
    k.mg.onAction(a, { action: "start" });
    k.run(MINIGAME_COUNTDOWN_MS + 60_000);
    expect(k.fichas.get("a") ?? 0).toBeLessThanOrEqual(1);
    expect(k.mg.fichasToday("a", k.now)).toBeLessThanOrEqual(MINIGAME_DAILY_FICHAS);
  });
});

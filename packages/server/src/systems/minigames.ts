// Salão de Minijogos (JJ-5, 2026-11-06; regras e números em shared/data/minigames.ts). O Mestre do Salão abre a janela
// (salas, recordes da semana, loja de fichas). Numa sala livre, alguém escolhe o jogo e vira o anfitrião; os outros
// entram; o anfitrião começa. Contagem, todo mundo vai para a sala 11×11 e o jogo roda aqui no tick: o servidor marca
// os tiles (S2C.MinigameFx "warn") e, passado o aviso, atinge quem ainda está em cima. Ninguém perde vida, XP ou item:
// só as vidas do minijogo. Sem vidas, a pessoa volta ao saguão e continua vendo o placar. No fim, Fichas do Salão (com
// teto diário no kv) e o recorde da semana (kv `minigame.week.<semana>.<jogo>`). Estado da partida só em memória:
// reiniciar o servidor no meio devolve todo mundo ao saguão (loginPosition).
import {
  CHUVA_MAX_WAVE, GENIUS_MAX_ROUND, GENIUS_PADS, GENIUS_STEP_MS, MINIGAMES, MINIGAME_COUNTDOWN_MS, MINIGAME_END_MS,
  MINIGAME_HIT_GRACE_MS, MINIGAME_IDS, MINIGAME_LIVES, MINIGAME_MAX_PLAYERS, MINIGAME_ROOM_SIZE, MINIGAME_SHOP_TONES,
  PEGA_GOLD_CHANCE, PEGA_GOLD_VALUE, PEGA_HAZARD_MS, PEGA_HIT_LOSS, PEGA_MS, PEGA_SPAWN_MS, S2C,
  chaoPick, chaoTiming, chuvaPattern, chuvaTiming, fichasCapped, findObjects, geniusLength, geniusPadAt, geniusShowTiming,
  minigameFichas, minigameRecordsInsert, objectTile, pegaHazard, pegaTarget, weekId,
  type FeedMsg, type MinigameActionMsg, type MinigameFxMsg, type MinigameId, type MinigameLobbyMsg, type MinigamePhase,
  type MinigameRecord, type MinigameStateMsg, type NoticeMsg, type TiledMap,
} from "@lemonquest/shared";
import type { PlayerState } from "../state.ts";
import type { Point } from "./pathfinding.ts";

const N = MINIGAME_ROOM_SIZE;

export interface MinigameRoomDef { id: number; x0: number; y0: number }
export interface MinigameLayout { rooms: MinigameRoomDef[]; exit: Point | null }

const prop = (o: { properties?: { name: string; value: unknown }[] }, name: string) =>
  o.properties?.find((p) => p.name === name)?.value;

/** Salas do mapa (objetos "minigame_room", retângulo N×N, prop roomId) e a volta ao saguão ("minigame_exit"). */
export function parseMinigames(map: TiledMap): MinigameLayout {
  const t = map.tilewidth;
  const rooms: MinigameRoomDef[] = [];
  for (const o of findObjects(map, "minigame_room")) {
    const id = Math.floor(Number(prop(o, "roomId") ?? 0));
    if (!(id > 0) || rooms.some((r) => r.id === id)) continue;
    if (Math.round(o.width / t) !== N || Math.round(o.height / t) !== N) continue;
    rooms.push({ id, x0: Math.floor(o.x / t), y0: Math.floor(o.y / t) });
  }
  rooms.sort((a, b) => a.id - b.id);
  const ex = findObjects(map, "minigame_exit")[0];
  return { rooms, exit: ex ? objectTile(ex, t) : null };
}

export interface MinigameHost {
  layout: MinigameLayout;
  getPlayer: (id: string) => PlayerState | undefined;
  players: () => Iterable<PlayerState>;
  send: (id: string, type: string, msg: unknown) => void;
  broadcast: (type: string, msg: unknown) => void;
  teleport: (p: PlayerState, x: number, y: number) => void;
  /** Tile livre para pôr alguém (andável, sem criatura). */
  isFree: (x: number, y: number, selfId: string) => boolean;
  /** Dentro do Salão (saguão ou salas): só quem está lá entra numa sala. */
  inSalao: (x: number, y: number) => boolean;
  /** Fichas na mochila (cheia: no chão aos pés). */
  giveFichas: (p: PlayerState, n: number) => void;
  /** Troca de fichas por tom exclusivo; texto do erro ou null (comprou). */
  buyTone: (p: PlayerState, toneId: string) => string | null;
  /** Entrou na sala: fecha NPC, desliga o Estagiário, tira buffs (haste) e invocações. */
  onEnter?: (p: PlayerState) => void;
  /** Terminou uma partida (conquistas). */
  onPlayed?: (p: PlayerState, game: MinigameId, score: number, won: boolean) => void;
  getKv?: (key: string) => string | undefined;
  setKv?: (key: string, value: string) => void;
  now?: () => number;
  rng?: () => number;
}

interface Player {
  id: string;
  name: string;
  lives: number;
  score: number;
  out: boolean;
  graceUntil: number;
  /** Genius: placa em que estava no tick anterior (-1 = fora). */
  lastPad: number;
  /** Fichas ganhas nesta partida (mostradas no resultado). */
  fichas?: number;
}

interface Room {
  def: MinigameRoomDef;
  game: MinigameId | null;
  phase: MinigamePhase;
  host?: string;
  players: Player[];
  until: number;
  startedAt: number;
  startCount: number;
  round: number;
  nextAt: number;
  pending?: { at: number; tiles: number[] };
  holes: Uint8Array;
  lemons: Map<number, number>;
  nextLemonAt: number;
  nextHazardAt: number;
  seq: number[];
  /** Genius: passos acertados e a vitrine (instantes em que cada placa acende). */
  step: number;
  showing: boolean;
  showAt: number[];
  stepDeadline: number;
  teamLives: number;
  winners?: string[];
  dirty: boolean;
  sentAt: number;
}

/** Estado da partida para o cliente no máximo a cada isto (mudanças de fase saem na hora). */
const STATE_MIN_MS = 150;
const LOBBY_MIN_MS = 300;

export const kvMinigameWeek = (week: string, game: MinigameId) => `minigame.week.${week}.${game}`;
export const kvFichasDay = (day: string, name: string) => `minigame.fichas.${day}.${name.toLowerCase()}`;
const dayOf = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

export class MinigameSystem {
  private readonly rooms: Room[];
  private readonly byPlayer = new Map<string, Room>();
  private readonly now: () => number;
  private readonly rng: () => number;
  private lobbyDirty = false;
  private lobbySentAt = 0;

  constructor(private readonly o: MinigameHost) {
    this.now = o.now ?? Date.now;
    this.rng = o.rng ?? Math.random;
    this.rooms = o.layout.rooms.map((def) => this.blank(def));
  }

  private blank(def: MinigameRoomDef): Room {
    return {
      def, game: null, phase: "idle", players: [], until: 0, startedAt: 0, startCount: 0, round: 0, nextAt: 0,
      holes: new Uint8Array(N * N), lemons: new Map(), nextLemonAt: 0, nextHazardAt: 0, seq: [], step: 0, showing: false,
      showAt: [], stepDeadline: 0, teamLives: MINIGAME_LIVES, dirty: false, sentAt: 0,
    };
  }

  get open(): boolean { return this.rooms.length > 0 && !!this.o.layout.exit; }
  roomOf(id: string): Readonly<Room> | undefined { return this.byPlayer.get(id); }
  /** Jogando dentro de uma sala (contagem ou partida): sem magias, sem troca. */
  inGame(id: string): boolean {
    const r = this.byPlayer.get(id);
    return !!r && (r.phase === "countdown" || r.phase === "playing" || r.phase === "ended") && !r.players.find((x) => x.id === id)?.out;
  }

  private inRoomRect(r: MinigameRoomDef, x: number, y: number): boolean {
    return x >= r.x0 && y >= r.y0 && x < r.x0 + N && y < r.y0 + N;
  }
  /** Quem entra no jogo de dentro de uma sala (queda/reinício) volta ao saguão. */
  loginPosition(x: number | null | undefined, y: number | null | undefined): Point | null {
    if (x == null || y == null || !this.o.layout.exit) return null;
    return this.rooms.some((r) => this.inRoomRect(r.def, x, y)) ? { ...this.o.layout.exit } : null;
  }

  private notice(id: string, text: string, kind: NoticeMsg["kind"] = "info"): void {
    this.o.send(id, S2C.Notice, { text, kind } satisfies NoticeMsg);
  }

  // --- janela do Mestre ----------------------------------------------------------------------------------------------

  lobbyMsg(forId: string, now = this.now()): MinigameLobbyMsg {
    const week = weekId(new Date(now));
    const records: MinigameLobbyMsg["records"] = {};
    for (const g of MINIGAME_IDS) { const l = this.recordsOf(week, g); if (l.length) records[g] = l; }
    const p = this.o.getPlayer(forId);
    const mine = this.byPlayer.get(forId)?.def.id;
    return {
      rooms: this.rooms.map((r) => ({
        id: r.def.id, game: r.game, phase: r.phase, players: r.players.map((x) => x.name),
        ...(r.host ? { host: this.o.getPlayer(r.host)?.name ?? r.players.find((x) => x.id === r.host)?.name } : {}),
      })),
      ...(mine != null ? { mine } : {}),
      records,
      fichasToday: p ? this.fichasToday(p.name, now) : 0,
    };
  }

  openLobby(p: PlayerState): void { this.o.send(p.id, S2C.MinigameLobby, this.lobbyMsg(p.id)); }

  private sendLobbies(now: number): void {
    this.lobbyDirty = false;
    this.lobbySentAt = now;
    for (const p of this.o.players()) if (this.o.inSalao(p.x, p.y) || this.byPlayer.has(p.id)) this.o.send(p.id, S2C.MinigameLobby, this.lobbyMsg(p.id, now));
  }

  onAction(p: PlayerState, m: MinigameActionMsg): void {
    if (!m || typeof m !== "object") return;
    switch (m.action) {
      case "join": return typeof m.room === "number" ? this.join(p, m.room, MINIGAME_IDS.includes(m.game as MinigameId) ? m.game : undefined) : undefined;
      case "leave": return this.leave(p.id, true);
      case "start": return this.start(p);
      case "buyTone": {
        if (typeof m.toneId !== "string" || !MINIGAME_SHOP_TONES.includes(m.toneId)) return;
        const err = this.o.buyTone(p, m.toneId);
        if (err) this.notice(p.id, err, "warn");
        this.openLobby(p);
        return;
      }
    }
  }

  private join(p: PlayerState, roomId: number, game: MinigameId | undefined): void {
    if (!this.open) return this.notice(p.id, "O Salão está fechado.", "warn");
    const r = this.rooms.find((x) => x.def.id === roomId);
    if (!r) return;
    if (this.byPlayer.has(p.id)) return this.notice(p.id, "Você já está numa sala. Saia dela antes.", "warn");
    if (!this.o.inSalao(p.x, p.y)) return this.notice(p.id, "Fale com o Mestre do Salão.", "warn");
    if (r.phase === "idle") {
      if (!game) return this.notice(p.id, "Escolha um jogo para abrir a sala.", "warn");
      r.game = game;
      r.phase = "lobby";
      r.host = p.id;
    } else if (r.phase !== "lobby") return this.notice(p.id, "Essa sala está em jogo. Espere acabar ou use a outra.", "warn");
    if (r.players.length >= MINIGAME_MAX_PLAYERS) return this.notice(p.id, "Sala cheia.", "warn");
    r.players.push({ id: p.id, name: p.name, lives: MINIGAME_LIVES, score: 0, out: false, graceUntil: 0, lastPad: -1 });
    this.byPlayer.set(p.id, r);
    this.lobbyDirty = true;
  }

  /** Sai da sala (botão, logout). Na partida, conta como eliminado. */
  private leave(id: string, teleport: boolean): void {
    const r = this.byPlayer.get(id);
    if (!r) return;
    const me = r.players.find((x) => x.id === id);
    if (r.phase === "lobby" || r.phase === "idle") {
      r.players = r.players.filter((x) => x.id !== id);
      this.byPlayer.delete(id);
      if (r.host === id) r.host = r.players[0]?.id;
      if (!r.players.length) this.reset(r);
    } else {
      if (me && !me.out && r.phase !== "ended") this.eliminate(r, me, teleport);
      else if (teleport) { const p = this.o.getPlayer(id), exit = this.o.layout.exit; if (p && exit && this.inRoomRect(r.def, p.x, p.y)) this.o.teleport(p, exit.x, exit.y); }
      // Saiu de vez: some da lista (não recebe mais o placar); a partida segue com quem ficou.
      r.players = r.players.filter((x) => x.id !== id);
      this.byPlayer.delete(id);
      this.o.send(id, S2C.Minigame, null);
    }
    this.lobbyDirty = true;
  }

  removePlayer(id: string): void { this.leave(id, false); }

  private start(p: PlayerState): void {
    const r = this.byPlayer.get(p.id);
    if (!r || r.phase !== "lobby" || !r.game) return;
    if (r.host !== p.id) return this.notice(p.id, "Só quem abriu a sala começa o jogo.", "warn");
    // Quem saiu do Salão perde a vaga.
    for (const x of [...r.players]) {
      const pl = this.o.getPlayer(x.id);
      if (!pl || !this.o.inSalao(pl.x, pl.y)) { r.players = r.players.filter((y) => y !== x); this.byPlayer.delete(x.id); if (pl) this.notice(pl.id, "Você saiu do Salão e perdeu a vaga na sala.", "warn"); }
    }
    if (!r.players.length) { this.reset(r); this.lobbyDirty = true; return; }
    const now = this.now();
    r.phase = "countdown";
    r.until = now + MINIGAME_COUNTDOWN_MS;
    r.startCount = r.players.length;
    // Todos para a sala, em volta do centro (o Genius começa no centro, longe das placas).
    const spots = this.spreadSpots(r.players.length);
    r.players.forEach((x, i) => {
      const pl = this.o.getPlayer(x.id);
      if (!pl) return;
      this.o.onEnter?.(pl);
      const [lx, ly] = spots[i]!;
      const at = this.freeNear(r, r.def.x0 + lx, r.def.y0 + ly, pl.id);
      this.o.teleport(pl, at.x, at.y);
    });
    this.markDirty(r);
    this.lobbyDirty = true;
  }

  private spreadSpots(n: number): [number, number][] {
    const c = (N - 1) / 2;
    const ring: [number, number][] = [[c, c], [c - 1, c], [c + 1, c], [c, c - 1], [c, c + 1], [c - 1, c - 1], [c + 1, c + 1], [c - 1, c + 1], [c + 1, c - 1]];
    return ring.slice(0, Math.max(1, n));
  }

  private freeNear(r: Room, x: number, y: number, self: string): Point {
    for (let d = 0; d < N; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
      const tx = x + dx, ty = y + dy;
      if (this.inRoomRect(r.def, tx, ty) && !r.holes[(ty - r.def.y0) * N + (tx - r.def.x0)] && this.o.isFree(tx, ty, self)) return { x: tx, y: ty };
    }
    return { x, y };
  }

  private reset(r: Room): void {
    for (const x of r.players) this.byPlayer.delete(x.id);
    Object.assign(r, this.blank(r.def));
  }

  // --- partida -------------------------------------------------------------------------------------------------------

  tick(now = this.now()): void {
    for (const r of this.rooms) {
      if (r.phase === "countdown" && now >= r.until) this.begin(r, now);
      else if (r.phase === "playing") this.play(r, now);
      else if (r.phase === "ended" && now >= r.until) this.close(r);
      if (r.dirty && (now - r.sentAt >= STATE_MIN_MS)) this.sendState(r, now);
    }
    if (this.lobbyDirty && now - this.lobbySentAt >= LOBBY_MIN_MS) this.sendLobbies(now);
  }

  private begin(r: Room, now: number): void {
    r.phase = "playing";
    r.startedAt = now;
    r.round = 0;
    r.nextAt = now + 600;
    r.teamLives = MINIGAME_LIVES;
    if (r.game === "pega") { r.until = now + PEGA_MS; r.nextLemonAt = now; r.nextHazardAt = now + PEGA_HAZARD_MS; }
    if (r.game === "genius") { r.round = 1; r.seq = []; for (let i = 0; i < geniusLength(1); i++) r.seq.push(this.randPad()); this.show(r, now + 800); }
    this.markDirty(r, true);
    this.lobbyDirty = true;
  }

  private randPad(): number { return Math.min(GENIUS_PADS.length - 1, Math.floor(this.rng() * GENIUS_PADS.length)); }

  private alive(r: Room): Player[] { return r.players.filter((x) => !x.out); }

  /** Tile local de um jogador vivo na sala (undefined = fora: caiu, teleportou). */
  private local(r: Room, x: Player): number | undefined {
    const p = this.o.getPlayer(x.id);
    if (!p || !this.inRoomRect(r.def, p.x, p.y)) return undefined;
    return (p.y - r.def.y0) * N + (p.x - r.def.x0);
  }

  private global(r: Room, tiles: readonly number[]): number[] {
    const out: number[] = [];
    for (const i of tiles) out.push(r.def.x0 + (i % N), r.def.y0 + Math.floor(i / N));
    return out;
  }

  private fx(r: Room, m: MinigameFxMsg): void {
    for (const x of r.players) this.o.send(x.id, S2C.MinigameFx, m);
  }

  private play(r: Room, now: number): void {
    // Alguém foi parar fora da sala (não devia): sai do jogo.
    for (const x of this.alive(r)) if (this.local(r, x) === undefined) this.eliminate(r, x, false);
    switch (r.game) {
      case "chuva": this.playChuva(r, now); break;
      case "chao": this.playChao(r, now); break;
      case "pega": this.playPega(r, now); break;
      case "genius": this.playGenius(r, now); break;
    }
    if (r.phase !== "playing") return;
    const alive = this.alive(r);
    const coop = r.game ? MINIGAMES[r.game].coop : false;
    if (!alive.length || (!coop && r.game !== "pega" && r.startCount >= 2 && alive.length <= 1)) this.finish(r, now);
  }

  /** Golpe nos tiles: tira uma vida de quem está em cima (fora da imunidade). Devolve quem levou. */
  private strike(r: Room, tiles: readonly number[], now: number, lose = true): Player[] {
    const set = new Set(tiles);
    const hit: Player[] = [];
    for (const x of this.alive(r)) {
      const at = this.local(r, x);
      if (at === undefined || !set.has(at) || now < x.graceUntil) continue;
      x.graceUntil = now + MINIGAME_HIT_GRACE_MS;
      hit.push(x);
      if (lose) this.loseLife(r, x);
    }
    if (hit.length) this.markDirty(r);
    return hit;
  }

  private loseLife(r: Room, x: Player): void {
    x.lives--;
    if (x.lives <= 0) this.eliminate(r, x, true);
    else this.notice(x.id, `Atingido! ${x.lives === 1 ? "Última vida." : `Restam ${x.lives} vidas.`}`, "warn");
  }

  private eliminate(r: Room, x: Player, teleport: boolean): void {
    x.out = true;
    x.lives = 0;
    const p = this.o.getPlayer(x.id);
    const exit = this.o.layout.exit;
    if (teleport && p && exit) {
      this.o.teleport(p, exit.x, exit.y);
      this.notice(x.id, "Sem vidas: você voltou ao saguão. O placar continua na tela.", "info");
    }
    this.markDirty(r, true);
  }

  private playChuva(r: Room, now: number): void {
    if (r.pending && now >= r.pending.at) {
      this.strike(r, r.pending.tiles, now);
      this.fx(r, { kind: "hit", tiles: this.global(r, r.pending.tiles), fx: MINIGAMES.chuva.fx });
      r.pending = undefined;
      for (const x of this.alive(r)) x.score = r.round;
      r.nextAt = now + chuvaTiming(r.round).gapMs;
      this.markDirty(r);
      if (r.round >= CHUVA_MAX_WAVE) this.finish(r, now);
      return;
    }
    if (!r.pending && now >= r.nextAt) {
      r.round++;
      const pat = chuvaPattern(r.round, this.rng);
      const { warnMs } = chuvaTiming(r.round, pat.id);
      r.pending = { at: now + warnMs, tiles: pat.tiles };
      this.fx(r, { kind: "warn", tiles: this.global(r, pat.tiles), ms: warnMs, fx: MINIGAMES.chuva.fx });
      this.markDirty(r);
    }
  }

  private playChao(r: Room, now: number): void {
    // Quem pisa num buraco cai: perde uma vida e volta para um tile de pé.
    for (const x of this.alive(r)) {
      const at = this.local(r, x);
      if (at !== undefined && r.holes[at] && now >= x.graceUntil) {
        x.graceUntil = now + MINIGAME_HIT_GRACE_MS;
        this.loseLife(r, x);
        this.relocate(r, x);
        this.markDirty(r);
      }
    }
    if (r.pending && now >= r.pending.at) {
      for (const i of r.pending.tiles) r.holes[i] = 1;
      const hit = this.strike(r, r.pending.tiles, now);
      for (const x of hit) this.relocate(r, x);
      this.fx(r, { kind: "fall", tiles: this.global(r, r.pending.tiles), fx: MINIGAMES.chao.fx });
      r.pending = undefined;
      for (const x of this.alive(r)) x.score = r.round;
      r.nextAt = now + chaoTiming(r.round).gapMs;
      this.markDirty(r, true);
      return;
    }
    if (!r.pending && now >= r.nextAt) {
      r.round++;
      const t = chaoTiming(r.round);
      const tiles = chaoPick(r.holes, t.count, this.rng);
      if (!tiles.length) {
        // Não sobrou chão para cair: quem ainda está no jogo fecha a partida com a rodada.
        for (const x of this.alive(r)) x.score = r.round;
        return this.finish(r, now);
      }
      r.pending = { at: now + t.warnMs, tiles };
      this.fx(r, { kind: "warn", tiles: this.global(r, tiles), ms: t.warnMs, fx: MINIGAMES.chao.fx });
      this.markDirty(r);
    }
  }

  /** Põe o jogador num tile de pé livre (o mais perto do centro). */
  private relocate(r: Room, x: Player): void {
    const p = this.o.getPlayer(x.id);
    if (!p || x.out) return;
    const c = (N - 1) / 2;
    const at = this.freeNear(r, r.def.x0 + c, r.def.y0 + c, p.id);
    if (r.holes[(at.y - r.def.y0) * N + (at.x - r.def.x0)]) return;
    this.o.teleport(p, at.x, at.y);
  }

  private playPega(r: Room, now: number): void {
    if (now >= r.until) return this.finish(r, now);
    // Pegar: pisou no limão.
    for (const x of this.alive(r)) {
      const at = this.local(r, x);
      const v = at === undefined ? undefined : r.lemons.get(at);
      if (v) { r.lemons.delete(at!); x.score += v; this.markDirty(r); }
    }
    if (now >= r.nextLemonAt && r.lemons.size < pegaTarget(r.startCount)) {
      r.nextLemonAt = now + PEGA_SPAWN_MS;
      this.dropLemon(r, this.rng() < PEGA_GOLD_CHANCE ? PEGA_GOLD_VALUE : 1);
    }
    if (r.pending && now >= r.pending.at) {
      const hit = this.strike(r, r.pending.tiles, now, false);
      for (const x of hit) {
        const lost = Math.min(x.score, PEGA_HIT_LOSS);
        x.score -= lost;
        for (let i = 0; i < lost; i++) this.dropLemon(r, 1);
        this.notice(x.id, lost ? `Atingido! Você derrubou ${lost} limão(ões).` : "Atingido!", "warn");
      }
      this.fx(r, { kind: "hit", tiles: this.global(r, r.pending.tiles), fx: MINIGAMES.pega.fx });
      r.pending = undefined;
      this.markDirty(r);
    }
    if (!r.pending && now >= r.nextHazardAt) {
      r.nextHazardAt = now + PEGA_HAZARD_MS;
      const h = pegaHazard(now - r.startedAt, this.rng);
      r.pending = { at: now + h.warnMs, tiles: h.tiles };
      this.fx(r, { kind: "warn", tiles: this.global(r, h.tiles), ms: h.warnMs, fx: MINIGAMES.pega.fx });
    }
  }

  private dropLemon(r: Room, value: number): void {
    const occupied = new Set<number>();
    for (const x of this.alive(r)) { const at = this.local(r, x); if (at !== undefined) occupied.add(at); }
    const free: number[] = [];
    for (let i = 0; i < N * N; i++) if (!r.lemons.has(i) && !occupied.has(i)) free.push(i);
    if (!free.length) return;
    const i = free[Math.min(free.length - 1, Math.floor(this.rng() * free.length))]!;
    r.lemons.set(i, (r.lemons.get(i) ?? 0) + value);
    this.markDirty(r);
  }

  /** Genius: agenda a vitrine da sequência a partir de `at`. */
  private show(r: Room, at: number): void {
    const { onMs, gapMs } = geniusShowTiming(r.round);
    r.showing = true;
    r.step = 0;
    r.showAt = r.seq.map((_, i) => at + i * (onMs + gapMs));
    r.stepDeadline = at + r.seq.length * (onMs + gapMs) + GENIUS_STEP_MS;
    for (const x of r.players) x.lastPad = -2; // a primeira leitura depois da vitrine só registra onde cada um está
    this.markDirty(r, true);
  }

  private padTiles(pad: number): number[] {
    const p = GENIUS_PADS[pad]!;
    return [p.y0 * N + p.x0, p.y0 * N + p.x0 + 1, (p.y0 + 1) * N + p.x0, (p.y0 + 1) * N + p.x0 + 1];
  }

  private flash(r: Room, pad: number, ms: number, kind: MinigameFxMsg["kind"] = "pad"): void {
    this.fx(r, { kind, tiles: this.global(r, this.padTiles(pad)), ms, fx: MINIGAMES.genius.fx, color: GENIUS_PADS[pad]!.color });
  }

  private playGenius(r: Room, now: number): void {
    if (r.showing) {
      const { onMs } = geniusShowTiming(r.round);
      while (r.showAt.length && now >= r.showAt[0]!) {
        const i = r.seq.length - r.showAt.length;
        r.showAt.shift();
        this.flash(r, r.seq[i]!, onMs);
      }
      if (!r.showAt.length && now >= r.stepDeadline - GENIUS_STEP_MS) {
        r.showing = false;
        r.stepDeadline = now + GENIUS_STEP_MS;
        this.markDirty(r, true);
      }
      return;
    }
    for (const x of this.alive(r)) {
      const at = this.local(r, x);
      const pad = at === undefined ? -1 : geniusPadAt(at % N, Math.floor(at / N));
      const before = x.lastPad;
      x.lastPad = pad;
      if (before === -2 || pad < 0 || pad === before) continue;
      if (pad === r.seq[r.step]) {
        r.step++;
        r.stepDeadline = now + GENIUS_STEP_MS;
        this.flash(r, pad, 300);
        this.markDirty(r);
        if (r.step >= r.seq.length) return this.geniusRound(r, now);
      } else return this.geniusMiss(r, now, pad);
    }
    if (now >= r.stepDeadline) this.geniusMiss(r, now, r.seq[r.step]!);
  }

  private geniusRound(r: Room, now: number): void {
    for (const x of r.players) x.score = r.round;
    if (r.round >= GENIUS_MAX_ROUND) return this.finish(r, now);
    r.round++;
    while (r.seq.length < geniusLength(r.round)) r.seq.push(this.randPad());
    this.show(r, now + 1000);
  }

  private geniusMiss(r: Room, now: number, pad: number): void {
    r.teamLives--;
    this.flash(r, pad, 600, "hit");
    for (const x of this.alive(r)) this.notice(x.id, r.teamLives > 0 ? `Errou a sequência! O time tem ${r.teamLives} vida(s). Olhe de novo.` : "Errou a sequência e o time ficou sem vidas.", "warn");
    if (r.teamLives <= 0) return this.finish(r, now);
    this.show(r, now + 1200);
  }

  // --- fim -----------------------------------------------------------------------------------------------------------

  private finish(r: Room, now: number): void {
    if (r.phase !== "playing" || !r.game) return;
    const game = r.game;
    const def = MINIGAMES[game];
    r.pending = undefined;
    r.phase = "ended";
    r.until = now + MINIGAME_END_MS;
    const playedMs = now - r.startedAt;
    // Vencedor: nos competitivos com 2+ jogadores, quem sobrou de pé (ou o maior placar); no Pega-Limão, o maior placar.
    let winners: Player[] = [];
    if (!def.coop && r.startCount >= 2) {
      const alive = this.alive(r);
      const pool = game !== "pega" && alive.length ? alive : r.players;
      const best = Math.max(...pool.map((x) => x.score));
      winners = best > 0 || game !== "pega" ? pool.filter((x) => x.score === best) : [];
    }
    r.winners = winners.map((x) => x.name);
    const week = weekId(new Date(r.startedAt || now));
    if (def.coop) {
      const score = Math.max(0, ...r.players.map((x) => x.score));
      this.submitRecord(week, game, { names: r.players.map((x) => x.name), score, at: now });
    } else for (const x of r.players) this.submitRecord(week, game, { names: [x.name], score: x.score, at: now });
    for (const x of r.players) {
      const p = this.o.getPlayer(x.id);
      if (!p) continue;
      const won = winners.includes(x);
      const earned = fichasCapped(minigameFichas(game, x.score, won, playedMs), this.fichasToday(p.name, now));
      if (earned > 0) {
        this.addFichasToday(p.name, earned, now);
        this.o.giveFichas(p, earned);
      }
      x.fichas = earned;
      this.o.onPlayed?.(p, game, x.score, won);
    }
    if (winners.length) {
      const what = `${def.name} (${winners[0]!.score} ${def.scoreLabel})`;
      this.o.broadcast(S2C.Feed, { text: `🎲 Salão: ${winners.map((x) => x.name).join(" e ")} ${winners.length > 1 ? "empataram" : "venceu"} ${what}!`, kind: "info" } satisfies FeedMsg);
    }
    this.markDirty(r, true);
    this.lobbyDirty = true;
  }

  /** Fim do resultado: quem ainda está na sala volta ao saguão e a sala fica livre. */
  private close(r: Room): void {
    const exit = this.o.layout.exit;
    for (const x of r.players) {
      const p = this.o.getPlayer(x.id);
      if (p && exit && this.inRoomRect(r.def, p.x, p.y)) this.o.teleport(p, exit.x, exit.y);
      this.o.send(x.id, S2C.Minigame, null);
    }
    this.reset(r);
    this.lobbyDirty = true;
  }

  // --- estado para o cliente -----------------------------------------------------------------------------------------

  private markDirty(r: Room, urgent = false): void {
    r.dirty = true;
    if (urgent) r.sentAt = 0;
  }

  private sendState(r: Room, now: number): void {
    r.dirty = false;
    r.sentAt = now;
    if (!r.game || r.phase === "idle" || r.phase === "lobby") return;
    const base: MinigameStateMsg = {
      room: r.def.id, game: r.game, phase: r.phase, round: r.round, ox: r.def.x0, oy: r.def.y0, serverNow: now,
      players: r.players.map((x) => ({ id: x.id, name: x.name, lives: x.lives, score: x.score, out: x.out })),
      ...(r.phase === "countdown" || r.phase === "ended" || r.game === "pega" ? { until: r.until } : {}),
      ...(r.game === "genius" ? { teamLives: r.teamLives, genius: { step: r.step, length: r.seq.length, showing: r.showing } } : {}),
      ...(r.game === "chao" ? { holes: [...r.holes.keys()].filter((i) => r.holes[i]) } : {}),
      ...(r.game === "pega" ? { lemons: [...r.lemons.entries()] } : {}),
      ...(r.phase === "ended" ? { winners: r.winners ?? [] } : {}),
    };
    for (const x of r.players) this.o.send(x.id, S2C.Minigame, r.phase === "ended" ? { ...base, fichas: x.fichas ?? 0 } : base);
  }

  /** Reconexão: reenvia a partida em que está. */
  resend(id: string): void {
    const r = this.byPlayer.get(id);
    if (r) this.markDirty(r, true);
  }

  // --- kv: recordes e fichas do dia -----------------------------------------------------------------------------------

  recordsOf(week: string, game: MinigameId): MinigameRecord[] {
    try {
      const raw = this.o.getKv?.(kvMinigameWeek(week, game));
      const list = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(list)) return [];
      return list.filter((x): x is MinigameRecord => !!x && Array.isArray(x.names) && x.names.every((n: unknown) => typeof n === "string")
        && Number.isFinite(x.score) && Number.isFinite(x.at));
    } catch { return []; }
  }

  private submitRecord(week: string, game: MinigameId, rec: MinigameRecord): void {
    if (!this.o.setKv || !(rec.score > 0)) return;
    try { this.o.setKv(kvMinigameWeek(week, game), JSON.stringify(minigameRecordsInsert(this.recordsOf(week, game), rec))); }
    catch (e) { console.error("[minigames] falha ao gravar o recorde:", e); }
  }

  fichasToday(name: string, now = this.now()): number {
    return Math.max(0, Math.floor(Number(this.o.getKv?.(kvFichasDay(dayOf(now), name)) ?? 0)) || 0);
  }

  private addFichasToday(name: string, n: number, now: number): void {
    this.o.setKv?.(kvFichasDay(dayOf(now), name), String(this.fichasToday(name, now) + n));
  }
}

// Coliseu: lobbies no NPC "arena_master" (vila), fila FIFO quando as ARENA_COUNT arenas estão ocupadas, e a partida
// por instância (ondas de shared/data/arena.ts → respiro curto → próxima onda; depois das ondas-chefe, pausa com
// loja e "Pronto"). Sem penalidade de morte:
// quem cai volta para "arena_exit" com vida cheia e fica com o que já ganhou (recompensa paga no fim de cada onda).
// Tudo vem do mapa (objetos "arena", "arena_entry", "arena_spawn", "arena_exit"); sem eles o coliseu fica fechado.
// Ciclo 16: ondas 61–70 com o modificador da semana (fixado no início da partida), marco de ouro na 60 e ranking de
// tempo das 70 ondas no kv (arenaChampion.ts; o título rotativo "Campeão do Coliseu" sai de lá na virada da semana).
import {
  ARENA_COMPLETE_GOLD, ARENA_COMPLETE_XP_PCT, ARENA_COUNTDOWN_MS, ARENA_INTRO_MS, ARENA_LOBBY_RANGE, ARENA_MODS,
  ARENA_MAX_WAVE, ARENA_MOD_FROM_WAVE, ARENA_PAUSE_HEAL, ARENA_READY_MS, ARENA_SPAWN_DELAY_MS, ARENA_SPAWN_STAGGER_MS, S2C,
  applyXpStage, arenaMilestoneGold, arenaModAt, arenaPauseMs, arenaShopAfter, arenaTimeText, arenaWaveGold, arenaWaveSpawns,
  arenaWaveXp, findObjects, monsterDef, objectTile, partyMinLevel, weekEndsAt, weekId,
  type ArenaActionMsg, type ArenaLobbiesMsg, type ArenaLobbySummary, type ArenaModId, type ArenaPhase, type ArenaResultMsg,
  type ArenaSpawnSpec, type ArenaStateMsg, type FeedMsg, type MonsterDef, type NoticeMsg, type TiledMap,
} from "@lemonquest/shared";
import type { PlayerState } from "../state.ts";
import { arenaTimes, submitArenaTime } from "./arenaChampion.ts";
import { cheb, type MonsterManager, type TileRect } from "./monsters.ts";
import type { Point } from "./pathfinding.ts";

/** Envio de ArenaState por partida no máximo a cada isto (monstersLeft); mudanças de fase saem na hora. */
export const ARENA_STATE_MIN_MS = 250;
/** Resultado a partir do qual a partida vai para o feed global (ou novo recorde do servidor ≥ ARENA_FEED_RECORD_MIN). */
export const ARENA_FEED_MIN_WAVES = 10;
export const ARENA_FEED_RECORD_MIN = 3;

export interface ArenaDef { id: number; rect: TileRect; entry: Point; spawns: Point[] }
export interface ArenaLayout { arenas: ArenaDef[]; exit: Point | null }

const prop = (o: { properties?: { name: string; value: unknown }[] }, name: string) =>
  o.properties?.find((p) => p.name === name)?.value;

/** Lê as arenas do mapa (convenções em shared/map.ts). Arena sem "arena_entry" usa o centro do retângulo. */
export function parseArenas(map: TiledMap): ArenaLayout {
  const t = map.tilewidth;
  const idOf = (o: { properties?: { name: string; value: unknown }[] }) => Math.floor(Number(prop(o, "arenaId") ?? 0));
  const entries = findObjects(map, "arena_entry");
  const spawns = findObjects(map, "arena_spawn");
  const arenas: ArenaDef[] = [];
  for (const o of findObjects(map, "arena")) {
    const id = idOf(o);
    if (!(id > 0) || arenas.some((a) => a.id === id)) continue;
    const rect: TileRect = {
      x0: Math.floor(o.x / t), y0: Math.floor(o.y / t),
      x1: Math.floor((o.x + Math.max(1, o.width) - 1) / t), y1: Math.floor((o.y + Math.max(1, o.height) - 1) / t),
    };
    const e = entries.find((x) => idOf(x) === id);
    const entry = e ? objectTile(e, t) : { x: Math.floor((rect.x0 + rect.x1) / 2), y: Math.floor((rect.y0 + rect.y1) / 2) };
    arenas.push({ id, rect, entry, spawns: spawns.filter((x) => idOf(x) === id).map((x) => objectTile(x, t)) });
  }
  arenas.sort((a, b) => a.id - b.id);
  const ex = findObjects(map, "arena_exit")[0];
  return { arenas, exit: ex ? objectTile(ex, t) : null };
}

const inRect = (r: TileRect, x: number, y: number) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;

export interface ArenaOptions {
  layout: ArenaLayout;
  /** Posição do NPC "arena_master" (null = coliseu fechado). */
  master: () => Point | null;
  /** Para onde vai quem sai sem "arena_exit" no mapa (templo). */
  fallbackExit: Point;
  monsters: MonsterManager;
  combat: {
    gainXp(p: PlayerState, amount: number, x: number, y: number): void;
    healPlayer(p: PlayerState, sourceId: string, amount: number): number;
    restoreMana(p: PlayerState, amount: number): number;
  };
  players: () => Iterable<PlayerState>;
  getPlayer: (id: string) => PlayerState | undefined;
  /** MovementSystem.teleport (cancela andar/caminho). */
  teleport: (p: PlayerState, x: number, y: number) => void;
  /** Tile livre para colocar um jogador (andável, sem criatura/NPC/portal). */
  isFree: (x: number, y: number, selfId: string) => boolean;
  addGold: (p: PlayerState, n: number) => void;
  getBest: (id: string) => number;
  setBest: (id: string, best: number) => void;
  /** Saiu da arena (morte/desistência/fim): fecha NPC, some com invocações, limpa condições. */
  onExit?: (p: PlayerState) => void;
  /** Venceu uma onda (conquistas e missões). */
  onWaveCleared?: (p: PlayerState, wave: number) => void;
  /** Entrou na arena: fecha diálogos de NPC abertos. */
  onEnter?: (p: PlayerState) => void;
  /** Fecha a loja do coliseu (a onda começou). */
  closeNpc?: (id: string) => void;
  send: (id: string, type: string, msg: unknown) => void;
  broadcast: (type: string, msg: unknown) => void;
  now?: () => number;
  rng?: () => number;
  defs?: (id: string) => MonsterDef | undefined;
  /** Recorde do servidor persistido: lido no construtor, gravado quando é batido. */
  loadServerBest?: () => number;
  saveServerBest?: (waves: number) => void;
  /** Ranking de tempo das 70 ondas (ciclo 16): kv do servidor (chaves em arenaChampion.ts). Sem ele, não grava. */
  getKv?: (key: string) => string | undefined;
  setKv?: (key: string, value: string) => void;
  /** Modificador da semana no instante `at` (padrão: rodízio por weekId; testes trocam). */
  weekMod?: (at: number) => ArenaModId;
  /** Membros do grupo (party) do jogador, sem ele — "Criar grupo do Coliseu com meu grupo". */
  partyMates?: (id: string) => string[];
  /** O jogador é o líder do grupo (party)? */
  isPartyLeader?: (id: string) => boolean;
}

interface Member {
  id: string;
  name: string;
  /** Na arena e vivo (participando). Em lobby: true. */
  alive: boolean;
  ready: boolean;
  xp: number;
  gold: number;
  cleared: number;
  /** Estava na faixa de level (≥ 2/3 do maior vivo) na última onda vencida: só assim leva o bônus de ouro do fim. */
  inRange?: boolean;
}

interface PendingSpawn { at: number; spec: ArenaSpawnSpec; point: Point }

interface Party {
  id: string;
  leader: string;
  members: Member[];
  phase: ArenaPhase;
  arena: ArenaDef | null;
  inArena: boolean;
  wave: number;
  phaseEndsAt: number;
  readyTriggered: boolean;
  spawns: ArenaSpawnSpec[];
  pending: PendingSpawn[];
  monsterIds: Set<string>;
  monstersLeft: number;
  /** Ondas vencidas pelo grupo. */
  cleared: number;
  lastSentAt: number;
  dirty: boolean;
  /** Modificador das ondas 61–70 (o da semana; fixado quando a onda 1 começa). */
  mod: ArenaModId;
  /** Início da onda 1 (ms): relógio do ranking de tempo. 0 = ainda não começou. */
  startedAt: number;
  /** Venceu as 70: tempo e recorde batido (para o resultado e o feed). */
  timeMs?: number;
  timeRecord?: "week" | "server";
}

const TOWN: ReadonlySet<ArenaPhase> = new Set(["lobby", "queued", "countdown"]);

export class ArenaSystem {
  private readonly parties = new Map<string, Party>();
  private readonly partyOf = new Map<string, Party>();
  private readonly queue: Party[] = [];
  private readonly busy = new Map<number, Party>();
  private readonly watchers = new Set<string>();
  private readonly now: () => number;
  private readonly rng: () => number;
  private readonly defs: (id: string) => MonsterDef | undefined;
  private readonly weekMod: (at: number) => ArenaModId;
  private nextId = 1;
  private lobbiesDirty = false;
  /** Maior número de ondas vencidas no servidor, persistido entre reinícios (para "novo recorde" no feed). */
  serverBest = 0;

  constructor(private readonly o: ArenaOptions) {
    this.now = o.now ?? Date.now;
    this.rng = o.rng ?? Math.random;
    this.defs = o.defs ?? monsterDef;
    this.weekMod = o.weekMod ?? arenaModAt;
    const saved = o.loadServerBest?.();
    if (typeof saved === "number" && Number.isFinite(saved) && saved > 0) this.serverBest = Math.floor(saved);
  }

  get arenas(): readonly ArenaDef[] { return this.o.layout.arenas; }
  get freeArenas(): number { return this.arenas.filter((a) => !this.busy.has(a.id)).length; }
  get queueLength(): number { return this.queue.length; }
  /** Partida/lobby do jogador (testes/inspeção). */
  partyFor(id: string): Readonly<Party> | undefined { return this.partyOf.get(id); }

  /** Arena que contém o tile (ou undefined). */
  arenaAt(x: number, y: number): ArenaDef | undefined {
    return this.arenas.find((a) => inRect(a.rect, x, y));
  }

  /** Posição salva dentro de uma arena (servidor caiu/saiu no meio): volta para a saída. Senão null. */
  loginPosition(x: number | null, y: number | null): Point | null {
    if (x === null || y === null || !this.arenaAt(x, y)) return null;
    return this.exitPoint();
  }

  /** Jogador está lutando numa arena (vivo, dentro). */
  inMatch(id: string): boolean {
    const party = this.partyOf.get(id);
    return !!party?.inArena && !!party.members.find((m) => m.id === id)?.alive;
  }

  /** A loja "arena_shop_<n>" só atende membros da partida daquela arena durante a pausa. */
  canUseShop(p: PlayerState, npcId: string): boolean {
    if (!npcId.startsWith("arena_shop_")) return true;
    const party = this.partyOf.get(p.id);
    return !!party && party.inArena && party.phase === "pause" && `arena_shop_${party.arena?.id}` === npcId;
  }

  // --- mensagens ---------------------------------------------------------------

  /** Abriu o NPC do coliseu: passa a receber a lista de lobbies enquanto estiver perto. */
  openLobbies(p: PlayerState): void {
    if (this.nearMaster(p)) this.watchers.add(p.id);
    this.o.send(p.id, S2C.ArenaLobbies, this.lobbiesMsg());
  }

  onAction(p: PlayerState, msg: ArenaActionMsg): void {
    if (!msg || typeof msg !== "object" || typeof msg.action !== "string") return;
    switch (msg.action) {
      case "list": return this.openLobbies(p);
      case "create": return this.create(p, msg.withParty === true);
      case "join": return typeof msg.lobbyId === "string" ? this.join(p, msg.lobbyId) : undefined;
      case "leave": return this.leave(p);
      case "start": return this.start(p);
      case "ready": return this.ready(p);
    }
  }

  private create(p: PlayerState, withParty = false): void {
    if (this.partyOf.has(p.id)) return this.notice(p.id, "Você já está num grupo do Coliseu.", "warn");
    if (!this.arenas.length) return this.notice(p.id, "O Coliseu está fechado.", "warn");
    if (!this.nearMaster(p)) return this.notice(p.id, "Fale com o Mestre do Coliseu.", "warn");
    const party: Party = {
      id: `L${this.nextId++}`, leader: p.id, members: [this.member(p)], phase: "lobby", arena: null, inArena: false,
      wave: 0, phaseEndsAt: 0, readyTriggered: false, spawns: [], pending: [], monsterIds: new Set(), monstersLeft: 0,
      cleared: 0, lastSentAt: 0, dirty: false, mod: this.weekMod(this.now()), startedAt: 0,
    };
    this.parties.set(party.id, party);
    this.partyOf.set(p.id, party);
    this.watchers.add(p.id);
    if (withParty) this.bringParty(p, party);
    this.pushState(party);
    this.lobbiesDirty = true;
  }

  /** Líder do grupo (party) criou o lobby "com meu grupo": entram os membros perto do Mestre e livres. */
  private bringParty(p: PlayerState, party: Party): void {
    if (this.o.isPartyLeader && !this.o.isPartyLeader(p.id)) {
      this.notice(p.id, "Só o líder do grupo pode trazer o grupo.", "warn");
      return;
    }
    const left: string[] = [];
    for (const id of this.o.partyMates?.(p.id) ?? []) {
      const mate = this.o.getPlayer(id);
      if (!mate) continue;
      if (this.partyOf.has(id) || mate.hp <= 0 || !this.nearMaster(mate)) {
        left.push(mate.name);
        continue;
      }
      party.members.push(this.member(mate));
      this.partyOf.set(id, party);
      this.watchers.add(id);
      this.o.send(id, S2C.ArenaLobbies, this.lobbiesMsg());
      this.notice(id, `${p.name} te colocou no grupo do Coliseu.`, "info");
    }
    if (left.length) this.notice(p.id, `Ficaram de fora (longe do Mestre ou ocupados): ${left.join(", ")}.`, "warn");
  }

  private join(p: PlayerState, lobbyId: string): void {
    if (this.partyOf.has(p.id)) return this.notice(p.id, "Você já está num grupo do Coliseu.", "warn");
    if (!this.nearMaster(p)) return this.notice(p.id, "Fale com o Mestre do Coliseu.", "warn");
    const party = this.parties.get(lobbyId);
    if (!party || (party.phase !== "lobby" && party.phase !== "queued")) return this.notice(p.id, "Esse grupo não está mais aberto.", "warn");
    party.members.push(this.member(p));
    this.partyOf.set(p.id, party);
    this.watchers.add(p.id);
    this.pushState(party);
    this.lobbiesDirty = true;
  }

  private leave(p: PlayerState): void {
    const party = this.partyOf.get(p.id);
    if (!party) return;
    if (party.inArena) {
      const m = party.members.find((x) => x.id === p.id);
      if (m?.alive) { this.memberOut(party, m, "gave_up"); this.checkEnd(party, "gave_up"); }
      return;
    }
    this.removeFromLobby(party, p.id);
  }

  private start(p: PlayerState): void {
    const party = this.partyOf.get(p.id);
    if (!party || party.phase !== "lobby") return;
    if (party.leader !== p.id) return this.notice(p.id, "Só o líder pode iniciar.", "warn");
    if (!this.nearMaster(p)) return this.notice(p.id, "Fale com o Mestre do Coliseu.", "warn");
    if (!this.arenas.length) return this.notice(p.id, "O Coliseu está fechado.", "warn");
    const arena = this.freeArena();
    if (arena) this.beginCountdown(party, arena);
    else {
      party.phase = "queued";
      this.queue.push(party);
      for (const m of party.members) this.notice(m.id, `Todas as arenas estão ocupadas. Seu grupo está na fila (${this.queue.length}º).`, "info");
      this.pushState(party);
    }
    this.lobbiesDirty = true;
  }

  private ready(p: PlayerState): void {
    const party = this.partyOf.get(p.id);
    if (!party?.inArena || party.phase !== "pause") return;
    const m = party.members.find((x) => x.id === p.id);
    if (!m?.alive || m.ready) return;
    m.ready = true;
    const alive = party.members.filter((x) => x.alive);
    if (alive.every((x) => x.ready) && !party.readyTriggered) {
      party.readyTriggered = true;
      party.phaseEndsAt = Math.min(party.phaseEndsAt, this.now() + ARENA_READY_MS);
    }
    this.pushState(party);
  }

  // --- ciclo de vida ----------------------------------------------------------

  /** Morte de um jogador: se ele está numa partida, o coliseu assume (sem penalidade). */
  interceptDeath(p: PlayerState): boolean {
    const party = this.partyOf.get(p.id);
    if (!party?.inArena) return false;
    const m = party.members.find((x) => x.id === p.id);
    if (!m?.alive) return false;
    this.memberOut(party, m, "wiped");
    this.checkEnd(party, "wiped");
    return true;
  }

  /** Jogador saiu de vez (fim da janela de reconexão / logout): sai do lobby ou desiste da partida. Chamar ANTES de salvar. */
  removePlayer(id: string): void {
    this.watchers.delete(id);
    const party = this.partyOf.get(id);
    if (!party) return;
    if (party.inArena) {
      const m = party.members.find((x) => x.id === id);
      if (m?.alive) { this.memberOut(party, m, "gave_up"); this.checkEnd(party, "gave_up"); }
      return; // fica na lista (fora) para os outros
    }
    this.removeFromLobby(party, id, true);
  }

  /** Reconectou: reenvia o estado da partida/lobby. */
  resend(id: string): void {
    const party = this.partyOf.get(id);
    this.o.send(id, S2C.ArenaState, party ? this.stateMsg(party, id) : ({ state: null } satisfies ArenaStateMsg));
  }

  tick(now = this.now()): void {
    // Quem saiu de perto do NPC para de receber a lista.
    for (const id of [...this.watchers]) {
      const p = this.o.getPlayer(id);
      if (!p || !this.nearMaster(p)) this.watchers.delete(id);
    }
    for (const party of [...this.parties.values()]) {
      if (!party.inArena) this.tickTown(party, now);
      else this.tickArena(party, now);
      if (party.dirty && this.parties.has(party.id) && now - party.lastSentAt >= ARENA_STATE_MIN_MS) this.flushState(party, now);
    }
    if (this.lobbiesDirty) {
      this.lobbiesDirty = false;
      const msg = this.lobbiesMsg();
      const to = new Set(this.watchers);
      for (const party of this.parties.values()) if (!party.inArena) for (const m of party.members) to.add(m.id);
      for (const id of to) this.o.send(id, S2C.ArenaLobbies, msg);
    }
  }

  private tickTown(party: Party, now: number): void {
    // Proximidade: no lobby/fila/contagem todos ficam perto do mestre.
    for (const m of [...party.members]) {
      const p = this.o.getPlayer(m.id);
      if (!p || p.hp <= 0 || !this.nearMaster(p)) {
        if (p) this.notice(m.id, "Você se afastou do Mestre do Coliseu e saiu do grupo.", "warn");
        this.removeFromLobby(party, m.id);
      }
    }
    if (!this.parties.has(party.id)) return;
    if (party.phase === "countdown" && now >= party.phaseEndsAt) this.enterArena(party, now);
  }

  private tickArena(party: Party, now: number): void {
    if (party.phase === "countdown") {
      if (now >= party.phaseEndsAt) this.startWave(party, 1, now);
      return;
    }
    if (party.phase === "pause" || party.phase === "break") {
      if (now >= party.phaseEndsAt) this.startWave(party, party.wave + 1, now);
      return;
    }
    if (party.phase !== "fight" || !party.arena) return;
    for (let i = 0; i < party.pending.length; i++) {
      const ps = party.pending[i];
      if (now < ps.at) continue;
      if (this.spawn(party, ps, now)) { party.pending.splice(i, 1); i--; }
      else ps.at = now + 500; // sem tile livre: tenta já já
    }
    for (const id of party.monsterIds) if (!this.o.monsters.get(id)) party.monsterIds.delete(id);
    const left = party.pending.length + party.monsterIds.size;
    if (left !== party.monstersLeft) { party.monstersLeft = left; party.dirty = true; }
    if (left === 0) this.waveCleared(party, now);
  }

  private beginCountdown(party: Party, arena: ArenaDef): void {
    party.arena = arena;
    this.busy.set(arena.id, party);
    party.phase = "countdown";
    party.phaseEndsAt = this.now() + ARENA_COUNTDOWN_MS;
    this.pushState(party);
    this.lobbiesDirty = true;
  }

  private enterArena(party: Party, now: number): void {
    const arena = party.arena!;
    party.inArena = true;
    for (const m of party.members) {
      const p = this.o.getPlayer(m.id);
      if (!p) continue;
      p.targetId = "";
      this.o.onEnter?.(p);
      const t = this.freeTileNear(arena.entry, p.id, arena.rect) ?? arena.entry;
      this.o.teleport(p, t.x, t.y);
      m.alive = true;
      this.watchers.delete(m.id);
    }
    party.phase = "countdown";
    party.phaseEndsAt = now + ARENA_INTRO_MS;
    this.pushState(party);
    this.lobbiesDirty = true;
  }

  private startWave(party: Party, wave: number, now: number): void {
    const arena = party.arena!;
    const alive = this.alivePlayers(party);
    if (!alive.length) { this.endMatch(party, "wiped"); return; }
    const avg = alive.reduce((s, p) => s + p.level, 0) / alive.length;
    if (wave === 1) { party.mod = this.weekMod(now); party.startedAt = now; }
    party.wave = wave;
    party.phase = "fight";
    party.phaseEndsAt = 0;
    party.readyTriggered = false;
    for (const m of party.members) m.ready = false;
    party.spawns = arenaWaveSpawns(wave, alive.length, avg, party.mod);
    const points = arena.spawns.length ? [...arena.spawns] : [arena.entry];
    for (let i = points.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [points[i], points[j]] = [points[j]!, points[i]!]; }
    party.pending = party.spawns.map((spec, i) => ({
      at: now + ARENA_SPAWN_DELAY_MS + i * ARENA_SPAWN_STAGGER_MS, spec, point: points[i % points.length]!,
    }));
    party.monstersLeft = party.pending.length;
    for (const p of alive) this.o.closeNpc?.(p.id);
    this.pushState(party);
  }

  private spawn(party: Party, ps: PendingSpawn, now: number): boolean {
    const arena = party.arena!;
    const def = this.defs(ps.spec.defId);
    if (!def) return true; // def sumiu: conta como morto
    const mm = this.o.monsters;
    const ok = (x: number, y: number) => inRect(arena.rect, x, y) && mm.grid.isWalkable(x, y) && !mm.blockedForMonster(x, y);
    let tile: Point | null = null;
    for (let r = 0; r <= 3 && !tile; r++) {
      for (let y = ps.point.y - r; y <= ps.point.y + r && !tile; y++)
        for (let x = ps.point.x - r; x <= ps.point.x + r && !tile; x++)
          if (cheb(x, y, ps.point.x, ps.point.y) === r && ok(x, y)) tile = { x, y };
    }
    for (let i = 0; i < 40 && !tile; i++) {
      const x = arena.rect.x0 + Math.floor(this.rng() * (arena.rect.x1 - arena.rect.x0 + 1));
      const y = arena.rect.y0 + Math.floor(this.rng() * (arena.rect.y1 - arena.rect.y0 + 1));
      if (ok(x, y)) tile = { x, y };
    }
    if (!tile) return false;
    const members = new Set(party.members.filter((m) => m.alive).map((m) => m.id));
    const m = mm.spawnArena(def, tile.x, tile.y, {
      arenaId: arena.id, bounds: arena.rect, hpMult: ps.spec.hpMult, dmgMult: ps.spec.dmgMult,
      // Só membros vivos e ainda dentro da arena (quem morreu/saiu deixa de ser alvo na hora).
      allow: (p) => members.has(p.id) && inRect(arena.rect, p.x, p.y) && this.inMatch(p.id),
    }, now);
    party.monsterIds.add(m.s.id);
    return true;
  }

  private waveCleared(party: Party, now: number): void {
    const wave = party.wave;
    party.cleared = wave;
    const alive = party.members.filter((m) => m.alive);
    const waveXp = arenaWaveXp(party.spawns, alive.length);
    const milestone = arenaMilestoneGold(wave);
    const gold = arenaWaveGold(wave) + milestone;
    // Mesma faixa da XP compartilhada do grupo: quem está abaixo de 2/3 do maior level vivo não ganha XP nem ouro (sem
    // isso um level alto "carregava" personagens level 1 por ondas fáceis — as ondas escalam pela média — e o ouro de
    // cada alt carregado ia para o principal pela troca).
    const players = alive.map((m) => this.o.getPlayer(m.id)).filter((p): p is PlayerState => !!p);
    const minLevel = partyMinLevel(Math.max(0, ...players.map((p) => p.level)));
    const xpFor = new Map<string, number>();
    for (const m of alive) {
      const p = this.o.getPlayer(m.id);
      if (!p) continue;
      const inRange = p.level >= minLevel;
      const xp = inRange ? applyXpStage(waveXp, p.level) : 0;
      const g = inRange ? gold : 0;
      xpFor.set(m.id, xp);
      m.inRange = inRange;
      m.cleared = wave;
      m.xp += xp;
      m.gold += g;
      if (xp > 0) this.o.combat.gainXp(p, xp, p.x, p.y);
      if (g > 0) this.o.addGold(p, g);
      this.o.onWaveCleared?.(p, wave);
      this.o.combat.healPlayer(p, p.id, Math.round(p.maxHp * ARENA_PAUSE_HEAL));
      this.o.combat.restoreMana(p, Math.round(p.maxMana * ARENA_PAUSE_HEAL));
    }
    party.spawns = [];
    if (wave >= ARENA_MAX_WAVE) {
      this.recordTime(party, alive.filter((m) => m.inRange).map((m) => m.name), now);
      this.endMatch(party, "completed");
      return;
    }
    // Ondas comuns emendam (respiro curto); a pausa com o vendedor só vem depois das ondas-chefe (nas ondas 61–70 o
    // modificador da semana pode mudar as duas).
    party.phase = arenaShopAfter(wave, party.mod) ? "pause" : "break";
    party.phaseEndsAt = now + arenaPauseMs(wave, party.mod);
    party.readyTriggered = false;
    for (const m of party.members) m.ready = false;
    const mod = wave + 1 === ARENA_MOD_FROM_WAVE ? ARENA_MODS[party.mod] : null;
    for (const m of alive) {
      const xp = xpFor.get(m.id) ?? 0;
      const extra = milestone ? ` (${milestone} do marco da onda ${wave})` : "";
      if (m.inRange) this.notice(m.id, `Onda ${wave} vencida! +${xp} XP, +${gold} de ouro${extra}.`, "good");
      else this.notice(m.id, `Onda ${wave} vencida! Sem XP nem ouro: level abaixo de ${minLevel} (2/3 do maior do grupo).`, "info");
      if (mod) this.notice(m.id, `Ondas ${ARENA_MOD_FROM_WAVE}–${ARENA_MAX_WAVE} desta semana: ${mod.icon} ${mod.name} — ${mod.desc}`, "info");
    }
    this.pushState(party);
  }

  /** Tira um membro da partida (morte/desistência/fim): saída na vila, vida cheia, resultado só para ele. */
  private memberOut(party: Party, m: Member, reason: ArenaResultMsg["reason"]): void {
    m.alive = false;
    m.ready = false;
    const p = this.o.getPlayer(m.id);
    if (reason === "completed" && p && m.inRange) {
      const bonusXp = Math.round(m.xp * ARENA_COMPLETE_XP_PCT);
      m.xp += bonusXp;
      m.gold += ARENA_COMPLETE_GOLD;
      if (bonusXp > 0) this.o.combat.gainXp(p, bonusXp, p.x, p.y);
      this.o.addGold(p, ARENA_COMPLETE_GOLD);
    }
    const best = Math.max(this.o.getBest(m.id), m.cleared);
    if (p) {
      this.o.setBest(m.id, best);
      p.targetId = "";
      this.o.onExit?.(p);
      const t = this.freeTileNear(this.exitPoint(), p.id) ?? this.exitPoint();
      this.o.teleport(p, t.x, t.y);
      p.hp = p.maxHp;
      p.mana = p.maxMana;
    }
    this.o.monsters.clearTargetsOf(m.id);
    if (this.partyOf.get(m.id) === party) this.partyOf.delete(m.id); // livre para outro lobby
    const time = reason === "completed" && party.timeMs !== undefined
      ? { timeMs: party.timeMs, ...(party.timeRecord ? { timeRecord: party.timeRecord } : {}) } : {};
    this.o.send(m.id, S2C.ArenaResult, { wavesCleared: m.cleared, xp: m.xp, gold: m.gold, best, reason, ...time } satisfies ArenaResultMsg);
    this.o.send(m.id, S2C.ArenaState, { state: null } satisfies ArenaStateMsg);
    if (reason === "wiped") this.notice(m.id, "Você caiu no Coliseu — sem penalidade. A recompensa das ondas vencidas é sua.", "info");
    this.pushState(party);
  }

  private checkEnd(party: Party, reason: ArenaResultMsg["reason"]): void {
    if (party.members.some((m) => m.alive)) return;
    this.endMatch(party, reason);
  }

  private endMatch(party: Party, reason: ArenaResultMsg["reason"]): void {
    for (const m of party.members) if (m.alive) this.memberOut(party, m, reason);
    for (const id of party.monsterIds) { const mon = this.o.monsters.get(id); if (mon) this.o.monsters.despawn(mon); }
    party.monsterIds.clear();
    party.pending = [];
    party.phase = "ended";
    if (party.arena && this.busy.get(party.arena.id) === party) this.busy.delete(party.arena.id);
    this.parties.delete(party.id);
    for (const m of party.members) if (this.partyOf.get(m.id) === party) this.partyOf.delete(m.id);
    this.feed(party, reason);
    this.lobbiesDirty = true;
    this.startQueued();
  }

  private feed(party: Party, reason: ArenaResultMsg["reason"]): void {
    const waves = party.cleared;
    const record = waves > this.serverBest && waves >= ARENA_FEED_RECORD_MIN;
    if (waves > this.serverBest) {
      this.serverBest = waves;
      try { this.o.saveServerBest?.(waves); } catch (e) { console.error("[arena] falha ao gravar o recorde:", e); }
    }
    if (waves < ARENA_FEED_MIN_WAVES && !record && reason !== "completed") return;
    const names = party.members.map((m) => m.name);
    const who = names.length > 1 ? `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}` : names[0] ?? "?";
    const verb = names.length > 1 ? "venceram" : "venceu";
    const time = party.timeMs !== undefined ? ` em ${arenaTimeText(party.timeMs)}` : "";
    const timeRec = party.timeRecord === "server" ? " Novo recorde de tempo!" : party.timeRecord === "week" ? " Melhor tempo da semana!" : "";
    const text = reason === "completed"
      ? `🏟️ ${who} ${verb} as ${ARENA_MAX_WAVE} ondas do Coliseu${time}!${timeRec}`
      : `🏟️ ${who} ${names.length > 1 ? "chegaram" : "chegou"} à onda ${waves} do Coliseu!${record ? " Novo recorde!" : ""}`;
    this.o.broadcast(S2C.Feed, { text, kind: "info" } satisfies FeedMsg);
  }

  /**
   * Venceu as 70: grava o tempo (melhor da semana / de todos) em nome dos sobreviventes na faixa de level. Vale a semana
   * em que a partida COMEÇOU, a do modificador que ela usou (domingo 23h → segunda conta na semana que acabou).
   */
  private recordTime(party: Party, names: string[], now: number): void {
    if (!party.startedAt) return;
    party.timeMs = now - party.startedAt;
    if (!names.length || !this.o.getKv || !this.o.setKv) return;
    try {
      party.timeRecord = submitArenaTime({ getKv: this.o.getKv, setKv: this.o.setKv },
        { ms: party.timeMs, names, week: weekId(new Date(party.startedAt)), mod: party.mod, at: now });
    } catch (e) {
      console.error("[arena] falha ao gravar o tempo:", e);
    }
  }

  /** Arena livre → próximo grupo da fila (FIFO). */
  private startQueued(): void {
    while (this.queue.length) {
      const arena = this.freeArena();
      if (!arena) return;
      const party = this.queue.shift()!;
      if (!this.parties.has(party.id) || party.phase !== "queued" || !party.members.length) continue;
      for (const m of party.members) this.notice(m.id, "Uma arena ficou livre! Prepare-se.", "good");
      this.beginCountdown(party, arena);
    }
  }

  private removeFromLobby(party: Party, id: string, silent = false): void {
    const i = party.members.findIndex((m) => m.id === id);
    if (i < 0) return;
    party.members.splice(i, 1);
    this.partyOf.delete(id);
    if (!silent) this.o.send(id, S2C.ArenaState, { state: null } satisfies ArenaStateMsg);
    if (!party.members.length) {
      this.parties.delete(party.id);
      const q = this.queue.indexOf(party);
      if (q >= 0) this.queue.splice(q, 1);
      if (party.arena && this.busy.get(party.arena.id) === party) { this.busy.delete(party.arena.id); this.startQueued(); }
    } else {
      if (party.leader === id) party.leader = party.members[0]!.id;
      this.pushState(party);
    }
    this.lobbiesDirty = true;
  }

  // --- utilidades -------------------------------------------------------------

  private member(p: PlayerState): Member {
    return { id: p.id, name: p.name, alive: true, ready: false, xp: 0, gold: 0, cleared: 0 };
  }

  private alivePlayers(party: Party): PlayerState[] {
    const out: PlayerState[] = [];
    for (const m of party.members) {
      if (!m.alive) continue;
      const p = this.o.getPlayer(m.id);
      if (p && p.hp > 0) out.push(p);
    }
    return out;
  }

  private freeArena(): ArenaDef | undefined {
    return this.arenas.find((a) => !this.busy.has(a.id));
  }

  private nearMaster(p: PlayerState): boolean {
    const m = this.o.master();
    return !!m && cheb(p.x, p.y, m.x, m.y) <= ARENA_LOBBY_RANGE;
  }

  private exitPoint(): Point {
    return this.o.layout.exit ?? this.o.master() ?? this.o.fallbackExit;
  }

  /** Tile livre mais perto de `c` (até raio 4; dentro de `rect`, se dado). */
  private freeTileNear(c: Point, selfId: string, rect?: TileRect): Point | null {
    for (let r = 0; r <= 4; r++)
      for (let y = c.y - r; y <= c.y + r; y++)
        for (let x = c.x - r; x <= c.x + r; x++)
          if (cheb(x, y, c.x, c.y) === r && (!rect || inRect(rect, x, y)) && this.o.isFree(x, y, selfId)) return { x, y };
    return null;
  }

  private lobbiesMsg(): ArenaLobbiesMsg {
    const lobbies: ArenaLobbySummary[] = [];
    for (const party of this.parties.values()) {
      if (party.inArena) continue;
      const lv = party.members.map((m) => this.o.getPlayer(m.id)?.level ?? 1);
      lobbies.push({
        id: party.id,
        leader: party.members.find((m) => m.id === party.leader)?.name ?? "?",
        members: party.members.map((m) => m.name),
        avgLevel: lv.length ? Math.round(lv.reduce((a, b) => a + b, 0) / lv.length) : 0,
      });
    }
    const now = this.now();
    let times: ReturnType<typeof arenaTimes> = {};
    try { if (this.o.getKv) times = arenaTimes({ getKv: this.o.getKv }, weekId(new Date(now))); } catch { /* sem ranking */ }
    const week = { mod: this.weekMod(now), endsAt: weekEndsAt(new Date(now)), ...times };
    return { lobbies, freeArenas: this.freeArenas, queue: this.queue.length, week };
  }

  private stateMsg(party: Party, forId: string): ArenaStateMsg {
    const me = party.members.find((m) => m.id === forId);
    const leader = party.members.find((m) => m.id === party.leader)?.name ?? "";
    return {
      state: {
        lobbyId: party.id,
        ...(party.arena && party.inArena ? { arenaId: party.arena.id } : {}),
        phase: party.phase,
        wave: party.wave,
        ...(party.phaseEndsAt ? { phaseEndsAt: party.phaseEndsAt, serverNow: this.now() } : {}),
        ...(party.phase === "fight" ? { monstersLeft: party.monstersLeft } : {}),
        members: party.members.map((m) => ({
          name: m.name, alive: m.alive, level: this.o.getPlayer(m.id)?.level ?? 1, ...(party.phase === "pause" ? { ready: m.ready } : {}),
        })),
        leader,
        earned: { xp: me?.xp ?? 0, gold: me?.gold ?? 0 },
        mod: party.startedAt ? party.mod : this.weekMod(this.now()),
        ...(party.startedAt ? { startedAt: party.startedAt } : {}),
      },
    };
  }

  /** Mudança de fase/membros: envia já. */
  private pushState(party: Party): void {
    this.flushState(party, this.now());
  }

  private flushState(party: Party, now: number): void {
    party.dirty = false;
    party.lastSentAt = now;
    for (const m of party.members) {
      if (this.partyOf.get(m.id) !== party) continue; // saiu/morreu: já recebeu o resultado
      this.o.send(m.id, S2C.ArenaState, this.stateMsg(party, m.id));
    }
  }

  private notice(id: string, text: string, kind: NoticeMsg["kind"]): void {
    this.o.send(id, S2C.Notice, { text, kind } satisfies NoticeMsg);
  }
}

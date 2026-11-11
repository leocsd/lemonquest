// Monstros: spawns (com respawn estilo Tibia), índice de ocupação O(1), passos e zonas proibidas.
// A IA (decisões) fica em ai.ts; o dano/morte em combat.ts (via `attackHook`).
import {
  DIAGONAL_COST, DIR_DELTA, ELITE, ELITE_CHANCE, HELP_RADIUS, TICK_MS, Dir, applySpeedPct, canBeElite, canStepTerrain, findObjects,
  isDiagonal, lineOfSight, monsterDef, objectTile,
  type CollisionGrid, type GroundSpeedGrid, type MonsterDef, type TiledMap,
} from "@lemonquest/shared";
import { MonsterState, type PlayerState } from "../state.ts";
import { updateMonster } from "./ai.ts";
import type { Point } from "./pathfinding.ts";
import { ErrorLog } from "./safe.ts";

export interface SpawnPoint {
  defId: string;
  x: number;
  y: number;
  count: number;
  radius: number;
}

/** Retângulo de tiles (inclusivo). */
export interface TileRect { x0: number; y0: number; x1: number; y1: number }

/** Zonas (objetos `zone`) que são zona de proteção (PZ): monstros não entram; ninguém ataca nem é atacado lá. */
export const PZ_ZONE_NAMES = ["Vila de Pedra Clara"];

/** Raio (Chebyshev) sem jogadores exigido para um respawn ("fora da tela", como no Tibia). */
export const RESPAWN_PLAYER_DIST = 7;
export const RESPAWN_RETRY_MS = 5000;
/**
 * Respawn adiado por jogador perto por mais que isto (a partir de quando venceu) nasce mesmo assim, mas nunca a menos
 * de RESPAWN_FORCE_DIST tiles: senão quem fica parado no meio do spawn esperando o bicho voltar o impede de voltar
 * (novato atrás do 5º rato da primeira missão). Chefes seguem só com a regra normal.
 */
export const RESPAWN_FORCE_AFTER_MS = 30_000;
export const RESPAWN_FORCE_DIST = 3;
/** Monstros ociosos sem jogador a esta distância dormem (não pensam nem andam). */
export const SLEEP_DIST = 16;

export type AiMode = "idle" | "chase" | "flee" | "return";

/** Estado de servidor de um monstro vivo (o que vai para a rede está em `s`). */
export interface Monster {
  s: MonsterState;
  def: MonsterDef;
  spawn: SpawnPoint;
  mode: AiMode;
  sleeping: boolean;
  stepEndsAt: number;
  nextThinkAt: number;
  nextWanderAt: number;
  nextAttackAt: number;
  path: Point[] | null;
  pathAt: number;
  pathGoal: Point;
  /** Desde quando está sem alvo válido em chase/flee (0 = tem alvo). */
  lostSince: number;
  /** Quando começou a voltar ao spawn. */
  returnSince: number;
  /**
   * Voltando ao spawn por ter passado da coleira (LEASH_DIST): imune a dano, não troca de alvo nem atende bando até
   * chegar (e lá cura). Sem isso, quem ataca de longe batia no monstro que voltava, ele virava para perseguir, passava
   * da coleira de novo e recomeçava a volta — nunca curava nem revidava ("dança da coleira", ciclo 14).
   */
  evading?: boolean;
  /** Último jogador que o feriu (passivos revidam). */
  lastAttackerId: string;
  /** Quem recebe o crédito do último golpe (dono, no caso de invocação): fica com o loot se ninguém estiver perto. */
  lastCreditId: string;
  /** Dano total por jogador (divisão de XP). */
  damageBy: Map<string, number>;
  /** Velocidade em % (condições haste/slow; 0 = enraizado). Ausente = 100. */
  speedPct?: number;
  /** Provocação (taunt): forçado a atacar `tauntBy` até `tauntUntil`. */
  tauntBy?: string;
  tauntUntil?: number;
  /** Coliseu: id da arena (monstro de onda: sem respawn, sem loot nem XP por abate — a recompensa é por onda). */
  arenaId?: number;
  /** Confinado a este retângulo (não dá passos para fora; sem leash/volta ao spawn; nunca dorme). */
  bounds?: TileRect;
  /** Só persegue/ataca jogadores aceitos por este filtro (membros da partida). */
  allow?: (p: PlayerState) => boolean;
  /** Multiplicador do dano dos ataques (elite/escala do coliseu). Ausente = 1. */
  dmgMult?: number;
  /** Solto por uma alavanca de quest (Aniquilação): XP e loot normais, mas sem respawn. */
  questLever?: string;
  /** Habilidades (monsterAbilities.ts): id da habilidade → quando fica pronta de novo. */
  abilityReadyAt?: Map<string, number>;
  /** Última cura em grupo recebida de um curandeiro (HEAL_ALLIES_LOCKOUT_MS). */
  healedAt?: number;
  /** Invocado por outro monstro (id do invocador): sem respawn, XP nem loot; some quando o invocador some. */
  minionOf?: string;
  /** Elite (nasceu com ELITE_CHANCE): vida ×2,5 e dano ×1,3 aqui; XP, ouro e loot maiores no abate. */
  elite?: boolean;
  /** Pedidos de reforço já feitos nesta vida (bits HELP_*), para gritar uma vez por motivo. */
  helpCalled?: number;
  /** Último dano recebido e início da fuga atual: fuga sem dano por FLEE_GIVE_UP_MS (ai.ts) desiste e volta. */
  hurtAt?: number;
  fleeSince?: number;
}

/** Motivos do pedido de reforço (uma vez cada por vida do monstro). */
export const HELP_FIRST_HIT = 1, HELP_HALF_HP = 2, HELP_FLEE = 4;
/** No máximo um grito de reforço por família neste intervalo (o reforço em si continua acontecendo). */
export const HELP_SHOUT_MS = 1000;

/** Criatura que pode ser alvo de monstro: jogador ou invocação de jogador. */
export type CreatureState = PlayerState | MonsterState;
export const isMonsterState = (c: CreatureState): c is MonsterState => "defId" in c;

/** O que precisamos do MapSchema (um Map comum serve nos testes). */
export interface MonsterCollection {
  set(key: string, value: MonsterState): unknown;
  delete(key: string): unknown;
}

export interface MonsterManagerOptions {
  grid: CollisionGrid;
  groundSpeed?: GroundSpeedGrid;
  spawns: SpawnPoint[];
  safeZones?: TileRect[];
  portals?: Point[];
  /** Predicado de portal (PortalSystem.isPortalTile). Avaliado UMA vez por tile na construção → máscara O(1). */
  isPortalTile?: (x: number, y: number) => boolean;
  collection: MonsterCollection;
  players: () => Iterable<PlayerState>;
  getPlayer: (id: string) => PlayerState | undefined;
  now?: () => number;
  rng?: () => number;
  defs?: (id: string) => MonsterDef | undefined;
  /**
   * Prazo de respawn dos chefes (epoch ms), guardado fora da memória: sem isso todo reinício do servidor recriava os
   * chefes mortos na hora (WorldRoom grava no kv `boss.respawnAt.<defId>`). `null` = chefe vivo (sem prazo).
   */
  bossRespawn?: { load(defId: string): number | undefined; save(defId: string, at: number | null): void };
  /** Aviso global (anúncio de boss). */
  notice?: (text: string, kind: "info" | "warn" | "good") => void;
  /** Chance de um monstro comum nascer elite (padrão ELITE_CHANCE; testes usam 0 ou 1). */
  eliteChance?: number;
  log?: (msg: string) => void;
  /** Log de erros (IA que lança): padrão ErrorLog com 1 linha/10 s. */
  errors?: ErrorLog;
}

// --- leitura do mapa ---------------------------------------------------------

const prop = (o: { properties?: { name: string; value: unknown }[] }, name: string) =>
  o.properties?.find((p) => p.name === name)?.value;

export function parseSpawns(map: TiledMap): SpawnPoint[] {
  return findObjects(map, "monster_spawn").map((o) => {
    const t = objectTile(o, map.tilewidth);
    return {
      defId: String(prop(o, "monster") ?? o.name ?? ""),
      x: t.x,
      y: t.y,
      count: Math.max(1, Math.floor(Number(prop(o, "count") ?? 1)) || 1),
      radius: Math.max(0, Math.floor(Number(prop(o, "radius") ?? 3)) || 0),
    };
  });
}

/** Zonas PZ: objetos `zone` com nome em PZ_ZONE_NAMES ou propriedade `pz` = true. */
export function parseSafeZones(map: TiledMap): TileRect[] {
  const t = map.tilewidth;
  return findObjects(map, "zone")
    .filter((o) => PZ_ZONE_NAMES.includes(o.name) || prop(o, "pz") === true)
    .map((o) => ({
      x0: Math.floor(o.x / t),
      y0: Math.floor(o.y / t),
      x1: Math.floor((o.x + Math.max(1, o.width) - 1) / t),
      y1: Math.floor((o.y + Math.max(1, o.height) - 1) / t),
    }));
}

export function parsePortalTiles(map: TiledMap): Point[] {
  return findObjects(map, "portal").map((o) => objectTile(o, map.tilewidth));
}

// --- gerenciador ---------------------------------------------------------------

const MASK_PZ = 1, MASK_PORTAL = 2;

export const cheb = (ax: number, ay: number, bx: number, by: number) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));

/** Distância máxima (tiles) do monstro, na morte, para levar loot/XP do abate (mesma da XP compartilhada do grupo). */
export const KILL_CREDIT_RANGE = 12;

/**
 * Quem deu dano, está online e perto do monstro agora: [id, dano]. Quem bateu e foi embora para longe não leva o
 * crédito. Se ninguém que bateu está perto, devolve todos os online (não se perde a XP de um abate por DoT/invocação).
 */
export function killCredit(m: Monster, getPlayer: (id: string) => PlayerState | undefined): [string, number][] {
  const online = [...m.damageBy].filter(([id]) => getPlayer(id));
  const near = online.filter(([id]) => { const p = getPlayer(id)!; return cheb(p.x, p.y, m.s.x, m.s.y) <= KILL_CREDIT_RANGE; });
  return near.length ? near : online;
}

export class MonsterManager {
  readonly grid: CollisionGrid;
  readonly rng: () => number;
  readonly now: () => number;
  /** Chamado pela IA quando um monstro ataca (combat.ts instala). */
  attackHook: (m: Monster, target: CreatureState, now: number) => void = () => {};
  /** Chamado pela IA no turno de ataque, antes do ataque básico: true = usou uma habilidade (monsterAbilities.ts instala). */
  abilityHook: (m: Monster, target: CreatureState, now: number) => boolean = () => false;
  /** IA das invocações (summons.ts instala). Sem hook, invocações ficam paradas. */
  summonAi: ((m: Monster, w: MonsterManager, now: number) => void) | null = null;
  /** Invocação morreu/sumiu (summons.ts limpa o registro do dono). */
  onSummonRemoved: ((m: Monster) => void) | null = null;
  /** Um monstro de bando pediu reforço (monsterAbilities.ts difunde o grito). */
  onCallHelp: ((m: Monster, now: number) => void) | null = null;

  private readonly W: number;
  private readonly mask: Uint8Array;
  private readonly occ = new Map<number, Monster>();
  private readonly list = new Map<string, Monster>();
  private readonly respawns: { spawn: SpawnPoint; at: number; due: number }[] = [];
  private readonly warned = new Set<string>();
  /** Último grito de reforço por família (HELP_SHOUT_MS). */
  private readonly lastShoutAt = new Map<string, number>();
  private nextId = 1;
  private readonly errors: ErrorLog;
  /** Jogadores do tick atual (≤ 32; varrer é mais barato que indexar). */
  playerList: PlayerState[] = [];
  /** Cache de linha de visão (a grade é estática; zerado a cada tick para não crescer sem limite). */
  private readonly losCache = new Map<number, boolean>();
  private readonly walkable = (x: number, y: number) => this.grid.isWalkable(x, y);

  constructor(private readonly o: MonsterManagerOptions) {
    this.grid = o.grid;
    this.W = o.grid.width;
    this.rng = o.rng ?? Math.random;
    this.now = o.now ?? Date.now;
    this.errors = o.errors ?? new ErrorLog();
    this.mask = new Uint8Array(o.grid.width * o.grid.height);
    for (const r of o.safeZones ?? []) {
      for (let y = Math.max(0, r.y0); y <= Math.min(o.grid.height - 1, r.y1); y++)
        for (let x = Math.max(0, r.x0); x <= Math.min(o.grid.width - 1, r.x1); x++) this.mask[y * this.W + x] |= MASK_PZ;
    }
    for (const p of o.portals ?? []) if (this.inBounds(p.x, p.y)) this.mask[p.y * this.W + p.x] |= MASK_PORTAL;
    if (o.isPortalTile) {
      for (let y = 0; y < o.grid.height; y++)
        for (let x = 0; x < o.grid.width; x++) if (o.isPortalTile(x, y)) this.mask[y * this.W + x] |= MASK_PORTAL;
    }
  }

  get size() { return this.list.size; }
  get(id: string): Monster | undefined { return this.list.get(id); }
  all(): IterableIterator<Monster> { return this.list.values(); }
  getPlayer(id: string): PlayerState | undefined { return id ? this.o.getPlayer(id) : undefined; }

  private inBounds(x: number, y: number) { return x >= 0 && y >= 0 && x < this.W && y < this.grid.height; }

  /** Zona de proteção (jogadores não atacam nem são atacados; monstros não entram). */
  inPz(x: number, y: number): boolean { return this.inBounds(x, y) && (this.mask[y * this.W + x] & MASK_PZ) !== 0; }
  /** Tile proibido para monstros (PZ ou portal). */
  isForbidden(x: number, y: number): boolean { return this.inBounds(x, y) && this.mask[y * this.W + x] !== 0; }
  monsterAt(x: number, y: number): Monster | undefined { return this.occ.get(y * this.W + x); }
  isMonsterAt(x: number, y: number): boolean { return this.occ.has(y * this.W + x); }

  playerAt(x: number, y: number): PlayerState | undefined {
    for (const p of this.playerList) if (p.x === x && p.y === y) return p;
    return undefined;
  }

  /**
   * Linha de visão entre dois tiles (paredes da grade de colisão bloqueiam; criaturas/NPCs não).
   * Simétrica; memorizada durante o tick (IA, ataques e magias perguntam o mesmo par várias vezes).
   */
  los(ax: number, ay: number, bx: number, by: number): boolean {
    if (Math.max(Math.abs(ax - bx), Math.abs(ay - by)) <= 1 && (ax === bx || ay === by)) return true;
    if (!this.inBounds(ax, ay) || !this.inBounds(bx, by)) return lineOfSight(ax, ay, bx, by, this.walkable);
    const n = this.W * this.grid.height;
    const a = ay * this.W + ax, b = by * this.W + bx;
    const key = a < b ? a * n + b : b * n + a;
    let hit = this.losCache.get(key);
    if (hit === undefined) {
      hit = lineOfSight(ax, ay, bx, by, this.walkable);
      if (this.losCache.size >= 50_000) this.losCache.clear();
      this.losCache.set(key, hit);
    }
    return hit;
  }

  /** Tile ocupado/proibido para um monstro entrar (o terreno é checado à parte). */
  blockedForMonster(x: number, y: number): boolean {
    return this.isForbidden(x, y) || this.isMonsterAt(x, y) || this.playerAt(x, y) !== undefined;
  }

  nearestPlayerDist(x: number, y: number): number {
    let best = Infinity;
    for (const p of this.playerList) { const d = cheb(x, y, p.x, p.y); if (d < best) best = d; }
    return best;
  }

  /** Alvo atacável por um monstro selvagem: jogador online, vivo e fora da PZ, ou invocação de jogador viva. */
  validTarget(id: string): CreatureState | undefined {
    if (!id) return undefined;
    const p = this.getPlayer(id);
    if (p) return p.hp > 0 && !this.inPz(p.x, p.y) ? p : undefined;
    const m = this.list.get(id);
    return m && m.s.ownerId && m.s.hp > 0 ? m.s : undefined;
  }

  /** O monstro pode mirar este id? (coliseu: só membros da partida e suas invocações). */
  allowedFor(m: Monster, id: string): boolean {
    if (!m.allow) return true;
    const p = this.getPlayer(id);
    if (p) return m.allow(p);
    const o = this.list.get(id);
    if (!o?.s.ownerId) return false;
    const owner = this.getPlayer(o.s.ownerId);
    return !!owner && m.allow(owner);
  }

  /** Monstro selvagem (não invocado) vivo com esse id. */
  wild(id: string): Monster | undefined {
    const m = id ? this.list.get(id) : undefined;
    return m && !m.s.ownerId && m.s.hp > 0 ? m : undefined;
  }

  /** Cria uma invocação (sem respawn) em (x,y). O tile deve estar livre. */
  spawnSummon(def: MonsterDef, x: number, y: number, ownerId: string, now = this.now()): Monster {
    const s = new MonsterState();
    s.id = `m${this.nextId++}`;
    s.defId = def.id;
    s.x = x;
    s.y = y;
    s.dir = Dir.S;
    s.hp = def.hp;
    s.maxHp = def.hp;
    s.ownerId = ownerId;
    const sp: SpawnPoint = { defId: def.id, x, y, count: 1, radius: 0 };
    const m: Monster = {
      s, def, spawn: sp, mode: "idle", sleeping: false,
      stepEndsAt: 0, nextThinkAt: now, nextWanderAt: now, nextAttackAt: now, path: null, pathAt: 0,
      pathGoal: { x: -1, y: -1 }, lostSince: 0, returnSince: 0, lastAttackerId: "", lastCreditId: "", damageBy: new Map(),
    };
    this.list.set(s.id, m);
    this.occ.set(y * this.W + x, m);
    this.o.collection.set(s.id, s);
    return m;
  }

  /** Cria todos os monstros dos spawns (chamar no onCreate). */
  spawnAll(now = this.now()): void {
    this.playerList = [...this.o.players()];
    for (const sp of this.o.spawns) {
      const def = this.def(sp.defId);
      if (!def) continue;
      const due = def.boss ? this.bossDue(def.id) : undefined;
      if (due && due > now) {
        // Chefe morto antes do reinício: volta no prazo original, não no boot.
        for (let i = 0; i < sp.count; i++) this.respawns.push({ spawn: sp, at: due, due });
        continue;
      }
      for (let i = 0; i < sp.count; i++) if (!this.spawnOne(sp, def, now)) this.respawns.push({ spawn: sp, at: now + RESPAWN_RETRY_MS, due: now + RESPAWN_RETRY_MS });
    }
  }

  /**
   * Evento de chefe: faz nascer já o chefe `defId` no spawn dele (a mais de RESPAWN_FORCE_DIST tiles de jogadores) e
   * cancela o respawn pendente desse spawn. "alive" = já há um vivo (nada muda); "unknown" = sem spawn/definição ou sem tile livre.
   */
  callBoss(defId: string, now = this.now()): "spawned" | "alive" | "unknown" {
    const def = this.def(defId);
    const sp = this.o.spawns.find((x) => x.defId === defId);
    if (!def || !sp) return "unknown";
    // Cópias do Coliseu, da alavanca ou invocadas por outro monstro não contam: o evento anunciaria um chefe que não está no covil.
    for (const m of this.list.values()) if (m.def.id === defId && !m.arenaId && !m.questLever && !m.minionOf) return "alive";
    for (let i = this.respawns.length - 1; i >= 0; i--) if (this.respawns[i]!.spawn === sp) this.respawns.splice(i, 1);
    if (this.spawnOne(sp, def, now, RESPAWN_FORCE_DIST)) return "spawned";
    this.respawns.push({ spawn: sp, at: now + RESPAWN_RETRY_MS, due: now + RESPAWN_RETRY_MS }); // sem tile livre agora: tenta de novo
    return "unknown";
  }

  private def(id: string): MonsterDef | undefined {
    const d = (this.o.defs ?? monsterDef)(id);
    if (!d && !this.warned.has(id)) {
      this.warned.add(id);
      (this.o.log ?? console.warn)(`[monsters] monstro desconhecido "${id}" no mapa — spawn ignorado`);
    }
    return d;
  }

  /** Tile livre aleatório no raio do spawn; `awayFromPlayers` exige nenhum jogador a RESPAWN_PLAYER_DIST. */
  findSpawnTile(sp: SpawnPoint, awayFromPlayers: boolean, def?: MonsterDef, minPlayerDist = RESPAWN_PLAYER_DIST): Point | null {
    const r = sp.radius;
    // Bonecos de treino nascem dentro da PZ do centro de treinamento (os demais monstros nunca).
    const blocked = (x: number, y: number) => def?.stationary
      ? (this.mask[y * this.W + x] & MASK_PORTAL) !== 0 || this.isMonsterAt(x, y) || this.playerAt(x, y) !== undefined
      : this.blockedForMonster(x, y);
    const ok = (x: number, y: number) =>
      this.grid.isWalkable(x, y) && this.inBounds(x, y) && !blocked(x, y) &&
      (!awayFromPlayers || this.nearestPlayerDist(x, y) > minPlayerDist);
    for (let i = 0; i < 40; i++) {
      const x = sp.x + Math.floor(this.rng() * (2 * r + 1)) - r;
      const y = sp.y + Math.floor(this.rng() * (2 * r + 1)) - r;
      if (ok(x, y)) return { x, y };
    }
    // Varredura completa (raio pequeno ou área quase cheia).
    for (let y = sp.y - r; y <= sp.y + r; y++) for (let x = sp.x - r; x <= sp.x + r; x++) if (ok(x, y)) return { x, y };
    return null;
  }

  private spawnOne(sp: SpawnPoint, def: MonsterDef, now: number, minPlayerDist = RESPAWN_PLAYER_DIST): Monster | null {
    const t = this.findSpawnTile(sp, true, def, minPlayerDist);
    if (!t) return null;
    const s = new MonsterState();
    s.id = `m${this.nextId++}`;
    s.defId = def.id;
    s.x = t.x;
    s.y = t.y;
    s.dir = Dir.S;
    s.hp = def.hp;
    s.maxHp = def.hp;
    const m: Monster = {
      s, def, spawn: sp, mode: "idle", sleeping: false,
      stepEndsAt: 0, nextThinkAt: now + Math.floor(this.rng() * 250), nextWanderAt: now + 2000 + this.rng() * 3000,
      nextAttackAt: 0, path: null, pathAt: 0, pathGoal: { x: -1, y: -1 }, lostSince: 0, returnSince: 0,
      lastAttackerId: "", lastCreditId: "", damageBy: new Map(),
    };
    // Elite: só monstros comuns dos spawns do mapa (nunca chefe, invocação, onda do Coliseu ou sala de quest).
    if (canBeElite(def) && this.rng() < (this.o.eliteChance ?? ELITE_CHANCE)) {
      m.elite = true;
      m.dmgMult = ELITE.dmg;
      s.elite = true;
      s.maxHp = Math.round(def.hp * ELITE.hp);
      s.hp = s.maxHp;
    }
    this.list.set(s.id, m);
    this.occ.set(t.y * this.W + t.x, m);
    this.o.collection.set(s.id, s);
    if (def.boss) {
      this.saveBossDue(def.id, null);
      this.o.notice?.(`${def.name} apareceu!`, "warn");
    }
    return m;
  }

  /** Remove o monstro (morte) e agenda o respawn. */
  kill(m: Monster, now = this.now()): void {
    if (!this.list.delete(m.s.id)) return;
    const key = m.s.y * this.W + m.s.x;
    if (this.occ.get(key) === m) this.occ.delete(key);
    this.o.collection.delete(m.s.id);
    if (m.s.ownerId) {
      // Invocação: sem respawn; ninguém mais a persegue.
      this.clearTargetsOf(m.s.id);
      this.onSummonRemoved?.(m);
      return;
    }
    if (m.arenaId || m.questLever || m.minionOf) return; // onda do coliseu / sala de quest / invocado por monstro: sem respawn
    this.respawns.push({ spawn: m.spawn, at: now + m.def.respawnMs, due: now + m.def.respawnMs });
    if (m.def.boss) this.saveBossDue(m.def.id, now + m.def.respawnMs);
  }

  // Prazo do chefe no banco: falha de disco não pode derrubar o abate (XP, aviso) nem repetir o nascimento a cada tick.
  private bossDue(id: string): number | undefined {
    try { return this.o.bossRespawn?.load(id); } catch (e) { this.errors.report("chefe/prazo", e); return undefined; }
  }

  private saveBossDue(id: string, at: number | null): void {
    try { this.o.bossRespawn?.save(id, at); } catch (e) { this.errors.report("chefe/prazo", e); }
  }

  /**
   * Monstro de onda do coliseu em (x,y) (tile livre): vida × hpMult, dano × dmgMult, confinado a `bounds`,
   * agressivo só com quem `allow` aceitar. Sem respawn.
   */
  spawnArena(def: MonsterDef, x: number, y: number,
    o: { arenaId: number; bounds: TileRect; allow: (p: PlayerState) => boolean; hpMult?: number; dmgMult?: number },
    now = this.now()): Monster {
    const s = new MonsterState();
    s.id = `m${this.nextId++}`;
    s.defId = def.id;
    s.x = x;
    s.y = y;
    s.dir = Dir.S;
    s.maxHp = Math.max(1, Math.round(def.hp * (o.hpMult ?? 1)));
    s.hp = s.maxHp;
    const m: Monster = {
      s, def, spawn: { defId: def.id, x, y, count: 1, radius: 0 }, mode: "idle", sleeping: false,
      stepEndsAt: 0, nextThinkAt: now, nextWanderAt: now + 2000, nextAttackAt: now + 500, path: null, pathAt: 0,
      pathGoal: { x: -1, y: -1 }, lostSince: 0, returnSince: 0, lastAttackerId: "", lastCreditId: "", damageBy: new Map(),
      arenaId: o.arenaId, bounds: o.bounds, allow: o.allow, dmgMult: o.dmgMult ?? 1,
    };
    this.list.set(s.id, m);
    this.occ.set(y * this.W + x, m);
    this.o.collection.set(s.id, s);
    return m;
  }

  /**
   * Monstro de sala de quest (alavanca da Aniquilação) em (x,y): confinado a `bounds`, sem respawn, com XP e loot
   * normais. Tile ocupado → o livre mais próximo dentro da sala; nenhum livre → null.
   */
  spawnQuest(def: MonsterDef, x: number, y: number, o: { leverId: string; bounds: TileRect }, now = this.now()): Monster | null {
    const inside = (tx: number, ty: number) => tx >= o.bounds.x0 && tx <= o.bounds.x1 && ty >= o.bounds.y0 && ty <= o.bounds.y1;
    let t: Point | null = null;
    for (let r = 0; r <= 3 && !t; r++) {
      for (let dy = -r; dy <= r && !t; dy++) for (let dx = -r; dx <= r; dx++) {
        const tx = x + dx, ty = y + dy;
        if (inside(tx, ty) && this.grid.isWalkable(tx, ty) && !this.isMonsterAt(tx, ty) && this.playerAt(tx, ty) === undefined) { t = { x: tx, y: ty }; break; }
      }
    }
    if (!t) return null;
    const m = this.spawnArena(def, t.x, t.y, { arenaId: 0, bounds: o.bounds, allow: () => true }, now);
    delete m.arenaId;
    delete m.allow;
    m.questLever = o.leverId;
    return m;
  }

  /**
   * Ajudante invocado por `master` num tile livre a até 2 do invocador (null = sem lugar). Herda a sala/arena do
   * invocador (limites, filtro de alvos, multiplicador de dano) e já nasce perseguindo o alvo dele.
   */
  spawnMinion(def: MonsterDef, master: Monster, now = this.now()): Monster | null {
    const b = master.bounds;
    let t: Point | null = null;
    for (let r = 1; r <= 2 && !t; r++) {
      for (let dy = -r; dy <= r && !t; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = master.s.x + dx, y = master.s.y + dy;
        if (!this.inBounds(x, y) || !this.grid.isWalkable(x, y) || this.blockedForMonster(x, y)) continue;
        if (b && (x < b.x0 || x > b.x1 || y < b.y0 || y > b.y1)) continue;
        if (!this.los(master.s.x, master.s.y, x, y)) continue;
        t = { x, y };
        break;
      }
    }
    if (!t) return null;
    const s = new MonsterState();
    s.id = `m${this.nextId++}`;
    s.defId = def.id;
    s.x = t.x;
    s.y = t.y;
    s.dir = master.s.dir;
    // Coliseu: mesma escala de vida do invocador (o dano vem de dmgMult, herdado abaixo). Fora dele (elite), vida normal.
    const scale = master.arenaId !== undefined ? master.s.maxHp / Math.max(1, master.def.hp) : 1;
    s.maxHp = Math.max(1, Math.round(def.hp * scale));
    s.hp = s.maxHp;
    const m: Monster = {
      s, def, spawn: { defId: def.id, x: master.spawn.x, y: master.spawn.y, count: 1, radius: master.spawn.radius },
      mode: "idle", sleeping: false, stepEndsAt: 0, nextThinkAt: now, nextWanderAt: now + 2000, nextAttackAt: now + 1000,
      path: null, pathAt: 0, pathGoal: { x: -1, y: -1 }, lostSince: 0, returnSince: 0, lastAttackerId: "", lastCreditId: "",
      damageBy: new Map(), minionOf: master.s.id,
      ...(master.arenaId !== undefined ? { arenaId: master.arenaId } : {}),
      ...(b ? { bounds: b } : {}), ...(master.allow ? { allow: master.allow } : {}),
      // Escala do Coliseu passa para o ajudante; o dano da elite não (ajudante de elite é um monstro comum).
      ...(master.arenaId !== undefined && master.dmgMult !== undefined ? { dmgMult: master.dmgMult } : {}),
    };
    const target = this.validTarget(master.s.targetId);
    if (target && this.allowedFor(m, target.id)) { m.mode = "chase"; s.targetId = target.id; }
    this.list.set(s.id, m);
    this.occ.set(t.y * this.W + t.x, m);
    this.o.collection.set(s.id, s);
    return m;
  }

  /** Remove um monstro sem respawn (fim de partida do coliseu). */
  despawn(m: Monster): void {
    if (!this.list.delete(m.s.id)) return;
    const key = m.s.y * this.W + m.s.x;
    if (this.occ.get(key) === m) this.occ.delete(key);
    this.o.collection.delete(m.s.id);
    this.clearTargetsOf(m.s.id);
  }

  /** Teleporta o monstro (volta forçada ao spawn quando preso). */
  place(m: Monster, x: number, y: number): void {
    const old = m.s.y * this.W + m.s.x;
    if (this.occ.get(old) === m) this.occ.delete(old);
    m.s.x = x;
    m.s.y = y;
    m.s.stepMs = 0;
    this.occ.set(y * this.W + x, m);
  }

  /** Tenta um passo (mesmas regras dos jogadores + zonas proibidas). */
  tryStep(m: Monster, dir: Dir, now: number): boolean {
    const s = m.s;
    const { dx, dy } = DIR_DELTA[dir];
    const tx = s.x + dx, ty = s.y + dy;
    const pct = m.speedPct ?? 100;
    if (pct <= 0) return false; // enraizado
    if (!canStepTerrain(this.grid, s.x, s.y, dx, dy) || this.blockedForMonster(tx, ty)) return false;
    const b = m.bounds;
    if (b && (tx < b.x0 || tx > b.x1 || ty < b.y0 || ty > b.y1)) return false;
    const speed = this.o.groundSpeed?.speedAt(s.x, s.y) ?? 100;
    const dur = applySpeedPct(Math.round(((isDiagonal(dir) ? m.def.stepMs * DIAGONAL_COST : m.def.stepMs) * speed) / 100), pct);
    const startAt = now - m.stepEndsAt <= TICK_MS ? m.stepEndsAt : now;
    m.stepEndsAt = startAt + dur;
    this.occ.delete(s.y * this.W + s.x);
    this.occ.set(ty * this.W + tx, m);
    s.x = tx;
    s.y = ty;
    s.dir = dir;
    s.stepMs = dur;
    return true;
  }

  /**
   * Um jogador (ou invocação) feriu o monstro: registra dano e faz revidar (inclusive passivos e quem estava voltando).
   * `creditId` = quem recebe o crédito de XP (o dono, no caso de invocação; "" = ninguém).
   */
  onDamaged(m: Monster, attackerId: string, amount: number, now: number, creditId = attackerId): void {
    if (m.def.stationary) return; // boneco de treino: não revida, não dá crédito
    m.hurtAt = now;
    if (amount > 0 && creditId) {
      m.damageBy.set(creditId, (m.damageBy.get(creditId) ?? 0) + amount);
      m.lastCreditId = creditId;
    }
    m.lastAttackerId = attackerId;
    m.sleeping = false;
    // Bando: o 1º golpe e a queda abaixo de 50% chamam os da mesma família (o dano ainda não foi descontado aqui).
    if (m.def.pack && !m.s.ownerId) {
      const flags = m.helpCalled ?? 0;
      if (!(flags & HELP_FIRST_HIT)) this.callForHelp(m, attackerId, now, HELP_FIRST_HIT);
      else if (!(flags & HELP_HALF_HP) && (m.s.hp - amount) * 2 < m.s.maxHp) this.callForHelp(m, attackerId, now, HELP_HALF_HP);
    }
    if (m.evading) return; // voltando pela coleira: não revida (o dano já foi barrado no CombatSystem)
    if (m.mode === "idle" || m.mode === "return" || ((m.mode === "chase" || m.mode === "flee") && !this.validTarget(m.s.targetId))) {
      if (this.validTarget(attackerId) && this.allowedFor(m, attackerId)) {
        m.mode = "chase";
        m.s.targetId = attackerId;
        m.lostSince = 0;
        m.path = null;
        m.nextThinkAt = Math.min(m.nextThinkAt, now);
      }
    }
  }

  /**
   * Pedido de reforço (`m.def.pack`): grita e faz os monstros da mesma família a até HELP_RADIUS tiles — ociosos,
   * voltando ou sem alvo válido — atacarem `attackerId` (ou o alvo atual de `m`). Uma vez por motivo (`reason`) por
   * vida. Retorna quantos atenderam.
   */
  callForHelp(m: Monster, attackerId: string, now: number, reason: number): number {
    const family = m.def.pack?.family;
    if (!family || ((m.helpCalled ?? 0) & reason)) return 0;
    m.helpCalled = (m.helpCalled ?? 0) | reason;
    // Um grito por família a cada HELP_SHOUT_MS: uma área que acerta 12 do bando não gera 12 gritos/efeitos.
    const last = this.lastShoutAt.get(family);
    if (last === undefined || now - last >= HELP_SHOUT_MS) { this.lastShoutAt.set(family, now); this.onCallHelp?.(m, now); }
    const target = this.validTarget(attackerId) ?? this.validTarget(m.s.targetId);
    if (!target) return 0;
    let n = 0;
    for (const o of this.list.values()) {
      if (o === m || o.s.ownerId || o.s.hp <= 0 || o.def.pack?.family !== family) continue;
      if (o.arenaId !== m.arenaId || o.questLever !== m.questLever) continue; // nunca puxa monstro de outra arena/sala
      if (cheb(o.s.x, o.s.y, m.s.x, m.s.y) > HELP_RADIUS || !this.allowedFor(o, target.id)) continue;
      const busy = (o.mode === "chase" || o.mode === "flee") && this.validTarget(o.s.targetId);
      if (busy || o.evading) continue;
      o.mode = "chase";
      o.s.targetId = target.id;
      o.lostSince = 0;
      o.path = null;
      o.sleeping = false;
      o.nextThinkAt = Math.min(o.nextThinkAt, now);
      n++;
    }
    return n;
  }

  /** Jogador saiu/morreu: ninguém mais o persegue. */
  clearTargetsOf(playerId: string): void {
    for (const m of this.list.values()) {
      if (m.s.targetId === playerId) { m.s.targetId = ""; m.path = null; }
      if (m.lastAttackerId === playerId) m.lastAttackerId = "";
    }
  }

  tick(now: number): void {
    this.playerList = [...this.o.players()];
    this.losCache.clear();
    this.processRespawns(now);
    for (const m of this.list.values()) {
      try {
        if (m.s.ownerId) this.summonAi?.(m, this, now);
        else updateMonster(m, this, now);
      } catch (e) {
        // Monstro com estado corrompido: remove (o respawn normal recria) em vez de derrubar o tick.
        this.errors.report(`monstro ${m.s.defId}`, e);
        try { this.clearTargetsOf(m.s.id); this.kill(m, now); } catch (e2) { this.errors.report("monstro/despawn", e2); }
      }
    }
  }

  private processRespawns(now: number) {
    for (let i = this.respawns.length - 1; i >= 0; i--) {
      const r = this.respawns[i];
      if (now < r.at) continue;
      const def = this.def(r.spawn.defId);
      if (!def) { this.respawns.splice(i, 1); continue; }
      const forced = !def.boss && now - r.due >= RESPAWN_FORCE_AFTER_MS;
      if (this.spawnOne(r.spawn, def, now, forced ? RESPAWN_FORCE_DIST : RESPAWN_PLAYER_DIST)) this.respawns.splice(i, 1);
      else r.at = now + RESPAWN_RETRY_MS;
    }
  }

  get pendingRespawns(): number { return this.respawns.length; }
}

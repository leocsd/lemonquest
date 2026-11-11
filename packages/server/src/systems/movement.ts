// Movimento dos jogadores (passos, caminhos, teleporte). Contrato público usado por WorldRoom — não mudar as assinaturas.
import {
  DIR_DELTA, TICK_MS, Dir, canStepTerrain, dirFromDelta, isNearSpawn, isValidDir, stepDuration,
  type CollisionGrid, type GroundSpeedGrid, type MoveMsg, type TurnMsg, type WalkToMsg,
} from "@lemonquest/shared";
import type { PlayerState } from "../state.ts";
import { findPath, PATH_MAX_DIST, type Point } from "./pathfinding.ts";

/** Estado de movimento por jogador que não precisa ser sincronizado. */
interface Mover {
  /** Instante (ms) em que o passo atual termina; antes disso o jogador não pode iniciar outro. */
  stepEndsAt: number;
  /** Direção segurada (null = soltou). */
  intent: Dir | null;
  /** Buffer de 1 passo: garante que um toque rápido (aperta+solta) ainda ande um tile. */
  pending: Dir | null;
  /** Passo da intenção antiga que o cliente já deu na predição (MoveMsg.at): sai antes de `pending`/`intent`. */
  owed: Dir | null;
  /** Caminho do clique (sem a posição atual). */
  path: Point[] | null;
  /** Já recalculou o caminho por bloqueio de jogador desde o último passo bem-sucedido. */
  recomputed: boolean;
  /** Já avisou (PlayerState.bump) a recusa atual: um aviso por bloqueio, não um por tick com a tecla segurada. */
  bumped: boolean;
}

export interface MovementOptions {
  /** Tile de spawn/templo: tiles a até 1 tile dele não bloqueiam por jogador. */
  spawn?: { x: number; y: number };
  /** Relógio (ms) usado ao processar mensagens (o tick recebe `now`). Padrão Date.now — injetável em testes. */
  now?: () => number;
  /** Velocidade do chão por tile (estilo Tibia). Ausente → todo chão é 100%. */
  groundSpeed?: GroundSpeedGrid;
}

export type StepResult = "ok" | "wall" | "player";

export class MovementSystem {
  private readonly players = new Map<string, PlayerState>();
  private readonly movers = new Map<string, Mover>();
  private readonly spawn: { x: number; y: number } | undefined;
  private readonly now: () => number;
  private readonly groundSpeed: GroundSpeedGrid | undefined;
  private extraBlocker: ((x: number, y: number) => boolean) | null = null;

  constructor(private readonly grid: CollisionGrid, opts: MovementOptions = {}) {
    this.spawn = opts.spawn;
    this.now = opts.now ?? Date.now;
    this.groundSpeed = opts.groundSpeed;
  }

  addPlayer(p: PlayerState): void {
    this.players.set(p.id, p);
    this.movers.set(p.id, { stepEndsAt: 0, intent: null, pending: null, owed: null, path: null, recomputed: false, bumped: false });
  }

  removePlayer(id: string): void {
    this.players.delete(id);
    this.movers.delete(id);
  }

  /** Bloqueio extra por tile (ex.: monstros vivos). Chamado em toda checagem de ocupação. */
  setExtraBlocker(fn: ((x: number, y: number) => boolean) | null): void {
    this.extraBlocker = fn;
  }

  /** Bloqueio por jogador (PvP: não entra na zona de proteção logo após atacar alguém). */
  private stepGuard: ((p: PlayerState, x: number, y: number) => boolean) | null = null;
  setStepGuard(fn: ((p: PlayerState, x: number, y: number) => boolean) | null): void {
    this.stepGuard = fn;
  }

  /** Move o jogador instantaneamente (portal, morte/respawn). Cancela intenção, buffer e caminho. */
  teleport(p: PlayerState, x: number, y: number): void {
    const m = this.movers.get(p.id);
    p.x = x;
    p.y = y;
    p.stepMs = 0;
    if (m) { m.intent = null; m.pending = null; m.owed = null; m.path = null; m.recomputed = false; m.stepEndsAt = 0; }
  }

  onMove(p: PlayerState, msg: MoveMsg): void {
    const m = this.movers.get(p.id);
    if (!m || !msg || typeof msg !== "object") return;
    if (typeof msg.seq !== "number" || !Number.isFinite(msg.seq)) return;
    const dir = msg.dir;
    if (dir !== null && !isValidDir(dir)) return;
    const now = this.now();
    // Recupera o atraso do tick com a intenção ANTIGA: se o passo já deveria ter começado antes desta
    // mensagem chegar (ex.: soltar a tecla logo após o cliente iniciar um passo), ele acontece.
    this.advance(p, m, now);
    // O cliente já deu (na predição) o próximo passo da intenção antiga: fica devido e sai quando o atual terminar.
    const at = msg.at;
    if (m.intent !== null && at && typeof at === "object" && Number.isInteger(at.x) && Number.isInteger(at.y)) {
      const { dx, dy } = DIR_DELTA[m.intent];
      if (at.x === p.x + dx && at.y === p.y + dy) m.owed = m.intent;
    }
    if (dir === null) {
      m.intent = null;
    } else {
      m.intent = dir;
      m.pending = dir;
      m.path = null;
      m.bumped = false; // tecla nova: o cliente prevê de novo, então uma nova recusa precisa de novo aviso
    }
    p.seq = Math.max(0, Math.min(0xffffffff, Math.floor(msg.seq)));
    // Livre? Começa já, sem esperar o próximo tick (o cliente já começou na predição).
    this.advance(p, m, now);
  }

  onWalkTo(p: PlayerState, msg: WalkToMsg): void {
    const m = this.movers.get(p.id);
    if (!m || !msg || typeof msg !== "object") return;
    // Cancelar (clique que virou "olhar"): só larga o caminho; o passo em andamento termina normalmente.
    if (msg.stop === true) { m.path = null; return; }
    const { x, y } = msg;
    if (!Number.isInteger(x) || !Number.isInteger(y)) return;
    if (x < 0 || y < 0 || x >= this.grid.width || y >= this.grid.height) return;
    if (Math.max(Math.abs(x - p.x), Math.abs(y - p.y)) > PATH_MAX_DIST) return;
    // Clique sobrepõe teclas: zera intenção/buffer para não brigar com o caminho.
    m.intent = null;
    m.pending = null;
    m.owed = null;
    m.recomputed = false;
    const path = findPath(this.grid, p, { x, y }, (bx, by) => this.isOccupied(bx, by, p.id));
    m.path = path && path.length ? path : null;
    this.advance(p, m, this.now());
  }

  onTurn(p: PlayerState, msg: TurnMsg): void {
    const m = this.movers.get(p.id);
    if (!m || !msg || !isValidDir(msg.dir)) return;
    if (this.now() < m.stepEndsAt) return;
    p.dir = msg.dir;
  }

  /** Chamado a cada tick (TICK_MS). `now` = Date.now(). */
  tick(now: number, players: Iterable<PlayerState>): void {
    for (const p of players) {
      const m = this.movers.get(p.id);
      if (m) this.advance(p, m, now);
    }
  }

  // --- movimento dirigido pelo servidor (perseguição do modo de batalha) ------------

  /** Livre para um passo dirigido pelo servidor: sem passo em curso, sem tecla, buffer ou caminho de clique. */
  isIdle(p: PlayerState, now: number): boolean {
    const m = this.movers.get(p.id);
    return !!m && now >= m.stepEndsAt && m.intent === null && m.pending === null && m.path === null;
  }

  /** A* de `p` até `goal` com os mesmos bloqueios do clique (o destino pode estar ocupado). */
  pathFor(p: PlayerState, goal: Point): Point[] | null {
    if (!this.movers.has(p.id)) return null;
    return findPath(this.grid, p, goal, (bx, by) => this.isOccupied(bx, by, p.id));
  }

  /**
   * Um passo dirigido pelo servidor (seguir alvo), com as mesmas regras/tempo/chão de um passo normal.
   * Só anda se o jogador estiver ocioso (isIdle). Retorna o resultado ("busy" = não estava livre).
   */
  follow(p: PlayerState, dir: Dir, now: number): StepResult | "busy" {
    const m = this.movers.get(p.id);
    if (!m || !this.isIdle(p, now)) return "busy";
    return this.tryStep(p, m, dir, now);
  }

  // --- internos -------------------------------------------------------------

  /** Se o jogador está livre, inicia o próximo passo (buffer > tecla segurada > caminho do clique). */
  private advance(p: PlayerState, m: Mover, now: number) {
    if (now < m.stepEndsAt) return;
    if (m.owed !== null) {
      const d = m.owed;
      m.owed = null;
      this.keyStep(p, m, d, now);
    } else if (m.pending !== null) {
      const d = m.pending;
      m.pending = null;
      this.keyStep(p, m, d, now);
    } else if (m.intent !== null) {
      this.keyStep(p, m, m.intent, now);
    } else if (m.path) {
      this.followPath(p, m, now);
    }
  }

  /** Passo pedido por tecla (o cliente já o previu): recusa avisa o cliente uma vez (bump) para corrigir na hora. */
  private keyStep(p: PlayerState, m: Mover, dir: Dir, now: number) {
    if (this.tryStep(p, m, dir, now) === "ok") { m.bumped = false; return; }
    if (m.bumped) return;
    m.bumped = true;
    p.bump = ((p.bump ?? 0) + 1) & 0xff;
  }

  private followPath(p: PlayerState, m: Mover, now: number) {
    const next = m.path![0];
    const dir = dirFromDelta(next.x - p.x, next.y - p.y);
    if (dir === null) { m.path = null; return; }
    const r = this.tryStep(p, m, dir, now);
    if (r === "ok") {
      m.path!.shift();
      if (m.path!.length === 0) m.path = null;
      m.recomputed = false;
      return;
    }
    if (r === "player" && !m.recomputed) {
      m.recomputed = true;
      const goal = m.path![m.path!.length - 1];
      const path = findPath(this.grid, p, goal, (bx, by) => this.isOccupied(bx, by, p.id));
      // Se o próprio destino está ocupado, o caminho novo continua terminando nele; paramos ao lado.
      m.path = path && path.length ? path : null;
      return;
    }
    m.path = null;
  }

  /** Tenta iniciar um passo. Bloqueado → apenas vira para a direção. */
  private tryStep(p: PlayerState, m: Mover, dir: Dir, now: number): StepResult {
    const { dx, dy } = DIR_DELTA[dir];
    const tx = p.x + dx, ty = p.y + dy;
    let result: StepResult = "ok";
    if (!canStepTerrain(this.grid, p.x, p.y, dx, dy)) result = "wall";
    else if (this.isOccupied(tx, ty, p.id)) result = "player";
    else if (this.stepGuard?.(p, tx, ty)) result = "wall";

    p.dir = dir;
    if (result !== "ok") return result;
    const speedPct = p.speedPct ?? 100;
    if (speedPct <= 0) return "wall"; // enraizado: só vira

    // Como no Tibia: a duração depende do chão do tile de ORIGEM (onde o passo começa).
    // speedPct (haste/slow) também entra na predição do cliente: stepDuration(level, dir, chão, p.speedPct).
    const dur = stepDuration(p.level, dir, this.groundSpeed?.speedAt(p.x, p.y), speedPct);
    // Cadência exata: se o passo anterior terminou há no máximo um tick, encadeia a partir do fim dele
    // (senão a quantização do tick de 50ms deixaria o andar contínuo mais lento que no cliente).
    // Passo "do zero" começa agora — nunca antes do input chegar, para o servidor não passar à frente
    // da predição do cliente.
    const startAt = now - m.stepEndsAt <= TICK_MS ? m.stepEndsAt : now;
    m.stepEndsAt = startAt + dur;
    p.x = tx;
    p.y = ty;
    p.stepMs = dur;
    return "ok";
  }

  private isOccupied(x: number, y: number, selfId: string): boolean {
    if (this.extraBlocker?.(x, y)) return true;
    if (isNearSpawn(this.spawn, x, y)) return false;
    for (const o of this.players.values()) {
      if (o.id !== selfId && o.x === x && o.y === y) return true;
    }
    return false;
  }
}

// Predição do próprio jogador. Lógica pura (sem Phaser) — espelha as regras do MovementSystem do servidor.
import { DIR_DELTA, TICK_MS, canStepTerrain, isNearSpawn, stepDuration, type CollisionGrid, type Dir, type GroundSpeedGrid } from "@lemonquest/shared";

export interface PredictWorld {
  grid: CollisionGrid;
  spawn: { x: number; y: number } | null;
  /** Velocidade do chão — a MESMA grade (mesmo mapa) que o servidor usa, para cadência idêntica. */
  groundSpeed?: GroundSpeedGrid;
  /** Há outro jogador (posição autoritativa conhecida) neste tile? */
  isOccupied(x: number, y: number): boolean;
}

export type PredictEvent =
  /** `at` = início do passo no relógio de `update` (encadeado: o fim do anterior), para o ator andar no mesmo tempo. */
  | { kind: "step"; x: number; y: number; dir: Dir; ms: number; at: number }
  | { kind: "turn"; dir: Dir };

/** Resultado da reconciliação com a posição vinda do servidor. */
export type Reconcile =
  | { kind: "confirmed" }                         // bate com um passo previsto
  | { kind: "same" }                              // nada a fazer
  | { kind: "external"; ms: number }              // servidor nos moveu sem predição (clique, passo extra)
  | { kind: "diverged" };                         // previsão errada: corrigir para a posição do servidor

interface Predicted { x: number; y: number; at: number; ms: number }

/**
 * Espera mínima pela confirmação de um passo previsto antes de desistir dele (LAN: ~100ms típicos). Era 450: com as
 * recusas avisadas na hora (PlayerView.bump) e o passo ao soltar garantido (MoveMsg.at), desistir por tempo só serve de
 * rede de segurança — e desistir cedo demais numa rede com perda puxava o boneco para trás e logo o devolvia.
 */
export const CONFIRM_TIMEOUT_MS = 800;
/** Teto da espera (latência muito alta: melhor corrigir do que andar "no escuro" por segundos). */
export const CONFIRM_TIMEOUT_MAX_MS = 2000;

export class Predictor {
  /** Posição prevista (após o último passo previsto). */
  x = 0;
  y = 0;
  dir: Dir = 4;
  level = 1;
  /** Velocidade efetiva (PlayerView.speedPct): haste > 100, slow < 100, 0 = enraizado (só vira). */
  speedPct = 100;
  stepEndsAt = 0;
  held: Dir | null = null;
  pending: Dir | null = null;
  private queue: Predicted[] = [];
  /** Média móvel do tempo previsão → confirmação (≈ ida e volta + tick). 0 = ainda sem amostra. */
  private confirmAvgMs = 0;
  /** Contagem das reconciliações (sonda E2E `__lq.predStats`: diagnóstico de lag). */
  readonly stats = { confirmed: 0, stale: 0, diverged: 0, external: 0, refused: 0 };
  /** Desvio médio dessa espera (como o RTTVAR do TCP): rede instável → espera maior antes de desistir. */
  private confirmDevMs = 0;

  constructor(private readonly world: PredictWorld) {}

  /**
   * Quanto esperar a confirmação antes de desistir da previsão: o mínimo da LAN, ou o dobro da latência medida (+2 ticks)
   * quando ela é maior — com timeout fixo, acima de ~450 ms de ida e volta TODO passo era desfeito (personagem "elástico").
   * Rede instável (VPN, Wi-Fi com perda): também média + 4 desvios, como o TCP; um engasgo de 250 ms numa ida e volta de
   * 150 ms puxava o boneco 2–3 tiles para trás e logo devolvia.
   */
  get confirmTimeoutMs(): number {
    const avg = this.confirmAvgMs;
    const t = Math.max(avg * 2 + TICK_MS * 2, avg + this.confirmDevMs * 4 + TICK_MS * 2);
    return Math.min(CONFIRM_TIMEOUT_MAX_MS, Math.max(CONFIRM_TIMEOUT_MS, Math.round(t)));
  }

  get unconfirmed(): number { return this.queue.length; }

  reset(x: number, y: number, dir: Dir) {
    this.x = x; this.y = y; this.dir = dir;
    this.queue = [];
    this.pending = null;
  }

  press(dir: Dir) { this.held = dir; this.pending = dir; }
  release() { this.held = null; }
  /** Esquece teclas (ex.: clique no mapa, que cancela a intenção no servidor). */
  clearIntent() { this.held = null; this.pending = null; }

  isFree(now: number) { return now >= this.stepEndsAt; }

  /** Chamado a cada frame. Inicia um passo local se livre e houver intenção. */
  update(now: number): PredictEvent | null {
    if (now < this.stepEndsAt) return null;
    let d: Dir | null;
    if (this.pending !== null) { d = this.pending; this.pending = null; }
    else d = this.held;
    if (d === null) return null;

    const { dx, dy } = DIR_DELTA[d];
    const tx = this.x + dx, ty = this.y + dy;
    const blocked = !canStepTerrain(this.world.grid, this.x, this.y, dx, dy)
      || (!isNearSpawn(this.world.spawn, tx, ty) && this.world.isOccupied(tx, ty));
    if (blocked || this.speedPct <= 0) {
      if (this.dir === d) return null;
      this.dir = d;
      return { kind: "turn", dir: d };
    }
    // Chão do tile de ORIGEM, igual ao MovementSystem do servidor.
    const ms = stepDuration(this.level, d, this.world.groundSpeed?.speedAt(this.x, this.y), this.speedPct);
    // Mesmo encadeamento do servidor: passos contínuos mantêm cadência exata.
    const startAt = now - this.stepEndsAt <= TICK_MS ? this.stepEndsAt : now;
    this.stepEndsAt = startAt + ms;
    this.x = tx; this.y = ty; this.dir = d;
    this.queue.push({ x: tx, y: ty, at: now, ms });
    return { kind: "step", x: tx, y: ty, dir: d, ms, at: startAt };
  }

  /** Nova posição autoritativa do próprio jogador. */
  onServerPos(sx: number, sy: number, stepMs: number, now: number): Reconcile {
    // Salto longo (portal/respawn): sem deslize — descarta previsões e deixa o ator dar snap. O servidor também larga a
    // tecla segurada no teleporte (MovementSystem.teleport): sem esquecê-la aqui, o cliente seguia prevendo passos do
    // outro lado do portal que nunca vinham e, 800 ms depois, puxava o boneco de volta. Anda de novo ao reapertar.
    if (Math.max(Math.abs(sx - this.x), Math.abs(sy - this.y)) > 2) {
      this.queue = []; this.pending = null; this.held = null; this.x = sx; this.y = sy; this.stepEndsAt = now;
      return { kind: "external", ms: stepMs };
    }
    const i = this.queue.findIndex((p) => p.x === sx && p.y === sy);
    if (i >= 0) {
      // Uma amostra só (pausa do servidor/GC) não infla a espera: teto de metade do máximo.
      const sample = Math.min(CONFIRM_TIMEOUT_MAX_MS / 2, now - this.queue[i]!.at);
      if (this.confirmAvgMs === 0) { this.confirmAvgMs = sample; this.confirmDevMs = sample / 2; }
      else {
        this.confirmDevMs = this.confirmDevMs * 0.75 + Math.abs(sample - this.confirmAvgMs) * 0.25;
        this.confirmAvgMs = this.confirmAvgMs * 0.8 + sample * 0.2;
      }
      this.queue.splice(0, i + 1);
      this.stats.confirmed++;
      return { kind: "confirmed" };
    }
    if (this.queue.length === 0) {
      if (sx === this.x && sy === this.y) return { kind: "same" };
      const far = Math.max(Math.abs(sx - this.x), Math.abs(sy - this.y)) > 1;
      this.x = sx; this.y = sy;
      // Com a tecla segurada o servidor anda sozinho e já começou este passo há ~meia ida e volta: contar o passo
      // inteiro a partir de agora deixava o cliente sempre um passo atrás, só seguindo o servidor (cada variação da
      // rede virava tranco) até soltar a tecla. Descontando esse atraso, o próximo passo é previsto a tempo e a
      // predição volta a liderar.
      const behind = this.held !== null ? Math.min(stepMs, Math.round(this.confirmAvgMs / 2)) : 0;
      this.stepEndsAt = far ? now : now + stepMs - behind;
      this.stats.external++;
      return { kind: "external", ms: stepMs };
    }
    this.diverge(sx, sy, now);
    this.stats.diverged++;
    return { kind: "diverged" };
  }

  /**
   * O servidor recusou um passo da tecla (PlayerView.bump): o que foi previsto adiante não vai acontecer. Volta já para a
   * posição do servidor (true = havia previsão a desfazer), sem esperar o tempo-limite.
   */
  onRefused(sx: number, sy: number, now: number): boolean {
    if (this.queue.length === 0) return false;
    this.diverge(sx, sy, now);
    this.stats.refused++;
    return true;
  }

  /** Previsão mais antiga sem confirmação há tempo demais → volta para a posição do servidor. */
  checkStale(sx: number, sy: number, now: number): boolean {
    const head = this.queue[0];
    if (!head || now - head.at < this.confirmTimeoutMs) return false;
    this.diverge(sx, sy, now);
    this.stats.stale++;
    return true;
  }

  private diverge(sx: number, sy: number, now: number) {
    this.queue = [];
    this.pending = null;
    this.x = sx; this.y = sy;
    this.stepEndsAt = now + 100; // tempo da correção suave
  }
}

// Modos de batalha (estilo Tibia): postura (ofensivo/equilibrado/defensivo → multiplicadores de dano causado/recebido)
// e perseguição (com alvo fora do alcance, anda até ele um passo por vez pelo MovementSystem). Também: seguir outro
// jogador (botão direito → Seguir) e ataque automático (escolhe sozinho o monstro mais próximo quando está sem alvo).
import { S2C, STANCE_DEALT, STANCE_TAKEN, dirFromDelta, type FightModeMsg, type FightStance, type FollowMsg, type NoticeMsg } from "@lemonquest/shared";
import type { PlayerState } from "../state.ts";
import type { MovementSystem } from "./movement.ts";
import { cheb, type MonsterManager } from "./monsters.ts";
import type { Point } from "./pathfinding.ts";

/** Recalcula o caminho de perseguição no máximo a cada isto (ms) — ou antes, se o alvo mudar de tile. */
export const CHASE_REPATH_MS = 300;
/** Movimento manual (Move/WalkTo) pausa a perseguição por isto (ms). */
export const CHASE_PAUSE_MS = 1500;
/** Distância máxima (tiles) para seguir um jogador; além disso o seguir é cancelado. */
export const FOLLOW_MAX_DIST = 15;
/**
 * Até onde (tiles) o ataque automático procura monstros quando o jogador está no modo seguir. 6 → 8 → 12 (2026-11-01,
 * pedidos do dono: "só 8 ficou pouco"): ~o que cabe na tela na horizontal (~30 tiles de largura, menos o painel da
 * direita). Sempre com linha de visão; o modo Seguir aproxima até o alcance das magias.
 */
export const AUTO_SEEK_DIST = 12;
/** Intervalo mínimo (ms) entre buscas de alvo do ataque automático. */
export const AUTO_SCAN_MS = 400;

const STANCES: FightStance[] = ["offensive", "balanced", "defensive"];

export const stanceDealt = (p: Pick<PlayerState, "stance">): number => STANCE_DEALT[p.stance] ?? 1;
export const stanceTaken = (p: Pick<PlayerState, "stance">): number => STANCE_TAKEN[p.stance] ?? 1;

export interface FightModeOptions {
  movement: Pick<MovementSystem, "isIdle" | "pathFor" | "follow">;
  monsters: Pick<MonsterManager, "wild"> & Partial<Pick<MonsterManager, "los" | "all" | "inPz">>;
  /** Alcance do ataque automático atual do jogador (arma/vocação). */
  attackRange: (p: PlayerState) => number;
  /** Para seguir jogadores e avisá-los (sem getPlayer o seguir fica desligado). */
  getPlayer?: (id: string) => PlayerState | undefined;
  send?: (sessionId: string, type: string, msg: unknown) => void;
  now?: () => number;
  /**
   * Monstro que o Estagiário do jogador largou por não conseguir chegar: o ataque automático também não o mira (senão
   * miraria de novo no tick seguinte e a rota ficaria parada). Ausente ou sem rota: nada é ignorado.
   */
  ignorado?: (playerId: string, monsterId: string) => boolean;
}

interface ChaseState {
  path: Point[] | null;
  at: number;
  /** Quem a rota atual persegue (id de monstro ou de jogador). */
  targetId: string;
  goal: Point;
  pausedUntil: number;
  /** Última busca de alvo do ataque automático. */
  scanAt: number;
}

export class FightModeSystem {
  private readonly st = new Map<string, ChaseState>();
  /** Perseguição forçada (Estagiário caçando): age como `p.chase` ligado sem mexer na escolha salva do jogador. */
  private readonly forced = new Set<string>();
  private readonly now: () => number;

  constructor(private readonly o: FightModeOptions) {
    this.now = o.now ?? Date.now;
  }

  /** Carrega postura/perseguição/ataque automático salvos. */
  load(p: PlayerState, stance?: unknown, chase?: unknown, auto?: unknown): void {
    p.stance = STANCES.includes(stance as FightStance) ? (stance as FightStance) : "balanced";
    // Personagem novo (nunca salvou o modo) começa seguindo o alvo: parado, ninguém alcança o rato que foge com pouca
    // vida e o novato não conhece o F8 (robô sem admin: cavaleiro 2 ratos e druida 4 em 10 min — a Lasca de Gelo deixa
    // o rato com ~3 de vida). À distância, seguir só aproxima até o alcance. Quem já escolheu fica como está.
    p.chase = chase === undefined ? true : chase === true;
    p.auto = auto === true;
    p.followId = "";
  }

  /** C2S.FightMode */
  onFightMode(p: PlayerState, msg: FightModeMsg): void {
    if (!msg || typeof msg !== "object") return;
    if (STANCES.includes(msg.stance)) p.stance = msg.stance;
    if (typeof msg.chase === "boolean") {
      p.chase = msg.chase;
      if (!msg.chase) this.st.delete(p.id);
    }
    if (typeof msg.auto === "boolean") p.auto = msg.auto;
  }

  /** C2S.Follow: segue (ou, com null/"", para de seguir) outro jogador. Escolher um alvo de ataque também cancela. */
  onFollow(p: PlayerState, msg: FollowMsg): void {
    if (!msg || typeof msg !== "object") return;
    const id = msg.targetId;
    if (id === null || id === "") { this.cancelFollow(p); return; }
    if (typeof id !== "string" || id === p.id) return;
    const t = this.o.getPlayer?.(id);
    if (!t || t.hp <= 0 || cheb(p.x, p.y, t.x, t.y) > FOLLOW_MAX_DIST) return;
    p.followId = id;
    p.targetId = "";
    this.st.delete(p.id);
    this.notice(p, `Você está seguindo ${t.name}.`);
  }

  /** Para de seguir (movimento manual, novo alvo de ataque, Esc). */
  cancelFollow(p: PlayerState): void {
    if (!p.followId) return;
    p.followId = "";
    const s = this.st.get(p.id);
    if (s) s.path = null;
  }

  /** Alvo novo escolhido: a perseguição começa já, sem esperar a pausa de um movimento manual anterior. */
  resume(id: string): void {
    const s = this.st.get(id);
    if (s) { s.pausedUntil = 0; s.path = null; }
  }

  /** Movimento manual: pausa a perseguição por CHASE_PAUSE_MS. */
  pause(id: string, now = this.now()): void {
    const s = this.state(id);
    s.pausedUntil = now + CHASE_PAUSE_MS;
    s.path = null;
  }

  removePlayer(id: string): void {
    this.st.delete(id);
    this.forced.delete(id);
  }

  /**
   * Liga/desliga a perseguição forçada: enquanto ligada, o tick persegue o alvo como se `p.chase === true`, sem mudar
   * `p.chase` (que é gravado e é a escolha do jogador quando ele mesmo joga).
   */
  forceChase(id: string, on: boolean): void {
    if (on) this.forced.add(id);
    else this.forced.delete(id);
  }

  private state(id: string): ChaseState {
    let s = this.st.get(id);
    if (!s) { s = { path: null, at: 0, targetId: "", goal: { x: -1, y: -1 }, pausedUntil: 0, scanAt: 0 }; this.st.set(id, s); }
    return s;
  }

  private notice(p: PlayerState, text: string): void {
    this.o.send?.(p.id, S2C.Notice, { text, kind: "info" } satisfies NoticeMsg);
  }

  /** Chamar a cada tick ANTES de MovementSystem.tick. */
  tick(now: number, players: Iterable<PlayerState>): void {
    for (const p of players) {
      if (p.hp <= 0) { p.followId = ""; const s = this.st.get(p.id); if (s) s.path = null; continue; }
      if (p.auto && !p.targetId) this.autoTarget(p, now);
      const range = Math.max(1, this.o.attackRange(p));
      // Alvo: monstro selvagem ou, no PvP, outro jogador.
      const t: Point | undefined = p.targetId ? this.o.monsters.wild(p.targetId)?.s ?? this.o.getPlayer?.(p.targetId) : undefined;
      // Seguindo um jogador: só para de andar para lutar quando o alvo já está ao alcance.
      if (p.followId && !(t && this.inReach(p, t, range))) { this.followStep(p, now); continue; }
      if (!(p.chase || this.forced.has(p.id)) || !t) { const s = this.st.get(p.id); if (s) s.path = null; continue; }
      const s = this.state(p.id);
      if (now < s.pausedUntil) continue;
      // Perseguindo, gruda no alvo (ao lado), qualquer que seja a vocação: quem ataca à distância também chega junto.
      if (cheb(p.x, p.y, t.x, t.y) <= 1) { s.path = null; continue; }
      this.stepToward(p, s, p.targetId, t, now);
    }
  }

  /** Alvo dentro do alcance do ataque (e, à distância, com linha de visão). */
  private inReach(p: PlayerState, t: Point, range: number): boolean {
    const sight = range <= 1 || !this.o.monsters.los || this.o.monsters.los(p.x, p.y, t.x, t.y);
    return cheb(p.x, p.y, t.x, t.y) <= range && sight;
  }

  /** Um passo em direção a `goal` (recalcula o caminho de tempos em tempos ou quando o destino muda). */
  private stepToward(p: PlayerState, s: ChaseState, key: string, goal: Point, now: number): void {
    if (!this.o.movement.isIdle(p, now)) return;
    const moved = s.goal.x !== goal.x || s.goal.y !== goal.y;
    const stale = now - s.at >= CHASE_REPATH_MS;
    if (s.targetId !== key || (stale && (!s.path?.length || moved))) {
      s.path = this.o.movement.pathFor(p, { x: goal.x, y: goal.y });
      s.at = now;
      s.targetId = key;
      s.goal = { x: goal.x, y: goal.y };
    }
    const next = s.path?.[0];
    if (!next) return;
    const dir = dirFromDelta(next.x - p.x, next.y - p.y);
    if (dir === null) { s.path = null; return; }
    const r = this.o.movement.follow(p, dir, now);
    if (r === "ok") s.path!.shift();
    else if (r !== "busy") s.path = null; // bloqueado: recalcula no próximo tick permitido
  }

  /** Anda atrás do jogador seguido até ficar ao lado dele. Sumiu/morreu/longe demais → cancela. */
  private followStep(p: PlayerState, now: number): void {
    const t = this.o.getPlayer?.(p.followId);
    if (!t || t.hp <= 0 || cheb(p.x, p.y, t.x, t.y) > FOLLOW_MAX_DIST) {
      this.notice(p, "Você parou de seguir: o jogador ficou fora de alcance.");
      this.cancelFollow(p);
      return;
    }
    const s = this.state(p.id);
    if (cheb(p.x, p.y, t.x, t.y) <= 1) { s.path = null; return; }
    this.stepToward(p, s, p.followId, { x: t.x, y: t.y }, now);
  }

  /** Ataque automático: sem alvo, escolhe o monstro mais próximo (com linha de visão, fora da zona de proteção). */
  private autoTarget(p: PlayerState, now: number): void {
    const mm = this.o.monsters;
    if (!mm.all || !mm.inPz || mm.inPz(p.x, p.y)) return;
    const s = this.state(p.id);
    if (now - s.scanAt < AUTO_SCAN_MS) return;
    s.scanAt = now;
    const range = Math.max(1, this.o.attackRange(p));
    // Parado (ou seguindo um jogador) só pega o que já dá para atacar; perseguindo, procura um pouco além.
    const reach = p.chase && !p.followId ? Math.max(range, AUTO_SEEK_DIST) : range;
    const ign = this.o.ignorado;
    const id = this.nearestTarget(p, reach, ign && ((m) => ign(p.id, m)));
    if (id) p.targetId = id;
  }

  /**
   * Monstro selvagem mais próximo a até `reach` tiles (vivo, não boneco de treino, fora da PZ, com linha de visão); ""
   * se nada (ou se o jogador está na PZ). A busca do ataque automático, exposta para o Estagiário escolher alvo
   * (`ignorar`: monstros que o Estagiário largou por não conseguir chegar; o ataque automático não passa nada).
   */
  nearestTarget(p: PlayerState, reach: number, ignorar?: (id: string) => boolean): string {
    const mm = this.o.monsters;
    if (!mm.all || !mm.inPz || mm.inPz(p.x, p.y)) return "";
    let best = "", bestD = Infinity;
    for (const m of mm.all()) {
      if (m.s.ownerId || m.s.hp <= 0 || m.def.invulnerable || ignorar?.(m.s.id)) continue;
      const d = cheb(p.x, p.y, m.s.x, m.s.y);
      if (d >= bestD || d > reach || mm.inPz(m.s.x, m.s.y)) continue;
      if (mm.los && !mm.los(p.x, p.y, m.s.x, m.s.y)) continue;
      best = m.s.id; bestD = d;
    }
    return best;
  }
}

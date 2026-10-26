// Invasões da Vila (ciclo 18): um evento semanal (`invasion` no GameEventDef, shared/data/events.ts) em que monstros
// saem de 4 pontos num anel a ~8 tiles da Vila (objetos `invasion_point` do mapa) e marcham até a borda da PZ.
// Ondas por fração da duração: a onda atual sai do relógio (início/fim do evento), não de estado volátil, então um
// reinício no meio da invasão volta na mesma onda. Cada onda escala com os presentes por faixa de level; a última traz
// um líder elite. Quem contribui (dano nos invasores + cura em outros jogadores) ganha Baú de Recompensa no fim.
// Dados e contas puras: servidor (server/systems/invasion.ts) e cliente (HUD, minimapa).
import { MONSTERS } from "./monsters.ts";

export type InvasionTier = "low" | "mid" | "high";

export interface InvasionTierDef {
  id: InvasionTier;
  /** Faixa de level dos jogadores que contam para esta faixa (inclusiva). */
  minLevel: number;
  maxLevel: number;
  /** Invasores comuns (ids em MONSTERS, sorteados um a um). */
  monsters: readonly string[];
  /** Líder elite da última onda quando esta é a faixa mais alta presente. */
  leader: string;
}

/**
 * Faixas (do plano: ≤ 12, 13–20, ≥ 21). Monstros do jogo perto da faixa: a baixa é a fauna dos arredores da Vila; a
 * média, a das Minas e da Floresta; a alta, goblins, macacos e piratas. O líder fica ~10 levels acima da faixa.
 */
export const INVASION_TIERS: readonly InvasionTierDef[] = [
  { id: "low", minLevel: 1, maxLevel: 12, monsters: ["slime", "bee", "wolf"], leader: "snake" },
  { id: "mid", minLevel: 13, maxLevel: 20, monsters: ["mine_larva", "spider", "bat", "slag_slime"], leader: "skeleton" },
  { id: "high", minLevel: 21, maxLevel: 9999, monsters: ["goblin", "kongra", "pirate_marauder", "skeleton"], leader: "pirate_buccaneer" },
];

export const invasionTierOf = (level: number): InvasionTier =>
  (INVASION_TIERS.find((t) => level >= t.minLevel && level <= t.maxLevel) ?? INVASION_TIERS[0]!).id;
export const invasionTierDef = (id: InvasionTier): InvasionTierDef => INVASION_TIERS.find((t) => t.id === id)!;

export interface InvasionWaveDef {
  /** Começa nesta fração da duração do evento (0 = no início). */
  at: number;
  /** Multiplicador do tamanho da onda. */
  mult: number;
  /** A onda traz o líder elite. */
  leader?: true;
}

/** 5 ondas (no evento de 40 min: 12h15, 12h23, 12h31, 12h39 e 12h47, esta com o líder). */
export const INVASION_WAVES: readonly InvasionWaveDef[] = [
  { at: 0, mult: 1 },
  { at: 0.2, mult: 1 },
  { at: 0.4, mult: 1.25 },
  { at: 0.6, mult: 1.25 },
  { at: 0.8, mult: 1.5, leader: true },
];

/** Invasores da faixa baixa em toda onda, mesmo sem ninguém presente (a Vila é invadida de qualquer jeito). */
export const INVASION_BASE = 3;
/** Invasores por jogador presente, da faixa dele, em cada onda (antes do multiplicador da onda). */
export const INVASION_PER_PLAYER = 2;
/** Teto de invasores vivos ao mesmo tempo (o que passar disso numa onda não nasce; só o líder nasce acima dele). */
export const INVASION_MAX_ALIVE = 40;
/**
 * Área da invasão: até isto (tiles) do retângulo da Vila. "Presente" (escala as ondas) = online, vivo, no controle e
 * FORA da PZ dentro desta área: quem fica na praça não luta e não pode inflar as ondas. A cura pontua com o curado aqui.
 */
export const INVASION_AREA_MARGIN = 20;
/** Os invasores ficam confinados ao retângulo da Vila + isto (os pontos estão a ~8). */
export const INVASION_BOUNDS_MARGIN = 16;
/** Os invasores só miram jogadores a até isto deles (e dentro do confinamento): atacam quem está perto. */
export const INVASION_AGGRO = 9;
/** Chegou à borda: a até isto (Chebyshev) do tile de destino da coluna (`goalX/goalY` do ponto). */
export const INVASION_GOAL_RADIUS = 2;

/** Contribuição mínima para o prêmio. */
export const INVASION_MIN_POINTS = 10;
/** Pontos por "barra de vida" (dano igual à vida-base do invasor, ou cura igual à vida máxima do curado). */
export const INVASION_POINTS_PER_BAR = 5;
/**
 * Vila defendida: pelo menos esta fração dos invasores que nasceram foi derrotada até o fim do evento E o líder (se
 * apareceu) caiu. Decisão do ciclo 18: contar abates é o que o jogador vê no HUD; "chegou à borda" não serve porque
 * a coluna para na borda de qualquer jeito (ela vira o ponto de encontro da defesa).
 */
export const INVASION_DEFEND_PCT = 0.75;
/** Baús de Recompensa por contribuir (≥ INVASION_MIN_POINTS) e o extra se a Vila foi defendida. */
export const INVASION_CHESTS = 1;
export const INVASION_DEFENDED_BONUS = 1;

/** Pontos por dano em invasor: 5 por vida-base inteira (o líder elite, com mais vida, vale mais). */
export const invasionDamagePoints = (dealt: number, baseHp: number): number =>
  dealt > 0 && baseHp > 0 ? (dealt / baseHp) * INVASION_POINTS_PER_BAR : 0;
/** Pontos por cura em outro jogador: 5 por vida máxima inteira do curado (só o que curou de fato). */
export const invasionHealPoints = (healed: number, targetMaxHp: number): number =>
  healed > 0 && targetMaxHp > 0 ? (healed / targetMaxHp) * INVASION_POINTS_PER_BAR : 0;

/**
 * Onda em andamento: índice da última onda já começada, -1 antes do início e null depois do fim (fim exclusivo).
 * Só depende do relógio: o mesmo instante dá a mesma onda antes e depois de um reinício.
 */
export function invasionWaveIndex(start: number, end: number, now: number): number | null {
  if (now >= end) return null;
  if (now < start || end <= start) return -1;
  const f = (now - start) / (end - start);
  let i = -1;
  INVASION_WAVES.forEach((w, k) => { if (w.at <= f) i = k; });
  return i;
}

/** Início da onda `i` (ms epoch). */
export const invasionWaveStart = (start: number, end: number, i: number): number =>
  start + Math.round((end - start) * (INVASION_WAVES[i]?.at ?? 1));

/** Início da onda seguinte, ou null se a atual é a última. */
export function invasionNextWaveAt(start: number, end: number, i: number): number | null {
  return i + 1 < INVASION_WAVES.length ? invasionWaveStart(start, end, i + 1) : null;
}

export type InvasionPresence = Record<InvasionTier, number>;

/** Presentes por faixa a partir dos levels de quem está na área. */
export function invasionPresence(levels: Iterable<number>): InvasionPresence {
  const out: InvasionPresence = { low: 0, mid: 0, high: 0 };
  for (const l of levels) out[invasionTierOf(l)]++;
  return out;
}

/** Vida do líder: ×1 com uma pessoa presente, +50% por pessoa a mais, até ×4 (fora o ×2,5 de elite). */
export const invasionLeaderHpMult = (present: number): number => Math.min(4, 1 + 0.5 * Math.max(0, present - 1));

export interface InvasionSpawnPlan {
  /** Invasores comuns, já intercalados entre as faixas (um corte pelo teto não apaga uma faixa inteira). */
  monsters: { defId: string; tier: InvasionTier }[];
  /** Líder elite (só na onda com `leader`). */
  leader?: { defId: string; tier: InvasionTier; hpMult: number };
}

/**
 * O que nasce na onda `i`: faixa baixa = (BASE + PER_PLAYER × presentes ≤ 12) × mult; média e alta = PER_PLAYER ×
 * presentes da faixa × mult (sem ninguém da faixa, nenhum: a faixa alta só aparece com jogador alto presente). O líder
 * é o da faixa mais alta presente (a baixa, sem ninguém). Os comuns são cortados para caber em INVASION_MAX_ALIVE −
 * `alive`; o líder ocupa a primeira vaga, mas nasce mesmo com o teto cheio (sumir com ele deixaria a última onda sem o
 * chefe que decide a defesa). `rng` sorteia o monstro de cada vaga.
 */
export function invasionWavePlan(i: number, presence: InvasionPresence, alive: number, rng: () => number): InvasionSpawnPlan {
  const wave = INVASION_WAVES[i];
  if (!wave) return { monsters: [] };
  let room = Math.max(0, INVASION_MAX_ALIVE - Math.max(0, alive));
  const plan: InvasionSpawnPlan = { monsters: [] };
  if (wave.leader) {
    const top = ([...INVASION_TIERS].reverse().find((t) => presence[t.id] > 0) ?? INVASION_TIERS[0]!);
    const present = presence.low + presence.mid + presence.high;
    plan.leader = { defId: top.leader, tier: top.id, hpMult: invasionLeaderHpMult(present) };
    room = Math.max(0, room - 1);
  }
  const counts: Record<InvasionTier, number> = {
    low: Math.round((INVASION_BASE + INVASION_PER_PLAYER * presence.low) * wave.mult),
    mid: Math.round(INVASION_PER_PLAYER * presence.mid * wave.mult),
    high: Math.round(INVASION_PER_PLAYER * presence.high * wave.mult),
  };
  const order: InvasionTier[] = ["high", "mid", "low"];
  while (room > 0 && order.some((t) => counts[t] > 0)) {
    for (const t of order) {
      if (room <= 0 || counts[t] <= 0) continue;
      const pool = invasionTierDef(t).monsters;
      plan.monsters.push({ defId: pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))]!, tier: t });
      counts[t]--;
      room--;
    }
  }
  return plan;
}

/** Placar para decidir se a Vila foi defendida. */
export interface InvasionScore { spawned: number; killed: number; leaderSpawned: boolean; leaderKilled: boolean }

export function villageDefended(s: InvasionScore): boolean {
  if (s.spawned <= 0) return false;
  if (s.leaderSpawned && !s.leaderKilled) return false;
  return s.killed >= Math.ceil(s.spawned * INVASION_DEFEND_PCT);
}

/** Baús ganhos com `points` de contribuição (0 abaixo do mínimo). */
export function invasionChests(points: number, defended: boolean): number {
  if (!(points >= INVASION_MIN_POINTS)) return 0;
  return INVASION_CHESTS + (defended ? INVASION_DEFENDED_BONUS : 0);
}

/** Lado da Vila de onde a coluna vem (para o aviso da onda): pelo ponto em relação ao centro. */
export function invasionSide(px: number, py: number, vila: { x0: number; y0: number; x1: number; y1: number }): string {
  const cx = (vila.x0 + vila.x1) / 2, cy = (vila.y0 + vila.y1) / 2;
  // Fora da faixa central (metade do lado) conta como aquele lado; nas duas, diagonal.
  const ns = py - cy < -(vila.y1 - vila.y0) / 4 ? 0 : py - cy > (vila.y1 - vila.y0) / 4 ? 2 : 1;
  const ew = px - cx < -(vila.x1 - vila.x0) / 4 ? 0 : px - cx > (vila.x1 - vila.x0) / 4 ? 2 : 1;
  return [["noroeste", "norte", "nordeste"], ["oeste", "centro", "leste"], ["sudoeste", "sul", "sudeste"]][ns]![ew]!;
}

/** Todo monstro citado existe e não é chefe (chefe tem respawn e aviso próprios). Para os testes de dados. */
export function invasionMonsterIds(): string[] {
  return [...new Set(INVASION_TIERS.flatMap((t) => [...t.monsters, t.leader]))];
}
export const isInvasionMonsterOk = (id: string): boolean => !!MONSTERS[id] && !MONSTERS[id]!.boss && !MONSTERS[id]!.stationary;

// --- protocolo ---------------------------------------------------------------------------------------------------

/** Estado da invasão em andamento, por jogador (a contribuição é a dele). */
export interface InvasionState {
  name: string;
  /** Janela do evento (ms epoch). */
  start: number;
  end: number;
  /** Onda atual (1..waves; 0 = ainda não começou). */
  wave: number;
  waves: number;
  nextWaveAt: number | null;
  /** Invasores vivos, que já nasceram e que foram derrotados. */
  alive: number;
  spawned: number;
  killed: number;
  /** Fração de abates que defende a Vila (INVASION_DEFEND_PCT). */
  defendPct: number;
  /** Líder da última onda: null antes de aparecer. Posição só enquanto vivo. */
  leader: { name: string; alive: boolean; x?: number; y?: number } | null;
  /** Pontos de onde os invasores saem (minimapa). */
  points: { x: number; y: number }[];
  /** Sua contribuição (arredondada para baixo) e o mínimo para o prêmio. */
  mine: number;
  goal: number;
}

/** Resultado no fim, para quem estava online (ou na entrega pendente, no login). */
export interface InvasionResult { defended: boolean; killed: number; spawned: number; points: number; chests: number }

/** S2C.Invasion: estado (null = nenhuma invasão) e, no fim, o resultado. */
export interface InvasionMsg { active: InvasionState | null; result?: InvasionResult }

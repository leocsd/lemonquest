// Salão de Minijogos (JJ-5, 2026-11-06; pedido do dono: "uma sala quadrada em que a pessoa tem que desviar de magias
// que são lançadas ... pode usar a imaginação para criar novos"). Duas salas quadradas de 11×11 no Salão (mapa: bloco
// próprio ligado à Vila). Nada aqui custa vida, XP ou item: cada jogador tem MINIGAME_LIVES vidas DO MINIJOGO e o golpe
// só tira uma delas. O chão avisa antes (tiles marcados por `warnMs`) e o golpe cai em quem ainda estiver em cima.
// Prêmio: Fichas do Salão (item), trocadas por cosméticos (tons de roupa exclusivos); nunca poder.
//   Chuva de Limões   desviar das ondas de padrões (linhas, anéis, xadrez, metade da sala...); quem dura mais vence.
//   Chão que Cai      o piso desmorona (das bordas para dentro, e alguns buracos soltos); último de pé vence.
//   Pega-Limão        60 s pegando limões do chão com chuva leve; levar golpe derruba 2 limões. Mais limões vence.
//   Genius do Escritório  cooperativo: as 4 placas acendem numa sequência e o time repete pisando nelas.
// Dados e contas puras (com rng injetável); o servidor está em server/systems/minigames.ts.
import type { SpellFx } from "./spells.ts";

export type MinigameId = "chuva" | "chao" | "pega" | "genius";
export const MINIGAME_IDS: readonly MinigameId[] = ["chuva", "chao", "pega", "genius"];

export interface MinigameDef {
  id: MinigameId;
  name: string;
  /** Uma linha para a janela. */
  desc: string;
  /** Como se ganha ponto (rótulo do placar). */
  scoreLabel: string;
  /** Todos contra a sala (true) ou cada um por si. */
  coop: boolean;
  /** Efeito do aviso/golpe no cliente (cores de spellFx). */
  fx: SpellFx;
}

export const MINIGAMES: Record<MinigameId, MinigameDef> = {
  chuva: {
    id: "chuva", name: "Chuva de Limões", scoreLabel: "ondas", coop: false, fx: "energy",
    desc: "Limões caem do teto em padrões: linhas, anéis, xadrez, meia sala. Saia dos tiles marcados antes do golpe. Quem dura mais vence.",
  },
  chao: {
    id: "chao", name: "Chão que Cai", scoreLabel: "rodadas", coop: false, fx: "earth",
    desc: "O piso desmorona aos poucos, das bordas para dentro. Saia dos tiles marcados e não pise nos buracos. O último de pé vence.",
  },
  pega: {
    id: "pega", name: "Pega-Limão", scoreLabel: "limões", coop: false, fx: "fire",
    desc: "60 segundos para pegar mais limões que os outros (o dourado vale 3). Cuidado com a garoa: levar um golpe derruba 2 limões.",
  },
  genius: {
    id: "genius", name: "Genius do Escritório", scoreLabel: "rodadas", coop: true, fx: "holy",
    desc: "Cooperativo: as quatro placas acendem numa sequência e o time repete pisando nelas, na ordem. Cada rodada, mais uma.",
  },
};

/** Lado da sala (tiles andáveis), igual nas duas salas do mapa. */
export const MINIGAME_ROOM_SIZE = 11;
export const MINIGAME_MAX_PLAYERS = 8;
/** Vidas do minijogo (não é a vida do personagem). */
export const MINIGAME_LIVES = 3;
/** Depois de um golpe, o jogador fica imune por isto (dois avisos seguidos não tiram duas vidas de uma vez). */
export const MINIGAME_HIT_GRACE_MS = 1200;
export const MINIGAME_COUNTDOWN_MS = 4000;
/** Mostra o resultado na sala por isto antes de devolver todo mundo ao Salão. */
export const MINIGAME_END_MS = 3000;
/** Fichas por dia por personagem (o resto da partida não paga; jogar continua valendo para o recorde). */
export const MINIGAME_DAILY_FICHAS = 40;
/** Item da ficha (shared/data/items.ts). */
export const FICHA_ID = "ficha_salao";

export type Rng = () => number;
const N = MINIGAME_ROOM_SIZE;
const C = (N - 1) / 2;
/** Tile local (0..N-1) → índice local. */
export const localIdx = (x: number, y: number): number => y * N + x;
const pick = <T>(xs: readonly T[], rng: Rng): T => xs[Math.min(xs.length - 1, Math.floor(rng() * xs.length))]!;

// --- Chuva de Limões ----------------------------------------------------------------------------------------------

export type ChuvaPatternId = "garoa" | "linhas" | "colunas" | "xadrez" | "aneis" | "cruz" | "quadrantes" | "metade" | "olho";
/** Onda mínima de cada padrão (os difíceis entram depois). */
export const CHUVA_PATTERNS: Record<ChuvaPatternId, number> = {
  garoa: 1, linhas: 1, colunas: 1, xadrez: 3, aneis: 3, cruz: 5, quadrantes: 5, metade: 8, olho: 12,
};
/** A Chuva para na onda 60: quem chegar lá vence "a sala". */
export const CHUVA_MAX_WAVE = 60;
/** Tiles livres mínimos de qualquer padrão (sempre há para onde correr). */
export const CHUVA_MIN_SAFE = 9;

/** Aviso (ms) e respiro depois do golpe (ms) da onda `wave` (1..). O "olho" (só 3×3 salvo) avisa mais cedo. */
export function chuvaTiming(wave: number, pattern?: ChuvaPatternId): { warnMs: number; gapMs: number } {
  const w = Math.max(1, wave);
  const warnMs = Math.max(750, 1600 - (w - 1) * 30) + (pattern === "olho" || pattern === "metade" ? 400 : 0);
  return { warnMs, gapMs: Math.max(350, 900 - w * 15) };
}

/** Padrão da onda: lista de índices locais atingidos. Nunca deixa menos que CHUVA_MIN_SAFE tiles livres. */
export function chuvaPattern(wave: number, rng: Rng): { id: ChuvaPatternId; tiles: number[] } {
  const ids = (Object.keys(CHUVA_PATTERNS) as ChuvaPatternId[]).filter((k) => CHUVA_PATTERNS[k] <= wave);
  const id = pick(ids, rng);
  const hit = (x: number, y: number): boolean => {
    switch (id) {
      case "garoa": return false; // preenchido abaixo
      case "linhas": return y % 2 === par;
      case "colunas": return x % 2 === par;
      case "xadrez": return (x + y) % 2 === par;
      case "aneis": return Math.max(Math.abs(x - C), Math.abs(y - C)) % 2 === par;
      case "cruz": return Math.abs(x - cx) <= 1 || Math.abs(y - cy) <= 1;
      case "quadrantes": return x !== C && y !== C && ((x < C) === (y < C)) === (par === 0);
      case "metade": return [x < C, x > C, y < C, y > C][side]!;
      case "olho": return Math.abs(x - cx) > 1 || Math.abs(y - cy) > 1;
    }
  };
  const par = rng() < 0.5 ? 0 : 1;
  const side = Math.floor(rng() * 4);
  const cx = 1 + Math.floor(rng() * (N - 2)), cy = 1 + Math.floor(rng() * (N - 2));
  let tiles: number[] = [];
  if (id === "garoa") {
    const density = Math.min(0.55, 0.3 + wave * 0.012);
    for (let i = 0; i < N * N; i++) if (rng() < density) tiles.push(i);
  } else {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (hit(x, y)) tiles.push(localIdx(x, y));
  }
  // Garantia: sobra sempre um bom pedaço livre (padrões cheios demais perdem tiles ao acaso).
  while (N * N - tiles.length < CHUVA_MIN_SAFE) tiles.splice(Math.floor(rng() * tiles.length), 1);
  return { id, tiles };
}

// --- Chão que Cai ------------------------------------------------------------------------------------------------

/** Quantos tiles caem, aviso e respiro na rodada `round` (1..). */
export function chaoTiming(round: number): { count: number; warnMs: number; gapMs: number } {
  const r = Math.max(1, round);
  return { count: Math.min(12, 3 + Math.floor(r / 2)), warnMs: Math.max(800, 1600 - (r - 1) * 40), gapMs: 600 };
}

/**
 * Tiles que caem nesta rodada, entre os que ainda estão de pé (`holes[i]` = já caiu). 70% saem da borda do que restou
 * (vizinho de buraco ou da parede), o resto de qualquer lugar: o chão "come" de fora para dentro, com sustos no meio.
 */
export function chaoPick(holes: ArrayLike<boolean | number>, count: number, rng: Rng): number[] {
  const standing: number[] = [];
  for (let i = 0; i < N * N; i++) if (!holes[i]) standing.push(i);
  const edge = (i: number): boolean => {
    const x = i % N, y = Math.floor(i / N);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= N || ny >= N || holes[localIdx(nx, ny)]) return true;
    }
    return false;
  };
  const out: number[] = [];
  const left = new Set(standing);
  while (out.length < count && left.size) {
    const pool = [...left];
    const edges = pool.filter(edge);
    const from = edges.length && rng() < 0.7 ? edges : pool;
    const i = pick(from, rng);
    out.push(i);
    left.delete(i);
  }
  return out.sort((a, b) => a - b);
}

// --- Pega-Limão --------------------------------------------------------------------------------------------------

export const PEGA_MS = 60_000;
/** Limões no chão ao mesmo tempo (mais gente, mais limão). */
export const pegaTarget = (players: number): number => Math.min(14, 4 + 2 * Math.max(1, players));
/** Um limão novo a cada isto (até o alvo). */
export const PEGA_SPAWN_MS = 450;
export const PEGA_GOLD_CHANCE = 0.1;
export const PEGA_GOLD_VALUE = 3;
/** Garoa: a cada isto, um padrão leve. Levar o golpe derruba PEGA_HIT_LOSS limões (voltam ao chão). */
export const PEGA_HAZARD_MS = 2800;
export const PEGA_HIT_LOSS = 2;

/** Garoa do Pega-Limão: densidade sobe de 15% a 30% ao longo do minuto (`t` = ms desde o início). */
export function pegaHazard(t: number, rng: Rng): { tiles: number[]; warnMs: number } {
  const f = Math.max(0, Math.min(1, t / PEGA_MS));
  const density = 0.15 + 0.15 * f;
  const tiles: number[] = [];
  for (let i = 0; i < N * N; i++) if (rng() < density) tiles.push(i);
  return { tiles, warnMs: Math.round(1300 - 400 * f) };
}

// --- Genius do Escritório ----------------------------------------------------------------------------------------

export interface GeniusPad { id: number; name: string; color: number; x0: number; y0: number }
/** Placas 2×2 nos cantos da sala (local). */
export const GENIUS_PADS: readonly GeniusPad[] = [
  { id: 0, name: "verde", color: 0x4ccf5a, x0: 1, y0: 1 },
  { id: 1, name: "amarela", color: 0xf2d13a, x0: 8, y0: 1 },
  { id: 2, name: "vermelha", color: 0xe0503c, x0: 1, y0: 8 },
  { id: 3, name: "azul", color: 0x4a7fe0, x0: 8, y0: 8 },
];
/** Placa do tile local (x, y), ou -1. */
export function geniusPadAt(x: number, y: number): number {
  for (const p of GENIUS_PADS) if (x >= p.x0 && x <= p.x0 + 1 && y >= p.y0 && y <= p.y0 + 1) return p.id;
  return -1;
}
/** Tamanho da sequência na rodada `round` (1..): começa com 3 e cresce uma por rodada. */
export const geniusLength = (round: number): number => Math.max(1, round) + 2;
/** Mostrar a sequência: cada placa acende por `onMs`, com `gapMs` entre elas (fica mais rápido). */
export function geniusShowTiming(round: number): { onMs: number; gapMs: number } {
  return { onMs: Math.max(350, 750 - (Math.max(1, round) - 1) * 30), gapMs: 220 };
}
/** Tempo para o próximo passo da resposta (sem pisar = erro). */
export const GENIUS_STEP_MS = 7000;
export const GENIUS_MAX_ROUND = 30;

// --- prêmio e recordes -------------------------------------------------------------------------------------------

/**
 * Fichas da partida (antes do teto diário). Jogou pouco e não fez ponto: nada (entrar e sair não rende).
 * `won` = venceu uma partida com 2+ jogadores (nos competitivos).
 */
export function minigameFichas(game: MinigameId, score: number, won: boolean, playedMs: number): number {
  if (score <= 0 && playedMs < 30_000) return 0;
  const s = Math.max(0, Math.floor(score));
  const bonus = won ? 2 : 0;
  switch (game) {
    case "chuva": return 1 + Math.min(6, Math.floor(s / 5)) + bonus;
    case "chao": return 1 + Math.min(4, Math.floor(s / 6)) + bonus;
    case "pega": return 1 + Math.min(5, Math.floor(s / 6)) + bonus;
    case "genius": return 1 + Math.min(6, Math.floor(s / 2));
  }
}

/** Quantas das `earned` fichas ainda cabem no dia (`already` = já ganhas hoje). */
export const fichasCapped = (earned: number, already: number): number =>
  Math.max(0, Math.min(earned, MINIGAME_DAILY_FICHAS - Math.max(0, already)));

export interface MinigameRecord { names: string[]; score: number; at: number }
export const MINIGAME_RECORDS_TOP = 5;
const groupKey = (r: MinigameRecord) => [...r.names].map((n) => n.toLowerCase()).sort().join("+");
/** Insere no top da semana: um registro por grupo (fica o melhor), maior placar e, no empate, quem fez antes. */
export function minigameRecordsInsert(list: readonly MinigameRecord[], r: MinigameRecord): MinigameRecord[] {
  if (!(r.score > 0)) return [...list];
  const k = groupKey(r);
  const old = list.find((x) => groupKey(x) === k);
  if (old && old.score >= r.score) return [...list];
  return [...list.filter((x) => groupKey(x) !== k), r]
    .sort((a, b) => b.score - a.score || a.at - b.at)
    .slice(0, MINIGAME_RECORDS_TOP);
}

// --- loja de fichas ----------------------------------------------------------------------------------------------

/** Tons de roupa exclusivos do Salão (shared/data/outfitTones.ts, `fichas` = preço; não se compram com ouro). */
export const MINIGAME_SHOP_TONES: readonly string[] = ["neon_lime", "sunset", "ocean_deep", "cherry"];

// --- protocolo ---------------------------------------------------------------------------------------------------

/** C2S.Minigame */
export type MinigameActionMsg =
  | { action: "join"; room: number; game?: MinigameId }
  | { action: "leave" }
  | { action: "start" }
  | { action: "buyTone"; toneId: string };

export type MinigamePhase = "idle" | "lobby" | "countdown" | "playing" | "ended";

export interface MinigameRoomSummary {
  id: number;
  game: MinigameId | null;
  phase: MinigamePhase;
  players: string[];
  host?: string;
}

/** S2C.MinigameLobby: a janela do Mestre do Salão. */
export interface MinigameLobbyMsg {
  rooms: MinigameRoomSummary[];
  /** Sala em que você está (lobby ou jogo). */
  mine?: number;
  records: Partial<Record<MinigameId, MinigameRecord[]>>;
  /** Fichas ganhas hoje (teto MINIGAME_DAILY_FICHAS). */
  fichasToday: number;
}

export interface MinigamePlayerView { id: string; name: string; lives: number; score: number; out: boolean }

/** S2C.Minigame: a partida em que você está (ausente/`null` = saiu). */
export interface MinigameStateMsg {
  room: number;
  game: MinigameId;
  phase: MinigamePhase;
  /** Fim da fase (contagem, Pega-Limão, resultado), no relógio do servidor (`serverNow`). */
  until?: number;
  serverNow: number;
  /** Onda/rodada atual. */
  round: number;
  /** Vidas do time (Genius). */
  teamLives?: number;
  players: MinigamePlayerView[];
  /** Canto da sala (tile global) para o cliente desenhar buracos, limões e placas. */
  ox: number;
  oy: number;
  /** Chão que Cai: índices locais que já caíram. */
  holes?: number[];
  /** Pega-Limão: [índice local, valor] dos limões no chão. */
  lemons?: [number, number][];
  /** Genius: placas visíveis; `step` = quantos passos da sequência o time já acertou nesta rodada; `showing` = vendo. */
  genius?: { step: number; length: number; showing: boolean };
  /** Resultado (fase "ended"): nomes do(s) vencedor(es) e as suas fichas. */
  winners?: string[];
  fichas?: number;
}

/** S2C.MinigameFx: aviso no chão, golpe ou placa acesa (tiles globais achatados x,y). */
export interface MinigameFxMsg {
  kind: "warn" | "hit" | "pad" | "fall";
  tiles: number[];
  ms?: number;
  fx: SpellFx;
  /** Cor da placa (Genius). */
  color?: number;
}

export type MinigameMsg = MinigameStateMsg | null;

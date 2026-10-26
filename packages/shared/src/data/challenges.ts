// Desafios da semana: lote de 9 metas medidas pelo ganho desde segunda-feira (ver weekly.ts). Toda semana saem 3, uma
// de cada grupo, num sorteio pela semana (igual para todos). Cada uma dá um prêmio escalado pelo level do começo da
// semana e, resgatando as 3, há um bônus. O que foi cumprido e não resgatado é entregue sozinho na virada (servidor:
// systems/weekly.ts guarda, systems/challenges.ts paga). Dados puros (servidor e cliente).
import { xpForLevel } from "../formulas.ts";
import { WEEKLY_EXTRA_KEYS, type WeekBaseline, type WeeklyExtraKey, type WeeklyKey } from "./weekly.ts";

export interface ChallengeReward {
  xp?: number;
  gold?: number;
  items?: { itemId: string; count: number }[];
}

/** O que um desafio mede: as 4 chaves do ranking semanal ou os contadores extras dos desafios. */
export type ChallengeKey = WeeklyKey | WeeklyExtraKey;

/**
 * Prêmio de um desafio para o level 1. O ouro cresce com o level (challengeGold) e a poção vem na maior faixa que o
 * level já pode beber (potionForLevel): a Poção de Vida Média (lv 15) dada a um lv 8 ficava sem uso.
 */
export interface ChallengePrize {
  gold: number;
  potion?: { kind: "heal" | "mana"; count: number };
}

export interface ChallengeDef {
  id: string;
  name: string;
  /** Texto da meta; `{n}` vira a quantidade. */
  desc: string;
  key: ChallengeKey;
  /** Grupo do sorteio (0 caça, 1 convívio, 2 folga): sai um de cada por semana. */
  group: 0 | 1 | 2;
  /** Quantidade fixa, ou função do level que o personagem tinha ao começar a semana. */
  target: number | ((level: number) => number);
  prize: ChallengePrize;
}

export const CHALLENGES_PER_WEEK = 3;

export const CHALLENGES: readonly ChallengeDef[] = [
  // Caça
  {
    id: "cacada", name: "Caçada da semana", desc: "Derrote {n} monstros", key: "kills", group: 0, target: 150,
    prize: { gold: 400, potion: { kind: "heal", count: 10 } },
  },
  {
    // Meta de XP = um level inteiro do personagem no começo da semana (nunca menos que 300).
    id: "evolucao", name: "Evolução da semana", desc: "Ganhe {n} de XP", key: "xp", group: 0,
    target: (level) => Math.max(300, xpForLevel(level + 1) - xpForLevel(level)),
    prize: { gold: 500, potion: { kind: "mana", count: 10 } },
  },
  {
    // Cada onda vencida conta (qualquer onda: o lv 1 também vence as primeiras).
    id: "coliseu", name: "Areia da semana", desc: "Vença {n} ondas do Coliseu", key: "waves", group: 0, target: 10,
    prize: { gold: 500, potion: { kind: "heal", count: 10 } },
  },
  // Convívio
  {
    id: "grupo", name: "Mutirão da semana", desc: "Derrote {n} monstros em grupo", key: "party", group: 1, target: 40,
    prize: { gold: 400, potion: { kind: "heal", count: 8 } },
  },
  {
    id: "quadro", name: "Quadro da semana", desc: "Cumpra {n} recompensas do Quadro", key: "bounties", group: 1, target: 6,
    prize: { gold: 400, potion: { kind: "mana", count: 8 } },
  },
  {
    id: "andarilho", name: "Andanças da semana", desc: "Ande {n} tiles", key: "steps", group: 1, target: 6000,
    prize: { gold: 300, potion: { kind: "heal", count: 6 } },
  },
  // Folga
  {
    id: "pescaria", name: "Pescaria da semana", desc: "Pesque {n} peixes", key: "fish", group: 2, target: 12,
    prize: { gold: 300, potion: { kind: "heal", count: 8 } },
  },
  {
    id: "banquete", name: "Banquete da semana", desc: "Coma {n} comidas", key: "foods", group: 2, target: 25,
    prize: { gold: 300, potion: { kind: "mana", count: 6 } },
  },
  {
    id: "descanso", name: "Descanso da semana", desc: "Treine offline por {n} minutos", key: "offline", group: 2, target: 180,
    prize: { gold: 300, potion: { kind: "mana", count: 6 } },
  },
];

/** Bônus por resgatar os 3 desafios da semana (ouro e poção escalam como os outros; XP = 20% do level, mín. 200). */
export const CHALLENGE_BONUS_PRIZE: ChallengePrize = { gold: 1500, potion: { kind: "heal", count: 5 } };
export const CHALLENGE_BONUS_XP_PCT = 0.2;

export const challengeDef = (id: string): ChallengeDef | undefined => CHALLENGES.find((c) => c.id === id);

export function challengeTarget(def: ChallengeDef, startLevel: number): number {
  return Math.max(1, Math.floor(typeof def.target === "function" ? def.target(Math.max(1, startLevel)) : def.target));
}

/** Ouro do prêmio: o valor do lv 1 vezes (1 + 10% por level acima do 1). Lv 11 = 2×, lv 101 = 11×. */
export function challengeGold(base: number, level: number): number {
  return Math.round(base * (1 + (Math.max(1, level) - 1) / 10));
}

/** Faixas de poção (id, level para beber), da menor para a maior. */
const POTIONS: Record<"heal" | "mana", readonly [string, number][]> = {
  heal: [["health_potion", 1], ["health_potion_medium", 15], ["health_potion_large", 30]],
  mana: [["mana_potion", 1], ["mana_potion_medium", 15], ["mana_potion_large", 30]],
};

/** A maior poção que o level já pode beber (prêmios nunca dão poção acima do level). */
export function potionForLevel(kind: "heal" | "mana", level: number): string {
  let id = POTIONS[kind][0]![0];
  for (const [p, lv] of POTIONS[kind]) if (level >= lv) id = p;
  return id;
}

/** Prêmio concreto para um level: ouro escalado e a poção da faixa. */
export function prizeFor(prize: ChallengePrize, level: number): ChallengeReward {
  const r: ChallengeReward = { gold: challengeGold(prize.gold, level) };
  if (prize.potion) r.items = [{ itemId: potionForLevel(prize.potion.kind, level), count: prize.potion.count }];
  return r;
}

export const challengeReward = (def: ChallengeDef, startLevel: number): ChallengeReward => prizeFor(def.prize, startLevel);

export function challengeBonus(startLevel: number): ChallengeReward {
  const lv = Math.max(1, startLevel);
  return { xp: Math.max(200, Math.round((xpForLevel(lv + 1) - xpForLevel(lv)) * CHALLENGE_BONUS_XP_PCT)), ...prizeFor(CHALLENGE_BONUS_PRIZE, lv) };
}

/** FNV-1a de 32 bits seguido de um passo do mulberry32 (bem espalhado para sementes vizinhas). */
function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  let t = (h + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
}

const WEEK_MS = 7 * 86_400_000;
/** Número absoluto da semana ISO "2026-W44" (semanas desde a segunda 29/12/1969); null se o texto não for uma semana. */
export function weekIndex(week: string): number | null {
  const m = /^(\d{4})-W(\d{2})$/.exec(week);
  if (!m) return null;
  const jan4 = Date.UTC(Number(m[1]), 0, 4);
  const monday1 = jan4 - ((new Date(jan4).getUTCDay() + 6) % 7) * 86_400_000;
  return Math.round((monday1 + (Number(m[2]) - 1) * WEEK_MS - Date.UTC(1969, 11, 29)) / WEEK_MS);
}

/** As 6 ordens possíveis de 3 desafios. */
const ORDERS: readonly (readonly [number, number, number])[] = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
const rawOrder = (g: number, cycle: number) => ORDERS[hash32(`desafios:${g}:${cycle}`) % ORDERS.length]!;

/**
 * Os 3 desafios da semana `week` ("2026-W44"): um de cada grupo, sempre os mesmos para a mesma semana (igual para
 * todos). Cada grupo anda em ciclos de 3 semanas com os 3 desafios numa ordem sorteada por ciclo; se o 1º de um ciclo
 * for o último do anterior, os dois primeiros trocam: o mesmo desafio nunca sai duas semanas seguidas.
 */
export function weekChallenges(week: string): ChallengeDef[] {
  const n = weekIndex(week) ?? hash32(week);
  const cycle = Math.floor(n / 3), pos = n % 3;
  return ([0, 1, 2] as const).map((g) => {
    const list = CHALLENGES.filter((c) => c.group === g);
    let order = rawOrder(g, cycle);
    if (order[0] === rawOrder(g, cycle - 1)[2]) order = [order[1], order[0], order[2]];
    return list[order[pos]!]!;
  });
}

const isExtraKey = (k: ChallengeKey): k is WeeklyExtraKey => (WEEKLY_EXTRA_KEYS as readonly string[]).includes(k);

/**
 * Ganho na semana `week` de um contador. 0 se a linha de base é de outra semana ou não tem o contador (linha de base
 * gravada antes do ciclo 18 sem `extra`: o servidor completa na próxima passada, e o ganho conta dali).
 */
export function challengeGain(base: WeekBaseline | undefined, cur: Record<ChallengeKey, number>, week: string, key: ChallengeKey): number {
  if (!base || base.id !== week) return 0;
  const b = isExtraKey(key) ? base.extra?.[key] : base[key];
  if (typeof b !== "number") return 0;
  return Math.max(0, (cur[key] ?? 0) - b);
}

/** Estado enviado ao cliente (S2C.Challenges). */
export interface ChallengeView {
  id: string;
  name: string;
  desc: string;
  progress: number;
  target: number;
  claimed: boolean;
  reward: ChallengeReward;
}
export interface ChallengesMsg {
  weekEndsAt: number;
  goals: ChallengeView[];
  bonus: { reward: ChallengeReward; claimed: boolean };
}

/** C2S.Challenge */
export type ChallengeActionMsg = { action: "list" } | { action: "claim"; id: string } | { action: "claimBonus" };

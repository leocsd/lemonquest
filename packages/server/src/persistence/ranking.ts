// Ranking público: top 10 por categoria a partir dos personagens salvos. Cache de 30 s. Só nomes de personagens.
import {
  RANKING_CACHE_S, RANKING_LIMIT, SKILL_START, weekEndsAt, weekGain, weekId,
  type RankingCategory, type RankingCategoryId, type RankingEntry, type RankingResponse,
} from "@lemonquest/shared";
import { achievementPoints } from "../systems/achievements.ts";
import { weeklyCounters } from "../systems/weekly.ts";
import { getKv, listRankingRows, nameKey, type RankingRow } from "./db.ts";

interface CatDef {
  id: RankingCategoryId;
  title: string;
  unit: string;
  /** Valor do personagem; <= 0 = fora do ranking. `week` = id da semana atual (categorias semanais). */
  value: (r: RankingRow, week: string) => number;
  /** Desempate (maior vence), depois nome. */
  tie?: (r: RankingRow) => number;
}

const skill = (k: "magic" | "melee" | "distance") => (r: RankingRow): number => {
  const lv = r.data.skills?.[k]?.level;
  return typeof lv === "number" && lv > SKILL_START[k] ? lv : 0;
};

const CATS: CatDef[] = [
  { id: "level", title: "Level", unit: "level", value: (r) => r.level, tie: (r) => r.xp },
  { id: "points", title: "Pontos de conquista", unit: "pontos", value: (r) => achievementPoints(r) },
  { id: "arena", title: "Coliseu: melhor onda", unit: "ondas", value: (r) => r.data.arenaBest ?? 0 },
  { id: "bosses", title: "Chefes derrotados", unit: "chefes", value: (r) => r.data.ach?.stats?.bosses ?? 0 },
  { id: "magic", title: "Magic Level", unit: "ML", value: skill("magic") },
  { id: "melee", title: "Corpo a corpo", unit: "skill", value: skill("melee") },
  { id: "distance", title: "Distância", unit: "skill", value: skill("distance") },
  { id: "fish", title: "Pescador", unit: "peixes", value: (r) => r.data.ach?.stats?.fish ?? 0 },
  // Semanais: ganho desde a segunda-feira (zeram na virada; quem não jogou na semana não aparece).
  { id: "week_xp", title: "Semana: XP", unit: "XP", value: (r, w) => weekGain(r.data.week, weeklyCounters(r), w, "xp") },
  { id: "week_kills", title: "Semana: abates", unit: "abates", value: (r, w) => weekGain(r.data.week, weeklyCounters(r), w, "kills") },
  { id: "week_fish", title: "Semana: peixes", unit: "peixes", value: (r, w) => weekGain(r.data.week, weeklyCounters(r), w, "fish") },
  { id: "week_bosses", title: "Semana: chefes", unit: "chefes", value: (r, w) => weekGain(r.data.week, weeklyCounters(r), w, "bosses") },
];

/** Posição de cada personagem (nameKey) em cada categoria em que tem valor: o "você: #N" da janela do jogo. */
export type RankingPositions = Map<string, NonNullable<RankingResponse["me"]>>;

/** Monta a resposta e as posições de todos (puro; testável). */
export function buildRankingFull(rows: RankingRow[], arenaServerBest: number, now: number): { res: RankingResponse; positions: RankingPositions } {
  const week = weekId(new Date(now));
  const positions: RankingPositions = new Map();
  const categories: RankingCategory[] = CATS.map((c) => {
    const scored = rows
      .map((r) => ({ r, v: Math.floor(c.value(r, week)), t: c.tie?.(r) ?? 0 }))
      .filter((x) => x.v > 0)
      .sort((a, b) => b.v - a.v || b.t - a.t || a.r.name.localeCompare(b.r.name, "pt-BR"));
    scored.forEach((x, i) => {
      const k = nameKey(x.r.name);
      const m = positions.get(k) ?? {};
      m[c.id] = { rank: i + 1, value: x.v };
      positions.set(k, m);
    });
    const entries: RankingEntry[] = scored.slice(0, RANKING_LIMIT).map((x, i) => ({
      rank: i + 1, name: x.r.name, vocation: x.r.vocation, level: x.r.level, value: x.v,
    }));
    return { id: c.id, title: c.title, unit: c.unit, entries };
  });
  return { res: { generatedAt: now, arenaServerBest, weekEndsAt: weekEndsAt(new Date(now)), categories }, positions };
}

/** Monta a resposta a partir das linhas (puro; testável). */
export function buildRanking(rows: RankingRow[], arenaServerBest: number, now: number): RankingResponse {
  return buildRankingFull(rows, arenaServerBest, now).res;
}

let cache: { at: number; body: string; res: RankingResponse; positions: RankingPositions } | null = null;

/**
 * JSON do ranking, em cache por RANKING_CACHE_S segundos. `me` (nome de personagem, da janela do jogo) acrescenta a
 * posição dele em cada categoria (`me`), tirada do mesmo cache; nome desconhecido = resposta sem `me`.
 */
export function rankingJson(now = Date.now(), me?: string): string {
  if (!cache || now - cache.at >= RANKING_CACHE_S * 1000) {
    const best = Number(getKv("arena.serverBest") ?? 0);
    const { res, positions } = buildRankingFull(listRankingRows(), Number.isFinite(best) ? best : 0, now);
    cache = { at: now, body: JSON.stringify(res), res, positions };
  }
  const mine = me ? cache.positions.get(nameKey(me)) : undefined;
  return mine ? JSON.stringify({ ...cache.res, me: mine }) : cache.body;
}

export function resetRankingCache(): void { cache = null; }

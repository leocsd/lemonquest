// Coliseu competitivo (2026-11-06; regras em shared/data/arena.ts): ranking semanal de ONDAS (toda partida que termina
// entra, não só quem vence as 70) e o prêmio do 1º lugar na virada da semana. Tudo no kv: uma chave por semana com o top
// ARENA_WEEK_TOP, a última semana já premiada e, por personagem, os baús esperando o próximo login (o prêmio sai na
// virada, quando o grupo pode estar offline). Puro sobre o kv: o ArenaSystem grava, o WorldRoom coroa e entrega.
import {
  ARENA_WEEK_PRIZE_CHESTS, arenaWavesInsert, weekId,
  type ArenaWaveRecord,
} from "@lemonquest/shared";

export interface WeeklyKv { getKv(key: string): string | undefined; setKv(key: string, value: string): void }

export const kvArenaWavesWeek = (week: string): string => `arena.waves.week.${week}`;
/** Última semana cujo 1º lugar já foi premiado. */
export const KV_ARENA_WAVES_CROWNED = "arena.waves.crowned";
/** Baús de prêmio esperando o login de `name`. */
export const kvArenaPrize = (name: string): string => `arena.prize.${name.trim().toLowerCase()}`;

/** Ranking da semana (validado: registro com campo faltando ou lixo some). */
export function arenaWavesOf(kv: Pick<WeeklyKv, "getKv">, week: string): ArenaWaveRecord[] {
  try {
    const raw = JSON.parse(kv.getKv(kvArenaWavesWeek(week)) ?? "[]") as Partial<ArenaWaveRecord>[];
    if (!Array.isArray(raw)) return [];
    return raw.filter((r): r is ArenaWaveRecord =>
      !!r && Array.isArray(r.names) && r.names.every((n) => typeof n === "string") && typeof r.wave === "number" && r.wave >= 1 &&
      typeof r.ms === "number" && r.ms >= 0 && typeof r.week === "string" && typeof r.at === "number");
  } catch {
    return [];
  }
}

/** Grava a partida no ranking da semana dela. Devolve a posição (1 = primeiro) ou 0 se não entrou. */
export function submitArenaWaves(kv: WeeklyKv, rec: ArenaWaveRecord): number {
  const before = arenaWavesOf(kv, rec.week);
  const after = arenaWavesInsert(before, rec);
  if (JSON.stringify(before) !== JSON.stringify(after)) kv.setKv(kvArenaWavesWeek(rec.week), JSON.stringify(after));
  return after.indexOf(after.find((r) => r.at === rec.at && r.wave === rec.wave && r.ms === rec.ms)!) + 1;
}

/**
 * Virada da semana: o 1º lugar da semana anterior (a que ainda não foi premiada) ganha ARENA_WEEK_PRIZE_CHESTS baús
 * cada, guardados para o próximo login. Devolve o registro premiado (null se nada mudou ou ninguém jogou).
 */
export function crownArenaWaves(kv: WeeklyKv, now: Date, announce?: (text: string) => void): ArenaWaveRecord | null {
  const cur = weekId(now);
  const done = kv.getKv(KV_ARENA_WAVES_CROWNED);
  if (done === cur) return null;
  kv.setKv(KV_ARENA_WAVES_CROWNED, cur);
  if (!done) return null; // primeira vez (instalação nova): só marca a semana
  const top = arenaWavesOf(kv, done)[0];
  if (!top) return null;
  for (const name of top.names) {
    const k = kvArenaPrize(name);
    kv.setKv(k, String((Number(kv.getKv(k)) || 0) + ARENA_WEEK_PRIZE_CHESTS));
  }
  announce?.(`🏟️ Coliseu, semana ${done}: ${top.names.join(", ")} no 1º lugar com ${top.wave} ondas — ${ARENA_WEEK_PRIZE_CHESTS} Baús de Recompensa para cada um!`);
  return top;
}

/** Baús esperando `name` (e zera). */
export function takeArenaPrize(kv: WeeklyKv, name: string): number {
  const k = kvArenaPrize(name);
  const n = Math.max(0, Math.floor(Number(kv.getKv(k)) || 0));
  if (n > 0) kv.setKv(k, "0");
  return n;
}

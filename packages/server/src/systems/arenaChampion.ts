// Ranking de tempo do Coliseu e título rotativo "Campeão do Coliseu" (ciclo 16). O ArenaSystem grava aqui o tempo de
// cada partida que vence as ARENA_MAX_WAVE ondas: o melhor de todos e o melhor de cada semana ISO, no kv (uma chave por
// semana, para a coroação da virada ler a semana que acabou mesmo que uma partida da semana nova já tenha terminado).
// Na virada da semana (mesmo passo do weeklyChampion, no WorldRoom), o grupo do melhor tempo da semana que acabou leva
// o título até a próxima virada; quem não repetiu perde. Puro: o host é o mesmo do Campeão da Semana.
import { ARENA_MAX_WAVE, ARENA_MODS, arenaTimeText, arenaWeekMod, weekId, type ArenaModId, type ArenaTimeRecord } from "@lemonquest/shared";
import { revokeUnlock, type ChampionHost } from "./weeklyChampion.ts";

export const ARENA_CHAMPION_TITLE = "campeao_coliseu";
export const ARENA_CHAMPION_UNLOCK = `title:${ARENA_CHAMPION_TITLE}`;
/** Melhor tempo de todos. */
export const KV_ARENA_TIME_BEST = "arena.time.best";
/** Melhor tempo da semana `week` ("2026-W43"). */
export const kvArenaTimeWeek = (week: string): string => `arena.time.week.${week}`;
const KV_CHAMP_WEEK = "arena.champion.id";
const KV_CHAMP_NAMES = "arena.champion.names";

export type ArenaKv = Pick<ChampionHost, "getKv" | "setKv">;
export type ArenaChampionHost = Pick<ChampionHost, "getKv" | "setKv" | "record" | "grant" | "revoke" | "announce">;

/** Registro gravado no kv, validado (null se faltar campo ou vier lixo). */
export function parseArenaTime(raw: string | undefined): ArenaTimeRecord | null {
  if (!raw) return null;
  try {
    const r = JSON.parse(raw) as Partial<ArenaTimeRecord>;
    if (typeof r.ms !== "number" || !(r.ms > 0) || !Array.isArray(r.names) || typeof r.week !== "string") return null;
    const names = r.names.filter((n): n is string => typeof n === "string");
    const mod: ArenaModId = typeof r.mod === "string" && Object.hasOwn(ARENA_MODS, r.mod) ? r.mod : arenaWeekMod(r.week);
    return { ms: Math.round(r.ms), names, week: r.week, mod, at: typeof r.at === "number" ? r.at : 0 };
  } catch {
    return null;
  }
}

/**
 * Grava o tempo de uma partida completa se ele bate o melhor da semana (e/ou o de todos). Empate não troca: quem fez
 * primeiro fica. Devolve o maior recorde batido: "server" (de todos, que também é o da semana) ou "week".
 */
export function submitArenaTime(kv: ArenaKv, rec: ArenaTimeRecord): "server" | "week" | undefined {
  const weekKey = kvArenaTimeWeek(rec.week);
  const week = parseArenaTime(kv.getKv(weekKey));
  if (week && week.ms <= rec.ms) return undefined;
  const json = JSON.stringify(rec);
  kv.setKv(weekKey, json);
  const best = parseArenaTime(kv.getKv(KV_ARENA_TIME_BEST));
  if (best && best.ms <= rec.ms) return "week";
  kv.setKv(KV_ARENA_TIME_BEST, json);
  return "server";
}

/** Melhor tempo de todos e o da semana `week`. */
export function arenaTimes(kv: Pick<ChampionHost, "getKv">, week: string): { best?: ArenaTimeRecord; record?: ArenaTimeRecord } {
  const best = parseArenaTime(kv.getKv(kvArenaTimeWeek(week)));
  const record = parseArenaTime(kv.getKv(KV_ARENA_TIME_BEST));
  return { ...(best ? { best } : {}), ...(record ? { record } : {}) };
}

const joinNames = (names: readonly string[]) =>
  (names.length > 1 ? `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}` : names[0] ?? "?");

/**
 * Coroa o grupo do melhor tempo da semana que acabou (se a semana mudou desde a última coroação) e revoga os campeões
 * da anterior que não repetiram. Chamar junto com `crownWeek` (virada e boot). Devolve os nomes coroados, ou null se
 * não era hora.
 */
export function crownArenaWeek(host: ArenaChampionHost, now: Date): string[] | null {
  const cur = weekId(now);
  const prev = host.getKv(KV_CHAMP_WEEK);
  if (prev === cur) return null;
  const best = prev ? parseArenaTime(host.getKv(kvArenaTimeWeek(prev))) : null;
  const winners = new Set(best?.names ?? []);
  let old: string[] = [];
  try { old = JSON.parse(host.getKv(KV_CHAMP_NAMES) ?? "[]") as string[]; } catch { old = []; }
  for (const name of Array.isArray(old) ? old : []) {
    if (winners.has(name)) continue;
    const rec = host.record(name);
    if (rec && revokeUnlock(rec, ARENA_CHAMPION_UNLOCK)) host.revoke(rec, ARENA_CHAMPION_UNLOCK);
  }
  for (const name of winners) {
    const rec = host.record(name);
    if (rec) host.grant(rec, ARENA_CHAMPION_UNLOCK);
  }
  host.setKv(KV_CHAMP_WEEK, cur);
  host.setKv(KV_CHAMP_NAMES, JSON.stringify([...winners]));
  if (best && winners.size) {
    const mod = ARENA_MODS[best.mod];
    host.announce(`🏟️ ${winners.size > 1 ? "Campeões" : "Campeão"} do Coliseu da semana ${prev}: ${joinNames(best.names)} — ${ARENA_MAX_WAVE} ondas em ` +
      `${arenaTimeText(best.ms)} (${mod.icon} ${mod.name}). Título "Campeão do Coliseu" até a próxima segunda.`);
  }
  return [...winners];
}

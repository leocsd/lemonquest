// Linha de base semanal por personagem: o ranking semanal (e as missões semanais) mede o ganho desde o começo da
// semana ISO. A base é gravada no primeiro contato da semana (entrada no mundo ou virada com o jogador online). Os
// desafios da semana (challenges.ts) tiram dela o level do começo da semana (levelForXp da XP da base).
import { weekId, type WeekBaseline, type WeeklyKey } from "@lemonquest/shared";
import type { CharacterRecord } from "../persistence/types.ts";

/** Contadores atuais do personagem (xp do registro; resto das estatísticas de conquistas). */
export function weeklyCounters(rec: Pick<CharacterRecord, "xp" | "data">): Record<WeeklyKey, number> {
  const st = rec.data.ach?.stats ?? {};
  return { xp: rec.xp, kills: st.kills ?? 0, fish: st.fish ?? 0, bosses: st.bosses ?? 0 };
}

/** Garante a linha de base da semana de `now`. true = criou/renovou (semana nova para este personagem). */
export function rollWeek(rec: Pick<CharacterRecord, "xp" | "data">, now: Date): boolean {
  const id = weekId(now);
  if (rec.data.week?.id === id) return false;
  const base: WeekBaseline = { id, ...weeklyCounters(rec) };
  rec.data.week = base;
  return true;
}

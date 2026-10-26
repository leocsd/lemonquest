// Linha de base semanal por personagem: o ranking semanal (e as missões semanais) mede o ganho desde o começo da
// semana ISO. A base é gravada no primeiro contato da semana (entrada no mundo ou virada com o jogador online). Os
// desafios da semana (challenges.ts) tiram dela o level do começo da semana (levelForXp da XP da base) e, na virada,
// o que foi cumprido e não resgatado (settleChallenges, pago pelo ChallengeSystem).
import {
  WEEKLY_EXTRA_KEYS, challengeGain, challengeTarget, levelForXp, weekChallenges, weekId,
  type ChallengeKey, type WeekBaseline, type WeeklyExtraKey, type WeeklyKey,
} from "@lemonquest/shared";
import type { CharacterRecord } from "../persistence/types.ts";

/** Contadores atuais do personagem (xp do registro; resto das estatísticas de conquistas). */
export function weeklyCounters(rec: Pick<CharacterRecord, "xp" | "data">): Record<WeeklyKey, number> {
  const st = rec.data.ach?.stats ?? {};
  return { xp: rec.xp, kills: st.kills ?? 0, fish: st.fish ?? 0, bosses: st.bosses ?? 0 };
}

/** Contadores que só os desafios medem (mesmos nomes das estatísticas de conquistas). */
export function extraCounters(rec: Pick<CharacterRecord, "data">): Record<WeeklyExtraKey, number> {
  const st = rec.data.ach?.stats ?? {};
  return Object.fromEntries(WEEKLY_EXTRA_KEYS.map((k) => [k, st[k] ?? 0])) as Record<WeeklyExtraKey, number>;
}

export const challengeCounters = (rec: Pick<CharacterRecord, "xp" | "data">): Record<ChallengeKey, number> =>
  ({ ...weeklyCounters(rec), ...extraCounters(rec) });

/**
 * Semana a partir da qual a virada resgata sozinha os desafios cumpridos. Antes do ciclo 18 o sorteio não existia (as
 * 3 metas eram fixas): pagar uma semana antiga pelo sorteio novo entregaria metas que o jogador nunca viu.
 */
export const AUTO_CLAIM_FROM_WEEK = "2026-W44";

/**
 * Virada (a linha de base ainda é a da semana que acabou): guarda em `challenges.pending` os desafios daquela semana
 * cumpridos e não resgatados, e o bônus se os 3 ficaram cumpridos. Funciona mesmo sem a janela ter sido aberta na
 * semana (sem estado = nada resgatado; level = o da linha de base). Chamada pelo rollWeek e pelo ChallengeSystem
 * (quando a semana vira antes de a sala renovar a base); `settled` impede pagar a mesma semana duas vezes.
 */
export function settleChallenges(rec: Pick<CharacterRecord, "xp" | "data">): void {
  const base = rec.data.week;
  if (!base || base.id < AUTO_CLAIM_FROM_WEEK) return;
  const prev = rec.data.challenges;
  if (prev?.settled && prev.settled >= base.id) return;
  const st = prev?.week === base.id ? prev : undefined;
  const level = levelForXp(base.xp);
  const claimed = st?.claimed ?? [];
  const cur = challengeCounters(rec);
  const drawn = weekChallenges(base.id);
  const ids = drawn
    .filter((d) => !claimed.includes(d.id) && challengeGain(base, cur, base.id, d.key) >= challengeTarget(d, level))
    .map((d) => d.id);
  const bonus = !st?.bonus && drawn.every((d) => claimed.includes(d.id) || ids.includes(d.id));
  if (!ids.length && !bonus) {
    if (prev) prev.settled = base.id;
    return;
  }
  rec.data.challenges = {
    week: base.id, level, claimed: [...claimed, ...ids], bonus: !!st?.bonus || bonus, notified: st?.notified ?? [],
    pending: [...(prev?.pending ?? []), { week: base.id, level, ids, bonus }], settled: base.id,
  };
}

/** Garante a linha de base da semana de `now`. true = criou/renovou (semana nova para este personagem). */
export function rollWeek(rec: Pick<CharacterRecord, "xp" | "data">, now: Date): boolean {
  const id = weekId(now);
  if (rec.data.week?.id === id) {
    // Linha de base gravada antes do ciclo 18: os contadores extras passam a contar a partir de agora.
    rec.data.week.extra ??= extraCounters(rec);
    return false;
  }
  settleChallenges(rec);
  const base: WeekBaseline = { id, ...weeklyCounters(rec), extra: extraCounters(rec) };
  rec.data.week = base;
  return true;
}

// Semana de jogo (ranking semanal e missões semanais): semana ISO (segunda a domingo) no fuso do servidor.

export type WeeklyKey = "xp" | "kills" | "fish" | "bosses";
export const WEEKLY_KEYS: readonly WeeklyKey[] = ["xp", "kills", "fish", "bosses"];

/**
 * Contadores que só os desafios da semana medem (ciclo 18; data/challenges.ts). Ficam em `WeekBaseline.extra`, fora
 * do ranking semanal (que continua com as 4 chaves acima).
 */
export type WeeklyExtraKey = "party" | "steps" | "foods" | "offline" | "waves" | "bounties";
export const WEEKLY_EXTRA_KEYS: readonly WeeklyExtraKey[] = ["party", "steps", "foods", "offline", "waves", "bounties"];

/**
 * Contadores do personagem no começo da semana: o ganho da semana é o valor atual menos isto. `extra` falta em linha
 * de base gravada antes do ciclo 18: o servidor completa com o valor atual (o ganho conta dali em diante).
 */
export interface WeekBaseline { id: string; xp: number; kills: number; fish: number; bosses: number; extra?: Partial<Record<WeeklyExtraKey, number>> }

/** "2026-W42": semana ISO-8601 (a semana 1 é a que tem a primeira quinta-feira do ano). */
export function weekId(d: Date): string {
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = (t.getDay() + 6) % 7; // segunda = 0
  t.setDate(t.getDate() - day + 3); // quinta da mesma semana
  const year = t.getFullYear();
  const jan4 = new Date(year, 0, 4);
  const week = 1 + Math.round(((t.getTime() - jan4.getTime()) / 86_400_000 - 3 + ((jan4.getDay() + 6) % 7)) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** Quando a semana termina (próxima segunda-feira 00:00, horário local), em ms epoch. */
export function weekEndsAt(d: Date): number {
  const day = (d.getDay() + 6) % 7;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + (7 - day), 0, 0, 0, 0).getTime();
}

/** Ganho na semana atual; 0 se a linha de base é de outra semana (não jogou nesta) ou não existe. */
export function weekGain(base: WeekBaseline | undefined, cur: Record<WeeklyKey, number>, currentWeek: string, key: WeeklyKey): number {
  if (!base || base.id !== currentWeek) return 0;
  return Math.max(0, cur[key] - base[key]);
}

/** "3 d 4 h", "5 h 10 min", "20 min" — tempo até `at`. */
export function timeLeftText(at: number, now: number): string {
  const s = Math.max(0, Math.floor((at - now) / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${m} min`;
  return `${Math.max(1, m)} min`;
}

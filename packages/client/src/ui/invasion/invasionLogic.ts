// Invasão da Vila: textos do HUD a partir do estado do servidor (S2C.Invasion). Puro (sem DOM) para testar.
import type { InvasionResult, InvasionState } from "@lemonquest/shared";

/** Abates que faltam para a meta de defesa (fração dos que já nasceram); 0 = meta batida. */
export const invasionKillsLeft = (s: Pick<InvasionState, "spawned" | "killed" | "defendPct">): number =>
  Math.max(0, Math.ceil(s.spawned * s.defendPct) - s.killed);

/** A Vila está segura até aqui: meta de abates batida e o líder (se apareceu) derrotado. */
export const invasionOnTrack = (s: Pick<InvasionState, "spawned" | "killed" | "defendPct" | "leader">): boolean =>
  s.spawned > 0 && invasionKillsLeft(s) === 0 && !s.leader?.alive;

/** "Onda 3/5 · próxima em 4 min", "Onda 5/5 · última" ou "Começa em 2 min". */
export function invasionWaveText(s: Pick<InvasionState, "wave" | "waves" | "nextWaveAt">, now: number): string {
  const mins = (t: number) => Math.max(1, Math.ceil((t - now) / 60_000));
  if (s.wave <= 0) return s.nextWaveAt ? `Começa em ${mins(s.nextWaveAt)} min` : "Começando";
  const head = `Onda ${s.wave}/${s.waves}`;
  if (s.nextWaveAt === null) return `${head} · última`;
  return `${head} · próxima em ${mins(s.nextWaveAt)} min`;
}

/** "Você: 7/10 pts" ou "Você: 12 pts ✔" (prêmio garantido). */
export function invasionMineText(s: Pick<InvasionState, "mine" | "goal">): string {
  return s.mine >= s.goal ? `Você: ${s.mine} pts ✔` : `Você: ${s.mine}/${s.goal} pts`;
}

/** Resultado no fim: o que aconteceu com a Vila e o que você ganhou. */
export function invasionResultText(r: InvasionResult): string {
  const head = r.defended ? `A Vila resistiu! ${r.killed}/${r.spawned} invasores derrotados.` : `A Vila não resistiu (${r.killed}/${r.spawned} derrotados).`;
  if (r.chests > 0) return `${head} Você ganhou ${r.chests} Baú${r.chests > 1 ? "s" : ""} de Recompensa (${r.points} pontos).`;
  if (r.points > 0) return `${head} Sua contribuição: ${r.points} pontos (o prêmio pede 10).`;
  return head;
}

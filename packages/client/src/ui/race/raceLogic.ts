// Textos da barra da Corrida de Caça (puros, testados em raceLogic.test.ts).
import { RACE_TEAM_ICON, RACE_TEAM_LABEL, type RaceResult, type RaceState } from "@lemonquest/shared";

/** "🍋 120 × 98 🍊" */
export function raceScoreText(points: { limao: number; laranja: number }): string {
  return `${RACE_TEAM_ICON.limao} ${points.limao} × ${points.laranja} ${RACE_TEAM_ICON.laranja}`;
}

/** Minutos que faltam (arredondado para cima; "último minuto" a partir de 1 min). */
export function raceTimeText(end: number, now: number): string {
  const ms = end - now;
  if (ms <= 60_000) return "último minuto";
  return `faltam ${Math.ceil(ms / 60_000)} min`;
}

/** "Você: Time Limão (12 pts) · na frente" */
export function raceMineText(s: RaceState): string {
  const other = s.team === "limao" ? "laranja" : "limao";
  const where = s.points[s.team] > s.points[other] ? "na frente" : s.points[s.team] < s.points[other] ? "atrás" : "empatado";
  return `Você: ${RACE_TEAM_LABEL[s.team]} (${s.mine} pts) · ${where}`;
}

export function raceResultText(r: RaceResult): string {
  const head = r.winners.length === 2 ? "Empate!"
    : r.winners.length ? `Venceu o ${RACE_TEAM_ICON[r.winners[0]!]} ${RACE_TEAM_LABEL[r.winners[0]!]}!` : "Ninguém pontuou.";
  const mine = r.chests > 0 ? ` Você ganhou ${r.chests} Baú de Recompensa.`
    : r.winners.includes(r.team) && r.mine <= 0 ? " Seu time venceu, mas o prêmio pede pelo menos 1 ponto seu." : "";
  return `Corrida de Caça: ${head} ${raceScoreText(r.points)}.${mine}`;
}

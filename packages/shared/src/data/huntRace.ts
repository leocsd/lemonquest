// Corrida de Caça (2026-11-06, pedido do dono: "jogos para jogar juntos e contra"). Um evento curto da Agenda (`race`
// no GameEventDef, shared/data/events.ts): no começo, quem está online é sorteado em dois times equilibrados pela soma
// dos levels (Time Limão × Time Laranja); quem entra depois cai no time com menos levels. Cada abate soma pontos para o
// time de quem ganhou crédito pelo abate (dividido entre eles), pelo level do bicho: o lv 20 caçando bicho do lv 20 e o
// lv 120 caçando bicho do lv 120 pontuam no mesmo ritmo por minuto, mais ou menos. No fim, quem pontuou no time
// vencedor ganha Baú de Recompensa. Dados e contas puras; o servidor está em server/systems/huntRace.ts.

export type RaceTeam = "limao" | "laranja";
export const RACE_TEAMS: readonly RaceTeam[] = ["limao", "laranja"];
export const RACE_TEAM_LABEL: Record<RaceTeam, string> = { limao: "Time Limão", laranja: "Time Laranja" };
export const RACE_TEAM_ICON: Record<RaceTeam, string> = { limao: "🍋", laranja: "🍊" };

/** Pontos de um abate: 1 a cada 10 levels do bicho (mínimo 1); elite ×3, elite nomeado ×10, chefe 50 fixos. */
export function racePoints(m: { level: number; boss?: boolean }, o: { elite?: boolean; named?: string } = {}): number {
  if (m.boss) return 50;
  const base = Math.max(1, Math.round((Number.isFinite(m.level) ? m.level : 1) / 10));
  return base * (o.named ? 10 : o.elite ? 3 : 1);
}

/**
 * Sorteio equilibrado: do maior level para o menor, cada um vai para o time com menos levels somados (empate: o time
 * com menos gente; depois, o primeiro). Devolve nome → time.
 */
export function raceDraw(players: readonly { name: string; level: number }[]): Map<string, RaceTeam> {
  const sum: Record<RaceTeam, number> = { limao: 0, laranja: 0 };
  const count: Record<RaceTeam, number> = { limao: 0, laranja: 0 };
  const out = new Map<string, RaceTeam>();
  const sorted = [...players].sort((a, b) => b.level - a.level || a.name.localeCompare(b.name));
  for (const p of sorted) {
    const t = raceLighter(sum, count);
    out.set(p.name, t);
    sum[t] += Math.max(1, p.level);
    count[t]++;
  }
  return out;
}

/** Time com menos levels somados (empate: menos gente; depois, Limão). */
export function raceLighter(sum: Record<RaceTeam, number>, count: Record<RaceTeam, number>): RaceTeam {
  if (sum.limao !== sum.laranja) return sum.limao < sum.laranja ? "limao" : "laranja";
  return count.laranja < count.limao ? "laranja" : "limao";
}

/** Times vencedores (os dois no empate; nenhum se ninguém pontuou). */
export function raceWinners(points: Record<RaceTeam, number>): RaceTeam[] {
  if (!(points.limao > 0) && !(points.laranja > 0)) return [];
  if (points.limao === points.laranja) return [...RACE_TEAMS];
  return [points.limao > points.laranja ? "limao" : "laranja"];
}

/** Pontos mínimos de quem leva o prêmio (precisa ter ajudado o time). */
export const RACE_MIN_POINTS = 1;
/** Baús para quem pontuou no time vencedor. */
export const RACE_CHESTS = 1;

// --- protocolo ---------------------------------------------------------------------------------------------------

export interface RaceState {
  name: string;
  /** Fim do evento (ms epoch). */
  end: number;
  /** Pontos de cada time (arredondados para baixo) e quantos jogadores tem. */
  points: Record<RaceTeam, number>;
  members: Record<RaceTeam, number>;
  /** Seu time e os seus pontos (arredondados para baixo). */
  team: RaceTeam;
  mine: number;
}

export interface RaceResult { winners: RaceTeam[]; points: Record<RaceTeam, number>; team: RaceTeam; mine: number; chests: number }

/** S2C.Race: estado (null = nenhuma corrida) e, no fim, o resultado. */
export interface RaceMsg { active: RaceState | null; result?: RaceResult }

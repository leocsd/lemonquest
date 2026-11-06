// Arena de Duelo (2026-11-06, pedido do dono: "jogos para jogar contra"). Um jogador desafia outro pelo menu do botão
// direito, 1×1 ou 2×2 (cada um com o colega do próprio grupo de 2). Aceito, os dois lados vão para uma sala livre do
// Coliseu (a reserva é compartilhada com ele), com vida e mana cheias, contagem de DUEL_COUNTDOWN_MS e no máximo
// DUEL_MAX_MS de luta. Ninguém morre de verdade: quem cairia sai da sala com vida cheia, sem perder XP nem itens, sem
// caveira. Vence o lado que sobrar; no tempo esgotado, o lado com mais vida somada (em %). Ranking semanal de vitórias.
// Dados e contas puras; o servidor está em server/systems/duel.ts.

export type DuelMode = "1x1" | "2x2";
export const DUEL_MODES: readonly DuelMode[] = ["1x1", "2x2"];
export const DUEL_MODE_LABEL: Record<DuelMode, string> = { "1x1": "1×1", "2x2": "2×2" };
/** Jogadores por lado. */
export const duelSize = (mode: DuelMode): number => (mode === "2x2" ? 2 : 1);

/** O convite expira sozinho. */
export const DUEL_INVITE_MS = 30_000;
/** Contagem antes da luta (ninguém ataca). */
export const DUEL_COUNTDOWN_MS = 5_000;
/** Tempo máximo de luta. */
export const DUEL_MAX_MS = 3 * 60_000;

/** Lado vencedor pelo tempo: maior vida somada em % (0..1 por jogador); empate = null. */
export function duelTimeWinner(a: readonly number[], b: readonly number[]): 0 | 1 | null {
  const sum = (xs: readonly number[]) => xs.reduce((s, x) => s + Math.max(0, Math.min(1, x)), 0);
  const sa = sum(a), sb = sum(b);
  if (Math.abs(sa - sb) < 1e-9) return null;
  return sa > sb ? 0 : 1;
}

/** Top `n` do ranking semanal (nome → vitórias), por vitórias e depois por nome. */
export function duelTop(wins: Record<string, number>, n = 5): { name: string; wins: number }[] {
  return Object.entries(wins)
    .filter(([, w]) => Number.isFinite(w) && w > 0)
    .map(([name, w]) => ({ name, wins: Math.floor(w) }))
    .sort((a, b) => b.wins - a.wins || a.name.localeCompare(b.name))
    .slice(0, Math.max(0, n));
}

// --- protocolo ---------------------------------------------------------------------------------------------------

/** C2S.Duel */
export type DuelActionMsg =
  | { action: "challenge"; targetId: string; mode: DuelMode }
  | { action: "accept"; fromId: string }
  | { action: "decline"; fromId: string }
  | { action: "ranking" };

/** Convite recebido (cartão no topo). */
export interface DuelInvite { fromId: string; fromName: string; mode: DuelMode; /** Colegas dos dois lados no 2×2. */ partners?: string; until: number }

export interface DuelState {
  mode: DuelMode;
  phase: "countdown" | "fight";
  /** Fim da fase atual (ms epoch). */
  until: number;
  /** Seu lado e o outro (nomes; quem já caiu fica marcado). */
  mine: { name: string; out: boolean }[];
  theirs: { name: string; out: boolean }[];
}

export interface DuelResult { won: boolean | null; reason: "wiped" | "time" | "forfeit"; mode: DuelMode; opponents: string }

/** S2C.Duel: convites pendentes, o duelo em andamento (null = nenhum) e, no fim, o resultado. */
export interface DuelMsg { invites: DuelInvite[]; active: DuelState | null; result?: DuelResult }

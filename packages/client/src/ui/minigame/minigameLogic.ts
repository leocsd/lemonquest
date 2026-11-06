// Textos da barra do minijogo e da janela do Salão (puros, testados em minigameLogic.test.ts).
import { MINIGAMES, MINIGAME_LIVES, type MinigamePlayerView, type MinigameRoomSummary, type MinigameStateMsg } from "@lemonquest/shared";

/** Ms restantes até `until` (relógio do servidor), corrigindo a diferença de relógio. */
export function remainingMs(s: Pick<MinigameStateMsg, "until">, offset: number, now = Date.now()): number {
  return s.until ? Math.max(0, s.until - (now + offset)) : 0;
}

/** Vidas como corações (cheios e vazios). */
export const hearts = (lives: number, max = MINIGAME_LIVES): string =>
  "♥".repeat(Math.max(0, Math.min(max, lives))) + "♡".repeat(Math.max(0, max - Math.max(0, lives)));

/** Placar: maior pontuação primeiro; quem ainda está no jogo antes de quem saiu; empate pelo nome. */
export function standings(players: readonly MinigamePlayerView[]): MinigamePlayerView[] {
  return [...players].sort((a, b) => b.score - a.score || Number(a.out) - Number(b.out) || a.name.localeCompare(b.name));
}

/** Linha principal da barra no topo. */
export function barText(s: MinigameStateMsg, offset: number, now = Date.now()): string {
  const def = MINIGAMES[s.game];
  const secs = Math.ceil(remainingMs(s, offset, now) / 1000);
  if (s.phase === "countdown") return `${def.name}: começa em ${secs} s`;
  if (s.phase === "ended") {
    const w = s.winners ?? [];
    const head = def.coop ? `${def.name}: o time chegou à rodada ${Math.max(0, ...s.players.map((p) => p.score))}`
      : w.length ? `${def.name}: ${w.join(" e ")} ${w.length > 1 ? "empataram" : "venceu"}!` : `${def.name}: fim de jogo`;
    return `${head} · +${s.fichas ?? 0} ficha(s)`;
  }
  if (s.game === "pega") return `${def.name} · ${secs} s`;
  if (s.game === "genius") {
    const g = s.genius;
    const step = g ? (g.showing ? "olhe as placas…" : `sua vez: ${g.step}/${g.length}`) : "";
    return `${def.name} · rodada ${s.round} · ${step} · time ${hearts(s.teamLives ?? 0)}`;
  }
  return `${def.name} · ${s.game === "chuva" ? "onda" : "rodada"} ${s.round}`;
}

/** Botão de uma sala na janela: o que dá para fazer nela. */
export function roomAction(r: MinigameRoomSummary, mine: number | undefined): "open" | "join" | "busy" | "mine" | "full" {
  if (mine === r.id) return "mine";
  if (r.phase === "idle") return mine == null ? "open" : "busy";
  if (r.phase !== "lobby") return "busy";
  if (mine != null) return "busy";
  return r.players.length >= 8 ? "full" : "join";
}

export const PHASE_LABEL: Record<MinigameRoomSummary["phase"], string> = {
  idle: "livre", lobby: "esperando jogadores", countdown: "começando", playing: "em jogo", ended: "terminando",
};

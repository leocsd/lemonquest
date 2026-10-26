// Regras puras da janela de desafios (testáveis sem DOM nem sala).
import type { ChallengesMsg } from "@lemonquest/shared";

/** Tem prêmio para resgatar (desafio cumprido ou o bônus liberado)? Acende o ponto no botão do trilho. */
export function hasClaimable(m: ChallengesMsg | null): boolean {
  if (!m) return false;
  if (m.goals.some((g) => !g.claimed && g.progress >= g.target)) return true;
  return m.goals.length > 0 && m.goals.every((g) => g.claimed) && !m.bonus.claimed;
}

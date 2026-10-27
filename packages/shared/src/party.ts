// Grupo (party) estilo Tibia: constantes e regras puras da experiência compartilhada (servidor e cliente).

/** Máximo de membros num grupo. Era 6; o dono não quer limite (2026-10-27) — 64 é só a guarda contra abuso. */
export const PARTY_MAX = 64;
/** Convite expira depois disso. */
export const PARTY_INVITE_MS = 60_000;
/** Distância máxima (tiles, Chebyshev) do abate para receber a parte da XP. */
export const PARTY_SHARE_RANGE = 12;
/** Membro "ativo" = atacou um monstro ou curou alguém do grupo nesse intervalo. */
export const PARTY_ACTIVE_MS = 60_000;
/**
 * Bônus por membro extra que divide a XP (+35% cada). Era +20%: quatro pessoas ganhavam 40% de um abate solo cada e
 * um grupo em spawn comum perdia XP por cabeça num jogo que empurra para grupo (bandos, Coliseu) — ciclo 9, GD-13.
 */
export const PARTY_SHARE_BONUS = 0.35;
/** Bônus extra quando há pelo menos 3 vocações diferentes entre os que dividem (como no Tibia). */
export const PARTY_VOCATION_BONUS = 0.2;
export const PARTY_VOCATION_BONUS_MIN = 3;

/** Regra de level (Tibia): o menor level precisa ser ≥ 2/3 do maior. */
export function partyLevelsOk(levels: readonly number[]): boolean {
  if (levels.length === 0) return true;
  const min = Math.min(...levels), max = Math.max(...levels);
  return min * 3 >= max * 2;
}

/** Menor level aceito no grupo dado o maior (2/3, arredondado para cima). */
export const partyMinLevel = (maxLevel: number): number => Math.ceil((maxLevel * 2) / 3);

/**
 * XP de cada um quando `n` membros dividem `total`: total × (1 + 0,35 × (n−1) [+ 0,2 com ≥ 3 vocações diferentes]) ÷ n
 * (mín. 1). `vocations` = quantas vocações distintas há entre os que dividem (0 = não considerar).
 */
export function partyShareEach(total: number, n: number, vocations = 0): number {
  if (total <= 0) return 0;
  if (n <= 1) return total;
  const bonus = 1 + PARTY_SHARE_BONUS * (n - 1) + (vocations >= PARTY_VOCATION_BONUS_MIN ? PARTY_VOCATION_BONUS : 0);
  return Math.max(1, Math.round((total * bonus) / n));
}

/** Motivo de a XP compartilhada estar inativa. */
export type PartyShareReason = "alone" | "levels";
export const PARTY_SHARE_REASON_TEXT: Record<PartyShareReason, string> = {
  alone: "Só você no grupo",
  levels: "Diferença de level grande demais",
};

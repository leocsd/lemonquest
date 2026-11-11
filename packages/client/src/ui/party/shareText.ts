// Texto do bônus da XP compartilhada, montado a partir das constantes do shared (a dica fixa "+20%" ficou para trás
// quando o bônus por membro subiu para +35% no ciclo 9).
import { PARTY_SHARE_BONUS, PARTY_VOCATION_BONUS, PARTY_VOCATION_BONUS_MIN } from "@lemonquest/shared";

const pct = (f: number) => `+${Math.round(f * 100)}%`;

export function shareBonusText(): string {
  return `XP dividida com bônus de ${pct(PARTY_SHARE_BONUS)} por membro extra ` +
    `(${pct(PARTY_VOCATION_BONUS)} a mais com ${PARTY_VOCATION_BONUS_MIN} vocações diferentes)`;
}

// Texto do número de dano que sobe do alvo. Puro para testar; a cena só escolhe cor e tamanho.
import type { CombatEvent } from "@lemonquest/shared";

/**
 * "120", "240!" (crítico), "60↓" (o monstro resistiu ao elemento), "138↑" (era fraco a ele). Golpe zerado: "errou", ou
 * "resistiu" quando foi a resistência que zerou (imune ao elemento) — o servidor manda `resisted` < 1 com o miss.
 */
export function damageText(ev: Pick<CombatEvent, "amount" | "crit" | "miss" | "resisted">): string {
  const r = ev.resisted;
  if (ev.miss) return r !== undefined && r < 1 ? "resistiu" : "errou";
  return `${ev.amount}${ev.crit ? "!" : ""}${r === undefined || r === 1 ? "" : r < 1 ? "↓" : "↑"}`;
}

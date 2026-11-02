// Confirmação da venda de item refinado ao NPC. (Largar no chão por arrasto não pede mais confirmação: o dono pediu em
// 2026-11-01.) Regra pura, separada da UI para ter teste unitário.
import type { ItemInstance } from "@lemonquest/shared";

/**
 * Vender ao NPC (botão da linha) pede o segundo clique? Item refinado: o NPC paga só o valor base e o refino (dezenas
 * a centenas de milhares de ouro) se perde.
 */
export function needsSellConfirm(inst: Pick<ItemInstance, "refine">): boolean {
  return (inst.refine ?? 0) > 0;
}

/** Aviso da venda armada (primeiro clique). */
export const sellConfirmText = (refine: number): string => `O NPC paga só o valor base: o refino +${refine} se perde.`;

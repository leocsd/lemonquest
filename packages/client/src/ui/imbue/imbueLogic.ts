// Lógica do clique na grade da Dona Marta (sem UI, testável).

/** Tempo máximo com os botões travados esperando a resposta da compra (a recusa só manda aviso, sem NpcOpen novo). */
export const IMBUE_PENDING_MS = 1500;

/**
 * O que um clique numa célula faz. Esperando a resposta de uma compra: nada (clique duplo cobrava 2×). Com um
 * encantamento ativo, o 1º clique só arma a confirmação daquela célula; o 2º (ou sem ativo, o 1º) compra.
 */
export function imbueClick(s: { pending: boolean; hasActive: boolean; asking: string; key: string }): "ignore" | "confirm" | "buy" {
  if (s.pending) return "ignore";
  if (s.hasActive && s.asking !== s.key) return "confirm";
  return "buy";
}

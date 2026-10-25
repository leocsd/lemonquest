// Tingimento na janela de roupas: clicar num tom não comprado só mostra a prévia no boneco; a compra (8.000 de ouro,
// vale para a conta) sai por um botão que pede confirmação (dois cliques), para um clique solto não gastar o ouro.
import { OUTFIT_TONE_PRICE } from "@lemonquest/shared";

/** owned = natural ou já liberado na conta (veste); buy = à venda com ouro suficiente; poor = à venda sem ouro. */
export type ToneStatus = "owned" | "buy" | "poor";

export function toneStatus(tone: string, unlocked: readonly string[], gold: number): ToneStatus {
  if (tone === "" || unlocked.includes(tone)) return "owned";
  return gold >= OUTFIT_TONE_PRICE ? "buy" : "poor";
}

/**
 * Tom que o OK (ou o duplo clique) veste: a prévia de um tom não comprado não vai ao servidor, que recusaria a troca
 * inteira (roupa e addons junto); fica o tom atual.
 */
export function toneToWear(tone: string, unlocked: readonly string[], current: string): string {
  return tone === "" || unlocked.includes(tone) ? tone : current;
}

/** Clique no botão de compra: o 1º só arma a confirmação; o 2º compra. */
export function buyClick(confirming: boolean): { buy: boolean; confirming: boolean } {
  return confirming ? { buy: true, confirming: false } : { buy: false, confirming: true };
}

export function buyLabel(status: ToneStatus, confirming: boolean): string {
  const price = OUTFIT_TONE_PRICE.toLocaleString("pt-BR");
  if (status === "poor") return `Ouro insuficiente (${price})`;
  return confirming ? `Clique de novo para comprar (${price})` : `Comprar (${price})`;
}

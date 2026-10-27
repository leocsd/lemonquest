/**
 * True quando algum campo de texto está focado (o input do jogo deve ignorar teclas). Fonte única da verdade:
 * movimento (game/input.ts), atalhos do HUD e chat usam esta. Checkbox, select, range etc. não contam.
 */
export function isTyping(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const typing = el instanceof HTMLTextAreaElement
    || (el instanceof HTMLInputElement && !["checkbox", "radio", "button", "submit", "range", "color"].includes(el.type))
    || (el as HTMLElement).isContentEditable === true;
  // Campo focado que não está mais na tela (escondido ou fora do DOM): não é "digitando" — senão todas as teclas do HUD
  // (L, M…) morriam sem o jogador ver onde o foco ficou preso. Solta o foco para o próximo keydown já cair no jogo.
  if (typing && (!el.isConnected || el.getClientRects().length === 0)) { (el as HTMLElement).blur(); return false; }
  return typing;
}

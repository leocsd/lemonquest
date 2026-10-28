// O foco atual chegou pelo teclado (Tab) ou pelo mouse? `:focus-visible` só responde isso no instante do focusin: depois
// que o jogador aperta qualquer tecla com um botão focado, o navegador passa a dizer "visível" também para o foco que
// veio do clique (medido no Chromium, 2026-10-28). Guardamos a resposta do focusin para o Espaço (ui/items/keys.ts)
// decidir entre apertar o botão (quem navega por teclado) e mirar o bicho (quem clicou num botão e voltou ao jogo).
let keyboardFocus = false;
if (typeof window !== "undefined") {
  window.addEventListener("focusin", (e) => {
    const t = e.target as Element | null;
    keyboardFocus = !!t && t !== document.body && typeof t.matches === "function" && t.matches(":focus-visible");
  }, true);
  window.addEventListener("focusout", () => { keyboardFocus = false; }, true);
}

/** Algum controle (botão, aba, link…) está focado e o foco veio do teclado? Aí o Espaço/Enter é dele, não do jogo. */
export function focusedByKeyboard(): boolean {
  const el = document.activeElement;
  return keyboardFocus && !!el && el !== document.body;
}

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

// Texto pronto para o campo do chat (botão Sussurrar do painel Online, ciclo 18): o chat abre na aba Geral, recebe o
// texto e o foco com o cursor no fim, e quem clicou só digita a mensagem.
import { createStore } from "./hud/store.ts";

/** `n` muda a cada pedido: o mesmo texto duas vezes seguidas também reabre o chat. */
export const chatDraftStore = createStore<{ text: string; n: number } | null>(null);
let n = 0;

export const draftChat = (text: string): void => chatDraftStore.set({ text, n: ++n });

/** "/w Nome Sobrenome " (o sussurro aceita nome com espaço: o maior nome online que abre o texto). */
export const whisperDraft = (name: string): string => `/w ${name} `;

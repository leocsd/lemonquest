// Estado da janela de roupas (tecla O / trilho do HUD / botão direito no próprio personagem) e do menu de contexto.
import { C2S, S2C, ADDON_BITS, OUTFITS, type BuyOutfitToneMsg, type OutfitTonesMsg, type SetOutfitMsg, type Sex } from "@lemonquest/shared";
import { session } from "../../session.ts";
import { send } from "../items/net.ts";
import { createStore } from "../hud/store.ts";

export const outfitOpen = createStore(false);
/** Tons de tingimento liberados NA CONTA (S2C.OutfitTones, ao entrar e após comprar). */
export const outfitTonesStore = createStore<string[]>([]);
export function handleOutfitTones(m: OutfitTonesMsg): void { outfitTonesStore.set(m.unlocked ?? []); }

/** `danger`: ação séria (atacar jogador): em vermelho e separada das outras. */
export interface CtxMenuItem { label: string; run: () => void; danger?: boolean }
/** Menu de contexto simples (posição em px da janela). */
export const ctxMenuStore = createStore<{ x: number; y: number; items: CtxMenuItem[] } | null>(null);

export const openOutfit = (): void => { ctxMenuStore.set(null); outfitOpen.set(true); };
export const closeOutfit = (): void => outfitOpen.set(false);
export const toggleOutfit = (): void => outfitOpen.set((v) => !v);

export function openCtxMenu(x: number, y: number, items: CtxMenuItem[]): void {
  ctxMenuStore.set({ x, y, items });
}
export const closeCtxMenu = (): void => ctxMenuStore.set(null);

/** Envia a troca (o servidor valida; o estado sincronizado traz o resultado para todos). Sexo ausente = mantém o atual. */
export function sendOutfit(outfit: string, addons: number, tone?: string, sex?: Sex): void {
  if (!OUTFITS[outfit]) return;
  send(C2S.SetOutfit, { outfit, addons: addons & ADDON_BITS, tone, ...(sex ? { sex } : {}) } satisfies SetOutfitMsg);
}

export function buyOutfitTone(toneId: string): void {
  send(C2S.BuyOutfitTone, { toneId } satisfies BuyOutfitToneMsg);
}

session.onRoom((room) => {
  outfitTonesStore.set([]);
  room.onMessage(S2C.OutfitTones, (m: OutfitTonesMsg) => handleOutfitTones(m));
});

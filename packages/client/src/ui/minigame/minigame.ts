// Salão de Minijogos (cliente): janela do Mestre do Salão (S2C.MinigameLobby), a partida em que você está
// (S2C.Minigame) e o envio das ações (C2S.Minigame). Os avisos no chão (S2C.MinigameFx) vão direto para a cena
// (game/minigameLayer.ts).
import { C2S, S2C, type MinigameActionMsg, type MinigameLobbyMsg, type MinigameMsg, type MinigameStateMsg } from "@lemonquest/shared";
import { session } from "../../session.ts";
import { createStore } from "../hud/store.ts";
import { send } from "../items/net.ts";

export const minigameWindowOpen = createStore(false);
export const minigameLobbyStore = createStore<MinigameLobbyMsg | null>(null);
/** Partida em que você está; `offset` = relógio do servidor − relógio local. */
export const minigameStateStore = createStore<{ s: MinigameStateMsg; offset: number } | null>(null);

export const minigameAction = (m: MinigameActionMsg): void => send(C2S.Minigame, m);

export function openMinigameWindow(): void { minigameWindowOpen.set(true); }
export function closeMinigameWindow(): void { minigameWindowOpen.set(false); }

export function handleMinigameState(m: MinigameMsg): void {
  if (!m || typeof m !== "object" || typeof m.game !== "string") { minigameStateStore.set(null); return; }
  minigameStateStore.set({ s: m, offset: typeof m.serverNow === "number" ? m.serverNow - Date.now() : 0 });
  // Começou a partida: a janela do Mestre só atrapalha a visão da sala.
  if (m.phase === "countdown" || m.phase === "playing") minigameWindowOpen.set(false);
}

session.onRoom((room) => {
  minigameWindowOpen.set(false);
  minigameLobbyStore.set(null);
  minigameStateStore.set(null);
  room.onMessage(S2C.MinigameLobby, (m: MinigameLobbyMsg) => { if (m && Array.isArray(m.rooms)) minigameLobbyStore.set(m); });
  room.onMessage(S2C.Minigame, (m: MinigameMsg) => handleMinigameState(m));
});

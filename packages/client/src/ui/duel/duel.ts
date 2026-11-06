// Arena de Duelo (2026-11-06): convites recebidos, o duelo em andamento e o resultado (S2C.Duel). As ações vão por
// C2S.Duel (desafiar pelo menu do jogador, aceitar/recusar no cartão do topo).
import { C2S, S2C, type DuelActionMsg, type DuelInvite, type DuelMode, type DuelMsg, type DuelResult, type DuelState } from "@lemonquest/shared";
import { session } from "../../session.ts";
import { send } from "../items/net.ts";
import { createStore } from "../hud/store.ts";

export const duelInvitesStore = createStore<DuelInvite[]>([]);
export const duelStore = createStore<DuelState | null>(null);
export const duelResultStore = createStore<DuelResult | null>(null);

/** Quanto tempo o resultado fica no topo. */
export const RESULT_MS = 15_000;
let resultTimer = 0;

session.onRoom((room) => {
  duelInvitesStore.set([]);
  duelStore.set(null);
  duelResultStore.set(null);
  room.onMessage(S2C.Duel, (m: DuelMsg) => {
    if (!m || typeof m !== "object") return;
    duelInvitesStore.set(Array.isArray(m.invites) ? m.invites : []);
    duelStore.set(m.active && typeof m.active.mode === "string" ? m.active : null);
    if (m.result && typeof m.result.mode === "string") {
      duelResultStore.set(m.result);
      clearTimeout(resultTimer);
      resultTimer = window.setTimeout(() => duelResultStore.set(null), RESULT_MS);
    }
  });
});

export const duelAction = (msg: DuelActionMsg): void => send(C2S.Duel, msg);

export const challengeDuel = (targetId: string, mode: DuelMode) => duelAction({ action: "challenge", targetId, mode });
export const answerDuel = (fromId: string, accept: boolean) => duelAction({ action: accept ? "accept" : "decline", fromId });

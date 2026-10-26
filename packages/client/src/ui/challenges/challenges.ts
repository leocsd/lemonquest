// Desafios da semana: estado (S2C.Challenges) e ações (C2S.Challenge). Pede a lista ao abrir a janela; o servidor
// também manda o estado quando um desafio é cumprido (ciclo 18), o que acende o ponto no botão do trilho.
import { C2S, S2C, type ChallengeActionMsg, type ChallengesMsg } from "@lemonquest/shared";
import { session } from "../../session.ts";
import { send } from "../items/net.ts";
import { createStore, selectStore } from "../hud/store.ts";
import { hasClaimable } from "./challengeLogic.ts";

export const challengesStore = createStore<ChallengesMsg | null>(null);
export const challengesOpen = createStore(false);
export const challengesReady = selectStore(challengesStore, hasClaimable);

export const challengeAction = (m: ChallengeActionMsg): void => send(C2S.Challenge, m);

export function toggleChallenges(): void {
  const open = !challengesOpen.get();
  challengesOpen.set(open);
  if (open) challengeAction({ action: "list" });
}

session.onRoom((room) => {
  challengesStore.set(null);
  room.onMessage(S2C.Challenges, (m: ChallengesMsg) => challengesStore.set(m && Array.isArray(m.goals) ? m : null));
});

// Invasão da Vila (ciclo 18): estado da invasão em andamento (S2C.Invasion, 1×/s quando muda, com a SUA contribuição)
// e o resultado no fim (fica na pilha do topo por RESULT_MS). Null = nenhuma invasão.
import { S2C, type InvasionMsg, type InvasionResult, type InvasionState } from "@lemonquest/shared";
import { session } from "../../session.ts";
import { createStore } from "../hud/store.ts";

export const invasionStore = createStore<InvasionState | null>(null);
export const invasionResultStore = createStore<InvasionResult | null>(null);

/** Quanto tempo o resultado fica no topo. */
export const RESULT_MS = 20_000;
let resultTimer = 0;

session.onRoom((room) => {
  invasionStore.set(null);
  invasionResultStore.set(null);
  room.onMessage(S2C.Invasion, (m: InvasionMsg) => {
    if (!m || typeof m !== "object") return;
    invasionStore.set(m.active && typeof m.active.name === "string" ? m.active : null);
    if (m.result && Number.isFinite(m.result.chests)) {
      invasionResultStore.set(m.result);
      clearTimeout(resultTimer);
      resultTimer = window.setTimeout(() => invasionResultStore.set(null), RESULT_MS);
    }
  });
});

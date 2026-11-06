// Corrida de Caça (2026-11-06): placar da corrida em andamento (S2C.Race, 1×/s quando muda, com o SEU time e pontos) e
// o resultado no fim (fica na pilha do topo por RESULT_MS). Null = nenhuma corrida.
import { S2C, type RaceMsg, type RaceResult, type RaceState } from "@lemonquest/shared";
import { session } from "../../session.ts";
import { createStore } from "../hud/store.ts";

export const raceStore = createStore<RaceState | null>(null);
export const raceResultStore = createStore<RaceResult | null>(null);

/** Quanto tempo o resultado fica no topo. */
export const RESULT_MS = 20_000;
let resultTimer = 0;

session.onRoom((room) => {
  raceStore.set(null);
  raceResultStore.set(null);
  room.onMessage(S2C.Race, (m: RaceMsg) => {
    if (!m || typeof m !== "object") return;
    raceStore.set(m.active && typeof m.active.name === "string" ? m.active : null);
    if (m.result && Array.isArray(m.result.winners)) {
      raceResultStore.set(m.result);
      clearTimeout(resultTimer);
      resultTimer = window.setTimeout(() => raceResultStore.set(null), RESULT_MS);
    }
  });
});

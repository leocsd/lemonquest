// Liga as mensagens do Estagiário (estado e alarmes) aos stores da UI. Importar uma vez (Hud).
import { S2C, type EstagiarioAlarmeMsg, type EstagiarioEstadoMsg } from "@lemonquest/shared";
import { session } from "../../session.ts";
import { alarme } from "./alarmes.ts";
import { onEstadoFromServer, resetRascunho } from "./store.ts";

session.onRoom((room) => {
  resetRascunho();
  room.onMessage(S2C.EstagiarioEstado, (m: EstagiarioEstadoMsg) => onEstadoFromServer(m));
  room.onMessage(S2C.EstagiarioAlarme, (m: EstagiarioAlarmeMsg) => alarme(m));
});

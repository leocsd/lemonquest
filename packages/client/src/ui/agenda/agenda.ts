// Agenda de eventos (ciclo 17): a semana que o servidor manda (S2C.Agenda: ao entrar, ao abrir a janela e quando um
// evento começa ou acaba) e o aviso de 10 min antes (S2C.EventSoon). Janela aberta pelo botão do trilho (sem tecla).
import { C2S, S2C, type AgendaEntry, type AgendaMsg, type EventSoonMsg } from "@lemonquest/shared";
import { session } from "../../session.ts";
import { createStore } from "../hud/store.ts";
import { send } from "../items/net.ts";

/** `offset`: relógio do servidor − relógio local, no recebimento (o que acabou é decidido pelo relógio do servidor). */
export const agendaStore = createStore<{ events: AgendaEntry[]; offset: number } | null>(null);
export const agendaOpen = createStore(false);
/** Último aviso de "começa em 10 min" (some sozinho quando o evento começa: ver EventBadge). */
export const eventSoonStore = createStore<EventSoonMsg | null>(null);

/** Agora no relógio do servidor (o mesmo das horas da agenda). */
export const agendaNow = (): number => Date.now() + (agendaStore.get()?.offset ?? 0);

export function toggleAgenda(): void {
  const open = !agendaOpen.get();
  agendaOpen.set(open);
  if (open) send(C2S.AgendaRequest, {});
}

const isEntry = (e: AgendaEntry | null | undefined): e is AgendaEntry =>
  !!e && typeof e.id === "string" && typeof e.name === "string" && Number.isFinite(e.start) && Number.isFinite(e.end);

session.onRoom((room) => {
  agendaStore.set(null);
  eventSoonStore.set(null);
  room.onMessage(S2C.Agenda, (m: AgendaMsg) => {
    if (!m || !Array.isArray(m.events)) return;
    agendaStore.set({ events: m.events.filter(isEntry), offset: Number.isFinite(m.serverNow) ? m.serverNow - Date.now() : 0 });
  });
  room.onMessage(S2C.EventSoon, (m: EventSoonMsg) => { if (m && typeof m.name === "string" && Number.isFinite(m.start)) eventSoonStore.set(m); });
});

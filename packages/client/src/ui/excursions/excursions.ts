// Mural de Excursões (ciclo 18): o mural que o servidor manda (S2C.Excursions: a todos quando muda; pedido ao entrar e
// ao reconectar), os cartões de "Quero ir" e de lembrete (S2C.ExcursionPing) e as ações (C2S.Excursion). A lista aparece
// na aba Excursões da Agenda e no NPC Mural de Excursões, na praça (o único lugar onde se posta).
import { C2S, S2C, type ExcursionActionMsg, type ExcursionPingMsg, type ExcursionsMsg, type ExcursionView } from "@lemonquest/shared";
import { session } from "../../session.ts";
import { agendaOpen, toggleAgenda } from "../agenda/agenda.ts";
import { notifyAttention } from "../attention.ts";
import { createStore } from "../hud/store.ts";
import { send } from "../items/net.ts";

/** `offset`: relógio do servidor − relógio local, no recebimento (horários e "agora" do formulário vêm do servidor). */
export const excursionsStore = createStore<{ list: ExcursionView[]; offset: number } | null>(null);

export interface ExcursionCard { key: string; ping: ExcursionPingMsg; until: number }
/** Cartões na pilha do topo: "Fulano quer ir" (líder) e "sai em 2 min" (líder e inscritos). */
export const excursionCardsStore = createStore<ExcursionCard[]>([]);

/** "Quero ir" fica no topo por isso (o líder pode convidar dali); o lembrete até 1 min depois do horário. */
const JOIN_CARD_MS = 45_000;
const REMIND_AFTER_MS = 60_000;
const MAX_CARDS = 3;

/** Agora no relógio do servidor. */
export const excursionNow = (): number => Date.now() + (excursionsStore.get()?.offset ?? 0);

export const excursionAction = (m: ExcursionActionMsg): void => send(C2S.Excursion, m);

/** Aba aberta na janela da Agenda. */
export const agendaTabStore = createStore<"events" | "excursions">("events");

/** Abre a Agenda direto na aba Excursões (cartão de lembrete). */
export function openExcursionsInAgenda(): void {
  agendaTabStore.set("excursions");
  if (!agendaOpen.get()) toggleAgenda();
}

export function dismissCard(key: string): void {
  excursionCardsStore.set((l) => l.filter((c) => c.key !== key));
}

const isView = (e: ExcursionView | null | undefined): e is ExcursionView =>
  !!e && typeof e.id === "string" && typeof e.destLabel === "string" && !!e.leader && typeof e.leader.name === "string"
  && Array.isArray(e.members) && Number.isFinite(e.at) && Number.isFinite(e.slots);

let timer = 0;
function pruneLater(): void {
  window.clearTimeout(timer);
  const list = excursionCardsStore.get();
  if (!list.length) return;
  const next = Math.min(...list.map((c) => c.until));
  timer = window.setTimeout(() => {
    excursionCardsStore.set((l) => l.filter((c) => c.until > Date.now()));
    pruneLater();
  }, Math.max(50, next - Date.now()));
}

function onPing(m: ExcursionPingMsg): void {
  if (!m || typeof m.id !== "string" || typeof m.destLabel !== "string") return;
  let card: ExcursionCard;
  if (m.kind === "join" && typeof m.name === "string" && typeof m.playerId === "string") {
    card = { key: `join:${m.id}:${m.name}`, ping: m, until: Date.now() + JOIN_CARD_MS };
  } else if (m.kind === "reminder" && Number.isFinite(m.at)) {
    const offset = excursionsStore.get()?.offset ?? 0;
    card = { key: `remind:${m.id}`, ping: m, until: Math.max(Date.now() + JOIN_CARD_MS, m.at - offset + REMIND_AFTER_MS) };
  } else return;
  excursionCardsStore.set((l) => [...l.filter((c) => c.key !== card.key), card].slice(-MAX_CARDS));
  pruneLater();
  notifyAttention("party");
}

session.onRoom((room) => {
  excursionsStore.set(null);
  excursionCardsStore.set([]);
  room.onMessage(S2C.Excursions, (m: ExcursionsMsg) => {
    if (!m || !Array.isArray(m.list)) return;
    excursionsStore.set({ list: m.list.filter(isView), offset: Number.isFinite(m.serverNow) ? m.serverNow - Date.now() : 0 });
  });
  room.onMessage(S2C.ExcursionPing, onPing);
  // O mural é pedido aqui (e não empurrado no onJoin do servidor): o selo da Agenda já nasce certo.
  excursionAction({ action: "list" });
  room.onReconnect(() => excursionAction({ action: "list" }));
});

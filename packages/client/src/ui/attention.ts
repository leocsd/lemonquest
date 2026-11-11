// Chama a atenção de quem deixou o jogo em outra aba: o título da aba ganha um contador "(2) The Lemon Quest" e volta
// ao normal quando a aba é vista de novo. Fonte: sussurro, convite de troca/grupo, amigo entrando, início de evento e o
// aviso de 10 min antes de um evento agendado (S2C.EventSoon, ciclo 17).
import { GAME_NAME, S2C, type NoticeMsg } from "@lemonquest/shared";
import { session } from "../session.ts";
import { attentionTitle, isFriendNotice, type AttentionReason } from "./attentionLogic.ts";
import { eventSoonStore } from "./agenda/agenda.ts";
import { eventStore } from "./events/events.ts";
import { invitesStore } from "./party/party.ts";
import { tradeStore } from "./trade/trade.ts";

let count = 0;

function apply() { document.title = attentionTitle(GAME_NAME, count); }

/** Registra um aviso (só conta se a aba estiver escondida). */
export function notifyAttention(_reason: AttentionReason): void {
  if (!document.hidden) return;
  count++;
  apply();
}

function clear() {
  if (count === 0) return;
  count = 0;
  apply();
}

document.addEventListener("visibilitychange", () => { if (!document.hidden) clear(); });
window.addEventListener("focus", clear);

// Fontes que já são stores.
let prevEvent = eventStore.get()?.id;
eventStore.subscribe((e) => { if (e && e.id !== prevEvent) notifyAttention("event"); prevEvent = e?.id; });
eventSoonStore.subscribe((s) => { if (s) notifyAttention("eventSoon"); });
let prevInvites = invitesStore.get().length;
invitesStore.subscribe((l) => { if (l.length > prevInvites) notifyAttention("party"); prevInvites = l.length; });
tradeStore.subscribe((t) => { if (t.phase === "invite") notifyAttention("trade"); });

// Sussurro e amigos chegam pelo room.
session.onRoom((room) => {
  room.onMessage(S2C.Chat, (m: { channel?: string; from?: string }) => {
    if (m?.channel === "whisper" && m.from !== session.myName) notifyAttention("whisper");
  });
  room.onMessage(S2C.Notice, (m: NoticeMsg) => { if (typeof m?.text === "string" && isFriendNotice(m.text)) notifyAttention("friend"); });
});

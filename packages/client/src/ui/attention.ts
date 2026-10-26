// Chama a atenção de quem deixou o jogo em outra aba: o título da aba ganha um contador "(2) The Lemon Quest" e volta
// ao normal quando a aba é vista de novo. Fonte: sussurro, convite de troca/grupo, amigo entrando, início de evento, o
// aviso de 10 min antes de um evento agendado (S2C.EventSoon, ciclo 17) e, no ciclo 18, apanhar, ficar com vida baixa
// ou morrer (com uma marca no título e um intervalo entre avisos: combatAttention).
import { GAME_NAME, S2C, type CombatMsg, type NoticeMsg } from "@lemonquest/shared";
import { session } from "../session.ts";
import {
  attentionTitle, combatAttention, freshCombatAttention, hitsMe, isFriendNotice, nextAlert, type AttentionReason,
} from "./attentionLogic.ts";
import { eventSoonStore } from "./agenda/agenda.ts";
import { eventStore } from "./events/events.ts";
import { invitesStore } from "./party/party.ts";
import { tradeStore } from "./trade/trade.ts";

let count = 0;
let alert = "";
let combat = freshCombatAttention();

function apply() { document.title = attentionTitle(GAME_NAME, count, alert); }

/** Registra um aviso (só conta se a aba estiver escondida). */
export function notifyAttention(reason: AttentionReason): void {
  if (!document.hidden) return;
  count++;
  alert = nextAlert(alert, reason);
  apply();
}

function clear() {
  combat = freshCombatAttention();
  if (count === 0 && !alert) return;
  count = 0;
  alert = "";
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

// Sussurro, amigos e combate chegam pelo room. O combate não usa o meStore: ele publica por requestAnimationFrame, que
// o navegador para com a aba escondida; a vida vem direto do estado do Colyseus (atualizado a cada patch).
session.onRoom((room) => {
  room.onMessage(S2C.Chat, (m: { channel?: string; from?: string }) => {
    if (m?.channel === "whisper" && m.from !== session.myName) notifyAttention("whisper");
  });
  room.onMessage(S2C.Notice, (m: NoticeMsg) => { if (typeof m?.text === "string" && isFriendNotice(m.text)) notifyAttention("friend"); });
  room.onMessage(S2C.Combat, (m: CombatMsg) => {
    if (!document.hidden || !hitsMe(m?.events, session.myId)) return;
    // Estado do servidor sem tipos no cliente (ver hud/world.ts).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const me = (room.state as any)?.players?.get?.(session.myId) as { hp?: number; maxHp?: number } | undefined;
    const r = combatAttention(combat, me?.hp ?? 0, me?.maxHp ?? 0, Date.now());
    if (r) notifyAttention(r);
  });
  room.onMessage(S2C.Died, () => notifyAttention("died"));
});

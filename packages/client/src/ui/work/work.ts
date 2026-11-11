// Quadro da obra (ClickUp, ciclo 11): S2C.Work chega quando se abre um NPC com workBoard (Painel da Obra, Quadro de
// Gestão à Vista). Só leitura; o servidor já mandou tudo filtrado (shared/workFilter.ts).
import { C2S, S2C, type WorkLinkMsg, type WorkMsg } from "@lemonquest/shared";
import { session } from "../../session.ts";
import { createStore } from "../hud/store.ts";
import { send } from "../items/net.ts";

export const workStore = createStore<WorkMsg | null>(null);

session.onRoom((room) => {
  workStore.set(null);
  room.onMessage(S2C.Work, (m: WorkMsg) => workStore.set(m && typeof m.npcId === "string" && Array.isArray(m.tasks) ? m : null));
});

/** "há 3 min" a partir da última leitura do servidor. */
export function agoText(at: number, now = Date.now()): string {
  if (!at) return "nunca";
  const min = Math.max(0, Math.round((now - at) / 60_000));
  if (min < 1) return "agora há pouco";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  return `há ${h} h`;
}

/** Fração preenchida da barra (meta 0 = barra cheia se fechou algo). */
export const barFraction = (done: number, goal: number): number => (goal > 0 ? Math.min(1, done / goal) : done > 0 ? 1 : 0);

/** Manda o token pessoal UMA vez (não guarda em store, storage nem log; quem chama limpa o campo). */
export function linkWork(token: string): void {
  const m: WorkLinkMsg = { token: token.trim() };
  send(C2S.WorkLink, m);
}

export function unlinkWork(): void { send(C2S.WorkUnlink, {}); }

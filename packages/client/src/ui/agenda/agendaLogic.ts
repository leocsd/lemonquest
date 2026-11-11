// Agenda de eventos: o que mostrar a partir da lista da semana do servidor (S2C.Agenda). Puro (sem DOM) para testar.
import { clockText, eventDayText, type AgendaEntry } from "@lemonquest/shared";

/**
 * Ainda vale mostrar: não acabou. Uma janela agendada que já começou só aparece se for o evento em andamento (um admin
 * pode ter encerrado antes da hora, ou um evento manual vale no lugar dela).
 */
export function visibleAgenda(events: readonly AgendaEntry[], now: number, activeId: string | null): AgendaEntry[] {
  return events.filter((e) => e.end > now && (e.start > now || e.id === activeId));
}

/** Primeiro evento que ainda vai começar. */
export const nextEvent = (events: readonly AgendaEntry[], now: number): AgendaEntry | null => events.find((e) => e.start > now) ?? null;

/** Agrupa por dia de calendário ("Hoje", "Amanhã", "Qui"), mantendo a ordem. */
export function agendaByDay(events: readonly AgendaEntry[], now: number): { day: string; items: AgendaEntry[] }[] {
  const out: { day: string; items: AgendaEntry[] }[] = [];
  for (const e of events) {
    const d = eventDayText(e.start, now);
    const day = d.charAt(0).toUpperCase() + d.slice(1);
    const last = out.at(-1);
    if (last?.day === day) last.items.push(e); else out.push({ day, items: [e] });
  }
  return out;
}

/** Selo sem evento: "Próximo: Fúria de Demodras às 12:15" (hoje), "… amanhã às 12:15", "… qui às 17:00". */
export function nextEventLabel(e: Pick<AgendaEntry, "name" | "start">, now: number): string {
  const day = eventDayText(e.start, now);
  return `Próximo: ${e.name} ${day === "hoje" ? "" : `${day} `}às ${clockText(e.start)}`;
}

/** "começa em 8 min" (nunca "0 min"). */
export const startsInText = (start: number, now: number): string => `começa em ${Math.max(1, Math.ceil((start - now) / 60_000))} min`;

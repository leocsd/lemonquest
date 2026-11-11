// Etiqueta do evento com bônus: nome, bônus e horário de término, no topo da área de jogo. Sem evento, um selo discreto
// com o próximo da agenda ("Próximo: X às HH:MM"), que acende nos 10 min antes. Clique abre a Agenda.
import { EVENT_SOON_MS, eventBonusText } from "@lemonquest/shared";
import { useTicker } from "../arena/useTicker.ts";
import { agendaNow, agendaStore, toggleAgenda } from "../agenda/agenda.ts";
import { nextEvent, nextEventLabel, startsInText } from "../agenda/agendaLogic.ts";
import { useStore } from "../hud/store.ts";
import { eventStore } from "./events.ts";
import "./events.css";

const hhmm = (ms: number) => new Date(ms).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

export function EventBadge() {
  const e = useStore(eventStore);
  const agenda = useStore(agendaStore);
  useTicker(e ? 0 : 20_000); // o "Próximo" troca sozinho quando um evento começa/acaba e conta os minutos do aviso
  if (!e) {
    const now = agendaNow();
    const next = agenda ? nextEvent(agenda.events, now) : null;
    if (!next) return null;
    const soon = next.start - now <= EVENT_SOON_MS;
    return (
      <button
        class={`event-badge event-next${soon ? " soon" : ""}`} onClick={toggleAgenda} data-testid="event-next"
        data-tip={next.desc} data-tip-sub="Clique para ver a agenda da semana"
      >
        {soon && <span class="event-star" aria-hidden="true">★</span>}
        <span>{nextEventLabel(next, now)}</span>
        {soon && <span class="event-until">{startsInText(next.start, now)}</span>}
      </button>
    );
  }
  return (
    <div class="event-badge" role="status" aria-label={`Evento: ${e.name}`} data-testid="event-badge" data-tip={e.desc} data-tip-sub={`Termina às ${hhmm(e.until)}`} onClick={toggleAgenda}>
      <span class="event-star" aria-hidden="true">★</span>
      <b>{e.name}</b>
      <span class="event-bonus">{eventBonusText(e)}</span>
      <span class="event-until">até {hhmm(e.until)}</span>
    </div>
  );
}

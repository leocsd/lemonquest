// Janela "Agenda": o evento em andamento, o próximo em destaque e a semana agrupada por dia (botão do trilho; /agenda
// no chat mostra a mesma lista). Horários vêm do servidor (fuso dele, o mesmo do agendador).
import { clockText, eventBonusText, monsterDef, timeLeftText, type AgendaEntry } from "@lemonquest/shared";
import { useRef } from "preact/hooks";
import { getWorldIndex } from "../../game/worldIndex.ts";
import { useTicker } from "../arena/useTicker.ts";
import { guideTile } from "../hud/guideState.ts";
import { eventStore } from "../events/events.ts";
import { useStore } from "../hud/store.ts";
import { useDialogFocus } from "../hud/useDialogFocus.ts";
import { bindOverlay } from "../overlays.ts";
import { agendaByDay, nextEvent, visibleAgenda } from "./agendaLogic.ts";
import { agendaNow, agendaOpen, agendaStore } from "./agenda.ts";
import { ExcursionsTab } from "../excursions/ExcursionsTab.tsx";
import { openExcursions } from "../excursions/excursionLogic.ts";
import { agendaTabStore, excursionsStore } from "../excursions/excursions.ts";
import "./agenda.css";

// Esc pela pilha de sobreposições: fecha só esta janela (não tira o alvo).
bindOverlay("agenda", agendaOpen, (v) => v, () => agendaOpen.set(false));

const bossName = (id?: string) => (id ? monsterDef(id)?.name ?? id : "");

/** Evento de chefe: "Guiar" leva a seta até o covil (spawn do chefe no índice do mundo, ciclo 17-5). */
function GuideBoss({ boss }: { boss?: string }) {
  const spot = boss ? getWorldIndex()?.spawnsOf(boss)[0] : undefined;
  if (!boss || !spot) return null;
  return (
    <button class="shop-btn ag-guide" onClick={() => { guideTile(spot.x, spot.y, bossName(boss)); agendaOpen.set(false); }} data-tip="Guiar até o covil do chefe" data-tip-sub="Seta na tela e marca no minimapa">
      Guiar
    </button>
  );
}

function Row({ e, next, live }: { e: AgendaEntry; next: boolean; live: boolean }) {
  const bonus = eventBonusText(e);
  return (
    <li class={`ag-row${next ? " next" : ""}${live ? " live" : ""}`} data-event={e.id}>
      <span class="ag-time">{clockText(e.start)}<small>–{clockText(e.end)}</small></span>
      <span class="ag-main">
        <b>{e.name}</b>
        {live && <span class="ag-tag live">agora</span>}
        {next && <span class="ag-tag">próximo</span>}
        <span class="ag-desc">{e.desc}</span>
        {(bonus || e.boss || e.invasion) && (
          <span class="ag-meta">{[bonus, e.boss ? `chefe: ${bossName(e.boss)}` : "", e.invasion ? "⚔ invasão: defenda a Vila" : ""].filter(Boolean).join(" · ")}</span>
        )}
      </span>
      <GuideBoss boss={e.boss} />
    </li>
  );
}

export function AgendaWindow() {
  const open = useStore(agendaOpen);
  const data = useStore(agendaStore);
  const active = useStore(eventStore);
  const winRef = useRef<HTMLDivElement>(null);
  useDialogFocus(winRef, open);
  useTicker(open ? 30_000 : 0);
  const tab = useStore(agendaTabStore);
  const excursions = useStore(excursionsStore);
  if (!open) return null;
  const now = agendaNow();
  const list = data ? visibleAgenda(data.events, now, active?.id ?? null) : [];
  const next = nextEvent(list, now);
  const nEx = openExcursions(excursions?.list ?? []);
  return (
    <div ref={winRef} class="agenda-window panel" role="dialog" aria-label="Agenda de eventos" data-testid="agenda-window">
      <div class="ag-head">
        <b>Agenda de eventos</b>
        <button class="win-close ag-x" onClick={() => agendaOpen.set(false)} aria-label="Fechar">×</button>
      </div>
      {/* Ciclo 18: aba do Mural de Excursões (lista, Quero ir, sair; postar só no Mural, na praça). */}
      <div class="ag-tabs" role="tablist">
        <button class={`ag-tab${tab === "events" ? " active" : ""}`} role="tab" aria-selected={tab === "events"} onClick={() => agendaTabStore.set("events")}>Eventos</button>
        <button class={`ag-tab${tab === "excursions" ? " active" : ""}`} role="tab" aria-selected={tab === "excursions"} onClick={() => agendaTabStore.set("excursions")} data-testid="agenda-tab-excursions">
          Excursões{nEx > 0 && <span class="ag-tab-n">{nEx}</span>}
        </button>
      </div>
      {tab === "excursions" && <div class="ag-body"><ExcursionsTab /></div>}
      {tab === "events" && <div class="ag-body">
        {active && (
          <div class="ag-card live" data-testid="agenda-active">
            <span class="ag-card-k">Agora</span>
            <b>{active.name}</b>
            <span class="ag-desc">{active.desc}{eventBonusText(active) ? ` · ${eventBonusText(active)}` : ""} · até {clockText(active.until)}</span>
          </div>
        )}
        {next && (
          <div class="ag-card next" data-testid="agenda-next">
            <span class="ag-card-k">Próximo · em {timeLeftText(next.start, now)}</span>
            <b>{next.name}</b>
            <span class="ag-desc">{next.desc}{next.boss ? ` · chefe: ${bossName(next.boss)}` : ""}</span>
          </div>
        )}
        {!data && <div class="ag-empty">Carregando…</div>}
        {data && list.length === 0 && <div class="ag-empty">Nenhum evento agendado.</div>}
        {agendaByDay(list, now).map((d) => (
          <section key={d.day} class="ag-day">
            <h3>{d.day}</h3>
            <ul>{d.items.map((e) => <Row key={`${e.id}@${e.start}`} e={e} next={e === next} live={e.start <= now} />)}</ul>
          </section>
        ))}
      </div>}
      {tab === "events" && <div class="ag-foot">Horário do servidor. No chat: /agenda (a semana) e /evento (agora e o próximo). Avisamos 10 min antes de cada evento.</div>}
    </div>
  );
}

// Barra da Invasão da Vila na pilha do topo (App: .top-stack): onda e próxima, invasores vivos, abates contra a meta de
// defesa, líder e a SUA contribuição. No fim, o resultado fica ali por alguns segundos. Clique abre a Agenda.
import { useStore } from "../hud/store.ts";
import { useTicker } from "../arena/useTicker.ts";
import { agendaNow, toggleAgenda } from "../agenda/agenda.ts";
import { invasionResultStore, invasionStore } from "./invasion.ts";
import { invasionKillsLeft, invasionMineText, invasionOnTrack, invasionResultText, invasionWaveText } from "./invasionLogic.ts";
import "./invasion.css";

const TIP_SUB = "Derrote os invasores fora da Vila. 10 pontos (dano nos invasores ou cura em aliados) = Baú de Recompensa; +1 se a Vila resistir (75% derrotados e o líder).";

export function InvasionBar() {
  const s = useStore(invasionStore);
  const res = useStore(invasionResultStore);
  useTicker(s ? 15_000 : 0); // "próxima em X min"
  if (!s) {
    if (!res) return null;
    return (
      <div class={`invasion-bar result${res.defended ? " won" : " lost"}`} role="status" data-testid="invasion-result">
        <span class="inv-icon" aria-hidden="true">{res.defended ? "🛡" : "⚔"}</span>
        <span>{invasionResultText(res)}</span>
      </div>
    );
  }
  const left = invasionKillsLeft(s);
  const safe = invasionOnTrack(s);
  return (
    <div
      class={`invasion-bar${s.leader?.alive ? " leader" : ""}`} role="status" aria-label={`Invasão: ${s.name}`} data-testid="invasion-bar"
      data-tip={s.name} data-tip-sub={TIP_SUB} onClick={toggleAgenda}
    >
      <span class="inv-icon" aria-hidden="true">⚔</span>
      <b>{s.name}</b>
      <span class="sep">·</span>
      <span>{invasionWaveText(s, agendaNow())}</span>
      <span class="sep">·</span>
      <span data-testid="invasion-alive">{s.alive} {s.alive === 1 ? "invasor" : "invasores"}</span>
      <span class="sep">·</span>
      <span class={safe ? "inv-ok" : ""} data-tip="Defesa da Vila" data-tip-sub={left > 0 ? `Faltam ${left} abate(s) para a meta` : "Meta de abates batida"}>
        {s.killed}/{s.spawned} derrotados
      </span>
      {s.leader && (
        <>
          <span class="sep">·</span>
          <span class={s.leader.alive ? "inv-leader" : "inv-ok"}>{s.leader.alive ? `Líder: ${s.leader.name}` : "Líder derrotado"}</span>
        </>
      )}
      <span class="sep">·</span>
      <span class={`inv-mine${s.mine >= s.goal ? " inv-ok" : ""}`} data-testid="invasion-mine">{invasionMineText(s)}</span>
    </div>
  );
}

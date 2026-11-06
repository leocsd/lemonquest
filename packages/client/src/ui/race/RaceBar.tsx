// Barra da Corrida de Caça na pilha do topo (App: .top-stack): placar dos dois times, tempo e o SEU time e pontos. No
// fim, o resultado fica ali por alguns segundos. Clique abre a Agenda.
import { useStore } from "../hud/store.ts";
import { useTicker } from "../arena/useTicker.ts";
import { agendaNow, toggleAgenda } from "../agenda/agenda.ts";
import { raceResultStore, raceStore } from "./race.ts";
import { raceMineText, raceResultText, raceScoreText, raceTimeText } from "./raceLogic.ts";
import "./race.css";

const TIP_SUB = "Cada abate soma pontos para o seu time (1 a cada 10 levels do bicho; elite ×3, nomeado ×10, chefe 50). Quem pontuar no time vencedor ganha Baú de Recompensa.";

export function RaceBar() {
  const s = useStore(raceStore);
  const res = useStore(raceResultStore);
  useTicker(s ? 15_000 : 0); // "faltam X min"
  if (!s) {
    if (!res) return null;
    const won = res.winners.includes(res.team);
    return (
      <div class={`race-bar result${won ? " won" : ""}`} role="status" data-testid="race-result">
        <span aria-hidden="true">🏁</span>
        <span>{raceResultText(res)}</span>
      </div>
    );
  }
  return (
    <div
      class={`race-bar team-${s.team}`} role="status" aria-label={`Corrida de Caça: ${raceScoreText(s.points)}`} data-testid="race-bar"
      data-tip={s.name} data-tip-sub={TIP_SUB} onClick={toggleAgenda}
    >
      <span aria-hidden="true">🏁</span>
      <b>{s.name}</b>
      <span class="sep">·</span>
      <span class="race-score" data-testid="race-score">{raceScoreText(s.points)}</span>
      <span class="sep">·</span>
      <span>{raceTimeText(s.end, agendaNow())}</span>
      <span class="sep">·</span>
      <span class="race-mine">{raceMineText(s)}</span>
    </div>
  );
}

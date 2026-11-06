// Arena de Duelo (2026-11-06) na pilha do topo: cartões de convite (Aceitar/Recusar), a barra do duelo em andamento
// (lados e relógio) e o resultado por alguns segundos.
import { useStore } from "../hud/store.ts";
import { useTicker } from "../arena/useTicker.ts";
import { answerDuel, duelInvitesStore, duelResultStore, duelStore } from "./duel.ts";
import { duelBarText, duelInviteText, duelResultText } from "./duelLogic.ts";
import "./duel.css";

export function DuelInvites() {
  const list = useStore(duelInvitesStore);
  if (!list.length) return null;
  return (
    <div class="duel-invites">
      {list.map((i) => (
        <div key={i.fromId} class="panel duel-invite" role="alertdialog" aria-label={`Desafio de duelo de ${i.fromName}`}>
          <span><b>{i.fromName}</b> {duelInviteText(i)}</span>
          <span class="duel-invite-btns">
            <button class="party-btn primary" onClick={() => answerDuel(i.fromId, true)}>Aceitar</button>
            <button class="party-btn" onClick={() => answerDuel(i.fromId, false)}>Recusar</button>
          </span>
        </div>
      ))}
    </div>
  );
}

export function DuelBar() {
  const s = useStore(duelStore);
  const res = useStore(duelResultStore);
  useTicker(s ? 1000 : 0);
  if (!s) {
    if (!res) return null;
    return (
      <div class={`duel-bar result${res.won ? " won" : ""}`} role="status" data-testid="duel-result">
        <span aria-hidden="true">⚔</span>
        <span>{duelResultText(res)}</span>
      </div>
    );
  }
  return (
    <div class={`duel-bar ${s.phase}`} role="status" data-testid="duel-bar">
      <span aria-hidden="true">⚔</span>
      <span>{duelBarText(s, Date.now())}</span>
    </div>
  );
}

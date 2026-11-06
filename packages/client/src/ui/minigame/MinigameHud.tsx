// Barra do minijogo na pilha do topo: jogo, onda/rodada ou relógio, suas vidas, o placar e o botão Sair.
import { MINIGAMES } from "@lemonquest/shared";
import { session } from "../../session.ts";
import { useStore } from "../hud/store.ts";
import { useTicker } from "../arena/useTicker.ts";
import { minigameAction, minigameStateStore } from "./minigame.ts";
import { barText, hearts, standings } from "./minigameLogic.ts";
import "./minigame.css";

export function MinigameBar() {
  const st = useStore(minigameStateStore);
  useTicker(st && (st.s.phase === "countdown" || st.s.game === "pega") ? 250 : 0);
  if (!st) return null;
  const { s, offset } = st;
  const me = s.players.find((p) => p.id === session.myId);
  const def = MINIGAMES[s.game];
  const top = standings(s.players).slice(0, 4);
  return (
    <div class={`arena-bar mg-bar ${s.phase}`} role="status" data-testid="minigame-bar">
      <div class="mg-bar-row">
        <span aria-hidden="true">🎲</span>
        <span>{barText(s, offset)}</span>
        {me && !def.coop && s.phase !== "ended" && (
          <span class={`mg-hearts${me.out ? " out" : ""}`} data-tip="Suas vidas do minijogo" data-tip-sub="Não é a vida do personagem.">
            {s.game === "pega" ? <>🍋 <b>{me.score}</b></> : me.out ? "fora" : hearts(me.lives)}
          </span>
        )}
        {s.phase !== "ended" && <button class="arena-btn arena-leave" onClick={() => minigameAction({ action: "leave" })}>Sair</button>}
      </div>
      {s.players.length > 1 && (
        <div class="mg-score">
          {top.map((p) => (
            <span key={p.id} class={p.out ? "out" : ""}>{p.name} <b>{p.score}</b></span>
          ))}
        </div>
      )}
    </div>
  );
}

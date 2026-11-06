// Janela do Mestre do Salão (Salão de Minijogos, 2026-11-06): as duas salas (abrir com um jogo, entrar, começar, sair),
// os recordes da semana de cada jogo e a troca de Fichas do Salão por tons de roupa exclusivos.
import { useState } from "preact/hooks";
import {
  FICHA_ID, MINIGAMES, MINIGAME_DAILY_FICHAS, MINIGAME_IDS, MINIGAME_SHOP_TONES, toneDef, type MinigameId, type MinigameRoomSummary,
} from "@lemonquest/shared";
import { session } from "../../session.ts";
import { useStore } from "../hud/store.ts";
import { useDialogFocus } from "../hud/useDialogFocus.ts";
import { useWindowDrag } from "../hud/useWindowDrag.ts";
import { inventoryStore } from "../items/inventory.ts";
import { outfitTonesStore } from "../outfit/outfit.ts";
import { swatchBackground } from "../outfit/colorize.ts";
import { closeMinigameWindow, minigameAction, minigameLobbyStore, minigameWindowOpen } from "./minigame.ts";
import { PHASE_LABEL, roomAction } from "./minigameLogic.ts";
import "./minigame.css";

function Room({ r, mine, pick }: { r: MinigameRoomSummary; mine: number | undefined; pick: MinigameId }) {
  const act = roomAction(r, mine);
  const host = r.host === session.myName;
  return (
    <li class={`mg-room${act === "mine" ? " mine" : ""}`}>
      <div class="mg-room-main">
        <div class="mg-room-title">Sala {r.id} · {r.game ? MINIGAMES[r.game].name : "livre"}</div>
        <div class="mg-room-sub">{PHASE_LABEL[r.phase]}{r.players.length ? ` · ${r.players.join(", ")}` : ""}</div>
      </div>
      <div class="mg-room-btns">
        {act === "open" && <button class="arena-btn primary" onClick={() => minigameAction({ action: "join", room: r.id, game: pick })}
          data-tip={`Abrir a sala ${r.id} com ${MINIGAMES[pick].name}`} data-tip-sub="Você vira o anfitrião: espere os amigos entrarem e clique Começar.">Abrir</button>}
        {act === "join" && <button class="arena-btn primary" onClick={() => minigameAction({ action: "join", room: r.id })}>Entrar</button>}
        {act === "full" && <span class="arena-slots">cheia</span>}
        {act === "mine" && r.phase === "lobby" && host && (
          <button class="arena-btn primary" onClick={() => minigameAction({ action: "start" })}>Começar{r.players.length === 1 ? " (solo)" : ""}</button>
        )}
        {act === "mine" && <button class="arena-btn" onClick={() => minigameAction({ action: "leave" })}>Sair</button>}
      </div>
    </li>
  );
}

export function MinigameWindow() {
  const open = useStore(minigameWindowOpen);
  const lobby = useStore(minigameLobbyStore);
  const inv = useStore(inventoryStore);
  const owned = useStore(outfitTonesStore);
  const [pick, setPick] = useState<MinigameId>("chuva");
  const drag = useWindowDrag("minigame");
  useDialogFocus(drag.ref, open);
  if (!open) return null;
  let fichas = 0;
  for (const it of inv?.backpack ?? []) if (it && it.defId === FICHA_ID) fichas += it.count;
  return (
    <div ref={drag.ref} class={`hud-card hud-window mg-window${drag.dragging ? " dragging" : ""}`} style={drag.style} role="dialog" aria-label="Salão de Minijogos">
      <div class="win-title" onPointerDown={drag.onTitleDown}>
        <span class="win-grip" aria-hidden="true" />
        <span>Salão de Minijogos</span>
        <button class="win-close" onClick={closeMinigameWindow} data-tip="Fechar" data-tip-sub="Esc" aria-label="Fechar">×</button>
      </div>
      <div class="arena-body">
        <div class="arena-hint">Aqui ninguém se machuca de verdade: cada um tem 3 vidas de brincadeira, sem perder vida, XP ou item. O chão avisa antes: saia dos tiles marcados. Magias não funcionam dentro das salas.</div>
        <div class="arena-sub">Escolha o jogo</div>
        <div class="mg-games" role="radiogroup" aria-label="Jogo">
          {MINIGAME_IDS.map((id) => (
            <button key={id} class={`mg-game${pick === id ? " sel" : ""}`} role="radio" aria-checked={pick === id} onClick={() => setPick(id)}
              data-testid={`mg-game-${id}`}>
              <b>{MINIGAMES[id].name}</b>{MINIGAMES[id].coop ? <span class="mg-tag">cooperativo</span> : null}
            </button>
          ))}
        </div>
        <div class="mg-desc">{MINIGAMES[pick].desc}</div>
        <div class="arena-sub">Salas</div>
        {!lobby ? <div class="hud-empty">Carregando…</div> : (
          <ul class="mg-rooms">{lobby.rooms.map((r) => <Room key={r.id} r={r} mine={lobby.mine} pick={pick} />)}</ul>
        )}
        <div class="arena-sub">Recordes da semana · {MINIGAMES[pick].name}</div>
        {!(lobby?.records[pick]?.length) ? <div class="arena-time-row"><span class="arena-time-names">ninguém ainda</span></div>
          : lobby.records[pick]!.map((r, i) => (
            <div key={r.at} class="arena-time-row">
              <span>{i + 1}º</span>
              <b>{r.score} {MINIGAMES[pick].scoreLabel}</b>
              <span class="arena-time-names" data-tip={r.names.join(", ")}>{r.names.join(", ")}</span>
            </div>
          ))}
        <div class="arena-sub">Fichas do Salão</div>
        <div class="arena-info">
          Você tem <b>{fichas}</b> ficha(s) · hoje: <b>{lobby?.fichasToday ?? 0}/{MINIGAME_DAILY_FICHAS}</b>
        </div>
        <ul class="mg-shop">
          {MINIGAME_SHOP_TONES.map((id) => {
            const t = toneDef(id);
            if (!t) return null;
            const have = owned.includes(id);
            return (
              <li key={id} class="mg-tone">
                <span class="mg-swatch" style={{ background: swatchBackground(t.color) }} aria-hidden="true" />
                <span class="mg-tone-name">{t.name}</span>
                {have ? <span class="mg-owned">na conta</span> : (
                  <button class="arena-btn" disabled={fichas < (t.fichas ?? 0)} onClick={() => minigameAction({ action: "buyTone", toneId: id })}
                    data-tip={`Tom de roupa ${t.name}`} data-tip-sub="Vale para todos os personagens da conta; vista na janela de roupas.">{t.fichas} fichas</button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

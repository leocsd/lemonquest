// Cartões do Mural de Excursões na pilha do topo: "Fulano quer ir" (para o líder, com Convidar — o mesmo convite de
// grupo do botão direito) e "sai em 2 min" (líder: Convidar todos; inscritos: Ver).
import { C2S, type PartyActionMsg } from "@lemonquest/shared";
import { useStore } from "../hud/store.ts";
import { vocationMeta } from "../hud/vocations.ts";
import { send } from "../items/net.ts";
import { excursionClock } from "./excursionLogic.ts";
import { dismissCard, excursionAction, excursionCardsStore, excursionNow, openExcursionsInAgenda } from "./excursions.ts";
import "./excursions.css";

export function ExcursionCards() {
  const cards = useStore(excursionCardsStore);
  if (!cards.length) return null;
  return (
    <div class="ex-cards">
      {cards.map(({ key, ping }) => (
        <div key={key} class={`panel ex-ping ex-ping-${ping.kind}`} role="alertdialog" aria-label="Mural de Excursões" data-testid={`excursion-ping-${ping.kind}`}>
          {ping.kind === "join" ? (
            <>
              <span class="ex-ping-text">
                <b style={{ color: vocationMeta(ping.vocation).color }}>{ping.name}</b> (lv {ping.level}) quer ir na sua excursão: {ping.destLabel}.
              </span>
              <span class="ex-ping-btns">
                <button class="party-btn primary" onClick={() => { send(C2S.Party, { action: "invite", targetId: ping.playerId } satisfies PartyActionMsg); dismissCard(key); }}>Convidar</button>
                <button class="party-btn" onClick={() => dismissCard(key)} aria-label="Fechar">×</button>
              </span>
            </>
          ) : (
            <>
              <span class="ex-ping-text">
                🧭 {ping.leading ? "Sua excursão" : `Excursão de ${ping.leader}`}: <b>{ping.destLabel}</b> sai às {excursionClock(ping.at, excursionNow())}.
                {ping.leading ? " Junte o grupo!" : " Fique de olho no convite."}
              </span>
              <span class="ex-ping-btns">
                {ping.leading
                  ? <button class="party-btn primary" onClick={() => { excursionAction({ action: "inviteAll", id: ping.id }); dismissCard(key); }}>Convidar todos</button>
                  : <button class="party-btn" onClick={() => { openExcursionsInAgenda(); dismissCard(key); }}>Ver</button>}
                <button class="party-btn" onClick={() => dismissCard(key)} aria-label="Fechar">×</button>
              </span>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

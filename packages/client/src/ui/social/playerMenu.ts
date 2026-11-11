// Menu do botão direito em jogadores: o mesmo no mundo (WorldScene) e na lista de Batalha. Monta o estado a partir dos
// stores e abre o menu de contexto; a ordem dos itens (Atacar por último, em vermelho) vive em playerMenuLogic.ts.
import { session } from "../../session.ts";
import { followPlayer } from "../hud/FightMode.tsx";
import { getTarget, toggleTarget } from "../hud/target.ts";
import { playersStore, selectMe } from "../hud/world.ts";
import { openCtxMenu, openOutfit } from "../outfit/outfit.ts";
import { amLeader, isPartyMember, partyAction, partyStore } from "../party/party.ts";
import { requestTrade } from "../trade/trade.ts";
import { playerMenuItems, selfMenuItems } from "./playerMenuLogic.ts";

/** Outro jogador (id = sessionId), menu em (x, y) da janela. */
export function openPlayerMenu(id: string, x: number, y: number): void {
  const following = selectMe(playersStore.get())?.followId === id;
  openCtxMenu(x, y, playerMenuItems(
    { attacking: getTarget()?.id === id, following, inParty: !!partyStore.get(), leader: amLeader(), member: isPartyMember(id, true) },
    {
      attack: () => toggleTarget({ id, kind: "player" }),
      follow: () => followPlayer(following ? null : id),
      trade: () => requestTrade(id),
      invite: () => partyAction({ action: "invite", targetId: id }),
      lead: () => partyAction({ action: "lead", targetId: id }),
      kick: () => partyAction({ action: "kick", targetId: id }),
    },
  ));
}

/** Botão direito em você. `pickup` = pegar o item do chão do seu tile (null = não há). */
export function openSelfMenu(x: number, y: number, pickup: (() => void) | null): void {
  openCtxMenu(x, y, selfMenuItems(
    { groundHere: !!pickup, inParty: !!partyStore.get() },
    { outfit: openOutfit, pickup: () => pickup?.(), leaveParty: () => partyAction({ action: "leave" }), switchCharacter: () => void session.switchCharacter() },
  ));
}

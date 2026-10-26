// Painel Online (ciclo 18): a lista que o servidor manda só para você (S2C.Online: ao entrar, quando a sua lista muda e
// sob pedido) e as ações (C2S.Social: pedir a lista, pôr/tirar amigo). Convidar usa o C2S.Party de sempre.
import { C2S, S2C, type OnlineEntry, type OnlineMsg, type SocialActionMsg } from "@lemonquest/shared";
import { session } from "../../session.ts";
import { createStore } from "../hud/store.ts";
import { send } from "../items/net.ts";

export const onlineStore = createStore<OnlineMsg | null>(null);

export const socialAction = (m: SocialActionMsg): void => send(C2S.Social, m);
export const setFriend = (name: string, on: boolean): void => socialAction({ action: "friend", name, on });

const isEntry = (e: OnlineEntry | null | undefined): e is OnlineEntry =>
  !!e && typeof e.id === "string" && typeof e.name === "string" && Number.isFinite(e.level);

session.onRoom((room) => {
  onlineStore.set(null);
  room.onMessage(S2C.Online, (m: OnlineMsg) => {
    if (!m || !Array.isArray(m.list)) return;
    onlineStore.set({ list: m.list.filter(isEntry), offlineFriends: Array.isArray(m.offlineFriends) ? m.offlineFriends.filter((n) => typeof n === "string") : [] });
  });
  socialAction({ action: "list" });
  room.onReconnect(() => socialAction({ action: "list" }));
});

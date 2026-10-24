// Estado da janela de NPC (diálogo/loja/depot). O mundo (Phaser) chama openNpc(npcId) ao clicar num NPC.
import { BOUNTY_NPC, C2S, QUEST_LIST, REQUEST_NPC, npcDef, type NpcInteractMsg, type NpcOpenMsg, type NpcTradeMsg, type TravelMsg } from "@lemonquest/shared";
import { createStore } from "../hud/store.ts";
import { send } from "../items/net.ts";
import { closeArenaWindow, openArenaWindow } from "../arena/arena.ts";

export type NpcTab = "work" | "quests" | "bounties" | "request" | "travel" | "buy" | "sell" | "depot";
export interface NpcState { msg: NpcOpenMsg; tab: NpcTab; /** muda a cada nova abertura (reinicia a digitação). */ nonce: number }

export const npcStore = createStore<NpcState | null>(null);
let nonce = 0;

/** Pede ao servidor para falar com o NPC (a janela abre quando chegar S2C.NpcOpen). */
export function openNpc(npcId: string): void {
  const m: NpcInteractMsg = { npcId };
  send(C2S.NpcInteract, m);
}

export function closeNpc(): void { npcStore.set(null); }

export const npcTabs = (m: NpcOpenMsg): NpcTab[] => {
  const t: NpcTab[] = [];
  if (npcDef(m.npcId)?.workBoard) t.push("work"); // quadro da obra (ClickUp): ui/work
  if (m.npcId === BOUNTY_NPC) t.push("bounties");
  if (m.npcId === REQUEST_NPC) t.push("request");
  if (QUEST_LIST.some((q) => q.giver === m.npcId)) t.push("quests");
  if (m.travel?.length) t.push("travel");
  if (m.shop?.sells.length) t.push("buy");
  if (m.shop?.buys?.length) t.push("sell");
  if (m.depot) t.push("depot");
  return t;
};

/** S2C.NpcOpen: npcId "" fecha; senão abre/atualiza a janela. */
export function handleNpcOpen(m: NpcOpenMsg): void {
  if (!m.npcId) { closeNpc(); closeArenaWindow(); return; }
  // Mestre do Coliseu: abre a janela própria (lobbies) no lugar do diálogo.
  if (m.npcId === "arena_master") { closeNpc(); openArenaWindow(); return; }
  const cur = npcStore.get();
  if (cur && cur.msg.npcId === m.npcId) {
    const tabs = npcTabs(m);
    npcStore.set({ ...cur, msg: m, tab: tabs.includes(cur.tab) ? cur.tab : tabs[0] ?? "buy" });
    return;
  }
  npcStore.set({ msg: m, tab: npcTabs(m)[0] ?? "buy", nonce: ++nonce });
}

export function setNpcTab(tab: NpcTab): void {
  npcStore.set((s) => (s ? { ...s, tab } : s));
}

export function buyItem(npcId: string, itemId: string, count: number): void {
  const m: NpcTradeMsg = { npcId, action: "buy", itemId, count };
  send(C2S.NpcTrade, m);
}
export function sellItem(npcId: string, index: number, count: number): void {
  const m: NpcTradeMsg = { npcId, action: "sell", index, count };
  send(C2S.NpcTrade, m);
}

/** Vende tudo da mochila que o NPC compra. */
export function sellAll(npcId: string): void {
  const m: NpcTradeMsg = { npcId, action: "sellAll" };
  send(C2S.NpcTrade, m);
}

export function travelTo(npcId: string, dest: string): void {
  const m: TravelMsg = { npcId, dest };
  send(C2S.Travel, m);
}

export function buyBlessing(npcId: string): void {
  const m: NpcTradeMsg = { npcId, action: "blessing" };
  send(C2S.NpcTrade, m);
}

export function buyCasinoTicket(npcId: string): void {
  const m: NpcTradeMsg = { npcId, action: "casino" };
  send(C2S.NpcTrade, m);
}

export function buyImbuement(npcId: string, effect: string): void {
  const m: NpcTradeMsg = { npcId, action: "imbuement", effect };
  send(C2S.NpcTrade, m);
}

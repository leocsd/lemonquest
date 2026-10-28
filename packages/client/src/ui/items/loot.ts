// Loot recebido (S2C.Loot) → pilha de toasts no canto inferior direito + som; S2C.Feed → chat + faixa de notícias.
import type { FeedMsg, LootMsg } from "@lemonquest/shared";
import { sfx } from "../../game/sfx.ts";
import { createStore } from "../hud/store.ts";

export interface LootToast { id: number; msg: LootMsg; big: boolean }
export const lootToastsStore = createStore<LootToast[]>([]);
let nextId = 1;
export const LOOT_LIFE_MS = 5000;
const MAX_TOASTS = 4;

export function handleLoot(msg: LootMsg): void {
  // Mochila cheia (itens no chão ou perdidos): o aviso vem do servidor (S2C.Notice); aqui só o cartão do loot. O que o
  // filtro de loot deixou no chão (`left`) aparece no cartão, apagado, para o jogador saber o que ficou.
  if (!msg.items.length && !msg.gold && !msg.lostFull && !msg.left?.length) return;
  const best = msg.items.reduce<number>((m, it) => Math.max(m, ["common", "uncommon", "rare", "epic", "legendary"].indexOf(it.rarity)), 0);
  const big = best >= 3;
  const toast: LootToast = { id: nextId++, msg, big };
  lootToastsStore.set((l) => [...l.slice(-(MAX_TOASTS - 1)), toast]);
  setTimeout(() => lootToastsStore.set((l) => l.filter((t) => t.id !== toast.id)), big ? LOOT_LIFE_MS + 2000 : LOOT_LIFE_MS);
  if (best === 4) sfx.play("levelup", { volume: 0.35 });
  else if (best === 3) sfx.play("skillup", { volume: 0.7 });
  else if (msg.gold > 0 || msg.items.length) sfx.play("xp", { volume: 0.35 });
}

// ---------- Feed global ----------
export interface FeedEntry extends FeedMsg { id: number; ts: number }
type FeedFn = (e: FeedEntry) => void;
const feedSubs = new Set<FeedFn>();
export const onFeed = (fn: FeedFn): (() => void) => { feedSubs.add(fn); return () => { feedSubs.delete(fn); }; };

/** Notícias em destaque (drop/boss) na faixa do topo. */
export const tickerStore = createStore<FeedEntry[]>([]);
export const TICKER_LIFE_MS = 6000;

export const FEED_COLOR: Record<FeedMsg["kind"], string> = {
  drop: "#d9a441", level: "#7fd18b", boss: "#ff7a6b", death: "#a07878", info: "#8fb0f0",
};

export function handleFeed(msg: FeedMsg): void {
  const e: FeedEntry = { ...msg, id: nextId++, ts: Date.now() };
  for (const f of [...feedSubs]) f(e);
  if (msg.kind === "drop" || msg.kind === "boss") {
    tickerStore.set((l) => [...l.slice(-1), e]);
    setTimeout(() => tickerStore.set((l) => l.filter((x) => x.id !== e.id)), TICKER_LIFE_MS);
    if (msg.kind === "boss") sfx.play("sp_taunt", { volume: 0.5 });
  }
}

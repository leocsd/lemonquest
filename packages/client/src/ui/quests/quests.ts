// Estado das missões no cliente: S2C.Quests (estado completo), S2C.QuestComplete (cartão de recompensa) e ações (C2S.Quest).
// Coletar/entregar contam a mochila aqui (inventoryStore), igual ao servidor.
import {
  C2S, MONSTERS, S2C, itemDef, questDef, stepProgress,
  type ItemCounter, type QuestActionMsg, type QuestCompleteMsg, type QuestDef, type QuestReward, type QuestsMsg,
} from "@lemonquest/shared";
import { session } from "../../session.ts";
import { createStore, persistedBool, selectStore } from "../hud/store.ts";
import { meStore } from "../hud/world.ts";
import { send } from "../items/net.ts";
import { inventoryStore } from "../items/inventory.ts";

export const questStore = createStore<QuestsMsg | null>(null);
/** Cartão "Missão concluída" (some sozinho). */
export const questDoneStore = createStore<(QuestCompleteMsg & { id: number }) | null>(null);
export const questLogOpen = createStore(false);
/** Rastreador recolhido (lembrado). */
export const trackerCollapsed = persistedBool("questTracker.collapsed", false);
/** Só o level do jogador (o snapshot muda a cada passo; diário, rastreador e cartão não redesenham por isso). */
export const myLevelStore = selectStore(meStore, (m) => m?.level ?? 0);

const DONE_MS = 5500;
let doneSeq = 0;
let doneTimer = 0;

session.onRoom((room) => {
  questStore.set(null);
  room.onMessage(S2C.Quests, (m: QuestsMsg) => questStore.set(m));
  room.onMessage(S2C.QuestComplete, (m: QuestCompleteMsg) => {
    questDoneStore.set({ ...m, id: ++doneSeq });
    window.clearTimeout(doneTimer);
    doneTimer = window.setTimeout(() => questDoneStore.set(null), DONE_MS);
  });
});

export function questAction(m: QuestActionMsg): void { send(C2S.Quest, m); }

export const toggleQuestLog = (): void => questLogOpen.set((v) => !v);

/** Contador de itens da mochila (para coletar/entregar). */
export function inventoryCounter(): ItemCounter {
  const bp = inventoryStore.get()?.backpack ?? [];
  return (id) => {
    let n = 0;
    for (const it of bp) if (it && it.defId === id) n += it.count;
    return n;
  };
}

export interface StepLine { label: string; cur: number; max: number; done: boolean }

/** Linhas de progresso de uma missão ativa (ou zeradas, para missões ainda não aceitas). */
export function stepLines(def: QuestDef, progress: readonly number[] | undefined, count: ItemCounter): StepLine[] {
  return def.steps.map((s, i) => {
    const cur = progress ? stepProgress(s, progress[i] ?? 0, count) : 0;
    return { label: s.label, cur, max: s.count, done: cur >= s.count };
  });
}

/** "+100 XP · +30 de ouro · 5x Poção de Vida" */
export function rewardText(r: Pick<QuestReward, "xp" | "gold" | "items">): string {
  const parts: string[] = [];
  if (r.xp) parts.push(`+${r.xp.toLocaleString("pt-BR")} XP`);
  if (r.gold) parts.push(`+${r.gold.toLocaleString("pt-BR")} de ouro`);
  for (const it of r.items ?? []) parts.push(`${it.count}x ${itemDef(it.itemId)?.name ?? it.itemId}`);
  return parts.join(" · ");
}

export function monsterName(id: string): string { return MONSTERS[id]?.name ?? id; }

export { questDef };

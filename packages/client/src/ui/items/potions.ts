// Poções rápidas (Q = vida, E = mana) e recarga compartilhada: a de quem bebeu vale para qualquer poção (vida 2 s,
// mana 1 s — `use.cooldownMs` do item, HEALTH_POTION_CD_MS / MANA_POTION_CD_MS no shared).
import { C2S, itemDef, pickQuickPotion, type ItemInstance, type QuickPotionKind, type QuickPotionMsg } from "@lemonquest/shared";
import { pushToast } from "../toasts.ts";
import { createStore, selectStore } from "../hud/store.ts";
import { meStore } from "../hud/world.ts";
import { defOf, inventoryStore } from "./inventory.ts";
import { send } from "./net.ts";

export type PotionKind = QuickPotionKind;

/** Level do jogador local (avisa só no level up). Antes do primeiro estado não bloqueia nada: o servidor decide. */
export const myLevelStore = selectStore(meStore, (m) => m?.level ?? Infinity);
export const POTION_CD_MS = 1000;

export interface PotionCd { start: number; end: number }
export const potionCdStore = createStore<PotionCd | null>(null);

export function startPotionCooldown(ms = POTION_CD_MS): void {
  const now = performance.now();
  potionCdStore.set({ start: now, end: now + ms });
}
export function potionCooling(): boolean {
  const c = potionCdStore.get();
  return !!c && c.end > performance.now();
}

/**
 * A poção que Q/E bebe: a melhor que o level permite (a mesma regra do servidor, shared pickQuickPotion).
 * Sem nenhuma usável, `needLevel` > 0 diz o level que destrava alguma da mochila.
 */
export function quickPotionPick(kind: PotionKind): { it: ItemInstance | null; needLevel: number } {
  const bp = inventoryStore.get()?.backpack ?? [];
  const { index, needLevel } = pickQuickPotion(bp, kind, myLevelStore.get(), itemDef, meStore.get()?.vocation);
  return { it: index >= 0 ? bp[index] ?? null : null, needLevel };
}

export function quickPotion(kind: PotionKind): void {
  const { it, needLevel } = quickPotionPick(kind);
  if (!it) {
    const text = needLevel ? `Você precisa ser level ${needLevel} para usar isso.` : kind === "hp" ? "Você não tem poção de vida." : "Você não tem poção de mana.";
    pushToast({ text, kind: "warn" }, 800);
    return;
  }
  if (potionCooling()) return;
  const m: QuickPotionMsg = { kind };
  send(C2S.QuickPotion, m);
  startPotionCooldown(defOf(it)?.use?.cooldownMs ?? POTION_CD_MS);
}

// Regras de item que o servidor aplica e o cliente espelha (para não mostrar como possível o que o servidor recusa):
// level mínimo dos usáveis, qual poção as teclas Q/E bebem, onde o clique rápido guarda um item (mochila ↔ depot) e a
// mistura de comidas no estado "alimentado".
import type { ItemDef, ItemInstance } from "./data/items.ts";
import { maxStackOf } from "./shop.ts";

/** Level que falta para usar `def` (0 = pode). Vale para poção, comida e equipamento (o `level` do item). */
export function levelNeeded(def: ItemDef | undefined, level: number): number {
  const need = def?.level ?? 0;
  return need > level ? need : 0;
}

export type QuickPotionKind = "hp" | "mana";

/** Quanto a poção recupera do tipo da tecla (Q = vida, E = mana); 0 = não serve (comida e baú também não). */
export function potionAmount(def: ItemDef | undefined, kind: QuickPotionKind): number {
  const u = def?.use;
  if (!u || u.food || u.chest) return 0;
  return Math.max(0, (kind === "hp" ? u.heal : u.mana) ?? 0);
}

/**
 * Poção das teclas Q/E: a que mais recupera entre as que o level permite (empate: a primeira da mochila). Antes era a
 * primeira da mochila, e o servidor nem conferia o level: a Grande (lv 30) curava 450 no lv 1.
 * `index` -1 = nenhuma usável; aí `needLevel` > 0 é o menor level que destrava alguma das que estão na mochila.
 */
export function pickQuickPotion(
  slots: readonly (ItemInstance | null | undefined)[], kind: QuickPotionKind, level: number,
  defOf: (id: string) => ItemDef | undefined,
): { index: number; needLevel: number } {
  let index = -1, best = 0, needLevel = 0;
  slots.forEach((it, i) => {
    const d = it ? defOf(it.defId) : undefined;
    const amount = potionAmount(d, kind);
    if (amount <= 0) return;
    const need = levelNeeded(d, level);
    if (need > 0) { if (!needLevel || need < needLevel) needLevel = need; return; }
    if (amount > best) { best = amount; index = i; }
  });
  return { index, needLevel: index >= 0 ? 0 : needLevel };
}

/**
 * Onde o clique rápido põe `it` em `slots` (depot ou mochila): a primeira pilha igual (mesmo item e raridade) com
 * espaço, senão o primeiro espaço vazio; -1 = cheio de verdade. O que não couber nessa pilha o servidor espalha pelas
 * outras pilhas e espaços vazios do destino (InventorySystem.moveContainer).
 */
export function stackTarget(slots: readonly (ItemInstance | null | undefined)[], it: ItemInstance, def: ItemDef | undefined): number {
  if (def?.stackable) {
    const max = maxStackOf(def);
    const i = slots.findIndex((s) => !!s && s.defId === it.defId && s.rarity === it.rarity && s.count < max);
    if (i >= 0) return i;
  }
  return slots.findIndex((s) => !s);
}

export interface FedRates { hpPerTick: number; manaPerTick: number }

/**
 * Comer em cima de comida (ciclo 14): a duração soma até `maxMs` e as taxas viram a média ponderada pelo tempo (o
 * restante do que já comeu × o tempo que a nova acrescenta). Assim a regeneração total é a soma da de cada comida.
 * Antes valia a MAIOR taxa pelo tempo somado: um Presunto de Dragão e um punhado de nozes davam a taxa do presunto por
 * 20 min. Taxas fracionárias (o servidor acumula o resto entre os ticks).
 */
export function blendFood(
  cur: (FedRates & { remainingMs: number }) | undefined, food: FedRates & { durationMs: number }, maxMs: number,
): FedRates & { remainingMs: number } {
  const kept = Math.max(0, Math.min(maxMs, cur?.remainingMs ?? 0));
  const added = Math.max(0, Math.min(food.durationMs, maxMs - kept));
  const total = kept + added;
  if (total <= 0) return { remainingMs: 0, hpPerTick: food.hpPerTick, manaPerTick: food.manaPerTick };
  // Arredonda o ruído de ponto flutuante (12 × a + 12 × b sobre a + b tem de dar 12, não 11,999…).
  const mix = (a: number, b: number) => Math.round(((a * kept + b * added) / total) * 1e4) / 1e4;
  return {
    remainingMs: total,
    hpPerTick: mix(cur?.hpPerTick ?? 0, food.hpPerTick),
    manaPerTick: mix(cur?.manaPerTick ?? 0, food.manaPerTick),
  };
}

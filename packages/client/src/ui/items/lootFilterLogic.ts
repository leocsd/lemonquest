// Janela "Loot automático": busca por nome (sem acento), contagem por grupo e as ações em lote sobre a lista `skip`.
// Puro (sem DOM) para testar.
import type { ItemDef } from "@lemonquest/shared";
import { foldText } from "../npc/depotSearch.ts";

/** Degraus do "Desmarcar o que vale menos de" (valor de tabela, em ouro). */
export const LOOT_VALUE_STEPS: readonly number[] = [50, 100, 250, 500, 1000, 2500];

/** Itens cujo nome contém a busca (sem acento nem caixa, como a busca do depot; vazia = todos). */
export function searchItems(items: readonly ItemDef[], query: string): ItemDef[] {
  const q = foldText(query);
  return q ? items.filter((d) => foldText(d.name).includes(q)) : [...items];
}

/** Nova lista com `ids` fora (skip = true) ou de volta (skip = false), sem repetir e na ordem de antes. */
export function withSkipped(skip: readonly string[], ids: readonly string[], skipped: boolean): string[] {
  const set = new Set(skip);
  for (const id of ids) if (skipped) set.add(id); else set.delete(id);
  return [...set];
}

/** Quantos do grupo ainda entram na mochila. */
export function takenCount(items: readonly ItemDef[], skip: readonly string[]): number {
  const set = new Set(skip);
  return items.reduce((n, d) => n + (set.has(d.id) ? 0 : 1), 0);
}

/** Ids de `items` que valem menos de `minValue` (para "Desmarcar o que vale menos de"). */
export const cheaperThan = (items: readonly ItemDef[], minValue: number): string[] => items.filter((d) => d.value < minValue).map((d) => d.id);

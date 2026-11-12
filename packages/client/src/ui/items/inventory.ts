// Estado do inventário (mochila/equipamento/ouro/depot) alimentado por S2C.Inventory e S2C.Depot + ações (C2S).
import {
  C2S, itemDef,
  type EquipSlot, type InventoryMsg, type ItemDef, type ItemInstance, type ItemLocation,
  type MoveItemMsg, type UseItemMsg,
} from "@lemonquest/shared";
import { createStore } from "../hud/store.ts";
import { send } from "./net.ts";

export const inventoryStore = createStore<InventoryMsg | null>(null);
/** Conteúdo do depot (null = nunca recebido). */
export const depotStore = createStore<(ItemInstance | null)[] | null>(null);

export const defOf = (inst: ItemInstance | null | undefined): ItemDef | undefined => (inst ? itemDef(inst.defId) : undefined);

export function itemAt(loc: ItemLocation): ItemInstance | null {
  const inv = inventoryStore.get();
  if (loc.where === "backpack") return inv?.backpack[loc.index] ?? null;
  if (loc.where === "equip") return inv?.equipment[loc.slot] ?? null;
  return depotStore.get()?.[loc.index] ?? null;
}

export function firstEmptyBackpack(): number {
  const bp = inventoryStore.get()?.backpack;
  if (!bp) return -1;
  for (let i = 0; i < bp.length; i++) if (!bp[i]) return i;
  return -1;
}

/** Soma de uma mesma definição (poções) na mochila. */
export const countInBackpack = (defId: string): number =>
  (inventoryStore.get()?.backpack ?? []).reduce((n, it) => n + (it && it.defId === defId ? it.count : 0), 0);

/**
 * `uid` do item que está em `loc` na tela agora: vai junto das ações por posição para o servidor recusar se a mochila
 * mudou antes de a mensagem chegar (MoveItemMsg em shared/messages.ts).
 */
export const uidAt = (loc: ItemLocation): string | undefined => itemAt(loc)?.uid;

export function moveItem(from: ItemLocation, to: ItemLocation, count?: number): void {
  const uid = uidAt(from);
  const m: MoveItemMsg = { from, to, ...(count != null ? { count } : {}), ...(uid ? { uid } : {}) };
  send(C2S.MoveItem, m);
}
export function useBackpackItem(index: number): void {
  const uid = uidAt({ where: "backpack", index });
  const m: UseItemMsg = uid ? { index, uid } : { index };
  send(C2S.UseItem, m);
}

/** Tenta equipar o item da mochila no slot da definição. */
export function equipFromBackpack(index: number): void {
  const def = defOf(itemAt({ where: "backpack", index }));
  if (def?.slot) moveItem({ where: "backpack", index }, { where: "equip", slot: def.slot });
}
export function unequipToBackpack(slot: EquipSlot): void {
  const to = firstEmptyBackpack();
  if (to >= 0) moveItem({ where: "equip", slot }, { where: "backpack", index: to });
}
export function depotToBackpack(index: number): void {
  const to = firstEmptyBackpack();
  if (to >= 0) moveItem({ where: "depot", index }, { where: "backpack", index: to });
}

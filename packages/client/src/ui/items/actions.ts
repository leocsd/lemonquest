// Ação "padrão" de um item (clique direito / duplo clique): usar, equipar, desequipar, guardar.
// Vender NÃO entra aqui: com a aba Vender aberta, um duplo clique na mochila vendia o item na hora (sem volta) —
// a venda só acontece pelo botão da linha da loja (NpcWindow).
import { levelNeeded, stackTarget, type ItemDef, type ItemInstance, type ItemLocation, type NpcOpenMsg } from "@lemonquest/shared";
import { npcStore } from "../npc/npc.ts";
import { pushToast } from "../toasts.ts";
import {
  defOf, depotStore, equipFromBackpack, firstEmptyBackpack, inventoryStore, moveItem, unequipToBackpack, useBackpackItem,
} from "./inventory.ts";
import { myLevelStore, potionCooling, startPotionCooldown } from "./potions.ts";

/** O NPC aberto compra este item? */
export function npcBuys(def: ItemDef | undefined, npc: NpcOpenMsg | undefined): boolean {
  if (!def || !npc?.shop?.buys) return false;
  return def.value > 0 && def.id !== "gold_coin" && npc.shop.buys.includes(def.kind);
}

export function activateItem(loc: ItemLocation, inst: ItemInstance): void {
  const def = defOf(inst);
  if (!def) return;
  if (loc.where === "backpack") {
    // Depot aberto: o clique rápido guarda qualquer item (antes equipava ou bebia, e só guardava o que não tinha uso).
    if (npcStore.get()?.tab === "depot") { storeInDepot(loc, inst, def); return; }
    // Acima do level o servidor recusa; avisar aqui evita a recarga de poção falsa no cliente.
    const need = def.use ? levelNeeded(def, myLevelStore.get()) : 0;
    if (need) { pushToast({ text: `Você precisa ser level ${need} para usar isso.`, kind: "warn" }, 800); return; }
    if (def.use?.chest) { useBackpackItem(loc.index); return; } // baú: abre (sem recarga de poção)
    if (def.use?.food) { useBackpackItem(loc.index); return; } // comida: recarga própria (servidor), não trava as poções
    if (def.use) {
      if (potionCooling()) return;
      useBackpackItem(loc.index);
      startPotionCooldown(def.use.cooldownMs);
      return;
    }
    if (def.slot) equipFromBackpack(loc.index);
    return;
  }
  if (loc.where === "equip") {
    if (firstEmptyBackpack() < 0) { pushToast({ text: "Mochila cheia.", kind: "warn" }, 800); return; }
    unequipToBackpack(loc.slot);
    return;
  }
  // Depot → mochila: junta na pilha igual com espaço antes de pedir um espaço vazio ("Mochila cheia" só se não houver nenhum).
  const to = stackTarget(inventoryStore.get()?.backpack ?? [], inst, def);
  if (to < 0) { pushToast({ text: "Mochila cheia.", kind: "warn" }, 800); return; }
  moveItem(loc, { where: "backpack", index: to });
}

/** Mochila → depot: a primeira pilha igual com espaço, senão o primeiro vazio (o servidor espalha o que sobrar). */
function storeInDepot(loc: ItemLocation, inst: ItemInstance, def: ItemDef): void {
  const dp = depotStore.get();
  if (!dp) return;
  const to = stackTarget(dp, inst, def);
  if (to < 0) { pushToast({ text: "Depot cheio.", kind: "warn" }, 800); return; }
  moveItem(loc, { where: "depot", index: to });
}

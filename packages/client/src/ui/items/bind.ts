// Liga as mensagens do servidor (inventário, depot, NPC, loot, feed) aos stores da UI. Importar uma vez (Hud).
import { S2C, sanitizeLootFilter, type DepotMsg, type FeedMsg, type InventoryMsg, type LootFilterMsg, type LootMsg, type NpcOpenMsg } from "@lemonquest/shared";
import { session } from "../../session.ts";
import { handleNpcOpen } from "../npc/npc.ts";
import { depotStore, inventoryStore } from "./inventory.ts";
import { handleFeed, handleLoot } from "./loot.ts";
import { lootFilterStore } from "./lootFilter.ts";

session.onRoom((room) => {
  room.onMessage(S2C.Inventory, (m: InventoryMsg) => inventoryStore.set(m));
  room.onMessage(S2C.Depot, (m: DepotMsg) => depotStore.set(m.items));
  room.onMessage(S2C.NpcOpen, (m: NpcOpenMsg) => handleNpcOpen(m));
  room.onMessage(S2C.Loot, (m: LootMsg) => handleLoot(m));
  room.onMessage(S2C.Feed, (m: FeedMsg) => handleFeed(m));
  room.onMessage(S2C.LootFilter, (m: LootFilterMsg) => lootFilterStore.set(sanitizeLootFilter(m?.filter)));
});

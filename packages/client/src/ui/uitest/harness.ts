// Harness de desenvolvimento (?uitest, só em modo dev): simula o servidor para a UI de itens/NPC/loot/feed,
// sem Colyseus. Defs falsas só entram em ITEMS se o id ainda não existir. Uso: http://localhost:3080/?uitest
// Parâmetros: ?npc=buy|sell|depot (abre o NPC), ?voc=knight|sorcerer..., ?lv=8
// Console: __ut.loot("epic"), __ut.feed("boss"), __ut.npc("depot")
import {
  BACKPACK_SIZE, C2S, DEPOT_SIZE, EQUIP_SLOTS, ITEMS, instanceStats, itemDef,
  type EquipSlot, type FeedMsg, type InventoryMsg, type ItemDef, type ItemInstance, type ItemLocation, type LootMsg, type NpcOpenMsg, type NpcTradeMsg, type Rarity, type StatId,
} from "@lemonquest/shared";
import { session } from "../../session.ts";
import { setBattleEntries } from "../hud/battle.ts";
import { playersStore, type PlayerSnap } from "../hud/world.ts";
import { depotStore, inventoryStore } from "../items/inventory.ts";
import { handleFeed, handleLoot } from "../items/loot.ts";
import { setItemTransport } from "../items/net.ts";
import { handleNpcOpen } from "../npc/npc.ts";

const P = new URLSearchParams(location.search);

const A = "ninja/Items/";
const defs: ItemDef[] = [
  { id: "ut_sword", name: "Espada de Ferro", kind: "weapon", slot: "weapon", weaponType: "sword", range: 1, damageKind: "physical", icon: { url: A + "Weapons/Sword/Sprite.png" }, vocations: ["knight", "paladin"], level: 3, stats: { attack: 14 }, value: 120, description: "Uma espada confiável de ferro forjado." },
  { id: "ut_blade", name: "Lâmina Rúnica", kind: "weapon", slot: "weapon", weaponType: "sword", range: 1, damageKind: "physical", icon: { url: A + "Weapons/Katana/Sprite.png" }, vocations: ["knight"], level: 6, stats: { attack: 20, crit: 3 }, value: 900, description: "Runas antigas pulsam no aço." },
  { id: "ut_katana", name: "Katana do Dragão", kind: "weapon", slot: "weapon", weaponType: "sword", twoHanded: true, range: 1, icon: { url: A + "Weapons/Katana/Sprite.png" }, level: 25, stats: { attack: 40, crit: 8 }, value: 12000 },
  { id: "ut_axe", name: "Machado Velho", kind: "weapon", slot: "weapon", weaponType: "axe", icon: { url: A + "Weapons/Axe/Sprite.png" }, stats: { attack: 11 }, value: 60 },
  { id: "ut_wand", name: "Varinha de Fogo", kind: "weapon", slot: "weapon", weaponType: "wand", range: 4, damageKind: "fire", icon: { url: A + "Weapons/MagicWand/Sprite.png" }, vocations: ["sorcerer", "druid"], stats: { attack: 9, magic: 1 }, value: 300 },
  { id: "ut_helmet", name: "Elmo de Couro", kind: "helmet", slot: "helmet", icon: { url: "ninja/Actor/Character/Knight/SpriteSheet.png", frame: 8, frameWidth: 16, frameHeight: 16 }, stats: { armor: 2 }, value: 40 },
  { id: "ut_shield", name: "Escudo de Madeira", kind: "shield", slot: "shield", icon: { url: "ninja/Actor/Character/Knight/SpriteSheet.png", frame: 9, frameWidth: 16, frameHeight: 16 }, stats: { armor: 3, shield: 1 }, value: 55 },
  { id: "ut_armor", name: "Gibão Reforçado", kind: "armor", slot: "armor", icon: { url: "ninja/Actor/Character/Knight/SpriteSheet.png", frame: 10, frameWidth: 16, frameHeight: 16 }, stats: { armor: 6, hpMax: 20 }, value: 200 },
  { id: "ut_ring", name: "Anel de Vigor", kind: "ring", slot: "ring", icon: { url: A + "Resource/GemRed.png" }, stats: { hpRegen: 1 }, value: 150 },
  { id: "ut_amulet", name: "Amuleto Sombrio", kind: "amulet", slot: "amulet", icon: { url: A + "Resource/GemPurple.png" }, stats: { manaMax: 30, magic: 1 }, value: 400 },
  { id: "ut_hp", name: "Poção de Vida", kind: "potion", stackable: true, value: 40, use: { heal: 60, cooldownMs: 1000 }, icon: { url: A + "Potion/LifePot.png" }, description: "Recupera um pouco de vida." },
  { id: "ut_mp", name: "Poção de Mana", kind: "potion", stackable: true, value: 45, use: { mana: 50, cooldownMs: 1000 }, icon: { url: A + "Potion/WaterPot.png" }, description: "Restaura mana." },
  { id: "ut_cheese", name: "Queijo", kind: "food", stackable: true, value: 5, icon: { url: A + "Food/Honey.png" } },
  { id: "ut_gem", name: "Gema Verde", kind: "material", stackable: true, value: 100, icon: { url: A + "Resource/GemGreen.png" } },
  { id: "ut_ingot", name: "Barra de Prata", kind: "material", stackable: true, value: 30, icon: { url: A + "Resource/BarSilver.png" } },
];
for (const d of defs) ITEMS[d.id] ??= d;

let uid = 1;
const inst = (defId: string, count = 1, rarity: Rarity = "common", bonuses: { stat: StatId; value: number }[] = []): ItemInstance => ({ uid: `u${uid++}`, defId, count, rarity, bonuses });

const empty = <T>(n: number): (T | null)[] => Array.from({ length: n }, () => null);

export function startUiTest(): void {
  const voc = (P.get("voc") ?? "knight") as PlayerSnap["vocation"];
  const me: PlayerSnap = {
    id: "me", name: "QA Itens", vocation: voc, level: Number(P.get("lv") ?? 8), x: 10, y: 10, dir: 4, hp: 140, maxHp: 200, mana: 60, maxMana: 100, xp: 400, targetId: "",
    magicLevel: 2, skillMelee: 18, skillDistance: 10, skillShield: 16, magicPct: 30, meleePct: 40, distancePct: 0, shieldPct: 10, speedPct: 100, stance: "balanced", chase: false, outfit: "mago", addons: 3, title: "",
  };
  session.myId = "me";
  session.myName = me.name;
  const publishMe = () => playersStore.set(new Map([["me", { ...me }]]));
  publishMe();
  // ?mobs=N: N criaturas falsas na lista de batalha (testar altura fixa/rolagem).
  const mobs = Number(P.get("mobs") ?? 0);
  if (mobs > 0) setBattleEntries("uitest", Array.from({ length: mobs }, (_, i) => ({ id: `m${i}`, name: `Criatura ${i + 1}`, hpPct: 100 - ((i * 13) % 90), kind: "monster" as const, distance: 1 + (i % 9) })));

  // ---------- servidor falso ----------
  const equipment: Partial<Record<EquipSlot, ItemInstance>> = {
    helmet: inst("ut_helmet", 1, "common"),
    weapon: inst("ut_sword", 1, "uncommon", [{ stat: "attack", value: 2 }]),
  };
  const backpack = empty<ItemInstance>(BACKPACK_SIZE);
  [
    inst("ut_hp", 12), inst("ut_mp", 7), inst("ut_blade", 1, "rare", [{ stat: "crit", value: 2 }, { stat: "attack", value: 3 }]),
    inst("ut_katana", 1, "legendary", [{ stat: "speed", value: 4 }]), inst("ut_armor", 1, "epic", [{ stat: "hpMax", value: 15 }, { stat: "armor", value: 1 }]),
    inst("ut_shield"), inst("ut_ring", 1, "uncommon"), inst("ut_amulet", 1, "rare"), inst("ut_cheese", 3), inst("ut_gem", 5, "rare"),
    inst("ut_wand", 1, "common"), inst("ut_axe", 1, "common"), inst("ut_ingot", 80),
  ].forEach((it, i) => { backpack[i + (i > 8 ? 2 : 0)] = it; });
  const depot = empty<ItemInstance>(DEPOT_SIZE);
  depot[0] = inst("ut_gem", 40, "uncommon");
  depot[1] = inst("ut_sword", 1, "common");
  let gold = 1234;

  const pushInv = () => {
    const stats: InventoryMsg["stats"] = {};
    for (const it of Object.values(equipment)) {
      for (const [k, v] of Object.entries(instanceStats(itemDef(it!.defId), it))) stats[k as StatId] = (stats[k as StatId] ?? 0) + (v as number);
    }
    inventoryStore.set({ equipment: { ...equipment }, backpack: [...backpack], gold, stats, cap: { used: 120 + backpack.filter(Boolean).length * 8, max: 400 } });
  };
  const pushDepot = () => depotStore.set([...depot]);

  const get = (l: ItemLocation) => (l.where === "backpack" ? backpack[l.index] : l.where === "depot" ? depot[l.index] : equipment[l.slot]) ?? null;
  const put = (l: ItemLocation, it: ItemInstance | null) => {
    if (l.where === "backpack") backpack[l.index] = it;
    else if (l.where === "depot") depot[l.index] = it;
    else if (it) equipment[l.slot] = it;
    else delete equipment[l.slot];
  };
  const addToBackpack = (it: ItemInstance) => {
    const d = itemDef(it.defId);
    if (d?.stackable) {
      const s = backpack.find((b) => b && b.defId === it.defId);
      if (s) { s.count += it.count; return; }
    }
    const i = backpack.findIndex((b) => !b);
    if (i >= 0) backpack[i] = it;
  };

  const notice = (text: string) => console.info("[uitest/server]", text);
  const npc = (tab?: string): NpcOpenMsg => ({
    npcId: "ut_shop", name: "Bento, o Mercador", greeting: "Bem-vindo, viajante! Dê uma olhada nas minhas mercadorias. Pago bem por armas e armaduras usadas.",
    shop: { sells: [{ itemId: "ut_hp", price: 40 }, { itemId: "ut_mp", price: 45 }, { itemId: "ut_sword", price: 120 }, { itemId: "ut_helmet", price: 40 }, { itemId: "ut_amulet", price: 4000 }], buys: ["weapon", "shield", "helmet", "armor", "legs", "boots", "ring", "amulet", "material"], sellRatio: 0.3 },
    depot: true,
    ...(tab ? {} : {}),
  });

  setItemTransport((type, msg) => {
    const m = msg as Record<string, unknown>;
    switch (type) {
      case C2S.MoveItem: {
        const from = m.from as ItemLocation, to = m.to as ItemLocation, count = m.count as number | undefined;
        const a = get(from), b = get(to);
        if (!a) return;
        const d = itemDef(a.defId);
        if (to.where === "equip" && d?.slot !== to.slot) return notice("slot inválido");
        if (count && count < a.count) {
          if (b && b.defId === a.defId) { b.count += count; a.count -= count; } else if (!b) { put(to, { ...a, uid: `u${uid++}`, count }); a.count -= count; } else return;
        } else if (b && b.defId === a.defId && d?.stackable) { b.count += a.count; put(from, null); } else {
          put(to, a);
          put(from, b && (from.where !== "equip" || itemDef(b.defId)?.slot === from.slot) ? b : null);
          if (b && from.where === "equip") addToBackpack(b);
        }
        break;
      }
      case C2S.UseItem: case C2S.QuickPotion: {
        let idx = m.index as number | undefined;
        if (type === C2S.QuickPotion) idx = backpack.findIndex((b) => { const u = b && itemDef(b.defId)?.use; return u && (m.kind === "hp" ? u.heal : u.mana); });
        const it = idx != null && idx >= 0 ? backpack[idx] : null;
        const u = it && itemDef(it.defId)?.use;
        if (!it || !u) return;
        if (u.heal) me.hp = Math.min(me.maxHp, me.hp + u.heal);
        if (u.mana) me.mana = Math.min(me.maxMana, me.mana + u.mana);
        it.count -= 1;
        if (it.count <= 0) backpack[idx!] = null;
        publishMe();
        break;
      }
      case C2S.DiscardItem: backpack[m.index as number] = null; break;
      case C2S.DropItem: {
        // Sem mundo no harness: o item só sai do inventário.
        const from = m.from as ItemLocation, count = m.count as number | undefined;
        const a = get(from);
        if (!a) return;
        if (count && count < a.count) a.count -= count; else put(from, null);
        notice(`largou ${a.defId} no chão em ${m.x},${m.y}`);
        break;
      }
      case C2S.NpcInteract: setTimeout(() => { handleNpcOpen(npc()); pushDepot(); }, 60); return;
      case C2S.NpcTrade: {
        const t = m as unknown as NpcTradeMsg;
        if (t.action === "buy") {
          const price = (npc().shop!.sells.find((s) => s.itemId === t.itemId)?.price ?? 0) * t.count;
          if (gold < price) return;
          gold -= price;
          addToBackpack(inst(t.itemId, t.count));
        } else if (t.action === "sellAll") {
          const buys = npc().shop!.buys ?? [];
          backpack.forEach((it, i) => {
            const d = it ? itemDef(it.defId) : undefined;
            if (!it || !d || !buys.includes(d.kind as never)) return;
            gold += Math.floor(d.value * 0.3) * it.count;
            backpack[i] = null;
          });
        } else if (t.action === "sell") {
          const it = backpack[t.index];
          if (!it) return;
          const d = itemDef(it.defId)!;
          gold += Math.floor(d.value * 0.3) * t.count;
          it.count -= t.count;
          if (it.count <= 0) backpack[t.index] = null;
        }
        // "blessing": sem simulação no harness de UI (não há estado de bênção mockado).
        break;
      }
      case C2S.SetOutfit: {
        const o = m as { outfit: string; addons: number };
        setTimeout(() => { me.outfit = o.outfit; me.addons = o.addons; publishMe(); notice(`roupa: ${o.outfit} (addons ${o.addons})`); }, 60);
        return;
      }
      case C2S.FightMode: {
        const f = m as { stance: PlayerSnap["stance"]; chase: boolean; auto?: boolean };
        setTimeout(() => { me.stance = f.stance; me.chase = f.chase; me.auto = !!f.auto; publishMe(); }, 80);
        return;
      }
      default: return;
    }
    pushInv();
    pushDepot();
  });
  pushInv();
  pushDepot();

  const loot = (rarity: Rarity = "common"): void => {
    const items = rarity === "common"
      ? [inst("ut_cheese", 1)]
      : [inst("ut_blade", 1, rarity, [{ stat: "crit", value: 4 }])];
    const msg: LootMsg = { x: 0, y: 0, monsterName: rarity === "common" ? "Rato" : "Dragão", items, gold: rarity === "common" ? 3 : 250, lostFull: rarity === "legendary" ? 2 : undefined };
    handleLoot(msg);
  };
  const feed = (kind: FeedMsg["kind"] = "drop", rarity?: Rarity): void => {
    const text = {
      drop: "QA Itens encontrou Lâmina Rúnica (Épico)!", level: "QA Itens alcançou o level 9!", boss: "O Dragão Ancião despertou em Pedra Negra!",
      death: "Bruno foi derrotado por um Troll.", info: "Evento: invasão de ratos em 5 minutos.",
    }[kind];
    handleFeed({ text, kind, rarity: rarity ?? (kind === "drop" ? "epic" : undefined) });
  };
  const open = (tab?: string): void => { handleNpcOpen(npc(tab)); pushDepot(); if (tab) import("../npc/npc.ts").then((n) => n.setNpcTab(tab as "buy")); };

  (window as unknown as Record<string, unknown>).__ut = { loot, feed, npc: open, me, inv: () => ({ equipment, backpack, gold }), EQUIP_SLOTS };

  if (P.has("npc")) setTimeout(() => open(P.get("npc") || undefined), 300);
  setTimeout(() => { loot("common"); feed("level"); feed("drop"); }, 800);
}

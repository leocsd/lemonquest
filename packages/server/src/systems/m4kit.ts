// Fixtures de teste do M4 (itens/NPCs próprios, independentes do catálogo). Não é importado pelo servidor.
import type { ItemDef, NpcDef } from "@lemonquest/shared";
import type { PlayerState } from "../state.ts";
import { FoodSystem } from "./food.ts";
import { InventorySystem } from "./inventory.ts";
import { player } from "./testkit.ts";

const icon = { url: "x.png" };
export const ITEMS_FX: Record<string, ItemDef> = {
  gold_coin: { id: "gold_coin", name: "Ouro", kind: "material", stackable: true, maxStack: 1_000_000, value: 1, icon },
  hp_pot: { id: "hp_pot", name: "Poção de Vida", kind: "potion", stackable: true, value: 40, use: { heal: 50, cooldownMs: 1000 }, icon },
  health_potion: { id: "health_potion", name: "Poção de Vida", kind: "potion", stackable: true, value: 40, use: { heal: 100, cooldownMs: 1000 }, icon },
  health_potion_medium: { id: "health_potion_medium", name: "Poção de Vida Média", kind: "potion", stackable: true, value: 120, use: { heal: 180, cooldownMs: 1000 }, icon },
  mana_potion: { id: "mana_potion", name: "Poção de Mana", kind: "potion", stackable: true, value: 45, use: { mana: 50, cooldownMs: 1000 }, icon },
  mana_pot: { id: "mana_pot", name: "Poção de Mana", kind: "potion", stackable: true, maxStack: 10, value: 40, use: { mana: 30, cooldownMs: 1000 }, icon },
  // Com level (ciclo 14): usar e comprar conferem o level; Q/E escolhe a melhor permitida.
  hp_pot_big: { id: "hp_pot_big", name: "Poção de Vida Média", kind: "potion", stackable: true, value: 120, level: 15, use: { heal: 200, cooldownMs: 1000 }, icon },
  hp_pot_huge: { id: "hp_pot_huge", name: "Poção de Vida Grande", kind: "potion", stackable: true, value: 300, level: 30, use: { heal: 450, cooldownMs: 1000 }, icon },
  mana_pot_big: { id: "mana_pot_big", name: "Poção de Mana Média", kind: "potion", stackable: true, value: 130, level: 15, use: { mana: 300, cooldownMs: 1000 }, icon },
  ham: { id: "ham", name: "Presunto de Dragão", kind: "food", stackable: true, value: 150, level: 30, use: { food: { hpPerTick: 12, manaPerTick: 4, durationMs: 600_000 }, cooldownMs: 1000 }, icon },
  bread: { id: "bread", name: "Pão", kind: "food", stackable: true, value: 5, use: { food: { hpPerTick: 1, manaPerTick: 1, durationMs: 600_000 }, cooldownMs: 1000 }, icon },
  meat: { id: "meat", name: "Carne Assada", kind: "food", stackable: true, value: 12, use: { food: { hpPerTick: 3, manaPerTick: 0, durationMs: 240_000 }, cooldownMs: 1000 }, icon },
  steak: { id: "steak", name: "Bife", kind: "food", stackable: true, value: 50, use: { food: { hpPerTick: 6, manaPerTick: 0, durationMs: 720_000 }, cooldownMs: 1000 }, icon },
  bone: { id: "bone", name: "Osso", kind: "material", stackable: true, value: 10, icon },
  cheese: { id: "cheese", name: "Queijo", kind: "material", stackable: true, value: 10, icon },
  slime_goo: { id: "slime_goo", name: "Gosma", kind: "material", stackable: true, value: 12, icon },
  herb: { id: "herb", name: "Erva Medicinal", kind: "material", stackable: true, value: 15, icon },
  bee_sting: { id: "bee_sting", name: "Ferrão de Abelha", kind: "material", stackable: true, value: 15, icon },
  iron_bar: { id: "iron_bar", name: "Barra de Ferro", kind: "material", stackable: true, value: 200, icon },
  goblin_tooth: { id: "goblin_tooth", name: "Dente de Goblin", kind: "material", stackable: true, value: 110, icon },
  ectoplasm: { id: "ectoplasm", name: "Ectoplasma", kind: "material", stackable: true, value: 180, icon },
  lizard_scale: { id: "lizard_scale", name: "Escama de Lagarto", kind: "material", stackable: true, value: 250, icon },
  wolf_fang: { id: "wolf_fang", name: "Presa de Lobo", kind: "material", stackable: true, value: 30, icon },
  spider_eye: { id: "spider_eye", name: "Olho de Aranha", kind: "material", stackable: true, value: 90, icon },
  wolf_pelt: { id: "wolf_pelt", name: "Couro de Lobo", kind: "material", stackable: true, value: 40, icon },
  // Encantamento tier II (Dreno de Vida) e tier III (todos).
  necro_skull: { id: "necro_skull", name: "Crânio Profano", kind: "material", stackable: true, value: 820, icon },
  demonic_essence: { id: "demonic_essence", name: "Essência Demoníaca", kind: "material", stackable: true, value: 4000, icon },
  // Ciclo 20: material extra do tier III (Rubi, Frasco de Aço Líquido, Cromo Puro).
  gem_red: { id: "gem_red", name: "Rubi", kind: "material", stackable: true, maxStack: 50, value: 1500, icon },
  frasco_aco_liquido: { id: "frasco_aco_liquido", name: "Frasco de Aço Líquido", kind: "material", stackable: true, value: 4200, icon },
  mt_cromo: { id: "mt_cromo", name: "Cromo Puro", kind: "material", stackable: true, value: 3800, icon },
  sword: { id: "sword", name: "Espada", kind: "weapon", slot: "weapon", weaponType: "sword", stats: { attack: 20 }, value: 100, vocations: ["knight"], icon },
  axe2h: { id: "axe2h", name: "Machado Grande", kind: "weapon", slot: "weapon", weaponType: "axe", twoHanded: true, stats: { attack: 30 }, value: 200, icon, level: 1 },
  bow: { id: "bow", name: "Arco", kind: "weapon", slot: "weapon", weaponType: "bow", range: 6, damageKind: "physical", stats: { attack: 12 }, value: 100, vocations: ["paladin"], icon },
  shield: { id: "shield", name: "Escudo", kind: "shield", slot: "shield", stats: { armor: 3 }, value: 50, icon },
  plate: { id: "plate", name: "Armadura", kind: "armor", slot: "armor", stats: { armor: 5, hpMax: 40 }, value: 300, level: 20, icon },
  fishing_rod: { id: "fishing_rod", name: "Vara de Pesca", kind: "material", stackable: true, maxStack: 1, value: 60, icon },
  trout: { id: "trout", name: "Truta", kind: "food", stackable: true, value: 14, use: { food: { hpPerTick: 3, manaPerTick: 0, durationMs: 240_000 }, cooldownMs: 1000 }, icon },
  salmon: { id: "salmon", name: "Salmão", kind: "food", stackable: true, value: 40, use: { food: { hpPerTick: 5, manaPerTick: 1, durationMs: 360_000 }, cooldownMs: 1000 }, icon },
  golden_fish: { id: "golden_fish", name: "Peixe Dourado", kind: "material", stackable: true, value: 220, icon },
  bounty_chest: { id: "bounty_chest", name: "Baú de Recompensa", kind: "quest", stackable: true, maxStack: 20, value: 0, use: { chest: true, cooldownMs: 500 }, icon },
  vest: { id: "vest", name: "Colete", kind: "armor", slot: "armor", stats: { armor: 2, hpMax: 20 }, value: 30, icon },
  boots: { id: "boots", name: "Botas", kind: "boots", slot: "boots", stats: { speed: 10 }, value: 60, icon },
  ring: { id: "ring", name: "Anel", kind: "ring", slot: "ring", stats: { crit: 10, magic: 2, hpRegen: 3 }, value: 500, level: 30, icon },
  // Refináveis (tier 5 = level 35+, shared/data/refine.ts).
  katana: { id: "katana", name: "Katana", kind: "weapon", slot: "weapon", weaponType: "sword", stats: { attack: 70 }, value: 38000, vocations: ["knight"], level: 35, icon },
  mithril_plate: { id: "mithril_plate", name: "Armadura de Mithril", kind: "armor", slot: "armor", stats: { armor: 5 }, value: 17500, level: 35, icon },
};
export const itemsFx = (id: string) => ITEMS_FX[id];

export const NPCS_FX: Record<string, NpcDef> = {
  shop: {
    id: "shop", name: "Mercador", sprite: "", greeting: "Olá!",
    shop: { sells: [{ itemId: "hp_pot" }, { itemId: "vest", price: 50 }], buys: ["weapon", "armor", "material"] },
    idleLines: ["Promoção!"],
  },
  depot: { id: "depot", name: "Guarda", sprite: "", greeting: "Seu depot.", depot: true },
  priest: { id: "priest", name: "Sacerdotisa", sprite: "", greeting: "Oi.", blessing: true },
  casino: { id: "casino", name: "Mascate", sprite: "", greeting: "Oi.", casino: true },
  enchanter: { id: "enchanter", name: "Ervanária", sprite: "", greeting: "Oi.", imbuement: true },
  armory: { id: "armory", name: "Armeiro", sprite: "", greeting: "Oi.", shop: { sells: [{ itemId: "vest", price: 50, limited: true }] } },
  apothecary: { id: "apothecary", name: "Boticária", sprite: "", greeting: "Oi.", shop: { sells: [{ itemId: "hp_pot_huge" }, { itemId: "ham" }, { itemId: "ring" }] } },
};
export const npcsFx = (id: string) => NPCS_FX[id];

export function invWorld(o: { depotOpen?: (id: string) => boolean } = {}) {
  let clock = 100_000;
  const sent: { to: string; type: string; msg: any }[] = [];
  const events: any[] = [];
  const food = new FoodSystem({
    heal: (p, n) => { const h = Math.min(p.maxHp - p.hp, n); p.hp += h; events.push({ kind: "heal", amount: h, food: true }); },
    restoreMana: (p, n) => { const h = Math.min(p.maxMana - p.mana, n); p.mana += h; events.push({ kind: "mana", amount: h, sourceId: p.id, targetId: p.id, food: true }); },
  });
  const players = new Map<string, PlayerState>();
  const inv = new InventorySystem({
    eat: (p, f, now) => food.eat(p, f, now),
    send: (to, type, msg) => sent.push({ to, type, msg: structuredClone(msg) }),
    defs: itemsFx, now: () => clock, depotOpen: o.depotOpen,
    heal: (p, n) => { const h = Math.min(p.maxHp - p.hp, n); p.hp += h; events.push({ kind: "heal", amount: h }); },
    restoreMana: (p, n) => { const h = Math.min(p.maxMana - p.mana, n); p.mana += h; events.push({ kind: "mana", amount: h, sourceId: p.id, targetId: p.id }); },
  });
  const mk = (id = "p1", over: Partial<PlayerState> = {}) => {
    const p = player(id, 5, 5, over);
    players.set(id, p);
    inv.load(p, {});
    inv.applyStats(p, true);
    return p;
  };
  const notices = () => sent.filter((s) => s.type === "notice").map((s) => s.msg.text);
  return { inv, food, tickFood: () => food.tick(clock, players.values()), sent, events, mk, notices, advance: (ms: number) => { clock += ms; }, now: () => clock };
}

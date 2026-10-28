// Modelo cruzado da wiki: os dados do jogo (shared) + o índice do mundo (world.json) e as referências que nenhuma
// tabela guarda sozinha (quem dropa, quem vende, quem compra, que missão dá, onde nasce). Construído uma vez por
// execução do gerador. Os preços seguem as mesmas contas do servidor (systems/npcs.ts): a wiki nunca mostra um preço
// que o jogo não cobra.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ITEMS, MONSTERS, NPCS, QUEST_LIST, SPELLS, buildWorldIndex, isHiddenVocation, npcBuyPrice,
  type ItemDef, type MonsterDef, type NpcDef, type QuestDef, type SpellDef, type TiledMap, type WorldIndex,
} from "../../packages/shared/src/index.ts";
import { ASSETS } from "./html.mts";

export interface DropSource { monsterId: string; chance: number; min: number; max: number }
export interface ShopSource { npcId: string; price: number; limited?: boolean }

export interface WikiModel {
  index: WorldIndex;
  mapJson: TiledMap;
  monsters: MonsterDef[];
  items: ItemDef[];
  spells: SpellDef[];
  npcs: NpcDef[];
  quests: QuestDef[];
  /** Monstros que dropam o item, por chance (maior primeiro). */
  droppedBy(itemId: string): DropSource[];
  /** NPCs que vendem o item ao jogador e por quanto (`price` da loja ou o valor do item). */
  soldBy(itemId: string): ShopSource[];
  /** NPCs que compram o item do jogador (o tipo está em `buys`) e quanto pagam por um comum (npcBuyPrice). */
  boughtBy(itemId: string): { npcId: string; price: number }[];
  /** Missões que dão o item de recompensa. */
  rewardOf(itemId: string): { questId: string; count: number }[];
  /** Missões que o NPC dá (giver). */
  questsOf(npcId: string): QuestDef[];
  /** Missões com passo kill/boss neste monstro. */
  questsTargeting(monsterId: string): QuestDef[];
  /** Pontos de spawn do monstro no mapa (tile, zona, quantidade). */
  spawnsOf(monsterId: string): { x: number; y: number; zone: string; count: number }[];
  /** Zona do tile (menor área vence, como no jogo); "" fora de toda zona. */
  zoneOf(x: number, y: number): string;
  /** Tile e zona do NPC no mapa (undefined = não está no mapa). */
  npcPos(npcId: string): { x: number; y: number; zone: string } | undefined;
  /** Faixa de level dos monstros não-chefe que nascem na zona. */
  zoneLevels(zone: string): { min: number; max: number } | undefined;
}

export function buildModel(): WikiModel {
  const mapJson = JSON.parse(readFileSync(join(ASSETS, "maps", "world.json"), "utf8")) as TiledMap;
  const index = buildWorldIndex(mapJson);
  // A vocação oculta (a Fada) fica fora da wiki: nem as magias só dela nem a criatura que só ela invoca.
  const hiddenSpell = (s: { vocations: readonly string[] }) => s.vocations.every((v) => isHiddenVocation(v));
  const spells = Object.values(SPELLS).filter((s) => !hiddenSpell(s));
  const hiddenSummons = new Set(Object.values(SPELLS).filter((s) => hiddenSpell(s) && s.summon).map((s) => s.summon!.monsterId));
  const monsters = Object.values(MONSTERS).filter((d) => !hiddenSummons.has(d.id));
  const items = Object.values(ITEMS);
  const npcs = Object.values(NPCS);
  const quests = QUEST_LIST;

  const push = <T,>(m: Map<string, T[]>, k: string, v: T) => { const l = m.get(k); if (l) l.push(v); else m.set(k, [v]); };

  const drops = new Map<string, DropSource[]>();
  for (const m of monsters) {
    for (const e of m.loot ?? []) push(drops, e.itemId, { monsterId: m.id, chance: e.chance, min: e.min ?? 1, max: e.max ?? e.min ?? 1 });
  }
  for (const l of drops.values()) l.sort((a, b) => b.chance - a.chance || a.monsterId.localeCompare(b.monsterId));

  // Loja: mesmo filtro do servidor (openMsg): sem `price` vale o valor do item; item inexistente não é vendido.
  const sold = new Map<string, ShopSource[]>();
  for (const n of npcs) {
    for (const e of n.shop?.sells ?? []) {
      const price = e.price ?? ITEMS[e.itemId]?.value ?? -1;
      if (price >= 0) push(sold, e.itemId, { npcId: n.id, price, ...(e.limited ? { limited: true } : {}) });
    }
  }
  for (const l of sold.values()) l.sort((a, b) => a.price - b.price || a.npcId.localeCompare(b.npcId));

  const buyers = npcs.filter((n) => n.shop?.buys?.length);

  const rewards = new Map<string, { questId: string; count: number }[]>();
  for (const q of quests) for (const it of q.rewards.items ?? []) push(rewards, it.itemId, { questId: q.id, count: it.count });

  const zoneOf = (x: number, y: number): string => index.zoneAt(x, y) ?? "";

  return {
    index, mapJson, monsters, items, spells, npcs, quests,
    droppedBy: (id) => drops.get(id) ?? [],
    soldBy: (id) => sold.get(id) ?? [],
    boughtBy(id) {
      const d = ITEMS[id];
      if (!d) return [];
      return buyers.filter((n) => n.shop!.buys!.includes(d.kind as never)).map((n) => ({ npcId: n.id, price: npcBuyPrice(d.value) }));
    },
    rewardOf: (id) => rewards.get(id) ?? [],
    questsOf: (npcId) => quests.filter((q) => q.giver === npcId),
    questsTargeting: (monsterId) => quests.filter((q) => q.steps.some((s) => (s.kind === "kill" || s.kind === "boss") && s.target === monsterId)),
    spawnsOf: (id) => index.spawnsOf(id).map((s) => ({ x: s.x, y: s.y, zone: s.zone ?? zoneOf(s.x, s.y), count: s.count })),
    zoneOf,
    npcPos(npcId) {
      const n = index.npcAt(npcId);
      return n ? { x: n.x, y: n.y, zone: n.zone ?? zoneOf(n.x, n.y) } : undefined;
    },
    zoneLevels: (zone) => index.zoneLevels(zone),
  };
}

// Loot automático configurável (o "quick loot" do Tibia): quando um monstro morre, o loot entra sozinho na mochila, menos
// os itens que o jogador tirou da lista (`skip`): esses ficam no chão onde o bicho caiu (de quem quiser, até sumir).
// Regra única: o servidor aplica (systems/loot.ts) e o cliente só mostra (janela "Loot automático", com todos os itens
// que caem de monstro). Ouro, itens de missão e chaves entram sempre; raro ou melhor idem, na mesma linha de corte do
// "Vender tudo" (SELL_ALL_KEEPS_FROM): desmarcar um item nunca deixa um épico para trás.
import { ITEMS, RARITIES, isEquipable, type EquipSlot, type ItemDef, type Rarity } from "./data/items.ts";
import { MONSTERS } from "./data/monsters.ts";
import { SELL_ALL_KEEPS_FROM } from "./formulas.ts";

export interface LootFilter {
  /** Ids de item que NÃO entram sozinhos na mochila (ficam no chão). Vazio = pega tudo. */
  skip: string[];
}

export const DEFAULT_LOOT_FILTER: Readonly<LootFilter> = { skip: [] };
/** Teto da lista gravada (maior que o catálogo de hoje, com folga para itens novos). */
export const LOOT_SKIP_MAX = 600;

/** Grupos da janela: o que mais se dispensa primeiro (materiais, comida, poções), depois o equipamento por peça. */
export type LootGroupId = EquipSlot | "potion" | "food" | "material";
export const LOOT_GROUP_LABEL: Readonly<Record<LootGroupId, string>> = {
  material: "Materiais", food: "Comida", potion: "Poções",
  weapon: "Armas", shield: "Escudos e livros", helmet: "Elmos", armor: "Armaduras", legs: "Pernas", boots: "Botas", ring: "Anéis", amulet: "Amuletos",
};
export const LOOT_GROUP_ORDER: readonly LootGroupId[] = ["material", "food", "potion", "weapon", "shield", "helmet", "armor", "legs", "boots", "ring", "amulet"];

/** Grupo de um item lootável (undefined = não entra na lista: ouro, missão, chave). */
export function lootGroupOf(d: ItemDef): LootGroupId | undefined {
  if (d.id === "gold_coin" || d.kind === "quest" || d.kind === "key") return undefined;
  if (isEquipable(d)) return d.slot;
  if (d.kind === "potion" || d.kind === "food" || d.kind === "material") return d.kind;
  return undefined;
}

const byGroupThenLevel = (a: ItemDef, b: ItemDef): number =>
  LOOT_GROUP_ORDER.indexOf(lootGroupOf(a)!) - LOOT_GROUP_ORDER.indexOf(lootGroupOf(b)!)
  || (a.level ?? 0) - (b.level ?? 0) || a.value - b.value || a.name.localeCompare(b.name, "pt-BR");

/**
 * Itens que caem de algum monstro (tabela de loot) e podem ser deixados no chão, na ordem da janela. Calculado uma vez
 * a partir do catálogo: item novo com drop entra sozinho na lista.
 */
export const LOOTABLE_ITEMS: readonly ItemDef[] = (() => {
  const ids = new Set<string>();
  for (const m of Object.values(MONSTERS)) for (const e of m.loot ?? []) ids.add(e.itemId);
  return [...ids].map((id) => ITEMS[id]).filter((d): d is ItemDef => !!d && lootGroupOf(d) !== undefined).sort(byGroupThenLevel);
})();

export interface LootGroup { id: LootGroupId; label: string; items: ItemDef[] }
/** Os itens lootáveis por grupo (só grupos com item), na ordem da janela. */
export const LOOT_GROUPS: readonly LootGroup[] = LOOT_GROUP_ORDER
  .map((id) => ({ id, label: LOOT_GROUP_LABEL[id], items: LOOTABLE_ITEMS.filter((d) => lootGroupOf(d) === id) }))
  .filter((g) => g.items.length > 0);

/** Formato gravado pela 1ª versão (categorias e valor mínimo, 2026-10-28): vira lista de itens na carga. */
interface LegacyLootFilter { gear?: unknown; materials?: unknown; potions?: unknown; food?: unknown; minValue?: unknown }
function fromLegacy(r: LegacyLootFilter): string[] {
  const gearFloor = r.gear === "uncommon" ? 1 : r.gear === "rare" ? 2 : 0;
  const minValue = typeof r.minValue === "number" && Number.isFinite(r.minValue) ? r.minValue : 0;
  const off = new Set<string>([r.materials === false && "material", r.potions === false && "potion", r.food === false && "food"].filter(Boolean) as string[]);
  return LOOTABLE_ITEMS.filter((d) => {
    if (d.value < minValue) return true;
    // Equipamento comum ficava fora a partir de "incomum+" (o raro+ sempre entrou e continua entrando).
    if (isEquipable(d)) return gearFloor > 0;
    return off.has(d.kind);
  }).map((d) => d.id);
}

/** Filtro válido a partir do que o cliente mandou (ou do que estava gravado): ids únicos, curtos, até LOOT_SKIP_MAX. */
export function sanitizeLootFilter(raw: unknown): LootFilter {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const skip = r.skip;
  if (!Array.isArray(skip)) {
    const legacy = "gear" in r || "materials" in r || "potions" in r || "food" in r || "minValue" in r;
    return { skip: legacy ? fromLegacy(r as LegacyLootFilter) : [] };
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of skip) {
    if (typeof id !== "string" || !id || id.length > 48 || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= LOOT_SKIP_MAX) break;
  }
  return { skip: out };
}

export const isDefaultLootFilter = (f: LootFilter): boolean => f.skip.length === 0;

const rank = (r: Rarity): number => RARITIES.indexOf(r);

/**
 * Este item do loot entra sozinho na mochila de quem tem o filtro `f`? Ouro (`gold_coin`), missão e chave sempre; raro
 * ou melhor sempre; o resto só se não estiver na lista.
 */
export function autoLoots(f: LootFilter, def: ItemDef, rarity: Rarity): boolean {
  if (lootGroupOf(def) === undefined) return true;
  if (rank(rarity) >= rank(SELL_ALL_KEEPS_FROM)) return true;
  return !f.skip.includes(def.id);
}

/** Resumo curto para o tooltip do funil ("Pega tudo", "12 itens ficam no chão"). */
export function lootFilterSummary(f: LootFilter): string {
  const n = f.skip.length;
  return n === 0 ? "Pega tudo" : n === 1 ? "1 item fica no chão" : `${n} itens ficam no chão`;
}

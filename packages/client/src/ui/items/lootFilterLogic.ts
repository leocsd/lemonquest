// Janela "Loot automático": filtros de visualização (busca, categoria, vocação, level e zona onde o item cai), contagem por
// grupo e as ações em lote sobre a lista `skip`. Puro (sem DOM) para testar. Os filtros só escolhem o que a janela mostra;
// o que entra na mochila é a lista `skip` (shared/lootFilter.ts).
import { lootCategoryOf, vocationFits, type ItemDef, type LootCategory, type MonsterDef, type Vocation } from "@lemonquest/shared";
import { foldText } from "../npc/depotSearch.ts";
import type { HuntIndex } from "../quests/questInfo.ts";
import { monsterZones } from "../quests/questInfo.ts";

/** Degraus do "Desmarcar o que vale menos de" (valor de tabela, em ouro). */
export const LOOT_VALUE_STEPS: readonly number[] = [50, 100, 250, 500, 1000, 2500];

/** Faixas do filtro de level (na escada das regiões). */
export const LOOT_LEVEL_BANDS: readonly { label: string; min: number; max: number }[] = [
  { label: "1–25", min: 1, max: 25 }, { label: "26–50", min: 26, max: 50 }, { label: "51–80", min: 51, max: 80 }, { label: "81+", min: 81, max: Infinity },
];

export interface LootView {
  query: string;
  category: LootCategory | "all";
  vocation: Vocation | "all";
  /** "all", "mine" (até o meu level) ou índice em LOOT_LEVEL_BANDS. Só filtra itens que têm level; os outros passam. */
  level: "all" | "mine" | number;
  /** Zona onde algum monstro que solta o item nasce ("" = todas). */
  zone: string;
}
export const NO_VIEW: LootView = { query: "", category: "all", vocation: "all", level: "all", zone: "" };
export const isNoView = (v: LootView): boolean => !v.query.trim() && v.category === "all" && v.vocation === "all" && v.level === "all" && !v.zone;

/** Itens cujo nome contém a busca (sem acento nem caixa, como a busca do depot; vazia = todos). */
export function searchItems(items: readonly ItemDef[], query: string): ItemDef[] {
  const q = foldText(query);
  return q ? items.filter((d) => foldText(d.name).includes(q)) : [...items];
}

/** Item → zonas onde nasce algum monstro que o solta (índice do mundo; vazio sem índice). */
export type ItemZones = ReadonlyMap<string, ReadonlySet<string>>;
export function itemZonesIndex(idx: HuntIndex | null, monsters: readonly MonsterDef[]): ItemZones {
  const out = new Map<string, Set<string>>();
  if (!idx) return out;
  for (const m of monsters) {
    const zones = monsterZones(idx, m.id);
    if (!zones.length) continue;
    for (const e of m.loot ?? []) {
      let set = out.get(e.itemId);
      if (!set) { set = new Set(); out.set(e.itemId, set); }
      for (const z of zones) set.add(z);
    }
  }
  return out;
}

/** Zonas presentes no índice, em ordem alfabética. */
export function lootZones(zones: ItemZones): string[] {
  const all = new Set<string>();
  for (const set of zones.values()) for (const z of set) all.add(z);
  return [...all].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export function levelPasses(d: ItemDef, level: LootView["level"], myLevel: number): boolean {
  if (level === "all" || d.level === undefined) return true;
  if (level === "mine") return d.level <= myLevel;
  const band = LOOT_LEVEL_BANDS[level];
  return !band || (d.level >= band.min && d.level <= band.max);
}

/** Aplica os filtros de visualização (todos ao mesmo tempo). */
export function applyLootView(items: readonly ItemDef[], v: LootView, ctx: { myLevel: number; zones: ItemZones }): ItemDef[] {
  return searchItems(items, v.query).filter((d) =>
    (v.category === "all" || lootCategoryOf(d) === v.category)
    && (v.vocation === "all" || vocationFits(d.vocations, v.vocation))
    && levelPasses(d, v.level, ctx.myLevel)
    && (!v.zone || !!ctx.zones.get(d.id)?.has(v.zone)));
}

/** Nova lista com `ids` fora (skip = true) ou de volta (skip = false), sem repetir e na ordem de antes. */
export function withSkipped(skip: readonly string[], ids: readonly string[], skipped: boolean): string[] {
  const set = new Set(skip);
  for (const id of ids) if (skipped) set.add(id); else set.delete(id);
  return [...set];
}

/** Quantos de `items` ainda entram na mochila. */
export function takenCount(items: readonly ItemDef[], skip: readonly string[]): number {
  const set = new Set(skip);
  return items.reduce((n, d) => n + (set.has(d.id) ? 0 : 1), 0);
}

/** Ids de `items` que valem menos de `minValue` (para "Desmarcar o que vale menos de"). */
export const cheaperThan = (items: readonly ItemDef[], minValue: number): string[] => items.filter((d) => d.value < minValue).map((d) => d.id);

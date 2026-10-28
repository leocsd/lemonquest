// Loot automático configurável (o "quick loot" do Tibia): o que entra sozinho na mochila quando um monstro morre e o que
// fica no chão onde ele caiu (de quem quiser, até sumir). Regra única: o servidor aplica (systems/loot.ts) e o cliente só
// mostra (janela "Loot automático"). Ouro, itens de missão e chaves entram sempre; raro ou melhor idem, na mesma linha de
// corte do "Vender tudo" (SELL_ALL_KEEPS_FROM): nenhum filtro de valor deixa um épico para trás.
import { RARITIES, isEquipable, type ItemDef, type Rarity } from "./data/items.ts";
import { SELL_ALL_KEEPS_FROM } from "./formulas.ts";

/** Raridade mínima de equipamento que entra sozinho (abaixo dela fica no chão). */
export type GearFloor = "common" | "uncommon" | "rare";
export const GEAR_FLOORS: readonly GearFloor[] = ["common", "uncommon", "rare"];
export const GEAR_FLOOR_LABEL: Readonly<Record<GearFloor, string>> = { common: "Tudo", uncommon: "Incomum ou melhor", rare: "Raro ou melhor" };
/** Rótulo curto para o botão (o longo vai no tooltip). */
export const GEAR_FLOOR_SHORT: Readonly<Record<GearFloor, string>> = { common: "Tudo", uncommon: "Incomum+", rare: "Raro+" };

export interface LootFilter {
  gear: GearFloor;
  materials: boolean;
  potions: boolean;
  food: boolean;
  /** Valor de tabela mínimo (ouro) para o item entrar; 0 = qualquer valor. Não vale para raro+, missão, chave e ouro. */
  minValue: number;
}

/** Degraus do controle de valor mínimo (o primeiro é "qualquer valor"). */
export const LOOT_MIN_VALUES: readonly number[] = [0, 50, 100, 250, 500, 1000, 2500];

export const DEFAULT_LOOT_FILTER: Readonly<LootFilter> = { gear: "common", materials: true, potions: true, food: true, minValue: 0 };

/** Maior degrau de LOOT_MIN_VALUES que não passa de `n` (lixo → 0). */
export function snapMinValue(n: unknown): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return 0;
  let out = 0;
  for (const v of LOOT_MIN_VALUES) if (v <= n) out = v;
  return out;
}

/** Filtro válido a partir do que o cliente mandou (ou do que estava gravado): campo ausente/lixo vira o padrão. */
export function sanitizeLootFilter(raw: unknown): LootFilter {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    gear: GEAR_FLOORS.includes(r.gear as GearFloor) ? (r.gear as GearFloor) : DEFAULT_LOOT_FILTER.gear,
    materials: r.materials !== false,
    potions: r.potions !== false,
    food: r.food !== false,
    minValue: snapMinValue(r.minValue),
  };
}

export function isDefaultLootFilter(f: LootFilter): boolean {
  return f.gear === DEFAULT_LOOT_FILTER.gear && f.materials && f.potions && f.food && f.minValue === 0;
}

const rank = (r: Rarity): number => RARITIES.indexOf(r);

/**
 * Este item do loot entra sozinho na mochila de quem tem o filtro `f`? Ouro (`gold_coin`), missão e chave sempre; raro
 * ou melhor sempre; equipamento pela raridade mínima; material/poção/comida pelo interruptor da categoria. O valor
 * mínimo vale para tudo o que não é "sempre".
 */
export function autoLoots(f: LootFilter, def: ItemDef, rarity: Rarity): boolean {
  if (def.id === "gold_coin" || def.kind === "quest" || def.kind === "key") return true;
  if (rank(rarity) >= rank(SELL_ALL_KEEPS_FROM)) return true;
  if (def.value < f.minValue) return false;
  if (isEquipable(def)) return rank(rarity) >= rank(f.gear);
  if (def.kind === "material") return f.materials;
  if (def.kind === "potion") return f.potions;
  if (def.kind === "food") return f.food;
  return true;
}

/** Resumo curto para o tooltip do botão ("Pega tudo", "equipamento raro+ · sem comida · só o que vale 100+"). */
export function lootFilterSummary(f: LootFilter): string {
  if (isDefaultLootFilter(f)) return "Pega tudo";
  const parts: string[] = [];
  if (f.gear !== "common") parts.push(`equipamento ${f.gear === "rare" ? "raro" : "incomum"}+`);
  const off = [[!f.materials, "materiais"], [!f.potions, "poções"], [!f.food, "comida"]].filter(([x]) => x).map(([, s]) => s as string);
  if (off.length) parts.push(`sem ${off.join(", ")}`);
  if (f.minValue > 0) parts.push(`só o que vale ${f.minValue}+`);
  return parts.join(" · ");
}

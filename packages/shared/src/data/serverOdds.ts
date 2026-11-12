// Números dos sorteios que só o servidor faz (Baú de Recompensa, pesca, ficha de cassino). Ficam no `shared` para a
// wiki (tools/wiki) ler os mesmos valores do servidor: antes ela tinha uma cópia "mudou lá, mude aqui" (WK-3).

/** Faixa de level [de, até] (até null = sem teto), como a wiki mostra. */
export type LevelRange = readonly [from: number, to: number | null];

// --- Baú de Recompensa (server/systems/quests.ts, rollChest) ---------------------------------------------------------

/** Ouro do baú: sorteio entre `gold[0]` e `gold[1]`, vezes (1 + level ÷ goldLevelDiv). */
export const CHEST_GOLD: readonly [number, number] = [15, 40];
export const CHEST_GOLD_LEVEL_DIV = 5;
export const CHEST_POTION_CHANCE = 0.65;
export const CHEST_POTION_COUNT: readonly [number, number] = [2, 5];
/** Chance de a poção do baú ser de mana: magos (feiticeiro, druida, fada) × as outras vocações. */
export const CHEST_MANA_CHANCE_MAGE = 0.6;
export const CHEST_MANA_CHANCE_OTHER = 0.3;
export const CHEST_FOOD_CHANCE = 0.5;
export const CHEST_FOOD_COUNT: readonly [number, number] = [2, 4];
export const CHEST_GEAR_CHANCE = 0.15;
/**
 * Equipamento do baú: level entre (L − GEAR_SPAN) e L. Acima do último tier (lv 70 + span) a janela desce até o tier mais
 * alto que o personagem pode usar, senão o baú ficava sem equipamento.
 */
export const CHEST_GEAR_SPAN = 12;

/** Faixas da poção do baú, da mais alta para a mais baixa: a partir de `from`, o sufixo do id. */
const CHEST_POTION_TIERS: readonly { from: number; suffix: string }[] = [
  { from: 30, suffix: "_large" }, { from: 15, suffix: "_medium" }, { from: 1, suffix: "" },
];
/** Gema no lugar do equipamento quando não há peça possível, da faixa mais alta para a mais baixa. */
const CHEST_GEM_TIERS: readonly { from: number; id: string }[] = [
  { from: 60, id: "gem_purple" }, { from: 35, id: "gem_yellow" }, { from: 1, id: "gem_green" },
];

/** Ouro do baú para o valor `roll` sorteado entre CHEST_GOLD[0] e CHEST_GOLD[1]. */
export const chestGold = (level: number, roll: number): number => Math.round(roll * (1 + Math.max(1, level) / CHEST_GOLD_LEVEL_DIV));

export function chestPotion(level: number, mana: boolean): string {
  const tier = CHEST_POTION_TIERS.find((t) => level >= t.from) ?? CHEST_POTION_TIERS[CHEST_POTION_TIERS.length - 1]!;
  return (mana ? "mana_potion" : "health_potion") + tier.suffix;
}

/** Baú sem equipamento possível para o personagem: uma gema da faixa no lugar. */
export function chestFallbackGem(level: number): string {
  return (CHEST_GEM_TIERS.find((t) => level >= t.from) ?? CHEST_GEM_TIERS[CHEST_GEM_TIERS.length - 1]!).id;
}

/** Faixas [de, até] a partir de uma lista "a partir de" (da mais alta para a mais baixa), na ordem do level mais baixo. */
function ranges<T>(tiers: readonly (T & { from: number })[], key: (t: T) => string[]): Record<string, LevelRange> {
  const out: Record<string, LevelRange> = {};
  for (let i = tiers.length - 1; i >= 0; i--) {
    const to = i === 0 ? null : tiers[i - 1]!.from - 1;
    for (const id of key(tiers[i]!)) out[id] = [tiers[i]!.from, to];
  }
  return out;
}

/** Cada poção que o baú pode dar e a faixa de level de quem abre (wiki). */
export const CHEST_POTION_RANGES: Readonly<Record<string, LevelRange>> =
  ranges(CHEST_POTION_TIERS, (t) => [`health_potion${t.suffix}`, `mana_potion${t.suffix}`]);
/** Cada gema de troca e a faixa de level (wiki). */
export const CHEST_GEM_RANGES: Readonly<Record<string, LevelRange>> = ranges(CHEST_GEM_TIERS, (t) => [t.id]);

// --- Pesca (server/systems/fishing.ts) -------------------------------------------------------------------------------

export const FISH_ROD = "fishing_rod";
/** Fatia de cada peixe quando morde, na ordem do sorteio; o resto é truta. */
export const FISH_GOLDEN_PCT = 0.04;
export const FISH_SALMON_PCT = 0.26;
export const FISH_ODDS: Readonly<Record<"golden_fish" | "salmon" | "trout", number>> = {
  golden_fish: FISH_GOLDEN_PCT, salmon: FISH_SALMON_PCT, trout: 1 - FISH_GOLDEN_PCT - FISH_SALMON_PCT,
};
/** Baú do Pescador: um Baú de Recompensa a cada tantos peixes pescados (25, 50, 75...). */
export const FISHER_CHEST_EVERY = 25;

// --- Ficha de cassino (server/systems/npcs.ts, buyCasino; o preço é CASINO_TICKET_PRICE em data/npcs.ts) ---------------

/** Faixas do sorteio da ficha (somam 1): nada, ouro de volta, um material, prêmio grande. */
export const CASINO_ODDS = { nothing: 0.45, goldBack: 0.35, material: 0.15, jackpot: 0.05 } as const;
/** Ouro de volta e prêmio grande, em fração do preço da ficha. */
export const CASINO_GOLD_BACK_MULT = 0.4;
export const CASINO_JACKPOT_MULT = 3;

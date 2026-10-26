// Refino +1..+5 no Ferreiro (ciclo 16, passo 16-5): o gasto grande do fim de jogo. Cada tentativa custa ouro + 1 gema
// (por tier do item) e pode falhar; a falha NÃO destrói nem rebaixa o item, só consome o custo. Ciclo 20: o +4 e o +5
// dos tiers 7 e 8 pedem também um material das regiões novas (REFINE_EXTRA). Arma ganha +3 de ataque
// por nível; elmo/armadura/calças/botas/escudo ganham +1 de armadura por nível.
// Fora do refino: anel e amuleto (joia, não é trabalho de forja, e já carregam os atributos mais fortes do jogo) e o
// livro dos magos (escudo só de feiticeiro/druida: troca armadura por mana/magia de propósito; +5 de armadura apagaria
// essa troca). Só tier 5 em diante (level 35+): é o fim de jogo, não o caminho até lá.
// `instanceStats` é a ÚNICA conta dos atributos de uma instância (definição + bônus da raridade + refino): o servidor
// (equipamento/combate) e o cliente (balão, comparação, aba Refinar) usam a mesma.
import { TIER_LEVEL, type ItemDef, type ItemInstance, type StatId, type Stats } from "./items.ts";

/** NPC do refino (Mestre Brás, o Ferreiro: shared/data/npcs.ts). */
export const REFINE_NPC = "blacksmith";
export const REFINE_MAX = 5;
export const REFINE_ATTACK_PER_LEVEL = 3;
export const REFINE_ARMOR_PER_LEVEL = 1;

export type RefineTier = 5 | 6 | 7 | 8;
export const REFINE_TIERS: readonly RefineTier[] = [5, 6, 7, 8];
/**
 * Level mínimo de cada tier refinável: o TIER_LEVEL de items.ts (35/50/70/100). O tier de um item é o maior cujo level
 * ele alcança: peças fora da tabela (Botas da Pressa lv 50, Elmo com Lampião lv 35) caem no tier certo.
 */
export const REFINE_TIER_LEVEL = Object.fromEntries(REFINE_TIERS.map((t) => [t, TIER_LEVEL[t - 1]!])) as Record<RefineTier, number>;

/** Chance de FALHA da tentativa, pelo nível alvo (+1..+5). */
export const REFINE_FAIL_CHANCE: readonly number[] = [0, 0.1, 0.25, 0.4, 0.5];
/**
 * Ouro da tentativa do +1, por tier; os níveis seguintes multiplicam por REFINE_GOLD_MULT (×1/2/3/4/6).
 * Tier 5: 3–18 mil; tier 8: 25–150 mil. Em média, do +0 ao +5 ≈ 25,9 × o preço do +1 (falhas incluídas): ~78 mil num
 * item tier 5 e ~650 mil num tier 8 — as 4 peças abissais em +5 ≈ 2,6 milhões.
 */
export const REFINE_BASE_GOLD: Record<RefineTier, number> = { 5: 3_000, 6: 6_000, 7: 12_000, 8: 25_000 };
export const REFINE_GOLD_MULT: readonly number[] = [1, 2, 3, 4, 6];
/** Gema consumida por tentativa (sucesso ou falha). Tier 8: Fragmento Abissal (tengus/samurais do Profundo e chefes). */
export const REFINE_MATERIAL: Record<RefineTier, string> = { 5: "gem_green", 6: "gem_yellow", 7: "gem_purple", 8: "abyss_shard" };
export const REFINE_MATERIAL_COUNT = 1;
/**
 * Ciclo 20 (Siderúrgica e Montadora): material EXTRA das tentativas do +4 e do +5, consumido junto com a gema (sucesso
 * ou falha). Nada ficou mais barato e os níveis de baixo não mudam: quem chega ao topo puxa as regiões novas. Frasco de
 * Aço Líquido (Coração do Forno) no tier 7, Cromo Puro (Pista de Testes) no 8. Tiers 5–6 sem extra: quem refina no lv
 * 35–65 mal chega às regiões novas (o Rubi só cai de monstro comum do lv 64 em diante; antes, só do chefe Contramestre).
 * Do +0 ao +5 são ~3,7 unidades em média (refineExpectedExtra): no tier 8, ~14 mil em Cromo perto dos ~650 mil de ouro.
 */
export const REFINE_EXTRA: Partial<Record<RefineTier, string>> = { 7: "frasco_aco_liquido", 8: "mt_cromo" };
export const REFINE_EXTRA_FROM = 4;
export const REFINE_EXTRA_COUNT = 1;

const MAGES = new Set(["sorcerer", "druid"]);

/** Livro de magia: escudo que só feiticeiro/druida equipam. */
const isSpellbook = (d: ItemDef): boolean =>
  d.slot === "shield" && !!d.vocations?.length && d.vocations.every((v) => MAGES.has(v));

/** Por que o item não pode ser refinado (null = pode). Mesma regra no servidor (aviso) e no cliente (aba Refinar). */
export function refineBlock(d: ItemDef | undefined): string | null {
  if (!d?.slot) return "Só armas e armaduras podem ser refinadas.";
  if (d.slot === "ring" || d.slot === "amulet") return "Anéis e amuletos não podem ser refinados.";
  if (isSpellbook(d)) return "Livros de magia não podem ser refinados.";
  if ((d.slot === "weapon" ? d.stats?.attack ?? 0 : d.stats?.armor ?? 0) <= 0) return "Este item não tem o que refinar.";
  if ((d.level ?? 0) < REFINE_TIER_LEVEL[5]) return `Só itens de tier 5 em diante (level ${REFINE_TIER_LEVEL[5]}+) podem ser refinados.`;
  return null;
}

/** Tier do item para o refino (5..8), ou null se não é refinável. */
export function refineTier(d: ItemDef | undefined): RefineTier | null {
  if (!d || refineBlock(d)) return null;
  const lv = d.level ?? 0;
  let tier: RefineTier = 5;
  for (const t of REFINE_TIERS) if (lv >= REFINE_TIER_LEVEL[t]) tier = t;
  return tier;
}

export const isRefinable = (d: ItemDef | undefined): boolean => refineTier(d) !== null;

/** Nível de refino válido da instância (0 = sem refino). Valor fora de 1..5 ou item não refinável = 0. */
export function refineLevel(d: ItemDef | undefined, raw: unknown): number {
  return Number.isInteger(raw) && (raw as number) >= 1 && (raw as number) <= REFINE_MAX && isRefinable(d) ? (raw as number) : 0;
}

/** Atributos que o refino `level` acrescenta (vazio se não refinável ou +0). */
export function refineBonus(d: ItemDef | undefined, level: number): Stats {
  const n = refineLevel(d, level);
  if (!n) return {};
  return d!.slot === "weapon" ? { attack: n * REFINE_ATTACK_PER_LEVEL } : { armor: n * REFINE_ARMOR_PER_LEVEL };
}

/** Atributos de uma instância: definição + bônus da raridade + refino. A conta única do servidor e do cliente. */
export function instanceStats(d: ItemDef | undefined, inst: Pick<ItemInstance, "bonuses" | "refine"> | null | undefined): Stats {
  const out: Stats = {};
  const add = (k: StatId, v: number) => { if (Number.isFinite(v)) out[k] = (out[k] ?? 0) + v; };
  for (const [k, v] of Object.entries(d?.stats ?? {})) add(k as StatId, v as number);
  for (const b of inst?.bonuses ?? []) add(b.stat, b.value);
  for (const [k, v] of Object.entries(refineBonus(d, inst?.refine ?? 0))) add(k as StatId, v as number);
  return out;
}

export interface RefineCost {
  /** Nível que a tentativa busca (atual + 1). */
  target: number;
  gold: number;
  materialId: string;
  materialCount: number;
  /** Material extra do +4/+5 (REFINE_EXTRA); ausente nos níveis de baixo e nos tiers sem extra. */
  extra?: { materialId: string; count: number };
  /** Chance de falha 0..1 (falha só perde o custo). */
  failChance: number;
}

/** Custo da tentativa de levar o item ao nível `target` (1..5). null = não refinável ou nível fora da faixa. */
export function refineCost(d: ItemDef | undefined, target: number): RefineCost | null {
  const tier = refineTier(d);
  if (!tier || !Number.isInteger(target) || target < 1 || target > REFINE_MAX) return null;
  return {
    target, gold: REFINE_BASE_GOLD[tier] * REFINE_GOLD_MULT[target - 1]!, materialId: REFINE_MATERIAL[tier],
    materialCount: REFINE_MATERIAL_COUNT,
    ...(target >= REFINE_EXTRA_FROM && REFINE_EXTRA[tier] ? { extra: { materialId: REFINE_EXTRA[tier], count: REFINE_EXTRA_COUNT } } : {}),
    failChance: REFINE_FAIL_CHANCE[target - 1]!,
  };
}

/**
 * Todos os materiais da tentativa (gema do tier e o extra), somados por id: a mesma lista para o servidor conferir
 * antes de cobrar e para a aba Refinar mostrar.
 */
export function refineMaterials(c: Pick<RefineCost, "materialId" | "materialCount" | "extra">): { materialId: string; count: number }[] {
  const out = [{ materialId: c.materialId, count: c.materialCount }];
  if (c.extra) {
    const same = out.find((m) => m.materialId === c.extra!.materialId);
    if (same) same.count += c.extra.count;
    else out.push({ materialId: c.extra.materialId, count: c.extra.count });
  }
  return out;
}

/** Ouro esperado (falhas incluídas) para levar um item do tier de +0 a +`to` (balanço e Novidades). */
export function refineExpectedGold(tier: RefineTier, to = REFINE_MAX): number {
  let sum = 0;
  for (let k = 1; k <= to; k++) sum += (REFINE_BASE_GOLD[tier] * REFINE_GOLD_MULT[k - 1]!) / (1 - REFINE_FAIL_CHANCE[k - 1]!);
  return sum;
}

/** Unidades esperadas do material extra (falhas incluídas) para levar um item de tier 7/8 de +0 a +`to` (balanço e Novidades). */
export function refineExpectedExtra(to = REFINE_MAX): number {
  let sum = 0;
  for (let k = REFINE_EXTRA_FROM; k <= to; k++) sum += REFINE_EXTRA_COUNT / (1 - REFINE_FAIL_CHANCE[k - 1]!);
  return sum;
}

/** " +3" para nomes (vazio sem refino). */
export const refineSuffix = (level: number | undefined): string => (level && level > 0 ? ` +${level}` : "");

/** Nome com o refino: "Katana de Mithril +3". */
export const refinedName = (d: ItemDef | undefined, inst: Pick<ItemInstance, "defId" | "refine">): string =>
  `${d?.name ?? inst.defId}${refineSuffix(inst.refine)}`;

// Encantamento (Dona Marta): 1 efeito ativo por personagem (não por arma), em 3 tiers, comprado com ouro + material.
// Dura IMBUE_DURATION_MS de combate PvE: o relógio só anda enquanto o jogador luta contra monstro (não no boneco de
// treino nem no PvP; server/systems/imbuement.ts). Vale no ataque automático contra monstro; em magia, drenos e
// Perfurante valem metade (imbuementSpellValue). Ciclo 16: os encantamentos permanentes de antes viraram tier I com 10 h.
export const IMBUEMENT_EFFECTS = ["lifesteal", "manasteal", "thorns", "pierce", "haste"] as const;
export type ImbuementEffect = (typeof IMBUEMENT_EFFECTS)[number];
export const IMBUEMENT_TIERS = [1, 2, 3] as const;
export type ImbuementTier = (typeof IMBUEMENT_TIERS)[number];

/** Tempo de combate PvE que um encantamento dura. Comprar de novo volta a 10 h (não soma o que sobrava). */
export const IMBUE_DURATION_MS = 10 * 60 * 60 * 1000;
/** Aviso de "está acabando" quando falta isso de combate. */
export const IMBUE_WARN_MS = 30 * 60 * 1000;
/**
 * Recompra do MESMO efeito e tier com menos que isso de combate gasto é ignorada (clique duplo mandando 2 compras): sem
 * isso o 2º pedido cobrava de novo e só renovava as mesmas 10 h.
 */
export const IMBUE_REBUY_GUARD_MS = 5_000;
/** Fração do efeito que vale no dano de magia (drenos e Perfurante). */
export const IMBUE_SPELL_MULT = 0.5;

export const IMBUE_TIER_ROMAN: Record<ImbuementTier, string> = { 1: "I", 2: "II", 3: "III" };

export interface ImbuementTierDef {
  tier: ImbuementTier;
  /** Fração (0..1) do efeito. */
  value: number;
  goldPrice: number;
  materialId: string;
  materialCount: number;
  /** Material extra (ciclo 20: só o tier III, Rubi, Frasco de Aço Líquido ou Cromo Puro), cobrado junto. */
  extra?: { materialId: string; count: number };
  /** Level mínimo para comprar (0 = qualquer um). */
  minLevel: number;
}

export interface ImbuementDef {
  effect: ImbuementEffect;
  name: string;
  /** Efeito por extenso; "{v}" vira o valor do tier ("5%"). */
  text: string;
  tiers: Record<ImbuementTier, ImbuementTierDef>;
}

/**
 * Tier I = os valores e preços de antes do ciclo 16 (5 mil + 5 materiais de caça baixa). Tier II (lv 60): ~×1,5, 30 mil
 * + 5 materiais de monstro lv 60–90 ligados ao efeito. Tier III (lv 90): ~×2, 100 mil + 5 Essências Demoníacas e, desde o
 * ciclo 20, um material das regiões novas (`tier3Extra`: Rubi da Siderúrgica, Frasco de Aço Líquido do Coração do Forno
 * ou Cromo Puro da Pista de Testes). Tetos: Veloz fica em 15% (ataque a cada 1,7 s) e Perfurante em 30% da armadura.
 */
function tiers(values: readonly [number, number, number], tier1Material: string, tier2Material: string, tier3Extra: { materialId: string; count: number }): Record<ImbuementTier, ImbuementTierDef> {
  return {
    1: { tier: 1, value: values[0], goldPrice: 5_000, materialId: tier1Material, materialCount: 5, minLevel: 0 },
    2: { tier: 2, value: values[1], goldPrice: 30_000, materialId: tier2Material, materialCount: 5, minLevel: 60 },
    3: { tier: 3, value: values[2], goldPrice: 100_000, materialId: "demonic_essence", materialCount: 5, extra: tier3Extra, minLevel: 90 },
  };
}

export const IMBUEMENTS: Record<ImbuementEffect, ImbuementDef> = {
  // Necromante (lv 68): necromancia drena a vida. Tier III: Rubi, cor de sangue.
  lifesteal: {
    effect: "lifesteal", name: "Dreno de Vida", text: "{v} do dano causado em monstros volta como vida (metade em magia).",
    tiers: tiers([0.05, 0.08, 0.10], "wolf_fang", "necro_skull", { materialId: "gem_red", count: 2 }),
  },
  // Olho Maligno (lv 60): olho de novo, como o Olho de Aranha do tier I. Tier III: Rubi, como o dreno de vida.
  manasteal: {
    effect: "manasteal", name: "Dreno de Mana", text: "{v} do dano causado em monstros volta como mana (metade em magia).",
    tiers: tiers([0.04, 0.06, 0.08], "spider_eye", "bonelord_eye", { materialId: "gem_red", count: 2 }),
  },
  // Dragão (lv 70): escama dura, como o couro do tier I. Tier III: Cromo Puro, que reflete.
  thorns: {
    effect: "thorns", name: "Espinhos", text: "{v} do dano recebido de golpes de monstro volta para ele.",
    tiers: tiers([0.08, 0.12, 0.16], "wolf_pelt", "dragon_scale", { materialId: "mt_cromo", count: 2 }),
  },
  // Behemoth (lv 90): garra que atravessa armadura. Tier III: Aço Líquido, que atravessa tudo.
  pierce: {
    effect: "pierce", name: "Perfurante", text: "Ignora {v} da armadura do monstro (metade em magia).",
    tiers: tiers([0.15, 0.22, 0.30], "iron_bar", "behemoth_claw", { materialId: "frasco_aco_liquido", count: 1 }),
  },
  // Herói (lv 72): a pressa de quem vive de duelo. Tier III: Cromo Puro, da Pista de Testes.
  haste: {
    effect: "haste", name: "Veloz", text: "Ataque automático {v} mais rápido contra monstros (não vale em magia).",
    tiers: tiers([0.08, 0.12, 0.15], "bee_sting", "hero_badge", { materialId: "mt_cromo", count: 2 }),
  },
};

export function imbuementDef(id: unknown): ImbuementDef | undefined {
  return typeof id === "string" && Object.hasOwn(IMBUEMENTS, id) ? IMBUEMENTS[id as ImbuementEffect] : undefined;
}

export function isImbuementTier(n: unknown): n is ImbuementTier {
  return n === 1 || n === 2 || n === 3;
}

/** Tier de um efeito, com efeito e tier vindos de fora (mensagem, save): undefined se algum for inválido. */
export function imbuementTier(effect: unknown, tier: unknown): ImbuementTierDef | undefined {
  return isImbuementTier(tier) ? imbuementDef(effect)?.tiers[tier] : undefined;
}

/** Todos os materiais do tier (o principal e o extra), somados por id: o servidor confere antes de cobrar e a Dona Marta mostra. */
export function imbuementMaterials(t: Pick<ImbuementTierDef, "materialId" | "materialCount" | "extra">): { materialId: string; count: number }[] {
  const out = [{ materialId: t.materialId, count: t.materialCount }];
  if (t.extra) {
    const same = out.find((m) => m.materialId === t.extra!.materialId);
    if (same) same.count += t.extra.count;
    else out.push({ materialId: t.extra.materialId, count: t.extra.count });
  }
  return out;
}

/** "Dreno de Vida II". */
export function imbuementName(effect: ImbuementEffect, tier: ImbuementTier): string {
  return `${IMBUEMENTS[effect].name} ${IMBUE_TIER_ROMAN[tier]}`;
}

/** 0,08 → "8%"; 0,075 → "7,5%". */
export function imbuementPct(value: number): string {
  return `${String(Math.round(value * 1000) / 10).replace(".", ",")}%`;
}

/** Efeito do tier por extenso ("8% do dano causado em monstros volta como vida (metade em magia)."). */
export function imbuementDesc(effect: ImbuementEffect, tier: ImbuementTier): string {
  const d = IMBUEMENTS[effect];
  return d.text.replace("{v}", imbuementPct(d.tiers[tier].value));
}

/** O que o combate precisa saber do encantamento ativo: efeito e valor do tier. */
export interface ImbuementBonus { effect: ImbuementEffect; value: number }

export function imbuementBonus(effect: ImbuementEffect, tier: ImbuementTier): ImbuementBonus {
  return { effect, value: IMBUEMENTS[effect].tiers[tier].value };
}

/**
 * Valor do encantamento no dano de magia: drenos e Perfurante a IMBUE_SPELL_MULT (magia também passa pela armadura,
 * mitigateSpell). Veloz não entra (magia tem recarga própria, não ritmo de ataque) e Espinhos é sobre dano recebido.
 */
export function imbuementSpellValue(b: ImbuementBonus | undefined): number {
  if (!b || b.effect === "haste" || b.effect === "thorns") return 0;
  return b.value * IMBUE_SPELL_MULT;
}

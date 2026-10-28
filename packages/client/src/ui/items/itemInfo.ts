// Formatação de itens: atributos, requisitos e comparação com o equipado. Sem dependência de UI (testável).
import {
  FOOD_TICK_MS, RARITY_COLOR, RARITY_LABEL, RARITY_PRICE_MULT, autoAttackRange, instanceStats, refineBonus, vocationFits,
  type DamageKind, type EquipSlot, type ItemDef, type ItemInstance, type ItemKind, type Rarity, type StatId, type Stats, type Vocation,
  type WeaponType,
} from "@lemonquest/shared";

export const STAT_LABEL: Record<StatId, string> = {
  attack: "Ataque", armor: "Armadura", hpMax: "Vida máx.", manaMax: "Mana máx.",
  magic: "Magic Level", melee: "Corpo a corpo", distance: "Distância", shield: "Escudo",
  speed: "Velocidade", crit: "Crítico", hpRegen: "Regen. de vida", manaRegen: "Regen. de mana",
};
const PERCENT_STATS = new Set<StatId>(["speed", "crit"]);
/** Ordem de exibição. */
export const STAT_ORDER: StatId[] = [
  "attack", "armor", "hpMax", "manaMax", "magic", "melee", "distance", "shield", "speed", "crit", "hpRegen", "manaRegen",
];

export const SLOT_LABEL: Record<EquipSlot, string> = {
  helmet: "Elmo", amulet: "Amuleto", armor: "Armadura", weapon: "Arma", shield: "Escudo", legs: "Calças", ring: "Anel", boots: "Botas",
};
export const KIND_LABEL: Record<ItemKind, string> = {
  weapon: "Arma", shield: "Escudo", helmet: "Elmo", armor: "Armadura", legs: "Calças", boots: "Botas", ring: "Anel", amulet: "Amuleto",
  potion: "Poção", material: "Material", key: "Chave", quest: "Item de missão", food: "Comida",
};
export const WEAPON_LABEL: Record<WeaponType, string> = {
  sword: "Espada", axe: "Machado", club: "Clava", bow: "Arco", wand: "Varinha", rod: "Cajado",
};
export const DAMAGE_LABEL: Record<DamageKind, string> = {
  physical: "físico", fire: "fogo", ice: "gelo", energy: "energia", earth: "terra", holy: "sagrado", death: "morte", heal: "cura", mana: "mana",
};
export const VOCATION_LABEL: Record<Vocation, string> = {
  knight: "Cavaleiro", paladin: "Paladino", sorcerer: "Feiticeiro", druid: "Druida", fairy: "Fada",
};

export const rarityColor = (r: Rarity | undefined): string => RARITY_COLOR[r ?? "common"];
export const rarityLabel = (r: Rarity | undefined): string => RARITY_LABEL[r ?? "common"];

export const fmtNum = (n: number): string => n.toLocaleString("pt-BR");

export function fmtStat(stat: StatId, v: number): string {
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  return `${sign}${Math.abs(v)}${PERCENT_STATS.has(stat) ? "%" : ""}`;
}

/** Stats da definição + bônus aleatórios + refino da instância (shared instanceStats: a mesma conta do servidor). */
export function totalStats(def: ItemDef | undefined, inst: ItemInstance | undefined): Stats {
  return instanceStats(def, inst);
}

/** `bonus` = bônus da raridade; `refine` = o que o refino soma (separados no balão). */
export interface StatLine { stat: StatId; label: string; total: number; base: number; bonus: number; refine: number }

export function statLines(def: ItemDef | undefined, inst: ItemInstance | undefined): StatLine[] {
  const total = totalStats(def, inst);
  const ref = refineBonus(def, inst?.refine ?? 0);
  const lines: StatLine[] = [];
  for (const stat of STAT_ORDER) {
    const t = total[stat];
    if (!t) continue;
    const base = def?.stats?.[stat] ?? 0;
    const refine = ref[stat] ?? 0;
    lines.push({ stat, label: STAT_LABEL[stat], total: t, base, bonus: t - base - refine, refine });
  }
  return lines;
}

export interface StatDelta { stat: StatId; label: string; delta: number }

/** Diferença (novo − equipado) por atributo; só atributos que mudam. */
export function compareStats(def: ItemDef | undefined, inst: ItemInstance | undefined, eqDef: ItemDef | undefined, eqInst: ItemInstance | undefined): StatDelta[] {
  const a = totalStats(def, inst), b = totalStats(eqDef, eqInst);
  const out: StatDelta[] = [];
  for (const stat of STAT_ORDER) {
    const d = (a[stat] ?? 0) - (b[stat] ?? 0);
    if (d !== 0) out.push({ stat, label: STAT_LABEL[stat], delta: d });
  }
  return out;
}

/** O mínimo do jogador para calcular o dano do ataque automático. */
export interface DamageMe { vocation: Vocation; level: number; skillMelee: number; skillDistance: number; magicLevel: number }

export interface WeaponDamage {
  /** Dano por golpe com esta arma (no lugar da atual). */
  with: [number, number];
  /** Dano por golpe agora (arma equipada ou desarmado). */
  now: [number, number];
  /** Com esta arma o dano é o mesmo de lutar desarmado (arma fraca para o seu level/skill). */
  likeFists: boolean;
}

/**
 * Dano do ataque automático com esta arma vs. o atual — mesma conta do servidor (autoAttackRange). Bônus de ataque
 * e skill vêm de todo o equipamento; a arma candidata substitui a equipada (e o escudo, se for de duas mãos).
 * null = não é arma ou não é da vocação do jogador.
 */
export function weaponDamage(
  def: ItemDef | undefined, inst: ItemInstance | undefined, me: DamageMe | null,
  equipment: Partial<Record<EquipSlot, ItemInstance>>, defOf: (id: string) => ItemDef | undefined,
): WeaponDamage | null {
  if (!def || def.slot !== "weapon" || !me) return null;
  if (!vocationFits(def.vocations, me.vocation)) return null;
  const skills = { melee: me.skillMelee, distance: me.skillDistance, magic: me.magicLevel };
  const sum = (items: [ItemDef | undefined, ItemInstance | undefined][]) => {
    const out: Stats = {};
    for (const [d, i] of items) for (const [k, v] of Object.entries(totalStats(d, i))) out[k as StatId] = (out[k as StatId] ?? 0) + (v as number);
    return (s: StatId) => out[s] ?? 0;
  };
  const worn = (Object.entries(equipment) as [EquipSlot, ItemInstance][]).filter(([, it]) => !!it);
  const curWeapon = equipment.weapon ? defOf(equipment.weapon.defId) : undefined;
  const now = autoAttackRange(me.vocation, me.level, skills, curWeapon, sum(worn.map(([, it]) => [defOf(it.defId), it])));
  const others = worn.filter(([slot]) => slot !== "weapon" && !(def.twoHanded && slot === "shield"));
  const withBonus = sum([...others.map(([, it]) => [defOf(it.defId), it] as [ItemDef | undefined, ItemInstance]), [def, inst]]);
  // Punho com os mesmos bônus (a arma pode dar skill): se a faixa for igual, a arma não acrescenta nada.
  const fists = autoAttackRange(me.vocation, me.level, skills, undefined, withBonus);
  const withR = autoAttackRange(me.vocation, me.level, skills, def, withBonus);
  return { with: withR, now, likeFists: withR[0] === fists[0] && withR[1] === fists[1] };
}

export interface Requirement { text: string; ok: boolean }
export interface PlayerReq { level: number; vocation: string }

export function requirements(def: ItemDef | undefined, me: PlayerReq | null): Requirement[] {
  const out: Requirement[] = [];
  if (!def) return out;
  if (def.level) out.push({ text: `Level ${def.level}`, ok: !me || me.level >= def.level });
  if (def.vocations?.length) {
    out.push({
      text: def.vocations.map((v) => VOCATION_LABEL[v] ?? v).join(", "),
      ok: !me || vocationFits(def.vocations, me.vocation),
    });
  }
  return out;
}

export type EquipCheck = { ok: true } | { ok: false; reason: "slot" | "level" | "vocation" | "twohanded" };

/** O item pode ir para este slot de equipamento? (o servidor é a autoridade; isto só dá o feedback.) */
export function canEquip(
  def: ItemDef | undefined, slot: EquipSlot, me: PlayerReq | null, equipment: Partial<Record<EquipSlot, ItemInstance>>,
  defOf: (id: string) => ItemDef | undefined,
): EquipCheck {
  if (!def || def.slot !== slot) return { ok: false, reason: "slot" };
  if (me && def.level && me.level < def.level) return { ok: false, reason: "level" };
  if (me && !vocationFits(def.vocations, me.vocation)) return { ok: false, reason: "vocation" };
  if (slot === "shield") {
    const w = equipment.weapon && defOf(equipment.weapon.defId);
    if (w?.twoHanded) return { ok: false, reason: "twohanded" };
  }
  return { ok: true };
}

export function kindText(def: ItemDef): string {
  if (def.slot) {
    const w = def.weaponType ? `${WEAPON_LABEL[def.weaponType]} · ` : "";
    return `${w}${SLOT_LABEL[def.slot]}${def.twoHanded ? " · duas mãos" : ""}`;
  }
  return KIND_LABEL[def.kind];
}

/** Efeito de uso (poções). */
export function useText(def: ItemDef): string | null {
  if (!def.use) return null;
  if (def.use.chest) return "Use para abrir (clique direito)";
  const f = def.use.food;
  if (f) {
    const r: string[] = [];
    if (f.hpPerTick) r.push(`+${f.hpPerTick} vida`);
    if (f.manaPerTick) r.push(`+${f.manaPerTick} mana`);
    const min = f.durationMs / 60_000;
    return `Recupera ${r.join(" e ")} a cada ${FOOD_TICK_MS / 1000} s por ${Number.isInteger(min) ? min : min.toLocaleString("pt-BR")} min`;
  }
  const p: string[] = [];
  if (def.use.heal) p.push(`+${def.use.heal} de vida`);
  if (def.use.mana) p.push(`+${def.use.mana} de mana`);
  return p.length ? `${p.join(" e ")} · recarga ${(def.use.cooldownMs / 1000).toLocaleString("pt-BR")} s` : null;
}

/** Valor de venda ao NPC (arredondado para baixo, mínimo 1 se o item tem valor). */
/** Mesmo cálculo do servidor (npcBuyPrice): valor × razão × multiplicador da raridade. */
export function sellPrice(def: ItemDef, ratio: number, rarity: Rarity = "common"): number {
  return def.value > 0 ? Math.max(1, Math.floor(def.value * ratio * (RARITY_PRICE_MULT[rarity] ?? 1))) : 0;
}

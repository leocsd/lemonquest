// Aba "Refinar" do Ferreiro: quais itens aparecem, custo/chance da próxima tentativa e atributos antes → depois.
// Sem dependência de UI (testável); as regras e a conta dos atributos são as do shared (refine.ts, instanceStats).
import {
  EQUIP_SLOTS, REFINE_MAX, instanceStats, isRefinable, refineCost, refineLevel, refinedName,
  type DropFrom, type ItemDef, type ItemInstance, type StatId,
} from "@lemonquest/shared";
import { STAT_LABEL, STAT_ORDER, fmtNum } from "../items/itemInfo.ts";

export interface RefineCandidate { from: DropFrom; inst: ItemInstance; def: ItemDef }

type DefOf = (id: string) => ItemDef | undefined;

/** Itens que o Ferreiro refina: os equipados primeiro (na ordem dos slots), depois a mochila. */
export function refineCandidates(
  inv: { equipment: Partial<Record<string, ItemInstance>>; backpack: (ItemInstance | null)[] } | null | undefined, defOf: DefOf,
): RefineCandidate[] {
  const out: RefineCandidate[] = [];
  if (!inv) return out;
  for (const slot of EQUIP_SLOTS) {
    const inst = inv.equipment[slot];
    const def = inst && defOf(inst.defId);
    if (inst && def && isRefinable(def)) out.push({ from: { where: "equip", slot }, inst, def });
  }
  inv.backpack.forEach((inst, index) => {
    const def = inst ? defOf(inst.defId) : undefined;
    if (inst && def && isRefinable(def)) out.push({ from: { where: "backpack", index }, inst, def });
  });
  return out;
}

export interface StatChange { stat: StatId; label: string; before: number; after: number }

export interface RefineView {
  name: string;
  level: number;
  maxed: boolean;
  /** Próxima tentativa (ausente no máximo). */
  next?: {
    level: number;
    gold: number;
    materialId: string;
    materialName: string;
    materialCount: number;
    have: number;
    /** Chance de sucesso em % (0..100). */
    successPct: number;
    changes: StatChange[];
  };
  /** Motivo do botão desligado (undefined = pode refinar). */
  why?: string;
}

export function refineView(c: RefineCandidate, gold: number, have: (defId: string) => number, defOf: DefOf): RefineView {
  const level = refineLevel(c.def, c.inst.refine);
  const name = refinedName(c.def, c.inst);
  if (level >= REFINE_MAX) return { name, level, maxed: true, why: "Refino máximo" };
  const cost = refineCost(c.def, level + 1)!;
  const before = instanceStats(c.def, c.inst), after = instanceStats(c.def, { ...c.inst, refine: level + 1 });
  const changes: StatChange[] = [];
  for (const stat of STAT_ORDER) {
    const b = before[stat] ?? 0, a = after[stat] ?? 0;
    if (a !== b) changes.push({ stat, label: STAT_LABEL[stat], before: b, after: a });
  }
  const got = have(cost.materialId);
  const materialName = defOf(cost.materialId)?.name ?? cost.materialId;
  const why = got < cost.materialCount ? `Falta ${cost.materialCount - got}x ${materialName}`
    : gold < cost.gold ? "Ouro insuficiente" : undefined;
  return {
    name, level, maxed: false, why,
    next: {
      level: level + 1, gold: cost.gold, materialId: cost.materialId, materialName, materialCount: cost.materialCount, have: got,
      successPct: Math.round((1 - cost.failChance) * 100), changes,
    },
  };
}

/** "+2/5" (ou "+0/5"). */
export const refineProgress = (level: number): string => `+${level}/${REFINE_MAX}`;

/** Texto do botão: "Refinar para +3". */
export const refineButton = (v: RefineView): string => (v.maxed ? "Refino máximo" : `Refinar para +${v.next!.level}`);

/** "Ataque 79 → 82". */
export const changeText = (c: StatChange): string => `${c.label} ${fmtNum(c.before)} → ${fmtNum(c.after)}`;

// Roupas (outfits), addons, tom de tingimento e sexo: validação, carga/gravação no registro e troca (C2S.SetOutfit).
import {
  ADDON_BITS, OUTFITS, OUTFIT_TONES, isSex, isUnlockedIn, outfitAvailable, resolveOutfit, sexOf, type SetOutfitMsg, type Sex,
} from "@lemonquest/shared";
import type { PlayerState } from "../state.ts";
import type { CharacterRecord } from "../persistence/types.ts";

/**
 * A roupa `outfitId` (addonBit = 0) ou o addon (addonBit = 1 | 2) está liberado para o personagem?
 * Liberados de saída: a roupa padrão da vocação e o Cidadão (addons nunca). O resto vem das conquistas
 * (rec.data.unlocks, ver systems/achievements.ts) ou do comando de admin /desbloquear. Sem registro = só o que existe.
 */
export function isOutfitUnlocked(rec: CharacterRecord | undefined, outfitId: string, addonBit: 0 | 1 | 2): boolean {
  if (!rec) return false;
  return isUnlockedIn(rec.data.unlocks ?? [], rec.vocation, outfitId, addonBit);
}

/** Máscara de addons válida (só bits 1|2). */
export function sanitizeAddons(v: unknown): number {
  return typeof v === "number" && Number.isInteger(v) ? v & ADDON_BITS : 0;
}

/**
 * Roupa e sexo do registro (legado sem o campo, ou id desconhecido → padrão da vocação; sem sexo → "m"). Roupa que não
 * existe no sexo (outfitAvailable) volta para a padrão da vocação, sem addons.
 */
export function loadOutfit(rec: CharacterRecord): { outfit: string; addons: number; sex: Sex } {
  const sex = sexOf(rec.data.sex);
  let o = resolveOutfit(rec.data.outfit, rec.vocation);
  if (!outfitAvailable(o, sex)) o = resolveOutfit(undefined, rec.vocation);
  const addons = o.id === rec.data.outfit ? sanitizeAddons(rec.data.addons) : 0;
  return { outfit: o.id, addons, sex };
}

/**
 * Valida um pedido de troca. null = inválido (id desconhecido, bits fora do intervalo, bloqueado, tom não liberado,
 * sexo inválido ou roupa que não existe no sexo). Sem `sex` no pedido, vale o sexo atual do registro.
 */
export function validateSetOutfit(
  m: unknown, rec?: CharacterRecord, unlockedTones: readonly string[] = [],
): { outfit: string; addons: number; tone: string; sex: Sex } | null {
  if (!m || typeof m !== "object") return null;
  const { outfit, addons, tone, sex } = m as Partial<SetOutfitMsg>;
  if (typeof outfit !== "string" || outfit.length > 32 || !Object.hasOwn(OUTFITS, outfit)) return null;
  if (typeof addons !== "number" || !Number.isInteger(addons) || addons < 0 || addons > ADDON_BITS) return null;
  if (!isOutfitUnlocked(rec, outfit, 0)) return null;
  for (const bit of [1, 2] as const) if ((addons & bit) && !isOutfitUnlocked(rec, outfit, bit)) return null;
  if (tone !== undefined && tone !== "" && (!OUTFIT_TONES.some((t) => t.id === tone) || !unlockedTones.includes(tone))) return null;
  if (sex !== undefined && !isSex(sex)) return null;
  const s = sex ?? sexOf(rec?.data.sex);
  if (!outfitAvailable(OUTFITS[outfit]!, s)) return null;
  return { outfit, addons, tone: tone ?? "", sex: s };
}

/** Aplica a troca no estado (todos veem) e no registro (persistido no próximo save). */
export function applySetOutfit(p: PlayerState, rec: CharacterRecord | undefined, m: unknown, unlockedTones: readonly string[] = []): boolean {
  const v = validateSetOutfit(m, rec, unlockedTones);
  if (!v) return false;
  p.outfit = v.outfit;
  p.addons = v.addons;
  p.tone = v.tone;
  p.sex = v.sex;
  if (rec) { rec.data.outfit = v.outfit; rec.data.addons = v.addons; rec.data.tone = v.tone; rec.data.sex = v.sex; }
  return true;
}

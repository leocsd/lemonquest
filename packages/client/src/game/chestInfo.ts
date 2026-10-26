// Classe de um baú de quest (pelos itens dentro): uma vocação, algumas, ou "Todas". Puro: usado pelo rótulo sobre o
// baú no mundo e pelo "olhar".
import { chestLockText, itemDef, questChestDef, questChestGroup, type QuestChestDef, type Vocation } from "@lemonquest/shared";

export const VOCATION_LABEL: Record<Vocation, string> = { knight: "Cavaleiro", paladin: "Paladino", sorcerer: "Feiticeiro", druid: "Druida" };
export const VOCATION_COLOR: Record<Vocation, string> = { knight: "#ff8a6b", paladin: "#ffd166", sorcerer: "#b9a2ff", druid: "#7fe08f" };
const ALL_COLOR = "#e8e6d9";

export interface ChestClass { label: string; color: string; vocations: Vocation[] }

/** Vocações que podem usar algum item do baú; [] = itens sem restrição (todas). */
export function chestVocations(def: QuestChestDef | undefined): Vocation[] {
  const out = new Set<Vocation>();
  for (const it of def?.items ?? []) for (const v of itemDef(it.itemId)?.vocations ?? []) out.add(v);
  return (["knight", "paladin", "sorcerer", "druid"] as const).filter((v) => out.has(v));
}

/** Rótulo e cor da classe do baú (uma vocação = cor dela; várias = "A / B"; nenhuma ou todas = "Todas"). */
export function chestClass(chestId: string): ChestClass {
  const vocations = chestVocations(questChestDef(chestId));
  if (vocations.length === 0 || vocations.length === 4) return { label: "Todas", color: ALL_COLOR, vocations };
  if (vocations.length === 1) return { label: VOCATION_LABEL[vocations[0]!], color: VOCATION_COLOR[vocations[0]!], vocations };
  return { label: vocations.map((v) => VOCATION_LABEL[v]).join(" / "), color: ALL_COLOR, vocations };
}

/** Linhas do "olhar" de um baú: quest, level, chefe que destranca (covis), itens (com classe) e ouro. */
export function chestLookLines(chestId: string): { title: string; lines: string[] } {
  const def = questChestDef(chestId);
  const group = def ? questChestGroup(def.group) : undefined;
  const lines: string[] = [];
  if (group) lines.push(`Quest: ${group.name} · requer level ${group.minLevel}`);
  const lock = group && chestLockText(group);
  if (lock) lines.push(lock);
  for (const it of def?.items ?? []) {
    const d = itemDef(it.itemId);
    const voc = d?.vocations?.length ? ` (${d.vocations.map((v) => VOCATION_LABEL[v]).join(", ")})` : "";
    lines.push(`${it.count > 1 ? `${it.count}× ` : ""}${d?.name ?? it.itemId}${voc}`);
  }
  if (def?.gold) lines.push(`${def.gold.toLocaleString("pt-BR")} de ouro`);
  lines.push(`Classe: ${chestClass(chestId).label}`);
  return { title: "Baú de quest", lines };
}

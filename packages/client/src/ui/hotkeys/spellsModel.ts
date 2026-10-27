// Modelo puro (sem DOM) da janela "Magias": o que um id de atalho representa (magia avulsa, família pronta ou grupo do
// jogador), a magia que o representa num level, os blocos da grade e a legenda curta. Testável sem Preact.
import {
  familiesFor, familyLevel, familySpells, isFamilyId, isGroupId, resolveFamily, spellDef, spellMana, spellsFor,
  type SpellDef, type SpellGroup, type Vocation,
} from "@lemonquest/shared";

export type ItemKind = "spell" | "family" | "group";

export interface SpellItem {
  /** Id que vai no atalho (magia, "fam:…" ou "fam:my:…"). */
  id: string;
  name: string;
  kind: ItemKind;
  /** Magias na ordem de prioridade (magia avulsa: só ela). Grupo vazio: []. */
  spells: SpellDef[];
  /** Level em que libera a primeira magia (grupo vazio: Infinity). */
  level: number;
}

/** Item pelo id do atalho; null = id desconhecido, de outra vocação ou grupo que não existe mais. */
export function itemFor(id: string, voc: Vocation, groups: readonly SpellGroup[]): SpellItem | null {
  if (isFamilyId(id)) {
    const f = resolveFamily(id, groups, voc);
    if (!f || f.vocation !== voc) return null;
    const spells = familySpells(f);
    return { id, name: f.name, kind: isGroupId(id) ? "group" : "family", spells, level: spells.length ? familyLevel(f) : Infinity };
  }
  const s = spellDef(id);
  if (!s || !s.vocations.includes(voc)) return null;
  return { id, name: s.name, kind: "spell", spells: [s], level: s.level };
}

/** Magia que representa o item no level: a primeira liberada da lista; nenhuma liberada = a última (a mais fraca); grupo vazio = null. */
export function shownSpell(item: SpellItem, level: number): SpellDef | null {
  return item.spells.find((s) => s.level <= level) ?? item.spells.at(-1) ?? null;
}

/** Os três blocos da grade, na ordem em que aparecem: grupos do jogador, famílias prontas, magias por level. */
export function itemsFor(voc: Vocation, groups: readonly SpellGroup[]): { groups: SpellItem[]; families: SpellItem[]; spells: SpellItem[] } {
  const items = (ids: string[]) => ids.map((id) => itemFor(id, voc, groups)).filter((x): x is SpellItem => !!x);
  return {
    groups: items(groups.map((g) => g.id)),
    families: items(familiesFor(voc).map((f) => f.id)),
    spells: items([...spellsFor(voc)].sort((a, b) => a.level - b.level).map((s) => s.id)),
  };
}

/** Tipo da magia, para a legenda do tile e da linha do grupo (o jogador vê o que ela faz sem abrir o tooltip). */
export type SpellKind = "alvo" | "area" | "onda" | "cura" | "outras";

export const KIND_LABEL: Record<SpellKind, string> = { alvo: "No alvo", area: "Área", onda: "Onda", cura: "Cura", outras: "Outras" };

/** Cura vem antes do dano (uma magia com os dois conta como cura); sem dano nem cura (buff, invocação, provocar) é "Outras". */
export function kindOf(s: SpellDef): SpellKind {
  if (s.heal) return "cura";
  if (!s.damage) return "outras";
  if (s.target === "wave") return "onda";
  if (s.target === "area_self" || s.target === "area_target") return "area";
  return "alvo";
}

/**
 * Legenda do tile: "No alvo · lv 20 · 40 mana" na magia; "3 magias · lv 1" na família/grupo; "vazio" no grupo sem magias.
 * `withKind = false` tira a categoria da magia: o tile mostra a categoria num chip à parte e não pode repeti-la.
 */
export function subtitle(item: SpellItem, level: number, withKind = true): string {
  if (item.kind === "spell") {
    const s = item.spells[0]!;
    return `${withKind ? `${KIND_LABEL[kindOf(s)]} · ` : ""}lv ${s.level} · ${spellMana(s, level)} mana`;
  }
  if (!item.spells.length) return "vazio";
  return `${item.spells.length} ${item.spells.length === 1 ? "magia" : "magias"} · lv ${item.level}`;
}

// Edição dos grupos de magia (editor da janela "Magias"; puro, sem DOM: testável). As regras de validade são as do
// servidor (shared/data/spellFamilies.ts: sanitizeSpellGroups); aqui só as operações do editor.
import {
  GROUP_MAX, GROUP_SPELLS_MAX, HOTKEY_MAX, cleanGroupName, nextFreeKey, nextGroupId, spellDef,
  type Hotkey, type SpellFamily, type SpellGroup,
} from "@lemonquest/shared";

export interface GroupsResult {
  groups: SpellGroup[];
  /** Grupo para selecionar depois (o novo, o copiado). */
  select?: string;
  message?: string;
  error?: boolean;
}

const copy = (gs: readonly SpellGroup[]): SpellGroup[] => gs.map((g) => ({ ...g, spells: [...g.spells] }));
const numOf = (id: string) => Number(id.split(":").pop());

/** Grupo novo, vazio ou copiado de uma família pronta (`from`: mesmas magias, mesma ordem, mesmo nome). */
export function createGroup(groups: readonly SpellGroup[], from?: SpellFamily): GroupsResult {
  const out = copy(groups);
  const id = nextGroupId(out);
  if (!id) return { groups: out, error: true, message: `No máximo ${GROUP_MAX} grupos. Exclua um para criar outro.` };
  const name = cleanGroupName(from?.name, numOf(id));
  out.push({ id, name, spells: from ? from.spells.slice(0, GROUP_SPELLS_MAX) : [] });
  return { groups: out, select: id, message: from ? `"${name}" copiado: agora é seu, mude como quiser.` : undefined };
}

export function renameGroup(groups: readonly SpellGroup[], id: string, name: string): SpellGroup[] {
  // Durante a digitação o nome pode ficar vazio; o servidor troca vazio por "Grupo <n>".
  return copy(groups).map((g) => (g.id === id ? { ...g, name } : g));
}

export function deleteGroup(groups: readonly SpellGroup[], id: string): SpellGroup[] {
  return copy(groups).filter((g) => g.id !== id);
}

/** Põe a magia no grupo, na posição `at` (fim se ausente). Já no grupo = muda de lugar. */
export function addSpell(groups: readonly SpellGroup[], id: string, spellId: string, at?: number): GroupsResult {
  const out = copy(groups);
  const g = out.find((x) => x.id === id);
  if (!g) return { groups: out };
  const from = g.spells.indexOf(spellId);
  if (from >= 0) return { groups: moveSpell(out, id, from, at ?? g.spells.length - 1) };
  if (g.spells.length >= GROUP_SPELLS_MAX) return { groups: out, error: true, message: `No máximo ${GROUP_SPELLS_MAX} magias por grupo.` };
  const pos = at === undefined ? g.spells.length : Math.max(0, Math.min(at, g.spells.length));
  g.spells.splice(pos, 0, spellId);
  return { groups: out };
}

export function removeSpell(groups: readonly SpellGroup[], id: string, spellId: string): SpellGroup[] {
  return copy(groups).map((g) => (g.id === id ? { ...g, spells: g.spells.filter((s) => s !== spellId) } : g));
}

/** Move a magia da posição `from` para `to` (índices da lista final). */
export function moveSpell(groups: readonly SpellGroup[], id: string, from: number, to: number): SpellGroup[] {
  const out = copy(groups);
  const g = out.find((x) => x.id === id);
  if (!g || from < 0 || from >= g.spells.length) return out;
  const [s] = g.spells.splice(from, 1);
  g.spells.splice(Math.max(0, Math.min(to, g.spells.length)), 0, s!);
  return out;
}

/** "Mais forte primeiro": level decrescente; em empate, mana base decrescente; empate total mantém a ordem atual. */
export function sortStrongest(groups: readonly SpellGroup[], id: string): SpellGroup[] {
  return copy(groups).map((g) => {
    if (g.id !== id) return g;
    const rank = (sid: string): [number, number] => { const d = spellDef(sid); return d ? [d.level, d.mana] : [0, 0]; };
    const spells = g.spells
      .map((s, i) => ({ s, i, r: rank(s) }))
      .sort((a, b) => b.r[0] - a.r[0] || b.r[1] - a.r[1] || a.i - b.i)
      .map((x) => x.s);
    return { ...g, spells };
  });
}

/** Põe o grupo numa tecla livre da barra (já está = só avisa a tecla). */
export function placeGroup(list: readonly Hotkey[], id: string, label: (k: string) => string): { list: Hotkey[]; message: string; error?: boolean } {
  const out = list.map((h) => ({ ...h }));
  const own = out.find((h) => h.spellId === id);
  if (own) return { list: out, message: `Já está na tecla ${label(own.key)}.` };
  const key = out.length < HOTKEY_MAX ? nextFreeKey(out.map((h) => h.key)) : null;
  if (!key) return { list: out, error: true, message: `A barra está cheia (${HOTKEY_MAX}). Tire um atalho nos Atalhos (H).` };
  out.push({ key, spellId: id });
  return { list: out, message: `Na barra, tecla ${label(key)}.` };
}

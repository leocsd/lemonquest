// Famílias de magia ("tecla inteligente"): magias com o mesmo papel (ataque no alvo, área em volta, onda...) num atalho
// só. Apertar conjura a mais forte que estiver pronta (liberada no level, fora de recarga, com mana e no alcance) — como
// o Revolution do RuneScape, mas dentro de uma família. As magias continuam existindo (palavras no chat, atalho próprio).
// O id da família vai no lugar do id da magia no atalho (Hotkey.spellId); o cliente escolhe e manda a magia real.
import type { Vocation } from "../types.ts";
import { spellDef, type SpellDef } from "./spells.ts";

export const FAMILY_PREFIX = "fam:";

export interface SpellFamily {
  /** "fam:<vocação>:<papel>". */
  id: string;
  name: string;
  desc: string;
  vocation: Vocation;
  /** Prioridade: a primeira pronta sai (a mais forte primeiro). */
  spells: readonly string[];
}

const fam = (vocation: Vocation, key: string, name: string, desc: string, spells: string[]): SpellFamily =>
  ({ id: `${FAMILY_PREFIX}${vocation}:${key}`, name, desc, vocation, spells });

export const SPELL_FAMILIES: readonly SpellFamily[] = [
  fam("knight", "target", "Golpe no alvo", "A mais forte pronta entre Golpe Aniquilador e Golpe Brutal.", ["annihilation_strike", "brutal_strike"]),
  fam("knight", "area", "Golpe em área", "A mais forte pronta entre Fúria Giratória, Golpe Frontal e Golpe Giratório.", ["whirlwind", "front_sweep", "spin_strike"]),
  fam("paladin", "target", "Flecha no alvo", "A mais forte pronta entre Flecha Paralisante, Flecha Sagrada e Flecha Perfurante.", ["crippling_arrow", "holy_arrow", "piercing_arrow"]),
  fam("paladin", "area", "Chuva no alvo", "A mais forte pronta entre Chuva de Estrelas, Julgamento Divino, Flecha Explosiva e Chuva de Flechas.", ["star_rain", "divine_judgment", "explosive_arrow", "arrow_rain"]),
  fam("sorcerer", "target", "Ataque no alvo", "A mais forte pronta entre Chama Eterna, Morte Súbita, Raio de Energia e Bola de Fogo.", ["eternal_flame", "sudden_death", "energy_beam", "fireball"]),
  fam("sorcerer", "area", "Área em volta", "A mais forte pronta entre Tempestade Elétrica e Inferno.", ["electric_storm", "inferno"]),
  fam("sorcerer", "wave", "Onda", "A mais forte pronta entre Onda de Fogo e Onda de Energia.", ["fire_wave", "energy_wave"]),
  fam("druid", "target", "Ataque no alvo", "A mais forte pronta entre Fúria da Natureza, Esmagar Terra e Lasca de Gelo.", ["nature_fury", "earth_crush", "ice_shard"]),
  fam("druid", "area", "Área em volta", "A mais forte pronta entre Tempestade de Terra e Nevasca.", ["earth_storm", "blizzard"]),
];

const BY_ID = new Map(SPELL_FAMILIES.map((f) => [f.id, f]));

export const isFamilyId = (id: string): boolean => id.startsWith(FAMILY_PREFIX);
export const familyDef = (id: string): SpellFamily | undefined => BY_ID.get(id);
export const familiesFor = (vocation: Vocation): SpellFamily[] => SPELL_FAMILIES.filter((f) => f.vocation === vocation);
/** Família da vocação que contém a magia (undefined = magia avulsa). */
export const familyOf = (spellId: string, vocation: Vocation): SpellFamily | undefined =>
  SPELL_FAMILIES.find((f) => f.vocation === vocation && f.spells.includes(spellId));

/** Magias da família (na ordem de prioridade). */
export const familySpells = (f: SpellFamily): SpellDef[] => f.spells.map((id) => spellDef(id)).filter((s): s is SpellDef => !!s);

/** Level em que a família libera a primeira magia (grupo vazio: Infinity). */
export const familyLevel = (f: SpellFamily): number => Math.min(...familySpells(f).map((s) => s.level));

/** A primeira magia (mais forte) liberada no level que `ready` aceita; null = nenhuma. */
export function pickFromFamily(f: SpellFamily, level: number, ready: (s: SpellDef) => boolean): SpellDef | null {
  return familySpells(f).find((s) => s.level <= level && ready(s)) ?? null;
}

/** Atalho válido para a vocação: magia dela, família dela ou grupo do jogador que existe em `groups`. */
export function castableBy(id: string, vocation: Vocation, groups: readonly { id: string }[] = []): boolean {
  if (id.startsWith(GROUP_PREFIX)) return groups.some((g) => g.id === id);
  if (isFamilyId(id)) return familyDef(id)?.vocation === vocation;
  return !!spellDef(id)?.vocations.includes(vocation);
}

// --- Grupos do jogador ---------------------------------------------------------------------------------------------
// Famílias montadas pelo próprio jogador (painel "Grupos de magia"): nome e magias escolhidos por ele, na ordem de
// prioridade dele. Mesma regra das famílias prontas: sai a primeira da lista que estiver pronta. Salvos no personagem
// junto com os atalhos (C2S.SetHotkeys), e o id vai no atalho como o de uma família ("fam:my:<n>").

export const GROUP_PREFIX = `${FAMILY_PREFIX}my:`;
/** Máximo de grupos por personagem. */
export const GROUP_MAX = 8;
/** Máximo de magias num grupo. */
export const GROUP_SPELLS_MAX = 8;
/** Tamanho máximo do nome. */
export const GROUP_NAME_MAX = 20;

export interface SpellGroup {
  /** "fam:my:<1..GROUP_MAX>". */
  id: string;
  name: string;
  /** Ids de magias da vocação, na ordem de prioridade (pode estar vazio enquanto o jogador monta). */
  spells: string[];
}

export const isGroupId = (id: string): boolean => id.startsWith(GROUP_PREFIX);
const GROUP_ID = new RegExp(`^${GROUP_PREFIX}([1-9]\d?)$`);

/** Nome limpo: sem caracteres de controle, espaços colapsados, até GROUP_NAME_MAX; vazio vira "Grupo <n>". */
export function cleanGroupName(raw: unknown, n: number): string {
  const s = typeof raw === "string" ? raw.replace(/[\p{C}]/gu, "").replace(/\s+/g, " ").trim().slice(0, GROUP_NAME_MAX).trim() : "";
  return s || `Grupo ${n}`;
}

/**
 * Lista recebida do cliente → lista válida: até GROUP_MAX grupos de id "fam:my:<1..GROUP_MAX>" sem repetir; magias que
 * a vocação conjura (famílias não entram em grupo), sem repetir, até GROUP_SPELLS_MAX.
 */
export function sanitizeSpellGroups(raw: unknown, vocation: Vocation): SpellGroup[] {
  if (!Array.isArray(raw)) return [];
  const out: SpellGroup[] = [];
  const ids = new Set<string>();
  for (const r of raw.slice(0, GROUP_MAX * 2)) {
    if (out.length >= GROUP_MAX) break;
    if (!r || typeof r !== "object") continue;
    const { id, name, spells } = r as Record<string, unknown>;
    const m = typeof id === "string" ? GROUP_ID.exec(id) : null;
    const n = m ? Number(m[1]) : 0;
    if (!m || n < 1 || n > GROUP_MAX || ids.has(id as string)) continue;
    const list: string[] = [];
    if (Array.isArray(spells)) {
      for (const s of spells.slice(0, GROUP_SPELLS_MAX * 2)) {
        if (list.length >= GROUP_SPELLS_MAX) break;
        if (typeof s === "string" && !list.includes(s) && spellDef(s)?.vocations.includes(vocation)) list.push(s);
      }
    }
    ids.add(id as string);
    out.push({ id: id as string, name: cleanGroupName(name, n), spells: list });
  }
  return out;
}

/** Id livre para um grupo novo (null = já tem GROUP_MAX). */
export function nextGroupId(groups: readonly SpellGroup[]): string | null {
  for (let n = 1; n <= GROUP_MAX; n++) if (!groups.some((g) => g.id === `${GROUP_PREFIX}${n}`)) return `${GROUP_PREFIX}${n}`;
  return null;
}

/** O grupo como família (mesmo cálculo de magia escolhida, nível e recarga no cliente). */
export function groupFamily(g: SpellGroup, vocation: Vocation): SpellFamily {
  const names = g.spells.map((id) => spellDef(id)?.name).filter(Boolean);
  const desc = names.length ? `Seu grupo: a primeira pronta entre ${names.join(", ")}.` : "Seu grupo, ainda sem magias.";
  return { id: g.id, name: g.name, desc, vocation, spells: g.spells };
}

/** Família pronta ou grupo do jogador pelo id do atalho. */
export function resolveFamily(id: string, groups: readonly SpellGroup[], vocation: Vocation): SpellFamily | undefined {
  if (!isGroupId(id)) return familyDef(id);
  const g = groups.find((x) => x.id === id);
  return g ? groupFamily(g, vocation) : undefined;
}

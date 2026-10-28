// Atalhos de magia (janela "Magias", tecla H): cada linha liga uma tecla a uma magia. Salvos no personagem (servidor).
// A tecla é o KeyboardEvent.code (independe do layout do teclado), com "Shift+" opcional. Ctrl/Alt ficam de fora: o
// navegador usa Ctrl+1–8 para trocar de aba e Alt abre menus.
import { castableBy, familiesFor, familyLevel, familyOf, type SpellGroup } from "./data/spellFamilies.ts";
import { spellDef, spellsFor } from "./data/spells.ts";
import type { Vocation } from "./types.ts";

export interface Hotkey {
  /** KeyboardEvent.code, com prefixo "Shift+" opcional (ex.: "Digit1", "Shift+KeyF", "F2"). */
  key: string;
  /** Id da magia, de uma família de magias ("fam:…") ou de um grupo do jogador ("fam:my:…"), ver data/spellFamilies.ts. */
  spellId: string;
}

/** Versão da barra padrão: 2 = famílias de magia (o servidor converte barras de versões anteriores uma vez). */
export const HOTKEYS_VERSION = 2;

/** Máximo de atalhos (= slots da barra de ações). */
export const HOTKEY_MAX = 12;

export const SHIFT_PREFIX = "Shift+";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
/** Teclas que podem virar atalho (sem o Shift). */
export const HOTKEY_CODES: ReadonlySet<string> = new Set([
  ...Array.from({ length: 10 }, (_, i) => `Digit${i}`),
  ...[...LETTERS].map((c) => `Key${c}`),
  "F10", // F2–F4 são as posturas; F5 (atualizar), F6/F7 (barra de endereço, navegação), F11 (tela cheia) e F12 (ferramentas) são do navegador
  "Minus", "Equal", "Backquote", "BracketLeft", "BracketRight", "Semicolon", "Quote", "Comma", "Period", "Slash",
  "Backslash", "IntlBackslash", "IntlRo", "Space",
]);

/**
 * Teclas do próprio jogo (código → para que servem). Não viram atalho nem com Shift: o handler do jogo olha só o
 * `code` (Shift+Q também tomaria a poção).
 */
export const RESERVED_KEYS: Readonly<Record<string, string>> = {
  KeyW: "Andar", KeyA: "Andar", KeyS: "Andar", KeyD: "Andar",
  ArrowUp: "Andar", ArrowDown: "Andar", ArrowLeft: "Andar", ArrowRight: "Andar",
  Enter: "Chat", NumpadEnter: "Chat", Escape: "Fechar janelas / limpar alvo", Tab: "Navegação",
  F1: "Ajuda", F2: "Modo ofensivo", F3: "Modo equilibrado", F4: "Modo defensivo", F8: "Seguir o alvo", F9: "Ataque automático",
  KeyQ: "Poção de vida", KeyE: "Poção de mana", KeyI: "Equipamento e mochila", KeyK: "Habilidades", KeyO: "Roupas",
  KeyL: "Diário de missões", KeyJ: "Conquistas", KeyR: "Ranking", KeyB: "Bestiário", KeyM: "Mapa", KeyH: "Magias",
  Space: "Mirar/trocar alvo",
};

/**
 * Combinações com Shift que o jogo usa (a tecla sozinha continua livre): "?" abre a ajuda (Shift + "/" no teclado
 * americano; no ABNT2 o "/?" fica em IntlRo).
 */
export const RESERVED_SHIFT_KEYS: Readonly<Record<string, string>> = {
  [`${SHIFT_PREFIX}Slash`]: "Ajuda (?)", [`${SHIFT_PREFIX}IntlRo`]: "Ajuda (?)",
};

const baseCode = (key: string) => (key.startsWith(SHIFT_PREFIX) ? key.slice(SHIFT_PREFIX.length) : key);

/** Para que o jogo usa esta tecla (null = livre). O numpad inteiro é movimento. */
export function reservedFor(key: string): string | null {
  const base = baseCode(key);
  if (base.startsWith("Numpad")) return "Andar (teclado numérico)";
  return RESERVED_KEYS[base] ?? RESERVED_SHIFT_KEYS[key] ?? null;
}

/** Tecla aceitável como atalho (formato, lista de teclas e não reservada). */
export function isHotkeyKey(key: unknown): key is string {
  if (typeof key !== "string" || key.length > 24) return false;
  return HOTKEY_CODES.has(baseCode(key)) && !reservedFor(key);
}

/** Rótulos das teclas de símbolo no teclado americano (o cliente troca pelo layout real quando o navegador informa). */
const SYMBOL: Record<string, string> = {
  Minus: "-", Equal: "=", Backquote: "`", BracketLeft: "[", BracketRight: "]", Semicolon: ";", Quote: "'",
  Comma: ",", Period: ".", Slash: "/", Backslash: "\\", IntlBackslash: "\\", IntlRo: "/", Space: "Espaço",
};

/**
 * Rótulo curto da tecla para o slot e o painel ("Shift+Digit1" → "⇧1", "KeyF" → "F"). `layout` = rótulos reais do
 * teclado do jogador por código (navigator.keyboard.getLayoutMap), quando disponível.
 */
export function keyLabel(key: string, layout?: ReadonlyMap<string, string>): string {
  const shift = key.startsWith(SHIFT_PREFIX);
  const base = baseCode(key);
  const real = base !== "Space" ? layout?.get(base) : undefined;
  const txt = /^Digit\d$/.test(base) ? base.slice(5)
    : /^Key[A-Z]$/.test(base) ? base.slice(3)
    : real ? real.toUpperCase() : SYMBOL[base] ?? base;
  return (shift ? "⇧" : "") + txt;
}

/**
 * Lista recebida do cliente → lista válida: até HOTKEY_MAX linhas, tecla válida e sem repetir, magia (ou família) que a
 * vocação pode usar e sem repetir (pode ser de level ainda não alcançado). Grupo do jogador só se existe em `groups`
 * (já limpos). Linhas inválidas saem.
 */
export function sanitizeHotkeys(raw: unknown, vocation: Vocation, groups: readonly SpellGroup[] = []): Hotkey[] {
  if (!Array.isArray(raw)) return [];
  const out: Hotkey[] = [];
  const keys = new Set<string>(), spells = new Set<string>();
  for (const r of raw.slice(0, HOTKEY_MAX * 2)) {
    if (out.length >= HOTKEY_MAX) break;
    if (!r || typeof r !== "object") continue;
    const { key, spellId } = r as Record<string, unknown>;
    if (!isHotkeyKey(key) || keys.has(key) || typeof spellId !== "string" || spells.has(spellId)) continue;
    if (!castableBy(spellId, vocation, groups)) continue;
    keys.add(key);
    spells.add(spellId);
    out.push({ key, spellId });
  }
  return out;
}

/** Teclas da barra padrão: 1, 2, ..., 9, 0. */
export const DEFAULT_KEYS: readonly string[] = [...Array.from({ length: 9 }, (_, i) => `Digit${i + 1}`), "Digit0"];

/** Ordem em que teclas livres são sugeridas: 1–0, depois as letras livres, depois as mesmas com Shift. */
export const SUGGESTED_KEYS: readonly string[] = (() => {
  const plain = [...DEFAULT_KEYS, ...[...LETTERS].map((c) => `Key${c}`)];
  return [...plain, ...plain.map((c) => SHIFT_PREFIX + c)].filter(isHotkeyKey);
})();

/** Próxima tecla sugerida que ainda não está em `taken` (null = nenhuma). */
export function nextFreeKey(taken: Iterable<string>): string | null {
  const used = new Set(taken);
  return SUGGESTED_KEYS.find((k) => !used.has(k)) ?? null;
}

/**
 * Atalhos recomendados (padrão) da vocação: as famílias no lugar das magias que elas juntam, mais as magias avulsas, em
 * ordem do level em que liberam (1–0 e, se não couberem, letras livres).
 */
export function defaultHotkeys(vocation: Vocation): Hotkey[] {
  // Mesmo level: a magia avulsa antes da família (a Cura fica na tecla 1).
  const entries = [
    ...spellsFor(vocation).filter((s) => !familyOf(s.id, vocation)).map((s) => ({ id: s.id, level: s.level })),
    ...familiesFor(vocation).map((f) => ({ id: f.id, level: familyLevel(f) })),
  ].sort((a, b) => a.level - b.level);
  return entries.slice(0, HOTKEY_MAX).map((e, i) => ({ key: SUGGESTED_KEYS[i]!, spellId: e.id }));
}

/**
 * Migração da barra antiga (ordem salva no navegador, slot i = tecla i+1): mesmas magias nas mesmas teclas; as
 * magias que não estavam na barra entram nas teclas livres seguintes (1–0, depois letras), até HOTKEY_MAX.
 */
export function hotkeysFromOrder(order: readonly (string | null)[] | null, vocation: Vocation): Hotkey[] {
  if (!order) return defaultHotkeys(vocation);
  const out: Hotkey[] = [];
  const used = new Set<string>();
  order.slice(0, 8).forEach((id, i) => {
    if (id && !used.has(id) && spellDef(id)?.vocations.includes(vocation)) { out.push({ key: DEFAULT_KEYS[i]!, spellId: id }); used.add(id); }
  });
  for (const s of spellsFor(vocation)) {
    if (used.has(s.id) || out.length >= HOTKEY_MAX) continue;
    const key = nextFreeKey(out.map((h) => h.key));
    if (!key) break;
    out.push({ key, spellId: s.id });
    used.add(s.id);
  }
  return sanitizeHotkeys(out.sort((a, b) => SUGGESTED_KEYS.indexOf(a.key) - SUGGESTED_KEYS.indexOf(b.key)), vocation);
}

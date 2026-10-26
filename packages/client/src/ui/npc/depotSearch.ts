// Busca no depot (ciclo 17): quais espaços mostrar para o texto digitado. Puro (sem DOM) para testar.
import type { ItemInstance } from "@lemonquest/shared";

/** Sem acento e em minúsculas ("Poção" acha "pocao"). */
export const foldText = (s: string): string => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

/**
 * Índices dos espaços cujo item tem todas as palavras da busca no nome (`nameOf`: nome com refino e raridade). null =
 * busca vazia (mostra o depot inteiro, inclusive os vazios, para guardar arrastando).
 */
export function depotMatches(items: readonly (ItemInstance | null | undefined)[], query: string, nameOf: (it: ItemInstance) => string): number[] | null {
  const words = foldText(query).split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const out: number[] = [];
  items.forEach((it, i) => {
    if (!it) return;
    const name = foldText(nameOf(it));
    if (words.every((w) => name.includes(w))) out.push(i);
  });
  return out;
}

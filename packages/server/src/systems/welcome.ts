// Boas-vindas a personagem novo (ciclo 17): na primeira entrada no mundo (registro ainda sem posição salva), o Feed de
// todos anuncia a chegada (o mundo é pequeno: quem está online dá um oi) e o novato recebe uma linha pessoal com o
// caminho da primeira missão. Puro: o WorldRoom decide no onJoin e manda junto com os avisos de entrada.
import type { FeedMsg, Vocation } from "@lemonquest/shared";
import type { CharacterRecord } from "../persistence/types.ts";

const VOCATION_LABEL: Record<Vocation, string> = { knight: "Cavaleiro", paladin: "Paladino", sorcerer: "Feiticeiro", druid: "Druida", fairy: "Fada" };

/** Personagem acabou de ser criado: nunca entrou no mundo (x/y nulos até a primeira gravação). */
export const isFirstLogin = (rec: Pick<CharacterRecord, "x" | "y">): boolean => rec.x == null || rec.y == null;

/** Linhas de boas-vindas: `all` para o Feed de todos, `you` só para o novato. */
export function welcomeFeed(name: string, vocation: Vocation): { all: FeedMsg; you: FeedMsg } {
  return {
    all: { text: `🍋 ${name} (${VOCATION_LABEL[vocation] ?? vocation}) acabou de chegar a Pedra Clara. Deem as boas-vindas!`, kind: "info" },
    you: { text: `Boas-vindas, ${name}! Fale com o Capitão Rodrigo (o ! sobre a cabeça) para a primeira missão. Os eventos da semana estão na Agenda, no trilho à direita.`, kind: "info" },
  };
}

// Aviso com a aba em segundo plano: título com contador. Puro (sem DOM) para poder testar.

/** "(3) The Lemon Quest" — sem contador, o título normal. */
export function attentionTitle(base: string, count: number): string {
  return count > 0 ? `(${count > 9 ? "9+" : count}) ${base}` : base;
}

/** O que merece chamar a atenção de quem está em outra aba. */
export type AttentionReason = "whisper" | "trade" | "party" | "friend" | "event" | "eventSoon";

/** Notificações do servidor que contam como "amigo entrou/saiu" (ver systems/social.ts). */
export const isFriendNotice = (text: string): boolean => /\(amigo\)/.test(text);

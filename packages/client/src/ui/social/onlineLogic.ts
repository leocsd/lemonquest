// Painel Online: textos e botões de cada linha. Puro (recebe a entrada e o estado do seu grupo) para testar.
import type { OnlineEntry } from "@lemonquest/shared";

/** "lv 45 · Pântano Turvo" (a zona só vem quando a regra do /quem deixa) e "ausente" para quem caiu. */
export function onlineLine(e: Pick<OnlineEntry, "level" | "zone" | "away">): string {
  return [`lv ${e.level}`, e.zone, e.away ? "ausente" : ""].filter(Boolean).join(" · ");
}

/**
 * Convidar aparece para quem não está no seu grupo, se você pode convidar (sem grupo ou líder) — o mesmo critério do
 * menu do botão direito (playerMenuLogic.ts). O servidor confere o resto (grupo cheio, já em outro grupo).
 */
export const canInviteOnline = (e: Pick<OnlineEntry, "party">, s: { inParty: boolean; leader: boolean }): boolean =>
  !e.party && (!s.inParty || s.leader);

/**
 * Dica do nome: vocação, "divide XP com você" e por que a zona está escondida (a ☆ é unilateral: a zona de um amigo só
 * aparece quando a amizade é mútua, regra do /quem em server/systems/social.ts).
 */
export function onlineTip(e: Pick<OnlineEntry, "share" | "zone" | "friend" | "party">, vocationLabel: string): string {
  const parts = [vocationLabel];
  if (e.share) parts.push("divide XP com você");
  if (!e.zone) parts.push(e.friend ? "zona aparece quando a amizade for mútua" : "zona só para amigos mútuos e grupo");
  return parts.join(" · ");
}

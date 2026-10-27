// Painel Online: textos e botões de cada linha. Puro (recebe a entrada e o estado do seu grupo) para testar.
import type { OnlineEntry } from "@lemonquest/shared";

/** "lv 45 · Pântano Turvo" (a zona só vem quando a regra do /quem deixa) e "ausente" para quem caiu. */
export function onlineLine(e: Pick<OnlineEntry, "level" | "zone" | "away">): string {
  return [`lv ${e.level}`, e.zone, e.away ? "ausente" : ""].filter(Boolean).join(" · ");
}

export interface OnlineGroup<T> { key: "party" | "friends" | "others"; label: string; entries: T[] }

/**
 * Blocos do painel (dono, 2026-10-27): seu grupo, depois amigos, depois o resto do mundo — cada um na ordem em que o
 * servidor mandou (level e nome). Com um bloco só, sem rótulo (a lista inteira é "quem está no mundo").
 */
export function groupOnline<T extends Pick<OnlineEntry, "party" | "friend">>(list: readonly T[]): OnlineGroup<T>[] {
  const all: OnlineGroup<T>[] = [
    { key: "party", label: "Seu grupo", entries: list.filter((e) => e.party) },
    { key: "friends", label: "Amigos", entries: list.filter((e) => !e.party && e.friend) },
    { key: "others", label: "No mundo", entries: list.filter((e) => !e.party && !e.friend) },
  ];
  const groups = all.filter((g) => g.entries.length > 0);
  return groups.length > 1 ? groups : groups.map((g) => ({ ...g, label: "" }));
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

// Portal no rótulo e no "olhar" (puro): zona do destino, monstros do outro lado e o requisito da porta. A regra da porta é
// a mesma do servidor (doorBlockReason); aqui ela só pinta o rótulo de vermelho e explica o motivo.
import { doorBlockReason, questDef, type QuestsMsg, type WorldPortal } from "@lemonquest/shared";
import type { LookContent } from "./lookInfo.ts";

export const PORTAL_COLOR = "#d9c7ff";
export const PORTAL_BLOCKED_COLOR = "#ff6b6b";

type QuestState = Pick<QuestsMsg, "done" | "chests"> | null | undefined;

/** Motivo de a porta não abrir para este personagem (null = passa; portal comum sempre passa). */
export function portalBlockReason(p: WorldPortal, level: number, quests: QuestState): string | null {
  if (!p.minLevel && !p.quest && !p.chestGroup) return null;
  return doorBlockReason(
    p, level,
    (q) => !!quests?.done.includes(q),
    (g) => !!quests?.chests?.includes(g),
    (q) => questDef(q)?.name ?? q,
  );
}

const range = (r: { min: number; max: number }) => (r.min === r.max ? `lv ${r.min}` : `lv ${r.min}–${r.max}`);

/** "Olhar" num portal: o mesmo rótulo do mapa + monstros do outro lado + se dá para passar. */
export function lookPortal(p: WorldPortal, level: number, quests: QuestState, levels?: { min: number; max: number }): LookContent {
  const door = !!(p.minLevel || p.quest || p.chestGroup);
  const reason = portalBlockReason(p, level, quests);
  const lines = [door ? "Porta de missão" : "Portal"];
  if (levels) lines.push(`Monstros do outro lado: ${range(levels)}${level < levels.min ? " · perigoso para o seu level" : ""}`);
  if (reason) lines.push(reason);
  else lines.push(door ? "Você pode passar. Pise para atravessar." : "Pise para atravessar.");
  return { title: p.label, color: reason ? PORTAL_BLOCKED_COLOR : PORTAL_COLOR, lines };
}

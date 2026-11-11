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

/** Primeira linha do "olhar": porta que pede missão/baú, passagem que só pede level (9 de 10 portas) ou portal comum. */
export function portalKind(p: WorldPortal): string {
  if (p.quest || p.chestGroup) return "Porta de missão";
  if (p.minLevel) return `Passagem lv ${p.minLevel}+`;
  return "Portal";
}

/** Distância (tiles) até o destino abaixo da qual um portal sem requisito é só a saída de uma porta, colada nela. */
const DOOR_EXIT_MAX = 3;

/**
 * O portal ganha rótulo no mapa? Não quando é a saída sem requisito de uma porta, com o destino a até DOOR_EXIT_MAX
 * tiles (Goroma: 374,96 → 374,95, ao lado da porta lv 80 em 372,96): o rótulo roxo cobria o vermelho da porta e não
 * dizia nada que não esteja à vista. O "olhar" continua funcionando nele.
 */
export function portalHasLabel(p: WorldPortal): boolean {
  if (p.minLevel || p.quest || p.chestGroup) return true;
  return Math.max(Math.abs(p.toX - p.x), Math.abs(p.toY - p.y)) > DOOR_EXIT_MAX;
}

/** "Olhar" num portal: o mesmo rótulo do mapa + monstros do outro lado + se dá para passar. */
export function lookPortal(p: WorldPortal, level: number, quests: QuestState, levels?: { min: number; max: number }): LookContent {
  const door = !!(p.minLevel || p.quest || p.chestGroup);
  const reason = portalBlockReason(p, level, quests);
  const lines = [portalKind(p)];
  if (levels) lines.push(`Monstros do outro lado: ${range(levels)}${level < levels.min ? " · perigoso para o seu level" : ""}`);
  if (reason) lines.push(reason);
  else lines.push(door ? "Você pode passar. Pise para atravessar." : "Pise para atravessar.");
  return { title: p.label, color: reason ? PORTAL_BLOCKED_COLOR : PORTAL_COLOR, lines };
}

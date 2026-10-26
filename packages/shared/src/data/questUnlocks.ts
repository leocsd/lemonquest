// Descoberta de missões (ciclo 17): por que uma missão ainda não abre, o que vem depois de concluir uma e o que um
// level novo liberou. Regras puras sobre o catálogo (quests.ts); o servidor continua sendo quem aceita (questAvailable).
import { npcDef } from "./npcs.ts";
import { QUEST_LIST, questDef, type QuestDef } from "./quests.ts";
import { QUEST_CHEST_GROUPS } from "./questWorld.ts";

/** O que o diário sabe do jogador: level e missões concluídas/ativas. */
export interface QuestCtx {
  level: number;
  done: readonly string[];
  active?: readonly string[];
}

/** "“Chegou!” (Julião dos Embarcados)" — nome da missão e de quem a dá. */
export function questRef(d: QuestDef): string {
  return `“${d.name}” (${npcDef(d.giver)?.name ?? d.giver})`;
}

/** Junta em português: "a", "a e b", "a, b e c". */
function joinPt(parts: readonly string[]): string {
  return parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} e ${parts.at(-1)}`;
}

/**
 * O que ainda falta para aceitar a missão (as mesmas travas do servidor: level mínimo e missões em `requires`), ou null
 * se já pode. Não olha se ela está ativa ou concluída: isso é estado, não trava.
 * "Requer level 22 e concluir “Bombonas Fugitivas” (Bianca da Logística)."
 */
export function questLockReason(quest: QuestDef, ctx: Pick<QuestCtx, "level" | "done">): string | null {
  const missing = (quest.requires ?? []).filter((id) => !ctx.done.includes(id)).map((id) => {
    const d = questDef(id);
    return d ? questRef(d) : id;
  });
  const parts: string[] = [];
  if (ctx.level < quest.minLevel) parts.push(`level ${quest.minLevel}`);
  if (missing.length) parts.push(`concluir ${joinPt(missing)}`);
  return parts.length ? `Requer ${parts.join(" e ")}.` : null;
}

/** Level em que a missão pode abrir de fato: o maior level mínimo da corrente de pré-requisitos. */
export function questEffectiveLevel(quest: QuestDef, seen: ReadonlySet<string> = new Set()): number {
  let lv = quest.minLevel;
  if (seen.has(quest.id)) return lv; // corrente circular não existe no catálogo, mas não trava o cliente
  const next = new Set(seen).add(quest.id);
  for (const id of quest.requires ?? []) {
    const d = questDef(id);
    if (d) lv = Math.max(lv, questEffectiveLevel(d, next));
  }
  return lv;
}

const open = (d: QuestDef, ctx: QuestCtx) => !ctx.done.includes(d.id) && !(ctx.active ?? []).includes(d.id);

/** Missões que o jogador já pode pegar (nem ativas nem concluídas, sem trava), na ordem do catálogo. */
export function availableQuests(ctx: QuestCtx): QuestDef[] {
  return QUEST_LIST.filter((d) => open(d, ctx) && questLockReason(d, ctx) === null);
}

/**
 * "Em breve": as próximas missões travadas, da que abre mais cedo (level efetivo da corrente) para a mais tarde, com o
 * que falta. As que já estão no level e só esperam outra missão vêm primeiro.
 */
export function upcomingQuests(ctx: QuestCtx, limit = 5): { def: QuestDef; reason: string }[] {
  return QUEST_LIST.flatMap((def, i) => {
    if (!open(def, ctx)) return [];
    const reason = questLockReason(def, ctx);
    return reason ? [{ def, reason, lv: questEffectiveLevel(def), i }] : [];
  })
    .sort((a, b) => a.lv - b.lv || a.i - b.i)
    .slice(0, Math.max(0, limit))
    .map(({ def, reason }) => ({ def, reason }));
}

/** Missões que têm esta como pré-requisito (o "próximo passo" do cartão de missão concluída), na ordem do catálogo. */
export function nextQuestsAfter(questId: string): QuestDef[] {
  return QUEST_LIST.filter((d) => (d.requires ?? []).includes(questId));
}

/** Lugar liberado por level: porta/portal (rótulo calculado pelo índice do mundo) ou quest de baú (a Aniquilação é o baú da alavanca). */
export interface UnlockPlace { label: string; minLevel: number; kind: "portal" | "chest" }

export interface LevelUnlocks {
  /** Missões cujo level mínimo caiu no intervalo (o pré-requisito de missão é com quem mostra). */
  quests: QuestDef[];
  places: UnlockPlace[];
}

/**
 * O que passar de `oldLevel` para `newLevel` liberou (level mínimo em (old, new]): missões, portas e portais com
 * `minLevel` (de `portals`, que o índice do mundo calcula a partir do mapa; o mesmo destino aparece uma vez) e as
 * quests de baú.
 */
export function unlocksBetween(
  oldLevel: number, newLevel: number, portals: readonly { label: string; minLevel?: number }[] = [],
): LevelUnlocks {
  const hit = (lv: number | undefined) => lv !== undefined && lv > oldLevel && lv <= newLevel;
  const places: UnlockPlace[] = [];
  const seen = new Set<string>();
  const add = (p: UnlockPlace) => {
    if (seen.has(p.label)) return;
    seen.add(p.label);
    places.push(p);
  };
  for (const p of portals) if (hit(p.minLevel)) add({ label: p.label, minLevel: p.minLevel!, kind: "portal" });
  for (const g of Object.values(QUEST_CHEST_GROUPS)) if (hit(g.minLevel)) add({ label: `${g.name} (${g.where})`, minLevel: g.minLevel, kind: "chest" });
  return {
    quests: QUEST_LIST.filter((d) => hit(d.minLevel)),
    places: places.sort((a, b) => a.minLevel - b.minLevel),
  };
}

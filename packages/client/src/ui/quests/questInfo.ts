// "Onde fica" e "quão difícil" para o diário, o rastreador, a encomenda e o banner de level (ciclo 17). Puro: recebe o
// índice do mundo (shared/worldIndex.ts) e devolve texto; quem chama passa o índice do cliente (ou null antes do mapa).
import {
  MONSTERS, nextQuestsAfter, npcDef, questLockReason, unlocksBetween, type MonsterDef, type QuestCtx, type WorldIndex,
} from "@lemonquest/shared";
import { levelDifficulty } from "../../game/creatures.ts";

export type HuntIndex = Pick<WorldIndex, "spawnsOf" | "npcAt">;

/** Zona onde o NPC fica ("Oficina dos Engenhos"), ou null (índice ainda não carregado, NPC fora de zona). */
export function npcZone(idx: HuntIndex | null, npcId: string): string | null {
  return idx?.npcAt(npcId)?.zone ?? null;
}

/** "Julião dos Embarcados · Oficina dos Engenhos" (sem a zona quando não se sabe). */
export function npcWhere(idx: HuntIndex | null, npcId: string): string {
  const name = npcDef(npcId)?.name ?? npcId;
  const zone = npcZone(idx, npcId);
  return zone ? `${name} · ${zone}` : name;
}

/** Zonas onde o monstro nasce, da que tem mais monstros para a que tem menos (spawn fora de zona não conta). */
export function monsterZones(idx: HuntIndex | null, monsterId: string): string[] {
  if (!idx) return [];
  const n = new Map<string, number>();
  for (const s of idx.spawnsOf(monsterId)) if (s.zone) n.set(s.zone, (n.get(s.zone) ?? 0) + s.count);
  return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR")).map(([z]) => z);
}

/** "Floresta Sussurrante" / "Pântano e mais 2 lugares" (o rastreador é estreito). */
export function zonesShort(zones: readonly string[]): string {
  if (zones.length <= 1) return zones[0] ?? "";
  return `${zones[0]} e mais ${zones.length - 1} ${zones.length === 2 ? "lugar" : "lugares"}`;
}

/**
 * Onde caçar e quão difícil é para o jogador: "Floresta Sussurrante · lv 8, difícil". Sem índice ou sem spawn, só o
 * level e a dificuldade.
 */
export function huntInfo(idx: HuntIndex | null, monsterId: string, myLevel: number): string {
  const d = MONSTERS[monsterId];
  if (!d) return "";
  const where = zonesShort(monsterZones(idx, monsterId));
  const diff = `lv ${d.level}, ${levelDifficulty(d.level, myLevel, !!d.boss)}`;
  return where ? `${where} · ${diff}` : diff;
}

/** Monstro que pode soltar o item (com a chance), dos mais fracos para os mais fortes. */
export interface MaterialSource { monster: MonsterDef; chance: number; zones: string[] }

/**
 * Quem solta o material da Encomenda: monstros comuns com spawn no mapa primeiro (chefe só se nenhum comum soltar),
 * do menor level para o maior, até `limit`.
 */
export function materialSources(idx: HuntIndex | null, itemId: string, limit = 3, defs: readonly MonsterDef[] = Object.values(MONSTERS)): MaterialSource[] {
  const all = defs.flatMap((m) => {
    if (m.invulnerable || m.xp <= 0) return [];
    const l = m.loot?.find((x) => x.itemId === itemId);
    return l ? [{ monster: m, chance: l.chance, zones: monsterZones(idx, m.id) }] : [];
  });
  // Com o índice, quem não nasce em lugar nenhum (só em missão/evento/Coliseu) fica de fora se houver outro.
  const placed = idx ? all.filter((s) => s.zones.length) : all;
  const pool = placed.length ? placed : all;
  const common = pool.filter((s) => !s.monster.boss);
  return (common.length ? common : pool)
    .sort((a, b) => a.monster.level - b.monster.level || b.chance - a.chance)
    .slice(0, Math.max(0, limit));
}

/** "Lobo (Floresta Sussurrante), Lobo do Inverno (Ilha Gelada)" — quem solta e onde vive. */
export function materialSourcesText(sources: readonly MaterialSource[]): string {
  return sources.map((s) => (s.zones.length ? `${s.monster.name} (${zonesShort(s.zones)})` : s.monster.name)).join(", ");
}

const isOpen = (id: string, ctx: QuestCtx) => !ctx.done.includes(id) && !(ctx.active ?? []).includes(id);

/**
 * Cartão de missão concluída: o que ela abriu. "Nova missão: Os Lobos da Floresta (Capitão Rodrigo · Vila)" quando já dá
 * para pegar; "Em breve: Bombonas Fugitivas: Requer level 12." quando ainda falta algo. `ctx` pode ainda não ter a
 * missão entre as concluídas (o estado chega depois do cartão): ela entra aqui.
 */
export function nextStepLines(idx: HuntIndex | null, questId: string, ctx: QuestCtx, limit = 3): string[] {
  const done = ctx.done.includes(questId) ? ctx.done : [...ctx.done, questId];
  return nextQuestsAfter(questId).filter((d) => isOpen(d.id, ctx)).slice(0, Math.max(0, limit)).map((d) => {
    const lock = questLockReason(d, { level: ctx.level, done });
    return lock ? `Em breve: ${d.name}: ${lock}` : `Nova missão: ${d.name} (${npcWhere(idx, d.giver)})`;
  });
}

/**
 * Banner de level: missões que este level abriu (só as que dá para pegar agora, com quem) e portas, portais e baús de
 * quest liberados. `from` é o maior level já visto na sessão (morrer e subir de novo não repete o aviso).
 */
export function levelUnlockLines(idx: (HuntIndex & Pick<WorldIndex, "portals">) | null, from: number, level: number, ctx: QuestCtx, limit = 4): string[] {
  // Porta que também pede missão (ou baú) só conta quando o resto já está cumprido.
  const portals = (idx?.portals ?? []).filter((p) => !p.chestGroup && (!p.quest || ctx.done.includes(p.quest)));
  const u = unlocksBetween(from, level, portals);
  const quests = u.quests.filter((d) => isOpen(d.id, ctx) && questLockReason(d, ctx) === null)
    .map((d) => `Nova missão: ${d.name} (${npcDef(d.giver)?.name ?? d.giver})`);
  const places = u.places.map((p) => (p.kind === "portal" ? `Liberado: ${p.label}` : `Baú de quest: ${p.label}`));
  return [...places, ...quests].slice(0, Math.max(0, limit));
}

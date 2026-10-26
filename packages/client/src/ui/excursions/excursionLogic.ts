// Mural de Excursões no cliente: o que mostrar e o que dá para fazer a partir do mural que o servidor manda
// (S2C.Excursions). Puro (sem DOM) para testar; as regras valem de verdade no servidor (systems/excursions.ts).
import { EXCURSION_MAX_JOINED, clockText, eventDayText, timeLeftText, type ExcursionDest, type ExcursionView } from "@lemonquest/shared";

const key = (n: string) => n.normalize("NFC").trim().toLowerCase();

export type ExcursionRole = "leader" | "member" | "none";

export function excursionRole(e: ExcursionView, me: string): ExcursionRole {
  if (key(e.leader.name) === key(me)) return "leader";
  return e.members.some((m) => key(m.name) === key(me)) ? "member" : "none";
}

/** Pessoas contando o líder / vagas: "3/5". */
export const excursionFill = (e: ExcursionView): string => `${1 + e.members.length}/${e.slots}`;

/** Em quantas excursões alheias você já está. */
export const joinedCount = (list: readonly ExcursionView[], me: string): number => list.filter((e) => excursionRole(e, me) === "member").length;

/** Por que você não pode marcar "Quero ir" (null = pode). Mesmas regras do servidor, para o botão não mentir. */
export function joinBlock(e: ExcursionView, me: { name: string; level: number }, list: readonly ExcursionView[]): string | null {
  const role = excursionRole(e, me.name);
  if (role !== "none") return role === "leader" ? "Sua excursão" : "Você já está na lista";
  if (me.level < e.minLevel || me.level > e.maxLevel) return `Para lv ${e.minLevel}–${e.maxLevel}`;
  if (1 + e.members.length >= e.slots) return "Lotada";
  if (joinedCount(list, me.name) >= EXCURSION_MAX_JOINED) return `Você já está em ${EXCURSION_MAX_JOINED} excursões`;
  return null;
}

/** "saiu", "saindo" (horário passou, o líder ainda junta o grupo) ou "em 25 min". */
export function excursionStatus(e: Pick<ExcursionView, "at" | "departed">, now: number): string {
  if (e.departed) return "saiu";
  return e.at <= now ? "saindo" : `em ${timeLeftText(e.at, now)}`;
}

/** Horário da excursão: "12:30" hoje, "amanhã 00:15" ou "qui 09:00". */
export function excursionClock(at: number, now: number): string {
  const day = eventDayText(at, now);
  return day === "hoje" ? clockText(at) : `${day} ${clockText(at)}`;
}

/** Opção do seletor de horário: "Agora" ou "12:30 (em 23 min)". */
export function timeSlotLabel(at: number, now: number): string {
  return at === 0 ? "Agora" : `${excursionClock(at, now)} (em ${timeLeftText(at, now)})`;
}

/** Destinos agrupados para o seletor (optgroup), na ordem da lista. */
export function destGroups(dests: readonly ExcursionDest[]): { label: string; items: ExcursionDest[] }[] {
  const groups: { label: string; kind: ExcursionDest["kind"] }[] = [
    { label: "Regiões e cavernas", kind: "zone" }, { label: "Coliseu", kind: "arena" }, { label: "Chefes", kind: "boss" },
  ];
  return groups.map((g) => ({ label: g.label, items: dests.filter((d) => d.kind === g.kind) })).filter((g) => g.items.length);
}

/** Texto da opção de destino: "Minas Abandonadas (lv 14–24)", "Rei Goblin (lv 40 · Ruínas de Kael)". */
export function destOptionText(d: ExcursionDest): string {
  if (!d.levels) return d.label;
  const lv = d.levels.min === d.levels.max ? `lv ${d.levels.min}` : `lv ${d.levels.min}–${d.levels.max}`;
  return `${d.label} (${d.zone ? `${lv} · ${d.zone}` : lv})`;
}

/** Excursões que ainda vão sair (ou saindo) e não saíram: o número no selo da aba. */
export const openExcursions = (list: readonly ExcursionView[]): number => list.filter((e) => !e.departed).length;

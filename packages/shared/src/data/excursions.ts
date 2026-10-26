// Mural de Excursões (ciclo 18): um jogador marca uma saída em grupo só com escolhas (destino, faixa de level, horário,
// vagas; nada de texto livre), os outros marcam "Quero ir" e o líder convida pelo grupo de sempre (C2S.Party).
// Regras e textos puros aqui (servidor e cliente); o estado vive em server/systems/excursions.ts (kv `excursoes.v1`).
import type { Vocation } from "../types.ts";
import type { WorldIndex } from "../worldIndex.ts";
import { MONSTERS } from "./monsters.ts";

/** Id do NPC-quadro na praça da Vila (objeto "npc" do mapa). Postar só com ele aberto. */
export const EXCURSION_NPC = "excursion_board";
/** Horário em passos de 15 min (epoch múltiplo disto: vale em qualquer fuso de hora cheia, meia ou ¾). */
export const EXCURSION_STEP_MS = 15 * 60_000;
/** Até quanto tempo à frente dá para marcar. */
export const EXCURSION_MAX_AHEAD_MS = 12 * 3_600_000;
/** Escolheu um horário que virou passado enquanto a mensagem viajava: ainda vale (vira "agora"). */
export const EXCURSION_LATE_GRACE_MS = 2 * 60_000;
/** Lembrete ao líder e aos inscritos antes da saída. */
export const EXCURSION_REMIND_MS = 2 * 60_000;
/** Some do mural depois do horário. */
export const EXCURSION_EXPIRE_MS = 30 * 60_000;
/** "Saiu" conta a partir de um pouco antes do horário (o grupo costuma se juntar antes). */
export const EXCURSION_DEPART_EARLY_MS = 10 * 60_000;
/** Vagas = pessoas na excursão contando o líder. */
export const EXCURSION_MIN_SLOTS = 2;
export const EXCURSION_MAX_SLOTS = 8;
/** Inscritos no grupo do líder para a excursão contar como "saiu" (conquista Guia de Excursão). */
export const EXCURSION_DEPART_MIN = 2;
/**
 * Guia de Excursão só conta a saída de excursão marcada com esta antecedência (horário − criação) e no máximo uma por
 * líder por dia de jogo (troca às 6h): "agora" + 2 amigos no grupo rendia a conquista em 1 minuto.
 */
export const EXCURSION_GUIDE_LEAD_MS = 15 * 60_000;
/** Faixa de level aceita no formulário. */
export const EXCURSION_LEVEL_MAX = 300;
/** Em quantas excursões alheias um jogador pode estar inscrito ao mesmo tempo. */
export const EXCURSION_MAX_JOINED = 3;
/** Teto do mural (todas as excursões ativas). */
export const EXCURSION_MAX_BOARD = 30;
/** Chave do kv (versão no nome: um formato novo usa outra chave). */
export const EXCURSION_KV = "excursoes.v1";

export type ExcursionDestKind = "zone" | "arena" | "boss";
export interface ExcursionDest {
  id: string;
  label: string;
  kind: ExcursionDestKind;
  /** Faixa de level dos monstros (zona) ou level do chefe; ausente no Coliseu (todas as faixas). */
  levels?: { min: number; max: number };
  /** Chefe: zona do covil. */
  zone?: string;
}

export const COLISEU_DEST: ExcursionDest = { id: "coliseu", label: "Coliseu", kind: "arena" };

/**
 * Destinos do mural: zonas e cavernas com faixa de level (índice do mundo, ciclo 17), o Coliseu e os chefes que têm
 * covil no mapa. Mesma lista no servidor (valida) e no cliente (formulário), montada do mesmo world.json.
 */
export function excursionDestinations(index: Pick<WorldIndex, "zones" | "zoneLevels" | "spawnsOf">): ExcursionDest[] {
  const zones: ExcursionDest[] = [];
  for (const z of index.zones) {
    const levels = index.zoneLevels(z.name);
    if (levels) zones.push({ id: `zona:${z.name}`, label: z.name, kind: "zone", levels });
  }
  zones.sort((a, b) => a.levels!.min - b.levels!.min || a.levels!.max - b.levels!.max || a.label.localeCompare(b.label));
  const bosses: ExcursionDest[] = [];
  for (const m of Object.values(MONSTERS)) {
    if (!m.boss) continue;
    const spot = index.spawnsOf(m.id)[0];
    if (!spot) continue;
    bosses.push({ id: `chefe:${m.id}`, label: m.name, kind: "boss", levels: { min: m.level, max: m.level }, ...(spot.zone ? { zone: spot.zone } : {}) });
  }
  bosses.sort((a, b) => a.levels!.min - b.levels!.min || a.label.localeCompare(b.label));
  return [...zones, COLISEU_DEST, ...bosses];
}

/** "Minas Abandonadas", "Coliseu", "Chefe: Rei Goblin". */
export const excursionDestText = (d: Pick<ExcursionDest, "label" | "kind">): string => (d.kind === "boss" ? `Chefe: ${d.label}` : d.label);

/** Faixa sugerida no formulário: quem divide XP com o líder pela regra dos 2/3 (a regra do grupo não muda). */
export function suggestedBand(level: number): { min: number; max: number } {
  const lv = Math.max(1, Math.min(EXCURSION_LEVEL_MAX, Math.floor(level) || 1));
  return { min: Math.max(1, Math.ceil((lv * 2) / 3)), max: Math.min(EXCURSION_LEVEL_MAX, Math.floor((lv * 3) / 2)) };
}

/**
 * Horários oferecidos: 0 ("agora") e cada múltiplo de 15 min depois de `now` até +12 h. O cliente manda o escolhido; o
 * servidor confere com `excursionTimeOk` (o relógio do cliente é corrigido pela diferença vinda em ExcursionsMsg).
 */
export function excursionTimeSlots(now: number): number[] {
  const out = [0];
  let t = Math.floor(now / EXCURSION_STEP_MS) * EXCURSION_STEP_MS + EXCURSION_STEP_MS;
  for (; t <= now + EXCURSION_MAX_AHEAD_MS; t += EXCURSION_STEP_MS) out.push(t);
  return out;
}

/** Horário pedido → horário da excursão (0 = agora), ou null se não vale (fora do passo, passado ou além de +12 h). */
export function excursionTimeOk(at: unknown, now: number): number | null {
  if (at === 0) return now;
  if (typeof at !== "number" || !Number.isInteger(at) || at % EXCURSION_STEP_MS !== 0) return null;
  if (at < now - EXCURSION_LATE_GRACE_MS || at > now + EXCURSION_MAX_AHEAD_MS) return null;
  return Math.max(at, now);
}

/** Faixa de level do formulário válida (inteiros 1..EXCURSION_LEVEL_MAX, mín ≤ máx). */
export const excursionBandOk = (min: unknown, max: unknown): boolean =>
  Number.isInteger(min) && Number.isInteger(max) && (min as number) >= 1 && (max as number) <= EXCURSION_LEVEL_MAX && (min as number) <= (max as number);

export const excursionSlotsOk = (n: unknown): boolean => Number.isInteger(n) && (n as number) >= EXCURSION_MIN_SLOTS && (n as number) <= EXCURSION_MAX_SLOTS;

// --- mensagens -----------------------------------------------------------------------------------------------------------

/** C2S.Excursion (3/s). `at`: epoch do servidor múltiplo de 15 min, ou 0 = agora. */
export type ExcursionActionMsg =
  | { action: "list" }
  | { action: "post"; dest: string; minLevel: number; maxLevel: number; at: number; slots: number }
  | { action: "cancel"; id: string }
  | { action: "join"; id: string }
  | { action: "leave"; id: string }
  /** Só o líder: convite de grupo (o mesmo do C2S.Party) para cada inscrito online. */
  | { action: "inviteAll"; id: string };

export interface ExcursionPerson { name: string; level: number; vocation: Vocation }

export interface ExcursionView {
  id: string;
  dest: string;
  /** "Minas Abandonadas", "Coliseu", "Chefe: Rei Goblin". */
  destLabel: string;
  /** Faixa dos monstros do destino (informativa). */
  destLevels?: { min: number; max: number };
  leader: ExcursionPerson;
  minLevel: number;
  maxLevel: number;
  /** Saída (epoch do servidor). */
  at: number;
  /** Vagas contando o líder. */
  slots: number;
  /** Inscritos (sem o líder), na ordem em que marcaram. */
  members: ExcursionPerson[];
  /** O líder já juntou no grupo pelo menos EXCURSION_DEPART_MIN inscritos (a excursão saiu). */
  departed: boolean;
}

/** S2C.Excursions: o mural inteiro (a todos quando muda; a quem pede com "list"). */
export interface ExcursionsMsg { list: ExcursionView[]; serverNow: number }

/** S2C.ExcursionPing: alguém marcou "Quero ir" (ao líder) ou lembrete de 2 min (ao líder e aos inscritos). */
export type ExcursionPingMsg =
  | { kind: "join"; id: string; destLabel: string; name: string; level: number; vocation: Vocation; /** sessão, para o convite. */ playerId: string }
  | { kind: "reminder"; id: string; destLabel: string; at: number; leader: string; /** você é o líder. */ leading: boolean };

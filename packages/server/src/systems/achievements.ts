// Conquistas: contadores por personagem (rec.data.ach), avaliação, desbloqueio de roupas/addons/títulos e mensagens.
//
// Ganchos para outros sistemas (missões, grupo...), via funções do módulo:
//   achievementEvent(playerId, "quest" | "party_kill" | ..., data)   — soma contadores e reavalia
//   onUnlock(playerId, unlockId)                                      — concede "outfit:x" | "addon:x:1|2" | "title:x"
// Ambas são no-op se o mundo não estiver no ar (ou o jogador não estiver online).
import {
  ACHIEVEMENTS, BESTIARY_IDS, MAX_TITLE_LEN, S2C, TITLES, addonUnlockId, defaultOutfit, isValidUnlockId, outfitUnlockId, unlockText,
  type AchMetric, type AchievementDef, type AchievementsMsg, type AchievementUnlockedMsg, type FeedMsg, type NoticeMsg, type SetTitleMsg,
} from "@lemonquest/shared";
import type { PlayerState } from "../state.ts";
import type { CharacterData, CharacterRecord } from "../persistence/types.ts";

export type AchievementEventType =
  | "kill" | "death" | "steps" | "gold" | "eat" | "drop" | "pickup" | "offline" | "quest" | "party_kill" | "arena" | "check" | "fish"
  /** Tarefas fechadas no ClickUp pelo usuário vinculado (systems/clickup.ts; métrica `work_tasks`). */
  | "work";

export interface AchievementEventData {
  /** kill: tipo do monstro e se é chefe. */
  defId?: string;
  boss?: boolean;
  /** steps/gold/drop/pickup/quest/party_kill: quantidade (padrão 1). */
  n?: number;
  /** offline: minutos treinados. */
  minutes?: number;
  /** arena: onda vencida. */
  wave?: number;
}

type Ach = NonNullable<CharacterData["ach"]>;

/** Contadores simples (stats) que cada evento soma. */
const COUNTER: Partial<Record<AchievementEventType, string>> = {
  death: "deaths", steps: "steps", gold: "gold", eat: "foods", drop: "drops", pickup: "pickups", quest: "quests", party_kill: "party", fish: "fish", work: "work_tasks",
};

/** Soma tarefas do ClickUp no registro de quem está offline (avaliado no próximo login). */
export function addWorkTasks(rec: CharacterRecord, n: number): void {
  const a = ensureAch(rec);
  a.stats.work_tasks = (a.stats.work_tasks ?? 0) + Math.max(0, Math.floor(n));
}

export interface AchievementOptions {
  record: (sessionId: string) => CharacterRecord | undefined;
  getPlayer: (sessionId: string) => PlayerState | undefined;
  players: () => Iterable<PlayerState>;
  send: (sessionId: string, type: string, msg: unknown) => void;
  broadcast: (type: string, msg: unknown) => void;
  /** % (0–100) explorado do mundo alcançável. */
  explorePct?: (sessionId: string) => number;
  /** Quantos dos 8 espaços de equipamento estão ocupados. */
  equippedCount?: (sessionId: string) => number;
  now?: () => number;
}

/** Cria/normaliza rec.data.ach. */
export function ensureAch(rec: CharacterRecord): Ach {
  const a = (rec.data.ach ??= { done: {}, stats: {}, killed: [] });
  a.done ??= {};
  a.stats ??= {};
  a.killed ??= [];
  return a;
}

/** Concede um desbloqueio ao registro (online ou offline). false = id inválido ou já tinha. */
export function grantUnlock(rec: CharacterRecord, unlockId: string): boolean {
  if (!isValidUnlockId(unlockId)) return false;
  const list = (rec.data.unlocks ??= []);
  if (list.includes(unlockId)) return false;
  list.push(unlockId);
  return true;
}

export const hasUnlock = (rec: CharacterRecord | undefined, unlockId: string): boolean => !!rec?.data.unlocks?.includes(unlockId);

export class AchievementSystem {
  private readonly now: () => number;
  private readonly lastPos = new Map<string, { x: number; y: number }>();
  private readonly explore = new Map<string, number>();
  private nextSweep = 0;
  private nextExplore = 0;

  constructor(private readonly o: AchievementOptions) {
    this.now = o.now ?? Date.now;
  }

  // --- ciclo de vida ------------------------------------------------------------------------------------------------

  /** Entrada no mundo: cria o estado, libera o que o personagem JÁ veste (não tira nada de ninguém) e avalia. */
  load(p: PlayerState, rec: CharacterRecord): void {
    if (!rec.data.ach) {
      ensureAch(rec);
      const outfit = rec.data.outfit;
      if (outfit) {
        const bits = typeof rec.data.addons === "number" ? rec.data.addons : 0;
        if (outfit !== defaultOutfit(rec.vocation) && outfit !== "cidadao") grantUnlock(rec, outfitUnlockId(outfit));
        for (const b of [1, 2] as const) if (bits & b) grantUnlock(rec, addonUnlockId(outfit, b));
      }
    } else {
      ensureAch(rec);
    }
    this.lastPos.set(p.id, { x: p.x, y: p.y });
    this.applyTitle(p, rec);
    this.evaluate(p, rec, true);
    this.sendState(p.id);
  }

  removePlayer(id: string): void {
    this.lastPos.delete(id);
    this.explore.delete(id);
  }

  // --- eventos ------------------------------------------------------------------------------------------------------

  /** Registra um acontecimento do jogador e reavalia as conquistas. */
  event(id: string, type: AchievementEventType, d: AchievementEventData = {}): void {
    const p = this.o.getPlayer(id);
    const rec = this.o.record(id);
    if (!p || !rec) return;
    const a = ensureAch(rec);
    const n = Number.isFinite(d.n) && d.n! > 0 ? Math.floor(d.n!) : 1;
    switch (type) {
      case "kill": {
        a.stats.kills = (a.stats.kills ?? 0) + 1;
        if (d.defId) a.stats[`k:${d.defId}`] = (a.stats[`k:${d.defId}`] ?? 0) + 1; // bestiário: abates por tipo
        if (d.boss) {
          a.stats.bosses = (a.stats.bosses ?? 0) + 1;
          if (d.defId) a.stats[`boss:${d.defId}`] = (a.stats[`boss:${d.defId}`] ?? 0) + 1;
        } else if (d.defId && BESTIARY_IDS.includes(d.defId) && !a.killed.includes(d.defId)) {
          a.killed.push(d.defId);
        }
        break;
      }
      case "offline":
        a.stats.offline = (a.stats.offline ?? 0) + Math.max(0, Math.floor(d.minutes ?? 0));
        break;
      case "arena":
        a.stats.arena = Math.max(a.stats.arena ?? 0, Math.floor(d.wave ?? 0));
        break;
      case "check":
        break;
      default: {
        const key = COUNTER[type];
        if (key) a.stats[key] = (a.stats[key] ?? 0) + n;
      }
    }
    this.evaluate(p, rec);
  }

  /** Concede um desbloqueio a um jogador online (gancho das missões). */
  grant(id: string, unlockId: string): boolean {
    const p = this.o.getPlayer(id);
    const rec = this.o.record(id);
    if (!p || !rec) return false;
    return this.grantTo(p, rec, unlockId, true);
  }

  /** Concede e avisa o jogador. */
  grantTo(p: PlayerState, rec: CharacterRecord, unlockId: string, notify: boolean): boolean {
    if (!grantUnlock(rec, unlockId)) return false;
    if (notify) {
      this.o.send(p.id, S2C.Notice, { text: `Desbloqueado — ${unlockText(unlockId)}`, kind: "good", log: true } satisfies NoticeMsg);
    }
    this.sendState(p.id);
    return true;
  }

  // --- tique (1×/s): passos, exploração e estados derivados (level, skills, equipamento) -------------------------------

  tick(now: number): void {
    if (now < this.nextSweep) return;
    this.nextSweep = now + 1000;
    const doExplore = now >= this.nextExplore;
    if (doExplore) this.nextExplore = now + 5000;
    for (const p of this.o.players()) {
      const rec = this.o.record(p.id);
      if (!rec?.data.ach) continue;
      const last = this.lastPos.get(p.id);
      if (last) {
        const d = Math.max(Math.abs(p.x - last.x), Math.abs(p.y - last.y));
        // Teleporte (portal, /tp, morte) não conta como caminhada: só deslocamentos curtos.
        if (d > 0 && d <= 12) rec.data.ach.stats.steps = (rec.data.ach.stats.steps ?? 0) + d;
      }
      this.lastPos.set(p.id, { x: p.x, y: p.y });
      if (doExplore && this.o.explorePct) this.explore.set(p.id, this.o.explorePct(p.id));
      this.evaluate(p, rec);
    }
  }

  // --- valores e avaliação ---------------------------------------------------------------------------------------------

  /** Valor atual da métrica. */
  metric(p: PlayerState, rec: CharacterRecord, m: AchMetric): number {
    const a = ensureAch(rec);
    switch (m) {
      case "level": return p.level ?? 1;
      case "melee": return p.skillMelee ?? 0;
      case "distance": return p.skillDistance ?? 0;
      case "magic": return p.magicLevel ?? 0;
      case "shield": return p.skillShield ?? 0;
      case "bestiary": return a.killed.filter((k) => BESTIARY_IDS.includes(k)).length;
      case "arena": return Math.max(a.stats.arena ?? 0, rec.data.arenaBest ?? 0);
      case "explore": return this.explore.get(p.id) ?? 0;
      case "equipped": return this.o.equippedCount?.(p.id) ?? 0;
      default: return a.stats[m] ?? 0;
    }
  }

  private evaluate(p: PlayerState, rec: CharacterRecord, quiet = false): void {
    const a = ensureAch(rec);
    let changed = false;
    for (const def of ACHIEVEMENTS) {
      if (a.done[def.id]) continue;
      if (this.metric(p, rec, def.metric) < def.target) continue;
      this.complete(p, rec, def, quiet);
      changed = true;
    }
    if (changed) this.sendState(p.id);
  }

  private complete(p: PlayerState, rec: CharacterRecord, def: AchievementDef, quiet: boolean): void {
    const a = ensureAch(rec);
    a.done[def.id] = this.now();
    for (const r of def.rewards ?? []) grantUnlock(rec, r);
    this.o.send(p.id, S2C.AchievementUnlocked, {
      id: def.id, name: def.name, points: def.points, rewards: def.rewards ?? [],
    } satisfies AchievementUnlockedMsg);
    if (def.rare && !quiet) {
      this.o.broadcast(S2C.Feed, { text: `🏆 ${p.name} conquistou «${def.name}»!`, kind: "info" } satisfies FeedMsg);
    }
  }

  // --- título -----------------------------------------------------------------------------------------------------------

  /** C2S.SetTitle. */
  onSetTitle(p: PlayerState, m: unknown): boolean {
    const rec = this.o.record(p.id);
    if (!rec || !m || typeof m !== "object") return false;
    const t = (m as Partial<SetTitleMsg>).title;
    if (typeof t !== "string" || t.length > MAX_TITLE_LEN + 8) return false;
    const a = ensureAch(rec);
    if (t === "") delete a.title;
    else if (Object.hasOwn(TITLES, t) && hasUnlock(rec, `title:${t}`)) a.title = t;
    else return false;
    this.applyTitle(p, rec);
    this.sendState(p.id);
    return true;
  }

  private applyTitle(p: PlayerState, rec: CharacterRecord): void {
    const t = rec.data.ach?.title;
    if (t && (!Object.hasOwn(TITLES, t) || !hasUnlock(rec, `title:${t}`))) delete rec.data.ach!.title;
    const id = rec.data.ach?.title;
    p.title = id ? TITLES[id]! : "";
  }

  // --- estado para o cliente --------------------------------------------------------------------------------------------

  state(id: string): AchievementsMsg | null {
    const p = this.o.getPlayer(id);
    const rec = this.o.record(id);
    if (!p || !rec) return null;
    const a = ensureAch(rec);
    const progress: Record<string, number> = {};
    let points = 0;
    for (const def of ACHIEVEMENTS) {
      if (a.done[def.id]) { points += def.points; continue; }
      const v = Math.floor(this.metric(p, rec, def.metric));
      if (v > 0) progress[def.id] = v;
    }
    return { done: { ...a.done }, progress, points, unlocks: [...(rec.data.unlocks ?? [])], title: a.title ?? "", bestiary: bestiaryOf(a) };
  }

  sendState(id: string): void {
    const m = this.state(id);
    if (m) this.o.send(id, S2C.Achievements, m);
  }
}

/**
 * Bestiário do personagem: id → abates. Vem dos contadores `k:<id>`; quem derrotou o monstro antes de existir o
 * contador (lista `killed`) aparece com pelo menos 1. Chefes vêm de `boss:<id>`.
 */
export function bestiaryOf(a: NonNullable<CharacterData["ach"]>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of a.killed ?? []) out[id] = Math.max(1, a.stats[`k:${id}`] ?? 0);
  for (const [k, v] of Object.entries(a.stats)) {
    if (k.startsWith("k:") && v > 0) out[k.slice(2)] = Math.max(out[k.slice(2)] ?? 0, v);
    else if (k.startsWith("boss:") && v > 0) out[k.slice(5)] = Math.max(out[k.slice(5)] ?? 0, v);
  }
  return out;
}

/** Pontos de conquista de um registro (ranking). */
export function achievementPoints(rec: { data: CharacterData }): number {
  const done = rec.data.ach?.done;
  if (!done) return 0;
  let s = 0;
  for (const def of ACHIEVEMENTS) if (done[def.id]) s += def.points;
  return s;
}

// --- API de módulo para os outros sistemas ------------------------------------------------------------------------

let active: AchievementSystem | null = null;
export function setActiveAchievements(s: AchievementSystem | null): void { active = s; }

/** Avisa o sistema de conquistas (seguro de chamar de qualquer lugar). */
export function achievementEvent(playerId: string, type: AchievementEventType, data: AchievementEventData = {}): void {
  active?.event(playerId, type, data);
}

/** Gancho único para conceder roupa/addon/título (ex.: recompensa "unlock" de missões). */
export function onUnlock(playerId: string, unlockId: string): boolean {
  return active?.grant(playerId, unlockId) ?? false;
}

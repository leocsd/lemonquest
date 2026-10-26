// Mural de Excursões (ciclo 18, shared/data/excursions.ts): saídas em grupo marcadas só com escolhas. Postar exige o
// Mural aberto (praça da Vila); "Quero ir", sair, cancelar e "Convidar todos" valem de qualquer lugar (aba Excursões da
// Agenda). Pessoas guardadas pelo nome (a sessão muda a cada login); o mural inteiro vive no kv `excursoes.v1`, então
// sobrevive a reinício. O tick (1×/s) manda o lembrete de 2 min, marca a saída (o líder juntou no grupo 2+ inscritos:
// conquista Guia de Excursão, se marcada com 15+ min de antecedência e uma por líder por dia de jogo) e apaga o que passou
// 30 min do horário. Mural reenviado e kv gravado no máximo 1×/s (coalescido); avisos ao líder com intervalo por pessoa.
import {
  EXCURSION_DEPART_EARLY_MS, EXCURSION_DEPART_MIN, EXCURSION_EXPIRE_MS, EXCURSION_GUIDE_LEAD_MS, EXCURSION_KV, EXCURSION_MAX_BOARD,
  EXCURSION_MAX_JOINED, EXCURSION_NPC, EXCURSION_REMIND_MS, S2C, VOCATIONS, eventWhenText, excursionBandOk, excursionDestText,
  excursionSlotsOk, excursionTimeOk,
  type ExcursionActionMsg, type ExcursionDest, type ExcursionPerson, type ExcursionPingMsg, type ExcursionView, type ExcursionsMsg,
  type NoticeMsg,
} from "@lemonquest/shared";
import type { PlayerState } from "../state.ts";
import { bountyDay } from "./bounties.ts";

/** Intervalo das conferências do tick (lembrete, saída, expiração). */
export const EXCURSION_TICK_MS = 1000;
/** O feed global anuncia no máximo uma excursão por líder neste intervalo (postar, cancelar e postar não vira spam). */
export const EXCURSION_FEED_COOLDOWN_MS = 10 * 60_000;
/**
 * Aviso ao líder ("Quero ir" e "saiu da lista") no máximo 1× por pessoa e excursão neste intervalo: entrar e sair em
 * sequência não vira uma enxurrada de cartões na tela do líder (a inscrição vale do mesmo jeito).
 */
export const EXCURSION_PING_COOLDOWN_MS = 30_000;
/** Mural reenviado a todos e kv gravado no máximo 1× neste intervalo; as mudanças no meio saem juntas no tick. */
export const EXCURSION_FLUSH_MS = 1000;

/** Excursão como fica gravada no kv. */
interface Stored {
  id: string;
  dest: string;
  leader: ExcursionPerson;
  minLevel: number;
  maxLevel: number;
  at: number;
  slots: number;
  members: ExcursionPerson[];
  departed: boolean;
  /** Lembrete de 2 min já enviado (ou marcada para menos de 2 min: não há o que lembrar). */
  reminded: boolean;
  createdAt: number;
}

export interface ExcursionHost {
  players(): Iterable<PlayerState>;
  send(id: string, type: string, msg: unknown): void;
  broadcast(type: string, msg: unknown): void;
  /** NPC aberto pelo jogador ("" = nenhum; o NpcSystem fecha ao sair do alcance). */
  npcOpen(id: string): string;
  /** Destinos válidos: excursionDestinations(índice do mundo). */
  destinations: readonly ExcursionDest[];
  /** Sessões do grupo de `id` (inclui ele); [] sem grupo. */
  partyMembers(id: string): string[];
  /** Convite de grupo (o mesmo do C2S.Party), sem aviso: null = enviado; senão o motivo. */
  invite(leader: PlayerState, targetId: string): string | null;
  /** A excursão saiu: crédito da conquista Guia de Excursão ao líder (sessão online). */
  onDeparted?(leaderId: string): void;
  /** Linha no feed global. */
  feed?(text: string): void;
  getKv(key: string): string | undefined;
  setKv(key: string, value: string): void;
  report?(where: string, err: unknown): void;
  now?(): number;
}

const nameKey = (n: string) => n.normalize("NFC").trim().toLowerCase();
const person = (p: PlayerState): ExcursionPerson => ({ name: p.name, level: p.level, vocation: p.vocation });
const isInt = (v: unknown, min: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= min;

/** Pessoa vinda do kv: nome, level e vocação válidos (ou null). */
function readPerson(v: unknown): ExcursionPerson | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.name !== "string" || !o.name.trim() || !isInt(o.level, 1) || !VOCATIONS.includes(o.vocation as ExcursionPerson["vocation"])) return null;
  return { name: o.name, level: o.level, vocation: o.vocation as ExcursionPerson["vocation"] };
}

/** "Ana", "Ana e Beto", "Ana, Beto e Caio". */
const listText = (names: string[]) => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} e ${names.at(-1)}`);

export class ExcursionSystem {
  private list: Stored[] = [];
  private seq = 1;
  private nextCheck = 0;
  private readonly lastFeed = new Map<string, number>();
  /** Último aviso ao líder por excursão, pessoa e tipo (`id|nome|join`): EXCURSION_PING_COOLDOWN_MS. */
  private readonly lastAlert = new Map<string, number>();
  /** Dia de jogo (bountyDay) do último crédito de Guia de Excursão por líder (nameKey); gravado no kv com o mural. */
  private readonly guided = new Map<string, string>();
  /** Mudança no mural ainda não gravada (`pendingKv`) / não difundida (`pendingBoard`): saem no próximo flush. */
  private pendingKv = false;
  private pendingBoard = false;
  private nextFlush = 0;
  private readonly dests: Map<string, ExcursionDest>;

  constructor(private readonly o: ExcursionHost) {
    this.dests = new Map(o.destinations.map((d) => [d.id, d]));
    this.load();
  }

  private now() { return this.o.now?.() ?? Date.now(); }
  private notice(id: string, text: string, kind: NoticeMsg["kind"] = "info", log = false) {
    this.o.send(id, S2C.Notice, { text, kind, ...(log ? { log } : {}) } satisfies NoticeMsg);
  }
  private warn(id: string, text: string) { this.notice(id, text, "warn"); }

  // --- consultas -----------------------------------------------------------------------------------------------------

  /** Excursões ativas (cópias), mais cedo primeiro. */
  get active(): ExcursionView[] { return this.message().list; }

  private find(id: unknown): Stored | undefined { return typeof id === "string" ? this.list.find((e) => e.id === id) : undefined; }
  private isLeader(e: Stored, name: string) { return nameKey(e.leader.name) === nameKey(name); }
  private memberIndex(e: Stored, name: string) { return e.members.findIndex((m) => nameKey(m.name) === nameKey(name)); }
  private online(): Map<string, PlayerState> {
    const m = new Map<string, PlayerState>();
    for (const p of this.o.players()) m.set(nameKey(p.name), p);
    return m;
  }
  private destLabel(e: Stored): string {
    const d = this.dests.get(e.dest);
    return d ? excursionDestText(d) : e.dest;
  }
  private whenText(at: number, now: number): string { return at - now < 60_000 ? "agora" : eventWhenText(at, now); }

  // --- mensagens -----------------------------------------------------------------------------------------------------

  private view(e: Stored, online: Map<string, PlayerState>): ExcursionView {
    // Quem está online aparece com o level de agora (o gravado é o da inscrição).
    const fresh = (x: ExcursionPerson): ExcursionPerson => { const q = online.get(nameKey(x.name)); return q ? person(q) : { ...x }; };
    const d = this.dests.get(e.dest);
    return {
      id: e.id, dest: e.dest, destLabel: this.destLabel(e), ...(d?.levels ? { destLevels: { ...d.levels } } : {}),
      leader: fresh(e.leader), minLevel: e.minLevel, maxLevel: e.maxLevel, at: e.at, slots: e.slots,
      members: e.members.map(fresh), departed: e.departed,
    };
  }

  message(): ExcursionsMsg {
    const online = this.online();
    const list = [...this.list].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id)).map((e) => this.view(e, online));
    return { list, serverNow: this.now() };
  }

  /** O mural a um jogador ("list", reconexão). */
  sendTo(id: string): void { this.o.send(id, S2C.Excursions, this.message()); }
  resend(id: string): void { this.sendTo(id); }

  /**
   * Mudou o mural: grava e manda a todos (`board` = false: só grava, ex.: lembrete enviado). No máximo 1× a cada
   * EXCURSION_FLUSH_MS; o que mudar no meio sai junto no tick (cliques de "Quero ir"/sair em sequência não viram uma
   * escrita no kv e um mural inteiro para todo mundo a cada clique).
   */
  private changed(board = true): void {
    this.pendingKv = true;
    if (board) this.pendingBoard = true;
    this.flush(this.now());
  }

  private flush(now: number, force = false): void {
    if (!this.pendingKv || (!force && now < this.nextFlush)) return;
    this.nextFlush = now + EXCURSION_FLUSH_MS;
    this.pendingKv = false;
    this.save();
    if (this.pendingBoard) {
      this.pendingBoard = false;
      this.o.broadcast(S2C.Excursions, this.message());
    }
  }

  /** Desligando (onBeforeShutdown/onDispose): grava e manda o que o coalescer ainda segurava. */
  flushNow(): void { this.flush(this.now(), true); }

  /** Pode avisar o líder sobre `name` nesta excursão (e já marca o aviso)? Um por EXCURSION_PING_COOLDOWN_MS. */
  private alertOk(e: Stored, name: string, kind: "join" | "leave", now: number): boolean {
    const k = `${e.id}|${nameKey(name)}|${kind}`;
    if (now - (this.lastAlert.get(k) ?? -Infinity) < EXCURSION_PING_COOLDOWN_MS) return false;
    this.lastAlert.set(k, now);
    return true;
  }

  // --- ações ---------------------------------------------------------------------------------------------------------

  onMessage(p: PlayerState, m: ExcursionActionMsg): void {
    if (!m || typeof m !== "object" || typeof m.action !== "string") return;
    switch (m.action) {
      case "list": return this.sendTo(p.id);
      case "post": return this.post(p, m);
      case "cancel": return this.cancel(p, m.id);
      case "join": return this.join(p, m.id);
      case "leave": return this.leave(p, m.id);
      case "inviteAll": return this.inviteAll(p, m.id);
    }
  }

  private post(p: PlayerState, m: Extract<ExcursionActionMsg, { action: "post" }>): void {
    if (this.o.npcOpen(p.id) !== EXCURSION_NPC) return this.warn(p.id, "Excursão se marca no Mural de Excursões, na praça da Vila.");
    if (this.list.some((e) => this.isLeader(e, p.name))) return this.warn(p.id, "Você já tem uma excursão no mural. Cancele a atual para marcar outra.");
    if (this.list.length >= EXCURSION_MAX_BOARD) return this.warn(p.id, "O mural está cheio. Tente de novo mais tarde.");
    const dest = typeof m.dest === "string" ? this.dests.get(m.dest) : undefined;
    if (!dest) return this.warn(p.id, "Escolha um destino da lista.");
    if (!excursionBandOk(m.minLevel, m.maxLevel)) return this.warn(p.id, "Faixa de level inválida.");
    if (!excursionSlotsOk(m.slots)) return this.warn(p.id, "Vagas: de 2 a 8, contando você.");
    const now = this.now();
    const at = excursionTimeOk(m.at, now);
    if (at === null) return this.warn(p.id, "Horário inválido: de agora até 12 h, em passos de 15 min.");
    const e: Stored = {
      id: `x${(this.seq++).toString(36)}`, dest: dest.id, leader: person(p), minLevel: m.minLevel, maxLevel: m.maxLevel, at, slots: m.slots,
      members: [], departed: false, reminded: at - now <= EXCURSION_REMIND_MS, createdAt: now,
    };
    this.list.push(e);
    this.changed();
    const when = this.whenText(at, now);
    const what = `${excursionDestText(dest)} · lv ${e.minLevel}–${e.maxLevel} · ${when}`;
    this.notice(p.id, `Excursão marcada: ${what}. Quem marcar "Quero ir" aparece para você.`, "good");
    const k = nameKey(p.name);
    if (now - (this.lastFeed.get(k) ?? -Infinity) >= EXCURSION_FEED_COOLDOWN_MS) {
      this.lastFeed.set(k, now);
      this.o.feed?.(`🧭 ${p.name} marcou uma excursão: ${what} (${e.slots} vagas). Veja na Agenda → Excursões.`);
    }
  }

  private cancel(p: PlayerState, id: unknown): void {
    const e = this.find(id);
    if (!e) return;
    if (!this.isLeader(e, p.name)) return this.warn(p.id, "Só o líder cancela a excursão.");
    this.list = this.list.filter((x) => x !== e);
    this.changed();
    const now = this.now();
    this.notice(p.id, "Excursão cancelada.");
    const online = this.online();
    for (const m of e.members) {
      const q = online.get(nameKey(m.name));
      if (q) this.notice(q.id, `${e.leader.name} cancelou a excursão (${this.destLabel(e)}, ${this.whenText(e.at, now)}).`, "warn");
    }
  }

  private join(p: PlayerState, id: unknown): void {
    const e = this.find(id);
    if (!e) return this.warn(p.id, "Essa excursão não está mais no mural.");
    if (this.isLeader(e, p.name)) return this.warn(p.id, "Você é o líder dessa excursão.");
    if (this.memberIndex(e, p.name) >= 0) return;
    if (p.level < e.minLevel || p.level > e.maxLevel) return this.warn(p.id, `Essa excursão é para lv ${e.minLevel}–${e.maxLevel}.`);
    if (1 + e.members.length >= e.slots) return this.warn(p.id, "Essa excursão está lotada.");
    const joined = this.list.filter((x) => this.memberIndex(x, p.name) >= 0).length;
    if (joined >= EXCURSION_MAX_JOINED) return this.warn(p.id, `Você já está em ${EXCURSION_MAX_JOINED} excursões. Saia de uma antes.`);
    e.members.push(person(p));
    this.changed();
    const now = this.now();
    const leader = this.online().get(nameKey(e.leader.name));
    const ping = !!leader && this.alertOk(e, p.name, "join", now);
    const label = this.destLabel(e);
    const told = ping ? "O líder foi avisado." : leader ? "O líder vê no mural." : "O líder vê quando entrar.";
    this.notice(p.id, `Você está na lista da excursão de ${e.leader.name} (${label}, ${this.whenText(e.at, now)}). ${told}`, "good");
    if (leader && ping) {
      this.o.send(leader.id, S2C.ExcursionPing, {
        kind: "join", id: e.id, destLabel: label, name: p.name, level: p.level, vocation: p.vocation, playerId: p.id,
      } satisfies ExcursionPingMsg);
    }
  }

  private leave(p: PlayerState, id: unknown): void {
    const e = this.find(id);
    const i = e ? this.memberIndex(e, p.name) : -1;
    if (!e || i < 0) return;
    e.members.splice(i, 1);
    this.changed();
    this.notice(p.id, `Você saiu da lista da excursão de ${e.leader.name}.`);
    const leader = this.online().get(nameKey(e.leader.name));
    if (leader && this.alertOk(e, p.name, "leave", this.now())) this.notice(leader.id, `${p.name} saiu da lista da sua excursão (${this.destLabel(e)}).`);
  }

  /** Convite de grupo para cada inscrito online que ainda não está no grupo do líder; um aviso só com o resultado. */
  private inviteAll(p: PlayerState, id: unknown): void {
    const e = this.find(id);
    if (!e) return this.warn(p.id, "Essa excursão não está mais no mural.");
    if (!this.isLeader(e, p.name)) return this.warn(p.id, "Só o líder convida para o grupo.");
    const online = this.online();
    const mates = new Set(this.o.partyMembers(p.id));
    const targets = e.members.map((m) => online.get(nameKey(m.name))).filter((q): q is PlayerState => !!q && q.id !== p.id);
    const pending = targets.filter((q) => !mates.has(q.id));
    if (!pending.length) {
      return this.notice(p.id, targets.length ? "Todos os inscritos online já estão no seu grupo." : "Nenhum inscrito online agora.");
    }
    const sent: string[] = [], failed = new Set<string>();
    for (const q of pending) {
      const why = this.o.invite(p, q.id);
      if (why) failed.add(why); else sent.push(q.name);
    }
    const fail = [...failed].join(" ");
    if (sent.length) this.notice(p.id, `Convite de grupo enviado para ${listText(sent)}.${fail ? ` ${fail}` : ""}`, "good");
    else this.warn(p.id, fail || "Nenhum convite enviado.");
  }

  // --- tick ----------------------------------------------------------------------------------------------------------

  tick(now = this.now()): void {
    this.flush(now);
    if (now < this.nextCheck) return;
    this.nextCheck = now + EXCURSION_TICK_MS;
    for (const [k, t] of this.lastAlert) if (now - t >= EXCURSION_PING_COOLDOWN_MS) this.lastAlert.delete(k);
    if (!this.list.length) return;
    let changed = false, save = false;
    let online: Map<string, PlayerState> | undefined;
    for (const e of [...this.list]) {
      if (now >= e.at + EXCURSION_EXPIRE_MS) {
        this.list = this.list.filter((x) => x !== e);
        changed = true;
        continue;
      }
      if (!e.reminded && now >= e.at - EXCURSION_REMIND_MS) {
        e.reminded = true;
        save = true;
        this.remind(e, (online ??= this.online()));
      }
      if (!e.departed && now >= e.at - EXCURSION_DEPART_EARLY_MS && this.departedNow(e, (online ??= this.online()))) {
        e.departed = true;
        changed = true;
        const leader = online.get(nameKey(e.leader.name))!;
        const why = this.guideCredit(e, now);
        this.notice(leader.id, `A excursão saiu: ${this.destLabel(e)}. Boa caçada!${why ? ` (${why})` : ""}`, "good", true);
        if (!why) this.o.onDeparted?.(leader.id);
      }
    }
    if (changed) this.changed();
    else if (save) this.changed(false);
  }

  /**
   * Crédito de Guia de Excursão pela saída de `e`: null = conta (e fica marcado no dia); senão o motivo de não contar.
   * Marcada em cima da hora não conta ("agora" + 2 amigos no grupo rendia a conquista em 1 minuto), e é uma por líder
   * por dia de jogo (troca às 6h, como as recompensas).
   */
  private guideCredit(e: Stored, now: number): string | null {
    if (e.at - e.createdAt < EXCURSION_GUIDE_LEAD_MS) {
      return `Guia de Excursão só conta excursão marcada com ${Math.round(EXCURSION_GUIDE_LEAD_MS / 60_000)}+ min de antecedência.`;
    }
    const k = nameKey(e.leader.name), day = bountyDay(now);
    if (this.guided.get(k) === day) return "Guia de Excursão: o crédito de hoje já foi; depois das 6h conta de novo.";
    this.guided.set(k, day);
    return null;
  }

  /** O líder está online e tem no grupo pelo menos EXCURSION_DEPART_MIN inscritos. */
  private departedNow(e: Stored, online: Map<string, PlayerState>): boolean {
    const leader = online.get(nameKey(e.leader.name));
    if (!leader) return false;
    const mates = new Set(this.o.partyMembers(leader.id));
    let n = 0;
    for (const m of e.members) {
      const q = online.get(nameKey(m.name));
      if (q && mates.has(q.id)) n++;
    }
    return n >= EXCURSION_DEPART_MIN;
  }

  private remind(e: Stored, online: Map<string, PlayerState>): void {
    const base = { kind: "reminder" as const, id: e.id, destLabel: this.destLabel(e), at: e.at, leader: e.leader.name };
    const leader = online.get(nameKey(e.leader.name));
    if (leader) this.o.send(leader.id, S2C.ExcursionPing, { ...base, leading: true } satisfies ExcursionPingMsg);
    for (const m of e.members) {
      const q = online.get(nameKey(m.name));
      if (q) this.o.send(q.id, S2C.ExcursionPing, { ...base, leading: false } satisfies ExcursionPingMsg);
    }
  }

  // --- persistência --------------------------------------------------------------------------------------------------

  private save(): void {
    // Crédito de outro dia não barra mais nada: sai do kv.
    const today = bountyDay(this.now());
    for (const [k, d] of this.guided) if (d !== today) this.guided.delete(k);
    try {
      this.o.setKv(EXCURSION_KV, JSON.stringify({ seq: this.seq, list: this.list, guide: Object.fromEntries(this.guided) }));
    } catch (err) {
      this.o.report?.("excursions.save", err);
    }
  }

  /** Lê o kv; descarta o que não vale mais (destino que saiu do mapa, vencida, malformada). */
  private load(): void {
    let raw: unknown;
    try {
      const s = this.o.getKv(EXCURSION_KV);
      raw = s ? JSON.parse(s) : null;
    } catch (err) {
      this.o.report?.("excursions.load", err);
      return;
    }
    if (!raw || typeof raw !== "object") return;
    const saved = raw as { seq?: unknown; list?: unknown; guide?: unknown };
    if (isInt(saved.seq, 1)) this.seq = saved.seq;
    const now = this.now();
    if (saved.guide && typeof saved.guide === "object") {
      const today = bountyDay(now);
      for (const [k, d] of Object.entries(saved.guide as Record<string, unknown>)) if (d === today) this.guided.set(k, d);
    }
    for (const v of Array.isArray(saved.list) ? saved.list : []) {
      const e = this.readStored(v);
      if (!e || now >= e.at + EXCURSION_EXPIRE_MS || this.list.some((x) => x.id === e.id || this.isLeader(x, e.leader.name))) continue;
      this.list.push(e);
      // Contador atrás de um id gravado (kv editado à mão): o próximo id não pode repetir.
      const n = parseInt(e.id.slice(1), 36);
      if (Number.isFinite(n) && n >= this.seq) this.seq = n + 1;
    }
  }

  private readStored(v: unknown): Stored | null {
    if (!v || typeof v !== "object") return null;
    const o = v as Record<string, unknown>;
    const leader = readPerson(o.leader);
    if (typeof o.id !== "string" || typeof o.dest !== "string" || !this.dests.has(o.dest) || !leader) return null;
    if (!excursionBandOk(o.minLevel, o.maxLevel) || !excursionSlotsOk(o.slots) || !isInt(o.at, 0)) return null;
    const members = (Array.isArray(o.members) ? o.members : []).map(readPerson).filter((m): m is ExcursionPerson => !!m)
      .filter((m, i, all) => nameKey(m.name) !== nameKey(leader.name) && all.findIndex((x) => nameKey(x.name) === nameKey(m.name)) === i)
      .slice(0, (o.slots as number) - 1);
    return {
      id: o.id, dest: o.dest, leader, minLevel: o.minLevel as number, maxLevel: o.maxLevel as number, at: o.at, slots: o.slots as number,
      members, departed: o.departed === true, reminded: o.reminded === true, createdAt: isInt(o.createdAt, 0) ? o.createdAt : o.at,
    };
  }
}

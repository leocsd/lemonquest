// Eventos com bônus (shared/data/events.ts): agenda semanal + disparo manual de admin (/evento).
// Anuncia início e fim, avisa quem entra e expõe os multiplicadores de XP e de loot.
// Bônus de código (ex.: "Sprint Fechada" do ClickUp, systems/clickup.ts) é uma camada à parte que SOMA ao evento base
// (agendado ou manual) em vez de substituí-lo: os multiplicadores se multiplicam (Noite de Caçada ×2 + Sprint ×1,25 =
// XP ×2,5) e o chefe do evento agendado é convocado normalmente. O cliente recebe um evento só, já combinado.
// Agenda (ciclo 17): a semana a partir de agora (S2C.Agenda) ao entrar, sob pedido e a cada começo/fim; e o aviso
// S2C.EventSoon EVENT_SOON_MS antes de cada evento agendado (uma vez: só quando o relógio cruza o instante do aviso).
import {
  EVENT_SOON_MS, S2C, clockText, eventDayText, eventDef, eventWhenText, nextScheduled, scheduledEvent, toActive, upcomingEvents,
  type ActiveEvent, type AgendaMsg, type AnnounceMsg, type EventMsg, type EventSoonMsg, type FeedMsg,
} from "@lemonquest/shared";

export interface EventHost {
  broadcast(type: string, msg: unknown): void;
  send(id: string, type: string, msg: unknown): void;
  now?(): number;
  /** Um evento novo começou (agendado ou manual): o servidor convoca o chefe, se houver. */
  onStart?(ev: ActiveEvent): void;
  /** O evento base acabou (hora, /evento parar ou troca por outro): limpeza de quem dependia dele. */
  onEnd?(ev: ActiveEvent): void;
  /** Guarda o evento manual (JSON) para sobreviver a reinício; ausente = só memória. */
  store?: { get(): string | undefined; set(value: string): void };
  /** Guarda o bônus de código (JSON) para sobreviver a reinício; ausente = só memória. */
  bonusStore?: { get(): string | undefined; set(value: string): void };
}

const CHECK_MS = 1000;

export class EventSystem {
  /** Evento base (agendado ou manual). */
  private current: ActiveEvent | null = null;
  /** Bônus de código em andamento (soma ao base). */
  private bonus: ActiveEvent | null = null;
  /** O que vale de fato (base + bônus) e foi mandado ao cliente. */
  private effective: ActiveEvent | null = null;
  /** Disparado por admin: vale no lugar da agenda até `until` (ou /evento parar). */
  private manual: ActiveEvent | null = null;
  private nextCheck = 0;
  /** Janelas agendadas que terminam até aqui foram encerradas por um admin e não valem. */
  private suppressedUntil = 0;
  /**
   * Última reavaliação (começa no boot): o aviso de "começa em 10 min" sai quando o instante do aviso cai entre a
   * anterior e a atual. Reiniciar dentro da janela não repete o aviso (o boot já está depois do instante).
   */
  private lastCheck: number;

  constructor(private readonly o: EventHost) {
    this.manual = this.load();
    this.bonus = this.loadBonus();
    this.lastCheck = this.now();
  }

  private load(): ActiveEvent | null {
    try {
      const raw = this.o.store?.get();
      const v = raw ? (JSON.parse(raw) as Partial<ActiveEvent>) : null;
      const def = v && typeof v.id === "string" ? eventDef(v.id) : undefined;
      if (!def || typeof v?.until !== "number" || v.until <= this.now()) return null;
      return toActive(def, v.until);
    } catch {
      return null;
    }
  }

  private loadBonus(): ActiveEvent | null {
    try {
      const raw = this.o.bonusStore?.get();
      const v = raw ? (JSON.parse(raw) as Partial<ActiveEvent> | null) : null;
      if (!v || typeof v.id !== "string" || typeof v.name !== "string" || typeof v.desc !== "string") return null;
      if (typeof v.until !== "number" || v.until <= this.now()) return null;
      return bonusEvent({ id: v.id, name: v.name, desc: v.desc, xpMult: Number(v.xpMult), lootMult: Number(v.lootMult), until: v.until });
    } catch {
      return null;
    }
  }

  private persist() { this.o.store?.set(JSON.stringify(this.manual)); }
  private persistBonus() { this.o.bonusStore?.set(JSON.stringify(this.bonus)); }

  private now() { return this.o.now?.() ?? Date.now(); }

  /** Reavalia (no máximo 1×/s): começou, terminou ou trocou de evento → anuncia. */
  tick(now = this.now()): void {
    if (now < this.nextCheck) return;
    this.nextCheck = now + CHECK_MS;
    this.warnSoon(now);
    if (this.manual && this.manual.until <= now) { this.manual = null; this.persist(); }
    if (this.bonus && this.bonus.until <= now) {
      this.o.broadcast(S2C.Feed, { text: `Bônus encerrado: ${this.bonus.name}.`, kind: "info" } satisfies FeedMsg);
      this.bonus = null;
      this.persistBonus();
    }
    let sched = scheduledEvent(new Date(now));
    if (sched && sched.until <= this.suppressedUntil) sched = null;
    const want = this.manual ?? sched;
    if (want?.id !== this.current?.id || want?.until !== this.current?.until) {
      const prev = this.current;
      this.current = want;
      if (prev && (!want || want.id !== prev.id)) {
        const next = want ? null : nextScheduled(new Date(now));
        const after = next ? ` Próximo: ${next.def.name}, ${eventWhenText(next.at, now)}.` : "";
        this.o.broadcast(S2C.Feed, { text: `Evento encerrado: ${prev.name}.${after}`, kind: "info" } satisfies FeedMsg);
        this.o.onEnd?.(prev);
      }
      if (want && want.id !== prev?.id) {
        this.o.broadcast(S2C.Announce, { text: `Evento: ${want.name}! ${want.desc} (até ${hhmm(want.until)})`, from: "Evento" } satisfies AnnounceMsg);
        this.o.broadcast(S2C.Feed, { text: `★ ${want.name}: ${want.desc}`, kind: "info" } satisfies FeedMsg);
        this.o.onStart?.(want);
      }
      // A agenda muda quando um evento começa (fica "em andamento") ou acaba (sai da lista e entra o da semana seguinte).
      this.o.broadcast(S2C.Agenda, this.agendaMsg(now));
    }
    const eff = combineEvents(this.current, this.bonus);
    if (sameEvent(eff, this.effective)) return;
    this.effective = eff;
    this.o.broadcast(S2C.Event, { active: eff } satisfies EventMsg);
  }

  /** Dispara `id` por `minutes` agora (admin). null = evento desconhecido. */
  start(id: string, minutes: number, now = this.now()): ActiveEvent | null {
    const def = eventDef(id);
    if (!def || !(minutes >= 1)) return null;
    this.manual = toActive(def, now + Math.floor(minutes) * 60_000);
    this.persist();
    this.nextCheck = 0;
    this.tick(now);
    return this.manual;
  }

  /**
   * Liga um bônus de código por cima do evento base (não o substitui: os multiplicadores se multiplicam). Um bônus por
   * vez: um novo troca o anterior. Sobrevive a reinício (bonusStore). null = já venceu.
   */
  startBonus(ev: ActiveEvent, now = this.now()): ActiveEvent | null {
    if (!(ev.until > now)) return null;
    this.bonus = bonusEvent(ev);
    this.persistBonus();
    this.o.broadcast(S2C.Announce, { text: `${this.bonus.name}! ${this.bonus.desc} (até ${hhmm(this.bonus.until)})`, from: "Evento" } satisfies AnnounceMsg);
    this.o.broadcast(S2C.Feed, { text: `★ ${this.bonus.name}: ${this.bonus.desc}`, kind: "info" } satisfies FeedMsg);
    this.nextCheck = 0;
    this.tick(now);
    return this.bonus;
  }

  /** Encerra o evento em andamento (manual ou agendado; a janela agendada atual não volta) e o bônus. true = havia algo. */
  stop(now = this.now()): boolean {
    if (!this.current && !this.bonus) return false;
    if (this.bonus) {
      this.o.broadcast(S2C.Feed, { text: `Bônus encerrado: ${this.bonus.name}.`, kind: "info" } satisfies FeedMsg);
      this.bonus = null;
      this.persistBonus();
    }
    if (this.current) this.suppressedUntil = Math.max(this.suppressedUntil, this.current.until);
    this.manual = null;
    this.persist();
    this.nextCheck = 0;
    this.tick(now);
    return true;
  }

  /** O que vale de fato (base + bônus). */
  get active(): ActiveEvent | null { return this.effective; }
  /** Bônus de código em andamento (ex.: Sprint Fechada). */
  get activeBonus(): ActiveEvent | null { return this.bonus; }
  xpMult(): number { return this.effective?.xpMult ?? 1; }
  lootMult(): number { return this.effective?.lootMult ?? 1; }

  /** Quem entra (ou volta de uma queda) recebe o evento em andamento e a agenda. */
  sendTo(id: string): void {
    if (this.effective) this.o.send(id, S2C.Event, { active: this.effective } satisfies EventMsg);
    this.sendAgenda(id);
  }

  /** C2S.AgendaRequest (janela Agenda aberta). */
  sendAgenda(id: string, now = this.now()): void {
    this.o.send(id, S2C.Agenda, this.agendaMsg(now));
  }

  /** A semana a partir de `now`: uma ocorrência de cada evento agendado, a em andamento primeiro. */
  agendaMsg(now = this.now()): AgendaMsg {
    const events = upcomingEvents(new Date(now)).map(({ def, start, end }) => ({
      id: def.id, name: def.name, desc: def.desc, xpMult: def.xpMult, lootMult: def.lootMult, ...(def.boss ? { boss: def.boss } : {}),
      ...(def.invasion ? { invasion: true as const } : {}), start, end,
    }));
    return { events, serverNow: now };
  }

  /** Aviso de "começa em 10 min" do próximo evento agendado, se o instante do aviso caiu desde a última reavaliação. */
  private warnSoon(now: number): void {
    const prev = this.lastCheck;
    this.lastCheck = now;
    const next = nextScheduled(new Date(prev));
    if (!next) return;
    const warnAt = next.at - EVENT_SOON_MS;
    if (!(prev < warnAt && warnAt <= now && now < next.at)) return;
    const { def, at } = next;
    this.o.broadcast(S2C.EventSoon, { id: def.id, name: def.name, desc: def.desc, start: at } satisfies EventSoonMsg);
    const min = Math.max(1, Math.round((at - now) / 60_000));
    this.o.broadcast(S2C.Feed, { text: `⏰ Em ${min} min: ${def.name} (${clockText(at)}) — ${def.desc}`, kind: "info" } satisfies FeedMsg);
  }

  /** Texto do /evento. */
  statusLines(now = this.now()): string[] {
    const lines: string[] = [];
    const cur = this.effective;
    if (cur) lines.push(`Em andamento: ${cur.name} (${cur.desc}) até ${hhmm(cur.until)} — XP ×${cur.xpMult}, loot ×${cur.lootMult}.`);
    else lines.push("Nenhum evento em andamento.");
    const n = nextScheduled(new Date(now));
    if (n) lines.push(`Próximo agendado: ${n.def.name} — ${eventWhenText(n.at, now)} (${n.def.desc}).`);
    return lines;
  }
}

/**
 * Texto do /agenda (todos): a semana agrupada por dia, uma linha por dia (o chat não vira uma parede de avisos).
 * "▶ agora" marca o em andamento e "← próximo" o primeiro que ainda vai começar.
 */
export function agendaLines(now: number): string[] {
  const list = upcomingEvents(new Date(now));
  const next = list.find((e) => !e.live);
  const days = new Map<string, string[]>();
  for (const e of list) {
    const day = eventDayText(e.start, now);
    const mark = e.live ? ` ▶ agora (até ${clockText(e.end)})` : e === next ? " ← próximo" : "";
    days.set(day, [...(days.get(day) ?? []), `${clockText(e.start)} ${e.def.name}${mark}`]);
  }
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  return ["Agenda da semana (a mesma do botão Agenda, no trilho à direita):", ...[...days].map(([d, items]) => `${cap(d)}: ${items.join(" · ")}`)];
}

/** Multiplicadores de bônus de código ficam entre 1 e 3 (gravação corrompida não vira XP infinita). */
function bonusEvent(ev: ActiveEvent): ActiveEvent {
  const lim = (n: number) => (Number.isFinite(n) ? Math.min(3, Math.max(1, n)) : 1);
  return { id: ev.id, name: ev.name, desc: ev.desc, xpMult: lim(ev.xpMult), lootMult: lim(ev.lootMult), until: ev.until };
}

/** Base + bônus num evento só (o cliente mostra um): multiplicadores multiplicados, vale até o primeiro acabar. */
export function combineEvents(base: ActiveEvent | null, bonus: ActiveEvent | null): ActiveEvent | null {
  if (!bonus) return base;
  if (!base) return bonus;
  const mul = (a: number, b: number) => Math.round(a * b * 1000) / 1000;
  return {
    id: base.id, name: `${base.name} + ${bonus.name}`, desc: `${base.desc} · ${bonus.desc}`,
    xpMult: mul(base.xpMult, bonus.xpMult), lootMult: mul(base.lootMult, bonus.lootMult),
    until: Math.min(base.until, bonus.until), ...(base.boss ? { boss: base.boss } : {}),
  };
}

const sameEvent = (a: ActiveEvent | null, b: ActiveEvent | null): boolean =>
  a === b || (!!a && !!b && a.id === b.id && a.name === b.name && a.until === b.until && a.xpMult === b.xpMult && a.lootMult === b.lootMult);

function hhmm(ms: number): string {
  return new Date(ms).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

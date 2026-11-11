// ClickUp dinâmico (ciclo 11): o trabalho de verdade do escritório aparece no jogo, só leitura e disfarçado.
//   A1 "Chegou!"   — tarefa da lista de compras que entra em "pedidos entregues" → feed + Caixa de Encomenda no chão.
//   A2 Sprints     — tarefas fechadas na semana ISO por projeto; passou da meta (média das 4 semanas anteriores) →
//                    evento "Sprint Fechada" (XP ×1,25 por 1 h) pelo EventSystem.
//   A3 Conquistas  — tarefas fechadas por quem um admin vinculou (/vincular) somam na métrica `work_tasks`.
//   A4 "Na obra"   — até 10 tarefas abertas da Ferrovia e da Oficina, título filtrado (shared/workFilter.ts).
//   Vínculo self-service — o jogador cola o token pessoal dele na aba "Na obra"; o servidor confere quem é (GET /user)
//                    e se é do workspace (GET /team) e da casa (e-mail @embeddo.io), grava só o id do usuário e DESCARTA
//                    o token na hora (nunca vai para kv, banco, log, erro ou mensagem).
// Rede NUNCA no tick: `maybePoll` (timer do WorldRoom) dispara a leitura assíncrona; o resultado vai para uma fila que o
// `tick` consome dentro do runSafe (anúncios, chão, kv, eventos, créditos — tudo síncrono). Sem token = desligado e
// calado. Erro/429 = tenta de novo com espera dobrando até 30 min. O que já foi anunciado/creditado fica no kv
// (`clickup.*`) para não repetir depois de reinício.
import {
  WORK_BOARD_SPACES, WORK_DELIVERED_STATUS, WORK_ITEM_MAX, WORK_PROJECTS, WORK_PURCHASES_LIST, WORK_SPRINT_SPACES, WORK_TEAM_ID,
  WORK_NICKS, filterWorkText, isBlockedWorkText, weekId, workAssigneeNick, workProjectOfSpace,
  type ActiveEvent, type WorkMsg, type WorkSprintBar, type WorkTaskRow,
} from "@lemonquest/shared";
import { ClickUpHttpError, httpClickUp, httpClickUpAuth, type ClickUpApi, type ClickUpAuthApi, type CuTask } from "./clickupClient.ts";

type Env = Record<string, string | undefined>;

export const CLICKUP_POLL_MIN_DEFAULT = 5;
/** Espera máxima entre tentativas depois de erro. */
export const CLICKUP_MAX_BACKOFF_MS = 30 * 60_000;
/** Caixas do "Chegou!" por hora (o resto vira só anúncio). */
export const CHEGOU_BOXES_PER_HOUR = 3;
/** Anúncios do "Chegou!" por leitura (o resto vira "e mais N"). */
export const CHEGOU_MAX_ANNOUNCE = 5;
/** Tarefas na aba "Na obra". */
export const WORK_BOARD_MAX = 10;
export const SPRINT_EVENT_ID = "sprint_fechada";
export const SPRINT_EVENT_MS = 60 * 60_000;
export const SPRINT_EVENT_XP = 1.25;
/** Semanas de histórico para a meta. */
const GOAL_WEEKS = 4;
const WEEK_MS = 7 * 86_400_000;
const SEEN_CAP = 3000;
/** Entrega com data de conclusão mais velha que isto não é anunciada (voltou só por edição). */
const STALE_DELIVERY_MS = 2 * 86_400_000;
/** Páginas (100 tarefas cada) por busca: semente da lista de compras, histórico, semana corrente, leitura normal. */
const PAGES = { seed: 30, history: 40, week: 20, normal: 5 } as const;

/** Formato do token pessoal do ClickUp (conferido antes de qualquer chamada). */
export const CLICKUP_TOKEN_RE = /^pk_[A-Za-z0-9_]{10,100}$/;
/** Tentativas de vínculo por personagem na janela (depois: "tente mais tarde"). */
export const LINK_MAX_TRIES = 5;
export const LINK_WINDOW_MS = 10 * 60_000;
/** Domínio de e-mail de quem pode se vincular sozinho. */
export const LINK_EMAIL_DOMAIN = "@embeddo.io";
export const LINK_REFUSED = "Token inválido ou sem acesso ao workspace da Embeddo.";

const KV = {
  seen: "clickup.chegou.seen",
  boxes: "clickup.chegou.boxes",
  sprint: "clickup.sprint",
  links: "clickup.links",
  counted: "clickup.counted",
  lastOk: "clickup.lastOk",
} as const;

/** Loot da Caixa de Encomenda: o selo sempre, mais 1–2 sorteios leves (só itens que já existem). */
export const CHEGOU_LOOT: readonly { defId: string; min: number; max: number }[] = [
  { defId: "health_potion", min: 2, max: 3 },
  { defId: "mana_potion", min: 2, max: 3 },
  { defId: "cabo_roido", min: 1, max: 3 },
  { defId: "marmita_tampa_vermelha", min: 1, max: 1 },
  { defId: "cafe_oficina", min: 1, max: 2 },
];
export const CHEGOU_SEAL = "selo_chegou";

export interface ClickUpConfig { token: string; pollMs: number; teamId: string; purchasesList: string }

/** Configuração pelo ambiente. null = sem token (sistema desligado). */
export function clickupConfig(env: Env = process.env): ClickUpConfig | null {
  const token = env.LEMONQUEST_CLICKUP_TOKEN?.trim();
  if (!token) return null;
  const min = Number(env.LEMONQUEST_CLICKUP_POLL_MIN);
  const pollMin = Number.isFinite(min) && min >= 1 ? Math.min(60, min) : CLICKUP_POLL_MIN_DEFAULT;
  return {
    token, pollMs: Math.round(pollMin * 60_000),
    teamId: env.LEMONQUEST_CLICKUP_TEAM?.trim() || WORK_TEAM_ID,
    purchasesList: env.LEMONQUEST_CLICKUP_PURCHASES_LIST?.trim() || WORK_PURCHASES_LIST,
  };
}

export interface ClickUpHost {
  getKv(key: string): string | undefined;
  setKv(key: string, value: string): void;
  /** Linha no feed de todos. */
  feed(text: string): void;
  /** Solta a Caixa de Encomenda num ponto de entrega. Devolve o lugar com preposição ("na Estação…"), ou null se nada coube no chão. */
  dropBox(items: { defId: string; count: number }[]): string | null;
  /** Liga a Sprint Fechada como bônus que SOMA ao evento em andamento (EventSystem.startBonus). */
  startEvent(ev: ActiveEvent): boolean;
  /** Credita `n` tarefas ao personagem (online: conquista na hora; offline: no registro). false = não existe. */
  credit(charName: string, n: number): boolean;
  /** Resposta do vínculo self-service para a sessão que pediu (aviso + quadro atualizado). */
  linkResult?(sessionId: string, ok: boolean, text: string): void;
  now?(): number;
  random?(): number;
  log?(line: string): void;
}

/** Vínculo personagem ↔ usuário do ClickUp (feito por admin): conta só o que foi fechado depois de `since`. */
export interface WorkLink { name: string; since: number }
interface SprintState { week: string; goals: Record<string, number>; fired: boolean }

/** Resultado de uma verificação de vínculo self-service (sem o token). */
interface LinkResult { sid: string; charName: string; userId: string | null; error?: string }

/** Resultado de uma leitura (montado fora do tick, aplicado dentro dele). */
interface PollResult {
  at: number;
  purchases: { seed: boolean; tasks: CuTask[] };
  history?: { week: string; tasks: CuTask[] };
  week: { id: string; tasks: CuTask[] };
  open: CuTask[];
}

// --- funções puras --------------------------------------------------------------------------------------------------

/** Item de um título de compra no formato "[Item] - Projeto/ data" (sem colchetes: o que vem antes do " - "). */
export function parsePurchaseItem(title: string): string {
  const t = (title ?? "").trim();
  const m = /^\[([^\]]+)\]/.exec(t);
  if (m) return m[1]!.trim();
  return t.split(/\s+-\s+/)[0]!.trim();
}

/** Segunda-feira 00:00 (horário local) da semana de `ms`. */
export function weekStartMs(ms: number): number {
  const d = new Date(ms);
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  t.setDate(t.getDate() - ((t.getDay() + 6) % 7));
  return t.getTime();
}

const num = (v: string | null | undefined): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const doneAt = (t: CuTask): number => num(t.date_done) || num(t.date_closed);

/** Tarefas fechadas por projeto (sem a Oficina, que não tem barra). */
export function countByProject(tasks: readonly CuTask[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of tasks) {
    const p = workProjectOfSpace(t.space?.id);
    if (!p || p.office) continue;
    out[p.id] = (out[p.id] ?? 0) + 1;
  }
  return out;
}

/** Meta por projeto = média (arredondada) das `weeks` semanas antes de `weekStart`. */
export function sprintGoals(tasks: readonly CuTask[], weekStart: number, weeks = GOAL_WEEKS): Record<string, number> {
  const sum: Record<string, number> = {};
  for (const t of tasks) {
    const at = doneAt(t);
    if (!(at >= weekStart - weeks * WEEK_MS && at < weekStart)) continue;
    const p = workProjectOfSpace(t.space?.id);
    if (!p || p.office) continue;
    sum[p.id] = (sum[p.id] ?? 0) + 1;
  }
  const out: Record<string, number> = {};
  for (const [id, n] of Object.entries(sum)) { const g = Math.round(n / weeks); if (g > 0) out[id] = g; }
  return out;
}

/** Estado do vínculo para o cliente: apelido da equipe ou "usuário <id>"; null = sem vínculo. */
function linkInfo(uid: string | undefined): { nick: string } | null {
  return uid ? { nick: WORK_NICKS[uid] ?? `usuário ${uid}` } : null;
}

function parseJson<T>(raw: string | undefined, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

// --- sistema --------------------------------------------------------------------------------------------------------

export class ClickUpSystem {
  private readonly now: () => number;
  private readonly rand: () => number;
  private readonly log: (line: string) => void;
  private readonly queue: PollResult[] = [];
  private readonly linkQueue: LinkResult[] = [];
  /** Tentativas de vínculo por personagem (memória: reiniciar zera, e tudo bem). */
  private readonly linkTries = new Map<string, number[]>();
  /** Personagens com verificação em andamento (uma por vez). */
  private readonly linking = new Set<string>();
  private busy = false;
  private nextPollAt = 0;
  private failures = 0;
  private seen: string[] | null;
  private boxes: number[];
  private sprint: SprintState | null;
  private links: Record<string, WorkLink>;
  private counted: Record<string, string>;
  private lastOk: number;
  private weekCounts: Record<string, number> = {};
  private weekId = "";
  private tasks: WorkTaskRow[] = [];
  private nextFireCheck = 0;

  constructor(
    private readonly host: ClickUpHost, private readonly api: ClickUpApi | null, private readonly cfg: Omit<ClickUpConfig, "token"> | null,
    private readonly auth: ClickUpAuthApi | null = null,
  ) {
    this.now = host.now ?? Date.now;
    this.rand = host.random ?? Math.random;
    this.log = host.log ?? ((l) => console.log(l));
    const seen = parseJson<unknown>(host.getKv(KV.seen), null);
    this.seen = Array.isArray(seen) ? seen.filter((x): x is string => typeof x === "string") : null;
    this.boxes = parseJson<number[]>(host.getKv(KV.boxes), []).filter((x) => typeof x === "number");
    const sp = parseJson<SprintState | null>(host.getKv(KV.sprint), null);
    this.sprint = sp && typeof sp.week === "string" && sp.goals && typeof sp.goals === "object" ? { week: sp.week, goals: sp.goals, fired: !!sp.fired } : null;
    this.links = parseJson<Record<string, WorkLink>>(host.getKv(KV.links), {});
    this.counted = parseJson<Record<string, string>>(host.getKv(KV.counted), {});
    this.lastOk = num(host.getKv(KV.lastOk));
    this.weekId = weekId(new Date(this.now()));
  }

  /** Sistema ligado pelo ambiente (token presente). */
  static fromEnv(host: ClickUpHost, env: Env = process.env): ClickUpSystem {
    const cfg = clickupConfig(env);
    // O vínculo self-service usa o token do jogador: funciona mesmo sem o token do servidor.
    return new ClickUpSystem(host, cfg ? httpClickUp(cfg.token) : null, cfg, httpClickUpAuth());
  }

  get enabled(): boolean { return !!this.api && !!this.cfg; }

  // --- leitura (fora do tick) ---------------------------------------------------------------------------------------

  /** Chamado por um timer (não pelo tick): dispara a leitura se estiver na hora. */
  maybePoll(now = this.now()): void {
    if (!this.enabled || this.busy || now < this.nextPollAt) return;
    void this.poll(now);
  }

  /** Lê o ClickUp e enfileira o resultado. Nunca lança (erro = espera crescente). */
  async poll(now = this.now()): Promise<void> {
    const api = this.api, cfg = this.cfg;
    if (!api || !cfg || this.busy) return;
    this.busy = true;
    try {
      const wStart = weekStartMs(now);
      const wId = weekId(new Date(now));
      const seed = this.seen === null;
      // Compras: a primeira leitura só marca o que já estava entregue (nada de anunciar o passado).
      const since = Math.max(this.lastOk - 15 * 60_000, now - 7 * 86_400_000);
      const purchases = await this.pages((page) => api.listTasks(cfg.purchasesList, {
        statuses: [WORK_DELIVERED_STATUS], include_closed: true, subtasks: true, page,
        ...(seed ? {} : { date_updated_gt: since }),
      }), seed ? PAGES.seed : PAGES.normal);
      let history: PollResult["history"];
      if (this.sprint?.week !== wId) {
        const tasks = await this.pages((page) => api.teamTasks(cfg.teamId, {
          space_ids: WORK_SPRINT_SPACES, include_closed: true, subtasks: true, page,
          date_done_gt: wStart - GOAL_WEEKS * WEEK_MS, date_done_lt: wStart,
        }), PAGES.history);
        history = { week: wId, tasks };
      }
      const week = await this.pages((page) => api.teamTasks(cfg.teamId, {
        space_ids: [...WORK_SPRINT_SPACES, ...WORK_PROJECTS.filter((p) => p.office).flatMap((p) => p.spaces)],
        include_closed: true, subtasks: true, page, date_done_gt: wStart,
      }), PAGES.week);
      const open = await this.pages((page) => api.teamTasks(cfg.teamId, {
        space_ids: WORK_BOARD_SPACES, subtasks: true, order_by: "updated", page,
      }), 1);
      this.queue.push({ at: now, purchases: { seed, tasks: purchases }, ...(history ? { history } : {}), week: { id: wId, tasks: week }, open });
      if (this.failures > 0) this.log(`[clickup] leitura voltou ao normal depois de ${this.failures} falha(s)`);
      this.failures = 0;
      this.nextPollAt = now + cfg.pollMs;
    } catch (e) {
      this.failures++;
      const retry = e instanceof ClickUpHttpError ? e.retryAfterMs ?? 0 : 0;
      const wait = Math.min(CLICKUP_MAX_BACKOFF_MS, Math.max(retry, cfg.pollMs * 2 ** (this.failures - 1)));
      this.nextPollAt = now + wait;
      // Um log na primeira falha e depois só quando a espera chega no teto (o 401 de token errado não enche o console).
      if (this.failures === 1 || wait === CLICKUP_MAX_BACKOFF_MS && this.failures % 4 === 0) {
        this.log(`[clickup] leitura falhou (${e instanceof Error ? e.message : String(e)}); nova tentativa em ${Math.round(wait / 60_000)} min`);
      }
    } finally {
      this.busy = false;
    }
  }

  private async pages(fetchPage: (page: number) => Promise<{ tasks: CuTask[]; last_page?: boolean }>, max: number): Promise<CuTask[]> {
    const out: CuTask[] = [];
    for (let page = 0; page < max; page++) {
      const r = await fetchPage(page);
      out.push(...r.tasks);
      if (r.last_page === true || r.tasks.length < 100) break;
    }
    return out;
  }

  // --- aplicação (dentro do tick) -------------------------------------------------------------------------------------

  /** Consome as leituras prontas e confere se a Sprint Fechada pode começar. Barato quando não há nada. */
  tick(now = this.now()): void {
    while (this.queue.length) this.apply(this.queue.shift()!, now);
    while (this.linkQueue.length) this.applyLink(this.linkQueue.shift()!, now);
    if (now >= this.nextFireCheck) {
      this.nextFireCheck = now + 1000;
      this.maybeFire(now);
    }
  }

  private apply(r: PollResult, now: number): void {
    this.applyPurchases(r.purchases, now);
    if (r.history) {
      this.sprint = { week: r.history.week, goals: sprintGoals(r.history.tasks, weekStartMs(r.at)), fired: false };
      this.host.setKv(KV.sprint, JSON.stringify(this.sprint));
    }
    this.weekId = r.week.id;
    this.weekCounts = countByProject(r.week.tasks);
    this.applyCredits(r.week.id, r.week.tasks, r.at);
    this.tasks = this.boardRows(r.open);
    this.lastOk = r.at;
    this.host.setKv(KV.lastOk, String(r.at));
  }

  private applyPurchases(p: PollResult["purchases"], now: number): void {
    const seen = new Set(this.seen ?? []);
    const fresh: CuTask[] = [];
    for (const t of p.tasks) {
      if (!t?.id || seen.has(t.id)) continue;
      if ((t.status?.status ?? "").toLowerCase() !== WORK_DELIVERED_STATUS) continue;
      seen.add(t.id);
      fresh.push(t);
    }
    const list = [...(this.seen ?? []), ...fresh.map((t) => t.id)];
    this.seen = list.slice(-SEEN_CAP);
    this.host.setKv(KV.seen, JSON.stringify(this.seen));
    if (p.seed) return;
    this.boxes = this.boxes.filter((at) => now - at < 3_600_000);
    let announced = 0, skipped = 0;
    for (const t of fresh) {
      // Lista negra no título INTEIRO (o projeto e a data ficam fora do item: "[Câmera] - <cliente>/ 12-10").
      if (typeof t.name !== "string" || isBlockedWorkText(t.name)) continue;
      // Entrega antiga que só voltou por ter sido comentada/editada (o id já saiu do SEEN_CAP): não reanuncia.
      const closed = doneAt(t);
      if (closed > 0 && now - closed > STALE_DELIVERY_MS) continue;
      const item = filterWorkText(parsePurchaseItem(t.name), WORK_ITEM_MAX);
      if (!item) continue; // lista negra: nem o anúncio sai
      if (announced >= CHEGOU_MAX_ANNOUNCE) { skipped++; continue; }
      announced++;
      const where = this.boxes.length < CHEGOU_BOXES_PER_HOUR ? this.host.dropBox(this.rollBox()) : null;
      if (where) this.boxes.push(now);
      this.host.feed(`📦 Chegou! ${item}${where ? ` — tem Caixa de Encomenda ${where}.` : ""}`);
    }
    if (skipped) this.host.feed(`📦 …e mais ${skipped} encomenda${skipped > 1 ? "s" : ""} chegaram hoje.`);
    this.host.setKv(KV.boxes, JSON.stringify(this.boxes));
  }

  /** Conteúdo de uma Caixa de Encomenda. */
  rollBox(): { defId: string; count: number }[] {
    const out = [{ defId: CHEGOU_SEAL, count: 1 }];
    const picks = 1 + Math.floor(this.rand() * 2);
    const pool = [...CHEGOU_LOOT];
    for (let i = 0; i < picks && pool.length; i++) {
      const e = pool.splice(Math.floor(this.rand() * pool.length), 1)[0]!;
      out.push({ defId: e.defId, count: e.min + Math.floor(this.rand() * (e.max - e.min + 1)) });
    }
    return out;
  }

  /** A3: cada tarefa fechada por um usuário vinculado conta 1 vez para o personagem (só as fechadas depois do vínculo). */
  private applyCredits(week: string, tasks: readonly CuTask[], at: number): void {
    const prev = weekId(new Date(weekStartMs(at) - 86_400_000));
    let changed = false;
    for (const [k, w] of Object.entries(this.counted)) if (w !== week && w !== prev) { delete this.counted[k]; changed = true; }
    const per = new Map<string, number>();
    for (const t of tasks) {
      if (!t?.id || !workProjectOfSpace(t.space?.id)) continue;
      const done = doneAt(t);
      for (const a of t.assignees ?? []) {
        const uid = String(a?.id ?? "");
        const link = this.links[uid];
        if (!link || !(done >= link.since)) continue;
        const key = `${t.id}:${uid}`;
        if (this.counted[key]) continue;
        this.counted[key] = week;
        changed = true;
        per.set(link.name, (per.get(link.name) ?? 0) + 1);
      }
    }
    for (const [name, n] of per) this.host.credit(name, n);
    if (changed) this.host.setKv(KV.counted, JSON.stringify(this.counted));
  }

  /** A4: tarefas abertas da Ferrovia e da Oficina, mais recentes primeiro, filtradas. */
  private boardRows(open: readonly CuTask[]): WorkTaskRow[] {
    const rows: WorkTaskRow[] = [];
    const sorted = [...open].sort((a, b) => num(b.date_updated) - num(a.date_updated));
    for (const t of sorted) {
      if (rows.length >= WORK_BOARD_MAX) break;
      if (t.status?.type === "closed" || t.status?.type === "done") continue;
      const p = workProjectOfSpace(t.space?.id);
      if (!p || !(p.rail || p.office)) continue;
      const title = filterWorkText(t.name);
      if (!title) continue;
      const nicks = (t.assignees ?? []).map((a) => workAssigneeNick(a));
      if (nicks.includes(null)) continue;
      rows.push({ title, who: (nicks[0] as string | undefined) ?? "ninguém ainda", project: p.name });
    }
    return rows;
  }

  private totals(): { done: number; goal: number } {
    let done = 0, goal = 0;
    for (const n of Object.values(this.weekCounts)) done += n;
    if (this.sprint?.week === this.weekId) for (const n of Object.values(this.sprint.goals)) goal += n;
    return { done, goal };
  }

  /** A2: a semana alcançou a meta somada → Sprint Fechada (uma vez por semana; soma a qualquer evento em andamento). */
  private maybeFire(now: number): void {
    const sp = this.sprint;
    if (!sp || sp.fired || sp.week !== this.weekId || sp.week !== weekId(new Date(now))) return;
    const { done, goal } = this.totals();
    if (goal <= 0 || done < goal) return;
    const ok = this.host.startEvent({
      id: SPRINT_EVENT_ID, name: "Sprint Fechada", desc: `A equipe fechou ${done} tarefas na semana (meta ${goal}): XP ×1,25`,
      xpMult: SPRINT_EVENT_XP, lootMult: 1, until: now + SPRINT_EVENT_MS,
    });
    if (!ok) return;
    sp.fired = true;
    this.host.setKv(KV.sprint, JSON.stringify(sp));
  }

  // --- vínculos (/vincular) -------------------------------------------------------------------------------------------

  /**
   * Vincula (ou, com userId null, desvincula) o personagem. Um personagem tem no máximo um usuário e um usuário conta para
   * um personagem só. Devolve o nome do personagem que perdeu o usuário (undefined = ninguém).
   */
  link(charName: string, userId: string | null, now = this.now()): string | undefined {
    const same = (a: string) => a.toLowerCase() === charName.toLowerCase();
    for (const [uid, l] of Object.entries(this.links)) if (same(l.name)) delete this.links[uid];
    const before = userId ? this.links[userId]?.name : undefined;
    if (userId) this.links[userId] = { name: charName, since: now };
    this.host.setKv(KV.links, JSON.stringify(this.links));
    return before && !same(before) ? before : undefined;
  }

  linkedTo(userId: string): WorkLink | undefined { return this.links[userId]; }
  /** Usuário do ClickUp vinculado ao personagem (undefined = nenhum). */
  linkOf(charName: string): string | undefined {
    return Object.entries(this.links).find(([, l]) => l.name.toLowerCase() === charName.toLowerCase())?.[0];
  }

  // --- vínculo self-service (o próprio jogador, com o token pessoal dele) ----------------------------------------------

  /**
   * C2S.WorkLink. Confere o formato e o limite de tentativas na hora; a verificação no ClickUp roda fora do tick e o
   * resultado (sem o token) entra na fila. O token só vive nesta chamada e na verificação assíncrona.
   */
  requestLink(sid: string, charName: string, raw: unknown, now = this.now()): void {
    let token = typeof raw === "string" ? raw.trim() : "";
    const reply = (ok: boolean, text: string) => this.host.linkResult?.(sid, ok, text);
    if (!this.auth) { token = ""; reply(false, "Vínculo com o ClickUp indisponível neste servidor."); return; }
    if (this.linking.has(charName)) { token = ""; reply(false, "Já estou conferindo um token seu. Aguarde."); return; }
    const key = charName.toLowerCase();
    const tries = (this.linkTries.get(key) ?? []).filter((at) => now - at < LINK_WINDOW_MS);
    if (tries.length >= LINK_MAX_TRIES) { token = ""; this.linkTries.set(key, tries); reply(false, "Muitas tentativas. Tente mais tarde."); return; }
    tries.push(now);
    this.linkTries.set(key, tries);
    if (!CLICKUP_TOKEN_RE.test(token)) { token = ""; reply(false, LINK_REFUSED); return; }
    this.linking.add(charName);
    void this.verify(sid, charName, token).finally(() => this.linking.delete(charName));
    token = "";
  }

  /** Quem é o dono do token e se é da casa. Nunca lança; nunca devolve nem loga o token. */
  private async verify(sid: string, charName: string, token: string): Promise<void> {
    const team = this.cfg?.teamId ?? WORK_TEAM_ID;
    let result: LinkResult;
    try {
      const me = await this.auth!.me(token);
      const teams = await this.auth!.teams(token);
      const ok = teams.includes(team) && me.email.trim().toLowerCase().endsWith(LINK_EMAIL_DOMAIN) && /^\d{1,12}$/.test(me.id);
      result = ok ? { sid, charName, userId: me.id } : { sid, charName, userId: null, error: LINK_REFUSED };
    } catch (e) {
      const http = e instanceof ClickUpHttpError && e.status >= 400 && e.status < 500 && e.status !== 429;
      result = { sid, charName, userId: null, error: http ? LINK_REFUSED : "Não consegui falar com o ClickUp agora. Tente de novo em alguns minutos." };
    } finally {
      token = "";
    }
    this.linkQueue.push(result);
  }

  private applyLink(r: LinkResult, now: number): void {
    if (!r.userId) { this.host.linkResult?.(r.sid, false, r.error ?? LINK_REFUSED); return; }
    const before = this.link(r.charName, r.userId, now);
    this.log(`[clickup] ${r.charName} vinculou o próprio ClickUp (usuário ${r.userId})${before ? `; saiu de ${before}` : ""}`);
    const nick = WORK_NICKS[r.userId] ?? `usuário ${r.userId}`;
    const off = this.enabled ? "" : " As tarefas contam quando o ClickUp do servidor estiver ligado.";
    const moved = before ? ` (o vínculo saiu de ${before})` : "";
    this.host.linkResult?.(r.sid, true, `ClickUp vinculado como ${nick}${moved}: tarefas fechadas a partir de agora contam nas conquistas.${off} Se quiser, gere outro token no ClickUp: o jogo não guardou o seu.`);
  }

  /** C2S.WorkUnlink. */
  unlink(sid: string, charName: string): void {
    const had = !!this.linkOf(charName);
    this.link(charName, null);
    this.host.linkResult?.(sid, had, had ? "ClickUp desvinculado." : "Você não tinha ClickUp vinculado.");
  }
  linkList(): [string, WorkLink][] { return Object.entries(this.links); }

  // --- para o cliente -----------------------------------------------------------------------------------------------

  /** Quadro da obra para um NPC com workBoard (`charName` = quem vê: estado do vínculo dele). */
  workMsg(npcId: string, charName?: string): WorkMsg {
    const sprints: WorkSprintBar[] = [];
    const goals = this.sprint?.week === this.weekId ? this.sprint.goals : {};
    for (const p of WORK_PROJECTS) {
      if (p.office) continue;
      const done = this.weekCounts[p.id] ?? 0, goal = goals[p.id] ?? 0;
      if (done > 0 || goal > 0) sprints.push({ id: p.id, name: p.name, done, goal });
    }
    sprints.sort((a, b) => b.done - a.done || b.goal - a.goal);
    const t = this.totals();
    return {
      npcId, online: this.enabled && this.lastOk > 0, week: this.weekId, sprints,
      total: { ...t, fired: !!(this.sprint?.fired && this.sprint.week === this.weekId) }, tasks: this.tasks, updatedAt: this.lastOk,
      polling: this.enabled, canLink: !!this.auth, link: linkInfo(charName ? this.linkOf(charName) : undefined),
    };
  }

  /** Linhas do /status (admin). */
  statusLine(): string {
    if (!this.enabled) return "ClickUp: desligado (sem LEMONQUEST_CLICKUP_TOKEN).";
    const t = this.totals();
    const ago = this.lastOk ? `${Math.round((this.now() - this.lastOk) / 60_000)} min atrás` : "nunca";
    return `ClickUp: última leitura ${ago}${this.failures ? ` (${this.failures} falha(s) seguidas)` : ""} · semana ${t.done}/${t.goal} · ${Object.keys(this.links).length} vínculo(s).`;
  }
}

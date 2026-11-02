// Métricas e logs do servidor (spec 2026-11-01): amostra a cada 30 s (anel de 24 h na memória), relatórios dos clientes
// (C2S.ClientPerf), linhas [metrica] limitadas e os arquivos JSONL (persistence/metricsFiles.ts). Nada vai para o banco.
// Relógio e leitores do processo são injetáveis: os testes não dormem. Nada aqui pode lançar para dentro do tick.
import { CLIENT_PERF_MIN_INTERVAL_MS, sanitizeClientPerf, type ClientPerfMsg } from "@lemonquest/shared";
import type { MetricsFiles } from "../persistence/metricsFiles.ts";
import { clienteLines, metricasLines } from "./metricsFormat.ts";

/** Intervalo das amostras do servidor. */
export const METRICS_SAMPLE_MS = 30_000;
/** Anel: 24 h de amostras de 30 s. */
export const METRICS_RING = 2880;
/** Histórico curto por cliente (60 relatórios ≈ 1 h). */
export const CLIENT_HISTORY = 60;
/** Linha [metrica] do mesmo tipo+chave: no máximo 1 por minuto (as demais são contadas em "suprimidos"). */
export const EVENTO_THROTTLE_MS = 60_000;
/** Linha "resumo" no log a cada 30 min (histórico no docker logs, além dos arquivos). */
export const RESUMO_MS = 30 * 60_000;
/** Limites dos eventos. */
export const TICK_LENTO_MS = 200;
export const CLIENTE_HEAP_MB = 700;
export const CLIENTE_TEX_MB = 400;
export const CLIENTE_FPS_MIN = 15;
export const SERVIDOR_RSS_MB = 1536;

export type EventoTipo = "tick_lento" | "cliente_pesado" | "servidor_memoria" | "erro_sistema" | "resumo";

/** Uma amostra do servidor (também é a linha de servidor-AAAA-MM-DD.jsonl). */
export interface ServerSample {
  t: number;
  rssMb: number;
  heapMb: number;
  /** CPU do processo no intervalo (user+system), em % de um núcleo. */
  cpuPct: number;
  tickMedMs: number;
  tickMaxMs: number;
  tickP95Ms: number;
  online: number;
  monstros: number;
  chao: number;
  /** Estagiários com rota rodando (p.bot). */
  bots: number;
  /** Mensagens dos clientes por segundo no intervalo. */
  msgsS: number;
  /** Autosave no intervalo (ausente = não houve). */
  saveMedMs?: number;
  saveMaxMs?: number;
}

/** Um relatório de cliente aceito (também é a linha de clientes-AAAA-MM-DD.jsonl). */
export type ClientRow = { t: number; nome: string } & ClientPerfMsg;

export interface WorldCounts { online: number; monstros: number; chao: number; bots: number }

export interface MetricsDeps {
  world: () => WorldCounts;
  now?: () => number;
  memory?: () => { rss: number; heapUsed: number };
  /** process.cpuUsage(): microssegundos acumulados. */
  cpu?: () => { user: number; system: number };
  files?: MetricsFiles | null;
  out?: (line: string) => void;
}

const MB = 1048576;
const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Percentil 95 (o valor abaixo do qual ficam 95% das amostras). 0 sem amostras. */
export function p95(values: readonly number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.max(0, Math.ceil(s.length * 0.95) - 1)]!;
}

interface ClientEntry { nome: string; lastAt: number; hist: ClientRow[] }

export class MetricsSystem {
  /** Anel das amostras (a mais nova no fim). */
  readonly ring: ServerSample[] = [];
  private readonly now: () => number;
  private readonly memory: () => { rss: number; heapUsed: number };
  private readonly cpu: () => { user: number; system: number };
  private readonly out: (line: string) => void;
  private readonly files: MetricsFiles | null;
  private ticks: number[] = [];
  private msgs = 0;
  private saves = { n: 0, sum: 0, max: 0 };
  private lastSampleAt: number;
  private lastCpu: { user: number; system: number };
  private lastResumoAt: number;
  private pruneDay = "";
  private readonly clients = new Map<string, ClientEntry>();
  private readonly throttle = new Map<string, { at: number; suprimidos: number }>();

  constructor(private readonly deps: MetricsDeps) {
    this.now = deps.now ?? Date.now;
    this.memory = deps.memory ?? (() => process.memoryUsage());
    this.cpu = deps.cpu ?? (() => process.cpuUsage());
    this.out = deps.out ?? ((l) => console.log(l));
    this.files = deps.files ?? null;
    const t = this.now();
    this.lastSampleAt = t;
    this.lastResumoAt = t;
    this.lastCpu = this.cpu();
  }

  /** Duração de um tick (chamado pelo WorldRoom a cada tick). */
  onTick(ms: number): void {
    // Teto de ~1 min de ticks no intervalo: com o tick travado o intervalo não fecha e a lista não pode crescer sem fim.
    if (this.ticks.length < 1200) this.ticks.push(ms);
    // Complementa o [tick] do WorldRoom (resumo periódico; em produção só quando passa de 30 ms): aqui é o tick isolado
    // acima de 200 ms, com no máximo 1 linha por minuto — não repete o [tick] nem enche o log.
    if (ms > TICK_LENTO_MS) {
      const w = this.deps.world();
      this.logEvento("tick_lento", "", { ms: r1(ms), online: w.online, monstros: w.monstros });
    }
  }

  onMessage(): void { this.msgs++; }

  onAutosave(ms: number): void {
    const s = this.saves;
    s.n++; s.sum += ms; if (ms > s.max) s.max = ms;
  }

  /** Erro isolado pelo runSafe (a mensagem já foi logada pelo ErrorLog): só o tipo do passo. */
  erro(key: string): void {
    this.logEvento("erro_sistema", key, { passo: key });
  }

  /** Passo do tick: amostra a cada 30 s, resumo a cada 30 min, limpeza dos arquivos 1×/dia, flush a cada 5 s. */
  step(now = this.now()): void {
    if (now - this.lastSampleAt >= METRICS_SAMPLE_MS) this.sample(now);
    if (now - this.lastResumoAt >= RESUMO_MS && this.ring.length) {
      this.lastResumoAt = now;
      const { t: _t, ...s } = this.ring[this.ring.length - 1]!;
      this.logEvento("resumo", "", s);
    }
    if (this.files) {
      const day = new Date(now).toDateString();
      if (day !== this.pruneDay) { this.pruneDay = day; void this.files.prune(now); }
      this.files.maybeFlush(now);
    }
  }

  /** Fecha o intervalo: amostra, guarda no anel, grava no arquivo e confere a memória. */
  sample(now = this.now()): ServerSample {
    const s = this.snapshot(now);
    this.ring.push(s);
    if (this.ring.length > METRICS_RING) this.ring.shift();
    this.ticks = [];
    this.msgs = 0;
    this.saves = { n: 0, sum: 0, max: 0 };
    this.lastSampleAt = now;
    this.lastCpu = this.cpu();
    this.files?.write("servidor", { ...s });
    if (s.rssMb > SERVIDOR_RSS_MB) this.logEvento("servidor_memoria", "", { rssMb: s.rssMb, heapMb: s.heapMb, online: s.online });
    return s;
  }

  /** Números do intervalo em andamento, sem fechá-lo (o "agora" do /metricas). */
  snapshot(now = this.now()): ServerSample {
    const mem = this.memory();
    const cpu = this.cpu();
    const dt = Math.max(1, now - this.lastSampleAt);
    const cpuMs = (cpu.user - this.lastCpu.user + cpu.system - this.lastCpu.system) / 1000;
    let sum = 0, max = 0;
    for (const v of this.ticks) { sum += v; if (v > max) max = v; }
    const w = this.deps.world();
    const sv = this.saves;
    return {
      t: now,
      rssMb: Math.round(mem.rss / MB), heapMb: Math.round(mem.heapUsed / MB),
      cpuPct: r1(Math.max(0, (cpuMs / dt) * 100)),
      tickMedMs: r2(this.ticks.length ? sum / this.ticks.length : 0), tickMaxMs: r1(max), tickP95Ms: r2(p95(this.ticks)),
      online: w.online, monstros: w.monstros, chao: w.chao, bots: w.bots,
      msgsS: r1(this.msgs / (dt / 1000)),
      ...(sv.n ? { saveMedMs: r1(sv.sum / sv.n), saveMaxMs: r1(sv.max) } : {}),
    };
  }

  /** Relatório do cliente: "ok", "invalido" (descartado) ou "cedo" (menos de 20 s do anterior; descartado em silêncio). */
  clientReport(sid: string, nome: string, raw: unknown): "ok" | "invalido" | "cedo" {
    const m = sanitizeClientPerf(raw);
    if (!m) return "invalido";
    const now = this.now();
    let e = this.clients.get(sid);
    if (e && now - e.lastAt < CLIENT_PERF_MIN_INTERVAL_MS) return "cedo";
    if (!e) this.clients.set(sid, (e = { nome, lastAt: 0, hist: [] }));
    e.nome = nome;
    e.lastAt = now;
    const row: ClientRow = { t: now, nome, ...m };
    e.hist.push(row);
    if (e.hist.length > CLIENT_HISTORY) e.hist.shift();
    this.files?.write("clientes", { ...row });
    if ((m.heapMb ?? 0) > CLIENTE_HEAP_MB || m.texMb > CLIENTE_TEX_MB || m.fpsMin < CLIENTE_FPS_MIN) {
      const { t: _t, ...campos } = row;
      this.logEvento("cliente_pesado", nome, campos);
    }
    return "ok";
  }

  /** Saiu do mundo: o histórico curto vai junto (os arquivos guardam tudo). */
  removePlayer(sid: string): void { this.clients.delete(sid); }

  /** Último relatório de cada cliente online. */
  clientRows(): ClientRow[] {
    return [...this.clients.values()].map((e) => e.hist[e.hist.length - 1]).filter((r): r is ClientRow => !!r);
  }

  /** Linhas do /metricas (sem nome) ou do /metricas <nome>. */
  lines(nome?: string): string[] {
    const now = this.now();
    if (nome?.trim()) {
      const key = nome.trim().toLowerCase();
      const e = [...this.clients.values()].find((c) => c.nome.toLowerCase() === key);
      return clienteLines(e?.nome ?? nome.trim(), e?.hist ?? []);
    }
    const hora = this.ring.filter((s) => now - s.t <= 3600_000);
    return metricasLines(this.snapshot(now), hora, this.clientRows());
  }

  /**
   * Linha `[metrica] {"tipo":…}` no stdout (fácil de filtrar no docker logs) e em eventos-AAAA-MM-DD.jsonl. No máximo
   * 1 por minuto por tipo+chave; as suprimidas aparecem como "suprimidos" na próxima. true = saiu.
   */
  logEvento(tipo: EventoTipo, chave: string, campos: Record<string, unknown>): boolean {
    const now = this.now();
    const k = `${tipo}:${chave}`;
    const th = this.throttle.get(k);
    if (th && now - th.at < EVENTO_THROTTLE_MS) { th.suprimidos++; return false; }
    const linha: Record<string, unknown> = { tipo, ...campos, ...(th?.suprimidos ? { suprimidos: th.suprimidos } : {}) };
    this.throttle.set(k, { at: now, suprimidos: 0 });
    this.out(`[metrica] ${JSON.stringify(linha)}`);
    this.files?.write("eventos", { t: now, ...linha });
    return true;
  }

  /** Desligamento: grava o buffer dos arquivos na hora. */
  flushSync(): void { this.files?.flushSync(); }
}

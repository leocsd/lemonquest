// Arquivos de métricas (JSON Lines): o dono quer "só arquivos para monitorar depois" — nada vai para o banco.
//   <dir>/servidor-AAAA-MM-DD.jsonl  amostra do servidor a cada 30 s
//   <dir>/clientes-AAAA-MM-DD.jsonl  cada relatório de cliente aceito (nome, app, números)
//   <dir>/eventos-AAAA-MM-DD.jsonl   cada linha [metrica] (tick_lento, cliente_pesado, servidor_memoria, erro_sistema, resumo)
// Pasta: LEMONQUEST_METRICS_DIR ou `metricas/` ao lado do banco em uso (o servidor de teste, com banco temporário, grava
// no temporário dele; banco em memória = sem arquivos). Dia pela data LOCAL do servidor. Arquivos com mais de
// METRICS_RETENTION_DAYS dias são apagados (na subida e 1×/dia).
import fs from "node:fs";
import path from "node:path";

export const METRICS_KINDS = ["servidor", "clientes", "eventos"] as const;
export type MetricsKind = (typeof METRICS_KINDS)[number];
/** Quantos dias de arquivos ficam na pasta (o mais antigo é apagado na virada). */
export const METRICS_RETENTION_DAYS = 30;
/** As linhas ficam no buffer e vão para o disco juntas, no máximo a cada 5 s (gravação assíncrona, fora do tick). */
export const METRICS_FLUSH_MS = 5_000;
/** Buffer máximo por arquivo: disco travado não pode crescer a memória sem limite (o excesso é descartado). */
export const METRICS_MAX_BUFFER = 5_000;

const FILE_RE = /^(servidor|clientes|eventos)-(\d{4})-(\d{2})-(\d{2})\.jsonl$/;

/** AAAA-MM-DD na data local. */
export function localDay(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const metricsFileName = (kind: MetricsKind, t: number): string => `${kind}-${localDay(t)}.jsonl`;

/** Pasta das métricas para a base `dbFile`. null = não gravar (banco em memória, testes). */
export function metricsDirFor(dbFile: string | null, env: Record<string, string | undefined> = process.env): string | null {
  if (env.LEMONQUEST_METRICS_DIR) return env.LEMONQUEST_METRICS_DIR;
  if (!dbFile || dbFile === ":memory:") return null;
  return path.join(path.dirname(dbFile), "metricas");
}

export interface MetricsFilesIO {
  appendFile: (file: string, data: string) => Promise<void>;
  mkdir: (dir: string) => Promise<unknown>;
  readdir: (dir: string) => Promise<string[]>;
  unlink: (file: string) => Promise<void>;
  appendFileSync: (file: string, data: string) => void;
  mkdirSync: (dir: string) => void;
}

const realIO: MetricsFilesIO = {
  appendFile: (f, d) => fs.promises.appendFile(f, d, "utf8"),
  mkdir: (d) => fs.promises.mkdir(d, { recursive: true }),
  readdir: (d) => fs.promises.readdir(d),
  unlink: (f) => fs.promises.unlink(f),
  appendFileSync: (f, d) => fs.appendFileSync(f, d, "utf8"),
  mkdirSync: (d) => { fs.mkdirSync(d, { recursive: true }); },
};

/** Escritor com buffer: `write` só enfileira; `flush` grava assíncrono. Erro de disco é logado uma vez e nunca lança. */
export class MetricsFiles {
  private buf = new Map<string, string[]>();
  private flushing: Promise<void> | null = null;
  private lastFlush = 0;
  private warned = false;
  private dirReady = false;
  dropped = 0;

  constructor(
    readonly dir: string,
    private readonly io: MetricsFilesIO = realIO,
    private readonly err: (msg: string) => void = (m) => console.error(m),
  ) {}

  /** Enfileira uma linha (o arquivo é escolhido pela data de `row.t`). */
  write(kind: MetricsKind, row: { t: number } & Record<string, unknown>): void {
    const file = metricsFileName(kind, row.t);
    let lines = this.buf.get(file);
    if (!lines) this.buf.set(file, (lines = []));
    if (lines.length >= METRICS_MAX_BUFFER) { this.dropped++; return; }
    lines.push(JSON.stringify(row) + "\n");
  }

  /** Linhas esperando o disco (testes). */
  pending(): number {
    let n = 0;
    for (const l of this.buf.values()) n += l.length;
    return n;
  }

  /** Chamado a cada tick: grava se passou METRICS_FLUSH_MS desde a última (e não há gravação em andamento). */
  maybeFlush(now: number): void {
    if (now - this.lastFlush < METRICS_FLUSH_MS) return;
    this.lastFlush = now;
    void this.flush();
  }

  /** Grava o buffer (assíncrono). Uma gravação por vez; o que chegar no meio vai na próxima. */
  flush(): Promise<void> {
    if (this.flushing || !this.buf.size) return this.flushing ?? Promise.resolve();
    const batch = this.buf;
    this.buf = new Map();
    this.flushing = (async () => {
      try {
        if (!this.dirReady) { await this.io.mkdir(this.dir); this.dirReady = true; }
        for (const [file, lines] of batch) await this.io.appendFile(path.join(this.dir, file), lines.join(""));
      } catch (e) {
        this.fail(e);
      } finally {
        this.flushing = null;
      }
    })();
    return this.flushing;
  }

  /** Desligamento: grava o que sobrou de forma síncrona (o processo vai sair logo depois). */
  flushSync(): void {
    if (!this.buf.size) return;
    const batch = this.buf;
    this.buf = new Map();
    try {
      this.io.mkdirSync(this.dir);
      for (const [file, lines] of batch) this.io.appendFileSync(path.join(this.dir, file), lines.join(""));
    } catch (e) {
      this.fail(e);
    }
  }

  /** Apaga os arquivos com mais de METRICS_RETENTION_DAYS dias. Devolve quantos apagou; nunca lança. */
  async prune(now: number): Promise<number> {
    const limit = localDay(now - METRICS_RETENTION_DAYS * 86_400_000);
    let n = 0;
    try {
      for (const f of await this.io.readdir(this.dir)) {
        const m = FILE_RE.exec(f);
        if (!m || `${m[2]}-${m[3]}-${m[4]}` >= limit) continue;
        await this.io.unlink(path.join(this.dir, f));
        n++;
      }
    } catch (e) {
      if ((e as NodeJS.ErrnoException)?.code !== "ENOENT") this.fail(e); // pasta ainda não existe: nada a apagar
    }
    return n;
  }

  private fail(e: unknown): void {
    if (this.warned) return;
    this.warned = true;
    this.err(`[metrica] não consegui gravar em ${this.dir} (aviso único; as métricas seguem só na memória): ${(e as Error)?.message ?? e}`);
  }
}

/** Lê as linhas de um tipo nos últimos `days` dias (hoje incluído). Linha estragada é ignorada. Para a CLI. */
export function readMetricsRows(dir: string, kind: MetricsKind, days: number, now: number): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const file = path.join(dir, metricsFileName(kind, now - i * 86_400_000));
    let text: string;
    try { text = fs.readFileSync(file, "utf8"); } catch { continue; }
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      try {
        const o = JSON.parse(line) as unknown;
        if (o && typeof o === "object" && typeof (o as { t?: unknown }).t === "number") out.push(o as Record<string, unknown>);
      } catch { /* linha cortada (queda no meio da gravação) */ }
    }
  }
  return out;
}

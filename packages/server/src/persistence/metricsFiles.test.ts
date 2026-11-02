import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { METRICS_FLUSH_MS, METRICS_RETENTION_DAYS, MetricsFiles, localDay, metricsDirFor, readMetricsRows, type MetricsFilesIO } from "./metricsFiles.ts";
import { runAdminCli } from "./admincli.ts";

const T0 = new Date(2026, 10, 1, 10, 0, 0).getTime();
const DAY = 86_400_000;
const dirs: string[] = [];
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "lq-metricas-")); dirs.push(d); return d; };
afterEach(() => { while (dirs.length) fs.rmSync(dirs.pop()!, { recursive: true, force: true }); });

describe("metricsDirFor", () => {
  it("variável manda; senão metricas/ ao lado do banco; banco em memória = sem arquivos", () => {
    expect(metricsDirFor("/x/data/lq.db", { LEMONQUEST_METRICS_DIR: "/m" })).toBe("/m");
    expect(metricsDirFor(path.join("tmp", "e2e.db"), {})).toBe(path.join("tmp", "metricas"));
    expect(metricsDirFor(":memory:", {})).toBeNull();
    expect(metricsDirFor(null, {})).toBeNull();
  });
});

describe("MetricsFiles", () => {
  it("grava em JSONL por tipo e por dia local, em lote, e lê de volta", async () => {
    const dir = path.join(tmp(), "metricas"); // ainda não existe: o flush cria
    const f = new MetricsFiles(dir);
    f.write("servidor", { t: T0, rssMb: 1 });
    f.write("servidor", { t: T0 + 30_000, rssMb: 2 });
    f.write("clientes", { t: T0, nome: "Leo" });
    f.write("servidor", { t: T0 + DAY, rssMb: 3 });
    expect(fs.existsSync(dir)).toBe(false); // write só enfileira
    await f.flush();
    expect(f.pending()).toBe(0);
    const file = path.join(dir, `servidor-${localDay(T0)}.jsonl`);
    expect(fs.readFileSync(file, "utf8")).toBe('{"t":' + T0 + ',"rssMb":1}\n{"t":' + (T0 + 30_000) + ',"rssMb":2}\n');
    fs.appendFileSync(file, '{"t":1,"rss\n\n'); // linha cortada (queda no meio): ignorada na leitura
    expect(readMetricsRows(dir, "servidor", 2, T0 + DAY).map((r) => r.rssMb)).toEqual([1, 2, 3]);
    expect(readMetricsRows(dir, "servidor", 1, T0 + DAY).map((r) => r.rssMb)).toEqual([3]);
    expect(readMetricsRows(dir, "clientes", 7, T0)).toEqual([{ t: T0, nome: "Leo" }]);
    expect(readMetricsRows(path.join(dir, "nada"), "eventos", 7, T0)).toEqual([]);
  });

  it("maybeFlush só a cada 5 s; flushSync no desligamento", async () => {
    const dir = tmp();
    const f = new MetricsFiles(dir);
    f.write("eventos", { t: T0, tipo: "resumo" });
    f.maybeFlush(T0 + METRICS_FLUSH_MS);
    await f.flush(); // espera a gravação em andamento
    f.write("eventos", { t: T0, tipo: "tick_lento" });
    f.maybeFlush(T0 + METRICS_FLUSH_MS + 1000);
    expect(f.pending()).toBe(1);
    f.flushSync();
    expect(fs.readFileSync(path.join(dir, `eventos-${localDay(T0)}.jsonl`), "utf8").trim().split("\n")).toHaveLength(2);
  });

  it("erro de disco: avisa uma vez e nunca lança", async () => {
    const errs: string[] = [];
    const fail = () => { throw new Error("disco cheio"); };
    const io: MetricsFilesIO = {
      appendFile: async () => fail(), mkdir: async () => undefined, readdir: async () => fail(), unlink: async () => undefined,
      appendFileSync: fail, mkdirSync: () => {},
    };
    const f = new MetricsFiles("/x", io, (m) => errs.push(m));
    f.write("servidor", { t: T0 });
    await f.flush();
    f.write("servidor", { t: T0 });
    f.flushSync();
    await f.prune(T0);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatch(/disco cheio/);
  });

  it("apaga só os arquivos de métricas com mais de 30 dias", async () => {
    const dir = tmp();
    const old = T0 - (METRICS_RETENTION_DAYS + 1) * DAY, keep = T0 - METRICS_RETENTION_DAYS * DAY;
    for (const n of [`servidor-${localDay(old)}.jsonl`, `eventos-${localDay(old)}.jsonl`, `clientes-${localDay(keep)}.jsonl`, `servidor-${localDay(T0)}.jsonl`, "leia-me.txt"]) {
      fs.writeFileSync(path.join(dir, n), "");
    }
    expect(await new MetricsFiles(dir).prune(T0)).toBe(2);
    expect(fs.readdirSync(dir).sort()).toEqual([`clientes-${localDay(keep)}.jsonl`, "leia-me.txt", `servidor-${localDay(T0)}.jsonl`]);
    expect(await new MetricsFiles(path.join(dir, "nao-existe")).prune(T0)).toBe(0);
  });
});

describe("CLI: npm run admin -- metricas", () => {
  it("lê os arquivos ao lado da base (sem abrir o banco) e imprime o resumo de cada dia", async () => {
    const dir = tmp();
    const mdir = path.join(dir, "metricas");
    fs.mkdirSync(mdir);
    const now = Date.now();
    fs.writeFileSync(path.join(mdir, `servidor-${localDay(now)}.jsonl`), [100, 300].map((rss, i) => JSON.stringify({ t: now - i * 30_000, rssMb: rss, online: 2 })).join("\n") + "\n");
    fs.writeFileSync(path.join(mdir, `clientes-${localDay(now)}.jsonl`), JSON.stringify({ t: now, nome: "Leo", app: "web", heapMb: 320, texMb: 90, fpsMin: 33 }) + "\n");
    const out: string[] = [], err: string[] = [];
    const io = { out: (l: string) => out.push(l), err: (l: string) => err.push(l) };
    expect(await runAdminCli(["metricas"], io, path.join(dir, "lq.db"))).toBe(0);
    expect(fs.existsSync(path.join(dir, "lq.db"))).toBe(false);
    expect(out[0]).toBe(`Métricas em ${mdir} (últimos 7 dia(s)):`);
    expect(out).toContain("  RSS MB: mín 100 · méd 200 · máx 300");
    expect(out).toContain("  Leo (web, 1 relatórios): heap méd 320 / máx 320 MB · texturas méd 90 / máx 90 MB · fps mín 33");
    expect(await runAdminCli(["metricas", "0"], io, path.join(dir, "lq.db"))).toBe(1);
    expect(await runAdminCli(["metricas", "abc"], io, path.join(dir, "lq.db"))).toBe(1);
    out.length = 0;
    expect(await runAdminCli(["metricas", "3"], io, path.join(tmp(), "vazio.db"))).toBe(0);
    expect(out).toContain("Nenhuma métrica gravada nesse período.");
  });
});

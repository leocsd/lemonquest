import { describe, expect, it } from "vitest";
import {
  CLIENTE_HEAP_MB, CLIENT_HISTORY, EVENTO_THROTTLE_MS, METRICS_RING, METRICS_SAMPLE_MS, MetricsSystem, RESUMO_MS, SERVIDOR_RSS_MB,
  TICK_LENTO_MS, p95, type ClientRow, type ServerSample,
} from "./metrics.ts";
import { clienteLines, metricasLines, minAvgMax, resumoDiasLines } from "./metricsFormat.ts";
import { ErrorLog, runSafe } from "./safe.ts";
import type { MetricsFiles, MetricsKind } from "../persistence/metricsFiles.ts";

const MB = 1048576;
const T0 = new Date(2026, 10, 1, 10, 0, 0).getTime();

/** Sistema com relógio, memória e CPU falsos; `out` e `files` capturados. */
function kit(over: { rssMb?: number } = {}) {
  const clock = { t: T0 };
  const proc = { rss: (over.rssMb ?? 400) * MB, heap: 150 * MB, cpuUs: 0 };
  const out: string[] = [];
  const written: { kind: MetricsKind; row: Record<string, unknown> }[] = [];
  const files = {
    write: (kind: MetricsKind, row: Record<string, unknown>) => written.push({ kind, row }),
    maybeFlush: () => {}, prune: async () => 0, flushSync: () => {},
  } as unknown as MetricsFiles;
  const world = { online: 3, monstros: 200, chao: 12, bots: 1 };
  const m = new MetricsSystem({
    world: () => world, now: () => clock.t, out: (l) => out.push(l), files,
    memory: () => ({ rss: proc.rss, heapUsed: proc.heap }),
    cpu: () => ({ user: proc.cpuUs, system: 0 }),
  });
  return { m, clock, proc, out, written, world };
}

const perf = { fps: 59, fpsMin: 40, heapMb: 300, texMb: 120, objetos: 800, app: "web", uptimeS: 600 };

describe("p95", () => {
  it("valor abaixo do qual ficam 95% das amostras", () => {
    expect(p95([])).toBe(0);
    expect(p95([5])).toBe(5);
    expect(p95(Array.from({ length: 100 }, (_, i) => i + 1))).toBe(95);
    expect(p95([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 100])).toBe(1);
  });
});

describe("MetricsSystem: amostras do servidor", () => {
  it("amostra a cada 30 s: tick médio/máx/p95, CPU %, msgs/s, autosave; grava no arquivo e zera o intervalo", () => {
    const { m, clock, proc, written } = kit();
    for (let i = 0; i < 100; i++) m.onTick(i < 95 ? 2 : 50);
    for (let i = 0; i < 60; i++) m.onMessage();
    m.onAutosave(10); m.onAutosave(30);
    clock.t += METRICS_SAMPLE_MS - 1;
    m.step(clock.t);
    expect(m.ring).toHaveLength(0);
    clock.t += 1;
    proc.cpuUs = 3_000_000; // 3 s de CPU em 30 s = 10%
    m.step(clock.t);
    expect(m.ring).toHaveLength(1);
    expect(m.ring[0]).toEqual({
      t: clock.t, rssMb: 400, heapMb: 150, cpuPct: 10, tickMedMs: 4.4, tickMaxMs: 50, tickP95Ms: 2,
      online: 3, monstros: 200, chao: 12, bots: 1, msgsS: 2, saveMedMs: 20, saveMaxMs: 30,
    } satisfies ServerSample);
    expect(written.filter((w) => w.kind === "servidor")).toHaveLength(1);
    clock.t += METRICS_SAMPLE_MS;
    m.step(clock.t);
    expect(m.ring[1]).toMatchObject({ tickMedMs: 0, tickMaxMs: 0, msgsS: 0, cpuPct: 0 });
    expect(m.ring[1]!.saveMedMs).toBeUndefined();
  });

  it("anel guarda só as últimas 2880 amostras (24 h)", () => {
    const { m, clock } = kit();
    for (let i = 0; i < METRICS_RING + 5; i++) { clock.t += METRICS_SAMPLE_MS; m.sample(clock.t); }
    expect(m.ring).toHaveLength(METRICS_RING);
    expect(m.ring[0]!.t).toBe(T0 + 6 * METRICS_SAMPLE_MS);
  });

  it("RSS acima de 1,5 GB: servidor_memoria (1×/min); resumo a cada 30 min", () => {
    const { m, clock, out } = kit({ rssMb: SERVIDOR_RSS_MB + 10 });
    clock.t += METRICS_SAMPLE_MS; m.step(clock.t);
    clock.t += METRICS_SAMPLE_MS; m.step(clock.t); // 30 s depois: ainda no mesmo minuto do aviso
    expect(out.filter((l) => l.includes('"servidor_memoria"'))).toHaveLength(1);
    expect(out.some((l) => l.includes('"resumo"'))).toBe(false);
    for (let t = 0; t < RESUMO_MS; t += METRICS_SAMPLE_MS) { clock.t += METRICS_SAMPLE_MS; m.step(clock.t); }
    const resumo = out.find((l) => l.includes('"resumo"'))!;
    expect(resumo.startsWith("[metrica] ")).toBe(true);
    expect(JSON.parse(resumo.slice(10))).toMatchObject({ tipo: "resumo", rssMb: SERVIDOR_RSS_MB + 10, online: 3 });
  });

  it("tick acima de 200 ms: tick_lento no máximo 1 por minuto, com os suprimidos na próxima", () => {
    const { m, clock, out, written } = kit();
    m.onTick(TICK_LENTO_MS); // no limite: não é lento
    m.onTick(450); m.onTick(300); m.onTick(260);
    clock.t += EVENTO_THROTTLE_MS;
    m.onTick(220);
    const lentos = out.filter((l) => l.includes("tick_lento")).map((l) => JSON.parse(l.slice(10)));
    expect(lentos).toEqual([
      { tipo: "tick_lento", ms: 450, online: 3, monstros: 200 },
      { tipo: "tick_lento", ms: 220, online: 3, monstros: 200, suprimidos: 2 },
    ]);
    expect(written.filter((w) => w.kind === "eventos")).toHaveLength(2);
    expect(written[0]!.row.t).toBe(T0);
  });

  it("erro isolado pelo runSafe vira erro_sistema (limite por passo); o ErrorLog segue contando", () => {
    const { m, out } = kit();
    const log = new ErrorLog(10_000, () => T0, () => {});
    log.onReport = (k) => m.erro(k);
    for (let i = 0; i < 3; i++) runSafe("monsters", () => { throw new Error("x"); }, log);
    runSafe("combat", () => { throw new Error("y"); }, log);
    expect(log.total).toBe(4);
    expect(out.map((l) => JSON.parse(l.slice(10)))).toEqual([{ tipo: "erro_sistema", passo: "monsters" }, { tipo: "erro_sistema", passo: "combat" }]);
  });

  it("onReport que lança não vira um segundo erro", () => {
    const log = new ErrorLog(10_000, () => T0, () => {});
    log.onReport = () => { throw new Error("métrica quebrada"); };
    expect(runSafe("x", () => { throw new Error("y"); }, log)).toBe(false);
    expect(log.total).toBe(1);
  });
});

describe("MetricsSystem: relatórios dos clientes", () => {
  it("valida, descarta os que chegam a menos de 20 s, guarda as últimas 60 e grava cada um aceito", () => {
    const { m, clock, written } = kit();
    expect(m.clientReport("s1", "Leo", { ...perf, app: "android" })).toBe("invalido");
    expect(m.clientReport("s1", "Leo", perf)).toBe("ok");
    clock.t += 19_999;
    expect(m.clientReport("s1", "Leo", perf)).toBe("cedo");
    for (let i = 0; i < CLIENT_HISTORY + 5; i++) { clock.t += 60_000; m.clientReport("s1", "Leo", { ...perf, heapMb: 300 + i }); }
    const rows = m.clientRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ nome: "Leo", heapMb: 300 + CLIENT_HISTORY + 4 });
    expect(written.filter((w) => w.kind === "clientes")).toHaveLength(CLIENT_HISTORY + 6);
    expect(written.find((w) => w.kind === "clientes")!.row).toEqual({ t: T0, nome: "Leo", ...perf });
    m.removePlayer("s1");
    expect(m.clientRows()).toEqual([]);
  });

  it("cliente pesado (heap > 700, texturas > 400 ou fps mín < 15): cliente_pesado por nome, 1×/min", () => {
    const { m, clock, out } = kit();
    m.clientReport("s1", "Leo", { ...perf, heapMb: CLIENTE_HEAP_MB + 1 });
    m.clientReport("s2", "Ana", { ...perf, fpsMin: 10 });
    m.clientReport("s3", "Bia", perf);
    clock.t += 30_000;
    m.clientReport("s1", "Leo", { ...perf, texMb: 401 }); // mesmo minuto: suprimido
    const pesados = out.filter((l) => l.includes("cliente_pesado")).map((l) => JSON.parse(l.slice(10)));
    expect(pesados).toEqual([
      { tipo: "cliente_pesado", nome: "Leo", ...perf, heapMb: CLIENTE_HEAP_MB + 1 },
      { tipo: "cliente_pesado", nome: "Ana", ...perf, fpsMin: 10 },
    ]);
  });

  it("/metricas: servidor agora, última hora e clientes por heap; /metricas <nome>: histórico", () => {
    const { m, clock, world } = kit();
    m.clientReport("s1", "Leo", { ...perf, heapMb: 200 });
    m.clientReport("s2", "Ana", { ...perf, heapMb: 500, app: "desktop" });
    m.clientReport("s3", "Bia", { ...perf, heapMb: null });
    m.onTick(3);
    clock.t += METRICS_SAMPLE_MS; m.step(clock.t);
    world.online = 5;
    clock.t += METRICS_SAMPLE_MS; m.step(clock.t);
    const lines = m.lines();
    expect(lines[0]).toMatch(/^Servidor agora: RSS 400 MB \(heap 150 MB\) · CPU 0\.0% · tick média/);
    expect(lines[2]).toBe("Última hora (2 amostras): RSS máx 400 MB · tick máx 3.0 ms · online mín 3, máx 5");
    expect(lines.slice(4).map((l) => l.split(" · ")[0])).toEqual(["Ana", "Leo", "Bia"]);
    expect(lines[4]).toBe("Ana · desktop · heap 500 MB · texturas 120 MB · fps 59 (mín 40) · 800 objetos · aberto há 10 min");
    expect(lines[6]).toContain("heap ?");
    clock.t += 60_000; m.clientReport("s1", "Leo", { ...perf, heapMb: 260 });
    const leo = m.lines("leo");
    expect(leo[1]).toBe("Heap +60 MB e texturas +0 MB em 2 min (2 relatórios).");
    expect(leo[2]).toBe("Heap (MB, mais antiga → mais nova): 200 · 260");
    expect(m.lines("Ninguém")[0]).toMatch(/^Sem relatórios de Ninguém/);
  });
});

describe("metricsFormat", () => {
  const sample = (o: Partial<ServerSample> = {}): ServerSample => ({
    t: T0, rssMb: 400, heapMb: 150, cpuPct: 5, tickMedMs: 1.5, tickMaxMs: 9, tickP95Ms: 2, online: 2, monstros: 100, chao: 3, bots: 0, msgsS: 4, ...o,
  });

  it("sem amostras nem clientes: explica quando chegam", () => {
    const l = metricasLines(sample(), [], []);
    expect(l[2]).toMatch(/nenhuma amostra ainda/);
    expect(l[3]).toMatch(/nenhum relatório ainda/);
  });

  it("histórico de um cliente sem heap (navegador fora do Chromium)", () => {
    const row: ClientRow = { t: T0, nome: "Leo", ...perf, heapMb: null, app: "web" };
    const l = clienteLines("Leo", [row, { ...row, t: T0 + 60_000 }]);
    expect(l.some((x) => x.startsWith("Heap +"))).toBe(false);
    expect(l).toContain("Heap (MB, mais antiga → mais nova): ? · ?");
  });

  it("minAvgMax ignora valores ausentes", () => {
    expect(minAvgMax([{ a: 1 }, { a: 3 }, { a: "x" }, {}], "a")).toEqual({ min: 1, avg: 2, max: 3, n: 2 });
    expect(minAvgMax([{}], "a")).toBeNull();
  });

  it("resumo diário: mín/méd/máx do servidor e clientes por personagem, um bloco por dia", () => {
    const dia2 = T0 + 86_400_000;
    const s = [sample({ rssMb: 300 }), sample({ rssMb: 500, t: T0 + 30_000 }), sample({ t: dia2 })];
    const c = [
      { t: T0, nome: "Leo", ...perf, heapMb: 200, texMb: 100, fpsMin: 30 },
      { t: T0 + 60_000, nome: "Leo", ...perf, heapMb: 400, texMb: 140, fpsMin: 12, app: "desktop" },
      { t: T0, nome: "Ana", ...perf },
    ];
    const l = resumoDiasLines(s, c);
    expect(l[0]).toBe("2026-11-01 — servidor: 2 amostras · clientes: 3 relatórios");
    expect(l).toContain("  RSS MB: mín 300 · méd 400 · máx 500");
    expect(l).toContain("  Leo (web+desktop, 2 relatórios): heap méd 300 / máx 400 MB · texturas méd 120 / máx 140 MB · fps mín 12");
    expect(l.indexOf("  Ana (web, 1 relatórios): heap méd 300 / máx 300 MB · texturas méd 120 / máx 120 MB · fps mín 40")).toBeLessThan(l.findIndex((x) => x.startsWith("  Leo")));
    expect(l.some((x) => x.startsWith("2026-11-02 — servidor: 1 amostras"))).toBe(true);
  });
});

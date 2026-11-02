import { describe, expect, it } from "vitest";
import { CLIENT_PERF_EVERY_MS, CLIENT_PERF_FIRST_MS, sanitizeClientPerf, type ClientPerfMsg } from "@lemonquest/shared";
import { FpsWindow, countObjects, heapMb, startPerfReporter, texMb, type PerfProbe } from "./perf.ts";

describe("FpsWindow", () => {
  it("média e mínimo da janela; recomeça a cada take; ignora lixo", () => {
    const w = new FpsWindow();
    for (const v of [60, 58, Number.NaN, -1, 30, 60]) w.add(v);
    expect(w.size).toBe(4);
    expect(w.take()).toEqual({ fps: 52, fpsMin: 30 });
    expect(w.take()).toEqual({ fps: 0, fpsMin: 0 });
  });
});

describe("texMb", () => {
  it("soma largura×altura×4 em MB e ignora fontes sem tamanho", () => {
    expect(texMb([{ width: 1024, height: 1024 }, { width: 512, height: 512 }])).toBe(5);
    expect(texMb([{ width: 0, height: 10 }, { width: Number.NaN, height: 5 }, null as never])).toBe(0);
  });
});

describe("countObjects", () => {
  it("conta os filhos das camadas e containers", () => {
    expect(countObjects([{}, { list: [{}, {}, { list: [{}] }] }, null])).toBe(6);
  });
});

describe("heapMb", () => {
  it("usedJSHeapSize em MB; null sem performance.memory", () => {
    expect(heapMb({ memory: { usedJSHeapSize: 300 * 1048576 } })).toBe(300);
    expect(heapMb({})).toBeNull();
    expect(heapMb(undefined)).toBeNull();
  });
});

describe("startPerfReporter", () => {
  function fakeTimers() {
    let fn: (() => void) | null = null;
    return {
      timers: { setInterval: (f: () => void) => { fn = f; return 1; }, clearInterval: () => { fn = null; } },
      advance: (s: number) => { for (let i = 0; i < s; i++) fn?.(); },
      running: () => fn !== null,
    };
  }
  const probe = (over: Partial<PerfProbe> = {}): PerfProbe => ({
    fps: () => 60, textures: () => [{ width: 2048, height: 2048 }], objetos: () => 900, app: () => "desktop",
    heap: () => 250, uptimeMs: () => 45_000, ...over,
  });

  it("primeiro relatório aos 30 s, depois a cada 60 s; o relatório passa na validação do servidor; stop para", () => {
    const t = fakeTimers();
    const sent: ClientPerfMsg[] = [];
    const stop = startPerfReporter(probe(), (m) => sent.push(m), t.timers);
    t.advance(CLIENT_PERF_FIRST_MS / 1000 - 1);
    expect(sent).toHaveLength(0);
    t.advance(1);
    expect(sent).toEqual([{ fps: 60, fpsMin: 60, heapMb: 250, texMb: 16, objetos: 900, app: "desktop", uptimeS: 45 }]);
    expect(sanitizeClientPerf(sent[0])).not.toBeNull();
    t.advance(CLIENT_PERF_EVERY_MS / 1000 - 1);
    expect(sent).toHaveLength(1);
    t.advance(1);
    expect(sent).toHaveLength(2);
    stop();
    expect(t.running()).toBe(false);
  });

  it("leitura que lança não derruba: só pula o envio", () => {
    const t = fakeTimers();
    const sent: ClientPerfMsg[] = [];
    startPerfReporter(probe({ textures: () => { throw new Error("x"); } }), (m) => sent.push(m), t.timers);
    expect(() => t.advance(120)).not.toThrow();
    expect(sent).toHaveLength(0);
  });
});

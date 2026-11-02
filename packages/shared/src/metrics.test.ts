import { describe, expect, it } from "vitest";
import { CLIENT_PERF_MAX, sanitizeClientPerf } from "./metrics.ts";

const ok = { fps: 59.94, fpsMin: 41.26, heapMb: 312.44, texMb: 180.04, objetos: 1234.4, app: "web", uptimeS: 3600.7 };

describe("sanitizeClientPerf", () => {
  it("aceita um relatório válido e arredonda", () => {
    expect(sanitizeClientPerf(ok)).toEqual({ fps: 59.9, fpsMin: 41.3, heapMb: 312.4, texMb: 180, objetos: 1234, app: "web", uptimeS: 3601 });
  });

  it("heap null (fora do Chromium) e app desktop", () => {
    expect(sanitizeClientPerf({ ...ok, heapMb: null, app: "desktop" })).toMatchObject({ heapMb: null, app: "desktop" });
  });

  it("mínimo acima da média fica na média", () => {
    expect(sanitizeClientPerf({ ...ok, fps: 30, fpsMin: 31 })!.fpsMin).toBe(30);
  });

  it("descarta lixo: não-objeto, campo faltando, não finito, negativo, acima da faixa, app desconhecido", () => {
    for (const bad of [
      null, "x", 5, [], {},
      { ...ok, fps: undefined }, { ...ok, fps: Number.NaN }, { ...ok, texMb: Number.POSITIVE_INFINITY },
      { ...ok, objetos: -1 }, { ...ok, fps: CLIENT_PERF_MAX.fps + 1 }, { ...ok, heapMb: CLIENT_PERF_MAX.heapMb + 1 },
      { ...ok, heapMb: "300" }, { ...ok, heapMb: undefined }, { ...ok, uptimeS: CLIENT_PERF_MAX.uptimeS + 1 },
      { ...ok, app: "android" }, { ...ok, app: undefined },
    ]) expect(sanitizeClientPerf(bad)).toBeNull();
  });
});

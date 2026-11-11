import { describe, expect, it } from "vitest";
import { CollisionGrid, Dir, TILE_SIZE, stepDuration } from "@lemonquest/shared";
import { Predictor } from "./predictor.ts";
import { playSegments, type Playback, type Segment } from "./segments.ts";

const STEP = stepDuration(1, Dir.E);
const V = TILE_SIZE / STEP; // px por ms andando

/** Gerador determinístico (variação do intervalo entre quadros). */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

/** Quadros de `base` ms com ±`jitter` ms; `drops` = índices de quadros que perdem o vsync (2× mais longos). */
function frames(n: number, base: number, jitter: number, seed = 7, drops: number[] = []): number[] {
  const r = lcg(seed);
  return Array.from({ length: n }, (_, i) => (drops.includes(i) ? 2 * base : base + (r() * 2 - 1) * jitter));
}

function push(q: Segment[], pb: Playback, x: number, y: number, ms: number, at?: number, walk = true) {
  const last = q[q.length - 1];
  const from = last ? { x: last.tx, y: last.ty } : { x: pb.rx, y: pb.ry };
  q.push({ fx: from.x, fy: from.y, tx: x * TILE_SIZE, ty: y * TILE_SIZE, dur: ms, t: 0, walk, started: false, at });
}

/**
 * Segura → por `frameMs` como a WorldScene: predição e ator no mesmo `now`; o ator recebe o delta SUAVIZADO do Phaser
 * (média dos últimos 10 quadros). `timed` = passos com `at` (a correção); sem ele, o comportamento antigo.
 */
function walk(frameMs: number[], timed: boolean) {
  const p = new Predictor({ grid: new CollisionGrid(400, 3, new Uint8Array(1200)), spawn: null, isOccupied: () => false });
  p.reset(0, 1, Dir.E);
  const pb: Playback = { rx: 0, ry: TILE_SIZE, endAt: 0 };
  const q: Segment[] = [];
  const hist = Array<number>(10).fill(frameMs[0]!);
  let now = 1000;
  p.press(Dir.E);
  const ev0 = p.update(now);
  if (ev0?.kind === "step") push(q, pb, ev0.x, ev0.y, ev0.ms, timed ? ev0.at : undefined);
  const speed: number[] = [];
  frameMs.forEach((f, i) => {
    const before = pb.rx;
    now += f;
    const ev = p.update(now);
    if (ev?.kind === "step") push(q, pb, ev.x, ev.y, ev.ms, timed ? ev.at : undefined);
    hist[i % 10] = f;
    playSegments(q, pb, hist.reduce((a, b) => a + b) / 10, now, () => {});
    speed.push((pb.rx - before) / f / V);
  });
  return speed.slice(2); // o primeiro passo começa no meio de um quadro
}

describe("playSegments", () => {
  it("passos previstos andam na velocidade exata em todo quadro, sem engasgar na virada do tile", () => {
    for (const [base, jitter] of [[1000 / 60, 1.5], [1000 / 144, 0.6], [1000 / 75, 1]] as const) {
      const v = walk(frames(600, base, jitter), true);
      expect(Math.min(...v), `${base.toFixed(1)} ms`).toBeGreaterThan(0.99);
      expect(Math.max(...v), `${base.toFixed(1)} ms`).toBeLessThan(1.01);
    }
  });

  it("quadro perdido (vsync) não vira tranco: a posição segue o relógio", () => {
    const v = walk(frames(600, 1000 / 60, 1, 3, [50, 51, 200, 340]), true);
    expect(Math.min(...v)).toBeGreaterThan(0.99);
    expect(Math.max(...v)).toBeLessThan(1.01);
  });

  it("sem o relógio (comportamento antigo) a virada do tile parava ou dava tranco", () => {
    const v = walk(frames(600, 1000 / 60, 1.5), false);
    // Medido: 36 de 598 quadros fora de ±10% (~1 por tile em ~35 tiles), de 0,53× a 1,44× a velocidade.
    expect(v.filter((s) => s < 0.9 || s > 1.1).length).toBeGreaterThan(25);
    expect(Math.min(...v)).toBeLessThan(0.6);
    expect(Math.max(...v)).toBeGreaterThan(1.3);
  });

  it("passo previsto depois de uma correção emenda no fim dela, sem salto", () => {
    const pb: Playback = { rx: 3 * TILE_SIZE, ry: 0, endAt: 0 };
    const q: Segment[] = [];
    // Correção de 100 ms (sem relógio) e, logo atrás, um passo previsto que a predição deu como iniciado 60 ms antes
    // do fim da correção na tela.
    q.push({ fx: pb.rx, fy: 0, tx: 2 * TILE_SIZE, ty: 0, dur: 100, t: 0, walk: false, started: true });
    let now = 0;
    for (let i = 0; i < 5; i++) playSegments(q, pb, 16, (now += 16), () => {}); // 80 ms da correção
    push(q, pb, 3, 0, STEP, now + 20 - 60);
    playSegments(q, pb, 16, (now += 16), () => {}); // a correção acaba neste quadro
    playSegments(q, pb, 16, (now += 16), () => {});
    // Do tile 2 só anda o tempo real desde o fim da correção (~17 ms), nada dos 60 ms "devidos" (seria ~77 ms).
    expect(pb.rx - 2 * TILE_SIZE).toBeGreaterThan(V * 16);
    expect(pb.rx - 2 * TILE_SIZE).toBeLessThan(V * 20);
  });

  /**
   * Andar por clique: o servidor anda em cadência exata e cada passo chega com 0–100 ms de variação (tick + patch +
   * rede). `timed` = passo marcado com a chegada (o próprio jogador); sem ele, o catch-up antigo.
   */
  function serverWalk(timed: boolean) {
    const r = lcg(11);
    const pb: Playback = { rx: 0, ry: 0, endAt: 0 };
    const q: Segment[] = [];
    const arrivals = Array.from({ length: 30 }, (_, i) => 1000 + i * STEP + r() * 100);
    const frame = 1000 / 60;
    const speed: number[] = [];
    let next = 0;
    for (let now = 1000; now < 1000 + 31 * STEP; now += frame) {
      while (next < arrivals.length && arrivals[next]! <= now) { push(q, pb, next + 1, 0, STEP, timed ? arrivals[next] : undefined); next++; }
      const before = pb.rx;
      playSegments(q, pb, frame, now, () => {});
      if (now > arrivals[2]! && next < arrivals.length) speed.push((pb.rx - before) / frame / V);
    }
    return speed;
  }

  it("passos do servidor com chegada irregular emendam no fim do anterior: lisos depois de assentar", () => {
    const bad = (v: number[]) => v.filter((s) => s < 0.9 || s > 1.1).length;
    const v = serverWalk(true), old = serverWalk(false);
    const half = (v: number[]) => v.slice(v.length >> 1);
    // Assenta no pior atraso visto (só um novo pior para um pouco); depois, nem parada nem tranco.
    // Medido: 5 quadros fora de ±10% (todos na 1ª metade) contra 56 do catch-up antigo (29 na 2ª metade).
    expect(bad(half(v))).toBe(0);
    expect(bad(v)).toBeLessThan(bad(old) / 3);
    expect(bad(half(old))).toBeGreaterThan(10);
  });

  it("passo do servidor (sem relógio) com fila acumulada continua com catch-up", () => {
    const pb: Playback = { rx: 0, ry: 0, endAt: 0 };
    const q: Segment[] = [];
    push(q, pb, 1, 0, 100);
    push(q, pb, 2, 0, 100);
    playSegments(q, pb, 50, 50, () => {});
    expect(pb.rx).toBeCloseTo(TILE_SIZE * (50 * 1.35) / 100, 5);
  });
});

import { describe, expect, it } from "vitest";
import { CollisionGrid, Dir, stepDuration } from "@lemonquest/shared";
import { CONFIRM_TIMEOUT_MAX_MS, CONFIRM_TIMEOUT_MS, Predictor } from "./predictor.ts";

function grid(rows: string[]): CollisionGrid {
  const h = rows.length, w = rows[0].length;
  const b = new Uint8Array(w * h);
  rows.forEach((r, y) => [...r].forEach((c, x) => { b[y * w + x] = c === "#" ? 1 : 0; }));
  return new CollisionGrid(w, h, b);
}

const G = grid(["......", "......", "..#...", "......"]);
const STEP = stepDuration(1, Dir.E);

function make(occupied: [number, number][] = []) {
  const p = new Predictor({ grid: G, spawn: null, isOccupied: (x, y) => occupied.some(([ox, oy]) => ox === x && oy === y) });
  p.reset(0, 0, Dir.S);
  return p;
}

describe("Predictor", () => {
  it("steps immediately on press and chains at exact cadence while held", () => {
    const p = make();
    p.press(Dir.E);
    expect(p.update(0)).toMatchObject({ kind: "step", x: 1, y: 0 });
    expect(p.update(STEP - 1)).toBeNull();
    expect(p.update(STEP + 10)).toMatchObject({ kind: "step", x: 2 });
    expect(p.stepEndsAt).toBe(2 * STEP); // encadeado a partir do fim do passo anterior
  });

  it("tap = exactly one step", () => {
    const p = make();
    p.press(Dir.S);
    p.release();
    expect(p.update(0)).toMatchObject({ kind: "step", x: 0, y: 1 });
    expect(p.update(STEP * 3)).toBeNull();
  });

  it("blocked → turn only (walls and players)", () => {
    const p = make([[1, 0]]);
    p.press(Dir.E);
    expect(p.update(0)).toEqual({ kind: "turn", dir: Dir.E });
    expect(p.x).toBe(0);
  });

  it("confirms matching server positions and detects divergence", () => {
    const p = make();
    p.press(Dir.E);
    p.update(0);
    p.update(STEP);
    expect(p.unconfirmed).toBe(2);
    expect(p.onServerPos(1, 0, STEP, 50).kind).toBe("confirmed");
    expect(p.unconfirmed).toBe(1);
    expect(p.onServerPos(1, 1, STEP, STEP + 50).kind).toBe("diverged");
    expect(p.unconfirmed).toBe(0);
    expect([p.x, p.y]).toEqual([1, 1]);
  });

  it("server-driven moves (click-walk) are external", () => {
    const p = make();
    expect(p.onServerPos(1, 1, STEP, 0)).toEqual({ kind: "external", ms: STEP });
    expect(p.isFree(STEP - 1)).toBe(false);
  });

  it("gives up on predictions the server never confirms", () => {
    const p = make();
    p.press(Dir.E);
    p.release();
    p.update(0);
    expect(p.checkStale(0, 0, 100)).toBe(false);
    expect(p.checkStale(0, 0, 1000)).toBe(true);
    expect([p.x, p.y]).toEqual([0, 0]);
  });

  it("timeout da confirmação acompanha a latência medida (LAN fica no mínimo; teto de 2 s)", () => {
    const walk = (p: Predictor, lag: number, n: number) => {
      let t = 0;
      p.press(Dir.E);
      for (let i = 0; i < n; i++) {
        const e = p.update(t);
        if (e?.kind === "step") expect(p.onServerPos(e.x, e.y, e.ms, t + lag).kind).toBe("confirmed");
        t = p.stepEndsAt;
        if (p.x >= 5) { p.reset(0, 0, Dir.E); p.stepEndsAt = t; }
      }
    };
    const lan = make();
    walk(lan, 60, 10);
    expect(lan.confirmTimeoutMs).toBe(CONFIRM_TIMEOUT_MS);
    const vpn = make();
    walk(vpn, 600, 20);
    expect(vpn.confirmTimeoutMs).toBeGreaterThan(1200);
    expect(vpn.confirmTimeoutMs).toBeLessThanOrEqual(CONFIRM_TIMEOUT_MAX_MS);
    // Com 600 ms de ida e volta, um passo ainda não confirmado em 1 s não é desfeito (antes: desfeito em 450 ms).
    vpn.reset(0, 0, Dir.S);
    vpn.press(Dir.S); vpn.release();
    vpn.stepEndsAt = 0;
    vpn.update(10_000);
    expect(vpn.checkStale(0, 0, 11_000)).toBe(false);
    const huge = make();
    walk(huge, 5000, 20);
    expect(huge.confirmTimeoutMs).toBe(CONFIRM_TIMEOUT_MAX_MS);
  });

  it("haste shortens the step; rooted (speedPct 0) only turns", () => {
    const p = make();
    p.speedPct = 150;
    p.press(Dir.E);
    const ev = p.update(0);
    expect(ev).toMatchObject({ kind: "step", ms: stepDuration(1, Dir.E, 100, 150) });
    expect(stepDuration(1, Dir.E, 100, 150)).toBeLessThan(STEP);
    const r = make();
    r.speedPct = 0;
    r.press(Dir.E);
    expect(r.update(0)).toMatchObject({ kind: "turn", dir: Dir.E });
    expect(r.x).toBe(0);
  });
});

describe("Predictor em rede ruim (lag ao andar)", () => {
  const LONG = grid(Array.from({ length: 12 }, () => ".".repeat(12)));
  const make = () => { const p = new Predictor({ grid: LONG, spawn: null, isOccupied: () => false }); p.reset(0, 0, Dir.S); return p; };
  /** Confirma `n` passos com a espera `rtt` (alimenta a média e o desvio da latência). */
  const warm = (p: Predictor, rtts: number[]) => {
    let t = 0;
    for (const rtt of rtts) {
      const ev = p.update(t)!;
      expect(ev.kind).toBe("step");
      p.onServerPos(p.x, p.y, STEP, t + rtt);
      t = p.stepEndsAt;
    }
    return t;
  };

  it("passo externo com a tecla segurada desconta meia ida e volta: o próximo é previsto a tempo e volta a liderar", () => {
    const p = make();
    p.press(Dir.S);
    const t = warm(p, [200, 200, 200]); // ~200 ms até confirmar
    p.reset(0, 3, Dir.S); // como depois de uma correção: sem previsões, servidor seguindo sozinho
    p.press(Dir.E);
    expect(p.onServerPos(1, 3, STEP, t)).toEqual({ kind: "external", ms: STEP });
    expect(p.stepEndsAt).toBe(t + STEP - 100);
    // Sem tecla (clique, perseguição): o passo inteiro, como antes.
    const q = make();
    q.press(Dir.S); warm(q, [200, 200]); q.release();
    q.reset(0, 3, Dir.S);
    q.onServerPos(1, 3, STEP, 5000);
    expect(q.stepEndsAt).toBe(5000 + STEP);
  });

  it("espera pela confirmação cresce com a variação da latência (média + 4 desvios), não só com a média", () => {
    const steady = make(); steady.press(Dir.S);
    warm(steady, [150, 150, 150, 150, 150]);
    const shaky = make(); shaky.press(Dir.S);
    warm(shaky, [150, 900, 150, 900, 150]);
    expect(steady.confirmTimeoutMs).toBe(CONFIRM_TIMEOUT_MS);
    expect(shaky.confirmTimeoutMs).toBeGreaterThan(steady.confirmTimeoutMs);
    expect(shaky.confirmTimeoutMs).toBeLessThanOrEqual(CONFIRM_TIMEOUT_MAX_MS);
  });

  it("passo recusado pelo servidor (bump): volta já para a posição dele; sem previsão pendente, nada muda", () => {
    const p = make();
    p.press(Dir.E);
    p.update(0); p.update(STEP); // previu (1,0) e (2,0)
    expect(p.onRefused(0, 0, STEP + 50)).toBe(true);
    expect([p.x, p.y, p.unconfirmed, p.stats.refused]).toEqual([0, 0, 0, 1]);
    expect(p.onRefused(0, 0, STEP + 60)).toBe(false);
  });
});

describe("Predictor: teleporte com a tecla segurada", () => {
  it("salto longo (portal, morte) larga a tecla como o servidor: nada de passos previstos do outro lado", () => {
    const LONG = grid(Array.from({ length: 12 }, () => ".".repeat(12)));
    const p = new Predictor({ grid: LONG, spawn: null, isOccupied: () => false });
    p.reset(0, 0, Dir.E);
    p.press(Dir.E);
    p.update(0);
    expect(p.onServerPos(8, 8, 0, 100)).toMatchObject({ kind: "external" });
    expect(p.update(200)).toBeNull();
    expect(p.update(2000)).toBeNull();
    p.press(Dir.E); // reapertou: anda de novo
    expect(p.update(2100)).toMatchObject({ kind: "step", x: 9, y: 8 });
  });
});

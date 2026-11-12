import { describe, expect, it } from "vitest";
import { EXPLORE_RADIUS, ExploredMask } from "@lemonquest/shared";
import { ExplorationSystem } from "./exploration.ts";
import type { CharacterRecord } from "../persistence/types.ts";

const rec = (explored?: string): CharacterRecord => ({
  id: 1, accountId: 1, name: "a", vocation: "knight", level: 1, xp: 0, x: null, y: null, dir: 4, data: { explored },
});

describe("ExplorationSystem", () => {
  it("revela ao entrar e devolve a máscara", () => {
    const s = new ExplorationSystem(40, 30);
    const msg = s.addPlayer("s1", rec(), 20, 15);
    expect(msg).toMatchObject({ width: 40, height: 30 });
    const m = ExploredMask.fromBase64(40, 30, msg.bits);
    expect(m.has(20, 15)).toBe(true);
    expect(m.has(20 + EXPLORE_RADIUS, 15)).toBe(true);
    expect(m.has(0, 0)).toBe(false);
  });

  it("revela ao mover e ignora tile repetido", () => {
    const s = new ExplorationSystem(40, 30);
    s.addPlayer("s1", rec(), 10, 10);
    expect(s.onPosition("s1", 10, 10)).toBe(false);
    expect(s.onPosition("s1", 25, 10)).toBe(true);
    expect(ExploredMask.fromBase64(40, 30, s.serialize("s1")).has(30, 10)).toBe(true);
    expect(s.onPosition("nope", 1, 1)).toBe(false);
  });

  it("% explorado incremental bate com a varredura completa (20-11)", () => {
    const W = 40, H = 30;
    // Metade de cima alcançável, menos uma coluna de parede.
    const reach = new Uint8Array(W * H);
    for (let y = 0; y < 15; y++) for (let x = 0; x < W; x++) if (x !== 20) reach[y * W + x] = 1;
    const full = (bits: string) => {
      const m = ExploredMask.fromBase64(W, H, bits);
      let total = 0, seen = 0;
      for (let i = 0; i < reach.length; i++) if (reach[i]) { total++; if (m.has(i % W, Math.floor(i / W))) seen++; }
      return (seen * 100) / total;
    };
    const s = new ExplorationSystem(W, H);
    // Já explorado antes de entrar (save) + revelação na entrada.
    const saved = new ExploredMask(W, H);
    saved.reveal(5, 5);
    s.addPlayer("s1", rec(saved.toBase64()), 30, 20);
    expect(s.percent("s1")).toBe(0); // sem os alcançáveis ainda
    s.setReachable(reach);
    expect(s.percent("s1")).toBeCloseTo(full(s.serialize("s1")!), 10);
    for (const [x, y] of [[12, 3], [12, 4], [25, 10], [38, 1], [0, 29], [19, 14]] as const) {
      s.onPosition("s1", x, y);
      expect(s.percent("s1")).toBeCloseTo(full(s.serialize("s1")!), 10);
    }
    // Quem entra depois já começa com a contagem certa.
    s.addPlayer("s2", rec(s.serialize("s1")), 1, 1);
    expect(s.percent("s2")).toBeCloseTo(full(s.serialize("s2")!), 10);
    expect(s.percent("nope")).toBe(0);
  });

  it("persiste e recarrega", () => {
    const s = new ExplorationSystem(40, 30);
    s.addPlayer("s1", rec(), 10, 10);
    const saved = s.serialize("s1")!;
    s.removePlayer("s1");
    expect(s.serialize("s1")).toBeUndefined();
    const msg = s.addPlayer("s2", rec(saved), 35, 25);
    const m = ExploredMask.fromBase64(40, 30, msg.bits);
    expect(m.has(10, 10)).toBe(true);
    expect(m.has(35, 25)).toBe(true);
  });
});

import { describe, expect, it, vi } from "vitest";
import { onTabReturn, settleActors, type Settleable } from "./tabReturn.ts";

const actor = (moving: boolean, x: number, y: number) => {
  const a = { isMoving: moving, tileX: x, tileY: y, snaps: [] as [number, number][], snapTo(sx: number, sy: number) { a.snaps.push([sx, sy]); a.isMoving = false; } };
  return a as Settleable & { snaps: [number, number][]; isMoving: boolean };
};

describe("volta à aba", () => {
  it("só quem tem passos na fila vai direto ao tile atual (de todos os grupos)", () => {
    const walking = actor(true, 10, 4), idle = actor(false, 3, 3), mob = actor(true, 7, 9);
    expect(settleActors([walking, idle], [mob])).toBe(2);
    expect(walking.snaps).toEqual([[10, 4]]);
    expect(mob.snaps).toEqual([[7, 9]]);
    expect(idle.snaps).toEqual([]);
  });

  it("dispara só quando a aba volta a ficar visível, e o desligador solta o listener", () => {
    const listeners = new Set<() => void>();
    const doc = {
      hidden: true,
      addEventListener: (_: string, f: () => void) => listeners.add(f),
      removeEventListener: (_: string, f: () => void) => listeners.delete(f),
    };
    const fn = vi.fn();
    const off = onTabReturn(fn, doc as never);
    for (const f of listeners) f(); // escondeu
    expect(fn).not.toHaveBeenCalled();
    doc.hidden = false;
    for (const f of listeners) f(); // voltou
    expect(fn).toHaveBeenCalledTimes(1);
    off();
    expect(listeners.size).toBe(0);
  });
});

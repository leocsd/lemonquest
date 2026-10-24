import { describe, expect, it } from "vitest";
import {
  CYCLE_MS, PHASE_MS, ambientForZone, ambientRgb, clockHours, clockLabel, darknessOf, phaseAt, wrapCycle, zoneAt, zoneLightMode,
} from "./daynight.ts";

const MIN = 60_000;

describe("ciclo dia/noite", () => {
  it("dura 40 min: dia 24, entardecer 4, noite 8, amanhecer 4", () => {
    expect(CYCLE_MS).toBe(40 * MIN);
    expect(phaseAt(0).phase).toBe("day");
    expect(phaseAt(23.9 * MIN).phase).toBe("day");
    expect(phaseAt(24 * MIN).phase).toBe("dusk");
    expect(phaseAt(28 * MIN).phase).toBe("night");
    expect(phaseAt(36 * MIN).phase).toBe("dawn");
    expect(phaseAt(40 * MIN).phase).toBe("day");
    expect(phaseAt(-1).phase).toBe("dawn");
    expect(phaseAt(26 * MIN).progress).toBeCloseTo(0.5);
    expect(PHASE_MS.night).toBe(8 * MIN);
  });

  it("relógio: início do ciclo = 06:00", () => {
    expect(clockHours(0)).toBeCloseTo(6);
    expect(clockLabel(0)).toBe("06:00");
    expect(clockLabel(CYCLE_MS / 2)).toBe("18:00");
    expect(clockHours(32 * MIN)).toBeCloseTo((6 + 19.2) % 24);
    expect(wrapCycle(CYCLE_MS + 5)).toBe(5);
  });

  it("cor ambiente é contínua (inclusive na volta do ciclo) e fica entre 0 e 1", () => {
    let prev = ambientRgb(0);
    const step = 1000;
    for (let t = step; t <= CYCLE_MS + step; t += step) {
      const c = ambientRgb(t);
      for (let i = 0; i < 3; i++) {
        expect(c[i]).toBeGreaterThanOrEqual(0);
        expect(c[i]).toBeLessThanOrEqual(1);
        expect(Math.abs(c[i] - prev[i])).toBeLessThan(0.02);
      }
      prev = c;
    }
    expect(ambientRgb(0)).toEqual(ambientRgb(CYCLE_MS));
  });

  it("escuridão: dia 0, noite entre 50% e 68%, nunca breu", () => {
    expect(darknessOf(ambientRgb(10 * MIN))).toBeCloseTo(0, 6);
    for (const m of [29, 32, 35]) {
      const d = darknessOf(ambientRgb(m * MIN));
      expect(d).toBeGreaterThan(0.5);
      expect(d).toBeLessThan(0.68);
    }
    for (let t = 0; t < CYCLE_MS; t += 5000) expect(darknessOf(ambientRgb(t))).toBeLessThan(0.7);
  });

  it("entardecer fica entre o dia e a noite", () => {
    const dusk = darknessOf(ambientRgb(26 * MIN));
    expect(dusk).toBeGreaterThan(0.05);
    expect(dusk).toBeLessThan(darknessOf(ambientRgb(32 * MIN)));
  });
});

describe("regras por zona", () => {
  it("cavernas e cripta são escuras a qualquer hora (~85%)", () => {
    for (const z of ["Cavernas", "Cripta"]) {
      expect(zoneLightMode(z)).toBe("dark");
      for (const t of [0, 12 * MIN, 32 * MIN]) {
        const d = darknessOf(ambientForZone(t, z));
        expect(d).toBeGreaterThan(0.8);
        expect(d).toBeLessThan(0.9);
      }
    }
  });

  it("vila é mais clara que o campo à noite; coliseu ainda mais; de dia é tudo claro", () => {
    const night = 32 * MIN;
    const field = darknessOf(ambientForZone(night, "Floresta Sussurrante"));
    const town = darknessOf(ambientForZone(night, "Vila de Pedra Clara"));
    const arena = darknessOf(ambientForZone(night, "Coliseu"));
    expect(town).toBeLessThan(field);
    expect(arena).toBeLessThan(town);
    expect(town).toBeLessThan(0.62);
    expect(darknessOf(ambientForZone(5 * MIN, "Vila de Pedra Clara"))).toBeCloseTo(0, 6);
    expect(darknessOf(ambientForZone(5 * MIN, null))).toBeCloseTo(0, 6);
    expect(zoneLightMode(null)).toBe("outdoor");
  });

  it("a Oficina dos Engenhos é interior iluminado: igual ao Coliseu, mais clara que a vila à noite", () => {
    const night = 32 * MIN;
    expect(zoneLightMode("Oficina dos Engenhos")).toBe("lit");
    const office = darknessOf(ambientForZone(night, "Oficina dos Engenhos"));
    expect(office).toBeCloseTo(darknessOf(ambientForZone(night, "Coliseu")), 6);
    expect(office).toBeLessThan(darknessOf(ambientForZone(night, "Vila de Pedra Clara")));
  });

  it("zoneAt escolhe a menor zona que contém o tile", () => {
    const zones = [
      { name: "Grande", x: 0, y: 0, w: 100, h: 100 },
      { name: "Pequena", x: 10, y: 10, w: 5, h: 5 },
    ];
    expect(zoneAt(zones, 12, 12)).toBe("Pequena");
    expect(zoneAt(zones, 50, 50)).toBe("Grande");
    expect(zoneAt(zones, 150, 50)).toBeNull();
    expect(zoneAt(zones, 15, 15)).toBe("Grande");
  });
});

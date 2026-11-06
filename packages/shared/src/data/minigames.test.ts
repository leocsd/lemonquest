import { describe, expect, it } from "vitest";
import {
  CHUVA_MIN_SAFE, CHUVA_PATTERNS, GENIUS_PADS, MINIGAME_DAILY_FICHAS, MINIGAME_RECORDS_TOP, MINIGAME_ROOM_SIZE, MINIGAME_SHOP_TONES,
  chaoPick, chaoTiming, chuvaPattern, chuvaTiming, fichasCapped, geniusLength, geniusPadAt, localIdx, minigameFichas,
  minigameRecordsInsert, pegaHazard, pegaTarget, type ChuvaPatternId, type MinigameRecord,
} from "./minigames.ts";
import { toneDef } from "./outfitTones.ts";

const N = MINIGAME_ROOM_SIZE;
/** Gerador determinístico (mulberry32) para os testes. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("Chuva de Limões", () => {
  it("todo padrão, em qualquer onda, deixa pelo menos CHUVA_MIN_SAFE tiles livres e só tiles da sala", () => {
    const rng = mulberry32(7);
    for (let wave = 1; wave <= 60; wave++) for (let k = 0; k < 40; k++) {
      const { tiles } = chuvaPattern(wave, rng);
      expect(new Set(tiles).size).toBe(tiles.length);
      expect(tiles.every((i) => i >= 0 && i < N * N)).toBe(true);
      expect(N * N - tiles.length).toBeGreaterThanOrEqual(CHUVA_MIN_SAFE);
      expect(tiles.length).toBeGreaterThan(0);
    }
  });

  it("padrões difíceis só depois da onda mínima; na onda 12 já aparecem todos", () => {
    const seen = (wave: number) => {
      const rng = mulberry32(wave), s = new Set<ChuvaPatternId>();
      for (let k = 0; k < 400; k++) s.add(chuvaPattern(wave, rng).id);
      return s;
    };
    expect([...seen(1)].every((id) => CHUVA_PATTERNS[id] <= 1)).toBe(true);
    expect(seen(12).size).toBe(Object.keys(CHUVA_PATTERNS).length);
  });

  it("o \"olho\" deixa só um 3×3 livre; aviso encurta com as ondas mas nunca abaixo de 750 ms", () => {
    const rng = mulberry32(3);
    let olho: number[] | undefined;
    for (let k = 0; k < 500 && !olho; k++) { const p = chuvaPattern(20, rng); if (p.id === "olho") olho = p.tiles; }
    expect(N * N - olho!.length).toBe(9);
    expect(chuvaTiming(1).warnMs).toBe(1600);
    expect(chuvaTiming(60).warnMs).toBe(750);
    expect(chuvaTiming(60, "olho").warnMs).toBe(1150);
    for (let w = 1; w < 60; w++) expect(chuvaTiming(w + 1).warnMs).toBeLessThanOrEqual(chuvaTiming(w).warnMs);
  });
});

describe("Chão que Cai", () => {
  it("só escolhe tiles de pé, sem repetir, e prefere a borda do que restou", () => {
    const rng = mulberry32(11);
    const holes = new Uint8Array(N * N);
    let edgeHits = 0, total = 0;
    for (let round = 1; round < 40; round++) {
      const { count } = chaoTiming(round);
      const fall = chaoPick(holes, count, rng);
      expect(new Set(fall).size).toBe(fall.length);
      for (const i of fall) {
        expect(holes[i]).toBe(0);
        const x = i % N, y = Math.floor(i / N);
        const edge = x === 0 || y === 0 || x === N - 1 || y === N - 1 || [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => holes[localIdx(x + dx!, y + dy!)] === 1);
        if (edge) edgeHits++;
        total++;
      }
      for (const i of fall) holes[i] = 1;
      if (holes.every((h) => h === 1)) break;
    }
    expect(holes.every((h) => h === 1)).toBe(true); // o chão acaba: a partida sempre termina
    expect(edgeHits / total).toBeGreaterThan(0.6);
  });

  it("cai mais e avisa menos com as rodadas", () => {
    expect(chaoTiming(1)).toEqual({ count: 3, warnMs: 1600, gapMs: 600 });
    expect(chaoTiming(30).count).toBe(12);
    expect(chaoTiming(30).warnMs).toBe(800);
  });
});

describe("Pega-Limão e Genius", () => {
  it("garoa do Pega-Limão é leve (≤ ~30%) e mais limões com mais gente", () => {
    const rng = mulberry32(5);
    let sum = 0;
    for (let k = 0; k < 200; k++) sum += pegaHazard(60_000, rng).tiles.length;
    expect(sum / 200 / (N * N)).toBeLessThan(0.33);
    expect(pegaTarget(1)).toBe(6);
    expect(pegaTarget(8)).toBe(14);
  });

  it("placas 2×2 nos quatro cantos, sem se tocar; o centro é livre; sequência começa com 3", () => {
    expect(GENIUS_PADS.map((p) => geniusPadAt(p.x0 + 1, p.y0 + 1))).toEqual([0, 1, 2, 3]);
    expect(geniusPadAt(5, 5)).toBe(-1);
    let tiles = 0;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (geniusPadAt(x, y) >= 0) tiles++;
    expect(tiles).toBe(16);
    expect(geniusLength(1)).toBe(3);
  });
});

describe("fichas, recordes e loja", () => {
  it("entrar e sair sem ponto não rende; vitória com gente rende mais; teto diário", () => {
    expect(minigameFichas("chuva", 0, false, 10_000)).toBe(0);
    expect(minigameFichas("chuva", 12, false, 60_000)).toBe(3);
    expect(minigameFichas("chuva", 60, false, 60_000)).toBe(7);
    expect(minigameFichas("chao", 8, true, 60_000)).toBe(4);
    expect(minigameFichas("genius", 9, false, 60_000)).toBe(5);
    expect(fichasCapped(10, MINIGAME_DAILY_FICHAS - 3)).toBe(3);
    expect(fichasCapped(10, MINIGAME_DAILY_FICHAS + 5)).toBe(0);
  });

  it("recordes: um por grupo (fica o melhor), ordenados, top limitado", () => {
    const R = (names: string[], score: number, at: number): MinigameRecord => ({ names, score, at });
    let l: MinigameRecord[] = [];
    l = minigameRecordsInsert(l, R(["Ana", "Bia"], 10, 1));
    l = minigameRecordsInsert(l, R(["bia", "ana"], 8, 2));
    l = minigameRecordsInsert(l, R(["Caio"], 12, 3));
    l = minigameRecordsInsert(l, R(["Zé"], 0, 4));
    expect(l.map((r) => [r.names.join("+"), r.score])).toEqual([["Caio", 12], ["Ana+Bia", 10]]);
    for (let i = 0; i < 10; i++) l = minigameRecordsInsert(l, R([`p${i}`], 1 + i, 10 + i));
    expect(l).toHaveLength(MINIGAME_RECORDS_TOP);
  });

  it("tons da loja existem, custam fichas e não ouro", () => {
    for (const id of MINIGAME_SHOP_TONES) expect(toneDef(id)?.fichas, id).toBeGreaterThan(0);
  });
});

// Tons de tingimento das roupas: catálogo consistente (ids/nomes/cores), consulta segura e a fórmula de colorização.
import { describe, expect, it } from "vitest";
import {
  OUTFIT_TONES, OUTFIT_TONE_PRICE, TONE_KEEP, TONE_PIVOT, colorizePixel, pixelLuminance, toneColor, toneDef,
} from "./outfitTones.ts";

const rgb = (c: number): [number, number, number] => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
/** Cinza cuja luminância é exatamente TONE_PIVOT. */
const MID = Math.round(TONE_PIVOT * 255);

describe("OUTFIT_TONES", () => {
  it("ids e nomes únicos e não vazios; preço inteiro positivo", () => {
    expect(OUTFIT_TONES.length).toBeGreaterThanOrEqual(12);
    expect(new Set(OUTFIT_TONES.map((t) => t.id)).size).toBe(OUTFIT_TONES.length);
    expect(new Set(OUTFIT_TONES.map((t) => t.name)).size).toBe(OUTFIT_TONES.length);
    for (const t of OUTFIT_TONES) {
      expect(t.id, t.id).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(t.name.trim().length, t.id).toBeGreaterThan(0);
    }
    expect(Number.isInteger(OUTFIT_TONE_PRICE)).toBe(true);
    expect(OUTFIT_TONE_PRICE).toBeGreaterThan(0);
  });

  it("ids já vendidos continuam existindo (contas que compraram não perdem o tom)", () => {
    const ids = OUTFIT_TONES.map((t) => t.id);
    for (const id of ["crimson", "azure", "emerald", "violet", "amber", "slate", "rose", "gold"]) expect(ids, id).toContain(id);
  });

  it("cor é um inteiro 0xRRGGBB (24 bits), distinta entre tons e nunca branco (branco = sem tingimento)", () => {
    for (const t of OUTFIT_TONES) {
      expect(Number.isInteger(t.color), t.id).toBe(true);
      expect(t.color, t.id).toBeGreaterThanOrEqual(0);
      expect(t.color, t.id).toBeLessThanOrEqual(0xffffff);
      expect(t.color, t.id).not.toBe(0xffffff);
    }
    expect(new Set(OUTFIT_TONES.map((t) => t.color)).size).toBe(OUTFIT_TONES.length);
  });

  it("nenhum tom vira borrão: luminância entre 0,25 (não quase preto) e 0,8 (não quase branco)", () => {
    for (const t of OUTFIT_TONES) {
      const l = pixelLuminance(...rgb(t.color));
      expect(l, t.id).toBeGreaterThanOrEqual(0.25);
      expect(l, t.id).toBeLessThanOrEqual(0.8);
    }
  });

  it("toneDef acha cada tom e devolve undefined para id desconhecido, vazio ou ausente", () => {
    for (const t of OUTFIT_TONES) expect(toneDef(t.id)).toBe(t);
    expect(toneDef("x")).toBeUndefined();
    expect(toneDef("")).toBeUndefined();
    expect(toneDef(undefined)).toBeUndefined();
    expect(toneDef(null)).toBeUndefined();
  });

  it("toneColor devolve a cor do tom e branco (sem tingimento) para o resto", () => {
    for (const t of OUTFIT_TONES) expect(toneColor(t.id)).toBe(t.color);
    expect(toneColor("x")).toBe(0xffffff);
    expect(toneColor("")).toBe(0xffffff);
    expect(toneColor(undefined)).toBe(0xffffff);
  });
});

describe("colorizePixel", () => {
  it("preto continua preto, o cinza médio vira o próprio tom e o branco continua branco", () => {
    for (const t of OUTFIT_TONES) {
      expect(colorizePixel(0, 0, 0, t.color), t.id).toEqual([0, 0, 0]);
      expect(colorizePixel(MID, MID, MID, t.color), t.id).toEqual(rgb(t.color));
      expect(colorizePixel(255, 255, 255, t.color), t.id).toEqual([255, 255, 255]);
    }
  });

  it("preserva o brilho: mais claro no original = mais claro tingido (sombra < meio-tom < brilho)", () => {
    const tone = toneColor("crimson");
    const lum = (v: number) => pixelLuminance(...colorizePixel(v, v, v, tone));
    expect(lum(20)).toBeLessThan(lum(90));
    expect(lum(90)).toBeLessThan(lum(MID));
    expect(lum(MID)).toBeLessThan(lum(220));
    // sombra com metade da luminância do pivô (77 ≈ 153/2) = metade do tom: escala linear, sem o escurecimento do multiply
    expect(colorizePixel(77, 77, 77, 0x804020)).toEqual([64, 32, 16]);
  });

  it("brilho vai ao branco aos poucos (no meio do caminho entre o pivô e o branco, metade do caminho)", () => {
    const v = Math.round((TONE_PIVOT + (1 - TONE_PIVOT) / 2) * 255); // 204 → luminância 0,8
    expect(colorizePixel(v, v, v, 0x214161)).toEqual([33 + 111, 65 + 95, 97 + 79]);
  });

  it("pele do pack e o tom natural (0xffffff) passam intactos; o alpha nem entra na conta", () => {
    // inclui a pele morena da Princess (Nobre/Oriental femininas) e a sombra da pele clara (Woman, Cavegirl2...)
    for (const c of [0xef914f, 0xf2ad7d, 0xcf736d, 0xa3754e]) expect(TONE_KEEP.has(c), c.toString(16)).toBe(true);
    for (const c of TONE_KEEP) expect(colorizePixel(...rgb(c), toneColor("azure"))).toEqual(rgb(c));
    expect(colorizePixel(12, 200, 99, 0xffffff)).toEqual([12, 200, 99]);
    // cor qualquer que não é pele: tinge
    expect(colorizePixel(0x8d, 0x97, 0x7f, toneColor("azure"))).not.toEqual([0x8d, 0x97, 0x7f]);
  });
});

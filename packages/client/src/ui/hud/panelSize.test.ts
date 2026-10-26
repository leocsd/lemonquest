import { describe, expect, it } from "vitest";
import { clampRows, defaultSections, defaultSizes, normalizeSizes, rowsFromDrag, rowsToPx, SIZE_SPEC } from "./panelSize.ts";

describe("panelSize", () => {
  it("padrões: batalha 5 linhas, mochila 3 linhas", () => {
    expect(defaultSizes()).toEqual({ battle: 5, backpack: 3 });
  });

  it("tela baixa (≤ 820 px): batalha começa com 3 linhas para a mochila caber", () => {
    expect(defaultSizes(720)).toEqual({ battle: 3, backpack: 3 });
    expect(defaultSizes(900)).toEqual({ battle: 5, backpack: 3 });
  });

  it("tela baixa (<= 820 px): Equipamento dobrado e Mochila aberta; tela alta: tudo aberto", () => {
    expect(defaultSections(768)).toMatchObject({ equipment: false, backpack: true, status: true, battle: true, party: true, online: false });
    expect(defaultSections(900)).toEqual({ status: true, equipment: true, battle: true, backpack: true, party: true, online: true });
  });

  it("clampRows limita a min/max, arredonda e trata inválidos", () => {
    expect(clampRows("battle", 1)).toBe(2);
    expect(clampRows("battle", 99)).toBe(12);
    expect(clampRows("backpack", 99)).toBe(5);
    expect(clampRows("backpack", 3.6)).toBe(4);
    expect(clampRows("backpack", NaN)).toBe(3);
    expect(clampRows("battle", "7")).toBe(5);
  });

  it("normalizeSizes ignora lixo e valida cada painel", () => {
    expect(normalizeSizes(null)).toEqual({ battle: 5, backpack: 3 });
    expect(normalizeSizes("x")).toEqual({ battle: 5, backpack: 3 });
    expect(normalizeSizes({ battle: 8, backpack: 99, outro: 1 })).toEqual({ battle: 8, backpack: 5 });
    expect(normalizeSizes({ battle: "a" })).toEqual({ battle: 5, backpack: 3 });
  });

  it("rowsToPx: múltiplos da linha (mochila: 3*40 + 2*5 + 4 de respiro)", () => {
    expect(rowsToPx("battle", 5)).toBe(5 * SIZE_SPEC.battle.row);
    expect(rowsToPx("backpack", 3)).toBe(3 * 40 + 2 * 5 + 4);
    expect(rowsToPx("backpack", 5)).toBe(5 * 40 + 4 * 5 + 4);
  });

  it("rowsFromDrag faz snap em linhas inteiras e respeita limites", () => {
    const r = SIZE_SPEC.battle.row;
    expect(rowsFromDrag("battle", 5, 0)).toBe(5);
    expect(rowsFromDrag("battle", 5, r * 0.4)).toBe(5);
    expect(rowsFromDrag("battle", 5, r * 0.6)).toBe(6);
    expect(rowsFromDrag("battle", 5, -r * 2.2)).toBe(3);
    expect(rowsFromDrag("battle", 5, -9999)).toBe(2);
    expect(rowsFromDrag("battle", 5, 9999)).toBe(12);
    expect(rowsFromDrag("backpack", 3, 9999)).toBe(5);
  });
});

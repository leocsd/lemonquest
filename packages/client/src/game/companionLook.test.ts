import { describe, expect, it } from "vitest";
import { companionLook, companionLookIndex } from "./creatures.ts";

describe("roupa do acompanhante do Estagiário (2026-11-01)", () => {
  it("é estável por dono (mesmo nome, mesma roupa) e varia entre donos", () => {
    expect(companionLookIndex("PR3D4D0R 0CULT0")).toBe(companionLookIndex("PR3D4D0R 0CULT0"));
    const nomes = ["Ana", "Bia", "Caio", "Duda", "Edu", "Fê", "Gui", "Hugo", "Iara", "Juca"];
    expect(new Set(nomes.map(companionLookIndex)).size).toBeGreaterThan(5);
    expect(companionLook("Ana").sheet.url).toMatch(/^ninja\/Actor\/Character\/[^/]+\/SpriteSheet\.png$/);
  });
});

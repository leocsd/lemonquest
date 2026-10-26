import { describe, expect, it } from "vitest";
import { isFirstLogin, welcomeFeed } from "./welcome.ts";

describe("boas-vindas a personagem novo", () => {
  it("primeira entrada = registro sem posição salva", () => {
    expect(isFirstLogin({ x: null, y: null })).toBe(true);
    expect(isFirstLogin({ x: 97, y: 98 })).toBe(false);
    expect(isFirstLogin({ x: 0, y: 0 })).toBe(false); // (0,0) é posição, não "nunca entrou"
  });

  it("Feed de todos com nome e vocação; linha pessoal aponta a primeira missão e a Agenda", () => {
    const w = welcomeFeed("Ana Maria", "druid");
    expect(w.all).toEqual({ text: "🍋 Ana Maria (Druida) acabou de chegar a Pedra Clara. Deem as boas-vindas!", kind: "info" });
    expect(w.you.text).toContain("Ana Maria");
    expect(w.you.text).toContain("Capitão Rodrigo");
    expect(w.you.text).toContain("Agenda");
  });
});

import { describe, expect, it } from "vitest";
import { duelBarText, duelClock, duelInviteText, duelResultText } from "./duelLogic.ts";

describe("textos do duelo", () => {
  it("relógio e barra (contagem e luta, com quem já caiu)", () => {
    expect(duelClock(151_000, 0)).toBe("2:31");
    expect(duelClock(-5, 0)).toBe("0:00");
    const s = { mode: "2x2" as const, mine: [{ name: "Ana", out: false }, { name: "Leo", out: true }], theirs: [{ name: "Bia", out: false }, { name: "Caio", out: false }] };
    expect(duelBarText({ ...s, phase: "countdown", until: 4_000 }, 0)).toBe("Duelo 2×2: Ana e Leo (fora) × Bia e Caio · começa em 0:04");
    expect(duelBarText({ ...s, phase: "fight", until: 151_000 }, 0)).toBe("Duelo 2×2: Ana e Leo (fora) × Bia e Caio · 2:31");
  });

  it("convite e resultado", () => {
    expect(duelInviteText({ fromId: "a", fromName: "Ana", mode: "1x1", until: 0 })).toBe("te desafiou para um duelo 1×1.");
    expect(duelInviteText({ fromId: "a", fromName: "Ana", mode: "2x2", until: 0, partners: "Ana e Leo × você e Bia" }))
      .toBe("te desafiou para um duelo 2×2 (Ana e Leo × você e Bia).");
    expect(duelResultText({ won: true, reason: "wiped", mode: "1x1", opponents: "Bia" })).toBe("Duelo 1×1 contra Bia: Vitória.");
    expect(duelResultText({ won: false, reason: "time", mode: "1x1", opponents: "Bia" })).toBe("Duelo 1×1 contra Bia: Derrota no tempo.");
    expect(duelResultText({ won: null, reason: "time", mode: "2x2", opponents: "Bia e Caio" })).toBe("Duelo 2×2 contra Bia e Caio: Empate no tempo.");
  });
});

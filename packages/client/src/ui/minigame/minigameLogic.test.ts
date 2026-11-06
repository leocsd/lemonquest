import { describe, expect, it } from "vitest";
import type { MinigameStateMsg } from "@lemonquest/shared";
import { barText, hearts, remainingMs, roomAction, standings } from "./minigameLogic.ts";

const S = (o: Partial<MinigameStateMsg>): MinigameStateMsg => ({
  room: 1, game: "chuva", phase: "playing", round: 3, players: [], ox: 0, oy: 0, serverNow: 0, ...o,
});

describe("barra do minijogo", () => {
  it("contagem com o relógio do servidor; onda; Pega-Limão com tempo; Genius com vez e vidas do time", () => {
    expect(remainingMs({ until: 5000 }, 1000, 1000)).toBe(3000);
    expect(barText(S({ phase: "countdown", until: 4000 }), 0, 1000)).toBe("Chuva de Limões: começa em 3 s");
    expect(barText(S({}), 0)).toBe("Chuva de Limões · onda 3");
    expect(barText(S({ game: "pega", until: 30_500 }), 0, 0)).toBe("Pega-Limão · 31 s");
    expect(barText(S({ game: "genius", round: 2, teamLives: 2, genius: { step: 1, length: 4, showing: false } }), 0))
      .toBe("Genius do Escritório · rodada 2 · sua vez: 1/4 · time ♥♥♡");
  });

  it("resultado: vencedor, empate e cooperativo, com as fichas", () => {
    expect(barText(S({ phase: "ended", winners: ["Ana"], fichas: 3 }), 0)).toBe("Chuva de Limões: Ana venceu! · +3 ficha(s)");
    expect(barText(S({ phase: "ended", winners: ["Ana", "Bia"], fichas: 1 }), 0)).toBe("Chuva de Limões: Ana e Bia empataram! · +1 ficha(s)");
    expect(barText(S({ game: "genius", phase: "ended", winners: [], players: [{ id: "a", name: "a", lives: 0, score: 7, out: false }] }), 0))
      .toBe("Genius do Escritório: o time chegou à rodada 7 · +0 ficha(s)");
  });

  it("corações, placar ordenado e o botão de cada sala", () => {
    expect(hearts(1)).toBe("♥♡♡");
    expect(hearts(0)).toBe("♡♡♡");
    const p = (name: string, score: number, out = false) => ({ id: name, name, lives: 1, score, out });
    expect(standings([p("c", 2), p("a", 5, true), p("b", 5)]).map((x) => x.name)).toEqual(["b", "a", "c"]);
    const room = { id: 1, game: null, phase: "idle" as const, players: [] };
    expect(roomAction(room, undefined)).toBe("open");
    expect(roomAction({ ...room, phase: "lobby", game: "chao", players: ["x"] }, undefined)).toBe("join");
    expect(roomAction({ ...room, phase: "lobby", game: "chao", players: ["x"] }, 1)).toBe("mine");
    expect(roomAction({ ...room, phase: "playing", game: "chao", players: ["x"] }, undefined)).toBe("busy");
  });
});

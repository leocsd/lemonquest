import { describe, expect, it } from "vitest";
import type { RaceState } from "@lemonquest/shared";
import { raceMineText, raceResultText, raceScoreText, raceTimeText } from "./raceLogic.ts";

const S = (o: Partial<RaceState> = {}): RaceState => ({
  name: "Corrida de Caça", end: 0, points: { limao: 10, laranja: 5 }, members: { limao: 2, laranja: 2 }, team: "limao", mine: 3, ...o,
});

describe("barra da Corrida de Caça", () => {
  it("placar, tempo e a sua posição", () => {
    expect(raceScoreText({ limao: 120, laranja: 98 })).toBe("🍋 120 × 98 🍊");
    expect(raceTimeText(10 * 60_000 + 1, 0)).toBe("faltam 11 min");
    expect(raceTimeText(30_000, 0)).toBe("último minuto");
    expect(raceMineText(S())).toBe("Você: Time Limão (3 pts) · na frente");
    expect(raceMineText(S({ team: "laranja" }))).toBe("Você: Time Laranja (3 pts) · atrás");
    expect(raceMineText(S({ points: { limao: 4, laranja: 4 } }))).toBe("Você: Time Limão (3 pts) · empatado");
  });

  it("resultado: vencedor, empate e o aviso de quem não pontuou", () => {
    expect(raceResultText({ winners: ["laranja"], points: { limao: 3, laranja: 9 }, team: "laranja", mine: 4, chests: 1 }))
      .toBe("Corrida de Caça: Venceu o 🍊 Time Laranja! 🍋 3 × 9 🍊. Você ganhou 1 Baú de Recompensa.");
    expect(raceResultText({ winners: ["limao", "laranja"], points: { limao: 5, laranja: 5 }, team: "limao", mine: 0, chests: 0 }))
      .toBe("Corrida de Caça: Empate! 🍋 5 × 5 🍊. Seu time venceu, mas o prêmio pede pelo menos 1 ponto seu.");
  });
});

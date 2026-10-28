import { describe, expect, it } from "vitest";
import { nextBattleTarget, type BattleEntry } from "./battle.ts";

const entry = (id: string, kind: BattleEntry["kind"], distance: number): BattleEntry =>
  ({ id, name: id, hpPct: 100, kind, distance });

describe("próximo alvo ao apertar Espaço", () => {
  it("sem bicho na lista: nenhum alvo novo — e o alvo atual (um jogador clicado) fica como está", () => {
    expect(nextBattleTarget([], null)).toBeNull();
    expect(nextBattleTarget([entry("p1", "player", 1)], null)).toBeNull(); // só jogador por perto
    const player = { id: "p1", kind: "player" as const };
    expect(nextBattleTarget([entry("p1", "player", 1)], player)).toBe(player); // Espaço não desfaz a mira no jogador
    expect(nextBattleTarget([], { id: "rat1", kind: "monster" })).toEqual({ id: "rat1", kind: "monster" }); // bicho saiu de alcance: nada muda
  });

  it("sem alvo ainda: o bicho mais próximo (lista já vem ordenada por distância)", () => {
    const list = [entry("rat1", "monster", 2), entry("rat2", "monster", 5)];
    expect(nextBattleTarget(list, null)).toEqual({ id: "rat1", kind: "monster" });
  });

  it("com alvo atual: o próximo da lista; depois do último, volta ao primeiro", () => {
    const list = [entry("rat1", "monster", 1), entry("rat2", "monster", 2), entry("rat3", "monster", 3)];
    expect(nextBattleTarget(list, { id: "rat1", kind: "monster" })).toEqual({ id: "rat2", kind: "monster" });
    expect(nextBattleTarget(list, { id: "rat3", kind: "monster" })).toEqual({ id: "rat1", kind: "monster" });
  });

  it("alvo atual já morreu/saiu de alcance (não está mais na lista): volta pro mais próximo", () => {
    const list = [entry("rat2", "monster", 2), entry("rat3", "monster", 4)];
    expect(nextBattleTarget(list, { id: "rat1", kind: "monster" })).toEqual({ id: "rat2", kind: "monster" });
  });

  it("jogadores na lista são ignorados: Espaço mira só bicho", () => {
    const list = [entry("p1", "player", 1), entry("rat1", "monster", 3)];
    expect(nextBattleTarget(list, null)).toEqual({ id: "rat1", kind: "monster" });
  });
});

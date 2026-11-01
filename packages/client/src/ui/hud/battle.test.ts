import { describe, expect, it } from "vitest";
import { BATTLE_RANGE, buildBattleList, nextBattleTarget, setBattleView, type BattleEntry } from "./battle.ts";
import type { PlayerSnap } from "./world.ts";

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

describe("battle list: o que aparece na tela (2026-11-01)", () => {
  const snap = (id: string, x: number, y: number) => ({ id, name: id, x, y, hp: 10, maxHp: 10 }) as unknown as PlayerSnap;
  const players = new Map([["me", snap("me", 50, 50)], ["perto", snap("perto", 53, 50)], ["longe", snap("longe", 64, 50)], ["fora", snap("fora", 50, 62)]]);
  const monsters = { monsters: [entry("m12", "monster", 12), entry("m25", "monster", 25)] };

  it("jogadores: dentro da área visível, mesmo a 14 tiles; fora dela, não", () => {
    setBattleView({ x0: 35, y0: 42, x1: 66, y1: 58 });
    try {
      const ids = buildBattleList(players, "me", {}).map((e) => e.id);
      expect(ids).toEqual(["perto", "longe"]);
    } finally { setBattleView(null); }
  });

  it("fontes extras (monstros) chegam já filtradas pela tela; o teto de distância segue valendo", () => {
    expect(BATTLE_RANGE).toBe(20);
    expect(buildBattleList(players, "me", monsters).filter((e) => e.kind === "monster").map((e) => e.id)).toEqual(["m12"]);
  });
});

describe("battle list: Estagiário (2026-11-01)", () => {
  it("jogador com a rota do Estagiário rodando aparece com 🤖 antes do nome; os outros, como estão", () => {
    const p = (id: string, x: number, bot = false) => ({ id, name: id, x, y: 10, hp: 10, maxHp: 10, bot }) as unknown as PlayerSnap;
    const players = new Map([["me", p("me", 10, true)], ["ana", p("ana", 11, true)], ["bia", p("bia", 12)]]);
    expect(buildBattleList(players, "me", {}).map((e) => e.name)).toEqual(["🤖 ana", "bia"]);
  });
});

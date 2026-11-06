import { describe, expect, it } from "vitest";
import { ARENA_WEEK_PRIZE_CHESTS, ARENA_WEEK_TOP, arenaVersusWinner, arenaWaveBetter, arenaWavesInsert, weekId, type ArenaWaveRecord } from "@lemonquest/shared";
import { KV_ARENA_WAVES_CROWNED, arenaWavesOf, crownArenaWaves, kvArenaWavesWeek, submitArenaWaves, takeArenaPrize } from "./arenaWeekly.ts";

const R = (names: string[], wave: number, ms: number, at = 1, week = "2026-W45"): ArenaWaveRecord => ({ names, wave, ms, week, at });
const kvOf = () => {
  const m = new Map<string, string>();
  return { m, getKv: (k: string) => m.get(k), setKv: (k: string, v: string) => { m.set(k, v); } };
};

describe("regras do Coliseu competitivo", () => {
  it("melhor: mais ondas; empate, menos tempo; empate, quem fez antes", () => {
    expect(arenaWaveBetter(R(["a"], 30, 999), R(["b"], 29, 1))).toBe(true);
    expect(arenaWaveBetter(R(["a"], 30, 100), R(["b"], 30, 200))).toBe(true);
    expect(arenaWaveBetter(R(["a"], 30, 100, 5), R(["b"], 30, 100, 3))).toBe(false);
  });

  it("ranking: um registro por grupo (fica o melhor), ordenado, no máximo o top; sem onda vencida não entra", () => {
    let list: ArenaWaveRecord[] = [];
    list = arenaWavesInsert(list, R(["Ana", "Bia"], 20, 500, 1));
    list = arenaWavesInsert(list, R(["Bia", "Ana"], 18, 100, 2)); // mesmo grupo, pior: fica o 20
    list = arenaWavesInsert(list, R(["Caio"], 25, 900, 3));
    list = arenaWavesInsert(list, R(["Zé"], 0, 0, 4));
    expect(list.map((r) => [r.names.join("+"), r.wave])).toEqual([["Caio", 25], ["Ana+Bia", 20]]);
    for (let i = 0; i < 20; i++) list = arenaWavesInsert(list, R([`p${i}`], 1 + i, 0, 10 + i));
    expect(list).toHaveLength(ARENA_WEEK_TOP);
  });

  it("desafio: mais ondas vence; empate, menos tempo; empate exato = null", () => {
    expect(arenaVersusWinner({ wave: 12, ms: 9 }, { wave: 10, ms: 1 })).toBe(0);
    expect(arenaVersusWinner({ wave: 10, ms: 9 }, { wave: 10, ms: 5 })).toBe(1);
    expect(arenaVersusWinner({ wave: 10, ms: 5 }, { wave: 10, ms: 5 })).toBeNull();
  });
});

describe("ranking semanal e prêmio (kv)", () => {
  it("grava, lê validando e ignora lixo", () => {
    const kv = kvOf();
    expect(submitArenaWaves(kv, R(["Ana"], 12, 300))).toBe(1);
    expect(submitArenaWaves(kv, R(["Bia"], 15, 300, 2))).toBe(1);
    expect(arenaWavesOf(kv, "2026-W45").map((r) => r.names[0])).toEqual(["Bia", "Ana"]);
    kv.setKv(kvArenaWavesWeek("2026-W46"), "{lixo");
    expect(arenaWavesOf(kv, "2026-W46")).toEqual([]);
  });

  it("virada: o 1º da semana anterior ganha os baús uma vez só, entregues no login (take zera)", () => {
    const kv = kvOf();
    const w45 = new Date(2026, 10, 4, 12); // quarta da semana 45
    const w46 = new Date(2026, 10, 11, 12);
    expect(weekId(w45)).toBe("2026-W45");
    // Primeira execução só marca a semana.
    expect(crownArenaWaves(kv, w45)).toBeNull();
    expect(kv.getKv(KV_ARENA_WAVES_CROWNED)).toBe("2026-W45");
    submitArenaWaves(kv, R(["Ana", "Bia"], 40, 300, 1, "2026-W45"));
    submitArenaWaves(kv, R(["Caio"], 22, 300, 2, "2026-W45"));
    const said: string[] = [];
    expect(crownArenaWaves(kv, w46, (t) => said.push(t))!.names).toEqual(["Ana", "Bia"]);
    expect(said[0]).toContain("40 ondas");
    expect(crownArenaWaves(kv, w46)).toBeNull(); // mesma semana: nada de novo
    expect(takeArenaPrize(kv, "ana")).toBe(ARENA_WEEK_PRIZE_CHESTS);
    expect(takeArenaPrize(kv, "Ana")).toBe(0);
    expect(takeArenaPrize(kv, "Caio")).toBe(0);
  });
});

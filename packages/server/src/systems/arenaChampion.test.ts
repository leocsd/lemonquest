import { describe, expect, it } from "vitest";
import { TITLES, isValidUnlockId, type ArenaTimeRecord } from "@lemonquest/shared";
import type { CharacterRecord } from "../persistence/types.ts";
import {
  ARENA_CHAMPION_TITLE, ARENA_CHAMPION_UNLOCK, KV_ARENA_TIME_BEST, arenaTimes, crownArenaWeek, kvArenaTimeWeek, parseArenaTime,
  submitArenaTime, type ArenaChampionHost,
} from "./arenaChampion.ts";

const run = (ms: number, names: string[], week = "2026-W43"): ArenaTimeRecord => ({ ms, names, week, mod: "furia", at: 1 });

function host(kv: Record<string, string> = {}, names: string[] = []) {
  const recs = new Map<string, CharacterRecord>(names.map((n) => [n, { id: 1, accountId: 1, name: n, data: {} } as unknown as CharacterRecord]));
  const log: string[] = [];
  const h: ArenaChampionHost = {
    getKv: (k) => kv[k], setKv: (k, v) => { kv[k] = v; },
    record: (n) => recs.get(n),
    grant: (rec, id) => { (rec.data.unlocks ??= []).push(id); log.push(`+${rec.name}`); },
    revoke: (rec) => log.push(`-${rec.name}`),
    announce: (t) => log.push(t),
  };
  return { h, kv, recs, log };
}

describe("coliseu: ranking de tempo", () => {
  it("o título rotativo existe no catálogo e o desbloqueio é válido", () => {
    expect(TITLES[ARENA_CHAMPION_TITLE]).toBe("Campeão do Coliseu");
    expect(isValidUnlockId(ARENA_CHAMPION_UNLOCK)).toBe(true);
  });

  it("grava o melhor da semana e o de todos; empate e tempo pior não trocam", () => {
    const { h, kv } = host();
    expect(submitArenaTime(h, run(3_000_000, ["Ana"]))).toBe("server");
    expect(submitArenaTime(h, run(3_000_000, ["Beto"]))).toBeUndefined(); // empate: fica quem fez primeiro
    expect(submitArenaTime(h, run(3_500_000, ["Beto"]))).toBeUndefined();
    expect(submitArenaTime(h, run(2_800_000, ["Beto", "Caio"]))).toBe("server");
    // Semana nova: o primeiro tempo é o melhor da semana mesmo pior que o recorde.
    expect(submitArenaTime(h, run(3_200_000, ["Duda"], "2026-W44"))).toBe("week");
    expect(arenaTimes(h, "2026-W43")).toMatchObject({ best: { ms: 2_800_000, names: ["Beto", "Caio"] }, record: { ms: 2_800_000 } });
    expect(arenaTimes(h, "2026-W44")).toMatchObject({ best: { ms: 3_200_000, names: ["Duda"] }, record: { names: ["Beto", "Caio"] } });
    expect(arenaTimes(h, "2026-W45")).toEqual({ record: expect.objectContaining({ ms: 2_800_000 }) });
    expect(Object.keys(kv).sort()).toEqual([KV_ARENA_TIME_BEST, kvArenaTimeWeek("2026-W43"), kvArenaTimeWeek("2026-W44")].sort());
  });

  it("registro do kv é validado (lixo vira null; modificador desconhecido vira o da semana)", () => {
    expect(parseArenaTime(undefined)).toBeNull();
    expect(parseArenaTime("{")).toBeNull();
    expect(parseArenaTime(JSON.stringify({ ms: -5, names: [], week: "x" }))).toBeNull();
    expect(parseArenaTime(JSON.stringify({ ms: 1000.4, names: ["A", 3], week: "2026-W43", mod: "xyz" })))
      .toEqual({ ms: 1000, names: ["A"], week: "2026-W43", mod: "calmaria", at: 0 });
  });
});

describe("coliseu: Campeão do Coliseu (título rotativo)", () => {
  it("primeira execução só marca a semana", () => {
    const { h, kv, log } = host();
    expect(crownArenaWeek(h, new Date(2026, 9, 22))).toEqual([]);
    expect(kv["arena.champion.id"]).toBe("2026-W43");
    expect(log).toEqual([]);
  });

  it("na virada coroa o grupo do melhor tempo da semana que acabou, revoga quem não repetiu e não repete na mesma semana", () => {
    const { h, kv, recs, log } = host({ "arena.champion.id": "2026-W43", "arena.champion.names": JSON.stringify(["Ana", "Zé"]) }, ["Ana", "Beto", "Zé"]);
    recs.get("Zé")!.data.unlocks = [ARENA_CHAMPION_UNLOCK];
    recs.get("Zé")!.data.ach = { done: {}, stats: {}, killed: [], title: ARENA_CHAMPION_TITLE } as never;
    submitArenaTime(h, run(2_700_000, ["Ana", "Beto"]));
    const monday = new Date(2026, 9, 26, 0, 1); // segunda da W44
    expect(crownArenaWeek(h, monday)).toEqual(["Ana", "Beto"]);
    expect(recs.get("Beto")!.data.unlocks).toEqual([ARENA_CHAMPION_UNLOCK]);
    expect(recs.get("Zé")!.data.unlocks).toEqual([]);
    expect(recs.get("Zé")!.data.ach!.title).toBeUndefined();
    expect(log.filter((l) => /^[+-]/.test(l))).toEqual(["-Zé", "+Ana", "+Beto"]);
    expect(log.at(-1)).toBe("🏟️ Campeões do Coliseu da semana 2026-W43: Ana e Beto — 70 ondas em 45:00 (🔥 Fúria). Título \"Campeão do Coliseu\" até a próxima segunda.");
    expect(kv["arena.champion.id"]).toBe("2026-W44");
    expect(JSON.parse(kv["arena.champion.names"]!)).toEqual(["Ana", "Beto"]);
    expect(crownArenaWeek(h, new Date(2026, 9, 28))).toBeNull();
  });

  it("semana sem ninguém completar: os campeões anteriores perdem o título e não há anúncio", () => {
    const { h, recs, log } = host({ "arena.champion.id": "2026-W43", "arena.champion.names": JSON.stringify(["Ana"]) }, ["Ana"]);
    recs.get("Ana")!.data.unlocks = [ARENA_CHAMPION_UNLOCK];
    expect(crownArenaWeek(h, new Date(2026, 9, 26))).toEqual([]);
    expect(recs.get("Ana")!.data.unlocks).toEqual([]);
    expect(log).toEqual(["-Ana"]);
  });
});

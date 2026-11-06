import { describe, expect, it } from "vitest";
import {
  BOUNTY_CHEST_ID, S2C, eventDef, raceDraw, racePoints, raceWinners, toActive,
  type ItemInstance, type RaceMsg,
} from "@lemonquest/shared";
import type { PlayerState } from "../state.ts";
import { HuntRaceSystem } from "./huntRace.ts";
import type { Monster } from "./monsters.ts";
import { def, openGrid, player, world } from "./testkit.ts";

const EV = eventDef("corrida_de_caca")!;

describe("dados da Corrida de Caça", () => {
  it("evento da segunda 18h–18h30 na Agenda", () => {
    expect([EV.day, EV.hour, EV.durationMin, EV.race]).toEqual([1, 18, 30, true]);
  });

  it("pontos pelo level do bicho; elite ×3, nomeado ×10, chefe 50", () => {
    expect([racePoints({ level: 4 }), racePoints({ level: 20 }), racePoints({ level: 120 })]).toEqual([1, 2, 12]);
    expect(racePoints({ level: 100 }, { elite: true })).toBe(30);
    expect(racePoints({ level: 100 }, { elite: true, named: "Belzor" })).toBe(100);
    expect(racePoints({ level: 40, boss: true })).toBe(50);
  });

  it("sorteio equilibra a soma dos levels (o mais alto puxa os mais baixos para o outro time)", () => {
    const t = raceDraw([{ name: "A", level: 150 }, { name: "B", level: 80 }, { name: "C", level: 60 }, { name: "D", level: 20 }]);
    expect(t.get("A")).not.toBe(t.get("B"));
    const sum = (team: string) => [["A", 150], ["B", 80], ["C", 60], ["D", 20]].filter(([n]) => t.get(n as string) === team).reduce((s, [, l]) => s + (l as number), 0);
    expect(Math.abs(sum("limao") - sum("laranja"))).toBeLessThanOrEqual(40);
  });

  it("vencedores: o maior placar, os dois no empate, nenhum sem pontos", () => {
    expect(raceWinners({ limao: 10, laranja: 4 })).toEqual(["limao"]);
    expect(raceWinners({ limao: 3, laranja: 3 })).toEqual(["limao", "laranja"]);
    expect(raceWinners({ limao: 0, laranja: 0 })).toEqual([]);
  });
});

function setup() {
  const w = world({ grid: openGrid(40, 20), spawns: [], eliteChance: 0 });
  const got: { name: string; count: number; defId: string }[] = [];
  const wins: string[] = [];
  const race = new HuntRaceSystem({
    players: () => w.players.values(), getPlayer: (id) => w.players.get(id),
    send: (to, type, msg) => w.sent.push({ to, type, msg }),
    broadcast: (type, msg) => w.sent.push({ to: "*", type, msg }),
    inventory: { addItem: (p: PlayerState, it: ItemInstance) => { got.push({ name: p.name, count: it.count, defId: it.defId }); return 0; } },
    onWin: (p) => wins.push(p.name),
    now: w.now,
  });
  /** Monstro morto com crédito para `ids` (damageBy), no tile (5,5). */
  const kill = (ids: string[], o: Partial<Monster> = {}, level = 40) => {
    const m = { s: { x: 5, y: 5, ownerId: "" }, def: def({ level }), damageBy: new Map(ids.map((id) => [id, 10])), ...o } as unknown as Monster;
    race.onMonsterKilled(m);
  };
  const last = (to: string) => w.sent.filter((s) => s.to === to && s.type === S2C.Race).at(-1)?.msg as RaceMsg | undefined;
  return { w, race, got, wins, kill, last };
}

describe("HuntRaceSystem", () => {
  it("sorteia quem está online, pontua o time de quem tem crédito e premia quem pontuou no time vencedor", () => {
    const { w, race, got, wins, kill, last } = setup();
    const a = w.add(player("a", 5, 6, { level: 100 }));
    const b = w.add(player("b", 6, 5, { level: 90 }));
    const c = w.add(player("c", 4, 5, { level: 10 }));
    const ev = toActive(EV, w.now() + 30 * 60_000);
    expect(race.start(ev)).toBe(true);
    expect(race.teamOf("a")).not.toBe(race.teamOf("b"));
    const ta = race.teamOf("a")!;
    kill([a.id]); // 4 pontos para o time do a
    kill([b.id, c.id], {}, 20); // 2 pontos divididos entre b e c
    expect(race.points![ta]).toBe(4);
    race.tick(w.now());
    expect(last(a.id)!.active!.points[ta]).toBe(4);
    race.end(ev);
    expect(race.active).toBe(false);
    // Só quem pontuou no time vencedor (o do a) ganha; b, no time que perdeu, não.
    expect(got.some((g) => g.name === "a" && g.defId === BOUNTY_CHEST_ID && g.count === 1)).toBe(true);
    expect(got.some((g) => g.name === "b")).toBe(false);
    expect(wins).toContain("a");
    expect(last(b.id)!.result!.winners).toEqual([ta]);
  });

  it("quem entra no meio cai no time mais leve; Coliseu, invocação e ajudante não pontuam", () => {
    const { w, race, kill } = setup();
    w.add(player("forte", 5, 6, { level: 150 }));
    race.start(toActive(EV, w.now() + 30 * 60_000));
    const novo = w.add(player("novo", 6, 5, { level: 30 }));
    race.onJoin(novo);
    expect(race.teamOf("novo")).not.toBe(race.teamOf("forte"));
    kill([novo.id], { arenaId: 1 } as Partial<Monster>);
    kill([novo.id], { minionOf: "m1" } as Partial<Monster>);
    expect(race.points).toEqual({ limao: 0, laranja: 0 });
  });

  it("evento sem corrida não começa; a mesma ocorrência não começa duas vezes", () => {
    const { w, race } = setup();
    expect(race.start(toActive(eventDef("sextou")!, w.now() + 60_000))).toBe(false);
    const ev = toActive(EV, w.now() + 60_000);
    expect(race.start(ev)).toBe(true);
    race.end(ev);
    expect(race.start(ev)).toBe(false);
  });
});

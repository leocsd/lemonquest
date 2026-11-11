import { describe, expect, it } from "vitest";
import { TrainWandSystem, TRAIN_STEP_CAP_MS } from "./trainwand.ts";

describe("TrainWandSystem", () => {
  it("multiplica tentativas enquanto houver carga, e some quando a carga zera", () => {
    const t = new TrainWandSystem();
    let now = 0;
    expect(t.mult("p1", "melee")).toBe(1); // sem varinha ativa
    t.apply("p1", "melee", 50, 1, now); // 1h de carga (3_600_000 ms), +50%
    expect(t.mult("p1", "melee")).toBe(1.5);
    // bate repetidamente, 2 s de cada vez (dentro do teto): carga dura ~1 800 golpes.
    for (let i = 0; i < 1799; i++) { now += 2000; t.consume("p1", "melee", now); }
    expect(t.mult("p1", "melee")).toBe(1.5); // ainda não zerou
    now += 2000;
    t.consume("p1", "melee", now);
    expect(t.mult("p1", "melee")).toBe(1); // zerou, boost removido
  });

  it("parado (sem bater) não gasta carga: só desconta o tempo entre tentativas, com teto", () => {
    const t = new TrainWandSystem();
    t.apply("p1", "shield", 50, 1, 0);
    t.consume("p1", "shield", 10 * 60_000); // 10 min parado antes do 1º golpe: só conta até o teto
    expect(t.mult("p1", "shield")).toBe(1.5); // quase 1h inteira ainda intacta (só o teto foi descontado)
    const left = t.condition("p1").find((c) => c.id === "trainShield")!.value!;
    expect(left).toBeGreaterThan(59);
  });

  it("não rebaixa um boost mais forte ainda ativo; condition() lista um selo por skill ativa", () => {
    const t = new TrainWandSystem();
    t.apply("p1", "magic", 100, 1, 0);
    t.apply("p1", "magic", 50, 1, 0); // mais fraca: ignora
    expect(t.mult("p1", "magic")).toBe(2);
    t.apply("p1", "distance", 50, 2, 0);
    expect(t.condition("p1")).toEqual([
      { id: "trainDistance", value: 120 },
      { id: "trainMagic", value: 60 },
    ]);
  });

  it("TRAIN_STEP_CAP_MS limita o desconto de uma tentativa isolada", () => {
    expect(TRAIN_STEP_CAP_MS).toBeGreaterThan(0);
  });
});

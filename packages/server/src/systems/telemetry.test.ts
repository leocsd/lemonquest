import { describe, expect, it } from "vitest";
import { PlayTelemetry, SUMMARY_MIN_MS, summarizePlay, vocationReport } from "./telemetry.ts";

const H = 3_600_000;

describe("telemetria de progressão", () => {
  it("conta o tempo no level em que foi jogado e troca de balde ao subir", () => {
    let now = 0;
    const t = new PlayTelemetry(() => now);
    t.onJoin("a", 5, undefined);
    now = 10 * 60_000;
    t.onLevel("a", 6);
    now = 25 * 60_000;
    const d = t.serialize("a", 6)!;
    expect(d.ms).toBe(25 * 60_000);
    expect(d.byLevel["5"]!.ms).toBe(10 * 60_000);
    expect(d.byLevel["6"]!.ms).toBe(15 * 60_000);
  });

  it("serialize com level diferente (comando /level) fecha o tempo no level anterior", () => {
    let now = 0;
    const t = new PlayTelemetry(() => now);
    t.onJoin("a", 10, undefined);
    now = 60_000;
    const d = t.serialize("a", 3)!; // desceu por comando de dev
    expect(d.byLevel["10"]!.ms).toBe(60_000);
    expect(d.byLevel["3"]).toBeUndefined();
    now = 120_000;
    expect(t.serialize("a", 3)!.byLevel["3"]!.ms).toBe(60_000);
  });

  it("mortes, ouro ganho e gasto caem no level atual; valores negativos ou zero são ignorados", () => {
    const t = new PlayTelemetry(() => 0);
    t.onJoin("a", 20, undefined);
    t.onDeath("a"); t.onDeath("a");
    t.onGold("a", 150); t.onGold("a", 0); t.onGold("a", -5);
    t.onSpend("a", 40); t.onSpend("a", -1);
    const b = t.serialize("a", 20)!.byLevel["20"]!;
    expect(b).toEqual({ ms: 0, deaths: 2, goldIn: 150, goldOut: 40 });
  });

  it("continua a partir do que estava salvo e devolve cópia (não compartilha o objeto)", () => {
    let now = 0;
    const t = new PlayTelemetry(() => now);
    const saved = { ms: 5000, byLevel: { "8": { ms: 5000, deaths: 1, goldIn: 10, goldOut: 0 } } };
    t.onJoin("a", 8, saved);
    now = 1000;
    const d = t.serialize("a", 8)!;
    expect(d.ms).toBe(6000);
    expect(d.byLevel["8"]!.ms).toBe(6000);
    expect(saved.byLevel["8"]!.ms).toBe(5000); // o salvo não foi alterado
    d.byLevel["8"]!.deaths = 99;
    expect(t.serialize("a", 8)!.byLevel["8"]!.deaths).toBe(1);
  });

  it("ignora jogador desconhecido e esquece ao sair", () => {
    const t = new PlayTelemetry(() => 0);
    t.onDeath("x"); t.onGold("x", 5);
    expect(t.serialize("x", 1)).toBeUndefined();
    t.onJoin("a", 1, undefined);
    t.removePlayer("a");
    expect(t.serialize("a", 1)).toBeUndefined();
  });

  it("resumo por faixa: horas por level, mortes e ouro líquido por hora; faixa com pouco tempo fica de fora", () => {
    const a = { ms: 0, byLevel: { "10": { ms: H, deaths: 2, goldIn: 5000, goldOut: 1000 }, "11": { ms: H, deaths: 0, goldIn: 3000, goldOut: 0 } } };
    const b = { ms: 0, byLevel: { "12": { ms: 2 * H, deaths: 2, goldIn: 0, goldOut: 8000 }, "50": { ms: SUMMARY_MIN_MS - 1, deaths: 9, goldIn: 0, goldOut: 0 } } };
    const lines = summarizePlay([a, undefined, b]);
    expect(lines).toHaveLength(1);
    // Faixa 10–19: 4 h em 3 levels = 1,33 h/level; 4 mortes / 4 h = 1,0; ouro (8000 − 9000) / 4 h = −250.
    expect(lines[0]).toContain("10–19: 1.33 h/level · 1.0 mortes/h · −250 ouro/h");
    expect(lines[0]).not.toContain("40–59");
  });

  it("resumo sem dados avisa", () => {
    expect(summarizePlay([])[0]).toContain("ainda sem 10 min");
  });
});

describe("telemetria do ciclo 12: abates, XP, dano e resistência", () => {
  it("conta no level atual e sobrevive ao save; save antigo sem os campos vale 0", () => {
    let now = 0;
    const t = new PlayTelemetry(() => now);
    t.onJoin("a", 90, { ms: 0, byLevel: { "90": { ms: 1000, deaths: 1, goldIn: 5, goldOut: 0 } } });
    t.onKill("a"); t.onKill("a");
    t.onXp("a", 8000.7);
    t.onDamage("a", 300, 100);
    t.onDamage("a", 0, 0);
    now = 60_000;
    const d = t.serialize("a", 90)!;
    expect(d.byLevel["90"]).toMatchObject({ deaths: 1, goldIn: 5, kills: 2, xp: 8000, dmg: 300, resisted: 100 });
  });

  it("relatório por vocação e faixa: XP/h, abates/h, dano/h, % resistido e mortes/h; amostra pequena fica de fora", () => {
    const lv = (ms: number, x: Partial<Record<"kills" | "xp" | "dmg" | "resisted" | "deaths", number>>) => ({ ms, goldIn: 0, goldOut: 0, deaths: 0, ...x });
    const lines = vocationReport([
      { vocation: "sorcerer", play: { ms: 2 * H, byLevel: { "100": lv(H, { kills: 60, xp: 600_000, dmg: 300_000, resisted: 100_000, deaths: 2 }), "101": lv(H, { kills: 40, xp: 400_000, dmg: 100_000, resisted: 0 }) } } },
      { vocation: "knight", play: { ms: SUMMARY_MIN_MS - 1, byLevel: { "100": lv(SUMMARY_MIN_MS - 1, { kills: 5 }) } } },
      { vocation: "druid", play: undefined },
    ]);
    expect(lines).toHaveLength(1);
    for (const part of ["sorcerer 100+", "2.0 h (1 pers.)", "500.0 mil XP/h", "50 abates/h", "200.0 mil dano/h", "20% resistido", "1.0 mortes/h"]) {
      expect(lines[0]).toContain(part);
    }
    expect(vocationReport([])).toEqual(["Ainda sem 10 min jogados com a telemetria nova em nenhuma vocação/faixa."]);
  });
});

import { describe, expect, it } from "vitest";
import { MONSTERS, monsterResistances } from "@lemonquest/shared";
import {
  BESTIARY_BANDS, NO_FILTER, bestiaryRows, bestiaryZones, chanceText, damageLabel, elementLines, filterBestiary, progressText, whereText,
} from "./bestiaryLogic.ts";

const defs = Object.values(MONSTERS);

describe("bestiaryRows", () => {
  it("lista só monstros que dão XP e morrem (sem boneco de treino), por level, com chefes incluídos", () => {
    const rows = bestiaryRows(defs, undefined);
    expect(rows.some((r) => r.id === "training_dummy")).toBe(false);
    expect(rows.some((r) => r.id === "rat")).toBe(true);
    expect(rows.some((r) => r.id === "goblin_king" && r.boss)).toBe(true);
    expect(rows.map((r) => r.level)).toEqual([...rows.map((r) => r.level)].sort((a, b) => a - b));
    expect(rows.every((r) => !r.known && r.kills === 0)).toBe(true);
  });

  it("conhecido = ao menos 1 abate; contagem inválida vira 0", () => {
    const rows = bestiaryRows(defs, { rat: 5, wolf: 0, snake: -3, slime: 1.9 });
    const by = (id: string) => rows.find((r) => r.id === id)!;
    expect(by("rat")).toMatchObject({ known: true, kills: 5 });
    expect(by("wolf").known).toBe(false);
    expect(by("snake").kills).toBe(0);
    expect(by("slime")).toMatchObject({ known: true, kills: 1 });
    expect(progressText(rows)).toBe(`2 de ${rows.length} conhecidos`);
  });
});

describe("elementLines (Resiste a / Fraco contra, ciclo 15)", () => {
  it("separa resistências e fraquezas, cada uma da mais forte para a mais fraca", () => {
    // Crânio Flamejante: morto-vivo e de fogo.
    expect(elementLines(monsterResistances(MONSTERS.flame_skull!))).toEqual({ resists: "fogo: metade do dano", weak: "sagrado: +25% · gelo: +15%" });
    expect(elementLines(monsterResistances(MONSTERS.skeleton!))).toEqual({ resists: "", weak: "sagrado: +25%" });
    expect(elementLines(monsterResistances(MONSTERS.frost_dragon!))).toEqual({ resists: "gelo: metade do dano", weak: "fogo: +15%" });
    expect(elementLines(monsterResistances(MONSTERS.rat!))).toEqual({ resists: "", weak: "" });
    expect(elementLines([{ kind: "earth", mult: 0.8 }, { kind: "fire", mult: 0 }])).toEqual({ resists: "fogo: imune · terra: −20%", weak: "" });
  });
});

describe("chanceText / damageLabel", () => {
  it("formata chances e tipos de dano", () => {
    expect(chanceText(1)).toBe("sempre");
    expect(chanceText(0.35)).toBe("35%");
    expect(chanceText(0.025)).toBe("2,5%");
    expect(chanceText(0.01)).toBe("1%");
    expect(damageLabel("fire")).toBe("fogo");
    expect(damageLabel("novo")).toBe("novo");
  });
});

describe("onde vive e filtros (ciclo 17)", () => {
  const zonesOf = (id: string) => (({ rat: ["Floresta Sussurrante"], wolf: ["Floresta Sussurrante", "Estrada"], dragon: ["Vale dos Dragões"] }) as Record<string, string[]>)[id] ?? [];
  const rows = bestiaryRows(defs, { rat: 3, dragon: 1 }, zonesOf);
  const ids = (l: { id: string }[]) => l.map((r) => r.id);

  it("cada linha leva as zonas; sem índice, nenhuma", () => {
    expect(rows.find((r) => r.id === "wolf")!.zones).toEqual(["Floresta Sussurrante", "Estrada"]);
    expect(bestiaryRows(defs, undefined).every((r) => r.zones.length === 0)).toBe(true);
  });

  it("filtra por zona, faixa de level e conhecidos (combinados)", () => {
    expect(filterBestiary(rows, NO_FILTER)).toHaveLength(rows.length);
    expect(ids(filterBestiary(rows, { ...NO_FILTER, zone: "Floresta Sussurrante" }))).toEqual(["rat", "wolf"]);
    expect(ids(filterBestiary(rows, { ...NO_FILTER, zone: "Floresta Sussurrante", seen: "known" }))).toEqual(["rat"]);
    expect(ids(filterBestiary(rows, { ...NO_FILTER, zone: "Floresta Sussurrante", seen: "unknown" }))).toEqual(["wolf"]);
    const band = BESTIARY_BANDS.findIndex((b) => MONSTERS.dragon!.level >= b.min && MONSTERS.dragon!.level <= b.max);
    const inBand = filterBestiary(rows, { ...NO_FILTER, band });
    expect(ids(inBand)).toContain("dragon");
    expect(inBand.every((r) => r.level >= BESTIARY_BANDS[band]!.min && r.level <= BESTIARY_BANDS[band]!.max)).toBe(true);
    expect(filterBestiary(rows, { zone: "Vale dos Dragões", band: 0, seen: "all" })).toEqual([]);
  });

  it("faixas cobrem todo level sem buraco; zonas do filtro da mais fácil para a mais difícil", () => {
    for (let lv = 1; lv <= 200; lv++) expect(BESTIARY_BANDS.filter((b) => lv >= b.min && lv <= b.max), `lv ${lv}`).toHaveLength(1);
    expect(bestiaryZones(rows)).toEqual(["Floresta Sussurrante", "Estrada", "Vale dos Dragões"]);
  });

  it("whereText: lista as zonas ou diz que não nasce solto", () => {
    expect(whereText(["A", "B"])).toBe("A, B");
    expect(whereText([])).toMatch(/não nasce solto/);
  });
});

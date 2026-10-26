/// <reference types="node" />
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BOUNTY_BANDS, MONSTERS, REQUEST_BANDS, buildWorldIndex, npcDef, type TiledMap, type WorldSpawn } from "@lemonquest/shared";
import {
  huntInfo, levelUnlockLines, materialSources, materialSourcesText, monsterZones, nextStepLines, npcWhere, zonesShort, type HuntIndex,
} from "./questInfo.ts";

const root = fileURLToPath(new URL("../../../../../", import.meta.url));

/** Índice de mentira: só o que as funções usam. */
function fakeIndex(spawns: Record<string, WorldSpawn[]>, npcs: Record<string, string> = {}): HuntIndex {
  return {
    spawnsOf: (id) => spawns[id] ?? [],
    npcAt: (id) => (npcs[id] ? { id, x: 0, y: 0, zone: npcs[id] } : undefined),
  };
}

describe("onde fica e quão difícil (ciclo 17)", () => {
  const idx = fakeIndex({
    wolf: [
      { x: 1, y: 1, zone: "Floresta Sussurrante", count: 2 }, { x: 2, y: 2, zone: "Estrada", count: 5 },
      { x: 3, y: 3, zone: "Floresta Sussurrante", count: 1 }, { x: 4, y: 4, count: 9 },
    ],
    rat: [{ x: 1, y: 1, zone: "Floresta Sussurrante", count: 3 }],
  }, { juliao: "Oficina dos Engenhos" });

  it("NPC com a zona; sem índice ou sem zona, só o nome", () => {
    const name = npcDef("juliao")!.name;
    expect(npcWhere(idx, "juliao")).toBe(`${name} · Oficina dos Engenhos`);
    expect(npcWhere(null, "juliao")).toBe(name);
    expect(npcWhere(idx, "guard_captain")).toBe(npcDef("guard_captain")!.name);
  });

  it("zonas do monstro pela quantidade (spawn fora de zona não conta)", () => {
    expect(monsterZones(idx, "wolf")).toEqual(["Estrada", "Floresta Sussurrante"]);
    expect(monsterZones(null, "wolf")).toEqual([]);
    expect(zonesShort(["A"])).toBe("A");
    expect(zonesShort(["A", "B"])).toBe("A e mais 1 lugar");
    expect(zonesShort(["A", "B", "C"])).toBe("A e mais 2 lugares");
    expect(zonesShort([])).toBe("");
  });

  it("huntInfo: onde + level + dificuldade para o jogador", () => {
    const lv = MONSTERS.wolf!.level;
    expect(huntInfo(idx, "rat", 20)).toBe(`Floresta Sussurrante · lv ${MONSTERS.rat!.level}, fraca`);
    expect(huntInfo(idx, "wolf", lv)).toBe(`Estrada e mais 1 lugar · lv ${lv}, normal`);
    expect(huntInfo(null, "wolf", 1)).toBe(`lv ${lv}, perigosa`);
    expect(huntInfo(idx, "nao_existe", 1)).toBe("");
  });

  it("quem solta o material: comuns com spawn, do menor level, com a zona", () => {
    const s = materialSources(idx, "wolf_pelt");
    expect(s.map((x) => x.monster.id)[0]).toBe("wolf");
    expect(s.every((x) => !x.monster.boss && x.zones.length > 0)).toBe(true);
    expect(materialSourcesText(s.slice(0, 1))).toBe(`${MONSTERS.wolf!.name} (Estrada e mais 1 lugar)`);
    expect(materialSources(idx, "nao_existe")).toEqual([]);
  });
});

describe("próximo passo (cartão de missão concluída e banner de level)", () => {
  const captain = npcDef("guard_captain")!.name;
  const idx = { ...fakeIndex({}, { guard_captain: "Vila de Pedra Clara" }), portals: [] as never[] };

  it("missão concluída: o que abriu agora e o que ainda falta (a própria missão conta como concluída)", () => {
    expect(nextStepLines(idx, "rats_barn", { level: 30, done: [] })).toEqual([`Nova missão: Os Lobos da Floresta (${captain} · Vila de Pedra Clara)`]);
    expect(nextStepLines(null, "rats_barn", { level: 3, done: ["rats_barn"] })).toEqual(["Em breve: Os Lobos da Floresta: Requer level 6."]);
    expect(nextStepLines(null, "chegou", { level: 9, done: [] })).toEqual([
      `Nova missão: git caiu? (${npcDef("luan")!.name})`, "Em breve: Bombonas Fugitivas: Requer level 12.",
    ]);
    // Já aceita ou concluída não aparece; fim de corrente, nada.
    expect(nextStepLines(null, "rats_barn", { level: 30, done: [], active: ["forest_wolves"] })).toEqual([]);
    expect(nextStepLines(null, "locomotiva_fantasma", { level: 60, done: [] })).toEqual([]);
  });

  it("banner de level: portas e baús liberados, depois as missões que dá para pegar", () => {
    const portals = [
      { x: 0, y: 0, toX: 0, toY: 0, minLevel: 10, label: "Minas Abandonadas · lv 10+" },
      { x: 0, y: 0, toX: 0, toY: 0, quest: "yeti_hunt", label: "Ninho · missão O Yeti" },
      { x: 0, y: 0, toX: 0, toY: 0, minLevel: 10, quest: "yeti_hunt", label: "Porta com missão · lv 10+" },
    ];
    const withPortals = { ...idx, portals };
    // lv 9 → 10: as Minas; Relatório do Pântano (lv 10) pede os Lobos da Floresta, que ainda não foi feita. Primeiro
    // Turno (Siderúrgica, ciclo 19) abre no 10 sem pré-requisito.
    const turno = `Nova missão: Primeiro Turno (${npcDef("mestre_turno")!.name})`;
    expect(levelUnlockLines(withPortals, 9, 10, { level: 10, done: [] })).toEqual(["Liberado: Minas Abandonadas · lv 10+", turno]);
    expect(levelUnlockLines(withPortals, 9, 10, { level: 10, done: ["forest_wolves"] }))
      .toEqual(["Liberado: Minas Abandonadas · lv 10+", `Nova missão: Relatório do Pântano (${captain})`, turno]);
    // Missão de porta concluída: a porta com level também entra.
    expect(levelUnlockLines(withPortals, 9, 10, { level: 10, done: ["yeti_hunt"] })).toContain("Liberado: Porta com missão · lv 10+");
    // Baú de quest (sem índice também).
    expect(levelUnlockLines(null, 64, 65, { level: 65, done: [] })).toContain("Baú de quest: A Quest dos Heróis (Caverna dos Heróis)");
    // Nada novo: morreu e voltou ao mesmo level.
    expect(levelUnlockLines(withPortals, 10, 10, { level: 10, done: [] })).toEqual([]);
  });
});

describe("conferência com o mapa real: todo alvo do Quadro e da Encomenda tem onde caçar", () => {
  const map = JSON.parse(readFileSync(root + "assets/maps/world.json", "utf8")) as TiledMap;
  const real = buildWorldIndex(map);

  it("monstro de recompensa diária nasce em alguma zona com nome", () => {
    for (const band of BOUNTY_BANDS) for (const m of band.monsters) expect(monsterZones(real, m), m).not.toEqual([]);
  });

  it("material de encomenda cai de algum monstro com zona", () => {
    for (const band of REQUEST_BANDS) for (const it of band.materials) {
      const s = materialSources(real, it);
      expect(s.length, it).toBeGreaterThan(0);
      expect(s.some((x) => x.zones.length > 0), it).toBe(true);
    }
  });
});

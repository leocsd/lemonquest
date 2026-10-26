import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { TiledMap } from "./map.ts";
import { NPCS } from "./data/npcs.ts";
import { buildWorldIndex, portalLabel } from "./worldIndex.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const map = JSON.parse(readFileSync(root + "assets/maps/world.json", "utf8")) as TiledMap;
const t0 = performance.now();
const idx = buildWorldIndex(map);
const buildMs = performance.now() - t0;

describe("índice do mundo (mapa real)", () => {
  it("monta rápido (uma vez no servidor e no cliente)", () => {
    console.log(`[worldIndex] ${map.width}×${map.height} em ${buildMs.toFixed(1)} ms`);
    expect(buildMs).toBeLessThan(1500);
  });

  it("zonas: agrupa retângulos pelo nome e a menor área vence (Vila dentro da Floresta)", () => {
    expect(idx.zones.find((z) => z.name === "Floresta Sussurrante")!.rects.length).toBeGreaterThanOrEqual(2);
    const cap = idx.npcAt("guard_captain")!;
    expect(cap.zone).toBe("Vila de Pedra Clara");
    expect(idx.zoneAt(cap.x, cap.y)).toBe("Vila de Pedra Clara");
    expect(idx.zoneAt(17, 504)).toBe("Minas Abandonadas");
    expect(idx.zoneAt(0, 0)).toBeUndefined();
  });

  it("faixa de level por zona: monstros não-chefe; zona sem monstro (Vila) não tem faixa", () => {
    const forest = idx.zoneLevels("Floresta Sussurrante")!;
    expect(forest.min).toBe(1);
    expect(forest.max).toBeLessThanOrEqual(12);
    // A porta das Minas pede lv 10: nada lá dentro é mais fraco que isso.
    expect(idx.zoneLevels("Minas Abandonadas")!.min).toBeGreaterThanOrEqual(10);
    expect(idx.zoneLevels("Vila de Pedra Clara")).toBeUndefined();
    expect(idx.zoneLevels("Centro de Treinamento")).toBeUndefined(); // bonecos de treino não contam
    expect(buildWorldIndex(map, { isBoss: () => true }).zoneLevels("Floresta Sussurrante")).toBeUndefined();
  });

  it("faixa em volta de um destino de viagem (vila protegida não tem monstro, a região em volta tem)", () => {
    const dest = (npc: string, id: string) => NPCS[npc]!.travel!.find((d) => d.id === id)!;
    const vila = dest("coach_frontier", "village"), fronteira = dest("coach_village", "frontier");
    const oficina = dest("coach_village", "oficina"), malha = dest("chefe_estacao_vila", "malha");
    expect(idx.levelsNear(vila.x, vila.y)!.min).toBe(1);
    expect(idx.levelsNear(fronteira.x, fronteira.y)!.min).toBeGreaterThanOrEqual(40);
    expect(idx.levelsNear(malha.x, malha.y)!.min).toBeGreaterThanOrEqual(25);
    expect(idx.levelsNear(oficina.x, oficina.y)).toBeUndefined(); // Oficina dos Engenhos: só escritório, sem monstro
  });

  it("spawns por monstro, com zona e quantidade", () => {
    const rats = idx.spawnsOf("rat");
    expect(rats.length).toBeGreaterThan(0);
    expect(rats.some((s) => s.zone === "Floresta Sussurrante" && s.count >= 1)).toBe(true);
    expect(idx.spawnsOf("nao_existe")).toEqual([]);
  });

  it("todo NPC do mapa está no catálogo e toda viagem chega numa região andável", () => {
    for (const n of idx.npcs) expect(NPCS[n.id], n.id).toBeDefined();
    for (const n of idx.npcs) for (const d of NPCS[n.id]!.travel ?? []) expect(idx.componentAt(d.x, d.y), `${n.id} → ${d.id}`).toBeGreaterThan(0);
  });

  it("rótulo de portal: zona do destino + requisito da porta", () => {
    const minas = idx.portalAt(89, 74)!;
    expect(minas).toMatchObject({ toX: 17, toY: 504, minLevel: 10, label: "Minas Abandonadas · lv 10+" });
    expect(idx.portalAt(17, 501)!.label).toBe("Floresta Sussurrante"); // volta, sem requisito
    const yeti = idx.portals.find((p) => p.quest)!;
    expect(yeti.label).toMatch(/ · missão /);
    expect(portalLabel(undefined, undefined)).toBe("Passagem");
    for (const p of idx.portals) {
      expect(idx.componentAt(p.x, p.y), `portal ${p.x},${p.y}`).toBeGreaterThan(0);
      expect(idx.componentAt(p.toX, p.toY), `destino ${p.toX},${p.toY}`).toBeGreaterThan(0);
    }
  });

  it("nextHop: da Vila até uma cave aponta a porta; de dentro da cave, a saída; mesmo lugar ou Coliseu: null", () => {
    const cap = idx.npcAt("guard_captain")!;
    expect(idx.nextHop(cap, { x: 17, y: 510 })).toMatchObject({ x: 89, y: 74, kind: "portal", label: "Minas Abandonadas · lv 10+" });
    expect(idx.nextHop({ x: 17, y: 504 }, cap)).toMatchObject({ x: 17, y: 501, kind: "portal" });
    expect(idx.nextHop(cap, idx.npcAt("priest")!)).toBeNull();
    // O Coliseu só se alcança pelo mestre da arena (sem portal no mapa).
    expect(idx.nextHop(cap, { x: 28, y: 220 })).toBeNull();
    expect(idx.travelCost(cap, { x: 28, y: 220 })).toBe(Infinity);
  });

  it("nextHop: viagem encurta estrada longa (Vila → Porto de carroça) e a região só de trem (Malha)", () => {
    const cap = idx.npcAt("guard_captain")!;
    const coach = idx.npcAt("coach_village")!;
    expect(idx.nextHop(cap, { x: 372, y: 64 })).toMatchObject({ x: coach.x, y: coach.y, kind: "travel" });
    const malha = idx.nextHop(cap, { x: 60, y: 374 })!;
    expect(malha).not.toBeNull();
    expect(idx.componentAt(malha.x, malha.y)).toBe(idx.componentAt(cap.x, cap.y));
    expect(idx.travelCost(cap, { x: 60, y: 374 })).toBeLessThan(idx.travelCost(cap, { x: 17, y: 510 }) + 200);
  });
});

describe("índice do mundo (mapa sintético)", () => {
  // Corredor de 7 tiles (y=1) com um portal no meio (3,1) → (5,1): o tile do portal é parede para o "a pé".
  const W = 7, H = 3;
  const collision = Array.from({ length: W * H }, (_, i) => (Math.floor(i / W) === 1 ? 0 : 1));
  const tiny: TiledMap = {
    width: W, height: H, tilewidth: 16, tileheight: 16, tilesets: [],
    layers: [
      { name: "collision", type: "tilelayer", width: W, height: H, data: collision },
      { name: "objects", type: "objectgroup", objects: [
        { id: 1, name: "portal", type: "portal", x: 3 * 16, y: 16, width: 0, height: 0, properties: [{ name: "toX", type: "int", value: 5 }, { name: "toY", type: "int", value: 1 }, { name: "minLevel", type: "int", value: 7 }] },
        { id: 2, name: "Leste", type: "zone", x: 4 * 16, y: 0, width: 3 * 16, height: 3 * 16 },
      ] },
    ],
  };
  const w = buildWorldIndex(tiny);

  it("portal no corredor separa as regiões e só leva num sentido", () => {
    expect(w.componentAt(0, 1)).not.toBe(w.componentAt(6, 1));
    expect([w.componentAt(2, 1), w.componentAt(4, 1)]).toContain(w.componentAt(3, 1)); // o tile do portal fica com um dos lados
    expect(w.nextHop({ x: 0, y: 1 }, { x: 6, y: 1 })).toEqual({ x: 3, y: 1, label: "Leste · lv 7+", kind: "portal" });
    expect(w.nextHop({ x: 6, y: 1 }, { x: 0, y: 1 })).toBeNull();
    expect(w.travelCost({ x: 6, y: 1 }, { x: 0, y: 1 })).toBe(Infinity);
  });
});

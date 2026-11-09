/// <reference types="node" />
// Portas de sala (ciclo 22, tools/mapgen/doors22.mjs) conferidas contra o mapa real: cada porta numa parede entre duas
// regiões, sem portal "entrar na sala + sair ao lado" sobrando, viagem só pelos NPCs e a rota do índice pela porta.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CollisionGrid, findObjects, objectTile, type TiledMap } from "../map.ts";
import { buildWorldIndex } from "../worldIndex.ts";
import { doorSides, findDoors, isGatedDoor } from "./doors.ts";
import { NPCS } from "./npcs.ts";
import { QUESTS } from "./quests.ts";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const map = JSON.parse(readFileSync(root + "assets/maps/world.json", "utf8")) as TiledMap;
const grid = CollisionGrid.fromTiled(map);
const index = buildWorldIndex(map);
const doors = findDoors(map);
const cheb = (ax: number, ay: number, bx: number, by: number) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));

describe("findDoors e doorSides (puros)", () => {
  const tiny: TiledMap = {
    width: 3, height: 3, tilewidth: 16, tileheight: 16, tilesets: [],
    layers: [
      { name: "collision", type: "tilelayer", data: [1, 0, 1, 1, 1, 1, 1, 0, 1] },
      { name: "objects", type: "objectgroup", objects: [
        { id: 1, name: "a", type: "door", x: 16, y: 16, width: 0, height: 0, properties: [{ name: "doorId", value: "a" }, { name: "minLevel", value: 30 }, { name: "style", value: "grade" }] },
        { id: 2, name: "b", type: "door", x: 0, y: 0, width: 0, height: 0, properties: [{ name: "doorId", value: "a" }] }, // id repetido: ignorado
      ] },
    ],
  } as unknown as TiledMap;

  it("lê id, tile, estilo e requisito; id repetido conta uma vez", () => {
    expect(findDoors(tiny)).toEqual([{ id: "a", x: 1, y: 1, style: "grade", req: { minLevel: 30 } }]);
  });

  it("a porta começa fechada na colisão; os lados são os vizinhos ortogonais andáveis", () => {
    const g = CollisionGrid.fromTiled(tiny);
    expect(g.isWalkable(1, 1)).toBe(false);
    expect(doorSides({ x: 1, y: 1 }, (x, y) => g.isWalkable(x, y))).toEqual([{ x: 1, y: 0 }, { x: 1, y: 2 }]);
    g.setWalkable(1, 1, true);
    expect(g.isWalkable(1, 1)).toBe(true);
  });
});

describe("portas no mapa real", () => {
  it("20 portas; cada uma numa parede, com dois lados em regiões diferentes a pé", () => {
    expect(doors).toHaveLength(20);
    expect(new Set(doors.map((d) => d.id)).size).toBe(20);
    for (const d of doors) {
      expect(grid.isWalkable(d.x, d.y), d.id).toBe(false);
      const sides = doorSides(d, (x, y) => grid.isWalkable(x, y));
      expect(sides, d.id).toHaveLength(2);
      expect(index.componentAt(sides[0]!.x, sides[0]!.y), d.id).not.toBe(index.componentAt(sides[1]!.x, sides[1]!.y));
      expect(index.doorAt(d.x, d.y)?.zone, d.id).toBeDefined();
      if (d.req?.quest) expect(QUESTS[d.req.quest], d.id).toBeDefined();
    }
    // Duas portas comuns (salas de recompensa), o resto com level ou missão.
    expect(doors.filter((d) => !isGatedDoor(d)).map((d) => d.id).sort()).toEqual(["aniquilacao_tesouro", "mt_boxe"]);
    expect(index.doorAt(335, 219)?.label).toBe("Ninho dos Dragões de Gelo · missão O Yeti");
  });

  it("nenhum portal sobra com o destino colado (o par 'entra na sala + sai ao lado'): o que ficou leva para longe", () => {
    for (const p of index.portals) expect(cheb(p.x, p.y, p.toX, p.toY), `portal ${p.x},${p.y}`).toBeGreaterThan(20);
    const portals = findObjects(map, "portal").map((o) => objectTile(o, map.tilewidth));
    for (const d of doors) for (const p of portals) expect(cheb(p.x, p.y, d.x, d.y), `portal ${p.x},${p.y} perto da porta ${d.id}`).toBeGreaterThan(3);
  });

  it("viagem só nos NPCs: sem os portais Vila↔Oficina, Vila↔Malha, Malha→Minério e Oficina→Montadora", () => {
    for (const [x, y] of [[99, 79], [63, 321], [99, 104], [44, 371], [46, 384], [8, 591], [83, 332], [219, 776]] as const) {
      expect(index.portalAt(x, y), `${x},${y}`).toBeUndefined();
    }
    // Cada região que perdeu o portal continua ligada à Vila por viagem, nos dois sentidos.
    const vila = { x: 97, y: 98 };
    for (const npc of ["coach_oficina", "chefe_estacao_malha", "chefe_estacao_minerio", "mt_motorista"]) {
      const n = index.npcAt(npc)!;
      expect(Number.isFinite(index.travelCost(vila, n)), `Vila → ${npc}`).toBe(true);
      expect(Number.isFinite(index.travelCost(n, vila)), `${npc} → Vila`).toBe(true);
      expect(index.nextHop(n, vila)?.kind, `${npc} → Vila`).toBe("travel");
    }
  });

  it("as chegadas de viagem do gerador (TRAVEL_HUBS de doors22.mjs) são as do catálogo de NPCs", () => {
    const src = readFileSync(root + "tools/mapgen/doors22.mjs", "utf8");
    const hubs = JSON.parse(/export const TRAVEL_HUBS = (\[.*\]);/.exec(src)![1]!) as [number, number][];
    const dests = new Set(Object.values(NPCS).flatMap((n) => n.travel ?? []).map((t) => `${t.x},${t.y}`));
    expect(new Set(hubs.map(([x, y]) => `${x},${y}`))).toEqual(dests);
  });

  it("rota pela porta: de dentro da sala o próximo passo é a porta; quem não abre não tem caminho", () => {
    const heroes = { x: 291, y: 252 }, out = { x: 291, y: 238 };
    expect(index.nextHop(heroes, out)).toMatchObject({ kind: "door", x: 291, y: 242, label: "Caverna dos Heróis · lv 60+" });
    expect(index.nextHop(out, heroes)).toMatchObject({ kind: "door", x: 291, y: 242 });
    expect(Number.isFinite(index.travelCost(out, heroes, (p) => (p.minLevel ?? 0) <= 59))).toBe(false);
    expect(Number.isFinite(index.travelCost(out, heroes, (p) => (p.minLevel ?? 0) <= 60))).toBe(true);
  });
});

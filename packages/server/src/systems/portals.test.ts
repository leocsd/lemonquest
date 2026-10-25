import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { CollisionGrid, Dir, QUESTS, type TiledMap } from "@lemonquest/shared";
import type { PlayerState } from "../state.ts";
import { MovementSystem } from "./movement.ts";
import { PORTAL_COOLDOWN_MS, PortalSystem } from "./portals.ts";

const tiled = (portals: [number, number, number, number][]) => ({
  tilewidth: 16,
  layers: [{ type: "objectgroup", name: "objects", objects: portals.map(([x, y, toX, toY], i) => ({
    id: i, name: "portal", type: "portal", x: x * 16, y: y * 16, width: 16, height: 16,
    properties: [{ name: "toX", type: "int", value: toX }, { name: "toY", type: "int", value: toY }],
  })) }],
}) as unknown as TiledMap;

const player = (x: number, y: number) => ({ id: "a", x, y, dir: Dir.S, stepMs: 0, level: 1, seq: 0 }) as unknown as PlayerState;

function setup(portals: [number, number, number, number][]) {
  let clock = 1000;
  const g = new CollisionGrid(20, 20, new Uint8Array(400));
  const mv = new MovementSystem(g, { now: () => clock });
  const sent: unknown[] = [];
  const sys = new PortalSystem(tiled(portals), mv, (_id, m) => sent.push(m), () => clock);
  const p = player(1, 1);
  mv.addPlayer(p);
  return { sys, p, sent, setClock: (t: number) => { clock = t; } };
}

describe("PortalSystem", () => {
  it("teleports on arrival and notifies", () => {
    const { sys, p, sent } = setup([[5, 5, 15, 15], [15, 15, 5, 5]]);
    sys.check(p);
    p.x = 5; p.y = 5; sys.check(p);
    expect([p.x, p.y]).toEqual([15, 15]);
    expect(sent).toEqual([{ x: 15, y: 15 }]);
    expect(sys.isPortalTile(5, 5)).toBe(true);
    expect(sys.isPortalTile(6, 5)).toBe(false);
  });

  it("does not ping-pong, and cooldown expires", () => {
    const { sys, p, setClock } = setup([[5, 5, 15, 15], [15, 15, 5, 5]]);
    sys.check(p);
    p.x = 5; p.y = 5; sys.check(p);
    sys.check(p); sys.check(p);
    expect([p.x, p.y]).toEqual([15, 15]);
    p.x = 14; sys.check(p); p.x = 15; sys.check(p); // de volta ao portal dentro da espera: não teleporta, volta ao tile anterior
    expect([p.x, p.y]).toEqual([14, 15]);
    setClock(1000 + PORTAL_COOLDOWN_MS + 1);
    p.x = 14; sys.check(p); p.x = 15; sys.check(p);
    expect([p.x, p.y]).toEqual([5, 5]);
  });

  it("portal sem requisito dentro da espera devolve ao tile anterior: ninguém fica parado em cima dele (saída do Vulcão, ciclo 14)", () => {
    // Saída (7,5)→(7,4) ao lado de uma área fechada: parado no portal, o passo seguinte entrava na área (7,6).
    const { sys, p, sent } = setup([[7, 5, 7, 4]]);
    p.x = 7; p.y = 4; sys.check(p);
    p.y = 5; sys.check(p);
    expect([p.x, p.y]).toEqual([7, 4]); // atravessou: espera armada
    p.y = 5; sys.check(p);
    expect([p.x, p.y]).toEqual([7, 4]); // dentro da espera: devolvido, não fica no portal
    expect(sent).toEqual([{ x: 7, y: 4 }, { x: 7, y: 4 }]);
  });

  it("porta de quest: quem não cumpre volta para o tile de onde veio; quem cumpre passa", () => {
    let clock = 1000;
    const g = new CollisionGrid(20, 20, new Uint8Array(400));
    const mv = new MovementSystem(g, { now: () => clock });
    const map = tiled([[5, 5, 15, 15]]);
    map.layers[0]!.objects![0]!.properties!.push({ name: "minLevel", type: "int", value: 30 });
    const sent: unknown[] = [], refused: string[] = [];
    const sys = new PortalSystem(map, mv, (_id, m) => sent.push(m), () => clock, undefined,
      (pl, req) => (pl.level < (req.minLevel ?? 0) ? `level ${req.minLevel}` : null), (_pl, t) => refused.push(t));
    expect(sys.requirement(5, 5)).toEqual({ minLevel: 30 });
    const p = player(4, 5);
    mv.addPlayer(p);
    sys.check(p);
    p.x = 5; sys.check(p);
    expect([p.x, p.y]).toEqual([4, 5]);
    expect(refused).toEqual(["level 30"]);
    expect(sent).toEqual([{ x: 4, y: 5 }]);
    clock += PORTAL_COOLDOWN_MS + 1;
    p.level = 30;
    p.x = 5; sys.check(p);
    expect([p.x, p.y]).toEqual([15, 15]);
  });

  it("porta com level: pisar de novo dentro da espera de 1 s também volta (antes, ficava parado na porta e atravessava)", () => {
    let clock = 1000;
    const g = new CollisionGrid(20, 20, new Uint8Array(400));
    const mv = new MovementSystem(g, { now: () => clock });
    const map = tiled([[5, 5, 15, 15]]);
    map.layers[0]!.objects![0]!.properties!.push({ name: "minLevel", type: "int", value: 80 });
    const sent: unknown[] = [], refused: string[] = [];
    const sys = new PortalSystem(map, mv, (_id, m) => sent.push(m), () => clock, undefined,
      (pl, req) => (pl.level < (req.minLevel ?? 0) ? `level ${req.minLevel}` : null), (_pl, t) => refused.push(t));
    const p = player(4, 5);
    p.level = 79;
    mv.addPlayer(p);
    sys.check(p);
    // 1ª pisada, 2ª no mesmo instante (dentro da espera) e 3ª depois dela: sempre de volta ao tile anterior.
    for (const dt of [0, 100, PORTAL_COOLDOWN_MS + 1]) {
      clock += dt;
      p.x = 5; sys.check(p);
      expect([p.x, p.y]).toEqual([4, 5]);
      sys.check(p); // tique seguinte, parado no tile anterior
      expect([p.x, p.y]).toEqual([4, 5]);
    }
    expect(refused).toEqual(["level 80", "level 80", "level 80"]);
    expect(sent).toEqual([{ x: 4, y: 5 }, { x: 4, y: 5 }, { x: 4, y: 5 }]);
    // Ao chegar no level passa, mesmo dentro da espera de 1 s depois da última recusa (recusa não liga a espera).
    p.level = 80;
    p.x = 5; sys.check(p);
    expect([p.x, p.y]).toEqual([15, 15]);
  });

  it("world map portals have walkable, non-portal targets", () => {
    const m = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "../../../../assets/maps/world.json"), "utf8")) as TiledMap;
    const grid = CollisionGrid.fromTiled(m);
    const sys = new PortalSystem(m, { teleport() {} }, () => {});
    const objs = m.layers.find((l) => l.name === "objects")!.objects!.filter((o) => o.type === "portal");
    expect(objs.length).toBeGreaterThan(0);
    for (const o of objs) {
      const g = (n: string) => Number(o.properties!.find((x) => x.name === n)!.value);
      expect(grid.isWalkable(g("toX"), g("toY"))).toBe(true);
      expect(sys.isPortalTile(g("toX"), g("toY"))).toBe(false);
    }
    // portas de quest: requisitos válidos (missão existe; level razoável)
    const doors = objs.filter((o) => sys.requirement(o.x / 16, o.y / 16));
    expect(doors.length).toBeGreaterThanOrEqual(6);
    for (const o of doors) {
      const req = sys.requirement(o.x / 16, o.y / 16)!;
      if (req.quest) expect(QUESTS[req.quest], req.quest).toBeDefined();
      if (req.minLevel) expect(req.minLevel).toBeGreaterThan(1);
    }
  });
});

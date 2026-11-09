// Siderúrgica (ciclo 19, docs/regioes/siderurgica.md; mapa em tools/mapgen/expansion6.mjs): o world.json publicado tem a
// região inteira — geometria, zonas com faixa, portas de level em cadeia, spawns na faixa, atalho da Malha e os NPCs nos
// tiles combinados com as frentes B e C. As validações de desenho (vedação dos setores, alcance, folgas) ficam no gerador.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { zoneLightMode } from "../daynight.ts";
import { CollisionGrid, canStepTerrain, findObjects, mapSpawn, objectTile, type TiledMap, type TiledObject } from "../map.ts";
import { buildWorldIndex } from "../worldIndex.ts";
import { MONSTERS } from "./monsters.ts";
import { NPCS, NPC_RANGE } from "./npcs.ts";
import { doorSides, findDoors } from "./doors.ts";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const map = JSON.parse(readFileSync(root + "assets/maps/world.json", "utf8")) as TiledMap;
const grid = CollisionGrid.fromTiled(map);
const index = buildWorldIndex(map);
const prop = (o: TiledObject | undefined, name: string) => o?.properties?.find((p) => p.name === name)?.value;
const cheb = (ax: number, ay: number, bx: number, by: number) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
const tile = (o: TiledObject) => objectTile(o, map.tilewidth);
const portalAt = (x: number, y: number) => findObjects(map, "portal").find((o) => { const t = tile(o); return t.x === x && t.y === y; });

/** Zonas da região, como na especificação §1.7 (tiles): [nome, x, y, w, h, pz, faixa]. */
const ZONES: [string, number, number, number, number, boolean, string | undefined][] = [
  ["Estação do Minério", 7, 583, 34, 25, true, undefined],
  ["Pátio de Minério", 41, 583, 59, 44, false, "10-25"],
  ["Pátio de Minério", 7, 608, 34, 19, false, "10-25"],
  ["Correias e Coqueria", 101, 583, 80, 44, false, "25-40"],
  ["Alto-Forno", 124, 628, 57, 49, false, "40-60"],
  ["Aciaria", 66, 628, 57, 49, false, "60-80"],
  ["Lingotamento e Laminação", 7, 628, 58, 49, false, "80-100"],
  ["Sala de Controle", 7, 628, 17, 16, true, undefined],
  ["Coração do Forno", 7, 680, 174, 38, false, "100-120"],
];
/**
 * Portas (ciclo 22: tools/mapgen/doors22.mjs; antes, porta-portal com a saída ao lado): porta de level na parede →
 * zona de dentro; `old` = os portais que ela substituiu (não existem mais).
 */
const DOORS = [
  { id: "sid_patio", minLevel: 10, door: [23, 607], to: "Pátio de Minério", old: [[23, 606], [24, 608]] },
  { id: "sid_correias", minLevel: 25, door: [100, 604], to: "Correias e Coqueria", old: [[99, 604], [101, 605]] },
  { id: "sid_altoforno", minLevel: 40, door: [152, 627], to: "Alto-Forno", old: [[152, 626], [153, 628]] },
  { id: "sid_aciaria", minLevel: 60, door: [123, 652], to: "Aciaria", old: [[124, 652], [122, 653]] },
  { id: "sid_lingotamento", minLevel: 80, door: [65, 660], to: "Lingotamento e Laminação", old: [[66, 660], [64, 661]] },
  { id: "sid_coracao", minLevel: 100, door: [34, 677], to: "Coração do Forno", old: [[34, 672], [34, 683]] },
];
/** NPCs e placas (§1.4, globais). */
const NPC_TILES: [string, number, number][] = [
  ["chefe_estacao_minerio", 20, 592], ["almoxarife", 27, 592], ["depot_minerio", 32, 592], ["capela_epi", 34, 598], ["mestre_turno", 21, 604],
  ["operadora_correia", 107, 592], ["encarregada_coqueria", 132, 590], ["forneiro_chefe", 134, 642], ["mestre_aciaria", 116, 634],
  ["operador_laminador", 11, 632], ["supervisora_controle", 15, 632], ["espirito_fundidor", 19, 632],
  ["placa_correias", 98, 601], ["placa_area_quente", 149, 625], ["placa_epi", 126, 649], ["placa_carga_suspensa", 68, 657], ["placa_forno_acordado", 31, 670],
];
const BOSSES: [string, string][] = [["contramestre_fuligem", "Correias e Coqueria"], ["golem_convertedor", "Aciaria"], ["fornalha_primordial", "Coração do Forno"]];

/**
 * Tiles que um personagem do level `level` alcança a partir do templo, sem missão feita: andando, pelos portais (porta de
 * level só com o level; porta de missão nunca), pelas portas de sala e pelas viagens dos NPCs. Cópia da função de
 * quests.test.ts.
 */
function reachable(level: number): Uint8Array {
  const W = map.width, seen = new Uint8Array(W * map.height);
  const portals = new Map<number, { x: number; y: number; ok: boolean }>();
  for (const o of findObjects(map, "portal")) {
    const t = tile(o);
    const ok = !prop(o, "quest") && Number(prop(o, "minLevel") ?? 0) <= level;
    portals.set(t.y * W + t.x, { x: Number(prop(o, "toX")), y: Number(prop(o, "toY")), ok });
  }
  const doors = new Map<number, boolean>();
  for (const d of findDoors(map)) doors.set(d.y * W + d.x, !d.req?.quest && !d.req?.chestGroup && (d.req?.minLevel ?? 0) <= level);
  const travel = new Map<number, { x: number; y: number }[]>();
  for (const o of findObjects(map, "npc")) {
    const dests = NPCS[String(prop(o, "npcId"))]?.travel;
    if (!dests?.length) continue;
    const t = tile(o);
    for (let y = t.y - NPC_RANGE; y <= t.y + NPC_RANGE; y++) {
      for (let x = t.x - NPC_RANGE; x <= t.x + NPC_RANGE; x++) travel.set(y * W + x, [...(travel.get(y * W + x) ?? []), ...dests]);
    }
  }
  const queue: number[] = [];
  const visit = (x: number, y: number) => {
    const i = y * W + x;
    if (!seen[i] && (grid.isWalkable(x, y) || doors.get(i))) { seen[i] = 1; queue.push(i); }
  };
  const start = mapSpawn(map, { x: 0, y: 0 });
  visit(start.x, start.y);
  for (let k = 0; k < queue.length; k++) {
    const i = queue[k]!, x = i % W, y = Math.floor(i / W);
    for (const d of travel.get(i) ?? []) visit(d.x, d.y);
    const portal = portals.get(i);
    if (portal) {
      if (portal.ok) visit(portal.x, portal.y);
      continue;
    }
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      if (canStepTerrain(grid, x, y, dx, dy) || (!(dx && dy) && doors.get((y + dy) * W + x + dx))) visit(x + dx, y + dy);
    }
  }
  return seen;
}
const spawns = findObjects(map, "monster_spawn").map((o) => ({ id: String(prop(o, "monster")), level: Number(prop(o, "level")), radius: Number(prop(o, "radius")), ...tile(o) }));
const reach = new Map<number, Uint8Array>();
function huntable(monster: string, level: number): boolean {
  const seen = reach.get(level) ?? reach.set(level, reachable(level)).get(level)!;
  return spawns.some((s) => s.id === monster && [-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => seen[(s.y + dy) * map.width + s.x + dx] === 1)));
}
const regionZones = findObjects(map, "zone").filter((o) => prop(o, "regiao") === "Siderúrgica");
const faixaOf = (zone: string) => String(ZONES.find(([n, , , , , pz]) => n === zone && !pz)?.[6] ?? "").split("-").map(Number);

describe("Siderúrgica: geometria", () => {
  it("o mapa cresce para 400×722 e a região fica no bloco, com 30 linhas de vazio acima", () => {
    // a Montadora (ciclo 20, montadora.test.ts) cresce o mapa de novo, para baixo da linha 722
    expect(map.width).toBe(400);
    expect(map.height).toBeGreaterThanOrEqual(722);
    for (let y = 553; y <= 582; y++) for (let x = 0; x < map.width; x++) expect(grid.isWalkable(x, y), `${x},${y}`).toBe(false);
    let walk = 0;
    for (let y = 560; y < 722; y++) for (let x = 0; x < map.width; x++) {
      if (!grid.isWalkable(x, y)) continue;
      walk++;
      expect(x >= 7 && x <= 180 && y >= 583 && y <= 716, `andável fora do bloco em ${x},${y}`).toBe(true);
    }
    expect(walk).toBeGreaterThan(15_000);
  });

  it("nove zonas com pz, faixa e região; a faixa contém a faixa de level que o índice do mundo calcula", () => {
    expect(regionZones).toHaveLength(9);
    for (const [name, x, y, w, h, pz, faixa] of ZONES) {
      const z = regionZones.find((o) => o.name === name && o.x === x * 16 && o.y === y * 16);
      expect(z, name).toBeDefined();
      expect([z!.width, z!.height]).toEqual([w * 16, h * 16]);
      expect(prop(z, "pz")).toBe(pz);
      expect(prop(z, "faixa")).toBe(faixa);
      expect(typeof prop(z, "music")).toBe("string");
    }
    for (const name of new Set(ZONES.filter(([, , , , , pz]) => !pz).map(([n]) => n))) {
      const lv = index.zoneLevels(name)!, [lo, hi] = faixaOf(name);
      expect(lv, name).toBeDefined();
      expect(lv.min, name).toBeGreaterThanOrEqual(lo!);
      expect(lv.max, name).toBeLessThanOrEqual(hi!);
    }
    expect(index.zoneAt(15, 637)).toBe("Sala de Controle");
    expect(index.zoneAt(30, 650)).toBe("Lingotamento e Laminação");
  });

  it("luz ambiente: Estação, Sala de Controle e Aciaria iluminadas; Coração do Forno escuro", () => {
    for (const z of ["Estação do Minério", "Sala de Controle", "Aciaria"]) expect(zoneLightMode(z), z).toBe("lit");
    expect(zoneLightMode("Coração do Forno")).toBe("dark");
    expect(zoneLightMode("Pátio de Minério")).toBe("outdoor");
  });
});

describe("Siderúrgica: portas e acesso", () => {
  it("seis portas de sala com level crescente (10 → 100), na parede entre duas zonas, sem portal nenhum", () => {
    const doors = findDoors(map);
    let last = 0;
    for (const d of DOORS) {
      const door = doors.find((x) => x.id === d.id)!;
      expect(door, d.id).toBeDefined();
      expect([door.x, door.y]).toEqual(d.door);
      expect(door.req).toEqual({ minLevel: d.minLevel });
      expect(d.minLevel).toBeGreaterThan(last);
      last = d.minLevel;
      expect(grid.isWalkable(door.x, door.y), "porta fechada é parede").toBe(false);
      const sides = doorSides(door, (x, y) => grid.isWalkable(x, y));
      expect(sides).toHaveLength(2);
      expect(index.componentAt(sides[0]!.x, sides[0]!.y)).not.toBe(index.componentAt(sides[1]!.x, sides[1]!.y));
      expect(index.doorAt(door.x, door.y)?.zone).toBe(d.to);
      for (const [x, y] of d.old) expect(portalAt(x!, y!), `portal antigo ${x},${y}`).toBeUndefined();
    }
    expect(index.doorAt(100, 604)?.label).toBe("Correias e Coqueria · lv 25+");
    expect(index.doorAt(34, 677)?.label).toBe("Coração do Forno · lv 100+");
  });

  it("sem o atalho oculto da Malha: Estação Central ↔ Estação do Minério só pelos chefes de estação", () => {
    expect(portalAt(46, 384)).toBeUndefined();
    expect(portalAt(8, 591)).toBeUndefined();
    expect(NPCS.chefe_estacao_malha!.travel!.map((t) => t.label)).toContain("Estação do Minério");
    expect(NPCS.chefe_estacao_minerio!.travel!.map((t) => t.label)).toContain("Estação Central da Malha");
    expect(index.zoneAt(24, 594)).toBe("Estação do Minério");
  });

  it("caçável no level da porta, e não um level antes", () => {
    for (const [monster, lv] of [["caracol_ferrugem", 10], ["serpente_correia", 25], ["salamandra_cadinho", 40], ["cavaleiro_aco_fundido", 60], ["rex_ferro", 80], ["forjador_rubro", 100]] as const) {
      expect(huntable(monster, lv), `${monster} no lv ${lv}`).toBe(true);
      expect(huntable(monster, lv - 1), `${monster} no lv ${lv - 1}`).toBe(false);
    }
  });
});

describe("Siderúrgica: spawns e NPCs", () => {
  const here = spawns.filter((s) => s.y >= 580 && s.y < 722);

  it("36 spawns, cada um na zona da faixa certa, com o level do monstro; um spawn de cada chefe", () => {
    expect(here).toHaveLength(36);
    for (const s of here) {
      const zone = index.zoneAt(s.x, s.y)!, [lo, hi] = faixaOf(zone);
      expect(MONSTERS[s.id], s.id).toBeDefined();
      expect(s.level, s.id).toBe(MONSTERS[s.id]!.level);
      expect(s.level >= lo! && s.level <= hi!, `${s.id} lv ${s.level} em ${zone} (${lo}-${hi})`).toBe(true);
      for (const [dx, dy] of [[-s.radius, -s.radius], [s.radius, s.radius]]) expect(index.zoneAt(s.x + dx!, s.y + dy!), `${s.id} em ${s.x},${s.y}`).toBe(zone);
    }
    for (const [boss, zone] of BOSSES) {
      const list = here.filter((s) => s.id === boss);
      expect(list, boss).toHaveLength(1);
      expect(index.zoneAt(list[0]!.x, list[0]!.y)).toBe(zone);
    }
  });

  it("os 17 NPCs e placas nos tiles combinados, todos no catálogo", () => {
    for (const [id, x, y] of NPC_TILES) {
      expect(index.npcAt(id), id).toMatchObject({ x, y });
      expect(NPCS[id], id).toBeDefined();
    }
    // + o Caminhão de Bobinas da Montadora (ciclo 20) no tile reservado da Estação, (30,605)
    expect(findObjects(map, "npc").filter((o) => o.y / 16 >= 580 && o.y / 16 < 722 && prop(o, "npcId") !== "mt_bobinas_sid")).toHaveLength(NPC_TILES.length);
  });
});

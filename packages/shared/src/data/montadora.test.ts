// Montadora (ciclo 20, docs/regioes/montadora.md; mapa em tools/mapgen/expansion7.mjs): o world.json publicado tem a região
// inteira — geometria, zonas com faixa, portas de level em cadeia, spawns na faixa, atalho da Oficina, a alavanca do Crash
// Test com os baús e os NPCs nos tiles combinados com as frentes B e C. As validações de desenho (vedação dos setores,
// alcance, folgas, bolsões) ficam no gerador.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { zoneLightMode } from "../daynight.ts";
import { CollisionGrid, canStepTerrain, findObjects, mapSpawn, objectTile, type TiledMap, type TiledObject } from "../map.ts";
import { buildWorldIndex } from "../worldIndex.ts";
import { MONSTERS } from "./monsters.ts";
import { NPCS, NPC_RANGE } from "./npcs.ts";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const map = JSON.parse(readFileSync(root + "assets/maps/world.json", "utf8")) as TiledMap;
const grid = CollisionGrid.fromTiled(map);
const index = buildWorldIndex(map);
const prop = (o: TiledObject | undefined, name: string) => o?.properties?.find((p) => p.name === name)?.value;
const tile = (o: TiledObject) => objectTile(o, map.tilewidth);
const at = (type: string, x: number, y: number) => findObjects(map, type).find((o) => { const t = tile(o); return t.x === x && t.y === y; });
const pts = (s: unknown) => String(s).split(";").map((p) => p.split(",").map(Number));

/** Zonas da região (especificação §2.2, tiles globais): [nome, x, y, w, h, pz, faixa]. */
const ZONES: [string, number, number, number, number, boolean, string | undefined][] = [
  ["Montadora", 216, 746, 180, 140, false, undefined],
  ["Portaria da Montadora", 219, 749, 28, 30, true, undefined],
  ["Pátio de Carros", 248, 749, 72, 43, false, "10-25"],
  ["Pátio de Carros", 219, 780, 29, 12, false, "10-25"],
  ["Lava-Rápido", 296, 772, 24, 20, false, "10-25"],
  ["Estamparia", 320, 749, 73, 43, false, "25-40"],
  ["Funilaria e Armação", 219, 792, 82, 27, false, "40-60"],
  ["Cabines de Pintura", 301, 792, 92, 27, false, "60-80"],
  ["Estufa", 366, 802, 27, 17, false, "60-80"],
  ["Montagem Final", 219, 819, 98, 24, false, "80-100"],
  ["Sala de Descanso", 220, 820, 16, 11, true, undefined],
  ["Pista de Testes", 317, 819, 76, 24, false, "90-110"],
  ["Sala dos Protótipos", 276, 850, 117, 34, false, "110-120"],
  ["Pista do Crash Test", 220, 852, 41, 13, false, undefined],
  ["Boxe dos Troféus", 266, 854, 9, 9, false, undefined],
];
/** Portas (§2.3, globais): porta com level (vão da parede) → chegada; saída sem level na mesma parede → volta. */
const DOORS = [
  { minLevel: 25, door: [320, 766], arrive: [323, 766], exit: [320, 769], back: [318, 769], from: "Pátio de Carros", to: "Estamparia" },
  { minLevel: 40, door: [256, 792], arrive: [256, 795], exit: [260, 792], back: [260, 790], from: "Pátio de Carros", to: "Funilaria e Armação" },
  { minLevel: 60, door: [300, 804], arrive: [304, 804], exit: [301, 808], back: [298, 808], from: "Funilaria e Armação", to: "Cabines de Pintura" },
  { minLevel: 80, door: [311, 818], arrive: [311, 822], exit: [306, 819], back: [306, 816], from: "Cabines de Pintura", to: "Montagem Final" },
  { minLevel: 90, door: [316, 830], arrive: [320, 830], exit: [316, 838], back: [314, 838], from: "Montagem Final", to: "Pista de Testes" },
  { minLevel: 110, door: [387, 840], arrive: [376, 855], exit: [376, 852], back: [385, 840], from: "Pista de Testes", to: "Sala dos Protótipos" },
];
/** NPCs e placas (§2.5, globais), com os dois de fora do bloco (cegonha na Vila, Caminhão de Bobinas na Estação do Minério). */
const NPC_TILES: [string, number, number][] = [
  ["mt_motorista", 228, 754], ["mt_bobinas", 240, 754], ["mt_porteiro", 243, 759], ["mt_cantineira", 223, 764], ["mt_depot", 227, 764],
  ["mt_enfermeira", 236, 768], ["mt_lavador", 240, 774], ["mt_placa_patio", 245, 766], ["mt_placa_estamparia", 317, 764],
  ["mt_placa_funilaria", 253, 789], ["mt_prensista", 326, 772], ["mt_soldadora", 252, 796], ["mt_placa_pintura", 297, 806],
  ["mt_pintor", 306, 801], ["mt_placa_montagem", 314, 815], ["mt_supervisora", 226, 824], ["mt_placa_pista", 313, 827], ["mt_piloto", 342, 836],
  ["mt_cegonha_vila", 91, 100], ["mt_bobinas_sid", 30, 605],
];
const BOSSES: [string, string][] = [["mt_sapao", "Lava-Rápido"], ["mt_monstro_estufa", "Estufa"], ["mt_prototipo", "Sala dos Protótipos"]];

/**
 * Tiles que um personagem do level `level` alcança a partir do templo, sem missão feita: andando, pelos portais (porta de
 * level só com o level; porta de missão nunca) e pelas viagens dos NPCs. Cópia da função de quests.test.ts.
 */
function reachable(level: number): Uint8Array {
  const W = map.width, seen = new Uint8Array(W * map.height);
  const portals = new Map<number, { x: number; y: number; ok: boolean }>();
  for (const o of findObjects(map, "portal")) {
    const t = tile(o);
    const ok = !prop(o, "quest") && Number(prop(o, "minLevel") ?? 0) <= level;
    portals.set(t.y * W + t.x, { x: Number(prop(o, "toX")), y: Number(prop(o, "toY")), ok });
  }
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
    if (!seen[i] && grid.isWalkable(x, y)) { seen[i] = 1; queue.push(i); }
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
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && canStepTerrain(grid, x, y, dx, dy)) visit(x + dx, y + dy);
  }
  return seen;
}
const spawns = findObjects(map, "monster_spawn").map((o) => ({ id: String(prop(o, "monster")), level: Number(prop(o, "level")), radius: Number(prop(o, "radius")), ...tile(o) }));
const reach = new Map<number, Uint8Array>();
const seenAt = (level: number) => reach.get(level) ?? reach.set(level, reachable(level)).get(level)!;
function huntable(monster: string, level: number): boolean {
  const seen = seenAt(level);
  return spawns.some((s) => s.id === monster && s.y >= 746 && [-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => seen[(s.y + dy) * map.width + s.x + dx] === 1)));
}
const regionZones = findObjects(map, "zone").filter((o) => prop(o, "regiao") === "Montadora");
const faixaOf = (zone: string) => String(ZONES.find(([n, , , , , pz]) => n === zone && !pz)?.[6] ?? "").split("-").map(Number);

describe("Montadora: geometria", () => {
  it("o mapa cresce para 400×888; a região fica no bloco, com o vazio de 29 linhas acima", () => {
    expect([map.width, map.height]).toEqual([400, 888]);
    for (let y = 717; y <= 745; y++) for (let x = 0; x < map.width; x++) expect(grid.isWalkable(x, y), `${x},${y}`).toBe(false);
    let walk = 0;
    for (let y = 722; y < map.height; y++) for (let x = 0; x < map.width; x++) {
      if (!grid.isWalkable(x, y)) continue;
      walk++;
      expect(x >= 219 && x <= 392 && y >= 749 && y <= 883, `andável fora do bloco em ${x},${y}`).toBe(true);
    }
    expect(walk).toBeGreaterThan(14_000);
  });

  it("quinze zonas (14 nomes) com pz, faixa e região; a faixa contém a faixa de level que o índice do mundo calcula", () => {
    expect(regionZones).toHaveLength(ZONES.length);
    for (const [name, x, y, w, h, pz, faixa] of ZONES) {
      const z = regionZones.find((o) => o.name === name && o.x === x * 16 && o.y === y * 16);
      expect(z, name).toBeDefined();
      expect([z!.width, z!.height]).toEqual([w * 16, h * 16]);
      expect(prop(z, "pz"), name).toBe(pz);
      expect(prop(z, "faixa"), name).toBe(faixa);
      expect(typeof prop(z, "music")).toBe("string");
    }
    for (const name of new Set(ZONES.filter(([, , , , , , faixa]) => faixa).map(([n]) => n))) {
      const lv = index.zoneLevels(name), [lo, hi] = faixaOf(name);
      if (name === "Estufa") { expect(lv, "a Estufa só tem o chefe").toBeUndefined(); continue; }
      expect(lv, name).toBeDefined();
      expect(lv!.min, name).toBeGreaterThanOrEqual(lo!);
      expect(lv!.max, name).toBeLessThanOrEqual(hi!);
    }
    expect(index.zoneAt(226, 824)).toBe("Sala de Descanso");
    expect(index.zoneAt(240, 826)).toBe("Montagem Final");
    expect(index.zoneAt(302, 784)).toBe("Lava-Rápido");
    expect(index.zoneAt(380, 810)).toBe("Estufa");
    expect(index.zoneAt(224, 856)).toBe("Pista do Crash Test");
  });

  it("luz ambiente: Portaria como a Vila, galpões iluminados, Sala dos Protótipos escura, Pátio e Pista ao ar livre", () => {
    expect(zoneLightMode("Portaria da Montadora")).toBe("town");
    for (const z of ["Lava-Rápido", "Estamparia", "Funilaria e Armação", "Cabines de Pintura", "Estufa", "Montagem Final", "Sala de Descanso", "Pista do Crash Test", "Boxe dos Troféus"]) expect(zoneLightMode(z), z).toBe("lit");
    expect(zoneLightMode("Sala dos Protótipos")).toBe("dark");
    for (const z of ["Montadora", "Pátio de Carros", "Pista de Testes"]) expect(zoneLightMode(z), z).toBe("outdoor");
  });
});

describe("Montadora: portas e acesso", () => {
  it("seis portas com level crescente (25 → 110), cada uma com a saída sem level ao lado", () => {
    let last = 0;
    for (const d of DOORS) {
      const door = at("portal", d.door[0]!, d.door[1]!), exit = at("portal", d.exit[0]!, d.exit[1]!);
      expect(prop(door, "minLevel"), `porta ${d.door}`).toBe(d.minLevel);
      expect(d.minLevel).toBeGreaterThan(last);
      last = d.minLevel;
      expect([prop(door, "toX"), prop(door, "toY")]).toEqual(d.arrive);
      expect([prop(exit, "toX"), prop(exit, "toY")]).toEqual(d.back);
      expect(prop(exit, "minLevel")).toBeUndefined();
      expect(prop(exit, "quest")).toBeUndefined();
      expect(index.zoneAt(d.arrive[0]!, d.arrive[1]!)).toBe(d.to);
      expect(index.zoneAt(d.back[0]!, d.back[1]!)).toBe(d.from);
      for (const p of [d.door, d.arrive, d.exit, d.back]) expect(grid.isWalkable(p[0]!, p[1]!), `${p}`).toBe(true);
      expect(at("portal", d.arrive[0]!, d.arrive[1]!), `chegada ${d.arrive} não é portal`).toBeUndefined();
    }
    expect(index.portalAt(320, 766)?.label).toBe("Estamparia · lv 25+");
    expect(index.portalAt(387, 840)?.label).toBe("Sala dos Protótipos · lv 110+");
  });

  it("atalho oculto: recanto do Pátio de Encomendas da Oficina (lv 10) ↔ portão de serviço da Portaria", () => {
    const ida = at("portal", 83, 332), volta = at("portal", 219, 776);
    expect([prop(ida, "toX"), prop(ida, "toY"), prop(ida, "minLevel")]).toEqual([222, 774, 10]);
    expect([prop(volta, "toX"), prop(volta, "toY"), prop(volta, "minLevel")]).toEqual([83, 331, undefined]);
    expect(index.zoneAt(222, 774)).toBe("Portaria da Montadora");
    expect(index.zoneAt(232, 758)).toBe("Portaria da Montadora");
    for (const [x, y] of [[83, 331], [222, 774], [232, 758]] as const) expect(grid.isWalkable(x, y), `${x},${y}`).toBe(true);
  });

  it("caçável no level da porta, e não um level antes; o Pátio de Carros já no lv 10 pelo atalho", () => {
    for (const [monster, lv] of [["mt_polvo_graxa", 25], ["mt_lagartixa_faisca", 40], ["mt_mariposa_tinta", 60], ["mt_robo_montador", 80], ["mt_tengu_cromado", 90], ["mt_prototipo", 110]] as const) {
      expect(huntable(monster, lv), `${monster} no lv ${lv}`).toBe(true);
      expect(huntable(monster, lv - 1), `${monster} no lv ${lv - 1}`).toBe(false);
    }
    expect(huntable("mt_calota", 10)).toBe(true);
  });
});

describe("Montadora: spawns, NPCs e alavanca", () => {
  const here = spawns.filter((s) => s.y >= 746);

  it("43 spawns (125 monstros), cada um na zona da faixa certa, com o level do monstro; um spawn de cada chefe", () => {
    expect(here).toHaveLength(43);
    expect(here.reduce((n, s) => n + Number(prop(at("monster_spawn", s.x, s.y), "count")), 0)).toBe(125);
    for (const s of here) {
      const zone = index.zoneAt(s.x, s.y)!, [lo, hi] = faixaOf(zone);
      expect(MONSTERS[s.id], s.id).toBeDefined();
      expect(s.level, s.id).toBe(MONSTERS[s.id]!.level);
      if (!MONSTERS[s.id]!.boss) expect(s.level >= lo! && s.level <= hi!, `${s.id} lv ${s.level} em ${zone} (${lo}-${hi})`).toBe(true);
      for (const [dx, dy] of [[-s.radius, -s.radius], [s.radius, s.radius]]) expect(index.zoneAt(s.x + dx!, s.y + dy!), `${s.id} em ${s.x},${s.y}`).toBe(zone);
    }
    for (const [boss, zone] of BOSSES) {
      const list = here.filter((s) => s.id === boss);
      expect(list, boss).toHaveLength(1);
      expect(index.zoneAt(list[0]!.x, list[0]!.y)).toBe(zone);
      expect(MONSTERS[boss]?.boss, boss).toBe(true);
    }
  });

  it("os 18 NPCs e placas do bloco e os 2 de fora nos tiles combinados, todos no catálogo", () => {
    for (const [id, x, y] of NPC_TILES) {
      expect(index.npcAt(id), id).toMatchObject({ x, y });
      expect(NPCS[id], id).toBeDefined();
    }
    expect(findObjects(map, "npc").filter((o) => o.y / 16 >= 746)).toHaveLength(18);
    expect(index.zoneAt(91, 100)).toBe("Vila de Pedra Clara");
    expect(index.zoneAt(30, 605)).toBe("Estação do Minério");
  });

  it("alavanca Crash Test: placas no gramado da pista, sala no subsolo só pela alavanca, porta dos troféus e quatro baús", () => {
    const lever = findObjects(map, "quest_lever").find((o) => prop(o, "leverId") === "crash_test")!;
    expect(lever).toBeDefined();
    expect(tile(lever)).toEqual({ x: 355, y: 835 });
    expect(grid.isWalkable(355, 835)).toBe(false);
    const plates = pts(prop(lever, "plates")), dests = pts(prop(lever, "dests")), mons = pts(prop(lever, "spawns"));
    expect(plates).toEqual([[348, 835], [350, 835], [352, 835], [354, 835]]);
    expect(dests).toEqual([[224, 854], [224, 856], [224, 858], [224, 860]]);
    expect(mons).toEqual([[248, 854], [252, 858], [248, 862], [256, 854], [258, 858], [256, 862]]);
    expect(prop(lever, "room")).toBe("220,852,260,864");
    const seen = seenAt(130);
    for (const [x, y] of plates) { expect(grid.isWalkable(x!, y!)).toBe(true); expect(seen[y! * map.width + x!], `placa ${x},${y}`).toBe(1); }
    for (const [x, y] of [...dests, ...mons, [267, 858]]) { expect(grid.isWalkable(x!, y!), `${x},${y}`).toBe(true); expect(seen[y! * map.width + x!], `${x},${y} alcançável a pé`).toBe(0); }
    expect([prop(at("portal", 261, 858), "toX"), prop(at("portal", 261, 858), "toY")]).toEqual([267, 858]);
    expect([prop(at("portal", 270, 853), "toX"), prop(at("portal", 270, 853), "toY")]).toEqual([346, 838]);
    const chests = findObjects(map, "quest_chest").filter((o) => String(prop(o, "chestId")).startsWith("mt_crash_"));
    expect(chests.map((o) => [prop(o, "chestId"), tile(o).x, tile(o).y])).toEqual([
      ["mt_crash_knight", 273, 855], ["mt_crash_paladin", 273, 857], ["mt_crash_sorcerer", 273, 859], ["mt_crash_druid", 273, 861],
    ]);
    for (const c of chests) { const t = tile(c); expect(grid.isWalkable(t.x, t.y)).toBe(false); expect(grid.isWalkable(t.x - 1, t.y)).toBe(true); }
  });
});

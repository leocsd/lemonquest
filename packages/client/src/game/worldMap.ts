// Carrega e monta o mapa Tiled (tilesets embutidos; imagem relativa ao arquivo do mapa).
import Phaser from "phaser";
import { CollisionGrid, DEFAULT_SPAWN, GroundSpeedGrid, WaterGrid, mapSpawn, type TiledMap } from "@lemonquest/shared";

export const MAP_KEY = "world";
export const MAP_URL = `${import.meta.env.BASE_URL}maps/world.json`;

/** Camadas desenhadas acima dos personagens. */
const ABOVE_LAYERS = new Set(["above"]);
/** Camadas lógicas que não são desenhadas. */
const HIDDEN_LAYERS = new Set(["collision"]);

const tilesetTexKey = (name: string) => `tileset:${name}`;
/** Cópia do mapa só com as camadas desenhadas, entregue ao Phaser (ver buildWorldMap). */
const DRAWN_KEY = "world:drawn";
/** Tile de vazio do gerador (TilesetHole, id local 12: sólido #141b1b) e a cor que o substitui no fundo da cena. */
const VOID_LOCAL_ID = 12;
export const VOID_COLOR = "#141b1b";

let resolveWorldMapJson: (data: TiledMap) => void = () => {};
/**
 * O JSON do mapa que o Phaser baixou (1,5 MB), para quem mais precisar dele (minimapa) sem um segundo pedido.
 * Resolvida pelo loader em `preloadWorldMap`; quem consome deve ter um fallback (`fetch` próprio) caso ninguém
 * a resolva — por exemplo, se a cena nunca subir.
 */
export const worldMapJson: Promise<TiledMap> = new Promise((resolve) => { resolveWorldMapJson = resolve; });

/** Agenda o JSON do mapa e, quando ele chegar, as imagens dos tilesets. */
export function preloadWorldMap(scene: Phaser.Scene) {
  const mapUrl = new URL(MAP_URL, location.href);
  scene.load.once(`filecomplete-tilemapJSON-${MAP_KEY}`, (_key: string, _type: string, data: TiledMap) => {
    resolveWorldMapJson(data);
    for (const ts of data.tilesets ?? []) {
      if (!ts.image || !ts.name) {
        console.warn(`[map] tileset sem imagem embutida (firstgid ${ts.firstgid}); use tilesets embutidos no Tiled.`);
        continue;
      }
      scene.load.image(tilesetTexKey(ts.name), new URL(ts.image, mapUrl).href);
    }
  });
  scene.load.tilemapTiledJSON(MAP_KEY, MAP_URL);
}

export interface WorldMap {
  tiled: TiledMap;
  tilemap: Phaser.Tilemaps.Tilemap;
  grid: CollisionGrid;
  /** Velocidade do chão por tile — mesma construção do servidor (predição sem correções). */
  groundSpeed: GroundSpeedGrid;
  /** Tiles de água (pesca). */
  water: WaterGrid;
  spawn: { x: number; y: number };
  widthPx: number;
  heightPx: number;
  below: Phaser.Tilemaps.TilemapLayer[];
  above: Phaser.Tilemaps.TilemapLayer[];
}

export function buildWorldMap(scene: Phaser.Scene): WorldMap {
  const tiled = (scene.cache.tilemap.get(MAP_KEY) as { data: TiledMap }).data;
  // O Phaser cria um objeto Tile por célula de cada camada. A colisão e os objetos o cliente lê do JSON cru (grades
  // próprias, luzes, minimapa), então o Phaser só recebe as camadas desenhadas, e células vazias viram null
  // (insertNull): com o mapa 400×722 (ciclo 19) isso tira milhões de objetos da memória.
  // O vazio entre as regiões (tile sólido #141b1b do TilesetHole, ~64% do chão com o mapa 400×888) também vira célula
  // vazia: o fundo da cena tem a mesma cor (VOID_COLOR em main.tsx), então nada muda na tela e somem ~228 mil Tiles.
  const hole = tiled.tilesets.find((t) => t.name === "TilesetHole");
  const voidGid = hole ? hole.firstgid + VOID_LOCAL_ID : -1;
  const drawn = {
    ...tiled,
    layers: tiled.layers
      .filter((l) => l.type === "tilelayer" && !HIDDEN_LAYERS.has(l.name))
      .map((l) => (l.name === "ground" && l.data ? { ...l, data: l.data.map((g) => (g === voidGid ? 0 : g)) } : l)),
  };
  scene.cache.tilemap.add(DRAWN_KEY, { format: Phaser.Tilemaps.Formats.TILED_JSON, data: drawn });
  const tilemap = scene.make.tilemap({ key: DRAWN_KEY, insertNull: true });
  scene.cache.tilemap.remove(DRAWN_KEY);
  const tilesets = tilemap.tilesets
    .map((ts) => tilemap.addTilesetImage(ts.name, tilesetTexKey(ts.name)))
    .filter((t): t is Phaser.Tilemaps.Tileset => !!t);

  const below: Phaser.Tilemaps.TilemapLayer[] = [];
  const above: Phaser.Tilemaps.TilemapLayer[] = [];
  for (const ld of tilemap.layers) {
    if (HIDDEN_LAYERS.has(ld.name)) continue;
    const layer = tilemap.createLayer(ld.name, tilesets, 0, 0);
    if (!layer) continue;
    (ABOVE_LAYERS.has(ld.name) ? above : below).push(layer);
  }

  return {
    tiled,
    tilemap,
    grid: CollisionGrid.fromTiled(tiled),
    groundSpeed: GroundSpeedGrid.fromTiled(tiled),
    water: WaterGrid.fromTiled(tiled),
    spawn: mapSpawn(tiled, DEFAULT_SPAWN),
    widthPx: tilemap.widthInPixels,
    heightPx: tilemap.heightInPixels,
    below,
    above,
  };
}

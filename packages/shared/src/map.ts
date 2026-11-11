/**
 * Formato de mapa: Tiled JSON (orthogonal, tiles 16x16, camadas não-infinitas).
 * Convenções de camadas (por nome):
 *   - tilelayers: "ground", "deco" (abaixo dos personagens), "above" (desenhada sobre os personagens: copas, telhados)
 *   - tilelayer "collision": qualquer gid != 0 bloqueia o tile
 *   - objectgroup "objects": pontos com `type`/`class` = "spawn_player" | "npc" | "monster_spawn" | "portal"
 *   - "training_statue" (ponto; prop `statueId`): estátua de treino offline (o tile é bloqueado; interage-se do lado).
 *   - "zone" com prop `pz=true`: zona de proteção (a vila e o centro de treinamento).
 *   - Quests de mundo (shared/data/questWorld.ts): "quest_chest" (ponto; prop `chestId`, tile bloqueado; com `drawn=true`
 *     o baú não tem tile: o cliente desenha e CollisionGrid bloqueia pelo objeto) e "quest_lever"
 *     (ponto; props `leverId`, `plates`/`dests`/`spawns` = "x,y;x,y", `room` = "x0,y0,x1,y1"). "portal" com `minLevel`,
 *     `quest` ou `chestGroup` é uma porta de quest: quem não cumpre o requisito volta para o tile de onde veio.
 *   - Coliseu: "arena" (RETÂNGULO; props `arenaId` 1..ARENA_COUNT) = área de luta da instância;
 *     "arena_entry" (ponto; prop `arenaId`) = onde o grupo nasce; "arena_spawn" (ponto; prop `arenaId`) = pontos
 *     de spawn de monstros (vários por arena); "arena_exit" (ponto) = para onde volta quem sai (na vila, perto do NPC).
 *   - "light" (ponto, tile = x/16,y/16; gerado pelo mapgen em postes, tochas, braseiros, cristais/cogumelos brilhantes, velas da cripta,
 *     rachaduras de lava das ruínas e janelas da vila): props { radius: int (tiles), color: string "#rrggbb", flicker: bool }.
 *     Lido por client/game/lightSources.ts (dia/noite). Os postes de lampião (tile Element 6,4) também viram luz sem objeto.
 *     NPCs: "arena_master" na vila (lobbies) e "arena_shop_<n>" dentro de cada arena (loja das pausas).
 */
/** Quantidade de arenas (instâncias paralelas do coliseu). */
export const ARENA_COUNT = 4;

export interface TiledLayer {
  name: string;
  type: "tilelayer" | "objectgroup";
  width?: number;
  height?: number;
  data?: number[];
  objects?: TiledObject[];
}

export interface TiledObject {
  id: number;
  name: string;
  type?: string;
  class?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  properties?: TiledProperty[];
}

export interface TiledProperty { name: string; type: string; value: unknown }

/** Tileset embutido. `tiles` = propriedades por tile (formato padrão do Tiled), ex. `speed` (int) e `terrain` (string). */
export interface TiledTileset {
  firstgid: number; source?: string; name?: string; image?: string;
  tilewidth?: number; tileheight?: number; columns?: number; tilecount?: number; imagewidth?: number; imageheight?: number;
  tiles?: { id: number; properties?: TiledProperty[] }[];
}

export interface TiledMap {
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  layers: TiledLayer[];
  tilesets: TiledTileset[];
}

/** Grade de colisão compartilhada por servidor (autoridade) e cliente (predição). */
export class CollisionGrid {
  constructor(readonly width: number, readonly height: number, private readonly blocked: Uint8Array) {}

  static fromTiled(map: TiledMap): CollisionGrid {
    const layer = map.layers.find((l) => l.type === "tilelayer" && l.name === "collision");
    const blocked = new Uint8Array(map.width * map.height);
    if (layer?.data) for (let i = 0; i < blocked.length; i++) blocked[i] = layer.data[i] ? 1 : 0;
    // Baú de quest desenhado pelo cliente (prop `drawn`, covis do ciclo 16): sem tile no mapa, o bloqueio vem do objeto.
    for (const o of findObjects(map, "quest_chest")) {
      if (!o.properties?.some((p) => p.name === "drawn" && p.value === true)) continue;
      const t = objectTile(o, map.tilewidth);
      if (t.x >= 0 && t.y >= 0 && t.x < map.width && t.y < map.height) blocked[t.y * map.width + t.x] = 1;
    }
    return new CollisionGrid(map.width, map.height, blocked);
  }

  isWalkable(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return false;
    return this.blocked[y * this.width + x] === 0;
  }
}

/** Tiles de água (camada "ground" com gid do tileset "TilesetWater"): onde dá para pescar. Servidor e cliente usam a mesma. */
export class WaterGrid {
  constructor(readonly width: number, readonly height: number, private readonly water: Uint8Array) {}

  static fromTiled(map: TiledMap): WaterGrid {
    const water = new Uint8Array(map.width * map.height);
    const ts = map.tilesets?.find((t) => t.name === "TilesetWater");
    const ground = map.layers.find((l) => l.type === "tilelayer" && l.name === "ground")?.data;
    if (ts && ground) {
      const lo = ts.firstgid, hi = ts.firstgid + (ts.tilecount ?? 0) - 1;
      for (let i = 0; i < water.length; i++) {
        const g = (ground[i] ?? 0) & 0x1fffffff;
        if (g >= lo && g <= hi) water[i] = 1;
      }
    }
    return new WaterGrid(map.width, map.height, water);
  }

  isWater(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return false;
    return this.water[y * this.width + x] === 1;
  }
}

// ---------------------------------------------------------------------------
// Velocidade do chão (estilo Tibia). Servidor e cliente constroem a MESMA grade a partir do mapa.
// ---------------------------------------------------------------------------

/** Velocidade padrão do chão (%): tiles sem a propriedade `speed`. */
export const DEFAULT_GROUND_SPEED = 100;
/** Bits 29..31 do gid são flags de espelhamento/rotação do Tiled. */
export const TILED_GID_MASK = 0x1fffffff;
const MIN_GROUND_SPEED = 10, MAX_GROUND_SPEED = 1000;

interface TileProps { speed?: number; terrain?: string }

/** Resolve gid → propriedades do tile, achando o tileset pelo intervalo de firstgid. */
class TilePropIndex {
  private readonly sets: { firstgid: number; tiles: Map<number, TileProps> }[];
  private readonly cache = new Map<number, TileProps | null>();

  constructor(tilesets: TiledTileset[]) {
    this.sets = [...tilesets].sort((a, b) => a.firstgid - b.firstgid).map((ts) => {
      const tiles = new Map<number, TileProps>();
      for (const t of ts.tiles ?? []) {
        const props: TileProps = {};
        for (const p of t.properties ?? []) {
          if (p.name === "speed" && typeof p.value === "number" && Number.isFinite(p.value)) {
            props.speed = Math.max(MIN_GROUND_SPEED, Math.min(MAX_GROUND_SPEED, Math.round(p.value)));
          } else if (p.name === "terrain" && typeof p.value === "string" && p.value) {
            props.terrain = p.value;
          }
        }
        if (props.speed !== undefined || props.terrain !== undefined) tiles.set(t.id, props);
      }
      return { firstgid: ts.firstgid, tiles };
    });
  }

  get(rawGid: number): TileProps | null {
    const gid = rawGid & TILED_GID_MASK;
    if (!gid) return null;
    let hit = this.cache.get(gid);
    if (hit !== undefined) return hit;
    hit = null;
    for (let i = this.sets.length - 1; i >= 0; i--) {
      if (gid >= this.sets[i].firstgid) { hit = this.sets[i].tiles.get(gid - this.sets[i].firstgid) ?? null; break; }
    }
    this.cache.set(gid, hit);
    return hit;
  }
}

/**
 * Velocidade do chão por tile, a partir das propriedades `speed`/`terrain` dos tilesets.
 * Tile = propriedade do gid da camada "ground", sobrescrita pela da camada "deco" se o gid dela tiver
 * a propriedade (ex.: arbusto sobre grama). Sem propriedade → 100 / null.
 */
export class GroundSpeedGrid {
  constructor(
    readonly width: number,
    readonly height: number,
    private readonly speeds: Uint16Array,
    private readonly terrainIds: Uint8Array = new Uint8Array(width * height),
    /** terrainIds[i] - 1 indexa esta tabela; 0 = sem terreno. */
    private readonly terrainNames: string[] = [],
  ) {}

  static fromTiled(map: TiledMap): GroundSpeedGrid {
    const n = map.width * map.height;
    const index = new TilePropIndex(map.tilesets ?? []);
    const layer = (name: string) => map.layers.find((l) => l.type === "tilelayer" && l.name === name)?.data;
    const ground = layer("ground"), deco = layer("deco");
    const speeds = new Uint16Array(n).fill(DEFAULT_GROUND_SPEED);
    const terrainIds = new Uint8Array(n);
    const names: string[] = [];
    const nameId = (t: string) => { let i = names.indexOf(t); if (i < 0) { names.push(t); i = names.length - 1; } return i + 1; };
    for (let i = 0; i < n; i++) {
      const g = ground?.[i] ? index.get(ground[i]) : null;
      const d = deco?.[i] ? index.get(deco[i]) : null;
      const speed = d?.speed ?? g?.speed;
      const terrain = d?.terrain ?? g?.terrain;
      if (speed !== undefined) speeds[i] = speed;
      if (terrain !== undefined) terrainIds[i] = nameId(terrain);
    }
    return new GroundSpeedGrid(map.width, map.height, speeds, terrainIds, names);
  }

  /** Velocidade (%) do chão em (x,y); fora do mapa → 100. */
  speedAt(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return DEFAULT_GROUND_SPEED;
    return this.speeds[y * this.width + x];
  }

  /** Tipo de terreno (propriedade `terrain`, ex. "mud", "road") em (x,y), ou null. Só para efeitos visuais. */
  terrainAt(x: number, y: number): string | null {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return null;
    const id = this.terrainIds[y * this.width + x];
    return id ? this.terrainNames[id - 1] : null;
  }
}

export function findObjects(map: TiledMap, kind: string): TiledObject[] {
  const layer = map.layers.find((l) => l.type === "objectgroup" && l.name === "objects");
  return (layer?.objects ?? []).filter((o) => (o.type ?? o.class) === kind);
}

/** Converte posição em pixels de um objeto Tiled para coordenada de tile. */
export const objectTile = (o: TiledObject, tile = 16) => ({ x: Math.floor(o.x / tile), y: Math.floor(o.y / tile) });

/** Estátua de treino offline (objeto "training_statue"): id (prop `statueId`, senão o nome) e tile. */
export interface TrainingStatue { id: string; x: number; y: number }

/** Distância (Chebyshev) de (x,y) à estátua. A estátua ocupa 2x2: (x..x+1, y-1..y), com o ponto do mapa na base à esquerda. */
export function statueDistance(s: TrainingStatue, x: number, y: number): number {
  const dx = Math.max(s.x - x, 0, x - (s.x + 1));
  const dy = Math.max(s.y - 1 - y, 0, y - s.y);
  return Math.max(dx, dy);
}

export function findTrainingStatues(map: TiledMap): TrainingStatue[] {
  const out: TrainingStatue[] = [];
  for (const o of findObjects(map, "training_statue")) {
    const id = String(o.properties?.find((p) => p.name === "statueId")?.value ?? o.name ?? "");
    if (!id || out.some((s) => s.id === id)) continue;
    const t = objectTile(o, map.tilewidth);
    out.push({ id, x: t.x, y: t.y });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Helpers de movimento compartilhados (servidor = autoridade, cliente = predição).
// ---------------------------------------------------------------------------

/** Tile de spawn do mapa (objeto "spawn_player"), ou o fallback informado. */
export function mapSpawn(map: TiledMap, fallback: { x: number; y: number }): { x: number; y: number } {
  const sp = findObjects(map, "spawn_player")[0];
  return sp ? objectTile(sp, map.tilewidth) : { x: fallback.x, y: fallback.y };
}

/** Tiles a até este raio (Chebyshev) do spawn não bloqueiam por jogador (anti-grief no templo). */
export const SPAWN_SAFE_RADIUS = 1;

export function isNearSpawn(spawn: { x: number; y: number } | null | undefined, x: number, y: number): boolean {
  return !!spawn && Math.max(Math.abs(spawn.x - x), Math.abs(spawn.y - y)) <= SPAWN_SAFE_RADIUS;
}

/**
 * Checa só o terreno para um passo de (x,y) em (dx,dy): o destino precisa ser andável e,
 * em diagonais, os dois vizinhos ortogonais também (sem cortar quina).
 */
export function canStepTerrain(grid: CollisionGrid, x: number, y: number, dx: number, dy: number): boolean {
  if (!grid.isWalkable(x + dx, y + dy)) return false;
  if (dx !== 0 && dy !== 0) return grid.isWalkable(x + dx, y) && grid.isWalkable(x, y + dy);
  return true;
}

// ---------------------------------------------------------------------------
// Linha de visão (estilo Tibia). Servidor (autoridade) e cliente usam a MESMA regra.
// ---------------------------------------------------------------------------

/**
 * Linha "supercover" entre os CENTROS de (ax,ay) e (bx,by): true se todos os tiles que o segmento toca
 * ENTRE os dois (exclusive) deixam passar. Quando o segmento cruza exatamente a quina entre dois tiles
 * (passo diagonal), só bloqueia se OS DOIS tiles laterais bloquearem (passar "espremido" entre duas
 * paredes em diagonal é bloqueado; uma parede só de um lado, não). Simétrica: (a→b) === (b→a).
 * Adjacentes (inclusive em diagonal com uma quina livre) e o mesmo tile sempre têm linha livre.
 */
export function lineOfSight(ax: number, ay: number, bx: number, by: number, pass: (x: number, y: number) => boolean): boolean {
  const nx = Math.abs(bx - ax), ny = Math.abs(by - ay);
  const sx = bx > ax ? 1 : -1, sy = by > ay ? 1 : -1;
  let x = ax, y = ay, ix = 0, iy = 0;
  while (ix < nx || iy < ny) {
    // Compara onde o segmento cruza a próxima borda vertical × horizontal (inteiros, sem ponto flutuante).
    const d = (1 + 2 * ix) * ny - (1 + 2 * iy) * nx;
    if (d === 0) {
      // Exatamente na quina: bloqueado só se os dois vizinhos laterais bloquearem.
      if (!pass(x + sx, y) && !pass(x, y + sy)) return false;
      x += sx; y += sy; ix++; iy++;
    } else if (d < 0) { x += sx; ix++; }
    else { y += sy; iy++; }
    if ((x !== bx || y !== by) && !pass(x, y)) return false;
  }
  return true;
}

/** O que a linha de visão precisa de uma grade (CollisionGrid satisfaz). */
export interface SightGrid { isWalkable(x: number, y: number): boolean }

/**
 * Linha de visão entre dois tiles na grade de colisão: paredes (tiles bloqueados) entre eles cortam a visão;
 * criaturas e NPCs (que não estão na grade) não. Os próprios tiles de origem/destino não contam.
 */
export function hasLineOfSight(grid: SightGrid, from: { x: number; y: number }, to: { x: number; y: number }): boolean {
  return lineOfSight(from.x, from.y, to.x, to.y, (x, y) => grid.isWalkable(x, y));
}

// Índice do mundo (ciclo 17): zonas, faixa de level por zona, spawns por monstro, NPCs, portais com rótulo e o
// "próximo passo" (portal ou viagem) entre regiões. Puro: construído UMA vez a partir do world.json, no servidor
// (onCreate) e no cliente (depois do worldMapJson). O rótulo do portal é calculado (zona do destino + requisito da
// porta): gravar `label` nos objetos antigos mudaria o mapa publicado (diff-world).
import { CollisionGrid, findObjects, objectTile, type TiledMap, type TiledObject } from "./map.ts";
import { monsterDef } from "./data/monsters.ts";
import { NPCS } from "./data/npcs.ts";
import { questDef } from "./data/quests.ts";
import { doorRequirement, questChestGroup } from "./data/questWorld.ts";

export interface WorldRect { x0: number; y0: number; x1: number; y1: number }
export interface WorldZone { name: string; rects: WorldRect[] }
export interface WorldSpawn { x: number; y: number; zone?: string; count: number }
export interface WorldNpc { id: string; x: number; y: number; zone?: string }
export interface WorldPortal {
  x: number; y: number; toX: number; toY: number;
  minLevel?: number; quest?: string; chestGroup?: string;
  /** Zona do destino. */
  zone?: string;
  /** "Minas Abandonadas · lv 10+": zona do destino + requisito da porta. */
  label: string;
}
/** Próximo passo para trocar de região: tile do portal ou do NPC de viagem. */
export interface WorldHop { x: number; y: number; label: string; kind: "portal" | "travel" }
/**
 * O personagem atravessa esta porta? (Mesma regra do rótulo vermelho: level, missão, baú.) Sem filtro, toda porta passa:
 * a rota de um lv 88 não pode passar pela porta lv 100 da Cidadela quando há demônio no Abismo, aberto.
 */
export type PortalFilter = (p: WorldPortal) => boolean;

export interface WorldIndex {
  readonly width: number;
  readonly height: number;
  zones: WorldZone[];
  zoneAt(x: number, y: number): string | undefined;
  /** Faixa de level dos monstros não-chefe da zona (dos spawns). */
  zoneLevels(zone: string): { min: number; max: number } | undefined;
  /**
   * Faixa de level dos monstros não-chefe em volta de (x,y), na mesma região a pé: os spawns a até `radius` tiles ou,
   * se forem menos de `minCount`, os `minCount` mais perto. O destino de uma viagem é uma vila protegida sem monstro;
   * o que interessa é o que há em volta dela. undefined = região sem monstro (Oficina).
   */
  levelsNear(x: number, y: number, radius?: number, minCount?: number): { min: number; max: number } | undefined;
  spawnsOf(monsterId: string): WorldSpawn[];
  npcAt(npcId: string): WorldNpc | undefined;
  npcs: WorldNpc[];
  /** Portais com rótulo calculado ("Minas Abandonadas · lv 10+"): zona do destino + minLevel/missão. */
  portals: WorldPortal[];
  portalAt(x: number, y: number): WorldPortal | undefined;
  /** Região conectada a pé que contém o tile (ou a mais perto dele, para NPC/portal); 0 = nenhuma. */
  componentAt(x: number, y: number): number;
  /**
   * Próximo passo (tile de portal ou NPC de viagem) para ir de `from` até `to`; null se andar direto é o melhor caminho
   * (mesmo componente e nenhuma viagem encurta) ou se não há caminho. `canPass` pula as portas que o personagem não abre.
   */
  nextHop(from: { x: number; y: number }, to: { x: number; y: number }, canPass?: PortalFilter): WorldHop | null;
  /**
   * Custo estimado (tiles + troca de região) de `from` até `to`; Infinity sem caminho. Serve para escolher o spawn mais
   * perto. `canPass` pula as portas que o personagem não abre.
   */
  travelCost(from: { x: number; y: number }, to: { x: number; y: number }, canPass?: PortalFilter): number;
}

export interface WorldIndexOptions {
  /** Level do monstro para a faixa da zona; undefined = não conta (padrão: MonsterDef.level, sem bonecos de treino). */
  monsterLevel?: (id: string) => number | undefined;
  isBoss?: (id: string) => boolean;
}

/** Custo (em "tiles") de atravessar um portal ou pegar uma viagem: andar até um portal perto vale mais que um longe. */
const HOP_COST = 20;
/** Viagem paga e com diálogo: só ganha de um portal quando poupa caminhada de verdade. */
const TRAVEL_EXTRA = 15;
/** Padrões de `levelsNear`: raio (tiles) que cobre as zonas vizinhas de uma vila de chegada, e mínimo de spawns. */
export const LEVELS_NEAR_RADIUS = 40;
export const LEVELS_NEAR_MIN = 6;
/**
 * Bolsão andável menor que isto (o tile solto atrás do balcão do sacerdote do Porto) não serve de região para NPC ou
 * portal fora do chão andável, a não ser que não haja outra por perto: a rota partiria de um bolsão sem saída (custo
 * infinito) e a seta apontaria através da parede.
 */
const MIN_COMPONENT = 4;

const prop = (o: TiledObject, name: string): unknown => o.properties?.find((p) => p.name === name)?.value;
const cheb = (ax: number, ay: number, bx: number, by: number) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));

/** "Minas Abandonadas · lv 10+", "Ninho dos Dragões de Gelo · missão O Yeti", "Floresta Sussurrante". */
export function portalLabel(zone: string | undefined, req: { minLevel?: number; quest?: string; chestGroup?: string } | undefined): string {
  const parts = [zone ?? "Passagem"];
  if (req?.minLevel) parts.push(`lv ${req.minLevel}+`);
  if (req?.quest) parts.push(`missão ${questDef(req.quest)?.name ?? req.quest}`);
  if (req?.chestGroup) parts.push(questChestGroup(req.chestGroup)?.name ?? req.chestGroup);
  return parts.join(" · ");
}

interface Edge {
  from: number; to: number; x: number; y: number; toX: number; toY: number; label: string; kind: WorldHop["kind"];
  /** Porta atravessada (kind "portal"): o filtro `canPass` da rota olha o requisito dela. */
  portal?: WorldPortal;
}

export function buildWorldIndex(map: TiledMap, opts: WorldIndexOptions = {}): WorldIndex {
  const W = map.width, H = map.height, N = W * H, t = map.tilewidth;
  const monsterLevel = opts.monsterLevel ?? ((id: string) => {
    const d = monsterDef(id);
    return d && !d.invulnerable && !d.stationary ? d.level : undefined;
  });
  const isBoss = opts.isBoss ?? ((id: string) => !!monsterDef(id)?.boss);

  // --- zonas (menor área vence, como zoneAt de daynight.ts e o minimapa) ---
  const rects = findObjects(map, "zone").filter((o) => o.name).map((o) => ({
    name: o.name,
    x0: Math.floor(o.x / t), y0: Math.floor(o.y / t),
    x1: Math.floor((o.x + Math.max(1, o.width) - 1) / t), y1: Math.floor((o.y + Math.max(1, o.height) - 1) / t),
  }));
  const zoneMap = new Map<string, WorldRect[]>();
  for (const r of rects) {
    const list = zoneMap.get(r.name) ?? [];
    list.push({ x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1 });
    zoneMap.set(r.name, list);
  }
  const zones: WorldZone[] = [...zoneMap].map(([name, rs]) => ({ name, rects: rs }));
  const zoneAt = (x: number, y: number): string | undefined => {
    let best: (typeof rects)[number] | undefined, bestArea = Infinity;
    for (const r of rects) {
      if (x < r.x0 || y < r.y0 || x > r.x1 || y > r.y1) continue;
      const area = (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1);
      if (area < bestArea) { best = r; bestArea = area; }
    }
    return best?.name;
  };

  // --- spawns e faixa de level por zona ---
  const spawns = new Map<string, WorldSpawn[]>();
  const levels = new Map<string, { min: number; max: number }>();
  /** Spawns que contam para faixa de level (não-chefe, com level). */
  const leveled: { x: number; y: number; lv: number }[] = [];
  for (const o of findObjects(map, "monster_spawn")) {
    const id = String(prop(o, "monster") ?? o.name ?? "");
    if (!id) continue;
    const p = objectTile(o, t);
    const zone = zoneAt(p.x, p.y);
    const list = spawns.get(id) ?? [];
    list.push({ x: p.x, y: p.y, ...(zone ? { zone } : {}), count: Math.max(1, Math.floor(Number(prop(o, "count") ?? 1)) || 1) });
    spawns.set(id, list);
    const lv = monsterLevel(id);
    if (lv === undefined || isBoss(id)) continue;
    leveled.push({ x: p.x, y: p.y, lv });
    if (!zone) continue;
    const z = levels.get(zone);
    if (z) { z.min = Math.min(z.min, lv); z.max = Math.max(z.max, lv); } else levels.set(zone, { min: lv, max: lv });
  }

  // --- NPCs ---
  const npcs: WorldNpc[] = [];
  const npcById = new Map<string, WorldNpc>();
  for (const o of findObjects(map, "npc")) {
    const id = String(prop(o, "npcId") ?? o.name ?? "");
    if (!id || npcById.has(id)) continue;
    const p = objectTile(o, t);
    const zone = zoneAt(p.x, p.y);
    const n: WorldNpc = { id, x: p.x, y: p.y, ...(zone ? { zone } : {}) };
    npcs.push(n);
    npcById.set(id, n);
  }

  // --- portais ---
  const portals: WorldPortal[] = [];
  const portalByTile = new Map<number, WorldPortal>();
  for (const o of findObjects(map, "portal")) {
    const toX = Number(prop(o, "toX")), toY = Number(prop(o, "toY"));
    if (!Number.isFinite(toX) || !Number.isFinite(toY)) continue;
    const p = objectTile(o, t);
    const req = doorRequirement(o);
    const zone = zoneAt(toX, toY);
    const portal: WorldPortal = { x: p.x, y: p.y, toX, toY, ...req, ...(zone ? { zone } : {}), label: portalLabel(zone, req) };
    portals.push(portal);
    portalByTile.set(p.y * W + p.x, portal);
  }

  // --- componentes conectados a pé (4-vizinhos bastam: o passo diagonal não corta quina) ---
  // Tile de portal conta como parede: pisar nele teleporta, então ninguém atravessa a pé (porta no meio do corredor).
  const grid = CollisionGrid.fromTiled(map);
  const open = new Uint8Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) open[y * W + x] = grid.isWalkable(x, y) ? 1 : 0;
  for (const k of portalByTile.keys()) open[k] = 0;
  const comp = new Uint32Array(N);
  /** Tiles de cada componente (índice = número do componente). */
  const compSize: number[] = [0];
  const queue = new Int32Array(N);
  let nComp = 0;
  for (let s = 0; s < N; s++) {
    if (comp[s] || !open[s]) continue;
    const c = ++nComp;
    let head = 0, tail = 0;
    comp[s] = c; queue[tail++] = s;
    while (head < tail) {
      const i = queue[head++]!;
      const x = i % W;
      if (x > 0 && open[i - 1] && !comp[i - 1]) { comp[i - 1] = c; queue[tail++] = i - 1; }
      if (x < W - 1 && open[i + 1] && !comp[i + 1]) { comp[i + 1] = c; queue[tail++] = i + 1; }
      if (i >= W && open[i - W] && !comp[i - W]) { comp[i - W] = c; queue[tail++] = i - W; }
      if (i + W < N && open[i + W] && !comp[i + W]) { comp[i + W] = c; queue[tail++] = i + W; }
    }
    compSize[c] = tail;
  }
  const compRaw = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : comp[y * W + x]!);
  /**
   * Componentes no anel mais perto de (x,y) que tenha algum (NPC atrás do balcão, portal, destino ocupado). Bolsões de
   * menos de MIN_COMPONENT tiles ficam de fora enquanto houver outro componente até maxR (só sobram se não houver).
   */
  const compsNear = (x: number, y: number, maxR = 3): number[] => {
    const own = compRaw(x, y);
    if (own) return [own];
    let pockets: number[] = [];
    for (let r = 1; r <= maxR; r++) {
      const found = new Set<number>(), tiny = new Set<number>();
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        // Raio 1: só os 4 vizinhos (pisar num portal na diagonal exige os dois lados livres, que já estão nos 4).
        if (r === 1 && dx !== 0 && dy !== 0) continue;
        const c = compRaw(x + dx, y + dy);
        if (c) (compSize[c]! >= MIN_COMPONENT ? found : tiny).add(c);
      }
      if (found.size) return [...found];
      if (!pockets.length && tiny.size) pockets = [...tiny];
    }
    return pockets;
  };
  const componentAt = (x: number, y: number): number => compsNear(x, y)[0] ?? 0;

  // --- arestas: portais e destinos de viagem dos NPCs ---
  const edges: Edge[] = [];
  for (const p of portals) {
    const to = componentAt(p.toX, p.toY);
    if (!to) continue;
    for (const from of compsNear(p.x, p.y)) edges.push({ from, to, x: p.x, y: p.y, toX: p.toX, toY: p.toY, label: p.label, kind: "portal", portal: p });
  }
  for (const n of npcs) {
    const def = Object.hasOwn(NPCS, n.id) ? NPCS[n.id] : undefined;
    if (!def?.travel?.length) continue;
    for (const from of compsNear(n.x, n.y)) {
      for (const d of def.travel) {
        const to = componentAt(d.x, d.y);
        // Mesmo componente também vale: a carroça da Vila ao Porto poupa ~300 tiles de estrada.
        if (to) edges.push({ from, to, x: n.x, y: n.y, toX: d.x, toY: d.y, label: `${def.name} → ${d.label}`, kind: "travel" });
      }
    }
  }
  const leveledComp = leveled.map((s) => componentAt(s.x, s.y));
  const edgesFrom = new Map<number, number[]>();
  edges.forEach((e, i) => { const l = edgesFrom.get(e.from) ?? []; l.push(i); edgesFrom.set(e.from, l); });

  /**
   * Dijkstra nos "pontos de chegada" (origem + chegada de cada aresta): custo = tiles em linha reta (Chebyshev) dentro
   * do componente + HOP_COST por troca. Poucas dezenas de arestas: O(V²) sem fila de prioridade.
   */
  const route = (from: { x: number; y: number }, to: { x: number; y: number }, canPass?: PortalFilter): { cost: number; first: number } | null => {
    const a = componentAt(from.x, from.y), b = componentAt(to.x, to.y);
    if (!a || !b) return null;
    const V = edges.length + 1; // 0 = origem; i+1 = chegada da aresta i
    const dist = new Float64Array(V).fill(Infinity);
    const first = new Int32Array(V).fill(-1);
    const done = new Uint8Array(V);
    dist[0] = 0;
    let best = Infinity, bestFirst = -1;
    for (;;) {
      let s = -1;
      for (let i = 0; i < V; i++) if (!done[i] && dist[i] < Infinity && (s < 0 || dist[i]! < dist[s]!)) s = i;
      if (s < 0 || dist[s]! >= best) break;
      done[s] = 1;
      const sx = s === 0 ? from.x : edges[s - 1]!.toX, sy = s === 0 ? from.y : edges[s - 1]!.toY;
      const sc = s === 0 ? a : edges[s - 1]!.to;
      if (sc === b) {
        // Chegou ao componente do destino; segue relaxando (uma viagem dali ainda pode encurtar a estrada).
        const c = dist[s]! + cheb(sx, sy, to.x, to.y);
        if (c < best) { best = c; bestFirst = first[s]!; }
      }
      for (const ei of edgesFrom.get(sc) ?? []) {
        const e = edges[ei]!;
        if (canPass && e.portal && !canPass(e.portal)) continue;
        const c = dist[s]! + cheb(sx, sy, e.x, e.y) + HOP_COST + (e.kind === "travel" ? TRAVEL_EXTRA : 0);
        if (c < dist[ei + 1]!) { dist[ei + 1] = c; first[ei + 1] = s === 0 ? ei : first[s]!; }
      }
    }
    return best < Infinity ? { cost: best, first: bestFirst } : null;
  };

  return {
    width: W, height: H, zones, zoneAt, npcs, portals,
    zoneLevels: (zone) => { const z = levels.get(zone); return z ? { ...z } : undefined; },
    levelsNear(x, y, radius = LEVELS_NEAR_RADIUS, minCount = LEVELS_NEAR_MIN) {
      const c = componentAt(x, y);
      if (!c) return undefined;
      const near = leveled.flatMap((s, i) => (leveledComp[i] === c ? [{ lv: s.lv, d: cheb(s.x, s.y, x, y) }] : []))
        .sort((a, b) => a.d - b.d);
      let min = Infinity, max = -Infinity;
      near.forEach((s, i) => {
        if (s.d > radius && i >= minCount) return;
        if (s.lv < min) min = s.lv;
        if (s.lv > max) max = s.lv;
      });
      return min <= max ? { min, max } : undefined;
    },
    spawnsOf: (id) => spawns.get(id) ?? [],
    npcAt: (id) => npcById.get(id),
    portalAt: (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? undefined : portalByTile.get(y * W + x)),
    componentAt,
    nextHop(from, to, canPass) {
      const r = route(from, to, canPass);
      if (!r || r.first < 0) return null;
      const e = edges[r.first]!;
      return { x: e.x, y: e.y, label: e.label, kind: e.kind };
    },
    travelCost: (from, to, canPass) => route(from, to, canPass)?.cost ?? Infinity,
  };
}

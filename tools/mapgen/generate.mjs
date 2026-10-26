// The Lemon Quest overworld generator. Deterministic (seeded). Run: node tools/mapgen/generate.mjs
// Outputs assets/maps/world.json, preview.png (16px/tile), preview-small.png (4px/tile). Fails loudly if BFS reachability checks fail.
import fs from 'node:fs';
import path from 'node:path';
import { Tilesets, GameMap, mulberry32, noise2, fbm, blobTable, blobMask, bfs, renderPreview, MAPS_DIR, here } from './lib.mjs';
import { S } from './stamps.mjs';
import { createLemon } from './lemon.mjs';
import { polish } from './polish.mjs';
import { expand } from './expansion.mjs';
import { expand2 } from './expansion2.mjs';
import { expand3 } from './expansion3.mjs';
import { expand4 } from './expansion4.mjs';
import { expand5 } from './expansion5.mjs';
import { drawEntrances14 } from './entrances14.mjs';
import { PNG } from 'pngjs';

const SEED = 20260611;
// Overworld = rows 0..OW_H-1. Dungeons live far below (>= 26 tiles of solid void between them and any overworld tile).
const W = 160, OW_H = 120, DY = 62, DUNGEON_BOTTOM = 181, H = 288; // rows below DUNGEON_BOTTOM hold the 4 colosseum arenas (void area)
const rng = mulberry32(SEED);
const rng2 = mulberry32(SEED + 1); // separate stream for the training center / colosseum so the old content stays byte-stable
const pick2 = (arr) => arr[Math.floor(rng2() * arr.length)];
const rnd = (a, b) => a + rng() * (b - a);
const ri = (a, b) => Math.floor(rnd(a, b + 1));
const pick = (arr) => arr[Math.floor(rng() * arr.length)];
const pickW = (pairs) => { let t = pairs.reduce((s, p) => s + p[1], 0), r = rng() * t; for (const [v, w] of pairs) { if ((r -= w) <= 0) return v; } return pairs[0][0]; };

const ts = new Tilesets();
const map = new GameMap(W, H, ts);
const LEMON = createLemon(ts); // generated art tileset, appended last (gids of the pack tilesets stay stable)
const blob = blobTable();
const idx = (x, y) => y * W + x;
const inb = (x, y) => x >= 0 && y >= 0 && x < W && y < H;

// ===================================================================== regions
const CAVE = { x0: 0, x1: 56, y0: 84 + DY, y1: DUNGEON_BOTTOM };
const CRYPT = { x0: 104, x1: W - 1, y0: 98 + DY, y1: DUNGEON_BOTTOM };
const TOWN = { x0: 60, x1: 100, y0: 77, y1: 113 };
const inRect = (r, x, y) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;

function regionAt(x, y) {
  if (inRect(CAVE, x, y)) return 'cave';
  if (inRect(CRYPT, x, y)) return 'crypt';
  if (inRect(TOWN, x, y)) return 'town';
  if (y >= OW_H) return 'void';
  const w = (fbm(x, y, 12, 5) - 0.5) * 10;
  if (y <= 37 + w && x >= 86 + w) return 'ruins';
  if (x >= 104 + w && y >= 39 + w && y <= 97) return 'swamp';
  return 'forest';
}
const region = new Array(W * H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) region[idx(x, y)] = regionAt(x, y);
const reg = (x, y) => (inb(x, y) ? region[idx(x, y)] : 'void');
const isLand = (x, y) => { const r = reg(x, y); return r !== 'void' && r !== 'cave' && r !== 'crypt'; };
// border band: land cells within 3 tiles of non-land
const band = new Uint8Array(W * H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  if (!isLand(x, y)) continue;
  outer: for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) if (!isLand(x + i, y + j)) { band[idx(x, y)] = 1; break outer; }
}

// ===================================================================== masks
const dirt = new Uint8Array(W * H), water = new Uint8Array(W * H), pave = new Uint8Array(W * H);
const mud = new Uint8Array(W * H); // swamp mud patches (slow, decorative); other swamp dirt = trails (dark dirt, faster than the soil)
const roadPts = []; // all road centre points, for trails

function disc(cx, cy, r, fn) {
  for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
    if (!inb(x, y)) continue;
    if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) fn(x, y);
  }
}
/** paint a winding dirt path through waypoints. width in tiles. */
function road(points, width = 3, { wobble = 2.2, record = true, seed = 3 } = {}) {
  for (let s = 0; s < points.length - 1; s++) {
    const [ax, ay] = points[s], [bx, by] = points[s + 1];
    const len = Math.hypot(bx - ax, by - ay);
    const nx = -(by - ay) / (len || 1), ny = (bx - ax) / (len || 1);
    const steps = Math.ceil(len * 1.5);
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const env = Math.sin(Math.PI * t) ** 0.5; // no wobble at waypoints
      const off = (noise2(ax + t * (bx - ax) + 100, ay + t * (by - ay) + 100, 7, seed) - 0.5) * 2 * wobble * (0.4 + env);
      const px = ax + (bx - ax) * t + nx * off, py = ay + (by - ay) * t + ny * off;
      disc(px, py, width / 2, (x, y) => { if (isLand(x, y) && !band[idx(x, y)]) { dirt[idx(x, y)] = 1; } });
      disc(px, py, width / 2 + 1.2, (x, y) => map.reserve(x, y));
      if (record && k % 3 === 0) roadPts.push([Math.round(px), Math.round(py)]);
    }
  }
}
function lake(cx, cy, rx, ry, seed) {
  for (let y = Math.floor(cy - ry - 3); y <= cy + ry + 3; y++) for (let x = Math.floor(cx - rx - 3); x <= cx + rx + 3; x++) {
    if (!inb(x, y) || !isLand(x, y) || band[idx(x, y)] || reg(x, y) !== reg(Math.round(cx), Math.round(cy))) continue;
    const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
    const n = (noise2(x, y, 4, seed) - 0.5) * 0.7;
    if (d + n < 1 && map.occ[idx(x, y)] === 0) water[idx(x, y)] = 1;
  }
}

// ---------------------------------------------------------------- town layout (pavement union, nine-sliced)
const plazaRects = [[70, 91, 90, 101], [78, 86, 80, 91]];
for (const [x0, y0, x1, y1] of plazaRects) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) pave[idx(x, y)] = 1;

// ---------------------------------------------------------------- roads
const TOWN_N = [72, 77], TOWN_W = [60, 97], TOWN_E = [100, 97];
// town streets
road([[72, 90], [72, 77]], 2, { wobble: 0, record: false });
road([[60, 97], [70, 97]], 2, { wobble: 0 });
road([[90, 97], [100, 97]], 2, { wobble: 0 });
road([[63, 85], [63, 96]], 2, { wobble: 0, record: false });
road([[92, 85], [92, 96]], 2, { wobble: 0, record: false });
road([[65, 106], [72, 106], [72, 102]], 2, { wobble: 0, record: false });
road([[95, 106], [88, 106], [88, 102]], 2, { wobble: 0, record: false });
road([[79, 107], [79, 108], [72, 108], [72, 106]], 2, { wobble: 0, record: false });
road([[65, 96], [65, 97]], 2, { wobble: 0, record: false });
road([[95, 96], [95, 97]], 2, { wobble: 0, record: false });
// main roads
road([[72, 77], [72, 68], [66, 58], [62, 46], [56, 36], [48, 28], [42, 20]], 3);
road([[62, 46], [72, 40], [84, 36], [96, 30], [108, 24], [120, 20]], 3);
road([[60, 97], [50, 92], [44, 84], [36, 76], [26, 68], [20, 60], [14, 50], [12, 38], [12, 26]], 3);
road([[100, 97], [106, 92], [110, 84], [114, 76], [118, 68], [122, 62], [128, 64]], 3);
road([[114, 74], [106, 62], [98, 58], [97, 56]], 2);
road([[122, 62], [130, 52], [138, 46], [146, 50]], 3);
road([[126, 64], [134, 72], [140, 80], [146, 88]], 3);
road([[138, 46], [134, 40], [130, 34], [128, 30]], 3);
road([[128, 30], [140, 34], [150, 28], [150, 14]], 3);
road([[120, 20], [116, 19], [106, 19]], 2);
road([[108, 24], [108, 18]], 2);
road([[42, 20], [38, 12]], 2);
road([[20, 60], [19, 59]], 2);

// ---------------------------------------------------------------- monster spawns (declared early to carve trails + clearings)
const dy = (sp) => [...sp.slice(0, 5), sp[5] + DY]; // dungeon spawns are authored in the old (pre-offset) coordinates
const spawns = [
  // forest 1-10
  ['rat', 4, 5, 1, 70, 62], ['rat', 3, 4, 2, 26, 72], ['slime', 4, 5, 3, 50, 64], ['slime', 3, 5, 4, 34, 60], ['slime', 4, 5, 5, 90, 60],
  ['bee', 4, 5, 5, 44, 24], ['bee', 3, 4, 6, 66, 30], ['wolf', 3, 6, 7, 22, 24], ['wolf', 3, 6, 8, 54, 12], ['wolf', 4, 5, 9, 14, 42], ['wolf', 3, 5, 10, 76, 18],
  // swamp 10-25
  ['snake', 4, 5, 10, 116, 52], ['spider', 4, 5, 14, 132, 58], ['snake', 4, 5, 16, 142, 72], ['spider', 4, 5, 18, 118, 84], ['skeleton', 3, 5, 20, 148, 62], ['bat', 4, 5, 22, 126, 76],
  // ruins 25-40
  ['goblin', 4, 5, 25, 96, 24], ['goblin', 4, 5, 27, 110, 32], ['ghost', 3, 5, 30, 100, 10], ['ghost', 3, 5, 31, 124, 34], ['lizardman', 4, 5, 33, 148, 24], ['flame_spirit', 4, 5, 38, 148, 10],
  ['lizardman', 3, 5, 35, 140, 38],
  // bosses
  ['goblin_king', 1, 3, 40, 128, 19], ['swamp_lich', 1, 3, 25, 146, 88],
  // caves (Cavernas)
  ...[['snake', 3, 4, 12, 28, 106], ['spider', 3, 4, 16, 30, 107], ['snake', 3, 4, 14, 14, 92], ['bat', 4, 5, 18, 30, 91], ['skeleton', 4, 5, 22, 47, 93], ['skeleton', 3, 5, 24, 46, 109], ['bat', 3, 4, 20, 10, 109]].map(dy),
  // crypt (Cripta)
  ...[['skeleton', 3, 4, 30, 112, 108], ['ghost', 3, 5, 35, 148, 108], ['ghost', 3, 4, 34, 128, 102], ['skeleton', 3, 4, 32, 130, 112]].map(dy),
];
// clearings + trails for overworld spawns
for (const [m, , r, , x, y] of spawns) {
  if (!isLand(x, y)) continue;
  const rr = Math.max(2, r - 2); map.reserve(x - rr, y - rr, rr * 2 + 1, rr * 2 + 1);
}
function nearestRoad(x, y) { let best = null, bd = 1e9; for (const p of roadPts) { const d = (p[0] - x) ** 2 + (p[1] - y) ** 2; if (d < bd) { bd = d; best = p; } } return best; }
for (const [m, , r, , x, y] of spawns) {
  if (!isLand(x, y)) continue;
  const rp = nearestRoad(x, y);
  if (rp && (rp[0] - x) ** 2 + (rp[1] - y) ** 2 > 36) road([[x, y], rp], 2, { record: false, wobble: 3 });
}

// ---------------------------------------------------------------- lakes & pools
lake(32, 38, 9, 6, 11);
lake(82, 50, 5, 4, 12);
lake(20, 14, 4, 3, 13);
// swamp pools (murky) + mud
for (let i = 0; i < 70; i++) {
  const x = ri(104, 156), y = ri(41, 96);
  if (reg(x, y) !== 'swamp') continue;
  lake(x, y, rnd(2, 5), rnd(1.5, 3.5), 100 + i);
}
// keep the lich's island clear
for (let y = 80; y <= 94; y++) for (let x = 138; x <= 154; x++) { water[idx(x, y)] = 0; }
for (let pass = 0; pass < 2; pass++) { const rm = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { if (!water[idx(x, y)]) continue; const g = (a, b) => inb(a, b) && water[idx(a, b)]; if (!((g(x - 1, y) && g(x + 1, y)) && (g(x, y - 1) && g(x, y + 1)))) rm.push(idx(x, y)); } if (pass === 0) for (const i of rm) { const x = i % W, y = (i / W) | 0; const g = (a, b) => inb(a, b) && water[idx(a, b)]; if (!((g(x - 1, y) || g(x + 1, y)) && (g(x, y - 1) || g(x, y + 1)))) water[i] = 0; } }
// remove dirt near water (keeps shores clean) and under town plaza
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  if (!dirt[idx(x, y)]) continue;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (inb(x + i, y + j) && water[idx(x + i, y + j)]) dirt[idx(x, y)] = 0;
  if (pave[idx(x, y)]) dirt[idx(x, y)] = 0;
}
// swamp mud patches (decorative dirt blobs, avoid roads' halo is irrelevant: mud may merge with roads)
for (let i = 0; i < 40; i++) {
  const x = ri(104, 156), y = ri(41, 96);
  if (reg(x, y) !== 'swamp') continue;
  disc(x, y, rnd(1.5, 3.5), (a, b) => { if (reg(a, b) === 'swamp' && !band[idx(a, b)] && !water[idx(a, b)]) { if (!dirt[idx(a, b)]) mud[idx(a, b)] = 1; dirt[idx(a, b)] = 1; } });
}
// goblin king arena: dark dirt floor
const ARENA = { x0: 116, y0: 10, x1: 140, y1: 28 };
for (let y = ARENA.y0; y <= ARENA.y1; y++) for (let x = ARENA.x0; x <= ARENA.x1; x++) {
  const dx = Math.min(x - ARENA.x0, ARENA.x1 - x), dy = Math.min(y - ARENA.y0, ARENA.y1 - y);
  if (dx + dy < 2) continue; // chamfer
  dirt[idx(x, y)] = 1; water[idx(x, y)] = 0; map.reserve(x, y);
}
// lich shrine island: mud
disc(146, 88, 6, (x, y) => { if (!water[idx(x, y)]) { dirt[idx(x, y)] = 1; mud[idx(x, y)] = 1; } });
map.reserve(139, 81, 15, 13);

// ===================================================================== ground resolve
const STYLE = {
  forest: { tint: 'L', grass: [[0, 12]], tufts: [[1, 12], [2, 12], [3, 12], [4, 12]], dirt: ['F', 0, 0], water: ['W', 0, -1] },
  town: null, ruins: { tint: 'D', grass: [[11, 12]], tufts: [[12, 12], [13, 12], [14, 12], [15, 12]], dirt: ['F', 11, 0], water: ['W', 0, -1] },
  swamp: { tint: 'S', grass: [[11, 19]], tufts: [[12, 19], [13, 19], [14, 19], [15, 19]], dirt: ['F', 11, 7], water: ['W', 13, -1] },
};
STYLE.town = STYLE.forest;
const WATER_FILL_ALT = null;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const r = reg(x, y);
  if (r === 'cave' || r === 'crypt' || r === 'void') continue;
  const st = STYLE[r] ?? STYLE.forest;
  const [gc, gr] = rng() < 0.16 ? pick(st.tufts) : st.grass[0];
  map.put('ground', x, y, 'F', gc, gr);
  if (water[idx(x, y)]) {
    const [t, dc, dr] = st.water;
    const mask = blobMask((a, b) => !inb(a, b) ? true : water[idx(a, b)] === 1, x, y);
    const [c, rr] = blob[mask];
    map.put('ground', x, y, t, c + dc, rr + dr);
    map.block(x, y);
  } else if (pave[idx(x, y)]) {
    const inP = (a, b) => inb(a, b) && pave[idx(a, b)] === 1;
    const top = !inP(x, y - 1), bot = !inP(x, y + 1), lef = !inP(x - 1, y), rig = !inP(x + 1, y);
    const col = lef ? 0 : rig ? 2 : 1;
    const row = top ? 12 : bot ? 15 : 13;
    map.put('ground', x, y, 'I', col, row);
  } else if (dirt[idx(x, y)]) {
    let [t, dc, dr] = st.dirt;
    const isMud = r === 'swamp' && mud[idx(x, y)] === 1, isTrail = r === 'swamp' && !isMud;
    if (isTrail) [t, dc, dr] = ['F', 11, 0]; // swamp trails: dark dirt (speed 95) instead of mud (150)
    const mask = blobMask((a, b) => !inb(a, b) ? false : r === 'swamp' ? (dirt[idx(a, b)] === 1 && (mud[idx(a, b)] === 1) === isMud) : dirt[idx(a, b)] === 1 || pave[idx(a, b)] === 1, x, y);
    let [c, rr] = blob[mask];
    if (mask === '11111111' && rng() < 0.05) [c, rr] = [pick([0, 1]), 11];
    map.put('ground', x, y, t, c + dc, rr + dr);
  }
}

// ===================================================================== helpers for placement
const walkableGround = (x, y) => inb(x, y) && isLand(x, y) && !band[idx(x, y)] && !dirt[idx(x, y)] && !water[idx(x, y)] && !pave[idx(x, y)];
/** place a named stamp at top-left (x,y); returns false if footprint is not free (when check) */
function place(name, x, y, { check = true, extra = {} } = {}) {
  const [t, c, r, w, h, o = {}] = S[name];
  if (check) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      if (!walkableGround(x + i, y + j) || map.occ[idx(x + i, y + j)]) return false;
    }
  }
  map.stamp(t, c, r, w, h, x, y, { ...o, ...extra });
  return true;
}
const put1 = (x, y, t, c, r, { block = false, layer = 'deco' } = {}) => { map.put(layer, x, y, t, c, r); if (block) map.block(x, y); };

// ===================================================================== TOWN
// fences (palisade) around the village, with gates at the roads
function fenceH(y, x0, x1, gaps) { for (let x = x0; x <= x1; x++) { if (gaps.some(([a, b]) => x >= a && x <= b)) continue; put1(x, y, 'F', 0, 0, {}); map.layers.deco[idx(x, y)] = ts.gid('H', x % 2 ? 11 : 12, 5); map.block(x, y); map.reserve(x, y); } }
function fenceV(x, y0, y1, gaps) { for (let y = y0; y <= y1; y++) { if (gaps.some(([a, b]) => y >= a && y <= b)) continue; map.layers.deco[idx(x, y)] = ts.gid('H', 11, 6); map.block(x, y); map.reserve(x, y); } }
fenceH(78, 61, 99, [[71, 73]]);
fenceH(112, 61, 99, [[78, 80]]);
fenceV(60, 78, 112, [[95, 98]]);
fenceV(100, 78, 112, [[95, 98]]);

// buildings
const bx = (name, x, y) => { if (!place(name, x, y, { check: false })) throw new Error('place ' + name); };
bx('houseBeige', 78, 83); // temple, door (79,85)
bx('statueB', 75, 84); bx('statue', 83, 84);
bx('torii', 78, 87);
bx('shopBlue', 64, 93); // door (65,95)
bx('inn', 94, 93); // depot, door (96,95)
bx('houseOrange', 62, 82); // door (63,84)
bx('houseRed', 91, 82); // door (92,84)
bx('peach', 64, 103); // door (65,105)
bx('yurt', 94, 103); // door (95,105)
bx('houseOrange2', 78, 104); // door (79,106)
// plaza props
bx('well', 80, 96);
for (const [lx, ly] of [[71, 92], [89, 92], [71, 99], [89, 99], [79, 87 - 0]]) { if (!(lx === 79)) place('lamp', lx, ly, { check: false }); }
place('lamp', 77, 90, { check: false }); place('lamp', 81, 90, { check: false });
bx('board', 75, 92);
// flowerbeds / trees inside the town
function flowerAt(x, y) { const k = pickW([[[0, 11], 3], [[1, 11], 3], [[2, 11], 2], [[3, 11], 2], [[6, 11], 3]]); put1(x, y, 'N', k[0], k[1]); }
for (let y = 79; y < 112; y++) for (let x = 61; x < 100; x++) {
  if (map.occ[idx(x, y)] || dirt[idx(x, y)] || pave[idx(x, y)] || map.layers.deco[idx(x, y)]) continue;
  const n = noise2(x, y, 5, 77);
  if (rng() < (n > 0.55 ? 0.14 : 0.03)) flowerAt(x, y);
}
for (const [x, y] of [[62, 90], [66, 88], [88, 88], [96, 89], [68, 110], [84, 109], [96, 110], [76, 100 + 6], [61, 100], [98, 100]]) place('treeOlive2', x, y, { check: true });
// flowers framing the temple
for (const [x, y] of [[77, 86], [81, 86], [77, 89], [81, 89], [76, 90], [82, 90]]) if (!map.occ[idx(x, y)] && !pave[idx(x, y)]) flowerAt(x, y);

// ===================================================================== wilderness huts / POIs
bx('yurt', 18, 56); // old hunter hut, door (19,58)
bx('yurt', 96, 52); // herbalist hut, door (97,54)
// mausoleum (Cripta door) in the ruins: wall blocks + skull door
const MAUS = { x: 104, y: 14, w: 5, h: 3 };
for (let j = 0; j < 3; j++) for (let i = 0; i < MAUS.w; i++) {
  const col = i === 0 ? 4 : i === MAUS.w - 1 ? 6 : 5;
  map.put('deco', MAUS.x + i, MAUS.y + j, 'R', col, j);
  map.block(MAUS.x + i, MAUS.y + j);
}
map.put('deco', 106, 16, 'D', 2, 0); map.block(106, 16, false); // skull door
map.reserve(MAUS.x - 4, MAUS.y - 2, MAUS.w + 8, MAUS.h + 6);
place('statue', 101, 15, { check: false }); place('statueB', 109, 15, { check: false }); place('graveCross', 103, 18, { check: false }); place('graveA', 109, 18, { check: false });
// cave mouth in the swamp
bx('caveMouthGray', 127, 60);
map.reserve(125, 58, 8, 7);
// swamp lich shrine: gravestones around the island
for (let k = 0; k < 14; k++) { const a = rnd(0, Math.PI * 2), d = rnd(3.5, 6); const x = Math.round(146 + Math.cos(a) * d), y = Math.round(88 + Math.sin(a) * d); const g = pick(['graveA', 'graveB', 'graveCross']); if (!map.occ[idx(x, y)] || true) { if (!map.blocked(x, y) && !water[idx(x, y)]) place(g, x, y, { check: false }); } }

// ---------------------------------------------------------------- goblin king arena rim: rocks + pillars
function arenaRim() {
  const gates = [[ARENA.x0, ARENA.y0 + 6, ARENA.x0 + 3, ARENA.y0 + 12], [ARENA.x0 + 9, ARENA.y1 - 2, ARENA.x0 + 15, ARENA.y1 + 2]];
  const inGate = (x, y) => gates.some(([a, b, c, d]) => x >= a - 1 && x <= c + 1 && y >= b - 1 && y <= d + 1);
  for (let x = ARENA.x0 - 2; x <= ARENA.x1 - 1; x += 4) { for (const y of [ARENA.y0 - 3, ARENA.y1 - 0]) { if (!inGate(x, y) && !inGate(x + 3, y)) place(Math.floor(x / 4) % 2 ? 'rockGray4' : 'treePine4', x, y, { check: false }); } }
  for (let y = ARENA.y0; y <= ARENA.y1 - 2; y += 3) { for (const x of [ARENA.x0 - 2, ARENA.x1]) { if (!inGate(x, y) && !inGate(x, y + 2)) place(y % 2 ? 'rockGrayA' : 'boulderGray', x, y, { check: false }); } }
  for (const [x, y] of [[ARENA.x0 + 4, ARENA.y0 + 3], [ARENA.x1 - 4, ARENA.y0 + 3], [ARENA.x0 + 4, ARENA.y1 - 3], [ARENA.x1 - 4, ARENA.y1 - 3]]) place('pillar', x, y, { check: false });
  // bones in the arena
  for (let k = 0; k < 14; k++) { const x = ri(ARENA.x0 + 3, ARENA.x1 - 3), y = ri(ARENA.y0 + 3, ARENA.y1 - 3); if (!map.blocked(x, y)) put1(x, y, 'FD', pick([14, 15, 5, 6]), 0); }
}
arenaRim();
map.reserve(ARENA.x0 - 3, ARENA.y0 - 4, ARENA.x1 - ARENA.x0 + 7, ARENA.y1 - ARENA.y0 + 9);
// clear any blocked-by-rim connection: handled by BFS check

// ===================================================================== trees & scatter
const TREESETS = {
  forest: { dense: [['treeOlive4', 3], ['treePine4', 2], ['treeOliveB4', 2]], mid: [['treeOlive2', 3], ['treePine2', 2], ['treeOliveB2', 2], ['treeRound2', 1], ['treeRoot2', 1]], small: [['treeOlive2', 1]] },
  swamp: { dense: [['treeSwamp4', 1], ['treeDead4', 4]], mid: [['treeSwamp2', 1], ['treeDead2', 6]], small: [['treeDead2', 1]] },
  ruins: { dense: [['treePine4', 3], ['rockGray4', 1]], mid: [['treePine2', 3], ['treeDead2', 1]], small: [['treePine2', 1]] },
  town: { dense: [], mid: [['treeOlive2', 1]], small: [] },
};
function scatterTrees(pass2 = false) {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const r = reg(x, y);
    if (r === 'cave' || r === 'crypt' || r === 'void' || band[idx(x, y)]) continue;
    if (r === 'town') continue;
    const set = TREESETS[r]; if (!set) continue;
    const n = fbm(x, y, 15, r === 'swamp' ? 37 : r === 'ruins' ? 43 : 37);
    let p, pool;
    if (pass2) { if (n < (r === 'swamp' ? 0.44 : 0.49)) continue; if (rng() > (r === 'swamp' ? 0.22 : 0.3)) continue; place(pickW(set.mid), x, y); continue; }
    if (n > (r === 'swamp' ? 0.45 : r === 'ruins' ? 0.47 : 0.51)) { p = 0.5; pool = set.dense.concat(set.mid.map(([a, b]) => [a, b * 0.4])); }
    else if (n > (r === 'swamp' ? 0.36 : r === 'ruins' ? 0.38 : 0.41)) { p = 0.12; pool = set.mid; }
    else { p = r === 'ruins' ? 0.004 : r === 'swamp' ? 0.03 : 0.012; pool = set.small; }

    if (rng() > p) continue;
    place(pickW(pool), x, y);
  }
}
ruinsDecor();
scatterTrees(); scatterTrees(true);

// rocks & boulders
function scatterRocks() {
  const sets = { forest: ['rockBrownA', 'rockBrownB', 'boulderBrown', 'rockSmallBrown', 'rockSmallBrown'], swamp: ['boulderTeal', 'rockSmallGray', 'rockGrayA'], ruins: ['rockGrayA', 'rockGrayB', 'boulderGray', 'rockSmallGray', 'rockGrayWide'] };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const r = reg(x, y); const set = sets[r]; if (!set || band[idx(x, y)]) continue;
    if (rng() < (r === 'ruins' ? 0.008 : 0.004)) place(pick(set), x, y);
  }
}
scatterRocks();

// ruined walls / houses / statues in the ruins
function ruinsDecor() {
  for (let i = 0; i < 110; i++) {
    const x = ri(88, 154), y = ri(4, 36);
    if (reg(x, y) !== 'ruins') continue;
    const k = pickW([['ruinHouse', 1], ['ruinHouse2', 1], ['ruinStatue', 1], ['pillar', 3], ['ruinWall', 1]]);
    place(k, x, y);
  }
  // wall segments from relief wall blocks
  for (let i = 0; i < 200; i++) {
    const x = ri(90, 150), y = ri(5, 34), len = ri(3, 7);
    let ok = true;
    for (let j = 0; j < 2 && ok; j++) for (let k = 0; k < len; k++) if (!walkableGround(x + k, y + j) || map.occ[idx(x + k, y + j)] || reg(x + k, y + j) !== 'ruins') ok = false;
    if (!ok) continue;
    for (let k = 0; k < len; k++) {
      const col = k === 0 ? 4 : k === len - 1 ? 6 : 5;
      const broken = k > 0 && k < len - 1 && rng() < 0.18;
      for (let j = broken ? 1 : 0; j < 2; j++) { map.put('deco', x + k, y + j, 'R', col, j === 0 ? 0 : 2); map.block(x + k, y + j); }
    }
    map.reserve(x, y, len, 2);
  }
}

// graves + bones in the swamp / ruins
for (let i = 0; i < 40; i++) {
  const x = ri(104, 156), y = ri(41, 96);
  if (reg(x, y) !== 'swamp') continue;
  place(pick(['graveA', 'graveB', 'graveCross']), x, y);
}

// ---------------------------------------------------------------- border band: dense trees/rocks (all cells blocked)
const BAND = { forest: ['treePine4', 'treeOlive4', 'treeOliveB4'], town: ['treePine4'], swamp: ['treeSwamp4', 'treeDead4'], ruins: ['treePine4', 'rockGray4'] };
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (band[idx(x, y)]) map.block(x, y);
// first pass: big stamps tiled over band cells
const BAND2 = { forest: ['treePine2', 'treeOlive2', 'treeOliveB2', 'treeRoot2'], town: ['treePine2'], swamp: ['treeSwamp2', 'treeDead2'], ruins: ['treePine2', 'treeDead2'] };
for (const pass of [BAND, BAND2]) for (let y = 0; y < H; y++) for (let x = 0; x < W; x += 1) {
  if (!band[idx(x, y)] || map.layers.deco[idx(x, y)] || map.layers.above[idx(x, y)]) continue;
  const r = reg(x, y); const names = pass[r] ?? pass.forest;
  const name = pick(names);
  const [t, c, rr, w, h] = S[name];
  // footprint must overlap only land cells that are not occupied
  let ok = true;
  for (let j = 0; j < h && ok; j++) for (let i = 0; i < w; i++) { const a = x + i, b = y + j; if (!inb(a, b) || !isLand(a, b) || map.occ[idx(a, b)] || dirt[idx(a, b)] || water[idx(a, b)] || map.layers.deco[idx(a, b)]) { ok = false; break; } }
  if (!ok) continue;
  map.stamp(t, c, rr, w, h, x, y, { baseRows: 1 });
}
// fillers on remaining unoccupied band cells
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  if (!band[idx(x, y)] || map.layers.deco[idx(x, y)] || map.layers.above[idx(x, y)] || water[idx(x, y)]) continue;
  if (dirt[idx(x, y)]) continue;
  const r = reg(x, y);
  const k = r === 'swamp' ? [pick([6, 7, 8]), 12] : r === 'ruins' ? [pick([6, 7, 8]), 12] : [pick([0, 1, 2, 3, 5, 8]), 10];
  put1(x, y, 'N', k[0], k[1], { block: true });
}

// ---------------------------------------------------------------- ground decor (flowers, bushes, plants) on free grass
function scatterDecor() {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!walkableGround(x, y) || map.occ[idx(x, y)] || map.layers.deco[idx(x, y)] || map.layers.above[idx(x, y)]) continue;
    const r = reg(x, y); if (r === 'town') continue;
    const n = noise2(x, y, 6, r === 'forest' ? 71 : 72);
    if (r === 'forest') {
      if (n > 0.62 && rng() < 0.16) flowerAt(x, y);
      else if (rng() < 0.02) put1(x, y, 'N', pick([0, 1, 2, 3, 4, 5, 6, 8]), 10);
      else if (rng() < 0.005) put1(x, y, 'FD', pick([0, 1, 2, 3]), 2);
    } else if (r === 'swamp') {
      if (rng() < 0.05) put1(x, y, 'FD', pick([0, 1, 2, 3, 4, 6]), 2);
      else if (rng() < 0.01) put1(x, y, 'FD', pick([14, 15, 5, 6, 7]), 0);
    } else if (r === 'ruins') {
      if (rng() < 0.03) put1(x, y, 'FD', pick([0, 1, 2, 3, 4]), 2);
      else if (rng() < 0.012) put1(x, y, 'FD', pick([14, 15, 5, 6, 7]), 0);
    }
  }
}
scatterDecor();

// ===================================================================== DUNGEONS (Cavernas + Cripta)
const floorG = new Uint8Array(W * H);
function carve(x0, y0, x1, y1, chamfer = 0) {
  y0 += DY; y1 += DY;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (chamfer) { const dx = Math.min(x - x0, x1 - x), dy = Math.min(y - y0, y1 - y); if (dx + dy < chamfer) continue; }
    floorG[idx(x, y)] = 1;
  }
}
// Cavernas rooms/corridors
carve(6, 104, 16, 112, 2);      // A entry
carve(17, 108, 22, 109);        // A->B
carve(23, 100, 35, 113, 2);     // B
carve(29, 94, 30, 99);          // B->C
carve(24, 88, 36, 93, 2);       // C
carve(37, 90, 41, 90);          // C->D narrow
carve(42, 88, 52, 98, 2);       // D
carve(47, 99, 47, 103);         // D->E narrow
carve(40, 104, 52, 113, 2);     // E
carve(10, 96, 11, 103);         // A->F
carve(4, 89, 16, 95, 2);        // F
carve(17, 91, 23, 91);          // F->C narrow
carve(36, 108, 39, 109);        // B->E
// Cripta rooms
carve(108, 103, 118, 114, 2);   // H west crypt
carve(119, 111, 123, 112);      // H->hall
carve(124, 108, 136, 115, 2);   // hall (entry)
carve(127, 105, 128, 107);      // hall->K
carve(122, 100, 133, 104, 2);   // K
carve(137, 111, 141, 112);      // hall->J
carve(142, 102, 155, 114, 2);   // J big
carve(150, 99, 151, 101);       // J nub (north)

for (const [px, py, pw, ph] of [[27, 102, 2, 2], [31, 111, 2, 2], [44, 90, 2, 2], [50, 96, 2, 2], [43, 107, 2, 2], [50, 110, 2, 2], [9, 91, 2, 2], [111, 106, 2, 2], [114, 111, 2, 2], [145, 105, 2, 2], [151, 111, 2, 2], [126, 113, 2, 1]]) for (let j = 0; j < ph; j++) for (let i = 0; i < pw; i++) floorG[idx(px + i, py + j + DY)] = 0;
const dungeonRegionOf = (x, y) => (inRect(CAVE, x, y) ? 'cave' : inRect(CRYPT, x, y) ? 'crypt' : null);
const isFloor = (x, y) => inb(x, y) && floorG[idx(x, y)] === 1;
// wall set: non-floor cells near a floor cell
const wall = new Uint8Array(W * H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const dr = dungeonRegionOf(x, y); if (!dr || isFloor(x, y)) continue;
  let w = false;
  for (let j = -1; j <= 1 && !w; j++) for (let i = -1; i <= 1; i++) if (isFloor(x + i, y + j) && dungeonRegionOf(x + i, y + j) === dr) { w = true; break; }
  if (!w && (isFloor(x, y + 2) && dungeonRegionOf(x, y + 2) === dr)) w = true;
  if (w) wall[idx(x, y)] = 1;
}
const isWall = (x, y) => inb(x, y) && wall[idx(x, y)] === 1;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const dr = dungeonRegionOf(x, y);
  if (!dr) { if (y >= OW_H) { map.put('ground', x, y, 'O', 1, 1); map.block(x, y); } continue; } // solid void between overworld and dungeons
  map.put('ground', x, y, 'O', 1, 1); // void
  if (isFloor(x, y)) {
    if (dr === 'cave') {
      let [c, r] = [12, 15];
      if (rng() < 0.05) [c, r] = pick([[11, 18], [12, 18]]);
      map.put('ground', x, y, 'C', c, r); // TilesetFloor art via the cave alias (normal speed, not mud)
    } else {
      const [c, r] = pick([[20, 14], [21, 14], [20, 15], [21, 15]]);
      map.put('ground', x, y, 'I', c, r);
    }
  } else if (isWall(x, y)) {
    const above = isWall(x, y - 1), below = isWall(x, y + 1), left = isWall(x - 1, y), right = isWall(x + 1, y);
    const row = isFloor(x, y + 1) ? 2 : !above ? 0 : !below ? 2 : 1;
    const col = !left ? 4 : !right ? 6 : 5;
    map.put('deco', x, y, 'R', col, row);
    map.block(x, y);
  } else map.block(x, y);
}
// dungeon decor
function dungeonDecor() {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!isFloor(x, y) || map.layers.deco[idx(x, y)] || map.occ[idx(x, y)]) continue;
    const dr = dungeonRegionOf(x, y);
    // keep corridors/doorways open: only decorate cells whose 8 neighbours are all floor
    let open = true; for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (!isFloor(x + i, y + j)) open = false;
    if (!open) continue;
    if (dr === 'cave') {
      if (rng() < 0.05) { const k = pick(['crystalBigA', 'crystalBigB', 'crystalBigC', 'crystalBigD']); place(k, x, y, { check: false }); }
      else if (rng() < 0.03) put1(x, y, 'N', pick([6, 7, 8]), 12, { block: true });
      else if (rng() < 0.03) put1(x, y, 'FD', pick([5, 6, 7, 14, 15]), 0);
    } else {
      if (rng() < 0.035) place(pick(['graveA', 'graveB', 'graveCross']), x, y, { check: false });
      else if (rng() < 0.03) put1(x, y, 'FD', pick([14, 15]), 0);
      else if (rng() < 0.01) place('chest', x, y, { check: false });
    }
  }
}
for (const s of spawns) if (!isLand(s[4], s[5])) map.reserve(s[4] - 2, s[5] - 2, 5, 5);
map.reserve(9, 103 + DY, 5, 4); map.reserve(129, 105 + DY, 5, 7);
dungeonDecor();
// dungeon portals: exit doors in the wall north of the entry rooms
map.put('deco', 11, 103 + DY, 'D', 1, 0); map.block(11, 103 + DY, false); // cave exit (hole door)
map.put('deco', 131, 107 + DY, 'D', 2, 0); map.block(131, 107 + DY, false); // crypt exit (skull door)
// ensure the wall cells north of the exits are walls with proper rows (they already are); keep neighbours blocked

// ===================================================================== CENTRO DE TREINAMENTO + COLISEU (town side)
// Built AFTER everything else (own rng stream) so every pre-existing tile/object keeps its coordinates.
function wipe(x0, y0, x1, y1) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = idx(x, y); map.layers.deco[i] = 0; map.layers.above[i] = 0; map.layers.collision[i] = 0; map.occ[i] = 0; }
}
function cobbleTile(x, y) {
  const inP = (a, b) => inb(a, b) && pave[idx(a, b)] === 1;
  const top = !inP(x, y - 1), bot = !inP(x, y + 1), lef = !inP(x - 1, y), rig = !inP(x + 1, y);
  map.put('ground', x, y, 'I', lef ? 0 : rig ? 2 : 1, top ? 12 : bot ? 15 : 13);
}
const dirtFull = (x, y) => { const [c, r] = blob['11111111']; const alt = rng2() < 0.05; map.put('ground', x, y, 'F', alt ? (x % 2) : c, alt ? 11 : r); };

// ---- Centro de Treinamento: walled yard west of the village, entered through a new gate in the west palisade
const TC = { x0: 44, y0: 99, x1: 60, y1: 114 };
wipe(TC.x0, TC.y0, TC.x1 - 1, TC.y1);
wipe(60, 105, 60, 106); wipe(61, 105, 63, 106); // gate gap + approach
for (let y = TC.y0; y <= TC.y1; y++) for (let x = TC.x0; x < TC.x1; x++) dirtFull(x, y);
for (let y = 105; y <= 106; y++) for (let x = 60; x <= 64; x++) dirtFull(x, y);
fenceH(TC.y0, TC.x0 + 1, TC.x1 - 1, []); fenceH(TC.y1, TC.x0 + 1, TC.x1 - 1, []);
fenceV(TC.x0, TC.y0, TC.y1, []); fenceV(60, 113, 114, []);
const TRAIN_DUMMIES = [];
for (const y of [104, 107, 110]) for (const x of [48, 52, 56]) TRAIN_DUMMIES.push([x, y]);
const TRAIN_STATUES = []; // [statueId, x, y] (y = blocked base row)
{
  const kinds = ['statue', 'statueB', 'statueC', 'statueD'];
  let n = 0;
  for (const [sy, base, shift] of [[100, 101, 0], [112, 113, 2]]) for (let k = 0; k < 4; k++) {
    const x = 46 + k * 4;
    place(kinds[(k + shift) % 4], x, sy, { check: false });
    map.block(x, base); map.block(x + 1, base);
    TRAIN_STATUES.push(['statue_' + ++n, x, base]);
  }
}
for (const [x, y] of [[59, 103], [59, 108]]) place('lamp', x, y - 1, { check: false });
for (const [x, y] of [[45, 104], [45, 110]]) place('barrel', x, y, { check: false });
place('board', 45, 107, { check: false });
for (let k = 0; k < 10; k++) { const x = 46 + Math.floor(rng2() * 13), y = 103 + Math.floor(rng2() * 9); if (!map.blocked(x, y) && !map.layers.deco[idx(x, y)] && !TRAIN_DUMMIES.some(([a, b]) => a === x && b === y)) put1(x, y, 'FD', pick2([14, 15, 5, 6]), 0); }

// ---- Coliseu entrance: cobbled court in the SE quarter of the village, sandstone gatehouse + lions
const COURT = { x0: 82, y0: 101, x1: 93, y1: 111 };
wipe(COURT.x0, COURT.y0, COURT.x1, COURT.y1);
for (let y = COURT.y0; y <= COURT.y1; y++) for (let x = COURT.x0; x <= COURT.x1; x++) pave[idx(x, y)] = 1;
for (let y = 85; y <= 112; y++) for (let x = 66; x <= 96; x++) if (pave[idx(x, y)]) cobbleTile(x, y);
// gatehouse: two towers + a flat-roofed hall with a dark arch (x 83..92, y 102..107)
place('desertTower', 83, 102, { check: false }); place('desertTower', 90, 102, { check: false });
{
  const hx = 86, hw = 4, top = 102, face = 107;
  for (let y = top; y <= face; y++) for (let i = 0; i < hw; i++) {
    const row = y === top ? 0 : y === face ? 2 : 1;
    const tc = row === 1 && (i === 1 || i === 2) && y !== top + 1 ? 7 : 6 + i; // one barred window only; plain roof elsewhere
    map.put(y === face ? 'deco' : 'above', hx + i, y, 'T', tc, row);
    map.block(hx + i, y);
  }
  map.reserve(hx, top, hw, face - top + 1);
}
place('lionA', 83, 109, { check: false }); place('lionB', 91, 109, { check: false });
for (const x of [85, 90]) place('lamp', x, 109, { check: false });
const ARENA_MASTER = [87, 108], ARENA_EXIT = [88, 110];

// ===================================================================== COLISEU ARENAS (void area; the server teleports players in)
// Each arena: block 30x26 = rect 24x20 (+3 wall margin). Oval sand floor (24x16) + a rest alcove (north). Blocks are >= 26 tiles apart.
const AR_W = 24, AR_H = 20;
const ARENAS = [1, 2, 3, 4].map((id) => { const col = (id - 1) % 2, row = (id - 1) >> 1; const bx = 14 + col * 56, by = 208 + row * 52; return { id, bx, by, rx: bx + 3, ry: by + 3 }; });
const arenaFloorG = new Uint8Array(W * H), arenaNook = new Uint8Array(W * H);
const aLocalFloor = (lx, ly) => (ly >= 4 && ly <= 19 && ((lx + 0.5 - 12) / 12) ** 2 + ((ly + 0.5 - 12) / 8) ** 2 <= 1) || (lx >= 9 && lx <= 14 && ly >= 1 && ly <= 3);
const A_PILLARS = [[7, 9], [7, 15], [16, 9], [16, 15], [11, 12], [12, 12]]; // local base tiles
const A_SPAWNS = [[21, 8], [21, 12], [21, 16], [18, 6], [18, 18], [14, 5], [14, 19], [10, 19]];
const A_ENTRY = [2, 11], A_SHOP = [11, 2];
for (const a of ARENAS) for (let ly = 0; ly < AR_H; ly++) for (let lx = 0; lx < AR_W; lx++) {
  if (!aLocalFloor(lx, ly)) continue;
  arenaFloorG[idx(a.rx + lx, a.ry + ly)] = 1;
  if (ly <= 3) arenaNook[idx(a.rx + lx, a.ry + ly)] = 1;
}
const isAF = (x, y) => inb(x, y) && arenaFloorG[idx(x, y)] === 1;
const arenaBlockOf = (x, y) => ARENAS.find((a) => x >= a.bx && x < a.bx + 30 && y >= a.by && y < a.by + 26);
const aWall = new Uint8Array(W * H);
for (const a of ARENAS) for (let y = a.by; y < a.by + 26; y++) for (let x = a.bx; x < a.bx + 30; x++) {
  if (isAF(x, y)) continue;
  let w = false;
  for (let j = -2; j <= 2 && !w; j++) for (let i = -2; i <= 2; i++) if (isAF(x + i, y + j)) { w = true; break; }
  if (!w && isAF(x, y + 3)) w = true;
  if (w) aWall[idx(x, y)] = 1;
}
const isAW = (x, y) => inb(x, y) && aWall[idx(x, y)] === 1;
for (const a of ARENAS) for (let y = a.by; y < a.by + 26; y++) for (let x = a.bx; x < a.bx + 30; x++) {
  const i = idx(x, y);
  if (isAF(x, y)) {
    if (arenaNook[i]) map.put('ground', x, y, 'I', 1, 13);
    else { const t = rng2() < 0.14; map.put('ground', x, y, 'A', t ? 1 + Math.floor(rng2() * 4) : 0, 5); }
    map.block(x, y, false);
  } else if (isAW(x, y)) {
    const above = isAW(x, y - 1), below = isAW(x, y + 1), left = isAW(x - 1, y), right = isAW(x + 1, y);
    const row = isAF(x, y + 1) ? 2 : !above ? 0 : !below ? 2 : 1;
    const col = !left ? 0 : !right ? 2 : 1;
    let c = 17 + col, r = 4 + row;
    if (col === 1 && row === 2) { if (rng2() < 0.25) c = 18; else c = 19; }
    map.put('deco', x, y, 'T', c, r);
    map.block(x, y);
  }
}
for (const a of ARENAS) {
  map.reserve(a.bx, a.by, 30, 26);
  for (const [px, py] of A_PILLARS) place('sandPillar', a.rx + px, a.ry + py - 2, { check: false });
  // rest alcove: lamps, barrels, a chest; the vendor stands at A_SHOP
  for (const lx of [9, 14]) place('lamp', a.rx + lx, a.ry + 1, { check: false });
  for (const lx of [10, 13]) place('barrel', a.rx + lx, a.ry + 1, { check: false });
  place('chest', a.rx + 12, a.ry + 1, { check: false });
  // bones / skulls lying around the sand
  for (let k = 0; k < 18; k++) { const lx = 1 + Math.floor(rng2() * 22), ly = 5 + Math.floor(rng2() * 14); const x = a.rx + lx, y = a.ry + ly; if (isAF(x, y) && !map.blocked(x, y) && !map.layers.deco[idx(x, y)] && !A_SPAWNS.some(([sx, sy]) => sx === lx && sy === ly) && !(lx === A_ENTRY[0] && ly === A_ENTRY[1])) put1(x, y, 'FD', pick2([14, 15, 5, 6]), 0); }
}

// ===================================================================== OBJECTS
const SPAWN = [79, 92];
map.tileObj('spawn_player', SPAWN[0], SPAWN[1], undefined, 'spawn');
const npcs = [
  ['priest', 79, 85], ['shop', 65, 95], ['depot', 96, 95], ['guard_captain', 74, 80], ['bounty_board', 75, 92],
  ['old_hunter', 19, 58], ['herbalist', 97, 54],
];
const portals = [
  // [x, y, toX, toY]
  [128, 62, 11, 105 + DY], [11, 103 + DY, 128, 63],
  [106, 16, 131, 109 + DY], [131, 107 + DY, 106, 17],
];
const portalMap = new Map(portals.map(([x, y, tx, ty]) => [x + ',' + y, [tx, ty]]));
// ===================================================================== POLISH (swamp / ruins / seams / dungeon dressing + light objects)
const lights = [];
const protect = new Uint8Array(W * H);
{
  const pr = (x, y, r = 1) => { for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (inb(x + i, y + j)) protect[idx(x + i, y + j)] = 1; };
  pr(79, 92, 2);
  for (const [, , , , x, y] of spawns) pr(x, y, 1);
  for (const [, x, y] of npcs) pr(x, y, 1);
  for (const [x, y, tx, ty] of portals) { pr(x, y, 2); pr(tx, ty, 2); }
  for (const [x, y] of TRAIN_DUMMIES) pr(x, y, 0);
  pr(ARENA_MASTER[0], ARENA_MASTER[1], 1); pr(ARENA_EXIT[0], ARENA_EXIT[1], 1);
  for (const a of ARENAS) { pr(a.rx + A_ENTRY[0], a.ry + A_ENTRY[1], 1); pr(a.rx + A_SHOP[0], a.ry + A_SHOP[1], 1); for (const [sx, sy] of A_SPAWNS) pr(a.rx + sx, a.ry + sy, 1); }
}
const polishInfo = polish({ map, ts, L: LEMON, W, H, idx, inb, reg, dirt, water, pave, mud, band, floorG, isFloor, isWall, S, place, CAVE, CRYPT, ARENA, MAUS, DY, lights, protect, ARENAS, isAF, spawns });
console.log('polish', JSON.stringify(polishInfo.stats));

// guard captain stands beside the north gate: make sure tile is free
for (const [id, x, y] of npcs) map.tileObj('npc', x, y, { npcId: id }, id);
for (const [x, y, tx, ty] of portals) map.tileObj('portal', x, y, { toX: tx, toY: ty }, 'portal');
for (const [m, count, radius, level, x, y] of spawns) map.tileObj('monster_spawn', x, y, { monster: m, count, radius, level }, m);
// Spawns acrescentados depois do mapa pronto: entram só como objeto (sem clareira, trilha nem proteção de decoração),
// para não consumir o gerador aleatório e não mexer em nenhum tile — o mapa de quem já joga fica idêntico. O lugar
// precisa ser andável e alcançável (conferido à mão). Fim de jogo (lv 40+): antes eram só 3 espíritos de chama.
const lateSpawns = [
  ['flame_spirit', 3, 5, 40, 154, 34], // ruínas a leste, 10+ tiles dos homens-lagarto
];
for (const [m, count, radius, level, x, y] of lateSpawns) map.tileObj('monster_spawn', x, y, { monster: m, count, radius, level }, m);

// zones (rectangles)
const MUS = (f) => f;
const zones = [
  ['Floresta Sussurrante', 3, 3, 83, 35, '11 - Clearing.ogg'],
  ['Floresta Sussurrante', 3, 38, 101, 46, '11 - Clearing.ogg'],
  ['Vila de Pedra Clara', 58, 76, 46, 40, '36 - Village.ogg'],
  ['Ruínas de Kael', 86, 3, 71, 35, '30 - Ruins.ogg'],
  ['Pântano Turvo', 104, 38, 53, 59, '14 - Curse.ogg'],
  ['Cavernas', 0, 84 + DY, 57, 36, '2 - The Cave.ogg'],
  ['Cripta', 104, 98 + DY, 56, 22, '40 - Crypt.ogg'],
];
for (const [name, x, y, w, h, music] of zones) map.addObject({ type: 'zone', name, x: x * 16, y: y * 16, width: w * 16, height: h * 16, rect: true, props: name === 'Vila de Pedra Clara' ? { music, pz: true } : { music } });
// --- new content (objects appended after the old ones: old object ids stay stable)
map.addObject({ type: 'zone', name: 'Centro de Treinamento', x: 43 * 16, y: 98 * 16, width: 17 * 16, height: 18 * 16, rect: true, props: { music: '36 - Village.ogg', pz: true } });
for (const [id, x, y] of TRAIN_STATUES) map.tileObj('training_statue', x, y, { statueId: id }, id);
for (const [x, y] of TRAIN_DUMMIES) map.tileObj('monster_spawn', x, y, { monster: 'training_dummy', count: 1, radius: 0, level: 1 }, 'training_dummy');
map.tileObj('npc', ARENA_MASTER[0], ARENA_MASTER[1], { npcId: 'arena_master' }, 'arena_master');
map.tileObj('arena_exit', ARENA_EXIT[0], ARENA_EXIT[1], undefined, 'arena_exit');
for (const a of ARENAS) {
  map.addObject({ type: 'arena', name: `Arena ${a.id}`, x: a.rx * 16, y: a.ry * 16, width: AR_W * 16, height: AR_H * 16, rect: true, props: { arenaId: a.id } });
  map.tileObj('arena_entry', a.rx + A_ENTRY[0], a.ry + A_ENTRY[1], { arenaId: a.id }, `arena_entry_${a.id}`);
  for (const [sx, sy] of A_SPAWNS) map.tileObj('arena_spawn', a.rx + sx, a.ry + sy, { arenaId: a.id }, `arena_spawn_${a.id}`);
  map.tileObj('npc', a.rx + A_SHOP[0], a.ry + A_SHOP[1], { npcId: `arena_shop_${a.id}` }, `arena_shop_${a.id}`);
  map.addObject({ type: 'zone', name: 'Coliseu', x: a.bx * 16, y: a.by * 16, width: 30 * 16, height: 26 * 16, rect: true, props: { music: '17 - Fight.ogg', pz: false } });
}

// light objects (read by the day/night + lighting system; convention documented in packages/shared/src/map.ts). Appended last: older object ids stay stable.
for (const [x, y, radius, color, flicker] of lights) map.tileObj('light', x, y, { radius, color, flicker }, 'light');

// ===================================================================== VALIDATION
function fail(msg) { try { renderPreview(map, path.join(here, '_v/debug.png'), { collisionOverlay: true, objectsOverlay: true }); } catch {} console.error('\nMAP VALIDATION FAILED: ' + msg); process.exit(1); }
if (map.blocked(SPAWN[0], SPAWN[1])) fail('spawn blocked');
// NPC tiles must be walkable before we turn them into obstacles
for (const [id, x, y] of npcs) if (map.blocked(x, y) && id !== 'bounty_board') fail(`npc ${id} at ${x},${y} stands on a blocked tile`);
const reach = bfs(map, SPAWN[0], SPAWN[1], portalMap);
const R = (x, y) => reach[idx(x, y)] === 1;
for (const [id, x, y] of npcs) {
  if (id === 'bounty_board') { const ok = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => R(x + a, y + b)); if (!ok) fail('bounty board unreachable'); continue; }
  if (!R(x, y)) fail(`npc ${id} at ${x},${y} unreachable`);
}
for (const [m, , , , x, y] of spawns) { if (map.blocked(x, y)) fail(`monster_spawn ${m} at ${x},${y} is on a blocked tile`); if (!R(x, y)) fail(`monster_spawn ${m} at ${x},${y} unreachable`); }
for (const [x, y, tx, ty] of portals) {
  if (map.blocked(x, y)) fail(`portal ${x},${y} is blocked`);
  if (map.blocked(tx, ty)) fail(`portal target ${tx},${ty} is blocked`);
  if (portalMap.has(tx + ',' + ty)) fail(`portal target ${tx},${ty} is itself a portal`);
  if (!R(x, y)) fail(`portal ${x},${y} unreachable`);
  if (!R(tx, ty)) fail(`portal target ${tx},${ty} unreachable`);
}
// safe town: no monster spawn within 12 tiles of the town rect
for (const [m, , r, , x, y] of spawns) {
  if (!isLand(x, y)) continue;
  const dx = Math.max(TOWN.x0 - x, 0, x - TOWN.x1), dy = Math.max(TOWN.y0 - y, 0, y - TOWN.y1);
  if (Math.hypot(dx, dy) < 14) fail(`monster_spawn ${m} at ${x},${y} too close to town`);
}
// ---- training center + colosseum (town side)
{
  const nb4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const [x, y] of TRAIN_DUMMIES) { if (map.blocked(x, y)) fail(`training dummy at ${x},${y} is blocked`); if (!R(x, y)) fail(`training dummy at ${x},${y} unreachable`); }
  if (new Set(TRAIN_DUMMIES.map((d) => d.join())).size !== TRAIN_DUMMIES.length) fail('duplicate dummy');
  for (const [id, x, y] of TRAIN_STATUES) {
    if (!map.blocked(x, y)) fail(`${id} at ${x},${y} is not blocked`);
    if (!nb4.some(([a, b]) => !map.blocked(x + a, y + b) && R(x + a, y + b))) fail(`${id} at ${x},${y} has no reachable walkable neighbour`);
  }
  for (const [nm, [x, y]] of [['arena_master', ARENA_MASTER], ['arena_exit', ARENA_EXIT]]) { if (map.blocked(x, y)) fail(`${nm} at ${x},${y} blocked`); if (!R(x, y)) fail(`${nm} at ${x},${y} unreachable`); }
  if (!inRect({ x0: 58, y0: 76, x1: 103, y1: 115 }, ARENA_MASTER[0], ARENA_MASTER[1])) fail('arena_master outside town PZ');
  if (!inRect({ x0: 58, y0: 76, x1: 103, y1: 115 }, ARENA_EXIT[0], ARENA_EXIT[1])) fail('arena_exit outside town PZ');
  if (!R(60, 105) || !R(60, 106)) fail('training center gate unreachable');
}
// ---- arenas: NOT reachable by walking from the spawn; each arena entry is an extra BFS root and must reach its own objects.
const arenaReach = new Uint8Array(W * H);
for (const a of ARENAS) {
  const ex = a.rx + A_ENTRY[0], ey = a.ry + A_ENTRY[1];
  if (map.blocked(ex, ey)) fail(`arena ${a.id} entry blocked`);
  if (R(ex, ey)) fail(`arena ${a.id} entry is reachable from the overworld (must be isolated)`);
  const ar = bfs(map, ex, ey);
  const AR = (x, y) => ar[idx(x, y)] === 1;
  for (let i = 0; i < ar.length; i++) if (ar[i]) { arenaReach[i] = 1; const x = i % W, y = (i / W) | 0; if (x < a.rx || x >= a.rx + AR_W || y < a.ry || y >= a.ry + AR_H) fail(`arena ${a.id} walkable area leaks outside its rect at ${x},${y}`); }
  for (const [sx, sy] of A_SPAWNS) { const x = a.rx + sx, y = a.ry + sy; if (map.blocked(x, y)) fail(`arena ${a.id} spawn ${x},${y} blocked`); if (!AR(x, y)) fail(`arena ${a.id} spawn ${x},${y} unreachable from entry`); }
  const sx = a.rx + A_SHOP[0], sy = a.ry + A_SHOP[1];
  if (map.blocked(sx, sy)) fail(`arena ${a.id} shop npc tile blocked`);
  if (!AR(sx, sy)) fail(`arena ${a.id} shop npc unreachable from entry`);
  // floor count sanity: enough room to fight
  let n = 0; for (let i = 0; i < ar.length; i++) n += ar[i];
  if (n < 300) fail(`arena ${a.id} too small (${n} tiles)`);
  console.log(`arena ${a.id}: ${n} walkable tiles reachable from entry ${ex},${ey}`);
}
// NPCs become obstacles
for (const [id, x, y] of npcs) map.block(x, y);
map.block(ARENA_MASTER[0], ARENA_MASTER[1]);
for (const a of ARENAS) map.block(a.rx + A_SHOP[0], a.ry + A_SHOP[1]);
let walk = 0, reached = 0;
for (let i = 0; i < W * H; i++) { if (map.layers.collision[i] === 0) walk++; if (reach[i] || arenaReach[i]) reached++; }
console.log(`BFS ok: ${reached} reachable tiles of ${walk} walkable (${((reached / walk) * 100).toFixed(1)}%)`);

// ===================================================================== TERRAS SELVAGENS (expansão a leste: tools/mapgen/expansion.mjs)
// O mapa acima (160 colunas) fica intacto e validado; a expansão o copia para um mapa mais largo e desenha as colunas novas.
const big = expand({ old: map, ts, S, L: LEMON, OW_H, spawnTile: SPAWN, oldPortals: portals }).map;
// NPCs acrescentados depois do mapa pronto (como os lateSpawns): só o objeto, nenhum tile muda. Tile andável conferido à
// mão, fora do caminho. Cocheiros: carroça Vila (portão leste) ↔ Posto da Fronteira; chegada em shared/data/npcs.ts.
const lateNpcs = [['coach_village', 98, 100], ['coach_frontier', 213, 62]];
for (const [id, x, y] of lateNpcs) big.tileObj('npc', x, y, { npcId: id }, id);
// ===================================================================== COSTA ESMERALDA (segunda expansão a leste: tools/mapgen/expansion2.mjs)
const world = expand2({ old: big, ts, S, L: LEMON, OW_H, spawnTile: SPAWN }).map;
// Caves mais cheias (ciclo 8): spawns acrescentados no FIM do pipeline, só como objeto, depois de todos os outros
// objetos (ids antigos intactos) e sem tocar em tile nem no gerador aleatório — o mapa de quem já joga fica idêntico.
// Em cada cave: um bando grande do monstro mais fraco/corpo a corpo da área (magia em área, cavaleiro puxar e girar) e
// mistos colados (tanque + atirador/conjurador no mesmo ponto). Pontos escolhidos fora da PZ, andáveis e alcançáveis,
// com o raio inteiro dentro da zona da cave, a 7+ tiles (mais o raio) de portais/escadas, 9+ das chegadas, 8+ de NPCs,
// 11+ de covis de chefe e longe da alavanca/placas/sala da Aniquilação e dos baús de quest.
// [monstro, count, radius, level, x, y]
const caveSpawns = [
  ['snake', 10, 5, 12, 4, 153], // Cavernas (bando) — 10 tiles do spawn mais perto
  ['bat', 8, 5, 18, 38, 152], // Cavernas (bando) — 8 tiles do spawn mais perto
  ['skeleton', 3, 4, 24, 22, 153], // Cavernas (misto) — 8 tiles do spawn mais perto
  ['spider', 3, 4, 16, 22, 153], // Cavernas (misto) — 8 tiles do spawn mais perto
  ['skeleton', 2, 4, 24, 47, 163], // Cavernas (misto) — 8 tiles do spawn mais perto
  ['spider', 2, 4, 16, 47, 163], // Cavernas (misto) — 8 tiles do spawn mais perto
  ['bat', 3, 4, 18, 38, 170], // Cavernas — 8 tiles do spawn mais perto
  ['snake', 3, 4, 12, 29, 160], // Cavernas — 7 tiles do spawn mais perto
  ['skeleton', 10, 5, 24, 150, 161], // Cripta (bando) — 9 tiles do spawn mais perto
  ['skeleton', 3, 4, 24, 155, 168], // Cripta (misto) — 7 tiles do spawn mais perto
  ['ghost', 3, 4, 31, 155, 168], // Cripta (misto) — 7 tiles do spawn mais perto
  ['ghost', 2, 3, 31, 119, 173], // Cripta — 7 tiles do spawn mais perto
  ['hero', 8, 5, 72, 305, 253], // Caverna dos Heróis (bando) — 13 tiles do spawn mais perto
  ['hero', 3, 4, 72, 338, 240], // Caverna dos Heróis (misto) — 12 tiles do spawn mais perto
  ['necromancer', 2, 4, 68, 338, 240], // Caverna dos Heróis (misto) — 12 tiles do spawn mais perto
  ['hero', 2, 4, 72, 330, 252], // Caverna dos Heróis (misto) — 12 tiles do spawn mais perto
  ['necromancer', 3, 4, 68, 330, 252], // Caverna dos Heróis (misto) — 12 tiles do spawn mais perto
  ['frost_dragon', 8, 5, 80, 366, 193], // Ninho dos Dragões de Gelo (bando) — 14 tiles do spawn mais perto
  ['frost_dragon', 1, 3, 80, 357, 192], // Ninho dos Dragões de Gelo — 8 tiles do spawn mais perto
  ['pirate_marauder', 12, 5, 30, 308, 157], // Caverna dos Piratas (bando) — 12 tiles do spawn mais perto
  ['pirate_buccaneer', 3, 4, 38, 331, 167], // Caverna dos Piratas (misto) — 11 tiles do spawn mais perto
  ['pirate_corsair', 3, 4, 35, 331, 167], // Caverna dos Piratas (misto) — 11 tiles do spawn mais perto
  ['pirate_buccaneer', 2, 4, 38, 320, 147], // Caverna dos Piratas (misto) — 10 tiles do spawn mais perto
  ['pirate_corsair', 2, 4, 35, 320, 147], // Caverna dos Piratas (misto) — 10 tiles do spawn mais perto
  ['pirate_marauder', 2, 4, 30, 320, 147], // Caverna dos Piratas (misto) — 10 tiles do spawn mais perto
  ['pirate_buccaneer', 3, 4, 38, 309, 167], // Caverna dos Piratas (misto) — 10 tiles do spawn mais perto
  ['pirate_corsair', 3, 4, 35, 309, 167], // Caverna dos Piratas (misto) — 10 tiles do spawn mais perto
  ['minotaur', 10, 5, 48, 201, 171], // Labirinto dos Minotauros (bando) — 16 tiles do spawn mais perto
  ['minotaur', 3, 4, 48, 168, 149], // Labirinto dos Minotauros (misto) — 14 tiles do spawn mais perto
  ['minotaur_mage', 3, 4, 50, 168, 149], // Labirinto dos Minotauros (misto) — 14 tiles do spawn mais perto
  ['minotaur', 3, 4, 48, 224, 154], // Labirinto dos Minotauros (misto) — 14 tiles do spawn mais perto
  ['minotaur_mage', 3, 4, 50, 224, 154], // Labirinto dos Minotauros (misto) — 14 tiles do spawn mais perto
  ['minotaur', 3, 4, 48, 225, 134], // Labirinto dos Minotauros (misto) — 12 tiles do spawn mais perto
  ['minotaur_mage', 3, 4, 50, 225, 134], // Labirinto dos Minotauros (misto) — 12 tiles do spawn mais perto
  ['winter_wolf', 8, 5, 50, 306, 194], // Caverna do Yeti (bando) — 11 tiles do spawn mais perto
  ['barbarian', 2, 4, 55, 284, 196], // Caverna do Yeti (misto) — 11 tiles do spawn mais perto
  ['ice_witch', 2, 4, 62, 284, 196], // Caverna do Yeti (misto) — 11 tiles do spawn mais perto
  ['winter_wolf', 2, 4, 50, 330, 190], // Caverna do Yeti (misto) — 9 tiles do spawn mais perto
  ['ice_witch', 1, 4, 62, 330, 190], // Caverna do Yeti (misto) — 9 tiles do spawn mais perto
  ['kongra', 10, 4, 28, 393, 154], // Templo de Banuta (bando) — 9 tiles do spawn mais perto
  ['kongra', 3, 4, 28, 396, 142], // Templo de Banuta (misto) — 6 tiles do spawn mais perto
  ['merlkin', 2, 4, 32, 396, 142], // Templo de Banuta (misto) — 6 tiles do spawn mais perto
  ['tarantula', 3, 4, 30, 372, 144], // Templo de Banuta (misto) — 6 tiles do spawn mais perto
  ['merlkin', 2, 4, 32, 372, 144], // Templo de Banuta (misto) — 6 tiles do spawn mais perto
  ['sibang', 2, 4, 26, 384, 144], // Templo de Banuta (misto) — 6 tiles do spawn mais perto
  ['kongra', 2, 4, 28, 384, 144], // Templo de Banuta (misto) — 6 tiles do spawn mais perto
  ['behemoth', 8, 5, 90, 271, 169], // Abismo (bando) — 14 tiles do spawn mais perto
  ['behemoth', 3, 4, 90, 271, 144], // Abismo (misto) — 11 tiles do spawn mais perto
  ['demon', 2, 4, 100, 271, 144], // Abismo (misto) — 11 tiles do spawn mais perto
  ['behemoth', 3, 4, 90, 249, 162], // Abismo (misto) — 9 tiles do spawn mais perto
  ['demon', 2, 4, 100, 249, 162], // Abismo (misto) — 9 tiles do spawn mais perto
  ['juggernaut', 2, 4, 110, 233, 231], // Cidadela de Ferumbras (misto) — 19 tiles do spawn mais perto
  ['demon', 2, 4, 100, 233, 231], // Cidadela de Ferumbras (misto) — 19 tiles do spawn mais perto
  ['hellhound', 2, 4, 95, 268, 224], // Cidadela de Ferumbras — 16 tiles do spawn mais perto
];
for (const [m, count, radius, level, x, y] of caveSpawns) {
  if (world.blocked(x, y)) fail(`cave spawn ${m} at ${x},${y} is on a blocked tile`);
  world.tileObj('monster_spawn', x, y, { monster: m, count, radius, level }, m);
}

// ===================================================================== OFICINA DOS ENGENHOS (ciclo 10: tools/mapgen/expansion3.mjs)
// Primeira expansão para BAIXO: o mapa de cima (400×288) fica intacto e o bloco novo entra nas linhas 312..333, ligado à
// Vila por um portal em (99,79) ↔ porta de saída em (63,321). Os objetos novos entram depois de todos os antigos.
const { map: world3, reach: reach3 } = expand3({ old: world, ts, S, L: LEMON, spawnTile: SPAWN, village: { x0: 58, y0: 76, x1: 103, y1: 115 } });
// Monstros do ciclo 10 (lore da Oficina): spawns só-objeto como os caveSpawns — nenhum tile muda. Pontos andáveis,
// alcançáveis e fora de toda zona protegida, conferidos aqui; distâncias a spawns/NPCs/portais escolhidas à mão.
// [monstro, count, radius, level, x, y]
const lateSpawns10 = [
  ['datacenter_rat', 6, 5, 3, 47, 42], // Floresta Sussurrante (noroeste): 30 tiles dos ratos da 1ª missão (70,62) — o bando de lv 3 não pode cair na caçada do lv 1 —, 18+ de outros spawns
  ['runaway_drum', 5, 6, 10, 78, 25], // Floresta, estrada dos lobos (lobos lv 10 em 76,18 a 7 tiles), 51 da Vila
  ['slag_slime', 6, 5, 20, 137, 76], // Pântano Turvo: 16 tiles da boca da caverna, fora da ilha do lich, 44+ de NPC
  ['slag_slime', 3, 4, 20, 19, 170], // Cavernas, corredor A→B: 8+ das escadas e 9+ de outros spawns
];
{
  const pzZones = world3.objects.filter((o) => o.type === 'zone' && o.properties?.some((p) => p.name === 'pz' && p.value === true));
  for (const [m, count, radius, level, x, y] of lateSpawns10) {
    if (world3.blocked(x, y)) fail(`late spawn ${m} at ${x},${y} is on a blocked tile`);
    if (!reach3[y * world3.w + x]) fail(`late spawn ${m} at ${x},${y} unreachable`);
    if (pzZones.some((z) => x * 16 >= z.x && x * 16 < z.x + z.width && y * 16 >= z.y && y * 16 < z.y + z.height)) fail(`late spawn ${m} at ${x},${y} inside a protection zone`);
    world3.tileObj('monster_spawn', x, y, { monster: m, count, radius, level }, m);
  }
}

// ===================================================================== MALHA DA FERROVIA (ciclo 11: tools/mapgen/expansion4.mjs)
// Segunda expansão para baixo: o mapa acima (400×336) fica intacto e a região ferroviária entra nas linhas 360..469,
// ligada à Vila de trem (TravelDest dos chefes de estação) e por um par de portais ocultos entre as duas estações.
// Roda por último: é a única etapa que aloca a arte da ferrovia no TilesetLemon (os tiles Lemon antigos mantêm o id).
const { map: world4, reach: reach4, portalMap: portals4 } = expand4({ old: world3, ts, S, L: LEMON, spawnTile: SPAWN, village: { x0: 58, y0: 76, x1: 103, y1: 115 }, workshopPatio: { x0: 75, y0: 327, x1: 87, y1: 332 } });
// Saídas da Malha (2026-10-24, pedido do dono): o trem de volta só existia na Estação Central, a oeste, e a Malha tem
// 160 tiles de largura. O Agente da Parada fica no lado leste, colado na linha principal entre o Portal de Inspeção e o
// desvio da Oficina de Vagões. Só objeto, o último do mapa (nenhum tile muda, ids antigos estáveis).
const lateNpcs11 = [['agente_parada', 154, 404]];
{
  const W4 = world4.w, at = (x, y) => y * W4 + x;
  const prop = (o, n) => o.properties?.find((p) => p.name === n)?.value;
  const cheb = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
  const npcTiles = world4.objects.filter((o) => o.type === 'npc').map((o) => [o.x / 16, o.y / 16]);
  const spawnObjs = world4.objects.filter((o) => o.type === 'monster_spawn').map((o) => [o.x / 16, o.y / 16, prop(o, 'radius') ?? 0]);
  const malha = { x0: 40, y0: 360, x1: 199, y1: 469 }, arrival = [60, 374];
  const reachedIn = () => { const r = bfs(world4, arrival[0], arrival[1], portals4); let n = 0; for (let y = malha.y0; y <= malha.y1; y++) for (let x = malha.x0; x <= malha.x1; x++) if (!world4.blocked(x, y) && r[at(x, y)]) n++; return n; };
  for (const [id, x, y] of lateNpcs11) {
    if (world4.blocked(x, y)) fail(`late npc ${id} em ${x},${y} bloqueado`);
    if (reach4[at(x, y)] !== 1) fail(`late npc ${id} em ${x},${y} inalcançável`);
    if (npcTiles.some(([a, b]) => cheb(a, b, x, y) < 2)) fail(`late npc ${id} a menos de 2 tiles de outro NPC`);
    if (spawnObjs.some(([a, b, r]) => cheb(a, b, x, y) - r < 8)) fail(`late npc ${id} perto demais de um spawn`);
    if (portals4.has(`${x},${y}`) || [...portals4.values()].some(([tx, ty]) => tx === x && ty === y)) fail(`late npc ${id} em portal ou destino de portal`);
    // virar obstáculo não pode fechar bolsão: o resto da Malha continua alcançável a partir da chegada do trem
    const before = reachedIn();
    world4.block(x, y);
    const after = reachedIn();
    world4.block(x, y, false);
    if (after !== before - 1) fail(`late npc ${id} em ${x},${y} fecha ${before - 1 - after} tile(s) da Malha`);
    world4.tileObj('npc', x, y, { npcId: id }, id);
  }
}

// ===================================================================== CAVES PROFUNDAS (ciclo 13: tools/mapgen/expansion5.mjs)
// Terceira expansão para baixo: o mapa acima (400×472) fica intacto e quatro caves (12–28, 35–55, 60–85, 100–130) entram
// nas linhas 498..559. Entradas só-objeto: um portal com level mínimo num recanto andável de cada região de origem
// (o desenho delas vem no fim, em BOCAS DE CAVERNA).
const { map: world5, reach: reach5, portalMap: portals5, caves: caves5 } = expand5({ old: world4, L: LEMON, spawnTile: SPAWN });

// ===================================================================== COVIS E FERREIRO (ciclo 16: só objetos)
// Um chefe e três baús de escolha na sala do fundo (covil) de cada cave do ciclo 13, e o Mestre Brás, o Ferreiro, ao lado
// do Bento. Nenhum tile muda: o baú é um objeto "quest_chest" com `drawn` (o cliente desenha o baú grande do pack e a
// CollisionGrid bloqueia o tile pelo objeto) e o NPC vira obstáculo em jogo, como os lateNpcs. Tudo depois dos objetos
// já publicados (ids antigos estáveis). Baús na parede do fundo, com um tile livre entre eles; chefe no meio do covil.
// [cave, chefe, level, [baús de cima para baixo (de quem olha o mapa)]]
const lateObjects14 = {
  lairs: [
    ['minas', 'lair_mole_king', 28, ['lair_minas_furia', 'lair_minas_lich', 'lair_minas_protecao']],
    ['grutas', 'lair_kraken', 54, ['lair_grutas_might', 'lair_grutas_labirinto', 'lair_grutas_engrenagens']],
    ['catacumbas', 'lair_flame', 82, ['lair_catacumbas_knight', 'lair_catacumbas_paladin', 'lair_catacumbas_mage']],
    ['profundo', 'lair_shogun', 125, ['lair_profundo_amulet', 'lair_profundo_ring', 'lair_profundo_boots']],
  ],
  boss: { dx: 84, y: 541, radius: 2 },
  chests: { dx: 91, ys: [539, 541, 543] },
  npcs: [['blacksmith', 68, 95]], // Vila: grama a leste da loja do Bento (65,95), fora do caminho
};
{
  const W5 = world5.w, at = (x, y) => y * W5 + x;
  const prop = (o, n) => o.properties?.find((p) => p.name === n)?.value;
  const cheb = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
  // Sala 4 (covil) da planta de tools/mapgen/expansion5.mjs (ROOMS: [73, 530, 91, 552]), com o mesmo espelhamento.
  const LAIR = { dx0: 73, y0: 530, dx1: 91, y1: 552 };
  const lairX = (c, dx) => (c.mirror ? c.x + 91 - dx : c.x + dx);
  const lairRect = (c) => { const a = lairX(c, LAIR.dx0), b = lairX(c, LAIR.dx1); return { x0: Math.min(a, b), y0: LAIR.y0, x1: Math.max(a, b), y1: LAIR.y1 }; };
  const pzZones = world5.objects.filter((o) => o.type === 'zone' && prop(o, 'pz') === true);
  const inPz = (x, y) => pzZones.some((z) => x * 16 >= z.x && x * 16 < z.x + z.width && y * 16 >= z.y && y * 16 < z.y + z.height);
  const pointAt = new Set(world5.objects.filter((o) => o.point).map((o) => `${Math.floor(o.x / 16)},${Math.floor(o.y / 16)}`));
  const isPortalOrTarget = (x, y) => portals5.has(`${x},${y}`) || [...portals5.values()].some(([tx, ty]) => tx === x && ty === y);
  const reachCount = () => { const r = bfs(world5, SPAWN[0], SPAWN[1], portals5); let n = 0; for (let i = 0; i < r.length; i++) n += r[i]; return n; };
  const before = reachCount();
  const lairObjs = [];
  for (const [caveId, boss, level, chestIds] of lateObjects14.lairs) {
    const c = caves5.find((k) => k.id === caveId);
    if (!c) fail(`covil: cave ${caveId} não existe`);
    const room = lairRect(c);
    const inRoom = (x, y, r = 0) => x - r >= room.x0 && x + r <= room.x1 && y - r >= room.y0 && y + r <= room.y1;
    const { dx, y, radius } = lateObjects14.boss;
    const bx = lairX(c, dx);
    if (!inRoom(bx, y, radius)) fail(`covil ${caveId}: chefe ${boss} em ${bx},${y} (raio ${radius}) fora da sala`);
    if (world5.blocked(bx, y) || !reach5[at(bx, y)]) fail(`covil ${caveId}: chefe ${boss} em ${bx},${y} bloqueado ou inalcançável`);
    if (inPz(bx, y) || pointAt.has(`${bx},${y}`)) fail(`covil ${caveId}: chefe ${boss} em ${bx},${y} em PZ ou em cima de outro objeto`);
    lairObjs.push(['monster_spawn', bx, y, { monster: boss, count: 1, radius, level }, boss]);
    const cx = lairX(c, lateObjects14.chests.dx);
    for (const [i, cy] of lateObjects14.chests.ys.entries()) {
      const id = chestIds[i];
      if (!inRoom(cx, cy)) fail(`covil ${caveId}: baú ${id} em ${cx},${cy} fora da sala`);
      if (world5.blocked(cx, cy) || !reach5[at(cx, cy)]) fail(`covil ${caveId}: baú ${id} em ${cx},${cy} bloqueado ou inalcançável`);
      if (pointAt.has(`${cx},${cy}`) || isPortalOrTarget(cx, cy)) fail(`covil ${caveId}: baú ${id} em ${cx},${cy} em cima de outro objeto`);
      if (cheb(cx, cy, bx, y) <= radius) fail(`covil ${caveId}: baú ${id} dentro da área do chefe`);
      lairObjs.push(['quest_chest', cx, cy, { chestId: id, drawn: true }, id]);
    }
  }
  for (const [id, x, y] of lateObjects14.npcs) {
    const npcTiles = world5.objects.filter((o) => o.type === 'npc').map((o) => [o.x / 16, o.y / 16]);
    const spawnObjs = world5.objects.filter((o) => o.type === 'monster_spawn').map((o) => [o.x / 16, o.y / 16, prop(o, 'radius') ?? 0]);
    if (world5.blocked(x, y) || !reach5[at(x, y)]) fail(`late npc ${id} em ${x},${y} bloqueado ou inalcançável`);
    if (!inPz(x, y)) fail(`late npc ${id} em ${x},${y} fora da zona protegida`);
    if (npcTiles.some(([a, b]) => cheb(a, b, x, y) < 2)) fail(`late npc ${id} a menos de 2 tiles de outro NPC`);
    if (spawnObjs.some(([a, b, r]) => cheb(a, b, x, y) - r < 8)) fail(`late npc ${id} perto demais de um spawn`);
    if (pointAt.has(`${x},${y}`) || isPortalOrTarget(x, y)) fail(`late npc ${id} em ${x},${y} em cima de outro objeto`);
    lairObjs.push(['npc', x, y, { npcId: id }, id]);
  }
  // Baús e NPC viram obstáculo em jogo: nenhum pode fechar bolsão. Bloqueados todos juntos, o mapa alcançável a partir
  // do templo perde exatamente os próprios tiles; e todo baú tem um vizinho andável alcançável (abrir pede Chebyshev 1).
  const solid = lairObjs.filter(([type]) => type !== 'monster_spawn');
  for (const [, x, y] of solid) world5.block(x, y);
  const r = bfs(world5, SPAWN[0], SPAWN[1], portals5);
  let after = 0; for (let i = 0; i < r.length; i++) after += r[i];
  for (const [type, x, y, props] of solid) {
    if (type !== 'quest_chest') continue;
    const ok = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => !world5.blocked(x + a, y + b) && r[at(x + a, y + b)]);
    if (!ok) fail(`baú ${props.chestId} em ${x},${y} sem vizinho alcançável`);
  }
  for (const [, x, y] of solid) world5.block(x, y, false);
  if (after !== before - solid.length) fail(`covis/ferreiro fecham ${before - solid.length - after} tile(s) do mapa`);
  for (const [type, x, y, props, name] of lairObjs) world5.tileObj(type, x, y, props, name);
  console.log(`lateObjects14: ${lateObjects14.lairs.length} chefes de covil, ${solid.length - lateObjects14.npcs.length} baús desenhados, ${lateObjects14.npcs.length} NPC; ${after}/${before} tiles alcançáveis com os obstáculos`);
}

// ===================================================================== BOCAS DE CAVERNA (ciclo 17: tools/mapgen/entrances14.mjs)
// Exceção controlada ao "0 tiles alterados" (autorizada pelo dono): desenha as entradas das caves do ciclo 13 mudando
// tiles só nos retângulos de ENTRANCE_RECTS. Vem depois de todas as etapas já publicadas; etapas futuras entram depois.
drawEntrances14({ map: world5, S, L: LEMON, spawnTile: SPAWN, portalMap: portals5, caves: caves5 });

// ===================================================================== OUTPUT
fs.mkdirSync(MAPS_DIR, { recursive: true });
fs.writeFileSync(path.join(MAPS_DIR, 'world.json'), JSON.stringify(world5.toTiled()));
{ const cp = LEMON.set.croppedPng(); const out = new PNG({ width: cp.width, height: cp.height }); out.data = Buffer.from(cp.data); const dir = path.join(MAPS_DIR, '../tiles'); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'lemon-terrain.png'), PNG.sync.write(out)); }
// Os previews ficam só no disco (assets/maps/preview*.png está no .gitignore): são regenerados aqui a cada rodada.
const a = renderPreview(world5, path.join(MAPS_DIR, 'preview.png'));
const b = renderPreview(world5, path.join(MAPS_DIR, 'preview-small.png'), { scale: 4 });
if (process.argv.includes('--debug')) {
  renderPreview(world5, path.join(here, '_v/debug.png'), { collisionOverlay: true, objectsOverlay: true });
}
console.log(`world.json ${world5.w}x${world5.h}; preview ${a.W}x${a.H}; small ${b.W}x${b.H}; objects ${world5.objects.length}`);

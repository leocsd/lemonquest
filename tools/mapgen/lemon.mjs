// "TilesetLemon": the generated terrain-art tileset of The Lemon Quest (swamp / ruins / dungeon dressing + zone-seam blends).
// Drawn in code in the Ninja Adventure style (16x16, 1px dark outline #141b1b, same palette family as the CC0 pack) and
// appended as the LAST tileset of world.json (image: assets/tiles/lemon-terrain.png), so all pack gids stay stable.
// Everything is deterministic. Tiles are allocated on demand (blend/overlay variants), the atlas is cropped to the used rows.
import { createHash } from 'node:crypto';
import { mulberry32 } from './lib.mjs';
import { createIndustry, createSteel } from './industry.mjs';

export const COLS = 16, CAP_ROWS = 160;
const hexc = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
const rgb = (c) => (typeof c === 'string' ? hexc(c) : c);
export const OL = '#141b1b';

/** tiny RGBA canvas */
export class Cv {
  constructor(w = 16, h = 16) { this.w = w; this.h = h; this.d = new Uint8ClampedArray(w * h * 4); }
  ok(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  set(x, y, c, a = 255) { x = Math.round(x); y = Math.round(y); if (!this.ok(x, y)) return; const [r, g, b] = rgb(c); const i = (y * this.w + x) * 4; this.d[i] = r; this.d[i + 1] = g; this.d[i + 2] = b; this.d[i + 3] = a; }
  /** source-over blend */
  over(x, y, c, a) {
    x = Math.round(x); y = Math.round(y); if (!this.ok(x, y) || a <= 0) return; const [r, g, b] = rgb(c); const i = (y * this.w + x) * 4;
    const da = this.d[i + 3] / 255, sa = a / 255, oa = sa + da * (1 - sa);
    for (let k = 0; k < 3; k++) this.d[i + k] = ([r, g, b][k] * sa + this.d[i + k] * da * (1 - sa)) / oa;
    this.d[i + 3] = oa * 255;
  }
  get(x, y) { if (!this.ok(x, y)) return [0, 0, 0, 0]; const i = (y * this.w + x) * 4; return [this.d[i], this.d[i + 1], this.d[i + 2], this.d[i + 3]]; }
  solid(x, y) { return this.ok(x, y) && this.d[(y * this.w + x) * 4 + 3] >= 200; }
  clear(x, y) { if (this.ok(x, y)) this.d[(y * this.w + x) * 4 + 3] = 0; }
  rect(x, y, w, h, c, a = 255) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c, a); }
  ell(cx, cy, rx, ry, c, a = 255) { for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1) this.set(x, y, c, a); }
  line(x0, y0, x1, y1, c, a = 255) { x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1); const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let e = dx + dy; for (;;) { this.set(x0, y0, c, a); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } } }
  /** 1px outline on transparent pixels that touch a solid one (4-neighbourhood) */
  outline(c = OL) { const add = []; for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) { if (this.d[(y * this.w + x) * 4 + 3] >= 40) continue; if (this.solid(x + 1, y) || this.solid(x - 1, y) || this.solid(x, y + 1) || this.solid(x, y - 1)) add.push([x, y]); } for (const [x, y] of add) this.set(x, y, c); return this; }
  paste(o, ox, oy) { for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) { const [r, g, b, a] = o.get(x, y); if (a) this.over(ox + x, oy + y, [r, g, b], a); } }
  slice(tx, ty) { const o = new Cv(16, 16); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const [r, g, b, a] = this.get(tx * 16 + x, ty * 16 + y); if (a) { o.set(x, y, [r, g, b], a); } } return o; }
  /** radial glow (alpha-blended) */
  glow(cx, cy, r, c, a0 = 70) { for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) { const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r; if (d < 1) this.over(x, y, c, a0 * (1 - d) ** 1.4); } }
}

export class LemonSet {
  constructor() {
    this.columns = COLS; this.capacity = COLS * CAP_ROWS; this.used = 0;
    this.png = { width: COLS * 16, height: CAP_ROWS * 16, data: new Uint8Array(COLS * 16 * CAP_ROWS * 16 * 4) };
    this.keys = new Map(); this.props = new Map();
  }
  /** allocate (or fetch) a tile by key; returns the local tile id */
  add(key, draw, props) {
    if (this.keys.has(key)) return this.keys.get(key);
    if (this.used >= this.capacity) throw new Error('lemon atlas full');
    const id = this.used++; this.keys.set(key, id);
    const cv = typeof draw === 'function' ? draw() : draw;
    const cx = (id % COLS) * 16, cy = Math.floor(id / COLS) * 16, W = this.png.width;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const [r, g, b, a] = cv.get(x, y); const i = ((cy + y) * W + cx + x) * 4; this.png.data[i] = r; this.png.data[i + 1] = g; this.png.data[i + 2] = b; this.png.data[i + 3] = a; }
    if (props) this.props.set(id, props);
    return id;
  }
  croppedPng() { const rows = Math.ceil(this.used / COLS); return { width: this.png.width, height: rows * 16, data: this.png.data.subarray(0, this.png.width * rows * 16 * 4) }; }
}

// ===================================================================== art
const P = {
  ol: OL, g1: '#adbc3a', g2: '#74a334', g3: '#4a7f4b', g4: '#345a52',
  w1: '#e9c48f', w2: '#c69469', w3: '#965746', w4: '#7b473c', w5: '#433737',
  s1: '#e8d9aa', s2: '#d2b37d', s3: '#c8966b', s4: '#a37a56', s5: '#7a5c44',
  m1: '#a8a129', m2: '#74a334',
  c1: '#d6d3c4', c2: '#8d977f', c3: '#5f7160', c4: '#4e484a',
  bone: '#f2eaf1', bone2: '#d6d3c4', bone3: '#a9a597',
  fire1: '#e66a3a', fire2: '#ffad5d', fire3: '#ffe9a0', red: '#d14b34', red2: '#8a1c24',
};

function hashf(x, y, s = 0) { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }

function reed(seed) {
  const r = mulberry32(seed), cv = new Cv(); const n = 3 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const x = 2 + Math.floor((i + 0.2 + r() * 0.6) * (12 / n)), h = 8 + Math.floor(r() * 6), lean = r() < 0.45 ? (r() < 0.5 ? -1 : 1) : 0;
    for (let k = 0; k < h; k++) { const xx = x + (lean && k > h * 0.55 ? lean : 0); cv.set(xx, 15 - k, k % 3 === 2 ? P.g2 : P.g3); }
    const hx = x + lean, hy = 15 - h;
    if (r() < 0.8) { cv.rect(hx - 1, hy - 3, 2, 4, P.w4); cv.set(hx - 1, hy - 3, P.w3); cv.set(hx, hy - 4, P.w2); cv.set(hx - 1, hy, P.w5); } else { cv.set(hx, hy - 1, P.g2); cv.set(hx - lean, hy - 2, P.g2); }
    // a leaf blade
    const d = r() < 0.5 ? -1 : 1, ly = 15 - Math.floor(h * 0.4);
    cv.line(x, ly, x + d * 3, ly - 3, P.g2); cv.line(x + d, ly, x + d * 3, ly - 2, P.g3);
  }
  for (let x = 1; x < 15; x++) if (r() < 0.6) cv.set(x, 15, P.g4);
  return cv;
}

function lily(seed, flower) {
  const r = mulberry32(seed), cv = new Cv();
  const pads = flower ? [[8, 8, 5, 3.4]] : [[5, 5, 4, 2.7], [11, 10, 4.5, 3]];
  for (const [cx, cy, rx, ry] of pads) {
    cv.ell(cx, cy, rx + 0.8, ry + 0.8, P.g4); cv.ell(cx, cy, rx, ry, P.g2); cv.ell(cx - 0.6, cy - 0.5, rx * 0.6, ry * 0.55, P.g1);
    const a = r() * Math.PI * 2; for (let t = 0; t < rx + 2; t += 0.5) { const px = cx + Math.cos(a) * t, py = cy + Math.sin(a) * t * (ry / rx); cv.clear(Math.round(px), Math.round(py)); cv.clear(Math.round(px), Math.round(py) + (Math.sin(a) > 0.3 ? 0 : 0)); }
  }
  if (flower) { cv.set(7, 6, '#ef9597'); cv.set(8, 5, '#ef9597'); cv.set(9, 6, '#ef9597'); cv.set(8, 7, '#ef9597'); cv.set(7, 7, '#f2eaf1'); cv.set(9, 7, '#f2eaf1'); cv.set(8, 6, '#ffbc75'); cv.set(8, 8, '#f2eaf1'); }
  return cv;
}

const GLOW = {
  cyan: { c: ['#d4f5ff', '#79b8ce', '#548789'], g: '#7fe8ff' },
  violet: { c: ['#f0d8ff', '#b080d8', '#7a4fa8'], g: '#c890ff' },
  lime: { c: ['#f2ffb0', '#a8d050', '#6aa030'], g: '#c8ff70' },
  amber: { c: ['#fff0b0', '#ffbc75', '#e66a3a'], g: '#ffc060' },
};
function glowShroom(kind, seed) {
  const { c, g } = GLOW[kind], r = mulberry32(seed), cv = new Cv(); cv.glow(8, 9, 8.5, g, 80);
  const caps = [[8, 10, 4, 3, 5], [4, 12, 2.4, 2, 3], [12, 12.5, 2.2, 1.8, 3]];
  for (const [cx, cy, rx, ry, st] of caps) {
    const x = Math.round(cx); cv.rect(x - 1, Math.round(cy), 2, st, '#e8dcc0'); cv.set(x - 1, Math.round(cy) + st - 1, P.bone3);
    cv.ell(cx, cy, rx + 0.6, ry + 0.6, OL); cv.ell(cx, cy, rx, ry, c[1]); cv.rect(Math.round(cx - rx), Math.round(cy), Math.round(rx * 2), 1, c[2]);
    cv.set(Math.round(cx - rx * 0.4), Math.round(cy - ry * 0.5), c[0]); cv.set(Math.round(cx + rx * 0.3), Math.round(cy - ry * 0.3), c[0]); if (rx > 3) cv.set(Math.round(cx), Math.round(cy - ry * 0.7), c[0]);
  }
  return cv;
}
function shroom(kind, seed) {
  const r = mulberry32(seed), cv = new Cv();
  const capc = kind === 'red' ? [P.red, '#f2eaf1', P.red2] : [P.w2, P.w1, P.w3];
  const caps = r() < 0.5 ? [[7, 9, 4.5, 3.2, 4], [12, 12, 2.5, 2, 3]] : [[6, 10, 3.2, 2.6, 4], [11, 9, 4.2, 3, 5], [3, 13, 2, 1.6, 2]];
  for (const [cx, cy, rx, ry, st] of caps) {
    const x = Math.round(cx); cv.rect(x - 1, Math.round(cy), 2, st, '#e8dcc0'); cv.set(x, Math.round(cy) + st - 1, P.bone3);
    cv.ell(cx, cy, rx + 0.6, ry + 0.6, OL); cv.ell(cx, cy, rx, ry, capc[0]); cv.rect(Math.round(cx - rx), Math.round(cy), Math.round(rx * 2), 1, capc[2]);
    cv.set(Math.round(cx - rx * 0.4), Math.round(cy - ry * 0.5), capc[1]); cv.set(Math.round(cx + rx * 0.35), Math.round(cy - ry * 0.2), capc[1]); if (rx > 3.5) cv.set(Math.round(cx + 1), Math.round(cy - ry * 0.8), capc[1]);
  }
  return cv;
}

function darkTuft(seed) {
  const r = mulberry32(seed), cv = new Cv(); const n = 4 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const x = 2 + Math.floor((i + r() * 0.7) * (12 / n)), h = 4 + Math.floor(r() * 5), lean = Math.floor(r() * 3) - 1;
    for (let k = 0; k < h; k++) { const xx = x + Math.round(lean * k / 3); cv.set(xx, 14 - k, k > h - 2 ? '#8aa24a' : k % 2 ? '#5f7d33' : '#4a6a2c'); }
  }
  for (let x = 2; x < 14; x++) if (r() < 0.7) cv.set(x, 14, '#3a5428');
  return cv;
}

function planks(dir, kind, seed) {
  // dir 'h' = walkway running east-west, 'v' = north-south. kind: mid | cap1 | cap2 (cap1 = start end, cap2 = finish end)
  const cv = new Cv(), r = mulberry32(seed);
  const horiz = dir === 'h';
  const put = (a, b, c, al = 255) => (horiz ? cv.set(a, b, c, al) : cv.set(b, a, c, al)); // a along the walkway, b across it
  const lo = kind === 'cap1' ? 2 : 0, hi = kind === 'cap2' ? 13 : 15;
  for (let a = lo; a <= hi; a++) {
    for (let b = 3; b <= 12; b++) {
      let c = a % 4 === 3 ? P.w3 : a % 4 === 0 ? P.w1 : P.w2;
      if (b === 3) c = a % 4 === 3 ? P.w2 : P.w1; if (b === 12) c = P.w4;
      if (b >= 4 && b <= 11 && a % 4 === 1 && (b === 5 || b === 10) && r() < 0.8) c = P.w3; // nails
      put(a, b, c);
    }
    put(a, 2, P.ol); put(a, 13, P.ol);
    put(a, 14, P.ol, 70); put(a, 15, P.ol, 45); // shadow on the water
  }
  if (kind !== 'mid') { // end posts
    const e = kind === 'cap1' ? 1 : 14;
    for (const b of [1, 14]) for (let t = -1; t <= 1; t++) for (let u = 0; u < 2; u++) { const aa = e + t, bb = b - (b === 14 ? 0 : 0) + u; put(aa, bb, P.w4); }
    for (const b of [1, 14]) { put(e, b, P.w2); put(e - 1, b, P.w3); put(e + 1, b, P.w3); }
  }
  return cv;
}
function plankPost(dir) { // a mid-span post pair (lantern post)
  const cv = planks(dir, 'mid', 3); const put = (a, b, c) => (dir === 'h' ? cv.set(a, b, c) : cv.set(b, a, c));
  for (const b of [1, 14]) { put(7, b, P.w2); put(8, b, P.w2); put(7, b + (b === 1 ? 1 : -1), P.w3); put(8, b + (b === 1 ? 1 : -1), P.w3); }
  return cv;
}

function logPieces(seed) {
  const r = mulberry32(seed), cv = new Cv(32, 16);
  for (let x = 4; x < 29; x++) { for (let y = 4; y <= 12; y++) { const t = (y - 4) / 8; cv.set(x, y, t < 0.2 ? P.w2 : t < 0.55 ? P.w3 : t < 0.85 ? P.w4 : P.w5); } if (x % 5 === 0) cv.set(x, 6 + (x % 3), P.w5); }
  cv.ell(5, 8, 3.5, 4.6, P.w2); cv.ell(5, 8, 2.3, 3.4, P.w1); cv.ell(5, 8, 1, 1.8, P.w2); cv.set(5, 8, P.w3);
  for (let y = 4; y <= 12; y++) { const cut = Math.floor(r() * 3); cv.clear(28 - cut + (y % 2), y); cv.clear(29 - cut, y); cv.clear(30, y); }
  for (const [mx, my] of [[10, 4], [11, 4], [12, 4], [18, 4], [19, 4], [20, 4], [21, 5], [13, 5], [11, 5], [24, 4], [25, 5]]) { cv.set(mx, my, P.m2); cv.set(mx, my + 1, P.m2); }
  for (const [mx, my] of [[10, 4], [18, 4], [24, 4]]) cv.set(mx, my, P.g1);
  cv.set(14, 3, P.g2); cv.set(15, 3, P.g2); cv.set(15, 2, P.g1);
  cv.outline();
  for (let x = 3; x < 30; x++) { cv.over(x, 14, OL, 55); }
  return cv;
}

function bone(seed, kind) {
  const r = mulberry32(seed), cv = new Cv();
  const skull = (x, y, big) => { cv.ell(x, y, big ? 4 : 3, big ? 3.4 : 2.8, P.bone); cv.rect(Math.round(x - 1.5), Math.round(y + 2), 3, 2, P.bone2); cv.set(Math.round(x - 1), Math.round(y), OL); cv.set(Math.round(x - 1), Math.round(y + 1), OL); cv.set(Math.round(x + 1), Math.round(y), OL); cv.set(Math.round(x + 1), Math.round(y + 1), OL); cv.set(Math.round(x - 1), Math.round(y + 3), OL); cv.set(Math.round(x + 1), Math.round(y + 3), OL); cv.set(Math.round(x - 2), Math.round(y - 2), P.bone2); };
  const bn = (x0, y0, x1, y1) => { cv.line(x0, y0, x1, y1, P.bone); cv.set(x0, y0, P.bone); cv.set(x0 + 1, y0 + 1 > 15 ? 15 : y0 + 1, P.bone2); cv.set(x1, y1 - 1, P.bone); cv.set(x1 + 1, y1, P.bone2); };
  if (kind === 'skull') { bn(2, 13, 11, 10); bn(4, 10, 13, 13); skull(8, 8, true); }
  else if (kind === 'ribs') { bn(7, 3, 7, 13); for (let i = 0; i < 4; i++) { cv.line(7, 5 + i * 2, 3, 6 + i * 2, P.bone); cv.line(7, 5 + i * 2, 11, 6 + i * 2, P.bone); cv.set(3, 6 + i * 2, P.bone2); cv.set(11, 6 + i * 2, P.bone2); } }
  else { skull(5, 9, false); bn(8, 12, 14, 8); bn(7, 6, 13, 4); cv.set(12, 12, P.bone2); cv.set(10, 14, P.bone2); }
  // shadow
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (cv.solid(x, y) && !cv.solid(x, y + 1) && y < 15) cv.over(x, y + 1, OL, 70);
  return cv;
}

function rubble(seed, pal) {
  const r = mulberry32(seed), cv = new Cv(); const [hi, mid, lo, dk] = pal;
  const n = 4 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const w = 3 + Math.floor(r() * 4), h = 2 + Math.floor(r() * 3), x = 1 + Math.floor(r() * (13 - w)), y = 5 + Math.floor(r() * (10 - h));
    cv.rect(x - 1, y - 1, w + 2, h + 2, OL); cv.rect(x, y, w, h, mid); cv.rect(x, y, w, 1, hi); cv.rect(x + w - 1, y + 1, 1, h - 1, lo); if (r() < 0.4) cv.set(x + 1, y + h - 1, dk);
  }
  for (let i = 0; i < 3; i++) { const x = 1 + Math.floor(r() * 13), y = 9 + Math.floor(r() * 5); if (!cv.solid(x, y)) cv.set(x, y, lo); }
  return cv;
}

function stalagmite(seed, tall) {
  const r = mulberry32(seed), W = 16, Hh = tall ? 32 : 16, cv = new Cv(W, Hh);
  const cones = tall ? [[8, 30, 6, 28]] : [[6, 14, 4.2, 9], [11, 14, 3, 6]];
  for (const [cx, by, hw, h] of cones) {
    for (let y = 0; y < h; y++) { const t = y / h, w = hw * (0.15 + 0.85 * t), yy = by - h + 1 + y; for (let x = Math.floor(cx - w); x <= Math.ceil(cx + w); x++) { if (Math.abs(x + 0.5 - cx) > w) continue; const s = (x + 0.5 - cx) / w; cv.set(x, yy, s < -0.35 ? P.c1 : s < 0.2 ? P.c2 : s < 0.7 ? P.c3 : P.c4); } }
  }
  cv.outline();
  for (let x = 0; x < W; x++) for (let y = 0; y < Hh; y++) if (cv.solid(x, y) && !cv.solid(x, y + 1) && y + 1 < Hh) cv.over(x, y + 1, OL, 60);
  return cv;
}

function crystal(kind, seed) {
  const { c, g } = GLOW[kind], r = mulberry32(seed), cv = new Cv(); cv.glow(8, 9, 9, g, 90);
  const prisms = [[8, 14, 3.2, 11], [4, 14, 2.2, 6], [12, 14, 2.4, 7]];
  for (const [cx, by, hw, h] of prisms) {
    for (let y = 0; y < h; y++) { const t = y / h, w = hw * (t < 0.25 ? 0.3 + t * 2.8 : 1) , yy = by - h + 1 + y; for (let x = Math.floor(cx - w); x <= Math.ceil(cx + w); x++) { if (Math.abs(x + 0.5 - cx) > w) continue; const s = (x + 0.5 - cx) / w; cv.set(x, yy, s < -0.2 ? c[0] : s < 0.5 ? c[1] : c[2]); } }
  }
  cv.outline(); cv.set(7, 6, '#ffffff'); cv.set(7, 7, '#ffffff'); cv.set(3, 10, '#ffffff');
  for (let x = 2; x < 14; x++) cv.over(x, 15, OL, 70);
  return cv;
}

function candle(kind) {
  const cv = new Cv(); const flame = (x, y) => { cv.set(x, y, P.fire2); cv.set(x, y - 1, P.fire3); cv.set(x, y - 2, P.fire2); cv.set(x, y - 3, P.fire1, 200); cv.glow(x + 0.5, y - 1, 6, '#ffbc75', 80); };
  const wax = (x, h, w = 3) => { cv.rect(x, 14 - h, w, h, P.bone); cv.rect(x + w - 1, 14 - h, 1, h, P.bone2); cv.set(x + 1, 14 - h, P.bone3); };
  if (kind === 'one') { cv.glow(8, 9, 7, '#ffbc75', 60); wax(6, 5); cv.set(6, 14, P.bone2); cv.rect(5, 14, 5, 1, P.bone2); cv.set(8, 12, P.bone2); flame(7, 8); cv.outline(); }
  else if (kind === 'three') {
    cv.glow(8, 9, 8, '#ffbc75', 70); cv.ell(8, 14, 6.5, 1.8, P.bone2); wax(3, 4, 3); wax(7, 7, 3); wax(11, 5, 3); flame(4, 8); flame(8, 5); flame(12, 7);
    cv.outline();
  } else { // candelabra, on a stand
    cv.rect(7, 7, 2, 7, P.w2); cv.rect(5, 14, 6, 1, P.w3); cv.rect(6, 13, 4, 1, P.w2); cv.set(7, 7, P.w1);
    cv.line(3, 6, 7, 9, P.w2); cv.line(12, 6, 8, 9, P.w2); cv.rect(3, 5, 2, 1, P.w1); cv.rect(11, 5, 2, 1, P.w1);
    wax(3, 3, 2); wax(7, 3, 2); wax(11, 3, 2);
    cv.glow(8, 6, 9, '#ffbc75', 80); flame(3, 4); flame(7, 4); flame(11, 4);
    // wax bodies sit on the arms
    cv.outline();
  }
  return cv;
}

function brazier() {
  const cv = new Cv(); cv.glow(8, 6, 9, '#ff9a3c', 80);
  // flame
  const fl = (cx, top, w, c) => { for (let y = top; y < 9; y++) { const t = (y - top) / (9 - top), hw = Math.max(0, Math.round(w * (0.25 + t * 0.85))); for (let x = cx - hw; x <= cx + hw; x++) cv.set(x, y, c); } };
  fl(8, 1, 3.4, P.fire1); fl(8, 3, 2.4, P.fire2); fl(8, 5, 1.2, P.fire3); cv.set(4, 6, P.fire1); cv.set(12, 5, P.fire1); cv.set(11, 3, P.fire2, 200);
  cv.outline('#7a2a14');
  // bowl
  cv.rect(3, 9, 10, 1, P.c1); cv.rect(3, 10, 10, 1, P.c2); for (let y = 11; y < 13; y++) cv.rect(4 + (y - 11), y, 8 - (y - 11) * 2, 1, y === 11 ? P.c2 : P.c3); cv.rect(5, 12, 6, 1, P.c4);
  cv.rect(7, 13, 2, 1, P.c4); cv.rect(4, 14, 8, 1, P.c3); cv.rect(4, 15, 8, 1, P.c4); cv.rect(5, 14, 1, 1, P.c2);
  cv.rect(3, 9, 1, 1, OL); cv.rect(12, 9, 1, 1, OL);
  // outline bowl only
  for (let x = 2; x <= 13; x++) { cv.set(x, 8, x >= 4 && x <= 11 ? P.fire1 : OL); }
  cv.set(2, 9, OL); cv.set(13, 9, OL); cv.set(2, 10, OL); cv.set(13, 10, OL); cv.set(3, 11, OL); cv.set(12, 11, OL); cv.set(4, 12, OL); cv.set(11, 12, OL); cv.set(3, 14, OL); cv.set(12, 14, OL); cv.set(3, 15, OL); cv.set(12, 15, OL);
  for (let x = 4; x < 12; x++) { cv.set(x, 16 - 1, P.c4); }
  for (let x = 4; x <= 11; x++) cv.set(x, 8, P.fire2);
  return cv;
}

function column(part, seed) {
  const r = mulberry32(seed), cv = new Cv();
  const shaft = (y0, y1, x0 = 3, x1 = 12) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const t = (x - x0) / (x1 - x0); cv.set(x, y, t < 0.18 ? P.s1 : t < 0.55 ? P.s2 : t < 0.85 ? P.s3 : P.s4); }
    for (let y = y0; y <= y1; y++) { if ((y + seed) % 5 !== 0) { cv.set(x0 + 3, y, P.s3); cv.set(x0 + 6, y, P.s4); } }
    for (let i = 0; i < 4; i++) { const mx = x0 + Math.floor(r() * (x1 - x0)), my = y0 + Math.floor(r() * (y1 - y0 + 1)); cv.set(mx, my, r() < 0.5 ? P.m1 : P.m2); if (r() < 0.6) cv.set(mx + 1, my, P.m1); }
  };
  const slab = (y0, y1, x0 = 1, x1 = 14) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) cv.set(x, y, y === y0 ? P.s1 : y === y1 ? P.s4 : x > x1 - 3 ? P.s3 : P.s2); };
  if (part === 'cap') { slab(1, 4); shaft(5, 15); cv.rect(2, 5, 12, 1, P.s4, 120); }
  else if (part === 'shaft') shaft(0, 15);
  else if (part === 'base') { shaft(0, 9); slab(10, 14); cv.rect(2, 14, 12, 1, P.s5); }
  else if (part === 'broken') { // shaft with a jagged broken top
    const tops = [5, 3, 6, 2, 7, 4, 5, 8, 3, 6]; for (let x = 3; x <= 12; x++) { const t = tops[(x + seed) % tops.length]; for (let y = t; y <= 15; y++) { const q = (x - 3) / 9; cv.set(x, y, q < 0.18 ? P.s1 : q < 0.55 ? P.s2 : q < 0.85 ? P.s3 : P.s4); } cv.set(x, t, P.s1); }
    for (let y = 6; y <= 15; y += 3) { cv.set(6, y, P.s3); cv.set(9, y, P.s4); } cv.set(5, 11, P.m1); cv.set(6, 11, P.m2); cv.set(10, 8, P.m1);
  } else if (part === 'stub') { // base with a stump
    const tops = [9, 7, 8, 6, 9, 7, 8, 10, 7, 9]; for (let x = 3; x <= 12; x++) { const t = tops[(x + seed) % tops.length]; for (let y = t; y <= 10; y++) { const q = (x - 3) / 9; cv.set(x, y, q < 0.18 ? P.s1 : q < 0.55 ? P.s2 : q < 0.85 ? P.s3 : P.s4); } cv.set(x, t, P.s1); }
    slab(11, 14); cv.rect(2, 14, 12, 1, P.s5); cv.set(5, 9, P.m1); cv.set(6, 9, P.m2); cv.set(10, 12, P.m1);
  }
  cv.outline();
  return cv;
}
function fallenColumn() { // 2 tiles wide, lying down
  const cv = new Cv(32, 16);
  for (let x = 3; x < 31; x++) for (let y = 5; y <= 12; y++) { const t = (y - 5) / 7; cv.set(x, y, t < 0.2 ? P.s1 : t < 0.5 ? P.s2 : t < 0.8 ? P.s3 : P.s4); if (x % 6 === 0 && y > 5 && y < 12) cv.set(x, y, P.s4); }
  for (let y = 3; y <= 14; y++) cv.set(2, y, y === 3 || y === 14 ? P.s4 : P.s2), cv.set(3, y, y === 3 || y === 14 ? P.s4 : P.s1);
  for (let y = 5; y <= 12; y++) { const cut = (y * 7) % 4; for (let x = 27 + cut; x < 32; x++) cv.clear(x, y); }
  for (const [mx, my] of [[8, 5], [9, 5], [15, 6], [16, 5], [22, 5], [23, 6], [24, 5]]) cv.set(mx, my, mx % 2 ? P.m2 : P.m1);
  cv.outline(); for (let x = 3; x < 28; x++) cv.over(x, 14, OL, 60);
  return cv;
}

function archSheet(collapsed) { // 5x4 tiles: two piers + a stone ring over a 3-tile passage
  const Wd = 80, Ht = 64, cv = new Cv(Wd, Ht), cx = 40, cy = 44, Ro = 38, Ri = 27;
  for (let y = 0; y < Ht; y++) for (let x = 0; x < Wd; x++) {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
    let inside = false, shade = 0;
    if (y <= cy && d <= Ro && d >= Ri) { inside = true; shade = (x + 0.5 - cx) / 40 + (y + 0.5 - cy) / 60; }
    if (y > cy - 6 && ((x >= 3 && x <= 14) || (x >= 65 && x <= 76)) && y < 63) { inside = true; shade = x < 40 ? (x - 3) / 11 - 0.3 : (x - 65) / 11 - 0.3; }
    if (inside) cv.set(x, y, shade < -0.5 ? P.s1 : shade < 0.15 ? P.s2 : shade < 0.6 ? P.s3 : P.s4);
  }
  // voussoir joints on the ring
  for (let a = 0; a < 11; a++) { const ang = Math.PI + (a + 0.5) * (Math.PI / 11); for (let t = Ri; t < Ro; t += 0.5) cv.set(cx + Math.cos(ang) * t, cy + Math.sin(ang) * t, P.s4); }
  // keystone
  cv.rect(37, 5, 6, 12, P.s1); cv.rect(37, 5, 1, 12, P.s2); cv.rect(42, 5, 1, 12, P.s3); cv.rect(38, 15, 4, 1, P.s4);
  // pier plinths + capitals
  for (const x0 of [2, 64]) { cv.rect(x0, 58, 14, 5, P.s2); cv.rect(x0, 58, 14, 1, P.s1); cv.rect(x0, 62, 14, 1, P.s5); cv.rect(x0, cy - 5, 14, 3, P.s1); cv.rect(x0, cy - 3, 14, 1, P.s4); }
  for (let y = 48; y < 58; y += 4) { cv.set(7, y, P.s3); cv.set(10, y + 1, P.s4); cv.set(69, y, P.s3); cv.set(72, y + 1, P.s4); }
  if (collapsed) { // the right half of the ring has fallen, the right pier is a broken stump
    for (let y = 0; y < Ht; y++) for (let x = 44; x < Wd; x++) { const lim = 30 + ((x * 5 + y * 3) % 6) + (x - 44) * 0.4; if (y < lim) cv.clear(x, y); }
    for (let y = 30; y < 50; y++) for (let x = 62; x < 79; x++) if (y < 40 + ((x * 7) % 5)) cv.clear(x, y);
  }
  for (const [mx, my] of [[5, 52], [6, 53], [7, 52], [30, 12], [31, 11], [14, 30], [66, 56], [67, 57], [10, 40], [20, 18], [72, 52]]) if (cv.solid(mx, my)) cv.set(mx, my, mx % 2 ? P.m1 : P.m2);
  for (const [mx, my] of [[8, 36], [9, 36], [10, 37], [6, 44], [26, 22], [27, 21]]) if (cv.solid(mx, my)) cv.set(mx, my, P.m2);
  cv.outline();
  for (let x = 0; x < Wd; x++) for (let y = 56; y < Ht; y++) if (cv.solid(x, y) && !cv.solid(x, y + 1) && y + 1 < Ht) cv.over(x, y + 1, OL, 60);
  return cv;
}

function totem(variant) {
  const cv = new Cv(16, 32);
  cv.rect(6, 12, 4, 19, P.w3); cv.rect(6, 12, 1, 19, P.w2); cv.rect(9, 12, 1, 19, P.w4); for (let y = 15; y < 30; y += 4) { cv.set(7, y, P.w5); cv.set(8, y + 1, P.w5); }
  cv.rect(4, 26, 8, 3, P.w4); cv.rect(4, 26, 8, 1, P.w2); // base blocks
  // cloth
  cv.rect(3, 16, 10, 3, P.red); cv.rect(3, 16, 10, 1, '#ef7a5a'); cv.set(3, 19, P.red); cv.set(4, 19, P.red2); cv.set(12, 19, P.red2); cv.set(8, 19, P.red); cv.set(7, 20, P.red2); cv.set(13, 18, P.red2);
  // skull
  cv.ell(8, 7, 4.5, 4.2, P.bone); cv.rect(5, 10, 6, 3, P.bone2); cv.rect(7, 12, 2, 1, P.bone2);
  cv.rect(5, 6, 2, 2, OL); cv.rect(9, 6, 2, 2, OL); cv.set(8, 9, OL); cv.set(7, 11, OL); cv.set(9, 11, OL);
  cv.set(5, 3, P.bone2); cv.set(6, 2, P.bone);
  // horns / feathers
  if (variant === 0) { cv.line(4, 5, 1, 1, P.bone2); cv.line(11, 5, 14, 1, P.bone2); cv.set(1, 1, P.bone); cv.set(14, 1, P.bone); }
  else { for (const [fx, c] of [[3, P.red], [13, '#d6a030'], [1, P.g3], [15, P.red2]]) cv.line(fx < 8 ? 4 : 11, 5, fx, 0, c); }
  cv.outline();
  for (let x = 3; x < 13; x++) cv.over(x, 31, OL, 80);
  return cv;
}
function banner(c1, c2, emblem) {
  const cv = new Cv(16, 32);
  cv.rect(2, 3, 12, 2, P.w3); cv.rect(2, 3, 12, 1, P.w2); cv.rect(1, 2, 2, 4, P.w4); cv.rect(13, 2, 2, 4, P.w4); // crossbar
  cv.rect(7, 5, 2, 25, P.w4); cv.rect(7, 5, 1, 25, P.w3);
  for (let y = 6; y <= 24; y++) { const tail = y > 20 ? (y - 20) : 0; for (let x = 3 + (y > 20 ? 0 : 0); x <= 12; x++) { const inV = y > 20 && x >= 7 - (y - 20) * 0 && false; if (y > 20 && Math.abs(x - 7.5) < (y - 20) * 0.9 && y > 21) continue; cv.set(x, y, x === 3 || x === 12 || y === 6 ? c2 : c1); } }
  cv.rect(3, 6, 10, 1, c2);
  // emblem
  if (emblem === 'skull') { cv.ell(8, 12, 2.4, 2.2, P.bone); cv.set(7, 12, OL); cv.set(9, 12, OL); cv.rect(7, 14, 3, 1, P.bone2); }
  else { cv.line(6, 10, 10, 15, c2); cv.line(10, 10, 6, 15, c2); cv.set(8, 12, P.fire2); }
  cv.rect(6, 25, 4, 1, c2);
  cv.rect(7, 28, 2, 3, P.w4); cv.rect(5, 29, 6, 2, P.w4); cv.rect(5, 29, 6, 1, P.w3);
  cv.outline(); for (let x = 5; x < 11; x++) cv.over(x, 31, OL, 80);
  return cv;
}

function cobweb(flip) {
  const cv = new Cv(), a = 200, c = '#f4f0f4';
  const L = (x0, y0, x1, y1) => cv.line(flip ? 15 - x0 : x0, y0, flip ? 15 - x1 : x1, y1, c, a);
  L(0, 0, 15, 1); L(0, 0, 14, 7); L(0, 0, 9, 12); L(0, 0, 3, 15); L(0, 0, 0, 15);
  L(5, 0, 3, 3); L(3, 3, 0, 5); L(9, 0, 6, 6); L(6, 6, 0, 9); L(13, 1, 9, 9); L(9, 9, 1, 13);
  cv.glow(0, 0, 3, '#ffffff', 40);
  return cv;
}
function cobwebHang() { // dangling strands in the middle of a wall top
  const cv = new Cv(), c = '#f4f0f4'; for (const [x, l] of [[3, 5], [5, 8], [8, 6], [11, 9], [13, 4]]) { cv.line(x, 0, x + (x % 2 ? 1 : -1), l, c, 190); }
  cv.line(3, 3, 13, 3, c, 150); cv.line(2, 6, 12, 7, c, 120); return cv;
}

function sarcophagus() {
  const cv = new Cv(32, 16);
  for (let y = 2; y <= 12; y++) for (let x = 2; x <= 29; x++) { const edge = y === 2 || x === 2; cv.set(x, y, edge ? P.c1 : y > 10 || x > 27 ? P.c3 : P.c2); }
  cv.rect(4, 4, 24, 7, P.c2); cv.rect(4, 4, 24, 1, P.c1); cv.rect(5, 5, 22, 5, '#9aa58a'); // lid
  cv.rect(14, 5, 4, 5, P.c3); cv.rect(15, 6, 2, 3, P.c2); cv.rect(15, 4, 2, 7, P.c3, 0);
  cv.rect(7, 7, 5, 1, P.c3); cv.rect(20, 7, 5, 1, P.c3);
  for (const [mx, my] of [[6, 5], [7, 5], [24, 9], [25, 9], [22, 5]]) cv.set(mx, my, P.m2);
  cv.outline(); for (let x = 2; x < 30; x++) cv.over(x, 14, OL, 70);
  return cv;
}

function mausTop() { // 5x2 tiles: gabled pediment with a skull in the tympanum, over the crypt mausoleum front
  const cv = new Cv(80, 32);
  for (let y = 24; y < 32; y++) for (let x = 0; x < 80; x++) cv.set(x, y, y === 24 ? P.c1 : y > 29 ? P.c4 : y > 27 ? P.c3 : P.c2);
  for (let y = 4; y < 24; y++) { const hw = Math.min(39, (y - 3) * 2.1); for (let x = Math.ceil(40 - hw); x < 40 + hw; x++) { const edge = x - (40 - hw) < 3 || (40 + hw) - x < 3; cv.set(x, y, edge ? (x < 40 ? P.c1 : P.c3) : y < 6 ? P.c1 : P.c2); } }
  for (let y = 9; y < 24; y++) { const hw = Math.min(33, (y - 7) * 1.9); for (let x = Math.ceil(40 - hw); x < 40 + hw; x++) cv.set(x, y, P.c3); }
  for (let y = 23; y < 24; y++) for (let x = 6; x < 74; x++) cv.set(x, y, P.c4);
  cv.ell(40, 17, 5, 4.6, P.c1); cv.rect(37, 20, 6, 3, '#bfbfae'); cv.rect(36, 15, 3, 3, OL); cv.rect(42, 15, 3, 3, OL); cv.set(40, 19, OL); cv.set(39, 22, OL); cv.set(41, 22, OL);
  cv.rect(38, 0, 4, 4, P.c2); cv.rect(38, 0, 4, 1, P.c1); cv.rect(39, 4, 2, 1, P.c3);
  for (const [mx, my] of [[10, 25], [11, 25], [12, 25], [60, 25], [61, 26], [30, 25], [14, 22], [66, 21], [22, 26], [50, 25], [51, 25]]) cv.set(mx, my, mx % 2 ? P.m2 : P.m1);
  cv.outline();
  return cv;
}

function crackStone(seed) {
  const r = mulberry32(seed), cv = new Cv(); let x = 1 + Math.floor(r() * 5), y = 0;
  const pts = []; while (y < 16 && x > 0 && x < 15) { pts.push([x, y]); y++; x += Math.floor(r() * 3) - 1; if (r() < 0.12) { /* fork */ let fx = x, fy = y; for (let k = 0; k < 4; k++) { fx += r() < 0.5 ? 1 : -1; fy++; if (fx > 0 && fx < 15 && fy < 16) pts.push([fx, fy]); } } }
  for (const [px, py] of pts) { cv.set(px, py, '#3f3a38', 220); cv.over(px + 1, py, '#ffffff', 25); }
  return cv;
}
function crackLava(seed) {
  const r = mulberry32(seed), cv = new Cv(); let x = 2 + Math.floor(r() * 4), y = 0; const pts = [];
  while (y < 16 && x > 0 && x < 15) { pts.push([x, y]); y++; x += Math.floor(r() * 3) - 1; if (r() < 0.2) pts.push([x + 1, y]); }
  cv.glow(8, 8, 9, '#ff7a2a', 50);
  for (const [px, py] of pts) { cv.set(px - 1, py, '#2b1812', 230); cv.set(px + 1, py, '#2b1812', 230); }
  for (const [px, py] of pts) cv.set(px, py, (px + py) % 3 === 0 ? P.fire3 : P.fire2);
  return cv;
}

function flagstonePx(x, y, v) {
  // brick-ish flags (period 16 x 8), returns [r,g,b]
  const row = Math.floor(y / 8), off = row % 2 ? 8 : 0, lx = (x + off) % 16, ly = y % 8;
  if (ly === 7 || lx === 15 || (lx === 0 && false)) return hexc('#8a7457');
  if (ly === 0 || lx === 0) return hexc('#e2cd9c');
  const h = hashf(Math.floor((x + off) / 16), row, 31 + v);
  const base = h < 0.34 ? '#cfb683' : h < 0.7 ? '#c7ad79' : '#d6bf8e';
  return hexc(base);
}

// ===================================================================== registry
export function createLemon(ts) {
  const set = new LemonSet();
  const t = ts.addDynamic('TilesetLemon', 'lemon-terrain.png', set);
  const gidOf = (id) => t.firstgid + id;
  const L = { set, ts, t, Cv };
  const tile = (key, draw, props) => gidOf(set.add(key, draw, props));
  L.tile = tile;
  const sheet = (key, cv, wt, ht, props) => { const rows = []; for (let j = 0; j < ht; j++) { const row = []; for (let i = 0; i < wt; i++) { const sl = cv.slice(i, j); let any = false; for (let k = 3; k < sl.d.length; k += 4) if (sl.d[k] > 0) { any = true; break; } row.push(any ? tile(`${key}:${i},${j}`, () => sl, props) : 0); } rows.push(row); } return rows; };
  L.sheet = sheet;

  const S = {};
  S.reed = [1, 2, 3, 4, 5].map((s) => tile('reed' + s, () => reed(900 + s * 17)));
  S.lilyPad = [1, 2, 3].map((s) => tile('lily' + s, () => lily(70 + s * 5, false)));
  S.lilyFlower = [1, 2].map((s) => tile('lilyf' + s, () => lily(300 + s * 11, true)));
  S.glow = {};
  for (const k of Object.keys(GLOW)) S.glow[k] = [1, 2].map((s) => tile(`glow_${k}${s}`, () => glowShroom(k, 40 + s * 9)));
  S.shroomRed = [1, 2, 3].map((s) => tile('shroomr' + s, () => shroom('red', 50 + s * 13)));
  S.shroomBrown = [1, 2].map((s) => tile('shroomb' + s, () => shroom('brown', 80 + s * 7)));
  S.darkTuft = [1, 2, 3, 4].map((s) => tile('dtuft' + s, () => darkTuft(11 * s)));
  for (const d of ['h', 'v']) { S['plank_' + d] = [1, 2].map((s) => tile(`plank_${d}${s}`, () => planks(d, 'mid', s * 5), { speed: 90, terrain: 'floor' })); S['plankPost_' + d] = tile('plankPost_' + d, () => plankPost(d), { speed: 90, terrain: 'floor' }); S['plankA_' + d] = tile(`plankA_${d}`, () => planks(d, 'cap1', 4), { speed: 90, terrain: 'floor' }); S['plankB_' + d] = tile(`plankB_${d}`, () => planks(d, 'cap2', 4), { speed: 90, terrain: 'floor' }); }
  S.logH = sheet('log', logPieces(12), 2, 1);
  S.logH2 = sheet('log2', logPieces(27), 2, 1);
  S.bone = ['skull', 'ribs', 'mix', 'mix2'].map((k, i) => tile('bone_' + k, () => bone(5 + i * 3, k === 'mix2' ? 'mix' : k)));
  S.rubbleTan = [1, 2, 3, 4].map((s) => tile('rubT' + s, () => rubble(10 + s * 3, [P.s1, P.s2, P.s3, P.s4])));
  S.rubbleGray = [1, 2, 3, 4].map((s) => tile('rubG' + s, () => rubble(60 + s * 3, [P.c1, P.c2, P.c3, P.c4])));
  S.stalag = [1, 2, 3].map((s) => tile('stalag' + s, () => stalagmite(20 + s, false)));
  S.stalagTall = [1, 2].map((s) => sheet('stalagT' + s, stalagmite(40 + s, true), 1, 2));
  S.crystal = {}; for (const k of ['cyan', 'violet', 'lime', 'amber']) S.crystal[k] = [1, 2].map((s) => tile(`cryst_${k}${s}`, () => crystal(k, 20 + s)));
  S.candle = { one: tile('candle1', () => candle('one')), three: tile('candle3', () => candle('three')), stand: tile('candlestand', () => candle('stand')) };
  S.brazier = tile('brazier', brazier);
  S.col = { cap: [1, 2].map((s) => tile('col_cap' + s, () => column('cap', s))), shaft: [1, 2, 3].map((s) => tile('col_shaft' + s, () => column('shaft', s))), base: [1, 2].map((s) => tile('col_base' + s, () => column('base', s))), broken: [1, 2, 3].map((s) => tile('col_broken' + s, () => column('broken', s))), stub: [1, 2, 3].map((s) => tile('col_stub' + s, () => column('stub', s))) };
  S.fallenCol = sheet('colfall', fallenColumn(), 2, 1);
  S.arch = sheet('arch', archSheet(false), 5, 4);
  S.archBroken = sheet('archb', archSheet(true), 5, 4);
  S.totem = [0, 1].map((v) => sheet('totem' + v, totem(v), 1, 2));
  S.bannerRed = sheet('banR', banner(P.red2, P.red, 'skull'), 1, 2);
  S.bannerGreen = sheet('banG', banner('#2f5a3c', '#4a7f4b', 'x'), 1, 2);
  S.bannerBlack = sheet('banK', banner('#2b2630', '#4e484a', 'skull'), 1, 2);
  S.cobweb = [tile('web0', () => cobweb(false)), tile('web1', () => cobweb(true))];
  S.cobwebHang = tile('webh', cobwebHang);
  S.mausTop = sheet('mausTop', mausTop(), 5, 2);
  S.sarcophagus =sheet('sarc', sarcophagus(), 2, 1);
  S.crackStone = [1, 2, 3, 4, 5].map((s) => tile('crackS' + s, () => crackStone(s * 13)));
  S.crackLava = [1, 2, 3].map((s) => tile('crackL' + s, () => crackLava(s * 29)));
  L.S = S;

  // ---------------------------------------------------------------- pixel specs for blends
  const noise = (x, y, s) => hashf(x, y, s);
  const flat = (hex, speck) => (x, y, v) => { const c = hexc(hex); if (speck && noise(x, y, v + 9) < speck[1]) return hexc(speck[0]); return c; };
  const fromTile = (gid) => { const loc = ts.locate(gid); return (x, y) => { const i = (((loc.row * 16 + y) * loc.t.imagewidth) + loc.col * 16 + x) * 4; return [loc.t.png.data[i], loc.t.png.data[i + 1], loc.t.png.data[i + 2]]; }; };
  const flagstone = (x, y, v) => { const c = flagstonePx(x, y, v); if (noise(x, y, 77 + v) < 0.035) return hexc('#a8a129'); return c; };
  L.px = { flat, fromTile, flagstone, hexc };

  /** blob tile: base pixels with `over` pixels inside a smooth mask of neighbours. mask8 = [n,ne,e,se,s,sw,w,nw] 0/1 string (canonical, as blobMask). */
  L.blob = (famKey, basePx, overPx, mask8, variant = 0, props) => {
    const key = `blob:${famKey}:${mask8}:${variant}`;
    return tile(key, () => {
      const m = [...mask8].map((c) => c === '1');
      const cells = [[0, 0]]; const dirs = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
      dirs.forEach(([dx, dy], i) => { if (m[i]) cells.push([dx, dy]); });
      const cv = new Cv();
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const u = (x + 0.5) / 16, w = (y + 0.5) / 16; let f = 0;
        for (const [dx, dy] of cells) { const d = Math.hypot(u - (dx + 0.5), w - (dy + 0.5)); f += Math.max(0, 1 - d / 0.9); }
        const thr = 0.5 + (((x + y) & 1) ? 0.07 : -0.07);
        const inside = f > thr;
        const [r, g, b] = inside ? overPx(x, y, variant) : basePx(x, y, variant);
        cv.set(x, y, [r, g, b]);
      }
      return cv;
    }, props);
  };

  /** copy of a pack tile with an overlay drawn on top (moss, vines, torches...) */
  L.overlay = (gid, kind, variant, draw) => tile(`ov:${kind}:${variant}:${gid}`, () => {
    const loc = ts.locate(gid); const cv = new Cv();
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const i = (((loc.row * 16 + y) * loc.t.imagewidth) + loc.col * 16 + x) * 4; if (loc.t.png.data[i + 3]) cv.set(x, y, [loc.t.png.data[i], loc.t.png.data[i + 1], loc.t.png.data[i + 2]], loc.t.png.data[i + 3]); }
    draw(cv, mulberry32(variant * 977 + gid));
    return cv;
  });
  L.draw = {
    // grey-green moss strands hanging from the lower edge of a canopy / branches
    moss(cv, r) { for (let x = 0; x < 16; x++) for (let y = 0; y < 16; y++) { if (cv.solid(x, y) && !cv.solid(x, y + 1) && r() < 0.42) { const len = 2 + Math.floor(r() * 5); for (let k = 1; k <= len; k++) { if (cv.solid(x, y + k)) break; cv.set(x, y + k, k === len ? '#a9b48f' : k % 2 ? '#8fa077' : '#6f8a62'); } } } },
    // green vines creeping down from the top edge of a wall
    vine(cv, r) { const n = 3 + Math.floor(r() * 3); for (let i = 0; i < n; i++) { const x = 1 + Math.floor(r() * 14), len = 5 + Math.floor(r() * 9); for (let k = 0; k < len; k++) { const xx = x + (k > 3 && r() < 0.25 ? (r() < 0.5 ? -1 : 1) : 0); cv.set(xx, k, k % 4 === 3 ? P.g2 : P.g3); if (k % 3 === 2) { cv.set(xx + 1, k, P.g2); cv.set(xx - 1, k, P.g3); } } } for (let x = 0; x < 16; x++) if (r() < 0.5) { cv.set(x, 0, P.g3); if (r() < 0.5) cv.set(x, 1, P.g2); } },
    // vines growing up from the bottom edge
    vineUp(cv, r) { const n = 2 + Math.floor(r() * 3); for (let i = 0; i < n; i++) { const x = 1 + Math.floor(r() * 14), len = 3 + Math.floor(r() * 6); for (let k = 0; k < len; k++) { cv.set(x + (k > 2 && r() < 0.3 ? 1 : 0), 15 - k, k % 3 === 2 ? P.g2 : P.g3); if (k % 3 === 1) cv.set(x + 1, 15 - k, P.g2); } } for (let x = 0; x < 16; x++) if (r() < 0.45) cv.set(x, 15, P.g3); },
    sconce(cv) { cv.glow(8, 7, 9, '#ff9a3c', 70); cv.rect(7, 8, 2, 5, P.c4); cv.rect(5, 12, 6, 1, P.c4); cv.rect(6, 7, 4, 1, P.c3); for (let y = 2; y < 8; y++) { const t = (y - 2) / 6, hw = Math.round(0.4 + t * 2); for (let x = 8 - hw; x < 8 + hw; x++) cv.set(x, y, y < 4 ? P.fire1 : y < 6 ? P.fire2 : P.fire3); } cv.set(8, 1, P.fire1); },
    skullRelief(cv) { cv.ell(8, 8, 3.6, 3.4, P.c1); cv.rect(6, 10, 4, 2, P.c2); cv.rect(5, 7, 2, 2, OL); cv.rect(9, 7, 2, 2, OL); cv.set(8, 10, OL); },
    crackWall(cv, r) { let x = 4 + Math.floor(r() * 8), y = 0; while (y < 16) { cv.set(x, y, '#2f3b36', 230); y++; x += Math.floor(r() * 3) - 1; x = Math.max(1, Math.min(14, x)); } },
    web(cv, flip) { for (let i = 0; i < 1; i++) cv.paste(S_web(flip), 0, 0); },
  };
  const S_web = (flip) => { const cvw = cobweb(flip); return cvw; };
  // arte da ferrovia (ciclo 11): só aloca tiles quando chamada (ver createRail)
  L.rail = () => (L._rail ??= createRail(L));
  // arte de chão de fábrica e da usina (ciclo 19, tools/mapgen/industry.mjs): mesma regra de alocação adiada; só a
  // expansion6 (e etapas depois dela) chama. `industry` volta na Montadora (ciclo 20).
  L.industry = () => (L._industry ??= createIndustry(L));
  L.steel = () => (L._steel ??= createSteel(L));
  return L;
}

// ===================================================================== Ferrovia (ciclo 11, tools/mapgen/expansion4.mjs)
// ALOCAÇÃO ADIADA: nada daqui entra no atlas até `L.rail()` ser chamado, e só a expansion4 (a última etapa do gerador)
// chama. Assim todos os tiles Lemon antigos mantêm o id e os gids do mapa antigo não mudam.
// Trilho, lastro e dormentes são desenhados por pixel a partir de segmentos da via (H, V ou 45°, em coordenadas de
// centro de tile): cada tile vira um Cv e a chave do atlas é o hash do conteúdo, então tiles iguais (a reta comprida)
// saem uma vez só e AMVs, curvas de 45° e cruzamentos saem de graça.
const RP = {
  bal0: '#aaa293', bal1: '#928b7d', bal2: '#787164', bal3: '#5e5850',
  sl0: '#93653f', sl1: '#74492f', sl2: '#523322',
  head: '#e3e6e8', side: '#7d8790', foot: '#454b52',
  bump1: '#d14b34', bump2: '#f2eaf1',
  steel0: '#c3ccd2', steel1: '#93a0aa', steel2: '#66737d', steel3: '#454f57',
  conc0: '#ddd6c6', conc1: '#cdc5b3', conc2: '#b3aa96', conc3: '#7d7668', conc4: '#5d574d',
  yel: '#e6c23e', yel2: '#b8962a',
};
const contentKey = (pfx, cv) => pfx + ':' + createHash('md5').update(cv.d).digest('hex').slice(0, 16);

function createRail(L) {
  const tileCv = (pfx, cv, props) => { for (let k = 3; k < cv.d.length; k += 4) if (cv.d[k]) return L.tile(contentKey(pfx, cv), cv, props); return 0; };
  const R = { RP };

  /** segmentos: { a:[tx,ty], b:[tx,ty], endA?, endB? } (endX = para-choque naquela ponta). Pré-calcula a geometria em pixels. */
  R.prep = (segs) => segs.map((s) => {
    const ax = s.a[0] * 16 + 8, ay = s.a[1] * 16 + 8, bx = s.b[0] * 16 + 8, by = s.b[1] * 16 + 8;
    const len = Math.hypot(bx - ax, by - ay), dx = (bx - ax) / len, dy = (by - ay) / len;
    const kind = dy === 0 ? 'h' : dx === 0 ? 'v' : dx * dy > 0 ? 'd1' : 'd2';
    const minx = Math.min(s.a[0], s.b[0]) - 2, maxx = Math.max(s.a[0], s.b[0]) + 2, miny = Math.min(s.a[1], s.b[1]) - 2, maxy = Math.max(s.a[1], s.b[1]) + 2;
    const ext = kind === 'h' || kind === 'v' ? 5 : 1;
    return { ...s, ax, ay, len, dx, dy, kind, minx, maxx, miny, maxy, e0: s.endA ? 6 : ext, e1: s.endB ? 6 : ext };
  });
  const near = (segs, tx, ty) => segs.filter((s) => tx >= s.minx && tx <= s.maxx && ty >= s.miny && ty <= s.maxy);
  const uv = (s, px, py) => { const rx = px - s.ax, ry = py - s.ay; return [rx * s.dx + ry * s.dy, -rx * s.dy + ry * s.dx]; };
  const inSpan = (s, u, extra = 0) => u >= -s.e0 - extra && u <= s.len + s.e1 + extra;
  // dormentes: H/V a cada 4 px (2 de madeira); diagonais a cada 8 em x±y (perpendiculares à via)
  const phase = (s, px, py) => {
    const x = Math.floor(px), y = Math.floor(py);
    if (s.kind === 'h') return ((x % 4) + 4) % 4 >= 2;
    if (s.kind === 'v') return ((y % 4) + 4) % 4 >= 2;
    const k = s.kind === 'd1' ? x + y : x - y; return ((k % 8) + 8) % 8 < 4;
  };
  function railHead(segs, px, py) {
    for (const s of segs) {
      const [u, v] = uv(s, px, py); if (!inSpan(s, u, -1)) continue;
      const a = Math.abs(v);
      if (s.kind === 'h' || s.kind === 'v' ? Math.abs(a - 3.5) < 0.5 : Math.abs(a - 3.536) < 0.36) return true;
    }
    return false;
  }
  // no AMV os dormentes seguem a reta (dormentes longos), não a diagonal
  function sleeper(segs, px, py) {
    let straight = null, diag = null;
    for (const s of segs) { const [u, v] = uv(s, px, py); if (!inSpan(s, u) || Math.abs(v) > 6.2) continue; if (s.kind === 'h' || s.kind === 'v') straight = straight ?? s; else diag = diag ?? s; }
    const s = straight ?? diag; return !!s && phase(s, px, py);
  }
  function bumper(segs, px, py) {
    for (const s of segs) {
      if (s.kind !== 'h' && s.kind !== 'v') continue;
      const [u, v] = uv(s, px, py);
      if (Math.abs(v) > 6.5) continue;
      const stripe = ((Math.floor(v + 8) >> 1) & 1) ? 1 : 3;
      if (s.endA && u >= -6 && u <= -2) return Math.abs(v) > 5.5 || u < -5 ? 2 : stripe;
      if (s.endB && u >= s.len + 2 && u <= s.len + 6) return Math.abs(v) > 5.5 || u > s.len + 5 ? 2 : stripe;
    }
    return 0;
  }
  /** tile de trilho (camada deco, fundo transparente) em (tx,ty) */
  R.trackCv = (segsAll, tx, ty) => {
    const segs = near(segsAll, tx, ty); const cv = new Cv(); if (!segs.length) return cv;
    for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
      const px = tx * 16 + i + 0.5, py = ty * 16 + j + 0.5;
      const b = bumper(segs, px, py);
      if (b) { cv.set(i, j, b === 2 ? OL : b === 1 ? RP.bump1 : RP.bump2); continue; }
      if (railHead(segs, px, py)) { cv.set(i, j, RP.head); continue; }
      if (railHead(segs, px, py - 1) || railHead(segs, px - 1, py)) { cv.set(i, j, RP.side); continue; }
      if (sleeper(segs, px, py)) { const up = sleeper(segs, px, py - 1), dn = sleeper(segs, px, py + 1); cv.set(i, j, !up ? RP.sl0 : !dn ? RP.sl2 : RP.sl1); continue; }
      if (railHead(segs, px, py - 2) && !railHead(segs, px, py - 1)) { cv.set(i, j, RP.foot, 150); continue; }
      if (sleeper(segs, px, py - 1)) cv.set(i, j, OL, 55);
    }
    return cv;
  };
  R.track = (segsAll, tx, ty) => tileCv('rk', R.trackCv(segsAll, tx, ty));

  // ---- lastro (brita): textura periódica por tile (os tiles repetem e o atlas os guarda uma vez), 4 variantes
  const gravelPx = (i, j, v) => {
    const h = hashf(Math.floor((i + ((j >> 1) & 1)) / 2), j, 400 + v), h2 = hashf(i, j, 470 + v);
    return h2 < 0.06 ? RP.bal3 : h < 0.18 ? RP.bal0 : h < 0.62 ? RP.bal1 : h < 0.9 ? RP.bal2 : RP.bal3;
  };
  /** chão com lastro sob a via: `basePx(i,j)` -> [r,g,b] do chão original (grama, terra...); sem basePx = tudo brita */
  R.ballastCv = (segsAll, tx, ty, basePx, variant) => {
    const segs = near(segsAll, tx, ty); const cv = new Cv();
    const dist = (px, py) => { let best = 99; for (const s of segs) { const [u, v] = uv(s, px, py); if (!inSpan(s, u, s.kind === 'h' || s.kind === 'v' ? 3 : 0)) continue; best = Math.min(best, Math.abs(v)); } return best; };
    for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
      const px = tx * 16 + i + 0.5, py = ty * 16 + j + 0.5;
      const lim = 9.5 + hashf(i, j, 33) * 1.6;
      const w = basePx ? dist(px, py) : 0;
      if (w <= lim) { const c = hexc(gravelPx(i, j, variant)), k = w > 7.5 ? 0.86 : 1; cv.set(i, j, [c[0] * k, c[1] * k, c[2] * k]); }
      else { const c = basePx(i, j), wa = dist(px, py - 1); cv.set(i, j, wa <= lim + 0.5 ? [c[0] * 0.74, c[1] * 0.74, c[2] * 0.74] : c); }
    }
    return cv;
  };
  R.ballast = (segsAll, tx, ty, basePx, variant) => { const cv = R.ballastCv(segsAll, tx, ty, basePx, variant); return L.tile(contentKey('bal', cv), cv); };
  R.gravel = (v) => L.tile('malha_brita' + v, () => { const cv = new Cv(); for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) cv.set(i, j, gravelPx(i, j, v)); return cv; });

  // ---- plataforma de concreto. n/s: 0 = continua, 1 = borda comum, 2 = beira da via (faixa amarela); e/w: 0/1.
  // A borda sul mostra a face da plataforma (vista 3/4); a norte, só o beiral.
  R.platform = (n, e, s, w, v = 0) => L.tile(`malha_plat:${n}${+e}${s}${+w}:${v}`, () => {
    const cv = new Cv();
    for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
      let c = (i % 8 === 7 || j % 8 === 7) ? RP.conc2 : hashf(i, j, 90 + v) < 0.08 ? RP.conc1 : hashf(i >> 1, j >> 1, 95 + v) < 0.2 ? RP.conc1 : RP.conc0;
      if (w && i === 0) c = RP.conc3;
      if (e && i === 15) c = RP.conc3;
      if (s === 2) { if (j === 9 || j === 10) c = (i % 4 === 1) ? RP.yel2 : RP.yel; else if (j === 11 || j === 12) c = '#ece7da'; else if (j === 13) c = RP.conc3; else if (j >= 14) c = RP.conc4; }
      else if (s === 1) { if (j === 12) c = '#ece7da'; else if (j === 13) c = RP.conc3; else if (j >= 14) c = RP.conc4; }
      if (n === 2) { if (j === 0) c = RP.conc3; else if (j <= 2) c = '#ece7da'; else if (j === 4 || j === 5) c = (i % 4 === 1) ? RP.yel2 : RP.yel; }
      else if (n === 1 && j === 0) c = RP.conc3;
      cv.set(i, j, c);
    }
    return cv;
  });
  // ---- ponte ferroviária (via E-O): tabuleiro de madeira escura sobre vigas de aço. part: n (guarda-corpo), m, s (viga)
  R.bridge = (part) => L.tile('malha_ponte_' + part, () => {
    const cv = new Cv();
    for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) cv.set(i, j, j % 4 === 3 ? '#4a3123' : (i + (j >> 2) * 5) % 16 === 0 ? '#523322' : j % 4 === 0 ? '#7b5236' : '#684530');
    if (part === 'n') { cv.rect(0, 0, 16, 1, OL); cv.rect(0, 1, 16, 2, RP.steel1); cv.rect(0, 1, 16, 1, RP.steel0); for (const x of [3, 11]) cv.rect(x, 0, 2, 4, RP.steel2); }
    if (part === 's') { cv.rect(0, 11, 16, 4, RP.steel2); cv.rect(0, 11, 16, 1, RP.steel1); for (const x of [2, 7, 12]) cv.set(x, 13, RP.steel0); cv.rect(0, 15, 16, 1, OL); }
    return cv;
  });
  // ---- pedra do alto da serra: o planalto de neve do TilesetRelief recolorido para grama (bordas de rocha mantidas)
  R.plateau = (gid) => L.overlay(gid, 'serra', 0, (cv) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const [r, g, b, a] = cv.get(x, y); if (!a) continue; const k = (r << 16) | (g << 8) | b; if (k === 0xf2eaf1) cv.set(x, y, '#adbc3a'); else if (k === 0xb8dce5) cv.set(x, y, '#8ea23a'); }
  });

  // ---- peças desenhadas no tamanho real e fatiadas em tiles
  const sheetOf = (key, cv, wt, ht) => L.sheet('malha_' + key, cv, wt, ht);
  const wheel = (cv, x, y) => { cv.ell(x, y, 2.6, 2.6, '#2a2629'); cv.set(x - 1, y - 1, '#6b6670'); cv.set(x, y, '#4a454c'); };
  const bogie = (cv, x0, yb) => { cv.rect(x0, yb - 6, 12, 3, '#3d3a3c'); cv.rect(x0 + 1, yb - 6, 10, 1, '#5d585c'); wheel(cv, x0 + 3, yb - 2); wheel(cv, x0 + 9, yb - 2); cv.rect(x0 + 5, yb - 5, 2, 2, '#c9a832'); };
  /** vagão (3 tiles de comprimento, 2 de altura): corpo na linha de cima, rodas sobre a via na linha de baixo */
  function wagonCv(kind) {
    const cv = new Cv(48, 32), yb = 30;
    bogie(cv, 3, yb); bogie(cv, 33, yb);
    cv.rect(1, yb - 9, 46, 3, '#2e2a2b'); cv.rect(0, yb - 8, 1, 2, '#2e2a2b'); cv.rect(47, yb - 8, 1, 2, '#2e2a2b'); // estrado + engates
    const ribs = (x0, x1, y0, y1, base, rib, top) => { cv.rect(x0, y0, x1 - x0, y1 - y0, base); for (let x = x0 + 3; x < x1 - 1; x += 6) cv.rect(x, y0, 1, y1 - y0, rib); cv.rect(x0, y0, x1 - x0, 1, top); cv.rect(x0, y1 - 1, x1 - x0, 1, rib); };
    if (kind === 'gondola') { // gôndola de minério: caixa enferrujada, minério escuro por cima
      cv.rect(2, 6, 44, 6, '#7e3a24'); cv.rect(3, 7, 42, 4, '#3b2a2a');
      for (let x = 4; x < 44; x++) { const hgt = Math.round(3.4 * Math.sin(((x - 4) / 40) * Math.PI)) + (x % 7 === 0 ? 1 : 0); for (let y = 10 - hgt; y < 11; y++) cv.set(x, y, hashf(x, y, 5) < 0.3 ? '#5a3a34' : hashf(x, y, 6) < 0.15 ? '#7a4a3a' : '#3b2a2a'); }
      ribs(2, 46, 11, yb - 9, '#9c4a2e', '#6e3220', '#c06a43');
    } else if (kind === 'box') { // vagão fechado (carga geral)
      cv.rect(2, 4, 44, 7, '#8a9a96'); cv.rect(2, 4, 44, 1, '#b5c2be'); cv.rect(2, 7, 44, 1, '#6f7e7a');
      ribs(2, 46, 11, yb - 9, '#4f6b6b', '#3b5252', '#6f8c8a');
      cv.rect(18, 12, 12, yb - 21, '#3f5757'); cv.rect(18, 12, 1, yb - 21, '#6f8c8a'); cv.rect(23, 17, 2, 1, '#c9a832');
    } else if (kind === 'tank') { // vagão-tanque
      for (let y = 7; y < yb - 9; y++) { const t = (y - 7) / (yb - 16); const c = t < 0.15 ? '#a3acb1' : t < 0.35 ? '#7c868d' : t < 0.75 ? '#59626a' : '#3a4148'; const inset = y < 9 || y > yb - 12 ? 2 : 0; cv.rect(2 + inset, y, 44 - inset * 2, 1, c); }
      cv.rect(21, 4, 6, 3, '#7c868d'); cv.rect(21, 4, 6, 1, '#a3acb1'); cv.rect(4, 15, 40, 1, RP.yel);
    } else if (kind === 'hopper') { // hopper (grãos/cimento)
      cv.rect(2, 5, 44, 6, '#a7a9a3'); for (let x = 6; x < 44; x += 9) cv.rect(x, 6, 5, 3, '#7c7e78');
      ribs(2, 46, 11, yb - 12, '#8d8f8a', '#6d6f6a', '#b5b7b1');
      for (const x0 of [8, 20, 32]) for (let k = 0; k < 4; k++) cv.rect(x0 + k, yb - 12 + k, 8 - k * 2, 1, '#6d6f6a');
    } else { // plataforma com contêiner
      cv.rect(2, yb - 12, 44, 3, '#7b473c'); cv.rect(2, yb - 12, 44, 1, '#965746');
      cv.rect(5, 3, 38, 7, '#d98a3a'); cv.rect(5, 3, 38, 1, '#f0b060');
      cv.rect(5, 10, 38, yb - 22, '#c46a2a'); for (let x = 7; x < 42; x += 3) cv.rect(x, 10, 1, yb - 22, '#9c4f1e');
    }
    cv.outline();
    return cv;
  }
  function locoCv() { // locomotiva diesel amarelo-limão com faixa verde, cabine à esquerda
    const cv = new Cv(64, 32), yb = 30;
    bogie(cv, 4, yb); bogie(cv, 48, yb); cv.rect(1, yb - 9, 62, 3, '#2e2a2b');
    cv.rect(3, 3, 16, 5, '#7d8486'); cv.rect(3, 3, 16, 1, '#a3a9ab');
    cv.rect(19, 7, 42, 3, '#c9a832'); cv.rect(19, 7, 42, 1, '#e8d14a');
    for (let x = 24; x < 58; x += 8) cv.rect(x, 7, 4, 2, '#5d585c'); cv.rect(40, 4, 3, 3, '#3d3a3c');
    cv.rect(2, 8, 18, yb - 17, '#e8d14a'); cv.rect(19, 10, 43, yb - 19, '#e1c63e');
    cv.rect(4, 10, 6, 5, '#2b3d52'); cv.rect(12, 10, 6, 5, '#2b3d52'); cv.set(5, 11, '#7d9ab8'); cv.set(13, 11, '#7d9ab8');
    cv.rect(2, yb - 13, 60, 3, '#3f7a3a'); cv.rect(2, yb - 13, 60, 1, '#5e9f4f');
    for (let x = 23; x < 59; x += 5) cv.rect(x, 13, 3, 4, '#c9a832');
    cv.rect(0, 16, 2, 2, '#fff6c0'); cv.rect(62, 16, 2, 2, '#fff6c0');
    cv.outline();
    return cv;
  }
  /** pórtico do Portal de Inspeção (5×4 tiles) sobre via N-S no tile do meio: colunas, viga, câmeras e iluminadores */
  function archCv() {
    const cv = new Cv(80, 64);
    for (let k = 0; k < 2; k++) {
      const x0 = k ? 67 : 3;
      cv.rect(x0, 10, 10, 50, RP.steel1); cv.rect(x0, 10, 2, 50, RP.steel0); cv.rect(x0 + 8, 10, 2, 50, RP.steel2);
      for (let y = 16; y < 58; y += 8) { cv.line(x0 + 2, y, x0 + 7, y + 6, RP.steel2); cv.line(x0 + 7, y, x0 + 2, y + 6, RP.steel2); }
      cv.rect(x0 - 2, 58, 14, 5, RP.conc2); cv.rect(x0 - 2, 58, 14, 1, RP.conc0);
    }
    cv.rect(1, 5, 78, 11, RP.steel1); cv.rect(1, 5, 78, 2, RP.steel0); cv.rect(1, 14, 78, 2, RP.steel3);
    for (let x = 4; x < 76; x += 8) { cv.line(x, 7, x + 4, 13, RP.steel2); cv.line(x + 4, 7, x + 8, 13, RP.steel2); }
    // 4 iluminadores (barras de LED) na face interna das colunas, 2 de cada lado
    for (const [x, y] of [[13, 24], [13, 38], [64, 24], [64, 38]]) { cv.rect(x, y, 3, 8, '#4a5158'); cv.rect(x + (x < 40 ? 2 : 0), y + 1, 1, 6, '#fffbe0'); cv.glow(x + 1.5, y + 4, 7, '#e8f4ff', 60); }
    // 4 câmeras penduradas na viga, apontando para a via
    for (const x of [22, 33, 45, 56]) { cv.rect(x, 16, 1, 3, RP.steel3); cv.rect(x - 2, 19, 6, 4, '#25282c'); cv.rect(x - 2, 19, 6, 1, '#4a5158'); cv.set(x, 22, '#5fd0e8'); cv.set(x + 1, 22, '#2a8aa0'); }
    cv.outline();
    return cv;
  }
  function shelterCv() { // abrigo de equipamentos (contêiner) com o CLP: porta, ar-condicionado, placa de alerta
    const cv = new Cv(48, 48);
    cv.rect(1, 6, 46, 8, '#b8bcbd'); cv.rect(1, 6, 46, 1, '#d8dcdc'); cv.rect(1, 13, 46, 1, '#7e8486'); cv.rect(0, 14, 48, 2, '#5d6264');
    cv.rect(2, 16, 44, 29, '#e4e2da'); for (let x = 5; x < 45; x += 4) cv.rect(x, 16, 1, 29, '#c9c6bc');
    cv.rect(17, 23, 13, 22, '#7b8287'); cv.rect(17, 23, 13, 1, '#a3a9ab'); cv.rect(18, 24, 1, 21, '#959ca0'); cv.rect(27, 34, 2, 1, '#2e2a2b');
    cv.rect(34, 20, 10, 9, '#d5d8d6'); cv.rect(34, 20, 10, 1, '#f0f2f0'); for (let y = 22; y < 28; y += 2) cv.rect(35, y, 8, 1, '#8a8f91'); cv.ell(39, 24.5, 2.2, 2.2, '#8a8f91');
    for (let k = 0; k < 5; k++) cv.rect(8 - k, 20 + k, 1 + k * 2, 1, RP.yel); cv.set(8, 21, OL); cv.set(8, 22, OL); cv.set(8, 24, OL);
    cv.rect(2, 45, 44, 3, RP.conc2);
    cv.outline();
    return cv;
  }
  function stationCv() { // prédio da estação (10×5 tiles): telhado de barro, fachada creme, janelas em arco, relógio
    const Wd = 160, cv = new Cv(Wd, 80);
    for (let y = 2; y < 30; y++) { const inset = Math.max(0, 6 - y); for (let x = 2 + inset; x < Wd - 2 - inset; x++) cv.set(x, y, (y % 4 === 1) ? '#9e4a31' : ((x + (y >> 2) * 3) % 6 === 0) ? '#a9553a' : '#c4633f'); }
    cv.rect(8, 2, Wd - 16, 2, '#d98a5e'); cv.rect(2, 29, Wd - 4, 2, '#7a3826');
    cv.rect(64, 0, 32, 12, '#c4633f'); for (let y = 1; y < 12; y += 4) cv.rect(64, y, 32, 1, '#9e4a31'); cv.rect(62, 10, 36, 2, '#7a3826');
    cv.rect(4, 31, Wd - 8, 49, '#efe2c2'); cv.rect(4, 31, Wd - 8, 2, '#c9b48a');
    for (let x = 4; x < Wd - 4; x += 26) cv.rect(x, 33, 4, 39, '#d9c8a2');
    cv.rect(4, 72, Wd - 8, 8, '#b59a72'); cv.rect(4, 72, Wd - 8, 1, '#d2b37d');
    const win = (x) => { cv.rect(x, 44, 12, 18, '#f7f1e3'); cv.rect(x + 2, 46, 8, 14, '#3b5878'); cv.ell(x + 6, 46, 4, 3, '#3b5878'); cv.rect(x + 2, 52, 8, 1, '#f7f1e3'); cv.rect(x + 6, 46, 1, 14, '#f7f1e3'); cv.set(x + 3, 47, '#8fb0cc'); cv.set(x + 3, 48, '#8fb0cc'); cv.rect(x - 1, 62, 14, 2, '#d9c8a2'); };
    for (const x of [14, 38, 108, 132]) win(x);
    cv.rect(68, 46, 24, 34, '#f7f1e3'); cv.ell(80, 47, 11, 6, '#f7f1e3'); cv.rect(71, 48, 18, 32, '#7b473c'); cv.ell(80, 49, 8, 4, '#7b473c'); cv.rect(79, 48, 2, 32, '#5a342b'); cv.set(76, 62, RP.yel); cv.set(83, 62, RP.yel);
    cv.ell(80, 37, 6.5, 6.5, '#7b473c'); cv.ell(80, 37, 5, 5, '#fbf8ee'); cv.line(80, 37, 80, 33, OL); cv.line(80, 37, 83, 37, OL);
    for (const x0 of [50, 98]) { cv.rect(x0, 36, 12, 5, '#2f5a3c'); cv.rect(x0 + 1, 37, 10, 1, '#cfe3c0'); cv.rect(x0 + 1, 39, 7, 1, '#cfe3c0'); }
    cv.outline();
    return cv;
  }
  function benchCv() { const cv = new Cv(32, 16); cv.rect(3, 3, 26, 3, '#9a6a44'); cv.rect(3, 3, 26, 1, '#b98a5c'); cv.rect(2, 8, 28, 3, '#9a6a44'); cv.rect(2, 8, 28, 1, '#b98a5c'); cv.rect(2, 10, 28, 1, '#7b4f33'); for (const x of [4, 26]) cv.rect(x, 6, 2, 9, '#3d3a3c'); cv.outline(); return cv; }
  function clockPostCv() { const cv = new Cv(16, 32); cv.rect(7, 12, 2, 18, '#3d4a44'); cv.rect(7, 12, 1, 18, '#5e7066'); cv.rect(5, 29, 6, 2, '#3d4a44'); cv.ell(8, 7, 6, 6, '#3d4a44'); cv.ell(8, 7, 4.6, 4.6, '#fbf8ee'); cv.line(8, 7, 8, 4, OL); cv.line(8, 7, 10, 8, OL); cv.outline(); return cv; }
  function signalCv(aspect) {
    const cv = new Cv(16, 32), red = aspect === 'red';
    cv.rect(7, 10, 2, 20, '#7d8486'); cv.rect(7, 10, 1, 20, '#a3a9ab'); cv.rect(5, 29, 6, 2, '#5d6264'); cv.rect(4, 1, 8, 12, '#25282c'); cv.rect(4, 1, 8, 1, '#4a5158');
    cv.ell(8, 4.5, 2, 2, red ? '#ff5a3c' : '#5a2a24'); cv.ell(8, 9.5, 2, 2, red ? '#1f4a2a' : '#5cf07a'); cv.glow(8, red ? 4.5 : 9.5, 6, red ? '#ff6a4a' : '#7aff9a', 60);
    cv.outline(); return cv;
  }
  function crossbuckCv() {
    const cv = new Cv(16, 32);
    cv.rect(7, 8, 2, 22, '#f2eaf1'); for (let y = 10; y < 30; y += 4) cv.rect(7, y, 2, 2, '#2e2a2b'); cv.rect(5, 29, 6, 2, '#5d6264');
    for (let t = 0; t <= 12; t++) { cv.rect(1 + t, 1 + Math.round(t * 0.75), 2, 2, '#f2eaf1'); cv.rect(13 - t, 1 + Math.round(t * 0.75), 2, 2, '#f2eaf1'); }
    for (let t = 2; t <= 10; t += 4) { cv.set(1 + t, 2 + Math.round(t * 0.75), RP.bump1); cv.set(13 - t, 2 + Math.round(t * 0.75), RP.bump1); }
    cv.outline(); return cv;
  }
  function kmPostCv() { const cv = new Cv(); cv.rect(6, 4, 4, 10, '#f2eaf1'); cv.rect(9, 4, 1, 10, '#c9c6bc'); cv.rect(6, 7, 4, 2, '#2e2a2b'); cv.rect(5, 13, 6, 2, RP.conc2); cv.outline(); return cv; }
  function wheelsetCv() { const cv = new Cv(); cv.rect(4, 8, 8, 2, '#7d8486'); cv.rect(4, 8, 8, 1, '#a3a9ab'); for (const x of [3, 12]) { cv.ell(x + 0.5, 8.5, 2.2, 5.5, '#3d3a3c'); cv.rect(x, 4, 1, 9, '#6b6670'); } cv.outline(); for (let x = 3; x < 14; x++) cv.over(x, 15, OL, 50); return cv; }
  function bogieCv() { const cv = new Cv(32, 16); cv.rect(3, 5, 26, 5, '#3d3a3c'); cv.rect(3, 5, 26, 1, '#5d585c'); for (const x of [8, 23]) { cv.ell(x, 10, 3.5, 3.5, '#2a2629'); cv.set(x - 1, 9, '#6b6670'); } for (let y = 3; y < 9; y += 2) cv.rect(14, y, 4, 1, '#c9a832'); cv.outline(); return cv; }
  function railStackCv() { const cv = new Cv(32, 16); for (const x of [4, 26]) cv.rect(x, 9, 3, 5, '#74492f'); for (let k = 0; k < 4; k++) { cv.rect(1, 4 + k * 2, 30, 1, RP.head); cv.rect(1, 5 + k * 2, 30, 1, RP.side); } cv.outline(); return cv; }
  function sleeperStackCv() { const cv = new Cv(32, 16); for (let r = 0; r < 3; r++) for (let c = 0; c < 3 - (r === 0 ? 0 : 1); c++) { const x = 2 + c * 9 + (r ? 4 : 0), y = 10 - r * 4; cv.rect(x, y, 8, 4, RP.sl1); cv.rect(x, y, 8, 1, RP.sl0); cv.rect(x + 7, y, 1, 4, RP.sl2); } cv.outline(); return cv; }

  // sensor de roda preso no trilho (via N-S): caixinha amarela e preta colada no trilho oeste, com cabo
  R.wheelSensor = (segsAll, tx, ty) => { const cv = R.trackCv(segsAll, tx, ty); cv.rect(1, 5, 3, 6, RP.yel); cv.rect(1, 7, 3, 1, '#25282c'); cv.rect(1, 9, 3, 1, '#25282c'); cv.set(4, 8, '#25282c'); cv.rect(0, 10, 1, 6, '#25282c'); return tileCv('ws', cv); };
  // cancela da passagem de nível: poste com contrapeso e braço listrado (2 tiles), aberto para um lado
  function gateCv(flip) {
    const cv = new Cv(32, 16), X = (x) => (flip ? 31 - x : x);
    cv.rect(X(3) - (flip ? 2 : 0), 4, 3, 11, '#5d6264'); cv.rect(X(2) - (flip ? 4 : 0), 13, 5, 2, '#3d3a3c');
    for (let x = 5; x < 31; x++) cv.rect(X(x), 6, 1, 2, ((x >> 2) & 1) ? RP.bump1 : RP.bump2);
    cv.rect(X(1) - (flip ? 1 : 0), 5, 2, 4, '#3d3a3c'); cv.set(X(4), 3, '#ff5a3c'); cv.glow(X(4), 3, 4, '#ff6a4a', 50);
    cv.outline(); return cv;
  }
  R.gate = (flip) => sheetOf('cancela' + (flip ? 'R' : 'L'), gateCv(flip), 2, 1);
  R.wagonCv = wagonCv; R.locoCv = locoCv; R.archCv = archCv;
  R.shelter = () => sheetOf('shelter', shelterCv(), 3, 3);
  R.station = () => sheetOf('station', stationCv(), 10, 5);
  R.bench = () => sheetOf('bench', benchCv(), 2, 1);
  R.clockPost = () => sheetOf('clockpost', clockPostCv(), 1, 2);
  R.signal = (aspect) => sheetOf('signal_' + aspect, signalCv(aspect), 1, 2);
  R.crossbuck = () => sheetOf('crossbuck', crossbuckCv(), 1, 2);
  R.kmPost = () => L.tile('malha_km', kmPostCv);
  R.wheelset = () => L.tile('malha_rodeiro', wheelsetCv);
  R.bogie = () => sheetOf('truque', bogieCv(), 2, 1);
  R.railStack = () => sheetOf('railstack', railStackCv(), 2, 1);
  R.sleeperStack = () => sheetOf('sleeperstack', sleeperStackCv(), 2, 1);
  /** sprite sobre a via (vagão, locomotiva, pórtico): a última linha é composta por cima do tile de trilho (mesma camada
   *  deco); as de cima vão para `above`. Devolve [[decoGid, aboveGid], ...] por linha, da de cima para a de baixo. */
  R.overTrack = (cv, wt, ht, segsAll, tx, ty) => {
    const rows = [];
    for (let j = 0; j < ht; j++) {
      const row = [];
      for (let i = 0; i < wt; i++) {
        const base = R.trackCv(segsAll, tx + i, ty + j - (ht - 1)), sl = cv.slice(i, j);
        if (j < ht - 1) row.push([tileCv('rk', base), tileCv('vh', sl)]);
        else { base.paste(sl, 0, 0); row.push([tileCv('vh', base), 0]); }
      }
      rows.push(row);
    }
    return rows;
  };
  return R;
}

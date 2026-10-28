// Gera os overlays de addon (assets/addons/*.png) a partir do catálogo shared/src/data/outfits.ts.
// Determinístico (sem aleatoriedade): mesma entrada → mesmos bytes.
//
//   node tools/addons/generate.mjs            gera sheets + manifest + preview
//
// Cada addon é desenhado frame a frame com ÂNCORAS calculadas da sheet base da roupa
// (topo da cabeça, centro, extensões da cabeça/corpo, pescoço), então o chapéu acompanha o
// balanço da caminhada e capas seguem o corpo nos 4 lados. Saída por addon:
//   <id>.png       camada da FRENTE (desenhada por cima da base)
//   <id>_back.png  camada de TRÁS (desenhada atrás da base) — só se o addon tiver algo atrás
//   <id>_f.png / <id>_f_back.png  o mesmo addon redesenhado sobre a sheet FEMININA da roupa, quando sai diferente
// Layout = o das sheets do pack (4 colunas = baixo/cima/esquerda/direita, 7 linhas), com frames 32x32
// e o frame 16x16 da base posicionado em (OX, OY).
// Também gera as bases próprias (base_mago.png e as femininas base_<id>_f.png, com retratos) e preview_sexo.png
// (os dois sexos lado a lado).
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(join(root, "package.json"));
const { PNG } = require("pngjs");
const { OUTFIT_LIST, ADDON_FRAME: FW, ADDON_OFFSET_X: OX, ADDON_OFFSET_Y: OY } =
  await import(pathToFileURL(join(root, "packages/shared/src/data/outfits.ts")).href);
import { computeAnchors, readSheet } from "./anchors.mjs";

const FH = FW;
const COLS = 4, ROWS = 7;
const FACINGS = ["down", "up", "left", "right"];
const OUT_DIR = join(root, "assets", "addons");

// ---------------------------------------------------------------- paleta (do próprio pack + poucos tons novos)
const OUTLINE = [0x14, 0x1b, 0x1b];
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
/** material → [claro, médio, escuro] (ou 1 cor = plano). outline:false = sem contorno. */
const MATS = {
  gold: { c: ["#f1c471", "#d78b4a", "#965340"] },
  brightgold: { c: ["#fce2ca", "#f1c471", "#d78b4a"] },
  red: { c: ["#e0394c", "#d14b34", "#8f3e56"] },
  wine: { c: ["#d14b34", "#8f3e56", "#5a2a3e"] },
  steel: { c: ["#e3f1f5", "#9ba7aa", "#5f7160"] },
  iron: { c: ["#8d977f", "#5f7160", "#4e484a"] },
  wood: { c: ["#d78b4a", "#965340", "#5c3a33"] },
  leather: { c: ["#c8966b", "#965340", "#5c3a33"] },
  felt: { c: ["#965340", "#6e4236", "#4a2c2b"] },
  green: { c: ["#a8a129", "#56864c", "#3d5c3e"] },
  leaf: { c: ["#c7cf4f", "#8fb04a", "#56864c"] },
  white: { c: ["#f2eaf1", "#d6d8dc", "#9ba7aa"] },
  bone: { c: ["#f2eaf1", "#fce2ca", "#c8966b"] },
  cloth: { c: ["#4e484a", "#3b3643", "#262330"] },
  indigo: { c: ["#6b7aa6", "#4a5270", "#353a57"] },
  purple: { c: ["#8a6fb0", "#634c86", "#43345e"] },
  blue: { c: ["#79b8ce", "#548789", "#4a5270"] },
  beige: { c: ["#fce2ca", "#e2c29a", "#c8966b"] },
  parrot: { c: ["#e0394c", "#d14b34", "#8f3e56"] },
  // planos / brilhos
  star: { c: ["#fff6c8"] },
  orbcore: { c: ["#ffffff"], outline: false },
  orbcyan: { c: ["#bff3ff", "#79b8ce", "#548789"] },
  orbviolet: { c: ["#e7c8ff", "#b07ee0", "#6f4aa0"] },
  orbgreen: { c: ["#e6ffb0", "#a8d84a", "#56864c"] },
  ruby: { c: ["#ff8a9a", "#e0394c", "#8f3e56"] },
  emerald: { c: ["#b6f0b0", "#56b04c", "#2f6a3a"] },
  sparkle: { c: ["#fff6c8"], outline: false },
  sparkleV: { c: ["#e7c8ff"], outline: false },
  // Fada: asas translúcidas cor-de-rosa, laço e brilhinho branco
  wing: { c: ["#fff2fb", "#ffc4e8", "#e489c4"] },
  wingvein: { c: ["#ffd9f0"], outline: false },
  ribbon: { c: ["#ff8fcf", "#e0589e", "#a93a76"] },
  sparkleW: { c: ["#ffffff"], outline: false },
  sparkleP: { c: ["#ffb3e2"], outline: false },
  beak: { c: ["#f1c471"] },
  eye: { c: ["#141b1b"], outline: false },
  out: { c: ["#141b1b"], outline: false },
};
const MAT_NAMES = Object.keys(MATS);
const MAT_ID = Object.fromEntries(MAT_NAMES.map((n, i) => [n, i + 1]));
const MAT_RGB = MAT_NAMES.map((n) => MATS[n].c.map(hex));

// ---------------------------------------------------------------- canvas de um frame (2 camadas)
class Layer {
  constructor() { this.mat = new Uint8Array(FW * FH); this.shade = new Uint8Array(FW * FH); }
  /** (x,y) em coordenadas do frame BASE (0..15); pode sair do 16x16 (folga do overlay). */
  set(x, y, mat, shade = 0) {
    const X = Math.round(x) + OX, Y = Math.round(y) + OY;
    if (X < 0 || Y < 0 || X >= FW || Y >= FH) return;
    this.mat[Y * FW + X] = MAT_ID[mat]; this.shade[Y * FW + X] = shade;
  }
  get(x, y) { const X = x + OX, Y = y + OY; return X < 0 || Y < 0 || X >= FW || Y >= FH ? 0 : this.mat[Y * FW + X]; }
  clear(x, y) { const X = x + OX, Y = y + OY; if (X >= 0 && Y >= 0 && X < FW && Y < FH) this.mat[Y * FW + X] = 0; }
  h(y, x0, x1, mat, shade = 0) { for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.set(x, y, mat, shade); }
  v(x, y0, y1, mat, shade = 0) { for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) this.set(x, y, mat, shade); }
  line(x0, y0, x1, y1, mat, shade = 0) {
    let dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx + dy;
    for (;;) { this.set(x0, y0, mat, shade); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
  }
  /** Desenha um "stamp" ASCII: cada char → material (map), '.' = vazio. (x,y) = canto superior esquerdo. flip = espelha. */
  stamp(x, y, rows, map, flip = false) {
    const w = Math.max(...rows.map((r) => r.length));
    rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) { const ch = r[i]; if (ch === "." || ch === " ") continue; const m = map[ch]; if (!m) continue; const [mat, sh] = Array.isArray(m) ? m : [m, 0]; this.set(flip ? x + (w - 1 - i) : x + i, y + j, mat, sh); } });
  }
  any() { return this.mat.some((v) => v !== 0); }
}

/** Renderiza uma camada: sombreamento automático (luz de cima-esquerda) + contorno escuro de 1 px. */
function renderLayer(L) {
  const rgba = new Uint8Array(FW * FH * 4);
  const filled = (x, y) => x >= 0 && y >= 0 && x < FW && y < FH && L.mat[y * FW + x] !== 0;
  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
    const m = L.mat[y * FW + x]; if (!m) continue;
    const cols = MAT_RGB[m - 1];
    let s = L.shade[y * FW + x];
    if (!s) {
      const lit = !filled(x, y - 1) || !filled(x - 1, y);
      const dark = !filled(x, y + 1) || !filled(x + 1, y);
      s = lit && !dark ? 1 : dark && !lit ? 3 : 2;
    }
    const c = cols[Math.min(cols.length, s) - 1] ?? cols[0];
    const i = (y * FW + x) * 4; rgba[i] = c[0]; rgba[i + 1] = c[1]; rgba[i + 2] = c[2]; rgba[i + 3] = 255;
  }
  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
    if (L.mat[y * FW + x]) continue;
    let o = false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const X = x + dx, Y = y + dy;
      if (!filled(X, Y)) continue;
      const m = L.mat[Y * FW + X];
      if (MATS[MAT_NAMES[m - 1]].outline !== false) { o = true; break; }
    }
    if (o) { const i = (y * FW + x) * 4; rgba[i] = OUTLINE[0]; rgba[i + 1] = OUTLINE[1]; rgba[i + 2] = OUTLINE[2]; rgba[i + 3] = 255; }
  }
  return rgba;
}

// ---------------------------------------------------------------- utilidades de forma
/** Faixa centrada num centro "dobrado" c2 (= minx+maxx) com largura w. */
const spanC = (c2, w) => { const l = Math.round((c2 + 1 - w) / 2); return [l, l + w - 1]; };
const front = (a) => (a.facing === "left" ? -1 : 1);   // sentido "para frente" nas vistas de lado
const side = (a) => a.facing === "left" || a.facing === "right";

/** Cobre a cabeça da base nas linhas [y0..y1] com o material (garante que nada da base "vaze" por cima do chapéu). */
function coverHead(L, a, y0, y1, mat, pad = 0) {
  for (let y = y0; y <= y1; y++) { const e = a.ext[y]; if (e) L.h(y, e[0] - pad, e[1] + pad, mat); }
}

/** Pena: sobe a partir de (x, y) curvando para o lado d (±1); 2 px de largura, ponta `tip`. */
function feather(L, x, y, d, len, mat, tip, fluffy = false) {
  for (let i = 0; i < len; i++) {
    const off = Math.round((i * i) / (len * 1.4)) * d;
    const w = i === len - 1 ? 1 : fluffy && i > 0 && i < len - 2 ? 3 : 2;
    const m = i >= len - 2 ? tip : mat;
    const x0 = x + off;
    for (let k = 0; k < w; k++) {
      const kk = w > 2 ? k - 1 : k;
      // nervura central mais escura nas penas largas
      L.set(d > 0 ? x0 + kk : x0 - kk, y - i, m, w > 2 ? (kk === 0 ? 3 : kk < 0 ? 1 : 2) : 0);
    }
  }
  L.set(x + Math.round(((len - 1) * (len - 1)) / (len * 1.4)) * d + d, y - len + 1, tip); // ponta caída
}

/** Haste vertical segurada ao lado do corpo. Devolve {x, top} da ponta. */
function heldPole(L, a, len, mat = "wood") {
  let x;
  if (a.facing === "down") x = a.maxR + 1;
  else if (a.facing === "up") x = a.maxL - 1;
  else x = a.facing === "left" ? a.headL - 1 : a.headR + 1;
  const y1 = a.bottom - 1, y0 = y1 - len + 1;
  L.v(x, y0, y1, mat);
  return { x, top: y0, out: a.facing === "down" ? 1 : a.facing === "up" ? -1 : front(a) };
}

// ---------------------------------------------------------------- desenhos dos addons
// Assinatura: (F, B, a) → F = camada da frente, B = camada de trás, a = âncoras do frame.
const DRAW = {
  // ---------- Mago
  mago_chapeu(F, B, a) {
    const t = a.top, brim = t + 3;
    const hw = a.headR - a.headL + 1;
    // cone: de (hw-2) na linha t+1 até a ponta (2 px) em t-7, ponta dobrada
    const rows = [];
    for (let y = brim - 1; y >= t - 7; y--) {
      const k = (brim - 1 - y) / (brim - 1 - (t - 7));
      let w = Math.max(2, Math.round((hw - 2) * (1 - k) + 2 * k));
      rows.push([y, w, k]);
    }
    const bendDir = a.facing === "down" ? 1 : a.facing === "up" ? -1 : -front(a);
    const shiftC = side(a) ? -front(a) : 0; // nas vistas de lado o cone fica um pouco para trás
    for (const [y, w, k] of rows) {
      const bend = k > 0.62 ? Math.round((k - 0.62) * 8) * bendDir : 0;
      const [l, r] = spanC(a.c2 + 2 * shiftC + 2 * bend, w);
      F.h(y, l, r, "indigo");
    }
    coverHead(F, a, t, brim - 1, "indigo");
    // faixa dourada
    const eb = a.ext[brim - 1] ?? [a.headL, a.headR];
    F.h(brim - 1, eb[0], eb[1], "gold");
    // aba larga
    if (side(a)) {
      const f = front(a);
      const l = f < 0 ? a.headL - 3 : a.headL - 1, r = f < 0 ? a.headR + 1 : a.headR + 3;
      F.h(brim, l, r, "indigo");
    } else F.h(brim, a.headL - 2, a.headR + 2, "indigo");
    // estrela
    if (a.facing !== "up") {
      const cx = side(a) ? (a.c2 >> 1) + front(a) * 1 : (a.c2 >> 1);
      const sy = t - 1;
      F.set(cx, sy, "star", 1); F.set(cx, sy - 1, "star", 1); F.set(cx - 1, sy, "star", 1); F.set(cx + 1, sy, "star", 1); F.set(cx, sy + 1, "star", 1);
    }
  },
  mago_cajado(F, B, a) {
    const p = heldPole(F, a, 11, "wood");
    F.set(p.x, a.bottom - 6, "gold"); // anel
    // orbe 2x3 brilhante no topo, com "garras"
    const ox = p.x, oy = p.top - 3;
    F.set(ox - 1, oy + 2, "gold"); F.set(ox + 1, oy + 2, "gold");
    F.h(oy, ox - 1, ox + 1, "orbcyan"); F.h(oy + 1, ox - 1, ox + 1, "orbcyan"); F.set(ox, oy - 1, "orbcyan");
    F.set(ox - 1, oy, "orbcore", 1);
    F.set(ox, oy + 2, "gold");
    // brilho que pisca com a caminhada
    if (a.row % 2 === 0) F.set(ox + 2 * p.out, oy - 2, "sparkle", 1);
  },

  // ---------- Cidadão
  cidadao_chapeu(F, B, a) {
    const t = a.top, brim = t + 3;
    coverHead(F, a, t - 1, brim - 1, "felt");
    const e = a.ext[t] ?? [a.headL + 2, a.headR - 2];
    F.h(t - 1, e[0] + 1, e[1] - 1, "felt");
    const eb = a.ext[brim - 1] ?? [a.headL, a.headR];
    F.h(brim - 1, eb[0], eb[1], "red");
    if (side(a)) { const f = front(a); F.h(brim, f < 0 ? a.headL - 2 : a.headL, f < 0 ? a.headR : a.headR + 2, "felt"); }
    else F.h(brim, a.headL - 1, a.headR + 1, "felt");
    // pena (sai da faixa, sobe para trás)
    const d = a.facing === "down" ? 1 : a.facing === "up" ? -1 : -front(a);
    const bx = d > 0 ? eb[1] - 2 : eb[0] + 2;
    feather(F, bx, brim - 1, d, 5, "white", "red", true);
  },
  cidadao_mochila(F, B, a) {
    const n = a.neck, b = a.bottom;
    if (a.facing === "up") {
      const [l, r] = spanC(a.c2, 8);
      for (let y = n - 1; y <= b - 2; y++) F.h(y, l, r, "leather");
      F.h(n - 1, l, r, "felt"); F.h(n, l + 1, r - 1, "felt"); F.set((a.c2 >> 1), n + 1, "gold");
      F.h(n - 2, l - 1, r + 1, "beige"); F.h(n - 3, l, r, "beige");     // saco de dormir
    } else if (a.facing === "down") {
      const [l, r] = spanC(a.c2, 12);
      B.h(n - 2, l - 1, r + 1, "beige"); B.h(n - 3, l, r, "beige");    // pontas do saco de dormir atrás
      F.v(a.bodyL + 2, n + 1, b - 2, "leather"); F.v(a.bodyR - 2, n + 1, b - 2, "leather"); // alças
    } else {
      const f = front(a), back = f < 0 ? a.bodyR : a.bodyL;
      const x0 = back + f * 1, x1 = back - f * 2;
      for (let y = n; y <= b - 1; y++) F.h(y, x0, x1, "leather");
      F.h(n, x0, x1, "felt"); F.set(x1, n + 1, "gold");
      F.h(n - 1, x0, x1 - f, "beige");
      F.v(back + f * 3, n + 1, b - 2, "leather"); // alça
    }
  },

  // ---------- Caçador
  cacador_chapeu(F, B, a) {
    const t = a.top, brim = t + 3;
    coverHead(F, a, t - 1, brim, "green");
    const e = a.ext[t] ?? [a.headL + 2, a.headR - 2];
    // copa pontuda estilo "Robin Hood", ponta para trás
    const d = a.facing === "down" ? -1 : a.facing === "up" ? 1 : -front(a);
    F.h(t - 1, e[0], e[1], "green");
    const pk = d > 0 ? e[1] : e[0];
    F.h(t - 2, Math.min(pk, pk - d * 3), Math.max(pk, pk - d * 3), "green");
    F.h(t - 3, Math.min(pk, pk - d * 1), Math.max(pk, pk - d * 1), "green");
    if (side(a)) { const f = front(a); F.h(brim, f < 0 ? a.headL - 2 : a.headL, f < 0 ? a.headR : a.headR + 2, "green"); }
    else F.h(brim, a.headL - 1, a.headR + 1, "green");
    const eb = a.ext[brim] ? [a.ext[brim][0], a.ext[brim][1]] : [a.headL, a.headR];
    // pena vermelha longa
    const fx = d > 0 ? eb[1] - 3 : eb[0] + 3;
    feather(F, fx, brim - 1, d, 6, "red", "white");
  },
  cacador_aljava(F, B, a) {
    const n = a.neck, b = a.bottom;
    if (a.facing === "up") {
      // aljava em diagonal nas costas: de baixo-direita até cima-esquerda; flechas saem pelo ombro
      F.line(a.bodyR - 2, b - 1, a.headL + 2, n - 4, "leather");
      F.line(a.bodyR - 1, b - 1, a.headL + 3, n - 4, "leather");
      F.set(a.headL + 1, n - 5, "wood"); F.set(a.headL + 2, n - 6, "wood");
      F.set(a.headL, n - 6, "white"); F.set(a.headL + 1, n - 7, "red"); F.set(a.headL + 2, n - 8, "white"); F.set(a.headL + 3, n - 7, "red");
    } else if (a.facing === "down") {
      // penas das flechas aparecem por trás do ombro direito; alça cruzando o peito
      B.set(a.headR + 1, n - 6, "white"); B.set(a.headR + 2, n - 7, "red"); B.set(a.headR, n - 7, "red"); B.set(a.headR + 1, n - 8, "white");
      B.line(a.headR - 1, n - 3, a.headR + 1, n - 5, "leather");
      F.line(a.bodyL + 1, n + 1, a.bodyR - 1, b - 2, "leather", 3);
    } else {
      const f = front(a), back = f < 0 ? a.headR : a.headL;
      F.line(back - f * 1, b - 1, back + f * 1, n - 4, "leather");
      F.line(back - f * 0, b - 1, back + f * 2, n - 4, "leather");
      F.set(back + f * 1, n - 5, "wood");
      F.set(back + f * 1, n - 6, "white"); F.set(back + f * 2, n - 7, "red"); F.set(back, n - 7, "red"); F.set(back + f * 1, n - 8, "white");
    }
  },

  // ---------- Cavaleiro
  cavaleiro_pluma(F, B, a) {
    const t = a.top;
    if (side(a)) {
      const f = front(a), c = a.c2 >> 1;
      // crina: sobe no topo e cai para trás
      F.h(t - 1, c - f, c + f, "red"); F.h(t - 2, c, c - f * 2, "red"); F.h(t - 3, c - f, c - f * 3, "red");
      F.set(c - f * 4, t - 2, "red"); F.set(c - f * 5, t - 1, "red"); F.set(c - f * 5, t, "red"); F.set(c - f * 6, t + 1 + (a.row % 2), "red");
      F.set(c - f * 4, t - 1, "red"); F.set(c - f * 5, t - 2 + 1, "red");
    } else {
      const [l, r] = spanC(a.c2, 2);
      for (let y = t - 4; y <= t; y++) F.h(y, l, r, "red");
      F.h(t - 5, l, r, "red");
      F.set(l - 1, t - 4, "red"); F.set(r + 1, t - 4, "red"); F.set(l - 1, t - 3, "red"); F.set(r + 1, t - 3, "red");
      F.h(t + 1, l, r, "gold");
    }
  },
  cavaleiro_escudo(F, B, a) {
    const n = a.neck, b = a.bottom;
    const M = { s: "steel", R: "red", g: "gold", G: ["gold", 1] };
    if (a.facing === "up") {
      const rows = [
        ".sssssss.",
        "sRRRgRRRs",
        "sRRRgRRRs",
        "sggggGggs",
        "sRRRgRRRs",
        ".sRRgRRs.",
        "..sRgRs..",
        "...sss...",
      ];
      const [l] = spanC(a.c2, 9);
      F.stamp(l, b - rows.length, rows, M);
    } else if (a.facing === "down") {
      F.line(a.bodyL + 2, n + 1, a.bodyR - 2, b - 2, "leather", 3); // alça cruzando o peito
      B.h(n - 1, a.maxR, a.maxR + 1, "steel"); B.set(a.maxR + 1, n, "red"); B.set(a.maxR + 1, n + 1, "steel"); // borda do escudo atrás do ombro
    } else {
      const f = front(a), back = f < 0 ? a.bodyR : a.bodyL;
      const rows = ["s.", "Rs", "Rs", "gs", "Rs", "Rs", "s."];
      // borda do escudo de perfil, saindo das costas
      F.stamp(f < 0 ? back + 1 : back - 2, b - rows.length, rows, M, f > 0);
    }
  },

  // ---------- Nobre
  nobre_capa(F, B, a) { cape(F, B, a, { mat: "red", trim: "gold", collar: "white" }); },
  nobre_pena(F, B, a) {
    const t = a.top, d = a.facing === "down" ? 1 : a.facing === "up" ? -1 : -front(a);
    const e = a.ext[t + 3] ?? [a.headL, a.headR];
    const bx = d > 0 ? e[1] - 3 : e[0] + 3, y = t + 3;
    // pluma macia: sobe, faz arco para trás (d) e cai; vermelha com brilho claro, ponta branca, afinando
    const M = { L: ["ruby", 1], R: ["ruby", 2], D: ["ruby", 3], W: ["white", 1] };
    const plume = ["..LLRL...", ".LRRRRRL.", "LRRRRDRRL", "RRDDDDDRD", "RDDRRRDRW", ".D...RDRW", "......DW.", "RD......."];
    F.stamp(d > 0 ? bx : bx - 8, y - plume.length + 2, plume, M, d < 0);
  },

  // ---------- Invocador
  invocador_diadema(F, B, a) {
    const y = a.top + 2;
    const e = a.ext[y] ?? [a.headL, a.headR];
    F.h(y, e[0] + 1, e[1] - 1, "gold");
    if (!side(a)) {
      const c2 = a.c2; const [l, r] = spanC(c2, 2);
      F.h(y - 1, l, r, "gold"); F.h(y - 2, l, r, "gold"); F.set(l, y - 3, "gold"); F.set(r, y - 3, "gold");
      F.set(e[0] + 2, y - 1, "gold"); F.set(e[1] - 2, y - 1, "gold");
      if (a.facing === "down") { F.set(l, y - 1, "orbviolet", 1); F.set(r, y - 1, "orbviolet", 2); F.set(l, y - 2, "orbviolet", 1); F.set(r, y - 2, "orbviolet", 3); }
    } else {
      const f = front(a), fx = f < 0 ? e[0] + 2 : e[1] - 2;
      F.v(fx, y - 3, y - 1, "gold"); F.v(fx - f, y - 2, y - 1, "gold"); F.set(fx, y - 1, "orbviolet", 1); F.set(fx, y - 2, "orbviolet", 2);
      F.set(fx - f * 4, y - 1, "gold");
    }
  },
  invocador_orbe(F, B, a) {
    const bob = [0, -1, 0, 1][a.row % 4];
    let x;
    if (a.facing === "down") x = a.maxR + 2; else if (a.facing === "up") x = a.maxL - 4; else x = front(a) < 0 ? a.headR + 2 : a.headL - 4;
    const y = a.top + 4 + bob;
    const L = a.facing === "up" || side(a) ? F : F;
    L.h(y, x, x + 2, "orbviolet"); L.h(y + 1, x, x + 2, "orbviolet"); L.h(y - 1, x + 1, x + 1, "orbviolet"); L.set(x + 1, y + 2, "orbviolet");
    L.set(x, y, "orbcore", 1);
    L.set(x - 1, y + 4 - bob, "sparkleV", 1); L.set(x + 3, y + 5 + bob, "sparkleV", 1);
  },

  // ---------- Guerreiro
  guerreiro_asas(F, B, a) {
    const t = a.top;
    // Asa em leque: 3 penas (de baixo para cima, a de cima sobrepõe), cada uma = 3 linhas
    // (claro / médio / escuro) para ler como pena e não como chifre.
    const fan = (L, rx, ry, d, tips) => {
      for (const [dx, dy] of tips) {
        L.line(rx, ry + 2, rx + d * dx, ry + dy + 2, "white", 3);
        L.line(rx, ry + 1, rx + d * dx, ry + dy + 1, "white", 2);
        L.line(rx, ry, rx + d * dx, ry + dy, "white", 1);
      }
    };
    if (side(a)) {
      const d = -front(a), c = a.c2 >> 1;
      // asa varrida para trás: pena baixa mais curta, pena alta mais longa e mais erguida
      fan(F, c - d * 0, t + 1, d, [[6, 1], [7, -2], [6, -5]]);
      fan(B, c - d * 0, t, d, [[4, -4], [5, -6]]);
    } else {
      fan(F, a.headR - 1, t + 2, 1, [[5, 1], [5, -2], [4, -5]]);
      fan(F, a.headL + 1, t + 2, -1, [[5, 1], [5, -2], [4, -5]]);
    }
  },
  guerreiro_machado(F, B, a) {
    const p = heldPole(F, a, 10, "wood");
    const o = p.out, y = p.top;
    // lâmina dupla de aço
    F.v(p.x + o, y, y + 3, "steel"); F.v(p.x + o * 2, y - 1, y + 4, "steel"); F.v(p.x + o * 3, y - 1, y + 4, "steel");
    F.v(p.x - o, y + 1, y + 2, "steel"); F.set(p.x, y - 1, "steel");
  },

  // ---------- Bárbaro
  barbaro_elmo(F, B, a) {
    const t = a.top, rim = t + 3;
    coverHead(F, a, t, rim - 1, "iron");
    const er = a.ext[rim] ?? [a.headL, a.headR];
    F.h(rim, er[0], er[1], "leather");
    F.set(a.c2 >> 1, t - 1, "iron");
    for (let x = er[0] + 1; x < er[1]; x += 3) F.set(x, rim, "gold", 2);
    const horn = (L, x, d) => { // d = para fora
      L.set(x + d, rim - 1, "bone"); L.set(x + d * 2, rim - 1, "bone"); L.set(x + d * 2, rim - 2, "bone"); L.set(x + d * 3, rim - 2, "bone");
      L.set(x + d * 3, rim - 3, "bone"); L.set(x + d * 3, rim - 4, "bone", 1); L.set(x + d * 2, rim - 5, "bone", 1);
    };
    if (side(a)) {
      const f = front(a);
      horn(F, f < 0 ? er[0] + 3 : er[1] - 3, f);
      horn(B, f < 0 ? er[1] - 1 : er[0] + 1, -f);
    } else { horn(F, er[0], -1); horn(F, er[1], 1); }
  },
  barbaro_clava(F, B, a) {
    const p = heldPole(F, a, 8, "wood");
    const y = p.top;
    for (let i = 0; i < 4; i++) F.h(y - i, p.x - 1, p.x + 1, "wood");
    F.h(y - 4, p.x - 1, p.x + 1, "wood"); F.set(p.x, y - 5, "wood");
    F.set(p.x - 2, y - 1, "steel", 1); F.set(p.x + 2, y - 2, "steel", 1); F.set(p.x - 2, y - 3, "steel", 1); F.set(p.x + 2, y - 4, "steel", 1); F.set(p.x, y - 6, "steel", 1);
  },

  // ---------- Druida
  druida_coroa(F, B, a) {
    const y = a.top + 2;
    const e = a.ext[y] ?? [a.headL, a.headR];
    F.h(y, e[0], e[1], "green");
    for (let x = e[0], i = 0; x <= e[1]; x++, i++) {
      if (i % 3 === 0) { F.set(x, y - 1, "leaf", 1); F.set(x + 1, y - 1, "leaf", 2); F.set(x, y, "leaf", 1); }
    }
    const flower = (x) => { F.set(x, y - 1, "white", 1); F.set(x, y, "ruby", 1); };
    if (!side(a)) { flower((a.c2 >> 1) - 3); flower((a.c2 >> 1) + 4); }
    else flower(front(a) < 0 ? e[0] + 2 : e[1] - 2);
  },
  druida_cajado(F, B, a) {
    const p = heldPole(F, a, 11, "wood");
    const o = p.out, y = p.top;
    // ponta curvada (gancho) com folhas e uma gema verde
    F.set(p.x + o, y - 1, "wood"); F.set(p.x + o, y - 2, "wood"); F.set(p.x, y - 3, "wood"); F.set(p.x - o, y - 2, "wood");
    F.set(p.x, y - 1, "orbgreen", 1);
    F.set(p.x - o, y + 1, "leaf"); F.set(p.x - o * 2, y + 2, "leaf", 1); F.set(p.x + o * 2, y, "leaf", 1);
    F.set(p.x - o, y + 4, "leaf", 1);
  },

  // ---------- Bruxo
  bruxo_manto(F, B, a) { cape(F, B, a, { mat: "purple", trim: "wine", collar: "spikes" }); },
  bruxo_cajado(F, B, a) {
    const p = heldPole(F, a, 10, "cloth");
    const y = p.top;
    const M = { b: "bone", E: "eye" };
    const skull = a.facing === "up" ? [".bbb.", "bbbbb", "bbbbb", ".bbb."] : [".bbb.", "bbbbb", "bEbEb", ".bbb."];
    F.stamp(p.x - 2, y - 4, skull, M);
    F.set(p.x - 1, y, "bone"); F.set(p.x + 1, y, "bone");
    if (a.row % 2 === 1) F.set(p.x + 3 * p.out, y - 5, "orbgreen", 1);
    else F.set(p.x + 2 * p.out, y - 6, "orbgreen", 1);
  },

  // ---------- Oriental
  oriental_joia(F, B, a) {
    const t = a.top;
    const d = a.facing === "down" ? 1 : a.facing === "up" ? -1 : -front(a);
    let gx;
    if (side(a)) { const e = a.ext[t + 3] ?? [a.headL, a.headR]; gx = front(a) < 0 ? e[0] + 1 : e[1] - 1; }
    else gx = a.c2 >> 1;
    const gy = t + 3;
    if (a.facing !== "up") { F.set(gx, gy, "ruby", 1); F.set(gx + 1, gy, "ruby", 3); F.set(gx, gy + 1, "ruby", 3); F.set(gx + 1, gy + 1, "ruby", 3); F.set(gx, gy - 1, "gold"); F.set(gx + 1, gy - 1, "gold"); }
    // pluma
    F.v(gx + (d > 0 ? 1 : 0), t - 1, gy - 2, "white");
    F.v(gx + (d > 0 ? 1 : 0) + d, t - 1, gy - 3, "white", 2); // 2 px de largura: lê como pluma, não antena
    F.set(gx + (d > 0 ? 1 : 0) + d, t - 2, "white"); F.set(gx + (d > 0 ? 1 : 0) + d * 2, t - 3, "red"); F.set(gx + (d > 0 ? 1 : 0) + d, t - 3, "white");
  },
  oriental_cimitarra(F, B, a) {
    let x, o;
    if (a.facing === "down") { x = a.maxR + 1; o = 1; } else if (a.facing === "up") { x = a.maxL - 1; o = -1; } else { o = front(a); x = o < 0 ? a.headL - 1 : a.headR + 1; }
    const hy = a.bottom - 2;
    F.v(x, hy - 1, hy + 1, "wood"); F.h(hy - 2, x - 1, x + 1, "gold");
    // lâmina curva para fora
    F.v(x, hy - 6, hy - 3, "steel"); F.v(x + o, hy - 8, hy - 4, "steel"); F.set(x + o * 2, hy - 9, "steel"); F.set(x + o * 2, hy - 8, "steel");
  },

  // ---------- Pirata
  pirata_chapeu(F, B, a) {
    const t = a.top, brim = t + 3;
    coverHead(F, a, t - 1, brim - 1, "cloth");
    const e = a.ext[t] ?? [a.headL + 2, a.headR - 2];
    F.h(t - 1, e[0], e[1], "cloth");
    if (side(a)) {
      const f = front(a);
      F.h(brim, a.headL - 1, a.headR + 1, "cloth");
      F.h(brim - 1, a.headL - 1, a.headR + 1, "cloth");
      // bico na frente e atrás, levantados
      F.set(f < 0 ? a.headL - 2 : a.headR + 2, brim - 1, "cloth"); F.set(f < 0 ? a.headL - 2 : a.headR + 2, brim - 2, "cloth");
      F.set(f < 0 ? a.headR + 2 : a.headL - 2, brim - 2, "cloth"); F.set(f < 0 ? a.headR + 2 : a.headL - 2, brim - 3, "cloth");
      F.h(brim, a.headL - 1, a.headR + 1, "gold");
    } else {
      F.h(brim, a.headL - 1, a.headR + 1, "gold");
      F.h(brim - 1, a.headL - 1, a.headR + 1, "cloth");
      F.v(a.headL - 2, brim - 3, brim - 1, "cloth"); F.v(a.headR + 2, brim - 3, brim - 1, "cloth");
      F.set(a.headL - 1, brim - 2, "cloth"); F.set(a.headR + 1, brim - 2, "cloth");
      if (a.facing === "down") {
        const cx = a.c2 >> 1;
        F.h(t, cx - 1, cx + 1, "white", 1); F.set(cx - 1, t + 1, "white", 1); F.set(cx + 1, t + 1, "white", 1); F.set(cx, t + 1, "eye");
      }
    }
  },
  pirata_papagaio(F, B, a) {
    const n = a.neck;
    const M = { R: "parrot", G: "green", B: "blue", Y: ["beak", 1], E: "eye" };
    const front6 = [".RR.", ".REY", "GGG.", "BGG.", "BGG.", ".B.."];
    const back6 = [".RR.", ".RR.", "GGG.", "GGB.", "GGB.", "..B."];
    // pousado no ombro, do lado de fora da cabeça; olha para "frente" do personagem
    if (a.facing === "down") F.stamp(a.maxL - 3, n - 7, front6, M);
    else if (a.facing === "up") F.stamp(a.maxR, n - 7, back6, M);
    else {
      const f = front(a);
      F.stamp(f < 0 ? a.maxR - 1 : a.maxL - 2, n - 7, front6, M, f < 0);
    }
  },

  // ---------- Assassino
  assassino_cachecol(F, B, a) {
    const n = a.neck, b = a.bottom;
    const flt = a.row % 2;
    const en = a.ext[n] ?? [a.bodyL, a.bodyR];
    F.h(n, en[0], en[1], "red"); F.h(n - 1, en[0] + 1, en[1] - 1, "red");
    if (a.facing === "down") {
      const x = (a.c2 >> 1) + 2;
      F.v(x, n + 1, n + 3, "red"); F.v(x + 1, n + 1, n + 2 + flt, "red");
    } else if (a.facing === "up") {
      const x = (a.c2 >> 1) - 1;
      F.v(x, n + 1, b - 1 + flt, "red"); F.v(x + 2, n + 1, b - flt, "red");
    } else {
      const f = front(a), back = f < 0 ? en[1] : en[0];
      // pontas esvoaçando para trás
      F.h(n + 1, back, back - f * (3 + flt), "red"); F.h(n + 2 + flt, back - f * 2, back - f * (5 + flt), "red");
      B.h(n, back, back - f * 2, "red");
    }
  },
  assassino_katana(F, B, a) {
    const n = a.neck, b = a.bottom;
    if (a.facing === "up") {
      F.line(a.bodyL + 1, b - 1, a.headR - 2, n - 3, "cloth");
      F.line(a.bodyL + 2, b - 1, a.headR - 1, n - 3, "cloth");
      F.h(n - 4, a.headR - 3, a.headR, "gold");
      F.line(a.headR - 1, n - 5, a.headR + 1, n - 7, "white"); F.set(a.headR, n - 5, "red");
    } else if (a.facing === "down") {
      B.set(a.headL - 1, n - 4, "gold"); B.line(a.headL - 1, n - 5, a.headL - 2, n - 7, "white"); B.set(a.headL - 2, n - 6, "red");
      B.set(a.bodyR + 1, b - 1, "cloth"); B.set(a.bodyR + 1, b - 2, "cloth");
    } else {
      const f = front(a), back = f < 0 ? a.headR : a.headL;
      F.line(back - f * 2, b - 1, back + f * 0, n - 3, "cloth");
      F.set(back + f * 0, n - 4, "gold"); F.set(back - f * 1, n - 4, "gold");
      F.line(back + f * 0, n - 5, back + f * 1, n - 7, "white"); F.set(back + f * 1, n - 6, "red");
    }
  },

  // ---------- Nórdico
  nordico_capa(F, B, a) { cape(F, B, a, { mat: "felt", trim: "white", collar: "white" }); },
  nordico_escudo(F, B, a) {
    const n = a.neck, b = a.bottom;
    const M = { i: "iron", w: "wood", W: ["wood", 1], g: ["gold", 1] };
    if (a.facing === "up") {
      const rows = ["..iiiii..", ".iwwWwwi.", "iwwwWwwwi", "iWWWgWWWi", "iwwwWwwwi", ".iwwWwwi.", "..iiiii.."];
      const [l] = spanC(a.c2, 9);
      F.stamp(l, b - rows.length, rows, M);
    } else if (a.facing === "down") {
      F.line(a.bodyR - 2, n + 1, a.bodyL + 2, b - 2, "leather", 3); // alça cruzando o peito
      // disco atrás do corpo: só a borda que sobra do contorno aparece
      const cx = (a.c2 >> 1) - 2, cy = n;
      for (let y = -4; y <= 4; y++) for (let x = -5; x <= 5; x++) {
        const d = x * x + y * y * 1.4;
        if (d <= 26) B.set(cx + x, cy + y, d >= 15 ? "iron" : "wood");
      }
    } else {
      const f = front(a), back = f < 0 ? a.bodyR : a.bodyL;
      const rows = ["i.", "wi", "wi", "gi", "wi", "wi", "i."];
      F.stamp(f < 0 ? back + 1 : back - 2, b - rows.length, rows, M, f > 0);
    }
  },

  // ---------- Mendigo
  mendigo_bengala(F, B, a) {
    const p = heldPole(F, a, 8, "wood");
    const o = p.out, y = p.top;
    // cabo curvo para fora e um nó de pano amarrado
    F.set(p.x, y - 1, "wood"); F.set(p.x + o, y - 2, "wood"); F.set(p.x + o * 2, y - 1, "wood"); F.set(p.x + o * 2, y, "wood");
    F.set(p.x, y + 3, "red"); F.set(p.x - o, y + 4, "red", 3);
  },
  mendigo_trouxa(F, B, a) {
    const n = a.neck;
    const M = { c: "beige", p: "red", P: ["red", 3] };
    const bundle = [".pcp.", "pcpcp", "cpcpc", ".PcP."];
    if (a.facing === "down") {
      // pau apoiado no ombro direito, trouxa pendurada atrás da cabeça
      B.line(a.headR - 1, n, a.headR + 3, n - 6, "wood");
      B.stamp(a.headR + 2, n - 10, bundle, M);
    } else if (a.facing === "up") {
      F.line(a.headL + 1, n, a.headL - 3, n - 6, "wood");
      F.stamp(a.headL - 6, n - 10, bundle, M);
    } else {
      const f = front(a), c = a.c2 >> 1;
      F.set(c, n, "wood");
      B.line(c, n, c - f * 5, n - 5, "wood");
      B.stamp(f < 0 ? c + 4 : c - 8, n - 9, bundle, M);
    }
  },

  // ---------- Domador de Feras
  domador_pele(F, B, a) {
    const n = a.neck, b = a.bottom, c = a.c2 >> 1;
    if (a.facing === "down") {
      const e = a.ext[n] ?? [a.bodyL, a.bodyR];
      F.h(n, e[0] - 1, e[1] + 1, "felt");
      // patas caindo pelos ombros, com garras
      for (const x of [e[0] - 1, e[1] + 1]) { F.set(x, n + 1, "felt"); F.set(x, n + 2, "bone", 1); }
      F.set(c - 2, n, "beige", 1); F.set(c + 2, n, "beige", 1);
    } else if (a.facing === "up") {
      for (let y = n - 1; y <= n + 2; y++) { const e = a.ext[Math.min(y, b - 1)] ?? [a.bodyL, a.bodyR]; F.h(y, e[0] - (y >= n ? 1 : 0), e[1] + (y >= n ? 1 : 0), "felt"); }
      F.v(c, n + 3, b, "felt"); F.set(c, b, "beige", 1); // rabo
      F.set(c - 2, n, "beige", 1); F.set(c + 3, n + 1, "beige", 1);
    } else {
      const f = front(a), back = f < 0 ? a.bodyR : a.bodyL;
      F.h(n, back + f * 3, back - f, "felt"); F.h(n + 1, back + f * 2, back - f, "felt");
      F.set(back + f * 3, n + 1, "felt"); F.set(back + f * 3, n + 2, "bone", 1); // pata
      F.line(back - f, n + 2, back - f * 2, b - 1 + (a.row % 2), "felt"); // rabo balançando
      F.set(back + f, n, "beige", 1);
    }
  },
  domador_chicote(F, B, a) {
    let x, o;
    if (a.facing === "down") { x = a.maxR + 1; o = 1; } else if (a.facing === "up") { x = a.maxL - 1; o = -1; } else { o = front(a); x = o < 0 ? a.headL - 1 : a.headR + 1; }
    const hy = a.bottom - 3;
    F.v(x, hy, hy + 2, "wood"); F.set(x, hy - 1, "gold");
    // chicote estalando: arco para cima e para fora; a ponta alterna com o passo
    const pts = [[1, -3], [2, -5], [3, -6], [4, -6], [5, -5]];
    let px = x, py = hy - 1;
    for (const [dx, dy] of pts) { F.line(px, py, x + o * dx, hy + dy, "leather"); px = x + o * dx; py = hy + dy; }
    const tip = a.row % 2 ? [6, -3] : [5, -3];
    F.line(px, py, x + o * tip[0], hy + tip[1], "leather");
    if (a.row % 2 === 0) F.set(x + o * 7, hy - 4, "sparkle", 1);
  },

  // ---------- Caçador de Demônios
  cacador_demonios_chifres(F, B, a) {
    const y0 = a.top + 2;
    const e = a.ext[y0] ?? [a.headL, a.headR];
    // chifre: base grossa saindo da cabeça, sobe e curva para dentro
    const horn = (L, x, d) => { // d = para fora
      L.set(x, y0, "red"); L.set(x + d, y0, "red"); L.set(x + d, y0 - 1, "red"); L.set(x + d * 2, y0 - 1, "red");
      L.set(x + d * 2, y0 - 2, "red"); L.set(x + d * 2, y0 - 3, "red", 1); L.set(x + d, y0 - 4, "red", 1); L.set(x + d, y0 - 5, "bone", 1);
    };
    if (side(a)) {
      const f = front(a);
      horn(F, f < 0 ? e[0] + 3 : e[1] - 3, f);
      horn(B, f < 0 ? e[1] - 1 : e[0] + 1, -f);
    } else { horn(F, e[0], -1); horn(F, e[1], 1); }
  },
  cacador_demonios_espada(F, B, a) {
    const n = a.neck, b = a.bottom;
    if (a.facing === "up") {
      F.line(a.bodyL + 1, b - 1, a.headR - 2, n - 3, "steel");
      F.line(a.bodyL + 2, b - 1, a.headR - 1, n - 3, "steel");
      F.h(n - 4, a.headR - 4, a.headR + 1, "gold");
      F.line(a.headR - 1, n - 5, a.headR, n - 7, "leather"); F.set(a.headR + 1, n - 8, "ruby", 1);
    } else if (a.facing === "down") {
      // empunhadura sobre o ombro esquerdo, ponta da lâmina sai embaixo à direita
      B.h(n - 4, a.headL - 3, a.headL + 1, "gold");
      B.line(a.headL - 1, n - 5, a.headL - 2, n - 7, "leather"); B.set(a.headL - 3, n - 8, "ruby", 1);
      B.v(a.bodyR + 1, b - 3, b - 1, "steel"); B.v(a.bodyR + 2, b - 2, b - 1, "steel");
    } else {
      const f = front(a), back = f < 0 ? a.headR : a.headL;
      F.line(back - f * 2, b - 1, back, n - 3, "steel");
      F.line(back - f * 3, b - 1, back - f, n - 3, "steel");
      F.h(n - 4, back - f * 2, back + f * 1, "gold");
      F.line(back, n - 5, back + f, n - 7, "leather"); F.set(back + f * 2, n - 8, "ruby", 1);
    }
  },

  // ---------- Peregrino
  peregrino_lanterna(F, B, a) {
    const p = heldPole(F, a, 11, "wood");
    const o = p.out, y = p.top;
    F.set(p.x + o, y, "wood"); F.set(p.x + o * 2, y, "wood"); F.set(p.x + o * 2, y + 1, "iron"); // gancho
    const M = { g: "gold", S: ["star", 1] };
    F.stamp(p.x + o * 2 - 1, y + 2, ["ggg", "gSg", "gSg", "ggg"], M);
    if (a.row % 2 === 0) F.set(p.x + o * 4, y + 2, "sparkle", 1);
    else F.set(p.x + o * 4, y + 4, "sparkle", 1);
  },
  peregrino_cabaca(F, B, a) {
    const n = a.neck, b = a.bottom;
    const M = { w: "wood", o: "gold", O: ["gold", 3] };
    const gourd = [".w.", ".o.", "ooo", "oOo", ".o."];
    if (a.facing === "down") {
      F.line(a.bodyR - 1, n + 1, a.bodyL + 1, b - 3, "leather", 3);
      F.stamp(a.bodyL - 2, b - 5, gourd, M);
    } else if (a.facing === "up") {
      F.line(a.bodyL + 1, n + 1, a.bodyR - 1, b - 3, "leather", 3);
      F.stamp(a.bodyR, b - 5, gourd, M);
    } else {
      const f = front(a), back = f < 0 ? a.bodyR : a.bodyL;
      F.stamp(back - 1 - f, b - 5, gourd, M);
    }
  },

  // ---------- Senhor da Guerra
  senhor_guerra_capa(F, B, a) { cape(F, B, a, { mat: "wine", trim: "gold", collar: "spikes" }); },
  senhor_guerra_martelo(F, B, a) {
    const p = heldPole(F, a, 9, "iron");
    const y = p.top;
    F.stamp(p.x - 2, y - 3, ["sssss", "sgggs", "sssss"], { s: "steel", g: ["gold", 1] });
    F.set(p.x, y - 4, "steel");
    F.set(p.x, a.bottom - 1, "gold");
  },

  // ---------- Monge
  monge_contas(F, B, a) {
    const n = a.neck, c = a.c2 >> 1;
    const bead = (x, y, i) => F.set(x, y, "wood", i % 2 ? 3 : 1);
    if (a.facing === "down") {
      const pts = [[-3, 0], [-2, 1], [-1, 2], [1, 2], [2, 1], [3, 0]];
      pts.forEach(([dx, dy], i) => bead(c + dx, n + dy, i));
      F.set(c, n + 2, "gold", 1); // pingente
    } else if (a.facing === "up") {
      const e = a.ext[n] ?? [a.bodyL, a.bodyR];
      for (let x = e[0] + 1, i = 0; x <= e[1] - 1; x++, i++) bead(x, n, i);
    } else {
      const f = front(a), fx = f < 0 ? a.bodyL : a.bodyR;
      [[0, 0], [0, 1], [0, 2], [-1, 3]].forEach(([dx, dy], i) => bead(fx - f * (1 - dx), n + dy, i));
      F.set(fx - f * 2, n + 4, "ruby", 1);
    }
  },
  // ---------- Fada (vocação oculta): asas e varinha de estrela
  fada_asas(F, B, a) {
    // Asa de fada: lobo de cima grande e lobo de baixo pequeno, nervura clara, 1 brilhinho. `flutter` alterna com o
    // passo (as asas batem ao andar). De frente ficam ATRÁS do corpo, saindo pelos lados dos ombros; de costas ficam
    // por cima (é o lado delas); de lado só uma aparece, varrida para trás.
    const n = a.neck, flutter = a.row % 2;
    const W = "wing", V = ["wingvein", 1], S = ["sparkleW", 1];
    const map = { w: W, v: V, s: S, p: ["sparkleP", 1] };
    const lobe = [
      "..ww..",
      ".wwww.",
      "wwvww.",
      "wwwww.",
      ".wwws.",
      ".www..",
      "..ww..",
      "..w...",
    ];
    // (x, y) = canto da asa direita (cresce para fora); flip espelha para a esquerda
    const wing = (L, x, y, flip) => L.stamp(flip ? x - 5 : x, y, lobe, map, flip);
    if (a.facing === "down") {
      wing(B, a.bodyR + 1, n - 4 - flutter, false);
      wing(B, a.bodyL - 1, n - 4 - flutter, true);
      // brilhinho solto que pisca com o passo
      if (flutter) { B.set(a.bodyR + 6, n - 5, "sparkleP", 1); B.set(a.bodyL - 6, n + 1, "sparkleW", 1); }
    } else if (a.facing === "up") {
      const c = a.c2 >> 1;
      wing(F, c + 1, n - 5 - flutter, false);
      wing(F, c - 1, n - 5 - flutter, true);
      if (!flutter) { F.set(c + 6, n - 6, "sparkleW", 1); F.set(c - 6, n, "sparkleP", 1); }
    } else {
      // de lado: a asa de trás (B) varrida para trás, mais uma ponta da da frente (F) espiando atrás do ombro
      const f = front(a), back = f < 0 ? a.bodyR : a.bodyL;
      const flip = f > 0; // olhando para a direita, a asa cresce para a esquerda
      wing(B, back - f * 1, n - 4 - flutter, flip);
      F.set(back - f * 1, n - 2 - flutter, "wing", 2); F.set(back - f * 2, n - 3 - flutter, "wing", 1);
      if (flutter) B.set(back - f * 6, n - 5, "sparkleW", 1);
    }
  },
  fada_varinha(F, B, a) {
    // Varinha branca curta com laço rosa e uma estrela dourada na ponta; o brilhinho pisca com o passo.
    const p = heldPole(F, a, 8, "white");
    const o = p.out, x = p.x, y = p.top;
    F.set(x - 1, y + 2, "ribbon"); F.set(x + 1, y + 2, "ribbon"); F.set(x, y + 2, "ribbon", 3);
    // estrela de 5 pontas (losango com miolo branco)
    F.set(x, y - 4, "brightgold"); F.h(y - 3, x - 1, x + 1, "brightgold"); F.h(y - 2, x - 2, x + 2, "brightgold");
    F.h(y - 1, x - 1, x + 1, "brightgold"); F.set(x, y, "brightgold");
    F.set(x, y - 2, "orbcore", 1);
    if (a.row % 2 === 0) F.set(x + 2 * o, y - 5, "sparkleW", 1); else F.set(x - 2 * o, y - 4, "sparkleP", 1);
  },

  monge_bastao(F, B, a) {
    const p = heldPole(F, a, 17, "wood");
    F.v(p.x, p.top, p.top + 1, "gold"); F.set(p.x, a.bottom - 1, "gold");
    // fita vermelha que balança com o passo
    F.set(p.x + p.out, p.top + 3, "red"); F.set(p.x + p.out * (1 + (a.row % 2)), p.top + 4, "red"); F.set(p.x + p.out * 2, p.top + 5, "red", 3);
  },
};

/** Capa genérica (nobre/bruxo). Vista de costas cobre o corpo; de frente só as bordas aparecem (camada de trás). */
function cape(F, B, a, { mat, trim, collar }) {
  const n = a.neck, b = a.bottom, flt = a.row % 2;
  if (a.facing === "up") {
    for (let y = n - 1; y <= b; y++) {
      const e = a.ext[Math.min(y, b - 1)] ?? [a.bodyL, a.bodyR];
      const grow = y >= b - 1 ? 1 : 0;
      F.h(y, e[0] - grow, e[1] + grow, mat);
    }
    // barra com ondulação que alterna na caminhada
    const e = a.ext[b - 1] ?? [a.bodyL, a.bodyR];
    for (let x = e[0] - 1; x <= e[1] + 1; x++) F.set(x, b, ((x + flt) % 3 === 0) ? mat : trim);
    F.v((a.c2 >> 1), n + 1, b - 1, mat, 3); // dobra
    if (collar === "white") { const ec = a.ext[n - 1] ?? [a.bodyL, a.bodyR]; F.h(n - 1, ec[0], ec[1], "white"); }
    if (collar === "spikes") { F.set(a.headL + 1, n - 2, mat); F.set(a.headL + 1, n - 3, mat); F.set(a.headR - 1, n - 2, mat); F.set(a.headR - 1, n - 3, mat); F.h(n - 1, a.headL + 1, a.headR - 1, mat); }
  } else if (a.facing === "down") {
    for (let y = n - 1; y <= b; y++) B.h(y, a.bodyL - 1, a.bodyR + 1, mat);
    B.h(b, a.bodyL - 1, a.bodyR + 1, trim);
    if (flt) { B.set(a.bodyL - 2, b, mat); B.set(a.bodyR + 2, b, mat); }
    if (collar === "white") { F.h(n, a.bodyL, a.bodyL + 1, "white"); F.h(n, a.bodyR - 1, a.bodyR, "white"); F.set((a.c2 >> 1), n, "gold", 1); }
    if (collar === "spikes") { B.v(a.headL, n - 4, n - 1, mat); B.v(a.headR, n - 4, n - 1, mat); B.set(a.headL - 1, n - 5, mat); B.set(a.headR + 1, n - 5, mat); }
  } else {
    const f = front(a), back = f < 0 ? a.bodyR : a.bodyL;
    // atrás do corpo, esvoaçando
    for (let y = n - 1; y <= b; y++) { const k = y - (n - 1); B.h(y, back, back - f * (2 + Math.floor(k * 0.6) + flt), mat); }
    B.h(b, back - f * 1, back - f * (5 + flt), trim);
    // por cima: cobre a metade de trás do tronco
    for (let y = n; y <= b - 1; y++) F.h(y, back, back + f * 2, mat);
    if (collar === "white") F.h(n - 1, back, back + f * 3, "white");
    if (collar === "spikes") { F.v(back + f, n - 4, n - 1, mat); F.set(back, n - 5, mat); }
  }
}

// ---------------------------------------------------------------- bases geradas (roupa com sheet própria)
// Algumas roupas usam uma sheet do pack recolorida + detalhes PERMANENTES (não são addons), gravados
// numa sheet 64x112 no mesmo layout do pack. Ex.: Mago = Master com túnica azul-violeta e barba longa.
const rgbHex = (r, g, b) => "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
const HAIR_WHITE = "#f2eaf1";

/** Barba longa do mago (desenhada sobre a base, segue as âncoras de cada frame). */
function drawBeard(L, a) {
  const n = a.neck, b = a.bottom, c2 = a.c2, sway = a.row % 2 === 1 ? 1 : 0;
  // fios verticais: borda clara à esquerda, escura à direita, mechas médias a cada 3 colunas
  const strand = (x, y, l, r) => (x === l ? 1 : x === r ? 3 : (x - l) % 3 === 2 ? 2 : 1);
  if (a.facing === "down") {
    const widths = [9, 9, 8, 7, 5, 3];
    widths.forEach((w, i) => {
      const y = n - 2 + i; if (y > b) return;
      const [l, r] = spanC(c2, w);
      for (let x = l; x <= r; x++) L.set(x, y, "beard", strand(x, y, l, r));
    });
    // ponta dupla ondulando com o passo
    const [l, r] = spanC(c2, 3);
    L.set(l + (sway ? 1 : 0), n + 4, "beard", 2);
    L.set(r - (sway ? 0 : 1), n + 4, "beard", 3);
  } else if (a.facing === "up") {
    // de costas: só as pontas da barba aparecem dos lados do pescoço
    const e = a.ext[n] ?? [a.bodyL, a.bodyR];
    for (const [x, d] of [[e[0] - 1, -1], [e[1] + 1, 1]]) {
      L.set(x, n - 1, "beard", 2); L.set(x, n, "beard", 2); L.set(x + d * 0, n + 1, "beard", 3);
    }
  } else {
    const f = front(a);
    const e = a.ext[n - 2] ?? [a.headL, a.headR];
    const fx = f < 0 ? e[0] + 1 : e[1] - 1; // queixo (frente do rosto)
    const widths = [6, 6, 6, 5, 4, 3];
    widths.forEach((w, i) => {
      const y = n - 2 + i; if (y > b) return;
      const shift = i >= 4 ? sway : 0;
      const lead = i >= 1 && i <= 3 ? 1 : 0; // barriga da barba sai um pouco à frente do rosto
      const x0 = fx + f * (lead - shift), x1 = fx - f * (w - 1 - lead + shift);
      const l = Math.min(x0, x1), r = Math.max(x0, x1);
      for (let x = l; x <= r; x++) L.set(x, y, "beard", strand(x, y, l, r));
    });
  }
}

const BASES = {
  mago: {
    src: "ninja/Actor/Character/Master",
    // vermelho da túnica → azul-violeta do mago do Tibia (o vermelho-escuro do rosto fica)
    recolor: { "#e0394c": "#7b86dc", "#8f3e56": "#3b3f80" },
    // abaixo do pescoço: túnica longa (mangas e barra cobrem mãos/pernas)
    recolorBody: { "#d14b34": "#5560b8", "#ef914f": "#5560b8", "#f2eaf1": "#7b86dc" },
    belt: ["#f1c471", "#d78b4a"],
    faceRecolorFromY: 26,
    faceClean: { y0: 8, y1: 11, xL: 3, xR: 12, skin: "#ef914f" },
    faceMaxY: 10, // abaixo disso, vermelho = manga/túnica (não rosto)
    faceBody: { "#d14b34": "#5560b8" },
    faceFix: { red: "#d14b34", whites: ["#f2eaf1"], brow: "#d6d8dc", skin: "#ef914f" },
    faceFixPortrait: { red: "#d1513b", whites: ["#f2eaf1", "#8d977f"], brow: "#d6d8dc", skin: "#f2ad7d" },
    // barba longa no retrato (abaixo do bigode do Master)
    faceDraw(px, w, h) {
      const set = (x, y, c) => { if (x < 0 || y < 0 || x >= w || y >= h) return; const i = (y * w + x) * 4; const v = hex(c); px[i] = v[0]; px[i + 1] = v[1]; px[i + 2] = v[2]; px[i + 3] = 255; };
      const B = MATS.beard.c;
      for (let y = 25; y < h; y++) {
        const k = Math.floor((y - 25) / 3);
        const l = 8 + k, r = 19 - k;
        if (r - l < 2) break;
        set(l - 1, y, "#141b1b"); set(r + 1, y, "#141b1b");
        for (let x = l; x <= r; x++) set(x, y, x === l ? B[0] : x === r ? B[2] : (x - l) % 3 === 2 ? B[1] : B[0]);
      }
    },
    draw: drawBeard,
  },
};
MATS.beard = { c: ["#f2eaf1", "#d6d8dc", "#9ba7aa"] };
MAT_NAMES.push("beard"); MAT_ID.beard = MAT_NAMES.length; MAT_RGB.push(MATS.beard.c.map(hex));

/** Algum vizinho (8 direções) da imagem ORIGINAL tem uma destas cores? */
function whiteNear(png, x, y, colors) {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    const X = x + dx, Y = y + dy;
    if (X < 0 || Y < 0 || X >= png.width || Y >= png.height) continue;
    const i = (Y * png.width + X) * 4;
    if (png.data[i + 3] >= 128 && colors.includes(rgbHex(png.data[i], png.data[i + 1], png.data[i + 2]))) return true;
  }
  return false;
}

function generateBases() {
  for (const o of OUTFIT_LIST) {
    const spec = BASES[o.id];
    if (!spec) continue;
    const src = readSheet(join(root, "assets", spec.src, "SpriteSheet.png"));
    const out = new Uint8Array(src.data);
    for (let row = 0; row < ROWS; row++) for (let col = 0; col < COLS; col++) {
      const a = { ...computeAnchors(src, col, row), facing: FACINGS[col], row };
      const px = (x, y) => ((row * 16 + y) * src.width + col * 16 + x) * 4;
      // 1) recolor
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const i = px(x, y); if (out[i + 3] < 128) continue;
        const h = rgbHex(out[i], out[i + 1], out[i + 2]);
        let to = spec.recolor[h] ?? (y > a.neck || (spec.faceMaxY !== undefined && y > spec.faceMaxY) || ((y === a.neck || a.facing === "up") && h === "#d14b34") ? spec.recolorBody[h] : undefined);
        // faixa dourada na cintura (só sobre a túnica)
        if (spec.belt && y === a.bottom - 2 && (to || Object.values(spec.recolor).includes(h))) to = spec.belt[(x + row) % 3 === 0 ? 1 : 0];
        // rosto: riscos vermelhos → sobrancelhas grisalhas (encostadas no cabelo branco) ou sombra de pele
        if (!to && spec.faceFix && y < a.neck && y <= (spec.faceMaxY ?? 15) && h === spec.faceFix.red) to = whiteNear(src, col * 16 + x, row * 16 + y, spec.faceFix.whites) ? spec.faceFix.brow : spec.faceFix.skin;
        if (to) { const c = hex(to); out[i] = c[0]; out[i + 1] = c[1]; out[i + 2] = c[2]; }
      }
      // 2) detalhes permanentes (contorno não risca o cabelo/barba brancos da base)
      const L = new Layer();
      spec.draw(L, a);
      const rgba = renderLayer(L);
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const si = ((y + OY) * FW + x + OX) * 4; if (!rgba[si + 3]) continue;
        const i = px(x, y);
        const isOutline = rgba[si] === OUTLINE[0] && rgba[si + 1] === OUTLINE[1] && rgba[si + 2] === OUTLINE[2];
        if (isOutline && out[i + 3] >= 128 && rgbHex(out[i], out[i + 1], out[i + 2]) === HAIR_WHITE) continue;
        out[i] = rgba[si]; out[i + 1] = rgba[si + 1]; out[i + 2] = rgba[si + 2]; out[i + 3] = 255;
      }
      // 3) limpeza do rosto de frente: sobra de pele laranja nas laterais (fora das sobrancelhas/olhos) vira capuz branco
      if (spec.faceClean && a.facing === "down") {
        for (let y = spec.faceClean.y0; y <= spec.faceClean.y1; y++) for (let x = 0; x < 16; x++) {
          if (x > spec.faceClean.xL && x < spec.faceClean.xR) continue;
          const i = px(x, y);
          if (out[i + 3] >= 128 && rgbHex(out[i], out[i + 1], out[i + 2]) === spec.faceClean.skin) { const c = hex(HAIR_WHITE); out[i] = c[0]; out[i + 1] = c[1]; out[i + 2] = c[2]; }
        }
      }
    }
    writePng(join(root, "assets", o.sheet), src.width, src.height, out);
    // retrato: mesmo recolor (túnica), a partir de faceRecolorFromY
    if (o.faceset) {
      const face = readSheet(join(root, "assets", spec.src, "Faceset.png"));
      const fo = new Uint8Array(face.data);
      for (let y = 0; y < face.height; y++) for (let x = 0; x < face.width; x++) {
        const i = (y * face.width + x) * 4; if (fo[i + 3] < 128) continue;
        const h = rgbHex(fo[i], fo[i + 1], fo[i + 2]);
        let to = y >= spec.faceRecolorFromY ? spec.recolor[h] ?? spec.faceBody[h] : undefined;
        const ff = spec.faceFixPortrait;
        if (!to && ff && h === ff.red) to = whiteNear(face, x, y, ff.whites) ? ff.brow : ff.skin;
        if (to) { const c = hex(to); fo[i] = c[0]; fo[i + 1] = c[1]; fo[i + 2] = c[2]; }
      }
      spec.faceDraw?.(fo, face.width, face.height);
      writePng(join(root, "assets", o.faceset), face.width, face.height, fo);
    }
  }
}

// ---------------------------------------------------------------- bases femininas (OutfitDef.female)
// Cada roupa tem uma sheet por sexo. As que o pack tem (Woman, Princess, Cavegirl...) entram direto no catálogo; as que
// não tem saem daqui, a partir de uma sheet feminina do pack (`src`):
//   1) troca de paleta (`all` na sheet toda; `head` acima do pescoço das âncoras, `body` dali para baixo), mantendo o
//      sombreado do pack;
//   2) `hat`: o que cobre a cabeça na roupa masculina (turbante, crânio de leão, chapéu de palha) é copiado frame a frame
//      da sheet dele — só os pixels nas cores do chapéu (e o contorno encostado neles) nas `rows` linhas do topo,
//      balançando com a cabeça DELA; o cabelo dela acima some e o das últimas `keep` linhas fica (escapa pelos lados),
//      e o contorno de 1 px é fechado onde faltar.
// O retrato (38x38) passa pelo mesmo processo com cortes fixos: `split` (cabeça/corpo), `clearTo` (acima, só o chapéu)
// e `pasteTo` (até aqui o chapéu cobre; entre os dois, o cabelo dela aparece onde o chapéu não tem pixel).
// Escolhas de arte: Maga = Woman de cabelo branco e vestido azul-violeta (cores da túnica do base_mago; a alça dourada
// fica); Mendiga = OldWoman (só 2 linhas no pack: caminhada 0,1,0,1); Oriental = Princess com o turbante do Sultan2 e
// saia vinho/vermelha (blusa já dourada como a capa dele); Domadora = Cavegirl com o crânio do ShamanLion, cabelo vinho
// de juba e saia oliva; Peregrina = OldWoman de cabelo branco (a barba dele) com o chapéu de palha do OldMan3 e manto
// escuro; Monja = Woman de cabelo escuro e túnica verde com faixa rosa (cores do Monk).
const PACK = "ninja/Actor/Character/";
const OLDWOMAN_ROWS = [0, 1, 0, 1, 0, 1, 0];
const WOMAN_MAGA = { "#f1c471": "#f2eaf1", "#d78b4a": "#d6d8dc" };
const WOMAN_MONJA = { "#f1c471": "#4e484a", "#d78b4a": "#3b3643" };
const OLD_WHITE = { "#d3a2c0": "#f2eaf1", "#a5608b": "#d6d8dc", "#f2eaf1": "#ffffff" };
const FEMALE_BASES = {
  mago: {
    src: "Woman",
    head: { ...WOMAN_MAGA, "#79b8ce": "#7b86dc", "#548789": "#5560b8" },
    body: { "#79b8ce": "#7b86dc", "#548789": "#5560b8" },
    face: { split: 28 },
  },
  mendigo: { src: "OldWoman", rows: OLDWOMAN_ROWS },
  oriental: {
    src: "Princess",
    body: { "#8d977f": "#8f3e56", "#abc2bc": "#e0394c" },
    hat: { from: "Sultan2", colors: ["#fce2ca", "#c8966b", "#e0394c", "#8f3e56"], rows: 8, keep: 2 },
    face: { split: 27, hat: { colors: ["#fce2ca", "#c8966b", "#e0394c", "#8f3e56", "#543c52"], clearTo: 13, pasteTo: 21 } },
  },
  domador: {
    src: "Cavegirl",
    all: { "#56864c": "#8f3e56", "#345a52": "#5a2a3e", "#a3754e": "#a8a129", "#965340": "#56864c" },
    head: { "#4e484a": "#5a2a3e" },
    body: { "#4e484a": "#345a52" },
    hat: { from: "ShamanLion", colors: ["#fce2ca", "#c8966b"], rows: 6, keep: 2 },
    face: { split: 32, hat: { colors: ["#fce2ca", "#c8966b", "#5f7160"], clearTo: 8, pasteTo: 19, holes: true } },
  },
  peregrino: {
    src: "OldWoman", rows: OLDWOMAN_ROWS,
    all: OLD_WHITE,
    body: { "#548789": "#4e484a", "#2d697b": "#3b3643", "#4e484a": "#965340" },
    hat: { from: "OldMan3", colors: ["#f1c471", "#d78b4a", "#e3f1f5"], rows: 9, keep: 2 },
    face: { split: 30, hat: { colors: ["#f1c471", "#d78b4a", "#e3f1f5"], clearTo: 10, pasteTo: 16 } },
  },
  monge: {
    src: "Woman",
    head: { ...WOMAN_MONJA, "#79b8ce": "#56864c", "#548789": "#345a52" },
    body: { "#79b8ce": "#56864c", "#548789": "#345a52", "#f1c471": "#d3a2c0", "#d78b4a": "#a5608b" },
    face: { split: 28 },
  },
  // Fada (vocação oculta): a Woman ruiva (o loiro vira cobre, bem mais vermelho que a pele) de vestido rosa com laço
  // claro. `asBase`: é a ÚNICA sheet da roupa (vale para os dois sexos), gravada em `sheet`/`faceset` em vez de `female`.
  fada: {
    src: "Woman", asBase: true,
    all: { "#f1c471": "#dc4a2c", "#d78b4a": "#962b1d", "#79b8ce": "#ff9fd6", "#548789": "#d9579f", "#e0394c": "#ffe0f0" },
    face: { split: 28 },
  },
};
/** Retratos femininos do pack fora de 38x38 (o da Cavegirl2 tem 37 de largura: falta a 1ª coluna, só fundo). */
const FEMALE_FACE_PAD = { barbaro: "Cavegirl2" };
const OUTLINE_HEX = rgbHex(...OUTLINE);
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** Sheet do pack; `rows` remonta as linhas (OldWoman tem 64x32: vira 64x112 repetindo as 2 que existem). */
function packSheet(name, rows) {
  const png = readSheet(join(root, "assets", PACK, name, "SpriteSheet.png"));
  if (!rows) return png;
  const out = new PNG({ width: png.width, height: rows.length * 16 });
  const line = png.width * 16 * 4;
  rows.forEach((r, k) => png.data.copy(out.data, k * line, r * line, (r + 1) * line));
  return out;
}

/** Troca a cor do pixel i pelo primeiro mapa que a tiver (pixel transparente fica). */
function recolorAt(d, i, ...maps) {
  if (d[i + 3] < 128) return;
  const h = rgbHex(d[i], d[i + 1], d[i + 2]);
  for (const m of maps) {
    const to = m?.[h];
    if (to) { const c = hex(to); d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; return; }
  }
}

/** Leitor de cor (hex ou null se transparente/fora) de uma imagem, com origem (ox, oy) e tamanho w×h. */
function pixelReader(png, ox, oy, w, h) {
  return (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return null;
    const i = ((oy + y) * png.width + ox + x) * 4;
    return png.data[i + 3] >= 128 ? rgbHex(png.data[i], png.data[i + 1], png.data[i + 2]) : null;
  };
}

/**
 * Pixel do chapéu: cor do chapéu, ou contorno encostado (4 lados) numa cor dele dentro das linhas do chapéu. `holes`:
 * contorno cercado pelo chapéu (cor dele à esquerda, à direita e acima) também é chapéu — os olhos vazados do crânio.
 */
function hatMask(read, colors, bottom, holes = false) {
  const has = (x, y) => colors.includes(read(x, y));
  const scan = (x, y, dx, dy) => { for (let k = 1; k < 40; k++) { const X = x + dx * k, Y = y + dy * k; const c = read(X, Y); if (!c) return false; if (colors.includes(c)) return true; if (c !== OUTLINE_HEX) return false; } return false; };
  return (x, y) => {
    if (y > bottom) return false;
    const c = read(x, y);
    if (!c) return false;
    if (colors.includes(c)) return true;
    if (c !== OUTLINE_HEX) return false;
    if (N4.some(([dx, dy]) => y + dy <= bottom && has(x + dx, y + dy))) return true;
    return holes && scan(x, y, -1, 0) && scan(x, y, 1, 0) && scan(x, y, 0, -1);
  };
}

/** Chapéu da sheet masculina sobre o frame (col,row) da feminina (ver o comentário da seção). */
function pasteHat(out, W, hatPng, h, col, row, fa, fa0) {
  const ha = computeAnchors(hatPng, col, row), ha0 = computeAnchors(hatPng, col, 0);
  const dy = (fa.top - fa0.top) - (ha.top - ha0.top);
  const bottom = ha.top + h.rows - 1;
  const read = pixelReader(hatPng, col * 16, row * 16, 16, 16);
  const isHat = hatMask(read, h.colors, bottom);
  const px = (x, y) => ((row * 16 + y) * W + col * 16 + x) * 4;
  const last = Math.min(15, bottom + dy);
  for (let y = 0; y <= last; y++) for (let x = 0; x < 16; x++) {
    const i = px(x, y), hy = y - dy;
    if (hy >= 0 && isHat(x, hy)) {
      const j = ((row * 16 + hy) * hatPng.width + col * 16 + x) * 4;
      out[i] = hatPng.data[j]; out[i + 1] = hatPng.data[j + 1]; out[i + 2] = hatPng.data[j + 2]; out[i + 3] = 255;
    } else if (y <= last - h.keep) out[i + 3] = 0;
  }
  // contorno de 1 px onde o cabelo cortado ficou aberto (só nas linhas do chapéu: o resto da sheet é do pack)
  const op = (x, y) => x >= 0 && y >= 0 && x < 16 && y < 16 && out[px(x, y) + 3] >= 128;
  const add = [];
  for (let y = 0; y <= Math.min(15, last + 1); y++) for (let x = 0; x < 16; x++) {
    if (op(x, y)) continue;
    if (N4.some(([ddx, ddy]) => { if (!op(x + ddx, y + ddy)) return false; const k = px(x + ddx, y + ddy); return rgbHex(out[k], out[k + 1], out[k + 2]) !== OUTLINE_HEX; })) add.push([x, y]);
  }
  for (const [x, y] of add) { const i = px(x, y); out[i] = OUTLINE[0]; out[i + 1] = OUTLINE[1]; out[i + 2] = OUTLINE[2]; out[i + 3] = 255; }
}

/** Retrato: recolor por região + chapéu do retrato masculino (fundo do retrato = cor do contorno). */
function femaleFaceset(spec) {
  const face = readSheet(join(root, "assets", PACK, spec.src, "Faceset.png"));
  const fo = new Uint8Array(face.data);
  const f = spec.face;
  for (let y = 0; y < face.height; y++) for (let x = 0; x < face.width; x++) {
    recolorAt(fo, (y * face.width + x) * 4, y < f.split ? f.head ?? spec.head : f.body ?? spec.body, f.all ?? spec.all);
  }
  if (f.hat) {
    const hp = readSheet(join(root, "assets", PACK, spec.hat.from, "Faceset.png"));
    const read = pixelReader(hp, 0, 0, hp.width, hp.height);
    const isHat = hatMask(read, f.hat.colors, f.hat.pasteTo, f.hat.holes);
    const dark = (i) => { fo[i] = OUTLINE[0]; fo[i + 1] = OUTLINE[1]; fo[i + 2] = OUTLINE[2]; fo[i + 3] = 255; };
    for (let y = 0; y <= f.hat.pasteTo; y++) for (let x = 0; x < face.width; x++) {
      const i = (y * face.width + x) * 4;
      if (isHat(x, y)) { const j = (y * hp.width + x) * 4; fo[i] = hp.data[j]; fo[i + 1] = hp.data[j + 1]; fo[i + 2] = hp.data[j + 2]; fo[i + 3] = 255; }
      else if (y <= f.hat.clearTo) dark(i);
    }
    // borda de baixo do chapéu cortado: contorno entre ele e o cabelo/rosto dela
    const yb = f.hat.pasteTo;
    for (let x = 0; x < face.width; x++) if (f.hat.colors.includes(read(x, yb))) dark(((yb + 1) * face.width + x) * 4);
  }
  return { w: face.width, h: face.height, data: fo };
}

function generateFemaleBases() {
  for (const o of OUTFIT_LIST) {
    if (FEMALE_FACE_PAD[o.id]) {
      if (!o.facesetF?.startsWith("addons/")) throw new Error(`${o.id}: retrato completado precisa de facesetF = addons/...`);
      const f = readSheet(join(root, "assets", PACK, FEMALE_FACE_PAD[o.id], "Faceset.png"));
      const W = 38, dx = W - f.width, out = new Uint8Array(W * f.height * 4);
      for (let y = 0; y < f.height; y++) for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4, j = (y * f.width + x - dx) * 4;
        const c = x < dx ? [...OUTLINE, 255] : f.data.subarray(j, j + 4);
        out[i] = c[0]; out[i + 1] = c[1]; out[i + 2] = c[2]; out[i + 3] = c[3];
      }
      writePng(join(root, "assets", o.facesetF), W, f.height, out);
    }
    const spec = FEMALE_BASES[o.id];
    if (!spec) continue;
    // `asBase`: a sheet gerada é a própria base da roupa (uma só para os dois sexos), não a versão feminina.
    const outSheet = spec.asBase ? o.sheet : o.female, outFace = spec.asBase ? o.faceset : o.facesetF;
    if (!outSheet?.startsWith("addons/")) throw new Error(`${o.id}: base ${spec.asBase ? "gerada" : "feminina gerada"} precisa de ${spec.asBase ? "sheet" : "female"} = addons/... em outfits.ts`);
    const src = packSheet(spec.src, spec.rows);
    const hat = spec.hat && packSheet(spec.hat.from);
    const out = new Uint8Array(src.data);
    for (let row = 0; row < ROWS; row++) for (let col = 0; col < COLS; col++) {
      const fa = computeAnchors(src, col, row), fa0 = computeAnchors(src, col, 0);
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        recolorAt(out, ((row * 16 + y) * src.width + col * 16 + x) * 4, y < fa.neck ? spec.head : spec.body, spec.all);
      }
      if (hat) pasteHat(out, src.width, hat, spec.hat, col, row, fa, fa0);
    }
    writePng(join(root, "assets", outSheet), src.width, src.height, out);
    if (spec.face) {
      if (!outFace?.startsWith("addons/")) throw new Error(`${o.id}: retrato gerado precisa de ${spec.asBase ? "faceset" : "facesetF"} = addons/...`);
      const r = femaleFaceset(spec);
      writePng(join(root, "assets", outFace), r.w, r.h, r.data);
    }
  }
}

// ---------------------------------------------------------------- geração
function frameAnchors(base, col, row) {
  const a = computeAnchors(base, col, row);
  return { ...a, facing: FACINGS[col], row };
}

function blitFrame(sheet, sw, rgba, col, row) {
  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
    const si = (y * FW + x) * 4, di = ((row * FH + y) * sw + col * FW + x) * 4;
    sheet[di] = rgba[si]; sheet[di + 1] = rgba[si + 1]; sheet[di + 2] = rgba[si + 2]; sheet[di + 3] = rgba[si + 3];
  }
}

function writePng(path, w, h, data) {
  const png = new PNG({ width: w, height: h });
  png.data = Buffer.from(data);
  writeFileSync(path, PNG.sync.write(png, { colorType: 6 }));
}

/** Desenha um addon inteiro (4x7 frames) com as âncoras de `base`: camadas da frente/trás e quanto sobe acima da cabeça. */
function drawAddon(ad, base) {
  const draw = DRAW[ad.id];
  if (!draw) throw new Error(`addon sem desenho: ${ad.id}`);
  const SW = COLS * FW, SH = ROWS * FH;
  const front = new Uint8Array(SW * SH * 4), back = new Uint8Array(SW * SH * 4);
  let hasBack = false, minY = Infinity;
  for (let row = 0; row < ROWS; row++) for (let col = 0; col < COLS; col++) {
    const a = frameAnchors(base, col, row);
    const F = new Layer(), B = new Layer();
    draw(F, B, a);
    const fr = renderLayer(F), br = renderLayer(B);
    if (B.any()) hasBack = true;
    blitFrame(front, SW, fr, col, row); blitFrame(back, SW, br, col, row);
    if (row < 4) for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) if (fr[(y * FW + x) * 4 + 3] || br[(y * FW + x) * 4 + 3]) { minY = Math.min(minY, y - OY - a.top); break; }
  }
  return { def: ad, front, back: hasBack ? back : null, SW, SH, extraTop: Math.max(0, -(Number.isFinite(minY) ? minY : 0)) };
}

const sameBytes = (a, b) => (!a && !b) || (!!a && !!b && Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0);

export function generateAll() {
  mkdirSync(OUT_DIR, { recursive: true });
  const manifest = { frameWidth: FW, frameHeight: FH, offsetX: OX, offsetY: OY, addons: {} };
  const extraTop = {}, extraTopF = {};
  const results = [];
  const mismatches = [];
  generateBases();
  generateFemaleBases();
  for (const o of OUTFIT_LIST) {
    const base = readSheet(join(root, "assets", o.sheet));
    const baseF = o.female ? readSheet(join(root, "assets", o.female)) : null;
    const outfitRes = { outfit: o, base, addons: [], baseF: baseF ?? base, addonsF: [] };
    for (const ad of o.addons) {
      const r = drawAddon(ad, base);
      if (!!r.back !== !!ad.backSheet) { mismatches.push(`${ad.id}: catálogo back=${!!ad.backSheet}, desenho back=${!!r.back}`); continue; }
      writePng(join(root, "assets", ad.sheet), r.SW, r.SH, r.front);
      if (r.back) writePng(join(root, "assets", ad.backSheet), r.SW, r.SH, r.back);
      extraTop[ad.id] = r.extraTop;
      manifest.addons[ad.id] = { outfit: o.id, name: ad.name, front: ad.sheet, back: r.back ? ad.backSheet : null, extraTop: r.extraTop };
      outfitRes.addons.push(r);
      // Versão feminina: o mesmo desenho com as âncoras da sheet dela (chapéu no cabelo dela). Só grava `<id>_f` quando
      // sai diferente do masculino; o catálogo descobre pelo ADDON_FEMALE_EXTRA_TOP gerado abaixo.
      const fFront = `addons/${ad.id}_f.png`, fBack = `addons/${ad.id}_f_back.png`;
      let rf = baseF ? drawAddon(ad, baseF) : null;
      if (rf && !!rf.back !== !!r.back) { mismatches.push(`${ad.id}: overlay feminino back=${!!rf.back}, masculino back=${!!r.back}`); rf = null; }
      if (rf && sameBytes(rf.front, r.front) && sameBytes(rf.back, r.back)) rf = null;
      for (const p of rf ? (rf.back ? [] : [fBack]) : [fFront, fBack]) if (existsSync(join(root, "assets", p))) unlinkSync(join(root, "assets", p));
      if (rf) {
        writePng(join(root, "assets", fFront), rf.SW, rf.SH, rf.front);
        if (rf.back) writePng(join(root, "assets", fBack), rf.SW, rf.SH, rf.back);
        extraTopF[ad.id] = rf.extraTop;
        manifest.addons[ad.id].female = { front: fFront, back: rf.back ? fBack : null, extraTop: rf.extraTop };
      }
      outfitRes.addonsF.push(rf ?? r);
    }
    results.push(outfitRes);
  }
  if (mismatches.length) throw new Error("Ajuste backSheet em outfits.ts:\n  " + mismatches.join("\n  "));
  writeFileSync(join(OUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  const table = (name, t) => `export const ${name}: Record<string, number> = {\n` + Object.entries(t).map(([k, v]) => `  ${k}: ${v},\n`).join("") + "};\n";
  const ts = "// GERADO por tools/addons/generate.mjs — não edite à mão.\n" + table("ADDON_EXTRA_TOP", extraTop) +
    "/** Addons com overlay próprio para a sheet feminina (addons/<id>_f.png): px acima da cabeça dela. */\n" +
    table("ADDON_FEMALE_EXTRA_TOP", extraTopF);
  writeFileSync(join(root, "packages/shared/src/data/outfitsExtraTop.ts"), ts);
  writePreview(results, false);
  writePreview(results, true);
  writeOutfitPreview(results.find((r) => r.outfit.id === "mago"), "preview_mago.png");
  writeFixesPreview(results);
  writeSexPreview(results);
  return results;
}

// ---------------------------------------------------------------- preview
/** Uma roupa em 6x: linha 1 = base/+a1/+a2/+ambos parados nos 4 lados; linha 2 = caminhada completa com os 2 addons. */
function writeOutfitPreview(r, file) {
  if (!r) return;
  const S = 6, CW = 28, CH = 30, cx0 = OX - 6, cy0 = OY - 12, GAP = 2;
  const W = (16 * CW + 3 * GAP) * S, H = 2 * CH * S;
  const out = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, k = ((x / (S * 8) | 0) + (y / (S * 8) | 0)) % 2;
    out[i] = k ? 92 : 84; out[i + 1] = k ? 138 : 128; out[i + 2] = k ? 84 : 78; out[i + 3] = 255;
  }
  const put = (X, Y, c) => { for (let a = 0; a < S; a++) for (let b = 0; b < S; b++) { const i = ((Y * S + a) * W + X * S + b) * 4; out[i] = c[0]; out[i + 1] = c[1]; out[i + 2] = c[2]; } };
  const blit = (src, sw, sx, sy, w, h, dx, dy) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = ((sy + y) * sw + sx + x) * 4; if (src[i + 3] >= 128) put(dx + x, dy + y, [src[i], src[i + 1], src[i + 2]]); }
  };
  const cell = (st, col, row, dx, dy) => {
    const on = r.addons.filter((_, i) => st & (1 << i));
    for (const ad of on) if (ad.back) blit(ad.back, ad.SW, col * FW + cx0, row * FH + cy0, CW, CH, dx, dy);
    blit(r.base.data, r.base.width, col * 16, row * 16, 16, 16, dx + (OX - cx0), dy + (OY - cy0));
    for (const ad of on) blit(ad.front, ad.SW, col * FW + cx0, row * FH + cy0, CW, CH, dx, dy);
  };
  for (let st = 0; st < 4; st++) for (let col = 0; col < 4; col++) cell(st, col, 0, (st * 4 + col) * CW + st * GAP, 0);
  for (let col = 0; col < 4; col++) for (let row = 0; row < 4; row++) cell(3, col, row, (col * 4 + row) * CW + col * GAP, CH);
  writePng(join(OUT_DIR, file), W, H, out);
}

/** Recorte 8x dos itens corrigidos (guerreiro: elmo alado, nobre: pena, mago: rosto): 4 lados x 2 frames de caminhada. */
function writeFixesPreview(results) {
  const S = 8, CW = 28, CH = 30, cx0 = OX - 6, cy0 = OY - 12;
  const ids = ["guerreiro", "nobre", "mago"], frames = [];
  for (let col = 0; col < 4; col++) for (const row of [1, 3]) frames.push([col, row]);
  const W = frames.length * CW * S, H = ids.length * CH * S;
  const out = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, k = ((x / (S * 4) | 0) + (y / (S * 4) | 0)) % 2;
    out[i] = k ? 92 : 84; out[i + 1] = k ? 138 : 128; out[i + 2] = k ? 84 : 78; out[i + 3] = 255;
  }
  const put = (X, Y, c) => { for (let a = 0; a < S; a++) for (let b = 0; b < S; b++) { const i = ((Y * S + a) * W + X * S + b) * 4; out[i] = c[0]; out[i + 1] = c[1]; out[i + 2] = c[2]; } };
  const blit = (src, sw, sx, sy, dx, dy) => {
    for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) { const i = ((sy + y) * sw + sx + x) * 4; if (src[i + 3] >= 128) put(dx + x, dy + y, [src[i], src[i + 1], src[i + 2]]); }
  };
  ids.forEach((id, oi) => {
    const r = results.find((q) => q.outfit.id === id);
    if (!r) return;
    frames.forEach(([col, row], k) => {
      const dx = k * CW, dy = oi * CH;
      for (const ad of r.addons) if (ad.back) blit(ad.back, ad.SW, col * FW + cx0, row * FH + cy0, dx, dy);
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const i = ((row * 16 + y) * r.base.width + col * 16 + x) * 4;
        if (r.base.data[i + 3] >= 128) put(dx + x + (OX - cx0), dy + y + (OY - cy0), [r.base.data[i], r.base.data[i + 1], r.base.data[i + 2]]);
      }
      for (const ad of r.addons) blit(ad.front, ad.SW, col * FW + cx0, row * FH + cy0, dx, dy);
    });
  });
  writePng(join(OUT_DIR, "preview_fixes.png"), W, H, out);
}

function writePreview(results, walk) {
  const S = 4, CW = 28, CH = 30;   // célula (px de base) — corta a folga do overlay
  const cx0 = OX - 6, cy0 = OY - 12;
  const states = walk ? [3] : [0, 1, 2, 3];
  const framesPer = walk ? 16 : 4; // walk: 4 lados x 4 frames
  const W = (framesPer * states.length) * CW * S + 8 * S, H = results.length * CH * S;
  const out = new Uint8Array(W * H * 4);
  // fundo xadrez verde (grama)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, k = ((x / (S * 8) | 0) + (y / (S * 8) | 0)) % 2;
    out[i] = k ? 92 : 84; out[i + 1] = k ? 138 : 128; out[i + 2] = k ? 84 : 78; out[i + 3] = 255;
  }
  const put = (X, Y, r, g, b) => { for (let a = 0; a < S; a++) for (let c = 0; c < S; c++) { const i = ((Y * S + a) * W + X * S + c) * 4; out[i] = r; out[i + 1] = g; out[i + 2] = b; out[i + 3] = 255; } };
  const drawRgba = (src, sw, sx, sy, w, h, dx, dy) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = ((sy + y) * sw + sx + x) * 4; if (src[i + 3] < 128) continue; put(dx + x, dy + y, src[i], src[i + 1], src[i + 2]);
    }
  };
  results.forEach((r, oi) => {
    let k = 0;
    for (const st of states) {
      const on = r.addons.filter((_, i) => st & (1 << i));
      const frames = walk ? [0, 1, 2, 3].flatMap((col) => [0, 1, 2, 3].map((row) => [col, row])) : [0, 1, 2, 3].map((col) => [col, 0]);
      for (const [col, row] of frames) {
        const dx = k * CW + (walk ? 0 : Math.floor(k / 4) * 2), dy = oi * CH;
        // atrás → base → frente
        for (const ad of on) if (ad.back) drawRgba(ad.back, ad.SW, col * FW + cx0, row * FH + cy0, CW, CH, dx, dy);
        drawRgba(r.base.data, r.base.width, col * 16, row * 16, 16, 16, dx + (OX - cx0), dy + (OY - cy0));
        for (const ad of on) drawRgba(ad.front, ad.SW, col * FW + cx0, row * FH + cy0, CW, CH, dx, dy);
        k++;
      }
    }
  });
  writePng(join(OUT_DIR, walk ? "preview_walk.png" : "preview.png"), W, H, out);
}

/**
 * Os dois sexos lado a lado (4x, de frente): por roupa, ♂ sem addons, ♂ com os 2, ♀ sem, ♀ com os 2 (overlays dela).
 * Duas colunas de roupas (faixa escura entre elas); linha clara à esquerda das femininas.
 */
function writeSexPreview(results) {
  const S = 4, CW = 28, CH = 30, cx0 = OX - 6, cy0 = OY - 12, GAP = 3, SEP = 10;
  const half = Math.ceil(results.length / 2);
  const groupW = 4 * CW + GAP;
  const W = 2 * groupW + SEP, H = half * CH;
  const out = new Uint8Array(W * S * H * S * 4);
  const WS = W * S;
  for (let y = 0; y < H * S; y++) for (let x = 0; x < WS; x++) {
    const i = (y * WS + x) * 4, k = ((x / (S * 8) | 0) + (y / (S * 8) | 0)) % 2;
    out[i] = k ? 92 : 84; out[i + 1] = k ? 138 : 128; out[i + 2] = k ? 84 : 78; out[i + 3] = 255;
  }
  const put = (X, Y, c) => { for (let a = 0; a < S; a++) for (let b = 0; b < S; b++) { const i = ((Y * S + a) * WS + X * S + b) * 4; out[i] = c[0]; out[i + 1] = c[1]; out[i + 2] = c[2]; } };
  const blit = (src, sw, sx, sy, w, h, dx, dy) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = ((sy + y) * sw + sx + x) * 4; if (src[i + 3] >= 128) put(dx + x, dy + y, [src[i], src[i + 1], src[i + 2]]); }
  };
  const cell = (base, addons, dx, dy) => {
    for (const ad of addons) if (ad.back) blit(ad.back, ad.SW, cx0, cy0, CW, CH, dx, dy);
    blit(base.data, base.width, 0, 0, 16, 16, dx + (OX - cx0), dy + (OY - cy0));
    for (const ad of addons) blit(ad.front, ad.SW, cx0, cy0, CW, CH, dx, dy);
  };
  for (let y = 0; y < H; y++) for (let x = groupW; x < groupW + SEP; x++) put(x, y, [38, 52, 36]);
  results.forEach((r, k) => {
    const gx = (k >= half ? groupW + SEP : 0), gy = (k % half) * CH;
    for (let y = 0; y < CH; y++) put(gx + 2 * CW, gy + y, [214, 216, 220]);
    cell(r.base, [], gx, gy);
    cell(r.base, r.addons, gx + CW, gy);
    cell(r.baseF, [], gx + 2 * CW + GAP, gy);
    cell(r.baseF, r.addonsF, gx + 3 * CW + GAP, gy);
  });
  writePng(join(OUT_DIR, "preview_sexo.png"), WS, H * S, out);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const r = generateAll();
  const f = r.reduce((s, o) => s + o.addonsF.filter((a, i) => a !== o.addons[i]).length, 0);
  console.log(`addons: ${r.reduce((s, o) => s + o.addons.length, 0)} overlays de ${r.length} roupas (+${f} femininos) → assets/addons/`);
}

// Gera o overlay de montaria (assets/addons/mount_<outfitId>_back.png): SEMPRE atrás do personagem, independente
// da roupa escolhida (não é addon de roupa escolhível, não consome os bits addon1/addon2). Um desenho por roupa,
// reaproveitando as âncoras de cada sheet já gerada por tools/addons/generate.mjs, pro cavalo encaixar embaixo de
// qualquer personagem. Desbloqueio/preço: shared/data/mount.ts. Determinístico (sem aleatoriedade).
//
//   node tools/addons/mount.mjs            gera as sheets + manifest + preview
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
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

const OUTLINE = [0x14, 0x1b, 0x1b];
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
// Paleta própria (castanho de cavalo), independente da MATS do generate.mjs — só 3 materiais.
const MATS = {
  coat: { c: ["#e0a865", "#c17f3e", "#7a4a2a"] },
  dark: { c: ["#7a4a2a", "#5c3a24", "#3a241a"] },
  mane: { c: ["#3a241a"], outline: false },
};
const MAT_NAMES = Object.keys(MATS);
const MAT_ID = Object.fromEntries(MAT_NAMES.map((n, i) => [n, i + 1]));
const MAT_RGB = MAT_NAMES.map((n) => MATS[n].c.map(hex));

class Layer {
  constructor() { this.mat = new Uint8Array(FW * FH); this.shade = new Uint8Array(FW * FH); }
  set(x, y, mat, shade = 0) {
    const X = Math.round(x) + OX, Y = Math.round(y) + OY;
    if (X < 0 || Y < 0 || X >= FW || Y >= FH) return;
    this.mat[Y * FW + X] = MAT_ID[mat]; this.shade[Y * FW + X] = shade;
  }
  h(y, x0, x1, mat, shade = 0) { for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.set(x, y, mat, shade); }
  v(x, y0, y1, mat, shade = 0) { for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) this.set(x, y, mat, shade); }
}

/** Mesmo motor de sombreamento automático (luz de cima-esquerda) + contorno de tools/addons/generate.mjs. */
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

function frameAnchors(base, col, row) {
  const a = computeAnchors(base, col, row);
  return { ...a, facing: FACINGS[col], row };
}

/** Cavalo simples em blocos: corpo atrás do personagem, 4 pernas (passo alterna por linha), cabeça+cauda nas
 *  pontas (cabeça do lado pra onde o personagem olha), crina no topo do corpo. Tudo em coordenadas do frame
 *  BASE (0..15, pode sair pra fora: é a folga do overlay de 32x32). */
function drawMount(B, a) {
  const bodyTop = a.bottom - 6, bodyBot = a.bottom - 3;
  const spanL = a.maxL - 7, spanR = a.maxR + 7;
  for (let y = bodyTop; y <= bodyBot; y++) B.h(y, spanL, spanR, "coat");
  const legY0 = bodyBot + 1, step = a.row % 2 === 0 ? 0 : 1;
  B.v(spanL + 1, legY0, legY0 + 3 + step, "dark");
  B.v(spanL + 3, legY0, legY0 + 3 - step, "dark");
  B.v(spanR - 3, legY0, legY0 + 3 - step, "dark");
  B.v(spanR - 1, legY0, legY0 + 3 + step, "dark");
  const d = a.facing === "left" ? -1 : a.facing === "right" ? 1 : a.facing === "up" ? 1 : -1;
  const headX = d > 0 ? spanR : spanL, tailX = d > 0 ? spanL : spanR;
  B.v(headX, bodyTop - 3, bodyTop, "coat");
  B.h(bodyTop - 3, Math.min(headX, headX + d), Math.max(headX, headX + d), "coat");
  B.set(headX, bodyTop - 4, "dark"); // orelha
  B.v(tailX, bodyTop, bodyTop + 2, "dark"); // cauda
  B.h(bodyTop - 1, Math.min(headX, headX - 2 * d), Math.max(headX, headX - 2 * d), "mane"); // crina
}

function writePng(path, w, h, data) {
  const png = new PNG({ width: w, height: h });
  png.data = Buffer.from(data);
  writeFileSync(path, PNG.sync.write(png, { colorType: 6 }));
}

export function generateMounts() {
  mkdirSync(OUT_DIR, { recursive: true });
  const manifest = { frameWidth: FW, frameHeight: FH, mounts: {} };
  for (const o of OUTFIT_LIST) {
    const base = readSheet(join(root, "assets", o.sheet));
    const SW = COLS * FW, SH = ROWS * FH;
    const back = new Uint8Array(SW * SH * 4);
    for (let row = 0; row < ROWS; row++) for (let col = 0; col < COLS; col++) {
      const a = frameAnchors(base, col, row);
      const B = new Layer();
      drawMount(B, a);
      const br = renderLayer(B);
      for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
        const si = (y * FW + x) * 4, di = ((row * FH + y) * SW + col * FW + x) * 4;
        back[di] = br[si]; back[di + 1] = br[si + 1]; back[di + 2] = br[si + 2]; back[di + 3] = br[si + 3];
      }
    }
    const rel = `addons/mount_${o.id}_back.png`;
    writePng(join(root, "assets", rel), SW, SH, back);
    manifest.mounts[o.id] = rel;
  }
  writeFileSync(join(OUT_DIR, "mount-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log(`Montaria gerada para ${OUTFIT_LIST.length} roupas.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) generateMounts();

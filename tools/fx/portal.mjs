// Gera o portal animado do mapa (assets/fx/portal.png + portal-preview.png 4×): um vórtice roxo-lilás girando no chão do
// tile, com um brilho subindo ~1,5 tile e faíscas. Desenhado em código no estilo do pack Ninja Adventure (16 px por tile,
// contorno #141b1b, classe Cv do tools/mapgen/lemon.mjs), sem aleatório nem relógio: a mesma saída a cada execução (o
// teste packages/client/src/game/portalSprites.test.ts compara o PNG gravado com o que este script gera).
// Uso: node tools/fx/portal.mjs
//
// Folha: FRAMES quadros de FRAME_W×FRAME_H por linha, uma linha por variante (LOOKS, mesma ordem do cliente):
//   aberto   — roxo, o personagem passa;
//   trancado — vermelho, falta level/missão (o cliente troca pela regra do rótulo, portalBlockReason);
//   saida    — roxo, menor e sem coluna de luz: a volta sem requisito colada numa porta (o destaque fica na porta).
// O centro do vórtice fica em (CX, CY) do quadro; com o sprite ancorado no meio da base, na base do tile, ele cai no
// centro do tile e o brilho sobe até a metade do tile de cima.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { Cv, OL } from "../mapgen/lemon.mjs";

export const FRAME_W = 24, FRAME_H = 32, FRAMES = 10;
export const LOOKS = ["aberto", "trancado", "saida"];
const CX = 12, CY = 24;

// Rampas: fundo, escuro, médio, claro, brilho, branco. O roxo é o do cogumelo violeta do
// TilesetLemon (lemon.mjs, GLOW.violet) e da luz de portal (lightSources.ts); o vermelho é o do pack (#8a1c24, #e0394c)
// com o do rótulo trancado (#ff6b6b, portalInfo.ts).
const PAL = {
  roxo: { c: ["#2a1d45", "#4a2f78", "#7a4fa8", "#b080d8", "#f0d8ff", "#ffffff"] },
  vermelho: { c: ["#3a1520", "#8a1c24", "#e0394c", "#ff6b6b", "#ffd0c8", "#ffffff"] },
};

/**
 * Forma de cada variante: raios do vórtice (rx, ry), braços da espiral, altura da coluna de luz, riscos de luz subindo
 * e faíscas. Os braços giram 1/braços de volta por ciclo e tudo o mais fecha um ciclo inteiro: o último quadro emenda no
 * primeiro sem salto.
 */
const SHAPE = {
  aberto: { pal: "roxo", rx: 7, ry: 4.4, arms: 3, beamH: 22, streaks: 5, sparks: 6 },
  trancado: { pal: "vermelho", rx: 7, ry: 4.4, arms: 3, beamH: 12, streaks: 2, sparks: 4, grate: true },
  saida: { pal: "roxo", rx: 5, ry: 3.2, arms: 2, beamH: 0, streaks: 0, sparks: 3 },
};

const TAU = Math.PI * 2;
const frac = (v) => v - Math.floor(v);
/** Alfa em degraus (pixel art: sem degradê contínuo). */
const step = (a, n = 5) => Math.round((Math.max(0, Math.min(255, a)) / 255) * n) / n * 255;
/** Sequência fixa em [0,1) bem espalhada (razão áurea): posição/fase de riscos e faíscas, sem aleatório. */
const golden = (i, seed) => frac(i * 0.618034 + seed * 0.2718);

/** Disco do vórtice no chão, com contorno: espiral clara sobre fundo escuro, borda acesa com brilhos correndo. */
function vortex(s, c, f) {
  const cv = new Cv(FRAME_W, FRAME_H), ph = (f / FRAMES) * TAU;
  for (let y = 0; y < FRAME_H; y++) for (let x = 0; x < FRAME_W; x++) {
    const dx = (x + 0.5 - CX) / s.rx, dy = (y + 0.5 - CY) / s.ry, r = Math.hypot(dx, dy);
    if (r > 1) continue;
    const th = Math.atan2(dy, dx);
    if (r > 0.78) {
      // Borda: dois brilhos opostos dando a volta (no sentido da espiral); a beira da frente mais clara que a de trás.
      const run = Math.cos(2 * (th - ph));
      cv.set(x, y, run > 0.8 ? c[5] : run > 0.2 || dy > 0.3 ? c[4] : c[3]);
      continue;
    }
    const t = r / 0.78;
    // Espiral logarítmica: o ângulo torce com o raio; a fase gira os braços. Mais clara para a borda, funda no meio.
    const w = Math.cos(s.arms * th + 5 * Math.log(Math.max(t, 0.05)) - ph) + 0.8 * t - 0.25;
    cv.set(x, y, t < 0.18 ? c[0] : w > 1.05 ? c[4] : w > 0.55 ? c[3] : w > 0 ? c[2] : w > -0.6 ? c[1] : c[0]);
  }
  if (s.grate) grate(cv, s);
  return cv.outline(OL);
}

/**
 * Barras escuras em pé por cima do vórtice trancado: além da cor, a forma diz "fechado" (quem não distingue bem vermelho
 * de roxo também vê). Só sobre o disco; o contorno fecha as pontas.
 */
function grate(cv, s) {
  for (let y = CY - Math.ceil(s.ry); y <= CY + Math.ceil(s.ry); y++) for (const x of [CX - 4, CX - 1, CX + 2]) if (cv.get(x, y)[3]) cv.set(x, y, OL);
}

/** Coluna de luz subindo do vórtice: um véu claro que afina e some no alto, mais riscos de luz subindo por ela. */
function beam(cv, s, c, f) {
  if (!s.beamH) return;
  for (let y = CY - 2; y >= CY - s.beamH; y--) {
    const h = (CY - 2 - y) / (s.beamH - 2), hw = (s.rx - 0.5) * (1 - 0.4 * h);
    for (let x = 0; x < FRAME_W; x++) {
      const u = Math.abs(x + 0.5 - CX) / hw;
      if (u < 1) cv.over(x, y, c[4], step(90 * (1 - h) * (1 - u * u)));
    }
  }
  for (let i = 0; i < s.streaks; i++) {
    const g = golden(i, 3), x = CX + Math.round((g - 0.5) * 2 * (s.rx - 2.5)), len = 3 + (i % 2);
    const t = frac(f / FRAMES + golden(i, 7)), top = CY - 3 - Math.round(t * (s.beamH - 2));
    for (let k = 0; k < len; k++) {
      const yy = top + k, fade = 1 - t * 0.85;
      if (yy < CY - s.beamH || yy > CY - 2) continue;
      cv.over(x, yy, k === 0 ? c[5] : c[4], step(235 * fade * (1 - k / (len + 1))));
    }
  }
}

/** Faíscas subindo e piscando; cada uma com coluna, fase e altura próprias (fixas: o laço fecha no quadro FRAMES). */
function sparks(cv, s, c, f, seed) {
  for (let i = 0; i < s.sparks; i++) {
    const g = golden(i, seed), x0 = CX + Math.round((g - 0.5) * 2 * (s.rx - 0.5));
    const rise = s.beamH ? 17 + Math.round(g * 10) : 8 + Math.round(g * 4);
    const t = frac(f / FRAMES + golden(i, seed + 11));
    if (t > 0.9) continue; // some no alto antes de renascer embaixo
    const y = CY - 2 - Math.round(t * rise), x = x0 + Math.round(Math.sin(TAU * (t + g)) * 1.4);
    cv.set(x, y, t < 0.4 ? c[5] : t < 0.7 ? c[4] : c[3]);
    // Brilho em cruz em metade delas, a meio caminho.
    if (i % 2 === 0 && t > 0.25 && t < 0.45) for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) cv.over(x + ox, y + oy, c[4], 160);
  }
}

/** Um quadro da variante `look`. */
function drawPortalFrame(look, f) {
  const s = SHAPE[look], { c } = PAL[s.pal];
  const cv = vortex(s, c, f);
  beam(cv, s, c, f);
  sparks(cv, s, c, f, LOOKS.indexOf(look) + 1);
  return cv;
}

/** A folha inteira: { width, height, data } RGBA (formato do pngjs). */
export function drawPortalSheet() {
  const width = FRAME_W * FRAMES, height = FRAME_H * LOOKS.length, data = new Uint8Array(width * height * 4);
  LOOKS.forEach((look, row) => {
    for (let f = 0; f < FRAMES; f++) {
      const cv = drawPortalFrame(look, f);
      for (let y = 0; y < FRAME_H; y++) for (let x = 0; x < FRAME_W; x++) {
        const i = (y * FRAME_W + x) * 4, j = ((row * FRAME_H + y) * width + f * FRAME_W + x) * 4;
        for (let k = 0; k < 4; k++) data[j + k] = cv.d[i + k];
      }
    }
  });
  return { width, height, data };
}

/** Lê um PNG ({ width, height, data }); usado pelo teste para comparar o arquivo gravado com o gerado. */
export function readPng(path) {
  const png = PNG.sync.read(readFileSync(path));
  return { width: png.width, height: png.height, data: new Uint8Array(png.data) };
}

/** Prévia 4× sobre fundos claro e escuro alternados por linha (conferir sem abrir o jogo). */
function preview(sheet, K = 4) {
  const pv = new PNG({ width: sheet.width * K, height: sheet.height * K });
  for (let y = 0; y < sheet.height; y++) for (let x = 0; x < sheet.width; x++) {
    const i = (y * sheet.width + x) * 4, a = sheet.data[i + 3] / 255;
    const dark = Math.floor(x / FRAME_W) % 2 === 1, chk = (x + y) & 1;
    const bg = dark ? (chk ? 44 : 52) : (chk ? 150 : 170);
    for (let dy = 0; dy < K; dy++) for (let dx = 0; dx < K; dx++) {
      const j = ((y * K + dy) * pv.width + x * K + dx) * 4;
      for (let k = 0; k < 3; k++) pv.data[j + k] = Math.round(sheet.data[i + k] * a + bg * (1 - a));
      pv.data[j + 3] = 255;
    }
  }
  return pv;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const OUT = fileURLToPath(new URL("../../assets/fx/", import.meta.url));
  mkdirSync(OUT, { recursive: true });
  const sheet = drawPortalSheet();
  const png = new PNG({ width: sheet.width, height: sheet.height });
  png.data.set(sheet.data);
  writeFileSync(`${OUT}portal.png`, PNG.sync.write(png));
  writeFileSync(`${OUT}portal-preview.png`, PNG.sync.write(preview(sheet)));
  console.log(`assets/fx/portal.png: ${sheet.width}x${sheet.height} (${FRAMES} quadros de ${FRAME_W}x${FRAME_H} × ${LOOKS.join(", ")})`);
}

// Monta assets/mounts/<id>.png a partir das folhas de arte real em assets/mounts/_source/ (pack "Horse Sprite
// With Rider Asset Pack" de onfe, itch.io, gratuito — sem licença explícita no pacote; uso em jogo privado de
// LAN para ~10 pessoas, sem redistribuição). Todas as cores vêm do mesmo template (mesma grade de coordenadas),
// só a paleta muda — por isso MOUNTS reaproveita ROWS/FRAME_*/SCALE pra todas.
//
// A folha de origem (720x1152) tem duas escalas diferentes: uma vista de perfil grande ("de lado",
// usada em telas de batalha) e uma vista de cima pequena ("de frente"/"de costas", usada no mapa).
// Pra não misturar proporções (o problema do pony antigo, desenhado à mão), extraímos 4 frames de
// cada direção dessas linhas já prontas e montamos no grid que o cliente espera: colunas
// baixo/cima/esquerda/direita, linhas = frame do ciclo de passo.
//
//   node tools/mounts/generate.mjs

import { PNG } from "pngjs";
import fs from "fs";
import path from "path";

/** id (bate com MOUNT_LIST em shared/data/mounts.ts) → arquivo-fonte em assets/mounts/_source/. */
const MOUNTS = {
  pony: "horse_socks_beige_blacksaddle.png",
  black: "horse_fullcolor_black_blacksaddle.png",
  brown: "horse_fullcolor_brown_blacksaddle.png",
  paint: "horse_paint_black_blacksaddle.png",
  white: "horse_fullcolor_white_blacksaddle.png",
};

// A arte de origem é desenhada numa escala bem maior que o personagem (tile 16x16 do Ninja Adventure):
// sem reduzir, o cavalo ficava gigantesco, com o personagem parecendo andar entre as patas dele.
const SCALE = 0.5;
// ATENÇÃO: estes 3 números têm que bater com MOUNT_FRAME_W/MOUNT_FRAME_H/MOUNT_ANCHOR_Y em
// packages/client/src/game/sprites.ts — mudou aqui, muda lá (o Phaser recorta a folha com os valores de lá).
const FRAME_W = 36;
const FRAME_H = 40;
const ANCHOR_Y = FRAME_H - 6; // linha do chão (cascos) dentro do frame
const PITCH = 80;

// linha, intervalo y e colunas escolhidas (4 frames) pra cada direção, já verificadas na folha-fonte (mesmo
// template pras 5 cores). De lado a folha tem 5 variações: 1ª (y19/339) quase parada, 2ª (trote, y83/403) com a
// cabeça baixando sem voltar (ciclo quebrado ao repetir), 3ª (y147/467) é o passo de verdade — cabeça numa
// altura só, perna alternando num ciclo que fecha bonito. É essa que entra aqui.
const ROWS = {
  down: { y0: 716, y1: 766, cols: [0, 2, 4, 6] },
  up: { y0: 963, y1: 1023, cols: [0, 2, 4, 6] },
  left: { y0: 467, y1: 511, cols: [0, 2, 4, 6] },
  right: { y0: 147, y1: 191, cols: [0, 2, 4, 6] },
};
const FACING_COL = { down: 0, up: 1, left: 2, right: 3 };
// De frente/costas a folha desenha o cavalo bem mais alto que de perfil (cabeça/orelhas bem acima do lombo): sem
// cortar, a cabeça sobe mais que o personagem montado (riderRise é fixo, não varia por direção) e fica flutuando
// sozinha acima da cabeça dele. Corta a cabeça/orelhas, mantendo corpo+pernas (visível e correto do lado da base).
const MAX_SRC_H = { down: 32, up: 32 };

function bboxInSlot(src, SW, col, y0, y1) {
  const A = (x, y) => (x < 0 || x >= SW || y < 0 || y >= src.height) ? 0 : src.data[(y * SW + x) * 4 + 3];
  const x0 = col * PITCH, x1 = x0 + PITCH - 1;
  let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (A(x, y) > 10) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  return minX > maxX ? null : { x0: minX, y0: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/** Reduz um retângulo da fonte por `SCALE`, com média de cor ponderada por alfa (evita borda suja). */
function boxDownsample(src, SW, x0, y0, w, h, dw, dh) {
  const out = new Uint8ClampedArray(dw * dh * 4);
  for (let oy = 0; oy < dh; oy++) {
    const sy1 = y0 + Math.floor((oy * h) / dh), sy2 = Math.max(sy1 + 1, y0 + Math.floor(((oy + 1) * h) / dh));
    for (let ox = 0; ox < dw; ox++) {
      const sx1 = x0 + Math.floor((ox * w) / dw), sx2 = Math.max(sx1 + 1, x0 + Math.floor(((ox + 1) * w) / dw));
      let r = 0, g = 0, b = 0, aSum = 0, n = 0;
      for (let y = sy1; y < sy2; y++) {
        for (let x = sx1; x < sx2; x++) {
          const si = (y * SW + x) * 4;
          const a = src.data[si + 3];
          r += src.data[si] * a; g += src.data[si + 1] * a; b += src.data[si + 2] * a; aSum += a; n++;
        }
      }
      const di = (oy * dw + ox) * 4;
      if (aSum > 0) { out[di] = r / aSum; out[di + 1] = g / aSum; out[di + 2] = b / aSum; }
      out[di + 3] = aSum / n;
    }
  }
  return out;
}

function buildMount(id, srcFile) {
  const src = PNG.sync.read(fs.readFileSync(path.resolve("assets/mounts/_source", srcFile)));
  const SW = src.width;
  const out = new PNG({ width: FRAME_W * 4, height: FRAME_H * 4 });

  for (const [facing, { y0, y1, cols }] of Object.entries(ROWS)) {
    const col = FACING_COL[facing];
    cols.forEach((srcCol, frame) => {
      let bb = bboxInSlot(src, SW, srcCol, y0, y1);
      if (!bb) throw new Error(`${id}: frame vazio em ${facing} col ${srcCol}`);
      const maxH = MAX_SRC_H[facing];
      if (maxH && bb.h > maxH) bb = { x0: bb.x0, y0: bb.y0 + (bb.h - maxH), w: bb.w, h: maxH };
      const dw = Math.max(1, Math.round(bb.w * SCALE)), dh = Math.max(1, Math.round(bb.h * SCALE));
      const small = boxDownsample(src, SW, bb.x0, bb.y0, bb.w, bb.h, dw, dh);
      const dstX0 = col * FRAME_W + Math.round((FRAME_W - dw) / 2);
      const dstY0 = frame * FRAME_H + (ANCHOR_Y - dh);
      for (let y = 0; y < dh; y++) {
        for (let x = 0; x < dw; x++) {
          const si = (y * dw + x) * 4;
          const di = ((dstY0 + y) * out.width + (dstX0 + x)) * 4;
          out.data[di] = small[si]; out.data[di + 1] = small[si + 1];
          out.data[di + 2] = small[si + 2]; out.data[di + 3] = small[si + 3];
        }
      }
    });
  }

  const outPath = path.resolve("assets/mounts", `${id}.png`);
  fs.writeFileSync(outPath, PNG.sync.write(out));
  console.log("escrito", outPath, out.width + "x" + out.height);

  // preview 8x com linha de âncora, pra conferência visual rápida
  const PREVIEW_SCALE = 8;
  const preview = new PNG({ width: out.width * PREVIEW_SCALE, height: out.height * PREVIEW_SCALE });
  for (let y = 0; y < out.height; y++) {
    for (let x = 0; x < out.width; x++) {
      const si = (y * out.width + x) * 4;
      for (let sy = 0; sy < PREVIEW_SCALE; sy++) for (let sx = 0; sx < PREVIEW_SCALE; sx++) {
        const di = ((y * PREVIEW_SCALE + sy) * preview.width + (x * PREVIEW_SCALE + sx)) * 4;
        preview.data[di] = out.data[si]; preview.data[di + 1] = out.data[si + 1];
        preview.data[di + 2] = out.data[si + 2]; preview.data[di + 3] = out.data[si + 3];
      }
    }
  }
  for (let frame = 0; frame < 4; frame++) {
    const y = (frame * FRAME_H + ANCHOR_Y) * PREVIEW_SCALE;
    for (let x = 0; x < preview.width; x++) {
      const di = (y * preview.width + x) * 4;
      preview.data[di] = 255; preview.data[di + 1] = 0; preview.data[di + 2] = 0; preview.data[di + 3] = 180;
    }
  }
  fs.writeFileSync(path.resolve("assets/mounts", `${id}-preview.png`), PNG.sync.write(preview));
}

for (const [id, srcFile] of Object.entries(MOUNTS)) buildMount(id, srcFile);

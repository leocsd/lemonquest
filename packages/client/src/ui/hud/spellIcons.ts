// Ícones pixel-art das magias, desenhados em canvas (16x16, contorno automático, paleta do elemento).
import type { SpellFx, SpellTarget } from "@lemonquest/shared";
import { cssColor, PAL } from "../../game/spellPalette.ts";

type Put = (x: number, y: number, c: string) => void;
type Draw = (p: Put) => void;

const line = (p: Put, x0: number, y0: number, x1: number, y1: number, c: string, w = 1) => {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= n; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / n), y = Math.round(y0 + ((y1 - y0) * i) / n);
    for (let d = 0; d < w; d++) p(x + (Math.abs(x1 - x0) < Math.abs(y1 - y0) ? d : 0), y + (Math.abs(x1 - x0) < Math.abs(y1 - y0) ? 0 : d), c);
  }
};
const rect = (p: Put, x: number, y: number, w: number, h: number, c: string) => {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) p(x + i, y + j, c);
};
const art = (p: Put, rows: string[], map: Record<string, string>) => {
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (map[ch]) p(x, y, map[ch]); }));
};

const GLYPHS: Record<SpellFx, (m: Record<"a" | "b" | "c" | "w", string>) => Draw> = {
  fire: (m) => (p) => art(p, [
    "......a.......",
    ".....aa.......",
    ".....aaa..a...",
    "....aabaa.aa..",
    "...aabbbaaaaa.",
    "...aabbbbbaaa.",
    "..aabbbbbbbaa.",
    "..aabbwwbbbaa.",
    "..aabwwwwbbaa.",
    "..aabwwwwbbaa.",
    "...aabwwbbaa..",
    "...caabbbaac..",
    "....ccaaacc...",
    "......ccc.....",
  ], m),
  ice: (m) => (p) => {
    rect(p, 6, 0, 2, 14, m.a); rect(p, 0, 6, 14, 2, m.a);
    line(p, 2, 2, 11, 11, m.a); line(p, 11, 2, 2, 11, m.a);
    for (const [x, y] of [[4, 1], [9, 1], [4, 12], [9, 12], [1, 4], [1, 9], [12, 4], [12, 9]]) p(x, y, m.b);
    rect(p, 5, 5, 4, 4, m.b); rect(p, 6, 6, 2, 2, m.w);
  },
  energy: (m) => (p) => art(p, [
    ".........aa...",
    "........aaa...",
    ".......aaa....",
    "......aaab....",
    ".....aaabb....",
    "....aaaabbbbb.",
    ".....aaaabbb..",
    ".......aabb...",
    "......aabb....",
    ".....aab......",
    "....aab.......",
    "...ab.........",
    "..a...........",
  ], m),
  earth: (m) => (p) => art(p, [
    "..........aaa.",
    ".......aaaabaa",
    ".....aaabbbbaa",
    "....aabbbbbbaa",
    "...aabbbbbbbaa",
    "...aabbbbbbaa.",
    "..aabbbbbbaa..",
    "..aabbbbbaa...",
    ".aabbbbaaa....",
    ".aabbaaa......",
    "aaabaa........",
    "ccaa..........",
    "cc............",
  ], m),
  holy: (m) => (p) => {
    rect(p, 6, 0, 2, 14, m.a); rect(p, 2, 4, 10, 2, m.a);
    rect(p, 6, 1, 2, 12, m.b); rect(p, 3, 4, 8, 2, m.b); rect(p, 6, 4, 2, 2, m.w);
    for (const [x, y] of [[1, 1], [12, 1], [1, 11], [12, 11], [3, 8], [10, 8]]) p(x, y, m.a);
  },
  death: (m) => (p) => art(p, [
    "....bbbbbb....",
    "..bbbbbbbbbb..",
    ".bbbbbbbbbbbb.",
    ".bbbbbbbbbbbb.",
    ".bbccbbbbccbb.",
    ".bbccbbbbccbb.",
    ".bbbbbbbbbbbb.",
    "..bbbbccbbbb..",
    "...bbbbbbbb...",
    "...bbabbabb...",
    "...bbabbabb...",
    "....aaaaaa....",
  ], m),
  physical: (m) => (p) => {
    line(p, 3, 10, 12, 1, m.b, 2); line(p, 4, 11, 13, 2, m.c);
    line(p, 2, 7, 7, 12, m.a, 1); line(p, 3, 7, 7, 11, m.a);
    rect(p, 0, 12, 2, 2, m.c); p(11, 2, m.w); p(10, 3, m.w);
  },
  heal: (m) => (p) => {
    rect(p, 5, 1, 4, 12, m.a); rect(p, 1, 5, 12, 4, m.a);
    rect(p, 6, 2, 2, 10, m.b); rect(p, 2, 6, 10, 2, m.b); rect(p, 6, 6, 2, 2, m.w);
  },
  buff: (m) => (p) => {
    for (let i = 0; i < 3; i++) {
      line(p, 1, 5 + i * 4, 7, 0 + i * 4 - (i ? 0 : 0) + 0, i === 0 ? m.w : i === 1 ? m.b : m.a, 2);
      line(p, 7, 0 + i * 4, 12, 5 + i * 4, i === 0 ? m.w : i === 1 ? m.b : m.a, 2);
    }
  },
  arrow: (m) => (p) => {
    line(p, 2, 11, 11, 2, m.a); line(p, 3, 11, 12, 2, m.c);
    line(p, 11, 1, 11, 7, m.b, 2); line(p, 6, 1, 11, 1, m.b); line(p, 6, 2, 11, 2, m.b);
    line(p, 1, 12, 1, 8, m.w); line(p, 1, 12, 5, 12, m.w); line(p, 2, 10, 2, 8, m.c);
  },
  summon: (m) => (p) => {
    for (let y = 0; y < 14; y++) for (let x = 0; x < 14; x++) {
      const d = Math.hypot(x - 6.5, y - 6.5);
      if (d >= 5 && d <= 6.6) p(x, y, m.a);
      else if (d >= 2.4 && d <= 3.6) p(x, y, m.b);
      if (d < 1.6) p(x, y, m.w);
    }
    for (const [x, y] of [[6, 0], [7, 13], [0, 7], [13, 6]]) p(x, y, m.w);
    line(p, 6, 3, 10, 6, m.a); line(p, 4, 6, 6, 10, m.a);
  },
  taunt: (m) => (p) => {
    rect(p, 6, 1, 2, 7, m.b); rect(p, 6, 10, 2, 2, m.b); rect(p, 6, 1, 2, 2, m.w);
    for (const dx of [-1, 1]) {
      const cx = dx < 0 ? 3 : 10;
      line(p, cx, 3, cx, 9, m.a); line(p, cx + dx * 2, 4, cx + dx * 2, 8, m.c);
    }
  },
  root: (m) => (p) => {
    const spike = (cx: number, h: number, w: number) => {
      for (let y = 0; y < h; y++) {
        const half = Math.round(w * (1 - y / h));
        for (let x = -half; x <= half; x++) p(cx + x, 12 - y, x < 0 ? m.b : m.a);
      }
    };
    spike(3, 8, 2); spike(7, 12, 3); spike(11, 7, 2);
    rect(p, 0, 12, 14, 2, m.c);
  },
  charge: (m) => (p) => {
    line(p, 0, 3, 6, 3, m.c); line(p, 1, 7, 7, 7, m.a); line(p, 0, 11, 6, 11, m.c);
    line(p, 6, 1, 12, 7, m.b, 2); line(p, 12, 7, 6, 13, m.b, 2);
    line(p, 3, 3, 8, 7, m.a); line(p, 8, 7, 3, 11, m.a);
  },
  // Fada: estrela de quatro pontas com miolo branco e duas estrelinhas.
  sparkle: (m) => (p) => art(p, [
    "......a.......",
    "......a....a..",
    ".....aba..aaa.",
    ".....aba...a..",
    "....abwba.....",
    "aaaaabwbaaaaa.",
    ".aaabwwwbaaa..",
    "...aabwbaa....",
    "....abwba.....",
    ".a...aba......",
    "aaa..aba......",
    ".a....a.......",
    "......a.......",
    "..............",
  ], m),
};

const cache = new Map<string, string>();

/** Data URL do ícone da magia (cacheado). `target` adiciona um selinho: área, onda ou grupo. */
export function spellIcon(fx: SpellFx, target: SpellTarget): string {
  const key = `${fx}:${target}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const pal = PAL[fx] ?? PAL.physical;
  const m = { a: cssColor(pal.main), b: cssColor(pal.light), c: cssColor(pal.dark), w: "#ffffff" };
  const W = 16;
  const grid: (string | null)[] = Array(W * W).fill(null);
  const put: Put = (x, y, c) => { x += 1; y += 1; if (x >= 0 && y >= 0 && x < W && y < W) grid[y * W + x] = c; };
  (GLYPHS[fx] ?? GLYPHS.physical)(m)(put);
  const c = document.createElement("canvas");
  c.width = c.height = W;
  const ctx = c.getContext("2d")!;
  const px = (x: number, y: number, col: string) => { ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1); };
  // Contorno escuro de 1px ao redor de tudo (coesão entre os ícones).
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    if (grid[y * W + x]) continue;
    let near = false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < W && ny < W && grid[ny * W + nx]) near = true;
    }
    if (near) px(x, y, "#0b0d13");
  }
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) { const g = grid[y * W + x]; if (g) px(x, y, g); }
  // Selinho do tipo de alvo (canto inferior esquerdo).
  const mark: [number, number][] =
    target === "area_self" || target === "area_target" ? [[1, 13], [0, 14], [2, 14], [1, 15]]
      : target === "wave" ? [[0, 13], [1, 14], [2, 15], [2, 13]]
        : target === "party" ? [[0, 14], [2, 14], [1, 13], [1, 15]] : [];
  for (const [x, y] of mark) { px(x - 1 < 0 ? x : x, y, "#0b0d13"); }
  for (const [x, y] of mark) px(x, y, "#ffffff");
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}

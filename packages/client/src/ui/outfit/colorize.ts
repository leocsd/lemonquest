// Tingimento das roupas no cliente: aplica colorizePixel (shared) a uma sheet inteira, uma vez por (sheet, tom). O mesmo
// canvas serve à prévia da janela (OutfitCanvas) e às texturas do mundo (game/sprites.ts), então os dois batem.
import { colorizePixel } from "@lemonquest/shared";

/** Tinge pixels RGBA no lugar (alpha intacto). Pixel art tem poucas cores: memoriza o resultado por cor. */
export function colorizeData(data: Uint8ClampedArray, tone: number): void {
  const memo = new Map<number, number>();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const key = (data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!;
    let out = memo.get(key);
    if (out === undefined) {
      const [r, g, b] = colorizePixel(data[i]!, data[i + 1]!, data[i + 2]!, tone);
      out = (r << 16) | (g << 8) | b;
      memo.set(key, out);
    }
    data[i] = out >> 16;
    data[i + 1] = (out >> 8) & 255;
    data[i + 2] = out & 255;
  }
}

const cache = new Map<string, HTMLCanvasElement>();

/** Cópia tingida de uma imagem já carregada, cacheada por (chave, tom). A chave identifica a imagem (src ou textura). */
export function colorizedCanvas(img: HTMLImageElement | HTMLCanvasElement, key: string, tone: number): HTMLCanvasElement {
  const id = `${key}|${tone}`;
  let c = cache.get(id);
  if (c) return c;
  c = document.createElement("canvas");
  c.width = img instanceof HTMLImageElement ? img.naturalWidth : img.width;
  c.height = img instanceof HTMLImageElement ? img.naturalHeight : img.height;
  const cx = c.getContext("2d")!;
  cx.drawImage(img, 0, 0);
  const px = cx.getImageData(0, 0, c.width, c.height);
  colorizeData(px.data, tone);
  cx.putImageData(px, 0, 0);
  cache.set(id, c);
  return c;
}

const css = ([r, g, b]: [number, number, number]) => `rgb(${r} ${g} ${b})`;

/** Amostra do tom como ele fica na roupa: brilho, meio-tom e sombra pela mesma conta do tingimento. */
export function swatchBackground(color: number): string {
  const at = (v: number) => css(colorizePixel(v, v, v, color));
  return `radial-gradient(circle at 34% 30%, ${at(220)} 0 12%, ${at(153)} 48%, ${at(70)} 100%)`;
}

/** Amostra do "Natural": cores originais do pack (vermelho, loiro, verde, azul) em vez de uma cor só. */
export const NATURAL_SWATCH = "conic-gradient(from 45deg, #d14b34 0 25%, #f1c471 0 50%, #5f7160 0 75%, #5560b8 0)";

/**
 * Ordem de exibição dos tons: os vivos pelo matiz (arco-íris), depois os neutros (escuros/terrosos, e por fim os cinzas,
 * do claro ao escuro). Assim a grade não depende da ordem do catálogo, que só cresce no fim.
 */
export function swatchOrder<T extends { color: number }>(tones: readonly T[]): T[] {
  const key = (c: number) => {
    const r = ((c >> 16) & 255) / 255, g = ((c >> 8) & 255) / 255, b = (c & 255) / 255;
    const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
    if (d < 0.2) return 2000 - max; // cinza
    if (max < 0.6) return 1000 - max; // escuro/terroso
    const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return h * 60;
  };
  return [...tones].sort((a, b) => key(a.color) - key(b.color));
}

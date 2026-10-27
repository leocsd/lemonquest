// Desenha uma roupa (base + addons) num <canvas>, pixel a pixel, para a janela de roupas e a lista de personagens.
import { useEffect, useRef, useState } from "preact/hooks";
import {
  ADDON_FRAME, ADDON_OFFSET_X, ADDON_OFFSET_Y, activeAddons, addonLayers, outfitSheet, type Facing, type OutfitDef, type Sex,
} from "@lemonquest/shared";
import { colorizedCanvas } from "./colorize.ts";

const COL: Record<Facing, number> = { down: 0, up: 1, left: 2, right: 3 };
/** Recorte (px do frame do overlay) mostrado: folga para chapéus e cajados sem desperdiçar espaço. */
const CROP = { x: 3, y: 2, w: 26, h: 28 };

const cache = new Map<string, HTMLImageElement>();
const waiters = new Map<string, Set<() => void>>();

/** Imagem tingida pelo tom (colorize.ts: a mesma conta das texturas do mundo). Natural (0xffffff) = a própria imagem. */
function toned(img: HTMLImageElement, tone: number): HTMLImageElement | HTMLCanvasElement {
  return tone === 0xffffff ? img : colorizedCanvas(img, img.src, tone);
}

function image(url: string, onLoad: () => void): HTMLImageElement | null {
  const full = `${import.meta.env.BASE_URL}${url}`;
  let img = cache.get(full);
  if (!img) {
    img = new Image();
    img.src = full;
    cache.set(full, img);
    img.onload = () => { for (const fn of waiters.get(full) ?? []) fn(); waiters.delete(full); };
  }
  if (img.complete && img.naturalWidth > 0) return img;
  let w = waiters.get(full);
  if (!w) { w = new Set(); waiters.set(full, w); }
  w.add(onLoad);
  return null;
}

export interface OutfitCanvasProps {
  outfit: OutfitDef;
  addons: number;
  facing?: Facing;
  /** Linha da sheet (0–3 = ciclo de caminhada). */
  row?: number;
  scale?: number;
  /** Recorte mais justo (só o personagem), para retratos pequenos. */
  tight?: boolean;
  /** Cor do tom de tingimento (toneColor; ausente/0xffffff = cor natural). */
  tone?: number;
  /** Sexo: sheet feminina e overlays dela, se a roupa tiver (ausente = masculino). */
  sex?: Sex;
  class?: string;
}

export function OutfitCanvas({ outfit, addons, facing = "down", row = 0, scale = 4, tight, tone = 0xffffff, sex, class: cls }: OutfitCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [, bump] = useState(0);
  const crop = tight ? { x: 6, y: 4, w: 20, h: 26 } : CROP;
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, cv.width, cv.height);
    const redraw = () => bump((n) => n + 1);
    const on = activeAddons(outfit, addons).map((a) => addonLayers(a, sex));
    const backs = on.filter((a) => a.backSheet).map((a) => image(a.backSheet!, redraw));
    const base = image(outfitSheet(outfit, sex), redraw);
    const fronts = on.map((a) => image(a.sheet, redraw));
    if (!base || backs.includes(null) || fronts.includes(null)) return;
    const col = COL[facing], r = Math.max(0, Math.min(6, row));
    const overlay = (img: HTMLImageElement | HTMLCanvasElement) => ctx.drawImage(
      img, col * ADDON_FRAME + crop.x, r * ADDON_FRAME + crop.y, crop.w, crop.h, 0, 0, crop.w * scale, crop.h * scale,
    );
    for (const b of backs) overlay(toned(b!, tone));
    ctx.drawImage(toned(base, tone), col * 16, r * 16, 16, 16, (ADDON_OFFSET_X - crop.x) * scale, (ADDON_OFFSET_Y - crop.y) * scale, 16 * scale, 16 * scale);
    for (const f of fronts) overlay(toned(f!, tone));
  });
  return <canvas ref={ref} class={cls} width={crop.w * scale} height={crop.h * scale} style={{ imageRendering: "pixelated" }} />;
}

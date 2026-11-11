// Desenha uma roupa (base + addons, opcionalmente montado) num <canvas>, pixel a pixel, para a janela de roupas e a
// lista de personagens.
import { useEffect, useRef, useState } from "preact/hooks";
import { ADDON_FRAME, ADDON_OFFSET_X, ADDON_OFFSET_Y, activeAddons, mountDef, type Facing, type OutfitDef } from "@lemonquest/shared";
import { MOUNT_ANCHOR_Y, MOUNT_FRAME_H, MOUNT_FRAME_W, MOUNT_RIDER_RISE } from "../../game/sprites.ts";

const COL: Record<Facing, number> = { down: 0, up: 1, left: 2, right: 3 };
/** Recorte (px do frame do overlay) mostrado: folga para chapéus e cajados sem desperdiçar espaço. */
const CROP = { x: 3, y: 2, w: 26, h: 28 };
/** Pé do personagem (centro-base do frame 16x16) no espaço do frame de addon (32x32): onde a montaria se ancora. */
const FEET = { x: ADDON_OFFSET_X + 8, y: ADDON_OFFSET_Y + 16 };

const cache = new Map<string, HTMLImageElement>();
const waiters = new Map<string, Set<() => void>>();
const tintCache = new Map<string, HTMLCanvasElement>();

/** Imagem tingida (multiply + recorte pelo alpha original), cacheada por (src, cor). Natural (0xffffff) = sem cópia. */
function tinted(img: HTMLImageElement, tint: number): HTMLImageElement | HTMLCanvasElement {
  if (tint === 0xffffff) return img;
  const key = `${img.src}|${tint}`;
  let c = tintCache.get(key);
  if (c) return c;
  c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const cx = c.getContext("2d")!;
  cx.drawImage(img, 0, 0);
  cx.globalCompositeOperation = "multiply";
  cx.fillStyle = `#${tint.toString(16).padStart(6, "0")}`;
  cx.fillRect(0, 0, c.width, c.height);
  cx.globalCompositeOperation = "destination-in";
  cx.drawImage(img, 0, 0);
  tintCache.set(key, c);
  return c;
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
  /** Tom de tingimento (0xRRGGBB; ausente/0xffffff = cor natural). */
  tint?: number;
  /** Montaria ativa (id de MOUNT_LIST); "" ou ausente = a pé. A janela cresce pra caber os dois. */
  mount?: string;
  class?: string;
}

export function OutfitCanvas({ outfit, addons, facing = "down", row = 0, scale = 4, tight, tint = 0xffffff, mount, class: cls }: OutfitCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [, bump] = useState(0);
  // Recorte usado pra AMOSTRAR addon/base na própria folha (fixo, nunca passa do frame 32x32 deles).
  const sampleCrop = tight ? { x: 6, y: 4, w: 20, h: 26 } : CROP;
  const m = mount ? mountDef(mount) : undefined;
  // Montado, o personagem (e addons normais) sobem pro lombo da montaria, igual ao mundo (actor.ts/riderRise).
  const charY = sampleCrop.y - (m ? MOUNT_RIDER_RISE : 0);
  // Janela de SAÍDA (onde cada camada cai no canvas): igual ao recorte de amostra, ou maior se tem montaria embaixo.
  let win = sampleCrop;
  if (m) {
    const mx0 = FEET.x - MOUNT_FRAME_W / 2, my0 = FEET.y - MOUNT_ANCHOR_Y;
    const x0 = Math.min(sampleCrop.x, mx0), y0 = Math.min(charY, my0);
    const x1 = Math.max(sampleCrop.x + sampleCrop.w, mx0 + MOUNT_FRAME_W), y1 = Math.max(charY + sampleCrop.h, my0 + MOUNT_FRAME_H);
    win = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, cv.width, cv.height);
    const redraw = () => bump((n) => n + 1);
    const on = activeAddons(outfit, addons);
    const backs = on.filter((a) => a.backSheet).map((a) => image(a.backSheet!, redraw));
    const base = image(outfit.sheet, redraw);
    const fronts = on.map((a) => image(a.sheet, redraw));
    const mountImg = m ? image(m.sheet, redraw) : null;
    if (!base || backs.includes(null) || fronts.includes(null) || (m && !mountImg)) return;
    // Montado, o personagem fica sentado (parado): só a montaria cicla as pernas, não os dois ao mesmo tempo.
    const col = COL[facing], r = m ? 0 : Math.max(0, Math.min(6, row));
    // Montado, só trocar o frame da perna não lê como "andando" (o conjunto fica parado no lugar): acrescenta um
    // balanço vertical de 1px no rig inteiro (cavalo + cavaleiro), em fase com o ciclo de passo.
    const bob = m && row % 2 === 1 ? scale : 0;
    const shiftX = (sampleCrop.x - win.x) * scale, shiftY = (charY - win.y) * scale - bob;
    const overlay = (img: HTMLImageElement | HTMLCanvasElement) => ctx.drawImage(
      img, col * ADDON_FRAME + sampleCrop.x, r * ADDON_FRAME + sampleCrop.y, sampleCrop.w, sampleCrop.h,
      shiftX, shiftY, sampleCrop.w * scale, sampleCrop.h * scale,
    );
    if (mountImg) {
      const mr = Math.max(0, Math.min(3, row));
      const mx0 = FEET.x - MOUNT_FRAME_W / 2, my0 = FEET.y - MOUNT_ANCHOR_Y;
      ctx.drawImage(
        mountImg, col * MOUNT_FRAME_W, mr * MOUNT_FRAME_H, MOUNT_FRAME_W, MOUNT_FRAME_H,
        (mx0 - win.x) * scale, (my0 - win.y) * scale - bob, MOUNT_FRAME_W * scale, MOUNT_FRAME_H * scale,
      );
    }
    for (const b of backs) overlay(tinted(b!, tint));
    ctx.drawImage(
      tinted(base, tint), col * 16, r * 16, 16, 16,
      (ADDON_OFFSET_X - sampleCrop.x) * scale + shiftX, (ADDON_OFFSET_Y - sampleCrop.y) * scale + shiftY, 16 * scale, 16 * scale,
    );
    for (const f of fronts) overlay(tinted(f!, tint));
  });
  return <canvas ref={ref} class={cls} width={win.w * scale} height={win.h * scale} style={{ imageRendering: "pixelated" }} />;
}

interface Bbox { x: number; y: number; w: number; h: number }
/** Caixa do conteúdo de verdade (sem a margem reservada pras direções mais altas), por montaria. */
const mountBboxCache = new Map<string, Bbox>();

/** Mede (1x, uma vez por montaria) o retângulo com pixel visível no frame "direita, parado". */
function mountBbox(img: HTMLImageElement, id: string): Bbox {
  const cached = mountBboxCache.get(id);
  if (cached) return cached;
  const tmp = document.createElement("canvas");
  tmp.width = MOUNT_FRAME_W; tmp.height = MOUNT_FRAME_H;
  const tctx = tmp.getContext("2d")!;
  tctx.drawImage(img, COL.right * MOUNT_FRAME_W, 0, MOUNT_FRAME_W, MOUNT_FRAME_H, 0, 0, MOUNT_FRAME_W, MOUNT_FRAME_H);
  const data = tctx.getImageData(0, 0, MOUNT_FRAME_W, MOUNT_FRAME_H).data;
  let x0 = MOUNT_FRAME_W, x1 = -1, y0 = MOUNT_FRAME_H, y1 = -1;
  for (let y = 0; y < MOUNT_FRAME_H; y++) for (let x = 0; x < MOUNT_FRAME_W; x++) {
    if (data[(y * MOUNT_FRAME_W + x) * 4 + 3] > 10) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  const bb: Bbox = x1 >= x0 ? { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } : { x: 0, y: 0, w: MOUNT_FRAME_W, h: MOUNT_FRAME_H };
  mountBboxCache.set(id, bb);
  return bb;
}

/** Miniatura só da montaria (sem personagem), recortada no bicho (sem a margem de frame), pra lista de escolha. */
export function MountThumb({ mountId, scale = 2, class: cls }: { mountId: string; scale?: number; class?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [, bump] = useState(0);
  const [bb, setBb] = useState<Bbox | null>(mountBboxCache.get(mountId) ?? null);
  const m = mountDef(mountId);
  useEffect(() => {
    const cv = ref.current;
    if (!cv || !m) return;
    const img = image(m.sheet, () => bump((n) => n + 1));
    if (!img) return;
    if (!bb) { setBb(mountBbox(img, m.id)); return; }
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, cv.width, cv.height);
    // "direita", frame 0 (parado): a pose mais reconhecível pra um ícone pequeno.
    ctx.drawImage(img, COL.right * MOUNT_FRAME_W + bb.x, bb.y, bb.w, bb.h, 0, 0, bb.w * scale, bb.h * scale);
  });
  if (!m) return null;
  const w = bb?.w ?? MOUNT_FRAME_W, h = bb?.h ?? MOUNT_FRAME_H;
  return <canvas ref={ref} class={cls} width={w * scale} height={h * scale} style={{ imageRendering: "pixelated" }} />;
}

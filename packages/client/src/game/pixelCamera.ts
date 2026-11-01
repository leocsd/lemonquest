// Câmera pixel-perfect: zoom inteiro, presa ao jogador (como no Tibia), limitada ao mapa.
import Phaser from "phaser";
import { TILE_SIZE } from "@lemonquest/shared";
import { getHudInsets } from "../ui/hud/layout.ts";

/** Tiles visíveis na vertical que buscamos (~15–19). */
const TARGET_ROWS = 17;
/** Suavização do deslocamento quando o HUD abre/fecha (1/s). */
const INSET_SHARPNESS = 9;

export function zoomFor(viewHeight: number): number {
  return Math.max(1, Math.round(viewHeight / (TILE_SIZE * TARGET_ROWS)));
}

export class PixelCamera {
  zoom = 1;
  /** Centro suavizado (mundo, px). */
  private cx = 0;
  private cy = 0;
  /** Deslocamento suavizado (px de tela) para compensar o HUD. */
  private ox = 0;
  private oy = 0;

  constructor(private readonly cam: Phaser.Cameras.Scene2D.Camera, private mapW: number, private mapH: number) {
    this.fit();
  }

  /** Recalcula o zoom para o tamanho atual da janela. */
  fit() {
    this.zoom = zoomFor(this.cam.height);
    this.cam.setZoom(this.zoom);
  }

  /** Arredonda para o grid de pixels da tela. */
  snap = (v: number) => Math.round(v * this.zoom) / this.zoom;

  jumpTo(x: number, y: number) {
    this.cx = x; this.cy = y;
    const ins = getHudInsets();
    this.ox = ins.right / 2; this.oy = ins.bottom / 2;
    this.apply();
  }

  follow(x: number, y: number, dtMs: number) {
    // Presa ao jogador: o seguimento suave (lerp 12/s) deixava a tela ~0,7 tile atrás andando e deslizando ~300 ms
    // depois de parar — o mundo respondia atrasado à tecla e o boneco balançava 1–2 px em relação à tela.
    this.cx = x;
    this.cy = y;
    // Deslocamento do HUD (barra lateral) também desliza suave ao abrir/fechar.
    const ins = getHudInsets();
    const kO = 1 - Math.exp(-INSET_SHARPNESS * dtMs / 1000);
    this.ox += (ins.right / 2 - this.ox) * kO;
    this.oy += (ins.bottom / 2 - this.oy) * kO;
    if (Math.abs(ins.right / 2 - this.ox) < 0.5) this.ox = ins.right / 2;
    if (Math.abs(ins.bottom / 2 - this.oy) < 0.5) this.oy = ins.bottom / 2;
    this.apply();
  }

  /** O centro suavizado já chegou ao ponto (x,y) do mundo (follow convergiu). Usado pela sonda E2E. */
  isCenteredOn(x: number, y: number) { return Math.abs(this.cx - x) < 0.5 && Math.abs(this.cy - y) < 0.5; }

  /**
   * Tiles visíveis (inclusive) na área NÃO coberta pelo HUD (barra lateral à direita, barra de baixo), presos ao mapa.
   * Usado pela battle list ("no máximo o que aparece na tela").
   */
  visibleTiles(tile: number): { x0: number; y0: number; x1: number; y1: number } {
    const ins = getHudInsets();
    const halfW = this.cam.width / 2 / this.zoom, halfH = this.cam.height / 2 / this.zoom;
    const cx = this.cam.scrollX + this.cam.width / 2, cy = this.cam.scrollY + this.cam.height / 2;
    const left = cx - halfW, top = cy - halfH;
    const right = cx + halfW - ins.right / this.zoom, bottom = cy + halfH - ins.bottom / this.zoom;
    const maxX = Math.floor(this.mapW / tile) - 1, maxY = Math.floor(this.mapH / tile) - 1;
    return {
      x0: Math.max(0, Math.floor(left / tile)), y0: Math.max(0, Math.floor(top / tile)),
      x1: Math.min(maxX, Math.floor((right - 1) / tile)), y1: Math.min(maxY, Math.floor((bottom - 1) / tile)),
    };
  }

  /** Mundo → tela (px CSS do canvas). Válido depois de follow/jumpTo neste frame. */
  toScreenX(wx: number) { return (wx - this.cam.scrollX - this.cam.width / 2) * this.zoom + this.cam.width / 2; }
  toScreenY(wy: number) { return (wy - this.cam.scrollY - this.cam.height / 2) * this.zoom + this.cam.height / 2; }

  private apply() {
    const halfW = this.cam.width / 2 / this.zoom, halfH = this.cam.height / 2 / this.zoom;
    const clamp = (c: number, half: number, size: number) =>
      size <= half * 2 ? size / 2 : Phaser.Math.Clamp(c, half, size - half);
    // O alvo fica no centro da área NÃO coberta pelo HUD: desloca o centro da câmera por inset/2 (px de tela).
    // Alvo e deslocamento arredondados à parte, como o ator (snap(rx)): o boneco fica parado na tela, sem tremer 1 px.
    const x = this.snap(clamp(this.snap(this.cx) + this.snap(this.ox / this.zoom), halfW, this.mapW));
    const y = this.snap(clamp(this.snap(this.cy) + this.snap(this.oy / this.zoom), halfH, this.mapH));
    this.cam.setScroll(x - this.cam.width / 2, y - this.cam.height / 2);
  }
}

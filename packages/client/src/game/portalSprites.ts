// Desenho dos portais no mapa: vórtice roxo animado no tile de cada portal (até aqui só havia o rótulo e uma luz que
// some de dia). Vermelho e gradeado enquanto o personagem não passa (a mesma regra do rótulo, portalBlockReason) e menor,
// sem coluna de luz, nas saídas sem requisito coladas numa porta (portalHasLabel falso: o destaque fica na porta). A arte
// vem de tools/fx/portal.mjs (assets/fx/portal.png). Uma animação por estado, compartilhada; fora da tela o sprite some
// e a animação pausa; com animações reduzidas fica num quadro parado.
import type Phaser from "phaser";
import { TILE_SIZE, type QuestsMsg, type WorldPortal } from "@lemonquest/shared";
import { portalBlockReason, portalHasLabel } from "./portalInfo.ts";

/** portal.png: `frames` quadros de 24x32 por linha, uma linha por estado (PORTAL_LOOKS, na mesma ordem). */
export const PORTAL_SHEET = { key: "fx-portal", url: "fx/portal.png", frameWidth: 24, frameHeight: 32, frames: 10 } as const;
export type PortalLook = "open" | "locked" | "exit";
/** Ordem das linhas do PNG (tools/fx/portal.mjs: aberto, trancado, saida). */
export const PORTAL_LOOKS: readonly PortalLook[] = ["open", "locked", "exit"];
/** 10 quadros a 10 por segundo: o vórtice dá um ciclo por segundo. */
const FPS = 10;
/** Quadro mostrado com animações reduzidas. */
const STILL_FRAME = 0;
/** Acima das camadas de chão do mapa (negativas), abaixo dos baús desenhados (4), do realce do mouse (5), do alvo (6) e dos atores (>= 26). */
const DEPTH = 3;
/** Quanto a mais que a tela (px de mundo) o sprite continua ativo: não pisca na borda ao andar. */
const CULL_MARGIN = 2 * TILE_SIZE;
/** De quanto em quanto tempo relê a opção de animações reduzidas (ms); ler a cada quadro criaria um MediaQueryList por quadro. */
const MOTION_CHECK_MS = 1000;

type QuestState = Pick<QuestsMsg, "done" | "chests"> | null | undefined;

/** Estado visual: saída discreta (sempre passa), trancado (falta level/missão/baú) ou aberto. */
export function portalLook(p: WorldPortal, level: number, quests: QuestState): PortalLook {
  if (!portalHasLabel(p)) return "exit";
  return portalBlockReason(p, level, quests) ? "locked" : "open";
}

/** Ponto de desenho (px de mundo) com origem no meio da base: o centro do vórtice (linha 24 do quadro) cai no centro do tile. */
export function portalAnchor(p: Pick<WorldPortal, "x" | "y">): { x: number; y: number } {
  return { x: (p.x + 0.5) * TILE_SIZE, y: (p.y + 1) * TILE_SIZE };
}

/** Quadro inicial por tile: portais vizinhos (porta e saída) não giram em uníssono. */
export function portalPhase(p: Pick<WorldPortal, "x" | "y">): number {
  const n = PORTAL_SHEET.frames;
  return (((p.x * 7 + p.y * 13) % n) + n) % n;
}

export const portalAnimKey = (look: PortalLook) => `portal-${look}`;

/** Índice (na folha) do quadro `f` do estado `look`. */
export function portalFrame(look: PortalLook, f: number): number {
  return PORTAL_LOOKS.indexOf(look) * PORTAL_SHEET.frames + f;
}

export interface ViewRect { x0: number; y0: number; x1: number; y1: number }

/** O quadro do portal (24x32 sobre o tile e o de cima) toca a vista? Coordenadas de mundo. */
export function portalOnScreen(p: Pick<WorldPortal, "x" | "y">, v: ViewRect): boolean {
  const a = portalAnchor(p), hw = PORTAL_SHEET.frameWidth / 2;
  return a.x + hw >= v.x0 && a.x - hw <= v.x1 && a.y >= v.y0 && a.y - PORTAL_SHEET.frameHeight <= v.y1;
}

export function preloadPortalSprites(scene: Phaser.Scene): void {
  const s = PORTAL_SHEET;
  scene.load.spritesheet(s.key, `${import.meta.env.BASE_URL}${s.url}`, { frameWidth: s.frameWidth, frameHeight: s.frameHeight });
}

interface Item {
  p: WorldPortal;
  spr: Phaser.GameObjects.Sprite;
  /** Estado e modo (animado/parado) aplicados ao sprite; null = ainda não pintado. */
  look: PortalLook | null;
  animated: boolean;
  /** Level/missões/opção de movimento mudaram desde a última pintura: recalcula quando entrar na tela. */
  dirty: boolean;
  on: boolean;
}

export interface PortalSpriteDeps {
  quests: () => QuestState;
  reducedMotion: () => boolean;
}

export class PortalSprites {
  private readonly items: Item[] = [];
  private paintedFor: { level: number; quests: QuestState } | null = null;
  private still = false;
  private motionCheckAt = 0;
  /** Reaproveitado a cada quadro (nada é criado por quadro). */
  private readonly view: ViewRect = { x0: 0, y0: 0, x1: 0, y1: 0 };

  constructor(scene: Phaser.Scene, layer: Phaser.GameObjects.Layer, portals: readonly WorldPortal[], private readonly deps: PortalSpriteDeps) {
    // Sem a textura (falha de carga) o portal segue funcionando, só sem o desenho.
    if (!scene.textures.exists(PORTAL_SHEET.key)) return;
    for (const look of PORTAL_LOOKS) {
      const key = portalAnimKey(look);
      if (scene.anims.exists(key)) continue;
      const start = portalFrame(look, 0);
      scene.anims.create({
        key, frameRate: FPS, repeat: -1,
        frames: scene.anims.generateFrameNumbers(PORTAL_SHEET.key, { start, end: start + PORTAL_SHEET.frames - 1 }),
      });
    }
    for (const p of portals) {
      const a = portalAnchor(p);
      const spr = scene.add.sprite(a.x, a.y, PORTAL_SHEET.key, 0).setOrigin(0.5, 1).setDepth(DEPTH).setVisible(false);
      layer.add(spr);
      this.items.push({ p, spr, look: null, animated: false, dirty: true, on: false });
    }
    this.still = deps.reducedMotion();
  }

  /** A cada quadro, com a câmera já posicionada: liga só os da tela e repinta quando o level ou as missões mudam. */
  update(cam: Phaser.Cameras.Scene2D.Camera, level: number, time: number): void {
    if (!this.items.length) return;
    const quests = this.deps.quests();
    let reset = !this.paintedFor || this.paintedFor.level !== level || this.paintedFor.quests !== quests;
    if (reset) this.paintedFor = { level, quests };
    if (time >= this.motionCheckAt) {
      this.motionCheckAt = time + MOTION_CHECK_MS;
      const still = this.deps.reducedMotion();
      if (still !== this.still) { this.still = still; reset = true; }
    }
    // Retângulo visível em mundo (mesma conta do lighting.ts), com folga.
    const z = cam.zoom, hw = cam.width / 2 / z, hh = cam.height / 2 / z;
    const cx = cam.scrollX + cam.width / 2, cy = cam.scrollY + cam.height / 2, v = this.view;
    v.x0 = cx - hw - CULL_MARGIN; v.x1 = cx + hw + CULL_MARGIN; v.y0 = cy - hh - CULL_MARGIN; v.y1 = cy + hh + CULL_MARGIN;
    for (const it of this.items) {
      if (reset) it.dirty = true;
      const on = portalOnScreen(it.p, v);
      if (on !== it.on) {
        it.on = on;
        it.spr.setVisible(on);
        if (it.animated) { if (on) it.spr.anims.resume(); else it.spr.anims.pause(); }
      }
      if (on && it.dirty) this.paint(it, level, quests);
    }
  }

  private paint(it: Item, level: number, quests: QuestState): void {
    it.dirty = false;
    const look = portalLook(it.p, level, quests), animated = !this.still;
    if (look === it.look && animated === it.animated) return;
    it.look = look;
    it.animated = animated;
    if (animated) it.spr.play({ key: portalAnimKey(look), startFrame: portalPhase(it.p) });
    else it.spr.stop().setFrame(portalFrame(look, STILL_FRAME));
  }
}

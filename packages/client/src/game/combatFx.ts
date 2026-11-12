// Efeitos de combate: números flutuantes, impactos, projéteis, fumaça, cadáveres e level-up.
// Tudo com pools (sem alocar por frame). Textos ficam na camada de UI (nítidos), o resto na do mundo.
import Phaser from "phaser";
import { type DamageKind } from "@lemonquest/shared";
import type { PixelCamera } from "./pixelCamera.ts";
import { TEX } from "./textures.ts";
import { lightBus } from "./lighting.ts";
import { textRes } from "./textRes.ts";

const FX_DEPTH = 1_900_000;
const FONT = '"Pixelify Sans", Verdana, system-ui, sans-serif';

interface FxSheet { key: string; url: string; size: number; frames: number; fps: number; loop?: boolean }
const FX = "ninja/FX/";
const SHEETS: FxSheet[] = [
  { key: "fx_cut", url: FX + "Attack/Cut/SpriteSheet.png", size: 32, frames: 4, fps: 26 },
  { key: "fx_claw", url: FX + "Attack/Claw/SpriteSheet.png", size: 32, frames: 4, fps: 26 },
  { key: "fx_smoke", url: FX + "Smoke/Smoke/SpriteSheet.png", size: 32, frames: 6, fps: 11 },
  { key: "fx_circle_white", url: FX + "Magic/Circle/SpriteSheetWhite.png", size: 32, frames: 4, fps: 14 },
  { key: "fx_circle_spark", url: FX + "Magic/Circle/SpriteSheetSpark.png", size: 32, frames: 6, fps: 20 },
  { key: "fx_explosion", url: FX + "Elemental/Explosion/SpriteSheet.png", size: 40, frames: 9, fps: 24 },
  { key: "fx_ice", url: FX + "Elemental/Ice/SpriteSheet.png", size: 32, frames: 10, fps: 24 },
  { key: "proj_fireball", url: FX + "Projectile/Fireball.png", size: 16, frames: 4, fps: 16, loop: true },
  { key: "proj_energy", url: FX + "Projectile/EnergyBall.png", size: 16, frames: 4, fps: 16, loop: true },
];
const ARROW = { key: "proj_arrow", url: FX + "Projectile/Arrow.png" };

interface HitStyle { sheet: string; scale: number; tint?: number; add?: boolean }
const HIT_FX: Record<DamageKind, HitStyle> = {
  physical: { sheet: "fx_cut", scale: 0.8 },
  fire: { sheet: "fx_explosion", scale: 0.7 },
  ice: { sheet: "fx_ice", scale: 0.8 },
  energy: { sheet: "fx_circle_spark", scale: 0.9, tint: 0xc9a0ff, add: true },
  earth: { sheet: "fx_cut", scale: 0.8, tint: 0x7fdc5a },
  holy: { sheet: "fx_circle_white", scale: 0.9, tint: 0xffe566, add: true },
  death: { sheet: "fx_circle_spark", scale: 0.9, tint: 0xc8283e },
  heal: { sheet: "fx_circle_white", scale: 0.9, tint: 0x5be07a, add: true },
  mana: { sheet: "fx_circle_white", scale: 0.9, tint: 0x5aa0ff, add: true },
};

export const KIND_COLOR: Record<DamageKind, number> = {
  physical: 0xffffff, fire: 0xff9a3c, ice: 0x7fe0ff, energy: 0xc58aff, earth: 0x7fdc5a,
  holy: 0xffe566, death: 0xc8283e, heal: 0x5be07a, mana: 0x5aa0ff,
};
const css = (n: number) => "#" + n.toString(16).padStart(6, "0");

interface FloatItem {
  t: Phaser.GameObjects.Text;
  active: boolean;
  wx: number; wy: number;
  dx: number;
  age: number; life: number;
  rise: number;
  pop: number;
  shake: number;
  base: number;
}
interface FxItem { s: Phaser.GameObjects.Sprite; active: boolean }
interface ProjItem {
  s: Phaser.GameObjects.Sprite; active: boolean;
  fx: number; fy: number; tx: number; ty: number; t: number; dur: number;
  ev: unknown;
  kind: DamageKind;
}
interface GhostItem { s: Phaser.GameObjects.Sprite; age: number; base: number; y0: number }

/** Tetos dos pools: com a aba visível nunca se chega perto; só seguram uma rajada (muitos bichos de uma vez). */
const FX_POOL_MAX = 64;
const PARTICLES_MAX = 200;

export class CombatFx {
  private floats: FloatItem[] = [];
  private floatCursor = 0;
  private fxs: FxItem[] = [];
  private fxNext = 0;
  private projs: ProjItem[] = [];
  private ghosts: GhostItem[] = [];
  private emitters = {} as Record<DamageKind, Phaser.GameObjects.Particles.ParticleEmitter>;
  private lvlEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
  private smokeEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
  private get res() { return textRes(); }

  /** Chamado quando um projétil chega (para aplicar o dano visual). */
  onImpact: (ev: unknown) => void = () => {};

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly worldLayer: Phaser.GameObjects.Layer,
    private readonly uiLayer: Phaser.GameObjects.Layer,
    private readonly pcam: PixelCamera,
  ) {
    for (const k of Object.keys(KIND_COLOR) as DamageKind[]) this.emitters[k] = this.makeEmitter(k);
    this.lvlEmitter = scene.add.particles(0, 0, TEX.px, {
      emitting: false, lifespan: { min: 700, max: 1200 },
      speedX: { min: -14, max: 14 }, speedY: { min: -70, max: -30 },
      scale: { start: 2, end: 1 }, alpha: { start: 1, end: 0 },
      tint: [0xffe066, 0xfff2a8, 0xffffff, 0xffc84a], blendMode: Phaser.BlendModes.ADD,
    });
    worldLayer.add(this.lvlEmitter.setDepth(FX_DEPTH));
    this.smokeEmitter = scene.add.particles(0, 0, TEX.px, {
      emitting: false, lifespan: { min: 300, max: 520 },
      speed: { min: 8, max: 34 }, angle: { min: 0, max: 360 },
      scale: { start: 2, end: 0.5 }, alpha: { start: 0.7, end: 0 },
      tint: [0xdcdcdc, 0xb8b8c0, 0x8e8e9a],
    });
    worldLayer.add(this.smokeEmitter.setDepth(FX_DEPTH));
  }

  static preload(scene: Phaser.Scene) {
    const base = import.meta.env.BASE_URL;
    for (const s of SHEETS) scene.load.spritesheet(s.key, base + s.url, { frameWidth: s.size, frameHeight: s.size });
    scene.load.image(ARROW.key, base + ARROW.url);
  }

  static createAnims(scene: Phaser.Scene) {
    for (const s of SHEETS) {
      const key = "fx:" + s.key;
      if (scene.anims.exists(key)) continue;
      scene.anims.create({
        key, frameRate: s.fps, repeat: s.loop ? -1 : 0,
        frames: scene.anims.generateFrameNumbers(s.key, { start: 0, end: s.frames - 1 }),
      });
    }
  }

  private makeEmitter(kind: DamageKind) {
    const c = KIND_COLOR[kind];
    const light = Phaser.Display.Color.IntegerToColor(c).lighten(35).color;
    const e = this.scene.add.particles(0, 0, TEX.px, {
      emitting: false, lifespan: { min: 180, max: 340 },
      speed: { min: 28, max: 80 }, angle: { min: 0, max: 360 },
      scale: { start: 2, end: 1 }, alpha: { start: 1, end: 0 },
      tint: [c, light], gravityY: kind === "heal" || kind === "mana" ? -50 : 60, maxParticles: PARTICLES_MAX,
    });
    this.worldLayer.add(e.setDepth(FX_DEPTH));
    return e;
  }

  // --- números flutuantes ---------------------------------------------------

  /** Texto flutuante ancorado num ponto do mundo (px). */
  floatText(wx: number, wy: number, text: string, color: number, opts: { size?: number; crit?: boolean; life?: number; rise?: number; dx?: number; stroke?: string; italic?: boolean } = {}) {
    let it: FloatItem | undefined;
    for (const f of this.floats) if (!f.active) { it = f; break; }
    if (!it) {
      if (this.floats.length < 48) {
        const t = this.scene.add.text(0, 0, "", { fontFamily: FONT, fontSize: "16px", fontStyle: "600", color: "#fff", stroke: "#0b0b12", strokeThickness: 4, resolution: this.res }).setOrigin(0.5, 1);
        this.uiLayer.add(t);
        it = { t, active: false, wx: 0, wy: 0, dx: 0, age: 0, life: 0, rise: 0, pop: 0, shake: 0, base: 1 };
        this.floats.push(it);
      } else {
        it = this.floats[this.floatCursor++ % this.floats.length]; // recicla o mais antigo
      }
    }
    const size = opts.size ?? (opts.crit ? 24 : 16);
    it.t.setText(text).setFontStyle(opts.italic ? "italic 600" : "600").setFontSize(size).setColor(css(color)).setStroke(opts.stroke ?? "#0b0b12", size >= 20 ? 5 : 4).setVisible(true).setAlpha(1);
    it.active = true;
    it.wx = wx; it.wy = wy;
    it.dx = opts.dx ?? (Math.random() - 0.5) * 12;
    it.age = 0;
    it.life = opts.life ?? (opts.crit ? 1000 : 800);
    it.rise = opts.rise ?? (opts.crit ? 12 : 10);
    it.pop = opts.crit ? 1.9 : 1.35;
    it.shake = opts.crit ? 1 : 0;
    it.base = 1;
  }

  // --- efeitos de sprite ------------------------------------------------------

  private acquireFx(): FxItem {
    for (const f of this.fxs) if (!f.active) return f;
    // Teto (rede de segurança contra rajadas): reaproveita o mais antigo em vez de criar sprites sem fim.
    if (this.fxs.length >= FX_POOL_MAX) { const it = this.fxs[this.fxNext++ % this.fxs.length]!; it.s.anims.stop(); return it; }
    const s = this.scene.add.sprite(0, 0, "fx_cut").setVisible(false);
    this.worldLayer.add(s.setDepth(FX_DEPTH));
    const it = { s, active: false };
    this.fxs.push(it);
    return it;
  }

  /** Toca uma animação de FX uma vez, centrada em (wx, wy). */
  playFx(sheet: string, wx: number, wy: number, scale = 1, tint?: number, add = false, rot = 0) {
    const it = this.acquireFx();
    const s = it.s;
    it.active = true;
    s.setTexture(sheet).setPosition(Math.round(wx), Math.round(wy)).setScale(scale).setRotation(rot).setAlpha(1)
      .setBlendMode(add ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL).setVisible(true);
    if (tint !== undefined) s.setTint(tint); else s.clearTint();
    s.play("fx:" + sheet);
  }

  /** Impacto elemental/corte no ponto do corpo do alvo. */
  hit(kind: DamageKind, wx: number, wy: number, ranged: boolean, angle: number) {
    const st = HIT_FX[kind];
    if (kind !== "physical") lightBus.burst(wx, wy, KIND_COLOR[kind], 34, 300, 0.85);
    // Corte aponta na direção do golpe, com leve variação.
    const rot = kind === "physical" || kind === "earth" ? angle + (Math.random() - 0.5) * 0.6 : 0;
    this.playFx(st.sheet, wx, wy, st.scale * (ranged ? 0.75 : 1), st.tint, st.add, rot);
    this.emitters[kind].explode(kind === "physical" ? 5 : 8, wx, wy);
  }

  smoke(wx: number, wy: number, scale = 1) {
    this.playFx("fx_smoke", wx, wy - 2, scale);
    this.smokeEmitter.explode(6, wx, wy);
  }

  puff(wx: number, wy: number) {
    this.smokeEmitter.explode(3, wx, wy);
  }

  /** Projétil de (fx,fy) a (tx,ty) em `dur` ms; `ev` é devolvido em onImpact. */
  projectile(kind: DamageKind, fx: number, fy: number, tx: number, ty: number, dur: number, ev: unknown) {
    let it: ProjItem | undefined;
    for (const p of this.projs) if (!p.active) { it = p; break; }
    if (!it) {
      const s = this.scene.add.sprite(0, 0, ARROW.key).setVisible(false);
      this.worldLayer.add(s.setDepth(FX_DEPTH));
      it = { s, active: false, fx: 0, fy: 0, tx: 0, ty: 0, t: 0, dur: 0, ev: null, kind: "physical" };
      this.projs.push(it);
    }
    it.active = true;
    it.kind = kind;
    it.fx = fx; it.fy = fy; it.tx = tx; it.ty = ty; it.t = 0; it.dur = Math.max(60, dur); it.ev = ev;
    const s = it.s;
    s.anims.stop();
    s.setRotation(Math.atan2(ty - fy, tx - fx)).setVisible(true).setAlpha(1).setScale(1).setBlendMode(Phaser.BlendModes.NORMAL);
    s.setPosition(fx, fy);
    if (kind === "physical") { s.setTexture(ARROW.key); s.clearTint(); }
    else if (kind === "fire") { s.setTexture("proj_fireball"); s.clearTint(); s.play("fx:proj_fireball"); }
    else {
      s.setTexture("proj_energy"); s.setTint(KIND_COLOR[kind]);
      s.setBlendMode(Phaser.BlendModes.ADD).play("fx:proj_energy");
    }
  }

  // --- morte e level-up -------------------------------------------------------

  /** Cadáver: o sprite pisca em branco, encolhe e some, com fumaça. Independe do estado do servidor. */
  corpse(texKey: string, frame: string | number, tint: number, footX: number, footY: number, scale: number, depth: number) {
    const s = this.scene.add.sprite(footX, footY, texKey, frame).setOrigin(0.5, 1).setScale(scale);
    s.setTintFill(0xffffff);
    this.worldLayer.add(s.setDepth(depth));
    this.ghosts.push({ s, age: 0, base: scale, y0: footY });
    this.smoke(footX, footY - 5 * scale, scale > 1 ? 1.6 : 1);
    void tint;
  }

  /** Coluna de luz + partículas + anel no pé do ator. */
  levelUp(root: Phaser.GameObjects.Container, wx: number, wy: number) {
    const beam = this.scene.add.image(0, 0, TEX.beam).setOrigin(0.5, 1).setTint(0xffe066).setBlendMode(Phaser.BlendModes.ADD);
    beam.setDisplaySize(18, 12).setAlpha(0);
    root.add(beam);
    this.scene.tweens.add({
      targets: beam, displayHeight: 64, displayWidth: 22, alpha: { from: 0.95, to: 0 }, duration: 1100, ease: "Quad.easeOut",
      onComplete: () => beam.destroy(),
    });
    const core = this.scene.add.image(0, 0, TEX.beam).setOrigin(0.5, 1).setTint(0xffffff).setBlendMode(Phaser.BlendModes.ADD);
    core.setDisplaySize(7, 10).setAlpha(0);
    root.add(core);
    this.scene.tweens.add({
      targets: core, displayHeight: 72, alpha: { from: 1, to: 0 }, duration: 800, ease: "Cubic.easeOut",
      onComplete: () => core.destroy(),
    });
    this.playFx("fx_circle_white", wx, wy - 4, 1.5, 0xffe066, true);
    for (let i = 0; i < 4; i++) {
      this.lvlEmitter.explode(7, wx + (Math.random() - 0.5) * 14, wy - 2 - i * 5);
    }
  }

  // --- frame ------------------------------------------------------------------

  update(dt: number) {
    const pcam = this.pcam;
    const zoom = pcam.zoom;
    for (const f of this.floats) {
      if (!f.active) continue;
      f.age += dt;
      const k = f.age / f.life;
      if (k >= 1) { f.active = false; f.t.setVisible(false); continue; }
      const ease = 1 - (1 - k) * (1 - k);
      let sx = pcam.toScreenX(f.wx) + f.dx * zoom * 0.5;
      const sy = pcam.toScreenY(f.wy) - f.rise * zoom * ease;
      if (f.shake > 0 && f.age < 260) sx += (Math.random() - 0.5) * 4 * (1 - f.age / 260);
      f.t.setPosition(Math.round(sx), Math.round(sy));
      const popK = Math.max(0, 1 - f.age / 140);
      f.t.setScale(1 + (f.pop - 1) * popK * popK);
      f.t.setAlpha(k < 0.55 ? 1 : 1 - (k - 0.55) / 0.45);
    }
    for (const f of this.fxs) {
      if (f.active && !f.s.anims.isPlaying) { f.active = false; f.s.setVisible(false); }
    }
    for (const p of this.projs) {
      if (!p.active) continue;
      p.t += dt;
      const k = Math.min(1, p.t / p.dur);
      p.s.setPosition(Math.round(p.fx + (p.tx - p.fx) * k), Math.round(p.fy + (p.ty - p.fy) * k));
      if (p.kind !== "physical") lightBus.point(p.s.x, p.s.y, KIND_COLOR[p.kind], 30, 0.8);
      if (k >= 1) {
        p.active = false; p.s.setVisible(false); p.s.anims.stop();
        this.onImpact(p.ev);
        p.ev = null;
      }
    }
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const g = this.ghosts[i];
      g.age += dt;
      const a = g.age;
      if (a > 650) { g.s.destroy(); this.ghosts.splice(i, 1); continue; }
      if (a < 220) {
        // pisca branco / cor normal e infla um pouquinho
        g.s.setScale(g.base * (1 + 0.12 * (a / 220)));
        if (((a / 55) | 0) % 2 === 0) g.s.setTintFill(0xffffff); else g.s.setTintFill(0xffb0a8);
      } else {
        const k = (a - 220) / 430;
        g.s.setScale(g.base * (1.12 - 0.8 * k), g.base * (1.12 - 0.95 * k));
        g.s.setAlpha(1 - k * k);
        g.s.setTintFill(0xffffff);
      }
    }
  }

  destroy() {
    for (const f of this.floats) f.t.destroy();
    for (const f of this.fxs) f.s.destroy();
    for (const p of this.projs) p.s.destroy();
    for (const g of this.ghosts) g.s.destroy();
    this.floats = []; this.fxs = []; this.projs = []; this.ghosts = [];
  }
}

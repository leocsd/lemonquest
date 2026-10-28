// Efeitos de magia: palavras, projéteis, áreas, ondas, curas, auras persistentes, invocação, raízes, provocar e investida.
// Sheets carregadas sob demanda (em segundo plano); animações/atrasos usam o relógio da cena (respeitam timeScale).
import Phaser from "phaser";
import { TILE_SIZE, spellDef, type ConditionId, type SpellCastMsg, type SpellDef, type SpellFx as FxKey } from "@lemonquest/shared";
import type { Actor } from "./actor.ts";
import type { CombatFx } from "./combatFx.ts";
import type { PixelCamera } from "./pixelCamera.ts";
import { sfx, type SfxName } from "./sfx.ts";
import { PAL, type Pal } from "./spellPalette.ts";
import { TEX } from "./textures.ts";
import { lightBus } from "./lighting.ts";

const FX_DEPTH = 1_900_000;
const GROUND = 7;
const TS = TILE_SIZE;

interface Sheet { key: string; url: string; fw: number; fh: number; frames: number; fps: number; loop?: boolean; anims?: Record<string, [number, number]> }
const FX = "ninja/FX/";
const SHEETS: Sheet[] = [
  { key: "sp_flam", url: FX + "Elemental/Flam/SpriteSheet.png", fw: 25, fh: 30, frames: 8, fps: 16 },
  { key: "sp_rock", url: FX + "Elemental/Rock/SpriteSheet.png", fw: 30, fh: 30, frames: 14, fps: 20, anims: { hit: [8, 13] } },
  { key: "sp_spike", url: FX + "Elemental/RockSpike/SpriteSheet.png", fw: 54, fh: 48, frames: 10, fps: 16 },
  { key: "sp_thunder", url: FX + "Elemental/Thunder/SpriteSheet.png", fw: 20, fh: 28, frames: 8, fps: 20 },
  { key: "sp_iceb", url: FX + "Elemental/Ice/SpriteSheetB.png", fw: 32, fh: 32, frames: 9, fps: 16 },
  { key: "sp_aura", url: FX + "Magic/Aura/SpriteSheet.png", fw: 25, fh: 24, frames: 5, fps: 12 },
  { key: "sp_boost", url: FX + "Magic/Boost/SpriteSheet.png", fw: 53, fh: 35, frames: 8, fps: 14 },
  { key: "sp_shield", url: FX + "Magic/Shield/SpriteSheetBlue.png", fw: 24, fh: 26, frames: 6, fps: 14 },
  { key: "sp_spark", url: FX + "Magic/Spark/SpriteSheet.png", fw: 30, fh: 35, frames: 9, fps: 14 },
  { key: "sp_ring", url: FX + "Smoke/SmokeCircular/SpriteSheet.png", fw: 30, fh: 14, frames: 8, fps: 14 },
  { key: "sp_circle2", url: FX + "Magic/Circle/SpriteSheetSpark2.png", fw: 32, fh: 32, frames: 5, fps: 16 },
  { key: "pj_ice", url: FX + "Projectile/IceSpike.png", fw: 18, fh: 10, frames: 8, fps: 18, loop: true },
  { key: "pj_plant", url: FX + "Projectile/PlantSpike.png", fw: 24, fh: 20, frames: 4, fps: 14, loop: true },
  { key: "pj_shuriken", url: FX + "Projectile/ShurikenMagic.png", fw: 16, fh: 16, frames: 2, fps: 1 },
];

const SOUND: Record<FxKey, SfxName> = {
  fire: "sp_fire", ice: "sp_ice", energy: "sp_energy", earth: "sp_earth", holy: "sp_holy", death: "sp_death",
  physical: "sp_physical", heal: "heal", buff: "sp_buff", arrow: "shoot", summon: "sp_summon", taunt: "sp_taunt",
  root: "sp_earth", charge: "sp_charge", sparkle: "sp_holy",
};

export interface SpellFxContext {
  actor(id: string): Actor | undefined;
  myId(): string;
  shake(ms: number, intensity: number): void;
}

interface PlayOpts {
  x: number; y: number; scale?: number; scaleY?: number; tint?: number; add?: boolean; alpha?: number;
  ox?: number; oy?: number; rot?: number; depth?: number; delay?: number; fps?: number; flipX?: boolean;
}
interface Proj {
  s: Phaser.GameObjects.Sprite; fx: number; fy: number; tx: number; ty: number; t: number; dur: number;
  key: FxKey; spin: number; trailAcc: number; done: () => void;
}
interface Aura { id: ConditionId; objs: Phaser.GameObjects.Image[]; acc: number }

const tc = (x: number, y: number) => ({ x: (x + 0.5) * TS, y: (y + 0.5) * TS });
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export class SpellEffects {
  private ready = false;
  private free: Phaser.GameObjects.Sprite[] = [];
  private projs: Proj[] = [];
  private sparks = {} as Record<FxKey, Phaser.GameObjects.Particles.ParticleEmitter>;
  private risers!: Phaser.GameObjects.Particles.ParticleEmitter;
  private motes!: Phaser.GameObjects.Particles.ParticleEmitter;
  private streakH!: Phaser.GameObjects.Particles.ParticleEmitter;
  private streakV!: Phaser.GameObjects.Particles.ParticleEmitter;
  private flakes!: Phaser.GameObjects.Particles.ParticleEmitter;
  private debris!: Phaser.GameObjects.Particles.ParticleEmitter;
  private auras = new Map<ConditionId, Aura>();
  private auraWanted = new Set<ConditionId>();
  private lastPos = { x: 0, y: 0 };
  private streakAcc = 0;
  private glows: Phaser.GameObjects.Image[] = [];
  private scale = 1;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layer: Phaser.GameObjects.Layer,
    private readonly cfx: CombatFx,
    private readonly pcam: PixelCamera,
    private readonly ctx: SpellFxContext,
  ) {
    for (const k of Object.keys(PAL) as FxKey[]) this.sparks[k] = this.makeSparks(k);
    const mk = (tex: string, cfg: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig, depth = FX_DEPTH) => {
      const e = scene.add.particles(0, 0, tex, { emitting: false, ...cfg });
      layer.add(e.setDepth(depth));
      return e;
    };
    this.risers = mk(TEX.plus, {
      lifespan: { min: 800, max: 1200 }, speedX: { min: -8, max: 8 }, speedY: { min: -34, max: -18 },
      scale: { start: 1, end: 0.6 }, alpha: { start: 1, end: 0 }, tint: [0x5be07a, 0xc4ffd0, 0x8affa0], blendMode: Phaser.BlendModes.ADD,
    });
    this.motes = mk(TEX.px, {
      lifespan: { min: 800, max: 1300 }, speedX: { min: -5, max: 5 }, speedY: { min: -16, max: -7 },
      scale: { start: 2, end: 1 }, alpha: { start: 0.9, end: 0 }, tint: [0x5be07a, 0xa8ffb8, 0x3fb85c], blendMode: Phaser.BlendModes.ADD,
    });
    this.streakH = mk(TEX.px, {
      lifespan: 200, speed: 0, scaleX: { start: 7, end: 1 }, scaleY: 1, alpha: { start: 0.7, end: 0 }, tint: [0xfff0b0, 0xffffff],
    });
    this.streakV = mk(TEX.px, {
      lifespan: 200, speed: 0, scaleX: 1, scaleY: { start: 7, end: 1 }, alpha: { start: 0.7, end: 0 }, tint: [0xfff0b0, 0xffffff],
    });
    this.flakes = mk(TEX.px, {
      lifespan: { min: 600, max: 1100 }, speedX: { min: -14, max: 14 }, speedY: { min: 10, max: 30 },
      scale: { start: 2, end: 1 }, alpha: { start: 1, end: 0 }, tint: [0xffffff, 0xdff8ff, 0x9fe8ff], blendMode: Phaser.BlendModes.ADD,
    });
    this.debris = mk(TEX.px, {
      lifespan: { min: 350, max: 650 }, speedX: { min: -50, max: 50 }, speedY: { min: -90, max: -30 }, gravityY: 260,
      scale: { start: 2, end: 1 }, alpha: { start: 1, end: 0 }, tint: [0x8a6a4a, 0x6a4a2a, 0x9be07a, 0x5a7a2c],
    });
    this.load();
  }

  private makeSparks(k: FxKey) {
    const p = PAL[k];
    const up = k === "heal" || k === "holy" || k === "buff" || k === "sparkle";
    const e = this.scene.add.particles(0, 0, TEX.px, {
      emitting: false, lifespan: { min: 300, max: 700 }, speed: { min: 18, max: 90 }, angle: { min: 0, max: 360 },
      scale: { start: 2, end: 0.5 }, alpha: { start: 1, end: 0 }, tint: [p.main, p.light, p.dark],
      gravityY: up ? -45 : k === "earth" || k === "ice" ? 50 : -10, blendMode: k === "earth" || k === "death" ? Phaser.BlendModes.NORMAL : Phaser.BlendModes.ADD,
    });
    this.layer.add(e.setDepth(FX_DEPTH));
    return e;
  }

  // --- carregamento sob demanda --------------------------------------------------

  private load() {
    const base = import.meta.env.BASE_URL;
    for (const s of SHEETS) {
      if (!this.scene.textures.exists(s.key)) this.scene.load.spritesheet(s.key, base + s.url, { frameWidth: s.fw, frameHeight: s.fh });
    }
    const done = () => {
      for (const s of SHEETS) {
        const mkAnim = (key: string, start: number, end: number) => {
          if (this.scene.anims.exists(key)) return;
          this.scene.anims.create({
            key, frameRate: s.fps, repeat: s.loop ? -1 : 0,
            frames: this.scene.anims.generateFrameNumbers(s.key, { start, end }),
          });
        };
        mkAnim("fx:" + s.key, 0, s.frames - 1);
        for (const [n, [a, b]] of Object.entries(s.anims ?? {})) mkAnim(`fx:${s.key}:${n}`, a, b);
      }
      this.ready = true;
    };
    if (this.scene.load.isLoading()) this.scene.load.once(Phaser.Loader.Events.COMPLETE, () => { this.scene.load.once(Phaser.Loader.Events.COMPLETE, done); this.scene.load.start(); });
    else { this.scene.load.once(Phaser.Loader.Events.COMPLETE, done); this.scene.load.start(); }
  }

  // --- primitivas -----------------------------------------------------------------

  private acquire(): Phaser.GameObjects.Sprite {
    let s = this.free.pop();
    if (!s) { s = this.scene.add.sprite(0, 0, TEX.px); this.layer.add(s); }
    s.setVisible(true).setActive(true).setAlpha(1).setScale(1).setRotation(0).clearTint().setBlendMode(Phaser.BlendModes.NORMAL).setOrigin(0.5).setFlip(false, false);
    return s;
  }
  private release(s: Phaser.GameObjects.Sprite) {
    s.anims.stop();
    this.scene.tweens.killTweensOf(s);
    s.removeAllListeners();
    s.setVisible(false);
    this.free.push(s);
  }

  /** Toca a animação `anim` (chave de anims, ex.: "fx:sp_flam") uma vez. */
  private play(anim: string, o: PlayOpts) {
    const run = () => {
      if (!this.ready && anim.startsWith("fx:sp_")) return;
      const sheet = anim.slice(3).split(":")[0];
      const s = this.acquire();
      s.setTexture(sheet).setPosition(Math.round(o.x), Math.round(o.y)).setOrigin(o.ox ?? 0.5, o.oy ?? 0.5)
        .setScale(o.scale ?? 1, o.scaleY ?? o.scale ?? 1).setRotation(o.rot ?? 0).setAlpha(o.alpha ?? 1).setDepth(o.depth ?? FX_DEPTH)
        .setBlendMode(o.add ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL).setFlipX(!!o.flipX);
      if (o.tint !== undefined) s.setTint(o.tint);
      s.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => this.release(s));
      s.play(o.fps ? { key: anim, frameRate: o.fps } : anim);
    };
    if (o.delay) this.scene.time.delayedCall(o.delay, run); else run();
  }

  private later(ms: number, fn: () => void) {
    if (ms <= 0) fn(); else this.scene.time.delayedCall(ms, fn);
  }

  /** Brilho aditivo que "ilumina" a cena por alguns instantes. */
  glow(x: number, y: number, color: number, radiusPx: number, ms = 320, alpha = 0.8) {
    let g = this.glows.find((i) => !i.visible);
    if (!g) { g = this.scene.add.image(0, 0, TEX.glow).setBlendMode(Phaser.BlendModes.ADD); this.layer.add(g); this.glows.push(g); }
    this.scene.tweens.killTweensOf(g);
    lightBus.burst(x, y, color, radiusPx * 2.4, ms * 1.5, Math.min(1, alpha + 0.2));
    const size = radiusPx * 2;
    g.setVisible(true).setPosition(Math.round(x), Math.round(y)).setTint(color).setDepth(FX_DEPTH - 1).setAlpha(alpha).setDisplaySize(size * 0.6, size * 0.6);
    const gg = g;
    this.scene.tweens.add({
      targets: gg, displayWidth: size, displayHeight: size, alpha: 0, duration: ms, ease: "Quad.easeOut",
      onComplete: () => gg.setVisible(false),
    });
  }

  /** Anel de pixels que se expande (ADD). `flat` = achatado como no chão. */
  ring(x: number, y: number, color: number, fromPx: number, toPx: number, ms: number, opts: { delay?: number; flat?: boolean; alpha?: number; depth?: number } = {}) {
    const run = () => {
      const s = this.acquire();
      s.setTexture(TEX.ring).setPosition(Math.round(x), Math.round(y)).setTint(color).setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(opts.depth ?? GROUND).setAlpha(opts.alpha ?? 0.9);
      const sy = opts.flat ? 0.6 : 1;
      s.setScale(fromPx / 64, (fromPx / 64) * sy);
      this.scene.tweens.add({
        targets: s, scaleX: toPx / 64, scaleY: (toPx / 64) * sy, alpha: 0, duration: ms, ease: "Cubic.easeOut",
        onComplete: () => this.release(s),
      });
    };
    this.later(opts.delay ?? 0, run);
  }

  private pulse(k: FxKey, x: number, y: number, n = 10) { this.sparks[k].explode(n, x, y); }

  /**
   * Aviso de habilidade de monstro: os tiles piscam na cor do elemento e ficam mais fortes até o golpe (`ms`).
   * Fica no chão (abaixo das criaturas) para não esconder quem está em cima.
   */
  telegraph(tiles: number[], ms: number, fx: FxKey) {
    const color = PAL[fx]?.main ?? 0xff4040;
    const rects: Phaser.GameObjects.Rectangle[] = [];
    for (let i = 0; i + 1 < tiles.length; i += 2) {
      const c = tc(tiles[i]!, tiles[i + 1]!);
      const r = this.scene.add.rectangle(c.x, c.y, TS - 2, TS - 2, color, 0.18).setStrokeStyle(1, color, 0.9).setDepth(GROUND + 1);
      this.layer.add(r);
      rects.push(r);
    }
    if (!rects.length) return;
    this.scene.tweens.add({ targets: rects, fillAlpha: 0.5, duration: Math.max(120, ms / 3), yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    this.scene.time.delayedCall(ms, () => { for (const r of rects) { this.scene.tweens.killTweensOf(r); r.destroy(); } });
  }

  // --- ponto de entrada -------------------------------------------------------------

  /** `gain` = volume relativo pela distância ao jogador local (0 = sem som; o visual sai igual). */
  cast(msg: SpellCastMsg, override?: SpellDef, gain = 1) {
    const def = override ?? spellDef(msg.spellId);
    if (!def) return;
    const caster = this.ctx.actor(msg.casterId);
    const mine = msg.casterId === this.ctx.myId();
    const pal = PAL[def.fx];
    const center = tc(msg.x, msg.y);
    const cx = caster ? caster.bodyX : center.x;
    const cy = caster ? caster.bodyY : center.y;
    const feetY = caster ? caster.ry + TS - 1 : center.y + TS / 2;

    if (caster) this.cfx.floatText(caster.headX, caster.headY - 6, def.words, 0xffa83a, { size: 13, life: 1300, rise: 22, dx: 0, italic: true, stroke: "#2a1200" });
    if (gain > 0) sfx.play(SOUND[def.fx], { volume: 0.85 * gain });

    // Círculo rúnico no chão do conjurador.
    if (caster) {
      this.play("fx:sp_circle2", { x: cx, y: feetY - 3, scale: 0.9, tint: pal.main, add: true, depth: GROUND, alpha: 0.9 });
      this.glow(cx, cy, pal.main, 26, 300, 0.45);
    }

    const tiles = msg.tiles ?? [];
    const target = msg.targetId ? this.ctx.actor(msg.targetId) : undefined;
    const tgt = target ? { x: target.bodyX, y: target.bodyY } : center;
    const args = { def, msg, caster, mine, pal, cx, cy, tiles, tgt, center, gain };

    switch (def.fx) {
      case "taunt": return this.taunt(args);
      case "summon": return this.summon(args);
      case "root": return this.root(args);
      case "charge": return this.charge(args);
      case "heal": return this.heal(args);
      case "buff": return this.buff(args);
    }
    switch (def.target) {
      case "target": {
        const dist = Math.hypot(tgt.x - cx, tgt.y - (cy - 2));
        this.projectile(def.fx, cx, cy - 2, tgt.x, tgt.y, Math.max(140, dist / 0.32), () => {
          this.impact(def.fx, tgt.x, tgt.y, 1, gain);
          if (mine) this.ctx.shake(80, 0.0025);
        });
        return;
      }
      case "wave": return this.wave(args);
      case "area_target": {
        const dist = Math.hypot(center.x - cx, center.y - cy);
        if (def.fx === "arrow") return this.area(args);
        this.projectile(def.fx, cx, cy - 2, center.x, center.y, Math.max(160, dist / 0.34), () => this.area(args));
        return;
      }
      default: return this.area(args);
    }
  }

  // --- projétil ---------------------------------------------------------------------

  private projectile(k: FxKey, fx: number, fy: number, tx: number, ty: number, dur: number, done: () => void) {
    const s = this.acquire();
    const ang = Math.atan2(ty - fy, tx - fx);
    s.setPosition(fx, fy).setDepth(FX_DEPTH - 2).setRotation(ang);
    let spin = 0;
    const R = () => this.ready;
    switch (k) {
      case "fire": s.setTexture("proj_fireball").setScale(1.3).play("fx:proj_fireball"); break;
      case "ice": if (R()) s.setTexture("pj_ice").setScale(1.4).play("fx:pj_ice"); else s.setTexture("proj_energy").setTint(0x7fe0ff).play("fx:proj_energy"); break;
      case "energy": s.setTexture("proj_energy").setScale(1.5).setTint(PAL.energy.main).setBlendMode(Phaser.BlendModes.ADD).play("fx:proj_energy"); break;
      case "earth": if (R()) s.setTexture("pj_plant").setScale(1.2).play("fx:pj_plant"); else s.setTexture("proj_arrow"); break;
      case "holy": if (R()) { s.setTexture("pj_shuriken", 0).setTint(0xffe566).setScale(1.2); spin = 0.03; } else s.setTexture("proj_energy").setTint(0xffe566).play("fx:proj_energy"); break;
      case "death": if (R()) { s.setTexture("pj_shuriken", 1).setScale(1.2); spin = 0.03; } else s.setTexture("proj_energy").setTint(0xc8283e).play("fx:proj_energy"); break;
      // Fada: bolinha rosa aditiva (o rastro de faíscas rosa vem do emissor da chave, no update).
      case "sparkle": s.setTexture("proj_energy").setScale(1.3).setTint(PAL.sparkle.main).setBlendMode(Phaser.BlendModes.ADD).play("fx:proj_energy"); break;
      default: s.setTexture("proj_arrow").setScale(1.4); break;
    }
    this.projs.push({ s, fx, fy, tx, ty, t: 0, dur, key: k, spin, trailAcc: 0, done });
  }

  /** Impacto de uma magia de alvo único. */
  private impact(k: FxKey, x: number, y: number, size: number, gain = 1) {
    const pal = PAL[k];
    const d = FX_DEPTH - 3;
    switch (k) {
      case "fire":
        this.play("fx:fx_explosion", { x, y, scale: 0.8 * size, depth: d });
        this.sparks.fire.explode(14, x, y); if (gain > 0) sfx.play("sp_fire_hit", { volume: 0.7 * gain });
        break;
      case "ice":
        this.play("fx:sp_iceb", { x, y: y + 6, oy: 0.8, scale: 0.9 * size, depth: d });
        this.flakes.explode(8, x, y - 4); this.sparks.ice.explode(10, x, y);
        break;
      case "energy":
        this.play("fx:sp_thunder", { x, y: y + 6, oy: 1, scale: 1.1 * size, tint: 0xd9b8ff, add: true, depth: d });
        this.play("fx:fx_circle_spark", { x, y, scale: 0.9 * size, tint: pal.main, add: true, depth: d });
        this.sparks.energy.explode(12, x, y);
        break;
      case "earth":
        this.play("fx:sp_rock:hit", { x, y, scale: 0.9 * size, oy: 0.6, depth: d });
        this.debris.explode(8, x, y);
        break;
      case "holy":
        this.play("fx:fx_circle_white", { x, y, scale: 1.1 * size, tint: pal.main, add: true, depth: d });
        this.play("fx:sp_boost", { x, y, scale: 0.8, tint: pal.main, add: true, depth: d });
        this.sparks.holy.explode(12, x, y);
        break;
      case "sparkle":
        // Fada: estourinho rosa com uma estrela branca e um punhado de faíscas que sobem.
        this.play("fx:fx_circle_white", { x, y, scale: 1.0 * size, tint: pal.main, add: true, depth: d });
        this.play("fx:sp_spark", { x, y: y - 2, scale: 0.9 * size, tint: pal.light, add: true, depth: d });
        this.sparks.sparkle.explode(16, x, y);
        break;
      case "death":
        this.play("fx:sp_aura", { x, y: y + 4, oy: 0.8, scale: 1.1, tint: 0xc8283e, depth: d });
        this.play("fx:fx_smoke", { x, y, scale: 0.9, tint: 0x4a1020, depth: d - 1 });
        this.sparks.death.explode(10, x, y);
        break;
      default:
        this.play("fx:fx_cut", { x, y, scale: 0.9, rot: rnd(0, 6.28), depth: d });
        this.sparks[k].explode(6, x, y);
    }
    this.glow(x, y, pal.main, 34 * size, 320, 0.7);
  }

  // --- área --------------------------------------------------------------------------

  private tileFx(k: FxKey, x: number, y: number, delay: number, scale = 1) {
    const pal = PAL[k];
    const dy = y; // y = centro do tile
    const depth = 10 + y + TS / 2 + 0.5;
    this.later(delay, () => {
      switch (k) {
        case "fire":
          this.play("fx:sp_flam", { x, y: dy + 5, oy: 0.85, scale: 0.9 * scale, depth });
          this.sparks.fire.explode(3, x, dy); break;
        case "ice":
          this.play("fx:sp_iceb", { x, y: dy + 6, oy: 0.8, scale: 0.85 * scale, depth });
          this.sparks.ice.explode(3, x, dy); break;
        case "energy":
          this.play("fx:sp_thunder", { x, y: dy + 6, oy: 1, scale: 1.05 * scale, tint: 0xd9b8ff, add: true, depth });
          this.sparks.energy.explode(3, x, dy); break;
        case "earth":
        case "root":
          if (k === "root" || Math.random() < 0.7) this.play("fx:sp_spike", { x: x + rnd(-2, 2), y: dy + 7, oy: 0.92, scale: rnd(0.34, 0.48) * scale, tint: k === "root" ? 0xb8ff9a : 0xd8e6a8, depth });
          this.debris.explode(3, x, dy); break;
        case "holy": {
          const b = this.acquire();
          b.setTexture(TEX.beam).setOrigin(0.5, 1).setPosition(x, dy + 6).setTint(pal.main).setBlendMode(Phaser.BlendModes.ADD).setDepth(depth + 1);
          b.setDisplaySize(5, 8).setAlpha(0.8);
          this.scene.tweens.add({ targets: b, displayHeight: 54, displayWidth: 8, alpha: 0, duration: 520, ease: "Cubic.easeOut", onComplete: () => this.release(b) });
          this.play("fx:fx_circle_spark", { x, y: dy + 2, scale: 0.45 * scale, tint: pal.dark, add: true, depth: GROUND, alpha: 0.7 });
          this.sparks.holy.explode(4, x, dy); break;
        }
        case "death":
          this.play("fx:sp_aura", { x, y: dy + 4, oy: 0.8, scale: 0.9 * scale, tint: 0xc8283e, depth });
          this.sparks.death.explode(3, x, dy); break;
        case "sparkle":
          // Fada: confete/glitter — um brilho rosa no chão e faíscas subindo em cada tile.
          this.play("fx:fx_circle_spark", { x, y: dy + 2, scale: 0.5 * scale, tint: pal.main, add: true, depth: GROUND, alpha: 0.8 });
          if (Math.random() < 0.5) this.play("fx:sp_spark", { x: x + rnd(-3, 3), y: dy - 2, scale: 0.55 * scale, tint: pal.light, add: true, depth });
          this.sparks.sparkle.explode(5, x, dy); break;
        case "arrow": {
          // Flecha cai do céu.
          const a = this.acquire();
          a.setTexture("proj_arrow").setPosition(x - 5, dy - 70).setRotation(Math.PI / 2 - 0.15).setScale(1.4).setDepth(FX_DEPTH - 3);
          this.scene.tweens.add({
            targets: a, x, y: dy, duration: 200, ease: "Quad.easeIn",
            onComplete: () => {
              this.release(a);
              this.play("fx:fx_cut", { x, y: dy, scale: 0.55, rot: rnd(0, 6.28), depth });
              this.sparks.arrow.explode(3, x, dy);
            },
          });
          break;
        }
        default:
          this.play("fx:fx_cut", { x, y: dy, scale: 0.8 * scale, rot: rnd(0, 6.28), depth });
          this.sparks[k].explode(3, x, dy);
      }
    });
  }

  private area(a: CastArgs) {
    const { def, msg, mine, pal } = a;
    const k = def.fx;
    const center = def.target === "area_self" && a.caster ? { x: a.caster.bodyX, y: a.caster.ry + TS / 2 } : a.center;
    const radius = def.radius ?? 2;
    this.ring(center.x, center.y + 2, pal.main, 6, (radius + 0.6) * TS, 160 + radius * 110, { flat: true, alpha: 1 });
    this.ring(center.x, center.y + 2, pal.light, 4, (radius + 0.3) * TS, 120 + radius * 90, { flat: true, alpha: 0.7, delay: 40 });
    this.glow(center.x, center.y, pal.main, (radius + 1) * TS * 1.2, 420, 0.4);
    const list = a.tiles.length ? a.tiles : [msg.x, msg.y];
    for (let i = 0; i + 1 < list.length; i += 2) {
      const t = tc(list[i], list[i + 1]);
      const dist = Math.hypot(t.x - center.x, t.y - center.y) / TS;
      this.tileFx(k, t.x, t.y, dist * 25 + rnd(0, 18));
    }
    // Núcleo da explosão.
    if (k === "fire") this.play("fx:fx_explosion", { x: center.x, y: center.y, scale: 0.6 + radius * 0.3, depth: FX_DEPTH - 3 });
    if (k === "ice") for (let i = 0; i < 2; i++) this.flakes.explode(10, center.x + rnd(-radius, radius) * TS * 0.6, center.y - 10);
    if (k === "physical") this.play("fx:sp_ring", { x: center.x, y: center.y + 3, scale: 0.9 + radius * 0.55, tint: 0xe8e0d0, depth: GROUND });
    if (k === "energy") this.play("fx:fx_circle_spark", { x: center.x, y: center.y, scale: 0.8 + radius * 0.4, tint: pal.main, add: true, depth: GROUND });
    if (k === "holy") this.play("fx:sp_boost", { x: center.x, y: center.y, scale: 0.9 + radius * 0.3, tint: pal.main, add: true, depth: FX_DEPTH - 3 });
    if (mine) this.ctx.shake(130 + radius * 30, 0.003 + radius * 0.0007);
    if (k === "fire" && a.gain > 0) sfx.play("sp_fire_hit", { volume: 0.85 * a.gain });
  }

  private wave(a: CastArgs) {
    const { def, caster, mine, pal, msg } = a;
    const k = def.fx;
    const ox = caster ? caster.bodyX : a.center.x, oy = caster ? caster.ry + TS / 2 : a.center.y;
    const list = a.tiles;
    this.ring(ox, oy + 2, pal.main, 4, 22, 260, { flat: true });
    for (let i = 0; i + 1 < list.length; i += 2) {
      const t = tc(list[i], list[i + 1]);
      const dist = Math.hypot(t.x - ox, t.y - oy) / TS;
      const d = dist * 38;
      this.tileFx(k, t.x, t.y, d, 0.9);
      this.later(d, () => { this.glow(t.x, t.y, pal.main, 20, 260, 0.5); this.sparks[k].explode(2, t.x, t.y); });
    }
    if (list.length === 0) { const c = a.center; this.tileFx(k, c.x, c.y, 0); void msg; }
    if (mine) this.ctx.shake(160, 0.0035);
  }

  // --- cura / buff ---------------------------------------------------------------------

  private healAt(x: number, y: number, feetY: number, k: FxKey) {
    const pal = PAL[k];
    this.play("fx:fx_circle_white", { x, y: feetY - 3, scale: 1.1, tint: pal.main, add: true, depth: GROUND });
    this.ring(x, feetY - 2, pal.light, 4, 20, 520, { flat: true });
    this.play("fx:sp_boost", { x, y: y - 2, scale: 1.3, tint: k === "heal" ? 0x9affb0 : pal.main, add: true, depth: FX_DEPTH - 3 });
    this.lightColumn(x, feetY, pal.main, 16, 46, 700);
    for (let i = 0; i < 9; i++) this.later(i * 70, () => this.risers.emitParticleAt(x + rnd(-8, 8), y + rnd(-2, 8)));
    this.sparks[k].explode(14, x, y);
    this.glow(x, y, pal.main, 40, 600, 0.7);
  }

  /** Coluna de luz ascendente a partir do pé. */
  private lightColumn(x: number, feetY: number, color: number, w: number, h: number, ms: number) {
    const b = this.acquire();
    b.setTexture(TEX.beam).setOrigin(0.5, 1).setPosition(x, feetY).setTint(color).setBlendMode(Phaser.BlendModes.ADD).setDepth(FX_DEPTH - 5);
    b.setDisplaySize(w * 0.6, 6).setAlpha(0.85);
    this.scene.tweens.add({ targets: b, displayHeight: h, displayWidth: w, alpha: 0, duration: ms, ease: "Cubic.easeOut", onComplete: () => this.release(b) });
  }

  private heal(a: CastArgs) {
    const { def, tiles, caster } = a;
    const k = def.fx;
    if (tiles.length >= 2) {
      for (let i = 0; i + 1 < tiles.length; i += 2) {
        const t = tc(tiles[i], tiles[i + 1]);
        this.later(i * 20, () => this.healAt(t.x, t.y, t.y + TS / 2, k));
      }
      return;
    }
    const tg = a.msg.targetId && a.msg.targetId !== a.msg.casterId ? this.ctx.actor(a.msg.targetId) : undefined;
    const sub = tg ?? caster;
    if (sub) this.healAt(sub.bodyX, sub.bodyY, sub.ry + TS, k);
    else this.healAt(a.center.x, a.center.y, a.center.y + TS / 2, k);
  }

  private buff(a: CastArgs) {
    const { caster, pal, tiles } = a;
    const spots: { x: number; y: number; feet: number }[] = [];
    if (tiles.length >= 2) for (let i = 0; i + 1 < tiles.length; i += 2) { const t = tc(tiles[i], tiles[i + 1]); spots.push({ x: t.x, y: t.y, feet: t.y + TS / 2 }); }
    else if (caster) spots.push({ x: caster.bodyX, y: caster.bodyY, feet: caster.ry + TS });
    else spots.push({ x: a.center.x, y: a.center.y, feet: a.center.y + TS / 2 });
    for (const sp of spots) {
      this.ring(sp.x, sp.feet - 2, pal.main, 4, 28, 520, { flat: true });
      this.ring(sp.x, sp.feet - 2, pal.light, 4, 18, 400, { flat: true, delay: 100 });
      this.lightColumn(sp.x, sp.feet, pal.main, 18, 50, 800);
      this.play("fx:sp_boost", { x: sp.x, y: sp.y - 2, scale: 1.3, tint: pal.main, add: true, depth: FX_DEPTH - 3 });
      this.play("fx:sp_shield", { x: sp.x, y: sp.y - 4, scale: 1.7, tint: pal.light, add: true, depth: FX_DEPTH - 3 });
      this.sparks.buff.explode(10, sp.x, sp.y);
      this.glow(sp.x, sp.y, pal.main, 30, 400, 0.55);
      // Aura de 1 s para quem não é o jogador local (a do jogador vem das condições).
      if (a.msg.casterId !== this.ctx.myId()) this.flashBubble(sp.x, sp.y, pal.main, 1000);
    }
  }

  private flashBubble(x: number, y: number, color: number, ms: number) {
    const b = this.acquire();
    b.setTexture(TEX.bubble).setPosition(x, y).setTint(color).setDepth(FX_DEPTH - 4).setAlpha(0.7).setScale(0.6);
    this.scene.tweens.add({ targets: b, scale: 1.05, alpha: { from: 0.75, to: 0 }, duration: ms, ease: "Sine.easeOut", onComplete: () => this.release(b) });
  }

  // --- invocar / raiz / provocar / investida ----------------------------------------

  private summon(a: CastArgs) {
    const { pal, tiles } = a;
    const spots: { x: number; y: number }[] = [];
    if (tiles.length >= 2) for (let i = 0; i + 1 < tiles.length; i += 2) spots.push(tc(tiles[i], tiles[i + 1]));
    else spots.push(a.center);
    if (a.caster) this.ring(a.caster.bodyX, a.caster.ry + TS - 2, pal.main, 4, 26, 520, { flat: true });
    spots.forEach((p, i) => {
      this.later(i * 90 + 120, () => {
        this.play("fx:fx_smoke", { x: p.x, y: p.y - 2, scale: 1.5, tint: 0xa05cd6, depth: FX_DEPTH - 4 });
        this.play("fx:sp_aura", { x: p.x, y: p.y + 6, oy: 0.85, scale: 1.2, tint: pal.main, add: true, depth: FX_DEPTH - 3 });
        this.play("fx:fx_circle_spark", { x: p.x, y: p.y + 2, scale: 1.2, tint: pal.light, add: true, depth: GROUND });
        this.ring(p.x, p.y + 4, pal.light, 4, 20, 400, { flat: true });
        this.sparks.summon.explode(14, p.x, p.y);
        this.glow(p.x, p.y, pal.main, 40, 480, 0.85);
        this.glow(p.x, p.y, 0xffffff, 16, 160, 0.9);
      });
    });
  }

  private root(a: CastArgs) {
    const { pal, tiles, tgt } = a;
    const spots: { x: number; y: number }[] = [];
    if (tiles.length >= 2) for (let i = 0; i + 1 < tiles.length; i += 2) spots.push(tc(tiles[i], tiles[i + 1]));
    else spots.push({ x: tgt.x, y: tgt.y });
    spots.forEach((p, i) => {
      const ty = tiles.length >= 2 ? p.y : a.msg.targetId && this.ctx.actor(a.msg.targetId) ? this.ctx.actor(a.msg.targetId)!.ry + TS / 2 : p.y;
      this.later(i * 40, () => {
        this.ring(p.x, ty + 3, pal.main, 4, 18, 420, { flat: true });
        for (const [dx, s, d] of [[-6, 0.45, 0], [6, 0.45, 60], [0, 0.6, 30]] as const) {
          this.play("fx:sp_spike", { x: p.x + dx, y: ty + 8, oy: 0.92, scale: s, tint: 0xb8ff9a, depth: 10 + ty + TS + 0.5, delay: d });
        }
        this.debris.explode(8, p.x, ty);
        this.sparks.root.explode(8, p.x, ty);
        this.glow(p.x, ty, pal.main, 26, 380, 0.5);
      });
    });
    if (a.mine) this.ctx.shake(90, 0.002);
  }

  private taunt(a: CastArgs) {
    const { caster, pal, def, mine } = a;
    const x = caster ? caster.bodyX : a.center.x, y = caster ? caster.ry + TS / 2 : a.center.y;
    const R = ((def.radius ?? 3) + 0.6) * TS;
    this.ring(x, y + 2, pal.main, 6, R, 520, { flat: true, alpha: 1 });
    this.ring(x, y + 2, pal.light, 4, R * 0.8, 440, { flat: true, delay: 120, alpha: 0.8 });
    this.ring(x, y + 2, pal.dark, 4, R * 1.05, 600, { flat: true, delay: 220, alpha: 0.9 });
    this.play("fx:sp_ring", { x, y: y + 4, scale: 1 + R / 40, tint: 0xff5a4a, depth: GROUND });
    this.glow(x, y, pal.main, R, 480, 0.55);
    this.sparks.taunt.explode(18, x, y);
    if (caster) this.cfx.floatText(caster.headX, caster.headY - 16, "!", 0xff4a3a, { size: 24, life: 900, rise: 12, dx: 0 });
    if (mine) this.ctx.shake(160, 0.0035);
  }

  private charge(a: CastArgs) {
    const { caster, pal } = a;
    if (!caster) return;
    const end = a.center;
    const start = { x: caster.bodyX, y: caster.bodyY };
    // Rastro: cópias do sprite do conjurador seguindo seu caminho real.
    let n = 0;
    this.scene.time.addEvent({
      delay: 26, repeat: 9,
      callback: () => {
        const f = caster.frameInfo;
        const g = this.acquire();
        g.setTexture(f.key, f.frame).setOrigin(0.5, 1).setScale(caster.scale)
          .setPosition(Math.round(caster.rx) + TS / 2, Math.round(caster.ry) + TS + f.dy)
          .setTintFill(n % 2 ? pal.light : pal.main).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.65).setDepth(caster.root.depth - 0.1);
        n++;
        this.scene.tweens.add({ targets: g, alpha: 0, duration: 260, ease: "Quad.easeOut", onComplete: () => this.release(g) });
        this.cfx.puff(caster.bodyX, caster.ry + TS - 2);
      },
    });
    // Linha de velocidade do início ao destino.
    const ang = Math.atan2(end.y - start.y, end.x - start.x);
    const len = Math.hypot(end.x - start.x, end.y - start.y);
    for (let i = 0; i < (len > 14 ? 3 : 0); i++) {
      const l = this.acquire();
      l.setTexture(TEX.px).setPosition((start.x + end.x) / 2 + rnd(-2, 2), (start.y + end.y) / 2 + rnd(-5, 5)).setRotation(ang)
        .setDisplaySize(len + 8, 1).setTint(pal.light).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.8).setDepth(FX_DEPTH - 4);
      this.scene.tweens.add({ targets: l, alpha: 0, scaleY: 0, duration: 260, onComplete: () => this.release(l) });
    }
    this.later(150, () => {
      this.ring(end.x, end.y + 2, pal.main, 4, 24, 340, { flat: true });
      this.play("fx:fx_cut", { x: end.x, y: end.y, scale: 0.9, rot: ang, depth: FX_DEPTH - 3 });
      this.glow(end.x, end.y, pal.light, 30, 260, 0.6);
      this.sparks.charge.explode(10, end.x, end.y);
      if (a.mine) this.ctx.shake(110, 0.003);
    });
  }

  /** Brilho de skill: partículas douradas sobre um ator. */
  sparkle(id: string) {
    const a = this.ctx.actor(id);
    if (!a) return;
    this.play("fx:sp_spark", { x: a.bodyX, y: a.bodyY - 4, scale: 1, tint: 0xffe066, add: true, depth: FX_DEPTH - 3 });
    this.sparks.holy.explode(10, a.bodyX, a.bodyY);
    this.glow(a.bodyX, a.bodyY, 0xffe066, 24, 450, 0.55);
  }

  // --- condições persistentes (jogador local) -----------------------------------------

  setSelfConditions(ids: ConditionId[]) {
    this.auraWanted = new Set(ids.filter((i) => i === "haste" || i === "protect" || i === "manashield" || i === "regen" || i === "rooted" || i === "taunted" || i === "berserk"));
    for (const [id, au] of this.auras) {
      if (!this.auraWanted.has(id)) { for (const o of au.objs) o.destroy(); this.auras.delete(id); }
    }
    for (const id of this.auraWanted) if (!this.auras.has(id)) this.makeAura(id);
  }

  private makeAura(id: ConditionId) {
    const objs: Phaser.GameObjects.Image[] = [];
    const add = (tex: string, tint: number, blend: Phaser.BlendModes, alpha: number) => {
      const o = this.scene.add.image(0, 0, tex).setTint(tint).setBlendMode(blend).setAlpha(alpha);
      this.layer.add(o);
      objs.push(o);
      return o;
    };
    if (id === "manashield") {
      add(TEX.bubble, 0x4a90ff, Phaser.BlendModes.NORMAL, 0.5);
      add(TEX.bubble, 0x9fd0ff, Phaser.BlendModes.ADD, 0.4);
    } else if (id === "protect") {
      add(TEX.bubble, 0xc0c6d4, Phaser.BlendModes.NORMAL, 0.22);
      add(TEX.bubble, 0xffffff, Phaser.BlendModes.ADD, 0.12);
    } else if (id === "rooted") {
      add(TEX.ring, 0x7a9a3a, Phaser.BlendModes.NORMAL, 0.8);
    } else if (id === "taunted") {
      add(TEX.ring, 0xff4a3a, Phaser.BlendModes.ADD, 0.7);
    } else if (id === "berserk") {
      add(TEX.ring, 0xff6a2a, Phaser.BlendModes.ADD, 0.75);
    }
    this.auras.set(id, { id, objs, acc: 0 });
  }

  private updateAuras(dt: number, t: number) {
    const me = this.ctx.actor(this.ctx.myId());
    if (!me) return;
    const bx = me.bodyX, by = me.bodyY, fy = me.ry + TS - 1;
    for (const [id, au] of this.auras) {
      au.acc += dt;
      const depth = me.root.depth + 0.5;
      if (id === "manashield") {
        const p = 1 + Math.sin(t / 260) * 0.04;
        au.objs[0].setPosition(bx, by).setScale(p).setDepth(depth).setAlpha(0.35 + Math.sin(t / 400) * 0.08);
        au.objs[1].setPosition(bx, by).setScale(p).setDepth(depth).setAlpha(0.3 + Math.sin(t / 330 + 1) * 0.12);
        if (au.acc > 500) { au.acc = 0; const a = rnd(0, 6.28); this.sparks.buff.emitParticleAt(bx + Math.cos(a) * 12, by + Math.sin(a) * 12, 1); }
      } else if (id === "protect") {
        const p = 1 + Math.sin(t / 500) * 0.03;
        au.objs[0].setPosition(bx, by).setScale(p).setDepth(depth);
        au.objs[1].setPosition(bx, by).setScale(p).setDepth(depth).setAlpha(0.08 + Math.max(0, Math.sin(t / 700)) * 0.2);
        if (au.acc > 900) { au.acc = 0; const a = rnd(-2.6, -0.5); this.sparks.physical.emitParticleAt(bx + Math.cos(a) * 11, by + Math.sin(a) * 11, 1); }
      } else if (id === "rooted") {
        au.objs[0].setPosition(bx, fy - 2).setScale(0.3, 0.18).setDepth(GROUND);
        if (au.acc > 800) { au.acc = 0; this.debris.emitParticleAt(bx + rnd(-6, 6), fy - 1, 1); }
      } else if (id === "taunted") {
        const k = (t % 900) / 900;
        au.objs[0].setPosition(bx, fy - 2).setScale(0.22 + k * 0.12, (0.22 + k * 0.12) * 0.55).setAlpha(0.8 * (1 - k)).setDepth(GROUND);
      } else if (id === "berserk") {
        // Fúria: anel vermelho pulsando nos pés e faíscas de fogo subindo.
        const k = 0.5 + Math.sin(t / 180) * 0.5;
        au.objs[0].setPosition(bx, fy - 2).setScale(0.3 + k * 0.05, (0.3 + k * 0.05) * 0.55).setAlpha(0.45 + k * 0.4).setDepth(GROUND);
        if (au.acc > 140) { au.acc = 0; this.sparks.fire.emitParticleAt(bx + rnd(-7, 7), by + rnd(-2, 8), 1); }
      } else if (id === "regen") {
        if (au.acc > 150) { au.acc = 0; this.motes.emitParticleAt(bx + rnd(-8, 8), by + rnd(-2, 8)); }
      } else if (id === "haste") {
        const dx = me.rx - this.lastPos.x, dy = me.ry - this.lastPos.y;
        this.streakAcc += dt;
        if ((Math.abs(dx) > 0.05 || Math.abs(dy) > 0.05) && this.streakAcc > 55) {
          this.streakAcc = 0;
          const horiz = Math.abs(dx) >= Math.abs(dy);
          const e = horiz ? this.streakH : this.streakV;
          e.emitParticleAt(bx - Math.sign(horiz ? dx : 0) * 9 + (horiz ? 0 : rnd(-6, 6)), by - Math.sign(horiz ? 0 : dy) * 9 + (horiz ? rnd(-6, 6) : 0), 1);
          this.cfx.puff(bx, fy);
        }
      }
    }
    this.lastPos.x = me.rx; this.lastPos.y = me.ry;
  }

  // --- frame -----------------------------------------------------------------------------

  update(dtRaw: number, time: number) {
    const dt = dtRaw * this.scene.time.timeScale;
    for (let i = this.projs.length - 1; i >= 0; i--) {
      const p = this.projs[i];
      p.t += dt;
      const k = Math.min(1, p.t / p.dur);
      const x = p.fx + (p.tx - p.fx) * k, y = p.fy + (p.ty - p.fy) * k;
      p.s.setPosition(Math.round(x), Math.round(y));
      lightBus.point(x, y, PAL[p.key]?.main ?? 0xffffff, 40, 0.85);
      if (p.spin) p.s.rotation += p.spin * dt;
      p.trailAcc += dt;
      if (p.trailAcc > 22) { p.trailAcc = 0; this.sparks[p.key]?.emitParticleAt(x + rnd(-1.5, 1.5), y + rnd(-1.5, 1.5), 1); }
      if (k >= 1) {
        this.projs.splice(i, 1);
        this.release(p.s);
        p.done();
      }
    }
    this.updateAuras(dt, time);
    void this.pcam; void this.scale;
  }

  destroy() {
    for (const au of this.auras.values()) for (const o of au.objs) o.destroy();
    this.auras.clear();
    for (const g of this.glows) g.destroy();
    for (const s of this.free) s.destroy();
    this.free = []; this.glows = []; this.projs = [];
  }
}

interface CastArgs {
  def: SpellDef; msg: SpellCastMsg; caster: Actor | undefined; mine: boolean; pal: Pal;
  cx: number; cy: number; tiles: number[]; tgt: { x: number; y: number }; center: { x: number; y: number };
  /** Volume relativo (distância ao jogador local). */
  gain: number;
}

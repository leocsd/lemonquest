// Personagem renderizado: sprite + sombra + nome, com interpolação de passos encadeados.
import Phaser from "phaser";
import { BASE_STEP_MS, TILE_SIZE, type Dir, type Facing } from "@lemonquest/shared";
import { dirToFacing } from "./facing.ts";
import { playSegments, type Segment } from "./segments.ts";
import { ADDON_ORIGIN_Y, walkAnimKey, type CharacterLook } from "./sprites.ts";
import { TEX } from "./textures.ts";
import { textRes } from "./textRes.ts";

/** Saltos maiores que isto (em tiles) são teleporte/respawn: sem animação. */
const SNAP_TILES = 2;
/** Tempo parado antes de voltar ao frame "idle" (evita piscar entre passos encadeados). */
const IDLE_GRACE_MS = 70;

export interface ActorDeps {
  scene: Phaser.Scene;
  worldLayer: Phaser.GameObjects.Layer;
  uiLayer: Phaser.GameObjects.Layer;
  /** Arredonda uma coordenada de mundo para o pixel de tela (1/zoom). */
  snap: (v: number) => number;
  /** Início de um passo andando, com o canto do tile de origem (px) e a duração do passo. */
  onStepStart?: (px: number, py: number, ms: number) => void;
}

export interface ActorOpts {
  /** Escala visual do sprite (chefes). */
  scale?: number;
  /** Tamanho da fonte do nome em px (padrão 11). */
  fontSize?: number;
  /** Cor do nome (padrão branco / amarelo para o próprio jogador). */
  nameColor?: string;
  /** Faixa opaca do frame (px): apoia os pés no tile e posiciona nome/barra rente à cabeça. */
  trim?: { top: number; bottom: number };
  /** Sem barra de HP (NPCs). */
  noBar?: boolean;
  /** Nome e barra com a cor da vida, como no Tibia (jogadores): verde cheio → vermelho. Ignora nameColor. */
  hpName?: boolean;
}

const BAR_COLORS = { hi: 0x3fae4a, mid: 0xd9b43a, low: 0xc9433f };
/** Faixas de vida do Tibia (fração mínima → cor), usadas no nome e na barra dos jogadores. */
const HP_TIERS: readonly [number, number][] = [[0.92, 0x00c000], [0.6, 0x60c060], [0.3, 0xc0c000], [0.08, 0xc03030], [0, 0xc00000]];
const hpTierColor = (p: number): number => HP_TIERS.find(([min]) => p >= min)![1];
const cssHex = (c: number) => `#${c.toString(16).padStart(6, "0")}`;
/** Membros do seu grupo: nome verde-claro + escudinho ao lado. */
export const PARTY_NAME_COLOR = "#9dff8a";
const PARTY_SHIELD_TEX = "party-shield";
/** Fala sobre a cabeça (estilo Tibia): amarelo com contorno, sem itálico, empilha até SPEECH_MAX linhas e some sozinha. */
const SPEECH_COLOR = "#ffe84d";
export const SPEECH_COLOR_PARTY = "#7fd8ff";
/** Espaço entre o nome e a fala (o nome de jogador tem a cor da vida; a fala é amarela e menor, para não confundir). */
const SPEECH_GAP = 5;
const SPEECH_MAX = 3;
const SPEECH_FADE_MS = 500;
const EMOTE_MS = 2200;
const SPEECH_WRAP_W = 190;
/** Fala longa vira "…" no balão (o chat guarda o texto inteiro): 200 caracteres cobririam ~8 linhas de tela. */
const SPEECH_MAX_CHARS = 90;
const speechMs = (text: string) => Math.min(9000, 3500 + text.length * 60);

/** Escudinho 7×8 (gerado uma vez). */
function ensurePartyShield(scene: Phaser.Scene) {
  if (scene.textures.exists(PARTY_SHIELD_TEX)) return;
  const tex = scene.textures.createCanvas(PARTY_SHIELD_TEX, 7, 8)!;
  const c = tex.getContext();
  const rows = ["0111110", "1222221", "1222221", "1222221", "1222221", "0122210", "0012100", "0001000"];
  rows.forEach((r, y) => [...r].forEach((ch, x) => {
    if (ch === "0") return;
    c.fillStyle = ch === "1" ? "#0f2a12" : "#7ee06d";
    c.fillRect(x, y, 1, 1);
  }));
  tex.refresh();
}
/** Caveira 7×7 do PvP (branca / vermelha), gerada uma vez por cor. */
const SKULL_FILL = { white: "#f2efe0", red: "#ff3b30" } as const;
export type SkullKind = keyof typeof SKULL_FILL;
function ensureSkull(scene: Phaser.Scene, kind: SkullKind): string {
  const key = `skull-${kind}`;
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, 7, 7)!;
  const c = tex.getContext();
  const rows = ["0111110", "1222221", "1202021", "1222221", "0122210", "0121210", "0011100"];
  rows.forEach((r, y) => [...r].forEach((ch, x) => {
    if (ch === "0") return;
    c.fillStyle = ch === "1" ? "#1a0d0d" : SKULL_FILL[kind];
    c.fillRect(x, y, 1, 1);
  }));
  tex.refresh();
  return key;
}
const BAR_COLORS_SELF = { hi: 0x5be06a, mid: 0xffd447, low: 0xff5a52 };

export class Actor {
  /** Tile autoritativo/alvo final da fila. */
  tileX: number;
  tileY: number;
  /** Posição renderizada (px, canto superior esquerdo do tile). */
  rx: number;
  ry: number;
  /** Instante (performance.now) em que o último passo da fila terminou (emenda dos passos previstos). */
  endAt = 0;
  facing: Facing;
  readonly scale: number;
  /** Escondido por estar longe da câmera. */
  culled = false;
  /** Escondido por ter virado cadáver (animação de morte independente). */
  ghosted = false;
  /** Sem barra de HP (NPCs). */
  readonly noBar: boolean;
  /** Nome/barra na cor da vida (jogadores). */
  private readonly hpName: boolean;

  readonly root: Phaser.GameObjects.Container;
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly label: Phaser.GameObjects.Text;
  private readonly shadow: Phaser.GameObjects.Image;
  private readonly barBg: Phaser.GameObjects.Image;
  private readonly barGhost: Phaser.GameObjects.Image;
  private readonly barFill: Phaser.GameObjects.Image;
  private queue: Segment[] = [];
  private idleFor = 0;
  private stepMs = BASE_STEP_MS;
  private baseY = 0;
  private contentH: number;
  /** Overlays de addon (roupas de jogador): seguem o frame da base, na frente ou atrás dela. */
  private overlays: { spr: Phaser.GameObjects.Sprite; back: boolean }[] = [];
  private extraTop = 0;
  /** Marca de grupo (escudinho) e cor original do nome. */
  private partyIcon: Phaser.GameObjects.Image | null = null;
  private skullIcon: Phaser.GameObjects.Image | null = null;
  private skullKind = "";
  private baseNameColor = "#ffffff";
  /** Falas ativas, da mais antiga para a mais nova. */
  private speech: { text: Phaser.GameObjects.Text; age: number; ttl: number }[] = [];
  /** Nome do jogador (o label pode ter o título numa 2ª linha). */
  readonly name: string;

  // HP
  private hpTarget = 1;
  private hpShown = 1;
  private hpGhost = 1;
  private ghostDelay = 0;
  private lastBarColor = -1;
  private readonly colors: typeof BAR_COLORS;

  // Feedback de combate
  private flashLeft = 0;
  private freezeLeft = 0;
  private kbx = 0;
  private kby = 0;

  constructor(
    private readonly deps: ActorDeps,
    private look: CharacterLook,
    name: string,
    readonly isMe: boolean,
    x: number, y: number, dir: Dir,
    opts: ActorOpts = {},
  ) {
    const { scene } = deps;
    this.name = name;
    this.tileX = x; this.tileY = y;
    this.rx = x * TILE_SIZE; this.ry = y * TILE_SIZE;
    this.facing = dirToFacing(dir);
    this.scale = opts.scale ?? 1;
    this.noBar = !!opts.noBar;
    this.hpName = !!opts.hpName;
    const fh = look.sheet.frameHeight;
    this.contentH = opts.trim ? opts.trim.bottom - opts.trim.top : fh;
    this.baseY = opts.trim ? (fh - opts.trim.bottom) * this.scale : 0;
    this.colors = isMe ? BAR_COLORS_SELF : BAR_COLORS;

    this.shadow = scene.add.image(0, 0, TEX.shadow).setOrigin(0.5, 0.5).setAlpha(0.35).setScale(this.scale);
    this.sprite = scene.add.sprite(0, 0, look.sheet.key, look.sheet.idle[this.facing]).setOrigin(0.5, 1).setScale(this.scale);
    if (look.tint !== 0xffffff) this.sprite.setTint(look.tint);
    this.root = scene.add.container(0, 0, [this.shadow, this.sprite]);
    this.shadow.setPosition(0, -1);
    this.buildOverlays();
    deps.worldLayer.add(this.root);

    this.label = scene.add.text(0, 0, name, {
      fontFamily: "Verdana, Tahoma, system-ui, sans-serif",
      fontSize: `${opts.fontSize ?? 11}px`,
      fontStyle: "bold",
      color: (this.baseNameColor = this.hpName ? cssHex(hpTierColor(1)) : opts.nameColor ?? (isMe ? "#ffe066" : "#ffffff")),
      stroke: "#101018",
      strokeThickness: opts.fontSize && opts.fontSize < 11 ? 2 : 3,
      resolution: textRes(),
    }).setOrigin(0.5, 1);
    deps.uiLayer.add(this.label);

    this.barBg = scene.add.image(0, 0, TEX.px).setOrigin(0, 0).setTint(0x08090d).setAlpha(0.92);
    this.barGhost = scene.add.image(0, 0, TEX.px).setOrigin(0, 0).setTint(0xf2efe0).setAlpha(0.85);
    this.barFill = scene.add.image(0, 0, TEX.px).setOrigin(0, 0);
    deps.uiLayer.add([this.barBg, this.barGhost, this.barFill]);
    this.syncDisplay();
  }

  /** Título (conquistas) numa 2ª linha logo acima da barra, abaixo do nome. "" remove. */
  setTitle(title: string) {
    const name = this.label.text.split("\n")[0]!;
    const t = title ? `${name}\n${title}` : name;
    if (this.label.text !== t) this.label.setText(t);
  }

  /** Membro do meu grupo: escudinho ao lado do nome e (para os outros, se o nome não segue a vida) nome verde-claro. */
  setParty(on: boolean) {
    if (on === !!this.partyIcon) return;
    if (on) {
      ensurePartyShield(this.deps.scene);
      this.partyIcon = this.deps.scene.add.image(0, 0, PARTY_SHIELD_TEX).setOrigin(1, 0.5).setScale(2);
      this.deps.uiLayer.add(this.partyIcon);
      if (!this.isMe && !this.hpName) this.label.setColor(PARTY_NAME_COLOR);
      this.placePartyIcon();
      this.applyVisible();
    } else {
      this.partyIcon?.destroy();
      this.partyIcon = null;
      this.label.setColor(this.baseNameColor);
    }
  }

  get inParty(): boolean { return !!this.partyIcon; }

  /** Caveira do PvP à direita do nome ("" remove). */
  setSkull(kind: string) {
    if (kind === this.skullKind) return;
    this.skullKind = kind;
    this.skullIcon?.destroy();
    this.skullIcon = null;
    if (kind !== "white" && kind !== "red") return;
    this.skullIcon = this.deps.scene.add.image(0, 0, ensureSkull(this.deps.scene, kind)).setOrigin(0, 0.5).setScale(2);
    this.deps.uiLayer.add(this.skullIcon);
    this.placePartyIcon();
    this.applyVisible();
  }

  private placePartyIcon() {
    this.skullIcon?.setPosition(Math.round(this.label.x + this.label.displayWidth / 2 + 2), Math.round(this.label.y - this.label.displayHeight / 2));
    if (!this.partyIcon) return;
    this.partyIcon.setPosition(Math.round(this.label.x - this.label.displayWidth / 2 - 2), Math.round(this.label.y - this.label.displayHeight / 2));
  }

  /** Mostra uma fala sobre a cabeça. */
  speak(text: string, color = SPEECH_COLOR) {
    const full = text.trim();
    if (!full) return;
    const t = full.length > SPEECH_MAX_CHARS ? `${full.slice(0, SPEECH_MAX_CHARS - 1).trimEnd()}…` : full;
    const obj = this.deps.scene.add.text(0, 0, t, {
      fontFamily: "Verdana, Tahoma, system-ui, sans-serif", fontSize: "10px",
      color, stroke: "#101018", strokeThickness: 3, align: "center",
      wordWrap: { width: SPEECH_WRAP_W, useAdvancedWrap: true }, resolution: textRes(),
    }).setOrigin(0.5, 1);
    this.pushSpeech(obj, speechMs(t));
  }

  /** Emote: símbolo maior, em negrito, que some mais rápido que uma fala. */
  emote(glyph: string, color: string) {
    const obj = this.deps.scene.add.text(0, 0, glyph, {
      fontFamily: "Verdana, Tahoma, system-ui, sans-serif", fontSize: "17px", fontStyle: "bold",
      color, stroke: "#101018", strokeThickness: 4, align: "center", resolution: textRes(),
    }).setOrigin(0.5, 1);
    this.pushSpeech(obj, EMOTE_MS);
  }

  private pushSpeech(obj: Phaser.GameObjects.Text, ttl: number) {
    this.deps.uiLayer.add(obj);
    this.speech.push({ text: obj, age: 0, ttl });
    while (this.speech.length > SPEECH_MAX) this.speech.shift()!.text.destroy();
    this.applyVisible();
  }

  /** Falas ativas (para o probe dos testes E2E). */
  speechLines(): { text: string; color: string }[] {
    return this.speech.map((s) => ({ text: s.text.text, color: String(s.text.style.color) }));
  }

  /** Avança o tempo das falas e as empilha acima do nome (a mais nova embaixo). */
  private placeSpeech(dtMs: number) {
    if (!this.speech.length) return;
    let top = this.label.y - this.label.displayHeight - SPEECH_GAP;
    this.speech = this.speech.filter((s) => {
      s.age += dtMs;
      if (s.age >= s.ttl) { s.text.destroy(); return false; }
      return true;
    });
    for (let i = this.speech.length - 1; i >= 0; i--) {
      const s = this.speech[i]!;
      const left = s.ttl - s.age;
      s.text.setAlpha(left < SPEECH_FADE_MS ? left / SPEECH_FADE_MS : 1).setPosition(Math.round(this.label.x), Math.round(top));
      top -= s.text.displayHeight + 1;
    }
  }

  setName(name: string, color?: string) {
    if (this.label.text !== name) this.label.setText(name);
    if (color && this.label.style.color !== color) this.label.setColor(color);
  }

  /** HP atual (a barra anima até lá). `instant` pula a animação (spawn). */
  setHp(hp: number, maxHp: number, instant = false) {
    const p = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
    if (p < this.hpTarget - 0.0001) this.ghostDelay = 260;
    this.hpTarget = p;
    if (instant) { this.hpShown = this.hpGhost = p; }
    else if (p > this.hpGhost) this.hpGhost = p;
  }

  /** Flash branco curto no sprite. */
  flash(ms = 80) {
    this.flashLeft = ms;
    this.sprite.setTintFill(0xffffff);
    for (const o of this.overlays) o.spr.setTintFill(0xffffff);
  }

  /** Troca o visual (roupa/addons) sem recriar o ator. */
  setLook(look: CharacterLook) {
    const sig = (l: CharacterLook) => `${l.sheet.key}|${(l.addons ?? []).map((a) => a.sheet.key).join(",")}|${l.tint}`;
    if (sig(look) === sig(this.look)) return;
    const frame = Number(this.sprite.frame.name);
    this.look = look;
    const walking = this.sprite.anims.isPlaying;
    if (walking) this.sprite.anims.stop();
    this.sprite.setTexture(look.sheet.key, Number.isFinite(frame) ? frame : look.sheet.idle[this.facing]);
    if (walking) this.playWalk();
    this.buildOverlays();
    this.restoreTint();
    this.syncDisplay();
  }

  private buildOverlays() {
    for (const o of this.overlays) o.spr.destroy();
    this.overlays = [];
    const { scene } = this.deps;
    const frame = this.sprite.frame.name;
    for (const layer of this.look.addons ?? []) {
      if (!scene.textures.exists(layer.sheet.key)) continue;
      const spr = scene.add.sprite(0, 0, layer.sheet.key, frame).setOrigin(0.5, ADDON_ORIGIN_Y).setScale(this.scale);
      if (this.look.tint !== 0xffffff) spr.setTint(this.look.tint);
      // atrás: logo antes da base; frente: depois da base (e dos overlays de frente anteriores)
      const baseIdx = this.root.getIndex(this.sprite);
      if (layer.back) this.root.addAt(spr, baseIdx);
      else this.root.addAt(spr, this.root.length);
      this.overlays.push({ spr, back: layer.back });
    }
    this.extraTop = this.overlays.length ? this.look.extraTop ?? 0 : 0;
  }

  private restoreTint() {
    for (const s of [this.sprite, ...this.overlays.map((o) => o.spr)]) {
      if (this.look.tint !== 0xffffff) s.setTint(this.look.tint); else s.clearTint();
    }
  }

  /** Empurrão de `px` pixels na direção (dx,dy) (normalizada aqui), que volta suavemente. */
  nudge(dx: number, dy: number, px = 2) {
    const l = Math.hypot(dx, dy);
    if (l < 0.001) return;
    this.kbx = (dx / l) * px;
    this.kby = (dy / l) * px;
  }

  /** Congela a animação de caminhada por `ms` (hit-stop em críticos). */
  hitStop(ms: number) {
    this.freezeLeft = ms;
    if (this.sprite.anims.isPlaying) this.sprite.anims.pause();
  }

  /** Estado visual para criar um "cadáver" independente do estado do servidor. */
  get frameInfo() {
    return { key: this.look.sheet.key, frame: this.sprite.frame.name, tint: this.look.tint, dy: this.baseY };
  }

  /** Esconde tudo (virou cadáver). */
  ghost() {
    this.ghosted = true;
    this.applyVisible();
  }

  setCulled(c: boolean) {
    if (this.culled === c) return;
    this.culled = c;
    this.applyVisible();
  }

  private applyVisible() {
    const v = !this.culled && !this.ghosted;
    this.root.setVisible(v);
    this.label.setVisible(v);
    for (const s of this.speech) s.text.setVisible(v);
    this.partyIcon?.setVisible(v);
    this.skullIcon?.setVisible(v);
    this.barBg.setVisible(v && !this.noBar);
    this.barGhost.setVisible(v && !this.noBar);
    this.barFill.setVisible(v && !this.noBar);
  }

  /**
   * Posiciona nome + barra na câmera de UI. (sx, sy) = ponto da cabeça em px de tela; zoom = zoom do mundo.
   */
  placeUi(sx: number, sy: number, zoom: number, dtMs: number) {
    if (this.culled || this.ghosted) return;
    if (this.noBar) {
      this.barBg.setVisible(false); this.barGhost.setVisible(false); this.barFill.setVisible(false);
      this.label.setPosition(Math.round(sx), Math.round(sy) - 1);
      this.placePartyIcon();
      this.placeSpeech(dtMs);
      return;
    }
    // Barra: anima largura e fantasma de dano.
    const k = 1 - Math.exp(-16 * dtMs / 1000);
    this.hpShown += (this.hpTarget - this.hpShown) * k;
    if (Math.abs(this.hpTarget - this.hpShown) < 0.002) this.hpShown = this.hpTarget;
    if (this.ghostDelay > 0) this.ghostDelay -= dtMs;
    else if (this.hpGhost > this.hpShown) {
      this.hpGhost += (this.hpShown - this.hpGhost) * (1 - Math.exp(-9 * dtMs / 1000));
      if (this.hpGhost - this.hpShown < 0.002) this.hpGhost = this.hpShown;
    }
    const inner = zoom >= 3 ? 3 : 2;
    const w = Math.max(10, Math.round(TILE_SIZE * 0.75 * zoom * Math.min(this.scale, 1.6)));
    const x0 = Math.round(sx - w / 2) - 1;
    const y0 = Math.round(sy) - (inner + 2);
    this.barBg.setPosition(x0, y0).setScale(w + 2, inner + 2);
    const fw = Math.round(w * this.hpShown), gw = Math.round(w * Math.max(this.hpGhost, this.hpShown));
    this.barGhost.setPosition(x0 + 1, y0 + 1).setScale(gw, inner).setVisible(gw > fw);
    this.barFill.setPosition(x0 + 1, y0 + 1).setScale(fw, inner).setVisible(fw > 0);
    const col = this.hpName ? hpTierColor(this.hpTarget) : this.hpTarget > 0.6 ? this.colors.hi : this.hpTarget > 0.3 ? this.colors.mid : this.colors.low;
    if (col !== this.lastBarColor) {
      this.lastBarColor = col;
      this.barFill.setTint(col);
      if (this.hpName) this.label.setColor((this.baseNameColor = cssHex(col)));
    }
    this.label.setPosition(Math.round(sx), y0 - 1);
    this.placePartyIcon();
    this.placeSpeech(dtMs);
  }

  /** Último tile da fila (para onde o ator está indo). */
  private get endPx() {
    const last = this.queue[this.queue.length - 1];
    return last ? { x: last.tx, y: last.ty } : { x: this.rx, y: this.ry };
  }

  get isMoving() { return this.queue.length > 0; }

  /**
   * Novo passo vindo do servidor/predição: encadeia depois do que já está na fila. `at` = início do passo no relógio da
   * predição (performance.now), só para os passos previstos do próprio jogador (ver Segment.at).
   */
  stepTo(x: number, y: number, ms: number, dir: Dir, at?: number) {
    const far = Math.max(Math.abs(x - this.tileX), Math.abs(y - this.tileY)) > SNAP_TILES;
    this.tileX = x; this.tileY = y;
    if (far) return this.snapTo(x, y, dir);
    const from = this.endPx;
    this.queue.push({
      fx: from.x, fy: from.y, tx: x * TILE_SIZE, ty: y * TILE_SIZE,
      dur: Math.max(1, ms), t: 0, walk: true, started: false, facing: dirToFacing(dir), at,
    });
  }

  /** Deslize rápido até um tile distante (investida): sem snap, com animação de caminhada. */
  dashTo(x: number, y: number, ms: number, dir: Dir) {
    this.tileX = x; this.tileY = y;
    this.queue = [{
      fx: this.rx, fy: this.ry, tx: x * TILE_SIZE, ty: y * TILE_SIZE,
      dur: Math.max(1, ms), t: 0, walk: true, started: false, facing: dirToFacing(dir),
    }];
  }

  /** Correção curta (reconciliação): descarta a fila e desliza até o tile. */
  correctTo(x: number, y: number, ms = 100) {
    this.tileX = x; this.tileY = y;
    if (Math.max(Math.abs(this.rx / TILE_SIZE - x), Math.abs(this.ry / TILE_SIZE - y)) > SNAP_TILES) {
      return this.snapTo(x, y);
    }
    this.queue = [{ fx: this.rx, fy: this.ry, tx: x * TILE_SIZE, ty: y * TILE_SIZE, dur: ms, t: 0, walk: false, started: true }];
  }

  snapTo(x: number, y: number, dir?: Dir) {
    this.tileX = x; this.tileY = y;
    this.queue = [];
    this.rx = x * TILE_SIZE; this.ry = y * TILE_SIZE;
    if (dir !== undefined) this.facing = dirToFacing(dir);
    this.idleFor = IDLE_GRACE_MS;
    this.showIdle();
    this.syncDisplay();
  }

  /** Vira para um lado do sheet (NPCs). */
  faceSide(f: Facing) {
    this.facing = f;
    if (!this.isMoving) this.showIdle();
  }

  face(dir: Dir) {
    this.facing = dirToFacing(dir);
    if (!this.isMoving) this.showIdle();
  }

  /** `now` = performance.now do quadro (o mesmo relógio da predição). */
  update(dtMs: number, now = performance.now()) {
    playSegments(this.queue, this, dtMs, now, this.onSegmentStart);

    // Feedback de combate (sem alocações): flash, hit-stop e retorno do empurrão.
    if (this.flashLeft > 0) {
      this.flashLeft -= dtMs;
      if (this.flashLeft <= 0) this.restoreTint();
    }
    if (this.freezeLeft > 0) {
      this.freezeLeft -= dtMs;
      if (this.freezeLeft <= 0 && this.sprite.anims.isPaused) this.sprite.anims.resume();
    }
    if (this.kbx !== 0 || this.kby !== 0) {
      const d = Math.exp(-dtMs / 45);
      this.kbx *= d; this.kby *= d;
      if (Math.abs(this.kbx) < 0.05 && Math.abs(this.kby) < 0.05) { this.kbx = 0; this.kby = 0; }
    }

    const head = this.queue[0];
    if (this.freezeLeft > 0) {
      // animação congelada (hit-stop)
    } else if (head?.walk) {
      this.idleFor = 0;
      this.playWalk();
    } else if (!head) {
      this.idleFor += dtMs;
      if (this.idleFor >= IDLE_GRACE_MS) this.showIdle();
    }
    this.syncDisplay();
  }

  /** Recalcula profundidade/posições. Os rótulos são posicionados pela cena (câmera de UI). */
  private syncDisplay() {
    const { snap } = this.deps;
    const px = snap(this.rx) + TILE_SIZE / 2;
    const py = snap(this.ry) + TILE_SIZE;
    this.root.setPosition(px, py);
    // O setter de depth do Phaser SEMPRE agenda uma reordenação da display list (~1 000 objetos com 580 atores),
    // mesmo com o valor igual: só escreve quando mudou (PERF-14, ciclo 9).
    const depth = 10 + this.ry + TILE_SIZE;
    if (this.root.depth !== depth) this.root.setDepth(depth);
    this.sprite.setPosition(Math.round(this.kbx), Math.round(this.kby) + this.baseY);
    if (this.overlays.length) {
      const f = this.sprite.frame.name;
      for (const o of this.overlays) {
        o.spr.setPosition(this.sprite.x, this.sprite.y);
        if (o.spr.frame.name !== f) o.spr.setFrame(f);
      }
    }
  }

  /** Ponto (mundo) acima da cabeça, para o nome. */
  get headX() { return this.deps.snap(this.rx) + TILE_SIZE / 2; }
  get headY() { return this.deps.snap(this.ry) + TILE_SIZE - (this.contentH + this.extraTop) * this.scale - 1; }
  /** Centro do corpo (px de mundo) — origem/destino de projéteis e efeitos. */
  get bodyX() { return this.rx + TILE_SIZE / 2; }
  get bodyY() { return this.ry + TILE_SIZE - (this.contentH * this.scale) / 2; }

  private onSegmentStart = (s: Segment) => {
    if (!s.walk) return;
    this.facing = s.facing ?? this.facingOf(s);
    // Ritmo das pernas segue a duração DESTE passo (lama = passos lentos, estrada = rápidos).
    this.stepMs = s.dur;
    this.deps.onStepStart?.(s.fx, s.fy, s.dur);
  };

  private facingOf(s: Segment): Facing {
    const dx = Math.sign(s.tx - s.fx), dy = Math.sign(s.ty - s.fy);
    if (dx > 0) return "right";
    if (dx < 0) return "left";
    if (dy < 0) return "up";
    if (dy > 0) return "down";
    return this.facing;
  }

  private playWalk() {
    const key = walkAnimKey(this.look.sheet, this.facing);
    const anims = this.sprite.anims;
    if (anims.currentAnim?.key !== key || !anims.isPlaying) anims.play(key, true);
    anims.timeScale = BASE_STEP_MS / this.stepMs;
  }

  private showIdle() {
    if (this.sprite.anims.isPlaying) this.sprite.anims.stop();
    this.sprite.setFrame(this.look.sheet.idle[this.facing]);
  }

  destroy() {
    this.root.destroy();
    this.label.destroy();
    for (const s of this.speech) s.text.destroy();
    this.partyIcon?.destroy();
    this.skullIcon?.destroy();
    this.barBg.destroy();
    this.barGhost.destroy();
    this.barFill.destroy();
  }
}

/** Registra as animações de caminhada de todos os sheets (uma vez por cena). */
export function createCharacterAnims(scene: Phaser.Scene, sheets: CharacterLook["sheet"][]) {
  for (const sheet of sheets) {
    for (const f of ["down", "up", "left", "right"] as Facing[]) {
      const key = walkAnimKey(sheet, f);
      if (scene.anims.exists(key)) continue;
      const frames = sheet.walk[f];
      scene.anims.create({
        key,
        frames: scene.anims.generateFrameNumbers(sheet.key, { frames }),
        frameRate: (frames.length * 1000) / (sheet.stepsPerCycle * BASE_STEP_MS),
        repeat: -1,
      });
    }
  }
}

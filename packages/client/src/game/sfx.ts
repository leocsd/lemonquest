// Efeitos sonoros (Web Audio). Carregamento preguiçoso; o contexto só destrava na primeira interação.
import { persistedBool, persistedJson } from "../ui/hud/store.ts";

const BASE = `${import.meta.env.BASE_URL}ninja/Audio/`;
const S = "Sounds/";

/** Nome lógico → arquivos (sorteia entre variações). */
const SOUNDS = {
  hit: [S + "Hit & Impact/Hit1.wav", S + "Hit & Impact/Hit2.wav", S + "Hit & Impact/Hit3.wav", S + "Hit & Impact/Hit5.wav"],
  hurt: [S + "Hit & Impact/Hit6.wav", S + "Hit & Impact/Hit7.wav"],
  crit: [S + "Hit & Impact/Impact2.wav", S + "Hit & Impact/Impact3.wav"],
  miss: [S + "Whoosh & Slash/Whoosh.wav", S + "Whoosh & Slash/Whoosh2.wav"],
  shoot: [S + "Whoosh & Slash/Launch.wav"],
  slash: [S + "Whoosh & Slash/Slash.wav", S + "Whoosh & Slash/Slash2.wav"],
  death: [S + "Magic & Skill/Spirit.wav"],
  xp: [S + "Bonus/Coin.wav", S + "Bonus/Coin2.wav"],
  heal: [S + "Magic & Skill/Heal.wav"],
  levelup: ["Jingles/LevelUp1.wav"],
  died: ["Jingles/GameOver3.wav"],
  fire: [S + "Elemental/Fireball.wav"],
  sp_fire: [S + "Elemental/Fireball2.wav"],
  sp_fire_hit: [S + "Elemental/Explosion3.wav", S + "Elemental/Explosion2.wav"],
  sp_ice: [S + "Elemental/Water5.wav", S + "Elemental/Bubble2.wav"],
  sp_energy: [S + "Magic & Skill/Magic2.wav", S + "Magic & Skill/Magic4.wav"],
  sp_earth: [S + "Elemental/Grass2.wav", S + "Hit & Impact/Impact4.wav"],
  sp_holy: [S + "Magic & Skill/Magic1.wav", S + "Magic & Skill/Heal2.wav"],
  sp_death: [S + "Magic & Skill/Strange.wav"],
  sp_physical: [S + "Whoosh & Slash/Slash3.wav", S + "Whoosh & Slash/Slash4.wav"],
  sp_buff: [S + "Magic & Skill/Magic5.wav"],
  sp_summon: [S + "Magic & Skill/Spirit.wav", S + "Magic & Skill/Strange.wav"],
  sp_taunt: [S + "Hit & Impact/Impact5.wav"],
  sp_charge: [S + "Whoosh & Slash/Whoosh2.wav"],
  skillup: [S + "Bonus/PowerUp2.wav"],
  loot: [S + "Bonus/Bonus.wav", S + "Bonus/Bonus2.wav"],
  coin: [S + "Bonus/Coin.wav", S + "Bonus/Coin2.wav", S + "Bonus/Coin3.wav", S + "Bonus/Gold1.wav"],
  lootRare: [S + "Bonus/PowerUp1.wav"],
  lootEpic: ["Jingles/Secret2.wav"],
  lootLegend: ["Jingles/Success3.wav"],
  fail: [S + "Menu/Cancel.wav"],
  // Alarme do Estagiário: o mesmo arquivo do "fail" (sem asset novo), tocado mais agudo; nome próprio para o intervalo
  // mínimo entre toques não engolir um "fail" logo depois.
  alarme: [S + "Menu/Cancel.wav"],
} as const;

export type SfxName = keyof typeof SOUNDS;

/** Mudo (persistido). */
export const mutedStore = persistedBool("muted", false);
/** Volume geral 0–100 (persistido; 100 = o volume de antes). */
export const volumeStore = persistedJson("sound", { volume: 100 });

const VOLUME = 0.4;
const masterGain = () => (mutedStore.get() ? 0 : VOLUME * Math.max(0, Math.min(100, volumeStore.get().volume)) / 100);
const MIN_GAP_MS = 45;

class Sfx {
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private loading = new Set<string>();
  private lastAt = new Map<SfxName, number>();
  private unlocked = false;

  constructor() {
    const unlock = () => {
      if (this.unlocked) return;
      this.unlocked = true;
      this.ensure();
      window.removeEventListener("pointerdown", unlock, true);
      window.removeEventListener("keydown", unlock, true);
      // Pré-carrega em segundo plano, sem competir com o início do jogo.
      setTimeout(() => { for (const n of ["hit", "crit", "miss", "xp", "death"] as SfxName[]) this.preload(n); }, 1500);
    };
    window.addEventListener("pointerdown", unlock, true);
    window.addEventListener("keydown", unlock, true);
    const apply = () => { if (this.gain) this.gain.gain.value = masterGain(); };
    mutedStore.subscribe(apply);
    volumeStore.subscribe(apply);
  }

  private ensure(): AudioContext | null {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return this.ctx;
    }
    try {
      this.ctx = new AudioContext();
      this.gain = this.ctx.createGain();
      this.gain.gain.value = masterGain();
      this.gain.connect(this.ctx.destination);
    } catch { this.ctx = null; }
    return this.ctx;
  }

  private load(path: string) {
    if (this.buffers.has(path) || this.loading.has(path) || !this.ctx) return;
    this.loading.add(path);
    fetch(encodeURI(BASE + path))
      .then((r) => r.arrayBuffer())
      .then((b) => this.ctx!.decodeAudioData(b))
      .then((buf) => { this.buffers.set(path, buf); })
      .catch(() => { /* som opcional */ })
      .finally(() => this.loading.delete(path));
  }

  preload(name: SfxName) {
    if (!this.ctx) return;
    for (const p of SOUNDS[name]) this.load(p);
  }

  /** Toca um som; se ainda não carregou, dispara o carregamento e fica em silêncio desta vez. */
  play(name: SfxName, opts: { volume?: number; rate?: number } = {}) {
    if (!this.unlocked || masterGain() === 0) return;
    const ctx = this.ensure();
    if (!ctx || !this.gain) return;
    const now = performance.now();
    if (now - (this.lastAt.get(name) ?? -1e9) < MIN_GAP_MS) return;
    this.lastAt.set(name, now);
    const list = SOUNDS[name];
    const path = list[(Math.random() * list.length) | 0];
    const buf = this.buffers.get(path);
    if (!buf) { this.load(path); return; }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = (opts.rate ?? 1) * (0.94 + Math.random() * 0.12);
    if (opts.volume !== undefined && opts.volume !== 1) {
      const g = ctx.createGain();
      g.gain.value = opts.volume;
      src.connect(g).connect(this.gain);
    } else src.connect(this.gain);
    src.start();
  }
}

export const sfx = new Sfx();

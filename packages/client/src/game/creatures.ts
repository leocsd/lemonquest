// Visual das criaturas: converte MonsterDef.sprite (shared) em CharacterSheet/CharacterLook do cliente.
import type Phaser from "phaser";
import { MONSTERS, type CreatureSprite, type Facing, type MonsterDef } from "@lemonquest/shared";
import { gridSheet, type CharacterLook, type CharacterSheet } from "./sprites.ts";

const sheets = new Map<string, CharacterSheet>();

function sheetFor(sp: CreatureSprite): CharacterSheet {
  const key = `mon:${sp.url}`;
  let s = sheets.get(key);
  if (s) return s;
  if (sp.layout === "custom" && sp.walk) {
    const idle = {} as Record<Facing, number>;
    for (const f of ["down", "up", "left", "right"] as Facing[]) idle[f] = sp.walk[f][0] ?? 0;
    s = { key, url: sp.url, frameWidth: sp.frameWidth, frameHeight: sp.frameHeight, walk: sp.walk, idle, stepsPerCycle: 2 };
  } else {
    s = gridSheet(key, sp.url, sp.frameWidth, sp.frameHeight);
  }
  sheets.set(key, s);
  return s;
}

export interface CreatureVisual {
  look: CharacterLook;
  scale: number;
  name: string;
  /** Nome próprio quando esta espécie nasce elite (ver shared eliteName()). */
  eliteName?: string;
  level: number;
  boss: boolean;
  known: boolean;
}

const cache = new Map<string, CreatureVisual>();
const FALLBACK_TINT = 0xff77ff;

/** Visual de um defId; ids desconhecidos usam o primeiro monstro com tint magenta (nunca quebra). */
export function creatureVisual(defId: string): CreatureVisual {
  let v = cache.get(defId);
  if (v) return v;
  const def: MonsterDef | undefined = MONSTERS[defId];
  if (def) {
    v = {
      look: { sheet: sheetFor(def.sprite), tint: def.sprite.tint ?? 0xffffff },
      scale: def.sprite.scale ?? 1,
      name: def.name, eliteName: def.eliteName, level: def.level, boss: !!def.boss, known: true,
    };
  } else {
    const first = Object.values(MONSTERS)[0];
    v = {
      look: { sheet: sheetFor(first.sprite), tint: FALLBACK_TINT },
      scale: 1, name: defId || "???", level: 1, boss: false, known: false,
    };
  }
  cache.set(defId, v);
  return v;
}

/** Todos os sheets de criaturas do catálogo atual (para preload + animações). */
export function allCreatureSheets(): CharacterSheet[] {
  for (const def of Object.values(MONSTERS)) sheetFor(def.sprite);
  return [...sheets.values()];
}

export type Difficulty = "fraca" | "normal" | "difícil" | "perigosa" | "chefe";

/** Dificuldade conforme a diferença de level entre a criatura e o jogador local (mesmas faixas da cor). */
export function levelDifficulty(monsterLevel: number, myLevel: number, boss: boolean): Difficulty {
  if (boss) return "chefe";
  const d = monsterLevel - myLevel;
  if (d <= -5) return "fraca";
  if (d <= 2) return "normal";
  if (d <= 6) return "difícil";
  return "perigosa";
}

const DIFFICULTY_COLOR: Record<Difficulty, string> = {
  fraca: "#9aa0ad", normal: "#ffffff", difícil: "#ffe066", perigosa: "#ff6b5e", chefe: "#ff9a3c",
};

/** Cor do nome conforme a dificuldade (a lista de batalha também diz em texto — não depender só da cor). */
export function levelColor(monsterLevel: number, myLevel: number, boss: boolean): string {
  return DIFFICULTY_COLOR[levelDifficulty(monsterLevel, myLevel, boss)];
}

/**
 * Cor do nome da criatura: sempre a da dificuldade. A elite já tinha nome dourado, mas o dourado se confundia com o
 * amarelo "difícil" e apagava a dificuldade real (UX-12): agora ela é marcada com "★" antes do nome (mundo, olhar e
 * lista de batalha) e a cor segue dizendo se é fraca, normal, difícil ou perigosa para o seu level.
 */
export function creatureColor(monsterLevel: number, myLevel: number, boss: boolean, _elite?: boolean): string {
  return levelColor(monsterLevel, myLevel, boss);
}

/** Glifo da elite (antes do nome). A cor fica para a estrela, não para o nome. */
export const ELITE_GLYPH = "★";

export interface SheetTrim { top: number; bottom: number }
const trims = new Map<string, SheetTrim>();

/**
 * Faixa vertical realmente opaca do sprite (em px do frame), para apoiar os PÉS no tile e colocar
 * nome/barra rente à cabeça mesmo quando o frame tem muita folga transparente (chefes 50x50).
 */
export function sheetTrim(scene: Phaser.Scene, sheet: CharacterSheet): SheetTrim {
  let t = trims.get(sheet.key);
  if (t) return t;
  t = { top: 0, bottom: sheet.frameHeight };
  try {
    const img = scene.textures.get(sheet.key).getSourceImage() as HTMLImageElement;
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0);
    const frames = new Set<number>([...Object.values(sheet.idle), ...Object.values(sheet.walk).flat()]);
    let top = sheet.frameHeight, bottom = 0;
    const cols = Math.floor(img.width / sheet.frameWidth);
    for (const f of frames) {
      const fx = (f % cols) * sheet.frameWidth, fy = Math.floor(f / cols) * sheet.frameHeight;
      const d = ctx.getImageData(fx, fy, sheet.frameWidth, sheet.frameHeight).data;
      for (let y = 0; y < sheet.frameHeight; y++) {
        for (let x = 0; x < sheet.frameWidth; x++) {
          if (d[(y * sheet.frameWidth + x) * 4 + 3] > 24) { if (y < top) top = y; if (y + 1 > bottom) bottom = y + 1; break; }
        }
      }
    }
    if (bottom > top) t = { top, bottom };
  } catch { /* sem trim: usa o frame inteiro */ }
  trims.set(sheet.key, t);
  return t;
}

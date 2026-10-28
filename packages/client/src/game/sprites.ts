// Configuração ÚNICA de sprites de personagem. Trocar o pack de arte = mexer só aqui.
import type Phaser from "phaser";
import {
  ADDON_FRAME, ADDON_OFFSET_Y, OUTFIT_LIST, activeAddons, addonLayers, resolveOutfit, toneColor,
  type AddonDef, type AddonSheets, type Facing, type Sex,
} from "@lemonquest/shared";
import { colorizedCanvas } from "../ui/outfit/colorize.ts";

export interface CharacterSheet {
  /** Chave da textura no Phaser (uma por arquivo). */
  key: string;
  /** Caminho servido pelo Vite (publicDir = assets/). */
  url: string;
  frameWidth: number;
  frameHeight: number;
  /** Frames (índice no spritesheet) do ciclo de caminhada por lado. */
  walk: Record<Facing, number[]>;
  /** Frame parado por lado. */
  idle: Record<Facing, number>;
  /** Quantos passos (tiles) dura um ciclo completo da animação de caminhada. */
  stepsPerCycle: number;
}

/** Overlay de addon desenhado junto da base (mesmo índice de frame), na frente ou atrás dela. */
export interface AddonLayer {
  sheet: CharacterSheet;
  back: boolean;
}

export interface CharacterLook {
  sheet: CharacterSheet;
  /** Tint multiplicativo (monstros; 0xffffff = sem tint). */
  tint: number;
  /**
   * Tom de tingimento da roupa (jogadores; cor de toneColor, 0xffffff/ausente = natural). Não é tint: o Actor troca as
   * sheets por texturas tingidas (tonedSheet), com a mesma conta da prévia da janela de roupas.
   */
  tone?: number;
  /** Addons (jogadores). Ordem = ordem de desenho dentro da camada. */
  addons?: AddonLayer[];
  /** Px acima do topo da base ocupados pelos addons (nome/barra sobem). */
  extraTop?: number;
  /** Brilhinho permanente em volta do boneco (a Fada, qualquer roupa): faíscas rosa/branco que piscam (Actor). */
  glitter?: boolean;
}

/**
 * Ninja Adventure: sheet 64x112, frames 16x16, 4 colunas x 7 linhas.
 * Coluna = lado (0 baixo, 1 cima, 2 esquerda, 3 direita); linhas 0..3 = ciclo de caminhada; linha 0 = parado.
 */
function ninjaAdventure(key: string, url: string): CharacterSheet {
  return gridSheet(key, url, 16, 16);
}

/** Layout "grid4": colunas = lados (baixo, cima, esquerda, direita), linhas = frames de caminhada. */
export function gridSheet(key: string, url: string, frameWidth: number, frameHeight: number, rows = 4): CharacterSheet {
  const col: Record<Facing, number> = { down: 0, up: 1, left: 2, right: 3 };
  const walk = {} as Record<Facing, number[]>;
  const idle = {} as Record<Facing, number>;
  for (const f of Object.keys(col) as Facing[]) {
    walk[f] = Array.from({ length: rows }, (_, row) => row * 4 + col[f]);
    idle[f] = col[f];
  }
  return { key, url, frameWidth, frameHeight, walk, idle, stepsPerCycle: 2 };
}

/** Sheet base de cada roupa (shared/data/outfits.ts). */
const OUTFIT_SHEETS: Record<string, CharacterSheet> = Object.fromEntries(
  OUTFIT_LIST.map((o) => [o.id, ninjaAdventure(`outfit_${o.id}`, o.sheet)]),
);
/**
 * Sheet feminina (chave própria `outfit_<id>_f`, então a textura tingida `chave~tom` também fica por sexo). Roupa sem
 * versão feminina usa a mesma sheet (e a mesma textura) dos dois sexos.
 */
const OUTFIT_SHEETS_F: Record<string, CharacterSheet> = Object.fromEntries(
  OUTFIT_LIST.map((o) => [o.id, o.female ? ninjaAdventure(`outfit_${o.id}_f`, o.female) : OUTFIT_SHEETS[o.id]!]),
);
const addonPair = (key: string, s: AddonSheets) => ({
  front: gridSheet(key, s.sheet, ADDON_FRAME, ADDON_FRAME),
  back: s.backSheet ? gridSheet(`${key}_back`, s.backSheet, ADDON_FRAME, ADDON_FRAME) : undefined,
});
/** Chave do addon no sexo: `<id>` ou `<id>_f` (overlay redesenhado para a sheet feminina, se houver). */
const addonKey = (a: AddonDef, sex: Sex | undefined) => (sex === "f" && a.female ? `${a.id}_f` : a.id);
/** Overlays (frente/trás) de cada addon, e os femininos que o gerador redesenhou. */
const ADDON_SHEETS: Record<string, { front: CharacterSheet; back?: CharacterSheet }> = Object.fromEntries(
  OUTFIT_LIST.flatMap((o) => o.addons).flatMap((a) => [
    [a.id, addonPair(`addon_${a.id}`, a)] as const,
    ...(a.female ? [[`${a.id}_f`, addonPair(`addon_${a.id}_f`, a.female)] as const] : []),
  ]),
);

/** Origem Y (0..1) dos overlays: o pé da base (linha 16 do frame base) dentro do frame 32x32. */
export const ADDON_ORIGIN_Y = (ADDON_OFFSET_Y + 16) / ADDON_FRAME;

/** Sheets base das roupas nos dois sexos, sem repetir (animações de caminhada são criadas para estas). */
export const ALL_SHEETS: CharacterSheet[] = [...new Set([...Object.values(OUTFIT_SHEETS), ...Object.values(OUTFIT_SHEETS_F)])];
/** Overlays de addon (só carregados; o frame segue a base). */
export const ADDON_SHEET_LIST: CharacterSheet[] = Object.values(ADDON_SHEETS).flatMap((s) => (s.back ? [s.front, s.back] : [s.front]));

/**
 * Visual de um jogador: roupa + addons ativos + tom de tingimento, no sexo (ausente = masculino). Roupa
 * desconhecida/ausente → padrão da vocação.
 */
export function outfitLook(outfit: string | undefined, addons: number, vocation: string, tone?: string, sex?: Sex): CharacterLook {
  const o = resolveOutfit(outfit, vocation);
  const on = activeAddons(o, addons ?? 0);
  const layers: AddonLayer[] = [];
  for (const a of on) {
    const s = ADDON_SHEETS[addonKey(a, sex)]!;
    if (s.back) layers.push({ sheet: s.back, back: true });
    layers.push({ sheet: s.front, back: false });
  }
  return {
    sheet: (sex === "f" ? OUTFIT_SHEETS_F : OUTFIT_SHEETS)[o.id]!, tint: 0xffffff, tone: toneColor(tone), addons: layers,
    extraTop: Math.max(0, ...on.map((a) => addonLayers(a, sex).extraTop)),
    ...(vocation === "fairy" ? { glitter: true } : {}),
  };
}

/**
 * Sheet tingida pelo tom: textura própria (`chave~rrggbb`) gerada uma vez a partir do PNG já carregado, com colorizePixel
 * (ui/outfit/colorize.ts, igual à prévia). O multiply do setTint escurecia pele e brilhos. Sem a textura base (falhou ao
 * carregar) ou sem tom, devolve a sheet original.
 */
export function tonedSheet(scene: Phaser.Scene, sheet: CharacterSheet, tone: number): CharacterSheet {
  if (tone === 0xffffff || !scene.textures.exists(sheet.key)) return sheet;
  const key = `${sheet.key}~${tone.toString(16).padStart(6, "0")}`;
  if (!scene.textures.exists(key)) {
    const src = scene.textures.get(sheet.key).getSourceImage();
    if (!(src instanceof HTMLImageElement || src instanceof HTMLCanvasElement)) return sheet;
    const canvas = colorizedCanvas(src, sheet.key, tone);
    const tex = scene.textures.create(key, canvas, canvas.width, canvas.height);
    if (!tex) return sheet;
    scene.textures.addSpriteSheet(key, tex, { frameWidth: sheet.frameWidth, frameHeight: sheet.frameHeight });
  }
  return { ...sheet, key };
}

/** Compatibilidade: visual padrão da vocação, sem addons. */
export function lookFor(vocation: string): CharacterLook {
  return outfitLook(undefined, 0, vocation);
}

/** Nome da animação de caminhada de um sheet para um lado. */
export const walkAnimKey = (sheet: CharacterSheet, f: Facing) => `${sheet.key}:walk:${f}`;

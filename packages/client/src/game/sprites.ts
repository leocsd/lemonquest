// Configuração ÚNICA de sprites de personagem. Trocar o pack de arte = mexer só aqui.
import {
  ADDON_FRAME, ADDON_OFFSET_Y, OUTFIT_LIST, activeAddons, resolveOutfit, toneColor,
  type Facing, type OutfitDef,
} from "@lemonquest/shared";

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
  /** Tint multiplicativo (0xffffff = sem tint). */
  tint: number;
  /** Addons (jogadores). Ordem = ordem de desenho dentro da camada. */
  addons?: AddonLayer[];
  /** Px acima do topo da base ocupados pelos addons (nome/barra sobem). */
  extraTop?: number;
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
/** Overlays (frente/trás) de cada addon. */
const ADDON_SHEETS: Record<string, { front: CharacterSheet; back?: CharacterSheet }> = Object.fromEntries(
  OUTFIT_LIST.flatMap((o) => o.addons).map((a) => [a.id, {
    front: gridSheet(`addon_${a.id}`, a.sheet, ADDON_FRAME, ADDON_FRAME),
    back: a.backSheet ? gridSheet(`addon_${a.id}_back`, a.backSheet, ADDON_FRAME, ADDON_FRAME) : undefined,
  }]),
);
/** Overlay de montaria: sempre atrás, um desenho por roupa (não é addon escolhível, não usa addon1/addon2).
 *  Gerado por tools/addons/mount.mjs. */
const MOUNT_SHEETS: Record<string, CharacterSheet> = Object.fromEntries(
  OUTFIT_LIST.map((o) => [o.id, gridSheet(`mount_${o.id}`, `addons/mount_${o.id}_back.png`, ADDON_FRAME, ADDON_FRAME)]),
);
export const MOUNT_SHEET_LIST: CharacterSheet[] = Object.values(MOUNT_SHEETS);

/** Origem Y (0..1) dos overlays: o pé da base (linha 16 do frame base) dentro do frame 32x32. */
export const ADDON_ORIGIN_Y = (ADDON_OFFSET_Y + 16) / ADDON_FRAME;

/** Sheets base das roupas (animações de caminhada são criadas para estas). */
export const ALL_SHEETS: CharacterSheet[] = Object.values(OUTFIT_SHEETS);
/** Overlays de addon (só carregados; o frame segue a base). */
export const ADDON_SHEET_LIST: CharacterSheet[] = Object.values(ADDON_SHEETS).flatMap((s) => (s.back ? [s.front, s.back] : [s.front]));

/** Visual de um jogador: roupa + addons ativos + tom de tingimento + montaria (roupa desconhecida/ausente →
 *  padrão da vocação). Montaria entra primeiro na pilha: fica atrás de capa/mochila também. */
export function outfitLook(outfit: string | undefined, addons: number, vocation: string, tone?: string, mount?: boolean): CharacterLook {
  const o = resolveOutfit(outfit, vocation);
  const on = activeAddons(o, addons ?? 0);
  const layers: AddonLayer[] = [];
  if (mount) layers.push({ sheet: MOUNT_SHEETS[o.id], back: true });
  for (const a of on) {
    const s = ADDON_SHEETS[a.id];
    if (s.back) layers.push({ sheet: s.back, back: true });
    layers.push({ sheet: s.front, back: false });
  }
  return { sheet: OUTFIT_SHEETS[o.id], tint: toneColor(tone), addons: layers, extraTop: Math.max(0, ...on.map((a) => a.extraTop)) };
}

/** Compatibilidade: visual padrão da vocação, sem addons. */
export function lookFor(vocation: string): CharacterLook {
  return outfitLook(undefined, 0, vocation);
}

/** Retrato (Faceset 38x38 do pack) da roupa. */
export function outfitFaceset(o: OutfitDef): string {
  return o.faceset ?? o.sheet.replace(/SpriteSheet\.png$/, "Faceset.png");
}

/** Nome da animação de caminhada de um sheet para um lado. */
export const walkAnimKey = (sheet: CharacterSheet, f: Facing) => `${sheet.key}:walk:${f}`;

// Configuração ÚNICA de sprites de personagem. Trocar o pack de arte = mexer só aqui.
import {
  ADDON_FRAME, ADDON_OFFSET_Y, MOUNT_LIST, OUTFIT_LIST, activeAddons, mountDef, resolveOutfit, toneColor,
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
  /** Origem Y (0..1) do overlay; padrão ADDON_ORIGIN_Y. Montaria usa a própria (canvas maior, âncora própria). */
  originY?: number;
  /** Fica no chão (ignora riderRise do personagem) — a montaria não sobe junto, só ele senta mais alto nela. */
  grounded?: boolean;
}

export interface CharacterLook {
  sheet: CharacterSheet;
  /** Tint multiplicativo (0xffffff = sem tint). */
  tint: number;
  /** Addons (jogadores). Ordem = ordem de desenho dentro da camada. */
  addons?: AddonLayer[];
  /** Px acima do topo da base ocupados pelos addons (nome/barra sobem). */
  extraTop?: number;
  /** Px que o personagem sobe (monta em cima da montaria, em vez de ficar "ao lado" dela no chão). */
  riderRise?: number;
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

/** Origem Y (0..1) dos overlays: o pé da base (linha 16 do frame base) dentro do frame 32x32. */
export const ADDON_ORIGIN_Y = (ADDON_OFFSET_Y + 16) / ADDON_FRAME;

/** Sheets base das roupas (animações de caminhada são criadas para estas). */
export const ALL_SHEETS: CharacterSheet[] = Object.values(OUTFIT_SHEETS);
/** Overlays de addon (só carregados; o frame segue a base). */
export const ADDON_SHEET_LIST: CharacterSheet[] = Object.values(ADDON_SHEETS).flatMap((s) => (s.back ? [s.front, s.back] : [s.front]));

// Montaria: canvas PRÓPRIO (36x40, âncora na linha 34, não o formato apertado de addon de chapéu) — recortado
// de arte real (assets/mounts/_source/, pack licenciado à parte) por tools/mounts/generate.mjs. Desenhada
// atrás da base, como uma capa, mas com origem Y diferente.
// ATENÇÃO: estes 3 números têm que bater com FRAME_W/FRAME_H/ANCHOR_Y de tools/mounts/generate.mjs — mudou lá, muda aqui.
export const MOUNT_FRAME_W = 36, MOUNT_FRAME_H = 40, MOUNT_ANCHOR_Y = 34;
export const MOUNT_ORIGIN_Y = MOUNT_ANCHOR_Y / MOUNT_FRAME_H;
/** Px que o personagem sobe pra ficar sentado no lombo da montaria em vez de "do lado" dela no chão. */
export const MOUNT_RIDER_RISE = 16;
const MOUNT_SHEETS: Record<string, CharacterSheet> = Object.fromEntries(
  MOUNT_LIST.map((m) => [m.id, gridSheet(`mount_${m.id}`, m.sheet, MOUNT_FRAME_W, MOUNT_FRAME_H)]),
);
export const MOUNT_SHEET_LIST: CharacterSheet[] = Object.values(MOUNT_SHEETS);

/** Layer da montaria ativa (atrás da base, âncora própria), se houver e for conhecida. */
export function mountLayer(mountId: string | undefined): AddonLayer | undefined {
  const m = mountDef(mountId);
  if (!m) return undefined;
  const sheet = MOUNT_SHEETS[m.id];
  return sheet ? { sheet, back: true, originY: MOUNT_ORIGIN_Y, grounded: true } : undefined;
}

/** Visual de um jogador: roupa + addons ativos + tom de tingimento (roupa desconhecida/ausente → padrão da vocação). */
export function outfitLook(outfit: string | undefined, addons: number, vocation: string, tone?: string): CharacterLook {
  const o = resolveOutfit(outfit, vocation);
  const on = activeAddons(o, addons ?? 0);
  const layers: AddonLayer[] = [];
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

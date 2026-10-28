// Paleta por elemento de magia (coerente com KIND_COLOR do combate). Compartilhada por jogo e HUD.
import type { SpellFx as FxKey } from "@lemonquest/shared";

export interface Pal { main: number; light: number; dark: number }
export const PAL: Record<FxKey, Pal> = {
  fire: { main: 0xff9a3c, light: 0xffd27a, dark: 0xc8421a },
  ice: { main: 0x7fe0ff, light: 0xdff8ff, dark: 0x3a8fd0 },
  energy: { main: 0xc58aff, light: 0xefdcff, dark: 0x7a3fd0 },
  earth: { main: 0x7fdc5a, light: 0xc8f0a0, dark: 0x4a7a2c },
  holy: { main: 0xffe566, light: 0xfffbe0, dark: 0xd9a441 },
  death: { main: 0xc8283e, light: 0xff6b7e, dark: 0x5a0f1c },
  physical: { main: 0xffffff, light: 0xffffff, dark: 0xaab0c0 },
  heal: { main: 0x5be07a, light: 0xc4ffd0, dark: 0x2f9a4a },
  buff: { main: 0x6ab0ff, light: 0xcfe6ff, dark: 0x3a6ad0 },
  arrow: { main: 0xe8d6a0, light: 0xffffff, dark: 0x8a6a3a },
  summon: { main: 0xa05cd6, light: 0xdcb0ff, dark: 0x5a2a8a },
  taunt: { main: 0xff4a3a, light: 0xffa090, dark: 0x9a1a14 },
  root: { main: 0x9be07a, light: 0xd8ffb8, dark: 0x4a6a1c },
  charge: { main: 0xcfd8ff, light: 0xffffff, dark: 0x6a7ac0 },
  // Brilhinho da Fada: rosa com estrelinhas brancas.
  sparkle: { main: 0xff9ad5, light: 0xffe6f5, dark: 0xd94f9e },
};

export const cssColor = (n: number) => "#" + n.toString(16).padStart(6, "0");

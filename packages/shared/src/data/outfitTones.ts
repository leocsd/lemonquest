// Tons de tingimento (cosmético puro): recolorem a roupa inteira (base + addons) pela luminância de cada pixel
// (colorizePixel), igual na janela de roupas e no mundo. Comprados uma vez por conta (`OutfitTonesMsg`), valem pra
// qualquer personagem. Sem arte nova.
export interface OutfitTone {
  /** Fica salvo nas contas que compraram: nunca remover nem renomear (o servidor valida contra esta lista). */
  id: string;
  name: string;
  /** Cor que um pixel de luminância média (TONE_PIVOT) vira (0xRRGGBB); ver colorizePixel. */
  color: number;
}

/** Preço fixo em ouro, igual pra qualquer tom. */
export const OUTFIT_TONE_PRICE = 8000;

/**
 * Tons novos entram no fim (a janela ordena por matiz). Cores escolhidas contra colorizePixel: luminância entre ~0,3 e
 * ~0,75, senão a roupa vira um borrão quase preto (escuras) ou quase branco (claras).
 */
export const OUTFIT_TONES: OutfitTone[] = [
  { id: "crimson", name: "Carmesim", color: 0xd94a4a },
  { id: "azure", name: "Safira", color: 0x3a5fd9 },
  { id: "emerald", name: "Esmeralda", color: 0x2fa85a },
  { id: "violet", name: "Violeta", color: 0x8a4ad9 },
  { id: "amber", name: "Âmbar", color: 0xe8802a },
  { id: "slate", name: "Grafite", color: 0x5a6270 },
  { id: "rose", name: "Rosado", color: 0xd96fa0 },
  { id: "gold", name: "Dourado", color: 0xf0b030 },
  { id: "lime", name: "Verde-Limão", color: 0x9ed22e },
  { id: "turquoise", name: "Turquesa", color: 0x2fb8b0 },
  { id: "chestnut", name: "Castanho", color: 0x8f5a36 },
  { id: "silver", name: "Prata", color: 0xb8bec8 },
  { id: "charcoal", name: "Carvão", color: 0x464a54 },
  { id: "sky", name: "Celeste", color: 0x5aa8e8 },
];

export const toneDef = (id: string | undefined | null): OutfitTone | undefined =>
  id ? OUTFIT_TONES.find((t) => t.id === id) : undefined;

/** Cor do tom pra colorizePixel (ausente ou desconhecido = 0xffffff = cor natural, sem tingimento). */
export const toneColor = (id: string | undefined | null): number => toneDef(id)?.color ?? 0xffffff;

/** Luminância (0..1) que vira exatamente a cor do tom: abaixo escurece até o preto, acima clareia até o branco. */
export const TONE_PIVOT = 0.6;

/**
 * Pele do pack Ninja Adventure (base e sombra clara): fica natural, senão o rosto sai azul junto com a roupa. Os
 * overlays de addon não usam essas cores.
 */
export const TONE_KEEP: ReadonlySet<number> = new Set([0xef914f, 0xf2ad7d]);

/** Luminância perceptual (0..1) de um RGB 0..255. */
export const pixelLuminance = (r: number, g: number, b: number): number => (0.299 * r + 0.587 * g + 0.114 * b) / 255;

/**
 * Tingimento de UM pixel, preservando o brilho: com L = luminância do original e T = tom,
 * L ≤ TONE_PIVOT → T · L/TONE_PIVOT (sombras e contorno continuam escuros);
 * L > TONE_PIVOT → T + (255 − T) · (L − TONE_PIVOT)/(1 − TONE_PIVOT) (brilho de metal e barba branca vão ao branco).
 * O multiply antigo escurecia tudo (pele e brilhos inclusive). Tom 0xffffff = natural (devolve o pixel igual).
 */
export function colorizePixel(r: number, g: number, b: number, tone: number): [number, number, number] {
  if (tone === 0xffffff || TONE_KEEP.has((r << 16) | (g << 8) | b)) return [r, g, b];
  const l = pixelLuminance(r, g, b);
  const t = [(tone >> 16) & 255, (tone >> 8) & 255, tone & 255] as const;
  if (l <= TONE_PIVOT) {
    const k = l / TONE_PIVOT;
    return [Math.round(t[0] * k), Math.round(t[1] * k), Math.round(t[2] * k)];
  }
  const w = (l - TONE_PIVOT) / (1 - TONE_PIVOT);
  return [Math.round(t[0] + (255 - t[0]) * w), Math.round(t[1] + (255 - t[1]) * w), Math.round(t[2] + (255 - t[2]) * w)];
}

/**
 * Ciclo dia/noite do mundo (funções puras; servidor e cliente usam as mesmas).
 *
 * O servidor só publica o "relógio do mundo" (`worldTimeMs`, ms desde o início do ciclo); o cliente deriva
 * fase, hora do dia e cor ambiente daqui. Ciclo de 40 min reais: dia 24 · entardecer 4 · noite 8 · amanhecer 4.
 */

const MIN = 60_000;

/** Duração de cada fase (ms), em ordem no ciclo. */
export const PHASE_MS = { day: 24 * MIN, dusk: 4 * MIN, night: 8 * MIN, dawn: 4 * MIN } as const;
export const CYCLE_MS = PHASE_MS.day + PHASE_MS.dusk + PHASE_MS.night + PHASE_MS.dawn;
/** Ao subir, o servidor começa o ciclo a esta altura (meio da manhã/tarde: dia pleno). */
export const CYCLE_START_MS = 8 * MIN;

export type DayPhase = "day" | "dusk" | "night" | "dawn";
export type Rgb = readonly [number, number, number];

/** Normaliza qualquer tempo (inclusive negativo) para [0, CYCLE_MS). */
export const wrapCycle = (ms: number): number => ((ms % CYCLE_MS) + CYCLE_MS) % CYCLE_MS;

/** Fase atual e progresso (0..1) dentro dela. */
export function phaseAt(worldMs: number): { phase: DayPhase; progress: number } {
  let t = wrapCycle(worldMs);
  for (const phase of ["day", "dusk", "night", "dawn"] as const) {
    if (t < PHASE_MS[phase]) return { phase, progress: t / PHASE_MS[phase] };
    t -= PHASE_MS[phase];
  }
  return { phase: "dawn", progress: 1 };
}

/** Hora do relógio do jogo (0..24): o início do ciclo (começo do dia) é 06:00. */
export function clockHours(worldMs: number): number {
  return (6 + (wrapCycle(worldMs) / CYCLE_MS) * 24) % 24;
}

export function clockLabel(worldMs: number): string {
  const h = clockHours(worldMs);
  const hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export const PHASE_LABEL: Record<DayPhase, string> = { day: "Dia", dusk: "Entardecer", night: "Noite", dawn: "Amanhecer" };

// ---------------------------------------------------------------------------
// Cor ambiente (multiplicadora): branco = dia pleno; quanto mais escura/azul, mais noite.
// ---------------------------------------------------------------------------

/** [minuto no ciclo, r, g, b] (0..255). Cíclico: o último ponto (40) iguala o primeiro (0). */
const KEYS: readonly (readonly [number, number, number, number])[] = [
  [0, 255, 255, 255],
  [21, 255, 255, 255],
  [24, 255, 238, 214], // começa a esquentar
  [26, 255, 168, 112], // pôr do sol alaranjado
  [28, 112, 106, 156], // anoitece (roxo azulado)
  [30, 80, 95, 150],
  [32, 70, 86, 142], // meia-noite
  [34, 80, 95, 150],
  [36, 100, 106, 156],
  [37.5, 196, 142, 142], // aurora rosada
  [39, 255, 214, 170],
  [40, 255, 255, 255],
];

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Cor multiplicadora ao ar livre (0..1 por canal), interpolada com suavização entre os pontos-chave. */
export function ambientRgb(worldMs: number): Rgb {
  const m = (wrapCycle(worldMs) / MIN);
  for (let i = 1; i < KEYS.length; i++) {
    const a = KEYS[i - 1], b = KEYS[i];
    if (m <= b[0]) {
      const k = b[0] === a[0] ? 1 : smooth((m - a[0]) / (b[0] - a[0]));
      return [(a[1] + (b[1] - a[1]) * k) / 255, (a[2] + (b[2] - a[2]) * k) / 255, (a[3] + (b[3] - a[3]) * k) / 255];
    }
  }
  return [1, 1, 1];
}

/** Escuridão percebida (0 = claro, 1 = breu) de uma cor multiplicadora (luminância). */
export function darknessOf(rgb: Rgb): number {
  return 1 - (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]);
}

// ---------------------------------------------------------------------------
// Regras por zona
// ---------------------------------------------------------------------------

export type ZoneLightMode = "outdoor" | "town" | "lit" | "dark";

/** Quanto do ambiente do ciclo vale em cada tipo de zona (mix 0..1). `dark` ignora o ciclo (sempre escuro). */
export const ZONE_MIX: Record<Exclude<ZoneLightMode, "dark">, number> = { outdoor: 1, town: 0.92, lit: 0.45 };
/** Cor ambiente das zonas escuras (cavernas, cripta): ~85% de escuridão, levemente azulada. */
export const DARK_ZONE_RGB: Rgb = [0.15, 0.17, 0.26];

const ZONE_MODES: Record<string, ZoneLightMode> = {
  "Cavernas": "dark",
  "Cripta": "dark",
  "Coliseu": "lit",
  // Interior de escritório com luz elétrica (ciclo 10): mesmo modo do Coliseu, quase não escurece à noite.
  "Oficina dos Engenhos": "lit",
  // Malha da Ferrovia (ciclo 11): a Estação é interior iluminado e o Túnel da Serra, escuro como as cavernas; pátio,
  // portal, oficina de vagões e via ficam ao ar livre (modo padrão).
  "Estação Central da Malha": "lit",
  "Túnel da Serra": "dark",
  // Siderúrgica (ciclo 19): a Estação, a Sala de Controle e o galpão da Aciaria são interiores iluminados; o Coração do
  // Forno é escuro (só a gusa e os braseiros clareiam); pátio, correias, alto-forno e laminação ficam ao ar livre.
  "Estação do Minério": "lit",
  "Sala de Controle": "lit",
  "Aciaria": "lit",
  "Coração do Forno": "dark",
  // Montadora (ciclo 20): a Portaria é praça (como a Vila); os galpões, a Sala de Descanso e as duas salas da alavanca são
  // interiores iluminados; a Sala dos Protótipos (subsolo) é escura. Fundo da região, Pátio e Pista ficam ao ar livre.
  "Portaria da Montadora": "town",
  "Lava-Rápido": "lit",
  "Estamparia": "lit",
  "Funilaria e Armação": "lit",
  "Cabines de Pintura": "lit",
  "Estufa": "lit",
  "Montagem Final": "lit",
  "Sala de Descanso": "lit",
  "Pista do Crash Test": "lit",
  "Boxe dos Troféus": "lit",
  "Sala dos Protótipos": "dark",
  "Centro de Treinamento": "town",
  "Vila de Pedra Clara": "town",
};

export function zoneLightMode(zoneName: string | null | undefined): ZoneLightMode {
  return (zoneName && ZONE_MODES[zoneName]) || "outdoor";
}

/** Cor multiplicadora final para a zona onde o jogador está, no instante do mundo `worldMs`. */
export function ambientForZone(worldMs: number, zoneName: string | null | undefined): Rgb {
  const mode = zoneLightMode(zoneName);
  if (mode === "dark") return DARK_ZONE_RGB;
  const cyc = ambientRgb(worldMs);
  const mix = ZONE_MIX[mode];
  return [1 + (cyc[0] - 1) * mix, 1 + (cyc[1] - 1) * mix, 1 + (cyc[2] - 1) * mix];
}

export interface ZoneRect { name: string; x: number; y: number; w: number; h: number }

/** Zona (menor área) que contém o tile. */
export function zoneAt(zones: readonly ZoneRect[], x: number, y: number): string | null {
  let best: ZoneRect | null = null;
  for (const z of zones) {
    if (x < z.x || y < z.y || x >= z.x + z.w || y >= z.y + z.h) continue;
    if (!best || z.w * z.h < best.w * best.h) best = z;
  }
  return best?.name ?? null;
}

/** Luz precisa aparecer? (escuro o bastante para valer o custo de desenhar a camada). */
export const needsLights = (rgb: Rgb): boolean => darknessOf(rgb) > 0.04;

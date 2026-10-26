// Altura fixa e redimensionável (em linhas inteiras) dos painéis "Batalha" e "Mochila". Funções puras + store persistido (versionado).
import { createStore } from "./store.ts";

export const SIZABLE_IDS = ["battle", "backpack"] as const;
export type SizableId = (typeof SIZABLE_IDS)[number];

export const SIZES_KEY = "lemonquest.ui.panelSizes.v1";

interface SizeSpec {
  /** Altura de uma linha (px), incluindo o espaçamento até a próxima. */
  row: number;
  /** Ajuste (px) somado a rows*row: tira o último espaçamento e põe o respiro interno. */
  pad: number;
  def: number;
  min: number;
  max: number;
}

export const SIZE_SPEC: Record<SizableId, SizeSpec> = {
  // Batalha: linha de 32 px + gap de 2.
  battle: { row: 34, pad: 0, def: 5, min: 2, max: 12 },
  // Mochila: slot 40 + gap 5, grade 4x5; 2 px de respiro no topo e na base.
  backpack: { row: 45, pad: -1, def: 3, min: 2, max: 5 },
};

export type Sizes = Record<SizableId, number>;

/** Tela baixa (720p/768p): a batalha começa com 3 linhas para a mochila caber na coluna (preferência salva vale mais). */
export const SHORT_SCREEN_PX = 820;
const viewportH = (): number => (typeof window !== "undefined" ? window.innerHeight : 1080);

export const defaultSizes = (h = viewportH()): Sizes => ({
  battle: h <= SHORT_SCREEN_PX ? 3 : SIZE_SPEC.battle.def,
  backpack: SIZE_SPEC.backpack.def,
});

export type SectionId = "status" | "equipment" | "battle" | "backpack" | "party" | "online";

/**
 * Seções abertas por padrão (preferência salva vale mais). Em 1366×768 os cards somam mais que a coluna: o Equipamento
 * começa dobrado e a Mochila aberta — ela é o painel mais usado e antes nascia dobrada, fora da vista do novato.
 * O Online (ciclo 18) entra no fim da coluna e também começa dobrado em tela baixa.
 */
export const defaultSections = (h = viewportH()): Record<SectionId, boolean> => ({
  status: true,
  equipment: h > SHORT_SCREEN_PX,
  battle: true,
  backpack: true,
  party: true,
  online: h > SHORT_SCREEN_PX,
});

/** Linhas válidas (inteiro entre min e max); valor inválido volta ao padrão. */
export function clampRows(id: SizableId, rows: unknown): number {
  const s = SIZE_SPEC[id];
  if (typeof rows !== "number" || !Number.isFinite(rows)) return s.def;
  return Math.max(s.min, Math.min(s.max, Math.round(rows)));
}

export function normalizeSizes(saved: unknown): Sizes {
  const out = defaultSizes();
  if (saved && typeof saved === "object") for (const id of SIZABLE_IDS) {
    const v = (saved as Record<string, unknown>)[id];
    if (v !== undefined) out[id] = clampRows(id, v);
  }
  return out;
}

/** Altura do corpo (px) para um número de linhas. */
export const rowsToPx = (id: SizableId, rows: number): number => clampRows(id, rows) * SIZE_SPEC[id].row + SIZE_SPEC[id].pad;

/** Arrastar a alça: linhas iniciais + deslocamento vertical (px) → linhas com snap em linhas inteiras. */
export function rowsFromDrag(id: SizableId, startRows: number, dy: number): number {
  return clampRows(id, startRows + dy / SIZE_SPEC[id].row);
}

function load(): unknown {
  try {
    const raw = localStorage.getItem(SIZES_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export const panelSizesStore = createStore<Sizes>(normalizeSizes(load()));
panelSizesStore.subscribe((v) => { try { localStorage.setItem(SIZES_KEY, JSON.stringify(v)); } catch { /* indisponível */ } });

export const setPanelRows = (id: SizableId, rows: number) => panelSizesStore.set((s) => (s[id] === clampRows(id, rows) ? s : { ...s, [id]: clampRows(id, rows) }));
export const resetPanelRows = (id: SizableId) => setPanelRows(id, SIZE_SPEC[id].def);

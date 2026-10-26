// Ordem e "fixação" (pin) dos cards da barra lateral. Funções puras + stores persistidos (versionados).
import { createStore, type Store } from "./store.ts";

export const PANEL_IDS = ["minimap", "status", "equipment", "battle", "backpack", "party", "online"] as const;
export type PanelId = (typeof PANEL_IDS)[number];

export const ORDER_KEY = "lemonquest.ui.panelOrder.v1";
export const PINS_KEY = "lemonquest.ui.panelPins.v1";

const isPanelId = (v: unknown): v is PanelId => typeof v === "string" && (PANEL_IDS as readonly string[]).includes(v);

/** Ordem salva → ordem válida: ignora ids desconhecidos/duplicados e acrescenta os painéis novos no fim. */
export function normalizeOrder(saved: unknown): PanelId[] {
  const out: PanelId[] = [];
  if (Array.isArray(saved)) for (const v of saved) if (isPanelId(v) && !out.includes(v)) out.push(v);
  for (const id of PANEL_IDS) if (!out.includes(id)) out.push(id);
  return out;
}

export type Pins = Record<PanelId, boolean>;

export function normalizePins(saved: unknown): Pins {
  const out = Object.fromEntries(PANEL_IDS.map((id) => [id, false])) as Pins;
  if (saved && typeof saved === "object") for (const id of PANEL_IDS) out[id] = (saved as Record<string, unknown>)[id] === true;
  return out;
}

/** Move `id` para a posição `to` (índice na lista já sem ele). */
export function moveItem<T>(list: readonly T[], id: T, to: number): T[] {
  const from = list.indexOf(id);
  if (from < 0) return [...list];
  const rest = list.filter((x) => x !== id);
  rest.splice(Math.max(0, Math.min(rest.length, to)), 0, id);
  return rest;
}

/** Reordena só os painéis visíveis: eles ocupam, na mesma sequência, as posições que já tinham na ordem completa. */
export function applyVisibleOrder(order: readonly PanelId[], visible: readonly PanelId[]): PanelId[] {
  const set = new Set(visible);
  let i = 0;
  return order.map((id) => (set.has(id) ? visible[i++] ?? id : id));
}

/** Índice de destino (na lista sem o arrastado) dado o centro Y do arrastado e os cards originais (cada um com top/height). */
export function dropIndex(rects: readonly { top: number; height: number }[], fromIdx: number, centerY: number): number {
  let idx = 0;
  rects.forEach((r, i) => {
    if (i !== fromIdx && centerY > r.top + r.height / 2) idx++;
  });
  return idx;
}

function load(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function persist<T>(key: string, s: Store<T>): Store<T> {
  s.subscribe((v) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* indisponível */ } });
  return s;
}

export const panelOrderStore = persist(ORDER_KEY, createStore<PanelId[]>(normalizeOrder(load(ORDER_KEY))));
export const panelPinsStore = persist(PINS_KEY, createStore<Pins>(normalizePins(load(PINS_KEY))));

export const togglePin = (id: PanelId) => panelPinsStore.set((p) => ({ ...p, [id]: !p[id] }));

// Condições do personagem (faixa de ícones no canto superior esquerdo). O servidor alimenta a partir do M2.
import { createStore, type Unsubscribe } from "./store.ts";

export type ConditionId =
  | "combat" | "poison" | "burn" | "energy" | "bleed" | "freeze"
  | "protect" | "haste" | "slow" | "drunk" | "regen" | "pz"
  | "manashield" | "rooted" | "taunted" | "fed" | "berserk" | "exposed" | "imbued";

export type ConditionGlyph = "swords" | "drop" | "flame" | "bolt" | "flake" | "shield" | "wing" | "snail" | "swirl" | "plus" | "home" | "bubble" | "vine" | "target" | "drumstick" | "gem";

export interface ConditionDef { label: string; color: string; glyph: ConditionGlyph }

/** Catálogo visual de cada condição. */
export const CONDITION_DEFS: Record<ConditionId, ConditionDef> = {
  combat: { label: "Em combate", color: "#d9534f", glyph: "swords" },
  poison: { label: "Envenenado", color: "#6fbf4a", glyph: "drop" },
  burn: { label: "Queimando", color: "#e8823a", glyph: "flame" },
  energy: { label: "Eletrificado", color: "#b48cf2", glyph: "bolt" },
  bleed: { label: "Sangrando", color: "#c8404a", glyph: "drop" },
  freeze: { label: "Congelado", color: "#7fc8e8", glyph: "flake" },
  protect: { label: "Protegido", color: "#4a7dd9", glyph: "shield" },
  haste: { label: "Rápido", color: "#d9a441", glyph: "wing" },
  slow: { label: "Lento", color: "#8a8fa0", glyph: "snail" },
  drunk: { label: "Tonto", color: "#c58ad9", glyph: "swirl" },
  regen: { label: "Regenerando", color: "#4f9d5d", glyph: "plus" },
  pz: { label: "Zona de proteção", color: "#5fb3a1", glyph: "home" },
  manashield: { label: "Escudo de Mana", color: "#5aa0ff", glyph: "bubble" },
  rooted: { label: "Enraizado", color: "#7fb04a", glyph: "vine" },
  taunted: { label: "Provocado", color: "#ff5a4a", glyph: "target" },
  fed: { label: "Alimentado", color: "#d9a05a", glyph: "drumstick" },
  berserk: { label: "Fúria (+25% de dano)", color: "#ff6a3a", glyph: "swords" },
  // Só em monstros (Ruptura Elemental); fica no catálogo para o tipo bater com o do shared.
  exposed: { label: "Exposto (sem resistência)", color: "#b48cf2", glyph: "bolt" },
  // Encantamento da Dona Marta: o tempo é de combate PvE, então vem como selo fixo (label), sem contagem local.
  imbued: { label: "Encantado", color: "#c080ff", glyph: "gem" },
};

export interface Condition {
  id: ConditionId;
  /** Instante (Date.now()) em que expira; ausente = indefinida. */
  until?: number;
  /** Texto extra no tooltip (ex.: "-5 HP/s"). */
  detail?: string;
  /** Selo fixo no ícone no lugar da contagem (encantamento: "7h", "45m"). */
  label?: string;
}

export const conditionsStore = createStore<Condition[]>([]);

export const getConditions = (): Condition[] => conditionsStore.get();
export const setConditions = (list: Condition[]): void => conditionsStore.set(list);
export function addCondition(c: Condition): void {
  conditionsStore.set((l) => [...l.filter((x) => x.id !== c.id), c]);
}
export function removeCondition(id: ConditionId): void {
  conditionsStore.set((l) => (l.some((x) => x.id === id) ? l.filter((x) => x.id !== id) : l));
}
export const subscribeConditions = (fn: (l: Condition[]) => void): Unsubscribe => conditionsStore.subscribe(fn);

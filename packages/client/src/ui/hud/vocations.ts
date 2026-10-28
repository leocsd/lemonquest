import type { Vocation } from "@lemonquest/shared";

export interface VocationMeta { label: string; color: string; faceset: string }

const base = import.meta.env.BASE_URL;

/** Rótulo, cor e retrato (Faceset 38x38 do Ninja Adventure) de cada vocação. */
export const VOCATION_META: Record<Vocation, VocationMeta> = {
  knight: { label: "Cavaleiro", color: "#c0563b", faceset: `${base}ninja/Actor/Character/Knight/Faceset.png` },
  paladin: { label: "Paladino", color: "#d9a441", faceset: `${base}ninja/Actor/Character/Hunter/Faceset.png` },
  sorcerer: { label: "Feiticeiro", color: "#7b5cd6", faceset: `${base}ninja/Actor/Character/SorcererBlack/Faceset.png` },
  druid: { label: "Druida", color: "#4f9d5d", faceset: `${base}ninja/Actor/Character/Shaman/Faceset.png` },
  // Fada (vocação oculta): o retrato é o da roupa exclusiva dela (gerado por tools/addons/generate.mjs).
  fairy: { label: "Fada", color: "#e0589e", faceset: `${base}addons/base_fada_face.png` },
};

export const vocationMeta = (v: string): VocationMeta => VOCATION_META[v as Vocation] ?? VOCATION_META.knight;

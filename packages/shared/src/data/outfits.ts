// Roupas (outfits) e addons estilo Tibia. Puramente cosmético: a vocação continua valendo para o resto.
// Arte: base = sheet de personagem do pack Ninja Adventure (64x112, frames 16x16);
// addons = overlays desenhados por tools/addons/generate.mjs (assets/addons/*.png).
import type { Sex, Vocation } from "../types.ts";
/** Altura extra (px acima do topo da base) de cada addon e dos overlays femininos — gerado por tools/addons/generate.mjs. */
import { ADDON_EXTRA_TOP as EXTRA_TOP, ADDON_FEMALE_EXTRA_TOP as EXTRA_TOP_F } from "./outfitsExtraTop.ts";

/**
 * Overlays de addon: mesmo layout de grade das sheets de personagem (4 colunas = lados, 7 linhas),
 * mas cada frame tem 32x32 com o frame 16x16 da base em (ADDON_OFFSET_X, ADDON_OFFSET_Y) —
 * a folga deixa chapéus passarem acima da cabeça e cajados/capas saírem do contorno.
 */
export const ADDON_FRAME = 32;
export const ADDON_OFFSET_X = 8;
export const ADDON_OFFSET_Y = 12;

export interface AddonDef {
  /** Único no catálogo inteiro (vira nome de arquivo). */
  id: string;
  /** Nome PT-BR. */
  name: string;
  /** Overlay desenhado POR CIMA da base (relativo a assets/). */
  sheet: string;
  /** Overlay desenhado ATRÁS da base (capas/aljavas vistas de frente), se houver. */
  backSheet?: string;
  /** Quantos px o addon sobe acima do topo da base (para o nome/barra de HP não ficarem por cima). */
  extraTop: number;
  /**
   * Overlays redesenhados sobre a sheet FEMININA (outra cabeça = outras âncoras: o chapéu assenta no cabelo dela).
   * Ausente = os mesmos overlays nos dois sexos (ver addonLayers).
   */
  female?: AddonSheets;
}

/** Arquivos de um addon num dos sexos. */
export interface AddonSheets { sheet: string; backSheet?: string; extraTop: number }

export interface OutfitDef {
  id: string;
  name: string;
  /** Sheet base (relativo a assets/), 64x112. Pode ser gerada (tools/addons) a partir de uma sheet do pack. */
  sheet: string;
  /** Retrato 38x38 (ausente = Faceset.png ao lado da sheet). */
  faceset?: string;
  /**
   * Sheet do sexo feminino (do pack ou gerada por tools/addons/generate.mjs), mesmo layout. Ausente = a mesma sheet
   * nos dois sexos (roupas fechadas: cavaleiro, ninja...). Ver outfitSheet.
   */
  female?: string;
  /** Retrato feminino (ausente = Faceset.png ao lado da sheet feminina). */
  facesetF?: string;
  /** Nome no feminino ("Cidadã", "Maga"...); ausente = o mesmo nome. */
  nameF?: string;
  /** Addon 1 (bit 1) e addon 2 (bit 2). */
  addons: [AddonDef, AddonDef];
  /**
   * Gancho futuro (conquistas): hoje tudo é liberado (ver isOutfitUnlocked).
   * Ex.: { outfit?: "achievement:x", addon1?: "...", addon2?: "..." }
   */
  unlock?: { outfit?: string; addon1?: string; addon2?: string };
}

const C = "ninja/Actor/Character/";
const A = "addons/";

function addon(id: string, name: string, back = false): AddonDef {
  return { id, name, sheet: `${A}${id}.png`, ...(back ? { backSheet: `${A}${id}_back.png` } : {}), extraTop: EXTRA_TOP[id] ?? 0 };
}

function outfit(id: string, name: string, sheetName: string, a1: AddonDef, a2: AddonDef): OutfitDef {
  return { id, name, sheet: `${C}${sheetName}/SpriteSheet.png`, addons: [a1, a2] };
}

/**
 * Versão feminina: mesma roupa (mesmo id e addons), sheet por sexo. `sheet` = nome de um personagem do pack ou caminho
 * gerado (addons/base_<id>_f.png). Os addons ganham overlay próprio quando o gerador o redesenhou para a cabeça dela.
 */
function fem(o: OutfitDef, nameF: string, sheet: string, facesetF?: string): OutfitDef {
  const female = sheet.includes("/") ? sheet : `${C}${sheet}/SpriteSheet.png`;
  const addons = o.addons.map((a) => (Object.hasOwn(EXTRA_TOP_F, a.id)
    ? { ...a, female: { sheet: `${A}${a.id}_f.png`, ...(a.backSheet ? { backSheet: `${A}${a.id}_f_back.png` } : {}), extraTop: EXTRA_TOP_F[a.id]! } }
    : a)) as [AddonDef, AddonDef];
  return { ...o, female, nameF, ...(facesetF ? { facesetF } : {}), addons };
}

/** Catálogo (ordem = ordem na janela de roupas). */
export const OUTFIT_LIST: OutfitDef[] = [
  fem(outfit("cidadao", "Cidadão", "Villager4", addon("cidadao_chapeu", "Chapéu com pena"), addon("cidadao_mochila", "Mochila de viagem", true)),
    "Cidadã", "Woman"),
  outfit("cacador", "Caçador", "Hunter", addon("cacador_chapeu", "Chapéu de caçador"), addon("cacador_aljava", "Aljava", true)),
  // Mago: sheet gerada (Master com túnica azul-violeta e barba longa permanente) — tools/addons/generate.mjs.
  // Maga: Woman de cabelo branco e vestido nas cores da túnica (gerada também).
  fem({ ...outfit("mago", "Mago", "Master", addon("mago_chapeu", "Chapéu de mago"), addon("mago_cajado", "Cajado arcano")),
    sheet: `${A}base_mago.png`, faceset: `${A}base_mago_face.png` }, "Maga", `${A}base_mago_f.png`, `${A}base_mago_f_face.png`),
  outfit("cavaleiro", "Cavaleiro", "Knight", addon("cavaleiro_pluma", "Pluma do elmo"), addon("cavaleiro_escudo", "Escudo nas costas", true)),
  fem(outfit("nobre", "Nobre", "Noble", addon("nobre_capa", "Capa de nobre", true), addon("nobre_pena", "Pena no chapéu")), "Nobre", "Princess"),
  fem(outfit("invocador", "Invocador", "SorcererOrange", addon("invocador_diadema", "Diadema"), addon("invocador_orbe", "Orbe flutuante")),
    "Invocadora", "SorcererBlack"),
  outfit("guerreiro", "Guerreiro", "RedNinja3", addon("guerreiro_asas", "Elmo alado", true), addon("guerreiro_machado", "Machado de guerra")),
  // Bárbara: o Faceset da Cavegirl2 tem 37 px de largura; o gerador completa para 38.
  fem(outfit("barbaro", "Bárbaro", "Caveman", addon("barbaro_elmo", "Elmo de chifres", true), addon("barbaro_clava", "Clava cravejada")),
    "Bárbara", "Cavegirl2", `${A}base_barbaro_f_face.png`),
  fem(outfit("druida", "Druida", "Shaman", addon("druida_coroa", "Coroa de folhas"), addon("druida_cajado", "Cajado de galho")), "Druida", "Cavegirl"),
  outfit("bruxo", "Bruxo", "NinjaMageBlack", addon("bruxo_manto", "Manto sombrio", true), addon("bruxo_cajado", "Cajado de caveira")),
  // As 4 roupas de barba sem par no pack ganham versão feminina gerada (base feminina + turbante/crânio/chapéu da masculina).
  fem(outfit("oriental", "Oriental", "Sultan2", addon("oriental_joia", "Joia do turbante"), addon("oriental_cimitarra", "Cimitarra")),
    "Oriental", `${A}base_oriental_f.png`, `${A}base_oriental_f_face.png`),
  fem(outfit("pirata", "Pirata", "FighterWhite", addon("pirata_chapeu", "Chapéu de pirata"), addon("pirata_papagaio", "Papagaio")), "Pirata", "EggGirl"),
  outfit("assassino", "Assassino", "NinjaDark", addon("assassino_cachecol", "Cachecol", true), addon("assassino_katana", "Katana nas costas", true)),
  outfit("nordico", "Nórdico", "GladiatorBlue", addon("nordico_capa", "Capa de pele de urso", true), addon("nordico_escudo", "Escudo redondo", true)),
  // Mendiga: OldWoman (a sheet do pack tem 2 linhas; o gerador completa as 7).
  fem(outfit("mendigo", "Mendigo", "OldMan", addon("mendigo_bengala", "Bengala torta"), addon("mendigo_trouxa", "Trouxa no ombro", true)),
    "Mendiga", `${A}base_mendigo_f.png`, `${C}OldWoman/Faceset.png`),
  fem(outfit("domador", "Domador de Feras", "ShamanLion", addon("domador_pele", "Pele de fera"), addon("domador_chicote", "Chicote")),
    "Domadora de Feras", `${A}base_domador_f.png`, `${A}base_domador_f_face.png`),
  outfit("cacador_demonios", "Caçador de Demônios", "RedGladiator",
    addon("cacador_demonios_chifres", "Chifres demoníacos", true), addon("cacador_demonios_espada", "Espada larga nas costas", true)),
  fem(outfit("peregrino", "Peregrino", "OldMan3", addon("peregrino_lanterna", "Cajado com lanterna"), addon("peregrino_cabaca", "Cabaça de viagem")),
    "Peregrina", `${A}base_peregrino_f.png`, `${A}base_peregrino_f_face.png`),
  outfit("senhor_guerra", "Senhor da Guerra", "KnightGold", addon("senhor_guerra_capa", "Capa de guerra", true), addon("senhor_guerra_martelo", "Martelo de guerra")),
  fem(outfit("monge", "Monge", "Monk", addon("monge_contas", "Contas de oração"), addon("monge_bastao", "Bastão de monge")),
    "Monja", `${A}base_monge_f.png`, `${A}base_monge_f_face.png`),
];

export const OUTFITS: Record<string, OutfitDef> = Object.fromEntries(OUTFIT_LIST.map((o) => [o.id, o]));

/** Roupa padrão de cada vocação (personagens novos e antigos sem o campo). */
export const DEFAULT_OUTFIT: Record<Vocation, string> = {
  knight: "cavaleiro",
  paladin: "cacador",
  sorcerer: "mago",
  druid: "druida",
};

/** Bits de addon: 1 = addon 1, 2 = addon 2. */
export const ADDON_BITS = 3;

export function outfitDef(id: string | undefined | null): OutfitDef | undefined {
  return id ? OUTFITS[id] : undefined;
}

export function defaultOutfit(vocation: string): string {
  return DEFAULT_OUTFIT[vocation as Vocation] ?? DEFAULT_OUTFIT.knight;
}

/** Roupa válida para exibir (fallback = padrão da vocação). */
export function resolveOutfit(outfit: string | undefined | null, vocation: string): OutfitDef {
  return outfitDef(outfit) ?? OUTFITS[defaultOutfit(vocation)];
}

/** Addons ativos de uma máscara (ordem: addon 1, addon 2). */
export function activeAddons(o: OutfitDef, bits: number): AddonDef[] {
  return o.addons.filter((_, i) => (bits & (1 << i)) !== 0);
}

/**
 * A roupa existe no sexo? Gancho para roupas de um sexo só (hoje todas existem nos dois: sem sheet feminina, ela veste
 * a mesma). O servidor recusa a troca para uma roupa indisponível.
 */
export function outfitAvailable(_o: OutfitDef, _sex: Sex): boolean {
  return true;
}

/** Sheet base da roupa no sexo (sem versão feminina = a mesma). */
export function outfitSheet(o: OutfitDef, sex: Sex | undefined): string {
  return sex === "f" ? o.female ?? o.sheet : o.sheet;
}

const facesetBeside = (sheet: string) => sheet.replace(/SpriteSheet\.png$/, "Faceset.png");

/** Retrato 38x38 da roupa no sexo (o Faceset do pack ao lado da sheet, ou o gerado). */
export function outfitFaceset(o: OutfitDef, sex: Sex | undefined): string {
  if (sex === "f" && o.female) return o.facesetF ?? facesetBeside(o.female);
  return o.faceset ?? facesetBeside(o.sheet);
}

/** Nome da roupa no sexo ("Cidadã" para ela; roupas sem nome feminino ficam iguais). */
export function outfitName(o: OutfitDef, sex: Sex | undefined): string {
  return sex === "f" ? o.nameF ?? o.name : o.name;
}

/** Overlays do addon no sexo: os redesenhados para a sheet feminina, se houver; senão os de sempre. */
export function addonLayers(a: AddonDef, sex: Sex | undefined): AddonSheets {
  return sex === "f" && a.female ? a.female : a;
}

import type { DamageKind, Vocation } from "../types.ts";

export type EquipSlot = "helmet" | "amulet" | "armor" | "weapon" | "shield" | "legs" | "ring" | "boots";
export const EQUIP_SLOTS: EquipSlot[] = ["helmet", "amulet", "armor", "weapon", "shield", "legs", "ring", "boots"];

export type ItemKind =
  | "weapon" | "shield" | "helmet" | "armor" | "legs" | "boots" | "ring" | "amulet"
  | "potion" | "material" | "key" | "quest" | "food";

export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";
export const RARITIES: Rarity[] = ["common", "uncommon", "rare", "epic", "legendary"];
/** Cores de raridade (UI, brilho do loot, feed). */
export const RARITY_COLOR: Record<Rarity, string> = {
  common: "#b5b9c6", uncommon: "#5fd17a", rare: "#4a9df0", epic: "#b36cf0", legendary: "#f0a33a",
};
export const RARITY_LABEL: Record<Rarity, string> = {
  common: "Comum", uncommon: "Incomum", rare: "Raro", epic: "Épico", legendary: "Lendário",
};

/** Atributos que itens (e bônus aleatórios) podem dar. */
export type StatId =
  | "attack"      // dano base da arma (substitui o dano "desarmado" da vocação)
  | "armor"       // redução fixa de dano recebido
  | "hpMax" | "manaMax"
  | "magic" | "melee" | "distance" | "shield"   // bônus de skill
  | "speed"       // % de velocidade
  | "crit"        // % de chance de crítico
  | "hpRegen" | "manaRegen"; // por tick de regen

export type Stats = Partial<Record<StatId, number>>;

/** Ícone: imagem única (url) ou frame de um atlas (url + frame + frameWidth/Height). Caminho relativo a assets/. */
export interface ItemIcon {
  url: string;
  frame?: number;
  frameWidth?: number;
  frameHeight?: number;
  tint?: number;
}

export type WeaponType = "sword" | "axe" | "club" | "bow" | "wand" | "rod";

export interface ItemDef {
  id: string;
  name: string;            // PT-BR
  kind: ItemKind;
  slot?: EquipSlot;        // obrigatório para equipáveis
  icon: ItemIcon;
  /** Vocações que podem equipar (ausente = todas). */
  vocations?: Vocation[];
  /** Level mínimo para equipar. */
  level?: number;
  stats?: Stats;
  weaponType?: WeaponType;
  /** Alcance do ataque automático com esta arma (1 = corpo a corpo). */
  range?: number;
  /** Tipo de dano do ataque automático com esta arma. */
  damageKind?: DamageKind;
  /** Duas mãos: impede escudo. */
  twoHanded?: boolean;
  stackable?: boolean;
  maxStack?: number;       // padrão 100 se stackable
  /** Preço base em ouro (a loja vende por ~este valor e compra por ~30%). */
  value: number;
  /** Itens usáveis: poções (cura/mana instantâneas) e comida (`food`: regeneração ao longo do tempo). */
  use?: { heal?: number; mana?: number; food?: { hpPerTick: number; manaPerTick: number; durationMs: number }; cooldownMs: number;
    /** Baú: abrir (usar) sorteia uma recompensa (servidor, systems/quests.ts). */
    chest?: boolean };
  /**
   * Item único (ciclo 16): prêmio de um lugar só (baús da Aniquilação). Fica fora de loja, do Baú de Recompensa e de
   * qualquer sorteio genérico de equipamento (ver `isExclusiveItem`).
   */
  unique?: boolean;
  description?: string;    // PT-BR, curta
}

/** Instância de item (o que fica na mochila/equipamento/depot). */
export interface ItemInstance {
  uid: string;             // único por instância
  defId: string;
  count: number;           // 1 para não-empilháveis
  rarity: Rarity;
  /** Bônus aleatórios da raridade (0–3), somados aos `stats` da definição. */
  bonuses: { stat: StatId; value: number }[];
  /** Refino do Ferreiro, 1..5 (shared/data/refine.ts); ausente = +0. Saves antigos não têm o campo. */
  refine?: number;
}

export interface LootEntry {
  itemId: string;
  /** Chance por abate, 0–1. */
  chance: number;
  min?: number;
  max?: number;
}

/** Espaços da mochila no level 1. A capacidade cresce com o level (backpackCapacity). */
export const BACKPACK_SIZE = 20;
/** Teto de espaços da mochila (alcançado no level 101). */
export const BACKPACK_MAX = 40;
/** A mochila ganha um espaço a cada tantos levels. */
export const BACKPACK_LEVELS_PER_SLOT = 5;

/** Espaços da mochila no level: 20 no lv 1, +1 a cada 5 levels, até 40 (lv 25 → 24, lv 50 → 29, lv 100 → 39). */
export function backpackCapacity(level: number): number {
  const lv = Number.isFinite(level) ? Math.max(1, Math.floor(level)) : 1;
  return Math.min(BACKPACK_MAX, BACKPACK_SIZE + Math.floor((lv - 1) / BACKPACK_LEVELS_PER_SLOT));
}
export const DEPOT_SIZE = 60;

// ---------------------------------------------------------------------------
// Ícones de equipamento: atlas gerado por tools/icons/generate.mjs (assets/icons/gear.png, 16x16, 12 colunas).
// Ordem do atlas: para cada forma (GEAR_SHAPES) 8 tiers (GEAR_TIERS); depois, para cada tier, anel e amuleto.
// ---------------------------------------------------------------------------
export const GEAR_SHAPES = [
  "helmet_cap", "helmet_full", "helmet_horned", "helmet_wizard", "armor_vest", "armor_plate", "armor_robe",
  "legs_pants", "legs_greaves", "boots", "shield_round", "shield_kite", "shield_tower",
] as const;
export const GEAR_TIERS = ["leather", "bronze", "iron", "steel", "gold", "mithril", "dragon", "arcane"] as const;
export type GearShape = (typeof GEAR_SHAPES)[number];
export type GearTier = (typeof GEAR_TIERS)[number];

/** Número do frame no atlas gear.png. */
export function gearFrame(shape: GearShape | "ring" | "amulet", tier: GearTier): number {
  const ti = GEAR_TIERS.indexOf(tier);
  if (shape === "ring") return GEAR_SHAPES.length * 8 + ti * 2;
  if (shape === "amulet") return GEAR_SHAPES.length * 8 + ti * 2 + 1;
  return GEAR_SHAPES.indexOf(shape) * 8 + ti;
}
const gear = (shape: GearShape | "ring" | "amulet", tier: GearTier): ItemIcon =>
  ({ url: "icons/gear.png", frame: gearFrame(shape, tier), frameWidth: 16, frameHeight: 16 });

/** Ícones de materiais: atlas tools/icons/materials.mjs (assets/icons/materials.png, 16x16, 8 colunas; ordem = esta lista). */
export const MATERIAL_ICONS = ["cheese","slime_goo","herb","bee_sting","wolf_pelt","wolf_fang","snake_skin","spider_silk","spider_eye","bat_wing","bone","goblin_tooth","ectoplasm","lizard_scale","ember"] as const;
const matIcon = (name: (typeof MATERIAL_ICONS)[number], tint?: number): ItemIcon =>
  ({ url: "icons/materials.png", frame: MATERIAL_ICONS.indexOf(name), frameWidth: 16, frameHeight: 16, ...(tint === undefined ? {} : { tint }) });

const N = "ninja/Items/";
const img = (path: string, tint?: number): ItemIcon => (tint === undefined ? { url: N + path } : { url: N + path, tint });

const ITEM_LIST: ItemDef[] = [];
const add = (d: ItemDef): void => { ITEM_LIST.push(d); };

// Níveis e preços por tier (1..8). Preço base; a loja compra a ~30%. Tiers 6 e 7 só caem das hunts de fim de jogo
// (orcs, minotauros, ciclopes, dragões, demônios); o tier 8 "Abissal" (ciclo 16), só do Profundo e de chefes.
export const TIER_LEVEL = [1, 8, 15, 25, 35, 50, 70, 100];
/** Tint dos ícones do tier 8 sobre quadros que já existem (uma 9ª paleta no gear.png mudaria o `gearFrame` de anel/amuleto). */
export const ABYSS_TINT = 0xa080ff;

// ---------------------------------------------------------------------------
// Moeda, poções e comida
// ---------------------------------------------------------------------------
add({ id: "gold_coin", name: "Moeda de Ouro", kind: "material", stackable: true, maxStack: 1_000_000, value: 1, icon: img("Treasure/GoldCoin.png") });

/**
 * Recarga das poções (ciclo 8): vida 2 s, mana 1 s. O temporizador é UM só para qualquer poção (server
 * inventory.potionCdUntil): beber uma de vida bloqueia qualquer poção por 2 s; uma de mana, por 1 s. Antes era 1 s
 * para todas — a Poção de Vida Grande (450/s) sobrava contra qualquer caça do level.
 */
export const HEALTH_POTION_CD_MS = 2000;
export const MANA_POTION_CD_MS = 1000;
const potion = (id: string, name: string, icon: ItemIcon, value: number, level: number, use: { heal?: number; mana?: number }, description: string): void =>
  add({ id, name, kind: "potion", stackable: true, value, level, use: { ...use, cooldownMs: use.heal ? HEALTH_POTION_CD_MS : MANA_POTION_CD_MS }, icon, description });
potion("health_potion", "Poção de Vida", img("Potion/LifePot.png"), 40, 1, { heal: 60 }, "Recupera 60 de vida.");
potion("health_potion_medium", "Poção de Vida Média", img("Potion/Medipack.png"), 120, 15, { heal: 180 }, "Recupera 180 de vida.");
potion("health_potion_large", "Poção de Vida Grande", img("Potion/Heart.png"), 300, 30, { heal: 450 }, "Recupera 450 de vida.");
// Mana 2–3× maior pelo mesmo preço (ciclo 9, #53): com 50/150/400 sustentar a rotação de magias de um mago custava 3–4× a
// renda de ouro da caça e as quatro vocações acabavam jogando de ataque básico. Continua sendo o maior sink de ouro dos magos.
potion("mana_potion", "Poção de Mana", img("Potion/WaterPot.png"), 45, 1, { mana: 120 }, "Recupera 120 de mana.");
potion("mana_potion_medium", "Poção de Mana Média", img("Potion/WaterPot.png", 0x9a9aff), 130, 15, { mana: 350 }, "Recupera 350 de mana.");
potion("mana_potion_large", "Poção de Mana Grande", img("Potion/MilkPot.png", 0xb070ff), 320, 30, { mana: 900 }, "Recupera 900 de mana.");

/** Comida: estado "alimentado" (regen a cada FOOD_TICK_MS). Sem cura instantânea; recarga própria de 1 s. */
export const FOOD_TICK_MS = 2000;
/** Máximo de tempo "alimentado" acumulado (comer estende, até este teto). */
export const FOOD_MAX_MS = 20 * 60_000;

const food = (id: string, name: string, icon: ItemIcon, value: number, level: number | undefined, hp: number, mana: number, minutes: number, description: string): void =>
  add({
    id, name, kind: "food", stackable: true, value, ...(level ? { level } : {}),
    use: { food: { hpPerTick: hp, manaPerTick: mana, durationMs: minutes * 60_000 }, cooldownMs: 1000 }, icon, description,
  });
// Presunto de Dragão (lv 30): cai dos dragões, como no Tibia.
food("dragon_ham", "Presunto de Dragão", img("Food/Meat.png", 0xff8a6a), 150, 30, 12, 4, 10, "Carne defumada de dragão. Muita vida.");
// iniciais (lv 1)
food("nuts", "Nozes", img("Food/Nut.png"), 5, undefined, 1, 1, 3, "Petisco simples. Um pouco de vida e mana.");
food("fish", "Peixe Grelhado", img("Food/Fish.png"), 8, undefined, 2, 0, 3, "Peixe fresco do rio.");
// pesca: vara (vendida pelo Tomé) e o que o rio dá
add({ id: "fishing_rod", name: "Vara de Pesca", kind: "material", stackable: true, maxStack: 1, value: 60, icon: img("Weapons/Stick/Sprite.png", 0xa8782f), description: "Clique com o botão direito na água, perto da margem, para pescar." });
food("trout", "Truta", img("Food/Fish.png", 0x9fc8e8), 14, undefined, 3, 0, 4, "Truta fresca, pescada na hora.");
food("salmon", "Salmão", img("Food/Fish.png", 0xff9c7a), 40, 5, 5, 1, 6, "Rico e saboroso. Dá vida e um pouco de mana.");
add({ id: "golden_fish", name: "Peixe Dourado", kind: "material", stackable: true, value: 220, icon: img("Food/Fish.png", 0xffd447), description: "Raro. Os mercadores pagam bem por ele." });
food("meat", "Carne Assada", img("Food/Meat.png"), 12, undefined, 3, 0, 4, "Um pedaço de carne bem passado.");
// foco em mana
food("honey", "Mel", img("Food/Honey.png"), 35, 5, 1, 3, 4, "Doce e revigorante. Favorece a mana.");
food("noodle", "Macarrão", img("Food/Noodle.png"), 60, 10, 2, 4, 6, "Uma tigela quente que acalma a mente.");
food("calamari", "Lula Frita", img("Food/Calamari.png"), 80, 15, 3, 5, 6, "Crocante. Ótima para conjuradores.");
// foco em vida / equilibrados
food("onigiri", "Bolinho de Arroz", img("Food/Onigiri.png"), 45, 5, 4, 3, 5, "Leve e nutritivo. Equilibrado.");
food("beaf", "Bife", img("Food/Beaf.png"), 75, 10, 6, 1, 6, "Bife suculento para guerreiros.");
food("yakitori", "Yakitori", img("Food/Yakitori.png"), 120, 15, 7, 2, 8, "Espetinho defumado. Muita vida.");
// premium (lv 20)
food("sushi", "Banquete de Sushi", img("Food/Sushi.png"), 200, 20, 8, 8, 10, "Refeição de gala. Vida e mana em abundância.");

// ---------------------------------------------------------------------------
// Materiais de monstros (vendáveis) e gemas
// ---------------------------------------------------------------------------
const mat = (id: string, name: string, icon: ItemIcon, value: number, description: string, maxStack = 100): void =>
  add({ id, name, kind: "material", stackable: true, maxStack, value, icon, description });
mat("cheese", "Queijo", matIcon("cheese"), 10, "Um pedaço de queijo mordiscado. Ratos adoram.");
mat("slime_goo", "Gosma", matIcon("slime_goo"), 12, "Gosma verde e viscosa.");
mat("herb", "Erva Medicinal", matIcon("herb"), 15, "Erva usada em poções e unguentos.");
mat("branch", "Galho Seco", img("Resource/Branch.png"), 5, "Um galho seco. Serve de lenha.");
mat("bee_sting", "Ferrão de Abelha", matIcon("bee_sting"), 15, "Pequeno, afiado e irritante.");
mat("wolf_pelt", "Couro de Lobo", matIcon("wolf_pelt"), 40, "Pele grossa de lobo. Curtumes pagam bem.");
mat("wolf_fang", "Presa de Lobo", matIcon("wolf_fang"), 30, "Presa afiada de lobo.");
mat("snake_skin", "Pele de Cobra", matIcon("snake_skin"), 55, "Pele escamosa de cobra.");
mat("spider_silk", "Seda de Aranha", matIcon("spider_silk"), 70, "Fios resistentes de seda.");
mat("spider_eye", "Olho de Aranha", matIcon("spider_eye"), 90, "Brilha no escuro. Ingrediente de poções.");
mat("bat_wing", "Asa de Morcego", matIcon("bat_wing"), 85, "Asa membranosa de morcego.");
mat("bone", "Osso", matIcon("bone"), 50, "Osso antigo de um esqueleto.");
mat("goblin_tooth", "Dente de Goblin", matIcon("goblin_tooth"), 110, "Dente amarelado de goblin.");
mat("iron_bar", "Barra de Ferro", img("Resource/BarIron.png"), 200, "Ferro bruto. Ferreiros compram.");
mat("ectoplasm", "Ectoplasma", matIcon("ectoplasm"), 180, "Resíduo gelado deixado por fantasmas.");
mat("lizard_scale", "Escama de Lagarto", matIcon("lizard_scale"), 250, "Escama dura e esverdeada.");
mat("ember", "Brasa Eterna", matIcon("ember"), 300, "Brasa que nunca se apaga.");
mat("gem_green", "Esmeralda", img("Resource/GemGreen.png"), 400, "Gema verde lapidada.", 50);
mat("gem_yellow", "Topázio", img("Resource/GemYellow.png"), 600, "Gema amarela lapidada.", 50);
mat("gem_purple", "Ametista", img("Resource/GemPurple.png"), 900, "Gema roxa lapidada.", 50);
mat("mithril_bar", "Barra de Mithril", img("Resource/BarMithril.png"), 2500, "Metal raríssimo azul-esverdeado.", 50);
// Fim de jogo (Terras Selvagens: Fortaleza Orc, Labirinto dos Minotauros, Monte Ciclope, Vale dos Dragões e Abismo)
mat("orc_leather", "Couro de Orc", matIcon("wolf_pelt", 0x8fc078), 380, "Couro grosso e malcheiroso de orc.");
mat("minotaur_horn", "Chifre de Minotauro", matIcon("wolf_fang", 0xe8d8b0), 480, "Chifre curvo, troféu de caçadores.");
mat("cyclops_eye", "Olho de Ciclope", matIcon("spider_eye", 0xffa060), 650, "Enorme e ainda úmido.");
mat("bonelord_eye", "Olho Maligno", matIcon("spider_eye", 0xff4060), 750, "Pisca mesmo depois de arrancado.");
mat("dragon_scale", "Escama de Dragão", matIcon("lizard_scale", 0x60d060), 1100, "Escama verde, dura como aço.");
mat("red_dragon_scale", "Escama de Dragão Vermelho", matIcon("lizard_scale", 0xff5040), 2200, "Quente ao toque. Ferreiros brigam por ela.");
mat("behemoth_claw", "Garra de Behemoth", matIcon("wolf_fang", 0x9aa4b4), 2600, "Garra do tamanho de uma espada curta.");
mat("demon_horn", "Chifre de Demônio", matIcon("wolf_fang", 0xe03030), 3500, "Ainda cheira a enxofre.");
mat("demonic_essence", "Essência Demoníaca", matIcon("ember", 0xc040ff), 4000, "Uma chama roxa que sussurra.");
// Costa Esmeralda (expansão a leste): selva, piratas, ilha gelada, heróis e vulcão.
// Ciclo 7: pelo 160→320, presa 210→420, dobrão 45→150, couro 320→600 (Selva/Piratas pagavam metade do ouro por vida
// das caças antigas da mesma faixa: ~0,33 contra 0,67–0,69 de goblin/homem-lagarto).
mat("ape_fur", "Pelo de Macaco", matIcon("wolf_pelt", 0xb08850), 320, "Pelo grosso e cheiroso dos macacos de Banuta.");
mat("tarantula_fang", "Presa de Tarântula", matIcon("wolf_fang", 0xc89060), 420, "Ainda pinga um veneno amarelado.");
mat("pirate_coin", "Dobrão Pirata", img("Treasure/Coin2.png", 0xe8c060), 150, "Moeda de ouro antiga, cunhada em terras distantes.");
mat("croc_leather", "Couro de Crocodilo", matIcon("snake_skin", 0x6a9a50), 600, "Couro escamado, ótimo para botas.");
mat("pirate_hat", "Chapéu de Pirata", img("Object/Bag.png", 0x403040), 900, "Um chapéu de capitão surrado. Colecionadores adoram.");
mat("carniphila_seed", "Semente de Carniphila", img("Food/SeedBig2.png", 0x90e070), 340, "Pulsa como um coração. Não plante perto de casa.");
mat("winter_fur", "Pele de Inverno", matIcon("wolf_pelt", 0xe8f0ff), 520, "Pele branca e macia, quente como uma fogueira.");
mat("ice_shard", "Lasca de Gelo Eterno", matIcon("ember", 0x9ad8ff), 760, "Nunca derrete, nem no sol do deserto.");
mat("necro_skull", "Crânio Profano", matIcon("bone", 0x9a80c0), 820, "Runas sombrias gravadas no osso.");
mat("hero_badge", "Insígnia de Herói", img("Treasure/SilverCoin.png", 0xc8d8ff), 950, "Medalha de um herói que perdeu o rumo.");
mat("frost_dragon_scale", "Escama de Dragão de Gelo", matIcon("lizard_scale", 0x9ad8ff), 1700, "Gelada ao toque. Ferreiros do norte pagam bem.");
mat("magma_core", "Núcleo de Magma", matIcon("ember", 0xff6a20), 2000, "Rocha derretida que pulsa no centro.");
mat("hellhound_fang", "Presa Infernal", matIcon("wolf_fang", 0xff5030), 3000, "Queima a mão de quem segura sem luva.");
mat("juggernaut_plate", "Placa de Colosso", img("Resource/BarSilver.png", 0xc0a090), 4500, "Um pedaço de couraça mais duro que mithril.");
// Ciclo 16: material do tier 8 (Tengu Rubro 25%, Samurai Rubro 30%; Orshabaal, Ferumbras e Shogun Abissal sempre).
mat("abyss_shard", "Fragmento Abissal", img("Resource/GemPurple.png", ABYSS_TINT), 3000, "Um caco de escuridão sólida. Frio de um lado, quente do outro.");
food("banana", "Banana", img("Food/Nut2.png", 0xffe060), 18, undefined, 3, 1, 4, "Doce e nutritiva. Os macacos brigam por ela.");

// ---------------------------------------------------------------------------
// Oficina dos Engenhos (ciclo 10): materiais, comida e bebida. Valores na escala dos vizinhos
// (cheese 10 · wolf_pelt 40 · bat_wing 85 · goblin_tooth 110). Nomes comuns de fantasia (pedido do dono, 2026-10-24);
// os ids continuam os do ciclo 10 (saves, depots, chão).
// ---------------------------------------------------------------------------
mat("cabo_roido", "Cordão Roído", img("Resource/Branch.png", 0x6878c0), 8, "Mordiscado pelas duas pontas. O rato jura que não foi ele.");
mat("iluminador_queimado", "Brasa Apagada", matIcon("ember", 0x707078), 12, "Já foi fogo um dia. Hoje só esquenta a lembrança.");
mat("rotulo_isca", "Etiqueta Rasgada", img("Other/Letter.png", 0xffb060), 35, "Dizia o que havia dentro. Agora só diz '...ado'.");
mat("post_it_senha", "Bilhete Amassado", img("Scroll/ScrollEmpty.png", 0xffe860), 30, "Um recado que alguém desistiu de mandar. A letra é péssima.");
mat("escoria_quente", "Pedra Incandescente", img("Resource/Rock.png", 0xff8040), 95, "Ainda brilha por dentro. Segure pela ponta fria, se achar uma.");
mat("lente_trincada", "Cristal Trincado", img("Resource/GemGreen.png", 0xb8dcf0), 140, "Rachou bem no meio. Os joalheiros ainda pagam, resmungando.");
mat("selo_chegou", "Selo de Cera", img("Other/Stamp.png", 0x70e080), 50, "Cera verde com um brasão que ninguém reconhece. Dá sorte, dizem.", 20);
mat("vasilha_empilhada", "Tigela Vazia", img("Potion/EmptyPot.png", 0xc8d8e0), 5, "Sem tampa e sem dono. Alguém comeu e não lavou.");
food("marmita_tampa_vermelha", "Ensopado do Viajante", img("Object/CrateEmpty.png", 0xff8a7a), 55, undefined, 5, 2, 6, "Carne, batata e um tempero que ninguém sabe dizer qual. Melhor no segundo dia.");
potion("cafe_oficina", "Chá de Ervas", img("Potion/MilkPot.png", 0x8a5a30), 25, 1, { mana: 60 }, "Recupera 60 de mana. Amargo o bastante para acordar até um esqueleto.");

// ---------------------------------------------------------------------------
// Malha da Ferrovia (ciclo 11, lv 25–60): materiais dos monstros da via. Valores na escala dos vizinhos de level
// (ape_fur 320 · orc_leather 380 · tarantula_fang 420 · minotaur_horn 480 · winter_fur 520). Nomes comuns de fantasia
// (pedido do dono, 2026-10-24); os ids continuam os do ciclo 11.
// ---------------------------------------------------------------------------
mat("pino_de_engate", "Pino de Ferro", img("Weapons/Stick/Sprite.png", 0x9098a8), 180, "Estava entre as escamas da cobra. Melhor não perguntar como foi parar ali.");
mat("pastilha_de_sapata", "Placa de Pedra", img("Resource/Rock.png", 0x6a5a50), 220, "Lisa de um lado, áspera do outro. A toupeira usava de travesseiro.");
mat("brita_de_lastro", "Cascalho", img("Resource/Rock.png", 0xa0a0a8), 260, "Um punhado de pedrinhas. As ratazanas guardam como se fosse ouro.");
mat("lente_industrial", "Cristal Azul", img("Resource/GemPurple.png", 0xd8f0ff), 340, "Frio ao toque e azul como lago de montanha. A lanterna brilhava por causa dele.");
mat("frame_corrompido", "Pergaminho Borrado", img("Scroll/ScrollEmpty.png", 0x90a0c0), 380, "Um feitiço escrito às pressas e molhado de chuva. Ninguém se arrisca a ler em voz alta.");
mat("rolamento_de_rodeiro", "Engrenagem de Prata", img("Treasure/SilverCoin.png", 0x8890a0), 460, "Gira sozinha quando ninguém olha. Os ferreiros adoram.");
mat("chaveta", "Cunha de Ferro", img("Resource/Branch.png", 0xb8b8c0), 520, "Pequena, torta e indispensável. Ainda quente da fera.");

// Chaves e itens de missão
// Ciclo 14: não abre nada (a Cripta nunca teve portão trancado); o texto prometia uma porta que não existe.
add({ id: "crypt_key", name: "Chave da Cripta", kind: "key", value: 0, icon: img("Treasure/SilverKey.png"), description: "Enferrujada e fria. O lich guardava como relíquia, mas a porta que ela abria virou pó há séculos. Prova de que o Lich do Pântano caiu." });
add({
  id: "bounty_chest", name: "Baú de Recompensa", kind: "quest", stackable: true, maxStack: 20, value: 0, icon: { url: N + "Treasure/LittleTreasureChest.png", frame: 0, frameWidth: 16, frameHeight: 16 },
  use: { chest: true, cooldownMs: 500 },
  description: "Prêmio do Quadro de Recompensas. Use para abrir: poções, comida, ouro e, com sorte, um equipamento incomum ou melhor.",
});
add({ id: "goblin_crown", name: "Coroa do Rei Goblin", kind: "quest", value: 0, icon: img("Treasure/GoldCup.png"), description: "Prova de que o Rei Goblin caiu." });
add({ id: "horned_fox_tail", name: "Cauda da Raposa Chifruda", kind: "quest", value: 0, icon: matIcon("wolf_pelt", 0xffa040), description: "Prova de que a Raposa Chifruda caiu." });
add({ id: "demodras_head", name: "Cabeça de Demodras", kind: "quest", value: 0, icon: matIcon("lizard_scale", 0xff3020), description: "Prova de que Demodras caiu." });
add({ id: "orshabaal_brain", name: "Cérebro de Orshabaal", kind: "quest", value: 0, icon: img("Food/Meat.png", 0xff80b0), description: "Ainda pulsa. Prova de que Orshabaal caiu." });
add({ id: "redbeard_hook", name: "Gancho do Barba-Ruiva", kind: "quest", value: 0, icon: img("Weapons/Stick/Sprite.png", 0xd0d0d8), description: "Prova de que o Capitão Barba-Ruiva caiu." });
add({ id: "kongra_crown", name: "Coroa do Rei Kongra", kind: "quest", value: 0, icon: img("Treasure/GoldCup.png", 0xffe080), description: "Uma coroa de ossos e penas. Prova de que o Rei Kongra caiu." });
add({ id: "yeti_fur", name: "Pelo do Yeti", kind: "quest", value: 0, icon: matIcon("wolf_pelt", 0xffffff), description: "Branco como a neve. Prova de que o Yeti caiu." });
add({ id: "ferumbras_staff", name: "Cajado Partido de Ferumbras", kind: "quest", value: 0, icon: img("Weapons/Stick/Sprite.png", 0xd890ff), description: "Prova de que Ferumbras caiu... por enquanto." });
add({ id: "annihilation_bear", name: "Urso da Aniquilação", kind: "quest", value: 0, icon: img("Object/Bag.png", 0xc08060), description: "Um ursinho de pelúcia chamuscado. Só quem sobreviveu à Aniquilação tem um." });
// Onda 3 (Lei de Murphy): reservado; ainda sem fonte no jogo.
add({ id: "mensagem_retida", name: "Carta Lacrada", kind: "quest", value: 0, icon: img("Other/Letter2.png", 0xd0d8e0), description: "Uma carta que nunca chegou ao destino. Alguém vai ter que levar a pé." });
// Malha da Ferrovia (ciclo 11): provas dos dois chefes da via.
add({ id: "selo_nao_inspecionavel", name: "Olho do Ciclope", kind: "quest", value: 0, icon: img("Other/Stamp.png", 0xe05040), description: "Ainda pisca de vez em quando. Prova de que o Ciclope de Pedra caiu." });
add({ id: "apito_de_locomotiva", name: "Dente do Tirano", kind: "quest", value: 0, icon: img("Object/PanFlute.png", 0xd0c080), description: "Do tamanho de um braço e ainda afiado. Prova de que o Tirano da Serra caiu." });
// Covis das caves profundas (ciclo 16): troféus dos chefes. Não abrem nada: o baú do covil pede o abate registrado no
// personagem (`QuestChestGroupDef.needBoss`), porque um item passaria de mão em mão para qualquer personagem.
add({ id: "mole_king_claw", name: "Garra do Rei Toupeira", kind: "quest", value: 0, icon: matIcon("wolf_fang", 0xd8b088), description: "Cavou meia montanha e ainda está afiada. Lembrança de quem derrubou o Rei Toupeira no covil das Minas." });
add({ id: "kraken_eye", name: "Olho do Kraken", kind: "quest", value: 0, icon: matIcon("spider_eye", 0x90f0c0), description: "Continua encarando você do fundo da mochila. Lembrança de quem derrubou o Kraken no covil das Grutas." });
add({ id: "ancestral_heart", name: "Coração da Chama Ancestral", kind: "quest", value: 0, icon: matIcon("ember", 0xd090ff), description: "Uma brasa violeta que não apaga nem na água. Lembrança de quem apagou a Chama Ancestral no covil das Catacumbas." });
add({ id: "shogun_seal", name: "Selo do Shogun Abissal", kind: "quest", value: 0, icon: img("Other/Stamp.png", 0xa080ff), description: "O brasão do Shogun, frio como o fundo do Abismo. Lembrança de quem derrubou o Shogun no covil do Abismo Profundo." });

// ---------------------------------------------------------------------------
// Armas
// ---------------------------------------------------------------------------
type WOpts = { range?: number; kind?: DamageKind; twoHanded?: boolean; stats?: Stats };
const weapon = (id: string, name: string, wt: WeaponType, voc: Vocation, icon: ItemIcon, tier: number, attack: number, value: number, description: string, o: WOpts = {}): void =>
  add({
    id, name, kind: "weapon", slot: "weapon", icon, vocations: [voc], level: TIER_LEVEL[tier - 1], weaponType: wt,
    range: o.range ?? 1, damageKind: o.kind ?? "physical", ...(o.twoHanded ? { twoHanded: true } : {}),
    stats: { attack, ...o.stats }, value, description,
  });
const W = "Weapons/";

// Cavaleiro (corpo a corpo). T1 lv1, T2 lv8, T3 lv15, T4 lv25, T5 lv35.
// T1 com ataque um pouco maior: com o punho crescendo devagar, a arma inicial ainda vale até o tier 2 (lv 8).
weapon("short_sword", "Espada Curta", "sword", "knight", img(W + "Sword/Sprite.png"), 1, 11, 60, "Lâmina simples de treino.");
weapon("wooden_club", "Clava de Madeira", "club", "knight", img(W + "Club/Sprite.png"), 1, 10, 45, "Pesada e barata.");
weapon("longsword", "Espada Longa", "sword", "knight", img(W + "Sword2/Sprite.png"), 2, 22, 700, "Equilibrada e confiável.");
weapon("hand_axe", "Machado de Mão", "axe", "knight", img(W + "Axe/Sprite.png"), 2, 24, 750, "Corta fundo, mas é lento de manejar.");
weapon("iron_sword", "Espada de Ferro", "sword", "knight", img(W + "Rapier/Sprite.png", 0xb8c0d0), 3, 36, 3000, "Forjada em ferro de boa qualidade.", { stats: { melee: 1 } });
weapon("war_hammer", "Martelo de Guerra", "club", "knight", img(W + "Hammer/Sprite.png"), 3, 44, 3600, "Esmaga armaduras. Duas mãos.", { twoHanded: true });
weapon("steel_blade", "Lâmina de Aço", "sword", "knight", img(W + "BigSword/Sprite.png", 0xc0d8f0), 4, 52, 11000, "Aço temperado. Presente de mestres ferreiros.", { stats: { melee: 1 } });
weapon("battle_axe", "Machado de Batalha", "axe", "knight", img(W + "Axe/Sprite.png", 0xb0c0d8), 4, 62, 13000, "Enorme e brutal. Duas mãos.", { twoHanded: true });
weapon("mithril_katana", "Katana de Mithril", "sword", "knight", img(W + "Katana/Sprite.png", 0x70f0e0), 5, 70, 38000, "Leve como pluma, afiada como a noite.", { stats: { melee: 2, crit: 2 } });
weapon("dragon_axe", "Machado do Dragão", "axe", "knight", img(W + "Axe/Sprite.png", 0xff6a5a), 5, 84, 46000, "Forjado no sopro de um dragão. Duas mãos.", { twoHanded: true, stats: { melee: 2, crit: 3 } });
weapon("fire_sword", "Espada de Fogo", "sword", "knight", img(W + "Sword2/Sprite.png", 0xff7030), 6, 96, 90000, "A lâmina arde sem se consumir.", { kind: "fire", stats: { melee: 2, crit: 2 } });
weapon("giant_sword", "Espada Gigante", "sword", "knight", img(W + "BigSword/Sprite.png", 0xd8d0c0), 6, 112, 100000, "Pesada demais para um homem comum. Duas mãos.", { twoHanded: true, stats: { melee: 2, crit: 3 } });
weapon("magic_longsword", "Espada Longa Mágica", "sword", "knight", img(W + "Sword2/Sprite.png", 0x9a7aff), 7, 130, 190000, "Runas antigas brilham ao longo do fio.", { stats: { melee: 3, crit: 3 } });
weapon("demon_axe", "Machado Demoníaco", "axe", "knight", img(W + "Axe/Sprite.png", 0xb02040), 7, 150, 210000, "Arrancado das mãos de um demônio. Duas mãos.", { twoHanded: true, stats: { melee: 3, crit: 4 } });
// Baús de quest (só uma vez por personagem): Tesouro do Barba-Ruiva (lv 35) e Aniquilação (lv 100).
weapon("pirate_saber", "Sabre do Pirata", "sword", "knight", img(W + "Katana/Sprite.png", 0xffd070), 5, 74, 42000, "O sabre do Capitão Barba-Ruiva. Só sai de um baú.", { stats: { melee: 2, crit: 3 } });
add({ id: "stonecutter_axe", name: "Machado Cortapedras", kind: "weapon", slot: "weapon", icon: img(W + "Axe/Sprite.png", 0x9ad0ff), vocations: ["knight"], level: 100,
  weaponType: "axe", range: 1, damageKind: "physical", twoHanded: true, stats: { attack: 175, melee: 4, crit: 5 }, value: 320000, unique: true,
  description: "Prêmio da Aniquilação. Corta pedra como se fosse manteiga. Duas mãos." });

// Paladino (arcos, alcance 6, físico, duas mãos).
// Ciclo 9 (GD-05): o paladino era a vocação mais fraca do modelo; os arcos do tier 2 em diante ganham +15 % de ataque
// (arredondado para cima) sobre a tabela original, mantendo tiers e preços. A tabela base fica legível; o fator nunca
// passa o machado do mesmo tier (19→22, 32→37, 46→53, 62→72, 80→92, 100→115; corsário 66→76). O arco inicial (tier 1)
// fica em 9: a Flecha Perfurante do level 1 é calibrada para valer 1,5–3× o auto-ataque inicial (spells.test.ts), e a
// fraqueza do paladino aparece no meio/fim do jogo, não no level 1.
export const BOW_ATTACK_MULT = 1.15;
const BOW = { range: 6, twoHanded: true } as const;
const bow = (id: string, name: string, icon: ItemIcon, tier: number, baseAttack: number, value: number, description: string, stats?: Stats): void =>
  weapon(id, name, "bow", "paladin", icon, tier, tier === 1 ? baseAttack : Math.ceil(baseAttack * BOW_ATTACK_MULT), value, description, stats ? { ...BOW, stats } : BOW);
bow("short_bow", "Arco Curto", img(W + "Bow/Sprite.png"), 1, 9, 70, "Arco de madeira para iniciantes.");
bow("hunting_bow", "Arco de Caça", img(W + "Bow2/Sprite.png"), 2, 19, 700, "Silencioso e preciso.");
bow("long_bow", "Arco Longo", img(W + "Bow/Sprite.png", 0xd0b070), 3, 32, 3000, "Alcança longe com força.", { distance: 1 });
bow("composite_bow", "Arco Composto", img(W + "Bow2/Sprite.png", 0xb0c0d8), 4, 46, 11000, "Chifre, madeira e tendão.", { distance: 2 });
bow("elven_bow", "Arco Élfico", img(W + "Bow2/Sprite.png", 0x70f0e0), 5, 62, 38000, "Canta quando a corda é solta.", { distance: 3, crit: 2 });
bow("royal_crossbow", "Besta Real", img(W + "Bow/Sprite.png", 0xf0c060), 6, 80, 90000, "Dourada e precisa, feita para a guarda do rei.", { distance: 3, crit: 3 });
bow("celestial_bow", "Arco Celestial", img(W + "Bow2/Sprite.png", 0xc8e8ff), 7, 100, 190000, "Dizem que a corda é um raio de luar.", { distance: 4, crit: 3 });
bow("corsair_bow", "Arco do Corsário", img(W + "Bow/Sprite.png", 0xffb060), 5, 66, 42000, "Madeira de mastro e corda de âncora. Só sai de um baú.", { distance: 3, crit: 3 });

// Feiticeiro (varinhas, alcance 4, energia/fogo).
const WAND = { range: 4 } as const;
weapon("apprentice_wand", "Varinha de Aprendiz", "wand", "sorcerer", img(W + "MagicWand/Sprite.png"), 1, 7, 70, "Faísca fraca, mas é um começo.", { ...WAND, kind: "energy" });
weapon("oak_wand", "Varinha de Carvalho", "wand", "sorcerer", img(W + "MagicWand/Sprite.png", 0xd0a060), 2, 15, 700, "Crepita de energia.", { ...WAND, kind: "energy", stats: { magic: 1 } });
weapon("storm_wand", "Varinha da Tempestade", "wand", "sorcerer", img(W + "MagicWand/Sprite.png", 0x80b8ff), 3, 25, 3000, "Raios curtos e nervosos.", { ...WAND, kind: "energy", stats: { magic: 1 } });
weapon("ember_wand", "Varinha Flamejante", "wand", "sorcerer", img(W + "MagicWand/Sprite.png", 0xff8040), 4, 38, 11000, "Quente ao toque.", { ...WAND, kind: "fire", stats: { magic: 2, manaMax: 40 } });
weapon("inferno_wand", "Varinha do Inferno", "wand", "sorcerer", img(W + "MagicWand/Sprite.png", 0xff3030), 5, 52, 38000, "Guarda uma chama que não morre.", { ...WAND, kind: "fire", stats: { magic: 3, manaMax: 80 } });
weapon("starstorm_wand", "Varinha da Tempestade Estelar", "wand", "sorcerer", img(W + "MagicWand/Sprite.png", 0xb0a0ff), 6, 68, 90000, "Estrelas cadentes presas num cristal.", { ...WAND, kind: "energy", stats: { magic: 4, manaMax: 120 } });
weapon("destruction_wand", "Varinha da Destruição", "wand", "sorcerer", img(W + "MagicWand/Sprite.png", 0xff5020), 7, 86, 190000, "Feita com o chifre de um demônio.", { ...WAND, kind: "fire", stats: { magic: 5, manaMax: 160 } });
weapon("tide_wand", "Varinha das Marés", "wand", "sorcerer", img(W + "MagicWand/Sprite.png", 0x40c8ff), 5, 55, 42000, "Cheira a maresia e estala como um raio. Só sai de um baú.", { ...WAND, kind: "energy", stats: { magic: 3, manaMax: 90 } });

// Druida (bastões, alcance 4, gelo/terra).
weapon("twig_rod", "Graveto Encantado", "rod", "druid", img(W + "Stick/Sprite.png"), 1, 7, 70, "Um graveto que ainda lembra da floresta.", { ...WAND, kind: "ice" });
weapon("thorn_rod", "Bastão de Espinhos", "rod", "druid", img(W + "Stick/Sprite.png", 0x70c060), 2, 15, 700, "Espinhos que pulsam com a terra.", { ...WAND, kind: "earth", stats: { magic: 1 } });
weapon("frost_rod", "Bastão de Gelo", "rod", "druid", img(W + "Stick/Sprite.png", 0x90d8ff), 3, 25, 3000, "Cristais de gelo no topo.", { ...WAND, kind: "ice", stats: { magic: 1 } });
weapon("moss_rod", "Bastão do Pântano", "rod", "druid", img(W + "Stick/Sprite.png", 0x50a070), 4, 38, 11000, "Cheira a terra úmida.", { ...WAND, kind: "earth", stats: { magic: 2, manaMax: 40 } });
weapon("glacier_rod", "Bastão Glacial", "rod", "druid", img(W + "Stick/Sprite.png", 0xc8f4ff), 5, 52, 38000, "Frio de mil invernos.", { ...WAND, kind: "ice", stats: { magic: 3, manaMax: 80 } });
weapon("northwind_rod", "Bastão do Vento Norte", "rod", "druid", img(W + "Stick/Sprite.png", 0x9ad0ff), 6, 68, 90000, "O vento do norte dorme dentro dele.", { ...WAND, kind: "ice", stats: { magic: 4, manaMax: 120 } });
weapon("ancient_root_rod", "Bastão de Raiz Ancestral", "rod", "druid", img(W + "Stick/Sprite.png", 0x60c040), 7, 86, 190000, "Brotou no coração do Abismo e não morreu.", { ...WAND, kind: "earth", stats: { magic: 5, manaMax: 160 } });
weapon("coral_rod", "Bastão de Coral", "rod", "druid", img(W + "Stick/Sprite.png", 0xff8090), 5, 55, 42000, "Coral vivo arrancado do fundo do mar. Só sai de um baú.", { ...WAND, kind: "ice", stats: { magic: 3, manaMax: 90 } });

// Aniquilação (ciclo 16): um prêmio por vocação, como o Machado Cortapedras (lv 100, 320 mil, únicos). ~9% acima da
// arma do tier 8 da vocação (Cortapedras 175 contra a Lâmina Abissal 160) e o elemento que o tier 8 não tem.
add({ id: "annihilator_bow", name: "Arco Aniquilador", kind: "weapon", slot: "weapon", icon: img(W + "Bow/Sprite.png", 0x9ad0ff), vocations: ["paladin"], level: 100,
  weaponType: "bow", ...BOW, damageKind: "physical", stats: { attack: Math.ceil(136 * BOW_ATTACK_MULT), distance: 5, crit: 5 }, value: 320000, unique: true,
  description: "Prêmio da Aniquilação. A flecha atravessa o alvo e ainda procura o próximo." });
add({ id: "annihilator_wand", name: "Varinha Aniquiladora", kind: "weapon", slot: "weapon", icon: img(W + "MagicWand/Sprite.png", 0x9ad0ff), vocations: ["sorcerer"], level: 100,
  weaponType: "wand", ...WAND, damageKind: "energy", stats: { attack: 115, magic: 6, manaMax: 240 }, value: 320000, unique: true,
  description: "Prêmio da Aniquilação. Estala como o céu antes da tempestade." });
add({ id: "annihilator_rod", name: "Bastão Aniquilador", kind: "weapon", slot: "weapon", icon: img(W + "Stick/Sprite.png", 0x9ad0ff), vocations: ["druid"], level: 100,
  weaponType: "rod", ...WAND, damageKind: "ice", stats: { attack: 115, magic: 6, manaMax: 240 }, value: 320000, unique: true,
  description: "Prêmio da Aniquilação. Geada eterna, presa num cajado de pedra azul." });

// ---------------------------------------------------------------------------
// Armaduras
// ---------------------------------------------------------------------------
type Piece = { slot: "helmet" | "armor" | "legs" | "boots" | "shield"; shape: GearShape };
const PIECES: Record<Piece["slot"], GearShape> = { helmet: "helmet_cap", armor: "armor_vest", legs: "legs_pants", boots: "boots", shield: "shield_round" };

interface SetSpec {
  prefix: string;
  tier: number;                  // 1..5 (define o level)
  palette: GearTier;
  names: string[];               // nomes por peça, na ordem de `slots`
  slots: Piece["slot"][];
  shapes: Partial<Record<Piece["slot"], GearShape>>;
  armor: number[];               // armor por peça
  values: number[];
  extra?: Partial<Record<Piece["slot"], Stats>>;
  vocations?: Vocation[];
  level?: number;
  /** Tint sobre o quadro da paleta (tier 8: `ABYSS_TINT`). */
  tint?: number;
  blurb: string;
}
function buildSet(s: SetSpec): void {
  s.slots.forEach((slot, i) => {
    const shape = s.shapes[slot] ?? PIECES[slot];
    const stats: Stats = { ...(s.armor[i] ? { armor: s.armor[i] } : {}), ...(s.extra?.[slot] ?? {}) };
    add({
      id: `${s.prefix}_${slot}`, name: s.names[i]!, kind: slot, slot, icon: s.tint === undefined ? gear(shape, s.palette) : { ...gear(shape, s.palette), tint: s.tint },
      ...(s.vocations ? { vocations: s.vocations } : {}), level: s.level ?? TIER_LEVEL[s.tier - 1], stats, value: s.values[i]!,
      description: s.blurb,
    });
  });
}
const MELEE: Piece["slot"][] = ["helmet", "armor", "legs", "boots", "shield"];
const GEAR4: Piece["slot"][] = ["helmet", "armor", "legs", "boots"];

// Cavaleiro/geral: 5 peças por tier. Armadura total: 3 / 5 / 7 / 10 / 14.
buildSet({ prefix: "leather", tier: 1, palette: "leather", slots: MELEE, shapes: {}, armor: [1, 1, 0, 0, 1], values: [20, 40, 15, 15, 30],
  names: ["Gorro de Couro", "Colete de Couro", "Calças de Couro", "Botas de Couro", "Escudo de Madeira"],
  extra: { legs: { hpMax: 10 }, boots: { speed: 2 }, shield: { shield: 1 } }, blurb: "Equipamento básico de aventureiro." });
buildSet({ prefix: "bronze", tier: 2, palette: "bronze", slots: MELEE, shapes: { helmet: "helmet_full" }, armor: [1, 2, 1, 0, 1], values: [150, 350, 200, 100, 200],
  names: ["Elmo de Bronze", "Armadura de Bronze", "Grevas de Bronze", "Botas de Bronze", "Escudo de Bronze"],
  vocations: ["knight"], extra: { boots: { speed: 3 }, shield: { shield: 2 } }, blurb: "Bronze polido, pesado e confiável." });
buildSet({ prefix: "iron", tier: 3, palette: "iron", slots: MELEE, shapes: { helmet: "helmet_full", armor: "armor_plate", legs: "legs_greaves", shield: "shield_kite" }, armor: [1, 2, 1, 1, 2], values: [650, 1600, 900, 450, 900],
  names: ["Elmo de Ferro", "Peitoral de Ferro", "Grevas de Ferro", "Botas de Ferro", "Escudo de Ferro"],
  vocations: ["knight"], extra: { boots: { speed: 4 }, shield: { shield: 3 } }, blurb: "Ferro forjado para soldados veteranos." });
buildSet({ prefix: "steel", tier: 4, palette: "steel", slots: MELEE, shapes: { helmet: "helmet_horned", armor: "armor_plate", legs: "legs_greaves", shield: "shield_tower" }, armor: [2, 3, 2, 1, 2], values: [2400, 5600, 3200, 1600, 3200],
  names: ["Elmo Cornífero de Aço", "Armadura de Aço", "Grevas de Aço", "Botas de Aço", "Escudo-Torre de Aço"],
  vocations: ["knight"], extra: { boots: { speed: 5 }, shield: { shield: 4 } }, blurb: "Aço azulado, digno de cavaleiros." });
buildSet({ prefix: "mithril", tier: 5, palette: "mithril", slots: MELEE, shapes: { helmet: "helmet_horned", armor: "armor_plate", legs: "legs_greaves", shield: "shield_tower" }, armor: [2, 5, 3, 1, 3], values: [7500, 17500, 10000, 5000, 10000],
  names: ["Elmo de Mithril", "Armadura de Mithril", "Grevas de Mithril", "Botas de Mithril", "Escudo de Mithril"],
  vocations: ["knight"], extra: { boots: { speed: 6 }, shield: { shield: 5 }, helmet: { melee: 1 }, armor: { hpMax: 60 } }, blurb: "Mithril: leve como couro, duro como diamante." });
// Fim de jogo (só cai de monstros): tier 6 = Coroa (lv 50), tier 7 = Demônio (lv 70). As botas desses tiers vieram no
// ciclo 16 (abaixo, perto das Botas da Pressa).
buildSet({ prefix: "crown", tier: 6, palette: "gold", slots: ["helmet", "armor", "legs", "shield"], shapes: { helmet: "helmet_full", armor: "armor_plate", legs: "legs_greaves", shield: "shield_kite" }, armor: [3, 6, 4, 4], values: [24000, 56000, 32000, 32000],
  names: ["Elmo da Coroa", "Armadura da Coroa", "Grevas da Coroa", "Escudo da Coroa"],
  vocations: ["knight"], extra: { helmet: { melee: 1 }, armor: { hpMax: 120 }, shield: { shield: 6 } }, blurb: "Usada pela guarda real de outras eras." });
buildSet({ prefix: "demon", tier: 7, palette: "dragon", slots: ["helmet", "armor", "legs", "shield"], shapes: { helmet: "helmet_horned", armor: "armor_plate", legs: "legs_greaves", shield: "shield_tower" }, armor: [4, 8, 5, 5], values: [60000, 140000, 80000, 80000],
  names: ["Elmo Demoníaco", "Armadura de Placas Mágica", "Grevas Demoníacas", "Escudo Demoníaco"],
  vocations: ["knight"], extra: { helmet: { melee: 2 }, armor: { hpMax: 200 }, shield: { shield: 8 } }, blurb: "Forjada no Abismo. Poucos sobrevivem para vesti-la." });

// Paladino (4 peças, sem escudo: arcos usam as duas mãos). Armadura total 4 / 5 / 7 / 9 — antes só tiers 2 e 4: do
// level 8 ao 25 o paladino ficava com 4 de armadura (cavaleiro 7) e no fim de jogo sem peça própria.
buildSet({ prefix: "ranger", tier: 2, palette: "iron", slots: GEAR4, shapes: {}, armor: [1, 2, 1, 0], values: [100, 300, 200, 100],
  names: ["Capuz de Patrulheiro", "Colete de Patrulheiro", "Calças de Patrulheiro", "Botas de Patrulheiro"],
  vocations: ["paladin"], extra: { helmet: { distance: 1 }, boots: { speed: 3 } }, blurb: "Leve e silencioso, para quem atira de longe." });
buildSet({ prefix: "hunter", tier: 3, palette: "steel", slots: GEAR4, shapes: {}, armor: [1, 2, 1, 1], values: [550, 1500, 950, 500],
  names: ["Capuz de Caçador", "Gibão de Caçador", "Calças de Caçador", "Botas de Caçador"],
  vocations: ["paladin"], extra: { helmet: { distance: 1 }, boots: { speed: 4 } }, blurb: "Couro reforçado de quem vive na mata." });
buildSet({ prefix: "sniper", tier: 4, palette: "mithril", slots: GEAR4, shapes: { helmet: "helmet_full", armor: "armor_plate" }, armor: [2, 3, 1, 1], values: [1700, 4800, 3100, 1400],
  names: ["Elmo de Franco-Atirador", "Couraça de Franco-Atirador", "Calças de Franco-Atirador", "Botas de Franco-Atirador"],
  vocations: ["paladin"], extra: { helmet: { distance: 1 }, armor: { distance: 1 }, boots: { speed: 5 } }, blurb: "Camuflagem e proteção para o arqueiro experiente." });
buildSet({ prefix: "master_archer", tier: 5, palette: "dragon", slots: GEAR4, shapes: { helmet: "helmet_full", armor: "armor_plate", legs: "legs_greaves" }, armor: [2, 4, 2, 1], values: [6500, 16000, 9500, 5000],
  names: ["Elmo do Arqueiro-Mestre", "Couraça do Arqueiro-Mestre", "Grevas do Arqueiro-Mestre", "Botas do Arqueiro-Mestre"],
  vocations: ["paladin"], extra: { helmet: { distance: 2 }, armor: { distance: 1, hpMax: 40 }, boots: { speed: 6 } }, blurb: "Escamas de dragão sobre couro fino: nada escapa à sua mira." });
buildSet({ prefix: "royal", tier: 6, palette: "gold", slots: ["helmet", "armor", "legs"], shapes: { helmet: "helmet_full", armor: "armor_plate", legs: "legs_greaves" }, armor: [3, 5, 3], values: [22000, 52000, 30000],
  names: ["Elmo Real", "Armadura Real", "Grevas Reais"],
  vocations: ["paladin"], extra: { helmet: { distance: 2 }, armor: { distance: 1, hpMax: 80 }, legs: { distance: 1 } }, blurb: "Ouro e aço para os arqueiros do rei." });
buildSet({ prefix: "dragon_scale", tier: 7, palette: "dragon", slots: ["helmet", "armor", "legs"], shapes: { helmet: "helmet_horned", armor: "armor_plate", legs: "legs_greaves" }, armor: [4, 7, 4], values: [55000, 130000, 75000],
  names: ["Elmo de Escamas de Dragão", "Cota de Escamas de Dragão", "Grevas de Escamas de Dragão"],
  vocations: ["paladin"], extra: { helmet: { distance: 2 }, armor: { distance: 2, hpMax: 140 }, legs: { distance: 1, crit: 1 } }, blurb: "Escamas de dragão vermelho, leves e quase impenetráveis." });

// Magos (sorcerer/druid): 4 peças com manaMax e magic. Armadura total 3 / 4 / 6 / 8.
const MAGE: Vocation[] = ["sorcerer", "druid"];
const mageSet = (prefix: string, tier: number, palette: GearTier, names: string[], armor: number[], values: number[], mana: number[], magic: number[], speed: number): void =>
  buildSet({ prefix, tier, palette, slots: GEAR4, shapes: { helmet: "helmet_wizard", armor: "armor_robe" }, armor, values, vocations: MAGE,
    names, extra: {
      helmet: { manaMax: mana[0]!, ...(magic[0] ? { magic: magic[0] } : {}) }, armor: { manaMax: mana[1]!, ...(magic[1] ? { magic: magic[1] } : {}) },
      legs: { manaMax: mana[2]!, ...(magic[2] ? { magic: magic[2] } : {}) }, boots: { manaMax: mana[3]!, speed },
    }, blurb: "Tecido encantado que amplifica a mana." });
mageSet("apprentice", 2, "leather", ["Chapéu de Aprendiz", "Túnica de Aprendiz", "Calças de Aprendiz", "Sandálias de Aprendiz"], [1, 1, 1, 0], [120, 300, 250, 130], [8, 16, 10, 6], [0, 1, 0, 0], 3);
mageSet("adept", 3, "steel", ["Chapéu de Adepto", "Manto de Adepto", "Calças de Adepto", "Botas de Adepto"], [1, 2, 1, 0], [500, 1400, 1000, 600], [16, 32, 20, 12], [1, 1, 0, 0], 4);
mageSet("arcane", 4, "arcane", ["Chapéu Arcano", "Manto Arcano", "Calças Arcanas", "Botas Arcanas"], [1, 3, 1, 1], [1800, 5200, 3400, 2600], [28, 56, 35, 21], [1, 1, 1, 0], 5);
mageSet("archmage", 5, "gold", ["Chapéu do Arquimago", "Manto do Arquimago", "Calças do Arquimago", "Botas do Arquimago"], [2, 3, 2, 1], [5500, 15000, 9500, 5000], [44, 88, 55, 33], [2, 2, 1, 0], 6);
// Fim de jogo: 3 peças (as botas dos tiers 6 e 7 vieram no ciclo 16, perto das Botas da Pressa).
const mageSet3 = (prefix: string, tier: number, palette: GearTier, names: string[], armor: number[], values: number[], mana: number[], magic: number[], blurb: string): void =>
  buildSet({ prefix, tier, palette, slots: ["helmet", "armor", "legs"], shapes: { helmet: "helmet_wizard", armor: "armor_robe" }, armor, values, vocations: MAGE, names,
    extra: { helmet: { manaMax: mana[0]!, magic: magic[0]! }, armor: { manaMax: mana[1]!, magic: magic[1]! }, legs: { manaMax: mana[2]!, magic: magic[2]! } }, blurb });
mageSet3("mystic", 6, "mithril", ["Turbante Místico", "Manto Azul", "Calças Relampejantes"], [2, 4, 2], [20000, 50000, 28000], [70, 140, 85], [2, 3, 1], "Seda azul tecida com fios de relâmpago.");
mageSet3("ferumbras", 7, "arcane", ["Chapéu de Ferumbras", "Manto Celestial", "Calças Celestiais"], [3, 5, 3], [50000, 120000, 70000], [100, 200, 120], [3, 4, 2], "Dizem que pertenceu ao maior feiticeiro que já existiu.");
// Livros de magia (pedido do dono): o escudo dos magos. A varinha/bastão usa uma mão só e o slot ficava com o Escudo de
// Madeira. Menos armadura que o escudo do cavaleiro do mesmo tier, em troca de mana e, do tier 5 em diante, magia.
// Valor igual ao do escudo do cavaleiro do tier (o modelo de balanço, balanceKit.ts, escolhe por valor).
const spellbook = (id: string, name: string, tier: number, tint: number, armor: number, manaMax: number, magic: number, value: number, description: string): void =>
  add({ id, name, kind: "shield", slot: "shield", icon: img(W + "Book/Sprite.png", tint), vocations: MAGE, level: TIER_LEVEL[tier - 1],
    stats: { armor, manaMax, ...(magic ? { magic } : {}) }, value, description });
spellbook("spellbook_apprentice", "Livro do Aprendiz", 2, 0xd0a060, 1, 15, 0, 200, "Anotações de aula com orelhas nas páginas.");
spellbook("spellbook_adept", "Livro do Adepto", 3, 0x80b8ff, 1, 30, 0, 900, "Capa de couro e feitiços sublinhados a tinta azul.");
spellbook("spellbook_arcane", "Tomo Arcano", 4, 0xb070ff, 2, 50, 0, 3200, "As letras mudam de lugar quando ninguém está olhando.");
spellbook("spellbook_archmage", "Grimório do Arquimago", 5, 0xffd060, 2, 80, 1, 10000, "Cantos de ouro e um fecho que só abre para quem sabe a palavra.");
spellbook("spellbook_mystic", "Tomo das Tempestades", 6, 0x40c8ff, 3, 120, 1, 32000, "As páginas estalam como raio quando o vento muda.");
spellbook("spellbook_ferumbras", "Grimório de Ferumbras", 7, 0xd890ff, 3, 180, 2, 80000, "Escrito à mão pelo próprio Ferumbras. Algumas páginas ainda estão quentes.");

// Botas da Pressa: o item mais cobiçado do fim de jogo (todas as vocações).
add({ id: "boots_haste", name: "Botas da Pressa", kind: "boots", slot: "boots", icon: gear("boots", "gold"), level: 50, stats: { armor: 1, speed: 12 }, value: 60000,
  description: "Quem calça não anda: voa. Caem de behemoths e demônios." });

// Botas dos tiers 6 e 7 (ciclo 16), uma por forma: armadura e o atributo da vocação em troca de velocidade (7–8 contra
// 12 das Botas da Pressa). Valor abaixo dos 60 mil delas de propósito: o modelo de balanço (balanceKit.ts) escolhe por
// valor e o Coliseu segue calibrado com as Botas da Pressa. Ícone: bota de aço com o tint do conjunto (a dourada é a da Pressa).
const BOOTS: Piece["slot"][] = ["boots"];
buildSet({ prefix: "crown", tier: 6, palette: "steel", tint: 0xffd070, slots: BOOTS, shapes: {}, armor: [2], values: [16000], names: ["Botas da Coroa"],
  vocations: ["knight"], extra: { boots: { speed: 7, hpMax: 40 } }, blurb: "Esporas de ouro da guarda real. Fazem barulho, mas aguentam." });
buildSet({ prefix: "demon", tier: 7, palette: "steel", tint: 0xff5a5a, slots: BOOTS, shapes: {}, armor: [2], values: [40000], names: ["Botas Demoníacas"],
  vocations: ["knight"], extra: { boots: { speed: 8, hpMax: 80 } }, blurb: "Deixam pegadas chamuscadas por onde passam." });
buildSet({ prefix: "royal", tier: 6, palette: "steel", tint: 0xffe8a0, slots: BOOTS, shapes: {}, armor: [1], values: [15000], names: ["Botas Reais"],
  vocations: ["paladin"], extra: { boots: { speed: 7, distance: 1 } }, blurb: "Leves e firmes, para atirar sem perder o passo." });
buildSet({ prefix: "dragon_scale", tier: 7, palette: "steel", tint: 0xff9060, slots: BOOTS, shapes: {}, armor: [2], values: [37000], names: ["Botas de Escamas de Dragão"],
  vocations: ["paladin"], extra: { boots: { speed: 8, distance: 1 } }, blurb: "Escamas de dragão vermelho até o tornozelo." });
buildSet({ prefix: "mystic", tier: 6, palette: "steel", tint: 0x60c0ff, slots: BOOTS, shapes: {}, armor: [1], values: [14000], names: ["Botas Místicas"],
  vocations: MAGE, extra: { boots: { manaMax: 50, speed: 7 } }, blurb: "Seda azul tecida com fios de relâmpago." });
buildSet({ prefix: "ferumbras", tier: 7, palette: "steel", tint: 0xd890ff, slots: BOOTS, shapes: {}, armor: [1], values: [34000], names: ["Botas de Ferumbras"],
  vocations: MAGE, extra: { boots: { manaMax: 75, speed: 8 } }, blurb: "Dizem que pertenceram ao maior feiticeiro que já existiu." });

// ---------------------------------------------------------------------------
// Tier 8 "Abissal" (ciclo 16, lv 100): 13 peças, só do Profundo (Tengu e Samurai Rubros, 0,15–0,3%) e de chefes
// (Orshabaal, Ferumbras e Shogun Abissal, 10–12%); nunca em loja nem no Baú de Recompensa (`isExclusiveItem`). Ícones:
// quadros que já existem com `ABYSS_TINT`. Sem botas (Botas da Pressa) e sem grevas de cavaleiro e de mago (as do tier 7
// seguem valendo). Valores 120–300 mil; o escudo e o grimório valem o mesmo (regra dos livros de magia).
// ---------------------------------------------------------------------------
const abyssFrom = ITEM_LIST.length;
weapon("abyss_blade", "Lâmina Abissal", "sword", "knight", img(W + "BigSword/Sprite.png", ABYSS_TINT), 8, 160, 280000, "Forjada no fundo do Profundo. A lâmina bebe a luz em volta.", { stats: { melee: 4, crit: 4 } });
bow("abyss_bow", "Arco Abissal", img(W + "Bow2/Sprite.png", ABYSS_TINT), 8, 125, 280000, "A corda vibra num tom que só os mortos escutam.", { distance: 5, crit: 4 });
weapon("abyss_wand", "Varinha Abissal", "wand", "sorcerer", img(W + "MagicWand/Sprite.png", ABYSS_TINT), 8, 105, 280000, "Apaga a vida do alvo como quem sopra uma vela.", { ...WAND, kind: "death", stats: { magic: 6, manaMax: 200 } });
weapon("abyss_rod", "Bastão Abissal", "rod", "druid", img(W + "Stick/Sprite.png", ABYSS_TINT), 8, 105, 280000, "Raízes negras que crescem para baixo, rumo ao fundo.", { ...WAND, kind: "earth", stats: { magic: 6, manaMax: 200 } });
buildSet({ prefix: "abyss", tier: 8, palette: "steel", tint: ABYSS_TINT, slots: ["helmet", "armor", "shield"], shapes: { helmet: "helmet_horned", armor: "armor_plate", shield: "shield_tower" },
  armor: [5, 10, 6], values: [130000, 300000, 170000], names: ["Elmo Abissal", "Armadura Abissal", "Escudo Abissal"],
  vocations: ["knight"], extra: { helmet: { melee: 3 }, armor: { hpMax: 300 }, shield: { shield: 10 } }, blurb: "Placas negras do fundo do Profundo. Frias mesmo no fogo." });
buildSet({ prefix: "abyss_archer", tier: 8, palette: "steel", tint: ABYSS_TINT, slots: ["helmet", "armor", "legs"], shapes: { helmet: "helmet_full", armor: "armor_plate", legs: "legs_greaves" },
  armor: [5, 9, 5], values: [120000, 280000, 160000], names: ["Elmo do Arqueiro Abissal", "Couraça do Arqueiro Abissal", "Grevas do Arqueiro Abissal"],
  vocations: ["paladin"], extra: { helmet: { distance: 3 }, armor: { distance: 2, hpMax: 220 }, legs: { distance: 2, crit: 2 } }, blurb: "Escamas escuras que abafam o som dos passos." });
buildSet({ prefix: "abyss_mage", tier: 8, palette: "steel", tint: ABYSS_TINT, slots: ["helmet", "armor"], shapes: { helmet: "helmet_wizard", armor: "armor_robe" },
  armor: [4, 6], values: [120000, 280000], names: ["Capuz Abissal", "Manto Abissal"],
  vocations: MAGE, extra: { helmet: { manaMax: 150, magic: 4 }, armor: { manaMax: 300, magic: 5 } }, blurb: "Tecido de sombra: a mana escorre por ele como água." });
spellbook("spellbook_abyss", "Grimório Abissal", 8, ABYSS_TINT, 4, 260, 3, 170000, "As páginas são negras e a tinta brilha. Ninguém sabe quem escreveu.");
/** Ids do tier 8 "Abissal" (lv 100). */
export const ABYSS_ITEM_IDS: readonly string[] = ITEM_LIST.slice(abyssFrom).map((d) => d.id);

// Oficina dos Engenhos (ciclo 10): recompensas das missões Q3/Q5, todas as vocações, nunca em loja. Valor abaixo do
// vizinho mais barato do slot de propósito: o modelo de balanço (server/systems/balanceKit.ts) escolhe o melhor
// equipamento por valor.
add({ id: "botas_biqueira", name: "Botas Reforçadas", kind: "boots", slot: "boots", icon: gear("boots", "iron"), level: 12, stats: { armor: 1, speed: 3 }, value: 90,
  description: "Ponteira de ferro e sola dupla. Chutar baú trancado continua não sendo boa ideia." });
add({ id: "capacete_obra", name: "Elmo de Ferro Pintado", kind: "helmet", slot: "helmet", icon: gear("helmet_cap", "gold"), level: 20, stats: { armor: 2, hpMax: 20 }, value: 480,
  description: "Pintado de amarelo para ninguém confundir a sua cabeça com uma pedra." });
// Malha da Ferrovia (ciclo 11): equipamento da via, todas as vocações, recompensas de missão e loot raro dos monstros da Malha.
// Mesma regra das peças da Oficina: valor abaixo do vizinho mais barato do slot no mesmo level (sniper_armor 4800,
// archmage_helmet 5500, archmage/master_archer_legs 9500, botas de tier 5 5000), para o modelo de balanço não as escolher.
add({ id: "colete_refletivo", name: "Gibão Reforçado", kind: "armor", slot: "armor", icon: gear("armor_vest", "gold"), level: 30, stats: { armor: 2, hpMax: 60, speed: 2 }, value: 3600,
  description: "Couro grosso com rebites nas costas. Leve o bastante para correr de uma ratazana." });
add({ id: "capacete_lanterna", name: "Elmo com Lampião", kind: "helmet", slot: "helmet", icon: gear("helmet_full", "gold"), level: 35, stats: { armor: 2, hpMax: 50 }, value: 4200,
  description: "Um lampião preso no topo do elmo. O óleo acaba sempre no meio do túnel." });
add({ id: "calca_brim_refletiva", name: "Calças de Couro Batido", kind: "legs", slot: "legs", icon: gear("legs_pants", "steel"), level: 40, stats: { armor: 2, hpMax: 50, speed: 2 }, value: 7000,
  description: "Couro batido até ficar duro. Aguenta cascalho, espinho e mordida de ratazana." });
add({ id: "botina_seguranca", name: "Botas do Andarilho", kind: "boots", slot: "boots", icon: gear("boots", "bronze"), level: 45, stats: { armor: 1, hpMax: 40, speed: 6 }, value: 3800,
  description: "Já cruzaram a serra três vezes. Pisam em pedra molhada sem medo." });

// ---------------------------------------------------------------------------
// Anéis e amuletos (level 10+)
// ---------------------------------------------------------------------------
/** `vocations` (ciclo 20): joia de uma vocação só (anéis do Crash Test); sem ele, todas. */
const trinket = (id: string, name: string, slot: "ring" | "amulet", tier: GearTier, level: number, stats: Stats, value: number, description: string, vocations?: Vocation[]): void =>
  add({ id, name, kind: slot, slot, icon: gear(slot, tier), ...(vocations ? { vocations } : {}), level, stats, value, description });
trinket("ring_vigor", "Anel do Vigor", "ring", "bronze", 10, { hpRegen: 1 }, 450, "Acelera a recuperação de vida.");
trinket("ring_mente", "Anel da Mente", "ring", "steel", 15, { manaRegen: 2 }, 800, "Acalma a mente e devolve mana.");
trinket("ring_pressa", "Anel da Pressa", "ring", "gold", 20, { speed: 6 }, 2500, "Seus passos ficam mais rápidos.");
trinket("ring_furia", "Anel da Fúria", "ring", "iron", 25, { crit: 4, melee: 1, distance: 1 }, 5000, "Golpes mais precisos e letais.");
trinket("ring_dragon", "Anel do Dragão", "ring", "dragon", 35, { crit: 5, hpRegen: 2 }, 20000, "Escama de dragão trabalhada em anel.");
trinket("amulet_vida", "Amuleto da Vida", "amulet", "leather", 10, { hpMax: 60 }, 700, "Aumenta a vida máxima.");
trinket("amulet_arcano", "Amuleto Arcano", "amulet", "arcane", 15, { manaMax: 70 }, 900, "Aumenta a mana máxima.");
trinket("amulet_protecao", "Amuleto de Proteção", "amulet", "iron", 20, { armor: 2, hpMax: 40 }, 3000, "Um escudo invisível no peito.");
trinket("amulet_lich", "Amuleto do Lich", "amulet", "arcane", 28, { magic: 2, manaMax: 100 }, 12000, "Arrancado do pescoço do Lich do Pântano.");
trinket("amulet_goblin_king", "Amuleto do Rei Goblin", "amulet", "gold", 38, { armor: 3, hpMax: 150, melee: 2 }, 30000, "Roubado por goblins, usado por um rei.");
trinket("amulet_minotaur", "Amuleto do Labirinto", "amulet", "bronze", 48, { hpMax: 120, melee: 1, distance: 1, magic: 1 }, 36000, "Cai da Raposa Chifruda, a rainha do Labirinto.");
trinket("ring_might", "Anel da Força", "ring", "mithril", 50, { crit: 4, melee: 2, distance: 2, magic: 1 }, 40000, "Cada golpe pesa o dobro.");
trinket("amulet_dragon", "Amuleto de Escamas", "amulet", "dragon", 55, { armor: 4, hpMax: 200 }, 45000, "Escamas de dragão costuradas em couro.");
trinket("ring_demodras", "Anel de Demodras", "ring", "dragon", 70, { crit: 6, hpRegen: 4, manaRegen: 4 }, 120000, "Um anel quente que nunca esfria.");
trinket("amulet_orshabaal", "Amuleto de Orshabaal", "amulet", "arcane", 90, { armor: 6, hpMax: 400, manaMax: 200, magic: 2, melee: 2, distance: 2 }, 300000, "O olhar do demônio ainda vive na pedra.");
trinket("amulet_banuta", "Ídolo de Banuta", "amulet", "gold", 40, { hpMax: 150, manaMax: 80, speed: 3 }, 32000, "O ídolo dourado do templo da selva. Só sai de um baú.");
trinket("frost_ring", "Anel do Gelo Eterno", "ring", "steel", 60, { crit: 4, hpRegen: 3, manaRegen: 3, armor: 1 }, 60000, "Frio como o coração do Yeti.");
// Oficina dos Engenhos (ciclo 10): recompensa da Q4, todas as vocações; valor abaixo do Anel da Mente (ver botas_biqueira).
trinket("anel_trilho_din", "Anel de Ferro Batido", "ring", "iron", 16, { hpRegen: 1, manaRegen: 1 }, 600, "Um pedaço de ferro entortado em anel. Serve em qualquer dedo, menos no certo.");
// Malha da Ferrovia (ciclo 11): recompensa da missão "O Trem Que Nunca Encerra" e loot dos dois chefes da via, todas as vocações; valor
// abaixo do Anel da Força (lv 50, 40000), pelo mesmo motivo das peças da Oficina.
trinket("anel_do_rodeiro", "Anel das Engrenagens", "ring", "steel", 50, { hpRegen: 3, manaRegen: 3, speed: 2 }, 26000, "Engrenagens minúsculas que giram no dedo sem nunca parar. Ninguém sabe dar corda.");

// ---------------------------------------------------------------------------
// Siderúrgica (ciclo 19, lv 10–120): materiais da usina, Rubi, comida do turno, provas dos três chefes e 8 peças que
// fecham buracos de slot (botas 50/70, calças 60, anel 60, amuleto 70, armadura 80, elmos 40/85). Equipamento: valor
// ABAIXO do melhor item do slot no mesmo level para toda vocação que o usa (balanceKit.ts escolhe por valor; o Coliseu
// segue calibrado), todas as vocações.
// ---------------------------------------------------------------------------
mat("lasca_ferrugem", "Lasca de Ferrugem", img("Resource/Rock.png", 0xb8643a), 20, "Descascou do caracol e mancha tudo o que encosta. O ferro-velho aceita.");
mat("pedra_carvao", "Pedra de Carvão", img("Resource/Rock.png", 0x3a3a44), 45, "Os guaxinins juram que acharam no chão. O chão era a pilha.");
mat("fuligem", "Punhado de Fuligem", matIcon("slime_goo", 0x4a4a52), 75, "Preta, fina e teimosa: só sai da roupa na terceira lavada.");
mat("tira_correia", "Tira de Correia", img("Resource/Branch.png", 0x3a3a42), 240, "Borracha grossa de esteira. A serpente usava como casca.");
mat("gota_gusa", "Gota de Gusa", matIcon("ember", 0xff7a30), 300, "Ferro derretido que esfriou por fora. Por dentro, ainda não.");
mat("pena_fuligem", "Pena de Fuligem", img("Resource/feather.png", 0x5a5a64), 380, "Cai preta e deixa rastro. A coruja nem sentiu falta.");
mat("escama_salamandra", "Escama de Salamandra", matIcon("lizard_scale", 0xff8a40), 560, "Morna mesmo depois de uma semana na mochila.");
mat("bloco_escoria", "Bloco de Escória", img("Resource/Rock.png", 0x5a4038), 720, "O resto do ferro, com orgulho de sobra. Vira estrada.");
mat("placa_aco_fundido", "Placa de Aço Fundido", img("Resource/BarSilver.png", 0xffb080), 1300, "Ainda tem o brilho alaranjado de quem saiu do convertedor.");
mat("gem_red", "Rubi", img("Resource/GemRed.png"), 1500, "Gema vermelha lapidada. Os forneiros juram que nasce no calor do Alto-Forno.", 50);
mat("frasco_aco_liquido", "Frasco de Aço Líquido", img("Potion/EmptyPot.png", 0xffd070), 4200, "Brilha como o sol do meio-dia. Não abra dentro de casa.");
// Comida do turno (vendida pelo Almoxarife). Limonada: mana, como o Macarrão (lv 10); Prato Feito: equilibrado, entre o
// Banquete de Sushi (lv 20) e o Presunto de Dragão (lv 30).
food("limonada_turno", "Limonada do Turno", img("Potion/WaterPot.png", 0xf4e04a), 40, 10, 1, 4, 6, "Limão, gelo e açúcar de sobra. Segura o turno inteiro, ou quase.");
food("prato_feito", "Prato Feito", img("Food/Beaf.png", 0xe8c890), 160, 25, 9, 5, 10, "Arroz, feijão, bife e salada. O almoço oficial de quem pega no pesado.");
// Provas dos chefes: troféus (a missão usa passo "boss", o abate conclui para o grupo; não abrem nada).
add({ id: "apito_contramestre", name: "Apito do Contramestre", kind: "quest", value: 0, icon: img("Object/PanFlute.png", 0x707078), description: "Ainda cheira a fuligem e a café requentado. Lembrança de quem mandou o Contramestre Fuligem para casa mais cedo." });
add({ id: "nucleo_convertedor", name: "Núcleo do Convertedor", kind: "quest", value: 0, icon: matIcon("ember", 0xffc060), description: "Um caroço de aço que ainda pulsa. Lembrança de quem desligou o Golem do Convertedor." });
add({ id: "coracao_fornalha", name: "Coração da Fornalha", kind: "quest", value: 0, icon: matIcon("ember", 0xfff0a0), description: "Uma brasa branca do tamanho de um punho. Lembrança de quem apagou A Fornalha Primordial." });
// Equipamento: abaixo do melhor do slot no level para toda vocação (archmage_helmet 5.500, Botas da Pressa 60 mil,
// mystic_legs 28 mil, frost_ring 60 mil, amulet_dragon 45 mil, ferumbras_armor 120 mil, ferumbras_helmet 50 mil; o
// items.test.ts calcula). As que caem de monstro comum (capacete, calças, botas térmicas) entram no Baú de Recompensa;
// as só de missão/chefe, não. Avental e Elmo do Laminador ficam só na Fornalha e em missão: armadura lv 80 de todas as
// vocações vinda de monstro comum subiria o piso do baú (chestGearPool) acima do tier 7 do lv 83 em diante.
add({ id: "capacete_fundidor", name: "Capacete de Fundidor", kind: "helmet", slot: "helmet", icon: { ...gear("helmet_full", "iron"), tint: 0xffb060 }, level: 40, stats: { armor: 2, hpMax: 70 }, value: 5200,
  description: "Aba larga e viseira contra respingo. Gusa no capacete é sinal de experiência." });
add({ id: "botas_fundidor", name: "Botas de Fundidor", kind: "boots", slot: "boots", icon: { ...gear("boots", "steel"), tint: 0xff9a50 }, level: 50, stats: { armor: 2, hpMax: 50, speed: 8 }, value: 22000,
  description: "Biqueira de aço e sola que não derrete. Golem nenhum pisa no seu pé." });
add({ id: "calca_antichama", name: "Calças Antichama", kind: "legs", slot: "legs", icon: { ...gear("legs_pants", "steel"), tint: 0xffc080 }, level: 60, stats: { armor: 4, hpMax: 90 }, value: 26000,
  description: "Tecido grosso que não pega fogo. Pega fuligem, mas fogo, não." });
add({ id: "botas_termicas", name: "Botas Térmicas", kind: "boots", slot: "boots", icon: { ...gear("boots", "steel"), tint: 0xff7050 }, level: 70, stats: { armor: 2, hpMax: 80, manaMax: 40, speed: 9 }, value: 45000,
  description: "Quentes no pé e frias na sola. Ninguém na usina entende como." });
add({ id: "avental_forjador", name: "Avental do Forjador", kind: "armor", slot: "armor", icon: { ...gear("armor_vest", "bronze"), tint: 0xd08050 }, level: 80, stats: { armor: 6, hpMax: 160, manaMax: 80 }, value: 110000,
  description: "Couro curtido na fagulha. Pesa como armadura e protege como armadura." });
add({ id: "elmo_laminador", name: "Elmo do Laminador", kind: "helmet", slot: "helmet", icon: { ...gear("helmet_horned", "steel"), tint: 0xffa070 }, level: 85, stats: { armor: 4, hpMax: 120 }, value: 48000,
  description: "Saiu inteiro do laminador novo. A chapa era fina; o elmo, nem tanto." });
trinket("anel_alto_forno", "Anel do Alto-Forno", "ring", "gold", 60, { crit: 3, hpRegen: 4, manaRegen: 2, speed: 2 }, 48000, "Forjado na boca do Alto-Forno. Segura o calor por você.");
trinket("amuleto_rubi", "Amuleto de Rubi", "amulet", "dragon", 70, { armor: 4, hpMax: 240, manaMax: 60 }, 42000, "Um rubi do fundo da panela de aço, preso numa corrente que nunca esfria.");

// ---------------------------------------------------------------------------
// Montadora (ciclo 20, lv 10–120): materiais da linha (o Cromo Puro entra no refino +4/+5 do tier 8 e no encantamento
// III: shared/data/refine.ts e imbuement.ts), provas dos três chefes, 7 peças e os anéis do Crash Test. Equipamento:
// valor ABAIXO do melhor item do slot no level dela para toda vocação que a usa (ranger_helmet 100, iron_legs 900,
// steel_shield 3.200, archmage_helmet 5.500, mystic_armor 50 mil, ferumbras_legs 70 mil, amulet_orshabaal 300 mil; o
// items.test.ts calcula): o balanceKit.ts escolhe por valor e o Coliseu segue calibrado.
// ---------------------------------------------------------------------------
mat("mt_parafuso", "Parafuso Solto", img("Projectile/Caltrop.png", 0xc8d0d8), 18, "Caiu de algum lugar importante. Ninguém sabe de onde.");
mat("mt_fio_cobre", "Fio de Cobre", img("Resource/BarCopper.png"), 60, "Enrolado do jeito que a serpente deixou. O ferreiro derrete e não pergunta.");
mat("mt_graxa", "Pote de Graxa", img("Potion/EmptyPot.png", 0x3a3a44), 140, "Preta, grossa e escorregadia. Sai da mão em três dias; da roupa, nunca.");
mat("mt_chapa_amassada", "Chapa Amassada", img("Other/Stamp.png", 0xb8c0c8), 260, "Saiu da prensa com a cara do Estampador. Vira carroceria ou escultura.");
// Azul-elétrico: a Limonada do Turno usa o mesmo frasco em amarelo.
mat("mt_faisca", "Faísca Engarrafada", img("Potion/WaterPot.png", 0x8fd8ff), 420, "Pula dentro do frasco o dia inteiro. Não balance.");
mat("mt_eletrodo", "Eletrodo de Solda", img("Weapons/Stick/Sprite.png", 0xff9040), 650, "Gasto pela metade. O robô soldava com ele a porta do vestiário.");
mat("mt_tinta", "Lata de Tinta Limão", img("Potion/MilkPot.png", 0xf2e14a), 900, "Amarelo-limão, claro. Por aqui não existe outra cor.");
mat("mt_motor", "Motor Elétrico", matIcon("ember", 0x70b0ff), 1500, "Ainda zumbe baixinho e gira sozinho quando alguém chega perto.");
mat("mt_airbag", "Airbag Murcho", img("Object/Bag.png", 0xf8f0e0), 2200, "Abriu uma vez e nunca mais fechou direito. Ótimo travesseiro.");
mat("mt_cromo", "Cromo Puro", img("Resource/BarSilver.png", 0xf0f4ff), 3800, "Reflete tanto que dá para pentear o cabelo nele.");
// Provas dos chefes: troféus (a missão usa passo "boss"; não abrem nada).
add({ id: "mt_coroa_espuma", name: "Coroa de Espuma", kind: "quest", value: 0, icon: img("Treasure/SilverCup.png", 0xbfe6ff), description: "Não desmancha nunca. Prova de que o Sapão do Lava-Rápido caiu." });
add({ id: "mt_brasa_estufa", name: "Brasa da Estufa", kind: "quest", value: 0, icon: matIcon("ember", 0xff8a3c), description: "Ainda cheira a tinta fresca. Prova de que o Monstro da Estufa caiu." });
add({ id: "mt_chave_prototipo", name: "Chave do Protótipo", kind: "quest", value: 0, icon: img("Treasure/GoldKey.png", 0xf2e14a), description: "Não liga nenhum carro conhecido. Prova de que O Protótipo caiu." });
// Equipamento de todas as vocações (o escudo, só do cavaleiro: o paladino só tem o Escudo de Madeira, e um escudo geral
// de 2.900 viraria o "melhor" dele no modelo). Recompensa de missão e loot raro de comum: entram no Baú de Recompensa.
add({ id: "mt_bone_visitante", name: "Boné de Visitante", kind: "helmet", slot: "helmet", icon: gear("helmet_cap", "gold"), level: 12, stats: { armor: 1, speed: 2 }, value: 95,
  description: "Amarelo, com a aba torta. Com ele ninguém pergunta quem você é." });
add({ id: "mt_calca_impermeavel", name: "Calça Impermeável", kind: "legs", slot: "legs", icon: gear("legs_pants", "bronze"), level: 20, stats: { armor: 2, hpMax: 25 }, value: 850,
  description: "Espuma não passa, água também não. O suor, infelizmente, também não." });
add({ id: "mt_escudo_porta", name: "Escudo de Porta", kind: "shield", slot: "shield", icon: gear("shield_kite", "steel"), vocations: ["knight"], level: 30, stats: { armor: 2, shield: 3, hpMax: 30 }, value: 2900,
  description: "Já foi a porta de um carro. A maçaneta ainda funciona." });
add({ id: "mt_mascara_solda", name: "Máscara de Soldador", kind: "helmet", slot: "helmet", icon: gear("helmet_full", "iron"), level: 45, stats: { armor: 3, hpMax: 40 }, value: 5200,
  description: "Visor escuro de soldador. Faísca nenhuma passa; o sol do meio-dia, quase." });
add({ id: "mt_avental_pintor", name: "Avental de Pintor", kind: "armor", slot: "armor", icon: gear("armor_robe", "gold"), level: 65, stats: { armor: 4, hpMax: 80, manaMax: 80 }, value: 46000,
  description: "Respingado de limão dos ombros aos joelhos. A tinta seca já virou armadura." });
add({ id: "mt_macacao", name: "Macacão Amarelo-Limão", kind: "legs", slot: "legs", icon: gear("legs_pants", "gold"), level: 85, stats: { armor: 4, hpMax: 100, speed: 2 }, value: 64000,
  description: "O uniforme da linha. Tem bolso para tudo, até para o que você não tem." });
trinket("mt_amuleto_cromado", "Amuleto Cromado", "amulet", "steel", 100, { armor: 3, hpMax: 250, manaMax: 120, speed: 2 }, 180000, "Cromado com o que sobrou dos protótipos. Brilha mais que farol alto.");
// Anéis do Crash Test (um por vocação, só dos baús do Boxe dos Troféus): abaixo do Anel de Demodras (120 mil), o melhor
// anel de toda vocação do lv 70 em diante. Não são `unique` (como o Anel do Gelo Eterno): só a Aniquilação dá únicos.
trinket("mt_anel_para_choque", "Anel do Para-Choque", "ring", "steel", 95, { armor: 2, melee: 3, hpRegen: 4 }, 96000, "Amassado de um lado, inteiro do outro. Aguenta a batida por você.", ["knight"]);
trinket("mt_anel_retrovisor", "Anel do Retrovisor", "ring", "gold", 95, { distance: 3, crit: 5 }, 96000, "Mostra o que vem por trás. O alvo, por isso, nunca escapa.", ["paladin"]);
trinket("mt_anel_ignicao", "Anel da Ignição", "ring", "arcane", 95, { magic: 3, manaRegen: 5 }, 96000, "Gira e acende. A faísca vai direto para a ponta da varinha.", ["sorcerer"]);
trinket("mt_anel_radiador", "Anel do Radiador", "ring", "mithril", 95, { magic: 2, manaRegen: 4, hpRegen: 3 }, 96000, "Sempre fresco, até no meio da Estufa. As plantas agradecem.", ["druid"]);

/** Catálogo (derivado das listas acima). */
export const ITEMS: Record<string, ItemDef> = Object.fromEntries(ITEM_LIST.map((d) => [d.id, d]));

export const itemDef = (id: string): ItemDef | undefined => (Object.hasOwn(ITEMS, id) ? ITEMS[id] : undefined);
export const isEquipable = (d: ItemDef): boolean => d.slot != null;

const ABYSS_SET = new Set(ABYSS_ITEM_IDS);
/** Fora de loja e de sorteio genérico de equipamento (Baú de Recompensa): os itens únicos e o tier 8. */
export const isExclusiveItem = (d: ItemDef): boolean => !!d.unique || ABYSS_SET.has(d.id);

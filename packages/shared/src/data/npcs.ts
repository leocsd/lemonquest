/** NPCs. O `id` bate com a propriedade `npcId` dos objetos "npc" do mapa (assets/maps/world.json). */
export interface NpcShopEntry {
  itemId: string;
  /** Preço de venda ao jogador (ausente = ItemDef.value). */
  price?: number;
  /** Tier 6-7: só 1 destes por personagem por semana ISO (ver systems/npcs.ts). */
  limited?: boolean;
}

export interface NpcDef {
  id: string;
  name: string;              // PT-BR
  /** Sprite de personagem do pack (sheet 64x112 no layout dos jogadores), relativo a assets/. */
  sprite: string;
  greeting: string;          // fala ao abrir
  /** Loja: o que vende; `buys` = tipos de item que compra (ausente = não compra). */
  shop?: { sells: NpcShopEntry[]; buys?: ("weapon" | "shield" | "helmet" | "armor" | "legs" | "boots" | "ring" | "amulet" | "potion" | "material" | "food")[] };
  depot?: boolean;
  /** Falas aleatórias que aparecem sobre a cabeça de vez em quando (ambientação). */
  idleLines?: string[];
  /** Cocheiro: destinos (tile de chegada) e preço em ouro. */
  travel?: TravelDest[];
  /** Vende bênção (reduz a zero a penalidade de XP na próxima morte; preço escala com o level do jogador). */
  blessing?: boolean;
  /** Vende ficha de cassino (CASINO_TICKET_PRICE): prêmio sempre cosmético/material/ouro parcial, nunca poder. */
  casino?: boolean;
  /** Vende encantamento (shared/data/imbuement.ts): 1 efeito ativo por personagem. */
  imbuement?: boolean;
  /** Vende a montaria (MOUNT_PRICE, shared/data/mount.ts): desbloqueio único por conta. */
  mount?: boolean;
}

/** Preço fixo da ficha de cassino, igual pra qualquer level. */
export const CASINO_TICKET_PRICE = 1000;
/** Materiais do prêmio "sorte" (flavor, sem efeito de jogo). */
export const CASINO_MATERIAL_POOL = ["iron_bar", "goblin_tooth", "ectoplasm", "lizard_scale"] as const;

export interface TravelDest { id: string; label: string; x: number; y: number; price: number }

/** Viagem de carroça grátis até este level (inclusive). */
export const TRAVEL_FREE_LEVEL = 8;
export const travelPrice = (d: Pick<TravelDest, "price">, level: number): number => (level <= TRAVEL_FREE_LEVEL ? 0 : d.price);

/** Distância máxima (Chebyshev, em tiles) para interagir com um NPC. */
export const NPC_RANGE = 3;

/** Catálogo. O agente de conteúdo completa (shop, priest, depot, guard_captain, old_hunter, herbalist, bounty_board). */
const C = "ninja/Actor/Character/";
/** Chegada em Porto Esperança (Costa Esmeralda), de carroça. Tile andável conferido em npcs.test.ts. */
const PORT_ARRIVAL: TravelDest = { id: "port", label: "Porto Esperança", x: 372, y: 64, price: 250 };
const sells = (...ids: string[]): NpcShopEntry[] => ids.map((itemId) => ({ itemId }));
/** Tier 6-7: preço = valor de loot × 1,5 (sink pra ouro acumulado), 1 por semana por personagem. */
const limited = (...entries: [string, number][]): NpcShopEntry[] =>
  entries.map(([itemId, lootValue]) => ({ itemId, price: Math.round(lootValue * 1.5), limited: true }));

export const NPCS: Record<string, NpcDef> = {
  shop: {
    id: "shop", name: "Bento, o Mercador", sprite: C + "Noble/SpriteSheet.png",
    greeting: "Bem-vindo! Dê uma olhada nas minhas mercadorias. Compro armas, armaduras e o que você tirar dos monstros.",
    shop: {
      sells: [
        ...sells(
          "health_potion", "health_potion_medium", "mana_potion", "mana_potion_medium", "nuts", "meat", "fish", "onigiri", "beaf", "sushi",
          // tier 1 (lv 1): todas as vocações
          "short_sword", "wooden_club", "short_bow", "apprentice_wand", "twig_rod",
          "leather_helmet", "leather_armor", "leather_legs", "leather_boots", "leather_shield",
          // tier 2 (lv 8)
          "longsword", "hand_axe", "hunting_bow", "oak_wand", "thorn_rod",
          "bronze_helmet", "bronze_armor", "bronze_legs", "bronze_boots", "bronze_shield",
          // tier 3 (lv 15): só armas — depois que o punho deixou de acompanhar o level, a arma do tier importa e a de
          // tier 3 não caía de nenhum monstro para cavaleiro e feiticeiro.
          "iron_sword", "war_hammer", "long_bow", "storm_wand", "frost_rod",
          // tier 4 (lv 25): destino para o ouro que sobra a partir do lv 20 (11–13 mil: ~1–2 h de jogo).
          "steel_blade", "battle_axe", "composite_bow", "ember_wand", "moss_rod",
          "steel_helmet", "steel_armor", "steel_legs", "steel_boots", "steel_shield",
          // tier 5 (lv 35): fim de jogo, preço de tabela (antes só caía de loot/chefe/baú).
          "mithril_katana", "dragon_axe", "elven_bow", "inferno_wand", "glacier_rod",
          "mithril_helmet", "mithril_armor", "mithril_legs", "mithril_boots", "mithril_shield",
        ),
        // tier 6-7: encomenda especial, 1,5× o valor de loot, 1 peça por personagem por semana (continuam caindo de
        // loot/chefe normalmente, isso é só uma saída extra pra ouro acumulado).
        ...limited(
          ["fire_sword", 90000], ["giant_sword", 100000], ["royal_crossbow", 90000], ["starstorm_wand", 90000], ["northwind_rod", 90000],
          ["crown_helmet", 24000], ["crown_armor", 56000], ["crown_legs", 32000], ["crown_shield", 32000],
          ["magic_longsword", 190000], ["demon_axe", 210000], ["celestial_bow", 190000], ["destruction_wand", 190000], ["ancient_root_rod", 190000],
          ["demon_helmet", 60000], ["demon_armor", 140000], ["demon_legs", 80000], ["demon_shield", 80000],
        ),
      ],
      buys: ["weapon", "shield", "helmet", "armor", "legs", "boots", "ring", "amulet", "material"],
    },
    idleLines: [
      "Promoção! Poções de vida pela metade do preço... de ontem.",
      "Esse couro de lobo vale ouro, sabia?",
      "Já viu o preço dessas botas? Roubo é o que não é!",
    ],
  },
  priest: {
    id: "priest", name: "Sacerdotisa Liora", sprite: C + "Monk2/SpriteSheet.png",
    greeting: "A luz te guarde, viajante. Aqui você está a salvo; lá fora, caminhe com cuidado.",
    blessing: true,
    idleLines: [
      "Que a luz guie seus passos.",
      "Quem cai, levanta. Quem desiste, não.",
      "Rezo por todos que partem para a floresta.",
      "A cripta guarda mais do que ossos...",
    ],
  },
  depot: {
    id: "depot", name: "Guarda-Volumes", sprite: C + "OldMan2/SpriteSheet.png", depot: true,
    greeting: "Precisa guardar algo? Seus pertences ficam seguros comigo.",
    idleLines: [
      "Tudo etiquetado, tudo no lugar.",
      "Mochila cheia? Deixe o peso comigo.",
    ],
  },
  guard_captain: {
    id: "guard_captain", name: "Capitão Rodrigo", sprite: C + "Samurai/SpriteSheet.png",
    greeting: "Mantenha a ordem e a espada afiada. A vila conta com gente como você.",
    idleLines: [
      "Os lobos andam ousados nas últimas semanas.",
      "Sem briga na praça, ouviram?",
      "Dizem que um rei goblin se esconde nas ruínas...",
      "Alerta nos portões! Ah, falso alarme. Foi só um gato.",
    ],
  },
  old_hunter: {
    id: "old_hunter", name: "Velho Caçador Tomé", sprite: C + "Hunter/SpriteSheet.png",
    greeting: "Ah, um novato. Quer aprender a mirar de verdade? Tenho arcos e equipamento de patrulheiro. Compro peles e ossos também.",
    shop: {
      sells: [
        ...sells("short_bow", "hunting_bow", "long_bow", "composite_bow", "ranger_helmet", "ranger_armor", "ranger_legs", "ranger_boots",
          "hunter_helmet", "hunter_armor", "hunter_legs", "hunter_boots", "sniper_helmet", "sniper_armor", "sniper_legs", "sniper_boots",
          // tier 5 (lv 35): fim de jogo, preço de tabela.
          "elven_bow", "master_archer_helmet", "master_archer_armor", "master_archer_legs", "master_archer_boots",
          "health_potion", "meat", "fish", "beaf", "yakitori", "fishing_rod"),
        // tier 6-7: encomenda especial (ver Bento), 1 peça por personagem por semana.
        ...limited(["royal_crossbow", 90000], ["royal_helmet", 22000], ["royal_armor", 52000], ["royal_legs", 30000],
          ["celestial_bow", 190000], ["dragon_scale_helmet", 55000], ["dragon_scale_armor", 130000], ["dragon_scale_legs", 75000]),
      ],
      buys: ["material", "food"],
    },
    idleLines: [
      "Paciência, garoto. A caça vem a quem espera.",
      "Já abati um urso com um graveto. Bem... quase.",
      "O vento mudou. Chuva à noite.",
    ],
  },
  herbalist: {
    id: "herbalist", name: "Dona Marta, Ervanária", sprite: C + "Princess/SpriteSheet.png",
    greeting: "Ervas, poções e mantos para quem estuda a magia. Também sei um encantamento ou outro, se trouxer os ingredientes.",
    imbuement: true,
    shop: {
      sells: [
        ...sells(
          "health_potion", "health_potion_medium", "mana_potion", "mana_potion_medium", "honey", "noodle", "calamari",
          "apprentice_wand", "oak_wand", "storm_wand", "twig_rod", "thorn_rod", "frost_rod",
          "apprentice_helmet", "apprentice_armor", "apprentice_legs", "apprentice_boots",
          "adept_helmet", "adept_armor", "adept_legs", "adept_boots",
          "ember_wand", "moss_rod", "arcane_helmet", "arcane_armor", "arcane_legs", "arcane_boots",
          // tier 5 (lv 35): fim de jogo, preço de tabela.
          "inferno_wand", "glacier_rod", "archmage_helmet", "archmage_armor", "archmage_legs", "archmage_boots",
        ),
        // tier 6-7: encomenda especial (ver Bento), 1 peça por personagem por semana.
        ...limited(
          ["starstorm_wand", 90000], ["northwind_rod", 90000], ["mystic_helmet", 20000], ["mystic_armor", 50000], ["mystic_legs", 28000],
          ["destruction_wand", 190000], ["ancient_root_rod", 190000], ["ferumbras_helmet", 50000], ["ferumbras_armor", 120000], ["ferumbras_legs", 70000],
        ),
      ],
      buys: ["material", "potion", "food"],
    },
    idleLines: [
      "Erva-doce para a tosse, erva-azeda para o mau humor.",
      "Gosma de slime? Ótima para unguentos!",
      "Cuidado com as abelhas: o mel compensa, o ferrão não.",
    ],
  },
  bounty_board: {
    id: "bounty_board", name: "Quadro de Recompensas", sprite: C + "Inspector/SpriteSheet.png",
    greeting: "Cartazes novos todos os dias às 6h: três recompensas por cabeças de monstros, pagas em ouro, experiência e um Baú de Recompensa.",
    idleLines: [
      "Procura-se: aventureiros corajosos.",
      "Recompensas novas todo dia às 6h!",
      "Paga-se bem por cabeças de monstros.",
    ],
  },
  arena_master: {
    id: "arena_master", name: "Mestre do Coliseu", sprite: C + "RedGladiator/SpriteSheet.png",
    greeting: "Bem-vindo ao Coliseu! Forme seu grupo, escolha uma arena e enfrente as ondas de monstros. Quanto mais longe for, maior a glória.",
    idleLines: [
      "Sangue, areia e glória! Quem entra no Coliseu?",
      "Grupos formados rendem mais glória. Chame seus amigos!",
      "Cada onda é mais feroz que a anterior.",
    ],
  },
  arena_shop_1: {
    id: "arena_shop_1", name: "Vendedor do Coliseu", sprite: C + "GladiatorBlue/SpriteSheet.png",
    greeting: "Respire fundo, guerreiro! Poções e comida para a próxima onda.",
    shop: {
      sells: sells("health_potion", "health_potion_medium", "health_potion_large", "mana_potion", "mana_potion_medium", "mana_potion_large", "meat", "honey", "onigiri"),
    },
    idleLines: ["Reponha as forças antes da próxima onda!", "Poção na mão, vitória no coração."],
  },
  arena_shop_2: {
    id: "arena_shop_2", name: "Vendedor do Coliseu", sprite: C + "GladiatorBlue/SpriteSheet.png",
    greeting: "Respire fundo, guerreiro! Poções e comida para a próxima onda.",
    shop: {
      sells: sells("health_potion", "health_potion_medium", "health_potion_large", "mana_potion", "mana_potion_medium", "mana_potion_large", "meat", "honey", "onigiri"),
    },
    idleLines: ["Reponha as forças antes da próxima onda!", "Poção na mão, vitória no coração."],
  },
  arena_shop_3: {
    id: "arena_shop_3", name: "Vendedor do Coliseu", sprite: C + "GladiatorBlue/SpriteSheet.png",
    greeting: "Respire fundo, guerreiro! Poções e comida para a próxima onda.",
    shop: {
      sells: sells("health_potion", "health_potion_medium", "health_potion_large", "mana_potion", "mana_potion_medium", "mana_potion_large", "meat", "honey", "onigiri"),
    },
    idleLines: ["Reponha as forças antes da próxima onda!", "Poção na mão, vitória no coração."],
  },
  arena_shop_4: {
    id: "arena_shop_4", name: "Vendedor do Coliseu", sprite: C + "GladiatorBlue/SpriteSheet.png",
    greeting: "Respire fundo, guerreiro! Poções e comida para a próxima onda.",
    shop: {
      sells: sells("health_potion", "health_potion_medium", "health_potion_large", "mana_potion", "mana_potion_medium", "mana_potion_large", "meat", "honey", "onigiri"),
    },
    idleLines: ["Reponha as forças antes da próxima onda!", "Poção na mão, vitória no coração."],
  },
  // ---- Posto da Fronteira (Terras Selvagens, zona protegida no meio da expansão leste)
  frontier_priest: {
    id: "frontier_priest", name: "Irmão Tadeu", sprite: C + "Monk/SpriteSheet.png",
    greeting: "Você chegou às Terras Selvagens. Daqui para frente, só os fortes voltam. Descanse enquanto pode.",
    blessing: true,
    idleLines: [
      "Ao norte, os orcs. Ao sul, os dragões. E lá embaixo... nem quero pensar.",
      "Dizem que Orshabaal acorda quando o Abismo fica em silêncio.",
      "Rezei por um grupo que desceu ao Labirinto. Só um voltou.",
    ],
  },
  frontier_trader: {
    id: "frontier_trader", name: "Hanna, a Mascate", sprite: C + "Woman/SpriteSheet.png",
    greeting: "Poções fortes e comida quente! E compro tudo o que você arrancar dos monstros daqui. Também corro uma rodinha de fichas, se quiser arriscar.",
    casino: true,
    shop: {
      sells: sells(
        "health_potion_medium", "health_potion_large", "mana_potion_medium", "mana_potion_large",
        "meat", "beaf", "yakitori", "calamari", "sushi",
      ),
      buys: ["weapon", "shield", "helmet", "armor", "legs", "boots", "ring", "amulet", "material", "food", "potion"],
    },
    idleLines: [
      "Escama de dragão? Pago bem! Chifre de demônio? Pago melhor!",
      "Poção grande é a melhor amiga de quem caça ciclope.",
      "Trouxe presunto de dragão? Isso aqui é uma iguaria!",
    ],
  },
  frontier_depot: {
    id: "frontier_depot", name: "Guarda-Volumes da Fronteira", sprite: C + "OldMan3/SpriteSheet.png", depot: true,
    greeting: "Mesmo baú da vila, sem a viagem. O que vai guardar?",
    idleLines: [
      "Tudo o que você guarda na vila, eu também alcanço.",
      "Mochila pesada demais para o Labirinto? Deixe comigo.",
    ],
  },
  frontier_scout: {
    id: "frontier_scout", name: "Batedora Iara", sprite: C + "Hunter/SpriteSheet.png",
    greeting: "Fortaleza Orc ao noroeste (lv 40+). Labirinto dos Minotauros a oeste (lv 48+). Monte Ciclope ao nordeste (lv 55+). Forte Negro ao sudoeste (lv 65+). Vale dos Dragões ao sul (lv 70+). O Abismo, a leste... só com grupo (lv 90+).",
    idleLines: [
      "Os ciclopes descem dos picos quando neva forte.",
      "Demodras dorme no fundo do vale. Não acorde ele sozinho.",
      "Os olhos malignos veem tudo. Não fique parado no cemitério.",
    ],
  },
  coach_village: {
    id: "coach_village", name: "Cocheiro Bastião", sprite: C + "Villager2/SpriteSheet.png",
    greeting: "Carroça para o Posto da Fronteira, no leste. A estrada é longa, mas a minha mula conhece o caminho. E se quiser a sua própria montaria, eu vendo.",
    travel: [{ id: "frontier", label: "Posto da Fronteira", x: 214, y: 61, price: 150 }, PORT_ARRIVAL],
    idleLines: ["Carroça para a Fronteira! Saída imediata!", "Essa mula já viu mais dragão que muito aventureiro."],
    mount: true,
  },
  coach_frontier: {
    id: "coach_frontier", name: "Cocheira Zuleica", sprite: C + "ManGreen/SpriteSheet.png",
    greeting: "Cansou das Terras Selvagens? Levo você de volta à Vila de Pedra Clara.",
    travel: [{ id: "village", label: "Vila de Pedra Clara", x: 97, y: 98, price: 150 }, PORT_ARRIVAL],
    idleLines: ["Volta para a Vila! Quem vem?", "Cuidado na estrada: aqui fora tem gente com caveira."],
  },

  // ===== Costa Esmeralda: Porto Esperança (zona protegida na costa leste) e Acampamento Nórdico (Ilha Gelada)
  port_captain: {
    id: "port_captain", name: "Capitã Marina", sprite: C + "FighterWhite/SpriteSheet.png",
    greeting: "Bem-vindo a Porto Esperança, marujo! Meu barco leva você para a Vila ou para a Fronteira. E, se tiver coragem, tenho serviço com os piratas.",
    travel: [
      { id: "village", label: "Vila de Pedra Clara", x: 97, y: 98, price: 200 },
      { id: "frontier", label: "Posto da Fronteira", x: 214, y: 61, price: 150 },
    ],
    idleLines: [
      "Barco para a Vila e para a Fronteira! Embarque já!",
      "Aqueles piratas da caverna da praia ainda vão me pagar.",
      "O Barba-Ruiva afundou três navios meus. Três!",
    ],
  },
  port_trader: {
    id: "port_trader", name: "Joaquim, o Mercador do Porto", sprite: C + "Villager5/SpriteSheet.png",
    greeting: "Poções, comida e tudo o que um caçador precisa. E compro o que você trouxer da selva, do gelo ou do vulcão!",
    shop: {
      sells: sells(
        "health_potion_medium", "health_potion_large", "mana_potion_medium", "mana_potion_large",
        "banana", "fish", "meat", "calamari", "yakitori", "sushi", "fishing_rod",
      ),
      buys: ["weapon", "shield", "helmet", "armor", "legs", "boots", "ring", "amulet", "material", "food", "potion"],
    },
    idleLines: [
      "Pelo de macaco? Pago bem! Couro de crocodilo? Pago melhor!",
      "Dobrões piratas valem pouco, mas valem.",
      "Quem vai para o vulcão leva poção grande. Muita poção grande.",
    ],
  },
  port_depot: {
    id: "port_depot", name: "Guarda-Volumes do Porto", sprite: C + "OldMan/SpriteSheet.png", depot: true,
    greeting: "O mesmo baú da Vila e da Fronteira, aqui na beira do mar. O que vai guardar?",
    idleLines: [
      "Nada molha aqui dentro, prometo.",
      "Deixe o peso comigo antes de entrar na selva.",
    ],
  },
  explorer_jairo: {
    id: "explorer_jairo", name: "Explorador Jairo", sprite: C + "Villager3/SpriteSheet.png",
    greeting: "A Selva de Banuta esconde um templo inteiro! Macacos, aranhas, crocodilos... e um rei. Quer me ajudar a desvendar tudo?",
    idleLines: [
      "Os sibangs atiram cocos. Doem mais do que parece.",
      "O templo fica no coração da selva, entre as ruínas.",
      "Dizem que há um esconderijo de tesouro nas ruínas da selva...",
    ],
  },
  sage_ignis: {
    id: "sage_ignis", name: "Mestre Ignis", sprite: C + "Master/SpriteSheet.png",
    greeting: "Sinto o calor do Vulcão de Goroma daqui. Lá dentro, Ferumbras espera. Poucos voltam da cratera... menos ainda da Cidadela.",
    idleLines: [
      "O magma pulsa como um coração. O coração de Ferumbras.",
      "Na Cidadela, de dois a quatro heróis sobem nas placas e quem está ao lado puxa a alavanca. A Aniquilação.",
      "Cães infernais não dormem. Nunca.",
    ],
  },
  port_priest: {
    id: "port_priest", name: "Irmã Celeste", sprite: C + "Villager6/SpriteSheet.png",
    greeting: "A luz te guarde, viajante. Ao sul da selva há uma caverna onde heróis caídos ainda lutam. Eles precisam descansar.",
    blessing: true,
    idleLines: [
      "Os heróis da caverna eram bons homens, um dia.",
      "Rezo pelos que entram no vulcão.",
      "Aqui no porto você está a salvo.",
    ],
  },
  jarl_haakon: {
    id: "jarl_haakon", name: "Jarl Haakon", sprite: C + "GladiatorBlue/SpriteSheet.png",
    greeting: "Ha! Um sulista na Ilha Gelada! Aqui o frio separa os fortes dos mortos. Prove o seu valor e o povo do norte te recebe.",
    idleLines: [
      "O Yeti levou mais um dos nossos. Mais um!",
      "As bruxas do gelo cantam à noite. Não escute.",
      "Hidromel quente e machado afiado: é só disso que um homem precisa.",
    ],
  },
  camp_trader: {
    id: "camp_trader", name: "Ingrid, a Peleira", sprite: C + "Eskimo/SpriteSheet.png",
    greeting: "Poções e comida quente para o frio. E compro peles, lascas de gelo e escamas de dragão.",
    shop: {
      sells: sells("health_potion_medium", "health_potion_large", "mana_potion_medium", "mana_potion_large", "meat", "fish", "salmon", "yakitori", "sushi"),
      buys: ["weapon", "shield", "helmet", "armor", "legs", "boots", "ring", "amulet", "material", "food", "potion"],
    },
    idleLines: [
      "Pele de inverno vale ouro aqui no norte.",
      "Não pise no gelo fino perto da caverna.",
    ],
  },
};

export const npcDef = (id: string): NpcDef | undefined => (Object.hasOwn(NPCS, id) ? NPCS[id] : undefined);

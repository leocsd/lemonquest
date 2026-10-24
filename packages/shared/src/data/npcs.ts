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
  /** Quadro de obra: mostra a aba "Na obra" e as barras de sprint vindas do ClickUp (server/systems/clickup.ts). */
  workBoard?: boolean;
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
/** Chegada na Vila de Pedra Clara (mesmo tile usado pela Cocheira Zuleica e pela Capitã Marina). */
const VILLAGE_ARRIVAL = { x: 97, y: 98 } as const;
/**
 * Chegada de trem na Estação Central da Malha da Ferrovia (ciclo 11, tools/mapgen/expansion4.mjs).
 * Plataforma 1, a 2+ tiles de NPC e longe do portal oculto (44,371) que liga a Estação à Vila (npcs.test.ts confere
 * que é andável).
 */
const MALHA_ARRIVAL: TravelDest = { id: "malha", label: "Estação Central da Malha", x: 60, y: 374, price: 200 };
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
      "Chegou! Mercadoria nova… quer dizer, encomenda nova.",
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
      "Quem cai, levanta. Quem desiste, abre chamado.",
    ],
  },
  depot: {
    id: "depot", name: "Guarda-Volumes", sprite: C + "OldMan2/SpriteSheet.png", depot: true,
    greeting: "Precisa guardar algo? Seus pertences ficam seguros comigo.",
    idleLines: [
      "Tudo etiquetado, tudo no lugar.",
      "Mochila cheia? Deixe o peso comigo.",
      "Etiqueta vermelha na tampa? Faz aniversário aqui dentro.",
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
      "Antes de culpar a rede, confira o cabo.",
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
      "Essa poção ficou 20 minutos sem leitura. Considero desconectada.",
    ],
  },
  bounty_board: {
    id: "bounty_board", name: "Quadro de Recompensas", sprite: C + "Inspector/SpriteSheet.png",
    greeting: "Cartazes novos todos os dias às 6h: três recompensas por cabeças de monstros, pagas em ouro, experiência e um Baú de Recompensa.",
    idleLines: [
      "Procura-se: aventureiros corajosos.",
      "Recompensas novas todo dia às 6h!",
      "Paga-se bem por cabeças de monstros.",
      "Sprint da semana: três cabeças, um baú.",
    ],
  },
  arena_master: {
    id: "arena_master", name: "Mestre do Coliseu", sprite: C + "RedGladiator/SpriteSheet.png",
    greeting: "Bem-vindo ao Coliseu! Forme seu grupo, escolha uma arena e enfrente as ondas de monstros. Quanto mais longe for, maior a glória.",
    idleLines: [
      "Sangue, areia e glória! Quem entra no Coliseu?",
      "Grupos formados rendem mais glória. Chame seus amigos!",
      "Cada onda é mais feroz que a anterior.",
      "Sextou? Então troca de roupa antes da onda.",
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
      "Compras onfire: ficha em promoção. Mentira, preço fixo.",
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
    greeting: "Carroça para o Posto da Fronteira, no leste. A estrada é longa, mas a minha mula conhece o caminho.",
    travel: [
      { id: "frontier", label: "Posto da Fronteira", x: 214, y: 61, price: 150 },
      PORT_ARRIVAL,
      // Chegada no Pátio de Encomendas da Oficina dos Engenhos (bloco gerado por tools/mapgen/expansion3.mjs, ao sul
      // da Vila). Perto, barato: é a zona de novato lv 5–22. Tile andável conferido em npcs.test.ts.
      { id: "oficina", label: "Oficina dos Engenhos", x: 83, y: 330, price: 100 },
    ],
    idleLines: [
      "Carroça para a Fronteira! Saída imediata!",
      "Essa mula já viu mais dragão que muito aventureiro.",
      "Mula nova. Chegou! Foto depois.",
    ],
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

  // ===== Oficina dos Engenhos (ciclo 10): o escritório entra no mundo por metáfora e piada interna. Apelido + papel,
  // nunca nome completo; clientes só disfarçados; nada do chat privado. Mapa em tools/mapgen/expansion3.mjs.
  pedrao: {
    id: "pedrao", name: "Pedrão, o Visionário", sprite: C + "SamuraiBlue/SpriteSheet.png",
    greeting: "Go ou NoGo? Depende da luz. Nove iluminadores de dez chegam queimados, e o décimo acende por teimosia. Se achar algum, me traga.",
    idleLines: [
      "Nove iluminadores de dez chegam queimados.",
      "Frame inspecionável! Anota aí: um em vinte e seis.",
      "Quem mexeu na exposição?",
    ],
  },
  juliao: {
    id: "juliao", name: "Julião dos Embarcados", sprite: C + "Villager/SpriteSheet.png",
    greeting: "Chegou! …Não, era o vento. Enquanto a encomenda não chega, vendo poção básica e compro o que você arrancar das máquinas.",
    shop: {
      sells: sells("health_potion", "mana_potion", "nuts"),
      buys: ["material"],
    },
    idleLines: [
      "Chegou! Não, era o vento.",
      "Cabo roído não é defeito, é documentação.",
      "Soldar não; crimpar, sim.",
    ],
  },
  bianca: {
    id: "bianca", name: "Bianca da Logística", sprite: C + "Village6/SpriteSheet.png",
    greeting: "A marmita de tampa vermelha faz aniversário amanhã e ninguém assume. Mas antes disso: as bombonas fugiram do pátio de novo.",
    idleLines: [
      "Bombona fugitiva não corre: rola. E rola rápido.",
      "Sem etiqueta, não embarca. Sem rótulo, não existe.",
      "O frete chega quando chega. A encomenda, só quando alguém grita 'Chegou!'.",
    ],
  },
  luan: {
    id: "luan", name: "Luan do Cubo", sprite: C + "NinjaBlue/SpriteSheet.png",
    greeting: "git caiu? Não? Então é problema seu. Brincadeira: senta aí que eu te mostro como resolver o cubo em 40 segundos.",
    idleLines: [
      "git caiu?",
      "Resolvo o cubo em 40 s. O merge, nunca.",
      "Funciona na minha máquina.",
    ],
  },
  iago: {
    id: "iago", name: "Iago do Cofre", sprite: C + "NinjaGray/SpriteSheet.png",
    greeting: "Post-it não é cofre. Se achar algum colado por aí com senha, traga pra mim antes que alguém leia.",
    idleLines: [
      "Post-it não é cofre.",
      "Rotaciona a senha. De novo.",
      "Quem anotou a senha no monitor?",
    ],
  },
  gabriel: {
    id: "gabriel", name: "Gabriel do Sextou", sprite: C + "Boy/SpriteSheet.png",
    greeting: "Compras onfire! Rifa do Sextou: mil de ouro a ficha, prêmio surpresa. Tema do dia: sobreviver.",
    casino: true,
    idleLines: [
      "Compras onfire!",
      "Sextou! Tema do dia: sobreviver.",
      "Ficha é mil. Prêmio é surpresa.",
    ],
  },
  guilherme_boss: {
    id: "guilherme_boss", name: "Guilherme, o Boss", sprite: C + "Sultan/SpriteSheet.png",
    greeting: "Baú e seguro contra perda de XP, com nota fiscal. Sem nota fiscal não tem reembolso.",
    depot: true, blessing: true,
    idleLines: [
      "Sem nota fiscal não tem reembolso.",
      "Fechou o mês? Fechou o caixa.",
      "Bênção é despesa dedutível.",
    ],
  },
  alexandre_quantico: {
    id: "alexandre_quantico", name: "Alexandre do Quântico", sprite: C + "SorcererBlack/SpriteSheet.png",
    greeting: "Eu guardo a porta do Banheiro Quântico. Livre e ocupado ao mesmo tempo, até alguém bater. Meu modelo previu isso.",
    idleLines: [
      "Livre e ocupado até alguém bater.",
      "Meu modelo previu isso. Depois.",
      "Dados não mentem. Interpretações, sim.",
    ],
  },
  coach_oficina: {
    id: "coach_oficina", name: "Cocheiro Dito", sprite: C + "Villager2/SpriteSheet.png",
    greeting: "Carroça de volta pra Vila de Pedra Clara, ou até o Porto pra quem tem pressa e ouro.",
    travel: [{ id: "village", label: "Vila de Pedra Clara", x: VILLAGE_ARRIVAL.x, y: VILLAGE_ARRIVAL.y, price: 100 }, PORT_ARRIVAL],
    idleLines: ["Volta pra Vila! A mula já está encilhada.", "Encomenda eu não levo. Gente, sim."],
  },
  // Placas e máquinas (NPCs sem papel, só ambientação). A Geladeira é a única loja de comida da Oficina.
  geladeira: {
    id: "geladeira", name: "Geladeira da Copa", sprite: C + "RobotGrey/SpriteSheet.png",
    greeting: "Zumbido. A porta abre: marmita, café e vasilhas empilhadas. Marmita sem nome é marmita de todos.",
    shop: {
      sells: sells("marmita_tampa_vermelha", "cafe_oficina", "vasilha_empilhada", "nuts"),
    },
    idleLines: [
      "Marmita sem nome é marmita de todos.",
      "A tampa vermelha faz aniversário amanhã.",
      "Zzzzum.",
    ],
  },
  quadro_gestao: {
    id: "quadro_gestao", name: "Quadro de Gestão à Vista", sprite: C + "Inspector/SpriteSheet.png", workBoard: true,
    greeting: "Post-its coloridos, uma coluna 'Feito' vazia e uma 'Fazendo' que não cabe no quadro.",
    idleLines: [
      "Sprints_P08 | Abr - 14",
      "Backlog - Matriz de Requisitos: 212 itens",
      "Impedimento: nenhum. Suspeito.",
    ],
  },
  banheiro_quantico: {
    id: "banheiro_quantico", name: "Banheiro Quântico", sprite: C + "Statue/SpriteSheet.png",
    greeting: "A porta diz: Livre. E Ocupado.",
    idleLines: ["Livre.", "Ocupado.", "Livre e ocupado."],
  },
  em1000: {
    // id antigo mantido (o objeto do mapa usa npcId "em1000"); nome e falas neutros desde o ciclo 11: o código de
    // produto e a meta de horas eram de um projeto de cliente confidencial.
    id: "em1000", name: "Robô de Bancada", sprite: C + "RobotGreen/SpriteSheet.png",
    greeting: "Bip. Watchdog ativo. Última falha: nenhuma registrada, porque reiniciei antes de registrar.",
    idleLines: [
      "Firmware novo, bug novo.",
      "Self-healing: reiniciei sozinho. De novo.",
      "Watchdog: latindo.",
    ],
  },
  trofeu_demoday: {
    id: "trofeu_demoday", name: "Troféu do Demoday", sprite: C + "GoldStatue/SpriteSheet.png",
    greeting: "Um troféu dourado com a placa: 'Funcionou na demo'.",
    idleLines: ["Demoday: demonstrou, dia.", "Funcionou na demo. Sério."],
  },

  // ===== Malha da Ferrovia (ciclo 11): região isolada, só de trem (tools/mapgen/expansion4.mjs). NPCs por papel real da
  // inspeção ferroviária (sem nome próprio), cliente disfarçado de "a Ferrovia", pátios inventados; ids do contrato com o mapa.
  chefe_estacao_vila: {
    id: "chefe_estacao_vila", name: "Chefe da Estação de Pedra Clara", sprite: C + "Villager4/SpriteSheet.png",
    greeting: "Trem para a Malha da Ferrovia! Pórtico, rodeiro, truque e muita roda para inspecionar. Até o level 8 a passagem é por conta da casa.",
    travel: [MALHA_ARRIVAL],
    idleLines: [
      "Próxima partida: quando o maquinista terminar o café.",
      "Passagem só de ida? Não, aqui toda passagem tem volta. E às vezes duplica.",
      "Embarque pela plataforma 1. A plataforma 2 é imaginária.",
    ],
  },
  chefe_estacao_malha: {
    id: "chefe_estacao_malha", name: "Chefe da Estação Central", sprite: C + "Sultan2/SpriteSheet.png",
    greeting: "Bem-vindo à Estação Central da Malha. Daqui saem o Pátio de Manobra, o Portal de Inspeção e a Oficina de Vagões. O trem de volta para a Vila sai quando você quiser.",
    travel: [{ id: "village", label: "Vila de Pedra Clara", x: VILLAGE_ARRIVAL.x, y: VILLAGE_ARRIVAL.y, price: 200 }],
    idleLines: [
      "Composição de 1.124 eixos! Recorde. Ninguém contou a mão.",
      "Cabeceira A, cabeceira B... e a cabeceira U, de 'ué'.",
      "Vagão é quatro eixos, locomotiva é seis. O resto é VAG-TEMP.",
    ],
  },
  ferramenteiro: {
    id: "ferramenteiro", name: "Ferramenteiro da Malha", sprite: C + "Caveman/SpriteSheet.png",
    greeting: "Chave, graxa e poção. Compro tudo o que você arrancar da via: pino, sapata, rolamento, chaveta, até pedra de brita.",
    shop: {
      sells: sells(
        "health_potion_medium", "health_potion_large", "mana_potion_medium", "mana_potion_large",
        "beaf", "yakitori", "sushi", "cafe_oficina", "marmita_tampa_vermelha",
      ),
      buys: ["weapon", "shield", "helmet", "armor", "legs", "boots", "ring", "amulet", "material", "food", "potion"],
    },
    idleLines: [
      "Chave 32? Emprestei. Para quem? Não lembro.",
      "Chaveta torta não volta. Chaveta torta vira chaveiro.",
      "Graxa não é sujeira. É documentação de manutenção.",
    ],
  },
  depot_malha: {
    id: "depot_malha", name: "Guarda-Volumes da Estação", sprite: C + "EggGirl/SpriteSheet.png", depot: true,
    greeting: "O mesmo baú da Vila, aqui na plataforma. Etiquetado, e com tag RFID lida na primeira, prometo.",
    idleLines: [
      "Volume sem etiqueta vira VAG-TEMP. Etiquete.",
      "Deixe o peso aqui antes de descer para o túnel.",
    ],
  },
  painel_obra: {
    id: "painel_obra", name: "Painel da Obra", sprite: C + "Inspector/SpriteSheet.png", workBoard: true,
    greeting: "Um painel de compensado com a sprint da semana do ClickUp, uma barra por projeto e um aviso escrito à mão: 'NÃO É PARA MEXER NO CLICKUP SÓ PARA SUBIR A BARRA'.",
    idleLines: [
      "Status: Processando Imagens...",
      "Kanban: Não inspecionados / Em andamento / Inspecionados.",
      "Trem preso em EM_ANDAMENTO desde terça.",
    ],
  },
  inspetora_portal: {
    id: "inspetora_portal", name: "Inspetora de Rodas", sprite: C + "Cavegirl/SpriteSheet.png",
    greeting: "Quatro câmeras, quatro iluminadores e uma decisão por roda: com defeito ou sem defeito. Roda sem imagem não deixa o vagão fechar, e o trem nunca encerra.",
    idleLines: [
      "Trinca no Disco, Aro Fraturado, Calo, Escamação. Vermelho, laranja, âmbar, ciano.",
      "Quem trocou o S pelo N na legenda? Reprovei e aprovou!",
      "Imagem chegando três horas antes do trem. Fuso, de novo.",
    ],
  },
  operador_abrigo: {
    id: "operador_abrigo", name: "Técnico do CLP", sprite: C + "NinjaBlue2/SpriteSheet.png",
    greeting: "Mantenho o abrigo: o CLP, o servidor e o switch moram aqui, e eu de vez em quando. Os sensores de roda medem velocidade e sentido; quando contam errado, a passagem duplica.",
    idleLines: [
      "AGUARDANDO_SYS2... AGUARDANDO_SYS2...",
      "Não selecione texto no console. Trava a captura. Sério.",
      "Velocidade NaN. O trem andou ou não andou?",
    ],
  },
  mecanico_vagao: {
    id: "mecanico_vagao", name: "Engenheiro do Dark-field", sprite: C + "MaskRacoon/SpriteSheet.png",
    greeting: "Luz rasante, quase de lado: é assim que a trinca no disco aparece. Aqui na Oficina de Vagões eu estudo cada defeito que o pórtico deixou passar, e alguns deles saíram andando.",
    idleLines: [
      "Trinca no disco não roda: rola ladeira abaixo.",
      "Calo é roda que arrastou. Arrastou porque a sapata travou.",
      "Brita parada e fumaça enganam a câmera. A trinca, não.",
    ],
  },
  maquinista_aposentado: {
    id: "maquinista_aposentado", name: "Maquinista", sprite: C + "OldMan/SpriteSheet.png",
    greeting: "Quarenta anos de cabine. Já vi trem sem tag, vagão sem eixo e locomotiva sem eixo lido deslocando a composição inteira. Essa última ainda passa no túnel, toda quarta, às cinco: o Trem Que Nunca Encerra.",
    idleLines: [
      "No meu tempo, a inspeção era no olho. E no ouvido.",
      "Ouviu o apito? Não? Então ainda não é quarta.",
      "Lastro bom é lastro que não anda. Esse aí anda.",
    ],
  },
};

export const npcDef = (id: string): NpcDef | undefined => (Object.hasOwn(NPCS, id) ? NPCS[id] : undefined);

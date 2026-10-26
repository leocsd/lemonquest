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
/**
 * Chegada de trem na Estação do Minério (Siderúrgica, ciclo 19, tools/mapgen/expansion6.mjs): plataforma 1, a mesma
 * planta da Estação Central. O preço depende de quem vende (Vila 250, Malha 200, Sala de Controle 100).
 */
const MINERIO_ARRIVAL = { id: "minerio", label: "Estação do Minério", x: 24, y: 594 } as const;
/**
 * Chegada na Portaria da Montadora (ciclo 20, tools/mapgen/expansion7.mjs), em frente à cegonha estacionada, dentro da
 * zona protegida. A cegonha da Vila cobra 250; o Cocheiro Dito e o Caminhão de Bobinas, 200; a Supervisora, 100.
 * Nenhuma viagem leva para depois das portas de level da região (pularia o caminho).
 */
const MONTADORA_ARRIVAL: TravelDest = { id: "montadora", label: "Portaria da Montadora", x: 232, y: 758, price: 250 };
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
          ["crown_helmet", 24000], ["crown_armor", 56000], ["crown_legs", 32000], ["crown_shield", 32000], ["crown_boots", 16000],
          ["magic_longsword", 190000], ["demon_axe", 210000], ["celestial_bow", 190000], ["destruction_wand", 190000], ["ancient_root_rod", 190000],
          ["demon_helmet", 60000], ["demon_armor", 140000], ["demon_legs", 80000], ["demon_shield", 80000], ["demon_boots", 40000],
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
        ...limited(["royal_crossbow", 90000], ["royal_helmet", 22000], ["royal_armor", 52000], ["royal_legs", 30000], ["royal_boots", 15000],
          ["celestial_bow", 190000], ["dragon_scale_helmet", 55000], ["dragon_scale_armor", 130000], ["dragon_scale_legs", 75000],
          ["dragon_scale_boots", 37000]),
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
          // Livros de magia (escudo dos magos), tiers 2-5.
          "spellbook_apprentice", "spellbook_adept", "spellbook_arcane", "spellbook_archmage",
        ),
        // tier 6-7: encomenda especial (ver Bento), 1 peça por personagem por semana.
        ...limited(
          ["starstorm_wand", 90000], ["northwind_rod", 90000], ["mystic_helmet", 20000], ["mystic_armor", 50000], ["mystic_legs", 28000],
          ["mystic_boots", 14000], ["spellbook_mystic", 32000],
          ["destruction_wand", 190000], ["ancient_root_rod", 190000], ["ferumbras_helmet", 50000], ["ferumbras_armor", 120000], ["ferumbras_legs", 70000],
          ["ferumbras_boots", 34000], ["spellbook_ferumbras", 80000],
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
  // Ciclo 18: Mural de Excursões (shared/data/excursions.ts, server/systems/excursions.ts), ao lado do Quadro de
  // Recompensas. A aba "Excursões" (postar e "Quero ir") abre pelo id; a mesma lista fica na Agenda.
  excursion_board: {
    id: "excursion_board", name: "Mural de Excursões", sprite: C + "Inspector/SpriteSheet.png",
    greeting: "Papéis presos com tachinha: destino, horário e vagas. Marque uma saída em grupo ou ponha seu nome numa que já está aqui. Quem marca avisa o líder; o líder chama todo mundo para o grupo.",
    idleLines: [
      "Excursão para as Minas às 12h15. Leve poção. E marmita.",
      "Vagas limitadas! Quem chegar depois do horário vai de carona no próximo.",
      "Ponto de encontro: aqui na praça. Atrasado paga o café.",
      "Saída em grupo rende mais XP. Ninguém caça sozinho na sexta.",
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
      "Cordão roído não é defeito, é documentação.",
      "Soldar não; crimpar, sim.",
    ],
  },
  bianca: {
    id: "bianca", name: "Bianca da Logística", sprite: C + "Village6/SpriteSheet.png",
    greeting: "A marmita de tampa vermelha faz aniversário amanhã e ninguém assume. Mas antes disso: as Gosmas Azuis fugiram do pátio de novo, com as etiquetas das bombonas.",
    idleLines: [
      "Gosma azul não corre: quica. E quica rápido.",
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
    greeting: "Papel não é cofre. Se achar algum bilhete amassado por aí com senha, traga pra mim antes que alguém leia.",
    idleLines: [
      "Papel não é cofre.",
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
    greeting: "Carroça de volta pra Vila de Pedra Clara, até o Porto pra quem tem pressa e ouro, ou até a portaria da Montadora.",
    // Ciclo 20: a Montadora fica logo abaixo da Oficina no mapa; o atalho a pé (lv 10) sai do Pátio de Encomendas.
    travel: [
      { id: "village", label: "Vila de Pedra Clara", x: VILLAGE_ARRIVAL.x, y: VILLAGE_ARRIVAL.y, price: 100 }, PORT_ARRIVAL,
      { ...MONTADORA_ARRIVAL, price: 200 },
    ],
    idleLines: [
      "Volta pra Vila! A mula já está encilhada.", "Encomenda eu não levo. Gente, sim.",
      "Montadora? Levo até a portaria. Lá dentro é com as suas pernas.",
    ],
  },
  // Placas e máquinas (NPCs sem papel, só ambientação). A Geladeira é a única loja de comida da Oficina.
  geladeira: {
    id: "geladeira", name: "Geladeira da Copa", sprite: C + "RobotGrey/SpriteSheet.png",
    greeting: "Zumbido. A porta abre: ensopado do viajante, chá de ervas e tigelas vazias. Marmita sem nome é marmita de todos.",
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
    greeting: "Trem para a Malha da Ferrovia e para a Estação do Minério, na Siderúrgica! Na Malha, pórtico, rodeiro, truque e muita roda para inspecionar; na usina, o Alto-Forno acordou. Até o level 8 a passagem é por conta da casa.",
    // Ciclo 19: a Estação do Minério (Siderúrgica) é o destino mais longe, por isso mais cara que a Malha.
    travel: [MALHA_ARRIVAL, { ...MINERIO_ARRIVAL, price: 250 }],
    idleLines: [
      "Próxima partida: quando o maquinista terminar o café.",
      "Passagem só de ida? Não, aqui toda passagem tem volta. E às vezes duplica.",
      "Embarque pela plataforma 1. A plataforma 2 é imaginária.",
      "Trem do minério saindo! Leve capacete: dizem que lá o forno ronca.",
    ],
  },
  chefe_estacao_malha: {
    id: "chefe_estacao_malha", name: "Chefe da Estação Central", sprite: C + "Sultan2/SpriteSheet.png",
    greeting: "Bem-vindo à Estação Central da Malha. Trem para a Vila de Pedra Clara e para a Estação do Minério, na Siderúrgica, aqui, quando você quiser. Daqui saem o Pátio de Manobra, o Portal de Inspeção e a Oficina de Vagões; o trem também para com o Maquinista, na entrada do Túnel, e com o Agente da Parada, perto do Portal e da Oficina.",
    travel: [
      { id: "village", label: "Vila de Pedra Clara", x: VILLAGE_ARRIVAL.x, y: VILLAGE_ARRIVAL.y, price: 200 },
      // Ciclo 19: a linha do minério sai daqui também (mesmo preço da Vila).
      { ...MINERIO_ARRIVAL, price: 200 },
    ],
    idleLines: [
      "Trem para a Vila aqui! Embarque pela plataforma 1.",
      "Composição de 1.124 eixos! Recorde. Ninguém contou a mão.",
      "Longe da plataforma? O Maquinista, no Túnel, e o Agente da Parada, perto do Portal e da Oficina, também vendem passagem.",
      "Cabeceira A, cabeceira B... e a cabeceira U, de 'ué'.",
      "Vagão é quatro eixos, locomotiva é seis. O resto é VAG-TEMP.",
    ],
  },
  ferramenteiro: {
    id: "ferramenteiro", name: "Ferramenteiro da Malha", sprite: C + "Caveman/SpriteSheet.png",
    greeting: "Chave, graxa e poção. Compro tudo o que você arrancar dos bichos da via: pino, placa, engrenagem, cunha, até cascalho.",
    shop: {
      sells: sells(
        "health_potion_medium", "health_potion_large", "mana_potion_medium", "mana_potion_large",
        "beaf", "yakitori", "sushi", "cafe_oficina", "marmita_tampa_vermelha",
      ),
      buys: ["weapon", "shield", "helmet", "armor", "legs", "boots", "ring", "amulet", "material", "food", "potion"],
    },
    idleLines: [
      "Chave 32? Emprestei. Para quem? Não lembro.",
      "Cunha torta não volta. Cunha torta vira chaveiro.",
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
      "Trinca no disco, aro fraturado, calo, escamação. Vermelho, laranja, âmbar, ciano. Na tela, só cores.",
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
    greeting: "Luz rasante, quase de lado: é assim que a trinca no disco aparece. Aqui na Oficina de Vagões eu estudo cada defeito que o pórtico deixou passar, e as rodas reprovadas atraíram bicho de todo tipo.",
    idleLines: [
      "Olho Sangrento no galpão? Sinal de roda reprovada por perto.",
      "Calo é roda que arrastou. Arrastou porque a sapata travou.",
      "Brita parada e fumaça enganam a câmera. A trinca, não.",
    ],
  },
  maquinista_aposentado: {
    id: "maquinista_aposentado", name: "Maquinista", sprite: C + "OldMan/SpriteSheet.png",
    greeting: "Quarenta anos de cabine. Já vi trem sem tag, vagão sem eixo e locomotiva sem eixo lido deslocando a composição inteira. Essa última ainda passa no túnel, toda quarta, às cinco, e o Tirano da Serra desce junto. Se cansou da via, o trem para aqui: Vila ou Estação Central.",
    travel: [{ id: "village", label: "Vila de Pedra Clara", x: VILLAGE_ARRIVAL.x, y: VILLAGE_ARRIVAL.y, price: 200 }, MALHA_ARRIVAL],
    idleLines: [
      "No meu tempo, a inspeção era no olho. E no ouvido.",
      "Ouviu o rugido? Não? Então ainda não é quarta.",
      "Lastro bom é lastro que não anda. Esse aí anda.",
      "O trem para aqui. Vila ou Estação Central, é só pedir.",
    ],
  },
  // Parada do lado leste (pedido do dono, 2026-10-24): sem ela, a única volta era a pé até a Estação Central.
  agente_parada: {
    id: "agente_parada", name: "Agente da Parada", sprite: C + "NinjaYellow/SpriteSheet.png",
    greeting: "Parada do Portal e da Oficina! Daqui sai o trem de volta: Vila de Pedra Clara ou Estação Central. Até o level 8, por conta da casa.",
    travel: [{ id: "village", label: "Vila de Pedra Clara", x: VILLAGE_ARRIVAL.x, y: VILLAGE_ARRIVAL.y, price: 200 }, MALHA_ARRIVAL],
    idleLines: [
      "Trem de volta sai daqui! Vila ou Estação Central.",
      "Parada não tem plataforma, mas tem horário. Mais ou menos.",
      "Saiu da Oficina com a mochila cheia? Embarque aqui, não precisa andar até a Estação.",
    ],
  },
  // Ciclo 16: ferreiro ao lado do Bento (objeto no fim do mapa, lateObjects14). O refino (16-5) pendura a aba neste id.
  blacksmith: {
    id: "blacksmith", name: "Mestre Brás, o Ferreiro", sprite: C + "KnightGold/SpriteSheet.png",
    greeting: "Bigorna quente, conversa curta. Desceu aos covis das caves fundas? Os baús lá de baixo só abrem para quem ajudou a derrubar o dono do covil, e o dono nunca facilita.",
    idleLines: [
      "Ferro bom se conhece pelo barulho. Esse aí está desafinado.",
      "O Bento vende, eu conserto. Ele fica com o lucro, eu fico com o calo.",
      "Garra de toupeira gigante? Já usei de martelo. Não recomendo.",
      "Quem bate no Shogun volta com a espada torta. Quando volta.",
    ],
  },

  // ===== Siderúrgica (ciclo 19): fantasia industrial, NPCs só por papel (tools/mapgen/expansion6.mjs). Trem pela
  // Estação do Minério e pela Sala de Controle (posto avançado); placas com o sprite dos quadros.
  chefe_estacao_minerio: {
    id: "chefe_estacao_minerio", name: "Chefe da Estação do Minério", sprite: C + "NinjaWater/SpriteSheet.png",
    greeting: "Estação do Minério, ponto final! Trem para a Vila de Pedra Clara ou para a Estação Central da Malha, e até o level 8 a passagem é por conta da casa. Para a usina, é pelo portão sul, a partir do level 10.",
    travel: [{ id: "village", label: "Vila de Pedra Clara", x: VILLAGE_ARRIVAL.x, y: VILLAGE_ARRIVAL.y, price: 250 }, MALHA_ARRIVAL],
    idleLines: [
      "Placa da estação: 'Estamos há 0 dias sem acidente. Recorde: 3.'",
      "O trem do minério chega carregado e volta vazio. O passageiro, ao contrário.",
      "Crachá na mão, por favor. Brincadeira: aqui ninguém tem crachá.",
    ],
  },
  almoxarife: {
    id: "almoxarife", name: "Almoxarife do Minério", sprite: C + "EggBoy/SpriteSheet.png",
    greeting: "Almoxarifado aberto! Poção, limonada e prato feito. Compro tudo o que você arrancar dos bichos da usina: lasca, carvão, fuligem, escória, até gota de gusa (de luva, por favor).",
    shop: {
      sells: sells(
        "health_potion_medium", "health_potion_large", "mana_potion_medium", "mana_potion_large",
        "limonada_turno", "prato_feito", "beaf", "yakitori",
      ),
      buys: ["weapon", "shield", "helmet", "armor", "legs", "boots", "ring", "amulet", "material", "food", "potion"],
    },
    idleLines: [
      "Requisição em três vias. A terceira é para o arquivo morto.",
      "Prato feito saindo! Ovo só às sextas.",
      "Lasca de ferrugem? Compro. Não pergunte para quê.",
    ],
  },
  depot_minerio: {
    id: "depot_minerio", name: "Guarda-Volumes do Minério", sprite: C + "LionYellow/SpriteSheet.png", depot: true,
    greeting: "O mesmo baú da Vila, aqui na plataforma. Deixe o peso antes de descer para o calor.",
    idleLines: [
      "Volume sem etiqueta vai para o alto-forno. Mentira. Ou não.",
      "Tudo guardado, tudo seco, tudo frio. O resto da usina não pode dizer o mesmo.",
    ],
  },
  capela_epi: {
    id: "capela_epi", name: "Capelã do EPI Espiritual", sprite: C + "NinjaMageOrange/SpriteSheet.png", blessing: true,
    greeting: "Capacete, luva, bota e bênção: o EPI completo. A bênção protege do que o capacete não protege.",
    idleLines: [
      "EPI espiritual: não substitui o capacete, mas ajuda.",
      "Quem entra no Alto-Forno sem bênção sai mais leve. De XP.",
      "Rezo por todos que descem ao Coração do Forno. Volte, viu?",
    ],
  },
  mestre_turno: {
    id: "mestre_turno", name: "Mestre de Turno", sprite: C + "CamouflageGreen/SpriteSheet.png",
    greeting: "Turno novo, gente nova! O Pátio de Minério fica depois do portão sul, a partir do level 10. Bata o ponto com o Almoxarife antes de sair, que a usina acordou com fome.",
    idleLines: [
      "Sirene das seis! Quem chegou, chegou.",
      "Hora extra só com autorização. Do Contramestre, não: dele eu quero distância.",
      "O Alto-Forno acordou de mau humor. Acontece.",
    ],
  },
  operadora_correia: {
    id: "operadora_correia", name: "Operadora da Correia", sprite: C + "NinjaThunder/SpriteSheet.png",
    greeting: "Esta correia nunca para. Nunca. Nem quando as serpentes resolveram morar nela.",
    idleLines: [
      "Correia parada é prejuízo; correia andando sozinha é pior.",
      "Pise na esteira e corra junto: é mais rápido que andar.",
      "Viu uma tira de borracha solta? É serpente. Ou era.",
    ],
  },
  encarregada_coqueria: {
    id: "encarregada_coqueria", name: "Encarregada da Coqueria", sprite: C + "Cavegirl2/SpriteSheet.png",
    greeting: "Bem-vindo à Coqueria: aqui o carvão vira coque e o coque vira problema. As gosmas de gusa escaparam do cadinho e as corujas fizeram ninho na fumaça.",
    idleLines: [
      "Bateria de fornos: sessenta portas, sessenta brasas, nenhum descanso.",
      "Fumaça preta é coruja. Fumaça branca é vapor. Fumaça laranja é para correr.",
      "O Contramestre Fuligem anda pelo pátio leste. Grita mais do que trabalha.",
    ],
  },
  forneiro_chefe: {
    id: "forneiro_chefe", name: "Forneiro-Chefe", sprite: C + "Flam/SpriteSheet.png",
    greeting: "O Alto-Forno acordou. Ronca, cospe gusa e não deixa ninguém dormir. Toda segunda, às cinco, tem sangria, e o Golem do Convertedor sobe junto na Aciaria.",
    idleLines: [
      "Sangria toda segunda, às cinco. Traga a turma e a marmita.",
      "Gusa no canal, escória na panela, salamandra no meio do caminho.",
      "Choque térmico: gelo contra bicho de fogo. Lição número um.",
    ],
  },
  mestre_aciaria: {
    id: "mestre_aciaria", name: "Mestre da Aciaria", sprite: C + "NinjaRed/SpriteSheet.png",
    greeting: "Aciaria: onde a gusa vira aço e o aço vira cavaleiro. Não pergunte como. O convertedor criou vontade própria, e o Golem que mora nele não gosta de visita.",
    idleLines: [
      "Sopro de oxigênio: de longe, por favor.",
      "Panela cheia é panela perigosa. Panela vazia também.",
      "Ponte rolante passando! Ninguém embaixo da carga.",
    ],
  },
  operador_laminador: {
    id: "operador_laminador", name: "Operador do Laminador", sprite: C + "MaskGoldRacoon/SpriteSheet.png",
    greeting: "Chapa grossa entra, chapa fina sai. No meio do caminho tem um Rex de Ferro deitado na mesa de rolos.",
    idleLines: [
      "Bobina pronta é bobina embalada. Bobina solta é bobina rolando atrás de você.",
      "Velocidade de laminação: rápida. Paciência do operador: lenta.",
      "Chapa fina, conversa curta.",
    ],
  },
  // Posto avançado: só viagem para FORA da Sala (dentro dela, a viagem pularia as portas de level do caminho).
  supervisora_controle: {
    id: "supervisora_controle", name: "Supervisora da Sala de Controle", sprite: C + "NinjaGreen/SpriteSheet.png", depot: true,
    greeting: "Sala de Controle, posto avançado. Daqui sai trem para a Vila, para a Estação do Minério e para a Malha, e o baú é o mesmo de sempre. Lá embaixo, depois da escotilha, fica o Coração do Forno. Não recomendo.",
    travel: [
      { id: "village", label: "Vila de Pedra Clara", x: VILLAGE_ARRIVAL.x, y: VILLAGE_ARRIVAL.y, price: 250 },
      { ...MINERIO_ARRIVAL, price: 100 },
      MALHA_ARRIVAL,
    ],
    idleLines: [
      "Painel verde: tudo bem. Painel vermelho: corre.",
      "Café da garrafa térmica, frio desde o turno passado. Ou do retrasado.",
      "Escotilha fechada, forno acordado. Escotilha aberta, forno mais acordado ainda.",
    ],
  },
  espirito_fundidor: {
    id: "espirito_fundidor", name: "Espírito do Primeiro Fundidor", sprite: C + "Spirit/SpriteSheet.png",
    greeting: "Eu acendi a primeira corrida desta usina, muito antes de você nascer. A Fornalha Primordial era só uma faísca. Agora acordou, e lá embaixo ela não está sozinha.",
    idleLines: [
      "A primeira gusa a gente nunca esquece.",
      "O Coração do Forno não esfria. Nem deveria.",
      "Desça em grupo. Grupo grande. Cinco, no mínimo.",
    ],
  },
  placa_correias: {
    id: "placa_correias", name: "Placa: Correias e Coqueria", sprite: C + "Inspector/SpriteSheet.png",
    greeting: "CORREIAS E COQUERIA — lv 25+. Não pise na esteira parada: ela pode voltar a andar.",
    idleLines: ["Correias e Coqueria — lv 25+.", "Esteira em movimento. Serpentes também."],
  },
  placa_area_quente: {
    id: "placa_area_quente", name: "Placa: Área Quente", sprite: C + "Inspector/SpriteSheet.png",
    greeting: "ÁREA QUENTE — ALTO-FORNO — lv 40+. Gelo contra bicho de fogo: choque térmico.",
    idleLines: ["ÁREA QUENTE — lv 40+.", "Gusa no canal. Não é sopa."],
  },
  placa_epi: {
    id: "placa_epi", name: "Placa: Uso Obrigatório de EPI", sprite: C + "Inspector/SpriteSheet.png",
    greeting: "USO OBRIGATÓRIO DE EPI — ACIARIA — lv 60+. Capacete, luva, bota e coragem.",
    idleLines: ["Aciaria — lv 60+.", "Proibido ficar embaixo da carga suspensa."],
  },
  placa_carga_suspensa: {
    id: "placa_carga_suspensa", name: "Placa: Carga Suspensa", sprite: C + "Inspector/SpriteSheet.png",
    greeting: "CUIDADO: CARGA SUSPENSA — LINGOTAMENTO E LAMINAÇÃO — lv 80+. A Sala de Controle fica no canto noroeste.",
    idleLines: ["Lingotamento e Laminação — lv 80+.", "Ponte rolante passando!"],
  },
  placa_forno_acordado: {
    id: "placa_forno_acordado", name: "Placa: O Forno Está Acordado", sprite: C + "Inspector/SpriteSheet.png",
    greeting: "NÃO ENTRE: O FORNO ESTÁ ACORDADO — CORAÇÃO DO FORNO — lv 100+. Desça em grupo de cinco ou mais.",
    idleLines: ["Coração do Forno — lv 100+.", "Escotilha quente. Não sente."],
  },
  // ===== Montadora (ciclo 20): as máquinas da linha criaram vontade própria e tudo sai amarelo-limão. Só fantasia, NPCs
  // só por papel (tools/mapgen/expansion7.mjs, docs/regioes/montadora.md §7). Chegada pela cegonha da Vila, pelo Cocheiro
  // Dito, pelo Caminhão de Bobinas e pelo atalho da Oficina; placas com o sprite dos quadros.
  mt_cegonha_vila: {
    id: "mt_cegonha_vila", name: "Motorista da Cegonha", sprite: C + "Villager5/SpriteSheet.png",
    greeting: "Cegonha para a Montadora! Vou buscar carro novo e levo gente na cabine. Até o level 8 é por conta da casa.",
    travel: [MONTADORA_ARRIVAL],
    idleLines: [
      "Carro sai amarelo. Todo. Até o que era para ser azul.",
      "Cabine tem lugar para três. O quarto vai em cima, no carro.",
    ],
  },
  mt_motorista: {
    id: "mt_motorista", name: "Motorista da Cegonha", sprite: C + "Villager5/SpriteSheet.png",
    greeting: "Voltando? A cegonha sai cheia de carro limão e um passageiro. Deixo você na Vila de Pedra Clara ou, no caminho, na Oficina dos Engenhos.",
    travel: [
      { id: "village", label: "Vila de Pedra Clara", x: VILLAGE_ARRIVAL.x, y: VILLAGE_ARRIVAL.y, price: 250 },
      { id: "oficina", label: "Oficina dos Engenhos", x: 83, y: 330, price: 150 },
    ],
    idleLines: [
      "Ré com cegonha é arte.",
      "Não encoste nos carros: a tinta ainda está fresca.",
    ],
  },
  mt_bobinas: {
    id: "mt_bobinas", name: "Motorista do Caminhão de Bobinas", sprite: C + "LionOrange/SpriteSheet.png",
    greeting: "Bobina de aço vem da Siderúrgica, eu volto vazio. Quer carona até a Estação do Minério?",
    travel: [{ ...MINERIO_ARRIVAL, price: 200 }],
    idleLines: [
      "Bobina rola. Por isso eu amarro três vezes.",
      "Da Siderúrgica para cá é chapa; daqui para lá é saudade.",
    ],
  },
  // A outra ponta, no tile reservado da Estação do Minério (Siderúrgica): só o objeto NPC, nenhum tile de lá muda.
  mt_bobinas_sid: {
    id: "mt_bobinas_sid", name: "Motorista do Caminhão de Bobinas", sprite: C + "LionOrange/SpriteSheet.png",
    greeting: "Levo bobina de aço para a Montadora, lá embaixo, onde tudo sai amarelo. Cabe mais um na boleia, entre uma bobina e outra.",
    travel: [{ ...MONTADORA_ARRIVAL, price: 200 }],
    idleLines: [
      "Bobina rola. Por isso eu amarro três vezes.",
      "Da Siderúrgica para lá é chapa; de lá para cá é saudade.",
    ],
  },
  mt_porteiro: {
    id: "mt_porteiro", name: "Porteiro da Montadora", sprite: C + "Villager3/SpriteSheet.png",
    greeting: "Crachá, por favor. Não tem? Então vamos fazer um. Depois da cancela fica o Pátio de Carros; os galpões abrem as portas conforme o level de quem chega.",
    idleLines: [
      "Visitante usa crachá amarelo. Funcionário também. Tudo aqui é amarelo.",
      "A cancela abre sozinha. Ela decidiu isso semana passada.",
      "Saída de carro à esquerda, entrada de gente à direita. Calota, onde quiser.",
    ],
  },
  mt_cantineira: {
    id: "mt_cantineira", name: "Cantineira", sprite: C + "Woman/SpriteSheet.png",
    greeting: "Prato do dia, poção e café. Compro o que você arrancar das máquinas: parafuso, graxa, faísca, até airbag murcho.",
    shop: {
      sells: sells(
        "health_potion_medium", "health_potion_large", "mana_potion_medium", "mana_potion_large",
        "beaf", "yakitori", "sushi", "cafe_oficina", "marmita_tampa_vermelha", "limonada_turno", "prato_feito",
      ),
      buys: ["weapon", "shield", "helmet", "armor", "legs", "boots", "ring", "amulet", "material", "food", "potion"],
    },
    idleLines: [
      "Hoje tem prato feito. Amanhã também. Sempre tem.",
      "Lata de tinta não é tempero. Já avisei o Pintor.",
      "Limonada do turno: a única coisa amarela aqui que não morde.",
    ],
  },
  mt_depot: {
    id: "mt_depot", name: "Guarda-Volumes da Portaria", sprite: C + "OldMan2/SpriteSheet.png", depot: true,
    greeting: "O mesmo baú da Vila, aqui na portaria. Etiquete antes de entrar na fábrica.",
    idleLines: [
      "Peça sem etiqueta vira peça de reposição.",
      "Deixe o peso aqui antes da Estamparia.",
    ],
  },
  mt_enfermeira: {
    id: "mt_enfermeira", name: "Enfermeira do Ambulatório", sprite: C + "Lion/SpriteSheet.png", blessing: true,
    greeting: "Curativo, termômetro e uma bênção para o próximo tombo. A linha não perdoa.",
    idleLines: [
      "Faísca no olho? Óculos, querido. Óculos.",
      "Quem volta do Crash Test volta mancando.",
      "Calota no tornozelo é o caso mais comum. Depois vem prensa no dedo.",
    ],
  },
  mt_lavador: {
    id: "mt_lavador", name: "Lavador-Chefe", sprite: C + "NinjaLeaf/SpriteSheet.png",
    greeting: "O Lava-Rápido está sem controle: espuma com vida, calota fugindo e um sapo enorme no fundo. Fica no fim do Pátio, de frente aberta. Ajuda aí?",
    idleLines: [
      "Lavagem completa ou nada.",
      "Se a espuma piscar para você, corra.",
      "Cera é opcional. O Sapão discorda.",
    ],
  },
  mt_prensista: {
    id: "mt_prensista", name: "Operadora da Prensa", sprite: C + "Pig/SpriteSheet.png",
    greeting: "A prensa vermelha decidiu carimbar o que quiser. Inclusive a gente.",
    idleLines: [
      "Mão longe da prensa. A prensa não pensa.",
      "Chapa torta não vira carro. Vira escultura.",
    ],
  },
  mt_soldadora: {
    id: "mt_soldadora", name: "Mestra Soldadora", sprite: C + "CaveLion/SpriteSheet.png",
    greeting: "Os robôs aprenderam a soldar sozinhos. O problema é o que eles soldam.",
    idleLines: [
      "Ponto de solda bonito é ponto de solda frio.",
      "As lagartixas comem arame. Pelo menos não comem eletrodo. Ainda.",
    ],
  },
  mt_pintor: {
    id: "mt_pintor", name: "Pintor-Chefe", sprite: C + "LionBoy/SpriteSheet.png",
    greeting: "Toda tinta aqui virou amarelo-limão, e a que sobrou criou asas.",
    idleLines: [
      "Primeira demão: primer. Segunda: limão. Terceira: limão de novo.",
      "A estufa ronca de noite. Ronca.",
    ],
  },
  // Posto avançado da Montagem Final: só viagem para FORA (dentro da região, a viagem pularia as portas de level).
  mt_supervisora: {
    id: "mt_supervisora", name: "Supervisora de Linha", sprite: C + "Villager6/SpriteSheet.png", depot: true,
    greeting: "A linha não pode parar. Se você parou aqui, é porque a linha parou. Ajude. O baú é o mesmo de sempre, e daqui a cegonha leva você à Vila ou à Portaria.",
    travel: [
      { id: "village", label: "Vila de Pedra Clara", x: VILLAGE_ARRIVAL.x, y: VILLAGE_ARRIVAL.y, price: 250 },
      { ...MONTADORA_ARRIVAL, price: 100 },
    ],
    idleLines: [
      "Meta do turno: um carro por minuto. Realizado: um robô por minuto.",
      "Café na máquina, baú no armário, cegonha lá fora.",
    ],
  },
  mt_piloto: {
    id: "mt_piloto", name: "Piloto de Testes Veterano", sprite: C + "GreenPig/SpriteSheet.png",
    greeting: "Trinta anos de pista. Nunca vi carro andar sem motorista. Até esta semana.",
    idleLines: [
      "Volta rápida? Não. Volta inteira.",
      "Toda quarta, depois do almoço, o Protótipo ronca no subsolo. É o Teste de Pista.",
    ],
  },
  mt_placa_patio: {
    id: "mt_placa_patio", name: "Placa do Pátio", sprite: C + "Inspector/SpriteSheet.png",
    greeting: "PÁTIO DE CARROS — lv 10+. Calotas soltas. Não persiga calota na faixa de pedestre.",
    idleLines: ["Lv 10+.", "Velocidade máxima: 10. De level."],
  },
  mt_placa_estamparia: {
    id: "mt_placa_estamparia", name: "Placa da Estamparia", sprite: C + "Inspector/SpriteSheet.png",
    greeting: "ESTAMPARIA — lv 25+. Prensa em operação. Ou em rebelião.",
    idleLines: ["Lv 25+.", "Uso obrigatório de protetor auricular."],
  },
  mt_placa_funilaria: {
    id: "mt_placa_funilaria", name: "Placa da Funilaria", sprite: C + "Inspector/SpriteSheet.png",
    greeting: "FUNILARIA E ARMAÇÃO — lv 40+. Área de solda: faíscas soltas.",
    idleLines: ["Lv 40+.", "Lagartixa não é mascote."],
  },
  mt_placa_pintura: {
    id: "mt_placa_pintura", name: "Placa das Cabines", sprite: C + "Inspector/SpriteSheet.png",
    greeting: "CABINES DE PINTURA — lv 60+. Tinta fresca em tudo, inclusive no ar.",
    idleLines: ["Lv 60+.", "Não respire fundo."],
  },
  mt_placa_montagem: {
    id: "mt_placa_montagem", name: "Placa da Montagem", sprite: C + "Inspector/SpriteSheet.png",
    greeting: "MONTAGEM FINAL — lv 80+. Linha em movimento. A linha não para.",
    idleLines: ["Lv 80+.", "Sala de Descanso no fim da linha, lá a oeste."],
  },
  mt_placa_pista: {
    id: "mt_placa_pista", name: "Placa da Pista", sprite: C + "Inspector/SpriteSheet.png",
    greeting: "PISTA DE TESTES — lv 90+. Subsolo dos protótipos: lv 110+.",
    idleLines: ["Lv 90+.", "Proibido ultrapassar o Protótipo."],
  },
};

export const npcDef = (id: string): NpcDef | undefined => (Object.hasOwn(NPCS, id) ? NPCS[id] : undefined);

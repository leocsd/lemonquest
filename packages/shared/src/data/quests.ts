import { monsterDef } from "./monsters.ts";

// Missões (quests) encadeadas e recompensas diárias do Quadro de Recompensas. Dados + regras puras (servidor e cliente).
// O servidor (packages/server/src/systems/quests.ts) é a autoridade; o cliente usa estas funções para os marcadores
// "!"/"?" sobre os NPCs, o rastreador e o diário de missões.

/** Tipos de passo. Todos os passos de uma missão correm em paralelo; a missão fica pronta quando todos completam. */
export type QuestStepKind =
  /** Matar `count` monstros `target` (id de MONSTERS). Crédito para todos que causaram dano (e grupo, se houver). */
  | "kill"
  /** Ter `count` itens `target` na mochila ao entregar (o item NÃO é consumido). */
  | "collect"
  /** Entregar `count` itens `target` (consumidos ao entregar ao NPC que deu a missão, ou a `npc` se houver). */
  | "deliver"
  /** Pisar na zona `target` (nome de objeto "zone" do mapa) ou na área `area`. */
  | "explore"
  /** Falar com o NPC `target`. */
  | "talk"
  /** Derrotar o chefe `target` (como "kill", mas com destaque). */
  | "boss"
  /** Vencer a onda `count` no Coliseu (`target` ignorado). */
  | "arena";

export interface QuestStep {
  kind: QuestStepKind;
  target: string;
  count: number;
  /** "deliver": NPC que recebe (padrão: quem deu a missão). */
  npc?: string;
  /** "explore": retângulo em tiles (alternativa ao nome da zona). */
  area?: { x: number; y: number; w: number; h: number };
  /** Texto curto do passo no rastreador (PT-BR), ex.: "Ratos". */
  label: string;
}

export interface QuestReward {
  xp: number;
  gold: number;
  items?: { itemId: string; count: number }[];
  /** Desbloqueio (roupa/addon/título) — id livre; o sistema de conquistas decide o que fazer com ele. */
  unlock?: string;
}

export interface QuestDef {
  id: string;
  name: string;
  /** NPC que dá e recebe a missão. */
  giver: string;
  minLevel: number;
  /** Missões que precisam estar concluídas. */
  requires?: string[];
  /** Resumo (diário de missões). */
  summary: string;
  steps: QuestStep[];
  dialog: { offer: string; accept: string; progress: string; complete: string };
  rewards: QuestReward;
}

const q = (d: QuestDef): QuestDef => d;

/** Catálogo (ordem = ordem de exibição). Floresta 1–10 → Pântano/Cavernas 10–25 → Ruínas/Cripta 25–40. */
export const QUEST_LIST: QuestDef[] = [
  // --- Floresta (1–10) -------------------------------------------------------------------------------
  q({
    id: "rats_barn", name: "Ratos no Celeiro", giver: "guard_captain", minLevel: 1,
    summary: "Os ratos da floresta ao norte estão roubando os grãos da vila. O Capitão Rodrigo quer o problema resolvido.",
    steps: [{ kind: "kill", target: "rat", count: 5, label: "Ratos" }],
    dialog: {
      offer: "Você aí, recruta! Os ratos da floresta ao norte estão invadindo os celeiros. Mate cinco deles e eu te pago bem. Topa?",
      accept: "Ótimo! A floresta fica logo ao norte da praça. Volte quando tiver acabado com eles.",
      progress: "Ainda tem rato roendo meu trigo. Volte quando tiver matado cinco.",
      complete: "Cinco ratos a menos! O padeiro vai dormir tranquilo. Tome, você mereceu.",
    },
    rewards: { xp: 100, gold: 30, items: [{ itemId: "health_potion", count: 5 }] },
  }),
  q({
    id: "slime_salve", name: "Gosma para Unguentos", giver: "herbalist", minLevel: 2,
    summary: "Dona Marta precisa de gosma de slime fresquinha para preparar unguentos.",
    steps: [{ kind: "deliver", target: "slime_goo", count: 5, label: "Gosma" }],
    dialog: {
      offer: "Ah, meu bem, você parece forte! Preciso de cinco porções de gosma das gosmas verdes da floresta para os meus unguentos. Me ajuda?",
      accept: "Que amor! As gosmas ficam espalhadas pela floresta. Traga cinco porções de gosma.",
      progress: "Ainda não tem as cinco porções de gosma? Sem pressa, elas não fogem... muito.",
      complete: "Perfeito, e ainda está morninha! Leve estas poções, feitas com carinho.",
    },
    rewards: { xp: 180, gold: 50, items: [{ itemId: "health_potion", count: 3 }, { itemId: "mana_potion", count: 3 }] },
  }),
  q({
    id: "bee_hunt", name: "Caça às Abelhas", giver: "old_hunter", minLevel: 4,
    summary: "O Velho Caçador Tomé quer ensinar a caçar abelhas sem levar ferroada (muitas).",
    steps: [
      { kind: "kill", target: "bee", count: 6, label: "Abelhas" },
      { kind: "deliver", target: "bee_sting", count: 3, label: "Ferrões" },
    ],
    dialog: {
      offer: "Quer aprender a caçar? Comece pelas abelhas do norte da floresta. Mate seis e me traga três ferrões, que eu uso nas minhas flechas.",
      accept: "Isso! Elas só atacam quem mexe com elas. Então mexa.",
      progress: "Seis abelhas e três ferrões, garoto. Paciência e mira.",
      complete: "Belos ferrões! Você tem futuro. Leve isto para a próxima caçada.",
    },
    rewards: { xp: 350, gold: 100, items: [{ itemId: "honey", count: 5 }, { itemId: "meat", count: 5 }] },
  }),
  q({
    id: "forest_wolves", name: "Os Lobos da Floresta", giver: "guard_captain", minLevel: 6, requires: ["rats_barn"],
    summary: "Lobos atacaram viajantes na estrada. O Capitão quer a matilha reduzida e um relatório do Velho Caçador.",
    steps: [
      { kind: "talk", target: "old_hunter", count: 1, label: "Falar com Tomé" },
      { kind: "kill", target: "wolf", count: 10, label: "Lobos" },
    ],
    dialog: {
      offer: "Os lobos andam ousados demais: dois mercadores foram atacados na estrada. Fale com o Velho Caçador Tomé, ele sabe onde fica a matilha, e mate dez lobos.",
      accept: "Tomé mora na clareira a oeste da floresta. Cuidado: lobo não perdoa novato distraído.",
      progress: "A matilha ainda está lá fora. Dez lobos, e fale com o Tomé.",
      complete: "As estradas estão seguras de novo. A vila te deve uma. Tome, e não gaste tudo em mel.",
    },
    rewards: { xp: 900, gold: 250, items: [{ itemId: "health_potion", count: 10 }] },
  }),
  // --- Pântano e Cavernas (10–25) ---------------------------------------------------------------------
  q({
    id: "swamp_report", name: "Relatório do Pântano", giver: "guard_captain", minLevel: 10, requires: ["forest_wolves"],
    summary: "Algo se mexe no Pântano Turvo, a leste. O Capitão precisa de alguém para explorar e conter as cobras.",
    steps: [
      { kind: "explore", target: "Pântano Turvo", count: 1, label: "Explorar o Pântano Turvo" },
      { kind: "kill", target: "snake", count: 10, label: "Cobras" },
    ],
    dialog: {
      offer: "Patrulheiros sumiram no Pântano Turvo, a leste. Vá até lá, veja o que está acontecendo e mate dez cobras pelo caminho.",
      accept: "Leve antídoto... ah, não temos antídoto. Leve coragem, então.",
      progress: "E o pântano? Ainda preciso do seu relatório e de dez cobras a menos.",
      complete: "Uma névoa roxa e mortos andando? Isso é coisa de lich... Tome sua paga, vou avisar a Sacerdotisa.",
    },
    rewards: { xp: 1500, gold: 500, items: [{ itemId: "ring_vigor", count: 1 }] },
  }),
  q({
    id: "silk_poison", name: "Seda e Veneno", giver: "herbalist", minLevel: 14, requires: ["slime_salve"],
    summary: "Dona Marta quer seda e olhos de aranha para poções mais fortes.",
    steps: [
      { kind: "deliver", target: "spider_silk", count: 5, label: "Seda de Aranha" },
      { kind: "deliver", target: "spider_eye", count: 2, label: "Olhos de Aranha" },
    ],
    dialog: {
      offer: "Minhas poções médias precisam de seda de aranha e olhos de aranha. As aranhas do pântano têm de sobra. Cinco sedas e dois olhos, pode ser?",
      accept: "Cuidado com o veneno, meu bem. E não esmague os olhos!",
      progress: "Cinco sedas e dois olhos de aranha. Inteiros, por favor.",
      complete: "Que maravilha! Com isso faço poções para a vila inteira. Leve algumas.",
    },
    rewards: { xp: 2500, gold: 900, items: [{ itemId: "health_potion_medium", count: 5 }, { itemId: "mana_potion_medium", count: 5 }] },
  }),
  q({
    id: "cave_echoes", name: "Ecos nas Cavernas", giver: "old_hunter", minLevel: 16, requires: ["bee_hunt"],
    summary: "Tomé ouviu ecos estranhos vindos das Cavernas ao sul. Morcegos demais, diz ele.",
    steps: [
      { kind: "explore", target: "Cavernas", count: 1, label: "Explorar as Cavernas" },
      { kind: "kill", target: "bat", count: 12, label: "Morcegos" },
    ],
    dialog: {
      offer: "Nas Cavernas ao sul os morcegos se multiplicaram. Espantam a caça inteira. Entre lá e derrube doze deles.",
      accept: "Leve tocha. E não grite, que eles vêm todos de uma vez.",
      progress: "Doze morcegos. E vá até as Cavernas, não adianta caçar na praça.",
      complete: "Silêncio, finalmente! A caça vai voltar. Este anel me serviu bem por anos; agora é seu.",
    },
    rewards: { xp: 3000, gold: 1200, items: [{ itemId: "ring_mente", count: 1 }] },
  }),
  q({
    id: "swamp_lich", name: "O Lich do Pântano", giver: "priest", minLevel: 22, requires: ["swamp_report"],
    summary: "A Sacerdotisa Liora sente uma presença morta no Pântano Turvo: um lich. Ele guarda a chave da Cripta.",
    steps: [
      { kind: "boss", target: "swamp_lich", count: 1, label: "Lich do Pântano" },
      { kind: "collect", target: "crypt_key", count: 1, label: "Chave da Cripta" },
    ],
    dialog: {
      offer: "O Capitão me contou da névoa roxa. É um lich, viajante, um morto que se recusa a descansar. Derrote-o e traga a chave da Cripta que ele carrega. Não vá sozinho.",
      accept: "Que a luz te proteja. Reúna amigos: ele é mais forte do que parece.",
      progress: "O lich ainda caminha. Sinto sua presença daqui. Derrote-o e traga a Chave da Cripta.",
      complete: "A chave da Cripta... Então é verdade. Guarde-a bem; precisaremos dela. Receba a bênção da luz.",
    },
    rewards: { xp: 8000, gold: 3000, items: [{ itemId: "health_potion_large", count: 5 }, { itemId: "mana_potion_large", count: 5 }], unlock: "addon:invocador:2" },
  }),
  // --- Ruínas e Cripta (25–40) ------------------------------------------------------------------------
  q({
    id: "restless_dead", name: "Os Mortos Inquietos", giver: "priest", minLevel: 25, requires: ["swamp_lich"],
    summary: "Com o lich derrotado, os mortos da Cripta despertaram. Liora pede que você os ponha para descansar.",
    steps: [
      { kind: "explore", target: "Cripta", count: 1, label: "Entrar na Cripta" },
      { kind: "kill", target: "skeleton", count: 15, label: "Esqueletos" },
      { kind: "kill", target: "ghost", count: 8, label: "Fantasmas" },
    ],
    dialog: {
      offer: "A morte do lich acordou a Cripta. Esqueletos e fantasmas vagam sem paz. Entre lá e devolva-os ao descanso: quinze esqueletos e oito fantasmas.",
      accept: "A Cripta fica no extremo sudeste. A luz vai contigo.",
      progress: "Ainda ouço os lamentos da Cripta. Continue, viajante.",
      complete: "O silêncio voltou à Cripta. Este amuleto foi abençoado no altar; que ele te proteja.",
    },
    rewards: { xp: 9000, gold: 5000, items: [{ itemId: "amulet_protecao", count: 1 }] },
  }),
  q({
    id: "ruins_goblins", name: "Goblins nas Ruínas", giver: "guard_captain", minLevel: 25, requires: ["swamp_report"],
    summary: "Goblins ocuparam as Ruínas de Kael, ao norte. O Capitão quer provas de que a ameaça foi contida.",
    steps: [
      { kind: "explore", target: "Ruínas de Kael", count: 1, label: "Explorar as Ruínas de Kael" },
      { kind: "kill", target: "goblin", count: 15, label: "Goblins" },
      { kind: "deliver", target: "goblin_tooth", count: 5, label: "Dentes de Goblin" },
    ],
    dialog: {
      offer: "Goblins tomaram as Ruínas de Kael e estão saqueando as caravanas. Mate quinze e me traga cinco dentes como prova.",
      accept: "As ruínas ficam ao norte, depois da floresta. Goblin foge quando apanha: não deixe escapar.",
      progress: "Quinze goblins e cinco dentes. Sem dente, sem pagamento.",
      complete: "Que coleção nojenta! Perfeito. Mas os goblins falam de um rei... Fique de olho.",
    },
    rewards: { xp: 8000, gold: 4000, items: [{ itemId: "ring_furia", count: 1 }] },
  }),
  q({
    id: "goblin_king", name: "A Coroa do Rei Goblin", giver: "guard_captain", minLevel: 35, requires: ["ruins_goblins"],
    summary: "O Rei Goblin comanda os saqueadores das Ruínas de Kael. Derrote-o e traga sua coroa.",
    steps: [
      { kind: "boss", target: "goblin_king", count: 1, label: "Rei Goblin" },
      { kind: "deliver", target: "goblin_crown", count: 1, label: "Coroa do Rei Goblin" },
    ],
    dialog: {
      offer: "Os goblins têm um rei, e ele está nas profundezas das Ruínas de Kael. Acabe com ele e traga a coroa. Leve os melhores guerreiros que conhecer.",
      accept: "Pela vila de Pedra Clara! Volte vivo, de preferência com a coroa.",
      progress: "O Rei Goblin ainda reina. Quero aquela coroa na minha mesa.",
      complete: "A coroa do Rei Goblin! Os bardos vão cantar seu nome por anos. Aceite isto em nome da vila.",
    },
    rewards: { xp: 20000, gold: 15000, items: [{ itemId: "mithril_bar", count: 2 }], unlock: "addon:assassino:2" },
  }),
  // --- Coliseu ------------------------------------------------------------------------------------------
  q({
    id: "arena_glory", name: "Glória no Coliseu", giver: "arena_master", minLevel: 12,
    summary: "O Mestre do Coliseu quer ver do que você é capaz: vença a quinta onda.",
    steps: [{ kind: "arena", target: "", count: 5, label: "Ondas do Coliseu" }],
    dialog: {
      offer: "Sangue novo! Prove seu valor: vença a quinta onda do Coliseu, sozinho ou com seu grupo, e terá meu respeito.",
      accept: "Monte seu grupo e entre na arena. A multidão está esperando!",
      progress: "Ainda não venceu a quinta onda? A areia não mente.",
      complete: "A multidão grita seu nome! Isto é para quem sobrevive à areia.",
    },
    rewards: { xp: 2500, gold: 1500, items: [{ itemId: "health_potion_medium", count: 10 }], unlock: "outfit:barbaro" },
  }),
  // --- Terras Selvagens (40–120): Batedora Iara e Sacerdotisa da Fronteira ---------------------------------
  q({
    id: "orc_menace", name: "A Ameaça Orc", giver: "frontier_scout", minLevel: 40,
    summary: "Os orcs da fortaleza no Deserto de Zao estão atacando as caravanas da Fronteira.",
    steps: [
      { kind: "kill", target: "orc_warrior", count: 20, label: "Orcs Guerreiros" },
      { kind: "kill", target: "orc_shaman", count: 10, label: "Orcs Xamãs" },
    ],
    dialog: {
      offer: "Os orcs da fortaleza ao noroeste roubaram mais uma caravana. Mate vinte guerreiros e dez xamãs e eles vão pensar duas vezes.",
      accept: "A fortaleza fica no deserto, ao noroeste do posto. Cuidado com os xamãs: eles fogem e voltam com raio.",
      progress: "Ainda tem orc demais naquele deserto. Vinte guerreiros e dez xamãs.",
      complete: "As caravanas voltaram a passar! Você é dos bons. Tome a sua parte.",
    },
    rewards: { xp: 15000, gold: 3000, items: [{ itemId: "health_potion_large", count: 10 }] },
  }),
  q({
    id: "labyrinth_horns", name: "Chifres do Labirinto", giver: "frontier_scout", minLevel: 48, requires: ["orc_menace"],
    summary: "A Batedora Iara quer provas de que o Labirinto dos Minotauros pode ser atravessado.",
    steps: [
      { kind: "kill", target: "minotaur_mage", count: 10, label: "Minotauros Magos" },
      { kind: "deliver", target: "minotaur_horn", count: 10, label: "Chifres de Minotauro" },
    ],
    dialog: {
      offer: "Ninguém mapeia o Labirinto porque os magos minotauros queimam quem tenta. Mate dez deles e me traga dez chifres como prova.",
      accept: "A boca do Labirinto fica a oeste do posto. Marque as paredes, ou nunca mais sai.",
      progress: "Dez magos e dez chifres. O Labirinto não vai se mapear sozinho.",
      complete: "Chifres de verdade! Agora dá para desenhar o caminho. Leve isto.",
    },
    rewards: { xp: 20000, gold: 4000, items: [{ itemId: "mana_potion_large", count: 10 }] },
  }),
  q({
    id: "horned_fox_hunt", name: "A Rainha do Labirinto", giver: "frontier_scout", minLevel: 55, requires: ["labyrinth_horns"],
    summary: "No salão central do Labirinto vive a Raposa Chifruda, que comanda os minotauros.",
    steps: [{ kind: "boss", target: "horned_fox", count: 1, label: "Raposa Chifruda" }],
    dialog: {
      offer: "No salão do meio do Labirinto mora a Raposa Chifruda. Enquanto ela viver, os minotauros não param. Junte um grupo e acabe com ela.",
      accept: "Ela aparece a cada poucas horas. Vá com amigos: sozinho você vira enfeite de parede.",
      progress: "A Raposa ainda manda no Labirinto. Volte quando ela cair.",
      complete: "A rainha caiu! Os minotauros estão sem rumo. Isto é para você e para o seu grupo.",
    },
    rewards: { xp: 40000, gold: 8000, items: [{ itemId: "health_potion_large", count: 15 }] },
  }),
  q({
    id: "cyclops_peaks", name: "Gigantes dos Picos", giver: "frontier_scout", minLevel: 55,
    summary: "Os ciclopes descem dos Picos Gelados e esmagam quem passa pela estrada do norte.",
    steps: [{ kind: "kill", target: "cyclops", count: 25, label: "Ciclopes" }],
    dialog: {
      offer: "Os ciclopes do Monte Ciclope estão descendo para a estrada. Mate vinte e cinco antes que eles achem o posto.",
      accept: "O monte fica a nordeste, na neve. Fique longe do porrete deles.",
      progress: "Os gigantes ainda descem do monte. Vinte e cinco, aventureiro.",
      complete: "A estrada do norte está livre! Tome, você mereceu cada moeda.",
    },
    rewards: { xp: 26000, gold: 5000, items: [{ itemId: "health_potion_large", count: 10 }] },
  }),
  q({
    id: "evil_eyes", name: "O Olho que Tudo Vê", giver: "frontier_priest", minLevel: 60,
    summary: "Os olhos malignos do cemitério nos Picos Gelados amaldiçoam os mortos.",
    steps: [
      { kind: "kill", target: "bonelord", count: 20, label: "Olhos Malignos" },
      { kind: "deliver", target: "bonelord_eye", count: 5, label: "Olhos para queimar" },
    ],
    dialog: {
      offer: "No cemitério dos picos, os olhos malignos não deixam os mortos descansarem. Destrua vinte deles e me traga cinco olhos para eu queimar.",
      accept: "Não encare os olhos por muito tempo. E não fique parado no cemitério.",
      progress: "Ainda sinto os olhos daquele cemitério sobre nós. Vinte, e cinco olhos.",
      complete: "Que a luz queime estes olhos para sempre. Os mortos agradecem, e eu também.",
    },
    rewards: { xp: 30000, gold: 5000, items: [{ itemId: "mana_potion_large", count: 15 }] },
  }),
  q({
    id: "black_fort", name: "O Forte Negro", giver: "frontier_scout", minLevel: 65, requires: ["cyclops_peaks"],
    summary: "Os cavaleiros negros tomaram o forte em ruínas da Floresta Sombria.",
    steps: [{ kind: "kill", target: "black_knight", count: 20, label: "Cavaleiros Negros" }],
    dialog: {
      offer: "O Forte Negro, a sudoeste, era nosso. Os cavaleiros negros tomaram tudo. Derrube vinte deles.",
      accept: "Eles batem forte e não fogem. Leve poção, muita poção.",
      progress: "O forte ainda está cheio de armaduras pretas. Vinte, nem um a menos.",
      complete: "O Forte Negro é nosso de novo! Isto é o mínimo que posso dar.",
    },
    rewards: { xp: 36000, gold: 7000, items: [{ itemId: "health_potion_large", count: 15 }] },
  }),
  q({
    id: "dragon_scales", name: "Escamas do Vale", giver: "frontier_scout", minLevel: 70, requires: ["black_fort"],
    summary: "Os ferreiros da Fronteira precisam de escamas de dragão para forjar escudos.",
    steps: [
      { kind: "kill", target: "dragon", count: 25, label: "Dragões" },
      { kind: "deliver", target: "dragon_scale", count: 10, label: "Escamas de Dragão" },
    ],
    dialog: {
      offer: "Escudo bom só se faz com escama de dragão. Mate vinte e cinco dragões no vale ao sul e me traga dez escamas.",
      accept: "Fique de lado quando eles respirarem fundo. O fogo vem reto.",
      progress: "Vinte e cinco dragões e dez escamas. O ferreiro está esperando.",
      complete: "Escamas perfeitas! O ferreiro vai chorar de alegria. Tome.",
    },
    rewards: { xp: 45000, gold: 9000, items: [{ itemId: "dragon_ham", count: 10 }] },
  }),
  q({
    id: "demodras_hunt", name: "O Terror do Vale", giver: "frontier_scout", minLevel: 80, requires: ["dragon_scales"],
    summary: "Demodras, o dragão vermelho, dorme no fundo do Vale dos Dragões.",
    steps: [{ kind: "boss", target: "demodras", count: 1, label: "Demodras" }],
    dialog: {
      offer: "No fundo do vale dorme Demodras, o pai de todos aqueles dragões. Junte os mais fortes que conhecer e acabe com ele.",
      accept: "O covil fica a sudeste do vale, entre pilares de pedra. Que o fogo não te alcance.",
      progress: "Demodras ainda respira. Volte quando ele cair.",
      complete: "Demodras caiu! Contam essa história por mil anos. Agora você é um Matador de Dragões.",
    },
    rewards: { xp: 80000, gold: 15000, items: [{ itemId: "health_potion_large", count: 20 }], unlock: "title:matador_dragoes" },
  }),
  q({
    id: "abyss_gates", name: "Os Portões do Abismo", giver: "frontier_priest", minLevel: 90, requires: ["evil_eyes"],
    summary: "Behemoths e demônios sobem do Abismo, a leste do vale.",
    steps: [
      { kind: "kill", target: "behemoth", count: 15, label: "Behemoths" },
      { kind: "kill", target: "demon", count: 10, label: "Demônios" },
    ],
    dialog: {
      offer: "O Abismo está transbordando. Quinze behemoths e dez demônios devem fechar os portões por um tempo. Que a luz te acompanhe.",
      accept: "A boca do Abismo fica a leste. Desça com um grupo. Ninguém volta sozinho de lá.",
      progress: "Ainda sinto o enxofre daqui. Quinze behemoths e dez demônios.",
      complete: "Os portões se fecharam... por enquanto. Você fez o que poucos fariam.",
    },
    rewards: { xp: 90000, gold: 20000, items: [{ itemId: "health_potion_large", count: 20 }, { itemId: "mana_potion_large", count: 20 }] },
  }),
  q({
    id: "orshabaal_hunt", name: "O Senhor do Abismo", giver: "frontier_priest", minLevel: 110, requires: ["abyss_gates"],
    summary: "No trono do Abismo, Orshabaal espera os tolos e os heróis.",
    steps: [{ kind: "boss", target: "orshabaal", count: 1, label: "Orshabaal" }],
    dialog: {
      offer: "Orshabaal está no trono do Abismo. Só um grupo de verdadeiros heróis pode bani-lo. Você é um deles?",
      accept: "Que a luz te guarde. E que o seu grupo não te abandone.",
      progress: "Orshabaal ainda ri no fundo do Abismo. Volte quando ele calar.",
      complete: "Orshabaal foi banido! A Fronteira inteira vai rezar por você. Daqui para frente, você é o Exorcista.",
    },
    rewards: { xp: 180000, gold: 40000, items: [{ itemId: "health_potion_large", count: 30 }], unlock: "title:exorcista" },
  }),
  // --- Costa Esmeralda: Porto Esperança (25–120) -------------------------------------------------------
  q({
    id: "banuta_apes", name: "Macacos Ladrões", giver: "explorer_jairo", minLevel: 25,
    summary: "Os macacos da Selva de Banuta roubaram o equipamento do Explorador Jairo.",
    steps: [
      { kind: "kill", target: "sibang", count: 15, label: "Sibangs" },
      { kind: "kill", target: "kongra", count: 15, label: "Kongras" },
    ],
    dialog: {
      offer: "Os macacos da selva levaram minha bússola, meu mapa e meu chapéu! Mate quinze sibangs e quinze kongras e quem sabe eles devolvem.",
      accept: "Eles ficam logo a oeste do porto. Os sibangs atiram coco de longe, cuidado com a cabeça.",
      progress: "Ainda vejo macaco usando o meu chapéu. Quinze de cada!",
      complete: "Achei a bússola no meio dos cocos! Muito obrigado. Tome, para a próxima expedição.",
    },
    rewards: { xp: 6000, gold: 1500, items: [{ itemId: "health_potion_medium", count: 15 }, { itemId: "banana", count: 10 }] },
  }),
  q({
    id: "banuta_secrets", name: "Os Segredos de Banuta", giver: "explorer_jairo", minLevel: 32, requires: ["banuta_apes"],
    summary: "Jairo quer chegar ao Templo de Banuta, guardado pelos merlkins.",
    steps: [
      { kind: "explore", target: "Templo de Banuta", count: 1, label: "Entrar no Templo de Banuta" },
      { kind: "kill", target: "merlkin", count: 15, label: "Merlkins" },
      { kind: "deliver", target: "tarantula_fang", count: 5, label: "Presas de Tarântula" },
    ],
    dialog: {
      offer: "O templo está lá! Debaixo das ruínas, no coração da selva. Entre, cuide dos merlkins que guardam a entrada e me traga cinco presas de tarântula. Quero estudar o veneno.",
      accept: "As ruínas ficam no meio da selva. Os merlkins lançam raios, não fique parado na frente deles.",
      progress: "Entrar no templo, quinze merlkins e cinco presas. A ciência agradece!",
      complete: "Você entrou no templo! E as presas são perfeitas. Isto vai para o meu livro, e isto vai para o seu bolso.",
    },
    rewards: { xp: 10000, gold: 2500, items: [{ itemId: "mana_potion_medium", count: 20 }] },
  }),
  q({
    id: "croc_hunt", name: "Couro de Crocodilo", giver: "explorer_jairo", minLevel: 36,
    summary: "Jairo precisa de botas novas. De couro de crocodilo, de preferência.",
    steps: [{ kind: "deliver", target: "croc_leather", count: 10, label: "Couros de Crocodilo" }],
    dialog: {
      offer: "Minhas botas não aguentam mais a lama da selva. Me traga dez couros de crocodilo dos lagos do sudoeste?",
      accept: "Os crocodilos ficam perto dos lagos da selva, a sudoeste. Eles são lentos, mas mordem forte.",
      progress: "Ainda estou de botas furadas. Dez couros, por favor.",
      complete: "Couro de primeira! Vou andar na selva como um rei. Tome, e obrigado.",
    },
    rewards: { xp: 12000, gold: 3000, items: [{ itemId: "health_potion_large", count: 5 }] },
  }),
  q({
    id: "kongra_king_hunt", name: "O Rei da Selva", giver: "explorer_jairo", minLevel: 45, requires: ["banuta_secrets"],
    summary: "No santuário do Templo de Banuta vive o Rei Kongra, senhor de todos os macacos.",
    steps: [{ kind: "boss", target: "kongra_king", count: 1, label: "Rei Kongra" }],
    dialog: {
      offer: "Descobri quem manda nos macacos: o Rei Kongra, no santuário do templo. Ele guarda um ídolo de ouro. Junte um grupo e derrube o rei!",
      accept: "O santuário fica no fundo do templo. A porta só se abre para quem tem experiência de sobra.",
      progress: "O Rei Kongra ainda manda na selva. Volte quando ele cair!",
      complete: "O rei caiu! A selva tem um novo rei, e é você. Pegue o ídolo no santuário, se ainda não pegou.",
    },
    rewards: { xp: 25000, gold: 6000, items: [{ itemId: "health_potion_large", count: 10 }], unlock: "title:rei_selva" },
  }),
  q({
    id: "pirate_raid", name: "Piratas na Costa", giver: "port_captain", minLevel: 30,
    summary: "Os piratas da caverna da praia atacam os navios de Porto Esperança.",
    steps: [
      { kind: "kill", target: "pirate_marauder", count: 15, label: "Piratas Saqueadores" },
      { kind: "kill", target: "pirate_corsair", count: 10, label: "Piratas Corsários" },
    ],
    dialog: {
      offer: "Os piratas da caverna da praia afundaram mais um barco meu! Mate quinze saqueadores e dez corsários e me devolva a paz.",
      accept: "A caverna fica na praia, ao norte do porto. Os corsários atiram de longe, entre rápido.",
      progress: "Ainda vejo bandeira pirata na praia. Quinze saqueadores e dez corsários!",
      complete: "A praia está calma de novo! Tome, marujo, e um brinde por mim.",
    },
    rewards: { xp: 9000, gold: 2500, items: [{ itemId: "health_potion_medium", count: 15 }, { itemId: "calamari", count: 5 }] },
  }),
  q({
    id: "redbeard_hunt", name: "A Cabeça do Barba-Ruiva", giver: "port_captain", minLevel: 40, requires: ["pirate_raid"],
    summary: "O Capitão Barba-Ruiva comanda os piratas do fundo da caverna. A Capitã Marina quer o gancho dele.",
    steps: [
      { kind: "kill", target: "pirate_buccaneer", count: 10, label: "Piratas Bucaneiros" },
      { kind: "boss", target: "captain_redbeard", count: 1, label: "Capitão Barba-Ruiva" },
    ],
    dialog: {
      offer: "O Barba-Ruiva se esconde no fundo da caverna, cercado de bucaneiros. Mate dez deles e acabe com ele. E dizem que o tesouro dele fica logo ali...",
      accept: "Leve um grupo. O Barba-Ruiva já afundou três navios e cem marujos.",
      progress: "O Barba-Ruiva ainda está vivo. Dez bucaneiros e o capitão!",
      complete: "O Barba-Ruiva caiu! Hoje o porto inteiro bebe por você, Caçador de Piratas.",
    },
    rewards: { xp: 20000, gold: 5000, items: [{ itemId: "health_potion_large", count: 10 }], unlock: "title:cacador_piratas" },
  }),
  q({
    id: "winter_wolves", name: "Lobos do Inverno", giver: "jarl_haakon", minLevel: 50,
    summary: "Os lobos do inverno cercam o Acampamento Nórdico.",
    steps: [{ kind: "kill", target: "winter_wolf", count: 20, label: "Lobos do Inverno" }],
    dialog: {
      offer: "Os lobos do inverno estão cercando o acampamento. Mate vinte e o povo do norte vai falar de você na fogueira.",
      accept: "Eles correm muito e mordem gelado. Não deixe que te cerquem.",
      progress: "Ainda ouço os uivos à noite. Vinte lobos, sulista!",
      complete: "Ha! Vinte lobos! Você não é tão mole quanto parece. Tome!",
    },
    rewards: { xp: 22000, gold: 4000, items: [{ itemId: "meat", count: 20 }, { itemId: "health_potion_large", count: 5 }] },
  }),
  q({
    id: "barbarian_trial", name: "A Prova dos Bárbaros", giver: "jarl_haakon", minLevel: 55, requires: ["winter_wolves"],
    summary: "Os bárbaros renegados da Ilha Gelada só respeitam quem os vence em combate.",
    steps: [
      { kind: "kill", target: "barbarian", count: 20, label: "Bárbaros" },
      { kind: "deliver", target: "winter_fur", count: 8, label: "Peles de Inverno" },
    ],
    dialog: {
      offer: "Os bárbaros renegados riem de nós. Vença vinte deles e me traga oito peles de inverno para as nossas capas.",
      accept: "Eles ficam no leste da ilha. Bárbaro não foge, então você também não foge.",
      progress: "Vinte bárbaros e oito peles. O norte não espera.",
      complete: "Você venceu a prova! A partir de hoje, é um de nós. Tome esta recompensa.",
    },
    rewards: { xp: 28000, gold: 5000, items: [{ itemId: "health_potion_large", count: 10 }] },
  }),
  q({
    id: "ice_witches", name: "As Bruxas do Gelo", giver: "jarl_haakon", minLevel: 62, requires: ["barbarian_trial"],
    summary: "As bruxas do gelo enfeitiçam os guerreiros do Jarl com seus cantos.",
    steps: [{ kind: "kill", target: "ice_witch", count: 20, label: "Bruxas do Gelo" }],
    dialog: {
      offer: "As bruxas do gelo cantam e os meus guerreiros andam para a neve e não voltam. Mate vinte delas.",
      accept: "Elas ficam perto da Caverna do Yeti, ao norte. Tampe os ouvidos e ataque rápido.",
      progress: "Ainda ouço o canto delas. Vinte bruxas!",
      complete: "O canto parou! Meus guerreiros dormem em paz. Tome.",
    },
    rewards: { xp: 36000, gold: 6000, items: [{ itemId: "mana_potion_large", count: 15 }] },
  }),
  q({
    id: "yeti_hunt", name: "O Yeti", giver: "jarl_haakon", minLevel: 70, requires: ["ice_witches"],
    summary: "O Yeti vive no fundo da caverna gelada e devora os caçadores do norte.",
    steps: [{ kind: "boss", target: "yeti", count: 1, label: "Yeti" }],
    dialog: {
      offer: "Chegou a hora: o Yeti. Ele vive no fundo da caverna ao norte. Junte os mais fortes e traga o pelo dele. Quem matar o Yeti entra no Ninho dos Dragões de Gelo.",
      accept: "Ele bate como uma avalanche. Vá com um grupo e com o estômago cheio.",
      progress: "O Yeti ainda ruge na caverna. Volte quando ele cair!",
      complete: "O YETI CAIU! Hoje é festa no norte! A porta do Ninho dos Dragões de Gelo agora se abre para você.",
    },
    rewards: { xp: 55000, gold: 12000, items: [{ itemId: "health_potion_large", count: 15 }], unlock: "title:matador_yeti" },
  }),
  q({
    id: "frost_dragons", name: "Dragões de Gelo", giver: "jarl_haakon", minLevel: 80, requires: ["yeti_hunt"],
    summary: "Atrás da Caverna do Yeti fica o Ninho dos Dragões de Gelo.",
    steps: [
      { kind: "kill", target: "frost_dragon", count: 20, label: "Dragões de Gelo" },
      { kind: "deliver", target: "frost_dragon_scale", count: 10, label: "Escamas de Dragão de Gelo" },
    ],
    dialog: {
      offer: "Com o Yeti morto, o ninho dos dragões de gelo está aberto. Mate vinte e me traga dez escamas. Vou forjar o escudo mais frio do mundo!",
      accept: "O ninho fica depois da caverna do Yeti. O sopro deles congela o sangue.",
      progress: "Vinte dragões de gelo e dez escamas, guerreiro.",
      complete: "Escamas lindas! O norte nunca vai esquecer o seu nome.",
    },
    rewards: { xp: 70000, gold: 14000, items: [{ itemId: "dragon_ham", count: 10 }, { itemId: "health_potion_large", count: 10 }] },
  }),
  q({
    id: "heroes_rest", name: "O Descanso dos Heróis", giver: "port_priest", minLevel: 65,
    summary: "Na Caverna dos Heróis, ao sul da selva, heróis caídos e necromantes lutam sem fim.",
    steps: [
      { kind: "kill", target: "hero", count: 20, label: "Heróis" },
      { kind: "kill", target: "necromancer", count: 15, label: "Necromantes" },
      { kind: "deliver", target: "hero_badge", count: 5, label: "Insígnias de Herói" },
    ],
    dialog: {
      offer: "Os necromantes ergueram os heróis caídos da caverna ao sul da selva. Dê descanso a vinte heróis, acabe com quinze necromantes e me traga cinco insígnias.",
      accept: "A caverna fica no sul da selva. A porta só abre para quem já tem experiência.",
      progress: "Os heróis ainda não descansam. Vinte heróis, quinze necromantes e cinco insígnias.",
      complete: "Eles finalmente descansam. A luz sorri para você, Herói.",
    },
    rewards: { xp: 45000, gold: 9000, items: [{ itemId: "health_potion_large", count: 15 }], unlock: "title:heroi" },
  }),
  q({
    id: "magma_heart", name: "O Coração de Magma", giver: "sage_ignis", minLevel: 85,
    summary: "Mestre Ignis estuda o Vulcão de Goroma e precisa de núcleos de magma.",
    steps: [
      { kind: "explore", target: "Vulcão de Goroma", count: 1, label: "Chegar ao Vulcão de Goroma" },
      { kind: "kill", target: "magma_elemental", count: 25, label: "Elementais de Magma" },
      { kind: "deliver", target: "magma_core", count: 5, label: "Núcleos de Magma" },
    ],
    dialog: {
      offer: "O vulcão a sudeste está despertando. Vá até lá, destrua vinte e cinco elementais de magma e me traga cinco núcleos. Preciso entender esse calor.",
      accept: "Siga a estrada para o sul. Quando o chão ficar escuro e quente, você chegou.",
      progress: "Vinte e cinco elementais e cinco núcleos. O vulcão não espera.",
      complete: "Núcleos perfeitos! Eles pulsam no ritmo de algo muito antigo... Tome a sua recompensa.",
    },
    rewards: { xp: 70000, gold: 14000, items: [{ itemId: "health_potion_large", count: 20 }] },
  }),
  q({
    id: "hellhounds", name: "Os Cães do Inferno", giver: "sage_ignis", minLevel: 95, requires: ["magma_heart"],
    summary: "Cães infernais guardam a cratera do Vulcão de Goroma.",
    steps: [{ kind: "kill", target: "hellhound", count: 20, label: "Cães Infernais" }],
    dialog: {
      offer: "Os cães infernais guardam a subida da cratera. Mate vinte e o caminho para a Cidadela fica livre.",
      accept: "Eles são rápidos e não largam a presa. Fique de costas para a parede.",
      progress: "Ainda ouço os latidos lá do porto. Vinte cães!",
      complete: "Os cães se calaram. Agora sim, a cratera está ao seu alcance.",
    },
    rewards: { xp: 90000, gold: 18000, items: [{ itemId: "health_potion_large", count: 20 }, { itemId: "mana_potion_large", count: 20 }] },
  }),
  // Ciclo 9 (faixa 90-120): o buraco entre Os Cães do Inferno (95) e O Fim de Ferumbras (120) não tinha missão
  // nenhuma. As duas abaixo reaproveitam monstros/itens que já existiam no mapa (demon e juggernaut, já no
  // tools/mapgen/expansion2.mjs), sem pedir mapa ou arte novos.
  q({
    id: "demon_gate", name: "Os Portões Demoníacos", giver: "sage_ignis", minLevel: 100, requires: ["hellhounds"],
    summary: "Demônios guardam os portões que levam à Cidadela, mais abaixo na cratera.",
    steps: [{ kind: "kill", target: "demon", count: 20, label: "Demônios" }],
    dialog: {
      offer: "Passando os cães, vêm os demônios. Eles guardam os portões da Cidadela. Mate vinte e eles recuam.",
      accept: "Chuva de fogo e paralisia. Não fique parado depois que eles abrirem a boca.",
      progress: "Os portões ainda estão cheios de demônios. Vinte, lembra?",
      complete: "Os portões ficaram livres. Falta só a ponte agora, antes da própria Cidadela.",
    },
    rewards: { xp: 120000, gold: 26000, items: [{ itemId: "health_potion_large", count: 22 }, { itemId: "mana_potion_large", count: 15 }] },
  }),
  q({
    id: "colossus_bridge", name: "A Ponte dos Colossos", giver: "sage_ignis", minLevel: 108, requires: ["demon_gate"],
    summary: "Uma ponte de pedra, guardada por colossos, é o último obstáculo antes da Cidadela.",
    steps: [{ kind: "deliver", target: "juggernaut_plate", count: 8, label: "Placas de Colosso" }],
    dialog: {
      offer: "A ponte para a Cidadela é guardada por colossos. Me traga oito placas arrancadas deles e eu abro caminho.",
      accept: "Cada placa é um colosso a menos de pé. Cuidado com o Terremoto: ele acerta uma área, não só você.",
      progress: "Oito placas de colosso. Sei que você já derrubou alguns, mas preciso de mais.",
      complete: "Oito placas. A ponte é sua agora. O que vem depois dela é entre você e Ferumbras.",
    },
    rewards: { xp: 160000, gold: 38000, items: [{ itemId: "health_potion_large", count: 26 }] },
  }),
  q({
    id: "ferumbras_end", name: "O Fim de Ferumbras", giver: "sage_ignis", minLevel: 120, requires: ["colossus_bridge"],
    summary: "Na Cidadela, sob o vulcão, o feiticeiro Ferumbras prepara o seu retorno.",
    steps: [
      { kind: "kill", target: "juggernaut", count: 10, label: "Colossos" },
      { kind: "boss", target: "ferumbras", count: 1, label: "Ferumbras" },
    ],
    dialog: {
      offer: "Ferumbras, o maior feiticeiro que já existiu, está na Cidadela debaixo do vulcão. Atravesse os colossos e acabe com ele. Se é que ele pode morrer.",
      accept: "A Cidadela fica na cratera. Leve o melhor grupo que puder reunir. Ferumbras não perdoa.",
      progress: "Ferumbras ainda vive. Dez colossos e o feiticeiro!",
      complete: "Você venceu Ferumbras! Ele vai voltar, sempre volta... mas hoje o mundo é seu, Algoz de Ferumbras.",
    },
    rewards: { xp: 200000, gold: 50000, items: [{ itemId: "health_potion_large", count: 30 }], unlock: "title:algoz_ferumbras" },
  }),
];

export const QUESTS: Record<string, QuestDef> = Object.fromEntries(QUEST_LIST.map((d) => [d.id, d]));
export const questDef = (id: string): QuestDef | undefined => (Object.hasOwn(QUESTS, id) ? QUESTS[id] : undefined);

/** Máximo de missões rastreadas no canto da tela. */
export const MAX_TRACKED_QUESTS = 3;

// ---------------------------------------------------------------------------
// Estado do jogador (enviado ao cliente em S2C.Quests) e regras puras.
// ---------------------------------------------------------------------------

export interface ActiveQuestView {
  id: string;
  /** Progresso por passo (mesma ordem de `steps`). collect/deliver: 0 (o cliente conta pela mochila). */
  progress: number[];
}

export type BountyStatus = "open" | "active" | "done";
export interface BountyView {
  monster: string;
  count: number;
  progress: number;
  status: BountyStatus;
  xp: number;
  gold: number;
}

export interface QuestsMsg {
  active: ActiveQuestView[];
  done: string[];
  tracked: string[];
  bounties: { day: string; resetsAt: number; list: BountyView[] };
  /** Grupos de baús de quest já abertos (shared/data/questWorld.ts). */
  chests?: string[];
}

/** Uma missão aceita ou concluída (no diário). */
export type QuestStatus = "locked" | "available" | "active" | "ready" | "done";

/** Conta quantas unidades de um item o jogador tem (mochila). */
export type ItemCounter = (itemId: string) => number;

/** Progresso efetivo de um passo (collect/deliver contam a mochila). */
export function stepProgress(step: QuestStep, stored: number, countItem: ItemCounter): number {
  // Entrega a outro NPC: o progresso é gravado quando o item é entregue lá.
  if (step.kind === "deliver" && step.npc) return Math.min(step.count, stored);
  if (step.kind === "collect" || step.kind === "deliver") return Math.min(step.count, countItem(step.target));
  return Math.min(step.count, stored);
}

/** Todos os passos completos? */
export function questReady(def: QuestDef, progress: readonly number[], countItem: ItemCounter): boolean {
  return def.steps.every((s, i) => stepProgress(s, progress[i] ?? 0, countItem) >= s.count);
}

/** Pode aceitar? (nem ativa nem concluída, level e pré-requisitos). */
export function questAvailable(def: QuestDef, level: number, isActive: (id: string) => boolean, isDone: (id: string) => boolean): boolean {
  if (isActive(def.id) || isDone(def.id) || level < def.minLevel) return false;
  return (def.requires ?? []).every(isDone);
}

export function questStatus(def: QuestDef, st: Pick<QuestsMsg, "active" | "done">, level: number, countItem: ItemCounter): QuestStatus {
  if (st.done.includes(def.id)) return "done";
  const a = st.active.find((x) => x.id === def.id);
  if (a) return questReady(def, a.progress, countItem) ? "ready" : "active";
  return questAvailable(def, level, () => false, (id) => st.done.includes(id)) ? "available" : "locked";
}

/** Marcador sobre o NPC: "ready" (? amarelo) > "available" (! amarelo) > "progress" (? cinza) > null. */
export type NpcMarker = "ready" | "available" | "progress" | null;

export function npcMarker(npcId: string, st: QuestsMsg, level: number, countItem: ItemCounter): NpcMarker {
  if (npcId === BOUNTY_NPC) {
    const list = st.bounties.list;
    if (list.some((b) => b.status === "active" && b.progress >= b.count)) return "ready";
    if (list.some((b) => b.status === "open")) return "available";
    if (list.some((b) => b.status === "active")) return "progress";
    return null;
  }
  let best: NpcMarker = null;
  const rank = (m: NpcMarker) => (m === "ready" ? 3 : m === "available" ? 2 : m === "progress" ? 1 : 0);
  const bump = (m: NpcMarker) => { if (rank(m) > rank(best)) best = m; };
  for (const def of QUEST_LIST) {
    const a = st.active.find((x) => x.id === def.id);
    // Passos "falar com"/"entregar a" outro NPC: este NPC chama a atenção.
    if (a) {
      def.steps.forEach((s, i) => {
        const done = stepProgress(s, a.progress[i] ?? 0, countItem) >= s.count;
        if (s.kind === "talk" && s.target === npcId && !done) bump("ready");
        if (s.kind === "deliver" && s.npc === npcId && (a.progress[i] ?? 0) < s.count && countItem(s.target) >= s.count) bump("ready");
      });
    }
    if (def.giver !== npcId) continue;
    const status = questStatus(def, st, level, countItem);
    if (status === "ready") bump("ready");
    else if (status === "available") bump("available");
    else if (status === "active") bump("progress");
  }
  return best;
}

/** Missões que o NPC mostra na aba "Missões" (disponíveis, ativas e prontas; concluídas não). */
export function questsForNpc(npcId: string, st: QuestsMsg, level: number, countItem: ItemCounter): { def: QuestDef; status: QuestStatus }[] {
  return QUEST_LIST.filter((d) => d.giver === npcId)
    .map((def) => ({ def, status: questStatus(def, st, level, countItem) }))
    .filter((e) => e.status === "available" || e.status === "active" || e.status === "ready");
}

// ---------------------------------------------------------------------------
// Recompensas diárias (Quadro de Recompensas)
// ---------------------------------------------------------------------------

export const BOUNTY_NPC = "bounty_board";
export const BOUNTIES_PER_DAY = 3;
export const BOUNTY_CHEST_ID = "bounty_chest";
/** Hora local (America/Sao_Paulo) da troca diária. */
export const BOUNTY_RESET_HOUR = 6;
export const BOUNTY_TZ = "America/Sao_Paulo";

/** Faixas de level → monstros possíveis para as recompensas. */
export const BOUNTY_BANDS: { minLevel: number; monsters: string[] }[] = [
  { minLevel: 1, monsters: ["rat", "slime", "bee", "wolf"] },
  { minLevel: 10, monsters: ["wolf", "snake", "spider", "bat"] },
  { minLevel: 18, monsters: ["spider", "bat", "skeleton", "goblin"] },
  { minLevel: 26, monsters: ["skeleton", "goblin", "ghost", "lizardman"] },
  { minLevel: 34, monsters: ["ghost", "lizardman", "flame_spirit", "goblin"] },
  // Faixas acrescentadas no fim (as antigas não mudam: a geração do dia depende do índice da faixa).
  { minLevel: 42, monsters: ["orc_warrior", "orc_shaman", "crocodile", "pirate_buccaneer", "carniphila"] },
  { minLevel: 52, monsters: ["minotaur", "minotaur_mage", "cyclops", "winter_wolf", "barbarian"] },
  { minLevel: 62, monsters: ["bonelord", "black_knight", "ice_witch", "necromancer"] },
  { minLevel: 72, monsters: ["dragon", "hero", "frost_dragon", "dragon_lord"] },
  { minLevel: 88, monsters: ["behemoth", "magma_elemental", "hellhound", "demon"] },
];

export function bountyBand(level: number): number {
  let b = 0;
  for (let i = 0; i < BOUNTY_BANDS.length; i++) if (level >= BOUNTY_BANDS[i]!.minLevel) b = i;
  return b;
}

/** "Mate 20 Lobos" (nome do monstro no plural simples). */
export function bountyTitle(d: { monster: string; count: number }): string {
  const name = monsterDef(d.monster)?.name ?? d.monster;
  return `Mate ${d.count} ${pluralPt(name)}`;
}

/** Plural simples em PT-BR da 1ª palavra ("Lobo" → "Lobos", "Homem-Lagarto" → "Homens-Lagarto", "Espírito de Chama" → "Espíritos de Chama"). */
export function pluralPt(name: string): string {
  const parts = name.split(" ");
  const head = parts[0]!;
  const h = head.includes("-") ? head.split("-") : [head];
  const w = h[0]!;
  const pl = /ão$/.test(w) ? w.replace(/ão$/, "ões") : /m$/.test(w) ? w.replace(/m$/, "ns") : /[rsz]$/.test(w) ? w + "es" : /l$/.test(w) ? w.replace(/l$/, "is") : w + "s";
  h[0] = pl;
  parts[0] = h.join("-");
  return parts.join(" ");
}


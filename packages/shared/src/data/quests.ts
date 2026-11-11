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
    id: "pesquisa_de_clima", name: "Pesquisa de Clima", giver: "guard_captain", minLevel: 3,
    summary: "Ninguém respondeu o formulário de clima do Capitão Rodrigo. Alguém vai ter que perguntar pessoalmente.",
    steps: [
      { kind: "talk", target: "shop", count: 1, label: "Perguntar ao Bento" },
      { kind: "talk", target: "herbalist", count: 1, label: "Perguntar à Dona Marta" },
      { kind: "talk", target: "old_hunter", count: 1, label: "Perguntar ao Tomé" },
      { kind: "talk", target: "priest", count: 1, label: "Perguntar à Liora" },
    ],
    dialog: {
      offer: "Recruta, ninguém respondeu o formulário de clima. Ninguém. Vá perguntar pessoalmente ao Bento, à Dona Marta, ao Tomé e à Sacerdotisa Liora como está o clima por aqui.",
      accept: "Anote tudo. E não aceite 'tá ótimo' como resposta... bom, aceite, mas anote.",
      progress: "Faltam respostas. Bento, Dona Marta, Tomé e Liora. É uma pesquisa, não uma sugestão.",
      complete: "Todo mundo disse 'tá ótimo'. Ótimo. Arquivado. Tome umas nozes pelo trabalho de campo.",
    },
    rewards: { xp: 250, gold: 80, items: [{ itemId: "nuts", count: 5 }] },
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
  // --- Oficina dos Engenhos (5–22) --------------------------------------------------------------------
  q({
    id: "chegou", name: "Chegou!", giver: "juliao", minLevel: 5,
    summary: "Julião dos Embarcados espera uma encomenda de iluminadores que nunca chega inteira. Os Ratos Cinzentos da Floresta Sussurrante levaram a caixa e só sobraram brasas apagadas: recupere o lote e mostre ao Pedrão.",
    steps: [
      { kind: "explore", target: "Floresta Sussurrante", count: 1, label: "Ir à Floresta atrás dos ratos" },
      { kind: "deliver", target: "iluminador_queimado", count: 9, label: "Brasas Apagadas" },
      { kind: "talk", target: "pedrao", count: 1, label: "Mostrar ao Pedrão" },
    ],
    dialog: {
      offer: "Chegou! ...Não, era o vento. Olha, nove de cada dez iluminadores chegam queimados, e os Ratos Cinzentos levam o resto para a Floresta Sussurrante, logo ao norte da Vila. Do jeito que eles roem, só sobra brasa apagada. Traga nove Brasas Apagadas, para eu contar o prejuízo, e depois mostre uma ao Pedrão: ele diz se dá para aproveitar.",
      accept: "Chegou! ...Não, ainda não. Quando chegar, eu aviso. Com foto.",
      progress: "Nove brasas e uma palavra do Pedrão. Enquanto isso, a caixa continua vazia.",
      complete: "Nove queimados, um aproveitável. É a média. Tome este Selo de Cera: carimba na testa de quem duvidar que chegou.",
    },
    rewards: { xp: 500, gold: 150, items: [{ itemId: "health_potion", count: 5 }, { itemId: "selo_chegou", count: 1 }] },
  }),
  q({
    id: "git_caiu", name: "git caiu?", giver: "luan", minLevel: 8, requires: ["chegou"],
    summary: "O Luan do Cubo jura que o repositório caiu. Antes de culpar o servidor, alguém precisa perguntar na bancada se foi só o cabo.",
    steps: [
      { kind: "talk", target: "iago", count: 1, label: "Perguntar ao Iago" },
      { kind: "talk", target: "juliao", count: 1, label: "Perguntar ao Julião" },
      { kind: "talk", target: "pedrao", count: 1, label: "Perguntar ao Pedrão" },
    ],
    dialog: {
      offer: "git caiu? Caiu, né? Ninguém consegue puxar nada. Vá perguntar ao Iago, ao Julião e ao Pedrão se para eles também caiu. Se caiu para todo mundo, é o servidor. Se caiu só para mim... é o cabo.",
      accept: "Volte com as três respostas. Enquanto isso vou girar o cubo. Ajuda a pensar.",
      progress: "E aí, caiu para eles também? Preciso das três respostas antes de abrir chamado.",
      complete: "Ninguém mais caiu? Então era o meu cabo. De novo. Tome, pela consultoria. E não conte para o Tomé.",
    },
    rewards: { xp: 900, gold: 200, items: [{ itemId: "mana_potion", count: 5 }] },
  }),
  q({
    id: "bombonas_fugitivas", name: "Bombonas Fugitivas", giver: "bianca", minLevel: 12, requires: ["chegou"],
    summary: "Oito Gosmas Azuis saíram quicando do Pátio de Encomendas, cada uma com uma etiqueta grudada. Bianca da Logística quer as gosmas paradas e as etiquetas de volta para o inventário.",
    steps: [
      { kind: "kill", target: "runaway_drum", count: 8, label: "Gosmas Azuis" },
      { kind: "deliver", target: "rotulo_isca", count: 5, label: "Etiquetas Rasgadas" },
    ],
    dialog: {
      offer: "Oito Gosmas Azuis engoliram as etiquetas das bombonas e saíram quicando do pátio até a estrada dos lobos. Quicando. Sozinhas. Pare oito delas e me traga cinco Etiquetas Rasgadas, porque sem rótulo o inventário não fecha.",
      accept: "Elas fogem quando veem gente. Encurrale. E cuidado com os pés: gosma cheia pesa.",
      progress: "Oito gosmas e cinco etiquetas. O inventário é sexta, e eu não vou explicar bombona a menos.",
      complete: "Inventário fechado! Tome estas Botas Reforçadas: a próxima gosma que quicar no seu pé vai se arrepender.",
    },
    rewards: { xp: 1800, gold: 400, items: [{ itemId: "botas_biqueira", count: 1 }] },
  }),
  q({
    id: "rotaciona_a_senha", name: "Rotaciona a Senha", giver: "iago", minLevel: 16, requires: ["git_caiu"],
    summary: "Iago do Cofre descobriu bilhetes amassados com senha espalhados pelo mundo. Recolha seis e confira se o boato das Cavernas é verdade.",
    steps: [
      { kind: "deliver", target: "post_it_senha", count: 6, label: "Bilhetes Amassados" },
      { kind: "explore", target: "Cavernas", count: 1, label: "Conferir as Cavernas" },
    ],
    dialog: {
      offer: "Papel não é cofre. Mas alguém achou que era, e agora tem Bilhete Amassado com senha rodando por aí, grudado em bicho. Recolha seis para eu rotacionar tudo, e vá até as Cavernas: dizem que tem um até lá.",
      accept: "Não leia a senha. Quer dizer, pode ler, vou trocar mesmo. Mas não leia.",
      progress: "Seis bilhetes e uma ida às Cavernas. Cada um que falta é uma senha que ainda vale.",
      complete: "Seis senhas rotacionadas, e as Cavernas são só morcego mesmo. Tome este Anel de Ferro Batido: aguenta mais que a senha antiga.",
    },
    rewards: { xp: 3000, gold: 800, items: [{ itemId: "anel_trilho_din", count: 1 }] },
  }),
  q({
    id: "frames_descartados", name: "Frames Descartados", giver: "pedrao", minLevel: 22, requires: ["bombonas_fugitivas"],
    summary: "Pedrão, o Visionário, perde frame atrás de frame para a escória da Siderúrgica, que agora anda por aí em forma de Gosma Cinzenta. Ele quer as gosmas contidas e cristais trincados para estudar o estrago.",
    steps: [
      { kind: "kill", target: "slag_slime", count: 15, label: "Gosmas Cinzentas" },
      { kind: "deliver", target: "lente_trincada", count: 3, label: "Cristais Trincados" },
    ],
    dialog: {
      offer: "Go ou NoGo? NoGo. A escória da Siderúrgica cobre a lente em cinquenta milissegundos e eu descarto frame atrás de frame. Derrube quinze Gosmas Cinzentas nas Cavernas e no Pântano e me traga três Cristais Trincados: quero ver onde o vidro cede.",
      accept: "A gosma queima. Não encare de perto, e não limpe a lente com a manga.",
      progress: "Quinze gosmas e três cristais. Enquanto isso, a câmera só vê laranja.",
      complete: "Go! Frame inspecionável! Em 26 decisões de arquitetura, uma deu certo. Tome este Elmo de Ferro Pintado: aqui, bom senso é equipamento de proteção.",
    },
    rewards: { xp: 6000, gold: 2000, items: [{ itemId: "capacete_obra", count: 1 }] },
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
    summary: "Tomé ouviu ecos estranhos vindos das Cavernas, cuja boca se abre no meio do Pântano Turvo. Morcegos demais, diz ele.",
    steps: [
      { kind: "explore", target: "Cavernas", count: 1, label: "Explorar as Cavernas" },
      { kind: "kill", target: "bat", count: 12, label: "Morcegos" },
    ],
    dialog: {
      // A única entrada das Cavernas é a gruta de pedra no Pântano Turvo (o texto antigo dizia "ao sul").
      offer: "Nas Cavernas os morcegos se multiplicaram. Espantam a caça inteira. A boca fica no Pântano Turvo: siga a estrada da vila para nordeste até a gruta de pedra no meio do brejo. Entre e derrube doze deles.",
      accept: "Leve tocha. E não grite, que eles vêm todos de uma vez.",
      progress: "Doze morcegos. E vá até as Cavernas, não adianta caçar na praça.",
      complete: "Silêncio, finalmente! A caça vai voltar. Este anel me serviu bem por anos; agora é seu.",
    },
    rewards: { xp: 3000, gold: 1200, items: [{ itemId: "ring_mente", count: 1 }] },
  }),
  q({
    id: "swamp_lich", name: "O Lich do Pântano", giver: "priest", minLevel: 22, requires: ["swamp_report"],
    summary: "A Sacerdotisa Liora sente uma presença morta no Pântano Turvo: um lich, um morto que se recusa a descansar.",
    // Ciclo 14: sem o passo "coletar a chave". A chave cai uma vez só para o grupo, e o passo "boss" já credita todos
    // os membros; com ela, um grupo de quatro precisava de quatro abates. Quem salvou o progresso no passo antigo fica
    // só com o índice 0 (o chefe), que já estava feito: a missão aparece pronta para entregar.
    steps: [{ kind: "boss", target: "swamp_lich", count: 1, label: "Lich do Pântano" }],
    dialog: {
      offer: "O Capitão me contou da névoa roxa. É um lich, viajante, um morto que se recusa a descansar. Derrote-o e volte para me contar. Não vá sozinho.",
      accept: "Que a luz te proteja. Reúna amigos: ele é mais forte do que parece.",
      progress: "O lich ainda caminha. Sinto sua presença daqui. Derrote-o e volte.",
      complete: "A névoa se desfez, senti daqui! Se ele deixou cair uma chave velha, guarde de lembrança: a Cripta nunca teve tranca que segurasse os mortos. Receba a bênção da luz.",
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
      // A Cripta só se entra pelo mausoléu das Ruínas de Kael (o texto antigo dizia "extremo sudeste").
      accept: "A entrada da Cripta é o mausoléu com porta de caveira nas Ruínas de Kael, ao norte. A luz vai contigo.",
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
    summary: "O Rei Goblin comanda os saqueadores das Ruínas de Kael. Derrote-o e volte ao Capitão.",
    // Ciclo 14: sem o passo "entregar a coroa" (mesmo motivo do Lich: a coroa cai uma vez para o grupo inteiro).
    steps: [{ kind: "boss", target: "goblin_king", count: 1, label: "Rei Goblin" }],
    dialog: {
      offer: "Os goblins têm um rei, e ele está nas profundezas das Ruínas de Kael. Acabe com ele. Leve os melhores guerreiros que conhecer.",
      accept: "Pela vila de Pedra Clara! Volte vivo, de preferência com uma boa história.",
      progress: "O Rei Goblin ainda reina. Volte quando ele cair.",
      complete: "O Rei Goblin caiu! Os bardos vão cantar seu nome por anos. A coroa? Pendure na parede de casa: na minha mesa só cabe relatório. Aceite isto em nome da vila.",
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
    // Ciclo 14: o texto prometia escudo ao jogador e a recompensa nunca foi escudo; os escudos são da guarda do posto.
    summary: "Os ferreiros da Fronteira precisam de escamas de dragão para forjar escudos para a guarda do posto.",
    steps: [
      { kind: "kill", target: "dragon", count: 25, label: "Dragões" },
      { kind: "deliver", target: "dragon_scale", count: 10, label: "Escamas de Dragão" },
    ],
    dialog: {
      offer: "A guarda do posto está defendendo a estrada com escudo de madeira, e escudo bom só se faz com escama de dragão. Mate vinte e cinco dragões no vale ao sul e me traga dez escamas para o ferreiro.",
      accept: "Fique de lado quando eles respirarem fundo. O fogo vem reto.",
      progress: "Vinte e cinco dragões e dez escamas. O ferreiro está esperando.",
      complete: "Escamas perfeitas! O ferreiro vai chorar de alegria, e a guarda vai ter escudo novo antes do inverno. Tome a sua parte.",
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
  // Ciclo 12 (GD-08): o 100–109 não tinha missão. Esta prepara o trono de Orshabaal (110) com o loot dos demônios.
  q({
    id: "selo_do_abismo", name: "O Selo do Abismo", giver: "frontier_priest", minLevel: 100, requires: ["abyss_gates"],
    summary: "Os portões do Abismo voltaram a rachar. O Irmão Tadeu quer forjar um selo com o que os próprios demônios carregam.",
    steps: [
      { kind: "kill", target: "demon", count: 20, label: "Demônios" },
      { kind: "deliver", target: "demon_horn", count: 10, label: "Chifres de Demônio" },
      { kind: "deliver", target: "demonic_essence", count: 5, label: "Essências Demoníacas" },
    ],
    dialog: {
      offer: "Os portões que você fechou estão rachando de novo. Um selo de verdade se faz com o que os demônios carregam: dez chifres e cinco essências. E vinte deles a menos no caminho, para eu ter paz enquanto trabalho.",
      accept: "Desça com o grupo. Os chifres caem fácil; as essências, só dos mais teimosos.",
      progress: "Vinte demônios, dez chifres e cinco essências. O selo não se forja sozinho.",
      complete: "O selo está pronto e brilha como brasa. Com ele, o trono de Orshabaal fica ao alcance de quem tiver coragem.",
    },
    rewards: { xp: 120000, gold: 25000, items: [{ itemId: "health_potion_large", count: 25 }, { itemId: "mana_potion_large", count: 25 }] },
  }),
  q({
    // Ciclo 14 (decisão do dono): o selo forjado na missão anterior é o que abre o caminho ao trono.
    id: "orshabaal_hunt", name: "O Senhor do Abismo", giver: "frontier_priest", minLevel: 110, requires: ["abyss_gates", "selo_do_abismo"],
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
  // Ciclo 16: os chefes de covil das quatro caves profundas (lateObjects14 no mapa). Dá para fazer em qualquer ordem; o
  // Shogun (lv 125) é o que segura a missão no fim de jogo.
  q({
    id: "quatro_covis", name: "Os Quatro Covis", giver: "frontier_scout", minLevel: 100,
    summary: "Cada cave profunda tem um dono no covil do fundo. A Batedora Iara quer os quatro derrubados para fechar o mapa.",
    steps: [
      { kind: "boss", target: "lair_mole_king", count: 1, label: "Rei Toupeira" },
      { kind: "boss", target: "lair_kraken", count: 1, label: "Kraken das Grutas" },
      { kind: "boss", target: "lair_flame", count: 1, label: "Chama Ancestral" },
      { kind: "boss", target: "lair_shogun", count: 1, label: "Shogun Abissal" },
    ],
    dialog: {
      offer: "Meu mapa das caves fundas tem quatro manchas escritas 'aqui mora alguém'. O Rei Toupeira nas Minas, o Kraken nas Grutas, a Chama Ancestral nas Catacumbas e o Shogun no Abismo Profundo. Derrube os quatro e eu troco as manchas pelo seu nome.",
      accept: "Cada covil fica no fim da cave, depois da galeria funda. O baú do covil só abre para quem estava no grupo que derrubou o dono, então ninguém fica de fora da luta. E leve um grupo: o Shogun não tem pressa nenhuma de morrer.",
      progress: "Ainda tem covil com dono no meu mapa. Quatro chefes, quatro covis. Três e meio não conta.",
      complete: "Quatro covis, quatro donos a menos! Vou ter que desenhar o mapa de novo, desta vez com o seu nome em cada sala. Daqui para a frente, você é o Caçador de Covis.",
    },
    rewards: { xp: 150000, gold: 40000, items: [{ itemId: "health_potion_large", count: 25 }, { itemId: "mana_potion_large", count: 25 }], unlock: "title:cacador_covis" },
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
      // Ciclo 14: o escudo é dos guerreiros do Jarl (a recompensa nunca foi escudo).
      offer: "Com o Yeti morto, o ninho dos dragões de gelo está aberto. Mate vinte e me traga dez escamas: os ferreiros do acampamento vão forjar para os meus guerreiros os escudos mais frios do mundo!",
      accept: "O ninho fica depois da caverna do Yeti. O sopro deles congela o sangue.",
      progress: "Vinte dragões de gelo e dez escamas, guerreiro.",
      complete: "Escamas lindas! Os escudos do norte vão aguentar qualquer sopro, e o norte nunca vai esquecer o seu nome. Tome.",
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
  // Ciclo 12 (GD-08): ponte entre os cães (95) e Ferumbras (120), na faixa 100–109 que não tinha missão.
  q({
    id: "marcha_dos_colossos", name: "A Marcha dos Colossos", giver: "sage_ignis", minLevel: 105, requires: ["hellhounds"],
    summary: "Colossos marcham pela Cidadela sob o vulcão. Mestre Ignis quer saber de que são feitos.",
    steps: [
      { kind: "kill", target: "juggernaut", count: 15, label: "Colossos" },
      { kind: "deliver", target: "juggernaut_plate", count: 5, label: "Placas de Colosso" },
    ],
    dialog: {
      offer: "Com os cães calados, a Cidadela ficou à vista, e lá dentro marcham os colossos. Derrube quinze e me traga cinco placas da couraça deles. Se eu entender o metal, entendo quem os forjou.",
      accept: "Eles são lentos, mas um golpe deles derruba muralha. Não fique na frente sem um escudo.",
      progress: "Quinze colossos e cinco placas. A Cidadela não vai se abrir sozinha.",
      complete: "Este metal... foi forjado com magia, não com fogo. Ferumbras está por trás disso, tenho certeza.",
    },
    rewards: { xp: 150000, gold: 30000, items: [{ itemId: "health_potion_large", count: 25 }, { itemId: "mana_potion_large", count: 25 }] },
  }),
  q({
    id: "ferumbras_end", name: "O Fim de Ferumbras", giver: "sage_ignis", minLevel: 120, requires: ["hellhounds"],
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
  // --- Malha da Ferrovia (25–55, ciclo 11) ------------------------------------------------------------------------
  // Região só de trem. NPCs por papel; da equipe, só apelidos já existentes (Pedrão, Julião, Iago), que continuam na
  // Oficina dos Engenhos: as missões que falam com eles mandam o jogador de volta pelo trem e pela carroça. Anedotas
  // reais da inspeção (legenda S/N trocada, nove de dez iluminadores, VAG-TEMP, Enter duplo), cliente disfarçado.
  q({
    id: "engate_rapido", name: "Primeira Passagem", giver: "chefe_estacao_malha", minLevel: 25,
    summary: "A primeira passagem do mês não pode atrasar, mas as Cobras Listradas tomaram conta do Pátio de Manobra e soltaram os engates. O Chefe da Estação quer o pátio livre e os pinos de volta.",
    steps: [
      { kind: "explore", target: "Pátio de Manobra", count: 1, label: "Ir ao Pátio de Manobra" },
      { kind: "kill", target: "engate_solto", count: 12, label: "Cobras Listradas" },
      { kind: "deliver", target: "pino_de_engate", count: 5, label: "Pinos de Ferro" },
    ],
    dialog: {
      offer: "Recém-chegado? Ótimo, porque a primeira passagem do mês sai hoje e o Pátio de Manobra virou bagunça: as Cobras Listradas se enrolaram nos engates, o tranco soltou tudo e os pinos sumiram. Derrube doze cobras e me traga cinco Pinos de Ferro, que eu remonto a composição.",
      accept: "O pátio fica logo depois da plataforma. Olhe para os dois lados antes de cruzar a linha. Sempre.",
      progress: "Doze cobras e cinco pinos. Sem pino, o vagão vai para um lado e a locomotiva para o outro.",
      complete: "Pátio livre, composição engatada, primeira passagem no horário! Tome, para a próxima manobra. E bem-vindo à Malha.",
    },
    rewards: { xp: 6000, gold: 1500, items: [{ itemId: "health_potion_medium", count: 10 }] },
  }),
  q({
    id: "go_nogo", name: "A Legenda Trocada", giver: "inspetora_portal", minLevel: 28, requires: ["engate_rapido"],
    summary: "Alguém trocou o S pelo N na legenda do Portal: quem apertava S para reprovar aprovava e avançava. Antes de liberar o pórtico, a Inspetora de Rodas quer o CLP conferido e o parecer do Pedrão.",
    steps: [
      { kind: "explore", target: "Portal de Inspeção", count: 1, label: "Conhecer o Portal de Inspeção" },
      { kind: "talk", target: "operador_abrigo", count: 1, label: "Conferir o CLP no abrigo" },
      { kind: "talk", target: "pedrao", count: 1, label: "Pedir o parecer do Pedrão" },
    ],
    dialog: {
      offer: "Go ou NoGo? Hoje, nem um nem outro: alguém trocou o S pelo N na legenda, e quem apertava S para reprovar aprovava a roda e avançava. Vá ao pórtico, peça ao Técnico do CLP para conferir o abrigo e leve a pergunta ao Pedrão, lá na Oficina dos Engenhos. Ele desenhou as câmeras; ele diz se a luz está certa.",
      accept: "Quatro câmeras, quatro iluminadores. Se algum piscar, anote. Se todos piscarem, corra.",
      progress: "Ainda sem o CLP conferido e sem o parecer do Pedrão. O pórtico continua em NoGo.",
      complete: "CLP conferido, legenda desvirada e o Pedrão disse 'Go'. Agora S é sim e N é não. Tome, pelo trabalho de campo.",
    },
    rewards: { xp: 4000, gold: 1200, items: [{ itemId: "mana_potion_medium", count: 10 }] },
  }),
  q({
    id: "sapata_gasta", name: "Calo na Roda", giver: "mecanico_vagao", minLevel: 30, requires: ["engate_rapido"],
    summary: "A sapata travou, a roda arrastou no trilho e as Toupeiras Douradas cavaram o Pátio de Manobra inteiro. O Engenheiro do Dark-field quer as toupeiras paradas e as placas de pedra para a análise de desgaste.",
    // Ciclo 14: as toupeiras nascem no Pátio de Manobra, não na Oficina de Vagões (onde o próprio Engenheiro fica, o que
    // tornava o "explorar" automático). Quem já cumpriu o passo antigo mantém o progresso (mesmo índice).
    steps: [
      { kind: "explore", target: "Pátio de Manobra", count: 1, label: "Ir ao Pátio de Manobra" },
      { kind: "kill", target: "sapata_gasta", count: 15, label: "Toupeiras Douradas" },
      { kind: "deliver", target: "pastilha_de_sapata", count: 6, label: "Placas de Pedra" },
    ],
    dialog: {
      offer: "Calo é roda que arrastou: a sapata travou, a roda não girou e o trilho comeu um pedaço dela. Como se não bastasse, as Toupeiras Douradas cavaram o Pátio de Manobra e os trilhos afundaram. Volte ao pátio, pare quinze e me traga seis Placas de Pedra do piso: quero medir o desgaste antes de pedir peça nova.",
      accept: "São lentos, mas duros. Não fique na frente quando um travar.",
      progress: "Quinze toupeiras e seis placas. Enquanto isso, o vagão da linha 3 desce a rampa sozinho.",
      complete: "Desgaste medido: tudo fora de tolerância, como eu disse. Vista este Gibão Reforçado. Na via, quem não se protege não volta.",
    },
    rewards: { xp: 9000, gold: 2500, items: [{ itemId: "colete_refletivo", count: 1 }] },
  }),
  q({
    id: "nove_de_dez", name: "Nove de Dez", giver: "operador_abrigo", minLevel: 34, requires: ["go_nogo"],
    summary: "Numa visita de campo, nove de dez iluminadores do pórtico chegaram queimados, e a luz que sobrou virou Lanterna Assombrada. O Técnico do CLP quer as lanternas apagadas, as brasas contadas e cristais novos na mão da Inspetora de Rodas.",
    steps: [
      { kind: "kill", target: "iluminador_rebelde", count: 12, label: "Lanternas Assombradas" },
      { kind: "deliver", target: "iluminador_queimado", count: 9, label: "Brasas Apagadas" },
      { kind: "deliver", target: "lente_industrial", count: 4, npc: "inspetora_portal", label: "Cristais Azuis para a Inspetora" },
    ],
    dialog: {
      offer: "Nove de dez. Nove! Chegaram queimados, e o décimo acendeu tanto que virou assombração e saiu andando. Apague doze Lanternas Assombradas, me traga nove Brasas Apagadas para a garantia e leve quatro Cristais Azuis inteiros para a Inspetora de Rodas, um por câmera.",
      accept: "Cuidado com o clarão: um piscar e você vê estrela até a próxima passagem.",
      progress: "Doze lanternas, nove brasas e quatro cristais para a Inspetora. A garantia não espera.",
      complete: "Garantia aberta, pórtico aceso, lentes trocadas. Tome este Elmo com Lampião: para o abrigo, onde a luz é sempre a última a chegar.",
    },
    rewards: { xp: 12000, gold: 3000, items: [{ itemId: "capacete_lanterna", count: 1 }] },
  }),
  q({
    id: "dark_field", name: "Dark-field", giver: "mecanico_vagao", minLevel: 38, requires: ["nove_de_dez"],
    summary: "Com luz rasante, a trinca no disco aparece; sem ela, o frame é descartado, e os descartados viraram Espectros Errantes. O Engenheiro do Dark-field quer os espectros pegos, os pergaminhos na mesa e o laudo levado à Inspetora de Rodas.",
    steps: [
      { kind: "kill", target: "frame_descartado", count: 12, label: "Espectros Errantes" },
      { kind: "deliver", target: "frame_corrompido", count: 4, label: "Pergaminhos Borrados" },
      { kind: "talk", target: "inspetora_portal", count: 1, label: "Levar o laudo à Inspetora" },
    ],
    dialog: {
      offer: "Dark-field: luz rasante, quase de lado, e a trinca no disco salta na imagem. O problema é que o gravador estoura o backlog no começo da passagem e descarta os frames antes de eu ver, e o que é descartado aqui vira Espectro Errante. Pegue doze antes que sumam, me traga quatro Pergaminhos Borrados que eles carregam e leve o laudo à Inspetora de Rodas.",
      accept: "Eles fogem quando enfraquecem. Feche o caminho; espectro que escapa vira 'sensor 1 missed 2 trigger(s)'.",
      progress: "Doze espectros, quatro pergaminhos e a Inspetora avisada. Sem isso, a roda passa como 'sem defeito'.",
      complete: "Trinca no disco, confirmada em dark-field e no laudo da Inspetora. Roda reprovada com o botão certo, desta vez. Tome as Calças de Couro Batido: aguentam cascalho e reunião de obra.",
    },
    rewards: { xp: 15000, gold: 4000, items: [{ itemId: "calca_brim_refletiva", count: 1 }] },
  }),
  q({
    id: "passagem_duplicada", name: "Tag Perdida", giver: "operador_abrigo", minLevel: 40, requires: ["nove_de_dez"],
    summary: "O leitor de tags não leu um vagão, o sistema o chamou de VAG-TEMP-3 e associou a tag à passagem seguinte: agora o mesmo trem aparece duas vezes. O Técnico do CLP quer a contagem conferida, os registros na mão e o VAG-TEMP-3 achado na via.",
    steps: [
      { kind: "talk", target: "chefe_estacao_malha", count: 1, label: "Conferir a contagem na Estação" },
      { kind: "talk", target: "juliao", count: 1, label: "Perguntar ao Julião sobre o leitor" },
      { kind: "talk", target: "iago", count: 1, label: "Pedir os registros ao Iago" },
      { kind: "explore", target: "Via Permanente", count: 1, label: "Achar o VAG-TEMP-3 na Via Permanente" },
    ],
    dialog: {
      offer: "Um vagão passou sem tag lida, virou VAG-TEMP-3, e a tag que faltava foi parar na passagem seguinte. Resultado: um trem, duas passagens. Confira a contagem com o Chefe da Estação, pergunte ao Julião dos Embarcados se o leitor de tags andou aceitando leitura inválida, peça os registros ao Iago do Cofre e ache o VAG-TEMP-3 na Via Permanente.",
      accept: "Julião e Iago ficam na Oficina dos Engenhos. Trem até a Vila, carroça até a Oficina. Bom passeio.",
      progress: "Faltam respostas. Estação, Julião, Iago e o VAG-TEMP-3. Até lá, a passagem fica duplicada.",
      complete: "Leitura inválida aceita e grudada na passagem errada, está nos registros do Iago. VAG-TEMP-3 achado, tag devolvida, passagem duplicada apagada. Tome, e confira a tag antes do Enter.",
    },
    rewards: { xp: 12000, gold: 3000, items: [{ itemId: "mana_potion_large", count: 10 }, { itemId: "health_potion_large", count: 5 }] },
  }),
  q({
    id: "rodeiro_trincado", name: "Trinca no Disco", giver: "mecanico_vagao", minLevel: 45, requires: ["sapata_gasta", "dark_field"],
    summary: "Na Oficina de Vagões, Olhos Sangrentos e Feras das Brasas tomaram o galpão das rodas reprovadas. O Engenheiro do Dark-field quer a oficina de volta e as engrenagens salvas.",
    steps: [
      { kind: "kill", target: "rodeiro_trincado", count: 15, label: "Olhos Sangrentos" },
      { kind: "kill", target: "truque_desalinhado", count: 10, label: "Feras das Brasas" },
      { kind: "deliver", target: "rolamento_de_rodeiro", count: 5, label: "Engrenagens de Prata" },
    ],
    dialog: {
      offer: "Vermelho é trinca no disco; laranja, aro fraturado. Na tela são só cores. Aqui na Oficina de Vagões, as rodas reprovadas atraíram Olhos Sangrentos e Feras das Brasas. Derrube quinze olhos e dez feras e me traga cinco Engrenagens de Prata: o rolamento estava bom, o disco é que não.",
      accept: "Dois truques por vagão, dois eixos por truque. Conte antes de entrar, e conte de novo na saída.",
      progress: "Olhos, feras e engrenagens. A oficina continua parada.",
      complete: "Galpão limpo, engrenagens salvas. Calce estas Botas do Andarilho: na Oficina, quem pisa em engrenagem solta aprende rápido.",
    },
    rewards: { xp: 22000, gold: 6000, items: [{ itemId: "botina_seguranca", count: 1 }] },
  }),
  q({
    id: "revisao_na_via", name: "Revisão na Via", giver: "inspetora_portal", minLevel: 46, requires: ["rodeiro_trincado"],
    summary: "Revisão na via: enfrentar de perto um de cada bicho da Malha e, enfim, derrubar o Ciclope de Pedra que trava a fila da Oficina de Vagões.",
    steps: [
      { kind: "kill", target: "rodeiro_trincado", count: 1, label: "Olho Sangrento" },
      { kind: "kill", target: "truque_desalinhado", count: 1, label: "Fera das Brasas" },
      { kind: "kill", target: "sapata_gasta", count: 1, label: "Toupeira Dourada" },
      { kind: "kill", target: "engate_solto", count: 1, label: "Cobra Listrada" },
      { kind: "boss", target: "vagao_nao_inspecionavel", count: 1, label: "Ciclope de Pedra" },
    ],
    dialog: {
      offer: "A tela diz 'com defeito'; a revisão na via diz se é verdade. Derrube de perto um de cada: Olho Sangrento, Fera das Brasas, Toupeira Dourada e Cobra Listrada. E pare o Ciclope de Pedra no fundo da Oficina de Vagões: ele senta no vagão que não tem foto de roda, e sem esse vagão a passagem nunca encerra. Leve gente: ele chama as toupeiras.",
      accept: "Olho, fera, toupeira, cobra. Se aparecer uma quinta coisa, me chame, porque isso não existe.",
      progress: "Um de cada bicho e o Ciclope no chão. A revisão não fecha pela metade.",
      complete: "Quarteto conferido, Ciclope no chão e o vagão, finalmente, inspecionado. Tudo com defeito, mas inspecionado! Agora só falta o trem encerrar.",
    },
    rewards: { xp: 20000, gold: 5000, items: [{ itemId: "health_potion_large", count: 10 }, { itemId: "mana_potion_large", count: 10 }] },
  }),
  q({
    id: "o_tunel", name: "O Túnel", giver: "maquinista_aposentado", minLevel: 48, requires: ["passagem_duplicada"],
    summary: "O Maquinista jura que o lastro do Túnel da Serra está andando. Ele quer alguém lá dentro, as Ratazanas Negras contadas e cascalho de prova.",
    steps: [
      { kind: "explore", target: "Túnel da Serra", count: 1, label: "Entrar no Túnel da Serra" },
      { kind: "kill", target: "rato_de_lastro", count: 20, label: "Ratazanas Negras" },
      { kind: "deliver", target: "brita_de_lastro", count: 10, label: "Cascalho" },
    ],
    dialog: {
      offer: "Lastro bom é lastro que não anda. O do Túnel da Serra anda, e de bando: são as Ratazanas Negras carregando a brita. Entre lá, derrube vinte e me traga dez punhados de Cascalho, que eu quero ver de perto o que está comendo o meu lastro.",
      accept: "Lá dentro é escuro, e uma ratazana chama as outras. Leve luz e alguém para segurar a lanterna.",
      progress: "Vinte ratazanas e dez punhados de cascalho. E se ouvir um rugido, saia do trilho.",
      complete: "Roído por dentro! Não é ratazana comum, é coisa do Tirano da Serra. Tome as poções: você vai precisar delas na quarta.",
    },
    rewards: { xp: 24000, gold: 6000, items: [{ itemId: "health_potion_large", count: 15 }] },
  }),
  q({
    id: "locomotiva_fantasma", name: "O Trem Que Nunca Encerra", giver: "maquinista_aposentado", minLevel: 52, requires: ["o_tunel", "revisao_na_via"],
    summary: "Toda quarta, às cinco da tarde, o Tirano da Serra desce ao Túnel bem na hora da composição de 1.124 eixos, a locomotiva fica sem eixo lido e a passagem nunca encerra. O Maquinista quer que ele pare de vez.",
    steps: [
      { kind: "boss", target: "locomotiva_fantasma", count: 1, label: "Tirano da Serra" },
      { kind: "talk", target: "chefe_estacao_malha", count: 1, label: "Avisar a Estação" },
    ],
    dialog: {
      offer: "Quarenta anos de cabine e eu nunca vi aquele trem encerrar. A locomotiva não tem eixo lido, então todo vagão atrás dela cai na posição errada, a roda sem imagem não fecha, e a passagem fica aberta para sempre. Toda quarta, às cinco, o Tirano da Serra desce ao túnel e fica rugindo em cima da linha. Junte um grupo, derrube o Tirano e avise o Chefe da Estação para fechar a passagem.",
      accept: "Quando ouvir o rugido, é ele. Fique fora da frente do bafo e não deixe as ratazanas te cercarem.",
      progress: "O Tirano ainda ruge, e a passagem continua aberta. A Estação ainda não sabe.",
      complete: "Encerrou! Passagem fechada, eixos contados, quarenta anos esperando por isso. Fique com este Anel das Engrenagens e com o título: daqui para a frente, você é o Maquinista.",
    },
    rewards: { xp: 40000, gold: 12000, items: [{ itemId: "anel_do_rodeiro", count: 1 }], unlock: "title:maquinista" },
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

/**
 * Faixas de level → monstros possíveis para as recompensas. Desde o ciclo 14 a lista do dia é gravada com o id do
 * monstro (systems/quests.ts), então mudar uma faixa não troca o alvo de quem já tem recompensa aceita. Ainda assim,
 * troque no mesmo lugar (mesma posição, mesmo tamanho): o sorteio de quem gravou antes do ciclo 14 depende disso.
 * Todo alvo precisa ser caçável no level mínimo da faixa: level ≤ mínimo + bountyLevelMargin e spawn fora de área de
 * missão (teste em data/quests.test.ts).
 */
export const BOUNTY_BANDS: { minLevel: number; monsters: string[] }[] = [
  // Ciclo 14: o Rato Cinzento (lv 3) no lugar do Lobo (lv 8), que pedia lobos a quem acabou de nascer.
  { minLevel: 1, monsters: ["rat", "slime", "bee", "datacenter_rat"] },
  { minLevel: 10, monsters: ["wolf", "snake", "spider", "bat", "mine_larva"] },
  { minLevel: 18, monsters: ["spider", "bat", "skeleton", "goblin", "mine_mole"] },
  { minLevel: 26, monsters: ["skeleton", "goblin", "ghost", "lizardman"] },
  { minLevel: 34, monsters: ["ghost", "lizardman", "flame_spirit", "goblin"] },
  // Faixas acrescentadas no fim (as antigas não mudam: a geração do dia depende do índice da faixa).
  { minLevel: 42, monsters: ["orc_warrior", "orc_shaman", "crocodile", "pirate_buccaneer", "carniphila", "kappa"] },
  { minLevel: 52, monsters: ["minotaur", "minotaur_mage", "cyclops", "winter_wolf", "barbarian", "cave_octopus"] },
  { minLevel: 62, monsters: ["bonelord", "black_knight", "ice_witch", "necromancer", "flame_skull"] },
  // Ciclo 14: o Crânio Flamejante no lugar do Dragão de Gelo, que só aparece depois da missão do Yeti.
  { minLevel: 72, monsters: ["dragon", "hero", "flame_skull", "dragon_lord", "red_lantern"] },
  { minLevel: 88, monsters: ["behemoth", "magma_elemental", "hellhound", "demon"] },
  // Ciclo 13: faixa do Abismo Profundo (o 88+ ficaria pesado demais com os monstros de 112–120).
  { minLevel: 106, monsters: ["juggernaut", "abyss_tengu", "abyss_samurai", "demon"] },
];

export function bountyBand(level: number): number {
  let b = 0;
  for (let i = 0; i < BOUNTY_BANDS.length; i++) if (level >= BOUNTY_BANDS[i]!.minLevel) b = i;
  return b;
}

/**
 * Quanto o monstro (ou a fonte do material da encomenda) pode passar do level mínimo da faixa. No começo do jogo a
 * diferença pesa mais (lobo lv 8 contra personagem lv 1), então a margem é no máximo o próprio level mínimo + 4.
 */
export function bountyLevelMargin(minLevel: number): number {
  return Math.min(14, minLevel + 4);
}

/** "Mate 20 Lobos" (nome do monstro no plural). */
export function bountyTitle(d: { monster: string; count: number }): string {
  const name = monsterDef(d.monster)?.name ?? d.monster;
  return `Mate ${d.count} ${pluralPt(name)}`;
}

/** Plurais que a regra não acerta (palavra inteira). */
const PLURAL_IRREGULAR: Record<string, string> = { "Cão": "Cães", "Capitão": "Capitães" };

function pluralWord(w: string): string {
  if (Object.hasOwn(PLURAL_IRREGULAR, w)) return PLURAL_IRREGULAR[w]!;
  if (/ão$/.test(w)) return w.replace(/ão$/, "ões");
  if (/m$/.test(w)) return w.replace(/m$/, "ns");
  if (/[rsz]$/.test(w)) return w + "es";
  if (/l$/.test(w)) return w.replace(/l$/, "is");
  return w + "s";
}

/**
 * Plural em PT-BR de nome de monstro: o substantivo e os adjetivos que vêm logo depois variam; a partir do primeiro
 * conectivo em minúscula ("de", "do"...) nada muda. Em nome composto com hífen só varia a primeira parte.
 * "Lobo" → "Lobos", "Cão Infernal" → "Cães Infernais", "Samurai Rubro" → "Samurais Rubros",
 * "Homem-Lagarto" → "Homens-Lagarto", "Espírito de Chama" → "Espíritos de Chama".
 * Feito para os monstros comuns do Quadro; nome próprio de chefe ("Rei Goblin") não passa por aqui.
 */
export function pluralPt(name: string): string {
  const parts = name.split(" ");
  for (let i = 0; i < parts.length; i++) {
    const w = parts[i]!;
    if (!/^\p{Lu}/u.test(w)) break;
    const h = w.split("-");
    h[0] = pluralWord(h[0]!);
    parts[i] = h.join("-");
    // Depois de um composto ("Homem-Lagarto") o que vem é complemento, não adjetivo.
    if (h.length > 1) break;
  }
  return parts.join(" ");
}


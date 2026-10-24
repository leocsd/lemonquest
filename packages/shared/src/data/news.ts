// Novidades mostradas ao jogador (tela "Novidades"): a mais nova primeiro. `id` muda a cada entrada nova; quem já viu o
// id mais recente não vê a tela de novo. Texto para jogador (sem jargão), uma linha por item.

export interface NewsEntry {
  /** Único e estável (usa a data da versão). */
  id: string;
  /** "15 de outubro" etc. */
  date: string;
  title: string;
  items: string[];
}

export const NEWS: readonly NewsEntry[] = [
  {
    id: "2026-10-24c",
    date: "24 de outubro (noite)",
    title: "Ajustes na Malha",
    items: [
      "Bichos e itens da Oficina e da Malha com nomes de sempre: Cobra Listrada, Toupeira Dourada, Ratazana Negra, Ensopado do Viajante e companhia. O que você já tem continua igual.",
      "Chefes da Malha: o Ciclope de Pedra, na Oficina de Vagões, e o Tirano da Serra, no Apito da Locomotiva (quarta, 17h).",
      "Trem de volta sem andar até a Estação: o Maquinista, na entrada do Túnel, e o Agente da Parada, perto do Portal e da Oficina, levam à Vila ou à Estação Central.",
    ],
  },
  {
    id: "2026-10-24b",
    date: "24 de outubro (tarde)",
    title: "Malha da Ferrovia e o ClickUp no jogo",
    items: [
      "Região nova para lv 25–60: pegue o trem com o Chefe da Estação, ao lado da carroça do Bastião, até a Estação Central da Malha.",
      "Pátio de Manobra, Portal de Inspeção, Oficina de Vagões, Via Permanente e o Túnel da Serra. Cuidado com o Olho Sangrento, a Fera das Brasas, a Toupeira Dourada e a Cobra Listrada.",
      "Dez missões novas, de \"Primeira Passagem\" a \"O Trem Que Nunca Encerra\", e o Tirano da Serra, o chefe que aparece no Apito da Locomotiva (quarta, 17h).",
      "O jogo agora lê o ClickUp: compra entregue vira \"Chegou!\" com caixa de encomenda na Estação, e o Painel da Obra mostra o ritmo das sprints.",
      "Quando o time passa da média da semana, começa a Sprint Fechada: XP ×1,25 por uma hora, somado ao evento que estiver valendo.",
      "Vincule seu ClickUp no Painel da Obra (aba Na obra, com seu token pessoal; o jogo não guarda o token): tarefas fechadas viram conquistas e títulos.",
    ],
  },
  {
    id: "2026-10-24a",
    date: "24 de outubro",
    title: "Compras em lote",
    items: [
      "Na loja, digite a quantidade ou use −/+ (Shift: de 10 em 10), o atalho 10 e o Máx: o maior lote que cabe no seu ouro e na mochila (até 100).",
      "Enter no campo de quantidade já compra. Vale para poções, comida e também para equipamentos.",
    ],
  },
  {
    id: "2026-10-23b",
    date: "23 de outubro (noite)",
    title: "A Oficina dos Engenhos abriu",
    items: [
      "Zona nova ao sul da Vila: entre pela porta escondida no canto nordeste da paliçada ou pegue a carroça do Bastião (destino \"Oficina dos Engenhos\").",
      "Cinco missões novas (lv 5 a 22) com a turma da bancada: Julião, Luan, Bianca, Iago e Pedrão. E o Capitão quer saber como está o clima.",
      "A Geladeira vende marmita e café; Guilherme, o Boss, guarda seus itens e vende seguro contra perda de XP; Gabriel tem fichas da Rifa do Sextou.",
      "Monstros novos pelo mundo: Rato Cinzento (noroeste da Floresta), Gosma Azul (estrada dos lobos) e Gosma Cinzenta (Pântano e Cavernas).",
      "Doze conquistas e seis títulos novos, de \"Compras Onfire\" a \"o Superposto\".",
      "Eventos: Sextou! (sexta 17h, XP ×1,5 e loot +25%) e Reunião Geral (segunda 9h, loot +50%).",
    ],
  },
  {
    id: "2026-10-23a",
    date: "23 de outubro",
    title: "Grupo compensa, magos com mana e teclas novas",
    items: [
      "Grupo: +35% de XP por membro extra (era +20%) e mais +20% com três ou mais vocações diferentes.",
      "Poções de mana recuperam 120 / 350 / 900 (eram 50 / 150 / 400) pelo mesmo preço.",
      "Skills sobem mais rápido no fim: melee 60 é questão de dias, não de anos. O treino offline rende mais.",
      "Posturas de combate agora em F2 / F3 / F4 (F5 volta a atualizar a página). Esc fecha sempre a janela de cima.",
      "PvP: só dá para atacar quem está na sua faixa de level (regra dos 2/3), a não ser que ele tenha caveira ou ataque você. O /quem só mostra onde estão amigos, grupo e quem está em zona de proteção.",
      "Bênção mais barata (50 × level). Caçada de Terça: XP em dobro das 13h às 14h. Campeão da Semana: título para quem liderar o ranking semanal.",
      "Vender é só pelo botão da loja; largar item raro no chão pede confirmação; o chat não puxa para o fim enquanto você lê.",
    ],
  },
  {
    id: "2026-10-22f",
    date: "22 de outubro (noite)",
    title: "Para onde vai o ouro",
    items: [
      "Bênção: Liora (Vila), Irmão Tadeu (Posto da Fronteira) ou Irmã Celeste (Porto) zeram a perda de XP da sua próxima morte.",
      "Encantamento: Dona Marta põe 1 efeito ativo no seu equipamento por 5 mil de ouro e 5 materiais.",
      "Tingimento de roupa: na janela de roupas (O), 8 tons por conta, 8 mil cada.",
      "Cassino: Hanna, no Posto da Fronteira, vende a ficha por 1 mil. Sorte é sorte.",
      "Encomenda semanal: a aba \"Encomenda\" do Quadro de Recompensas paga pelos materiais pedidos na semana.",
    ],
  },
  {
    id: "2026-10-22e",
    date: "22 de outubro (noite)",
    title: "Caves cheias e monstros mais fortes",
    items: [
      "As caves têm bem mais monstros, com bandos grandes (bom para magia em área) e grupos mistos com conjuradores que curam os aliados.",
      "Monstros do level 20 para cima batem bem mais forte, e a poção de vida agora espera 2 segundos entre um gole e outro.",
      "Elites: alguns monstros nascem com o nome dourado. Mais fortes, mas dão o triplo de XP e mais loot.",
      "Lobos, orcs, minotauros, piratas e outros chamam o bando quando apanham. Alguns fogem com pouca vida.",
      "O Coliseu ficou muito mais difícil: sozinho não passa do meio, e completar as 60 ondas pede um grupo forte.",
    ],
  },
  {
    id: "2026-10-22d",
    date: "22 de outubro (noite)",
    title: "Famílias de magia",
    items: [
      "Família de magias (◆): uma tecla para várias magias do mesmo tipo. Sai a mais forte que estiver pronta e no alcance.",
      "Quer a barra nova? Aperte H e clique em \"Recomendado\": as magias parecidas viram uma tecla só.",
      "Magias que o seu level ainda não libera não ocupam mais a barra; quando liberar, ela entra sozinha numa tecla livre.",
      "Na barra, a magia de alvo fica avermelhada quando o alvo está longe e apagada sem alvo.",
    ],
  },
  {
    id: "2026-10-22c",
    date: "22 de outubro (noite)",
    title: "Chefes no almoço, /quem e balanço",
    items: [
      "Chefes no almoço, das 12h15 às 13h: Lich (segunda), Rei Goblin (terça), Yeti (quinta) e Demodras (sexta).",
      "Fim de semana: Ferumbras no domingo às 15h e Orshabaal no sábado às 21h (o único chefe da noite).",
      "/quem mostra quem está online, o level, a classe e onde está; \"✓ grupo\" marca quem pode caçar com você dividindo XP.",
      "A Aniquilação agora aceita de 2 a 4 aventureiros: com menos gente, menos demônios (2 → 3, 3 → 5, 4 → 6). Quem puxa a alavanca fica na placa ao lado dela.",
      "Os estágios de XP começam no level 40: subir do 40 em diante leva mais tempo (missões continuam com XP cheia).",
      "A skill Escudo agora dá armadura com escudo equipado e treina com golpes recebidos de monstros à sua altura.",
      "Coliseu: ouro das ondas menor e só para quem também ganha XP. Golpe Frontal acerta 3×3 à frente; Cura em Grupo cura mais.",
      "Selva e Piratas pagam mais ouro, e os materiais deles valem mais na loja.",
      "Troca mais segura: confirmar só vale para a oferta que você viu, e o ouro digitado não se perde.",
      "\"Vender tudo\" não vende mais itens raros ou melhores.",
    ],
  },
  {
    id: "2026-10-22b",
    date: "22 de outubro (à tarde)",
    title: "Olhar e baús com a classe",
    items: [
      "Clique com os dois botões do mouse juntos (ou Shift+clique) para olhar: monstros, jogadores, NPCs, baús e itens do chão.",
      "Os baús de quest mostram em cima para qual classe é o prêmio (ou \"Todas\").",
    ],
  },
  {
    id: "2026-10-22",
    date: "22 de outubro",
    title: "Coliseu até a onda 60",
    items: [
      "O Coliseu agora tem 60 ondas, com orcs, ciclopes, dragões, demônios e chefes como Yeti, Demodras e Orshabaal.",
      "Conquista nova: Imperador do Coliseu (vença a onda 60).",
      "Na loja, \"Vender tudo\" vende de uma vez o que o NPC compra (e \"Todos\" vende a pilha inteira).",
      "Os avisos do topo da tela não ficam mais uns por cima dos outros.",
    ],
  },
  {
    id: "2026-10-21e",
    date: "21 de outubro (noite)",
    title: "Loot do grupo no chão",
    items: [
      "Em grupo, o loot dos monstros cai no chão onde o monstro morreu.",
      "O que está no chão é de qualquer um: dá para pegar na hora, sem esperar.",
      "Arraste um item do chão para outro tile para mudá-lo de lugar (Shift numa pilha escolhe quanto).",
    ],
  },
  {
    id: "2026-10-21d",
    date: "21 de outubro (mais tarde)",
    title: "Mochila maior com o level",
    items: [
      "A mochila agora cresce com você: 20 espaços no level 1 e mais 1 a cada 5 levels, até 40.",
      "Quem já tem level alto ganha os espaços na hora, ao entrar.",
      "Barras de rolagem mais discretas em todas as janelas.",
    ],
  },
  {
    id: "2026-10-21c",
    date: "21 de outubro (à noite)",
    title: "Atalhos de magia e magias novas",
    items: [
      "Aperte H (ou ⚙ no fim da barra) para escolher a tecla de cada magia: até 12 atalhos, também com Shift. Fica salvo no seu personagem.",
      "Arrastar uma magia na barra para cima de outra troca as duas de tecla.",
      "16 magias novas do lv 35 ao 90, quatro por vocação: ondas de fogo e gelo, Morte Súbita, tempestades, Chuva de Estrelas...",
      "Cavaleiros ganham a Fúria (utito tempo): +25% de dano por 10 segundos.",
      "Todas as magias da vocação já vêm na barra: 1–0 e, para quem tem 11 ou 12, C e F. Troque como quiser no painel (H).",
    ],
  },
  {
    id: "2026-10-21b",
    date: "21 de outubro (à tarde)",
    title: "Coliseu mais rápido",
    items: [
      "Acabou a espera entre as ondas: venceu uma, a próxima vem 3 segundos depois.",
      "O vendedor do Coliseu abre só depois das ondas de chefe (5, 10, 15...), com tempo para comprar e se curar.",
      "Botão Sair na barra do Coliseu: dá para sair a qualquer momento, ficando com o que já ganhou.",
    ],
  },
  {
    id: "2026-10-21",
    date: "21 de outubro",
    title: "Monstros mais espertos",
    items: [
      "Dragões cospem fogo, ciclopes e behemoths dão pisões, demônios fazem chover fogo e bruxas do gelo deixam você lento.",
      "Golpes fortes avisam antes: o chão pisca na cor do elemento. Saia da área a tempo e não leva o dano!",
      "Alguns chefes chamam ajudantes (que somem quando o chefe cai e não dão XP) e outros se curam quando estão quase mortos.",
      "Estágios de XP: a partir do lv 60 caçar dá 60% da XP, do 80 dá 40% e do 100 dá 30%. Missões continuam dando tudo.",
      "PvP: sair do jogo logo depois de atacar alguém não apaga mais a caveira branca, e o personagem fica no mundo até o bloqueio acabar.",
    ],
  },
  {
    id: "2026-10-20",
    date: "20 de outubro",
    title: "Costa Esmeralda e quests do jeito do Tibia",
    items: [
      "Mapa novo a leste das Terras Selvagens: Ilha Gelada, Selva de Banuta, Vulcão de Goroma e Porto Esperança (zona protegida).",
      "Chega de carroça (Vila ou Fronteira) ou pelas três trilhas novas na borda leste das Terras Selvagens.",
      "Hunts para todo nível: macacos e tarântulas (lv 25+), piratas (lv 30+), bárbaros e bruxas do gelo (lv 50+), heróis (lv 65+) e cães infernais (lv 95+).",
      "Masmorras: Caverna dos Piratas, Templo de Banuta, Caverna do Yeti, Caverna dos Heróis e a Cidadela de Ferumbras.",
      "Quests de baú: cada personagem abre uma vez, e em alguns você escolhe um entre vários prêmios. Portas de quest pedem level ou missão.",
      "A Aniquilação: quatro aventureiros de lv 100 nas placas, alguém puxa a alavanca... e boa sorte com os demônios!",
      "25 missões novas com NPCs, chefes (Barba-Ruiva, Rei Kongra, Yeti, Ferumbras) e títulos novos.",
    ],
  },
  {
    id: "2026-10-17b",
    date: "17 de outubro (à tarde)",
    title: "Terras Selvagens: o mapa dobrou de tamanho",
    items: [
      "Passe pelas trilhas a leste das Ruínas ou do Pântano e chegue às Terras Selvagens, a nova área de fim de jogo (lv 40+).",
      "Hunts clássicas: Fortaleza Orc, Labirinto dos Minotauros, Monte Ciclope, Cemitério dos Olhos, Forte Negro e Vale dos Dragões.",
      "Lá embaixo, o Abismo: behemoths, demônios e o temido Orshabaal. Só com grupo!",
      "Chefes novos: Raposa Chifruda (no Labirinto), Demodras (terça 20h) e Orshabaal (sábado 21h).",
      "Posto da Fronteira: vila protegida no meio das Terras, com loja, depósito e uma batedora que indica as hunts.",
      "Equipamentos novos de lv 50 e 70, como Espada de Fogo, Armadura de Placas Mágica e as famosas Botas da Pressa.",
    ],
  },
  {
    id: "2026-10-17",
    date: "17 de outubro",
    title: "Sete roupas novas",
    items: [
      "Roupas novas: Nórdico, Mendigo, Domador de Feras, Caçador de Demônios, Peregrino, Senhor da Guerra e Monge.",
      "Cada uma tem 2 addons, como no Tibia. Abra a janela de roupas para ver o que libera cada uma.",
      "Conquistas novas para liberar tudo: chefes repetidos, level 75, 80 de corpo a corpo, 60 de escudo, meditação offline e mais.",
    ],
  },
  {
    id: "2026-10-15b",
    date: "15 de outubro (à noite)",
    title: "Desafios, bestiário e chefes na agenda",
    items: [
      "Desafios da semana: abra o diário (L) e clique em Desafios semanais. Três metas que zeram toda segunda, com bônus por cumprir todas.",
      "Ranking semanal: XP, abates, peixes e chefes (zeram na segunda-feira), e uma categoria nova de Pescador.",
      "Bestiário (tecla B): veja vida, dano e o que cada monstro solta. Os que você ainda não derrotou aparecem como ???.",
      "Chefes na agenda: o Lich do Pântano (quarta 20h) e o Rei Goblin (domingo 20h) acordam com bônus de loot.",
      "Bônus de login: entre em dias seguidos para ganhar prêmios, com um maior no 7º dia.",
      "Poção automática (botão ⚗): bebe vida ou mana sozinha abaixo do limite que você escolher.",
      "Acessibilidade (botão Aa): texto maior, alto contraste e animações reduzidas. E esta tela de Novidades fica no botão da ajuda (F1).",
    ],
  },
  {
    id: "2026-10-15",
    date: "15 de outubro",
    title: "Mais coisas para fazer com os amigos",
    items: [
      "O que você fala no chat agora aparece sobre a cabeça do personagem (amarelo no geral, azul no grupo).",
      "Emotes: botão ☺ no chat ou /e coracao, /e rir, /e oi...",
      "Sussurre com /w Nome mensagem e responda com /r. Use /amigo Nome para saber quando um amigo entra.",
      "Troca entre jogadores: botão direito no outro jogador > Trocar itens. Os dois confirmam e pronto.",
      "Pesca: compre a Vara de Pesca com o Velho Caçador Tomé e clique com o botão direito na água. Fique parado!",
      "Eventos com bônus de XP e loot em horários da semana. A etiqueta ★ no topo mostra o que está valendo.",
      "Arraste as magias da barra para mudar a ordem. O novato ganhou uma seta que mostra para onde ir.",
    ],
  },
];

export const LATEST_NEWS_ID: string = NEWS[0]!.id;

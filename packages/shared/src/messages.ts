import type { ChatChannel, ChatMessage, CombatEvent, Dir, FightStance, Sex, Vocation } from "./types.ts";
import type { ConditionId, SpellFx } from "./data/spells.ts";
import type { SkillId } from "./skills.ts";
import type { Hotkey } from "./hotkeys.ts";
import type { SpellGroup } from "./data/spellFamilies.ts";
import type { PartyShareReason } from "./party.ts";
export type { SkillId };
import type { EquipSlot, ItemInstance, Rarity, Stats } from "./data/items.ts";
import type { ArenaModId, ArenaTimeRecord } from "./data/arena.ts";

/** Cliente → servidor */
export const C2S = {
  /** Intenção de movimento contínuo: dir = direção segurada, null = soltou. seq cresce a cada envio. */
  Move: "move",
  /** Clique no mapa: servidor calcula A* e anda até lá. Qualquer "move" cancela. */
  WalkTo: "walkTo",
  /** Virar sem andar (Ctrl+seta). */
  Turn: "turn",
  Chat: "chat",
  /** Selecionar/limpar alvo de ataque automático (estilo Tibia). */
  Attack: "attack",
  /** Conjurar magia (atalho da barra ou palavras no chat). */
  Cast: "cast",
  /** Salva os atalhos de magia do personagem (janela "Magias", tecla H). */
  SetHotkeys: "setHotkeys",
  /** Mover item entre mochila/equipamento/depot (arrastar e soltar). */
  MoveItem: "moveItem",
  /** Usar item da mochila (poção). */
  UseItem: "useItem",
  /** Usar a primeira poção de vida/mana da mochila (atalhos Q/E). */
  QuickPotion: "quickPotion",
  /** Compatibilidade: larga o item da mochila no próprio tile (= DropItem no tile do jogador). */
  DiscardItem: "discardItem",
  /** Largar item (mochila/equipamento) no chão: tile alvo (≤ 3 tiles, linha livre) ou o próprio tile. */
  DropItem: "dropItem",
  /** Pegar item do chão (alcance 1) para a mochila (ou um slot específico). */
  PickupItem: "pickupItem",
  /** Mover item do chão para outro tile (arrastar no mundo). */
  MoveGroundItem: "moveGroundItem",
  /** "Olhar" um item do chão (dois botões do mouse / Shift+clique): o servidor responde com a instância completa. */
  LookGround: "lookGround",
  /** Falar com NPC (abre diálogo/loja/depot). */
  NpcInteract: "npcInteract",
  /** Comprar/vender com NPC aberto. */
  NpcTrade: "npcTrade",
  /** Viajar com o cocheiro aberto (TravelMsg). */
  Travel: "travel",
  /** Modo de batalha: postura (ofensivo/equilibrado/defensivo) e seguir o alvo. */
  FightMode: "fightMode",
  /** Seguir outro jogador (botão direito → Seguir, como no Tibia); targetId null/"" para de seguir. */
  Follow: "follow",
  /** Pedir a escolha de skill de uma estátua de treino adjacente (o servidor responde S2C.TrainingOpen). */
  TrainOpen: "trainOpen",
  /** Começar treino offline numa estátua de treino adjacente (o servidor salva e desconecta com CLOSE_TRAINING). */
  TrainOffline: "trainOffline",
  /** Coliseu: ações de lobby (no NPC do coliseu) e de partida. */
  Arena: "arena",
  /** Trocar roupa/addons/tom (janela de roupas). */
  SetOutfit: "setOutfit",
  /** Comprar um tom de tingimento (vale pra conta inteira). */
  BuyOutfitTone: "buyOutfitTone",
  /** Missões e recompensas diárias: aceitar/entregar/abandonar/rastrear (QuestActionMsg). */
  Quest: "quest",
  /** Encomenda semanal de material (Quadro de Recompensas): listar/entregar. */
  MaterialRequest: "materialRequest",
  /** Escolher o título ativo (conquistas). */
  SetTitle: "setTitle",
  /** Pedir o estado das conquistas (ao abrir a janela). */
  AchievementsRequest: "achievementsRequest",
  /** Grupo (party): convidar/aceitar/recusar/sair/expulsar/passar liderança/desfazer. */
  Party: "party",
  /** Troca entre jogadores (convite, oferta, confirmação, cancelar). */
  Trade: "trade",
  /** Desafios da semana: listar ou resgatar. */
  Challenge: "challenge",
  /** Lançar a linha de pesca num tile de água. */
  Fish: "fish",
  /** Abrir um baú de quest ou puxar uma alavanca adjacente (UseQuestObjectMsg). */
  UseQuestObject: "useQuestObject",
  /** Vincular o próprio ClickUp com o token pessoal (WorkLinkMsg): o servidor confere e descarta o token. */
  WorkLink: "workLink",
  /** Desvincular o próprio ClickUp. */
  WorkUnlink: "workUnlink",
  /** Refinar no Ferreiro aberto um item da mochila ou do equipamento (RefineMsg). */
  Refine: "refine",
  /** Pedir a agenda de eventos da semana (janela Agenda): o servidor responde S2C.Agenda. */
  AgendaRequest: "agendaRequest",
  /** Organizar o depot aberto (SortContainerMsg): junta pilhas iguais e ordena por categoria e nome. */
  SortContainer: "sortContainer",
  /** Mural de Excursões (ExcursionActionMsg, shared/data/excursions.ts): postar, cancelar, quero ir, sair, convidar todos. */
  Excursion: "excursion",
  /** Painel Online (SocialActionMsg, shared/online.ts): pedir a lista, pôr/tirar amigo. */
  Social: "social",
} as const;

/** C2S.SortContainer: só o depot (aberto e perto do guarda-volumes). */
export interface SortContainerMsg { where: "depot" }

/** C2S.WorkLink: token pessoal do ClickUp (pk_…). Nunca é guardado nem devolvido. */
export interface WorkLinkMsg { token: string }

export interface UseQuestObjectMsg { kind: "chest" | "lever"; id: string }

/** Ações de missão. accept/turnIn exigem a janela do NPC que dá a missão aberta (e perto). */
export type QuestActionMsg =
  | { action: "accept"; questId: string }
  | { action: "turnIn"; questId: string }
  | { action: "abandon"; questId: string }
  | { action: "track"; questId: string; on: boolean }
  /** Quadro de Recompensas (index 0..BOUNTIES_PER_DAY-1). */
  | { action: "bountyAccept"; index: number }
  | { action: "bountyTurnIn"; index: number };

export type PartyActionMsg =
  | { action: "invite"; targetId: string }
  | { action: "accept"; fromId: string }
  | { action: "decline"; fromId: string }
  | { action: "leave" }
  | { action: "kick"; targetId: string }
  | { action: "lead"; targetId: string }
  | { action: "disband" };

/**
 * `tone` ausente ou "" = cor natural; senão precisa estar liberado na conta (ver OutfitTonesMsg). `sex` ausente = mantém
 * o atual (trocar de sexo é de graça, pela janela de roupas).
 */
export interface SetOutfitMsg { outfit: string; addons: number; tone?: string; sex?: Sex }
export interface BuyOutfitToneMsg { toneId: string }
/** S2C.OutfitTones: tons liberados NA CONTA (valem pra qualquer personagem). */
export interface OutfitTonesMsg { unlocked: string[] }

export interface TrainOpenMsg { statueId: string }
export interface TrainOfflineMsg { skill: SkillId }
export type ArenaActionMsg =
  | { action: "list" }                        // pede S2C.ArenaLobbies
  | { action: "create"; withParty?: boolean } // cria um lobby (você é o líder); withParty = traz o seu grupo (party) junto
  | { action: "join"; lobbyId: string }
  | { action: "leave" }                       // sai do lobby OU desiste da partida (volta à vila)
  | { action: "start" }                       // só o líder: inicia (precisa estar perto do NPC do coliseu)
  | { action: "ready" };                      // durante a pausa com vendedor: "pronto" (todos prontos = próxima onda já)

export interface FightModeMsg { stance: FightStance; chase: boolean; /** Ataque automático: escolhe sozinho o monstro mais próximo. */ auto?: boolean }
export interface FollowMsg { targetId: string | null }

export type ItemLocation =
  | { where: "backpack"; index: number }
  | { where: "equip"; slot: EquipSlot }
  | { where: "depot"; index: number };
export interface MoveItemMsg { from: ItemLocation; to: ItemLocation; count?: number }
export interface UseItemMsg { index: number }
export interface QuickPotionMsg { kind: "hp" | "mana" }
export interface DiscardItemMsg { index: number }
/** De onde sai o item largado no chão (depot não). */
export type DropFrom = { where: "backpack"; index: number } | { where: "equip"; slot: EquipSlot };
export interface DropItemMsg { from: DropFrom; x: number; y: number; count?: number }
export type PickupTo = { where: "backpack"; index: number } | { where: "equip"; slot: EquipSlot };
export interface PickupItemMsg { groundId: string; to?: PickupTo }
/**
 * C2S.Refine (shared/data/refine.ts). `uid` e `level` (nível buscado = atual + 1) protegem do item trocado de lugar e do
 * clique duplo: se não batem com o item no servidor, nada é cobrado.
 */
export interface RefineMsg { from: DropFrom; uid: string; level: number }
export interface NpcInteractMsg { npcId: string }
export type NpcTradeMsg =
  | { npcId: string; action: "buy"; itemId: string; count: number }
  | { npcId: string; action: "sell"; index: number; count: number }
  /** Vende de uma vez tudo da mochila que o NPC compra (pilhas inteiras). */
  | { npcId: string; action: "sellAll" }
  /** Compra uma bênção (NpcDef.blessing): preço escala com o level, consumida na próxima morte. */
  | { npcId: string; action: "blessing" }
  /** Compra uma ficha de cassino (NpcDef.casino): prêmio aleatório, nunca poder de combate. */
  | { npcId: string; action: "casino" }
  /**
   * Compra/troca o encantamento ativo (NpcDef.imbuement): substitui o anterior, sem reembolso, com 10 h cheias de
   * combate. `tier` 1–3 (shared/data/imbuement.ts); ausente = 1.
   */
  | { npcId: string; action: "imbuement"; effect: string; tier?: number };

export interface CastMsg { spellId: string; targetId?: string | null }

export interface AttackMsg { targetId: string | null }
/**
 * `at`: onde a predição do cliente está ao enviar (soltar ou trocar de direção). Se for o próximo tile na direção que
 * estava segurada, o servidor completa esse passo antes de mudar a intenção: sem isso, quando a mensagem chegava antes
 * do instante em que o servidor daria o passo, ele era perdido e o cliente puxava o boneco de volta (lag ao soltar).
 */
export interface MoveMsg { dir: Dir | null; seq: number; at?: { x: number; y: number } }
/**
 * Andar até (x,y) pelo caminho. `stop: true` = só cancela o caminho em andamento (o passo já começado termina);
 * x/y são ignorados (o cliente manda o próprio tile, que num servidor antigo também para).
 */
export interface WalkToMsg { x: number; y: number; stop?: true }
export interface TurnMsg { dir: Dir }
export interface ChatSendMsg { text: string; channel: ChatChannel }

/** Servidor → cliente */
export const S2C = {
  Chat: "chat",
  /** Texto curto exibido como toast. */
  Notice: "notice",
  /** Máscara de exploração completa (enviada ao entrar). O cliente revela localmente ao andar. */
  Explored: "explored",
  /** Lote de eventos de combate do tick (enviado a todos na sala). */
  Combat: "combat",
  /** Você ganhou XP (para o texto flutuante "+25 XP"). */
  XpGain: "xpGain",
  /** Você subiu de level. */
  LevelUp: "levelUp",
  /** Você morreu (o servidor já te levou ao templo). */
  Died: "died",
  /** Uma criatura morreu (para animação de morte; a remoção do estado vem em seguida). */
  CreatureDied: "creatureDied",
  /** Resultado da tentativa de conjurar (só para quem conjurou). */
  CastResult: "castResult",
  /** Uma magia foi conjurada (para todos verem o efeito). */
  SpellCast: "spellCast",
  /** Atalhos de magia salvos no personagem (ao entrar/reconectar). null = nunca configurou. */
  Hotkeys: "hotkeys",
  /** Resposta do "olhar" de um item do chão (com bônus). */
  LookItem: "lookItem",
  /** Habilidade de monstro com aviso: tiles marcados no chão por `ms` antes do golpe (dá para sair). */
  MonsterTelegraph: "monsterTelegraph",
  /** Lista completa de condições ativas do jogador (enviada a ele quando muda). */
  Conditions: "conditions",
  /** Uma skill subiu de nível. */
  SkillUp: "skillUp",
  /** Estado completo do inventário do jogador (só para ele), enviado ao entrar e a cada mudança. */
  Inventory: "inventory",
  /** Depot aberto (conteúdo), enviado ao interagir com o NPC do depot e a cada mudança enquanto aberto. */
  Depot: "depot",
  /** Diálogo/loja de NPC aberto. */
  NpcOpen: "npcOpen",
  /** Loot que você recebeu de um abate (para animação de drop). */
  Loot: "loot",
  /** Feed global (drops raros, conquistas, bosses). */
  Feed: "feed",
  /** Fala ambiente de NPC (balão sobre a cabeça). */
  NpcSay: "npcSay",
  /** Emote de um jogador (ícone sobre a cabeça). */
  Emote: "emote",
  /** Abrir a escolha de skill da estátua de treino offline. */
  TrainingOpen: "trainingOpen",
  /** Resumo do treino offline ao entrar no jogo. */
  TrainingResult: "trainingResult",
  /** Lista de lobbies do coliseu (enviada ao abrir o NPC do coliseu e a cada mudança enquanto aberto). */
  ArenaLobbies: "arenaLobbies",
  /** Estado da SUA partida/lobby de coliseu (null = fora). */
  ArenaState: "arenaState",
  /** Fim da partida: resumo para cada participante. */
  ArenaResult: "arenaResult",
  /** Você foi teletransportado (portal). x,y = novo tile. */
  Teleported: "teleported",
  /** Anúncio de um administrador (faixa grande no centro da tela, para todos). */
  Announce: "announce",
  /** Estado das missões/recompensas diárias do jogador (QuestsMsg, shared/data/quests.ts): ao entrar e a cada mudança. */
  Quests: "quests",
  /** Missão (ou recompensa diária) concluída: toast com o resumo da recompensa. */
  QuestComplete: "questComplete",
  /** Conquista desbloqueada (toast). */
  AchievementUnlocked: "achievementUnlocked",
  /** Estado completo das conquistas (ao entrar e a cada mudança). */
  Achievements: "achievements",
  /** Tons de tingimento liberados NA CONTA (ao entrar e após comprar um novo). */
  OutfitTones: "outfitTones",
  /** Estado da encomenda semanal de material (ao entrar e após entregar). */
  MaterialRequestState: "materialRequestState",
  /** Estado do SEU grupo (party), enviado ao mudar (null = sem grupo). */
  Party: "party",
  /** Estado da troca (convite recebido, janela aberta ou fechada). */
  Trade: "trade",
  /** Desafios da semana (progresso e resgates). */
  Challenges: "challenges",
  /** Alguém lançou a linha: boia no tile de água durante `ms`. */
  FishCast: "fishCast",
  /** Evento com bônus em andamento (ou null quando termina). */
  Event: "event",
  /** Convite para um grupo (toast com Aceitar/Recusar). */
  PartyInvite: "partyInvite",
  /** Quadro da obra (ClickUp, ciclo 11): barras de sprint e tarefas "Na obra"; enviado ao abrir um NPC com workBoard. */
  Work: "work",
  /** Agenda de eventos da semana (AgendaMsg): ao entrar, sob pedido (C2S.AgendaRequest) e quando um evento começa/acaba. */
  Agenda: "agenda",
  /** Um evento agendado começa daqui a EVENT_SOON_MS (EventSoonMsg): o cliente chama a atenção na aba. */
  EventSoon: "eventSoon",
  /** Invasão da Vila (InvasionMsg, shared/data/invasion.ts): estado por jogador (1×/s quando muda) e o resultado no fim. */
  Invasion: "invasion",
  /** Mural de Excursões inteiro (ExcursionsMsg): a todos quando muda e a quem pede. */
  Excursions: "excursions",
  /** "Quero ir" (ao líder) ou lembrete de 2 min (ExcursionPingMsg). */
  ExcursionPing: "excursionPing",
  /** Painel Online (OnlineMsg, shared/online.ts): só para você, quando a sua lista muda (no máximo a cada 2 s). */
  Online: "online",
} as const;

/** Ocorrência da agenda. Horários em ms epoch, calculados no fuso do servidor (o mesmo do agendador). */
export interface AgendaEntry {
  id: string; name: string; desc: string; xpMult: number; lootMult: number;
  /** Chefe convocado no começo (id em MONSTERS). */
  boss?: string;
  /** Invasão da Vila (GameEventDef.invasion). */
  invasion?: true;
  start: number; end: number;
}
/** A semana a partir de agora (uma ocorrência de cada evento, a em andamento primeiro). */
export interface AgendaMsg { events: AgendaEntry[]; serverNow: number }
export interface EventSoonMsg { id: string; name: string; desc: string; start: number }

/** Barra coletiva de um projeto na semana ISO: tarefas fechadas e meta (média das 4 semanas anteriores). */
export interface WorkSprintBar { id: string; name: string; done: number; goal: number }
/** Tarefa aberta da aba "Na obra" (título já disfarçado por shared/workFilter.ts). */
export interface WorkTaskRow { title: string; who: string; project: string }
export interface WorkMsg {
  /** NPC aberto (o cliente só mostra a aba nesse NPC). */
  npcId: string;
  /** false = ClickUp desligado (sem token) ou ainda sem leitura. */
  online: boolean;
  /** Semana ISO das barras ("2026-W43"). */
  week: string;
  sprints: WorkSprintBar[];
  /** Soma da semana e meta somada: passou da meta = "Sprint Fechada" (XP ×1,25 por 1 h). */
  total: { done: number; goal: number; fired: boolean };
  tasks: WorkTaskRow[];
  /** Última leitura bem-sucedida (ms epoch; 0 = nunca). */
  updatedAt: number;
  /** O servidor lê o ClickUp (tem token próprio): sem isso, o vínculo vale mas as tarefas ainda não contam. */
  polling?: boolean;
  /** O vínculo self-service está disponível. */
  canLink?: boolean;
  /** Vínculo de quem vê (apelido da equipe ou "usuário <id>"); null = não vinculado. */
  link?: { nick: string } | null;
}

export interface QuestCompleteMsg {
  /** Nome da missão (ou "Recompensa: Mate 20 Lobos"). */
  name: string;
  xp: number;
  gold: number;
  items: { itemId: string; count: number }[];
  bounty?: boolean;
  /** Missão do catálogo (não vem em recompensa nem baú): o cartão mostra o que ela abriu (ciclo 17). */
  questId?: string;
}

export interface PartyMemberInfo {
  id: string;
  name: string;
  vocation: Vocation;
  level: number;
  /** Atacou/curou nos últimos PARTY_ACTIVE_MS (conta para dividir a XP). */
  active: boolean;
}
export interface PartyStateMsg {
  party: null | {
    id: string;
    leaderId: string;
    members: PartyMemberInfo[];
    /** XP compartilhada: ativa (verde) ou inativa (vermelho) com o motivo. */
    share: { active: boolean; reason?: PartyShareReason; minLevel?: number };
  };
}
export interface PartyInviteMsg { fromId: string; fromName: string; /** ms até expirar. */ expiresInMs: number }

export interface AnnounceMsg { text: string; from: string }

export interface TeleportedMsg { x: number; y: number }

export type ChatRecvMsg = ChatMessage;
export type CastFailReason = "cooldown" | "mana" | "level" | "vocation" | "target" | "range" | "pz" | "unknown" | "dead"
  /** Parede entre o conjurador e o alvo (linha de visão). */
  | "no_los";
export interface CastResultMsg {
  spellId: string;
  ok: boolean;
  reason?: CastFailReason;
  /** ms até poder usar de novo esta magia (sucesso = cooldown cheio). */
  cooldownMs?: number;
  /** ms do cooldown global. */
  globalMs?: number;
}
export interface SpellCastMsg {
  spellId: string;
  casterId: string;
  targetId?: string;
  /** Centro do efeito (tile). */
  x: number;
  y: number;
  dir: Dir;
  /** Tiles afetados (pares x,y achatados) para áreas/ondas. */
  tiles?: number[];
}
/** `groups` ausente = não mexe nos grupos salvos (cliente antigo); presente = substitui. */
export interface SetHotkeysMsg { list: Hotkey[]; groups?: SpellGroup[] }
export interface HotkeysMsg { list: Hotkey[] | null; groups?: SpellGroup[] }
export interface MonsterTelegraphMsg {
  casterId: string;
  /** Tiles que vão ser atingidos (pares x,y achatados). */
  tiles: number[];
  /** Tempo até o golpe (ms). */
  ms: number;
  fx: SpellFx;
}
export interface ConditionsMsg {
  list: {
    id: ConditionId; remainingMs?: number; value?: number;
    /** 'fed': value = vida/tique, value2 = mana/tique. 'imbued': value = minutos de combate restantes, value2 = tier. */
    value2?: number;
    /**
     * 'imbued': efeito (IMBUEMENTS). O encantamento não tem remainingMs: o tempo só corre em combate PvE, então o
     * cliente não pode contar sozinho; o servidor reenvia quando muda o minuto.
     */
    effect?: string;
  }[];
}
export interface SkillUpMsg { skill: SkillId; level: number }
export interface InventoryMsg {
  equipment: Partial<Record<EquipSlot, ItemInstance>>;
  backpack: (ItemInstance | null)[];   // tamanho = capacidade do level (backpackCapacity)
  gold: number;
  /** Totais efetivos (equipamento + bônus) para o HUD. */
  stats: Stats;
  cap: { used: number; max: number };
}
export interface DepotMsg { items: (ItemInstance | null)[] }  // tamanho DEPOT_SIZE
export interface NpcOpenMsg {
  npcId: string;
  name: string;
  greeting: string;
  shop?: { sells: { itemId: string; price: number; limited?: boolean }[]; buys?: string[]; sellRatio: number };
  depot?: boolean;
  /** Cocheiro: destinos e preço para este jogador (0 = grátis). */
  travel?: { id: string; label: string; price: number }[];
  /** Bênção (NpcDef.blessing): preço para o level deste jogador e se já está ativa. */
  blessing?: { price: number; active: boolean };
  /** Vende ficha de cassino (NpcDef.casino): preço fixo em CASINO_TICKET_PRICE. */
  casino?: boolean;
  /**
   * Vende encantamento (NpcDef.imbuement): o ativo do personagem (`active` = efeito, "" = nenhum; `tier` 1–3;
   * `leftMs` = combate restante).
   */
  imbuement?: { active: string; tier: number; leftMs: number };
}
export interface TravelMsg { npcId: string; dest: string }
export interface LookGroundMsg { groundId: string }
export interface LookItemMsg { groundId: string; item: ItemInstance }
/** Arrastar um item do chão para outro tile (count = parte da pilha). */
export interface MoveGroundItemMsg { groundId: string; x: number; y: number; count?: number | null }
export interface LootMsg {
  x: number; y: number; monsterName: string; items: ItemInstance[]; gold: number;
  /** Loot de grupo: caiu no chão onde o monstro morreu (qualquer um pega). */
  onGround?: boolean;
  /** Loot de grupo: a sua parte da divisão automática (itens comuns/incomuns em rodízio e o ouro dividido), já na mochila. */
  partySplit?: boolean;
  /** Itens perdidos (mochila cheia e sem espaço no chão). */
  lostFull?: number;
  /** Itens que não couberam e caíram no chão (no seu tile; qualquer um pega). */
  fellToGround?: number;
}
export interface FeedMsg { text: string; kind: "drop" | "level" | "boss" | "death" | "info"; rarity?: Rarity }
export interface NpcSayMsg { npcId: string; text: string }
export interface EmoteMsg { id: string; emote: string }
export interface FishMsg { x: number; y: number }
/** `ms` = 0 cancela a boia. */
export interface FishCastMsg { id: string; x: number; y: number; ms: number }
export interface EventMsg { active: import("./data/events.ts").ActiveEvent | null }
export interface TrainingOpenMsg { statueId: string }
export interface TrainingResultMsg { skill: SkillId; minutes: number; levelsGained: number; newLevel: number; pct: number }
export interface ArenaLobbySummary { id: string; leader: string; members: string[]; avgLevel: number }
export interface ArenaLobbiesMsg {
  lobbies: ArenaLobbySummary[];
  freeArenas: number;
  queue: number;
  /** Ciclo 16: modificador da semana (ondas 61–70), quando a semana acaba e os melhores tempos das 70 ondas. */
  week?: { mod: ArenaModId; endsAt: number; best?: ArenaTimeRecord; record?: ArenaTimeRecord };
}
/** "break" = respiro curto entre ondas comuns (sem loja); "pause" = pausa com vendedor e "Pronto" (depois de chefe). */
export type ArenaPhase = "lobby" | "queued" | "countdown" | "fight" | "break" | "pause" | "ended";
export interface ArenaStateMsg {
  state: null | {
    lobbyId: string;
    arenaId?: number;              // 1..ARENA_COUNT quando em partida
    phase: ArenaPhase;
    wave: number;                  // onda atual (1..); 0 antes de começar
    /** Fim da contagem/respiro/pausa (ms epoch do servidor), se houver. */
    phaseEndsAt?: number;
    /** Relógio do servidor no envio (o cliente corrige a diferença de relógio para a contagem). */
    serverNow?: number;
    monstersLeft?: number;
    /** level: para a janela mostrar quem está fora da faixa de XP (abaixo de 2/3 do maior). */
    members: { name: string; alive: boolean; ready?: boolean; level?: number }[];
    leader: string;
    /** Recompensa acumulada até agora (cada participante). */
    earned: { xp: number; gold: number };
    /** Modificador das ondas 61–70 desta partida (o da semana em que começou; no lobby, o da semana). */
    mod?: ArenaModId;
    /** Início da onda 1 (ms epoch do servidor): relógio da partida para o ranking de tempo. */
    startedAt?: number;
  };
}
export interface ArenaResultMsg {
  wavesCleared: number;
  xp: number;
  gold: number;
  best: number;
  reason: "wiped" | "gave_up" | "completed";
  /** Venceu as 70: tempo da partida e se bateu o melhor da semana ou o recorde do servidor. */
  timeMs?: number;
  timeRecord?: "week" | "server";
}
export interface CombatMsg { events: CombatEvent[] }
export interface XpGainMsg { amount: number; x: number; y: number }
export interface LevelUpMsg { level: number; maxHp: number; maxMana: number }
export interface DiedMsg {
  lostXp: number;
  killerName: string;
  /** A bênção foi gasta nesta morte (só acontece quando havia XP a perder). */
  blessingUsed?: boolean;
  /** XP que a bênção salvou (a perda que haveria sem ela). */
  savedXp?: number;
  /** O que te acertou nos últimos DEATH_RECAP_MS (ciclo 18): dano na vida por fonte, do maior para o menor. */
  lastHits?: { source: string; amount: number }[];
}
/** Janela do resumo da tela de morte (DiedMsg.lastHits) e quantas fontes ele mostra no máximo. */
export const DEATH_RECAP_MS = 5000;
export const DEATH_RECAP_MAX = 5;
export interface CreatureDiedMsg { id: string; x: number; y: number; defId: string }
export interface ExploredMsg { width: number; height: number; bits: string /* base64 */ }
export interface NoticeMsg {
  text: string;
  kind?: "info" | "warn" | "good";
  /** Também registra no chat (linha de sistema, copiável) — respostas de comandos de admin. */
  log?: boolean;
}

/**
 * Fluxo de contas (uma conta → vários personagens):
 *   1. POST /api/login     {account, password, create?}  → AccountSession (lista de personagens)
 *      create=true cria a conta (erro "account_taken" se já existe); sem create, conta inexistente → "no_account".
 *   2. POST /api/characters {session, name, vocation}     → AccountSession atualizada (cria personagem)
 *   3. POST /api/play       {session, name}               → PlayResponse (token de uso único p/ joinOrCreate)
 *   POST /api/logout {session} encerra a sessão da conta.
 * O nome da CONTA é privado (não aparece no jogo); o nome do PERSONAGEM é o que os outros veem.
 */
export interface LoginRequest { account: string; password: string; create?: boolean }
export interface CharacterSummary {
  name: string;
  vocation: Vocation;
  level: number;
  /** Roupa atual (retrato na lista de personagens). */
  outfit?: string;
  addons?: number;
  /** Sexo (ausente = "m"): escolhe a sheet da roupa no retrato. */
  sex?: Sex;
  /** Treinando offline agora (ao entrar, recebe o progresso). */
  training?: { skill: SkillId; sinceMs: number };
  online?: boolean;
}
export const MAX_CHARACTERS_PER_ACCOUNT = 5;
export type AuthError =
  | "invalid_request" | "invalid_account" | "invalid_name" | "wrong_password" | "no_account" | "account_taken"
  | "weak_password" | "too_many_attempts" | "name_taken" | "too_many_characters" | "invalid_session" | "no_character"
  | "already_online" | "invalid_code" | "character_online" | "character_training";
export type AuthFail = {
  ok: false;
  error: AuthError;
  /** too_many_attempts: segundos até poder tentar de novo. */
  retryAfterSec?: number;
  /** Texto pronto (pt-BR) para erros que o cliente não conheça. */
  message?: string;
};
/** Sessão da conta (curta, em memória no servidor; expira em 30 min sem uso). */
export type AccountSession = { ok: true; session: string; account: string; characters: CharacterSummary[] } | AuthFail;
/** `sex` ausente = "m" (clientes antigos e scripts); valor fora de "m" | "f" é recusado. */
export interface CreateCharacterRequest { session: string; name: string; vocation: Vocation; sex?: Sex }
export interface PlayRequest { session: string; name: string }
export type PlayResponse = { ok: true; token: string; name: string; vocation: Vocation } | AuthFail;
/**
 * Recuperação de senha: um admin gera um código (/resetsenha <conta> no jogo, ou `npm run admin -- reset-password <conta>`).
 * POST /api/reset-password {account, code, password} → AccountSession (já entra na conta). Código de uso único, 24 h.
 */
export interface ResetPasswordRequest { account: string; code: string; password: string }
/** POST /api/characters/delete — exclui um personagem da conta (exige a senha; recusa se online/treinando). */
export interface DeleteCharacterRequest { session: string; name: string; password: string }
/** Códigos de fechamento próprios (o Colyseus reserva 4000–4010). */
export const CLOSE_REPLACED = 4100;   // a conta entrou em outro lugar
export const CLOSE_TRAINING = 4101;   // saiu para treinar offline
export const CLOSE_KICKED = 4102;     // expulso por um administrador (reason = motivo)

/** Opções do joinOrCreate("world", ...) */
export interface JoinOptions { token: string }

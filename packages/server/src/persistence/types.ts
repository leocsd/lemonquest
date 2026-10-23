import type { Vocation } from "@lemonquest/shared";

/** Dados flexíveis do personagem, guardados como JSON na coluna `data`. Cada marco acrescenta campos opcionais. */
export interface CharacterData {
  /** Máscara de exploração do minimapa (base64, ver shared/explore.ts). */
  explored?: string;
  /** Largura do mapa quando `explored` foi salva (mudou → máscara descartada; mesma largura → prefixo aproveitado). */
  exploredW?: number;
  hp?: number;
  mana?: number;
  /** Skills: nível e tentativas acumuladas no nível atual. */
  /** Modo de batalha salvo. */
  stance?: "offensive" | "balanced" | "defensive";
  chase?: boolean;
  auto?: boolean;
  /** PvP: mortes injustas recentes (timestamps) — caveira vermelha. */
  pvpKills?: number[];
  /** PvP: fim da caveira branca (ms epoch); relogar não a apaga. */
  pvpWhiteUntil?: number;
  /** PvP: fim do bloqueio de zona de proteção (ms epoch); relogar não o apaga. */
  pvpPzLockUntil?: number;
  /** Bênção comprada no templo: zera a penalidade de XP na próxima morte, depois se consome. */
  blessed?: boolean;
  /** Semana ISO (weekId) da última compra de item de tier 6-7 (encomenda especial, 1 por semana). */
  limitedBuyWeek?: string;
  /** Atalhos de magia (painel H): tecla → magia. Ausente = nunca configurou (o cliente migra/usa o padrão). */
  hotkeys?: { key: string; spellId: string }[];
  /**
   * Versão da barra: abaixo de HOTKEYS_VERSION (ou ausente), o login troca a barra pela recomendada (famílias de
   * magia) uma vez e avisa. Editar os atalhos marca a versão atual.
   */
  hotkeysVersion?: number;
  /** Inventário (M4). */
  equipment?: Partial<Record<string, unknown>>;
  backpack?: unknown[];
  depot?: unknown[];
  gold?: number;
  /** Estado "alimentado" (comida): tempo restante (o tempo não passa offline) e regen por tique. */
  fed?: { remainingMs: number; hpPerTick: number; manaPerTick: number };
  /** Treino offline em andamento (personagem deslogado numa estátua; ao entrar recebe o progresso). */
  offlineTraining?: { skill: "melee" | "distance" | "magic" | "shield"; sinceMs: number; statueId?: string };
  skills?: Partial<Record<"melee" | "distance" | "magic" | "shield", { level: number; tries: number }>>;
  /** Coliseu: recorde pessoal de ondas vencidas. */
  arenaBest?: number;
  /** Roupa (OUTFITS) e addons (bits 1|2). Ausente = padrão da vocação. */
  outfit?: string;
  addons?: number;
  /** Tom de tingimento ativo (id em OUTFIT_TONES; precisa estar liberado na conta). Ausente = cor natural. */
  tone?: string;
  /** Montaria visível (precisa estar liberada na conta, ver kv `account.mount.<id>`). Ausente = sem montaria. */
  mount?: boolean;
  /** Encantamento ativo (id em IMBUEMENTS). Ausente = nenhum. */
  imbuement?: string;
  /** Conquistas (systems/achievements.ts): concluídas, contadores e título ativo. */
  ach?: {
    /** id da conquista → ms epoch em que foi concluída. */
    done: Record<string, number>;
    /** Contadores acumulados (kills, bosses, deaths, steps, gold, foods, drops, pickups, offline [min], quests, party, arena...). */
    stats: Record<string, number>;
    /** Tipos de monstro comuns já derrotados (bestiário). */
    killed: string[];
    /** Título ativo (id em TITLES) ou ausente. */
    title?: string;
  };
  /** Roupas/addons/títulos liberados: "outfit:x", "addon:x:1|2", "title:x". */
  unlocks?: string[];
  /** Telemetria de progressão (systems/telemetry.ts): tempo jogado, mortes e ouro por level. */
  play?: { ms: number; byLevel: Record<string, { ms: number; deaths: number; goldIn: number; goldOut: number }> };
  /** Linha de base da semana (ranking e missões semanais): contadores no começo da semana ISO `id`. */
  week?: { id: string; xp: number; kills: number; fish: number; bosses: number };
  /** Desafios da semana: semana ISO, level no começo dela (meta de XP), desafios resgatados e bônus. */
  challenges?: { week: string; level: number; claimed: string[]; bonus: boolean };
  /** Encomenda semanal de material (Quadro de Recompensas): semana ISO e se já foi entregue. */
  request?: { week: string; claimed: boolean };
  /** Bônus de login: último dia de jogo (troca às 6h de Brasília) e quantos dias seguidos. */
  login?: { day: string; streak: number };
  /** Lista de amigos (nomes de personagem; /amigo): avisos de entrada e saída. */
  friends?: string[];
  /** Silenciado por um admin (/mute): não fala no chat até `until` (ms epoch). Sobrevive a relog. */
  muted?: { until: number; by: string };
  /** Missões (systems/quests.ts): progresso das ativas, concluídas, rastreadas e recompensas diárias do dia. */
  quests?: QuestSaveData;
}

export interface QuestSaveData {
  /** questId → progresso por passo. */
  active?: Record<string, number[]>;
  done?: string[];
  tracked?: string[];
  /** Recompensas diárias: dia (chave "AAAA-MM-DD", troca às 6h de Brasília), faixa de level travada no dia e estado de cada uma. */
  bounty?: { day: string; band: number; s: { st: "open" | "active" | "done"; n: number }[] };
  /** Grupos de baús de quest do mapa já abertos (shared/data/questWorld.ts). */
  chests?: string[];
}

/** Registro persistido de um personagem (uma conta tem até MAX_CHARACTERS_PER_ACCOUNT personagens). */
export interface CharacterRecord {
  id: number;
  accountId: number;
  name: string;
  vocation: Vocation;
  level: number;
  xp: number;
  x: number | null;   // null = nunca entrou → nasce no spawn do mapa
  y: number | null;
  dir: number;
  data: CharacterData;
}

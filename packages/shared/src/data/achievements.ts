// Conquistas: catálogo, recompensas (roupas/addons/títulos) e helpers de texto. Dados puros (servidor e cliente).
// Cada conquista olha UMA métrica numérica (ver AchMetric) e é concluída quando métrica >= alvo.
// Recompensa = ids de desbloqueio: "outfit:<roupa>", "addon:<roupa>:<1|2>", "title:<titulo>".
import { MONSTERS } from "./monsters.ts";
import { OUTFITS, defaultOutfit } from "./outfits.ts";
import { ARENA_MAX_WAVE } from "./arena.ts";

/** Métricas que o servidor calcula para cada personagem. */
export type AchMetric =
  | "kills" | "bosses" | "bestiary" | "boss:goblin_king" | "boss:swamp_lich"
  | "level" | "melee" | "distance" | "magic" | "shield"
  | "arena" | "gold" | "deaths" | "steps" | "foods" | "drops" | "pickups" | "offline" | "explore" | "equipped"
  | "quests" | "party" | "fish"
  // Ciclo 11: chefes da Malha da Ferrovia e tarefas fechadas no ClickUp pelo usuário vinculado (server/systems/clickup.ts).
  | "boss:vagao_nao_inspecionavel" | "boss:locomotiva_fantasma" | "work_tasks";

export interface AchievementDef {
  id: string;
  name: string;
  /** Texto de requisito (também aparece como "Desbloqueie: ..." na janela de roupas). */
  desc: string;
  /** Glifo (emoji) mostrado na lista e no toast. */
  icon: string;
  points: number;
  /** Oculta nome e descrição na lista até ser concluída. */
  hidden?: boolean;
  /** Entra no feed global ao ser conquistada. */
  rare?: boolean;
  metric: AchMetric;
  target: number;
  /** "outfit:id" | "addon:id:1|2" | "title:id" */
  rewards?: string[];
}

/** Títulos que as conquistas concedem (id → texto exibido ao lado do nome). */
export const TITLES: Record<string, string> = {
  /** Rotativo: líder de uma categoria semanal do ranking, só até a próxima segunda (server/systems/weeklyChampion.ts). */
  campeao_semana: "Campeão da Semana",
  persistente: "o Persistente",
  matador_lich: "Matador de Lich",
  regicida: "Regicida",
  flagelo: "Flagelo do Mundo",
  naturalista: "o Naturalista",
  veterano: "o Veterano",
  muralha: "a Muralha",
  gladiador: "o Gladiador",
  rei_coliseu: "Rei do Coliseu",
  imperador_coliseu: "Imperador do Coliseu",
  cartografo: "o Cartógrafo",
  magnata: "o Magnata",
  heroi_povo: "Herói do Povo",
  arquimago: "o Arquimago",
  pescador: "o Pescador",
  mestre_pescador: "Mestre Pescador",
  // Quests (missões e baús)
  cacador_piratas: "Caçador de Piratas",
  rei_selva: "Rei da Selva",
  matador_yeti: "Matador de Yeti",
  matador_dragoes: "Matador de Dragões",
  heroi: "o Herói",
  exorcista: "o Exorcista",
  algoz_ferumbras: "Algoz de Ferumbras",
  aniquilador: "o Aniquilador",
  // Escritório (ciclo 10): piadas internas, ver bloco correspondente em ACHIEVEMENTS.
  compras_onfire: "Compras Onfire",
  superposto: "o Superposto",
  alinhado: "o Alinhado",
  movido_a_cafe: "Movido a Café",
  documentador: "o Documentador",
  mestre_da_frota: "Mestre da Frota",
  // Malha da Ferrovia e trabalho real (ciclo 11): ver o bloco correspondente em ACHIEVEMENTS; "maquinista" vem da missão.
  maquinista: "o Maquinista",
  inspetor_de_via: "Inspetor de Via",
  ferroviario: "o Ferroviário",
  dormente: "o Dormente",
  entregador: "o Entregador",
  fechador_sprint: "Fechador de Sprint",
  mestre_kanban: "Mestre do Kanban",
  lenda_backlog: "Lenda do Backlog",
};
export const MAX_TITLE_LEN = 24;

/** Monstros "comuns" do bestiário (sem chefes, invocações e bonecos). */
export const BESTIARY_IDS: string[] = Object.values(MONSTERS).filter((m) => !m.boss && !m.invulnerable && m.xp > 0).map((m) => m.id);

const a = (
  id: string, name: string, desc: string, icon: string, points: number, metric: AchMetric, target: number,
  extra: { rewards?: string[]; hidden?: boolean; rare?: boolean } = {},
): AchievementDef => ({ id, name, desc, icon, points, metric, target, ...extra });

export const ACHIEVEMENTS: AchievementDef[] = [
  // Abates
  a("first_blood", "Primeiro Sangue", "Derrote seu primeiro monstro", "🗡️", 5, "kills", 1, { rewards: ["addon:cidadao:1"] }),
  a("kills_100", "Exterminador", "Derrote 100 monstros", "⚔️", 10, "kills", 100, { rewards: ["addon:cidadao:2"] }),
  a("kills_500", "Açougueiro", "Derrote 500 monstros", "🪓", 20, "kills", 500, { rewards: ["outfit:barbaro"] }),
  a("kills_1000", "Mil e Uma Baixas", "Derrote 1.000 monstros", "💀", 30, "kills", 1000, { rewards: ["addon:barbaro:1"] }),
  a("kills_5000", "Flagelo do Mundo", "Derrote 5.000 monstros", "☠️", 60, "kills", 5000, { rewards: ["addon:barbaro:2", "title:flagelo"], rare: true }),
  a("bestiary_all", "Enciclopédia Ambulante", "Derrote todos os tipos de monstro comuns", "📖", 40, "bestiary", BESTIARY_IDS.length,
    { rewards: ["outfit:invocador", "title:naturalista"], rare: true }),
  a("bestiary_10", "Conhecedor de Feras", "Derrote 10 tipos de monstro diferentes", "🐾", 15, "bestiary", 10, { rewards: ["outfit:domador"] }),
  a("kills_2500", "Domador de Feras", "Derrote 2.500 monstros", "🦁", 40, "kills", 2500, { rewards: ["addon:domador:1"] }),
  // Chefes
  a("boss_goblin", "Regicida", "Derrote o Rei Goblin", "👑", 40, "boss:goblin_king", 1, { rewards: ["outfit:assassino", "title:regicida"], rare: true }),
  a("boss_lich", "Matador de Lich", "Derrote o Lich do Pântano", "🧟", 40, "boss:swamp_lich", 1, { rewards: ["addon:invocador:1", "title:matador_lich"], rare: true }),
  a("boss_5", "Caçador de Chefes", "Derrote 5 chefes", "🐲", 30, "bosses", 5, { rewards: ["addon:assassino:1"] }),
  a("boss_20", "Terror dos Chefes", "Derrote 20 chefes", "🔥", 50, "bosses", 20, { rewards: ["addon:assassino:2"], rare: true }),
  a("boss_10", "Caçador de Demônios", "Derrote 10 chefes", "😈", 40, "bosses", 10, { rewards: ["outfit:cacador_demonios"] }),
  a("boss_lich_5", "Pesadelo do Lich", "Derrote o Lich do Pântano 5 vezes", "🦇", 40, "boss:swamp_lich", 5, { rewards: ["addon:cacador_demonios:1"] }),
  a("boss_goblin_5", "Destronador", "Derrote o Rei Goblin 5 vezes", "🗡️", 40, "boss:goblin_king", 5, { rewards: ["addon:cacador_demonios:2"], rare: true }),
  // Level
  a("level_10", "Dez e Contando", "Chegue ao level 10", "🔟", 5, "level", 10, { rewards: ["outfit:cavaleiro"] }),
  a("level_20", "Veterano Novato", "Chegue ao level 20", "🎖️", 15, "level", 20, { rewards: ["outfit:guerreiro"] }),
  a("level_30", "Calejado", "Chegue ao level 30", "🛡️", 25, "level", 30, { rewards: ["addon:cavaleiro:1"] }),
  a("level_40", "Quarentão Heroico", "Chegue ao level 40", "🏅", 40, "level", 40, { rewards: ["addon:cavaleiro:2", "title:veterano"], rare: true }),
  a("level_50", "Quase Lendário", "Chegue ao level 50", "🌟", 60, "level", 50, { rewards: ["addon:invocador:2"], rare: true }),
  a("level_75", "Senhor da Guerra", "Chegue ao level 75", "👑", 80, "level", 75, { rewards: ["addon:senhor_guerra:1"], rare: true }),
  // Skills
  a("melee_30", "Mão Pesada", "Chegue a 30 de corpo a corpo", "💪", 15, "melee", 30, { rewards: ["addon:guerreiro:1"] }),
  a("melee_60", "Mestre das Armas", "Chegue a 60 de corpo a corpo", "⚒️", 40, "melee", 60, { rewards: ["addon:guerreiro:2"], rare: true }),
  a("melee_80", "Lâmina Lendária", "Chegue a 80 de corpo a corpo", "🔨", 60, "melee", 80, { rewards: ["addon:senhor_guerra:2"], rare: true }),
  a("distance_30", "Olho de Águia", "Chegue a 30 de distância", "🏹", 15, "distance", 30, { rewards: ["outfit:cacador"] }),
  a("distance_50", "Flecha Certeira", "Chegue a 50 de distância", "🎯", 25, "distance", 50, { rewards: ["addon:cacador:1"] }),
  a("distance_70", "Atirador de Elite", "Chegue a 70 de distância", "🦅", 40, "distance", 70, { rewards: ["addon:cacador:2"], rare: true }),
  a("magic_8", "Faísca Arcana", "Chegue ao Magic Level 8", "✨", 10, "magic", 8, { rewards: ["outfit:mago"] }),
  a("magic_15", "Mago de Verdade", "Chegue ao Magic Level 15", "🔮", 20, "magic", 15, { rewards: ["addon:mago:1"] }),
  a("magic_30", "Arquimago", "Chegue ao Magic Level 30", "🌌", 40, "magic", 30, { rewards: ["addon:mago:2", "title:arquimago"], rare: true }),
  a("magic_40", "Voz do Abismo", "Chegue ao Magic Level 40", "🌑", 50, "magic", 40, { rewards: ["addon:bruxo:2"], rare: true }),
  a("shield_40", "Muralha Viva", "Chegue a 40 de escudo", "🧱", 25, "shield", 40, { rewards: ["outfit:nordico", "title:muralha"] }),
  a("shield_60", "Escudo Inquebrável", "Chegue a 60 de escudo", "🛡️", 40, "shield", 60, { rewards: ["addon:nordico:2"], rare: true }),
  // Coliseu
  a("arena_5", "Estreante da Areia", "Vença a onda 5 do Coliseu", "🏟️", 10, "arena", 5),
  a("arena_10", "Gladiador", "Vença a onda 10 do Coliseu", "🥊", 20, "arena", 10, { rewards: ["outfit:senhor_guerra", "title:gladiador"] }),
  a("arena_20", "Lenda da Arena", "Chegue à onda 20 do Coliseu", "🏴‍☠️", 40, "arena", 20, { rewards: ["outfit:pirata"], rare: true }),
  a("arena_30", "Rei do Coliseu", "Vença a onda 30 do Coliseu", "🏆", 80, "arena", 30,
    { rewards: ["addon:pirata:1", "title:rei_coliseu"], rare: true }),
  a("arena_60", "Imperador do Coliseu", `Vença a onda ${ARENA_MAX_WAVE} do Coliseu`, "👑", 120, "arena", ARENA_MAX_WAVE,
    { rewards: ["title:imperador_coliseu"], rare: true }),
  // Morrer, comer, treinar
  a("deaths_10", "Persistente", "Morra 10 vezes", "🪦", 10, "deaths", 10, { rewards: ["outfit:bruxo", "title:persistente"] }),
  a("deaths_50", "Mártir", "Morra 50 vezes", "😵", 20, "deaths", 50, { rewards: ["addon:bruxo:1"] }),
  a("food_50", "Gourmet", "Coma 50 comidas", "🍖", 10, "foods", 50, { rewards: ["outfit:druida"] }),
  a("fish_10", "Pescador", "Pesque 10 peixes", "🎣", 5, "fish", 10, { rewards: ["title:pescador"] }),
  a("fish_100", "Mestre Pescador", "Pesque 100 peixes", "🐟", 20, "fish", 100, { rewards: ["addon:nordico:1", "title:mestre_pescador"] }),
  a("food_200", "Pança de Ferro", "Coma 200 comidas", "🍗", 25, "foods", 200, { rewards: ["addon:druida:1"] }),
  a("offline_12h", "Treinador Dedicado", "Treine offline por 12 horas no total", "🛌", 30, "offline", 720, { rewards: ["addon:druida:2"] }),
  a("offline_3h", "Meditação", "Treine offline por 3 horas no total", "🧘", 10, "offline", 180, { rewards: ["outfit:monge"] }),
  a("offline_48h", "Iluminado", "Treine offline por 48 horas no total", "🕉️", 40, "offline", 2880, { rewards: ["addon:monge:1"], rare: true }),
  // Itens
  a("drop_20", "Desapegado", "Largue 20 itens no chão", "🗑️", 5, "drops", 20, { rewards: ["addon:mendigo:1"], hidden: true }),
  a("pickup_100", "Catador", "Pegue 100 itens do chão", "🧺", 10, "pickups", 100, { rewards: ["outfit:mendigo"], hidden: true }),
  a("pickup_500", "Rei do Garimpo", "Pegue 500 itens do chão", "💎", 25, "pickups", 500, { rewards: ["addon:pirata:2"] }),
  a("pickup_2000", "Acumulador", "Pegue 2.000 itens do chão", "🎒", 30, "pickups", 2000, { rewards: ["addon:mendigo:2"], hidden: true }),
  a("fullset", "Bem Equipado", "Equipe os 8 espaços de equipamento", "🧥", 15, "equipped", 8),
  // Andar e explorar
  a("steps_10k", "Pé na Estrada", "Ande 10.000 tiles", "👣", 15, "steps", 10_000, { rewards: ["outfit:oriental"] }),
  a("steps_50k", "Caminhante Incansável", "Ande 50.000 tiles", "🥾", 30, "steps", 50_000, { rewards: ["addon:oriental:1"] }),
  a("steps_150k", "Peregrino", "Ande 150.000 tiles", "🏮", 40, "steps", 150_000, { rewards: ["addon:peregrino:1"], rare: true }),
  a("explore_25", "Curioso", "Explore 25% do mundo", "🧭", 10, "explore", 25, { rewards: ["outfit:peregrino"] }),
  a("explore_60", "Cartógrafo", "Explore 60% do mundo", "🗺️", 35, "explore", 60, { rewards: ["addon:oriental:2", "title:cartografo"], rare: true }),
  a("explore_90", "Desbravador", "Explore 90% do mundo", "🧗", 50, "explore", 90, { rewards: ["addon:peregrino:2"], rare: true }),
  // Ouro
  a("gold_10k", "Bolso Cheio", "Ganhe 10.000 de ouro", "🪙", 10, "gold", 10_000),
  a("gold_50k", "Nobreza de Ouro", "Ganhe 50.000 de ouro", "💰", 20, "gold", 50_000, { rewards: ["outfit:nobre"] }),
  a("gold_200k", "Barão", "Ganhe 200.000 de ouro", "🏦", 30, "gold", 200_000, { rewards: ["addon:nobre:1"] }),
  a("gold_1m", "Magnata do Limão", "Ganhe 1.000.000 de ouro", "🍋", 60, "gold", 1_000_000, { rewards: ["addon:nobre:2", "title:magnata"], rare: true }),
  // Gancho de outros sistemas (missões e grupo): só contam quando esses sistemas chamam achievementEvent.
  a("quest_1", "Faz-tudo", "Complete uma missão", "📜", 5, "quests", 1),
  a("quest_10", "Herói do Povo", "Complete 10 missões", "📯", 30, "quests", 10, { rewards: ["addon:monge:2", "title:heroi_povo"] }),
  a("party_10", "Trabalho em Equipe", "Derrote 10 monstros em grupo", "🤝", 15, "party", 10, { rewards: ["addon:domador:2"] }),
  // Escritório (ciclo 10): piadas internas com métricas já existentes. Os pares (métrica, alvo) não repetem nenhum dos
  // acima; só títulos de recompensa (nenhuma roupa/addon novo).
  a("chegou", "Chegou!", "Pegue 30 itens do chão", "📦", 5, "pickups", 30, { rewards: ["title:compras_onfire"] }),
  a("caiu_a_energia", "Caiu a Energia", "Morra pela primeira vez", "🔌", 5, "deaths", 1, { hidden: true }),
  a("git_caiu", "git caiu?", "Treine offline por 1 hora no total", "🌿", 5, "offline", 60),
  a("banheiro_quantico", "Banheiro Quântico", "Ande 25.000 tiles", "🚪", 20, "steps", 25_000, { rewards: ["title:superposto"] }),
  a("alinhamento_de_sexta", "Alinhamento de Sexta", "Complete 5 missões", "📅", 15, "quests", 5, { rewards: ["title:alinhado"] }),
  a("gestao_a_vista", "Gestão à Vista", "Explore 45% do mundo", "📋", 20, "explore", 45),
  a("movido_a_cafe", "Movido a Café", "Coma 100 comidas", "☕", 15, "foods", 100, { rewards: ["title:movido_a_cafe"] }),
  a("sprint_fechada", "Sprint Fechada", "Derrote 250 monstros", "🏁", 15, "kills", 250),
  a("matriz_de_requisitos", "Matriz de Requisitos", "Derrote 25 tipos de monstro diferentes", "🗂️", 25, "bestiary", 25, { rewards: ["title:documentador"] }),
  a("cubo_magico", "Cubo Mágico", "Chegue ao Magic Level 20", "🧊", 25, "magic", 20),
  a("mestre_da_frota", "Mestre da Frota", "Pegue 250 itens do chão", "🚚", 20, "pickups", 250, { rewards: ["title:mestre_da_frota"] }),
  a("reuniao_geral", "Reunião Geral", "Derrote 50 monstros em grupo", "📺", 25, "party", 50),
  // Malha da Ferrovia (ciclo 11): chefes da via e métricas existentes com pares (métrica, alvo) que não se repetem.
  a("vagao_inspecionado", "Vagão Inspecionado", "Derrote o Vagão Não Inspecionável", "🚃", 30, "boss:vagao_nao_inspecionavel", 1, { rewards: ["title:inspetor_de_via"], rare: true }),
  a("ultimo_apito", "Último Apito", "Derrote O Trem Que Nunca Encerra", "🚂", 40, "boss:locomotiva_fantasma", 1, { rewards: ["title:ferroviario"], rare: true }),
  a("horario_cumprido", "Horário Cumprido", "Derrote O Trem Que Nunca Encerra 5 vezes", "⏱️", 40, "boss:locomotiva_fantasma", 5, { rare: true }),
  a("dormente", "Dormente", "Treine offline por 6 horas no total", "🛤️", 15, "offline", 360, { rewards: ["title:dormente"] }),
  a("bitola_larga", "Bitola Larga", "Ande 100.000 tiles", "📏", 35, "steps", 100_000),
  a("passagem_liberada", "Passagem Liberada", "Complete 15 missões", "🚦", 35, "quests", 15),
  // Trabalho real (ciclo 11): tarefas fechadas no ClickUp pela conta vinculada por admin (/vincular). Só contagem.
  a("work_1", "Primeira Entrega", "Feche 1 tarefa no ClickUp vinculado", "✅", 5, "work_tasks", 1, { rewards: ["title:entregador"] }),
  a("work_10", "Sprint Entregue", "Feche 10 tarefas no ClickUp vinculado", "🏁", 15, "work_tasks", 10, { rewards: ["title:fechador_sprint"] }),
  a("work_50", "Quadro Limpo", "Feche 50 tarefas no ClickUp vinculado", "📌", 30, "work_tasks", 50, { rewards: ["title:mestre_kanban"] }),
  a("work_200", "Backlog Zerado", "Feche 200 tarefas no ClickUp vinculado", "🏆", 50, "work_tasks", 200, { rewards: ["title:lenda_backlog"], rare: true }),
];

export const ACHIEVEMENTS_BY_ID: Record<string, AchievementDef> = Object.fromEntries(ACHIEVEMENTS.map((x) => [x.id, x]));
export const TOTAL_ACHIEVEMENT_POINTS = ACHIEVEMENTS.reduce((s, x) => s + x.points, 0);

// --- ids de desbloqueio ---------------------------------------------------------------------------------------------

export const outfitUnlockId = (outfit: string): string => `outfit:${outfit}`;
export const addonUnlockId = (outfit: string, bit: 1 | 2): string => `addon:${outfit}:${bit}`;
export const titleUnlockId = (title: string): string => `title:${title}`;

/** Id de desbloqueio válido (existe no catálogo)? */
export function isValidUnlockId(id: string): boolean {
  const [kind, a1, a2] = id.split(":");
  if (kind === "outfit") return !!a1 && Object.hasOwn(OUTFITS, a1) && a2 === undefined;
  if (kind === "addon") return !!a1 && Object.hasOwn(OUTFITS, a1) && (a2 === "1" || a2 === "2");
  if (kind === "title") return !!a1 && Object.hasOwn(TITLES, a1) && a2 === undefined;
  return false;
}

/**
 * Argumento do /desbloquear → id de desbloqueio. Aceita o id da roupa ("pirata"), o id do addon ("pirata_chapeu")
 * ou o id completo ("outfit:pirata", "addon:pirata:1", "title:persistente"). null = não reconhecido.
 */
export function resolveUnlockArg(arg: string): string | null {
  const a = arg.trim().toLowerCase();
  if (isValidUnlockId(a)) return a;
  if (Object.hasOwn(OUTFITS, a)) return outfitUnlockId(a);
  for (const o of Object.values(OUTFITS)) {
    const i = o.addons.findIndex((x) => x.id === a);
    if (i >= 0) return addonUnlockId(o.id, (i + 1) as 1 | 2);
  }
  if (Object.hasOwn(TITLES, a)) return titleUnlockId(a);
  return null;
}

/** Texto PT-BR de uma recompensa ("Roupa: Pirata", "Addon: Chapéu de pirata (Pirata)", "Título: o Persistente"). */
export function unlockText(id: string): string {
  const [kind, a1, a2] = id.split(":");
  if (kind === "outfit") return `Roupa: ${OUTFITS[a1!]?.name ?? a1}`;
  if (kind === "addon") return `Addon: ${OUTFITS[a1!]?.addons[Number(a2) - 1]?.name ?? id} (${OUTFITS[a1!]?.name ?? a1})`;
  if (kind === "title") return `Título: ${TITLES[a1!] ?? a1}`;
  return id;
}

/** A roupa já vem liberada (padrão da vocação e Cidadão)? Addons nunca vêm liberados. */
export function isFreeOutfit(outfitId: string, vocation: string): boolean {
  return outfitId === "cidadao" || outfitId === defaultOutfit(vocation);
}

/** A roupa (bit 0) ou o addon (1|2) está liberado para quem tem estes desbloqueios? (mesma regra no servidor e no cliente) */
export function isUnlockedIn(unlocks: readonly string[], vocation: string, outfitId: string, bit: 0 | 1 | 2): boolean {
  if (!Object.hasOwn(OUTFITS, outfitId)) return false;
  if (bit === 0) return isFreeOutfit(outfitId, vocation) || unlocks.includes(outfitUnlockId(outfitId));
  return unlocks.includes(addonUnlockId(outfitId, bit));
}

/** Conquista que concede esta roupa/addon/título; undefined se é de graça. */
export function achievementForUnlock(unlockId: string): AchievementDef | undefined {
  return ACHIEVEMENTS.find((x) => x.rewards?.includes(unlockId));
}

/** "Desbloqueie: ..." para uma roupa (bit 0) ou addon (1|2). */
export function unlockRequirement(outfitId: string, bit: 0 | 1 | 2): string {
  const ach = achievementForUnlock(bit === 0 ? outfitUnlockId(outfitId) : addonUnlockId(outfitId, bit));
  return ach ? `Desbloqueie: ${ach.desc}` : "Bloqueado";
}

// --- mensagens ---------------------------------------------------------------------------------------------------------

/** Cliente → servidor: escolhe o título ativo ("" = nenhum). */
export interface SetTitleMsg { title: string }
/** Servidor → cliente: conquista desbloqueada (toast). */
export interface AchievementUnlockedMsg { id: string; name: string; points: number; rewards: string[] }
/** Servidor → cliente: estado completo das conquistas (ao entrar e a cada mudança). */
export interface AchievementsMsg {
  /** id → ms epoch em que foi concluída. */
  done: Record<string, number>;
  /** id → valor atual da métrica (só das não concluídas com progresso). */
  progress: Record<string, number>;
  points: number;
  /** Ids de desbloqueio ("outfit:x", "addon:x:1", "title:x") do personagem. */
  unlocks: string[];
  /** Título ativo (id) ou "". */
  title: string;
  /** Bestiário: id do monstro já derrotado → quantos abates (chefes incluídos). Ausente = ainda não derrotou. */
  bestiary?: Record<string, number>;
}

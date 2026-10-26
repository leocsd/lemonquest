import { findObjects, objectTile, type TiledMap, type TiledObject } from "../map.ts";
import { monsterDef } from "./monsters.ts";

// Quests de mundo no estilo Tibia (dados + regras puras; servidor = autoridade):
// - Baús de quest (objeto "quest_chest" do mapa, prop `chestId`): cada personagem abre UMA vez por grupo. Baús do mesmo
//   grupo são uma escolha ("pegue um dos quatro"): abrir um esvazia os outros para aquele personagem. Grupo com
//   `needBoss` (covis, ciclo 16) só abre para o personagem que tem o abate do chefe registrado; o baú com prop `drawn`
//   não tem tile no mapa (o cliente desenha e a grade de colisão bloqueia pelo objeto: shared/map.ts).
// - Portas de level/missão: objetos "portal" com `minLevel`, `quest` (missão concluída) e/ou `chestGroup` (baú aberto).
//   Quem não cumpre bate na porta e volta para o tile de onde veio.
// - Alavancas de grupo (objeto "quest_lever"): com jogadores em pelo menos `minPlayers` placas, puxar a alavanca leva
//   todos para a sala da quest e solta os monstros, em número proporcional ao grupo (Aniquilação e, desde o ciclo 20, o
//   Crash Test da Montadora). As posições (placas, destinos, sala, monstros) vêm do mapa.

export interface QuestChestGroupDef {
  id: string;
  /** Nome da quest (aviso ao abrir e diário). */
  name: string;
  /** Onde fica (dica no diário). */
  where: string;
  minLevel: number;
  /**
   * Chefe (id de MONSTERS) que o personagem precisa ter derrotado para abrir o grupo. O registro é do servidor
   * (systems/quests.ts) e usa o crédito do passo "boss" de missão: quem bateu perto do chefe e os membros do grupo perto
   * dele. Abate no Coliseu, invocação e ajudante de monstro não contam. Um item não serve: passaria de mão em mão para
   * qualquer personagem (a prova que o chefe deixa cair é só troféu).
   */
  needBoss?: string;
}

export interface QuestChestDef {
  id: string;
  group: string;
  items?: { itemId: string; count: number }[];
  gold?: number;
  /** Desbloqueio (roupa/addon/título) ao abrir. */
  unlock?: string;
}

export interface QuestLeverDef {
  id: string;
  name: string;
  minLevel: number;
  /** Máximo de jogadores (= placas do mapa; um por placa). */
  players: number;
  /** Mínimo de jogadores ocupando placas para a alavanca mexer. */
  minPlayers: number;
  /** Ids de MONSTERS soltos na sala com o grupo cheio, na ordem das posições `spawns` do objeto do mapa. */
  monsters: string[];
  /** Aviso a quem entra (ausente = o texto da Aniquilação, que fala em demônios). */
  startText?: string;
}

/**
 * Monstros soltos para `n` jogadores: a mesma carga por cabeça do grupo cheio (6 demônios ÷ 4 = 1,5 cada),
 * arredondada para cima — 4 → 6, 3 → 5, 2 → 3. Grupo menor não fica mais fácil por jogador, só cabe no escritório.
 */
export function leverMonsters(def: QuestLeverDef, n: number): string[] {
  const k = Math.max(1, Math.min(def.players, Math.floor(n)));
  return def.monsters.slice(0, Math.min(def.monsters.length, Math.ceil((def.monsters.length * k) / def.players)));
}

/** Distância (Chebyshev) para abrir um baú ou puxar uma alavanca. */
export const QUEST_OBJECT_RANGE = 1;

export const QUEST_CHEST_GROUPS: Record<string, QuestChestGroupDef> = {
  banuta_cache: { id: "banuta_cache", name: "O Esconderijo da Selva", where: "Ruínas da Selva de Banuta", minLevel: 25 },
  pirate_treasure: { id: "pirate_treasure", name: "O Tesouro do Barba-Ruiva", where: "Caverna dos Piratas", minLevel: 35 },
  banuta_idol: { id: "banuta_idol", name: "O Ídolo de Banuta", where: "Santuário do Templo de Banuta", minLevel: 40 },
  frost_cache: { id: "frost_cache", name: "O Baú do Yeti", where: "Caverna do Yeti", minLevel: 60 },
  hero_quest: { id: "hero_quest", name: "A Quest dos Heróis", where: "Caverna dos Heróis", minLevel: 65 },
  volcano_summit: { id: "volcano_summit", name: "O Cume do Vulcão", where: "Cratera do Vulcão de Goroma", minLevel: 80 },
  annihilator: { id: "annihilator", name: "A Aniquilação", where: "Cidadela de Ferumbras", minLevel: 100 },
  // Covis das caves profundas (ciclo 16): baú desenhado na sala do fundo, trancado até o personagem derrotar o chefe.
  lair_minas: { id: "lair_minas", name: "O Covil do Rei Toupeira", where: "Covil das Minas Abandonadas", minLevel: 25, needBoss: "lair_mole_king" },
  lair_grutas: { id: "lair_grutas", name: "O Covil do Kraken", where: "Covil das Grutas Alagadas", minLevel: 50, needBoss: "lair_kraken" },
  lair_catacumbas: { id: "lair_catacumbas", name: "O Covil da Chama Ancestral", where: "Covil das Catacumbas Esquecidas", minLevel: 75, needBoss: "lair_flame" },
  lair_profundo: { id: "lair_profundo", name: "O Covil do Shogun", where: "Covil do Abismo Profundo", minLevel: 110, needBoss: "lair_shogun" },
  // Montadora (ciclo 20): baús do fim do Crash Test (alavanca), escolha única por personagem como a Aniquilação.
  crash_test: { id: "crash_test", name: "Crash Test", where: "Boxe dos Troféus, sob a Pista de Testes", minLevel: 95 },
};

const chest = (id: string, group: string, extra: Omit<QuestChestDef, "id" | "group">): QuestChestDef => ({ id, group, ...extra });
const one = (itemId: string, count = 1) => [{ itemId, count }];

export const QUEST_CHESTS: Record<string, QuestChestDef> = Object.fromEntries([
  chest("banuta_cache", "banuta_cache", { gold: 3000, items: [{ itemId: "ring_furia", count: 1 }, { itemId: "gem_green", count: 3 }] }),
  chest("pirate_saber", "pirate_treasure", { items: one("pirate_saber") }),
  chest("pirate_bow", "pirate_treasure", { items: one("corsair_bow") }),
  chest("pirate_wand", "pirate_treasure", { items: one("tide_wand") }),
  chest("pirate_rod", "pirate_treasure", { items: one("coral_rod") }),
  chest("banuta_idol", "banuta_idol", { gold: 5000, items: one("amulet_banuta") }),
  chest("frost_ring", "frost_cache", { items: one("frost_ring") }),
  chest("frost_might", "frost_cache", { items: one("ring_might") }),
  chest("frost_amulet", "frost_cache", { items: one("amulet_dragon") }),
  chest("hero_sword", "hero_quest", { items: one("fire_sword") }),
  chest("hero_bow", "hero_quest", { items: one("royal_crossbow") }),
  chest("hero_wand", "hero_quest", { items: one("starstorm_wand") }),
  chest("hero_rod", "hero_quest", { items: one("northwind_rod") }),
  chest("volcano_summit", "volcano_summit", { gold: 10000, items: one("boots_haste") }),
  // Aniquilação (ciclo 16): um prêmio único por vocação, de cima para baixo cavaleiro, paladino, feiticeiro e druida
  // (a ordem dos baús do Barba-Ruiva e dos Heróis). Os ids são os objetos do mapa em produção e ficam, mesmo sem bater
  // com o conteúdo (antes: Armadura de Placas Mágica, Espada Longa Mágica, Cortapedras ou o urso com 50 mil). O urso
  // vai em todos: é o troféu de quem sobreviveu.
  chest("anni_armor", "annihilator", { items: [...one("stonecutter_axe"), ...one("annihilation_bear")], unlock: "title:aniquilador" }),
  chest("anni_sword", "annihilator", { items: [...one("annihilator_bow"), ...one("annihilation_bear")], unlock: "title:aniquilador" }),
  chest("anni_axe", "annihilator", { items: [...one("annihilator_wand"), ...one("annihilation_bear")], unlock: "title:aniquilador" }),
  chest("anni_bear", "annihilator", { items: [...one("annihilator_rod"), ...one("annihilation_bear")], unlock: "title:aniquilador" }),
  // Covis (ciclo 16): ouro e materiais iguais nos baús do mesmo covil; o equipamento é a escolha (um baú por opção).
  ...lairChests("lair_minas", 4000, [["gem_green", 3], ["iron_bar", 3]], {
    lair_minas_furia: "ring_furia", lair_minas_lich: "amulet_lich", lair_minas_protecao: "amulet_protecao",
  }),
  ...lairChests("lair_grutas", 10000, [["gem_yellow", 3], ["mithril_bar", 1]], {
    lair_grutas_might: "ring_might", lair_grutas_labirinto: "amulet_minotaur", lair_grutas_engrenagens: "anel_do_rodeiro",
  }),
  ...lairChests("lair_catacumbas", 25000, [["gem_purple", 3], ["mithril_bar", 2]], {
    lair_catacumbas_knight: "demon_armor", lair_catacumbas_paladin: "dragon_scale_armor", lair_catacumbas_mage: "ferumbras_armor",
  }),
  ...lairChests("lair_profundo", 50000, [["demonic_essence", 5], ["gem_purple", 5]], {
    lair_profundo_amulet: "amulet_orshabaal", lair_profundo_ring: "ring_demodras", lair_profundo_boots: "boots_haste",
  }),
  // Crash Test (ciclo 20): um anel por vocação, de cima para baixo cavaleiro, paladino, feiticeiro e druida (a ordem da
  // Aniquilação); o Cromo Puro vai em todos.
  chest("mt_crash_knight", "crash_test", { items: [...one("mt_anel_para_choque"), ...one("mt_cromo", 2)] }),
  chest("mt_crash_paladin", "crash_test", { items: [...one("mt_anel_retrovisor"), ...one("mt_cromo", 2)] }),
  chest("mt_crash_sorcerer", "crash_test", { items: [...one("mt_anel_ignicao"), ...one("mt_cromo", 2)] }),
  chest("mt_crash_druid", "crash_test", { items: [...one("mt_anel_radiador"), ...one("mt_cromo", 2)] }),
].map((c) => [c.id, c]));

function lairChests(group: string, gold: number, mats: [string, number][], choices: Record<string, string>): QuestChestDef[] {
  return Object.entries(choices).map(([id, itemId]) => chest(id, group, { gold, items: [...one(itemId), ...mats.map(([m, n]) => ({ itemId: m, count: n }))] }));
}

/** A ordem dos objetos "quest_lever" no mapa segue a deste objeto (questWorld.test.ts). */
export const QUEST_LEVERS: Record<string, QuestLeverDef> = {
  annihilator: { id: "annihilator", name: "A Aniquilação", minLevel: 100, players: 4, minPlayers: 2, monsters: ["demon", "demon", "demon", "demon", "demon", "demon"] },
  // Montadora (ciclo 20), sob a Pista de Testes: com 2 jogadores saem dublê, montador e dublê (leverMonsters).
  crash_test: {
    id: "crash_test", name: "Crash Test", minLevel: 95, players: 4, minPlayers: 2,
    monsters: ["mt_duble", "mt_robo_montador", "mt_duble", "mt_tengu_cromado", "mt_robo_montador", "mt_piloto_fantasma"],
    startText: "Crash Test começou! Derrube os bonecos e alcance os troféus.",
  },
};

export const questChestDef = (id: string): QuestChestDef | undefined => (Object.hasOwn(QUEST_CHESTS, id) ? QUEST_CHESTS[id] : undefined);
export const questChestGroup = (id: string): QuestChestGroupDef | undefined => (Object.hasOwn(QUEST_CHEST_GROUPS, id) ? QUEST_CHEST_GROUPS[id] : undefined);
export const questLeverDef = (id: string): QuestLeverDef | undefined => (Object.hasOwn(QUEST_LEVERS, id) ? QUEST_LEVERS[id] : undefined);

/** Requisitos de uma porta (props do objeto "portal"). */
export interface DoorRequirement { minLevel?: number; quest?: string; chestGroup?: string }

/**
 * Motivo de uma porta não abrir (PT-BR) ou null se pode passar. `questName` resolve o nome da missão exigida.
 */
export function doorBlockReason(
  req: DoorRequirement, level: number, questDone: (id: string) => boolean, chestDone: (group: string) => boolean,
  questName: (id: string) => string = (id) => id,
): string | null {
  if (req.minLevel && level < req.minLevel) return `A porta não se mexe. Só aventureiros de level ${req.minLevel} ou mais podem passar.`;
  if (req.quest && !questDone(req.quest)) return `A porta está selada. Conclua a missão "${questName(req.quest)}" para passar.`;
  if (req.chestGroup && !chestDone(req.chestGroup)) return `A porta está selada. Conclua "${questChestGroup(req.chestGroup)?.name ?? req.chestGroup}" para passar.`;
  return null;
}

/** Chefes que destrancam baús (`needBoss`): o servidor guarda, por personagem, só o abate destes. */
export const CHEST_LOCK_BOSSES: ReadonlySet<string> = new Set(Object.values(QUEST_CHEST_GROUPS).flatMap((g) => (g.needBoss ? [g.needBoss] : [])));

/** Texto da trava ("olhar" do baú e aviso ao tentar abrir) ou null se o grupo não tem trava. */
export function chestLockText(group: QuestChestGroupDef): string | null {
  return group.needBoss ? `Trancado: derrote o chefe do covil (${monsterDef(group.needBoss)?.name ?? group.needBoss}) para abrir` : null;
}

/** Motivo (PT-BR) de um baú com trava não abrir, ou null se abre. `slain` = o personagem tem o abate do chefe registrado. */
export function chestLockReason(group: QuestChestGroupDef, slain: (bossId: string) => boolean): string | null {
  if (!group.needBoss || slain(group.needBoss)) return null;
  return `${chestLockText(group)}.`;
}

// ---------------------------------------------------------------------------
// Leitura das props do mapa (servidor e cliente)
// ---------------------------------------------------------------------------

/** "x,y;x,y" → pontos. Entradas inválidas são ignoradas. */
export function parsePoints(s: unknown): { x: number; y: number }[] {
  if (typeof s !== "string") return [];
  return s.split(";").map((p) => p.split(",").map(Number)).filter((a) => a.length === 2 && a.every(Number.isInteger)).map(([x, y]) => ({ x: x!, y: y! }));
}

/** "x0,y0,x1,y1" → retângulo de tiles (inclusivo) ou null. */
export function parseRect(s: unknown): { x0: number; y0: number; x1: number; y1: number } | null {
  if (typeof s !== "string") return null;
  const a = s.split(",").map(Number);
  if (a.length !== 4 || !a.every(Number.isInteger)) return null;
  return { x0: a[0]!, y0: a[1]!, x1: a[2]!, y1: a[3]! };
}

const prop = (o: TiledObject, name: string): unknown => o.properties?.find((p) => p.name === name)?.value;

/**
 * Baú ou alavanca de quest no mapa (o desenho vem do próprio mapa; o tile é bloqueado). `drawn` = baú sem tile no mapa,
 * desenhado pelo cliente (covis do ciclo 16: um tile novo alteraria o mapa já em produção).
 */
export interface QuestObjectSpot { kind: "chest" | "lever"; id: string; x: number; y: number; drawn?: boolean }

export function findQuestObjects(map: TiledMap): QuestObjectSpot[] {
  const out: QuestObjectSpot[] = [];
  for (const [type, kind, key] of [["quest_chest", "chest", "chestId"], ["quest_lever", "lever", "leverId"]] as const) {
    for (const o of findObjects(map, type)) {
      const id = String(prop(o, key) ?? "");
      if (!id || out.some((s) => s.kind === kind && s.id === id)) continue;
      out.push({ kind, id, ...objectTile(o, map.tilewidth), ...(prop(o, "drawn") === true ? { drawn: true } : {}) });
    }
  }
  return out;
}

/** Alavanca de grupo no mapa: placas (um jogador em cada), destinos (mesma ordem), sala e posições dos monstros. */
export interface QuestLeverSpot {
  id: string; x: number; y: number;
  plates: { x: number; y: number }[];
  dests: { x: number; y: number }[];
  room: { x0: number; y0: number; x1: number; y1: number };
  spawns: { x: number; y: number }[];
}

export function findQuestLevers(map: TiledMap): QuestLeverSpot[] {
  const out: QuestLeverSpot[] = [];
  for (const o of findObjects(map, "quest_lever")) {
    const id = String(prop(o, "leverId") ?? "");
    const room = parseRect(prop(o, "room"));
    const plates = parsePoints(prop(o, "plates")), dests = parsePoints(prop(o, "dests"));
    if (!id || !room || !plates.length || plates.length !== dests.length) continue;
    out.push({ id, ...objectTile(o, map.tilewidth), plates, dests, room, spawns: parsePoints(prop(o, "spawns")) });
  }
  return out;
}

/** Requisitos de porta das props de um objeto "portal" (ausentes = porta comum). */
export function doorRequirement(o: TiledObject): DoorRequirement | undefined {
  const minLevel = Number(prop(o, "minLevel")) || 0;
  const quest = String(prop(o, "quest") ?? ""), chestGroup = String(prop(o, "chestGroup") ?? "");
  if (!minLevel && !quest && !chestGroup) return undefined;
  return { ...(minLevel ? { minLevel } : {}), ...(quest ? { quest } : {}), ...(chestGroup ? { chestGroup } : {}) };
}

import type { DamageKind } from "../types.ts";
import type { LootEntry } from "./items.ts";
import { CALL_HELP_ID, MONSTER_ABILITY_PREFIX, ability, type MonsterAbility } from "./monsterAbilities.ts";
import type { ConditionId, SpellDef, SpellTarget } from "./spells.ts";

/**
 * VERIFICACAO DE LAYOUT (sheets abertos e ampliados 4x): Mouse, Slime, Snake, SpiderRed, BlueBat, Skull,
 * Spirit, Lizard, Beast, Racoon, Flam, Cyclope, KappaGreen, Reptile, Bear, YellowsBat, Beast2, Panda,
 * Cyclope2, Mole, SkullBlue, Spirit2, Lizard2, Reptile2, GoldRacoon, Snake3, Larva, Mushroom, Flam2,
 * LanternRed, Owl: TODOS 64x64 = grid4 (colunas = baixo, cima, esquerda, direita; linhas = 4 frames
 * de caminhada). Nenhum monstro 16x16 fugiu do padrao.
 * NAO e grid4: os chefes (Actor/Boss/*) sao tiras horizontais 50x50 de UMA direcao (frontal, sem
 * lados). Por isso goblin_king e swamp_lich usam layout "custom" com a mesma tira nas 4 direcoes
 * (DemonCyclop2/Walk.png 6 frames; GiantSpirit/Idle.png 5 frames).
 */

/**
 * Sprite de criatura. Ninja Adventure: sheet 64x64, frames 16x16, 4x4.
 * `layout: "grid4"` = mesmo layout dos personagens (coluna = lado: 0 baixo, 1 cima, 2 esquerda, 3 direita; linhas = frames de caminhada).
 * Se algum sheet for diferente, use `layout: "custom"` com `walk` explícito.
 */
export interface CreatureSprite {
  url: string;               // relativo ao publicDir (assets/), ex.: "ninja/Actor/Monster/Slime/Slime.png"
  frameWidth: number;
  frameHeight: number;
  layout: "grid4" | "custom";
  walk?: { down: number[]; up: number[]; left: number[]; right: number[] };
  /** Escala visual (bosses maiores). Padrão 1. */
  scale?: number;
  tint?: number;
}

export interface MonsterDef {
  id: string;
  name: string;              // PT-BR, exibido no jogo
  level: number;             // nível sugerido (para cor do nome e balanceamento)
  hp: number;
  xp: number;                // XP dada ao morrer
  /** Dano por ataque [min, max] antes da defesa do alvo. */
  damage: [number, number];
  damageKind: DamageKind;
  /** Redução fixa de dano recebido. */
  armor: number;
  /**
   * Multiplicador do dano recebido por elemento (0,5 = metade; 1,25 = 25% a mais), aplicado depois da armadura.
   * Substitui o padrão por elemento; sem a chave vale `damageTakenMult` (o próprio elemento resiste).
   */
  resist?: Partial<Record<DamageKind, number>>;
  /** Morto-vivo (esqueletos, fantasmas, liches, crânios, lanternas assombradas): fraco contra sagrado (ELEMENT_WEAKNESS). */
  undead?: boolean;
  /** Intervalo entre ataques (ms). */
  attackMs: number;
  /** 1 = corpo a corpo; >1 = ataque à distância até esse alcance (Chebyshev). */
  attackRange: number;
  /** Duração do passo (ms) em chão normal. Menor = mais rápido. */
  stepMs: number;
  /** Distância (tiles) em que percebe e persegue jogadores. 0 = passivo (só revida). */
  aggroRange: number;
  /** Foge quando o HP fica abaixo desta fração (0 = nunca). */
  fleeAtHpPct: number;
  /** Respawn após morrer (ms). */
  respawnMs: number;
  boss?: boolean;
  /** Nunca anda, persegue, foge nem ataca (boneco de treino, estátuas). */
  stationary?: boolean;
  /**
   * Não perde vida (o dano aparece como números), não dá XP nem loot e não respawna. Pode ser atacado dentro de
   * zona de proteção (centro de treinamento); invocações e provocação (taunt) o ignoram.
   */
  invulnerable?: boolean;
  /** Ouro por abate [min, max] (0 = nenhum). */
  gold?: [number, number];
  /** Tabela de loot (ids de ITEMS). */
  loot?: LootEntry[];
  /** Habilidades (data/monsterAbilities.ts): usadas no lugar do ataque básico quando prontas. */
  abilities?: MonsterAbility[];
  /**
   * Bando: ao levar o 1º golpe, cair abaixo de 50% da vida ou começar a fugir, grita `shout` e chama os monstros da
   * mesma `family` a até HELP_RADIUS tiles para atacar quem bateu.
   */
  pack?: { family: string; shout: string };
  sprite: CreatureSprite;
}

const grid4 = (url: string, extra: Partial<CreatureSprite> = {}): CreatureSprite =>
  ({ url, frameWidth: 16, frameHeight: 16, layout: "grid4", ...extra });

/**
 * Tira horizontal de um chefe (uma direcao so): usa os mesmos frames nas 4 direcoes. Frames quadrados de `size`
 * (altura da tira); tira de frames largos (Giant*Samurai: 96x48) passa `frameWidth` em `extra`.
 */
const strip = (url: string, size: number, frames: number, extra: Partial<CreatureSprite> = {}): CreatureSprite => {
  const f = Array.from({ length: frames }, (_, i) => i);
  return { url, frameWidth: size, frameHeight: size, layout: "custom", walk: { down: f, up: f, left: f, right: f }, ...extra };
};

const M = "ninja/Actor/Monster/";
const B = "ninja/Actor/Boss/";
const C = "ninja/Actor/Character/";

/** Catálogo de monstros. Ids batem com `monster` dos spawns do mapa (world.json). */
export const MONSTERS: Record<string, MonsterDef> = {
  rat: {
    id: "rat", name: "Rato", level: 1, hp: 25, xp: 6, damage: [1, 4], damageKind: "physical", armor: 0,
    attackMs: 2000, attackRange: 1, stepMs: 320, aggroRange: 4, fleeAtHpPct: 0.15, respawnMs: 20_000,
    gold: [1, 4],
    loot: [
      { itemId: "nuts", chance: 0.12 },
      { itemId: "cheese", chance: 0.45, min: 1, max: 2 },
      { itemId: "health_potion", chance: 0.05 },
      { itemId: "leather_helmet", chance: 0.02 },
      { itemId: "short_sword", chance: 0.015 },
      { itemId: "wooden_club", chance: 0.015 },
    ],
    sprite: grid4(M + "Mouse/SpriteSheet.png"),
  },
  slime: {
    id: "slime", name: "Gosma", level: 2, hp: 34, xp: 10, damage: [1, 5], damageKind: "earth", armor: 1,
    attackMs: 2000, attackRange: 1, stepMs: 420, aggroRange: 3, fleeAtHpPct: 0, respawnMs: 25_000,
    gold: [2, 6],
    loot: [
      { itemId: "slime_goo", chance: 0.5, min: 1, max: 2 },
      { itemId: "herb", chance: 0.2 },
      { itemId: "health_potion", chance: 0.06 },
      { itemId: "mana_potion", chance: 0.05 },
      { itemId: "leather_shield", chance: 0.02 },
      { itemId: "leather_boots", chance: 0.02 },
    ],
    sprite: grid4(M + "Slime/Slime.png"),
  },
  bee: {
    id: "bee", name: "Abelha", level: 5, hp: 45, xp: 14, damage: [3, 10], damageKind: "physical", armor: 0,
    attackMs: 1800, attackRange: 1, stepMs: 260, aggroRange: 0, fleeAtHpPct: 0, respawnMs: 30_000,
    gold: [3, 8],
    loot: [
      { itemId: "bee_sting", chance: 0.5, min: 1, max: 2 },
      { itemId: "honey", chance: 0.2 },
      { itemId: "health_potion", chance: 0.07 },
      { itemId: "leather_armor", chance: 0.02 },
      { itemId: "leather_legs", chance: 0.02 },
      { itemId: "apprentice_wand", chance: 0.01 },
    ],
    sprite: grid4(M + "Owl/Owl.png"),
  },
  wolf: {
    id: "wolf", name: "Lobo", level: 8, hp: 80, xp: 35, damage: [6, 15], damageKind: "physical", armor: 1,
    attackMs: 1600, attackRange: 1, stepMs: 280, aggroRange: 6, fleeAtHpPct: 0, respawnMs: 40_000,
    pack: { family: "wolf", shout: "Auuuu!" },
    gold: [8, 20],
    loot: [
      { itemId: "meat", chance: 0.1 },
      { itemId: "wolf_pelt", chance: 0.5 },
      { itemId: "wolf_fang", chance: 0.3, min: 1, max: 2 },
      { itemId: "health_potion", chance: 0.08 },
      { itemId: "mana_potion", chance: 0.05 },
      { itemId: "bronze_helmet", chance: 0.02 },
      { itemId: "hand_axe", chance: 0.012 },
      { itemId: "longsword", chance: 0.012 },
      { itemId: "ranger_boots", chance: 0.01 },
      { itemId: "hunting_bow", chance: 0.01 },
    ],
    sprite: grid4(M + "Racoon/SpriteSheet.png", { tint: 0xc0c0d0 }),
  },
  /** Invocação da magia "Invocar Lobo" (druida): aliado temporário, nunca nasce no mapa. */
  summoned_wolf: {
    id: "summoned_wolf", name: "Lobo Espiritual", level: 20, hp: 180, xp: 0, damage: [14, 26], damageKind: "physical", armor: 3,
    attackMs: 1600, attackRange: 1, stepMs: 240, aggroRange: 0, fleeAtHpPct: 0, respawnMs: 0,
    sprite: grid4(M + "Racoon/SpriteSheet.png", { tint: 0x9fd8ff }),
  },
  snake: {
    id: "snake", name: "Cobra", level: 12, hp: 140, xp: 60, damage: [10, 22], damageKind: "earth", armor: 3,
    attackMs: 2000, attackRange: 1, stepMs: 380, aggroRange: 5, fleeAtHpPct: 0, respawnMs: 45_000,
    gold: [14, 32],
    loot: [
      { itemId: "fish", chance: 0.08 },
      { itemId: "snake_skin", chance: 0.5 },
      { itemId: "herb", chance: 0.15, min: 1, max: 2 },
      { itemId: "health_potion", chance: 0.08 },
      { itemId: "mana_potion", chance: 0.06 },
      { itemId: "bronze_legs", chance: 0.02 },
      { itemId: "bronze_shield", chance: 0.02 },
      { itemId: "apprentice_boots", chance: 0.015 },
      { itemId: "thorn_rod", chance: 0.012 },
      { itemId: "ring_vigor", chance: 0.01 },
    ],
    sprite: grid4(M + "Snake3/Snake3.png"),
  },
  spider: {
    id: "spider", name: "Aranha", level: 16, hp: 180, xp: 100, damage: [12, 26], damageKind: "earth", armor: 4,
    attackMs: 2200, attackRange: 3, stepMs: 360, aggroRange: 6, fleeAtHpPct: 0, respawnMs: 50_000,
    gold: [20, 45],
    loot: [
      { itemId: "noodle", chance: 0.04 },
      { itemId: "spider_silk", chance: 0.5, min: 1, max: 2 },
      { itemId: "spider_eye", chance: 0.3 },
      { itemId: "health_potion_medium", chance: 0.06 },
      { itemId: "mana_potion_medium", chance: 0.07 },
      { itemId: "iron_helmet", chance: 0.02 },
      { itemId: "iron_boots", chance: 0.015 },
      { itemId: "adept_helmet", chance: 0.015 },
      { itemId: "hunter_boots", chance: 0.015 },
      { itemId: "long_bow", chance: 0.01 },
      { itemId: "amulet_vida", chance: 0.01 },
    ],
    sprite: grid4(M + "SpiderRed/SpriteSheet.png"),
  },
  bat: {
    id: "bat", name: "Morcego", level: 18, hp: 170, xp: 100, damage: [14, 28], damageKind: "physical", armor: 2,
    attackMs: 1800, attackRange: 1, stepMs: 240, aggroRange: 7, fleeAtHpPct: 0, respawnMs: 45_000,
    gold: [22, 48],
    loot: [
      { itemId: "bat_wing", chance: 0.5, min: 1, max: 2 },
      { itemId: "health_potion_medium", chance: 0.06 },
      { itemId: "mana_potion_medium", chance: 0.05 },
      { itemId: "iron_legs", chance: 0.02 },
      { itemId: "iron_shield", chance: 0.02 },
      { itemId: "hunter_helmet", chance: 0.015 },
      { itemId: "frost_rod", chance: 0.01 },
      { itemId: "ring_mente", chance: 0.01 },
    ],
    sprite: grid4(M + "BlueBat/SpriteSheet.png"),
  },
  skeleton: {
    id: "skeleton", name: "Esqueleto", level: 24, hp: 280, xp: 200, damage: [20, 42], damageKind: "physical", armor: 6, undead: true,
    attackMs: 2000, attackRange: 1, stepMs: 400, aggroRange: 5, fleeAtHpPct: 0, respawnMs: 60_000,
    gold: [35, 75],
    loot: [
      { itemId: "bone", chance: 0.6, min: 1, max: 2 },
      { itemId: "health_potion_medium", chance: 0.07 },
      { itemId: "mana_potion_medium", chance: 0.06 },
      { itemId: "iron_armor", chance: 0.03 },
      { itemId: "steel_helmet", chance: 0.02 },
      { itemId: "steel_legs", chance: 0.015 },
      { itemId: "adept_armor", chance: 0.02 },
      { itemId: "ring_mente", chance: 0.015 },
      { itemId: "amulet_arcano", chance: 0.015 },
    ],
    sprite: grid4(M + "SkullBlue/SpriteSheet.png"),
  },
  goblin: {
    id: "goblin", name: "Goblin", level: 25, hp: 280, xp: 200, damage: [18, 40], damageKind: "physical", armor: 6,
    attackMs: 1800, attackRange: 1, stepMs: 340, aggroRange: 6, fleeAtHpPct: 0.2, respawnMs: 60_000,
    pack: { family: "goblin", shout: "Goblins, aqui!" },
    gold: [35, 80],
    loot: [
      { itemId: "onigiri", chance: 0.06 },
      { itemId: "goblin_tooth", chance: 0.45 },
      { itemId: "iron_bar", chance: 0.08 },
      { itemId: "health_potion_medium", chance: 0.08 },
      { itemId: "mana_potion_medium", chance: 0.05 },
      { itemId: "steel_blade", chance: 0.012 },
      { itemId: "steel_armor", chance: 0.015 },
      { itemId: "steel_shield", chance: 0.02 },
      { itemId: "sniper_boots", chance: 0.01 },
      { itemId: "ring_pressa", chance: 0.01 },
      { itemId: "amulet_protecao", chance: 0.01 },
    ],
    sprite: grid4(M + "Reptile2/Reptile2.png"),
  },
  ghost: {
    id: "ghost", name: "Fantasma", level: 31, hp: 380, xp: 360, damage: [25, 50], damageKind: "death", armor: 5, undead: true,
    attackMs: 2000, attackRange: 1, stepMs: 360, aggroRange: 6, fleeAtHpPct: 0, respawnMs: 70_000,
    gold: [55, 110],
    loot: [
      { itemId: "ectoplasm", chance: 0.5 },
      { itemId: "health_potion_large", chance: 0.06 },
      { itemId: "mana_potion_large", chance: 0.06 },
      { itemId: "arcane_helmet", chance: 0.02 },
      { itemId: "arcane_armor", chance: 0.02 },
      { itemId: "ring_furia", chance: 0.01 },
      { itemId: "gem_purple", chance: 0.03 },
    ],
    sprite: grid4(M + "Spirit/SpriteSheet.png"),
  },
  lizardman: {
    id: "lizardman", name: "Homem-Lagarto", level: 34, hp: 450, xp: 460, damage: [30, 60], damageKind: "physical", armor: 10,
    attackMs: 1800, attackRange: 1, stepMs: 360, aggroRange: 6, fleeAtHpPct: 0, respawnMs: 75_000,
    gold: [70, 140],
    loot: [
      { itemId: "beaf", chance: 0.05 },
      { itemId: "lizard_scale", chance: 0.5 },
      { itemId: "health_potion_large", chance: 0.07 },
      { itemId: "mana_potion_large", chance: 0.04 },
      { itemId: "mithril_boots", chance: 0.015 },
      { itemId: "mithril_helmet", chance: 0.01 },
      { itemId: "sniper_helmet", chance: 0.015 },
      { itemId: "master_archer_boots", chance: 0.012 },
      { itemId: "master_archer_legs", chance: 0.008 },
      { itemId: "gem_green", chance: 0.04 },
      { itemId: "elven_bow", chance: 0.005 },
    ],
    sprite: grid4(M + "Lizard/Lizard.png"),
  },
  flame_spirit: {
    id: "flame_spirit", name: "Espírito de Chama", level: 38, hp: 480, xp: 600, damage: [35, 70], damageKind: "fire", armor: 8,
    attackMs: 2000, attackRange: 4, stepMs: 380, aggroRange: 7, fleeAtHpPct: 0, respawnMs: 80_000,
    gold: [90, 180],
    loot: [
      { itemId: "ember", chance: 0.55 },
      { itemId: "health_potion_large", chance: 0.08 },
      { itemId: "mana_potion_large", chance: 0.08 },
      { itemId: "mithril_legs", chance: 0.015 },
      { itemId: "archmage_armor", chance: 0.015 },
      { itemId: "master_archer_armor", chance: 0.01 },
      { itemId: "master_archer_helmet", chance: 0.01 },
      { itemId: "inferno_wand", chance: 0.008 },
      { itemId: "gem_yellow", chance: 0.04 },
      { itemId: "ring_dragon", chance: 0.008 },
    ],
    sprite: grid4(M + "Flam/SpriteSheet.png"),
  },
  goblin_king: {
    id: "goblin_king", name: "Rei Goblin", level: 40, hp: 6000, xp: 6000, damage: [60, 120], damageKind: "physical", armor: 15,
    abilities: [
      ability.stomp({ name: "Pisão do Rei", radius: 1, min: 70, max: 130, cooldownMs: 12_000 }),
      ability.summon({ name: "Guardas!", monsterId: "goblin", count: 2, max: 3, cooldownMs: 25_000 }),
    ],
    attackMs: 2000, attackRange: 1, stepMs: 420, aggroRange: 8, fleeAtHpPct: 0, respawnMs: 7_200_000, boss: true,
    gold: [1500, 2500],
    loot: [
      { itemId: "goblin_crown", chance: 1 },
      { itemId: "health_potion_large", chance: 1, min: 2, max: 4 },
      { itemId: "dragon_axe", chance: 0.25 },
      { itemId: "amulet_goblin_king", chance: 0.3 },
      { itemId: "mithril_katana", chance: 0.2 },
      { itemId: "mithril_bar", chance: 0.4, min: 1, max: 2 },
      { itemId: "mithril_armor", chance: 0.2 },
      { itemId: "master_archer_armor", chance: 0.2 },
    ],
    sprite: strip(B + "DemonCyclop2/Walk.png", 50, 6, { scale: 1.5 }),
  },
  training_dummy: {
    id: "training_dummy", name: "Boneco de Treino", level: 1, hp: 1_000_000, xp: 0, damage: [0, 0], damageKind: "physical", armor: 0,
    attackMs: 2000, attackRange: 1, stepMs: 900, aggroRange: 0, fleeAtHpPct: 0, respawnMs: 5_000,
    stationary: true, invulnerable: true,
    sprite: grid4(M + "BambooYellow/SpriteSheet.png"),
  },
  swamp_lich: {
    id: "swamp_lich", name: "Lich do Pântano", level: 25, hp: 3500, xp: 2500, damage: [30, 70], damageKind: "death", armor: 8, undead: true,
    abilities: [
      ability.blast({ name: "Nuvem Tóxica", radius: 1, range: 5, min: 35, max: 65, kind: "earth", fx: "earth", condition: { id: "poison", durationMs: 8000, value: 8 } }),
      ability.summon({ name: "Levantem-se!", monsterId: "skeleton", count: 1, max: 2, cooldownMs: 25_000 }),
    ],
    attackMs: 2200, attackRange: 5, stepMs: 500, aggroRange: 8, fleeAtHpPct: 0, respawnMs: 7_200_000, boss: true,
    gold: [1000, 1800],
    loot: [
      { itemId: "crypt_key", chance: 1 },
      { itemId: "health_potion_large", chance: 1, min: 2, max: 4 },
      { itemId: "mana_potion_large", chance: 1, min: 2, max: 4 },
      { itemId: "amulet_lich", chance: 0.3 },
      { itemId: "archmage_helmet", chance: 0.25 },
      { itemId: "glacier_rod", chance: 0.1 },
      { itemId: "gem_purple", chance: 0.8, min: 1, max: 2 },
      { itemId: "mithril_bar", chance: 0.3 },
    ],
    sprite: strip(B + "GiantSpirit/Idle.png", 50, 5, { tint: 0xb090e0, scale: 1.5 }),
  },
  // ------------------------------------------------------------------ Terras Selvagens (fim de jogo, lv 40-100)
  // Hunts nostálgicas do Tibia: Fortaleza Orc, Labirinto dos Minotauros, Monte Ciclope, Cemitério dos Olhos,
  // Vale dos Dragões e o Abismo (demônios + Orshabaal).
  orc_warrior: {
    id: "orc_warrior", name: "Orc Guerreiro", level: 42, hp: 700, xp: 900, damage: [40, 80], damageKind: "physical", armor: 12,
    attackMs: 1800, attackRange: 1, stepMs: 320, aggroRange: 6, fleeAtHpPct: 0, respawnMs: 80_000,
    pack: { family: "orc", shout: "Orcs, ao ataque!" },
    gold: [100, 200],
    loot: [
      { itemId: "orc_leather", chance: 0.45 },
      { itemId: "meat", chance: 0.2, min: 1, max: 2 },
      { itemId: "health_potion_large", chance: 0.08 },
      { itemId: "steel_shield", chance: 0.03 },
      { itemId: "battle_axe", chance: 0.012 },
      { itemId: "mithril_helmet", chance: 0.01 },
      { itemId: "crown_helmet", chance: 0.004 },
      { itemId: "crown_boots", chance: 0.004 },
    ],
    sprite: grid4(M + "Beast2/Beast2.png", { tint: 0x9fd08a }),
  },
  orc_shaman: {
    id: "orc_shaman", name: "Orc Xamã", level: 44, hp: 600, xp: 800, damage: [35, 70], damageKind: "energy", armor: 8,
    abilities: [
      ability.healAllies({ name: "Bênção Xamânica", pct: 0.12, radius: 4, belowHpPct: 0.7, cooldownMs: 10000 }),
      ability.heal({ name: "Cura Xamânica", pct: 0.15, belowHpPct: 0.5, cooldownMs: 12_000 }),
    ],
    attackMs: 2200, attackRange: 4, stepMs: 360, aggroRange: 7, fleeAtHpPct: 0.15, respawnMs: 80_000,
    pack: { family: "orc", shout: "Orcs, ao ataque!" },
    gold: [110, 210],
    loot: [
      { itemId: "orc_leather", chance: 0.3 },
      { itemId: "herb", chance: 0.3, min: 1, max: 3 },
      { itemId: "mana_potion_large", chance: 0.1 },
      { itemId: "ember_wand", chance: 0.012 },
      { itemId: "moss_rod", chance: 0.012 },
      { itemId: "archmage_helmet", chance: 0.006 },
      { itemId: "mystic_helmet", chance: 0.004 },
    ],
    sprite: grid4(M + "Beast2/Beast2.png", { tint: 0xc8a0ff }),
  },
  minotaur: {
    id: "minotaur", name: "Minotauro", level: 48, hp: 900, xp: 1260, damage: [50, 95], damageKind: "physical", armor: 14,
    attackMs: 1800, attackRange: 1, stepMs: 330, aggroRange: 6, fleeAtHpPct: 0, respawnMs: 80_000,
    pack: { family: "minotaur", shout: "Muuu! Irmãos!" },
    gold: [130, 250],
    loot: [
      { itemId: "minotaur_horn", chance: 0.45 },
      { itemId: "beaf", chance: 0.15 },
      { itemId: "health_potion_large", chance: 0.09 },
      { itemId: "mithril_legs", chance: 0.012 },
      { itemId: "mithril_boots", chance: 0.015 },
      { itemId: "crown_legs", chance: 0.004 },
      { itemId: "royal_legs", chance: 0.004 },
    ],
    sprite: grid4(M + "Bear/SpriteSheet.png", { tint: 0xc89870 }),
  },
  minotaur_mage: {
    id: "minotaur_mage", name: "Minotauro Mago", level: 50, hp: 800, xp: 1150, damage: [45, 90], damageKind: "fire", armor: 10,
    abilities: [
      ability.healAllies({ name: "Bálsamo Taurino", pct: 0.12, radius: 4, belowHpPct: 0.7, cooldownMs: 10000 }),
      ability.blast({ name: "Bola de Fogo", radius: 1, range: 4, min: 50, max: 95, kind: "fire", fx: "fire", chance: 0.6, cooldownMs: 8000 }),
    ],
    attackMs: 2200, attackRange: 4, stepMs: 360, aggroRange: 7, fleeAtHpPct: 0, respawnMs: 80_000,
    pack: { family: "minotaur", shout: "Muuu! Irmãos!" },
    gold: [140, 260],
    loot: [
      { itemId: "minotaur_horn", chance: 0.35 },
      { itemId: "mana_potion_large", chance: 0.12 },
      { itemId: "gem_yellow", chance: 0.05 },
      { itemId: "inferno_wand", chance: 0.008 },
      { itemId: "glacier_rod", chance: 0.008 },
      { itemId: "mystic_legs", chance: 0.005 },
      { itemId: "mystic_boots", chance: 0.005 },
    ],
    sprite: grid4(M + "Bear/SpriteSheet.png", { tint: 0xa088e0 }),
  },
  cyclops: {
    id: "cyclops", name: "Ciclope", level: 55, hp: 1200, xp: 1800, damage: [65, 130], damageKind: "physical", armor: 18,
    abilities: [
      ability.stomp({ name: "Pisão", radius: 1, min: 70, max: 135, windupMs: 700 }),
    ],
    attackMs: 2200, attackRange: 1, stepMs: 400, aggroRange: 6, fleeAtHpPct: 0, respawnMs: 90_000,
    gold: [160, 300],
    loot: [
      { itemId: "cyclops_eye", chance: 0.4 },
      { itemId: "meat", chance: 0.3, min: 1, max: 3 },
      { itemId: "health_potion_large", chance: 0.1 },
      { itemId: "iron_bar", chance: 0.15 },
      { itemId: "giant_sword", chance: 0.005 },
      { itemId: "crown_armor", chance: 0.004 },
      { itemId: "royal_helmet", chance: 0.005 },
      { itemId: "ring_might", chance: 0.004 },
    ],
    sprite: grid4(M + "Cyclope/SpriteSheet.png", { tint: 0xe0b890 }),
  },
  bonelord: {
    id: "bonelord", name: "Olho Maligno", level: 60, hp: 1100, xp: 1760, damage: [55, 110], damageKind: "death", armor: 10, undead: true,
    abilities: [
      ability.bolt({ name: "Olhar Mortal", range: 4, min: 70, max: 125, kind: "death", fx: "death", condition: { id: "slow", durationMs: 3000, value: 40 } }),
    ],
    attackMs: 2000, attackRange: 4, stepMs: 450, aggroRange: 7, fleeAtHpPct: 0, respawnMs: 90_000,
    gold: [170, 320],
    loot: [
      { itemId: "bonelord_eye", chance: 0.45 },
      { itemId: "mana_potion_large", chance: 0.12 },
      { itemId: "gem_purple", chance: 0.05 },
      { itemId: "starstorm_wand", chance: 0.004 },
      { itemId: "northwind_rod", chance: 0.004 },
      { itemId: "mystic_armor", chance: 0.004 },
    ],
    sprite: grid4(M + "Eye2/Eye2.png"),
  },
  black_knight: {
    id: "black_knight", name: "Cavaleiro Negro", level: 65, hp: 1800, xp: 3000, damage: [80, 150], damageKind: "physical", armor: 25,
    abilities: [
      ability.stomp({ name: "Golpe Giratório", radius: 1, min: 85, max: 155, cooldownMs: 11_000 }),
    ],
    attackMs: 1800, attackRange: 1, stepMs: 330, aggroRange: 6, fleeAtHpPct: 0, respawnMs: 100_000,
    gold: [200, 380],
    loot: [
      { itemId: "iron_bar", chance: 0.3, min: 1, max: 2 },
      { itemId: "health_potion_large", chance: 0.12 },
      { itemId: "mithril_bar", chance: 0.03 },
      { itemId: "fire_sword", chance: 0.006 },
      { itemId: "crown_shield", chance: 0.006 },
      { itemId: "royal_armor", chance: 0.004 },
      { itemId: "royal_crossbow", chance: 0.004 },
      { itemId: "amulet_dragon", chance: 0.004 },
    ],
    sprite: grid4(C + "Knight/SpriteSheet.png", { tint: 0x5a5a72 }),
  },
  dragon: {
    id: "dragon", name: "Dragão", level: 70, hp: 2000, xp: 3500, damage: [70, 140], damageKind: "fire", armor: 20,
    abilities: [
      ability.breath({ name: "Sopro de Fogo", length: 4, width: 3, min: 90, max: 170, kind: "fire", fx: "fire", condition: { id: "burn", durationMs: 6000, value: 12 } }),
    ],
    attackMs: 2200, attackRange: 3, stepMs: 380, aggroRange: 7, fleeAtHpPct: 0, respawnMs: 100_000,
    gold: [220, 420],
    loot: [
      { itemId: "dragon_scale", chance: 0.4 },
      { itemId: "dragon_ham", chance: 0.35, min: 1, max: 3 },
      { itemId: "health_potion_large", chance: 0.12 },
      { itemId: "gem_green", chance: 0.08 },
      { itemId: "dragon_axe", chance: 0.01 },
      { itemId: "crown_helmet", chance: 0.006 },
      { itemId: "mystic_helmet", chance: 0.006 },
      { itemId: "royal_crossbow", chance: 0.004 },
      { itemId: "ring_dragon", chance: 0.01 },
    ],
    sprite: grid4(M + "Dragon/SpriteSheet.png"),
  },
  dragon_lord: {
    id: "dragon_lord", name: "Senhor dos Dragões", level: 85, hp: 3200, xp: 6100, damage: [100, 190], damageKind: "fire", armor: 28,
    abilities: [
      ability.breath({ name: "Sopro de Fogo", length: 5, width: 3, min: 130, max: 240, kind: "fire", fx: "fire", condition: { id: "burn", durationMs: 6000, value: 18 } }),
      ability.blast({ name: "Bola de Fogo", radius: 1, range: 4, min: 100, max: 180, kind: "fire", fx: "fire", chance: 0.5 }),
    ],
    attackMs: 2200, attackRange: 3, stepMs: 360, aggroRange: 7, fleeAtHpPct: 0, respawnMs: 120_000,
    gold: [300, 600],
    loot: [
      { itemId: "red_dragon_scale", chance: 0.4 },
      { itemId: "dragon_ham", chance: 0.4, min: 1, max: 4 },
      { itemId: "health_potion_large", chance: 0.15, min: 1, max: 2 },
      { itemId: "gem_yellow", chance: 0.1 },
      { itemId: "dragon_scale_armor", chance: 0.004 },
      { itemId: "dragon_scale_helmet", chance: 0.005 },
      { itemId: "magic_longsword", chance: 0.003 },
      { itemId: "ferumbras_helmet", chance: 0.003 },
      { itemId: "dragon_scale_boots", chance: 0.004 },
      { itemId: "amulet_dragon", chance: 0.01 },
    ],
    sprite: grid4(M + "DragonYellow/SpriteSheet.png", { tint: 0xff7a64 }),
  },
  behemoth: {
    id: "behemoth", name: "Behemoth", level: 90, hp: 4000, xp: 8000, damage: [120, 230], damageKind: "physical", armor: 32,
    abilities: [
      ability.stomp({ name: "Pisão", radius: 1, min: 150, max: 260, windupMs: 700 }),
    ],
    attackMs: 2000, attackRange: 1, stepMs: 340, aggroRange: 6, fleeAtHpPct: 0, respawnMs: 120_000,
    gold: [350, 700],
    loot: [
      { itemId: "behemoth_claw", chance: 0.35 },
      { itemId: "meat", chance: 0.4, min: 2, max: 4 },
      { itemId: "health_potion_large", chance: 0.18, min: 1, max: 2 },
      { itemId: "mithril_bar", chance: 0.06 },
      { itemId: "giant_sword", chance: 0.01 },
      { itemId: "demon_legs", chance: 0.004 },
      { itemId: "dragon_scale_legs", chance: 0.004 },
      { itemId: "boots_haste", chance: 0.003 },
    ],
    sprite: grid4(M + "Beast2/Beast2.png", { scale: 1.3 }),
  },
  demon: {
    id: "demon", name: "Demônio", level: 100, hp: 5000, xp: 10500, damage: [130, 250], damageKind: "fire", armor: 35,
    abilities: [
      ability.blast({ name: "Chuva de Fogo", radius: 2, range: 4, min: 140, max: 255, kind: "fire", fx: "fire" }),
      // 60–120 ficava abaixo do golpe básico (130–250): o demônio "amaciava" ao paralisar (GD-16, ciclo 9).
      ability.bolt({ name: "Paralisia", range: 4, min: 106, max: 188, kind: "energy", fx: "energy", cooldownMs: 14_000, condition: { id: "slow", durationMs: 4000, value: 50 } }),
    ],
    attackMs: 2000, attackRange: 4, stepMs: 320, aggroRange: 8, fleeAtHpPct: 0, respawnMs: 150_000,
    gold: [400, 800],
    loot: [
      { itemId: "demon_horn", chance: 0.3 },
      { itemId: "demonic_essence", chance: 0.2 },
      { itemId: "health_potion_large", chance: 0.2, min: 1, max: 3 },
      { itemId: "mana_potion_large", chance: 0.2, min: 1, max: 3 },
      { itemId: "gem_purple", chance: 0.12 },
      { itemId: "demon_helmet", chance: 0.003 },
      { itemId: "demon_armor", chance: 0.002 },
      { itemId: "demon_shield", chance: 0.004 },
      { itemId: "demon_axe", chance: 0.003 },
      { itemId: "destruction_wand", chance: 0.003 },
      { itemId: "ancient_root_rod", chance: 0.003 },
      { itemId: "celestial_bow", chance: 0.003 },
      { itemId: "ferumbras_armor", chance: 0.002 },
      { itemId: "demon_boots", chance: 0.003 },
      { itemId: "boots_haste", chance: 0.005 },
    ],
    sprite: grid4(M + "Beast/Beast.png", { scale: 1.25 }),
  },
  // ---- chefes das Terras Selvagens
  horned_fox: {
    id: "horned_fox", name: "Raposa Chifruda", level: 55, hp: 12000, xp: 12000, damage: [90, 170], damageKind: "physical", armor: 20,
    abilities: [
      ability.stomp({ name: "Pisão", radius: 1, min: 100, max: 180, windupMs: 700 }),
      ability.summon({ name: "Venham, irmãos!", monsterId: "minotaur", count: 1, max: 2, cooldownMs: 25_000 }),
    ],
    attackMs: 1800, attackRange: 1, stepMs: 320, aggroRange: 8, fleeAtHpPct: 0, respawnMs: 7_200_000, boss: true,
    gold: [2500, 4000],
    loot: [
      { itemId: "horned_fox_tail", chance: 1 },
      { itemId: "minotaur_horn", chance: 1, min: 3, max: 6 },
      { itemId: "health_potion_large", chance: 1, min: 3, max: 5 },
      { itemId: "amulet_minotaur", chance: 0.35 },
      { itemId: "crown_armor", chance: 0.15 },
      { itemId: "royal_armor", chance: 0.15 },
      { itemId: "mystic_armor", chance: 0.15 },
      { itemId: "ring_might", chance: 0.2 },
    ],
    sprite: grid4(M + "Bear/SpriteSheet.png", { tint: 0xffb060, scale: 1.6 }),
  },
  demodras: {
    id: "demodras", name: "Demodras", level: 80, hp: 25000, xp: 30000, damage: [150, 280], damageKind: "fire", armor: 30,
    abilities: [
      ability.breath({ name: "Sopro de Demodras", length: 5, width: 3, min: 180, max: 320, kind: "fire", fx: "fire", windupMs: 900, cooldownMs: 8000, condition: { id: "burn", durationMs: 8000, value: 25 } }),
      ability.summon({ name: "Filhotes, venham!", monsterId: "dragon", count: 1, max: 2, cooldownMs: 30_000 }),
    ],
    attackMs: 2200, attackRange: 4, stepMs: 380, aggroRange: 8, fleeAtHpPct: 0, respawnMs: 10_800_000, boss: true,
    gold: [5000, 9000],
    loot: [
      { itemId: "demodras_head", chance: 1 },
      { itemId: "red_dragon_scale", chance: 1, min: 3, max: 6 },
      { itemId: "dragon_ham", chance: 1, min: 4, max: 8 },
      { itemId: "ring_demodras", chance: 0.3 },
      { itemId: "dragon_scale_armor", chance: 0.2 },
      { itemId: "magic_longsword", chance: 0.15 },
      { itemId: "celestial_bow", chance: 0.15 },
      { itemId: "ferumbras_helmet", chance: 0.15 },
      { itemId: "boots_haste", chance: 0.1 },
    ],
    sprite: grid4(M + "DragonYellow/SpriteSheet.png", { tint: 0xff4a3a, scale: 1.9 }),
  },
  orshabaal: {
    id: "orshabaal", name: "Orshabaal", level: 120, hp: 60000, xp: 80000, damage: [220, 400], damageKind: "fire", armor: 45,
    abilities: [
      ability.blast({ name: "Inferno", radius: 2, range: 5, min: 220, max: 380, kind: "fire", fx: "fire", windupMs: 1000, cooldownMs: 8000 }),
      ability.summon({ name: "Servos do Abismo!", monsterId: "demon", count: 1, max: 2, cooldownMs: 30_000 }),
      ability.heal({ name: "Sangue Profano", pct: 0.05, belowHpPct: 0.5, cooldownMs: 20_000 }),
    ],
    attackMs: 2000, attackRange: 5, stepMs: 360, aggroRange: 9, fleeAtHpPct: 0, respawnMs: 14_400_000, boss: true,
    gold: [15000, 25000],
    loot: [
      { itemId: "orshabaal_brain", chance: 1 },
      { itemId: "demonic_essence", chance: 1, min: 3, max: 6 },
      { itemId: "demon_horn", chance: 1, min: 2, max: 4 },
      { itemId: "amulet_orshabaal", chance: 0.25 },
      { itemId: "demon_armor", chance: 0.2 },
      { itemId: "demon_axe", chance: 0.15 },
      { itemId: "destruction_wand", chance: 0.15 },
      { itemId: "ancient_root_rod", chance: 0.15 },
      { itemId: "ferumbras_armor", chance: 0.15 },
      { itemId: "dragon_scale_legs", chance: 0.15 },
      { itemId: "demon_boots", chance: 0.15 },
      { itemId: "boots_haste", chance: 0.3 },
      // Ciclo 16: tier 8 de cavaleiro e paladino (Ferumbras dá o dos magos).
      { itemId: "abyss_shard", chance: 1, min: 2, max: 4 },
      { itemId: "abyss_blade", chance: 0.12 },
      { itemId: "abyss_armor", chance: 0.1 },
      { itemId: "abyss_bow", chance: 0.12 },
      { itemId: "abyss_archer_armor", chance: 0.1 },
    ],
    sprite: strip(B + "DemonCyclop/Walk.png", 50, 6, { tint: 0xff6060, scale: 2 }),
  },

  // ===== Oficina dos Engenhos (ciclo 10): reskins que nascem em áreas existentes (lateSpawns). Nomes comuns de fantasia
  // por pedido do dono (2026-10-24): o trabalho fica nos NPCs e missões; ids iguais (saves, bestiário, mapa).
  datacenter_rat: {
    id: "datacenter_rat", name: "Rato Cinzento", level: 3, hp: 40, xp: 12, damage: [2, 6], damageKind: "physical", armor: 0,
    attackMs: 2000, attackRange: 1, stepMs: 300, aggroRange: 4, fleeAtHpPct: 0.15, respawnMs: 25_000,
    gold: [2, 6],
    loot: [
      { itemId: "cabo_roido", chance: 0.45, min: 1, max: 2 },
      { itemId: "iluminador_queimado", chance: 0.35 },
      { itemId: "cheese", chance: 0.15 },
      { itemId: "health_potion", chance: 0.05 },
    ],
    sprite: grid4(M + "Mouse/SpriteSheet.png", { tint: 0x7080b0 }),
  },
  // Passiva (aggroRange 0) e foge cedo (60%): o jogador corre atrás dela pelo pátio.
  runaway_drum: {
    id: "runaway_drum", name: "Gosma Azul", level: 10, hp: 120, xp: 52, damage: [4, 10], damageKind: "earth", armor: 1,
    attackMs: 2000, attackRange: 1, stepMs: 240, aggroRange: 0, fleeAtHpPct: 0.6, respawnMs: 45_000,
    gold: [20, 45],
    loot: [
      { itemId: "rotulo_isca", chance: 0.4 },
      { itemId: "post_it_senha", chance: 0.25 },
      { itemId: "health_potion", chance: 0.08 },
    ],
    sprite: grid4(M + "Slime/Slime.png", { tint: 0x3a78e0, scale: 1.15 }),
  },
  slag_slime: {
    id: "slag_slime", name: "Gosma Cinzenta", level: 20, hp: 220, xp: 140, damage: [14, 30], damageKind: "fire", armor: 5,
    attackMs: 2000, attackRange: 1, stepMs: 380, aggroRange: 5, fleeAtHpPct: 0, respawnMs: 55_000,
    pack: { family: "slag", shout: "Blup-blup!" },
    gold: [10, 24],
    loot: [
      { itemId: "escoria_quente", chance: 0.5, min: 1, max: 2 },
      { itemId: "lente_trincada", chance: 0.12 },
      { itemId: "iron_bar", chance: 0.04 },
      { itemId: "health_potion_medium", chance: 0.03 },
    ],
    sprite: grid4(M + "Slime2/Slime2.png", { tint: 0x60606a }),
  },

  // ===== Costa Esmeralda (expansão a leste das Terras Selvagens: tools/mapgen/expansion2.mjs)
  // Selva de Banuta (lv 25-45): macacos, tarântulas, crocodilos e plantas carnívoras.
  // Ciclo 7: ouro ×1,6 na Selva e nos Piratas (com os materiais em dobro, ~0,6 de ouro por vida, como goblin e homem-lagarto).
  sibang: {
    id: "sibang", name: "Sibang", level: 26, hp: 300, xp: 240, damage: [18, 42], damageKind: "physical", armor: 5,
    attackMs: 2000, attackRange: 3, stepMs: 280, aggroRange: 6, fleeAtHpPct: 0.2, respawnMs: 60_000,
    pack: { family: "ape", shout: "Uh uh! Ah ah!" },
    gold: [64, 144],
    loot: [
      { itemId: "ape_fur", chance: 0.4 },
      { itemId: "banana", chance: 0.35, min: 1, max: 3 },
      { itemId: "health_potion_medium", chance: 0.06 },
      { itemId: "ring_pressa", chance: 0.004 },
    ],
    sprite: grid4(C + "Monkey/SpriteSheet.png"),
  },
  kongra: {
    id: "kongra", name: "Kongra", level: 28, hp: 340, xp: 290, damage: [22, 46], damageKind: "physical", armor: 7,
    attackMs: 1900, attackRange: 1, stepMs: 320, aggroRange: 6, fleeAtHpPct: 0, respawnMs: 60_000,
    pack: { family: "ape", shout: "Uh uh! Ah ah!" },
    gold: [72, 152],
    loot: [
      { itemId: "ape_fur", chance: 0.5 },
      { itemId: "banana", chance: 0.3, min: 1, max: 2 },
      { itemId: "health_potion_medium", chance: 0.07 },
      { itemId: "steel_helmet", chance: 0.01 },
      { itemId: "battle_axe", chance: 0.004 },
    ],
    sprite: grid4(C + "MonkeyBoxerRed/SpriteSheet.png", { scale: 1.15 }),
  },
  tarantula: {
    id: "tarantula", name: "Tarântula", level: 30, hp: 380, xp: 340, damage: [22, 48], damageKind: "earth", armor: 7,
    abilities: [
      // 20–40 ficava abaixo do golpe básico (22–48): usar a habilidade reduzia o dano da tarântula (GD-16, ciclo 9).
      ability.bolt({ name: "Picada Venenosa", range: 1, min: 29, max: 54, kind: "earth", fx: "earth", cooldownMs: 10_000, condition: { id: "poison", durationMs: 10_000, value: 8 } }),
    ],
    attackMs: 1800, attackRange: 1, stepMs: 300, aggroRange: 6, fleeAtHpPct: 0, respawnMs: 60_000,
    gold: [80, 160],
    loot: [
      { itemId: "tarantula_fang", chance: 0.4 },
      { itemId: "spider_silk", chance: 0.3, min: 1, max: 2 },
      { itemId: "mana_potion_medium", chance: 0.06 },
      { itemId: "moss_rod", chance: 0.004 },
    ],
    sprite: grid4(M + "SpiderYellow/SpriteSheet.png", { tint: 0xc08850, scale: 1.15 }),
  },
  merlkin: {
    id: "merlkin", name: "Merlkin", level: 32, hp: 360, xp: 350, damage: [25, 50], damageKind: "energy", armor: 5,
    abilities: [
      ability.healAllies({ name: "Ritual do Macaco", pct: 0.1, radius: 4, belowHpPct: 0.7, cooldownMs: 12000 }),
    ],
    attackMs: 2200, attackRange: 4, stepMs: 340, aggroRange: 7, fleeAtHpPct: 0.2, respawnMs: 60_000,
    pack: { family: "ape", shout: "Uh uh! Ah ah!" },
    gold: [96, 184],
    loot: [
      { itemId: "ape_fur", chance: 0.3 },
      { itemId: "banana", chance: 0.3, min: 1, max: 2 },
      { itemId: "mana_potion_medium", chance: 0.1 },
      { itemId: "gem_green", chance: 0.03 },
      { itemId: "ember_wand", chance: 0.005 },
      { itemId: "arcane_helmet", chance: 0.006 },
    ],
    sprite: grid4(C + "MonkeyBoxerBlue/SpriteSheet.png", { tint: 0xb8a8ff }),
  },
  crocodile: {
    id: "crocodile", name: "Crocodilo", level: 36, hp: 520, xp: 560, damage: [30, 62], damageKind: "physical", armor: 11,
    attackMs: 1900, attackRange: 1, stepMs: 380, aggroRange: 5, fleeAtHpPct: 0, respawnMs: 70_000,
    gold: [120, 240],
    loot: [
      { itemId: "croc_leather", chance: 0.45 },
      { itemId: "meat", chance: 0.3, min: 1, max: 2 },
      { itemId: "health_potion_medium", chance: 0.1 },
      { itemId: "steel_legs", chance: 0.012 },
      { itemId: "sniper_legs", chance: 0.008 },
    ],
    sprite: grid4(M + "Lizard2/Lizard2.png", { tint: 0x7aa860, scale: 1.2 }),
  },
  carniphila: {
    id: "carniphila", name: "Carniphila", level: 40, hp: 600, xp: 760, damage: [35, 70], damageKind: "earth", armor: 9,
    abilities: [
      ability.stomp({ name: "Esporos", radius: 1, min: 30, max: 60, kind: "earth", fx: "earth", windupMs: 700, condition: { id: "poison", durationMs: 8000, value: 10 } }),
    ],
    attackMs: 2000, attackRange: 2, stepMs: 700, aggroRange: 4, fleeAtHpPct: 0, respawnMs: 70_000,
    gold: [152, 304],
    loot: [
      { itemId: "carniphila_seed", chance: 0.4 },
      { itemId: "herb", chance: 0.4, min: 1, max: 3 },
      { itemId: "mana_potion_large", chance: 0.06 },
      { itemId: "glacier_rod", chance: 0.004 },
      { itemId: "amulet_protecao", chance: 0.008 },
    ],
    sprite: grid4(M + "Mushroom2/mushroom2.png", { tint: 0x80e070, scale: 1.25 }),
  },
  // Caverna dos Piratas (lv 30-42).
  pirate_marauder: {
    id: "pirate_marauder", name: "Pirata Saqueador", level: 30, hp: 360, xp: 320, damage: [24, 48], damageKind: "physical", armor: 8,
    attackMs: 1900, attackRange: 1, stepMs: 320, aggroRange: 6, fleeAtHpPct: 0.2, respawnMs: 60_000,
    pack: { family: "pirate", shout: "Piratas, abordar!" },
    gold: [80, 168],
    loot: [
      { itemId: "pirate_coin", chance: 0.45, min: 1, max: 3 },
      { itemId: "fish", chance: 0.3, min: 1, max: 2 },
      { itemId: "health_potion_medium", chance: 0.08 },
      { itemId: "steel_blade", chance: 0.004 },
    ],
    sprite: grid4(C + "FighterRed/SpriteSheet.png"),
  },
  pirate_corsair: {
    id: "pirate_corsair", name: "Pirata Corsário", level: 35, hp: 420, xp: 440, damage: [28, 56], damageKind: "physical", armor: 8,
    attackMs: 2100, attackRange: 4, stepMs: 330, aggroRange: 7, fleeAtHpPct: 0.2, respawnMs: 60_000,
    pack: { family: "pirate", shout: "Piratas, abordar!" },
    gold: [112, 232],
    loot: [
      { itemId: "pirate_coin", chance: 0.5, min: 1, max: 4 },
      { itemId: "calamari", chance: 0.2 },
      { itemId: "health_potion_medium", chance: 0.1 },
      { itemId: "composite_bow", chance: 0.006 },
      { itemId: "pirate_hat", chance: 0.02 },
    ],
    sprite: grid4(C + "CamouflageRed/SpriteSheet.png"),
  },
  pirate_buccaneer: {
    id: "pirate_buccaneer", name: "Pirata Bucaneiro", level: 38, hp: 560, xp: 660, damage: [34, 68], damageKind: "physical", armor: 12,
    attackMs: 1800, attackRange: 1, stepMs: 320, aggroRange: 6, fleeAtHpPct: 0.2, respawnMs: 70_000,
    pack: { family: "pirate", shout: "Piratas, abordar!" },
    gold: [144, 296],
    loot: [
      { itemId: "pirate_coin", chance: 0.55, min: 2, max: 5 },
      { itemId: "health_potion_large", chance: 0.05 },
      { itemId: "pirate_hat", chance: 0.03 },
      { itemId: "mithril_katana", chance: 0.004 },
      { itemId: "mithril_shield", chance: 0.006 },
    ],
    sprite: grid4(C + "NinjaRed2/SpriteSheet.png", { tint: 0xe0c8a0 }),
  },
  // Ilha Gelada (lv 50-80).
  winter_wolf: {
    id: "winter_wolf", name: "Lobo do Inverno", level: 50, hp: 850, xp: 1230, damage: [50, 95], damageKind: "ice", armor: 12,
    attackMs: 1700, attackRange: 1, stepMs: 260, aggroRange: 7, fleeAtHpPct: 0, respawnMs: 80_000,
    pack: { family: "wolf", shout: "Auuuu!" },
    gold: [140, 265],
    loot: [
      { itemId: "winter_fur", chance: 0.45 },
      { itemId: "meat", chance: 0.35, min: 1, max: 3 },
      { itemId: "health_potion_large", chance: 0.08 },
      { itemId: "mithril_boots", chance: 0.01 },
    ],
    sprite: grid4(M + "Racoon/SpriteSheet.png", { tint: 0xf2f8ff, scale: 1.15 }),
  },
  barbarian: {
    id: "barbarian", name: "Bárbaro", level: 55, hp: 1250, xp: 1900, damage: [65, 130], damageKind: "physical", armor: 18,
    attackMs: 2000, attackRange: 1, stepMs: 330, aggroRange: 6, fleeAtHpPct: 0, respawnMs: 90_000,
    pack: { family: "barbarian", shout: "Pelo norte! Comigo!" },
    gold: [160, 305],
    loot: [
      { itemId: "winter_fur", chance: 0.3 },
      { itemId: "meat", chance: 0.3, min: 1, max: 2 },
      { itemId: "health_potion_large", chance: 0.1 },
      { itemId: "iron_bar", chance: 0.15 },
      { itemId: "crown_legs", chance: 0.005 },
      { itemId: "giant_sword", chance: 0.004 },
      { itemId: "royal_legs", chance: 0.005 },
      { itemId: "royal_boots", chance: 0.005 },
    ],
    sprite: grid4(C + "Caveman2/SpriteSheet.png", { tint: 0xe8d0b8 }),
  },
  ice_witch: {
    id: "ice_witch", name: "Bruxa do Gelo", level: 62, hp: 1150, xp: 1900, damage: [60, 115], damageKind: "ice", armor: 10,
    abilities: [
      ability.healAllies({ name: "Geada Restauradora", pct: 0.12, radius: 4, belowHpPct: 0.7, cooldownMs: 10000 }),
      ability.bolt({ name: "Rajada Gélida", range: 4, min: 60, max: 110, kind: "ice", fx: "ice", cooldownMs: 10_000, condition: { id: "slow", durationMs: 3000, value: 40 } }),
    ],
    attackMs: 2100, attackRange: 4, stepMs: 380, aggroRange: 7, fleeAtHpPct: 0, respawnMs: 90_000,
    gold: [175, 330],
    loot: [
      { itemId: "ice_shard", chance: 0.4 },
      { itemId: "mana_potion_large", chance: 0.14 },
      { itemId: "gem_purple", chance: 0.04 },
      { itemId: "northwind_rod", chance: 0.005 },
      { itemId: "mystic_legs", chance: 0.006 },
      { itemId: "mystic_helmet", chance: 0.005 },
    ],
    sprite: grid4(C + "NinjaEskimo/SpriteSheet.png", { tint: 0xc0ecff }),
  },
  frost_dragon: {
    id: "frost_dragon", name: "Dragão de Gelo", level: 80, hp: 2800, xp: 5150, damage: [90, 175], damageKind: "ice", armor: 26,
    abilities: [
      ability.breath({ name: "Sopro Gélido", length: 4, width: 3, min: 110, max: 200, kind: "ice", fx: "ice", condition: { id: "slow", durationMs: 3000, value: 30 } }),
    ],
    attackMs: 2200, attackRange: 3, stepMs: 370, aggroRange: 7, fleeAtHpPct: 0, respawnMs: 110_000,
    gold: [260, 520],
    loot: [
      { itemId: "frost_dragon_scale", chance: 0.4 },
      { itemId: "dragon_ham", chance: 0.35, min: 1, max: 3 },
      { itemId: "health_potion_large", chance: 0.14, min: 1, max: 2 },
      { itemId: "gem_purple", chance: 0.06 },
      { itemId: "glacier_rod", chance: 0.01 },
      { itemId: "dragon_scale_legs", chance: 0.004 },
      { itemId: "ring_dragon", chance: 0.01 },
      { itemId: "frost_ring", chance: 0.004 },
    ],
    // Paleta trocada (tools/monsters/recolor.mjs): a tinta sobre o dragão verde ficava esverdeada.
    sprite: grid4("monsters/FrostDragon.png", { scale: 1.1 }),
  },
  // Caverna dos Heróis (lv 65-75).
  necromancer: {
    id: "necromancer", name: "Necromante", level: 68, hp: 1500, xp: 2550, damage: [70, 135], damageKind: "death", armor: 14,
    abilities: [
      ability.healAllies({ name: "Pacto Sombrio", pct: 0.12, radius: 4, belowHpPct: 0.7, cooldownMs: 10000 }),
      ability.summon({ name: "Erguer os Mortos", monsterId: "skeleton", count: 1, max: 2, cooldownMs: 15_000 }),
    ],
    attackMs: 2100, attackRange: 4, stepMs: 380, aggroRange: 7, fleeAtHpPct: 0, respawnMs: 100_000,
    gold: [190, 400],
    loot: [
      { itemId: "necro_skull", chance: 0.4 },
      { itemId: "mana_potion_large", chance: 0.15 },
      { itemId: "gem_purple", chance: 0.05 },
      { itemId: "starstorm_wand", chance: 0.005 },
      { itemId: "mystic_armor", chance: 0.004 },
      { itemId: "amulet_lich", chance: 0.01 },
    ],
    sprite: grid4(C + "Master/SpriteSheet.png", { tint: 0x8c78a8 }),
  },
  hero: {
    id: "hero", name: "Herói", level: 72, hp: 2200, xp: 3900, damage: [85, 160], damageKind: "physical", armor: 26,
    attackMs: 1800, attackRange: 1, stepMs: 320, aggroRange: 6, fleeAtHpPct: 0, respawnMs: 100_000,
    gold: [230, 440],
    loot: [
      { itemId: "hero_badge", chance: 0.4 },
      { itemId: "health_potion_large", chance: 0.14 },
      { itemId: "iron_bar", chance: 0.25, min: 1, max: 2 },
      { itemId: "fire_sword", chance: 0.006 },
      { itemId: "crown_helmet", chance: 0.008 },
      { itemId: "royal_helmet", chance: 0.008 },
      { itemId: "crown_shield", chance: 0.006 },
    ],
    sprite: grid4(C + "SamuraiBlue/SpriteSheet.png", { tint: 0xe8e8ff }),
  },
  // Vulcão de Goroma (lv 85-100) e Cidadela de Ferumbras (lv 100+).
  magma_elemental: {
    id: "magma_elemental", name: "Elemental de Magma", level: 86, hp: 3000, xp: 5800, damage: [100, 190], damageKind: "fire", armor: 30,
    abilities: [
      ability.stomp({ name: "Erupção", radius: 2, min: 110, max: 200, kind: "fire", fx: "fire", windupMs: 900, cooldownMs: 11_000, condition: { id: "burn", durationMs: 6000, value: 15 } }),
    ],
    attackMs: 2200, attackRange: 3, stepMs: 420, aggroRange: 6, fleeAtHpPct: 0, respawnMs: 120_000,
    gold: [310, 620],
    loot: [
      { itemId: "magma_core", chance: 0.4 },
      { itemId: "ember", chance: 0.4, min: 1, max: 3 },
      { itemId: "health_potion_large", chance: 0.15, min: 1, max: 2 },
      { itemId: "gem_yellow", chance: 0.08 },
      { itemId: "inferno_wand", chance: 0.012 },
      { itemId: "demon_shield", chance: 0.003 },
    ],
    sprite: grid4(M + "Flam2/SpriteSheet.png", { tint: 0xff7a40, scale: 1.4 }),
  },
  hellhound: {
    id: "hellhound", name: "Cão Infernal", level: 95, hp: 4500, xp: 9300, damage: [125, 240], damageKind: "fire", armor: 32,
    abilities: [
      ability.breath({ name: "Sopro Infernal", length: 3, width: 3, min: 140, max: 250, kind: "fire", fx: "fire", windupMs: 700 }),
    ],
    attackMs: 1900, attackRange: 1, stepMs: 280, aggroRange: 7, fleeAtHpPct: 0, respawnMs: 130_000,
    gold: [380, 750],
    loot: [
      { itemId: "hellhound_fang", chance: 0.4 },
      { itemId: "demonic_essence", chance: 0.1 },
      { itemId: "health_potion_large", chance: 0.18, min: 1, max: 3 },
      { itemId: "gem_purple", chance: 0.1 },
      { itemId: "demon_legs", chance: 0.004 },
      { itemId: "dragon_scale_helmet", chance: 0.004 },
      { itemId: "boots_haste", chance: 0.003 },
    ],
    sprite: grid4(C + "CaveLion2/SpriteSheet.png", { tint: 0xff6a4a, scale: 1.3 }),
  },
  juggernaut: {
    id: "juggernaut", name: "Colosso", level: 110, hp: 6500, xp: 14300, damage: [150, 290], damageKind: "physical", armor: 40,
    abilities: [
      ability.stomp({ name: "Terremoto", radius: 2, min: 180, max: 300, windupMs: 900, cooldownMs: 12_000 }),
    ],
    attackMs: 2000, attackRange: 1, stepMs: 400, aggroRange: 6, fleeAtHpPct: 0, respawnMs: 160_000,
    gold: [500, 1000],
    loot: [
      { itemId: "juggernaut_plate", chance: 0.35 },
      { itemId: "mithril_bar", chance: 0.12 },
      { itemId: "health_potion_large", chance: 0.25, min: 2, max: 3 },
      { itemId: "gem_yellow", chance: 0.15 },
      { itemId: "demon_helmet", chance: 0.004 },
      { itemId: "demon_armor", chance: 0.003 },
      { itemId: "ferumbras_helmet", chance: 0.004 },
      { itemId: "dragon_scale_armor", chance: 0.003 },
      { itemId: "ferumbras_boots", chance: 0.003 },
      { itemId: "boots_haste", chance: 0.006 },
    ],
    sprite: grid4(M + "TRex/SpriteSheet.png", { tint: 0xb08070, scale: 1.5 }),
  },
  // ---- chefes da Costa Esmeralda
  captain_redbeard: {
    id: "captain_redbeard", name: "Capitão Barba-Ruiva", level: 42, hp: 7000, xp: 7000, damage: [70, 130], damageKind: "physical", armor: 16,
    abilities: [
      ability.blast({ name: "Fogo do Canhão!", radius: 1, range: 5, min: 70, max: 130, kind: "physical", fx: "physical", windupMs: 800 }),
      ability.summon({ name: "Marujos, ao ataque!", monsterId: "pirate_marauder", count: 2, max: 3, cooldownMs: 25_000 }),
    ],
    attackMs: 1800, attackRange: 1, stepMs: 320, aggroRange: 8, fleeAtHpPct: 0, respawnMs: 7_200_000, boss: true,
    gold: [2000, 3500],
    loot: [
      { itemId: "redbeard_hook", chance: 1 },
      { itemId: "pirate_coin", chance: 1, min: 10, max: 25 },
      { itemId: "pirate_hat", chance: 0.5 },
      { itemId: "health_potion_large", chance: 1, min: 2, max: 4 },
      { itemId: "mithril_katana", chance: 0.2 },
      { itemId: "elven_bow", chance: 0.2 },
      { itemId: "ring_dragon", chance: 0.15 },
    ],
    sprite: grid4(C + "RedGladiator/SpriteSheet.png", { tint: 0xffa080, scale: 1.5 }),
  },
  kongra_king: {
    id: "kongra_king", name: "Rei Kongra", level: 45, hp: 9000, xp: 9000, damage: [80, 150], damageKind: "physical", armor: 18,
    abilities: [
      ability.stomp({ name: "Pisão do Rei", radius: 1, min: 80, max: 150, windupMs: 700 }),
      ability.summon({ name: "UH UH!", monsterId: "kongra", count: 1, max: 2, cooldownMs: 25_000 }),
    ],
    attackMs: 1800, attackRange: 1, stepMs: 300, aggroRange: 8, fleeAtHpPct: 0, respawnMs: 7_200_000, boss: true,
    gold: [2200, 3800],
    loot: [
      { itemId: "kongra_crown", chance: 1 },
      { itemId: "ape_fur", chance: 1, min: 4, max: 8 },
      { itemId: "banana", chance: 1, min: 5, max: 10 },
      { itemId: "amulet_goblin_king", chance: 0.15 },
      { itemId: "mithril_armor", chance: 0.2 },
      { itemId: "master_archer_armor", chance: 0.2 },
      { itemId: "archmage_armor", chance: 0.2 },
    ],
    sprite: grid4(C + "MonkeyBoxerRed/SpriteSheet.png", { tint: 0xffd070, scale: 1.8 }),
  },
  yeti: {
    id: "yeti", name: "Yeti", level: 70, hp: 18000, xp: 20000, damage: [130, 240], damageKind: "ice", armor: 28,
    abilities: [
      ability.blast({ name: "Avalanche", radius: 2, range: 5, min: 130, max: 240, kind: "ice", fx: "ice", cooldownMs: 9000, condition: { id: "slow", durationMs: 3000, value: 40 } }),
    ],
    attackMs: 2000, attackRange: 1, stepMs: 340, aggroRange: 8, fleeAtHpPct: 0, respawnMs: 10_800_000, boss: true,
    gold: [4000, 7000],
    loot: [
      { itemId: "yeti_fur", chance: 1 },
      { itemId: "winter_fur", chance: 1, min: 4, max: 8 },
      { itemId: "health_potion_large", chance: 1, min: 3, max: 5 },
      { itemId: "frost_ring", chance: 0.3 },
      { itemId: "royal_armor", chance: 0.15 },
      { itemId: "crown_armor", chance: 0.15 },
      { itemId: "mystic_armor", chance: 0.15 },
      { itemId: "northwind_rod", chance: 0.15 },
      { itemId: "spellbook_mystic", chance: 0.15 },
    ],
    sprite: grid4(M + "Panda/SpriteSheet.png", { tint: 0xf4faff, scale: 1.9 }),
  },
  ferumbras: {
    id: "ferumbras", name: "Ferumbras", level: 140, hp: 90000, xp: 120000, damage: [250, 450], damageKind: "death", armor: 50,
    abilities: [
      ability.blast({ name: "Morte Sombria", radius: 2, range: 5, min: 250, max: 420, kind: "death", fx: "death", windupMs: 1000, cooldownMs: 8000 }),
      ability.breath({ name: "Tempestade Arcana", length: 5, width: 3, min: 220, max: 380, kind: "energy", fx: "energy", windupMs: 900, cooldownMs: 10_000 }),
      ability.summon({ name: "Demônios, a mim!", monsterId: "demon", count: 1, max: 2, cooldownMs: 30_000 }),
      ability.heal({ name: "Sombra Restauradora", pct: 0.05, belowHpPct: 0.5, cooldownMs: 25_000 }),
    ],
    attackMs: 2000, attackRange: 5, stepMs: 340, aggroRange: 9, fleeAtHpPct: 0, respawnMs: 21_600_000, boss: true,
    gold: [20000, 35000],
    loot: [
      { itemId: "ferumbras_staff", chance: 1 },
      { itemId: "demonic_essence", chance: 1, min: 4, max: 8 },
      { itemId: "ferumbras_helmet", chance: 0.3 },
      { itemId: "ferumbras_armor", chance: 0.25 },
      { itemId: "ferumbras_legs", chance: 0.25 },
      { itemId: "destruction_wand", chance: 0.2 },
      { itemId: "ancient_root_rod", chance: 0.2 },
      { itemId: "amulet_orshabaal", chance: 0.15 },
      { itemId: "spellbook_ferumbras", chance: 0.2 },
      { itemId: "ferumbras_boots", chance: 0.2 },
      { itemId: "boots_haste", chance: 0.4 },
      // Ciclo 16: tier 8 dos magos (Orshabaal dá o de cavaleiro e paladino).
      { itemId: "abyss_shard", chance: 1, min: 2, max: 4 },
      { itemId: "abyss_wand", chance: 0.12 },
      { itemId: "abyss_rod", chance: 0.12 },
      { itemId: "abyss_mage_helmet", chance: 0.1 },
      { itemId: "abyss_mage_armor", chance: 0.1 },
      { itemId: "spellbook_abyss", chance: 0.1 },
    ],
    sprite: grid4(C + "Vampire/SpriteSheet.png", { tint: 0xd890ff, scale: 1.9 }),
  },

  // ===== Malha da Ferrovia (ciclo 11, lv 25–60): região isolada, só de trem (tools/mapgen/expansion4.mjs). Reskins com
  // tint de sprites que já existem. Nomes comuns de fantasia casando com o sprite (pedido do dono, 2026-10-24); os ids
  // seguem os do contrato com o mapa e os saves.
  // Números nas janelas dos vizinhos de level (xp/vida ±10%, ouro por faixa: monsters.test.ts e items.test.ts).
  engate_solto: {
    id: "engate_solto", name: "Cobra Listrada", level: 28, hp: 330, xp: 285, damage: [22, 46], damageKind: "physical", armor: 7,
    attackMs: 1900, attackRange: 1, stepMs: 300, aggroRange: 6, fleeAtHpPct: 0, respawnMs: 60_000,
    gold: [60, 140],
    loot: [
      { itemId: "pino_de_engate", chance: 0.45 },
      { itemId: "iron_bar", chance: 0.05 },
      { itemId: "health_potion_medium", chance: 0.07 },
      { itemId: "colete_refletivo", chance: 0.006 },
      { itemId: "steel_legs", chance: 0.005 },
    ],
    sprite: grid4(M + "Snake4/Snake4.png", { tint: 0x40d0e0 }),
  },
  // Lenta e blindada: cava devagar, mas a carapaça dourada aguenta pancada.
  sapata_gasta: {
    id: "sapata_gasta", name: "Toupeira Dourada", level: 32, hp: 420, xp: 420, damage: [26, 52], damageKind: "physical", armor: 12,
    attackMs: 2000, attackRange: 1, stepMs: 480, aggroRange: 5, fleeAtHpPct: 0, respawnMs: 60_000,
    gold: [70, 150],
    loot: [
      { itemId: "pastilha_de_sapata", chance: 0.45, min: 1, max: 2 },
      { itemId: "iron_bar", chance: 0.06 },
      { itemId: "health_potion_medium", chance: 0.08 },
      { itemId: "steel_boots", chance: 0.006 },
    ],
    sprite: grid4(M + "Mole2/Mole2.png", { tint: 0xffc040, scale: 1.1 }),
  },
  // À distância, de fogo, com um clarão de energia.
  iluminador_rebelde: {
    id: "iluminador_rebelde", name: "Lanterna Assombrada", level: 36, hp: 460, xp: 530, damage: [28, 56], damageKind: "fire", armor: 6, undead: true,
    abilities: [
      ability.bolt({ name: "Clarão Fantasma", range: 4, min: 30, max: 60, kind: "energy", fx: "energy", cooldownMs: 9000, condition: { id: "energy", durationMs: 4000, value: 6 } }),
    ],
    attackMs: 2000, attackRange: 4, stepMs: 360, aggroRange: 6, fleeAtHpPct: 0, respawnMs: 60_000,
    gold: [80, 170],
    loot: [
      { itemId: "iluminador_queimado", chance: 0.5, min: 1, max: 2 },
      { itemId: "lente_industrial", chance: 0.3 },
      { itemId: "mana_potion_medium", chance: 0.08 },
      { itemId: "capacete_lanterna", chance: 0.006 },
      { itemId: "ember_wand", chance: 0.004 },
    ],
    sprite: grid4(M + "LanternGreen/SpriteSheet.png", { tint: 0xfff0a0 }),
  },
  // Foge cedo (45%) e rápido: some antes de alguém conferir se era mesmo um espectro.
  frame_descartado: {
    id: "frame_descartado", name: "Espectro Errante", level: 40, hp: 500, xp: 650, damage: [30, 60], damageKind: "energy", armor: 6, undead: true,
    attackMs: 1800, attackRange: 1, stepMs: 260, aggroRange: 4, fleeAtHpPct: 0.45, respawnMs: 60_000,
    gold: [90, 190],
    loot: [
      { itemId: "frame_corrompido", chance: 0.4 },
      { itemId: "lente_trincada", chance: 0.15 },
      { itemId: "mana_potion_medium", chance: 0.1 },
      { itemId: "calca_brim_refletiva", chance: 0.006 },
      { itemId: "gem_green", chance: 0.02 },
    ],
    sprite: grid4(M + "Spirit2/SpriteSheet.png", { tint: 0xd0e8ff }),
  },
  rodeiro_trincado: {
    id: "rodeiro_trincado", name: "Olho Sangrento", level: 45, hp: 820, xp: 1115, damage: [42, 84], damageKind: "physical", armor: 14,
    attackMs: 1900, attackRange: 1, stepMs: 300, aggroRange: 6, fleeAtHpPct: 0, respawnMs: 75_000,
    gold: [120, 240],
    loot: [
      { itemId: "rolamento_de_rodeiro", chance: 0.4 },
      { itemId: "iron_bar", chance: 0.1 },
      { itemId: "health_potion_large", chance: 0.06 },
      { itemId: "botina_seguranca", chance: 0.006 },
      { itemId: "mithril_boots", chance: 0.004 },
    ],
    sprite: grid4(M + "Eye/Eye.png", { tint: 0xe04040, scale: 1.15 }),
  },
  truque_desalinhado: {
    id: "truque_desalinhado", name: "Fera das Brasas", level: 48, hp: 1000, xp: 1420, damage: [48, 92], damageKind: "physical", armor: 16,
    abilities: [
      ability.stomp({ name: "Patada Ardente", radius: 1, min: 50, max: 100, cooldownMs: 12_000 }),
    ],
    attackMs: 2000, attackRange: 1, stepMs: 400, aggroRange: 6, fleeAtHpPct: 0, respawnMs: 80_000,
    gold: [130, 250],
    loot: [
      { itemId: "chaveta", chance: 0.4, min: 1, max: 2 },
      { itemId: "iron_bar", chance: 0.12 },
      { itemId: "health_potion_large", chance: 0.07 },
      { itemId: "mithril_legs", chance: 0.005 },
      { itemId: "gem_yellow", chance: 0.02 },
    ],
    sprite: grid4(M + "Beast/Beast.png", { tint: 0xff8a30, scale: 1.2 }),
  },
  // Bando do Túnel: onde tem uma ratazana, tem dez debaixo do dormente.
  rato_de_lastro: {
    id: "rato_de_lastro", name: "Ratazana Negra", level: 50, hp: 700, xp: 1015, damage: [40, 80], damageKind: "physical", armor: 10,
    attackMs: 1700, attackRange: 1, stepMs: 260, aggroRange: 6, fleeAtHpPct: 0, respawnMs: 70_000,
    pack: { family: "lastro", shout: "Chiii! Pega ele!" },
    gold: [100, 200],
    loot: [
      { itemId: "brita_de_lastro", chance: 0.5, min: 1, max: 3 },
      { itemId: "cheese", chance: 0.2, min: 1, max: 3 },
      { itemId: "health_potion_large", chance: 0.06 },
      { itemId: "ring_furia", chance: 0.004 },
    ],
    sprite: grid4(M + "MouseBlack/SpriteSheet.png", { tint: 0xb0a080, scale: 1.1 }),
  },
  // Mini-chefe da Oficina de Vagões: chama toupeiras que travam o grupo.
  vagao_nao_inspecionavel: {
    id: "vagao_nao_inspecionavel", name: "Ciclope de Pedra", level: 52, hp: 10000, xp: 10000, damage: [85, 160], damageKind: "physical", armor: 18,
    abilities: [
      ability.stomp({ name: "Pisão do Ciclope", radius: 1, min: 90, max: 160, cooldownMs: 11_000 }),
      ability.summon({ name: "Toupeiras, a mim!", monsterId: "sapata_gasta", count: 1, max: 2, cooldownMs: 25_000 }),
    ],
    attackMs: 2000, attackRange: 1, stepMs: 460, aggroRange: 8, fleeAtHpPct: 0, respawnMs: 7_200_000, boss: true,
    gold: [2400, 4000],
    loot: [
      { itemId: "selo_nao_inspecionavel", chance: 1 },
      { itemId: "health_potion_large", chance: 1, min: 2, max: 4 },
      { itemId: "rolamento_de_rodeiro", chance: 1, min: 2, max: 4 },
      { itemId: "anel_do_rodeiro", chance: 0.2 },
      { itemId: "botina_seguranca", chance: 0.25 },
      { itemId: "mithril_armor", chance: 0.15 },
      { itemId: "master_archer_armor", chance: 0.15 },
      { itemId: "archmage_armor", chance: 0.15 },
    ],
    sprite: grid4(M + "Cyclope2/SpriteSheet.png", { tint: 0xa86a48, scale: 1.7 }),
  },
  // Chefe da Malha (evento "Apito da Locomotiva", quarta 17h): bafo de fogo em onda e ratazanas de reforço.
  locomotiva_fantasma: {
    id: "locomotiva_fantasma", name: "Tirano da Serra", level: 58, hp: 14000, xp: 15000, damage: [100, 190], damageKind: "physical", armor: 20,
    abilities: [
      ability.breath({ name: "Bafo do Tirano", length: 4, width: 3, min: 110, max: 200, kind: "fire", fx: "fire", windupMs: 900, cooldownMs: 10_000 }),
      ability.summon({ name: "Rugido da Serra", monsterId: "rato_de_lastro", count: 2, max: 3, cooldownMs: 25_000 }),
    ],
    attackMs: 2000, attackRange: 1, stepMs: 320, aggroRange: 9, fleeAtHpPct: 0, respawnMs: 7_200_000, boss: true,
    gold: [3000, 5000],
    loot: [
      { itemId: "apito_de_locomotiva", chance: 1 },
      { itemId: "health_potion_large", chance: 1, min: 3, max: 5 },
      { itemId: "brita_de_lastro", chance: 1, min: 4, max: 8 },
      { itemId: "anel_do_rodeiro", chance: 0.3 },
      { itemId: "crown_armor", chance: 0.1 },
      { itemId: "royal_armor", chance: 0.1 },
      { itemId: "mystic_armor", chance: 0.1 },
      { itemId: "boots_haste", chance: 0.08 },
    ],
    sprite: grid4(M + "TRex/SpriteSheet.png", { tint: 0x8898b8, scale: 2 }),
  },

  // ===== Caves profundas (ciclo 13, pedido do dono: "mais caves"): duas criaturas novas por cave, com sprites do pack
  // ainda sem uso. Atributos interpolados dos vizinhos de level (aranha/esqueleto, crocodilo/minotauro mago, necromante/
  // herói, colosso), loot só com itens que já existem.
  // Minas Abandonadas (lv 12–28)
  mine_larva: {
    id: "mine_larva", name: "Larva das Minas", level: 14, hp: 150, xp: 80, damage: [10, 22], damageKind: "earth", armor: 3,
    abilities: [
      ability.bolt({ name: "Cuspe Ácido", range: 3, min: 14, max: 26, kind: "earth", fx: "earth", cooldownMs: 9000, condition: { id: "poison", durationMs: 6000, value: 3 } }),
    ],
    attackMs: 2000, attackRange: 1, stepMs: 420, aggroRange: 5, fleeAtHpPct: 0, respawnMs: 45_000,
    gold: [15, 35],
    loot: [
      { itemId: "slime_goo", chance: 0.5, min: 1, max: 2 },
      { itemId: "herb", chance: 0.2 },
      { itemId: "spider_silk", chance: 0.08 },
      { itemId: "health_potion", chance: 0.08 },
    ],
    sprite: grid4(M + "Larva/Larva.png"),
  },
  mine_mole: {
    id: "mine_mole", name: "Toupeira das Minas", level: 22, hp: 260, xp: 175, damage: [18, 38], damageKind: "physical", armor: 7,
    attackMs: 1900, attackRange: 1, stepMs: 380, aggroRange: 6, fleeAtHpPct: 0.15, respawnMs: 55_000,
    pack: { family: "mine_mole", shout: "Grrr! Cavem, irmãs!" },
    gold: [30, 65],
    loot: [
      { itemId: "bone", chance: 0.3 },
      { itemId: "iron_bar", chance: 0.06 },
      { itemId: "gem_green", chance: 0.012 },
      { itemId: "health_potion", chance: 0.12 },
    ],
    sprite: grid4(M + "Mole/Mole.png"),
  },
  // Grutas Alagadas (lv 35–55)
  kappa: {
    id: "kappa", name: "Kappa do Lodo", level: 40, hp: 640, xp: 760, damage: [34, 70], damageKind: "ice", armor: 12,
    abilities: [
      ability.bolt({ name: "Jato de Água", range: 4, min: 40, max: 75, kind: "ice", fx: "ice", cooldownMs: 9000, condition: { id: "slow", durationMs: 3000, value: 30 } }),
    ],
    attackMs: 2000, attackRange: 1, stepMs: 360, aggroRange: 6, fleeAtHpPct: 0.15, respawnMs: 70_000,
    gold: [130, 260],
    loot: [
      { itemId: "lizard_scale", chance: 0.25 },
      { itemId: "croc_leather", chance: 0.1 },
      { itemId: "gem_green", chance: 0.03 },
      { itemId: "health_potion_medium", chance: 0.15 },
      { itemId: "mana_potion_medium", chance: 0.1 },
    ],
    sprite: grid4(M + "KappaGreen/SpriteSheet.png"),
  },
  cave_octopus: {
    id: "cave_octopus", name: "Polvo das Grutas", level: 50, hp: 820, xp: 1150, damage: [40, 85], damageKind: "energy", armor: 9,
    abilities: [
      ability.blast({ name: "Nuvem de Tinta", radius: 1, range: 4, min: 55, max: 95, kind: "energy", fx: "energy", cooldownMs: 9000, condition: { id: "slow", durationMs: 3000, value: 40 } }),
    ],
    attackMs: 2200, attackRange: 4, stepMs: 400, aggroRange: 7, fleeAtHpPct: 0, respawnMs: 80_000,
    gold: [150, 280],
    loot: [
      { itemId: "pirate_coin", chance: 0.25, min: 1, max: 3 },
      { itemId: "ectoplasm", chance: 0.15 },
      { itemId: "gem_yellow", chance: 0.04 },
      { itemId: "mana_potion_medium", chance: 0.2 },
    ],
    sprite: grid4(M + "Octopus/SpriteSheet.png"),
  },
  // Catacumbas Esquecidas (lv 60–85)
  flame_skull: {
    id: "flame_skull", name: "Crânio Flamejante", level: 70, hp: 1700, xp: 3200, damage: [75, 145], damageKind: "fire", armor: 16, undead: true,
    abilities: [
      ability.bolt({ name: "Chama Profana", range: 5, min: 90, max: 160, kind: "fire", fx: "fire", cooldownMs: 8000, condition: { id: "burn", durationMs: 5000, value: 10 } }),
    ],
    attackMs: 2000, attackRange: 4, stepMs: 300, aggroRange: 7, fleeAtHpPct: 0, respawnMs: 100_000,
    gold: [210, 400],
    loot: [
      { itemId: "ember", chance: 0.3 },
      { itemId: "bone", chance: 0.4 },
      { itemId: "necro_skull", chance: 0.12 },
      { itemId: "gem_purple", chance: 0.03 },
      { itemId: "health_potion_large", chance: 0.1 },
    ],
    sprite: grid4(M + "Skull/SpriteSheet.png", { scale: 1.1 }),
  },
  red_lantern: {
    id: "red_lantern", name: "Lanterna Rubra", level: 78, hp: 2100, xp: 4250, damage: [85, 165], damageKind: "death", armor: 18, undead: true,
    abilities: [
      ability.healAllies({ name: "Luz Sangrenta", pct: 0.12, radius: 4, belowHpPct: 0.7, cooldownMs: 10_000 }),
      ability.bolt({ name: "Chama Rubra", range: 4, min: 100, max: 175, kind: "death", fx: "death", cooldownMs: 10_000 }),
    ],
    attackMs: 2200, attackRange: 4, stepMs: 380, aggroRange: 7, fleeAtHpPct: 0, respawnMs: 110_000,
    gold: [240, 460],
    loot: [
      { itemId: "ectoplasm", chance: 0.3 },
      { itemId: "necro_skull", chance: 0.15 },
      { itemId: "gem_purple", chance: 0.05 },
      { itemId: "mana_potion_large", chance: 0.12 },
      { itemId: "amulet_lich", chance: 0.005 },
    ],
    sprite: grid4(M + "LanternRed/SpriteSheet.png", { scale: 1.1 }),
  },
  // Abismo Profundo (lv 100–130)
  abyss_tengu: {
    id: "abyss_tengu", name: "Tengu Rubro", level: 112, hp: 6000, xp: 13500, damage: [140, 270], damageKind: "energy", armor: 30,
    abilities: [
      ability.blast({ name: "Vendaval", radius: 2, range: 4, min: 170, max: 290, kind: "energy", fx: "energy", windupMs: 800, cooldownMs: 11_000 }),
      ability.bolt({ name: "Raio do Tengu", range: 5, min: 150, max: 260, kind: "energy", fx: "energy", cooldownMs: 8000 }),
    ],
    attackMs: 2000, attackRange: 4, stepMs: 320, aggroRange: 7, fleeAtHpPct: 0, respawnMs: 150_000,
    gold: [480, 950],
    loot: [
      { itemId: "demonic_essence", chance: 0.12 },
      { itemId: "gem_purple", chance: 0.12 },
      { itemId: "mana_potion_large", chance: 0.25, min: 1, max: 3 },
      { itemId: "health_potion_large", chance: 0.2, min: 1, max: 2 },
      { itemId: "starstorm_wand", chance: 0.004 },
      { itemId: "mystic_armor", chance: 0.004 },
      // Ciclo 16: tier 8 dos magos e do paladino (o Samurai Rubro dá o do cavaleiro e o resto do paladino).
      { itemId: "abyss_shard", chance: 0.25 },
      { itemId: "abyss_wand", chance: 0.002 },
      { itemId: "abyss_rod", chance: 0.002 },
      { itemId: "abyss_mage_helmet", chance: 0.003 },
      { itemId: "abyss_mage_armor", chance: 0.0015 },
      { itemId: "spellbook_abyss", chance: 0.002 },
      { itemId: "abyss_bow", chance: 0.002 },
      { itemId: "abyss_archer_helmet", chance: 0.003 },
    ],
    sprite: strip(B + "TenguRed/Walk.png", 82, 10, { scale: 0.38 }),
  },
  abyss_samurai: {
    id: "abyss_samurai", name: "Samurai Rubro", level: 120, hp: 8000, xp: 17500, damage: [170, 320], damageKind: "physical", armor: 44,
    abilities: [
      ability.stomp({ name: "Corte Giratório", radius: 1, min: 200, max: 340, windupMs: 700, cooldownMs: 10_000 }),
    ],
    attackMs: 1900, attackRange: 1, stepMs: 340, aggroRange: 6, fleeAtHpPct: 0, respawnMs: 170_000,
    gold: [600, 1200],
    loot: [
      { itemId: "juggernaut_plate", chance: 0.15 },
      { itemId: "mithril_bar", chance: 0.15 },
      { itemId: "gem_yellow", chance: 0.15 },
      { itemId: "health_potion_large", chance: 0.3, min: 2, max: 3 },
      { itemId: "magic_longsword", chance: 0.004 },
      { itemId: "demon_armor", chance: 0.003 },
      { itemId: "ferumbras_legs", chance: 0.003 },
      // Ciclo 16: tier 8 do cavaleiro e do paladino.
      { itemId: "abyss_shard", chance: 0.3 },
      { itemId: "abyss_blade", chance: 0.002 },
      { itemId: "abyss_helmet", chance: 0.003 },
      { itemId: "abyss_armor", chance: 0.0015 },
      { itemId: "abyss_shield", chance: 0.003 },
      { itemId: "abyss_archer_armor", chance: 0.0015 },
      { itemId: "abyss_archer_legs", chance: 0.002 },
    ],
    // Walk.png 576x48 = 6 frames de 96x48 (largura dupla; ver assets/CATALOG.md). Em 12 de 48 animava meio samurai.
    sprite: strip(B + "GiantRedSamurai/Walk.png", 48, 6, { frameWidth: 96, scale: 0.65 }),
  },

  // ===== Chefes de covil (ciclo 16): um na sala do fundo de cada cave do ciclo 13, nascendo como objeto no fim do mapa
  // (tools/mapgen/generate.mjs, lateObjects14). Vida da tabela do plano; XP, ouro e dano entre os chefes vizinhos de
  // level. A prova (100%) é troféu; o baú do covil abre para quem tem o abate registrado (shared/data/questWorld.ts).
  lair_mole_king: {
    id: "lair_mole_king", name: "Rei Toupeira", level: 28, hp: 4500, xp: 3600, damage: [40, 80], damageKind: "physical", armor: 10,
    abilities: [
      ability.stomp({ name: "Desmoronamento", radius: 1, min: 45, max: 85, cooldownMs: 11_000 }),
      ability.summon({ name: "Cavem, filhas!", monsterId: "mine_mole", count: 1, max: 2, cooldownMs: 25_000 }),
    ],
    attackMs: 2000, attackRange: 1, stepMs: 440, aggroRange: 8, fleeAtHpPct: 0, respawnMs: 7_200_000, boss: true,
    gold: [1200, 2200],
    loot: [
      { itemId: "mole_king_claw", chance: 1 },
      { itemId: "health_potion_large", chance: 1, min: 2, max: 3 },
      { itemId: "iron_bar", chance: 1, min: 2, max: 4 },
      { itemId: "gem_green", chance: 0.8, min: 1, max: 2 },
      { itemId: "mithril_bar", chance: 0.3 },
      { itemId: "ring_furia", chance: 0.2 },
      { itemId: "colete_refletivo", chance: 0.2 },
      { itemId: "amulet_lich", chance: 0.15 },
      { itemId: "battle_axe", chance: 0.12 },
      { itemId: "composite_bow", chance: 0.12 },
    ],
    // Idle.png 360x60 = 6 frames de 60x60 (o guaxinim gigante, tingido de terra).
    sprite: strip(B + "GiantRacoon/Idle.png", 60, 6, { tint: 0xd8b088, scale: 1.25 }),
  },
  lair_kraken: {
    id: "lair_kraken", name: "Kraken das Grutas", level: 54, hp: 11000, xp: 11000, damage: [80, 150], damageKind: "ice", armor: 18,
    abilities: [
      ability.blast({ name: "Tinta Abissal", radius: 2, range: 4, min: 90, max: 160, kind: "ice", fx: "ice", cooldownMs: 10_000, condition: { id: "slow", durationMs: 3000, value: 40 } }),
      ability.summon({ name: "Filhotes, ao ataque!", monsterId: "cave_octopus", count: 1, max: 2, cooldownMs: 25_000 }),
    ],
    attackMs: 2200, attackRange: 3, stepMs: 400, aggroRange: 8, fleeAtHpPct: 0, respawnMs: 7_200_000, boss: true,
    gold: [2400, 4200],
    loot: [
      { itemId: "kraken_eye", chance: 1 },
      { itemId: "health_potion_large", chance: 1, min: 3, max: 5 },
      { itemId: "mana_potion_large", chance: 1, min: 2, max: 4 },
      { itemId: "croc_leather", chance: 1, min: 2, max: 4 },
      { itemId: "gem_yellow", chance: 0.7, min: 1, max: 2 },
      { itemId: "ring_might", chance: 0.15 },
      { itemId: "amulet_minotaur", chance: 0.15 },
      { itemId: "crown_armor", chance: 0.1 },
      { itemId: "royal_armor", chance: 0.1 },
      { itemId: "mystic_armor", chance: 0.1 },
    ],
    // Walk.png 304x79 = 4 frames de 76x79.
    sprite: strip(B + "SquidGreen/Walk.png", 79, 4, { frameWidth: 76, scale: 0.95 }),
  },
  lair_flame: {
    id: "lair_flame", name: "Chama Ancestral", level: 82, hp: 22000, xp: 26000, damage: [140, 260], damageKind: "fire", armor: 28,
    abilities: [
      ability.blast({ name: "Fogo Ancestral", radius: 2, range: 5, min: 160, max: 280, kind: "fire", fx: "fire", cooldownMs: 9000, condition: { id: "burn", durationMs: 6000, value: 20 } }),
      ability.summon({ name: "Acordem, crânios!", monsterId: "flame_skull", count: 1, max: 2, cooldownMs: 30_000 }),
    ],
    attackMs: 2200, attackRange: 4, stepMs: 380, aggroRange: 8, fleeAtHpPct: 0, respawnMs: 10_800_000, boss: true,
    gold: [4500, 8000],
    loot: [
      { itemId: "ancestral_heart", chance: 1 },
      { itemId: "ember", chance: 1, min: 4, max: 8 },
      { itemId: "necro_skull", chance: 1, min: 2, max: 4 },
      { itemId: "health_potion_large", chance: 1, min: 3, max: 5 },
      { itemId: "gem_purple", chance: 0.7, min: 1, max: 2 },
      { itemId: "demon_helmet", chance: 0.12 },
      { itemId: "dragon_scale_helmet", chance: 0.12 },
      { itemId: "ferumbras_helmet", chance: 0.12 },
      { itemId: "ring_demodras", chance: 0.1 },
      { itemId: "magic_longsword", chance: 0.08 },
    ],
    sprite: strip(B + "GiantFlam/Idle.png", 50, 5, { tint: 0xd090ff, scale: 1.6 }),
  },
  // Tier 8 (16-2): as peças que Orshabaal não dá (elmos, escudo e grevas), 10–12%, e o Fragmento Abissal sempre.
  lair_shogun: {
    id: "lair_shogun", name: "Shogun Abissal", level: 125, hp: 45000, xp: 60000, damage: [210, 390], damageKind: "physical", armor: 48,
    abilities: [
      ability.stomp({ name: "Corte do Shogun", radius: 1, min: 240, max: 420, windupMs: 700, cooldownMs: 10_000 }),
      ability.breath({ name: "Vendaval de Lâminas", length: 4, width: 3, min: 200, max: 360, kind: "physical", fx: "physical", windupMs: 900, cooldownMs: 12_000 }),
      ability.summon({ name: "Samurais, a mim!", monsterId: "abyss_samurai", count: 1, max: 2, cooldownMs: 30_000 }),
    ],
    attackMs: 1900, attackRange: 1, stepMs: 330, aggroRange: 8, fleeAtHpPct: 0, respawnMs: 14_400_000, boss: true,
    gold: [12000, 20000],
    loot: [
      { itemId: "shogun_seal", chance: 1 },
      { itemId: "demonic_essence", chance: 1, min: 2, max: 4 },
      { itemId: "juggernaut_plate", chance: 1, min: 2, max: 3 },
      { itemId: "health_potion_large", chance: 1, min: 4, max: 6 },
      { itemId: "gem_purple", chance: 0.8, min: 2, max: 3 },
      { itemId: "magic_longsword", chance: 0.12 },
      { itemId: "demon_armor", chance: 0.12 },
      { itemId: "dragon_scale_armor", chance: 0.1 },
      { itemId: "ferumbras_armor", chance: 0.1 },
      { itemId: "boots_haste", chance: 0.15 },
      { itemId: "abyss_shard", chance: 1, min: 2, max: 3 },
      { itemId: "abyss_helmet", chance: 0.12 },
      { itemId: "abyss_shield", chance: 0.12 },
      { itemId: "abyss_archer_helmet", chance: 0.1 },
      { itemId: "abyss_archer_legs", chance: 0.1 },
      { itemId: "abyss_mage_helmet", chance: 0.1 },
    ],
    // Walk.png 576x48 = 6 frames de 96x48, como o Samurai Rubro, só que em tamanho de chefe.
    sprite: strip(B + "GiantBlueSamurai/Walk.png", 48, 6, { frameWidth: 96, scale: 1.5 }),
  },
};

// ---------------------------------------------------------------------------
// Transformação única dos dados (ciclo 8): dano por level e respawn mais rápido. Aplicada UMA vez ao carregar, então
// servidor, cliente (olhar, bestiário) e testes veem o mesmo número.
// ---------------------------------------------------------------------------

/**
 * Multiplicador do dano dos monstros pelo level (ataque básico e habilidades, chefes inclusive): a cura dos jogadores
 * (poção grande 450, exura ~150–200/s) sobrava contra 25–90 de dano por segundo por monstro do level.
 */
export const MONSTER_DAMAGE_TIERS: readonly { fromLevel: number; mult: number }[] = [
  { fromLevel: 1, mult: 1 },
  { fromLevel: 20, mult: 1.4 },
  { fromLevel: 40, mult: 1.5 },
  { fromLevel: 70, mult: 1.6 },
  { fromLevel: 100, mult: 1.7 },
];
/** Respawn dos monstros comuns (não chefes): ×0,7 (~30% mais rápido). */
export const MONSTER_RESPAWN_MULT = 0.7;

/**
 * Resistência elemental (pedido do dono): bicho do elemento X toma menos dano de X (dragão de fogo resiste a fogo, de
 * gelo a gelo, morto-vivo a morte). Vale para qualquer fonte (magia, varinha/bastão, invocação). Físico não muda: o
 * cavaleiro e o paladino batem igual em todo mundo.
 */
export const OWN_ELEMENT_TAKEN = 0.5;

/** Natureza que dá fraqueza elemental: morto-vivo, bicho de fogo, bicho de gelo. */
export type MonsterNature = "undead" | "fire" | "ice";

/**
 * Fraquezas elementais (ciclo 15): morto-vivo toma +25% de sagrado; bicho de fogo, +15% de gelo; bicho de gelo, +15% de
 * fogo. Dão papel ao paladino nos mortos-vivos do lv 60–80 e ao druida contra dragões e demônios. Como a resistência,
 * valem para qualquer fonte; o `resist` do monstro sobrepõe as duas.
 */
export const ELEMENT_WEAKNESS: Readonly<Record<MonsterNature, { kind: DamageKind; mult: number }>> = {
  undead: { kind: "holy", mult: 1.25 },
  fire: { kind: "ice", mult: 1.15 },
  ice: { kind: "fire", mult: 1.15 },
};

/**
 * Naturezas do monstro: morto-vivo pelo campo `undead`; bicho de fogo/gelo pelo mesmo critério da resistência (o
 * `damageKind`), para quem resiste a fogo ser sempre fraco a gelo e vice-versa.
 */
export function monsterNatures(d: Pick<MonsterDef, "damageKind" | "undead">): MonsterNature[] {
  const out: MonsterNature[] = [];
  if (d.undead) out.push("undead");
  if (d.damageKind === "fire") out.push("fire");
  if (d.damageKind === "ice") out.push("ice");
  return out;
}

/**
 * Fração do dano de `kind` que o monstro recebe (depois da armadura). `exposedPct` = Ruptura Elemental ativa no monstro
 * (condição "exposed"): o dano elemental perde a resistência (a fraqueza fica) e ganha +exposedPct%; o físico não muda.
 * O próprio elemento resiste antes de qualquer fraqueza: ninguém é fraco ao próprio elemento.
 */
export function damageTakenMult(d: Pick<MonsterDef, "damageKind" | "resist" | "undead">, kind: DamageKind, exposedPct = 0): number {
  const own = d.resist?.[kind];
  let base = 1;
  if (own !== undefined) base = own;
  else if (kind !== "physical" && kind === d.damageKind) base = OWN_ELEMENT_TAKEN;
  else for (const n of monsterNatures(d)) if (ELEMENT_WEAKNESS[n].kind === kind) base *= ELEMENT_WEAKNESS[n].mult;
  if (!(exposedPct > 0) || kind === "physical") return base;
  return Math.max(base, 1) * (1 + exposedPct / 100);
}

/**
 * Elementos em que o dano recebido não é o normal (bestiário), em ordem de multiplicador: resistências (< 1) primeiro,
 * depois as fraquezas (> 1).
 */
export function monsterResistances(d: Pick<MonsterDef, "damageKind" | "resist" | "undead">): { kind: DamageKind; mult: number }[] {
  const kinds: DamageKind[] = ["fire", "ice", "energy", "earth", "holy", "death", "physical"];
  return kinds.map((kind) => ({ kind, mult: damageTakenMult(d, kind) })).filter((r) => r.mult !== 1).sort((a, b) => a.mult - b.mult);
}

/** Fica de fora do multiplicador e das elites: invocação de jogador e boneco de treino (XP 0, parados). */
const scalesWithLevel = (d: Pick<MonsterDef, "xp" | "stationary" | "invulnerable">) => d.xp > 0 && !d.stationary && !d.invulnerable;

/** Multiplicador de dano já aplicado aos dados deste monstro (1 para quem não escala). */
export function monsterDamageMult(d: Pick<MonsterDef, "level" | "xp" | "stationary" | "invulnerable">): number {
  if (!scalesWithLevel(d)) return 1;
  let mult = 1;
  for (const t of MONSTER_DAMAGE_TIERS) if (d.level >= t.fromLevel) mult = t.mult;
  return mult;
}

for (const d of Object.values(MONSTERS)) {
  const k = monsterDamageMult(d);
  if (k !== 1) {
    d.damage = [Math.round(d.damage[0] * k), Math.round(d.damage[1] * k)];
    d.abilities = d.abilities?.map((a) => a.damage ? { ...a, damage: { ...a.damage, min: Math.round(a.damage.min * k), max: Math.round(a.damage.max * k) } } : a);
  }
  if (!d.boss && scalesWithLevel(d)) d.respawnMs = Math.round(d.respawnMs * MONSTER_RESPAWN_MULT);
}

// ---------------------------------------------------------------------------
// Elites e pedido de reforço (ciclo 8)
// ---------------------------------------------------------------------------

/** Chance de um monstro comum (não chefe, level ≥ ELITE_MIN_LEVEL) nascer elite. */
export const ELITE_CHANCE = 0.05;
export const ELITE_MIN_LEVEL = 10;
/** Multiplicadores da elite: vida, dano, XP, ouro e chance de cada item do loot. */
export const ELITE = { hp: 2.5, dmg: 1.3, xp: 3, gold: 2, loot: 2 } as const;
/** Cor do nome da elite (dourado). */
export const ELITE_COLOR = "#f0c040";

/**
 * Invocações escalam com o level de quem invoca (ciclo 9, GD-05): o catálogo descreve a criatura no seu `level` base
 * (o Lobo Espiritual, no 20), e o lobo fixo ficava inútil no 50+. Cada level acima do base soma SUMMON_HP_PER_LEVEL de
 * vida e o dano cresce linearmente: ×(1 + SUMMON_DMG_BONUS) SUMMON_DMG_LEVELS levels acima, e segue a mesma reta (lobo
 * lv 46: vida 830, dano ×2,5; lv 100: vida 2.180, dano ×5,6). Abaixo do level base nada muda; o catálogo não é alterado.
 * Ciclo 15: era 15 de vida por level e bônus 0,75 (lv 100: vida 1.380, dano ×3,3): o lobo sumia no fim de jogo.
 */
export const SUMMON_HP_PER_LEVEL = 25;
export const SUMMON_DMG_BONUS = 1.5;
export const SUMMON_DMG_LEVELS = 26;
export function summonScaled(def: MonsterDef, casterLevel: number): MonsterDef {
  const over = Math.max(0, Math.floor(casterLevel) - def.level);
  if (over <= 0) return def;
  const mult = 1 + (SUMMON_DMG_BONUS * over) / SUMMON_DMG_LEVELS;
  return { ...def, hp: def.hp + SUMMON_HP_PER_LEVEL * over, damage: [Math.round(def.damage[0] * mult), Math.round(def.damage[1] * mult)] };
}
export const eliteName = (name: string): string => `Elite ${name}`;

/** Este tipo pode nascer elite? (o servidor ainda exclui invocações, ondas do Coliseu e salas de quest). */
export function canBeElite(d: Pick<MonsterDef, "boss" | "level" | "xp" | "stationary" | "invulnerable">): boolean {
  return !d.boss && d.level >= ELITE_MIN_LEVEL && scalesWithLevel(d);
}

/** Raio (Chebyshev) do pedido de reforço dos bandos. */
export const HELP_RADIUS = 6;

/**
 * Controle em chefe (ciclo 15): a raiz vira lentidão de BOSS_ROOT_SLOW_PCT% e a lentidão vale BOSS_SLOW_MULT do valor.
 * Raiz inteira deixava o chefe parado 3 s com o grupo batendo de longe. As Raízes da Terra (lv 100) seguem úteis contra
 * chefes: 30% é mais que qualquer lentidão de magia pela metade (a maior, 50%, vira 25%).
 */
export const BOSS_ROOT_SLOW_PCT = 30;
export const BOSS_SLOW_MULT = 0.5;

/** Condição que um chefe recebe no lugar de `id`/`value` (as demais passam iguais). */
export function bossCondition(id: ConditionId, value: number | undefined): { id: ConditionId; value: number | undefined } {
  if (id === "rooted") return { id: "slow", value: BOSS_ROOT_SLOW_PCT };
  if (id === "slow") return { id, value: Math.round((value ?? 0) * BOSS_SLOW_MULT) };
  return { id, value };
}

export function monsterDef(id: string): MonsterDef | undefined {
  return Object.hasOwn(MONSTERS, id) ? MONSTERS[id] : undefined;
}

/** Habilidade a partir do id do efeito visual (`m:<monstro>:<habilidade>`); undefined = não é de monstro. */
export function monsterAbilityByFxId(spellId: string): MonsterAbility | undefined {
  if (!spellId.startsWith(MONSTER_ABILITY_PREFIX)) return undefined;
  const rest = spellId.slice(MONSTER_ABILITY_PREFIX.length);
  const i = rest.indexOf(":");
  if (i <= 0) return undefined;
  const def = monsterDef(rest.slice(0, i));
  const id = rest.slice(i + 1);
  // Pedido de reforço: não é habilidade da lista, mas usa o mesmo efeito/grito.
  if (id === CALL_HELP_ID && def?.pack) return { id, name: def.pack.shout, shape: "self", radius: HELP_RADIUS, cooldownMs: 0, fx: "taunt" };
  return def?.abilities?.find((a) => a.id === id);
}

const ABILITY_TARGET: Record<MonsterAbility["shape"], SpellTarget> = {
  target: "target", area_self: "area_self", area_target: "area_target", wave: "wave", self: "self",
};

/** SpellDef "de mentira" para o cliente desenhar a habilidade com o mesmo código das magias (grito = `words`). */
export function monsterAbilitySpell(spellId: string): SpellDef | undefined {
  const a = monsterAbilityByFxId(spellId);
  if (!a) return undefined;
  return {
    id: spellId, name: a.name, words: a.name, vocations: [], level: 0, mana: 0, cooldownMs: a.cooldownMs, global: false,
    target: ABILITY_TARGET[a.shape], range: a.range, radius: a.radius, length: a.length, width: a.width,
    fx: a.fx, description: a.name,
  };
}

/*
 * TABELA DE BALANCEAMENTO (acertos medios de um cavaleiro no level da zona: 6+1.6*lvl - armor)
 * Ciclo 8: o "dano medio" abaixo é o escrito nos dados, ANTES de MONSTER_DAMAGE_TIERS (×1,4 do lv 20, ×1,5 do 40,
 * ×1,6 do 70, ×1,7 do 100); o respawn dos comuns também fica ×0,7 depois de carregar.
 * monstro        lvl   hp    xp   dano medio   acertos p/ matar
 * rat             1    25     6     3.5         3.3 (lv1)
 * slime           2    40    10     5           ~4
 * bee             5    45    14     6.5         3.2 (passiva)
 * wolf            8    90    35    13           5   (perigoso lv1-3: ~8 dps vs 150 HP)
 * snake          12   140    60    16           6.4
 * spider         16   180   100    19 (dist 3)  6.5
 * bat            18   170   100    21           5.2
 * skeleton       24   280   200    31           7.3
 * goblin         25   280   200    29           7   (foge a 20%)
 * ghost          31   380   360    37.5         7.5
 * lizardman      34   450   460    45           8.9
 * flame_spirit   38   480   600    52.5 (dist 4) 8.2
 * swamp_lich*    25  3500  2500    50 (dist 5)  ~90 acertos => grupo de 3-4 (~1 min)
 * goblin_king*   40  6000  6000    90           ~110 acertos => grupo de 3-4 (~1 min), respawn 2 h
 * --- Terras Selvagens (armas tier 6/7: o cavaleiro de skill ~70 bate ~200-300 por acerto)
 * orc_warrior    42   700   900    60
 * orc_shaman     44   600   800    52 (dist 4, foge a 15%)
 * minotaur       48   900  1260    72
 * minotaur_mage  50   800  1150    67 (dist 4)
 * cyclops        55  1200  1800    97
 * bonelord       60  1100  1760    82 (dist 4, morte)
 * black_knight   65  1800  3000   115
 * dragon         70  2000  3500   105 (dist 3, fogo)
 * dragon_lord    85  3200  6100   145 (dist 3, fogo)
 * behemoth       90  4000  8000   175
 * demon         100  5000 10500   190 (dist 4, fogo)
 * horned_fox*    55 12000 12000   130          grupo de 3+, respawn 2 h
 * demodras*      80 25000 30000   215 (dist 4) grupo de 4+, respawn 3 h
 * orshabaal*    120 60000 80000   310 (dist 5) grupo de 5+, respawn 4 h
 * --- Costa Esmeralda (selva/piratas preenchem o lv 25-45; gelo/heróis/vulcão o 50-110)
 * sibang         26   300   240    30 (dist 3, foge a 20%)
 * kongra         28   340   290    34
 * tarantula      30   380   340    35 (terra)
 * pirate_mar.    30   360   320    36
 * merlkin        32   360   350    37.5 (dist 4, energia)
 * pirate_cors.   35   420   440    42 (dist 4)
 * crocodile      36   520   560    46
 * pirate_bucc.   38   560   660    51
 * carniphila     40   600   760    52 (dist 2, lenta)
 * winter_wolf    50   850  1230    72 (gelo, rápido)
 * barbarian      55  1250  1900    97
 * ice_witch      62  1150  1900    87 (dist 4, gelo)
 * necromancer    68  1500  2550   102 (dist 4, morte)
 * hero           72  2200  3900   122
 * frost_dragon   80  2800  5150   132 (dist 3, gelo)
 * magma_elem.    86  3000  5800   145 (dist 3, fogo)
 * hellhound      95  4500  9300   182 (fogo, rápido)
 * juggernaut    110  6500 14300   220
 * captain_redb.* 42  7000  7000   100          grupo de 3+, respawn 2 h
 * kongra_king*   45  9000  9000   115          grupo de 3+, respawn 2 h
 * yeti*          70 18000 20000   185          grupo de 4+, respawn 3 h (raid quinta 12h15)
 * ferumbras*    140 90000 120000  350 (dist 5) grupo de 6+, respawn 6 h (raid domingo 15h)
 * --- Oficina dos Engenhos (ciclo 10: reskins em áreas existentes)
 * datacenter_rat  3    40    12     4
 * runaway_drum   10   120    52     7  (passiva, foge a 60%)
 * slag_slime     20   220   140    22  (fogo, bando)
 * --- Malha da Ferrovia (ciclo 11: região só de trem, lv 25–60)
 * engate_solto       28   330   285    34  ("Cobra Listrada")
 * sapata_gasta       32   420   420    39  ("Toupeira Dourada"; lenta, armadura 12)
 * iluminador_reb.    36   460   530    42  (dist 4, fogo; clarão de energia)
 * frame_descartado   40   500   650    45  (energia, foge a 45%)
 * rodeiro_trincado   45   820  1115    63  ("Olho Sangrento")
 * truque_desalinh.   48  1000  1420    70  ("Fera das Brasas"; pisão)
 * rato_de_lastro     50   700  1015    60  ("Ratazana Negra"; bando "lastro")
 * vagao_nao_insp.*   52 10000 10000   122          grupo de 3+, respawn 2 h (invoca toupeiras)
 * locomotiva_fant.*  58 14000 15000   145          "Tirano da Serra"; grupo de 3-4, respawn 2 h (quarta 17h)
 * --- Covis das caves profundas (ciclo 16: um chefe na sala do fundo de cada cave; a prova abre o baú do covil)
 * lair_mole_king*    28  4500  3600    60          "Rei Toupeira" (Minas); grupo de 2-3, respawn 2 h (invoca toupeiras)
 * lair_kraken*       54 11000 11000   115 (dist 3, gelo) "Kraken das Grutas"; grupo de 3+, respawn 2 h
 * lair_flame*        82 22000 26000   200 (dist 4, fogo) "Chama Ancestral" (Catacumbas); grupo de 4+, respawn 3 h
 * lair_shogun*      125 45000 60000   300          "Shogun Abissal" (Abismo Profundo); grupo de 5+, respawn 4 h
 * (*boss). Magos causam ~30% menos por acerto: 4+1.1*lvl.
 */

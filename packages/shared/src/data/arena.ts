// Coliseu: tabela de ondas, escalas (tamanho do grupo, level médio) e recompensas. Servidor (systems/arena.ts) e
// cliente (textos/HUD) usam estas funções; o modelo de server/systems/balanceKit.ts (metas em arena.test.ts) simula as ondas.
import { monsterDef } from "./monsters.ts";

/** Membros do lobby precisam ficar a até esta distância (Chebyshev) do NPC do coliseu, senão saem do lobby. */
export const ARENA_LOBBY_RANGE = 8;
/** Contagem na vila (ao iniciar com arena livre) antes do teletransporte. */
export const ARENA_COUNTDOWN_MS = 5000;
/** Contagem dentro da arena (3-2-1) antes da onda 1. */
export const ARENA_INTRO_MS = 3000;
/** Respiro entre ondas comuns (sem loja): a próxima onda vem logo. */
export const ARENA_BREAK_MS = 3000;
/** Pausa com o vendedor (loja/"Pronto") só depois das ondas-chefe (a cada ARENA_BOSS_EVERY). */
export const ARENA_SHOP_PAUSE_MS = 45_000;
/** Todos os vivos "prontos" → próxima onda em ARENA_READY_MS. */
export const ARENA_READY_MS = 3000;
/** Aviso visual antes de cada monstro aparecer (o tile de spawn "brilha"); monstros seguintes escalonados. */
export const ARENA_SPAWN_DELAY_MS = 800;
export const ARENA_SPAWN_STAGGER_MS = 150;
/** Cura no fim de cada onda (fração de vida e mana máximas). */
export const ARENA_PAUSE_HEAL = 0.3;
/** Última onda (vencê-la = "completed", com bônus). */
export const ARENA_MAX_WAVE = 60;
/** Ondas-chefe: múltiplos disto. */
export const ARENA_BOSS_EVERY = 5;
/** XP por onda = soma da XP dos monstros da onda × isto ÷ membros vivos. */
export const ARENA_XP_MULT = 1.2;

export interface ArenaWaveEntry {
  /** Id em MONSTERS. */
  id: string;
  /** Quantidade para 1 jogador (escala com o grupo, ver arenaCountMult). */
  count: number;
  /** Elite: multiplicador de vida (e de XP) da instância. Elites/chefes não escalam a QUANTIDADE com o grupo, e sim a vida. */
  elite?: number;
  /** Multiplicador de dano da elite (padrão 1). */
  eliteDmg?: number;
}

export interface ArenaWave {
  wave: number;
  /** Level "justo" para 1 jogador nesta onda (base da escala por level do grupo). */
  level: number;
  boss?: boolean;
  monsters: ArenaWaveEntry[];
}

const W = (wave: number, level: number, monsters: ArenaWaveEntry[], boss = false): ArenaWave =>
  ({ wave, level, monsters, ...(boss ? { boss } : {}) });
const m = (id: string, count: number): ArenaWaveEntry => ({ id, count });
const elite = (id: string, hp: number, dmg = 1.25): ArenaWaveEntry => ({ id, count: 1, elite: hp, eliteDmg: dmg });

/**
 * TABELA DE ONDAS (quantidades para 1 jogador; `level` = level justo para jogar sozinho).
 *  1-4   ratos, gosmas, abelhas (aquecimento)
 *  5     CHEFE: Lobo de elite (vida ×2.5, dano ×1.25)
 *  6-9   lobos, depois cobras
 *  10    CHEFE: Cobra de elite (vida ×3)
 *  11-14 aranhas (distância), morcegos
 *  15    CHEFE: Morcego de elite (vida ×3.5)
 *  16-19 esqueletos e goblins
 *  20    CHEFE: Esqueleto de elite (vida ×4)
 *  21-24 fantasmas e homens-lagarto
 *  25    CHEFE: Lich do Pântano (chefe de zona)
 *  26-29 espíritos de chama e homens-lagarto
 *  30    CHEFE: Rei Goblin (chefe de zona)
 *  31-34 orcs e minotauros (Terras Selvagens)
 *  35    CHEFE: Raposa Chifruda (chefe de zona)
 *  36-39 lobos do inverno, ciclopes, bárbaros, olhos malignos
 *  40    CHEFE: Bárbaro de elite (vida ×4)
 *  41-44 bruxas do gelo, cavaleiros negros, necromantes, heróis
 *  45    CHEFE: Yeti (chefe de zona)
 *  46-49 dragões e dragões de gelo
 *  50    CHEFE: Demodras (chefe de zona)
 *  51-54 senhores dos dragões, elementais de magma, behemoths
 *  55    CHEFE: Behemoth de elite (vida ×3)
 *  56-59 cães infernais, demônios, juggernaut
 *  60    CHEFE FINAL: Orshabaal (chefe de zona)
 */
export const ARENA_WAVES: ArenaWave[] = [
  W(1, 1, [m("rat", 3)]),
  W(2, 2, [m("rat", 2), m("slime", 2)]),
  W(3, 3, [m("slime", 3), m("bee", 1)]),
  W(4, 4, [m("bee", 3), m("slime", 1)]),
  W(5, 6, [elite("wolf", 2.5), m("rat", 2)], true),
  W(6, 7, [m("wolf", 2), m("bee", 1)]),
  W(7, 8, [m("wolf", 3)]),
  W(8, 10, [m("wolf", 2), m("snake", 2)]),
  W(9, 11, [m("snake", 3), m("wolf", 1)]),
  W(10, 13, [elite("snake", 3), m("wolf", 2)], true),
  W(11, 14, [m("spider", 2), m("snake", 2)]),
  W(12, 16, [m("spider", 2), m("bat", 2)]),
  W(13, 17, [m("bat", 3), m("spider", 1), m("snake", 1)]),
  W(14, 18, [m("spider", 3), m("bat", 2)]),
  W(15, 20, [elite("bat", 3.5), m("spider", 2)], true),
  W(16, 21, [m("skeleton", 2), m("bat", 2)]),
  W(17, 23, [m("goblin", 2), m("skeleton", 2)]),
  W(18, 24, [m("skeleton", 3), m("goblin", 2)]),
  W(19, 25, [m("goblin", 3), m("skeleton", 2), m("bat", 1)]),
  W(20, 27, [elite("skeleton", 4), m("goblin", 2)], true),
  W(21, 28, [m("ghost", 2), m("skeleton", 2)]),
  W(22, 30, [m("ghost", 3), m("goblin", 1)]),
  W(23, 31, [m("lizardman", 2), m("ghost", 2)]),
  W(24, 33, [m("lizardman", 3), m("ghost", 1)]),
  W(25, 34, [{ id: "swamp_lich", count: 1, elite: 1 }, m("ghost", 2)], true),
  W(26, 35, [m("flame_spirit", 2), m("lizardman", 2)]),
  W(27, 36, [m("flame_spirit", 3), m("ghost", 2)]),
  W(28, 37, [m("lizardman", 3), m("flame_spirit", 2)]),
  W(29, 38, [m("flame_spirit", 3), m("lizardman", 2)]),
  W(30, 40, [{ id: "goblin_king", count: 1, elite: 1 }, m("flame_spirit", 2)], true),
  W(31, 42, [m("orc_warrior", 2), m("orc_shaman", 1)]),
  W(32, 44, [m("orc_warrior", 2), m("orc_shaman", 2)]),
  W(33, 46, [m("minotaur", 2), m("orc_shaman", 1)]),
  W(34, 48, [m("minotaur", 2), m("minotaur_mage", 1)]),
  W(35, 50, [{ id: "horned_fox", count: 1, elite: 1 }, m("minotaur", 1)], true),
  W(36, 52, [m("winter_wolf", 3)]),
  W(37, 54, [m("cyclops", 2), m("winter_wolf", 1)]),
  W(38, 56, [m("barbarian", 2), m("cyclops", 1)]),
  W(39, 58, [m("bonelord", 2), m("barbarian", 1)]),
  W(40, 60, [elite("barbarian", 4), m("ice_witch", 1)], true),
  W(41, 62, [m("ice_witch", 2), m("bonelord", 1)]),
  W(42, 64, [m("black_knight", 2)]),
  W(43, 66, [m("necromancer", 1), m("black_knight", 1)]),
  W(44, 68, [m("hero", 1), m("necromancer", 1)]),
  W(45, 70, [{ id: "yeti", count: 1, elite: 1 }, m("ice_witch", 1)], true),
  W(46, 72, [m("dragon", 1), m("hero", 1)]),
  W(47, 74, [m("dragon", 2), m("ice_witch", 1)]),
  W(48, 77, [m("frost_dragon", 1), m("dragon", 1)]),
  W(49, 80, [m("frost_dragon", 2)]),
  W(50, 82, [{ id: "demodras", count: 1, elite: 1 }, m("dragon", 1)], true),
  W(51, 85, [m("dragon_lord", 1), m("frost_dragon", 1)]),
  W(52, 87, [m("magma_elemental", 2)]),
  W(53, 89, [m("dragon_lord", 2)]),
  W(54, 91, [m("behemoth", 1), m("magma_elemental", 1)]),
  W(55, 93, [elite("behemoth", 3)], true),
  W(56, 96, [m("hellhound", 1), m("magma_elemental", 1)]),
  W(57, 99, [m("demon", 1), m("magma_elemental", 1)]),
  W(58, 102, [m("demon", 1), m("dragon_lord", 1)]),
  W(59, 106, [m("juggernaut", 1)]),
  W(60, 110, [{ id: "orshabaal", count: 1, elite: 1 }], true),
];

export const arenaWave = (wave: number): ArenaWave | undefined => ARENA_WAVES[wave - 1];
export const isBossWave = (wave: number): boolean => wave > 0 && wave % ARENA_BOSS_EVERY === 0;
/** Depois de vencer a onda `wave` abre a pausa com o vendedor? (só nas ondas-chefe: 5, 10, 15...) */
export const arenaShopAfter = (wave: number): boolean => isBossWave(wave);
/** Duração do intervalo DEPOIS de vencer a onda `wave` (pausa com loja ou respiro curto). */
export const arenaPauseMs = (wave: number): number => (arenaShopAfter(wave) ? ARENA_SHOP_PAUSE_MS : ARENA_BREAK_MS);

/**
 * Dificuldade do Coliseu (ciclo 8; recalibrada no ciclo 15). Os monstros já vêm com o dano por level dos dados
 * (MONSTER_DAMAGE_TIERS) e a arena soma um multiplicador próprio. Calibrado no modelo de server/systems/balanceKit.ts
 * (metas em arena.test.ts, "coliseu: balanço"): solo no level justo da 25 cai entre a 20 e a 25 e ninguém passa da 30
 * sozinho, nem no level 120; grupo de 4 no level justo da onda X cai entre X−5 e X+3; o lv 100 não completa e o lv 120
 * completa. Antes do ciclo 8 o modelo subestimava o jogador (~4× menos dano) e um mago completava o Coliseu sozinho.
 */
/** Vida das ondas: ×2,5. */
export const ARENA_HP_MULT = 2.5;
/**
 * Dano das ondas, pontos (onda, ×) com interpolação linear. O pico no meio (onda 30) é o muro do solo: lá a cura de
 * um jogador só não segura o bando, mesmo no level 120. Depois cai, porque o poder do jogador cresce mais que o dos
 * monstros no fim de jogo (magias do lv 70–90, equipamento do lv 70).
 * Ciclo 15 (era 1,5 / 2,5 / 5 / 3,5 / 3,3 / 1,7): com o modelo honesto (Cura, Escudo de Mana com o buraco de 10 s,
 * duas mãos sem escudo, skills reais) e o pacote de vocações do ciclo 15, os magos lv 34 caíam na 18 → onda 20 a 1,9;
 * o druida (Cura em Grupo) e o cavaleiro lv 120 passavam do muro → onda 30 a 6,2; o grupo de 4 completava do lv 82 em
 * diante → onda 50 a 4,3 e 60 a 2,4.
 */
export const ARENA_DMG_POINTS: readonly (readonly [number, number])[] = [[1, 1.5], [20, 1.9], [30, 6.2], [40, 3.5], [50, 4.3], [60, 2.4]];
/** Monstros comuns a mais por membro além do primeiro (antes 0,6: o solo enfrentava 1/2,8 do bando de 4 — desconto demais). */
export const ARENA_COUNT_PER_MEMBER = 0.2;
/** Quantidade por membro que conta para a XP das ondas (a de antes do ciclo 8: a XP por onda não mudou). */
export const ARENA_XP_COUNT_PER_MEMBER = 0.6;
/** Vida mínima de um chefe de zona no Coliseu, como fração da vida "de grupo de 4" (antes 0,3 — Orshabaal solo com 30%). */
export const ARENA_BOSS_MIN_HP = 0.8;

/** Multiplicador próprio do Coliseu na onda: vida ARENA_HP_MULT; dano interpolado em ARENA_DMG_POINTS. */
export function arenaWaveMult(wave: number): { hp: number; dmg: number } {
  const pts = ARENA_DMG_POINTS;
  let dmg = pts[pts.length - 1]![1];
  if (wave <= pts[0]![0]) dmg = pts[0]![1];
  else for (let i = 1; i < pts.length; i++) {
    const [w0, m0] = pts[i - 1]!, [w1, m1] = pts[i]!;
    if (wave <= w1) { dmg = m0 + ((m1 - m0) * (wave - w0)) / (w1 - w0); break; }
  }
  return { hp: ARENA_HP_MULT, dmg };
}

/** Quantidade de monstros comuns: base × (1 + ARENA_COUNT_PER_MEMBER × (n − 1)). */
export const arenaCountMult = (n: number): number => 1 + ARENA_COUNT_PER_MEMBER * (Math.max(1, n) - 1);
/**
 * Vida/dano extra por membro além do primeiro (+10% cada): sem isto um grupo de 4 recebe metade do dano por cabeça
 * e o coliseu fica fácil demais em grupo.
 */
export const arenaPartyStatMult = (n: number): number => 1 + 0.1 * (Math.max(1, n) - 1);
/**
 * Elites/chefes (1 por onda): a vida escala com o grupo no lugar da quantidade. Chefes de zona já são para 3-4: grupo
 * de 4 = vida cheia; grupos menores, no mínimo ARENA_BOSS_MIN_HP dela.
 */
export function arenaEliteHpMult(n: number, zoneBoss: boolean): number {
  const k = arenaCountMult(n) * arenaPartyStatMult(n);
  return zoneBoss ? Math.max(ARENA_BOSS_MIN_HP, k / (arenaCountMult(4) * arenaPartyStatMult(4))) : k;
}

/**
 * XP das ondas para um grupo acima do level justo (+6 de folga): +4% por level acima, até ×2. Até o ciclo 7 isto
 * também subia a vida (e o dano, +2%/level até ×1,5) dos monstros; no ciclo 8 a vida/dano saíram (puniam quem está
 * acima do level, o que deve ser vantagem) e ficou só a XP, que continua igual.
 */
export function arenaLevelXpMult(avgLevel: number, waveLevel: number): number {
  const over = Math.max(0, avgLevel - waveLevel - 6);
  return Math.min(2, 1 + 0.04 * over);
}

export interface ArenaSpawnSpec {
  defId: string;
  hpMult: number;
  dmgMult: number;
  /** XP que o monstro vale para a recompensa da onda (XP do def × elite × bônus de level acima). */
  xp: number;
  elite: boolean;
}

/** Lista de monstros da onda para um grupo de `n` com level médio `avgLevel` (o level só mexe na XP). */
export function arenaWaveSpawns(wave: number, n: number, avgLevel: number): ArenaSpawnSpec[] {
  const w = arenaWave(wave);
  if (!w) return [];
  const xpLv = arenaLevelXpMult(avgLevel, w.level);
  const am = arenaWaveMult(wave);
  const party = arenaPartyStatMult(n);
  const out: ArenaSpawnSpec[] = [];
  for (const e of w.monsters) {
    const def = monsterDef(e.id);
    if (!def || def.stationary || def.invulnerable) continue; // nunca bonecos de treino
    if (e.elite !== undefined) {
      const hpMult = e.elite * arenaEliteHpMult(n, !!def.boss) * am.hp;
      const dmgMult = (e.eliteDmg ?? 1) * party * am.dmg;
      out.push({ defId: def.id, hpMult, dmgMult, xp: Math.round(def.xp * e.elite * xpLv), elite: true });
      continue;
    }
    const count = Math.max(1, Math.round(e.count * arenaCountMult(n)));
    // XP da onda igual à de antes do ciclo 8: vale a quantidade antiga (1 + 0,6 por membro), repartida pelos que nascem.
    const xpCount = Math.max(1, Math.round(e.count * (1 + ARENA_XP_COUNT_PER_MEMBER * (Math.max(1, n) - 1))));
    const hpMult = party * am.hp, dmgMult = party * am.dmg, xp = (def.xp * xpLv * xpCount) / count;
    for (let i = 0; i < count; i++) out.push({ defId: def.id, hpMult, dmgMult, xp, elite: false });
  }
  return out;
}

/** XP por membro vivo ao vencer a onda. */
export function arenaWaveXp(spawns: readonly ArenaSpawnSpec[], aliveMembers: number): number {
  const sum = spawns.reduce((s, x) => s + x.xp, 0);
  return Math.round((sum * ARENA_XP_MULT) / Math.max(1, aliveMembers));
}

/**
 * Ouro por membro vivo (na faixa de level) ao vencer a onda: wave × (8 + wave). Partida completa (60 ondas): 88 mil + o
 * bônus. Era wave × (8 + 2 × wave) (162 mil): com as 60 ondas o Coliseu virou a maior fonte de ouro do jogo.
 */
export const arenaWaveGold = (wave: number): number => wave * (8 + wave);

/** Bônus por completar todas as ondas (ARENA_MAX_WAVE) (cada sobrevivente): ouro fixo + 25% da XP ganha na partida. */
export const ARENA_COMPLETE_GOLD = 30_000;
export const ARENA_COMPLETE_XP_PCT = 0.25;

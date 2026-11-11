// Coliseu: tabela de ondas, escalas (tamanho do grupo, level médio), modificador da semana e recompensas. Servidor
// (systems/arena.ts) e cliente (textos/HUD) usam estas funções; o modelo de server/systems/balanceKit.ts (metas em
// arena.test.ts) simula as ondas.
import { monsterDef } from "./monsters.ts";
import { weekId } from "./weekly.ts";

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
/** Última onda (vencê-la = "completed", com bônus). Ciclo 16: 60 → 70 (ondas do Abismo Profundo). */
export const ARENA_MAX_WAVE = 70;
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
 *  60    CHEFE: Orshabaal (chefe de zona; era o chefe final até o ciclo 15) — marco com ouro extra
 *  61-64 Tengus e Samurais Rubros, Colosso (Abismo Profundo) — daqui em diante vale o modificador da semana
 *  65    CHEFE: Shogun Abissal (chefe do covil do Profundo)
 *  66-69 Samurais e Tengus Rubros, Colosso; o bando cresce até a 69 (o muro de quem não tem level para completar)
 *  70    CHEFE FINAL: Ferumbras (chefe de zona)
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
  W(61, 112, [m("abyss_tengu", 1), m("juggernaut", 1)]),
  W(62, 114, [m("abyss_samurai", 1), m("abyss_tengu", 1)]),
  W(63, 116, [m("abyss_samurai", 1), m("juggernaut", 1)]),
  W(64, 118, [m("abyss_tengu", 2), m("juggernaut", 1)]),
  W(65, 120, [{ id: "lair_shogun", count: 1, elite: 1 }], true),
  W(66, 122, [m("abyss_tengu", 2), m("abyss_samurai", 1)]),
  W(67, 124, [m("abyss_samurai", 2), m("abyss_tengu", 1)]),
  W(68, 126, [m("abyss_samurai", 2), m("juggernaut", 1)]),
  W(69, 128, [m("abyss_samurai", 3)]),
  W(70, 130, [{ id: "ferumbras", count: 1, elite: 1 }], true),
];

export const arenaWave = (wave: number): ArenaWave | undefined => ARENA_WAVES[wave - 1];
export const isBossWave = (wave: number): boolean => wave > 0 && wave % ARENA_BOSS_EVERY === 0;

/**
 * Modificador da semana (ciclo 16): muda as ondas 61–70 para todos durante a semana ISO (`weekId`, segunda a
 * domingo), em rodízio fixo (semanas seguidas nunca repetem). A partida usa o da semana em que começou. Não muda a
 * recompensa: a XP da onda vem da quantidade de antes (Enxame reparte a mesma XP entre mais monstros).
 * Medidos no modelo (arena.test.ts, "modificador da semana"): nenhum deixa o grupo lv 110 completar e com todos o
 * lv 130 completa; o lv 120, que completa sem modificador, cai na Fúria e na Carapaça (onda 61) e no Enxame (69).
 */
export type ArenaModId = "furia" | "carapaca" | "enxame" | "sem_tregua" | "calmaria";
export interface ArenaModDef {
  id: ArenaModId;
  name: string;
  icon: string;
  desc: string;
  /** Vida e dano de todos os monstros da onda (elites e chefes também). */
  hp: number;
  dmg: number;
  /** Só monstros comuns (elites/chefes são 1 por onda): quantidade, vida e dano. */
  count: number;
  commonHp: number;
  commonDmg: number;
  /** Respiro depois das ondas 61–69 (ms; padrão ARENA_BREAK_MS). */
  breakMs?: number;
  /** Sem o vendedor depois da onda 65 (vira respiro). */
  noShop?: boolean;
}
/** Primeira onda com o modificador da semana. */
export const ARENA_MOD_FROM_WAVE = 61;
const modDef = (id: ArenaModId, name: string, icon: string, desc: string, o: Partial<ArenaModDef> = {}): ArenaModDef =>
  ({ id, name, icon, desc, hp: 1, dmg: 1, count: 1, commonHp: 1, commonDmg: 1, ...o });
export const ARENA_MODS: Record<ArenaModId, ArenaModDef> = {
  furia: modDef("furia", "Fúria", "🔥", "Os monstros batem 10% mais forte.", { dmg: 1.1 }),
  carapaca: modDef("carapaca", "Carapaça", "🐢", "Os monstros têm 25% mais vida.", { hp: 1.25 }),
  enxame: modDef("enxame", "Enxame", "🐝", "50% mais monstros comuns, cada um mais fraco (−40% de vida, −25% de dano).",
    { count: 1.5, commonHp: 0.6, commonDmg: 0.75 }),
  sem_tregua: modDef("sem_tregua", "Sem Trégua", "⏩", "As ondas emendam (1 s de respiro) e não há vendedor depois do Shogun.",
    { breakMs: 1000, noShop: true }),
  calmaria: modDef("calmaria", "Calmaria", "🌙", "Respiro de 10 s entre as ondas para se curar.", { breakMs: 10_000 }),
};
/** Ordem do rodízio semanal. */
export const ARENA_MOD_ORDER: readonly ArenaModId[] = ["furia", "calmaria", "carapaca", "sem_tregua", "enxame"];

/** Modificador da semana `week` ("2026-W43"): rodízio pelo número da semana (ano × 53 + semana). */
export function arenaWeekMod(week: string): ArenaModId {
  const m = /^(\d{4})-W(\d{2})$/.exec(week);
  const n = m ? Number(m[1]) * 53 + Number(m[2]) : 0;
  return ARENA_MOD_ORDER[n % ARENA_MOD_ORDER.length]!;
}
/** Modificador da semana no instante `at` (ms epoch, fuso do servidor). */
export const arenaModAt = (at: number): ArenaModId => arenaWeekMod(weekId(new Date(at)));
/** O modificador vale na onda `wave`? (só 61–70; null = sem modificador) */
export const arenaWaveMod = (wave: number, modId?: ArenaModId | null): ArenaModDef | null =>
  (modId && wave >= ARENA_MOD_FROM_WAVE ? ARENA_MODS[modId] ?? null : null);

/**
 * Depois de vencer a onda `wave` abre a pausa com o vendedor? (só nas ondas-chefe: 5, 10, 15...; com "Sem Trégua", a
 * 65 vira respiro — a da 60 continua, ela vem antes do modificador.)
 */
export const arenaShopAfter = (wave: number, modId?: ArenaModId | null): boolean => isBossWave(wave) && !arenaWaveMod(wave, modId)?.noShop;
/** Duração do intervalo DEPOIS de vencer a onda `wave` (pausa com loja ou respiro). */
export const arenaPauseMs = (wave: number, modId?: ArenaModId | null): number =>
  (arenaShopAfter(wave, modId) ? ARENA_SHOP_PAUSE_MS : arenaWaveMod(wave, modId)?.breakMs ?? ARENA_BREAK_MS);

/**
 * Dificuldade do Coliseu (ciclo 8; recalibrada no ciclo 15). Os monstros já vêm com o dano por level dos dados
 * (MONSTER_DAMAGE_TIERS) e a arena soma um multiplicador próprio. Calibrado no modelo de server/systems/balanceKit.ts
 * (metas em arena.test.ts, "coliseu: balanço"): solo no level justo da 25 cai entre a 20 e a 25 e ninguém passa da 30
 * sozinho, nem no level 120; grupo de 4 no level justo da onda X cai entre X−5 e X+3; o lv 100 não passa da 60 e o lv
 * 120 passa; o lv 110 não completa as 70 e o lv 130 completa. Antes do ciclo 8 o modelo subestimava o jogador (~4× menos
 * dano) e um mago completava o Coliseu sozinho.
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
 * Ciclo 16 (ondas 61–70): a 61 é o portão do Abismo (×2,6, o muro de quem não tem level para o bloco: o grupo lv 110
 * cai nela); da 62 em diante ×1,5 e o bando cresce até a 69 (5 Samurais Rubros num grupo de 4). Os monstros do
 * Profundo já batem muito mais que os da 51–60 (×1,7 de MONSTER_DAMAGE_TIERS): com ×2,4 nem o lv 140 passava da 63.
 */
export const ARENA_DMG_POINTS: readonly (readonly [number, number])[] =
  [[1, 1.5], [20, 1.9], [30, 6.2], [40, 3.5], [50, 4.3], [60, 2.4], [61, 2.6], [62, 1.5], [70, 1.5]];
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

/**
 * Lista de monstros da onda para um grupo de `n` com level médio `avgLevel` (o level só mexe na XP). `modId` = o
 * modificador da semana da partida (só pesa nas ondas 61–70).
 */
export function arenaWaveSpawns(wave: number, n: number, avgLevel: number, modId?: ArenaModId | null): ArenaSpawnSpec[] {
  const w = arenaWave(wave);
  if (!w) return [];
  const xpLv = arenaLevelXpMult(avgLevel, w.level);
  const am = arenaWaveMult(wave);
  const md = arenaWaveMod(wave, modId);
  const modHp = md?.hp ?? 1, modDmg = md?.dmg ?? 1;
  const party = arenaPartyStatMult(n);
  const out: ArenaSpawnSpec[] = [];
  for (const e of w.monsters) {
    const def = monsterDef(e.id);
    if (!def || def.stationary || def.invulnerable) continue; // nunca bonecos de treino
    if (e.elite !== undefined) {
      const hpMult = e.elite * arenaEliteHpMult(n, !!def.boss) * am.hp * modHp;
      const dmgMult = (e.eliteDmg ?? 1) * party * am.dmg * modDmg;
      out.push({ defId: def.id, hpMult, dmgMult, xp: Math.round(def.xp * e.elite * xpLv), elite: true });
      continue;
    }
    // Enxame: arredonda para cima, senão a entrada de 1 monstro (1,6 num grupo de 4) não ganhava ninguém a mais.
    const raw = e.count * arenaCountMult(n);
    const count = Math.max(1, md && md.count !== 1 ? Math.ceil(raw * md.count) : Math.round(raw));
    // XP da onda igual à de antes do ciclo 8: vale a quantidade antiga (1 + 0,6 por membro), repartida pelos que nascem.
    const xpCount = Math.max(1, Math.round(e.count * (1 + ARENA_XP_COUNT_PER_MEMBER * (Math.max(1, n) - 1))));
    const hpMult = party * am.hp * modHp * (md?.commonHp ?? 1), dmgMult = party * am.dmg * modDmg * (md?.commonDmg ?? 1);
    const xp = (def.xp * xpLv * xpCount) / count;
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
 * Ouro por membro vivo (na faixa de level) ao vencer a onda: wave × (8 + wave). Partida completa (70 ondas): 137 mil +
 * o marco da 60 + o bônus do fim. Era wave × (8 + 2 × wave) (162 mil nas 60): o Coliseu virou a maior fonte de ouro do jogo.
 */
export const arenaWaveGold = (wave: number): number => wave * (8 + wave);

/** Marco da onda 60 (Orshabaal, o fim até o ciclo 15): ouro extra para cada sobrevivente na faixa de level. */
export const ARENA_MILESTONE_WAVE = 60;
export const ARENA_MILESTONE_GOLD = 20_000;
/** Ouro do marco ao vencer a onda `wave` (0 fora do marco). */
export const arenaMilestoneGold = (wave: number): number => (wave === ARENA_MILESTONE_WAVE ? ARENA_MILESTONE_GOLD : 0);

/**
 * Bônus por completar todas as ondas (ARENA_MAX_WAVE) (cada sobrevivente na faixa de level): ouro fixo + 25% da XP
 * ganha na partida. Era 30 mil nas 60 ondas.
 */
export const ARENA_COMPLETE_GOLD = 50_000;
export const ARENA_COMPLETE_XP_PCT = 0.25;

// ---------------------------------------------------------------------------------------------------------------------
// Ranking de tempo (ciclo 16): tempo para vencer as ARENA_MAX_WAVE ondas, da onda 1 ao fim da última (pausas incluídas:
// clicar em "Pronto" cedo encurta). Melhor de todos e melhor da semana no kv (server/systems/arenaChampion.ts); o grupo
// do melhor tempo da semana leva o título rotativo "Campeão do Coliseu" na semana seguinte.
// ---------------------------------------------------------------------------------------------------------------------
export interface ArenaTimeRecord {
  /** Duração da partida (ms). */
  ms: number;
  /** Quem venceu as ondas (sobreviventes na faixa de level). */
  names: string[];
  /** Semana (weekId) e modificador em que foi feito. */
  week: string;
  mod: ArenaModId;
  /** Quando terminou (ms epoch). */
  at: number;
}

/** "42:05" (até 1 h) ou "1:02:05". */
export function arenaTimeText(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const two = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${two(m)}:${two(sec)}` : `${m}:${two(sec)}`;
}

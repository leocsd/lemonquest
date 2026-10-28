import type { DamageKind, Vocation } from "../types.ts";

/** Condições (buffs/debuffs). Os ids batem com o catálogo visual do HUD (ui/hud/conditions.ts). */
export type ConditionId =
  | "combat" | "poison" | "burn" | "energy" | "bleed" | "freeze"
  | "protect" | "haste" | "slow" | "drunk" | "regen" | "pz"
  | "manashield" | "rooted" | "taunted" | "fed" | "berserk"
  /** Monstro sem resistência elemental e com +value% de dano elemental (Ruptura Elemental, lv 100). */
  | "exposed"
  /** Jogador com encantamento ativo (server/systems/imbuement.ts; só na faixa do HUD, sem efeito no ConditionSystem). */
  | "imbued";

/** Fórmula de magia (estilo Tibia): valor = base + level*perLevel + magicLevel*perMagic, ±variance. */
export interface SpellFormula {
  base: number;
  perLevel: number;
  perMagic: number;
  /** Variação relativa, ex.: 0.2 = ±20%. */
  variance: number;
}

export type SpellTarget =
  | "self"          // só o conjurador
  | "target"        // criatura alvo atual (precisa de alvo e alcance)
  | "area_self"     // área centrada no conjurador (raio `radius`)
  | "area_target"   // área centrada no alvo atual (raio `radius`, alcance `range`)
  | "wave"          // cone/onda à frente do conjurador (comprimento `length`, largura máx. `width`)
  | "party";        // conjurador + jogadores num raio `radius` (cura em grupo)

/** Chave visual: o cliente escolhe partículas/projéteis/sons por ela. */
export type SpellFx =
  | "fire" | "ice" | "energy" | "earth" | "holy" | "death" | "physical"
  | "heal" | "buff" | "arrow" | "summon" | "taunt" | "root" | "charge"
  /** Brilhinho rosa da Fada (pó de fada, confete, glitter): partículas cor-de-rosa com estrelinhas. */
  | "sparkle";

export interface SpellDef {
  id: string;
  name: string;            // PT-BR
  words: string;           // palavras mágicas digitadas no chat (ex.: "exura"), minúsculas
  /** Vocações que podem conjurar (várias nas curas comuns). */
  vocations: Vocation[];
  level: number;           // level mínimo
  /** Mana base (no level 1). O custo real no level L é `spellMana(def, L)`. */
  mana: number;
  /** Mana extra por level do conjurador (opcional; padrão 0 = custo fixo). */
  manaPerLevel?: number;
  /** Teto do custo de mana quando há `manaPerLevel`. */
  manaMax?: number;
  cooldownMs: number;
  /** Também dispara o cooldown global de magias (GLOBAL_SPELL_COOLDOWN_MS). Padrão true. */
  global?: boolean;
  target: SpellTarget;
  range?: number;          // para "target"/"area_target"
  radius?: number;         // para áreas e "party"
  length?: number;         // para "wave"
  width?: number;          // para "wave"
  /** "wave" retangular: largura cheia (`width`) desde a primeira fileira, em vez de cone. */
  rect?: boolean;
  damage?: SpellFormula & { kind: DamageKind };
  heal?: SpellFormula;
  /** Condição aplicada: em "self"/"party" vai nos aliados; nos demais, nos alvos atingidos. */
  condition?: { id: ConditionId; durationMs: number; value?: number };
  /** Investida (cavaleiro): anda até `range` tiles na direção do alvo antes do golpe. */
  dash?: boolean;
  /** Invocação (druida): monstro aliado temporário. */
  summon?: { monsterId: string; count: number; durationMs: number };
  /** Provocar: monstros na área passam a atacar o conjurador. */
  taunt?: boolean;
  fx: SpellFx;
  description: string;     // PT-BR, curta, para tooltip
}

export const GLOBAL_SPELL_COOLDOWN_MS = 1000;

/** Alcance (tiles) de magia no alvo sem `range` próprio. */
export const DEFAULT_SPELL_RANGE = 7;

/** A magia precisa de um alvo (e de alcance até ele). */
export const needsTarget = (s: Pick<SpellDef, "target">): boolean => s.target === "target" || s.target === "area_target";

/** Custo de mana da magia para um conjurador de `level` (base + manaPerLevel*level, arredondado, limitado a manaMax). */
export function spellMana(s: Pick<SpellDef, "mana" | "manaPerLevel" | "manaMax">, level: number): number {
  const raw = s.mana + (s.manaPerLevel ?? 0) * Math.max(0, level);
  return Math.round(s.manaMax != null ? Math.min(raw, s.manaMax) : raw);
}

/**
 * Catálogo: 6-8 magias por vocação (uma única cura própria "exura" e o "utani hur" para todas; druida ainda tem a cura em grupo "exura mas sio"). Palavras únicas (ver tabela no fim do arquivo).
 * Valor esperado = base + level*perLevel + magicLevel*perMagic (magicLevel estimado no spells.test.ts).
 */
export const SPELLS: Record<string, SpellDef> = {
  // ------------------------------------------------------------------ CURA ÚNICA (todas as vocações)
  light_heal: {
    id: "light_heal", name: "Cura", words: "exura", vocations: ["knight", "paladin", "sorcerer", "druid"], level: 1, mana: 20, manaPerLevel: 1.5, manaMax: 70, cooldownMs: 1000,
    // Como no Tibia (decisão do dono, 2026-10-27): a Cura escala pelo magic level. Era 22 + 2,2·lv + 0,45·ML (15 % do
    // HP para todos, sempre); agora o mago cura ~30–37 %, o paladino ~13–17 % e o cavaleiro ~10 %, que compensa com as
    // poções de vida fortes (items.ts). Level 1: ~14 % para todos. ML 3 por ponto é o teto que mantém as metas do
    // balanço (vocationBalance.test.ts: com 4+ o feiticeiro liderava dano e sobrevivência no lv 60).
    target: "self", heal: { base: 20, perLevel: 1.23, perMagic: 3.0, variance: 0.15 }, fx: "heal",
    description: "Cura uma parte da sua vida. Cresce principalmente com o magic level: magos curam muito, cavaleiros pouco (que compensam com as poções fortes e o Limpar Feridas).",
  },
  // Curas próprias de cavaleiro e paladino, como no Tibia (exura ico / exura san). Sem elas, com a Cura por ML o
  // paladino caía no portão do Abismo (Coliseu, onda 61) na semana de Fúria e o cavaleiro perdia a cura de 1 s que
  // segura o golpe grande antes de a poção (2 s) voltar. Ambas ~15 % do HP, por level: o cavaleiro sem ML cura o mesmo
  // que curava antes com a Cura; o paladino um pouco mais (ML conta um terço).
  wound_cleansing: {
    id: "wound_cleansing", name: "Limpar Feridas", words: "exura ico", vocations: ["knight"], level: 15, mana: 40, cooldownMs: 1000,
    target: "self", heal: { base: 22, perLevel: 2.2, perMagic: 0, variance: 0.15 }, fx: "heal",
    description: "Fecha as feridas: cura ~15% da vida, pelo level (sem magic level). A cura de cada segundo do cavaleiro.",
  },
  divine_healing: {
    id: "divine_healing", name: "Cura Divina", words: "exura san", vocations: ["paladin"], level: 35, mana: 60, cooldownMs: 1000,
    target: "self", heal: { base: 20, perLevel: 1.6, perMagic: 3.0, variance: 0.15 }, fx: "heal",
    description: "Luz que cura ~16–19% da vida, pelo level e um pouco pelo magic level. A cura forte do paladino.",
  },

  // ------------------------------------------------------------------ CAVALEIRO (tank corpo a corpo)
  // Ciclo 15-13: as seis magias de dano do cavaleiro +40% (base, por level e por magia) — o plano pedia +30% até o lv 35;
  // os +10% e as do lv 70/90 fecham o lv 60 em vocationBalance.test.ts junto com o level no spellPower (formulas.ts).
  spin_strike: {
    id: "spin_strike", name: "Golpe Giratório", words: "exori", vocations: ["knight"], level: 1, mana: 8, cooldownMs: 4000,
    target: "area_self", radius: 1, damage: { kind: "physical", base: 22.4, perLevel: 1.96, perMagic: 2.8, variance: 0.2 }, fx: "physical",
    description: "Gira a arma e atinge todos os inimigos ao seu redor.",
  },
  provoke: {
    id: "provoke", name: "Provocar", words: "exeta res", vocations: ["knight"], level: 5, mana: 15, cooldownMs: 20_000,
    target: "area_self", radius: 3, taunt: true, condition: { id: "taunted", durationMs: 5000 }, fx: "taunt",
    description: "Um brado que força os monstros próximos a atacar você.",
  },
  charge: {
    id: "charge", name: "Investida", words: "exori hur", vocations: ["knight"], level: 10, mana: 20, cooldownMs: 8000,
    target: "target", range: 4, dash: true, damage: { kind: "physical", base: 28, perLevel: 2.8, perMagic: 4.2, variance: 0.2 }, fx: "charge",
    description: "Avança sobre o alvo e o atinge com força.",
  },
  iron_skin: {
    id: "iron_skin", name: "Pele de Ferro", words: "utamo tempo", vocations: ["knight"], level: 15, mana: 20, cooldownMs: 30_000,
    target: "self", condition: { id: "protect", durationMs: 10_000, value: 30 }, fx: "buff",
    description: "Reduz em 30% o dano recebido por 10 segundos.",
  },
  brutal_strike: {
    id: "brutal_strike", name: "Golpe Brutal", words: "exori gran", vocations: ["knight"], level: 30, mana: 45, cooldownMs: 8000,
    target: "target", range: 1, damage: { kind: "physical", base: 56, perLevel: 5.6, perMagic: 5.6, variance: 0.2 }, fx: "physical",
    description: "Um golpe devastador no alvo à sua frente.",
  },

  // ------------------------------------------------------------------ CORRER (todas as vocações, como o utani hur do Tibia)
  swift_feet: {
    id: "swift_feet", name: "Pés Ligeiros", words: "utani hur", vocations: ["knight", "paladin", "sorcerer", "druid"], level: 5, mana: 20,
    cooldownMs: 15_000, global: false,
    target: "self", condition: { id: "haste", durationMs: 30_000, value: 30 }, fx: "buff",
    description: "Corre: aumenta sua velocidade de movimento em 30% por 30 segundos.",
  },

  // ------------------------------------------------------------------ PALADINO (à distância)
  piercing_arrow: {
    id: "piercing_arrow", name: "Flecha Perfurante", words: "exori con", vocations: ["paladin"], level: 1, mana: 8, cooldownMs: 2000,
    target: "target", range: 6, damage: { kind: "physical", base: 13, perLevel: 1, perMagic: 2, variance: 0.2 }, fx: "arrow",
    description: "Dispara uma flecha certeira contra o alvo.",
  },
  arrow_rain: {
    id: "arrow_rain", name: "Chuva de Flechas", words: "exevo mas con", vocations: ["paladin"], level: 15, mana: 35, cooldownMs: 6000,
    target: "area_target", range: 6, radius: 2, damage: { kind: "physical", base: 12, perLevel: 1.8, perMagic: 2.5, variance: 0.2 }, fx: "arrow",
    description: "Uma saraivada de flechas cai sobre a área ao redor do alvo.",
  },
  holy_arrow: {
    id: "holy_arrow", name: "Flecha Sagrada", words: "exori san", vocations: ["paladin"], level: 20, mana: 30, cooldownMs: 4000,
    target: "target", range: 6, damage: { kind: "holy", base: 25, perLevel: 3, perMagic: 3.5, variance: 0.2 }, fx: "holy",
    description: "Uma flecha banhada em luz sagrada.",
  },
  holy_wave: {
    id: "holy_wave", name: "Onda Sagrada", words: "exevo mas san", vocations: ["paladin"], level: 30, mana: 90, cooldownMs: 8000,
    target: "area_self", radius: 3, damage: { kind: "holy", base: 20, perLevel: 3, perMagic: 3, variance: 0.2 }, fx: "holy",
    description: "Libera uma onda de luz sagrada que fere tudo ao redor.",
  },

  // ------------------------------------------------------------------ FEITICEIRO (AoE mágico)
  fireball: {
    id: "fireball", name: "Bola de Fogo", words: "exori flam", vocations: ["sorcerer"], level: 1, mana: 8, cooldownMs: 2000,
    target: "target", range: 5, damage: { kind: "fire", base: 11, perLevel: 0.6, perMagic: 2.5, variance: 0.2 }, fx: "fire",
    description: "Lança uma bola de fogo contra o alvo.",
  },
  energy_wave: {
    id: "energy_wave", name: "Onda de Energia", words: "exevo vis lux", vocations: ["sorcerer"], level: 5, mana: 20, cooldownMs: 4000,
    target: "wave", length: 4, width: 3, damage: { kind: "energy", base: 14, perLevel: 1.5, perMagic: 2.5, variance: 0.2 }, fx: "energy",
    description: "Uma onda de energia varre os inimigos à sua frente.",
  },
  fire_burst: {
    id: "fire_burst", name: "Explosão de Fogo", words: "exevo mas flam", vocations: ["sorcerer"], level: 10, mana: 40, cooldownMs: 6000,
    target: "area_target", range: 5, radius: 2, damage: { kind: "fire", base: 10, perLevel: 1.5, perMagic: 2.5, variance: 0.2 },
    condition: { id: "burn", durationMs: 4000, value: 4 }, fx: "fire",
    description: "Explode o alvo e a área ao redor, deixando os atingidos em chamas.",
  },
  mana_shield: {
    // Ciclo 15: o druida também conjura (era só do feiticeiro; a sobrevivência do druida no lv 30 ficava em 43%).
    id: "mana_shield", name: "Escudo de Mana", words: "utamo vita", vocations: ["sorcerer", "druid"], level: 15, mana: 30, cooldownMs: 30_000,
    target: "self", condition: { id: "manashield", durationMs: 20_000 }, fx: "buff",
    description: "Por 20 segundos, metade do dano recebido sai da mana e metade da vida (sem mana, tudo na vida). Use a Cura junto.",
  },
  energy_beam: {
    id: "energy_beam", name: "Raio de Energia", words: "exori vis", vocations: ["sorcerer"], level: 20, mana: 45, cooldownMs: 4000,
    target: "target", range: 5, damage: { kind: "energy", base: 15, perLevel: 2, perMagic: 3, variance: 0.2 }, fx: "energy",
    description: "Um raio concentrado de energia contra um único alvo.",
  },
  inferno: {
    id: "inferno", name: "Inferno", words: "exevo gran mas flam", vocations: ["sorcerer"], level: 30, mana: 160, cooldownMs: 8000,
    target: "area_self", radius: 3, damage: { kind: "fire", base: 30, perLevel: 3, perMagic: 4, variance: 0.2 },
    condition: { id: "burn", durationMs: 5000, value: 6 }, fx: "fire",
    description: "Uma erupção de chamas ao seu redor que incendeia os inimigos.",
  },

  // ------------------------------------------------------------------ DRUIDA (cura e controle)
  // Espelho da Bola de Fogo: sem ela o druida não tinha dano barato até o level 5 (só a Cura e o auto-ataque).
  ice_shard: {
    id: "ice_shard", name: "Lasca de Gelo", words: "exori frigo", vocations: ["druid"], level: 1, mana: 8, cooldownMs: 2000,
    target: "target", range: 5, damage: { kind: "ice", base: 11, perLevel: 0.6, perMagic: 2.5, variance: 0.2 }, fx: "ice",
    description: "Dispara uma lasca de gelo contra o alvo.",
  },
  roots: {
    id: "roots", name: "Raiz", words: "exori tera", vocations: ["druid"], level: 5, mana: 20, cooldownMs: 15_000,
    target: "target", range: 4, damage: { kind: "earth", base: 6, perLevel: 1, perMagic: 2, variance: 0.2 },
    condition: { id: "rooted", durationMs: 3000 }, fx: "root",
    description: "Raízes prendem o alvo no lugar por 3 segundos.",
  },
  ice_rain: {
    // Ciclo 15-13: recarga 6 s → 4 s (o druida lv 30 rendia 0,63 do feiticeiro em dano × sobrevivência; agora 0,74).
    id: "ice_rain", name: "Chuva de Gelo", words: "exevo mas frigo", vocations: ["druid"], level: 10, mana: 40, cooldownMs: 4000,
    target: "area_target", range: 5, radius: 2, damage: { kind: "ice", base: 8, perLevel: 1.4, perMagic: 2.4, variance: 0.2 },
    condition: { id: "slow", durationMs: 4000, value: 40 }, fx: "ice",
    description: "Estilhaços de gelo caem na área e deixam os inimigos mais lentos.",
  },
  group_heal: {
    // Ciclo 7: era perLevel 1 / perMagic 2 / cd 8 s / 50 de mana (165 a cada 8 s no lv 90 com ML 30 — ~7% da vazão da
    // Cura): o druida não tinha papel de suporte no fim de jogo.
    id: "group_heal", name: "Cura em Grupo", words: "exura mas sio", vocations: ["druid"], level: 15, mana: 80, cooldownMs: 5000,
    // 2026-10-27: perMagic 2,5 → 3 junto com a Cura por ML: o druida (curandeiro) fica com a maior sobrevivência entre
    // os magos (meta 15-13) sem o grupo de 4 completar o Coliseu cedo demais (arena.test.ts).
    target: "party", radius: 4, heal: { base: 15, perLevel: 2, perMagic: 3, variance: 0.2 }, fx: "heal",
    description: "Cura você e os aliados num raio de 4 tiles.",
  },
  summon_wolf: {
    id: "summon_wolf", name: "Invocar Lobo", words: "utevo res lupo", vocations: ["druid"], level: 20, mana: 90, cooldownMs: 60_000,
    target: "self", summon: { monsterId: "summoned_wolf", count: 1, durationMs: 60_000 }, fx: "summon",
    description: "Invoca um lobo espiritual que luta ao seu lado por 60 segundos.",
  },
  blizzard: {
    id: "blizzard", name: "Nevasca", words: "exevo gran mas frigo", vocations: ["druid"], level: 30, mana: 150, cooldownMs: 8000,
    target: "area_self", radius: 3, damage: { kind: "ice", base: 25, perLevel: 3, perMagic: 3.8, variance: 0.2 },
    condition: { id: "slow", durationMs: 5000, value: 40 }, fx: "ice",
    description: "Uma nevasca gelada atinge tudo ao redor e desacelera os inimigos.",
  },

  // ------------------------------------------------------------------ FIM DE JOGO (lv 35-90): 4 por vocação
  // Valor no level de desbloqueio um pouco acima da melhor magia antiga da mesma categoria (alvo único / área) naquele
  // level (metas em spells.test.ts). Nenhuma cura nova: cada vocação segue com uma cura própria.
  front_sweep: {
    id: "front_sweep", name: "Golpe Frontal", words: "exori min", vocations: ["knight"], level: 35, mana: 30, cooldownMs: 5000,
    // Ciclo 7: era length 1 / base 20 (3 tiles, mesmo dano por alvo do Golpe Giratório com 4× a mana). Retângulo 3×3
    // (não cone): continua pegando as duas diagonais encostadas na frente do cavaleiro.
    target: "wave", length: 3, width: 3, rect: true, damage: { kind: "physical", base: 42, perLevel: 2.66, perMagic: 2.8, variance: 0.2 }, fx: "physical",
    description: "Um golpe largo que atinge uma área de 3×3 tiles à sua frente.",
  },
  berserk: {
    id: "berserk", name: "Fúria", words: "utito tempo", vocations: ["knight"], level: 50, mana: 60, cooldownMs: 30_000,
    target: "self", condition: { id: "berserk", durationMs: 10_000, value: 25 }, fx: "buff",
    description: "Aumenta em 25% todo o dano que você causa por 10 segundos.",
  },
  whirlwind: {
    id: "whirlwind", name: "Fúria Giratória", words: "exori mas", vocations: ["knight"], level: 70, mana: 80, cooldownMs: 8000,
    target: "area_self", radius: 2, damage: { kind: "physical", base: 56, perLevel: 3.36, perMagic: 4.2, variance: 0.2 }, fx: "physical",
    description: "Gira com toda a força e atinge todos os inimigos num raio de 2 tiles.",
  },
  annihilation_strike: {
    id: "annihilation_strike", name: "Golpe Aniquilador", words: "exori gran ico", vocations: ["knight"], level: 90, mana: 100, cooldownMs: 12_000,
    target: "target", range: 1, damage: { kind: "physical", base: 112, perLevel: 7.7, perMagic: 7, variance: 0.2 }, fx: "physical",
    description: "O golpe mais forte do cavaleiro, no alvo à sua frente.",
  },

  explosive_arrow: {
    id: "explosive_arrow", name: "Flecha Explosiva", words: "exevo con flam", vocations: ["paladin"], level: 35, mana: 50, cooldownMs: 6000,
    target: "area_target", range: 6, radius: 1, damage: { kind: "fire", base: 30, perLevel: 2.8, perMagic: 3, variance: 0.2 }, fx: "fire",
    description: "Uma flecha que explode no alvo e queima tudo ao redor dele.",
  },
  crippling_arrow: {
    id: "crippling_arrow", name: "Flecha Paralisante", words: "exori con hur", vocations: ["paladin"], level: 50, mana: 60, cooldownMs: 8000,
    target: "target", range: 6, damage: { kind: "physical", base: 40, perLevel: 3, perMagic: 3.5, variance: 0.2 },
    condition: { id: "slow", durationMs: 3000, value: 50 }, fx: "arrow",
    description: "Acerta o alvo na perna: dano e 50% de lentidão por 3 segundos.",
  },
  divine_judgment: {
    id: "divine_judgment", name: "Julgamento Divino", words: "exori gran san", vocations: ["paladin"], level: 70, mana: 120, cooldownMs: 8000,
    target: "area_target", range: 6, radius: 2, damage: { kind: "holy", base: 50, perLevel: 3.2, perMagic: 4, variance: 0.2 }, fx: "holy",
    description: "Luz sagrada cai sobre o alvo e os inimigos num raio de 2 tiles dele.",
  },
  star_rain: {
    id: "star_rain", name: "Chuva de Estrelas", words: "exevo gran mas con", vocations: ["paladin"], level: 90, mana: 160, cooldownMs: 8000,
    target: "area_target", range: 6, radius: 3, damage: { kind: "physical", base: 60, perLevel: 3.4, perMagic: 4, variance: 0.2 }, fx: "arrow",
    description: "Uma chuva de flechas cobre o alvo e tudo num raio de 3 tiles.",
  },

  fire_wave: {
    id: "fire_wave", name: "Onda de Fogo", words: "exevo flam hur", vocations: ["sorcerer"], level: 35, mana: 70, cooldownMs: 6000,
    target: "wave", length: 5, width: 3, damage: { kind: "fire", base: 50, perLevel: 3, perMagic: 3.4, variance: 0.2 },
    condition: { id: "burn", durationMs: 6000, value: 12 }, fx: "fire",
    description: "Uma onda de chamas à sua frente que deixa os inimigos queimando.",
  },
  sudden_death: {
    id: "sudden_death", name: "Morte Súbita", words: "exori mort", vocations: ["sorcerer"], level: 50, mana: 100, cooldownMs: 6000,
    target: "target", range: 6, damage: { kind: "death", base: 50, perLevel: 3, perMagic: 3.4, variance: 0.2 }, fx: "death",
    description: "Energia da morte concentrada num único alvo.",
  },
  electric_storm: {
    id: "electric_storm", name: "Tempestade Elétrica", words: "exevo gran mas vis", vocations: ["sorcerer"], level: 70, mana: 260, cooldownMs: 8000,
    target: "area_self", radius: 4, damage: { kind: "energy", base: 60, perLevel: 3.6, perMagic: 4.2, variance: 0.2 }, fx: "energy",
    description: "Raios caem em todos os inimigos num raio de 4 tiles.",
  },
  eternal_flame: {
    id: "eternal_flame", name: "Chama Eterna", words: "exori gran flam", vocations: ["sorcerer"], level: 90, mana: 180, cooldownMs: 10_000,
    target: "target", range: 6, damage: { kind: "fire", base: 80, perLevel: 4.2, perMagic: 4.8, variance: 0.2 },
    condition: { id: "burn", durationMs: 8000, value: 30 }, fx: "fire",
    description: "O fogo mais forte do feiticeiro: dano enorme no alvo, que continua queimando.",
  },

  ice_wave: {
    id: "ice_wave", name: "Onda de Gelo", words: "exevo frigo hur", vocations: ["druid"], level: 35, mana: 70, cooldownMs: 6000,
    target: "wave", length: 5, width: 3, damage: { kind: "ice", base: 50, perLevel: 3, perMagic: 3.4, variance: 0.2 },
    condition: { id: "slow", durationMs: 3000, value: 30 }, fx: "ice",
    description: "Uma onda gelada à sua frente que deixa os inimigos lentos.",
  },
  earth_crush: {
    id: "earth_crush", name: "Esmagar Terra", words: "exori gran tera", vocations: ["druid"], level: 50, mana: 100, cooldownMs: 6000,
    target: "target", range: 6, damage: { kind: "earth", base: 40, perLevel: 2.4, perMagic: 2.6, variance: 0.2 },
    condition: { id: "poison", durationMs: 10_000, value: 15 }, fx: "earth",
    description: "Pedras esmagam o alvo e o deixam envenenado.",
  },
  earth_storm: {
    id: "earth_storm", name: "Tempestade de Terra", words: "exevo gran mas tera", vocations: ["druid"], level: 70, mana: 260, cooldownMs: 8000,
    target: "area_self", radius: 4, damage: { kind: "earth", base: 55, perLevel: 3.5, perMagic: 4, variance: 0.2 },
    condition: { id: "poison", durationMs: 8000, value: 15 }, fx: "earth",
    description: "A terra se abre ao seu redor: dano e veneno num raio de 4 tiles.",
  },
  nature_fury: {
    id: "nature_fury", name: "Fúria da Natureza", words: "exori gran frigo", vocations: ["druid"], level: 90, mana: 180, cooldownMs: 10_000,
    target: "target", range: 6, damage: { kind: "ice", base: 70, perLevel: 3.8, perMagic: 4.2, variance: 0.2 },
    condition: { id: "slow", durationMs: 4000, value: 50 }, fx: "ice",
    description: "O gelo mais forte do druida: dano enorme no alvo e 50% de lentidão.",
  },

  // --- Lv 100 (ciclo 12, GD-08): uma magia de UTILIDADE por vocação para o fim de jogo em grupo (Orshabaal, Ferumbras,
  // Colossos). Sem dano: cada uma muda o que o grupo consegue fazer, não o número da rotação.
  shield_wall: {
    id: "shield_wall", name: "Muralha de Escudos", words: "utamo mas res", vocations: ["knight"], level: 100, mana: 120, cooldownMs: 40_000,
    // Não soma com a Pele de Ferro (30%, só nele): a condição mais forte ativa não é rebaixada (ConditionSystem.apply).
    target: "party", radius: 3, condition: { id: "protect", durationMs: 8000, value: 20 }, fx: "buff",
    description: "Você e os aliados a até 3 tiles recebem 20% menos dano por 8 segundos.",
  },
  restoring_light: {
    // Ciclo 15: recarga 30 s → 20 s (450 de vida em 10 s a cada 30 s pesava pouco no fim de jogo em grupo).
    id: "restoring_light", name: "Luz Restauradora", words: "exura mas san", vocations: ["paladin"], level: 100, mana: 150, cooldownMs: 20_000,
    target: "party", radius: 4, condition: { id: "regen", durationMs: 10_000, value: 45 }, fx: "heal",
    description: "Uma luz cobre o grupo a até 4 tiles: cada um recupera 45 de vida por segundo durante 10 segundos.",
  },
  elemental_rupture: {
    id: "elemental_rupture", name: "Ruptura Elemental", words: "exori mas vis", vocations: ["sorcerer"], level: 100, mana: 120, cooldownMs: 20_000,
    // Responde à resistência elemental (monstro toma metade do próprio elemento): por 12 s o alvo perde a resistência e
    // toma +15% de todo dano elemental, de qualquer um do grupo.
    target: "target", range: 5, condition: { id: "exposed", durationMs: 12_000, value: 15 }, fx: "energy",
    description: "Rompe as defesas do alvo por 12 segundos: ele perde a resistência elemental e toma 15% a mais de dano mágico.",
  },
  earth_roots: {
    id: "earth_roots", name: "Raízes da Terra", words: "exevo mas tera", vocations: ["druid"], level: 100, mana: 160, cooldownMs: 25_000,
    target: "area_self", radius: 3, condition: { id: "rooted", durationMs: 3000 }, fx: "root",
    description: "Raízes brotam do chão num raio de 3 tiles e prendem os inimigos no lugar por 3 segundos.",
  },

  // ------------------------------------------------------------------ FADA (vocação oculta, 2026-10-28)
  // Pedido do dono: uma classe secreta, fofa, ruiva e cor-de-rosa com brilhinho, só para a "Fada Gabi". As 14 magias
  // ESPELHAM as do druida número a número (mesmo level, mana, recarga, fórmula e condição; o gelo vira sagrado, o veneno
  // vira choque de purpurina): ela entra no balanço exatamente como o druida (vocationBalance.test.ts) e só muda a cara.
  // Palavras mágicas na "língua das fadas": todas começam com "plim". spells.test.ts confere o espelho magia a magia.
  pixie_dust: {
    id: "pixie_dust", name: "Pó de Pirlimpimpim", words: "plim", vocations: ["fairy"], level: 1, mana: 8, cooldownMs: 2000,
    target: "target", range: 5, damage: { kind: "holy", base: 11, perLevel: 0.6, perMagic: 2.5, variance: 0.2 }, fx: "sparkle",
    description: "Sopra um punhado de pó brilhante no alvo. Faz cócegas — das que doem.",
  },
  fairy_kiss: {
    id: "fairy_kiss", name: "Beijinho Curativo", words: "plim beijo", vocations: ["fairy"], level: 1, mana: 20, manaPerLevel: 1.5, manaMax: 70, cooldownMs: 1000,
    target: "self", heal: { base: 20, perLevel: 1.23, perMagic: 3.0, variance: 0.15 }, fx: "heal",
    description: "Um beijinho no próprio dodói: cura uma parte da sua vida (cresce com o magic level, como a Cura dos magos).",
  },
  soap_bubble: {
    id: "soap_bubble", name: "Bolha de Sabão", words: "plim bolha", vocations: ["fairy"], level: 5, mana: 20, cooldownMs: 15_000,
    target: "target", range: 4, damage: { kind: "holy", base: 6, perLevel: 1, perMagic: 2, variance: 0.2 },
    condition: { id: "rooted", durationMs: 3000 }, fx: "sparkle",
    description: "Prende o alvo dentro de uma bolha de sabão por 3 segundos. Ele fica bravo, mas fica fofo.",
  },
  swift_wings: {
    id: "swift_wings", name: "Asinhas Ligeiras", words: "plim zum", vocations: ["fairy"], level: 5, mana: 20,
    cooldownMs: 15_000, global: false,
    target: "self", condition: { id: "haste", durationMs: 30_000, value: 30 }, fx: "buff",
    description: "Bate as asinhas bem rápido: 30% mais veloz por 30 segundos.",
  },
  confetti_rain: {
    id: "confetti_rain", name: "Chuva de Confete", words: "plim festa", vocations: ["fairy"], level: 10, mana: 40, cooldownMs: 4000,
    target: "area_target", range: 5, radius: 2, damage: { kind: "holy", base: 8, perLevel: 1.4, perMagic: 2.4, variance: 0.2 },
    condition: { id: "slow", durationMs: 4000, value: 40 }, fx: "sparkle",
    description: "Confete cai na área ao redor do alvo: dano e os monstros ficam lentos (param para olhar).",
  },
  bubble_bath: {
    id: "bubble_bath", name: "Banho de Espuma", words: "plim espuma", vocations: ["fairy"], level: 15, mana: 30, cooldownMs: 30_000,
    target: "self", condition: { id: "manashield", durationMs: 20_000 }, fx: "buff",
    description: "Por 20 segundos, metade do dano recebido estoura bolhas da sua mana e metade vai na vida (sem mana, tudo na vida). Use o Beijinho junto.",
  },
  lullaby: {
    id: "lullaby", name: "Cantiga de Ninar", words: "plim naninha", vocations: ["fairy"], level: 15, mana: 80, cooldownMs: 5000,
    target: "party", radius: 4, heal: { base: 15, perLevel: 2, perMagic: 3, variance: 0.2 }, fx: "heal",
    description: "Canta baixinho: você e os amigos num raio de 4 tiles recuperam vida (e ficam com soninho).",
  },
  summon_butterfly: {
    id: "summon_butterfly", name: "Amiguinha Borboleta", words: "plim borboleta", vocations: ["fairy"], level: 20, mana: 90, cooldownMs: 60_000,
    target: "self", summon: { monsterId: "summoned_butterfly", count: 1, durationMs: 60_000 }, fx: "summon",
    description: "Chama uma borboleta encantada que luta ao seu lado por 60 segundos (e nunca sai do seu pé).",
  },
  glitter_burst: {
    id: "glitter_burst", name: "Explosão de Glitter", words: "plim glitter", vocations: ["fairy"], level: 30, mana: 150, cooldownMs: 8000,
    target: "area_self", radius: 3, damage: { kind: "holy", base: 25, perLevel: 3, perMagic: 3.8, variance: 0.2 },
    condition: { id: "slow", durationMs: 5000, value: 40 }, fx: "sparkle",
    description: "Uma explosão de glitter ao seu redor: dano em tudo e os inimigos ficam lentos. Glitter nunca sai.",
  },
  cotton_candy_breath: {
    id: "cotton_candy_breath", name: "Sopro de Algodão-Doce", words: "plim algodao", vocations: ["fairy"], level: 35, mana: 70, cooldownMs: 6000,
    target: "wave", length: 5, width: 3, damage: { kind: "holy", base: 50, perLevel: 3, perMagic: 3.4, variance: 0.2 },
    condition: { id: "slow", durationMs: 3000, value: 30 }, fx: "sparkle",
    description: "Uma onda de algodão-doce à sua frente: dano e os inimigos ficam grudentos (lentos).",
  },
  rainbow_beam: {
    id: "rainbow_beam", name: "Raio Arco-Íris", words: "plim arco iris", vocations: ["fairy"], level: 50, mana: 100, cooldownMs: 6000,
    target: "target", range: 6, damage: { kind: "energy", base: 40, perLevel: 2.4, perMagic: 2.6, variance: 0.2 },
    condition: { id: "energy", durationMs: 10_000, value: 15 }, fx: "sparkle",
    description: "Um arco-íris inteiro na cara do alvo: dano e choque colorido por 10 segundos.",
  },
  glitter_storm: {
    id: "glitter_storm", name: "Tempestade de Purpurina", words: "plim purpurina", vocations: ["fairy"], level: 70, mana: 260, cooldownMs: 8000,
    target: "area_self", radius: 4, damage: { kind: "holy", base: 55, perLevel: 3.5, perMagic: 4, variance: 0.2 },
    condition: { id: "energy", durationMs: 8000, value: 15 }, fx: "sparkle",
    description: "Purpurina em tudo num raio de 4 tiles: dano e choque colorido. Vai aparecer purpurina por semanas.",
  },
  goodnight_kiss: {
    id: "goodnight_kiss", name: "Beijo de Boa Noite", words: "plim boa noite", vocations: ["fairy"], level: 90, mana: 180, cooldownMs: 10_000,
    target: "target", range: 6, damage: { kind: "holy", base: 70, perLevel: 3.8, perMagic: 4.2, variance: 0.2 },
    condition: { id: "slow", durationMs: 4000, value: 50 }, fx: "sparkle",
    description: "O beijo mais forte da Fada: dano enorme no alvo, que fica com tanto sono que anda pela metade por 4 segundos.",
  },
  fairy_cheer: {
    id: "fairy_cheer", name: "Torcida da Fada", words: "plim torcida", vocations: ["fairy"], level: 100, mana: 150, cooldownMs: 40_000,
    // Utilidade de grupo do lv 100 (como as quatro do ciclo 12): empolga o grupo em vez de prender inimigos. Não soma
    // com a Fúria do cavaleiro (25%, só nele): a condição mais forte ativa não é rebaixada (ConditionSystem.apply).
    target: "party", radius: 3, condition: { id: "berserk", durationMs: 8000, value: 15 }, fx: "buff",
    description: "Pula, grita e bate palminha: você e os aliados a até 3 tiles causam 15% a mais de dano por 8 segundos.",
  },
};

export const spellDef = (id: string): SpellDef | undefined => (Object.hasOwn(SPELLS, id) ? SPELLS[id] : undefined);

export function spellsFor(vocation: Vocation): SpellDef[] {
  return Object.values(SPELLS).filter((s) => s.vocations.includes(vocation)).sort((a, b) => a.level - b.level);
}

/** Procura a magia pelas palavras (ignora maiúsculas e espaços extras). */
export function spellByWords(text: string): SpellDef | undefined {
  const t = text.trim().toLowerCase().replace(/\s+/g, " ");
  return Object.values(SPELLS).find((s) => s.words === t);
}

/*
 * Tabela de balanceamento (valor esperado no level de desbloqueio; ML estimado antigo: mago 0.75*lvl, paladino lvl/4,
 * cavaleiro lvl/7; sem o spellPower de cavaleiro/paladino, que no jogo rende bem mais).
 * Gerada pelo console.table do spells.test.ts. dmg/heal = média por alvo, sem variância.
 *
 * magia                voc       lvl  mana  cd(s)  esperado
 * CURA (todas as vocações; mana = 20 + 1.5*level, máx. 70; cd 1 s; fórmula 22 + 2.2*level + 0.45*ML, ±15%)
 * Cura (exura)          todas    1   ~22     1    lv1 ~24 (16% HP); lv10 mago ~47 (24%) pal ~45 (19%) cav ~44 (16%)
 *                                 lv20 (mana 50): mago ~73 (30%), pal ~68 (20%), cav ~67 (15%)
 *                                 lv30 (mana 65): mago ~98 (33%), pal ~91 (21%), cav ~90 (15%)
 *                                 (antes: 22 + 2*level + 1.8*ML → mago 36% no lv20 e 41% no lv30)
 * Cura em Grupo        druid     15    80     5    cura 72,5/alvo (r4); lv 90 (ML 67): ~363 a cada 5 s  [antes 50 mana, cd 8, 52/alvo]
 * Pés Ligeiros (utani hur)  todas  5  20  15    haste +30%, 30 s (correr; fora do cooldown global)
 * Removidas: Cura Intensa (exura gran), Cura Vital (exura vita), Cura Sagrada Leve (exura san) e Tratar Ferimentos (exura ico):
 * cada vocação tem exatamente UMA cura própria.
 *
 * Golpe Giratório      knight     1     8     4    dmg 24 (área r1, 2.2x auto)  [ciclo 15-13: magias de dano do cavaleiro +40%]
 * Provocar             knight     5    15    20    taunt r3, 5 s
 * Investida            knight    10    20     8    dmg 60 (dash 4)
 * Pele de Ferro        knight    15    20    30    -30% dano, 10 s
 * Golpe Brutal         knight    30    45     8    dmg 246 (4,6x auto)
 * Flecha Perfurante    paladin    1     8     2    dmg 14 (2.3x auto)
 * Chuva de Flechas     paladin   15    35     6    dmg 47 (área r2)
 * Flecha Sagrada       paladin   20    30     4    dmg 103 (holy)
 * Onda Sagrada         paladin   30    90     8    dmg 131 (área r3)
 * Bola de Fogo         sorcerer   1     8     2    dmg 12 (2.3x auto)
 * Onda de Energia      sorcerer   5    20     4    dmg 29 (onda 4x3)
 * Explosão de Fogo     sorcerer  10    40     6    dmg 43 (área r2 + burn); lvl 15: 60, lvl 20: 78
 * Escudo de Mana       sorc/druid 15   30    30    manashield 20 s (druida desde o ciclo 15)
 * Raio de Energia      sorcerer  20    45     4    dmg 100 (alvo único)
 * Inferno              sorcerer  30   160     8    dmg 208 (área r3 + burn)
 * Raiz                 druid      5    20    15    dmg 17 + root 3 s
 * Chuva de Gelo        druid     10    40     4    dmg 39 (área r2 + slow); lvl 15: 55, lvl 20: 72  [recarga 6 s até o ciclo 15]
 * Invocar Lobo         druid     20    90    60    1 lobo espiritual, 60 s
 * Nevasca              druid     30   150     8    dmg 199 (área r3 + slow)
 *
 * FIM DE JOGO (lv 35-90) — magia               voc       lvl  mana (% da máx.)  cd(s)  esperado
 * Golpe Frontal        knight     35    30 (14%)    5    dmg 150 (retângulo 3x3 à frente, 9 tiles)
 * Fúria                knight     50    60 (20%)   30    buff + berserk 25
 * Fúria Giratória      knight     70    80 (20%)    8    dmg 333 (área r2)
 * Golpe Aniquilador    knight     90   100 (20%)   12    dmg 889 (alvo)
 * Flecha Explosiva     paladin    35    50 (9%)    6    dmg 152 (área no alvo r1)
 * Flecha Paralisante   paladin    50    60 (8%)    8    dmg 232 (alvo + slow)
 * Julgamento Divino    paladin    70   120 (11%)    8    dmg 342 (área no alvo r2)
 * Chuva de Estrelas    paladin    90   160 (12%)    8    dmg 454 (área no alvo r3)
 * Onda de Fogo         sorcerer   35    70 (7%)    6    dmg 243 (onda 5x3 + burn)
 * Morte Súbita         sorcerer   50   100 (7%)    6    dmg 326 (alvo)
 * Tempestade Elétrica  sorcerer   70   260 (12%)    8    dmg 530 (área r4)
 * Chama Eterna         sorcerer   90   180 (7%)   10    dmg 780 (alvo + burn)
 * Onda de Gelo         druid      35    70 (7%)    6    dmg 243 (onda 5x3 + slow)
 * Esmagar Terra        druid      50   100 (7%)    6    dmg 256 (alvo + poison)
 * Tempestade de Terra  druid      70   260 (12%)    8    dmg 508 (área r4 + poison)
 * Fúria da Natureza    druid      90   180 (7%)   10    dmg 693 (alvo + slow)
 *
 * FADA (oculta) — espelho do druida, magia a magia (spells.test.ts "Fada"):
 * Pó de Pirlimpimpim = Lasca de Gelo · Beijinho Curativo = Cura · Bolha de Sabão = Raiz · Asinhas Ligeiras = Pés Ligeiros
 * Chuva de Confete = Chuva de Gelo · Banho de Espuma = Escudo de Mana · Cantiga de Ninar = Cura em Grupo
 * Amiguinha Borboleta = Invocar Lobo · Explosão de Glitter = Nevasca · Sopro de Algodão-Doce = Onda de Gelo
 * Raio Arco-Íris = Esmagar Terra · Tempestade de Purpurina = Tempestade de Terra · Beijo de Boa Noite = Fúria da Natureza
 * Torcida da Fada (lv 100, grupo +15% de dano por 8 s) = a utilidade do lv 100 (sem par exato: é a única só dela).
 */

import { BASE_STEP_MS, DIAGONAL_COST } from "./constants.ts";
import { Dir, isDiagonal } from "./types.ts";

/**
 * Duração de um passo. Fica ~15% mais rápido até o level 40.
 * `groundSpeed` = velocidade do chão do tile de ORIGEM (onde o passo começa), como no Tibia:
 * porcentagem, 100 = normal, maior = mais lento (lama 150), menor = mais rápido (estrada 85).
 * Servidor e predição do cliente DEVEM chamar com os mesmos argumentos (ver GroundSpeedGrid).
 */
export function stepDuration(level: number, dir: Dir, groundSpeed = 100, speedPct = 100): number {
  const speedup = 1 + Math.min(level - 1, 39) * 0.004;
  const base = BASE_STEP_MS / speedup;
  const ms = Math.round(isDiagonal(dir) ? base * DIAGONAL_COST : base);
  const g = groundSpeed === 100 ? ms : Math.round((ms * groundSpeed) / 100);
  return applySpeedPct(g, speedPct);
}

/**
 * Aplica a velocidade da criatura (PlayerView.speedPct: 100 = normal, haste > 100, slow < 100) a uma duração de passo.
 * Cliente e servidor DEVEM usar o mesmo valor (o cliente lê `speedPct` do estado sincronizado).
 */
export function applySpeedPct(ms: number, speedPct = 100): number {
  if (!(speedPct > 0) || speedPct === 100) return ms;
  return Math.max(1, Math.round((ms * 100) / speedPct));
}

/** Direção de um passo unitário (dx,dy em {-1,0,1}); null se (dx,dy) não for vizinho. */
export function dirFromDelta(dx: number, dy: number): Dir | null {
  if (dx === 0 && dy === -1) return Dir.N;
  if (dx === 1 && dy === -1) return Dir.NE;
  if (dx === 1 && dy === 0) return Dir.E;
  if (dx === 1 && dy === 1) return Dir.SE;
  if (dx === 0 && dy === 1) return Dir.S;
  if (dx === -1 && dy === 1) return Dir.SW;
  if (dx === -1 && dy === 0) return Dir.W;
  if (dx === -1 && dy === -1) return Dir.NW;
  return null;
}

/** Valida uma direção vinda da rede (inteiro 0..7). */
export const isValidDir = (d: unknown): d is Dir => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 7;

import type { FightStance, Vocation } from "./types.ts";
import { RARITIES, type ItemDef, type Rarity } from "./data/items.ts";
import type { SkillId } from "./skills.ts";

/** XP total necessária para ATINGIR o level (level 1 = 0). Curva rápida no início, como no plano. */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  const l = level - 1;
  return Math.round(50 * l + 25 * l * l + 2 * l * l * l);
}

// Ciclo 15: paladino 10 → 12 → 13 de vida por level (lv 100: 1.140 → 1.437 sem equipamento; o 13 veio da calibração
// 15-13 em vocationBalance.test.ts). Era o mais frágil depois dos magos sem ter escudo de mana nem cura forte. A vida
// máxima não é salva: o login a recalcula por aqui (WorldRoom).
const VOC_GROWTH: Record<Vocation, { hp: number; mana: number }> = {
  knight: { hp: 15, mana: 5 },
  paladin: { hp: 13, mana: 15 },
  sorcerer: { hp: 6, mana: 30 },
  druid: { hp: 6, mana: 30 },
};

/** HP/mana máximos por vocação e level. Ajustável no balanceamento (M7). */
export function baseStats(vocation: Vocation, level: number): { maxHp: number; maxMana: number } {
  const g = VOC_GROWTH[vocation] ?? VOC_GROWTH.knight;
  return { maxHp: 150 + g.hp * (level - 1), maxMana: 50 + g.mana * (level - 1) };
}

// ---------------------------------------------------------------------------
// Combate (M2). Funções puras; `rng` = () => [0,1) para testes determinísticos.
// ---------------------------------------------------------------------------

/** Intervalo do ataque automático do jogador (ms), igual para todas as vocações. */
export const PLAYER_ATTACK_MS = 2000;
/** Sem dar/receber dano por este tempo = fora de combate (regen normal). */
export const OUT_OF_COMBAT_MS = 6000;
/** Intervalo da regeneração de HP/mana (ms). */
export const REGEN_INTERVAL_MS = 2000;
export const CRIT_CHANCE = 0.07;
export const CRIT_MULT = 1.5;
export const MISS_CHANCE = 0.05;

export interface VocationAttack {
  /** Alcance (Chebyshev). 1 = corpo a corpo. */
  range: number;
  kind: "physical" | "energy" | "ice";
  ranged: boolean;
  /** Pode dar crítico (knight/paladin). */
  canCrit: boolean;
}

export const VOCATION_ATTACK: Record<Vocation, VocationAttack> = {
  knight: { range: 1, kind: "physical", ranged: false, canCrit: true },
  paladin: { range: 6, kind: "physical", ranged: true, canCrit: true },
  sorcerer: { range: 4, kind: "energy", ranged: true, canCrit: false },
  druid: { range: 4, kind: "ice", ranged: true, canCrit: false },
};

/**
 * Dano DESARMADO por vocação. Cresce devagar de propósito: a arma do seu tier bate ~1,5–2,5× o punho e a de um tier
 * atrás ainda bate mais que ele (antes, com perLevel 1,6/1,4/1,1, o punho alcançava a melhor arma no level 50 e arma
 * de tier baixo batia menos que lutar sem nada). O dano do jogador equipado ficou no patamar em que o Coliseu foi
 * calibrado (modelo em server/systems/balanceKit.ts).
 */
const VOC_DAMAGE: Record<Vocation, { base: number; perLevel: number }> = {
  knight: { base: 6, perLevel: 0.85 },
  paladin: { base: 5, perLevel: 0.75 },
  sorcerer: { base: 4, perLevel: 0.6 },
  druid: { base: 4, perLevel: 0.6 },
};

/**
 * Multiplicador de dano do ataque básico pela skill da arma (M3):
 * knight → skillMelee, paladin → skillDistance: 1 + (skill-10)*0.03 (skill 10 = ×1, como no M2);
 * magos (varinha) → magicLevel, de leve: 1 + magicLevel*0.02.
 */
export function attackSkillMult(vocation: Vocation, skill: number): number {
  if (vocation === "sorcerer" || vocation === "druid") return 1 + Math.max(0, skill) * 0.02;
  return Math.max(0.5, 1 + (skill - 10) * 0.03);
}

/** Skill que conta no ataque básico da vocação ("magic" para magos). */
export function attackSkillOf(vocation: Vocation): "melee" | "distance" | "magic" {
  return vocation === "knight" ? "melee" : vocation === "paladin" ? "distance" : "magic";
}

/** Faixa [min,max] do ataque básico do jogador (média ±25%). `skill` ausente = multiplicador 1 (M2). */
export function playerDamageRange(vocation: Vocation, level: number, skill?: number): [number, number] {
  const d = VOC_DAMAGE[vocation] ?? VOC_DAMAGE.knight;
  const avg = (d.base + Math.max(1, level) * d.perLevel) * (skill === undefined ? 1 : attackSkillMult(vocation, skill));
  return [Math.max(1, Math.floor(avg * 0.75)), Math.max(1, Math.ceil(avg * 1.25))];
}

/** Skill da arma: espada/machado/clava → melee; arco → distance; varinha/cajado → magic; sem tipo → da vocação. */
export function weaponSkill(d: Pick<ItemDef, "weaponType"> | undefined, vocation: Vocation): SkillId {
  const t = d?.weaponType;
  if (t === "sword" || t === "axe" || t === "club") return "melee";
  if (t === "bow") return "distance";
  if (t === "wand" || t === "rod") return "magic";
  return vocation === "knight" ? "melee" : vocation === "paladin" ? "distance" : "magic";
}

/** Skills treinadas (undefined = jogador de teste sem skills: multiplicador neutro). */
export interface TrainedSkills { melee?: number; distance?: number; magic?: number }

/**
 * Faixa de dano do ataque automático (mesma regra no servidor e no balão do item):
 * sem arma, a fórmula da vocação; com arma, weaponDamageRange — mas nunca abaixo do desarmado (vale a faixa de maior
 * média: tirar a arma já dava o do punho). `bonus(stat)` = soma dos atributos do equipamento.
 */
export function autoAttackRange(
  vocation: Vocation, level: number, skills: TrainedSkills, weapon: Pick<ItemDef, "weaponType"> | undefined,
  bonus: (stat: SkillId | "attack") => number,
): [number, number] {
  const own = vocation === "knight" ? skills.melee : vocation === "paladin" ? skills.distance : skills.magic;
  const eff = own === undefined || !Number.isFinite(own) ? undefined : own + bonus(weaponSkill(undefined, vocation));
  const unarmed = playerDamageRange(vocation, level, eff);
  if (!weapon) return unarmed;
  const sk = weaponSkill(weapon, vocation);
  const trained = (sk === "melee" ? skills.melee : sk === "distance" ? skills.distance : skills.magic) ?? (sk === "magic" ? 0 : 10);
  const armed = weaponDamageRange(bonus("attack"), trained + bonus(sk), level, sk === "magic");
  return armed[0] + armed[1] >= unarmed[0] + unarmed[1] ? armed : unarmed;
}

/** Inteiro uniforme em [min,max]. */
export function rollInt(min: number, max: number, rng: () => number): number {
  const lo = Math.min(min, max), hi = Math.max(min, max);
  return lo + Math.min(hi - lo, Math.floor(rng() * (hi - lo + 1)));
}

export interface AttackRoll { amount: number; crit: boolean; miss: boolean }

/** Rola um ataque básico do jogador (antes da armadura do alvo): 5% de errar; 7% de crítico ×1.5 (knight/paladin). */
export function playerAttackDamage(vocation: Vocation, level: number, rng: () => number, skill?: number): AttackRoll {
  if (rng() < MISS_CHANCE) return { amount: 0, crit: false, miss: true };
  const [min, max] = playerDamageRange(vocation, level, skill);
  let amount = rollInt(min, max, rng);
  const crit = (VOCATION_ATTACK[vocation] ?? VOCATION_ATTACK.knight).canCrit && rng() < CRIT_CHANCE;
  if (crit) amount = Math.round(amount * CRIT_MULT);
  return { amount, crit, miss: false };
}

/**
 * Armadura extra da skill Escudo, só com escudo equipado: +1 a cada 4 níveis acima do inicial (10).
 * Shield 10–13 → 0, 14 → +1, 30 → +5, 50 → +10.
 */
export function shieldArmorBonus(shieldSkill: number): number {
  if (!Number.isFinite(shieldSkill)) return 0;
  return Math.max(0, Math.floor((shieldSkill - 10) / 4));
}

/** Dano após a armadura (redução fixa), nunca negativo. */
export function mitigate(raw: number, armor: number): number {
  return Math.max(0, Math.round(raw - Math.max(0, armor)));
}

/**
 * Fração do dano que o Escudo de Mana tira da mana (o resto vai na vida). Ciclo 15: era 1 (tudo na mana) e o
 * feiticeiro lv 100 aguentava 5.124 de dano com o escudo cheio (2,3× o cavaleiro) e 900/s bebendo poção de mana;
 * com 0,5: 2.288 e 360/s. Constante única: dá para voltar a 0,6 sem mexer em mais nada.
 */
export const MANA_SHIELD_ABSORB = 0.5;

/**
 * Divide um dano (já mitigado) entre mana e vida com o Escudo de Mana: `absorb` do dano sai da mana enquanto houver;
 * o que a mana não cobre vai na vida (sem mana, tudo na vida).
 */
export function manaShieldSplit(damage: number, mana: number, absorb = MANA_SHIELD_ABSORB): { fromMana: number; fromHp: number } {
  const total = Number.isFinite(damage) ? Math.max(0, Math.round(damage)) : 0;
  const pool = Number.isFinite(mana) ? Math.max(0, Math.floor(mana)) : 0;
  const share = Math.max(0, Math.min(1, absorb));
  const fromMana = Math.min(pool, Math.round(total * share));
  return { fromMana, fromHp: total - fromMana };
}

/** Level correspondente a uma XP total. */
export function levelForXp(xp: number): number {
  let level = 1;
  while (xp >= xpForLevel(level + 1)) level++;
  return level;
}

/**
 * Estágios de XP (como no Tibia): a XP de caça (abates e ondas do Coliseu) cai a partir de certos levels, para o fim de
 * jogo durar mais sem mexer na curva (personagens salvos não mudam de level). Missões e desafios dão a XP cheia.
 * Ordem crescente de `fromLevel`; o primeiro estágio começa no level 1.
 */
export const XP_STAGES: readonly { fromLevel: number; mult: number }[] = [
  { fromLevel: 1, mult: 1 },
  // Ciclo 7: era {60: 0,6; 80: 0,4; 100: 0,3} — 10 a 23 abates por level do 40 ao 120 (lv 100: 20 demônios) e o
  // 1→120 em ~9–27 h de caça. Assim: ~25 abates no lv 40, ~31 no 70 e ~51 no 100; o 40→120 dobra (~15–37 h).
  { fromLevel: 40, mult: 0.5 },
  { fromLevel: 60, mult: 0.3 },
  { fromLevel: 80, mult: 0.2 },
  { fromLevel: 100, mult: 0.12 },
];

/** Estágio de XP do level (o último cujo `fromLevel` ≤ level). */
export function xpStage(level: number): { fromLevel: number; mult: number } {
  let st = XP_STAGES[0]!;
  for (const s of XP_STAGES) if (level >= s.fromLevel) st = s;
  return st;
}

/** XP de caça depois do estágio do level (arredondada, mínimo 1 se havia XP). */
export function applyXpStage(amount: number, level: number): number {
  if (amount <= 0) return 0;
  return Math.max(1, Math.round(amount * xpStage(level).mult));
}

/**
 * Fração da XP do level (do início do level atual ao próximo) perdida ao morrer, por faixa de level. Ordem crescente
 * de `fromLevel`; o primeiro começa no level 1. Ciclo 15: era 10% em qualquer level e, no fim de jogo, morrer quase não
 * custava (lv 100: 6.443 XP; agora 19.328). Vai no mesmo deploy das compensações (bênção que só é gasta se houver
 * perda, fraquezas elementais, curandeiros com limite).
 */
export const DEATH_PENALTY_STAGES: readonly { fromLevel: number; pct: number }[] = [
  { fromLevel: 1, pct: 0.1 },
  { fromLevel: 60, pct: 0.2 },
  { fromLevel: 80, pct: 0.25 },
  { fromLevel: 100, pct: 0.3 },
];

/** Fração da XP do level perdida ao morrer neste level (o último estágio cujo `fromLevel` ≤ level). */
export function deathPenaltyPct(level: number): number {
  let pct = DEATH_PENALTY_STAGES[0]!.pct;
  for (const s of DEATH_PENALTY_STAGES) if (level >= s.fromLevel) pct = s.pct;
  return pct;
}

/**
 * XP perdida ao morrer: `deathPenaltyPct(level)` da XP entre o início do level atual e o próximo; nunca derruba o
 * level (limitada à XP acima do início do level). Com `xp` = Infinity, a perda cheia do level.
 */
export function deathPenalty(level: number, xp: number): number {
  const start = xpForLevel(level);
  const span = xpForLevel(level + 1) - start;
  return Math.max(0, Math.min(Math.round(span * deathPenaltyPct(level)), xp - start));
}

/**
 * XP que a morte tira de fato: deathPenalty × `mult` (caveira vermelha), ainda sem derrubar o level. É também o que a
 * bênção salva: servidor (morte) e cliente ("Protege ~X XP agora" na sacerdotisa) usam esta conta.
 */
export function deathXpLoss(level: number, xp: number, mult = 1): number {
  return Math.max(0, Math.min(xp - xpForLevel(level), Math.round(deathPenalty(level, xp) * Math.max(1, mult))));
}

/** Bênção no templo: preço em ouro escalado pelo level. Consumida na próxima morte, zera o deathPenalty. */
// 200 → 50 por level (ciclo 9, GD-09): a 200 a bênção custava 25–40 min de renda para proteger 6–8 min de XP e ninguém comprava.
export const BLESSING_GOLD_PER_LEVEL = 50;
export function blessingPrice(level: number): number {
  return Math.max(1, level) * BLESSING_GOLD_PER_LEVEL;
}

/** Divide `total` de XP proporcionalmente ao dano causado (arredondado, mínimo 1 por participante). */
export function splitXp(total: number, damage: Iterable<[string, number]>): Map<string, number> {
  const entries = [...damage].filter(([, d]) => d > 0);
  const sum = entries.reduce((s, [, d]) => s + d, 0);
  const out = new Map<string, number>();
  if (sum <= 0 || total <= 0) return out;
  for (const [id, d] of entries) out.set(id, Math.max(1, Math.round((total * d) / sum)));
  return out;
}

/** HP/mana recuperados por tique de regeneração (a cada REGEN_INTERVAL_MS, fora de combate). ×3 em zona de proteção. */
export function regenAmount(max: number, level: number, inPz: boolean): number {
  const base = Math.max(1, Math.round(max * 0.01 + level * 0.25));
  return inPz ? base * 3 : base;
}

/**
 * Mana recuperada por tique (REGEN_INTERVAL_MS). Escala com a mana máxima, então magos (muita mana) regeneram mais.
 * Fora de combate: max(2, round(maxMana*0.02 + level*0.5)), ×3 na PZ. Em combate: metade (mín. 1).
 */
export function manaRegenAmount(maxMana: number, level: number, inCombat: boolean, inPz: boolean): number {
  const base = Math.max(2, Math.round(maxMana * 0.02 + level * 0.5));
  if (inCombat) return Math.max(1, Math.round(base / 2));
  return inPz ? base * 3 : base;
}

// ---------------------------------------------------------------------------
// Magias (M3)
// ---------------------------------------------------------------------------

/** Fórmula de magia: (base + level*perLevel + magicLevel*perMagic) × (1 ± variance). Inteiro ≥ 0. */
export function evalSpellFormula(
  f: { base: number; perLevel: number; perMagic: number; variance: number },
  level: number, magicLevel: number, rng: () => number,
): number {
  const avg = f.base + level * f.perLevel + magicLevel * f.perMagic;
  const v = Math.max(0, f.variance || 0);
  return Math.max(0, Math.round(avg * (1 + v * (2 * rng() - 1))));
}

/**
 * "Magic level" que entra no DANO das magias (a cura segue com o ML). Cavaleiro e paladino treinam a arma, não o ML
 * (lv 100: ML ~10), e as magias deles ficavam presas a um número que quase não sobe; valem
 * max(ML, ⌊(skill da arma + bônus do equipamento + level − 10)/2⌋). Magos: o ML. `ml` já inclui o bônus de magia dos
 * itens. Ciclo 15-13: entrou o level (estilo Tibia): na produção a skill da arma fica em 25–43 em qualquer level
 * (corpo a corpo 60 pede ~19 h de golpes) e, só com ela, o cavaleiro lv 100 tinha potência 17 contra ML 55 do mago.
 */
export function spellPower(vocation: Vocation, ml: number, weaponSkill: number, weaponBonus: number, level: number): number {
  const own = Number.isFinite(ml) ? ml : 0;
  if (vocation !== "knight" && vocation !== "paladin") return own;
  const skill = (Number.isFinite(weaponSkill) ? weaponSkill : 10) + (Number.isFinite(weaponBonus) ? weaponBonus : 0);
  const lvl = Number.isFinite(level) ? Math.max(0, level) : 0;
  return Math.max(own, Math.floor((skill + lvl - 10) / 2));
}

/** Fração da armadura do alvo que vale contra dano mágico (magia ignora metade). Físico usa a armadura cheia. */
export const MAGIC_ARMOR_FACTOR = 0.5;

/** Dano de magia após a armadura: elementos usam 50% da armadura; "physical" usa 100%. */
export function mitigateSpell(raw: number, armor: number, kind: string): number {
  return mitigate(raw, kind === "physical" ? armor : armor * MAGIC_ARMOR_FACTOR);
}

// ---------------------------------------------------------------------------
// Itens, loja e modos de batalha (M4)
// ---------------------------------------------------------------------------

/**
 * Faixa [min,max] do ataque automático COM arma: attack × multSkill × (0.85..1.15) + level×0.3.
 * multSkill = 1 + (skill−10)×0.04 (mín. 0.5); armas mágicas (`magic`, varinha/cajado) usam 1 + magicLevel×0.04.
 */
export function weaponDamageRange(attack: number, skill: number, level: number, magic = false): [number, number] {
  const mult = magic ? 1 + Math.max(0, skill) * 0.04 : Math.max(0.5, 1 + (skill - 10) * 0.04);
  const base = Math.max(0, attack) * mult;
  const lv = Math.max(1, level) * 0.3;
  return [Math.max(1, Math.floor(base * 0.85 + lv)), Math.max(1, Math.ceil(base * 1.15 + lv))];
}

/** Chance de crítico do ataque básico: 7% para knight/paladin (VOCATION_ATTACK.canCrit) + bônus de itens (`crit`, em %). */
export function critChance(vocation: Vocation, bonusPct = 0): number {
  const base = (VOCATION_ATTACK[vocation] ?? VOCATION_ATTACK.knight).canCrit ? CRIT_CHANCE : 0;
  return Math.max(0, Math.min(1, base + Math.max(0, bonusPct) / 100));
}

/** Rola um ataque básico numa faixa [min,max] com chance de crítico explícita (5% de errar; crítico ×1.5). */
export function rollAttack(range: [number, number], critPct: number, rng: () => number): AttackRoll {
  if (rng() < MISS_CHANCE) return { amount: 0, crit: false, miss: true };
  let amount = rollInt(range[0], range[1], rng);
  const crit = critPct > 0 && rng() < critPct;
  if (crit) amount = Math.round(amount * CRIT_MULT);
  return { amount, crit, miss: false };
}

/** Multiplicadores da postura: dano causado (ataques e magias) e dano recebido. */
export const STANCE_DEALT: Record<FightStance, number> = { offensive: 1.2, balanced: 1, defensive: 0.8 };
export const STANCE_TAKEN: Record<FightStance, number> = { offensive: 1.15, balanced: 1, defensive: 0.75 };

/** Fração do valor que um NPC paga ao comprar um item do jogador. */
export const NPC_BUY_RATIO = 0.3;
/** Multiplicador de preço por raridade (venda ao NPC). */
export const RARITY_PRICE_MULT: Record<Rarity, number> = { common: 1, uncommon: 1.5, rare: 2.5, epic: 5, legendary: 10 };

/** Quanto o NPC paga por UMA unidade do item: floor(0.3 × value × multRaridade), mínimo 1 se value > 0. */
export function npcBuyPrice(value: number, rarity: Rarity = "common"): number {
  if (!(value > 0)) return 0;
  return Math.max(1, Math.floor(NPC_BUY_RATIO * value * (RARITY_PRICE_MULT[rarity] ?? 1)));
}

/** "Vender tudo" no NPC deixa na mochila os itens desta raridade ou melhor (vender um épico sem querer não tem volta). */
export const SELL_ALL_KEEPS_FROM: Rarity = "rare";

/** O "Vender tudo" deixa este item na mochila? (só a venda item a item vende). Regra única de servidor e cliente. */
export function keptBySellAll(rarity: Rarity): boolean {
  return RARITIES.indexOf(rarity) >= RARITIES.indexOf(SELL_ALL_KEEPS_FROM);
}

// ---------------------------------------------------------------------------
// Treino offline (estátuas do centro de treinamento)
// ---------------------------------------------------------------------------

/** Máximo de minutos offline que contam (12 h). */
export const OFFLINE_TRAINING_MAX_MIN = 720;
/** Abaixo disto (minutos) o treino não rende nada. */
export const OFFLINE_TRAINING_MIN_MIN = 1;
/**
 * Rendimento do treino offline em relação ao treino online CONTÍNUO num boneco (teto teórico: atacar sem parar /
 * gastar toda a mana regenerada). Calibrado pelo "feel" do Tibia: 1 h offline numa skill baixa ≈ +3 a +5 níveis.
 *   - melee/distance/shield: 12% de 30 tentativas/min = 3,6/min (216/h).
 *   - magic: 3% da mana regenerada por minuto (a regeneração cresce com o level; o online contínuo é bem mais rápido
 *     que o real, que alterna caçar/curar/esperar — por isso o fator menor).
 * Tabela (1 h → 12 h, a partir do valor inicial): knight melee 10 → +4 / +13; paladin distance 10 → +4 / +13;
 * sorcerer melee 10 → +2 / +5; druid lv8 ML 0 → +3 / +11; druid lv20 ML 0 → +5 / +14; druid lv30 ML 15 → +0 (44%) / +3;
 * knight melee 30 → +0 (7%) / +0 (78%) — a curva de skill é exponencial: offline rende pouco em skill alta.
 */
export const OFFLINE_TRAINING_FACTOR = { weapon: 0.12, magic: 0.03 } as const;

/**
 * "Tentativas" de skill ganhas por `minutes` de treino offline (inteiro, arredondado para baixo).
 * Online num boneco: melee/distance/shield = 1 tentativa por ataque (PLAYER_ATTACK_MS) → 30/min; magic = mana gasta,
 * limitada pela regeneração de mana → manaRegenAmount(maxMana, level, fora de combate) por REGEN_INTERVAL_MS.
 * Offline = isso × OFFLINE_TRAINING_FACTOR. Os minutos são limitados a [0, 12 h]; menos de 1 min = 0.
 */
export function offlineTrainingTries(skill: SkillId, minutes: number, vocation: Vocation, level: number): number {
  if (!Number.isFinite(minutes) || minutes < OFFLINE_TRAINING_MIN_MIN) return 0;
  const m = Math.min(OFFLINE_TRAINING_MAX_MIN, minutes);
  let perMin: number;
  if (skill === "magic") {
    const lv = Math.max(1, Math.floor(level));
    const regen = manaRegenAmount(baseStats(vocation, lv).maxMana, lv, false, false);
    perMin = ((regen * 60_000) / REGEN_INTERVAL_MS) * OFFLINE_TRAINING_FACTOR.magic;
  } else {
    perMin = (60_000 / PLAYER_ATTACK_MS) * OFFLINE_TRAINING_FACTOR.weapon;
  }
  // + epsilon: evita 215,999… → 215 por erro de ponto flutuante.
  return Math.floor(m * perMin + 1e-9);
}

/** Minutos de treino offline entre `sinceMs` e `nowMs`, limitados a [0, 12 h] (fração preservada). */
export function offlineTrainingMinutes(sinceMs: number, nowMs: number): number {
  if (!Number.isFinite(sinceMs) || !Number.isFinite(nowMs)) return 0;
  return Math.max(0, Math.min(OFFLINE_TRAINING_MAX_MIN, (nowMs - sinceMs) / 60_000));
}

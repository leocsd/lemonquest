// Habilidades de monstros (estilo Tibia): sopros, pisões, chuvas de fogo, venenos, curas e invocações.
// Cada uma ocupa o "turno" do ataque básico (o monstro usa a habilidade OU ataca), então o dano por segundo continua
// previsível; o que muda é a forma (área, onda, condição) e o aviso no chão (`windupMs`), que dá para esquivar.
// O servidor executa em server/src/systems/monsterAbilities.ts; o cliente desenha com o mesmo efeito das magias
// (monsterAbilitySpell, em monsters.ts: aqui não se importa monsters.ts, que usa estes atalhos ao carregar).
import type { DamageKind } from "../types.ts";
import type { ConditionId, SpellFx } from "./spells.ts";

/** Forma da habilidade (as mesmas das magias dos jogadores, mais "self" para cura/invocação). */
export type MonsterAbilityShape = "target" | "area_self" | "area_target" | "wave" | "self";

/** Condições que um monstro pode aplicar em quem acerta. */
export type MonsterAbilityCondition = Extract<ConditionId, "slow" | "burn" | "poison" | "freeze" | "bleed" | "energy">;

export interface MonsterAbility {
  /** Único no monstro (cooldown e id do efeito visual). */
  id: string;
  /** Grito sobre a cabeça do monstro (PT-BR). */
  name: string;
  shape: MonsterAbilityShape;
  cooldownMs: number;
  /** Chance de usar quando está pronta, a cada turno de ataque (0–1). Padrão 1. */
  chance?: number;
  /** Alcance (Chebyshev) até o alvo em "target"/"area_target"/"wave". Padrão: alcance do ataque básico. */
  range?: number;
  /** Raio das áreas (mesmo círculo das magias: r=1 → 3×3). */
  radius?: number;
  /** Onda: comprimento e largura máxima. */
  length?: number;
  width?: number;
  /** Dano a cada criatura atingida [min, max], antes da armadura (que conta pela metade contra elementos). */
  damage?: { min: number; max: number; kind: DamageKind };
  /** Condição aplicada a quem é atingido (`value` = % de lentidão ou dano por tique). */
  condition?: { id: MonsterAbilityCondition; durationMs: number; value: number };
  /** Cura em si mesmo: fração da vida máxima. Só usa abaixo de `belowHpPct` da vida. */
  heal?: { pct: number; belowHpPct: number };
  /**
   * Cura em grupo (conjuradores): cada monstro aliado a até `radius` tiles (inclusive ele mesmo) recupera `pct` da
   * própria vida máxima. Só usa se algum deles estiver abaixo de `belowHpPct` e fora do HEAL_ALLIES_LOCKOUT_MS.
   */
  healAllies?: { pct: number; radius: number; belowHpPct: number };
  /** Invoca `count` monstros (no máximo `max` vivos por vez). Somem quando o invocador some; não dão XP nem loot. */
  summon?: { monsterId: string; count: number; max: number };
  /**
   * Aviso no chão antes do golpe (ms): os tiles ficam marcados e o dano cai em quem ainda estiver neles. Matar o
   * monstro no meio cancela. Ausente = instantâneo.
   */
  windupMs?: number;
  fx: SpellFx;
}

/**
 * Cada monstro recebe a cura em grupo (`healAllies`) no máximo uma vez neste intervalo, venha de qual curandeiro vier
 * (ciclo 15). Três Necromantes juntos curavam cada um 3× a cada 10 s (bando: 162 de vida/s); com o limite, 54/s.
 */
export const HEAL_ALLIES_LOCKOUT_MS = 10_000;

/** Id do efeito do pedido de reforço (`m:<monstro>:call_help`): o grito é `MonsterDef.pack.shout`. */
export const CALL_HELP_ID = "call_help";

/** Prefixo do id do efeito visual (SpellCastMsg.spellId) de uma habilidade de monstro: `m:<monstro>:<habilidade>`. */
export const MONSTER_ABILITY_PREFIX = "m:";

export const monsterAbilityFxId = (defId: string, abilityId: string) => `${MONSTER_ABILITY_PREFIX}${defId}:${abilityId}`;

/** Atalhos para montar as tabelas em monsters.ts. */
export const ability = {
  /** Golpe em área ao redor do próprio monstro, com aviso. */
  stomp: (o: { name: string; radius: number; min: number; max: number; kind?: DamageKind; cooldownMs?: number; windupMs?: number; fx?: SpellFx; condition?: MonsterAbility["condition"] }): MonsterAbility => ({
    id: "stomp", name: o.name, shape: "area_self", radius: o.radius, cooldownMs: o.cooldownMs ?? 10_000,
    damage: { min: o.min, max: o.max, kind: o.kind ?? "physical" }, windupMs: o.windupMs ?? 800, fx: o.fx ?? "physical",
    condition: o.condition,
  }),
  /** Onda (cone) na direção do alvo, com aviso. */
  breath: (o: { name: string; length: number; width: number; min: number; max: number; kind: DamageKind; fx: SpellFx; cooldownMs?: number; windupMs?: number; condition?: MonsterAbility["condition"] }): MonsterAbility => ({
    id: "breath", name: o.name, shape: "wave", length: o.length, width: o.width, range: o.length, cooldownMs: o.cooldownMs ?? 9000,
    damage: { min: o.min, max: o.max, kind: o.kind }, windupMs: o.windupMs ?? 800, fx: o.fx, condition: o.condition,
  }),
  /** Área centrada no alvo (bola de fogo, avalanche), com aviso. */
  blast: (o: { name: string; radius: number; range: number; min: number; max: number; kind: DamageKind; fx: SpellFx; cooldownMs?: number; windupMs?: number; chance?: number; condition?: MonsterAbility["condition"] }): MonsterAbility => ({
    id: "blast", name: o.name, shape: "area_target", radius: o.radius, range: o.range, cooldownMs: o.cooldownMs ?? 10_000,
    chance: o.chance, damage: { min: o.min, max: o.max, kind: o.kind }, windupMs: o.windupMs ?? 900, fx: o.fx, condition: o.condition,
  }),
  /** Projétil no alvo atual (instantâneo), geralmente com condição. */
  bolt: (o: { name: string; range: number; min: number; max: number; kind: DamageKind; fx: SpellFx; cooldownMs?: number; chance?: number; condition?: MonsterAbility["condition"] }): MonsterAbility => ({
    id: "bolt", name: o.name, shape: "target", range: o.range, cooldownMs: o.cooldownMs ?? 8000, chance: o.chance,
    damage: { min: o.min, max: o.max, kind: o.kind }, fx: o.fx, condition: o.condition,
  }),
  /** Cura em si mesmo abaixo de uma fração da vida. */
  heal: (o: { name: string; pct: number; belowHpPct?: number; cooldownMs?: number }): MonsterAbility => ({
    id: "heal", name: o.name, shape: "self", cooldownMs: o.cooldownMs ?? 15_000,
    heal: { pct: o.pct, belowHpPct: o.belowHpPct ?? 0.5 }, fx: "heal",
  }),
  /** Cura dos aliados num raio (xamãs, magos, necromantes, bruxas). */
  healAllies: (o: { name: string; pct: number; radius?: number; belowHpPct?: number; cooldownMs?: number }): MonsterAbility => ({
    id: "heal_allies", name: o.name, shape: "self", cooldownMs: o.cooldownMs ?? 10_000,
    healAllies: { pct: o.pct, radius: o.radius ?? 4, belowHpPct: o.belowHpPct ?? 0.7 }, fx: "heal",
  }),
  /** Invocação de ajudantes. */
  summon: (o: { name: string; monsterId: string; count: number; max: number; cooldownMs?: number }): MonsterAbility => ({
    id: "summon", name: o.name, shape: "self", cooldownMs: o.cooldownMs ?? 20_000,
    summon: { monsterId: o.monsterId, count: o.count, max: o.max }, fx: "summon",
  }),
};

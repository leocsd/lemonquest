// Modelo de balanço (só mede; nenhuma regra de jogo mora aqui). Monta o jogador "bem equipado" de cada vocação num
// level e simula a luta passo a passo (50 ms, o tick do servidor) contra monstros. Duas medidas usam a mesma luta:
// - vocationBalance.test.ts: dano por segundo e pressão aguentada contra o pacote de referência da faixa (P = dano × vida);
// - arena.test.ts: o Coliseu onda a onda, solo e em grupo.
// O que é regra vem das funções reais do shared e do servidor (dano e cura das magias, potência das magias, armadura,
// escudo de mana, resistências e fraquezas, poções, regeneração, danos contínuos): mudou a regra, o modelo acompanha
// sem editar aqui. As escolhas do jogador (o que conjurar, quando beber) ficam em `drink`/`decide`: as de um jogador
// atento, não as de um robô perfeito. Fora do modelo: andar/kitar, lentidão e raiz, invocações (lobo do druida e
// ajudantes dos monstros), curas dos monstros, condições que os monstros aplicam, áreas de monstro pegando mais de um
// jogador, ouro (as poções não acabam).
import {
  ARENA_MAX_WAVE, ARENA_PAUSE_HEAL, CRIT_MULT, EQUIP_SLOTS, GLOBAL_SPELL_COOLDOWN_MS, ITEMS, MANA_SHIELD_ABSORB, MISS_CHANCE,
  PLAYER_ATTACK_MS, REGEN_INTERVAL_MS, VOCATION_ATTACK, arenaPauseMs, arenaWaveSpawns, attackSkillOf, autoAttackRange, baseStats,
  critChance, damageTakenMult, manaRegenAmount, manaShieldSplit, mitigateSpell, monsterDef, shieldArmorBonus, SKILL_ESTIMATE, skillEstimate,
  SPELLS, spellMana, spellPower, spellsFor, vocationFits,
  type ConditionId, type DamageKind, type ItemDef, type MonsterDef, type SkillId, type SpellDef, type SpellFormula, type StatId,
  type Vocation,
} from "@lemonquest/shared";
import { DOT_INTERVAL_MS, DOT_KIND, REGEN_TICK_MS } from "./conditions.ts";

/** Passo da simulação (s): o tick do servidor. */
export const SIM_DT = 0.05;
/** Golpe de monstro com aviso no chão (`windupMs`): fração que acerta (o resto o jogador sai do lugar a tempo). */
export const WINDUP_HIT = 0.6;
/** Até quantos monstros cada forma de magia pega num grupo amontoado (círculos e retângulos de verdade são maiores). */
export const AREA_CAP: Record<string, number> = { target: 1, area_target: 4, area_self: 4, wave: 3 };
/** Vida abaixo desta fração: o jogador bebe/cura mesmo desperdiçando parte da cura. */
export const LOW_HP = 0.4;
/** Mana guardada pelo mago com escudo ao atacar no Coliseu (o resto do pool é "vida"). */
export const SHIELD_MANA_RESERVE = 0.35;

// ---------------------------------------------------------------------------------------------------------------------
// O jogador bem equipado
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Montagem do equipamento: "auto" = item mais caro de cada slot (o escudo só se a arma não for de duas mãos);
 * "shield" = arma de uma mão + escudo; "twoHanded" = arma de duas mãos, sem escudo (o cavaleiro testa as duas).
 */
export type Build = "auto" | "shield" | "twoHanded";

export interface Fighter {
  v: Vocation;
  L: number;
  build: Build;
  gear: ItemDef[];
  /** Skills treinadas (skillEstimate), sem os bônus do equipamento. */
  skills: Record<SkillId, number>;
  /** Magic level com o equipamento: cura (e dano dos magos). */
  ml: number;
  /** Potência das magias de dano (spellPower: cavaleiro/paladino usam a skill da arma e o level). */
  power: number;
  hp: number;
  mana: number;
  /** Armadura contra golpes: equipamento + skill Escudo (só com escudo). */
  armor: number;
  /** Faixa do ataque automático e chance de crítico. */
  auto: [number, number];
  crit: number;
  autoKind: DamageKind;
  /** Alcance do ataque automático (onde o jogador fica na luta). */
  range: number;
  /** Mana por tique de regeneração em combate (REGEN_INTERVAL_MS), com o equipamento. */
  manaTick: number;
  /** Magias liberadas no level. */
  spells: SpellDef[];
  /** Melhor poção de vida do level; de mana, a maior que cabe na mana máxima. */
  hpPotion?: { amount: number; cdS: number };
  manaPotion?: { amount: number; cdS: number };
}

const usableBy = (it: ItemDef, v: Vocation, L: number) => vocationFits(it.vocations, v) && (it.level ?? 0) <= L;

function bestItem(v: Vocation, L: number, ok: (it: ItemDef) => boolean): ItemDef | undefined {
  let best: ItemDef | undefined;
  for (const it of Object.values(ITEMS)) if (usableBy(it, v, L) && ok(it) && (!best || it.value > best.value)) best = it;
  return best;
}

function bestPotion(L: number, kind: "heal" | "mana", v: Vocation, cap = Infinity): { amount: number; cdS: number } | undefined {
  let best: { amount: number; cdS: number } | undefined;
  for (const it of Object.values(ITEMS)) {
    const amount = it.kind === "potion" ? it.use?.[kind] ?? 0 : 0;
    // Poções por vocação (as fortes): o mago não bebe a de vida do cavaleiro.
    if (!vocationFits(it.vocations, v)) continue;
    if (amount > 0 && amount <= cap && (it.level ?? 0) <= L && (!best || amount > best.amount)) {
      best = { amount, cdS: (it.use?.cooldownMs ?? 0) / 1000 };
    }
  }
  return best;
}

/**
 * Jogador "bem equipado" (o item mais caro liberado em cada slot) com as skills de `skillEstimate` (`table` troca a
 * tabela de skills para comparar hipóteses).
 */
export function fighter(v: Vocation, L: number, build: Build = "auto", table = SKILL_ESTIMATE): Fighter | undefined {
  const weapon = bestItem(v, L, (it) => it.slot === "weapon" && (build === "auto" || !!it.twoHanded === (build === "twoHanded")));
  if (build === "twoHanded" && !weapon) return undefined;
  const gear: ItemDef[] = [];
  for (const sl of EQUIP_SLOTS) {
    const it = sl === "weapon" ? weapon : sl === "shield" && weapon?.twoHanded ? undefined : bestItem(v, L, (x) => x.slot === sl);
    if (it) gear.push(it);
  }
  const bonus = (st: StatId) => gear.reduce((s, it) => s + (it.stats?.[st] ?? 0), 0);
  const skills = skillEstimate(v, L, table);
  const ml = skills.magic + bonus("magic");
  const own = attackSkillOf(v);
  const { maxHp, maxMana } = baseStats(v, L);
  const mana = maxMana + bonus("manaMax");
  const hasShield = gear.some((g) => g.slot === "shield");
  return {
    v, L, build, gear, skills, ml,
    power: spellPower(v, ml, skills[own], bonus(own), L),
    hp: maxHp + bonus("hpMax"),
    mana,
    armor: bonus("armor") + (hasShield ? shieldArmorBonus(skills.shield) : 0),
    auto: autoAttackRange(v, L, skills, weapon, (st) => bonus(st)),
    crit: critChance(v, bonus("crit")),
    autoKind: weapon?.damageKind ?? VOCATION_ATTACK[v].kind,
    range: weapon?.range ?? VOCATION_ATTACK[v].range,
    manaTick: manaRegenAmount(mana, L, true, false) + bonus("manaRegen"),
    spells: spellsFor(v).filter((s) => s.level <= L),
    hpPotion: bestPotion(L, "heal", v),
    manaPotion: bestPotion(L, "mana", v, mana),
  };
}

/** As montagens que a vocação usa no level: o cavaleiro com escudo e de duas mãos; os outros, a única que cabe. */
export function fighterBuilds(v: Vocation, L: number, table = SKILL_ESTIMATE): Fighter[] {
  const list = v === "knight" ? [fighter(v, L, "shield", table), fighter(v, L, "twoHanded", table)] : [fighter(v, L, "auto", table)];
  return list.filter((f): f is Fighter => !!f);
}

const formula = (f: SpellFormula, L: number, power: number) => f.base + L * f.perLevel + power * f.perMagic;
const hasManaShield = (f: Fighter) => f.spells.some((s) => s.condition?.id === "manashield");

/**
 * Vida efetiva: dano total que derruba o jogador de vida e mana cheias, com o escudo de mana ativo (sem escudo, a
 * vida). Armadura fora. `absorb` = fração que o escudo tira da mana (padrão: a regra atual).
 */
export function effectiveHp(f: Fighter, absorb = MANA_SHIELD_ABSORB): number {
  if (!hasManaShield(f)) return f.hp;
  let lo = f.hp, hi = f.hp + f.mana;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (manaShieldSplit(mid, f.mana, absorb).fromHp >= f.hp) hi = mid; else lo = mid + 1;
  }
  return lo;
}

// ---------------------------------------------------------------------------------------------------------------------
// Monstros
// ---------------------------------------------------------------------------------------------------------------------

/** Média de max(0, x − armadura) com x uniforme em [lo, hi] (o golpe rola, a armadura é fixa). */
export function meanAbove(lo: number, hi: number, armor: number): number {
  if (hi <= lo) return Math.max(0, lo - armor);
  if (armor <= lo) return (lo + hi) / 2 - armor;
  if (armor >= hi) return 0;
  return (hi - armor) ** 2 / (2 * (hi - lo));
}

/** Golpe médio do monstro contra `armor`; habilidade de dano pronta ocupa o turno no lugar do golpe básico. */
function monsterHit(d: MonsterDef, dmgMult: number, armor: number, ability?: NonNullable<MonsterDef["abilities"]>[number]): number {
  const basic = meanAbove(d.damage[0] * dmgMult, d.damage[1] * dmgMult, armor);
  if (!ability?.damage) return basic;
  const hit = meanAbove(ability.damage.min * dmgMult, ability.damage.max * dmgMult, armor) * (ability.windupMs ? WINDUP_HIT : 1);
  const c = ability.chance ?? 1;
  return c * hit + (1 - c) * basic;
}

/** Dano por segundo de um monstro contra a armadura `armor` (golpes + habilidades de dano no lugar de golpes). */
export function monsterDps(s: { defId: string; dmgMult?: number }, armor: number): number {
  const d = monsterDef(s.defId)!;
  const m = s.dmgMult ?? 1;
  const basic = monsterHit(d, m, armor);
  let dps = basic / (d.attackMs / 1000);
  for (const a of d.abilities ?? []) if (a.damage) dps += (monsterHit(d, m, armor, a) - basic) / (a.cooldownMs / 1000);
  return Math.max(0, dps);
}

// ---------------------------------------------------------------------------------------------------------------------
// A luta
// ---------------------------------------------------------------------------------------------------------------------

/** "offense": só ataca (ninguém bate nele); "defense": só se defende (escudo, curas, poções); "mixed": joga de verdade. */
export type Mode = "offense" | "defense" | "mixed";

export interface SimOptions {
  /** Fração do dano que o escudo de mana tira da mana (padrão: MANA_SHIELD_ABSORB; 1 = o escudo de antes do ciclo 15). */
  absorb?: number;
  /** Como os golpes se distribuem no grupo (ver `Battle.targets`). Padrão "spread". */
  targeting?: "spread" | "front";
  /** false = sem poção de mana (só a regeneração): o mago que não paga a poção. Padrão true. */
  manaPotions?: boolean;
}

export interface FoeSpec {
  def: MonsterDef;
  hpMult?: number;
  dmgMult?: number;
  /** Não morre (pacote de referência: mede o dano, a pressão não acaba). */
  immortal?: boolean;
  /** Não ataca (medida de dano puro). */
  passive?: boolean;
}

interface Unit {
  f: Fighter;
  hp: number;
  mana: number;
  alive: boolean;
  dealt: number;
  gcdAt: number;
  cd: Map<string, number>;
  potionAt: number;
  autoAt: number;
  regenAt: number;
  protect: number;
  protectUntil: number;
  berserk: number;
  berserkUntil: number;
  shieldUntil: number;
  hot: number;
  hotUntil: number;
  hotAt: number;
}

interface Dot { kind: DamageKind; value: number; until: number; at: number; owner: Unit }

interface Foe {
  def: MonsterDef;
  hp: number;
  dmgMult: number;
  immortal: boolean;
  passive: boolean;
  attackAt: number;
  abilityAt: Map<string, number>;
  dots: Map<ConditionId, Dot>;
  exposed: number;
  exposedUntil: number;
}

export type BattleEnd = "won" | "wiped" | "timeout";

/** Uma luta: o time contra os monstros, passo a passo. O focus do time é o primeiro monstro vivo. */
export class Battle {
  t = 0;
  readonly units: Unit[];
  private foes: Foe[] = [];
  private spawned = 0;
  private readonly absorb: number;
  private readonly targeting: "spread" | "front";
  private readonly manaPotions: boolean;
  /** Ordem em que os monstros pegam o time no modo "front": quem bate de mais perto primeiro. */
  private readonly front: Unit[];

  constructor(team: readonly Fighter[], o: SimOptions = {}) {
    this.absorb = o.absorb ?? MANA_SHIELD_ABSORB;
    this.targeting = o.targeting ?? "spread";
    this.manaPotions = o.manaPotions ?? true;
    this.units = team.map((f) => ({
      f, hp: f.hp, mana: f.mana, alive: true, dealt: 0, gcdAt: 0, cd: new Map(), potionAt: 0, autoAt: 0,
      regenAt: REGEN_INTERVAL_MS / 1000, protect: 0, protectUntil: 0, berserk: 0, berserkUntil: 0, shieldUntil: 0,
      hot: 0, hotUntil: 0, hotAt: 0,
    }));
    this.front = [...this.units].sort((a, b) => a.f.range - b.f.range);
  }

  get alive(): boolean { return this.units.some((u) => u.alive); }
  get dealt(): number { return this.units.reduce((s, u) => s + u.dealt, 0); }

  setFoes(list: readonly FoeSpec[]): void {
    this.foes = [];
    this.addFoes(list);
  }

  /**
   * Monstros entram agora. Os turnos não chegam juntos (cada um anda até o jogador num ritmo): o 1º golpe cai numa
   * fração do intervalo de ataque e a 1ª habilidade, como no servidor, em 30–100% da recarga (frações fixas, sem sorteio).
   */
  addFoes(list: readonly FoeSpec[]): void {
    for (const s of list) {
      const n = ++this.spawned;
      const a = (n * 0.6180339887) % 1, b = (n * 0.7548776662) % 1;
      this.foes.push({
        def: s.def, hp: s.def.hp * (s.hpMult ?? 1), dmgMult: s.dmgMult ?? 1, immortal: !!s.immortal, passive: !!s.passive,
        attackAt: this.t + (a * s.def.attackMs) / 1000,
        abilityAt: new Map((s.def.abilities ?? []).map((ab) => [ab.id, this.t + (ab.cooldownMs * (0.3 + 0.7 * b)) / 1000])),
        dots: new Map(), exposed: 0, exposedUntil: 0,
      });
    }
  }

  /** Roda até `maxS` segundos; para antes se o time cair ou (com `untilClear`) se os monstros acabarem. */
  run(mode: Mode, maxS: number, untilClear = true): BattleEnd {
    const end = this.t + maxS - SIM_DT / 2;
    while (this.t < end) {
      this.t += SIM_DT;
      for (const u of this.units) if (u.alive) this.act(u, mode);
      this.tickDots();
      this.foesAttack();
      this.foes = this.foes.filter((m) => m.immortal || m.hp > 0);
      if (!this.alive) return "wiped";
      if (untilClear && this.foes.length === 0) return "won";
    }
    return "timeout";
  }

  /**
   * Fim de onda do Coliseu: +ARENA_PAUSE_HEAL de vida e mana (como o servidor) e o intervalo com o time se cuidando
   * (poções e curas; depois das ondas-chefe a pausa de 45 s enche tudo).
   */
  arenaPause(wave: number): void {
    for (const u of this.units) {
      if (!u.alive) continue;
      u.hp = Math.min(u.f.hp, u.hp + u.f.hp * ARENA_PAUSE_HEAL);
      u.mana = Math.min(u.f.mana, u.mana + u.f.mana * ARENA_PAUSE_HEAL);
    }
    this.setFoes([]);
    this.run("mixed", arenaPauseMs(wave) / 1000, false);
  }

  private get focus(): Foe | undefined { return this.foes[0]; }
  private shielded(u: Unit): boolean { return this.t < u.shieldUntil && u.mana > 0; }

  private act(u: Unit, mode: Mode): void {
    const f = u.f, t = this.t;
    if (t >= u.regenAt) { u.mana = Math.min(f.mana, u.mana + f.manaTick); u.regenAt += REGEN_INTERVAL_MS / 1000; }
    if (u.hotAt <= u.hotUntil && t >= u.hotAt) { u.hp = Math.min(f.hp, u.hp + u.hot); u.hotAt += REGEN_TICK_MS / 1000; }
    if (t >= u.potionAt) this.drink(u, mode);
    if (t >= u.gcdAt) this.decide(u, mode);
    const foe = this.focus;
    if (mode !== "defense" && foe && t >= u.autoAt) {
      u.autoAt = t + PLAYER_ATTACK_MS / 1000;
      const mult = this.dealtMult(u), armor = foe.def.armor;
      const hit = (k: number) => meanAbove(f.auto[0] * k * mult, f.auto[1] * k * mult, armor);
      const e = (1 - MISS_CHANCE) * ((1 - f.crit) * hit(1) + f.crit * hit(CRIT_MULT));
      this.hurt(foe, e * damageTakenMult(foe.def, f.autoKind, this.exposedPct(foe)), u);
    }
  }

  /**
   * Poção (temporizador único): vida se faltar uma poção inteira (ou metade da vida, para quem tem menos vida que a
   * poção: o mago lv 30 tem 324) ou se a vida estiver baixa; senão mana.
   */
  private drink(u: Unit, mode: Mode): void {
    const f = u.f;
    const low = u.hp < LOW_HP * f.hp;
    const wantHp = mode !== "offense" && !!f.hpPotion && (f.hp - u.hp >= Math.min(f.hpPotion.amount, f.hp / 2) || (low && u.hp < f.hp));
    const wantMana = this.manaPotions && !!f.manaPotion && f.mana - u.mana >= f.manaPotion.amount;
    // Com o escudo de mana a mana é a vida: ela vem primeiro, até a vida ficar baixa.
    const pick = this.shielded(u) && !low ? (wantMana ? "mana" : wantHp ? "hp" : undefined) : (wantHp ? "hp" : wantMana ? "mana" : undefined);
    if (pick === "hp") { u.hp = Math.min(f.hp, u.hp + f.hpPotion!.amount); u.potionAt = this.t + f.hpPotion!.cdS; }
    if (pick === "mana") { u.mana = Math.min(f.mana, u.mana + f.manaPotion!.amount); u.potionAt = this.t + f.manaPotion!.cdS; }
  }

  /** Uma magia por recarga global: escudo → cura → proteção → reforços de dano → a magia de dano que mais rende. */
  private decide(u: Unit, mode: Mode): void {
    const f = u.f, t = this.t;
    const fighting = this.foes.length > 0;
    const ready = (s: SpellDef, reserve = 0) => t >= (u.cd.get(s.id) ?? 0) && u.mana - spellMana(s, f.L) >= reserve;
    const cast = (s: SpellDef) => {
      u.mana -= spellMana(s, f.L);
      u.cd.set(s.id, t + s.cooldownMs / 1000);
      if (s.global !== false) u.gcdAt = t + GLOBAL_SPELL_COOLDOWN_MS / 1000;
      this.apply(u, s);
    };
    const team = this.units.filter((x) => x.alive);
    if (mode !== "offense") {
      const shield = f.spells.find((s) => s.condition?.id === "manashield");
      if (shield && fighting && t >= u.shieldUntil && ready(shield)) return cast(shield);
      let heal: SpellDef | undefined, healEff = 0;
      for (const s of f.spells) {
        if (!s.heal || (s.target !== "self" && s.target !== "party") || !ready(s)) continue;
        const amount = formula(s.heal, f.L, f.ml);
        const targets = s.target === "party" ? team : [u];
        const eff = targets.reduce((sum, x) => sum + Math.min(x.f.hp - x.hp, amount), 0);
        const urgent = targets.some((x) => x.hp < LOW_HP * x.f.hp);
        if ((eff >= amount || (urgent && eff > 0)) && eff > healEff) { heal = s; healEff = eff; }
      }
      if (heal) return cast(heal);
      if (fighting) {
        let guard: SpellDef | undefined;
        for (const s of f.spells) {
          const c = s.condition;
          if (c?.id !== "protect" || !ready(s) || (t < u.protectUntil && u.protect >= (c.value ?? 0))) continue;
          if (!guard || (c.value ?? 0) > (guard.condition!.value ?? 0)) guard = s;
        }
        if (guard) return cast(guard);
      }
      const regen = f.spells.find((s) => s.condition?.id === "regen" && s.target === "party");
      if (regen && ready(regen)) {
        const total = (regen.condition!.value ?? 0) * (regen.condition!.durationMs / 1000);
        if (team.some((x) => x.f.hp - x.hp >= total && t >= x.hotUntil)) return cast(regen);
      }
    }
    const foe = this.focus;
    if (mode === "defense" || !foe) return;
    // No Coliseu guarda mana para uma Cura (o mago com escudo, uma parte do pool, que é vida).
    const reserve = mode !== "mixed" ? 0 : hasManaShield(f) ? SHIELD_MANA_RESERVE * f.mana : spellMana(SPELLS.light_heal!, f.L);
    const berserk = f.spells.find((s) => s.condition?.id === "berserk");
    if (berserk && t >= u.berserkUntil && ready(berserk, reserve)) return cast(berserk);
    const expose = f.spells.find((s) => s.condition?.id === "exposed");
    if (expose && t >= foe.exposedUntil && ready(expose, reserve)) return cast(expose);
    let best: SpellDef | undefined, bestDmg = 0;
    for (const s of f.spells) {
      if (!s.damage || !ready(s, reserve)) continue;
      const d = this.targetsOf(s).reduce((sum, m) => sum + this.spellHit(u, s, m) + this.dotValue(s, m), 0);
      if (d > bestDmg) { best = s; bestDmg = d; }
    }
    if (best) cast(best);
  }

  private targetsOf(s: SpellDef): Foe[] {
    return this.foes.slice(0, AREA_CAP[s.target] ?? 1);
  }

  private dealtMult(u: Unit): number { return this.t < u.berserkUntil ? 1 + u.berserk / 100 : 1; }
  private exposedPct(m: Foe): number { return this.t < m.exposedUntil ? m.exposed : 0; }

  /** Dano médio de uma magia num monstro: fórmula com a potência, Fúria, armadura (meia contra elemento) e resistência. */
  private spellHit(u: Unit, s: SpellDef, m: Foe): number {
    const raw = formula(s.damage!, u.f.L, u.f.power) * this.dealtMult(u);
    return mitigateSpell(raw, m.def.armor, s.damage!.kind) * damageTakenMult(m.def, s.damage!.kind, this.exposedPct(m));
  }

  /** Dano contínuo que a magia ainda acrescenta no monstro (0 se ele já tem um igual ou mais forte). */
  private dotValue(s: SpellDef, m: Foe): number {
    const c = s.condition, kind = c ? DOT_KIND[c.id] : undefined;
    if (!c || !kind) return 0;
    const cur = m.dots.get(c.id);
    if (cur && cur.until > this.t && cur.value >= (c.value ?? 0)) return 0;
    return (c.value ?? 0) * Math.floor(c.durationMs / DOT_INTERVAL_MS) * damageTakenMult(m.def, kind, this.exposedPct(m));
  }

  private apply(u: Unit, s: SpellDef): void {
    const t = this.t, c = s.condition;
    const team = this.units.filter((x) => x.alive);
    const allies = s.target === "party" ? team : [u];
    if (s.damage) {
      for (const m of this.targetsOf(s)) {
        this.hurt(m, this.spellHit(u, s, m), u);
        const kind = c ? DOT_KIND[c.id] : undefined;
        if (c && kind) {
          // Como o ConditionSystem: não rebaixa um mais forte ativo; renovar mantém o relógio dos tiques.
          const cur = m.dots.get(c.id);
          if (!(cur && cur.until > t && cur.value > (c.value ?? 0))) {
            m.dots.set(c.id, { kind, value: c.value ?? 0, until: t + c.durationMs / 1000, at: cur ? cur.at : t + DOT_INTERVAL_MS / 1000, owner: u });
          }
        }
      }
    }
    if (s.heal) for (const x of allies) x.hp = Math.min(x.f.hp, x.hp + formula(s.heal, u.f.L, u.f.ml));
    if (!c) return;
    const until = t + c.durationMs / 1000, value = c.value ?? 0;
    if (c.id === "manashield") u.shieldUntil = until;
    else if (c.id === "berserk") { u.berserk = value; u.berserkUntil = until; }
    else if (c.id === "exposed" && this.focus) { this.focus.exposed = value; this.focus.exposedUntil = until; }
    else if (c.id === "protect") {
      for (const x of allies) if (!(t < x.protectUntil && x.protect > value)) { x.protect = value; x.protectUntil = until; }
    } else if (c.id === "regen") {
      for (const x of allies) {
        if (t < x.hotUntil && x.hot > value) continue;
        x.hotAt = t < x.hotUntil ? x.hotAt : t + REGEN_TICK_MS / 1000;
        x.hot = value;
        x.hotUntil = until;
      }
    }
  }

  private hurt(m: Foe, amount: number, by: Unit): void {
    const dealt = m.immortal ? amount : Math.min(Math.max(0, m.hp), amount);
    if (!m.immortal) m.hp -= amount;
    by.dealt += dealt;
  }

  private tickDots(): void {
    for (const m of this.foes) {
      for (const [id, d] of m.dots) {
        if (d.at <= d.until && this.t >= d.at) {
          d.at += DOT_INTERVAL_MS / 1000;
          if (m.immortal || m.hp > 0) this.hurt(m, d.value * damageTakenMult(m.def, d.kind, this.exposedPct(m)), d.owner);
        }
        if (this.t >= d.until) m.dots.delete(id);
      }
    }
  }

  private foesAttack(): void {
    for (const m of this.foes) {
      if (m.passive || (!m.immortal && m.hp <= 0) || this.t < m.attackAt) continue;
      m.attackAt += m.def.attackMs / 1000;
      const ability = m.def.abilities?.find((a) => a.damage && this.t >= (m.abilityAt.get(a.id) ?? 0));
      if (ability) m.abilityAt.set(ability.id, this.t + ability.cooldownMs / 1000);
      for (const [u, w] of this.targets()) this.takeHit(u, w * monsterHit(m.def, m.dmgMult, u.f.armor, ability));
    }
  }

  /**
   * Quem leva cada golpe (e com que peso). Sozinho, ele. No grupo, conforme `SimOptions.targeting`:
   * - "spread" (padrão, a mesma hipótese do modelo do ciclo 8): o golpe cai em média em quem aguenta mais, dividido na
   *   proporção da vida máxima — sem o azar de um golpe grande pegar justo o mago sem escudo;
   * - "front": como a IA (ai.ts), o monstro pega o mais perto e fica nele até ele cair; cada um fica à distância do
   *   próprio ataque (cavaleiro colado, magos a 4, paladino a 6), então quem está na frente segura tudo.
   */
  private targets(): [Unit, number][] {
    const alive = this.units.filter((u) => u.alive);
    if (alive.length <= 1 || this.targeting === "front") {
      const u = alive.length <= 1 ? alive[0] : this.front.find((x) => x.alive);
      return u ? [[u, 1]] : [];
    }
    const total = alive.reduce((s, u) => s + u.f.hp, 0);
    return alive.map((u) => [u, u.f.hp / total]);
  }

  /** Golpe no jogador (já depois da armadura): proteção (−%), escudo de mana (manaShieldSplit), vida. */
  private takeHit(u: Unit, amount: number): void {
    let left = amount;
    if (this.t < u.protectUntil) left *= 1 - Math.min(100, u.protect) / 100;
    if (this.shielded(u)) {
      const s = manaShieldSplit(left, u.mana, this.absorb);
      u.mana -= s.fromMana;
      left = s.fromHp;
    }
    u.hp -= left;
    if (u.hp <= 0) { u.hp = 0; u.alive = false; }
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Medidas
// ---------------------------------------------------------------------------------------------------------------------

/** Levels da medida por vocação e o pacote de referência de cada faixa (monstros da faixa, elementos misturados). */
export const BALANCE_LEVELS = [30, 60, 100] as const;
export const BALANCE_PACKS: Record<(typeof BALANCE_LEVELS)[number], readonly string[]> = {
  30: ["tarantula", "pirate_marauder", "ghost"],
  60: ["bonelord", "ice_witch", "black_knight"],
  100: ["demon", "behemoth", "hellhound"],
};
/** Janela da medida de dano (s). */
export const DPS_WINDOW_S = 60;
/**
 * Sobrevivência = a pressão que ele aguenta: o maior multiplicador k do dano do pacote com que ele passa
 * SURVIVAL_WINDOW_S vivo, de vida e mana cheias, só se defendendo. "Tempo até morrer" contra o pacote fixo virava um
 * degrau (quem cura mais que o pacote bate não morre nunca; quem cura menos morre em segundos) e, com o escudo de mana
 * de 20 s e recarga de 30 s, pulava de 30 em 30 s conforme a morte caía num buraco do escudo ou no seguinte. O k anda
 * liso com a vida, a armadura, a cura e o escudo, e um minuto pega um buraco do escudo inteiro (20–30 s) e o começo
 * do segundo (50–60 s).
 */
export const SURVIVAL_WINDOW_S = 60;

export interface Measure {
  /** Dano por segundo no pacote (todas as magias e o ataque automático; mana das poções; ninguém batendo nele). */
  dps: number;
  /** Pressão aguentada: × o dano do pacote por SURVIVAL_WINDOW_S (escudo, curas, poções, proteções). */
  survival: number;
  /** P = dps × sobrevivência. */
  p: number;
  /** Dano por segundo que o pacote (×1) causa nele: depois da armadura, antes de proteção e escudo. */
  incoming: number;
  ehp: number;
}

const packDefs = (pack: readonly string[]) => pack.map((id) => monsterDef(id)!);

/** Dano por segundo no pacote em DPS_WINDOW_S, sem ninguém batendo nele (o pacote não morre). */
export function packDps(f: Fighter, pack: readonly string[], o: SimOptions = {}): number {
  const b = new Battle([f], o);
  b.setFoes(packDefs(pack).map((def) => ({ def, immortal: true, passive: true })));
  b.run("offense", DPS_WINDOW_S);
  return b.dealt / DPS_WINDOW_S;
}

/** Passa SURVIVAL_WINDOW_S vivo, só se defendendo, contra o pacote com o dano × k? */
export function survives(f: Fighter, pack: readonly string[], k: number, o: SimOptions = {}): boolean {
  const b = new Battle([f], o);
  b.setFoes(packDefs(pack).map((def) => ({ def, dmgMult: k, immortal: true })));
  return b.run("defense", SURVIVAL_WINDOW_S) !== "wiped";
}

/** Passo da grade de k (×) e quantas mortes seguidas encerram a busca. */
const K_STEP = 1.025, K_MISSES = 10;

/**
 * Pressão aguentada: a soma dos trechos de k (grade de 2,5%) em que `survives`. Com a borda limpa é o limiar; perto
 * dela há buracos e ilhas (a morte depende de em que momento os golpes, as poções e o buraco do escudo se cruzam) e
 * uma busca binária caía em qualquer um deles — somando, eles se compensam. Abaixo de 0,25× todo mundo passa.
 */
export function packSurvival(f: Fighter, pack: readonly string[], o: SimOptions = {}): number {
  let area = 0.25, misses = 0;
  for (let k = 0.25; misses < K_MISSES && k < 1000; k *= K_STEP) {
    if (survives(f, pack, k, o)) { area += k * (K_STEP - 1); misses = 0; } else misses++;
  }
  return area;
}

export function measure(f: Fighter, pack: readonly string[], o: SimOptions = {}): Measure {
  const dps = packDps(f, pack, o), survival = packSurvival(f, pack, o);
  return {
    dps, survival, p: dps * survival,
    incoming: pack.reduce((s, id) => s + monsterDps({ defId: id }, f.armor), 0),
    ehp: effectiveHp(f, o.absorb),
  };
}

/** Teto de uma onda do Coliseu (s): quem não limpa nesse tempo, cai. */
export const ARENA_WAVE_CAP_S = 600;

/** Coliseu com o time: a onda em que o time cai (0 = venceu as ARENA_MAX_WAVE). */
export function arenaRun(team: readonly Fighter[], o: SimOptions = {}): number {
  const avg = team.reduce((s, f) => s + f.L, 0) / team.length;
  const b = new Battle(team, o);
  for (let w = 1; w <= ARENA_MAX_WAVE; w++) {
    b.setFoes(arenaWaveSpawns(w, team.length, avg).map((s) => ({ def: monsterDef(s.defId)!, hpMult: s.hpMult, dmgMult: s.dmgMult })));
    if (b.run("mixed", ARENA_WAVE_CAP_S) !== "won") return w;
    b.arenaPause(w);
  }
  return 0;
}

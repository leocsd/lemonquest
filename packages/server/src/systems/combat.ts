// Combate estilo Tibia: alvo + ataque automático a cada PLAYER_ATTACK_MS; dano de monstros; XP, level e morte.
import {
  ELITE, PLAYER_ATTACK_MS, OUT_OF_COMBAT_MS, S2C, VOCATION_ATTACK, baseStats, critChance, deathPenalty, levelForXp, mitigate, shieldArmorBonus,
  applyXpStage, autoAttackRange, damageTakenMult, rollAttack, rollInt, splitXp, xpForLevel, xpStage,
  type AttackMsg, type ItemDef, type SkillId, type CombatEvent, type CombatMsg, type CreatureDiedMsg, type DiedMsg, type LevelUpMsg,
  type DamageKind, type ImbuementDef, type NoticeMsg, type XpGainMsg,
} from "@lemonquest/shared";
import type { PlayerState } from "../state.ts";
import { cheb, isMonsterState, killCredit, type CreatureState, type Monster, type MonsterManager } from "./monsters.ts";

/** Alvo mais longe que isso (fora da tela) é descartado. */
export const TARGET_MAX_DIST = 12;
/** Level a partir do qual o level up é anunciado para todos. */
export const LEVEL_NOTICE_MIN = 5;
/** Intervalo mínimo entre duas tentativas da skill Escudo (o ataque automático do jogador também é a cada 2 s). */
export const SHIELD_TRY_MS = 2000;

/** Armadura do jogador sem equipamento (o M4 soma a dos itens via CombatHooks.armor). */
export function playerArmor(_p: PlayerState): number {
  return 0;
}

/** Ataque automático efetivo do jogador (arma ou desarmado). */
export interface AttackProfile {
  range: number;
  kind: DamageKind;
  ranged: boolean;
  damage: [number, number];
  /** Chance de crítico 0–1. */
  critPct: number;
}

const SKILL_FIELD = { melee: "skillMelee", distance: "skillDistance", magic: "magicLevel", shield: "skillShield" } as const;

/** Valor treinado de uma skill no PlayerState (undefined em jogadores de teste sem skills). */
export function skillValue(p: PlayerState, s: SkillId): number | undefined {
  const v = (p as unknown as Record<string, number | undefined>)[SKILL_FIELD[s]];
  return Number.isFinite(v) ? v : undefined;
}

export type BonusLookup = (s: "melee" | "distance" | "magic" | "shield" | "crit" | "attack") => number;

/**
 * Perfil do ataque automático. Dano: autoAttackRange (shared — a mesma conta do balão do item no cliente).
 * Com arma, range/damageKind da arma sobrepõem os da vocação.
 * `bonus(stat)` = soma dos atributos do equipamento (skills, crit, attack).
 */
export function attackProfile(p: PlayerState, weapon?: ItemDef, bonus: BonusLookup = () => 0): AttackProfile {
  const va = VOCATION_ATTACK[p.vocation] ?? VOCATION_ATTACK.knight;
  const critPct = critChance(p.vocation, bonus("crit"));
  const skills = { melee: skillValue(p, "melee"), distance: skillValue(p, "distance"), magic: skillValue(p, "magic") };
  const damage = autoAttackRange(p.vocation, p.level, skills, weapon, bonus);
  if (!weapon) return { range: va.range, kind: va.kind, ranged: va.ranged, damage, critPct };
  const range = Math.max(1, weapon.range ?? va.range);
  return { range, kind: weapon.damageKind ?? va.kind, ranged: range > 1, damage, critPct };
}

/** Valor da skill que conta no ataque básico (undefined = multiplicador 1, ex.: jogadores de teste sem skills). */
export function attackSkillValue(p: PlayerState): number | undefined {
  return p.vocation === "knight" ? p.skillMelee : p.vocation === "paladin" ? p.skillDistance : p.magicLevel;
}

/** Ganchos plugados por outros sistemas (condições, skills, invocações). Todos opcionais. */
export interface CombatHooks {
  /** Redução de dano recebido em % (protect). */
  damageTakenPct?: (id: string) => number;
  /** Escudo de mana ativo: o dano consome mana antes da vida. */
  manaShield?: (id: string) => boolean;
  /** Cada tentativa de ataque básico do jogador (skill de arma). */
  onAutoAttack?: (p: PlayerState) => void;
  /** Está com escudo equipado (armadura da skill Escudo e treino dela). Ausente = nunca. */
  hasShield?: (p: PlayerState) => boolean;
  /**
   * Uma tentativa de skill Escudo: o jogador, com escudo equipado, foi alvo de um golpe (corpo a corpo, distância ou
   * magia de monstro/jogador; venenos e queimaduras não contam).
   */
  onShieldTry?: (p: PlayerState) => void;
  /** Jogador morreu (já foi levado ao templo). */
  onPlayerDied?: (p: PlayerState, killerName: string) => void;
  /** Armadura total (equipamento). Ausente = playerArmor(p). */
  armor?: (p: PlayerState) => number;
  /** Perfil do ataque automático (arma). Ausente = attackProfile(p). */
  attack?: (p: PlayerState) => AttackProfile;
  /** Multiplicador do dano causado (postura). */
  dealtMult?: (p: PlayerState) => number;
  /** Encantamento ativo do jogador (Dona Marta). Só aplicado no ataque automático contra monstro selvagem (PvE). */
  imbuement?: (p: PlayerState) => ImbuementDef | undefined;
  /** Multiplicador do dano recebido (postura). */
  takenMult?: (p: PlayerState) => number;
  /** Subiu de level (maxHp/maxMana/hp/mana já na base; o hook pode somar o equipamento). */
  onLevelUp?: (p: PlayerState) => void;
  /** Monstro selvagem morto (antes de sair da lista; damageBy intacto) — loot. */
  onMonsterKilled?: (m: Monster) => void;
  /** Um jogador teve parte no abate de um monstro (todos que causaram dano, inclusive no coliseu); `shared` = mais de um jogador. */
  onKillCredit?: (playerId: string, m: Monster, shared: boolean) => void;
  /**
   * Antes da morte normal (penalidade + templo): retorna true se outro sistema assumiu a morte (coliseu: sem
   * penalidade; ele mesmo teletransporta e restaura). Alvos/combate já foram limpos.
   */
  interceptDeath?: (p: PlayerState, killerName: string) => boolean;
  /** Ajusta a XP de um abate (XP compartilhada do grupo). Recebe as partes pelo dano; retorna as partes finais. */
  xpShares?: (m: Monster, shares: Map<string, number>, now: number) => Map<string, number>;
  /** Multiplicador da XP de abates (evento com bônus). Ausente = 1. */
  xpMult?: () => number;
  /** Jogador participou do combate agora (deu dano num monstro selvagem ou curou outro jogador). */
  onActivity?: (playerId: string, now: number) => void;
  /** PvP: motivo pelo qual `a` não pode atacar o jogador `b` (null = pode). Ausente = sem PvP. */
  canAttackPlayer?: (a: PlayerState, b: PlayerState) => string | null;
  /** PvP: `a` vai causar dano a `b` (caveiras, bloqueio de PZ). */
  onPlayerHit?: (a: PlayerState, b: PlayerState, now: number) => void;
  /** Jogador vai morrer (ainda no lugar da morte, antes da penalidade). `killer` = jogador que matou, se for PvP. */
  onDying?: (p: PlayerState, killer: PlayerState | undefined, now: number) => void;
  /** Multiplicador da XP perdida na morte (caveira vermelha). Ausente = 1. */
  deathXpMult?: (p: PlayerState) => number;
}

export interface CombatOptions {
  monsters: MonsterManager;
  players: () => Iterable<PlayerState>;
  getPlayer: (id: string) => PlayerState | undefined;
  /** Teleporte (MovementSystem.teleport) — usado na morte. */
  teleport: (p: PlayerState, x: number, y: number) => void;
  spawn: { x: number; y: number };
  send: (sessionId: string, type: string, msg: unknown) => void;
  broadcast: (type: string, msg: unknown) => void;
  rng?: () => number;
  /** Relógio (curas não recebem `now`). Padrão Date.now. */
  now?: () => number;
}

export class CombatSystem {
  private events: CombatEvent[] = [];
  /** Mensagens que devem sair DEPOIS do lote de combate do tick (morte, XP...). */
  private after: (() => void)[] = [];
  private readonly nextAttackAt = new Map<string, number>();
  private readonly lastCombatAt = new Map<string, number>();
  private readonly nextShieldTryAt = new Map<string, number>();
  private readonly rng: () => number;
  hooks: CombatHooks = {};

  constructor(private readonly o: CombatOptions) {
    this.rng = o.rng ?? Math.random;
    o.monsters.attackHook = (m, p, now) => this.monsterAttack(m, p, now);
  }

  /** C2S.Attack: define/limpa o alvo. */
  onAttack(p: PlayerState, msg: AttackMsg): void {
    if (!msg || typeof msg !== "object") return;
    const id = msg.targetId;
    if (id === null || id === "") { p.targetId = ""; return; }
    if (typeof id !== "string") return;
    const victim = id !== p.id ? this.o.getPlayer(id) : undefined;
    if (victim) {
      if (cheb(p.x, p.y, victim.x, victim.y) > TARGET_MAX_DIST) return;
      const why = this.hooks.canAttackPlayer ? this.hooks.canAttackPlayer(p, victim) : "Você não pode atacar outros jogadores.";
      if (why) {
        p.targetId = "";
        this.o.send(p.id, S2C.Notice, { text: why, kind: "warn" } satisfies NoticeMsg);
        return;
      }
      p.targetId = id;
      return;
    }
    const m = this.o.monsters.wild(id);
    if (!m || cheb(p.x, p.y, m.s.x, m.s.y) > TARGET_MAX_DIST) return;
    // Na zona de proteção só se pode atacar bonecos de treino (invulneráveis).
    if (!m.def.invulnerable && (this.o.monsters.inPz(p.x, p.y) || this.o.monsters.inPz(m.s.x, m.s.y))) {
      p.targetId = "";
      this.o.send(p.id, S2C.Notice, { text: "Você não pode atacar em zona de proteção.", kind: "warn" } satisfies NoticeMsg);
      return;
    }
    p.targetId = id;
  }

  /** Perfil do ataque automático atual do jogador (alcance, tipo, dano). */
  attackOf(p: PlayerState): AttackProfile {
    return this.hooks.attack?.(p) ?? attackProfile(p);
  }

  /** Armadura efetiva do jogador: equipamento + skill Escudo (só com escudo equipado). */
  armorOf(p: PlayerState): number {
    const base = this.hooks.armor?.(p) ?? playerArmor(p);
    return this.hooks.hasShield?.(p) ? base + shieldArmorBonus(p.skillShield ?? 10) : base;
  }

  /**
   * Golpe contra o jogador (antes do dano): com escudo equipado, conta uma tentativa da skill Escudo — no máximo uma a
   * cada SHIELD_TRY_MS. Golpe de monstro só conta se o monstro tiver level ≥ 1/3 do jogador ou o golpe (`raw`, antes
   * da armadura) passar da armadura: sem isso, 5 ratos com dano zerado davam ~150 tentativas/min parado (~40× a
   * estátua). PvP (`monsterLevel` ausente): só o limite de tempo.
   */
  shieldTry(p: PlayerState, now: number, o: { monsterLevel?: number; raw?: number } = {}): void {
    if (!this.hooks.hasShield?.(p)) return;
    if (o.monsterLevel !== undefined && o.monsterLevel * 3 < p.level && !((o.raw ?? 0) > this.armorOf(p))) return;
    if (now < (this.nextShieldTryAt.get(p.id) ?? 0)) return;
    this.nextShieldTryAt.set(p.id, now + SHIELD_TRY_MS);
    this.hooks.onShieldTry?.(p);
  }

  /** Agenda algo para depois do lote de combate do tick (mensagens de loot etc.). */
  later(fn: () => void): void {
    this.after.push(fn);
  }

  /** Fora de combate = sem dar/receber dano há OUT_OF_COMBAT_MS. */
  inCombat(playerId: string, now: number): boolean {
    const t = this.lastCombatAt.get(playerId);
    return t !== undefined && now - t < OUT_OF_COMBAT_MS;
  }

  /** Marca o jogador como em combate agora. */
  markCombat(id: string, now: number): void {
    if (id && this.o.getPlayer(id)) this.lastCombatAt.set(id, now);
  }

  removePlayer(id: string): void {
    this.nextAttackAt.delete(id);
    this.lastCombatAt.delete(id);
    this.nextShieldTryAt.delete(id);
    this.o.monsters.clearTargetsOf(id);
  }

  /** Ataques automáticos dos jogadores. */
  tick(now: number): void {
    for (const p of this.o.players()) {
      if (!p.targetId) continue;
      const victim = this.o.getPlayer(p.targetId);
      if (victim) { this.attackPlayer(p, victim, now); continue; }
      const m = this.o.monsters.wild(p.targetId);
      if (!m || (!m.def.invulnerable && this.o.monsters.inPz(p.x, p.y))) { p.targetId = ""; continue; }
      const d = cheb(p.x, p.y, m.s.x, m.s.y);
      if (d > TARGET_MAX_DIST) { p.targetId = ""; continue; }
      const va = this.attackOf(p);
      if (d < 1 || d > va.range || now < (this.nextAttackAt.get(p.id) ?? 0)) continue;
      // Ataque à distância (arco, varinha...) exige linha de visão; sem ela não ataca (a perseguição reposiciona).
      if (va.ranged && !this.o.monsters.los(p.x, p.y, m.s.x, m.s.y)) continue;
      const imb = this.hooks.imbuement?.(p);
      this.nextAttackAt.set(p.id, now + Math.round(PLAYER_ATTACK_MS * (imb?.effect === "haste" ? 1 - imb.value : 1)));
      this.lastCombatAt.set(p.id, now);
      this.hooks.onAutoAttack?.(p);
      const roll = rollAttack(va.damage, va.critPct, this.rng);
      const raw = Math.round(roll.amount * (this.hooks.dealtMult?.(p) ?? 1));
      const armor = Math.round(m.def.armor * (imb?.effect === "pierce" ? 1 - imb.value : 1));
      const amount = roll.miss ? 0 : mitigate(raw, armor);
      const dealt = this.damageMonster(m, p.id, amount, va.kind, now, { crit: roll.crit, ranged: va.ranged });
      if (dealt > 0 && imb?.effect === "lifesteal") p.hp = Math.min(p.maxHp, p.hp + Math.round(dealt * imb.value));
      if (dealt > 0 && imb?.effect === "manasteal") p.mana = Math.min(p.maxMana, p.mana + Math.round(dealt * imb.value));
    }
  }

  /** Ataque automático contra outro jogador (PvP). */
  private attackPlayer(p: PlayerState, victim: PlayerState, now: number): void {
    const d = cheb(p.x, p.y, victim.x, victim.y);
    if (d > TARGET_MAX_DIST || p.hp <= 0 || !this.hooks.canAttackPlayer || this.hooks.canAttackPlayer(p, victim)) { p.targetId = ""; return; }
    const va = this.attackOf(p);
    if (d < 1 || d > va.range || now < (this.nextAttackAt.get(p.id) ?? 0)) return;
    if (va.ranged && !this.o.monsters.los(p.x, p.y, victim.x, victim.y)) return;
    this.nextAttackAt.set(p.id, now + PLAYER_ATTACK_MS);
    this.lastCombatAt.set(p.id, now);
    this.hooks.onAutoAttack?.(p);
    const roll = rollAttack(va.damage, va.critPct, this.rng);
    const raw = Math.round(roll.amount * (this.hooks.dealtMult?.(p) ?? 1));
    const amount = roll.miss ? 0 : mitigate(raw, this.armorOf(victim));
    this.hitPlayer(p, victim, amount, va.kind, now, { ranged: va.ranged });
  }

  /** Dano de jogador em jogador (ataque básico ou magia): caveiras/bloqueio de PZ e depois o dano. */
  hitPlayer(p: PlayerState, victim: PlayerState, amount: number, kind: DamageKind, now: number, o: { ranged?: boolean } = {}): number {
    this.hooks.onPlayerHit?.(p, victim, now);
    this.lastCombatAt.set(p.id, now);
    this.shieldTry(victim, now);
    return this.damagePlayer(victim, p.id, amount, kind, now, { ranged: o.ranged, killerName: p.name, killerId: p.id });
  }

  /**
   * Aplica dano (já mitigado) a um monstro (selvagem ou invocação): evento, revide, crédito de XP e morte.
   * `creditId` = quem leva o crédito de XP (padrão: sourceId; "" = ninguém). Retorna o dano efetivo.
   */
  damageMonster(m: Monster, sourceId: string, amount: number, kind: DamageKind, now: number,
    o: { creditId?: string; crit?: boolean; ranged?: boolean } = {}): number {
    if (m.s.hp <= 0 || this.o.monsters.get(m.s.id) !== m) return 0;
    // Resistência elemental: o próprio elemento entra pela metade (shared damageTakenMult). Ponto único: magia,
    // ataque automático, habilidade e invocação passam por aqui.
    amount *= damageTakenMult(m.def, kind);
    if (m.def.invulnerable) {
      // Boneco de treino: mostra o dano (e marca combate), mas a vida não muda, ninguém ganha XP/loot nem ele revida.
      const shown = Math.max(0, Math.round(amount));
      this.push({
        sourceId, targetId: m.s.id, amount: shown, kind,
        crit: o.crit && shown > 0 ? true : undefined,
        miss: shown === 0 ? true : undefined,
        ranged: o.ranged ? true : undefined,
      });
      this.markCombat(o.creditId ?? sourceId, now);
      // Dano "mostrado", não causado: quem chama (dreno de vida/mana do encantamento) não pode se curar com ele.
      return 0;
    }
    const dealt = Math.min(m.s.hp, Math.max(0, Math.round(amount)));
    const credit = o.creditId ?? sourceId;
    this.push({
      sourceId, targetId: m.s.id, amount: dealt, kind,
      crit: o.crit && dealt > 0 ? true : undefined,
      miss: dealt === 0 ? true : undefined,
      ranged: o.ranged ? true : undefined,
    });
    this.markCombat(credit, now);
    if (credit && this.o.getPlayer(credit)) this.hooks.onActivity?.(credit, now);
    this.o.monsters.onDamaged(m, sourceId, dealt, now, credit);
    if (dealt > 0) {
      m.s.hp -= dealt;
      if (m.s.hp <= 0) this.killMonster(m, now);
    }
    return dealt;
  }

  /**
   * Aplica dano (já mitigado pela armadura) a um jogador: protect (−%), escudo de mana (mana primeiro), morte.
   * Retorna o dano tirado da vida.
   */
  damagePlayer(p: PlayerState, sourceId: string, amount: number, kind: DamageKind, now: number,
    o: { ranged?: boolean; killerName?: string; killerId?: string } = {}): number {
    if (p.hp <= 0) return 0;
    this.lastCombatAt.set(p.id, now);
    let left = Math.max(0, Math.round(amount * (this.hooks.takenMult?.(p) ?? 1)));
    const red = this.hooks.damageTakenPct?.(p.id) ?? 0;
    if (red > 0 && left > 0) left = Math.max(0, Math.round(left * (1 - Math.min(100, red) / 100)));
    let shielded = false;
    if (left > 0 && p.mana > 0 && this.hooks.manaShield?.(p.id)) {
      const fromMana = Math.min(p.mana, left);
      p.mana -= fromMana;
      left -= fromMana;
      shielded = true;
      this.push({ sourceId, targetId: p.id, amount: fromMana, kind: "mana", ranged: o.ranged ? true : undefined });
    }
    const dealt = Math.min(p.hp, left);
    if (dealt > 0 || !shielded) {
      this.push({
        sourceId, targetId: p.id, amount: dealt, kind,
        miss: dealt === 0 ? true : undefined,
        ranged: o.ranged && !shielded ? true : undefined,
      });
    }
    if (dealt <= 0) return 0;
    p.hp -= dealt;
    if (p.hp <= 0) this.playerDied(p, o.killerName ?? "?", o.killerId ? this.o.getPlayer(o.killerId) : undefined, now);
    return dealt;
  }

  /** Cura um jogador (evento kind "heal", targetId = curado). Retorna o quanto curou de fato. */
  healPlayer(p: PlayerState, sourceId: string, amount: number): number {
    if (p.hp <= 0) return 0;
    const healed = Math.max(0, Math.min(p.maxHp - p.hp, Math.round(amount)));
    p.hp += healed;
    this.push({ sourceId, targetId: p.id, amount: healed, kind: "heal" });
    if (healed > 0 && sourceId && sourceId !== p.id && this.o.getPlayer(sourceId)) this.hooks.onActivity?.(sourceId, (this.o.now ?? Date.now)());
    return healed;
  }

  /** Restaura mana (poção): evento kind "mana" com sourceId === targetId. Retorna o quanto recuperou. */
  restoreMana(p: PlayerState, amount: number): number {
    if (p.hp <= 0) return 0;
    const got = Math.max(0, Math.min(p.maxMana - p.mana, Math.round(amount)));
    p.mana += got;
    this.push({ sourceId: p.id, targetId: p.id, amount: got, kind: "mana" });
    return got;
  }

  /** Um monstro ataca um jogador ou uma invocação (chamado pela IA). */
  monsterAttack(m: Monster, target: CreatureState, now: number): void {
    const ranged = m.def.attackRange > 1;
    if (isMonsterState(target)) {
      const sm = this.o.monsters.get(target.id);
      if (!sm || sm.s.hp <= 0) return;
      const raw = Math.round(rollInt(m.def.damage[0], m.def.damage[1], this.rng) * (m.dmgMult ?? 1));
      // Invocação morta não dá XP a ninguém (creditId "").
      this.damageMonster(sm, m.s.id, mitigate(raw, sm.def.armor), m.def.damageKind, now, { creditId: "", ranged });
      return;
    }
    const p = target;
    if (p.hp <= 0 || this.o.monsters.inPz(p.x, p.y)) return;
    const raw = Math.round(rollInt(m.def.damage[0], m.def.damage[1], this.rng) * (m.dmgMult ?? 1));
    this.shieldTry(p, now, { monsterLevel: m.def.level, raw });
    const taken = this.damagePlayer(p, m.s.id, mitigate(raw, this.armorOf(p)), m.def.damageKind, now, { ranged, killerName: m.def.name });
    const imb = this.hooks.imbuement?.(p);
    if (imb?.effect === "thorns" && taken > 0 && m.s.hp > 0) this.damageMonster(m, p.id, Math.round(taken * imb.value), "physical", now, { creditId: p.id });
  }

  /** Envia o lote de eventos do tick (se houver) e depois as mensagens pendentes. */
  flush(): void {
    if (this.events.length) {
      this.o.broadcast(S2C.Combat, { events: this.events } satisfies CombatMsg);
      this.events = [];
    }
    const after = this.after;
    this.after = [];
    for (const fn of after) fn();
  }

  /** Eventos ainda não enviados (testes). */
  get pending(): readonly CombatEvent[] { return this.events; }

  private push(e: CombatEvent) {
    for (const k of Object.keys(e) as (keyof CombatEvent)[]) if (e[k] === undefined) delete e[k];
    this.events.push(e);
  }

  private killMonster(m: Monster, now: number) {
    const { id, x, y, defId } = m.s;
    // Invocações, monstros do coliseu (recompensa por onda) e ajudantes invocados por monstros não dão XP por abate;
    // os ajudantes também não dão loot, missão nem conquista (senão dava para "farmar" um invocador).
    const online = m.s.ownerId || m.arenaId || m.minionOf ? [] : killCredit(m, this.o.getPlayer);
    const byDamage = splitXp(m.elite ? m.def.xp * ELITE.xp : m.def.xp, online);
    const shares = this.hooks.xpShares && byDamage.size ? this.hooks.xpShares(m, byDamage, now) : byDamage;
    const rewards = !m.s.ownerId && !m.minionOf;
    if (rewards) this.hooks.onMonsterKilled?.(m);
    if (rewards && this.hooks.onKillCredit) {
      // Mesma regra da XP/loot: quem bateu e foi para longe não conta (conquistas de abate; o Coliseu também conta).
      const credited = killCredit(m, this.o.getPlayer).map(([pid]) => pid);
      for (const pid of credited) this.hooks.onKillCredit(pid, m, credited.length > 1);
    }
    this.o.monsters.kill(m, now);
    for (const p of this.o.players()) if (p.targetId === id) p.targetId = "";
    this.after.push(() => this.o.broadcast(S2C.CreatureDied, { id, x, y, defId } satisfies CreatureDiedMsg));
    const mult = Math.max(1, this.hooks.xpMult?.() ?? 1);
    for (const [pid, amount] of shares) {
      const p = this.o.getPlayer(pid);
      if (p) this.gainXp(p, applyXpStage(mult > 1 ? Math.round(amount * mult) : amount, p.level), x, y);
    }
  }

  /** Dá XP e processa level ups (vários de uma vez, se for o caso). */
  gainXp(p: PlayerState, amount: number, x: number, y: number): void {
    p.xp += amount;
    const id = p.id;
    this.after.push(() => this.o.send(id, S2C.XpGain, { amount, x, y } satisfies XpGainMsg));
    const level = levelForXp(p.xp);
    if (level <= p.level) return;
    const stage = xpStage(level), stageChanged = stage !== xpStage(p.level);
    p.level = level;
    const stats = baseStats(p.vocation, level);
    p.maxHp = stats.maxHp;
    p.maxMana = stats.maxMana;
    p.hp = stats.maxHp;
    p.mana = stats.maxMana;
    this.hooks.onLevelUp?.(p);
    const name = p.name, maxHp = p.maxHp, maxMana = p.maxMana;
    this.after.push(() => {
      this.o.send(id, S2C.LevelUp, { level, maxHp, maxMana } satisfies LevelUpMsg);
      if (stageChanged) {
        const pct = Math.round(stage.mult * 100);
        this.o.send(id, S2C.Notice, { text: `Novo estágio de XP: a partir do level ${stage.fromLevel}, caçar dá ${pct}% da XP (missões continuam dando tudo).`, kind: "info" } satisfies NoticeMsg);
      }
      if (level >= LEVEL_NOTICE_MIN) this.o.broadcast(S2C.Notice, { text: `${name} chegou ao level ${level}!`, kind: "good" } satisfies NoticeMsg);
    });
  }

  private playerDied(p: PlayerState, killerName: string, killer: PlayerState | undefined, now: number) {
    p.targetId = "";
    // Quem estava mirando o morto perde o alvo (PvP).
    for (const o of this.o.players()) if (o.targetId === p.id) o.targetId = "";
    this.o.monsters.clearTargetsOf(p.id);
    this.lastCombatAt.delete(p.id);
    this.nextAttackAt.delete(p.id);
    if (this.hooks.interceptDeath?.(p, killerName)) return;
    this.hooks.onDying?.(p, killer, now);
    const blessed = p.blessed;
    if (blessed) p.blessed = false;
    const mult = Math.max(1, this.hooks.deathXpMult?.(p) ?? 1);
    const lostXp = blessed ? 0 : Math.max(0, Math.min(p.xp - xpForLevel(p.level), Math.round(deathPenalty(p.level, p.xp) * mult)));
    p.xp -= lostXp;
    this.o.teleport(p, this.o.spawn.x, this.o.spawn.y);
    p.hp = p.maxHp;
    p.mana = p.maxMana;
    this.hooks.onPlayerDied?.(p, killerName);
    const id = p.id, name = p.name;
    this.after.push(() => {
      this.o.send(id, S2C.Died, { lostXp, killerName } satisfies DiedMsg);
      if (blessed) this.o.send(id, S2C.Notice, { text: "Sua bênção te protegeu: nenhuma XP perdida.", kind: "good" } satisfies NoticeMsg);
      this.o.broadcast(S2C.Notice, { text: `${name} foi derrotado por ${killerName}`, kind: "warn" } satisfies NoticeMsg);
    });
  }
}

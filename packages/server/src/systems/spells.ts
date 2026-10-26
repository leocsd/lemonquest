// Magias: validação (vocação, level, vida, mana, cooldowns, alvo/alcance, PZ), gasto de mana, efeitos
// (dano/cura/condição/investida/provocação/invocação), CastResult ao conjurador e SpellCast para todos.
// Os números de dano/cura saem no lote de CombatEvent do CombatSystem.
import {
  DEFAULT_SPELL_RANGE,
  DIR_DELTA, Dir, GLOBAL_SPELL_COOLDOWN_MS, S2C, canStepTerrain, dirFromDelta, evalSpellFormula, mitigateSpell,
  spellByWords, spellDef, spellMana, spellPower,
  type CastFailReason, type CastMsg, type CastResultMsg, type CollisionGrid, type SpellCastMsg, type SpellDef,
} from "@lemonquest/shared";
import type { PlayerState } from "../state.ts";
import { attackSkillValue, type CombatSystem } from "./combat.ts";
import type { ConditionSystem } from "./conditions.ts";
import { cheb, type Monster, type MonsterManager } from "./monsters.ts";
import type { Point } from "./pathfinding.ts";
import type { SkillSystem } from "./skills.ts";
import type { SummonSystem } from "./summons.ts";

/** Alcance padrão de magias de alvo sem `range`. */
export { DEFAULT_SPELL_RANGE };
/** Raio padrão de provocação sem `radius`. */
export const DEFAULT_TAUNT_RADIUS = 3;
export const DEFAULT_TAUNT_MS = 5000;

// --- áreas (funções puras) ---------------------------------------------------------

/**
 * Círculo "Chebyshev arredondado" de raio r: dx²+dy² ≤ r²+r (r=1 → 3×3; r=2 → 5×5 sem os cantos).
 * `blocked` (paredes) exclui tiles. Ordem: linha a linha.
 */
export function circleTiles(cx: number, cy: number, r: number, blocked?: (x: number, y: number) => boolean): Point[] {
  const out: Point[] = [];
  const rr = Math.max(0, Math.floor(r));
  for (let dy = -rr; dy <= rr; dy++)
    for (let dx = -rr; dx <= rr; dx++)
      if (dx * dx + dy * dy <= rr * rr + rr && !blocked?.(cx + dx, cy + dy)) out.push({ x: cx + dx, y: cy + dy });
  return out;
}

/** Direção ortogonal da onda (diagonais usam o lado horizontal, como a face do sprite). */
export function waveDir(dir: Dir): Dir {
  if (dir === Dir.NE || dir === Dir.SE) return Dir.E;
  if (dir === Dir.NW || dir === Dir.SW) return Dir.W;
  return dir;
}

/** Meia-largura da onda no passo i (1..length): cresce de 0 até (width-1)/2; `rect` = sempre a máxima. */
function waveHalf(i: number, length: number, width: number, rect = false): number {
  const max = Math.max(0, Math.floor((Math.max(1, width) - 1) / 2));
  return length <= 1 || rect ? max : Math.round((max * (i - 1)) / (length - 1));
}

/**
 * Cone à frente de (x,y): `length` tiles, alargando até `width`. Paredes param cada "raio" (coluna lateral);
 * colunas que se abrem atrás de um raio bloqueado também ficam bloqueadas. `rect` = retângulo `width` × `length`
 * (cada coluna é um raio independente desde a primeira fileira).
 */
export function waveTiles(x: number, y: number, dir: Dir, length: number, width: number,
  blocked?: (x: number, y: number) => boolean, rect = false): Point[] {
  const { dx: fx, dy: fy } = DIR_DELTA[waveDir(dir)];
  const lx = -fy, ly = fx;
  const out: Point[] = [];
  const stopped = new Set<number>();
  let prevHalf = rect ? waveHalf(1, length, width, true) : -1;
  for (let i = 1; i <= Math.max(1, Math.floor(length)); i++) {
    const h = waveHalf(i, length, width, rect);
    for (let o = -h; o <= h; o++) {
      if (stopped.has(o)) continue;
      if (Math.abs(o) > prevHalf && o !== 0 && stopped.has(o - Math.sign(o))) { stopped.add(o); continue; }
      const tx = x + fx * i + lx * o, ty = y + fy * i + ly * o;
      if (blocked?.(tx, ty)) { stopped.add(o); continue; }
      out.push({ x: tx, y: ty });
    }
    prevHalf = Math.max(prevHalf, h);
  }
  return out;
}

const flat = (pts: Point[]) => pts.flatMap((t) => [t.x, t.y]);

// --- sistema -----------------------------------------------------------------------------

export interface SpellSystemOptions {
  grid: CollisionGrid;
  monsters: MonsterManager;
  combat: CombatSystem;
  conditions: ConditionSystem;
  summons: SummonSystem;
  skills?: SkillSystem;
  players: () => Iterable<PlayerState>;
  getPlayer: (id: string) => PlayerState | undefined;
  /** Move o jogador instantaneamente (MovementSystem.teleport) — investida. */
  teleport: (p: PlayerState, x: number, y: number) => void;
  send: (sessionId: string, type: string, msg: unknown) => void;
  broadcast: (type: string, msg: unknown) => void;
  now?: () => number;
  rng?: () => number;
  spells?: (id: string) => SpellDef | undefined;
  /** Bônus de magic level do equipamento (soma à skill treinada nas fórmulas). */
  magicBonus?: (p: PlayerState) => number;
  /**
   * Bônus do equipamento na skill da arma da vocação (melee do cavaleiro, distance do paladino): entra no `spellPower`
   * das magias de dano deles. Ausente = 0.
   */
  weaponSkillBonus?: (p: PlayerState) => number;
  /** Multiplicador do dano causado (postura). */
  dealtMult?: (p: PlayerState) => number;
  /** Tile ocupado por algo além de monstros/jogadores (NPCs, portais) — a investida não para em cima. */
  isBlocked?: (x: number, y: number) => boolean;
  /**
   * Magias de grupo ("party"): quem conta como aliado do conjurador (ele mesmo + membros do grupo). Ausente = todos.
   */
  isAlly?: (caster: PlayerState, other: PlayerState) => boolean;
  /**
   * PvP: magia de área/onda atinge este outro jogador? (só quem já é alvo "justo": o alvo atual, quem tem caveira ou
   * quem atacou o conjurador — passar por um inocente não dá caveira). Ausente = área nunca atinge jogadores.
   */
  areaHitsPlayer?: (caster: PlayerState, other: PlayerState) => boolean;
}

type Resolved =
  | { ok: false; reason: CastFailReason }
  | { ok: true; monster?: Monster; ally?: PlayerState; /** PvP: jogador atacado. */ victim?: PlayerState };

/** Magia ofensiva (proibida na PZ). */
export function isAggressive(s: SpellDef): boolean {
  if (s.damage || s.taunt || s.dash) return true;
  return !!s.condition && !s.heal && s.target !== "self" && s.target !== "party";
}

export class SpellSystem {
  private readonly cd = new Map<string, Map<string, number>>();
  private readonly globalCd = new Map<string, number>();
  private readonly now: () => number;
  private readonly rng: () => number;

  constructor(private readonly o: SpellSystemOptions) {
    this.now = o.now ?? Date.now;
    this.rng = o.rng ?? Math.random;
  }

  removePlayer(id: string): void {
    this.cd.delete(id);
    this.globalCd.delete(id);
  }

  /** C2S.Cast */
  onCast(p: PlayerState, msg: CastMsg): void {
    if (!msg || typeof msg !== "object" || typeof msg.spellId !== "string") return;
    const tid = typeof msg.targetId === "string" ? msg.targetId : undefined;
    this.cast(p, msg.spellId, tid);
  }

  /** Palavras mágicas no chat. Retorna true se o texto é de uma magia (o chat não deve repassar). */
  castWords(p: PlayerState, text: string): boolean {
    const s = spellByWords(text);
    if (!s) return false;
    this.cast(p, s.id);
    return true;
  }

  /** Pipeline completo. Envia CastResult (só ao conjurador) e, se deu certo, SpellCast (a todos). */
  cast(p: PlayerState, spellId: string, targetId?: string): CastResultMsg {
    const now = this.now();
    const res = this.tryCast(p, spellId, targetId, now);
    this.o.send(p.id, S2C.CastResult, res);
    return res;
  }

  private fail(spellId: string, reason: CastFailReason, extra: Partial<CastResultMsg> = {}): CastResultMsg {
    return { spellId, ok: false, reason, ...extra };
  }

  private tryCast(p: PlayerState, spellId: string, targetId: string | undefined, now: number): CastResultMsg {
    const s = (this.o.spells ?? spellDef)(spellId);
    if (!s) return this.fail(spellId, "unknown");
    if (p.hp <= 0) return this.fail(s.id, "dead");
    if (!s.vocations.includes(p.vocation as never)) return this.fail(s.id, "vocation");
    if (p.level < s.level) return this.fail(s.id, "level");
    const mm = this.o.monsters;
    const aggressive = isAggressive(s);
    const casterPz = mm.inPz(p.x, p.y);
    if (s.summon && casterPz) return this.fail(s.id, "pz");
    // Na PZ só se conjura ofensivo contra bonecos de treino (alvo único: ver resolveTarget; área/onda: boneco ao alcance).
    if (aggressive && casterPz) {
      const single = s.target === "target" || s.target === "area_target";
      const ok = single ? !!mm.wild(targetId || p.targetId)?.def.invulnerable : this.dummyInReach(p, s);
      if (!ok) return this.fail(s.id, "pz");
    }
    const usesGlobal = s.global !== false;
    const cdLeft = Math.max(0, (this.cd.get(p.id)?.get(s.id) ?? 0) - now);
    const gLeft = usesGlobal ? Math.max(0, (this.globalCd.get(p.id) ?? 0) - now) : 0;
    if (cdLeft > 0 || gLeft > 0) return this.fail(s.id, "cooldown", { cooldownMs: cdLeft, globalMs: gLeft });
    const manaCost = spellMana(s, p.level);
    if (p.mana < manaCost) return this.fail(s.id, "mana");

    const r = this.resolveTarget(p, s, targetId);
    if (!r.ok) return this.fail(s.id, r.reason);
    if (s.summon) {
      if (!this.o.summons.def(s.summon.monsterId)) return this.fail(s.id, "unknown");
      if (this.o.summons.freeTilesAround(p.x, p.y, 1).length === 0) return this.fail(s.id, "target");
    }

    // --- sucesso ---
    p.mana -= manaCost;
    if (manaCost > 0) this.o.skills?.addTries(p, "magic", manaCost);
    let map = this.cd.get(p.id);
    if (!map) { map = new Map(); this.cd.set(p.id, map); }
    map.set(s.id, now + s.cooldownMs);
    if (usesGlobal) this.globalCd.set(p.id, now + GLOBAL_SPELL_COOLDOWN_MS);
    if (aggressive) this.o.combat.markCombat(p.id, now);

    const msg = this.apply(p, s, r, now);
    this.o.broadcast(S2C.SpellCast, msg);
    return { spellId: s.id, ok: true, cooldownMs: s.cooldownMs, globalMs: usesGlobal ? GLOBAL_SPELL_COOLDOWN_MS : 0 };
  }

  private resolveTarget(p: PlayerState, s: SpellDef, targetId: string | undefined): Resolved {
    if (s.target !== "target" && s.target !== "area_target") return { ok: true };
    const range = s.range ?? DEFAULT_SPELL_RANGE;
    const mm = this.o.monsters;
    // Cura/buff em alvo: jogador indicado, senão o próprio conjurador.
    if (!s.damage && s.heal) {
      const ally = (targetId ? this.o.getPlayer(targetId) : undefined) ?? p;
      if (ally.hp <= 0) return { ok: false, reason: "target" };
      if (cheb(p.x, p.y, ally.x, ally.y) > range) return { ok: false, reason: "range" };
      if (ally !== p && !mm.los(p.x, p.y, ally.x, ally.y)) return { ok: false, reason: "no_los" };
      return { ok: true, ally };
    }
    const tid = targetId || p.targetId;
    const victim = tid && tid !== p.id ? this.o.getPlayer(tid) : undefined;
    if (victim) {
      // PvP: só magias de dano; o resto das regras (PZ, Coliseu, grupo) fica no combate.
      const can = this.o.combat.hooks.canAttackPlayer;
      if (!s.damage || !can || can(p, victim)) return { ok: false, reason: "target" };
      if (cheb(p.x, p.y, victim.x, victim.y) > range) return { ok: false, reason: "range" };
      if (!mm.los(p.x, p.y, victim.x, victim.y)) return { ok: false, reason: "no_los" };
      return { ok: true, victim };
    }
    const m = mm.wild(tid);
    if (!m) return { ok: false, reason: "target" };
    if (cheb(p.x, p.y, m.s.x, m.s.y) > range) return { ok: false, reason: "range" };
    if (!m.def.invulnerable && mm.inPz(m.s.x, m.s.y)) return { ok: false, reason: "pz" };
    // Alvo único e centro da área no alvo exigem linha de visão (paredes entre o conjurador e o alvo).
    if (!mm.los(p.x, p.y, m.s.x, m.s.y)) return { ok: false, reason: "no_los" };
    return { ok: true, monster: m };
  }

  /** Há um boneco de treino ao alcance de uma magia de área/onda conjurada por `p`? */
  private dummyInReach(p: PlayerState, s: SpellDef): boolean {
    const reach = Math.max(s.radius ?? 0, s.length ?? 0, 1);
    for (const m of this.o.monsters.all()) if (m.def.invulnerable && cheb(p.x, p.y, m.s.x, m.s.y) <= reach) return true;
    return false;
  }

  private wall = (x: number, y: number) => !this.o.grid.isWalkable(x, y);

  /** Exclui da área paredes e tiles sem linha de visão a partir do centro (não atinge atrás de parede). */
  private hidden(cx: number, cy: number): (x: number, y: number) => boolean {
    const mm = this.o.monsters;
    return (x, y) => this.wall(x, y) || !mm.los(cx, cy, x, y);
  }

  private apply(p: PlayerState, s: SpellDef, r: Resolved & { ok: true }, now: number): SpellCastMsg {
    const mm = this.o.monsters;
    const foe: Point | undefined = r.monster ? r.monster.s : r.victim;
    if (s.dash && foe) this.dash(p, foe, s.range ?? DEFAULT_SPELL_RANGE);
    if (foe) {
      const f = dirFromDelta(Math.sign(foe.x - p.x), Math.sign(foe.y - p.y));
      if (f !== null) p.dir = f;
    }

    // Tiles da área.
    let tiles: Point[] | undefined;
    const center = foe ? { x: foe.x, y: foe.y } : r.ally ? { x: r.ally.x, y: r.ally.y } : { x: p.x, y: p.y };
    if (s.target === "area_self") tiles = circleTiles(p.x, p.y, s.radius ?? 1, this.hidden(p.x, p.y));
    else if (s.target === "area_target") tiles = circleTiles(center.x, center.y, s.radius ?? 1, this.hidden(center.x, center.y));
    else if (s.target === "wave") tiles = waveTiles(p.x, p.y, p.dir, s.length ?? 3, s.width ?? 1, this.hidden(p.x, p.y), s.rect);

    // Quem é atingido.
    let hitMonsters: Monster[] = [];
    const allies: PlayerState[] = [];
    const victims: PlayerState[] = [];
    if (s.target === "target") {
      if (r.monster) hitMonsters.push(r.monster);
      if (r.victim) victims.push(r.victim);
      if (r.ally) allies.push(r.ally);
    } else if (s.target === "self") {
      allies.push(p);
    } else if (s.target === "party") {
      const rad = s.radius ?? 3;
      const ally = this.o.isAlly;
      for (const o of this.o.players()) {
        if (o.hp > 0 && cheb(p.x, p.y, o.x, o.y) <= rad && (o.id === p.id || !ally || ally(p, o))) allies.push(o);
      }
    } else if (tiles) {
      const seen = new Set<string>();
      for (const t of tiles) {
        const m = mm.monsterAt(t.x, t.y);
        if (m && !m.s.ownerId && !seen.has(m.s.id)) { seen.add(m.s.id); hitMonsters.push(m); }
      }
      const set = new Set(tiles.map((t) => t.y * this.o.grid.width + t.x));
      if (s.heal) {
        for (const o of this.o.players()) if (o.hp > 0 && set.has(o.y * this.o.grid.width + o.x)) allies.push(o);
      }
      const hitsPlayer = this.o.areaHitsPlayer;
      if (s.damage && hitsPlayer) {
        for (const o of this.o.players()) {
          if (o.id !== p.id && o.hp > 0 && set.has(o.y * this.o.grid.width + o.x) && hitsPlayer(p, o)) victims.push(o);
        }
      }
    }

    // Conjurando de dentro da PZ, só os bonecos de treino levam o efeito (nada selvagem é atingido "de graça").
    if (mm.inPz(p.x, p.y)) hitMonsters = hitMonsters.filter((m) => m.def.invulnerable);

    const ml = (p.magicLevel ?? 0) + (this.o.magicBonus?.(p) ?? 0);
    const dealt = this.o.dealtMult?.(p) ?? 1;
    if (s.damage) {
      // Dano: cavaleiro/paladino usam a skill da arma quando ela rende mais que o ML (spellPower). Cura: só o ML.
      const power = spellPower(p.vocation, ml, attackSkillValue(p) ?? 10, this.o.weaponSkillBonus?.(p) ?? 0, p.level);
      for (const m of hitMonsters) {
        const base = evalSpellFormula(s.damage, p.level, power, this.rng);
        const raw = dealt === 1 ? base : Math.round(base * dealt);
        const amount = mitigateSpell(raw, m.def.armor, s.damage.kind);
        this.o.combat.damageMonster(m, p.id, amount, s.damage.kind, now,
          { ranged: false }); // projétil da magia vem do SpellCast
      }
      for (const v of victims) {
        const base = evalSpellFormula(s.damage, p.level, power, this.rng);
        const raw = dealt === 1 ? base : Math.round(base * dealt);
        this.o.combat.hitPlayer(p, v, mitigateSpell(raw, this.o.combat.armorOf(v), s.damage.kind), s.damage.kind, now);
      }
    }
    if (s.heal) for (const a of allies) this.o.combat.healPlayer(a, p.id, evalSpellFormula(s.heal, p.level, ml, this.rng));

    const c = s.condition;
    if (c && c.id !== "taunted") {
      const onAllies = s.target === "self" || s.target === "party" || (!s.damage && !!s.heal);
      if (onAllies) for (const a of allies) this.o.conditions.apply(a.id, c.id, c.durationMs, c.value, p.id, now);
      else for (const m of hitMonsters) if (mm.get(m.s.id) === m) this.o.conditions.apply(m.s.id, c.id, c.durationMs, c.value, p.id, now);
    }

    if (s.taunt) {
      const rad = s.radius ?? DEFAULT_TAUNT_RADIUS;
      const dur = c?.durationMs ?? DEFAULT_TAUNT_MS;
      for (const m of mm.all()) {
        if (m.s.ownerId || m.def.invulnerable || cheb(p.x, p.y, m.s.x, m.s.y) > rad) continue;
        this.o.conditions.apply(m.s.id, "taunted", dur, c?.id === "taunted" ? c.value : undefined, p.id, now);
      }
    }

    if (s.summon) this.o.summons.summon(p, s.summon, now);

    const out: SpellCastMsg = { spellId: s.id, casterId: p.id, x: center.x, y: center.y, dir: p.dir };
    if (r.monster) out.targetId = r.monster.s.id;
    else if (r.victim) out.targetId = r.victim.id;
    else if (r.ally && r.ally !== p) out.targetId = r.ally.id;
    if (tiles) out.tiles = flat(tiles);
    return out;
  }

  /**
   * Investida: anda em linha reta até `range` tiles em direção ao alvo, parando ao lado dele ou em obstáculos.
   * Vindo de fora, para antes da zona de proteção: o salto não passa pelo bloqueio de PZ do PvP (atacou um jogador e
   * pulou para dentro da cidade). Quem já está na PZ (treino nos bonecos) segue andando lá dentro.
   */
  private dash(p: PlayerState, target: Point, range: number): void {
    const mm = this.o.monsters;
    let x = p.x, y = p.y;
    const fromOutside = !mm.inPz(p.x, p.y);
    const free = (tx: number, ty: number) => {
      if (mm.isMonsterAt(tx, ty) || this.o.isBlocked?.(tx, ty)) return false;
      if (fromOutside && mm.inPz(tx, ty)) return false;
      for (const o of this.o.players()) if (o.id !== p.id && o.x === tx && o.y === ty) return false;
      return true;
    };
    for (let i = 0; i < range; i++) {
      if (cheb(x, y, target.x, target.y) <= 1) break;
      const sx = Math.sign(target.x - x), sy = Math.sign(target.y - y);
      const options: [number, number][] = [[sx, sy]];
      if (sx !== 0 && sy !== 0) {
        // Diagonal bloqueada: tenta o eixo de maior distância primeiro.
        if (Math.abs(target.x - x) >= Math.abs(target.y - y)) options.push([sx, 0], [0, sy]);
        else options.push([0, sy], [sx, 0]);
      }
      const step = options.find(([dx, dy]) => canStepTerrain(this.o.grid, x, y, dx, dy) && free(x + dx, y + dy));
      if (!step) break;
      x += step[0];
      y += step[1];
    }
    if (x !== p.x || y !== p.y) this.o.teleport(p, x, y);
  }
}

// Habilidades de monstros (dados em shared/data/monsterAbilities.ts): a IA chama `tryUse` no turno de ataque; se uma
// habilidade estiver pronta, no alcance e com visão, ela ocupa o turno no lugar do ataque básico.
// - Golpes com `windupMs`: S2C.MonsterTelegraph marca os tiles; o dano cai depois em quem ainda estiver neles (matar o
//   monstro antes cancela).
// - Invocações: ajudantes sem respawn, XP nem loot; somem quando o invocador some (morte, despawn, fim da partida).
import {
  CALL_HELP_ID, HEAL_ALLIES_LOCKOUT_MS, S2C, dirFromDelta, mitigate, monsterAbilityFxId, monsterDef, rollInt,
  type CollisionGrid, type MonsterAbility, type MonsterTelegraphMsg, type SpellCastMsg,
} from "@lemonquest/shared";
import type { PlayerState } from "../state.ts";
import type { CombatSystem } from "./combat.ts";
import type { ConditionSystem } from "./conditions.ts";
import { cheb, isMonsterState, type CreatureState, type Monster, type MonsterManager } from "./monsters.ts";
import type { Point } from "./pathfinding.ts";
import { circleTiles, waveTiles } from "./spells.ts";

export interface MonsterAbilityOptions {
  grid: CollisionGrid;
  monsters: MonsterManager;
  combat: Pick<CombatSystem, "damagePlayer" | "damageMonster" | "armorOf" | "shieldTry">;
  conditions: Pick<ConditionSystem, "apply">;
  players: () => Iterable<PlayerState>;
  broadcast: (type: string, msg: unknown) => void;
  rng?: () => number;
}

interface Pending {
  monsterId: string;
  defId: string;
  ability: MonsterAbility;
  tiles: Point[];
  at: number;
  msg: SpellCastMsg;
}

const flat = (pts: Point[]) => pts.flatMap((t) => [t.x, t.y]);

export class MonsterAbilitySystem {
  private readonly rng: () => number;
  private pending: Pending[] = [];
  /** invocador → ids dos ajudantes vivos. */
  private readonly minions = new Map<string, Set<string>>();

  constructor(private readonly o: MonsterAbilityOptions) {
    this.rng = o.rng ?? Math.random;
    o.monsters.abilityHook = (m, target, now) => this.tryUse(m, target, now);
    // Pedido de reforço dos bandos: o grito sobre a cabeça (mesmo efeito das habilidades, id `call_help`).
    o.monsters.onCallHelp = (m) => {
      this.o.broadcast(S2C.SpellCast, { spellId: monsterAbilityFxId(m.def.id, CALL_HELP_ID), casterId: m.s.id, x: m.s.x, y: m.s.y, dir: m.s.dir } satisfies SpellCastMsg);
    };
  }

  /** Turno de ataque do monstro: usa a primeira habilidade pronta e possível. true = usou (o turno foi gasto). */
  tryUse(m: Monster, target: CreatureState, now: number): boolean {
    const list = m.def.abilities;
    if (!list?.length || m.s.ownerId) return false;
    // Um golpe com aviso ainda pendente: espera ele cair antes de outra habilidade.
    if (this.pending.some((p) => p.monsterId === m.s.id)) return false;
    const ready = (m.abilityReadyAt ??= new Map());
    for (const a of list) {
      const at = ready.get(a.id);
      // Primeira vez: pronta entre 30% e 100% do cooldown (não abre a luta com o golpe mais forte, e um bando que
      // entra em combate junto não solta todos os sopros no mesmo instante).
      if (at === undefined) { ready.set(a.id, now + Math.floor(a.cooldownMs * (0.3 + 0.7 * this.rng()))); continue; }
      if (now < at || !this.usable(m, a, target, now)) continue;
      if (a.chance !== undefined && this.rng() >= a.chance) {
        ready.set(a.id, now + m.def.attackMs); // sorteia de novo só no próximo turno, não a cada tick
        continue;
      }
      ready.set(a.id, now + a.cooldownMs);
      this.use(m, a, target, now);
      return true;
    }
    return false;
  }

  /** Resolve os golpes com aviso que venceram e tira ajudantes cujo invocador sumiu. Chamar a cada tick. */
  tick(now: number): void {
    if (this.pending.length) {
      const due = this.pending.filter((p) => now >= p.at);
      if (due.length) {
        this.pending = this.pending.filter((p) => now < p.at);
        for (const p of due) {
          const m = this.o.monsters.get(p.monsterId);
          if (!m || m.s.hp <= 0 || m.s.defId !== p.defId) continue; // morreu/sumiu: golpe cancelado
          this.o.broadcast(S2C.SpellCast, p.msg);
          this.hitTiles(m, p.ability, p.tiles, now);
        }
      }
    }
    for (const [masterId, ids] of this.minions) {
      for (const id of ids) if (!this.o.monsters.get(id)) ids.delete(id);
      if (this.o.monsters.get(masterId) && ids.size) continue;
      for (const id of ids) { const mm = this.o.monsters.get(id); if (mm) this.o.monsters.despawn(mm); }
      this.minions.delete(masterId);
    }
  }

  /** Ajudantes vivos de um invocador (testes). */
  minionCount(masterId: string): number {
    let n = 0;
    for (const id of this.minions.get(masterId) ?? []) if (this.o.monsters.get(id)) n++;
    return n;
  }

  /** Golpes com aviso ainda no ar (testes/status). */
  get pendingCount(): number { return this.pending.length; }

  // --- regras ------------------------------------------------------------------------------

  private usable(m: Monster, a: MonsterAbility, target: CreatureState, now: number): boolean {
    const s = m.s;
    if (a.heal) return s.hp < s.maxHp * a.heal.belowHpPct;
    // Só quem ainda pode receber a cura conta (HEAL_ALLIES_LOCKOUT_MS): sem ninguém, o curandeiro ataca no turno.
    if (a.healAllies) { const h = a.healAllies; return this.healable(m, h.radius, now).some((o) => o.s.hp < o.s.maxHp * h.belowHpPct); }
    if (a.summon) return this.minionCount(s.id) < a.summon.max && !!monsterDef(a.summon.monsterId);
    if (a.shape === "self") return false;
    const d = cheb(s.x, s.y, target.x, target.y);
    const reach = a.shape === "area_self" ? Math.max(1, a.radius ?? 1) : (a.range ?? Math.max(1, m.def.attackRange));
    if (d < 1 || d > reach || !this.o.monsters.los(s.x, s.y, target.x, target.y)) return false;
    // Área/onda que não pegaria o alvo (diagonal fora do cone, canto do círculo): melhor o ataque básico.
    if (a.shape === "area_self" || a.shape === "wave") {
      return this.tilesFor(m, a, target, this.dirTo(m, target)).some((t) => t.x === target.x && t.y === target.y);
    }
    return true;
  }

  private dirTo(m: Monster, target: CreatureState): number {
    return dirFromDelta(Math.sign(target.x - m.s.x), Math.sign(target.y - m.s.y)) ?? m.s.dir;
  }

  private use(m: Monster, a: MonsterAbility, target: CreatureState, now: number): void {
    const s = m.s;
    const dir = this.dirTo(m, target);
    const msg: SpellCastMsg = { spellId: monsterAbilityFxId(m.def.id, a.id), casterId: s.id, x: s.x, y: s.y, dir };
    if (a.heal) {
      this.o.broadcast(S2C.SpellCast, msg);
      s.hp = Math.min(s.maxHp, s.hp + Math.max(1, Math.round(s.maxHp * a.heal.pct)));
      return;
    }
    if (a.healAllies) {
      const healed = this.healable(m, a.healAllies.radius, now).filter((o) => o.s.hp < o.s.maxHp);
      for (const o of healed) {
        o.s.hp = Math.min(o.s.maxHp, o.s.hp + Math.max(1, Math.round(o.s.maxHp * a.healAllies.pct)));
        o.healedAt = now;
      }
      msg.tiles = flat(healed.map((o) => ({ x: o.s.x, y: o.s.y }))); // brilho de cura em cada aliado curado
      this.o.broadcast(S2C.SpellCast, msg);
      return;
    }
    if (a.summon) {
      const spawned = this.summon(m, a.summon, now);
      if (spawned.length) msg.tiles = flat(spawned); // o efeito aparece onde os ajudantes nasceram
      this.o.broadcast(S2C.SpellCast, msg);
      return;
    }
    const tiles = this.tilesFor(m, a, target, dir);
    if (a.shape === "target") msg.targetId = target.id;
    if (a.shape === "area_target") { msg.x = target.x; msg.y = target.y; msg.targetId = target.id; }
    if (a.shape !== "target") msg.tiles = flat(tiles);
    if (a.windupMs && a.windupMs > 0 && a.shape !== "target") {
      this.pending.push({ monsterId: s.id, defId: s.defId, ability: a, tiles, at: now + a.windupMs, msg });
      this.o.broadcast(S2C.MonsterTelegraph, { casterId: s.id, tiles: flat(tiles), ms: a.windupMs, fx: a.fx } satisfies MonsterTelegraphMsg);
      return;
    }
    this.o.broadcast(S2C.SpellCast, msg);
    this.hitTiles(m, a, tiles, now);
  }

  /** Tiles atingidos (paredes e falta de visão a partir do centro cortam a área, como nas magias dos jogadores). */
  private tilesFor(m: Monster, a: MonsterAbility, target: CreatureState, dir: number): Point[] {
    const s = m.s;
    const hidden = (cx: number, cy: number) => (x: number, y: number) =>
      !this.o.grid.isWalkable(x, y) || !this.o.monsters.los(cx, cy, x, y);
    switch (a.shape) {
      case "target": return [{ x: target.x, y: target.y }];
      case "area_self": return circleTiles(s.x, s.y, a.radius ?? 1, hidden(s.x, s.y)).filter((t) => t.x !== s.x || t.y !== s.y);
      case "area_target": return circleTiles(target.x, target.y, a.radius ?? 1, hidden(target.x, target.y));
      case "wave": return waveTiles(s.x, s.y, dir, a.length ?? 3, a.width ?? 1, hidden(s.x, s.y));
      default: return [];
    }
  }

  /** Dano/condição em quem está nos tiles: jogadores que o monstro pode atacar e invocações deles. */
  private hitTiles(m: Monster, a: MonsterAbility, tiles: Point[], now: number): void {
    if (!tiles.length) return;
    const mm = this.o.monsters;
    const key = (x: number, y: number) => `${x},${y}`;
    const set = new Set(tiles.map((t) => key(t.x, t.y)));
    const hit: CreatureState[] = [];
    for (const p of this.o.players()) {
      if (p.hp > 0 && !mm.inPz(p.x, p.y) && set.has(key(p.x, p.y)) && mm.allowedFor(m, p.id)) hit.push(p);
    }
    for (const t of tiles) {
      const other = mm.monsterAt(t.x, t.y);
      if (other?.s.ownerId && other.s.hp > 0 && mm.allowedFor(m, other.s.id)) hit.push(other.s);
    }
    for (const c of hit) {
      // Golpe letal não deixa condição: o jogador morto renasce no templo com a vida cheia (c.hp > 0 de novo) e, sem
      // esta checagem, aparecia lá envenenado/queimando, com o dano contínuo tiquando na zona de proteção (#54).
      let survived = true;
      if (a.damage) {
        const raw = Math.round(rollInt(a.damage.min, a.damage.max, this.rng) * (m.dmgMult ?? 1));
        if (isMonsterState(c)) {
          const sm = mm.get(c.id);
          if (sm) this.o.combat.damageMonster(sm, m.s.id, mitigate(raw, sm.def.armor), a.damage.kind, now, { creditId: "", ranged: true });
        } else {
          // Armadura inteira, como no ataque básico do monstro (os números das habilidades foram calibrados assim).
          this.o.combat.shieldTry(c, now, { monsterLevel: m.def.level, raw });
          const before = c.hp;
          const dealt = this.o.combat.damagePlayer(c, m.s.id, mitigate(raw, this.o.combat.armorOf(c)), a.damage.kind, now, { ranged: true, killerName: m.def.name, killerKey: `${m.def.id}/${a.id}` });
          survived = dealt < before;
        }
      }
      if (a.condition && c.hp > 0 && survived) this.o.conditions.apply(c.id, a.condition.id, a.condition.durationMs, a.condition.value, m.s.id, now);
    }
  }

  /**
   * Aliados para a cura em grupo: o próprio monstro e os monstros selvagens vivos a até `radius` (mesma arena/sala;
   * nunca invocações de jogador nem chefes) com linha de visão.
   */
  private alliesOf(m: Monster, radius: number): Monster[] {
    const mm = this.o.monsters, out: Monster[] = [];
    for (const o of mm.all()) {
      if (o.s.ownerId || o.s.hp <= 0 || o.def.stationary || o.arenaId !== m.arenaId || o.questLever !== m.questLever) continue;
      if (o.def.boss && o !== m) continue; // chefe não é curado pelos ajudantes (Bruxa do Gelo curava o Yeti)
      if (o !== m && (cheb(o.s.x, o.s.y, m.s.x, m.s.y) > radius || !mm.los(m.s.x, m.s.y, o.s.x, o.s.y))) continue;
      out.push(o);
    }
    return out;
  }

  /** Aliados que podem receber a cura em grupo agora: no máximo uma vez a cada HEAL_ALLIES_LOCKOUT_MS por monstro. */
  private healable(m: Monster, radius: number, now: number): Monster[] {
    return this.alliesOf(m, radius).filter((o) => o.healedAt === undefined || now - o.healedAt >= HEAL_ALLIES_LOCKOUT_MS);
  }

  private summon(m: Monster, o: NonNullable<MonsterAbility["summon"]>, now: number): Point[] {
    const out: Point[] = [];
    const def = monsterDef(o.monsterId);
    if (!def) return out;
    let ids = this.minions.get(m.s.id);
    if (!ids) { ids = new Set(); this.minions.set(m.s.id, ids); }
    const room = Math.max(0, o.max - this.minionCount(m.s.id));
    for (let i = 0; i < Math.min(o.count, room); i++) {
      const minion = this.o.monsters.spawnMinion(def, m, now);
      if (!minion) break;
      ids.add(minion.s.id);
      out.push({ x: minion.s.x, y: minion.s.y });
    }
    return out;
  }
}

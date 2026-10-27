// IA de monstros: idle → chase (ataca) → flee → return. Roda a cada tick, mas só "pensa"
// (varredura de aggro, A*) a cada THINK_MS por monstro, com offsets escalonados.
import { DIR_DELTA, Dir, MONSTER_REGEN_TICK_MS, canStepTerrain, dirFromDelta, monsterRegenAmount } from "@lemonquest/shared";
import type { PlayerState } from "../state.ts";
import { findPath, type Point } from "./pathfinding.ts";
import { HELP_FLEE, SLEEP_DIST, cheb, type CreatureState, type Monster, type MonsterManager } from "./monsters.ts";

export const THINK_MS = 250;
/** Mais longe que isso do spawn → desiste e volta. */
export const LEASH_DIST = 14;
/** Sem alvo válido por este tempo → volta ao spawn. */
export const LOST_TARGET_MS = 5000;
/** Passeio ocioso fica a até radius + isto do spawn. */
export const WANDER_SLACK = 3;
export const PATH_RECOMPUTE_MS = 400;
export const AI_PATH_MAX_NODES = 600;
export const AI_PATH_MAX_DIST = 30;
/** Voltando há mais que isso sem chegar → teleporta para o spawn. */
export const RETURN_STUCK_MS = 15_000;
/**
 * Fugindo há tanto tempo sem levar dano → desiste e volta ao spawn (lá cura). Sem prazo o monstro ficava fugindo do
 * alvo para sempre: não curava nem revidava quem chegasse depois (ciclo 14).
 */
export const FLEE_GIVE_UP_MS = 10_000;
/** Limite de nós da busca (BFS) por um tile com linha de visão quando o alvo está atrás de parede. */
export const LOS_SEARCH_MAX_NODES = 400;

const ALL_DIRS: Dir[] = [Dir.N, Dir.NE, Dir.E, Dir.SE, Dir.S, Dir.SW, Dir.W, Dir.NW];

export function updateMonster(m: Monster, w: MonsterManager, now: number): void {
  if (m.def.stationary) return; // boneco de treino: nunca pensa, anda, foge, volta nem ataca
  regen(m, now);
  // Provocação (taunt): enquanto durar, o alvo é forçado a ser quem provocou. Voltando pela coleira não atende:
  // perseguiria de novo dentro da coleira sem nunca chegar ao spawn (a mesma "dança" de quem bate nele voltando).
  if (m.tauntBy && !m.evading && now < (m.tauntUntil ?? 0)) {
    const t = validFor(m, w, m.tauntBy);
    if (t && (m.s.targetId !== t.id || m.mode !== "chase")) { engage(m, t); m.sleeping = false; m.nextThinkAt = now; }
  }
  if (now >= m.nextThinkAt) {
    m.nextThinkAt = now + THINK_MS;
    if (m.mode === "idle") {
      m.sleeping = !m.bounds && w.nearestPlayerDist(m.s.x, m.s.y) > SLEEP_DIST;
      if (!m.sleeping) thinkIdle(m, w, now);
    } else {
      think(m, w, now);
    }
  }
  if (m.mode === "idle") {
    if (!m.sleeping) wander(m, w, now);
    return;
  }
  act(m, w, now);
}

// --- pensar -------------------------------------------------------------------

/** Alvo válido para ESTE monstro (coliseu: só membros da partida e suas invocações). */
function validFor(m: Monster, w: MonsterManager, id: string): CreatureState | undefined {
  const t = w.validTarget(id);
  return t && (!m.allow || w.allowedFor(m, id)) ? t : undefined;
}

function nearestAggroTarget(m: Monster, w: MonsterManager): PlayerState | undefined {
  // Monstro de arena: percebe a arena inteira (inclusive os passivos).
  const range = m.bounds ? Infinity : m.def.aggroRange;
  if (range <= 0) return undefined;
  let best: PlayerState | undefined, bestD = Infinity;
  for (const p of w.playerList) {
    if (p.hp <= 0 || w.inPz(p.x, p.y)) continue;
    if (m.allow && !m.allow(p)) continue;
    const d = cheb(m.s.x, m.s.y, p.x, p.y);
    if (d <= range && d < bestD) { best = p; bestD = d; }
  }
  return best;
}

function engage(m: Monster, p: CreatureState) {
  m.mode = "chase";
  m.evading = false;
  m.s.targetId = p.id;
  m.lostSince = 0;
  m.path = null;
}

function thinkIdle(m: Monster, w: MonsterManager, _now: number) {
  const t = nearestAggroTarget(m, w) ?? validFor(m, w, m.lastAttackerId);
  if (t) engage(m, t);
}

/**
 * Fora de combate (voltando ao spawn ou ocioso) recupera a vida aos poucos (monsterRegenAmount a cada
 * MONSTER_REGEN_TICK_MS) em vez de chegar ao spawn curado de uma vez; o 1º tique vem um intervalo depois de sair do
 * combate. Perseguindo ou fugindo não recupera; monstro de arena nunca (fica ocioso entre membros, sem cura).
 */
function regen(m: Monster, now: number) {
  if (m.bounds || m.s.hp >= m.s.maxHp || (m.mode !== "return" && m.mode !== "idle")) { m.nextRegenAt = 0; return; }
  if (!m.nextRegenAt) m.nextRegenAt = now + MONSTER_REGEN_TICK_MS;
  if (now < m.nextRegenAt) return;
  m.nextRegenAt += MONSTER_REGEN_TICK_MS;
  m.s.hp = Math.min(m.s.maxHp, m.s.hp + monsterRegenAmount(m.s.maxHp));
}

/** Volta ao spawn. `evade`: passou da coleira — toma dano mas não revida nem troca de alvo até chegar (Monster.evading). */
export function startReturn(m: Monster, now: number, evade = false) {
  m.mode = "return";
  m.evading = evade;
  m.s.targetId = "";
  m.path = null;
  m.lostSince = 0;
  m.returnSince = now;
}

/** Chegou ao spawn: esquece a luta (a vida continua subindo aos poucos pelo `regen` enquanto ficar ocioso). */
function arrive(m: Monster, now: number) {
  m.mode = "idle";
  m.evading = false;
  m.s.targetId = "";
  m.damageBy.clear();
  m.lastAttackerId = "";
  m.lastCreditId = "";
  m.helpCalled = 0; // de volta ao spawn: pode pedir reforço de novo na próxima luta
  m.path = null;
  m.nextWanderAt = now + 2000;
}

function think(m: Monster, w: MonsterManager, now: number) {
  const s = m.s;
  if (m.mode === "return") {
    if (cheb(s.x, s.y, m.spawn.x, m.spawn.y) <= m.spawn.radius) { arrive(m, now); return; }
    if (now - m.returnSince > RETURN_STUCK_MS) {
      const t = w.findSpawnTile(m.spawn, false);
      if (t) { w.place(m, t.x, t.y); arrive(m, now); }
      return;
    }
    if (!m.path || m.path.length === 0) computePath(m, w, m.spawn, now, false);
    return;
  }

  // chase / flee
  if (!m.bounds && cheb(s.x, s.y, m.spawn.x, m.spawn.y) > LEASH_DIST) { startReturn(m, now, true); return; }
  let target = validFor(m, w, s.targetId);
  if (!target) {
    target = nearestAggroTarget(m, w) ?? validFor(m, w, m.lastAttackerId);
    if (target) engage(m, target);
    else {
      s.targetId = "";
      m.path = null;
      // Arena: sem volta ao spawn (nem cura); fica ocioso até achar outro membro.
      if (m.bounds) { m.mode = "idle"; m.lostSince = 0; return; }
      if (!m.lostSince) m.lostSince = now;
      else if (now - m.lostSince >= LOST_TARGET_MS) startReturn(m, now);
      return;
    }
  }
  m.lostSince = 0;
  const was = m.mode;
  m.mode = m.def.fleeAtHpPct > 0 && s.hp < m.def.fleeAtHpPct * s.maxHp ? "flee" : "chase";
  if (m.mode === "flee") {
    m.path = null;
    if (was !== "flee") {
      m.fleeSince = now;
      if (m.def.pack) w.callForHelp(m, target.id, now, HELP_FLEE); // fugindo, chama o bando
    } else if (!m.bounds && now - Math.max(m.fleeSince ?? 0, m.hurtAt ?? 0) >= FLEE_GIVE_UP_MS) startReturn(m, now);
    return;
  }

  const d = cheb(s.x, s.y, target.x, target.y);
  const range = Math.max(1, m.def.attackRange);
  const needMove = d > range;
  const moved = cheb(target.x, target.y, m.pathGoal.x, m.pathGoal.y);
  if (!needMove) {
    // Distância: no alcance mas sem linha de visão → anda até um tile que enxergue o alvo.
    if (range > 1 && !w.los(s.x, s.y, target.x, target.y)) {
      if (!m.path || m.path.length === 0 || moved >= 1 || now - m.pathAt >= PATH_RECOMPUTE_MS) computeLosPath(m, w, target, range, now);
      return;
    }
    m.path = null;
    return;
  }
  if (!m.path || m.path.length === 0 || moved >= 2 || (moved >= 1 && now - m.pathAt >= PATH_RECOMPUTE_MS)) {
    computePath(m, w, target, now, m.def.attackRange <= 1);
  }
}

export function computePath(m: Monster, w: MonsterManager, goal: Point, now: number, dropLast: boolean) {
  m.pathAt = now;
  m.pathGoal = { x: goal.x, y: goal.y };
  const path = findPath(w.grid, m.s, goal, (x, y) => w.blockedForMonster(x, y),
    { maxNodes: AI_PATH_MAX_NODES, maxDist: AI_PATH_MAX_DIST });
  if (path && dropLast && path.length) path.pop();
  m.path = path && path.length ? path : null;
}

/**
 * Caminho (BFS, passos de 1 tile) até o tile mais próximo, a até `range` do alvo, que tenha linha de visão
 * até ele. Sem tile assim ao alcance da busca → caminho direto até o alvo (aproximar costuma abrir a visão).
 */
export function computeLosPath(m: Monster, w: MonsterManager, target: Point, range: number, now: number): void {
  m.pathAt = now;
  m.pathGoal = { x: target.x, y: target.y };
  const path = findLosTilePath(m, w, target, range);
  if (path) { m.path = path.length ? path : null; return; }
  computePath(m, w, target, now, false);
  m.pathGoal = { x: target.x, y: target.y };
}

/** BFS a partir do monstro; null = nenhum tile com visão encontrado dentro do limite de nós. */
export function findLosTilePath(m: Monster, w: MonsterManager, target: Point, range: number): Point[] | null {
  const s = m.s, b = m.bounds;
  const W = w.grid.width;
  const start = s.y * W + s.x;
  const prev = new Map<number, number>([[start, -1]]);
  const queue: number[] = [start];
  for (let qi = 0; qi < queue.length && prev.size <= LOS_SEARCH_MAX_NODES; qi++) {
    const cur = queue[qi];
    const cx = cur % W, cy = (cur - cx) / W;
    if (cur !== start) {
      const d = cheb(cx, cy, target.x, target.y);
      if (d >= 1 && d <= range && w.los(cx, cy, target.x, target.y)) {
        const out: Point[] = [];
        for (let k = cur; k !== start; k = prev.get(k)!) out.push({ x: k % W, y: Math.floor(k / W) });
        return out.reverse();
      }
    }
    for (const dir of ALL_DIRS) {
      const { dx, dy } = DIR_DELTA[dir];
      const nx = cx + dx, ny = cy + dy, key = ny * W + nx;
      if (prev.has(key) || !canStepTerrain(w.grid, cx, cy, dx, dy) || w.blockedForMonster(nx, ny)) continue;
      if (b && (nx < b.x0 || nx > b.x1 || ny < b.y0 || ny > b.y1)) continue;
      if (!b && cheb(nx, ny, m.spawn.x, m.spawn.y) > LEASH_DIST) continue;
      prev.set(key, cur);
      queue.push(key);
    }
  }
  return null;
}

// --- agir (todo tick) -------------------------------------------------------------

function act(m: Monster, w: MonsterManager, now: number) {
  const s = m.s;
  if (m.mode === "return") {
    if (now >= m.stepEndsAt && !followPath(m, w, now)) greedyStep(m, w, m.spawn, now, true);
    return;
  }
  const target = validFor(m, w, s.targetId);
  if (!target) return;
  const d = cheb(s.x, s.y, target.x, target.y);
  const range = Math.max(1, m.def.attackRange);
  const ranged = range > 1;
  // Ataque à distância exige linha de visão (corpo a corpo não).
  const sight = !ranged || d > range || w.los(s.x, s.y, target.x, target.y);

  // Habilidade (sopro, pisão, cura, invocação...): ocupa o turno do ataque; cada uma confere alcance e visão.
  if (now >= m.nextAttackAt && m.def.abilities?.length && !w.inPz(s.x, s.y) && w.abilityHook(m, target, now)) {
    const face = dirFromDelta(Math.sign(target.x - s.x), Math.sign(target.y - s.y));
    if (face !== null && now >= m.stepEndsAt) s.dir = face;
    m.nextAttackAt = now + m.def.attackMs;
    if (!w.get(s.id)) return;
  // Ataque (fugindo, só os de distância continuam atirando).
  } else if ((m.mode === "chase" || ranged) && d >= 1 && d <= range && sight && now >= m.nextAttackAt && !w.inPz(s.x, s.y)) {
    const face = dirFromDelta(Math.sign(target.x - s.x), Math.sign(target.y - s.y));
    if (face !== null && now >= m.stepEndsAt) s.dir = face;
    m.nextAttackAt = now + m.def.attackMs;
    w.attackHook(m, target, now);
    if (!w.get(s.id)) return; // (morte/remoção durante o hook)
  }

  if (now < m.stepEndsAt) return;
  if (m.mode === "flee") { stepAway(m, w, target, now, false); return; }
  if (ranged) {
    if (d <= range && !sight) {
      // Atrás de parede: segue o caminho até um tile com visão (think recalcula); senão se aproxima.
      if (!followPath(m, w, now, target)) greedyStep(m, w, target, now, false);
      return;
    }
    const keep = Math.max(1, range - 1);
    if (d < keep) { stepAway(m, w, target, now, true, true); return; }
    if (d <= range) return;
  } else if (d <= 1) return;
  if (!followPath(m, w, now, target)) greedyStep(m, w, target, now, false);
}

/** Segue o caminho; false se não há caminho ou o passo falhou (o caminho é descartado). */
export function followPath(m: Monster, w: MonsterManager, now: number, target?: Point): boolean {
  const path = m.path;
  if (!path || path.length === 0) return false;
  const next = path[0];
  if (target && next.x === target.x && next.y === target.y) { m.path = null; return false; }
  const dir = dirFromDelta(next.x - m.s.x, next.y - m.s.y);
  if (dir === null || !w.tryStep(m, dir, now)) { m.path = null; return false; }
  path.shift();
  if (path.length === 0) m.path = null;
  return true;
}

/** Passo guloso em direção a `goal` (só passos que diminuem a distância). */
export function greedyStep(m: Monster, w: MonsterManager, goal: Point, now: number, allowEqual: boolean): boolean {
  const s = m.s;
  const cur = cheb(s.x, s.y, goal.x, goal.y);
  const options = ALL_DIRS.map((dir) => {
    const { dx, dy } = DIR_DELTA[dir];
    const nx = s.x + dx, ny = s.y + dy;
    return { dir, d: cheb(nx, ny, goal.x, goal.y), e: (nx - goal.x) ** 2 + (ny - goal.y) ** 2, nx, ny };
  }).filter((o) => (o.d < cur || (allowEqual && o.d === cur)) && !(o.nx === goal.x && o.ny === goal.y))
    .sort((a, b) => a.d - b.d || a.e - b.e);
  for (const o of options) if (w.tryStep(m, o.dir, now)) return true;
  return false;
}

/**
 * Afasta-se de `from` (fuga ou kiting). `strict` = só passos que aumentam a distância;
 * `keepSight` = só passos que mantêm a linha de visão até `from` (kiting não se esconde atrás de parede).
 */
function stepAway(m: Monster, w: MonsterManager, from: Point, now: number, strict: boolean, keepSight = false): boolean {
  const s = m.s;
  const cur = cheb(s.x, s.y, from.x, from.y);
  const options = ALL_DIRS.map((dir) => {
    const { dx, dy } = DIR_DELTA[dir];
    const nx = s.x + dx, ny = s.y + dy;
    return { dir, d: cheb(nx, ny, from.x, from.y), e: (nx - from.x) ** 2 + (ny - from.y) ** 2, nx, ny };
  }).filter((o) => (strict ? o.d > cur : o.d >= cur) && (!!m.bounds || cheb(o.nx, o.ny, m.spawn.x, m.spawn.y) <= LEASH_DIST)
    && (!keepSight || w.los(o.nx, o.ny, from.x, from.y)))
    .sort((a, b) => b.d - a.d || b.e - a.e);
  for (const o of options) if (w.tryStep(m, o.dir, now)) return true;
  return false;
}

function wander(m: Monster, w: MonsterManager, now: number) {
  if (now < m.nextWanderAt || now < m.stepEndsAt) return;
  m.nextWanderAt = now + 2000 + w.rng() * 3000;
  const dir = ALL_DIRS[Math.floor(w.rng() * 8)];
  const { dx, dy } = DIR_DELTA[dir];
  if (cheb(m.s.x + dx, m.s.y + dy, m.spawn.x, m.spawn.y) > m.spawn.radius + WANDER_SLACK) return;
  w.tryStep(m, dir, now);
}

// Invasão da Vila (ciclo 18; regras e números em shared/data/invasion.ts). O EventSystem avisa o começo e o fim do evento
// com `invasion` (start/end); daqui em diante a onda atual sai do relógio: um reinício no meio volta na mesma onda (a que
// estava viva some com o reinício e nasce de novo). Invasores = MonsterManager.spawnQuest (sem respawn, XP e loot
// normais, nunca em PZ), confinados à Vila + INVASION_BOUNDS_MARGIN, mirando só quem está perto; ociosos, marcham até a
// borda da PZ (goalX/goalY do ponto). Contribuição por personagem (nome): dano nos invasores (CombatHooks.onDealt) e cura
// em outros jogadores na área (onHealOther), só até o dano que invasores tiraram deles (onPlayerDamaged). No fim, Baú de
// Recompensa para quem fez o mínimo (+1 com a Vila defendida); quem estava offline recebe no próximo login. Pontos,
// placar, entregas pendentes e as ocorrências já encerradas ficam no kv (sobrevivem a reinício; nenhuma premia 2×).
import {
  BOUNTY_CHEST_ID, INVASION_AGGRO, INVASION_AREA_MARGIN, INVASION_BOUNDS_MARGIN, INVASION_DEFEND_PCT, INVASION_GOAL_RADIUS,
  INVASION_MIN_POINTS, INVASION_WAVES, S2C, eventDef, findObjects, invasionChests, invasionDamagePoints, invasionHealPoints,
  invasionNextWaveAt, invasionPresence, invasionSide, invasionWaveIndex, invasionWavePlan, monsterDef, objectTile, scheduledEvent,
  villageDefended,
  type ActiveEvent, type AnnounceMsg, type FeedMsg, type InvasionMsg, type InvasionResult, type InvasionState, type ItemInstance,
  type MonsterDef, type NoticeMsg, type TiledMap,
} from "@lemonquest/shared";
import type { PlayerState } from "../state.ts";
import { THINK_MS, computePath, followPath, greedyStep } from "./ai.ts";
import { makeItem, newUid } from "./inventory.ts";
import { PZ_ZONE_NAMES, cheb, type Monster, type MonsterManager, type TileRect } from "./monsters.ts";

/** Ponto de onde a coluna sai e o tile da borda da PZ para onde ela marcha. */
export interface InvasionPoint { name: string; x: number; y: number; goal: { x: number; y: number } }
export interface InvasionLayout { vila: TileRect; points: InvasionPoint[] }

/** Marca dos invasores no Monster (questLever): sem respawn, e o bando só chama outros invasores. */
export const INVASION_LEVER = "invasao_da_vila";
const KV_VERSION = 1;
const SYNC_MS = 1000;
const SAVE_MS = 5000;
const REPATH_MS = 1500;
/** Entregas pendentes mais velhas que isto (dias) caem (quem nunca mais entrou). */
const PENDING_DAYS = 30;

const prop = (o: { properties?: { name: string; value: unknown }[] }, name: string) => o.properties?.find((p) => p.name === name)?.value;

/** Vila (zona PZ "Vila de Pedra Clara") e os objetos `invasion_point` (tools/mapgen/generate.mjs, lateObjects18). */
export function parseInvasion(map: TiledMap): InvasionLayout | null {
  const t = map.tilewidth;
  const zone = findObjects(map, "zone").find((o) => o.name === PZ_ZONE_NAMES[0]);
  const points = findObjects(map, "invasion_point").map((o) => {
    const p = objectTile(o, t);
    const gx = Number(prop(o, "goalX")), gy = Number(prop(o, "goalY"));
    return { name: o.name, x: p.x, y: p.y, goal: Number.isInteger(gx) && Number.isInteger(gy) ? { x: gx, y: gy } : { x: p.x, y: p.y } };
  });
  if (!zone || !points.length) return null;
  const vila = { x0: Math.floor(zone.x / t), y0: Math.floor(zone.y / t), x1: Math.floor((zone.x + zone.width - 1) / t), y1: Math.floor((zone.y + zone.height - 1) / t) };
  return { vila, points };
}

export interface InvasionHost {
  layout: InvasionLayout | null;
  monsters: MonsterManager;
  players: () => Iterable<PlayerState>;
  getPlayer: (id: string) => PlayerState | undefined;
  send: (id: string, type: string, msg: unknown) => void;
  broadcast: (type: string, msg: unknown) => void;
  inventory: { addItem(p: PlayerState, item: ItemInstance): number };
  /** Mochila cheia: põe no chão aos pés (true = coube). */
  placeLoot?: (p: PlayerState, item: ItemInstance) => boolean;
  /** Ganhou prêmio numa invasão em que a Vila foi defendida (conquista "Defensor da Vila"). */
  onDefended?: (p: PlayerState) => void;
  /** Grava o personagem logo depois de receber o prêmio (a entrega pendente já saiu do kv). */
  save?: (id: string) => void;
  /** JSON do estado (kv `invasao.v1`); ausente = só memória. */
  store?: { get(): string | undefined; set(value: string): void };
  /** Personagem no mundo sem ninguém no controle (caiu ou saiu em combate): não conta como presente. Ausente = nunca. */
  away?: (id: string) => boolean;
  defs?: (id: string) => MonsterDef | undefined;
  now?: () => number;
  rng?: () => number;
}

/** Invasão em andamento (o que sobrevive a reinício está em `Saved`). */
interface Run {
  /** `until` do evento: identifica a ocorrência (a mesma depois de um reinício). */
  key: number;
  name: string;
  start: number;
  end: number;
  /** Última onda que já nasceu NESTA execução do servidor (-1 = nenhuma). */
  wave: number;
  points: Map<string, number>;
  spawned: number;
  killed: number;
  leaderSpawned: boolean;
  leaderKilled: boolean;
  leaderName: string;
}

interface SavedRun {
  key: number; name: string; start: number; end: number; points: Record<string, number>;
  spawned: number; killed: number; leaderSpawned: boolean; leaderKilled: boolean; leaderName: string;
}
/** `done`: chaves (`until`) das ocorrências já encerradas que ainda não venceram (podem voltar a ser anunciadas). */
interface Saved { v: number; run: SavedRun | null; pending: Record<string, InvasionResult & { at: number }>; done?: number[] }

const nameKey = (name: string) => name.trim().toLowerCase();

export class InvasionSystem {
  private run: Run | null = null;
  /** Invasão gravada antes do reinício, esperando o EventSystem confirmar que ela continua (start com o mesmo `until`). */
  private restore: SavedRun | null = null;
  private pending = new Map<string, InvasionResult & { at: number }>();
  /**
   * Ocorrências (`until`) já encerradas. A mesma janela agendada volta a "começar" quando um evento manual a interrompe e
   * acaba antes dela, ou depois de /evento parar + reinício (a supressão do EventSystem é só memória): sem isto, as ondas
   * rodavam e premiavam de novo.
   */
  private readonly done = new Set<number>();
  /** Invasores vivos desta execução: id → monstro e se é o líder. */
  private readonly live = new Map<string, { m: Monster; leader: boolean }>();
  /** Todo invasor desta ocorrência (vivo ou não): o veneno de um invasor morto ainda é dano de invasor. */
  private readonly invaderIds = new Set<string>();
  /**
   * Dano que cada jogador (sessão) levou de invasores e outro ainda não curou: a cura só pontua até este saldo, senão
   * curar o buraco de vida de quem tirou um item de +vida (ou levou dano de outra coisa) virava ponto de invasão.
   */
  private readonly wounds = new Map<string, number>();
  /** Último estado mandado a cada jogador (só manda quando muda). */
  private readonly lastSent = new Map<string, string>();
  private nextSync = 0;
  private nextSave = 0;
  private dirty = false;
  private readonly now: () => number;
  private readonly rng: () => number;

  constructor(private readonly o: InvasionHost) {
    this.now = o.now ?? Date.now;
    this.rng = o.rng ?? Math.random;
    this.load();
  }

  // --- persistência ----------------------------------------------------------------------------------------------------

  private load(): void {
    let v: Partial<Saved> | null = null;
    try { const raw = this.o.store?.get(); v = raw ? (JSON.parse(raw) as Partial<Saved>) : null; } catch { v = null; }
    if (!v || v.v !== KV_VERSION) return;
    const now = this.now();
    for (const [k, p] of Object.entries(v.pending ?? {})) {
      if (p && Number.isFinite(p.chests) && p.chests > 0 && now - (p.at ?? 0) < PENDING_DAYS * 86_400_000) this.pending.set(k, p);
    }
    for (const k of Array.isArray(v.done) ? v.done : []) if (Number.isFinite(k) && k > now) this.done.add(k);
    const r = v.run;
    if (r && Number.isFinite(r.key) && Number.isFinite(r.start) && Number.isFinite(r.end) && !this.done.has(r.key)) this.restore = r;
  }

  private persist(): void {
    if (!this.o.store) return;
    this.dirty = false;
    const r = this.run ?? null;
    const run: SavedRun | null = r ? {
      key: r.key, name: r.name, start: r.start, end: r.end, points: Object.fromEntries(r.points),
      spawned: r.spawned, killed: r.killed, leaderSpawned: r.leaderSpawned, leaderKilled: r.leaderKilled, leaderName: r.leaderName,
    } : this.restore;
    const saved: Saved = { v: KV_VERSION, run, pending: Object.fromEntries(this.pending), done: [...this.done] };
    try { this.o.store.set(JSON.stringify(saved)); } catch { /* disco: tenta no próximo */ this.dirty = true; }
  }

  /** Ocorrência encerrada (prêmio entregue): não começa de novo. Chaves vencidas saem (a janela não volta mais). */
  private markDone(key: number, now: number): void {
    for (const k of this.done) if (k <= now) this.done.delete(k);
    if (key > now) this.done.add(key);
  }

  // --- começo e fim (EventSystem) ----------------------------------------------------------------------------------------

  /** Evento começou (onStart). Só os com `invasion`; a mesma ocorrência gravada antes do reinício continua de onde estava. */
  start(ev: ActiveEvent, now = this.now()): boolean {
    const def = eventDef(ev.id);
    if (!def?.invasion || !this.o.layout) return false;
    if (this.run?.key === ev.until) return true;
    if (this.done.has(ev.until)) {
      // O EventSystem anunciou o evento de novo (a janela voltou): a Vila já foi invadida nesta janela e o prêmio já saiu.
      this.o.broadcast(S2C.Feed, { text: `🛡 ${def.name}: a invasão desta janela já terminou. A Vila fica em paz até a próxima.`, kind: "info" } satisfies FeedMsg);
      return false;
    }
    if (this.run) this.finish(now);
    const r = this.restore?.key === ev.until ? this.restore : null;
    if (this.restore && !r) this.settleRestore(now);
    this.restore = null;
    // Agendado: a janela é a da agenda (reiniciar no meio não muda as ondas); manual (/evento): começa agora.
    const sched = scheduledEvent(new Date(now));
    const start = r?.start ?? (sched?.id === ev.id && sched.until === ev.until ? ev.until - def.durationMin * 60_000 : now);
    this.run = {
      key: ev.until, name: def.name, start, end: ev.until, wave: -1,
      points: new Map(Object.entries(r?.points ?? {}).filter(([, n]) => Number.isFinite(n) && n > 0)),
      // Quem estava vivo no reinício sumiu: não conta como nascido nem como derrotado.
      spawned: r ? r.killed : 0, killed: r?.killed ?? 0,
      leaderSpawned: !!r?.leaderKilled, leaderKilled: !!r?.leaderKilled, leaderName: r?.leaderName ?? "",
    };
    this.dirty = true;
    this.nextSync = 0;
    return true;
  }

  /** Evento acabou (onEnd: hora, /evento parar ou troca). */
  end(ev: ActiveEvent, now = this.now()): void {
    if (this.run && eventDef(ev.id)?.invasion) this.finish(now);
  }

  get active(): boolean { return !!this.run; }

  // --- tique ---------------------------------------------------------------------------------------------------------

  tick(now = this.now()): void {
    const r = this.run;
    if (!r) {
      // Gravada antes de um reinício e já vencida (o servidor estava fora no fim): fecha a conta e guarda as entregas.
      if (this.restore && now >= this.restore.end) this.settleRestore(now);
      if (this.dirty && now >= this.nextSave) { this.nextSave = now + SAVE_MS; this.persist(); }
      return;
    }
    if (now >= r.end) { this.finish(now); return; }
    this.collect();
    const w = invasionWaveIndex(r.start, r.end, now);
    // Só a onda atual: as que passaram com o servidor fora (ou num tick atrasado) não nascem acumuladas.
    if (w !== null && w > r.wave) { r.wave = w; this.spawnWave(w, now); }
    for (const e of this.live.values()) this.march(e.m, now);
    if (now >= this.nextSync) { this.nextSync = now + SYNC_MS; this.healWounds(); this.sync(now); }
    if (this.dirty && now >= this.nextSave) { this.nextSave = now + SAVE_MS; this.persist(); }
  }

  /** Invasores que saíram do mundo desde o último tique: morto (vida ≤ 0) conta como derrotado. */
  private collect(): void {
    const r = this.run!;
    for (const [id, e] of this.live) {
      if (this.o.monsters.get(id) === e.m) continue;
      this.live.delete(id);
      if (e.m.s.hp > 0) continue; // removido por erro/limpeza: não foi abatido
      r.killed++;
      if (e.leader) r.leaderKilled = true;
      this.dirty = true;
    }
  }

  // --- ondas -----------------------------------------------------------------------------------------------------------

  private inArea(x: number, y: number, margin: number): boolean {
    const v = this.o.layout!.vila;
    return x >= v.x0 - margin && x <= v.x1 + margin && y >= v.y0 - margin && y <= v.y1 + margin;
  }

  private bounds(): TileRect {
    const v = this.o.layout!.vila, m = INVASION_BOUNDS_MARGIN;
    return { x0: v.x0 - m, y0: v.y0 - m, x1: v.x1 + m, y1: v.y1 + m };
  }

  /**
   * Levels de quem defende agora: vivo, no controle (não ausente) e FORA da PZ, a até INVASION_AREA_MARGIN da Vila. Quem
   * fica na praça (os invasores não entram na PZ) ou caiu e ficou no mundo não luta: contar essa gente inflava as ondas.
   */
  presentLevels(): number[] {
    const out: number[] = [];
    for (const p of this.o.players()) {
      if (p.hp <= 0 || this.o.away?.(p.id) || this.o.monsters.inPz(p.x, p.y) || !this.inArea(p.x, p.y, INVASION_AREA_MARGIN)) continue;
      out.push(p.level);
    }
    return out;
  }

  private spawnWave(i: number, now: number): void {
    const r = this.run!, layout = this.o.layout!;
    const plan = invasionWavePlan(i, invasionPresence(this.presentLevels()), this.live.size, this.rng);
    if (r.leaderKilled) delete plan.leader; // reinício na última onda depois de o líder cair: ele não volta
    const bounds = this.bounds();
    const def = (id: string) => (this.o.defs ?? monsterDef)(id);
    const sides = new Set<string>();
    let n = 0, k = Math.floor(this.rng() * layout.points.length);
    const one = (d: MonsterDef, o: { hpMult?: number; elite?: boolean }): Monster | null => {
      // Ponto da vez (rodízio) com um sorteio de ±2; sem tile livre ali, tenta o próprio ponto.
      const pt = layout.points[k++ % layout.points.length]!;
      const jx = Math.floor(this.rng() * 5) - 2, jy = Math.floor(this.rng() * 5) - 2;
      const m = this.o.monsters.spawnQuest(d, pt.x + jx, pt.y + jy, { leverId: INVASION_LEVER, bounds, ...o }, now)
        ?? this.o.monsters.spawnQuest(d, pt.x, pt.y, { leverId: INVASION_LEVER, bounds, ...o }, now);
      if (!m) return null;
      this.enlist(m, pt);
      this.invaderIds.add(m.s.id);
      sides.add(invasionSide(pt.x, pt.y, layout.vila));
      return m;
    };
    const leaderDef = plan.leader ? def(plan.leader.defId) : undefined;
    const leader = plan.leader && leaderDef ? one(leaderDef, { hpMult: plan.leader.hpMult, elite: true }) : null;
    if (leader) {
      this.live.set(leader.s.id, { m: leader, leader: true });
      r.leaderSpawned = true;
      r.leaderName = leaderDef!.name;
      r.spawned++;
      n++;
      this.o.broadcast(S2C.Announce, { text: `O líder da invasão chegou: ${leaderDef!.name} (elite)! Derrote-o para salvar a Vila.`, from: "Invasão" } satisfies AnnounceMsg);
    }
    for (const s of plan.monsters) {
      const d = def(s.defId);
      const m = d ? one(d, {}) : null;
      if (!m) continue;
      this.live.set(m.s.id, { m, leader: false });
      r.spawned++;
      n++;
    }
    this.dirty = true;
    this.nextSync = 0;
    const list = [...sides].map((s) => `do ${s}`);
    const from = list.length > 1 ? `${list.slice(0, -1).join(", ")} e ${list.at(-1)}` : list[0] ?? "de todos os lados";
    const head = `⚔ ${r.name} — onda ${i + 1}/${INVASION_WAVES.length}`;
    // Teto de vivos cheio (ou sem tile livre): nada nasceu, e "0 invasores vindo" parecia que a onda tinha falhado.
    const text = n > 0 ? `${head}: ${n} invasores vindo ${from}!` : `${head}: reforços aguardam — a Vila já está cercada de invasores!`;
    this.o.broadcast(S2C.Feed, { text, kind: "boss" } satisfies FeedMsg);
  }

  /** Invasor recém-nascido: destino na borda da PZ (o "spawn" dele, raio de chegada) e mira só em quem está perto. */
  private enlist(m: Monster, pt: InvasionPoint): void {
    m.spawn = { defId: m.def.id, x: pt.goal.x, y: pt.goal.y, count: 1, radius: INVASION_GOAL_RADIUS };
    const b = m.bounds!;
    m.allow = (p) => p.x >= b.x0 && p.x <= b.x1 && p.y >= b.y0 && p.y <= b.y1 && cheb(p.x, p.y, m.s.x, m.s.y) <= INVASION_AGGRO;
  }

  /** Ocioso (sem alvo) e longe da borda: um passo em direção a ela (caminho A*, ou guloso se o caminho falhar). */
  private march(m: Monster, now: number): void {
    if (m.mode !== "idle" || m.s.hp <= 0 || now < m.stepEndsAt) return;
    const g = m.spawn;
    if (cheb(m.s.x, m.s.y, g.x, g.y) <= g.radius) return;
    const mm = this.o.monsters;
    // Caminho novo ao trocar de destino (voltou de uma perseguição), a cada REPATH_MS, ou sem caminho (no máximo a cada
    // THINK_MS: quem está preso não refaz o A* todo tique).
    const stale = m.pathGoal.x !== g.x || m.pathGoal.y !== g.y || now - m.pathAt >= REPATH_MS;
    if (stale || (!m.path?.length && now - m.pathAt >= THINK_MS)) computePath(m, mm, g, now, false);
    if (!followPath(m, mm, now)) greedyStep(m, mm, g, now, true);
  }

  // --- contribuição ----------------------------------------------------------------------------------------------------

  /** CombatHooks.onDealt: dano de `playerId` (ou da invocação dele) num monstro. Só invasores contam. */
  onDamage(playerId: string, m: Monster, dealt: number): void {
    const r = this.run;
    if (!r || !this.live.has(m.s.id)) return;
    const p = this.o.getPlayer(playerId);
    if (!p) return;
    this.add(r, p.name, invasionDamagePoints(dealt, m.def.hp));
  }

  /** CombatHooks.onPlayerDamaged: dano de invasor (golpe, habilidade ou veneno) abre "ferida" que a cura de outro pontua. */
  onPlayerDamaged(p: PlayerState, sourceId: string, dealt: number): void {
    if (!this.run || !(dealt > 0) || !this.invaderIds.has(sourceId)) return;
    this.wounds.set(p.id, Math.min(p.maxHp, (this.wounds.get(p.id) ?? 0) + dealt));
  }

  /** CombatHooks.onHealOther: cura em outro jogador que está na área da invasão, só até o saldo de dano de invasor dele. */
  onHealOther(healer: PlayerState, target: PlayerState, healed: number): void {
    const r = this.run;
    if (!r || !this.inArea(target.x, target.y, INVASION_AREA_MARGIN)) return;
    // Saldo limitado ao que faltava antes desta cura (o curado pode ter tomado poção no meio); a cura consome o saldo.
    const wound = Math.min(this.wounds.get(target.id) ?? 0, target.maxHp - target.hp + healed);
    const counted = Math.min(healed, wound);
    if (wound - counted > 0) this.wounds.set(target.id, wound - counted);
    else this.wounds.delete(target.id);
    this.add(r, healer.name, invasionHealPoints(counted, target.maxHp));
  }

  /** 1×/s: quem voltou à vida cheia (poção, regeneração, morte) fecha a ferida; quem saiu, também. */
  private healWounds(): void {
    for (const [id, n] of this.wounds) {
      const p = this.o.getPlayer(id);
      const missing = p ? p.maxHp - p.hp : 0;
      if (missing <= 0) this.wounds.delete(id);
      else if (n > missing) this.wounds.set(id, missing);
    }
  }

  private add(r: Run, name: string, pts: number): void {
    if (!(pts > 0)) return;
    const k = nameKey(name);
    r.points.set(k, (r.points.get(k) ?? 0) + pts);
    this.dirty = true;
  }

  /** Pontos de um personagem na invasão em andamento (testes e HUD). */
  pointsOf(name: string): number { return this.run?.points.get(nameKey(name)) ?? 0; }

  // --- fim e prêmio ----------------------------------------------------------------------------------------------------

  private finish(now: number): void {
    const r = this.run;
    if (!r) return;
    this.collect();
    this.run = null;
    for (const { m } of this.live.values()) this.o.monsters.despawn(m);
    this.live.clear();
    this.invaderIds.clear();
    this.wounds.clear();
    this.markDone(r.key, now);
    const defended = villageDefended(r);
    this.settle(r.points, { defended, killed: r.killed, spawned: r.spawned }, now);
    const pct = Math.round(INVASION_DEFEND_PCT * 100);
    const text = defended
      ? `🛡 A Vila resistiu à invasão! ${r.killed}/${r.spawned} invasores derrotados.`
      : `💀 A Vila não resistiu: ${r.killed}/${r.spawned} invasores derrotados (meta: ${pct}%${r.leaderSpawned ? " e o líder" : ""}).`;
    this.o.broadcast(S2C.Feed, { text, kind: defended ? "boss" : "info" } satisfies FeedMsg);
    this.persist();
  }

  /** Gravada antes de um reinício e não retomada: a conta fecha com o placar gravado (quem estava vivo não volta). */
  private settleRestore(now: number): void {
    const r = this.restore;
    this.restore = null;
    if (!r) return;
    this.markDone(r.key, now);
    const score = { spawned: r.spawned, killed: r.killed, leaderSpawned: r.leaderSpawned, leaderKilled: r.leaderKilled };
    this.settle(new Map(Object.entries(r.points ?? {})), { defended: villageDefended(score), killed: r.killed, spawned: r.spawned }, now);
    this.persist();
  }

  /** Prêmio de cada contribuinte: na hora se estiver online, senão fica pendente para o próximo login. */
  private settle(points: Map<string, number>, s: { defended: boolean; killed: number; spawned: number }, now: number): void {
    const online = new Map<string, PlayerState>();
    for (const p of this.o.players()) online.set(nameKey(p.name), p);
    for (const [k, pts] of points) {
      const result: InvasionResult = { ...s, points: Math.floor(pts), chests: invasionChests(pts, s.defended) };
      const p = online.get(k);
      if (p) { this.deliver(p, result); continue; }
      if (result.chests > 0) this.pending.set(k, { ...result, at: now });
    }
    // Quem estava online sem contribuir também vê o fim (o HUD fecha com o placar).
    for (const [k, p] of online) {
      if (points.has(k)) continue;
      this.lastSent.delete(p.id);
      this.o.send(p.id, S2C.Invasion, { active: null, result: { ...s, points: 0, chests: 0 } } satisfies InvasionMsg);
    }
    this.dirty = true;
  }

  private deliver(p: PlayerState, res: InvasionResult): void {
    this.lastSent.delete(p.id);
    this.o.send(p.id, S2C.Invasion, { active: this.run ? this.stateFor(p) : null, result: res } satisfies InvasionMsg);
    if (res.chests <= 0) {
      if (res.points > 0) this.o.send(p.id, S2C.Notice, { text: `Invasão: sua contribuição foi ${res.points} ponto(s); o prêmio pede ${INVASION_MIN_POINTS}.`, kind: "info" } satisfies NoticeMsg);
      return;
    }
    const chest = makeItem(BOUNTY_CHEST_ID, res.chests);
    const left = this.o.inventory.addItem(p, chest);
    const fell = left > 0 && !!this.o.placeLoot?.(p, { ...chest, uid: newUid(), count: left });
    const extra = left > 0 ? (fell ? " (mochila cheia: caiu aos seus pés)" : " (mochila cheia: perdido)") : "";
    const why = res.defended ? "a Vila foi defendida" : "a Vila caiu, mas você ajudou";
    this.o.send(p.id, S2C.Notice, { text: `Invasão: ${res.chests} Baú(s) de Recompensa — ${why} (${res.points} pontos)${extra}.`, kind: "good", log: true } satisfies NoticeMsg);
    if (res.defended) this.o.onDefended?.(p);
    this.o.save?.(p.id);
  }

  // --- jogadores -------------------------------------------------------------------------------------------------------

  /** Entrada no mundo (onJoin): entrega o prêmio pendente e manda o estado. */
  onJoin(p: PlayerState): void {
    const k = nameKey(p.name);
    const pend = this.pending.get(k);
    if (pend) {
      this.pending.delete(k);
      this.dirty = true;
      const { at: _at, ...res } = pend;
      this.deliver(p, res);
      this.persist();
    }
    this.sendTo(p.id);
  }

  /** Reconexão ou pedido: o estado atual (null = nenhuma invasão). */
  sendTo(id: string): void {
    const p = this.o.getPlayer(id);
    if (!p) return;
    this.lastSent.delete(id);
    this.o.send(id, S2C.Invasion, { active: this.run ? this.stateFor(p) : null } satisfies InvasionMsg);
  }

  /** Saída (cleanupSession): a contribuição fica pelo nome; o cache do HUD e a ferida (da sessão) saem. */
  removePlayer(id: string): void { this.lastSent.delete(id); this.wounds.delete(id); }

  /** Estado para o HUD de um jogador (a contribuição é a dele). */
  stateFor(p: PlayerState, common = this.commonState()): InvasionState {
    return { ...common, mine: Math.floor(this.pointsOf(p.name)) };
  }

  /** A parte do estado que é igual para todos. */
  private commonState(): Omit<InvasionState, "mine"> {
    const r = this.run!;
    const w = invasionWaveIndex(r.start, r.end, this.now());
    const wave = w === null ? INVASION_WAVES.length - 1 : w;
    let leader: InvasionState["leader"] = null;
    if (r.leaderSpawned) {
      const e = [...this.live.values()].find((x) => x.leader);
      leader = e ? { name: r.leaderName, alive: true, x: e.m.s.x, y: e.m.s.y } : { name: r.leaderName, alive: false };
    }
    return {
      name: r.name, start: r.start, end: r.end, wave: wave + 1, waves: INVASION_WAVES.length,
      nextWaveAt: wave >= 0 ? invasionNextWaveAt(r.start, r.end, wave) : r.start,
      alive: this.live.size, spawned: r.spawned, killed: r.killed, defendPct: INVASION_DEFEND_PCT, leader,
      points: this.o.layout!.points.map((pt) => ({ x: pt.x, y: pt.y })), goal: INVASION_MIN_POINTS,
    };
  }

  /** 1×/s: cada jogador recebe o estado se ele mudou desde o último envio. */
  private sync(_now: number): void {
    const common = this.commonState();
    for (const p of this.o.players()) {
      const st = this.stateFor(p, common);
      const sig = JSON.stringify(st);
      if (this.lastSent.get(p.id) === sig) continue;
      this.lastSent.set(p.id, sig);
      this.o.send(p.id, S2C.Invasion, { active: st } satisfies InvasionMsg);
    }
  }

  /** Invasores vivos agora (testes e /status). */
  get aliveCount(): number { return this.live.size; }
  /** Placar da invasão em andamento (testes). */
  get score(): { spawned: number; killed: number; leaderSpawned: boolean; leaderKilled: boolean; wave: number } | null {
    const r = this.run;
    return r ? { spawned: r.spawned, killed: r.killed, leaderSpawned: r.leaderSpawned, leaderKilled: r.leaderKilled, wave: r.wave } : null;
  }
  /** Prêmios esperando o próximo login (testes). */
  pendingFor(name: string): (InvasionResult & { at: number }) | undefined { return this.pending.get(nameKey(name)); }
}

// Chefe de raide (2026-11-06; regras e números em shared/data/raid.ts). O EventSystem avisa o começo e o fim do evento
// com `raid` (start/end). O chefe da semana nasce no ponto de invasão do norte (MonsterManager.spawnQuest: sem respawn,
// confinado a RAID_BOUNDS do ponto, nunca em PZ). A cada segundo:
// - quem bateu em algo do raide (o chefe ou os ajudantes que ele invoca) ou curou alguém na área ganha a fatia de
//   tempo atual (RAID_SLICE_MS) como "engajado";
// - a vida máxima do chefe sobe para raidBossHp(levels de quem está engajado agora) e nunca desce (o que sobe entra
//   também na vida atual, a fração da barra não volta);
// - o dano acompanha o menor level engajado agora (raidDamageMult), para o level baixo poder ficar na luta.
// No fim (chefe caiu, ou o evento acabou e ele foi embora), cada personagem engajado por RAID_MIN_ENGAGED_MS ganha
// Baú de Recompensa (+1 com vitória). Só memória: um reinício no meio do raide recomeça o chefe com a vida-base e zera
// o engajamento; quem estiver offline no fim não recebe (o fim é um instante em que todo mundo está lutando).
import {
  BOUNTY_CHEST_ID, RAID_AREA, RAID_BOUNDS, RAID_POINT, RAID_SLICE_MS, S2C, monsterDef, raidBossHp, raidBossOfWeek, raidChests,
  raidDamageMult, weekId,
  type ActiveEvent, type FeedMsg, type ItemInstance, type MonsterDef, type NoticeMsg, type RaidResult,
} from "@lemonquest/shared";
import type { PlayerState } from "../state.ts";
import type { InvasionLayout } from "./invasion.ts";
import { makeItem, newUid } from "./inventory.ts";
import { cheb, type Monster, type MonsterManager, type TileRect } from "./monsters.ts";

/** Marca dos monstros do raide no Monster (questLever): sem respawn, e o bando só chama outros do raide. */
export const RAID_LEVER = "raide";
const TICK_MS = 1000;

export interface RaidHost {
  /** Pontos de invasão (parseInvasion): o raide usa o RAID_POINT. */
  layout: InvasionLayout | null;
  monsters: MonsterManager;
  players: () => Iterable<PlayerState>;
  getPlayer: (id: string) => PlayerState | undefined;
  send: (id: string, type: string, msg: unknown) => void;
  broadcast: (type: string, msg: unknown) => void;
  inventory: { addItem(p: PlayerState, item: ItemInstance): number };
  /** Mochila cheia: põe no chão aos pés (true = coube). */
  placeLoot?: (p: PlayerState, item: ItemInstance) => boolean;
  /** Ganhou prêmio num raide vencido (conquistas "Força-Tarefa"). */
  onVictory?: (p: PlayerState) => void;
  save?: (id: string) => void;
  /** Personagem no mundo sem ninguém no controle: não se engaja. Ausente = nunca. */
  away?: (id: string) => boolean;
  defs?: (id: string) => MonsterDef | undefined;
  log?: (msg: string) => void;
  now?: () => number;
}

interface Run {
  /** `until` do evento: identifica a ocorrência. */
  key: number;
  start: number;
  boss: Monster;
  /** Fatias engajadas por personagem (nome em minúsculas → índices de fatia). */
  slices: Map<string, Set<number>>;
  /** Nome como o jogador escreveu (para os avisos). */
  names: Map<string, string>;
  /** Passou de 50% (aviso uma vez). */
  half: boolean;
}

const nameKey = (name: string) => name.trim().toLowerCase();

export class RaidSystem {
  private run: Run | null = null;
  /** Ocorrências já encerradas (não começam de novo na mesma janela). */
  private readonly done = new Set<number>();
  private nextTick = 0;
  private readonly now: () => number;

  constructor(private readonly o: RaidHost) {
    this.now = o.now ?? Date.now;
  }

  get active(): boolean { return !!this.run; }
  /** O chefe vivo do raide (testes e admin). */
  get boss(): Monster | undefined { return this.run?.boss; }

  private point(): { x: number; y: number } | null {
    return this.o.layout?.points.find((p) => p.name === RAID_POINT) ?? null;
  }

  private bounds(pt: { x: number; y: number }): TileRect {
    return { x0: pt.x - RAID_BOUNDS, y0: pt.y - RAID_BOUNDS, x1: pt.x + RAID_BOUNDS, y1: pt.y + RAID_BOUNDS };
  }

  /** Começo do evento: convoca o chefe da semana (uma vez por ocorrência). */
  start(ev: ActiveEvent, now = this.now()): boolean {
    if (!ev.raid || this.run || this.done.has(ev.until)) return false;
    const pt = this.point();
    const def = (this.o.defs ?? monsterDef)(raidBossOfWeek(weekId(new Date(now))));
    if (!pt || !def) { this.o.log?.(`[raide] sem ponto ${RAID_POINT} ou chefe: nada nasce`); return false; }
    const boss = this.o.monsters.spawnQuest(def, pt.x, pt.y, { leverId: RAID_LEVER, bounds: this.bounds(pt), hpMult: raidBossHp([]) / def.hp });
    if (!boss) { this.o.log?.(`[raide] sem tile livre em ${pt.x},${pt.y}`); return false; }
    // Com `bounds` a IA percebe o "mapa inteiro" (feito para a sala do Coliseu, que filtra pelo `allow`): sem filtro o
    // chefe mirava quem caçava a 150 tiles e os ajudantes (herdam o allow) ficavam parados atrás desse alvo distante.
    // Conta da posição do chefe (como a invasão): quem bate de longe da borda do confinamento ainda é visto.
    boss.allow = (p) => cheb(p.x, p.y, boss.s.x, boss.s.y) <= RAID_AREA;
    this.run = { key: ev.until, start: now, boss, slices: new Map(), names: new Map(), half: false };
    this.nextTick = now;
    const text = `⚔ Raide: ${def.name} chegou ao norte da Vila! Todo mundo junto, de qualquer level: quem lutar ganha Baú de Recompensa.`;
    this.o.broadcast(S2C.Feed, { text, kind: "boss" } satisfies FeedMsg);
    this.o.broadcast(S2C.Notice, { text, kind: "warn", log: true } satisfies NoticeMsg);
    this.o.log?.(`[raide] ${def.name} nasceu em ${boss.s.x},${boss.s.y}`);
    return true;
  }

  /** O evento do raide foi prorrogado/encurtado (EventHost.onExtend): a ocorrência passa a ter o fim novo. */
  extend(prev: ActiveEvent, next: ActiveEvent): void {
    if (this.run && this.run.key === prev.until) this.run.key = next.until;
  }

  /** Fim do evento: se o chefe ainda está vivo, ele vai embora (sem XP nem loot) e quem se engajou leva o prêmio menor. */
  end(ev: ActiveEvent, now = this.now()): void {
    const r = this.run;
    if (!r || r.key !== ev.until) return;
    this.finish(false, now);
  }

  tick(now = this.now()): void {
    const r = this.run;
    if (!r || now < this.nextTick) return;
    this.nextTick = now + TICK_MS;
    if (!this.o.monsters.get(r.boss.s.id)) { this.finish(true, now); return; }
    this.scale(r, now);
  }

  /** Fatia atual do relógio do raide. */
  private slice(r: Run, now: number): number {
    return Math.floor(Math.max(0, now - r.start) / RAID_SLICE_MS);
  }

  private engage(p: PlayerState, now: number): void {
    const r = this.run;
    if (!r || p.hp <= 0 || this.o.away?.(p.id)) return;
    const k = nameKey(p.name);
    let s = r.slices.get(k);
    if (!s) r.slices.set(k, (s = new Set()));
    s.add(this.slice(r, now));
    r.names.set(k, p.name);
  }

  /** Engajados agora: fatia atual ou a anterior, online e no controle. */
  private engagedNow(r: Run, now: number): PlayerState[] {
    const cur = this.slice(r, now);
    const out: PlayerState[] = [];
    for (const p of this.o.players()) {
      const s = r.slices.get(nameKey(p.name));
      if (s && (s.has(cur) || s.has(cur - 1)) && p.hp > 0 && !this.o.away?.(p.id)) out.push(p);
    }
    return out;
  }

  private scale(r: Run, now: number): void {
    const engaged = this.engagedNow(r, now);
    const s = r.boss.s;
    const max = raidBossHp(engaged.map((p) => p.level));
    if (max > s.maxHp) {
      s.hp = Math.min(max, s.hp + (max - s.maxHp));
      s.maxHp = max;
    }
    r.boss.dmgMult = engaged.length ? raidDamageMult(Math.min(...engaged.map((p) => p.level))) : 1;
    if (!r.half && s.hp <= s.maxHp / 2) {
      r.half = true;
      this.o.broadcast(S2C.Feed, { text: `⚔ Raide: ${r.boss.def.name} está pela metade! ${engaged.length} na luta.`, kind: "boss" } satisfies FeedMsg);
    }
  }

  /** É do raide: o chefe ou um ajudante que ele invocou. */
  private isRaid(m: Monster): boolean {
    return !!this.run && (m === this.run.boss || m.questLever === RAID_LEVER || m.minionOf === this.run.boss.s.id);
  }

  /** CombatHooks.onDealt: dano em algo do raide engaja quem bateu. */
  onDamage(playerId: string, m: Monster, dealt: number, now = this.now()): void {
    if (!(dealt > 0) || !this.isRaid(m)) return;
    const p = this.o.getPlayer(playerId);
    if (p) this.engage(p, now);
  }

  /** CombatHooks.onHealOther: cura de verdade em alguém na área do raide engaja quem curou. */
  onHealOther(healer: PlayerState, target: PlayerState, healed: number, now = this.now()): void {
    const pt = this.point();
    if (!this.run || !pt || !(healed > 0) || cheb(target.x, target.y, pt.x, pt.y) > RAID_AREA) return;
    if (this.o.monsters.inPz(target.x, target.y)) return;
    this.engage(healer, now);
  }

  private finish(victory: boolean, now: number): void {
    const r = this.run;
    if (!r) return;
    this.run = null;
    this.done.add(r.key);
    const name = r.boss.def.name;
    if (!victory) {
      // Vai embora com os ajudantes (kill do MonsterManager: sem XP, sem loot, sem respawn por ser do raide).
      for (const m of [...this.o.monsters.all()]) if (m === r.boss || m.questLever === RAID_LEVER || m.minionOf === r.boss.s.id) this.o.monsters.kill(m, now);
    }
    const text = victory ? `⚔ Raide vencido! ${name} caiu. Todo mundo que lutou ganha Baú de Recompensa.` : `⚔ Raide: ${name} foi embora antes de cair. Quem lutou leva um Baú de Recompensa.`;
    this.o.broadcast(S2C.Feed, { text, kind: "boss" } satisfies FeedMsg);
    const byKey = new Map<string, PlayerState>();
    for (const p of this.o.players()) byKey.set(nameKey(p.name), p);
    let paid = 0;
    for (const [k, slices] of r.slices) {
      const res: RaidResult = { victory, engagedMs: slices.size * RAID_SLICE_MS, chests: raidChests(slices.size * RAID_SLICE_MS, victory) };
      const p = byKey.get(k);
      if (!p) continue;
      if (this.deliver(p, res)) paid++;
    }
    this.o.log?.(`[raide] ${name}: ${victory ? "vitória" : "foi embora"}; ${r.slices.size} engajado(s), ${paid} premiado(s)`);
  }

  private deliver(p: PlayerState, res: RaidResult): boolean {
    const min = Math.round(res.engagedMs / 1000);
    if (res.chests <= 0) {
      this.o.send(p.id, S2C.Notice, { text: `Raide: você lutou ${min} s; o prêmio pede pelo menos 1 minuto na luta.`, kind: "info", log: true } satisfies NoticeMsg);
      return false;
    }
    const chest = makeItem(BOUNTY_CHEST_ID, res.chests);
    const left = this.o.inventory.addItem(p, chest);
    const fell = left > 0 && !!this.o.placeLoot?.(p, { ...chest, uid: newUid(), count: left });
    const extra = left > 0 ? (fell ? " (mochila cheia: caiu aos seus pés)" : " (mochila cheia: perdido)") : "";
    const why = res.victory ? "o chefe caiu" : "o chefe fugiu, mas você lutou";
    this.o.send(p.id, S2C.Notice, { text: `Raide: ${res.chests} Baú(s) de Recompensa — ${why} (${min} s na luta)${extra}.`, kind: "good", log: true } satisfies NoticeMsg);
    if (res.victory) this.o.onVictory?.(p);
    this.o.save?.(p.id);
    return true;
  }
}

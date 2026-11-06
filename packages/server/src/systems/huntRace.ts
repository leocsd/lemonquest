// Corrida de Caça (2026-11-06; regras e números em shared/data/huntRace.ts). O EventSystem avisa o começo e o fim do
// evento com `race` (start/end). No começo, quem está online (e no controle) é sorteado em dois times equilibrados pela
// soma dos levels; quem entra depois cai no time mais leve ao entrar no mundo ou no primeiro abate. Cada abate de monstro
// selvagem (fora do Coliseu) soma racePoints dividido entre quem tem crédito pelo abate, para o time de cada um. Estado
// por jogador 1×/s quando muda (S2C.Race); no fim, quem pontuou no time vencedor e está online ganha Baú de Recompensa.
// Só memória: um reinício no meio da corrida sorteia de novo e zera o placar (a corrida é curta).
import {
  BOUNTY_CHEST_ID, RACE_CHESTS, RACE_MIN_POINTS, RACE_TEAM_ICON, RACE_TEAM_LABEL, S2C, raceDraw, raceLighter,
  racePoints, raceWinners,
  type ActiveEvent, type FeedMsg, type ItemInstance, type NoticeMsg, type RaceMsg, type RaceResult, type RaceState, type RaceTeam,
} from "@lemonquest/shared";
import type { PlayerState } from "../state.ts";
import { makeItem, newUid } from "./inventory.ts";
import { killCredit, type Monster } from "./monsters.ts";

const SYNC_MS = 1000;

export interface RaceHost {
  players: () => Iterable<PlayerState>;
  getPlayer: (id: string) => PlayerState | undefined;
  send: (id: string, type: string, msg: unknown) => void;
  broadcast: (type: string, msg: unknown) => void;
  inventory: { addItem(p: PlayerState, item: ItemInstance): number };
  placeLoot?: (p: PlayerState, item: ItemInstance) => boolean;
  /** Ganhou o prêmio (conquista "Corrida Vencida"). */
  onWin?: (p: PlayerState) => void;
  save?: (id: string) => void;
  away?: (id: string) => boolean;
  log?: (msg: string) => void;
  now?: () => number;
}

interface Run {
  key: number;
  name: string;
  end: number;
  /** nome em minúsculas → time. */
  team: Map<string, RaceTeam>;
  /** nome em minúsculas → pontos do jogador (frações: o abate é dividido). */
  mine: Map<string, number>;
  points: Record<RaceTeam, number>;
  levels: Record<RaceTeam, number>;
  members: Record<RaceTeam, number>;
}

const nameKey = (name: string) => name.trim().toLowerCase();

export class HuntRaceSystem {
  private run: Run | null = null;
  private readonly done = new Set<number>();
  private readonly lastSent = new Map<string, string>();
  private nextSync = 0;
  private readonly now: () => number;

  constructor(private readonly o: RaceHost) {
    this.now = o.now ?? Date.now;
  }

  get active(): boolean { return !!this.run; }
  /** Time do jogador na corrida em andamento (testes). */
  teamOf(name: string): RaceTeam | undefined { return this.run?.team.get(nameKey(name)); }
  /** Placar (testes). */
  get points(): Record<RaceTeam, number> | undefined { return this.run?.points; }

  start(ev: ActiveEvent, now = this.now()): boolean {
    if (!ev.race || this.run || this.done.has(ev.until)) return false;
    const r: Run = {
      key: ev.until, name: ev.name, end: ev.until, team: new Map(), mine: new Map(),
      points: { limao: 0, laranja: 0 }, levels: { limao: 0, laranja: 0 }, members: { limao: 0, laranja: 0 },
    };
    const present = [...this.o.players()].filter((p) => !this.o.away?.(p.id));
    for (const [name, t] of raceDraw(present.map((p) => ({ name: p.name, level: p.level })))) {
      const p = present.find((x) => x.name === name)!;
      this.put(r, p, t);
    }
    this.run = r;
    this.nextSync = now;
    const text = `🏁 ${ev.name} começou! ${RACE_TEAM_ICON.limao} ${RACE_TEAM_LABEL.limao} (${r.members.limao}) × ${RACE_TEAM_LABEL.laranja} ${RACE_TEAM_ICON.laranja} (${r.members.laranja}): cada abate conta para o seu time.`;
    this.o.broadcast(S2C.Feed, { text, kind: "info" } satisfies FeedMsg);
    for (const p of present) {
      const t = r.team.get(nameKey(p.name))!;
      this.o.send(p.id, S2C.Notice, { text: `Corrida de Caça: você está no ${RACE_TEAM_ICON[t]} ${RACE_TEAM_LABEL[t]}!`, kind: "good" } satisfies NoticeMsg);
    }
    this.sync(now, true);
    this.o.log?.(`[corrida] começou: limão ${r.members.limao} (${r.levels.limao} levels) × laranja ${r.members.laranja} (${r.levels.laranja} levels)`);
    return true;
  }

  private put(r: Run, p: PlayerState, t: RaceTeam): void {
    r.team.set(nameKey(p.name), t);
    r.levels[t] += Math.max(1, p.level);
    r.members[t]++;
  }

  /** Time do jogador, sorteando o mais leve para quem ainda não tem. */
  private ensure(r: Run, p: PlayerState): RaceTeam {
    const k = nameKey(p.name);
    const had = r.team.get(k);
    if (had) return had;
    const t = raceLighter(r.levels, r.members);
    this.put(r, p, t);
    this.o.send(p.id, S2C.Notice, { text: `Corrida de Caça em andamento: você entrou no ${RACE_TEAM_ICON[t]} ${RACE_TEAM_LABEL[t]}!`, kind: "good" } satisfies NoticeMsg);
    return t;
  }

  /** Entrada no mundo durante a corrida: ganha um time e o estado. */
  onJoin(p: PlayerState): void {
    const r = this.run;
    if (!r) return;
    this.ensure(r, p);
    this.lastSent.delete(p.id);
    this.sendTo(p);
  }

  /** CombatHooks.onMonsterKilled: pontos para o time de cada um com crédito (dividido entre eles). Coliseu não conta. */
  onMonsterKilled(m: Monster): void {
    const r = this.run;
    if (!r || m.arenaId || m.s.ownerId || m.minionOf) return;
    const credited = killCredit(m, this.o.getPlayer).map(([id]) => this.o.getPlayer(id)).filter((p): p is PlayerState => !!p);
    if (!credited.length) return;
    const each = racePoints(m.def, m) / credited.length;
    for (const p of credited) {
      const t = this.ensure(r, p);
      r.points[t] += each;
      const k = nameKey(p.name);
      r.mine.set(k, (r.mine.get(k) ?? 0) + each);
    }
  }

  end(ev: ActiveEvent): void {
    const r = this.run;
    if (!r || r.key !== ev.until) return;
    this.run = null;
    this.done.add(r.key);
    const pts: Record<RaceTeam, number> = { limao: Math.floor(r.points.limao), laranja: Math.floor(r.points.laranja) };
    const winners = raceWinners(r.points);
    const head = winners.length === 2 ? "empate!" : winners.length ? `venceu o ${RACE_TEAM_ICON[winners[0]!]} ${RACE_TEAM_LABEL[winners[0]!]}!` : "ninguém pontuou.";
    this.o.broadcast(S2C.Feed, { text: `🏁 Corrida de Caça: ${head} ${RACE_TEAM_ICON.limao} ${pts.limao} × ${pts.laranja} ${RACE_TEAM_ICON.laranja}`, kind: "info" } satisfies FeedMsg);
    let paid = 0;
    for (const p of this.o.players()) {
      const k = nameKey(p.name);
      const team = r.team.get(k);
      if (!team) continue;
      const mine = Math.floor(r.mine.get(k) ?? 0);
      const raw = r.mine.get(k) ?? 0;
      const chests = winners.includes(team) && raw >= RACE_MIN_POINTS ? RACE_CHESTS : 0;
      const result: RaceResult = { winners, points: pts, team, mine, chests };
      this.lastSent.delete(p.id);
      this.o.send(p.id, S2C.Race, { active: null, result } satisfies RaceMsg);
      if (chests > 0 && this.deliver(p, chests, mine)) paid++;
    }
    this.lastSent.clear();
    this.o.log?.(`[corrida] fim: limão ${pts.limao} × laranja ${pts.laranja}; ${paid} premiado(s)`);
  }

  private deliver(p: PlayerState, chests: number, mine: number): boolean {
    const chest = makeItem(BOUNTY_CHEST_ID, chests);
    const left = this.o.inventory.addItem(p, chest);
    const fell = left > 0 && !!this.o.placeLoot?.(p, { ...chest, uid: newUid(), count: left });
    const extra = left > 0 ? (fell ? " (mochila cheia: caiu aos seus pés)" : " (mochila cheia: perdido)") : "";
    this.o.send(p.id, S2C.Notice, { text: `Corrida de Caça: seu time venceu! ${chests} Baú de Recompensa (${mine} ponto(s) seus)${extra}.`, kind: "good", log: true } satisfies NoticeMsg);
    this.o.onWin?.(p);
    this.o.save?.(p.id);
    return true;
  }

  tick(now = this.now()): void {
    if (!this.run || now < this.nextSync) return;
    this.nextSync = now + SYNC_MS;
    this.sync(now, false);
  }

  stateFor(p: PlayerState): RaceState | null {
    const r = this.run;
    const team = r?.team.get(nameKey(p.name));
    if (!r || !team) return null;
    return {
      name: r.name, end: r.end, team, mine: Math.floor(r.mine.get(nameKey(p.name)) ?? 0),
      points: { limao: Math.floor(r.points.limao), laranja: Math.floor(r.points.laranja) },
      members: { ...r.members },
    };
  }

  sendTo(p: PlayerState): void {
    const s = this.stateFor(p);
    const json = JSON.stringify(s);
    if (this.lastSent.get(p.id) === json) return;
    this.lastSent.set(p.id, json);
    this.o.send(p.id, S2C.Race, { active: s } satisfies RaceMsg);
  }

  private sync(_now: number, force: boolean): void {
    if (force) this.lastSent.clear();
    for (const p of this.o.players()) this.sendTo(p);
  }

  /** Saída da sessão: esquece o último estado mandado (o time fica pelo nome). */
  removePlayer(id: string): void {
    this.lastSent.delete(id);
  }
}


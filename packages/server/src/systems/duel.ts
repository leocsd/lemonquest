// Arena de Duelo (2026-11-06; regras e números em shared/data/duel.ts). Desafio pelo menu do jogador (C2S.Duel): 1×1, ou
// 2×2 com o colega do grupo de 2 de cada lado. Aceito, o duelo pega uma sala livre do Coliseu (ArenaSystem.reserve), põe
// cada lado num canto, enche vida e mana e conta DUEL_COUNTDOWN_MS. Na luta, só os dois lados se atacam (a regra do
// PvP e a caveira não valem ali); quem cairia sai da sala com vida e mana cheias, sem perder XP nem itens. Fim: um lado
// inteiro fora, desistência (logout) ou DUEL_MAX_MS (vence quem tem mais vida somada, em %). Todos voltam para onde
// estavam. Vitórias da semana no kv (`duel.week.<weekId>`), para o ranking (C2S.Duel "ranking").
import {
  DUEL_COUNTDOWN_MS, DUEL_INVITE_MS, DUEL_MAX_MS, DUEL_MODES, DUEL_MODE_LABEL, S2C, duelSize, duelTimeWinner, duelTop, weekId,
  type DuelActionMsg, type DuelInvite, type DuelMode, type DuelMsg, type DuelResult, type DuelState, type FeedMsg, type NoticeMsg,
} from "@lemonquest/shared";
import type { PlayerState } from "../state.ts";
import type { ArenaDef } from "./arena.ts";
import type { Point } from "./pathfinding.ts";
import { cheb } from "./monsters.ts";

export interface DuelHost {
  getPlayer: (id: string) => PlayerState | undefined;
  players: () => Iterable<PlayerState>;
  send: (id: string, type: string, msg: unknown) => void;
  broadcast: (type: string, msg: unknown) => void;
  /** Sala livre do Coliseu (reservada até `release`); undefined = todas ocupadas. */
  reserve: () => ArenaDef | undefined;
  release: (arenaId: number) => void;
  teleport: (p: PlayerState, x: number, y: number) => void;
  isFree: (x: number, y: number, selfId: string) => boolean;
  /** Colegas do grupo (party) do jogador, sem ele. */
  partyMates: (id: string) => string[];
  /** Ocupado em outra coisa (Coliseu, troca...): não entra em duelo. Texto do motivo ou null. */
  busy?: (p: PlayerState) => string | null;
  inPz?: (x: number, y: number) => boolean;
  /** Entrou na sala (começo do duelo): o Estagiário para, janelas de NPC fecham. */
  onEnter?: (p: PlayerState) => void;
  /** Saiu da sala (fim ou caiu): some com invocações, limpa condições (o mesmo do Coliseu). */
  onExit?: (p: PlayerState) => void;
  /** Venceu um duelo (conquistas). */
  onWin?: (p: PlayerState) => void;
  getKv?: (key: string) => string | undefined;
  setKv?: (key: string, value: string) => void;
  now?: () => number;
}

interface Invite { fromId: string; toId: string; mode: DuelMode; until: number }

interface Fighter { id: string; name: string; side: 0 | 1; out: boolean; back: Point }

interface Duel {
  mode: DuelMode;
  arena: ArenaDef;
  fighters: Fighter[];
  phase: "countdown" | "fight";
  until: number;
}

/** Desafio a até isto (tiles) do desafiado, como a troca. */
const CHALLENGE_RANGE = 8;

export class DuelSystem {
  private invites: Invite[] = [];
  private readonly duels = new Set<Duel>();
  private readonly byPlayer = new Map<string, Duel>();
  private readonly now: () => number;

  constructor(private readonly o: DuelHost) {
    this.now = o.now ?? Date.now;
  }

  /** Duelo do jogador (testes e regras). */
  duelOf(id: string): Readonly<Duel> | undefined { return this.byPlayer.get(id); }
  /**
   * Duelo em que o jogador ainda luta. No 2×2 quem caiu volta para onde estava e fica no `byPlayer` só até o resultado:
   * para o resto do jogo ele já saiu (PvP normal, logout com permanência), senão ficava até 3 min imune fora da sala.
   */
  private active(id: string): Duel | undefined {
    const d = this.byPlayer.get(id);
    return d && !d.fighters.find((f) => f.id === id)?.out ? d : undefined;
  }
  inDuel(id: string): boolean { return !!this.active(id); }

  private notice(id: string, text: string, kind: NoticeMsg["kind"] = "info"): void {
    this.o.send(id, S2C.Notice, { text, kind } satisfies NoticeMsg);
  }

  // --- convite ---------------------------------------------------------------------------------------------------------

  onAction(p: PlayerState, m: DuelActionMsg, now = this.now()): void {
    if (!m || typeof m !== "object") return;
    if (m.action === "ranking") return this.sendRanking(p, now);
    if (m.action === "challenge") {
      if (typeof m.targetId !== "string" || !DUEL_MODES.includes(m.mode)) return;
      return this.challenge(p, m.targetId, m.mode, now);
    }
    if (m.action === "accept" || m.action === "decline") {
      if (typeof m.fromId !== "string") return;
      const inv = this.invites.find((i) => i.fromId === m.fromId && i.toId === p.id && i.until > now);
      this.invites = this.invites.filter((i) => i !== inv);
      if (!inv) { this.sendState(p.id); return; }
      if (m.action === "decline") {
        this.notice(inv.fromId, `${p.name} recusou o duelo.`);
        this.sendState(p.id);
        this.sendState(inv.fromId);
        return;
      }
      this.begin(inv, now);
    }
  }

  /** Lados do duelo: [desafiante (+ colega)], [desafiado (+ colega)]; texto do erro se não fecha. */
  private sides(a: PlayerState, b: PlayerState, mode: DuelMode): { sides: [PlayerState[], PlayerState[]] } | { error: string } {
    if (mode === "1x1") return { sides: [[a], [b]] };
    const mate = (p: PlayerState): PlayerState | string => {
      const ms = this.o.partyMates(p.id).map((id) => this.o.getPlayer(id)).filter((x): x is PlayerState => !!x);
      if (ms.length !== 1) return `${p.name} precisa estar num grupo de exatamente 2 para o duelo 2×2.`;
      return ms[0]!;
    };
    const ma = mate(a), mb = mate(b);
    if (typeof ma === "string") return { error: ma };
    if (typeof mb === "string") return { error: mb };
    if (ma.id === b.id || mb.id === a.id) return { error: "No 2×2, os dois lados são grupos diferentes." };
    return { sides: [[a, ma], [b, mb]] };
  }

  /** Motivo para não entrar em duelo agora (null = pode). */
  private blocked(p: PlayerState): string | null {
    if (p.hp <= 0) return `${p.name} está caído.`;
    if (this.byPlayer.has(p.id)) return `${p.name} já está num duelo.`;
    return this.o.busy?.(p) ?? null;
  }

  private challenge(a: PlayerState, targetId: string, mode: DuelMode, now: number): void {
    const b = this.o.getPlayer(targetId);
    if (!b || b.id === a.id) return;
    if (cheb(a.x, a.y, b.x, b.y) > CHALLENGE_RANGE) return this.notice(a.id, `Chegue mais perto de ${b.name} para desafiar.`);
    const s = this.sides(a, b, mode);
    if ("error" in s) return this.notice(a.id, s.error, "warn");
    for (const p of [...s.sides[0], ...s.sides[1]]) {
      const why = this.blocked(p);
      if (why) return this.notice(a.id, why, "warn");
    }
    this.invites = this.invites.filter((i) => !(i.fromId === a.id && i.toId === b.id) && i.until > now);
    this.invites.push({ fromId: a.id, toId: b.id, mode, until: now + DUEL_INVITE_MS });
    this.notice(a.id, `Desafio de duelo ${DUEL_MODE_LABEL[mode]} enviado para ${b.name}.`);
    this.sendState(b.id, now);
  }

  // --- partida ---------------------------------------------------------------------------------------------------------

  private begin(inv: Invite, now: number): void {
    const a = this.o.getPlayer(inv.fromId), b = this.o.getPlayer(inv.toId);
    if (!a || !b) return;
    const s = this.sides(a, b, inv.mode);
    if ("error" in s) { this.notice(b.id, s.error, "warn"); return; }
    for (const p of [...s.sides[0], ...s.sides[1]]) {
      const why = this.blocked(p);
      if (why) { this.notice(a.id, why, "warn"); this.notice(b.id, why, "warn"); return; }
    }
    const arena = this.o.reserve();
    if (!arena) {
      for (const p of [a, b]) this.notice(p.id, "Todas as salas do Coliseu estão ocupadas. Tente de novo daqui a pouco.", "warn");
      return;
    }
    const duel: Duel = { mode: inv.mode, arena, fighters: [], phase: "countdown", until: now + DUEL_COUNTDOWN_MS };
    const r = arena.rect;
    // Cada lado num canto oposto da sala, um ao lado do outro.
    const corner = (side: 0 | 1, i: number): Point => ({
      x: side === 0 ? r.x0 + 3 + i : r.x1 - 3 - i,
      y: side === 0 ? r.y0 + 3 : r.y1 - 3,
    });
    s.sides.forEach((list, side) => list.forEach((p, i) => {
      duel.fighters.push({ id: p.id, name: p.name, side: side as 0 | 1, out: false, back: { x: p.x, y: p.y } });
      this.byPlayer.set(p.id, duel);
      this.invites = this.invites.filter((x) => x.fromId !== p.id && x.toId !== p.id);
      const t = this.place(corner(side as 0 | 1, i), p.id, r) ?? corner(side as 0 | 1, i);
      p.targetId = "";
      this.o.teleport(p, t.x, t.y);
      p.hp = p.maxHp;
      p.mana = p.maxMana;
      this.o.onEnter?.(p);
    }));
    this.duels.add(duel);
    const names = (side: 0 | 1) => duel.fighters.filter((f) => f.side === side).map((f) => f.name).join(" e ");
    this.o.broadcast(S2C.Feed, { text: `⚔ Duelo ${DUEL_MODE_LABEL[duel.mode]}: ${names(0)} × ${names(1)}!`, kind: "info" } satisfies FeedMsg);
    for (const f of duel.fighters) this.sendState(f.id, now);
  }

  /** Tile livre perto de `c`, dentro da sala. */
  private place(c: Point, selfId: string, r: ArenaDef["rect"]): Point | null {
    for (let d = 0; d <= 3; d++)
      for (let y = c.y - d; y <= c.y + d; y++)
        for (let x = c.x - d; x <= c.x + d; x++)
          if (x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1 && cheb(x, y, c.x, c.y) === d && this.o.isFree(x, y, selfId)) return { x, y };
    return null;
  }

  /**
   * Regra de ataque entre jogadores com duelo: undefined = nenhum dos dois está em duelo (vale o PvP normal); null = pode
   * (lados opostos, na luta, os dois na sala); texto = não pode.
   */
  canAttack(a: PlayerState, b: PlayerState): string | null | undefined {
    const da = this.active(a.id), db = this.active(b.id);
    if (!da && !db) return undefined;
    if (da !== db) return da ? "Você está num duelo: só vale atacar o outro lado." : `${b.name} está num duelo.`;
    const fa = da!.fighters.find((f) => f.id === a.id)!, fb = da!.fighters.find((f) => f.id === b.id)!;
    if (fa.side === fb.side) return "É do seu lado no duelo.";
    if (da!.phase !== "fight") return "Aguarde a contagem do duelo.";
    return null;
  }

  /** Golpe entre os dois lados de um duelo (sem caveira, sem registro de PvP). */
  isDuelHit(a: PlayerState, b: PlayerState): boolean {
    const d = this.active(a.id);
    return !!d && d === this.active(b.id);
  }

  /** CombatHooks.interceptDeath: quem cairia no duelo sai da sala de vida cheia (true = a morte não acontece). */
  interceptDeath(p: PlayerState): boolean {
    const d = this.byPlayer.get(p.id);
    if (!d) return false;
    const f = d.fighters.find((x) => x.id === p.id)!;
    if (f.out) return false;
    this.out(d, f);
    this.checkEnd(d, "wiped");
    return true;
  }

  /** Tira o lutador da sala: vida e mana cheias, de volta para onde estava. */
  private out(d: Duel, f: Fighter): void {
    f.out = true;
    const p = this.o.getPlayer(f.id);
    if (!p) return;
    p.hp = p.maxHp;
    p.mana = p.maxMana;
    p.targetId = "";
    this.o.onExit?.(p);
    this.o.teleport(p, f.back.x, f.back.y);
    for (const o of d.fighters) { const q = this.o.getPlayer(o.id); if (q?.targetId === p.id) q.targetId = ""; }
  }

  private checkEnd(d: Duel, reason: DuelResult["reason"], now = this.now()): void {
    const alive = (side: 0 | 1) => d.fighters.some((f) => f.side === side && !f.out);
    let winner: 0 | 1 | null;
    if (reason === "time") {
      const pct = (side: 0 | 1) => d.fighters.filter((f) => f.side === side && !f.out).map((f) => { const p = this.o.getPlayer(f.id); return p ? p.hp / Math.max(1, p.maxHp) : 0; });
      winner = duelTimeWinner(pct(0), pct(1));
    } else {
      if (alive(0) && alive(1)) return;
      winner = alive(0) ? 0 : alive(1) ? 1 : null;
    }
    this.finish(d, winner, reason, now);
  }

  private finish(d: Duel, winner: 0 | 1 | null, reason: DuelResult["reason"], now: number): void {
    if (!this.duels.delete(d)) return;
    for (const f of d.fighters) {
      if (!f.out) this.out(d, f);
      this.byPlayer.delete(f.id);
    }
    this.o.release(d.arena.id);
    const names = (side: 0 | 1) => d.fighters.filter((f) => f.side === side).map((f) => f.name).join(" e ");
    const head = winner === null ? `${names(0)} e ${names(1)} empataram` : `${names(winner)} venceu ${names(winner === 0 ? 1 : 0)}`;
    const why = reason === "time" ? " no tempo" : reason === "forfeit" ? " por desistência" : "";
    this.o.broadcast(S2C.Feed, { text: `⚔ Duelo ${DUEL_MODE_LABEL[d.mode]}: ${head}${why}.`, kind: "info" } satisfies FeedMsg);
    if (winner !== null) this.addWins(d.fighters.filter((f) => f.side === winner).map((f) => f.name), now);
    for (const f of d.fighters) {
      const result: DuelResult = { won: winner === null ? null : f.side === winner, reason, mode: d.mode, opponents: names(f.side === 0 ? 1 : 0) };
      this.o.send(f.id, S2C.Duel, { invites: this.invitesFor(f.id, now), active: null, result } satisfies DuelMsg);
      if (result.won) { const p = this.o.getPlayer(f.id); if (p) this.o.onWin?.(p); }
    }
  }

  tick(now = this.now()): void {
    const before = this.invites.length;
    this.invites = this.invites.filter((i) => i.until > now);
    if (this.invites.length !== before) for (const p of this.o.players()) this.sendState(p.id, now);
    for (const d of [...this.duels]) {
      if (now < d.until) continue;
      if (d.phase === "countdown") {
        d.phase = "fight";
        d.until = now + DUEL_MAX_MS;
        for (const f of d.fighters) { this.notice(f.id, "Duelo: lutem!", "good"); this.sendState(f.id, now); }
      } else {
        this.checkEnd(d, "time", now);
      }
    }
  }

  /** Saiu de vez (logout/fim da reconexão): desiste do duelo e some dos convites. */
  removePlayer(id: string): void {
    this.invites = this.invites.filter((i) => i.fromId !== id && i.toId !== id);
    const d = this.byPlayer.get(id);
    if (!d) return;
    const f = d.fighters.find((x) => x.id === id)!;
    if (!f.out) {
      this.out(d, f);
      const left = d.fighters.some((x) => x.side === f.side && !x.out);
      if (!left) this.finish(d, f.side === 0 ? 1 : 0, "forfeit", this.now());
    }
    this.byPlayer.delete(id);
  }

  // --- estado e ranking ------------------------------------------------------------------------------------------------

  private invitesFor(id: string, now: number): DuelInvite[] {
    return this.invites.filter((i) => i.toId === id && i.until > now).map((i) => {
      const from = this.o.getPlayer(i.fromId);
      let partners: string | undefined;
      if (i.mode === "2x2") {
        const mate = (pid: string) => this.o.partyMates(pid).map((x) => this.o.getPlayer(x)?.name).filter(Boolean).join(", ");
        partners = `${from?.name ?? "?"} e ${mate(i.fromId)} × você e ${mate(id)}`;
      }
      return { fromId: i.fromId, fromName: from?.name ?? "?", mode: i.mode, until: i.until, ...(partners ? { partners } : {}) };
    });
  }

  stateFor(id: string): DuelState | null {
    const d = this.byPlayer.get(id);
    if (!d) return null;
    const me = d.fighters.find((f) => f.id === id)!;
    const list = (side: number) => d.fighters.filter((f) => f.side === side).map((f) => ({ name: f.name, out: f.out }));
    return { mode: d.mode, phase: d.phase, until: d.until, mine: list(me.side), theirs: list(1 - me.side) };
  }

  sendState(id: string, now = this.now()): void {
    this.o.send(id, S2C.Duel, { invites: this.invitesFor(id, now), active: this.stateFor(id) } satisfies DuelMsg);
  }

  private weekKey(now: number): string { return `duel.week.${weekId(new Date(now))}`; }

  weekWins(now = this.now()): Record<string, number> {
    try { return JSON.parse(this.o.getKv?.(this.weekKey(now)) ?? "{}") as Record<string, number>; } catch { return {}; }
  }

  private addWins(names: string[], now: number): void {
    if (!this.o.setKv) return;
    const w = this.weekWins(now);
    for (const n of names) w[n] = (w[n] ?? 0) + 1;
    this.o.setKv(this.weekKey(now), JSON.stringify(w));
  }

  private sendRanking(p: PlayerState, now: number): void {
    const top = duelTop(this.weekWins(now));
    const text = top.length
      ? `Duelos da semana: ${top.map((t, i) => `${i + 1}º ${t.name} (${t.wins})`).join(" · ")}`
      : "Duelos da semana: ninguém venceu ainda. Desafie alguém pelo botão direito!";
    this.o.send(p.id, S2C.Notice, { text, kind: "info", log: true } satisfies NoticeMsg);
  }
}

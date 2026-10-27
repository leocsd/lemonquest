// Grupo (party) estilo Tibia: convite/aceite, líder (expulsar, passar liderança, desfazer), sair, chat do grupo e
// experiência compartilhada (+20% por membro extra, dividida entre os membros ativos perto do abate, se a diferença de
// level permitir). Os mesmos participantes entram na divisão do loot raro+ (systems/loot.ts). Só em memória: sair do jogo
// (depois da janela de reconexão) tira a pessoa do grupo.
import {
  PARTY_ACTIVE_MS, PARTY_INVITE_MS, PARTY_MAX, PARTY_SHARE_RANGE, S2C, partyLevelsOk, partyMinLevel, partyShareEach,
  type ChatMessage, type NoticeMsg, type PartyActionMsg, type PartyInviteMsg, type PartyShareReason, type PartyStateMsg,
} from "@lemonquest/shared";
import type { PlayerState } from "../state.ts";

const nameKey = (n: string) => n.normalize("NFC").trim().toLowerCase();
const cheb = (ax: number, ay: number, bx: number, by: number) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));

export interface Party {
  id: string;
  leaderId: string;
  /** Ordem de entrada (o próximo vira líder se o líder sair). */
  members: string[];
}

export interface PartyOptions {
  getPlayer: (id: string) => PlayerState | undefined;
  players: () => Iterable<PlayerState>;
  send: (id: string, type: string, msg: unknown) => void;
  now?: () => number;
}

export class PartySystem {
  private readonly parties = new Map<string, Party>();
  private readonly partyOf = new Map<string, Party>();
  /** convidado → (quem convidou → expira em). */
  private readonly invites = new Map<string, Map<string, number>>();
  private readonly lastActive = new Map<string, number>();
  /** Último estado enviado a cada jogador (JSON) — só reenvia quando muda. */
  private readonly lastSent = new Map<string, string>();
  private nextId = 1;
  private readonly now: () => number;

  constructor(private readonly o: PartyOptions) {
    this.now = o.now ?? Date.now;
  }

  // --- consultas -------------------------------------------------------------------

  partyFor(id: string): Readonly<Party> | undefined { return this.partyOf.get(id); }

  /** Ids dos membros do grupo de `id` (inclui ele); [] sem grupo. */
  membersOf(id: string): string[] { return [...(this.partyOf.get(id)?.members ?? [])]; }

  sameParty(a: string, b: string): boolean {
    const p = this.partyOf.get(a);
    return !!p && p === this.partyOf.get(b);
  }

  /**
   * Membros do grupo de `playerId` (incluindo ele) vivos a até `range` tiles de (x,y). Sem grupo: só ele (se perto).
   * Usado por quests/bounties para creditar abates ao grupo.
   */
  partyMembersNear(playerId: string, x: number, y: number, range: number): PlayerState[] {
    const ids = this.partyOf.get(playerId)?.members ?? [playerId];
    const out: PlayerState[] = [];
    for (const id of ids) {
      const p = this.o.getPlayer(id);
      if (p && p.hp > 0 && cheb(p.x, p.y, x, y) <= range) out.push(p);
    }
    return out;
  }

  /** Atacou/curou agora (conta para a XP compartilhada). */
  markActive(id: string, now = this.now()): void {
    if (this.partyOf.has(id)) this.lastActive.set(id, now);
  }

  isActive(id: string, now = this.now()): boolean {
    const t = this.lastActive.get(id);
    return t !== undefined && now - t < PARTY_ACTIVE_MS;
  }

  /** Estado da XP compartilhada do grupo (regra de level sobre todos os membros). */
  shareStatus(party: Party): { active: boolean; reason?: PartyShareReason; minLevel?: number } {
    const levels = party.members.map((id) => this.o.getPlayer(id)?.level ?? 1);
    if (levels.length < 2) return { active: false, reason: "alone" };
    if (!partyLevelsOk(levels)) return { active: false, reason: "levels", minLevel: partyMinLevel(Math.max(...levels)) };
    return { active: true };
  }

  /**
   * Divide a XP de um abate (shares = XP por jogador, já pelo dano). Para cada grupo com XP compartilhada ativa, a soma
   * das partes dos seus membros vira total × (1 + 0,2 × (n−1)) ÷ n para cada um dos `n` membros elegíveis: vivos, a até
   * PARTY_SHARE_RANGE tiles do abate e que participaram (deram dano neste monstro ou atacaram/curaram nos últimos 60 s).
   * Com menos de 2 elegíveis, nada muda.
   */
  shareXp(shares: Map<string, number>, x: number, y: number, now = this.now()): Map<string, number> {
    const out = new Map(shares);
    const done = new Set<Party>();
    for (const pid of shares.keys()) {
      const party = this.partyOf.get(pid);
      if (!party || done.has(party)) continue;
      done.add(party);
      if (!this.shareStatus(party).active) continue;
      const eligible = this.participants(party, shares, x, y, now).map((p) => p.id);
      if (eligible.length < 2) continue;
      let total = 0;
      for (const id of party.members) {
        const v = shares.get(id);
        if (v) { total += v; out.delete(id); }
      }
      const vocations = new Set(eligible.map((id) => this.o.getPlayer(id)?.vocation)).size;
      const each = partyShareEach(total, eligible.length, vocations);
      for (const id of eligible) out.set(id, each);
    }
    return out;
  }

  /**
   * Quem entra na divisão do loot raro+ de um abate do grupo de `playerId` (systems/loot.ts): os mesmos participantes da
   * XP compartilhada, mas sem a regra de level (o loot não depende dela). Sem grupo: [].
   */
  lootSharers(playerId: string, hitters: ReadonlyMap<string, number>, x: number, y: number, now = this.now()): PlayerState[] {
    const party = this.partyOf.get(playerId);
    return party ? this.participants(party, hitters, x, y, now) : [];
  }

  /** Membros vivos a até PARTY_SHARE_RANGE de (x,y) que deram dano neste monstro ou atacaram/curaram nos últimos 60 s. */
  private participants(party: Party, hitters: ReadonlyMap<string, number>, x: number, y: number, now: number): PlayerState[] {
    const out: PlayerState[] = [];
    for (const id of party.members) {
      const p = this.o.getPlayer(id);
      if (!p || p.hp <= 0 || cheb(p.x, p.y, x, y) > PARTY_SHARE_RANGE) continue;
      if (hitters.has(id) || this.isActive(id, now)) out.push(p);
    }
    return out;
  }

  // --- ações -----------------------------------------------------------------------

  onAction(p: PlayerState, msg: PartyActionMsg): void {
    if (!msg || typeof msg !== "object" || typeof msg.action !== "string") return;
    const id = (v: unknown) => (typeof v === "string" ? v : "");
    switch (msg.action) {
      case "invite": return this.invite(p, id(msg.targetId));
      case "accept": return this.accept(p, id(msg.fromId));
      case "decline": return this.decline(p, id(msg.fromId));
      case "leave": return this.leave(p.id);
      case "kick": return this.kick(p, id(msg.targetId));
      case "lead": return this.passLead(p, id(msg.targetId));
      case "disband": return this.disband(p);
    }
  }

  invite(p: PlayerState, targetId: string): void {
    const why = this.tryInvite(p, targetId);
    if (why) return this.notice(p.id, why, "warn");
    this.notice(p.id, `Convite enviado para ${this.o.getPlayer(targetId)?.name ?? "?"}.`, "info");
  }

  /**
   * Convite sem aviso a quem convida: null = enviado; senão o motivo. O "Convidar todos" do Mural de Excursões
   * (systems/excursions.ts) junta os resultados num aviso só.
   */
  tryInvite(p: PlayerState, targetId: string): string | null {
    const t = this.o.getPlayer(targetId);
    if (!t || t.id === p.id) return "Jogador não encontrado.";
    const party = this.partyOf.get(p.id);
    if (party && party.leaderId !== p.id) return "Só o líder pode convidar.";
    if (this.partyOf.has(t.id)) return party && this.partyOf.get(t.id) === party ? `${t.name} já está no seu grupo.` : `${t.name} já está em um grupo.`;
    if (party && party.members.length >= PARTY_MAX) return `O grupo está cheio (máx. ${PARTY_MAX}).`;
    const now = this.now();
    const mine = this.invites.get(t.id) ?? new Map<string, number>();
    mine.set(p.id, now + PARTY_INVITE_MS);
    this.invites.set(t.id, mine);
    this.o.send(t.id, S2C.PartyInvite, { fromId: p.id, fromName: p.name, expiresInMs: PARTY_INVITE_MS } satisfies PartyInviteMsg);
    return null;
  }

  accept(p: PlayerState, fromId: string): void {
    const exp = this.invites.get(p.id)?.get(fromId);
    this.dropInvite(p.id, fromId);
    const from = this.o.getPlayer(fromId);
    if (exp === undefined || exp < this.now() || !from) return this.notice(p.id, "Esse convite expirou.", "warn");
    if (this.partyOf.has(p.id)) return this.notice(p.id, "Você já está em um grupo. Saia dele primeiro.", "warn");
    let party = this.partyOf.get(fromId);
    if (party && party.leaderId !== fromId) return this.notice(p.id, "Esse convite expirou.", "warn");
    if (party && party.members.length >= PARTY_MAX) return this.notice(p.id, "O grupo está cheio.", "warn");
    if (!party) {
      party = { id: `P${this.nextId++}`, leaderId: fromId, members: [fromId] };
      this.parties.set(party.id, party);
      this.setParty(from, party);
      this.system(party, `${from.name} formou um grupo.`);
    }
    party.members.push(p.id);
    this.setParty(p, party);
    this.invites.delete(p.id); // os outros convites perdem o sentido
    this.system(party, `${p.name} entrou no grupo.`);
  }

  decline(p: PlayerState, fromId: string): void {
    if (!this.invites.get(p.id)?.has(fromId)) return;
    this.dropInvite(p.id, fromId);
    this.notice(fromId, `${p.name} recusou o convite.`, "info");
  }

  /** Sai do grupo (também usado na desconexão). */
  leave(id: string): void {
    const party = this.partyOf.get(id);
    if (!party) return;
    const p = this.o.getPlayer(id);
    const name = p?.name ?? "?";
    const wasLeader = party.leaderId === id;
    this.removeMember(party, id);
    this.notice(id, "Você saiu do grupo.", "info");
    const heir = wasLeader ? this.o.getPlayer(party.leaderId)?.name : undefined;
    this.afterRemoval(party, `${name} saiu do grupo.${heir ? ` ${heir} agora é o líder.` : ""}`);
  }

  kick(p: PlayerState, targetId: string): void {
    const party = this.partyOf.get(p.id);
    if (!party || party.leaderId !== p.id) return this.notice(p.id, "Só o líder pode expulsar.", "warn");
    if (targetId === p.id || !party.members.includes(targetId)) return;
    const name = this.o.getPlayer(targetId)?.name ?? "?";
    this.removeMember(party, targetId);
    this.notice(targetId, "Você foi expulso do grupo.", "warn");
    this.afterRemoval(party, `${name} foi expulso do grupo.`);
  }

  passLead(p: PlayerState, targetId: string): void {
    const party = this.partyOf.get(p.id);
    if (!party || party.leaderId !== p.id) return this.notice(p.id, "Só o líder pode passar a liderança.", "warn");
    if (targetId === p.id || !party.members.includes(targetId)) return;
    party.leaderId = targetId;
    this.system(party, `${this.o.getPlayer(targetId)?.name ?? "?"} agora é o líder do grupo.`);
  }

  disband(p: PlayerState): void {
    const party = this.partyOf.get(p.id);
    if (!party || party.leaderId !== p.id) return this.notice(p.id, "Só o líder pode desfazer o grupo.", "warn");
    this.system(party, "O grupo foi desfeito.");
    this.dissolve(party);
  }

  /** Chat do grupo: entrega só aos membros. false = não está em grupo. */
  chat(p: PlayerState, text: string): boolean {
    const party = this.partyOf.get(p.id);
    if (!party) {
      this.notice(p.id, "Você não está em um grupo.", "warn");
      return false;
    }
    const out: ChatMessage = { from: p.name, text, channel: "party", ts: this.now() };
    for (const id of party.members) this.o.send(id, S2C.Chat, out);
    return true;
  }

  /**
   * Comandos de chat: /convidar <nome>, /aceitar [nome], /recusar [nome], /sair, /expulsar <nome>, /lider <nome>,
   * /desfazer. Retorna true se tratou.
   */
  command(p: PlayerState, text: string): boolean {
    const m = /^\/(\S+)\s*(.*)$/.exec(text.trim());
    if (!m) return false;
    const cmd = m[1]!.toLowerCase(), arg = m[2]!.trim();
    const byName = (n: string) => {
      const want = nameKey(n);
      for (const o of this.o.players()) if (nameKey(o.name) === want) return o;
      return undefined;
    };
    const target = () => {
      const t = arg ? byName(arg) : undefined;
      if (!t) this.notice(p.id, arg ? `Jogador "${arg}" não encontrado.` : "Informe o nome do jogador.", "warn");
      return t;
    };
    /** Convite pendente para p: do nome dado, ou o mais recente. */
    const pendingFrom = (): string | undefined => {
      const inv = this.invites.get(p.id);
      if (!inv?.size) { this.notice(p.id, "Nenhum convite pendente.", "warn"); return undefined; }
      if (!arg) return [...inv.keys()].pop();
      const t = byName(arg);
      if (!t || !inv.has(t.id)) { this.notice(p.id, `Nenhum convite de "${arg}".`, "warn"); return undefined; }
      return t.id;
    };
    switch (cmd) {
      case "convidar": case "invite": { const t = target(); if (t) this.invite(p, t.id); return true; }
      case "aceitar": { const f = pendingFrom(); if (f) this.accept(p, f); return true; }
      case "recusar": { const f = pendingFrom(); if (f) this.decline(p, f); return true; }
      case "sair": {
        if (!this.partyOf.has(p.id)) this.notice(p.id, "Você não está em um grupo.", "warn");
        else this.leave(p.id);
        return true;
      }
      case "expulsar": { const t = target(); if (t) this.kick(p, t.id); return true; }
      case "lider": case "líder": { const t = target(); if (t) this.passLead(p, t.id); return true; }
      case "desfazer": this.disband(p); return true;
    }
    return false;
  }

  // --- ciclo de vida ------------------------------------------------------------------

  /** Saiu do jogo (depois da janela de reconexão): sai do grupo e os convites somem. */
  removePlayer(id: string): void {
    this.leave(id);
    this.invites.delete(id);
    for (const inv of this.invites.values()) inv.delete(id);
    this.lastActive.delete(id);
    this.lastSent.delete(id);
  }

  /** Reconectou: reenvia o estado do grupo. */
  resend(id: string): void {
    this.lastSent.delete(id);
    this.syncPlayer(id, this.now());
  }

  /** Envia o estado do grupo a quem mudou (level, atividade, membros) e expira convites. */
  sync(now = this.now()): void {
    for (const [to, inv] of this.invites) {
      for (const [from, exp] of inv) if (exp < now) inv.delete(from);
      if (!inv.size) this.invites.delete(to);
    }
    for (const party of this.parties.values()) for (const id of party.members) this.syncPlayer(id, now);
  }

  /** Estado do grupo para um jogador. */
  stateMsg(id: string, now = this.now()): PartyStateMsg {
    const party = this.partyOf.get(id);
    if (!party) return { party: null };
    return {
      party: {
        id: party.id,
        leaderId: party.leaderId,
        members: party.members.map((mid) => {
          const p = this.o.getPlayer(mid);
          return { id: mid, name: p?.name ?? "?", vocation: p?.vocation ?? "knight", level: p?.level ?? 1, active: this.isActive(mid, now) };
        }),
        share: this.shareStatus(party),
      },
    };
  }

  // --- internos ------------------------------------------------------------------------

  private syncPlayer(id: string, now: number): void {
    const msg = this.stateMsg(id, now);
    const json = JSON.stringify(msg);
    if (this.lastSent.get(id) === json) return;
    this.lastSent.set(id, json);
    this.o.send(id, S2C.Party, msg);
  }

  private setParty(p: PlayerState, party: Party | null): void {
    if (party) this.partyOf.set(p.id, party); else this.partyOf.delete(p.id);
    p.partyId = party?.id ?? "";
    this.syncPlayer(p.id, this.now());
  }

  private removeMember(party: Party, id: string): void {
    party.members = party.members.filter((m) => m !== id);
    this.partyOf.delete(id);
    this.lastActive.delete(id);
    const p = this.o.getPlayer(id);
    if (p) p.partyId = "";
    this.lastSent.delete(id);
    this.o.send(id, S2C.Party, { party: null } satisfies PartyStateMsg);
    if (party.leaderId === id && party.members.length) party.leaderId = party.members[0]!;
  }

  /** Depois de alguém sair: avisa; com 1 membro só, o grupo acaba. */
  private afterRemoval(party: Party, text: string): void {
    if (party.members.length <= 1) {
      const last = party.members[0];
      if (last) this.notice(last, "O grupo foi desfeito.", "info");
      this.dissolve(party);
      return;
    }
    this.system(party, text);
  }

  private dissolve(party: Party): void {
    for (const id of [...party.members]) {
      this.partyOf.delete(id);
      this.lastActive.delete(id);
      const p = this.o.getPlayer(id);
      if (p) p.partyId = "";
      this.lastSent.delete(id);
      this.o.send(id, S2C.Party, { party: null } satisfies PartyStateMsg);
    }
    party.members = [];
    this.parties.delete(party.id);
  }

  private dropInvite(to: string, from: string): void {
    const inv = this.invites.get(to);
    inv?.delete(from);
    if (inv && !inv.size) this.invites.delete(to);
  }

  /** Mensagem de sistema no canal "Grupo" + estado atualizado para todos os membros. */
  private system(party: Party, text: string): void {
    const now = this.now();
    const msg: ChatMessage = { from: "", text, channel: "party", ts: now };
    for (const id of party.members) {
      this.o.send(id, S2C.Chat, msg);
      this.syncPlayer(id, now);
    }
  }

  private notice(id: string, text: string, kind: NoticeMsg["kind"]): void {
    this.o.send(id, S2C.Notice, { text, kind } satisfies NoticeMsg);
  }
}

import { describe, expect, it, vi } from "vitest";
import {
  PARTY_ACTIVE_MS, PARTY_INVITE_MS, PARTY_MAX, PLAYER_ATTACK_MS, S2C, partyLevelsOk, partyMinLevel, partyShareEach,
  type PartyStateMsg,
} from "@lemonquest/shared";
import type { PlayerState } from "../state.ts";
import { handleChat } from "./chat.ts";
import { PartySystem } from "./party.ts";
import { def, openGrid, player, world } from "./testkit.ts";

function setup() {
  let clock = 100_000;
  const players = new Map<string, PlayerState>();
  const sent: { to: string; type: string; msg: any }[] = [];
  const party = new PartySystem({
    getPlayer: (id) => players.get(id), players: () => players.values(),
    send: (to, type, msg) => sent.push({ to, type, msg }), now: () => clock,
  });
  const add = (id: string, over: Partial<PlayerState> = {}) => {
    const p = player(id, 10, 10, { name: id.toUpperCase(), partyId: "", ...over });
    players.set(id, p);
    return p;
  };
  const last = (to: string, type: string) => [...sent].reverse().find((s) => s.to === to && s.type === type)?.msg;
  const notices = (to: string) => sent.filter((s) => s.to === to && s.type === S2C.Notice).map((s) => s.msg.text as string);
  /** a convida b e b aceita. */
  const join = (a: PlayerState, b: PlayerState) => { party.invite(a, b.id); party.accept(b, a.id); };
  return { party, players, sent, add, last, notices, join, tick: (ms: number) => { clock += ms; }, now: () => clock };
}

describe("party: regras puras", () => {
  it("bônus de +35% por membro extra (+20% com 3 vocações diferentes), dividido igualmente", () => {
    expect(partyShareEach(100, 1)).toBe(100);
    expect(partyShareEach(100, 2)).toBe(68);   // 100 × 1,35 / 2 = 67,5
    expect(partyShareEach(100, 3)).toBe(57);   // 100 × 1,7 / 3 = 56,7
    expect(partyShareEach(100, 6)).toBe(46);   // 100 × 2,75 / 6 = 45,8
    expect(partyShareEach(100, 3, 2)).toBe(57); // 2 vocações: sem o extra
    expect(partyShareEach(100, 3, 3)).toBe(63); // 100 × 1,9 / 3 = 63,3
    expect(partyShareEach(100, 1, 4)).toBe(100); // sozinho não há bônus nenhum
    expect(partyShareEach(1, 4)).toBe(1);
    expect(partyShareEach(0, 3)).toBe(0);
  });
  it("menor level ≥ 2/3 do maior", () => {
    expect(partyLevelsOk([20, 14])).toBe(true);
    expect(partyLevelsOk([30, 20])).toBe(true);
    expect(partyLevelsOk([30, 19])).toBe(false);
    expect(partyMinLevel(30)).toBe(20);
    expect(partyMinLevel(10)).toBe(7);
  });
});

describe("party: convites e gestão", () => {
  it("convidar → aceitar forma o grupo (convidador é o líder) e sincroniza partyId + estado", () => {
    const w = setup();
    const a = w.add("a"), b = w.add("b");
    w.party.invite(a, b.id);
    expect(w.last("b", S2C.PartyInvite)).toMatchObject({ fromId: "a", fromName: "A" });
    expect(a.partyId).toBe("");
    w.party.accept(b, a.id);
    expect(a.partyId).not.toBe("");
    expect(b.partyId).toBe(a.partyId);
    const st = w.last("b", S2C.Party) as PartyStateMsg;
    expect(st.party?.leaderId).toBe("a");
    expect(st.party?.members.map((m) => m.id)).toEqual(["a", "b"]);
    expect(st.party?.share.active).toBe(true);
    // Mensagem de sistema no canal do grupo.
    expect(w.sent.some((s) => s.to === "a" && s.type === S2C.Chat && s.msg.channel === "party" && s.msg.text.includes("B entrou"))).toBe(true);
  });

  it("recusar avisa quem convidou; convite expira; aceitar sem convite falha", () => {
    const w = setup();
    const a = w.add("a"), b = w.add("b"), c = w.add("c");
    w.party.invite(a, b.id);
    w.party.decline(b, a.id);
    expect(w.notices("a")).toContain("B recusou o convite.");
    w.party.accept(b, a.id);
    expect(b.partyId).toBe("");
    w.party.invite(a, c.id);
    w.tick(PARTY_INVITE_MS + 1);
    w.party.accept(c, a.id);
    expect(c.partyId).toBe("");
    expect(w.notices("c")).toContain("Esse convite expirou.");
  });

  it("só o líder convida/expulsa/passa liderança; limite de membros", () => {
    const w = setup();
    const ps = Array.from({ length: PARTY_MAX + 1 }, (_, i) => w.add(`p${i}`));
    const [lead, second] = ps as [PlayerState, PlayerState];
    for (let i = 1; i < PARTY_MAX; i++) w.join(lead, ps[i]!);
    expect(w.party.membersOf(lead.id)).toHaveLength(PARTY_MAX);
    w.party.invite(lead, ps[PARTY_MAX]!.id);
    expect(w.notices(lead.id).pop()).toMatch(/cheio/);
    // Não-líder não convida nem expulsa.
    w.party.invite(second, ps[PARTY_MAX]!.id);
    expect(w.notices(second.id).pop()).toBe("Só o líder pode convidar.");
    w.party.kick(second, ps[2]!.id);
    expect(w.party.membersOf(lead.id)).toHaveLength(PARTY_MAX);
    // Expulsar.
    w.party.kick(lead, ps[2]!.id);
    expect(ps[2]!.partyId).toBe("");
    expect(w.last(ps[2]!.id, S2C.Party)).toEqual({ party: null });
    // Passar liderança.
    w.party.passLead(lead, second.id);
    expect(w.party.partyFor(lead.id)?.leaderId).toBe(second.id);
    w.party.kick(lead, ps[3]!.id);
    expect(w.notices(lead.id).pop()).toBe("Só o líder pode expulsar.");
  });

  it("convidar quem já está em outro grupo é recusado", () => {
    const w = setup();
    const a = w.add("a"), b = w.add("b"), c = w.add("c"), d = w.add("d");
    w.join(a, b);
    w.join(c, d);
    w.party.invite(a, c.id);
    expect(w.notices("a").pop()).toBe("C já está em um grupo.");
  });

  it("sair: líder saindo passa a liderança; com 1 membro o grupo acaba; desfazer", () => {
    const w = setup();
    const a = w.add("a"), b = w.add("b"), c = w.add("c");
    w.join(a, b);
    w.join(a, c);
    w.party.leave(a.id);
    expect(a.partyId).toBe("");
    expect(w.party.partyFor("b")?.leaderId).toBe("b");
    w.party.leave(c.id);
    expect(b.partyId).toBe("");
    expect(w.party.partyFor("b")).toBeUndefined();
    // Desfazer (só o líder).
    w.join(a, b);
    w.join(a, c);
    w.party.disband(b);
    expect(a.partyId).not.toBe("");
    w.party.disband(a);
    expect([a.partyId, b.partyId, c.partyId]).toEqual(["", "", ""]);
  });

  it("comandos de chat: /convidar, /aceitar, /lider, /expulsar, /sair", () => {
    const w = setup();
    const a = w.add("a"), b = w.add("b"), c = w.add("c");
    expect(w.party.command(a, "/convidar b")).toBe(true);
    expect(w.party.command(b, "/aceitar")).toBe(true);
    expect(b.partyId).toBe(a.partyId);
    w.party.command(a, "/convidar C");
    w.party.command(c, "/aceitar a");
    expect(w.party.membersOf("a")).toEqual(["a", "b", "c"]);
    w.party.command(a, "/lider b");
    expect(w.party.partyFor("a")?.leaderId).toBe("b");
    w.party.command(b, "/expulsar c");
    expect(c.partyId).toBe("");
    w.party.command(a, "/sair");
    expect(a.partyId).toBe("");
    expect(w.party.command(a, "/convidar ninguem")).toBe(true);
    expect(w.notices("a").pop()).toMatch(/não encontrado/);
    expect(w.party.command(a, "/level 5")).toBe(false);
  });

  it("desconexão: sai do grupo e os convites somem", () => {
    const w = setup();
    const a = w.add("a"), b = w.add("b"), c = w.add("c");
    w.join(a, b);
    w.join(a, c);
    w.party.invite(a, w.add("d").id);
    w.party.removePlayer("a");
    w.players.delete("a");
    expect(w.party.partyFor("a")).toBeUndefined();
    expect(w.party.membersOf("b")).toEqual(["b", "c"]);
    expect(w.party.partyFor("b")?.leaderId).toBe("b");
    w.party.accept(w.players.get("d")!, "a");
    expect(w.players.get("d")!.partyId).toBe("");
    w.party.removePlayer("b");
    expect(c.partyId).toBe("");
  });

  it("partyMembersNear: membros vivos no alcance (sem grupo: só ele)", () => {
    const w = setup();
    const a = w.add("a"), b = w.add("b", { x: 15 }), c = w.add("c", { x: 40 }), d = w.add("d");
    expect(w.party.partyMembersNear("a", 10, 10, 5).map((p) => p.id)).toEqual(["a"]);
    w.join(a, b);
    w.join(a, c);
    expect(w.party.partyMembersNear("a", 10, 10, 5).map((p) => p.id)).toEqual(["a", "b"]);
    b.hp = 0;
    expect(w.party.partyMembersNear("c", 10, 10, 50).map((p) => p.id)).toEqual(["a", "c"]);
    expect(w.party.partyMembersNear("d", 10, 10, 5).map((p) => p.id)).toEqual(["d"]);
  });

  it("lootSharers: quem bateu no monstro ou atacou/curou há pouco, vivo e perto, na ordem do grupo; sem grupo: ninguém", () => {
    const w = setup();
    const a = w.add("a"), b = w.add("b", { x: 12 }), c = w.add("c", { x: 14 }), d = w.add("d", { x: 40 });
    const hit = new Map([["a", 50]]);
    expect(w.party.lootSharers("a", hit, 10, 10)).toEqual([]); // sem grupo
    w.join(a, b); w.join(a, c); w.join(a, d);
    // b só está perto (não bateu, não atacou): fica de fora; c atacou há pouco; d está longe demais.
    w.party.markActive("c");
    w.party.markActive("d");
    expect(w.party.lootSharers("a", hit, 10, 10).map((p) => p.id)).toEqual(["a", "c"]);
    // Ativo há mais de 60 s não conta; bater neste monstro conta sempre; morto nunca.
    w.tick(PARTY_ACTIVE_MS);
    expect(w.party.lootSharers("a", new Map([["a", 50], ["b", 1]]), 10, 10).map((p) => p.id)).toEqual(["a", "b"]);
    a.hp = 0;
    expect(w.party.lootSharers("b", new Map([["a", 50], ["b", 1]]), 10, 10).map((p) => p.id)).toEqual(["b"]);
    // A regra de level da XP não entra na divisão do loot.
    a.hp = 100; a.level = 100; b.level = 10;
    expect(w.party.shareStatus(w.party.partyFor("a")!).active).toBe(false);
    expect(w.party.lootSharers("a", new Map([["a", 50], ["b", 1]]), 10, 10).map((p) => p.id)).toEqual(["a", "b"]);
  });
});

describe("party: chat do grupo", () => {
  it("canal party entrega só aos membros; sem grupo avisa", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const w = setup();
    const a = w.add("a"), b = w.add("b"), c = w.add("c");
    w.join(a, b);
    const broadcast = vi.fn();
    const client = (id: string) => ({ sessionId: `chat-${id}`, send: (t: string, m: unknown) => w.sent.push({ to: id, type: t, msg: m }) }) as any;
    const hooks = { partyChat: (p: PlayerState, t: string) => w.party.chat(p, t) };
    w.sent.length = 0;
    handleChat({ broadcast } as any, client("a"), a, { text: "bora", channel: "party" }, hooks);
    expect(broadcast).not.toHaveBeenCalled();
    const got = w.sent.filter((s) => s.type === S2C.Chat).map((s) => s.to).sort();
    expect(got).toEqual(["a", "b"]);
    expect(w.sent.find((s) => s.type === S2C.Chat)!.msg).toMatchObject({ from: "A", text: "bora", channel: "party" });
    w.sent.length = 0;
    handleChat({ broadcast } as any, client("c"), c, { text: "oi?", channel: "party" }, hooks);
    expect(w.sent.filter((s) => s.type === S2C.Chat)).toHaveLength(0);
    expect(w.notices("c")).toContain("Você não está em um grupo.");
  });
});

describe("party: XP compartilhada", () => {
  it("divide com bônus entre membros perto e ativos; inativo/longe não recebe", () => {
    const w = setup();
    const a = w.add("a", { x: 10, y: 10, level: 10 }), b = w.add("b", { x: 12, y: 10, level: 9 });
    const c = w.add("c", { x: 11, y: 11, level: 8 }), far = w.add("far", { x: 40, y: 10, level: 10 });
    w.join(a, b); w.join(a, c); w.join(a, far);
    w.party.markActive("b");
    w.party.markActive("far");
    // a deu todo o dano; b ativo e perto; c perto mas inativo; far ativo mas longe.
    const out = w.party.shareXp(new Map([["a", 100]]), 10, 10);
    expect(Object.fromEntries(out)).toEqual({ a: 68, b: 68 }); // 100 × 1,35 / 2
    // Atividade expira.
    w.tick(PARTY_ACTIVE_MS + 1);
    expect(Object.fromEntries(w.party.shareXp(new Map([["a", 100]]), 10, 10))).toEqual({ a: 100 });
    // Quem deu dano conta como participante; partes dos membros são somadas antes da divisão.
    const both = w.party.shareXp(new Map([["a", 70], ["c", 30], ["x", 5]]), 10, 10);
    expect(Object.fromEntries(both)).toEqual({ a: 68, c: 68, x: 5 });
  });

  it("regra de level: diferença grande desliga a divisão (cada um fica com a sua)", () => {
    const w = setup();
    const a = w.add("a", { level: 30 }), b = w.add("b", { level: 19 });
    w.join(a, b);
    w.party.markActive("b");
    expect(Object.fromEntries(w.party.shareXp(new Map([["a", 100]]), 10, 10))).toEqual({ a: 100 });
    const st = w.party.stateMsg("a");
    expect(st.party?.share).toEqual({ active: false, reason: "levels", minLevel: 20 });
    b.level = 20;
    expect(w.party.stateMsg("a").party?.share).toEqual({ active: true });
  });

  it("integração com o combate: abate em grupo dá XP aos dois", () => {
    const w = world({
      grid: openGrid(30, 30), spawns: [{ defId: "dummy", x: 10, y: 10, count: 1, radius: 0 }],
      defs: () => def({ aggroRange: 0, hp: 20, xp: 100, armor: 0 }), spawn: { x: 25, y: 25 },
    });
    w.mm.spawnAll();
    const m = [...w.mm.all()][0]!;
    const party = new PartySystem({ getPlayer: (id) => w.players.get(id), players: () => w.players.values(), send: () => {}, now: w.now });
    w.combat.hooks = {
      xpShares: (mon, shares, now) => party.shareXp(shares, mon.s.x, mon.s.y, now),
      onActivity: (id, now) => party.markActive(id, now),
    };
    const k = w.add(player("k", 11, 10, { level: 1, partyId: "" }));
    const d = w.add(player("d", 13, 10, { level: 1, vocation: "druid", partyId: "" }));
    party.invite(k, d.id);
    party.accept(d, k.id);
    // O druida cura o cavaleiro (participação) e o cavaleiro mata o monstro sozinho.
    k.hp = 100;
    w.combat.healPlayer(k, d.id, 10);
    expect(party.isActive("d", w.now())).toBe(true);
    w.combat.onAttack(k, { targetId: m.s.id });
    w.run(PLAYER_ATTACK_MS * 8);
    expect(w.mm.size).toBe(0);
    expect(k.xp).toBe(68);
    expect(d.xp).toBe(68);
  });
});

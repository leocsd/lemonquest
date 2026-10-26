import { describe, expect, it } from "vitest";
import {
  COLISEU_DEST, EXCURSION_EXPIRE_MS, EXCURSION_KV, EXCURSION_MAX_JOINED, EXCURSION_NPC, EXCURSION_REMIND_MS, EXCURSION_STEP_MS, S2C,
  type ExcursionActionMsg, type ExcursionDest, type ExcursionsMsg,
} from "@lemonquest/shared";
import { EXCURSION_FEED_COOLDOWN_MS, EXCURSION_FLUSH_MS, EXCURSION_PING_COOLDOWN_MS, EXCURSION_TICK_MS, ExcursionSystem } from "./excursions.ts";

type Sent = { to: string; type: string; msg: any };

const DESTS: ExcursionDest[] = [
  { id: "zona:Minas Abandonadas", label: "Minas Abandonadas", kind: "zone", levels: { min: 14, max: 24 } },
  COLISEU_DEST,
  { id: "chefe:goblin_king", label: "Rei Goblin", kind: "boss", levels: { min: 40, max: 40 }, zone: "Ruínas de Kael" },
];
/** 12:07 em UTC (fora do passo de 15 min). */
const T0 = Date.UTC(2026, 9, 26, 12, 7);
const SLOT = (k: number) => Math.floor(T0 / EXCURSION_STEP_MS) * EXCURSION_STEP_MS + k * EXCURSION_STEP_MS;

function world(names: string[], kv = new Map<string, string>()) {
  const clock = { t: T0 };
  const all = names.map((n, i) => ({ id: `s${i}`, name: n, level: 30, vocation: i % 2 ? "druid" : "knight", x: 0, y: 0 }) as any);
  const present = new Set(all.map((p) => p.id));
  const sent: Sent[] = [];
  const broadcasts: { type: string; msg: any }[] = [];
  const feed: string[] = [];
  const open = new Map<string, string>();
  const parties = new Map<string, string[]>();
  const invited: [string, string][] = [];
  const credits: string[] = [];
  const inviteResult = new Map<string, string>();
  const writes = { n: 0 };
  const make = () => new ExcursionSystem({
    players: () => all.filter((p) => present.has(p.id)),
    send: (to, type, msg) => sent.push({ to, type, msg }),
    broadcast: (type, msg) => broadcasts.push({ type, msg }),
    npcOpen: (id) => open.get(id) ?? "",
    destinations: DESTS,
    partyMembers: (id) => parties.get(id) ?? [],
    invite: (leader, target) => { invited.push([leader.id, target]); return inviteResult.get(target) ?? null; },
    onDeparted: (id) => credits.push(id),
    feed: (text) => feed.push(text),
    getKv: (k) => kv.get(k),
    setKv: (k, v) => { writes.n++; kv.set(k, v); },
    now: () => clock.t,
  });
  const ex = make();
  const by = (n: string) => all.find((p) => p.name === n);
  const act = (n: string, m: ExcursionActionMsg | unknown) => ex.onMessage(by(n), m as ExcursionActionMsg);
  const atBoard = (n: string) => open.set(by(n).id, EXCURSION_NPC);
  const post = (n: string, over: Partial<Extract<ExcursionActionMsg, { action: "post" }>> = {}) => {
    atBoard(n);
    act(n, { action: "post", dest: "zona:Minas Abandonadas", minLevel: 20, maxLevel: 45, at: SLOT(2), slots: 4, ...over });
  };
  const notices = (n: string) => sent.filter((s) => s.to === by(n).id && s.type === S2C.Notice).map((s) => s.msg.text as string);
  const pings = (n: string) => sent.filter((s) => s.to === by(n).id && s.type === S2C.ExcursionPing).map((s) => s.msg);
  /** Último mural difundido (antes, solta o que o coalescer de 1×/s ainda segurava). */
  const board = (): ExcursionsMsg => { ex.flushNow(); return broadcasts.filter((b) => b.type === S2C.Excursions).at(-1)?.msg ?? ex.message(); };
  const advance = (ms: number) => { clock.t += ms; ex.tick(clock.t); };
  return { ex, make, all, by, act, post, atBoard, open, present, parties, invited, inviteResult, credits, sent, broadcasts, feed, kv, writes, notices, pings, board, clock, advance };
}

describe("excursões: postar", () => {
  it("só com o Mural aberto; grava, difunde e anuncia no feed", () => {
    const w = world(["Ana", "Beto"]);
    w.act("Ana", { action: "post", dest: "zona:Minas Abandonadas", minLevel: 20, maxLevel: 45, at: SLOT(2), slots: 4 });
    expect(w.notices("Ana")[0]).toContain("Mural de Excursões");
    expect(w.ex.active).toHaveLength(0);
    w.post("Ana");
    const list = w.board().list;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      dest: "zona:Minas Abandonadas", destLabel: "Minas Abandonadas", destLevels: { min: 14, max: 24 }, minLevel: 20, maxLevel: 45,
      at: SLOT(2), slots: 4, members: [], departed: false, leader: { name: "Ana", level: 30, vocation: "knight" },
    });
    expect(w.notices("Ana").at(-1)).toContain("Excursão marcada: Minas Abandonadas · lv 20–45");
    expect(w.feed).toHaveLength(1);
    expect(w.feed[0]).toContain("Ana marcou uma excursão: Minas Abandonadas");
    expect(JSON.parse(w.kv.get(EXCURSION_KV)!).list).toHaveLength(1);
  });

  it("valida destino, faixa, vagas e horário (sem texto livre: só valores da lista)", () => {
    const w = world(["Ana"]);
    const bad: Partial<Extract<ExcursionActionMsg, { action: "post" }>>[] = [
      { dest: "zona:Inexistente" }, { dest: "qualquer texto" }, { minLevel: 50, maxLevel: 40 }, { minLevel: 0 }, { maxLevel: 999 },
      { slots: 1 }, { slots: 9 }, { at: SLOT(2) + 60_000 }, { at: SLOT(-4) }, { at: T0 + 13 * 3_600_000 - (T0 % EXCURSION_STEP_MS) },
    ];
    for (const b of bad) w.post("Ana", b);
    expect(w.ex.active).toHaveLength(0);
    expect(w.notices("Ana")).toHaveLength(bad.length);
    w.act("Ana", null);
    w.act("Ana", { action: 42 });
    w.act("Ana", { action: "post" });
    expect(w.ex.active).toHaveLength(0);
  });

  it("uma excursão ativa por líder; o feed não repete o mesmo líder dentro do intervalo", () => {
    const w = world(["Ana"]);
    w.post("Ana");
    w.post("Ana", { dest: "coliseu" });
    expect(w.ex.active).toHaveLength(1);
    expect(w.notices("Ana").at(-1)).toContain("Você já tem uma excursão");
    w.act("Ana", { action: "cancel", id: w.ex.active[0]!.id });
    w.post("Ana", { dest: "chefe:goblin_king", at: SLOT(3) });
    expect(w.ex.active[0]?.destLabel).toBe("Chefe: Rei Goblin");
    expect(w.feed).toHaveLength(1); // postar, cancelar e postar de novo não vira spam
    w.act("Ana", { action: "cancel", id: w.ex.active[0]!.id });
    w.clock.t += EXCURSION_FEED_COOLDOWN_MS;
    w.post("Ana", { at: 0 });
    expect(w.feed).toHaveLength(2);
  });

  it("'agora' vira o relógio do servidor e não tem lembrete", () => {
    const w = world(["Ana", "Beto"]);
    w.post("Ana", { at: 0 });
    expect(w.ex.active[0]!.at).toBe(T0);
    w.act("Beto", { action: "join", id: w.ex.active[0]!.id });
    w.advance(EXCURSION_TICK_MS);
    expect(w.pings("Ana").filter((p) => p.kind === "reminder")).toHaveLength(0);
  });
});

describe("excursões: quero ir, sair, cancelar", () => {
  it("'Quero ir' entra na lista e avisa o líder (com a sessão para o convite)", () => {
    const w = world(["Ana", "Beto"]);
    w.post("Ana");
    const id = w.ex.active[0]!.id;
    w.act("Beto", { action: "join", id });
    expect(w.board().list[0]!.members).toEqual([{ name: "Beto", level: 30, vocation: "druid" }]);
    expect(w.pings("Ana")).toEqual([{ kind: "join", id, destLabel: "Minas Abandonadas", name: "Beto", level: 30, vocation: "druid", playerId: "s1" }]);
    expect(w.notices("Beto").at(-1)).toContain("O líder foi avisado");
    w.act("Beto", { action: "join", id }); // de novo: nada muda
    expect(w.board().list[0]!.members).toHaveLength(1);
    expect(w.pings("Ana")).toHaveLength(1);
  });

  it("recusa fora da faixa, lotada, o próprio líder e mais de EXCURSION_MAX_JOINED ao mesmo tempo", () => {
    const names = ["Ana", "Beto", "Caio", "Duda", "Eva", "Fabi", "Gil"];
    const w = world(names);
    w.post("Ana", { slots: 2 });
    const id = w.ex.active[0]!.id;
    w.by("Caio").level = 19;
    w.act("Caio", { action: "join", id });
    expect(w.notices("Caio").at(-1)).toContain("lv 20–45");
    w.act("Ana", { action: "join", id });
    expect(w.notices("Ana").at(-1)).toContain("Você é o líder");
    w.act("Beto", { action: "join", id });
    w.act("Duda", { action: "join", id });
    expect(w.notices("Duda").at(-1)).toContain("lotada");
    expect(w.ex.active[0]!.members.map((m) => m.name)).toEqual(["Beto"]);
    // Gil se inscreve em 3 excursões; a 4ª é recusada.
    for (const n of ["Duda", "Eva", "Fabi", "Caio"]) w.post(n, { minLevel: 1, maxLevel: 99 });
    const others = w.ex.active.filter((e) => e.leader.name !== "Ana").map((e) => e.id);
    for (const x of others) w.act("Gil", { action: "join", id: x });
    expect(w.ex.active.filter((e) => e.members.some((m) => m.name === "Gil"))).toHaveLength(EXCURSION_MAX_JOINED);
    expect(w.notices("Gil").at(-1)).toContain(`${EXCURSION_MAX_JOINED} excursões`);
  });

  it("líder offline: a inscrição vale e ele não recebe ping; sair avisa o líder", () => {
    const w = world(["Ana", "Beto"]);
    w.post("Ana");
    const id = w.ex.active[0]!.id;
    w.present.delete("s0");
    w.act("Beto", { action: "join", id });
    expect(w.notices("Beto").at(-1)).toContain("O líder vê quando entrar");
    expect(w.sent.filter((s) => s.type === S2C.ExcursionPing)).toHaveLength(0);
    w.present.add("s0");
    w.act("Beto", { action: "leave", id });
    expect(w.ex.active[0]!.members).toEqual([]);
    expect(w.notices("Ana").at(-1)).toBe("Beto saiu da lista da sua excursão (Minas Abandonadas).");
  });

  it("só o líder cancela; os inscritos online são avisados", () => {
    const w = world(["Ana", "Beto", "Caio"]);
    w.post("Ana");
    const id = w.ex.active[0]!.id;
    w.act("Beto", { action: "join", id });
    w.act("Beto", { action: "cancel", id });
    expect(w.ex.active).toHaveLength(1);
    w.act("Ana", { action: "cancel", id });
    expect(w.board().list).toEqual([]);
    expect(w.notices("Beto").at(-1)).toContain("Ana cancelou a excursão (Minas Abandonadas");
    expect(w.notices("Caio")).toEqual([]);
  });
});

describe("excursões: anti-spam", () => {
  it("'Quero ir'/sair em sequência: um aviso ao líder por pessoa e excursão a cada 30 s; mural e kv no máximo 1×/s", () => {
    const w = world(["Ana", "Beto", "Caio"]);
    w.post("Ana");
    const id = w.ex.active[0]!.id;
    const boards = () => w.broadcasts.filter((b) => b.type === S2C.Excursions).length;
    expect(boards()).toBe(1);
    expect(w.writes.n).toBe(1);
    for (let i = 0; i < 5; i++) {
      w.act("Beto", { action: "join", id });
      w.act("Beto", { action: "leave", id });
    }
    w.act("Beto", { action: "join", id });
    w.act("Caio", { action: "join", id }); // outra pessoa tem o próprio intervalo
    // Um cartão de Beto e um de Caio; um "saiu da lista" só.
    expect(w.pings("Ana").map((p) => p.name)).toEqual(["Beto", "Caio"]);
    expect(w.notices("Ana").filter((t) => t.includes("saiu da lista"))).toHaveLength(1);
    expect(w.notices("Beto").at(-1)).toContain("O líder vê no mural.");
    // Nada foi gravado nem difundido ainda; o tick seguinte (1 s depois) solta uma vez só, com o estado final.
    expect(boards()).toBe(1);
    expect(w.writes.n).toBe(1);
    w.clock.t += EXCURSION_FLUSH_MS - 1;
    w.ex.tick(w.clock.t);
    expect(boards()).toBe(1);
    w.advance(1);
    expect(boards()).toBe(2);
    expect(w.writes.n).toBe(2);
    expect(w.broadcasts.at(-1)!.msg.list[0].members.map((m: { name: string }) => m.name)).toEqual(["Beto", "Caio"]);
    expect(JSON.parse(w.kv.get(EXCURSION_KV)!).list[0].members).toHaveLength(2);
    w.advance(EXCURSION_TICK_MS); // sem mudança: nada sai
    expect(boards()).toBe(2);
    // Passados 30 s, um novo "Quero ir" de Beto avisa de novo.
    w.act("Beto", { action: "leave", id });
    w.advance(EXCURSION_PING_COOLDOWN_MS);
    w.act("Beto", { action: "join", id });
    expect(w.pings("Ana").map((p) => p.name)).toEqual(["Beto", "Caio", "Beto"]);
  });
});

describe("excursões: convidar todos", () => {
  it("convida (pelo grupo) os inscritos online fora do grupo do líder e resume num aviso só", () => {
    const w = world(["Ana", "Beto", "Caio", "Duda", "Eva"]);
    w.post("Ana", { slots: 6 });
    const id = w.ex.active[0]!.id;
    for (const n of ["Beto", "Caio", "Duda", "Eva"]) w.act(n, { action: "join", id });
    w.present.delete("s4"); // Eva offline
    w.parties.set("s0", ["s0", "s3"]); // Duda já está no grupo
    w.inviteResult.set("s2", "Caio já está em um grupo.");
    w.act("Beto", { action: "inviteAll", id });
    expect(w.invited).toEqual([]);
    w.act("Ana", { action: "inviteAll", id });
    expect(w.invited).toEqual([["s0", "s1"], ["s0", "s2"]]);
    expect(w.notices("Ana").at(-1)).toBe("Convite de grupo enviado para Beto. Caio já está em um grupo.");
  });

  it("ninguém para convidar", () => {
    const w = world(["Ana", "Beto"]);
    w.post("Ana");
    const id = w.ex.active[0]!.id;
    w.act("Ana", { action: "inviteAll", id });
    expect(w.notices("Ana").at(-1)).toBe("Nenhum inscrito online agora.");
    w.act("Beto", { action: "join", id });
    w.parties.set("s0", ["s0", "s1"]);
    w.act("Ana", { action: "inviteAll", id });
    expect(w.notices("Ana").at(-1)).toBe("Todos os inscritos online já estão no seu grupo.");
  });
});

describe("excursões: lembrete, saída e expiração", () => {
  it("lembrete 2 min antes ao líder e aos inscritos online, uma vez só", () => {
    const w = world(["Ana", "Beto", "Caio"]);
    w.post("Ana");
    const e = w.ex.active[0]!;
    w.act("Beto", { action: "join", id: e.id });
    w.act("Caio", { action: "join", id: e.id });
    w.present.delete("s2");
    w.advance(e.at - EXCURSION_REMIND_MS - 1000 - w.clock.t);
    expect(w.pings("Ana").filter((p) => p.kind === "reminder")).toHaveLength(0);
    w.advance(1000);
    expect(w.pings("Ana").filter((p) => p.kind === "reminder")).toEqual([{ kind: "reminder", id: e.id, destLabel: "Minas Abandonadas", at: e.at, leader: "Ana", leading: true }]);
    expect(w.pings("Beto")).toEqual([{ kind: "reminder", id: e.id, destLabel: "Minas Abandonadas", at: e.at, leader: "Ana", leading: false }]);
    w.advance(EXCURSION_TICK_MS);
    w.advance(EXCURSION_TICK_MS);
    expect(w.sent.filter((s) => s.type === S2C.ExcursionPing && s.msg.kind === "reminder")).toHaveLength(2);
    expect(JSON.parse(w.kv.get(EXCURSION_KV)!).list[0].reminded).toBe(true); // reinício não repete
  });

  it("saiu = o líder juntou no grupo 2+ inscritos perto do horário: crédito da conquista uma vez", () => {
    const w = world(["Ana", "Beto", "Caio"]);
    w.post("Ana", { at: SLOT(4) });
    const e = w.ex.active[0]!;
    w.act("Beto", { action: "join", id: e.id });
    w.act("Caio", { action: "join", id: e.id });
    w.parties.set("s0", ["s0", "s1", "s2"]);
    w.advance(EXCURSION_TICK_MS); // cedo demais (mais de 10 min antes)
    expect(w.credits).toEqual([]);
    w.parties.set("s0", ["s0", "s1"]);
    w.advance(e.at - w.clock.t); // na hora, mas só 1 inscrito no grupo
    expect(w.credits).toEqual([]);
    w.parties.set("s0", ["s0", "s1", "s2"]);
    w.advance(EXCURSION_TICK_MS);
    expect(w.credits).toEqual(["s0"]);
    expect(w.board().list[0]!.departed).toBe(true);
    expect(w.notices("Ana").at(-1)).toContain("A excursão saiu");
    w.advance(EXCURSION_TICK_MS);
    expect(w.credits).toEqual(["s0"]);
  });

  it("Guia de Excursão: só excursão marcada com 15+ min de antecedência, e um crédito por líder por dia de jogo", () => {
    const w = world(["Ana", "Beto", "Caio"]);
    /** Ana marca, Beto e Caio entram e já estão no grupo dela. */
    const marcar = (at: number) => {
      w.post("Ana", { at });
      const e = w.ex.active.find((x) => x.leader.name === "Ana" && !x.departed)!;
      for (const n of ["Beto", "Caio"]) w.act(n, { action: "join", id: e.id });
      w.parties.set("s0", ["s0", "s1", "s2"]);
      return e;
    };
    const cancelar = (id: string) => w.act("Ana", { action: "cancel", id });
    // "agora": sai no tick seguinte, mas a conquista não conta (era o atalho de 1 minuto).
    let e = marcar(0);
    w.advance(EXCURSION_TICK_MS);
    expect(w.board().list.find((x) => x.id === e.id)!.departed).toBe(true);
    expect(w.credits).toEqual([]);
    expect(w.notices("Ana").at(-1)).toContain("15+ min de antecedência");
    cancelar(e.id);
    // 12:15 marcada às 12:07 (8 min): também não conta.
    e = marcar(SLOT(1));
    w.advance(e.at - w.clock.t);
    expect(w.credits).toEqual([]);
    cancelar(e.id);
    // 13:00 marcada às 12:15 (45 min): conta.
    e = marcar(SLOT(4));
    w.advance(e.at - w.clock.t);
    expect(w.credits).toEqual(["s0"]);
    expect(w.notices("Ana").at(-1)).toBe("A excursão saiu: Minas Abandonadas. Boa caçada!");
    cancelar(e.id);
    // Outra no mesmo dia de jogo, mesmo marcada com antecedência: não conta de novo (nem depois de um reinício).
    e = marcar(SLOT(8));
    w.ex.flushNow();
    const again = w.make(); // reinício: só o sistema novo confere a saída; o crédito do dia vem do kv
    w.clock.t = e.at;
    again.tick(w.clock.t);
    expect(again.active.find((x) => x.id === e.id)!.departed).toBe(true);
    expect(w.credits).toEqual(["s0"]);
    expect(w.notices("Ana").at(-1)).toContain("o crédito de hoje já foi");
    cancelar(e.id);
    // Dia de jogo seguinte (depois das 6h): conta de novo.
    w.clock.t += 24 * 3_600_000;
    const next = Math.floor(w.clock.t / EXCURSION_STEP_MS) * EXCURSION_STEP_MS + 2 * EXCURSION_STEP_MS;
    e = marcar(next);
    w.advance(e.at - w.clock.t);
    expect(w.credits).toEqual(["s0", "s0"]);
  });

  it("some do mural 30 min depois do horário", () => {
    const w = world(["Ana"]);
    w.post("Ana");
    const e = w.ex.active[0]!;
    w.advance(e.at + EXCURSION_EXPIRE_MS - 1000 - w.clock.t);
    expect(w.ex.active).toHaveLength(1);
    w.advance(1000);
    expect(w.ex.active).toHaveLength(0);
    expect(w.board().list).toEqual([]);
    expect(JSON.parse(w.kv.get(EXCURSION_KV)!).list).toEqual([]);
    w.post("Ana", { at: 0 }); // pode marcar outra
    expect(w.ex.active).toHaveLength(1);
  });
});

describe("excursões: persistência (kv excursoes.v1)", () => {
  it("reinício recarrega o mural (inscritos, lembrete e saída) e o contador de ids continua", () => {
    const w = world(["Ana", "Beto", "Caio"]);
    w.post("Ana");
    const id = w.ex.active[0]!.id;
    w.act("Beto", { action: "join", id });
    w.post("Caio", { dest: "coliseu", at: 0, minLevel: 1, maxLevel: 100 });
    w.ex.flushNow(); // desligando: o WorldRoom solta o que o coalescer de 1×/s ainda segurava
    const again = w.make();
    expect(again.active).toEqual(w.ex.active);
    expect(again.active.map((e) => e.members.map((m) => m.name))).toEqual([[], ["Beto"]]); // a de "agora" (Caio) primeiro
    // Ids novos não repetem os gravados.
    w.atBoard("Beto");
    again.onMessage(w.by("Beto"), { action: "post", dest: "coliseu", minLevel: 1, maxLevel: 99, at: 0, slots: 2 });
    expect(new Set(again.active.map((e) => e.id)).size).toBe(3);
  });

  it("descarta o que não vale mais: vencida, destino fora da lista, malformada, líder repetido", () => {
    const kv = new Map<string, string>();
    const ok = { id: "x5", dest: "coliseu", leader: { name: "Ana", level: 10, vocation: "knight" }, minLevel: 1, maxLevel: 50, at: SLOT(1), slots: 3, members: [{ name: "Beto", level: 9, vocation: "druid" }, { name: "Ana", level: 10, vocation: "knight" }, { name: "x" }], departed: false, reminded: false, createdAt: T0 };
    kv.set(EXCURSION_KV, JSON.stringify({
      seq: 2,
      list: [
        ok,
        { ...ok, id: "x6", leader: { name: "Beto", level: 9, vocation: "druid" }, at: T0 - EXCURSION_EXPIRE_MS - 60_000 },
        { ...ok, id: "x7", leader: { name: "Caio", level: 9, vocation: "druid" }, dest: "zona:Sumiu" },
        { ...ok, id: "x8", leader: { name: "Duda", level: 9, vocation: "mago" } },
        { ...ok, id: "x9" }, // Ana de novo
        "lixo", null,
      ],
    }));
    const w = world(["Ana", "Beto"], kv);
    expect(w.ex.active.map((e) => e.id)).toEqual(["x5"]);
    expect(w.ex.active[0]!.members.map((m) => m.name)).toEqual(["Beto"]); // o líder e o malformado saem da lista
    w.post("Beto", { dest: "coliseu", at: 0 });
    expect(w.ex.active.map((e) => e.id)).toContain("x6"); // seq 2 gravado < x5: continua depois do maior id
    kv.set(EXCURSION_KV, "{json quebrado");
    expect(() => w.make()).not.toThrow();
    expect(w.make().active).toEqual([]);
  });
});

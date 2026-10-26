import { beforeEach, describe, expect, it, vi } from "vitest";
import { BACKPACK_SIZE, S2C, TRADE_INVITE_MS, TRADE_KEEP_RANGE, TRADE_START_RANGE, type TradeStateMsg } from "@lemonquest/shared";
import { makeItem } from "./inventory.ts";
import { invWorld } from "./m4kit.ts";
import { TradeSystem } from "./trade.ts";

function setup(over: { inArena?: (id: string) => boolean } = {}) {
  vi.spyOn(console, "log").mockImplementation(() => {});
  const w = invWorld();
  const a = w.mk("a"), b = w.mk("b");
  a.name = "Ana"; b.name = "Beto";
  const players = new Map([[a.id, a], [b.id, b]]);
  const out: { to: string; type: string; msg: any }[] = [];
  const saved: string[] = [];
  let t = 1_000_000;
  const trade = new TradeSystem({
    getPlayer: (id) => players.get(id), send: (to, type, msg) => out.push({ to, type, msg: structuredClone(msg) }),
    inventory: w.inv, inArena: over.inArena ?? (() => false), save: (id) => saved.push(id), now: () => t,
  });
  const states = (to: string) => out.filter((o) => o.to === to && o.type === S2C.Trade).map((o) => o.msg as TradeStateMsg);
  const last = (to: string) => states(to).at(-1);
  const notices = (to: string) => out.filter((o) => o.to === to && o.type === S2C.Notice).map((o) => o.msg.text as string);
  const open = () => { trade.onMessage(a, { action: "request", targetId: "b" }); trade.onMessage(b, { action: "accept" }); };
  /** Versão das ofertas que `p` está vendo (último estado aberto que recebeu). */
  const rev = (p: { id: string }) => { const st = states(p.id).filter((m) => m.phase === "open").at(-1); return st?.phase === "open" ? st.rev : -1; };
  /** Confirma como o cliente: com a versão que está vendo. */
  const confirm = (p: typeof a) => trade.onMessage(p, { action: "confirm", confirmed: true, rev: rev(p) });
  return { w, a, b, trade, out, states, last, notices, saved, open, players, rev, confirm, advance: (ms: number) => { t += ms; } };
}

describe("trade: convite", () => {
  it("convida, o outro aceita e a janela abre para os dois", () => {
    const s = setup();
    s.trade.onMessage(s.a, { action: "request", targetId: "b" });
    expect(s.last("b")).toEqual({ phase: "invite", fromId: "a", from: "Ana" });
    s.trade.onMessage(s.b, { action: "accept" });
    expect(s.last("a")).toMatchObject({ phase: "open", partner: "Beto" });
    expect(s.last("b")).toMatchObject({ phase: "open", partner: "Ana" });
    expect(s.trade.sessionOf("a")).toEqual({ partner: "b" });
  });

  it("recusar avisa quem convidou; convite expira; longe, a si mesmo e ocupado são recusados", () => {
    const s = setup();
    s.trade.onMessage(s.a, { action: "request", targetId: "b" });
    s.trade.onMessage(s.b, { action: "decline" });
    expect(s.last("b")).toEqual({ phase: "closed" });
    expect(s.notices("a").at(-1)).toContain("recusou");
    s.trade.onMessage(s.a, { action: "request", targetId: "b" });
    s.advance(TRADE_INVITE_MS);
    s.trade.tick();
    expect(s.notices("a").at(-1)).toContain("expirou");
    s.trade.onMessage(s.a, { action: "request", targetId: "a" });
    expect(s.notices("a").at(-1)).toContain("não encontrado");
    s.b.x = s.a.x + TRADE_START_RANGE + 1;
    s.trade.onMessage(s.a, { action: "request", targetId: "b" });
    expect(s.notices("a").at(-1)).toContain("mais perto");
    s.b.x = s.a.x;
    s.trade.onMessage(s.a, { action: "request", targetId: "b" });
    s.trade.onMessage(s.a, { action: "request", targetId: "b" }); // já tem convite pendente
    expect(s.notices("a").at(-1)).toContain("em andamento");
  });

  it("não troca no Coliseu nem morto", () => {
    const s = setup({ inArena: (id) => id === "b" });
    s.trade.onMessage(s.a, { action: "request", targetId: "b" });
    expect(s.notices("a").at(-1)).toContain("Coliseu");
    const s2 = setup();
    s2.b.hp = 0;
    s2.trade.onMessage(s2.a, { action: "request", targetId: "b" });
    expect(s2.notices("a").at(-1)).toContain("Agora não");
  });
});

describe("trade: oferta e troca", () => {
  let s: ReturnType<typeof setup>;
  const bpOf = (id: string) => s.w.inv.get(id)!.backpack;
  beforeEach(() => {
    s = setup();
    s.w.inv.addItem(s.a, makeItem("sword"));
    s.w.inv.addItem(s.b, makeItem("hp_pot", 10));
    s.w.inv.addGold(s.a, 100);
    s.open();
  });

  it("os dois ofertam, os dois confirmam e a troca acontece de uma vez (itens e ouro)", () => {
    const sword = bpOf("a")[0]!, pots = bpOf("b")[0]!;
    s.trade.onMessage(s.a, { action: "offer", items: [{ uid: sword.uid, count: 1 }], gold: 40 });
    s.trade.onMessage(s.b, { action: "offer", items: [{ uid: pots.uid, count: 4 }], gold: 0 });
    // A oferta de cada um aparece para o outro.
    expect(s.last("b")).toMatchObject({ phase: "open", theirs: { gold: 40, items: [expect.objectContaining({ defId: "sword" })] } });
    s.confirm(s.a);
    expect(s.last("b")).toMatchObject({ theirs: { confirmed: true }, mine: { confirmed: false } });
    expect(bpOf("a").some((i) => i?.defId === "hp_pot")).toBe(false); // ainda não trocou
    s.confirm(s.b);
    expect(s.last("a")).toEqual({ phase: "closed" });
    expect(bpOf("a").find((i) => i?.defId === "hp_pot")!.count).toBe(4);
    expect(bpOf("a").some((i) => i?.defId === "sword")).toBe(false);
    expect(bpOf("b").find((i) => i?.defId === "hp_pot")!.count).toBe(6); // ficou com a parte que não ofertou
    expect(bpOf("b").some((i) => i?.defId === "sword")).toBe(true);
    expect(s.w.inv.gold("a")).toBe(60);
    expect(s.w.inv.gold("b")).toBe(40);
    expect(s.saved.sort()).toEqual(["a", "b"]);
    expect(s.notices("a").at(-1)).toContain("Troca concluída");
  });

  it("qualquer mudança na oferta zera as confirmações", () => {
    const sword = bpOf("a")[0]!;
    s.trade.onMessage(s.a, { action: "offer", items: [{ uid: sword.uid, count: 1 }], gold: 0 });
    s.confirm(s.a);
    s.trade.onMessage(s.b, { action: "offer", items: [], gold: 0 });
    expect(s.last("a")).toMatchObject({ mine: { confirmed: false }, theirs: { confirmed: false } });
    s.confirm(s.b);
    expect(s.last("a")).toMatchObject({ phase: "open" }); // só um confirmou: nada acontece
  });

  it("mochila cheia: nada muda, a janela continua aberta e avisa", () => {
    for (let i = 0; i < BACKPACK_SIZE; i++) s.w.inv.addItem(s.b, makeItem("vest")); // enche a mochila de B
    const sword = bpOf("a")[0]!;
    s.trade.onMessage(s.a, { action: "offer", items: [{ uid: sword.uid, count: 1 }], gold: 0 });
    const before = JSON.stringify(bpOf("b"));
    s.confirm(s.a);
    s.confirm(s.b);
    expect(s.last("a")).toMatchObject({ phase: "open", mine: { confirmed: false } });
    expect(s.notices("b").at(-1)).toContain("mochila");
    expect(JSON.stringify(bpOf("b"))).toBe(before);
    expect(bpOf("a")[0]?.defId).toBe("sword");
    expect(s.saved).toEqual([]);
  });

  it("mochila cheia só de um lado, mas liberada pela própria oferta, vale", () => {
    // B cheia, mas oferece uma peça: o espaço que ela libera recebe o item de A.
    for (let i = 0; i < BACKPACK_SIZE - 1; i++) s.w.inv.addItem(s.b, makeItem("vest"));
    const vest = bpOf("b").find((i) => i?.defId === "vest")!;
    const sword = bpOf("a")[0]!;
    s.trade.onMessage(s.a, { action: "offer", items: [{ uid: sword.uid, count: 1 }], gold: 0 });
    s.trade.onMessage(s.b, { action: "offer", items: [{ uid: vest.uid, count: 1 }], gold: 0 });
    s.confirm(s.a);
    s.confirm(s.b);
    expect(s.last("a")).toEqual({ phase: "closed" });
    expect(bpOf("b").some((i) => i?.defId === "sword")).toBe(true);
  });

  it("recusa oferta inválida: uid alheio, contagem demais, repetido, ouro demais, itens demais", () => {
    const sword = bpOf("a")[0]!, pots = bpOf("b")[0]!;
    const bad = [
      { items: [{ uid: pots.uid, count: 1 }], gold: 0 }, // item do outro
      { items: [{ uid: sword.uid, count: 2 }], gold: 0 }, // mais do que tem
      { items: [{ uid: sword.uid, count: 1 }, { uid: sword.uid, count: 1 }], gold: 0 },
      { items: [], gold: 101 }, // ouro demais
      { items: [], gold: -5 },
      { items: [], gold: 1.5 },
      { items: Array.from({ length: 9 }, () => ({ uid: sword.uid, count: 1 })), gold: 0 },
    ];
    for (const o of bad) s.trade.onMessage(s.a, { action: "offer", ...o });
    expect(s.notices("a").filter((n) => n.includes("inválida") || n.includes("ouro")).length).toBe(bad.length);
    expect(s.last("a")).toMatchObject({ mine: { items: [], gold: 0 } });
  });

  it("item que sai da mochila depois de ofertado: a troca não é feita e a oferta vira vazia", () => {
    const sword = bpOf("a")[0]!;
    s.trade.onMessage(s.a, { action: "offer", items: [{ uid: sword.uid, count: 1 }], gold: 0 });
    s.w.inv.takeFromBackpack(s.a, 0, 1); // largou/vendeu depois de ofertar
    s.confirm(s.a);
    s.confirm(s.b);
    expect(s.notices("a").at(-1)).toContain("mudou");
    expect(s.last("a")).toMatchObject({ phase: "open", mine: { items: [] } });
  });
});

describe("trade: versão das ofertas (confirm só vale para o que o jogador viu)", () => {
  let s: ReturnType<typeof setup>;
  const bpOf = (id: string) => s.w.inv.get(id)!.backpack;
  beforeEach(() => {
    s = setup();
    s.w.inv.addItem(s.a, makeItem("sword"));
    s.w.inv.addItem(s.a, makeItem("vest"));
    s.w.inv.addItem(s.b, makeItem("hp_pot", 10));
    s.w.inv.addGold(s.a, 100);
    s.open();
  });

  it("cada oferta sobe a versão, para os dois", () => {
    expect(s.rev(s.a)).toBe(0);
    s.trade.onMessage(s.a, { action: "offer", items: [], gold: 10 });
    expect([s.rev(s.a), s.rev(s.b)]).toEqual([1, 1]);
    s.trade.onMessage(s.b, { action: "offer", items: [], gold: 0 });
    expect([s.rev(s.a), s.rev(s.b)]).toEqual([2, 2]);
  });

  it("corrida: A troca a espada por lixo e o clique de B (que viu a espada) chega depois → não troca", () => {
    const sword = bpOf("a").find((i) => i?.defId === "sword")!, vest = bpOf("a").find((i) => i?.defId === "vest")!;
    const pots = bpOf("b")[0]!;
    s.trade.onMessage(s.a, { action: "offer", items: [{ uid: sword.uid, count: 1 }], gold: 0 });
    s.trade.onMessage(s.b, { action: "offer", items: [{ uid: pots.uid, count: 10 }], gold: 0 });
    const seenByB = s.rev(s.b); // B está vendo a espada
    s.confirm(s.a);
    s.trade.onMessage(s.a, { action: "offer", items: [{ uid: vest.uid, count: 1 }], gold: 0 });
    s.confirm(s.a);
    s.trade.onMessage(s.b, { action: "confirm", confirmed: true, rev: seenByB });
    expect(s.last("b")).toMatchObject({ phase: "open", mine: { confirmed: false }, theirs: { confirmed: true, items: [expect.objectContaining({ defId: "vest" })] } });
    expect(s.notices("b").at(-1)).toContain("mudou");
    expect(bpOf("b").some((i) => i?.defId === "vest")).toBe(false);
    expect(bpOf("b")[0]).toMatchObject({ defId: "hp_pot", count: 10 });
    expect(s.saved).toEqual([]);
    // Vendo a oferta nova, B confirma de novo e aí troca.
    s.confirm(s.b);
    expect(s.last("b")).toEqual({ phase: "closed" });
    expect(bpOf("b").some((i) => i?.defId === "vest")).toBe(true);
  });

  it("confirm sem versão (ou de outro tipo) não vale; desfazer a confirmação não precisa de versão", () => {
    for (const rev of [undefined, "0", null, 99]) {
      s.trade.onMessage(s.a, { action: "confirm", confirmed: true, rev } as any);
      expect(s.last("a")).toMatchObject({ mine: { confirmed: false } });
      expect(s.last("b")).toMatchObject({ theirs: { confirmed: false } });
    }
    s.confirm(s.a);
    expect(s.last("b")).toMatchObject({ theirs: { confirmed: true } });
    s.trade.onMessage(s.a, { action: "confirm", confirmed: false });
    expect(s.last("b")).toMatchObject({ theirs: { confirmed: false } });
  });

  it("confirm sem versão (aba aberta antes da atualização) pede para recarregar, sem o aviso de oferta mudada", () => {
    const before = s.states("a").length;
    s.trade.onMessage(s.a, { action: "confirm", confirmed: true });
    expect(s.notices("a").at(-1)).toBe("Atualize a página (F5 ou Ctrl+R) para concluir a troca.");
    expect(s.states("a").length).toBe(before); // nada a reenviar: não entra em ciclo
    s.trade.onMessage(s.a, { action: "confirm", confirmed: true, rev: 99 });
    expect(s.notices("a").at(-1)).toContain("mudou");
  });

  it("oferta recusada também sobe a versão e devolve o valor real (o campo de ouro volta ao que vale)", () => {
    s.trade.onMessage(s.a, { action: "offer", items: [], gold: 30 });
    s.confirm(s.b);
    s.trade.onMessage(s.a, { action: "offer", items: [], gold: 500 }); // não tem
    expect(s.notices("a").at(-1)).toContain("ouro");
    expect(s.last("a")).toMatchObject({ rev: 2, mine: { gold: 30 } });
    expect(s.last("b")).toMatchObject({ rev: 2, mine: { confirmed: false }, theirs: { gold: 30 } });
  });

  it("ouro enviado logo antes de confirmar (versão + 1) vale; se o outro mudou no meio, não", () => {
    // O cliente manda a oferta pendente de ouro e o confirm com a versão seguinte, sem esperar o estado voltar.
    s.trade.onMessage(s.a, { action: "offer", items: [], gold: 25 });
    s.trade.onMessage(s.a, { action: "confirm", confirmed: true, rev: 1 });
    expect(s.last("b")).toMatchObject({ theirs: { gold: 25, confirmed: true } });
    s.confirm(s.b);
    expect(s.last("a")).toEqual({ phase: "closed" });
    expect(s.w.inv.gold("a")).toBe(75);
    expect(s.w.inv.gold("b")).toBe(25);
  });

  it("ouro + confirm (versão + 1) com uma oferta do outro no meio: o confirm não vale", () => {
    s.trade.onMessage(s.a, { action: "offer", items: [], gold: 25 }); // rev 1
    s.trade.onMessage(s.b, { action: "offer", items: [], gold: 0 }); // rev 2, chegou antes do confirm de A
    s.trade.onMessage(s.a, { action: "confirm", confirmed: true, rev: 1 });
    expect(s.last("b")).toMatchObject({ theirs: { gold: 25, confirmed: false } });
  });

  it("falha na execução (item sumiu) sobe a versão: confirmar a versão velha não vale", () => {
    const sword = bpOf("a").find((i) => i?.defId === "sword")!;
    s.trade.onMessage(s.a, { action: "offer", items: [{ uid: sword.uid, count: 1 }], gold: 0 });
    const old = s.rev(s.b);
    s.w.inv.takeFromBackpack(s.a, bpOf("a").indexOf(sword), 1);
    s.confirm(s.a);
    s.confirm(s.b); // falha: "gone"
    expect(s.rev(s.b)).toBe(old + 1);
    s.trade.onMessage(s.b, { action: "confirm", confirmed: true, rev: old });
    expect(s.last("b")).toMatchObject({ mine: { confirmed: false } });
  });
});

describe("trade: resend (reconexão)", () => {
  it("reenvia a troca aberta com a versão atual, o convite pendente ou closed", () => {
    const s = setup();
    s.trade.resend("a");
    expect(s.last("a")).toEqual({ phase: "closed" });
    s.trade.onMessage(s.a, { action: "request", targetId: "b" });
    s.trade.resend("b");
    expect(s.last("b")).toEqual({ phase: "invite", fromId: "a", from: "Ana" });
    s.trade.resend("a"); // quem convidou não tem janela: closed
    expect(s.last("a")).toEqual({ phase: "closed" });
    s.trade.onMessage(s.b, { action: "accept" });
    s.trade.onMessage(s.a, { action: "offer", items: [], gold: 0 });
    const before = s.out.length;
    s.trade.resend("b");
    expect(s.out.length).toBe(before + 1); // só para quem reconectou
    expect(s.last("b")).toMatchObject({ phase: "open", partner: "Ana", rev: 1, mine: { confirmed: false } });
  });
});

describe("trade: cancelamento", () => {
  it("cancelar, sair do jogo, morrer, se afastar e entrar no Coliseu fecham a troca para os dois", () => {
    for (const kill of [
      (s: ReturnType<typeof setup>) => s.trade.onMessage(s.a, { action: "cancel" }),
      (s: ReturnType<typeof setup>) => s.trade.removePlayer("a"),
      (s: ReturnType<typeof setup>) => { s.b.hp = 0; s.trade.tick(); },
      (s: ReturnType<typeof setup>) => { s.b.x = s.a.x + TRADE_KEEP_RANGE + 1; s.trade.tick(); },
    ]) {
      const s = setup();
      s.open();
      kill(s);
      expect(s.trade.sessionOf("a")).toBeUndefined();
      expect(s.last("a")).toEqual({ phase: "closed" });
      expect(s.last("b")).toEqual({ phase: "closed" });
    }
    let inArena = false;
    const s = setup({ inArena: () => inArena });
    s.open();
    inArena = true;
    s.trade.tick();
    expect(s.trade.sessionOf("b")).toBeUndefined();
  });

  it("mensagem malformada é ignorada", () => {
    const s = setup();
    s.trade.onMessage(s.a, null as any);
    s.trade.onMessage(s.a, { action: "explodir" } as any);
    s.trade.onMessage(s.a, { action: "offer", items: "x", gold: 0 } as any);
    expect(s.out).toEqual([]);
  });
});

describe("trade: refino (ciclo 16)", () => {
  it("item refinado aparece com o nível na oferta e chega ao outro lado com ele", () => {
    const s = setup();
    const bpOf = (id: string) => s.w.inv.get(id)!.backpack;
    s.w.inv.addItem(s.a, { ...makeItem("katana"), refine: 4 });
    s.w.inv.addGold(s.b, 50_000);
    s.open();
    const k = bpOf("a")[0]!;
    s.trade.onMessage(s.a, { action: "offer", items: [{ uid: k.uid, count: 1 }], gold: 0 });
    s.trade.onMessage(s.b, { action: "offer", items: [], gold: 50_000 });
    expect(s.last("b")).toMatchObject({ theirs: { items: [expect.objectContaining({ defId: "katana", refine: 4 })] } });
    s.confirm(s.a);
    s.confirm(s.b);
    const got = bpOf("b").find((i) => i?.defId === "katana")!;
    expect([got.uid, got.refine]).toEqual([k.uid, 4]);
    expect(bpOf("a").some((i) => i?.defId === "katana")).toBe(false);
    expect(s.w.inv.gold("a")).toBe(50_000);
  });
});

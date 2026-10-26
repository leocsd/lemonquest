import { describe, expect, it } from "vitest";
import { S2C } from "@lemonquest/shared";
import { EventSystem, agendaLines } from "./events.ts";
import { rollLoot } from "./loot.ts";
import { itemsFx } from "./m4kit.ts";

// 2026-10-16 é sexta-feira: a "Noite de Caçada" (XP ×2) vale das 19h às 20h, horário local.
const at = (h: number, m = 0) => new Date(2026, 9, 16, h, m, 0, 0).getTime();

function setup() {
  const out: { to: string; type: string; msg: any }[] = [];
  let t = at(18, 0);
  const ev = new EventSystem({
    broadcast: (type, msg) => out.push({ to: "*", type, msg: structuredClone(msg) }),
    send: (to, type, msg) => out.push({ to, type, msg: structuredClone(msg) }),
    now: () => t,
  });
  return { ev, out, set: (ms: number) => { t = ms; ev.tick(ms); }, of: (type: string) => out.filter((o) => o.type === type) };
}

describe("EventSystem", () => {
  it("agenda: começa e termina na hora, anuncia os dois e aplica os multiplicadores só durante", () => {
    const w = setup();
    w.set(at(18, 59));
    expect(w.ev.active).toBeNull();
    expect(w.ev.xpMult()).toBe(1);
    w.set(at(19, 0));
    expect(w.ev.active?.id).toBe("noite_de_cacada");
    expect(w.ev.xpMult()).toBe(2);
    expect(w.ev.lootMult()).toBe(1);
    expect(w.of(S2C.Announce)[0]!.msg.text).toContain("Noite de Caçada");
    expect(w.of(S2C.Event).at(-1)!.msg.active.id).toBe("noite_de_cacada");
    w.set(at(19, 30));
    expect(w.of(S2C.Announce)).toHaveLength(1); // não repete o anúncio
    w.set(at(20, 0));
    expect(w.ev.active).toBeNull();
    expect(w.ev.xpMult()).toBe(1);
    expect(w.of(S2C.Feed).at(-1)!.msg.text).toContain("encerrado");
    expect(w.of(S2C.Event).at(-1)!.msg.active).toBeNull();
  });

  it("verifica no máximo 1×/s (não recalcula a agenda a cada tick)", () => {
    const w = setup();
    w.ev.tick(at(18, 0));
    const n = w.out.length;
    w.ev.tick(at(18, 0) + 200);
    w.ev.tick(at(18, 0) + 900);
    expect(w.out.length).toBe(n);
  });

  it("admin: dispara por N minutos, vale no lugar da agenda, e parar encerra sem a janela agendada voltar", () => {
    const w = setup();
    const a = w.ev.start("mare_de_tesouros", 30, at(18, 0))!;
    expect(a.until).toBe(at(18, 30));
    expect(w.ev.lootMult()).toBe(1.5);
    w.set(at(18, 30));
    expect(w.ev.active).toBeNull(); // acabou sozinho
    w.set(at(19, 10));
    expect(w.ev.active?.id).toBe("noite_de_cacada");
    expect(w.ev.stop(at(19, 11))).toBe(true);
    expect(w.ev.active).toBeNull();
    w.set(at(19, 40));
    expect(w.ev.active).toBeNull(); // a janela das 19h não volta
    expect(w.ev.stop(at(19, 41))).toBe(false);
    expect(w.ev.start("nada", 10)).toBeNull();
    expect(w.ev.start("noite_de_cacada", 0)).toBeNull();
  });

  it("quem entra no mundo recebe o evento em andamento; sem evento, nada", () => {
    const w = setup();
    const sent = () => w.out.filter((o) => o.to === "p1" && o.type === S2C.Event);
    w.ev.sendTo("p1");
    expect(sent()).toHaveLength(0);
    w.set(at(19, 5));
    w.ev.sendTo("p1");
    expect(sent()[0]!.msg.active.id).toBe("noite_de_cacada");
  });

  it("/evento sem argumentos mostra o andamento e o próximo agendado", () => {
    const w = setup();
    expect(w.ev.statusLines(at(18, 0)).join(" ")).toContain("Nenhum evento");
    expect(w.ev.statusLines(at(18, 0)).join(" ")).toContain("Próximo agendado: Noite de Caçada");
    w.set(at(19, 0));
    expect(w.ev.statusLines(at(19, 5))[0]).toContain("Em andamento: Noite de Caçada");
  });
});

describe("EventSystem: agenda e aviso de 10 min (ciclo 17)", () => {
  it("quem entra recebe a agenda da semana; o próximo evento vem em ordem", () => {
    const w = setup();
    w.ev.sendTo("p1");
    const ag = w.out.filter((o) => o.to === "p1" && o.type === S2C.Agenda)[0]!.msg;
    expect(ag.serverNow).toBe(at(18, 0));
    expect(ag.events[0]).toMatchObject({ id: "noite_de_cacada", start: at(19, 0), end: at(20, 0), xpMult: 2 });
    expect(ag.events.length).toBeGreaterThan(10);
    expect(ag.events.find((e: any) => e.id === "furia_de_demodras").boss).toBe("demodras");
    w.ev.sendAgenda("p2", at(19, 30)); // pedido com a janela aberta: a Noite está em andamento
    expect(w.out.find((o) => o.to === "p2")!.msg.events[0]).toMatchObject({ id: "noite_de_cacada", start: at(19, 0) });
  });

  it("avisa uma vez 10 min antes (Feed + EventSoon), e a agenda é difundida no começo e no fim", () => {
    const w = setup();
    w.set(at(18, 49));
    expect(w.of(S2C.EventSoon)).toHaveLength(0);
    w.set(at(18, 50));
    expect(w.of(S2C.EventSoon)).toHaveLength(1);
    expect(w.of(S2C.EventSoon)[0]!.msg).toMatchObject({ id: "noite_de_cacada", start: at(19, 0) });
    expect(w.of(S2C.Feed).at(-1)!.msg.text).toBe("⏰ Em 10 min: Noite de Caçada (19:00) — XP em dobro");
    w.set(at(18, 55));
    w.set(at(18, 59));
    expect(w.of(S2C.EventSoon)).toHaveLength(1); // não repete
    const agendas = () => w.of(S2C.Agenda).filter((o) => o.to === "*").length;
    expect(agendas()).toBe(0);
    w.set(at(19, 0));
    expect(agendas()).toBe(1);
    expect(w.of(S2C.Agenda).at(-1)!.msg.events[0].id).toBe("noite_de_cacada");
    w.set(at(20, 0));
    expect(agendas()).toBe(2);
    expect(w.of(S2C.Agenda).at(-1)!.msg.events.some((e: any) => e.id === "noite_de_cacada" && e.start === at(19, 0))).toBe(false);
  });

  it("reiniciar dentro da janela de aviso não repete o aviso; antes dela, avisa normalmente", () => {
    const mk = (t0: number) => {
      const out: string[] = [];
      let t = t0;
      const ev = new EventSystem({ broadcast: (type) => out.push(type), send: () => {}, now: () => t });
      return { out, set: (ms: number) => { t = ms; ev.tick(ms); } };
    };
    const late = mk(at(18, 53)); // subiu às 18h53: o aviso das 18h50 já tinha saído antes do reinício
    late.set(at(18, 53)); late.set(at(18, 58));
    expect(late.out.filter((x) => x === S2C.EventSoon)).toHaveLength(0);
    const early = mk(at(18, 40));
    early.set(at(18, 40)); early.set(at(18, 50) + 30_000); early.set(at(18, 51));
    expect(early.out.filter((x) => x === S2C.EventSoon)).toHaveLength(1);
  });

  it("onEnd roda quando o evento base acaba (hora ou /evento parar) e o Feed diz o próximo", () => {
    const ended: string[] = [];
    let t = at(18, 0);
    const feed: string[] = [];
    const ev = new EventSystem({ broadcast: (type, m: any) => { if (type === S2C.Feed) feed.push(m.text); }, send: () => {}, now: () => t, onEnd: (e) => ended.push(e.id) });
    ev.tick(t = at(19, 0));
    ev.tick(t = at(20, 0));
    expect(ended).toEqual(["noite_de_cacada"]);
    expect(feed.at(-1)).toBe("Evento encerrado: Noite de Caçada. Próximo: Tarde de Sábado, amanhã às 14:00.");
    ev.start("mare_de_tesouros", 30, t = at(20, 5));
    ev.stop(t = at(20, 10));
    expect(ended).toEqual(["noite_de_cacada", "mare_de_tesouros"]);
  });

  it("/agenda: um dia por linha, com o em andamento e o próximo marcados", () => {
    const lines = agendaLines(at(19, 30)); // sexta 19h30, no meio da Noite de Caçada
    expect(lines[0]).toMatch(/^Agenda da semana/);
    expect(lines[1]).toBe("Hoje: 19:00 Noite de Caçada ▶ agora (até 20:00)");
    expect(lines[2]).toBe("Amanhã: 14:00 Tarde de Sábado ← próximo · 21:00 Invasão de Orshabaal");
    expect(lines.at(-1)).toMatch(/^Sex: 12:15 Fúria de Demodras · 17:00 Sextou!$/);
    expect(lines.length).toBe(1 + 8); // hoje + 6 dias + a sexta seguinte (antes das 19h30)
  });
});

describe("EventSystem: chefe do evento", () => {
  it("onStart roda uma vez no início (agendado ou manual) com o chefe do evento", () => {
    const started: string[] = [];
    const ev = new EventSystem({ broadcast: () => {}, send: () => {}, now: () => at(14, 0), onStart: (e) => started.push(`${e.id}:${e.boss ?? "-"}`) });
    ev.tick(at(14, 0)); // sexta 14h: nenhum evento agendado (Demodras acabou às 13h; o Sextou só começa às 17h)
    expect(started).toEqual([]);
    ev.start("despertar_do_lich", 30, at(14, 5)); // manual, mesmo fora da janela do Lich
    expect(started).toEqual(["despertar_do_lich:swamp_lich"]);
    ev.tick(at(14, 10));
    expect(started).toHaveLength(1); // não repete
    ev.stop(at(14, 20));
    ev.tick(at(19, 0)); // entra a Noite de Caçada agendada (sem chefe)
    expect(started.at(-1)).toBe("noite_de_cacada:-");
  });
});

describe("EventSystem: persistência do evento manual", () => {
  const mk = (kv: { v?: string }, t: number) => new EventSystem({
    broadcast: () => {}, send: () => {}, now: () => t,
    store: { get: () => kv.v, set: (v) => { kv.v = v; } },
  });

  it("o evento disparado por admin volta depois de um reinício e some quando vence", () => {
    const kv: { v?: string } = {};
    const a = mk(kv, at(14, 0));
    a.start("mare_de_tesouros", 60, at(14, 0)); // 14h–15h (sexta à tarde: a agenda só volta com o Sextou, às 17h)
    expect(JSON.parse(kv.v!).id).toBe("mare_de_tesouros");
    const b = mk(kv, at(14, 20)); // "reinício" no meio do evento
    b.tick(at(14, 20));
    expect(b.active?.id).toBe("mare_de_tesouros");
    expect(b.lootMult()).toBe(1.5);
    const c = mk(kv, at(15, 30)); // reiniciou depois do fim
    c.tick(at(15, 30));
    expect(c.active).toBeNull();
  });

  it("parar apaga o que estava salvo; lixo no armazenamento é ignorado", () => {
    const kv: { v?: string } = {};
    const a = mk(kv, at(18, 0));
    a.start("noite_de_cacada", 30, at(18, 0));
    a.stop(at(18, 5));
    expect(kv.v).toBe("null");
    expect(mk(kv, at(18, 6)).active).toBeNull();
    for (const bad of ["não é json", '{"id":"nada","until":999999999999999}', '{"id":"noite_de_cacada"}']) {
      const k2 = { v: bad };
      const x = mk(k2, at(18, 0));
      x.tick(at(18, 0));
      expect(x.active).toBeNull();
    }
  });
});

describe("loot com bônus de evento", () => {
  const def: any = { id: "m", loot: [{ itemId: "bone", chance: 0.4 }] };
  // Sorteio fixo 0,5: com chance 0,4 não cai; com ×1,5 (0,6) cai.
  const drops = (mult: number) => rollLoot(def, () => 0.5, itemsFx, mult).items.length;
  it("multiplicar a chance aumenta os drops e nunca passa de 100%", () => {
    expect(drops(1)).toBe(0);
    expect(drops(1.25)).toBe(0); // 0,4 × 1,25 = 0,5: sorteio 0,5 não é menor
    expect(drops(1.5)).toBe(1);
    expect(rollLoot({ id: "x", loot: [{ itemId: "bone", chance: 0.9 }] } as any, () => 0.999, itemsFx, 10).items).toHaveLength(1); // chance limitada a 1
  });
});

describe("EventSystem: bônus de código (Sprint Fechada do ClickUp)", () => {
  const SPRINT = (t: number, min = 60) => ({ id: "sprint_fechada", name: "Sprint Fechada", desc: "XP ×1,25", xpMult: 1.25, lootMult: 1, until: t + min * 60_000 });

  it("sozinho: vale XP ×1,25, sobrevive a reinício e tem multiplicador limitado", () => {
    let stored: string | undefined;
    let t = at(10, 0);
    const mk = () => new EventSystem({ broadcast: () => {}, send: () => {}, now: () => t, bonusStore: { get: () => stored, set: (v) => { stored = v; } } });
    const ev = mk();
    expect(ev.startBonus(SPRINT(t))?.id).toBe("sprint_fechada");
    expect(ev.xpMult()).toBe(1.25);
    const again = mk();
    again.tick(t);
    expect(again.active?.name).toBe("Sprint Fechada");
    expect(again.xpMult()).toBe(1.25);
    t += 61 * 60_000;
    again.tick(t);
    expect(again.active).toBeNull();
    stored = JSON.stringify({ id: "x", name: "x", desc: "x", xpMult: 99, lootMult: -5, until: t + 1000 });
    const capped = mk();
    capped.tick(t);
    expect(capped.xpMult()).toBe(3);
    expect(capped.lootMult()).toBe(1);
    expect(mk().startBonus({ ...SPRINT(t), until: t - 1 })).toBeNull();
  });

  it("agendado + sprint ao mesmo tempo: multiplicadores se multiplicam, o agendado não some e o chefe é convocado", () => {
    const w = setup();
    const bosses: string[] = [];
    w.set(at(18, 30));
    w.ev.startBonus(SPRINT(at(18, 30), 60)); // até 19h30
    expect(w.ev.xpMult()).toBe(1.25);
    w.set(at(19, 0)); // começa a Noite de Caçada (XP ×2)
    expect(w.ev.xpMult()).toBe(2.5);
    expect(w.ev.active?.name).toBe("Noite de Caçada + Sprint Fechada");
    expect(w.of(S2C.Announce).some((a) => a.msg.text.includes("Noite de Caçada"))).toBe(true);
    expect(w.of(S2C.Event).at(-1)!.msg.active.xpMult).toBe(2.5);
    w.set(at(19, 31)); // a sprint acaba, a noite continua
    expect(w.ev.xpMult()).toBe(2);
    expect(w.ev.active?.id).toBe("noite_de_cacada");
    expect(w.of(S2C.Event).at(-1)!.msg.active.xpMult).toBe(2);
    // Chefe agendado começa com a sprint ligada: onStart roda igual.
    let t = at(12, 0);
    const ev = new EventSystem({ broadcast: () => {}, send: () => {}, now: () => t, onStart: (e) => { if (e.boss) bosses.push(e.boss); } });
    ev.startBonus(SPRINT(t, 120));
    t = at(12, 15);
    ev.tick(t);
    expect(bosses).toEqual(["demodras"]); // sexta 12h15: Fúria de Demodras
    expect(ev.lootMult()).toBe(1.5);
    expect(ev.xpMult()).toBe(1.25);
  });

  it("/evento parar encerra também o bônus", () => {
    const w = setup();
    w.ev.startBonus(SPRINT(at(18, 0)));
    expect(w.ev.stop()).toBe(true);
    expect(w.ev.active).toBeNull();
    expect(w.ev.xpMult()).toBe(1);
    expect(w.of(S2C.Feed).at(-1)!.msg.text).toBe("Bônus encerrado: Sprint Fechada.");
    expect(w.of(S2C.Event).at(-1)!.msg.active).toBeNull();
  });
});

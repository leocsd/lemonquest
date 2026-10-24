import { describe, expect, it } from "vitest";
import { S2C } from "@lemonquest/shared";
import { EventSystem } from "./events.ts";
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
    w.ev.sendTo("p1");
    expect(w.out.filter((o) => o.to === "p1")).toHaveLength(0);
    w.set(at(19, 5));
    w.ev.sendTo("p1");
    expect(w.out.filter((o) => o.to === "p1")[0]!.msg.active.id).toBe("noite_de_cacada");
  });

  it("/evento sem argumentos mostra o andamento e o próximo agendado", () => {
    const w = setup();
    expect(w.ev.statusLines(at(18, 0)).join(" ")).toContain("Nenhum evento");
    expect(w.ev.statusLines(at(18, 0)).join(" ")).toContain("Próximo agendado: Noite de Caçada");
    w.set(at(19, 0));
    expect(w.ev.statusLines(at(19, 5))[0]).toContain("Em andamento: Noite de Caçada");
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

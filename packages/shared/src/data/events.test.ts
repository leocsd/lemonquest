import { describe, expect, it } from "vitest";
import { WEEKLY_EVENTS, eventBonusText, nextScheduled, scheduledEvent, type GameEventDef } from "./events.ts";
import { MONSTERS } from "./monsters.ts";

// 2026-10-14 é uma quarta-feira (dia 3); 2026-10-16, sexta (5); 2026-10-17, sábado (6); 2026-10-19, segunda (1).
const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min, 0, 0);

describe("eventos semanais", () => {
  it("a definição é coerente: ids únicos, dia/hora válidos, bônus positivos", () => {
    expect(new Set(WEEKLY_EVENTS.map((e) => e.id)).size).toBe(WEEKLY_EVENTS.length);
    for (const e of WEEKLY_EVENTS) {
      expect(e.day).toBeGreaterThanOrEqual(0); expect(e.day).toBeLessThanOrEqual(6);
      expect(e.hour).toBeLessThan(24);
      expect(e.durationMin).toBeGreaterThan(0);
      expect(e.xpMult).toBeGreaterThanOrEqual(1); expect(e.lootMult).toBeGreaterThanOrEqual(1);
      expect(e.id).toMatch(/^[a-z_]+$/); // digitável no /evento
    }
  });

  it("agenda: ativo só dentro da janela (início inclusivo, fim exclusivo)", () => {
    expect(scheduledEvent(at(2026, 10, 16, 18, 59))).toBeNull();
    expect(scheduledEvent(at(2026, 10, 16, 19, 0))).toMatchObject({ id: "noite_de_cacada", xpMult: 2 });
    expect(scheduledEvent(at(2026, 10, 16, 19, 59))?.id).toBe("noite_de_cacada");
    expect(scheduledEvent(at(2026, 10, 16, 20, 0))).toBeNull();
    expect(scheduledEvent(at(2026, 10, 14, 12, 30))?.id).toBe("mare_de_tesouros"); // quarta
    expect(scheduledEvent(at(2026, 10, 15, 12, 30))?.id).toBe("rugido_do_yeti"); // quinta: chefe do almoço
    expect(scheduledEvent(at(2026, 10, 15, 14, 0))).toBeNull(); // quinta à tarde: nenhum
    expect(scheduledEvent(at(2026, 10, 16, 17, 30))?.id).toBe("sextou"); // sexta 17h–18h
    expect(scheduledEvent(at(2026, 10, 19, 9, 20))?.id).toBe("reuniao_geral"); // segunda 9h–9h45
  });

  it("o fim vem em ms epoch e a janela que atravessa a meia-noite continua no dia seguinte", () => {
    const late: GameEventDef = { id: "tarde", name: "T", desc: "", xpMult: 2, lootMult: 1, day: 5, hour: 23, durationMin: 120 };
    expect(scheduledEvent(at(2026, 10, 16, 23, 30), [late])?.until).toBe(at(2026, 10, 17, 1, 0).getTime());
    expect(scheduledEvent(at(2026, 10, 17, 0, 30), [late])?.id).toBe("tarde"); // já é sábado
    expect(scheduledEvent(at(2026, 10, 17, 1, 0), [late])).toBeNull();
  });

  it("próximo evento: o mais cedo depois de agora", () => {
    const n = nextScheduled(at(2026, 10, 14, 13, 0))!; // quarta depois da Maré (12h): o próximo é o Yeti, quinta 12h15
    expect(n.def.id).toBe("rugido_do_yeti");
    expect(n.at).toBe(at(2026, 10, 15, 12, 15).getTime());
    expect(nextScheduled(at(2026, 10, 15, 13, 0))!.def.id).toBe("furia_de_demodras"); // quinta depois do Yeti: sexta 12h15
    expect(nextScheduled(at(2026, 10, 16, 13, 0))!.def.id).toBe("sextou"); // sexta depois de Demodras: Sextou 17h
    expect(nextScheduled(at(2026, 10, 16, 18, 0))!.def.id).toBe("noite_de_cacada"); // sexta depois do Sextou: 19h
    expect(nextScheduled(at(2026, 10, 16, 20, 0))!.def.id).toBe("tarde_de_sabado"); // sexta à noite: sábado 14h
    expect(nextScheduled(at(2026, 10, 17, 17, 0))!.def.id).toBe("invasao_de_orshabaal"); // sábado depois das 16h: 21h
    expect(nextScheduled(at(2026, 10, 17, 23, 0))!.def.id).toBe("retorno_de_ferumbras"); // sábado à noite: domingo 15h
    expect(nextScheduled(at(2026, 10, 18, 17, 0))!.def.id).toBe("reuniao_geral"); // domingo depois de Ferumbras: segunda 9h
    expect(nextScheduled(at(2026, 10, 19, 10, 0))!.def.id).toBe("despertar_do_lich"); // segunda depois da Reunião: 12h15
    expect(nextScheduled(at(2026, 10, 19, 13, 0))!.def.id).toBe("cacada_ao_rei"); // segunda depois do Lich: terça 12h15
    expect(nextScheduled(at(2026, 10, 20, 13, 0))!.def.id).toBe("mare_de_tesouros"); // terça depois do Rei: quarta 12h
  });

  it("eventos de chefe: o chefe existe no catálogo e as janelas não se sobrepõem", () => {
    const withBoss = WEEKLY_EVENTS.filter((e) => e.boss);
    expect(withBoss.map((e) => e.boss).sort()).toEqual(["demodras", "ferumbras", "goblin_king", "orshabaal", "swamp_lich", "yeti"]);
    for (const e of withBoss) expect(MONSTERS[e.boss!]?.boss, e.boss).toBe(true);
    // Nenhuma janela começa dentro de outra no mesmo dia (scheduledEvent devolve só uma).
    for (const a of WEEKLY_EVENTS) for (const b of WEEKLY_EVENTS) {
      if (a === b || a.day !== b.day) continue;
      const as = a.hour * 60 + (a.minute ?? 0), bs = b.hour * 60 + (b.minute ?? 0);
      expect(as + a.durationMin <= bs || bs + b.durationMin <= as, `${a.id} × ${b.id}`).toBe(true);
    }
    expect(scheduledEvent(at(2026, 10, 19, 12, 30))).toMatchObject({ id: "despertar_do_lich", boss: "swamp_lich" }); // segunda
    expect(scheduledEvent(at(2026, 10, 19, 12, 14))).toBeNull();
    expect(scheduledEvent(at(2026, 10, 19, 13, 0))).toBeNull();
    expect(scheduledEvent(at(2026, 10, 18, 15, 30))).toMatchObject({ id: "retorno_de_ferumbras", boss: "ferumbras" }); // domingo
  });

  it("chefes no horário do almoço: dias úteis entre 12h e 13h, e só um chefe à noite", () => {
    const withBoss = WEEKLY_EVENTS.filter((e) => e.boss);
    const lunch = withBoss.filter((e) => e.day >= 1 && e.day <= 5);
    expect(lunch.length).toBe(4);
    for (const e of lunch) {
      const start = e.hour * 60 + (e.minute ?? 0);
      expect(start, e.id).toBeGreaterThanOrEqual(12 * 60);
      expect(start + e.durationMin, e.id).toBeLessThanOrEqual(13 * 60);
    }
    expect(withBoss.filter((e) => e.hour >= 18).map((e) => e.id)).toEqual(["invasao_de_orshabaal"]);
  });

  it("texto do bônus: só o que passa de 1, com vírgula decimal", () => {
    expect(eventBonusText({ xpMult: 2, lootMult: 1 })).toBe("XP ×2");
    expect(eventBonusText({ xpMult: 1, lootMult: 1.5 })).toBe("loot ×1,5");
    expect(eventBonusText({ xpMult: 1.5, lootMult: 1.25 })).toBe("XP ×1,5 · loot ×1,25");
    expect(eventBonusText({ xpMult: 1, lootMult: 1 })).toBe("");
  });
});

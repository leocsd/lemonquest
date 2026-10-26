import { describe, expect, it } from "vitest";
import { EVENT_SOON_MS, WEEKLY_EVENTS, clockText, eventBonusText, eventDef, eventWhenText, nextScheduled, scheduledEvent, upcomingEvents, type GameEventDef } from "./events.ts";
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
    expect(scheduledEvent(at(2026, 10, 14, 12, 30))?.id).toBe("invasao_da_vila"); // quarta (ciclo 18)
    expect(scheduledEvent(at(2026, 10, 15, 12, 30))?.id).toBe("rugido_do_yeti"); // quinta: chefe do almoço
    expect(scheduledEvent(at(2026, 10, 15, 13, 30))?.id).toBe("mare_de_tesouros"); // quinta 13h–14h (ciclo 18)
    expect(scheduledEvent(at(2026, 10, 15, 14, 0))).toBeNull(); // quinta à tarde: nenhum
    expect(scheduledEvent(at(2026, 10, 14, 17, 30))).toMatchObject({ id: "apito_da_locomotiva", boss: "locomotiva_fantasma" }); // quarta 17h–18h
    expect(scheduledEvent(at(2026, 10, 14, 18, 0))).toBeNull();
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
    // Ciclo 11: depois do almoço de quarta (Invasão da Vila desde o ciclo 18) vem o Apito da Locomotiva (17h) e só então o
    // Yeti (quinta 12h15).
    const apito = nextScheduled(at(2026, 10, 14, 13, 0))!; // quarta depois da Invasão (12h15–12h55)
    expect(apito.def.id).toBe("apito_da_locomotiva");
    expect(apito.at).toBe(at(2026, 10, 14, 17, 0).getTime());
    const n = nextScheduled(at(2026, 10, 14, 18, 0))!; // quarta depois do Apito: o próximo é o Yeti, quinta 12h15
    expect(n.def.id).toBe("rugido_do_yeti");
    expect(n.at).toBe(at(2026, 10, 15, 12, 15).getTime());
    // Ciclo 18: quinta, a Maré de Tesouros vem colada no Yeti (13h); depois dela, o Cerco de Orshabaal (17h, ciclo 12) e
    // então Demodras na sexta 12h15.
    expect(nextScheduled(at(2026, 10, 15, 12, 30))!.def.id).toBe("mare_de_tesouros");
    expect(nextScheduled(at(2026, 10, 15, 12, 30))!.at).toBe(at(2026, 10, 15, 13, 0).getTime());
    expect(nextScheduled(at(2026, 10, 15, 13, 0))!.def.id).toBe("orshabaal_no_expediente");
    expect(nextScheduled(at(2026, 10, 15, 18, 0))!.def.id).toBe("furia_de_demodras");
    expect(nextScheduled(at(2026, 10, 16, 13, 0))!.def.id).toBe("sextou"); // sexta depois de Demodras: Sextou 17h
    expect(nextScheduled(at(2026, 10, 16, 18, 0))!.def.id).toBe("noite_de_cacada"); // sexta depois do Sextou: 19h
    expect(nextScheduled(at(2026, 10, 16, 20, 0))!.def.id).toBe("tarde_de_sabado"); // sexta à noite: sábado 14h
    expect(nextScheduled(at(2026, 10, 17, 17, 0))!.def.id).toBe("invasao_de_orshabaal"); // sábado depois das 16h: 21h
    expect(nextScheduled(at(2026, 10, 17, 23, 0))!.def.id).toBe("retorno_de_ferumbras"); // sábado à noite: domingo 15h
    expect(nextScheduled(at(2026, 10, 18, 17, 0))!.def.id).toBe("reuniao_geral"); // domingo depois de Ferumbras: segunda 9h
    expect(nextScheduled(at(2026, 10, 19, 10, 0))!.def.id).toBe("despertar_do_lich"); // segunda depois da Reunião: 12h15
    // Ciclo 19: a segunda às 17h é da Sangria do Alto-Forno; depois dela, o Rei Goblin na terça 12h15.
    expect(nextScheduled(at(2026, 10, 19, 13, 0))!.def.id).toBe("sangria_do_alto_forno"); // segunda depois do Lich: 17h
    expect(nextScheduled(at(2026, 10, 19, 13, 0))!.at).toBe(at(2026, 10, 19, 17, 0).getTime());
    expect(nextScheduled(at(2026, 10, 19, 18, 0))!.def.id).toBe("cacada_ao_rei"); // segunda depois da Sangria: terça 12h15
    expect(nextScheduled(at(2026, 10, 20, 13, 0))!.def.id).toBe("ferumbras_no_expediente"); // terça depois do Rei: Ferumbras 17h
    expect(nextScheduled(at(2026, 10, 20, 18, 0))!.def.id).toBe("invasao_da_vila"); // terça depois de Ferumbras: quarta 12h15
  });

  it("eventos de chefe: o chefe existe no catálogo e as janelas não se sobrepõem", () => {
    const withBoss = WEEKLY_EVENTS.filter((e) => e.boss);
    expect(withBoss.map((e) => e.boss).sort()).toEqual(["demodras", "ferumbras", "ferumbras", "goblin_king", "golem_convertedor", "locomotiva_fantasma", "orshabaal", "orshabaal", "swamp_lich", "yeti"]);
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
    expect(scheduledEvent(at(2026, 10, 19, 17, 30))).toMatchObject({ id: "sangria_do_alto_forno", boss: "golem_convertedor" }); // segunda 17h–18h
    expect(scheduledEvent(at(2026, 10, 19, 18, 0))).toBeNull();
    expect(scheduledEvent(at(2026, 10, 18, 15, 30))).toMatchObject({ id: "retorno_de_ferumbras", boss: "ferumbras" }); // domingo
  });

  it("chefes no horário do almoço: dias úteis entre 12h e 13h, e só um chefe à noite", () => {
    const withBoss = WEEKLY_EVENTS.filter((e) => e.boss);
    // Fora do almoço, só no fim do expediente (17h–18h): o Apito (ciclo 11), desde o ciclo 12 Ferumbras na terça e
    // Orshabaal na quinta (antes só no fim de semana, quando ninguém do escritório está online) e, desde o ciclo 19, a
    // Sangria do Alto-Forno na segunda.
    const weekday = withBoss.filter((e) => e.day >= 1 && e.day <= 5);
    expect(weekday.filter((e) => e.hour >= 13).map((e) => e.id)).toEqual(["apito_da_locomotiva", "ferumbras_no_expediente", "orshabaal_no_expediente", "sangria_do_alto_forno"]);
    expect(eventDef("apito_da_locomotiva")).toMatchObject({ day: 3, hour: 17, durationMin: 60, boss: "locomotiva_fantasma" });
    expect(eventDef("ferumbras_no_expediente")).toMatchObject({ day: 2, hour: 17, durationMin: 60, boss: "ferumbras" });
    expect(eventDef("orshabaal_no_expediente")).toMatchObject({ day: 4, hour: 17, durationMin: 60, boss: "orshabaal" });
    expect(eventDef("sangria_do_alto_forno")).toMatchObject({ day: 1, hour: 17, durationMin: 60, boss: "golem_convertedor", lootMult: 1.5 });
    const lunch = weekday.filter((e) => e.hour < 13);
    expect(lunch.length).toBe(4);
    for (const e of lunch) {
      const start = e.hour * 60 + (e.minute ?? 0);
      expect(start, e.id).toBeGreaterThanOrEqual(12 * 60);
      expect(start + e.durationMin, e.id).toBeLessThanOrEqual(13 * 60);
    }
    expect(withBoss.filter((e) => e.hour >= 18).map((e) => e.id)).toEqual(["invasao_de_orshabaal"]);
  });

  it("ciclo 18: Invasão da Vila na quarta 12h15–12h55 e Maré de Tesouros na quinta 13h–14h, sem sobrepor ninguém", () => {
    expect(eventDef("invasao_da_vila")).toMatchObject({ day: 3, hour: 12, minute: 15, durationMin: 40, invasion: true, xpMult: 1, lootMult: 1 });
    expect(eventDef("mare_de_tesouros")).toMatchObject({ day: 4, hour: 13, durationMin: 60, lootMult: 1.5 });
    expect(WEEKLY_EVENTS.filter((e) => e.invasion).map((e) => e.id)).toEqual(["invasao_da_vila"]);
    expect(eventDef("invasao_da_vila")!.boss).toBeUndefined();
    // Quinta: Yeti 12h15–13h, Maré 13h–14h, Orshabaal 17h; quarta: Invasão 12h15–12h55, Apito 17h.
    const day = (d: number) => WEEKLY_EVENTS.filter((e) => e.day === d).map((e) => `${e.id}@${e.hour * 60 + (e.minute ?? 0)}+${e.durationMin}`).sort();
    expect(day(3)).toEqual(["apito_da_locomotiva@1020+60", "invasao_da_vila@735+40"]);
    expect(day(4)).toEqual(["mare_de_tesouros@780+60", "orshabaal_no_expediente@1020+60", "rugido_do_yeti@735+45"]);
    expect(scheduledEvent(at(2026, 10, 14, 12, 14))).toBeNull();
    expect(scheduledEvent(at(2026, 10, 14, 12, 15))?.id).toBe("invasao_da_vila");
    expect(scheduledEvent(at(2026, 10, 14, 12, 54))?.until).toBe(at(2026, 10, 14, 12, 55).getTime());
    expect(scheduledEvent(at(2026, 10, 14, 12, 55))).toBeNull();
    expect(scheduledEvent(at(2026, 10, 15, 12, 59))?.id).toBe("rugido_do_yeti");
    expect(scheduledEvent(at(2026, 10, 15, 13, 0))?.id).toBe("mare_de_tesouros");
  });

  it("agenda: a semana inteira a partir de agora, em ordem, com o evento em andamento primeiro", () => {
    const now = at(2026, 10, 14, 12, 30); // quarta, no meio da Invasão da Vila (12h15–12h55)
    const week = upcomingEvents(now);
    expect(week).toHaveLength(WEEKLY_EVENTS.length);
    expect(new Set(week.map((e) => e.def.id)).size).toBe(WEEKLY_EVENTS.length); // uma ocorrência de cada
    expect(week[0]).toMatchObject({ live: true, start: at(2026, 10, 14, 12, 15).getTime(), end: at(2026, 10, 14, 12, 55).getTime() });
    expect(week[0]!.def.id).toBe("invasao_da_vila");
    expect(week.slice(1).every((e) => !e.live)).toBe(true);
    for (let i = 1; i < week.length; i++) expect(week[i]!.start).toBeGreaterThan(week[i - 1]!.start);
    // O próximo depois do em andamento é o mesmo do agendador (nextScheduled): mesmo fuso, mesma conta.
    expect(week[1]!.def.id).toBe(nextScheduled(now)!.def.id);
    expect(week[1]!.start).toBe(nextScheduled(now)!.at);
    expect(week.at(-1)!.start).toBeLessThan(now.getTime() + 7 * 86_400_000);
    // Fim exclusivo: às 12h55 a Invasão já saiu da lista e volta só na quarta seguinte (o último da semana).
    const after = upcomingEvents(at(2026, 10, 14, 12, 55));
    expect(after[0]!.live).toBe(false);
    expect(after.at(-1)).toMatchObject({ start: at(2026, 10, 21, 12, 15).getTime() });
    expect(after.at(-1)!.def.id).toBe("invasao_da_vila");
    expect(upcomingEvents(now, 3).map((e) => e.def.id)).toEqual(["invasao_da_vila", "apito_da_locomotiva", "rugido_do_yeti"]);
    expect(upcomingEvents(now, 0)).toEqual([]);
  });

  it("agenda: a janela de ontem que atravessa a meia-noite aparece como em andamento", () => {
    const late: GameEventDef = { id: "tarde", name: "T", desc: "", xpMult: 2, lootMult: 1, day: 5, hour: 23, durationMin: 120 };
    const [e] = upcomingEvents(at(2026, 10, 17, 0, 30), 1, [late]); // sábado 0h30, começou sexta 23h
    expect(e).toMatchObject({ live: true, start: at(2026, 10, 16, 23, 0).getTime(), end: at(2026, 10, 17, 1, 0).getTime() });
  });

  it("textos de horário: hoje, amanhã e o dia da semana", () => {
    const now = at(2026, 10, 14, 18, 0).getTime(); // quarta
    expect(clockText(at(2026, 10, 15, 9, 5).getTime())).toBe("09:05");
    expect(eventWhenText(at(2026, 10, 14, 19, 0).getTime(), now)).toBe("hoje às 19:00");
    expect(eventWhenText(at(2026, 10, 15, 12, 15).getTime(), now)).toBe("amanhã às 12:15");
    expect(eventWhenText(at(2026, 10, 16, 17, 0).getTime(), now)).toBe("sex às 17:00");
    expect(eventWhenText(at(2026, 10, 18, 15, 0).getTime(), now)).toBe("dom às 15:00");
    expect(EVENT_SOON_MS).toBe(10 * 60_000);
  });

  it("texto do bônus: só o que passa de 1, com vírgula decimal", () => {
    expect(eventBonusText({ xpMult: 2, lootMult: 1 })).toBe("XP ×2");
    expect(eventBonusText({ xpMult: 1, lootMult: 1.5 })).toBe("loot ×1,5");
    expect(eventBonusText({ xpMult: 1.5, lootMult: 1.25 })).toBe("XP ×1,5 · loot ×1,25");
    expect(eventBonusText({ xpMult: 1, lootMult: 1 })).toBe("");
  });
});

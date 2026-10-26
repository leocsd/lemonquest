import { describe, expect, it } from "vitest";
import type { AgendaEntry } from "@lemonquest/shared";
import { agendaByDay, nextEvent, nextEventLabel, startsInText, visibleAgenda } from "./agendaLogic.ts";

// 2026-10-14 é quarta-feira.
const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m, 0, 0).getTime();
const ev = (id: string, start: number, min = 60): AgendaEntry => ({ id, name: id.toUpperCase(), desc: "", xpMult: 1, lootMult: 1.5, start, end: start + min * 60_000 });
const WEEK = [ev("mare", at(14, 12)), ev("apito", at(14, 17)), ev("yeti", at(15, 12, 15), 45), ev("demodras", at(16, 12, 15), 45)];

describe("agenda", () => {
  it("some o que acabou; a janela já começada só fica se for o evento em andamento", () => {
    expect(visibleAgenda(WEEK, at(14, 12, 30), "mare").map((e) => e.id)).toEqual(["mare", "apito", "yeti", "demodras"]);
    expect(visibleAgenda(WEEK, at(14, 12, 30), null).map((e) => e.id)).toEqual(["apito", "yeti", "demodras"]); // admin parou
    expect(visibleAgenda(WEEK, at(14, 13), "mare").map((e) => e.id)).toEqual(["apito", "yeti", "demodras"]); // acabou
  });

  it("próximo evento e o selo: hoje sem o dia, amanhã e dia da semana", () => {
    expect(nextEvent(WEEK, at(14, 12, 30))?.id).toBe("apito");
    expect(nextEvent(WEEK, at(16, 13))).toBeNull();
    expect(nextEventLabel(WEEK[1]!, at(14, 13))).toBe("Próximo: APITO às 17:00");
    expect(nextEventLabel(WEEK[2]!, at(14, 18))).toBe("Próximo: YETI amanhã às 12:15");
    expect(nextEventLabel(WEEK[3]!, at(14, 18))).toBe("Próximo: DEMODRAS sex às 12:15");
  });

  it("agrupa por dia na ordem da lista", () => {
    const g = agendaByDay(WEEK, at(14, 9));
    expect(g.map((d) => [d.day, d.items.map((e) => e.id)])).toEqual([["Hoje", ["mare", "apito"]], ["Amanhã", ["yeti"]], ["Sex", ["demodras"]]]);
  });

  it("contagem do aviso: arredonda para cima e nunca diz 0 min", () => {
    expect(startsInText(at(14, 12), at(14, 11, 50))).toBe("começa em 10 min");
    expect(startsInText(at(14, 12), at(14, 11, 52) + 30_000)).toBe("começa em 8 min");
    expect(startsInText(at(14, 12), at(14, 12) - 1000)).toBe("começa em 1 min");
  });
});

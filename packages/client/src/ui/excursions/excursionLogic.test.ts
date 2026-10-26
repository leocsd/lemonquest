import { describe, expect, it } from "vitest";
import { COLISEU_DEST, EXCURSION_MAX_JOINED, type ExcursionDest, type ExcursionView } from "@lemonquest/shared";
import {
  destGroups, destOptionText, excursionClock, excursionFill, excursionRole, excursionStatus, joinBlock, joinedCount, openExcursions, timeSlotLabel,
} from "./excursionLogic.ts";

const P = (name: string, level = 30) => ({ name, level, vocation: "knight" as const });
const ex = (over: Partial<ExcursionView> = {}): ExcursionView => ({
  id: "x1", dest: "zona:Minas", destLabel: "Minas", leader: P("Ana"), minLevel: 20, maxLevel: 40, at: 0, slots: 4, members: [P("Beto")], departed: false,
  ...over,
});

describe("excursões no cliente: papéis e Quero ir", () => {
  it("papel por nome (sem diferenciar maiúsculas) e ocupação contando o líder", () => {
    const e = ex();
    expect(excursionRole(e, "ana")).toBe("leader");
    expect(excursionRole(e, "Beto")).toBe("member");
    expect(excursionRole(e, "Caio")).toBe("none");
    expect(excursionFill(e)).toBe("2/4");
  });

  it("o botão diz por que não dá (mesmas regras do servidor)", () => {
    const list = [ex()];
    expect(joinBlock(list[0]!, { name: "Caio", level: 30 }, list)).toBeNull();
    expect(joinBlock(list[0]!, { name: "Ana", level: 30 }, list)).toBe("Sua excursão");
    expect(joinBlock(list[0]!, { name: "Beto", level: 30 }, list)).toBe("Você já está na lista");
    expect(joinBlock(list[0]!, { name: "Caio", level: 19 }, list)).toBe("Para lv 20–40");
    expect(joinBlock(ex({ slots: 2 }), { name: "Caio", level: 30 }, list)).toBe("Lotada");
    const many = Array.from({ length: EXCURSION_MAX_JOINED }, (_, i) => ex({ id: `y${i}`, leader: P(`L${i}`), members: [P("Caio")] }));
    expect(joinedCount(many, "Caio")).toBe(EXCURSION_MAX_JOINED);
    expect(joinBlock(ex({ id: "z" }), { name: "Caio", level: 30 }, many)).toBe(`Você já está em ${EXCURSION_MAX_JOINED} excursões`);
  });
});

describe("excursões no cliente: horários e destinos", () => {
  const now = new Date(2026, 9, 26, 12, 7).getTime();

  it("situação: em X, saindo, saiu", () => {
    expect(excursionStatus({ at: now + 23 * 60_000, departed: false }, now)).toBe("em 23 min");
    expect(excursionStatus({ at: now - 60_000, departed: false }, now)).toBe("saindo");
    expect(excursionStatus({ at: now + 60_000, departed: true }, now)).toBe("saiu");
    expect(openExcursions([ex(), ex({ departed: true })])).toBe(1);
  });

  it("relógio: hoje só a hora; outro dia com o dia; seletor com 'Agora' e o tempo até lá", () => {
    expect(excursionClock(new Date(2026, 9, 26, 12, 30).getTime(), now)).toBe("12:30");
    expect(excursionClock(new Date(2026, 9, 27, 0, 15).getTime(), now)).toBe("amanhã 00:15");
    expect(timeSlotLabel(0, now)).toBe("Agora");
    expect(timeSlotLabel(new Date(2026, 9, 26, 12, 30).getTime(), now)).toBe("12:30 (em 23 min)");
  });

  it("destinos agrupados na ordem da lista e texto com faixa e covil", () => {
    const dests: ExcursionDest[] = [
      { id: "zona:A", label: "A", kind: "zone", levels: { min: 1, max: 10 } },
      COLISEU_DEST,
      { id: "chefe:goblin_king", label: "Rei Goblin", kind: "boss", levels: { min: 40, max: 40 }, zone: "Ruínas de Kael" },
    ];
    expect(destGroups(dests).map((g) => [g.label, g.items.map((d) => d.id)])).toEqual([
      ["Regiões e cavernas", ["zona:A"]], ["Coliseu", ["coliseu"]], ["Chefes", ["chefe:goblin_king"]],
    ]);
    expect(destGroups([COLISEU_DEST]).map((g) => g.label)).toEqual(["Coliseu"]);
    expect(dests.map(destOptionText)).toEqual(["A (lv 1–10)", "Coliseu", "Rei Goblin (lv 40 · Ruínas de Kael)"]);
  });
});

import { describe, expect, it } from "vitest";
import { BACKPACK_SIZE, S2C, challengeGold, itemDef } from "@lemonquest/shared";
import { LOGIN_REWARDS, continuesStreak, grantLoginBonus, isWeekendDay, nextLoginState, previousDay, rewardForStreak } from "./loginBonus.ts";
import { bountyDay } from "./bounties.ts";
import { makeItem } from "./inventory.ts";
import { invWorld } from "./m4kit.ts";

describe("dias seguidos (puro)", () => {
  it("previousDay atravessa mês e ano", () => {
    expect(previousDay("2026-10-15")).toBe("2026-10-14");
    expect(previousDay("2026-03-01")).toBe("2026-02-28");
    expect(previousDay("2026-01-01")).toBe("2025-12-31");
  });

  it("primeiro login, mesmo dia, dia seguinte e dia perdido", () => {
    expect(nextLoginState(undefined, "2026-10-15")).toEqual({ state: { day: "2026-10-15", streak: 1 }, fresh: true });
    expect(nextLoginState({ day: "2026-10-15", streak: 4 }, "2026-10-15")).toEqual({ state: { day: "2026-10-15", streak: 4 }, fresh: false });
    expect(nextLoginState({ day: "2026-10-14", streak: 4 }, "2026-10-15")).toEqual({ state: { day: "2026-10-15", streak: 5 }, fresh: true });
    expect(nextLoginState({ day: "2026-10-12", streak: 9 }, "2026-10-15")).toEqual({ state: { day: "2026-10-15", streak: 1 }, fresh: true });
  });

  it("o prêmio segue o ciclo de 7 dias e o dia 7 é o maior", () => {
    expect(LOGIN_REWARDS).toHaveLength(7);
    expect(rewardForStreak(1)).toEqual({ gold: 50 });
    expect(rewardForStreak(2)).toEqual({ items: [{ itemId: "health_potion", count: 3 }] });
    expect(rewardForStreak(8)).toEqual(rewardForStreak(1)); // recomeça o ciclo
    expect(rewardForStreak(0)).toEqual(rewardForStreak(1));
    expect(LOGIN_REWARDS[6]!.gold!).toBeGreaterThan(Math.max(...LOGIN_REWARDS.slice(0, 6).map((r) => r.gold ?? 0)));
  });

  it("sábado e domingo não quebram a sequência; faltar um dia útil quebra (ciclo 18)", () => {
    expect(isWeekendDay("2026-10-24")).toBe(true); // sábado
    expect(isWeekendDay("2026-10-25")).toBe(true); // domingo
    expect(isWeekendDay("2026-10-26")).toBe(false); // segunda
    expect(continuesStreak("2026-10-23", "2026-10-26")).toBe(true); // sexta → segunda
    expect(continuesStreak("2026-10-24", "2026-10-26")).toBe(true); // sábado → segunda
    expect(continuesStreak("2026-10-23", "2026-10-25")).toBe(true); // sexta → domingo
    expect(continuesStreak("2026-10-22", "2026-10-26")).toBe(false); // quinta → segunda: faltou a sexta
    expect(continuesStreak("2026-10-21", "2026-10-23")).toBe(false); // quarta → sexta: faltou a quinta
    expect(continuesStreak("2026-10-16", "2026-10-26")).toBe(false); // uma semana inteira
    expect(continuesStreak("2026-10-26", "2026-10-26")).toBe(false);
    expect(continuesStreak("2026-10-27", "2026-10-26")).toBe(false); // relógio voltou
    expect(nextLoginState({ day: "2026-10-23", streak: 5 }, "2026-10-26")).toEqual({ state: { day: "2026-10-26", streak: 6 }, fresh: true });
    expect(nextLoginState({ day: "2026-10-22", streak: 5 }, "2026-10-26").state.streak).toBe(1);
  });

  it("o prêmio escala com o level: ouro +10%/level e a poção na maior faixa que o level bebe", () => {
    expect(rewardForStreak(7, 1)).toEqual({ gold: 500, items: [{ itemId: "health_potion", count: 3 }] });
    expect(rewardForStreak(7, 14).items).toEqual([{ itemId: "health_potion", count: 3 }]); // a média (lv 15) ficava sem uso
    expect(rewardForStreak(7, 15).items).toEqual([{ itemId: "health_potion_medium", count: 3 }]);
    expect(rewardForStreak(7, 50)).toEqual({ gold: challengeGold(500, 50), items: [{ itemId: "health_potion_large", count: 3 }] });
    expect(rewardForStreak(6, 40).items).toEqual([{ itemId: "health_potion_large", count: 5 }, { itemId: "meat", count: 3 }]);
    for (let d = 1; d <= 7; d++) for (const lv of [1, 8, 14, 15, 29, 30, 100]) {
      for (const i of rewardForStreak(d, lv).items ?? []) expect(itemDef(i.itemId)?.level ?? 1, `dia ${d} lv ${lv}`).toBeLessThanOrEqual(lv);
    }
  });
});

describe("grantLoginBonus", () => {
  // 2026-10-15 12:00 em Brasília (UTC-3) = 15:00 UTC.
  const day = (d: number) => Date.UTC(2026, 9, d, 15);
  function setup() {
    const w = invWorld();
    const p = w.mk("p");
    const rec: any = { data: {} };
    const out: { type: string; msg: any }[] = [];
    return { w, p, rec, out, host: (now: number) => ({ send: (_: string, type: string, msg: unknown) => out.push({ type, msg: structuredClone(msg) }), inventory: w.inv, now: () => now }) };
  }

  it("dia 1: ouro e aviso; no mesmo dia não repete; no dia seguinte sobe a sequência e entrega os itens", () => {
    const s = setup();
    expect(grantLoginBonus(s.host(day(15)), s.p, s.rec)).toEqual({ streak: 1, fresh: true });
    expect(s.w.inv.gold("p")).toBe(50);
    expect(s.out.at(-1)!.msg.text).toContain("dia 1 de 7");
    expect(grantLoginBonus(s.host(day(15) + 3_600_000), s.p, s.rec)).toEqual({ streak: 1, fresh: false });
    expect(s.w.inv.gold("p")).toBe(50);
    expect(s.out).toHaveLength(1);
    expect(grantLoginBonus(s.host(day(16)), s.p, s.rec)).toEqual({ streak: 2, fresh: true });
    expect(s.w.inv.countItem("p", "health_potion")).toBe(3);
    expect(s.rec.data.login).toEqual({ day: bountyDay(day(16)), streak: 2 });
  });

  it("o prêmio usa o level do jogador", () => {
    const s = setup();
    s.p.level = 21;
    grantLoginBonus(s.host(day(15)), s.p, s.rec);
    expect(s.w.inv.gold("p")).toBe(challengeGold(50, 21));
    expect(s.out.at(-1)!.msg.text).toContain("fim de semana não quebra");
  });

  it("faltar um dia volta ao dia 1", () => {
    const s = setup();
    grantLoginBonus(s.host(day(10)), s.p, s.rec);
    grantLoginBonus(s.host(day(11)), s.p, s.rec);
    expect(grantLoginBonus(s.host(day(14)), s.p, s.rec).streak).toBe(1);
  });

  it("antes das 6h ainda vale o dia anterior (não conta como dia novo)", () => {
    const s = setup();
    grantLoginBonus(s.host(Date.UTC(2026, 9, 15, 15)), s.p, s.rec); // 12h do dia 15
    const early = Date.UTC(2026, 9, 16, 8); // 05h de Brasília do dia 16: ainda é o dia de jogo 15
    expect(grantLoginBonus(s.host(early), s.p, s.rec).fresh).toBe(false);
    expect(grantLoginBonus(s.host(Date.UTC(2026, 9, 16, 10)), s.p, s.rec).fresh).toBe(true); // 07h: virou
  });

  it("mochila cheia: o ouro entra, o item é pulado e o aviso diz", () => {
    const s = setup();
    grantLoginBonus(s.host(day(15)), s.p, s.rec);
    for (let i = 0; i < BACKPACK_SIZE; i++) s.w.inv.addItem(s.p, makeItem("vest"));
    grantLoginBonus(s.host(day(16)), s.p, s.rec); // dia 2: só itens
    expect(s.w.inv.countItem("p", "health_potion")).toBe(0);
    const last = s.out.at(-1)!;
    expect(last.type).toBe(S2C.Notice);
    expect(last.msg.text).toContain("Faltou espaço");
    expect(last.msg.kind).toBe("warn");
  });
});

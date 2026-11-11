import { describe, expect, it } from "vitest";
import { CHALLENGES, CHALLENGE_BONUS, S2C, challengeTarget, xpForLevel } from "@lemonquest/shared";
import { ChallengeSystem } from "./challenges.ts";
import { makeItem } from "./inventory.ts";
import { invWorld } from "./m4kit.ts";
import { rollWeek } from "./weekly.ts";

const WED = new Date(2026, 9, 14, 12).getTime();

function setup(level = 10) {
  const w = invWorld();
  const p = w.mk("p", { level });
  let t = WED;
  const rec: any = { id: 1, name: "p", xp: xpForLevel(level), data: { ach: { done: {}, stats: {}, killed: [] } } };
  rollWeek(rec, new Date(t)); // linha de base no começo da semana
  const out: { type: string; msg: any }[] = [];
  const saved: string[] = [];
  const xp: number[] = [];
  const sys = new ChallengeSystem({
    getPlayer: () => p, record: () => rec, send: (_to, type, msg) => out.push({ type, msg: structuredClone(msg) }),
    inventory: w.inv, gainXp: (_p, n) => xp.push(n), save: (id) => saved.push(id), now: () => t,
  });
  const last = () => out.filter((o) => o.type === S2C.Challenges).at(-1)!.msg;
  const notices = () => out.filter((o) => o.type === S2C.Notice).map((o) => o.msg.text as string);
  const gain = (key: "kills" | "fish" | "bosses", n: number) => { rec.data.ach.stats[key] = (rec.data.ach.stats[key] ?? 0) + n; };
  return { w, p, rec, sys, out, last, notices, saved, xp, gain, setTime: (ms: number) => { t = ms; } };
}

describe("desafios da semana", () => {
  it("a lista traz as 3 metas com progresso zerado; meta de XP = um level do começo da semana (mín. 300)", () => {
    const s = setup(10);
    s.sys.onMessage(s.p, { action: "list" });
    const v = s.last();
    expect(v.goals.map((g: any) => g.id)).toEqual(CHALLENGES.map((c) => c.id));
    expect(v.goals.every((g: any) => g.progress === 0 && !g.claimed)).toBe(true);
    expect(v.goals.find((g: any) => g.id === "evolucao").target).toBe(xpForLevel(11) - xpForLevel(10));
    expect(challengeTarget(CHALLENGES[2]!, 1)).toBeGreaterThanOrEqual(300);
    expect(v.weekEndsAt).toBe(new Date(2026, 9, 19).getTime());
    expect(v.bonus.claimed).toBe(false);
  });

  it("o progresso é o ganho desde o começo da semana (limitado à meta) e sobe com o jogo", () => {
    const s = setup();
    s.gain("kills", 40);
    s.sys.onMessage(s.p, { action: "list" });
    expect(s.last().goals.find((g: any) => g.id === "cacada").progress).toBe(40);
    s.gain("kills", 500);
    s.sys.onMessage(s.p, { action: "list" });
    expect(s.last().goals.find((g: any) => g.id === "cacada").progress).toBe(150); // teto = meta
  });

  it("resgatar sem cumprir, duas vezes ou com mochila cheia é recusado; cumprido entrega ouro, XP e itens", () => {
    const s = setup();
    s.sys.onMessage(s.p, { action: "claim", id: "cacada" });
    expect(s.notices().at(-1)).toContain("não concluído");
    s.gain("kills", 150);
    s.sys.onMessage(s.p, { action: "claim", id: "cacada" });
    expect(s.w.inv.gold("p")).toBe(400);
    expect(s.w.inv.countItem("p", "health_potion")).toBe(10);
    expect(s.saved).toEqual(["p"]);
    expect(s.last().goals.find((g: any) => g.id === "cacada").claimed).toBe(true);
    s.sys.onMessage(s.p, { action: "claim", id: "cacada" });
    expect(s.notices().at(-1)).toContain("já resgatou");
    expect(s.w.inv.gold("p")).toBe(400);

    const f = setup();
    f.gain("fish", 12);
    for (let i = 0; i < f.w.inv.get("p")!.backpack.length; i++) f.w.inv.addItem(f.p, makeItem("vest"));
    f.sys.onMessage(f.p, { action: "claim", id: "pescaria" });
    expect(f.notices().at(-1)).toContain("mochila está cheia");
    expect(f.w.inv.gold("p")).toBe(0);
    expect(f.rec.data.challenges.claimed).toEqual([]);
  });

  it("a recompensa precisa caber INTEIRA (itens diferentes não dividem o mesmo espaço vazio); o que sobrar vai ao chão", () => {
    const s = setup();
    const bp = s.w.inv.get("p")!.backpack;
    for (let i = 0; i < bp.length - 1; i++) s.w.inv.addItem(s.p, makeItem("vest")); // um espaço livre
    const two = { gold: 0, items: [{ itemId: "health_potion", count: 1 }, { itemId: "mana_potion", count: 1 }] };
    const sys = s.sys as any;
    expect(sys.fits(s.p, { gold: 0, items: [{ itemId: "health_potion", count: 1 }] })).toBe(true);
    expect(sys.fits(s.p, two)).toBe(false);
    expect(s.w.inv.roomFor("p", "health_potion")).toBe(100); // conferir item por item dizia "cabe"
    // A mana passa a ter pilha (empilha sem espaço novo), mas essa pilha ocupou o único espaço vazio: a vida não cabe.
    s.w.inv.addItem(s.p, makeItem("mana_potion", 1));
    expect(sys.fits(s.p, two)).toBe(false);
    s.w.inv.removeItems(s.p, "vest", 1);
    expect(sys.fits(s.p, two)).toBe(true);

    // Se algo sobrar mesmo assim (não deveria), vai ao chão com aviso em vez de sumir.
    const fell: any[] = [];
    const g = new ChallengeSystem({
      getPlayer: () => s.p, record: () => s.rec, send: (_to, type, msg) => s.out.push({ type, msg }),
      inventory: s.w.inv, gainXp: () => {}, save: () => {}, placeLoot: (_p, it) => { fell.push(it); return true; },
    }) as any;
    for (let i = 0; i < bp.length; i++) s.w.inv.addItem(s.p, makeItem("vest"));
    g.give(s.p, { gold: 0, items: [{ itemId: "health_potion", count: 3 }] });
    expect(fell.map((it) => it.count)).toEqual([3]);
    expect(s.notices().at(-1)).toBe("Mochila cheia: 1 item da recompensa caiu no chão.");
  });

  it("o bônus só sai com os três resgatados, uma vez", () => {
    const s = setup();
    s.sys.onMessage(s.p, { action: "claimBonus" });
    expect(s.notices().at(-1)).toContain("três desafios");
    s.gain("kills", 150); s.gain("fish", 12);
    s.rec.xp += challengeTarget(CHALLENGES[2]!, 10);
    for (const c of CHALLENGES) s.sys.onMessage(s.p, { action: "claim", id: c.id });
    const gold0 = s.w.inv.gold("p");
    s.sys.onMessage(s.p, { action: "claimBonus" });
    expect(s.w.inv.gold("p")).toBe(gold0 + CHALLENGE_BONUS.gold!);
    expect(s.xp).toContain(CHALLENGE_BONUS.xp);
    expect(s.w.inv.countItem("p", "health_potion_medium")).toBe(5);
    s.sys.onMessage(s.p, { action: "claimBonus" });
    expect(s.notices().at(-1)).toContain("já resgatou");
    expect(s.w.inv.gold("p")).toBe(gold0 + CHALLENGE_BONUS.gold!);
  });

  it("na semana seguinte tudo zera: sem progresso nem resgates, e a meta de XP usa o level da nova semana", () => {
    const s = setup(10);
    s.gain("fish", 12);
    s.sys.onMessage(s.p, { action: "claim", id: "pescaria" });
    expect(s.rec.data.challenges.claimed).toEqual(["pescaria"]);
    const next = new Date(2026, 9, 21, 12).getTime();
    s.setTime(next);
    s.p.level = 20;
    s.rec.xp = xpForLevel(20); // a sala grava a XP do jogador no registro (save) antes da virada
    rollWeek(s.rec, new Date(next)); // a sala faz isso na virada
    s.sys.onMessage(s.p, { action: "list" });
    const v = s.last();
    expect(v.goals.every((g: any) => g.progress === 0 && !g.claimed)).toBe(true);
    expect(v.goals.find((g: any) => g.id === "evolucao").target).toBe(xpForLevel(21) - xpForLevel(20));
  });

  it("meta de XP usa o level do 1º login da semana, não o de quando a janela abre (14-20)", () => {
    const s = setup(10); // linha de base gravada no login (lv 10)
    // Subiu dois levels antes de abrir a janela pela primeira vez na semana.
    s.p.level = 12;
    s.rec.xp = xpForLevel(12);
    s.sys.onMessage(s.p, { action: "list" });
    const evo = () => s.last().goals.find((g: any) => g.id === "evolucao");
    expect(evo().target).toBe(xpForLevel(11) - xpForLevel(10));
    expect(s.rec.data.challenges.level).toBe(10);
    // O ganho desde o login já conta (os dois levels passam da meta de um level).
    expect(evo().progress).toBe(evo().target);
    s.sys.onMessage(s.p, { action: "claim", id: "evolucao" });
    expect(s.rec.data.challenges.claimed).toEqual(["evolucao"]);
  });

  it("estado criado nesta semana com o level errado (antes do ciclo 14) é corrigido pela linha de base", () => {
    const s = setup(10);
    s.rec.data.challenges = { week: s.rec.data.week.id, level: 14, claimed: [], bonus: false };
    s.sys.onMessage(s.p, { action: "list" });
    expect(s.last().goals.find((g: any) => g.id === "evolucao").target).toBe(xpForLevel(11) - xpForLevel(10));
    expect(s.rec.data.challenges.level).toBe(10);
  });

  it("sem linha de base desta semana (virada da sala ainda não rodou), vale o level atual", () => {
    const s = setup(10);
    const next = new Date(2026, 9, 21, 12).getTime(); // semana seguinte, base ainda da anterior
    s.setTime(next);
    s.p.level = 15;
    s.sys.onMessage(s.p, { action: "list" });
    expect(s.rec.data.challenges.level).toBe(15);
  });

  it("mensagens malformadas e ids desconhecidos são ignorados", () => {
    const s = setup();
    s.sys.onMessage(s.p, null as any);
    s.sys.onMessage(s.p, { action: "claim", id: "nada" });
    s.sys.onMessage(s.p, { action: "explodir" } as any);
    expect(s.out).toEqual([]);
  });
});

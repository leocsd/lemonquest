import { describe, expect, it } from "vitest";
import {
  CHALLENGES, S2C, challengeBonus, challengeGold, challengeReward, challengeTarget, potionForLevel, weekChallenges, weekEndsAt,
  weekId, xpForLevel, type ChallengeDef, type ChallengeKey,
} from "@lemonquest/shared";
import { CHALLENGE_CHECK_MS, ChallengeSystem } from "./challenges.ts";
import { makeItem } from "./inventory.ts";
import { invWorld } from "./m4kit.ts";
import { rollWeek } from "./weekly.ts";

// Quarta-feira da semana 2026-W44 (a primeira do resgate automático); a seguinte e a anterior.
const WED = new Date(2026, 9, 28, 12).getTime();
const NEXT_WED = new Date(2026, 10, 4, 12).getTime();
const PREV_WED = new Date(2026, 9, 21, 12).getTime();
const W = weekId(new Date(WED));

function setup(level = 10, start = WED) {
  const w = invWorld();
  const p = w.mk("p", { level });
  let t = start;
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
  const add = (key: ChallengeKey, n: number) => {
    if (key === "xp") rec.xp += n;
    else rec.data.ach.stats[key] = (rec.data.ach.stats[key] ?? 0) + n;
  };
  const finish = (d: ChallengeDef, lv = level) => add(d.key, challengeTarget(d, lv));
  let clock = 0;
  const tick = () => { clock += CHALLENGE_CHECK_MS; sys.tick(clock, [p]); };
  const drawn = () => weekChallenges(weekId(new Date(t)));
  return { w, p, rec, sys, out, last, notices, saved, xp, add, finish, tick, drawn, setTime: (ms: number) => { t = ms; } };
}

describe("desafios da semana: lista e resgate", () => {
  it("a lista traz os 3 sorteados da semana zerados, com prêmio e bônus pelo level do começo da semana", () => {
    const s = setup(10);
    s.sys.onMessage(s.p, { action: "list" });
    const v = s.last();
    expect(v.goals.map((g: any) => g.id)).toEqual(weekChallenges(W).map((c) => c.id));
    expect(v.goals.every((g: any) => g.progress === 0 && !g.claimed)).toBe(true);
    for (const g of v.goals) expect(g.reward).toEqual(challengeReward(CHALLENGES.find((c) => c.id === g.id)!, 10));
    expect(v.bonus).toEqual({ reward: challengeBonus(10), claimed: false });
    expect(v.weekEndsAt).toBe(weekEndsAt(new Date(WED)));
  });

  it("o progresso é o ganho desde o começo da semana (teto = meta), inclusive nos contadores novos", () => {
    const s = setup();
    for (const d of s.drawn()) s.add(d.key, 1);
    s.sys.onMessage(s.p, { action: "list" });
    expect(s.last().goals.map((g: any) => g.progress)).toEqual([1, 1, 1]);
    for (const d of s.drawn()) s.add(d.key, 1_000_000);
    s.sys.onMessage(s.p, { action: "list" });
    expect(s.last().goals.map((g: any) => g.progress)).toEqual(s.drawn().map((d) => challengeTarget(d, 10)));
  });

  it("linha de base gravada antes do ciclo 18 (sem os extras): o rollWeek completa e o ganho conta dali", () => {
    const s = setup();
    delete s.rec.data.week.extra;
    s.rec.data.ach.stats.party = 500; // antes do deploy
    expect(rollWeek(s.rec, new Date(WED))).toBe(false);
    expect(s.rec.data.week.extra.party).toBe(500);
    s.add("party", 7);
    s.sys.onMessage(s.p, { action: "list" });
    const g = s.last().goals.find((x: any) => CHALLENGES.find((c) => c.id === x.id)!.key === "party");
    if (g) expect(g.progress).toBe(7);
  });

  it("resgatar desafio de outra semana, sem cumprir, duas vezes ou com mochila cheia é recusado; cumprido entrega o prêmio escalado", () => {
    const s = setup(20);
    const [d] = s.drawn();
    const other = CHALLENGES.find((c) => !s.drawn().includes(c))!;
    s.sys.onMessage(s.p, { action: "claim", id: other.id });
    expect(s.notices().at(-1)).toContain("não é desta semana");
    s.sys.onMessage(s.p, { action: "claim", id: d!.id });
    expect(s.notices().at(-1)).toContain("não concluído");
    s.finish(d!, 20);
    s.sys.onMessage(s.p, { action: "claim", id: d!.id });
    const r = challengeReward(d!, 20);
    expect(s.w.inv.gold("p")).toBe(r.gold);
    expect(r.gold).toBe(challengeGold(d!.prize.gold, 20));
    const it0 = r.items![0]!;
    expect(it0.itemId).toBe(potionForLevel(d!.prize.potion!.kind, 20)); // poção média: o lv 20 já bebe
    expect(s.w.inv.countItem("p", it0.itemId)).toBe(it0.count);
    expect(s.saved).toEqual(["p"]);
    expect(s.last().goals[0].claimed).toBe(true);
    s.sys.onMessage(s.p, { action: "claim", id: d!.id });
    expect(s.notices().at(-1)).toContain("já resgatou");
    expect(s.w.inv.gold("p")).toBe(r.gold);

    const f = setup();
    const [fd] = f.drawn();
    f.finish(fd!);
    for (let i = 0; i < f.w.inv.get("p")!.backpack.length; i++) f.w.inv.addItem(f.p, makeItem("vest"));
    f.sys.onMessage(f.p, { action: "claim", id: fd!.id });
    expect(f.notices().at(-1)).toContain("mochila está cheia");
    expect(f.w.inv.gold("p")).toBe(0);
    expect(f.rec.data.challenges.claimed).toEqual([]);
  });

  it("lv 8 nunca recebe a poção média (lv 15): o prêmio fica dentro do level", () => {
    const s = setup(8);
    for (const d of s.drawn()) s.finish(d, 8);
    for (const d of s.drawn()) s.sys.onMessage(s.p, { action: "claim", id: d.id });
    s.sys.onMessage(s.p, { action: "claimBonus" });
    expect(s.w.inv.countItem("p", "health_potion_medium") + s.w.inv.countItem("p", "mana_potion_medium")).toBe(0);
    expect(s.w.inv.countItem("p", "health_potion") + s.w.inv.countItem("p", "mana_potion")).toBeGreaterThan(0);
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
    s.w.inv.addItem(s.p, makeItem("mana_potion", 1));
    expect(sys.fits(s.p, two)).toBe(false);
    s.w.inv.removeItems(s.p, "vest", 1);
    expect(sys.fits(s.p, two)).toBe(true);

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

  it("o bônus só sai com os três resgatados, uma vez, com XP de 20% do level", () => {
    const s = setup();
    s.sys.onMessage(s.p, { action: "claimBonus" });
    expect(s.notices().at(-1)).toContain("três desafios");
    for (const d of s.drawn()) s.finish(d);
    for (const d of s.drawn()) s.sys.onMessage(s.p, { action: "claim", id: d.id });
    const gold0 = s.w.inv.gold("p");
    s.sys.onMessage(s.p, { action: "claimBonus" });
    const b = challengeBonus(10);
    expect(s.w.inv.gold("p")).toBe(gold0 + b.gold!);
    expect(s.xp).toContain(b.xp);
    s.sys.onMessage(s.p, { action: "claimBonus" });
    expect(s.notices().at(-1)).toContain("já resgatou");
    expect(s.w.inv.gold("p")).toBe(gold0 + b.gold!);
  });

  it("level do 1º login da semana, não o de quando a janela abre (14-20); estado com level errado é corrigido", () => {
    const s = setup(10);
    s.p.level = 12;
    s.rec.xp = xpForLevel(12);
    s.sys.onMessage(s.p, { action: "list" });
    expect(s.rec.data.challenges.level).toBe(10);
    expect(s.last().bonus.reward).toEqual(challengeBonus(10));
    const t = setup(10);
    t.rec.data.challenges = { week: W, level: 14, claimed: [], bonus: false };
    t.sys.onMessage(t.p, { action: "list" });
    expect(t.rec.data.challenges.level).toBe(10);
  });

  it("mensagens malformadas e ids desconhecidos são ignorados", () => {
    const s = setup();
    s.sys.onMessage(s.p, null as any);
    s.sys.onMessage(s.p, { action: "claim", id: "nada" });
    s.sys.onMessage(s.p, { action: "explodir" } as any);
    expect(s.out).toEqual([]);
  });
});

describe("desafios da semana: aviso ao cumprir", () => {
  it("a 1ª passada manda o estado; cumprir avisa uma vez (no chat também) e manda o estado de novo", () => {
    const s = setup();
    s.tick();
    expect(s.out.filter((o) => o.type === S2C.Challenges)).toHaveLength(1); // ponto do trilho no login
    s.tick();
    expect(s.out.filter((o) => o.type === S2C.Challenges)).toHaveLength(1);
    const [d] = s.drawn();
    s.finish(d!);
    s.tick();
    const n = s.out.filter((o) => o.type === S2C.Notice);
    expect(n).toHaveLength(1);
    expect(n[0]!.msg).toMatchObject({ kind: "good", log: true });
    expect(n[0]!.msg.text).toContain(`Desafio da semana cumprido: ${d!.name}`);
    expect(s.last().goals[0].progress).toBe(s.last().goals[0].target);
    s.tick();
    expect(s.out.filter((o) => o.type === S2C.Notice)).toHaveLength(1);
    // Sessão nova (reconexão): recebe o estado de novo.
    s.sys.forget("p");
    s.tick();
    expect(s.out.filter((o) => o.type === S2C.Challenges)).toHaveLength(3);
  });
});

describe("desafios da semana: virada", () => {
  it("cumpridos e não resgatados são pagos sozinhos na semana seguinte (com o bônus se fecharam os 3), uma vez só", () => {
    const s = setup(10);
    const drawn = s.drawn();
    for (const d of drawn) s.finish(d);
    s.sys.onMessage(s.p, { action: "claim", id: drawn[0]!.id }); // um resgatado à mão
    const gold0 = s.w.inv.gold("p");
    s.setTime(NEXT_WED);
    rollWeek(s.rec, new Date(NEXT_WED)); // login na semana seguinte (ou virada da sala)
    expect(s.rec.data.challenges.pending).toEqual([{ week: W, level: 10, ids: [drawn[1]!.id, drawn[2]!.id], bonus: true }]);
    s.tick();
    const want = challengeReward(drawn[1]!, 10).gold! + challengeReward(drawn[2]!, 10).gold! + challengeBonus(10).gold!;
    expect(s.w.inv.gold("p")).toBe(gold0 + want);
    expect(s.xp).toContain(challengeBonus(10).xp);
    expect(s.notices().some((t) => t.startsWith("Resgate automático da semana passada"))).toBe(true);
    expect(s.saved.at(-1)).toBe("p");
    // Estado novo: semana nova zerada, nada pendente; repetir a virada não paga de novo.
    expect(s.rec.data.challenges).toMatchObject({ week: weekId(new Date(NEXT_WED)), claimed: [], bonus: false });
    expect(s.rec.data.challenges.pending).toBeUndefined();
    rollWeek(s.rec, new Date(NEXT_WED));
    s.tick();
    expect(s.w.inv.gold("p")).toBe(gold0 + want);
  });

  it("sem abrir a janela na semana, o cumprido também é pago; sem nada cumprido, nada", () => {
    const s = setup(10);
    const [d] = s.drawn();
    s.finish(d!);
    s.setTime(NEXT_WED);
    rollWeek(s.rec, new Date(NEXT_WED));
    s.tick();
    expect(s.w.inv.gold("p")).toBe(challengeReward(d!, 10).gold);
    const z = setup(10);
    z.setTime(NEXT_WED);
    rollWeek(z.rec, new Date(NEXT_WED));
    z.tick();
    expect(z.w.inv.gold("p")).toBe(0);
    expect(z.notices()).toEqual([]);
  });

  it("a passada da semana nova antes da virada da sala fecha a semana velha: o resgatado à mão não é pago de novo", () => {
    const s = setup(10);
    const drawn = s.drawn();
    for (const d of drawn) s.finish(d);
    for (const d of drawn) s.sys.onMessage(s.p, { action: "claim", id: d.id });
    s.sys.onMessage(s.p, { action: "claimBonus" });
    const gold0 = s.w.inv.gold("p");
    s.setTime(NEXT_WED);
    s.tick(); // linha de base ainda é a da semana velha (a sala vira 1×/min)
    expect(s.rec.data.challenges.week).toBe(weekId(new Date(NEXT_WED)));
    rollWeek(s.rec, new Date(NEXT_WED)); // agora a sala vira
    s.tick();
    expect(s.w.inv.gold("p")).toBe(gold0);
  });

  it("semanas antes do sorteio (até 2026-W43) não têm resgate automático", () => {
    const s = setup(10, PREV_WED);
    for (const d of s.drawn()) s.finish(d);
    s.setTime(WED);
    rollWeek(s.rec, new Date(WED));
    s.tick();
    expect(s.w.inv.gold("p")).toBe(0);
  });
});

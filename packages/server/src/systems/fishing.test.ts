import { describe, expect, it } from "vitest";
import { BACKPACK_SIZE, S2C } from "@lemonquest/shared";
import { FISHER_CHEST_EVERY, FISH_CAST_MS, FISH_MAX_CHANCE, FISH_RANGE, FishingSystem, biteChance, rollFish } from "./fishing.ts";
import { makeItem } from "./inventory.ts";
import { invWorld } from "./m4kit.ts";

/** Água à direita de x = 10; o jogador fica em (5,5). `rngs` = sequência dos sorteios (1º = morde?, 2º = qual peixe). */
function setup(rngs: number[] = [0.0, 0.5], o: { rod?: boolean; caught?: number; inArena?: boolean; ground?: boolean } = {}) {
  const w = invWorld();
  const p = w.mk("p");
  p.name = "Pescador";
  if (o.rod !== false) w.inv.addItem(p, makeItem("fishing_rod"));
  let t = 1_000_000;
  const out: { type: string; msg: any }[] = [];
  const caught: string[] = [];
  const ground: any[] = [];
  // Como na sala: o contador de peixes (estatística de conquistas) sobe no onCatch.
  let total = o.caught ?? 0;
  let i = 0;
  const fishing = new FishingSystem({
    getPlayer: (id) => (id === "p" ? p : undefined), send: (_to, type, msg) => out.push({ type, msg: structuredClone(msg) }),
    broadcast: (type, msg) => out.push({ type, msg: structuredClone(msg) }), isWater: (x, y) => x >= 10 && y >= 0 && y < 20,
    inventory: w.inv, caught: () => total, onCatch: (_p, id) => { total++; caught.push(id); }, inArena: () => !!o.inArena,
    rng: () => rngs[i++ % rngs.length]!, now: () => t,
    ...(o.ground ? { placeLoot: (_p: unknown, it: unknown) => { ground.push(it); return true; } } : {}),
  });
  const notices = () => out.filter((x) => x.type === S2C.Notice).map((x) => x.msg.text as string);
  return { w, p, fishing, out, caught, ground, notices, advance: (ms: number) => { t += ms; fishing.tick(); }, fish: (x = 10, y = 5) => fishing.onMessage(p, { x, y }) };
}

describe("pesca: regras", () => {
  it("a chance de morder cresce com os peixes pescados e tem teto", () => {
    expect(biteChance(0)).toBeCloseTo(0.55);
    expect(biteChance(100)).toBeCloseTo(0.75);
    expect(biteChance(10_000)).toBe(FISH_MAX_CHANCE);
    expect(rollFish(0)).toBe("golden_fish");
    expect(rollFish(0.1)).toBe("salmon");
    expect(rollFish(0.9)).toBe("trout");
  });
});

describe("pesca: lançar", () => {
  it("recusa sem vara, em terra, longe demais, sem espaço, em partida do Coliseu, e valores inválidos", () => {
    const s = setup([0, 0.5], { rod: false });
    s.fish();
    expect(s.notices().at(-1)).toContain("Vara de Pesca");
    const t = setup();
    t.fish(9, 5);
    expect(t.notices().at(-1)).toContain("não tem água");
    t.p.x = 10 - FISH_RANGE - 1;
    t.fish(10, 5);
    expect(t.notices().at(-1)).toContain("mais perto");
    t.fishing.onMessage(t.p, { x: 1.5, y: "a" } as any);
    t.fishing.onMessage(t.p, null as any);
    expect(t.fishing.casting("p")).toBe(false);
    const f = setup();
    for (let i = 0; i < BACKPACK_SIZE; i++) f.w.inv.addItem(f.p, makeItem("vest"));
    f.fish();
    expect(f.notices().at(-1)).toContain("cheia");
    const a = setup([0, 0.5], { inArena: true });
    a.fish();
    expect(a.fishing.casting("p")).toBe(false);
  });

  it("lança a linha: boia para todos e um aviso; segunda tentativa avisa que já está pescando", () => {
    const s = setup();
    s.fish();
    expect(s.fishing.casting("p")).toBe(true);
    expect(s.out.find((x) => x.type === S2C.FishCast)!.msg).toEqual({ id: "p", x: 10, y: 5, ms: FISH_CAST_MS });
    s.fish();
    expect(s.notices().at(-1)).toContain("já está pescando");
  });
});

describe("pesca: resultado", () => {
  it("passado o tempo parado, o peixe morde: entra na mochila, conta para conquistas e a boia some", () => {
    const s = setup([0.0, 0.5]); // morde; r=0,5 → truta
    s.fish();
    s.advance(FISH_CAST_MS - 100);
    expect(s.fishing.casting("p")).toBe(true);
    s.advance(100);
    expect(s.fishing.casting("p")).toBe(false);
    expect(s.w.inv.countItem("p", "trout")).toBe(1);
    expect(s.caught).toEqual(["trout"]);
    expect(s.notices().at(-1)).toContain("Você pescou: Truta");
    expect(s.out.filter((x) => x.type === S2C.FishCast).at(-1)!.msg.ms).toBe(0);
  });

  it("raridades: peixe dourado e salmão", () => {
    const g = setup([0.0, 0.01]);
    g.fish(); g.advance(FISH_CAST_MS);
    expect(g.w.inv.countItem("p", "golden_fish")).toBe(1);
    const sm = setup([0.0, 0.1]);
    sm.fish(); sm.advance(FISH_CAST_MS);
    expect(sm.w.inv.countItem("p", "salmon")).toBe(1);
  });

  it("às vezes o peixe escapa (sorteio acima da chance) e nada entra na mochila", () => {
    const s = setup([0.99, 0.5]);
    s.fish(); s.advance(FISH_CAST_MS);
    expect(s.notices().at(-1)).toContain("escapou");
    expect(s.w.inv.countItem("p", "trout")).toBe(0);
    expect(s.caught).toEqual([]);
  });

  it("quem já pescou muito morde mais: um sorteio 0,7 escapa para novato e morde para veterano", () => {
    const novice = setup([0.7, 0.5], { caught: 0 });
    novice.fish(); novice.advance(FISH_CAST_MS);
    expect(novice.caught).toEqual([]);
    const vet = setup([0.7, 0.5], { caught: 200 });
    vet.fish(); vet.advance(FISH_CAST_MS);
    expect(vet.caught).toEqual(["trout"]);
  });
});

describe("pesca: cancelamento", () => {
  it("andar, apanhar, morrer ou sair do jogo solta a linha (sem peixe)", () => {
    const run = (act: (s: ReturnType<typeof setup>) => void) => {
      const s = setup();
      s.fish();
      act(s);
      s.advance(10);
      expect(s.fishing.casting("p")).toBe(false);
      expect(s.out.filter((x) => x.type === S2C.FishCast).at(-1)!.msg.ms).toBe(0);
      s.advance(FISH_CAST_MS);
      expect(s.caught).toEqual([]);
      return s;
    };
    expect(run((s) => { s.p.x += 1; }).notices().at(-1)).toContain("se mexeu");
    expect(run((s) => { s.p.hp -= 5; }).notices().at(-1)).toContain("atingido");
    run((s) => { s.p.hp = 0; });
    run((s) => s.fishing.removePlayer("p"));
  });

  it("recuperar vida (regeneração) não cancela", () => {
    const s = setup();
    s.p.hp = 100;
    s.fish();
    s.p.hp = 120;
    s.advance(100);
    expect(s.fishing.casting("p")).toBe(true);
  });
});

describe("pesca: Baú do Pescador (ciclo 18)", () => {
  it("a cada 25 peixes um Baú de Recompensa na mochila, com aviso; fora do marco, nada", () => {
    const s = setup([0.0, 0.5], { caught: FISHER_CHEST_EVERY - 2 });
    s.fish(); s.advance(FISH_CAST_MS); // 24º
    expect(s.w.inv.countItem("p", "bounty_chest")).toBe(0);
    s.fish(); s.advance(FISH_CAST_MS); // 25º
    expect(s.w.inv.countItem("p", "bounty_chest")).toBe(1);
    const n = s.out.filter((x) => x.type === S2C.Notice).at(-1)!.msg;
    expect(n).toMatchObject({ kind: "good", log: true });
    expect(n.text).toContain(`Baú do Pescador: ${FISHER_CHEST_EVERY} peixes`);
    s.fish(); s.advance(FISH_CAST_MS); // 26º
    expect(s.w.inv.countItem("p", "bounty_chest")).toBe(1);
  });

  it("mochila cheia: o baú vai ao chão (ou se perde sem chão) e o aviso diz", () => {
    const fill = (s: ReturnType<typeof setup>) => {
      for (let k = 0; k < BACKPACK_SIZE - 2; k++) s.w.inv.addItem(s.p, makeItem("vest")); // vara + 1 espaço para o peixe
    };
    const g = setup([0.0, 0.5], { caught: FISHER_CHEST_EVERY - 1, ground: true });
    fill(g);
    g.fish(); g.advance(FISH_CAST_MS);
    expect(g.w.inv.countItem("p", "trout")).toBe(1);
    expect(g.ground.map((it) => it.defId)).toEqual(["bounty_chest"]);
    expect(g.notices().at(-1)).toContain("caiu no chão");
    const l = setup([0.0, 0.5], { caught: FISHER_CHEST_EVERY * 2 - 1 });
    fill(l);
    l.fish(); l.advance(FISH_CAST_MS);
    expect(l.notices().at(-1)).toContain("se perdeu");
  });
});

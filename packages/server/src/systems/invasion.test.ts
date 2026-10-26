import { describe, expect, it } from "vitest";
import {
  BOUNTY_CHEST_ID, INVASION_BASE, INVASION_MAX_ALIVE, INVASION_PER_PLAYER, INVASION_WAVES, S2C, eventDef, toActive,
  type InvasionMsg, type ItemInstance, type TiledMap,
} from "@lemonquest/shared";
import type { PlayerState } from "../state.ts";
import { INVASION_LEVER, InvasionSystem, parseInvasion, type InvasionLayout } from "./invasion.ts";
import { openGrid, player, world } from "./testkit.ts";

const MIN = 60_000;
const VILA = { x0: 30, y0: 20, x1: 49, y1: 39 };
const LAYOUT: InvasionLayout = {
  vila: VILA,
  points: [
    { name: "invasion_n", x: 40, y: 12, goal: { x: 40, y: 19 } },
    { name: "invasion_e", x: 58, y: 30, goal: { x: 50, y: 30 } },
  ],
};
const EV = eventDef("invasao_da_vila")!;

function setup(o: { store?: { v?: string }; clock?: number } = {}) {
  const w = world({ grid: openGrid(90, 70), spawns: [], safeZones: [VILA], eliteChance: 0 });
  if (o.clock !== undefined) w.setClock(o.clock);
  const got: { name: string; defId: string; count: number }[] = [];
  const defended: string[] = [];
  const kv = o.store ?? {};
  const away = new Set<string>();
  const inv = new InvasionSystem({
    layout: LAYOUT, monsters: w.mm,
    players: () => w.players.values(), getPlayer: (id) => w.players.get(id),
    send: (to, type, msg) => w.sent.push({ to, type, msg }),
    broadcast: (type, msg) => w.sent.push({ to: "*", type, msg }),
    inventory: { addItem: (p: PlayerState, it: ItemInstance) => { got.push({ name: p.name, defId: it.defId, count: it.count }); return 0; } },
    onDefended: (p) => defended.push(p.name),
    store: { get: () => kv.v, set: (v) => { kv.v = v; } },
    now: w.now, rng: () => 0.5, away: (id) => away.has(id),
  });
  w.combat.hooks = {
    onDealt: (pid, dealt, _r, m) => inv.onDamage(pid, m, dealt),
    onHealOther: (h, t, n) => inv.onHealOther(h, t, n),
    onPlayerDamaged: (p, src, n) => inv.onPlayerDamaged(p, src, n),
  };
  const ev = (minutes = 40, from = w.now()) => toActive(EV, from + minutes * MIN);
  const invaders = () => [...w.mm.all()].filter((m) => m.questLever === INVASION_LEVER);
  const step = (ms: number) => w.run(ms, () => inv.tick(w.now()));
  /** Pula o relógio (sem simular a IA no meio) e roda um tique. */
  const jump = (ms: number) => { w.setClock(w.now() + ms - 50); step(50); };
  const last = (to: string) => w.sent.filter((s) => s.to === to && s.type === S2C.Invasion).at(-1)?.msg as InvasionMsg | undefined;
  const feeds = () => w.sent.filter((s) => s.type === S2C.Feed).map((s) => s.msg.text as string);
  return { w, inv, got, defended, kv, away, ev, invaders, step, jump, last, feeds };
}

describe("InvasionSystem", () => {
  it("lê a Vila e os pontos do mapa de verdade (4 pontos fora da PZ, destino na borda)", async () => {
    const { readFileSync } = await import("node:fs");
    const map = JSON.parse(readFileSync(new URL("../../../../assets/maps/world.json", import.meta.url), "utf8")) as TiledMap;
    const l = parseInvasion(map)!;
    expect(l.vila).toEqual({ x0: 58, y0: 76, x1: 103, y1: 115 });
    expect(l.points.map((p) => p.name).sort()).toEqual(["invasion_e", "invasion_n", "invasion_ne", "invasion_w"]);
    const inV = (x: number, y: number) => x >= l.vila.x0 && x <= l.vila.x1 && y >= l.vila.y0 && y <= l.vila.y1;
    for (const p of l.points) {
      expect(inV(p.x, p.y), p.name).toBe(false);
      expect(inV(p.goal.x, p.goal.y), p.name).toBe(false);
      // Destino colado na Vila (vizinho de um tile dela) e o ponto num anel de ~8 tiles.
      expect([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => inV(p.goal.x + a!, p.goal.y + b!)), p.name).toBe(true);
      const ring = Math.max(l.vila.x0 - p.x, p.x - l.vila.x1, l.vila.y0 - p.y, p.y - l.vila.y1);
      expect(ring, p.name).toBeGreaterThanOrEqual(6);
      expect(ring, p.name).toBeLessThanOrEqual(12);
    }
    // Mesmo bloco do gerador (lateObjects18): o Mural de Excursões na praça, ao lado do Quadro de Recompensas.
    const npc = (id: string) => map.layers.find((x) => x.type === "objectgroup" && x.name === "objects")!.objects!
      .find((o) => o.type === "npc" && o.properties?.some((q) => q.name === "npcId" && q.value === id))!;
    const mural = npc("excursion_board"), quadro = npc("bounty_board");
    expect([mural.x / 16, mural.y / 16]).toEqual([73, 92]);
    expect(inV(mural.x / 16, mural.y / 16)).toBe(true);
    expect(Math.max(Math.abs(mural.x - quadro.x), Math.abs(mural.y - quadro.y)) / 16).toBe(2);
  });

  it("só começa com evento de invasão; a 1ª onda nasce no começo, fora da PZ e sem respawn", () => {
    const { w, inv, ev, invaders, step } = setup();
    expect(inv.start(toActive(eventDef("noite_de_cacada")!, w.now() + 60 * MIN))).toBe(false);
    expect(inv.active).toBe(false);
    expect(inv.start(ev())).toBe(true);
    step(50);
    expect(invaders()).toHaveLength(INVASION_BASE); // ninguém presente: só a base
    for (const m of invaders()) {
      expect(w.mm.inPz(m.s.x, m.s.y)).toBe(false);
      expect(m.bounds).toBeDefined();
    }
    const m = invaders()[0]!;
    w.mm.kill(m, w.now());
    expect(w.mm.pendingRespawns).toBe(0);
    expect(w.sent.some((s) => s.type === S2C.Feed && /onda 1\/5/.test(s.msg.text))).toBe(true);
  });

  it("ondas por fração da duração: a 2ª nasce aos 20% e escala com quem está na área", () => {
    const { w, inv, ev, invaders, step, jump } = setup();
    w.add(player("Ana", 40, 41, { level: 8 })); // fora da PZ, colada na Vila
    w.add(player("Bia", 60, 45, { level: 16 })); // fora, perto
    w.add(player("Caio", 10, 65, { level: 30 })); // longe demais: não conta
    inv.start(ev(40));
    step(50);
    expect(invaders()).toHaveLength(INVASION_BASE + INVASION_PER_PLAYER * 2);
    expect(invaders().filter((m) => ["mine_larva", "spider", "bat", "slag_slime"].includes(m.def.id))).toHaveLength(INVASION_PER_PLAYER);
    expect(invaders().some((m) => ["goblin", "kongra", "pirate_marauder"].includes(m.def.id))).toBe(false); // alto ausente
    const before = invaders().length;
    jump(8 * MIN - 100);
    expect(invaders().length).toBe(before); // ainda a 1ª
    step(100);
    expect(inv.score!.wave).toBe(1);
    expect(invaders().length).toBeGreaterThan(before);
  });

  it("teto de 40 vivos: a onda que não cabe não anuncia '0 invasores' e o líder nasce acima do teto", () => {
    const { w, inv, ev, invaders, step, jump, feeds } = setup();
    for (let i = 0; i < 30; i++) w.add(player(`p${i}`, 31 + (i % 18), 41 + Math.floor(i / 18), { level: i < 10 ? 5 : i < 20 ? 15 : 40, hp: 99_999, maxHp: 99_999 }));
    inv.start(ev(40));
    step(50);
    expect(invaders().length).toBe(INVASION_MAX_ALIVE);
    jump(8 * MIN);
    expect(invaders().length).toBe(INVASION_MAX_ALIVE); // a 2ª onda não passa do teto
    expect(feeds().at(-1)).toMatch(/onda 2\/5: reforços aguardam/);
    expect(feeds().some((t) => /0 invasores/.test(t))).toBe(false);
    jump(24 * MIN); // onda do líder (80%), com o teto ainda cheio
    expect(invaders().length).toBe(INVASION_MAX_ALIVE + 1);
    expect(invaders().filter((m) => m.elite)).toHaveLength(1);
    expect(inv.score).toMatchObject({ leaderSpawned: true });
  });

  it("presentes: só quem está fora da PZ, perto da Vila, vivo e no controle", () => {
    const { w, inv, away } = setup();
    w.add(player("Praça", 40, 30, { level: 8 })); // na PZ: não luta
    w.add(player("Borda", 40, 41, { level: 9 })); // fora da PZ, colada na Vila
    const caiu = w.add(player("Caiu", 41, 41, { level: 10 })); // fora, mas sem ninguém no controle
    w.add(player("Morto", 42, 41, { level: 11, hp: 0 }));
    w.add(player("Longe", 85, 65, { level: 12 })); // além da área
    away.add(caiu.id);
    expect(inv.presentLevels()).toEqual([9]);
    away.delete(caiu.id);
    expect(inv.presentLevels().sort((a, b) => a - b)).toEqual([9, 10]);
  });

  it("reinício: volta na onda do relógio (sem as anteriores) com pontos e placar gravados", () => {
    const store: { v?: string } = {};
    const a = setup({ store });
    a.w.add(player("Ana", 45, 42, { level: 8 }));
    const e = a.ev(40);
    a.inv.start(e);
    a.step(50);
    const m = a.invaders()[0]!;
    a.w.combat.damageMonster(m, "Ana", 9999, "physical", a.w.now()); // abate: 5 pontos (vida-base inteira)
    a.step(5100); // grava (a cada 5 s)
    expect(a.inv.pointsOf("Ana")).toBe(5);
    const saved = JSON.parse(store.v!);
    expect(saved.run.killed).toBe(1);
    // "Reinício" aos 17 min (onda 3 de 5): outro sistema, mesmo kv, mesmo evento.
    const b = setup({ store, clock: e.until - 40 * MIN + 17 * MIN });
    b.w.add(player("Ana", 45, 42, { level: 8 }));
    expect(b.inv.start(e)).toBe(true);
    b.step(50);
    expect(b.inv.score).toMatchObject({ wave: 2, killed: 1, spawned: 1 + b.invaders().length });
    expect(b.inv.pointsOf("Ana")).toBe(5);
    // Só a onda atual nasceu: o tamanho de uma onda (×1,25), não a soma das três.
    expect(b.invaders()).toHaveLength(Math.round((INVASION_BASE + INVASION_PER_PLAYER) * INVASION_WAVES[2]!.mult));
  });

  it("marcham até a borda da Vila e nunca entram na PZ", () => {
    const { w, inv, ev, invaders, step } = setup();
    inv.start(ev(40));
    step(30_000);
    expect(invaders().length).toBeGreaterThan(0);
    for (const m of invaders()) {
      expect(w.mm.inPz(m.s.x, m.s.y)).toBe(false);
      expect(Math.max(Math.abs(m.s.x - m.spawn.x), Math.abs(m.s.y - m.spawn.y))).toBeLessThanOrEqual(m.spawn.radius + 3);
    }
  });

  it("atacam quem está perto, não quem está longe", () => {
    const { w, inv, ev, invaders, step } = setup();
    const far = w.add(player("Longe", 85, 65, { level: 8, hp: 9999, maxHp: 9999 }));
    inv.start(ev(40));
    step(50);
    const m = invaders()[0]!;
    expect(m.allow!(far)).toBe(false);
    const near = w.add(player("Perto", m.s.x + 2, m.s.y, { level: 8, hp: 9999, maxHp: 9999 }));
    step(2000);
    expect(invaders().some((x) => x.s.targetId === near.id)).toBe(true);
    expect(invaders().some((x) => x.s.targetId === far.id)).toBe(false);
  });

  it("contribuição: dano em invasor e cura em outro na área; dano em monstro comum não conta", () => {
    const { w, inv, ev, invaders, step } = setup();
    const ana = w.add(player("Ana", 45, 42, { level: 8 }));
    const bia = w.add(player("Bia", 46, 42, { level: 8, hp: 200, maxHp: 200 }));
    const fora = w.add(player("Fora", 5, 65, { level: 8, hp: 200, maxHp: 200 }));
    inv.start(ev(40));
    step(50);
    const m = invaders()[0]!;
    const dealt = w.combat.damageMonster(m, ana.id, Math.floor(m.def.hp / 2), "physical", w.now());
    const dmgPts = (dealt / m.def.hp) * 5;
    expect(dealt).toBeGreaterThan(0);
    expect(inv.pointsOf("Ana")).toBeCloseTo(dmgPts, 5);
    const wild = w.mm.spawnSummon(m.def, 70, 60, ""); // monstro sem marca de invasão
    wild.s.ownerId = "";
    w.combat.damageMonster(wild, ana.id, 10, "physical", w.now());
    expect(inv.pointsOf("Ana")).toBeCloseTo(dmgPts, 5);
    w.combat.damagePlayer(bia, m.s.id, 100, "physical", w.now()); // o invasor tira metade da vida de Bia
    w.combat.damagePlayer(fora, m.s.id, 100, "physical", w.now());
    w.combat.healPlayer(bia, ana.id, 100); // metade da vida de Bia: 2,5 pontos
    expect(inv.pointsOf("Ana")).toBeCloseTo(dmgPts + 2.5, 5);
    w.combat.healPlayer(fora, ana.id, 100); // curado fora da área: não conta
    w.combat.healPlayer(ana, ana.id, 100); // em si mesmo: não conta
    expect(inv.pointsOf("Ana")).toBeCloseTo(dmgPts + 2.5, 5);
  });

  it("cura só pontua o dano que invasores tiraram, até esse saldo (e o saldo se consome)", () => {
    const { w, inv, ev, invaders, step } = setup();
    const ana = w.add(player("Ana", 45, 42, { level: 8 }));
    // Bia tirou um item de +vida: buraco de 50 sem invasor nenhum. Curar isso não é defender a Vila.
    const bia = w.add(player("Bia", 46, 42, { level: 8, hp: 150, maxHp: 200 }));
    inv.start(ev(40));
    step(50);
    expect(w.combat.healPlayer(bia, ana.id, 50)).toBe(50);
    expect(inv.pointsOf("Ana")).toBe(0);
    // Dano de monstro que não é invasor também não abre saldo.
    const m = invaders()[0]!;
    const wild = w.mm.spawnSummon(m.def, 70, 60, "");
    wild.s.ownerId = "";
    w.combat.damagePlayer(bia, wild.s.id, 40, "physical", w.now());
    w.combat.healPlayer(bia, ana.id, 40);
    expect(inv.pointsOf("Ana")).toBe(0);
    // O invasor tira 80: a cura de 200 cura 80 e pontua 80 (2 pontos); o saldo acaba.
    w.combat.damagePlayer(bia, m.s.id, 80, "physical", w.now());
    expect(w.combat.healPlayer(bia, ana.id, 200)).toBe(80);
    expect(inv.pointsOf("Ana")).toBeCloseTo(2, 5);
    bia.hp = 100; // novo buraco sem invasor (troca de equipamento)
    w.combat.healPlayer(bia, ana.id, 100);
    expect(inv.pointsOf("Ana")).toBeCloseTo(2, 5);
    // Saldo parcial: 60 de invasor, cura de 20 pontua 20 e deixa 40.
    w.combat.damagePlayer(bia, m.s.id, 60, "physical", w.now());
    w.combat.healPlayer(bia, ana.id, 20);
    expect(inv.pointsOf("Ana")).toBeCloseTo(2.5, 5);
    // Bia se cura sozinha até o cheio (poção): o saldo fecha na conferência seguinte.
    w.combat.healPlayer(bia, bia.id, 999);
    step(1100);
    bia.hp = 160;
    w.combat.healPlayer(bia, ana.id, 40);
    expect(inv.pointsOf("Ana")).toBeCloseTo(2.5, 5);
  });

  it("a mesma ocorrência não roda nem premia duas vezes (evento no meio, /evento parar + reinício)", () => {
    const store: { v?: string } = {};
    const a = setup({ store });
    const ana = a.w.add(player("Ana", 45, 42, { level: 8 }));
    const e = a.ev(40);
    expect(a.inv.start(e)).toBe(true);
    a.step(50);
    for (const m of a.invaders()) a.w.combat.damageMonster(m, ana.id, 9999, "physical", a.w.now());
    a.inv.end(e); // um evento manual (ou /evento parar) encerra a invasão: prêmio entregue
    expect(a.got).toHaveLength(1);
    // O evento manual acaba antes da janela agendada: o EventSystem anuncia a invasão de novo.
    a.step(1000);
    expect(a.inv.start(e)).toBe(false);
    a.step(50);
    expect(a.inv.active).toBe(false);
    expect(a.invaders()).toHaveLength(0);
    expect(a.feeds().at(-1)).toContain("a invasão desta janela já terminou");
    a.inv.end(e);
    expect(a.got).toHaveLength(1);
    // Reinício dentro da janela (a supressão do /evento parar é só memória): o kv lembra.
    const b = setup({ store, clock: a.w.now() + MIN });
    b.w.add(player("Ana", 45, 42, { level: 8 }));
    expect(b.inv.start(e)).toBe(false);
    b.step(50);
    expect(b.invaders()).toHaveLength(0);
    expect(b.got).toHaveLength(0);
    // Outra janela roda normalmente; a chave vencida sai do kv.
    expect(b.inv.start(b.ev(40))).toBe(true);
    b.jump(41 * MIN);
    expect(JSON.parse(store.v!).done).not.toContain(e.until);
  });

  it("fim: prêmio para quem fez 10+ pontos (+1 com a Vila defendida), pendente para quem saiu, conquista", () => {
    const { w, inv, ev, invaders, step, jump, got, defended, last } = setup();
    const ana = w.add(player("Ana", 45, 42, { level: 8 }));
    w.add(player("Bia", 46, 42, { level: 8 }));
    const caio = w.add(player("Caio", 44, 42, { level: 8 }));
    const e = ev(10);
    inv.start(e);
    step(50);
    // Ana derrota a 1ª onda inteira; Caio dá 10 pontos e sai; Bia não faz nada.
    for (const m of invaders()) w.combat.damageMonster(m, ana.id, 9999, "physical", w.now());
    jump(8 * MIN); // onda do líder (80% de 10 min)
    const leader = invaders().find((m) => m.elite)!;
    expect(leader).toBeDefined();
    expect(leader.s.maxHp).toBeGreaterThan(leader.def.hp * 2);
    w.combat.damageMonster(leader, caio.id, leader.def.hp * 2, "physical", w.now());
    expect(inv.pointsOf("Caio")).toBeCloseTo(10, 5);
    for (const m of invaders()) w.combat.damageMonster(m, ana.id, 99_999, "physical", w.now());
    w.players.delete(caio.id);
    jump(2 * MIN + 100); // fim do evento
    expect(inv.active).toBe(false);
    expect(invaders()).toHaveLength(0);
    expect(got).toEqual([{ name: "Ana", defId: BOUNTY_CHEST_ID, count: 2 }]);
    expect(defended).toEqual(["Ana"]);
    expect(last(ana.id)!.result).toMatchObject({ defended: true, chests: 2 });
    expect(last("Bia")!.result).toMatchObject({ chests: 0, points: 0 });
    expect(inv.pendingFor("Caio")).toMatchObject({ chests: 2, defended: true });
    // Caio volta (outra sessão): recebe na entrada.
    const caio2 = w.add(player("caio-2", 40, 30, { name: "Caio" } as Partial<PlayerState>));
    inv.onJoin(caio2);
    expect(got.at(-1)).toEqual({ name: "Caio", defId: BOUNTY_CHEST_ID, count: 2 });
    expect(inv.pendingFor("Caio")).toBeUndefined();
    expect(defended).toEqual(["Ana", "Caio"]);
  });

  it("Vila não defendida: líder vivo no fim → 1 baú para quem ajudou e nenhuma conquista", () => {
    const { w, inv, ev, invaders, step, jump, got, defended } = setup();
    const ana = w.add(player("Ana", 45, 42, { level: 8 }));
    inv.start(ev(10));
    step(50);
    for (const m of invaders()) w.combat.damageMonster(m, ana.id, 9999, "physical", w.now());
    jump(8 * MIN); // o líder nasce e fica vivo
    jump(2 * MIN + 100);
    expect(got).toEqual([{ name: "Ana", defId: BOUNTY_CHEST_ID, count: 1 }]);
    expect(defended).toEqual([]);
    expect(w.sent.some((s) => s.type === S2C.Feed && /não resistiu/.test(s.msg.text))).toBe(true);
  });

  it("servidor fora no fim do evento: a conta fecha no boot com o placar gravado", () => {
    const store: { v?: string } = {};
    const a = setup({ store });
    a.w.add(player("Ana", 45, 42, { level: 8 }));
    const e = a.ev(40);
    a.inv.start(e);
    a.step(50);
    for (const m of a.invaders()) a.w.combat.damageMonster(m, "Ana", 9999, "physical", a.w.now());
    a.step(5100);
    const b = setup({ store, clock: e.until + 5 * MIN });
    b.step(50);
    // Todos os nascidos caíram e não houve líder: defendida; Ana estava offline, fica pendente.
    expect(b.inv.pendingFor("Ana")).toMatchObject({ defended: true, chests: 2 });
    expect(JSON.parse(store.v!).run).toBeNull();
  });

  it("estado do HUD por jogador: onda, vivos, a própria contribuição e os pontos do mapa", () => {
    const { w, inv, ev, step, last } = setup();
    const ana = w.add(player("Ana", 45, 42, { level: 8 }));
    inv.start(ev(40));
    step(1100);
    const st = last(ana.id)!.active!;
    expect(st).toMatchObject({ name: "Invasão da Vila", wave: 1, waves: 5, alive: INVASION_BASE + INVASION_PER_PLAYER, mine: 0, goal: 10, leader: null });
    expect(st.points).toEqual([{ x: 40, y: 12 }, { x: 58, y: 30 }]);
    inv.end(toActive(EV, w.now()));
    expect(last(ana.id)!.active).toBeNull();
  });
});

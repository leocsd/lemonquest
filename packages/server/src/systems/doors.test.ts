import { describe, expect, it } from "vitest";
import { S2C, TICK_MS, doorBlockReason, type DoorSpot, type DoorsMsg } from "@lemonquest/shared";
import { DoorSystem } from "./doors.ts";
import { MovementSystem } from "./movement.ts";
import { grid, player } from "./testkit.ts";

// Sala 7×5 com parede em x = 5 e duas portas nela: (5,1) comum, (5,3) lv 20.
//   x: 0123456
const ROWS = [
  ".....#.",
  ".....#.",
  ".....#.",
  ".....#.",
  ".....#.",
];
const COMUM: DoorSpot = { id: "comum", x: 5, y: 1, style: "arco" };
const LV20: DoorSpot = { id: "lv20", x: 5, y: 3, style: "arco", req: { minLevel: 20 } };

function setup() {
  const g = grid(ROWS);
  let clock = 10_000;
  const mv = new MovementSystem(g, { now: () => clock });
  const players: ReturnType<typeof player>[] = [];
  const monsters = new Set<string>();
  const sent: { to: string; type: string; msg: any }[] = [];
  const broadcasts: DoorsMsg[] = [];
  const doors = new DoorSystem({
    doors: [COMUM, LV20], grid: g, movement: mv,
    occupied: (x, y, self) => monsters.has(`${x},${y}`) || players.some((o) => o.id !== self && o.hp > 0 && o.x === x && o.y === y),
    canPass: (p, req) => doorBlockReason(req, p.level, () => false, () => false),
    send: (to, type, msg) => sent.push({ to, type, msg }),
    broadcast: (type, msg) => { if (type === S2C.Doors) broadcasts.push(msg as DoorsMsg); },
    now: () => clock,
  });
  const add = (id: string, x: number, y: number, level = 10) => {
    const p = player(id, x, y, { level });
    players.push(p);
    mv.addPlayer(p);
    return p;
  };
  const tick = (ms = TICK_MS) => { const end = clock + ms; while (clock < end) { clock += TICK_MS; mv.tick(clock, players); } };
  const notices = (id: string) => sent.filter((s) => s.to === id && s.type === S2C.Notice).map((s) => s.msg.text as string);
  return { g, mv, doors, add, tick, notices, broadcasts, monsters };
}

describe("porta comum (abre e fecha para todos)", () => {
  it("fechada é parede; usar ao lado abre (avisa todos e libera a colisão), usar de novo fecha", () => {
    const w = setup();
    const p = w.add("p", 4, 1);
    expect(w.g.isWalkable(5, 1)).toBe(false); // a porta fica na parede (no jogo a CollisionGrid bloqueia pelo objeto)
    expect(w.doors.use(p, "comum")).toBe(true);
    expect(w.doors.isOpen("comum")).toBe(true);
    expect(w.g.isWalkable(5, 1)).toBe(true);
    expect(w.broadcasts.at(-1)).toEqual({ open: ["comum"] });
    expect(w.doors.use(p, "comum")).toBe(true);
    expect(w.g.isWalkable(5, 1)).toBe(false);
    expect(w.broadcasts.at(-1)).toEqual({ open: [] });
  });

  it("aberta, anda-se por ela; com alguém em cima não fecha", () => {
    const w = setup();
    const p = w.add("p", 4, 1), q = w.add("q", 3, 1);
    w.doors.use(p, "comum");
    w.mv.onWalkTo(p, { x: 6, y: 1 });
    w.tick(2000);
    expect([p.x, p.y]).toEqual([6, 1]);
    p.x = 5; p.y = 1; // parado na porta
    q.x = 4;
    expect(w.doors.use(q, "comum")).toBe(false);
    expect(w.notices("q")).toContain("Tem alguém na porta.");
    expect(w.doors.isOpen("comum")).toBe(true);
    w.monsters.add("5,1");
    p.x = 6;
    expect(w.doors.use(q, "comum")).toBe(false); // monstro em cima também segura
  });

  it("longe (mais de 1 tile) não usa; morto não usa", () => {
    const w = setup();
    const p = w.add("p", 2, 1);
    expect(w.doors.use(p, "comum")).toBe(false);
    expect(w.notices("p")).toContain("Chegue mais perto da porta.");
    p.x = 4; p.hp = 0;
    expect(w.doors.use(p, "comum")).toBe(false);
    expect(w.doors.use(p, "nao-existe")).toBe(false);
  });
});

describe("porta de level (como no Tibia: usar põe dentro da porta)", () => {
  it("sem o level: recebe o motivo e fica onde está", () => {
    const w = setup();
    const p = w.add("p", 4, 3, 19);
    expect(w.doors.use(p, "lv20")).toBe(false);
    expect([p.x, p.y]).toEqual([4, 3]);
    expect(w.notices("p")[0]).toMatch(/level 20/);
  });

  it("com o level: dá um passo para dentro da porta, sai do outro lado andando; a porta segue parede para os outros", () => {
    const w = setup();
    const p = w.add("p", 4, 3, 20);
    expect(w.doors.use(p, "lv20")).toBe(true);
    expect([p.x, p.y]).toEqual([5, 3]);
    expect(p.stepMs).toBeGreaterThan(0); // passo normal, não teleporte
    expect(w.g.isWalkable(5, 3)).toBe(false); // continua parede: ninguém entra a pé atrás dele

    w.tick(2000);
    w.mv.onWalkTo(p, { x: 6, y: 3 });
    w.tick(2000);
    expect([p.x, p.y]).toEqual([6, 3]);
    // De dentro, usar de novo leva de volta para a porta.
    expect(w.doors.use(p, "lv20")).toBe(true);
    expect([p.x, p.y]).toEqual([5, 3]);
  });

  it("ocupada: espera; no meio de um passo: não entra (o cliente reclica); da quina não entra", () => {
    const w = setup();
    const p = w.add("p", 4, 3, 30), q = w.add("q", 5, 3, 30);
    expect(w.doors.use(p, "lv20")).toBe(false);
    expect(w.notices("p")).toContain("Tem alguém na porta.");
    q.x = 6;
    w.mv.onWalkTo(p, { x: 3, y: 3 }); // começou um passo
    expect(w.doors.use(p, "lv20")).toBe(false);
    w.tick(2000);
    // Em (4,2): diagonal da porta, ao lado de um dos lados (4,3) — vale.
    p.x = 4; p.y = 2;
    expect(w.doors.use(p, "lv20")).toBe(true);
  });
});

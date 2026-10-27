import { describe, expect, it } from "vitest";
import { BACKPACK_SIZE, S2C } from "@lemonquest/shared";
import { makeItem } from "./inventory.ts";
import {
  DECAY_MS, DROP_RANGE, MAX_LIFE_MULT, GROUND_MSG, GROUND_RATE, GroundSystem, MAX_GROUND_ITEMS, MAX_PER_TILE, PARTY_LOOT_PRIORITY_MS, SAVE_DEBOUNCE_MS,
  lineClear, partyLootMsg, type GroundRecord,
} from "./ground.ts";
import { LootSystem } from "./loot.ts";
import { def, grid } from "./testkit.ts";
import { invWorld } from "./m4kit.ts";
import type { Monster } from "./monsters.ts";
import type { GroundItemState, PlayerState } from "../state.ts";

// 12x9, parede vertical em x=7 (y 0..6), NPC em (2,2).
const MAP = grid([
  "............",
  "............",
  "............",
  ".......#....",
  ".......#....",
  ".......#....",
  ".......#....",
  "............",
  "............",
]);

function groundWorld() {
  const w = invWorld();
  const collection = new Map<string, GroundItemState>();
  const logs: string[] = [];
  const roster = new Map<string, PlayerState>();
  const ground = new GroundSystem({
    inventory: w.inv, collection, now: w.now, log: (m) => logs.push(m),
    canHold: (x, y) => MAP.isWalkable(x, y) && !(x === 2 && y === 2),
    seeThrough: (x, y) => MAP.isWalkable(x, y),
    send: (to, type, msg) => w.sent.push({ to, type, msg }),
    // Grupo "de mentira": quem tem o mesmo partyId é do mesmo grupo (no jogo o PartySystem mantém p.partyId).
    partyMembers: (p) => [...roster.values()].filter((q) => q.partyId && q.partyId === p.partyId).map((q) => q.id),
  });
  const add = (id: string, x: number, y: number, over: Partial<PlayerState> = {}) => {
    const p = w.mk(id, { name: id.toUpperCase(), ...over });
    p.x = x; p.y = y;
    roster.set(id, p);
    return p;
  };
  const onTile = (x: number, y: number) => ground.at(x, y).map((id) => ground.get(id)!);
  const bp = (id: string) => w.inv.get(id)!.backpack;
  // A janela do limitador é de 1 s: avança o relógio entre ações para não esbarrar nele.
  const step = () => w.advance(150);
  return { w, ground, collection, logs, add, onTile, bp, step };
}

describe("lineClear (Bresenham)", () => {
  it("blocked by walls between the endpoints only", () => {
    const pass = (x: number, y: number) => MAP.isWalkable(x, y);
    expect(lineClear(5, 4, 8, 4, pass)).toBe(false);
    expect(lineClear(5, 4, 7, 4, pass)).toBe(true); // o próprio destino não conta
    expect(lineClear(5, 7, 9, 7, pass)).toBe(true);
    expect(lineClear(3, 3, 3, 3, pass)).toBe(true);
  });
});

describe("ground: drop", () => {
  it("drops on the target tile when in range, walkable and with a clear line; synced without bonuses", () => {
    const t = groundWorld();
    const p = t.add("p1", 5, 5);
    t.w.inv.addItem(p, makeItem("sword", 1, "rare", [{ stat: "attack", value: 3 }]));
    t.ground.onDrop(p, { from: { where: "backpack", index: 0 }, x: 4, y: 3 });
    expect(t.bp("p1")[0]).toBeNull();
    const [e] = t.onTile(4, 3);
    expect(e!.item.bonuses).toEqual([{ stat: "attack", value: 3 }]);
    const s = t.collection.get(e!.state.id)!;
    expect({ defId: s.defId, count: s.count, rarity: s.rarity, x: s.x, y: s.y }).toEqual({ defId: "sword", count: 1, rarity: "rare", x: 4, y: 3 });
    expect(Object.keys(s)).not.toContain("bonuses");
  });

  it("out of range / behind a wall / not walkable / NPC tile → falls on the player's own tile", () => {
    const t = groundWorld();
    const p = t.add("p1", 5, 4);
    t.w.inv.addItem(p, makeItem("bone", 10));
    const drop = (x: number, y: number) => { t.step(); t.ground.onDrop(p, { from: { where: "backpack", index: 0 }, x, y, count: 1 }); };
    drop(5 + DROP_RANGE + 1, 4);  // longe
    drop(8, 4);                   // atrás da parede
    drop(7, 4);                   // parede
    drop(2, 2);                   // tile de NPC (5,4)→(2,2) cheb 3
    drop(-1, 0);                  // fora do mapa
    // Empilham no próprio tile.
    expect(t.onTile(5, 4).map((e) => e.item.count)).toEqual([5]);
    expect(t.bp("p1")[0]!.count).toBe(5);
    drop(5 + DROP_RANGE, 4);      // exatamente no alcance, sem parede no caminho (x 6..8? x=7 é parede) → próprio tile
    expect(t.onTile(8, 4)).toHaveLength(0);
    drop(5, 4 + DROP_RANGE);      // (5,7) ok
    expect(t.onTile(5, 7).map((e) => e.item.count)).toEqual([1]);
  });

  it("validates counts and ownership; split leaves the rest in the backpack; never duplicates", () => {
    const t = groundWorld();
    const p = t.add("p1", 5, 5);
    t.w.inv.addItem(p, makeItem("bone", 10));
    const from = { where: "backpack" as const, index: 0 };
    for (const count of [0, -1, 11, 1.5, "3" as unknown as number]) { t.step(); t.ground.onDrop(p, { from, x: 5, y: 5, count }); }
    t.step(); t.ground.onDrop(p, { from: { where: "backpack", index: 3 }, x: 5, y: 5 });  // vazio
    t.step(); t.ground.onDrop(p, { from: { where: "depot", index: 0 } as never, x: 5, y: 5 });
    t.step(); t.ground.onDrop(p, { from: { where: "backpack", index: 99 }, x: 5, y: 5 });
    t.step(); t.ground.onDrop(p, null as never);
    expect(t.ground.size).toBe(0);
    expect(t.bp("p1")[0]!.count).toBe(10);
    t.step(); t.ground.onDrop(p, { from, x: 5, y: 5, count: 4 });
    expect(t.bp("p1")[0]!.count).toBe(6);
    const [e] = t.onTile(5, 5);
    expect(e!.item.count).toBe(4);
    expect(e!.item.uid).not.toBe(t.bp("p1")[0]!.uid);
    // Morto não larga.
    p.hp = 0;
    t.step(); t.ground.onDrop(p, { from, x: 5, y: 5 });
    expect(t.bp("p1")[0]!.count).toBe(6);
  });

  it("equipped items can be dropped (stats recalculated)", () => {
    const t = groundWorld();
    const p = t.add("p1", 5, 5);
    t.w.inv.addItem(p, makeItem("vest"));
    t.w.inv.onMoveItem(p, { from: { where: "backpack", index: 0 }, to: { where: "equip", slot: "armor" } });
    expect(t.w.inv.stat("p1", "armor")).toBe(2);
    t.ground.onDrop(p, { from: { where: "equip", slot: "armor" }, x: 6, y: 6 });
    expect(t.w.inv.get("p1")!.equipment.armor).toBeUndefined();
    expect(t.w.inv.stat("p1", "armor")).toBe(0);
    expect(t.onTile(6, 6)[0]!.item.defId).toBe("vest");
  });

  it(`tile holds at most ${MAX_PER_TILE} items`, () => {
    const t = groundWorld();
    const p = t.add("p1", 5, 5);
    for (let i = 0; i < MAX_PER_TILE + 1; i++) t.w.inv.addItem(p, makeItem("sword"));
    for (let i = 0; i < MAX_PER_TILE + 1; i++) { t.step(); t.ground.onDrop(p, { from: { where: "backpack", index: i }, x: 5, y: 5 }); }
    expect(t.onTile(5, 5)).toHaveLength(MAX_PER_TILE);
    expect(t.bp("p1")[MAX_PER_TILE]).not.toBeNull();
    expect(t.w.notices().at(-1)).toBe(GROUND_MSG.tileFull);
  });

  it("DiscardItem still works = whole stack on the player's own tile", () => {
    const t = groundWorld();
    const p = t.add("p1", 3, 3);
    t.w.inv.addItem(p, makeItem("hp_pot", 7));
    t.ground.onDiscard(p, { index: 0 });
    expect(t.bp("p1")[0]).toBeNull();
    expect(t.onTile(3, 3)[0]!.item).toMatchObject({ defId: "hp_pot", count: 7 });
  });

  it(`rate limit: ${GROUND_RATE}/s per kind, excess silently dropped`, () => {
    const t = groundWorld();
    const p = t.add("p1", 5, 5);
    t.w.inv.addItem(p, makeItem("bone", 50));
    for (let i = 0; i < GROUND_RATE + 5; i++) t.ground.onDrop(p, { from: { where: "backpack", index: 0 }, x: 5, y: 5, count: 1 });
    expect(t.bp("p1")[0]!.count).toBe(50 - GROUND_RATE);
    t.w.advance(1000);
    t.ground.onDrop(p, { from: { where: "backpack", index: 0 }, x: 5, y: 5, count: 1 });
    expect(t.bp("p1")[0]!.count).toBe(50 - GROUND_RATE - 1);
  });

  it("logs epic+ drops and pickups", () => {
    const t = groundWorld();
    const p = t.add("p1", 5, 5);
    t.w.inv.addItem(p, makeItem("sword", 1, "epic"));
    t.ground.onDrop(p, { from: { where: "backpack", index: 0 }, x: 5, y: 5 });
    t.step();
    t.ground.onPickup(p, { groundId: t.onTile(5, 5)[0]!.state.id });
    expect(t.logs).toHaveLength(2);
    expect(t.logs[0]).toMatch(/^\[ground\] P1 largou Espada \(Épico\)/);
    expect(t.logs[1]).toMatch(/^\[ground\] P1 pegou sword/);
  });
});

describe("ground: pickup", () => {
  it("anyone in range 1 picks up into the backpack; farther is ignored", () => {
    const t = groundWorld();
    const a = t.add("a", 5, 5), b = t.add("b", 8, 8);
    t.w.inv.addItem(a, makeItem("sword", 1, "rare", [{ stat: "crit", value: 1 }]));
    t.ground.onDrop(a, { from: { where: "backpack", index: 0 }, x: 5, y: 7 });
    const id = t.onTile(5, 7)[0]!.state.id;
    t.ground.onPickup(b, { groundId: id });
    expect(t.ground.get(id)).toBeDefined();
    b.x = 6; b.y = 8;
    t.step(); t.ground.onPickup(b, { groundId: id });
    expect(t.ground.get(id)).toBeUndefined();
    expect(t.collection.size).toBe(0);
    expect(t.bp("b")[0]).toMatchObject({ defId: "sword", rarity: "rare", bonuses: [{ stat: "crit", value: 1 }] });
    expect(t.bp("a")[0]).toBeNull();
  });

  it("merges stacks, goes to the requested slot / equip slot", () => {
    const t = groundWorld();
    const p = t.add("p1", 5, 5);
    t.w.inv.addItem(p, makeItem("bone", 30));
    t.ground.place(makeItem("bone", 20), 5, 6);
    t.ground.onPickup(p, { groundId: t.onTile(5, 6)[0]!.state.id });
    expect(t.bp("p1")[0]!.count).toBe(50);
    expect(t.bp("p1")[1]).toBeNull();
    t.ground.place(makeItem("hp_pot", 2), 5, 6);
    t.step(); t.ground.onPickup(p, { groundId: t.onTile(5, 6)[0]!.state.id, to: { where: "backpack", index: 7 } });
    expect(t.bp("p1")[7]).toMatchObject({ defId: "hp_pot", count: 2 });
    t.ground.place(makeItem("vest"), 4, 4);
    t.step(); t.ground.onPickup(p, { groundId: t.onTile(4, 4)[0]!.state.id, to: { where: "equip", slot: "armor" } });
    expect(t.w.inv.get("p1")!.equipment.armor?.defId).toBe("vest");
    expect(t.w.inv.stat("p1", "armor")).toBe(2);
    // Slot errado → vai para a mochila.
    t.ground.place(makeItem("boots"), 4, 4);
    t.step(); t.ground.onPickup(p, { groundId: t.onTile(4, 4)[0]!.state.id, to: { where: "equip", slot: "helmet" } });
    expect(t.bp("p1").some((it) => it?.defId === "boots")).toBe(true);
  });

  it("gold coins go to the gold counter", () => {
    const t = groundWorld();
    const p = t.add("p1", 5, 5);
    t.ground.place(makeItem("gold_coin", 77), 5, 5);
    t.ground.onPickup(p, { groundId: t.onTile(5, 5)[0]!.state.id });
    expect(t.w.inv.gold("p1")).toBe(77);
    expect(t.ground.size).toBe(0);
  });

  it("no room → stays on the ground + notice; partial stack leaves the rest", () => {
    const t = groundWorld();
    const p = t.add("p1", 5, 5);
    for (let k = 0; k < BACKPACK_SIZE; k++) t.w.inv.addItem(p, makeItem("sword"));
    const id = t.ground.place(makeItem("vest"), 5, 5)!;
    t.ground.onPickup(p, { groundId: id });
    expect(t.ground.get(id)).toBeDefined();
    expect(t.w.notices().at(-1)).toBe(GROUND_MSG.full);
    // Mochila com uma pilha de 95 ossos: 5 entram, 15 ficam.
    const t2 = groundWorld();
    const q = t2.add("q", 5, 5);
    t2.w.inv.addItem(q, makeItem("bone", 95));
    for (let k = 1; k < BACKPACK_SIZE; k++) t2.w.inv.addItem(q, makeItem("sword"));
    const bid = t2.ground.place(makeItem("bone", 20), 5, 5)!;
    t2.ground.onPickup(q, { groundId: bid });
    expect(t2.bp("q")[0]!.count).toBe(100);
    expect(t2.ground.get(bid)!.item.count).toBe(15);
    expect(t2.collection.get(bid)!.count).toBe(15);
  });

  it("concurrent pickup: first wins, second is silent", () => {
    const t = groundWorld();
    const a = t.add("a", 5, 5), b = t.add("b", 6, 5);
    const id = t.ground.place(makeItem("vest", 1, "uncommon", [{ stat: "armor", value: 1 }]), 5, 6)!;
    t.ground.onPickup(a, { groundId: id });
    t.ground.onPickup(b, { groundId: id });
    expect(t.bp("a")[0]?.defId).toBe("vest");
    expect(t.bp("b")[0]).toBeNull();
    expect(t.w.notices()).toEqual([]);
  });

  it("ignores garbage", () => {
    const t = groundWorld();
    const p = t.add("p1", 5, 5);
    for (const m of [null, {}, { groundId: 5 }, { groundId: "nope" }]) t.ground.onPickup(p, m as never);
    expect(t.w.sent).toEqual([]);
  });
});

describe("ground: decay and caps", () => {
  it("common/uncommon decay at 10 min, rare+ at 20 min", () => {
    const t = groundWorld();
    const c = t.ground.place(makeItem("sword", 1, "uncommon"), 1, 1)!;
    const r = t.ground.place(makeItem("sword", 1, "rare"), 1, 1)!;
    expect(DECAY_MS.common).toBe(600_000);
    t.w.advance(DECAY_MS.common - 1); t.ground.tick(t.w.now());
    expect(t.ground.get(c)).toBeDefined();
    t.w.advance(1000); t.ground.tick(t.w.now());
    expect(t.ground.get(c)).toBeUndefined();
    expect(t.ground.get(r)).toBeDefined();
    t.w.advance(DECAY_MS.rare); t.ground.tick(t.w.now());
    expect(t.ground.get(r)).toBeUndefined();
    expect(t.collection.size).toBe(0);
    expect(t.ground.at(1, 1)).toEqual([]);
  });

  it(`at most ${MAX_GROUND_ITEMS} items: the oldest goes first`, () => {
    const t = groundWorld();
    const t2 = new GroundSystem({
      inventory: t.w.inv, collection: new Map(), canHold: () => true, seeThrough: () => true, send: () => {}, now: t.w.now,
    });
    const ids: string[] = [];
    for (let i = 0; i < MAX_GROUND_ITEMS + 2; i++) ids.push(t2.place(makeItem("sword"), i, 0)!);
    expect(t2.size).toBe(MAX_GROUND_ITEMS);
    expect(t2.get(ids[0]!)).toBeUndefined();
    expect(t2.get(ids[1]!)).toBeUndefined();
    expect(t2.get(ids[2]!)).toBeDefined();
  });

  it("chão lotado: sai o comum/incomum mais antigo antes de qualquer raro+", () => {
    const t = groundWorld();
    const t2 = new GroundSystem({
      inventory: t.w.inv, collection: new Map(), canHold: () => true, seeThrough: () => true, send: () => {}, now: t.w.now,
    });
    const rare = t2.place(makeItem("sword", 1, "rare"), 0, 0)!;
    const epic = t2.place(makeItem("sword", 1, "epic"), 1, 0)!;
    const ids: string[] = [];
    for (let i = 2; i < MAX_GROUND_ITEMS; i++) ids.push(t2.place(makeItem("sword", 1, i % 2 ? "uncommon" : "common"), i, 0)!);
    t2.place(makeItem("sword"), 0, 1);
    t2.place(makeItem("sword"), 1, 1);
    expect(t2.size).toBe(MAX_GROUND_ITEMS);
    expect(t2.get(rare)).toBeDefined();
    expect(t2.get(epic)).toBeDefined();
    expect(t2.get(ids[0]!)).toBeUndefined();
    expect(t2.get(ids[1]!)).toBeUndefined();
    expect(t2.get(ids[2]!)).toBeDefined();
    // Só raros+ no chão: aí sai o mais antigo deles.
    const t3 = new GroundSystem({
      inventory: t.w.inv, collection: new Map(), canHold: () => true, seeThrough: () => true, send: () => {}, now: t.w.now,
    });
    const r3: string[] = [];
    for (let i = 0; i < MAX_GROUND_ITEMS + 1; i++) r3.push(t3.place(makeItem("sword", 1, "rare"), i, 0)!);
    expect(t3.get(r3[0]!)).toBeUndefined();
    expect(t3.get(r3[1]!)).toBeDefined();
  });

  it("empilhar não encurta o prazo do que acabou de cair (a pilha fica com o prazo mais tarde)", () => {
    const t = groundWorld();
    const id = t.ground.place(makeItem("bone", 50), 3, 3)!;
    t.w.advance(DECAY_MS.common - 30_000); // pilha velha: faltam 30 s
    expect(t.ground.place(makeItem("bone", 50), 3, 3)).toBe(id); // 50 novos empilham
    expect(t.ground.get(id)!.expiresAt).toBe(t.w.now() + DECAY_MS.common);
    t.w.advance(60_000);
    t.ground.tick(t.w.now());
    expect(t.ground.get(id)?.item.count).toBe(100); // os novos não sumiram junto
  });

  it(`juntar e mover pilhas não deixa item eterno: no máximo ${MAX_LIFE_MULT}× o prazo desde a parte mais antiga`, () => {
    const t = groundWorld();
    const p = t.add("p1", 5, 5);
    let cur = t.ground.place(makeItem("bone", 10), 5, 5)!;
    const born = t.w.now();
    // A cada 3 min: uma isca nova num tile, funde a pilha nela e traz de volta (antes isso renovava o prazo sem fim).
    for (let i = 0; i < 12; i++) {
      t.w.advance(3 * 60_000);
      t.ground.tick(t.w.now());
      if (!t.ground.get(cur)) break;
      t.ground.place(makeItem("bone", 1), 4, 5);
      t.ground.onMoveGround(p, { groundId: cur, x: 4, y: 5 });
      cur = t.ground.at(4, 5).at(-1)!;
      t.step();
      t.ground.onMoveGround(p, { groundId: cur, x: 5, y: 5 });
      cur = t.ground.at(5, 5).at(-1)!;
      t.step();
      expect(t.ground.get(cur)!.expiresAt).toBeLessThanOrEqual(born + MAX_LIFE_MULT * DECAY_MS.common);
    }
    t.w.advance(MAX_LIFE_MULT * DECAY_MS.common);
    t.ground.tick(t.w.now());
    expect(t.ground.at(5, 5)).toEqual([]);
    expect(t.ground.at(4, 5)).toEqual([]);
  });
});

describe("ground: loot overflow", () => {
  it("loot que não coube cai no tile de quem matou, e qualquer um pega na hora (o chão não tem dono)", () => {
    const t = groundWorld();
    const killer = t.add("k", 4, 4, { name: "Kiko" });
    const other = t.add("o", 5, 4);
    for (let k = 0; k < BACKPACK_SIZE; k++) t.w.inv.addItem(killer, makeItem("sword"));
    const players = new Map([["k", killer], ["o", other]]);
    const loot = new LootSystem({
      inventory: t.w.inv, getPlayer: (id) => players.get(id), ground: t.ground,
      send: (to, type, msg) => t.w.sent.push({ to, type, msg }), broadcast: () => {}, rng: () => 0,
    });
    const md = def({ name: "Rato", loot: [{ itemId: "vest", chance: 1 }, { itemId: "bone", chance: 1, min: 3, max: 3 }] });
    loot.onKill({ s: { id: "m1", x: 9, y: 9, ownerId: "" }, def: md, damageBy: new Map([["k", 10]]) } as unknown as Monster);
    const items = t.onTile(4, 4);
    expect(items.map((e) => e.item.defId).sort()).toEqual(["bone", "vest"]);
    expect(t.w.notices()).toContain("Mochila cheia: 2 itens caíram no chão.");
    const lootMsg = t.w.sent.find((s) => s.type === S2C.Loot)!.msg;
    expect(lootMsg.fellToGround).toBe(2);
    expect(lootMsg.lostFull).toBeUndefined();
    const vest = items.find((e) => e.item.defId === "vest")!.state.id;
    t.ground.onPickup(other, { groundId: vest });
    expect(t.ground.get(vest)).toBeUndefined();
    expect(t.bp("o")[0]?.defId).toBe("vest");
  });
});

describe("ground: persistência", () => {
  type Rec = Parameters<NonNullable<ConstructorParameters<typeof GroundSystem>[0]["store"]>["save"]>[0];
  const memStore = () => {
    let rows: Rec = [];
    return {
      load: () => structuredClone(rows),
      save: (r: Rec) => { rows = structuredClone(r); },
      get rows() { return rows; },
      set rows(r: Rec) { rows = r; },
    };
  };
  const make = (w: ReturnType<typeof invWorld>, store: ReturnType<typeof memStore>) => new GroundSystem({
    inventory: w.inv, collection: new Map<string, GroundItemState>(), now: w.now, log: () => {}, store,
    canHold: (x, y) => MAP.isWalkable(x, y) && !(x === 2 && y === 2),
    seeThrough: (x, y) => MAP.isWalkable(x, y),
    send: () => {},
  });

  it("flush grava só quando mudou; restore recarrega itens e a ordem da pilha", () => {
    const w = invWorld();
    const store = memStore();
    const g1 = make(w, store);
    g1.place(makeItem("bone", 5), 4, 4);
    g1.place(makeItem("sword", 1, "rare", [{ stat: "attack", value: 3 }]), 4, 4);
    g1.place(makeItem("vest"), 5, 5);
    g1.flush();
    expect(store.rows).toHaveLength(3);
    const g2 = make(w, store);
    expect(g2.restore()).toBe(3);
    const ids = g2.at(4, 4);
    expect(ids.map((i) => g2.get(i)!.item.defId)).toEqual(["bone", "sword"]);
    expect(g2.get(ids[1]!)!.item.bonuses).toEqual([{ stat: "attack", value: 3 }]);
    expect(g2.get(g2.at(5, 5)[0]!)!.item.defId).toBe("vest");
  });

  it("o 'nascimento' da pilha (teto do prazo) sobrevive ao reinício; registro antigo sem ele é estimado pelo prazo", () => {
    const w = invWorld();
    const store = memStore();
    const g1 = make(w, store);
    const born = w.now();
    g1.place(makeItem("bone", 5), 4, 4);
    g1.flush();
    expect(store.rows[0]!.createdAt).toBe(born);
    store.rows.push({ x: 6, y: 6, item: makeItem("bone", 1), expiresAt: born + 1000 }); // de antes da v7
    const g2 = make(w, store);
    expect(g2.restore()).toBe(2);
    expect(g2.get(g2.at(4, 4)[0]!)!.createdAt).toBe(born);
    expect(g2.get(g2.at(6, 6)[0]!)!.createdAt).toBe(born + 1000 - DECAY_MS.common);
  });

  it("restore descarta o que expirou durante o 'servidor desligado'", () => {
    const w = invWorld();
    const store = memStore();
    const g1 = make(w, store);
    g1.place(makeItem("bone", 1), 4, 4);                                      // 10 min
    g1.place(makeItem("sword", 1, "rare"), 5, 5);                             // 20 min
    g1.place(makeItem("vest", 1, "rare"), 6, 6);                              // 20 min
    g1.flush();
    w.advance(DECAY_MS.common + 1000);
    const g2 = make(w, store);
    expect(g2.restore()).toBe(2);
    expect(g2.at(4, 4)).toHaveLength(0);
    g2.flush();
    expect(store.rows).toHaveLength(2); // lista limpa regravada
  });

  it("tick grava com debounce; remover também marca como alterado", () => {
    const w = invWorld();
    const store = memStore();
    const g = make(w, store);
    w.advance(10_000);
    const id = g.place(makeItem("bone", 1), 4, 4)!;
    g.tick(w.now());
    expect(store.rows).toHaveLength(1);
    g.remove(id);
    w.advance(1000);
    g.tick(w.now());
    expect(store.rows).toHaveLength(1); // dentro do debounce
    w.advance(SAVE_DEBOUNCE_MS);
    g.tick(w.now());
    expect(store.rows).toHaveLength(0);
  });

  it("ignora tiles inválidos e itens de definição desconhecida", () => {
    const w = invWorld();
    const store = memStore();
    const g1 = make(w, store);
    g1.place(makeItem("bone", 1), 4, 4);
    g1.flush();
    store.rows = [
      ...store.rows,
      { x: 7, y: 4, item: makeItem("bone", 1), expiresAt: w.now() + 1e6 },
      { x: 3, y: 3, item: makeItem("nao_existe", 1), expiresAt: w.now() + 1e6 },
    ];
    expect(make(w, store).restore()).toBe(1);
  });
});

describe("ground: mover no chão (arrastar de um tile para outro)", () => {
  it("move dentro do alcance com linha livre; o tempo até sumir não reinicia; fora do alcance/atrás da parede não", () => {
    const t = groundWorld();
    const p = t.add("p1", 4, 4);
    const id = t.ground.place(makeItem("vest"), 5, 4)!;
    const expires = t.ground.get(id)!.expiresAt;
    t.w.advance(5000);
    t.ground.onMoveGround(p, { groundId: id, x: 6, y: 5 });
    expect(t.onTile(5, 4)).toHaveLength(0);
    const moved = t.onTile(6, 5)[0]!;
    expect(moved.item.defId).toBe("vest");
    expect(moved.expiresAt).toBe(expires);
    t.step();
    t.ground.onMoveGround(p, { groundId: moved.state.id, x: 4 + DROP_RANGE + 1, y: 4 }); // destino longe
    expect(t.w.notices().at(-1)).toBe(GROUND_MSG.throwFar);
    t.step();
    t.ground.onMoveGround(p, { groundId: moved.state.id, x: 8, y: 5 }); // atrás da parede (x=7)
    expect(t.onTile(6, 5)).toHaveLength(1);
    const far = t.ground.place(makeItem("bone"), 4 + DROP_RANGE + 1, 4)!;
    t.step();
    t.ground.onMoveGround(p, { groundId: far, x: 5, y: 5 }); // origem longe
    expect(t.ground.get(far)!.state.x).toBe(4 + DROP_RANGE + 1);
    expect(t.w.notices().at(-1)).toBe(GROUND_MSG.itemFar);
  });

  it("parte de uma pilha (count)", () => {
    const t = groundWorld();
    const p = t.add("p1", 4, 4);
    const id = t.ground.place(makeItem("bone", 5), 4, 5)!;
    t.ground.onMoveGround(p, { groundId: id, x: 5, y: 5, count: 2 });
    expect(t.ground.get(id)!.item.count).toBe(3);
    const part = t.onTile(5, 5)[0]!;
    expect(part.item.count).toBe(2);
    expect(part.item.uid).not.toBe(t.ground.get(id)!.item.uid);
  });
});

describe("loot de grupo: cai no chão reservado ao grupo por 15 s, depois qualquer um pega (GD-21)", () => {
  const md = def({ name: "Rato", gold: [7, 7], loot: [{ itemId: "vest", chance: 1 }] });
  // rng 0 → colete comum; 0,95 → raro (acumulado das raridades: comum 0,7, incomum 0,9, raro 0,975).
  const kill = (t: ReturnType<typeof groundWorld>, killer: PlayerState, players: Map<string, PlayerState>, party?: string, rng = () => 0) => {
    const loot = new LootSystem({
      inventory: t.w.inv, getPlayer: (id) => players.get(id), ground: t.ground, rng, now: t.w.now,
      send: (to, type, msg) => t.w.sent.push({ to, type, msg }), broadcast: () => {},
      partyIdOf: () => party,
    });
    loot.onKill({ s: { id: "m1", x: 9, y: 8, ownerId: "" }, def: md, damageBy: new Map([[killer.id, 10]]) } as unknown as Monster);
  };
  // Mesmo abate, mas com a divisão do raro+ ligada: `sharers` = quem participou (na ordem do grupo). Devolve o sistema
  // para encadear abates no mesmo rodízio.
  const splitLoot = (t: ReturnType<typeof groundWorld>, players: Map<string, PlayerState>, sharers: () => PlayerState[], rng = () => 0.95) =>
    new LootSystem({
      inventory: t.w.inv, getPlayer: (id) => players.get(id), ground: t.ground, rng, now: t.w.now,
      send: (to, type, msg) => t.w.sent.push({ to, type, msg }), broadcast: () => {},
      partyIdOf: () => "P1", lootSharers: sharers,
      partyMembers: (p) => [...players.values()].filter((q) => q.partyId === p.partyId).map((q) => q.id),
    });
  const killWith = (loot: LootSystem, killer: PlayerState) =>
    loot.onKill({ s: { id: "m1", x: 9, y: 8, ownerId: "" }, def: md, damageBy: new Map([[killer.id, 10]]) } as unknown as Monster);
  const lootMsgs = (t: ReturnType<typeof groundWorld>) => t.w.sent.filter((x) => x.type === S2C.Loot).map((x) => ({ to: x.to, ...x.msg }));
  const partyChat = (t: ReturnType<typeof groundWorld>) => t.w.sent.filter((x) => x.type === S2C.Chat && x.msg.channel === "party").map((x) => `${x.to}:${x.msg.text}`);

  it("itens e ouro no tile do monstro com dono = grupo; membro pega na hora, quem é de fora só depois de 15 s", () => {
    const t = groundWorld();
    const killer = t.add("k", 9, 7, { partyId: "P1" }), ally = t.add("a", 8, 8, { partyId: "P1" }), stranger = t.add("s", 10, 8);
    const t0 = t.w.now();
    kill(t, killer, new Map([["k", killer], ["a", ally], ["s", stranger]]), "P1");
    const items = t.onTile(9, 8);
    expect(items.map((e) => e.item.defId).sort()).toEqual(["gold_coin", "vest"]);
    for (const e of items) expect([e.owner, e.ownerUntil]).toEqual(["P1", t0 + PARTY_LOOT_PRIORITY_MS]);
    expect(t.bp("k").filter(Boolean)).toHaveLength(0);
    expect(t.w.inv.gold("k")).toBe(0);
    const msg = t.w.sent.find((x) => x.type === S2C.Loot)!.msg;
    expect(msg).toMatchObject({ onGround: true, gold: 7 });
    // De fora, dentro do prazo: recusado com aviso dizendo quanto falta; nada sai do chão.
    const gold = items.find((e) => e.item.defId === "gold_coin")!.state.id;
    t.ground.onPickup(stranger, { groundId: gold });
    expect(t.w.notices()).toEqual([partyLootMsg(15)]);
    expect(t.w.inv.gold("s")).toBe(0);
    t.w.advance(5_500);
    t.ground.onPickup(stranger, { groundId: gold });
    expect(t.w.notices().at(-1)).toBe(partyLootMsg(10));
    expect(t.ground.get(gold)).toBeDefined();
    // Membro pega na hora.
    const vest = items.find((e) => e.item.defId === "vest")!.state.id;
    t.ground.onPickup(ally, { groundId: vest });
    expect(t.ground.get(vest)).toBeUndefined();
    expect(t.bp("a").some((x) => x?.defId === "vest")).toBe(true);
    // Passado o prazo, o chão volta a ser de qualquer um.
    t.w.advance(PARTY_LOOT_PRIORITY_MS);
    t.ground.onPickup(stranger, { groundId: gold });
    expect(t.w.inv.gold("s")).toBe(7);
    expect(partyChat(t)).toEqual([]); // colete comum: sem linha no chat
  });

  it("de fora também não move o item reservado; membro move e a reserva viaja com ele", () => {
    const t = groundWorld();
    const killer = t.add("k", 9, 7, { partyId: "P1" }), ally = t.add("a", 8, 8, { partyId: "P1" }), stranger = t.add("s", 10, 8);
    const t0 = t.w.now();
    kill(t, killer, new Map([["k", killer], ["a", ally], ["s", stranger]]), "P1");
    const vest = t.onTile(9, 8).find((e) => e.item.defId === "vest")!.state.id;
    t.ground.onMoveGround(stranger, { groundId: vest, x: 10, y: 8 });
    expect(t.w.notices()).toEqual([partyLootMsg(15)]);
    expect(t.ground.get(vest)!.state).toMatchObject({ x: 9, y: 8 });
    t.step();
    t.ground.onMoveGround(ally, { groundId: vest, x: 8, y: 7 });
    const moved = t.onTile(8, 7)[0]!;
    expect(moved.item.defId).toBe("vest");
    expect([moved.owner, moved.ownerUntil]).toEqual(["P1", t0 + PARTY_LOOT_PRIORITY_MS]);
    t.step();
    t.ground.onPickup(stranger, { groundId: moved.state.id });
    expect(t.w.notices().at(-1)).toMatch(/^Esse item é do grupo por mais \d+ s\.$/);
  });

  it("raro+ pego por um membro vira linha no chat do grupo (também depois do prazo); quem é de fora não gera linha", () => {
    const t = groundWorld();
    const killer = t.add("k", 9, 7, { name: "Kiko", partyId: "P1" }), ally = t.add("a", 8, 8, { name: "Ana", partyId: "P1" }), stranger = t.add("s", 10, 8);
    kill(t, killer, new Map([["k", killer], ["a", ally], ["s", stranger]]), "P1", () => 0.95);
    const vest = t.onTile(9, 8).find((e) => e.item.defId === "vest")!;
    expect(vest.item.rarity).toBe("rare");
    t.w.advance(PARTY_LOOT_PRIORITY_MS + 1); // já sem reserva: a procedência continua
    t.ground.onPickup(ally, { groundId: vest.state.id });
    expect(partyChat(t)).toEqual(["k:Ana pegou Colete (Raro)", "a:Ana pegou Colete (Raro)"]);
    // Outro abate, mesma situação, mas quem leva é de fora: silêncio no chat.
    t.step();
    kill(t, killer, new Map([["k", killer], ["a", ally], ["s", stranger]]), "P1", () => 0.95);
    const vest2 = t.onTile(9, 8).find((e) => e.item.defId === "vest")!;
    t.w.advance(PARTY_LOOT_PRIORITY_MS + 1);
    t.ground.onPickup(stranger, { groundId: vest2.state.id });
    expect(t.bp("s").some((x) => x?.defId === "vest")).toBe(true);
    expect(partyChat(t)).toHaveLength(2);
  });

  it("divisão automática: o raro+ vai direto à mochila dos participantes em rodízio (ordem do grupo), com linha no chat; o ouro cai no chão", () => {
    const t = groundWorld();
    const killer = t.add("k", 9, 7, { name: "Kiko", partyId: "P1" }), ally = t.add("a", 8, 8, { name: "Ana", partyId: "P1" }), idle = t.add("i", 8, 7, { name: "Ivo", partyId: "P1" });
    const players = new Map([["k", killer], ["a", ally], ["i", idle]]);
    const loot = splitLoot(t, players, () => [killer, ally]); // Ivo está no grupo, mas não participou
    killWith(loot, killer);
    killWith(loot, killer);
    killWith(loot, killer);
    // 1º raro para o primeiro da ordem do grupo, 2º para o seguinte, 3º dá a volta.
    expect(t.bp("k").filter((x) => x?.defId === "vest")).toHaveLength(2);
    expect(t.bp("a").filter((x) => x?.defId === "vest")).toHaveLength(1);
    expect(t.bp("i").filter(Boolean)).toHaveLength(0);
    expect(t.onTile(9, 8).map((e) => [e.item.defId, e.item.count, e.owner])).toEqual([["gold_coin", 21, "P1"]]);
    // Quem recebeu vê o cartão do loot marcado como divisão; quem matou vê só o ouro no chão.
    expect(lootMsgs(t).map((m) => [m.to, m.items.map((i: { defId: string }) => i.defId), m.gold, !!m.partySplit, !!m.onGround])).toEqual([
      ["k", ["vest"], 0, true, false], ["k", [], 7, false, true],
      ["a", ["vest"], 0, true, false], ["k", [], 7, false, true],
      ["k", ["vest"], 0, true, false], ["k", [], 7, false, true],
    ]);
    // O grupo inteiro (até quem não participou) fica sabendo.
    expect(partyChat(t).slice(0, 3)).toEqual([
      "k:Divisão do grupo: Kiko recebeu Colete (Raro)", "a:Divisão do grupo: Kiko recebeu Colete (Raro)", "i:Divisão do grupo: Kiko recebeu Colete (Raro)",
    ]);
    expect(partyChat(t).filter((l) => l.includes("Ana recebeu"))).toHaveLength(3);
  });

  it("divisão automática: só raro+ (comum cai no chão); quem está sem espaço é pulado; ninguém com espaço → chão reservado ao grupo", () => {
    const t = groundWorld();
    const killer = t.add("k", 9, 7, { partyId: "P1" }), ally = t.add("a", 8, 8, { partyId: "P1" });
    const players = new Map([["k", killer], ["a", ally]]);
    // Comum (rng 0): continua no chão, para o grupo.
    killWith(splitLoot(t, players, () => [killer, ally], () => 0), killer);
    expect(t.onTile(9, 8).map((e) => [e.item.defId, e.owner])).toEqual([["vest", "P1"], ["gold_coin", "P1"]]);
    expect(t.bp("k").filter(Boolean)).toHaveLength(0);
    expect(partyChat(t)).toEqual([]);
    // Mochila do primeiro do rodízio cheia (escudos não empilham): o raro vai para o seguinte.
    for (let i = 0; i < BACKPACK_SIZE; i++) t.w.inv.addItem(killer, makeItem("shield", 1));
    const loot = splitLoot(t, players, () => [killer, ally]);
    killWith(loot, killer);
    expect(t.bp("a").filter((x) => x?.defId === "vest")).toHaveLength(1);
    // Ninguém com espaço: cai no chão, reservado ao grupo (como antes da divisão).
    for (let i = 0; i < BACKPACK_SIZE; i++) t.w.inv.addItem(ally, makeItem("shield", 1));
    killWith(loot, killer);
    const vest = t.onTile(9, 8).find((e) => e.item.defId === "vest" && e.item.rarity === "rare")!;
    expect(vest.owner).toBe("P1");
    expect(partyChat(t)).toHaveLength(2); // só a linha da Ana (uma por membro)
    // Sem participante (ex.: quem matou ficou longe): tudo no chão, como antes.
    t.step();
    killWith(splitLoot(t, players, () => []), killer);
    expect(t.onTile(9, 8).filter((e) => e.item.defId === "vest")).toHaveLength(3);
  });

  it("ouro do grupo não entra numa pilha livre (nem o contrário); pilhas do mesmo grupo somam e estendem a reserva", () => {
    const t = groundWorld();
    const reserve = () => ({ owner: "P1", ownerUntil: t.w.now() + PARTY_LOOT_PRIORITY_MS });
    const piles = () => t.onTile(9, 8).map((e) => [e.item.count, e.owner]);
    t.ground.place(makeItem("gold_coin", 3), 9, 8);                 // ouro livre já no tile
    t.ground.placeNear(makeItem("gold_coin", 7), 9, 8, reserve());  // abate do grupo: pilha própria
    expect(piles()).toEqual([[3, undefined], [7, "P1"]]);
    t.w.advance(4000);
    t.ground.placeNear(makeItem("gold_coin", 7), 9, 8, reserve());  // 2º abate do grupo: soma e a reserva conta do novo
    expect(piles()).toEqual([[3, undefined], [14, "P1"]]);
    expect(t.onTile(9, 8)[1]!.ownerUntil).toBe(t.w.now() + PARTY_LOOT_PRIORITY_MS);
    t.ground.place(makeItem("gold_coin", 2), 9, 8);                 // ouro livre não entra na pilha do grupo
    expect(piles()).toEqual([[3, undefined], [14, "P1"], [2, undefined]]);
    t.w.advance(PARTY_LOOT_PRIORITY_MS);                            // reserva vencida: volta a empilhar com o livre
    t.ground.placeNear(makeItem("gold_coin", 1), 9, 8);
    expect(piles()).toEqual([[3, undefined], [14, "P1"], [3, undefined]]);
  });

  it("sozinho continua igual: direto na mochila de quem matou, e o que não coube cai sem dono", () => {
    const t = groundWorld();
    const killer = t.add("k", 9, 7);
    kill(t, killer, new Map([["k", killer]]));
    expect(t.onTile(9, 8)).toHaveLength(0);
    expect(t.bp("k").some((x) => x?.defId === "vest")).toBe(true);
    expect(t.w.inv.gold("k")).toBe(7);
    for (let i = 0; i < BACKPACK_SIZE; i++) t.w.inv.addItem(killer, makeItem("sword"));
    t.step();
    kill(t, killer, new Map([["k", killer]]));
    const fell = t.onTile(9, 7)[0]!;
    expect(fell.item.defId).toBe("vest");
    expect([fell.owner, fell.ownerUntil]).toEqual([undefined, undefined]);
  });
});

describe("ground: persistência da reserva do grupo", () => {
  it("flush grava owner/ownerUntil; restore só devolve a reserva que ainda vale", () => {
    const rows: GroundRecord[] = [];
    const store = { load: () => rows, save: (r: GroundRecord[]) => { rows.length = 0; rows.push(...r); } };
    const mkWorld = () => {
      const w = invWorld();
      const collection = new Map<string, GroundItemState>();
      const g = new GroundSystem({
        store, inventory: w.inv, collection, now: w.now, log: () => {},
        canHold: (x, y) => MAP.isWalkable(x, y), seeThrough: (x, y) => MAP.isWalkable(x, y), send: () => {},
      });
      return { w, g };
    };
    const a = mkWorld();
    const t0 = a.w.now();
    a.g.placeNear(makeItem("vest"), 1, 1, { owner: "P1", ownerUntil: t0 + PARTY_LOOT_PRIORITY_MS });
    a.g.placeNear(makeItem("bone", 2), 3, 3, { owner: "P2", ownerUntil: t0 + 2000 });
    a.g.place(makeItem("bone", 1), 5, 5);
    a.g.flush();
    expect(rows.map((r) => [r.x, r.owner, r.ownerUntil])).toEqual([[1, "P1", t0 + PARTY_LOOT_PRIORITY_MS], [3, "P2", t0 + 2000], [5, null, null]]);
    // Reinício 5 s depois: a reserva de P1 ainda vale, a de P2 já venceu (e some de vez, não fica como procedência).
    const b = mkWorld();
    b.w.advance(5000);
    expect(b.g.restore()).toBe(3);
    const at = (x: number) => b.g.get(b.g.at(x, x)[0]!)!;
    expect([at(1).owner, at(1).ownerUntil]).toEqual(["P1", t0 + PARTY_LOOT_PRIORITY_MS]);
    expect([at(3).owner, at(3).ownerUntil]).toEqual([undefined, undefined]);
    expect([at(5).owner, at(5).ownerUntil]).toEqual([undefined, undefined]);
  });
});

describe("ground: refino (ciclo 16)", () => {
  it("largar e pegar mantém o refino; o olhar mostra o nível; o estado sincronizado não leva", () => {
    const t = groundWorld();
    const p = t.add("p1", 5, 5, { level: 40 });
    const q = t.add("p2", 4, 4, { level: 40 });
    t.w.inv.addItem(p, { ...makeItem("katana"), refine: 3 });
    t.ground.onDrop(p, { from: { where: "backpack", index: 0 }, x: 4, y: 3 });
    const [e] = t.onTile(4, 3);
    expect(e!.item.refine).toBe(3);
    expect(Object.keys(t.collection.get(e!.state.id)!)).not.toContain("refine");
    t.ground.onLook(q, { groundId: e!.state.id });
    expect(t.w.sent.filter((s) => s.type === S2C.LookItem).at(-1)!.msg.item.refine).toBe(3);
    t.step();
    t.ground.onPickup(q, { groundId: e!.state.id });
    expect(t.bp("p2")[0]!.refine).toBe(3);
  });

  it("vai e volta do banco do chão; refino inválido no registro é limpo ao carregar", () => {
    const w = invWorld();
    let rows: GroundRecord[] = [];
    const store = { load: () => structuredClone(rows), save: (r: GroundRecord[]) => { rows = structuredClone(r); } };
    const make = () => new GroundSystem({
      inventory: w.inv, collection: new Map<string, GroundItemState>(), now: w.now, log: () => {}, store,
      canHold: (x, y) => MAP.isWalkable(x, y), seeThrough: (x, y) => MAP.isWalkable(x, y), send: () => {},
    });
    const g1 = make();
    g1.place({ ...makeItem("katana"), refine: 5 }, 4, 4);
    g1.place({ ...makeItem("mithril_plate"), refine: 2 }, 5, 5);
    g1.flush();
    rows.push({ x: 6, y: 6, item: { ...makeItem("katana"), refine: 9 }, expiresAt: w.now() + 60_000 });
    rows.push({ x: 1, y: 1, item: { ...makeItem("sword"), refine: 2 }, expiresAt: w.now() + 60_000 });
    const g2 = make();
    expect(g2.restore()).toBe(4);
    const one = (x: number, y: number) => g2.get(g2.at(x, y)[0]!)!.item;
    expect([one(4, 4).refine, one(5, 5).refine]).toEqual([5, 2]);
    expect(Object.keys(one(6, 6))).not.toContain("refine");
    expect(Object.keys(one(1, 1))).not.toContain("refine");
  });

  it("ouro acima do maxStack (1,5 mi da caveira vermelha, uma pilha só) volta inteiro do reinício e vai inteiro para quem pega", () => {
    const w = invWorld();
    let rows: GroundRecord[] = [];
    const store = { load: () => structuredClone(rows), save: (r: GroundRecord[]) => { rows = structuredClone(r); } };
    const make = () => new GroundSystem({
      inventory: w.inv, collection: new Map<string, GroundItemState>(), now: w.now, log: () => {}, store,
      canHold: (x, y) => MAP.isWalkable(x, y), seeThrough: (x, y) => MAP.isWalkable(x, y), send: () => {},
    });
    const g1 = make();
    g1.placeNear(makeItem("gold_coin", 1_500_000), 4, 4);
    g1.flush();
    const g2 = make();
    expect(g2.restore()).toBe(1);
    const id = g2.at(4, 4)[0]!;
    expect([g2.get(id)!.item.count, g2.get(id)!.state.count]).toEqual([1_500_000, 1_500_000]);
    const p = w.mk("p1");
    p.x = 4; p.y = 4;
    g2.onPickup(p, { groundId: id });
    expect(w.inv.gold("p1")).toBe(1_500_000);
  });
});

import { describe, expect, it } from "vitest";
import { MONSTER_REGEN_FULL_MS, S2C, type TiledMap } from "@lemonquest/shared";
import { RESPAWN_FORCE_AFTER_MS, RESPAWN_FORCE_DIST, RESPAWN_PLAYER_DIST, cheb, parseSafeZones, parseSpawns, type SpawnPoint } from "./monsters.ts";
import { LEASH_DIST, LOST_TARGET_MS } from "./ai.ts";
import { def, grid, openGrid, player, world } from "./testkit.ts";

const sp = (x: number, y: number, count = 1, radius = 2, defId = "dummy"): SpawnPoint => ({ defId, x, y, count, radius });

describe("spawns", () => {
  it("parses monster_spawn and PZ zone objects from Tiled", () => {
    const map = {
      width: 10, height: 10, tilewidth: 16, tileheight: 16, tilesets: [],
      layers: [{ name: "objects", type: "objectgroup", objects: [
        { id: 1, name: "rat", type: "monster_spawn", x: 32, y: 48, width: 0, height: 0,
          properties: [{ name: "monster", type: "string", value: "rat" }, { name: "count", type: "int", value: 4 }, { name: "radius", type: "int", value: 5 }] },
        { id: 2, name: "Vila de Pedra Clara", type: "zone", x: 16, y: 32, width: 64, height: 32 },
        { id: 3, name: "Floresta", type: "zone", x: 0, y: 0, width: 64, height: 32 },
      ] }],
    } as TiledMap;
    expect(parseSpawns(map)).toEqual([{ defId: "rat", x: 2, y: 3, count: 4, radius: 5 }]);
    expect(parseSafeZones(map)).toEqual([{ x0: 1, y0: 2, x1: 4, y1: 3 }]);
  });

  it("keeps count alive inside the radius, on walkable unoccupied tiles, never in PZ or portals", () => {
    const g = grid([
      "..........",
      "..##......",
      "..##......",
      "..........",
      "..........",
      "..........",
    ]);
    const { mm } = world({
      grid: g, spawns: [sp(3, 3, 12, 2)], defs: () => def(),
      safeZones: [{ x0: 4, y0: 0, x1: 9, y1: 5 }], portals: [{ x: 1, y: 3 }],
    });
    mm.spawnAll();
    const ms = [...mm.all()];
    // Tiles válidos: x 1..3, y 1..5 (raio 2), menos 4 paredes, menos portal = 15-4-1 = 10.
    expect(ms.length).toBe(10);
    const seen = new Set<string>();
    for (const m of ms) {
      expect(cheb(m.s.x, m.s.y, 3, 3)).toBeLessThanOrEqual(2);
      expect(g.isWalkable(m.s.x, m.s.y)).toBe(true);
      expect(mm.inPz(m.s.x, m.s.y)).toBe(false);
      expect(m.s.x === 1 && m.s.y === 3).toBe(false);
      seen.add(`${m.s.x},${m.s.y}`);
      expect(mm.monsterAt(m.s.x, m.s.y)).toBe(m);
    }
    expect(seen.size).toBe(10);
    expect(mm.pendingRespawns).toBe(2); // os que não couberam tentam de novo depois
  });

  it("skips unknown defs, logging once", () => {
    const { mm, log } = world({ grid: openGrid(10, 10), spawns: [sp(5, 5, 2, 2, "nope"), sp(2, 2, 1, 1, "nope")], defs: () => undefined });
    mm.spawnAll();
    expect(mm.size).toBe(0);
    expect(log.length).toBe(1);
  });

  it("respawns after respawnMs, but not within 7 tiles of a player", () => {
    const w = world({ grid: openGrid(40, 10), spawns: [sp(5, 5, 1, 1)], defs: () => def({ respawnMs: 1000, aggroRange: 0 }) });
    w.mm.spawnAll();
    const m = [...w.mm.all()][0];
    w.mm.kill(m, w.now());
    expect(w.collection.size).toBe(0);
    const p = w.add(player("p", 4 + RESPAWN_PLAYER_DIST, 5));
    w.run(3000);
    expect(w.mm.size).toBe(0); // jogador perto → adia
    p.x = 30;
    w.run(6000);
    expect(w.mm.size).toBe(1);
    expect([...w.collection.keys()][0]).toMatch(/^m\d+$/);
  });

  it("jogador parado perto não trava o respawn para sempre: passada a espera, nasce, mas a mais de 3 tiles", () => {
    const w = world({ grid: openGrid(40, 10), spawns: [sp(5, 5, 1, 4)], defs: () => def({ respawnMs: 1000, aggroRange: 0 }) });
    w.mm.spawnAll();
    const m = [...w.mm.all()][0];
    w.mm.kill(m, w.now());
    const p = w.add(player("p", 5, 5)); // parado no centro do spawn
    w.run(RESPAWN_FORCE_AFTER_MS - 2000);
    expect(w.mm.size).toBe(0); // ainda dentro da espera normal
    w.run(10_000);
    expect(w.mm.size).toBe(1);
    const born = [...w.mm.all()][0]!;
    expect(cheb(born.s.x, born.s.y, p.x, p.y)).toBeGreaterThan(RESPAWN_FORCE_DIST);
  });

  it("chefe não usa o respawn forçado (segue só a regra de 7 tiles)", () => {
    const w = world({ grid: openGrid(40, 10), spawns: [sp(5, 5, 1, 4)], defs: () => def({ respawnMs: 1000, aggroRange: 0, boss: true, name: "Rei" }) });
    w.mm.spawnAll();
    w.mm.kill([...w.mm.all()][0]!, w.now());
    w.add(player("p", 5, 5));
    w.run(RESPAWN_FORCE_AFTER_MS + 20_000);
    expect(w.mm.size).toBe(0);
  });

  it("callBoss: convoca o chefe no spawn dele, avisa, não duplica e cancela o respawn pendente", () => {
    const notices: string[] = [];
    const w = world({ grid: openGrid(30, 10), spawns: [sp(5, 5, 1, 1, "rei")], defs: () => def({ id: "rei", boss: true, name: "Rei", respawnMs: 7_200_000, aggroRange: 0 }), notice: (t) => notices.push(t) });
    w.mm.spawnAll();
    expect(notices).toEqual(["Rei apareceu!"]);
    expect(w.mm.callBoss("rei", w.now())).toBe("alive"); // já está vivo
    w.mm.kill([...w.mm.all()][0]!, w.now());
    expect(w.mm.pendingRespawns).toBe(1); // volta só daqui a 2 h
    expect(w.mm.callBoss("rei", w.now())).toBe("spawned");
    expect(w.mm.size).toBe(1);
    expect(w.mm.pendingRespawns).toBe(0); // o respawn de 2 h foi cancelado
    expect(notices).toEqual(["Rei apareceu!", "Rei apareceu!"]);
    expect(w.mm.callBoss("rei", w.now())).toBe("alive");
    expect(w.mm.callBoss("outro", w.now())).toBe("unknown"); // sem spawn desse monstro
  });

  it("respawn de chefe sobrevive a reinício (ciclo 14): o boot respeita o prazo gravado", () => {
    const kv = new Map<string, number | null>();
    const bossRespawn = { load: (id: string) => kv.get(id) ?? undefined, save: (id: string, at: number | null) => { kv.set(id, at); } };
    const opts = { grid: openGrid(30, 10), spawns: [sp(5, 5, 1, 1, "rei")], defs: () => def({ id: "rei", boss: true, name: "Rei", respawnMs: 7_200_000, aggroRange: 0 }), bossRespawn };
    const w = world(opts);
    w.mm.spawnAll();
    expect(kv.get("rei")).toBeNull(); // vivo: sem prazo
    w.mm.kill([...w.mm.all()][0]!, w.now());
    expect(kv.get("rei")).toBe(w.now() + 7_200_000);
    // "Reinício" 1 h depois (cada mundo de teste começa no mesmo relógio): o chefe não nasce no boot, só no prazo original.
    const w2 = world(opts);
    w2.run(3_600_000);
    w2.mm.spawnAll();
    expect(w2.mm.size).toBe(0);
    expect(w2.mm.pendingRespawns).toBe(1);
    w2.run(3_600_000 + 1_000);
    expect(w2.mm.size).toBe(1);
    expect(kv.get("rei")).toBeNull();
    // Prazo vencido durante o reinício: nasce no boot.
    w2.mm.kill([...w2.mm.all()][0]!, w2.now());
    const w3 = world(opts);
    w3.run(kv.get("rei")! - w3.now() + 1_000);
    w3.mm.spawnAll();
    expect(w3.mm.size).toBe(1);
  });

  it("callBoss ignora cópias do Coliseu, da alavanca e de invocador (ciclo 14)", () => {
    const rei = def({ id: "rei", boss: true, name: "Rei", respawnMs: 7_200_000, aggroRange: 0 });
    const w = world({ grid: openGrid(40, 20), spawns: [sp(5, 5, 1, 1, "rei")], defs: () => rei });
    w.mm.spawnAll();
    w.mm.kill([...w.mm.all()][0]!, w.now());
    w.mm.spawnQuest(rei, 30, 15, { leverId: "x", bounds: { x0: 25, y0: 10, x1: 35, y1: 19 } });
    expect(w.mm.size).toBe(1); // só a cópia da sala de quest
    expect(w.mm.callBoss("rei", w.now())).toBe("spawned");
    expect(w.mm.size).toBe(2);
  });

  it("announces bosses globally", () => {
    const notices: string[] = [];
    const w2 = world({ grid: openGrid(10, 10), spawns: [sp(5, 5)], defs: () => def({ boss: true, name: "Rei" }), notice: (t) => notices.push(t) });
    w2.mm.spawnAll();
    expect(notices).toEqual(["Rei apareceu!"]);
  });
});

describe("monster AI", () => {
  it("sleeps without players nearby (no wandering)", () => {
    const w = world({ grid: openGrid(60, 10), spawns: [sp(5, 5, 1, 0)], defs: () => def() });
    w.mm.spawnAll();
    const m = [...w.mm.all()][0];
    w.add(player("far", 50, 5));
    w.run(10_000);
    expect(m.sleeping).toBe(true);
    expect([m.s.x, m.s.y]).toEqual([5, 5]);
  });

  it("wanders within radius+3 of the spawn when awake", () => {
    const w = world({ grid: openGrid(30, 30), spawns: [sp(15, 15, 1, 1)], defs: () => def({ aggroRange: 0 }) });
    w.mm.spawnAll();
    const m = [...w.mm.all()][0];
    w.add(player("p", 15, 28));
    const visited = new Set<string>();
    w.run(120_000, () => {
      visited.add(`${m.s.x},${m.s.y}`);
      expect(cheb(m.s.x, m.s.y, 15, 15)).toBeLessThanOrEqual(4);
    });
    expect(visited.size).toBeGreaterThan(3);
  });

  it("aggro picks the nearest player in range and chases to melee distance, then attacks", () => {
    const w = world({ grid: openGrid(30, 30), spawns: [sp(10, 10, 1, 0)], defs: () => def({ aggroRange: 8, damage: [3, 3] }) });
    w.mm.spawnAll();
    const m = [...w.mm.all()][0];
    const near = w.add(player("near", 14, 10));
    w.add(player("far", 10, 16));
    w.run(300);
    expect(m.s.targetId).toBe("near");
    w.run(3000);
    expect(cheb(m.s.x, m.s.y, near.x, near.y)).toBe(1);
    const hits = w.sent.filter((s) => s.type === S2C.Combat).flatMap((s) => s.msg.events);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]).toMatchObject({ sourceId: m.s.id, targetId: "near", amount: 3, kind: "physical" });
    expect(hits[0].ranged).toBeUndefined();
    expect(near.hp).toBeLessThan(150);
  });

  it("ranged monsters keep ~attackRange-1 distance and shoot with ranged: true", () => {
    const w = world({ grid: openGrid(40, 20), spawns: [sp(20, 10, 1, 0)], defs: () => def({ aggroRange: 8, attackRange: 4 }) });
    w.mm.spawnAll();
    const m = [...w.mm.all()][0];
    const p = w.add(player("p", 22, 10)); // perto demais
    w.run(3000);
    const d = cheb(m.s.x, m.s.y, p.x, p.y);
    expect(d).toBeGreaterThanOrEqual(3);
    expect(d).toBeLessThanOrEqual(4);
    const ev = w.sent.filter((s) => s.type === S2C.Combat).flatMap((s) => s.msg.events);
    expect(ev.length).toBeGreaterThan(0);
    expect(ev.every((e: any) => e.ranged === true)).toBe(true);
  });

  it("passive monsters only retaliate", () => {
    const w = world({ grid: openGrid(20, 20), spawns: [sp(10, 10, 1, 0)], defs: () => def({ aggroRange: 0, hp: 1000 }) });
    w.mm.spawnAll();
    const m = [...w.mm.all()][0];
    const p = w.add(player("p", 11, 10));
    w.run(2000);
    expect(m.mode).toBe("idle");
    expect(p.hp).toBe(150);
    w.combat.onAttack(p, { targetId: m.s.id });
    w.run(1500);
    expect(m.mode).toBe("chase");
    expect(m.s.targetId).toBe("p");
    expect(p.hp).toBeLessThan(150);
  });

  it("flees below fleeAtHpPct", () => {
    const w = world({ grid: openGrid(30, 30), spawns: [sp(15, 15, 1, 0)], defs: () => def({ fleeAtHpPct: 0.5, hp: 100 }) });
    w.mm.spawnAll();
    const m = [...w.mm.all()][0];
    const p = w.add(player("p", 16, 15));
    w.run(300);
    m.s.hp = 20;
    w.run(1500);
    expect(m.mode).toBe("flee");
    expect(cheb(m.s.x, m.s.y, p.x, p.y)).toBeGreaterThan(2);
  });

  it("leash: past 14 tiles from spawn it returns and regenerates gradually (full after MONSTER_REGEN_FULL_MS)", () => {
    const w = world({ grid: openGrid(60, 10), spawns: [sp(5, 5, 1, 1)], defs: () => def({ aggroRange: 8, hp: 100, stepMs: 100 }) });
    w.mm.spawnAll();
    const m = [...w.mm.all()][0];
    const p = w.add(player("p", 9, 5));
    w.run(300);
    m.s.hp = 50;
    // Jogador foge para longe; o monstro persegue até passar da coleira.
    for (let i = 0; i < 40; i++) { p.x = Math.min(55, p.x + 1); w.run(150); }
    expect(m.mode === "return" || m.mode === "idle").toBe(true);
    const hpAtReturn = m.s.hp;
    w.run(2000);
    expect(m.s.hp).toBeGreaterThan(hpAtReturn); // já subindo no caminho
    expect(m.s.hp).toBeLessThan(100); // mas não de uma vez
    w.run(MONSTER_REGEN_FULL_MS);
    expect(m.mode).toBe("idle");
    expect(cheb(m.s.x, m.s.y, 5, 5)).toBeLessThanOrEqual(1);
    expect(m.s.hp).toBe(100);
    expect(LEASH_DIST).toBe(14);
  });

  it("returns when the target is in PZ for 5s", () => {
    const w = world({
      grid: openGrid(30, 10), spawns: [sp(5, 5, 1, 1)], defs: () => def({ aggroRange: 8 }),
      safeZones: [{ x0: 12, y0: 0, x1: 29, y1: 9 }],
    });
    w.mm.spawnAll();
    const m = [...w.mm.all()][0];
    const p = w.add(player("p", 9, 5));
    w.run(300);
    expect(m.mode).toBe("chase");
    p.x = 13; // entrou na PZ
    w.run(LOST_TARGET_MS - 500);
    expect(m.mode).toBe("chase");
    w.run(1500);
    expect(["return", "idle"]).toContain(m.mode);
    // Nunca pisa na PZ.
    w.run(5000, () => expect(m.s.x).toBeLessThan(12));
    expect(p.hp).toBe(150);
  });

  it("monsters and players block each other", () => {
    const w = world({ grid: openGrid(10, 3), spawns: [sp(5, 1, 1, 0)], defs: () => def({ aggroRange: 0 }) });
    w.mm.spawnAll();
    const m = [...w.mm.all()][0];
    expect(w.mm.isMonsterAt(5, 1)).toBe(true);
    w.add(player("p", 6, 1));
    w.mm.playerList = [...w.players.values()];
    expect(w.mm.tryStep(m, 2 /* E */, w.now())).toBe(false);
    expect(w.mm.tryStep(m, 6 /* W */, w.now())).toBe(true);
    expect(w.mm.isMonsterAt(5, 1)).toBe(false);
    expect(w.mm.isMonsterAt(4, 1)).toBe(true);
    expect(m.s.stepMs).toBe(200);
  });
});

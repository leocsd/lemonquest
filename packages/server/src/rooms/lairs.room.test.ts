import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PARTY_SHARE_RANGE, monsterDef } from "@lemonquest/shared";
import { WorldRoom } from "./WorldRoom.ts";
import { createAccountWithCharacter, initDb } from "../persistence/db.ts";
import { resetAuthState, type AuthData } from "../persistence/auth.ts";

// Covis (ciclo 16) com a sala e o MAPA REAL: o abate do chefe que destranca o baú usa o crédito do passo "boss" de
// missão (WorldRoom.questCredit → QuestSystem.onKill). O evento "kill" das conquistas não serve: vai só para quem bateu
// (o curandeiro do grupo ficaria de fora) e conta o Coliseu, onde o Shogun é chefe de onda.
const rooms: any[] = [];
function makeRoom(): any {
  const r = new WorldRoom() as any;
  r["__init"]();
  r.onCreate({});
  rooms.push(r);
  return r;
}
const auth = (name: string): AuthData => ({ name, key: name.toLowerCase(), weakPassword: false });
function join(r: any, sid: string, name: string) {
  createAccountWithCharacter(name, "h", "s", "knight");
  const c = { sessionId: sid, send: vi.fn(), leave: vi.fn() } as any;
  r.clients.push(c);
  r.onJoin(c, {}, auth(name));
  return r.state.players.get(sid);
}
const killMonster = (r: any, m: any) => r.combat["killMonster"](m, Date.now());

beforeEach(() => {
  initDb(":memory:");
  resetAuthState();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  while (rooms.length) { const r = rooms.pop(); r.clock.clear(); clearInterval(r._simulationInterval); r.onDispose(); }
  vi.restoreAllMocks();
});

describe("covis: abate do chefe registrado com o crédito do passo de missão", () => {
  it("quem bateu e o curandeiro do grupo perto registram; o membro longe e quem não é do grupo, não", () => {
    const r = makeRoom();
    const boss = [...r.monsters.all()].find((m: any) => m.def.id === "lair_shogun" && !m.arenaId);
    expect(boss).toBeTruthy();
    const hitter = join(r, "a1", "Ana"), healer = join(r, "b1", "Bia"), far = join(r, "c1", "Caio"), stranger = join(r, "d1", "Duda");
    r.party.invite(hitter, "b1"); r.party.accept(healer, "a1");
    r.party.invite(hitter, "c1"); r.party.accept(far, "a1");
    for (const [p, dx] of [[hitter, 1], [healer, 3], [stranger, -2]] as const) { p.x = boss.s.x + dx; p.y = boss.s.y; }
    far.x = boss.s.x + PARTY_SHARE_RANGE + 5; far.y = boss.s.y;
    boss.damageBy.set("a1", 45_000);
    killMonster(r, boss);
    expect(["a1", "b1", "c1", "d1"].map((id) => r.quests.bossSlain(id, "lair_shogun"))).toEqual([true, true, false, false]);
  });

  it("o Shogun do Coliseu (monstro de arena) não conta", () => {
    const r = makeRoom();
    const p = join(r, "a1", "Ana");
    const rect = r.arena.arenas[0].rect;
    let at: { x: number; y: number } | null = null;
    for (let y = rect.y0; y <= rect.y1 && !at; y++) for (let x = rect.x0; x <= rect.x1 && !at; x++) if (r.map.grid.isWalkable(x, y)) at = { x, y };
    const m = r.monsters.spawnArena(monsterDef("lair_shogun")!, at!.x, at!.y, { arenaId: 1, bounds: rect, allow: () => true });
    p.x = m.s.x + 1; p.y = m.s.y;
    m.damageBy.set("a1", 45_000);
    const onKill = vi.spyOn(r.quests, "onKill");
    killMonster(r, m);
    expect(onKill).toHaveBeenCalledWith("lair_shogun", []); // o abate passou pela sala, sem crédito de missão
    expect(r.quests.bossSlain("a1", "lair_shogun")).toBe(false);
  });
});

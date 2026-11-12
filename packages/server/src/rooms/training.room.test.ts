import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLOSE_TRAINING, S2C, statueDistance } from "@lemonquest/shared";
import { WorldRoom } from "./WorldRoom.ts";
import { createAccountWithCharacter as createAccount, getCharacterByName, initDb, saveCharacter } from "../persistence/db.ts";
import { resetAuthState, type AuthData } from "../persistence/auth.ts";

// Sala real (mapa real), fora do matchmaker; a estátua é injetada ao lado do spawn (a do mapa real não é necessária).
const rooms: any[] = [];
function makeRoom(): any {
  const r = new WorldRoom() as any;
  r["__init"]();
  r.onCreate({});
  const sp = r.spawnPoint;
  r.training.o.statues.length = 0;
  r.training.o.statues.push({ id: "s1", x: sp.x + 1, y: sp.y });
  rooms.push(r);
  return r;
}
function dispose(r: any) {
  r.clock.clear();
  clearInterval(r._simulationInterval);
  r.onDispose();
}
function fakeClient(r: any, sessionId: string) {
  const c = { sessionId, send: vi.fn(), leave: vi.fn() } as any;
  r.clients.push(c);
  return c;
}
const auth = (name: string): AuthData => ({ name, key: name.toLowerCase() }) as AuthData;
const sentOf = (c: any, type: string) => c.send.mock.calls.filter(([t]: [string]) => t === type).map(([, m]: [string, any]) => m);

beforeEach(() => {
  initDb(":memory:");
  resetAuthState();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  while (rooms.length) dispose(rooms.pop());
  vi.restoreAllMocks();
});

describe("WorldRoom: treino offline", () => {
  it("TrainOffline: salva offlineTraining e desconecta com CLOSE_TRAINING; o registro persiste", () => {
    const r = makeRoom();
    createAccount("Leo", "h", "s", "knight");
    const c = fakeClient(r, "s1");
    r.onJoin(c, {}, auth("Leo"));
    const p = r.state.players.get("s1");
    p.x = r.spawnPoint.x; p.y = r.spawnPoint.y;
    const before = Date.now();
    r.startOfflineTraining(p, { skill: "melee" }, c);
    expect(c.leave).toHaveBeenCalledWith(CLOSE_TRAINING, "Treinando offline");
    expect(r.kicked.has("s1")).toBe(true); // fechamento do servidor: onDrop/onLeave tiram na hora
    const saved = getCharacterByName("Leo")!.data.offlineTraining!;
    expect(saved).toMatchObject({ skill: "melee", statueId: "s1" });
    expect(saved.sinceMs).toBeGreaterThanOrEqual(before);
    r.onLeave(c, CLOSE_TRAINING); // o fechamento chega depois: salva de novo sem perder o treino
    expect(getCharacterByName("Leo")!.data.offlineTraining).toEqual(saved);
  });

  it("TrainOffline longe da estátua: nada é salvo e não desconecta", () => {
    const r = makeRoom();
    createAccount("Ana", "h", "s", "druid");
    const c = fakeClient(r, "a1");
    r.onJoin(c, {}, auth("Ana"));
    const p = r.state.players.get("a1");
    p.x = r.spawnPoint.x + 6; p.y = r.spawnPoint.y;
    r.startOfflineTraining(p, { skill: "magic" }, c);
    expect(c.leave).not.toHaveBeenCalled();
    expect(getCharacterByName("Ana")!.data.offlineTraining).toBeUndefined();
  });

  it("onDrop do treino fechado pelo servidor não reserva reconexão; o mesmo código forjado pelo cliente reserva", () => {
    const r = makeRoom();
    createAccount("Bia", "h", "s", "paladin");
    const c = fakeClient(r, "b1");
    r.onJoin(c, {}, auth("Bia"));
    const allow = vi.spyOn(r, "allowReconnection").mockImplementation(() => Object.assign(new Promise(() => {}), { reject: vi.fn() }) as any);
    r.onDrop(c, CLOSE_TRAINING); // ws.close(4101) no console: vale como queda comum
    expect(allow).toHaveBeenCalledTimes(1);
    r.kicked.add("b1"); // o que startOfflineTraining faz antes do c.leave(CLOSE_TRAINING)
    r.onDrop(c, CLOSE_TRAINING);
    expect(allow).toHaveBeenCalledTimes(1);
  });

  it("ao voltar: aplica o progresso, limpa, cura tudo, põe ao lado da estátua e envia TrainingResult", () => {
    const r = makeRoom();
    createAccount("Caio", "h", "s", "druid");
    const rec = getCharacterByName("Caio")!;
    saveCharacter({
      ...rec, x: null, y: null,
      data: { ...rec.data, hp: 5, mana: 1, offlineTraining: { skill: "magic", sinceMs: Date.now() - (3 * 60 + 12) * 60_000, statueId: "s1" } },
    });
    const c = fakeClient(r, "c1");
    r.onJoin(c, {}, auth("Caio"));
    const p = r.state.players.get("c1");
    const [res] = sentOf(c, S2C.TrainingResult);
    expect(res).toMatchObject({ skill: "magic", minutes: 192 });
    expect(res.levelsGained).toBeGreaterThan(0);
    expect(res.newLevel).toBe(p.magicLevel);
    expect(p.hp).toBe(p.maxHp);
    expect(p.mana).toBe(p.maxMana);
    const st = r.training.statues[0];
    expect(statueDistance(st, p.x, p.y)).toBe(1);
    expect(r.records.get("c1").data.offlineTraining).toBeUndefined();
    r.onLeave(c, 4000);
    expect(getCharacterByName("Caio")!.data.offlineTraining).toBeUndefined();
    expect(getCharacterByName("Caio")!.data.skills!.magic!.level).toBe(res.newLevel);
  });

  it("entrar antes de 1 minuto: progresso 0, mas o treino é encerrado", () => {
    const r = makeRoom();
    createAccount("Davi", "h", "s", "knight");
    const rec = getCharacterByName("Davi")!;
    saveCharacter({ ...rec, data: { ...rec.data, offlineTraining: { skill: "melee", sinceMs: Date.now() - 20_000, statueId: "s1" } } });
    const c = fakeClient(r, "d1");
    r.onJoin(c, {}, auth("Davi"));
    expect(sentOf(c, S2C.TrainingResult)[0]).toMatchObject({ skill: "melee", minutes: 0, levelsGained: 0, newLevel: 10 });
    expect(r.records.get("d1").data.offlineTraining).toBeUndefined();
  });

  it("sem treino pendente não há TrainingResult", () => {
    const r = makeRoom();
    createAccount("Eva", "h", "s", "knight");
    const c = fakeClient(r, "e1");
    r.onJoin(c, {}, auth("Eva"));
    expect(sentOf(c, S2C.TrainingResult)).toHaveLength(0);
  });

  it("mapa real: estátuas, 9 bonecos dentro da PZ (pz por propriedade)", () => {
    const r = new WorldRoom() as any;
    r["__init"]();
    r.onCreate({});
    rooms.push(r);
    expect(r.training.statues.length).toBeGreaterThanOrEqual(8);
    const dummies = [...r.monsters.all()].filter((m: any) => m.def.id === "training_dummy");
    expect(dummies.length).toBe(9);
    for (const d of dummies) expect(r.monsters.inPz(d.s.x, d.s.y)).toBe(true);
  });
});

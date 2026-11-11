import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { C2S } from "@lemonquest/shared";
import { WorldRoom } from "../rooms/WorldRoom.ts";
import { createAccountWithCharacter as createAccount, saveCharacter, getCharacterByName, initDb } from "../persistence/db.ts";
import { resetAuthState, type AuthData } from "../persistence/auth.ts";
import { loadMount, validateSetMount } from "./mount.ts";

const rooms: any[] = [];
function makeRoom(): any {
  const r = new WorldRoom() as any;
  r["__init"]();
  r.onCreate({});
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
const send = (r: any, c: any, type: string, m: unknown) => r.onMessageEvents.emit(type, c, m);

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

describe("montaria: validação", () => {
  it("aceita ids de MOUNT_LIST e \"\" (sem montaria); recusa o resto", () => {
    expect(validateSetMount({ mount: "pony" })).toBe("pony");
    expect(validateSetMount({ mount: "" })).toBe("");
    for (const bad of [null, 1, "pony", {}, { mount: "inexistente" }, { mount: 5 }, { mount: "__proto__" }])
      expect(validateSetMount(bad), JSON.stringify(bad)).toBeNull();
  });

  it("personagem legado (sem campo) ou com id desconhecido anda a pé", () => {
    const rec = createAccount("VelhoCavaleiro", "h", "s", "knight");
    rec.data = {};
    expect(loadMount(rec)).toBe("");
    rec.data = { mount: "sumiu" };
    expect(loadMount(rec)).toBe("");
    rec.data = { mount: "pony" };
    expect(loadMount(rec)).toBe("pony");
  });
});

describe("montaria: sala", () => {
  it("SetMount muda o estado (todos veem), persiste e volta ao entrar de novo", () => {
    const r = makeRoom();
    const leo = createAccount("Leo2", "h", "s", "knight");
    saveCharacter(leo);
    const c = fakeClient(r, "s1");
    r.onJoin(c, {}, auth("Leo2"));
    const p = r.state.players.get("s1");
    expect(p.mount).toBe("");

    send(r, c, C2S.SetMount, { mount: "pony" });
    expect(p.mount).toBe("pony");

    send(r, c, C2S.SetMount, { mount: "inexistente" }); // inválido: ignora (ainda dentro do limite de 2/s)
    expect(p.mount).toBe("pony");

    r.onLeave(c, 4000);
    expect(getCharacterByName("Leo2")!.data).toMatchObject({ mount: "pony" });
    const c2 = fakeClient(r, "s2");
    r.onJoin(c2, {}, auth("Leo2"));
    expect(r.state.players.get("s2")).toMatchObject({ mount: "pony" });
  });

  it("limite de 2 trocas por segundo (excesso descartado)", () => {
    const r = makeRoom();
    const bia = createAccount("Bia2", "h", "s", "paladin");
    saveCharacter(bia);
    const c = fakeClient(r, "b1");
    r.onJoin(c, {}, auth("Bia2"));
    const p = r.state.players.get("b1");
    send(r, c, C2S.SetMount, { mount: "pony" });
    send(r, c, C2S.SetMount, { mount: "" });
    send(r, c, C2S.SetMount, { mount: "pony" });
    expect(p.mount).toBe("");
  });
});

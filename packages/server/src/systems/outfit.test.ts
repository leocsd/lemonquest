import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { C2S, DEFAULT_OUTFIT } from "@lemonquest/shared";
import { WorldRoom } from "../rooms/WorldRoom.ts";
import { addAccountTone, createAccountWithCharacter as createAccount, getAccountTones, getCharacterByName, hasMount, initDb, saveCharacter, unlockMount } from "../persistence/db.ts";
import { handleCreateCharacter, handleLogin, resetAuthState, type AuthData } from "../persistence/auth.ts";
import { isOutfitUnlocked, loadOutfit, validateSetOutfit } from "./outfit.ts";

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

describe("outfit: validação", () => {
  it("aceita ids do catálogo e bits 0..3; recusa o resto", () => {
    const rec = createAccount("Validador", "h", "s", "sorcerer");
    rec.data.unlocks = ["addon:mago:1", "addon:mago:2"];
    expect(validateSetOutfit({ outfit: "mago", addons: 3 }, rec)).toEqual({ outfit: "mago", addons: 3, tone: "", mount: false });
    expect(validateSetOutfit({ outfit: "cidadao", addons: 0 }, rec)).toEqual({ outfit: "cidadao", addons: 0, tone: "", mount: false });
    for (const bad of [
      null, 1, "mago", {}, { outfit: "mago" }, { outfit: "xx", addons: 0 }, { outfit: "mago", addons: 4 },
      { outfit: "mago", addons: -1 }, { outfit: "mago", addons: 1.5 }, { outfit: "mago", addons: "3" },
      { outfit: "__proto__", addons: 0 }, { outfit: "toString", addons: 0 }, { outfit: 5, addons: 0 },
    ]) expect(validateSetOutfit(bad, rec), JSON.stringify(bad)).toBeNull();
  });

  it("liberados de saída: roupa padrão da vocação e Cidadão (addons nunca); o resto vem de rec.data.unlocks", () => {
    const rec = createAccount("Gate", "h", "s", "sorcerer");
    expect(isOutfitUnlocked(rec, "mago", 0)).toBe(true);
    expect(isOutfitUnlocked(rec, "cidadao", 0)).toBe(true);
    expect(isOutfitUnlocked(rec, "mago", 1)).toBe(false);
    expect(isOutfitUnlocked(rec, "cidadao", 2)).toBe(false);
    expect(isOutfitUnlocked(rec, "pirata", 0)).toBe(false);
    expect(isOutfitUnlocked(rec, "cavaleiro", 0)).toBe(false); // padrão de OUTRA vocação
    rec.data.unlocks = ["outfit:pirata", "addon:mago:2"];
    expect(isOutfitUnlocked(rec, "pirata", 0)).toBe(true);
    expect(isOutfitUnlocked(rec, "pirata", 1)).toBe(false);
    expect(isOutfitUnlocked(rec, "mago", 2)).toBe(true);
    expect(isOutfitUnlocked(rec, "mago", 1)).toBe(false);
    expect(isOutfitUnlocked(rec, "inexistente", 0)).toBe(false);
    expect(isOutfitUnlocked(undefined, "mago", 0)).toBe(false);
    expect(validateSetOutfit({ outfit: "pirata", addons: 0 }, rec)).toEqual({ outfit: "pirata", addons: 0, tone: "", mount: false });
    expect(validateSetOutfit({ outfit: "pirata", addons: 1 }, rec)).toBeNull(); // addon bloqueado
    expect(validateSetOutfit({ outfit: "nobre", addons: 0 }, rec)).toBeNull(); // roupa bloqueada
  });

  it("tom de tingimento: só aceita id do catálogo liberado NA CONTA; vazio sempre vale (cor natural)", () => {
    const rec = createAccount("Tingidor", "h", "s", "knight");
    expect(validateSetOutfit({ outfit: "cavaleiro", addons: 0, tone: "crimson" }, rec, [])).toBeNull(); // não liberado
    expect(validateSetOutfit({ outfit: "cavaleiro", addons: 0, tone: "inexistente" }, rec, ["inexistente"])).toBeNull(); // nem no catálogo
    expect(validateSetOutfit({ outfit: "cavaleiro", addons: 0, tone: "" }, rec, [])).toEqual({ outfit: "cavaleiro", addons: 0, tone: "", mount: false });
    expect(validateSetOutfit({ outfit: "cavaleiro", addons: 0, tone: "crimson" }, rec, ["crimson"])).toEqual({ outfit: "cavaleiro", addons: 0, tone: "crimson", mount: false });
  });

  it("montaria: só aceita mount:true se a conta tiver liberado (ownsMount)", () => {
    const rec = createAccount("Cavaleiro", "h", "s", "knight");
    expect(validateSetOutfit({ outfit: "cavaleiro", addons: 0, mount: true }, rec)).toBeNull(); // não liberada
    expect(validateSetOutfit({ outfit: "cavaleiro", addons: 0, mount: true }, rec, [], true)).toEqual({ outfit: "cavaleiro", addons: 0, tone: "", mount: true });
    expect(validateSetOutfit({ outfit: "cavaleiro", addons: 0, mount: false }, rec, [], true)).toEqual({ outfit: "cavaleiro", addons: 0, tone: "", mount: false });
  });

  it("tons por conta: addAccountTone é idempotente e getAccountTones reflete a conta certa", () => {
    const a = createAccount("ContaA", "h", "s", "knight");
    const b = createAccount("ContaB", "h", "s", "knight");
    expect(getAccountTones(a.accountId)).toEqual([]);
    expect(addAccountTone(a.accountId, "gold")).toEqual(["gold"]);
    expect(addAccountTone(a.accountId, "gold")).toEqual(["gold"]); // não duplica
    expect(addAccountTone(a.accountId, "rose")).toEqual(["gold", "rose"]);
    expect(getAccountTones(a.accountId)).toEqual(["gold", "rose"]);
    expect(getAccountTones(b.accountId)).toEqual([]); // conta separada
  });

  it("personagem legado (sem campo) usa a roupa padrão da vocação; id inválido também", () => {
    const rec = createAccount("Velho", "h", "s", "sorcerer");
    rec.data = {};
    expect(loadOutfit(rec)).toEqual({ outfit: "mago", addons: 0 });
    rec.data = { outfit: "sumiu", addons: 3 };
    expect(loadOutfit(rec)).toEqual({ outfit: "mago", addons: 0 });
    rec.data = { outfit: "pirata", addons: 7 };
    expect(loadOutfit(rec)).toEqual({ outfit: "pirata", addons: 3 });
  });
});

describe("outfit: criação de personagem", () => {
  it("novo personagem nasce com a roupa padrão da vocação (e aparece no resumo da conta)", async () => {
    const a = await handleLogin({ account: "conta1", password: "segredo1", create: true });
    if (!a.ok) throw new Error("login");
    for (const [name, voc] of [["Kai", "knight"], ["Pala", "paladin"], ["Sora", "sorcerer"], ["Dru", "druid"]] as const) {
      const r = handleCreateCharacter({ session: a.session, name, vocation: voc });
      if (!r.ok) throw new Error(r.error);
      expect(getCharacterByName(name)!.data).toMatchObject({ outfit: DEFAULT_OUTFIT[voc], addons: 0 });
      expect(r.characters.find((c) => c.name === name)).toMatchObject({ outfit: DEFAULT_OUTFIT[voc], addons: 0 });
    }
  });
});

describe("outfit: sala", () => {
  it("SetOutfit muda o estado (todos veem), persiste e volta ao entrar de novo", () => {
    const r = makeRoom();
    const leo = createAccount("Leo", "h", "s", "knight");
    leo.data.ach = { done: {}, stats: {}, killed: [] };
    leo.data.unlocks = ["outfit:mago", "addon:mago:1", "addon:mago:2"];
    saveCharacter(leo);
    const c = fakeClient(r, "s1");
    r.onJoin(c, {}, auth("Leo"));
    const p = r.state.players.get("s1");
    expect(p.outfit).toBe("cavaleiro");
    expect(p.addons).toBe(0);

    send(r, c, C2S.SetOutfit, { outfit: "mago", addons: 3 });
    expect(p.outfit).toBe("mago");
    expect(p.addons).toBe(3);

    send(r, c, C2S.SetOutfit, { outfit: "nada", addons: 1 }); // inválido: ignora
    expect(p.outfit).toBe("mago");

    r.onLeave(c, 4000);
    expect(getCharacterByName("Leo")!.data).toMatchObject({ outfit: "mago", addons: 3 });
    const c2 = fakeClient(r, "s2");
    r.onJoin(c2, {}, auth("Leo"));
    expect(r.state.players.get("s2")).toMatchObject({ outfit: "mago", addons: 3 });
  });

  it("montaria: só liga com mount:true se a conta tiver liberado; persiste e volta ao entrar de novo", () => {
    const r = makeRoom();
    const mia = createAccount("Mia", "h", "s", "knight");
    saveCharacter(mia);
    const c = fakeClient(r, "m1");
    r.onJoin(c, {}, auth("Mia"));
    const p = r.state.players.get("m1");
    expect(p.mount).toBe(false);

    send(r, c, C2S.SetOutfit, { outfit: "cavaleiro", addons: 0, mount: true });
    expect(p.mount).toBe(false); // conta ainda não comprou

    unlockMount(mia.accountId);
    expect(hasMount(mia.accountId)).toBe(true);
    send(r, c, C2S.SetOutfit, { outfit: "cavaleiro", addons: 0, mount: true });
    expect(p.mount).toBe(true);

    r.onLeave(c, 4000);
    expect(getCharacterByName("Mia")!.data).toMatchObject({ mount: true });
    const c2 = fakeClient(r, "m2");
    r.onJoin(c2, {}, auth("Mia"));
    expect(r.state.players.get("m2")).toMatchObject({ mount: true });
  });

  it("legado sem roupa entra com a padrão da vocação", () => {
    const r = makeRoom();
    const rec = createAccount("Ana", "h", "s", "druid");
    rec.data = { hp: 10 };
    saveCharacter(rec);
    const c = fakeClient(r, "a1");
    r.onJoin(c, {}, auth("Ana"));
    expect(r.state.players.get("a1")).toMatchObject({ outfit: "druida", addons: 0 });
  });

  it("limite de 2 trocas por segundo (excesso descartado)", () => {
    const r = makeRoom();
    const bia = createAccount("Bia", "h", "s", "paladin");
    bia.data.ach = { done: {}, stats: {}, killed: [] };
    bia.data.unlocks = ["outfit:pirata", "outfit:nobre", "outfit:assassino", "addon:pirata:1", "addon:nobre:2", "addon:assassino:1", "addon:assassino:2"];
    saveCharacter(bia);
    const c = fakeClient(r, "b1");
    r.onJoin(c, {}, auth("Bia"));
    const p = r.state.players.get("b1");
    send(r, c, C2S.SetOutfit, { outfit: "pirata", addons: 1 });
    send(r, c, C2S.SetOutfit, { outfit: "nobre", addons: 2 });
    send(r, c, C2S.SetOutfit, { outfit: "assassino", addons: 3 });
    expect(p.outfit).toBe("nobre");
    expect(p.addons).toBe(2);
  });
});

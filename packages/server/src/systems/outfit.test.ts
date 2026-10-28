import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { C2S, DEFAULT_OUTFIT } from "@lemonquest/shared";
import { WorldRoom } from "../rooms/WorldRoom.ts";
import { addAccountTone, createAccountWithCharacter as createAccount, getAccountTones, getCharacterByName, initDb, saveCharacter } from "../persistence/db.ts";
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
    expect(validateSetOutfit({ outfit: "mago", addons: 3 }, rec)).toEqual({ outfit: "mago", addons: 3, tone: "", sex: "m" });
    expect(validateSetOutfit({ outfit: "cidadao", addons: 0 }, rec)).toEqual({ outfit: "cidadao", addons: 0, tone: "", sex: "m" });
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
    expect(validateSetOutfit({ outfit: "pirata", addons: 0 }, rec)).toEqual({ outfit: "pirata", addons: 0, tone: "", sex: "m" });
    expect(validateSetOutfit({ outfit: "pirata", addons: 1 }, rec)).toBeNull(); // addon bloqueado
    expect(validateSetOutfit({ outfit: "nobre", addons: 0 }, rec)).toBeNull(); // roupa bloqueada
  });

  it("tom de tingimento: só aceita id do catálogo liberado NA CONTA; vazio sempre vale (cor natural)", () => {
    const rec = createAccount("Tingidor", "h", "s", "knight");
    expect(validateSetOutfit({ outfit: "cavaleiro", addons: 0, tone: "crimson" }, rec, [])).toBeNull(); // não liberado
    expect(validateSetOutfit({ outfit: "cavaleiro", addons: 0, tone: "inexistente" }, rec, ["inexistente"])).toBeNull(); // nem no catálogo
    expect(validateSetOutfit({ outfit: "cavaleiro", addons: 0, tone: "" }, rec, [])).toEqual({ outfit: "cavaleiro", addons: 0, tone: "", sex: "m" });
    expect(validateSetOutfit({ outfit: "cavaleiro", addons: 0, tone: "crimson" }, rec, ["crimson"])).toEqual({ outfit: "cavaleiro", addons: 0, tone: "crimson", sex: "m" });
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

  it("sexo: ausente = mantém o do registro; \"m\" | \"f\" troca (de graça, qualquer roupa); outro valor recusa", () => {
    const rec = createAccount("Sexo", "h", "s", "sorcerer");
    rec.data.unlocks = ["addon:mago:1"];
    expect(validateSetOutfit({ outfit: "mago", addons: 1, sex: "f" }, rec)).toEqual({ outfit: "mago", addons: 1, tone: "", sex: "f" });
    expect(validateSetOutfit({ outfit: "cidadao", addons: 0, sex: "m" }, rec)).toEqual({ outfit: "cidadao", addons: 0, tone: "", sex: "m" });
    rec.data.sex = "f";
    expect(validateSetOutfit({ outfit: "mago", addons: 0 }, rec)).toMatchObject({ sex: "f" }); // sem sexo no pedido: o atual
    for (const bad of ["F", "x", "", 1, null, true, "masculino"]) {
      expect(validateSetOutfit({ outfit: "mago", addons: 0, sex: bad }, rec), JSON.stringify(bad)).toBeNull();
    }
    // a roupa bloqueada continua bloqueada nos dois sexos
    expect(validateSetOutfit({ outfit: "pirata", addons: 0, sex: "f" }, rec)).toBeNull();
  });

  it("sexo salvo: ausente (personagens de antes) ou lixo = \"m\"; \"f\" fica", () => {
    const rec = createAccount("Antiga", "h", "s", "druid");
    rec.data = { outfit: "druida", addons: 1 };
    expect(loadOutfit(rec)).toEqual({ outfit: "druida", addons: 1, sex: "m" });
    rec.data = { outfit: "druida", addons: 1, sex: "f" };
    expect(loadOutfit(rec)).toEqual({ outfit: "druida", addons: 1, sex: "f" });
    rec.data = { outfit: "druida", sex: "x" as never };
    expect(loadOutfit(rec).sex).toBe("m");
  });

  it("personagem legado (sem campo) usa a roupa padrão da vocação; id inválido também", () => {
    const rec = createAccount("Velho", "h", "s", "sorcerer");
    rec.data = {};
    expect(loadOutfit(rec)).toEqual({ outfit: "mago", addons: 0, sex: "m" });
    rec.data = { outfit: "sumiu", addons: 3 };
    expect(loadOutfit(rec)).toEqual({ outfit: "mago", addons: 0, sex: "m" });
    rec.data = { outfit: "pirata", addons: 7 };
    expect(loadOutfit(rec)).toEqual({ outfit: "pirata", addons: 3, sex: "m" });
  });
});

describe("outfit: criação de personagem", () => {
  it("novo personagem nasce com a roupa padrão da vocação (e aparece no resumo da conta)", async () => {
    const a = await handleLogin({ account: "conta1", password: "segredo1", create: true });
    if (!a.ok) throw new Error("login");
    for (const [name, voc] of [["Kai", "knight"], ["Pala", "paladin"], ["Sora", "sorcerer"], ["Dru", "druid"]] as const) {
      const r = handleCreateCharacter({ session: a.session, name, vocation: voc });
      if (!r.ok) throw new Error(r.error);
      expect(getCharacterByName(name)!.data).toMatchObject({ outfit: DEFAULT_OUTFIT[voc], addons: 0, sex: "m" });
      expect(r.characters.find((c) => c.name === name)).toMatchObject({ outfit: DEFAULT_OUTFIT[voc], addons: 0, sex: "m" });
    }
  });

  it("sexo escolhido na criação vai para o registro e para o resumo; ausente = \"m\"; inválido recusa", async () => {
    const a = await handleLogin({ account: "conta2", password: "segredo1", create: true });
    if (!a.ok) throw new Error("login");
    const r = handleCreateCharacter({ session: a.session, name: "Bruna", vocation: "sorcerer", sex: "f" });
    if (!r.ok) throw new Error(r.error);
    expect(getCharacterByName("Bruna")!.data).toMatchObject({ outfit: "mago", sex: "f" });
    expect(r.characters.find((c) => c.name === "Bruna")).toMatchObject({ outfit: "mago", sex: "f" });
    for (const bad of ["x", "F", 0, null]) {
      expect(handleCreateCharacter({ session: a.session, name: "Outra", vocation: "druid", sex: bad as never }), String(bad))
        .toEqual({ ok: false, error: "invalid_request" });
    }
    expect(getCharacterByName("Outra")).toBeFalsy();
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

  it("sexo: entra com o salvo, a troca vale para todos, persiste; legado sem o campo entra \"m\"", () => {
    const r = makeRoom();
    const lia = createAccount("Lia", "h", "s", "knight");
    lia.data.sex = "f";
    saveCharacter(lia);
    const c = fakeClient(r, "l1");
    r.onJoin(c, {}, auth("Lia"));
    const p = r.state.players.get("l1");
    expect(p.sex).toBe("f");
    send(r, c, C2S.SetOutfit, { outfit: "cavaleiro", addons: 0, sex: "m" });
    expect(p.sex).toBe("m");
    send(r, c, C2S.SetOutfit, { outfit: "cavaleiro", addons: 0, sex: "z" }); // inválido: ignora
    expect(p.sex).toBe("m");
    r.onLeave(c, 4000);
    expect(getCharacterByName("Lia")!.data.sex).toBe("m");

    const velho = createAccount("Velho2", "h", "s", "druid");
    velho.data = { hp: 10 };
    saveCharacter(velho);
    const c2 = fakeClient(r, "v1");
    r.onJoin(c2, {}, auth("Velho2"));
    expect(r.state.players.get("v1").sex).toBe("m");
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

describe("outfit: roupa exclusiva da Fada (vocação oculta, 2026-10-28)", () => {
  it("a Fada nasce com a roupa e os dois addons liberados; ninguém mais veste, nem com o desbloqueio no registro", () => {
    const fada = createAccount("Fada Gabi", "h", "s", "fairy");
    expect(fada.data.outfit).toBe("fada");
    for (const bit of [0, 1, 2] as const) expect(isOutfitUnlocked(fada, "fada", bit), `fada bit ${bit}`).toBe(true);
    expect(isOutfitUnlocked(fada, "cidadao", 0)).toBe(true);
    expect(isOutfitUnlocked(fada, "pirata", 0)).toBe(false);
    expect(validateSetOutfit({ outfit: "fada", addons: 3, tone: "", sex: "f" }, fada)).toEqual({ outfit: "fada", addons: 3, tone: "", sex: "f" });
    expect(loadOutfit({ ...fada, data: { ...fada.data, outfit: "fada", addons: 3, sex: "f" } })).toEqual({ outfit: "fada", addons: 3, sex: "f" });
    const kai = createAccount("Kai", "h", "s", "knight");
    kai.data.unlocks = ["outfit:fada", "addon:fada:1", "addon:fada:2"];
    for (const bit of [0, 1, 2] as const) expect(isOutfitUnlocked(kai, "fada", bit), `kai bit ${bit}`).toBe(false);
    expect(validateSetOutfit({ outfit: "fada", addons: 0, tone: "" }, kai)).toBeNull();
  });
});

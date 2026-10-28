import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLOSE_REPLACED, DEFAULT_LOOT_FILTER, HOTKEYS_VERSION, OUT_OF_COMBAT_MS, defaultHotkeys, PARTY_SHARE_RANGE, PZ_LOCK_MS, RED_SKULL_KILLS, S2C, backpackCapacity, findObjects, objectTile, questChestDef } from "@lemonquest/shared";
import { RECONNECT_S, REPLACED_REASON, TRANSFER_SAVE_MS, WorldRoom, currentWorld } from "./WorldRoom.ts";
import { createAccountWithCharacter as createAccount, getCharacterByName, initDb, loadGroundRows, saveCharacter } from "../persistence/db.ts";
import { GOLD_ID, makeItem } from "../systems/inventory.ts";
import { MAX_PER_TILE } from "../systems/ground.ts";
import { handleCreateCharacter, handleLogin, handlePlay, onlineOwner, resetAuthState, type AuthData } from "../persistence/auth.ts";

// Sala real (mapa real), fora do matchmaker: __init + onCreate; clientes falsos.
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
  const c = { sessionId, send: vi.fn(), leave: vi.fn(), enqueueRaw: vi.fn() } as any;
  r.clients.push(c);
  return c;
}
const auth = (name: string, weakPassword = false): AuthData => ({ name, key: name.toLowerCase(), weakPassword });

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

/** Conta "leo" com o personagem "Leo"; devolve a sessão da conta. */
async function accountWithLeo(): Promise<string> {
  const a = await handleLogin({ account: "leo", password: "segredo1", create: true });
  if (!a.ok) throw new Error("login falhou");
  const c = handleCreateCharacter({ session: a.session, name: "Leo", vocation: "knight" });
  if (!c.ok) throw new Error("criação falhou");
  return a.session;
}

describe("WorldRoom: onAuth estático", () => {
  it("aceita token válido (uma vez), recusa reuso e lixo", async () => {
    const session = await accountWithLeo();
    const r = handlePlay({ session, name: "Leo" });
    if (!r.ok) throw new Error("play falhou");
    await expect(WorldRoom.onAuth("", { token: r.token })).resolves.toMatchObject({ name: "Leo", key: "leo" });
    await expect(WorldRoom.onAuth("", { token: r.token })).rejects.toThrow();
    await expect(WorldRoom.onAuth("", { token: "lixo" })).rejects.toThrow();
    await expect(WorldRoom.onAuth("", undefined)).rejects.toThrow();
  });

  it("novo /play invalida o token pendente anterior (reserva do nome)", async () => {
    const session = await accountWithLeo();
    const other = await handleLogin({ account: "leo", password: "segredo1" });
    if (!other.ok) throw new Error("login falhou");
    const a = handlePlay({ session, name: "Leo" });
    const b = handlePlay({ session: other.session, name: "leo" });
    if (!a.ok || !b.ok) throw new Error("play falhou");
    await expect(WorldRoom.onAuth("", { token: a.token })).rejects.toThrow();
    await expect(WorldRoom.onAuth("", { token: b.token })).resolves.toMatchObject({ name: "Leo" });
  });
});

describe("WorldRoom: sala única", () => {
  it("segunda instância é recusada; depois do dispose pode criar de novo", () => {
    const a = makeRoom();
    expect(currentWorld()).toBe(a);
    const b = new WorldRoom() as any;
    b["__init"]();
    expect(() => b.onCreate({})).toThrow(/cheio/);
    expect(currentWorld()).toBe(a);
    dispose(rooms.pop());
    expect(currentWorld()).toBeNull();
    makeRoom();
  });
});

describe("WorldRoom: sessões", () => {
  it("conta → /play → onAuth → onJoin; outro /play do mesmo personagem derruba a sessão antiga", async () => {
    const r = makeRoom();
    const session = await accountWithLeo();
    const t1 = handlePlay({ session, name: "Leo" });
    if (!t1.ok) throw new Error("play falhou");
    const c1 = fakeClient(r, "s1");
    r.onJoin(c1, {}, await WorldRoom.onAuth("", { token: t1.token }));
    const list = await handleLogin({ account: "LEO", password: "segredo1" });
    expect(list).toMatchObject({ ok: true, characters: [{ name: "Leo", online: true }] });
    if (!list.ok) return;
    const t2 = handlePlay({ session: list.session, name: "Leo" });
    if (!t2.ok) throw new Error("play falhou");
    const c2 = fakeClient(r, "s2");
    r.onJoin(c2, {}, await WorldRoom.onAuth("", { token: t2.token }));
    expect(c1.leave).toHaveBeenCalledWith(CLOSE_REPLACED, REPLACED_REASON);
    expect(onlineOwner("Leo")).toBe("s2");
  });

  it("login duplo: salva e derruba a sessão antiga (4100); onLeave da antiga não libera o nome da nova", () => {
    const r = makeRoom();
    createAccount("Leo", "h", "s", "knight");
    const c1 = fakeClient(r, "s1");
    r.onJoin(c1, {}, auth("Leo"));
    const p1 = r.state.players.get("s1");
    p1.xp = 777;
    const c2 = fakeClient(r, "s2");
    r.onJoin(c2, {}, auth("Leo"));
    expect(c1.leave).toHaveBeenCalledWith(CLOSE_REPLACED, REPLACED_REASON);
    expect(r.state.players.has("s1")).toBe(false);
    expect(r.state.players.get("s2").xp).toBe(777); // a nova sessão leu o que a antiga salvou
    expect(onlineOwner("leo")).toBe("s2");
    r.onLeave(c1, 4100); // o close da sessão antiga chega depois
    expect(onlineOwner("Leo")).toBe("s2");
    expect(r.state.players.has("s2")).toBe(true);
    r.onLeave(c2, 4000);
    expect(onlineOwner("Leo")).toBeUndefined();
  });

  it("onLeave: se salvar lançar, a limpeza e a liberação do nome acontecem mesmo assim", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = makeRoom();
    createAccount("Ana", "h", "s", "druid");
    const c = fakeClient(r, "a1");
    r.onJoin(c, {}, auth("Ana"));
    r.persist = () => { throw new Error("disco cheio"); };
    r.onLeave(c, 4000);
    expect(r.state.players.has("a1")).toBe(false);
    expect(r.records.size).toBe(0);
    expect(onlineOwner("Ana")).toBeUndefined();
    expect(err).toHaveBeenCalled();
  });

  it("onDrop mantém o jogador; WITH_ERROR/sessão desconhecida não reserva reconexão", () => {
    const r = makeRoom();
    createAccount("Bia", "h", "s", "paladin");
    const c = fakeClient(r, "b1");
    r.onJoin(c, {}, auth("Bia"));
    const allow = vi.spyOn(r, "allowReconnection").mockImplementation(() => {
      let reject!: (e: unknown) => void;
      const promise = new Promise((_res, rej) => { reject = rej; });
      return Object.assign(promise, { reject }) as any;
    });
    r.onDrop(c, 1006);
    expect(allow).toHaveBeenCalledWith(c, 20);
    expect(r.state.players.has("b1")).toBe(true);
    r.onDrop({ sessionId: "zzz" }, 1006);
    r.onDrop(c, 4002);
    expect(allow).toHaveBeenCalledTimes(1);
  });

  it("kick de quem caiu e espera reconexão cancela a reconexão (troca de senha, /kick)", () => {
    const r = makeRoom();
    createAccount("Bel", "h", "s", "knight");
    const c = fakeClient(r, "k1");
    r.onJoin(c, {}, auth("Bel"));
    const reject = vi.fn();
    vi.spyOn(r, "allowReconnection").mockImplementation(() => Object.assign(new Promise(() => {}), { reject }) as any);
    r.onDrop(c, 1006);
    r.kick("k1", "senha trocada");
    expect(reject).toHaveBeenCalledTimes(1);
    expect(r.reconnecting.has("k1")).toBe(false);
  });

  it("senha fraca (conta antiga) recebe aviso após entrar", () => {
    const r = makeRoom();
    createAccount("Caio", "h", "s", "sorcerer");
    const c = fakeClient(r, "c1");
    r.onJoin(c, {}, auth("Caio", true));
    expect(c.send.mock.calls.some(([t, m]: [string, any]) => t === "notice" && /senha/i.test(m.text))).toBe(true);
  });
});

describe("WorldRoom: tick isolado", () => {
  it("um sistema que lança não impede os seguintes; log limitado", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = makeRoom();
    const after = vi.fn();
    r.setSteps([["quebrado", () => { throw new Error("bug"); }], ["depois", after]]);
    r.tick();
    r.tick();
    expect(after).toHaveBeenCalledTimes(2);
    expect(err).toHaveBeenCalledTimes(1); // 1 linha por 10 s por sistema
  });
});

describe("WorldRoom: posição salva", () => {
  it("parede, portal e NPC → spawn; tile válido é mantido", () => {
    const r = makeRoom();
    const sp = r.spawnPoint;
    expect(r.validStart(sp.x, sp.y)).toBe(true);
    expect(r.validStart(null, null)).toBe(false);
    expect(r.validStart(-5, 3)).toBe(false);
    const g = r.map.grid;
    let wall: { x: number; y: number } | null = null;
    for (let y = 0; y < g.height && !wall; y++) for (let x = 0; x < g.width && !wall; x++) if (!g.isWalkable(x, y)) wall = { x, y };
    expect(r.validStart(wall!.x, wall!.y)).toBe(false);
    const portal = findObjects(r.map.tiled, "portal")[0];
    if (portal) { const t = objectTile(portal, r.map.tiled.tilewidth); expect(r.validStart(t.x, t.y)).toBe(false); }
    const npc = r.npcs.list[0];
    if (npc) expect(r.validStart(npc.x, npc.y)).toBe(false);

    createAccount("Davi", "h", "s", "knight");
    const rec = getCharacterByName("Davi")!;
    saveCharacter({ ...rec, x: wall!.x, y: wall!.y });
    const c = fakeClient(r, "d1");
    r.onJoin(c, {}, auth("Davi"));
    expect([r.state.players.get("d1").x, r.state.players.get("d1").y]).toEqual([sp.x, sp.y]);
  });
});

describe("WorldRoom: item entre mochila e chão", () => {
  it("largar/pegar grava jogador e chão juntos no fim do tick (sem esperar o autosave)", () => {
    const r = makeRoom();
    createAccount("Gil", "h", "s", "knight");
    const c = fakeClient(r, "g1");
    r.onJoin(c, {}, auth("Gil"));
    const p = r.state.players.get("g1");
    r.inventory.addItem(p, makeItem("health_potion", 3));
    r.saveAll();
    const idx = r.inventory.serialize("g1").backpack.findIndex((it: any) => it?.defId === "health_potion");
    const potions = () => (getCharacterByName("Gil")!.data.backpack ?? []).filter((it: any) => it?.defId === "health_potion").length;
    const onGround = () => loadGroundRows().filter((g) => JSON.parse(g.item).defId === "health_potion").length;
    expect(potions()).toBe(1);

    r.ground.onDrop(p, { from: { where: "backpack", index: idx }, x: p.x, y: p.y });
    r.tick();
    expect(potions()).toBe(0);
    expect(onGround()).toBe(1);

    const gid = [...r.state.groundItems.keys()][0];
    r.ground.onPickup(p, { groundId: gid });
    const t = Date.now();
    r.tick(); // menos de 1 s depois da última gravação: espera
    expect(potions()).toBe(0);
    vi.spyOn(Date, "now").mockReturnValue(t + TRANSFER_SAVE_MS + 1);
    r.tick();
    expect(potions()).toBe(1);
    expect(onGround()).toBe(0);
  });
});

describe("WorldRoom: sair em combate", () => {
  const join = (r: any, name: string, sid: string) => {
    createAccount(name, "h", "s", "knight");
    const c = fakeClient(r, sid);
    r.onJoin(c, {}, auth(name));
    return c;
  };
  const expire = (r: any, sid: string) => r.lingering.get(sid).tick(RECONNECT_S * 1000 + 1);

  it("sair de propósito logo após lutar: fica no mundo RECONNECT_S s (pode apanhar), depois sai e libera o nome", () => {
    const r = makeRoom();
    const c = join(r, "Rui", "r1");
    r.combat.markCombat("r1", Date.now());
    r.onLeave(c, 4000);
    expect(r.state.players.has("r1")).toBe(true);
    expect(onlineOwner("Rui")).toBe("r1");
    expire(r, "r1");
    expect(r.state.players.has("r1")).toBe(false);
    expect(onlineOwner("Rui")).toBeUndefined();
    expect(r.lingering.size).toBe(0);
  });

  it("fora de combate (ou morto) sai na hora, como antes", () => {
    const r = makeRoom();
    const c = join(r, "Lia", "l1");
    r.onLeave(c, 4000);
    expect(r.state.players.has("l1")).toBe(false);
    const c2 = join(r, "Ivo", "i1");
    r.combat.markCombat("i1", Date.now());
    r.state.players.get("i1").hp = 0;
    r.onLeave(c2, 4000);
    expect(r.state.players.has("i1")).toBe(false);
  });

  it("relogar durante a permanência troca a sessão; o timer antigo não derruba a nova", () => {
    const r = makeRoom();
    const c = join(r, "Bob", "b1");
    r.combat.markCombat("b1", Date.now());
    r.onLeave(c, 4000);
    const c2 = fakeClient(r, "b2");
    r.onJoin(c2, {}, auth("Bob"));
    expect(r.state.players.has("b1")).toBe(false);
    expect(r.state.players.has("b2")).toBe(true);
    expect(r.lingering.size).toBe(0);
    expect(onlineOwner("Bob")).toBe("b2");
  });

  it("ao ficar no mundo, para de andar (não chega sozinho a uma zona de proteção)", () => {
    const r = makeRoom();
    const c = join(r, "Edu", "e1");
    r.combat.markCombat("e1", Date.now());
    const stop = vi.spyOn(r.movement, "teleport");
    r.onLeave(c, 4000);
    const p = r.state.players.get("e1");
    expect(stop).toHaveBeenCalledWith(p, p.x, p.y);
  });

  /** `a` ataca `b` fora da zona de proteção (b inocente → caveira branca + bloqueio de PZ para `a`). */
  const pvpHit = (r: any, a: string, b: string) => {
    const pa = r.state.players.get(a), pb = r.state.players.get(b);
    // Fora da zona de proteção (o personagem novo nasce na Vila): no tile de um monstro selvagem qualquer.
    const wild = [...r.monsters.all()].find((x: any) => !x.def.invulnerable && !x.arenaId);
    pa.x = wild.s.x; pa.y = wild.s.y;
    pa.targetId = b;
    r.pvp.onHit(pa, pb, Date.now());
    return pa;
  };

  it("com bloqueio de PZ (atacou um jogador), sair fica no mundo até o bloqueio acabar, mesmo fora de combate", () => {
    const r = makeRoom();
    const c = join(r, "Rex", "x1");
    join(r, "Val", "v1");
    pvpHit(r, "x1", "v1");
    const t0 = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(t0 + OUT_OF_COMBAT_MS + 1); // já fora de combate, ainda bloqueado
    r.onLeave(c, 4000);
    expect(r.state.players.has("x1")).toBe(true);
    r.lingering.get("x1").tick(RECONNECT_S * 1000 + 1);
    expect(r.state.players.has("x1")).toBe(true); // o bloqueio (60 s) passa dos 20 s de combate
    clock.mockReturnValue(t0 + PZ_LOCK_MS + 1);
    r.lingering.get("x1").tick(PZ_LOCK_MS);
    expect(r.state.players.has("x1")).toBe(false);
  });

  it("parado no mundo: não ataca nem segue; relogar não apaga o bloqueio de PZ", () => {
    const r = makeRoom();
    const c = join(r, "Nina", "n1");
    join(r, "Olga", "o1");
    const p = pvpHit(r, "n1", "o1");
    p.followId = "o1";
    r.onLeave(c, 4000);
    expect(p.targetId).toBe("");
    expect(p.followId).toBe("");
    const c2 = fakeClient(r, "n2");
    r.onJoin(c2, {}, auth("Nina"));
    expect(r.pvp.pzLocked("n2")).toBe(true);
  });

  it("fechar a aba com bloqueio de PZ: depois da reconexão recusada, ainda fica no mundo; kick tira na hora", () => {
    const r = makeRoom();
    const c = join(r, "Zeca", "z1");
    join(r, "Tita", "t1");
    pvpHit(r, "z1", "t1");
    r.onLeave(c, 1006); // queda (fim da janela de reconexão)
    expect(r.state.players.has("z1")).toBe(true);
    r.kick("z1", "tchau");
    expect(r.state.players.has("z1")).toBe(false);
    // Kick com a sessão ainda aberta: o onLeave seguinte não deixa no mundo.
    const c2 = fakeClient(r, "z2");
    r.onJoin(c2, {}, auth("Zeca"));
    pvpHit(r, "z2", "t1");
    r.kick("z2", "tchau");
    r.onLeave(c2, 1006);
    expect(r.state.players.has("z2")).toBe(false);
    expect(r.kicked.size).toBe(0);
  });

  it("relogar não apaga a caveira branca (o prazo fica salvo no personagem)", () => {
    const r = makeRoom();
    join(r, "Duda", "d1");
    join(r, "Caio", "k1");
    const pa = pvpHit(r, "d1", "k1");
    expect(pa.skull).toBe("white");
    r.pvp.pzLockUntil.delete("d1"); // simula o fim do bloqueio de PZ (a caveira dura mais)
    r.onLeave(r.clients.find((c: any) => c.sessionId === "d1"), 4000);
    expect(r.state.players.has("d1")).toBe(false);
    expect(getCharacterByName("Duda")!.data.pvpWhiteUntil).toBeGreaterThan(Date.now());
    const c2 = fakeClient(r, "d2");
    r.onJoin(c2, {}, auth("Duda"));
    expect(r.state.players.get("d2").skull).toBe("white");
  });

  it("kick durante a permanência tira o personagem na hora", () => {
    const r = makeRoom();
    const c = join(r, "Gus", "g1");
    r.combat.markCombat("g1", Date.now());
    r.onLeave(c, 4000);
    r.kick("g1", "tchau");
    expect(r.state.players.has("g1")).toBe(false);
    expect(r.lingering.size).toBe(0);
  });
});

describe("WorldRoom: filtro do loot automático", () => {
  it("entra com o padrão; SetLootFilter válido é limpo, confirmado, salvo no personagem e volta no próximo login; padrão não é gravado; lixo é ignorado", () => {
    const r = makeRoom();
    createAccount("Hugo", "h", "s", "sorcerer");
    const c = fakeClient(r, "h1");
    r.onJoin(c, {}, auth("Hugo"));
    const sent = (cl: any) => cl.send.mock.calls.filter(([t]: any[]) => t === "lootFilter").map(([, m]: any[]) => m.filter);
    expect(sent(c)).toEqual([DEFAULT_LOOT_FILTER]);
    const p = r.state.players.get("h1");
    r.setLootFilter(p, { filter: { skip: ["bone", "", "bone", 7, "wolf_pelt"] } });
    const saved = { skip: ["bone", "wolf_pelt"] };
    expect(sent(c).at(-1)).toEqual(saved); // confirma o que ficou (repetido, vazio e número saem)
    r.onLeave(c, 4000);
    expect(getCharacterByName("Hugo")!.data.lootFilter).toEqual(saved);
    const c2 = fakeClient(r, "h2");
    r.onJoin(c2, {}, auth("Hugo"));
    expect(sent(c2)).toEqual([saved]);
    const p2 = r.state.players.get("h2");
    r.setLootFilter(p2, "lixo"); // nem é objeto: ignorado
    expect(r.records.get("h2").data.lootFilter).toEqual(saved);
    r.setLootFilter(p2, { filter: { ...DEFAULT_LOOT_FILTER } }); // voltou ao padrão: o campo sai do personagem
    expect(r.records.get("h2").data.lootFilter).toBeUndefined();
    expect(sent(c2).at(-1)).toEqual(DEFAULT_LOOT_FILTER);
  });
});

describe("WorldRoom: atalhos de magia", () => {
  it("personagem novo recebe a barra recomendada; SetHotkeys válido fica no personagem e volta no próximo login; lixo é limpo", () => {
    const r = makeRoom();
    createAccount("Hugo", "h", "s", "sorcerer");
    const c = fakeClient(r, "h1");
    r.onJoin(c, {}, auth("Hugo"));
    const first = c.send.mock.calls.find(([t]: any[]) => t === "hotkeys");
    expect(first?.[1]).toEqual({ list: defaultHotkeys("sorcerer"), groups: [] });
    const p = r.state.players.get("h1");
    r.setHotkeys(p, { list: [{ key: "KeyF", spellId: "fireball" }, { key: "KeyQ", spellId: "inferno" }, { key: "Digit2", spellId: "ice_shard" }] });
    // Confirma ao cliente a lista que ficou salva (limpa).
    expect(c.send.mock.calls.filter(([t]: any[]) => t === "hotkeys").at(-1)?.[1]).toEqual({ list: [{ key: "KeyF", spellId: "fireball" }], groups: [] });
    r.onLeave(c, 4000);
    expect(getCharacterByName("Hugo")!.data.hotkeys).toEqual([{ key: "KeyF", spellId: "fireball" }]);
    const c2 = fakeClient(r, "h2");
    r.onJoin(c2, {}, auth("Hugo"));
    expect(c2.send.mock.calls.find(([t]: any[]) => t === "hotkeys")?.[1]).toEqual({ list: [{ key: "KeyF", spellId: "fireball" }], groups: [] });
    r.setHotkeys(r.state.players.get("h2"), "lixo"); // mensagem que nem é objeto: ignorada
    expect(r.records.get("h2").data.hotkeys).toEqual([{ key: "KeyF", spellId: "fireball" }]);
    r.setHotkeys(r.state.players.get("h2"), { list: "lixo" }); // lista inválida: sem atalhos
    expect(r.records.get("h2").data.hotkeys).toEqual([]);
  });

  it("grupos de magia: salvos limpos junto com os atalhos, voltam no login; sem groups na mensagem ficam; excluir tira da barra", () => {
    const r = makeRoom();
    createAccount("Lia", "l", "s", "sorcerer");
    const c = fakeClient(r, "l1");
    r.onJoin(c, {}, auth("Lia"));
    const p = r.state.players.get("l1");
    const groups = [
      { id: "fam:my:1", name: "  Meu   combo ", spells: ["sudden_death", "ice_shard", "fireball", "sudden_death"] }, // druida e repetida saem
      { id: "fam:my:99", name: "x", spells: [] }, // id fora da faixa
    ];
    r.setHotkeys(p, { list: [{ key: "Digit1", spellId: "fam:my:1" }, { key: "Digit2", spellId: "fam:my:2" }], groups });
    const saved = { list: [{ key: "Digit1", spellId: "fam:my:1" }], groups: [{ id: "fam:my:1", name: "Meu combo", spells: ["sudden_death", "fireball"] }] };
    expect(c.send.mock.calls.filter(([t]: any[]) => t === "hotkeys").at(-1)?.[1]).toEqual(saved);
    // Cliente antigo (sem groups): os grupos ficam.
    r.setHotkeys(p, { list: saved.list });
    expect(r.records.get("l1").data.spellGroups).toEqual(saved.groups);
    r.onLeave(c, 4000);
    const c2 = fakeClient(r, "l2");
    r.onJoin(c2, {}, auth("Lia"));
    expect(c2.send.mock.calls.find(([t]: any[]) => t === "hotkeys")?.[1]).toEqual(saved);
    r.setHotkeys(r.state.players.get("l2"), { list: saved.list, groups: [] });
    expect(r.records.get("l2").data.hotkeys).toEqual([]);
  });

  it("barra salva de antes das famílias vira a recomendada uma vez (com aviso); a editada depois não é trocada de novo", () => {
    const r = makeRoom();
    createAccount("Iris", "i", "s", "sorcerer");
    const rec = getCharacterByName("Iris")!;
    rec.data.hotkeys = [{ key: "Digit1", spellId: "fireball" }, { key: "Digit2", spellId: "energy_beam" }];
    saveCharacter(rec);
    const c = fakeClient(r, "i1");
    r.onJoin(c, {}, auth("Iris"));
    expect(c.send.mock.calls.find(([t]: any[]) => t === "hotkeys")?.[1]).toEqual({ list: defaultHotkeys("sorcerer"), groups: [] });
    expect(r.records.get("i1").data.hotkeysVersion).toBe(HOTKEYS_VERSION);
    r.clock.currentTime -= 3100; // avisos de entrada saem 3 s depois
    r.clock.tick();
    expect(c.send.mock.calls.some(([t, m]: any[]) => t === S2C.Notice && /famílias/.test(m.text))).toBe(true);
    // O jogador arruma a barra do jeito dele: o próximo login não troca de novo.
    r.setHotkeys(r.state.players.get("i1"), { list: [{ key: "KeyF", spellId: "fireball" }] });
    r.onLeave(c, 4000);
    const c2 = fakeClient(r, "i2");
    r.onJoin(c2, {}, auth("Iris"));
    expect(c2.send.mock.calls.find(([t]: any[]) => t === "hotkeys")?.[1]).toEqual({ list: [{ key: "KeyF", spellId: "fireball" }], groups: [] });
  });

  it("personagem novo (sem barra e sem XP) não recebe o aviso de barra reorganizada", () => {
    const r = makeRoom();
    createAccount("Juca", "j", "s", "druid");
    const c = fakeClient(r, "j1");
    r.onJoin(c, {}, auth("Juca"));
    r.clock.currentTime -= 3100; // avisos de entrada saem 3 s depois
    r.clock.tick();
    expect(c.send.mock.calls.some(([t, m]: any[]) => t === S2C.Notice && /famílias/.test(m.text))).toBe(false);
  });
});

describe("WorldRoom: Fúria (berserk)", () => {
  it("multiplica o dano causado junto com a postura e some quando a condição acaba", () => {
    const r = makeRoom();
    createAccount("Bruno", "h", "s", "knight");
    r.onJoin(fakeClient(r, "b1"), {}, auth("Bruno"));
    const p = r.state.players.get("b1");
    p.stance = "balanced";
    expect(r.dealtMult(p)).toBe(1);
    r.conditions.apply("b1", "berserk", 10_000, 25, "b1", Date.now());
    expect(r.dealtMult(p)).toBeCloseTo(1.25);
    p.stance = "offensive";
    expect(r.dealtMult(p)).toBeCloseTo(1.2 * 1.25);
    r.conditions.remove("b1", "berserk");
    expect(r.dealtMult(p)).toBeCloseTo(1.2);
  });
});

describe("WorldRoom: crédito de missão só para quem está perto", () => {
  it("quem bateu e foi para longe não conta o abate na missão", () => {
    const r = makeRoom();
    for (const [n, id] of [["Ana", "a1"], ["Bia", "b1"]] as const) {
      createAccount(n, "h", "s", "knight");
      r.onJoin(fakeClient(r, id), {}, auth(n));
    }
    const m = [...r.monsters.all()].find((x: any) => !x.def.invulnerable && !x.arenaId);
    const near = r.state.players.get("a1"), far = r.state.players.get("b1");
    near.x = m.s.x + 1; near.y = m.s.y;
    far.x = m.s.x + 30; far.y = m.s.y;
    m.damageBy.set("b1", 90);
    m.damageBy.set("a1", 10);
    expect(r.questCredit(m)).toEqual(["a1"]);
  });
});

describe("WorldRoom: robustez (morte, caveira vermelha, recompensas, permanência)", () => {
  const join = (r: any, name: string, sid: string) => {
    createAccount(name, "h", "s", "knight");
    const c = fakeClient(r, sid);
    r.onJoin(c, {}, auth(name));
    return r.state.players.get(sid);
  };
  /** Tile de um monstro selvagem qualquer: fora da zona de proteção. */
  const wildTile = (r: any) => {
    const m = [...r.monsters.all()].find((x: any) => !x.def.invulnerable && !x.arenaId);
    return { x: m.s.x, y: m.s.y };
  };
  /** Morte de verdade (CombatSystem): a vida volta cheia na hora, no templo. */
  const kill = (r: any, p: any) => r.combat.damagePlayer(p, "x", 1e9, "physical", Date.now(), { killerName: "Rato" });

  it("morrer de verdade fecha a troca aberta e para de seguir (o morto e quem o seguia)", () => {
    const r = makeRoom();
    const a = join(r, "Ana", "a1"), b = join(r, "Beto", "b1"), c = join(r, "Caio", "c1");
    r.trade.onMessage(a, { action: "request", targetId: "b1" });
    r.trade.onMessage(b, { action: "accept" });
    expect(r.trade.sessionOf("a1")).toBeTruthy();
    a.followId = "c1";
    c.followId = "a1";
    kill(r, a);
    expect(a.hp).toBe(a.maxHp); // já renasceu: os sistemas nunca veem hp ≤ 0
    expect(r.trade.sessionOf("a1")).toBeUndefined();
    expect(r.trade.sessionOf("b1")).toBeUndefined();
    expect(a.followId).toBe("");
    expect(c.followId).toBe("");
  });

  it("caveira vermelha: metade do ouro vai ao chão ao lado se o tile está cheio; sem lugar no chão, não perde o ouro", () => {
    const r = makeRoom();
    const p = join(r, "Rato", "r1");
    const t = wildTile(r);
    const red = () => { r.pvp.kills.set("r1", Array(RED_SKULL_KILLS).fill(Date.now())); p.skull = "red"; p.x = t.x; p.y = t.y; };
    r.inventory.addGold(p, 1000);
    for (let i = 0; i < MAX_PER_TILE; i++) r.ground.place(makeItem("fire_sword"), t.x, t.y);
    red();
    kill(r, p);
    expect(r.inventory.gold("r1")).toBe(500);
    const gold = [...r.ground.all()].filter((e: any) => e.item.defId === GOLD_ID);
    expect(gold.map((e: any) => e.item.count)).toEqual([500]);
    expect(Math.max(Math.abs(gold[0].state.x - t.x), Math.abs(gold[0].state.y - t.y))).toBe(1); // vizinho
    expect(r.transferred.has("r1")).toBe(true); // grava personagem + chão juntos

    // Nenhum tile aceita: o ouro não sai da conta (antes sumia).
    r.transferred.clear();
    vi.spyOn(r.ground, "placeNear").mockReturnValue(undefined);
    red();
    kill(r, p);
    expect(r.inventory.gold("r1")).toBe(500);
    expect(r.transferred.has("r1")).toBe(false);
  });

  it("baú de quest com a mochila cheia: o item cai no chão e grava personagem + chão juntos", () => {
    const r = makeRoom();
    const p = join(r, "Lia", "l1");
    for (let i = 0; i < backpackCapacity(p.level, p.vocation); i++) r.inventory.addItem(p, makeItem("fire_sword"));
    expect(r.inventory.roomFor("l1", "stonecutter_axe")).toBe(0);
    r.quests.claimChest(p, questChestDef("anni_armor")!);
    const fell = [...r.ground.all()].filter((e: any) => e.item.defId === "stonecutter_axe");
    expect(fell).toHaveLength(1);
    expect(r.transferred.has("l1")).toBe(true);
  });

  it("com bloqueio de PZ não viaja de barco/carroça, e o aviso diz quantos segundos faltam", () => {
    const r = makeRoom();
    const a = join(r, "Rex", "x1"), b = join(r, "Val", "v1");
    const t = wildTile(r);
    a.x = t.x; a.y = t.y;
    r.pvp.onHit(a, b, Date.now());
    const t0 = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(t0 + OUT_OF_COMBAT_MS + 1); // fora de combate, ainda bloqueado
    const why = r.npcs.o.travelBlocked(a) as string;
    expect(why).toMatch(/não pode viajar/);
    const left = Number(/mais (\d+) s/.exec(why)?.[1]);
    expect(left).toBe(Math.ceil((PZ_LOCK_MS - OUT_OF_COMBAT_MS - 1) / 1000));
    expect(r.npcs.o.travelBlocked(b)).toBeNull();
  });

  it("queda ou permanência: o ataque automático para sem apagar a preferência salva; volta na reconexão", () => {
    const r = makeRoom();
    const p = join(r, "Gus", "g1");
    const c = r.clients.find((x: any) => x.sessionId === "g1");
    p.auto = true;
    vi.spyOn(r, "allowReconnection").mockImplementation(() => Object.assign(new Promise(() => {}), { reject: vi.fn() }) as any);
    r.onDrop(c, 1006);
    expect(p.auto).toBe(false);
    r.saveAll();
    expect(getCharacterByName("Gus")!.data.auto).toBe(true);
    c.send.mockClear();
    r.onReconnect(c);
    expect(p.auto).toBe(true);
    // A reconexão reenvia o estado da troca (aqui, sem troca: "closed").
    expect(c.send).toHaveBeenCalledWith(S2C.Trade, { phase: "closed" });

    // Sair em combate (fica no mundo): idem, e a preferência chega ao disco no fim.
    r.combat.markCombat("g1", Date.now());
    r.onLeave(c, 4000);
    expect(r.state.players.has("g1")).toBe(true);
    expect(p.auto).toBe(false);
    r.lingering.get("g1").tick(60_000);
    expect(r.state.players.has("g1")).toBe(false);
    expect(getCharacterByName("Gus")!.data.auto).toBe(true);
    expect(r.autoPaused.size).toBe(0);
  });

  it("troca concluída grava os dois jogadores juntos (uma transação no fim do tick)", () => {
    const r = makeRoom();
    const a = join(r, "Ana", "a1"), b = join(r, "Bia", "b1");
    r.inventory.addItem(a, makeItem("fire_sword"));
    const saved = () => ["Ana", "Bia"].map((n) => (getCharacterByName(n)!.data.backpack ?? []).some((it: any) => it?.defId === "fire_sword"));
    r.saveAll();
    expect(saved()).toEqual([true, false]);
    const persist = vi.spyOn(r, "persist");
    const rev = (id: string) => [...r.clients.find((c: any) => c.sessionId === id).send.mock.calls].reverse().find(([t, m]: any[]) => t === "trade" && m.phase === "open")?.[1].rev;
    r.trade.onMessage(a, { action: "request", targetId: "b1" });
    r.trade.onMessage(b, { action: "accept" });
    const sword = r.inventory.get("a1").backpack.find((it: any) => it?.defId === "fire_sword");
    r.trade.onMessage(a, { action: "offer", items: [{ uid: sword.uid, count: 1 }], gold: 0 });
    r.trade.onMessage(a, { action: "confirm", confirmed: true, rev: rev("a1") });
    r.trade.onMessage(b, { action: "confirm", confirmed: true, rev: rev("b1") });
    expect(r.trade.sessionOf("a1")).toBeUndefined(); // trocou
    expect(persist).not.toHaveBeenCalled();           // ainda não gravou nenhum dos dois isoladamente
    r.tick();
    expect(persist).toHaveBeenCalledTimes(2);
    expect(saved()).toEqual([false, true]);
  });

  it("troca + logout imediato: quem sai grava junto com o outro lado e o chão (uma transação)", () => {
    const r = makeRoom();
    const a = join(r, "Ana", "a1"), b = join(r, "Bia", "b1");
    r.inventory.addItem(a, makeItem("fire_sword"));
    r.saveAll();
    const has = (n: string) => (getCharacterByName(n)!.data.backpack ?? []).some((it: any) => it?.defId === "fire_sword");
    const rev = (id: string) => [...r.clients.find((c: any) => c.sessionId === id).send.mock.calls].reverse().find(([t, m]: any[]) => t === "trade" && m.phase === "open")?.[1].rev;
    r.trade.onMessage(a, { action: "request", targetId: "b1" });
    r.trade.onMessage(b, { action: "accept" });
    const sword = r.inventory.get("a1").backpack.find((it: any) => it?.defId === "fire_sword");
    r.trade.onMessage(a, { action: "offer", items: [{ uid: sword.uid, count: 1 }], gold: 0 });
    r.trade.onMessage(a, { action: "confirm", confirmed: true, rev: rev("a1") });
    r.trade.onMessage(b, { action: "confirm", confirmed: true, rev: rev("b1") });
    expect(r.transferred.size).toBe(2);
    r.onLeave(r.clients.find((c: any) => c.sessionId === "a1"), 4000); // sai antes do tick
    expect(r.state.players.has("a1")).toBe(false);
    expect([has("Ana"), has("Bia")]).toEqual([false, true]); // os dois lados gravados, não só quem saiu
    expect(r.transferred.size).toBe(0);
  });

  it("loot de grupo só vai ao chão com outro membro (no teclado) perto do monstro", () => {
    const r = makeRoom();
    const a = join(r, "Ana", "a1"), b = join(r, "Bia", "b1");
    const m = { x: a.x + 3, y: a.y }; // monstro morto à distância (paladino/mago): a régua é o tile dele
    expect(r.partyLootId(a, m.x, m.y)).toBeUndefined(); // sem grupo
    r.party.invite(a, "b1");
    r.party.accept(b, "a1");
    b.x = m.x + PARTY_SHARE_RANGE + 1; b.y = m.y;
    expect(r.partyLootId(a, m.x, m.y)).toBeUndefined(); // grupo, mas o outro está longe do monstro
    b.x = m.x + PARTY_SHARE_RANGE;
    expect(r.partyLootId(a, m.x, m.y)).toBe(r.party.partyFor("a1").id);
    // Perto de quem matou mas longe do monstro: não conta.
    b.x = a.x - PARTY_SHARE_RANGE; b.y = a.y;
    expect(Math.abs(b.x - m.x)).toBeGreaterThan(PARTY_SHARE_RANGE);
    expect(r.partyLootId(a, m.x, m.y)).toBeUndefined();
    // Perto, mas fora do teclado (saiu em combate e ficou no mundo): não conta.
    b.x = m.x; b.y = m.y + 1;
    r.combat.markCombat("b1", Date.now());
    r.onLeave(r.clients.find((c: any) => c.sessionId === "b1"), 4000);
    expect(r.lingering.has("b1")).toBe(true);
    expect(r.partyLootId(a, m.x, m.y)).toBeUndefined();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ACHIEVEMENTS, BESTIARY_IDS, C2S, OUTFIT_LIST, RANKING_CACHE_S, S2C, TITLES, defaultOutfit, isFreeOutfit, isValidUnlockId,
  resolveUnlockArg, type AchievementsMsg,
} from "@lemonquest/shared";
import { AchievementSystem, achievementEvent, addWorkTasks, bestiaryOf, grantUnlock, onUnlock, setActiveAchievements } from "./achievements.ts";
import { handleAdminCommand, type AdminContext } from "./admin.ts";
import { isOutfitUnlocked } from "./outfit.ts";
import { WorldRoom } from "../rooms/WorldRoom.ts";
import { createAccountWithCharacter as createAccount, getCharacterByName, initDb, setKv } from "../persistence/db.ts";
import { resetAuthState, type AuthData } from "../persistence/auth.ts";
import { buildRanking, rankingJson, resetRankingCache } from "../persistence/ranking.ts";
import type { CharacterRecord } from "../persistence/types.ts";

// --- catálogo -------------------------------------------------------------------------------------------------------

describe("conquistas: catálogo", () => {
  it("ids únicos, recompensas válidas, títulos existentes, ~25+ conquistas", () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(25);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    for (const a of ACHIEVEMENTS) {
      expect(a.points, a.id).toBeGreaterThan(0);
      expect(a.target, a.id).toBeGreaterThan(0);
      for (const r of a.rewards ?? []) expect(isValidUnlockId(r), `${a.id}: ${r}`).toBe(true);
    }
    expect(Object.keys(TITLES).length).toBeGreaterThan(5);
  });

  it("todas as roupas e addons que não são de graça têm exatamente UMA conquista que os concede", () => {
    const count = new Map<string, number>();
    for (const a of ACHIEVEMENTS) for (const r of a.rewards ?? []) count.set(r, (count.get(r) ?? 0) + 1);
    for (const o of OUTFIT_LIST) {
      // Roupa: de graça só para a vocação dona e Cidadão; para as demais precisa de conquista.
      const needsIt = !(["knight", "paladin", "sorcerer", "druid"] as const).every((v) => isFreeOutfit(o.id, v));
      if (o.id !== "cidadao" && needsIt) expect(count.get(`outfit:${o.id}`), `roupa ${o.id}`).toBe(1);
      expect(count.get(`addon:${o.id}:1`), `addon1 ${o.id}`).toBe(1);
      expect(count.get(`addon:${o.id}:2`), `addon2 ${o.id}`).toBe(1);
    }
    for (const [k, n] of count) if (k.startsWith("title:")) expect(n, k).toBe(1);
  });

  it("mapeamento do enunciado: Bárbaro = 500 abates, Pirata = onda 20, Nobre = 50k, Assassino = Rei Goblin, Mago addon 1 = ML 15", () => {
    const by = (u: string) => ACHIEVEMENTS.find((a) => a.rewards?.includes(u))!;
    expect(by("outfit:barbaro")).toMatchObject({ metric: "kills", target: 500 });
    expect(by("outfit:pirata")).toMatchObject({ metric: "arena", target: 20 });
    expect(by("outfit:nobre")).toMatchObject({ metric: "gold", target: 50_000 });
    expect(by("outfit:assassino")).toMatchObject({ metric: "boss:goblin_king", target: 1 });
    expect(by("addon:mago:1")).toMatchObject({ metric: "magic", target: 15 });
  });

  it("resolveUnlockArg: roupa, addon, título e id completo", () => {
    expect(resolveUnlockArg("pirata")).toBe("outfit:pirata");
    expect(resolveUnlockArg("Pirata_Chapeu")).toBe("addon:pirata:1");
    expect(resolveUnlockArg("pirata_papagaio")).toBe("addon:pirata:2");
    expect(resolveUnlockArg("persistente")).toBe("title:persistente");
    expect(resolveUnlockArg("addon:mago:2")).toBe("addon:mago:2");
    expect(resolveUnlockArg("addon:mago:3")).toBeNull();
    expect(resolveUnlockArg("nada")).toBeNull();
    expect(resolveUnlockArg("__proto__")).toBeNull();
  });
});

// --- sistema (unidade) -----------------------------------------------------------------------------------------------

function mkRec(over: Partial<CharacterRecord> = {}): CharacterRecord {
  return { id: 1, accountId: 1, name: "Leo", vocation: "knight", level: 1, xp: 0, x: 1, y: 1, dir: 4, data: {}, ...over };
}
function mkPlayer(over: Record<string, unknown> = {}): any {
  return { id: "s1", name: "Leo", level: 1, x: 10, y: 10, skillMelee: 10, skillDistance: 10, skillShield: 10, magicLevel: 0, title: "", ...over };
}

function setup(opts: { explore?: number; equipped?: number } = {}) {
  const p = mkPlayer();
  const rec = mkRec();
  const sent: Array<[string, string, any]> = [];
  const broadcast: Array<[string, any]> = [];
  const sys = new AchievementSystem({
    record: (id) => (id === "s1" ? rec : undefined),
    getPlayer: (id) => (id === "s1" ? p : undefined),
    players: () => [p],
    send: (id, t, m) => sent.push([id, t, m]),
    broadcast: (t, m) => broadcast.push([t, m]),
    explorePct: () => opts.explore ?? 0,
    equippedCount: () => opts.equipped ?? 0,
  });
  sys.load(p, rec);
  sent.length = 0;
  const done = () => Object.keys(rec.data.ach!.done);
  const toasts = () => sent.filter(([, t]) => t === S2C.AchievementUnlocked).map(([, , m]) => m.id as string);
  return { p, rec, sys, sent, broadcast, done, toasts };
}

describe("conquistas: eventos", () => {
  it("tarefas do ClickUp (work_tasks): online pelo evento, offline pelo registro", () => {
    const t = setup();
    t.sys.event("s1", "work", { n: 10 });
    expect(t.rec.data.ach!.stats.work_tasks).toBe(10);
    for (const a of ACHIEVEMENTS.filter((x) => x.metric === "work_tasks" && x.target <= 10)) expect(t.done()).toContain(a.id);
    const off = mkRec();
    addWorkTasks(off, 3);
    addWorkTasks(off, 2);
    expect(off.data.ach!.stats.work_tasks).toBe(5);
  });

  it("bestiário: conta abates por tipo (chefes incluídos) e quem já tinha a lista antiga aparece com pelo menos 1", () => {
    const t = setup();
    for (let i = 0; i < 3; i++) t.sys.event("s1", "kill", { defId: "rat" });
    t.sys.event("s1", "kill", { defId: "swamp_lich", boss: true });
    t.rec.data.ach!.killed.push("wolf"); // derrotado antes de existir o contador
    t.sys.sendState("s1");
    const st = t.sent.filter(([, ty]) => ty === S2C.Achievements).at(-1)![2] as AchievementsMsg;
    expect(st.bestiary).toEqual({ rat: 3, swamp_lich: 1, wolf: 1 });
    expect(bestiaryOf({ done: {}, stats: {}, killed: [] })).toEqual({});
  });

  it("kill: primeiro abate dá a conquista, o toast e a recompensa (addon); não repete", () => {
    const t = setup();
    t.sys.event("s1", "kill", { defId: "rat" });
    expect(t.done()).toEqual(["first_blood"]);
    expect(t.toasts()).toEqual(["first_blood"]);
    const toast = t.sent.find(([, ty]) => ty === S2C.AchievementUnlocked)![2];
    expect(toast).toMatchObject({ name: "Primeiro Sangue", points: 5, rewards: ["addon:cidadao:1"] });
    expect(t.rec.data.unlocks).toContain("addon:cidadao:1");
    t.sys.event("s1", "kill", { defId: "rat" });
    expect(t.toasts()).toEqual(["first_blood"]);
    expect(t.rec.data.ach!.stats.kills).toBe(2);
    const st = t.sent.filter(([, ty]) => ty === S2C.Achievements).at(-1)![2] as AchievementsMsg;
    expect(st.points).toBe(5);
    expect(st.done.first_blood).toBeGreaterThan(0);
  });

  it("kill: 100 abates liberam o addon 2 do Cidadão; progresso aparece no estado", () => {
    const t = setup();
    for (let i = 0; i < 99; i++) t.sys.event("s1", "kill", { defId: "rat" });
    expect(t.sys.state("s1")!.progress.kills_100).toBe(99);
    t.sys.event("s1", "kill", { defId: "rat" });
    expect(t.done()).toContain("kills_100");
    expect(t.rec.data.unlocks).toContain("addon:cidadao:2");
  });

  it("bestiário: só tipos comuns contam, sem repetição; completar dá a roupa Invocador + título", () => {
    const t = setup();
    t.sys.event("s1", "kill", { defId: "goblin_king", boss: true });
    t.sys.event("s1", "kill", { defId: "summoned_wolf" });
    t.sys.event("s1", "kill", { defId: "training_dummy" });
    expect(t.rec.data.ach!.killed).toEqual([]);
    t.sys.event("s1", "kill", { defId: "rat" });
    t.sys.event("s1", "kill", { defId: "rat" });
    expect(t.rec.data.ach!.killed).toEqual(["rat"]);
    expect(BESTIARY_IDS).not.toContain("goblin_king");
    expect(BESTIARY_IDS).not.toContain("training_dummy");
    expect(BESTIARY_IDS).not.toContain("summoned_wolf");
    for (const id of BESTIARY_IDS) t.sys.event("s1", "kill", { defId: id });
    expect(t.done()).toContain("bestiary_all");
    expect(t.rec.data.unlocks).toEqual(expect.arrayContaining(["outfit:invocador", "title:naturalista"]));
  });

  it("chefes: Rei Goblin libera o Assassino + título e vai ao feed global (rara)", () => {
    const t = setup();
    t.sys.event("s1", "kill", { defId: "goblin_king", boss: true });
    expect(t.done()).toEqual(expect.arrayContaining(["boss_goblin", "first_blood"]));
    expect(t.rec.data.unlocks).toEqual(expect.arrayContaining(["outfit:assassino", "title:regicida"]));
    expect(t.rec.data.ach!.stats.bosses).toBe(1);
    const feed = t.broadcast.filter(([ty]) => ty === S2C.Feed).map(([, m]) => m.text as string);
    expect(feed.some((x) => x.includes("Regicida"))).toBe(true);
    // Não-rara não vai ao feed.
    const t2 = setup();
    t2.sys.event("s1", "kill", { defId: "rat" });
    expect(t2.broadcast).toEqual([]);
  });

  it("death / steps / gold / eat / drop / pickup / quest / party_kill somam contadores e concluem", () => {
    const t = setup();
    for (let i = 0; i < 10; i++) t.sys.event("s1", "death");
    expect(t.done()).toContain("deaths_10");
    expect(t.rec.data.unlocks).toEqual(expect.arrayContaining(["outfit:bruxo", "title:persistente"]));
    t.sys.event("s1", "gold", { n: 10_000 });
    expect(t.done()).toContain("gold_10k");
    t.sys.event("s1", "gold", { n: 40_000 });
    expect(t.rec.data.unlocks).toContain("outfit:nobre");
    for (let i = 0; i < 50; i++) t.sys.event("s1", "eat");
    expect(t.rec.data.unlocks).toContain("outfit:druida");
    for (let i = 0; i < 20; i++) t.sys.event("s1", "drop");
    expect(t.done()).toContain("drop_20");
    for (let i = 0; i < 100; i++) t.sys.event("s1", "pickup");
    expect(t.done()).toContain("pickup_100");
    t.sys.event("s1", "quest");
    expect(t.done()).toContain("quest_1");
    t.sys.event("s1", "quest", { n: 9 });
    expect(t.rec.data.unlocks).toContain("title:heroi_povo");
    t.sys.event("s1", "party_kill", { n: 10 });
    expect(t.done()).toContain("party_10");
  });

  it("offline: 12 h somadas liberam o addon 2 do Druida", () => {
    const t = setup();
    t.sys.event("s1", "offline", { minutes: 400 });
    expect(t.done()).not.toContain("offline_12h");
    t.sys.event("s1", "offline", { minutes: 320 });
    expect(t.done()).toContain("offline_12h");
    expect(t.rec.data.unlocks).toContain("addon:druida:2");
  });

  it("arena: a maior onda vencida conta; onda 20 libera o Pirata", () => {
    const t = setup();
    t.sys.event("s1", "arena", { wave: 5 });
    expect(t.done()).toEqual(expect.arrayContaining(["arena_5"]));
    t.sys.event("s1", "arena", { wave: 3 });
    expect(t.rec.data.ach!.stats.arena).toBe(5);
    t.sys.event("s1", "arena", { wave: 20 });
    expect(t.rec.data.unlocks).toContain("outfit:pirata");
    expect(t.done()).toEqual(expect.arrayContaining(["arena_10", "arena_20"]));
  });

  it("recorde pessoal salvo (arenaBest) também vale no tique", () => {
    const t = setup();
    t.rec.data.arenaBest = 30;
    t.sys.tick(1_000_000);
    expect(t.done()).toEqual(expect.arrayContaining(["arena_30"]));
    expect(t.rec.data.unlocks).toEqual(expect.arrayContaining(["addon:pirata:1", "title:rei_coliseu"]));
  });

  it("estado derivado no tique: level, skills, ML, exploração e equipamento", () => {
    const t = setup({ explore: 61, equipped: 8 });
    Object.assign(t.p, { level: 20, skillMelee: 30, magicLevel: 15, skillDistance: 30, skillShield: 40 });
    t.sys.tick(1_000_000);
    expect(t.done()).toEqual(expect.arrayContaining([
      "level_10", "level_20", "melee_30", "magic_8", "magic_15", "distance_30", "shield_40", "fullset",
    ]));
    // exploração é medida a cada 5 s no tique
    t.sys.tick(1_010_000);
    expect(t.done()).toEqual(expect.arrayContaining(["explore_25", "explore_60"]));
    expect(t.rec.data.unlocks).toEqual(expect.arrayContaining([
      "outfit:cavaleiro", "outfit:guerreiro", "addon:mago:1", "outfit:mago", "outfit:cacador", "title:muralha", "addon:oriental:2", "title:cartografo",
    ]));
  });

  it("passos: deslocamentos curtos contam; teleportes não", () => {
    const t = setup();
    t.sys.tick(1_000_000);
    t.p.x = 11; // 1 tile
    t.sys.tick(1_001_000);
    t.p.x = 14; // 3 tiles
    t.sys.tick(1_002_000);
    t.p.x = 200; // teleporte
    t.sys.tick(1_003_000);
    expect(t.rec.data.ach!.stats.steps).toBe(4);
  });

  it("onUnlock/achievementEvent (ganchos de módulo): concede só a quem está online; ids inválidos são recusados", () => {
    const t = setup();
    setActiveAchievements(t.sys);
    try {
      expect(onUnlock("s1", "outfit:pirata")).toBe(true);
      expect(onUnlock("s1", "outfit:pirata")).toBe(false); // já tinha
      expect(onUnlock("s1", "title:persistente")).toBe(true);
      expect(onUnlock("s1", "outfit:nao_existe")).toBe(false);
      expect(onUnlock("s1", "addon:mago:9")).toBe(false);
      expect(onUnlock("fantasma", "outfit:nobre")).toBe(false);
      expect(t.rec.data.unlocks).toEqual(["outfit:pirata", "title:persistente"]);
      achievementEvent("s1", "quest");
      expect(t.done()).toContain("quest_1");
      achievementEvent("fantasma", "quest"); // não explode
    } finally {
      setActiveAchievements(null);
    }
    expect(onUnlock("s1", "outfit:nobre")).toBe(false); // sem mundo no ar
  });
});

describe("conquistas: títulos", () => {
  it("só escolhe título desbloqueado; reflete em p.title e no estado; '' limpa", () => {
    const t = setup();
    expect(t.sys.onSetTitle(t.p, { title: "persistente" })).toBe(false);
    expect(t.p.title).toBe("");
    for (let i = 0; i < 10; i++) t.sys.event("s1", "death");
    expect(t.sys.onSetTitle(t.p, { title: "persistente" })).toBe(true);
    expect(t.p.title).toBe("o Persistente");
    expect(t.sys.state("s1")!.title).toBe("persistente");
    expect(t.rec.data.ach!.title).toBe("persistente");
    for (const bad of [null, 1, {}, { title: 5 }, { title: "__proto__" }, { title: "x".repeat(100) }, { title: "regicida" }]) {
      expect(t.sys.onSetTitle(t.p, bad), JSON.stringify(bad)).toBe(false);
    }
    expect(t.p.title).toBe("o Persistente");
    expect(t.sys.onSetTitle(t.p, { title: "" })).toBe(true);
    expect(t.p.title).toBe("");
  });

  it("título salvo volta no load", () => {
    const t = setup();
    grantUnlock(t.rec, "title:gladiador");
    t.rec.data.ach!.title = "gladiador";
    const p2 = mkPlayer({ id: "s1" });
    t.sys.load(p2, t.rec);
    expect(p2.title).toBe("o Gladiador");
  });
});

// --- sala: persistência, grandfathering e desbloqueio de roupas ------------------------------------------------------------

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
const auth = (name: string): AuthData => ({ name, key: name.toLowerCase() }) as AuthData;
const send = (r: any, c: any, type: string, m: unknown) => r.onMessageEvents.emit(type, c, m);

beforeEach(() => {
  initDb(":memory:");
  resetAuthState();
  resetRankingCache();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  while (rooms.length) dispose(rooms.pop());
  vi.restoreAllMocks();
});

describe("conquistas: sala", () => {
  it("personagem novo: só a roupa padrão + Cidadão; Pirata e addons bloqueados", () => {
    const r = makeRoom();
    createAccount("Novo", "h", "s", "knight");
    const c = fakeClient(r, "n1");
    r.onJoin(c, {}, auth("Novo"));
    const p = r.state.players.get("n1");
    send(r, c, C2S.SetOutfit, { outfit: "pirata", addons: 0 });
    expect(p.outfit).toBe("cavaleiro");
    send(r, c, C2S.SetOutfit, { outfit: "cidadao", addons: 0 });
    expect(p.outfit).toBe("cidadao");
    send(r, c, C2S.SetOutfit, { outfit: "cidadao", addons: 1 });
    expect(p.addons).toBe(0);
    send(r, c, C2S.SetOutfit, { outfit: "cavaleiro", addons: 2 });
    expect(p.addons).toBe(0);
  });

  it("grandfathering: personagem antigo mantém roupa e addons que já vestia (e eles ficam liberados)", () => {
    const rec = createAccount("Velho", "h", "s", "knight");
    rec.data = { outfit: "pirata", addons: 3 }; // sem rec.data.ach: veio antes das conquistas
    // grava direto
    const r = makeRoom();
    // salva o registro com os dados legados
    r.persist(rec);
    const c = fakeClient(r, "v1");
    r.onJoin(c, {}, auth("Velho"));
    const p = r.state.players.get("v1");
    expect(p.outfit).toBe("pirata");
    expect(p.addons).toBe(3);
    r.onLeave(c, 4000);
    const saved = getCharacterByName("Velho")!;
    expect(saved.data.unlocks).toEqual(expect.arrayContaining(["outfit:pirata", "addon:pirata:1", "addon:pirata:2"]));
    expect(isOutfitUnlocked(saved, "pirata", 2)).toBe(true);
    expect(isOutfitUnlocked(saved, "nobre", 0)).toBe(false); // o que NÃO vestia continua bloqueado
    // Volta a entrar: continua igual, sem reconceder nada novo.
    const c2 = fakeClient(r, "v2");
    r.onJoin(c2, {}, auth("Velho"));
    expect(r.state.players.get("v2")).toMatchObject({ outfit: "pirata", addons: 3 });
  });

  it("progresso persiste ao sair/entrar (contadores, concluídas, desbloqueios) e o título entra no estado", () => {
    const r = makeRoom();
    createAccount("Pers", "h", "s", "knight");
    const c = fakeClient(r, "p1");
    r.onJoin(c, {}, auth("Pers"));
    for (let i = 0; i < 10; i++) achievementEvent("p1", "death");
    achievementEvent("p1", "kill", { defId: "rat" });
    send(r, c, C2S.SetTitle, { title: "persistente" });
    expect(r.state.players.get("p1").title).toBe("o Persistente");
    // toast e estado chegaram ao cliente
    const types = c.send.mock.calls.map((x: any[]) => x[0]);
    expect(types).toContain(S2C.AchievementUnlocked);
    expect(types).toContain(S2C.Achievements);
    send(r, c, C2S.SetOutfit, { outfit: "bruxo", addons: 0 });
    expect(r.state.players.get("p1").outfit).toBe("bruxo");
    r.onLeave(c, 4000);
    const saved = getCharacterByName("Pers")!;
    expect(saved.data.ach).toMatchObject({ title: "persistente" });
    expect(Object.keys(saved.data.ach!.done)).toEqual(expect.arrayContaining(["deaths_10", "first_blood"]));
    expect(saved.data.ach!.stats.deaths).toBe(10);
    const c2 = fakeClient(r, "p2");
    r.onJoin(c2, {}, auth("Pers"));
    expect(r.state.players.get("p2")).toMatchObject({ title: "o Persistente", outfit: "bruxo" });
  });

  it("ganchos ligados: abate (e em grupo), morte, ouro e comida alimentam as conquistas", () => {
    const r = makeRoom();
    createAccount("Hook", "h", "s", "knight");
    const c = fakeClient(r, "h1");
    r.onJoin(c, {}, auth("Hook"));
    const p = r.state.players.get("h1");
    const rec = r.records.get("h1");
    r.combat.hooks.onKillCredit("h1", { def: { id: "goblin_king", boss: true } }, true);
    expect(rec.data.ach.stats).toMatchObject({ kills: 1, bosses: 1, "boss:goblin_king": 1 });
    // Abate em grupo vem só de partyKillCredit (mesmo grupo), não do "mais de um jogador".
    expect(rec.data.ach.stats.party ?? 0).toBe(0);
    r.combat.hooks.onPlayerDied(p, "Rato");
    expect(rec.data.ach.stats.deaths).toBe(1);
    r.inventory.addGold(p, 500);
    expect(rec.data.ach.stats.gold).toBe(500);
    expect(Object.keys(rec.data.ach.done)).toContain("boss_goblin");
    expect(rec.data.unlocks).toContain("outfit:assassino");
  });

  it("abate em grupo: só conta com 2+ membros do MESMO grupo (dano ou perto, vivo)", () => {
    const r = makeRoom();
    const ids = ["g1", "g2", "g3", "g4"];
    for (const [i, name] of ["Gaa", "Gab", "Gac", "Gad"].entries()) {
      createAccount(name, "h", "s", "knight");
      r.onJoin(fakeClient(r, ids[i]!), {}, auth(name));
    }
    const P = (id: string) => r.state.players.get(id);
    for (const id of ids) Object.assign(P(id), { x: 50, y: 50, hp: 100 });
    // g1+g2 num grupo; g3 sozinho; g4 fora de qualquer grupo também.
    r.party.invite(P("g1"), "g2");
    r.party.accept(P("g2"), "g1");
    expect(r.party.sameParty("g1", "g2")).toBe(true);
    const mon = (dmg: string[], extra: Record<string, unknown> = {}) =>
      ({ s: { x: 51, y: 50, ownerId: "" }, def: { id: "rat" }, damageBy: new Map(dmg.map((d) => [d, 10])), ...extra }) as any;

    // Dois sem grupo batendo juntos: não conta.
    expect(r.partyKillCredit(mon(["g3", "g4"]))).toEqual([]);
    // Um membro do grupo + um estranho, com o colega LONGE: não conta.
    Object.assign(P("g2"), { x: 90, y: 90 });
    expect(r.partyKillCredit(mon(["g1", "g3"]))).toEqual([]);
    // Colega perto (curandeiro que não bateu): conta para os dois membros, não para o estranho.
    Object.assign(P("g2"), { x: 52, y: 50 });
    expect(r.partyKillCredit(mon(["g1", "g3"])).sort()).toEqual(["g1", "g2"]);
    // Colega perto mas morto: não conta.
    P("g2").hp = 0;
    expect(r.partyKillCredit(mon(["g1"]))).toEqual([]);
    // Os dois deram dano (mesmo o morto): conta.
    expect(r.partyKillCredit(mon(["g1", "g2"])).sort()).toEqual(["g1", "g2"]);
    // Invocação não conta.
    P("g2").hp = 100;
    expect(r.partyKillCredit({ ...mon(["g1", "g2"]), s: { x: 51, y: 50, ownerId: "g1" } })).toEqual([]);

    // Gancho ligado: o abate de verdade soma "party" só para o grupo.
    r.combat.hooks.onMonsterKilled(mon(["g1", "g3"]));
    expect(r.records.get("g1").data.ach.stats.party).toBe(1);
    expect(r.records.get("g2").data.ach.stats.party).toBe(1);
    expect(r.records.get("g3").data.ach.stats.party ?? 0).toBe(0);
  });

  it("AchievementsRequest devolve o estado completo", () => {
    const r = makeRoom();
    createAccount("Req", "h", "s", "druid");
    const c = fakeClient(r, "r1");
    r.onJoin(c, {}, auth("Req"));
    c.send.mockClear();
    send(r, c, C2S.AchievementsRequest, {});
    const msg = c.send.mock.calls.find((x: any[]) => x[0] === S2C.Achievements)?.[1] as AchievementsMsg;
    expect(msg).toMatchObject({ points: 0, title: "" });
    expect(msg.unlocks).toEqual([]);
  });
});

// --- admin /desbloquear ---------------------------------------------------------------------------------------------------

describe("admin: /desbloquear", () => {
  const ENV = { NODE_ENV: "production", LEMONQUEST_ADMINS: "Leo" };
  function ctx() {
    const leo: any = { id: "a", name: "Leo" };
    const bia: any = { id: "b", name: "Bia" };
    const recs = new Map<string, CharacterRecord>([
      ["a", mkRec({ name: "Leo" })], ["b", mkRec({ id: 2, name: "Bia", vocation: "sorcerer" })],
    ]);
    const offline = mkRec({ id: 9, name: "Caio", vocation: "druid" });
    const sent: Array<[string, string, any]> = [];
    const c: AdminContext = {
      send: (id, t, m) => sent.push([id, t, m]), broadcast: vi.fn(), players: () => [leo, bia],
      record: (id) => recs.get(id), findOffline: (n) => (n.toLowerCase() === "caio" ? offline : undefined), saveOffline: vi.fn(),
      kick: vi.fn(), teleportNear: vi.fn(() => true), resetCode: vi.fn(async () => null),
      grantUnlock: (rec, id) => grantUnlock(rec, id),
      env: ENV, log: () => {},
    };
    return { leo, bia, recs, offline, sent, c };
  }
  const replies = (t: ReturnType<typeof ctx>) => t.sent.filter(([id]) => id === "a").map(([, , m]) => m.text as string);

  it("admin concede roupa, addon e título a online e offline; repetir avisa que já tinha", () => {
    const t = ctx();
    expect(handleAdminCommand(t.leo, "/desbloquear Bia pirata", t.c)).toBe(true);
    expect(handleAdminCommand(t.leo, "/desbloquear bia pirata_chapeu", t.c)).toBe(true);
    expect(handleAdminCommand(t.leo, "/desbloquear Bia persistente", t.c)).toBe(true);
    expect(t.recs.get("b")!.data.unlocks).toEqual(["outfit:pirata", "addon:pirata:1", "title:persistente"]);
    expect(isOutfitUnlocked(t.recs.get("b"), "pirata", 1)).toBe(true);
    handleAdminCommand(t.leo, "/desbloquear Bia pirata", t.c);
    expect(replies(t).at(-1)).toContain("já tinha");
    handleAdminCommand(t.leo, "/desbloquear Caio nobre", t.c);
    expect(t.offline.data.unlocks).toEqual(["outfit:nobre"]);
    expect(t.c.saveOffline).toHaveBeenCalledWith(t.offline);
  });

  it("usos inválidos, alvo inexistente e não-admin", () => {
    const t = ctx();
    handleAdminCommand(t.leo, "/desbloquear", t.c);
    handleAdminCommand(t.leo, "/desbloquear Bia coisa", t.c);
    handleAdminCommand(t.leo, "/desbloquear Fulano pirata", t.c);
    const r = replies(t);
    expect(r[0]).toContain("Uso:");
    expect(r[1]).toContain("Não conheço");
    expect(r[2]).toContain("não encontrado");
    expect(t.recs.get("b")!.data.unlocks).toBeUndefined();
    expect(handleAdminCommand(t.bia, "/desbloquear Bia pirata", t.c)).toBe(false);
    expect(t.recs.get("b")!.data.unlocks).toBeUndefined();
  });
});

// --- ranking ------------------------------------------------------------------------------------------------------------------

describe("ranking", () => {
  function row(name: string, level: number, data: CharacterRecord["data"] = {}, vocation = "knight") {
    return { name, vocation, level, xp: level * 100, data };
  }

  it("categorias, ordenação, top 10 e filtro de zeros", () => {
    const rows = [
      row("A", 30, { arenaBest: 12, skills: { magic: { level: 5, tries: 0 }, melee: { level: 40, tries: 0 } }, ach: { done: { first_blood: 1, kills_100: 1 }, stats: { bosses: 3 }, killed: [] } }),
      row("B", 50, { arenaBest: 20, ach: { done: {}, stats: { bosses: 7 }, killed: [] } }),
      row("C", 50, {}),
      row("D", 10, { skills: { melee: { level: 10, tries: 0 }, distance: { level: 11, tries: 0 } } }),
      ...Array.from({ length: 15 }, (_, i) => row(`N${String(i).padStart(2, "0")}`, 5 + i)),
    ];
    const res = buildRanking(rows, 17, 1234);
    expect(res.generatedAt).toBe(1234);
    expect(res.arenaServerBest).toBe(17);
    expect(res.categories.map((c) => c.id)).toEqual(["level", "points", "arena", "bosses", "magic", "melee", "distance", "fish", "week_xp", "week_kills", "week_fish", "week_bosses"]);
    expect(res.weekEndsAt).toBeGreaterThan(1234);
    const cat = (id: string) => res.categories.find((c) => c.id === id)!;
    expect(cat("level").entries).toHaveLength(10);
    expect(cat("level").entries.map((e) => e.name).slice(0, 3)).toEqual(["B", "C", "A"]); // empate 50: nome
    expect(cat("level").entries[0]).toEqual({ rank: 1, name: "B", vocation: "knight", level: 50, value: 50 });
    expect(cat("points").entries).toEqual([{ rank: 1, name: "A", vocation: "knight", level: 30, value: 15 }]);
    expect(cat("arena").entries.map((e) => [e.name, e.value])).toEqual([["B", 20], ["A", 12]]);
    expect(cat("bosses").entries.map((e) => [e.name, e.value])).toEqual([["B", 7], ["A", 3]]);
    expect(cat("magic").entries.map((e) => [e.name, e.value])).toEqual([["A", 5]]);
    expect(cat("melee").entries.map((e) => [e.name, e.value])).toEqual([["A", 40]]); // 10 = valor inicial, fora
    expect(cat("distance").entries.map((e) => [e.name, e.value])).toEqual([["D", 11]]);
  });

  it("pescador (geral) e categorias semanais: só o ganho desde a linha de base desta semana", () => {
    const now = new Date(2026, 9, 14, 12).getTime(); // quarta-feira, semana 2026-W42
    const w = "2026-W42";
    const base = (xp: number, kills: number, fish: number, bosses: number, id = w) => ({ id, xp, kills, fish, bosses });
    const rows = [
      // A: ganhou 500 de XP, 10 abates, 5 peixes, 1 chefe nesta semana (xp = level*100 = 3000).
      row("A", 30, { week: base(2500, 90, 7, 4), ach: { done: {}, stats: { kills: 100, fish: 12, bosses: 5 }, killed: [] } }),
      // B: muito XP no total, mas a linha de base é da semana passada (não jogou nesta): 0 em tudo.
      row("B", 50, { week: base(100, 0, 0, 0, "2026-W41"), ach: { done: {}, stats: { kills: 900, fish: 300 }, killed: [] } }),
      // C: sem linha de base alguma.
      row("C", 20, { ach: { done: {}, stats: { fish: 40 }, killed: [] } }),
      // D: ganhou 100 de XP e 3 peixes.
      row("D", 10, { week: base(900, 5, 0, 0), ach: { done: {}, stats: { kills: 5, fish: 3 }, killed: [] } }),
    ];
    const res = buildRanking(rows, 0, now);
    const cat = (id: string) => res.categories.find((c) => c.id === id)!;
    expect(cat("fish").entries.map((e) => [e.name, e.value])).toEqual([["B", 300], ["C", 40], ["A", 12], ["D", 3]]);
    expect(cat("week_xp").entries.map((e) => [e.name, e.value])).toEqual([["A", 500], ["D", 100]]);
    expect(cat("week_kills").entries.map((e) => [e.name, e.value])).toEqual([["A", 10]]);
    expect(cat("week_fish").entries.map((e) => [e.name, e.value])).toEqual([["A", 5], ["D", 3]]);
    expect(cat("week_bosses").entries.map((e) => [e.name, e.value])).toEqual([["A", 1]]);
    expect(res.weekEndsAt).toBe(new Date(2026, 9, 19).getTime());
    // Na semana seguinte tudo zera até alguém ganhar algo.
    const next = buildRanking(rows, 0, new Date(2026, 9, 20, 12).getTime());
    expect(next.categories.find((c) => c.id === "week_xp")!.entries).toEqual([]);
  });

  it("endpoint: JSON com recorde do servidor, só nomes de personagem (nunca de conta) e cache de 30 s", () => {
    resetRankingCache();
    createAccount("Heroi", "h", "s", "sorcerer");
    setKv("arena.serverBest", "23");
    const t0 = 1_000_000;
    const body = rankingJson(t0);
    const res = JSON.parse(body);
    expect(res.arenaServerBest).toBe(23);
    expect(res.categories[0].entries).toEqual([{ rank: 1, name: "Heroi", vocation: "sorcerer", level: 1, value: 1 }]);
    expect(body).not.toMatch(/pass_hash|salt|account|conta/i);
    // cache: dentro de 30 s não relê o banco
    createAccount("Outro", "h", "s", "knight");
    expect(rankingJson(t0 + (RANKING_CACHE_S - 1) * 1000)).toBe(body);
    const fresh = JSON.parse(rankingJson(t0 + RANKING_CACHE_S * 1000 + 1));
    expect(fresh.categories[0].entries.map((e: any) => e.name).sort()).toEqual(["Heroi", "Outro"]);
  });

  it("conta com nome diferente do personagem: o nome da conta nunca aparece", async () => {
    const { handleLogin, handleCreateCharacter } = await import("../persistence/auth.ts");
    const a = await handleLogin({ account: "minha-conta-privada", password: "segredo1", create: true });
    if (!a.ok) throw new Error("login");
    const ch = handleCreateCharacter({ session: a.session, name: "Heroina", vocation: "paladin" });
    if (!ch.ok) throw new Error(ch.error);
    resetRankingCache();
    const body = rankingJson(5_000_000);
    expect(body).toContain("Heroina");
    expect(body).not.toContain("minha-conta-privada");
    expect(defaultOutfit("paladin")).toBe("cacador");
  });
});

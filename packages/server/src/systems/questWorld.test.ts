/// <reference types="node" />
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ITEMS, MONSTERS, QUEST_CHESTS, QUEST_OBJECT_RANGE, QUEST_CHEST_GROUPS, QUEST_LEVERS, QUEST_LIST, S2C, TITLES, CHEST_LOCK_BOSSES, chestLockReason, doorBlockReason,
  findObjects, findQuestLevers, findQuestObjects, isValidUnlockId, leverMonsters, monsterDef, type QuestLeverSpot, type QuestObjectSpot, type TiledMap,
} from "@lemonquest/shared";
import type { PlayerState } from "../state.ts";
import { InventorySystem, makeItem } from "./inventory.ts";
import { QuestSystem } from "./quests.ts";
import type { CharacterData } from "../persistence/types.ts";
import { LEVER_ROOM_EMPTY_MS, QuestWorldSystem, leverDayOf, setLeverDayOf } from "./questWorld.ts";
import { openGrid, player, seeded, world } from "./testkit.ts";

const root = fileURLToPath(new URL("../../../../", import.meta.url));

function setup(o: { objects?: QuestObjectSpot[]; levers?: QuestLeverSpot[] } = {}) {
  const w = world({ grid: openGrid(40, 40), spawns: [], defs: monsterDef });
  const inv = new InventorySystem({ send: (to, type, msg) => w.sent.push({ to, type, msg }) });
  const unlocks: string[] = [];
  const quests = new QuestSystem({
    inventory: inv, getPlayer: (id) => w.players.get(id), send: (to, type, msg) => w.sent.push({ to, type, msg }),
    broadcast: (type, msg) => w.sent.push({ to: "*", type, msg }),
    gainXp: () => {}, npcOpen: () => "", zones: [], rng: seeded(3), onUnlock: (_id, u) => unlocks.push(u),
  });
  const qw = new QuestWorldSystem({
    objects: o.objects ?? [], levers: o.levers ?? [], quests, monsters: w.mm, players: () => w.players.values(),
    teleport: (p, x, y) => { p.x = x; p.y = y; },
    send: (to, type, msg) => w.sent.push({ to, type, msg }), broadcast: (type, msg) => w.sent.push({ to: "*", type, msg }),
    now: w.now,
  });
  const mk = (id: string, x: number, y: number, level: number): PlayerState => {
    const p = w.add(player(id, x, y, { level }));
    inv.load(p, {});
    quests.load(p, undefined);
    return p;
  };
  const notices = (id: string) => w.sent.filter((s) => s.to === id && s.type === S2C.Notice).map((s) => s.msg.text as string);
  return { w, inv, quests, qw, mk, notices, unlocks };
}

const CHESTS: QuestObjectSpot[] = [
  { kind: "chest", id: "pirate_saber", x: 10, y: 10 }, { kind: "chest", id: "pirate_bow", x: 12, y: 10 },
  { kind: "chest", id: "anni_bear", x: 20, y: 10 },
];

describe("baús de quest", () => {
  it("abre ao lado, uma vez por grupo: os outros baús do grupo ficam vazios", () => {
    const t = setup({ objects: CHESTS });
    const p = t.mk("p1", 10, 12, 40);
    t.qw.onUse(p, { kind: "chest", id: "pirate_saber" });
    expect(t.notices("p1").at(-1)).toBe("Chegue mais perto.");
    p.y = 11;
    t.qw.onUse(p, { kind: "chest", id: "pirate_saber" });
    expect(t.inv.countItem("p1", "pirate_saber")).toBe(1);
    expect(t.notices("p1").at(-1)).toMatch(/Você encontrou: Sabre do Pirata/);
    expect(t.quests.chestDone("p1", "pirate_treasure")).toBe(true);
    // o outro baú do mesmo grupo: vazio
    p.x = 12;
    t.qw.onUse(p, { kind: "chest", id: "pirate_bow" });
    expect(t.inv.countItem("p1", "corsair_bow")).toBe(0);
    expect(t.notices("p1").at(-1)).toBe("O baú está vazio.");
    // equipamento de baú sai raro
    expect(t.inv.get("p1")!.backpack.find((i) => i?.defId === "pirate_saber")!.rarity).toBe("rare");
  });

  it("exige o level do grupo; persiste no save; título da Aniquilação", () => {
    const t = setup({ objects: CHESTS });
    const p = t.mk("p1", 20, 11, 99);
    t.qw.onUse(p, { kind: "chest", id: "anni_bear" });
    expect(t.notices("p1").at(-1)).toBe("Você precisa ser level 100 para abrir este baú.");
    p.level = 100;
    t.qw.onUse(p, { kind: "chest", id: "anni_bear" });
    expect(t.inv.countItem("p1", "annihilation_bear")).toBe(1);
    expect(t.unlocks).toEqual(["title:aniquilador"]);
    const saved = t.quests.serialize("p1")!;
    expect(saved.chests).toEqual(["annihilator"]);
    t.quests.removePlayer("p1");
    t.quests.load(p, saved);
    expect(t.quests.chestDone("p1", "annihilator")).toBe(true);
    expect(t.quests.stateMsg("p1")!.chests).toEqual(["annihilator"]);
    // grupos desconhecidos no save são ignorados
    t.quests.load(p, { chests: ["annihilator", "nao_existe"] });
    expect(t.quests.serialize("p1")!.chests).toEqual(["annihilator"]);
  });

  it("mensagens inválidas são ignoradas", () => {
    const t = setup({ objects: CHESTS });
    const p = t.mk("p1", 10, 11, 40);
    t.qw.onUse(p, null as never);
    t.qw.onUse(p, { kind: "chest", id: "nada" });
    t.qw.onUse(p, { kind: "x" as never, id: "pirate_saber" });
    expect(t.quests.chestDone("p1", "pirate_treasure")).toBe(false);
  });
});

describe("baús dos covis (ciclo 16): trancados até o personagem derrotar o chefe", () => {
  const LAIR: QuestObjectSpot[] = [
    { kind: "chest", id: "lair_minas_furia", x: 10, y: 10, drawn: true }, { kind: "chest", id: "lair_minas_lich", x: 10, y: 12, drawn: true },
  ];
  const LOCKED = "Trancado: derrote o chefe do covil (Rei Toupeira) para abrir.";

  it("sem o abate: trancado e nada muda; com o abate registrado: abre e entrega ouro, materiais e o equipamento", () => {
    const t = setup({ objects: LAIR });
    const p = t.mk("p1", 11, 11, 30);
    t.qw.onUse(p, { kind: "chest", id: "lair_minas_furia" });
    expect(t.notices("p1").at(-1)).toBe(LOCKED);
    expect(t.quests.chestDone("p1", "lair_minas")).toBe(false);
    expect(t.inv.countItem("p1", "ring_furia")).toBe(0);
    expect(t.inv.get("p1")!.gold).toBe(0);
    // Abate de outro chefe (ou de monstro comum) não destranca este covil.
    t.quests.onKill("lair_kraken", ["p1"]);
    t.quests.onKill("mine_mole", ["p1"]);
    t.qw.onUse(p, { kind: "chest", id: "lair_minas_furia" });
    expect(t.notices("p1").at(-1)).toBe(LOCKED);
    t.quests.onKill("lair_mole_king", ["p1"]);
    expect(t.quests.bossSlain("p1", "lair_mole_king")).toBe(true);
    t.qw.onUse(p, { kind: "chest", id: "lair_minas_furia" });
    expect(t.notices("p1").at(-1)).toMatch(/^Você encontrou: Anel da Fúria, 3x Esmeralda, 3x Barra de Ferro, 4000 de ouro\.$/);
    expect(t.quests.chestDone("p1", "lair_minas")).toBe(true);
    expect([t.inv.countItem("p1", "ring_furia"), t.inv.countItem("p1", "gem_green"), t.inv.countItem("p1", "iron_bar")]).toEqual([1, 3, 3]);
    expect(t.inv.get("p1")!.gold).toBe(4000);
    // a outra escolha do mesmo covil: vazia
    t.qw.onUse(p, { kind: "chest", id: "lair_minas_lich" });
    expect(t.notices("p1").at(-1)).toBe("O baú está vazio.");
    expect(t.inv.countItem("p1", "amulet_lich")).toBe(0);
  });

  it("alt sem o abate não abre, mesmo com a prova (troféu) na mochila", () => {
    const t = setup({ objects: LAIR });
    const main = t.mk("main", 9, 11, 30), alt = t.mk("alt", 11, 11, 30);
    t.quests.onKill("lair_mole_king", ["main"]);
    t.inv.addItem(alt, makeItem("mole_king_claw")); // o principal passou a prova (troca ou chão)
    t.qw.onUse(alt, { kind: "chest", id: "lair_minas_furia" });
    expect(t.notices("alt").at(-1)).toBe(LOCKED);
    expect(t.quests.chestDone("alt", "lair_minas")).toBe(false);
    t.qw.onUse(main, { kind: "chest", id: "lair_minas_lich" });
    expect(t.inv.countItem("main", "amulet_lich")).toBe(1);
  });

  it("o abate fica gravado no personagem (save) e o level do covil vem antes da trava", () => {
    const t = setup({ objects: LAIR });
    const p = t.mk("p1", 11, 11, 24);
    t.quests.onKill("lair_mole_king", ["p1"]);
    const saved = t.quests.serialize("p1")!;
    expect(saved.slain).toEqual(["lair_mole_king"]);
    t.quests.removePlayer("p1");
    t.quests.load(p, { ...saved, slain: [...saved.slain!, "rat", "nao_existe"] }); // só chefes de covil voltam do save
    expect(t.quests.serialize("p1")!.slain).toEqual(["lair_mole_king"]);
    t.qw.onUse(p, { kind: "chest", id: "lair_minas_furia" });
    expect(t.notices("p1").at(-1)).toBe("Você precisa ser level 25 para abrir este baú.");
    p.level = 25;
    t.qw.onUse(p, { kind: "chest", id: "lair_minas_furia" });
    expect(t.quests.chestDone("p1", "lair_minas")).toBe(true);
  });

  it("regra pura: grupo sem trava abre sempre; com trava, só com o abate do chefe do covil", () => {
    const g = QUEST_CHEST_GROUPS.lair_profundo!;
    expect(CHEST_LOCK_BOSSES.has("lair_shogun")).toBe(true);
    expect(chestLockReason(QUEST_CHEST_GROUPS.pirate_treasure!, () => false)).toBeNull();
    expect(chestLockReason(g, (b) => b === "lair_shogun")).toBeNull();
    expect(chestLockReason(g, () => false)).toBe("Trancado: derrote o chefe do covil (Shogun Abissal) para abrir.");
  });
});

const LEVER: QuestLeverSpot = {
  id: "annihilator", x: 5, y: 5,
  plates: [{ x: 4, y: 6 }, { x: 6, y: 6 }, { x: 8, y: 6 }, { x: 10, y: 6 }],
  dests: [{ x: 21, y: 22 }, { x: 21, y: 24 }, { x: 21, y: 26 }, { x: 21, y: 28 }],
  room: { x0: 20, y0: 20, x1: 35, y1: 30 },
  spawns: [{ x: 30, y: 21 }, { x: 30, y: 24 }, { x: 30, y: 27 }, { x: 33, y: 21 }, { x: 33, y: 24 }, { x: 33, y: 27 }],
};

describe("alavanca da Aniquilação", () => {
  const four = (t: ReturnType<typeof setup>, level = 100) => LEVER.plates.map((pl, i) => t.mk(`p${i}`, pl.x, pl.y, level));

  it("precisa de 2 a 4 jogadores nas placas, todos com o level, e a sala vazia", () => {
    const t = setup({ objects: [{ kind: "lever", id: "annihilator", x: 5, y: 5 }], levers: [LEVER] });
    const ps = four(t);
    for (const p of ps.slice(1)) p.x = 11; // só um numa placa
    t.qw.onUse(ps[0]!, { kind: "lever", id: "annihilator" });
    expect(t.notices("p0").at(-1)).toBe("A alavanca não se mexe: de 2 a 4 aventureiros, um em cada placa.");
    expect(t.qw.alive("annihilator")).toBe(0);
    ps.forEach((p, i) => { p.x = LEVER.plates[i]!.x; });
    ps[2]!.level = 90;
    t.qw.onUse(ps[0]!, { kind: "lever", id: "annihilator" });
    expect(t.notices("p0").at(-1)).toMatch(/level 100 ou mais \(p2 não é\)/);
    ps[2]!.level = 100;
    const intruder = t.mk("x", 25, 25, 120);
    t.qw.onUse(ps[0]!, { kind: "lever", id: "annihilator" });
    expect(t.notices("p0").at(-1)).toMatch(/Já há um grupo lá dentro/);
    t.w.players.delete(intruder.id);
    expect(t.qw.alive("annihilator")).toBe(0);
  });

  it("quem puxa precisa estar numa placa (ninguém vai para a sala sem querer); o level dos das placas segue valendo", () => {
    const t = setup({ objects: [{ kind: "lever", id: "annihilator", x: 5, y: 5 }], levers: [LEVER] });
    const ps = [t.mk("p0", LEVER.plates[0]!.x, LEVER.plates[0]!.y, 100), t.mk("p1", LEVER.plates[1]!.x, LEVER.plates[1]!.y, 100)];
    const outsider = t.mk("x", 5, 4, 120); // ao lado da alavanca, fora das placas
    t.qw.onUse(outsider, { kind: "lever", id: "annihilator" });
    expect(t.notices("x").at(-1)).toBe("Suba numa placa para puxar a alavanca.");
    expect(t.qw.alive("annihilator")).toBe(0);
    ps.forEach((p, i) => expect([p.x, p.y]).toEqual([LEVER.plates[i]!.x, LEVER.plates[i]!.y]));
    ps[1]!.level = 99;
    t.qw.onUse(ps[0]!, { kind: "lever", id: "annihilator" });
    expect(t.notices("p0").at(-1)).toMatch(/level 100 ou mais \(p1 não é\)/);
    expect(t.qw.alive("annihilator")).toBe(0);
  });

  it("puxar: leva os quatro para a sala e solta seis demônios (sem respawn); sala vazia por um tempo limpa", () => {
    const t = setup({ objects: [{ kind: "lever", id: "annihilator", x: 5, y: 5 }], levers: [LEVER] });
    const ps = four(t);
    t.qw.onUse(ps[0]!, { kind: "lever", id: "annihilator" });
    ps.forEach((p, i) => expect([p.x, p.y]).toEqual([LEVER.dests[i]!.x, LEVER.dests[i]!.y]));
    expect(t.qw.alive("annihilator")).toBe(6);
    const demons = [...t.w.mm.all()].filter((m) => m.def.id === "demon");
    expect(demons).toHaveLength(6);
    for (const m of demons) {
      expect(m.questLever).toBe("annihilator");
      expect(m.bounds).toEqual(LEVER.room);
      expect(m.arenaId).toBeUndefined();
    }
    // um demônio morto não volta
    t.w.mm.kill(demons[0]!, t.w.now());
    expect(t.qw.alive("annihilator")).toBe(5);
    // todos saem da sala: depois de LEVER_ROOM_EMPTY_MS os demônios somem
    for (const p of ps) { p.x = 1; p.y = 1; }
    t.qw.tick(t.w.now());
    t.w.setClock(t.w.now() + LEVER_ROOM_EMPTY_MS + 1);
    t.qw.tick(t.w.now());
    expect(t.qw.alive("annihilator")).toBe(0);
    expect([...t.w.mm.all()].filter((m) => m.def.id === "demon")).toHaveLength(0);
    expect(t.w.sent.some((s) => s.to === "*" && s.type === S2C.Feed && /alavanca/.test(s.msg.text))).toBe(true);
  });
});

describe("alavanca: uma entrada por dia (dia troca às 6h)", () => {
  const DAY = 24 * 3_600_000;
  const lever = { objects: [{ kind: "lever" as const, id: "annihilator", x: 5, y: 5 }], levers: [LEVER] };
  const pull = (t: ReturnType<typeof setup>, ps: PlayerState[]) => {
    ps.forEach((p, i) => { p.x = LEVER.plates[i]!.x; p.y = LEVER.plates[i]!.y; }); // de volta às placas, sala vazia
    t.qw.onUse(ps[0]!, { kind: "lever", id: "annihilator" });
    return ps.every((p, i) => p.x === LEVER.dests[i]!.x && p.y === LEVER.dests[i]!.y);
  };

  it("entra; no mesmo dia a alavanca recusa; no dia seguinte (depois das 6h) entra de novo", () => {
    const t = setup(lever);
    // 05:00 de Brasília (08:00 UTC) ainda é o dia anterior; 06:00 (09:00 UTC) já é o dia novo.
    t.w.setClock(Date.UTC(2026, 9, 20, 12, 0));
    const ps = [t.mk("p0", 0, 0, 100), t.mk("p1", 0, 0, 100)];
    expect(pull(t, ps)).toBe(true);
    expect(pull(t, ps)).toBe(false);
    expect(t.notices("p0").at(-1)).toBe('A alavanca não se mexe: p0 e p1 já entraram em "A Aniquilação" hoje. Cada aventureiro entra uma vez por dia; a alavanca volta às 6h.');
    t.w.setClock(Date.UTC(2026, 9, 21, 8, 59)); // 05:59 do dia seguinte: ainda o mesmo dia de jogo
    expect(pull(t, ps)).toBe(false);
    t.w.setClock(Date.UTC(2026, 9, 21, 9, 0)); // 06:00
    expect(pull(t, ps)).toBe(true);
  });

  it("grupo com um membro que já entrou hoje: ninguém entra e a mensagem diz quem", () => {
    const t = setup(lever);
    t.w.setClock(Date.UTC(2026, 9, 20, 12, 0));
    const [a, b, c] = [t.mk("p0", 0, 0, 100), t.mk("p1", 0, 0, 100), t.mk("p2", 0, 0, 100)];
    expect(pull(t, [a!, b!])).toBe(true);
    // a e b saem (demônios mortos); c chama a para outra tentativa no mesmo dia
    b!.x = 1; b!.y = 1;
    for (const m of [...t.w.mm.all()]) t.w.mm.despawn(m);
    t.qw.tick(t.w.now());
    expect(pull(t, [c!, a!])).toBe(false);
    expect([c!.x, c!.y]).toEqual([LEVER.plates[0]!.x, LEVER.plates[0]!.y]);
    expect(t.notices("p2").at(-1)).toMatch(/^A alavanca não se mexe: p0 já entrou em "A Aniquilação" hoje\..*volta às 6h\.$/);
    expect(t.qw.alive("annihilator")).toBe(0);
    // c com outro que nunca entrou (a sai da placa): passa
    a!.x = 1; a!.y = 1;
    const d = t.mk("p3", 0, 0, 100);
    expect(pull(t, [c!, d])).toBe(true);
  });

  it("guarda o dia no save do personagem (CharacterData, como o WorldRoom) e o respeita ao recarregar", () => {
    // p0 vem de um save antigo (ciclo 19): o `leverDay` de um campo só conta como a Aniquilação.
    const saves = new Map<string, CharacterData>([["p0", { leverDay: "2026-10-20" }], ["p1", {}]]);
    const t = setup(lever);
    const qw = new QuestWorldSystem({
      objects: lever.objects, levers: lever.levers, quests: t.quests, monsters: t.w.mm, players: () => t.w.players.values(),
      teleport: (p, x, y) => { p.x = x; p.y = y; }, send: (to, type, msg) => t.w.sent.push({ to, type, msg }), now: t.w.now,
      getLeverDay: (id, leverId) => leverDayOf(saves.get(id), leverId),
      setLeverDay: (id, day, leverId) => { const d = saves.get(id); if (d) setLeverDayOf(d, leverId, day); },
    });
    t.w.setClock(Date.UTC(2026, 9, 20, 23, 0)); // 20:00 do dia 20
    const ps = [t.mk("p0", LEVER.plates[0]!.x, LEVER.plates[0]!.y, 100), t.mk("p1", LEVER.plates[1]!.x, LEVER.plates[1]!.y, 100)];
    qw.onUse(ps[0]!, { kind: "lever", id: "annihilator" });
    expect(t.notices("p0").at(-1)).toMatch(/p0 já entrou/);
    t.w.setClock(Date.UTC(2026, 9, 21, 10, 0));
    qw.onUse(ps[0]!, { kind: "lever", id: "annihilator" });
    expect([ps[0]!.x, ps[0]!.y]).toEqual([LEVER.dests[0]!.x, LEVER.dests[0]!.y]);
    // Grava por alavanca e, para a Aniquilação, também no campo antigo (rollback ao ciclo 19 mantém o limite).
    for (const id of ["p0", "p1"]) expect(saves.get(id), id).toEqual({ leverDays: { annihilator: "2026-10-21" }, leverDay: "2026-10-21" });
  });
});

describe("dia de entrada por alavanca no save (ciclo 20)", () => {
  it("save antigo com `leverDay` conta como Aniquilação e não como Crash Test", () => {
    const old: CharacterData = { leverDay: "2026-10-20" };
    expect(leverDayOf(old, "annihilator")).toBe("2026-10-20");
    expect(leverDayOf(old, "crash_test")).toBeUndefined();
    expect(leverDayOf(undefined, "annihilator")).toBeUndefined();
    expect(leverDayOf({}, "crash_test")).toBeUndefined();
  });

  it("gravar uma alavanca não mexe na outra; a Aniquilação vai também no campo antigo", () => {
    const d: CharacterData = { leverDay: "2026-10-20" };
    setLeverDayOf(d, "crash_test", "2026-10-21");
    expect(d).toEqual({ leverDay: "2026-10-20", leverDays: { crash_test: "2026-10-21" } });
    expect(leverDayOf(d, "annihilator")).toBe("2026-10-20");
    setLeverDayOf(d, "annihilator", "2026-10-22");
    expect(d).toEqual({ leverDay: "2026-10-22", leverDays: { crash_test: "2026-10-21", annihilator: "2026-10-22" } });
    expect([leverDayOf(d, "annihilator"), leverDayOf(d, "crash_test")]).toEqual(["2026-10-22", "2026-10-21"]);
  });

  it("rollback ao ciclo 19 gravou só o campo antigo: vale o dia mais recente dos dois", () => {
    expect(leverDayOf({ leverDay: "2026-10-25", leverDays: { annihilator: "2026-10-22" } }, "annihilator")).toBe("2026-10-25");
    expect(leverDayOf({ leverDay: "2026-10-20", leverDays: { annihilator: "2026-10-22" } }, "annihilator")).toBe("2026-10-22");
  });
});

describe("Aniquilação com grupo menor", () => {
  it("demônios na mesma proporção por jogador do grupo cheio (6 ÷ 4 = 1,5, para cima): 4 → 6, 3 → 5, 2 → 3", () => {
    const def = QUEST_LEVERS.annihilator!;
    expect(def.minPlayers).toBe(2);
    expect([1, 2, 3, 4, 5].map((n) => leverMonsters(def, n).length)).toEqual([2, 3, 5, 6, 6]); // fora da faixa: limitado
    expect(leverMonsters(def, 3).every((m) => m === "demon")).toBe(true);
  });

  for (const [plates, demons] of [[[0, 2], 3], [[1, 2, 3], 5]] as const) {
    it(`${plates.length} jogadores nas placas ${plates.join(", ")}: cada um vai para o destino da sua placa e nascem ${demons} demônios`, () => {
      const t = setup({ objects: [{ kind: "lever", id: "annihilator", x: 5, y: 5 }], levers: [LEVER] });
      const ps = plates.map((i) => t.mk(`p${i}`, LEVER.plates[i]!.x, LEVER.plates[i]!.y, 100));
      t.qw.onUse(ps[0]!, { kind: "lever", id: "annihilator" });
      ps.forEach((p, k) => expect([p.x, p.y]).toEqual([LEVER.dests[plates[k]!]!.x, LEVER.dests[plates[k]!]!.y]));
      expect(t.qw.alive("annihilator")).toBe(demons);
      expect([...t.w.mm.all()].filter((m) => m.def.id === "demon")).toHaveLength(demons);
    });
  }
});

/** Segunda alavanca na mesma grade de teste (40×40), longe da sala da Aniquilação (20..35 × 20..30). */
const CRASH: QuestLeverSpot = {
  id: "crash_test", x: 5, y: 12,
  plates: [{ x: 4, y: 13 }, { x: 6, y: 13 }, { x: 8, y: 13 }, { x: 10, y: 13 }],
  dests: [{ x: 2, y: 32 }, { x: 2, y: 34 }, { x: 2, y: 36 }, { x: 2, y: 38 }],
  room: { x0: 1, y0: 31, x1: 15, y1: 39 },
  spawns: [{ x: 10, y: 32 }, { x: 12, y: 35 }, { x: 10, y: 38 }, { x: 14, y: 32 }, { x: 14, y: 35 }, { x: 14, y: 38 }],
};

describe("alavanca do Crash Test (Montadora, ciclo 20)", () => {
  const both = {
    objects: [{ kind: "lever" as const, id: "annihilator", x: 5, y: 5 }, { kind: "lever" as const, id: "crash_test", x: 5, y: 12 }],
    levers: [LEVER, CRASH],
  };
  const pull = (t: ReturnType<typeof setup>, spot: QuestLeverSpot, ps: PlayerState[]) => {
    ps.forEach((p, i) => { p.x = spot.plates[i]!.x; p.y = spot.plates[i]!.y; });
    t.qw.onUse(ps[0]!, { kind: "lever", id: spot.id });
    return ps.every((p, i) => p.x === spot.dests[i]!.x && p.y === spot.dests[i]!.y);
  };

  it("dados: lv 95, 2 a 4 jogadores; o grupo menor solta menos (2 → dublê, montador, dublê; 3 → 5; 4 → 6)", () => {
    const def = QUEST_LEVERS.crash_test!;
    expect([def.minLevel, def.minPlayers, def.players]).toEqual([95, 2, 4]);
    expect(leverMonsters(def, 2)).toEqual(["mt_duble", "mt_robo_montador", "mt_duble"]);
    expect([3, 4].map((n) => leverMonsters(def, n).length)).toEqual([5, 6]);
    // Um anel por vocação, de cima para baixo cavaleiro, paladino, feiticeiro, druida (a ordem da Aniquilação).
    const chests = Object.values(QUEST_CHESTS).filter((c) => c.group === "crash_test");
    expect(chests.map((c) => c.id)).toEqual(["mt_crash_knight", "mt_crash_paladin", "mt_crash_sorcerer", "mt_crash_druid"]);
    expect(chests.map((c) => ITEMS[c.items![0]!.itemId]?.vocations)).toEqual([["knight"], ["paladin"], ["sorcerer"], ["druid"]]);
    for (const c of chests) expect(c.items![1], c.id).toEqual({ itemId: "mt_cromo", count: 2 });
    expect(QUEST_CHEST_GROUPS.crash_test!.minLevel).toBe(def.minLevel);
  });

  it("2 jogadores: vão para os destinos das placas e nascem dublê, montador e dublê, presos na sala", () => {
    const t = setup(both);
    const ps = [t.mk("p0", 0, 0, 95), t.mk("p1", 0, 0, 95)];
    expect(pull(t, CRASH, ps)).toBe(true);
    expect(t.qw.alive("crash_test")).toBe(3);
    const ms = [...t.w.mm.all()];
    expect(ms.map((m) => m.def.id)).toEqual(["mt_duble", "mt_robo_montador", "mt_duble"]);
    for (const m of ms) expect([m.questLever, m.bounds]).toEqual(["crash_test", CRASH.room]);
    expect(t.qw.alive("annihilator")).toBe(0);
  });

  it("texto de início por alavanca: o Crash Test fala de bonecos; a Aniquilação continua falando de demônios", () => {
    const t = setup(both);
    t.w.setClock(Date.UTC(2026, 9, 20, 12, 0));
    const ps = [t.mk("p0", 0, 0, 100), t.mk("p1", 0, 0, 100)];
    expect(pull(t, CRASH, ps)).toBe(true);
    expect(t.notices("p1").at(-1)).toBe("Crash Test começou! Derrube os bonecos e alcance os troféus.");
    expect(pull(t, LEVER, ps)).toBe(true);
    expect(t.notices("p1").at(-1)).toBe("A Aniquilação começou! Derrote os demônios e alcance o tesouro.");
  });

  it("Aniquilação e Crash Test no mesmo dia: cada alavanca tem o seu dia (uma não gasta a entrada da outra)", () => {
    const t = setup(both);
    t.w.setClock(Date.UTC(2026, 9, 20, 12, 0));
    const ps = [t.mk("p0", 0, 0, 100), t.mk("p1", 0, 0, 100)];
    expect(pull(t, LEVER, ps)).toBe(true);
    expect(pull(t, CRASH, ps)).toBe(true);
    expect(pull(t, CRASH, ps)).toBe(false);
    expect(t.notices("p0").at(-1)).toBe('A alavanca não se mexe: p0 e p1 já entraram em "Crash Test" hoje. Cada aventureiro entra uma vez por dia; a alavanca volta às 6h.');
    expect(pull(t, LEVER, ps)).toBe(false);
    expect(t.notices("p0").at(-1)).toMatch(/já entraram em "A Aniquilação" hoje/);
    // Dia seguinte, depois das 6h: as duas voltam.
    t.w.setClock(Date.UTC(2026, 9, 21, 9, 0));
    expect(pull(t, CRASH, ps)).toBe(true);
    expect(pull(t, LEVER, ps)).toBe(true);
  });
});

describe("quests de mundo: dados e mapa", () => {
  const map = JSON.parse(readFileSync(root + "assets/maps/world.json", "utf8")) as TiledMap;

  it("baús: itens existem, grupos existem, todo baú definido está no mapa (e vice-versa)", () => {
    for (const c of Object.values(QUEST_CHESTS)) {
      expect(QUEST_CHEST_GROUPS[c.group], c.id).toBeDefined();
      for (const it of c.items ?? []) expect(ITEMS[it.itemId], `${c.id}/${it.itemId}`).toBeDefined();
      if (c.unlock) expect(isValidUnlockId(c.unlock), c.unlock).toBe(true);
      expect((c.items?.length ?? 0) + (c.gold ?? 0), c.id).toBeGreaterThan(0);
    }
    for (const g of Object.values(QUEST_CHEST_GROUPS)) expect(Object.values(QUEST_CHESTS).some((c) => c.group === g.id), g.id).toBe(true);
    const spots = findQuestObjects(map);
    const onMap = spots.filter((s) => s.kind === "chest").map((s) => s.id).sort();
    expect(onMap).toEqual(Object.keys(QUEST_CHESTS).sort());
    expect(TITLES.aniquilador).toBeDefined();
  });

  it("alavanca: definida, com placas, destinos e posições dos monstros dentro da sala", () => {
    const levers = findQuestLevers(map);
    expect(levers.map((l) => l.id)).toEqual(Object.keys(QUEST_LEVERS));
    for (const l of levers) {
      const d = QUEST_LEVERS[l.id]!;
      expect(l.plates).toHaveLength(d.players);
      expect(l.dests).toHaveLength(d.players);
      expect(l.spawns.length).toBeGreaterThanOrEqual(d.monsters.length);
      for (const m of d.monsters) expect(MONSTERS[m], m).toBeDefined();
      const inside = (p: { x: number; y: number }) => p.x >= l.room.x0 && p.x <= l.room.x1 && p.y >= l.room.y0 && p.y <= l.room.y1;
      for (const p of l.dests.concat(l.spawns)) expect(inside(p), `${p.x},${p.y}`).toBe(true);
      // Quem puxa precisa estar numa placa: ao menos uma ao alcance da alavanca.
      expect(l.plates.some((p) => Math.max(Math.abs(p.x - l.x), Math.abs(p.y - l.y)) <= QUEST_OBJECT_RANGE), l.id).toBe(true);
      for (const p of l.plates) expect(inside(p)).toBe(false);
    }
  });

  it("missões: todo passo 'explore' sem área aponta para uma zona nomeada do mapa", () => {
    // O servidor casa `target` com `name` do objeto "zone" (parseZones); um nome errado deixaria a missão impossível.
    const zones = new Set(findObjects(map, "zone").map((o) => o.name));
    for (const d of QUEST_LIST) {
      for (const s of d.steps) {
        if (s.kind === "explore" && !s.area) expect(zones.has(s.target), `${d.id}/${s.target}`).toBe(true);
      }
    }
  });

  it("motivo das portas", () => {
    const yes = () => true, no = () => false;
    expect(doorBlockReason({ minLevel: 60 }, 59, yes, yes)).toMatch(/level 60/);
    expect(doorBlockReason({ minLevel: 60 }, 60, yes, yes)).toBeNull();
    expect(doorBlockReason({ quest: "yeti_hunt" }, 200, no, yes, () => "O Yeti")).toMatch(/"O Yeti"/);
    expect(doorBlockReason({ chestGroup: "annihilator" }, 200, yes, no)).toMatch(/A Aniquilação/);
  });
});

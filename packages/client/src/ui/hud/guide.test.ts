import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEFAULT_SPAWN, QUEST_LIST, buildWorldIndex, mapSpawn, type QuestsMsg, type TiledMap } from "@lemonquest/shared";
import {
  GUIDE_MAX_LEVEL, dropSources, effectiveRequest, guideTarget, isGuiding, requestFinished, stepDestination, toggledRequest,
  type GuideInput,
} from "./guide.ts";

const root = fileURLToPath(new URL("../../../../../", import.meta.url));
const map = JSON.parse(readFileSync(root + "assets/maps/world.json", "utf8")) as TiledMap;
const index = buildWorldIndex(map);
const captain = index.npcAt("guard_captain")!;

const none = () => 0;
const qs = (o: Partial<QuestsMsg> = {}): QuestsMsg => ({ active: [], done: [], tracked: [], bounties: { day: "", resetsAt: 0, list: [] }, ...o });
const input = (o: Partial<GuideInput>): GuideInput => ({ level: 1, quests: qs(), count: none, request: null, me: captain, index, ...o });

describe("guia do novato (primeira missão, sem pedido)", () => {
  it("sem missão aceita: aponta o Capitão", () => {
    const t = guideTarget(input({ me: { x: 79, y: 90 } }))!;
    expect(t).toMatchObject({ x: captain.x, y: captain.y });
    expect(t.label).toMatch(/pegue a missão/);
    expect(t.hop).toBeUndefined();
  });
  it("aceita: aponta o spawn de ratos mais perto; com 5 ratos: volta ao Capitão", () => {
    const t = guideTarget(input({ quests: qs({ active: [{ id: "rats_barn", progress: [2] }] }) }))!;
    expect(index.spawnsOf("rat").some((s) => s.x === t.x && s.y === t.y)).toBe(true);
    expect(t.label).toBe("Ratos — Floresta Sussurrante");
    expect(guideTarget(input({ quests: qs({ active: [{ id: "rats_barn", progress: [5] }] }) }))!.label).toMatch(/entregue a missão/);
  });
  it("some quando a missão termina, passando do level ou sem estado", () => {
    expect(guideTarget(input({ level: 2, quests: qs({ done: ["rats_barn"] }) }))).toBeNull();
    expect(guideTarget(input({ level: GUIDE_MAX_LEVEL + 1 }))).toBeNull();
    expect(guideTarget(input({ quests: null }))).toBeNull();
    expect(effectiveRequest(null, 1, qs())).toEqual({ kind: "quest", id: "rats_barn" });
  });
  it("botão do novato: aparece 'Guiando' sem pedido; 'Parar' grava off e a seta some (não volta sozinha)", () => {
    const novice = effectiveRequest(null, 1, qs());
    expect(isGuiding(novice, "quest", "rats_barn")).toBe(true);
    expect(isGuiding(novice, "quest", "slime_salve")).toBe(false);
    const off = toggledRequest(novice, "quest", "rats_barn");
    expect(off).toEqual({ kind: "off" });
    expect(effectiveRequest(off, 1, qs())).toBeNull();
    expect(guideTarget(input({ request: off }))).toBeNull();
    expect(requestFinished(off, qs())).toBe(false);
    // Desligado: clicar de novo liga o pedido explícito.
    expect(toggledRequest(effectiveRequest(off, 1, qs()), "quest", "rats_barn")).toEqual({ kind: "quest", id: "rats_barn" });
    // Pedido explícito de outra coisa: o botão da recompensa liga ela, sem apagar nada além.
    expect(toggledRequest(novice, "bounty", "rat")).toEqual({ kind: "bounty", monster: "rat" });
    expect(isGuiding({ kind: "bounty", monster: "rat" }, "bounty", "rat")).toBe(true);
  });
});

describe("guia de uma missão pedida (botão Guiar)", () => {
  it("passo 'falar com': aponta o NPC com o texto do passo", () => {
    const t = guideTarget(input({ level: 5, request: { kind: "quest", id: "pesquisa_de_clima" }, quests: qs({ active: [{ id: "pesquisa_de_clima", progress: [0, 0, 0, 0] }] }) }))!;
    const bento = index.npcAt("shop")!;
    expect(t).toMatchObject({ x: bento.x, y: bento.y, label: "Perguntar ao Bento" });
    // Primeiro passo feito: vai para o próximo que falta.
    expect(guideTarget(input({ level: 5, request: { kind: "quest", id: "pesquisa_de_clima" }, quests: qs({ active: [{ id: "pesquisa_de_clima", progress: [1, 0, 0, 0] }] }) }))!.label).toBe("Perguntar à Dona Marta");
  });

  it("entregar item: aponta quem solta o item; explorar: a zona; de outra região, a seta vai ao portal", () => {
    expect(dropSources("slime_goo")).toContain("slime");
    const slime = guideTarget(input({ level: 3, request: { kind: "quest", id: "slime_salve" }, quests: qs({ active: [{ id: "slime_salve", progress: [0] }] }) }))!;
    expect(index.spawnsOf("slime").some((s) => s.x === slime.dest.x && s.y === slime.dest.y)).toBe(true);
    expect(slime.label).toMatch(/^Gosma — .+ \(Floresta Sussurrante\)$/);

    // "Chegou!" começa na Oficina dos Engenhos (região fechada): o destino é a Floresta e a seta aponta a porta da Oficina.
    const juliao = index.npcAt("juliao")!;
    const t = guideTarget(input({ level: 6, me: juliao, request: { kind: "quest", id: "chegou" }, quests: qs({ active: [{ id: "chegou", progress: [0, 0, 0] }] }) }))!;
    expect(index.zoneAt(t.dest.x, t.dest.y)).toBe("Floresta Sussurrante");
    expect(t.hop).toMatchObject({ kind: "portal", label: "Vila de Pedra Clara" });
    expect(t.label).toBe("Ir à Floresta atrás dos ratos\n→ Vila de Pedra Clara");
    expect({ x: t.x, y: t.y }).toEqual({ x: t.hop!.x, y: t.hop!.y });
  });

  it("recompensa do Quadro: spawn do monstro (porta da cave no caminho); pronta: volta ao Quadro", () => {
    const b = (progress: number, status: "open" | "active" = "active") => qs({ bounties: { day: "", resetsAt: 0, list: [{ monster: "mine_larva", count: 10, progress, status, xp: 1, gold: 1 }] } });
    const req = { kind: "bounty", monster: "mine_larva" } as const;
    const t = guideTarget(input({ level: 15, request: req, quests: b(0) }))!;
    expect(index.zoneAt(t.dest.x, t.dest.y)).toBe("Minas Abandonadas");
    expect(t.hop).toMatchObject({ x: 89, y: 74, label: "Minas Abandonadas · lv 10+" });
    const board = index.npcAt("bounty_board")!;
    expect(guideTarget(input({ level: 15, request: req, quests: b(10) }))!).toMatchObject({ x: board.x, y: board.y });
    expect(guideTarget(input({ level: 15, request: req, quests: b(0, "open") }))!.label).toMatch(/aceite/);
  });

  it("rota pelas portas que o personagem abre: lv 90 vai ao demônio do Abismo, não ao da Cidadela (porta lv 100)", () => {
    const b = qs({ bounties: { day: "", resetsAt: 0, list: [{ monster: "demon", count: 10, progress: 0, status: "active", xp: 1, gold: 1 }] } });
    const req = { kind: "bounty", monster: "demon" } as const;
    const porto = { x: 372, y: 64 };
    const lv90 = guideTarget(input({ level: 90, me: porto, request: req, quests: b }))!;
    expect(index.zoneAt(lv90.dest.x, lv90.dest.y)).toBe("Abismo");
    expect(lv90.hop?.kind === "portal" ? index.portalAt(lv90.hop.x, lv90.hop.y)!.minLevel ?? 0 : 0).toBeLessThanOrEqual(90);
    // Com lv 100 a porta abre e a Cidadela, mais perto do Porto, volta a valer.
    const lv100 = guideTarget(input({ level: 100, me: porto, request: req, quests: b }))!;
    expect(index.zoneAt(lv100.dest.x, lv100.dest.y)).toBe("Cidadela de Ferumbras");
    // Destino só atrás de porta fechada (larva das Minas no lv 5): a seta ainda leva até a porta (rótulo vermelho).
    const larva = qs({ bounties: { day: "", resetsAt: 0, list: [{ monster: "mine_larva", count: 10, progress: 0, status: "active", xp: 1, gold: 1 }] } });
    expect(guideTarget(input({ level: 5, request: { kind: "bounty", monster: "mine_larva" }, quests: larva }))!.hop).toMatchObject({ x: 89, y: 74 });
  });

  it("pedido de tile (Agenda) e fim do pedido", () => {
    expect(guideTarget(input({ level: 30, request: { kind: "tile", x: 80, y: 90, label: "Evento" } }))).toMatchObject({ x: 80, y: 90, label: "Evento" });
    expect(requestFinished({ kind: "quest", id: "rats_barn" }, qs({ done: ["rats_barn"] }))).toBe(true);
    expect(requestFinished({ kind: "quest", id: "rats_barn" }, qs())).toBe(false);
    expect(requestFinished({ kind: "bounty", monster: "rat" }, qs())).toBe(true);
    expect(requestFinished({ kind: "tile", x: 1, y: 1, label: "" }, qs())).toBe(false);
  });

  it("sem índice (mapa ainda carregando): nada a apontar, exceto tile", () => {
    expect(guideTarget(input({ index: null }))).toBeNull();
    expect(guideTarget(input({ index: null, request: { kind: "tile", x: 1, y: 2, label: "X" } }))).toMatchObject({ x: 1, y: 2 });
  });
});

describe("conferência com o mapa real: o guia acha todo passo de missão", () => {
  it("todo passo tem destino (NPC, zona, spawn ou loja) alcançável do templo por terra, portal ou viagem", () => {
    const spawn = mapSpawn(map, DEFAULT_SPAWN);
    const lost: string[] = [];
    for (const q of QUEST_LIST) {
      q.steps.forEach((s, k) => {
        const d = stepDestination(s, index, spawn, () => 0);
        if (!d || !Number.isFinite(index.travelCost(spawn, d))) lost.push(`${q.id}#${k} (${s.kind} ${s.target})`);
      });
      if (!index.npcAt(q.giver)) lost.push(`${q.id}: quem dá (${q.giver}) não está no mapa`);
    }
    expect(lost).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import {
  ABYSS_ITEM_IDS, BOUNTY_BANDS, BOUNTY_CHEST_ID, ITEMS, MONSTERS, QUEST_LIST, QUESTS, RARITIES, S2C, isEquipable, isExclusiveItem, itemDef, npcMarker, npcDef,
  applyXpStage, bountyTitle, isValidUnlockId, pluralPt, questStatus, questsForNpc, xpForLevel, type QuestDef, type QuestsMsg,
} from "@lemonquest/shared";
import type { PlayerState } from "../state.ts";
import { InventorySystem, makeItem } from "./inventory.ts";
import { QuestSystem, chestEligible, chestFallbackGem, chestGearPool, rollChest, type ZoneRect } from "./quests.ts";
import { bountyDay, generateBounties, nextBountyReset, tzOffsetMs } from "./bounties.ts";
import { player, seeded } from "./testkit.ts";

const ZONES: ZoneRect[] = [{ name: "Pântano Turvo", x0: 100, y0: 40, x1: 150, y1: 90 }];

function qworld(o: { now?: number; quests?: QuestDef[] } = {}) {
  let clock = o.now ?? Date.UTC(2026, 9, 12, 15, 0); // 12:00 em Brasília
  const sent: { to: string; type: string; msg: any }[] = [];
  const send = (to: string, type: string, msg: unknown) => sent.push({ to, type, msg: structuredClone(msg) });
  const inv = new InventorySystem({ send });
  const open = new Map<string, string>();
  const players = new Map<string, PlayerState>();
  const xp: { id: string; n: number }[] = [];
  const unlocks: string[] = [];
  const qs = new QuestSystem({
    inventory: inv, getPlayer: (id) => players.get(id), send, broadcast: (t, m) => send("*", t, m),
    gainXp: (p, n) => { xp.push({ id: p.id, n }); p.xp += n; },
    npcOpen: (id) => open.get(id) ?? "",
    zones: ZONES, now: () => clock, rng: seeded(7), onUnlock: (_id, u) => unlocks.push(u),
    quests: o.quests,
  });
  const mk = (id = "p1", over: Partial<PlayerState> = {}, data?: Parameters<QuestSystem["load"]>[1]) => {
    const p = player(id, 70, 80, over);
    players.set(id, p);
    inv.load(p, {});
    qs.load(p, data);
    return p;
  };
  const state = (id = "p1"): QuestsMsg => qs.stateMsg(id)!;
  const notices = () => sent.filter((s) => s.type === S2C.Notice).map((s) => s.msg.text as string);
  return { qs, inv, open, players, sent, xp, unlocks, mk, state, notices, setClock: (t: number) => { clock = t; }, now: () => clock };
}

describe("quests: catálogo", () => {
  it("ids únicos, NPCs, monstros e itens existentes, pré-requisitos válidos e sem ciclos", () => {
    expect(QUEST_LIST.length).toBeGreaterThanOrEqual(10);
    for (const d of QUEST_LIST) {
      expect(npcDef(d.giver), d.id).toBeDefined();
      for (const r of d.requires ?? []) expect(QUESTS[r], `${d.id} → ${r}`).toBeDefined();
      for (const s of d.steps) {
        if (s.kind === "kill" || s.kind === "boss") expect(MONSTERS[s.target], `${d.id}/${s.target}`).toBeDefined();
        if (s.kind === "boss") expect(MONSTERS[s.target]!.boss).toBe(true);
        if (s.kind === "collect" || s.kind === "deliver") expect(itemDef(s.target), `${d.id}/${s.target}`).toBeDefined();
        if (s.kind === "talk") expect(npcDef(s.target)).toBeDefined();
        expect(s.count).toBeGreaterThan(0);
      }
      if (d.rewards.unlock) expect(isValidUnlockId(d.rewards.unlock), d.rewards.unlock).toBe(true);
      for (const it of d.rewards.items ?? []) expect(itemDef(it.itemId), `${d.id}/${it.itemId}`).toBeDefined();
      for (const k of ["offer", "accept", "progress", "complete"] as const) expect(d.dialog[k].length).toBeGreaterThan(10);
      // Pré-requisitos não pedem level maior que a própria missão.
      for (const r of d.requires ?? []) expect(QUESTS[r]!.minLevel).toBeLessThanOrEqual(d.minLevel);
    }
    expect(new Set(QUEST_LIST.map((d) => d.id)).size).toBe(QUEST_LIST.length);
    // Os dois chefes e o coliseu estão no fim das cadeias.
    const kinds = QUEST_LIST.flatMap((d) => d.steps.map((s) => `${s.kind}:${s.target}`));
    expect(kinds).toEqual(expect.arrayContaining(["boss:swamp_lich", "boss:goblin_king", "arena:"]));
  });

  it("XP de recompensa entre ~0,3 e 2 levels no level mínimo da missão", () => {
    for (const d of QUEST_LIST) {
      const span = xpForLevel(d.minLevel + 1) - xpForLevel(d.minLevel);
      expect(d.rewards.xp, d.id).toBeGreaterThanOrEqual(span * 0.3);
      expect(d.rewards.xp, d.id).toBeLessThanOrEqual(span * 2.5);
    }
  });
});

describe("quests: aceitar, progredir, entregar", () => {
  it("matar: aceita no NPC certo, conta abates, entrega e recompensa", () => {
    const w = qworld();
    const p = w.mk();
    w.qs.onAction(p, { action: "accept", questId: "rats_barn" });
    expect(w.state().active).toEqual([]); // janela do NPC fechada
    w.open.set("p1", "guard_captain");
    w.qs.onAction(p, { action: "accept", questId: "rats_barn" });
    expect(w.state().active).toEqual([{ id: "rats_barn", progress: [0] }]);
    expect(w.state().tracked).toEqual(["rats_barn"]);
    for (let i = 0; i < 3; i++) w.qs.onKill("rat", ["p1"]);
    w.qs.onKill("slime", ["p1"]);
    expect(w.state().active[0]!.progress).toEqual([3]);
    w.qs.onAction(p, { action: "turnIn", questId: "rats_barn" });
    expect(w.notices().at(-1)).toMatch(/ainda não está completa/);
    for (let i = 0; i < 5; i++) w.qs.onKill("rat", ["p1"]);
    expect(w.state().active[0]!.progress).toEqual([5]); // não passa do total
    const gold0 = w.inv.gold("p1");
    w.qs.onAction(p, { action: "turnIn", questId: "rats_barn" });
    expect(w.state().done).toEqual(["rats_barn"]);
    expect(w.state().active).toEqual([]);
    expect(w.inv.gold("p1") - gold0).toBe(QUESTS.rats_barn!.rewards.gold);
    expect(w.xp).toEqual([{ id: "p1", n: QUESTS.rats_barn!.rewards.xp }]);
    expect(w.inv.countItem("p1", "health_potion")).toBe(5);
    const done = w.sent.find((s) => s.type === S2C.QuestComplete)!;
    expect(done.msg).toMatchObject({ name: "Ratos no Celeiro", xp: 100, gold: 30 });
    // Não repete.
    w.qs.onAction(p, { action: "accept", questId: "rats_barn" });
    expect(w.state().active).toEqual([]);
  });

  it("crédito de abate para todos da lista (grupo/dano compartilhado)", () => {
    const w = qworld();
    const a = w.mk("a"), b = w.mk("b");
    for (const p of [a, b]) { w.open.set(p.id, "guard_captain"); w.qs.onAction(p, { action: "accept", questId: "rats_barn" }); }
    w.qs.onKill("rat", ["a", "b", "a"]);
    expect(w.state("a").active[0]!.progress).toEqual([1]);
    expect(w.state("b").active[0]!.progress).toEqual([1]);
  });

  it("pré-requisitos e level mínimo", () => {
    const w = qworld();
    const p = w.mk("p1", { level: 3 });
    w.open.set("p1", "guard_captain");
    w.qs.onAction(p, { action: "accept", questId: "forest_wolves" });
    expect(w.state().active).toEqual([]);
    p.level = 10;
    w.qs.onAction(p, { action: "accept", questId: "forest_wolves" });
    expect(w.state().active).toEqual([]); // falta rats_barn
    w.qs.devCommand(p, ["complete", "rats_barn"]);
    w.qs.onAction(p, { action: "accept", questId: "forest_wolves" });
    expect(w.state().active.map((a) => a.id)).toEqual(["forest_wolves"]);
  });

  it("entregar: consome os itens ao entregar; coletar: só confere", () => {
    const w = qworld();
    const p = w.mk("p1", { level: 25 });
    w.open.set("p1", "herbalist");
    w.qs.onAction(p, { action: "accept", questId: "slime_salve" });
    w.inv.addItem(p, makeItem("slime_goo", 3));
    w.qs.onAction(p, { action: "turnIn", questId: "slime_salve" });
    expect(w.state().done).toEqual([]);
    w.inv.addItem(p, makeItem("slime_goo", 4));
    w.qs.onAction(p, { action: "turnIn", questId: "slime_salve" });
    expect(w.state().done).toEqual(["slime_salve"]);
    expect(w.inv.countItem("p1", "slime_goo")).toBe(2);

    // Lich (ciclo 14): só o chefe; a chave que cai é lembrança e não é pedida nem consumida.
    const ql = qworld();
    const q = ql.mk("p1", { level: 25 }, { done: ["rats_barn", "forest_wolves", "swamp_report"] });
    ql.open.set("p1", "priest");
    ql.qs.onAction(q, { action: "accept", questId: "swamp_lich" });
    ql.qs.onAction(q, { action: "turnIn", questId: "swamp_lich" });
    expect(ql.state().done).not.toContain("swamp_lich");
    ql.inv.addItem(q, makeItem("crypt_key"));
    ql.qs.onKill("swamp_lich", ["p1"]);
    ql.qs.onAction(q, { action: "turnIn", questId: "swamp_lich" });
    expect(ql.state().done).toContain("swamp_lich");
    expect(ql.inv.countItem("p1", "crypt_key")).toBe(1);
    expect(ql.unlocks).toEqual(["addon:invocador:2"]);
    expect(ql.sent.some((s) => s.to === "*" && s.type === S2C.Feed)).toBe(true);
  });

  it("chefes com prova (Rei Goblin, Lich): um abate conclui para o grupo inteiro, sem item de prova (14-6)", () => {
    for (const d of [QUESTS.goblin_king!, QUESTS.swamp_lich!]) {
      expect(d.steps.map((s) => s.kind), d.id).toEqual(["boss"]);
    }
    const w = qworld();
    const pre = { done: ["rats_barn", "forest_wolves", "swamp_report", "ruins_goblins"] };
    const group = ["a", "b", "c", "d"].map((id) => w.mk(id, { level: 40 }, pre));
    for (const p of group) { w.open.set(p.id, "guard_captain"); w.qs.onAction(p, { action: "accept", questId: "goblin_king" }); }
    // A coroa cai uma vez só (loot do abate); o crédito do chefe vai para todos.
    w.inv.addItem(group[0]!, makeItem("goblin_crown"));
    w.qs.onKill("goblin_king", group.map((p) => p.id));
    for (const p of group) {
      w.qs.onAction(p, { action: "turnIn", questId: "goblin_king" });
      expect(w.state(p.id).done, p.id).toContain("goblin_king");
    }
    expect(w.inv.countItem("a", "goblin_crown")).toBe(1); // vira lembrança
  });

  it("progresso salvo antes do ciclo 14 no passo removido: a missão carrega e entrega normalmente", () => {
    const w = qworld();
    // Chefe já morto e prova não entregue (o caso de quem ficou sem a coroa no grupo).
    const p = w.mk("p1", { level: 40 }, { active: { goblin_king: [1, 0], swamp_lich: [1, 0] } });
    expect(w.state().active).toEqual([{ id: "goblin_king", progress: [1] }, { id: "swamp_lich", progress: [1] }]);
    for (const [npc, id] of [["guard_captain", "goblin_king"], ["priest", "swamp_lich"]] as const) {
      w.open.set("p1", npc);
      w.qs.onAction(p, { action: "turnIn", questId: id });
    }
    expect(w.state().done).toEqual(["goblin_king", "swamp_lich"]);
    // Chefe ainda vivo: continua pedindo o chefe.
    const w2 = qworld();
    w2.mk("p1", { level: 40 }, { active: { goblin_king: [0, 0] } });
    expect(w2.state().active).toEqual([{ id: "goblin_king", progress: [0] }]);
  });

  it("falar com outro NPC e explorar uma zona", () => {
    const w = qworld();
    const p = w.mk("p1", { level: 12 }, { done: ["rats_barn"] });
    w.open.set("p1", "guard_captain");
    w.qs.onAction(p, { action: "accept", questId: "forest_wolves" });
    w.qs.onTalk(p, "herbalist");
    expect(w.state().active[0]!.progress).toEqual([0, 0]);
    w.qs.onTalk(p, "old_hunter");
    expect(w.state().active[0]!.progress).toEqual([1, 0]);

    w.qs.devCommand(p, ["complete", "forest_wolves"]);
    w.qs.onAction(p, { action: "accept", questId: "swamp_report" });
    w.qs.tick(w.now(), [p]);
    expect(w.state().active.find((a) => a.id === "swamp_report")!.progress).toEqual([0, 0]);
    p.x = 120; p.y = 60; // dentro do Pântano Turvo
    w.qs.tick(w.now(), [p]);
    expect(w.state().active.find((a) => a.id === "swamp_report")!.progress).toEqual([1, 0]);
  });

  it("coliseu: onda vencida conta o máximo", () => {
    const w = qworld();
    const p = w.mk("p1", { level: 20 });
    w.open.set("p1", "arena_master");
    w.qs.onAction(p, { action: "accept", questId: "arena_glory" });
    w.qs.onArenaWave("p1", 3);
    w.qs.onArenaWave("p1", 2);
    expect(w.state().active[0]!.progress).toEqual([3]);
    w.qs.onArenaWave("p1", 7);
    expect(w.state().active[0]!.progress).toEqual([5]);
    w.qs.onAction(p, { action: "turnIn", questId: "arena_glory" });
    expect(w.state().done).toEqual(["arena_glory"]);
  });

  it("entregar a outro NPC (passo deliver com npc)", () => {
    const custom: QuestDef = {
      id: "parcel", name: "Encomenda", giver: "shop", minLevel: 1, summary: "x",
      steps: [{ kind: "deliver", target: "herb", count: 2, npc: "herbalist", label: "Ervas" }],
      dialog: { offer: "o", accept: "a", progress: "p", complete: "c" }, rewards: { xp: 1, gold: 1 },
    };
    const w = qworld({ quests: [custom] });
    const p = w.mk();
    w.open.set("p1", "shop");
    w.qs.onAction(p, { action: "accept", questId: "parcel" });
    w.inv.addItem(p, makeItem("herb", 3));
    w.qs.onTalk(p, "herbalist");
    expect(w.inv.countItem("p1", "herb")).toBe(1);
    expect(w.state().active[0]!.progress).toEqual([2]);
    w.qs.onAction(p, { action: "turnIn", questId: "parcel" });
    expect(w.state().done).toEqual(["parcel"]);
  });

  it("abandonar e rastrear (máx. 3)", () => {
    const w = qworld();
    const p = w.mk("p1", { level: 40 });
    for (const [npc, id] of [["guard_captain", "rats_barn"], ["herbalist", "slime_salve"], ["old_hunter", "bee_hunt"], ["arena_master", "arena_glory"]] as const) {
      w.open.set("p1", npc);
      w.qs.onAction(p, { action: "accept", questId: id });
    }
    expect(w.state().active).toHaveLength(4);
    expect(w.state().tracked).toEqual(["rats_barn", "slime_salve", "bee_hunt"]);
    w.qs.onAction(p, { action: "track", questId: "arena_glory", on: true });
    expect(w.state().tracked).toEqual(["slime_salve", "bee_hunt", "arena_glory"]);
    w.qs.onAction(p, { action: "abandon", questId: "bee_hunt" });
    expect(w.state().tracked).toEqual(["slime_salve", "arena_glory"]);
    expect(w.state().active.map((a) => a.id)).not.toContain("bee_hunt");
  });

  it("persistência: serialize → load preserva progresso, concluídas, rastreio e recompensas do dia", () => {
    const w = qworld();
    const p = w.mk("p1", { level: 12 });
    w.open.set("p1", "guard_captain");
    w.qs.onAction(p, { action: "accept", questId: "rats_barn" });
    w.qs.onKill("rat", ["p1"]);
    w.qs.onKill("rat", ["p1"]);
    w.qs.devCommand(p, ["complete", "slime_salve"]);
    w.open.set("p1", "bounty_board");
    w.qs.onAction(p, { action: "bountyAccept", index: 1 });
    const mon = w.state().bounties.list[1]!.monster;
    w.qs.onKill(mon, ["p1"]);
    const saved = JSON.parse(JSON.stringify(w.qs.serialize("p1")));
    const w2 = qworld({ now: w.now() });
    w2.mk("p1", { level: 12 }, saved);
    expect(w2.state()).toEqual(w.state());
    // Dados corrompidos/desconhecidos são ignorados.
    const w3 = qworld();
    w3.mk("p1", {}, { active: { nope: [1], rats_barn: [99] as number[] }, done: ["xx"], tracked: ["nope"] });
    expect(w3.state().active).toEqual([{ id: "rats_barn", progress: [5] }]);
    expect(w3.state().done).toEqual([]);
    expect(w3.state().tracked).toEqual([]);
  });

  it("/quest reset e complete", () => {
    const w = qworld();
    const p = w.mk();
    expect(w.qs.devCommand(p, ["complete", "rats_barn"])).toMatch(/concluída/);
    expect(w.state().done).toEqual(["rats_barn"]);
    expect(w.qs.devCommand(p, ["reset", "rats_barn"])).toMatch(/reiniciada/);
    expect(w.state().done).toEqual([]);
    expect(w.qs.devCommand(p, ["reset", "zzz"])).toMatch(/desconhecida/);
  });
});

describe("recompensas diárias", () => {
  it("dia troca às 06:00 de Brasília, qualquer que seja o TZ do servidor", () => {
    expect(tzOffsetMs(Date.UTC(2026, 9, 12, 12))).toBe(-3 * 3_600_000);
    // 08:59 UTC = 05:59 em Brasília → ainda é o dia anterior.
    expect(bountyDay(Date.UTC(2026, 9, 12, 8, 59))).toBe("2026-10-11");
    expect(bountyDay(Date.UTC(2026, 9, 12, 9, 0))).toBe("2026-10-12");
    expect(bountyDay(Date.UTC(2026, 9, 13, 2, 0))).toBe("2026-10-12"); // 23:00 local
    expect(nextBountyReset(Date.UTC(2026, 9, 12, 15))).toBe(Date.UTC(2026, 9, 13, 9));
    expect(nextBountyReset(Date.UTC(2026, 9, 12, 8))).toBe(Date.UTC(2026, 9, 12, 9));
    // Virada de ano.
    expect(bountyDay(Date.UTC(2027, 0, 1, 5))).toBe("2026-12-31");
    expect(nextBountyReset(Date.UTC(2026, 11, 31, 20))).toBe(Date.UTC(2027, 0, 1, 9));
  });

  it("geração determinística por dia + faixa; 3 monstros distintos da faixa", () => {
    const a = generateBounties("2026-10-12", 1);
    expect(generateBounties("2026-10-12", 1)).toEqual(a);
    expect(a).toHaveLength(3);
    expect(new Set(a.map((b) => b.monster)).size).toBe(3);
    for (const b of a) {
      expect(BOUNTY_BANDS[1]!.monsters).toContain(b.monster);
      expect(b.xp).toBe(b.count * MONSTERS[b.monster]!.xp);
      expect(b.gold).toBeGreaterThan(0);
    }
    // Dias diferentes variam (em algum momento numa semana).
    const sigs = new Set(Array.from({ length: 7 }, (_, i) => JSON.stringify(generateBounties(`2026-10-${10 + i}`, 0))));
    expect(sigs.size).toBeGreaterThan(1);
    expect(bountyTitle({ monster: "wolf", count: 20 })).toBe("Mate 20 Lobos");
    expect(pluralPt("Homem-Lagarto")).toBe("Homens-Lagarto");
    expect(pluralPt("Espírito de Chama")).toBe("Espíritos de Chama");
  });

  it("aceitar no quadro, cumprir, entregar (XP, ouro, baú) e trocar às 6h", () => {
    const w = qworld();
    const p = w.mk("p1", { level: 5 });
    const list = w.state().bounties.list;
    expect(list.map((b) => b.status)).toEqual(["open", "open", "open"]);
    w.qs.onAction(p, { action: "bountyAccept", index: 0 });
    expect(w.state().bounties.list[0]!.status).toBe("open"); // quadro fechado
    w.open.set("p1", "bounty_board");
    w.qs.onAction(p, { action: "bountyAccept", index: 0 });
    w.qs.onAction(p, { action: "bountyAccept", index: 9 });
    const b = w.state().bounties.list[0]!;
    expect(b.status).toBe("active");
    for (let i = 0; i < b.count + 3; i++) w.qs.onKill(b.monster, ["p1"]);
    expect(w.state().bounties.list[0]!.progress).toBe(b.count);
    const gold0 = w.inv.gold("p1");
    w.qs.onAction(p, { action: "bountyTurnIn", index: 0 });
    expect(w.state().bounties.list[0]!.status).toBe("done");
    expect(w.inv.gold("p1") - gold0).toBe(b.gold);
    expect(w.xp.at(-1)).toEqual({ id: "p1", n: b.xp });
    expect(w.inv.countItem("p1", BOUNTY_CHEST_ID)).toBe(1);
    // Mesmo dia: não repete.
    w.qs.onAction(p, { action: "bountyTurnIn", index: 0 });
    expect(w.inv.countItem("p1", BOUNTY_CHEST_ID)).toBe(1);
    // 06:00 do dia seguinte: lista nova (tick verifica).
    w.setClock(w.state().bounties.resetsAt + 1000);
    w.qs.tick(w.now(), [p]);
    expect(w.state().bounties.list.map((x) => x.status)).toEqual(["open", "open", "open"]);
    expect(w.state().bounties.day).toBe(bountyDay(w.now()));
  });

  it("XP da diária segue o estágio de XP do level (lv 50 recebe metade) e o cartão mostra a XP que vai receber", () => {
    const w = qworld();
    const p = w.mk("p1", { level: 50 });
    w.open.set("p1", "bounty_board");
    w.qs.onAction(p, { action: "bountyAccept", index: 0 });
    const b = w.state().bounties.list[0]!;
    const full = (w.qs as any).st.get("p1").bounty.defs[0].xp as number;
    for (let i = 0; i < b.count; i++) w.qs.onKill(b.monster, ["p1"]);
    w.qs.onAction(p, { action: "bountyTurnIn", index: 0 });
    const staged = applyXpStage(full, 50);
    expect(staged).toBeLessThan(full);
    expect(b.xp).toBe(staged); // o cartão já mostra com o estágio (antes prometia a XP cheia)
    expect(w.xp.at(-1)).toEqual({ id: "p1", n: staged });
    expect(w.sent.find((s) => s.type === S2C.QuestComplete && s.msg.bounty)!.msg.xp).toBe(staged);
  });

  it("a lista do dia é gravada com o id do monstro e não muda se a faixa mudar (14-9)", () => {
    const w = qworld();
    const p = w.mk("p1", { level: 75 });
    w.open.set("p1", "bounty_board");
    w.qs.onAction(p, { action: "bountyAccept", index: 2 });
    const saved = JSON.parse(JSON.stringify(w.qs.serialize("p1")));
    const list = w.state().bounties.list;
    expect(saved.bounty.s.map((x: any) => [x.m, x.c])).toEqual(list.map((b) => [b.monster, b.count]));
    // Simula uma mudança de BOUNTY_BANDS: a gravação aponta para monstros que o sorteio de hoje não daria.
    const day = saved.bounty.day;
    saved.bounty.s = [
      { st: "active", n: 4, m: "frost_dragon", c: 15 },
      { st: "open", n: 0, m: "dragon", c: 10 },
      { st: "done", n: 20, m: "hero", c: 20 },
    ];
    const w2 = qworld({ now: w.now() });
    w2.mk("p1", { level: 75 }, saved);
    expect(w2.state().bounties.list.map((b) => [b.monster, b.count, b.progress, b.status])).toEqual([
      ["frost_dragon", 15, 4, "active"], ["dragon", 10, 0, "open"], ["hero", 20, 20, "done"],
    ]);
    w2.qs.onKill("frost_dragon", ["p1"]);
    expect(w2.state().bounties.list[0]!.progress).toBe(5);
    expect(w2.state().bounties.day).toBe(day);
  });

  it("gravação antiga do dia (sem id do monstro) continua valendo: sorteio do dia + faixa, progresso por posição", () => {
    const w = qworld();
    const day = bountyDay(w.now());
    w.mk("p1", { level: 12 }, { bounty: { day, band: 1, s: [{ st: "active", n: 3 }, { st: "open", n: 0 }, { st: "done", n: 0 }] } });
    const gen = generateBounties(day, 1);
    expect(w.state().bounties.list.map((b) => [b.monster, b.count, b.progress, b.status])).toEqual([
      [gen[0]!.monster, gen[0]!.count, 3, "active"], [gen[1]!.monster, gen[1]!.count, 0, "open"], [gen[2]!.monster, gen[2]!.count, 0, "done"],
    ]);
    // Ao gravar de novo, a lista passa a levar o id.
    expect(w.qs.serialize("p1")!.bounty!.s.map((x) => x.m)).toEqual(gen.map((b) => b.monster));
  });

  it("faixa de level travada no dia (subir de level não troca a lista)", () => {
    const w = qworld();
    const p = w.mk("p1", { level: 5 });
    const before = w.state().bounties.list.map((b) => b.monster);
    p.level = 40;
    w.qs.tick(w.now() + 60_000, [p]);
    expect(w.state().bounties.list.map((b) => b.monster)).toEqual(before);
  });
});

describe("baú de recompensa", () => {
  it("abrir (usar) consome o baú e entrega o sorteio", () => {
    const w = qworld();
    const sent: any[] = [];
    let opened = 0;
    const inv = new InventorySystem({ send: (to, type, msg) => sent.push({ to, type, msg }), openChest: () => { opened++; } });
    const p = player("p1", 1, 1);
    inv.load(p, {});
    inv.addItem(p, makeItem(BOUNTY_CHEST_ID, 2));
    inv.onUseItem(p, { index: 0 });
    expect(opened).toBe(1);
    expect(inv.countItem("p1", BOUNTY_CHEST_ID)).toBe(1);
    // Pelo QuestSystem: ouro + mensagem de loot.
    const q = w.mk("q", { level: 20 });
    const g0 = w.inv.gold("q");
    w.qs.openChest(q);
    expect(w.inv.gold("q")).toBeGreaterThan(g0);
    expect(w.sent.some((s) => s.to === "q" && s.type === S2C.Loot && s.msg.monsterName === "Baú de Recompensa")).toBe(true);
  });

  it("distribuição: sempre ouro; poções ~65%, comida ~50%, equipamento ~15% (incomum+, da faixa e vocação)", () => {
    const rng = seeded(123);
    const N = 4000;
    let pots = 0, food = 0, gear = 0;
    for (let i = 0; i < N; i++) {
      const r = rollChest(20, "sorcerer", rng);
      expect(r.gold).toBeGreaterThan(0);
      for (const it of r.items) {
        const d = ITEMS[it.defId]!;
        if (d.kind === "potion") { pots++; expect(it.defId).toMatch(/_medium$/); }
        else if (d.kind === "food") { food++; expect(d.level ?? 1).toBeLessThanOrEqual(20); }
        else {
          gear++;
          expect(isEquipable(d)).toBe(true);
          expect(RARITIES.indexOf(it.rarity)).toBeGreaterThanOrEqual(1);
          expect(d.level ?? 1).toBeLessThanOrEqual(20);
          expect(d.level ?? 1).toBeGreaterThanOrEqual(8);
          if (d.vocations) expect(d.vocations).toContain("sorcerer");
        }
      }
    }
    expect(pots / N).toBeCloseTo(0.65, 1);
    expect(food / N).toBeCloseTo(0.5, 1);
    expect(gear / N).toBeGreaterThan(0.11);
    expect(gear / N).toBeLessThan(0.19);
    expect(chestGearPool(1, "knight").length).toBeGreaterThan(0);
  });

  it("equipamento acima do lv 58: lv 60, 80 e 100 recebem o tier que alcançam, de toda vocação (14-11)", () => {
    const BODY = ["helmet", "armor", "legs"];
    for (const v of ["knight", "paladin", "sorcerer", "druid"] as const) {
      for (const [level, minLevel] of [[60, 48], [80, 68], [100, 70]] as const) {
        const pool = chestGearPool(level, v);
        expect(pool.some((d) => BODY.includes(d.slot ?? "")), `${v} lv ${level}`).toBe(true);
        for (const d of pool) {
          expect(d.level ?? 1, `${v} lv ${level}: ${d.id}`).toBeLessThanOrEqual(level);
          expect(d.level ?? 1, `${v} lv ${level}: ${d.id}`).toBeGreaterThanOrEqual(minLevel);
          if (d.vocations) expect(d.vocations, d.id).toContain(v);
        }
      }
    }
    // Tier 7 (lv 70) no lv 100: a janela desce até o tier mais alto em vez de ficar vazia.
    expect(chestGearPool(100, "knight").map((d) => d.id)).toEqual(expect.arrayContaining(["demon_helmet", "demon_armor", "demon_legs"]));
    expect(chestGearPool(100, "sorcerer").map((d) => d.id)).toEqual(expect.arrayContaining(["ferumbras_armor", "destruction_wand"]));
    // Sorteio real no lv 100: todo equipamento que sai é do tier 7, incomum ou melhor.
    const rng = seeded(99);
    let gear = 0;
    for (let i = 0; i < 1500; i++) {
      for (const it of rollChest(100, "paladin", rng).items) {
        const d = ITEMS[it.defId]!;
        if (!isEquipable(d)) continue;
        gear++;
        expect(d.level, it.defId).toBe(70);
        expect(RARITIES.indexOf(it.rarity)).toBeGreaterThanOrEqual(1);
      }
    }
    expect(gear).toBeGreaterThan(150);
  });

  it("baú tem arma ou armadura em todo level de 1 a 120, de toda vocação (acessório de level alto não sobe o piso)", () => {
    for (const v of ["knight", "paladin", "sorcerer", "druid"] as const) {
      for (let level = 1; level <= 120; level++) {
        const pool = chestGearPool(level, v);
        expect(pool.some((d) => d.slot === "weapon" || d.slot === "armor"), `${v} lv ${level}: ${pool.map((d) => d.id).join(",")}`).toBe(true);
      }
    }
  });

  it("o baú não dá prêmio só de missão, item só de baú de quest nem único de chefe; sem opção, sai uma gema", () => {
    for (const id of ["botas_biqueira", "capacete_obra", "anel_trilho_din", "pirate_saber", "coral_rod", "stonecutter_axe",
      "amulet_goblin_king", "amulet_minotaur", "anel_do_rodeiro", "ring_demodras", "amulet_orshabaal"]) {
      expect(chestEligible(id), id).toBe(false);
    }
    // Item comum que também é prêmio de missão continua valendo (cai de monstro / é vendido).
    for (const id of ["ring_vigor", "demon_armor", "spellbook_ferumbras", "boots_haste"]) expect(chestEligible(id), id).toBe(true);
    for (const L of [1, 60, 120]) {
      for (const v of ["knight", "paladin", "sorcerer", "druid"] as const) {
        for (const d of chestGearPool(L, v)) expect(chestEligible(d.id), d.id).toBe(true);
      }
    }
    expect(chestGearPool(50, "knight", [])).toEqual([]);
    for (const L of [1, 40, 100]) expect(ITEMS[chestFallbackGem(L)]?.kind).toBe("material");
  });

  it("ciclo 16: tier 8 e itens únicos nunca saem do baú, nem no lv 150 (o tier 8 cai de monstro comum do Profundo)", () => {
    const exclusive = Object.values(ITEMS).filter(isExclusiveItem);
    expect(exclusive.length).toBe(ABYSS_ITEM_IDS.length + 4); // + os 4 únicos da Aniquilação
    for (const d of exclusive) expect(chestEligible(d.id), d.id).toBe(false);
    // As botas novas dos tiers 6 e 7 seguem a regra das outras peças: caem de monstro comum, então valem.
    for (const id of ["crown_boots", "demon_boots", "royal_boots", "dragon_scale_boots", "mystic_boots", "ferumbras_boots"]) expect(chestEligible(id), id).toBe(true);
    for (const v of ["knight", "paladin", "sorcerer", "druid"] as const) {
      for (const L of [100, 120, 150]) {
        const pool = chestGearPool(L, v);
        expect(pool.some((d) => d.slot === "weapon" || d.slot === "armor"), `${v} lv ${L}`).toBe(true);
        for (const d of pool) expect(isExclusiveItem(d), `${v} lv ${L}: ${d.id}`).toBe(false);
      }
    }
    const rng = seeded(16);
    for (let i = 0; i < 2000; i++) {
      for (const it of rollChest(130, "sorcerer", rng).items) expect(isExclusiveItem(ITEMS[it.defId]!), it.defId).toBe(false);
    }
  });
});

describe("marcadores de NPC (! / ?)", () => {
  const empty = (): QuestsMsg => ({ active: [], done: [], tracked: [], bounties: { day: "d", resetsAt: 0, list: [] } });
  const none = () => 0;

  it("disponível → !, em andamento → ? cinza, pronta → ? amarelo; falar-com chama atenção", () => {
    const st = empty();
    expect(npcMarker("guard_captain", st, 1, none)).toBe("available");
    expect(npcMarker("priest", st, 1, none)).toBe(null); // missões do priest exigem level/pré-requisitos
    st.active.push({ id: "rats_barn", progress: [2] });
    expect(npcMarker("guard_captain", st, 1, none)).toBe("progress");
    st.active[0]!.progress = [5];
    expect(npcMarker("guard_captain", st, 1, none)).toBe("ready");
    expect(questStatus(QUESTS.rats_barn!, st, 1, none)).toBe("ready");
    // Entrega conta a mochila.
    st.active.push({ id: "slime_salve", progress: [0] });
    expect(npcMarker("herbalist", st, 2, none)).toBe("progress");
    expect(npcMarker("herbalist", st, 2, (id) => (id === "slime_goo" ? 5 : 0))).toBe("ready");
    // Falar com o Tomé.
    const s2 = empty();
    // "pesquisa_de_clima" (lv 3) também é do Capitão: concluída aqui, para a lista dele ter só a missão em andamento.
    s2.done.push("rats_barn", "pesquisa_de_clima");
    s2.active.push({ id: "forest_wolves", progress: [0, 0] });
    expect(npcMarker("old_hunter", s2, 3, none)).toBe("ready");
    expect(questsForNpc("guard_captain", s2, 6, none).map((e) => e.def.id)).toEqual(["forest_wolves"]);
  });

  it("quadro de recompensas", () => {
    const st = empty();
    st.bounties.list = [
      { monster: "rat", count: 5, progress: 0, status: "done", xp: 1, gold: 1 },
      { monster: "rat", count: 5, progress: 0, status: "active", xp: 1, gold: 1 },
    ];
    expect(npcMarker("bounty_board", st, 1, none)).toBe("progress");
    st.bounties.list.push({ monster: "bee", count: 5, progress: 0, status: "open", xp: 1, gold: 1 });
    expect(npcMarker("bounty_board", st, 1, none)).toBe("available");
    st.bounties.list[1]!.progress = 5;
    expect(npcMarker("bounty_board", st, 1, none)).toBe("ready");
  });
});

describe("quests: recompensa que não coube", () => {
  it("a sobra que cai no chão ganha uid novo (nunca o mesmo uid na mochila e no chão)", () => {
    const sent: unknown[] = [];
    const inv = new InventorySystem({ send: () => {} });
    const p = player("p1", 70, 80);
    inv.load(p, {});
    const fell: any[] = [];
    const qs = new QuestSystem({
      inventory: inv, getPlayer: () => p, send: (_to, _t, m) => sent.push(m), gainXp: () => {}, npcOpen: () => "",
      zones: ZONES, rng: seeded(1), placeLoot: (_p, it) => { fell.push(it); return true; },
    }) as any;
    const bp = inv.get("p1")!.backpack;
    for (let i = 0; i < bp.length - 1; i++) inv.addItem(p, makeItem("fire_sword"));
    // Um espaço livre e uma pilha maior que maxStack (100): 100 entram, 50 caem.
    const big = makeItem("health_potion", 150);
    qs.give(p, [big]);
    const inBag = bp.find((it) => it?.defId === "health_potion")!;
    expect(inBag.count).toBe(100);
    expect(fell).toHaveLength(1);
    expect(fell[0].count).toBe(50);
    expect(fell[0].uid).not.toBe(inBag.uid);
    expect(sent).toContainEqual({ text: "Mochila cheia: 1 item caiu no chão.", kind: "warn" });
  });
});

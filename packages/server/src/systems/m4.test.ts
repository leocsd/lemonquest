import { afterEach, describe, expect, it } from "vitest";
import { BACKPACK_SIZE, NPC_BUY_RATIO, RARITIES, S2C, STANCE_DEALT, STANCE_TAKEN, npcBuyPrice, type Rarity } from "@lemonquest/shared";
import { makeItem } from "./inventory.ts";
import { LootSystem, RARITY_WEIGHTS, bonusPool, rollBonuses, rollLoot, rollRarity } from "./loot.ts";
import { CLOSED, NpcSystem } from "./npcs.ts";
import { CHASE_PAUSE_MS, FightModeSystem, stanceDealt, stanceTaken } from "./fightmode.ts";
import { MovementSystem } from "./movement.ts";
import { handleDevCommand } from "./devcommands.ts";
import { cheb, type Monster } from "./monsters.ts";
import { def, openGrid, player, seeded, world } from "./testkit.ts";
import { ITEMS_FX, invWorld, itemsFx, npcsFx } from "./m4kit.ts";
import type { PlayerState } from "../state.ts";

describe("loot", () => {
  it("rarity distribution over 10k seeded rolls matches the weights; bosses are one tier up", () => {
    const rng = seeded(7);
    const N = 10_000;
    const c: Record<string, number> = {};
    for (let i = 0; i < N; i++) { const r = rollRarity(rng); c[r] = (c[r] ?? 0) + 1; }
    for (const r of RARITIES) expect(Math.abs((c[r] ?? 0) / N - RARITY_WEIGHTS[r])).toBeLessThan(Math.max(0.012, RARITY_WEIGHTS[r] * 0.4));
    const b: Record<string, number> = {};
    for (let i = 0; i < N; i++) { const r = rollRarity(rng, true); b[r] = (b[r] ?? 0) + 1; }
    expect(b.common ?? 0).toBe(0);
    expect((b.uncommon ?? 0) / N).toBeGreaterThan(0.65);
    expect((b.legendary ?? 0) / N).toBeGreaterThan(0.015);
  });

  it("bonuses: count by rarity, distinct stats fitting the kind", () => {
    const rng = seeded(3);
    const counts: Record<Rarity, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 3 };
    for (const r of RARITIES) {
      const bs = rollBonuses(ITEMS_FX.sword!, r, rng);
      expect(bs.length).toBe(counts[r]);
      expect(new Set(bs.map((b) => b.stat)).size).toBe(bs.length);
      for (const b of bs) expect(["attack", "crit", "melee"]).toContain(b.stat);
    }
    expect(bonusPool(ITEMS_FX.ring!)).not.toContain("attack");
    expect(bonusPool(ITEMS_FX.ring!)).not.toContain("armor");
    expect(bonusPool(ITEMS_FX.plate!)).toEqual(expect.arrayContaining(["armor", "hpMax", "manaMax"]));
    // Lendário é mais forte que épico em média.
    const avg = (r: Rarity) => { let s = 0; for (let i = 0; i < 2000; i++) s += rollBonuses(ITEMS_FX.plate!, r, rng).reduce((a, b) => a + b.value, 0); return s; };
    expect(avg("legendary")).toBeGreaterThan(avg("epic"));
  });

  it("rolls table + gold, converts gold coins", () => {
    const md = def({ gold: [5, 5], loot: [{ itemId: "bone", chance: 1, min: 2, max: 2 }, { itemId: "gold_coin", chance: 1, min: 10, max: 10 }, { itemId: "sword", chance: 1 }, { itemId: "hp_pot", chance: 0 }] });
    const r = rollLoot(md, seeded(1), itemsFx);
    expect(r.gold).toBe(15);
    expect(r.items.map((i) => [i.defId, i.count])).toEqual([["bone", 2], ["sword", 1]]);
  });

  it("goes to the top damager; full backpack → lostFull + notice; epic feed", () => {
    const w = invWorld();
    const p1 = w.mk("p1", { name: "Ana" }), p2 = w.mk("p2", { name: "Bia" });
    const players = new Map([["p1", p1], ["p2", p2]]);
    for (let k = 0; k < BACKPACK_SIZE - 1; k++) w.inv.addItem(p2, makeItem("sword"));
    const out: { to: string; type: string; msg: any }[] = [];
    const loot = new LootSystem({
      inventory: w.inv, getPlayer: (id) => players.get(id),
      send: (to, type, msg) => out.push({ to, type, msg }), broadcast: (type, msg) => out.push({ to: "*", type, msg }),
      rng: () => 0, // tudo dropa; raridade comum... exceto o boss (incomum)
    });
    const md = def({ name: "Rei", boss: true, gold: [3, 3], loot: [{ itemId: "sword", chance: 1, min: 3, max: 3 }] });
    const m = { s: { id: "m1", x: 4, y: 4, ownerId: "" }, def: md, damageBy: new Map([["p1", 10], ["p2", 50], ["gone", 999]]) } as unknown as Monster;
    loot.onKill(m);
    const l = out.find((o) => o.type === S2C.Loot)!;
    expect(l.to).toBe("p2");
    expect(l.msg).toMatchObject({ x: 4, y: 4, monsterName: "Rei", gold: 3, lostFull: 2 });
    expect(l.msg.items).toHaveLength(1);
    expect(l.msg.items[0].rarity).toBe("uncommon");
    expect(out.find((o) => o.type === S2C.Notice)!.msg.text).toBe("Mochila cheia: 2 itens perdidos.");
    expect(out.some((o) => o.type === S2C.Feed && o.msg.kind === "boss")).toBe(true);
    expect(w.inv.gold("p2")).toBe(3);
    // Épico → feed de drop.
    const out2: any[] = [];
    const loot2 = new LootSystem({ inventory: w.inv, getPlayer: (id) => players.get(id), send: () => {}, broadcast: (type, msg) => out2.push({ type, msg }), rng: () => 0.985 });
    const m2 = { s: { id: "m2", x: 0, y: 0, ownerId: "" }, def: def({ loot: [{ itemId: "vest", chance: 1 }] }), damageBy: new Map([["p1", 1]]) } as unknown as Monster;
    loot2.onKill(m2);
    expect(out2[0]).toMatchObject({ type: S2C.Feed, msg: { kind: "drop", rarity: "epic", text: "🔥 Ana dropou Colete (Épico)" } });
  });
});

function npcWorld(rng: () => number = () => 0.5) {
  // eslint-disable-next-line prefer-const
  let npcs: NpcSystem;
  const w = invWorld({ depotOpen: (id) => npcs.depotOpen(id) });
  const players = new Map<string, PlayerState>();
  const out: { to: string; type: string; msg: any }[] = [];
  let clock = 0;
  npcs = new NpcSystem({
    npcs: [
      { id: "shop", x: 10, y: 10 }, { id: "depot", x: 30, y: 10 }, { id: "priest", x: 50, y: 10 }, { id: "armory", x: 60, y: 10 },
      { id: "casino", x: 70, y: 10 }, { id: "enchanter", x: 80, y: 10 }, { id: "apothecary", x: 90, y: 10 },
    ],
    inventory: w.inv, defs: npcsFx, players: () => players.values(), getPlayer: (id) => players.get(id),
    send: (to, type, msg) => out.push({ to, type, msg }), broadcast: (type, msg) => out.push({ to: "*", type, msg }),
    now: () => clock, rng,
  });
  const add = (id: string, x: number, y: number) => { const p = w.mk(id); p.x = x; p.y = y; players.set(id, p); return p; };
  return { w, npcs, out, add, players, tick: (ms: number) => { clock += ms; npcs.tick(clock); } };
}

describe("npcs", () => {
  it("shop prices, buying with gold and selling by rarity", () => {
    const t = npcWorld();
    const p = t.add("p1", 12, 10);
    t.npcs.onInteract(p, { npcId: "shop" });
    const open = t.out.find((o) => o.type === S2C.NpcOpen)!.msg;
    expect(open).toMatchObject({ npcId: "shop", name: "Mercador", greeting: "Olá!" });
    expect(open.shop).toEqual({ sells: [{ itemId: "hp_pot", price: 40 }, { itemId: "vest", price: 50 }], buys: ["weapon", "armor", "material"], sellRatio: NPC_BUY_RATIO });
    t.npcs.onTrade(p, { npcId: "shop", action: "buy", itemId: "hp_pot", count: 3 });
    expect(t.out.at(-1)!.msg.text).toBe("Ouro insuficiente.");
    t.w.inv.addGold(p, 200);
    t.npcs.onTrade(p, { npcId: "shop", action: "buy", itemId: "hp_pot", count: 3 });
    expect(t.w.inv.gold("p1")).toBe(80);
    expect(t.w.inv.get("p1")!.backpack[0]).toMatchObject({ defId: "hp_pot", count: 3 });
    t.npcs.onTrade(p, { npcId: "shop", action: "buy", itemId: "vest", count: 1 });
    expect(t.w.inv.gold("p1")).toBe(30);
    // Venda: poção não está em `buys`.
    t.npcs.onTrade(p, { npcId: "shop", action: "sell", index: 0, count: 1 });
    expect(t.out.at(-1)!.msg.text).toBe("Não compro isso.");
    t.w.inv.addItem(p, makeItem("sword", 1, "rare"));
    t.npcs.onTrade(p, { npcId: "shop", action: "sell", index: 2, count: 1 });
    expect(npcBuyPrice(100, "rare")).toBe(75);
    expect(t.w.inv.gold("p1")).toBe(105);
    expect(t.w.inv.get("p1")!.backpack[2]).toBeNull();
    // Mochila cheia bloqueia a compra.
    for (let k = 0; k < BACKPACK_SIZE; k++) t.w.inv.addItem(p, makeItem("sword"));
    t.npcs.onTrade(p, { npcId: "shop", action: "buy", itemId: "vest", count: 1 });
    expect(t.out.at(-1)!.msg.text).toBe("Mochila cheia.");
    expect(t.w.inv.gold("p1")).toBe(105);
  });

  it("vender tudo: só o que o NPC compra, pilhas inteiras, um aviso com o total; raro ou melhor fica", () => {
    const t = npcWorld();
    const p = t.add("p1", 12, 10);
    t.npcs.onInteract(p, { npcId: "shop" });
    t.npcs.onTrade(p, { npcId: "shop", action: "sellAll" });
    expect(t.out.at(-1)!.msg.text).toBe("Nada na mochila que eu compre.");
    t.w.inv.addItem(p, makeItem("hp_pot", 2));             // não compra
    t.w.inv.addItem(p, makeItem("sword", 1, "rare"));      // fica (raro)
    t.w.inv.addItem(p, makeItem("sword", 1, "legendary")); // fica (lendário)
    t.w.inv.addItem(p, makeItem("sword", 1, "uncommon"));  // vende
    t.w.inv.addItem(p, makeItem("sword"));                 // 30
    const uncommon = npcBuyPrice(100, "uncommon");
    t.npcs.onTrade(p, { npcId: "shop", action: "sellAll" });
    expect(t.w.inv.gold("p1")).toBe(30 + uncommon);
    expect(t.out.at(-1)!.msg.text).toBe(`Você vendeu 2 itens por ${30 + uncommon} de ouro. 2 itens raros ou melhores ficaram na mochila (venda um a um).`);
    expect(t.w.inv.get("p1")!.backpack.filter(Boolean).map((x) => `${x!.defId}:${x!.rarity}`)).toEqual(["hp_pot:common", "sword:rare", "sword:legendary"]);
    // Só sobraram raros: nada vendido, e o aviso explica por quê. Um a um continua valendo.
    t.npcs.onTrade(p, { npcId: "shop", action: "sellAll" });
    expect(t.out.at(-1)!.msg.text).toBe("Nada na mochila que eu compre. 2 itens raros ou melhores ficaram na mochila (venda um a um).");
    t.npcs.onTrade(p, { npcId: "shop", action: "sell", index: 1, count: 1 });
    expect(t.w.inv.get("p1")!.backpack[1]).toBeNull();
  });

  it("bênção: preço escala com o level, consome ouro, fica ativa até comprar de novo (não deixa comprar 2x)", () => {
    const t = npcWorld();
    const p = t.add("p1", 50, 10);
    p.level = 10;
    t.npcs.onInteract(p, { npcId: "priest" });
    const open = t.out.find((o) => o.type === S2C.NpcOpen)!.msg;
    expect(open.blessing).toEqual({ price: 500, active: false }); // 50 × level (ciclo 9)
    t.npcs.onTrade(p, { npcId: "priest", action: "blessing" });
    expect(t.out.at(-1)!.msg.text).toBe("Ouro insuficiente.");
    t.w.inv.addGold(p, 500);
    t.npcs.onTrade(p, { npcId: "priest", action: "blessing" });
    expect(t.w.inv.gold("p1")).toBe(0);
    expect(p.blessed).toBe(true);
    t.w.inv.addGold(p, 500);
    t.npcs.onTrade(p, { npcId: "priest", action: "blessing" });
    expect(t.out.at(-1)!.msg.text).toBe("Você já está com uma bênção ativa.");
    expect(t.w.inv.gold("p1")).toBe(500); // não cobrou de novo
  });

  it("cassino: cobra a ficha e dá cada faixa de prêmio conforme o sorteio (nada/ouro/material/grande)", () => {
    const seq = [0.1, 0.6, 0.9, 0.1, 0.99]; // nada, ouro de volta, material (+ índice do pool), prêmio grande
    let i = 0;
    const t = npcWorld(() => seq[i++]!);
    const p = t.add("p1", 70, 10);
    t.w.inv.addGold(p, 10_000);
    t.npcs.onInteract(p, { npcId: "casino" });
    t.npcs.onTrade(p, { npcId: "casino", action: "casino" }); // nada
    expect(t.out.at(-1)!.msg.text).toBe("Ficha: nada esta vez. Mais sorte na próxima!");
    expect(t.w.inv.gold("p1")).toBe(9000);
    t.npcs.onTrade(p, { npcId: "casino", action: "casino" }); // ouro de volta
    expect(t.out.at(-1)!.msg.text).toBe("Ficha: +400 de ouro de volta.");
    expect(t.w.inv.gold("p1")).toBe(8400);
    t.npcs.onTrade(p, { npcId: "casino", action: "casino" }); // material
    expect(t.out.at(-1)!.msg.text).toContain("Ficha: você ganhou 1x");
    t.npcs.onTrade(p, { npcId: "casino", action: "casino" }); // prêmio grande
    expect(t.out.at(-1)!.msg.text).toBe("Ficha: PRÊMIO GRANDE! +3000 de ouro!");
    expect(t.w.inv.gold("p1")).toBe(8400 - 1000 - 1000 + 3000);
  });

  it("cassino com a mochila sem espaço vazio: recusa antes de cobrar mesmo com pilha de Barra de Ferro (o material sorteado sumia)", () => {
    // Sorteio: material (0.9) e o último do pool (0.99) — a Escama, que não tem pilha na mochila.
    const seq = [0.9, 0.99];
    let i = 0;
    const t = npcWorld(() => seq[i++ % seq.length]!);
    const p = t.add("p1", 70, 10);
    t.w.inv.addGold(p, 10_000);
    t.w.inv.addItem(p, makeItem("iron_bar", 3)); // pilha com espaço do 1º material do pool
    for (let k = 1; k < BACKPACK_SIZE; k++) t.w.inv.addItem(p, makeItem("sword"));
    expect(t.w.inv.get("p1")!.backpack.every(Boolean)).toBe(true);
    t.npcs.onInteract(p, { npcId: "casino" });
    t.npcs.onTrade(p, { npcId: "casino", action: "casino" });
    expect(t.out.at(-1)!.msg.text).toBe("Abra um espaço na mochila antes de comprar a ficha.");
    expect(t.w.inv.gold("p1")).toBe(10_000);
    expect(i).toBe(0); // recusou antes de sortear: a recusa não revela o prêmio
    // Com um espaço vazio, o material sorteado entra na mochila.
    t.w.inv.get("p1")!.backpack[5] = null;
    t.npcs.onTrade(p, { npcId: "casino", action: "casino" });
    expect(t.out.at(-1)!.msg.text).toBe("Ficha: você ganhou 1x Escama de Lagarto!");
    expect(t.w.inv.gold("p1")).toBe(9000);
    expect(t.w.inv.countItem("p1", "lizard_scale")).toBe(1);
  });

  it("poção e comida acima do level não se compram; equipamento acima do level continua à venda", () => {
    const t = npcWorld();
    const p = t.add("p1", 90, 10);
    p.level = 10;
    t.w.inv.addGold(p, 10_000);
    t.npcs.onInteract(p, { npcId: "apothecary" });
    t.npcs.onTrade(p, { npcId: "apothecary", action: "buy", itemId: "hp_pot_huge", count: 5 });
    expect(t.out.at(-1)!.msg.text).toBe("Você precisa ser level 30 para comprar isso.");
    t.npcs.onTrade(p, { npcId: "apothecary", action: "buy", itemId: "ham", count: 1 });
    expect(t.out.at(-1)!.msg.text).toBe("Você precisa ser level 30 para comprar isso.");
    expect(t.w.inv.gold("p1")).toBe(10_000);
    t.npcs.onTrade(p, { npcId: "apothecary", action: "buy", itemId: "ring", count: 1 }); // anel lv 30
    expect(t.w.inv.gold("p1")).toBe(9500);
    p.level = 30;
    t.npcs.onTrade(p, { npcId: "apothecary", action: "buy", itemId: "hp_pot_huge", count: 5 });
    expect(t.w.inv.countItem("p1", "hp_pot_huge")).toBe(5);
  });

  it("encantamento: precisa de ouro + material, troca sem reembolso, não deixa comprar o mesmo de novo", () => {
    const t = npcWorld();
    const p = t.add("p1", 80, 10);
    t.npcs.onInteract(p, { npcId: "enchanter" });
    t.npcs.onTrade(p, { npcId: "enchanter", action: "imbuement", effect: "lifesteal" });
    expect(t.out.at(-1)!.msg.text).toContain("Faltam materiais");
    t.w.inv.addGold(p, 5000);
    t.w.inv.addItem(p, makeItem("wolf_fang", 5));
    t.npcs.onTrade(p, { npcId: "enchanter", action: "imbuement", effect: "lifesteal" });
    expect(p.imbuement).toBe("lifesteal");
    expect(t.w.inv.gold("p1")).toBe(0);
    expect(t.w.inv.get("p1")!.backpack.filter(Boolean)).toHaveLength(0);
    t.npcs.onTrade(p, { npcId: "enchanter", action: "imbuement", effect: "lifesteal" });
    expect(t.out.at(-1)!.msg.text).toContain("já tem");
    t.w.inv.addGold(p, 5000);
    t.w.inv.addItem(p, makeItem("spider_eye", 5));
    t.npcs.onTrade(p, { npcId: "enchanter", action: "imbuement", effect: "manasteal" });
    expect(p.imbuement).toBe("manasteal"); // trocou, sem reembolso do anterior
  });

  it("tier 6-7 (encomenda especial): só 1 por personagem por semana", () => {
    const t = npcWorld();
    const p = t.add("p1", 60, 10);
    t.w.inv.addGold(p, 1000);
    t.npcs.onInteract(p, { npcId: "armory" });
    t.npcs.onTrade(p, { npcId: "armory", action: "buy", itemId: "vest", count: 1 });
    expect(t.w.inv.gold("p1")).toBe(950);
    t.w.inv.addGold(p, 1000);
    t.npcs.onTrade(p, { npcId: "armory", action: "buy", itemId: "vest", count: 1 });
    expect(t.out.at(-1)!.msg.text).toBe("Você já usou a encomenda especial desta semana.");
    expect(t.w.inv.gold("p1")).toBe(1950); // não cobrou de novo
  });

  it("depot needs range; walking away closes it", () => {
    const t = npcWorld();
    const p = t.add("p1", 20, 10);
    t.npcs.onInteract(p, { npcId: "depot" });
    expect(t.npcs.depotOpen("p1")).toBe(false);
    p.x = 28;
    t.npcs.onInteract(p, { npcId: "depot" });
    expect(t.out.at(-1)!.msg).toMatchObject({ npcId: "depot", depot: true });
    expect(t.npcs.depotOpen("p1")).toBe(true);
    t.w.inv.flush();
    expect(t.w.sent.some((s) => s.type === S2C.Depot)).toBe(true);
    p.x = 25;
    t.tick(50);
    expect(t.out.at(-1)).toEqual({ to: "p1", type: S2C.NpcOpen, msg: CLOSED });
    expect(t.npcs.depotOpen("p1")).toBe(false);
  });

  it("ambient lines only with a player nearby", () => {
    const t = npcWorld();
    t.add("p1", 60, 60);
    t.tick(1); t.tick(60_000);
    expect(t.out.some((o) => o.type === S2C.NpcSay)).toBe(false);
    t.players.get("p1")!.x = 12; t.players.get("p1")!.y = 12;
    t.tick(60_000);
    expect(t.out.filter((o) => o.type === S2C.NpcSay)).toEqual([{ to: "*", type: S2C.NpcSay, msg: { npcId: "shop", text: "Promoção!" } }]);
  });
});

describe("fight modes", () => {
  it("stance multipliers", () => {
    expect([STANCE_DEALT.offensive, STANCE_TAKEN.offensive, STANCE_DEALT.defensive, STANCE_TAKEN.defensive]).toEqual([1.2, 1.15, 0.8, 0.75]);
    const w = world({ grid: openGrid(20, 20), spawns: [{ defId: "dummy", x: 5, y: 5, count: 1, radius: 0 }], defs: () => def({ hp: 10_000, aggroRange: 0, armor: 0 }) });
    w.mm.spawnAll();
    const m = [...w.mm.all()][0]!;
    const p = w.add(player("p", 6, 5, { stance: "offensive", hp: 1000, maxHp: 1000 }));
    w.combat.hooks = {
      dealtMult: stanceDealt, takenMult: stanceTaken,
      attack: () => ({ range: 1, kind: "physical", ranged: false, damage: [10, 10], critPct: 0 }),
    };
    expect(w.combat.damagePlayer(p, "x", 100, "physical", w.now())).toBe(115);
    p.stance = "defensive";
    expect(w.combat.damagePlayer(p, "x", 100, "physical", w.now())).toBe(75);
    p.stance = "offensive";
    w.combat.onAttack(p, { targetId: m.s.id });
    w.run(20_000);
    const hits = w.sent.filter((s) => s.type === S2C.Combat).flatMap((s) => s.msg.events).filter((e: any) => e.sourceId === "p" && !e.miss);
    expect(hits.length).toBeGreaterThan(3);
    for (const e of hits) expect(e.amount).toBe(12);
  });

  function chaseWorld(range = 1) {
    const w = world({ grid: openGrid(40, 20), spawns: [{ defId: "dummy", x: 20, y: 10, count: 1, radius: 0 }], defs: () => def({ hp: 10_000, aggroRange: 0 }) });
    w.mm.spawnAll();
    const m = [...w.mm.all()][0]!;
    const mv = new MovementSystem(openGrid(40, 20), { now: () => w.now() });
    mv.setExtraBlocker((x, y) => w.mm.isMonsterAt(x, y));
    const fight = new FightModeSystem({ movement: mv, monsters: w.mm, attackRange: () => range, now: () => w.now() });
    const p = w.add(player("p", 10, 10, { chase: true, stance: "balanced" }));
    mv.addPlayer(p);
    p.targetId = m.s.id;
    const step = () => { fight.tick(w.now(), w.players.values()); mv.tick(w.now(), w.players.values()); };
    return { w, m, mv, fight, p, step };
  }

  it("modo de luta salvo é mantido; personagem novo começa seguindo o alvo", () => {
    const w = world({ grid: openGrid(10, 10), spawns: [], defs: () => def({}) });
    const fight = new FightModeSystem({ movement: new MovementSystem(openGrid(10, 10)), monsters: w.mm, attackRange: () => 1 });
    const k = player("k", 1, 1, { vocation: "knight" }), s = player("s", 2, 2, { vocation: "sorcerer" });
    fight.load(k, undefined, undefined);
    fight.load(s, undefined, undefined);
    expect([k.chase, s.chase]).toEqual([true, true]);
    fight.load(k, "offensive", false);
    fight.load(s, "defensive", true);
    expect([k.chase, k.stance, s.chase, s.stance]).toEqual([false, "offensive", true, "defensive"]);
  });

  it("chase walks until it is next to the target, whatever the attack range", () => {
    const c = chaseWorld(1);
    c.w.run(6000, c.step);
    expect(cheb(c.p.x, c.p.y, c.m.s.x, c.m.s.y)).toBe(1);
    // À distância também gruda (não para no alcance do ataque).
    const r = chaseWorld(4);
    r.w.run(6000, r.step);
    expect(cheb(r.p.x, r.p.y, r.m.s.x, r.m.s.y)).toBe(1);
  });

  it("manual move pauses the chase; chase off = stays", () => {
    const c = chaseWorld(1);
    c.w.run(600, c.step);
    const x0 = c.p.x;
    expect(x0).toBeGreaterThan(10);
    c.fight.pause("p", c.w.now());
    c.w.run(1000, c.step);
    const x1 = c.p.x;
    expect(x1 - x0).toBeLessThanOrEqual(1); // no máximo o passo que estava em curso
    c.w.run(CHASE_PAUSE_MS, c.step);
    expect(c.p.x).toBeGreaterThan(x1);
    c.fight.onFightMode(c.p, { stance: "defensive", chase: false });
    const x2 = c.p.x;
    c.w.run(2000, c.step);
    expect(c.p.x).toBe(x2);
    expect(c.p.stance).toBe("defensive");
  });

  it("ataque automático: sem alvo escolhe o monstro mais próximo; desligado não faz nada", () => {
    const c = chaseWorld(1);
    c.p.targetId = "";
    c.p.x = 16; c.p.y = 10; // 4 tiles do monstro (20,10)
    c.fight.tick(c.w.now(), c.w.players.values());
    expect(c.p.targetId).toBe("");
    c.fight.onFightMode(c.p, { stance: "balanced", chase: true, auto: true });
    expect(c.p.auto).toBe(true);
    c.fight.tick(c.w.now(), c.w.players.values());
    expect(c.p.targetId).toBe(c.m.s.id);
    c.w.run(6000, c.step);
    expect(cheb(c.p.x, c.p.y, c.m.s.x, c.m.s.y)).toBe(1);
  });

  it("ataque automático parado (seguir desligado) só pega o que já está ao alcance", () => {
    const c = chaseWorld(1);
    c.p.targetId = "";
    c.fight.onFightMode(c.p, { stance: "balanced", chase: false, auto: true });
    c.fight.tick(c.w.now(), c.w.players.values());
    expect(c.p.targetId).toBe(""); // 10 tiles de distância
    c.p.x = 19;
    c.w.run(500, c.step);
    expect(c.p.targetId).toBe(c.m.s.id);
  });

  it("seguir jogador: anda até ficar ao lado, cancela com movimento manual e ao escolher alvo", () => {
    const w = world({ grid: openGrid(40, 20), spawns: [], defs: () => def({}) });
    const mv = new MovementSystem(openGrid(40, 20), { now: () => w.now() });
    const leader = w.add(player("l", 20, 10, {}));
    const p = w.add(player("p", 10, 10, {}));
    mv.addPlayer(leader); mv.addPlayer(p);
    const fight = new FightModeSystem({ movement: mv, monsters: w.mm, attackRange: () => 1, getPlayer: (id) => w.players.get(id), now: () => w.now() });
    const step = () => { fight.tick(w.now(), w.players.values()); mv.tick(w.now(), w.players.values()); };
    fight.onFollow(p, { targetId: "l" });
    expect(p.followId).toBe("l");
    w.run(6000, step);
    expect(cheb(p.x, p.y, leader.x, leader.y)).toBe(1);
    leader.x = 30; leader.y = 10; // o líder se afasta: segue de novo
    w.run(6000, step);
    expect(cheb(p.x, p.y, leader.x, leader.y)).toBe(1);
    fight.cancelFollow(p);
    expect(p.followId).toBe("");
    leader.x = 10; leader.y = 10; p.x = 20;
    fight.onFollow(p, { targetId: "p" }); // a si mesmo: ignorado
    expect(p.followId).toBe("");
    fight.onFollow(p, { targetId: "l" });
    leader.x = 39; // longe demais: cancela sozinho
    w.run(500, step);
    expect(p.followId).toBe("");
  });
});

describe("dev commands", () => {
  const env = process.env.NODE_ENV;
  afterEach(() => { process.env.NODE_ENV = env; });

  function ctx() {
    const w = invWorld();
    const p = w.mk("p1", { level: 1 });
    const tp: number[] = [];
    let ml = 0;
    const c = {
      inventory: w.inv, send: (to: string, type: string, msg: unknown) => w.sent.push({ to, type, msg }),
      teleport: (_: PlayerState, x: number, y: number) => tp.push(x, y), isWalkable: () => true,
      setMagicLevel: (_: PlayerState, n: number) => { ml = n; }, rng: seeded(1),
      env: { NODE_ENV: "development", LEMONQUEST_DEV_COMMANDS: "1", LEMONQUEST_ADMINS: "p1" },
    };
    return { w, p, c, tp, ml: () => ml };
  }

  it("works outside production and replies only to the player", () => {
    process.env.NODE_ENV = "development";
    const t = ctx();
    expect(handleDevCommand(t.p, "/gold 500", t.c)).toBe(true);
    expect(t.w.inv.gold("p1")).toBe(500);
    expect(handleDevCommand(t.p, "/item sword 1 epic", t.c)).toBe(true);
    const it = t.w.inv.get("p1")!.backpack[0]!;
    expect([it.defId, it.rarity, it.bonuses.length]).toEqual(["sword", "epic", 3]);
    handleDevCommand(t.p, "/item hp_pot 5", t.c);
    expect(t.w.inv.get("p1")!.backpack[1]).toMatchObject({ defId: "hp_pot", count: 5 });
    handleDevCommand(t.p, "/level 20", t.c);
    expect([t.p.level, t.p.hp]).toEqual([20, t.p.maxHp]);
    handleDevCommand(t.p, "/tp 7 8", t.c);
    expect(t.tp).toEqual([7, 8]);
    handleDevCommand(t.p, "/ml 12", t.c);
    expect(t.ml()).toBe(12);
    expect(handleDevCommand(t.p, "/qualquer", t.c)).toBe(false);
    expect(t.w.sent.every((s) => s.to === "p1")).toBe(true);
  });

  it("disabled in production", () => {
    process.env.NODE_ENV = "production";
    const t = ctx();
    expect(handleDevCommand(t.p, "/gold 500", { ...t.c, env: { ...t.c.env, NODE_ENV: "production" } })).toBe(false);
    expect(t.w.inv.gold("p1")).toBe(0);
  });
});

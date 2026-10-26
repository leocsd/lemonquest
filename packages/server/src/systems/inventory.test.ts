import { describe, expect, it } from "vitest";
import { BACKPACK_MAX, BACKPACK_SIZE, S2C, backpackCapacity, baseStats, weaponDamageRange, playerDamageRange } from "@lemonquest/shared";
import { MSG, fitBackpack, makeItem, organizeItems, sanitizeItem } from "./inventory.ts";
import { attackProfile } from "./combat.ts";
import { invWorld, itemsFx } from "./m4kit.ts";

const bp = (w: ReturnType<typeof invWorld>, id = "p1") => w.inv.get(id)!.backpack;
const eq = (w: ReturnType<typeof invWorld>, id = "p1") => w.inv.get(id)!.equipment;

describe("inventory: equip", () => {
  it("validates slot, vocation and level; equips and swaps", () => {
    const w = invWorld();
    const p = w.mk("p1", { vocation: "knight", level: 5 });
    w.inv.addItem(p, makeItem("sword"));   // 0
    w.inv.addItem(p, makeItem("plate"));   // 1 (level 20)
    w.inv.addItem(p, makeItem("bow"));     // 2 (paladin)
    w.inv.onMoveItem(p, { from: { where: "backpack", index: 0 }, to: { where: "equip", slot: "shield" } });
    expect(w.notices().at(-1)).toBe(MSG.slot);
    w.inv.onMoveItem(p, { from: { where: "backpack", index: 1 }, to: { where: "equip", slot: "armor" } });
    expect(w.notices().at(-1)).toMatch(/^Você precisa ser level \d+ para usar isso\.$/);
    w.inv.onMoveItem(p, { from: { where: "backpack", index: 2 }, to: { where: "equip", slot: "weapon" } });
    expect(w.notices().at(-1)).toBe("Sua vocação não pode usar isso.");
    w.inv.onMoveItem(p, { from: { where: "backpack", index: 0 }, to: { where: "equip", slot: "weapon" } });
    expect(eq(w).weapon?.defId).toBe("sword");
    expect(bp(w)[0]).toBeNull();
    // Troca: arma de duas mãos no lugar da espada → espada volta para o slot de origem.
    w.inv.addItem(p, makeItem("axe2h"));
    const i = bp(w).findIndex((x) => x?.defId === "axe2h");
    w.inv.onMoveItem(p, { from: { where: "backpack", index: i }, to: { where: "equip", slot: "weapon" } });
    expect(eq(w).weapon?.defId).toBe("axe2h");
    expect(bp(w)[i]?.defId).toBe("sword");
  });

  it("two-handed weapon moves the shield to the backpack, or fails when full", () => {
    const w = invWorld();
    const p = w.mk();
    w.inv.addItem(p, makeItem("shield"));
    w.inv.onMoveItem(p, { from: { where: "backpack", index: 0 }, to: { where: "equip", slot: "shield" } });
    w.inv.addItem(p, makeItem("axe2h"));
    w.inv.onMoveItem(p, { from: { where: "backpack", index: 0 }, to: { where: "equip", slot: "weapon" } });
    expect(eq(w).weapon?.defId).toBe("axe2h");
    expect(eq(w).shield).toBeUndefined();
    expect(bp(w)[0]?.defId).toBe("shield");
    // Escudo de volta: tira a arma de duas mãos (vai para o slot que o escudo liberou).
    w.inv.onMoveItem(p, { from: { where: "backpack", index: 0 }, to: { where: "equip", slot: "shield" } });
    expect(eq(w).shield?.defId).toBe("shield");
    expect(eq(w).weapon).toBeUndefined();
    expect(bp(w)[0]?.defId).toBe("axe2h");
  });

  it("two-handed weapon fails when there is no room for the shield", () => {
    const w = invWorld();
    const p = w.mk();
    w.inv.addItem(p, makeItem("sword"));
    w.inv.addItem(p, makeItem("shield"));
    w.inv.onMoveItem(p, { from: { where: "backpack", index: 0 }, to: { where: "equip", slot: "weapon" } });
    w.inv.onMoveItem(p, { from: { where: "backpack", index: 1 }, to: { where: "equip", slot: "shield" } });
    w.inv.addItem(p, makeItem("axe2h"));
    for (let k = 1; k < BACKPACK_SIZE; k++) w.inv.addItem(p, makeItem("vest"));
    expect(bp(w).every(Boolean)).toBe(true);
    // A espada volta para o slot do machado, mas o escudo não tem para onde ir.
    w.inv.onMoveItem(p, { from: { where: "backpack", index: 0 }, to: { where: "equip", slot: "weapon" } });
    expect(w.notices().at(-1)).toBe("Mochila cheia.");
    expect([eq(w).weapon?.defId, eq(w).shield?.defId, bp(w)[0]?.defId]).toEqual(["sword", "shield", "axe2h"]);
  });

  it("unequip to an occupied slot uses the first free slot; full backpack fails", () => {
    const w = invWorld();
    const p = w.mk();
    w.inv.addItem(p, makeItem("vest"));
    w.inv.onMoveItem(p, { from: { where: "backpack", index: 0 }, to: { where: "equip", slot: "armor" } });
    for (let k = 0; k < BACKPACK_SIZE; k++) w.inv.addItem(p, makeItem("bone", 1)), w.inv.addItem(p, makeItem("shield"));
    expect(bp(w).every(Boolean)).toBe(true);
    w.inv.onMoveItem(p, { from: { where: "equip", slot: "armor" }, to: { where: "backpack", index: 3 } });
    expect(w.notices().at(-1)).toBe("Mochila cheia.");
    expect(eq(w).armor?.defId).toBe("vest");
  });
});

describe("inventory: capacidade da mochila cresce com o level", () => {
  it("fórmula: 20 no lv 1, +1 a cada 5 levels, teto 40", () => {
    expect(backpackCapacity(1)).toBe(BACKPACK_SIZE);
    expect(backpackCapacity(5)).toBe(20);
    expect(backpackCapacity(6)).toBe(21);
    expect(backpackCapacity(25)).toBe(24);
    expect(backpackCapacity(50)).toBe(29);
    expect(backpackCapacity(100)).toBe(39);
    expect(backpackCapacity(101)).toBe(BACKPACK_MAX);
    expect(backpackCapacity(300)).toBe(BACKPACK_MAX);
    expect(backpackCapacity(NaN)).toBe(BACKPACK_SIZE);
  });

  it("carrega no tamanho do level, cresce no level up (sem mexer nos itens) e a mensagem mostra o máximo", () => {
    const w = invWorld();
    const p = w.mk("p1", { level: 30 });
    expect(bp(w)).toHaveLength(25);
    w.inv.addItem(p, makeItem("sword"));
    p.level = 50;
    expect(w.inv.fitBackpack(p)).toBe(4);
    expect(bp(w)).toHaveLength(29);
    expect(bp(w)[0]?.defId).toBe("sword");
    expect(w.inv.fitBackpack(p)).toBe(0);
    expect(w.inv.inventoryMsg("p1")!.cap).toEqual({ used: 1, max: 29 });
  });

  it("level menor (comando de dev) só tira espaços vazios do fim: nenhum item some", () => {
    const inv = { backpack: Array(29).fill(null) as any[] };
    inv.backpack[26] = makeItem("sword");
    fitBackpack(inv, 1);
    expect(inv.backpack).toHaveLength(27);
    expect(inv.backpack[26]?.defId).toBe("sword");
  });

  it("mover para além da capacidade é recusado (cliente adulterado não aumenta a mochila)", () => {
    const w = invWorld();
    const p = w.mk("p1", { level: 1 });
    w.inv.addItem(p, makeItem("sword"));
    w.inv.onMoveItem(p, { from: { where: "backpack", index: 0 }, to: { where: "backpack", index: 25 } });
    expect(bp(w)).toHaveLength(BACKPACK_SIZE);
    expect(bp(w)[0]?.defId).toBe("sword");
    p.level = 30;
    w.inv.fitBackpack(p);
    w.inv.onMoveItem(p, { from: { where: "backpack", index: 0 }, to: { where: "backpack", index: 24 } });
    expect(bp(w)[24]?.defId).toBe("sword");
  });
});

describe("inventory: stacking", () => {
  it("merges up to maxStack, splits and swaps", () => {
    const w = invWorld();
    const p = w.mk();
    expect(w.inv.addItem(p, makeItem("mana_pot", 7))).toBe(0);
    expect(w.inv.addItem(p, makeItem("mana_pot", 7))).toBe(0);
    expect(bp(w).slice(0, 2).map((x) => x?.count)).toEqual([10, 4]);
    // Split 3 do slot 0 para o slot 5.
    w.inv.onMoveItem(p, { from: { where: "backpack", index: 0 }, to: { where: "backpack", index: 5 }, count: 3 });
    expect([bp(w)[0]?.count, bp(w)[5]?.count]).toEqual([7, 3]);
    expect(bp(w)[5]!.uid).not.toBe(bp(w)[0]!.uid);
    // Merge 5 → 1 (4 + 5 = 9).
    w.inv.onMoveItem(p, { from: { where: "backpack", index: 0 }, to: { where: "backpack", index: 1 }, count: 5 });
    expect([bp(w)[0]?.count, bp(w)[1]?.count]).toEqual([2, 9]);
    // Merge limitado pelo máximo (9 + 3 → 10, sobra 2).
    w.inv.onMoveItem(p, { from: { where: "backpack", index: 5 }, to: { where: "backpack", index: 1 } });
    expect([bp(w)[1]?.count, bp(w)[5]?.count]).toEqual([10, 2]);
    // Troca de itens diferentes.
    w.inv.addItem(p, makeItem("sword"));
    const s = bp(w).findIndex((x) => x?.defId === "sword");
    w.inv.onMoveItem(p, { from: { where: "backpack", index: s }, to: { where: "backpack", index: 0 } });
    expect(bp(w)[0]?.defId).toBe("sword");
    expect(bp(w)[s]?.defId).toBe("mana_pot");
  });

  it("gold coins become the gold counter; overflow returns leftover", () => {
    const w = invWorld();
    const p = w.mk();
    expect(w.inv.addItem(p, makeItem("gold_coin", 250))).toBe(0);
    expect(w.inv.gold("p1")).toBe(250);
    for (let k = 0; k < BACKPACK_SIZE; k++) w.inv.addItem(p, makeItem("sword"));
    expect(w.inv.addItem(p, makeItem("bone", 4))).toBe(4);
    w.inv.flush();
    const msg = w.sent.filter((s) => s.type === S2C.Inventory).at(-1)!.msg;
    expect(msg.cap).toEqual({ used: BACKPACK_SIZE, max: BACKPACK_SIZE });
    expect(msg.gold).toBe(250);
  });

  it("inventory messages are coalesced per flush", () => {
    const w = invWorld();
    const p = w.mk();
    w.inv.flush();
    const before = w.sent.length;
    w.inv.addItem(p, makeItem("bone", 1));
    w.inv.addItem(p, makeItem("bone", 1));
    w.inv.addGold(p, 3);
    w.inv.flush();
    expect(w.sent.length - before).toBe(1);
  });
});

describe("inventory: potions", () => {
  it("heals, restores mana, shares a cooldown and consumes one", () => {
    const w = invWorld();
    const p = w.mk("p1", { hp: 150, mana: 50 });
    p.hp = 10; p.mana = 0;
    w.inv.addItem(p, makeItem("hp_pot", 3));
    w.inv.addItem(p, makeItem("mana_pot", 2));
    w.inv.onUseItem(p, { index: 0 });
    expect(p.hp).toBe(60);
    expect(bp(w)[0]?.count).toBe(2);
    w.inv.onQuickPotion(p, { kind: "mana" });
    expect(w.notices().at(-1)).toBe(MSG.cooldown);
    expect(p.mana).toBe(0);
    w.advance(1000);
    w.inv.onQuickPotion(p, { kind: "mana" });
    expect(p.mana).toBe(30);
    expect(w.events.at(-1)).toMatchObject({ kind: "mana", amount: 30, sourceId: "p1", targetId: "p1" });
    expect(bp(w)[1]?.count).toBe(1);
    w.advance(1000);
    w.inv.onUseItem(p, { index: 1 });
    expect(bp(w)[1]).toBeNull();
    w.advance(1000);
    w.inv.onQuickPotion(p, { kind: "mana" });
    expect(w.notices().at(-1)).toBe(MSG.noMana);
  });

  it("poção e comida acima do level: recusa com o level no aviso, não consome e não gasta a recarga", () => {
    const w = invWorld();
    const p = w.mk("p1", { level: 10 });
    p.maxHp = 1000; p.hp = 10;
    w.inv.addItem(p, makeItem("hp_pot_huge", 2)); // 0: lv 30
    w.inv.addItem(p, makeItem("ham", 1));         // 1: lv 30
    w.inv.addItem(p, makeItem("hp_pot", 1));      // 2: lv 1
    w.inv.onUseItem(p, { index: 0 });
    expect(w.notices().at(-1)).toBe("Você precisa ser level 30 para usar isso.");
    expect([p.hp, bp(w)[0]?.count]).toEqual([10, 2]);
    w.inv.onUseItem(p, { index: 1 });
    expect(w.notices().at(-1)).toBe("Você precisa ser level 30 para usar isso.");
    expect(w.food.condition("p1", w.now())).toBeUndefined();
    expect(bp(w)[1]?.count).toBe(1);
    w.inv.onUseItem(p, { index: 2 }); // a recusa não iniciou recarga: a pequena entra na hora
    expect(p.hp).toBe(60);
    p.level = 30;
    w.advance(1000);
    w.inv.onUseItem(p, { index: 0 });
    expect(p.hp).toBe(510);
  });

  it("Q/E: a melhor poção que o level permite, não a primeira da mochila", () => {
    const w = invWorld();
    const p = w.mk("p1", { level: 20 });
    p.maxHp = 2000; p.hp = 1; p.maxMana = 1000; p.mana = 0;
    w.inv.addItem(p, makeItem("hp_pot", 5));       // 0: 50
    w.inv.addItem(p, makeItem("hp_pot_huge", 5));  // 1: 450 (lv 30)
    w.inv.addItem(p, makeItem("hp_pot_big", 5));   // 2: 200 (lv 15)
    w.inv.addItem(p, makeItem("mana_pot_big", 1)); // 3: 300 de mana (lv 15)
    w.inv.onQuickPotion(p, { kind: "hp" });
    expect(p.hp).toBe(201);
    expect(bp(w).map((x) => x?.count ?? 0).slice(0, 3)).toEqual([5, 5, 4]);
    p.level = 30;
    w.advance(1000);
    w.inv.onQuickPotion(p, { kind: "hp" });
    expect(p.hp).toBe(651);
    expect(bp(w)[1]?.count).toBe(4);
    // Só poções acima do level: o aviso diz o level, não "você não tem poção".
    p.level = 5;
    w.advance(1000);
    w.inv.onQuickPotion(p, { kind: "mana" });
    expect(w.notices().at(-1)).toBe("Você precisa ser level 15 para usar isso.");
    expect([p.mana, bp(w)[3]?.count]).toEqual([0, 1]);
  });

  it("discard destroys the item", () => {
    const w = invWorld();
    const p = w.mk();
    w.inv.addItem(p, makeItem("sword"));
    w.inv.onDiscard(p, { index: 0 });
    expect(bp(w)[0]).toBeNull();
  });
});

describe("inventory: organizar o depot (ciclo 17)", () => {
  const ids = (a: (ReturnType<typeof makeItem> | null)[]) => a.map((x) => (x ? `${x.defId}×${x.count}` : "-"));

  it("junta pilhas iguais até o máximo e ordena por categoria e nome; vazios no fim, mesmo tamanho", () => {
    const src = [null, makeItem("bone", 3), makeItem("mana_pot", 8), makeItem("sword"), null, makeItem("mana_pot", 7), makeItem("bone", 4), makeItem("shield"), makeItem("hp_pot", 2)];
    const out = organizeItems(src, itemsFx);
    expect(out).toHaveLength(src.length);
    // Arma, escudo, poções (Poção de Mana 10 + 5; Poção de Vida), material (Osso 7).
    expect(ids(out)).toEqual(["sword×1", "shield×1", "mana_pot×10", "mana_pot×5", "hp_pot×2", "bone×7", "-", "-", "-"]);
    // Puro: a entrada não mudou e a saída são cópias; a pilha que recebeu guarda o uid dela.
    expect(src[2]!.count).toBe(8);
    expect(out[2]).not.toBe(src[2]);
    expect(out[2]!.uid).toBe(src[2]!.uid);
    const total = (a: typeof src, id: string) => a.reduce((n, x) => n + (x?.defId === id ? x.count : 0), 0);
    for (const id of ["bone", "mana_pot", "hp_pot", "sword"]) expect(total(out, id)).toBe(total(src, id));
  });

  it("não junta raridade, refino ou bônus diferentes; dentro do mesmo item, o melhor primeiro", () => {
    const rare = { ...makeItem("katana", 1, "rare", [{ stat: "crit", value: 2 }]), refine: 3 };
    const common = makeItem("katana");
    const plusFive = { ...makeItem("katana"), refine: 5 };
    const goldBone = makeItem("bone", 2, "uncommon"), bone = makeItem("bone", 2);
    const out = organizeItems([common, bone, rare, goldBone, plusFive], itemsFx);
    expect(out.map((x) => [x?.defId, x?.rarity, x?.refine ?? 0, x?.count])).toEqual([
      ["katana", "rare", 3, 1], ["katana", "common", 5, 1], ["katana", "common", 0, 1], ["bone", "uncommon", 0, 2], ["bone", "common", 0, 2],
    ]);
    expect(out[0]!.bonuses).toEqual([{ stat: "crit", value: 2 }]);
  });

  it("C2S.SortContainer: só com o depot aberto; organiza e reenvia o depot", () => {
    let open = false;
    const w = invWorld({ depotOpen: () => open });
    const p = w.mk();
    const dp = w.inv.get("p1")!.depot;
    dp[5] = makeItem("bone", 2); dp[9] = makeItem("sword"); dp[11] = makeItem("bone", 3);
    w.inv.onSortContainer(p, { where: "depot" });
    expect(w.notices().at(-1)).toBe(MSG.depotClosed);
    expect(dp[5]?.count).toBe(2);
    open = true;
    w.inv.onSortContainer(p, { where: "backpack" } as any);
    expect(dp[0]).toBeNull();
    w.inv.onSortContainer(p, { where: "depot" });
    expect(ids(dp.slice(0, 3))).toEqual(["sword×1", "bone×5", "-"]);
    w.inv.flush();
    expect(w.sent.some((s) => s.type === S2C.Depot && s.msg.items[1]?.count === 5)).toBe(true);
  });
});

describe("inventory: depot", () => {
  it("only works while the depot is open", () => {
    let open = false;
    const w = invWorld({ depotOpen: () => open });
    const p = w.mk();
    w.inv.addItem(p, makeItem("bone", 5));
    w.inv.onMoveItem(p, { from: { where: "backpack", index: 0 }, to: { where: "depot", index: 0 } });
    expect(w.notices().at(-1)).toBe(MSG.depotClosed);
    open = true;
    w.inv.onMoveItem(p, { from: { where: "backpack", index: 0 }, to: { where: "depot", index: 0 } });
    expect(w.inv.get("p1")!.depot[0]?.count).toBe(5);
    w.inv.flush();
    expect(w.sent.some((s) => s.type === S2C.Depot && s.msg.items[0]?.defId === "bone")).toBe(true);
  });

  // Ciclo 14 (14-18): o clique rápido aponta a primeira pilha igual com espaço (shared stackTarget); o servidor junta
  // nela e espalha o resto pelas outras pilhas iguais e espaços vazios do destino.
  it("guardar em pilha igual junta e o que sobra vai para o próximo espaço do depot, sem aviso", () => {
    const w = invWorld({ depotOpen: () => true });
    const p = w.mk();
    const dp = w.inv.get("p1")!.depot;
    dp[0] = makeItem("mana_pot", 8);        // máximo 10
    dp[1] = makeItem("sword");
    w.inv.addItem(p, makeItem("mana_pot", 7));
    w.inv.onMoveItem(p, { from: { where: "backpack", index: 0 }, to: { where: "depot", index: 0 } });
    expect([dp[0]?.count, dp[1]?.defId, dp[2]?.defId, dp[2]?.count]).toEqual([10, "sword", "mana_pot", 5]);
    expect(bp(w)[0]).toBeNull();
    expect(w.notices()).toEqual([]);
  });

  it("retirar para a mochila sem espaço vazio mas com pilha igual com espaço: junta, sem \"Mochila cheia\" falso", () => {
    const w = invWorld({ depotOpen: () => true });
    const p = w.mk();
    w.inv.addItem(p, makeItem("mana_pot", 3));
    for (let k = 1; k < BACKPACK_SIZE; k++) w.inv.addItem(p, makeItem("sword"));
    expect(bp(w).every(Boolean)).toBe(true);
    const dp = w.inv.get("p1")!.depot;
    dp[4] = makeItem("mana_pot", 5);
    w.inv.onMoveItem(p, { from: { where: "depot", index: 4 }, to: { where: "backpack", index: 0 } });
    expect([bp(w)[0]?.count, dp[4]]).toEqual([8, null]);
    expect(w.notices()).toEqual([]);
  });

  it("cheio de verdade: junta o que cabe, o resto fica na origem e aí sim avisa", () => {
    const w = invWorld({ depotOpen: () => true });
    const p = w.mk();
    const dp = w.inv.get("p1")!.depot;
    for (let k = 0; k < dp.length; k++) dp[k] = makeItem("sword");
    dp[3] = makeItem("mana_pot", 9);
    w.inv.addItem(p, makeItem("mana_pot", 7));
    w.inv.onMoveItem(p, { from: { where: "backpack", index: 0 }, to: { where: "depot", index: 3 } });
    expect([dp[3]?.count, bp(w)[0]?.count]).toEqual([10, 6]);
    expect(w.notices().at(-1)).toBe(MSG.depotFull);
    // Pilha do depot já cheia e nenhum espaço: nada muda, mesmo aviso.
    w.inv.onMoveItem(p, { from: { where: "backpack", index: 0 }, to: { where: "depot", index: 3 } });
    expect([dp[3]?.count, bp(w)[0]?.count]).toEqual([10, 6]);
    expect(w.notices().filter((t) => t === MSG.depotFull)).toHaveLength(2);
  });

  it("dentro da própria mochila continua como antes: junta o que cabe e o resto fica, sem espalhar", () => {
    const w = invWorld();
    const p = w.mk();
    w.inv.addItem(p, makeItem("mana_pot", 9));
    w.inv.onMoveItem(p, { from: { where: "backpack", index: 0 }, to: { where: "backpack", index: 1 }, count: 4 });
    w.inv.addItem(p, makeItem("mana_pot", 1)); // 0: 5 → 6
    w.inv.onMoveItem(p, { from: { where: "backpack", index: 1 }, to: { where: "backpack", index: 0 } });
    expect([bp(w)[0]?.count, bp(w)[1], bp(w)[2]]).toEqual([10, null, null]);
    w.inv.addItem(p, makeItem("mana_pot", 7)); // 1: 7
    w.inv.onMoveItem(p, { from: { where: "backpack", index: 1 }, to: { where: "backpack", index: 0 } });
    expect([bp(w)[0]?.count, bp(w)[1]?.count]).toEqual([10, 7]);
    expect(w.notices()).toEqual([]);
  });
});

describe("inventory: stats aggregation", () => {
  it("sums armor, attack, hpMax (with bonuses) and recomputes max hp", () => {
    const w = invWorld();
    const p = w.mk("p1", { vocation: "knight", level: 30 });
    const base = baseStats("knight", 30);
    expect(p.maxHp).toBe(base.maxHp);
    w.inv.addItem(p, makeItem("plate", 1, "rare", [{ stat: "hpMax", value: 25 }, { stat: "armor", value: 2 }]));
    w.inv.addItem(p, makeItem("sword", 1, "uncommon", [{ stat: "attack", value: 4 }]));
    w.inv.addItem(p, makeItem("ring"));
    w.inv.onMoveItem(p, { from: { where: "backpack", index: 0 }, to: { where: "equip", slot: "armor" } });
    w.inv.onMoveItem(p, { from: { where: "backpack", index: 1 }, to: { where: "equip", slot: "weapon" } });
    w.inv.onMoveItem(p, { from: { where: "backpack", index: 2 }, to: { where: "equip", slot: "ring" } });
    expect(w.inv.stats("p1")).toEqual({ armor: 7, hpMax: 65, attack: 24, crit: 10, magic: 2, hpRegen: 3 });
    expect(p.maxHp).toBe(base.maxHp + 65);
    p.hp = p.maxHp;
    // Tira a armadura: maxHp cai e a vida é limitada.
    w.inv.onMoveItem(p, { from: { where: "equip", slot: "armor" }, to: { where: "backpack", index: 0 } });
    expect(p.maxHp).toBe(base.maxHp);
    expect(p.hp).toBe(base.maxHp);
    // Arma: weaponDamageRange com attack total e skill + crítico do anel.
    const prof = attackProfile({ ...p, skillMelee: 20 } as typeof p, itemsFx("sword"), (s) => w.inv.stat("p1", s));
    expect(prof.damage).toEqual(weaponDamageRange(24, 20, 30));
    // Nunca abaixo do desarmado: no level 150 essa arma fraca perderia do punho — vale o desarmado com a skill efetiva.
    const weak = attackProfile({ ...p, level: 150, skillMelee: 20 } as typeof p, itemsFx("sword"), (s) => w.inv.stat("p1", s));
    const armed = weaponDamageRange(24, 20, 150), fists = playerDamageRange("knight", 150, 20 + w.inv.stat("p1", "melee"));
    expect(armed[1]).toBeLessThan(fists[0]);
    expect(weak.damage).toEqual(fists);
    expect(prof.critPct).toBeCloseTo(0.17);
    expect(prof.range).toBe(1);
    // Desarmado = fórmula da vocação.
    expect(attackProfile(p, undefined).damage).toEqual(playerDamageRange("knight", 30, undefined));
  });

  it("weapon range/damageKind override the vocation", () => {
    const p = invWorld().mk("x", { vocation: "paladin", level: 10 });
    const prof = attackProfile(p, itemsFx("bow"), (s) => (s === "attack" ? 12 : 0));
    expect([prof.range, prof.kind, prof.ranged]).toEqual([6, "physical", true]);
  });

  it("refino (ciclo 16) entra nos atributos do equipamento: +3 de ataque na arma, +1 de armadura por nível", () => {
    const w = invWorld();
    const p = w.mk("p1", { vocation: "knight", level: 40 });
    w.inv.addItem(p, { ...makeItem("katana"), refine: 2 });
    w.inv.addItem(p, { ...makeItem("mithril_plate", 1, "rare", [{ stat: "armor", value: 1 }]), refine: 3 });
    w.inv.onMoveItem(p, { from: { where: "backpack", index: 0 }, to: { where: "equip", slot: "weapon" } });
    w.inv.onMoveItem(p, { from: { where: "backpack", index: 1 }, to: { where: "equip", slot: "armor" } });
    expect(w.inv.stats("p1")).toEqual({ attack: 76, armor: 9 });
  });

  it("persistence roundtrip", () => {
    const w = invWorld();
    const p = w.mk();
    w.inv.addItem(p, makeItem("vest", 1, "epic", [{ stat: "hpMax", value: 9 }]));
    w.inv.addItem(p, makeItem("bone", 7));
    w.inv.onMoveItem(p, { from: { where: "backpack", index: 0 }, to: { where: "equip", slot: "armor" } });
    w.inv.addGold(p, 123);
    const saved = JSON.parse(JSON.stringify(w.inv.serialize("p1")));
    const w2 = invWorld();
    const q = w2.mk("p1");
    w2.inv.load(q, { ...saved, backpack: [...saved.backpack, { defId: "nope", count: 1 }] });
    expect(w2.inv.serialize("p1")).toEqual(w.inv.serialize("p1"));
    expect(w2.inv.stat("p1", "hpMax")).toBe(29);
  });
});

describe("inventory: refino preservado e sanitizado (ciclo 16)", () => {
  it("sanitizeItem: mantém 1..5 em item refinável; descarta o resto (sem criar o campo)", () => {
    const ok = sanitizeItem({ uid: "a", defId: "katana", count: 1, rarity: "rare", bonuses: [], refine: 4 }, itemsFx);
    expect(ok).toEqual({ uid: "a", defId: "katana", count: 1, rarity: "rare", bonuses: [], refine: 4 });
    for (const refine of [0, 6, -2, 1.5, "3", null]) {
      const it = sanitizeItem({ uid: "a", defId: "katana", count: 1, rarity: "common", bonuses: [], refine }, itemsFx)!;
      expect(Object.keys(it), String(refine)).not.toContain("refine");
    }
    // Item que não é refinável (espada sem level, anel): o campo some.
    expect(Object.keys(sanitizeItem({ defId: "sword", refine: 2 }, itemsFx)!)).not.toContain("refine");
    expect(Object.keys(sanitizeItem({ defId: "ring", refine: 2 }, itemsFx)!)).not.toContain("refine");
    // Save antigo (sem o campo) continua igual.
    expect(sanitizeItem({ uid: "b", defId: "katana", count: 1, rarity: "common", bonuses: [] }, itemsFx)).toEqual({ uid: "b", defId: "katana", count: 1, rarity: "common", bonuses: [] });
  });

  it("vai e volta do banco no equipamento, na mochila e no depot", () => {
    const w = invWorld({ depotOpen: () => true });
    const p = w.mk("p1", { level: 40 });
    w.inv.addItem(p, { ...makeItem("katana"), refine: 5 });
    w.inv.addItem(p, { ...makeItem("mithril_plate"), refine: 2 });
    w.inv.addItem(p, { ...makeItem("katana"), refine: 1 });
    w.inv.onMoveItem(p, { from: { where: "backpack", index: 0 }, to: { where: "equip", slot: "weapon" } });
    w.inv.onMoveItem(p, { from: { where: "backpack", index: 2 }, to: { where: "depot", index: 7 } });
    expect(w.inv.get("p1")!.depot[7]!.refine).toBe(1);
    // Depot → mochila de volta → outro espaço do depot: continua +1.
    w.inv.onMoveItem(p, { from: { where: "depot", index: 7 }, to: { where: "backpack", index: 2 } });
    expect(bp(w)[2]!.refine).toBe(1);
    w.inv.onMoveItem(p, { from: { where: "backpack", index: 2 }, to: { where: "depot", index: 3 } });
    expect(w.inv.get("p1")!.depot[3]!.refine).toBe(1);
    const saved = JSON.parse(JSON.stringify(w.inv.serialize("p1")));
    const w2 = invWorld();
    const q = w2.mk("p1", { level: 40 });
    w2.inv.load(q, saved);
    expect(w2.inv.serialize("p1")).toEqual(w.inv.serialize("p1"));
    expect(eq(w2).weapon!.refine).toBe(5);
    expect(bp(w2)[1]!.refine).toBe(2);
    expect(w2.inv.get("p1")!.depot[3]!.refine).toBe(1);
    expect(w2.inv.stat("p1", "attack")).toBe(85);
  });

  it("largar do equipamento leva o refino junto (a instância inteira sai)", () => {
    const w = invWorld();
    const p = w.mk("p1", { level: 40 });
    w.inv.addItem(p, { ...makeItem("katana"), refine: 3 });
    w.inv.onMoveItem(p, { from: { where: "backpack", index: 0 }, to: { where: "equip", slot: "weapon" } });
    const out = w.inv.takeForDrop(p, { where: "equip", slot: "weapon" });
    expect(out!.refine).toBe(3);
    expect(w.inv.stat("p1", "attack")).toBe(0);
  });
});

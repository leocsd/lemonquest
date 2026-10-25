import { describe, expect, it } from "vitest";
import { FOOD_MAX_MS, FOOD_TICK_MS } from "@lemonquest/shared";
import { MSG, makeItem } from "./inventory.ts";
import { invWorld } from "./m4kit.ts";

const bp = (w: ReturnType<typeof invWorld>) => w.inv.get("p1")!.backpack;

describe("food", () => {
  it("eating grants fed with remaining time, no instant heal, consumes one", () => {
    const w = invWorld();
    const p = w.mk("p1", { hp: 150 }); p.hp = 10;
    w.inv.addItem(p, makeItem("bread", 2));
    w.inv.onUseItem(p, { index: 0 });
    expect(p.hp).toBe(10);
    expect(bp(w)[0]?.count).toBe(1);
    expect(w.food.condition("p1", w.now())).toMatchObject({ id: "fed", remainingMs: 600_000, value: 1, value2: 1 });
  });

  it("duration adds, rates are the time-weighted average, capped at 20 min; satisfied notice at cap without consuming", () => {
    const w = invWorld();
    const p = w.mk();
    w.inv.addItem(p, makeItem("bread", 5));
    w.inv.addItem(p, makeItem("steak", 5));
    w.inv.onUseItem(p, { index: 0 });           // bread: +1/+1, 10 min
    w.advance(1000);
    w.inv.onUseItem(p, { index: 1 });           // steak: +6/+0, 12 min → 599 s + 601 s (cap 20 min)
    const c = w.food.condition("p1", w.now())!;
    expect(c.value).toBe(4);                    // (1×599 + 6×601) / 1200 = 3,5 (era 6: a maior taxa pelo tempo somado)
    expect(c.value2).toBe(1);                   // (1×599 + 0×601) / 1200 ≈ 0,5: ainda regenera, o ícone mostra 1
    expect(w.food.serialize("p1", w.now())).toMatchObject({ hpPerTick: 3.5042, manaPerTick: 0.4992 });
    expect(c.remainingMs).toBe(FOOD_MAX_MS);
    w.advance(1000);
    w.inv.onUseItem(p, { index: 0 });
    expect(w.notices().at(-1)).toBe(MSG.satisfied);
    expect(w.sent.filter((s) => s.type === "notice").at(-1)!.msg.kind).toBe("info");
    expect(bp(w)[0]?.count).toBe(4);            // not consumed
    w.advance(20_000);                          // below cap again → can eat
    w.inv.onUseItem(p, { index: 0 });
    expect(bp(w)[0]?.count).toBe(3);
  });

  it("ticks restore hp and mana every 2 s, only when there is something to restore", () => {
    const w = invWorld();
    const p = w.mk("p1", { hp: 150, mana: 50 }); p.hp = 100; p.mana = 50;
    w.inv.addItem(p, makeItem("steak", 1));
    w.inv.onUseItem(p, { index: 0 });
    w.advance(FOOD_TICK_MS - 1);
    w.tickFood();
    expect(p.hp).toBe(100);
    w.advance(1);
    w.tickFood();
    expect(p.hp).toBe(106);
    expect(w.events.filter((e) => e.food)).toEqual([{ kind: "heal", amount: 6, food: true }]);
  });

  it("restores both hp and mana when both are missing", () => {
    const w = invWorld();
    const p = w.mk("p1", { hp: 150, mana: 50 }); p.hp = 100; p.mana = 10;
    w.inv.addItem(p, makeItem("bread", 1));
    w.inv.onUseItem(p, { index: 0 });
    w.advance(FOOD_TICK_MS);
    w.tickFood();
    expect([p.hp, p.mana]).toEqual([101, 11]);
    expect(w.events.filter((e) => e.food).map((e) => e.kind)).toEqual(["heal", "mana"]);
  });

  it("expires after the duration", () => {
    const w = invWorld();
    const p = w.mk(); p.hp = 1;
    w.inv.addItem(p, makeItem("bread", 1));
    w.inv.onUseItem(p, { index: 0 });
    w.advance(600_000 + 1);
    w.tickFood();
    expect(w.food.condition("p1", w.now())).toBeUndefined();
  });

  it("persists remaining time and rates across logout (time does not pass offline)", () => {
    const w = invWorld();
    const p = w.mk();
    w.inv.addItem(p, makeItem("steak", 1));
    w.inv.onUseItem(p, { index: 0 });
    w.advance(60_000);
    const saved = w.food.serialize("p1", w.now())!;
    expect(saved).toEqual({ remainingMs: 660_000, hpPerTick: 6, manaPerTick: 0 });
    w.food.removePlayer("p1");
    w.advance(5 * 3_600_000);
    w.food.load("p1", { fed: JSON.parse(JSON.stringify(saved)) }, w.now());
    expect(w.food.condition("p1", w.now())).toMatchObject({ remainingMs: 660_000, value: 6, value2: 0 });
  });

  // Ciclo 14 (14-15): a vida total recuperada é a soma da de cada comida (taxa ponderada pelo tempo), nunca a taxa da
  // mais forte pelo tempo somado. Bife = 6 por tick × 12 min (360 ticks); Pão = 1 por tick × 10 min (300 ticks).
  function healedOver(first: string, second: string) {
    const w = invWorld();
    const p = w.mk();
    p.maxHp = 1_000_000; p.hp = 1;
    w.inv.addItem(p, makeItem(first, 1));
    w.inv.addItem(p, makeItem(second, 1));
    w.inv.onUseItem(p, { index: 0 });
    w.advance(1000);
    w.inv.onUseItem(p, { index: 1 });
    const rate = w.food.condition("p1", w.now())!.value!;
    for (let t = 0; t < FOOD_MAX_MS; t += FOOD_TICK_MS) { w.advance(FOOD_TICK_MS); w.tickFood(); }
    expect(w.food.condition("p1", w.now())).toBeUndefined();
    return { healed: p.hp - 1, rate };
  }

  it("comida fraca em cima de forte não estica a taxa forte; forte em cima de fraca não vale a forte pelo tempo todo", () => {
    // Bife e depois Pão: 719 s de bife + 481 s de pão (o teto corta o pão) → ~6×359,5 + 1×240,5 = 2.397.
    const weakOnStrong = healedOver("steak", "bread");
    expect(weakOnStrong.rate).toBe(4);
    expect(weakOnStrong.healed).toBeGreaterThanOrEqual(2390);
    expect(weakOnStrong.healed).toBeLessThanOrEqual(2405);  // regra antiga: 6 × 600 ticks = 3.600
    // Pão e depois Bife: 599 s de pão + 601 s de bife → ~1×299,5 + 6×300,5 = 2.103.
    const strongOnWeak = healedOver("bread", "steak");
    expect(strongOnWeak.rate).toBe(4);
    expect(strongOnWeak.healed).toBeGreaterThanOrEqual(2095);
    expect(strongOnWeak.healed).toBeLessThanOrEqual(2110);
  });

  it("taxa fracionária: o resto acumula entre os ticks (3,5 por tick = 7 a cada 2 ticks)", () => {
    const w = invWorld();
    const p = w.mk();
    p.maxHp = 10_000; p.hp = 1;
    w.food.load("p1", { fed: { remainingMs: 60_000, hpPerTick: 3.5, manaPerTick: 0 } }, w.now());
    const heals: number[] = [];
    for (let k = 0; k < 4; k++) {
      const before = p.hp;
      w.advance(FOOD_TICK_MS);
      w.tickFood();
      heals.push(p.hp - before);
    }
    expect(heals).toEqual([3, 4, 3, 4]);
    expect(w.food.serialize("p1", w.now())).toMatchObject({ hpPerTick: 3.5, manaPerTick: 0 });
  });

  it("food cooldown is separate from potions", () => {
    const w = invWorld();
    const p = w.mk("p1", { hp: 150, mana: 50 }); p.hp = 10; p.mana = 0;
    w.inv.addItem(p, makeItem("hp_pot", 3));
    w.inv.addItem(p, makeItem("bread", 3));
    w.inv.onUseItem(p, { index: 0 });           // potion
    w.inv.onUseItem(p, { index: 1 });           // food right after: allowed
    expect(w.food.condition("p1", w.now())).toBeDefined();
    w.inv.onUseItem(p, { index: 1 });           // second food within 1 s
    expect(w.notices().at(-1)).toBe(MSG.foodCooldown);
    expect(bp(w)[1]?.count).toBe(2);
    w.inv.onQuickPotion(p, { kind: "mana" });   // quick potion is potions-only (ignores food)
    expect(w.notices().at(-1)).toBe(MSG.noMana);
  });
});

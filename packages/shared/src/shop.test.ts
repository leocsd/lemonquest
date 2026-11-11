import { describe, expect, it } from "vitest";
import { backpackRoom, MAX_TRADE_COUNT, shopBuyMax } from "./shop.ts";
import type { ItemDef, ItemInstance } from "./data/items.ts";

const potion = { id: "health_potion", stackable: true, maxStack: 20 } as ItemDef;
const sword = { id: "short_sword", stackable: false } as ItemDef;
const inst = (defId: string, count: number) => ({ defId, count }) as ItemInstance;

describe("loja em lote", () => {
  it("espaço: slot vazio vale uma pilha cheia; pilha do mesmo item vale o que falta", () => {
    expect(backpackRoom([null, inst("health_potion", 15), inst("meat", 3)], potion)).toBe(20 + 5);
    expect(backpackRoom([null, null, inst("short_sword", 1)], sword)).toBe(2);
    expect(backpackRoom([inst("health_potion", 20)], potion)).toBe(0);
  });

  it("máximo: o menor entre ouro, espaço e o teto da mensagem", () => {
    expect(shopBuyMax({ price: 50, gold: 1000, room: 500 })).toBe(20);
    expect(shopBuyMax({ price: 50, gold: 100_000, room: 37 })).toBe(37);
    expect(shopBuyMax({ price: 1, gold: 100_000, room: 500 })).toBe(MAX_TRADE_COUNT);
    expect(shopBuyMax({ price: 50, gold: 49, room: 10 })).toBe(0);
  });

  it("encomenda especial (1 por semana) nunca passa de 1", () => {
    expect(shopBuyMax({ price: 100, gold: 1_000_000, room: 10, limited: true })).toBe(1);
  });
});

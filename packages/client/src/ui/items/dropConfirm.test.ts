import { describe, expect, it } from "vitest";
import { needsSellConfirm, sellConfirmText } from "./dropConfirm.ts";

describe("venda ao NPC", () => {
  it("item refinado pede o segundo clique; sem refino vende direto", () => {
    expect(needsSellConfirm({ refine: 5 })).toBe(true);
    expect(needsSellConfirm({ refine: 0 })).toBe(false);
    expect(needsSellConfirm({})).toBe(false);
    expect(sellConfirmText(5)).toBe("O NPC paga só o valor base: o refino +5 se perde.");
  });
});

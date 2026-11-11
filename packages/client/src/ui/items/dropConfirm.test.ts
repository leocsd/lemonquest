import { describe, expect, it } from "vitest";
import { RARITIES } from "@lemonquest/shared";
import { dropConfirmText, needsDropConfirm, needsSellConfirm, sellConfirmText } from "./dropConfirm.ts";

describe("largar no chão por arrasto", () => {
  it("comum e incomum largam direto; raro, épico e lendário pedem confirmação", () => {
    expect(RARITIES.filter((rarity) => needsDropConfirm({ rarity }))).toEqual(["rare", "epic", "legendary"]);
    expect(needsDropConfirm({ rarity: "common" })).toBe(false);
    expect(needsDropConfirm({ rarity: "uncommon" })).toBe(false);
  });

  it("venda ao NPC: item refinado pede o segundo clique; sem refino vende direto", () => {
    expect(needsSellConfirm({ refine: 5 })).toBe(true);
    expect(needsSellConfirm({ refine: 0 })).toBe(false);
    expect(needsSellConfirm({})).toBe(false);
    expect(sellConfirmText(5)).toBe("O NPC paga só o valor base: o refino +5 se perde.");
  });

  it("item refinado pede confirmação mesmo comum (o refino custou caro)", () => {
    expect(needsDropConfirm({ rarity: "common", refine: 1 })).toBe(true);
    expect(needsDropConfirm({ rarity: "common", refine: 0 })).toBe(false);
  });

  it("texto avisa que qualquer um pode pegar", () => {
    expect(dropConfirmText("Espada Longa", "Raro")).toBe("Largar Espada Longa (raro) no chão? Qualquer um pode pegar.");
  });
});

import { describe, expect, it } from "vitest";
import { damageText } from "./damageText.ts";

describe("damageText (resistência visível, ciclo 17)", () => {
  it("dano normal e crítico não mudam", () => {
    expect(damageText({ amount: 120 })).toBe("120");
    expect(damageText({ amount: 240, crit: true })).toBe("240!");
  });

  it("↓ quando o monstro resistiu, ↑ quando era fraco (com ou sem crítico)", () => {
    expect(damageText({ amount: 60, resisted: 0.5 })).toBe("60↓");
    expect(damageText({ amount: 138, resisted: 1.15 })).toBe("138↑");
    expect(damageText({ amount: 300, crit: true, resisted: 1.25 })).toBe("300!↑");
    expect(damageText({ amount: 90, resisted: 1 })).toBe("90");
  });

  it("golpe zerado: \"resistiu\" se foi a resistência, \"errou\" nos outros casos", () => {
    expect(damageText({ amount: 0, miss: true, resisted: 0 })).toBe("resistiu");
    expect(damageText({ amount: 0, miss: true, resisted: 0.5 })).toBe("resistiu");
    expect(damageText({ amount: 0, miss: true })).toBe("errou");
    expect(damageText({ amount: 0, miss: true, resisted: 1.25 })).toBe("errou");
  });
});

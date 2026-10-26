import { describe, expect, it } from "vitest";
import type { ChallengesMsg } from "@lemonquest/shared";
import { hasClaimable } from "./challengeLogic.ts";

const msg = (goals: [number, number, boolean][], bonusClaimed = false): ChallengesMsg => ({
  weekEndsAt: 0,
  goals: goals.map(([progress, target, claimed], i) => ({ id: `g${i}`, name: "", desc: "", progress, target, claimed, reward: {} })),
  bonus: { reward: {}, claimed: bonusClaimed },
});

describe("hasClaimable (ponto no botão do trilho)", () => {
  it("acende com desafio cumprido sem resgate ou com o bônus liberado; apaga com tudo resgatado", () => {
    expect(hasClaimable(null)).toBe(false);
    expect(hasClaimable(msg([[0, 10, false], [5, 10, false], [9, 10, false]]))).toBe(false);
    expect(hasClaimable(msg([[10, 10, false], [5, 10, false], [9, 10, false]]))).toBe(true);
    expect(hasClaimable(msg([[10, 10, true], [5, 10, false], [9, 10, false]]))).toBe(false);
    expect(hasClaimable(msg([[10, 10, true], [10, 10, true], [10, 10, true]]))).toBe(true); // bônus
    expect(hasClaimable(msg([[10, 10, true], [10, 10, true], [10, 10, true]], true))).toBe(false);
  });
});

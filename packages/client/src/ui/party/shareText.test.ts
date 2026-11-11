import { describe, expect, it } from "vitest";
import { PARTY_SHARE_BONUS, PARTY_VOCATION_BONUS, PARTY_VOCATION_BONUS_MIN } from "@lemonquest/shared";
import { shareBonusText } from "./shareText.ts";

describe("dica da XP compartilhada", () => {
  it("diz o bônus real (por membro e por vocações), tirado das constantes", () => {
    const t = shareBonusText();
    expect(t).toContain(`+${Math.round(PARTY_SHARE_BONUS * 100)}% por membro extra`);
    expect(t).toContain(`+${Math.round(PARTY_VOCATION_BONUS * 100)}% a mais com ${PARTY_VOCATION_BONUS_MIN} vocações diferentes`);
    expect(t).toBe("XP dividida com bônus de +35% por membro extra (+20% a mais com 3 vocações diferentes)");
  });
});

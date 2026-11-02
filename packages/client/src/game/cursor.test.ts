import { describe, expect, it } from "vitest";
import { canvasCursor, type HoverInfo } from "./cursor.ts";

const nada: HoverInfo = { creature: false, npc: false, usable: false, groundItem: false, player: false, shift: false };

describe("canvasCursor", () => {
  it("segue o que o clique faria", () => {
    expect(canvasCursor(nada)).toBe("padrao");
    expect(canvasCursor({ ...nada, creature: true })).toBe("ataque");
    expect(canvasCursor({ ...nada, npc: true })).toBe("falar");
    expect(canvasCursor({ ...nada, usable: true })).toBe("mao");
    expect(canvasCursor({ ...nada, player: true })).toBe("mao");
    expect(canvasCursor({ ...nada, groundItem: true })).toBe("pegar");
  });

  it("criatura vence item no chão (o clique ataca)", () => {
    expect(canvasCursor({ ...nada, creature: true, groundItem: true })).toBe("ataque");
  });

  it("Shift vira olhar só sobre alguma coisa", () => {
    expect(canvasCursor({ ...nada, shift: true })).toBe("padrao");
    expect(canvasCursor({ ...nada, shift: true, creature: true })).toBe("olhar");
    expect(canvasCursor({ ...nada, shift: true, groundItem: true })).toBe("olhar");
  });
});

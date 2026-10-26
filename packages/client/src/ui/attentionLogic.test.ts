import { describe, expect, it } from "vitest";
import {
  COMBAT_ATTENTION_MS, attentionTitle, combatAttention, freshCombatAttention, hitsMe, isFriendNotice, nextAlert,
} from "./attentionLogic.ts";

describe("attentionTitle", () => {
  it("sem aviso, o título normal; com aviso, o contador na frente; passou de 9 vira 9+", () => {
    expect(attentionTitle("Jogo", 0)).toBe("Jogo");
    expect(attentionTitle("Jogo", 3)).toBe("(3) Jogo");
    expect(attentionTitle("Jogo", 12)).toBe("(9+) Jogo");
  });
});

describe("isFriendNotice", () => {
  it("reconhece os avisos de amigo do servidor e nada além", () => {
    expect(isFriendNotice("Beto (amigo) entrou no jogo.")).toBe(true);
    expect(isFriendNotice("Beto (amigo) saiu do jogo.")).toBe(true);
    expect(isFriendNotice("Troca concluída com Beto.")).toBe(false);
  });
});

describe("avisos de combate na aba (ciclo 18)", () => {
  it("a marca de combate vai na frente do contador e a mais grave fica", () => {
    expect(attentionTitle("Jogo", 2, "⚔ Atacado!")).toBe("⚔ Atacado! (2) Jogo");
    expect(nextAlert("", "attacked")).toBe("⚔ Atacado!");
    expect(nextAlert("⚔ Atacado!", "lowHp")).toBe("⚠ Vida baixa!");
    expect(nextAlert("⚠ Vida baixa!", "attacked")).toBe("⚠ Vida baixa!");
    expect(nextAlert("⚠ Vida baixa!", "died")).toBe("☠ Você morreu!");
    expect(nextAlert("⚔ Atacado!", "whisper")).toBe("⚔ Atacado!"); // aviso sem marca não mexe nela
  });

  it("hitsMe: dano, erro ou escudo de mana em mim; curas, poções e golpes em outros não", () => {
    const ev = (o: Record<string, unknown>) => ({ sourceId: "m1", targetId: "me", amount: 10, kind: "physical", ...o }) as never;
    expect(hitsMe([ev({})], "me")).toBe(true);
    expect(hitsMe([ev({ amount: 0, miss: true })], "me")).toBe(true);
    expect(hitsMe([ev({ kind: "mana" })], "me")).toBe(true); // escudo de mana: o golpe saiu da mana
    expect(hitsMe([ev({ kind: "heal", sourceId: "amigo" })], "me")).toBe(false);
    expect(hitsMe([ev({ kind: "mana", sourceId: "me" })], "me")).toBe(false); // poção de mana
    expect(hitsMe([ev({ targetId: "outro" })], "me")).toBe(false);
    expect(hitsMe(undefined, "me")).toBe(false);
  });

  it("intervalo: apanhar sem parar avisa 1× a cada 15 s; vida baixa fura o intervalo (com o seu próprio)", () => {
    const st = freshCombatAttention();
    expect(combatAttention(st, 90, 100, 0)).toBe("attacked");
    expect(combatAttention(st, 80, 100, 5_000)).toBeNull();
    expect(combatAttention(st, 25, 100, 6_000)).toBe("lowHp");
    expect(combatAttention(st, 20, 100, 10_000)).toBeNull();
    expect(combatAttention(st, 20, 100, 6_000 + COMBAT_ATTENTION_MS)).toBe("lowHp"); // continua baixa: de novo só 15 s depois
    expect(combatAttention(st, 90, 100, 7_000 + COMBAT_ATTENTION_MS)).toBeNull();
    expect(combatAttention(st, 90, 100, 6_000 + 2 * COMBAT_ATTENTION_MS)).toBe("attacked");
    expect(combatAttention(freshCombatAttention(), 0, 0, 0)).toBe("attacked"); // sem vida conhecida: só "atacado"
  });
});

import { describe, expect, it } from "vitest";
import { addedLines, decideScroll, isAtBottom, scrolledAtBottom, STICK_PX, unseenText } from "./chatScroll.ts";

describe("chat: rolagem ao receber linhas", () => {
  it("rajada: o evento da nossa rolagem chega depois da linha seguinte crescer a lista e NÃO vira 'subiu' (2026-10-28)", () => {
    // Lista de 148 px visíveis. Linha A chega: rolamos para o fim (scrollTop 155, altura 303); antes do evento de scroll
    // chegar, a linha B (36 px) entra: altura 339. O evento então mede 36 px do fim — mas o scrollTop é o que deixamos.
    expect(isAtBottom(155, 148, 339)).toBe(false); // a conta antiga dizia "subiu uma linha"
    expect(scrolledAtBottom(true, 155, 155, 148, 339)).toBe(true); // ninguém mexeu: continua no fim
    // Leitor sobe de verdade (wheel): posição mudou → vale a distância ao fim.
    expect(scrolledAtBottom(true, 155, 115, 148, 339)).toBe(false);
    // Leitor volta ao fim com a mão.
    expect(scrolledAtBottom(false, 155, 191, 148, 339)).toBe(true);
    // Subiu e ficou lá: um evento na mesma posição (rolagem de 1 px por arredondamento) mantém "subiu".
    expect(scrolledAtBottom(false, 155, 115.4, 148, 339)).toBe(false);
    expect(scrolledAtBottom(false, 115, 115.4, 148, 339)).toBe(false);
  });

  it("subiu no histórico: segura só enquanto lê (mouse no chat); sem o mouse, volta a acompanhar", () => {
    expect(decideScroll(false, 2, 3, true)).toEqual({ scroll: false, unseen: 5 });
    expect(decideScroll(false, 2, 3, false)).toEqual({ scroll: true, unseen: 0 });
    expect(decideScroll(true, 0, 1, false)).toEqual({ scroll: true, unseen: 0 });
  });

  it("no fim (até 8 px) conta como colado; uma linha acima já não", () => {
    expect(isAtBottom(0, 136, 136)).toBe(true);
    expect(isAtBottom(100, 136, 236 + STICK_PX)).toBe(true);
    expect(isAtBottom(100, 136, 236 + STICK_PX + 1)).toBe(false);
    expect(isAtBottom(100, 136, 236 + 18)).toBe(false);
  });

  it("colado no fim rola e zera; lendo o histórico fica e acumula", () => {
    expect(decideScroll(true, 5, 2)).toEqual({ scroll: true, unseen: 0 });
    expect(decideScroll(false, 0, 2)).toEqual({ scroll: false, unseen: 2 });
    expect(decideScroll(false, 2, 3)).toEqual({ scroll: false, unseen: 5 });
    expect(decideScroll(false, 2, 0)).toEqual({ scroll: false, unseen: 2 });
  });

  it("conta só as linhas novas da aba visível (chaves únicas; o corte do histórico não conta)", () => {
    const prev = [{ key: "a", tab: "g" }, { key: "b", tab: "g" }];
    const next = [{ key: "b", tab: "g" }, { key: "c", tab: "g" }, { key: "d", tab: "p" }];
    expect(addedLines(prev, next, (l) => l.tab === "g")).toBe(1);
    expect(addedLines(prev, next, () => true)).toBe(2);
    expect(addedLines(next, next, () => true)).toBe(0);
  });

  it("pílula no singular e no plural", () => {
    expect(unseenText(1)).toBe("↓ 1 nova");
    expect(unseenText(4)).toBe("↓ 4 novas");
  });
});

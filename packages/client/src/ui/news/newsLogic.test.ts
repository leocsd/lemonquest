import { describe, expect, it } from "vitest";
import { shouldAutoShowNews, splitNews } from "./newsLogic.ts";

describe("shouldAutoShowNews", () => {
  it("personagem novo (level 1 sem XP) não vê sozinho", () => {
    expect(shouldAutoShowNews({ seen: null, level: 1, xp: 0 }, "b")).toBe(false);
  });
  it("quem já joga e não viu o mais recente vê; quem viu não vê de novo", () => {
    expect(shouldAutoShowNews({ seen: null, level: 5, xp: 300 }, "b")).toBe(true);
    expect(shouldAutoShowNews({ seen: "a", level: 5, xp: 300 }, "b")).toBe(true);
    expect(shouldAutoShowNews({ seen: "b", level: 5, xp: 300 }, "b")).toBe(false);
  });
  it("level 1 mas com XP já conta como quem joga", () => {
    expect(shouldAutoShowNews({ seen: null, level: 1, xp: 40 }, "b")).toBe(true);
  });
});

describe("splitNews (só o não visto aberto)", () => {
  const NEWS = [{ id: "d" }, { id: "c" }, { id: "b" }, { id: "a" }]; // a mais nova primeiro
  const ids = (l: { id: string }[]) => l.map((n) => n.id);

  it("viu a 'b': abertas as duas mais novas, o resto no histórico", () => {
    const s = splitNews(NEWS, "b");
    expect([ids(s.fresh), ids(s.history), s.nothingNew]).toEqual([["d", "c"], ["b", "a"], false]);
  });
  it("já viu a mais recente: ela fica aberta, com o aviso de nada novo", () => {
    const s = splitNews(NEWS, "d");
    expect([ids(s.fresh), ids(s.history), s.nothingNew]).toEqual([["d"], ["c", "b", "a"], true]);
  });
  it("nunca viu nada, ou viu um id que saiu da lista: só a mais recente aberta", () => {
    for (const seen of [null, "zz"]) {
      const s = splitNews(NEWS, seen);
      expect([ids(s.fresh), ids(s.history), s.nothingNew]).toEqual([["d"], ["c", "b", "a"], false]);
    }
    expect(splitNews([], null)).toEqual({ fresh: [], history: [], nothingNew: false });
  });
});

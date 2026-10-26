import { describe, expect, it } from "vitest";
import { applyVisibleOrder, dropIndex, moveItem, normalizeOrder, normalizePins, PANEL_IDS } from "./panels.ts";

describe("normalizeOrder", () => {
  it("usa a ordem padrão sem dados", () => {
    expect(normalizeOrder(null)).toEqual([...PANEL_IDS]);
    expect(normalizeOrder("lixo")).toEqual([...PANEL_IDS]);
  });
  it("ignora ids desconhecidos/duplicados e acrescenta os novos no fim", () => {
    expect(normalizeOrder(["battle", "ghost", "battle", 3, "minimap"])).toEqual(["battle", "minimap", "status", "equipment", "backpack", "party", "online"]);
  });
});

describe("normalizePins", () => {
  it("só aceita true para ids conhecidos", () => {
    const p = normalizePins({ battle: true, ghost: true, status: "sim" });
    expect(p.battle).toBe(true);
    expect(p.status).toBe(false);
    expect(Object.keys(p).sort()).toEqual([...PANEL_IDS].sort());
  });
  it("tolera lixo", () => {
    expect(normalizePins(null).minimap).toBe(false);
  });
});

describe("moveItem / applyVisibleOrder / dropIndex", () => {
  it("move para o índice na lista sem o item", () => {
    expect(moveItem(["a", "b", "c", "d"], "a", 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveItem(["a", "b", "c", "d"], "d", 0)).toEqual(["d", "a", "b", "c"]);
  });
  it("reordena só os visíveis, preservando as posições dos ocultos", () => {
    const order = ["minimap", "status", "equipment", "battle", "backpack"] as const;
    expect(applyVisibleOrder(order, ["battle", "status"])).toEqual(["minimap", "battle", "equipment", "status", "backpack"]);
  });
  it("calcula o destino pelo centro do arrastado", () => {
    const rects = [{ top: 0, height: 100 }, { top: 106, height: 50 }, { top: 162, height: 100 }];
    expect(dropIndex(rects, 0, 20)).toBe(0);
    expect(dropIndex(rects, 0, 140)).toBe(1);
    expect(dropIndex(rects, 0, 400)).toBe(2);
    expect(dropIndex(rects, 2, 10)).toBe(0);
  });
});

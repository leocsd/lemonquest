import { describe, expect, it } from "vitest";
import { OUTFIT_TONE_PRICE } from "@lemonquest/shared";
import { buyClick, buyLabel, toneStatus, toneToWear } from "./toneShop.ts";

describe("tingimento na janela de roupas", () => {
  it("natural e tons da conta vestem; tom não comprado é à venda (ou sem ouro)", () => {
    expect(toneStatus("", [], 0)).toBe("owned");
    expect(toneStatus("crimson", ["crimson"], 0)).toBe("owned");
    expect(toneStatus("crimson", [], OUTFIT_TONE_PRICE)).toBe("buy");
    expect(toneStatus("crimson", [], OUTFIT_TONE_PRICE - 1)).toBe("poor");
  });

  it("prévia de tom não comprado não vai no OK (o servidor recusaria a troca inteira): fica o tom atual", () => {
    expect(toneToWear("crimson", [], "azure")).toBe("azure");
    expect(toneToWear("crimson", ["crimson"], "azure")).toBe("crimson");
    expect(toneToWear("", [], "azure")).toBe("");
  });

  it("comprar pede dois cliques: o 1º só arma, o 2º compra", () => {
    const first = buyClick(false);
    expect(first).toEqual({ buy: false, confirming: true });
    expect(buyClick(first.confirming)).toEqual({ buy: true, confirming: false });
  });

  it("rótulos do botão com o preço", () => {
    expect(buyLabel("buy", false)).toBe("Comprar (8.000)");
    expect(buyLabel("buy", true)).toBe("Clique de novo para comprar (8.000)");
    expect(buyLabel("poor", false)).toBe("Ouro insuficiente (8.000)");
  });
});

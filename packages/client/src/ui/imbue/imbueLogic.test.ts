import { describe, expect, it } from "vitest";
import { imbueClick } from "./imbueLogic.ts";

describe("clique na grade de encantamentos", () => {
  it("sem ativo compra no 1º clique; esperando a resposta, o 2º clique (duplo) é ignorado", () => {
    expect(imbueClick({ pending: false, hasActive: false, asking: "", key: "lifesteal:1" })).toBe("buy");
    expect(imbueClick({ pending: true, hasActive: false, asking: "", key: "lifesteal:1" })).toBe("ignore");
  });

  it("com ativo: 1º clique arma a confirmação, 2º na mesma célula compra; outra célula arma de novo", () => {
    expect(imbueClick({ pending: false, hasActive: true, asking: "", key: "pierce:2" })).toBe("confirm");
    expect(imbueClick({ pending: false, hasActive: true, asking: "pierce:2", key: "pierce:2" })).toBe("buy");
    expect(imbueClick({ pending: false, hasActive: true, asking: "pierce:2", key: "haste:2" })).toBe("confirm");
    expect(imbueClick({ pending: true, hasActive: true, asking: "pierce:2", key: "pierce:2" })).toBe("ignore");
  });
});

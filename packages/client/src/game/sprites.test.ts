import { describe, expect, it } from "vitest";
import { OUTFITS } from "@lemonquest/shared";
import { ADDON_SHEET_LIST, ALL_SHEETS, outfitLook } from "./sprites.ts";

describe("visual do jogador por sexo (outfitLook)", () => {
  it("roupa com versão feminina: sheet e overlays dela (chaves _f, então o tingimento também fica por sexo)", () => {
    const m = outfitLook("cidadao", 3, "knight");
    const f = outfitLook("cidadao", 3, "knight", undefined, "f");
    expect(m.sheet.key).toBe("outfit_cidadao");
    expect(f.sheet.key).toBe("outfit_cidadao_f");
    expect(f.sheet.url).toBe(OUTFITS.cidadao!.female);
    expect(m.addons!.map((a) => a.sheet.key)).toEqual(["addon_cidadao_chapeu", "addon_cidadao_mochila_back", "addon_cidadao_mochila"]);
    expect(f.addons!.map((a) => a.sheet.key)).toEqual(["addon_cidadao_chapeu_f", "addon_cidadao_mochila_f_back", "addon_cidadao_mochila_f"]);
    expect(f.addons!.map((a) => a.back)).toEqual([false, true, false]);
    expect(f.extraTop).toBe(Math.max(...OUTFITS.cidadao!.addons.map((a) => a.female!.extraTop)));
  });

  it("roupa fechada (sem versão feminina) e sexo ausente: a mesma sheet do masculino", () => {
    expect(outfitLook("cavaleiro", 3, "knight", undefined, "f").sheet).toBe(outfitLook("cavaleiro", 3, "knight").sheet);
    expect(outfitLook("cavaleiro", 3, "knight", undefined, "f").addons!.map((a) => a.sheet.key))
      .toEqual(outfitLook("cavaleiro", 3, "knight", undefined, "m").addons!.map((a) => a.sheet.key));
    // Invocadora: cabeça igual à do Invocador, overlays reaproveitados
    expect(outfitLook("invocador", 3, "sorcerer", undefined, "f").addons!.map((a) => a.sheet.key)).toEqual(["addon_invocador_diadema", "addon_invocador_orbe"]);
    // roupa desconhecida → padrão da vocação, no sexo pedido
    expect(outfitLook("sumiu", 0, "sorcerer", undefined, "f").sheet.key).toBe("outfit_mago_f");
  });

  it("carga do mundo: todas as sheets dos dois sexos, sem chave repetida (as animações saem destas)", () => {
    const keys = ALL_SHEETS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain("outfit_monge_f");
    expect(keys).not.toContain("outfit_cavaleiro_f");
    const addonKeys = ADDON_SHEET_LIST.map((s) => s.key);
    expect(new Set(addonKeys).size).toBe(addonKeys.length);
    expect(addonKeys).toContain("addon_nobre_capa_f_back");
  });
});

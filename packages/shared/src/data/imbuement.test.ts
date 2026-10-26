import { describe, expect, it } from "vitest";
import {
  IMBUEMENTS, IMBUEMENT_EFFECTS, IMBUEMENT_TIERS, IMBUE_DURATION_MS, IMBUE_SPELL_MULT,
  imbuementBonus, imbuementDesc, imbuementMaterials, imbuementName, imbuementPct, imbuementSpellValue, imbuementTier,
} from "./imbuement.ts";
import { itemDef } from "./items.ts";
import { MONSTERS } from "./monsters.ts";

const droppedBy = (itemId: string) => Object.values(MONSTERS).filter((m) => m.loot?.some((l) => l.itemId === itemId));

describe("encantamento: tabela de tiers", () => {
  it("tier I = valores, preço e materiais de antes do ciclo 16 (quem já tinha não perde poder na migração)", () => {
    const t1 = Object.fromEntries(IMBUEMENT_EFFECTS.map((e) => [e, IMBUEMENTS[e].tiers[1]]));
    expect(Object.fromEntries(IMBUEMENT_EFFECTS.map((e) => [e, t1[e]!.value]))).toEqual({ lifesteal: 0.05, manasteal: 0.04, thorns: 0.08, pierce: 0.15, haste: 0.08 });
    expect(Object.fromEntries(IMBUEMENT_EFFECTS.map((e) => [e, t1[e]!.materialId]))).toEqual({ lifesteal: "wolf_fang", manasteal: "spider_eye", thorns: "wolf_pelt", pierce: "iron_bar", haste: "bee_sting" });
    for (const e of IMBUEMENT_EFFECTS) expect(t1[e]).toMatchObject({ tier: 1, goldPrice: 5_000, materialCount: 5, minLevel: 0 });
  });

  it("tier II: lv 60, 30 mil + 5 materiais de monstro comum lv 60–90; tier III: lv 90, 100 mil + 5 Essências Demoníacas", () => {
    for (const e of IMBUEMENT_EFFECTS) {
      const t2 = IMBUEMENTS[e].tiers[2], t3 = IMBUEMENTS[e].tiers[3];
      expect(t2, e).toMatchObject({ tier: 2, goldPrice: 30_000, materialCount: 5, minLevel: 60 });
      expect(t3, e).toMatchObject({ tier: 3, goldPrice: 100_000, materialId: "demonic_essence", materialCount: 5, minLevel: 90 });
      expect(itemDef(t2.materialId)?.kind, `${e}: ${t2.materialId}`).toBe("material");
      // Dá para caçar o material na faixa do tier (não só de chefe).
      expect(droppedBy(t2.materialId).some((m) => !m.boss && m.level >= 60 && m.level <= 90), `${e}: ${t2.materialId}`).toBe(true);
    }
    // Cada efeito pede um material de tier II diferente (o farm se espalha pelas caças).
    expect(new Set(IMBUEMENT_EFFECTS.map((e) => IMBUEMENTS[e].tiers[2].materialId)).size).toBe(IMBUEMENT_EFFECTS.length);
    expect(itemDef("demonic_essence")?.kind).toBe("material");
  });

  it("ciclo 20: só o tier III tem material extra (Rubi, Frasco de Aço Líquido, Cromo Puro); tiers I e II iguais", () => {
    expect(Object.fromEntries(IMBUEMENT_EFFECTS.map((e) => [e, IMBUEMENTS[e].tiers[3].extra]))).toEqual({
      lifesteal: { materialId: "gem_red", count: 2 }, manasteal: { materialId: "gem_red", count: 2 }, thorns: { materialId: "mt_cromo", count: 2 },
      pierce: { materialId: "frasco_aco_liquido", count: 1 }, haste: { materialId: "mt_cromo", count: 2 },
    });
    for (const e of IMBUEMENT_EFFECTS) {
      expect(IMBUEMENTS[e].tiers[1].extra, e).toBeUndefined();
      expect(IMBUEMENTS[e].tiers[2].extra, e).toBeUndefined();
      const x = IMBUEMENTS[e].tiers[3].extra!;
      expect([itemDef(x.materialId)?.kind, itemDef(x.materialId)?.stackable], `${e}: ${x.materialId}`).toEqual(["material", true]);
      expect(droppedBy(x.materialId).some((m) => !m.boss), `${e}: ${x.materialId}`).toBe(true);
      expect(x.materialId, e).not.toBe(IMBUEMENTS[e].tiers[3].materialId);
    }
    expect(imbuementMaterials(IMBUEMENTS.pierce.tiers[3])).toEqual([{ materialId: "demonic_essence", count: 5 }, { materialId: "frasco_aco_liquido", count: 1 }]);
    expect(imbuementMaterials(IMBUEMENTS.pierce.tiers[2])).toEqual([{ materialId: "behemoth_claw", count: 5 }]);
  });

  it("valores sobem a cada tier: II ≈ ×1,5 do I, III até ×2, com teto (Veloz 15%, Perfurante 30%)", () => {
    for (const e of IMBUEMENT_EFFECTS) {
      const [v1, v2, v3] = IMBUEMENT_TIERS.map((t) => IMBUEMENTS[e].tiers[t].value) as [number, number, number];
      expect(v2, e).toBeGreaterThan(v1);
      expect(v3, e).toBeGreaterThan(v2);
      expect(v2 / v1, e).toBeGreaterThanOrEqual(1.4);
      expect(v2 / v1, e).toBeLessThanOrEqual(1.6);
      expect(v3 / v1, e).toBeLessThanOrEqual(2 + 1e-9);
    }
    expect(IMBUEMENTS.haste.tiers[3].value).toBeLessThanOrEqual(0.15);
    expect(IMBUEMENTS.pierce.tiers[3].value).toBeLessThanOrEqual(0.3);
    expect(IMBUEMENTS.lifesteal.tiers[3].value).toBeLessThanOrEqual(0.1);
  });

  it("dura 10 h de combate; em magia drenos e Perfurante valem metade, Veloz e Espinhos não valem", () => {
    expect(IMBUE_DURATION_MS).toBe(10 * 3600_000);
    expect(IMBUE_SPELL_MULT).toBe(0.5);
    expect(imbuementSpellValue(imbuementBonus("lifesteal", 3))).toBeCloseTo(0.05);
    expect(imbuementSpellValue(imbuementBonus("manasteal", 1))).toBeCloseTo(0.02);
    expect(imbuementSpellValue(imbuementBonus("pierce", 2))).toBeCloseTo(0.11);
    expect(imbuementSpellValue(imbuementBonus("haste", 3))).toBe(0);
    expect(imbuementSpellValue(imbuementBonus("thorns", 3))).toBe(0);
    expect(imbuementSpellValue(undefined)).toBe(0);
  });

  it("efeito e tier vindos de fora (mensagem, save) são validados", () => {
    expect(imbuementTier("pierce", 2)).toBe(IMBUEMENTS.pierce.tiers[2]);
    for (const [e, t] of [["pierce", 0], ["pierce", 4], ["pierce", "2"], ["pierce", 1.5], ["nope", 1], ["toString", 1], [undefined, 1], [null, 2]] as const) {
      expect(imbuementTier(e, t), `${String(e)}/${String(t)}`).toBeUndefined();
    }
  });

  it("nome com o tier em romano e texto com o valor do tier", () => {
    expect(imbuementName("lifesteal", 2)).toBe("Dreno de Vida II");
    expect(imbuementName("haste", 3)).toBe("Veloz III");
    expect(imbuementPct(0.08)).toBe("8%");
    expect(imbuementPct(0.075)).toBe("7,5%");
    expect(imbuementDesc("lifesteal", 1)).toBe("5% do dano causado em monstros volta como vida (metade em magia).");
    expect(imbuementDesc("pierce", 3)).toBe("Ignora 30% da armadura do monstro (metade em magia).");
  });
});

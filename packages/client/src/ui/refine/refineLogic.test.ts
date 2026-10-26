import { describe, expect, it } from "vitest";
import { itemDef, type ItemInstance } from "@lemonquest/shared";
import { changeText, refineButton, refineCandidates, refineProgress, refineView } from "./refineLogic.ts";

const mk = (defId: string, refine?: number): ItemInstance =>
  ({ uid: `${defId}${refine ?? 0}`, defId, count: 1, rarity: "common", bonuses: [], ...(refine === undefined ? {} : { refine }) });

describe("aba Refinar: itens listados", () => {
  it("equipados primeiro (ordem dos slots), depois a mochila; só os refináveis", () => {
    const inv = {
      equipment: { armor: mk("mithril_armor"), weapon: mk("fire_sword", 2), ring: mk("ring_dragon") },
      backpack: [mk("steel_blade"), null, mk("mithril_katana", 5), mk("gem_green"), mk("spellbook_archmage")],
    };
    const c = refineCandidates(inv, itemDef);
    expect(c.map((x) => [x.from, x.inst.defId])).toEqual([
      [{ where: "equip", slot: "armor" }, "mithril_armor"],
      [{ where: "equip", slot: "weapon" }, "fire_sword"],
      [{ where: "backpack", index: 2 }, "mithril_katana"],
    ]);
    expect(refineCandidates(null, itemDef)).toEqual([]);
  });
});

describe("aba Refinar: próxima tentativa", () => {
  const cand = (inst: ItemInstance) => refineCandidates({ equipment: {}, backpack: [inst] }, itemDef)[0]!;

  it("custo, gema, chance e atributo antes → depois", () => {
    const v = refineView(cand(mk("mithril_katana", 2)), 100_000, () => 3, itemDef);
    expect(v).toMatchObject({ name: "Katana de Mithril +2", level: 2, maxed: false, why: undefined });
    expect(v.next).toEqual({
      level: 3, gold: 9000, materialId: "gem_green", materialName: "Esmeralda", materialCount: 1, have: 3, successPct: 75,
      changes: [{ stat: "attack", label: "Ataque", before: 76, after: 79 }],
    });
    expect(changeText(v.next!.changes[0]!)).toBe("Ataque 76 → 79");
    expect(refineButton(v)).toBe("Refinar para +3");
    expect(refineProgress(v.level)).toBe("+2/5");
  });

  it("armadura sobe 1; o +1 nunca falha", () => {
    const v = refineView(cand(mk("mithril_armor")), 100_000, () => 1, itemDef);
    expect(v.next).toMatchObject({ level: 1, gold: 3000, successPct: 100, changes: [{ stat: "armor", before: 5, after: 6 }] });
  });

  it("ciclo 20: do +4 em diante (tiers 7–8) mostra o material extra com o que o jogador tem; falta dele desliga o botão", () => {
    const have = (id: string) => (id === "gem_purple" ? 3 : 0);
    const v = refineView(cand(mk("demon_axe", 3)), 100_000, have, itemDef);
    expect(v.next).toMatchObject({
      level: 4, gold: 48000, materialId: "gem_purple", have: 3,
      extra: { materialId: "frasco_aco_liquido", materialName: "Frasco de Aço Líquido", count: 1, have: 0 },
    });
    expect(v.why).toBe("Falta 1x Frasco de Aço Líquido");
    const ok = refineView(cand(mk("demon_axe", 3)), 100_000, () => 1, itemDef);
    expect([ok.why, ok.next!.extra!.have]).toEqual([undefined, 1]);
    // +3 e abaixo, e os tiers 5–6 em qualquer nível: sem extra.
    expect(refineView(cand(mk("demon_axe", 2)), 100_000, () => 1, itemDef).next!.extra).toBeUndefined();
    const t5 = refineView(cand(mk("mithril_katana", 4)), 100_000, (id) => (id === "gem_green" ? 1 : 0), itemDef);
    expect([t5.next!.extra, t5.why]).toEqual([undefined, undefined]);
    expect(refineView(cand(mk("stonecutter_axe", 4)), 1_000_000, () => 0, itemDef).next!.extra).toMatchObject({ materialName: "Cromo Puro" });
  });

  it("motivo do botão desligado: falta gema, falta ouro, refino máximo", () => {
    expect(refineView(cand(mk("demon_axe", 1)), 1_000_000, () => 0, itemDef).why).toBe("Falta 1x Ametista");
    expect(refineView(cand(mk("demon_axe", 1)), 23_999, () => 1, itemDef).why).toBe("Ouro insuficiente");
    const top = refineView(cand(mk("mithril_katana", 5)), 1_000_000, () => 9, itemDef);
    expect([top.maxed, top.next, top.why, refineButton(top)]).toEqual([true, undefined, "Refino máximo", "Refino máximo"]);
  });
});

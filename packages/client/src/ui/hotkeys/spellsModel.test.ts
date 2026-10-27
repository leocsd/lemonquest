import { describe, expect, it } from "vitest";
import type { SpellGroup } from "@lemonquest/shared";
import { itemFor, itemsFor, shownSpell, subtitle } from "./spellsModel.ts";

const G: SpellGroup[] = [
  { id: "fam:my:1", name: "Meu combo", spells: ["fire_wave", "fireball"] }, // lv 35 e lv 1
  { id: "fam:my:2", name: "Vazio", spells: [] },
];

describe("modelo da janela Magias", () => {
  it("item por id: magia, família pronta e grupo do jogador; de outra vocação ou desconhecido = null", () => {
    const fb = itemFor("fireball", "sorcerer", G)!;
    expect(fb).toMatchObject({ kind: "spell", name: "Bola de Fogo", level: 1 });
    expect(fb.spells.map((s) => s.id)).toEqual(["fireball"]);
    const fam = itemFor("fam:sorcerer:target", "sorcerer", G)!;
    expect(fam).toMatchObject({ kind: "family", name: "Ataque no alvo", level: 1 });
    expect(fam.spells.map((s) => s.id)).toEqual(["eternal_flame", "sudden_death", "energy_beam", "fireball"]);
    expect(itemFor("fam:my:1", "sorcerer", G)).toMatchObject({ kind: "group", name: "Meu combo", level: 1 });
    expect(itemFor("fam:my:2", "sorcerer", G)).toMatchObject({ kind: "group", spells: [], level: Infinity });
    expect(itemFor("fam:my:9", "sorcerer", G)).toBeNull();
    expect(itemFor("nope", "sorcerer", G)).toBeNull();
    expect(itemFor("fireball", "knight", G)).toBeNull();
    expect(itemFor("fam:sorcerer:target", "knight", G)).toBeNull();
  });

  it("magia mostrada: a primeira liberada no level; nenhuma liberada = a última (mais fraca); grupo vazio = null", () => {
    const fam = itemFor("fam:sorcerer:target", "sorcerer", G)!;
    expect(shownSpell(fam, 100)!.id).toBe("eternal_flame");
    expect(shownSpell(fam, 20)!.id).toBe("energy_beam");
    expect(shownSpell(fam, 1)!.id).toBe("fireball");
    expect(shownSpell(itemFor("fam:my:1", "sorcerer", G)!, 10)!.id).toBe("fireball");
    expect(shownSpell(itemFor("fam:my:2", "sorcerer", G)!, 100)).toBeNull();
  });

  it("blocos da grade: grupos, famílias e magias por level; legendas", () => {
    const b = itemsFor("sorcerer", G);
    expect(b.groups.map((i) => i.name)).toEqual(["Meu combo", "Vazio"]);
    expect(b.families.map((i) => i.id)).toEqual(["fam:sorcerer:target", "fam:sorcerer:area", "fam:sorcerer:wave"]);
    expect(b.spells).toHaveLength(13);
    const levels = b.spells.map((i) => i.level);
    expect(levels).toEqual([...levels].sort((x, y) => x - y));
    expect(subtitle(b.spells[0]!, 1)).toMatch(/^lv 1 · \d+ mana$/);
    expect(subtitle(b.families[0]!, 50)).toBe("4 magias · lv 1");
    expect(subtitle(b.groups[0]!, 50)).toBe("2 magias · lv 1");
    expect(subtitle(b.groups[1]!, 50)).toBe("vazio");
    expect(itemsFor("knight", []).groups).toEqual([]);
  });
});

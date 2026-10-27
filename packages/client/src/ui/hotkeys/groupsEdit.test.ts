import { describe, expect, it } from "vitest";
import { GROUP_MAX, GROUP_SPELLS_MAX, HOTKEY_MAX, familyDef, keyLabel, type SpellGroup } from "@lemonquest/shared";
import { addSpell, createGroup, deleteGroup, moveSpell, placeGroup, removeSpell, renameGroup, sortStrongest } from "./groupsEdit.ts";

const G: SpellGroup[] = [{ id: "fam:my:1", name: "Fogo", spells: ["fireball", "sudden_death", "energy_beam"] }];

describe("edição dos grupos de magia", () => {
  it("criar vazio ou copiar um modelo (mesma ordem e nome); para no máximo", () => {
    const r = createGroup(G);
    expect(r.groups[1]).toEqual({ id: "fam:my:2", name: "Grupo 2", spells: [] });
    expect(r.select).toBe("fam:my:2");
    const fam = familyDef("fam:sorcerer:target")!;
    const c = createGroup(G, fam);
    expect(c.groups[1]).toMatchObject({ name: fam.name, spells: [...fam.spells] });
    expect(c.message).toMatch(/copiado/);
    const full = Array.from({ length: GROUP_MAX }, (_, i) => ({ id: `fam:my:${i + 1}`, name: "x", spells: [] }));
    expect(createGroup(full)).toMatchObject({ error: true });
    expect(G[0]!.spells).toHaveLength(3); // não muta a original
  });

  it("adicionar na posição, já no grupo muda de lugar, limite de magias", () => {
    expect(addSpell(G, "fam:my:1", "inferno", 1).groups[0]!.spells).toEqual(["fireball", "inferno", "sudden_death", "energy_beam"]);
    expect(addSpell(G, "fam:my:1", "inferno").groups[0]!.spells.at(-1)).toBe("inferno");
    expect(addSpell(G, "fam:my:1", "energy_beam", 0).groups[0]!.spells).toEqual(["energy_beam", "fireball", "sudden_death"]);
    const full: SpellGroup[] = [{ id: "fam:my:1", name: "x", spells: Array.from({ length: GROUP_SPELLS_MAX }, (_, i) => `s${i}`) }];
    expect(addSpell(full, "fam:my:1", "inferno")).toMatchObject({ error: true });
  });

  it("mover, tirar, renomear e excluir", () => {
    expect(moveSpell(G, "fam:my:1", 0, 2)[0]!.spells).toEqual(["sudden_death", "energy_beam", "fireball"]);
    expect(moveSpell(G, "fam:my:1", 2, 0)[0]!.spells).toEqual(["energy_beam", "fireball", "sudden_death"]);
    expect(moveSpell(G, "fam:my:1", 9, 0)).toEqual(G);
    expect(removeSpell(G, "fam:my:1", "sudden_death")[0]!.spells).toEqual(["fireball", "energy_beam"]);
    expect(renameGroup(G, "fam:my:1", "Novo")[0]!.name).toBe("Novo");
    expect(deleteGroup(G, "fam:my:1")).toEqual([]);
  });

  it("pôr na barra: tecla livre; já na barra só avisa; barra cheia é erro", () => {
    const r = placeGroup([{ key: "Digit1", spellId: "fireball" }], "fam:my:1", keyLabel);
    expect(r.list.at(-1)).toEqual({ key: "Digit2", spellId: "fam:my:1" });
    expect(placeGroup(r.list, "fam:my:1", keyLabel).message).toBe("Já está na tecla 2.");
    const full = Array.from({ length: HOTKEY_MAX }, (_, i) => ({ key: `Key${"BCFGTUVXYZNP"[i]}`, spellId: `s${i}` }));
    expect(placeGroup(full, "fam:my:1", keyLabel)).toMatchObject({ error: true });
  });

  it("mais forte primeiro: level decrescente, mana em empate, estável; outros grupos e a original intactos", () => {
    const gs: SpellGroup[] = [
      { id: "fam:my:1", name: "x", spells: ["fireball", "fire_wave", "sudden_death", "energy_beam"] }, // lv 1, 35, 50, 20
      { id: "fam:my:2", name: "y", spells: ["fireball"] },
    ];
    const out = sortStrongest(gs, "fam:my:1");
    expect(out[0]!.spells).toEqual(["sudden_death", "fire_wave", "energy_beam", "fireball"]);
    expect(out[1]!.spells).toEqual(["fireball"]);
    expect(gs[0]!.spells[0]).toBe("fireball");
    // Ids desconhecidos (magia removida numa atualização) contam como level 0 e mantêm a ordem entre si.
    expect(sortStrongest([{ id: "fam:my:1", name: "x", spells: ["zz", "yy", "fireball"] }], "fam:my:1")[0]!.spells).toEqual(["fireball", "zz", "yy"]);
    expect(sortStrongest(gs, "fam:my:9")).toEqual(gs);
    expect(sortStrongest([{ id: "fam:my:1", name: "x", spells: ["fireball", "light_heal"] }], "fam:my:1")[0]!.spells).toEqual(["light_heal", "fireball"]); // mesmo level 1: mana 20 antes de 8
  });
});

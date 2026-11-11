// Consistência das famílias de magia ("tecla inteligente"): toda magia existe, é da vocação, a lista vai da mais
// forte para a mais fraca (prioridade) e nenhuma magia está em duas famílias da mesma vocação.
import { describe, expect, it } from "vitest";
import {
  FAMILY_PREFIX, GROUP_MAX, GROUP_NAME_MAX, SPELL_FAMILIES, castableBy, cleanGroupName, familiesFor, familyDef, familyLevel, familyOf,
  familySpells, isFamilyId, nextGroupId, pickFromFamily, resolveFamily, sanitizeSpellGroups,
} from "./spellFamilies.ts";
import { sanitizeHotkeys } from "../hotkeys.ts";
import { SPELLS, spellDef } from "./spells.ts";
import { VOCATIONS } from "../types.ts";

describe("SPELL_FAMILIES", () => {
  it("ids únicos no formato fam:<vocação>:<papel>, com nome e descrição; toda vocação tem ao menos uma", () => {
    expect(SPELL_FAMILIES.length).toBeGreaterThan(0);
    expect(new Set(SPELL_FAMILIES.map((f) => f.id)).size).toBe(SPELL_FAMILIES.length);
    for (const f of SPELL_FAMILIES) {
      expect(f.id, f.id).toBe(`${FAMILY_PREFIX}${f.vocation}:${f.id.split(":")[2]}`);
      expect(isFamilyId(f.id)).toBe(true);
      expect(VOCATIONS).toContain(f.vocation);
      expect(f.name.trim().length).toBeGreaterThan(0);
      expect(f.desc.trim().length).toBeGreaterThan(0);
      expect(familyDef(f.id)).toBe(f);
    }
    for (const v of VOCATIONS) expect(familiesFor(v).length, v).toBeGreaterThan(0);
    expect(familyDef("fam:knight:nada")).toBeUndefined();
    expect(isFamilyId("fireball")).toBe(false);
  });

  it("toda magia existe em SPELLS, é da vocação da família, sem repetição; a descrição cita cada uma", () => {
    for (const f of SPELL_FAMILIES) {
      expect(f.spells.length, f.id).toBeGreaterThanOrEqual(2);
      expect(new Set(f.spells).size, f.id).toBe(f.spells.length);
      for (const id of f.spells) {
        const s = spellDef(id);
        expect(s, `${f.id}: ${id}`).toBeDefined();
        expect(s!.vocations, `${f.id}: ${id}`).toContain(f.vocation);
        expect(f.desc, `${f.id} não cita ${s!.name}`).toContain(s!.name);
      }
      expect(familySpells(f).map((s) => s.id)).toEqual([...f.spells]);
    }
  });

  it("prioridade = da mais forte (level maior) para a mais fraca, sem empate", () => {
    for (const f of SPELL_FAMILIES) {
      const levels = familySpells(f).map((s) => s.level);
      for (let i = 1; i < levels.length; i++) expect(levels[i]!, `${f.id}: ${f.spells[i]}`).toBeLessThan(levels[i - 1]!);
      expect(familyLevel(f)).toBe(levels[levels.length - 1]);
    }
  });

  it("nenhuma magia em duas famílias da mesma vocação; familyOf é o inverso da lista", () => {
    for (const v of VOCATIONS) {
      const seen = new Map<string, string>();
      for (const f of familiesFor(v)) {
        for (const id of f.spells) {
          expect(seen.get(id), `${id} em ${seen.get(id)} e ${f.id}`).toBeUndefined();
          seen.set(id, f.id);
          expect(familyOf(id, v)).toBe(f);
          for (const other of VOCATIONS) if (other !== v) expect(familyOf(id, other)).toBeUndefined();
        }
      }
      // Magia da vocação fora de qualquer família (cura, buff) é avulsa.
      expect(familyOf("light_heal", v)).toBeUndefined();
    }
    expect(familyOf("nao_existe", "knight")).toBeUndefined();
  });

  it("pickFromFamily respeita level e prontidão; castableBy aceita a família só na vocação dela", () => {
    const f = familyOf("fireball", "sorcerer")!;
    const weakest = familySpells(f).at(-1)!, strongest = familySpells(f)[0]!;
    expect(pickFromFamily(f, weakest.level, () => true)).toBe(weakest);
    expect(pickFromFamily(f, 999, () => true)).toBe(strongest);
    expect(pickFromFamily(f, 999, (s) => s.id !== strongest.id)).toBe(familySpells(f)[1]);
    expect(pickFromFamily(f, 999, () => false)).toBeNull();
    expect(pickFromFamily(f, weakest.level - 1, () => true)).toBeNull();
    expect(castableBy(f.id, "sorcerer")).toBe(true);
    expect(castableBy(f.id, "druid")).toBe(false);
    expect(castableBy("fireball", "sorcerer")).toBe(true);
    expect(castableBy("fireball", "knight")).toBe(false);
    expect(castableBy("fam:sorcerer:nada", "sorcerer")).toBe(false);
    expect(Object.keys(SPELLS)).toContain("fireball");
  });
});

describe("grupos de magia do jogador", () => {
  it("limpeza: id na faixa e sem repetir, nome limpo, só magias da vocação, sem repetir, até o máximo", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ id: `fam:my:${i + 1}`, name: `g${i}`, spells: [] }));
    expect(sanitizeSpellGroups(many, "sorcerer")).toHaveLength(GROUP_MAX);
    const g = sanitizeSpellGroups([
      { id: "fam:my:2", name: "\u0007  Fogo\n total  ", spells: ["fireball", "ice_shard", "fireball", "fam:sorcerer:area", 3] },
      { id: "fam:my:2", name: "dup", spells: [] },
      { id: "fam:sorcerer:target", name: "pronta", spells: [] },
      { id: "fam:my:0", name: "zero", spells: [] },
      { id: "fam:my:3", name: "   ", spells: "x" },
      null,
    ], "sorcerer");
    expect(g).toEqual([
      { id: "fam:my:2", name: "Fogo total", spells: ["fireball"] },
      { id: "fam:my:3", name: "Grupo 3", spells: [] },
    ]);
    expect(sanitizeSpellGroups("lixo", "sorcerer")).toEqual([]);
    expect(cleanGroupName("a".repeat(40), 1)).toHaveLength(GROUP_NAME_MAX);
  });

  it("vira família: mesma escolha da tecla inteligente, na ordem do jogador", () => {
    const g = { id: "fam:my:1", name: "Meu", spells: ["fireball", "sudden_death"] };
    const f = resolveFamily("fam:my:1", [g], "sorcerer")!;
    expect(f.name).toBe("Meu");
    // A ordem do jogador manda: Bola de Fogo antes de Morte Súbita, mesmo sendo mais fraca.
    expect(pickFromFamily(f, 200, () => true)!.id).toBe("fireball");
    expect(pickFromFamily(f, 200, (s) => s.id !== "fireball")!.id).toBe("sudden_death");
    expect(resolveFamily("fam:my:2", [g], "sorcerer")).toBeUndefined();
    expect(resolveFamily("fam:sorcerer:target", [], "sorcerer")?.name).toBe("Ataque no alvo");
    expect(nextGroupId([g])).toBe("fam:my:2");
  });

  it("atalho de grupo só vale se o grupo existe", () => {
    const g = [{ id: "fam:my:1", name: "Meu", spells: [] }];
    const list = [{ key: "Digit1", spellId: "fam:my:1" }, { key: "Digit2", spellId: "fam:my:2" }];
    expect(sanitizeHotkeys(list, "sorcerer", g)).toEqual([{ key: "Digit1", spellId: "fam:my:1" }]);
    expect(sanitizeHotkeys(list, "sorcerer")).toEqual([]);
  });
});

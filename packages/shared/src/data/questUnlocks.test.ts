import { describe, expect, it } from "vitest";
import { npcDef } from "./npcs.ts";
import { QUESTS, QUEST_LIST, questAvailable, type QuestDef } from "./quests.ts";
import {
  availableQuests, nextQuestsAfter, questEffectiveLevel, questLockReason, questRef, unlocksBetween, upcomingQuests,
} from "./questUnlocks.ts";

const ids = (l: readonly { id: string }[]) => l.map((d) => d.id);
const captain = npcDef("guard_captain")!.name;

describe("questLockReason", () => {
  it("diz o level e as missões que faltam, com quem dá cada uma; sem trava = null", () => {
    expect(questLockReason(QUESTS.rats_barn!, { level: 1, done: [] })).toBeNull();
    expect(questLockReason(QUESTS.forest_wolves!, { level: 3, done: [] }))
      .toBe(`Requer level 6 e concluir “Ratos no Celeiro” (${captain}).`);
    expect(questLockReason(QUESTS.forest_wolves!, { level: 10, done: [] })).toBe(`Requer concluir “Ratos no Celeiro” (${captain}).`);
    expect(questLockReason(QUESTS.forest_wolves!, { level: 3, done: ["rats_barn"] })).toBe("Requer level 6.");
    expect(questLockReason(QUESTS.forest_wolves!, { level: 6, done: ["rats_barn"] })).toBeNull();
    const priest = npcDef("frontier_priest")!.name;
    expect(questLockReason(QUESTS.orshabaal_hunt!, { level: 110, done: [] }))
      .toBe(`Requer concluir “Os Portões do Abismo” (${priest}) e “O Selo do Abismo” (${priest}).`);
    expect(questLockReason(QUESTS.orshabaal_hunt!, { level: 110, done: ["abyss_gates"] })).toBe(`Requer concluir “O Selo do Abismo” (${priest}).`);
  });

  it("mesma regra do servidor (questAvailable) para todo o catálogo", () => {
    const ctxs = [
      { level: 1, done: [] as string[] }, { level: 30, done: ["rats_barn", "chegou", "forest_wolves"] },
      { level: 200, done: [] as string[] }, { level: 60, done: QUEST_LIST.filter((_, i) => i % 2 === 0).map((d) => d.id) },
    ];
    for (const ctx of ctxs) for (const d of QUEST_LIST) {
      // A própria missão concluída não é trava (é estado): só os pré-requisitos contam.
      const ok = questAvailable(d, ctx.level, () => false, (id) => id !== d.id && ctx.done.includes(id));
      expect(questLockReason(d, ctx) === null, `${d.id} lv ${ctx.level}`).toBe(ok);
    }
  });

  it("questRef: nome da missão entre aspas e quem a dá", () => {
    expect(questRef(QUESTS.chegou!)).toBe(`“Chegou!” (${npcDef("juliao")!.name})`);
  });
});

describe("questEffectiveLevel", () => {
  it("é o maior level mínimo da corrente de pré-requisitos", () => {
    expect(questEffectiveLevel(QUESTS.rats_barn!)).toBe(1);
    expect(questEffectiveLevel(QUESTS.frames_descartados!)).toBe(22);
    const fake: QuestDef = { ...QUESTS.rats_barn!, id: "fake", minLevel: 1, requires: ["goblin_king"] };
    expect(questEffectiveLevel(fake)).toBe(35);
    // Toda missão do catálogo abre em algum level jogável.
    for (const d of QUEST_LIST) expect(questEffectiveLevel(d), d.id).toBeLessThanOrEqual(130);
  });
});

describe("Disponíveis e Em breve (diário)", () => {
  it("disponíveis: sem trava, nem ativas nem concluídas", () => {
    expect(ids(availableQuests({ level: 1, done: [] }))).toEqual(["rats_barn"]);
    const lv5 = ids(availableQuests({ level: 5, done: [], active: ["rats_barn"] }));
    expect(lv5).toEqual(expect.arrayContaining(["slime_salve", "pesquisa_de_clima", "bee_hunt", "chegou"]));
    expect(lv5).not.toContain("rats_barn");
    expect(lv5).not.toContain("forest_wolves");
    expect(ids(availableQuests({ level: 6, done: ["rats_barn"] }))).toContain("forest_wolves");
    expect(ids(availableQuests({ level: 6, done: ["rats_barn"] }))).not.toContain("rats_barn");
  });

  it("em breve: travadas, da que abre mais cedo para a mais tarde, com o que falta", () => {
    const lv1 = upcomingQuests({ level: 1, done: [] });
    expect(ids(lv1.map((e) => e.def))).toEqual(["slime_salve", "pesquisa_de_clima", "bee_hunt", "chegou", "forest_wolves"]);
    expect(lv1[0]!.reason).toBe("Requer level 2.");
    // No level, esperando outra missão: vêm primeiro.
    const lv12 = upcomingQuests({ level: 12, done: [] }, 4);
    expect(ids(lv12.map((e) => e.def))).toEqual(["forest_wolves", "git_caiu", "swamp_report", "bombonas_fugitivas"]);
    expect(lv12[1]!.reason).toBe(`Requer concluir ${questRef(QUESTS.chegou!)}.`);
    // Ativa ou concluída não entra; limite 0 = nada.
    expect(ids(upcomingQuests({ level: 1, done: [], active: ["slime_salve"] }).map((e) => e.def))).not.toContain("slime_salve");
    expect(upcomingQuests({ level: 1, done: [] }, 0)).toEqual([]);
  });
});

describe("nextQuestsAfter", () => {
  it("missões que pedem esta como pré-requisito", () => {
    expect(ids(nextQuestsAfter("chegou"))).toEqual(["git_caiu", "bombonas_fugitivas"]);
    expect(ids(nextQuestsAfter("hellhounds"))).toEqual(["marcha_dos_colossos", "ferumbras_end"]);
    expect(nextQuestsAfter("locomotiva_fantasma")).toEqual([]);
    expect(nextQuestsAfter("nao_existe")).toEqual([]);
  });
});

describe("unlocksBetween (banner de level)", () => {
  it("missões com level mínimo no intervalo (old, new]", () => {
    expect(ids(unlocksBetween(4, 6).quests)).toEqual(["forest_wolves", "chegou"]); // ordem do catálogo
    expect(unlocksBetween(4, 6).places).toEqual([]);
    expect(ids(unlocksBetween(5, 6).quests)).toEqual(["forest_wolves"]);
  });

  it("portas com minLevel (sem repetir o destino) e quests de baú, por level", () => {
    const portals = [
      { label: "Caverna dos Heróis · lv 65", minLevel: 65 }, { label: "Caverna dos Heróis · lv 65", minLevel: 65 },
      { label: "Vila", minLevel: undefined }, { label: "Cidadela · lv 100", minLevel: 100 },
    ];
    const u = unlocksBetween(64, 65, portals);
    expect(ids(u.quests)).toEqual(["black_fort", "heroes_rest"]);
    expect(u.places).toEqual([
      { label: "Caverna dos Heróis · lv 65", minLevel: 65, kind: "portal" },
      { label: "A Quest dos Heróis (Caverna dos Heróis)", minLevel: 65, kind: "chest" },
    ]);
    // Vários levels de uma vez (subiu dois): ordem pelo level.
    expect(unlocksBetween(99, 100, portals).places.map((p) => p.label)).toEqual(["Cidadela · lv 100", "A Aniquilação (Cidadela de Ferumbras)"]);
    // Nada novo quando o level não sobe (ou cai, na morte).
    expect(unlocksBetween(65, 65, portals)).toEqual({ quests: [], places: [] });
    expect(unlocksBetween(65, 64, portals)).toEqual({ quests: [], places: [] });
  });
});

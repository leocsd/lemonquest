import { describe, expect, it } from "vitest";
import { ELITE_COLOR, MONSTERS, QUEST_CHESTS } from "@lemonquest/shared";
import { chestClass, chestLookLines } from "./chestInfo.ts";
import { levelColor } from "./creatures.ts";
import { lookCreature, lookNpc, lookPlayer, lookQuestObject, packFamilyLabel } from "./lookInfo.ts";

describe("classe dos baús de quest", () => {
  it("baús de arma da escolha mostram a vocação; anel/amuleto/ouro mostram Todas", () => {
    expect(chestClass("hero_sword").label).toBe("Cavaleiro");
    expect(chestClass("hero_bow").label).toBe("Paladino");
    expect(chestClass("frost_ring").label).toBe("Todas");
    // Aniquilação (ciclo 16): um baú por vocação; o urso que vai junto não tem vocação e não muda a classe.
    expect(chestClass("anni_bear").label).toBe("Druida");
    expect(chestClass("anni_armor").label).toBe("Cavaleiro");
    for (const id of Object.keys(QUEST_CHESTS)) expect(chestClass(id).label.length, id).toBeGreaterThan(0);
  });

  it("olhar um baú: quest, level, itens com a classe e ouro", () => {
    const c = chestLookLines("volcano_summit");
    expect(c.lines[0]).toMatch(/O Cume do Vulcão · requer level 80/);
    expect(c.lines.some((l) => /ouro/.test(l))).toBe(true);
    expect(lookQuestObject("chest", "hero_sword").lines.at(-1)).toBe("Classe: Cavaleiro");
    expect(lookQuestObject("lever", "annihilator").lines[0]).toMatch(/2 a 4 aventureiros de level 100/);
    expect(lookQuestObject("lever", "annihilator").lines[1]).toMatch(/placa ao lado da alavanca/);
  });
});

describe("olhar criaturas, jogadores e NPCs", () => {
  it("criatura: level, dificuldade, vida, ataque, habilidades e XP", () => {
    const c = lookCreature({ defId: "dragon", name: "Dragão", level: 70, boss: false, hp: 1000, maxHp: 2000 }, 60);
    expect(c.title).toBe("Dragão");
    expect(c.lines).toEqual(expect.arrayContaining([
      "Level 70 · perigosa", "Vida 1.000/2.000 (50%)", expect.stringMatching(/^Ataque: /), "Habilidades: Sopro de Fogo", "XP: 3.500",
    ]));
    expect(lookCreature({ defId: "demodras", name: "Demodras", level: 80, boss: true, hp: 1, maxHp: 1 }, 80).title).toBe("☠ Demodras");
    // Dano real: dados 70–140 × 1,6 (lv 70+, ciclo 8).
    expect(c.lines).toContain("Ataque: à distância (3 sqm), fogo, 112–224");
  });

  it("elite: ★ antes do nome, cor da dificuldade (não o dourado), marca ELITE, dano ×1,3 e XP ×3", () => {
    const c = lookCreature({ defId: "dragon", name: "Elite Dragão", level: 70, boss: false, hp: 5000, maxHp: 5000, elite: true }, 60);
    expect(c.title).toBe("★ Elite Dragão");
    expect(c.color).toBe(levelColor(70, 60, false));
    expect(c.color).not.toBe(ELITE_COLOR);
    expect(c.lines).toEqual(expect.arrayContaining(["Level 70 · perigosa · ELITE", "Ataque: à distância (3 sqm), fogo, 146–291", "XP: 10.500"]));
    // Chefe elite: os dois glifos, caveira primeiro.
    expect(lookCreature({ defId: "demodras", name: "Elite Demodras", level: 80, boss: true, hp: 1, maxHp: 1, elite: true }, 80).title).toBe("☠ ★ Elite Demodras");
  });

  it("monstro de bando avisa que chama o bando, com a família em português; quem foge avisa o limite", () => {
    const orc = lookCreature({ defId: "orc_warrior", name: "Orc", level: 42, boss: false, hp: 1, maxHp: 1 }, 42).lines;
    expect(orc).toContain("Chama o bando quando atacado (família: orcs)");
    expect(orc.some((l) => /^Foge/.test(l))).toBe(false);
    const goblin = lookCreature({ defId: "goblin", name: "Goblin", level: 10, boss: false, hp: 1, maxHp: 1 }, 10).lines;
    expect(goblin).toContain("Chama o bando quando atacado (família: goblins)");
    expect(goblin).toContain("Foge com pouca vida (abaixo de 20%)");
    // Rato foge mas não tem bando; dragão nem um nem outro.
    const rat = lookCreature({ defId: "rat", name: "Rato", level: 1, boss: false, hp: 1, maxHp: 1 }, 1).lines;
    expect(rat).toContain("Foge com pouca vida (abaixo de 15%)");
    expect(rat.some((l) => /bando/.test(l))).toBe(false);
    const dragon = lookCreature({ defId: "dragon", name: "Dragão", level: 70, boss: false, hp: 1, maxHp: 1 }, 70).lines;
    expect(dragon.some((l) => /bando|Foge/.test(l))).toBe(false);
    // Toda família do catálogo tem rótulo em português (família nova sem rótulo mostraria o id em inglês).
    for (const def of Object.values(MONSTERS)) if (def.pack) expect(packFamilyLabel(def.pack.family), def.pack.family).not.toBe(def.pack.family);
  });

  it("jogador: level e vocação, título, caveira, grupo; você", () => {
    const p = lookPlayer({ name: "Ana", level: 42, vocation: "druid", title: "gladiador", skull: "white" }, { me: false, party: true });
    expect(p.lines).toEqual(["Level 42 · Druida", "Título: o Gladiador", "Caveira branca", "Do seu grupo"]);
    expect(lookPlayer({ name: "Eu", level: 1, vocation: "knight" }, { me: true, party: false }).title).toBe("Eu (você)");
  });

  it("NPC: nome e papel; desconhecido não mostra nada", () => {
    expect(lookNpc("nao_existe")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import type { ItemInstance } from "@lemonquest/shared";
import { depotMatches, foldText } from "./depotSearch.ts";

const it_ = (defId: string, rarity: ItemInstance["rarity"] = "common", refine?: number): ItemInstance => ({ uid: defId, defId, count: 1, rarity, bonuses: [], ...(refine ? { refine } : {}) });
const NAMES: Record<string, string> = { health_potion: "Poção de Vida", mana_potion: "Poção de Mana", katana: "Katana", bone: "Osso" };
const nameOf = (i: ItemInstance) => `${NAMES[i.defId]}${i.refine ? ` +${i.refine}` : ""} ${i.rarity === "rare" ? "Raro" : "Comum"}`;
const DEPOT = [it_("health_potion"), null, it_("katana", "rare", 3), it_("mana_potion"), undefined, it_("bone")];

describe("busca no depot", () => {
  it("sem acento nem maiúsculas; todas as palavras precisam aparecer", () => {
    expect(foldText("  Poção ")).toBe("pocao");
    expect(depotMatches(DEPOT, "pocao", nameOf)).toEqual([0, 3]);
    expect(depotMatches(DEPOT, "POÇÃO mana", nameOf)).toEqual([3]);
    expect(depotMatches(DEPOT, "raro", nameOf)).toEqual([2]);
    expect(depotMatches(DEPOT, "+3", nameOf)).toEqual([2]);
    expect(depotMatches(DEPOT, "dragão", nameOf)).toEqual([]);
  });

  it("busca vazia mostra tudo (null), inclusive os espaços vazios", () => {
    expect(depotMatches(DEPOT, "", nameOf)).toBeNull();
    expect(depotMatches(DEPOT, "   ", nameOf)).toBeNull();
  });
});

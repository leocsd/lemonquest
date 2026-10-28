import { describe, expect, it } from "vitest";
import type { ItemDef } from "@lemonquest/shared";
import { cheaperThan, searchItems, takenCount, withSkipped } from "./lootFilterLogic.ts";

const icon = { url: "x.png" };
const items: ItemDef[] = [
  { id: "osso", name: "Osso", kind: "material", value: 10, icon },
  { id: "pocao", name: "Poção de Vida", kind: "potion", value: 40, icon },
  { id: "espada", name: "Espada Rúnica", kind: "weapon", slot: "weapon", value: 3000, icon },
];

describe("lootFilterLogic", () => {
  it("busca sem acento e sem caixa", () => {
    expect(searchItems(items, "pocao").map((d) => d.id)).toEqual(["pocao"]);
    expect(searchItems(items, "RÚN").map((d) => d.id)).toEqual(["espada"]);
    expect(searchItems(items, "  ")).toHaveLength(3);
  });
  it("tirar e devolver ids sem repetir, mantendo a ordem", () => {
    expect(withSkipped([], ["osso", "pocao"], true)).toEqual(["osso", "pocao"]);
    expect(withSkipped(["osso"], ["osso", "espada"], true)).toEqual(["osso", "espada"]);
    expect(withSkipped(["osso", "pocao"], ["osso"], false)).toEqual(["pocao"]);
  });
  it("conta o que entra e lista o que vale menos", () => {
    expect(takenCount(items, ["osso"])).toBe(2);
    expect(cheaperThan(items, 50)).toEqual(["osso", "pocao"]);
    expect(cheaperThan(items, 10)).toEqual([]);
  });
});

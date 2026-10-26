/// <reference types="node" />
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CollisionGrid, QUEST_CHESTS, TILE_SIZE, findQuestObjects, type QuestObjectSpot, type TiledMap } from "@lemonquest/shared";
import { chestClass, chestLookLines } from "./chestInfo.ts";
import { DRAWN_CHEST_SHEET, drawnChestAnchor, drawnChestSpots } from "./drawnChests.ts";

const root = fileURLToPath(new URL("../../../../", import.meta.url));

describe("baús desenhados dos covis (ciclo 16)", () => {
  it("só os baús com `drawn` são desenhados; alavancas e baús de tile ficam com o mapa", () => {
    const spots: QuestObjectSpot[] = [
      { kind: "chest", id: "pirate_saber", x: 1, y: 1 }, { kind: "lever", id: "annihilator", x: 2, y: 2 },
      { kind: "chest", id: "lair_minas_furia", x: 3, y: 3, drawn: true },
    ];
    expect(drawnChestSpots(spots).map((s) => s.id)).toEqual(["lair_minas_furia"]);
  });

  it("o baú (16x14) assenta no chão do tile, centrado", () => {
    expect(drawnChestAnchor({ x: 99, y: 539 })).toEqual({ x: 99.5 * TILE_SIZE, y: 540 * TILE_SIZE - 1 });
    const png = readFileSync(root + "assets/" + DRAWN_CHEST_SHEET.url);
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([2 * DRAWN_CHEST_SHEET.frameWidth, DRAWN_CHEST_SHEET.frameHeight]);
  });

  it("no mapa: os 12 baús dos covis são desenhados, bloqueiam o tile e mostram a classe e o chefe que destranca no \"olhar\"", () => {
    const map = JSON.parse(readFileSync(root + "assets/maps/world.json", "utf8")) as TiledMap;
    const grid = CollisionGrid.fromTiled(map);
    const drawn = drawnChestSpots(findQuestObjects(map));
    expect(drawn.map((s) => s.id).sort()).toEqual(Object.values(QUEST_CHESTS).filter((c) => c.group.startsWith("lair_")).map((c) => c.id).sort());
    for (const s of drawn) expect(grid.isWalkable(s.x, s.y), s.id).toBe(false);
    expect(chestClass("lair_catacumbas_knight").label).toBe("Cavaleiro");
    expect(chestClass("lair_catacumbas_mage").label).toBe("Feiticeiro / Druida");
    expect(chestClass("lair_profundo_amulet").label).toBe("Todas");
    const look = chestLookLines("lair_minas_furia").lines;
    expect(look[0]).toBe("Quest: O Covil do Rei Toupeira · requer level 25");
    expect(look[1]).toBe("Trancado: derrote o chefe do covil (Rei Toupeira) para abrir");
    expect(chestLookLines("pirate_saber").lines.some((l) => l.startsWith("Trancado"))).toBe(false);
  });
});

// Baús de quest sem tile no mapa (objeto "quest_chest" com `drawn`, covis do ciclo 16): um tile novo alteraria o mapa
// já em produção, então o cliente desenha o baú grande do pack no tile do objeto. Clique, "olhar" e rótulo de classe
// seguem por QuestObjectIndex/ChestLabels como os baús de tile; o bloqueio do tile vem da CollisionGrid (shared/map.ts).
import type Phaser from "phaser";
import { TILE_SIZE, type QuestObjectSpot } from "@lemonquest/shared";

/** BigTreasureChest.png: 32x14, dois quadros de 16x14 (0 fechado, 1 com a tampa aberta). */
export const DRAWN_CHEST_SHEET = { key: "quest-chest-big", url: "ninja/Items/Treasure/BigTreasureChest.png", frameWidth: 16, frameHeight: 14 } as const;
export const DRAWN_CHEST_FRAME = 0;
/** Acima das camadas de chão do mapa (negativas) e abaixo do realce do mouse (5), do alvo (6) e dos atores (>= 26). */
const DEPTH = 4;

/** Só os baús desenhados (os de tile já vêm no mapa). */
export function drawnChestSpots(spots: readonly QuestObjectSpot[]): QuestObjectSpot[] {
  return spots.filter((s) => s.kind === "chest" && s.drawn);
}

/** Ponto de desenho em px do mundo, com origem no meio da base: o baú (14 px de altura) assenta no chão do tile. */
export function drawnChestAnchor(s: Pick<QuestObjectSpot, "x" | "y">): { x: number; y: number } {
  return { x: (s.x + 0.5) * TILE_SIZE, y: (s.y + 1) * TILE_SIZE - 1 };
}

export function preloadDrawnChests(scene: Phaser.Scene): void {
  const s = DRAWN_CHEST_SHEET;
  scene.load.spritesheet(s.key, `${import.meta.env.BASE_URL}${s.url}`, { frameWidth: s.frameWidth, frameHeight: s.frameHeight });
}

/** Desenha os baús `drawn` na camada do mundo. Sem a textura (falha de carga), o baú segue clicável, só não aparece. */
export function drawDrawnChests(scene: Phaser.Scene, layer: Phaser.GameObjects.Layer, spots: readonly QuestObjectSpot[]): void {
  if (!scene.textures.exists(DRAWN_CHEST_SHEET.key)) return;
  for (const s of drawnChestSpots(spots)) {
    const a = drawnChestAnchor(s);
    layer.add(scene.add.image(a.x, a.y, DRAWN_CHEST_SHEET.key, DRAWN_CHEST_FRAME).setOrigin(0.5, 1).setDepth(DEPTH));
  }
}

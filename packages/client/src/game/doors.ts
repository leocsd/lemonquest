// Portas de sala (ciclo 22; regras em shared/data/doors.ts e server/systems/doors.ts). Desenho no tile da porta com os
// quadros do TilesetHouse que o mapa já carrega (nenhuma arte nova): porta de madeira em arco (fechada 8,3 / aberta 9,3)
// e grade de ferro (1,3; aberta = sem desenho, a passagem fica livre). Porta comum: aberta pelo estado do servidor
// (S2C.Doors), que também libera o tile na CollisionGrid da predição. Porta de level/missão: aberta enquanto há alguém
// nela (o servidor a mantém parede; quem cumpre o requisito entra pelo "usar").
import type Phaser from "phaser";
import { TILE_SIZE, type CollisionGrid, type DoorSpot, type DoorsMsg } from "@lemonquest/shared";
import { tilesetTexKey } from "./worldMap.ts";

/** Coluna/linha (16 px) no TilesetHouse. null = não desenha. */
export const DOOR_FRAMES: Record<DoorSpot["style"], { closed: [number, number]; open: [number, number] | null }> = {
  arco: { closed: [8, 3], open: [9, 3] },
  grade: { closed: [1, 3], open: null },
};
/** Acima do chão (camadas negativas) e dos portais (3), junto dos baús desenhados (4), abaixo do realce (5) e dos atores. */
const DEPTH = 4;
const TEX = tilesetTexKey("TilesetHouse");
const frameName = (c: number, r: number) => `door-${c}-${r}`;

/** A porta está aberta? Comum: pelo estado do servidor; de level/missão: alguém em cima. */
export function doorIsOpen(d: Pick<DoorSpot, "id" | "req" | "x" | "y">, open: ReadonlySet<string>, occupied: (x: number, y: number) => boolean): boolean {
  return d.req ? occupied(d.x, d.y) : open.has(d.id);
}

export class DoorSprites {
  private readonly items: { d: DoorSpot; img: Phaser.GameObjects.Image | null; shown: boolean | null }[] = [];
  private open = new Set<string>();

  constructor(scene: Phaser.Scene, layer: Phaser.GameObjects.Layer, readonly doors: readonly DoorSpot[], private readonly grid: CollisionGrid) {
    const tex = scene.textures.exists(TEX) ? scene.textures.get(TEX) : null;
    for (const f of Object.values(DOOR_FRAMES).flatMap((v) => [v.closed, v.open])) {
      if (tex && f && !tex.has(frameName(f[0], f[1]))) tex.add(frameName(f[0], f[1]), 0, f[0] * TILE_SIZE, f[1] * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    }
    for (const d of doors) {
      // Sem a textura (falha de carga), a porta segue clicável e bloqueando, só não aparece.
      const [c, r] = DOOR_FRAMES[d.style].closed;
      const img = tex ? scene.add.image(d.x * TILE_SIZE, d.y * TILE_SIZE, TEX, frameName(c, r)).setOrigin(0, 0).setDepth(DEPTH) : null;
      if (img) layer.add(img);
      this.items.push({ d, img, shown: null });
    }
  }

  /** Estado das portas comuns (S2C.Doors): desenho e colisão da predição. */
  apply(m: DoorsMsg): void {
    this.open = new Set(Array.isArray(m?.open) ? m.open.map(String) : []);
    for (const it of this.items) if (!it.d.req) this.grid.setWalkable(it.d.x, it.d.y, this.open.has(it.d.id));
  }

  isOpen(id: string): boolean { return this.open.has(id); }

  /** A cada quadro: troca o quadro de quem mudou. */
  update(occupied: (x: number, y: number) => boolean): void {
    for (const it of this.items) {
      const open = doorIsOpen(it.d, this.open, occupied);
      if (open === it.shown) continue;
      it.shown = open;
      if (!it.img) continue;
      const f = open ? DOOR_FRAMES[it.d.style].open : DOOR_FRAMES[it.d.style].closed;
      it.img.setVisible(!!f);
      if (f) it.img.setFrame(frameName(f[0], f[1]));
    }
  }

  /** Estado visível (testes E2E). */
  shown(): { id: string; x: number; y: number; open: boolean }[] {
    return this.items.map((it) => ({ id: it.d.id, x: it.d.x, y: it.d.y, open: !!it.shown }));
  }
}

// Portas de sala (ciclo 22; regras em shared/data/doors.ts e server/systems/doors.ts). A arte é a do próprio lugar
// (tools/mapgen/doors22.mjs): fechadura da caverna, folha do portão de correr, cancela, painel da fábrica. O mapa já vem
// com a porta fechada; aqui só se trocam os tiles da camada (`DoorSpot.art`: gid fechada ↔ gid aberta, 0 = vazio).
// Porta comum: aberta pelo estado do servidor (S2C.Doors), que também libera o tile na CollisionGrid da predição.
// Porta de level/missão: aberta enquanto há alguém nela (o servidor a mantém parede; quem cumpre o requisito entra pelo
// "usar").
import type Phaser from "phaser";
import type { CollisionGrid, DoorSpot, DoorsMsg } from "@lemonquest/shared";

/** A porta está aberta? Comum: pelo estado do servidor; de level/missão: alguém em cima. */
export function doorIsOpen(d: Pick<DoorSpot, "id" | "req" | "x" | "y">, open: ReadonlySet<string>, occupied: (x: number, y: number) => boolean): boolean {
  return d.req ? occupied(d.x, d.y) : open.has(d.id);
}

/** Os tiles a pôr para a porta no estado dado (gid 0 = tirar o tile). */
export function doorTiles(d: Pick<DoorSpot, "x" | "y" | "art">, open: boolean): { layer: string; x: number; y: number; gid: number }[] {
  return d.art.map((a) => ({ layer: a.layer, x: d.x + a.dx, y: d.y + a.dy, gid: open ? a.open : a.closed }));
}

export class DoorSprites {
  private readonly items: { d: DoorSpot; shown: boolean | null }[] = [];
  private open = new Set<string>();

  constructor(private readonly tilemap: Phaser.Tilemaps.Tilemap, readonly doors: readonly DoorSpot[], private readonly grid: CollisionGrid) {
    for (const d of doors) this.items.push({ d, shown: null });
  }

  /** Estado das portas comuns (S2C.Doors): desenho e colisão da predição. */
  apply(m: DoorsMsg): void {
    this.open = new Set(Array.isArray(m?.open) ? m.open.map(String) : []);
    for (const it of this.items) if (!it.d.req) this.grid.setWalkable(it.d.x, it.d.y, this.open.has(it.d.id));
  }

  isOpen(id: string): boolean { return this.open.has(id); }

  /** A cada quadro: troca os tiles de quem mudou. */
  update(occupied: (x: number, y: number) => boolean): void {
    for (const it of this.items) {
      const open = doorIsOpen(it.d, this.open, occupied);
      if (open === it.shown) continue;
      it.shown = open;
      for (const t of doorTiles(it.d, open)) {
        // Camada que não existe (ou falha de carga): a porta segue clicável e bloqueando, só não muda o desenho.
        const layer = this.tilemap.getLayer(t.layer)?.tilemapLayer;
        if (!layer) continue;
        if (t.gid) layer.putTileAt(t.gid, t.x, t.y);
        else layer.removeTileAt(t.x, t.y);
      }
    }
  }

  /** Estado visível (testes E2E). */
  shown(): { id: string; x: number; y: number; open: boolean }[] {
    return this.items.map((it) => ({ id: it.d.id, x: it.d.x, y: it.d.y, open: !!it.shown }));
  }
}

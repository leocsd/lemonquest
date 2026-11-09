// Utilitários de tiles do mundo: alcançabilidade a partir do spawn, validação da posição salva e tile livre mais próximo.
import { canStepTerrain, type CollisionGrid } from "@lemonquest/shared";

export interface Pt { x: number; y: number }

const STEPS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/**
 * Bitmap (1 byte/tile) dos tiles alcançáveis a pé a partir de `start` (um ou vários pontos: o templo e as chegadas das
 * viagens de NPC), incluindo saltos por portal (`portalDest(x,y)` devolve o destino se (x,y) for um portal). Calculado
 * uma vez no onCreate.
 */
export function reachableFrom(grid: Pick<CollisionGrid, "width" | "height" | "isWalkable">, start: Pt | readonly Pt[], portalDest: (x: number, y: number) => Pt | undefined): Uint8Array {
  const W = grid.width, H = grid.height;
  const seen = new Uint8Array(W * H);
  const queue = new Int32Array(W * H);
  let head = 0, tail = 0;
  const push = (x: number, y: number) => {
    if (!grid.isWalkable(x, y)) return;
    const i = y * W + x;
    if (seen[i]) return;
    seen[i] = 1;
    queue[tail++] = i;
  };
  for (const s of Array.isArray(start) ? start : [start]) push(s.x, s.y);
  while (head < tail) {
    const i = queue[head++]!;
    const x = i % W, y = (i - x) / W;
    const d = portalDest(x, y);
    if (d && d.x >= 0 && d.y >= 0 && d.x < W && d.y < H) push(d.x, d.y);
    for (const [dx, dy] of STEPS) if (canStepTerrain(grid, x, y, dx, dy)) push(x + dx, y + dy);
  }
  return seen;
}

export interface StartCheck {
  grid: CollisionGrid;
  reachable: Uint8Array;
  isPortal: (x: number, y: number) => boolean;
  isNpc: (x: number, y: number) => boolean;
  isMonster: (x: number, y: number) => boolean;
}

/** Posição salva vale como ponto de entrada? (andável, alcançável do spawn, sem portal/NPC/monstro). */
export function isValidStart(x: number | null | undefined, y: number | null | undefined, c: StartCheck): boolean {
  if (x == null || y == null || !Number.isInteger(x) || !Number.isInteger(y)) return false;
  if (!c.grid.isWalkable(x, y)) return false;
  if (!c.reachable[y * c.grid.width + x]) return false;
  return !c.isPortal(x, y) && !c.isNpc(x, y) && !c.isMonster(x, y);
}

/** Tile livre mais próximo de (x,y) (anéis Chebyshev até `maxR`), ou null. (x,y) mesmo vem primeiro. */
export function nearestFreeTile(x: number, y: number, isFree: (x: number, y: number) => boolean, maxR = 4): Pt | null {
  if (isFree(x, y)) return { x, y };
  for (let r = 1; r <= maxR; r++) {
    let best: Pt | null = null, bestD = Infinity;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const d = dx * dx + dy * dy; // ortogonais antes das diagonais
        if (d < bestD && isFree(x + dx, y + dy)) { best = { x: x + dx, y: y + dy }; bestD = d; }
      }
    }
    if (best) return best;
  }
  return null;
}

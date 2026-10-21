// Volta à aba: com a aba em segundo plano o navegador para o requestAnimationFrame (o Phaser congela), mas os passos
// continuam chegando pelo socket e enchem a fila de cada ator. Ao voltar, o catch-up do Actor (1 + 0.35 × (fila − 1))
// tocaria a fila inteira acelerada (~30 passos ≈ 11×). Em vez disso, quem tem fila vai direto para o tile atual.
// O lag normal de rede continua com o catch-up suave, e a Investida (dashTo) não é afetada: isto só roda ao voltar.

export interface Settleable {
  readonly isMoving: boolean;
  readonly tileX: number;
  readonly tileY: number;
  snapTo(x: number, y: number): void;
}

/** Leva cada ator com passos pendentes direto ao tile atual. Retorna quantos foram ajustados. */
export function settleActors(...groups: Iterable<Settleable>[]): number {
  let n = 0;
  for (const group of groups) {
    for (const a of group) {
      if (!a.isMoving) continue;
      a.snapTo(a.tileX, a.tileY);
      n++;
    }
  }
  return n;
}

/** Liga `onReturn` ao momento em que a aba volta a ficar visível. Retorna o desligador. */
export function onTabReturn(onReturn: () => void, doc: Pick<Document, "hidden" | "addEventListener" | "removeEventListener"> = document): () => void {
  const handler = () => { if (!doc.hidden) onReturn(); };
  doc.addEventListener("visibilitychange", handler);
  return () => doc.removeEventListener("visibilitychange", handler);
}

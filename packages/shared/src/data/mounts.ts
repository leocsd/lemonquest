// Montarias: puramente cosmético por enquanto (sem bônus de velocidade), igual aos addons de roupa. Sem sistema de
// posse ainda: qualquer uma da lista pode ser escolhida por qualquer personagem (ver GAME_ROADMAP).
// Arte: tools/mounts/generate.mjs, recortada de um pack licenciado à parte (assets/mounts/_source/). Sheet: 4
// colunas (baixo/cima/esquerda/direita) x 4 linhas (ciclo de passo), canvas próprio por montaria.
export interface MountDef {
  id: string;
  name: string;
  /** Relativo a assets/. */
  sheet: string;
}

export const MOUNT_LIST: MountDef[] = [
  { id: "pony", name: "Pônei", sheet: "mounts/pony.png" },
  { id: "black", name: "Cavalo Negro", sheet: "mounts/black.png" },
  { id: "brown", name: "Cavalo Castanho", sheet: "mounts/brown.png" },
  { id: "paint", name: "Cavalo Malhado", sheet: "mounts/paint.png" },
  { id: "white", name: "Cavalo Branco", sheet: "mounts/white.png" },
];

export const MOUNTS: Record<string, MountDef> = Object.fromEntries(MOUNT_LIST.map((m) => [m.id, m]));

export function mountDef(id: string | undefined | null): MountDef | undefined {
  return id ? MOUNTS[id] : undefined;
}

// Qual cursor do tema limão mostrar sobre o canvas do mundo (o desenho e o CSS saem de tools/cursors/generate.mjs;
// o WorldScene escreve o nome em canvas.dataset.cursor). Segue o que o clique faria ali: criatura = atacar,
// NPC = falar, estátua/baú/alavanca = usar, item no chão = pegar; com Shift o clique vira "olhar" sobre qualquer coisa.

export type CanvasCursor = "padrao" | "ataque" | "falar" | "mao" | "pegar" | "olhar";

export interface HoverInfo {
  creature: boolean;
  npc: boolean;
  /** Estátua ou objeto de missão (baú, alavanca...). */
  usable: boolean;
  groundItem: boolean;
  /** Outro jogador no tile (o clique direito abre o menu dele). */
  player: boolean;
  shift: boolean;
}

export function canvasCursor(h: HoverInfo): CanvasCursor {
  const algo = h.creature || h.npc || h.usable || h.groundItem || h.player;
  if (h.shift && algo) return "olhar";
  if (h.creature) return "ataque";
  if (h.npc) return "falar";
  if (h.usable || h.player) return "mao";
  if (h.groundItem) return "pegar";
  return "padrao";
}

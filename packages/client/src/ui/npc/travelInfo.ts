// Janela de viagem (ciclo 17): faixa de level dos monstros em volta do destino e alerta quando o personagem está abaixo
// dela. Puro: o destino é uma vila protegida, então a faixa vem do índice do mundo (`levelsNear`), não da zona.
import { npcDef, type WorldIndex } from "@lemonquest/shared";

export interface TravelInfo { text: string; danger: boolean }

export function travelInfo(index: WorldIndex | null, npcId: string, destId: string, level: number): TravelInfo | null {
  const d = npcDef(npcId)?.travel?.find((x) => x.id === destId);
  if (!d || !index) return null;
  const lv = index.levelsNear(d.x, d.y);
  if (!lv) return { text: "Sem monstros por perto", danger: false };
  return { text: `Monstros em volta: lv ${lv.min === lv.max ? lv.min : `${lv.min}–${lv.max}`}`, danger: level < lv.min };
}

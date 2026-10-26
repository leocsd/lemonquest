// Baús e alavancas de quest (objetos "quest_chest"/"quest_lever" do mapa): só acerto de clique; o desenho vem do próprio
// mapa (baús `drawn` dos covis: game/drawnChests.ts). Usar = ficar ao lado (o servidor exige Chebyshev QUEST_OBJECT_RANGE) e mandar C2S.UseQuestObject.
import { C2S, QUEST_OBJECT_RANGE, TILE_SIZE, findQuestObjects, type QuestObjectSpot, type TiledMap, type UseQuestObjectMsg } from "@lemonquest/shared";
import { send } from "../ui/items/net.ts";

export { QUEST_OBJECT_RANGE };

/** Chave única (um baú e uma alavanca podem ter o mesmo id). */
export const questObjectKey = (s: Pick<QuestObjectSpot, "kind" | "id">): string => `${s.kind}:${s.id}`;

export class QuestObjectIndex {
  readonly list: QuestObjectSpot[];

  constructor(tiled: TiledMap) {
    this.list = findQuestObjects(tiled);
  }

  get(key: string): QuestObjectSpot | undefined {
    return this.list.find((s) => questObjectKey(s) === key);
  }

  /** Objeto sob um ponto do mundo (px): o próprio tile. */
  atPoint(wx: number, wy: number): string | null {
    const tx = Math.floor(wx / TILE_SIZE), ty = Math.floor(wy / TILE_SIZE);
    const s = this.list.find((q) => q.x === tx && q.y === ty);
    return s ? questObjectKey(s) : null;
  }
}

export function useQuestObject(s: QuestObjectSpot): void {
  send(C2S.UseQuestObject, { kind: s.kind, id: s.id } satisfies UseQuestObjectMsg);
}

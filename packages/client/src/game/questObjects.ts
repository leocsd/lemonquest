// Baús, alavancas e portas de sala (objetos "quest_chest"/"quest_lever"/"door" do mapa): só acerto de clique; o desenho
// vem do próprio mapa (baús `drawn` dos covis: game/drawnChests.ts; portas: game/doors.ts). Usar = ficar ao lado (o
// servidor exige Chebyshev QUEST_OBJECT_RANGE = DOOR_RANGE) e mandar C2S.UseQuestObject.
import {
  C2S, QUEST_OBJECT_RANGE, TILE_SIZE, findDoors, findQuestObjects, type DoorSpot, type QuestObjectSpot, type TiledMap, type UseQuestObjectMsg,
} from "@lemonquest/shared";
import { send } from "../ui/items/net.ts";

export { QUEST_OBJECT_RANGE };

/** Algo que se usa ao lado: baú, alavanca ou porta. */
export type UsableSpot = QuestObjectSpot | (Pick<DoorSpot, "id" | "x" | "y"> & { kind: "door" });

/** Chave única (um baú e uma alavanca podem ter o mesmo id). */
export const questObjectKey = (s: Pick<UsableSpot, "kind" | "id">): string => `${s.kind}:${s.id}`;

export class QuestObjectIndex {
  /** Só baús e alavancas (rótulos de classe, baús desenhados). */
  readonly list: QuestObjectSpot[];
  readonly doors: DoorSpot[];
  private readonly all: UsableSpot[];

  constructor(tiled: TiledMap) {
    this.list = findQuestObjects(tiled);
    this.doors = findDoors(tiled);
    this.all = [...this.list, ...this.doors.map((d) => ({ kind: "door" as const, id: d.id, x: d.x, y: d.y }))];
  }

  get(key: string): UsableSpot | undefined {
    return this.all.find((s) => questObjectKey(s) === key);
  }

  /** Objeto sob um ponto do mundo (px): o próprio tile. */
  atPoint(wx: number, wy: number): string | null {
    const tx = Math.floor(wx / TILE_SIZE), ty = Math.floor(wy / TILE_SIZE);
    const s = this.all.find((q) => q.x === tx && q.y === ty);
    return s ? questObjectKey(s) : null;
  }
}

export function useQuestObject(s: UsableSpot): void {
  send(C2S.UseQuestObject, { kind: s.kind, id: s.id } satisfies UseQuestObjectMsg);
}

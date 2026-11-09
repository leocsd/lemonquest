// Portas (ciclo 22): o que antes era "portal para entrar numa sala e outro ao lado para sair" virou porta de verdade,
// como no Tibia. Objeto "door" do mapa (ponto no tile da porta, que fica numa parede), props:
//   doorId  (string única), minLevel / quest / chestGroup (requisito, os mesmos das antigas portas de quest),
//   style   "arco" (porta de madeira em arco, padrão) | "grade" (cancela/grade de ferro, para cercas ao ar livre).
// Duas regras, ambas pelo "usar" (clique ao lado, como baú e alavanca):
//   - Porta comum (sem requisito): usar abre ou fecha. Aberta, qualquer jogador passa; monstro nunca. Não fecha com
//     alguém em cima.
//   - Porta de level/missão: usar com o requisito cumprido leva o jogador para dentro da porta (um passo); ela fica
//     aberta enquanto ele está nela e fecha quando ele sai, para um lado ou para o outro. Quem não cumpre recebe o
//     motivo e fica onde está. Ninguém passa por ela a pé sem usar (é parede para a colisão).
// O tile da porta é bloqueado pela CollisionGrid (shared/map.ts) a partir do objeto; a porta comum aberta é liberada
// com `setWalkable` no servidor e no cliente (S2C.Doors).
import { findObjects, objectTile, type TiledMap } from "../map.ts";
import { doorRequirement, type DoorRequirement } from "./questWorld.ts";

export type DoorStyle = "arco" | "grade";

export interface DoorSpot {
  id: string;
  x: number;
  y: number;
  style: DoorStyle;
  req?: DoorRequirement;
}

/** Usar a porta: a até 1 tile (Chebyshev), como baú e alavanca. */
export const DOOR_RANGE = 1;

const prop = (o: { properties?: { name: string; value: unknown }[] }, n: string): unknown => o.properties?.find((p) => p.name === n)?.value;

export function findDoors(map: TiledMap): DoorSpot[] {
  const out: DoorSpot[] = [];
  for (const o of findObjects(map, "door")) {
    const id = String(prop(o, "doorId") ?? o.name ?? "");
    if (!id || out.some((d) => d.id === id)) continue;
    const req = doorRequirement(o);
    const style: DoorStyle = prop(o, "style") === "grade" ? "grade" : "arco";
    out.push({ id, ...objectTile(o, map.tilewidth), style, ...(req ? { req } : {}) });
  }
  return out;
}

/** Os dois lados da porta: os vizinhos ortogonais andáveis no terreno (porta numa parede tem exatamente dois). */
export function doorSides(d: Pick<DoorSpot, "x" | "y">, walkable: (x: number, y: number) => boolean): { x: number; y: number }[] {
  return [[0, -1], [0, 1], [-1, 0], [1, 0]].map(([dx, dy]) => ({ x: d.x + dx!, y: d.y + dy! })).filter((t) => walkable(t.x, t.y));
}

/** Porta de level/missão (regra do "passo para dentro"); sem requisito = porta comum (abre e fecha). */
export const isGatedDoor = (d: Pick<DoorSpot, "req">): boolean => !!d.req;

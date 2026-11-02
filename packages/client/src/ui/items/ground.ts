// Itens no chão (lado da UI): largar (mochila/equipamento → tile do mundo) e pegar (chão → mochila/slot).
// A cena (WorldScene) registra como converter a posição do mouse em tile e qual é o tile do jogador.
import { C2S, type DropFrom, type DropItemMsg, type MoveGroundItemMsg, type PickupItemMsg, type PickupTo } from "@lemonquest/shared";
import { send } from "./net.ts";

export interface GroundBridge {
  /** Tile sob o ponto (coordenadas de cliente/DOM), ou null fora do mapa. */
  tileAt: (clientX: number, clientY: number) => { x: number; y: number } | null;
  /** Tile do jogador local (null = sem personagem). */
  myTile: () => { x: number; y: number } | null;
  /** Mover item do chão (a cena anda até o item quando ele está longe). Ausente = manda direto. */
  moveGround?: (groundId: string, x: number, y: number, count?: number) => void;
  /** Pegar item do chão (a cena anda até o item quando ele está longe). Ausente = manda direto. */
  pickup?: (groundId: string, to?: PickupTo) => void;
}

let bridge: GroundBridge | null = null;
export const setGroundBridge = (b: GroundBridge | null): void => { bridge = b; };

/** Larga o item em (x,y). O servidor valida (alcance 3, linha livre, andável) e, se não der, larga no seu tile. */
export function dropItem(from: DropFrom, x: number, y: number, count?: number): void {
  const m: DropItemMsg = count != null ? { from, x, y, count } : { from, x, y };
  send(C2S.DropItem, m);
}

/** Larga no tile sob o mouse (ou no próprio tile, se não houver). */
export function dropAtPointer(from: DropFrom, clientX: number, clientY: number, count?: number): void {
  const t = bridge?.tileAt(clientX, clientY) ?? bridge?.myTile();
  if (!t) return;
  dropItem(from, t.x, t.y, count);
}

/** Move um item do chão para (x,y). O servidor valida (alcance 3, linha livre, tile que segura item). */
export function moveGroundItem(groundId: string, x: number, y: number, count?: number): void {
  const m: MoveGroundItemMsg = count != null ? { groundId, x, y, count } : { groundId, x, y };
  send(C2S.MoveGroundItem, m);
}

/** Arrasta um item do chão para o tile sob o mouse (longe: a cena anda até o item antes). */
export function moveGroundAtPointer(groundId: string, clientX: number, clientY: number, count?: number): void {
  const t = bridge?.tileAt(clientX, clientY);
  if (!t) return;
  if (bridge?.moveGround) bridge.moveGround(groundId, t.x, t.y, count);
  else moveGroundItem(groundId, t.x, t.y, count);
}

/**
 * Arrastou um item do chão até um slot: pega. O servidor só aceita a 1 tile e recusa longe em silêncio, então a cena
 * anda até o item antes quando ele está longe (antes o arrasto de um item a 2+ tiles simplesmente não fazia nada).
 */
export function pickupFromDrag(groundId: string, to: PickupTo): void {
  if (bridge?.pickup) bridge.pickup(groundId, to);
  else pickupItem(groundId, to);
}

export function pickupItem(groundId: string, to?: PickupTo): void {
  const m: PickupItemMsg = to ? { groundId, to } : { groundId };
  send(C2S.PickupItem, m);
}

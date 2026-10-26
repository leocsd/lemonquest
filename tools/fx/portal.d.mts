// Tipos de tools/fx/portal.mjs (usado pelo teste em TS: packages/client/src/game/portalSprites.test.ts).
export const FRAME_W: number;
export const FRAME_H: number;
export const FRAMES: number;
export const LOOKS: string[];
export interface PortalImage { width: number; height: number; data: Uint8Array }
export function drawPortalSheet(): PortalImage;
export function readPng(path: string): PortalImage;

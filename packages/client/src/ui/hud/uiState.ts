// Estado de janelas/painéis do HUD.
import { createStore, persistedBool } from "./store.ts";

export const NARROW_PX = 1000;
export const SIDEBAR_W = 220;
export const SIDEBAR_GAP = 8;

/** Barra lateral aberta (lembrada); em janelas estreitas começa fechada. */
export const sidebarOpen = persistedBool("sidebar", true, window.innerWidth < NARROW_PX ? false : undefined);

export const skillsOpen = persistedBool("skills", false);
export const helpOpen = createStore(false);
export const soundOpen = createStore(false);
export const autoOpen = createStore(false);
export const a11yOpen = createStore(false);

export const toggle = (s: { set(fn: (v: boolean) => boolean): void }) => s.set((v) => !v);

/** Popovers do trilho: só um aberto por vez. */
const POPOVERS = [helpOpen, soundOpen, autoOpen, a11yOpen];
/** Alterna `s` e fecha os outros popovers do trilho. */
export function togglePopover(s: (typeof POPOVERS)[number]): void {
  for (const o of POPOVERS) if (o !== s) o.set(false);
  toggle(s);
}

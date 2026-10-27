// Arrasto de janela pela barra de título, com a posição lembrada por janela (localStorage). Extraído da janela de
// Habilidades para que toda janela com "grip" na barra arraste de verdade (antes 8 delas só mostravam o cursor de mão).
// Pointer capture: o arrasto continua mesmo com o mouse saindo da janela.
import { useEffect, useRef, useState } from "preact/hooks";
import { persistedJson, useStore, type Store } from "./store.ts";

export interface WindowPos { x: number; y: number }

const MARGIN = 4;
/** Altura mínima que fica na tela embaixo: a barra de título continua alcançável. */
const KEEP_BOTTOM = 60;

/** Posição dentro da tela para uma janela de largura `w` (a altura não importa: só a barra precisa ficar visível). */
export function clampWindowPos(x: number, y: number, w: number): WindowPos {
  return {
    x: Math.max(MARGIN, Math.min(window.innerWidth - w - MARGIN, x)),
    y: Math.max(MARGIN, Math.min(window.innerHeight - KEEP_BOTTOM, y)),
  };
}

/** Um store por janela, criado uma vez (a chave vira "lemonquest.ui.<key>Pos", como skillsPos/hotkeysPos já eram). */
const stores = new Map<string, Store<WindowPos>>();
function posStoreFor(key: string): Store<WindowPos> {
  let s = stores.get(key);
  if (!s) { s = persistedJson<WindowPos>(`${key}Pos`, { x: -1, y: -1 }); stores.set(key, s); }
  return s;
}

export interface WindowDrag {
  /** Vai no elemento raiz da janela (.hud-window). */
  ref: { current: HTMLDivElement | null };
  /** Posição atual, ou null = a janela ainda está onde o CSS a põe (nunca foi arrastada e não tem posição padrão). */
  pos: WindowPos | null;
  /** Estilo inline para a raiz: left/top explícitos e sem o transform de centralização do CSS. */
  style: { left: string; top: string; transform: string } | undefined;
  dragging: boolean;
  /** onPointerDown da .win-title. */
  onTitleDown: (e: PointerEvent) => void;
  /** Limita a posição salva à tela com a largura atual da janela (janela que ficou mais larga que quando a posição foi salva). */
  clamp: () => void;
}

/**
 * `key`: nome da posição salva. `defaultPos`: posição inicial quando nada foi salvo (janelas que sempre se posicionam
 * por JS, como Habilidades); sem ela, a janela fica onde o CSS a põe até o primeiro arrasto.
 */
export function useWindowDrag(key: string, defaultPos?: () => WindowPos): WindowDrag {
  const posStore = posStoreFor(key);
  const stored = useStore(posStore);
  const [dragging, setDragging] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const clamp = () => {
    const el = ref.current;
    if (el && posStore.get().x >= 0) posStore.set((p) => clampWindowPos(p.x, p.y, el.offsetWidth));
  };

  // Mantém na tela ao redimensionar.
  useEffect(() => {
    const onResize = () => {
      const el = ref.current;
      if (posStore.get().x >= 0 && el) posStore.set((p) => clampWindowPos(p.x, p.y, el.offsetWidth));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [posStore]);

  const onTitleDown = (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest("button, select, input, a")) return;
    const el = ref.current;
    if (!el) return;
    e.preventDefault();
    // Parte da posição REAL (também quando a janela está centralizada por CSS e ainda não tem left/top próprios).
    const rect = el.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top, w = rect.width;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    setDragging(true);
    const move = (ev: PointerEvent) => posStore.set(clampWindowPos(ev.clientX - sx, ev.clientY - sy, w));
    const up = () => {
      setDragging(false);
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  };

  const pos = stored.x >= 0 ? stored : defaultPos ? defaultPos() : null;
  const style = pos ? { left: `${pos.x}px`, top: `${pos.y}px`, transform: "none" } : undefined;
  return { ref, pos, style, dragging, onTitleDown, clamp };
}

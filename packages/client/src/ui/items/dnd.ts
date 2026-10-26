// Arrastar e soltar com pointer events entre mochila, equipamento, depot e o chão do mundo.
// Os slots declaram `data-loc="bp:3" | "eq:helmet" | "dp:12"`. O alvo é achado com elementFromPoint ao soltar.
// Soltar fora dos painéis (sobre o mundo) = largar no chão naquele tile (raro ou melhor pede confirmação). Arrastar um item
// do chão (WorldScene → beginGroundPress) até um slot = pegar; até outro tile do mundo = mover no chão.
import {
  BACKPACK_SIZE, DEPOT_SIZE, EQUIP_SLOTS, refinedName, type EquipSlot, type ItemDef, type ItemInstance, type ItemLocation,
} from "@lemonquest/shared";
import { createStore } from "../hud/store.ts";
import { playersStore, selectMe } from "../hud/world.ts";
import { npcStore } from "../npc/npc.ts";
import { closeDialog, openDialog } from "./dialogs.ts";
import { dropConfirmText, needsDropConfirm } from "./dropConfirm.ts";
import { dropAtPointer, moveGroundAtPointer, pickupItem } from "./ground.ts";
import { defOf, inventoryStore, moveItem } from "./inventory.ts";
import { canEquip, rarityLabel } from "./itemInfo.ts";
import { itemTipStore } from "./tipStore.ts";

/** Origem do arrasto: um slot ou um item do chão (id do servidor). */
export type DragFrom = ItemLocation | { where: "ground"; id: string };

export interface DragState {
  from: DragFrom;
  inst: ItemInstance;
  def: ItemDef | undefined;
  /** Chaves de slot onde soltar é válido. */
  valid: Set<string>;
  /** Motivo de invalidade por slot (feedback ao passar o mouse). */
  reasons: Map<string, string>;
}
export const dragStore = createStore<DragState | null>(null);

export const locKey = (l: DragFrom): string =>
  l.where === "backpack" ? `bp:${l.index}` : l.where === "depot" ? `dp:${l.index}` : l.where === "ground" ? `gr:${l.id}` : `eq:${l.slot}`;

export function parseLoc(key: string | undefined): ItemLocation | null {
  if (!key) return null;
  const [k, v] = key.split(":");
  if (k === "bp" || k === "dp") {
    const index = Number(v);
    return Number.isInteger(index) ? { where: k === "bp" ? "backpack" : "depot", index } : null;
  }
  if (k === "eq" && (EQUIP_SLOTS as string[]).includes(v)) return { where: "equip", slot: v as EquipSlot };
  return null;
}

const REASON_TEXT = { slot: "Slot incompatível", level: "Level insuficiente", vocation: "Vocação não pode usar", twohanded: "Arma de duas mãos equipada" } as const;

function computeValid(from: DragFrom, inst: ItemInstance): Pick<DragState, "valid" | "reasons"> {
  const valid = new Set<string>();
  const reasons = new Map<string, string>();
  const inv = inventoryStore.get();
  const def = defOf(inst);
  const me = selectMe(playersStore.get());
  const meReq = me ? { level: me.level, vocation: me.vocation } : null;
  const fromKey = locKey(from);
  const bpSize = inv?.backpack.length ?? BACKPACK_SIZE;
  for (let i = 0; i < bpSize; i++) if (`bp:${i}` !== fromKey) valid.add(`bp:${i}`);
  for (const slot of EQUIP_SLOTS) {
    const key = `eq:${slot}`;
    if (from.where === "equip") { reasons.set(key, "Escolha um slot da mochila"); continue; }
    if (from.where === "depot") { reasons.set(key, "Pegue o item da mochila primeiro"); continue; }
    const c = canEquip(def, slot, meReq, inv?.equipment ?? {}, (id) => defOf({ defId: id } as ItemInstance));
    if (c.ok) valid.add(key);
    else reasons.set(key, c.reason === "level" && def?.level ? `Precisa de level ${def.level}` : REASON_TEXT[c.reason]);
  }
  const npc = npcStore.get();
  if (npc?.msg.depot) {
    for (let i = 0; i < DEPOT_SIZE; i++) {
      if (from.where === "equip") { reasons.set(`dp:${i}`, "Desequipe primeiro"); continue; }
      if (from.where === "ground") { reasons.set(`dp:${i}`, "Pegue para a mochila primeiro"); continue; }
      if (`dp:${i}` !== fromKey) valid.add(`dp:${i}`);
    }
  }
  return { valid, reasons };
}

const START_PX = 4;
let ghostMove: ((x: number, y: number, reason: string) => void) | null = null;
export function bindGhost(fn: typeof ghostMove): void { ghostMove = fn; }

let cleanup: (() => void) | null = null;
let hoverEl: Element | null = null;

function setHover(el: Element | null) {
  if (el === hoverEl) return;
  hoverEl?.classList.remove("drop-hover");
  hoverEl = el;
  hoverEl?.classList.add("drop-hover");
}

export function cancelDrag(): boolean {
  const had = dragStore.get() != null;
  cleanup?.();
  return had;
}

/** Chamado no pointerdown de um slot preenchido. Vira arrasto depois de mover alguns pixels. */
export function beginPress(e: PointerEvent, from: ItemLocation, inst: ItemInstance): void {
  if (e.button !== 0) return;
  startPress(e.clientX, e.clientY, e.shiftKey, from, inst);
}

/**
 * Pointerdown num item do chão (WorldScene). Mover > 4 px = arrasto (soltar num slot pega o item);
 * soltar sem arrastar chama `onClick` (andar até o tile, como um clique normal).
 */
export function beginGroundPress(clientX: number, clientY: number, id: string, inst: ItemInstance, onClick: () => void): void {
  startPress(clientX, clientY, false, { where: "ground", id }, inst, onClick);
}

function startPress(sx: number, sy: number, shiftDown: boolean, from: DragFrom, inst: ItemInstance, onClick?: () => void): void {
  cancelDrag();
  let shift = shiftDown;
  let dragging = false;
  let px = sx, py = sy;
  let raf = 0;

  /** Arrastando perto da borda de cima/baixo de uma lista rolável (Mochila/Batalha): rola sozinha. */
  const autoScroll = () => {
    raf = 0;
    if (!dragging) return;
    let moved = false;
    for (const sc of document.querySelectorAll<HTMLElement>("[data-sized-body]")) {
      if (sc.scrollHeight <= sc.clientHeight) continue;
      const r = sc.getBoundingClientRect();
      if (px < r.left || px > r.right || py < r.top - 6 || py > r.bottom + 6) continue;
      const edge = 22;
      const v = py < r.top + edge ? -Math.min(10, (r.top + edge - py) / 2 + 1) : py > r.bottom - edge ? Math.min(10, (py - (r.bottom - edge)) / 2 + 1) : 0;
      if (v) { const before = sc.scrollTop; sc.scrollTop += v; moved = moved || sc.scrollTop !== before; }
    }
    if (moved) hoverAt(px, py);
    raf = requestAnimationFrame(autoScroll);
  };
  const hoverAt = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y)?.closest("[data-loc]") ?? null;
    setHover(el);
    const d = dragStore.get();
    const key = (el as HTMLElement | null)?.dataset.loc;
    const reason = d && key && !d.valid.has(key) ? d.reasons.get(key) ?? "" : "";
    ghostMove?.(x, y, reason);
  };

  const move = (ev: PointerEvent) => {
    shift = shift || ev.shiftKey;
    if (!dragging) {
      if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < START_PX) return;
      dragging = true;
      itemTipStore.set(null);
      dragStore.set({ from, inst, def: defOf(inst), ...computeValid(from, inst) });
    }
    px = ev.clientX; py = ev.clientY;
    hoverAt(px, py);
    if (!raf) raf = requestAnimationFrame(autoScroll);
  };
  const up = (ev: PointerEvent) => {
    const was = dragging;
    const d = dragStore.get();
    shift = shift || ev.shiftKey;
    cleanup?.();
    if (was && d) drop(d, ev.clientX, ev.clientY, shift);
    else if (!was) onClick?.();
  };

  const off = () => {
    cancelAnimationFrame(raf);
    raf = 0;
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", off);
    setHover(null);
    dragStore.set(null);
    if (cleanup === off) cleanup = null;
  };
  cleanup = off;
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", off);
}

const PANEL_SEL = ".hud-panel, .hud-rail, .npc-window, .hud-window, .action-bar, .quick-slots, .chat, .item-dialog, .compact-vitals";

function drop(d: DragState, x: number, y: number, shift: boolean) {
  const target = document.elementFromPoint(x, y);
  const slot = target?.closest("[data-loc]") as HTMLElement | null;
  const from = d.from;
  if (from.where === "ground") {
    // Do chão para um slot: pegar. Soltou no mundo (fora dos painéis): move para o tile sob o mouse (Shift numa
    // pilha escolhe quanto).
    if (slot) {
      const to = parseLoc(slot.dataset.loc);
      if (!to || !d.valid.has(locKey(to))) return;
      if (to.where === "backpack" || to.where === "equip") pickupItem(from.id, to);
      return;
    }
    if (target?.closest(PANEL_SEL)) return;
    if (shift && d.inst.count > 1) {
      openDialog({
        kind: "count", title: `Mover ${d.def?.name ?? "item"}`, verb: "Mover", max: d.inst.count, initial: d.inst.count,
        onConfirm: (n) => { closeDialog(); moveGroundAtPointer(from.id, x, y, n); },
      });
    } else moveGroundAtPointer(from.id, x, y);
    return;
  }
  if (slot) {
    const to = parseLoc(slot.dataset.loc);
    if (!to || locKey(to) === locKey(from)) return;
    if (!d.valid.has(locKey(to))) return;
    if (shift && d.inst.count > 1 && from.where !== "equip") {
      openDialog({
        kind: "count", title: `Mover ${d.def?.name ?? "item"}`, max: d.inst.count, initial: Math.max(1, Math.floor(d.inst.count / 2)),
        onConfirm: (n) => { closeDialog(); moveItem(from, to, n); },
      });
    } else moveItem(from, to);
    return;
  }
  if (target?.closest(PANEL_SEL)) return;
  // Soltou fora dos painéis: larga no chão (tile sob o mouse; o servidor decide se cai lá ou no seu tile).
  // Pilha (mais de 1): escolhe a quantidade na barrinha (começa em tudo) — a barrinha já é a confirmação.
  // Item único raro ou melhor: pergunta antes (a fresta entre trilho e coluna engolia arrastos por engano).
  if (from.where === "depot") return;
  const name = d.def ? refinedName(d.def, d.inst) : "item";
  if (d.inst.count > 1) {
    openDialog({
      kind: "count", title: `Largar ${name}`, verb: "Largar", max: d.inst.count, initial: d.inst.count,
      onConfirm: (n) => { closeDialog(); dropAtPointer(from, x, y, n); },
    });
  } else if (needsDropConfirm(d.inst)) {
    openDialog({
      kind: "confirm", title: `Largar ${name}`, text: dropConfirmText(name, rarityLabel(d.inst.rarity)), verb: "Largar",
      onConfirm: () => { closeDialog(); dropAtPointer(from, x, y); },
    });
  } else dropAtPointer(from, x, y);
}

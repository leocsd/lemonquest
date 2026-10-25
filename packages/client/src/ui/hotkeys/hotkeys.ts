// Atalhos de magia do personagem (tecla → magia). Vêm do servidor ao entrar (S2C.Hotkeys); mudanças no painel (H) ou
// arrastando na barra são aplicadas na hora e enviadas (C2S.SetHotkeys). Primeira vez (servidor manda null): migra a
// ordem antiga da barra (navegador) para as teclas 1–8, para ninguém perder a barra que já tinha arrumado.
import {
  C2S, S2C, defaultHotkeys, hotkeysFromOrder, keyLabel, sanitizeHotkeys, sanitizeSpellGroups,
  type Hotkey, type HotkeysMsg, type SetHotkeysMsg, type SpellGroup, type Vocation,
} from "@lemonquest/shared";
import { session } from "../../session.ts";
import { parseOrder } from "../hud/slotOrder.ts";
import { createStore } from "../hud/store.ts";
import { meStore } from "../hud/world.ts";

export { hotkeyIndex, keyFromEvent, swapHotkeySpells } from "./edit.ts";

/** Atalhos atuais; null = ainda não chegaram do servidor (a barra usa o padrão da vocação). */
export const hotkeysStore = createStore<Hotkey[] | null>(null);
export const hotkeysOpen = createStore(false);
/** Grupos de magia do jogador (painel "Grupos de magia"); vão e voltam junto com os atalhos. */
export const groupsStore = createStore<SpellGroup[]>([]);
export const toggleHotkeys = () => hotkeysOpen.set((v) => !v);

/** Rótulos reais do teclado do jogador (Chrome/Edge: navigator.keyboard); sem suporte = rótulos do teclado americano. */
export const layoutStore = createStore<ReadonlyMap<string, string> | undefined>(undefined);
try {
  const kb = (navigator as unknown as { keyboard?: { getLayoutMap?: () => Promise<ReadonlyMap<string, string>> } }).keyboard;
  kb?.getLayoutMap?.().then((m) => layoutStore.set(m), () => {});
} catch { /* sem suporte */ }

export const hotkeyLabel = (key: string): string => keyLabel(key, layoutStore.get());

/** Atalhos efetivos: os do servidor, ou o padrão da vocação enquanto não chegam. */
export function effectiveHotkeys(vocation: Vocation | undefined): Hotkey[] {
  return hotkeysStore.get() ?? (vocation ? defaultHotkeys(vocation) : []);
}

let send: (m: SetHotkeysMsg) => void = (m) => { session.room?.send(C2S.SetHotkeys, m); };
/** Testes/harness: troca o envio ao servidor. */
export function setHotkeysTransport(fn: (m: SetHotkeysMsg) => void): void { send = fn; }

/**
 * Envio com espera: várias edições seguidas (adicionar 3 linhas, arrastar duas vezes) viram UM envio com a lista final
 * (o servidor limita as mensagens por segundo). O servidor responde com a lista salva (S2C.Hotkeys).
 */
export const HOTKEYS_SEND_DELAY_MS = 400;
let sendTimer = 0;
/** Última lista (e grupos) enviada que o servidor ainda não confirmou. */
let awaiting: SetHotkeysMsg | null = null;
let mismatches = 0;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function flush(): void {
  if (sendTimer) { clearTimeout(sendTimer); sendTimer = 0; }
  const list = hotkeysStore.get();
  if (!list) return;
  awaiting = { list, groups: groupsStore.get() };
  send(awaiting);
}

function schedule(): void {
  mismatches = 0;
  if (sendTimer) clearTimeout(sendTimer);
  sendTimer = window.setTimeout(flush, HOTKEYS_SEND_DELAY_MS);
}

/** Aplica na hora (já limpa pelas mesmas regras do servidor) e agenda o envio. */
export function setHotkeys(list: readonly Hotkey[]): void {
  const voc = meStore.get()?.vocation as Vocation | undefined;
  const clean = voc ? sanitizeHotkeys(list, voc, groupsStore.get()) : list.slice();
  hotkeysStore.set(clean);
  schedule();
}

/**
 * Troca os grupos (e, se vier, a lista de atalhos junto: "pôr na barra"). Atalho de grupo excluído sai da barra.
 * Mesmo envio com espera dos atalhos: arrastar várias magias seguidas vira um envio só.
 */
export function setSpellGroups(groups: readonly SpellGroup[], list?: readonly Hotkey[]): void {
  const voc = meStore.get()?.vocation as Vocation | undefined;
  const clean = voc ? sanitizeSpellGroups(groups, voc) : groups.map((g) => ({ ...g, spells: [...g.spells] }));
  groupsStore.set(clean);
  const base = list ?? effectiveHotkeys(voc);
  hotkeysStore.set(voc ? sanitizeHotkeys(base, voc, clean) : base.slice());
  schedule();
}

/**
 * Lista vinda do servidor. Com edição local ainda não enviada, fica a local. Se ela não bate com o que enviamos
 * (reenvio da reconexão com a lista velha, envio perdido), manda a local de novo — uma vez; na segunda divergência
 * vale a do servidor.
 */
function receive(list: Hotkey[], groups: SpellGroup[]): void {
  if (sendTimer) return;
  if (awaiting && !same({ list, groups }, awaiting) && mismatches < 1) { mismatches++; flush(); return; }
  awaiting = null;
  groupsStore.set(groups);
  hotkeysStore.set(list);
}

// Fechar/recarregar a página logo depois de editar: manda o que falta.
try { window.addEventListener("pagehide", () => { if (sendTimer) flush(); }); } catch { /* sem window */ }

// --- carga e migração ------------------------------------------------------------------

/** Ordem da barra antiga, gravada no navegador por personagem (antes dos atalhos no servidor). */
const oldOrderKey = () => `lemonquest.actionbar.${(session.myName || "?").normalize("NFC").toLowerCase()}`;
let migrate = false;

function tryMigrate(): void {
  const voc = meStore.get()?.vocation as Vocation | undefined;
  if (!migrate || !voc) return;
  migrate = false;
  let order: (string | null)[] | null = null;
  try { order = parseOrder(localStorage.getItem(oldOrderKey())); } catch { /* sem localStorage */ }
  setHotkeys(hotkeysFromOrder(order, voc));
}

session.onRoom((room) => {
  room.onMessage(S2C.Hotkeys, (m: HotkeysMsg) => {
    const groups = Array.isArray(m?.groups) ? m.groups : [];
    if (Array.isArray(m?.list)) { migrate = false; receive(m.list, groups); return; }
    groupsStore.set(groups);
    hotkeysStore.set(null);
    migrate = true;
    tryMigrate();
  });
});
meStore.subscribe(() => tryMigrate());

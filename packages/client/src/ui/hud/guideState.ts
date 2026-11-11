// Estado do guia: o pedido atual ("Guiar" no rastreador, diário, Quadro ou Agenda; lembrado por personagem neste
// navegador) e o alvo resolvido por quadro, com memória (o índice só é consultado de novo quando algo muda ou a cada
// RECALC_MS andando).
import { getWorldIndex } from "../../game/worldIndex.ts";
import { inventoryStore } from "../items/inventory.ts";
import { inventoryCounter, myLevelStore, questStore } from "../quests/quests.ts";
import { createStore, persistedJson, type ReadableStore } from "./store.ts";
import { meStore } from "./world.ts";
import {
  effectiveRequest, guideTarget, isGuiding, requestFinished, toggledRequest,
  type ActiveGuideRequest, type GuideRequest, type GuideTarget,
} from "./guide.ts";

export { isGuiding };

/** Andando, o alvo (spawn mais perto, próximo portal) é recalculado no máximo a cada RECALC_MS. */
const RECALC_MS = 400;

/** Pedido do jogador: null = nenhum (vale o guia automático do novato); { kind: "off" } = "Parar" explícito. */
export const guideRequestStore = createStore<GuideRequest | null>(null);

// Lembrado com o nome do personagem: trocar de personagem não herda o guia do outro.
const saved = persistedJson<{ req: GuideRequest | null; who: string }>("guide", { req: null, who: "" });
let who = "";
meStore.subscribe((me) => {
  const name = me?.name ?? "";
  if (!name || name === who) return;
  who = name;
  const s = saved.get();
  guideRequestStore.set(s.who === name ? validRequest(s.req) : null);
});
guideRequestStore.subscribe((req) => { if (who) saved.set({ req, who }); });

/** Alvo atual do guia (o minimapa e o mapa-múndi marcam `dest`); null = sem guia. */
const destStore = createStore<GuideTarget | null>(null);
export const guideDestStore: ReadableStore<GuideTarget | null> = destStore;

const effectiveNow = (): ActiveGuideRequest | null => effectiveRequest(guideRequestStore.get(), myLevelStore.get(), questStore.get());
/**
 * Pedido efetivo (o do jogador ou o automático do novato): os botões "Guiar"/"Guiando" olham este, senão o botão dizia
 * "Guiar" com a seta do novato ligada. Só avisa quando muda (effectiveRequest devolve sempre o mesmo objeto).
 */
const effectiveStore = createStore<ActiveGuideRequest | null>(effectiveNow());
export const guideEffectiveStore: ReadableStore<ActiveGuideRequest | null> = effectiveStore;
const refreshEffective = () => effectiveStore.set(effectiveNow());
guideRequestStore.subscribe(refreshEffective);
questStore.subscribe(refreshEffective);
myLevelStore.subscribe(refreshEffective);

function validRequest(r: unknown): GuideRequest | null {
  if (!r || typeof r !== "object") return null;
  const o = r as Record<string, unknown>;
  if (o.kind === "quest" && typeof o.id === "string") return { kind: "quest", id: o.id };
  if (o.kind === "bounty" && typeof o.monster === "string") return { kind: "bounty", monster: o.monster };
  if (o.kind === "tile" && Number.isInteger(o.x) && Number.isInteger(o.y) && typeof o.label === "string") {
    return { kind: "tile", x: o.x as number, y: o.y as number, label: o.label };
  }
  if (o.kind === "off") return { kind: "off" };
  return null;
}

export const guideTile = (x: number, y: number, label: string): void => guideRequestStore.set({ kind: "tile", x, y, label });
/** Pedido acabou (missão concluída, chegou ao ponto): volta ao automático do novato, se ainda valer. */
export const clearGuide = (): void => guideRequestStore.set(null);

/** Liga/desliga o guia de uma missão (botão "Guiar"/"Parar"); desligar vale também para o guia do novato. */
export function toggleGuideQuest(id: string): void {
  guideRequestStore.set(toggledRequest(effectiveNow(), "quest", id));
}

/** Liga/desliga o guia de uma recompensa diária (monstro do Quadro). */
export function toggleGuideBounty(monster: string): void {
  guideRequestStore.set(toggledRequest(effectiveNow(), "bounty", monster));
}

// Missão concluída / recompensa entregue: o guia se apaga sozinho.
questStore.subscribe((q) => {
  const req = guideRequestStore.get();
  if (req && requestFinished(req, q)) clearGuide();
});

let memo: { at: number; key: unknown[]; out: GuideTarget | null } | null = null;

/** Alvo do guia para este quadro (WorldScene chama a cada quadro). */
export function currentGuide(me: { x: number; y: number }, level: number, now = performance.now()): GuideTarget | null {
  const index = getWorldIndex();
  let request = guideRequestStore.get();
  // Ponto do mapa (Agenda): chegou, o pedido acabou.
  if (request?.kind === "tile" && Math.max(Math.abs(request.x - me.x), Math.abs(request.y - me.y)) <= 2) { clearGuide(); request = null; }
  const quests = questStore.get(), inv = inventoryStore.get();
  const key = [index, request, quests, inv, level];
  const same = memo && memo.key.every((v, i) => v === key[i]);
  if (memo && same && now - memo.at < RECALC_MS) return memo.out;
  const out = guideTarget({ level, quests, count: inventoryCounter(), request, me, index });
  memo = { at: now, key, out };
  const prev = destStore.get();
  if (!sameTarget(prev, out)) destStore.set(out);
  return out;
}

function sameTarget(a: GuideTarget | null, b: GuideTarget | null): boolean {
  if (!a || !b) return a === b;
  return a.x === b.x && a.y === b.y && a.label === b.label && a.dest.x === b.dest.x && a.dest.y === b.dest.y;
}

// Estado do guia: o pedido atual ("Guiar" no rastreador, diário, Quadro ou Agenda; lembrado por personagem neste
// navegador) e o alvo resolvido por quadro, com memória (o índice só é consultado de novo quando algo muda ou a cada
// RECALC_MS andando).
import { getWorldIndex } from "../../game/worldIndex.ts";
import { inventoryStore } from "../items/inventory.ts";
import { inventoryCounter, questStore } from "../quests/quests.ts";
import { createStore, persistedJson, type ReadableStore } from "./store.ts";
import { meStore } from "./world.ts";
import { guideTarget, requestFinished, type GuideRequest, type GuideTarget } from "./guide.ts";

/** Andando, o alvo (spawn mais perto, próximo portal) é recalculado no máximo a cada RECALC_MS. */
const RECALC_MS = 400;

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

function validRequest(r: unknown): GuideRequest | null {
  if (!r || typeof r !== "object") return null;
  const o = r as Record<string, unknown>;
  if (o.kind === "quest" && typeof o.id === "string") return { kind: "quest", id: o.id };
  if (o.kind === "bounty" && typeof o.monster === "string") return { kind: "bounty", monster: o.monster };
  if (o.kind === "tile" && Number.isInteger(o.x) && Number.isInteger(o.y) && typeof o.label === "string") {
    return { kind: "tile", x: o.x as number, y: o.y as number, label: o.label };
  }
  return null;
}

export const guideQuest = (id: string): void => guideRequestStore.set({ kind: "quest", id });
export const guideBounty = (monster: string): void => guideRequestStore.set({ kind: "bounty", monster });
export const guideTile = (x: number, y: number, label: string): void => guideRequestStore.set({ kind: "tile", x, y, label });
export const clearGuide = (): void => guideRequestStore.set(null);

/** O botão "Guiar" deste pedido está ligado? */
export function isGuiding(req: GuideRequest | null, kind: "quest" | "bounty", id: string): boolean {
  if (!req || req.kind !== kind) return false;
  return req.kind === "quest" ? req.id === id : req.kind === "bounty" && req.monster === id;
}

/** Liga/desliga o guia de uma missão (botão "Guiar"/"Parar"). */
export function toggleGuideQuest(id: string): void {
  if (isGuiding(guideRequestStore.get(), "quest", id)) clearGuide();
  else guideQuest(id);
}

/** Liga/desliga o guia de uma recompensa diária (monstro do Quadro). */
export function toggleGuideBounty(monster: string): void {
  if (isGuiding(guideRequestStore.get(), "bounty", monster)) clearGuide();
  else guideBounty(monster);
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

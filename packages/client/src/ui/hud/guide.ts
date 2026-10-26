// Guia (seta para onde ir): a missão/recompensa que o jogador mandou "Guiar" ou, para o novato, a primeira missão. Puro
// (sem Phaser/Preact) para poder testar: o índice do mundo diz onde fica cada NPC, zona e spawn, e qual portal ou viagem
// pegar quando o destino fica noutra região. O estado (pedido atual, memória por quadro) fica em guideState.ts.
import {
  BOUNTY_NPC, MONSTERS, NPCS, questDef, questStatus, stepProgress,
  type ItemCounter, type PortalFilter, type QuestDef, type QuestStep, type QuestsMsg, type WorldHop, type WorldIndex,
} from "@lemonquest/shared";
import { portalBlockReason } from "../../game/portalInfo.ts";

/** Primeira missão: sem pedido, o guia acompanha ela até acabar ou o personagem passar deste level. */
export const GUIDE_QUEST = "rats_barn";
export const GUIDE_MAX_LEVEL = 3;

/** O que o jogador mandou guiar (botão "Guiar" do rastreador, diário, Quadro ou Agenda). */
export type GuideRequest =
  | { kind: "quest"; id: string }
  | { kind: "bounty"; monster: string }
  | { kind: "tile"; x: number; y: number; label: string }
  /** "Parar" explícito: desliga também o guia automático do novato (null = nenhum pedido, o automático vale). */
  | { kind: "off" };
/** Pedido que aponta para algum lugar. */
export type ActiveGuideRequest = Exclude<GuideRequest, { kind: "off" }>;

export interface GuideDest { x: number; y: number; label: string }

export interface GuideTarget extends GuideDest {
  /** Destino final (o minimapa marca este); x/y/label acima são para onde a seta aponta agora. */
  dest: GuideDest;
  /** Portal ou viagem no caminho, quando o destino fica noutra região (ou a viagem encurta a estrada). */
  hop?: WorldHop;
}

export interface GuideInput {
  level: number;
  quests: QuestsMsg | null;
  count: ItemCounter;
  request: GuideRequest | null;
  me: { x: number; y: number };
  index: WorldIndex | null;
}

type Pt = { x: number; y: number };

export function guideTarget(i: GuideInput): GuideTarget | null {
  const dest = guideDestination(i);
  if (!dest || !i.index) return dest ? { ...dest, dest } : null;
  // Pelas portas que o personagem abre; se o destino só se alcança por uma porta fechada, a seta leva até ela (o rótulo
  // vermelho explica o resto).
  const pass = canPassFor(i.level, i.quests);
  const hop = i.index.nextHop(i.me, dest, Number.isFinite(i.index.travelCost(i.me, dest, pass)) ? pass : undefined);
  return hop ? { x: hop.x, y: hop.y, label: `${dest.label}\n→ ${hop.label}`, dest, hop } : { ...dest, dest };
}

/** Portas que este personagem atravessa: a mesma regra do rótulo vermelho (portalBlockReason). */
export function canPassFor(level: number, quests: Pick<QuestsMsg, "done" | "chests"> | null): PortalFilter {
  return (p) => portalBlockReason(p, level, quests) === null;
}

/** Mesmo objeto sempre: o store do pedido efetivo só avisa quando ele muda de verdade. */
const NOVICE_REQUEST: ActiveGuideRequest = { kind: "quest", id: GUIDE_QUEST };

/** Pedido efetivo: o do jogador ou, sem pedido, a primeira missão do novato; "off" (Parar) desliga os dois. */
export function effectiveRequest(request: GuideRequest | null, level: number, quests: Pick<QuestsMsg, "done"> | null): ActiveGuideRequest | null {
  if (request) return request.kind === "off" ? null : request;
  if (!quests || level > GUIDE_MAX_LEVEL || quests.done.includes(GUIDE_QUEST)) return null;
  return NOVICE_REQUEST;
}

/** O botão "Guiar" deste pedido está ligado? Olha o pedido efetivo: o guia automático do novato também acende o botão. */
export function isGuiding(effective: ActiveGuideRequest | null, kind: "quest" | "bounty", id: string): boolean {
  if (!effective || effective.kind !== kind) return false;
  return effective.kind === "quest" ? effective.id === id : effective.kind === "bounty" && effective.monster === id;
}

/**
 * Pedido depois de clicar "Guiar"/"Guiando": desligar grava "off" explícito (com null o guia do novato voltava sozinho
 * para a primeira missão e a seta continuava).
 */
export function toggledRequest(effective: ActiveGuideRequest | null, kind: "quest" | "bounty", id: string): GuideRequest {
  if (isGuiding(effective, kind, id)) return { kind: "off" };
  return kind === "quest" ? { kind: "quest", id } : { kind: "bounty", monster: id };
}

/** O pedido já acabou (missão concluída, recompensa entregue ou trocada no dia)? Aí o guia se apaga sozinho. */
export function requestFinished(request: GuideRequest, quests: QuestsMsg | null): boolean {
  if (!quests || request.kind === "off") return false;
  if (request.kind === "quest") return quests.done.includes(request.id) || !questDef(request.id);
  if (request.kind === "bounty") return !quests.bounties.list.some((b) => b.monster === request.monster && b.status !== "done");
  return false;
}

export function guideDestination(i: GuideInput): GuideDest | null {
  const req = effectiveRequest(i.request, i.level, i.quests);
  if (!req) return null;
  if (req.kind === "tile") return { x: req.x, y: req.y, label: req.label };
  if (!i.quests || !i.index) return null;
  const pass = canPassFor(i.level, i.quests);
  if (req.kind === "bounty") {
    const b = i.quests.bounties.list.find((x) => x.monster === req.monster && x.status !== "done");
    if (!b) return null;
    const board = NPCS[BOUNTY_NPC]?.name ?? "Quadro de Recompensas";
    if (b.status === "open") return npcDest(i.index, BOUNTY_NPC, `${board} — aceite a recompensa`);
    if (b.progress >= b.count) return npcDest(i.index, BOUNTY_NPC, `${board} — receba a recompensa`);
    return monsterDest(i.index, req.monster, i.me, `Recompensa: ${MONSTERS[req.monster]?.name ?? req.monster}`, pass);
  }
  const def = questDef(req.id);
  return def ? questDest(def, i, pass) : null;
}

function questDest(def: QuestDef, i: GuideInput, pass: PortalFilter): GuideDest | null {
  const index = i.index!, st = i.quests!;
  const giver = NPCS[def.giver]?.name ?? def.giver;
  switch (questStatus(def, st, i.level, i.count)) {
    case "available": return npcDest(index, def.giver, `${giver} — pegue a missão`);
    case "ready": return npcDest(index, def.giver, `${giver} — entregue a missão`);
    case "active": {
      const a = st.active.find((x) => x.id === def.id);
      // Primeiro passo que falta e que dá para localizar (os passos correm em paralelo; a ordem é a do diário).
      for (const [k, s] of def.steps.entries()) {
        const stored = a?.progress[k] ?? 0;
        if (stepProgress(s, stored, i.count) >= s.count) continue;
        const d = stepDestination(s, index, i.me, i.count, pass);
        if (d) return d;
      }
      return null;
    }
    default: return null;
  }
}

/**
 * Onde fazer um passo de missão (NPC, zona, spawn de quem solta o item ou loja); null se não dá para localizar. `pass`:
 * portas que o personagem abre (o "mais perto" prefere o que dá para alcançar).
 */
export function stepDestination(s: QuestStep, index: WorldIndex, me: Pt, count: ItemCounter, pass?: PortalFilter): GuideDest | null {
  switch (s.kind) {
    case "kill":
    case "boss":
      return monsterDest(index, s.target, me, s.label, pass);
    case "talk":
      return npcDest(index, s.target, s.label);
    case "arena":
      return npcDest(index, "arena_master", s.label);
    case "explore":
      // Área que não se alcança a pé (sala do Crash Test, só pela alavanca): o passo diz para onde guiar.
      if (s.area) return s.guideAt ? { ...s.guideAt, label: s.label } : { x: Math.floor(s.area.x + s.area.w / 2), y: Math.floor(s.area.y + s.area.h / 2), label: s.label };
      return zoneDest(index, s.target, me, s.label, pass);
    case "collect":
    case "deliver": {
      // Entrega a outro NPC com os itens já na mochila: vai até ele.
      if (s.kind === "deliver" && s.npc && count(s.target) >= s.count) return npcDest(index, s.npc, `${NPCS[s.npc]?.name ?? s.npc} — entregue ${s.label}`);
      return itemDest(index, s.target, me, s.label, pass);
    }
  }
}

function npcDest(index: WorldIndex, npcId: string, label: string): GuideDest | null {
  const n = index.npcAt(npcId);
  return n ? { x: n.x, y: n.y, label } : null;
}

/**
 * O ponto mais "perto" (custo do índice: a pé + portais/viagens) entre os candidatos, só pelas portas que o personagem
 * abre (`pass`); se nenhum se alcança assim, por qualquer porta (a seta leva até a porta fechada, em vermelho).
 */
function nearest<T extends Pt>(index: WorldIndex, me: Pt, list: readonly T[], pass?: PortalFilter): T | null {
  const pick = (canPass?: PortalFilter): T | null => {
    let best: T | null = null, bestCost = Infinity;
    for (const c of list) {
      const cost = index.travelCost(me, c, canPass);
      if (cost < bestCost) { best = c; bestCost = cost; }
    }
    return best;
  };
  return pick(pass) ?? (pass ? pick() : null);
}

function monsterDest(index: WorldIndex, monsterId: string, me: Pt, label: string, pass?: PortalFilter): GuideDest | null {
  const s = nearest(index, me, index.spawnsOf(monsterId), pass);
  return s ? { x: s.x, y: s.y, label: s.zone ? `${label} — ${s.zone}` : label } : null;
}

/** Zona de "explorar": o spawn, NPC ou chegada de portal mais perto dentro dela (pontos andáveis); senão, o centro. */
function zoneDest(index: WorldIndex, zone: string, me: Pt, label: string, pass?: PortalFilter): GuideDest | null {
  const inZone: Pt[] = [];
  for (const id of Object.keys(MONSTERS)) for (const s of index.spawnsOf(id)) if (s.zone === zone) inZone.push(s);
  for (const n of index.npcs) if (n.zone === zone) inZone.push(n);
  for (const p of index.portals) if (p.zone === zone) inZone.push({ x: p.toX, y: p.toY });
  const best = nearest(index, me, inZone, pass);
  if (best) return { x: best.x, y: best.y, label };
  const r = index.zones.find((z) => z.name === zone)?.rects[0];
  return r ? { x: Math.floor((r.x0 + r.x1) / 2), y: Math.floor((r.y0 + r.y1) / 2), label } : null;
}

/** Quem solta o item (spawn mais perto) ou, se nenhum monstro solta, quem vende. */
function itemDest(index: WorldIndex, itemId: string, me: Pt, label: string, pass?: PortalFilter): GuideDest | null {
  const spawns = dropSources(itemId).flatMap((m) => index.spawnsOf(m).map((s) => ({ ...s, monster: m })));
  const s = nearest(index, me, spawns, pass);
  if (s) return { x: s.x, y: s.y, label: `${label} — ${MONSTERS[s.monster]?.name ?? s.monster}${s.zone ? ` (${s.zone})` : ""}` };
  const sellers = Object.values(NPCS).filter((n) => n.shop?.sells.some((e) => e.itemId === itemId)).flatMap((n) => {
    const at = index.npcAt(n.id);
    return at ? [{ ...at, name: n.name }] : [];
  });
  const shop = nearest(index, me, sellers, pass);
  return shop ? { x: shop.x, y: shop.y, label: `${label} — compre com ${shop.name}` } : null;
}

const dropCache = new Map<string, string[]>();
/** Monstros não-chefe que soltam o item (chefe só se ninguém mais solta). */
export function dropSources(itemId: string): string[] {
  let hit = dropCache.get(itemId);
  if (hit) return hit;
  const all = Object.values(MONSTERS).filter((m) => m.loot?.some((e) => e.itemId === itemId));
  const common = all.filter((m) => !m.boss);
  hit = (common.length ? common : all).map((m) => m.id);
  dropCache.set(itemId, hit);
  return hit;
}

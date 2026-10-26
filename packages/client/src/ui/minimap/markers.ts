// Marcadores do minimapa e do mapa-múndi (ciclo 17): serviços dos NPCs (templo, depot, loja, viagem, Quadro), "!"/"?" de
// missão, portais, destino do guia e marcadores pessoais. Puro (sem DOM): Minimap.tsx desenha, markerState.ts monta.
import { BOUNTY_NPC, NPCS, type InvasionState, type NpcDef, type NpcMarker, type WorldNpc, type WorldPortal } from "@lemonquest/shared";

export type MarkerKind = "temple" | "depot" | "shop" | "travel" | "board" | "quest" | "questReady" | "invasion" | "portal" | "guide" | "personal";

export interface MapMarker { kind: MarkerKind; x: number; y: number; label: string }

type Pt = { x: number; y: number };

/** Glifo, cor e texto da legenda. Ordem = ordem de desenho (o último fica por cima). */
export const MARKER_STYLE: Record<MarkerKind, { glyph: string; color: string; legend: string }> = {
  portal: { glyph: "◉", color: "#c9a8ff", legend: "Portal" },
  shop: { glyph: "$", color: "#7ee06d", legend: "Loja" },
  depot: { glyph: "▣", color: "#e0b872", legend: "Depot" },
  temple: { glyph: "✚", color: "#f5f0d0", legend: "Templo" },
  travel: { glyph: "⇄", color: "#6fc3ff", legend: "Viagem" },
  board: { glyph: "◆", color: "#ff9f43", legend: "Quadro de Recompensas" },
  quest: { glyph: "!", color: "#ffd447", legend: "Missão nova" },
  questReady: { glyph: "?", color: "#ffd447", legend: "Entregar missão" },
  invasion: { glyph: "⚔", color: "#ff5b52", legend: "Invasão da Vila" },
  guide: { glyph: "✦", color: "#ffd447", legend: "Destino do guia" },
  personal: { glyph: "⚑", color: "#ff6b6b", legend: "Seu marcador" },
};
export const MARKER_ORDER = Object.keys(MARKER_STYLE) as MarkerKind[];

/** Marcadores que aparecem mesmo em área não explorada (o resto só depois de visto). */
const ALWAYS_VISIBLE: ReadonlySet<MarkerKind> = new Set(["quest", "questReady", "invasion", "guide", "personal"]);

/** Serviço que o NPC marca no mapa (um por NPC: o mais útil para quem procura). */
export function npcService(def: NpcDef): MarkerKind | null {
  if (def.id === BOUNTY_NPC) return "board";
  if (def.travel?.length) return "travel";
  if (def.depot) return "depot";
  if (def.blessing) return "temple";
  if (def.shop) return "shop";
  return null;
}

export function serviceMarkers(npcs: readonly WorldNpc[]): MapMarker[] {
  return npcs.flatMap((n) => {
    const def = Object.hasOwn(NPCS, n.id) ? NPCS[n.id] : undefined;
    const kind = def ? npcService(def) : null;
    return def && kind ? [{ kind, x: n.x, y: n.y, label: def.name }] : [];
  });
}

/** "!" (missão para pegar) e "?" (para entregar/falar), os mesmos que aparecem sobre o NPC. */
export function questMarkers(npcs: readonly WorldNpc[], markerOf: (npcId: string) => NpcMarker): MapMarker[] {
  return npcs.flatMap((n) => {
    const m = markerOf(n.id);
    if (m !== "available" && m !== "ready") return [];
    const name = NPCS[n.id]?.name ?? n.id;
    return [{ kind: m === "available" ? "quest" : "questReady", x: n.x, y: n.y, label: m === "available" ? `${name}: missão nova` : `${name}: entregar` } as MapMarker];
  });
}

export function portalMarkers(portals: readonly WorldPortal[]): MapMarker[] {
  return portals.map((p) => ({ kind: "portal", x: p.x, y: p.y, label: p.label }));
}

export function guideMarkers(t: { dest: { x: number; y: number; label: string }; hop?: { x: number; y: number; label: string } } | null): MapMarker[] {
  if (!t) return [];
  const out: MapMarker[] = [{ kind: "guide", x: t.dest.x, y: t.dest.y, label: t.dest.label }];
  if (t.hop) out.push({ kind: "guide", x: t.hop.x, y: t.hop.y, label: `Caminho: ${t.hop.label}` });
  return out;
}

/** Invasão da Vila em andamento (ciclo 18): de onde as colunas saem e o líder elite enquanto vivo. */
export function invasionMarkers(s: Pick<InvasionState, "points" | "leader"> | null): MapMarker[] {
  if (!s) return [];
  const out: MapMarker[] = s.points.map((p) => ({ kind: "invasion", x: p.x, y: p.y, label: "Invasão: invasores saem daqui" }));
  const l = s.leader;
  if (l?.alive && Number.isFinite(l.x) && Number.isFinite(l.y)) out.push({ kind: "invasion", x: l.x!, y: l.y!, label: `Líder da invasão: ${l.name}` });
  return out;
}

export function personalMarkers(list: readonly Pt[]): MapMarker[] {
  return list.map((p) => ({ kind: "personal", x: p.x, y: p.y, label: `Seu marcador (${p.x}, ${p.y})` }));
}

/** Serviços e portais só aparecem onde o jogador já explorou; missão, guia e marcador pessoal sempre. */
export function visibleMarkers(list: readonly MapMarker[], explored: (x: number, y: number) => boolean): MapMarker[] {
  return list.filter((m) => ALWAYS_VISIBLE.has(m.kind) || explored(m.x, m.y));
}

/** Marcador mais perto de (x,y), a até `r` tiles (Chebyshev); empate: o desenhado por cima. */
export function markerNear(list: readonly MapMarker[], x: number, y: number, r: number): MapMarker | undefined {
  let best: MapMarker | undefined, bestD = Infinity;
  for (const m of list) {
    const d = Math.max(Math.abs(m.x - x), Math.abs(m.y - y));
    if (d > r) continue;
    if (d < bestD || (d === bestD && best && MARKER_ORDER.indexOf(m.kind) > MARKER_ORDER.indexOf(best.kind))) { best = m; bestD = d; }
  }
  return best;
}

export const MAX_PERSONAL_MARKERS = 20;

/** Clique direito no mapa-múndi: tira o marcador pessoal perto (até `r` tiles) ou põe um novo (o mais antigo sai se lotar). */
export function togglePersonal(list: readonly Pt[], x: number, y: number, r = 2): Pt[] {
  const i = list.findIndex((p) => Math.max(Math.abs(p.x - x), Math.abs(p.y - y)) <= r);
  if (i >= 0) return list.filter((_, j) => j !== i);
  return [...list, { x, y }].slice(-MAX_PERSONAL_MARKERS);
}

/** Lista salva no navegador: só pontos inteiros não negativos, sem passar do máximo. */
export function sanitizePersonal(v: unknown): Pt[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((p) => {
    const o = p as Record<string, unknown> | null;
    return o && Number.isInteger(o.x) && Number.isInteger(o.y) && (o.x as number) >= 0 && (o.y as number) >= 0 ? [{ x: o.x as number, y: o.y as number }] : [];
  }).slice(-MAX_PERSONAL_MARKERS);
}

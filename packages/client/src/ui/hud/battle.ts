// Battle list: entrada genérica + fontes externas (M2 publica monstros aqui).
import { createStore, type Unsubscribe } from "./store.ts";
import type { Target } from "./target.ts";
import type { PlayerSnap } from "./world.ts";

/**
 * Teto de distância (tiles, Chebyshev) da battle list. O filtro de verdade é a área do mapa visível na tela
 * (`setBattleView`, pedido do dono em 2026-11-01: "no máximo o que aparece na tela"); era 10 tiles em volta.
 */
export const BATTLE_RANGE = 20;

/** Retângulo de tiles visível (inclusive), fora do HUD. */
export interface TileRect { x0: number; y0: number; x1: number; y1: number }
let view: TileRect | null = null;
/** A cena publica a área visível; null = sem filtro de tela (só o teto). */
export function setBattleView(r: TileRect | null): void { view = r; }
export const inBattleView = (x: number, y: number): boolean =>
  !view || (x >= view.x0 && x <= view.x1 && y >= view.y0 && y <= view.y1);

export interface BattleEntry {
  id: string;
  name: string;
  /** 0..100 */
  hpPct: number;
  kind: "player" | "monster";
  /** Distância em tiles (Chebyshev) até o jogador local. */
  distance: number;
  /** Cor de destaque opcional (ex.: vocação). */
  color?: string;
  /** Criatura: dificuldade em texto (a cor do nome sozinha não serve para quem não distingue cores). */
  difficulty?: string;
  /** Criatura elite ("★" antes do nome; a cor continua a da dificuldade). */
  elite?: boolean;
  /** Criatura que chama o bando quando atacada (MonsterDef.pack): glifo ao lado do nome. */
  pack?: boolean;
  /** Jogador com a rota do Estagiário rodando: crachá antes do nome. */
  bot?: boolean;
}

/** Posição genérica de algo no mapa, para quem publica entradas a partir do estado. */
export interface Positioned { id: string; name: string; x: number; y: number; hp: number; maxHp: number; bot?: boolean }

export const chebyshev = (ax: number, ay: number, bx: number, by: number) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));

export const hpPct = (hp: number, max: number) => (max > 0 ? Math.max(0, Math.min(100, Math.round((hp / max) * 100))) : 0);

/** Fontes extras (ex.: "monsters") → entradas já calculadas. */
const sources = createStore<Record<string, BattleEntry[]>>({});
export const battleSourcesStore = sources;

/**
 * Publica/atualiza as entradas de uma fonte (ex.: setBattleEntries("monsters", lista)).
 * Use toBattleEntries() para filtrar por alcance e calcular distância.
 */
export function setBattleEntries(source: string, entries: BattleEntry[]): void {
  sources.set((s) => ({ ...s, [source]: entries }));
}
export function clearBattleEntries(source: string): void {
  sources.set((s) => { const n = { ...s }; delete n[source]; return n; });
}
export const subscribeBattleSources = (fn: () => void): Unsubscribe => sources.subscribe(fn);

/** Converte uma lista de coisas posicionadas em entradas dentro do alcance de (x,y). */
export function toBattleEntries(items: Iterable<Positioned>, kind: BattleEntry["kind"], me: { x: number; y: number }, range = BATTLE_RANGE): BattleEntry[] {
  const out: BattleEntry[] = [];
  for (const it of items) {
    const d = chebyshev(it.x, it.y, me.x, me.y);
    if (d <= range && inBattleView(it.x, it.y)) out.push({ id: it.id, name: it.name, hpPct: hpPct(it.hp, it.maxHp), kind, distance: d, ...(it.bot ? { bot: true } : {}) });
  }
  return out;
}

/** Monta a lista final: jogadores próximos (exceto eu) + fontes extras, ordenada por distância. */
export function buildBattleList(players: ReadonlyMap<string, PlayerSnap>, myId: string, extra: Record<string, BattleEntry[]>, range = BATTLE_RANGE): BattleEntry[] {
  const me = players.get(myId);
  if (!me) return [];
  const others = [...players.values()].filter((p) => p.id !== myId);
  // Rota do Estagiário rodando: a entrada leva `bot` e a lista mostra o crachá antes do nome (todos veem quem está no bot).
  const list = toBattleEntries(others, "player", me, range);
  for (const src of Object.values(extra)) list.push(...src.filter((e) => e.distance <= range));
  return list.sort((a, b) => a.distance - b.distance || a.name.localeCompare(b.name));
}

/**
 * Próximo alvo ao apertar Espaço: a criatura mais próxima; se já há uma mirada (e ainda está na lista), a próxima
 * dela em diante por distância, voltando ao início depois da última. Ignora jogadores (Espaço mira só bichos). Sem
 * bicho por perto, devolve o alvo atual (um jogador clicado continua selecionado; antes era apagado).
 */
export function nextBattleTarget(entries: readonly BattleEntry[], current: Target | null): Target | null {
  const foes = entries.filter((e) => e.kind === "monster");
  if (foes.length === 0) return current;
  const i = current ? foes.findIndex((e) => e.id === current.id) : -1;
  return { id: foes[(i + 1) % foes.length]!.id, kind: "monster" };
}

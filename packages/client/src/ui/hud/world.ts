// Espelho em objetos simples do estado sincronizado (room.state.players), para a UI.
// Notificações agrupadas por frame (rAF) para não re-renderizar a cada patch do Colyseus.
import { Callbacks, type Room } from "@colyseus/sdk";
import type { PlayerView } from "@lemonquest/shared";
import { session } from "../../session.ts";
import { createStore, selectStore } from "./store.ts";

export type PlayerSnap = Omit<PlayerView, "stepMs" | "seq">;

/** Mapa id → snapshot. Um novo objeto Map é publicado a cada frame com mudanças. */
export const playersStore = createStore<ReadonlyMap<string, PlayerSnap>>(new Map());

const snap = (p: PlayerView): PlayerSnap => ({
  id: p.id, name: p.name, vocation: p.vocation, level: p.level, x: p.x, y: p.y, dir: p.dir,
  hp: p.hp, maxHp: p.maxHp, mana: p.mana, maxMana: p.maxMana, xp: p.xp, targetId: p.targetId ?? "",
  magicLevel: p.magicLevel ?? 0, skillMelee: p.skillMelee ?? 10, skillDistance: p.skillDistance ?? 10, skillShield: p.skillShield ?? 10,
  magicPct: p.magicPct ?? 0, meleePct: p.meleePct ?? 0, distancePct: p.distancePct ?? 0, shieldPct: p.shieldPct ?? 0, speedPct: p.speedPct ?? 100, stance: p.stance ?? "balanced", chase: !!p.chase,
  auto: !!p.auto, followId: p.followId ?? "", skull: p.skull ?? "", blessed: !!p.blessed,
  outfit: p.outfit ?? "", addons: p.addons ?? 0, title: p.title ?? "", partyId: p.partyId ?? "", sex: p.sex === "f" ? "f" : "m",
});

let live = new Map<string, PlayerSnap>();
let scheduled = false;
function publish() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    playersStore.set(new Map(live));
  });
}

let bound: Room | null = null;
let disposers: (() => void)[] = [];

function bind(room: Room) {
  if (bound === room) return;
  for (const d of disposers) d();
  disposers = [];
  bound = room;
  live = new Map();
  const perPlayer = new Map<string, () => void>();
  // Estado do servidor não tem tipos no cliente: espelha PlayerView (shared/types.ts).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const $ = Callbacks.get(room as any) as any;
  disposers.push(
    $.onAdd("players", (p: PlayerView, id: string) => {
      live.set(id, snap(p));
      perPlayer.get(id)?.();
      perPlayer.set(id, $.onChange(p, () => { live.set(id, snap(p)); publish(); }));
      publish();
    }),
    $.onRemove("players", (_p: PlayerView, id: string) => {
      perPlayer.get(id)?.();
      perPlayer.delete(id);
      live.delete(id);
      publish();
    }),
    () => { for (const off of perPlayer.values()) off(); perPlayer.clear(); },
  );
  publish();
}

session.onRoom(bind);

/** Snapshot do jogador local (ou null antes de chegar o primeiro estado). */
export function selectMe(players: ReadonlyMap<string, PlayerSnap>): PlayerSnap | null {
  return players.get(session.myId) ?? null;
}

/**
 * Só o jogador local: avisa quando o snapshot dele muda (snap() cria objeto novo só para quem teve patch),
 * não quando outro jogador anda. Use no lugar de selectMe(useStore(playersStore)).
 */
export const meStore = selectStore(playersStore, selectMe);

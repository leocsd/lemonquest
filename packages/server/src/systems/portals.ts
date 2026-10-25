import { doorRequirement, findObjects, objectTile, type DoorRequirement, type TeleportedMsg, type TiledMap } from "@lemonquest/shared";
import type { PlayerState } from "../state.ts";
import type { MovementSystem } from "./movement.ts";
import { nearestFreeTile } from "../world/tiles.ts";

export const PORTAL_COOLDOWN_MS = 1000;

interface Dest { toX: number; toY: number; req?: DoorRequirement }

/**
 * Portais (objetos `portal` com toX/toY): ao PISAR no tile, teleporta. Porta de quest (portal com minLevel/quest/
 * chestGroup): quem não cumpre volta para o tile de onde veio e recebe o motivo.
 */
export class PortalSystem {
  private readonly portals = new Map<string, Dest>();
  private readonly last = new WeakMap<PlayerState, { x: number; y: number }>();
  private readonly cooldownUntil = new WeakMap<PlayerState, number>();

  constructor(
    tiled: TiledMap,
    private readonly movement: Pick<MovementSystem, "teleport">,
    private readonly send: (playerId: string, msg: TeleportedMsg) => void,
    private readonly now: () => number = Date.now,
    /** Tile livre para chegar (andável, sem monstro/NPC/jogador). Destino ocupado → tile livre mais próximo. */
    private readonly isFree?: (x: number, y: number, self: PlayerState) => boolean,
    /** Porta de quest: motivo de não passar (null = passa). Ausente = todas as portas abrem. */
    private readonly canPass?: (p: PlayerState, req: DoorRequirement) => string | null,
    /** Aviso ao bater numa porta fechada. */
    private readonly refuse?: (p: PlayerState, text: string) => void,
  ) {
    for (const o of findObjects(tiled, "portal")) {
      const num = (n: string) => Number(o.properties?.find((p) => p.name === n)?.value);
      const toX = num("toX"), toY = num("toY");
      if (!Number.isFinite(toX) || !Number.isFinite(toY)) continue;
      const t = objectTile(o, tiled.tilewidth);
      const req = doorRequirement(o);
      this.portals.set(`${t.x},${t.y}`, { toX, toY, ...(req ? { req } : {}) });
    }
  }

  /** Requisito da porta em (x,y), se for porta de quest. */
  requirement(x: number, y: number): DoorRequirement | undefined {
    return this.portals.get(`${x},${y}`)?.req;
  }

  /** Para a IA de monstros evitar pisar em portais. */
  isPortalTile(x: number, y: number): boolean {
    return this.portals.has(`${x},${y}`);
  }

  /** Destino do portal em (x,y), se houver (alcançabilidade). */
  destination(x: number, y: number): { x: number; y: number } | undefined {
    const d = this.portals.get(`${x},${y}`);
    return d ? { x: d.toX, y: d.toY } : undefined;
  }

  /** Chamar após o movimento, a cada tick. */
  check(p: PlayerState): void {
    const prev = this.last.get(p);
    this.last.set(p, { x: p.x, y: p.y });
    if (prev && prev.x === p.x && prev.y === p.y) return; // não mudou de tile
    const dest = this.portals.get(`${p.x},${p.y}`);
    if (!dest) return;
    // O requisito vem ANTES da espera: com a espera primeiro, pisar de novo na porta dentro de 1 s deixava o jogador
    // parado em cima dela (sem conferir nada) e ele atravessava a pé (porta lv 80 do Vulcão).
    const reason = dest.req && this.canPass ? this.canPass(p, dest.req) : null;
    if (reason !== null) {
      // Porta fechada: volta para o tile anterior (ou fica, se não houver um).
      this.refuse?.(p, reason);
      this.bounce(p, prev);
      return;
    }
    const now = this.now();
    // Na espera também volta: parado em cima de um portal, o passo seguinte atravessava a parede dele (a saída sem
    // level ao lado da porta lv 80 do Vulcão levava para dentro da área).
    if (now < (this.cooldownUntil.get(p) ?? 0)) { this.bounce(p, prev); return; }
    this.cooldownUntil.set(p, now + PORTAL_COOLDOWN_MS);
    const free = this.isFree;
    const to = (free && nearestFreeTile(dest.toX, dest.toY, (x, y) => free(x, y, p))) || { x: dest.toX, y: dest.toY };
    this.movement.teleport(p, to.x, to.y);
    this.last.set(p, to);
    this.send(p.id, to);
  }

  /** Devolve ao tile anterior (se houver um que não seja portal); sem ele, fica onde está. */
  private bounce(p: PlayerState, prev: { x: number; y: number } | undefined): void {
    if (!prev || this.portals.has(`${prev.x},${prev.y}`)) return;
    this.movement.teleport(p, prev.x, prev.y);
    this.last.set(p, prev);
    this.send(p.id, prev);
  }
}

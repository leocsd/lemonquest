// Portas de sala (ciclo 22; regras em shared/data/doors.ts). Usar = ficar a até DOOR_RANGE e mandar
// C2S.UseQuestObject { kind: "door" }.
// - Porta comum: abre/fecha para todos (CollisionGrid.setWalkable) e avisa todo mundo (S2C.Doors). Não fecha com alguém
//   (jogador ou monstro) em cima.
// - Porta de level/missão: quem cumpre o requisito dá um passo para dentro dela (o passo normal, com a duração do chão);
//   ela continua parede para a colisão, então ninguém entra a pé, e "fecha" sozinha quando ele sai (o cliente a desenha
//   aberta enquanto há alguém nela). Quem não cumpre recebe o motivo e fica onde está.
import { DOOR_RANGE, S2C, doorSides, type CollisionGrid, type DoorRequirement, type DoorSpot, type DoorsMsg, type NoticeMsg } from "@lemonquest/shared";
import type { PlayerState } from "../state.ts";
import type { MovementSystem } from "./movement.ts";

const cheb = (ax: number, ay: number, bx: number, by: number) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));

export interface DoorSystemOptions {
  doors: DoorSpot[];
  grid: CollisionGrid;
  movement: Pick<MovementSystem, "stepInto">;
  /** Há criatura (jogador vivo, monstro ou NPC) no tile, fora `selfId`. */
  occupied: (x: number, y: number, selfId?: string) => boolean;
  /** Motivo de não passar (null = passa): a mesma regra das bocas de caverna (doorBlockReason). */
  canPass: (p: PlayerState, req: DoorRequirement) => string | null;
  send: (playerId: string, type: string, msg: unknown) => void;
  broadcast: (type: string, msg: unknown) => void;
  now?: () => number;
}

export class DoorSystem {
  private readonly byId = new Map<string, DoorSpot>();
  private readonly byTile = new Map<string, DoorSpot>();
  private readonly open = new Set<string>();
  private readonly now: () => number;

  constructor(private readonly o: DoorSystemOptions) {
    this.now = o.now ?? Date.now;
    for (const d of o.doors) { this.byId.set(d.id, d); this.byTile.set(`${d.x},${d.y}`, d); }
  }

  get list(): readonly DoorSpot[] { return this.o.doors; }

  /** A grade de colisão de quem anda (a mesma do MovementSystem), com as portas comuns abertas liberadas. */
  get grid(): Pick<CollisionGrid, "width" | "height" | "isWalkable"> { return this.o.grid; }


  isDoorTile(x: number, y: number): boolean { return this.byTile.has(`${x},${y}`); }

  doorAt(x: number, y: number): DoorSpot | undefined { return this.byTile.get(`${x},${y}`); }

  isOpen(id: string): boolean { return this.open.has(id); }

  /** Estado das portas comuns (ao entrar e ao reconectar). */
  message(): DoorsMsg { return { open: [...this.open] }; }

  sendTo(playerId: string): void { this.o.send(playerId, S2C.Doors, this.message()); }

  /** Usar a porta `id` (mensagem do cliente ou o Estagiário). true = abriu, fechou ou entrou nela. */
  use(p: PlayerState, id: string): boolean {
    if (p.hp <= 0) return false;
    const d = this.byId.get(String(id));
    if (!d) return false;
    if (cheb(p.x, p.y, d.x, d.y) > DOOR_RANGE) { this.notice(p, "Chegue mais perto da porta."); return false; }
    if (d.req) return this.enterGated(p, d);
    const here = p.x === d.x && p.y === d.y;
    if (this.open.has(d.id)) {
      if (here || this.o.occupied(d.x, d.y, p.id)) { this.notice(p, "Tem alguém na porta."); return false; }
      this.setOpen(d, false);
      return true;
    }
    this.setOpen(d, true);
    return true;
  }

  private enterGated(p: PlayerState, d: DoorSpot): boolean {
    if (p.x === d.x && p.y === d.y) return false; // já está nela: sai andando para um dos lados
    const reason = this.o.canPass(p, d.req!);
    if (reason !== null) { this.notice(p, reason); return false; }
    if (this.o.occupied(d.x, d.y, p.id)) { this.notice(p, "Tem alguém na porta."); return false; }
    // Só de um dos lados (ou na diagonal deles): da quina da parede não se entra numa porta.
    const sides = doorSides(d, (x, y) => this.o.grid.isWalkable(x, y));
    if (!sides.some((s) => cheb(s.x, s.y, p.x, p.y) <= 1 && (s.x === p.x || s.y === p.y))) { this.notice(p, "Fique na frente da porta."); return false; }
    const r = this.o.movement.stepInto(p, d.x, d.y, this.now());
    if (r === "busy") return false; // no meio de um passo: o clique pendente (cliente) ou o próximo tick tenta de novo
    return r === "ok";
  }

  private setOpen(d: DoorSpot, open: boolean): void {
    if (open) this.open.add(d.id); else this.open.delete(d.id);
    this.o.grid.setWalkable(d.x, d.y, open);
    this.o.broadcast(S2C.Doors, this.message());
  }

  private notice(p: PlayerState, text: string): void {
    this.o.send(p.id, S2C.Notice, { text, kind: "warn" } satisfies NoticeMsg);
  }
}

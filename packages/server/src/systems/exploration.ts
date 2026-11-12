import { ExploredMask, type ExploredMsg } from "@lemonquest/shared";
import type { CharacterRecord } from "../persistence/types.ts";

/** `seen` = quantos tiles ALCANÇÁVEIS a máscara já tem (mantido a cada revelação: o % não varre o mapa). */
interface Entry { mask: ExploredMask; x: number; y: number; seen: number }

/** Máscaras de exploração (fog of war do minimapa) por jogador. Autoridade + persistência. */
export class ExplorationSystem {
  private entries = new Map<string, Entry>();
  /** 1 byte por tile (1 = alcançável a partir do spawn); sem ele o % fica 0. */
  private reachable: Uint8Array | null = null;
  private reachableTotal = 0;

  constructor(private readonly width: number, private readonly height: number) {}

  /**
   * Tiles alcançáveis (conquistas de exploração). Antes o % varria as ~374 mil células do mapa por jogador a cada 5 s
   * (20-11); agora a contagem é feita uma vez na entrada e somada a cada tile novo revelado.
   */
  setReachable(reachable: Uint8Array): void {
    this.reachable = reachable;
    let total = 0;
    for (let i = 0; i < reachable.length; i++) if (reachable[i]) total++;
    this.reachableTotal = total;
    for (const e of this.entries.values()) e.seen = this.countSeen(e.mask);
  }

  private countSeen(mask: ExploredMask): number {
    const r = this.reachable;
    if (!r) return 0;
    let seen = 0;
    for (let i = 0; i < r.length; i++) if (r[i] && (mask.bits[i >> 3]! & (1 << (i & 7))) !== 0) seen++;
    return seen;
  }

  private reveal(e: Entry, x: number, y: number): number {
    const r = this.reachable;
    return e.mask.reveal(x, y, undefined, r ? (i) => { if (r[i]) e.seen++; } : undefined);
  }

  /** Cria a máscara a partir do registro, revela ao redor de (x,y) e devolve a mensagem para o cliente. */
  addPlayer(sessionId: string, rec: CharacterRecord, x: number, y: number): ExploredMsg {
    const mask = ExploredMask.fromBase64(this.width, this.height, rec.data.explored, rec.data.exploredW);
    const e: Entry = { mask, x, y, seen: this.countSeen(mask) };
    this.reveal(e, x, y);
    this.entries.set(sessionId, e);
    return { width: this.width, height: this.height, bits: mask.toBase64() };
  }

  /** Chamar a cada tick (barato): só revela quando o tile mudou. Retorna true se revelou tiles novos. */
  onPosition(sessionId: string, x: number, y: number): boolean {
    const e = this.entries.get(sessionId);
    if (!e || (e.x === x && e.y === y)) return false;
    e.x = x;
    e.y = y;
    return this.reveal(e, x, y) > 0;
  }

  /** Mensagem com a máscara atual (reenvio após reconexão). */
  message(sessionId: string): ExploredMsg | undefined {
    const e = this.entries.get(sessionId);
    return e ? { width: this.width, height: this.height, bits: e.mask.toBase64() } : undefined;
  }

  /** % (0–100) dos tiles ALCANÇÁVEIS já explorados (ver setReachable). */
  percent(sessionId: string): number {
    const e = this.entries.get(sessionId);
    if (!e || !this.reachableTotal) return 0;
    return (e.seen * 100) / this.reachableTotal;
  }

  /** Largura do mapa (salva junto com a máscara para detectar mudança de largura). */
  get mapWidth(): number { return this.width; }

  serialize(sessionId: string): string | undefined {
    return this.entries.get(sessionId)?.mask.toBase64();
  }

  removePlayer(sessionId: string) {
    this.entries.delete(sessionId);
  }
}

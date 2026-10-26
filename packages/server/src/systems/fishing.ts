// Pesca: com a Vara de Pesca na mochila, botão direito num tile de água (até 5 tiles) lança a linha. Depois de 5 s sem
// se mexer nem apanhar, o peixe morde (ou escapa). Quanto mais peixes já pescou, maior a chance. Recasta é manual.
// Baú do Pescador (ciclo 18): a cada FISHER_CHEST_EVERY peixes, um Baú de Recompensa (o prêmio sai pelo level ao abrir).
import { BOUNTY_CHEST_ID, S2C, itemDef, type FishCastMsg, type FishMsg, type ItemInstance, type NoticeMsg } from "@lemonquest/shared";
import type { PlayerState } from "../state.ts";
import { makeItem, type InventorySystem } from "./inventory.ts";

export const FISH_ROD = "fishing_rod";
export const FISH_CAST_MS = 5000;
export const FISH_RANGE = 5;
/** Chance de morder: base + bônus por peixe já pescado (teto 90%). */
export const FISH_BASE_CHANCE = 0.55;
export const FISH_PER_CATCH = 0.002;
export const FISH_MAX_CHANCE = 0.9;
/** Peixes (na ordem do sorteio): fatia de probabilidade de cada um; o resto é truta. */
export const FISH_GOLDEN_PCT = 0.04;
export const FISH_SALMON_PCT = 0.26;
/** Baú do Pescador: um Baú de Recompensa a cada tantos peixes pescados (25, 50, 75...). */
export const FISHER_CHEST_EVERY = 25;

interface Cast { x: number; y: number; px: number; py: number; hp: number; endsAt: number }

export interface FishingHost {
  getPlayer(id: string): PlayerState | undefined;
  send(id: string, type: string, msg: unknown): void;
  broadcast(type: string, msg: unknown): void;
  isWater(x: number, y: number): boolean;
  inventory: Pick<InventorySystem, "countItem" | "addItem" | "roomFor">;
  /** Peixes já pescados por este personagem. */
  caught(id: string): number;
  /** Pescou `itemId` (conquistas e contador). */
  onCatch(p: PlayerState, itemId: string): void;
  inArena(id: string): boolean;
  /** Baú do Pescador sem espaço na mochila vai ao chão; false/ausente = perdido. */
  placeLoot?(p: PlayerState, item: ItemInstance): boolean;
  rng?: () => number;
  now?(): number;
}

const cheb = (p: PlayerState, x: number, y: number) => Math.max(Math.abs(p.x - x), Math.abs(p.y - y));
const isInt = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n);

/** Chance de morder para quem já pescou `caught` peixes. */
export const biteChance = (caught: number): number => Math.min(FISH_MAX_CHANCE, FISH_BASE_CHANCE + Math.max(0, caught) * FISH_PER_CATCH);

/** Qual peixe veio (r em [0,1)). */
export function rollFish(r: number): "golden_fish" | "salmon" | "trout" {
  if (r < FISH_GOLDEN_PCT) return "golden_fish";
  if (r < FISH_GOLDEN_PCT + FISH_SALMON_PCT) return "salmon";
  return "trout";
}

export class FishingSystem {
  private readonly casts = new Map<string, Cast>();

  constructor(private readonly o: FishingHost) {}

  private now() { return this.o.now?.() ?? Date.now(); }
  private rng() { return (this.o.rng ?? Math.random)(); }
  private notice(id: string, text: string, kind: NoticeMsg["kind"] = "info") { this.o.send(id, S2C.Notice, { text, kind } satisfies NoticeMsg); }
  private bobber(id: string, x: number, y: number, ms: number) { this.o.broadcast(S2C.FishCast, { id, x, y, ms } satisfies FishCastMsg); }

  /** C2S.Fish. */
  onMessage(p: PlayerState, m: FishMsg): void {
    if (!m || !isInt(m.x) || !isInt(m.y)) return;
    if (p.hp <= 0) return;
    if (this.casts.has(p.id)) { this.notice(p.id, "Você já está pescando.", "warn"); return; }
    if (this.o.inventory.countItem(p.id, FISH_ROD) < 1) { this.notice(p.id, "Você precisa de uma Vara de Pesca (o Velho Caçador Tomé vende).", "warn"); return; }
    if (!this.o.isWater(m.x, m.y)) { this.notice(p.id, "Aqui não tem água.", "warn"); return; }
    if (cheb(p, m.x, m.y) > FISH_RANGE) { this.notice(p.id, "Chegue mais perto da água.", "warn"); return; }
    if (this.o.inArena(p.id)) { this.notice(p.id, "Não dá para pescar no Coliseu.", "warn"); return; }
    if (this.o.inventory.roomFor(p.id, "trout") < 1) { this.notice(p.id, "Sua mochila está cheia: abra espaço para o peixe.", "warn"); return; }
    this.casts.set(p.id, { x: m.x, y: m.y, px: p.x, py: p.y, hp: p.hp, endsAt: this.now() + FISH_CAST_MS });
    this.bobber(p.id, m.x, m.y, FISH_CAST_MS);
    this.notice(p.id, "Você lança a linha… fique parado.");
  }

  /** Cancela (mexeu, apanhou, saiu). */
  private cancel(id: string, why?: string) {
    const c = this.casts.get(id);
    if (!c) return;
    this.casts.delete(id);
    this.bobber(id, c.x, c.y, 0);
    if (why) this.notice(id, why, "warn");
  }

  tick(): void {
    if (this.casts.size === 0) return;
    const now = this.now();
    for (const [id, c] of [...this.casts]) {
      const p = this.o.getPlayer(id);
      if (!p || p.hp <= 0) { this.cancel(id); continue; }
      if (p.x !== c.px || p.y !== c.py) { this.cancel(id, "Você se mexeu: a linha se soltou."); continue; }
      if (p.hp < c.hp) { this.cancel(id, "Você foi atingido: a linha se soltou."); continue; }
      c.hp = Math.max(c.hp, p.hp);
      if (this.o.inArena(id)) { this.cancel(id); continue; }
      if (now >= c.endsAt) this.resolve(p, c);
    }
  }

  private resolve(p: PlayerState, c: Cast) {
    this.casts.delete(p.id);
    this.bobber(p.id, c.x, c.y, 0);
    if (this.rng() >= biteChance(this.o.caught(p.id))) { this.notice(p.id, "O peixe escapou…", "warn"); return; }
    const id = rollFish(this.rng());
    const left = this.o.inventory.addItem(p, makeItem(id, 1));
    if (left > 0) { this.notice(p.id, "O peixe pulou da mochila cheia e fugiu!", "warn"); return; }
    this.o.onCatch(p, id);
    this.notice(p.id, `Você pescou: ${itemDef(id)?.name ?? id}!`, "good");
    const total = this.o.caught(p.id);
    if (total > 0 && total % FISHER_CHEST_EVERY === 0) this.fisherChest(p, total);
  }

  /** Baú do Pescador: marco de FISHER_CHEST_EVERY peixes (o contador já inclui o peixe de agora). */
  private fisherChest(p: PlayerState, total: number) {
    const chest = makeItem(BOUNTY_CHEST_ID, 1);
    const where = this.o.inventory.addItem(p, chest) <= 0 ? "" : this.o.placeLoot?.(p, chest) ? " Mochila cheia: ele caiu no chão." : " Mochila cheia: ele se perdeu.";
    this.o.send(p.id, S2C.Notice, {
      text: `🎣 Baú do Pescador: ${total} peixes pescados! Você ganhou um Baú de Recompensa (use para abrir).${where}`,
      kind: where ? "warn" : "good", log: true,
    } satisfies NoticeMsg);
  }

  removePlayer(id: string): void { this.cancel(id); }

  /** Está com a linha na água (testes). */
  casting(id: string): boolean { return this.casts.has(id); }
}

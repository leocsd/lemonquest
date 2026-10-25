// Comida estilo Tibia: comer concede/estende o estado "alimentado" (condição "fed"): a cada FOOD_TICK_MS o jogador
// recupera hpPerTick de vida e manaPerTick de mana (dentro e fora de combate, somado à regen normal).
// Regra (shared/itemRules.ts blendFood): duração soma, limitada a FOOD_MAX_MS; taxas = média ponderada pelo tempo.
// As taxas podem ser fracionárias: o resto de cada tick acumula (carry) e entra inteiro no tick em que completa 1.
import { FOOD_MAX_MS, FOOD_TICK_MS, blendFood, type ConditionsMsg } from "@lemonquest/shared";
import type { PlayerState } from "../state.ts";
import type { CharacterData } from "../persistence/types.ts";

/** Folga do teto: a menos de 10 s do máximo já conta como "satisfeito" (senão o teto exato nunca seria atingido). */
const FULL_MARGIN_MS = 10_000;

export interface FoodEffect { hpPerTick: number; manaPerTick: number; durationMs: number }

interface Fed { until: number; hpPerTick: number; manaPerTick: number; nextTickAt: number; hpCarry: number; manaCarry: number }

export interface FoodOptions {
  /** Cura (evento "heal"); só chamado quando há vida a recuperar. */
  heal: (p: PlayerState, amount: number) => void;
  /** Mana (evento "mana"); só chamado quando há mana a recuperar. */
  restoreMana: (p: PlayerState, amount: number) => void;
}

export class FoodSystem {
  private readonly fed = new Map<string, Fed>();

  constructor(private readonly o: FoodOptions) {}

  /** Come. Retorna false (sem consumir) se já está no teto de tempo (satisfeito). */
  eat(p: PlayerState, food: FoodEffect, now: number): boolean {
    const cur = this.fed.get(p.id);
    const remaining = cur ? Math.max(0, cur.until - now) : 0;
    if (remaining >= FOOD_MAX_MS - FULL_MARGIN_MS) return false;
    const b = blendFood(cur && remaining > 0 ? { ...cur, remainingMs: remaining } : undefined, food, FOOD_MAX_MS);
    this.fed.set(p.id, {
      until: now + b.remainingMs,
      hpPerTick: b.hpPerTick,
      manaPerTick: b.manaPerTick,
      nextTickAt: cur ? cur.nextTickAt : now + FOOD_TICK_MS,
      hpCarry: cur?.hpCarry ?? 0,
      manaCarry: cur?.manaCarry ?? 0,
    });
    return true;
  }

  tick(now: number, players: Iterable<PlayerState>): void {
    for (const p of players) {
      const f = this.fed.get(p.id);
      if (!f) continue;
      while (now >= f.nextTickAt && f.nextTickAt <= f.until) {
        f.nextTickAt += FOOD_TICK_MS;
        f.hpCarry += f.hpPerTick;
        f.manaCarry += f.manaPerTick;
        // Folga de 1e-6 contra o ruído do ponto flutuante (0,5 + 0,5 tem de dar 1 inteiro).
        const hp = Math.floor(f.hpCarry + 1e-6), mana = Math.floor(f.manaCarry + 1e-6);
        f.hpCarry -= hp;
        f.manaCarry -= mana;
        if (p.hp <= 0) continue;
        if (hp > 0 && p.hp < p.maxHp) this.o.heal(p, hp);
        if (mana > 0 && p.mana < p.maxMana) this.o.restoreMana(p, mana);
      }
      if (now >= f.until) this.fed.delete(p.id);
    }
  }

  /** Entrada da lista de condições (S2C.Conditions), se alimentado. Taxa arredondada: é o que a dica mostra. */
  condition(id: string, now: number): ConditionsMsg["list"][number] | undefined {
    const f = this.fed.get(id);
    if (!f || now >= f.until) return undefined;
    return { id: "fed", remainingMs: f.until - now, value: shown(f.hpPerTick), value2: shown(f.manaPerTick) };
  }

  remainingMs(id: string, now: number): number {
    const f = this.fed.get(id);
    return f ? Math.max(0, f.until - now) : 0;
  }

  load(id: string, data: CharacterData | undefined, now: number): void {
    const f = data?.fed;
    if (!f || !(f.remainingMs > 0)) { this.fed.delete(id); return; }
    // Taxas fracionárias (média de comidas) voltam como estão; lixo vira 0.
    const rate = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? Math.max(0, n) : 0);
    this.fed.set(id, {
      until: now + Math.min(FOOD_MAX_MS, f.remainingMs),
      hpPerTick: rate(f.hpPerTick), manaPerTick: rate(f.manaPerTick),
      nextTickAt: now + FOOD_TICK_MS, hpCarry: 0, manaCarry: 0,
    });
  }

  serialize(id: string, now: number): CharacterData["fed"] {
    const f = this.fed.get(id);
    if (!f || now >= f.until) return undefined;
    return { remainingMs: f.until - now, hpPerTick: f.hpPerTick, manaPerTick: f.manaPerTick };
  }

  removePlayer(id: string): void {
    this.fed.delete(id);
  }
}

/** Taxa mostrada no ícone (inteira): mistura com taxa entre 0 e 0,5 ainda regenera, então mostra 1 e não 0. */
function shown(rate: number): number {
  return rate > 0 ? Math.max(1, Math.round(rate)) : 0;
}

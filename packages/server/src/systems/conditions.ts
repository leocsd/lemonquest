// Condições (buffs/debuffs) por criatura (jogador ou monstro), com duração e valor opcional.
// Efeitos: haste/slow/rooted (velocidade), protect (−% dano), manashield, regen (cura/1 s),
// burn/poison/energy/bleed/freeze (dano a cada 2 s), taunted (monstro forçado a atacar quem provocou).
// O jogador recebe S2C.Conditions sempre que a lista dele muda (inclui "combat" e "pz", calculados aqui).
import { S2C, type ConditionId, type ConditionsMsg, type DamageKind } from "@lemonquest/shared";
import type { PlayerState } from "../state.ts";
import type { CombatSystem } from "./combat.ts";
import type { MonsterManager } from "./monsters.ts";

/** Intervalo dos danos contínuos (value = dano por tique). */
export const DOT_INTERVAL_MS = 2000;
/** Intervalo da cura de "regen" (value = cura por tique). */
export const REGEN_TICK_MS = 1000;
export const MIN_SPEED_PCT = 20;
export const MAX_SPEED_PCT = 300;

/** Condições de dano contínuo e o tipo de dano de cada uma. */
export const DOT_KIND: Partial<Record<ConditionId, DamageKind>> = {
  burn: "fire", poison: "earth", energy: "energy", bleed: "physical", freeze: "ice",
};
/** Nome em português para o aviso de morte ("X foi derrotado por veneno"), em vez do id interno. */
export const DOT_LABEL: Partial<Record<ConditionId, string>> = {
  burn: "queimadura", poison: "veneno", energy: "choque elétrico", bleed: "sangramento", freeze: "congelamento",
};

interface Cond {
  id: ConditionId;
  until: number;
  value: number;
  sourceId: string;
  nextTickAt: number;
}

export interface ConditionOptions {
  monsters: MonsterManager;
  combat: Pick<CombatSystem, "damageMonster" | "damagePlayer" | "healPlayer" | "inCombat">;
  getPlayer: (id: string) => PlayerState | undefined;
  players: () => Iterable<PlayerState>;
  send: (sessionId: string, type: string, msg: unknown) => void;
  /** Bônus de velocidade (%) do equipamento do jogador, somado ao haste. */
  speedBonus?: (playerId: string) => number;
  /** Condições extras do jogador mantidas fora daqui (ex.: "fed" da comida). */
  extra?: (p: PlayerState, now: number) => ConditionsMsg["list"][number] | undefined;
}

/** Velocidade resultante (100 = normal; 0 = enraizado). */
export function speedFrom(rooted: boolean, haste: number, slow: number): number {
  if (rooted) return 0;
  return Math.max(MIN_SPEED_PCT, Math.min(MAX_SPEED_PCT, Math.round(100 + haste - slow)));
}

export class ConditionSystem {
  private readonly byId = new Map<string, Map<ConditionId, Cond>>();
  private readonly sentSig = new Map<string, string>();

  constructor(private readonly o: ConditionOptions) {}

  /** Aplica (ou renova) uma condição. Reaplicar substitui duração e valor. */
  apply(targetId: string, id: ConditionId, durationMs: number, value: number | undefined, sourceId: string, now: number): void {
    if (!targetId || !(durationMs > 0)) return;
    if (!this.o.getPlayer(targetId) && !this.o.monsters.get(targetId)) return;
    let map = this.byId.get(targetId);
    if (!map) { map = new Map(); this.byId.set(targetId, map); }
    const interval = id === "regen" ? REGEN_TICK_MS : DOT_KIND[id] ? DOT_INTERVAL_MS : 0;
    const prev = map.get(id);
    // Não rebaixa: uma condição mais forte ainda ativa fica (a Muralha de Escudos de 20% do grupo não apaga a Pele de
    // Ferro de 30% do cavaleiro; uma Luz Restauradora fraca não troca uma regen mais forte).
    if (prev && prev.until > now && prev.value > Math.max(0, value ?? 0)) return;
    map.set(id, {
      id, until: now + durationMs, value: Math.max(0, value ?? 0), sourceId,
      // Renovar não reinicia o relógio dos tiques (evita tique duplo ou perdido).
      nextTickAt: prev && interval ? prev.nextTickAt : now + interval,
    });
    this.refresh(targetId);
  }

  remove(targetId: string, id: ConditionId): void {
    const map = this.byId.get(targetId);
    if (map?.delete(id)) this.refresh(targetId);
  }

  /** Remove todas (morte, saída). */
  clear(targetId: string): void {
    if (!this.byId.delete(targetId)) return;
    this.refresh(targetId);
  }

  removePlayer(id: string): void {
    this.byId.delete(id);
    this.sentSig.delete(id);
  }

  has(targetId: string, id: ConditionId): boolean {
    return this.byId.get(targetId)?.has(id) ?? false;
  }

  value(targetId: string, id: ConditionId): number {
    return this.byId.get(targetId)?.get(id)?.value ?? 0;
  }

  /** Redução de dano recebido (%) — protect. */
  damageTakenPct(targetId: string): number {
    return this.value(targetId, "protect");
  }

  manaShield(targetId: string): boolean {
    return this.has(targetId, "manashield");
  }

  tick(now: number): void {
    for (const [tid, map] of this.byId) {
      const p = this.o.getPlayer(tid);
      const m = p ? undefined : this.o.monsters.get(tid);
      if (!p && !m) { this.byId.delete(tid); continue; }
      let changed = false;
      for (const c of map.values()) {
        const kind = DOT_KIND[c.id];
        if ((kind || c.id === "regen") && now >= c.nextTickAt && c.nextTickAt <= c.until) {
          c.nextTickAt += kind ? DOT_INTERVAL_MS : REGEN_TICK_MS;
          if (c.value > 0) {
            if (c.id === "regen") { if (p) this.o.combat.healPlayer(p, c.sourceId || tid, c.value); }
            else if (m) this.o.combat.damageMonster(m, c.sourceId, c.value, kind!, now);
            else if (p) this.o.combat.damagePlayer(p, c.sourceId, c.value, kind!, now, { killerName: DOT_LABEL[c.id] ?? c.id });
          }
          // O dano pode ter matado/limpado a criatura.
          if (this.byId.get(tid) !== map) break;
        }
        if (now >= c.until) { map.delete(c.id); changed = true; }
      }
      if (map.size === 0) this.byId.delete(tid);
      if (changed) this.refresh(tid);
    }
  }

  /** Envia S2C.Conditions aos jogadores cuja lista (incluindo combat/pz) mudou. Chamar a cada tick. */
  sync(now: number): void {
    for (const p of this.o.players()) {
      const list = this.listFor(p, now);
      const sig = list.map((c) => `${c.id}:${c.value ?? ""}:${c.remainingMs === undefined ? "" : now + c.remainingMs}`).join("|");
      if (this.sentSig.get(p.id) === sig) continue;
      this.sentSig.set(p.id, sig);
      this.o.send(p.id, S2C.Conditions, { list } satisfies ConditionsMsg);
    }
  }

  listFor(p: PlayerState, now: number): ConditionsMsg["list"] {
    const list: ConditionsMsg["list"] = [];
    if (this.o.combat.inCombat(p.id, now)) list.push({ id: "combat" });
    if (this.o.monsters.inPz(p.x, p.y)) list.push({ id: "pz" });
    for (const c of this.byId.get(p.id)?.values() ?? []) {
      list.push(c.value ? { id: c.id, remainingMs: Math.max(0, c.until - now), value: c.value } : { id: c.id, remainingMs: Math.max(0, c.until - now) });
    }
    const extra = this.o.extra?.(p, now);
    if (extra) list.push(extra);
    return list;
  }

  /** Recalcula a velocidade do jogador (equipamento mudou). */
  refreshPlayer(id: string): void {
    this.refresh(id);
  }

  /** Recalcula efeitos derivados (velocidade, provocação). */
  private refresh(tid: string): void {
    const map = this.byId.get(tid);
    const p = this.o.getPlayer(tid);
    const bonus = p ? this.o.speedBonus?.(tid) ?? 0 : 0;
    const speed = speedFrom(!!map?.has("rooted"), (map?.get("haste")?.value ?? 0) + bonus, map?.get("slow")?.value ?? 0);
    if (p) { p.speedPct = speed; return; }
    const m = this.o.monsters.get(tid);
    if (!m) return;
    m.speedPct = speed;
    const t = map?.get("taunted");
    m.tauntBy = t ? t.sourceId : "";
    m.tauntUntil = t ? t.until : 0;
  }
}

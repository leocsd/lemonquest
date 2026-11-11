// Desafios da semana: progresso = ganho desde a linha de base da semana (systems/weekly.ts); resgate manual, uma vez por
// desafio por semana. Tudo ou nada: sem espaço na mochila para TODOS os itens juntos, nada é entregue.
import {
  CHALLENGES, CHALLENGE_BONUS, S2C, challengeDef, challengeTarget, levelForXp, weekEndsAt, weekGain, weekId,
  type ChallengeActionMsg, type ChallengeReward, type ChallengesMsg, type ItemInstance, type NoticeMsg,
} from "@lemonquest/shared";
import type { CharacterRecord } from "../persistence/types.ts";
import type { PlayerState } from "../state.ts";
import { GOLD_ID, makeItem, maxStackOf, newUid, type InventorySystem } from "./inventory.ts";
import { weeklyCounters } from "./weekly.ts";

export interface ChallengeHost {
  getPlayer(id: string): PlayerState | undefined;
  record(id: string): CharacterRecord | undefined;
  send(id: string, type: string, msg: unknown): void;
  inventory: Pick<InventorySystem, "get" | "defs" | "addItem" | "addGold">;
  /** Sobra que não coube na mochila (não deveria acontecer: `fits` confere antes) vai ao chão; false = perdida. */
  placeLoot?(p: PlayerState, item: ItemInstance): boolean;
  gainXp(p: PlayerState, amount: number): void;
  save(id: string): void;
  now?(): number;
}

type State = NonNullable<CharacterRecord["data"]["challenges"]>;

export class ChallengeSystem {
  constructor(private readonly o: ChallengeHost) {}

  private now() { return this.o.now?.() ?? Date.now(); }
  private notice(id: string, text: string, kind: NoticeMsg["kind"] = "info") { this.o.send(id, S2C.Notice, { text, kind } satisfies NoticeMsg); }

  /**
   * Estado da semana atual (zera na virada, guardando o level do começo da semana para a meta de XP). O level vem da
   * linha de base da semana (weekly.ts), gravada pela sala no 1º login da semana e na virada com o jogador online, e
   * não de quando o cliente abre a janela: antes, quem subia de level antes de abrir ganhava uma meta maior. Estado já
   * criado nesta semana com o level errado é corrigido aqui. Sem linha de base desta semana (a virada da sala roda 1×
   * por minuto), vale o level atual.
   */
  private state(rec: CharacterRecord, level: number): State {
    const w = weekId(new Date(this.now()));
    const base = rec.data.week?.id === w ? levelForXp(rec.data.week.xp) : undefined;
    const s = rec.data.challenges;
    if (s && s.week === w) {
      if (base !== undefined) s.level = base;
      return s;
    }
    return (rec.data.challenges = { week: w, level: base ?? level, claimed: [], bonus: false });
  }

  view(p: PlayerState): ChallengesMsg | null {
    const rec = this.o.record(p.id);
    if (!rec) return null;
    const st = this.state(rec, p.level);
    const w = weekId(new Date(this.now()));
    const cur = weeklyCounters(rec);
    return {
      weekEndsAt: weekEndsAt(new Date(this.now())),
      goals: CHALLENGES.map((d) => {
        const target = challengeTarget(d, st.level);
        return {
          id: d.id, name: d.name, desc: d.desc.replace("{n}", target.toLocaleString("pt-BR")), target,
          progress: Math.min(target, weekGain(rec.data.week, cur, w, d.key)), claimed: st.claimed.includes(d.id), reward: d.reward,
        };
      }),
      bonus: { reward: CHALLENGE_BONUS, claimed: st.bonus },
    };
  }

  push(p: PlayerState) {
    const v = this.view(p);
    if (v) this.o.send(p.id, S2C.Challenges, v);
  }

  onMessage(p: PlayerState, m: ChallengeActionMsg): void {
    if (!m || typeof m !== "object") return;
    if (m.action === "list") { this.push(p); return; }
    if (m.action === "claim") { this.claim(p, String(m.id ?? "")); return; }
    if (m.action === "claimBonus") this.claimBonus(p);
  }

  /** Todos os itens cabem JUNTOS? Simula numa cópia da mochila (dois itens diferentes não contam o mesmo espaço vazio). */
  private fits(p: PlayerState, r: ChallengeReward): boolean {
    const inv = this.o.inventory.get(p.id);
    if (!inv) return false;
    const slots = inv.backpack.map((it) => (it ? { defId: it.defId, count: it.count } : null));
    for (const i of r.items ?? []) {
      const d = this.o.inventory.defs(i.itemId);
      if (!d || d.id === GOLD_ID) continue;
      const max = maxStackOf(d);
      let left = i.count;
      if (d.stackable) {
        for (const s of slots) {
          if (!s || s.defId !== d.id || s.count >= max) continue;
          const mv = Math.min(left, max - s.count);
          s.count += mv;
          left -= mv;
        }
      }
      for (let k = 0; k < slots.length && left > 0; k++) {
        if (slots[k]) continue;
        const n = Math.min(left, max);
        slots[k] = { defId: d.id, count: n };
        left -= n;
      }
      if (left > 0) return false;
    }
    return true;
  }

  private give(p: PlayerState, r: ChallengeReward) {
    if (r.gold) this.o.inventory.addGold(p, r.gold);
    if (r.xp) this.o.gainXp(p, r.xp);
    let fell = 0, lost = 0;
    for (const i of r.items ?? []) {
      const it = makeItem(i.itemId, i.count);
      const left = this.o.inventory.addItem(p, it);
      if (left <= 0) continue;
      if (this.o.placeLoot?.(p, { ...it, uid: newUid(), count: left })) fell++; else lost++;
    }
    if (fell) this.notice(p.id, `Mochila cheia: ${fell === 1 ? "1 item da recompensa caiu" : `${fell} itens da recompensa caíram`} no chão.`, "warn");
    if (lost) this.notice(p.id, `Mochila cheia: ${lost === 1 ? "1 item da recompensa perdido" : `${lost} itens da recompensa perdidos`}.`, "warn");
  }

  private claim(p: PlayerState, id: string) {
    const rec = this.o.record(p.id);
    const def = challengeDef(id);
    if (!rec || !def || p.hp <= 0) return;
    const st = this.state(rec, p.level);
    if (st.claimed.includes(id)) { this.notice(p.id, "Você já resgatou este desafio.", "warn"); return; }
    const target = challengeTarget(def, st.level);
    if (weekGain(rec.data.week, weeklyCounters(rec), weekId(new Date(this.now())), def.key) < target) { this.notice(p.id, "Desafio ainda não concluído.", "warn"); return; }
    if (!this.fits(p, def.reward)) { this.notice(p.id, "Sua mochila está cheia: abra espaço para a recompensa.", "warn"); return; }
    st.claimed.push(id);
    this.give(p, def.reward);
    this.notice(p.id, `Desafio cumprido: ${def.name}!`, "good");
    this.o.save(p.id);
    this.push(p);
  }

  private claimBonus(p: PlayerState) {
    const rec = this.o.record(p.id);
    if (!rec || p.hp <= 0) return;
    const st = this.state(rec, p.level);
    if (st.bonus) { this.notice(p.id, "Você já resgatou o bônus da semana.", "warn"); return; }
    if (!CHALLENGES.every((d) => st.claimed.includes(d.id))) { this.notice(p.id, "Resgate os três desafios para liberar o bônus.", "warn"); return; }
    if (!this.fits(p, CHALLENGE_BONUS)) { this.notice(p.id, "Sua mochila está cheia: abra espaço para a recompensa.", "warn"); return; }
    st.bonus = true;
    this.give(p, CHALLENGE_BONUS);
    this.notice(p.id, "Bônus da semana resgatado!", "good");
    this.o.save(p.id);
    this.push(p);
  }
}

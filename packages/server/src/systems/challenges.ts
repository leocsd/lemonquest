// Desafios da semana: os 3 sorteados da semana (data/challenges.ts); progresso = ganho desde a linha de base da semana
// (systems/weekly.ts). Resgate manual, uma vez por desafio por semana, com aviso ao cumprir; o que ficou cumprido e sem
// resgate na virada é pago sozinho (weekly.ts guarda em `pending`, o tick paga com o jogador no mundo). No resgate
// manual é tudo ou nada: sem espaço na mochila para TODOS os itens juntos, nada é entregue.
import {
  S2C, challengeBonus, challengeDef, challengeGain, challengeReward, challengeTarget, levelForXp, weekChallenges, weekEndsAt,
  weekId, type ChallengeActionMsg, type ChallengeReward, type ChallengesMsg, type ItemInstance, type NoticeMsg,
} from "@lemonquest/shared";
import type { CharacterRecord } from "../persistence/types.ts";
import type { PlayerState } from "../state.ts";
import { GOLD_ID, makeItem, maxStackOf, newUid, type InventorySystem } from "./inventory.ts";
import { challengeCounters, settleChallenges } from "./weekly.ts";

/** Intervalo da passada do tick (aviso de cumprido e pagamento da virada). */
export const CHALLENGE_CHECK_MS = 2000;

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
  private nextCheck = 0;
  /** Sessões que já receberam o estado nesta conexão. */
  private readonly sent = new Set<string>();

  constructor(private readonly o: ChallengeHost) {}

  private now() { return this.o.now?.() ?? Date.now(); }
  private notice(id: string, text: string, kind: NoticeMsg["kind"] = "info", log = false) {
    this.o.send(id, S2C.Notice, (log ? { text, kind, log } : { text, kind }) satisfies NoticeMsg);
  }

  /**
   * Estado da semana atual (zera na virada, guardando o level do começo da semana para meta e prêmio). O level vem da
   * linha de base da semana (weekly.ts), gravada pela sala no 1º login da semana e na virada com o jogador online, e
   * não de quando o cliente abre a janela: antes, quem subia de level antes de abrir ganhava uma meta maior. Estado já
   * criado nesta semana com o level errado é corrigido aqui. Sem linha de base desta semana (a virada da sala roda 1×
   * por minuto), vale o level atual; a semana que acabou é fechada aqui antes (settleChallenges), senão os resgates
   * dela se perdiam com o estado e a virada da sala pagaria de novo. Prêmios ainda não pagos passam para o estado novo.
   */
  private state(rec: CharacterRecord, level: number): State {
    const w = weekId(new Date(this.now()));
    const base = rec.data.week?.id === w ? levelForXp(rec.data.week.xp) : undefined;
    let s = rec.data.challenges;
    if (s && s.week === w) {
      if (base !== undefined) s.level = base;
      return s;
    }
    if (s && rec.data.week?.id === s.week) { settleChallenges(rec); s = rec.data.challenges; }
    const fresh: State = { week: w, level: base ?? level, claimed: [], bonus: false };
    if (s?.pending?.length) fresh.pending = s.pending;
    if (s?.settled) fresh.settled = s.settled;
    return (rec.data.challenges = fresh);
  }

  private progress(rec: CharacterRecord, key: Parameters<typeof challengeGain>[3]): number {
    return challengeGain(rec.data.week, challengeCounters(rec), weekId(new Date(this.now())), key);
  }

  view(p: PlayerState): ChallengesMsg | null {
    const rec = this.o.record(p.id);
    if (!rec) return null;
    const st = this.state(rec, p.level);
    const w = weekId(new Date(this.now()));
    return {
      weekEndsAt: weekEndsAt(new Date(this.now())),
      goals: weekChallenges(w).map((d) => {
        const target = challengeTarget(d, st.level);
        return {
          id: d.id, name: d.name, desc: d.desc.replace("{n}", target.toLocaleString("pt-BR")), target,
          progress: Math.min(target, this.progress(rec, d.key)), claimed: st.claimed.includes(d.id), reward: challengeReward(d, st.level),
        };
      }),
      bonus: { reward: challengeBonus(st.level), claimed: st.bonus },
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

  /**
   * Passada a cada CHALLENGE_CHECK_MS: paga os prêmios da virada e avisa (uma vez) cada desafio da semana que acabou de
   * ser cumprido. A primeira passada depois do login também cria o estado da semana (level do 1º login).
   */
  tick(now: number, players: Iterable<PlayerState>): void {
    if (now < this.nextCheck) return;
    this.nextCheck = now + CHALLENGE_CHECK_MS;
    const online = new Set<string>();
    for (const p of players) {
      online.add(p.id);
      if (p.hp <= 0) continue;
      const rec = this.o.record(p.id);
      if (!rec) continue;
      const st = this.state(rec, p.level);
      let changed = !this.sent.has(p.id); // 1ª passada da sessão: o cliente recebe o estado (ponto no trilho)
      if (st.pending?.length) { this.payPending(p, st); changed = true; }
      if (this.checkDone(p, rec, st)) changed = true;
      if (changed) { this.sent.add(p.id); this.push(p); }
    }
    // Quem saiu deixa de contar (sem gancho de saída: a lista se limpa sozinha).
    for (const id of this.sent) if (!online.has(id)) this.sent.delete(id);
  }

  /** Reconexão: a próxima passada manda o estado de novo (o cliente zerou o dele). */
  forget(id: string): void { this.sent.delete(id); }

  /** Avisa os desafios recém-cumpridos; true = houve algum. */
  private checkDone(p: PlayerState, rec: CharacterRecord, st: State): boolean {
    const fresh = weekChallenges(st.week).filter((d) =>
      !st.claimed.includes(d.id) && !st.notified?.includes(d.id) && this.progress(rec, d.key) >= challengeTarget(d, st.level));
    if (!fresh.length) return false;
    (st.notified ??= []).push(...fresh.map((d) => d.id));
    for (const d of fresh) this.notice(p.id, `Desafio da semana cumprido: ${d.name}! Resgate o prêmio na janela de desafios (trilho à direita).`, "good", true);
    return true;
  }

  /** Resgate automático da virada: entrega tudo (o que não couber vai ao chão, como nas outras recompensas). */
  private payPending(p: PlayerState, st: State) {
    const list = st.pending ?? [];
    delete st.pending;
    for (const e of list) {
      const names: string[] = [];
      for (const id of e.ids) {
        const d = challengeDef(id);
        if (!d) continue;
        this.give(p, challengeReward(d, e.level));
        names.push(d.name);
      }
      if (e.bonus) { this.give(p, challengeBonus(e.level)); names.push("bônus da semana"); }
      if (names.length) this.notice(p.id, `Resgate automático da semana passada: ${names.join(", ")}.`, "good", true);
    }
    this.o.save(p.id);
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
    if (!weekChallenges(st.week).some((d) => d.id === id)) { this.notice(p.id, "Este desafio não é desta semana.", "warn"); return; }
    if (st.claimed.includes(id)) { this.notice(p.id, "Você já resgatou este desafio.", "warn"); return; }
    if (this.progress(rec, def.key) < challengeTarget(def, st.level)) { this.notice(p.id, "Desafio ainda não concluído.", "warn"); return; }
    const reward = challengeReward(def, st.level);
    if (!this.fits(p, reward)) { this.notice(p.id, "Sua mochila está cheia: abra espaço para a recompensa.", "warn"); return; }
    st.claimed.push(id);
    this.give(p, reward);
    this.notice(p.id, `Desafio cumprido: ${def.name}!`, "good");
    this.o.save(p.id);
    this.push(p);
  }

  private claimBonus(p: PlayerState) {
    const rec = this.o.record(p.id);
    if (!rec || p.hp <= 0) return;
    const st = this.state(rec, p.level);
    if (st.bonus) { this.notice(p.id, "Você já resgatou o bônus da semana.", "warn"); return; }
    if (!weekChallenges(st.week).every((d) => st.claimed.includes(d.id))) { this.notice(p.id, "Resgate os três desafios para liberar o bônus.", "warn"); return; }
    const reward = challengeBonus(st.level);
    if (!this.fits(p, reward)) { this.notice(p.id, "Sua mochila está cheia: abra espaço para a recompensa.", "warn"); return; }
    st.bonus = true;
    this.give(p, reward);
    this.notice(p.id, "Bônus da semana resgatado!", "good");
    this.o.save(p.id);
    this.push(p);
  }
}

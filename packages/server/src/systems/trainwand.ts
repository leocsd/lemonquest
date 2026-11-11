// Varinha de Treino (NPC, ciclo 18): acelera uma skill por N "horas de treino". Ao contrário de um buff comum, essas
// horas não correm no relógio normal: só descontam enquanto o jogador de fato bate/lança magia naquela skill (parado,
// ou trocando de alvo, não gasta nada). Cada tentativa desconta o tempo real desde a tentativa anterior, com um teto
// (TRAIN_STEP_CAP_MS) pra um alvo longe/trocado não comer minutos à toa. Sem persistência: cai no logout, como as
// outras condições temporárias (haste, poison...).
import { SKILLS, TRAIN_CONDITION, trainBoostMult, type ConditionsMsg, type SkillId } from "@lemonquest/shared";

/** Maior intervalo contado de uma vez entre duas tentativas (perto do PLAYER_ATTACK_MS). */
export const TRAIN_STEP_CAP_MS = 2000;

interface Active { pct: number; leftMs: number; lastAt: number }

export class TrainWandSystem {
  private readonly byId = new Map<string, Partial<Record<SkillId, Active>>>();

  /** Uso da varinha: ativa (ou renova, se o novo % não for menor) o boost desta skill por `hours` de treino efetivo. */
  apply(playerId: string, skill: SkillId, pct: number, hours: number, now: number): void {
    let m = this.byId.get(playerId);
    if (!m) { m = {}; this.byId.set(playerId, m); }
    const prev = m[skill];
    if (prev && prev.leftMs > 0 && prev.pct > pct) return; // não rebaixa um boost mais forte ainda ativo
    m[skill] = { pct, leftMs: Math.max(0, hours) * 3_600_000, lastAt: now };
  }

  /** Multiplicador de tentativas (shared/skills.ts) do boost ativo nesta skill; 1 = nenhum. */
  mult(playerId: string, skill: SkillId): number {
    return trainBoostMult(this.byId.get(playerId)?.[skill]?.pct ?? 0);
  }

  /** Uma tentativa de treino nesta skill: desconta o tempo real desde a última (com teto) e acaba quando zera. */
  consume(playerId: string, skill: SkillId, now: number): void {
    const m = this.byId.get(playerId);
    const a = m?.[skill];
    if (!a) return;
    a.leftMs -= Math.min(TRAIN_STEP_CAP_MS, Math.max(0, now - a.lastAt));
    a.lastAt = now;
    if (a.leftMs <= 0) delete m![skill];
  }

  /** Entrada da faixa de condições (ConditionOptions.extra): um selo por skill com boost ativo. */
  condition(playerId: string): ConditionsMsg["list"][number][] {
    const m = this.byId.get(playerId);
    if (!m) return [];
    const out: ConditionsMsg["list"][number][] = [];
    for (const skill of SKILLS) {
      const a = m[skill];
      if (a) out.push({ id: TRAIN_CONDITION[skill], value: Math.ceil(a.leftMs / 60_000) });
    }
    return out;
  }

  removePlayer(id: string): void {
    this.byId.delete(id);
  }
}

// Aviso com a aba em segundo plano: título com contador. Puro (sem DOM) para poder testar.
import type { CombatEvent } from "@lemonquest/shared";

/**
 * "(3) The Lemon Quest" — sem contador, o título normal. `alert` (combate, ciclo 18) vai na frente enquanto a aba
 * não for vista: "⚠ Vida baixa! (3) The Lemon Quest".
 */
export function attentionTitle(base: string, count: number, alert = ""): string {
  const t = count > 0 ? `(${count > 9 ? "9+" : count}) ${base}` : base;
  return alert ? `${alert} ${t}` : t;
}

/** O que merece chamar a atenção de quem está em outra aba. */
export type AttentionReason = "whisper" | "trade" | "party" | "friend" | "event" | "eventSoon" | "attacked" | "lowHp" | "died";

/** Marca no título para os avisos de combate; a mais grave fica até a aba ser vista. */
const ALERTS: Partial<Record<AttentionReason, { text: string; rank: number }>> = {
  attacked: { text: "⚔ Atacado!", rank: 1 },
  lowHp: { text: "⚠ Vida baixa!", rank: 2 },
  died: { text: "☠ Você morreu!", rank: 3 },
};

/** Marca do título depois do aviso `reason`, partindo da atual `cur` (nunca troca uma mais grave por uma mais leve). */
export function nextAlert(cur: string, reason: AttentionReason): string {
  const a = ALERTS[reason];
  if (!a) return cur;
  const rank = Object.values(ALERTS).find((x) => x!.text === cur)?.rank ?? 0;
  return a.rank >= rank ? a.text : cur;
}

/** Notificações do servidor que contam como "amigo entrou/saiu" (ver systems/social.ts). */
export const isFriendNotice = (text: string): boolean => /\(amigo\)/.test(text);

/**
 * Intervalo mínimo entre dois avisos de combate na aba: apanhar sem parar não sobe o contador a cada golpe. A vida
 * baixa tem o seu próprio intervalo e fura o do "atacado".
 */
export const COMBAT_ATTENTION_MS = 15_000;
/** Vida baixa = até esta fração da vida máxima. */
export const LOW_HP_FRAC = 0.3;

export interface CombatAttentionState { at: number; lowAt: number }
export const freshCombatAttention = (): CombatAttentionState => ({ at: -Infinity, lowAt: -Infinity });

/** Algum golpe do lote mirou o jogador `me` (dano, erro ou escudo de mana; curas e poções não contam)? */
export function hitsMe(events: readonly CombatEvent[] | undefined, me: string): boolean {
  if (!Array.isArray(events) || !me) return false;
  return events.some((e) => e?.targetId === me && e.sourceId !== me && e.kind !== "heal" && (e.amount > 0 || !!e.miss));
}

/** Golpe recebido com a aba escondida: qual aviso dar (ou nenhum). Atualiza `st` no lugar. */
export function combatAttention(st: CombatAttentionState, hp: number, maxHp: number, now: number): AttentionReason | null {
  if (maxHp > 0 && hp > 0 && hp / maxHp <= LOW_HP_FRAC && now - st.lowAt >= COMBAT_ATTENTION_MS) {
    st.lowAt = st.at = now;
    return "lowHp";
  }
  if (now - st.at >= COMBAT_ATTENTION_MS) {
    st.at = now;
    return "attacked";
  }
  return null;
}

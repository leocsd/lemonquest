// Textos do encantamento (faixa de condições e Dona Marta). Sem dependência de UI (testável).
// O tempo é de combate PvE (só corre lutando contra monstro), por isso nunca vira relógio em tempo real no cliente.
import { imbuementDef, imbuementName, isImbuementTier } from "@lemonquest/shared";

const minutesOf = (ms: number): number => Math.max(0, Math.ceil(ms / 60_000));

/** Tempo de combate restante por extenso: "7h 30min", "7h", "45min". */
export function fmtImbueLeft(ms: number): string {
  const min = minutesOf(ms);
  const h = Math.floor(min / 60), m = min % 60;
  if (!h) return `${m}min`;
  return m ? `${h}h ${m}min` : `${h}h`;
}

/** Selo no ícone da faixa (cabe nos 24 px): horas cheias ("7h") ou minutos ("45m"). */
export function fmtImbueBadge(ms: number): string {
  const min = minutesOf(ms);
  return min >= 60 ? `${Math.floor(min / 60)}h` : `${min}m`;
}

/** Dica do ícone "imbued" (ConditionsMsg: value = minutos, value2 = tier, effect). */
export function imbuedDetail(effect: string | undefined, tier: number | undefined, minutes: number): string {
  const def = imbuementDef(effect);
  const name = def ? imbuementName(def.effect, isImbuementTier(tier) ? tier : 1) : "Encantamento";
  return `${name} · ${fmtImbueLeft(minutes * 60_000)} de combate`;
}

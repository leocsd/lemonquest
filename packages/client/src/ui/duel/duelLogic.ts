// Textos do duelo (puros, testados em duelLogic.test.ts).
import { DUEL_MODE_LABEL, type DuelInvite, type DuelResult, type DuelState } from "@lemonquest/shared";

/** "0:05" / "2:31" */
export function duelClock(until: number, now: number): string {
  const s = Math.max(0, Math.ceil((until - now) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const names = (list: { name: string; out: boolean }[]) => list.map((f) => (f.out ? `${f.name} (fora)` : f.name)).join(" e ");

/** "Duelo 1×1: Ana × Bia · começa em 0:04" / "… · 2:31" */
export function duelBarText(s: DuelState, now: number): string {
  const vs = `${names(s.mine)} × ${names(s.theirs)}`;
  const when = s.phase === "countdown" ? `começa em ${duelClock(s.until, now)}` : duelClock(s.until, now);
  return `Duelo ${DUEL_MODE_LABEL[s.mode]}: ${vs} · ${when}`;
}

export function duelInviteText(i: DuelInvite): string {
  return i.partners ? `te desafiou para um duelo ${DUEL_MODE_LABEL[i.mode]} (${i.partners}).` : `te desafiou para um duelo ${DUEL_MODE_LABEL[i.mode]}.`;
}

export function duelResultText(r: DuelResult): string {
  const why = r.reason === "time" ? " no tempo" : r.reason === "forfeit" ? " por desistência" : "";
  const head = r.won === null ? "Empate" : r.won ? "Vitória" : "Derrota";
  return `Duelo ${DUEL_MODE_LABEL[r.mode]} contra ${r.opponents}: ${head}${why}.`;
}

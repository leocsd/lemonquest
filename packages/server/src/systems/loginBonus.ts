// Bônus por dias seguidos: o primeiro login de cada "dia de jogo" (troca às 6h de Brasília, como as recompensas diárias)
// dá um prêmio pequeno; entrar em dias seguidos sobe a sequência (ciclo de 7 dias); faltar um dia útil volta ao dia 1.
// Ciclo 18: sábado e domingo não contam como falta (o jogo é do escritório) e o prêmio escala com o level (ouro como
// nos desafios da semana; poção na maior faixa que o level já bebe).
import { S2C, potionForLevel, prizeFor, type ChallengePrize, type ChallengeReward, type NoticeMsg } from "@lemonquest/shared";
import type { CharacterRecord } from "../persistence/types.ts";
import type { PlayerState } from "../state.ts";
import { bountyDay } from "./bounties.ts";
import { makeItem, type InventorySystem } from "./inventory.ts";

/** Prêmio de cada dia do ciclo para o level 1 (dia 7 é o maior); `food` = itens fixos (comida sem level). */
export const LOGIN_REWARDS: readonly (Partial<ChallengePrize> & { food?: { itemId: string; count: number }[] })[] = [
  { gold: 50 },
  { potion: { kind: "heal", count: 3 } },
  { gold: 100 },
  { potion: { kind: "mana", count: 3 } },
  { gold: 200 },
  { potion: { kind: "heal", count: 5 }, food: [{ itemId: "meat", count: 3 }] },
  { gold: 500, potion: { kind: "heal", count: 3 } },
];

export interface LoginState { day: string; streak: number }

/** Prêmio concreto do dia da sequência para o level (ouro escalado, poção dentro do level). */
export function rewardForStreak(streak: number, level = 1): ChallengeReward {
  const d = LOGIN_REWARDS[(Math.max(1, streak) - 1) % LOGIN_REWARDS.length]!;
  const r: ChallengeReward = d.gold ? prizeFor({ gold: d.gold }, level) : {};
  const items = [...(d.potion ? [{ itemId: potionForLevel(d.potion.kind, level), count: d.potion.count }] : []), ...(d.food ?? [])];
  if (items.length) r.items = items;
  return r;
}

const parseDay = (day: string): Date => {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d));
};
const fmtDay = (t: Date): string =>
  `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;

/** Dia de jogo anterior a `day` ("2026-10-15" → "2026-10-14"). */
export function previousDay(day: string): string {
  const t = parseDay(day);
  t.setUTCDate(t.getUTCDate() - 1);
  return fmtDay(t);
}

/** Sábado ou domingo (dia de jogo "AAAA-MM-DD"). */
export const isWeekendDay = (day: string): boolean => [0, 6].includes(parseDay(day).getUTCDay());

/**
 * Entrar em `today` continua a sequência que parou em `last`? Sim se todos os dias entre os dois forem sábado ou
 * domingo (sexta → segunda segue; quinta → segunda quebra). Dia igual ou no futuro (relógio voltou) não continua.
 */
export function continuesStreak(last: string, today: string): boolean {
  if (last >= today) return false;
  let d = previousDay(today);
  for (let i = 0; i < 3 && d > last; i++) {
    if (!isWeekendDay(d)) return false;
    d = previousDay(d);
  }
  return d <= last;
}

/** Próximo estado ao entrar em `today`; `fresh` = é o primeiro login deste dia (dá o prêmio). */
export function nextLoginState(prev: LoginState | undefined, today: string): { state: LoginState; fresh: boolean } {
  if (prev?.day === today) return { state: prev, fresh: false };
  const streak = prev && continuesStreak(prev.day, today) ? prev.streak + 1 : 1;
  return { state: { day: today, streak }, fresh: true };
}

export interface LoginBonusHost {
  send(id: string, type: string, msg: unknown): void;
  inventory: Pick<InventorySystem, "roomFor" | "addItem" | "addGold">;
  now?(): number;
}

/**
 * Chamado ao entrar no mundo (depois do inventário carregado). Atualiza a sequência e entrega o prêmio do dia.
 * Sem espaço na mochila para algum item, ele é pulado (o ouro sempre entra) e o aviso diz isso.
 */
export function grantLoginBonus(host: LoginBonusHost, p: PlayerState, rec: Pick<CharacterRecord, "data">): { streak: number; fresh: boolean } {
  const today = bountyDay(host.now?.() ?? Date.now());
  const { state, fresh } = nextLoginState(rec.data.login, today);
  rec.data.login = state;
  if (!fresh) return { streak: state.streak, fresh };
  const r = rewardForStreak(state.streak, p.level);
  if (r.gold) host.inventory.addGold(p, r.gold);
  const skipped: string[] = [];
  for (const i of r.items ?? []) {
    if (host.inventory.roomFor(p.id, i.itemId) >= i.count) host.inventory.addItem(p, makeItem(i.itemId, i.count));
    else skipped.push(i.itemId);
  }
  const day = ((state.streak - 1) % LOGIN_REWARDS.length) + 1;
  const text = `Bônus de login — dia ${day} de ${LOGIN_REWARDS.length} (sequência: ${state.streak}). Volte amanhã para o próximo (o fim de semana não quebra a sequência).` +
    (skipped.length ? " Faltou espaço na mochila para parte do prêmio." : "");
  host.send(p.id, S2C.Notice, { text, kind: skipped.length ? "warn" : "good", log: true } satisfies NoticeMsg);
  return { streak: state.streak, fresh };
}

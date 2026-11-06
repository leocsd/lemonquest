// Chefe de raide (2026-11-06, pedido do dono: "mais coisas para fazermos juntos"). Um evento semanal da Agenda
// (`raid` no GameEventDef, shared/data/events.ts) convoca um chefe gigante ao norte da Vila, no ponto de invasão do
// norte. Ele é feito para o escritório inteiro ao mesmo tempo, de qualquer level:
// - a VIDA cresce com quem chega para lutar (soma dos levels de quem está engajado) e nunca diminui;
// - o DANO acompanha o MENOR level engajado: o lv 20 consegue ficar na luta junto com o lv 150;
// - o PRÊMIO é por tempo engajado (bater em algo do raide ou curar alguém na área), não por dano: quem tem level baixo
//   ganha o mesmo baú que o mais forte.
// Dados e contas puras; o servidor está em server/systems/raid.ts.
import { MONSTERS } from "./monsters.ts";

/** Chefes de raide, em rodízio pela semana ISO (semanas seguidas trocam de chefe). */
export const RAID_BOSSES: readonly string[] = ["raid_auditor", "raid_impressora"];
/** Ponto do mapa (`invasion_point`) onde o chefe nasce: ao norte da Vila, fora da PZ. */
export const RAID_POINT = "invasion_n";
/** O chefe e os ajudantes ficam confinados a este raio (tiles) em volta do ponto. */
export const RAID_BOUNDS = 12;
/** Área do raide: quem está até isto do ponto (e fora da PZ) conta como presente e pode se engajar. */
export const RAID_AREA = 16;

/** Level de referência dos dados do chefe (dano em MONSTERS é o do lv de referência). */
export const RAID_REF_LEVEL = 60;
/** Faixa do multiplicador de dano pelo menor level engajado (lv 15 → ×0,25; lv 120+ → ×2). */
export const RAID_DMG_MIN = 0.25;
export const RAID_DMG_MAX = 2;
/** Multiplicador de dano do chefe para o menor level engajado. */
export function raidDamageMult(minLevel: number): number {
  const L = Number.isFinite(minLevel) && minLevel > 0 ? minLevel : RAID_REF_LEVEL;
  return Math.min(RAID_DMG_MAX, Math.max(RAID_DMG_MIN, L / RAID_REF_LEVEL));
}

/**
 * Vida do chefe: base + RAID_HP_PER_LEVEL × soma dos levels engajados. Calibrada para ~5 minutos de luta: um lv 60 bate
 * ~350/s em alvo único (balanceKit), 350 × 300 s ≈ 105 mil ≈ 1.750 × 60. A base segura o raide de 1 pessoa só.
 */
export const RAID_BASE_HP = 20_000;
export const RAID_HP_PER_LEVEL = 1_750;
export function raidBossHp(levels: Iterable<number>): number {
  let sum = 0;
  for (const l of levels) if (Number.isFinite(l) && l > 0) sum += Math.floor(l);
  return RAID_BASE_HP + RAID_HP_PER_LEVEL * sum;
}

/** Fatia de tempo do engajamento (ms): bater/curar em qualquer momento da fatia conta a fatia inteira. */
export const RAID_SLICE_MS = 5_000;
/** Mínimo engajado para o prêmio (ms). */
export const RAID_MIN_ENGAGED_MS = 60_000;
/** Baús de Recompensa: por ter se engajado, e o extra se o chefe caiu. */
export const RAID_CHESTS = 1;
export const RAID_VICTORY_BONUS = 1;
export function raidChests(engagedMs: number, victory: boolean): number {
  if (!(engagedMs >= RAID_MIN_ENGAGED_MS)) return 0;
  return RAID_CHESTS + (victory ? RAID_VICTORY_BONUS : 0);
}

/** Chefe do raide da semana ISO `week` (ex.: "2026-W45"): rodízio fixo pelo número da semana. */
export function raidBossOfWeek(week: string): string {
  const n = Number(/W(\d+)$/.exec(week)?.[1] ?? 0);
  return RAID_BOSSES[(Number.isFinite(n) ? n : 0) % RAID_BOSSES.length]!;
}

/** Todo chefe de raide existe, é chefe e não tem spawn de mapa (nasce só no evento). Para os testes de dados. */
export const isRaidBossOk = (id: string): boolean => !!MONSTERS[id]?.boss;

// --- protocolo ---------------------------------------------------------------------------------------------------

/** Resultado do raide para quem se engajou (S2C.Notice no fim; aqui para os testes e o log). */
export interface RaidResult { victory: boolean; engagedMs: number; chests: number }

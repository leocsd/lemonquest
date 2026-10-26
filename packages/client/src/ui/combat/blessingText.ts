// Textos da bênção (tela de morte e sacerdotisa). Sem dependência de UI (testável).
import { RED_SKULL_DEATH_XP_MULT, deathXpLoss, xpForLevel } from "@lemonquest/shared";
import { fmtNum } from "../items/itemInfo.ts";

/** A partir deste level a morte custa XP de verdade e a bênção (Liora, no templo) passa a valer a pena. */
const BLESSING_TIP_LEVEL = 8;

/**
 * Linha sobre a bênção na tela de morte (UX-22). `blessingUsed`/`savedXp` vêm do servidor (DiedMsg): a bênção foi
 * gasta e salvou essa XP. `blessed`: se o jogador estava abençoado ANTES de morrer (o servidor zera o campo ao
 * consumi-la, por isso o último estado em vida é guardado à parte); abençoado sem perda = a bênção não foi gasta
 * (sem XP a perder, ciclo 14). Sem bênção e perdendo XP, a dica. Abaixo do level 8 só o aviso da bênção gasta.
 */
export function blessingLine(d: { level: number; lostXp: number; blessed: boolean; blessingUsed?: boolean; savedXp?: number }): string {
  if (d.blessingUsed) return d.savedXp ? `Sua bênção salvou ${fmtNum(d.savedXp)} XP.` : "Sua bênção foi usada: nenhuma XP perdida.";
  if (d.level < BLESSING_TIP_LEVEL) return "";
  if (d.blessed && d.lostXp === 0) return "Nada a perder neste level: sua bênção continua ativa.";
  if (!d.blessed && d.lostXp > 0) return "Dica: a Bênção (Liora, no templo) zera a perda de XP da próxima morte.";
  return "";
}

/**
 * Quanto a bênção protege agora (sacerdotisa): a perda da próxima morte pela mesma conta do servidor (deathXpLoss,
 * com a caveira vermelha). Logo depois de subir de level não há o que perder: mostra a perda cheia do level.
 */
export function blessingProtects(level: number, xp: number, skull = ""): string {
  const mult = skull === "red" ? RED_SKULL_DEATH_XP_MULT : 1;
  const now = deathXpLoss(level, xp, mult);
  if (now > 0) return `Protege ~${fmtNum(now)} XP agora.`;
  // Teto do level (no fim dele), com a caveira vermelha também: a mesma conta da morte.
  const full = deathXpLoss(level, xpForLevel(level + 1) - 1, mult);
  return full > 0 ? `Protege até ${fmtNum(full)} XP neste level.` : "";
}

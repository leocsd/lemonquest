import type { Vocation } from "./types.ts";

export type SkillId = "melee" | "distance" | "magic" | "shield";
export const SKILLS: SkillId[] = ["melee", "distance", "magic", "shield"];

export const SKILL_START: Record<SkillId, number> = { melee: 10, distance: 10, magic: 0, shield: 10 };

/** Multiplicador de dificuldade por vocação (menor = sobe mais rápido), estilo Tibia. */
export const SKILL_RATE: Record<Vocation, Record<SkillId, number>> = {
  knight: { melee: 1.1, distance: 1.4, magic: 3.0, shield: 1.1 },
  paladin: { melee: 1.2, distance: 1.1, magic: 1.4, shield: 1.1 },
  sorcerer: { melee: 2.0, distance: 2.0, magic: 1.1, shield: 1.5 },
  druid: { melee: 1.8, distance: 1.8, magic: 1.1, shield: 1.5 },
};

/**
 * "Tentativas" para sair do nível `level` para o próximo (golpes; para magic = mana gasta).
 * Era `rate × 1,15` por nível (×1,265 na skill principal): melee 60 pedia ~8 000 h de golpes, ML 40 ~150 h, seis
 * conquistas eram inalcançáveis e o treino offline rendia 0,07 nível no meio do jogo. Agora (ciclo 9, #57): armas e
 * escudo com `rate` puro (1,1 como no Tibia: melee 60 ≈ 19 h de golpes contínuos, 80 ≈ 130 h, distance 70 ≈ 50 h);
 * magia com `rate × 1,1` (1,21 por nível: ML 40 ≈ 1,2 milhão de mana ≈ 30 h de magias), porque a mana gasta conta
 * muito mais rápido que golpes. Tentativas acumuladas continuam valendo.
 */
export function skillTriesFor(skill: SkillId, level: number, vocation: Vocation): number {
  const rate = SKILL_RATE[vocation][skill] * (skill === "magic" ? 1.1 : 1);
  const base = skill === "magic" ? 120 : 30;
  const from = skill === "magic" ? level : level - SKILL_START[skill];
  return Math.round(base * Math.pow(rate, Math.max(0, from)));
}

/** Levels de referência das curvas de `SKILL_ESTIMATE` (o primeiro ponto é o personagem novo). */
export const SKILL_ESTIMATE_LEVELS = [1, 30, 60, 100] as const;

/**
 * Skills treinadas de um jogador típico em cada level de `SKILL_ESTIMATE_LEVELS`, só para os modelos de balanço (o
 * jogo usa as skills reais). Ciclo 15: substitui o "ML = 0,75 × level" do mago, que dava ML 75 no lv 100.
 * Fonte: produção 2026-10-25 (16 personagens; amostra pequena).
 * - ML de mago 20/29/37 nos lv 30/60/100 (7 magos: feiticeiros lv 36/52/54/67/104 com ML 20/23/28/30/38; druidas lv
 *   15/100 com ML 12/37). A meta do plano (22/36/48) era alta.
 * - Skill da arma 30/33/35: os 4 cavaleiros/paladinos reais ficam entre 25 e 43 em qualquer level (lv 16 com 37, lv 74
 *   com 30; paladino lv 26 com 43, lv 61 com 25) — corpo a corpo 60 pede ~19 h de golpes (`skillTriesFor`). A meta do
 *   plano (28/46/66) fica como sensibilidade em vocationBalance.test.ts.
 * - ML de cavaleiro 4/6/7 (lv 74: 6) e de paladino 12/13/15 (lv 26: 13, lv 61: 12); escudo do cavaleiro igual à arma
 *   (lv 74: 30), o dos magos com livro devagar (×1,5 por nível, sem dado da produção).
 */
export const SKILL_ESTIMATE: Record<Vocation, Record<SkillId, readonly number[]>> = {
  knight: { melee: [10, 30, 33, 35], distance: [10, 10, 10, 10], magic: [0, 4, 6, 7], shield: [10, 30, 33, 35] },
  paladin: { melee: [10, 10, 10, 10], distance: [10, 30, 33, 35], magic: [0, 12, 13, 15], shield: [10, 10, 10, 10] },
  sorcerer: { melee: [10, 10, 10, 10], distance: [10, 10, 10, 10], magic: [0, 20, 29, 37], shield: [10, 15, 20, 24] },
  druid: { melee: [10, 10, 10, 10], distance: [10, 10, 10, 10], magic: [0, 20, 29, 37], shield: [10, 15, 20, 24] },
};

/**
 * Skills estimadas (sem os bônus do equipamento) de um jogador típico da vocação no level: interpolação linear entre os
 * pontos de `table` (padrão `SKILL_ESTIMATE`; outra tabela serve para comparar hipóteses); acima do último, segue a
 * inclinação do último trecho. Inteiras (arredondadas para baixo).
 */
export function skillEstimate(vocation: Vocation, level: number, table = SKILL_ESTIMATE): Record<SkillId, number> {
  const L = Math.max(1, Number.isFinite(level) ? level : 1);
  const lv = SKILL_ESTIMATE_LEVELS;
  let i = 1;
  while (i < lv.length - 1 && L > lv[i]!) i++;
  const t = (L - lv[i - 1]!) / (lv[i]! - lv[i - 1]!);
  const curve = table[vocation] ?? table.knight;
  const at = (pts: readonly number[]) => Math.floor(pts[i - 1]! + (pts[i]! - pts[i - 1]!) * t + 1e-9);
  return { melee: at(curve.melee), distance: at(curve.distance), magic: at(curve.magic), shield: at(curve.shield) };
}

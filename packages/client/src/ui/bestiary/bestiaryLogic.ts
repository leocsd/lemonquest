// Bestiário: quais monstros listar, se o jogador já os conhece e como mostrar chances. Puro (sem DOM) para testar.
import type { MonsterDef } from "@lemonquest/shared";

export interface BestiaryRow {
  id: string;
  name: string;
  level: number;
  boss: boolean;
  /** Abates (0 = ainda não derrotado: os detalhes ficam escondidos). */
  kills: number;
  known: boolean;
}

/** Monstros do bestiário: os que dão XP e podem ser mortos (sem bonecos de treino e invocações), por level. */
export function bestiaryRows(defs: readonly MonsterDef[], bestiary: Record<string, number> | undefined): BestiaryRow[] {
  return defs
    .filter((d) => !d.invulnerable && d.xp > 0)
    .map((d) => {
      const kills = Math.max(0, Math.floor(bestiary?.[d.id] ?? 0));
      return { id: d.id, name: d.name, level: d.level, boss: !!d.boss, kills, known: kills > 0 };
    })
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name, "pt-BR"));
}

/** "sempre", "35%", "2,5%" */
export function chanceText(c: number): string {
  if (c >= 1) return "sempre";
  const p = c * 100;
  if (p >= 10) return `${Math.round(p)}%`;
  return `${p.toFixed(1).replace(".", ",").replace(/,0$/, "")}%`;
}

export const DAMAGE_LABEL: Record<string, string> = {
  physical: "físico", fire: "fogo", ice: "gelo", earth: "terra", energy: "energia", death: "morte", holy: "sagrado",
};
export const damageLabel = (k: string): string => DAMAGE_LABEL[k] ?? k;

/** "fogo: metade do dano · gelo: +25%" (vazio = toma dano normal de tudo). */
export function resistText(rs: readonly { kind: string; mult: number }[]): string {
  return rs.map(({ kind, mult }) =>
    `${damageLabel(kind)}: ${mult === 0 ? "imune" : mult === 0.5 ? "metade do dano" : mult < 1 ? `−${Math.round((1 - mult) * 100)}%` : `+${Math.round((mult - 1) * 100)}%`}`,
  ).join(" · ");
}

/**
 * Linhas "Resiste a" (multiplicador < 1) e "Fraco contra" (> 1, ciclo 15), cada uma da mais forte para a mais fraca.
 * Texto vazio = a linha não aparece.
 */
export function elementLines(rs: readonly { kind: string; mult: number }[]): { resists: string; weak: string } {
  return {
    resists: resistText(rs.filter((r) => r.mult < 1).sort((a, b) => a.mult - b.mult)),
    weak: resistText(rs.filter((r) => r.mult > 1).sort((a, b) => b.mult - a.mult)),
  };
}

/** "12 de 40 conhecidos" */
export function progressText(rows: readonly BestiaryRow[]): string {
  return `${rows.filter((r) => r.known).length} de ${rows.length} conhecidos`;
}

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
  /** Zonas onde nasce (índice do mundo; vazio = só em missão, evento ou Coliseu, ou índice ainda não carregado). */
  zones: string[];
}

/**
 * Monstros do bestiário: os que dão XP e podem ser mortos (sem bonecos de treino e invocações), por level.
 * `zonesOf` vem do índice do mundo (ui/quests/questInfo.ts monsterZones).
 */
export function bestiaryRows(defs: readonly MonsterDef[], bestiary: Record<string, number> | undefined, zonesOf: (id: string) => string[] = () => []): BestiaryRow[] {
  return defs
    .filter((d) => !d.invulnerable && d.xp > 0)
    .map((d) => {
      const kills = Math.max(0, Math.floor(bestiary?.[d.id] ?? 0));
      return { id: d.id, name: d.name, level: d.level, boss: !!d.boss, kills, known: kills > 0, zones: zonesOf(d.id) };
    })
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name, "pt-BR"));
}

/** Faixas de level do filtro (ciclo 17), na mesma escada das regiões: floresta, cavernas, ruínas, fronteira, fim de jogo. */
export const BESTIARY_BANDS: readonly { label: string; min: number; max: number }[] = [
  { label: "1–10", min: 1, max: 10 }, { label: "11–25", min: 11, max: 25 }, { label: "26–40", min: 26, max: 40 },
  { label: "41–60", min: 41, max: 60 }, { label: "61–80", min: 61, max: 80 }, { label: "81–100", min: 81, max: 100 },
  { label: "101+", min: 101, max: Infinity },
];

export interface BestiaryFilter {
  /** Nome da zona ("" = todas). */
  zone: string;
  /** Índice em BESTIARY_BANDS (-1 = todas). */
  band: number;
  seen: "all" | "known" | "unknown";
}
export const NO_FILTER: BestiaryFilter = { zone: "", band: -1, seen: "all" };

export function filterBestiary(rows: readonly BestiaryRow[], f: BestiaryFilter): BestiaryRow[] {
  const band = f.band >= 0 ? BESTIARY_BANDS[f.band] : undefined;
  return rows.filter((r) => (!f.zone || r.zones.includes(f.zone))
    && (!band || (r.level >= band.min && r.level <= band.max))
    && (f.seen === "all" || (f.seen === "known") === r.known));
}

/** Zonas do filtro, da mais fácil (menor level de monstro lá) para a mais difícil. */
export function bestiaryZones(rows: readonly BestiaryRow[]): string[] {
  const min = new Map<string, number>();
  for (const r of rows) for (const z of r.zones) min.set(z, Math.min(min.get(z) ?? Infinity, r.level));
  return [...min].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0], "pt-BR")).map(([z]) => z);
}

/** "Floresta Sussurrante, Pântano" — ou de onde ele vem quando não nasce no mapa. */
export function whereText(zones: readonly string[]): string {
  return zones.length ? zones.join(", ") : "não nasce solto no mapa (missão, evento ou Coliseu)";
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

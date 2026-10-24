// Conteúdo do "olhar" (puro: recebe os dados, devolve título/cor/linhas). A cena decide o que está sob o mouse.
import { ELITE, SKULL_LABEL, TITLES, monsterDef, npcDef, questLeverDef } from "@lemonquest/shared";
import { DAMAGE_LABEL, VOCATION_LABEL } from "../ui/items/itemInfo.ts";
import { chestLookLines } from "./chestInfo.ts";
import { creatureColor, ELITE_GLYPH, levelDifficulty } from "./creatures.ts";

export interface LookContent { title: string; color?: string; lines: string[] }

const pct = (hp: number, max: number) => `${Math.max(0, Math.round((hp / Math.max(1, max)) * 100))}%`;

export function lookCreature(c: { defId: string; name: string; level: number; boss: boolean; hp: number; maxHp: number; elite?: boolean }, myLevel: number): LookContent {
  const def = monsterDef(c.defId);
  const lines = [
    `Level ${c.level} · ${levelDifficulty(c.level, myLevel, c.boss)}${c.elite ? " · ELITE" : ""}`,
    `Vida ${c.hp.toLocaleString("pt-BR")}/${c.maxHp.toLocaleString("pt-BR")} (${pct(c.hp, c.maxHp)})`,
  ];
  if (def) {
    // Dano real (os dados já vêm com o multiplicador por level; a elite ainda bate ELITE.dmg a mais).
    const k = c.elite ? ELITE.dmg : 1;
    const dmg = `${Math.round(def.damage[0] * k)}–${Math.round(def.damage[1] * k)}`;
    lines.push(`Ataque: ${def.attackRange > 1 ? `à distância (${def.attackRange} sqm)` : "corpo a corpo"}, ${DAMAGE_LABEL[def.damageKind]}, ${dmg}`);
    if (def.abilities?.length) lines.push(`Habilidades: ${def.abilities.map((a) => a.name).join(", ")}`);
    // Bando e fuga (GD-15): quem vai puxar precisa saber antes que o monstro grita por reforço ou some com pouca vida.
    if (def.pack) lines.push(`Chama o bando quando atacado (família: ${packFamilyLabel(def.pack.family)})`);
    if (def.fleeAtHpPct > 0) lines.push(`Foge com pouca vida (abaixo de ${Math.round(def.fleeAtHpPct * 100)}%)`);
    lines.push(`XP: ${(def.xp * (c.elite ? ELITE.xp : 1)).toLocaleString("pt-BR")}`);
  }
  // Elite: ★ antes do nome; a cor continua a da dificuldade (o dourado sozinho se confundia com o amarelo "difícil").
  return { title: `${c.boss ? "☠ " : ""}${c.elite ? `${ELITE_GLYPH} ` : ""}${c.name}`, color: creatureColor(c.level, myLevel, c.boss, c.elite), lines };
}

/** Nome em português da família de bando (MonsterDef.pack.family); família nova sem rótulo mostra o id mesmo. */
const PACK_FAMILY_LABEL: Record<string, string> = {
  wolf: "lobos", goblin: "goblins", orc: "orcs", minotaur: "minotauros", ape: "macacos", pirate: "piratas", barbarian: "bárbaros",
  slag: "gosmas cinzentas", lastro: "ratazanas",
};
export const packFamilyLabel = (family: string): string => PACK_FAMILY_LABEL[family] ?? family;

export function lookPlayer(p: { name: string; level: number; vocation: string; title?: string; skull?: string }, o: { me: boolean; party: boolean }): LookContent {
  const lines = [`Level ${p.level} · ${VOCATION_LABEL[p.vocation as keyof typeof VOCATION_LABEL] ?? p.vocation}`];
  if (p.title && TITLES[p.title]) lines.push(`Título: ${TITLES[p.title]}`);
  if (p.skull === "white" || p.skull === "red") lines.push(SKULL_LABEL[p.skull]);
  if (o.party) lines.push("Do seu grupo");
  return { title: o.me ? `${p.name} (você)` : p.name, color: "#9fdcab", lines };
}

export function lookNpc(id: string): LookContent | null {
  const d = npcDef(id);
  if (!d) return null;
  const roles = [d.shop ? "loja" : "", d.depot ? "depósito" : "", d.travel?.length ? "viagens" : ""].filter(Boolean);
  return { title: d.name, color: "#ffe066", lines: [roles.length ? `NPC · ${roles.join(", ")}` : "NPC", "Clique para conversar."] };
}

export function lookQuestObject(kind: "chest" | "lever", id: string): LookContent {
  if (kind === "chest") return chestLookLines(id);
  const l = questLeverDef(id);
  return {
    title: l ? `Alavanca: ${l.name}` : "Alavanca",
    lines: l ? [`Precisa de ${l.minPlayers} a ${l.players} aventureiros de level ${l.minLevel}+ nas placas.`, "Quem puxa fica na placa ao lado da alavanca."] : [],
  };
}

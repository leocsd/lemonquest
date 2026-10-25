/// <reference types="node" />
// Dados do Quadro de Recompensas (faixas de monstros, encomenda semanal), plural dos títulos e textos de missão
// conferidos contra o mapa: alvo de recompensa precisa ser caçável no level mínimo da faixa (ciclo 14, 14-10).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CollisionGrid, canStepTerrain, findObjects, mapSpawn, objectTile, type TiledMap, type TiledObject } from "../map.ts";
import { REQUEST_BANDS } from "./materialRequest.ts";
import { MONSTERS } from "./monsters.ts";
import { NPCS, NPC_RANGE } from "./npcs.ts";
import { BOUNTY_BANDS, QUESTS, QUEST_LIST, bountyLevelMargin, bountyTitle, pluralPt } from "./quests.ts";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const map = JSON.parse(readFileSync(root + "assets/maps/world.json", "utf8")) as TiledMap;
const grid = CollisionGrid.fromTiled(map);
const prop = (o: TiledObject, name: string) => o.properties?.find((p) => p.name === name)?.value;
const cheb = (ax: number, ay: number, bx: number, by: number) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));

/**
 * Tiles que um personagem do level `level` alcança a partir do templo, sem nenhuma missão feita: andando, pelos
 * portais (porta de level só com o level; porta de missão nunca) e pelas viagens dos NPCs (carroça, barco, trem).
 */
function reachable(level: number): Uint8Array {
  const W = map.width, seen = new Uint8Array(W * map.height);
  const portals = new Map<number, { x: number; y: number; ok: boolean }>();
  for (const o of findObjects(map, "portal")) {
    const t = objectTile(o, map.tilewidth);
    const ok = !prop(o, "quest") && Number(prop(o, "minLevel") ?? 0) <= level;
    portals.set(t.y * W + t.x, { x: Number(prop(o, "toX")), y: Number(prop(o, "toY")), ok });
  }
  const travel = new Map<number, { x: number; y: number }[]>();
  for (const o of findObjects(map, "npc")) {
    const dests = NPCS[String(prop(o, "npcId"))]?.travel;
    if (!dests?.length) continue;
    const t = objectTile(o, map.tilewidth);
    for (let y = t.y - NPC_RANGE; y <= t.y + NPC_RANGE; y++) {
      for (let x = t.x - NPC_RANGE; x <= t.x + NPC_RANGE; x++) travel.set(y * W + x, [...(travel.get(y * W + x) ?? []), ...dests]);
    }
  }
  const queue: number[] = [];
  const visit = (x: number, y: number) => {
    const i = y * W + x;
    if (!seen[i] && grid.isWalkable(x, y)) { seen[i] = 1; queue.push(i); }
  };
  const start = mapSpawn(map, { x: 0, y: 0 });
  visit(start.x, start.y);
  for (let k = 0; k < queue.length; k++) {
    const i = queue[k]!, x = i % W, y = Math.floor(i / W);
    for (const d of travel.get(i) ?? []) visit(d.x, d.y);
    const portal = portals.get(i);
    if (portal) {
      // Pisar no portal leva ao destino; porta bloqueada devolve ao tile anterior (não se anda por cima dela).
      if (portal.ok) visit(portal.x, portal.y);
      continue;
    }
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && canStepTerrain(grid, x, y, dx, dy)) visit(x + dx, y + dy);
  }
  return seen;
}

const reach = new Map<number, Uint8Array>();
const reachAt = (level: number) => reach.get(level) ?? reach.set(level, reachable(level)).get(level)!;
const spawns = findObjects(map, "monster_spawn").map((o) => ({ id: String(prop(o, "monster")), ...objectTile(o, map.tilewidth) }));

/** O monstro tem spawn alcançável no `level` (o ponto do spawn ou um vizinho dele)? */
function huntable(monster: string, level: number): boolean {
  const seen = reachAt(level);
  return spawns.some((s) => s.id === monster && [-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => seen[(s.y + dy) * map.width + s.x + dx] === 1)));
}

describe("alcance do mapa (base dos testes abaixo)", () => {
  it("lv 1 anda pela vila e pega a carroça, mas não passa porta de level nem porta de missão", () => {
    expect(huntable("rat", 1)).toBe(true);
    expect(huntable("orc_warrior", 1)).toBe(true); // a carroça leva à Fronteira de graça
    expect(huntable("mine_larva", 1)).toBe(false); // Minas: porta lv 10
    expect(huntable("mine_larva", 10)).toBe(true);
    expect(huntable("abyss_samurai", 99)).toBe(false); // Abismo Profundo: porta lv 100
    expect(huntable("frost_dragon", 120)).toBe(false); // Ninho: porta da missão do Yeti
  });
});

describe("Quadro de Recompensas: alvos caçáveis no level mínimo da faixa", () => {
  it("todo monstro de faixa: level ≤ mínimo + margem e spawn alcançável sem missão nenhuma", () => {
    for (const b of BOUNTY_BANDS) {
      for (const id of b.monsters) {
        expect(MONSTERS[id]!.level, `${id} na faixa ${b.minLevel}`).toBeLessThanOrEqual(b.minLevel + bountyLevelMargin(b.minLevel));
        expect(huntable(id, b.minLevel), `${id} na faixa ${b.minLevel}`).toBe(true);
      }
    }
  });

  it("margem: lobo (lv 8) é demais para quem é lv 1; no fim de jogo a folga é de 14 levels", () => {
    expect(8).toBeGreaterThan(1 + bountyLevelMargin(1));
    expect(bountyLevelMargin(10)).toBe(14);
    expect(BOUNTY_BANDS[0]!.monsters).not.toContain("wolf");
    expect(BOUNTY_BANDS.flatMap((b) => b.monsters)).not.toContain("frost_dragon");
  });

  it("encomenda: todo material cai de monstro comum caçável no level mínimo da faixa (mesma margem)", () => {
    for (const b of REQUEST_BANDS) {
      for (const mat of b.materials) {
        const sources = Object.values(MONSTERS).filter((m) => !m.boss && (m.loot ?? []).some((l) => l.itemId === mat));
        const ok = sources.filter((m) => m.level <= b.minLevel + bountyLevelMargin(b.minLevel) && huntable(m.id, b.minLevel));
        expect(ok.map((m) => m.id), `${mat} na faixa ${b.minLevel} (fontes: ${sources.map((m) => `${m.id} lv ${m.level}`).join(", ")})`).not.toEqual([]);
      }
    }
    expect(REQUEST_BANDS.flatMap((b) => b.materials)).not.toContain("frost_dragon_scale");
  });
});

describe("plural dos títulos do Quadro", () => {
  it("casos que saíam errados e os que já estavam certos", () => {
    const cases: Record<string, string> = {
      "Cão Infernal": "Cães Infernais", "Samurai Rubro": "Samurais Rubros", "Tengu Rubro": "Tengus Rubros",
      "Orc Xamã": "Orcs Xamãs", "Orc Guerreiro": "Orcs Guerreiros", "Gosma Azul": "Gosmas Azuis",
      "Cavaleiro Negro": "Cavaleiros Negros", "Olho Maligno": "Olhos Malignos", "Pirata Saqueador": "Piratas Saqueadores",
      "Lobo Espiritual": "Lobos Espirituais", "Rato Cinzento": "Ratos Cinzentos", "Crânio Flamejante": "Crânios Flamejantes",
      "Lobo": "Lobos", "Homem-Lagarto": "Homens-Lagarto", "Espírito de Chama": "Espíritos de Chama",
      "Senhor dos Dragões": "Senhores dos Dragões", "Elemental de Magma": "Elementais de Magma", "Dragão de Gelo": "Dragões de Gelo",
      "Herói": "Heróis", "Behemoth": "Behemoths", "Larva das Minas": "Larvas das Minas",
    };
    for (const [one, many] of Object.entries(cases)) expect(pluralPt(one), one).toBe(many);
    expect(bountyTitle({ monster: "hellhound", count: 10 })).toBe("Mate 10 Cães Infernais");
  });

  it("todo monstro comum: cada palavra antes do primeiro conectivo vai para o plural (nada de 'Cões Infernal')", () => {
    const ids = new Set([...BOUNTY_BANDS.flatMap((b) => b.monsters), ...Object.values(MONSTERS).filter((m) => !m.boss).map((m) => m.id)]);
    for (const id of ids) {
      const name = MONSTERS[id]!.name;
      const pl = pluralPt(name);
      expect(pl, name).not.toBe(name);
      const words = pl.split(" ");
      const stop = words.findIndex((w) => !/^\p{Lu}/u.test(w));
      const varying = stop < 0 ? words : words.slice(0, stop);
      // Composto com hífen ("Homens-Lagarto"): só a primeira parte varia, e o que vem depois é complemento.
      const head = varying[0]!.includes("-") ? [varying[0]!.split("-")[0]!] : varying;
      for (const w of head) expect(w, `${name} → ${pl}`).toMatch(/s$/);
    }
  });
});

describe("missões: textos e requisitos (ciclo 14)", () => {
  const zoneRects = findObjects(map, "zone").map((o) => ({
    name: o.name, x0: Math.floor(o.x / map.tilewidth), y0: Math.floor(o.y / map.tilewidth),
    x1: Math.floor((o.x + o.width - 1) / map.tilewidth), y1: Math.floor((o.y + o.height - 1) / map.tilewidth),
  }));
  const inZone = (zone: string, x: number, y: number) => zoneRects.some((z) => z.name === zone && x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1);

  it("missão que manda explorar e matar: o alvo nasce numa das zonas que ela manda explorar", () => {
    let checked = 0;
    for (const d of QUEST_LIST) {
      const zones = d.steps.filter((s) => s.kind === "explore" && !s.area).map((s) => s.target);
      if (!zones.length) continue;
      for (const s of d.steps) {
        if (s.kind !== "kill" || MONSTERS[s.target]?.boss) continue;
        checked++;
        expect(spawns.some((sp) => sp.id === s.target && zones.some((z) => inZone(z, sp.x, sp.y))), `${d.id}: ${s.target} em ${zones.join("/")}`).toBe(true);
      }
    }
    expect(checked).toBeGreaterThanOrEqual(8);
  });

  it("diálogos que apontavam o lugar errado agora apontam a entrada certa", () => {
    // Cavernas: a única boca é a gruta no Pântano Turvo. Cripta: o mausoléu das Ruínas de Kael.
    expect(`${QUESTS.cave_echoes!.summary} ${QUESTS.cave_echoes!.dialog.offer}`).toContain("Pântano Turvo");
    expect(QUESTS.cave_echoes!.dialog.offer).not.toMatch(/ao sul/);
    expect(QUESTS.restless_dead!.dialog.accept).toContain("Ruínas de Kael");
    expect(QUESTS.restless_dead!.dialog.accept).not.toMatch(/sudeste/);
    expect(QUESTS.sapata_gasta!.steps[0]).toMatchObject({ kind: "explore", target: "Pátio de Manobra" });
    expect(QUESTS.sapata_gasta!.dialog.offer).toContain("Pátio de Manobra");
  });

  it("sem promessa que o jogo não cumpre: chave da Cripta, escudos e coroa", () => {
    const text = (id: string) => { const d = QUESTS[id]!; return [d.summary, ...Object.values(d.dialog)].join(" "); };
    expect(text("swamp_lich")).not.toMatch(/traga a chave|precisaremos dela/i);
    expect(text("goblin_king")).not.toMatch(/traga (sua|a) coroa/i);
    expect(text("dragon_scales")).toMatch(/guarda/);
    expect(text("frost_dragons")).toMatch(/guerreiros/);
    expect(QUESTS.orshabaal_hunt!.requires).toContain("selo_do_abismo");
  });
});

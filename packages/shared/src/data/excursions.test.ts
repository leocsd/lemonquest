import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { TiledMap } from "../map.ts";
import { buildWorldIndex } from "../worldIndex.ts";
import {
  COLISEU_DEST, EXCURSION_LATE_GRACE_MS, EXCURSION_LEVEL_MAX, EXCURSION_MAX_AHEAD_MS, EXCURSION_MAX_SLOTS, EXCURSION_MIN_SLOTS, EXCURSION_NPC,
  EXCURSION_STEP_MS, excursionBandOk, excursionDestText, excursionDestinations, excursionSlotsOk, excursionTimeOk, excursionTimeSlots, suggestedBand,
} from "./excursions.ts";
import { MONSTERS } from "./monsters.ts";
import { NPCS } from "./npcs.ts";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const map = JSON.parse(readFileSync(root + "assets/maps/world.json", "utf8")) as TiledMap;
const idx = buildWorldIndex(map);
const dests = excursionDestinations(idx);

describe("excursões: destinos (índice do mundo)", () => {
  it("zonas com faixa de level, o Coliseu e os chefes com covil; ids únicos", () => {
    const zones = dests.filter((d) => d.kind === "zone");
    expect(zones.map((z) => z.label)).toEqual(expect.arrayContaining(["Floresta Sussurrante", "Minas Abandonadas", "Abismo Profundo"]));
    // Zona sem monstro (a Vila, o Porto) não é destino de caça.
    expect(dests.some((d) => d.label === "Vila de Pedra Clara")).toBe(false);
    for (const z of zones) expect(z.levels).toEqual(idx.zoneLevels(z.label));
    expect(dests.filter((d) => d.kind === "arena")).toEqual([COLISEU_DEST]);
    const bosses = dests.filter((d) => d.kind === "boss");
    expect(bosses.map((b) => b.id)).toEqual(expect.arrayContaining(["chefe:goblin_king", "chefe:ferumbras", "chefe:lair_mole_king"]));
    for (const b of bosses) {
      const id = b.id.slice("chefe:".length);
      expect(MONSTERS[id]?.boss, id).toBe(true);
      expect(idx.spawnsOf(id).length, id).toBeGreaterThan(0);
      expect(b.levels).toEqual({ min: MONSTERS[id]!.level, max: MONSTERS[id]!.level });
    }
    expect(bosses.find((b) => b.id === "chefe:goblin_king")?.zone).toBe("Ruínas de Kael");
    expect(new Set(dests.map((d) => d.id)).size).toBe(dests.length);
  });

  it("zonas por level crescente, depois o Coliseu, depois os chefes por level", () => {
    const kinds = dests.map((d) => d.kind);
    expect(kinds.indexOf("arena")).toBe(kinds.lastIndexOf("zone") + 1);
    const mins = (k: string) => dests.filter((d) => d.kind === k).map((d) => d.levels!.min);
    expect(mins("zone")).toEqual([...mins("zone")].sort((a, b) => a - b));
    expect(mins("boss")).toEqual([...mins("boss")].sort((a, b) => a - b));
    expect(excursionDestText(dests.find((d) => d.id === "chefe:goblin_king")!)).toBe("Chefe: Rei Goblin");
    expect(excursionDestText(COLISEU_DEST)).toBe("Coliseu");
  });

  it("o Mural é um NPC do catálogo", () => {
    expect(NPCS[EXCURSION_NPC]?.name).toBe("Mural de Excursões");
    expect(NPCS[EXCURSION_NPC]?.shop).toBeUndefined();
  });
});

describe("excursões: escolhas do formulário", () => {
  const now = Date.UTC(2026, 9, 26, 15, 7, 30); // 12:07:30 em Brasília; qualquer fuso de hora cheia/meia cai no mesmo passo

  it("horários: agora + cada 15 min até +12 h", () => {
    const s = excursionTimeSlots(now);
    expect(s[0]).toBe(0);
    expect(s[1]).toBe(Date.UTC(2026, 9, 26, 15, 15));
    expect(s.at(-1)).toBeLessThanOrEqual(now + EXCURSION_MAX_AHEAD_MS);
    expect(s.at(-1)! + EXCURSION_STEP_MS).toBeGreaterThan(now + EXCURSION_MAX_AHEAD_MS);
    expect(s.length).toBe(1 + 48);
    for (const t of s.slice(1)) expect(t % EXCURSION_STEP_MS).toBe(0);
  });

  it("servidor confere o horário: passo de 15 min, sem passado (fora a folga) e no máximo +12 h", () => {
    expect(excursionTimeOk(0, now)).toBe(now); // agora
    const next = Date.UTC(2026, 9, 26, 15, 15);
    expect(excursionTimeOk(next, now)).toBe(next);
    expect(excursionTimeOk(next + 60_000, now)).toBeNull(); // fora do passo
    // Escolheu 12:00 às 12:00:59 e a mensagem chegou depois: vale como "agora".
    const noon = Date.UTC(2026, 9, 26, 15, 0);
    expect(excursionTimeOk(noon, noon + 59_000)).toBe(noon + 59_000);
    expect(excursionTimeOk(noon, noon + EXCURSION_LATE_GRACE_MS + 1)).toBeNull();
    expect(excursionTimeOk(noon, now)).toBeNull(); // 7 min atrás
    const last = excursionTimeSlots(now).at(-1)!;
    expect(excursionTimeOk(last, now)).toBe(last);
    expect(excursionTimeOk(last + EXCURSION_STEP_MS, now)).toBeNull();
    for (const bad of [null, "0", 1.5, NaN, -EXCURSION_STEP_MS]) expect(excursionTimeOk(bad, now)).toBeNull();
  });

  it("faixa de level e vagas", () => {
    expect(excursionBandOk(1, EXCURSION_LEVEL_MAX)).toBe(true);
    expect(excursionBandOk(20, 20)).toBe(true);
    for (const [a, b] of [[0, 10], [10, 9], [1, EXCURSION_LEVEL_MAX + 1], [1.5, 10], ["1", 10]] as const) expect(excursionBandOk(a, b)).toBe(false);
    expect(excursionSlotsOk(EXCURSION_MIN_SLOTS)).toBe(true);
    expect(excursionSlotsOk(EXCURSION_MAX_SLOTS)).toBe(true);
    for (const n of [1, 9, 3.5, "4", null]) expect(excursionSlotsOk(n)).toBe(false);
  });

  it("faixa sugerida = quem divide XP com o líder (2/3 para baixo e para cima)", () => {
    expect(suggestedBand(30)).toEqual({ min: 20, max: 45 });
    expect(suggestedBand(1)).toEqual({ min: 1, max: 1 });
    expect(suggestedBand(299)).toEqual({ min: 200, max: EXCURSION_LEVEL_MAX });
  });
});

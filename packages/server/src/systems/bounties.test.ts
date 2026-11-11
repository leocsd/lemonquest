// Quadro de Recompensas: faixas de level (BOUNTY_BANDS) e geração (generateBounties). O "dia" (fuso/troca às 06:00)
// e a determinística por dia + faixa já estão em quests.test.ts; aqui é a consistência dos dados e dos valores.
import { describe, expect, it } from "vitest";
import { BOUNTIES_PER_DAY, BOUNTY_BANDS, MONSTERS, bountyBand, monsterDef } from "@lemonquest/shared";
import { generateBounties, restoreBounties } from "./bounties.ts";

const MAX_LEVEL = 120;
/** Quantidades possíveis por abate (bounties.ts): monstros level ≥ 24 pedem menos. */
const COUNTS_LOW = [15, 20, 25, 30], COUNTS_HIGH = [10, 15, 20];
const DAYS = Array.from({ length: 14 }, (_, i) => `2026-10-${String(1 + i).padStart(2, "0")}`);

describe("BOUNTY_BANDS", () => {
  it("faixas em ordem crescente a partir do level 1: cada level de 1 a 120 cai em exatamente uma", () => {
    expect(BOUNTY_BANDS[0]!.minLevel).toBe(1);
    for (let i = 1; i < BOUNTY_BANDS.length; i++) expect(BOUNTY_BANDS[i]!.minLevel).toBeGreaterThan(BOUNTY_BANDS[i - 1]!.minLevel);
    expect(BOUNTY_BANDS.at(-1)!.minLevel).toBeLessThanOrEqual(MAX_LEVEL);
    for (let level = 1; level <= MAX_LEVEL; level++) {
      const inside = BOUNTY_BANDS.filter((b, i) => level >= b.minLevel && (i + 1 >= BOUNTY_BANDS.length || level < BOUNTY_BANDS[i + 1]!.minLevel));
      expect(inside, `level ${level}`).toHaveLength(1);
      expect(BOUNTY_BANDS[bountyBand(level)], `level ${level}`).toBe(inside[0]);
    }
  });

  it("bountyBand nos limites: início/fim de cada faixa, abaixo de 1 e acima do level máximo", () => {
    for (let i = 0; i < BOUNTY_BANDS.length; i++) {
      const min = BOUNTY_BANDS[i]!.minLevel;
      expect(bountyBand(min)).toBe(i);
      if (i > 0) expect(bountyBand(min - 1)).toBe(i - 1);
    }
    expect(bountyBand(0)).toBe(0);
    expect(bountyBand(-5)).toBe(0);
    expect(bountyBand(MAX_LEVEL)).toBe(BOUNTY_BANDS.length - 1);
    expect(bountyBand(10_000)).toBe(BOUNTY_BANDS.length - 1);
  });

  it("todo monstro de cada faixa existe, é caçável (não chefe/invulnerável/parado), dá XP e ouro; sem repetição na faixa", () => {
    for (const b of BOUNTY_BANDS) {
      expect(b.monsters.length, `faixa ${b.minLevel}`).toBeGreaterThanOrEqual(BOUNTIES_PER_DAY);
      expect(new Set(b.monsters).size, `faixa ${b.minLevel}`).toBe(b.monsters.length);
      for (const id of b.monsters) {
        const d = MONSTERS[id];
        expect(d, `faixa ${b.minLevel}: ${id}`).toBeDefined();
        expect(monsterDef(id)).toBe(d);
        expect([d!.boss, d!.invulnerable, d!.stationary], id).toEqual([undefined, undefined, undefined]);
        expect(d!.xp, id).toBeGreaterThan(0);
        expect(d!.gold, id).toBeDefined();
        expect(d!.gold![1], id).toBeGreaterThan(0);
        expect(d!.respawnMs, id).toBeGreaterThan(0);
      }
    }
  });

  it("monstros plausíveis para a faixa: level perto do mínimo e a média sobe de faixa em faixa", () => {
    let prevAvg = 0;
    for (const b of BOUNTY_BANDS) {
      const levels = b.monsters.map((id) => MONSTERS[id]!.level);
      for (const [i, l] of levels.entries()) {
        expect(l, `${b.monsters[i]} na faixa ${b.minLevel}`).toBeGreaterThanOrEqual(b.minLevel - 12);
        expect(l, `${b.monsters[i]} na faixa ${b.minLevel}`).toBeLessThanOrEqual(b.minLevel + 14);
      }
      const avg = levels.reduce((a, c) => a + c, 0) / levels.length;
      expect(avg, `faixa ${b.minLevel}`).toBeGreaterThan(prevAvg);
      prevAvg = avg;
    }
  });
});

describe("generateBounties", () => {
  it("em todas as faixas e 14 dias: 3 monstros distintos da faixa, contagens das tabelas, XP = abates × XP e ouro > 0", () => {
    for (const day of DAYS) {
      for (let band = 0; band < BOUNTY_BANDS.length; band++) {
        const list = generateBounties(day, band);
        expect(list, `${day} faixa ${band}`).toHaveLength(BOUNTIES_PER_DAY);
        expect(new Set(list.map((b) => b.monster)).size).toBe(BOUNTIES_PER_DAY);
        for (const b of list) {
          const d = MONSTERS[b.monster]!;
          expect(BOUNTY_BANDS[band]!.monsters).toContain(b.monster);
          expect(d.level >= 24 ? COUNTS_HIGH : COUNTS_LOW, `${b.monster} ×${b.count}`).toContain(b.count);
          expect(b.xp).toBe(b.count * d.xp);
          expect(Number.isInteger(b.gold) && b.gold > 0, `${b.monster} ouro ${b.gold}`).toBe(true);
          // Ouro ≈ 80% do ouro dos abates + fixo por faixa: nunca abaixo do fixo.
          expect(b.gold).toBeGreaterThanOrEqual(50 * (band + 1));
        }
      }
    }
  });

  it("monstro desconhecido na faixa é pulado (não quebra a geração)", () => {
    const onlyRat = generateBounties("2026-10-12", 0, (id) => (id === "rat" ? monsterDef(id) : undefined));
    expect(onlyRat.map((b) => b.monster)).toEqual(["rat"]);
  });

  // Ciclo 14 (14-21): o grampo valia só para escolher o pool; a semente e o ouro fixo usavam o índice cru (band -3 dava
  // ouro negativo e outra lista). Agora a faixa é grampeada antes de tudo (clampBand).
  it("faixa fora do intervalo é grampeada por inteiro (negativa → 1ª, grande → última)", () => {
    expect(generateBounties("2026-10-12", -3)).toEqual(generateBounties("2026-10-12", 0));
    expect(generateBounties("2026-10-12", 99)).toEqual(generateBounties("2026-10-12", BOUNTY_BANDS.length - 1));
    expect(generateBounties("2026-10-12", Number.NaN)).toEqual(generateBounties("2026-10-12", 0));
    expect(generateBounties("2026-10-12", 1.7)).toEqual(generateBounties("2026-10-12", 1));
    for (const b of generateBounties("2026-10-12", -3)) expect(b.gold).toBeGreaterThan(0);
  });

  it("recompensa cresce com a faixa: a média de ouro e de XP da última faixa é bem maior que a da primeira", () => {
    const avg = (band: number, k: "gold" | "xp") => {
      const all = DAYS.flatMap((d) => generateBounties(d, band));
      return all.reduce((a, b) => a + b[k], 0) / all.length;
    };
    const last = BOUNTY_BANDS.length - 1;
    expect(avg(last, "gold")).toBeGreaterThan(avg(0, "gold") * 10);
    expect(avg(last, "xp")).toBeGreaterThan(avg(0, "xp") * 10);
  });
});

describe("restoreBounties (lista gravada com o id do monstro, ciclo 14)", () => {
  const day = "2026-10-12";

  it("refaz exatamente a lista gerada a partir de monstro + quantidade (mesma XP e ouro)", () => {
    for (let band = 0; band < BOUNTY_BANDS.length; band++) {
      const gen = generateBounties(day, band);
      expect(restoreBounties(day, band, gen.map((b) => ({ m: b.monster, c: b.count })))).toEqual(gen);
    }
  });

  it("a lista gravada vale mesmo se a faixa não tiver mais o monstro (mudança de dados no meio do dia)", () => {
    // "frost_dragon" saiu da faixa 72+ no ciclo 14: quem aceitou antes continua caçando o mesmo alvo.
    const saved = [{ m: "frost_dragon", c: 15 }, { m: "dragon", c: 10 }, { m: "hero", c: 20 }];
    const list = restoreBounties(day, 8, saved);
    expect(list.map((b) => [b.monster, b.count])).toEqual([["frost_dragon", 15], ["dragon", 10], ["hero", 20]]);
    expect(list[0]!.xp).toBe(15 * MONSTERS.frost_dragon!.xp);
    expect(list[0]!.gold).toBeGreaterThanOrEqual(50 * 9);
  });

  it("gravação antiga (sem id), monstro desconhecido ou quantidade inválida: sorteia de novo pelo dia + faixa", () => {
    const gen = generateBounties(day, 2);
    expect(restoreBounties(day, 2, [{}, {}, {}])).toEqual(gen);
    expect(restoreBounties(day, 2, [{ m: "rat", c: 15 }, { m: "nao_existe", c: 15 }, { m: "bee", c: 15 }])).toEqual(gen);
    expect(restoreBounties(day, 2, [{ m: "rat", c: 0 }, { m: "bee", c: 15 }, { m: "slime", c: 15 }])).toEqual(gen);
    expect(restoreBounties(day, 2, [{ m: "rat", c: 2.5 }])).toEqual(gen);
    expect(restoreBounties(day, 2, [])).toEqual(gen);
    // Faixa corrompida também é grampeada aqui.
    expect(restoreBounties(day, -1, [{}])).toEqual(generateBounties(day, 0));
  });
});

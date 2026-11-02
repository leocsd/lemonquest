// Balanço do Estagiário (v2, 2026-11-02): o bot com a configuração RECOMENDADA de cada vocação, caçando com os sistemas
// reais (estagiarioSimKit.ts) por 4 min contra 4 monstros corpo a corpo da faixa (anel de spawns), com poções infinitas
// e sem poção de mana, e a mesma caça com a configuração recomendada de ANTES da v2 (Cura comum acima da própria, Golpe
// Giratório com 2 bichos, colado). As metas da estratégia (docs/superpowers/specs/2026-11-02-estagiario-v2-estrategia.md)
// viram asserções. Semente fixa. LEMONQUEST_SIM_OUT=<arquivo> grava o relatório; LEMONQUEST_SIM_TRACE=<voc><level> junta
// a linha do tempo daquele cenário; LEMONQUEST_SIM_EXTRA=1 acrescenta as vocações à distância contra 1 e 2 monstros.
import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Vocation } from "@lemonquest/shared";
import { LEVELS, VOCS, configAntiga, linha, simular, type Resultado } from "./estagiarioSimKit.ts";

describe("Estagiário: balanço da configuração recomendada (v2 contra a de antes)", () => {
  const relatorio: string[] = [];
  const v2 = new Map<string, Resultado>(), semMana = new Map<string, Resultado>(), antes = new Map<string, Resultado>();
  const traceKey = process.env.LEMONQUEST_SIM_TRACE ?? "";
  for (const L of LEVELS) for (const v of VOCS) {
    const k = `${v}${L}`;
    const trace: string[] = [];
    v2.set(k, simular(v, L, { trace: traceKey === k ? trace : undefined }));
    if (trace.length) relatorio.push([`#### trace ${k}`, ...trace.slice(0, 150)].join("\n"));
    semMana.set(k, simular(v, L, { pocaoMana: false }));
    antes.set(k, simular(v, L, { config: configAntiga(v) }));
  }
  for (const [k, r] of v2) relatorio.push(linha(`${k} v2, com poção de mana`, r));
  for (const [k, r] of semMana) relatorio.push(linha(`${k} v2, SEM poção de mana`, r));
  for (const [k, r] of antes) relatorio.push(linha(`${k} ANTES (recomendado de 2026-11-01), com poção de mana`, r));
  if (process.env.LEMONQUEST_SIM_EXTRA) {
    for (const v of ["sorcerer", "druid", "paladin"] as Vocation[]) for (const L of LEVELS) for (const n of [1, 2]) {
      relatorio.push(linha(`EXTRA ${v}${L} v2 com ${n} monstro(s)`, simular(v, L, { nMonstros: n })));
      relatorio.push(linha(`EXTRA ${v}${L} ANTES com ${n} monstro(s)`, simular(v, L, { nMonstros: n, config: configAntiga(v) })));
      relatorio.push(linha(`EXTRA ${v}${L} v2 COLADO com ${n} monstro(s)`, simular(v, L, { nMonstros: n, config: { distancia: 0 } })));
    }
  }
  if (process.env.LEMONQUEST_SIM_OUT) writeFileSync(process.env.LEMONQUEST_SIM_OUT, relatorio.join("\n\n"), "utf8");

  // Comparações v2 × antes por VOCAÇÃO (soma dos três levels): cada luta isolada é caótica (um passo diferente muda a
  // ordem em que o bando chega), a soma é estável.
  const soma = (m: Map<string, Resultado>, v: Vocation, f: (r: Resultado) => number) => LEVELS.reduce((n, L) => n + f(m.get(`${v}${L}`)!), 0);
  const cmp = (v: Vocation, nome: string, f: (r: Resultado) => number) => ({ v2: soma(v2, v, f), antes: soma(antes, v, f), rotulo: `${v} ${nome}` });

  it("nenhuma conjuração falha por alcance, visão ou alvo (o resolvedor só escolhe o que alcança)", () => {
    for (const [k, r] of [...v2, ...semMana]) {
      for (const f of Object.keys(r.falhas)) expect(f.endsWith(":range") || f.endsWith(":no_los") || f.endsWith(":target") || f.endsWith(":unknown"), `${k} ${f}`).toBe(false);
    }
  });

  it("ninguém morre com poção de mana; sem ela, no máximo uma morte em 4 min contra 4 monstros", () => {
    for (const [k, r] of v2) expect(r.mortes, k).toBe(0);
    for (const [k, r] of semMana) expect(r.mortes, k).toBeLessThanOrEqual(1);
  });

  it("Pés Ligeiros ativo ≥ 90 % do tempo com poção de mana e ≥ 60 % sem (a reserva do ataque não segura mais os buffs)", () => {
    for (const [k, r] of v2) expect(r.uptime.haste ?? 0, k).toBeGreaterThanOrEqual(90);
    for (const [k, r] of semMana) expect(r.uptime.haste ?? 0, k).toBeGreaterThanOrEqual(60);
  });

  it("a cura não engole mais a mana: cavaleiro e paladino bebem no máximo 80 % das poções de mana de antes (soma dos levels) e rendem pelo menos o mesmo", () => {
    for (const v of ["knight", "paladin"] as Vocation[]) {
      const p = cmp(v, "poções de mana", (r) => r.pocoes.mana ?? 0), k = cmp(v, "abates", (r) => r.kills);
      expect(p.v2, `${p.rotulo} v2 ${p.v2} / antes ${p.antes}`).toBeLessThanOrEqual(0.8 * p.antes);
      expect(k.v2, `${k.rotulo} v2 ${k.v2} / antes ${k.antes}`).toBeGreaterThanOrEqual(k.antes);
    }
  });

  it("quem ataca à distância apanha menos mantendo distância: paladino e magos gastam em cura no máximo 70 % do que gastavam colados (soma dos levels)", () => {
    for (const v of ["paladin", "sorcerer", "druid"] as Vocation[]) {
      const c = cmp(v, "mana em cura", (r) => r.manaCura);
      expect(c.v2, `${c.rotulo} v2 ${c.v2} / antes ${c.antes}`).toBeLessThanOrEqual(0.7 * c.antes);
    }
  });

  it("rende: pelo menos 25 abates em 4 min com poção de mana em todas as vocações e levels; por vocação, nunca menos de 75 % de antes (os magos espalham o bando ao recuar)", () => {
    for (const [k, r] of v2) expect(r.kills, k).toBeGreaterThanOrEqual(25);
    for (const v of VOCS) {
      const k = cmp(v, "abates", (r) => r.kills);
      expect(k.v2, `${k.rotulo} v2 ${k.v2} / antes ${k.antes}`).toBeGreaterThanOrEqual(0.75 * k.antes);
    }
  });
});

// Balanço do Estagiário (v2, 2026-11-02; v3 etapas 2–4): o bot caçando com os sistemas reais (estagiarioSimKit.ts) por
// 4 min contra 4 monstros corpo a corpo da faixa (anel de spawns), com poções infinitas — o MODO SIMPLES de cada preset
// (seguro, equilibrado, agressivo; o equilibrado é o padrão do jogo), as regras recomendadas da v2 no modo avançado
// (a referência medida) e a configuração recomendada de ANTES da v2 (Cura comum acima da própria, Golpe Giratório com 2
// bichos, colado). As metas da estratégia (docs/superpowers/specs/2026-11-02-estagiario-v2-estrategia.md e
// 2026-11-02-estagiario-v3-abordagem.md) viram asserções. Semente fixa. LEMONQUEST_SIM_OUT=<arquivo> grava o relatório;
// LEMONQUEST_SIM_TRACE=<voc><level> junta a linha do tempo daquele cenário; LEMONQUEST_SIM_EXTRA=1 acrescenta as vocações
// à distância contra 1 e 2 monstros.
import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Preset, Vocation } from "@lemonquest/shared";
import { LEVELS, VOCS, configAntiga, configAvancada, linha, simular, type Resultado } from "./estagiarioSimKit.ts";

describe("Estagiário: balanço — modo simples (presets) contra as regras da v2 e as de antes", () => {
  const relatorio: string[] = [];
  const simples = new Map<string, Resultado>(), semMana = new Map<string, Resultado>(), v2 = new Map<string, Resultado>(), antes = new Map<string, Resultado>();
  const presets: Record<Preset, Map<string, Resultado>> = { seguro: new Map(), equilibrado: simples, agressivo: new Map() };
  const traceKey = process.env.LEMONQUEST_SIM_TRACE ?? "";
  for (const L of LEVELS) for (const v of VOCS) {
    const k = `${v}${L}`;
    const trace: string[] = [];
    simples.set(k, simular(v, L, { trace: traceKey === k ? trace : undefined }));
    if (trace.length) relatorio.push([`#### trace ${k}`, ...trace.slice(0, 150)].join("\n"));
    semMana.set(k, simular(v, L, { pocaoMana: false }));
    v2.set(k, simular(v, L, { config: configAvancada(v) }));
    antes.set(k, simular(v, L, { config: configAntiga(v) }));
    presets.seguro.set(k, simular(v, L, { config: { preset: "seguro" } }));
    presets.agressivo.set(k, simular(v, L, { config: { preset: "agressivo" } }));
  }
  for (const [k, r] of simples) relatorio.push(linha(`${k} SIMPLES equilibrado, com poção de mana`, r));
  for (const [k, r] of semMana) relatorio.push(linha(`${k} SIMPLES equilibrado, SEM poção de mana`, r));
  for (const [k, r] of presets.seguro) relatorio.push(linha(`${k} SIMPLES seguro, com poção de mana`, r));
  for (const [k, r] of presets.agressivo) relatorio.push(linha(`${k} SIMPLES agressivo, com poção de mana`, r));
  for (const [k, r] of v2) relatorio.push(linha(`${k} v2 AVANÇADO (regras recomendadas), com poção de mana`, r));
  for (const [k, r] of antes) relatorio.push(linha(`${k} ANTES (recomendado de 2026-11-01), com poção de mana`, r));
  if (process.env.LEMONQUEST_SIM_EXTRA) {
    for (const v of ["sorcerer", "druid", "paladin"] as Vocation[]) for (const L of LEVELS) for (const n of [1, 2]) {
      relatorio.push(linha(`EXTRA ${v}${L} SIMPLES com ${n} monstro(s)`, simular(v, L, { nMonstros: n })));
      relatorio.push(linha(`EXTRA ${v}${L} v2 AVANÇADO com ${n} monstro(s)`, simular(v, L, { nMonstros: n, config: configAvancada(v) })));
      relatorio.push(linha(`EXTRA ${v}${L} ANTES com ${n} monstro(s)`, simular(v, L, { nMonstros: n, config: configAntiga(v) })));
    }
  }
  if (process.env.LEMONQUEST_SIM_OUT) writeFileSync(process.env.LEMONQUEST_SIM_OUT, relatorio.join("\n\n"), "utf8");

  // Comparações por VOCAÇÃO (soma dos três levels): cada luta isolada é caótica (um passo diferente muda a ordem em que
  // o bando chega), a soma é estável.
  const soma = (m: Map<string, Resultado>, v: Vocation, f: (r: Resultado) => number) => LEVELS.reduce((n, L) => n + f(m.get(`${v}${L}`)!), 0);
  const cmp = (a: Map<string, Resultado>, b: Map<string, Resultado>, v: Vocation, nome: string, f: (r: Resultado) => number) =>
    ({ a: soma(a, v, f), b: soma(b, v, f), rotulo: `${v} ${nome}` });

  it("nenhuma conjuração falha por alcance, visão ou alvo (o resolvedor só escolhe o que alcança)", () => {
    for (const [k, r] of [...simples, ...semMana, ...v2]) {
      for (const f of Object.keys(r.falhas)) expect(f.endsWith(":range") || f.endsWith(":no_los") || f.endsWith(":target") || f.endsWith(":unknown"), `${k} ${f}`).toBe(false);
    }
  });

  it("ninguém morre com poção de mana (os três presets); sem ela, no máximo uma morte em 4 min contra 4 monstros", () => {
    for (const [nome, m] of Object.entries(presets)) for (const [k, r] of m) expect(r.mortes, `${nome} ${k}`).toBe(0);
    for (const [k, r] of semMana) expect(r.mortes, k).toBeLessThanOrEqual(1);
  });

  it("Pés Ligeiros ativo ≥ 90 % do tempo com poção de mana e ≥ 60 % sem (a reserva do ataque não segura os buffs)", () => {
    for (const [k, r] of simples) expect(r.uptime.haste ?? 0, k).toBeGreaterThanOrEqual(90);
    for (const [k, r] of semMana) expect(r.uptime.haste ?? 0, k).toBeGreaterThanOrEqual(60);
  });

  it("a cura não engole mais a mana: cavaleiro e paladino bebem no máximo 80 % das poções de mana de antes (soma dos levels) e rendem pelo menos o mesmo", () => {
    for (const v of ["knight", "paladin"] as Vocation[]) {
      const p = cmp(simples, antes, v, "poções de mana", (r) => r.pocoes.mana ?? 0), k = cmp(simples, antes, v, "abates", (r) => r.kills);
      expect(p.a, `${p.rotulo} simples ${p.a} / antes ${p.b}`).toBeLessThanOrEqual(0.8 * p.b);
      expect(k.a, `${k.rotulo} simples ${k.a} / antes ${k.b}`).toBeGreaterThanOrEqual(k.b);
    }
  });

  it("quem ataca à distância apanha menos mantendo distância: paladino e magos gastam em cura no máximo 70 % do que gastavam colados (soma dos levels)", () => {
    for (const v of ["paladin", "sorcerer", "druid"] as Vocation[]) {
      const c = cmp(simples, antes, v, "mana em cura", (r) => r.manaCura);
      expect(c.a, `${c.rotulo} simples ${c.a} / antes ${c.b}`).toBeLessThanOrEqual(0.7 * c.b);
    }
  });

  it("rende: pelo menos 25 abates em 4 min com poção de mana em todas as vocações e levels; por vocação, nunca menos de 75 % de antes", () => {
    for (const [k, r] of simples) expect(r.kills, k).toBeGreaterThanOrEqual(25);
    for (const v of VOCS) {
      const k = cmp(simples, antes, v, "abates", (r) => r.kills);
      expect(k.a, `${k.rotulo} simples ${k.a} / antes ${k.b}`).toBeGreaterThanOrEqual(0.75 * k.b);
    }
  });

  it("v3: o modo simples (equilibrado) rende pelo menos 90 % das regras recomendadas da v2 por vocação", () => {
    for (const v of VOCS) {
      const k = cmp(simples, v2, v, "abates", (r) => r.kills);
      expect(k.a, `${k.rotulo} simples ${k.a} / v2 avançado ${k.b}`).toBeGreaterThanOrEqual(0.9 * k.b);
    }
  });

  it("v3: o seguro mantém a vida mínima mais alta que o equilibrado (cavaleiro e paladino por vocação; a soma de todas) e o agressivo rende pelo menos 90 % dele", () => {
    // Nos magos a vida mínima é a rajada de quando o escudo cai: caótica por cenário, por isso só a soma geral.
    for (const v of ["knight", "paladin"] as Vocation[]) {
      const s = cmp(presets.seguro, simples, v, "vida mínima (soma)", (r) => r.hpMin);
      expect(s.a, `${s.rotulo} seguro ${s.a} / equilibrado ${s.b}`).toBeGreaterThanOrEqual(s.b);
    }
    const total = (m: Map<string, Resultado>) => VOCS.reduce((n, v) => n + soma(m, v, (r) => r.hpMin), 0);
    expect(total(presets.seguro), `vida mínima (soma geral) seguro ${total(presets.seguro)} / equilibrado ${total(simples)}`).toBeGreaterThanOrEqual(total(simples));
    for (const v of VOCS) {
      const a = cmp(presets.agressivo, simples, v, "abates", (r) => r.kills);
      expect(a.a, `${a.rotulo} agressivo ${a.a} / equilibrado ${a.b}`).toBeGreaterThanOrEqual(0.9 * a.b);
    }
  });
});

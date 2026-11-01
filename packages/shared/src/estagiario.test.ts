import { describe, expect, it } from "vitest";
import { SPELLS } from "./data/spells.ts";
import {
  ALARMES, BUSCA_TILES, NOME_ROTA_MAX, PONTOS_MAX, REGRAS_MAX, ROTAS_MAX, TURNO_MAX_MS,
  alarmeLigado, ataqueRecomendado, avancarTurno, buffsDaVocacao, buffsRecomendados, ehBuff, escolherAtaque, escolherBuff,
  escolherCura, estagiarioPadrao, fecharGravacao, gravarPasso,
  indiceMaisProximo, novaGravacao, sanitizeEstagiario, type RegraCura,
} from "./estagiario.ts";

describe("estagiário: configuração", () => {
  it("padrão = recomendado da vocação: cura com a poção, a cura própria, a Cura e a poção de mana; sem rotas", () => {
    const c = estagiarioPadrao("knight");
    expect(c.cura).toEqual([
      { quando: "vida", abaixoDe: 35, acao: { pocao: "hp" } },
      { quando: "vida", abaixoDe: 55, acao: { magia: "wound_cleansing" } },
      { quando: "vida", abaixoDe: 70, acao: { magia: "light_heal" } },
      { quando: "mana", abaixoDe: 25, acao: { pocao: "mana" } },
    ]);
    expect(estagiarioPadrao("paladin").cura.map((r) => r.acao)).toContainEqual({ magia: "divine_healing" });
    expect(estagiarioPadrao("fairy").cura[1]!.acao).toEqual({ magia: "fairy_kiss" });
    expect([c.rotas, c.reservaMana, c.vidaAlarme]).toEqual([[], 20, 25]);
    for (const a of ALARMES) expect(alarmeLigado(c, a), a).toBe(true);
    // Recomendação válida para a própria vocação (sobrevive à sanitização, nada some).
    for (const v of ["knight", "paladin", "sorcerer", "druid", "fairy"] as const) {
      expect(sanitizeEstagiario(estagiarioPadrao(v), v), v).toEqual(estagiarioPadrao(v));
    }
  });

  it("ataque recomendado: uma regra por magia de área (raio dela, 3 bichos nas de raio 3+, 2 nas menores), da mais forte para a mais fraca, e por último a tecla de alvo da vocação", () => {
    expect(ataqueRecomendado("knight")).toEqual([
      { minBichos: 3, raio: 3, magia: "earthquake" },
      { minBichos: 2, raio: 2, magia: "whirlwind" },
      { minBichos: 2, raio: 1, magia: "front_sweep" },
      { minBichos: 2, raio: 1, magia: "spin_strike" },
      // A família de alvo do cavaleiro só tem magia a partir do lv 30: a Investida (lv 10) cobre o meio do caminho.
      { minBichos: 1, raio: 1, magia: "charge" },
      { minBichos: 1, raio: 1, magia: "fam:knight:target" },
    ]);
    for (const v of ["knight", "paladin", "sorcerer", "druid", "fairy"] as const) {
      const r = ataqueRecomendado(v);
      expect(r.length, v).toBeLessThanOrEqual(REGRAS_MAX);
      expect(r[r.length - 1]!.magia, v).toBe(`fam:${v}:target`);
      for (const x of r) { expect(x.raio).toBeGreaterThanOrEqual(1); expect(x.raio).toBeLessThanOrEqual(4); }
    }
    // A onda conta pelo comprimento (até 4).
    expect(ataqueRecomendado("sorcerer")).toContainEqual({ minBichos: 2, raio: 4, magia: "fire_wave" });
    // Sem a lista de ataque no que veio salvo: vale o recomendado (configuração antiga não fica sem ataque).
    expect(sanitizeEstagiario({ cura: [] }, "knight").ataque).toEqual(ataqueRecomendado("knight"));
    expect(sanitizeEstagiario({ ataque: [] }, "knight").ataque).toEqual([]);
  });

  it("sanitiza: limites, magias de outra vocação, curas que não curam, ataques que curam, lixo", () => {
    const raw = {
      cura: [
        ...Array.from({ length: 9 }, () => ({ quando: "vida", abaixoDe: 50, acao: { pocao: "hp" } })),
      ],
      ataque: [
        { minBichos: 3, raio: 2, magia: "spin_strike" },
        { minBichos: 99, raio: 9, magia: "fam:knight:area" },
        { minBichos: 1, raio: 1, magia: "fireball" }, // de feiticeiro: sai
        { minBichos: 1, raio: 1, magia: "light_heal" }, // cura não é ataque: sai
      ],
      reservaMana: 500,
      vidaAlarme: 0,
      rotas: [{ nome: "  Cave   dos Ratos  ", pontos: [{ x: 1, y: 2 }, { x: -1, y: 2 }, { x: 3.5, y: 2 }, { x: 4, y: 5, portal: true }] }],
      alarmes: { jogador: false, morte: false, inventado: false },
    };
    const c = sanitizeEstagiario(raw, "knight");
    expect(c.cura).toHaveLength(REGRAS_MAX);
    expect(c.ataque).toEqual([{ minBichos: 3, raio: 2, magia: "spin_strike" }, { minBichos: 8, raio: 4, magia: "fam:knight:area" }]);
    expect([c.reservaMana, c.vidaAlarme]).toEqual([90, 1]);
    expect(c.rotas).toEqual([{ nome: "Cave dos Ratos", pontos: [{ x: 1, y: 2 }, { x: 4, y: 5, portal: true }] }]);
    expect(alarmeLigado(c, "jogador")).toBe(false);
    expect(alarmeLigado(c, "morte")).toBe(true); // não desliga
    expect(sanitizeEstagiario(null, "druid")).toEqual(estagiarioPadrao("druid"));
    expect(sanitizeEstagiario({ cura: [{ quando: "vida", abaixoDe: 50, acao: { magia: "wound_cleansing" } }] }, "sorcerer").cura).toEqual([]);
  });

  it("rotas: até ROTAS_MAX, até PONTOS_MAX pontos, nome até NOME_ROTA_MAX, nomes repetidos e rota vazia saem", () => {
    const pts = Array.from({ length: PONTOS_MAX + 50 }, (_, i) => ({ x: i, y: 1 }));
    const rotas = Array.from({ length: ROTAS_MAX + 2 }, (_, i) => ({ nome: `Rota ${i}`, pontos: pts }));
    rotas.push({ nome: "Rota 0", pontos: pts }, { nome: "Vazia", pontos: [] });
    const c = sanitizeEstagiario({ rotas: [{ nome: "x".repeat(40), pontos: pts }, ...rotas] }, "paladin");
    expect(c.rotas).toHaveLength(ROTAS_MAX);
    expect(c.rotas[0]!.nome).toHaveLength(NOME_ROTA_MAX);
    expect(c.rotas[0]!.pontos).toHaveLength(PONTOS_MAX);
    expect(new Set(c.rotas.map((r) => r.nome)).size).toBe(ROTAS_MAX);
  });
});

describe("estagiário: buffs", () => {
  const VOCS = ["knight", "paladin", "sorcerer", "druid", "fairy"] as const;

  it("buff = em si/no grupo, com condição, sem dano, cura ou invocação", () => {
    const buffs = Object.values(SPELLS).filter(ehBuff).map((s) => s.id).sort();
    expect(buffs).toEqual(expect.arrayContaining(["swift_feet", "iron_skin", "berserk", "mana_shield", "shield_wall", "restoring_light", "bubble_bath", "swift_wings"]));
    for (const fora of ["light_heal", "provoke", "summon_wolf", "elemental_rupture", "group_heal", "fireball"]) expect(buffs, fora).not.toContain(fora);
    expect(buffsDaVocacao("sorcerer").map((s) => s.id)).toEqual(["swift_feet", "mana_shield"]);
  });

  it("recomendados por vocação valem para a própria vocação e estão no padrão", () => {
    expect(buffsRecomendados("knight")).toEqual([
      { magia: "swift_feet", emCombate: false }, { magia: "iron_skin", emCombate: true }, { magia: "berserk", emCombate: true },
    ]);
    expect(buffsRecomendados("paladin")).toEqual([{ magia: "swift_feet", emCombate: false }]);
    expect(buffsRecomendados("druid")).toEqual([{ magia: "mana_shield", emCombate: true }, { magia: "swift_feet", emCombate: false }]);
    expect(buffsRecomendados("fairy")).toEqual([{ magia: "bubble_bath", emCombate: true }, { magia: "swift_wings", emCombate: false }]);
    for (const v of VOCS) {
      expect(estagiarioPadrao(v).buffs, v).toEqual(buffsRecomendados(v));
      const ids = buffsDaVocacao(v).map((s) => s.id);
      for (const r of buffsRecomendados(v)) expect(ids, `${v} ${r.magia}`).toContain(r.magia);
    }
  });

  it("sanitiza: magia que não é buff ou de outra vocação sai, repetida sai, limite REGRAS_MAX; sem lista = recomendado; [] fica []", () => {
    const c = sanitizeEstagiario({
      buffs: [
        { magia: "iron_skin", emCombate: true },
        { magia: "iron_skin", emCombate: false }, // repetida
        { magia: "mana_shield", emCombate: true }, // de mago
        { magia: "light_heal", emCombate: false }, // cura
        { magia: "provoke" }, // área
        { magia: 5 }, null, "lixo",
        { magia: "swift_feet", emCombate: "sim" }, // emCombate inválido = false
      ],
    }, "knight");
    expect(c.buffs).toEqual([{ magia: "iron_skin", emCombate: true }, { magia: "swift_feet", emCombate: false }]);
    expect(sanitizeEstagiario({ cura: [] }, "sorcerer").buffs).toEqual(buffsRecomendados("sorcerer"));
    expect(sanitizeEstagiario({ buffs: [] }, "sorcerer").buffs).toEqual([]);
    const muitos = Array.from({ length: 20 }, (_, i) => ({ magia: ["swift_feet", "iron_skin", "berserk", "shield_wall"][i % 4], emCombate: false }));
    expect(sanitizeEstagiario({ buffs: muitos }, "knight").buffs.length).toBeLessThanOrEqual(REGRAS_MAX);
  });

  it("escolherBuff: pula ativo, só em combate sem alvo, abaixo da reserva (menos o escudo de mana) e o que não está pronto", () => {
    const regras = [{ magia: "mana_shield", emCombate: true }, { magia: "swift_feet", emCombate: false }];
    const nada = () => false, tudo = () => true;
    expect(escolherBuff(regras, nada, true, 80, 30, tudo)).toBe("mana_shield");
    expect(escolherBuff(regras, nada, false, 80, 30, tudo)).toBe("swift_feet"); // sem alvo: só o de fora de combate
    expect(escolherBuff(regras, (c) => c === "manashield", true, 80, 30, tudo)).toBe("swift_feet");
    expect(escolherBuff(regras, nada, true, 10, 30, tudo)).toBe("mana_shield"); // escudo ignora a reserva
    expect(escolherBuff(regras, nada, false, 10, 30, tudo)).toBeNull(); // pressa respeita a reserva
    expect(escolherBuff(regras, nada, true, 80, 30, (m) => m === "swift_feet")).toBe("swift_feet");
    expect(escolherBuff(regras, tudo, true, 80, 30, tudo)).toBeNull();
  });
});

describe("estagiário: turno", () => {
  it("começa cheio, gasta em tempo real rodando, recarrega 1/12 parado, nunca passa do teto nem fica negativo", () => {
    const t0 = avancarTurno(undefined, 1000, false);
    expect(t0).toEqual({ ms: TURNO_MAX_MS, em: 1000 });
    const t1 = avancarTurno(t0, 1000 + 3_600_000, true); // 1 h rodando
    expect(t1.ms).toBe(TURNO_MAX_MS - 3_600_000);
    const t2 = avancarTurno(t1, t1.em + 12 * 60_000, false); // 12 min parado → +1 min
    expect(t2.ms).toBe(TURNO_MAX_MS - 3_600_000 + 60_000);
    expect(avancarTurno(t2, t2.em + 10 * 3_600_000, true).ms).toBe(0);
    expect(avancarTurno(t2, t2.em + 100 * 3_600_000, false).ms).toBe(TURNO_MAX_MS);
    expect(avancarTurno(t2, t2.em - 5000, true)).toEqual({ ms: t2.ms, em: t2.em - 5000 }); // relógio voltou: nada muda
  });
});

describe("estagiário: decisões", () => {
  const regras: RegraCura[] = [
    { quando: "vida", abaixoDe: 35, acao: { pocao: "hp" } },
    { quando: "vida", abaixoDe: 70, acao: { magia: "light_heal" } },
    { quando: "mana", abaixoDe: 40, acao: { pocao: "mana" } },
  ];
  const c = (hp: number, mana: number) => ({ hp, maxHp: 100, mana, maxMana: 100 });

  it("cura: a primeira regra que vale e está pronta; ninguém pronto = nada", () => {
    expect(escolherCura(c(30, 100), regras, () => true)).toEqual({ pocao: "hp" });
    expect(escolherCura(c(30, 100), regras, (a) => !("pocao" in a))).toEqual({ magia: "light_heal" });
    expect(escolherCura(c(80, 10), regras, () => true)).toEqual({ pocao: "mana" });
    expect(escolherCura(c(80, 90), regras, () => true)).toBeNull();
    expect(escolherCura(c(30, 10), regras, () => false)).toBeNull();
    expect(escolherCura({ hp: 0, maxHp: 0, mana: 0, maxMana: 0 }, regras, () => true)).toBeNull(); // sem máximo: nada
  });

  it("ataque: respeita a reserva de mana, conta bichos pelo raio e usa o que o resolvedor devolver", () => {
    const at = [{ minBichos: 3, raio: 2, magia: "fam:knight:area" }, { minBichos: 1, raio: 1, magia: "brutal_strike" }];
    const bichos = (n2: number, n1: number) => (r: number) => (r >= 2 ? n2 : n1);
    const resolve = (m: string) => (m === "fam:knight:area" ? "whirlwind" : m);
    expect(escolherAtaque(at, bichos(4, 1), 80, 30, resolve)).toBe("whirlwind");
    expect(escolherAtaque(at, bichos(2, 1), 80, 30, resolve)).toBe("brutal_strike");
    expect(escolherAtaque(at, bichos(4, 1), 20, 30, resolve)).toBeNull(); // abaixo da reserva
    expect(escolherAtaque(at, bichos(4, 1), 80, 30, () => null)).toBeNull(); // nada pronto
    expect(escolherAtaque(at, bichos(0, 0), 80, 30, resolve)).toBeNull();
  });

  it("ataque: resolve a magia antes de contar e conta com a magia resolvida (onda e área no alvo contam diferente)", () => {
    const at = [{ minBichos: 2, raio: 3, magia: "fam:sorcerer:wave" }, { minBichos: 1, raio: 1, magia: "fireball" }];
    const vistos: [number, string][] = [];
    const conta = (raio: number, magia: string) => { vistos.push([raio, magia]); return magia === "fire_wave" ? 2 : 1; };
    expect(escolherAtaque(at, conta, 80, 30, (m) => (m === "fam:sorcerer:wave" ? "fire_wave" : m))).toBe("fire_wave");
    expect(vistos).toEqual([[3, "fire_wave"]]);
    vistos.length = 0;
    // Regra sem magia pronta nem conta (contar pesa).
    expect(escolherAtaque(at, conta, 80, 30, (m) => (m === "fireball" ? m : null))).toBe("fireball");
    expect(vistos).toEqual([[1, "fireball"]]);
  });

  it("rota: retoma pelo ponto mais próximo (Chebyshev; empate = o primeiro)", () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
    expect(indiceMaisProximo(pts, { x: 9, y: 2 })).toBe(1);
    expect(indiceMaisProximo(pts, { x: 5, y: 5 })).toBe(0);
    expect(indiceMaisProximo([], { x: 1, y: 1 })).toBe(-1);
    expect(BUSCA_TILES).toBe(12);
  });
});

describe("estagiário: gravação de rota", () => {
  it("marca o início, as curvas, um ponto a cada 6 tiles retos, portais (tile pisado + destino) e o fim", () => {
    let g = novaGravacao({ x: 0, y: 0 });
    for (let x = 0; x < 8; x++) g = gravarPasso(g, { x, y: 0 }, { x: x + 1, y: 0 }); // 8 passos para leste
    for (let y = 0; y < 2; y++) g = gravarPasso(g, { x: 8, y }, { x: 8, y: y + 1 }); // curva para o sul
    g = gravarPasso(g, { x: 8, y: 2 }, { x: 50, y: 70 }); // pisou num portal em (8,2)
    g = gravarPasso(g, { x: 50, y: 70 }, { x: 50, y: 70 }); // parado: nada
    g = gravarPasso(g, { x: 50, y: 70 }, { x: 51, y: 70 });
    expect(fecharGravacao(g, { x: 51, y: 70 })).toEqual([
      { x: 0, y: 0 }, { x: 6, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 2, portal: true }, { x: 50, y: 70 }, { x: 51, y: 70 },
    ]);
  });

  it("teleporte: o tile do portal informado vira o ponto de portal; sem portal (Investida, /tp), só pontos comuns", () => {
    let g = novaGravacao({ x: 0, y: 0 });
    g = gravarPasso(g, { x: 0, y: 0 }, { x: 1, y: 0 });
    // Pisou no portal (2,0) e o mesmo tick já o levou a (40,40): o servidor vê (1,0) → (40,40) e acha o portal ao lado.
    g = gravarPasso(g, { x: 1, y: 0 }, { x: 40, y: 40 }, { x: 2, y: 0 });
    expect(g.pontos).toEqual([{ x: 0, y: 0 }, { x: 2, y: 0, portal: true }, { x: 40, y: 40 }]);
    // Investida (salto de 3 tiles sem portal): origem e destino comuns.
    g = gravarPasso(g, { x: 40, y: 40 }, { x: 43, y: 40 }, null);
    expect(g.pontos.slice(3)).toEqual([{ x: 43, y: 40 }]);
    g = gravarPasso(g, { x: 43, y: 40 }, { x: 44, y: 40 });
    g = gravarPasso(g, { x: 44, y: 40 }, { x: 47, y: 43 }, null);
    expect(g.pontos.slice(3)).toEqual([{ x: 43, y: 40 }, { x: 44, y: 40 }, { x: 47, y: 43 }]);
    expect(g.pontos.some((p, i) => i > 1 && p.portal)).toBe(false);
  });

  it("para de crescer em PONTOS_MAX", () => {
    let g = novaGravacao({ x: 0, y: 0 });
    for (let i = 0; i < PONTOS_MAX * 2; i++) g = gravarPasso(g, { x: i, y: i % 2 }, { x: i + 1, y: (i + 1) % 2 });
    expect(fecharGravacao(g, { x: 0, y: 0 }).length).toBeLessThanOrEqual(PONTOS_MAX);
  });
});

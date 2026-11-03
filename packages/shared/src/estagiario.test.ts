import { describe, expect, it } from "vitest";
import { SPELLS } from "./data/spells.ts";
import {
  ALARMES, BUSCA_TILES, DISTANCIAS, NOME_ROTA_MAX, PONTOS_MAX, RECUO_MAX_TILES, REGRAS_MAX, ROTAS_MAX, TURNO_MAX_MS,
  alarmeLigado, ataqueRecomendado, avancarTurno, buffsDaVocacao, buffsRecomendados, curaRecomendada, distanciaPadrao, ehBuff, ehInvocacao,
  escolherAtaque, escolherBuff, escolherCura, escolherRecuo, estagiarioPadrao, fecharGravacao, gravarPasso,
  indiceMaisProximo, novaGravacao, pisoDeMana, sanitizeEstagiario, sanitizeLigado, type ContextoBuff, type Recuo, type RegraCura,
} from "./estagiario.ts";

const VOCS = ["knight", "paladin", "sorcerer", "druid", "fairy"] as const;

describe("estagiário: configuração", () => {
  it("sanitizeLigado (v3): só os true contam; lixo, lista ou nada valem desligado", () => {
    expect(sanitizeLigado({ cura: true, ataque: "sim", buffs: 1, rota: true })).toEqual({ cura: true });
    expect(sanitizeLigado({ cura: true, ataque: true, buffs: true })).toEqual({ cura: true, ataque: true, buffs: true });
    expect(sanitizeLigado(undefined)).toEqual({});
    expect(sanitizeLigado([true])).toEqual({});
  });

  it("padrão = recomendado da vocação: poção como cura principal, a cura própria e a Cura de emergência no MESMO limiar, poção de mana; come; distância por vocação; sem rotas", () => {
    const c = estagiarioPadrao("knight");
    expect(c.cura).toEqual([
      { quando: "vida", abaixoDe: 50, acao: { pocao: "hp" } },
      { quando: "vida", abaixoDe: 35, acao: { magia: "wound_cleansing" } },
      { quando: "vida", abaixoDe: 35, acao: { magia: "light_heal" } },
      { quando: "mana", abaixoDe: 25, acao: { pocao: "mana" } },
    ]);
    // Afinado no arnês (2026-11-02): a poção vem ANTES da magia em todas (cura mais de uma vez e não ocupa a recarga global).
    for (const v of VOCS) {
      const r = curaRecomendada(v);
      expect("pocao" in r[0]!.acao && r[0]!.acao.pocao, v).toBe("hp");
      const magias = r.filter((x) => "magia" in x.acao);
      for (const m of magias) expect(m.abaixoDe, `${v} ${JSON.stringify(m.acao)}`).toBeLessThanOrEqual(r[0]!.abaixoDe + (v === "sorcerer" || v === "druid" || v === "fairy" ? 5 : 0));
    }
    expect(curaRecomendada("paladin")[0]!.abaixoDe).toBe(60);
    expect(curaRecomendada("sorcerer")).toEqual([
      { quando: "vida", abaixoDe: 50, acao: { pocao: "hp" } }, { quando: "vida", abaixoDe: 55, acao: { magia: "light_heal" } }, { quando: "mana", abaixoDe: 35, acao: { pocao: "mana" } },
    ]);
    // v2: a cura própria nunca fica com limiar menor que a Cura comum (entre os dois só a Cura saía, 70 de mana por 11 %).
    for (const v of VOCS) {
      const r = curaRecomendada(v);
      const propria = r.find((x) => "magia" in x.acao && x.acao.magia !== "light_heal" && x.acao.magia !== "fairy_kiss");
      const comum = r.find((x) => "magia" in x.acao && (x.acao.magia === "light_heal" || x.acao.magia === "fairy_kiss"));
      if (propria && comum) expect(propria.abaixoDe, v).toBeGreaterThanOrEqual(comum.abaixoDe);
    }
    expect(estagiarioPadrao("paladin").cura.map((r) => r.acao)).toContainEqual({ magia: "divine_healing" });
    expect(estagiarioPadrao("fairy").cura[1]!.acao).toEqual({ magia: "fairy_kiss" });
    expect([c.rotas, c.reservaMana, c.vidaAlarme, c.comer, c.distancia]).toEqual([[], 20, 25, true, 0]);
    expect(estagiarioPadrao("paladin").distancia).toBe(3);
    expect(distanciaPadrao("sorcerer")).toBe(3);
    for (const a of ALARMES) expect(alarmeLigado(c, a), a).toBe(true);
    // Recomendação válida para a própria vocação (sobrevive à sanitização, nada some).
    for (const v of VOCS) expect(sanitizeEstagiario(estagiarioPadrao(v), v), v).toEqual(estagiarioPadrao(v));
  });

  it("ataque recomendado: uma regra por magia de área (raio dela, 2 bichos nas de raio 3+, 1 nas outras), da mais forte para a mais fraca, e por último a tecla de alvo da vocação", () => {
    expect(ataqueRecomendado("knight")).toEqual([
      { minBichos: 2, raio: 3, magia: "earthquake" },
      // Raio 1–2 vale com um bicho só (afinado 2026-11-02; antes esperava 2–3 e as áreas ficavam paradas contra um monstro).
      { minBichos: 1, raio: 2, magia: "whirlwind" },
      { minBichos: 1, raio: 1, magia: "front_sweep" },
      { minBichos: 1, raio: 1, magia: "spin_strike" },
      // A família de alvo do cavaleiro só tem magia a partir do lv 30: a Investida (lv 10) cobre o meio do caminho.
      { minBichos: 1, raio: 1, magia: "charge" },
      { minBichos: 1, raio: 1, magia: "fam:knight:target" },
    ]);
    for (const v of VOCS) {
      const r = ataqueRecomendado(v);
      expect(r.length, v).toBeLessThanOrEqual(REGRAS_MAX);
      expect(r[r.length - 1]!.magia, v).toBe(`fam:${v}:target`);
      for (const x of r) { expect(x.raio).toBeGreaterThanOrEqual(1); expect(x.raio).toBeLessThanOrEqual(4); }
    }
    // A onda conta pelo comprimento (até 4) e vale com um bicho; as áreas de raio 3+ esperam 2.
    expect(ataqueRecomendado("sorcerer")).toContainEqual({ minBichos: 1, raio: 4, magia: "fire_wave" });
    expect(ataqueRecomendado("sorcerer")).toContainEqual({ minBichos: 2, raio: 3, magia: "inferno" });
    expect(ataqueRecomendado("paladin")).toContainEqual({ minBichos: 2, raio: 3, magia: "star_rain" });
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

  it("v2: mana mínima e vida do alvo por regra de ataque (0 ou lixo = ausente); comer; distância da lista ou a da vocação", () => {
    const c = sanitizeEstagiario({
      ataque: [
        { minBichos: 1, raio: 1, magia: "spin_strike", manaMin: 60.4, vidaAlvoMin: 150 },
        { minBichos: 1, raio: 1, magia: "spin_strike", manaMin: 0, vidaAlvoMin: "x" },
      ],
      comer: false, distancia: 4,
    }, "knight");
    expect(c.ataque).toEqual([{ minBichos: 1, raio: 1, magia: "spin_strike", manaMin: 60, vidaAlvoMin: 100 }, { minBichos: 1, raio: 1, magia: "spin_strike" }]);
    expect([c.comer, c.distancia]).toEqual([false, 4]);
    expect(sanitizeEstagiario({ distancia: 1 }, "paladin").distancia).toBe(3); // fora da lista: a da vocação
    expect(sanitizeEstagiario({ distancia: 0 }, "paladin").distancia).toBe(0); // colado por escolha
    expect(sanitizeEstagiario({}, "knight").distancia).toBe(0);
    expect(sanitizeEstagiario({}, "druid").comer).toBe(true);
    expect(DISTANCIAS).toEqual([0, 2, 3, 4]);
  });

  it("v2: regra de cura 'aliado' só com cura em grupo (druida/fada); poção ou cura própria com 'aliado' sai", () => {
    const ok = sanitizeEstagiario({ cura: [{ quando: "aliado", abaixoDe: 50, acao: { magia: "group_heal" } }] }, "druid");
    expect(ok.cura).toEqual([{ quando: "aliado", abaixoDe: 50, acao: { magia: "group_heal" } }]);
    expect(sanitizeEstagiario({ cura: [{ quando: "aliado", abaixoDe: 50, acao: { pocao: "hp" } }] }, "druid").cura).toEqual([]);
    expect(sanitizeEstagiario({ cura: [{ quando: "aliado", abaixoDe: 50, acao: { magia: "light_heal" } }] }, "druid").cura).toEqual([]);
    expect(sanitizeEstagiario({ cura: [{ quando: "aliado", abaixoDe: 50, acao: { magia: "group_heal" } }] }, "sorcerer").cura).toEqual([]);
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
  it("buff = em si/no grupo, com condição, sem dano, cura ou invocação; invocação entra na aba à parte", () => {
    const buffs = Object.values(SPELLS).filter(ehBuff).map((s) => s.id).sort();
    expect(buffs).toEqual(expect.arrayContaining(["swift_feet", "iron_skin", "berserk", "mana_shield", "shield_wall", "restoring_light", "bubble_bath", "swift_wings"]));
    for (const fora of ["light_heal", "provoke", "summon_wolf", "elemental_rupture", "group_heal", "fireball"]) expect(buffs, fora).not.toContain(fora);
    expect(Object.values(SPELLS).filter(ehInvocacao).map((s) => s.id).sort()).toEqual(["summon_butterfly", "summon_wolf"]);
    expect(buffsDaVocacao("sorcerer").map((s) => s.id)).toEqual(["swift_feet", "mana_shield"]);
    expect(buffsDaVocacao("druid").map((s) => s.id)).toEqual(["swift_feet", "mana_shield", "summon_wolf"]);
  });

  it("recomendados por vocação valem para a própria vocação e estão no padrão (druida e fada mantêm a invocação na luta)", () => {
    expect(buffsRecomendados("knight")).toEqual([
      { magia: "swift_feet", quando: "sempre" }, { magia: "iron_skin", quando: "combate" }, { magia: "berserk", quando: "combate" },
    ]);
    expect(buffsRecomendados("paladin")).toEqual([{ magia: "swift_feet", quando: "sempre" }]);
    // Escudo de mana sempre (afinado 2026-11-02: "em combate" chegava depois do primeiro golpe do bando).
    expect(buffsRecomendados("sorcerer")).toEqual([{ magia: "mana_shield", quando: "sempre" }, { magia: "swift_feet", quando: "sempre" }]);
    expect(buffsRecomendados("druid")).toEqual([{ magia: "mana_shield", quando: "sempre" }, { magia: "swift_feet", quando: "sempre" }, { magia: "summon_wolf", quando: "combate" }]);
    expect(buffsRecomendados("fairy")).toEqual([{ magia: "bubble_bath", quando: "sempre" }, { magia: "swift_wings", quando: "sempre" }, { magia: "summon_butterfly", quando: "combate" }]);
    for (const v of VOCS) {
      expect(estagiarioPadrao(v).buffs, v).toEqual(buffsRecomendados(v));
      const ids = buffsDaVocacao(v).map((s) => s.id);
      for (const r of buffsRecomendados(v)) expect(ids, `${v} ${r.magia}`).toContain(r.magia);
    }
  });

  it("sanitiza: magia que não é buff/invocação ou de outra vocação sai, repetida sai, limite REGRAS_MAX; `emCombate` antigo vira `quando`; mana mínima opcional", () => {
    const c = sanitizeEstagiario({
      buffs: [
        { magia: "iron_skin", emCombate: true }, // formato de antes da v2
        { magia: "iron_skin", emCombate: false }, // repetida
        { magia: "mana_shield", emCombate: true }, // de mago
        { magia: "light_heal", emCombate: false }, // cura
        { magia: "provoke" }, // área
        { magia: 5 }, null, "lixo",
        { magia: "swift_feet", emCombate: "sim", manaMin: 40 }, // emCombate inválido = sempre
        { magia: "berserk", quando: "fora", manaMin: 0 },
      ],
    }, "knight");
    expect(c.buffs).toEqual([{ magia: "iron_skin", quando: "combate" }, { magia: "swift_feet", quando: "sempre", manaMin: 40 }, { magia: "berserk", quando: "fora" }]);
    expect(sanitizeEstagiario({ buffs: [{ magia: "summon_wolf", quando: "combate" }] }, "druid").buffs).toEqual([{ magia: "summon_wolf", quando: "combate" }]);
    expect(sanitizeEstagiario({ buffs: [{ magia: "summon_wolf", quando: "combate" }] }, "sorcerer").buffs).toEqual([]);
    expect(sanitizeEstagiario({ cura: [] }, "sorcerer").buffs).toEqual(buffsRecomendados("sorcerer"));
    expect(sanitizeEstagiario({ buffs: [] }, "sorcerer").buffs).toEqual([]);
    const muitos = Array.from({ length: 20 }, (_, i) => ({ magia: ["swift_feet", "iron_skin", "berserk", "shield_wall"][i % 4], quando: "sempre" }));
    expect(sanitizeEstagiario({ buffs: muitos }, "knight").buffs.length).toBeLessThanOrEqual(REGRAS_MAX);
  });

  it("escolherBuff: pula ativo, 'combate' fora de combate, 'fora' em combate, abaixo da mana mínima da regra e o que não está pronto; a reserva do ataque não entra", () => {
    const regras = [{ magia: "mana_shield", quando: "combate" as const }, { magia: "swift_feet", quando: "sempre" as const }];
    const ctx = (over: Partial<ContextoBuff>): ContextoBuff => ({
      ativo: () => false, invocado: () => false, emCombate: true, mana: 800, maxMana: 1000, pronto: () => true, ...over,
    });
    expect(escolherBuff(regras, ctx({}))).toBe("mana_shield");
    expect(escolherBuff(regras, ctx({ emCombate: false }))).toBe("swift_feet"); // fora de combate: só o "sempre"
    expect(escolherBuff(regras, ctx({ ativo: (c) => c === "manashield" }))).toBe("swift_feet");
    // Com 5 % de mana (bem abaixo de qualquer reserva de ataque) o Pés Ligeiros sai: só a própria mana conta (pronto).
    expect(escolherBuff([regras[1]!], ctx({ mana: 50 }))).toBe("swift_feet");
    expect(escolherBuff([{ magia: "swift_feet", quando: "sempre", manaMin: 10 }], ctx({ mana: 50 }))).toBeNull(); // 5 % < 10 %
    expect(escolherBuff([{ magia: "swift_feet", quando: "sempre", manaMin: 10 }], ctx({ mana: 100 }))).toBe("swift_feet");
    expect(escolherBuff([{ magia: "swift_feet", quando: "fora" }], ctx({}))).toBeNull();
    expect(escolherBuff([{ magia: "swift_feet", quando: "fora" }], ctx({ emCombate: false }))).toBe("swift_feet");
    expect(escolherBuff(regras, ctx({ pronto: (m) => m === "swift_feet" }))).toBe("swift_feet");
    expect(escolherBuff(regras, ctx({ ativo: () => true }))).toBeNull();
    // Invocação: espera a invocação sumir, não uma condição.
    const lobo = [{ magia: "summon_wolf", quando: "combate" as const }];
    expect(escolherBuff(lobo, ctx({}))).toBe("summon_wolf");
    expect(escolherBuff(lobo, ctx({ invocado: () => true }))).toBeNull();
    expect(escolherBuff(lobo, ctx({ emCombate: false }))).toBeNull();
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

  it("cura: naoPronta (v3, diário) recebe cada regra que vale mas não está pronta, até a primeira pronta", () => {
    const vistas: RegraCura[] = [];
    expect(escolherCura(c(30, 10), regras, () => false, undefined, (r) => vistas.push(r))).toBeNull();
    expect(vistas).toEqual(regras); // as três valem (vida 30 % < 35 e < 70; mana 10 % < 40)
    vistas.length = 0;
    expect(escolherCura(c(30, 10), regras, (a) => "magia" in a, undefined, (r) => vistas.push(r))).toEqual({ magia: "light_heal" });
    expect(vistas).toEqual([regras[0]]); // a poção não estava pronta; a magia saiu e a de mana nem foi olhada
    vistas.length = 0;
    expect(escolherCura(c(80, 90), regras, () => false, undefined, (r) => vistas.push(r))).toBeNull();
    expect(vistas).toEqual([]); // nenhuma vale: nada a explicar
  });

  it("cura 'aliado': vale pelo colega abaixo do limiar, não pela própria vida; sem o avaliador, nunca", () => {
    const grupo: RegraCura[] = [{ quando: "aliado", abaixoDe: 50, acao: { magia: "group_heal" } }, ...regras];
    const vistos: [number, unknown][] = [];
    expect(escolherCura(c(100, 100), grupo, () => true, (pct, acao) => { vistos.push([pct, acao]); return pct === 50; })).toEqual({ magia: "group_heal" });
    expect(vistos).toEqual([[50, { magia: "group_heal" }]]);
    expect(escolherCura(c(100, 100), grupo, () => true, () => false)).toBeNull();
    expect(escolherCura(c(100, 100), grupo, () => true)).toBeNull();
    expect(escolherCura(c(30, 100), grupo, () => true, () => false)).toEqual({ pocao: "hp" }); // a própria vida segue valendo
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

  it("ataque v2: mana mínima da regra substitui a reserva geral (para cima ou para baixo); vida do alvo mínima pula a regra", () => {
    const at = [
      { minBichos: 1, raio: 1, magia: "brutal_strike", manaMin: 60, vidaAlvoMin: 30 },
      { minBichos: 1, raio: 1, magia: "spin_strike", manaMin: 5 },
      { minBichos: 1, raio: 1, magia: "charge" },
    ];
    const um = () => 1, id = (m: string) => m;
    expect(pisoDeMana(at[0]!, 30)).toBe(60);
    expect(pisoDeMana(at[2]!, 30)).toBe(30);
    expect(escolherAtaque(at, um, 80, 30, id)).toBe("brutal_strike");
    expect(escolherAtaque(at, um, 50, 30, id)).toBe("spin_strike"); // 50 < 60: pula a primeira
    expect(escolherAtaque(at, um, 10, 30, id)).toBe("spin_strike"); // abaixo da reserva geral, mas a regra pede só 5 %
    expect(escolherAtaque(at, um, 4, 30, id)).toBeNull();
    expect(escolherAtaque(at, um, 80, 30, id, 20)).toBe("spin_strike"); // alvo com 20 % de vida: o golpe grande espera
    expect(escolherAtaque(at, um, 40, 30, (m) => (m === "charge" ? m : null))).toBe("charge");
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

describe("estagiário: manter distância (recuo)", () => {
  const base = (over: Partial<Recuo> = {}): Recuo => ({
    pos: { x: 10, y: 10 }, alvo: { x: 11, y: 10 }, ameacas: [{ x: 11, y: 10 }], distancia: 3, alcance: 6, origem: { x: 10, y: 10 },
    livre: () => true, visao: () => true, ...over,
  });

  it("recua para o lado oposto da ameaça, em linha reta, mantendo o alvo à vista e no alcance", () => {
    expect(escolherRecuo(base())).toEqual({ x: 9, y: 10 });
    // Ameaça ao norte e alvo ao norte: desce.
    expect(escolherRecuo(base({ alvo: { x: 10, y: 9 }, ameacas: [{ x: 10, y: 9 }] }))).toEqual({ x: 10, y: 11 });
  });

  it("não escolhe tile ocupado, sem visão do alvo, fora do alcance, ainda encostado numa ameaça ou longe demais da origem", () => {
    // A coluna de trás (x = 9) ocupada: os outros vizinhos continuam encostados na ameaça em (11,10) → fica.
    expect(escolherRecuo(base({ livre: (x) => x !== 9 }))).toBeNull();
    const r = escolherRecuo(base({ livre: (x, y) => !(x === 9 && y === 10) }));
    expect(r).not.toBeNull();
    expect(Math.max(Math.abs(r!.x - 11), Math.abs(r!.y - 10))).toBe(2); // 2 tiles da ameaça
    expect(escolherRecuo(base({ livre: () => false }))).toBeNull();
    expect(escolherRecuo(base({ visao: () => false }))).toBeNull();
    // Duas ameaças em lados opostos: nenhum vizinho fica a 2 de ambas → fica.
    expect(escolherRecuo(base({ ameacas: [{ x: 11, y: 10 }, { x: 9, y: 10 }] }))).toBeNull();
    // Alcance 1 (arma corpo a corpo): recuar perderia o alvo → null.
    expect(escolherRecuo(base({ alcance: 1 }))).toBeNull();
    // Origem a RECUO_MAX_TILES para o leste: o passo para oeste passaria do limite.
    expect(escolherRecuo(base({ origem: { x: 10 + RECUO_MAX_TILES, y: 10 } }))).toBeNull();
    expect(escolherRecuo(base({ origem: { x: 10 + RECUO_MAX_TILES - 1, y: 10 } }))).toEqual({ x: 9, y: 10 });
  });

  it("ocupado: pega a diagonal que também se afasta; tudo bloqueado = null (encurralado)", () => {
    const r = escolherRecuo(base({ livre: (x, y) => !(x === 9 && y === 10) }));
    expect(r).not.toBeNull();
    expect(Math.max(Math.abs(r!.x - 11), Math.abs(r!.y - 10))).toBe(2); // 2 tiles da ameaça
    expect(escolherRecuo(base({ livre: () => false }))).toBeNull();
    expect(escolherRecuo(base({ visao: () => false }))).toBeNull();
    // Duas ameaças em lados opostos: nenhum vizinho fica a 2 de ambas → fica.
    expect(escolherRecuo(base({ ameacas: [{ x: 11, y: 10 }, { x: 9, y: 10 }] }))).toBeNull();
    // Alcance 1 (arma corpo a corpo): recuar perderia o alvo → null.
    expect(escolherRecuo(base({ alcance: 1 }))).toBeNull();
    // Origem a RECUO_MAX_TILES para o leste: o passo para oeste passaria do limite.
    expect(escolherRecuo(base({ origem: { x: 10 + RECUO_MAX_TILES, y: 10 } }))).toBeNull();
    expect(escolherRecuo(base({ origem: { x: 10 + RECUO_MAX_TILES - 1, y: 10 } }))).toEqual({ x: 9, y: 10 });
  });

  it("prefere ficar a até `distancia` do alvo (a perseguição não puxa de volta)", () => {
    // Alvo a 3 (a distância pedida): recuar para 4 ainda é dentro do alcance, mas fica fora da distância; a ameaça é outro
    // monstro ao lado (leste), então o melhor é um passo que se afaste dela sem passar de 3 do alvo: norte ou sul.
    const r = escolherRecuo(base({ alvo: { x: 7, y: 10 }, ameacas: [{ x: 11, y: 10 }] }));
    expect(r).not.toBeNull();
    expect(Math.max(Math.abs(r!.x - 7), Math.abs(r!.y - 10))).toBeLessThanOrEqual(3);
    expect(Math.max(Math.abs(r!.x - 11), Math.abs(r!.y - 10))).toBe(2);
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

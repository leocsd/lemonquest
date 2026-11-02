import { estagiarioPadrao, type EstagiarioConfig } from "@lemonquest/shared";
import { describe, expect, it } from "vitest";
import {
  PENDENTE_MS, configParaAplicar, extrairRascunho, iguais, lerNumero, limitar, limitarRascunho, rascunhoSujo, sincronizar, type Pendente,
} from "./rascunho.ts";

const srv = (over: Partial<EstagiarioConfig> = {}): EstagiarioConfig => ({
  ...estagiarioPadrao("knight"), rotas: [{ nome: "Ratos", pontos: [{ x: 1, y: 1 }] }], ...over,
});

describe("rascunho do Estagiário", () => {
  it("iguais: ordem das chaves e chave undefined não contam; NaN = NaN", () => {
    expect(iguais({ a: 1, b: { c: [1, 2] } }, { b: { c: [1, 2] }, a: 1 })).toBe(true);
    expect(iguais({ pocao: false, jogador: undefined }, { pocao: false })).toBe(true);
    expect(iguais(NaN, NaN)).toBe(true);
    expect(iguais([1], [1, 2])).toBe(false);
    expect(iguais({ a: 1 }, [1])).toBe(false);
  });

  it("sujo só quando um campo do rascunho difere (rotas não contam)", () => {
    const c = srv();
    expect(rascunhoSujo(extrairRascunho(c), { ...c, rotas: [] })).toBe(false);
    expect(rascunhoSujo({ ...extrairRascunho(c), reservaMana: 1 }, c)).toBe(true);
    expect(rascunhoSujo({ ...extrairRascunho(c), alarmes: { pocao: false } }, c)).toBe(true);
  });

  it("lerNumero não limita; vazio é NaN", () => {
    expect(lerNumero("150")).toBe(150);
    expect(lerNumero("0")).toBe(0);
    expect(lerNumero("")).toBeNaN();
    expect(lerNumero("-")).toBeNaN();
  });

  it("limitar arredonda e põe na faixa; inválido = padrão", () => {
    expect(limitar(150, 1, 99, 50)).toBe(99);
    expect(limitar(0, 1, 99, 50)).toBe(1);
    expect(limitar(2.6, 1, 4, 1)).toBe(3);
    expect(limitar(NaN, 1, 99, 50)).toBe(50);
  });

  it("limitarRascunho: cada número na faixa do servidor; inválido volta ao do servidor ou ao padrão em regra nova", () => {
    const c = srv({ cura: [{ quando: "vida", abaixoDe: 40, acao: { pocao: "hp" } }], ataque: [], reservaMana: 30, vidaAlarme: 25 });
    const r = limitarRascunho({
      ...extrairRascunho(c),
      cura: [{ quando: "vida", abaixoDe: NaN, acao: { pocao: "hp" } }, { quando: "mana", abaixoDe: 0, acao: { pocao: "mana" } }],
      ataque: [{ minBichos: 20, raio: NaN, magia: "x" }],
      reservaMana: -5, vidaAlarme: 120,
    }, c);
    expect(r.cura.map((x) => x.abaixoDe)).toEqual([40, 1]);
    expect(r.ataque[0]).toEqual({ minBichos: 8, raio: 1, magia: "x" });
    expect(r.reservaMana).toBe(0);
    expect(r.vidaAlarme).toBe(99);
  });

  it("configParaAplicar: rotas sempre do servidor", () => {
    const c = srv();
    const out = configParaAplicar({ ...extrairRascunho(c), reservaMana: 55 }, c);
    expect(out).toEqual({ ...c, reservaMana: 55 });
    expect(out.rotas).toBe(c.rotas);
  });

  describe("sincronizar", () => {
    const c = srv();
    it("sem rascunho ou sem alterações: acompanha o servidor", () => {
      const novo = srv({ reservaMana: 12 });
      expect(sincronizar({ rascunho: null, pendente: null }, null, novo, 0).rascunho).toEqual(extrairRascunho(novo));
      expect(sincronizar({ rascunho: extrairRascunho(c), pendente: null }, c, novo, 0).rascunho).toEqual(extrairRascunho(novo));
    });

    it("com alterações: o rascunho fica; a config é a do servidor", () => {
      const r = { ...extrairRascunho(c), vidaAlarme: 77 };
      const novo = srv({ rotas: [] });
      const s = sincronizar({ rascunho: r, pendente: null }, c, novo, 0);
      expect(s.rascunho).toBe(r);
      expect(s.config).toBe(novo);
    });

    it("estado atrasado logo depois do Aplicar: mantém o aplicado; depois de PENDENTE_MS, solta", () => {
      const enviado = { ...extrairRascunho(c), reservaMana: 10 };
      const p: Pendente = { enviado, antes: extrairRascunho(c), em: 1000 };
      const otimista = { ...c, ...enviado };
      const cedo = sincronizar({ rascunho: enviado, pendente: p }, otimista, c, 1000 + PENDENTE_MS - 1);
      expect(cedo.pendente).toBe(p);
      expect(cedo.config.reservaMana).toBe(10);
      expect(cedo.rascunho).toBe(enviado);
      const tarde = sincronizar({ rascunho: enviado, pendente: p }, otimista, c, 1000 + PENDENTE_MS);
      expect(tarde.pendente).toBeNull();
      expect(tarde.config).toBe(c);
      expect(tarde.rascunho).toBe(enviado); // a barra "não aplicadas" volta
    });

    it("confirmação (mesmo sanitizada) encerra o pendente e o rascunho a segue", () => {
      const enviado = { ...extrairRascunho(c), reservaMana: 10 };
      const p: Pendente = { enviado, antes: extrairRascunho(c), em: 0 };
      const conf = srv({ reservaMana: 15 });
      const s = sincronizar({ rascunho: enviado, pendente: p }, { ...c, ...enviado }, conf, 1);
      expect(s.pendente).toBeNull();
      expect(s.rascunho).toEqual(extrairRascunho(conf));
    });
  });
});

describe("rascunho v2: campos opcionais, comer e distância", () => {
  it("mana mínima e vida do alvo: 0, vazio (NaN) ou inválido somem; valor válido fica na faixa; comer e distância vão no rascunho", () => {
    const c = srv({ ataque: [{ minBichos: 1, raio: 1, magia: "spin_strike" }], buffs: [{ magia: "swift_feet", quando: "sempre" }] });
    const r = limitarRascunho({
      ...extrairRascunho(c),
      ataque: [{ minBichos: 1, raio: 1, magia: "spin_strike", manaMin: NaN, vidaAlvoMin: 150 }],
      buffs: [{ magia: "swift_feet", quando: "sempre", manaMin: 0 }],
      comer: false, distancia: 4,
    }, c);
    expect(r.ataque).toEqual([{ minBichos: 1, raio: 1, magia: "spin_strike", vidaAlvoMin: 100 }]);
    expect(Object.keys(r.ataque[0]!)).not.toContain("manaMin");
    expect(r.buffs).toEqual([{ magia: "swift_feet", quando: "sempre" }]);
    expect(Object.keys(r.buffs[0]!)).not.toContain("manaMin");
    expect([r.comer, r.distancia]).toEqual([false, 4]);
    // Campo opcional digitado e apagado não suja o rascunho depois de limitado.
    expect(rascunhoSujo(limitarRascunho({ ...extrairRascunho(c), ataque: [{ ...c.ataque[0]!, manaMin: NaN }] }, c), c)).toBe(false);
    expect(rascunhoSujo({ ...extrairRascunho(c), comer: false }, c)).toBe(true);
  });
});

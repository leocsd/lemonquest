// Estagiário v3 (modo simples): presets por vocação, perfil, política de cura por canais, save compacto e a configuração
// efetiva. As regras do modo avançado seguem em estagiario.test.ts.
import { describe, expect, it } from "vitest";
import {
  CONFORTO_ACIMA, ataqueRecomendado, buffsRecomendados, compactar, configEfetiva, curaEmGrupo, curaEstimada, curaRecomendada, curasProprias,
  decidirCura, estagiarioPadrao, perfilDoPreset, sanitizeEstagiario, sanitizePerfil, type RegraCura, type SituacaoCura,
} from "./estagiario.ts";

const VOCS = ["knight", "paladin", "sorcerer", "druid", "fairy"] as const;

describe("estagiário v3: presets e perfil", () => {
  it("por vocação, o seguro cura mais cedo e guarda mais mana que o equilibrado, que mais que o agressivo; o padrão é simples/equilibrado", () => {
    for (const v of VOCS) {
      const s = perfilDoPreset("seguro", v), e = perfilDoPreset("equilibrado", v), a = perfilDoPreset("agressivo", v);
      expect(s.emergencia).toBeGreaterThan(e.emergencia);
      expect(e.emergencia).toBeGreaterThan(a.emergencia);
      expect(s.conforto).toBeGreaterThan(e.conforto);
      expect(e.conforto).toBeGreaterThan(a.conforto);
      expect(s.reserva).toBeGreaterThan(e.reserva);
      expect(e.reserva).toBeGreaterThanOrEqual(a.reserva);
      for (const p of [s, e, a]) expect(p.conforto - p.emergencia).toBeGreaterThanOrEqual(CONFORTO_ACIMA);
      expect(estagiarioPadrao(v)).toMatchObject({ modo: "simples", preset: "equilibrado", perfil: e });
    }
    expect(perfilDoPreset("equilibrado", "knight")).not.toEqual(perfilDoPreset("equilibrado", "sorcerer")); // por vocação
  });

  it("sanitizePerfil: faixas, conforto pelo menos CONFORTO_ACIMA acima da emergência, lixo = equilibrado", () => {
    expect(sanitizePerfil({ emergencia: 90, conforto: 5, reserva: -3 }, "knight")).toEqual({ emergencia: 60, conforto: 65, reserva: 0 });
    expect(sanitizePerfil({ emergencia: 30, conforto: 70, reserva: 20.4 }, "knight")).toEqual({ emergencia: 30, conforto: 70, reserva: 20 });
    expect(sanitizePerfil(null, "druid")).toEqual(perfilDoPreset("equilibrado", "druid"));
    expect(sanitizePerfil({ emergencia: "x" }, "druid")).toEqual(perfilDoPreset("equilibrado", "druid"));
  });

  it("sanitize: modo explícito vale; sem modo (save de antes da v3) as listas decidem; preset inválido = equilibrado; null com perfil = números próprios", () => {
    expect(sanitizeEstagiario({}, "knight")).toMatchObject({ modo: "simples", preset: "equilibrado" });
    const cura = [{ quando: "vida", abaixoDe: 80, acao: { pocao: "hp" } }];
    expect(sanitizeEstagiario({ cura }, "knight").modo).toBe("avancado");
    expect(sanitizeEstagiario({ buffs: [] }, "knight").modo).toBe("avancado");
    expect(sanitizeEstagiario({ modo: "simples", cura }, "knight").modo).toBe("simples");
    expect(sanitizeEstagiario({ modo: "avancado" }, "knight").modo).toBe("avancado");
    expect(sanitizeEstagiario({ preset: "turbo" }, "knight")).toMatchObject({ preset: "equilibrado", perfil: perfilDoPreset("equilibrado", "knight") });
    expect(sanitizeEstagiario({ preset: "seguro", perfil: { emergencia: 1, conforto: 2, reserva: 3 } }, "knight"))
      .toMatchObject({ preset: "seguro", perfil: perfilDoPreset("seguro", "knight") });
    expect(sanitizeEstagiario({ preset: null, perfil: { emergencia: 33, conforto: 66, reserva: 11 } }, "knight"))
      .toMatchObject({ preset: null, perfil: { emergencia: 33, conforto: 66, reserva: 11 } });
    expect(sanitizeEstagiario({ preset: null }, "knight").preset).toBe("equilibrado"); // null sem números: nada para guardar
  });

  it("compactar: o padrão é vazio; o preset vai pelo nome; números próprios vão; listas só mexidas; o modo vai junto com qualquer coisa; ida e volta", () => {
    const p = estagiarioPadrao("knight");
    expect(compactar(p, "knight")).toEqual({});
    expect(compactar({ ...p, preset: "seguro", perfil: perfilDoPreset("seguro", "knight") }, "knight")).toEqual({ preset: "seguro", modo: "simples" });
    expect(compactar({ ...p, preset: null, perfil: { emergencia: 33, conforto: 66, reserva: 11 } }, "knight"))
      .toEqual({ preset: null, perfil: { emergencia: 33, conforto: 66, reserva: 11 }, modo: "simples" });
    expect(compactar({ ...p, modo: "avancado" }, "knight")).toEqual({ modo: "avancado" });
    const cura: RegraCura[] = [{ quando: "vida", abaixoDe: 80, acao: { pocao: "hp" } }];
    expect(compactar({ ...p, cura, comer: false }, "knight")).toEqual({ cura, comer: false, modo: "simples" });
    const c = { ...p, modo: "simples" as const, cura, reservaMana: 40 };
    expect(sanitizeEstagiario(compactar(c, "knight"), "knight")).toEqual(c);
  });

  it("configEfetiva: no simples, o recomendado da vocação com a reserva do perfil e a distância padrão; no avançado, a própria", () => {
    const c = {
      ...estagiarioPadrao("sorcerer"), cura: [] as RegraCura[], ataque: [], buffs: [], reservaMana: 5, distancia: 0,
      perfil: { emergencia: 30, conforto: 55, reserva: 42 }, preset: null,
    };
    expect(configEfetiva(c, "sorcerer")).toMatchObject({
      cura: curaRecomendada("sorcerer"), ataque: ataqueRecomendado("sorcerer"), buffs: buffsRecomendados("sorcerer"), reservaMana: 42, distancia: 3,
    });
    const a = { ...c, modo: "avancado" as const };
    expect(configEfetiva(a, "sorcerer")).toBe(a);
  });

  it("curaEstimada e as curas da vocação por level (com o custo de mana no level)", () => {
    expect(curaEstimada({ base: 20, perLevel: 1.23, perMagic: 3 }, 40, 10)).toBe(Math.round(20 + 49.2 + 30));
    expect(curasProprias("knight", 1).map((m) => m.id)).toEqual(["light_heal"]);
    expect(curasProprias("knight", 20).map((m) => m.id)).toEqual(["light_heal", "wound_cleansing"]);
    expect(curasProprias("knight", 20).find((m) => m.id === "light_heal")!.mana).toBe(50); // 20 + 1,5 × 20
    expect(curaEmGrupo("knight", 100)).toBeUndefined();
    expect(curaEmGrupo("druid", 100)?.id).toBe("group_heal");
  });
});

describe("estagiário v3: decidirCura (política do modo simples)", () => {
  const perfil = { emergencia: 30, conforto: 60, reserva: 30 };
  const sit = (over: Partial<SituacaoCura>): SituacaoCura => ({
    hp: 100, maxHp: 100, mana: 100, maxMana: 100,
    pocao: { hp: { pronta: true, recupera: 50 }, mana: { pronta: true, recupera: 50 } },
    magias: [{ id: "light_heal", pronta: true, cura: 20, mana: 10 }, { id: "wound_cleansing", pronta: true, cura: 30, mana: 10 }],
    escudoDeMana: false, ...over,
  });
  const semPocao = { hp: { pronta: false, recupera: 50 }, mana: { pronta: false, recupera: 50 } };

  it("emergência: poção e a magia mais forte juntas; sem poção ou magia pronta, os motivos", () => {
    expect(decidirCura(sit({ hp: 20 }), perfil)).toEqual({ pocao: "hp", magia: "wound_cleansing", motivos: [] });
    expect(decidirCura(sit({ hp: 20, pocao: semPocao }), perfil)).toEqual({ pocao: null, magia: "wound_cleansing", motivos: ["poção de vida em recarga"] });
    const nada = sit({ hp: 20, pocao: { hp: { pronta: true, recupera: 0 }, mana: { pronta: true, recupera: 0 } }, magias: [{ id: "light_heal", pronta: false, cura: 20, mana: 10 }] });
    expect(decidirCura(nada, perfil)).toEqual({ pocao: null, magia: null, motivos: ["nenhuma poção de vida que você possa beber", "Cura em recarga ou sem mana"] });
  });

  it("conforto: a magia se cobre ≥ 60 % do que falta e sobra a reserva; senão a poção; senão a magia que houver", () => {
    expect(decidirCura(sit({ hp: 59 }), perfil)).toEqual({ pocao: null, magia: "wound_cleansing", motivos: [] }); // falta 41: 30 cobre 73 %
    expect(decidirCura(sit({ hp: 50 }), perfil).magia).toBe("wound_cleansing"); // falta 50: cobre 60 % (o limite)
    expect(decidirCura(sit({ hp: 45 }), perfil)).toEqual({ pocao: "hp", magia: null, motivos: [] }); // falta 55: 55 % → a poção
    expect(decidirCura(sit({ hp: 59, mana: 35 }), perfil).pocao).toBe("hp"); // cobre, mas 35 − 10 = 25 % < reserva
    expect(decidirCura(sit({ hp: 45, pocao: semPocao }), perfil).magia).toBe("wound_cleansing"); // sem poção pronta: a magia mesmo cobrindo pouco
    expect(decidirCura(sit({ hp: 61 }), perfil)).toEqual({ pocao: null, magia: null, motivos: [] }); // acima do conforto: nada
    expect(decidirCura(sit({ hp: 45, pocao: { hp: { pronta: true, recupera: 0 }, mana: { pronta: true, recupera: 0 } }, magias: [] }), perfil).motivos)
      .toEqual(["nenhuma poção de vida que você possa beber"]);
  });

  it("mana: poção de mana abaixo da reserva se o canal de poção está livre; a de vida ganha", () => {
    expect(decidirCura(sit({ mana: 29 }), perfil)).toEqual({ pocao: "mana", magia: null, motivos: [] });
    expect(decidirCura(sit({ mana: 29, hp: 20 }), perfil).pocao).toBe("hp");
    expect(decidirCura(sit({ mana: 29, pocao: { hp: { pronta: true, recupera: 50 }, mana: { pronta: true, recupera: 0 } } }), perfil).motivos)
      .toEqual(["nenhuma poção de mana que você possa beber"]);
    expect(decidirCura(sit({ mana: 30 }), perfil).pocao).toBeNull();
  });

  it("Escudo de Mana: a poção de mana vale abaixo do conforto e, na emergência de mana, passa na frente da de vida", () => {
    expect(decidirCura(sit({ mana: 50, escudoDeMana: true }), perfil).pocao).toBe("mana");
    expect(decidirCura(sit({ mana: 50 }), perfil).pocao).toBeNull();
    expect(decidirCura(sit({ hp: 45, mana: 20, escudoDeMana: true }), perfil).pocao).toBe("mana"); // vida no conforto, mana na emergência
    expect(decidirCura(sit({ hp: 20, mana: 20, escudoDeMana: true }), perfil).pocao).toBe("hp"); // as duas na emergência: a vida
  });

  it("colega abaixo do conforto: a cura em grupo quando a magia não foi precisa para si", () => {
    const grupo = { id: "group_heal", pronta: true, aliadoBaixo: true };
    expect(decidirCura(sit({ grupo }), perfil)).toEqual({ pocao: null, magia: "group_heal", motivos: [] });
    expect(decidirCura(sit({ hp: 20, grupo }), perfil).magia).toBe("wound_cleansing"); // eu primeiro
    expect(decidirCura(sit({ grupo: { ...grupo, pronta: false } }), perfil).motivos).toEqual(["Cura em Grupo em recarga ou sem mana"]);
    expect(decidirCura(sit({ grupo: { ...grupo, aliadoBaixo: false } }), perfil).magia).toBeNull();
  });
});

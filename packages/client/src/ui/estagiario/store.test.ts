import { REGRAS_MAX, TURNO_MAX_MS, TURNO_RECARGA, estagiarioPadrao, type RegraAtaque, type RegraBuff, type RegraCura } from "@lemonquest/shared";
import { describe, expect, it } from "vitest";
import {
  addRegraAtaque, addRegraBuff, addRegraCura, alternarAlarme, apagarRota, fmtTurno, moverRegra, removerRegra, renomearRota, setRegra, turnoMostrado,
} from "./regras.ts";

const cura = (abaixoDe: number): RegraCura => ({ quando: "vida", abaixoDe, acao: { pocao: "hp" } });
const ataque = (magia: string): RegraAtaque => ({ minBichos: 1, raio: 1, magia });

describe("edição das regras do Estagiário", () => {
  it("+ Regra de cura acrescenta no fim até REGRAS_MAX (sem mexer na lista original)", () => {
    const base = [cura(30)];
    const next = addRegraCura(base);
    expect(next).toHaveLength(2);
    expect(base).toHaveLength(1);
    expect(next[0]).toBe(base[0]);
    expect(next[1]!.quando).toBe("vida");
    const cheia = Array.from({ length: REGRAS_MAX }, (_, i) => cura(10 + i));
    expect(addRegraCura(cheia)).toBe(cheia); // cheia: a mesma lista (nada muda)
  });

  it("+ Regra de ataque usa a magia escolhida, com 1 bicho a 1 tile; sem magia ou cheia, nada muda", () => {
    expect(addRegraAtaque([], "fireball")).toEqual([{ minBichos: 1, raio: 1, magia: "fireball" }]);
    const vazia: RegraAtaque[] = [];
    expect(addRegraAtaque(vazia, "")).toBe(vazia);
    const cheia = Array.from({ length: REGRAS_MAX }, () => ataque("fireball"));
    expect(addRegraAtaque(cheia, "fireball")).toBe(cheia);
  });

  it("+ Buff acrescenta a magia (fora de combate também); repetida, vazia ou cheia não muda nada", () => {
    const base: RegraBuff[] = [{ magia: "iron_skin", emCombate: true }];
    expect(addRegraBuff(base, "swift_feet")).toEqual([...base, { magia: "swift_feet", emCombate: false }]);
    expect(addRegraBuff(base, "iron_skin")).toBe(base);
    expect(addRegraBuff(base, "")).toBe(base);
    const cheia = Array.from({ length: REGRAS_MAX }, (_, i): RegraBuff => ({ magia: `b${i}`, emCombate: false }));
    expect(addRegraBuff(cheia, "swift_feet")).toBe(cheia);
    expect(setRegra(base, 0, { emCombate: false })).toEqual([{ magia: "iron_skin", emCombate: false }]);
  });

  it("subir/descer troca com a vizinha; nas pontas não faz nada", () => {
    const l = [cura(1), cura(2), cura(3)];
    expect(moverRegra(l, 1, -1).map((r) => r.abaixoDe)).toEqual([2, 1, 3]);
    expect(moverRegra(l, 1, 1).map((r) => r.abaixoDe)).toEqual([1, 3, 2]);
    expect(moverRegra(l, 0, -1)).toBe(l);
    expect(moverRegra(l, 2, 1)).toBe(l);
    expect(l.map((r) => r.abaixoDe)).toEqual([1, 2, 3]);
  });

  it("remover tira só a regra do índice; índice fora da lista não muda nada", () => {
    const l = [ataque("a"), ataque("b"), ataque("c")];
    expect(removerRegra(l, 1).map((r) => r.magia)).toEqual(["a", "c"]);
    expect(removerRegra(l, 9)).toBe(l);
  });

  it("setRegra troca campos de uma regra só", () => {
    const l = [cura(30), cura(70)];
    const n = setRegra(l, 1, { abaixoDe: 55 });
    expect(n.map((r) => r.abaixoDe)).toEqual([30, 55]);
    expect(n[0]).toBe(l[0]);
    expect(setRegra(l, 5, { abaixoDe: 1 })).toBe(l);
  });
});

describe("rotas e alarmes na configuração", () => {
  const cfg = () => ({
    ...estagiarioPadrao("knight"),
    rotas: [{ nome: "Ratos", pontos: [{ x: 1, y: 1 }] }, { nome: "Lobos", pontos: [{ x: 2, y: 2 }] }],
  });

  it("renomear: nome limpo e até 20 letras; vazio ou repetido (sem diferenciar maiúsculas) recusa (null)", () => {
    expect(renomearRota(cfg(), "Ratos", "  Esgoto   norte ")!.rotas.map((r) => r.nome)).toEqual(["Esgoto norte", "Lobos"]);
    expect(renomearRota(cfg(), "Ratos", "x".repeat(30))!.rotas[0]!.nome).toHaveLength(20);
    expect(renomearRota(cfg(), "Ratos", "   ")).toBeNull();
    expect(renomearRota(cfg(), "Ratos", "lobos")).toBeNull();
    expect(renomearRota(cfg(), "Ratos", "RATOS")!.rotas[0]!.nome).toBe("RATOS"); // só muda a caixa: pode
    expect(renomearRota(cfg(), "Nenhuma", "Outra")).toBeNull();
  });

  it("apagar tira a rota pelo nome", () => {
    expect(apagarRota(cfg(), "Ratos").rotas.map((r) => r.nome)).toEqual(["Lobos"]);
  });

  it("alarme: ausente = ligado; desligar grava false e religar remove a chave; morte nunca desliga", () => {
    const off = alternarAlarme(cfg(), "jogador");
    expect(off.alarmes).toEqual({ jogador: false });
    expect(alternarAlarme(off, "jogador").alarmes).toEqual({});
    const morte = cfg();
    expect(alternarAlarme(morte, "morte")).toBe(morte);
  });
});

describe("turno restante", () => {
  it("h:mm, arredondando para baixo; nunca negativo", () => {
    expect(fmtTurno(2 * 3_600_000)).toBe("2:00");
    expect(fmtTurno(65 * 60_000 + 59_000)).toBe("1:05");
    expect(fmtTurno(59_999)).toBe("0:00");
    expect(fmtTurno(-5)).toBe("0:00");
  });

  it("entre dois envios do servidor: gasta com a rota rodando, recarrega pausada ou desligada até o teto", () => {
    const e = (rota: string | null, pausa = "") => ({ turnoMs: 3_600_000, rota, pausa });
    expect(turnoMostrado(e("Ratos"), 1000, 61_000, TURNO_MAX_MS, TURNO_RECARGA)).toBe(3_540_000);
    expect(turnoMostrado(e("Ratos", "manual"), 1000, 121_000, TURNO_MAX_MS, TURNO_RECARGA)).toBe(3_610_000); // pausada recarrega
    expect(turnoMostrado(e("Ratos", "npc"), 1000, 121_000, TURNO_MAX_MS, TURNO_RECARGA)).toBe(3_610_000);
    expect(turnoMostrado(e(null), 0, 120_000, TURNO_MAX_MS, TURNO_RECARGA)).toBe(3_610_000);
    expect(turnoMostrado({ turnoMs: TURNO_MAX_MS - 1, rota: null, pausa: "" }, 0, 3_600_000, TURNO_MAX_MS, TURNO_RECARGA)).toBe(TURNO_MAX_MS);
    expect(turnoMostrado({ turnoMs: 5, rota: "R", pausa: "" }, 0, 999_999, TURNO_MAX_MS, TURNO_RECARGA)).toBe(0);
  });
});

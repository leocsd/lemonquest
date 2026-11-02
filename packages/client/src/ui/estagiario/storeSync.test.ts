// Envio e confirmação da configuração do Estagiário (store.ts): o transporte (items/net.ts → session.ts, que lê
// `location` ao carregar) é trocado por um espião.
import { C2S, DIARIO_MAX, estagiarioPadrao, type DiarioItem, type EstagiarioConfig, type EstagiarioEstadoMsg } from "@lemonquest/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sent: { type: string; msg: unknown }[] = [];
vi.mock("../items/net.ts", () => ({ send: (type: string, msg: unknown) => { sent.push({ type, msg }); } }));

const {
  ESTAGIARIO_SEND_DELAY_MS, PENDENTE_MS, aplicarRascunho, descartarRascunho, diarioStore, editarRascunho, estagiarioStore, flushConfig, ligar,
  onDiarioFromServer, onEstadoFromServer, rascunhoStore, rascunhoSujo, resetRascunho, salvarConfig,
} = await import("./store.ts");

const ROTA = { nome: "Ratos", pontos: [{ x: 1, y: 1 }] };
const base = (): EstagiarioConfig => ({ ...estagiarioPadrao("knight"), rotas: [ROTA] });
const estado = (over: Partial<EstagiarioEstadoMsg> = {}): EstagiarioEstadoMsg => ({
  config: base(), cura: false, ataque: false, buffs: false, rota: null, pausa: "", gravando: false, pontosGravados: 0, turnoMs: 1000, motivo: "", ponto: null, ...over,
});
const configs = () => sent.filter((s) => s.type === C2S.EstagiarioConfig).map((s) => (s.msg as { config: EstagiarioConfig }).config);
const sujo = () => rascunhoSujo(rascunhoStore.get()!, estagiarioStore.get()!.config);

describe("estagiário: rotas (renomear/apagar vão na hora, juntas)", () => {
  beforeEach(() => { vi.useFakeTimers(); flushConfig(); resetRascunho(); onEstadoFromServer(estado()); sent.length = 0; });
  afterEach(() => { vi.useRealTimers(); });

  it("cliques seguidos viram uma mensagem só, depois do atraso; sem mudança nova, o flush não reenvia", () => {
    const c = estagiarioStore.get()!.config;
    salvarConfig({ ...c, rotas: [] });
    salvarConfig({ ...c, rotas: [{ ...ROTA, nome: "Novo" }] });
    expect(estagiarioStore.get()!.config.rotas[0]!.nome).toBe("Novo"); // mostra na hora
    expect(sent).toHaveLength(0);
    vi.advanceTimersByTime(ESTAGIARIO_SEND_DELAY_MS);
    expect(configs()).toEqual([{ ...c, rotas: [{ ...ROTA, nome: "Novo" }] }]);
    flushConfig();
    expect(sent).toHaveLength(1);
  });

  it("estado do servidor com rota ainda não enviada: ficam as rotas locais, o resto do estado entra", () => {
    salvarConfig({ ...base(), rotas: [] });
    onEstadoFromServer(estado({ cura: true, turnoMs: 500 })); // rotas antigas do servidor
    expect(estagiarioStore.get()).toMatchObject({ cura: true, turnoMs: 500, config: { rotas: [] } });
    vi.advanceTimersByTime(ESTAGIARIO_SEND_DELAY_MS);
    onEstadoFromServer(estado({ config: { ...base(), rotas: [] } }));
    expect(estagiarioStore.get()!.config.rotas).toEqual([]);
  });

  it("ligar manda antes a configuração pendente (ordem preservada)", () => {
    salvarConfig({ ...base(), rotas: [] });
    ligar({ cura: true });
    expect(sent.map((s) => s.type)).toEqual([C2S.EstagiarioConfig, C2S.EstagiarioToggle]);
  });
});

describe("estagiário: rascunho com Aplicar", () => {
  beforeEach(() => { vi.useFakeTimers(); flushConfig(); resetRascunho(); onEstadoFromServer(estado()); sent.length = 0; });
  afterEach(() => { vi.useRealTimers(); });

  it("editar não manda nada; o estado do servidor (periódico, interruptor) não apaga a edição", () => {
    editarRascunho({ reservaMana: 7 });
    vi.advanceTimersByTime(10_000);
    expect(sent).toHaveLength(0);
    onEstadoFromServer(estado({ cura: true, turnoMs: 1 }));
    expect(rascunhoStore.get()!.reservaMana).toBe(7);
    expect(estagiarioStore.get()).toMatchObject({ cura: true, config: { reservaMana: base().reservaMana } });
    expect(sujo()).toBe(true);
    // Rota salva noutro lugar: a lista entra, o rascunho continua.
    onEstadoFromServer(estado({ config: { ...base(), rotas: [] } }));
    expect(estagiarioStore.get()!.config.rotas).toEqual([]);
    expect(rascunhoStore.get()!.reservaMana).toBe(7);
  });

  it("sem alterações, o rascunho acompanha cada estado do servidor", () => {
    onEstadoFromServer(estado({ config: { ...base(), reservaMana: 42 } }));
    expect(rascunhoStore.get()!.reservaMana).toBe(42);
    expect(sujo()).toBe(false);
  });

  it("Aplicar manda servidor + rascunho limitado às faixas; a confirmação manda no rascunho", () => {
    editarRascunho({ reservaMana: 150, vidaAlarme: NaN });
    aplicarRascunho();
    expect(configs()).toEqual([{ ...base(), reservaMana: 90 }]); // vida do alarme inválida = a do servidor
    expect(rascunhoStore.get()!.reservaMana).toBe(90); // mostra o valor limitado
    expect(sujo()).toBe(false);
    // O servidor sanitiza e devolve (aqui, outro valor): o rascunho segue a confirmação.
    onEstadoFromServer(estado({ config: { ...base(), reservaMana: 85 } }));
    expect(rascunhoStore.get()!.reservaMana).toBe(85);
  });

  it("estado atrasado (saiu antes do Aplicar chegar) não volta o aplicado; sem confirmação, a barra volta", () => {
    editarRascunho({ reservaMana: 10 });
    aplicarRascunho();
    onEstadoFromServer(estado({ turnoMs: 2 })); // config de antes
    expect(rascunhoStore.get()!.reservaMana).toBe(10);
    expect(sujo()).toBe(false);
    vi.advanceTimersByTime(PENDENTE_MS);
    onEstadoFromServer(estado({ turnoMs: 3 })); // o pedido se perdeu
    expect(rascunhoStore.get()!.reservaMana).toBe(10);
    expect(sujo()).toBe(true);
  });

  it("Aplicar leva junto um renomear de rota que ainda esperava (uma mensagem só)", () => {
    salvarConfig({ ...base(), rotas: [] });
    editarRascunho({ vidaAlarme: 40 });
    aplicarRascunho();
    vi.advanceTimersByTime(ESTAGIARIO_SEND_DELAY_MS);
    expect(configs()).toEqual([{ ...base(), rotas: [], vidaAlarme: 40 }]);
  });

  it("Descartar volta ao do servidor; rota apagada com rascunho sujo manda a config do servidor", () => {
    editarRascunho({ reservaMana: 3 });
    salvarConfig({ ...estagiarioStore.get()!.config, rotas: [] });
    vi.advanceTimersByTime(ESTAGIARIO_SEND_DELAY_MS);
    expect(configs()[0]!.reservaMana).toBe(base().reservaMana);
    expect(rascunhoStore.get()!.reservaMana).toBe(3);
    descartarRascunho();
    expect(sujo()).toBe(false);
    expect(rascunhoStore.get()!.reservaMana).toBe(base().reservaMana);
  });
});

describe("estagiário: diário (S2C.EstagiarioDiario, v3)", () => {
  it("acrescenta no fim, guarda só as últimas DIARIO_MAX, 'tudo' substitui, lixo é ignorado e sala nova zera", () => {
    resetRascunho();
    const item = (t: number): DiarioItem => ({ t, canal: "pocao", texto: `p${t}` });
    onDiarioFromServer({ itens: [item(1), item(2)] });
    onDiarioFromServer({ itens: [item(3), { t: "x", canal: "pocao", texto: "" } as never, { t: 4, canal: "nada", texto: "" } as never] });
    expect(diarioStore.get().map((i) => i.t)).toEqual([1, 2, 3]);
    onDiarioFromServer({ itens: Array.from({ length: DIARIO_MAX + 5 }, (_, i) => item(100 + i)) });
    expect(diarioStore.get()).toHaveLength(DIARIO_MAX);
    expect(diarioStore.get().at(-1)!.t).toBe(100 + DIARIO_MAX + 4);
    onDiarioFromServer({ itens: [item(7)], tudo: true });
    expect(diarioStore.get().map((i) => i.t)).toEqual([7]);
    onDiarioFromServer(null as never);
    onDiarioFromServer({ itens: "x" } as never);
    expect(diarioStore.get()).toHaveLength(1);
    resetRascunho();
    expect(diarioStore.get()).toEqual([]);
  });
});

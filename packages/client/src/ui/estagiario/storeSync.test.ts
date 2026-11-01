// Envio e confirmação da configuração do Estagiário (store.ts): o transporte (items/net.ts → session.ts, que lê
// `location` ao carregar) é trocado por um espião.
import { C2S, estagiarioPadrao, type EstagiarioEstadoMsg } from "@lemonquest/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sent: { type: string; msg: unknown }[] = [];
vi.mock("../items/net.ts", () => ({ send: (type: string, msg: unknown) => { sent.push({ type, msg }); } }));

const { ESTAGIARIO_SEND_DELAY_MS, estagiarioStore, flushConfig, ligar, onEstadoFromServer, salvarConfig } = await import("./store.ts");

const estado = (over: Partial<EstagiarioEstadoMsg> = {}): EstagiarioEstadoMsg => ({
  config: estagiarioPadrao("knight"), cura: false, ataque: false, buffs: false, rota: null, pausa: "", gravando: false, pontosGravados: 0, turnoMs: 1000, ...over,
});

describe("estagiário: envio da configuração", () => {
  beforeEach(() => { vi.useFakeTimers(); sent.length = 0; flushConfig(); sent.length = 0; onEstadoFromServer(estado()); });
  afterEach(() => { vi.useRealTimers(); });

  it("cliques seguidos viram uma mensagem só, depois do atraso; sem mudança nova, o flush não reenvia", () => {
    const c = estagiarioStore.get()!.config;
    salvarConfig({ ...c, reservaMana: 10 });
    salvarConfig({ ...c, reservaMana: 20 });
    expect(estagiarioStore.get()!.config.reservaMana).toBe(20); // mostra na hora
    expect(sent).toHaveLength(0);
    vi.advanceTimersByTime(ESTAGIARIO_SEND_DELAY_MS);
    expect(sent).toEqual([{ type: C2S.EstagiarioConfig, msg: { config: { ...c, reservaMana: 20 } } }]);
    flushConfig();
    expect(sent).toHaveLength(1);
  });

  it("estado do servidor com edição local ainda não enviada: fica a config local, o resto do estado entra", () => {
    const c = estagiarioStore.get()!.config;
    salvarConfig({ ...c, reservaMana: 55 });
    onEstadoFromServer(estado({ cura: true, turnoMs: 500 })); // config antiga do servidor
    expect(estagiarioStore.get()).toMatchObject({ cura: true, turnoMs: 500, config: { reservaMana: 55 } });
    vi.advanceTimersByTime(ESTAGIARIO_SEND_DELAY_MS);
    // Depois do envio, a confirmação do servidor manda.
    onEstadoFromServer(estado({ config: { ...c, reservaMana: 60 } }));
    expect(estagiarioStore.get()!.config.reservaMana).toBe(60);
  });

  it("ligar manda antes a configuração pendente (ordem preservada)", () => {
    const c = estagiarioStore.get()!.config;
    salvarConfig({ ...c, reservaMana: 5 });
    ligar({ cura: true });
    expect(sent.map((s) => s.type)).toEqual([C2S.EstagiarioConfig, C2S.EstagiarioToggle]);
  });
});

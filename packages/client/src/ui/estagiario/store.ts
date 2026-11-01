// Estagiário (bot de caça do servidor, spec docs/superpowers/specs/2026-11-01-estagiario-design.md): o estado que o
// servidor manda (S2C.EstagiarioEstado: ao entrar, a cada mudança e a cada 10 s com a rota rodando) e o envio das
// escolhas do jogador. A configuração vai junta como na janela "Loot automático" (items/lootFilter.ts): mostra na hora e
// espera ESTAGIARIO_SEND_DELAY_MS sem cliques para mandar uma mensagem só. Ligar/desligar e gravar vão na hora.
// As funções de edição puras ficam em regras.ts (testadas em store.test.ts, que não pode importar a rede).
import {
  C2S, type EstagiarioConfig, type EstagiarioConfigMsg, type EstagiarioEstadoMsg, type EstagiarioGravarMsg, type EstagiarioToggleMsg,
} from "@lemonquest/shared";
import { createStore } from "../hud/store.ts";
import { send } from "../items/net.ts";

export const estagiarioStore = createStore<EstagiarioEstadoMsg | null>(null);
export const estagiarioOpen = createStore(false);
export const ESTAGIARIO_SEND_DELAY_MS = 300;

let version = 0, sentVersion = 0, recebidoEm = 0;
/** Quando chegou o último estado (o turno da janela anda a partir daí: regras.ts turnoMostrado). */
export const estadoRecebidoEm = (): number => recebidoEm;
let timer: ReturnType<typeof setTimeout> | 0 = 0;

/** Mostra `c` na hora e agenda o envio ao servidor (o servidor sanitiza e devolve em S2C.EstagiarioEstado). */
export function salvarConfig(c: EstagiarioConfig): void {
  const cur = estagiarioStore.get();
  if (!cur) return; // sem estado do servidor ainda: nada para editar
  estagiarioStore.set({ ...cur, config: c });
  version++;
  if (timer) clearTimeout(timer);
  timer = setTimeout(flushConfig, ESTAGIARIO_SEND_DELAY_MS);
}

/** Manda já o que ainda não foi (ao fechar a janela, por exemplo). */
export function flushConfig(): void {
  if (timer) clearTimeout(timer);
  timer = 0;
  if (sentVersion === version) return;
  sentVersion = version;
  const cur = estagiarioStore.get();
  if (cur) send(C2S.EstagiarioConfig, { config: cur.config } satisfies EstagiarioConfigMsg);
}

/** Liga/desliga cura, ataque, buffs ou a rota (só o que vier definido muda). A configuração pendente vai antes. */
export function ligar(m: EstagiarioToggleMsg): void {
  flushConfig();
  send(C2S.EstagiarioToggle, m);
}

/** Gravação de rota: iniciar, parar (com nome) ou descartar. */
export function gravar(m: EstagiarioGravarMsg): void {
  flushConfig();
  send(C2S.EstagiarioGravar, m);
}

/** S2C.EstagiarioEstado. Com edição local ainda não enviada, fica a configuração local (a confirmação vem depois). */
export function onEstadoFromServer(m: EstagiarioEstadoMsg): void {
  if (!m || typeof m !== "object" || !m.config) return;
  recebidoEm = Date.now();
  const cur = estagiarioStore.get();
  estagiarioStore.set(timer !== 0 && cur ? { ...m, config: cur.config } : m);
}

export function toggleEstagiario(): void {
  if (estagiarioOpen.get()) closeEstagiario(); else estagiarioOpen.set(true);
}
export function closeEstagiario(): void {
  estagiarioOpen.set(false);
  flushConfig();
}

export * from "./regras.ts";

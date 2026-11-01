// Estagiário (bot de caça do servidor, spec docs/superpowers/specs/2026-11-01-estagiario-design.md): o estado que o
// servidor manda (S2C.EstagiarioEstado: ao entrar, a cada mudança e a cada 10 s com a rota rodando) e o envio das
// escolhas do jogador. Cura, ataque, buffs, reserva de mana e alarmes são editados num rascunho local (rascunho.ts) e só
// vão no "Aplicar"; ligar/desligar e gravar vão na hora; renomear/apagar rota vai junto como na janela "Loot automático"
// (items/lootFilter.ts): mostra na hora e espera ESTAGIARIO_SEND_DELAY_MS sem cliques para mandar uma mensagem só.
// As funções de edição puras ficam em regras.ts e rascunho.ts (testadas no node, sem a rede).
import {
  C2S, type EstagiarioConfig, type EstagiarioConfigMsg, type EstagiarioEstadoMsg, type EstagiarioGravarMsg, type EstagiarioToggleMsg,
} from "@lemonquest/shared";
import { createStore } from "../hud/store.ts";
import { send } from "../items/net.ts";
import { configParaAplicar, extrairRascunho, sincronizar, type Pendente, type Rascunho } from "./rascunho.ts";

export const estagiarioStore = createStore<EstagiarioEstadoMsg | null>(null);
export const estagiarioOpen = createStore(false);
export const ESTAGIARIO_SEND_DELAY_MS = 300;
/** O que a janela mostra e edita nas abas Cura, Ataque, Buffs e Alarmes (null = ainda sem estado do servidor). */
export const rascunhoStore = createStore<Rascunho | null>(null);
let pendente: Pendente | null = null;

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

/**
 * S2C.EstagiarioEstado. O rascunho só acompanha o servidor quando não tem alterações (rascunho.ts sincronizar); com
 * renomear/apagar rota ainda não enviado, ficam as rotas locais (a confirmação vem depois).
 */
export function onEstadoFromServer(m: EstagiarioEstadoMsg): void {
  if (!m || typeof m !== "object" || !m.config) return;
  recebidoEm = Date.now();
  const cur = estagiarioStore.get();
  const s = sincronizar({ rascunho: rascunhoStore.get(), pendente }, cur?.config ?? null, m.config, recebidoEm);
  pendente = s.pendente;
  const config = timer !== 0 && cur ? { ...s.config, rotas: cur.config.rotas } : s.config;
  estagiarioStore.set(config === m.config ? m : { ...m, config });
  rascunhoStore.set(s.rascunho);
}

/** Muda campos do rascunho (nada vai ao servidor até o Aplicar). */
export function editarRascunho(patch: Partial<Rascunho>): void {
  const r = rascunhoStore.get();
  if (r) rascunhoStore.set({ ...r, ...patch });
}

/** Aplicar: manda já a configuração do servidor com o rascunho (números nas faixas) por cima e mostra o aplicado. */
export function aplicarRascunho(): void {
  const cur = estagiarioStore.get(), r = rascunhoStore.get();
  if (!cur || !r) return;
  const config = configParaAplicar(r, cur.config);
  const enviado = extrairRascunho(config);
  pendente = { enviado, antes: extrairRascunho(cur.config), em: Date.now() };
  rascunhoStore.set(enviado);
  estagiarioStore.set({ ...cur, config });
  version++;
  flushConfig(); // vai já, junto com um renomear/apagar rota que estivesse esperando
}

/** Descartar: o rascunho volta a ser a configuração do servidor. */
export function descartarRascunho(): void {
  const cur = estagiarioStore.get();
  rascunhoStore.set(cur ? extrairRascunho(cur.config) : null);
}

/** Sala nova (outro personagem): rascunho de antes não vale; o próximo estado do servidor recria. */
export function resetRascunho(): void {
  pendente = null;
  rascunhoStore.set(null);
}

export function toggleEstagiario(): void {
  if (estagiarioOpen.get()) closeEstagiario(); else estagiarioOpen.set(true);
}
export function closeEstagiario(): void {
  estagiarioOpen.set(false);
  flushConfig();
}

export * from "./regras.ts";
export * from "./rascunho.ts";

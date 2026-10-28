// Filtro do loot automático (shared/lootFilter.ts): a lista de itens que ficam no chão. A regra é do servidor; aqui fica
// a escolha do jogador, que chega ao entrar (S2C.LootFilter), muda na janela "Loot automático" e vai ao servidor
// (C2S.SetLootFilter) juntando os cliques numa mensagem só (LOOT_SEND_DELAY_MS): marcar dez itens seguidos não esbarra
// no limite por segundo. A confirmação do servidor só é aplicada quando não há mudança local esperando envio.
import { C2S, sanitizeLootFilter, type LootFilter, type LootFilterMsg, type SetLootFilterMsg } from "@lemonquest/shared";
import { createStore } from "../hud/store.ts";
import { send } from "./net.ts";

export const lootFilterStore = createStore<LootFilter>({ skip: [] });
export const LOOT_SEND_DELAY_MS = 300;

let version = 0, sentVersion = 0, timer = 0;

/** Mostra `next` na hora e agenda o envio ao servidor. */
export function setLootFilter(next: LootFilter): void {
  lootFilterStore.set(sanitizeLootFilter(next));
  version++;
  clearTimeout(timer);
  timer = window.setTimeout(flushLootFilter, LOOT_SEND_DELAY_MS);
}

/** Manda já o que ainda não foi (ao fechar a janela, por exemplo). */
export function flushLootFilter(): void {
  clearTimeout(timer);
  timer = 0;
  if (sentVersion === version) return;
  sentVersion = version;
  send(C2S.SetLootFilter, { filter: lootFilterStore.get() } satisfies SetLootFilterMsg);
}

/** S2C.LootFilter: o que o servidor gravou. Com mudança local ainda não enviada, espera (a confirmação dela vem depois). */
export function onLootFilterFromServer(m: LootFilterMsg): void {
  if (timer !== 0) return;
  lootFilterStore.set(sanitizeLootFilter(m?.filter));
}

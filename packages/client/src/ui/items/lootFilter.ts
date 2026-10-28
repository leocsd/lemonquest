// Filtro do loot automático (shared/lootFilter.ts): o que entra sozinho na mochila no abate. A regra é do servidor; aqui
// fica a escolha do jogador, que chega ao entrar (S2C.LootFilter), é mudada na janela "Loot automático" e vai ao servidor
// (C2S.SetLootFilter), que confirma o que gravou. Enquanto a confirmação não chega, a tela mostra o que o jogador pediu.
import { C2S, DEFAULT_LOOT_FILTER, sanitizeLootFilter, type LootFilter, type SetLootFilterMsg } from "@lemonquest/shared";
import { createStore } from "../hud/store.ts";
import { send } from "./net.ts";

export const lootFilterStore = createStore<LootFilter>({ ...DEFAULT_LOOT_FILTER });

/** Mostra `patch` na hora (prévia, ex.: arrastando o controle de valor) sem mandar ao servidor. */
export function previewLootFilter(patch: Partial<LootFilter>): void {
  lootFilterStore.set(sanitizeLootFilter({ ...lootFilterStore.get(), ...patch }));
}

/** Aplica `patch`, mostra na hora e salva no personagem (o servidor responde com o que ficou gravado). */
export function setLootFilter(patch: Partial<LootFilter>): void {
  previewLootFilter(patch);
  send(C2S.SetLootFilter, { filter: lootFilterStore.get() } satisfies SetLootFilterMsg);
}

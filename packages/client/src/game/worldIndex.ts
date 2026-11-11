// Ponto único do índice do mundo no cliente (shared/worldIndex.ts): montado uma vez, quando o JSON do mapa chega.
// Rótulos de portal, marcadores do minimapa, guia e janela de viagem leem daqui; ninguém monta um segundo.
import { buildWorldIndex, type TiledMap, type WorldIndex } from "@lemonquest/shared";
import { createStore } from "../ui/hud/store.ts";
import { worldMapJson } from "./worldMap.ts";

export const worldIndexStore = createStore<WorldIndex | null>(null);

export const getWorldIndex = (): WorldIndex | null => worldIndexStore.get();

/** Devolve o índice, montando agora se ainda não montou (a cena chama no create, com o mapa já carregado). */
export function ensureWorldIndex(map: TiledMap): WorldIndex {
  const cur = worldIndexStore.get();
  if (cur && cur.width === map.width && cur.height === map.height) return cur;
  const idx = buildWorldIndex(map);
  worldIndexStore.set(idx);
  return idx;
}

void worldMapJson.then((map) => {
  try { ensureWorldIndex(map); } catch (e) { console.warn("[worldIndex] falha ao montar o índice do mundo", e); }
});

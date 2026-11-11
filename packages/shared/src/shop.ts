// Compra em lote na loja de NPC: a mesma conta no servidor (valida) e no cliente (botão "Máx" e limites do campo).
import type { ItemDef, ItemInstance } from "./data/items.ts";

/** Pilha padrão de item empilhável sem `maxStack` próprio. */
export const DEFAULT_MAX_STACK = 100;
/** Quantidade máxima por compra/venda numa mensagem só (o servidor recusa acima disso). */
export const MAX_TRADE_COUNT = 100;

export const maxStackOf = (d: ItemDef | undefined): number => (d?.stackable ? Math.max(1, d.maxStack ?? DEFAULT_MAX_STACK) : 1);

/** Quantas unidades de `d` ainda cabem: slots vazios inteiros + o que falta nas pilhas do mesmo item. */
export function backpackRoom(slots: readonly (ItemInstance | null)[], d: ItemDef | undefined): number {
  if (!d) return 0;
  const max = maxStackOf(d);
  let room = 0;
  for (const it of slots) {
    if (!it) room += max;
    else if (d.stackable && it.defId === d.id) room += Math.max(0, max - it.count);
  }
  return room;
}

/** Maior lote que dá para comprar agora (0 = nenhum): limitado por ouro, espaço, teto da mensagem e encomenda semanal. */
export function shopBuyMax(o: { price: number; gold: number; room: number; limited?: boolean }): number {
  const byGold = o.price > 0 ? Math.floor(o.gold / o.price) : MAX_TRADE_COUNT;
  return Math.max(0, Math.min(byGold, o.room, o.limited ? 1 : MAX_TRADE_COUNT));
}

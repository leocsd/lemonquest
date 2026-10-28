// Toasts de loot (canto inferior direito) e faixa de notícias do feed (drops raros / bosses).
import { useStore } from "../hud/store.ts";
import { Coin } from "./Gold.tsx";
import { defOf } from "./inventory.ts";
import { ItemIcon } from "./ItemIcon.tsx";
import { fmtNum, rarityColor } from "./itemInfo.ts";
import { FEED_COLOR, lootToastsStore, tickerStore } from "./loot.ts";

export function LootToasts() {
  const list = useStore(lootToastsStore);
  return (
    <>
      <div class="loot-stack" aria-live="polite">
        {list.map((t) => (
          <div key={t.id} class={`hud-card loot-toast${t.big ? " big" : ""}`}>
            <span class="loot-from">{t.msg.monsterName}{t.msg.onGround ? " (no chão)" : t.msg.partySplit ? " (divisão do grupo)" : ""}:</span>
            <span class="loot-items">
              {t.msg.gold > 0 && <span class="loot-gold"><Coin size={14} />{fmtNum(t.msg.gold)} ouro</span>}
              {t.msg.items.map((it) => (
                <span key={it.uid} class={`loot-item rar-${it.rarity}`} style={{ color: rarityColor(it.rarity) }}>
                  <ItemIcon inst={it} box={t.big ? 28 : 20} count={false} framed />
                  {defOf(it)?.name ?? it.defId}{it.count > 1 ? ` ×${it.count}` : ""}
                </span>
              ))}
              {!!t.msg.left?.length && (
                <span class="loot-left" title="Fora do seu filtro de loot automático: ficou no chão onde o bicho morreu">
                  no chão: {t.msg.left.map((it) => `${defOf(it)?.name ?? it.defId}${it.count > 1 ? ` ×${it.count}` : ""}`).join(", ")}
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

/** Faixa de notícias (drops raros / chefes): fica na pilha do topo (App), abaixo dos avisos. */
export function FeedTicker() {
  const ticker = useStore(tickerStore);
  return (
    <div class="feed-ticker" aria-live="polite">
      {ticker.map((e) => (
        <div key={e.id} class={`hud-card feed-pill kind-${e.kind}`} style={{ "--fc": e.rarity ? rarityColor(e.rarity) : FEED_COLOR[e.kind] } as never}>
          {e.text}
        </div>
      ))}
    </div>
  );
}

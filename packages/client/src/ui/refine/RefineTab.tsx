// Aba "Refinar" do Ferreiro: escolher um item (equipado ou na mochila), ver custo, chance e atributos antes → depois,
// e refinar. O servidor decide (systems/refine.ts); o resultado chega como aviso e no inventário (selo "+N").
import { C2S, itemDef, type RefineMsg } from "@lemonquest/shared";
import { useEffect, useState } from "preact/hooks";
import { useStore } from "../hud/store.ts";
import { Coin } from "../items/Gold.tsx";
import { inventoryStore } from "../items/inventory.ts";
import { fmtNum, rarityColor } from "../items/itemInfo.ts";
import { ItemIcon } from "../items/ItemIcon.tsx";
import { send } from "../items/net.ts";
import { itemTipStore } from "../items/tipStore.ts";
import { changeText, refineButton, refineCandidates, refineProgress, refineView, type RefineCandidate } from "./refineLogic.ts";
import "./refine.css";

/** Tempo máximo com o botão travado esperando a resposta (o inventário volta a cada tentativa, com sucesso ou falha). */
const PENDING_MS = 1500;

function refine(c: RefineCandidate, level: number): void {
  send(C2S.Refine, { from: c.from, uid: c.inst.uid, level } satisfies RefineMsg);
}

export function RefineTab() {
  const inv = useStore(inventoryStore);
  const [sel, setSel] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // Chegou inventário novo (ouro e gema saíram, nível subiu ou não): libera o botão.
  useEffect(() => { setPending(false); }, [inv]);
  useEffect(() => {
    if (!pending) return;
    const t = window.setTimeout(() => setPending(false), PENDING_MS);
    return () => clearTimeout(t);
  }, [pending]);

  const list = refineCandidates(inv, itemDef);
  if (list.length === 0) {
    return <div class="hud-empty refine-empty">Nada para refinar. Traga uma arma ou armadura de level 35 ou mais, na mochila ou equipada.</div>;
  }
  const cur = list.find((c) => c.inst.uid === sel) ?? list[0]!;
  const have = (id: string) => (inv?.backpack ?? []).reduce((n, it) => (it && it.defId === id ? n + it.count : n), 0);
  const v = refineView(cur, inv?.gold ?? 0, have, itemDef);
  const n = v.next;
  return (
    <div class="refine">
      <div class="refine-hint">Armas ganham +3 de ataque e armaduras +1 de armadura por nível, até +5. Se falhar, o item não quebra nem perde nível: só o ouro e a gema são gastos.</div>
      <ul class="shop-list refine-list" role="listbox" aria-label="Itens para refinar">
        {list.map((c) => {
          const on = c.inst.uid === cur.inst.uid;
          return (
            <li
              key={c.inst.uid} class={`shop-row refine-row${on ? " active" : ""}`} role="option" aria-selected={on}
              onClick={() => setSel(c.inst.uid)}
            >
              <div
                class="shop-icon"
                onPointerEnter={(e) => {
                  const rc = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  itemTipStore.set({ inst: c.inst, loc: c.from, rect: { left: rc.left, right: rc.right, top: rc.top, bottom: rc.bottom } });
                }}
                onPointerLeave={() => itemTipStore.set(null)}
              >
                <ItemIcon inst={c.inst} box={32} framed />
              </div>
              <div class="shop-main">
                <div class="shop-name" style={{ color: rarityColor(c.inst.rarity) }}>{c.def.name}</div>
                <div class="refine-where">{c.from.where === "equip" ? "Equipado" : "Mochila"} · {refineProgress(c.inst.refine ?? 0)}</div>
              </div>
            </li>
          );
        })}
      </ul>
      <div class="refine-detail" aria-live="polite">
        <div class="refine-name" style={{ color: rarityColor(cur.inst.rarity) }}>{v.name}</div>
        {n ? (
          <>
            {n.changes.map((c) => <div key={c.stat} class="refine-change">{changeText(c)}</div>)}
            <div class="refine-line">
              <span class="muted">Chance de sucesso</span>
              <b class={n.successPct >= 75 ? "good" : n.successPct >= 60 ? "" : "bad"}>{n.successPct}%</b>
            </div>
            <div class="refine-line">
              <span class="muted">Custo</span>
              <span class="refine-cost">
                <Coin size={14} /><span class={(inv?.gold ?? 0) >= n.gold ? "" : "bad"}>{fmtNum(n.gold)}</span>
                <small class={n.have >= n.materialCount ? "" : "bad"}> + {n.materialCount}x {n.materialName} ({n.have})</small>
              </span>
            </div>
          </>
        ) : (
          <div class="refine-line good">No refino máximo.</div>
        )}
        <button
          class="shop-btn refine-btn" disabled={!!v.why || pending}
          onClick={() => { if (!n) return; setPending(true); refine(cur, n.level); }}
          data-tip={v.why} data-tip-sub={n && !v.why ? `Falha: ${100 - n.successPct}% (perde só o custo)` : undefined}
        >
          {refineButton(v)}
        </button>
      </div>
    </div>
  );
}

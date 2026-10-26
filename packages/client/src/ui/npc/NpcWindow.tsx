// Janela de NPC: fala com digitação, abas Na obra / Missões / Viagem / Comprar / Vender / Depot.
import { CASINO_TICKET_PRICE, DEPOT_SIZE, IMBUEMENT_EFFECTS, IMBUEMENTS, backpackRoom, itemDef, keptBySellAll, shopBuyMax, type NpcOpenMsg } from "@lemonquest/shared";
import { useEffect, useMemo, useState } from "preact/hooks";
import { sectionsStore } from "../hud/Section.tsx";
import { persistedBool, useStore } from "../hud/store.ts";
import { useDialogFocus } from "../hud/useDialogFocus.ts";
import { useWindowDrag } from "../hud/useWindowDrag.ts";
import { meStore } from "../hud/world.ts";
import { sidebarOpen } from "../hud/uiState.ts";
import { npcBuys } from "../items/actions.ts";
import { GoldLabel, Coin } from "../items/Gold.tsx";
import { defOf, depotStore, inventoryStore } from "../items/inventory.ts";
import { fmtNum, rarityColor, sellPrice } from "../items/itemInfo.ts";
import { ItemIcon } from "../items/ItemIcon.tsx";
import { ItemSlot } from "../items/ItemSlot.tsx";
import { itemTipStore, shopInstance } from "../items/tipStore.ts";
import { buyBlessing, buyCasinoTicket, buyImbuement, buyItem, closeNpc, npcStore, npcTabs, sellAll, sellItem, setNpcTab, travelTo, type NpcTab } from "./npc.ts";
import { BountyBoard, MaterialRequestBoard, NpcQuestList } from "../quests/NpcQuests.tsx";
import { blessingProtects } from "../combat/blessingText.ts";
import { WorkTab } from "../work/WorkTab.tsx";
import "./npc.css";

const TAB_LABEL: Record<NpcTab, string> = { work: "Na obra", quests: "Missões", bounties: "Recompensas", request: "Encomenda", travel: "Viagem", buy: "Comprar", sell: "Vender", depot: "Depot" };
const TYPE_MS = 25;

export function NpcWindow() {
  const st = useStore(npcStore);
  const inv = useStore(inventoryStore);
  const drag = useWindowDrag("npc");
  useDialogFocus(drag.ref, !!st);
  if (!st) return null;
  const m = st.msg;
  const tabs = npcTabs(m);
  return (
    <div ref={drag.ref} class={`hud-card hud-window npc-window${drag.dragging ? " dragging" : ""}`} style={drag.style} role="dialog" aria-label={m.name}>
      <div class="win-title npc-title" onPointerDown={drag.onTitleDown}>
        <span class="win-grip" aria-hidden="true" />
        <span>{m.name}</span>
        <GoldLabel gold={inv?.gold ?? 0} unit={false} class="npc-gold" />
        <button class="win-close" onClick={closeNpc} data-tip="Fechar" data-tip-sub="Esc" aria-label="Fechar">×</button>
      </div>
      <div class="npc-body">
        <Typewriter text={m.greeting} nonce={st.nonce} />
        {m.blessing && <BlessingBox npcId={m.npcId} blessing={m.blessing} gold={inv?.gold ?? 0} />}
        {m.casino && <CasinoBox npcId={m.npcId} gold={inv?.gold ?? 0} />}
        {m.imbuement && <ImbuementBox npcId={m.npcId} active={m.imbuement.active} gold={inv?.gold ?? 0} />}
        {tabs.length > 0 && (
          <div class="npc-tabs" role="tablist">
            {tabs.map((t) => (
              <button key={t} class={`npc-tab${st.tab === t ? " active" : ""}`} role="tab" aria-selected={st.tab === t} onClick={() => setNpcTab(t)}>
                {TAB_LABEL[t]}
              </button>
            ))}
          </div>
        )}
        {st.tab === "work" && <WorkTab npcId={m.npcId} />}
        {st.tab === "quests" && <NpcQuestList npcId={m.npcId} />}
        {st.tab === "bounties" && <BountyBoard />}
        {st.tab === "request" && <MaterialRequestBoard />}
        {st.tab === "travel" && m.travel && <TravelList m={m} gold={inv?.gold ?? 0} />}
        {st.tab === "buy" && m.shop && <BuyList m={m} gold={inv?.gold ?? 0} backpack={inv?.backpack ?? []} />}
        {st.tab === "sell" && m.shop && <SellList m={m} />}
        {st.tab === "depot" && m.depot && <DepotGrid />}
      </div>
    </div>
  );
}

function Typewriter({ text, nonce }: { text: string; nonce: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    const t = window.setInterval(() => {
      setN((v) => {
        if (v >= text.length) { clearInterval(t); return v; }
        return v + 1;
      });
    }, TYPE_MS);
    return () => clearInterval(t);
  }, [text, nonce]);
  return (
    <div class="npc-say" onClick={() => setN(text.length)} data-tip={n < text.length ? "Clique para pular" : undefined}>
      <span>{text.slice(0, n)}</span>
      <span class="npc-say-rest">{text.slice(n)}</span>
    </div>
  );
}

/** Loja: esconder o que a sua vocação não usa (o Bento vende de tudo para todas). */
const mineOnlyStore = persistedBool("shopMineOnly", true);

function BuyList({ m, gold, backpack }: { m: NpcOpenMsg; gold: number; backpack: Parameters<typeof backpackRoom>[0] }) {
  const [qty, setQty] = useState<Record<string, number>>({});
  const me = useStore(meStore);
  const mineOnly = useStore(mineOnlyStore);
  const usable = (id: string) => { const v = itemDef(id)?.vocations; return !v || !me || v.includes(me.vocation); };
  const others = m.shop!.sells.filter((r) => !usable(r.itemId)).length;
  const rows = mineOnly ? m.shop!.sells.filter((r) => usable(r.itemId)) : m.shop!.sells;
  return (
    <>
    {others > 0 && (
      <label class="shop-filter">
        <input type="checkbox" checked={mineOnly} onChange={(e) => mineOnlyStore.set((e.currentTarget as HTMLInputElement).checked)} />
        Só da minha vocação <small>({others} {mineOnly ? (others === 1 ? "item escondido" : "itens escondidos") : (others === 1 ? "é de outra vocação" : "são de outras vocações")})</small>
      </label>
    )}
    <ul class="shop-list">
      {rows.map((r) => {
        const def = itemDef(r.itemId);
        // Lote: o maior que cabe no ouro e na mochila (mesma conta do servidor, shared/shop.ts). Encomenda especial: 1.
        const max = shopBuyMax({ price: r.price, gold, room: backpackRoom(backpack, def), limited: r.limited });
        const q = Math.min(Math.max(1, max), Math.max(1, qty[r.itemId] ?? 1));
        const total = r.price * q;
        const needLv = def?.level && me && def.level > me.level ? def.level : 0;
        // Poção e comida acima do level: o servidor recusa a compra. Equipamento continua à venda (só mostra o "Lv").
        const lvBlock = needLv > 0 && !!def?.use;
        const afford = !lvBlock && max >= q && gold >= total;
        const why = lvBlock ? `Precisa do level ${needLv}` : gold < r.price ? "Ouro insuficiente" : max < 1 ? "Mochila cheia" : undefined;
        const set = (v: number) => setQty((s) => ({ ...s, [r.itemId]: Math.max(1, Math.min(Math.max(1, max), Math.floor(v) || 1)) }));
        return (
          <li key={r.itemId} class="shop-row">
            <div
              class="shop-icon"
              onPointerEnter={(e) => {
                const rc = (e.currentTarget as HTMLElement).getBoundingClientRect();
                itemTipStore.set({ inst: shopInstance(r.itemId), rect: { left: rc.left, right: rc.right, top: rc.top, bottom: rc.bottom } });
              }}
              onPointerLeave={() => itemTipStore.set(null)}
            >
              <ItemIcon def={def} box={32} count={false} framed />
            </div>
            <div class="shop-main">
              <div class="shop-name">{def?.name ?? r.itemId}{needLv > 0 && <span class="shop-lv" data-tip={`Precisa do level ${needLv}`}> Lv {needLv}</span>}{r.limited && <span class="shop-lv" data-tip="Encomenda especial: só 1 por semana"> 1/semana</span>}</div>
              <div class="shop-price"><Coin size={14} /><span class={afford ? "" : "bad"}>{fmtNum(r.price)}</span>{q > 1 && <small> · total {fmtNum(total)}</small>}</div>
            </div>
            {!r.limited && max > 1 && (
              <div class="qty">
                <button onClick={(e) => set(q - (e.shiftKey ? 10 : 1))} aria-label="Menos" data-tip="Shift: −10">−</button>
                <input
                  type="number" min={1} max={max} value={q} aria-label={`Quantidade de ${def?.name ?? r.itemId}`}
                  onInput={(e) => set(Number((e.currentTarget as HTMLInputElement).value))}
                  onFocus={(e) => (e.currentTarget as HTMLInputElement).select()}
                  onKeyDown={(e) => { if (e.key === "Enter" && afford) buyItem(m.npcId, r.itemId, q); }}
                />
                <button onClick={(e) => set(q + (e.shiftKey ? 10 : 1))} aria-label="Mais" data-tip="Shift: +10">+</button>
                {max >= 10 && <button class="qty-preset" onClick={() => set(10)} aria-label="Quantidade 10">10</button>}
                <button class="qty-preset" onClick={() => set(max)} aria-label={`Quantidade máxima: ${max}`} data-tip={`O máximo que cabe no ouro e na mochila: ${max}`}>Máx</button>
              </div>
            )}
            <button class="shop-btn" disabled={!afford} onClick={() => buyItem(m.npcId, r.itemId, q)} data-tip={why}>
              {q > 1 ? `Comprar ${q}` : "Comprar"}
            </button>
          </li>
        );
      })}
    </ul>
    </>
  );
}

function BlessingBox({ npcId, blessing, gold }: { npcId: string; blessing: { price: number; active: boolean }; gold: number }) {
  const me = useStore(meStore);
  const afford = gold >= blessing.price;
  const protects = me ? blessingProtects(me.level, me.xp, me.skull) : "";
  return (
    <div class="shop-row blessing-row">
      <div class="shop-main">
        <div class="shop-name">Bênção</div>
        <div class="shop-price">
          {blessing.active
            ? <span class="good">Ativa: sua próxima morte não custa XP.</span>
            : <><Coin size={14} /><span class={afford ? "" : "bad"}>{fmtNum(blessing.price)}</span></>}
        </div>
        {protects && <div class="blessing-protects">{protects}</div>}
      </div>
      {!blessing.active && (
        <button class="shop-btn" disabled={!afford} onClick={() => buyBlessing(npcId)} data-tip={afford ? undefined : "Ouro insuficiente"}>
          Comprar
        </button>
      )}
    </div>
  );
}

function CasinoBox({ npcId, gold }: { npcId: string; gold: number }) {
  const afford = gold >= CASINO_TICKET_PRICE;
  return (
    <div class="shop-row blessing-row">
      <div class="shop-main">
        <div class="shop-name">Ficha de cassino</div>
        <div class="shop-price"><Coin size={14} /><span class={afford ? "" : "bad"}>{fmtNum(CASINO_TICKET_PRICE)}</span></div>
      </div>
      <button class="shop-btn" disabled={!afford} onClick={() => buyCasinoTicket(npcId)} data-tip={afford ? "Prêmio aleatório, nunca poder de combate" : "Ouro insuficiente"}>
        Comprar
      </button>
    </div>
  );
}

function ImbuementBox({ npcId, active, gold }: { npcId: string; active: string; gold: number }) {
  const inv = useStore(inventoryStore);
  const have = (id: string) => (inv?.backpack ?? []).reduce((n, it) => (it && it.defId === id ? n + it.count : n), 0);
  return (
    <ul class="shop-list">
      {IMBUEMENT_EFFECTS.map((effect) => {
        const def = IMBUEMENTS[effect];
        const got = have(def.materialId);
        const afford = gold >= def.goldPrice && got >= def.materialCount;
        const isActive = active === effect;
        return (
          <li key={effect} class="shop-row">
            <div class="shop-main">
              <div class="shop-name">{def.name}{isActive && <span class="shop-lv"> Ativo</span>}</div>
              <div class="shop-price">
                <Coin size={14} /><span class={afford ? "" : "bad"}>{fmtNum(def.goldPrice)}</span>
                <small> · {got}/{def.materialCount}x {itemDef(def.materialId)?.name ?? def.materialId}</small>
              </div>
            </div>
            <button
              class="shop-btn" disabled={isActive || !afford} onClick={() => buyImbuement(npcId, effect)}
              data-tip={def.desc} data-tip-sub={isActive ? undefined : "Substitui o encantamento ativo, sem reembolso"}
            >
              {isActive ? "Ativo" : "Trocar"}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function TravelList({ m, gold }: { m: NpcOpenMsg; gold: number }) {
  return (
    <ul class="shop-list">
      {m.travel!.map((t) => {
        const afford = gold >= t.price;
        return (
          <li key={t.id} class="shop-row">
            <div class="shop-main">
              <div class="shop-name">{t.label}</div>
              <div class="shop-price">
                {t.price > 0 ? <><Coin size={14} /><span class={afford ? "" : "bad"}>{fmtNum(t.price)}</span></> : <span>Grátis (até o level 8)</span>}
              </div>
            </div>
            <button class="shop-btn" disabled={!afford} onClick={() => travelTo(m.npcId, t.id)} data-tip={afford ? undefined : "Ouro insuficiente"}>
              Viajar
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function SellList({ m }: { m: NpcOpenMsg }) {
  const inv = useStore(inventoryStore);
  const rows = useMemo(() => {
    const out: { index: number; price: number }[] = [];
    (inv?.backpack ?? []).forEach((it, index) => {
      const def = defOf(it);
      if (it && def && npcBuys(def, m)) out.push({ index, price: sellPrice(def, m.shop?.sellRatio ?? 0.3, it.rarity) });
    });
    return out;
  }, [inv, m]);
  if (rows.length === 0) return <div class="hud-empty">Nada na mochila que {m.name.split(",")[0]} compre.</div>;
  // "Vender tudo" pula itens raros ou melhores (o servidor faz o mesmo); esses só saem pelo botão da própria linha.
  const bulk = rows.filter((r) => !keptBySellAll(inv!.backpack[r.index]!.rarity));
  const totalItems = bulk.reduce((n, r) => n + inv!.backpack[r.index]!.count, 0);
  const totalGold = bulk.reduce((n, r) => n + r.price * inv!.backpack[r.index]!.count, 0);
  const kept = rows.length - bulk.length;
  return (
    <>
    {totalItems > 0 && <SellAllBar npcId={m.npcId} items={totalItems} gold={totalGold} kept={kept} />}
    <ul class="shop-list">
      {rows.map(({ index, price }) => {
        const it = inv!.backpack[index]!;
        const def = defOf(it);
        return (
          <li key={it.uid} class="shop-row">
            <div
              class="shop-icon"
              onPointerEnter={(e) => {
                const rc = (e.currentTarget as HTMLElement).getBoundingClientRect();
                itemTipStore.set({ inst: it, loc: { where: "backpack", index }, rect: { left: rc.left, right: rc.right, top: rc.top, bottom: rc.bottom } });
              }}
              onPointerLeave={() => itemTipStore.set(null)}
            >
              <ItemIcon inst={it} box={32} framed />
            </div>
            <div class="shop-main">
              <div class="shop-name" style={{ color: rarityColor(it.rarity) }}>{def?.name ?? it.defId}</div>
              <div class="shop-price"><Coin size={14} /><span>{fmtNum(price)}</span>{it.count > 1 && <small> cada · {fmtNum(price * it.count)} no total</small>}</div>
            </div>
            <button
              class="shop-btn"
              onClick={(e) => sellItem(m.npcId, index, e.shiftKey ? it.count : 1)}
              data-tip={it.count > 1 ? "Vender 1" : "Vender"}
              data-tip-sub={it.count > 1 ? `Shift: vender os ${it.count}` : undefined}
            >
              Vender
            </button>
            {it.count > 1 && (
              <button class="shop-btn" onClick={() => sellItem(m.npcId, index, it.count)} data-tip={`Vender os ${it.count}`} data-tip-sub={`${fmtNum(price * it.count)} de ouro`}>
                Todos
              </button>
            )}
          </li>
        );
      })}
    </ul>
    </>
  );
}

/** "Vender tudo": o primeiro clique mostra o total e pede confirmação ali mesmo (some sozinha em 5 s). */
function SellAllBar({ npcId, items, gold, kept }: { npcId: string; items: number; gold: number; kept: number }) {
  const [asking, setAsking] = useState(false);
  useEffect(() => {
    if (!asking) return;
    const t = window.setTimeout(() => setAsking(false), 5000);
    return () => clearTimeout(t);
  }, [asking]);
  return (
    <div class="sell-all">
      {asking ? (
        <>
          <span>
            Vender {fmtNum(items)} {items === 1 ? "item" : "itens"} por <b>{fmtNum(gold)}</b> de ouro?
            {kept > 0 && <small class="sell-all-kept"> Itens raros ou melhores ficam na mochila.</small>}
          </span>
          <button class="shop-btn danger" onClick={() => { setAsking(false); sellAll(npcId); }}>Sim, vender</button>
          <button class="shop-btn" onClick={() => setAsking(false)}>Não</button>
        </>
      ) : (
        <button class="shop-btn" onClick={() => setAsking(true)} data-tip="Vende tudo da mochila que este NPC compra" data-tip-sub="Itens raros ou melhores ficam na mochila">
          Vender tudo ({fmtNum(items)})
        </button>
      )}
    </div>
  );
}

function DepotGrid() {
  const depot = useStore(depotStore);
  // Itens vão e vêm arrastando da mochila: com ela dobrada (padrão em tela baixa) ou a barra recolhida, o depot não
  // tinha de onde receber. Abre as duas enquanto o depot está aberto e devolve como estavam ao fechar.
  useEffect(() => {
    const hadSide = sidebarOpen.get(), hadBp = sectionsStore.get().backpack;
    if (!hadSide) sidebarOpen.set(true);
    if (!hadBp) sectionsStore.set((s) => ({ ...s, backpack: true }));
    // Depois da animação de abrir a seção (senão rola até onde ela ainda era só o cabeçalho).
    const t = setTimeout(() => document.querySelector('.hud-panel [data-panel-id="backpack"]')?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 250);
    return () => {
      clearTimeout(t);
      if (!hadBp) sectionsStore.set((s) => ({ ...s, backpack: false }));
      if (!hadSide) sidebarOpen.set(false);
    };
  }, []);
  return (
    <div class="depot">
      <div class="depot-hint">Arraste ou dê clique direito para guardar e retirar · Shift para dividir pilhas</div>
      <div class="depot-grid">
        {Array.from({ length: DEPOT_SIZE }, (_, i) => (
          <ItemSlot key={i} loc={{ where: "depot", index: i }} inst={depot?.[i]} size={40} class="depot-slot" />
        ))}
      </div>
    </div>
  );
}

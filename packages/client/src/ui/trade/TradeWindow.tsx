// Janela de troca: sua oferta × oferta do outro, mochila para escolher, e confirmação dos dois lados.
import { itemDef, refinedName, type ItemInstance, type TradeSideView } from "@lemonquest/shared";
import { useEffect, useRef, useState } from "preact/hooks";
import { useStore } from "../hud/store.ts";
import { useDialogFocus } from "../hud/useDialogFocus.ts";
import { inventoryStore } from "../items/inventory.ts";
import { ItemIcon } from "../items/ItemIcon.tsx";
import { bindOverlay } from "../overlays.ts";
import { acceptTrade, cancelTrade, confirmTrade, declineTrade, flushGold, goldDraftStore, offerItem, tradeStore, typeGold, unofferItem } from "./trade.ts";
import "../party/party.css";
import "./trade.css";

// Esc cancela a troca de qualquer lugar (não só com o foco na janela) — pela pilha de sobreposições: o que abriu por cima
// dela (menu, arrasto, ajuda...) fecha primeiro. Vindo de um campo de texto fora dela (chat), o Esc é do campo; vindo do
// campo de ouro da própria janela (".trade-window"), cancela. Mudanças de oferta não sobem a troca na pilha.
bindOverlay("trade", tradeStore, (s) => s.phase === "open", cancelTrade, ".trade-window");

const nameOf = (i: ItemInstance) => refinedName(itemDef(i.defId), i);

/** Depois que a oferta do outro muda, "Confirmar" fica travado por este tempo (dá para ver o que mudou antes de clicar). */
export const CONFIRM_LOCK_MS = 1000;

/** Assinatura da oferta (itens + quantidades + ouro): muda quando o conteúdo muda. */
const offerKey = (s: TradeSideView) => `${s.gold}|${s.items.map((i) => `${i.uid}:${i.defId}:${i.count}:${i.refine ?? 0}`).join(",")}`;

function Offer({ side, editable, title }: { side: TradeSideView; editable: boolean; title: string }) {
  const draft = useStore(goldDraftStore);
  const gold = editable && draft !== null ? draft : String(side.gold);
  return (
    <section class={`trade-side${side.confirmed ? " confirmed" : ""}`} aria-label={title}>
      <header class="trade-side-head">
        <span>{title}</span>
        {side.confirmed && <span class="trade-ok" data-testid="trade-confirmed">✓ confirmou</span>}
      </header>
      <ul class="trade-items">
        {side.items.length === 0 && <li class="trade-empty">Nenhum item</li>}
        {side.items.map((i) => (
          <li key={i.uid}>
            <button class="trade-item" disabled={!editable} onClick={() => unofferItem(i.uid)} data-tip={editable ? "Tirar da oferta" : undefined} data-offer-item={i.defId}>
              <ItemIcon inst={i} box={32} />
              <span class="trade-item-name">{nameOf(i)}{i.count > 1 ? ` ×${i.count}` : ""}</span>
            </button>
          </li>
        ))}
      </ul>
      <label class="trade-gold">
        <span>Ouro</span>
        <input
          type="number" min={0} inputMode="numeric" value={gold} readOnly={!editable} aria-label={`Ouro (${title})`}
          onInput={(e) => { if (editable) typeGold((e.target as HTMLInputElement).value); }}
          onBlur={() => { if (editable) flushGold(); }}
          onKeyDown={(e) => {
            if (e.key === "Escape") return; // sobe até o Esc da janela (cancela a troca)
            e.stopPropagation();
            if (e.key === "Enter" && editable) flushGold();
          }}
        />
      </label>
    </section>
  );
}

/** "Confirmar" travado por CONFIRM_LOCK_MS depois que a oferta do outro muda (não na abertura da janela). */
function useConfirmLock(theirs: string | null): boolean {
  const [locked, setLocked] = useState(false);
  const prev = useRef<string | null>(null);
  useEffect(() => {
    const was = prev.current;
    prev.current = theirs;
    if (theirs === null) { setLocked(false); return; }
    if (was === null || was === theirs) return;
    setLocked(true);
    const t = setTimeout(() => setLocked(false), CONFIRM_LOCK_MS);
    return () => clearTimeout(t);
  }, [theirs]);
  return locked && theirs !== null;
}

/** Convite de troca recebido: vive na .top-stack (App.tsx), abaixo dos avisos, como o convite de grupo. */
export function TradeInvite() {
  const st = useStore(tradeStore);
  if (st.phase !== "invite") return null;
  return (
    <div class="trade-invite panel" role="alertdialog" aria-label={`Convite de troca de ${st.from}`}>
      <span class="trade-invite-text"><b>{st.from}</b> quer trocar itens com você.</span>
      <span class="trade-invite-btns">
        <button class="party-btn primary" onClick={acceptTrade}>Aceitar</button>
        <button class="party-btn" onClick={declineTrade}>Recusar</button>
      </span>
    </div>
  );
}

export function TradeWindow() {
  const st = useStore(tradeStore);
  const inv = useStore(inventoryStore);
  const open = st.phase === "open";
  const locked = useConfirmLock(open ? offerKey(st.theirs) : null);
  const winRef = useRef<HTMLDivElement>(null);
  useDialogFocus(winRef, open);
  if (!open) return null;
  const offered = new Set(st.mine.items.map((i) => i.uid));
  const mineConfirmed = st.mine.confirmed;
  const status = mineConfirmed
    ? (st.theirs.confirmed ? "Trocando…" : `Aguardando ${st.partner} confirmar…`)
    : (st.theirs.confirmed ? `${st.partner} já confirmou.` : "Os dois precisam confirmar.");
  return (
    <div ref={winRef} class="trade-window panel" role="dialog" aria-label={`Troca com ${st.partner}`}>
      <div class="trade-title">
        <b>Troca com {st.partner}</b>
        <button class="trade-x" onClick={cancelTrade} aria-label="Cancelar a troca" data-tip="Cancelar a troca">×</button>
      </div>
      <div class="trade-body">
      <div class="trade-cols">
        <Offer side={st.mine} editable title="Sua oferta" />
        <Offer side={st.theirs} editable={false} title={`Oferta de ${st.partner}`} />
      </div>
      <div class="trade-bag-title">Sua mochila <span class="trade-hint">clique para ofertar · Shift: só 1</span></div>
      <div class="trade-bag">
        {(inv?.backpack ?? []).map((it) => it && (
          <button
            key={it.uid} class={`trade-bag-item${offered.has(it.uid) ? " used" : ""}`} disabled={offered.has(it.uid)}
            data-bag-item={it.defId} data-tip={nameOf(it)}
            onClick={(e) => offerItem(it, e.shiftKey ? 1 : it.count)}
          >
            <ItemIcon inst={it} box={32} />
          </button>
        ))}
      </div>
      <div class="trade-foot">
        <span class="trade-status">{status}</span>
        <button
          class={`party-btn${mineConfirmed ? "" : " primary"}`} onClick={() => confirmTrade(!mineConfirmed)} data-testid="trade-confirm"
          disabled={locked && !mineConfirmed} data-tip={locked && !mineConfirmed ? `${st.partner} mudou a oferta: confira antes de confirmar` : undefined}
        >
          {mineConfirmed ? "Desfazer confirmação" : "Confirmar troca"}
        </button>
        <button class="party-btn" onClick={cancelTrade}>Cancelar</button>
      </div>
      </div>
    </div>
  );
}

// Aba "Encantar" da Dona Marta (ciclo 16): grade 5 efeitos × 3 tiers com valor, custo, level mínimo e material
// ("você tem"; no tier III, ciclo 20, também o material extra). Comprar troca o encantamento ativo: com um ativo, o 1º
// clique só arma a confirmação (some em 5 s).
// Depois de pedir a compra os botões travam até chegar o NpcOpen novo (imbueClick): clique duplo cobrava 2×.
import {
  IMBUEMENTS, IMBUEMENT_EFFECTS, IMBUEMENT_TIERS, IMBUE_TIER_ROMAN, imbuementDef, imbuementDesc, imbuementName,
  imbuementPct, isImbuementTier, itemDef, type NpcOpenMsg,
} from "@lemonquest/shared";
import { useEffect, useState } from "preact/hooks";
import { useStore } from "../hud/store.ts";
import { meStore } from "../hud/world.ts";
import { Coin } from "../items/Gold.tsx";
import { inventoryStore } from "../items/inventory.ts";
import { fmtNum } from "../items/itemInfo.ts";
import { ItemIcon } from "../items/ItemIcon.tsx";
import { buyImbuement } from "../npc/npc.ts";
import { IMBUE_PENDING_MS, imbueClick } from "./imbueLogic.ts";
import { fmtImbueLeft } from "./imbueText.ts";
import "./imbue.css";

export function ImbuementTab({ npcId, imbue, gold }: { npcId: string; imbue: NonNullable<NpcOpenMsg["imbuement"]>; gold: number }) {
  const inv = useStore(inventoryStore);
  const me = useStore(meStore);
  const [asking, setAsking] = useState("");
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (!asking) return;
    const t = window.setTimeout(() => setAsking(""), 5000);
    return () => clearTimeout(t);
  }, [asking]);
  // A compra reabre a janela (NpcOpen novo, outro objeto `imbue`): libera os botões e desarma a confirmação.
  useEffect(() => { setPending(false); setAsking(""); }, [imbue]);
  // Recusa (ouro, material, level) só manda aviso: destrava sozinho.
  useEffect(() => {
    if (!pending) return;
    const t = window.setTimeout(() => setPending(false), IMBUE_PENDING_MS);
    return () => clearTimeout(t);
  }, [pending]);
  const have = (id: string) => (inv?.backpack ?? []).reduce((n, it) => (it && it.defId === id ? n + it.count : n), 0);
  const active = imbuementDef(imbue.active);
  const activeName = active ? imbuementName(active.effect, isImbuementTier(imbue.tier) ? imbue.tier : 1) : "";
  return (
    <div class="imbue">
      <div class="imbue-status">
        {active
          ? <span>Ativo: <b>{activeName}</b> · {fmtImbueLeft(imbue.leftMs)} de combate</span>
          : <span>Nenhum encantamento ativo.</span>}
        <small>10 h que só correm em combate contra monstros (não no boneco nem no PvP). Em magia, drenos e Perfurante valem metade.</small>
      </div>
      {asking && active && (
        <div class="imbue-confirm" role="status">Clique de novo para confirmar: <b>{activeName}</b> se perde, sem reembolso.</div>
      )}
      <div class="imbue-grid">
        <span />
        {IMBUEMENT_TIERS.map((t) => <span key={t} class="imbue-col">{IMBUE_TIER_ROMAN[t]}</span>)}
        {IMBUEMENT_EFFECTS.map((effect) => {
          const def = IMBUEMENTS[effect];
          return [
            <span key={effect} class="imbue-name" data-tip={def.name} data-tip-sub={IMBUEMENT_TIERS.map((t) => `${IMBUE_TIER_ROMAN[t]} ${imbuementPct(def.tiers[t].value)}`).join(" · ")}>{def.name}</span>,
            ...IMBUEMENT_TIERS.map((tier) => {
              const t = def.tiers[tier];
              const key = `${effect}:${tier}`;
              const got = have(t.materialId);
              const matName = itemDef(t.materialId)?.name ?? t.materialId;
              const extra = t.extra && { ...t.extra, got: have(t.extra.materialId), name: itemDef(t.extra.materialId)?.name ?? t.extra.materialId };
              const extraOk = !extra || extra.got >= extra.count;
              const lvOk = (me?.level ?? 0) >= t.minLevel, goldOk = gold >= t.goldPrice, matOk = got >= t.materialCount && extraOk;
              const isActive = active?.effect === effect && imbue.tier === tier;
              const confirming = asking === key;
              const label = confirming ? "Confirmar" : isActive ? "Renovar" : "Comprar";
              const why = !lvOk ? `Precisa do level ${t.minLevel}`
                : got < t.materialCount ? `Faltam ${t.materialCount - got}x ${matName}`
                : extra && !extraOk ? `Faltam ${extra.count - extra.got}x ${extra.name}`
                : !goldOk ? "Ouro insuficiente" : undefined;
              const click = () => {
                const act = imbueClick({ pending, hasActive: !!active, asking, key });
                if (act === "ignore") return;
                if (act === "confirm") { setAsking(key); return; }
                setAsking("");
                setPending(true);
                buyImbuement(npcId, effect, tier);
              };
              return (
                <div key={key} class={`imbue-cell${isActive ? " active" : ""}`} data-imbue={key}>
                  <div class="imbue-val" data-tip={imbuementName(effect, tier)} data-tip-sub={imbuementDesc(effect, tier)}>{imbuementPct(t.value)}</div>
                  <div class="imbue-cost"><Coin size={12} /><span class={goldOk ? "" : "bad"}>{fmtNum(t.goldPrice)}</span></div>
                  <div class="imbue-mat" data-tip={matName} data-tip-sub={`Você tem ${got} de ${t.materialCount}`}>
                    <ItemIcon def={itemDef(t.materialId)} box={16} count={false} />
                    <span class={got >= t.materialCount ? "" : "bad"}>{got}/{t.materialCount}</span>
                  </div>
                  {extra && (
                    <div class="imbue-mat" data-tip={extra.name} data-tip-sub={`Você tem ${extra.got} de ${extra.count}`}>
                      <ItemIcon def={itemDef(extra.materialId)} box={16} count={false} />
                      <span class={extraOk ? "" : "bad"}>{extra.got}/{extra.count}</span>
                    </div>
                  )}
                  {t.minLevel > 0 && <div class={`imbue-lv${lvOk ? "" : " bad"}`}>Lv {t.minLevel}</div>}
                  <button
                    class={`shop-btn imbue-btn${confirming ? " danger" : ""}`} disabled={pending || !lvOk || !goldOk || !matOk} onClick={click}
                    aria-label={`${label} ${imbuementName(effect, tier)}`} data-tip={why}
                    data-tip-sub={why ? undefined : active ? "Substitui o encantamento ativo, sem reembolso" : "10 h de combate contra monstros"}
                  >
                    {label}
                  </button>
                </div>
              );
            }),
          ];
        })}
      </div>
    </div>
  );
}

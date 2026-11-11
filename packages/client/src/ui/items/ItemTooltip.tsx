// Balão de detalhes do item: nome (cor da raridade), tipo, requisitos, atributos, comparação com o equipado, valor.
import { useEffect, useRef, useState } from "preact/hooks";
import { itemDef, refinedName } from "@lemonquest/shared";
import { useStore } from "../hud/store.ts";
import { meStore } from "../hud/world.ts";
import { defOf, inventoryStore } from "./inventory.ts";
import {
  compareStats, DAMAGE_LABEL, fmtNum, fmtStat, kindText, rarityColor, rarityLabel, requirements, statLines, useText, weaponDamage,
} from "./itemInfo.ts";
import { itemTipStore } from "./tipStore.ts";

export function ItemTooltip() {
  const tip = useStore(itemTipStore);
  const inv = useStore(inventoryStore);
  const me = useStore(meStore);
  const el = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [visible, setVisible] = useState(false);

  // Inventário mudou: o item sob o mouse pode ter sido trocado.
  useEffect(() => { itemTipStore.set(null); }, [inv]);
  useEffect(() => {
    setVisible(false);
    if (!tip) return;
    const t = window.setTimeout(() => setVisible(true), 120);
    return () => clearTimeout(t);
  }, [tip]);

  useEffect(() => {
    if (!tip || !el.current) { setPos(null); return; }
    const w = el.current.offsetWidth, h = el.current.offsetHeight;
    const r = tip.rect;
    // Prefere à esquerda do slot (a barra lateral fica à direita); senão à direita.
    let left = r.left - w - 8;
    if (left < 6) left = Math.min(window.innerWidth - w - 6, r.right + 8);
    const top = Math.max(6, Math.min(window.innerHeight - h - 6, r.top + (r.bottom - r.top) / 2 - h / 2));
    setPos({ left, top });
  }, [tip, visible]);

  const def = tip ? defOf(tip.inst) : undefined;
  let body = null;
  if (tip) {
    const inst = tip.inst;
    const col = rarityColor(inst.rarity);
    const lines = statLines(def, inst);
    const reqs = requirements(def, me ? { level: me.level, vocation: me.vocation } : null);
    const eq = def?.slot && tip.loc?.where !== "equip" ? inv?.equipment[def.slot] : undefined;
    const eqDef = defOf(eq);
    const deltas = def && eq && eq.uid !== inst.uid ? compareStats(def, inst, eqDef, eq) : [];
    const useLine = def ? useText(def) : null;
    const dmg = weaponDamage(def, inst, me, inv?.equipment ?? {}, itemDef);
    const mid = (r: [number, number]) => r[0] + r[1];
    const isWorn = tip.loc?.where === "equip";
    const unit = def?.value ?? 0;
    body = (
      <>
        <div class="it-name" style={{ color: col }}>{refinedName(def, inst)}{inst.count > 1 ? ` ×${fmtNum(inst.count)}` : ""}</div>
        <div class="it-sub">
          <span style={{ color: col }}>{rarityLabel(inst.rarity)}</span>
          {def && <span> · {kindText(def)}</span>}
          {def?.unique && <span> · Item único</span>}
        </div>
        {def?.range != null && def.slot === "weapon" && (
          <div class="it-line muted">
            {def.range > 1 ? `Alcance ${def.range} sqm` : "Corpo a corpo"}{def.damageKind && def.damageKind !== "physical" ? ` · dano de ${DAMAGE_LABEL[def.damageKind]}` : ""}
          </div>
        )}
        {dmg && (
          <div class="it-line it-dmg">
            <span class="muted">Dano por golpe: </span><b>{dmg.with[0]}–{dmg.with[1]}</b>
            {!isWorn && mid(dmg.with) !== mid(dmg.now) && (
              <span class={mid(dmg.with) > mid(dmg.now) ? "good" : "bad"}>
                {" "}{mid(dmg.with) > mid(dmg.now) ? "▲" : "▼"} atual {dmg.now[0]}–{dmg.now[1]}
              </span>
            )}
            {dmg.likeFists && <div class="muted">Igual a lutar sem arma no seu level.</div>}
          </div>
        )}
        {reqs.length > 0 && (
          <div class="it-line">
            <span class="muted">Requer: </span>
            {reqs.map((q, i) => (
              <span key={i} class={q.ok ? "" : "bad"}>{i > 0 ? " · " : ""}{q.text}</span>
            ))}
          </div>
        )}
        {lines.length > 0 && (
          <ul class="it-stats">
            {lines.map((l) => (
              <li key={l.stat}>
                <span class="muted">{l.label}</span>
                <b class={l.bonus ? "has-bonus" : ""}>
                  {fmtStat(l.stat, l.total)}
                  {l.bonus !== 0 && l.base !== 0 && <small> ({fmtStat(l.stat, l.bonus)})</small>}
                  {l.refine !== 0 && <small class="it-refine"> ({fmtStat(l.stat, l.refine)} refino)</small>}
                </b>
              </li>
            ))}
          </ul>
        )}
        {useLine && <div class="it-line good">{useLine}</div>}
        {deltas.length > 0 && (
          <div class="it-compare">
            <div class="it-cmp-head">vs. equipado: <span style={{ color: rarityColor(eq!.rarity) }}>{refinedName(eqDef, eq!)}</span></div>
            {deltas.map((d) => (
              <div key={d.stat} class={`it-cmp ${d.delta > 0 ? "up" : "down"}`}>
                <span>{d.label}</span>
                <b>{d.delta > 0 ? "▲" : "▼"} {fmtStat(d.stat, d.delta)}</b>
              </div>
            ))}
          </div>
        )}
        {def && unit > 0 && (
          <div class="it-value">
            Valor: <b>{fmtNum(unit)}</b> ouro{inst.count > 1 ? ` (total ${fmtNum(unit * inst.count)})` : ""}
          </div>
        )}
        {def?.description && <div class="it-desc">{def.description}</div>}
      </>
    );
  }

  return (
    <div
      ref={el}
      class={`item-tooltip${tip && visible && pos ? " show" : ""}`}
      style={pos ? { left: `${pos.left}px`, top: `${pos.top}px`, "--rc": tip ? rarityColor(tip.inst.rarity) : "#fff" } : { left: "-9999px", top: "0" }}
      role="tooltip"
    >
      {body}
    </div>
  );
}

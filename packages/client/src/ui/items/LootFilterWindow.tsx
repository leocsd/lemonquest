// Janela "Loot automático": todos os itens que caem de monstro, por grupo, cada um com um marcador. Marcado entra sozinho
// na mochila; desmarcado fica no chão onde o bicho morreu. Abre pelo funil do trilho ou do cabeçalho da Mochila.
// A regra é do servidor (shared/lootFilter.ts); aqui só a escolha, enviada em lote (items/lootFilter.ts).
import { LOOT_GROUPS, LOOTABLE_ITEMS, lootFilterSummary, type LootGroup } from "@lemonquest/shared";
import { useMemo, useState } from "preact/hooks";
import { createStore, useStore } from "../hud/store.ts";
import { useDialogFocus } from "../hud/useDialogFocus.ts";
import { useWindowDrag } from "../hud/useWindowDrag.ts";
import { bindOverlay } from "../overlays.ts";
import { ItemIcon } from "./ItemIcon.tsx";
import { fmtNum } from "./itemInfo.ts";
import { flushLootFilter, lootFilterStore, setLootFilter } from "./lootFilter.ts";
import { LOOT_VALUE_STEPS, cheaperThan, searchItems, takenCount, withSkipped } from "./lootFilterLogic.ts";
import "./lootFilter.css";

export const lootFilterOpen = createStore(false);
// Esc pela pilha de sobreposições (a última janela aberta fecha primeiro), também com o foco no campo de busca (`within`).
// Fechar manda o que ainda não foi enviado.
bindOverlay("lootFilter", lootFilterOpen, (v) => v, () => closeLootFilter(), ".lootf-win");
export function closeLootFilter(): void {
  lootFilterOpen.set(false);
  flushLootFilter();
}
export function toggleLootFilter(): void {
  if (lootFilterOpen.get()) closeLootFilter(); else lootFilterOpen.set(true);
}

export function LootFilterWindow() {
  const open = useStore(lootFilterOpen);
  if (!open) return null;
  return <LootFilterDialog />;
}

function LootFilterDialog() {
  const f = useStore(lootFilterStore);
  const [query, setQuery] = useState("");
  const drag = useWindowDrag("lootFilter");
  useDialogFocus(drag.ref);
  const skipSet = useMemo(() => new Set(f.skip), [f.skip]);
  const groups = useMemo(() => LOOT_GROUPS.map((g) => ({ ...g, items: searchItems(g.items, query) })).filter((g) => g.items.length > 0), [query]);
  const set = (ids: readonly string[], skipped: boolean) => setLootFilter({ skip: withSkipped(f.skip, ids, skipped) });
  const taken = LOOTABLE_ITEMS.length - f.skip.filter((id) => LOOTABLE_ITEMS.some((d) => d.id === id)).length;
  return (
    <div ref={drag.ref} class={`hud-card hud-window lootf-win${drag.dragging ? " dragging" : ""}`} style={drag.style} role="dialog" aria-label="Loot automático">
      <div class="win-title" onPointerDown={drag.onTitleDown}>
        <span class="win-grip" aria-hidden="true" />
        <span>Loot automático <span class="lootf-sum">{lootFilterSummary(f)} · {taken}/{LOOTABLE_ITEMS.length} entram</span></span>
        <button class="win-close" onClick={closeLootFilter} data-tip="Fechar" data-tip-sub="Esc" aria-label="Fechar">×</button>
      </div>
      <div class="lootf-tools" role="group" aria-label="Ferramentas">
        <input
          class="lootf-search" type="search" placeholder="Buscar item" aria-label="Buscar item" value={query}
          onInput={(e) => setQuery((e.currentTarget as HTMLInputElement).value)}
        />
        <select
          class="lootf-below" aria-label="Desmarcar o que vale menos de" value=""
          onChange={(e) => { const v = Number((e.currentTarget as HTMLSelectElement).value); if (v > 0) set(cheaperThan(LOOTABLE_ITEMS, v), true); (e.currentTarget as HTMLSelectElement).value = ""; }}
        >
          <option value="">Desmarcar o que vale menos de…</option>
          {LOOT_VALUE_STEPS.map((v) => <option key={v} value={String(v)}>{fmtNum(v)} de ouro</option>)}
        </select>
        <button class="btn lootf-all" onClick={() => setLootFilter({ skip: [] })} disabled={f.skip.length === 0}>Marcar tudo</button>
      </div>
      <div class="lootf-note">
        Marcado entra sozinho na mochila. Desmarcado fica no chão onde o bicho morreu (10 min, de quem quiser). Ouro, itens de missão e raros ou melhores entram sempre.
      </div>
      <div class="lootf-body">
        {groups.length === 0 && <div class="lootf-empty">Nenhum item com esse nome.</div>}
        {groups.map((g) => <Group key={g.id} g={g} skip={skipSet} set={set} />)}
      </div>
    </div>
  );
}

function Group({ g, skip, set }: { g: LootGroup; skip: ReadonlySet<string>; set: (ids: readonly string[], skipped: boolean) => void }) {
  const ids = g.items.map((d) => d.id);
  const taken = takenCount(g.items, [...skip]);
  return (
    <section class="lootf-group" aria-label={g.label}>
      <header class="lootf-head">
        <span class="lootf-label">{g.label}</span>
        <span class={`lootf-count${taken < g.items.length ? " partial" : ""}`}>{taken}/{g.items.length}</span>
        <span class="lootf-bulk">
          <button class="lootf-mini" onClick={() => set(ids, false)} disabled={taken === g.items.length}>Todos</button>
          <button class="lootf-mini" onClick={() => set(ids, true)} disabled={taken === 0}>Nenhum</button>
        </span>
      </header>
      <ul class="lootf-list">
        {g.items.map((d) => {
          const off = skip.has(d.id);
          return (
            <li key={d.id}>
              <label class={`lootf-item${off ? " off" : ""}`} data-item={d.id}>
                <input type="checkbox" checked={!off} onChange={(e) => set([d.id], !(e.currentTarget as HTMLInputElement).checked)} aria-label={d.name} />
                <ItemIcon def={d} box={22} count={false} framed />
                <span class="lootf-name">{d.name}</span>
                <span class="lootf-val">{d.level ? `lv ${d.level} · ` : ""}{fmtNum(d.value)}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

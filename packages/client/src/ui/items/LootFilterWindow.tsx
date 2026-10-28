// Janela "Loot automático": todos os itens que caem de monstro, por grupo (materiais, comida, poções, armas por tipo e o
// resto do equipamento por peça), cada um com um marcador. Marcado entra sozinho na mochila; desmarcado fica no chão onde
// o bicho morreu. Filtros de visualização (busca, categoria, vocação, level, zona) só escolhem o que aparece; as ações em
// lote valem para o que está visível. Abre pelo funil do trilho ou do cabeçalho da Mochila. A regra é do servidor
// (shared/lootFilter.ts); aqui só a escolha, enviada em lote (items/lootFilter.ts).
import {
  LOOTABLE_ITEMS, LOOT_CATEGORY_LABEL, LOOT_CATEGORY_ORDER, LOOT_GROUPS, MONSTERS, PLAYABLE_VOCATIONS, lootFilterSummary, type ItemDef, type LootCategory, type LootGroup, type Vocation,
} from "@lemonquest/shared";
import { useMemo, useState } from "preact/hooks";
import { worldIndexStore } from "../../game/worldIndex.ts";
import { createStore, useStore } from "../hud/store.ts";
import { useDialogFocus } from "../hud/useDialogFocus.ts";
import { useWindowDrag } from "../hud/useWindowDrag.ts";
import { VOCATION_META } from "../hud/vocations.ts";
import { meStore } from "../hud/world.ts";
import { bindOverlay } from "../overlays.ts";
import { ItemIcon } from "./ItemIcon.tsx";
import { fmtNum } from "./itemInfo.ts";
import { flushLootFilter, lootFilterStore, setLootFilter } from "./lootFilter.ts";
import {
  LOOT_LEVEL_BANDS, LOOT_VALUE_STEPS, NO_VIEW, applyLootView, cheaperThan, isNoView, itemZonesIndex, lootZones, takenCount, withSkipped, type LootView,
} from "./lootFilterLogic.ts";
import "./lootFilter.css";

export const lootFilterOpen = createStore(false);
// Esc pela pilha de sobreposições (a última janela aberta fecha primeiro), também com o foco num campo da janela (`within`).
// Fechar manda o que ainda não foi enviado.
bindOverlay("lootFilter", lootFilterOpen, (v) => v, () => closeLootFilter(), ".lootf-win");
export function closeLootFilter(): void {
  lootFilterOpen.set(false);
  flushLootFilter();
}
export function toggleLootFilter(): void {
  if (lootFilterOpen.get()) closeLootFilter(); else lootFilterOpen.set(true);
}

const MONSTER_DEFS = Object.values(MONSTERS);

export function LootFilterWindow() {
  const open = useStore(lootFilterOpen);
  if (!open) return null;
  return <LootFilterDialog />;
}

function LootFilterDialog() {
  const f = useStore(lootFilterStore);
  const me = useStore(meStore);
  const idx = useStore(worldIndexStore);
  const [view, setView] = useState<LootView>(NO_VIEW);
  const drag = useWindowDrag("lootFilter");
  useDialogFocus(drag.ref);
  const zones = useMemo(() => itemZonesIndex(idx, MONSTER_DEFS), [idx]);
  const zoneNames = useMemo(() => lootZones(zones), [zones]);
  const ctx = useMemo(() => ({ myLevel: me?.level ?? 1, zones }), [me?.level, zones]);
  const skipSet = useMemo(() => new Set(f.skip), [f.skip]);
  const groups = useMemo(
    () => LOOT_GROUPS.map((g) => ({ ...g, items: applyLootView(g.items, view, ctx) })).filter((g) => g.items.length > 0),
    [view, ctx],
  );
  const visible = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const filtered = !isNoView(view);
  const set = (ids: readonly string[], skipped: boolean) => setLootFilter({ skip: withSkipped(f.skip, ids, skipped) });
  const patch = (p: Partial<LootView>) => setView((v) => ({ ...v, ...p }));
  const taken = takenCount(LOOTABLE_ITEMS, f.skip);
  const visibleTaken = takenCount(visible, f.skip);
  const sel = (e: Event) => (e.currentTarget as HTMLSelectElement).value;
  return (
    <div ref={drag.ref} class={`hud-card hud-window lootf-win${drag.dragging ? " dragging" : ""}`} style={drag.style} role="dialog" aria-label="Loot automático">
      <div class="win-title" onPointerDown={drag.onTitleDown}>
        <span class="win-grip" aria-hidden="true" />
        <span>Loot automático <span class="lootf-sum">{lootFilterSummary(f)} · {taken}/{LOOTABLE_ITEMS.length} entram</span></span>
        <button class="win-close" onClick={closeLootFilter} data-tip="Fechar" data-tip-sub="Esc" aria-label="Fechar">×</button>
      </div>
      <div class="lootf-tools" role="group" aria-label="Filtros">
        <input
          class="lootf-search" type="search" placeholder="Buscar item" aria-label="Buscar item" value={view.query}
          onInput={(e) => patch({ query: (e.currentTarget as HTMLInputElement).value })}
        />
        <select class="lootf-sel" aria-label="Categoria" value={view.category} onChange={(e) => patch({ category: sel(e) as LootCategory | "all" })}>
          <option value="all">Todas as categorias</option>
          {LOOT_CATEGORY_ORDER.map((c) => <option key={c} value={c}>{LOOT_CATEGORY_LABEL[c]}</option>)}
        </select>
        <select class="lootf-sel" aria-label="Vocação" value={view.vocation} onChange={(e) => patch({ vocation: sel(e) as Vocation | "all" })}>
          <option value="all">Todas as vocações</option>
          {me && <option value={me.vocation}>Minha ({VOCATION_META[me.vocation]?.label ?? me.vocation})</option>}
          {PLAYABLE_VOCATIONS.filter((v) => v !== me?.vocation).map((v) => <option key={v} value={v}>{VOCATION_META[v].label}</option>)}
        </select>
        <select class="lootf-sel" aria-label="Level" value={String(view.level)} onChange={(e) => { const v = sel(e); patch({ level: v === "all" || v === "mine" ? v : Number(v) }); }}>
          <option value="all">Todos os levels</option>
          {me && <option value="mine">Até o meu level ({me.level})</option>}
          {LOOT_LEVEL_BANDS.map((b, i) => <option key={b.label} value={String(i)}>Lv {b.label}</option>)}
        </select>
        {zoneNames.length > 0 && (
          <select class="lootf-sel" aria-label="Zona onde cai" value={view.zone} onChange={(e) => patch({ zone: sel(e) })}>
            <option value="">Cai em qualquer zona</option>
            {zoneNames.map((z) => <option key={z} value={z}>{z}</option>)}
          </select>
        )}
      </div>
      <div class="lootf-actions" role="group" aria-label="Ações">
        <span class="lootf-shown">{filtered ? `${visible.length} de ${LOOTABLE_ITEMS.length} itens` : `${LOOTABLE_ITEMS.length} itens`}</span>
        <button class="lootf-mini" onClick={() => set(visible.map((d) => d.id), false)} disabled={visibleTaken === visible.length}>Marcar {filtered ? "visíveis" : "tudo"}</button>
        <button class="lootf-mini" onClick={() => set(visible.map((d) => d.id), true)} disabled={visibleTaken === 0}>Desmarcar {filtered ? "visíveis" : "tudo"}</button>
        <select
          class="lootf-sel lootf-below" aria-label="Desmarcar o que vale menos de" value=""
          onChange={(e) => { const v = Number(sel(e)); if (v > 0) set(cheaperThan(visible, v), true); (e.currentTarget as HTMLSelectElement).value = ""; }}
        >
          <option value="">Desmarcar abaixo de…</option>
          {LOOT_VALUE_STEPS.map((v) => <option key={v} value={String(v)}>{fmtNum(v)} de ouro</option>)}
        </select>
        {f.skip.length > 0 && <button class="lootf-mini lootf-reset" onClick={() => setLootFilter({ skip: [] })}>Pegar tudo de novo</button>}
        {filtered && <button class="lootf-mini" onClick={() => setView(NO_VIEW)}>Limpar filtros</button>}
      </div>
      <div class="lootf-note">
        Marcado entra sozinho na mochila. Desmarcado fica no chão onde o bicho morreu (10 min, de quem quiser). Ouro, itens de missão e raros ou melhores entram sempre.
      </div>
      <div class="lootf-body">
        {groups.length === 0 && <div class="lootf-empty">Nenhum item com esses filtros.</div>}
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
        {g.items.map((d) => <Row key={d.id} d={d} off={skip.has(d.id)} set={set} />)}
      </ul>
    </section>
  );
}

function Row({ d, off, set }: { d: ItemDef; off: boolean; set: (ids: readonly string[], skipped: boolean) => void }) {
  const voc = d.vocations?.length ? d.vocations.map((v) => VOCATION_META[v]?.label ?? v).join("/") : "";
  return (
    <li>
      <label class={`lootf-item${off ? " off" : ""}`} data-item={d.id} title={voc ? `Só ${voc}` : undefined}>
        <input type="checkbox" checked={!off} onChange={(e) => set([d.id], !(e.currentTarget as HTMLInputElement).checked)} aria-label={d.name} />
        <ItemIcon def={d} box={22} count={false} framed />
        <span class="lootf-name">{d.name}</span>
        <span class="lootf-val">{d.level ? `lv ${d.level} · ` : ""}{fmtNum(d.value)}</span>
      </label>
    </li>
  );
}

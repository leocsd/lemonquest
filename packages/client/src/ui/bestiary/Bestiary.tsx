// Bestiário (tecla B): monstros que você já derrotou, com vida, XP, dano, onde vivem e o que podem soltar. Os que ainda
// não foram derrotados aparecem como "???" (o level e a zona ficam visíveis para dar uma ideia de onde procurar).
// Filtros por zona, faixa de level e conhecidos (ciclo 17).
import { MONSTERS, itemDef, monsterResistances } from "@lemonquest/shared";
import { useMemo, useState } from "preact/hooks";
import { worldIndexStore } from "../../game/worldIndex.ts";
import { createStore, useStore } from "../hud/store.ts";
import { useDialogFocus } from "../hud/useDialogFocus.ts";
import { useWindowDrag } from "../hud/useWindowDrag.ts";
import { achievementsStore, requestAchievements } from "../achievements/achievements.ts";
import { bindOverlay } from "../overlays.ts";
import { monsterZones } from "../quests/questInfo.ts";
import {
  BESTIARY_BANDS, NO_FILTER, bestiaryRows, bestiaryZones, chanceText, damageLabel, elementLines, filterBestiary, progressText,
  whereText, type BestiaryFilter,
} from "./bestiaryLogic.ts";
import "./bestiary.css";

export const bestiaryOpen = createStore(false);
// Esc pela pilha de sobreposições (registrado no instante em que abre: a última janela aberta fecha primeiro).
bindOverlay("bestiary", bestiaryOpen, (v) => v, () => bestiaryOpen.set(false));
export function toggleBestiary(): void {
  const open = !bestiaryOpen.get();
  bestiaryOpen.set(open);
  if (open) requestAchievements();
}

const DEFS = Object.values(MONSTERS);

export function BestiaryWindow() {
  const open = useStore(bestiaryOpen);
  if (!open) return null;
  return <BestiaryDialog />;
}

function BestiaryDialog() {
  const ach = useStore(achievementsStore);
  const idx = useStore(worldIndexStore);
  const rows = useMemo(() => bestiaryRows(DEFS, ach?.bestiary, (id) => monsterZones(idx, id)), [ach, idx]);
  const zones = useMemo(() => bestiaryZones(rows), [rows]);
  const [filter, setFilter] = useState<BestiaryFilter>(NO_FILTER);
  const shown = filterBestiary(rows, filter);
  const [sel, setSel] = useState<string>("");
  const drag = useWindowDrag("bestiary");
  useDialogFocus(drag.ref);
  const set = (p: Partial<BestiaryFilter>) => setFilter((f) => ({ ...f, ...p }));
  const row = shown.find((r) => r.id === sel) ?? shown.find((r) => r.known) ?? shown[0];
  const def = row ? MONSTERS[row.id] : undefined;
  const el = def ? elementLines(monsterResistances(def)) : null;
  return (
    <div ref={drag.ref} class={`hud-card hud-window bestiary-win${drag.dragging ? " dragging" : ""}`} style={drag.style} role="dialog" aria-label="Bestiário">
      <div class="win-title" onPointerDown={drag.onTitleDown}>
        <span class="win-grip" aria-hidden="true" />
        <span>Bestiário <span class="be-progress">{progressText(rows)}</span></span>
        <button class="win-close" onClick={() => bestiaryOpen.set(false)} data-tip="Fechar" data-tip-sub="B ou Esc" aria-label="Fechar">×</button>
      </div>
      <div class="be-filters" role="group" aria-label="Filtros do bestiário">
        <select value={filter.zone} onChange={(e) => set({ zone: (e.target as HTMLSelectElement).value })} aria-label="Zona">
          <option value="">Todas as zonas</option>
          {zones.map((z) => <option key={z} value={z}>{z}</option>)}
        </select>
        <select value={String(filter.band)} onChange={(e) => set({ band: Number((e.target as HTMLSelectElement).value) })} aria-label="Faixa de level">
          <option value="-1">Todos os levels</option>
          {BESTIARY_BANDS.map((b, i) => <option key={b.label} value={String(i)}>Lv {b.label}</option>)}
        </select>
        <select value={filter.seen} onChange={(e) => set({ seen: (e.target as HTMLSelectElement).value as BestiaryFilter["seen"] })} aria-label="Conhecidos">
          <option value="all">Todos</option>
          <option value="known">Conhecidos</option>
          <option value="unknown">Ainda não derrotados</option>
        </select>
      </div>
      <div class="be-body">
        <ul class="be-list">
          {shown.length === 0 && <li class="be-empty">Nenhum monstro com esses filtros.</li>}
          {shown.map((r) => (
            <li key={r.id}>
              <button class={`be-item${row?.id === r.id ? " sel" : ""}${r.known ? "" : " unknown"}`} onClick={() => setSel(r.id)} data-monster={r.id}>
                <span class="be-name">{r.boss ? "☠ " : ""}{r.known ? r.name : "???"}</span>
                <span class="be-lv">Lv {r.level}</span>
              </button>
            </li>
          ))}
        </ul>
        <div class="be-detail">
          {!row || !def ? null : !row.known ? (
            <div class="be-unknown">
              Você ainda não derrotou este monstro (level {row.level}).<br />Derrote-o para registrar o que ele faz e o que solta.
              {idx && <><br /><br />Onde procurar: {whereText(row.zones)}.</>}
            </div>
          ) : (
            <>
              <h3>{row.boss ? "☠ " : ""}{def.name} <span class="be-lv">Lv {def.level}</span></h3>
              <div class="be-kills">Abates: <b>{row.kills.toLocaleString("pt-BR")}</b></div>
              <dl class="be-stats">
                {idx && <><dt>Onde vive</dt><dd>{whereText(row.zones)}</dd></>}
                <dt>Vida</dt><dd>{def.hp.toLocaleString("pt-BR")}</dd>
                <dt>XP</dt><dd>{def.xp.toLocaleString("pt-BR")}</dd>
                <dt>Dano</dt><dd>{def.damage[0]}–{def.damage[1]} ({damageLabel(def.damageKind)}){def.attackRange > 1 ? ` · alcance ${def.attackRange}` : ""}</dd>
                <dt>Armadura</dt><dd>{def.armor}</dd>
                {el?.resists && <><dt>Resiste a</dt><dd>{el.resists}</dd></>}
                {el?.weak && <><dt>Fraco contra</dt><dd>{el.weak}</dd></>}
                {def.gold && <><dt>Ouro</dt><dd>{def.gold[0]}–{def.gold[1]}</dd></>}
                {def.fleeAtHpPct > 0 && <><dt>Comportamento</dt><dd>foge com {Math.round(def.fleeAtHpPct * 100)}% de vida</dd></>}
              </dl>
              <div class="be-loot-title">Pode soltar</div>
              <ul class="be-loot">
                {(def.loot ?? []).length === 0 && <li class="be-empty">Nada além de ouro.</li>}
                {(def.loot ?? []).map((l) => (
                  <li key={l.itemId}><span>{itemDef(l.itemId)?.name ?? l.itemId}{l.max && l.max > 1 ? ` (${l.min ?? 1}–${l.max})` : ""}</span><span class="be-chance">{chanceText(l.chance)}</span></li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

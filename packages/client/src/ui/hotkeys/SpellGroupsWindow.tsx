// Painel "Grupos de magia" (botão nos Atalhos, tecla H): o jogador monta as próprias famílias (tecla inteligente).
// Esquerda: os grupos dele e os modelos prontos (copiar vira grupo dele). Direita: nome, ordem de prioridade (arrastar,
// ↑↓, ✕), magias para adicionar (clique ou arrastar para a posição) e a prévia ao vivo de qual magia sairia agora.
// Tudo aplica na hora e vai ao servidor junto com os atalhos (hotkeys.ts: setSpellGroups).
import {
  GROUP_MAX, GROUP_NAME_MAX, GROUP_SPELLS_MAX, familiesFor, groupFamily, pickFromFamily, spellDef, spellMana, spellsFor,
  type SpellDef, type SpellFamily, type SpellGroup, type Vocation,
} from "@lemonquest/shared";
import { useEffect, useState } from "preact/hooks";
import { spellCooldownLeft } from "../hud/castbar.ts";
import { spellIcon } from "../hud/spellIcons.ts";
import { createStore, useStore } from "../hud/store.ts";
import { useDialogFocus } from "../hud/useDialogFocus.ts";
import { clampWindowPos, useWindowDrag } from "../hud/useWindowDrag.ts";
import { meStore } from "../hud/world.ts";
import { bindOverlay } from "../overlays.ts";
import { addSpell, createGroup, deleteGroup, moveSpell, placeGroup, removeSpell, renameGroup } from "./groupsEdit.ts";
import { effectiveHotkeys, groupsStore, hotkeyLabel, hotkeysStore, setSpellGroups } from "./hotkeys.ts";
import "./groups.css";

const W = 600;
const defaultPos = () => clampWindowPos((window.innerWidth - W) / 2 + 60, 70, W);

export const groupsOpen = createStore(false);
export const toggleGroups = () => groupsOpen.set((v) => !v);
bindOverlay("spell-groups", groupsOpen, (v) => v, () => groupsOpen.set(false));

/** Tipo da magia para os filtros e a etiqueta. */
type Kind = "alvo" | "area" | "onda" | "cura" | "outras";
const KIND_LABEL: Record<Kind, string> = { alvo: "No alvo", area: "Área", onda: "Onda", cura: "Cura", outras: "Outras" };
function kindOf(s: SpellDef): Kind {
  if (s.heal) return "cura";
  if (!s.damage) return "outras";
  if (s.target === "wave") return "onda";
  if (s.target === "area_self" || s.target === "area_target") return "area";
  return "alvo";
}

/** Dado do arrastar: magia vinda da paleta ("add:<id>") ou linha da lista ("row:<índice>"). */
const DND = "application/x-lq-spell";

function SpellIcon({ s, locked }: { s: SpellDef; locked?: boolean }) {
  return <img class={`sg-icon${locked ? " locked" : ""}`} src={spellIcon(s.fx, s.target)} alt="" draggable={false} />;
}

export function SpellGroupsWindow() {
  const open = useStore(groupsOpen);
  const me = useStore(meStore);
  const groups = useStore(groupsStore);
  useStore(hotkeysStore);
  const drag = useWindowDrag("spellGroups", defaultPos);
  useDialogFocus(drag.ref, open);
  const [sel, setSel] = useState<string | null>(null);
  const [filter, setFilter] = useState<Kind | "todas">("todas");
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [dropAt, setDropAt] = useState<number | null>(null);
  /** Nome sendo digitado: vazio não é aplicado (senão viraria "Grupo <n>" no meio da digitação). */
  const [draft, setDraft] = useState<string | null>(null);
  const [, tick] = useState(0);

  // Prévia ao vivo (recargas e mana mudam a magia que sairia): redesenha 4×/s enquanto aberto.
  useEffect(() => {
    if (!open) return;
    const t = window.setInterval(() => tick((n) => n + 1), 250);
    return () => window.clearInterval(t);
  }, [open]);
  useEffect(() => { if (!msg) return; const t = window.setTimeout(() => setMsg(null), 4000); return () => window.clearTimeout(t); }, [msg]);
  useEffect(() => { setConfirmDel(false); setDraft(null); }, [sel]);

  const voc = me?.vocation as Vocation | undefined;
  if (!open || !me || !voc) return null;

  const current = groups.find((g) => g.id === sel) ?? groups[0] ?? null;
  const hotkeys = effectiveHotkeys(voc);
  const keyOf = (id: string) => hotkeys.find((h) => h.spellId === id)?.key;
  const say = (text?: string, error?: boolean) => setMsg(text ? { text, error } : null);
  const apply = (next: SpellGroup[]) => setSpellGroups(next);

  const onCreate = (from?: SpellFamily) => {
    const r = createGroup(groups, from);
    say(r.message, r.error);
    if (r.error) return;
    apply(r.groups);
    setSel(r.select ?? null);
  };
  const onAdd = (spellId: string, at?: number) => {
    if (!current) return;
    const r = addSpell(groups, current.id, spellId, at);
    say(r.message, r.error);
    if (!r.error) apply(r.groups);
  };

  /** Previsão: magia que a tecla soltaria agora (liberada, fora de recarga e com mana) e a ordem no level atual. */
  const fam = current ? groupFamily(current, voc) : null;
  const ready = (s: SpellDef) => spellCooldownLeft(s.id) === 0 && spellMana(s, me.level) <= me.mana;
  const now = fam ? pickFromFamily(fam, me.level, ready) : null;

  const palette = spellsFor(voc).filter((s) => !current?.spells.includes(s.id) && (filter === "todas" || kindOf(s) === filter));

  const onDrop = (e: DragEvent, at: number) => {
    e.preventDefault();
    setDropAt(null);
    const data = e.dataTransfer?.getData(DND) ?? "";
    if (!current) return;
    if (data.startsWith("add:")) onAdd(data.slice(4), at);
    else if (data.startsWith("row:")) {
      const from = Number(data.slice(4));
      apply(moveSpell(groups, current.id, from, from < at ? at - 1 : at));
    }
  };

  return (
    <div ref={drag.ref} class={`hud-card hud-window groups-win${drag.dragging ? " dragging" : ""}`} style={{ ...drag.style, width: `${W}px` }} role="dialog" aria-label="Grupos de magia">
      <div class="win-title" onPointerDown={drag.onTitleDown}>
        <span class="win-grip" aria-hidden="true" />
        <span>Grupos de magia</span>
        <button class="win-close" onClick={() => groupsOpen.set(false)} data-tip="Fechar" data-tip-sub="Esc" aria-label="Fechar">×</button>
      </div>
      <div class="win-body sg-body">
        <aside class="sg-side">
          <div class="sg-side-head">
            <span>Meus grupos</span>
            <span class="sg-count">{groups.length}/{GROUP_MAX}</span>
          </div>
          <ul class="sg-groups">
            {groups.map((g) => {
              const k = keyOf(g.id);
              return (
                <li key={g.id}>
                  <button class={`sg-group${current?.id === g.id ? " active" : ""}`} onClick={() => setSel(g.id)} aria-pressed={current?.id === g.id}>
                    <span class="sg-gname">◆ {g.name}</span>
                    <span class="sg-gmeta">
                      {g.spells.length} {g.spells.length === 1 ? "magia" : "magias"}
                      {k ? <kbd>{hotkeyLabel(k)}</kbd> : <span class="sg-off">fora da barra</span>}
                    </span>
                  </button>
                </li>
              );
            })}
            {groups.length === 0 && <li class="sg-empty">Nenhum grupo ainda. Crie um ou copie um modelo.</li>}
          </ul>
          <button class="hk-btn sg-new" disabled={groups.length >= GROUP_MAX} onClick={() => onCreate()}>+ Novo grupo</button>
          <div class="sg-side-head sg-models-head"><span>Modelos</span></div>
          <ul class="sg-models">
            {familiesFor(voc).map((f) => (
              <li key={f.id}>
                <button class="sg-model" disabled={groups.length >= GROUP_MAX} onClick={() => onCreate(f)} data-tip={`Copiar "${f.name}"`} data-tip-sub={f.desc}>
                  <span>◆ {f.name}</span><span class="sg-copy">copiar</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section class="sg-main">
          {!current ? (
            <div class="sg-intro">
              <p><b>Monte a sua tecla inteligente.</b> Junte as magias que quiser num grupo e coloque na ordem: ao apertar a
                tecla, sai a <b>primeira da lista</b> que estiver pronta (liberada no seu level, fora de recarga, com mana e no alcance).</p>
              <p>Comece com <b>+ Novo grupo</b> ou copie um dos modelos para ajustar.</p>
            </div>
          ) : (
            <>
              <div class="sg-head">
                <input
                  class="sg-name"
                  value={draft ?? current.name}
                  maxLength={GROUP_NAME_MAX}
                  aria-label="Nome do grupo"
                  onInput={(e) => {
                    const v = (e.currentTarget as HTMLInputElement).value;
                    setDraft(v);
                    if (v.trim()) apply(renameGroup(groups, current.id, v));
                  }}
                  onBlur={() => setDraft(null)}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur(); }}
                />
                {keyOf(current.id)
                  ? <span class="sg-onbar">Na barra: <kbd>{hotkeyLabel(keyOf(current.id)!)}</kbd></span>
                  : (
                    <button class="hk-btn sg-place" onClick={() => {
                      const r = placeGroup(hotkeys, current.id, hotkeyLabel);
                      say(r.message, r.error);
                      if (!r.error) setSpellGroups(groups, r.list);
                    }}>Pôr na barra</button>
                  )}
              </div>

              <div class={`sg-preview${now ? "" : " idle"}`} role="status">
                {current.spells.length === 0 ? "Adicione magias abaixo: clique ou arraste para a lista."
                  : now ? <>Agora sairia: <SpellIcon s={now} /> <b>{now.name}</b></>
                  : "Agora nenhuma sairia (recarga, mana ou level)."}
              </div>

              <div class="sg-label">Ordem de prioridade <span>({current.spells.length}/{GROUP_SPELLS_MAX}) · arraste para reordenar</span></div>
              <ol
                class={`sg-order${dropAt !== null ? " dragging" : ""}`}
                onDragOver={(e) => { e.preventDefault(); if (dropAt === null) setDropAt(current.spells.length); }}
                onDragLeave={(e) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setDropAt(null); }}
                onDrop={(e) => onDrop(e, dropAt ?? current.spells.length)}
              >
                {current.spells.map((id, i) => {
                  const s = spellDef(id);
                  if (!s) return null;
                  const locked = s.level > me.level;
                  const cd = spellCooldownLeft(s.id);
                  return (
                    <li
                      key={id}
                      class={`sg-row${locked ? " locked" : ""}${now?.id === id ? " now" : ""}${dropAt === i ? " drop-before" : ""}`}
                      draggable
                      onDragStart={(e) => { e.dataTransfer?.setData(DND, `row:${i}`); if (e.dataTransfer) e.dataTransfer.effectAllowed = "move"; }}
                      onDragEnd={() => setDropAt(null)}
                      onDragOver={(e) => {
                        e.preventDefault();
                        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        setDropAt(e.clientY < r.top + r.height / 2 ? i : i + 1);
                      }}
                    >
                      <span class="sg-grip" aria-hidden="true">⋮⋮</span>
                      <span class="sg-pos">{i + 1}</span>
                      <SpellIcon s={s} locked={locked} />
                      <span class="sg-info">
                        <span class="sg-sname">{s.name}{now?.id === id && <em class="sg-now">sai agora</em>}</span>
                        <span class="sg-sub">
                          {KIND_LABEL[kindOf(s)]} · {spellMana(s, me.level)} mana · {Math.round(s.cooldownMs / 100) / 10}s
                          {locked ? <b class="sg-lock"> · lv {s.level}</b> : cd > 0 ? <span class="sg-cd"> · {Math.ceil(cd / 1000)}s</span> : null}
                        </span>
                      </span>
                      <span class="sg-row-actions">
                        <button aria-label={`Subir ${s.name}`} disabled={i === 0} onClick={() => apply(moveSpell(groups, current.id, i, i - 1))} data-tip="Mais prioridade">↑</button>
                        <button aria-label={`Descer ${s.name}`} disabled={i === current.spells.length - 1} onClick={() => apply(moveSpell(groups, current.id, i, i + 1))} data-tip="Menos prioridade">↓</button>
                        <button class="sg-x" aria-label={`Tirar ${s.name}`} onClick={() => apply(removeSpell(groups, current.id, id))} data-tip="Tirar do grupo">✕</button>
                      </span>
                    </li>
                  );
                })}
                <li class={`sg-drop${dropAt === current.spells.length ? " drop-before" : ""}`} aria-hidden="true">
                  {current.spells.length === 0 ? "Solte uma magia aqui" : ""}
                </li>
              </ol>

              <div class="sg-label">Adicionar magia</div>
              <div class="sg-filters" role="tablist">
                {(["todas", "alvo", "area", "onda", "cura", "outras"] as const).map((k) => (
                  <button key={k} role="tab" aria-selected={filter === k} class={`sg-filter${filter === k ? " on" : ""}`} onClick={() => setFilter(k)}>
                    {k === "todas" ? "Todas" : KIND_LABEL[k]}
                  </button>
                ))}
              </div>
              <div class="sg-palette">
                {palette.map((s) => (
                  <button
                    key={s.id}
                    class={`sg-chip${s.level > me.level ? " locked" : ""}`}
                    draggable
                    disabled={current.spells.length >= GROUP_SPELLS_MAX}
                    onDragStart={(e) => { e.dataTransfer?.setData(DND, `add:${s.id}`); if (e.dataTransfer) e.dataTransfer.effectAllowed = "copy"; }}
                    onClick={() => onAdd(s.id)}
                    data-tip={s.name}
                    data-tip-sub={`${s.words} · ${KIND_LABEL[kindOf(s)]} · lv ${s.level}`}
                  >
                    <SpellIcon s={s} locked={s.level > me.level} />
                    <span>{s.name}</span>
                  </button>
                ))}
                {palette.length === 0 && <span class="sg-none">Nenhuma magia {filter === "todas" ? "fora do grupo" : "deste tipo fora do grupo"}.</span>}
              </div>

              <div class="sg-foot">
                {msg && <span class={`hk-msg${msg.error ? " error" : ""}`} role="status">{msg.text}</span>}
                <button
                  class={`hk-btn sg-del${confirmDel ? " confirm" : ""}`}
                  onClick={() => {
                    if (!confirmDel) { setConfirmDel(true); return; }
                    apply(deleteGroup(groups, current.id));
                    setSel(null);
                    say(keyOf(current.id) ? `"${current.name}" excluído e tirado da barra.` : `"${current.name}" excluído.`);
                  }}
                  onBlur={() => setConfirmDel(false)}
                >
                  {confirmDel ? "Clique de novo para excluir" : "Excluir grupo"}
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

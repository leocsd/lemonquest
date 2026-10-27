// Janela "Magias" (tecla H, ⚙ da barra): atalhos e grupos numa tela só, desenhada em volta da barra. Em cima, a barra
// em grande (um slot por atalho mais o "+"); clicar num slot o seleciona; embaixo, a grade de magias com ícones (clicar
// põe no slot) ou, para um grupo do jogador, o editor de prioridade (GroupEditor.tsx). Tudo aplica na hora e vai ao
// servidor junto (hotkeys.ts). Substituiu os painéis "Atalhos" e "Grupos de magia" em 2026-10-27 (decisão do dono:
// legível, um modelo mental só, tudo pelo teclado).
import { GROUP_MAX, HOTKEY_MAX, defaultHotkeys, familiesFor, type Hotkey, type SpellGroup, type Vocation } from "@lemonquest/shared";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { cssColor, PAL } from "../../game/spellPalette.ts";
import { spellIcon } from "../hud/spellIcons.ts";
import { useStore } from "../hud/store.ts";
import { useDialogFocus } from "../hud/useDialogFocus.ts";
import { clampWindowPos, useWindowDrag } from "../hud/useWindowDrag.ts";
import { meStore } from "../hud/world.ts";
import { bindOverlay, pushOverlay } from "../overlays.ts";
import { addSlot, assignKey, isModifierCode, removeRow, setRowSpell, type EditResult } from "./edit.ts";
import { createGroup } from "./groupsEdit.ts";
import { GroupEditor } from "./GroupEditor.tsx";
import { effectiveHotkeys, groupsStore, hotkeyLabel, hotkeysOpen, hotkeysStore, keyFromEvent, layoutStore, setHotkeys, setSpellGroups } from "./hotkeys.ts";
import { SpellGrid, arrowNav } from "./SpellGrid.tsx";
import { itemFor, itemsFor, shownSpell, type SpellItem } from "./spellsModel.ts";
import "./spells.css";

const W = 720;
// Centraliza na área à esquerda da barra lateral (--hud-right), onde o resto da interface se centraliza.
const hudRight = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--hud-right")) || 0;
const defaultPos = () => clampWindowPos((window.innerWidth - hudRight() - W) / 2, 70, W);
// Esc pela pilha de sobreposições (a última janela aberta fecha primeiro); mesma chave "hotkeys" do painel antigo.
// Um campo de texto focado dentro da janela (o nome do grupo) não pode engolir o Esc: o nome já é aplicado a cada
// tecla, então fechar não perde nada.
bindOverlay("hotkeys", hotkeysOpen, (v) => v, () => hotkeysOpen.set(false), ".spells-win");

/** Slot selecionado: índice na lista de atalhos, "new" (o slot "+") ou nenhum. */
export type Sel = number | "new" | null;

export interface Msg { text: string; error?: boolean }

/** Mensagem do rodapé (verde, ou vermelha com `error`): some sozinha em 4 s. */
export function useMessage(): [Msg | null, (text?: string, error?: boolean) => void] {
  const [msg, setMsg] = useState<Msg | null>(null);
  const timer = useRef(0);
  const say = (text?: string, error?: boolean) => {
    window.clearTimeout(timer.current);
    setMsg(text ? { text, error } : null);
    if (text) timer.current = window.setTimeout(() => setMsg(null), 4000);
  };
  return [msg, say];
}

/**
 * Captura da próxima tecla para o atalho `slot` (null = desligada). Ouve na fase de captura, antes dos atalhos do jogo;
 * o Esc cancela pela pilha de sobreposições (entrada transitória no topo, tratada antes do Esc que fecha a janela);
 * clicar fora da faixa ou focar um campo de texto cancela (senão a captura engoliria o que for digitado).
 * `onResult(null, why)` = cancelada, com o motivo: "esc" (a tecla) ou "fora" (clique/foco em outro lugar); com `error`
 * a captura continua esperando (a faixa mostra o motivo).
 */
function useKeyCapture(slot: number | null, voc: Vocation | undefined, onResult: (r: EditResult | null, why?: "esc" | "fora") => void): void {
  const cb = useRef(onResult);
  cb.current = onResult;
  useLayoutEffect(() => {
    if (slot === null || !voc) return;
    const offCapture = pushOverlay("hotkeys-capture", () => cb.current(null, "esc"));
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.repeat || isModifierCode(e.code)) return;
      const key = keyFromEvent(e);
      if (!key) { cb.current({ list: effectiveHotkeys(voc), error: true, message: "Ctrl e Alt não podem: o navegador usa essas combinações." }); return; }
      cb.current(assignKey(effectiveHotkeys(voc), slot, key, hotkeyLabel));
    };
    const cancel = (e: Event) => { if (!(e.target as HTMLElement | null)?.closest?.(".sw-capture")) cb.current(null, "fora"); };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", cancel, true);
    window.addEventListener("focusin", cancel, true);
    return () => {
      offCapture();
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", cancel, true);
      window.removeEventListener("focusin", cancel, true);
    };
  }, [slot, voc]);
}

export function SpellsWindow() {
  const open = useStore(hotkeysOpen);
  const me = useStore(meStore);
  useStore(hotkeysStore);
  useStore(layoutStore);
  const groups = useStore(groupsStore);
  const drag = useWindowDrag("hotkeys", defaultPos);
  useDialogFocus(drag.ref, open);
  const [sel, setSel] = useState<Sel>(null);
  /** Id do grupo aberto no editor; null = grade de magias. */
  const [editing, setEditing] = useState<string | null>(null);
  const [capturing, setCapturing] = useState<number | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [msg, say] = useMessage();
  const barRef = useRef<HTMLDivElement>(null);

  const voc = me?.vocation as Vocation | undefined;
  const list = effectiveHotkeys(voc);
  const level = me?.level ?? 1;
  // Seleção válida: a lista pode ter encolhido (tirar da barra, grupo excluído) ou enchido (o "+" some).
  const slot: Sel = typeof sel === "number" ? (sel < list.length ? sel : null) : sel === "new" && list.length < HOTKEY_MAX ? "new" : null;

  /**
   * Depois de a captura acabar (Esc ou tecla aceita) ou de tirar um atalho, o botão que tinha o foco foi desmontado:
   * foca o slot selecionado (ou o primeiro) da barra, no quadro seguinte, quando o DOM já foi redesenhado. Só age se o
   * foco caiu no body: clicar no chat (ou em outro campo) durante a captura cancela, e o foco já está onde o jogador quis.
   */
  const focusBar = () => requestAnimationFrame(() => {
    const a = document.activeElement;
    if (a && a !== document.body) return;
    (barRef.current?.querySelector<HTMLElement>(".sw-slot.sel") ?? barRef.current?.querySelector<HTMLElement>(".sw-slot"))?.focus();
  });

  useKeyCapture(capturing, voc, (r, why) => {
    if (!r) { setCapturing(null); say(undefined); if (why === "esc") focusBar(); return; }
    say(r.message, r.error);
    if (r.error) return;
    setHotkeys(r.list);
    setCapturing(null);
    focusBar();
  });
  // Uma mudança de fora (troca na barra de ação, confirmação do servidor) pode encolher a lista; a captura não pode ficar engolindo teclas sem faixa visível.
  useEffect(() => { if (capturing !== null && capturing >= list.length) setCapturing(null); }, [capturing, list.length]);
  // A posição "hotkeysPos" foi salva para o painel antigo de 360 px; a janela tem 720 e podia abrir com o × fora da tela.
  useLayoutEffect(() => { if (open) drag.clamp(); }, [open]);
  // Fechar limpa o estado transitório: a próxima abertura começa do zero.
  useEffect(() => { if (!open) { setSel(null); setEditing(null); setCapturing(null); setConfirmReset(false); say(undefined); } }, [open]);
  useEffect(() => {
    if (!confirmReset) return;
    const t = window.setTimeout(() => setConfirmReset(false), 5000);
    return () => window.clearTimeout(t);
  }, [confirmReset]);

  if (!open || !me || !voc) return null;

  const keyOf = (id: string) => { const h = list.find((x) => x.spellId === id); return h ? hotkeyLabel(h.key) : undefined; };
  const current = typeof slot === "number" ? list[slot]! : null;
  const currentItem = current ? itemFor(current.spellId, voc, groups) : null;
  // Grupo aberto no editor; se foi excluído (ou nunca existiu), volta à grade.
  const editingGroup = editing ? groups.find((g) => g.id === editing) ?? null : null;

  /** Tile clicado: põe no slot selecionado; no "+" (ou sem seleção) cria o atalho; já na barra = seleciona onde está. */
  const pick = (item: SpellItem) => {
    const at = list.findIndex((h) => h.spellId === item.id);
    if (typeof slot === "number") {
      if (at === slot) return;
      if (at >= 0) say(`Já estava na tecla ${hotkeyLabel(list[at]!.key)}: as duas trocaram.`);
      setHotkeys(setRowSpell(list, slot, item.id));
      return;
    }
    if (at >= 0) { setSel(at); say(slot === "new" ? `Já está na tecla ${hotkeyLabel(list[at]!.key)}.` : undefined); return; }
    const r = addSlot(list, item.id, hotkeyLabel);
    say(r.message, r.error);
    if (r.error) return;
    setHotkeys(r.list);
    setSel(r.list.length - 1);
  };
  /** "+ Novo grupo" / "Copiar família": cria e abre no editor. */
  const newGroup = (fromId?: string) => {
    const from = fromId ? familiesFor(voc).find((f) => f.id === fromId) : undefined;
    const r = createGroup(groups, from);
    say(r.message ?? "Grupo criado.", r.error);
    if (r.error) return;
    setSpellGroups(r.groups);
    setEditing(r.select ?? null);
  };
  const reset = () => {
    if (!confirmReset) { setConfirmReset(true); return; }
    setConfirmReset(false);
    setHotkeys(defaultHotkeys(voc));
    setSel(null);
    say("Barra recomendada: famílias ◆ e magias avulsas nas teclas 1–0.");
  };

  const b = itemsFor(voc, groups);
  const groupActions = (
    <>
      <button class="sw-btn small" disabled={groups.length >= GROUP_MAX} onClick={() => newGroup()}>+ Novo grupo</button>
      {familiesFor(voc).map((f) => (
        <button key={f.id} class="sw-btn small" disabled={groups.length >= GROUP_MAX} onClick={() => newGroup(f.id)} data-tip={`Copiar "${f.name}" como grupo seu`} data-tip-sub={f.desc}>
          Copiar ◆ {f.name}
        </button>
      ))}
    </>
  );

  return (
    <div ref={drag.ref} class={`hud-card hud-window spells-win${drag.dragging ? " dragging" : ""}`} style={drag.style} role="dialog" aria-label="Magias">
      <div class="win-title" onPointerDown={drag.onTitleDown}>
        <span class="win-grip" aria-hidden="true" />
        <span>Magias</span>
        <span class="sw-count">{list.length}/{HOTKEY_MAX} atalhos</span>
        <button class="win-close" onClick={() => hotkeysOpen.set(false)} data-tip="Fechar" data-tip-sub="H ou Esc" aria-label="Fechar">×</button>
      </div>
      <div class="win-body sw-body">
        <p class="sw-hint">Clique num slot e escolha o que vai nele. <b>◆</b> = tecla inteligente: solta a 1ª magia pronta da lista.</p>
        <BigBar barRef={barRef} list={list} voc={voc} groups={groups} level={level} sel={slot} onSelect={(s) => { setSel(s); setEditing(null); setCapturing(null); }} />
        {editingGroup ? (
          <GroupEditor
            key={editingGroup.id} group={editingGroup} groups={groups} list={list} voc={voc} level={level} mana={me.mana} say={say}
            onBack={() => { setEditing(null); focusBar(); }}
            onDeleted={() => { setSel(null); setEditing(null); focusBar(); }}
          />
        ) : (
          <>
            <SlotPanel
              slot={slot} item={currentItem} keyText={current ? hotkeyLabel(current.key) : ""} capturing={capturing !== null} error={capturing !== null && msg?.error ? msg.text : null}
              onCapture={() => { say(undefined); setCapturing(slot as number); }}
              onRemove={() => { setHotkeys(removeRow(list, slot as number)); setSel(null); focusBar(); say("Atalho tirado da barra."); }}
              onEdit={() => setEditing(current!.spellId)}
            />
            <SpellGrid
              blocks={[
                { title: "◆ Meus grupos", items: b.groups, extra: groupActions, empty: "Nenhum grupo ainda: crie um ou copie uma família." },
                { title: "◆ Famílias prontas", items: b.families, empty: "Sua vocação não tem famílias prontas." },
                { title: "Magias", items: b.spells },
              ]}
              level={level} keyOf={keyOf} activeId={current?.spellId} onPick={pick}
            />
          </>
        )}
        <div class="sw-foot">
          <span class={`sw-msg${msg?.error ? " error" : ""}`} role="status" aria-live="polite">{capturing === null ? msg?.text ?? "" : ""}</span>
          <button class={`sw-btn subtle${confirmReset ? " confirm" : ""}`} onClick={reset} data-tip="Barra recomendada" data-tip-sub="Famílias ◆ no lugar das magias parecidas, nas teclas 1–0. Descarta a sua barra atual.">
            {confirmReset ? "Clique de novo para trocar a sua barra pela recomendada" : "Recomendado"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** A barra em grande: um slot por atalho (tecla, ícone, ◆, cadeado) com o nome embaixo, mais o "+" enquanto couber. */
function BigBar({ barRef, list, voc, groups, level, sel, onSelect }: {
  barRef: { current: HTMLDivElement | null }; list: Hotkey[]; voc: Vocation; groups: readonly SpellGroup[]; level: number; sel: Sel; onSelect: (s: Sel) => void;
}) {
  return (
    <div ref={barRef} class="sw-bar" role="listbox" aria-label="Barra de atalhos" aria-orientation="horizontal" onKeyDown={(e) => arrowNav(e)}>
      {list.map((h, i) => {
        const item = itemFor(h.spellId, voc, groups);
        const s = item ? shownSpell(item, level) : null;
        // Grupo vazio tem level Infinity: não é "bloqueado por nível", só vazio (o nome já avisa).
        const locked = !!item && item.spells.length > 0 && item.level > level;
        const label = hotkeyLabel(h.key);
        return (
          <button
            key={`${h.key}:${h.spellId}`} type="button" role="option" aria-selected={sel === i}
            class={`sw-slot${sel === i ? " sel" : ""}${locked ? " locked" : ""}`}
            style={s ? ({ "--el": cssColor(PAL[s.fx]?.main ?? 0xffffff) } as never) : undefined}
            aria-label={`Tecla ${label}: ${item?.name ?? "desconhecido"}${locked ? `, libera no level ${item!.level}` : ""}${item?.kind === "group" && !item.spells.length ? " (vazio)" : ""}`}
            onClick={() => onSelect(i)}
          >
            <span class="sw-slot-box">
              <span class="sw-slot-key">{label}</span>
              {item && item.kind !== "spell" && <span class="sw-slot-fam" aria-hidden="true">◆</span>}
              {s ? <img src={spellIcon(s.fx, s.target)} alt="" draggable={false} /> : <span class="sw-slot-none" aria-hidden="true">?</span>}
              {locked && <span class="sw-slot-lock">lv {item!.level}</span>}
            </span>
            <span class="sw-slot-name">{item?.name ?? "?"}{item?.kind === "group" && !item.spells.length ? " (vazio)" : ""}</span>
          </button>
        );
      })}
      {list.length < HOTKEY_MAX && (
        <button type="button" role="option" aria-selected={sel === "new"} class={`sw-slot sw-slot-new${sel === "new" ? " sel" : ""}`} aria-label="Atalho novo" onClick={() => onSelect("new")}>
          <span class="sw-slot-box"><span class="sw-slot-plus" aria-hidden="true">+</span></span>
          <span class="sw-slot-name">Novo</span>
        </button>
      )}
    </div>
  );
}

/** O que está no slot selecionado e o que dá para fazer com ele; durante a captura, a faixa "Aperte a nova tecla". */
function SlotPanel({ slot, item, keyText, capturing, error, onCapture, onRemove, onEdit }: {
  slot: Sel; item: SpellItem | null; keyText: string; capturing: boolean; error: string | null;
  onCapture: () => void; onRemove: () => void; onEdit: () => void;
}) {
  const strip = useRef<HTMLSpanElement>(null);
  // O botão "Trocar tecla" é desmontado durante a captura; sem isso o foco cai no body e as teclas vão para o jogo.
  useEffect(() => { if (capturing) strip.current?.focus(); }, [capturing]);
  if (slot === null) return <div class="sw-panel idle">Nenhum slot selecionado: clique num slot da barra, ou numa magia abaixo para pô-la na próxima tecla livre.</div>;
  if (slot === "new") {
    return (
      <div class="sw-panel">
        <span class="sw-panel-title">Atalho novo</span>
        <span class="sw-panel-sub">Clique numa magia, família ou grupo abaixo: entra na próxima tecla livre.</span>
      </div>
    );
  }
  return (
    <div class="sw-panel">
      <span class="sw-panel-title">Tecla <kbd>{keyText}</kbd> · {item && item.kind !== "spell" ? "◆ " : ""}{item?.name ?? "?"}</span>
      {capturing ? (
        <span ref={strip} tabIndex={-1} class="sw-capture" role="status" aria-live="assertive">
          {error ? <b>{error} · </b> : null}Aperte a nova tecla — pode usar Shift · <b>Esc</b> cancela
        </span>
      ) : (
        <span class="sw-panel-actions">
          <button class="sw-btn" onClick={onCapture} data-tip="Trocar a tecla" data-tip-sub="Aperte a nova tecla; Esc cancela">Trocar tecla</button>
          {item?.kind === "group" && <button class="sw-btn gold" onClick={onEdit}>Editar grupo</button>}
          <button class="sw-btn danger" onClick={onRemove}>Tirar da barra</button>
        </span>
      )}
    </div>
  );
}

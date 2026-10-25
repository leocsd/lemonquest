// Painel de atalhos de magia (tecla H ou ⚙ na barra): cada linha = [tecla] [magia] [remover]. Clicar na tecla espera a
// próxima tecla apertada (Esc cancela); as teclas do próprio jogo são recusadas com o motivo. Salva no personagem.
import { HOTKEY_MAX, defaultHotkeys, familiesFor, familyLevel, groupFamily, spellsFor, type Hotkey, type Vocation } from "@lemonquest/shared";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { useStore } from "../hud/store.ts";
import { useDialogFocus } from "../hud/useDialogFocus.ts";
import { clampWindowPos, useWindowDrag } from "../hud/useWindowDrag.ts";
import { meStore } from "../hud/world.ts";
import { bindOverlay, pushOverlay } from "../overlays.ts";
import { addRow, assignKey, isModifierCode, removeRow, setRowSpell } from "./edit.ts";
import { effectiveHotkeys, groupsStore, hotkeyLabel, hotkeysOpen, hotkeysStore, keyFromEvent, layoutStore, setHotkeys } from "./hotkeys.ts";
import { groupsOpen } from "./SpellGroupsWindow.tsx";
import "./hotkeys.css";

const W = 360;
/** Posição inicial: centro, um pouco à esquerda (chave "hotkeysPos", a mesma de antes do hook). */
const defaultPos = () => clampWindowPos((window.innerWidth - W) / 2 - 110, 90, W);

// Esc pela pilha de sobreposições (registrado no instante em que abre: a última janela aberta fecha primeiro).
bindOverlay("hotkeys", hotkeysOpen, (v) => v, () => hotkeysOpen.set(false));

export function HotkeysWindow() {
  const open = useStore(hotkeysOpen);
  const me = useStore(meStore);
  useStore(hotkeysStore);
  useStore(layoutStore);
  const groups = useStore(groupsStore);
  const drag = useWindowDrag("hotkeys", defaultPos);
  useDialogFocus(drag.ref, open);
  const [capturing, setCapturing] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const msgTimer = useRef(0);

  const voc = me?.vocation as Vocation | undefined;
  const list = effectiveHotkeys(voc);

  const say = (text: string | undefined, error?: boolean) => {
    window.clearTimeout(msgTimer.current);
    setMsg(text ? { text, error } : null);
    if (text) msgTimer.current = window.setTimeout(() => setMsg(null), 4000);
  };
  const apply = (next: Hotkey[]) => setHotkeys(next);

  // Captura da tecla: antes de qualquer outro atalho do jogo (fase de captura + stopImmediatePropagation). Layout effect:
  // fica ativo antes de o "Pressione uma tecla…" aparecer (senão uma tecla apertada logo depois ia para o jogo).
  // O Esc cancela a captura pela pilha de sobreposições (entrada transitória no topo): o listener único de Esc, registrado
  // antes deste, trata o Esc primeiro — e assim ele cancela a captura em vez de fechar a janela.
  useLayoutEffect(() => {
    if (capturing === null || !open || !voc) return;
    const offCapture = pushOverlay("hotkeys-capture", () => { setCapturing(null); say(undefined); });
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.repeat || isModifierCode(e.code)) return;
      const key = keyFromEvent(e);
      if (!key) { say("Ctrl e Alt não podem: o navegador usa essas combinações.", true); return; }
      const r = assignKey(effectiveHotkeys(voc), capturing, key, hotkeyLabel);
      say(r.message, r.error);
      if (r.error) return;
      apply(r.list);
      setCapturing(null);
    };
    // Clicar em outro lugar ou focar um campo de texto (chat) cancela a captura: senão ela engoliria o que for digitado.
    const cancel = (e: Event) => {
      if (!(e.target as HTMLElement | null)?.closest?.(".hk-key.capturing")) setCapturing(null);
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", cancel, true);
    window.addEventListener("focusin", cancel, true);
    return () => {
      offCapture();
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", cancel, true);
      window.removeEventListener("focusin", cancel, true);
    };
  }, [capturing, voc, open]);

  useEffect(() => { if (!open || !voc) { setCapturing(null); setMsg(null); } }, [open, voc]);

  if (!open || !me || !voc) return null;
  const spells = spellsFor(voc);
  const families = familiesFor(voc);

  return (
    <div ref={drag.ref} class={`hud-card hud-window hotkeys-win${drag.dragging ? " dragging" : ""}`} style={{ ...drag.style, width: `${W}px` }} role="dialog" aria-label="Atalhos de magia">
      <div class="win-title" onPointerDown={drag.onTitleDown}>
        <span class="win-grip" aria-hidden="true" />
        <span>Atalhos de magia</span>
        <button class="win-close" onClick={() => hotkeysOpen.set(false)} data-tip="Fechar" data-tip-sub="H ou Esc" aria-label="Fechar">×</button>
      </div>
      <div class="win-body">
        <p class="hk-hint">Clique na tecla e aperte a nova (pode usar Shift). Arrastar na barra também troca as magias de lugar.
          ◆ Família: uma tecla para várias magias; sai a primeira da lista que estiver pronta e no alcance.
          Em <b>Grupos de magia</b> você monta as suas, com as magias e a ordem que quiser.</p>
        <ul class="hk-list">
          {list.map((h, i) => (
            <li key={`${i}-${h.key}`} class="hk-row">
              <button
                class={`hk-key${capturing === i ? " capturing" : ""}`}
                aria-label={`Tecla do atalho ${i + 1}`}
                onClick={() => { setCapturing(capturing === i ? null : i); say(undefined); }}
                data-tip={capturing === i ? "Aperte a nova tecla" : "Trocar a tecla"}
                data-tip-sub="Esc cancela"
              >
                {capturing === i ? "…" : hotkeyLabel(h.key)}
              </button>
              <select
                class="hk-spell"
                aria-label={`Magia do atalho ${hotkeyLabel(h.key)}`}
                value={h.spellId}
                onChange={(e) => apply(setRowSpell(list, i, (e.currentTarget as HTMLSelectElement).value))}
              >
                {groups.length > 0 && (
                  <optgroup label="Meus grupos">
                    {groups.map((g) => {
                      const lv = familyLevel(groupFamily(g, voc));
                      return (
                        <option key={g.id} value={g.id}>
                          ◆ {g.name}{!g.spells.length ? " (vazio)" : me.level < lv ? ` (lv ${lv})` : ""}
                        </option>
                      );
                    })}
                  </optgroup>
                )}
                {families.length > 0 && (
                  <optgroup label="Famílias (tecla inteligente)">
                    {families.map((f) => (
                      <option key={f.id} value={f.id}>
                        ◆ {f.name}{me.level < familyLevel(f) ? ` (lv ${familyLevel(f)})` : ""}
                      </option>
                    ))}
                  </optgroup>
                )}
                <optgroup label="Magias">
                  {spells.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {s.words}{me.level < s.level ? ` (lv ${s.level})` : ""}
                    </option>
                  ))}
                </optgroup>
              </select>
              <button class="hk-remove" aria-label={`Remover atalho ${hotkeyLabel(h.key)}`} onClick={() => apply(removeRow(list, i))} data-tip="Remover">✕</button>
            </li>
          ))}
        </ul>
        {capturing !== null && <div class="hk-capture" role="status">Pressione uma tecla… <span>(Esc cancela)</span></div>}
        {msg && <div class={`hk-msg${msg.error ? " error" : ""}`} role="status">{msg.text}</div>}
        <div class="hk-actions">
          <button
            class="hk-btn"
            disabled={list.length >= HOTKEY_MAX}
            onClick={() => { const r = addRow(list, voc); say(r.message, r.error); if (!r.error) apply(r.list); }}
          >
            + Novo atalho
          </button>
          <span class="hk-count">{list.length}/{HOTKEY_MAX}</span>
          <button class="hk-btn" onClick={() => groupsOpen.set((v) => !v)} data-tip="Grupos de magia" data-tip-sub="Monte a sua tecla inteligente: magias e ordem escolhidas por você">◆ Grupos</button>
          <button class="hk-btn subtle" onClick={() => { apply(defaultHotkeys(voc)); say("Barra recomendada: famílias ◆ e magias avulsas nas teclas 1–0."); }} data-tip="Barra recomendada" data-tip-sub="Famílias ◆ no lugar das magias parecidas, nas teclas 1–0">Recomendado</button>
        </div>
      </div>
    </div>
  );
}

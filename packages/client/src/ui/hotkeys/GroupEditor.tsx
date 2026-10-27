// Editor de um grupo de magia (tecla inteligente do jogador) dentro da janela "Magias": nome, situação na barra, a
// explicação fixa do que a tecla faz, a lista de prioridade numerada ("1º, 2º…") com ↑ ↓ ✕ e "Mais forte primeiro",
// e as magias da vocação para adicionar (tiles). Arrastar para reordenar continua funcionando, mas não é necessário.
import {
  GROUP_NAME_MAX, GROUP_SPELLS_MAX, groupFamily, pickFromFamily, spellDef, spellMana, spellsFor,
  type Hotkey, type SpellDef, type SpellGroup, type Vocation,
} from "@lemonquest/shared";
import { useEffect, useState } from "preact/hooks";
import { spellCooldownLeft } from "../hud/castbar.ts";
import { spellIcon } from "../hud/spellIcons.ts";
import { addSpell, deleteGroup, moveSpell, placeGroup, removeSpell, renameGroup, sortStrongest } from "./groupsEdit.ts";
import { hotkeyLabel, setSpellGroups } from "./hotkeys.ts";
import { SpellGrid } from "./SpellGrid.tsx";
import { itemFor, type SpellItem } from "./spellsModel.ts";

/** Dado do arrastar: índice da linha na lista. */
const DND = "application/x-lq-spell-row";

export interface GroupEditorProps {
  group: SpellGroup;
  groups: readonly SpellGroup[];
  list: readonly Hotkey[];
  voc: Vocation;
  level: number;
  mana: number;
  say: (text?: string, error?: boolean) => void;
  /** Volta para a grade (o slot selecionado continua). */
  onBack: () => void;
}

export function GroupEditor({ group, groups, list, voc, level, mana, say, onBack }: GroupEditorProps) {
  /** Nome sendo digitado: vazio não é aplicado (senão viraria "Grupo <n>" no meio da digitação). */
  const [draft, setDraft] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const [, tick] = useState(0);
  // Prévia ao vivo ("sai agora" muda com recarga e mana): 4×/s enquanto o editor está aberto.
  useEffect(() => { const t = window.setInterval(() => tick((n) => n + 1), 250); return () => window.clearInterval(t); }, []);
  useEffect(() => { setConfirmDel(false); setDraft(null); }, [group.id]);

  const apply = (next: SpellGroup[]) => setSpellGroups(next);
  const key = list.find((h) => h.spellId === group.id)?.key;
  const ready = (s: SpellDef) => spellCooldownLeft(s.id) === 0 && spellMana(s, level) <= mana;
  const now = pickFromFamily(groupFamily(group, voc), level, ready);
  const addable: SpellItem[] = spellsFor(voc).filter((s) => !group.spells.includes(s.id)).map((s) => itemFor(s.id, voc, groups)!);
  const full = group.spells.length >= GROUP_SPELLS_MAX;

  const onDrop = (e: DragEvent, at: number) => {
    e.preventDefault();
    setDropAt(null);
    const from = Number(e.dataTransfer?.getData(DND) ?? "");
    if (Number.isInteger(from)) apply(moveSpell(groups, group.id, from, from < at ? at - 1 : at));
  };

  return (
    <section class="sw-group" aria-label={`Grupo ${group.name}`}>
      <div class="sw-group-head">
        <button class="sw-btn" onClick={onBack} aria-label="Voltar à barra">← Barra</button>
        <input
          class="sw-group-name" value={draft ?? group.name} maxLength={GROUP_NAME_MAX} aria-label="Nome do grupo"
          onInput={(e) => { const v = (e.currentTarget as HTMLInputElement).value; setDraft(v); if (v.trim()) apply(renameGroup(groups, group.id, v)); }}
          onBlur={() => setDraft(null)}
          onKeyDown={(e) => { if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur(); }}
        />
        {key
          ? <span class="sw-group-onbar">Na tecla <kbd>{hotkeyLabel(key)}</kbd></span>
          : <button class="sw-btn gold" onClick={() => { const r = placeGroup(list, group.id, hotkeyLabel); say(r.message, r.error); if (!r.error) setSpellGroups(groups, r.list); }}>Pôr na barra</button>}
      </div>
      <p class="sw-group-how">Ao apertar a tecla: tenta a <b>1ª</b>; se estiver em recarga, sem mana ou fora do alcance, tenta a <b>2ª</b>, e assim por diante.</p>
      <div class="sw-label">
        Ordem de prioridade <span>{group.spells.length}/{GROUP_SPELLS_MAX}</span>
        <button class="sw-btn small" disabled={group.spells.length < 2} onClick={() => { apply(sortStrongest(groups, group.id)); say("Ordenado: a mais forte sai primeiro."); }} data-tip="Ordena pelo level (e pela mana em empate)">Mais forte primeiro</button>
      </div>
      <ol
        class={`sw-order${dropAt !== null ? " dragging" : ""}`}
        onDragOver={(e) => { e.preventDefault(); if (dropAt === null) setDropAt(group.spells.length); }}
        onDragLeave={(e) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setDropAt(null); }}
        onDrop={(e) => onDrop(e, dropAt ?? group.spells.length)}
      >
        {group.spells.map((id, i) => {
          const s = spellDef(id);
          if (!s) return null;
          const locked = s.level > level;
          const cd = spellCooldownLeft(s.id);
          return (
            <li
              key={id}
              class={`sw-row${locked ? " locked" : ""}${now?.id === id ? " now" : ""}${dropAt === i ? " drop-before" : ""}`}
              draggable
              onDragStart={(e) => { e.dataTransfer?.setData(DND, String(i)); if (e.dataTransfer) e.dataTransfer.effectAllowed = "move"; }}
              onDragEnd={() => setDropAt(null)}
              onDragOver={(e) => { e.preventDefault(); const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); setDropAt(e.clientY < r.top + r.height / 2 ? i : i + 1); }}
            >
              <span class="sw-pos">{i + 1}º</span>
              <img class={`sw-row-icon${locked ? " locked" : ""}`} src={spellIcon(s.fx, s.target)} alt="" draggable={false} />
              <span class="sw-row-info">
                <span class="sw-row-name">{s.name}{now?.id === id && <em class="sw-now">sai agora</em>}</span>
                <span class="sw-row-sub">
                  lv {s.level} · {spellMana(s, level)} mana · {Math.round(s.cooldownMs / 100) / 10} s
                  {locked ? <b class="sw-lock"> · libera no level {s.level}</b> : cd > 0 ? <span class="sw-cd"> · recarga {Math.ceil(cd / 1000)} s</span> : null}
                </span>
              </span>
              <span class="sw-row-actions">
                <button class="sw-btn icon" aria-label={`Subir ${s.name}`} disabled={i === 0} onClick={() => apply(moveSpell(groups, group.id, i, i - 1))} data-tip="Mais prioridade">↑</button>
                <button class="sw-btn icon" aria-label={`Descer ${s.name}`} disabled={i === group.spells.length - 1} onClick={() => apply(moveSpell(groups, group.id, i, i + 1))} data-tip="Menos prioridade">↓</button>
                <button class="sw-btn icon danger" aria-label={`Tirar ${s.name} do grupo`} onClick={() => apply(removeSpell(groups, group.id, id))} data-tip="Tirar do grupo">✕</button>
              </span>
            </li>
          );
        })}
        <li class={`sw-drop${dropAt === group.spells.length ? " drop-before" : ""}`} aria-hidden="true">
          {group.spells.length === 0 ? "Grupo vazio: adicione magias abaixo." : ""}
        </li>
      </ol>
      <SpellGrid
        blocks={[{ title: "Adicionar ao grupo", items: addable, empty: "Todas as suas magias já estão no grupo." }]}
        level={level} keyOf={() => undefined} disabled={full}
        onPick={(it) => { const r = addSpell(groups, group.id, it.id); say(r.message, r.error); if (!r.error) apply(r.groups); }}
      />
      <div class="sw-group-foot">
        <button
          class={`sw-btn danger${confirmDel ? " confirm" : ""}`}
          onBlur={() => setConfirmDel(false)}
          onClick={() => {
            if (!confirmDel) { setConfirmDel(true); return; }
            apply(deleteGroup(groups, group.id));
            say(key ? `"${group.name}" excluído e tirado da barra.` : `"${group.name}" excluído.`);
            onBack();
          }}
        >
          {confirmDel ? "Clique de novo para excluir" : "Excluir grupo"}
        </button>
      </div>
    </section>
  );
}

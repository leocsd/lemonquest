// Editor de um grupo de magia (tecla inteligente do jogador) dentro da janela "Magias": nome, situação na barra, a
// explicação fixa do que a tecla faz, a lista de prioridade numerada ("1º, 2º…") com ↑ ↓ ✕ e "Mais forte primeiro",
// e as magias da vocação para adicionar (tiles). Arrastar para reordenar continua funcionando, mas não é necessário.
import {
  GROUP_NAME_MAX, GROUP_SPELLS_MAX, groupFamily, pickFromFamily, spellDef, spellMana, spellsFor,
  type Hotkey, type SpellDef, type SpellGroup, type Vocation,
} from "@lemonquest/shared";
import { useEffect, useRef, useState } from "preact/hooks";
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
  /** Grupo excluído: a janela limpa a seleção, porque o slot do grupo some e o índice passaria a apontar para o vizinho. */
  onDeleted: () => void;
  /** Grupo recém-criado: o foco vai para o nome (o jogador vai batizá-lo). Senão, só garante que o foco não fique no body. */
  autofocusName?: boolean;
}

export function GroupEditor({ group, groups, list, voc, level, mana, say, onBack, onDeleted, autofocusName }: GroupEditorProps) {
  const root = useRef<HTMLElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  /** Nome sendo digitado: vazio não é aplicado (senão viraria "Grupo <n>" no meio da digitação). */
  const [draft, setDraft] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const [, tick] = useState(0);
  // Prévia ao vivo ("sai agora" muda com recarga e mana): 4×/s enquanto o editor está aberto.
  useEffect(() => { const t = window.setInterval(() => tick((n) => n + 1), 250); return () => window.clearInterval(t); }, []);
  // Abrir o editor desmonta o botão que tinha o foco; sem isso o foco cai no body e as teclas vão para o jogo. Só o grupo
  // recém-criado leva o foco para o nome: em "Editar grupo" (clique) um campo de texto focado engoliria o H e as teclas
  // da barra, que passariam a renomear o grupo; ali o foco vai para "← Barra" (e só se tiver caído no body).
  useEffect(() => {
    if (autofocusName) { nameRef.current?.focus(); return; }
    const a = document.activeElement;
    if (!a || a === document.body) root.current?.querySelector<HTMLElement>(".sw-back")?.focus();
  }, [group.id]);
  // "Excluir grupo" desarma sozinho, como o "Recomendado": um clique esquecido não deixa a exclusão armada.
  useEffect(() => {
    if (!confirmDel) return;
    const t = window.setTimeout(() => setConfirmDel(false), 5000);
    return () => window.clearTimeout(t);
  }, [confirmDel]);

  /** Depois de uma ação que desmonta ou desabilita o botão focado (✕, ↑↓ no extremo, tile adicionado, "Pôr na barra"): no quadro seguinte, se o foco caiu no body, foca o primeiro seletor que existir (em ordem de preferência). */
  const refocus = (...sels: string[]) => requestAnimationFrame(() => {
    const a = document.activeElement;
    if (a && a !== document.body) return;
    for (const s of sels) { const el = root.current?.querySelector<HTMLElement>(s); if (el) { el.focus(); return; } }
  });

  const apply = (next: SpellGroup[]) => setSpellGroups(next);
  const key = list.find((h) => h.spellId === group.id)?.key;
  const ready = (s: SpellDef) => spellCooldownLeft(s.id) === 0 && spellMana(s, level) <= mana;
  const now = pickFromFamily(groupFamily(group, voc), level, ready);
  const addable: SpellItem[] = spellsFor(voc).filter((s) => !group.spells.includes(s.id)).map((s) => itemFor(s.id, voc, groups)!);

  const onDrop = (e: DragEvent, at: number) => {
    e.preventDefault();
    setDropAt(null);
    const raw = e.dataTransfer?.getData(DND);
    if (!raw) return;
    const from = Number(raw);
    if (Number.isInteger(from)) apply(moveSpell(groups, group.id, from, from < at ? at - 1 : at));
  };

  return (
    <section ref={root} class="sw-group" aria-label={`Grupo ${group.name}`}>
      <div class="sw-group-head">
        <button class="sw-btn sw-back" onClick={onBack} aria-label="Voltar à barra">← Barra</button>
        <input
          ref={nameRef} class="sw-group-name" value={draft ?? group.name} maxLength={GROUP_NAME_MAX} aria-label="Nome do grupo"
          onInput={(e) => { const v = (e.currentTarget as HTMLInputElement).value; setDraft(v); if (v.trim()) apply(renameGroup(groups, group.id, v)); }}
          // Sair do campo com o rascunho vazio vale "Grupo <n>" (regra do servidor: o sanitizador troca "" pelo nome padrão).
          onBlur={() => { if (draft !== null && !draft.trim()) apply(renameGroup(groups, group.id, "")); setDraft(null); }}
          onKeyDown={(e) => { if (e.key === "Enter") setDraft(null); }}
        />
        {key
          ? <span class="sw-group-onbar">Na tecla <kbd>{hotkeyLabel(key)}</kbd></span>
          : <button class="sw-btn gold" onClick={() => { const r = placeGroup(list, group.id, hotkeyLabel); say(r.message, r.error); if (!r.error) { setSpellGroups(groups, r.list); refocus(".sw-back"); } }}>Pôr na barra</button>}
      </div>
      <p class="sw-group-how">Ao apertar a tecla: tenta a <b>1ª</b>; se estiver em recarga, sem mana ou fora do alcance, tenta a <b>2ª</b>, e assim por diante.</p>
      <div class={`sw-preview${now ? "" : " idle"}`} role="status" aria-live="polite">
        {group.spells.length === 0 ? "Grupo vazio: adicione magias abaixo." : now ? <>Agora sairia: <b>{now.name}</b></> : "Agora nenhuma sairia (recarga, mana ou level)."}
      </div>
      <div class="sw-label">
        Ordem de prioridade <span>{group.spells.length}/{GROUP_SPELLS_MAX}</span>
        <button class="sw-btn small" disabled={group.spells.length < 2} onClick={() => { apply(sortStrongest(groups, group.id)); say("Ordenado: a mais forte sai primeiro."); }} data-tip="Ordena pelo level (e pela mana em empate)">Mais forte primeiro</button>
      </div>
      <ol
        class={`sw-order${dropAt !== null ? " dragging" : ""}`}
        onDragOver={(e) => {
          // Um slot da barra de ações arrastado para cá levava "text/plain" e reordenava a 1ª prioridade: só vale o arraste das linhas.
          if (!e.dataTransfer?.types.includes(DND)) return;
          e.preventDefault();
          if (dropAt === null) setDropAt(group.spells.length);
        }}
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
              onDragOver={(e) => {
                if (!e.dataTransfer?.types.includes(DND)) return;
                e.preventDefault();
                const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                setDropAt(e.clientY < r.top + r.height / 2 ? i : i + 1);
              }}
            >
              <span class="sw-pos">{i + 1}º</span>
              <img class={`sw-row-icon${locked ? " locked" : ""}`} src={spellIcon(s.fx, s.target)} alt="" draggable={false} />
              <span class="sw-row-info">
                <span class="sw-row-head">
                  <span class="sw-row-name">{s.name}</span>
                  {now?.id === id && <em class="sw-now">sai agora</em>}
                </span>
                <span class="sw-row-sub">
                  lv {s.level} · {spellMana(s, level)} mana · {Math.round(s.cooldownMs / 100) / 10} s
                  {locked ? <b class="sw-lock"> · libera no level {s.level}</b> : cd > 0 ? <span class="sw-cd"> · recarga {Math.ceil(cd / 1000)} s</span> : null}
                </span>
              </span>
              <span class="sw-row-actions">
                <button
                  class="sw-btn icon sw-up" aria-label={`Subir ${s.name}`} disabled={i === 0} data-tip="Mais prioridade"
                  onClick={() => { apply(moveSpell(groups, group.id, i, i - 1)); refocus(`.sw-row:nth-child(${i}) .sw-up:not(:disabled)`, `.sw-row:nth-child(${i}) .sw-down`); }}
                >↑</button>
                <button
                  class="sw-btn icon sw-down" aria-label={`Descer ${s.name}`} disabled={i === group.spells.length - 1} data-tip="Menos prioridade"
                  onClick={() => { apply(moveSpell(groups, group.id, i, i + 1)); refocus(`.sw-row:nth-child(${i + 2}) .sw-down:not(:disabled)`, `.sw-row:nth-child(${i + 2}) .sw-up`); }}
                >↓</button>
                <button
                  class="sw-btn icon danger sw-x" aria-label={`Tirar ${s.name} do grupo`} data-tip="Tirar do grupo"
                  // A linha seguinte assume o índice i depois da remoção (:nth-child é 1-based e as linhas são os primeiros filhos do <ol>).
                  onClick={() => { apply(removeSpell(groups, group.id, id)); refocus(`.sw-row:nth-child(${i + 1}) .sw-x`, `.sw-row:nth-child(${i}) .sw-x`, ".sw-tile", ".sw-group-name"); }}
                >✕</button>
              </span>
            </li>
          );
        })}
        <li class={`sw-drop${dropAt === group.spells.length ? " drop-before" : ""}`} aria-hidden="true" />
      </ol>
      {/* Grupo cheio não desabilita os tiles: addSpell devolve "No máximo 8 magias por grupo." e o rodapé mostra. */}
      <SpellGrid
        blocks={[{ title: "Adicionar ao grupo", items: addable, empty: "Todas as suas magias já estão no grupo." }]}
        level={level} keyOf={() => undefined}
        onPick={(it) => {
          const idx = addable.findIndex((a) => a.id === it.id);
          const r = addSpell(groups, group.id, it.id);
          say(r.message, r.error);
          if (r.error) return;
          apply(r.groups);
          refocus(`.sw-tiles .sw-tile:nth-child(${idx + 1})`, ".sw-tile", ".sw-group-name");
        }}
      />
      <div class="sw-group-foot">
        <button
          class={`sw-btn danger${confirmDel ? " confirm" : ""}`}
          onBlur={() => setConfirmDel(false)}
          onClick={() => {
            if (!confirmDel) { setConfirmDel(true); return; }
            apply(deleteGroup(groups, group.id));
            say(key ? `"${group.name}" excluído e tirado da barra.` : `"${group.name}" excluído.`);
            onDeleted();
          }}
        >
          {confirmDel ? "Clique de novo para excluir" : "Excluir grupo"}
        </button>
      </div>
    </section>
  );
}

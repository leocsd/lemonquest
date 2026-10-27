// Grade de magias da janela "Magias": tiles grandes com ícone, nome e legenda (clicar escolhe). Usada para pôr no slot
// selecionado e, no editor de grupo, para adicionar magias ao grupo. `arrowNav`: setas movem o foco entre botões.
import type { ComponentChildren } from "preact";
import { spellIcon } from "../hud/spellIcons.ts";
import { shownSpell, subtitle, type SpellItem } from "./spellsModel.ts";

export interface TileProps {
  item: SpellItem;
  level: number;
  /** Tecla onde o item já está na barra (selo no canto). */
  keyOf?: string;
  /** Marcado: está no slot selecionado. */
  active?: boolean;
  disabled?: boolean;
  onPick: (item: SpellItem) => void;
}

export function SpellTile({ item, level, keyOf, active, disabled, onPick }: TileProps) {
  const s = shownSpell(item, level);
  const locked = item.spells.length > 0 && item.level > level;
  const fam = item.kind !== "spell";
  const name = `${fam ? "◆ " : ""}${item.name}`;
  return (
    <button
      type="button"
      class={`sw-tile${active ? " active" : ""}${locked ? " locked" : ""}`}
      aria-pressed={!!active}
      aria-label={`${item.kind === "group" ? "grupo " : item.kind === "family" ? "família " : ""}${item.name}${keyOf ? `, tecla ${keyOf}` : ""}${locked ? `, libera no level ${item.level}` : `, ${subtitle(item, level)}`}`}
      disabled={disabled}
      onClick={() => onPick(item)}
      data-tip={name}
      data-tip-sub={fam ? `Tecla inteligente: ${item.spells.map((x) => x.name).join(" → ") || "sem magias"}` : `${s?.words ?? ""} · ${s?.description ?? ""}`}
    >
      <span class="sw-tile-icon">
        {s ? <img src={spellIcon(s.fx, s.target)} alt="" draggable={false} /> : <span class="sw-tile-none" aria-hidden="true">◆</span>}
        {fam && s && <span class="sw-tile-fam" aria-hidden="true">◆</span>}
        {keyOf && <kbd class="sw-tile-key">{keyOf}</kbd>}
      </span>
      <span class="sw-tile-name">{item.name}</span>
      <span class={`sw-tile-sub${locked ? " lock" : ""}`}>{locked ? `lv ${item.level}` : subtitle(item, level)}</span>
    </button>
  );
}

export interface GridBlock {
  title: string;
  items: SpellItem[];
  /** Botões ao lado do título (ex.: "+ Novo grupo"). */
  extra?: ComponentChildren;
  /** Texto quando não há tiles. */
  empty?: string;
}

export function SpellGrid({ blocks, level, keyOf, activeId, disabled, onPick }: {
  blocks: GridBlock[]; level: number; keyOf: (id: string) => string | undefined; activeId?: string; disabled?: boolean; onPick: (item: SpellItem) => void;
}) {
  return (
    <div class="sw-grid" onKeyDown={(e) => arrowNav(e, ".sw-tile:not(:disabled)")}>
      {blocks.map((b, i) => (
        <section key={b.title} class="sw-block" aria-labelledby={`sw-block-${i}`}>
          <div class="sw-block-head">
            <h3 id={`sw-block-${i}`} class="sw-block-title">{b.title}</h3>
            {b.extra && <span class="sw-block-actions">{b.extra}</span>}
          </div>
          <div class="sw-tiles">
            {b.items.map((it) => <SpellTile key={it.id} item={it} level={level} keyOf={keyOf(it.id)} active={activeId === it.id} disabled={disabled} onPick={onPick} />)}
            {b.items.length === 0 && <span class="sw-none">{b.empty ?? "Nada aqui."}</span>}
          </div>
        </section>
      ))}
    </div>
  );
}

/** Setas movem o foco entre os botões do contêiner (cada botão continua sendo parada de Tab; as setas são o atalho; dá a volta nas pontas). */
export function arrowNav(e: KeyboardEvent, selector = "button:not(:disabled)"): void {
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
  if (!dir) return;
  const all = [...(e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>(selector)];
  const i = all.indexOf(document.activeElement as HTMLElement);
  if (i < 0) return;
  e.preventDefault();
  e.stopPropagation(); // senão o listener do jogo (game/input.ts, em window) anda com o personagem
  all[(i + dir + all.length) % all.length]?.focus();
}

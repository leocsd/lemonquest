# Janela única "Magias" — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir os painéis "Atalhos" (H) e "Grupos de magia" por uma janela só, desenhada em volta da barra, legível
e operável pelo teclado, conforme `docs/superpowers/specs/2026-10-27-janela-magias-design.md`.

**Architecture:** O cliente (Preact) ganha `SpellsWindow.tsx` (janela: barra em grande + painel do slot + grade) com
`SpellGrid.tsx` (tiles) e `GroupEditor.tsx` (editor de prioridade) apoiados num modelo puro `spellsModel.ts`. As
regras e o envio ao servidor não mudam (`hotkeys.ts`, `edit.ts`, `groupsEdit.ts`; só entram `addSlot` e
`sortStrongest`). Os dois painéis antigos e os seus CSS são removidos; `Hud.tsx` renderiza a janela nova.

**Tech Stack:** TypeScript estrito, Preact (hooks), CSS puro, vitest (unitários), Playwright (E2E, roda no CI).

## Global Constraints

- Tudo em português: código, comentários (explicam o porquê), UI, docs e commits (uma linha, sem prefixo). Commits
  terminam com a linha `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Nenhuma mudança de servidor, protocolo (`C2S.SetHotkeys`/`S2C.Hotkeys`) ou regras de validade (`shared`).
- Legibilidade: fonte 14 px no corpo e 12,5 px no secundário (nunca abaixo); botões ≥ 32 px; tiles ≥ 64 px;
  slots 48 px; `:focus-visible` com contorno de 2 px dourado; tudo operável pelo teclado.
- Largura da janela `min(720px, calc(100vw − var(--hud-right, 0px) − 32px))`, altura máxima `calc(100vh − 120px)`,
  corpo rolável; `role="dialog"` com `aria-label="Magias"`.
- Validar localmente só com `npm run typecheck` e `npx vitest run <arquivo>`; **E2E local só se o dono pedir** (o CI
  da PR roda `npm run test:e2e`). Nunca apontar nada para `data/`, `docker-data/` ou `docker-data-dev/`.
- Branch de trabalho: `janela-magias` (já existe, com a especificação commitada).

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `packages/client/src/ui/hotkeys/edit.ts` (modificar) | + `addSlot`: atalho novo na próxima tecla livre (slot "+") |
| `packages/client/src/ui/hotkeys/edit.test.ts` (modificar) | teste de `addSlot` |
| `packages/client/src/ui/hotkeys/groupsEdit.ts` (modificar) | + `sortStrongest`: "Mais forte primeiro" |
| `packages/client/src/ui/hotkeys/groupsEdit.test.ts` (modificar) | teste de `sortStrongest` |
| `packages/client/src/ui/hotkeys/spellsModel.ts` (criar) | modelo puro: o que um id de atalho representa (`itemFor`), magia mostrada (`shownSpell`), blocos da grade (`itemsFor`), legenda (`subtitle`) |
| `packages/client/src/ui/hotkeys/spellsModel.test.ts` (criar) | testes do modelo |
| `packages/client/src/ui/hotkeys/SpellGrid.tsx` (criar) | `SpellTile`, `SpellGrid` (blocos de tiles) e `arrowNav` (setas movem o foco) |
| `packages/client/src/ui/hotkeys/GroupEditor.tsx` (criar) | editor de prioridade de um grupo |
| `packages/client/src/ui/hotkeys/SpellsWindow.tsx` (criar) | janela: barra em grande, painel do slot, captura de tecla, rodapé; liga grade e editor |
| `packages/client/src/ui/hotkeys/spells.css` (criar) | todo o CSS da janela (`.sw-*`) |
| `packages/client/src/ui/hotkeys/HotkeysWindow.tsx`, `SpellGroupsWindow.tsx`, `hotkeys.css`, `groups.css` (remover) | painéis antigos |
| `packages/client/src/ui/hud/Hud.tsx` (modificar) | renderiza `SpellsWindow` |
| `packages/client/src/ui/a11y/a11y.css` (modificar) | zoom de "texto maior" na janela nova |
| `packages/client/src/ui/hud/HelpPopover.tsx`, `packages/shared/src/hotkeys.ts` (modificar) | rótulo da tecla H |
| `e2e/hotkeys.spec.ts` (reescrever) | cenários da janela nova |
| `CHANGELOG.md`, `packages/shared/src/data/news.ts`, `README.md`, `docs/GAME_ROADMAP.md`, `docs/TEST_PLAN.md` (modificar) | fechamento |

---

### Task 1: `addSlot` — atalho novo na próxima tecla livre

**Files:**
- Modify: `packages/client/src/ui/hotkeys/edit.ts` (depois de `addRow`, ~linha 68)
- Test: `packages/client/src/ui/hotkeys/edit.test.ts`

**Interfaces:**
- Consumes: `HOTKEY_MAX`, `nextFreeKey` (já importados em `edit.ts`), `EditResult` (já existe no arquivo).
- Produces: `addSlot(list: readonly Hotkey[], spellId: string, label: (k: string) => string): EditResult` — a Task 5
  chama com `hotkeyLabel` como `label`.

- [ ] **Step 1: Escrever o teste que falha**

Em `packages/client/src/ui/hotkeys/edit.test.ts`, acrescente `addSlot` ao import de `./edit.ts` e, dentro do
`describe("edição dos atalhos", …)`, depois do teste de `addRow`, este caso:

```ts
  it("addSlot (slot +): próxima tecla livre com aviso; já na barra ou barra cheia é erro", () => {
    const r = addSlot(L, "inferno", keyLabel);
    expect(r.list.at(-1)).toEqual({ key: "Digit3", spellId: "inferno" });
    expect(r.message).toBe("Na tecla 3.");
    expect(L).toHaveLength(2); // não muta a original
    expect(addSlot(L, "fireball", keyLabel)).toMatchObject({ error: true, message: "Já está na tecla 1." });
    const full = Array.from({ length: HOTKEY_MAX }, (_, i) => ({ key: `Key${"BCFGTUVXYZNP"[i]}`, spellId: `s${i}` }));
    expect(addSlot(full, "inferno", keyLabel)).toMatchObject({ error: true, message: `A barra está cheia (${HOTKEY_MAX}): tire um atalho.` });
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run packages/client/src/ui/hotkeys/edit.test.ts`
Expected: FAIL — `addSlot` não é exportado (`is not a function` / erro de tipo).

- [ ] **Step 3: Implementar**

Em `packages/client/src/ui/hotkeys/edit.ts`, logo depois da função `addRow`:

```ts
/**
 * Slot "+" da janela Magias: `spellId` (magia, família ou grupo) na próxima tecla livre. Já na barra = erro dizendo a
 * tecla (o tile mostra onde está); barra cheia = erro.
 */
export function addSlot(list: readonly Hotkey[], spellId: string, label: (k: string) => string): EditResult {
  const out = list.map((h) => ({ ...h }));
  const own = out.find((h) => h.spellId === spellId);
  if (own) return { list: out, error: true, message: `Já está na tecla ${label(own.key)}.` };
  if (out.length >= HOTKEY_MAX) return { list: out, error: true, message: `A barra está cheia (${HOTKEY_MAX}): tire um atalho.` };
  const key = nextFreeKey(out.map((h) => h.key));
  if (!key) return { list: out, error: true, message: "Não sobrou tecla livre." };
  out.push({ key, spellId });
  return { list: out, message: `Na tecla ${label(key)}.` };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run packages/client/src/ui/hotkeys/edit.test.ts`
Expected: PASS (todos os testes do arquivo).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/ui/hotkeys/edit.ts packages/client/src/ui/hotkeys/edit.test.ts
git commit -m "Atalhos: addSlot põe magia, família ou grupo na próxima tecla livre (slot + da janela Magias)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: `sortStrongest` — "Mais forte primeiro"

**Files:**
- Modify: `packages/client/src/ui/hotkeys/groupsEdit.ts`
- Test: `packages/client/src/ui/hotkeys/groupsEdit.test.ts`

**Interfaces:**
- Consumes: `spellDef` de `@lemonquest/shared` (acrescentar ao import), `copy` (já existe no arquivo).
- Produces: `sortStrongest(groups: readonly SpellGroup[], id: string): SpellGroup[]` — a Task 6 chama no botão.

- [ ] **Step 1: Escrever o teste que falha**

Em `groupsEdit.test.ts`, acrescente `sortStrongest` ao import de `./groupsEdit.ts` e, no fim do `describe`:

```ts
  it("mais forte primeiro: level decrescente, mana em empate, estável; outros grupos e a original intactos", () => {
    const gs: SpellGroup[] = [
      { id: "fam:my:1", name: "x", spells: ["fireball", "fire_wave", "sudden_death", "energy_beam"] }, // lv 1, 35, 50, 20
      { id: "fam:my:2", name: "y", spells: ["fireball"] },
    ];
    const out = sortStrongest(gs, "fam:my:1");
    expect(out[0]!.spells).toEqual(["sudden_death", "fire_wave", "energy_beam", "fireball"]);
    expect(out[1]!.spells).toEqual(["fireball"]);
    expect(gs[0]!.spells[0]).toBe("fireball");
    // Ids desconhecidos (magia removida numa atualização) contam como level 0 e mantêm a ordem entre si.
    expect(sortStrongest([{ id: "fam:my:1", name: "x", spells: ["zz", "yy", "fireball"] }], "fam:my:1")[0]!.spells).toEqual(["fireball", "zz", "yy"]);
    expect(sortStrongest(gs, "fam:my:9")).toEqual(gs);
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run packages/client/src/ui/hotkeys/groupsEdit.test.ts`
Expected: FAIL — `sortStrongest` não existe.

- [ ] **Step 3: Implementar**

Em `groupsEdit.ts`, acrescente `spellDef` ao import de `@lemonquest/shared` e, depois de `moveSpell`:

```ts
/** "Mais forte primeiro": level decrescente; em empate, mana base decrescente; empate total mantém a ordem atual. */
export function sortStrongest(groups: readonly SpellGroup[], id: string): SpellGroup[] {
  return copy(groups).map((g) => {
    if (g.id !== id) return g;
    const rank = (sid: string): [number, number] => { const d = spellDef(sid); return d ? [d.level, d.mana] : [0, 0]; };
    const spells = g.spells
      .map((s, i) => ({ s, i, r: rank(s) }))
      .sort((a, b) => b.r[0] - a.r[0] || b.r[1] - a.r[1] || a.i - b.i)
      .map((x) => x.s);
    return { ...g, spells };
  });
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run packages/client/src/ui/hotkeys/groupsEdit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/ui/hotkeys/groupsEdit.ts packages/client/src/ui/hotkeys/groupsEdit.test.ts
git commit -m "Grupos de magia: sortStrongest ordena a prioridade pela magia mais forte (level, depois mana)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: `spellsModel.ts` — modelo puro da janela

**Files:**
- Create: `packages/client/src/ui/hotkeys/spellsModel.ts`
- Test: `packages/client/src/ui/hotkeys/spellsModel.test.ts`

**Interfaces:**
- Consumes: `familiesFor`, `familyLevel`, `familySpells`, `isFamilyId`, `isGroupId`, `resolveFamily`, `spellDef`,
  `spellMana`, `spellsFor` de `@lemonquest/shared`.
- Produces (usados pelas Tasks 4–6):
  - `type ItemKind = "spell" | "family" | "group"`
  - `interface SpellItem { id: string; name: string; kind: ItemKind; spells: SpellDef[]; level: number }`
  - `itemFor(id: string, voc: Vocation, groups: readonly SpellGroup[]): SpellItem | null`
  - `shownSpell(item: SpellItem, level: number): SpellDef | null`
  - `itemsFor(voc: Vocation, groups: readonly SpellGroup[]): { groups: SpellItem[]; families: SpellItem[]; spells: SpellItem[] }`
  - `subtitle(item: SpellItem, level: number): string`

- [ ] **Step 1: Escrever o teste que falha**

Crie `packages/client/src/ui/hotkeys/spellsModel.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { SpellGroup } from "@lemonquest/shared";
import { itemFor, itemsFor, shownSpell, subtitle } from "./spellsModel.ts";

const G: SpellGroup[] = [
  { id: "fam:my:1", name: "Meu combo", spells: ["fire_wave", "fireball"] }, // lv 35 e lv 1
  { id: "fam:my:2", name: "Vazio", spells: [] },
];

describe("modelo da janela Magias", () => {
  it("item por id: magia, família pronta e grupo do jogador; de outra vocação ou desconhecido = null", () => {
    const fb = itemFor("fireball", "sorcerer", G)!;
    expect(fb).toMatchObject({ kind: "spell", name: "Bola de Fogo", level: 1 });
    expect(fb.spells.map((s) => s.id)).toEqual(["fireball"]);
    const fam = itemFor("fam:sorcerer:target", "sorcerer", G)!;
    expect(fam).toMatchObject({ kind: "family", name: "Ataque no alvo", level: 1 });
    expect(fam.spells.map((s) => s.id)).toEqual(["eternal_flame", "sudden_death", "energy_beam", "fireball"]);
    expect(itemFor("fam:my:1", "sorcerer", G)).toMatchObject({ kind: "group", name: "Meu combo", level: 1 });
    expect(itemFor("fam:my:2", "sorcerer", G)).toMatchObject({ kind: "group", spells: [], level: Infinity });
    expect(itemFor("fam:my:9", "sorcerer", G)).toBeNull();
    expect(itemFor("nope", "sorcerer", G)).toBeNull();
    expect(itemFor("fireball", "knight", G)).toBeNull();
    expect(itemFor("fam:sorcerer:target", "knight", G)).toBeNull();
  });

  it("magia mostrada: a primeira liberada no level; nenhuma liberada = a última (mais fraca); grupo vazio = null", () => {
    const fam = itemFor("fam:sorcerer:target", "sorcerer", G)!;
    expect(shownSpell(fam, 100)!.id).toBe("eternal_flame");
    expect(shownSpell(fam, 20)!.id).toBe("energy_beam");
    expect(shownSpell(fam, 1)!.id).toBe("fireball");
    expect(shownSpell(itemFor("fam:my:1", "sorcerer", G)!, 10)!.id).toBe("fireball");
    expect(shownSpell(itemFor("fam:my:2", "sorcerer", G)!, 100)).toBeNull();
  });

  it("blocos da grade: grupos, famílias e magias por level; legendas", () => {
    const b = itemsFor("sorcerer", G);
    expect(b.groups.map((i) => i.name)).toEqual(["Meu combo", "Vazio"]);
    expect(b.families.map((i) => i.id)).toEqual(["fam:sorcerer:target", "fam:sorcerer:area", "fam:sorcerer:wave"]);
    expect(b.spells).toHaveLength(13);
    const levels = b.spells.map((i) => i.level);
    expect(levels).toEqual([...levels].sort((x, y) => x - y));
    expect(subtitle(b.spells[0]!, 1)).toMatch(/^lv 1 · \d+ mana$/);
    expect(subtitle(b.families[0]!, 50)).toBe("4 magias · lv 1");
    expect(subtitle(b.groups[0]!, 50)).toBe("2 magias · lv 1");
    expect(subtitle(b.groups[1]!, 50)).toBe("vazio");
    expect(itemsFor("knight", []).groups).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run packages/client/src/ui/hotkeys/spellsModel.test.ts`
Expected: FAIL — módulo `./spellsModel.ts` não existe.

- [ ] **Step 3: Implementar**

Crie `packages/client/src/ui/hotkeys/spellsModel.ts`:

```ts
// Modelo puro (sem DOM) da janela "Magias": o que um id de atalho representa (magia avulsa, família pronta ou grupo do
// jogador), a magia que o representa num level, os blocos da grade e a legenda curta. Testável sem Preact.
import {
  familiesFor, familyLevel, familySpells, isFamilyId, isGroupId, resolveFamily, spellDef, spellMana, spellsFor,
  type SpellDef, type SpellGroup, type Vocation,
} from "@lemonquest/shared";

export type ItemKind = "spell" | "family" | "group";

export interface SpellItem {
  /** Id que vai no atalho (magia, "fam:…" ou "fam:my:…"). */
  id: string;
  name: string;
  kind: ItemKind;
  /** Magias na ordem de prioridade (magia avulsa: só ela). Grupo vazio: []. */
  spells: SpellDef[];
  /** Level em que libera a primeira magia (grupo vazio: Infinity). */
  level: number;
}

/** Item pelo id do atalho; null = id desconhecido, de outra vocação ou grupo que não existe mais. */
export function itemFor(id: string, voc: Vocation, groups: readonly SpellGroup[]): SpellItem | null {
  if (isFamilyId(id)) {
    const f = resolveFamily(id, groups, voc);
    if (!f || f.vocation !== voc) return null;
    const spells = familySpells(f);
    return { id, name: f.name, kind: isGroupId(id) ? "group" : "family", spells, level: spells.length ? familyLevel(f) : Infinity };
  }
  const s = spellDef(id);
  if (!s || !s.vocations.includes(voc)) return null;
  return { id, name: s.name, kind: "spell", spells: [s], level: s.level };
}

/** Magia que representa o item no level: a primeira liberada da lista; nenhuma liberada = a última (a mais fraca); grupo vazio = null. */
export function shownSpell(item: SpellItem, level: number): SpellDef | null {
  return item.spells.find((s) => s.level <= level) ?? item.spells.at(-1) ?? null;
}

/** Os três blocos da grade, na ordem em que aparecem: grupos do jogador, famílias prontas, magias por level. */
export function itemsFor(voc: Vocation, groups: readonly SpellGroup[]): { groups: SpellItem[]; families: SpellItem[]; spells: SpellItem[] } {
  const items = (ids: string[]) => ids.map((id) => itemFor(id, voc, groups)).filter((x): x is SpellItem => !!x);
  return {
    groups: items(groups.map((g) => g.id)),
    families: items(familiesFor(voc).map((f) => f.id)),
    spells: items([...spellsFor(voc)].sort((a, b) => a.level - b.level).map((s) => s.id)),
  };
}

/** Legenda do tile: "lv 20 · 40 mana" na magia; "3 magias · lv 1" na família/grupo; "vazio" no grupo sem magias. */
export function subtitle(item: SpellItem, level: number): string {
  if (item.kind === "spell") { const s = item.spells[0]!; return `lv ${s.level} · ${spellMana(s, level)} mana`; }
  if (!item.spells.length) return "vazio";
  return `${item.spells.length} ${item.spells.length === 1 ? "magia" : "magias"} · lv ${item.level}`;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run packages/client/src/ui/hotkeys/spellsModel.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/ui/hotkeys/spellsModel.ts packages/client/src/ui/hotkeys/spellsModel.test.ts
git commit -m "Janela Magias: modelo puro dos itens (magia, família, grupo), magia mostrada, blocos e legendas

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: `SpellGrid.tsx` (tiles) e `spells.css`

Sem teste unitário (é DOM): o teste é o `typecheck` e, nas Tasks 5–6, a janela e o E2E.

**Files:**
- Create: `packages/client/src/ui/hotkeys/SpellGrid.tsx`
- Create: `packages/client/src/ui/hotkeys/spells.css`

**Interfaces:**
- Consumes: `spellIcon(fx, target)` de `../hud/spellIcons.ts`; `shownSpell`, `subtitle`, `SpellItem` (Task 3).
- Produces:
  - `SpellTile({ item, level, keyOf?, active?, disabled?, onPick })`
  - `interface GridBlock { title: string; items: SpellItem[]; extra?: ComponentChildren; empty?: string }`
  - `SpellGrid({ blocks: GridBlock[]; level: number; keyOf: (id: string) => string | undefined; activeId?: string; disabled?: boolean; onPick: (item: SpellItem) => void })`
  - `arrowNav(e: KeyboardEvent, selector?: string): void`

- [ ] **Step 1: Criar `SpellGrid.tsx`**

```tsx
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
  const locked = item.level > level;
  const fam = item.kind !== "spell";
  const name = `${fam ? "◆ " : ""}${item.name}`;
  return (
    <button
      type="button"
      class={`sw-tile${active ? " active" : ""}${locked ? " locked" : ""}`}
      aria-pressed={!!active}
      aria-label={`${name}${keyOf ? `, tecla ${keyOf}` : ""}${locked ? `, libera no level ${item.level}` : ""}`}
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
      {blocks.map((b) => (
        <section key={b.title} class="sw-block" aria-label={b.title}>
          <h3 class="sw-block-title">{b.title}{b.extra && <span class="sw-block-actions">{b.extra}</span>}</h3>
          <div class="sw-tiles">
            {b.items.map((it) => <SpellTile key={it.id} item={it} level={level} keyOf={keyOf(it.id)} active={activeId === it.id} disabled={disabled} onPick={onPick} />)}
            {b.items.length === 0 && <span class="sw-none">{b.empty ?? "Nada aqui."}</span>}
          </div>
        </section>
      ))}
    </div>
  );
}

/** Setas movem o foco entre os botões do contêiner (o Tab entra; ← → ↑ ↓ andam; dá a volta nas pontas). */
export function arrowNav(e: KeyboardEvent, selector = "button:not(:disabled)"): void {
  const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
  if (!dir) return;
  const all = [...(e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>(selector)];
  const i = all.indexOf(document.activeElement as HTMLElement);
  if (i < 0) return;
  e.preventDefault();
  all[(i + dir + all.length) % all.length]?.focus();
}
```

- [ ] **Step 2: Criar `spells.css`**

```css
/* Janela "Magias" (tecla H): barra em grande, painel do slot, grade de tiles e editor de grupo. Fonte 14 px no corpo e
   12,5 px no secundário; botões ≥ 32 px; tiles ≥ 64 px; foco visível (acessibilidade, decisão do dono 2026-10-27). */
.hud-card.spells-win { background: rgba(17, 20, 28, 0.96); width: min(720px, calc(100vw - var(--hud-right, 0px) - 32px)); max-height: calc(100vh - 120px); font-size: 14px; }
.spells-win .win-title > span:nth-child(2) { color: var(--hud-text); text-transform: none; letter-spacing: 0; font-size: 14px; font-weight: 600; }
.sw-count { font-size: 12.5px; color: var(--hud-muted); font-variant-numeric: tabular-nums; margin-right: 6px; }
.spells-win .sw-body { display: flex; flex-direction: column; gap: 10px; min-height: 0; overflow-y: auto; padding: 10px 12px 12px; }
.spells-win kbd { display: inline-block; min-width: 20px; padding: 0 5px; font: inherit; font-size: 13px; font-weight: 700; color: var(--hud-gold); text-align: center; background: var(--hud-well); border: 1px solid var(--hud-line-hi); border-radius: 3px; }
.spells-win :is(button, input):focus-visible { outline: 2px solid var(--hud-gold); outline-offset: 2px; }
.sw-hint { margin: 0; font-size: 13px; line-height: 1.4; color: var(--hud-muted); }
.sw-hint b { color: var(--hud-gold); }

/* Barra em grande */
.sw-bar { display: flex; flex-wrap: wrap; gap: 6px; padding: 8px; background: var(--hud-bg-soft); border: 1px solid var(--hud-line); border-radius: var(--hud-radius); }
.sw-slot { width: 56px; display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 0; background: transparent; border: 0; cursor: pointer; color: var(--hud-text); }
.sw-slot-box { position: relative; box-sizing: border-box; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; background: var(--hud-well); border: 2px solid color-mix(in srgb, var(--el, #3d4560) 38%, var(--hud-line-soft)); border-radius: 6px; transition: border-color 120ms, box-shadow 120ms; }
.sw-slot:hover .sw-slot-box { border-color: var(--hud-line-hi); }
.sw-slot.sel .sw-slot-box { border-color: var(--hud-gold); box-shadow: 0 0 0 2px rgba(217, 164, 65, 0.35), inset 0 0 10px rgba(217, 164, 65, 0.25); }
.sw-slot-box img { width: 32px; height: 32px; image-rendering: pixelated; }
.sw-slot.locked .sw-slot-box img { filter: grayscale(1) brightness(0.55); }
.sw-slot-key { position: absolute; left: 3px; top: 1px; font-size: 11px; line-height: 13px; font-weight: 700; color: var(--hud-text); text-shadow: 0 1px 0 #000; }
.sw-slot-fam { position: absolute; right: 3px; top: 0; font-size: 11px; line-height: 13px; color: var(--hud-gold); text-shadow: 0 1px 0 #000; }
.sw-slot-lock { position: absolute; left: 0; right: 0; bottom: 0; font-size: 10.5px; line-height: 14px; text-align: center; color: #ffb3a8; background: rgba(5, 6, 10, 0.8); }
.sw-slot-none, .sw-slot-plus { font-size: 22px; color: var(--hud-muted); }
.sw-slot-new .sw-slot-box { border-style: dashed; }
.sw-slot-name { width: 100%; font-size: 12.5px; line-height: 1.2; text-align: center; overflow: hidden; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow-wrap: anywhere; }
.sw-slot.sel .sw-slot-name { color: var(--hud-gold); font-weight: 600; }

/* Painel do slot selecionado */
.sw-panel { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; min-height: 40px; padding: 8px 10px; background: var(--hud-well); border: 1px solid var(--hud-line); border-radius: 5px; }
.sw-panel.idle { color: var(--hud-muted); font-size: 13px; }
.sw-panel-title { font-size: 15px; font-weight: 600; }
.sw-panel-sub { font-size: 13px; color: var(--hud-muted); }
.sw-panel-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-left: auto; }
.sw-capture { margin-left: auto; padding: 6px 10px; font-size: 14px; color: #ffd447; border: 1px solid #ffd447; border-radius: 4px; animation: sw-blink 900ms ease-in-out infinite; }
@keyframes sw-blink { 50% { background: rgba(255, 212, 71, 0.18); } }

/* Botões */
.sw-btn { height: 32px; padding: 0 12px; white-space: nowrap; font: inherit; font-size: 13.5px; color: var(--hud-text); cursor: pointer; background: var(--hud-well); border: 1px solid var(--hud-line-hi); border-radius: 4px; }
.sw-btn:hover:not(:disabled) { border-color: var(--hud-gold); }
.sw-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.sw-btn.gold { color: var(--hud-gold); border-color: var(--hud-gold); }
.sw-btn.danger:hover:not(:disabled) { color: #ff9a8f; border-color: var(--hud-red); }
.sw-btn.confirm { color: #fff; background: var(--hud-red); border-color: var(--hud-red); }
.sw-btn.subtle { color: var(--hud-muted); }
.sw-btn.small { height: 28px; padding: 0 10px; font-size: 12.5px; }
.sw-btn.icon { width: 32px; padding: 0; font-size: 15px; }

/* Grade de tiles */
.sw-grid { display: flex; flex-direction: column; gap: 10px; }
.sw-block-title { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 0 0 6px; font-size: 12.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--hud-muted); }
.sw-block-actions { display: flex; flex-wrap: wrap; gap: 4px; margin-left: auto; text-transform: none; letter-spacing: 0; font-weight: 400; }
.sw-tiles { display: flex; flex-wrap: wrap; gap: 6px; }
.sw-tile { width: 96px; min-height: 96px; display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 6px 4px; font: inherit; color: var(--hud-text); background: var(--hud-well); border: 1px solid var(--hud-line); border-radius: 6px; cursor: pointer; transition: border-color 120ms, transform 120ms var(--hud-ease); }
.sw-tile:hover:not(:disabled) { border-color: var(--hud-gold); transform: translateY(-1px); }
.sw-tile.active { border-color: var(--hud-gold); background: rgba(217, 164, 65, 0.12); }
.sw-tile:disabled { opacity: 0.4; cursor: not-allowed; }
.sw-tile-icon { position: relative; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; }
.sw-tile-icon img { width: 32px; height: 32px; image-rendering: pixelated; }
.sw-tile.locked .sw-tile-icon img { filter: grayscale(1) brightness(0.6); }
.sw-tile-none { font-size: 22px; color: var(--hud-muted); }
.sw-tile-fam { position: absolute; right: -2px; top: -2px; font-size: 12px; color: var(--hud-gold); text-shadow: 0 1px 0 #000; }
.sw-tile-key { position: absolute; left: -6px; top: -4px; font-size: 11px; min-width: 16px; padding: 0 3px; }
.sw-tile-name { font-size: 12.5px; line-height: 1.2; text-align: center; overflow: hidden; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow-wrap: anywhere; }
.sw-tile.locked .sw-tile-name { color: var(--hud-muted); }
.sw-tile-sub { font-size: 12.5px; color: var(--hud-muted); font-variant-numeric: tabular-nums; }
.sw-tile-sub.lock { color: #ff9a8f; font-weight: 600; }
.sw-none { font-size: 13px; color: var(--hud-muted); }

/* Editor de grupo */
.sw-group { display: flex; flex-direction: column; gap: 8px; }
.sw-group-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.sw-group-name { flex: 1; min-width: 160px; height: 32px; padding: 0 10px; font: inherit; font-size: 15px; font-weight: 700; color: var(--hud-text); background: var(--hud-well); border: 1px solid var(--hud-line); border-radius: 4px; }
.sw-group-name:focus { border-color: var(--hud-gold); outline: none; }
.sw-group-onbar { font-size: 13.5px; color: var(--hud-muted); white-space: nowrap; }
.sw-group-how { margin: 0; padding: 6px 10px; font-size: 13px; line-height: 1.4; color: var(--hud-text); background: rgba(127, 216, 143, 0.08); border: 1px solid rgba(127, 216, 143, 0.35); border-radius: 4px; }
.sw-group-how b { color: #9fe8ac; }
.sw-label { display: flex; align-items: center; gap: 8px; font-size: 12.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--hud-muted); }
.sw-label > span { font-weight: 400; text-transform: none; letter-spacing: 0; }
.sw-label .sw-btn { margin-left: auto; text-transform: none; letter-spacing: 0; font-weight: 400; }
.sw-order { list-style: none; margin: 0; padding: 2px; display: flex; flex-direction: column; gap: 4px; border: 1px dashed transparent; border-radius: 5px; }
.sw-order.dragging { border-color: var(--hud-line-hi); }
.sw-row { position: relative; display: grid; grid-template-columns: 34px 28px 1fr auto; align-items: center; gap: 8px; min-height: 40px; padding: 4px 8px; background: var(--hud-well); border: 1px solid var(--hud-line-soft); border-radius: 5px; cursor: grab; }
.sw-row:hover { border-color: var(--hud-line-hi); }
.sw-row.now { border-color: rgba(127, 216, 143, 0.6); background: rgba(127, 216, 143, 0.07); }
.sw-row.drop-before::before, .sw-drop.drop-before::before { content: ""; position: absolute; left: 0; right: 0; top: -3px; height: 2px; background: var(--hud-gold); border-radius: 2px; }
.sw-pos { font-size: 14px; font-weight: 700; color: var(--hud-gold); text-align: center; font-variant-numeric: tabular-nums; }
.sw-row-icon { width: 28px; height: 28px; image-rendering: pixelated; }
.sw-row-icon.locked { filter: grayscale(1) brightness(0.6); }
.sw-row-info { display: flex; flex-direction: column; min-width: 0; }
.sw-row-name { font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sw-row.locked .sw-row-name { color: var(--hud-muted); }
.sw-now { margin-left: 8px; padding: 1px 6px; font-size: 11px; font-style: normal; font-weight: 700; color: #0b0d13; background: #7fd88f; border-radius: 3px; }
.sw-row-sub { font-size: 12.5px; color: var(--hud-muted); font-variant-numeric: tabular-nums; }
.sw-lock { color: #ff9a8f; font-weight: 600; }
.sw-cd { color: #8fb8ff; }
.sw-row-actions { display: flex; gap: 4px; }
.sw-drop { position: relative; min-height: 6px; font-size: 13px; color: var(--hud-muted); text-align: center; }
.sw-drop:not(:empty) { padding: 12px 0; border: 1px dashed var(--hud-line-hi); border-radius: 4px; }
.sw-group-foot { display: flex; justify-content: flex-end; }

/* Rodapé */
.sw-foot { display: flex; align-items: center; gap: 10px; min-height: 32px; }
.sw-msg { flex: 1; min-width: 0; font-size: 13.5px; color: #7fd88f; }
.sw-msg.error { color: #ff9a8f; }

@media (prefers-reduced-motion: reduce) {
  .sw-capture { animation: none; }
  .sw-tile, .sw-slot-box { transition: none; }
  .sw-tile:hover:not(:disabled) { transform: none; }
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: sem erros (o arquivo ainda não é importado por ninguém; só valida a sintaxe e os tipos).

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/ui/hotkeys/SpellGrid.tsx packages/client/src/ui/hotkeys/spells.css
git commit -m "Janela Magias: grade de tiles com ícone (SpellGrid) e o CSS da janela

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: `SpellsWindow.tsx` (modo "escolher") no lugar dos dois painéis

Depois desta task o jogo já abre a janela nova com `H`; o editor de grupo entra na Task 6 (até lá, o botão
"Editar grupo" não existe e os grupos só podem ser postos na barra pela grade).

**Files:**
- Create: `packages/client/src/ui/hotkeys/SpellsWindow.tsx`
- Modify: `packages/client/src/ui/hud/Hud.tsx` (linhas 7–8 e 69–70)
- Modify: `packages/client/src/ui/a11y/a11y.css` (linhas 8–9)
- Delete: `packages/client/src/ui/hotkeys/HotkeysWindow.tsx`, `SpellGroupsWindow.tsx`, `hotkeys.css`, `groups.css`

**Interfaces:**
- Consumes: `addSlot`, `assignKey`, `isModifierCode`, `removeRow`, `setRowSpell`, `EditResult` (`./edit.ts`);
  `createGroup` (`./groupsEdit.ts`); `effectiveHotkeys`, `groupsStore`, `hotkeyLabel`, `hotkeysOpen`, `hotkeysStore`,
  `keyFromEvent`, `layoutStore`, `setHotkeys`, `setSpellGroups` (`./hotkeys.ts`); `SpellGrid`, `arrowNav`
  (Task 4); `itemFor`, `itemsFor`, `shownSpell`, `SpellItem` (Task 3); `cssColor`, `PAL`
  (`../../game/spellPalette.ts`); `bindOverlay`, `pushOverlay` (`../overlays.ts`).
- Produces: `SpellsWindow()` (componente renderizado pelo `Hud.tsx`); `type Sel = number | "new" | null`;
  `useMessage(): [Msg | null, say]` (a Task 6 recebe `say` por prop). O estado `editing: string | null` e a prop
  `onEdit` do `SlotPanel` já ficam prontos para a Task 6 ligar o `GroupEditor`.

- [ ] **Step 1: Criar `SpellsWindow.tsx`**

```tsx
// Janela "Magias" (tecla H, ⚙ da barra): atalhos e grupos numa tela só, desenhada em volta da barra. Em cima, a barra
// em grande (um slot por atalho mais o "+"); clicar num slot o seleciona; embaixo, a grade de magias com ícones (clicar
// põe no slot) ou, para um grupo do jogador, o editor de prioridade (GroupEditor.tsx). Tudo aplica na hora e vai ao
// servidor junto (hotkeys.ts). Substituiu os painéis "Atalhos" e "Grupos de magia" em 2026-10-27 (decisão do dono:
// legível, um modelo mental só, tudo pelo teclado).
import { HOTKEY_MAX, defaultHotkeys, familiesFor, type Hotkey, type SpellGroup, type Vocation } from "@lemonquest/shared";
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
import { effectiveHotkeys, groupsStore, hotkeyLabel, hotkeysOpen, hotkeysStore, keyFromEvent, layoutStore, setHotkeys, setSpellGroups } from "./hotkeys.ts";
import { SpellGrid, arrowNav } from "./SpellGrid.tsx";
import { itemFor, itemsFor, shownSpell, type SpellItem } from "./spellsModel.ts";
import "./spells.css";

const W = 720;
const defaultPos = () => clampWindowPos((window.innerWidth - W) / 2, 70, W);
// Esc pela pilha de sobreposições (a última janela aberta fecha primeiro); mesma chave "hotkeys" do painel antigo.
bindOverlay("hotkeys", hotkeysOpen, (v) => v, () => hotkeysOpen.set(false));

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
 * `onResult(null)` = cancelada; com `error` a captura continua esperando (a faixa mostra o motivo).
 */
function useKeyCapture(slot: number | null, voc: Vocation | undefined, onResult: (r: EditResult | null) => void): void {
  const cb = useRef(onResult);
  cb.current = onResult;
  useLayoutEffect(() => {
    if (slot === null || !voc) return;
    const offCapture = pushOverlay("hotkeys-capture", () => cb.current(null));
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.repeat || isModifierCode(e.code)) return;
      const key = keyFromEvent(e);
      if (!key) { cb.current({ list: effectiveHotkeys(voc), error: true, message: "Ctrl e Alt não podem: o navegador usa essas combinações." }); return; }
      cb.current(assignKey(effectiveHotkeys(voc), slot, key, hotkeyLabel));
    };
    const cancel = (e: Event) => { if (!(e.target as HTMLElement | null)?.closest?.(".sw-capture")) cb.current(null); };
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
  /** Id do grupo aberto no editor (Task 6); null = grade de magias. */
  const [editing, setEditing] = useState<string | null>(null);
  const [capturing, setCapturing] = useState<number | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [msg, say] = useMessage();

  const voc = me?.vocation as Vocation | undefined;
  const list = effectiveHotkeys(voc);
  const level = me?.level ?? 1;
  // Seleção válida: a lista pode ter encolhido (tirar da barra, grupo excluído) ou enchido (o "+" some).
  const slot: Sel = typeof sel === "number" ? (sel < list.length ? sel : null) : sel === "new" && list.length < HOTKEY_MAX ? "new" : null;

  useKeyCapture(capturing, voc, (r) => {
    if (!r) { setCapturing(null); say(undefined); return; }
    say(r.message, r.error);
    if (r.error) return;
    setHotkeys(r.list);
    setCapturing(null);
  });
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
  /** "+ Novo grupo" / "Copiar família": cria e abre no editor (Task 6; até lá só cria e avisa). */
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
      <button class="sw-btn small" disabled={groups.length >= 8} onClick={() => newGroup()}>+ Novo grupo</button>
      {familiesFor(voc).map((f) => (
        <button key={f.id} class="sw-btn small" disabled={groups.length >= 8} onClick={() => newGroup(f.id)} data-tip={`Copiar "${f.name}" como grupo seu`} data-tip-sub={f.desc}>
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
        <BigBar list={list} voc={voc} groups={groups} level={level} sel={slot} onSelect={(s) => { setSel(s); setEditing(null); setCapturing(null); }} />
        <SlotPanel
          slot={slot} item={currentItem} keyText={current ? hotkeyLabel(current.key) : ""} capturing={capturing !== null} error={capturing !== null && msg?.error ? msg.text : null}
          onCapture={() => { say(undefined); setCapturing(slot as number); }}
          onRemove={() => { setHotkeys(removeRow(list, slot as number)); setSel(null); say("Atalho tirado da barra."); }}
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
        <div class="sw-foot">
          <span class={`sw-msg${msg?.error ? " error" : ""}`} role="status" aria-live="polite">{msg?.text ?? ""}</span>
          <button class={`sw-btn subtle${confirmReset ? " confirm" : ""}`} onClick={reset} data-tip="Barra recomendada" data-tip-sub="Famílias ◆ no lugar das magias parecidas, nas teclas 1–0. Descarta a sua barra atual.">
            {confirmReset ? "Clique de novo para trocar a sua barra pela recomendada" : "Recomendado"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** A barra em grande: um slot por atalho (tecla, ícone, ◆, cadeado) com o nome embaixo, mais o "+" enquanto couber. */
function BigBar({ list, voc, groups, level, sel, onSelect }: {
  list: Hotkey[]; voc: Vocation; groups: readonly SpellGroup[]; level: number; sel: Sel; onSelect: (s: Sel) => void;
}) {
  return (
    <div class="sw-bar" role="listbox" aria-label="Barra de atalhos" aria-orientation="horizontal" onKeyDown={(e) => arrowNav(e)}>
      {list.map((h, i) => {
        const item = itemFor(h.spellId, voc, groups);
        const s = item ? shownSpell(item, level) : null;
        const locked = !!item && item.level > level;
        const label = hotkeyLabel(h.key);
        return (
          <button
            key={`${h.key}:${h.spellId}`} type="button" role="option" aria-selected={sel === i}
            class={`sw-slot${sel === i ? " sel" : ""}${locked ? " locked" : ""}`}
            style={s ? ({ "--el": cssColor(PAL[s.fx]?.main ?? 0xffffff) } as never) : undefined}
            aria-label={`Tecla ${label}: ${item?.name ?? "desconhecido"}`}
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
        <span class="sw-capture" role="status" aria-live="assertive">
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
```

Observação: `editing`/`onEdit` ainda não mostram nada nesta task — a Task 6 troca a grade pelo `GroupEditor`
quando `editing` não é null. O número 8 em `disabled={groups.length >= 8}` é `GROUP_MAX`; a Task 6 troca pelo
import quando ligar o editor.

- [ ] **Step 2: Ligar no `Hud.tsx` e apagar os painéis antigos**

Em `packages/client/src/ui/hud/Hud.tsx`, troque as duas linhas de import

```tsx
import { HotkeysWindow } from "../hotkeys/HotkeysWindow.tsx";
import { SpellGroupsWindow } from "../hotkeys/SpellGroupsWindow.tsx";
```

por

```tsx
import { SpellsWindow } from "../hotkeys/SpellsWindow.tsx";
```

e, no JSX, troque

```tsx
      <HotkeysWindow />
      <SpellGroupsWindow />
```

por

```tsx
      <SpellsWindow />
```

Depois apague os quatro arquivos antigos:

```bash
git rm -q packages/client/src/ui/hotkeys/HotkeysWindow.tsx packages/client/src/ui/hotkeys/SpellGroupsWindow.tsx packages/client/src/ui/hotkeys/hotkeys.css packages/client/src/ui/hotkeys/groups.css
```

- [ ] **Step 3: "Texto maior" na janela nova (`a11y.css`)**

Nas linhas 8–9 de `packages/client/src/ui/a11y/a11y.css`, troque `.hotkeys-win .win-body` por `.spells-win .win-body`
(nas duas linhas: `data-text="1"` e `data-text="2"`).

- [ ] **Step 4: Typecheck e grep de sobras**

Run: `npm run typecheck`
Expected: sem erros.

Run: `grep -rn "HotkeysWindow\|SpellGroupsWindow\|groupsOpen\|toggleGroups\|hotkeys.css\|groups.css" packages/client/src --include=*.ts --include=*.tsx --include=*.css`
Expected: nenhuma linha (as referências antigas sumiram).

- [ ] **Step 5: Commit**

```bash
git add -A packages/client/src/ui/hotkeys packages/client/src/ui/hud/Hud.tsx packages/client/src/ui/a11y/a11y.css
git commit -m "Janela Magias no lugar de Atalhos e Grupos: barra em grande, painel do slot, grade com ícones e captura de tecla visível

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: `GroupEditor.tsx` (editor de prioridade) e o E2E da janela nova

**Files:**
- Create: `packages/client/src/ui/hotkeys/GroupEditor.tsx`
- Modify: `packages/client/src/ui/hotkeys/SpellsWindow.tsx` (import, `GROUP_MAX`, render condicional)
- Rewrite: `e2e/hotkeys.spec.ts`

**Interfaces:**
- Consumes: `addSpell`, `deleteGroup`, `moveSpell`, `placeGroup`, `removeSpell`, `renameGroup`, `sortStrongest`
  (`./groupsEdit.ts`); `hotkeyLabel`, `setSpellGroups` (`./hotkeys.ts`); `SpellGrid` (Task 4); `itemFor`,
  `SpellItem` (Task 3); `spellCooldownLeft` (`../hud/castbar.ts`); `spellIcon`; `GROUP_NAME_MAX`,
  `GROUP_SPELLS_MAX`, `groupFamily`, `pickFromFamily`, `spellDef`, `spellMana`, `spellsFor` de `@lemonquest/shared`.
- Produces: `GroupEditor({ group, groups, list, voc, level, mana, say, onBack })`.

- [ ] **Step 1: Criar `GroupEditor.tsx`**

```tsx
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
```

- [ ] **Step 2: Ligar o editor na `SpellsWindow.tsx`**

Três trocas no arquivo da Task 5:

1. Import: na primeira linha de import de `@lemonquest/shared`, acrescente `GROUP_MAX`:
   `import { GROUP_MAX, HOTKEY_MAX, defaultHotkeys, familiesFor, type Hotkey, type SpellGroup, type Vocation } from "@lemonquest/shared";`
   e, depois de `import { createGroup } from "./groupsEdit.ts";`, acrescente
   `import { GroupEditor } from "./GroupEditor.tsx";`
2. Em `groupActions`, troque as duas ocorrências de `disabled={groups.length >= 8}` por `disabled={groups.length >= GROUP_MAX}`.
3. No JSX, troque o bloco que vai de `<SlotPanel` até o fechamento `/>` do `<SpellGrid … />` (inclusive) por:

```tsx
        {editingGroup ? (
          <GroupEditor group={editingGroup} groups={groups} list={list} voc={voc} level={level} mana={me.mana} say={say} onBack={() => setEditing(null)} />
        ) : (
          <>
            <SlotPanel
              slot={slot} item={currentItem} keyText={current ? hotkeyLabel(current.key) : ""} capturing={capturing !== null} error={capturing !== null && msg?.error ? msg.text : null}
              onCapture={() => { say(undefined); setCapturing(slot as number); }}
              onRemove={() => { setHotkeys(removeRow(list, slot as number)); setSel(null); say("Atalho tirado da barra."); }}
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
```

   e, logo depois da linha `const currentItem = …;`, acrescente:

```tsx
  // Grupo aberto no editor; se foi excluído (ou nunca existiu), volta à grade.
  const editingGroup = editing ? groups.find((g) => g.id === editing) ?? null : null;
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: sem erros.

- [ ] **Step 4: Reescrever `e2e/hotkeys.spec.ts`**

Substitua o arquivo inteiro por:

```ts
// Janela "Magias" (tecla H): trocar a tecla de uma magia, tecla do jogo recusada, lançar pela tecla nova, salvo no
// personagem (volta depois de recarregar a página); tirar da barra e pôr de volta pelo slot "+"; troca de magias
// arrastando na barra real; família liberando no level; montar um grupo no editor numerado, "Mais forte primeiro",
// pôr na barra, lançar e manter.
import { expect, test } from "@playwright/test";
import { enterGame, meState, monsters, playFromList, setLevel, snap, targetNearest, teleport, walkableNear } from "./helpers.ts";

/** Floresta ao norte da vila (fora da PZ: a regen de mana é baixa e o gasto da magia aparece). */
const FOREST = { x: 70, y: 62 };

test("magias: trocar a tecla da Cura para G, recusar Q, lançar com G e manter depois de recarregar", async ({ page }) => {
  const p = await enterGame(page, "druid");
  await setLevel(page, 20);
  const spot = (await walkableNear(page, FOREST.x, FOREST.y, 4))[0]!;
  await teleport(page, spot.x, spot.y);
  const canvas = page.locator("#game canvas");
  await canvas.hover({ position: { x: 300, y: 300 } });

  // Padrão: Cura na tecla 1.
  const first = page.locator(".action-slot").first();
  await expect(first.locator(".action-key")).toHaveText("1");

  await page.keyboard.press("h");
  const win = page.getByRole("dialog", { name: "Magias" });
  await expect(win).toBeVisible();
  // Selecionar o slot da tecla 1: o painel diz o que está nele e o tile da Cura fica marcado.
  await win.getByRole("option", { name: "Tecla 1: Cura" }).click();
  await expect(win.locator(".sw-panel-title")).toContainText("Cura");
  await expect(win.getByRole("button", { name: /^Cura, tecla 1/ })).toHaveAttribute("aria-pressed", "true");
  await win.getByRole("button", { name: "Trocar tecla" }).click();
  await expect(win).toContainText("Aperte a nova tecla");
  // Q é a poção de vida: recusada com o motivo, e nada de poção (continua esperando a tecla).
  await page.keyboard.press("q");
  await expect(win).toContainText("usada por: Poção de vida");
  await page.keyboard.press("g");
  await expect(win.locator(".sw-slot.sel .sw-slot-key")).toHaveText("G");
  await snap(page, "spells-window");
  await page.keyboard.press("Escape");
  await expect(win).toBeHidden();

  await expect(first.locator(".action-key")).toHaveText("G");
  const mana0 = (await meState(page))!.mana as number;
  await canvas.hover({ position: { x: 300, y: 300 } });
  await page.keyboard.press("g");
  await expect.poll(async () => (await meState(page))!.mana as number, { timeout: 5000 }).toBeLessThan(mana0);
  await expect(first).toHaveClass(/cooling/);

  // Salvo no personagem: recarregar a página e entrar de novo mantém o G.
  await page.reload();
  await playFromList(page, p);
  await expect(page.locator(".action-slot").first().locator(".action-key")).toHaveText("G");
});

test("magias: tirar um atalho da barra e pôr de volta pelo slot +", async ({ page }) => {
  await enterGame(page, "sorcerer");
  await page.keyboard.press("h");
  const win = page.getByRole("dialog", { name: "Magias" });
  await expect(win).toBeVisible();
  const slot = win.getByRole("option", { name: /: Pés Ligeiros$/ });
  const key = (await slot.locator(".sw-slot-key").innerText()).trim();
  await slot.click();
  await win.getByRole("button", { name: "Tirar da barra" }).click();
  await expect(win.getByRole("option", { name: /: Pés Ligeiros$/ })).toHaveCount(0);
  await expect(win).toContainText("Atalho tirado da barra.");
  // O "+" recebe a magia na próxima tecla livre (a que acabou de vagar) e o slot volta selecionado.
  await win.getByRole("option", { name: "Atalho novo" }).click();
  await win.getByRole("button", { name: /^Pés Ligeiros/ }).click();
  await expect(win.getByRole("option", { name: `Tecla ${key}: Pés Ligeiros` })).toHaveAttribute("aria-selected", "true");
  await expect(win).toContainText(`Na tecla ${key}.`);
});

test("atalhos: arrastar um slot sobre outro troca as magias e as teclas ficam", async ({ page }) => {
  await enterGame(page, "sorcerer");
  const slots = page.locator(".action-slot");
  const words = async (i: number) => (await slots.nth(i).getAttribute("data-tip")) ?? "";
  const a = await words(0), b = await words(1);
  expect(a).not.toBe(b);
  // Arrasto de verdade com o mouse (mousedown → movimentos → mouseup), como o jogador faz.
  const from = (await slots.nth(0).boundingBox())!, to = (await slots.nth(1).boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 6, from.y + from.height / 2, { steps: 3 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => words(0)).toBe(b);
  expect(await words(1)).toBe(a);
  await expect(slots.nth(0).locator(".action-key")).toHaveText("1");
  await expect(slots.nth(1).locator(".action-key")).toHaveText("2");
});

test("família de magias: só o que está liberado aparece, magia nova avisa e a tecla da família solta a mais forte pronta", async ({ page }) => {
  await enterGame(page, "sorcerer");
  const slots = page.locator(".action-slot");
  // lv 1: Cura (1) e a família "Ataque no alvo" (2); o resto da barra recomendada ainda está bloqueado e não aparece.
  await expect(slots).toHaveCount(2);
  await expect(slots.nth(1)).toHaveClass(/family/);
  await expect(slots.nth(1)).toHaveAttribute("data-tip", "Ataque no alvo: Bola de Fogo");

  await setLevel(page, 20);
  await expect(page.locator(".toast").filter({ hasText: /Novas magias|Nova magia/ }).first()).toBeVisible();
  await expect(slots).toHaveCount(6);

  // Sem alvo, a família fica apagada; com alvo ao lado, a tecla 2 solta o Raio de Energia (a mais forte no lv 20).
  await expect(slots.nth(1)).toHaveClass(/no-target/);
  const spot = (await walkableNear(page, FOREST.x, FOREST.y, 4))[0]!;
  await teleport(page, spot.x, spot.y);
  // O alvo (rato) pode morrer ou fugir antes da tecla: até 3 tentativas, mirando de novo no mais perto.
  const beamCd = () => page.evaluate(() => (window as any).__lq.spellCd("energy_beam") as number);
  for (let attempt = 0; attempt < 3 && (await beamCd()) === 0; attempt++) {
    const pos = (await meState(page))!;
    const mob = (await monsters(page)).sort((a, b) => Math.max(Math.abs(a.x - pos.x), Math.abs(a.y - pos.y)) - Math.max(Math.abs(b.x - pos.x), Math.abs(b.y - pos.y)))[0];
    const near = mob && (await walkableNear(page, mob.x, mob.y, 2)).find((w) => w.x !== mob.x || w.y !== mob.y);
    if (near) await teleport(page, near.x, near.y);
    await targetNearest(page);
    await expect(slots.nth(1)).toHaveAttribute("data-tip", "Ataque no alvo: Raio de Energia");
    await page.locator("#game canvas").hover({ position: { x: 300, y: 300 } });
    await page.keyboard.press("2");
    await expect.poll(beamCd, { timeout: 3000 }).toBeGreaterThan(0).catch(() => {});
  }
  expect(await beamCd()).toBeGreaterThan(0);
  await snap(page, "spell-family");
});

test("grupos: montar o próprio grupo no editor numerado, 'Mais forte primeiro', pôr na barra, lançar e manter depois de recarregar", async ({ page }) => {
  const p = await enterGame(page, "sorcerer");
  await setLevel(page, 60);
  const spot = (await walkableNear(page, FOREST.x, FOREST.y, 4))[0]!;
  await teleport(page, spot.x, spot.y);
  const canvas = page.locator("#game canvas");
  await canvas.hover({ position: { x: 300, y: 300 } });

  await page.keyboard.press("h");
  const win = page.getByRole("dialog", { name: "Magias" });
  await expect(win).toBeVisible();
  await win.getByRole("button", { name: "+ Novo grupo" }).click();
  const editor = win.locator(".sw-group");
  await expect(editor).toBeVisible();
  await editor.getByRole("textbox", { name: "Nome do grupo" }).fill("Meu combo");

  // Clique adiciona no fim; "Mais forte primeiro" põe a Onda de Fogo (lv 35) na frente da Bola de Fogo (lv 1).
  await editor.getByRole("button", { name: /^Bola de Fogo/ }).click();
  await editor.getByRole("button", { name: /^Onda de Fogo/ }).click();
  // Nomes na ordem (sem o selo "sai agora", que fica dentro do nome).
  const names = async () => (await editor.locator(".sw-row .sw-row-name").allInnerTexts()).map((n) => n.replace("sai agora", "").trim());
  await expect.poll(names).toEqual(["Bola de Fogo", "Onda de Fogo"]);
  await editor.getByRole("button", { name: "Mais forte primeiro" }).click();
  await expect.poll(names).toEqual(["Onda de Fogo", "Bola de Fogo"]);
  await expect(editor.locator(".sw-row.now .sw-row-name")).toContainText("Onda de Fogo");
  await snap(page, "spells-group-editor");

  await editor.getByRole("button", { name: "Pôr na barra" }).click();
  const onBar = editor.locator(".sw-group-onbar kbd");
  await expect(onBar).toBeVisible();
  const key = (await onBar.innerText()).trim();
  await page.keyboard.press("Escape");
  await expect(win).toBeHidden();

  const slot = page.locator(".action-slot", { has: page.locator(".action-key", { hasText: new RegExp(`^${key}$`) }) });
  await expect(slot).toHaveAttribute("data-tip", /Onda de Fogo/);
  const mana0 = (await meState(page))!.mana as number;
  await canvas.hover({ position: { x: 300, y: 300 } });
  await page.keyboard.press(key.toLowerCase());
  await expect.poll(async () => (await meState(page))!.mana as number, { timeout: 5000 }).toBeLessThan(mana0);

  await page.reload();
  await playFromList(page, p);
  await page.keyboard.press("h");
  await win.getByRole("option", { name: `Tecla ${key}: Meu combo` }).click();
  await win.getByRole("button", { name: "Editar grupo" }).click();
  await expect.poll(names).toEqual(["Onda de Fogo", "Bola de Fogo"]);
});
```

- [ ] **Step 5: Typecheck do E2E e unitários do cliente**

Run: `npm run typecheck && npx vitest run packages/client`
Expected: sem erros; todos os testes do cliente passam.

O E2E roda no CI da PR (`npm run test:e2e`). Localmente, **só se o dono pedir**:
`npm run test:e2e -- e2e/hotkeys.spec.ts --repeat-each=2` (com `E2E_SNAPS=1` para as capturas em
`test-results/snaps/spells-*.png`).

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/ui/hotkeys/GroupEditor.tsx packages/client/src/ui/hotkeys/SpellsWindow.tsx e2e/hotkeys.spec.ts
git commit -m "Janela Magias: editor de grupo numerado com Mais forte primeiro, e E2E da janela nova

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Rótulos da tecla H, documentação e verificação final

**Files:**
- Modify: `packages/client/src/ui/hud/HelpPopover.tsx:24`
- Modify: `packages/shared/src/hotkeys.ts:1,43`
- Modify: `CHANGELOG.md` (topo), `packages/shared/src/data/news.ts` (topo de `NEWS`), `README.md:30-31`,
  `docs/GAME_ROADMAP.md` (depois da seção "Plano dos ciclos 14–20"), `docs/TEST_PLAN.md` (antes do primeiro
  `## Resultados`)

- [ ] **Step 1: Rótulos da tecla H**

`packages/client/src/ui/hud/HelpPopover.tsx`, linha 24: troque
`{ keys: ["H"], label: "Atalhos de magia (escolher a tecla de cada magia)" },`
por
`{ keys: ["H"], label: "Magias (tecla de cada magia e grupos)" },`.

`packages/shared/src/hotkeys.ts`: na linha 1 troque `(painel "Atalhos", tecla H)` por `(janela "Magias", tecla H)`;
na linha 43 troque `KeyH: "Atalhos",` por `KeyH: "Magias",`.

Run: `npx vitest run packages/shared/src/hotkeys.test.ts packages/client/src/ui/hotkeys`
Expected: PASS (a mensagem "Tecla Q usada por: Poção de vida" dos testes não muda; só o rótulo do H).

- [ ] **Step 2: CHANGELOG**

No topo de `CHANGELOG.md`, logo abaixo de `# Changelog`, acrescente:

```markdown
## [Não lançado] — 2026-10-27 · janela "Magias": atalhos e grupos numa tela só

Pedido do dono: "melhore a usabilidade e acessibilidade de gerenciar skills, achei ruim" (ordem dos grupos confusa,
tecla e magia lentas de escolher, letras e botões pequenos). Especificação em
`docs/superpowers/specs/2026-10-27-janela-magias-design.md`.
- **Uma janela só** (`H` ou ⚙ da barra) no lugar de "Atalhos" e "Grupos de magia": a barra desenhada em grande no
  topo (tecla, ícone, ◆, cadeado, nome embaixo, slot "+"); clicar num slot e escolher numa **grade de magias com
  ícones** (famílias prontas e grupos seus com ◆; o tile mostra a tecla onde já está). "Trocar tecla" com faixa
  visível; "Tirar da barra"; "Recomendado" pede um segundo clique.
- **Editor de grupo** na mesma janela: lista numerada "1º, 2º…" com ↑ ↓ ✕ grandes, a frase fixa do que a tecla faz,
  **"Mais forte primeiro"** (ordena por level, depois mana) e "Adicionar ao grupo" pelos mesmos tiles. Arrastar
  continua, mas não é necessário.
- **Legibilidade**: 14 px no corpo, 12,5 px no secundário, botões ≥ 32 px, tiles ≥ 64 px, foco visível, setas movem
  o foco na barra e na grade, `aria-live` nas mensagens; entra no "texto maior" do jogo.
- Servidor, protocolo e regras de validade não mudam (`edit.ts` ganha `addSlot`, `groupsEdit.ts` ganha
  `sortStrongest`; modelo puro `spellsModel.ts`). E2E `hotkeys.spec.ts` reescrito (5 cenários).
```

- [ ] **Step 3: Novidades**

Em `packages/shared/src/data/news.ts`, no topo de `NEWS` (antes da entrada `2026-10-27a`):

```ts
  {
    id: "2026-10-27b",
    date: "27 de outubro (tarde)",
    title: "Janela de magias nova",
    items: [
      "Aperte H: a sua barra aparece em grande. Clique num slot e escolha a magia numa grade com ícones; famílias e grupos têm o ◆.",
      "Trocar a tecla ficou claro: um botão, uma faixa 'Aperte a nova tecla' e o motivo quando a tecla é do jogo.",
      "Grupos: a lista de prioridade é numerada (1º, 2º…), com botões grandes e 'Mais forte primeiro' para ordenar num clique.",
      "Tudo maior e legível, e funciona só com o teclado (setas, Enter, Esc).",
    ],
  },
```

Run: `npx vitest run packages/shared/src/data/news.test.ts` — Expected: PASS (id único, itens < 200 caracteres).

- [ ] **Step 4: README**

Em `README.md`, troque as linhas 30–31 da tabela de controles por:

```markdown
| Magias: a tecla de cada magia | `H` (ou ⚙ no fim da barra): a barra aparece em grande; clique num slot e escolha a magia na grade com ícones (até 12 atalhos, qualquer tecla livre, também com `Shift`; salvo no personagem). "Trocar tecla" captura a nova; "Recomendado" monta a barra com as famílias; magia nova entra sozinha numa tecla livre |
| Montar os seus grupos de magia | `H` → **+ Novo grupo** (ou **Copiar ◆ família**): até 8 grupos com as magias e a ordem que você quiser (lista numerada com ↑↓, "Mais forte primeiro"); a tecla solta a primeira da lista que estiver pronta. "Pôr na barra" põe o grupo numa tecla livre |
```

- [ ] **Step 5: ROADMAP e TEST_PLAN**

`docs/GAME_ROADMAP.md`: logo depois do parágrafo da seção `## Plano dos ciclos 14–20 (aprovado em 2026-10-25)` (antes
de `## Ciclo 20 …`), acrescente:

```markdown
## Janela "Magias" (2026-10-27) — usabilidade e acessibilidade dos atalhos e grupos

| # | Item | Status | Validação |
|---|---|---|---|
| JM-1 | Dono: "melhore a usabilidade e acessibilidade de gerenciar skills". Decisão (🧭 2026-10-27): caminho A — uma janela só em volta da barra, no lugar de "Atalhos" e "Grupos de magia" (`SpellsWindow.tsx`, `GroupEditor.tsx`, `SpellGrid.tsx`, `spellsModel.ts`); grade com ícones, editor numerado com "Mais forte primeiro", 14 px, botões ≥ 32 px, teclado completo. Spec: `docs/superpowers/specs/2026-10-27-janela-magias-design.md` | ✅ (2026-10-27) | `edit.test.ts`, `groupsEdit.test.ts`, `spellsModel.test.ts`, E2E `hotkeys.spec.ts` (CI) |
```

`docs/TEST_PLAN.md`: logo antes da linha `## Resultados — ciclo 1 (2026-10-14)`, acrescente (preencha os números com
a saída real de `npx vitest run 2>&1 | tail -15` e do CI da PR):

```markdown
## Resultados — janela "Magias" (2026-10-27)

| Verificação | Resultado |
|---|---|
| Typecheck | ok |
| Unitários | `npx vitest run`: <arquivos> arquivos, <testes> testes, 0 falhas, 0 pulados (+5 novos: `addSlot`, `sortStrongest`, `spellsModel` ×3) |
| E2E | CI da PR: `hotkeys.spec.ts` reescrito (5 cenários: tecla G/Q, tirar e pôr pelo +, arrastar na barra, família no level, grupo com "Mais forte primeiro"); resultado: <passou/falhou, tempo> |
| Capturas | `E2E_SNAPS=1`: `spells-window.png`, `spells-group-editor.png`, `spell-family.png` (conferidas à mão: 14 px, botões ≥ 32 px, foco visível) |
| Texto maior (1,3) em 1366×768 | janela cabe e o corpo rola (conferência manual) |
```

- [ ] **Step 6: Verificação final**

Run: `npm run typecheck && npx vitest run 2>&1 | tail -6`
Expected: typecheck sem erros; `Test Files N passed (N)` e `Tests M passed (M)`, sem falhas nem skips. Anote N e M no
`docs/TEST_PLAN.md` (Step 5).

Run: `grep -rn "Atalhos de magia\|Grupos de magia" packages/client/src e2e README.md | grep -v "CHANGELOG"`
Expected: só ocorrências históricas em `docs/` (nenhuma no cliente, no E2E ou no README).

- [ ] **Step 7: Commit e PR**

```bash
git add CHANGELOG.md README.md docs/GAME_ROADMAP.md docs/TEST_PLAN.md packages/shared/src/data/news.ts packages/shared/src/hotkeys.ts packages/client/src/ui/hud/HelpPopover.tsx
git commit -m "Janela Magias: rótulos da tecla H, CHANGELOG, Novidades, README, roadmap e plano de testes

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push -u origin janela-magias
gh pr create --base main --head janela-magias --title "Janela Magias: atalhos e grupos numa tela só, legível e pelo teclado" --body-file - <<'EOF'
## O que muda
Uma janela só (`H`) no lugar de "Atalhos" e "Grupos de magia": barra em grande no topo, grade de magias com ícones, captura de tecla visível, editor de grupo numerado com "Mais forte primeiro"; 14 px, botões ≥ 32 px, foco visível e teclado completo. Servidor e protocolo não mudam. Decisão do dono em 2026-10-27; spec em `docs/superpowers/specs/2026-10-27-janela-magias-design.md`, plano em `docs/superpowers/plans/2026-10-27-janela-magias.md`.

## Testes
- Unitários novos: `addSlot`, `sortStrongest`, `spellsModel` (3). `npm run typecheck` e `npm test` verdes.
- E2E `hotkeys.spec.ts` reescrito (5 cenários) — roda no CI.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
```

Depois: acompanhar o CI (`gh pr checks <n> --watch`), conferir as capturas se `E2E_SNAPS` estiver ligado no CI, e
só então o dono decide merge e deploy (imagem de rollback `lemonquest:pre-janela-magias` + backup do banco, como
nos ciclos anteriores).

---

## Auto-revisão do plano (feita ao escrever)

- **Cobertura da especificação:** layout (Task 5), editor (Task 6), legibilidade/acessibilidade (Task 4 CSS +
  Task 5 `arrowNav`/`aria-*` + `a11y.css`), funções puras (Tasks 1–3), casos de borda (barra cheia → `addSlot` e
  `placeGroup`; grupo vazio "(vazio)" na barra; excluir grupo → `sanitizeHotkeys` tira da barra; tecla usada → troca
  com aviso; tecla do jogo → recusada na faixa; bloqueado pelo level → cadeado; "Recomendado" com segundo clique;
  nome vazio → regra do servidor), testes (Tasks 1–3 unitários, Task 6 E2E, Task 7 TEST_PLAN), documentação (Task 7).
- **Diferença assumida em relação à spec:** `addSlot(list, spellId, label)` em vez de `addSlot(list, vocation, spellId)`
  — a vocação não é necessária (a sanitização acontece em `setHotkeys`), e `label` segue o padrão de `assignKey`.
- **Nomes consistentes entre tasks:** `itemFor`/`shownSpell`/`itemsFor`/`subtitle`/`SpellItem` (Task 3) usados nas
  Tasks 4–6; `SpellGrid`/`SpellTile`/`arrowNav`/`GridBlock` (Task 4) usados nas Tasks 5–6; `useMessage`/`say`,
  `Sel`, `editing`/`onEdit` (Task 5) usados na Task 6; `sortStrongest` (Task 2) e `addSlot` (Task 1) nos lugares
  certos.

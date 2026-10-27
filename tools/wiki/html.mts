// Helpers de HTML da wiki (contrato usado por todas as páginas: pages/*.mts). Funções puras, sem estado — exceto o
// cache de dimensões das imagens (ícones e sprites), lido do cabeçalho do PNG em assets/.
//
// Convenções:
// - Links levam `depth` = quantos "../" separam a página da raiz da wiki ("criaturas/rato.html" → 1; "index.html" → 0).
// - Ícones usam "/" + url (a url dos dados é relativa a assets/, servida na raiz do jogo); o gerador reescreve
//   `url('/…')` e `src="/…"` para caminhos relativos ao gravar cada página, então a wiki também abre direto do disco.
// - `table()` recebe células em HTML cru (escape o texto com `esc`); números viram texto com ponto de milhar e chave de
//   ordenação. `link()` recebe texto puro (é escapado).
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ITEMS, MONSTERS, NPCS, QUEST_LIST, SPELLS,
  type DamageKind, type ItemDef, type MonsterDef, type Vocation,
} from "../../packages/shared/src/index.ts";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const ASSETS = join(ROOT, "assets");

export interface SearchEntry {
  title: string;
  /** Tipo mostrado na busca ("Criatura", "Item", "Magia"…). */
  kind: string;
  /** Texto extra que também casa com a busca (sinônimos, palavras mágicas, zona…). */
  text: string;
  /** Destino relativo à raiz da wiki; ausente = a própria página (pode ter âncora: "mecanicas/coliseu.html#mods"). */
  href?: string;
}

export interface WikiPage {
  /** Caminho relativo à raiz da wiki, com "/" ("criaturas/rato.html"). Define a profundidade da página. */
  path: string;
  title: string;
  /** HTML de dentro do <main>. */
  body: string;
  /** Entradas no índice global da busca (search.json). */
  search?: SearchEntry[];
  /** Trilha opcional acima do conteúdo (HTML; links com a profundidade desta página). */
  nav?: string;
}

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (s: unknown): string => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]!);

/** "../" repetido `depth` vezes ("" na raiz). */
export const up = (depth: number): string => "../".repeat(Math.max(0, depth));

/** id → nome de arquivo seguro ("Floresta Sussurrante" → "floresta-sussurrante"; "mt_cromo" fica igual). */
export const slug = (id: string): string =>
  id.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "x";

export const vocName: Record<Vocation, string> = { knight: "Cavaleiro", paladin: "Paladino", sorcerer: "Feiticeiro", druid: "Druida" };
export const kindName: Record<DamageKind, string> = {
  physical: "Físico", fire: "Fogo", ice: "Gelo", energy: "Energia", earth: "Terra", holy: "Sagrado", death: "Morte", heal: "Cura", mana: "Mana",
};

const NUM = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
/** 12345 → "12.345"; 2.5 → "2,5" (até 2 casas). */
export const fmt = (n: number): string => (Number.isFinite(n) ? NUM.format(n) : String(n));
/** 0.075 → "7,5 %" (espaço inseparável antes do %). */
export const pct = (x: number, digits = 1): string =>
  `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: digits }).format(x * 100)} %`;

/** Link para uma página da wiki: `href` relativo à raiz da wiki; `text` é texto puro (escapado). */
export function link(href: string, text: string, depth: number): string {
  return `<a href="${esc(up(depth) + href)}">${esc(text)}</a>`;
}

const named = (href: string, name: string, depth: number, cls: string, known: boolean): string =>
  `<a class="${cls}${known ? "" : " missing"}" href="${esc(up(depth) + href)}">${esc(name)}</a>`;

export const itemLink = (id: string, depth: number): string =>
  named(`itens/${slug(id)}.html`, ITEMS[id]?.name ?? id, depth, "l-item", Object.hasOwn(ITEMS, id));
export const monsterLink = (id: string, depth: number): string =>
  named(`criaturas/${slug(id)}.html`, MONSTERS[id]?.name ?? id, depth, "l-monster", Object.hasOwn(MONSTERS, id));
export const npcLink = (id: string, depth: number): string =>
  named(`npcs/${slug(id)}.html`, NPCS[id]?.name ?? id, depth, "l-npc", Object.hasOwn(NPCS, id));
export const spellLink = (id: string, depth: number): string =>
  named(`magias/${slug(id)}.html`, SPELLS[id]?.name ?? id, depth, "l-spell", Object.hasOwn(SPELLS, id));
export const questLink = (id: string, depth: number): string => {
  const q = QUEST_LIST.find((x) => x.id === id);
  return named(`missoes/${slug(id)}.html`, q?.name ?? id, depth, "l-quest", !!q);
};
export const zoneLink = (name: string, depth: number): string => named(`mapa/${slug(name)}.html`, name, depth, "l-zone", true);

// ---------------------------------------------------------------------------------------------------------------------
// Ícones e sprites (CSS background sobre a imagem do jogo; nada é copiado)
// ---------------------------------------------------------------------------------------------------------------------

const sizes = new Map<string, { w: number; h: number } | null>();
/** Imagens referenciadas pelos dados que não existem em assets/ (o gerador avisa no fim). */
export const missingImages = new Set<string>();

/** Largura/altura de um PNG em assets/ (lidas do IHDR: bytes 16–23). undefined = não existe ou não é PNG. */
export function imageSize(url: string): { w: number; h: number } | undefined {
  if (!sizes.has(url)) {
    const file = join(ASSETS, url);
    let v: { w: number; h: number } | null = null;
    if (existsSync(file)) {
      const b = readFileSync(file);
      if (b.length >= 24 && b.toString("ascii", 1, 4) === "PNG") v = { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
    }
    if (!v) missingImages.add(url);
    sizes.set(url, v);
  }
  return sizes.get(url) ?? undefined;
}

const hex = (n: number): string => `#${(n & 0xffffff).toString(16).padStart(6, "0")}`;
const px = (n: number): string => `${Math.round(n * 100) / 100}px`;

/**
 * Quadro `frame` (índice numa grade de colunas = largura da imagem ÷ frameWidth) da imagem `url`, escalado para caber
 * em `size` px. `tint` = multiplicação de cor (como o tint do Phaser): cor de fundo em multiply, recortada pela própria
 * imagem como máscara (a transparência continua transparente).
 */
function sprite(url: string, frame: number, fw: number | undefined, fh: number | undefined, size: number, tint: number | undefined, label: string, cls: string): string {
  const dim = imageSize(url);
  if (!dim) return `<span class="${cls} missing" style="width:${size}px;height:${size}px" title="${esc(label)}"></span>`;
  const w = fw ?? dim.w, h = fh ?? dim.h;
  const cols = Math.max(1, Math.floor(dim.w / w));
  const col = frame % cols, row = Math.floor(frame / cols);
  const k = size / Math.max(w, h);
  const img = `url('/${url}')`;
  const bsize = `${px(dim.w * k)} ${px(dim.h * k)}`;
  const bpos = `${px(-col * w * k)} ${px(-row * h * k)}`;
  let style = `width:${px(w * k)};height:${px(h * k)};background-image:${img};background-size:${bsize};background-position:${bpos}`;
  if (tint !== undefined && (tint & 0xffffff) !== 0xffffff) {
    style += `;background-color:${hex(tint)};background-blend-mode:multiply`
      + `;-webkit-mask-image:${img};-webkit-mask-size:${bsize};-webkit-mask-position:${bpos};-webkit-mask-repeat:no-repeat`
      + `;mask-image:${img};mask-size:${bsize};mask-position:${bpos};mask-repeat:no-repeat`;
  }
  return `<span class="${cls}" role="img" aria-label="${esc(label)}" title="${esc(label)}" style="${style}"></span>`;
}

/** Ícone do item (`size` px no lado maior, padrão 32). */
export function itemIcon(def: ItemDef, size = 32): string {
  const ic = def.icon;
  return sprite(ic.url, ic.frame ?? 0, ic.frameWidth, ic.frameHeight, size, ic.tint, def.name, "icon");
}

/** Primeiro quadro "de frente" (andando para baixo) da sprite da criatura: grid4 = coluna 0, linha 0; custom = walk.down[0]. */
export function creatureIcon(def: MonsterDef, size = 32): string {
  const s = def.sprite;
  const frame = s.layout === "custom" ? s.walk?.down[0] ?? 0 : 0;
  return sprite(s.url, frame, s.frameWidth, s.frameHeight, size, s.tint, def.name, "icon creature");
}

/** Retrato de NPC: primeiro quadro "de frente" do sheet de personagem (64x112, quadros 16x16, coluna 0 = baixo). */
export function npcIcon(spriteUrl: string, name: string, size = 32): string {
  return sprite(spriteUrl, 0, 16, 16, size, undefined, name, "icon");
}

// ---------------------------------------------------------------------------------------------------------------------
// Pedaços comuns
// ---------------------------------------------------------------------------------------------------------------------

/** Selo colorido do tipo de dano ("Fogo"). */
export const kindBadge = (k: DamageKind): string => `<span class="badge k-${k}">${esc(kindName[k] ?? k)}</span>`;

/** "Cavaleiro, Druida" ou "Todas" (lista ausente/vazia ou com as 4). */
export function vocList(v: readonly Vocation[] | undefined): string {
  if (!v?.length || v.length >= 4) return "Todas";
  return v.map((x) => vocName[x] ?? x).join(", ");
}

/** Milissegundos por extenso curto: 1500 → "1,5 s"; 90 000 → "1 min 30 s"; 36 000 000 → "10 h". */
export function duration(ms: number): string {
  const s = ms / 1000;
  if (s < 60) return `${fmt(s)} s`;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = Math.round(s % 60);
  return [h ? `${h} h` : "", m ? `${m} min` : "", r ? `${r} s` : ""].filter(Boolean).join(" ");
}

/**
 * Tabela com cabeçalho. Células e cabeçalhos são HTML cru; número vira `fmt(n)` alinhado à direita com chave de
 * ordenação exata. `sortable` = clicar no cabeçalho ordena (JS do layout): número pela chave, texto em ordem
 * alfabética; uma célula HTML pode trazer a chave num elemento interno (`<span data-sort="25">lv 25–40</span>`).
 */
export function table(headers: string[], rows: (string | number)[][], opts: { class?: string; sortable?: boolean } = {}): string {
  const cls = ["wt", opts.class].filter(Boolean).join(" ");
  const head = headers.map((h) => `<th scope="col">${h}</th>`).join("");
  const body = rows.map((r) => `<tr>${r.map((c) => (typeof c === "number"
    ? `<td class="n" data-sort="${c}">${fmt(c)}</td>`
    : `<td>${c}</td>`)).join("")}</tr>`).join("\n");
  return `<div class="table-wrap"><table class="${cls}"${opts.sortable ? " data-sortable" : ""}><thead><tr>${head}</tr></thead><tbody>\n${body}\n</tbody></table></div>`;
}

// ---------------------------------------------------------------------------------------------------------------------
// Página inteira
// ---------------------------------------------------------------------------------------------------------------------

/** Seções do menu (pasta → rótulo). "" = início. */
export const MENU: readonly [string, string][] = [
  ["", "Início"], ["criaturas", "Criaturas"], ["itens", "Itens"], ["magias", "Magias"], ["npcs", "NPCs"],
  ["missoes", "Missões"], ["mapa", "Mapa"], ["mecanicas", "Mecânicas"],
];

const pad2 = (n: number) => String(n).padStart(2, "0");
/** Data da geração (uma por execução, igual em todas as páginas). */
const GENERATED = (() => { const d = new Date(); return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`; })();


/** Caixa de busca (o wiki.js liga todas as da página ao mesmo índice). `big` = a da página inicial. */
export const searchBox = (cls = "", placeholder = "Buscar (atalho: /)"): string =>
  `<div class="search${cls ? ` ${cls}` : ""}"><input type="search" placeholder="${esc(placeholder)}" aria-label="Buscar na wiki" autocomplete="off" spellcheck="false"><ul class="results" hidden></ul></div>`;

/**
 * Página HTML inteira (cabeçalho com menu e busca, <main>, rodapé). `section` = pasta da página ("criaturas"; "" na
 * raiz) para marcar o item do menu; o gerador passa a do `path`.
 */
export function layout(p: { title: string; body: string; depth: number; nav?: string; section?: string }): string {
  const u = up(p.depth);
  const menu = MENU.map(([sec, label]) => `<a href="${u}${sec ? `${sec}/` : ""}index.html"${sec === p.section ? ' aria-current="page"' : ""}>${label}</a>`).join("");
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(p.title)} · Wiki · The Lemon Quest</title>
<meta name="theme-color" content="#11141c">
<link rel="icon" type="image/png" href="${u}../favicon/favicon-32.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Pixelify+Sans:wght@400;600&display=swap">
<link rel="stylesheet" href="${u}wiki.css">
</head>
<body data-root="${u}">
<header class="top"><div class="wrap">
<a class="logo" href="${u}index.html"><img class="lemon" src="${u}../favicon/favicon-32.png" alt="" width="20" height="20">The Lemon Quest <b>Wiki</b></a>
<nav class="menu" aria-label="Seções">${menu}</nav>
${searchBox()}
</div></header>
${p.nav ? `<nav class="crumbs wrap" aria-label="Trilha">${p.nav}</nav>\n` : ""}<main class="wrap">
${p.body}
</main>
<footer class="wrap">Gerada em ${GENERATED} a partir dos dados do jogo · <a href="${u}../index.html">Voltar ao jogo</a></footer>
<script src="${u}wiki.js" defer></script>
</body>
</html>
`;
}

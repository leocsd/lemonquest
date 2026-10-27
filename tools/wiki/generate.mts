// Gera a wiki estática do jogo a partir dos próprios dados (packages/shared + assets/maps/world.json): nada é escrito à
// mão, então a wiki nunca diverge do jogo. Uso:
//   npx tsx tools/wiki/generate.mts [pastaDeSaída]     (padrão: assets/wiki; `npm run wiki`)
// O build (tools/build-public.mjs) roda isto e copia assets/wiki para o cliente: em produção fica em /wiki/.
// Confere os links internos: link quebrado para uma seção que tem páginas derruba a execução (código 1); para uma
// seção ainda sem nenhuma página (módulo de outra frente não implementado) só avisa.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, posix, relative, resolve } from "node:path";
import { ASSETS, MENU, ROOT, layout, missingImages, up, type SearchEntry, type WikiPage } from "./html.mts";
import { renderMap, type WikiFile } from "./map.mts";
import { buildModel } from "./model.mts";
import * as home from "./pages/index.mts";
import * as items from "./pages/items.mts";
import * as mechanics from "./pages/mechanics.mts";
import * as monsters from "./pages/monsters.mts";
import * as npcs from "./pages/npcs.mts";
import * as quests from "./pages/quests.mts";
import * as spells from "./pages/spells.mts";

/** Arquivo-marca da pasta gerada: só uma pasta com ela (ou vazia) é apagada antes de gerar de novo. */
const MARKER = ".wiki-gerada";

const t0 = performance.now();
const outDir = resolve(process.argv[2] ?? join(ASSETS, "wiki"));
if (existsSync(outDir) && readdirSync(outDir).length && !existsSync(join(outDir, MARKER))) {
  console.error(`wiki: ${outDir} não está vazia e não foi gerada por este script (sem ${MARKER}); escolha outra pasta.`);
  process.exit(1);
}

const m = buildModel();
const map = renderMap(m);
const pages: WikiPage[] = [
  ...home.render(m),
  ...monsters.render(m),
  ...items.render(m),
  ...spells.render(m),
  ...npcs.render(m),
  ...quests.render(m),
  ...map.pages,
  ...mechanics.render(m),
];
const files: WikiFile[] = [...map.files];

// --- conferências --------------------------------------------------------------------------------------------------
const byPath = new Map<string, WikiPage>();
for (const p of pages) {
  if (byPath.has(p.path)) throw new Error(`wiki: página duplicada ${p.path}`);
  if (p.path.startsWith("/") || p.path.includes("..") || !p.path.endsWith(".html")) throw new Error(`wiki: caminho inválido ${p.path}`);
  byPath.set(p.path, p);
}
const depthOf = (path: string) => path.split("/").length - 1;
const sectionOf = (path: string) => (path.includes("/") ? path.split("/")[0]! : "");
const sectionsWithPages = new Set(pages.map((p) => sectionOf(p.path)));
const sectionLabel = new Map(MENU.map(([s, l]) => [s, l]));

const html = new Map<string, string>();
for (const p of pages) {
  const depth = depthOf(p.path);
  // Ícones/sprites saem como "/<url de assets>"; aqui viram relativos (a wiki fica em assets/wiki e em dist/wiki).
  const assetsUp = up(depth + 1);
  const page = layout({ title: p.title, body: p.body, depth, section: sectionOf(p.path), ...(p.nav ? { nav: p.nav } : {}) })
    .replace(/url\('\/(?!\/)/g, `url('${assetsUp}`)
    .replace(/ src="\/(?!\/)/g, ` src="${assetsUp}`);
  html.set(p.path, page);
}

const broken: string[] = [];
const pending = new Map<string, number>();
for (const [path, page] of html) {
  const dir = posix.dirname(path);
  for (const mt of page.matchAll(/ href="([^"]+)"/g)) {
    const raw = mt[1]!.replace(/&amp;/g, "&");
    if (/^(?:[a-z]+:|#|\/\/)/i.test(raw)) continue;
    const target = posix.normalize(posix.join(dir, raw.split("#")[0]!.split("?")[0]!));
    if (target.startsWith("../") || !target.endsWith(".html")) continue; // fora da wiki (o jogo) ou arquivo (css)
    if (byPath.has(target)) continue;
    const sec = sectionOf(target);
    if (sec && !sectionsWithPages.has(sec)) pending.set(sec, (pending.get(sec) ?? 0) + 1);
    else broken.push(`${path} → ${target}`);
  }
}

// --- escrita -------------------------------------------------------------------------------------------------------
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
// A marca vai primeiro: uma execução que falhar no meio ainda deixa a pasta apagável pela próxima.
writeFileSync(join(outDir, MARKER), "Pasta gerada por tools/wiki/generate.mts: pode ser apagada e gerada de novo.\n");
let bytes = 0;
const write = (rel: string, data: string | Buffer) => {
  const file = join(outDir, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, data);
  bytes += typeof data === "string" ? Buffer.byteLength(data) : data.length;
};
for (const [path, page] of html) write(path, page);
for (const f of files) write(f.path, f.data);
for (const f of ["wiki.css", "wiki.js"]) cpSync(join(ROOT, "tools", "wiki", f), join(outDir, f));

// Busca: entradas declaradas pela página ou, sem `search`, o título dela com o rótulo da seção.
const search: Required<SearchEntry>[] = [];
for (const p of pages) {
  const entries = p.search ?? [{ title: p.title, kind: sectionLabel.get(sectionOf(p.path)) || "Página", text: "" }];
  for (const e of entries) search.push({ title: e.title, kind: e.kind, href: e.href ?? p.path, text: e.text });
}
const json = JSON.stringify(search);
write("search.json", json);
// O mesmo índice como script: o JS da página carrega com <script> (funciona também abrindo do disco, sem fetch).
write("search.js", `window.WIKI_SEARCH=${json};\n`);

// --- resumo --------------------------------------------------------------------------------------------------------
const kb = (n: number) => `${(n / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} KB`;
for (const [sec, n] of pending) console.warn(`wiki: aviso: ${n} link(s) para "${sec}/", seção ainda sem páginas`);
if (missingImages.size) console.warn(`wiki: aviso: imagens ausentes em assets/: ${[...missingImages].join(", ")}`);
console.log(`wiki: ${pages.length} páginas, ${files.length} imagens, ${search.length} entradas de busca, ${kb(bytes)} em ${relative(ROOT, outDir) || "."} (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
if (broken.length) {
  console.error(`wiki: ${broken.length} link(s) quebrado(s):\n  ${broken.slice(0, 50).join("\n  ")}${broken.length > 50 ? "\n  …" : ""}`);
  process.exit(1);
}

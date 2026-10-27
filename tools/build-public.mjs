// Gera packages/client/.public com apenas o que o jogo usa em produção
// (em vez de publicar a pasta assets/ inteira: músicas, gifs, previews, mapgen...).
// Uso: node tools/build-public.mjs   (o vite.config.ts também chama no `vite build`)
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync, existsSync, readFileSync, readdirSync, rmdirSync, statSync } from "node:fs";
import { dirname, join, basename, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const assets = join(root, "assets");
export const PUBLIC_DIR = join(root, "packages", "client", ".public");
const SFX_SOURCE = join(root, "packages", "client", "src", "game", "sfx.ts");

// Itens de assets/ninja que não são usados pelo jogo.
const NINJA_SKIP = [
  /\.gif$/i,
  /[\/]preview[^\/]*\.png$/i,
  /[\/]Example[^\/]*$/i,
  /[\/]MusicCover\.png$/i,
];

/**
 * Sons que o jogo usa, lidos do próprio `sfx.ts` (caminhos relativos a assets/ninja/Audio, separador "/").
 * O pack tem 138 WAV (15 MB) e o jogo toca ~45 (1 MB): só esses vão para o build. Em vez de importar o módulo
 * (que puxa Phaser/Preact e o store), lemos o fonte com uma regex: cada entrada é `"Jingles/X.wav"` ou
 * `S + "Sounds/.../X.wav"` (o prefixo `S` é a constante "Sounds/").
 */
export function soundFilesFromSource(source = readFileSync(SFX_SOURCE, "utf8")) {
  const prefixMatch = source.match(/^const S = "([^"]+)";/m);
  if (!prefixMatch) throw new Error("build-public: não achei `const S = \"...\"` em sfx.ts");
  const S = prefixMatch[1];
  const files = new Set();
  for (const m of source.matchAll(/(S \+ )?"([^"\n]+\.wav)"/g)) files.add((m[1] ? S : "") + m[2]);
  if (files.size === 0) throw new Error("build-public: nenhum .wav encontrado em sfx.ts");
  return [...files].sort();
}

/** Apaga diretórios que ficaram vazios depois da filtragem (ex.: Audio/Sounds/Animals). */
function pruneEmptyDirs(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) pruneEmptyDirs(p);
  }
  if (readdirSync(dir).length === 0) rmdirSync(dir);
}

export function buildPublic() {
  rmSync(PUBLIC_DIR, { recursive: true, force: true });
  mkdirSync(PUBLIC_DIR, { recursive: true });
  // Wiki do jogo (tools/wiki): gerada dos dados a cada build, para nunca divergir do jogo; vai para /wiki/.
  execFileSync(process.execPath, [join(root, "node_modules", "tsx", "dist", "cli.mjs"), join(root, "tools", "wiki", "generate.mts")], { cwd: root, stdio: "inherit" });

  const copy = (rel, filter) => {
    const src = join(assets, rel);
    if (!existsSync(src)) throw new Error(`build-public: assets/${rel} não existe`);
    cpSync(src, join(PUBLIC_DIR, rel), { recursive: true, filter });
  };

  // Áudio: só os arquivos referenciados em sfx.ts (lista de permissão); diretórios passam para o cpSync descer.
  const audioRoot = join(assets, "ninja", "Audio");
  const sounds = soundFilesFromSource();
  const allowed = new Set(sounds.map((f) => join(audioRoot, f)));
  copy("ninja", (src) => {
    if (NINJA_SKIP.some((re) => re.test(src))) return false;
    if (src !== audioRoot && !src.startsWith(audioRoot + sep)) return true;
    return allowed.has(src) || statSync(src).isDirectory();
  });
  pruneEmptyDirs(join(PUBLIC_DIR, "ninja", "Audio"));
  // Falha o build se um som do sfx.ts não existir no pack (nome errado) — em vez de silêncio no jogo.
  const missing = sounds.filter((f) => !existsSync(join(PUBLIC_DIR, "ninja", "Audio", f)));
  if (missing.length) throw new Error(`build-public: sons de sfx.ts ausentes em assets/ninja/Audio: ${missing.join(", ")}`);

  copy("icons", (src) => !/preview/i.test(basename(src)));
  copy("tiles", (src) => !/preview/i.test(basename(src))); // tileset gerado pelo mapgen (lemon-terrain.png)
  copy("addons", (src) => !/preview/i.test(basename(src)));
  copy("monsters", (src) => !/preview/i.test(basename(src))); // variações recoloridas (tools/monsters/recolor.mjs)
  copy("favicon", (src) => !/preview/i.test(basename(src))); // favicons + manifest.webmanifest
  copy("fx", (src) => !/preview/i.test(basename(src))); // efeitos desenhados em código (tools/fx: portal animado)
  copy("wiki", (src) => basename(src) !== ".wiki-gerada"); // wiki estática gerada acima (tools/wiki/generate.mts)
  // Só o mapa; os previews .png ficam de fora.
  mkdirSync(join(PUBLIC_DIR, "maps"), { recursive: true });
  cpSync(join(assets, "maps", "world.json"), join(PUBLIC_DIR, "maps", "world.json"));
  return PUBLIC_DIR;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log("public curado em", relative(process.cwd(), buildPublic()), `(${soundFilesFromSource().length} sons)`);
}

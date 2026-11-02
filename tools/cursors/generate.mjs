// Gera os cursores do mouse no tema limão (pixel art própria) em packages/client/src/ui/cursors/*.png.
// Cada cursor é desenhado numa grade 16×16 só com o preenchimento; o contorno escuro de 1 px entra sozinho em volta
// (vizinhança de 8), e a imagem final sai ampliada 2× (32×32, o tamanho que todo navegador aceita como cursor).
// O ponto quente (hotspot) fica em cursors.json e é conferido pelo teste do cliente (cursors.test.ts).
// Uso: node tools/cursors/generate.mjs [--preview arquivo.png]   (a prévia mostra todos ampliados 4× sobre xadrez)
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = resolve(ROOT, "packages/client/src/ui/cursors");
const N = 16, SCALE = 2;

const PALETA = {
  k: [42, 26, 8],      // contorno (marrom quase preto, igual ao das sprites)
  Y: [255, 246, 176],  // limão: luz
  y: [246, 214, 56],   // limão
  o: [196, 146, 24],   // limão: sombra
  g: [112, 182, 76],   // folha
  G: [62, 122, 44],    // folha: sombra
  w: [244, 247, 251],  // aço: luz
  s: [168, 179, 196],  // aço
  b: [138, 90, 43],    // madeira / couro
  B: [94, 59, 26],     // madeira: sombra
  r: [224, 74, 54],    // vermelho
  R: [156, 42, 30],    // vermelho: sombra
  p: [255, 251, 230],  // papel / casca clara
  c: [150, 210, 235],  // vidro da lupa
};

// ---- grades (preenchimento; "." = vazio) ----
const G = (rows) => Array.from({ length: N }, (_, i) => (rows[i] ?? "").padEnd(N, ".").slice(0, N).split(""));
const vazio = () => Array.from({ length: N }, () => Array(N).fill("."));
const put = (g, x, y, c) => { if (x >= 0 && y >= 0 && x < N && y < N) g[y][x] = c; };

const padrao = G([
  "",
  ".Y",
  ".YY",
  ".YYy",
  ".Yyyy",
  ".Yyyyy",
  ".Yyyyyy",
  ".Yyyyyyy",
  ".Yyyyyyyy",
  ".Yyyyyooo...gg",
  ".Yyoyyo....gGG",
  ".Yo.oyyo...G",
  ".o...yyo",
  "......yyo",
  "......oo",
]);

const mao = G([
  "",
  ".....Y",
  ".....Yy",
  ".....Yy",
  ".....Yy",
  ".....YyYy",
  ".....YyYyYy",
  ".YY..YyYyYyYy",
  ".Yyy.Yyyyyyyyo",
  "..Yyyyyyyyyyyo",
  "...Yyyyyyyyyyo",
  "...yyyyyyyyyo",
  "....yyyyyyyyo",
  "....oooooooo",
]);

const pegar = G([
  "",
  "....Yy.Yy.Yy",
  "....Yy.Yy.Yy",
  "....Yy.Yy.Yy",
  "....Yy.Yy.Yy",
  "....Yy.Yy.Yy",
  ".YY.YyyYyyYy",
  ".Yyy.yyyyyyyy",
  "..Yyyyyyyyyyo",
  "...Yyyyyyyyyo",
  "...Yyyyyyyyyo",
  "....yyyyyyyo",
  "....yyyyyyyo",
  ".....oooooo",
]);

const segurar = G([
  "",
  "",
  "",
  "",
  "",
  "....Yy.Yy.Yy",
  ".YY.YyyYyyYy",
  ".Yyy.yyyyyyyy",
  "..Yyyyyyyyyyo",
  "...Yyyyyyyyyo",
  "...Yyyyyyyyyo",
  "....yyyyyyyo",
  "....yyyyyyyo",
  ".....oooooo",
]);

function espada() {
  const g = vazio();
  for (let i = 1; i <= 9; i++) { put(g, i, i, "w"); put(g, i + 1, i, "s"); }
  // guarda atravessada no fim da lâmina, cabo de couro e pomo de limão
  for (let d = -3; d <= 3; d++) put(g, 10 + d, 10 - d, Math.abs(d) === 3 ? "o" : "y");
  put(g, 11, 11, "b"); put(g, 12, 12, "b"); put(g, 12, 11, "B");
  put(g, 13, 13, "y"); put(g, 14, 13, "o"); put(g, 13, 14, "o"); put(g, 14, 14, "o");
  return g;
}

const falar = G([
  "",
  ".Y",
  ".YY",
  "..Yyyyyyyyyyy",
  "..YYyyyyyyyyyyo",
  "...yyyyyyyyyyyo",
  "...yykyykyykyyo",
  "...yyyyyyyyyyyo",
  "...yyyyyyyyyyyo",
  "...oooooooooooo",
]);

function lupa() {
  const g = vazio();
  const cx = 6, cy = 6;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const d = Math.hypot(x - cx, y - cy);
    if (d <= 3.2) put(g, x, y, "c");
    else if (d <= 4.6) put(g, x, y, x + y < cx + cy ? "Y" : "y");
  }
  put(g, 5, 4, "p"); put(g, 4, 5, "p");               // brilho do vidro
  for (let i = 0; i < 4; i++) { put(g, 10 + i, 10 + i, "b"); put(g, 11 + i, 10 + i, "B"); put(g, 10 + i, 11 + i, "B"); }
  return g;
}

function ajuda() {
  const g = G([
    "",
    ".Y",
    ".YY",
    ".Yyy",
    ".Yyyy",
    ".Yyyyy",
    ".Yyyyyy",
    ".Yyyyoo",
    ".Yo.yo",
    ".o..yo",
  ]);
  // "?" num balão de folha
  const ponto = [
    "..pppp.",
    ".pp..pp",
    ".....pp",
    "....pp.",
    "...pp..",
    "...pp..",
    ".......",
    "...pp..",
  ];
  for (let y = 7; y <= 14; y++) for (let x = 8; x <= 14; x++) put(g, x, y, "G");
  ponto.forEach((r, j) => r.split("").forEach((c, i) => { if (c === "p") put(g, 8 + i, 7 + j, "p"); }));
  return g;
}

function proibido() {
  const g = vazio();
  const c = 7.5;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const d = Math.hypot(x - c, y - c);
    if (d <= 6.6 && d > 4.9) put(g, x, y, "r");
    else if (d <= 4.9) put(g, x, y, "p");
  }
  // gomos do limão por dentro e a barra vermelha cortando
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const d = Math.hypot(x - c, y - c);
    if (d <= 4.1 && d > 0.8 && g[y][x] === "p" && ((x + y) % 3 !== 0)) put(g, x, y, "y");
  }
  for (let i = 3; i <= 12; i++) { put(g, i, i, "r"); put(g, i + 1, i, "R"); put(g, i, i + 1, "r"); }
  return g;
}

function mira() {
  const g = vazio();
  const c = 7;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const d = Math.hypot(x - c, y - c);
    if (d <= 5.4 && d > 4.2) put(g, x, y, "y");
  }
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let k = 2; k <= 6; k++) if (k !== 5) put(g, c + dx * k, c + dy * k, "Y");
  put(g, c, c, "r");
  return g;
}

const redimensionar = G([
  "",
  ".......Y",
  "......YYy",
  ".....YYyyy",
  "....Yyyyyyo",
  ".......y",
  ".......y",
  ".......y",
  ".......y",
  ".......y",
  "....Yyyyyyo",
  ".....yyyyo",
  "......yyo",
  ".......o",
]);

const texto = G([
  "",
  ".....YY.yy",
  ".......y",
  ".......y",
  ".......y",
  ".......y",
  ".......y",
  ".......y",
  ".......y",
  ".......y",
  ".......y",
  ".......y",
  ".......y",
  ".....yy.oo",
]);

// nome do arquivo → grade, hotspot (na grade 16×16) e palavra-chave de reserva do CSS
export const CURSORES = {
  padrao: { grade: padrao, hot: [1, 1], reserva: "default" },
  mao: { grade: mao, hot: [5, 1], reserva: "pointer" },
  ataque: { grade: espada(), hot: [1, 1], reserva: "pointer" },
  falar: { grade: falar, hot: [1, 1], reserva: "pointer" },
  pegar: { grade: pegar, hot: [7, 6], reserva: "grab" },
  segurar: { grade: segurar, hot: [7, 8], reserva: "grabbing" },
  olhar: { grade: lupa(), hot: [6, 6], reserva: "help" },
  ajuda: { grade: ajuda(), hot: [1, 1], reserva: "help" },
  proibido: { grade: proibido(), hot: [7, 7], reserva: "not-allowed" },
  mira: { grade: mira(), hot: [7, 7], reserva: "crosshair" },
  redimensionar: { grade: redimensionar, hot: [7, 7], reserva: "ns-resize" },
  texto: { grade: texto, hot: [7, 7], reserva: "text" },
};

/** Preenchimento + contorno de 1 px nos vazios vizinhos (8 direções). */
function comContorno(grade) {
  const g = grade.map((r) => r.slice());
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (grade[y][x] !== ".") continue;
    let perto = false;
    for (let dy = -1; dy <= 1 && !perto; dy++) for (let dx = -1; dx <= 1; dx++) {
      const v = grade[y + dy]?.[x + dx];
      if (v && v !== ".") { perto = true; break; }
    }
    if (perto) g[y][x] = "k";
  }
  return g;
}

function pintar(png, grade, ox, oy, escala) {
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const ch = grade[y][x];
    if (ch === ".") continue;
    const cor = PALETA[ch];
    if (!cor) throw new Error(`cor desconhecida: ${ch}`);
    for (let j = 0; j < escala; j++) for (let i = 0; i < escala; i++) {
      const p = ((oy + y * escala + j) * png.width + ox + x * escala + i) * 4;
      png.data[p] = cor[0]; png.data[p + 1] = cor[1]; png.data[p + 2] = cor[2]; png.data[p + 3] = 255;
    }
  }
}

/** Variáveis --cur-<nome> e as regras de base (página, campos de texto, canvas do mundo por data-cursor). */
function css(meta) {
  const vars = Object.entries(meta)
    .map(([nome, m]) => `  --cur-${nome}: url("./${nome}.png") ${m.x} ${m.y}, ${m.reserva};`).join("\n");
  const canvas = Object.keys(meta).filter((n) => n !== "padrao")
    .map((n) => `#game canvas[data-cursor="${n}"] { cursor: var(--cur-${n}); }`).join("\n");
  return `/* GERADO por tools/cursors/generate.mjs: não edite à mão (rode o script). */
/* Cursores do tema limão. No resto do CSS use sempre cursor: var(--cur-<nome>) (cursors.test.ts confere). */
:root {
${vars}
}

html, body { cursor: var(--cur-padrao); }
a[href], summary, select, label[for] { cursor: var(--cur-mao); }
input:not([type]), input[type="text"], input[type="password"], input[type="search"], input[type="number"],
input[type="email"], textarea, [contenteditable="true"] { cursor: var(--cur-texto); }
input:disabled, textarea:disabled, select:disabled { cursor: var(--cur-proibido); }

/* Canvas do mundo: o WorldScene escreve data-cursor conforme o que está sob o mouse (game/cursor.ts). */
#game canvas { cursor: var(--cur-padrao); }
${canvas}
`;
}

function main() {
  mkdirSync(OUT, { recursive: true });
  const meta = {};
  const nomes = Object.keys(CURSORES);
  const finais = {};
  for (const nome of nomes) {
    const { grade, hot, reserva } = CURSORES[nome];
    const g = comContorno(grade);
    finais[nome] = g;
    const png = new PNG({ width: N * SCALE, height: N * SCALE });
    pintar(png, g, 0, 0, SCALE);
    writeFileSync(resolve(OUT, `${nome}.png`), PNG.sync.write(png));
    // hotspot no meio do pixel da grade, já na escala final
    meta[nome] = { x: hot[0] * SCALE + (SCALE >> 1), y: hot[1] * SCALE + (SCALE >> 1), reserva };
  }
  writeFileSync(resolve(OUT, "cursors.json"), JSON.stringify(meta, null, 2) + "\n");
  writeFileSync(resolve(OUT, "cursors.css"), css(meta));

  const i = process.argv.indexOf("--preview");
  if (i > 0) {
    const E = 4, cel = N * E + 8, cols = 6, linhas = Math.ceil(nomes.length / cols);
    const png = new PNG({ width: cols * cel, height: linhas * cel });
    for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) {
      const p = (y * png.width + x) * 4, v = ((x >> 3) + (y >> 3)) % 2 ? 90 : 60;
      png.data[p] = v; png.data[p + 1] = v + 10; png.data[p + 2] = v + 30; png.data[p + 3] = 255;
    }
    nomes.forEach((nome, k) => {
      const ox = (k % cols) * cel + 4, oy = Math.floor(k / cols) * cel + 4;
      pintar(png, finais[nome], ox, oy, E);
      const { hot } = CURSORES[nome];   // marca o hotspot com um pixel ciano
      const p = ((oy + hot[1] * E + 1) * png.width + ox + hot[0] * E + 1) * 4;
      png.data[p] = 0; png.data[p + 1] = 255; png.data[p + 2] = 255;
    });
    writeFileSync(resolve(process.argv[i + 1]), PNG.sync.write(png));
  }
  console.log(`${nomes.length} cursores em ${OUT}`);
}

main();

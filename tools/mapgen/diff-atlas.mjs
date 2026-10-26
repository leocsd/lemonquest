// Prova de "nenhum id antigo do atlas mudou": compara o TilesetLemon publicado (assets/tiles/lemon-terrain.png) com o novo.
// uso: node tools/mapgen/diff-atlas.mjs <lemon-antigo.png> [novo.png]
// O atlas só cresce no fim (LemonSet.add: id = used++), então todo tile do PNG antigo tem de sair idêntico, pixel a pixel,
// no mesmo lugar do PNG novo. Exceção: as casas vazias DEPOIS do último tile desenhado do PNG antigo (o fim da última
// linha, ainda sem id alocado) podem ganhar tile novo. Sai com código 1 se algum tile antigo mudou, se a largura mudou
// ou se o PNG encolheu.
import fs from 'node:fs';
import { PNG } from 'pngjs';

const [oldPath, newPath = 'assets/tiles/lemon-terrain.png'] = process.argv.slice(2);
if (!oldPath) { console.error('uso: node tools/mapgen/diff-atlas.mjs <lemon-antigo.png> [novo.png]'); process.exit(2); }
const a = PNG.sync.read(fs.readFileSync(oldPath)), b = PNG.sync.read(fs.readFileSync(newPath));
const T = 16, cols = a.width / T, rowsA = a.height / T, rowsB = b.height / T;
const tileOf = (png, id) => {
  const tx = (id % cols) * T, ty = Math.floor(id / cols) * T, out = Buffer.alloc(T * T * 4);
  for (let y = 0; y < T; y++) png.data.copy(out, y * T * 4, ((ty + y) * png.width + tx) * 4, ((ty + y) * png.width + tx + T) * 4);
  return out;
};
const empty = (buf) => { for (let k = 3; k < buf.length; k += 4) if (buf[k]) return false; return true; };

const problems = [];
if (b.width !== a.width) problems.push(`largura mudou: ${a.width} -> ${b.width}`);
if (b.height < a.height) problems.push(`o atlas encolheu: ${a.height} -> ${b.height} px`);
let lastDrawn = -1;
for (let id = 0; id < cols * rowsA; id++) if (!empty(tileOf(a, id))) lastDrawn = id;
let same = 0, changed = 0, newTiles = 0;
const samples = [];
if (!problems.length) {
  for (let id = 0; id <= lastDrawn; id++) {
    if (tileOf(a, id).equals(tileOf(b, id))) { same++; continue; }
    changed++;
    if (samples.length < 8) samples.push(`id ${id} (col ${id % cols}, linha ${Math.floor(id / cols)})`);
  }
  // casas livres no fim da última linha antiga e as linhas novas
  for (let id = lastDrawn + 1; id < cols * rowsB; id++) if (!empty(tileOf(b, id))) newTiles++;
}
console.log(`tiles antigos idênticos: ${same}/${lastDrawn + 1}; tiles antigos alterados: ${changed}; tiles novos: ${newTiles}; linhas ${rowsA} -> ${rowsB} (${a.width}x${a.height} -> ${b.width}x${b.height})`);
for (const s of samples) console.log('  alterado: ' + s);
for (const p of problems) console.log('  ' + p);
process.exit(problems.length || changed ? 1 : 0);

// Prova de "0 tiles alterados": compara um world.json antigo com o novo (padrão: assets/maps/world.json).
// uso: node tools/mapgen/diff-world.mjs <antigo.json> [novo.json]
// Confere, no retângulo do mapa antigo, as 4 camadas tile a tile; os objetos antigos por índice (JSON idêntico); e
// nome + firstgid de cada tileset antigo. O mapa pode crescer (W/H maiores, objetos a mais, tilecount do TilesetLemon
// maior): isso não é erro. Sai com código 1 se algum tile antigo mudou, algum objeto antigo mudou de lugar/conteúdo,
// algum tileset antigo mudou de gid, ou o mapa encolheu.
import fs from 'node:fs';

const [oldPath, newPath = 'assets/maps/world.json'] = process.argv.slice(2);
if (!oldPath) { console.error('uso: node tools/mapgen/diff-world.mjs <antigo.json> [novo.json]'); process.exit(2); }
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const a = read(oldPath), b = read(newPath);

const layer = (m, name) => m.layers.find((l) => l.type === 'tilelayer' && l.name === name);
const objects = (m) => m.layers.find((l) => l.type === 'objectgroup' && l.name === 'objects')?.objects ?? [];

let tiles = 0;
const samples = [];
for (const name of ['ground', 'deco', 'above', 'collision']) {
  const la = layer(a, name), lb = layer(b, name);
  if (!la || !lb) { console.error(`camada ${name} ausente em ${!la ? oldPath : newPath}`); process.exit(1); }
  for (let y = 0; y < a.height; y++) for (let x = 0; x < a.width; x++) {
    const ga = la.data[y * a.width + x], gb = y < b.height && x < b.width ? lb.data[y * b.width + x] : undefined;
    if (ga !== gb) { tiles++; if (samples.length < 5) samples.push(`${name} ${x},${y}: ${ga} -> ${gb}`); }
  }
}
const oa = objects(a), ob = objects(b);
let same = 0;
const objSamples = [];
for (let i = 0; i < oa.length; i++) {
  if (JSON.stringify(oa[i]) === JSON.stringify(ob[i])) same++;
  else if (objSamples.length < 5) objSamples.push(`#${i} ${oa[i].type}/${oa[i].name} @${oa[i].x / 16},${oa[i].y / 16} -> ${ob[i] ? `${ob[i].type}/${ob[i].name} @${ob[i].x / 16},${ob[i].y / 16}` : 'ausente'}`);
}
let tilesets = true;
const tsNotes = [];
for (const ta of a.tilesets) {
  const tb = b.tilesets.find((t) => t.name === ta.name);
  if (!tb || tb.firstgid !== ta.firstgid) { tilesets = false; tsNotes.push(`${ta.name}@${ta.firstgid} -> ${tb ? '@' + tb.firstgid : 'ausente'}`); }
  else if (tb.tilecount !== ta.tilecount) tsNotes.push(`${ta.name}: tilecount ${ta.tilecount} -> ${tb.tilecount} (ok, só cresceu)`);
}
const shrank = b.width < a.width || b.height < a.height;

console.log(`tiles alterados: ${tiles}; objetos antigos idênticos: ${same}/${oa.length}; objetos novos: ${ob.length - oa.length}; tilesets estáveis: ${tilesets}; ${a.width}x${a.height} -> ${b.width}x${b.height}`);
for (const s of samples) console.log('  tile: ' + s);
for (const s of objSamples) console.log('  objeto: ' + s);
for (const s of tsNotes) console.log('  tileset: ' + s);
if (shrank) console.log('  mapa encolheu');
process.exit(tiles > 0 || same < oa.length || !tilesets || shrank ? 1 : 0);

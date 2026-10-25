// Gera variações de monstros do pack Ninja Adventure trocando a paleta cor por cor (assets/monsters/<Nome>.png e um
// <Nome>-preview.png 8×). A tinta do Phaser multiplica a cor: num sprite verde ela nunca chega a azul-gelo; a troca de
// paleta mantém o sombreado do pack (contorno #141b1b intacto). Uso: node tools/monsters/recolor.mjs
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const ASSETS = fileURLToPath(new URL("../../assets/", import.meta.url));
const OUT = `${ASSETS}monsters/`;

/** Variações: sprite de origem (em assets/) e troca de cores (hex de origem → hex novo). Cor fora do mapa fica igual. */
const VARIANTS = {
  // Dragão de Gelo (Ninho dos Dragões de Gelo): o dragão verde em azul-gelo, barriga e chifres brancos com reflexo frio.
  FrostDragon: {
    src: "ninja/Actor/Monster/Dragon/SpriteSheet.png",
    map: { adbc3a: "86c4ec", "74a334": "4f8ccc", "56864c": "2c4f8e", ffffff: "f4fdff" },
  },
};

const rgb = (h) => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];

mkdirSync(OUT, { recursive: true });
for (const [name, v] of Object.entries(VARIANTS)) {
  const png = PNG.sync.read(readFileSync(ASSETS + v.src));
  const map = new Map(Object.entries(v.map).map(([a, b]) => [a.toLowerCase(), rgb(b)]));
  const d = png.data;
  let swapped = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const key = ((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]).toString(16).padStart(6, "0");
    const to = map.get(key);
    if (to) { [d[i], d[i + 1], d[i + 2]] = to; swapped++; }
  }
  if (!swapped) throw new Error(`${name}: nenhuma cor do mapa encontrada em ${v.src}`);
  writeFileSync(`${OUT}${name}.png`, PNG.sync.write(png));

  // Prévia 8× sobre xadrez (conferir sem abrir o jogo).
  const K = 8, pv = new PNG({ width: png.width * K, height: png.height * K });
  for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) {
    const i = (y * png.width + x) * 4, bg = (x + y) & 1 ? 60 : 80;
    for (let dy = 0; dy < K; dy++) for (let dx = 0; dx < K; dx++) {
      const j = ((y * K + dy) * pv.width + x * K + dx) * 4;
      const a = d[i + 3];
      pv.data[j] = a ? d[i] : bg; pv.data[j + 1] = a ? d[i + 1] : bg; pv.data[j + 2] = a ? d[i + 2] : bg; pv.data[j + 3] = 255;
    }
  }
  writeFileSync(`${OUT}${name}-preview.png`, PNG.sync.write(pv));
  console.log(`${name}: ${swapped} pixels trocados → assets/monsters/${name}.png`);
}

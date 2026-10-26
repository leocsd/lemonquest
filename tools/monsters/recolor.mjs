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
  // Siderúrgica (ciclo 19): gusa incandescente, aço líquido branco-amarelo, escória com olhos em brasa, convertedor de aço.
  GusaSlime: {
    src: "ninja/Actor/Monster/Slime4/Slime4.png",
    map: { adbc3a: "e66a3a", "74a334": "d14b34", "56864c": "8a1c24", f2eaf1: "ffe9a0", e0394c: "ffad5d" },
  },
  SteelSlime: {
    src: "ninja/Actor/Monster/Slime3/Slime3.png",
    map: { "79b8ce": "ffe9a0", "548789": "ffad5d", "4a5270": "e66a3a", f2eaf1: "ffffff" },
  },
  SlagGolem: {
    src: "ninja/Actor/Character/Statue/SpriteSheet.png",
    map: { "5f7160": "5d4a42", "4e484a": "3a2e2c", fce2ca: "ffad5d" },
  },
  ConverterGolem: {
    src: "ninja/Actor/Boss/GiantBamboo/Walk.png",
    map: { adbc3a: "c3ccd2", "74a334": "93a0aa", "56864c": "66737d", "5f7160": "454f57", "4e484a": "2a2629", "8f3e56": "e66a3a", e0394c: "ffe9a0" },
  },
  // Montadora (ciclo 20): lagarto amarelo-faísca, robô pintor amarelo-limão com visor azul, robô montador laranja de
  // máquina, a gosma gigante em tinta quente (olho claro sobre o laranja) e o samurai gigante em limão e cromo (o branco
  // e o azul do visor ficam). As origens dos robôs e do samurai já aparecem no jogo; por isso só entram recoloridas.
  MtSparkLizard: {
    src: "ninja/Actor/Monster/Reptile/Reptile.png",
    map: { "79b8ce": "f2b632", "548789": "c06a1e", "4e484a": "6e3418", fce2ca: "fff3b0" },
  },
  MtRobotPainter: {
    src: "ninja/Actor/Character/RobotGreen/SpriteSheet.png",
    map: { "56864c": "d8b62a", a8a129: "f2e14a", "345a52": "8a6e1e", e0394c: "4a9df0" },
  },
  MtRobotAssembler: {
    src: "ninja/Actor/Character/RobotGrey/SpriteSheet.png",
    map: { "8d977f": "d07a28", "5f7160": "9a5420", f2eaf1: "ffc070", e0394c: "7fe8ff" },
  },
  MtPaintBlob: {
    src: "ninja/Actor/Boss/GiantSlime2/Idle.png",
    map: { adbc3a: "f2b632", "74a334": "e66a3a", "56864c": "a8441e", "8f3e56": "8a1c24", e0394c: "fff3b0" },
  },
  MtPrototype: {
    src: "ninja/Actor/Boss/GiantRedSamurai/Walk.png",
    map: { e0394c: "f2e14a", "8f3e56": "b8962a", "3b3643": "6e7a88", f1c471: "dfe6ee", ef914f: "f8ec6a", e46d3a: "e6c23e", d14b34: "a8861e" },
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

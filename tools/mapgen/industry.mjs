// Arte de chão de fábrica (`L.industry()`) e da Siderúrgica (`L.steel()`), ciclo 19 (tools/mapgen/expansion6.mjs).
//
// ALOCAÇÃO ADIADA, no molde de `L.rail()` (createRail em lemon.mjs): nada daqui entra no atlas até a primeira chamada de
// `L.industry()`/`L.steel()`, e só a expansion6 (a última etapa do gerador) chama. Como o TilesetLemon acrescenta tile no
// fim (`LemonSet.add`), todo tile Lemon antigo mantém o id e os gids do mapa publicado não mudam (prova: diff-world e
// diff-atlas). `L.industry()` é a base comum (concreto, chapa xadrez, faixa zebrada, asfalto, esteira, canos, paredes,
// cerca de tela, portões) e volta na Montadora (ciclo 20); `L.steel()` é o equipamento da usina.
//
// Chaves com prefixo `ind_`/`aco_`. Peças por máscara de vizinhos e folhas grandes são chaveadas pelo hash do conteúdo
// (`contentKey`): tiles iguais saem uma vez só. Estilo do pack: 16×16, contorno #141b1b. Os canos são copiados pixel a
// pixel de Pipes.png (família cinza, colunas 5–9), que NÃO vira tileset (TILESET_FILES fica igual).
//
// Importa `Cv` de lemon.mjs, que importa este arquivo: o ciclo é seguro porque nada aqui usa `Cv` fora de função.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';
import { TILESET_DIR, mulberry32 } from './lib.mjs';
import { Cv } from './lemon.mjs';

const OL = '#141b1b';
/** Paleta: aço, concreto, asfalto, borracha, tijolo, fogo e amarelo de segurança (plano: §5.2 da especificação). */
const IP = {
  st0: '#c3ccd2', st1: '#93a0aa', st2: '#66737d', st3: '#454f57', st4: '#2e353b',
  co0: '#cdc8bb', co1: '#bdb7aa', co2: '#aca699', co3: '#8d877b', co4: '#6b665c',
  as0: '#5e5f65', as1: '#505157', as2: '#43444a', as3: '#35363b',
  rub0: '#55555e', rub1: '#3c3c44', rub2: '#2b2b31',
  ck0: '#a9b2b8', ck1: '#8e989f', ck2: '#879198', ck3: '#78828a',
  yel: '#e6c23e', yel2: '#b8962a', blk: '#25282c',
  fire1: '#e66a3a', fire2: '#ffad5d', fire3: '#ffe9a0', red: '#d14b34', red2: '#8a1c24',
  rust0: '#c06a43', rust1: '#9c4a2e', rust2: '#6e3220',
  br0: '#b8613f', br1: '#9a4a31', br2: '#6a3123',
  white: '#f2eaf1',
};
const STEEL = [IP.st0, IP.st1, IP.st2, IP.st3];
const DSTEEL = ['#8d99a2', IP.st2, IP.st3, IP.st4];
const WSTEEL = ['#e4e8ea', IP.st0, IP.st1, IP.st2];

function hashf(x, y, s = 0) { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
const contentKey = (pfx, cv) => pfx + ':' + createHash('md5').update(cv.d).digest('hex').slice(0, 16);
const shade4 = (t, pal) => (t < 0.18 ? pal[0] : t < 0.5 ? pal[1] : t < 0.82 ? pal[2] : pal[3]);
/** cilindro em pé (sombra da esquerda para a direita) / deitado (de cima para baixo) */
const cylV = (cv, x0, x1, y0, y1, pal) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) cv.set(x, y, shade4((x - x0) / Math.max(1, x1 - x0), pal)); };
const cylH = (cv, x0, x1, y0, y1, pal) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) cv.set(x, y, shade4((y - y0) / Math.max(1, y1 - y0), pal)); };
const anyPixel = (cv) => { for (let k = 3; k < cv.d.length; k += 4) if (cv.d[k]) return true; return false; };
/** sombra de 1 px no chão embaixo de tudo que é sólido (peças soltas) */
const dropShadow = (cv) => { for (let y = cv.h - 2; y >= 0; y--) for (let x = 0; x < cv.w; x++) if (cv.solid(x, y) && !cv.solid(x, y + 1)) cv.over(x, y + 1, OL, 70); };

/** Folha chaveada por conteúdo: linhas de gids (0 = tile vazio), de cima para baixo. */
function sheetC(L, pfx, cv, wt, ht, props) {
  const rows = [];
  for (let j = 0; j < ht; j++) {
    const row = [];
    for (let i = 0; i < wt; i++) { const sl = cv.slice(i, j); row.push(anyPixel(sl) ? L.tile(contentKey(pfx, sl), sl, props) : 0); }
    rows.push(row);
  }
  return rows;
}
const memo = (fn) => { const m = new Map(); return (...a) => { const k = JSON.stringify(a); if (!m.has(k)) m.set(k, fn(...a)); return m.get(k); }; };

// ===================================================================== chão
const ellOver = (cv, cx, cy, rx, ry, c, a) => { for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1) cv.over(x, y, c, a); };
function concreteCv(v) {
  // v: bit 1 = junta à direita, bit 2 = junta embaixo (placas de 4×4 tiles), bit 4 = mancha de óleo
  const cv = new Cv(), s = v & 3;
  for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
    const h = hashf(i >> 2, j >> 2, 611 + s), h2 = hashf(i, j, 677 + s);
    let c = h < 0.22 ? '#c3bdb0' : h < 0.84 ? IP.co1 : '#b5afa2';
    if (h2 < 0.03) c = '#a29c8f'; else if (h2 > 0.985) c = IP.co0;
    if ((v & 1) && i === 15) c = '#a09a8d';
    if ((v & 2) && j === 15) c = '#a09a8d';
    cv.set(i, j, c);
  }
  if (v & 4) { ellOver(cv, 7, 8, 5.2, 3.4, '#4a463f', 55); ellOver(cv, 6.5, 7.5, 3, 2, '#3a3733', 45); cv.over(10, 6, '#3a3733', 70); }
  return cv;
}
function checkerCv(v) {
  const cv = new Cv(), s = v & 3;
  for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
    const li = i & 3, lj = j & 3, o = ((i >> 2) + (j >> 2)) & 1;
    let c = hashf(i >> 3, j >> 3, 731 + s) < 0.25 ? IP.ck2 : IP.ck1;
    const lens = o ? li === lj && li < 3 : li + lj === 2 && li < 3;
    const shd = o ? li === lj + 1 && lj < 3 : li + lj === 3 && li > 0;
    if (lens) c = IP.ck0; else if (shd) c = IP.ck3;
    if ((v & 1) && i === 15) c = IP.st3;
    if ((v & 2) && j === 15) c = IP.st3;
    cv.set(i, j, c);
  }
  return cv;
}
/** faixa zebrada sobre chapa: 'h' (faixa deitada), 'v' (em pé), 'x' (cruzamento) */
function stripeCv(dir) {
  const cv = checkerCv(0);
  const band = (a) => a >= 5 && a <= 10;
  for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
    const on = (dir !== 'v' && band(j)) || (dir !== 'h' && band(i));
    if (!on) continue;
    cv.set(i, j, ((i + j) >> 2) & 1 ? IP.blk : IP.yel);
  }
  if (dir !== 'v') for (let i = 0; i < 16; i++) if (!(dir === 'x' && band(i))) { cv.set(i, 4, IP.st3); cv.set(i, 11, IP.st3); }
  if (dir !== 'h') for (let j = 0; j < 16; j++) if (!(dir === 'x' && band(j))) { cv.set(4, j, IP.st3); cv.set(11, j, IP.st3); }
  return cv;
}
/** asfalto: e = {n,e,s,w} lado com meio-fio; line = 'h' | 'v' | null (faixa tracejada no meio do tile) */
function asphaltCv(e, line, v) {
  const cv = new Cv();
  for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
    const h = hashf(i, j, 820 + v), h2 = hashf(i >> 1, j >> 1, 850 + v);
    let c = h2 < 0.25 ? IP.as2 : IP.as1;
    if (h < 0.08) c = IP.as0; else if (h > 0.96) c = IP.as3; else if (h > 0.94) c = '#76777c';
    cv.set(i, j, c);
  }
  if (line === 'h') for (let i = 0; i < 10; i++) { cv.set(i + 3, 7, '#ece8dc'); cv.set(i + 3, 8, '#d8d3c6'); }
  if (line === 'v') for (let j = 0; j < 10; j++) { cv.set(7, j + 3, '#ece8dc'); cv.set(8, j + 3, '#d8d3c6'); }
  const curb = (x, y, inner) => cv.set(x, y, inner ? '#76716a' : '#c9c3b5');
  for (let k = 0; k < 16; k++) {
    if (e.n) { curb(k, 0, false); curb(k, 1, true); }
    if (e.s) { curb(k, 15, false); curb(k, 14, true); }
    if (e.w) { curb(0, k, false); curb(1, k, true); }
    if (e.e) { curb(15, k, false); curb(14, k, true); }
  }
  return cv;
}
/** esteira transportadora: dir 'h' | 'v' (sentido das nervuras), f = {n,e,s,w} lado com estrutura (sem esteira vizinha) */
function beltCv(dir, f) {
  const cv = new Cv();
  for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
    const along = dir === 'h' ? i : j, across = dir === 'h' ? j : i;
    const rib = (((along - Math.round(Math.abs(across - 7.5) * 0.6)) % 4) + 4) % 4 === 0;
    cv.set(i, j, rib ? IP.rub0 : hashf(i, j, 901) < 0.06 ? IP.rub2 : IP.rub1);
  }
  const frame = (side) => {
    for (let k = 0; k < 16; k++) {
      const px = (a, c) => { if (side === 'n') cv.set(k, a, c); else if (side === 's') cv.set(k, 15 - a, c); else if (side === 'w') cv.set(a, k, c); else cv.set(15 - a, k, c); };
      px(0, OL); px(1, k % 4 === 1 ? IP.st0 : IP.st1); px(2, IP.st2); px(3, IP.rub2);
    }
  };
  for (const s of ['n', 'e', 's', 'w']) if (f[s]) frame(s);
  return cv;
}

// ===================================================================== paredes, cercas e portões
/** parede de 1 tile vista de cima com a face para o sul: m = vizinhos que são parede; face = vizinho de baixo não é parede */
const WALLS = {
  metal: {
    capH: 5, rim: '#a7b2b9', rimDk: '#3a434a',
    cap: (i, j) => ((i & 3) === 1 && (j & 3) === 2 ? '#47515a' : '#5d6870'),
    face: (i, j, h) => (j === h - 1 || j === h - 2 ? (j === h - 1 ? '#3a434a' : IP.st3) : j === 0 ? '#3a434a' : ['#b4bec5', '#9aa6ae', '#7f8c95', '#6a7780'][i & 3]),
  },
  concrete: {
    capH: 4, rim: '#e6e1d4', rimDk: '#8d877b',
    cap: (i, j) => (hashf(i, j, 951) < 0.08 ? '#bfb9ab' : '#d3cdbf'),
    face: (i, j, h) => {
      if (j === 0) return '#8d877b';
      if (j === h - 1) return '#5f5a51';
      const course = Math.floor((j - 1) / 4), off = course & 1 ? 4 : 0;
      if ((j - 1) % 4 === 3) return '#958d7e';
      if ((i + off) % 8 === 7) return '#958d7e';
      return hashf(i >> 1, j, 960) < 0.15 ? '#aba393' : '#b9b1a1';
    },
  },
};
function wallCv(style, m) {
  const S = WALLS[style], cv = new Cv(), face = !m.s, capH = face ? S.capH : 16;
  for (let j = 0; j < capH; j++) for (let i = 0; i < 16; i++) cv.set(i, j, S.cap(i, j));
  if (!m.n) for (let i = 0; i < 16; i++) { cv.set(i, 0, OL); cv.set(i, 1, S.rim); }
  for (let j = m.n ? 0 : 1; j < capH; j++) { if (!m.w) { cv.set(0, j, OL); cv.set(1, j, S.rim); } if (!m.e) { cv.set(15, j, OL); cv.set(14, j, S.rimDk); } }
  if (face) {
    const h = 16 - capH;
    for (let j = 0; j < h; j++) for (let i = 0; i < 16; i++) cv.set(i, capH + j, S.face(i, j, h));
    for (let j = capH; j < 16; j++) { if (!m.w) cv.set(0, j, OL); if (!m.e) cv.set(15, j, OL); }
  }
  return cv;
}
/** cerca de tela (alambrado), fundo transparente: m = vizinhos que são cerca */
function fenceCv(m) {
  const cv = new Cv();
  const mesh = (x, y) => cv.set(x, y, '#b7c0c6', 150);
  const horiz = m.e || m.w || !(m.n || m.s);
  if (horiz) {
    const x0 = m.w ? 0 : 7, x1 = m.e ? 15 : 8;
    for (let x = x0; x <= x1; x++) {
      for (let y = 4; y <= 13; y++) if (((x + y) & 3) === 0 || (((x - y) % 4) + 4) % 4 === 0) mesh(x, y);
      cv.set(x, 2, OL); cv.set(x, 3, IP.st1); cv.set(x, 14, IP.st2); cv.set(x, 15, OL, 60);
    }
  }
  if (m.n || m.s) {
    const y0 = m.n ? 0 : 6, y1 = m.s ? 15 : 13;
    for (let y = y0; y <= y1; y++) { mesh(7, y); if ((y & 1) === 0) mesh(8, y); cv.set(9, y, OL, 50); }
  }
  // poste no meio do tile
  for (let y = 1; y <= 14; y++) { cv.set(7, y, IP.st1); cv.set(8, y, IP.st2); }
  cv.set(7, 0, OL); cv.set(8, 0, OL); cv.set(6, 1, OL); cv.set(9, 1, OL); cv.set(6, 14, OL, 120); cv.set(9, 14, OL, 120); cv.set(7, 15, OL, 90); cv.set(8, 15, OL, 90);
  return cv;
}
/** corrimão amarelo de segurança (sem tela), fundo transparente: m = vizinhos que são corrimão */
function railingCv(m) {
  const cv = new Cv();
  const horiz = m.e || m.w || !(m.n || m.s);
  if (horiz) { const x0 = m.w ? 0 : 7, x1 = m.e ? 15 : 8; for (let x = x0; x <= x1; x++) { cv.set(x, 4, IP.yel); cv.set(x, 5, IP.yel2); cv.set(x, 9, IP.yel); cv.set(x, 10, IP.yel2); } }
  if (m.n || m.s) { const y0 = m.n ? 0 : 6, y1 = m.s ? 15 : 12; for (let y = y0; y <= y1; y++) { cv.set(6, y, IP.yel); cv.set(9, y, IP.yel2); } }
  cv.rect(7, 3, 2, 11, IP.yel); cv.rect(8, 3, 1, 11, IP.yel2); cv.rect(6, 13, 4, 2, IP.st3);
  cv.outline(); dropShadow(cv);
  return cv;
}
/** portão de correr fechado: 'h' = 2×1 numa parede deitada (face para o sul), 'v' = 1×2 numa parede em pé (vista de cima) */
function slidingDoorCv(dir) {
  if (dir === 'h') {
    const cv = new Cv(32, 16);
    cv.rect(0, 0, 32, 5, '#3a434a'); for (let i = 0; i < 32; i++) cv.set(i, 2, ((i >> 2) & 1) ? IP.blk : IP.yel); cv.rect(0, 0, 32, 1, OL); cv.rect(0, 4, 32, 1, OL);
    for (let j = 5; j < 16; j++) for (let i = 1; i < 31; i++) cv.set(i, j, j % 3 === 0 ? IP.st2 : j % 3 === 1 ? IP.st0 : IP.st1);
    for (let j = 12; j < 15; j++) for (let i = 1; i < 31; i++) cv.set(i, j, ((i + j) >> 2) & 1 ? IP.blk : IP.yel);
    cv.rect(15, 5, 2, 11, IP.st3); cv.rect(15, 5, 1, 11, OL);
    cv.rect(0, 0, 1, 16, OL); cv.rect(31, 0, 1, 16, OL); cv.rect(0, 15, 32, 1, OL);
    cv.rect(10, 8, 3, 1, IP.st4); cv.rect(19, 8, 3, 1, IP.st4);
    cv.set(15, 1, '#ff5a3c'); cv.set(16, 1, '#ff5a3c');
    return cv;
  }
  const cv = new Cv(16, 32);
  cv.rect(2, 0, 12, 32, '#3a434a'); cv.rect(2, 0, 1, 32, OL); cv.rect(13, 0, 1, 32, OL); cv.rect(2, 0, 12, 1, OL); cv.rect(2, 31, 12, 1, OL);
  for (let j = 2; j < 30; j++) for (let i = 4; i < 12; i++) cv.set(i, j, ((i + j) >> 2) & 1 ? IP.blk : IP.yel);
  cv.rect(4, 2, 8, 1, IP.st3); cv.rect(4, 29, 8, 1, IP.st3);
  cv.rect(3, 15, 10, 2, IP.st2); cv.rect(3, 15, 10, 1, IP.st0);
  cv.set(7, 1, '#ff5a3c'); cv.set(8, 1, '#ff5a3c');
  return cv;
}

// ===================================================================== canos (cópia de Pipes.png, família cinza)
const PIPE_PARTS = { v1: [5, 0], v: [5, 1], v2: [5, 2], h1: [6, 0], h: [7, 0], h2: [8, 0], ctl: [6, 1], ctr: [7, 1], cbl: [6, 2], cbr: [7, 2], tl: [8, 1], tr: [9, 1], bl: [8, 2], br: [9, 2] };
let pipesPng = null;
function pipeCv(part) {
  pipesPng ??= PNG.sync.read(fs.readFileSync(path.join(TILESET_DIR, 'Pipes.png')));
  const [c, r] = PIPE_PARTS[part], cv = new Cv();
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const i = ((r * 16 + y) * pipesPng.width + c * 16 + x) * 4;
    if (pipesPng.data[i + 3]) cv.set(x, y, [pipesPng.data[i], pipesPng.data[i + 1], pipesPng.data[i + 2]], pipesPng.data[i + 3]);
  }
  return cv;
}

/** suporte do rack de canos: perfil I com sapata (o cano aéreo vai na camada above do mesmo tile) */
function pipeSupportCv() {
  const cv = new Cv();
  cv.rect(6, 5, 4, 10, IP.st2); cv.rect(6, 5, 1, 10, IP.st0); cv.rect(9, 5, 1, 10, IP.st3); cv.rect(5, 5, 6, 1, IP.st1);
  cv.rect(4, 14, 8, 2, IP.st3); cv.rect(4, 14, 8, 1, IP.st1);
  cv.outline(); dropShadow(cv);
  return cv;
}
/** pilar de aço do galpão (1×2): base com sapata na linha de baixo, perfil subindo com faixa zebrada */
function columnCv() {
  const cv = new Cv(16, 32);
  for (let y = 0; y < 30; y++) { cv.rect(5, y, 6, 1, IP.st2); cv.set(5, y, IP.st0); cv.set(6, y, IP.st1); cv.set(10, y, IP.st3); }
  for (let y = 18; y < 24; y++) for (let x = 5; x < 11; x++) cv.set(x, y, ((x + y) >> 1) & 1 ? IP.blk : IP.yel);
  cv.rect(3, 28, 10, 3, IP.st3); cv.rect(3, 28, 10, 1, IP.st1); cv.set(4, 29, IP.st0); cv.set(11, 29, IP.st0);
  cv.rect(2, 2, 12, 2, IP.st3); cv.rect(2, 2, 12, 1, IP.st1);
  cv.outline(); dropShadow(cv);
  return cv;
}

export function createIndustry(L) {
  const I = { IP };
  const tileC = (pfx, cv, props) => L.tile(contentKey(pfx, cv), cv, props);
  const FLOOR = { speed: 90, terrain: 'floor' };
  /** concreto: v 0..7 (bits: junta à direita, junta embaixo, mancha de óleo) */
  I.concrete = (v = 0) => L.tile('ind_concreto' + v, () => concreteCv(v), FLOOR);
  /** chapa xadrez: v 0..3 (juntas das chapas de 2×2 tiles) */
  I.checker = (v = 0) => L.tile('ind_chapa' + v, () => checkerCv(v), FLOOR);
  I.stripe = (dir) => L.tile('ind_zebra_' + dir, () => stripeCv(dir), FLOOR);
  /** asfalto: e = {n,e,s,w} meio-fio, line 'h'|'v'|null, v variante de textura 0..3 */
  I.asphalt = (e = {}, line = null, v = 0) => tileC('ind_asfalto', asphaltCv(e, line, v), { speed: 85, terrain: 'road' });
  /** esteira (andável e rápida, speed 70): dir das nervuras, f = lados com estrutura */
  I.belt = (dir, f = {}) => tileC('ind_esteira', beltCv(dir, f), { speed: 70, terrain: 'floor' });
  I.pipe = (part) => L.tile('ind_cano_' + part, () => pipeCv(part));
  /** parede (estilo 'metal' | 'concrete'): m = vizinhos que são parede (qualquer estilo) */
  I.wall = (style, m) => tileC('ind_parede_' + style, wallCv(style, m));
  I.metalWall = (m) => I.wall('metal', m);
  I.concreteWall = (m) => I.wall('concrete', m);
  I.chainFence = (m) => tileC('ind_tela', fenceCv(m));
  I.railing = (m) => tileC('ind_corrimao', railingCv(m));
  /** portão de correr: 'h' → [[a, b]] (2×1), 'v' → [[a], [b]] (1×2) */
  I.slidingDoor = memo((dir) => sheetC(L, 'ind_portao', slidingDoorCv(dir), dir === 'h' ? 2 : 1, dir === 'h' ? 1 : 2));
  I.pipeSupport = () => L.tile('ind_suporte_cano', pipeSupportCv);
  /** pilar de galpão: [[topo (above)], [base (deco + colisão)]] */
  I.column = memo(() => sheetC(L, 'ind_pilar', columnCv(), 1, 2));
  return I;
}

// ===================================================================== Siderúrgica
/**
 * Gusa e escória: recolor da água do pântano (família 'W' com deslocamento (13, −1) na tabela de blob) para o
 * TilesetLemon, desenhado na camada DECO por cima do chão do setor (concreto, piso escuro do Coração). O líquido
 * (azul/roxo dominante) vira a rampa por luminância; o anel branco vira a borda quente; a margem escura vira crosta; a
 * terra do pântano em volta fica transparente. Como o gid é do TilesetLemon (e nem está no chão), o WaterGrid não trata
 * como água: ninguém pesca no ferro derretido. Bloqueado pela colisão.
 */
const LIQ = {
  gusa: { ramp: ['#8a1c24', '#d14b34', '#e66a3a', '#ffad5d', '#ffe9a0'], rim: '#ffd27a', crust: ['#4a2a22', '#2e1c1a'], speck: ['#ffe9a0', 0.05] },
  escoria: { ramp: ['#2c2422', '#3a2e2c', '#5d4a42', '#7a6658', '#8d7a6a'], rim: '#a8968a', crust: ['#2e2624', '#1e1817'], speck: ['#e66a3a', 0.035] },
};
const CRUST = { '584b46': 0, '695953': 0, '816855': 1, '90775e': 1 };
function recolorLiquid(kind) {
  const { ramp, rim, crust, speck } = LIQ[kind];
  return (cv) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const [r, g, b, a] = cv.get(x, y); if (!a) continue;
      const hex = ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
      if (hex === 'ffffff') { cv.set(x, y, rim); continue; }
      if (b > g + 10) {
        const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        let k = Math.max(0, Math.min(ramp.length - 1, Math.round((lum - 0.49) / 0.115) + 2));
        if (hashf(x, y, 37) < 0.12) k = Math.max(0, k - 1);
        cv.set(x, y, hashf(x * 3, y * 5, 41) < speck[1] ? speck[0] : ramp[k]);
        continue;
      }
      if (hex in CRUST) cv.set(x, y, crust[CRUST[hex]]); else cv.clear(x, y);
    }
  };
}

function blastFurnaceCv() {
  const W = 96, H = 144, cv = new Cv(W, H), cx = 47.5;
  // casca: goela estreita no alto, cuba alargando até o ventre, rampa e cadinho na base
  const hw = (y) => (y < 30 ? 15 : y < 84 ? 15 + ((y - 30) / 54) * 12 : y < 96 ? 27 + ((y - 84) / 12) * 2 : 29);
  for (let y = 26; y < 134; y++) {
    const w = hw(y), x0 = Math.round(cx - w), x1 = Math.round(cx + w);
    for (let x = x0; x <= x1; x++) {
      const t = (x - x0) / (x1 - x0);
      let c = shade4(t, y > 100 ? DSTEEL : STEEL);
      if (y > 98 && hashf(x >> 1, y >> 1, 5) < 0.06) c = IP.rust1;
      cv.set(x, y, c);
    }
    if (y % 9 === 3 && y > 30 && y < 98) for (let x = x0; x <= x1; x++) cv.set(x, y, (x - x0) % 6 === 2 ? IP.st0 : IP.st3);
    if (y > 104 && y < 132) for (let x = x0 + 3; x < x1 - 2; x += 7) cv.set(x, y, IP.st4);
  }
  // anel de vento (bustle) e algaravizes até as ventaneiras
  for (let y = 88; y <= 95; y++) for (let x = 10; x <= 85; x++) cv.set(x, y, shade4((y - 88) / 7, STEEL));
  for (const x of [16, 30, 44, 51, 65, 79]) { cv.rect(x, 96, 2, 8, IP.st3); cv.rect(x - 1, 103, 4, 3, IP.st2); }
  // plataforma da goela com guarda-corpo
  cv.rect(23, 22, 50, 5, IP.st3); cv.rect(23, 22, 50, 1, IP.st1);
  for (let x = 23; x <= 72; x += 4) cv.rect(x, 16, 1, 6, IP.st2); cv.rect(23, 16, 50, 1, IP.st1);
  // topo: caixa da goela, tubulões de gás subindo e o descendente pela direita
  cylV(cv, 38, 57, 8, 21, DSTEEL);
  cylV(cv, 30, 35, 2, 22, STEEL); cylV(cv, 60, 65, 2, 22, STEEL);
  cylH(cv, 30, 88, 0, 5, STEEL);
  cylV(cv, 84, 89, 0, 70, STEEL);
  cylH(cv, 76, 89, 66, 71, STEEL);
  // base de concreto
  for (let y = 134; y < 144; y++) for (let x = 12; x <= 83; x++) cv.set(x, y, y === 134 ? '#d6d0c2' : y > 141 ? '#7d776c' : (x + (y >> 1)) % 9 === 0 ? '#a29b8d' : '#b7b0a2');
  // furo de gusa na frente
  cv.ell(47.5, 126, 6, 7, '#2a2224'); cv.rect(42, 126, 12, 8, '#2a2224');
  cv.outline();
  // brilhos (depois do contorno): ventaneiras, furo e o filete de gusa descendo para o canal
  for (const x of [16, 30, 44, 51, 65, 79]) { cv.rect(x - 1, 106, 4, 2, IP.fire2); cv.set(x, 106, IP.fire3); cv.glow(x + 0.5, 106, 4, '#ff9a3c', 70); }
  cv.ell(47.5, 128, 3.5, 4.5, IP.fire1); cv.ell(47.5, 129, 2.2, 3, IP.fire2); cv.set(47, 129, IP.fire3); cv.set(48, 130, IP.fire3);
  cv.rect(45, 132, 5, 12, IP.fire1); cv.rect(46, 132, 3, 12, IP.fire2); for (let y = 133; y < 144; y += 3) cv.set(47, y, IP.fire3);
  cv.glow(47.5, 132, 12, '#ff7a30', 90);
  cv.set(33, 1, '#ff5a3c'); cv.set(62, 1, '#ff5a3c');
  return cv;
}
function stoveCv() {
  const cv = new Cv(32, 96);
  for (let y = 4; y < 88; y++) {
    const w = y < 16 ? 13 * Math.sqrt(Math.max(0, 1 - ((16 - y) / 12) ** 2)) : 13;
    const x0 = Math.round(15.5 - w), x1 = Math.round(15.5 + w);
    for (let x = x0; x <= x1; x++) cv.set(x, y, shade4((x - x0) / Math.max(1, x1 - x0), WSTEEL));
    if (y > 16 && y % 12 === 4) for (let x = x0; x <= x1; x++) cv.set(x, y, (x - x0) % 5 === 1 ? IP.st0 : '#7d8a94');
  }
  for (let y = 20; y < 86; y++) { cv.set(6, y, IP.st3); if (y % 3 === 0) cv.set(7, y, IP.st3); cv.set(8, y, IP.st3); }
  cv.rect(27, 54, 5, 8, IP.st2); cv.rect(27, 54, 5, 1, IP.st0); cv.rect(30, 52, 2, 12, IP.st3);
  for (let y = 88; y < 96; y++) for (let x = 1; x <= 30; x++) cv.set(x, y, y === 88 ? '#d6d0c2' : y > 93 ? '#7d776c' : '#b7b0a2');
  cv.set(15, 3, '#ff5a3c');
  cv.outline();
  return cv;
}
function converterCv() {
  const cv = new Cv(64, 64);
  // pedestais com os mancais dos munhões
  for (const x0 of [2, 52]) { cylV(cv, x0, x0 + 9, 26, 63, ['#a7b2b9', IP.st1, IP.st2, IP.st3]); cv.rect(x0 - 1, 24, 12, 3, IP.st3); cv.rect(x0 - 1, 24, 12, 1, IP.st0); }
  cv.rect(10, 30, 44, 5, IP.st3);
  // vaso em pera, inclinado (a boca puxa para a direita)
  for (let y = 9; y < 62; y++) {
    const w = y < 22 ? 7 + ((y - 9) / 13) * 12 : y < 50 ? 19 : 19 * Math.sqrt(Math.max(0, 1 - ((y - 50) / 12) ** 2));
    const off = (40 - y) * 0.16, x0 = Math.round(32 + off - w), x1 = Math.round(32 + off + w);
    for (let x = x0; x <= x1; x++) {
      let c = shade4((x - x0) / Math.max(1, x1 - x0), DSTEEL);
      if (hashf(x >> 1, y >> 1, 77) < 0.05) c = IP.rust1;
      cv.set(x, y, c);
    }
    if (y >= 30 && y <= 34) for (let x = x0 - 2; x <= x1 + 2; x++) cv.set(x, y, y === 30 ? IP.st0 : IP.st1);
    if (y === 44 || y === 22) for (let x = x0; x <= x1; x++) cv.set(x, y, IP.st4);
  }
  cv.ell(37, 9, 8, 3.2, IP.st0); cv.ell(37, 9, 6.4, 2.2, '#2a2224');
  cv.outline();
  cv.ell(37, 9.2, 5, 1.6, IP.fire1); cv.ell(37, 9, 3.2, 1, IP.fire2); cv.set(37, 9, IP.fire3); cv.set(36, 9, IP.fire3);
  for (const [x, y] of [[34, 4], [39, 2], [41, 5], [36, 1], [43, 3], [31, 5]]) cv.set(x, y, (x + y) & 1 ? IP.fire2 : IP.fire3);
  cv.glow(37, 6, 11, '#ff8a3c', 85);
  return cv;
}
function torpedoCv() {
  const cv = new Cv(80, 32), yb = 30;
  const bogie = (x0) => { cv.rect(x0, yb - 6, 14, 3, '#3d3a3c'); cv.rect(x0 + 1, yb - 6, 12, 1, '#5d585c'); for (const wx of [x0 + 3, x0 + 10]) { cv.ell(wx, yb - 2, 2.6, 2.6, '#2a2629'); cv.set(wx - 1, yb - 3, '#6b6670'); } };
  bogie(6); bogie(60);
  cv.rect(3, yb - 9, 74, 3, '#2e2a2b');
  for (const x of [16, 62]) cv.rect(x, 18, 3, 4, IP.st3);
  for (let x = 3; x <= 76; x++) {
    const d = Math.abs(x - 39.5), w = d < 26 ? 9 : 9 * Math.sqrt(Math.max(0, 1 - ((d - 26) / 11) ** 2));
    for (let y = Math.round(11 - w); y <= Math.round(11 + w); y++) { let c = shade4((y - (11 - w)) / Math.max(1, 2 * w), DSTEEL); if (hashf(x >> 1, y, 61) < 0.035) c = IP.rust1; cv.set(x, y, c); }
    if (x % 9 === 4 && d < 30) for (let y = Math.round(11 - w); y <= Math.round(11 + w); y++) cv.set(x, y, IP.st4);
  }
  cv.rect(35, 0, 10, 4, IP.st2); cv.rect(35, 0, 10, 1, IP.st0);
  cv.outline();
  cv.rect(37, 1, 6, 2, IP.fire1); cv.rect(38, 1, 4, 1, IP.fire2); cv.set(39, 1, IP.fire3); cv.glow(40, 1, 7, '#ff8a3c', 70);
  return cv;
}
function ladleCv() {
  const cv = new Cv(32, 32);
  for (let y = 8; y <= 29; y++) {
    const w = 13 - ((y - 8) / 21) * 3, x0 = Math.round(15.5 - w), x1 = Math.round(15.5 + w);
    for (let x = x0; x <= x1; x++) { let c = shade4((x - x0) / Math.max(1, x1 - x0), DSTEEL); if (hashf(x, y >> 1, 83) < 0.05) c = IP.rust1; cv.set(x, y, c); }
    if (y === 14 || y === 23) for (let x = x0; x <= x1; x++) cv.set(x, y, IP.st4);
  }
  cv.rect(1, 13, 3, 4, IP.st2); cv.rect(28, 13, 3, 4, IP.st2);
  cv.ell(15.5, 7.5, 14, 3.2, IP.st0); cv.ell(15.5, 7.5, 12, 2.4, IP.st1);
  cv.outline();
  cv.ell(15.5, 7.3, 10.5, 1.9, IP.fire1); cv.ell(15.5, 7.2, 8, 1.3, IP.fire2); cv.rect(12, 7, 6, 1, IP.fire3);
  cv.glow(15.5, 6, 10, '#ff8a3c', 70);
  dropShadow(cv);
  return cv;
}
function craneCv(part) {
  const cv = new Cv();
  const beam = (x0, x1) => {
    for (let x = x0; x <= x1; x++) { cv.set(x, 3, OL); cv.set(x, 4, IP.yel); for (let y = 5; y <= 8; y++) cv.set(x, y, '#d4b032'); cv.set(x, 9, IP.yel2); cv.set(x, 10, OL); }
    for (let x = x0; x <= x1; x++) { const k = ((x % 8) + 8) % 8; const yy = k < 4 ? 5 + k : 12 - k; if (yy >= 5 && yy <= 8) cv.set(x, yy, IP.yel2); }
  };
  if (part === 'beam' || part === 'trolley') beam(0, 15);
  if (part === 'trolley') {
    cv.rect(3, 0, 10, 8, '#3d4a52'); cv.rect(3, 0, 10, 1, '#6b7a84'); cv.rect(3, 0, 1, 8, OL); cv.rect(12, 0, 1, 8, OL); cv.rect(3, 7, 10, 1, OL);
    cv.rect(6, 8, 1, 4, '#2a2629'); cv.rect(9, 8, 1, 4, '#2a2629'); cv.rect(5, 11, 6, 2, IP.st2); cv.rect(5, 11, 6, 1, IP.st0);
    cv.set(7, 13, IP.st3); cv.set(7, 14, IP.st3); cv.set(8, 15, IP.st3); cv.set(9, 14, IP.st3); cv.set(6, 14, OL);
  }
  if (part === 'endL' || part === 'endR') {
    const L2 = part === 'endL';
    beam(L2 ? 6 : 0, L2 ? 15 : 9);
    const x0 = L2 ? 1 : 9;
    cv.rect(x0, 1, 6, 12, '#3d4a52'); cv.rect(x0, 1, 6, 1, '#6b7a84'); cv.rect(x0, 1, 1, 12, OL); cv.rect(x0 + 5, 1, 1, 12, OL); cv.rect(x0, 12, 6, 1, OL);
    for (const wy of [3, 9]) { cv.ell(x0 + 3, wy, 1.6, 1.6, '#2a2629'); }
    cv.set(x0 + 2, 6, IP.yel); cv.set(x0 + 3, 6, IP.yel);
  }
  return cv;
}
function rollerCv(part, hot) {
  const cv = new Cv();
  for (let x = 0; x < 16; x++) { cv.set(x, 2, OL); cv.set(x, 3, IP.st2); cv.set(x, 4, IP.st3); cv.set(x, 12, IP.st2); cv.set(x, 13, IP.st3); cv.set(x, 14, OL); }
  for (const x0 of [1, 5, 9, 13]) for (let y = 5; y <= 11; y++) { cv.set(x0, y, IP.st0); cv.set(x0 + 1, y, IP.st1); cv.set(x0 + 2, y, IP.st2); }
  for (let x = 0; x < 16; x++) for (let y = 5; y <= 11; y++) if (!cv.get(x, y)[3]) cv.set(x, y, '#2a2629');
  if (part === 'l' || part === 'r') { const x = part === 'l' ? 0 : 14; cv.rect(x, 2, 2, 13, IP.st3); cv.rect(part === 'l' ? 0 : 15, 2, 1, 13, OL); }
  if (hot) {
    const a = part === 'l' ? 3 : 0, b = part === 'r' ? 12 : 15;
    for (let x = a; x <= b; x++) { cv.set(x, 6, '#ffd090'); cv.set(x, 7, IP.fire2); cv.set(x, 8, (x & 3) === 1 ? IP.fire3 : IP.fire2); cv.set(x, 9, IP.fire1); cv.set(x, 10, IP.red); }
    cv.glow(8, 8, 9, '#ff8a3c', 60);
  }
  return cv;
}
function millStandCv() {
  const cv = new Cv(48, 48);
  cylH(cv, 6, 41, 13, 21, STEEL); cylH(cv, 6, 41, 26, 34, STEEL);
  for (let x = 6; x <= 41; x++) { cv.set(x, 23, IP.fire2); cv.set(x, 24, IP.fire1); cv.set(x, 22, '#ffd090'); cv.set(x, 25, IP.red); }
  for (const x0 of [2, 36]) { cylV(cv, x0, x0 + 9, 4, 42, DSTEEL); for (let y = 8; y < 42; y += 6) { cv.set(x0 + 2, y, IP.st0); cv.set(x0 + 7, y, IP.st0); } cv.rect(x0, 4, 10, 2, IP.yel); }
  cv.rect(2, 2, 44, 4, IP.st3); cv.rect(2, 2, 44, 1, IP.st1); cv.rect(18, 0, 12, 3, '#7a3826'); cv.rect(18, 0, 12, 1, '#a9553a');
  for (let y = 42; y < 48; y++) for (let x = 0; x < 48; x++) cv.set(x, y, y === 42 ? '#d6d0c2' : y > 45 ? '#7d776c' : '#b7b0a2');
  cv.outline();
  cv.glow(24, 24, 14, '#ff8a3c', 60);
  return cv;
}
function coilCv() {
  const cv = new Cv();
  for (let r = 6.8; r > 1; r -= 1) cv.ell(8, 8.5, r, r, [IP.st0, IP.st1, IP.st0, IP.st2, IP.st1, IP.st2][Math.round(6.8 - r)]);
  cv.ell(8, 8.5, 1.8, 1.8, '#2a2629'); cv.rect(7, 2, 2, 13, '#3d4a52'); cv.ell(8, 8.5, 1.8, 1.8, '#2a2629');
  cv.outline(); dropShadow(cv);
  return cv;
}
function slabPileCv() {
  const cv = new Cv(32, 16);
  for (const [y, dx] of [[11, 0], [8, 2], [5, 1]]) { cv.rect(2 + dx, y - 1, 27, 1, '#8d99a2'); cv.rect(2 + dx, y, 27, 2, IP.st3); cv.set(4 + dx, y, IP.rust1); cv.set(20 + dx, y + 1, IP.rust1); }
  cv.outline(); dropShadow(cv);
  return cv;
}
const ORE = {
  ferro: ['#c47a52', '#a05a3a', '#7e432c', '#5a2c1f'],
  carvao: ['#62626c', '#43434b', '#2e2e34', '#1c1c20'],
  coque: ['#8e8e96', '#6e6e77', '#52525a', '#38383e'],
  escoria: ['#8d7a6a', '#6e5d52', '#5d4a42', '#3a2e2c'],
};
function orePileCv(kind, seed = 1) {
  const pal = ORE[kind], cv = new Cv(48, 32), r = mulberry32(seed * 131 + kind.length);
  const bump = [0, 0, 0, 0, 0, 0].map(() => r() * 2.5);
  for (let x = 1; x <= 46; x++) {
    const t = (x - 1) / 45, h = 25 * Math.pow(Math.sin(Math.PI * t), 0.8) + bump[Math.floor(t * 5.99)] * Math.sin(Math.PI * t);
    const top = Math.round(31 - h);
    for (let y = top; y <= 30; y++) {
      const s = (x - 24) / 46 + (y - top) / Math.max(1, h) * 0.75 + (hashf(x >> 1, y >> 1, 300 + seed) - 0.5) * 0.45;
      cv.set(x, y, pal[Math.max(0, Math.min(3, Math.floor(s * 2.6 + 0.9)))]);
      if (hashf(x, y, 330 + seed) < 0.05) cv.set(x, y, pal[0]);
    }
  }
  cv.outline();
  for (let x = 2; x < 46; x++) cv.over(x, 31, OL, 60);
  return cv;
}
/** bateria de fornos de coque: coluna 1×5 (topo com tampas e trilho, face de tijolo, porta com brilho na base) */
function cokeOvenCv(kind) {
  const cv = new Cv(16, 80);
  for (let y = 0; y < 18; y++) for (let x = 0; x < 16; x++) cv.set(x, y, (y === 0) ? OL : y === 1 ? '#7a6a62' : hashf(x, y, 501) < 0.1 ? '#43393a' : '#544744');
  for (let x = 0; x < 16; x++) { cv.set(x, 4, IP.st1); cv.set(x, 5, IP.st3); cv.set(x, 13, IP.st1); cv.set(x, 14, IP.st3); }
  if (kind !== 'endL' && kind !== 'endR') { cv.ell(8, 9, 3.4, 2.4, '#6b6670'); cv.ell(8, 9, 2.4, 1.5, '#2e2a2b'); cv.set(7, 8, '#8a858e'); }
  for (let y = 18; y < 80; y++) for (let x = 0; x < 16; x++) {
    const course = (y - 18) >> 2, off = course & 1 ? 4 : 0;
    let c = (y - 18) % 4 === 3 || (x + off) % 8 === 7 ? IP.br2 : hashf((x + off) >> 3, course, 520) < 0.4 ? IP.br1 : IP.br0;
    cv.set(x, y, c);
  }
  cv.rect(0, 17, 16, 2, IP.st3); cv.rect(0, 17, 16, 1, IP.st1);
  if (kind === 'endL' || kind === 'endR') {
    const x = kind === 'endL' ? 3 : 10; cylV(cv, x, x + 3, 6, 79, STEEL); cv.rect(x - 1, 40, 6, 2, IP.st3);
    cv.rect(kind === 'endL' ? 0 : 15, 0, 1, 80, OL);
  } else {
    for (const x of [0, 14]) { cv.rect(x, 17, 2, 63, IP.st3); cv.rect(x, 17, 1, 63, IP.st2); }
    cv.rect(3, 46, 10, 34, '#4a454c'); cv.rect(3, 46, 10, 1, '#6b6670'); cv.rect(3, 46, 1, 34, '#2e2a2b'); cv.rect(12, 46, 1, 34, '#2e2a2b');
    for (const y of [54, 64, 74]) cv.rect(2, y, 12, 2, IP.st3);
    const glow = kind === 'door0' ? 1 : kind === 'door1' ? 0.6 : 0;
    if (glow) { for (let y = 47; y < 80; y++) { cv.set(4, y, IP.fire1, 255 * glow); cv.set(11, y, IP.fire1, 255 * glow); } cv.rect(5, 47, 6, 1, IP.fire2, 255 * glow); cv.glow(8, 62, 9, '#ff7a30', 50 * glow); }
  }
  return cv;
}
function quenchTowerCv() {
  const cv = new Cv(48, 80);
  for (let y = 14; y < 80; y++) for (let x = 5; x <= 42; x++) {
    let c = (x - 5) / 37 < 0.15 ? '#cdc5b3' : (x - 5) / 37 > 0.85 ? '#8f877a' : '#b3aa96';
    if ((x - 5) % 9 === 0) c = '#9d9584';
    if (y % 10 === 0) c = '#9d9584';
    cv.set(x, y, c);
  }
  cv.rect(3, 10, 42, 5, IP.st3); cv.rect(3, 10, 42, 1, IP.st1); for (let x = 6; x < 42; x += 4) cv.rect(x, 11, 2, 3, '#2e353b');
  cv.ell(24, 72, 9, 10, '#1f1b1c'); cv.rect(15, 72, 19, 8, '#1f1b1c');
  cv.outline();
  for (const [x, y, rr] of [[18, 7, 6], [27, 5, 7], [35, 8, 5], [23, 2, 4], [31, 1, 4]]) cv.ell(x, y, rr, rr * 0.75, '#f4f2ee', 190);
  for (const [x, y, rr] of [[16, 9, 3], [29, 7, 4], [37, 9, 3]]) cv.ell(x, y, rr, rr * 0.7, '#d9d6d0', 170);
  return cv;
}
function chimneyCv() {
  const cv = new Cv(32, 96);
  for (let y = 10; y < 94; y++) {
    const w = 6 + ((y - 10) / 84) * 7, x0 = Math.round(15.5 - w), x1 = Math.round(15.5 + w);
    const band = Math.floor((y - 10) / 12) & 1;
    for (let x = x0; x <= x1; x++) cv.set(x, y, shade4((x - x0) / Math.max(1, x1 - x0), band ? ['#f2eaf1', '#d6d3c4', '#a9a597', '#7d7a70'] : ['#ef7a5a', IP.red, '#a33a28', IP.red2]));
  }
  cv.rect(6, 18, 20, 2, IP.st3); cv.rect(6, 18, 20, 1, IP.st1); for (let x = 6; x < 26; x += 3) cv.rect(x, 15, 1, 3, IP.st2); cv.rect(6, 15, 20, 1, IP.st1);
  cv.rect(9, 9, 14, 2, IP.st3);
  cv.rect(7, 94, 18, 2, '#7d776c');
  cv.outline();
  for (const [x, y, rr] of [[14, 6, 4], [19, 3, 4], [24, 1, 3], [11, 2, 3]]) cv.ell(x, y, rr, rr * 0.75, '#8a8a92', 170);
  cv.set(15, 12, '#ff5a3c'); cv.glow(15, 12, 3, '#ff6a4a', 60);
  return cv;
}
function siloCv() {
  const cv = new Cv(48, 48);
  for (let y = 4; y < 16; y++) { const w = 3 + ((y - 4) / 12) * 16, x0 = Math.round(23.5 - w), x1 = Math.round(23.5 + w); for (let x = x0; x <= x1; x++) cv.set(x, y, shade4((x - x0) / Math.max(1, x1 - x0), STEEL)); }
  cylV(cv, 5, 42, 16, 43, WSTEEL);
  for (const y of [24, 32, 40]) for (let x = 5; x <= 42; x++) cv.set(x, y, '#7d8a94');
  for (let y = 12; y < 44; y++) { cv.set(37, y, IP.st3); if (y % 3 === 0) cv.set(38, y, IP.st3); cv.set(39, y, IP.st3); }
  cv.rect(21, 1, 6, 3, IP.st2);
  for (let y = 44; y < 48; y++) for (let x = 3; x <= 44; x++) cv.set(x, y, y === 44 ? '#d6d0c2' : '#9d9584');
  cv.outline();
  return cv;
}
/** mesa de controle 3×1: tampo, painel inclinado com botões, chaves e luzes (sem tela) */
function controlDeskCv() {
  const cv = new Cv(48, 16);
  cv.rect(1, 2, 46, 6, '#5d6870'); cv.rect(1, 2, 46, 1, IP.st1);
  for (let x = 4; x < 45; x += 3) { const k = Math.floor(hashf(x, 3, 7) * 4); cv.set(x, 4, ['#ff5a3c', '#5cf07a', '#ffd040', '#6ab0ff'][k]); }
  for (let x = 5; x < 44; x += 6) { cv.rect(x, 6, 2, 1, IP.st0); cv.set(x + 1, 5, IP.st4); }
  cv.rect(1, 8, 46, 6, IP.st2); cv.rect(1, 8, 46, 1, IP.st0); for (const x of [15, 31]) cv.rect(x, 8, 1, 6, IP.st3);
  cv.rect(2, 14, 3, 2, IP.st3); cv.rect(43, 14, 3, 2, IP.st3);
  cv.outline();
  return cv;
}
function hatchCv() {
  const cv = checkerCv(0);
  cv.ell(8, 8, 7, 7, OL);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const d = Math.hypot(x + 0.5 - 8, y + 0.5 - 8); if (d < 6.6 && d >= 5.2) cv.set(x, y, ((Math.atan2(y - 8, x - 8) * 4 / Math.PI + 8) | 0) & 1 ? IP.blk : IP.yel); }
  cv.ell(8, 8, 5.2, 5.2, IP.fire1); cv.ell(8, 8, 4.4, 4.4, '#5d676e'); cv.ell(8, 8, 3.4, 3.4, '#6f7a81');
  cv.rect(4, 7, 8, 2, IP.st3); cv.rect(7, 4, 2, 8, IP.st3); cv.rect(7, 7, 2, 2, IP.st0);
  cv.glow(8, 8, 8, '#ff7a30', 45);
  return cv;
}
function scrapCv(seed) {
  const cv = new Cv(), r = mulberry32(700 + seed * 17);
  const rust = [IP.rust0, IP.rust1, IP.rust2, '#7a5a4a', IP.st2, IP.st1];
  for (let k = 0; k < 6; k++) { const w = 3 + Math.floor(r() * 6), h = 2 + Math.floor(r() * 3), x = 1 + Math.floor(r() * (14 - w)), y = 4 + Math.floor(r() * (11 - h)); cv.rect(x, y, w, h, rust[Math.floor(r() * rust.length)]); cv.rect(x, y, w, 1, '#c9a08a'); }
  if (seed === 1) { cv.ell(9, 8, 3.5, 3.5, IP.st2); cv.ell(9, 8, 1.4, 1.4, '#2a2629'); for (let a = 0; a < 8; a++) cv.set(9 + Math.round(Math.cos(a * Math.PI / 4) * 4.5), 8 + Math.round(Math.sin(a * Math.PI / 4) * 4.5), IP.st2); }
  if (seed === 2) { cylH(cv, 2, 13, 6, 9, STEEL); cv.ell(2, 7.5, 1, 2, '#2a2629'); }
  cv.outline(); dropShadow(cv);
  return cv;
}
/** passarela de chapa sobre gusa: rails = lados com guarda-corpo ('n', 's' ou 'ns') */
function catwalkCv(rails) {
  const cv = new Cv();
  for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) cv.set(i, j, (i & 1) === 0 || (j & 1) === 0 ? '#5d676e' : '#2e2224');
  for (const s of rails) {
    const y0 = s === 'n' ? 0 : 13;
    for (let i = 0; i < 16; i++) { cv.set(i, y0, s === 'n' ? OL : IP.st2); cv.set(i, y0 + 1, IP.yel); cv.set(i, y0 + 2, s === 'n' ? IP.yel2 : OL); }
    for (const x of [1, 9]) { cv.set(x, s === 'n' ? 3 : 12, IP.st3); }
  }
  return cv;
}
/** galeria de esteira elevada (camada above): telhado ondulado na linha de cima, treliça na de baixo; part = 'l'|'m'|'r' */
function galleryCv(part) {
  const cv = new Cv(16, 32);
  const x0 = part === 'l' ? 2 : 0, x1 = part === 'r' ? 13 : 15;
  for (let y = 6; y < 18; y++) for (let x = x0; x <= x1; x++) cv.set(x, y, y === 6 ? IP.st0 : (x & 1) ? IP.st1 : '#a7b2b9');
  for (let x = x0; x <= x1; x++) { cv.set(x, 5, OL); cv.set(x, 18, IP.st3); cv.set(x, 19, IP.st4); }
  for (let x = x0; x <= x1; x++) { cv.set(x, 20, IP.st2); cv.set(x, 27, IP.st2); cv.set(x, 28, OL); const k = ((x % 8) + 8) % 8, y = 21 + (k < 4 ? k : 7 - k) * 2; if (y < 27) { cv.set(x, y, IP.st3); cv.set(x, y + 1, IP.st3); } }
  if (part === 'l') { cv.rect(x0, 5, 1, 24, OL); cv.rect(x0 + 1, 20, 2, 8, IP.st3); }
  if (part === 'r') { cv.rect(x1, 5, 1, 24, OL); cv.rect(x1 - 2, 20, 2, 8, IP.st3); }
  return cv;
}
/** trilho embutido na chapa (carro de panela da Aciaria): part 'm' | 'l' | 'r' (batente nas pontas) */
function embeddedRailCv(part) {
  const cv = checkerCv(0);
  for (let i = 0; i < 16; i++) { for (const y of [3, 10]) { cv.set(i, y, '#2e353b'); cv.set(i, y + 1, '#e3e6e8'); cv.set(i, y + 2, '#7d8790'); } }
  if (part !== 'm') { const x = part === 'l' ? 1 : 10; cv.rect(x, 2, 5, 12, '#f2eaf1'); for (let y = 2; y < 14; y += 4) cv.rect(x, y, 5, 2, IP.red); cv.rect(x, 2, 5, 1, OL); cv.rect(x, 13, 5, 1, OL); }
  return cv;
}
/** lingotamento contínuo: torre com a panela no alto, distribuidor e o veio descendo em curva até a mesa de saída */
function casterCv() {
  const cv = new Cv(112, 96);
  for (let y = 86; y < 96; y++) for (let x = 2; x < 110; x++) cv.set(x, y, y === 86 ? '#d6d0c2' : y > 93 ? '#7d776c' : (x + (y >> 1)) % 9 === 0 ? '#a29b8d' : '#b7b0a2');
  cylV(cv, 26, 37, 30, 86, DSTEEL); cv.rect(14, 30, 36, 4, IP.st3); cv.rect(14, 30, 36, 1, IP.st1);
  // panela no braço da torre
  for (let y = 6; y <= 28; y++) { const w = 13 - ((y - 6) / 22) * 3, x0 = Math.round(31.5 - w), x1 = Math.round(31.5 + w); for (let x = x0; x <= x1; x++) cv.set(x, y, shade4((x - x0) / Math.max(1, x1 - x0), DSTEEL)); }
  cv.ell(31.5, 6, 14, 3.2, IP.st0); cv.ell(31.5, 6, 12, 2.4, IP.st1);
  // distribuidor (calha refratária) e a câmara do molde
  cv.rect(30, 44, 52, 10, IP.br1); cv.rect(30, 44, 52, 2, IP.br0); cv.rect(30, 52, 52, 2, IP.br2); cv.rect(28, 42, 56, 2, IP.st2);
  cv.rect(60, 54, 12, 8, IP.st3); cv.rect(60, 54, 12, 1, IP.st1);
  // veio: rolos em arco descendo para a direita
  for (let k = 0; k <= 18; k++) {
    const a = (k / 18) * (Math.PI / 2), cx = 66 + (1 - Math.cos(a)) * 40, cy = 62 + Math.sin(a) * 20;
    cv.ell(cx, cy, 2.4, 2.4, IP.st1); cv.set(Math.round(cx) - 1, Math.round(cy) - 1, IP.st0);
  }
  for (let x = 92; x < 110; x++) { cv.set(x, 80, IP.st2); cv.set(x, 84, IP.st2); }
  cv.outline();
  // aço líquido: filete da panela ao distribuidor, superfície do distribuidor, placa saindo incandescente
  cv.rect(30, 29, 3, 15, IP.fire2); cv.rect(31, 29, 1, 15, IP.fire3);
  cv.rect(32, 45, 48, 2, IP.fire1); cv.rect(34, 45, 44, 1, IP.fire2);
  cv.ell(31.5, 6, 10, 1.7, IP.fire1); cv.ell(31.5, 6, 7.5, 1.1, IP.fire2); cv.rect(28, 6, 7, 1, IP.fire3);
  for (let k = 0; k <= 30; k++) { const a = (k / 30) * (Math.PI / 2), cx = 66 + (1 - Math.cos(a)) * 40, cy = 62 + Math.sin(a) * 20; cv.set(Math.round(cx), Math.round(cy), k % 3 ? IP.fire2 : IP.fire3); }
  for (let x = 92; x < 110; x++) { cv.set(x, 81, IP.fire2); cv.set(x, 82, IP.fire1); cv.set(x, 83, IP.red); }
  cv.glow(31, 40, 16, '#ff8a3c', 70); cv.glow(98, 82, 12, '#ff8a3c', 60);
  return cv;
}

/** leira (pilha comprida) de minério: `len` tiles × 3, o miolo é periódico (16 px) e sai uma vez só no atlas */
function windrowCv(kind, len) {
  const pal = ORE[kind], W = len * 16, cv = new Cv(W, 48);
  for (let x = 0; x < W; x++) {
    const e = Math.min(x + 0.5, W - x - 0.5), ramp = Math.min(1, e / 26);
    const hgt = (36 + 0.8 * Math.sin((x % 16) / 16 * Math.PI * 2)) * Math.sin(ramp * Math.PI / 2) ** 0.7;
    const top = Math.round(46 - hgt);
    for (let y = top; y <= 46; y++) {
      const t = (y - top) / Math.max(1, hgt), side = ramp < 1 ? (x < W / 2 ? -0.25 : 0.25) * (1 - ramp) : 0;
      const s = t * 0.85 + side + (hashf((x % 16) >> 1, y >> 1, 340) - 0.5) * 0.45;
      cv.set(x, y, pal[Math.max(0, Math.min(3, Math.floor(s * 2.6 + 0.9)))]);
      if (hashf(x % 16, y, 360) < 0.05) cv.set(x, y, pal[0]);
    }
  }
  cv.outline();
  for (let x = 2; x < W - 2; x++) cv.over(x, 47, OL, 60);
  return cv;
}
/** gasômetro (5×5): tanque cilíndrico com teto em domo e a gaiola de colunas-guia */
function gasHolderCv() {
  const cv = new Cv(80, 80), GP = ['#c3d0c8', '#93a89d', '#6c8279', '#4b5b54'];
  cylV(cv, 6, 73, 20, 72, GP);
  for (let y = 8; y < 22; y++) { const w = 34 * Math.sqrt(Math.max(0, 1 - ((22 - y) / 14) ** 2)); for (let x = Math.round(39.5 - w); x <= Math.round(39.5 + w); x++) cv.set(x, y, shade4((x - (39.5 - w)) / Math.max(1, 2 * w), GP)); }
  for (const y of [32, 44, 56, 68]) for (let x = 6; x <= 73; x++) cv.set(x, y, '#3e4b45');
  for (const x of [4, 22, 39, 57, 74]) { cv.rect(x, 12, 2, 61, IP.st3); cv.rect(x, 12, 1, 61, IP.st1); }
  for (let k = 0; k < 4; k++) { const x0 = [5, 23, 40, 58][k]; cv.line(x0, 14, x0 + 16, 30, IP.st3); cv.line(x0 + 16, 14, x0, 30, IP.st3); }
  cv.rect(2, 12, 76, 2, IP.st3); cv.rect(2, 12, 76, 1, IP.st1);
  for (let y = 22; y < 72; y++) { cv.set(64, y, IP.st3); if (y % 3 === 0) cv.set(65, y, IP.st3); cv.set(66, y, IP.st3); }
  for (let y = 73; y < 80; y++) for (let x = 2; x <= 77; x++) cv.set(x, y, y === 73 ? '#d6d0c2' : y > 77 ? '#7d776c' : '#b7b0a2');
  cv.set(39, 7, '#ff5a3c');
  cv.outline();
  return cv;
}
/** torre de carvão (4×6): caixa de chapa no alto com janelas, pernas de concreto e a boca da esteira embaixo */
function coalTowerCv() {
  const cv = new Cv(64, 96);
  for (const x0 of [4, 50]) { cylV(cv, x0, x0 + 9, 60, 95, ['#d6d0c2', '#b7b0a2', '#9d9584', '#7d776c']); }
  cv.rect(14, 62, 36, 6, '#9d9584'); cv.rect(14, 62, 36, 1, '#d6d0c2');
  for (let y = 10; y < 62; y++) for (let x = 2; x <= 61; x++) cv.set(x, y, ['#b4bec5', '#9aa6ae', '#7f8c95', '#6a7780'][x & 3]);
  cv.rect(0, 6, 64, 5, IP.st3); cv.rect(0, 6, 64, 1, IP.st1); cv.rect(26, 0, 12, 6, IP.st2); cv.rect(26, 0, 12, 1, IP.st0);
  for (const x of [8, 22, 36, 50]) { cv.rect(x, 18, 6, 8, '#2b3d52'); cv.set(x + 1, 19, '#7d9ab8'); cv.rect(x, 18, 6, 1, IP.st3); }
  for (let x = 2; x <= 61; x++) for (let y = 40; y < 46; y++) cv.set(x, y, ((x + y) >> 2) & 1 ? IP.blk : IP.yel);
  // calha da esteira entrando por baixo (lx 1..2 da torre = colunas da esteira)
  cv.rect(17, 68, 30, 28, IP.rub2); cv.rect(17, 68, 30, 2, IP.st2); for (let y = 72; y < 96; y += 4) cv.rect(19, y, 26, 1, IP.rub0);
  cv.outline();
  cv.set(31, 1, '#ff5a3c'); cv.glow(31, 1, 3, '#ff6a4a', 60);
  return cv;
}
function anvilCv() {
  const cv = new Cv();
  cv.rect(5, 10, 6, 5, '#7b473c'); cv.rect(5, 10, 6, 1, '#965746');
  cv.rect(3, 5, 10, 3, IP.st3); cv.rect(3, 5, 10, 1, IP.st1); cv.rect(1, 5, 3, 2, IP.st3); cv.rect(6, 8, 4, 2, IP.st4);
  cv.outline();
  cv.rect(6, 4, 4, 1, IP.fire2); cv.set(7, 4, IP.fire3); cv.glow(8, 4, 4, '#ff8a3c', 70);
  return cv;
}

export function createSteel(L) {
  const T = {};
  const ts = L.ts;
  const sheet = (key, cv, wt, ht, props) => sheetC(L, 'aco_' + key, cv, wt, ht, props);
  const FLOOR = { speed: 90, terrain: 'floor' };
  /** gusa / escória (blob de 47): gid do tile Lemon recolorido para a máscara do vizinho (`blobMask`) */
  T.liquid = (kind, blobCell) => L.overlay(ts.gid('W', blobCell[0] + 13, blobCell[1] - 1), 'aco_' + kind, 0, recolorLiquid(kind));
  T.gusa = (blobCell) => T.liquid('gusa', blobCell);
  T.slag = (blobCell) => T.liquid('escoria', blobCell);
  T.blastFurnace = memo(() => sheet('altoforno', blastFurnaceCv(), 6, 9));
  T.stove = memo(() => sheet('regenerador', stoveCv(), 2, 6));
  T.converter = memo(() => sheet('convertedor', converterCv(), 4, 4));
  T.torpedoCv = torpedoCv;
  T.ladle = memo(() => sheet('panela', ladleCv(), 2, 2));
  T.crane = (part) => L.tile('aco_ponte_' + part, () => craneCv(part));
  T.rollerTable = (part, hot) => L.tile(`aco_rolos_${part}${hot ? '_q' : ''}`, () => rollerCv(part, hot));
  T.millStand = memo(() => sheet('laminador', millStandCv(), 3, 3));
  T.coil = () => L.tile('aco_bobina', coilCv);
  T.slabPile = memo(() => sheet('placas', slabPileCv(), 2, 1));
  T.orePile = memo((kind, seed = 1) => sheet('pilha_' + kind, orePileCv(kind, seed), 3, 2));
  T.cokeOven = memo((kind) => sheet('coqueria', cokeOvenCv(kind), 1, 5));
  T.quenchTower = memo(() => sheet('apagamento', quenchTowerCv(), 3, 5));
  T.chimney = memo(() => sheet('chamine', chimneyCv(), 2, 6));
  T.silo = memo(() => sheet('silo', siloCv(), 3, 3));
  T.controlDesk = memo(() => sheet('mesa', controlDeskCv(), 3, 1));
  T.hatch = () => L.tile('aco_escotilha', hatchCv, FLOOR);
  T.scrap = (v) => L.tile('aco_sucata' + v, () => scrapCv(v));
  T.catwalk = (rails) => L.tile('aco_passarela_' + rails, () => catwalkCv(rails), FLOOR);
  T.gallery = memo((part) => sheet('galeria', galleryCv(part), 1, 2));
  T.embeddedRail = (part) => L.tile('aco_trilho_' + part, () => embeddedRailCv(part), FLOOR);
  T.caster = memo(() => sheet('lingotamento', casterCv(), 7, 6));
  T.windrow = memo((kind, len) => sheet('leira_' + kind, windrowCv(kind, len), len, 3));
  T.gasHolder = memo(() => sheet('gasometro', gasHolderCv(), 5, 5));
  T.coalTower = memo(() => sheet('torre_carvao', coalTowerCv(), 4, 6));
  T.anvil = () => L.tile('aco_bigorna', anvilCv);
  return T;
}

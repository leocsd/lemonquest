// Arte de chão de fábrica (`L.industry()`) e da Siderúrgica (`L.steel()`), ciclo 19 (tools/mapgen/expansion6.mjs), e da
// Montadora (`L.factory()`, ciclo 20, tools/mapgen/expansion7.mjs, no fim do arquivo).
//
// ALOCAÇÃO ADIADA, no molde de `L.rail()` (createRail em lemon.mjs): nada daqui entra no atlas até a primeira chamada de
// `L.industry()`/`L.steel()` (expansion6) ou `L.factory()` (expansion7), as duas últimas etapas do gerador. Como o TilesetLemon acrescenta tile no
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

// ===================================================================== Montadora (ciclo 20)
// `L.factory()` (tools/mapgen/expansion7.mjs): mesma alocação adiada, chamada pela primeira vez só na expansion7 (depois
// da expansion6, que aloca `L.industry()`/`L.steel()`). Chaves `fab_`; folhas e peças desenhadas chaveadas pelo conteúdo.
// Só fantasia: carros genéricos "bolinha" vistos de cima, sem logotipo, letreiro nem desenho que imite carro real.
const FP = {
  limao: ['#f8ec6a', '#f2e14a', '#d8b62a', '#a8861e'],
  vermelho: ['#ef7a5a', '#d14b34', '#a33a28', '#6e1c1c'],
  azul: ['#8fc0f0', '#4a8fd8', '#2f62a8', '#1f3a6e'],
  branco: ['#fbf8ee', '#e4e2da', '#c4c0b4', '#8f8b80'],
  verde: ['#a8d878', '#5fae4f', '#3f7f3a', '#2a5228'],
  primer: ['#bcc1c4', '#9ea4a8', '#80868b', '#5d6267'],
  lona: ['#7d8a96', '#64717d', '#4b5661', '#343c44'],
  laranja: ['#f0a04a', '#d07a28', '#9a5420', '#6a3a18'],
  glass: '#2b3d52', glass2: '#4d6f8f', glassHi: '#9ec4e0', tire: '#25282c', tire2: '#4a4d52', light: '#fff6c0', tail: '#e0394c',
  grass: '#adbc3a', grass2: '#93a33a',
};
const CAR_COLORS = ['limao', 'vermelho', 'azul', 'branco', 'verde'];
const rotCw = (cv) => { const o = new Cv(cv.h, cv.w); for (let y = 0; y < cv.h; y++) for (let x = 0; x < cv.w; x++) { const [r, g, b, a] = cv.get(x, y); if (a) o.set(cv.h - 1 - y, x, [r, g, b], a); } return o; };
const flipX = (cv) => { const o = new Cv(cv.w, cv.h); for (let y = 0; y < cv.h; y++) for (let x = 0; x < cv.w; x++) { const [r, g, b, a] = cv.get(x, y); if (a) o.set(cv.w - 1 - x, y, [r, g, b], a); } return o; };
const inRound = (x, y, x0, y0, x1, y1, r) => { if (x < x0 || x > x1 || y < y0 || y > y1) return false; const dx = Math.max(0, x0 + r - x, x - (x1 - r)), dy = Math.max(0, y0 + r - y, y - (y1 - r)); return dx * dx + dy * dy <= r * r + 0.5; };
const wheelAt = (cv, x, y, r = 4) => { cv.ell(x, y, r, r, FP.tire); cv.ell(x, y, r * 0.45, r * 0.45, '#8d99a2'); cv.set(x - 1, y - 1, IP.st0); };

/** carro visto de cima, 2×3 (32×48), frente para o norte; kind 'car' | 'primer' (carroceria crua presa no gabarito) */
function carTopCv(kind, color = 'limao') {
  const cv = new Cv(32, 48), p = kind === 'primer' ? FP.primer : FP[color], x0 = 5, x1 = 26, y0 = 3, y1 = 44;
  if (kind === 'primer') { // gabarito: duas travessas de aço com grampos amarelos por baixo da carroceria
    for (const y of [9, 34]) { cv.rect(1, y, 30, 4, IP.st2); cv.rect(1, y, 30, 1, IP.st0); cv.rect(1, y + 3, 30, 1, IP.st3); for (const x of [1, 28]) { cv.rect(x, y - 1, 3, 6, IP.yel); cv.rect(x, y - 1, 3, 1, '#f2d870'); } }
  } else for (const wy of [8, 33]) for (const wx of [x0 - 2, x1]) { cv.rect(wx, wy, 3, 8, FP.tire); cv.rect(wx + 1, wy + 1, 1, 6, FP.tire2); }
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (inRound(x, y, x0, y0, x1, y1, 6)) { const t = (x - x0) / (x1 - x0); cv.set(x, y, t < 0.14 ? p[0] : t > 0.86 ? p[2] : p[1]); }
  const win = kind === 'primer' ? '#3a3f45' : FP.glass, win2 = kind === 'primer' ? '#2e3236' : FP.glass2;
  for (let y = 6; y <= 11; y++) { cv.set(x0 + 6, y, p[2]); cv.set(x1 - 6, y, p[2]); } // vincos do capô
  for (let y = 12; y <= 18; y++) { const ins = 3 + Math.round((18 - y) * 0.45); cv.rect(x0 + ins, y, x1 - x0 + 1 - 2 * ins, 1, y === 12 ? p[2] : y < 15 ? win2 : win); }
  cv.rect(x0 + 3, 19, x1 - x0 - 5, 12, p[0]); cv.rect(x0 + 4, 20, x1 - x0 - 7, 10, p[1]); cv.rect(x0 + 5, 21, 3, 7, p[0]); // teto
  for (let y = 19; y <= 30; y++) { cv.set(x0 + 1, y, win); cv.set(x0 + 2, y, win2); cv.set(x1 - 2, y, win); cv.set(x1 - 1, y, win); }
  cv.rect(x0 + 1, 25, 2, 1, p[2]); cv.rect(x1 - 2, 25, 2, 1, p[2]);
  for (let y = 31; y <= 35; y++) { const ins = 4 + Math.round((y - 31) * 0.5); cv.rect(x0 + ins, y, x1 - x0 + 1 - 2 * ins, 1, y === 35 ? p[2] : win); }
  for (let y = 38; y <= 42; y++) { cv.set(x0 + 6, y, p[2]); cv.set(x1 - 6, y, p[2]); } // tampa do porta-malas
  if (kind === 'car') {
    cv.rect(x0 + 2, y0 + 1, 3, 2, FP.light); cv.rect(x1 - 4, y0 + 1, 3, 2, FP.light);
    cv.rect(x0 + 2, y1 - 1, 3, 1, FP.tail); cv.rect(x1 - 4, y1 - 1, 3, 1, FP.tail);
    cv.set(x0 - 1, 17, p[2]); cv.set(x1 + 1, 17, p[2]); cv.set(x0 + 7, 15, FP.glassHi); cv.set(x0 + 8, 14, FP.glassHi);
  }
  return cv.outline();
}
/** protótipo coberto por lona (2×3): volume de carro sob o pano, dobras, cordas e uma etiqueta amarelo-limão */
function tarpCarCv() {
  const cv = new Cv(32, 48), p = FP.lona, x0 = 3, x1 = 28, y0 = 2, y1 = 45;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (!inRound(x, y, x0, y0, x1, y1, 8)) continue;
    let c = Math.abs(x - 15.5) < 6.5 && y > 14 && y < 34 ? p[0] : p[1];
    if (((x * 3 + y * 2) % 13) < 2) c = p[2];
    if (x - x0 < 2 || x1 - x < 2 || y1 - y < 2) c = p[2];
    cv.set(x, y, c);
  }
  for (const y of [12, 36]) for (let x = x0; x <= x1; x++) if (cv.get(x, y)[3]) cv.set(x, y, '#c9a87a');
  cv.rect(18, 38, 4, 3, FP.limao[1]); cv.set(19, 39, FP.limao[3]);
  return cv.outline();
}
/** carro de perfil (26×11) com a base em yb, frente para a direita (decks da cegonha) */
function sideCar(cv, x, yb, p) {
  for (let y = yb - 11; y <= yb - 6; y++) for (let xx = x + 6; xx <= x + 19; xx++) if (inRound(xx, y, x + 6, yb - 11, x + 19, yb - 4, 4)) cv.set(xx, y, p[1]);
  cv.rect(x + 8, yb - 10, 4, 3, FP.glass); cv.rect(x + 13, yb - 10, 5, 3, FP.glass); cv.set(x + 14, yb - 10, FP.glassHi);
  for (let y = yb - 6; y <= yb - 2; y++) for (let xx = x; xx <= x + 25; xx++) if (inRound(xx, y, x, yb - 6, x + 25, yb - 2, 2)) cv.set(xx, y, y === yb - 6 ? p[0] : y === yb - 2 ? p[2] : p[1]);
  cv.set(x + 25, yb - 5, FP.light); cv.set(x, yb - 5, FP.tail);
  for (const wx of [x + 5, x + 20]) { cv.ell(wx, yb - 1.5, 2.6, 2.6, FP.tire); cv.set(wx, yb - 2, '#8d99a2'); }
}
/** cegonha 8×3 (128×48), de perfil: carreta de dois andares com três carros limão em cada, cavalo branco à direita */
function carrierCv() {
  const cv = new Cv(128, 48), lim = FP.limao, cab = FP.branco;
  cv.rect(1, 37, 101, 3, '#3d3a3c'); cv.rect(1, 37, 101, 1, '#5d585c');
  cv.rect(1, 33, 99, 3, IP.st2); cv.rect(1, 33, 99, 1, IP.st0); cv.rect(3, 18, 95, 3, IP.st2); cv.rect(3, 18, 95, 1, IP.st0);
  for (const x of [2, 33, 64, 96]) { cv.rect(x, 7, 2, 27, IP.st3); cv.rect(x, 7, 1, 27, IP.st1); }
  for (const x of [5, 36, 67]) { sideCar(cv, x, 33, lim); sideCar(cv, x, 18, lim); }
  for (let y = 12; y <= 37; y++) for (let x = 103; x <= 126; x++) if (inRound(x, y, 103, 12, 126, 37, 3)) cv.set(x, y, x < 106 ? cab[0] : x > 123 ? cab[2] : cab[1]);
  cv.rect(117, 15, 8, 9, FP.glass); cv.rect(118, 16, 2, 3, FP.glass2); cv.set(118, 16, FP.glassHi);
  cv.rect(106, 15, 9, 7, FP.glass); cv.set(107, 16, FP.glassHi);
  cv.rect(103, 26, 24, 3, lim[1]); cv.rect(103, 28, 24, 1, lim[3]);
  cv.rect(115, 24, 1, 12, cab[2]); cv.rect(112, 30, 2, 1, IP.st3);
  cv.rect(123, 31, 4, 3, FP.light); cv.rect(121, 35, 6, 3, IP.st2);
  cv.rect(100, 2, 2, 16, IP.st2); cv.rect(100, 2, 1, 16, IP.st0);
  for (const x of [11, 21, 80, 90, 110, 121]) wheelAt(cv, x, 42);
  return cv.outline();
}
/** caminhão de bobinas 8×3: cabine azul à esquerda e carroceria plana; a linha do meio das colunas 3..7 fica VAZIA porque
 *  as bobinas são o tile `T.coil()` da Siderúrgica, posto por cima tile a tile (expansion7) */
function coilTruckCv() {
  const cv = new Cv(128, 48), cab = FP.azul;
  cv.rect(30, 32, 97, 4, '#7b473c'); cv.rect(30, 32, 97, 1, '#965746'); for (let x = 36; x < 126; x += 10) cv.set(x, 34, '#5a342b');
  cv.rect(30, 36, 97, 2, IP.st3); cv.rect(28, 38, 99, 2, '#3d3a3c');
  cv.rect(30, 17, 4, 15, IP.st2); for (let y = 19; y < 32; y += 3) cv.rect(30, y, 4, 1, IP.st0);
  for (let y = 12; y <= 37; y++) for (let x = 2; x <= 27; x++) if (inRound(x, y, 2, 12, 27, 37, 3)) cv.set(x, y, x < 5 ? cab[0] : x > 24 ? cab[2] : cab[1]);
  cv.rect(3, 15, 8, 9, FP.glass); cv.rect(4, 16, 2, 3, FP.glass2); cv.set(4, 16, FP.glassHi);
  cv.rect(14, 15, 9, 7, FP.glass); cv.set(15, 16, FP.glassHi);
  cv.rect(2, 26, 26, 2, IP.yel); cv.rect(13, 24, 1, 12, cab[3]); cv.rect(16, 30, 2, 1, IP.st3);
  cv.rect(1, 31, 3, 3, FP.light); cv.rect(1, 35, 6, 3, IP.st2);
  cv.rect(28, 3, 2, 15, IP.st2); cv.rect(28, 3, 1, 15, IP.st0);
  for (const x of [10, 22, 84, 96, 110, 121]) wheelAt(cv, x, 42);
  return cv.outline();
}
/** guarita 4×3: telhado plano com beiral amarelo-limão, janelas em volta e a porta à direita */
function guardhouseCv() {
  const cv = new Cv(64, 48);
  cv.rect(1, 2, 62, 12, '#d6d3c4'); cv.rect(1, 2, 62, 2, '#e8e4d8'); for (let x = 1; x < 63; x += 8) cv.rect(x, 4, 1, 10, '#c4c0b4');
  cv.rect(42, 5, 12, 6, IP.st2); cv.rect(42, 5, 12, 1, IP.st0); for (let k = 0; k < 3; k++) cv.rect(44 + k * 3, 7, 2, 3, IP.st3);
  cv.rect(1, 13, 62, 1, FP.limao[0]); cv.rect(1, 14, 62, 3, FP.limao[1]); cv.rect(1, 17, 62, 1, FP.limao[3]);
  cv.rect(3, 18, 58, 27, '#e4e2da'); cv.rect(3, 18, 58, 1, '#c4c0b4');
  for (const x of [6, 20, 34]) { cv.rect(x, 21, 11, 12, IP.st2); cv.rect(x + 1, 22, 9, 10, FP.glass); cv.rect(x + 1, 22, 9, 1, FP.glass2); cv.set(x + 2, 23, FP.glassHi); cv.set(x + 3, 24, FP.glassHi); cv.rect(x, 33, 11, 1, IP.st3); }
  cv.rect(49, 22, 10, 23, IP.st2); cv.rect(50, 23, 8, 22, '#8d99a2'); cv.rect(50, 23, 8, 1, IP.st0); cv.rect(56, 33, 1, 3, IP.st4);
  cv.rect(2, 44, 60, 3, '#9d9584'); cv.rect(2, 44, 60, 1, '#bdb7aa');
  return cv.outline();
}
/** cancela aberta (1×2): pedestal zebrado com contrapeso embaixo, braço vermelho e branco erguido em cima */
function boomGateCv() {
  const cv = new Cv(16, 32);
  for (let y = 2; y < 22; y++) cv.rect(6, y, 3, 1, ((y >> 2) & 1) ? IP.red : IP.white);
  cv.rect(3, 20, 10, 10, IP.yel); for (let y = 20; y < 30; y++) for (let x = 3; x < 13; x++) if (((x + y) >> 2) & 1) cv.set(x, y, IP.blk);
  cv.rect(3, 20, 10, 1, '#f2d870'); cv.rect(2, 29, 12, 2, IP.st3); cv.ell(7.5, 23, 2.4, 2.4, IP.st2); cv.set(7, 22, IP.st0);
  cv.outline(); dropShadow(cv);
  cv.set(7, 1, '#ff5a3c'); cv.glow(7.5, 1.5, 3, '#ff6a4a', 60);
  return cv;
}
/** prensa da Estamparia (3×3): colunas e coroa vermelhas, martelo de aço com a matriz, chapa na mesa, base zebrada */
function pressCv() {
  const cv = new Cv(48, 48), R = FP.vermelho;
  cv.rect(1, 40, 46, 7, '#9d9584'); cv.rect(1, 40, 46, 1, '#d6d0c2');
  cv.rect(4, 33, 40, 6, IP.st2); cv.rect(4, 33, 40, 1, IP.st0);
  for (const x0 of [3, 37]) for (let y = 6; y < 40; y++) for (let x = x0; x < x0 + 8; x++) cv.set(x, y, shade4((x - x0) / 7, R));
  for (let y = 1; y < 12; y++) for (let x = 2; x < 46; x++) cv.set(x, y, y < 3 ? R[0] : y > 9 ? R[3] : R[1]);
  cv.rect(2, 5, 44, 1, R[2]); for (const x of [8, 39]) cv.rect(x, 2, 2, 3, IP.st3);
  cv.rect(12, 12, 24, 12, IP.st1); cv.rect(12, 12, 24, 1, IP.st0); cv.rect(12, 23, 24, 1, IP.st3); for (const x of [16, 31]) cv.rect(x, 14, 1, 8, IP.st2);
  cv.rect(14, 24, 20, 3, IP.st3); cv.rect(10, 30, 28, 3, '#c3ccd2'); cv.rect(10, 30, 28, 1, '#e4e8ea');
  for (let x = 4; x < 44; x++) for (let y = 37; y < 39; y++) cv.set(x, y, ((x + y) >> 1) & 1 ? IP.blk : IP.yel);
  cv.outline();
  cv.set(24, 3, '#ffd040'); cv.set(23, 3, '#ffd040'); cv.glow(24, 3, 3, '#ffd040', 60);
  return cv;
}
/** braço robótico (2×2): base giratória embaixo à esquerda, braço laranja e a tocha de solda com uma faísca */
function robotArmCv() {
  const cv = new Cv(32, 32), O = FP.laranja;
  const seg = (ax, ay, bx, by, w) => { const n = Math.ceil(Math.hypot(bx - ax, by - ay)); for (let k = 0; k <= n; k++) { const t = k / n; cv.ell(ax + (bx - ax) * t, ay + (by - ay) * t, w, w, O[1]); } for (let k = 0; k <= n; k++) { const t = k / n; cv.ell(ax + (bx - ax) * t - 0.6, ay + (by - ay) * t - 0.6, w * 0.45, w * 0.45, O[0]); } };
  cv.ell(9, 28, 7.5, 3, IP.st3); cylV(cv, 4, 14, 19, 28, O);
  cv.rect(4, 19, 11, 2, O[0]);
  seg(9, 18, 12, 6, 3.2); seg(12, 6, 24, 10, 2.5);
  for (const [x, y, r] of [[9, 18, 3.4], [12, 6, 3], [24, 10, 2.3]]) { cv.ell(x, y, r, r, IP.st2); cv.ell(x - 0.5, y - 0.5, r * 0.5, r * 0.5, IP.st0); }
  cv.line(24, 11, 27, 17, IP.st3); cv.line(25, 11, 28, 17, IP.st1);
  cv.line(5, 22, 7, 12, O[3]);
  cv.outline(); dropShadow(cv);
  cv.set(28, 18, '#ffe9a0'); cv.set(29, 19, '#ffad5d'); cv.glow(28.5, 18.5, 4, '#ffb050', 80);
  return cv;
}
/** divisória de vidro das cabines de pintura (como a cerca de tela): m = vizinhos que também são vidro */
function glassWallCv(m) {
  const cv = new Cv();
  const horiz = m.e || m.w || !(m.n || m.s);
  if (horiz) {
    const x0 = m.w ? 0 : 5, x1 = m.e ? 15 : 10;
    for (let x = x0; x <= x1; x++) {
      cv.set(x, 1, OL); cv.set(x, 2, '#a7b2b9'); cv.set(x, 3, '#5d6870');
      for (let y = 4; y <= 12; y++) cv.set(x, y, ((x + y * 2) % 11) < 2 ? FP.glassHi : y < 8 ? '#9cc2da' : '#7fa9c8', 215);
      cv.set(x, 13, '#5d6870'); cv.set(x, 14, '#3a434a'); cv.set(x, 15, OL, 90);
      if (((x % 8) + 8) % 8 === 7) for (let y = 4; y <= 12; y++) cv.set(x, y, '#5d6870');
    }
    if (!m.w) for (let y = 1; y <= 14; y++) cv.set(x0, y, OL);
    if (!m.e) for (let y = 1; y <= 14; y++) cv.set(x1, y, OL);
  }
  if (m.n || m.s) {
    const y0 = m.n ? 0 : 3, y1 = m.s ? 15 : 13;
    for (let y = y0; y <= y1; y++) { cv.set(5, y, OL); cv.set(6, y, '#7c8790'); cv.set(7, y, '#9cc2da', 220); cv.set(8, y, '#7fa9c8', 220); cv.set(9, y, '#5d6870'); cv.set(10, y, OL); }
  }
  return cv;
}
/** respingo de tinta (decalque) numa das 5 cores */
function splatCv(color) {
  const p = FP[color], cv = new Cv(), r = mulberry32(900 + CAR_COLORS.indexOf(color) * 37);
  const blobs = [[7.5 + r() * 2, 7.5 + r() * 2, 4.2, 3]]; for (let k = 0; k < 4; k++) blobs.push([2.5 + r() * 11, 2.5 + r() * 11, 0.8 + r() * 1.6, 0.8 + r() * 1.2]);
  for (const [x, y, rx, ry] of blobs) cv.ell(x, y, rx, ry, p[2], 230);
  for (const [x, y, rx, ry] of blobs) cv.ell(x - 0.4, y - 0.4, rx * 0.72, ry * 0.72, p[1], 235);
  cv.set(Math.round(blobs[0][0]) - 1, Math.round(blobs[0][1]) - 1, p[0]);
  return cv;
}
/** grelha quente da Estufa (chão): barras de aço deitadas, suportes a cada 8 px e o brilho alaranjado nas fendas */
function grateCv(v) {
  const cv = new Cv();
  for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
    let c = i % 8 === 0 ? '#6b7680' : j % 4 === 0 ? '#5d6870' : j % 4 === 3 ? '#3a434a' : null;
    if (!c) { const h = hashf(i >> 3, (j >> 2) + v * 4, 1610); c = j % 4 === 1 ? (h < 0.5 ? '#ff8a3c' : '#e66a3a') : h < 0.5 ? '#c0502a' : '#8a3a20'; }
    cv.set(i, j, c);
  }
  return cv;
}
/** porta de forno da Estufa (2×2), na parede: aço rebitado, visor com fogo, puxador, base zebrada */
function ovenDoorCv() {
  const cv = new Cv(32, 32);
  cv.rect(1, 1, 30, 30, IP.st3); cv.rect(3, 3, 26, 26, IP.st2); cv.rect(3, 3, 26, 1, IP.st0); cv.rect(3, 3, 1, 26, IP.st1);
  for (const x of [5, 26]) for (const y of [5, 12, 19]) cv.set(x, y, IP.st0);
  cv.rect(9, 7, 14, 9, '#2a2224'); cv.rect(10, 8, 12, 7, IP.fire1); cv.rect(11, 9, 10, 4, IP.fire2); cv.rect(13, 10, 6, 1, IP.fire3);
  cv.rect(23, 18, 5, 2, IP.st0); cv.rect(23, 20, 5, 1, IP.st4);
  for (let y = 24; y < 29; y++) for (let x = 3; x < 29; x++) cv.set(x, y, ((x + y) >> 1) & 1 ? IP.blk : IP.yel);
  cv.outline(); cv.glow(16, 11, 11, '#ff8a3c', 55);
  return cv;
}
/** piso molhado do Lava-Rápido: azulejo azulado com rejunte e o brilho da água; v 2 tem uma poça */
function wetFloorCv(v) {
  const cv = new Cv();
  for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
    const grout = (i & 7) === 7 || (j & 7) === 7;
    let c = grout ? '#7d8c96' : hashf(i >> 3, j >> 3, 990 + v) < 0.3 ? '#9fb0ba' : '#aebfc8';
    if (!grout && ((i + j * 2 + v * 5) % 23) < 2) c = '#d8eef8';
    cv.set(i, j, c);
  }
  if (v === 2) { ellOver(cv, 8.5, 9, 5.5, 3, '#5f9ccc', 80); ellOver(cv, 7, 8, 2, 1, '#e8f6ff', 120); }
  return cv;
}
/** ralo no piso molhado */
function drainCv() {
  const cv = wetFloorCv(0);
  cv.rect(3, 3, 10, 10, '#5d6870'); cv.rect(4, 4, 8, 8, '#1e2326'); for (let x = 5; x < 12; x += 2) cv.rect(x, 4, 1, 8, '#7c8790');
  cv.rect(3, 3, 10, 1, '#a7b2b9');
  return cv;
}
/** espuma (decalque): bolhas brancas e azul-claras; v 3 é a espuma cheia da "piscina" do Sapão */
function foamCv(v) {
  const cv = new Cv(), r = mulberry32(1200 + v * 31);
  if (v === 3) for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) cv.set(i, j, hashf(i >> 1, j >> 1, 1250) < 0.4 ? '#d9f0ff' : '#eaf7ff', 235);
  const n = v === 3 ? 10 : 4 + v * 2;
  for (let k = 0; k < n; k++) { const x = 2 + r() * 12, y = 2 + r() * 12, rr = 1.4 + r() * 2.4; cv.ell(x, y, rr, rr, '#9fd4f4', 235); cv.ell(x - 0.3, y - 0.3, rr - 0.7, rr - 0.7, '#f4fbff', 245); cv.set(x - rr * 0.4, y - rr * 0.4, '#ffffff'); }
  return cv;
}
/** rolo de lavagem (1×2): escova azul em pé, presa no suporte de cima */
function washRollerCv() {
  const cv = new Cv(16, 32), B = FP.azul;
  cv.rect(1, 0, 14, 3, IP.st2); cv.rect(1, 0, 14, 1, IP.st0); cv.rect(7, 2, 2, 2, IP.st3);
  for (let y = 4; y < 28; y++) for (let x = 2; x < 14; x++) { let c = shade4((x - 2) / 11, B); if ((y + (x >> 1)) % 4 === 0) c = B[3]; cv.set(x, y, c); }
  for (let y = 4; y < 28; y += 2) { cv.set(1, y, B[1]); cv.set(14, y + 1, B[2]); }
  cv.rect(4, 28, 8, 3, IP.st3);
  cv.outline(); dropShadow(cv);
  return cv;
}
// pista oval (zebrado desenhado por pixel ao longo das duas elipses). A geometria é simétrica nos dois eixos e o asfalto e a
// grama da borda também (textura espelhada no tile), então os quatro quadrantes saem com os MESMOS tiles (chave por conteúdo).
const TRACK = { a1: 35, b1: 11, a2: 27, b2: 6, kerb: 4.5, stripe: 7, N: 1024 };
const arcTable = (a, b) => {
  const { N } = TRACK, s = new Float64Array(N + 1), dt = Math.PI / 2 / N;
  for (let k = N - 1; k >= 0; k--) { const t = (k + 0.5) * dt; s[k] = s[k + 1] + Math.hypot(a * Math.sin(t), b * Math.cos(t)) * dt * 16; }
  return s;
};
let trackArcs = null;
const symAsphalt = (i, j) => {
  const ia = Math.min(i, 15 - i), ja = Math.min(j, 15 - j), h = hashf(ia, ja, 820), h2 = hashf(ia >> 1, ja >> 1, 850);
  let c = h2 < 0.25 ? IP.as2 : IP.as1;
  if (h < 0.05) c = IP.as0; else if (h > 0.975) c = IP.as3;
  return c;
};
/** tile (dx, dy) relativo ao tile do centro do oval; finish = coluna da linha de chegada (reta sul). null = só grama. */
function trackCv(dx, dy, finish) {
  trackArcs ??= [arcTable(TRACK.a1, TRACK.b1), arcTable(TRACK.a2, TRACK.b2)];
  const { a1, b1, a2, b2, kerb, stripe, N } = TRACK, cv = new Cv();
  let road = false;
  for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
    const u = dx + (i + 0.5 - 8) / 16, v = dy + (j + 0.5 - 8) / 16;
    const e1 = (u / a1) ** 2 + (v / b1) ** 2, e2 = (u / a2) ** 2 + (v / b2) ** 2;
    const g1 = 2 * Math.hypot(u / a1 ** 2, v / b1 ** 2), g2 = 2 * Math.hypot(u / a2 ** 2, v / b2 ** 2);
    const d1 = ((1 - e1) / g1) * 16, d2 = ((e2 - 1) / g2) * 16; // px até a borda externa / interna (positivo = no asfalto)
    if (d1 < 0 || d2 < 0) { cv.set(i, j, (d1 < 0 ? -d1 : -d2) < 1.2 ? FP.grass2 : FP.grass); continue; }
    road = true;
    if (d1 < kerb || d2 < kerb) {
      const outer = d1 < d2, a = outer ? a1 : a2, b = outer ? b1 : b2, d = outer ? d1 : d2;
      const t = Math.atan2(Math.abs(v) / b, Math.abs(u) / a), s = trackArcs[outer ? 0 : 1][Math.round((t / (Math.PI / 2)) * N)];
      const white = Math.floor(s / stripe) & 1;
      cv.set(i, j, d < 0.9 ? (white ? '#b8b2a6' : '#8a1c24') : white ? '#f2eaf1' : '#d14b34');
      continue;
    }
    cv.set(i, j, finish && i >= 4 && i <= 11 ? (((i >> 2) + (j >> 2)) & 1 ? '#f2eaf1' : '#25282c') : symAsphalt(i, j));
  }
  return road ? cv : null;
}
/** semáforo de largada (1×2): poste e caixa com três luzes vermelhas acesas e três verdes apagadas */
function startLightCv() {
  const cv = new Cv(16, 32);
  cv.rect(7, 13, 2, 17, IP.st2); cv.rect(7, 13, 1, 17, IP.st0); cv.rect(5, 29, 6, 2, IP.st3);
  cv.rect(1, 1, 14, 12, '#25282c'); cv.rect(1, 1, 14, 1, '#4a5158');
  for (const x of [4, 8, 12]) { cv.ell(x, 4.5, 1.6, 1.6, '#ff5a3c'); cv.ell(x, 9.5, 1.6, 1.6, '#1f4a2a'); }
  cv.outline();
  for (const x of [4, 8, 12]) cv.glow(x, 4.5, 4, '#ff6a4a', 50);
  return cv;
}
/** pilha de pneus (1×1), a do meio pintada de vermelho e branco como as barreiras de pista */
function tireStackCv() {
  const cv = new Cv();
  for (let k = 0; k < 3; k++) {
    const yc = 12 - k * 3.6;
    for (let x = 2; x <= 13; x++) for (let y = Math.round(yc - 1); y <= Math.round(yc + 1.5); y++) cv.set(x, y, k === 1 ? (((x >> 1) & 1) ? IP.red : IP.white) : '#2b2b31');
    cv.ell(7.5, yc - 1.5, 6, 2.2, '#3c3c44');
  }
  cv.ell(7.5, 3.3, 2.6, 0.9, '#15171a');
  cv.outline(); dropShadow(cv);
  return cv;
}
function coneCv() {
  const cv = new Cv();
  cv.rect(3, 13, 10, 2, '#d0602a');
  for (let y = 3; y < 13; y++) { const w = 1 + (y - 3) * 0.42; cv.rect(Math.round(7.5 - w), y, Math.max(1, Math.round(2 * w)), 1, y >= 7 && y <= 8 ? IP.white : '#f0802a'); }
  cv.outline(); dropShadow(cv);
  return cv;
}
/** boxes da pista (17×6): laje com caixas de ar, beiral limão e quatro portas de enrolar (a segunda meio aberta, com um
 *  carro limão lá dentro). Tudo repete a cada 64 px: o miolo do prédio sai poucas vezes no atlas. */
function pitBoxesCv() {
  const W = 272, cv = new Cv(W, 96);
  for (let y = 2; y < 42; y++) for (let x = 1; x < W - 1; x++) cv.set(x, y, y % 8 === 0 ? '#bdb7aa' : '#d3cdbf');
  cv.rect(1, 2, W - 2, 3, '#e6e1d4');
  for (let x0 = 24; x0 < W - 16; x0 += 64) { cv.rect(x0, 14, 16, 12, IP.st2); cv.rect(x0, 14, 16, 2, IP.st0); for (let k = 0; k < 4; k++) cv.rect(x0 + 2 + k * 4, 18, 2, 6, IP.st3); }
  cv.rect(1, 42, W - 2, 5, FP.limao[1]); cv.rect(1, 42, W - 2, 1, FP.limao[0]); cv.rect(1, 46, W - 2, 1, FP.limao[3]);
  for (let y = 47; y < 93; y++) for (let x = 1; x < W - 1; x++) cv.set(x, y, '#e4e2da');
  for (let k = 0; k < 4; k++) {
    const x0 = 16 + k * 64, open = k === 1;
    cv.rect(x0, 49, 48, 4, IP.st3); cv.rect(x0, 49, 48, 1, IP.st1);
    for (let y = 53; y < 93; y++) for (let x = x0 + 2; x < x0 + 46; x++) cv.set(x, y, open && y > 70 ? '#2a2629' : (y - 53) % 3 === 0 ? '#7d8790' : (y - 53) % 3 === 1 ? '#a3adb5' : '#93a0aa');
    if (open) { // frente do carro limão no escuro
      for (let y = 78; y < 93; y++) for (let x = x0 + 9; x <= x0 + 36; x++) if (inRound(x, y, x0 + 9, 78, x0 + 36, 98, 6)) cv.set(x, y, y < 82 ? FP.limao[0] : FP.limao[2]);
      cv.rect(x0 + 13, 79, 20, 3, FP.glass); cv.rect(x0 + 11, 86, 4, 2, FP.light); cv.rect(x0 + 31, 86, 4, 2, FP.light); cv.rect(x0 + 18, 88, 10, 2, '#3a3f45');
    }
    cv.rect(x0, 49, 2, 44, IP.st2); cv.rect(x0 + 46, 49, 2, 44, IP.st2);
  }
  for (let x = 8; x < W; x += 64) { cv.rect(x - 2, 52, 4, 3, '#4a5158'); cv.rect(x - 1, 55, 2, 1, '#fff2c0'); }
  cv.rect(1, 93, W - 2, 2, '#9d9584');
  cv.outline();
  for (let x = 8; x < W; x += 64) cv.glow(x, 56, 6, '#fff2c0', 45);
  return cv;
}
/** prédio da rampa do subsolo (5×3): laje com borda zebrada, fachada de concreto e a boca escura da rampa na coluna 1 */
function rampHouseCv() {
  const cv = new Cv(80, 48);
  for (let y = 1; y < 13; y++) for (let x = 1; x < 79; x++) cv.set(x, y, y % 6 === 0 ? '#bdb7aa' : '#d3cdbf');
  for (let x = 1; x < 79; x++) for (let y = 13; y < 16; y++) cv.set(x, y, ((x + y) >> 2) & 1 ? IP.blk : IP.yel);
  for (let y = 16; y < 47; y++) for (let x = 1; x < 79; x++) cv.set(x, y, hashf(x >> 2, y >> 2, 1400) < 0.2 ? '#aca699' : '#bdb7aa');
  for (let y = 23; y < 48; y++) for (let x = 8; x < 40; x++) { const d = (y - 23) / 25; cv.set(x, y, (y - 23) % 5 === 4 ? '#4a4447' : d < 0.35 ? '#141214' : d < 0.7 ? '#221f22' : '#2e2a2d'); }
  for (let x = 6; x < 42; x++) for (let y = 18; y < 22; y++) cv.set(x, y, ((x - y) >> 2) & 1 ? IP.blk : IP.yel);
  for (const x of [6, 40]) cv.rect(x, 22, 2, 26, IP.st2);
  cv.rect(52, 24, 18, 12, IP.st2); cv.rect(53, 25, 16, 10, '#25282c'); for (let k = 0; k < 3; k++) cv.rect(56 + k * 4, 28, 2, 4, FP.limao[1]); // placa com setas para baixo, sem texto
  cv.outline();
  cv.set(46, 20, '#ffd040'); cv.glow(46, 20, 4, '#ffd040', 60);
  return cv;
}
function sheetStackCv() {
  const cv = new Cv(32, 16);
  cv.rect(2, 12, 28, 3, '#9a6a44'); for (const x of [3, 15, 27]) cv.rect(x, 12, 2, 3, '#7b4f33');
  for (let k = 0; k < 4; k++) { const y = 10 - k * 2, x = 3 + (k & 1); cv.rect(x, y, 26, 2, k & 1 ? IP.st1 : IP.st0); cv.rect(x, y + 1, 26, 1, IP.st2); }
  cv.outline(); dropShadow(cv);
  return cv;
}
function palletCv() {
  const cv = new Cv();
  for (let k = 0; k < 4; k++) { cv.rect(2, 3 + k * 3, 12, 2, '#b98a5c'); cv.rect(2, 3 + k * 3, 12, 1, '#d2a874'); }
  for (const x of [3, 7, 11]) cv.rect(x, 3, 2, 11, '#7b4f33');
  for (let k = 0; k < 4; k++) cv.rect(2, 3 + k * 3, 12, 1, '#d2a874');
  cv.outline(); dropShadow(cv);
  return cv;
}
/** motor elétrico no chão (1×1): carcaça com aletas, caixa de ligação limão, eixo */
function motorCv() {
  const cv = new Cv();
  for (let y = 5; y < 13; y++) for (let x = 2; x < 12; x++) cv.set(x, y, (x & 1) ? '#5f7f9a' : shade4((y - 5) / 7, ['#9ab4c8', '#7896ae', '#5f7f9a', '#46617a']));
  cv.rect(5, 2, 5, 3, FP.limao[1]); cv.rect(5, 2, 5, 1, FP.limao[0]);
  cv.rect(12, 8, 3, 2, IP.st1); cv.rect(2, 13, 10, 2, IP.st3);
  cv.outline(); dropShadow(cv);
  return cv;
}
/** calota solta no chão (decalque) */
function hubcapCv() {
  const cv = new Cv();
  cv.ell(8, 8.5, 5.5, 4.2, '#8d99a2'); cv.ell(8, 8.2, 4.6, 3.4, '#c3ccd2'); cv.ell(8, 8.2, 1.4, 1.1, '#66737d');
  for (let a = 0; a < 5; a++) { const t = a * Math.PI * 2 / 5; cv.line(8, 8, 8 + Math.cos(t) * 4, 8.2 + Math.sin(t) * 3, '#93a0aa'); }
  cv.set(6, 6, '#f2f6f8'); cv.set(7, 6, '#f2f6f8');
  cv.outline(); dropShadow(cv);
  return cv;
}
/** latas de tinta empilhadas (limão, vermelha e azul) */
function paintCansCv() {
  const cv = new Cv();
  const can = (x, y, p) => { cv.rect(x, y, 6, 6, p[1]); cv.rect(x, y, 2, 6, p[0]); cv.rect(x + 5, y, 1, 6, p[2]); cv.ell(x + 2.5, y, 3, 1.2, IP.st1); cv.rect(x + 1, y + 2, 4, 2, IP.white); };
  can(1, 9, FP.limao); can(8, 9, FP.vermelho); can(4, 3, FP.azul);
  cv.outline(); dropShadow(cv);
  return cv;
}
/** relógio de ponto (1×2): caixa com mostrador no alto e o porta-cartões no pé */
function punchClockCv() {
  const cv = new Cv(16, 32);
  cv.rect(3, 2, 10, 14, '#5d6870'); cv.rect(3, 2, 10, 1, '#a7b2b9'); cv.ell(8, 8, 3.6, 3.6, '#fbf8ee'); cv.line(8, 8, 8, 5, OL); cv.line(8, 8, 10, 9, OL);
  cv.rect(6, 13, 4, 1, '#25282c');
  cv.rect(7, 16, 2, 6, IP.st2); cv.rect(3, 22, 10, 8, '#7b473c'); for (let k = 0; k < 4; k++) cv.rect(4 + k * 2, 23, 1, 6, k & 1 ? '#f2eaf1' : FP.limao[1]);
  cv.rect(2, 30, 12, 1, IP.st3);
  return cv.outline();
}
/** máquina de café (1×2) */
function coffeeMachineCv() {
  const cv = new Cv(16, 32);
  cv.rect(2, 1, 12, 29, '#6e1c1c'); cv.rect(2, 1, 12, 2, '#a33a28'); cv.rect(4, 5, 8, 6, '#25282c'); cv.rect(5, 6, 3, 2, FP.limao[1]); cv.set(9, 7, '#5cf07a');
  cv.rect(4, 14, 8, 9, '#2a2224'); cv.rect(6, 19, 4, 4, '#f2eaf1'); cv.rect(7, 18, 2, 1, '#7b473c');
  for (const y of [25, 27]) cv.rect(4, y, 8, 1, '#a33a28');
  cv.rect(1, 30, 14, 2, IP.st3);
  return cv.outline();
}
/** parede de impacto do Crash Test (vertical): blocos de concreto com faixa zebrada; part 'n' | 'm' | 's' */
function impactWallCv(part) {
  const cv = new Cv();
  for (let j = 0; j < 16; j++) for (let i = 1; i < 15; i++) cv.set(i, j, j % 8 === 7 ? '#8d877b' : i < 3 ? '#d6d0c2' : i > 12 ? '#9d9584' : '#bdb7aa');
  for (let j = 0; j < 16; j++) for (let i = 5; i < 11; i++) cv.set(i, j, ((i + j) >> 2) & 1 ? IP.blk : IP.yel);
  if (part === 'n') { cv.rect(1, 0, 14, 2, '#e6e1d4'); for (let j = 0; j < 2; j++) for (let i = 5; i < 11; i++) cv.set(i, j, '#e6e1d4'); }
  if (part === 's') cv.rect(1, 14, 14, 2, '#6b665c');
  for (let j = 0; j < 16; j++) { cv.set(0, j, OL); cv.set(15, j, OL); }
  if (part === 'n') cv.rect(0, 0, 16, 1, OL);
  return cv;
}
/** plataforma giratória do Salão do Protótipo (5×5) sobre o piso escuro: disco de aço com anel zebrado e o cubo */
function turntableCv(basePx) {
  const cv = new Cv(80, 80), c = 39.5;
  for (let y = 0; y < 80; y++) for (let x = 0; x < 80; x++) {
    const d = Math.hypot(x - c, y - c), a = Math.atan2(y - c, x - c);
    let col;
    if (d > 38) col = basePx(x & 15, y & 15);
    else if (d > 37) col = '#141b1b';
    else if (d > 33.5) col = ((Math.floor((a + Math.PI) / (Math.PI / 16))) & 1) ? '#25282c' : '#e6c23e';
    else if (d > 32.5) col = '#454f57';
    else if (d < 5) col = d < 3 ? '#93a0aa' : '#454f57';
    else { const ring = Math.floor(d / 6) & 1, spoke = Math.abs(((a / (Math.PI / 4)) % 1 + 1) % 1 - 0.5) > 0.47; col = spoke ? '#454f57' : ring ? '#66737d' : '#5d6870'; }
    cv.set(x, y, col);
  }
  return cv;
}
/** pintura no asfalto: 'v' divisória de vaga, 'h' linha deitada, 'hatch' zebrado branco, 'cross' faixa de pedestre */
function lotPaintCv(kind) {
  const cv = asphaltCv({}, null, 0), W = '#ece8dc', W2 = '#d8d3c6';
  for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
    let on = false;
    if (kind === 'v') on = i === 7 || i === 8;
    else if (kind === 'h') on = j === 7 || j === 8;
    else if (kind === 'hatch') on = (((i + j) % 8) + 8) % 8 < 2;
    else if (kind === 'cross') on = (i & 7) >= 1 && (i & 7) <= 4;
    if (on) cv.set(i, j, (i + j) % 5 === 0 ? W2 : W);
  }
  return cv;
}
/** mancha de graxa no chão (decalque) */
function oilStainCv(v) {
  const cv = new Cv(), r = mulberry32(1700 + v * 13);
  ellOver(cv, 7.5 + r() * 1.5, 8 + r() * 1.5, 5 + r() * 1.5, 3 + r(), '#2a2826', 120);
  ellOver(cv, 6 + r() * 3, 7 + r() * 3, 2.2, 1.4, '#1a1918', 110);
  cv.over(9, 6, '#5d6a78', 120); cv.over(10, 6, '#4a5560', 100);
  return cv;
}
/** piso epóxi claro (Cabines de Pintura): v bits = junta à direita / embaixo */
function epoxyCv(v) {
  const cv = new Cv();
  for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
    const h = hashf(i, j, 1500), h2 = hashf(i >> 2, j >> 2, 1530);
    let c = h2 < 0.3 ? '#b4bdb9' : '#bcc5c1';
    if (h < 0.04) c = '#a7b0ac'; else if (h > 0.97) c = '#c9d1cd';
    if ((v & 1) && i === 15) c = '#98a19d';
    if ((v & 2) && j === 15) c = '#98a19d';
    cv.set(i, j, c);
  }
  return cv;
}

export function createFactory(L) {
  const F = { FP, CAR_COLORS };
  const ts = L.ts;
  const sheet = (key, cv, wt, ht, props) => sheetC(L, 'fab_' + key, cv, wt, ht, props);
  const tileC = (pfx, cv, props) => L.tile(contentKey('fab_' + pfx, cv), cv, props);
  const FLOOR = { speed: 90, terrain: 'floor' };
  /** carro limão/vermelho/azul/branco/verde: 'v' 2×3 (frente para o norte) ou 'h' 3×2 (frente para o leste) */
  F.car = memo((color, dir = 'v') => { const cv = carTopCv('car', color); const o = dir === 'h' ? rotCw(cv) : cv; dropShadow(o); return sheet('carro_' + color + dir, o, dir === 'h' ? 3 : 2, dir === 'h' ? 2 : 3); });
  F.primer = memo(() => { const cv = carTopCv('primer'); dropShadow(cv); return sheet('primer', cv, 2, 3); });
  F.tarpCar = memo(() => { const cv = tarpCarCv(); dropShadow(cv); return sheet('lona', cv, 2, 3); });
  F.carrier = memo(() => sheet('cegonha', carrierCv(), 8, 3));
  F.coilTruck = memo(() => sheet('caminhao_bobinas', coilTruckCv(), 8, 3));
  F.guardhouse = memo(() => sheet('guarita', guardhouseCv(), 4, 3));
  F.boomGate = memo(() => sheet('cancela', boomGateCv(), 1, 2));
  F.press = memo(() => sheet('prensa', pressCv(), 3, 3));
  /** braço robótico 2×2; flip = espelhado (ferramenta para a esquerda) */
  F.robotArm = memo((flip = false) => sheet('braco', flip ? flipX(robotArmCv()) : robotArmCv(), 2, 2));
  F.glassWall = (m) => tileC('vidro', glassWallCv(m));
  F.splat = (color) => L.tile('fab_respingo_' + color, () => splatCv(color));
  F.grate = (v = 0) => L.tile('fab_grelha' + v, () => grateCv(v), FLOOR);
  F.ovenDoor = memo(() => sheet('forno', ovenDoorCv(), 2, 2));
  F.wetFloor = (v = 0) => L.tile('fab_molhado' + v, () => wetFloorCv(v), FLOOR);
  F.drain = () => L.tile('fab_ralo', drainCv, FLOOR);
  F.foam = (v = 0) => L.tile('fab_espuma' + v, () => foamCv(v));
  F.washRoller = memo(() => sheet('rolo', washRollerCv(), 1, 2));
  /** chão da pista no tile (dx, dy) relativo ao centro do oval: gid, ou 0 onde é só grama */
  F.track = (dx, dy, finish = false) => { const cv = trackCv(dx, dy, finish); return cv ? tileC('pista', cv, { speed: 85, terrain: 'road' }) : 0; };
  F.grass = () => ts.gid('F', 0, 12);
  F.startLight = memo(() => sheet('semaforo', startLightCv(), 1, 2));
  F.tireStack = () => L.tile('fab_pneus', tireStackCv);
  F.cone = () => L.tile('fab_cone', coneCv);
  F.pitBoxes = memo(() => sheet('boxes', pitBoxesCv(), 17, 6));
  F.rampHouse = memo(() => sheet('rampa', rampHouseCv(), 5, 3));
  F.sheetStack = memo(() => sheet('chapas', sheetStackCv(), 2, 1));
  F.pallet = () => L.tile('fab_pallet', palletCv);
  F.motor = () => L.tile('fab_motor', motorCv);
  F.hubcap = () => L.tile('fab_calota', hubcapCv);
  F.paintCans = () => L.tile('fab_latas', paintCansCv);
  F.punchClock = memo(() => sheet('ponto', punchClockCv(), 1, 2));
  F.coffee = memo(() => sheet('cafe', coffeeMachineCv(), 1, 2));
  F.impactWall = (part) => L.tile('fab_impacto_' + part, () => impactWallCv(part));
  /** plataforma giratória 5×5 sobre o piso escuro do subsolo (`I` 20,14) */
  F.turntable = memo(() => { const g = ts.gid('I', 20, 14), loc = ts.locate(g), p = loc.t.png.data, wd = loc.t.imagewidth; const px = (i, j) => { const k = ((loc.row * 16 + j) * wd + loc.col * 16 + i) * 4; return [p[k], p[k + 1], p[k + 2]]; }; return sheet('giratoria', turntableCv(px), 5, 5, FLOOR); });
  F.lotPaint = (kind) => L.tile('fab_vaga_' + kind, () => lotPaintCv(kind), { speed: 85, terrain: 'road' });
  F.oil = (v = 0) => L.tile('fab_graxa' + v, () => oilStainCv(v));
  F.epoxy = (v = 0) => L.tile('fab_epoxi' + v, () => epoxyCv(v), FLOOR);
  return F;
}

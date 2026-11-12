// Portas como no Tibia (ciclo 23, pedido do dono: "deixe parecido com Tibia, as portas hoje não estão ficando com boas UI
// por conta do que tem em volta dela"). Chamado por doors22.mjs para cada porta (menos a cancela do Pátio, que já é a
// porta natural da cerca da passagem de nível):
//   - A porta é batente + verga + folha com puxador, desenhada SOBRE a cópia da parede vizinha (o mesmo chão e a mesma
//     parede do lugar), para encaixar na linha da parede. Fechada: a folha. Aberta: o vão com o chão de dentro e a folha
//     encostada no batente, como a porta aberta do Tibia.
//   - Material pelo lugar: madeira com moldura de pedra nas cavernas; aço com visor nas áreas industriais.
//   - Porta com requisito (level/missão): plaquinha dourada na verga (a regra do "passo para dentro", ver doors.ts).
//   - Em volta: as folhas do portão de correr antigo que sobravam ao lado da porta (listradas, pareciam outras portas)
//     viram a parede comum daquela linha. Só tiles da própria linha da parede, a até 2 da porta (DOOR_FRAME_RECTS).
// Orientação: 'h' = parede deitada (corre leste-oeste; passa-se de norte a sul, vê-se a face da porta); 'v' = parede em pé
// (corre norte-sul; passa-se de leste a oeste).
import { Cv, OL } from './lemon.mjs';

/** Folhas do portão de correr antigo (pares vertical e horizontal do atlas Lemon): sobravam ao lado das portas. */
export const LEAF_KEYS = /^ind_portao:/;

/**
 * Tiles em volta das portas que o ciclo 23 pode mudar (retângulos inclusivos [x0,y0,x1,y1]): a porta e a linha da
 * parede a até 2 tiles dela. Conferidos por `doorArt23` (nenhum tile fora deles muda) e passados ao `diff-world.mjs --allow`.
 */
export const DOOR_FRAME_RECTS = {};

const pick = (map, x, y) => ({ ground: map.get('ground', x, y), deco: map.get('deco', x, y) });

/** Cópia dos pixels de um gid (qualquer tileset do mapa, inclusive o Lemon em construção). */
export function tileCv(map, gid) {
  const cv = new Cv();
  if (!gid) return cv;
  const t = [...map.ts.list].filter((s) => gid >= s.firstgid).sort((a, b) => b.firstgid - a.firstgid)[0];
  if (!t) return cv;
  const id = gid - t.firstgid, png = t.png, cols = t.columns;
  const cx = (id % cols) * 16, cy = Math.floor(id / cols) * 16;
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const i = ((cy + y) * png.width + cx + x) * 4;
    if (png.data[i + 3]) cv.set(x, y, [png.data[i], png.data[i + 1], png.data[i + 2]], png.data[i + 3]);
  }
  return cv;
}

/** Chão + parede de um tile, numa tela só (a base da porta). */
function baseCv(map, t) {
  const cv = tileCv(map, t.ground);
  if (t.deco) cv.paste(tileCv(map, t.deco), 0, 0);
  return cv;
}

// ---- paletas ---------------------------------------------------------------------------------------------------------
const MAT = {
  pedra: { // moldura de pedra (cinza-esverdeada, a rocha das cavernas) e folha de madeira com cintas de ferro
    f0: '#2c352d', f1: '#4a574a', f2: '#6c7a6a', f3: '#93a08f',
    l0: '#3e2414', l1: '#5e3a1e', l2: '#7d4f2a', l3: '#a26a39', strap: '#3a3f44', rivet: '#a9b1b6', knob: '#e2bb4c',
  },
  aco: { // batente de aço escuro e folha de aço com visor
    f0: '#1d2329', f1: '#38424b', f2: '#55626d', f3: '#7d8a95',
    l0: '#4a5660', l1: '#66737e', l2: '#8693a0', l3: '#aab6c1', strap: '#2a3138', rivet: '#c9d1d7', knob: '#e7e7e7',
    glass: '#22313d', glassHi: '#8ec3df', stripeA: '#e6c23e', stripeB: '#25282c',
  },
};
const GOLD = ['#7a5a12', '#c99a26', '#f1cf5a'];

/** Plaquinha dourada da porta com requisito (centro da verga). */
function plaque(cv, x, y, w) {
  cv.rect(x, y, w, 3, GOLD[1]); cv.rect(x, y, w, 1, GOLD[2]); cv.rect(x, y + 2, w, 1, GOLD[0]);
  cv.set(x - 1, y + 1, OL); cv.set(x + w, y + 1, OL);
  cv.set(x + Math.floor(w / 2) - 1, y + 1, GOLD[0]); cv.set(x + Math.floor(w / 2), y + 1, GOLD[0]);
}

/** Folha fechada, de frente (x0..x1 por y0..y1). */
function leafFace(cv, m, mat, x0, y0, x1, y1, knobRight = true) {
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  if (mat === 'pedra') {
    cv.rect(x0, y0, w, h, m.l2);
    for (let x = x0 + 2; x < x1; x += 3) cv.rect(x, y0, 1, h, m.l1); // juntas das tábuas
    cv.rect(x0, y0, 1, h, m.l3); cv.rect(x1, y0, 1, h, m.l0);
    for (const sy of [y0 + 2, y1 - 2]) { cv.rect(x0, sy, w, 1, m.strap); cv.set(x0 + 1, sy, m.rivet); cv.set(x1 - 1, sy, m.rivet); }
  } else {
    cv.rect(x0, y0, w, h, m.l1);
    cv.rect(x0 + 1, y0 + 1, w - 2, h - 2, m.l2);
    cv.rect(x0 + 1, y0 + 1, w - 2, 1, m.l3); cv.rect(x0, y0, 1, h, m.l3); cv.rect(x1, y0, 1, h, m.l0);
    const gx = x0 + 2, gw = Math.max(2, w - 4); // visor
    if (h >= 9) { cv.rect(gx, y0 + 2, gw, 2, m.glass); cv.set(gx, y0 + 2, m.glassHi); cv.rect(gx, y0 + 4, gw, 1, m.l0); }
    for (let x = x0 + 1; x < x1; x++) cv.set(x, y1 - 1, ((x >> 1) & 1) ? m.stripeA : m.stripeB); // faixa no rodapé
  }
  const kx = knobRight ? x1 - 2 : x0 + 2, ky = y0 + Math.floor(h / 2);
  cv.set(kx, ky, m.knob); cv.set(kx, ky + 1, m.l0);
}

/** Porta de frente numa parede deitada ('h'). */
function doorH(base, floor, mat, gated, open) {
  const m = MAT[mat], cv = new Cv();
  cv.paste(base, 0, 0);
  // vão e batente: ombreiras 2..3 e 12..13, verga 1..3
  const X0 = 4, X1 = 11, Y0 = 4, Y1 = 15;
  cv.rect(2, 1, 12, 15, m.f1);
  cv.rect(2, 1, 12, 1, m.f3); cv.rect(2, 1, 1, 15, m.f2); cv.rect(13, 1, 1, 15, m.f0);
  cv.rect(3, 3, 10, 1, m.f0); // sombra sob a verga
  cv.rect(1, 1, 1, 15, OL); cv.rect(14, 1, 1, 15, OL); cv.rect(1, 0, 14, 1, OL);
  if (open) {
    // o chão do outro lado aparece no vão, com sombra no alto
    for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) { const [r, g, b, a] = floor.get(x, y); if (a) cv.set(x, y, [r, g, b]); }
    for (let y = Y0; y < Y0 + 4; y++) for (let x = X0; x <= X1; x++) cv.over(x, y, '#000000', 150 - (y - Y0) * 35);
    // folha aberta, de quina, encostada na ombreira esquerda
    cv.rect(X0, Y0, 2, Y1 - Y0 + 1, m.l1); cv.rect(X0, Y0, 1, Y1 - Y0 + 1, m.l3); cv.set(X0 + 1, Y0 + 6, m.knob);
    cv.rect(X0 + 2, Y0, 1, Y1 - Y0 + 1, OL);
  } else {
    leafFace(cv, m, mat, X0, Y0, X1, Y1);
  }
  if (gated) plaque(cv, 6, 1, 4);
  return cv;
}

/** Porta numa parede em pé ('v'): vista de cima, a folha atravessa a parede de leste a oeste. */
function doorV(base, floor, mat, gated, open) {
  const m = MAT[mat], cv = new Cv();
  cv.paste(base, 0, 0);
  // batentes de cima e de baixo (os pedaços de parede que seguram a porta) e o vão no meio
  const Y0 = 4, Y1 = 12;
  for (const [y, h] of [[0, Y0], [Y1, 16 - Y1]]) {
    cv.rect(2, y, 12, h, m.f1); cv.rect(2, y, 12, 1, m.f3); cv.rect(2, y, 1, h, m.f2); cv.rect(13, y, 1, h, m.f0);
    cv.rect(1, y, 1, h, OL); cv.rect(14, y, 1, h, OL);
  }
  cv.rect(2, Y0 - 1, 12, 1, m.f0); cv.rect(2, Y1 + 1, 12, 1, m.f2);
  // o vão: chão de um lado ao outro
  for (let y = Y0; y < Y1; y++) for (let x = 0; x < 16; x++) { const [r, g, b, a] = floor.get(x, y); if (a) cv.set(x, y, [r, g, b]); }
  for (let x = 0; x < 16; x++) cv.over(x, Y0, '#000000', 90); // sombra do batente de cima
  if (open) {
    // folha aberta: encostada no batente de cima, de lado
    cv.rect(3, Y0, 10, 2, m.l1); cv.rect(3, Y0, 10, 1, m.l3); cv.set(11, Y0 + 1, m.knob); cv.rect(3, Y0 + 2, 10, 1, OL);
  } else {
    // folha fechada: a madeira/aço atravessando o vão, com o puxador
    leafFace(cv, m, mat, 4, Y0, 11, Y1 - 1);
    cv.rect(3, Y0, 1, Y1 - Y0, OL); cv.rect(12, Y0, 1, Y1 - Y0, OL);
  }
  if (gated) plaque(cv, 6, 0, 4);
  return cv;
}

/**
 * Arte e arredores de uma porta. `d` = entrada de DOORS (doors22), `lemon` = atlas.
 * Devolve `[['deco', 0, 0, gidFechada, gidAberta]]` (a prop `art`) e já pinta o mapa: a porta fechada no tile e as
 * folhas antigas ao lado trocadas pela parede da linha.
 */
export function doorArt23({ map, lemon, d }) {
  const fail = (msg) => { throw new Error('DOORS23: ' + msg); };
  const [x, y] = d.door;
  const blocked = (a, b) => map.blocked(a, b);
  const orient = blocked(x - 1, y) && blocked(x + 1, y) ? 'h' : blocked(x, y - 1) && blocked(x, y + 1) ? 'v' : fail(`${d.id}: porta fora de uma parede reta`);
  const step = orient === 'h' ? [1, 0] : [0, 1];
  const byId = new Map([...lemon.set.keys].map(([k, id]) => [id, k]));
  const keyOf = (gid) => byId.get(gid - lemon.t.firstgid);
  const isLeaf = (gid) => !!gid && LEAF_KEYS.test(keyOf(gid) ?? '');
  // ---- folhas antigas na linha da parede (até 2 de cada lado): viram a parede comum daquela linha
  const changed = [[x, y]];
  for (const s of [-1, 1]) {
    for (let k = 1; k <= 2; k++) {
      const ax = x + step[0] * s * k, ay = y + step[1] * s * k;
      if (!isLeaf(map.get('deco', ax, ay))) break;
      // a parede para pôr no lugar: a primeira da mesma linha, seguindo para fora, que não é folha nem vazio
      let wall = 0;
      for (let j = k + 1; j <= 6 && !wall; j++) { const g = map.get('deco', x + step[0] * s * j, y + step[1] * s * j); if (g && !isLeaf(g)) wall = g; }
      for (let j = 1; j <= 6 && !wall; j++) { const g = map.get('deco', x - step[0] * s * j, y - step[1] * s * j); if (g && !isLeaf(g)) wall = g; }
      if (!wall) fail(`${d.id}: sem parede para pôr no lugar da folha em ${ax},${ay}`);
      map.set('deco', ax, ay, wall);
      changed.push([ax, ay]);
    }
  }
  // ---- base: a parede vizinha (sem folha) e o chão de dentro para o vão
  let nb = null;
  for (const s of [-1, 1]) for (let k = 1; k <= 3 && !nb; k++) {
    const ax = x + step[0] * s * k, ay = y + step[1] * s * k, t = pick(map, ax, ay);
    if (t.deco && !isLeaf(t.deco) && blocked(ax, ay)) nb = t;
  }
  if (!nb) fail(`${d.id}: sem parede vizinha para a base`);
  // O vão mostra o chão dos lados da passagem (só o chão: faixa de perigo, trilho ou marca no chão ficariam listrados no
  // vão): na parede deitada, o chão de cima (o que se vê pela porta); na em pé, o de oeste à esquerda e o de leste à direita.
  const gnd = (ax, ay) => map.get('ground', ax, ay);
  const floorGids = orient === 'h' ? [gnd(x, y - 1), gnd(x, y - 1)] : [gnd(x - 1, y), gnd(x + 1, y)];
  const fw = tileCv(map, floorGids[0]), fe = tileCv(map, floorGids[1]), floor = new Cv();
  for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) { const [r, g, b, a] = (i < 8 ? fw : fe).get(i, j); if (a) floor.set(i, j, [r, g, b], a); }
  const base = baseCv(map, nb);
  const mat = d.kind === 'caverna' ? 'pedra' : 'aco';
  const gated = !!d.req;
  const draw = orient === 'h' ? doorH : doorV;
  const tag = `porta23_${mat}_${orient}_${gated ? 'req' : 'livre'}_${nb.ground}_${nb.deco}_${floorGids.join('_')}`;
  const closed = lemon.tile(`${tag}:fechada`, () => draw(base, floor, mat, gated, false));
  const open = lemon.tile(`${tag}:aberta`, () => draw(base, floor, mat, gated, true));
  map.set('deco', x, y, closed);
  map.set('above', x, y, 0);
  // retângulo das mudanças (a porta e as folhas trocadas)
  const xs = changed.map((c) => c[0]), ys = changed.map((c) => c[1]);
  DOOR_FRAME_RECTS[d.id] = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  return { orient, mat, art: [['deco', 0, 0, closed, open]] };
}

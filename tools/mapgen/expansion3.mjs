// Oficina dos Engenhos (ciclo 10): o escritório da Embeddo como zona protegida, ligada à Vila por um portal.
//
// Terceira expansão, a primeira que cresce PARA BAIXO: o mapa anterior (400×288) é copiado tile a tile para um mapa
// mais alto (mesma largura → mesmas coordenadas, mesmos índices) e o bloco novo é desenhado nas linhas y >= 312, com
// 26 linhas de vazio sólido entre ele e a última arena (y 285). Nenhum tile antigo muda; os objetos novos entram
// DEPOIS dos antigos (ids estáveis). Totalmente determinístico: nada aqui consome gerador aleatório.
//
// Bloco 30×22 em (60,312): coordenadas locais (lx, ly) → global (60+lx, 312+ly)
//   ly  0..1   parede norte
//   ly  2..7   War Room (lx 2..12) | divisória (lx 13..14) | Copa (lx 15..27)
//   ly  8..9   parede com portas de 2 tiles (War Room lx 6..7, Copa lx 20..21), nicho do Banheiro Quântico em (14,9)
//              e a porta de SAÍDA em (3,9): tile de parede com arte de porta, desbloqueado → portal de volta à Vila
//   ly 10..12  corredor central (lx 2..27); chegada do portal da Vila em (5,11)
//   ly 13..14  parede com portas (Bancada lx 6..7, Pátio lx 20..21)
//   ly 15..20  Bancada (lx 2..12) | divisória | Pátio de Encomendas (lx 15..27); chegada da carroça em (23,18)
//   ly 21      parede sul; lx 1 e 28 paredes laterais; lx 0 e 29 vazio
import { GameMap, bfs } from './lib.mjs';

export const NEW_H3 = 336;
export const BLOCK3 = { x0: 60, y0: 312, w: 30, h: 22 };
// porta da Vila (canto nordeste da paliçada, atrás da casa vermelha) e tile de retorno (diagonal, nunca o próprio portal)
export const VILLAGE_DOOR = [99, 79];
export const VILLAGE_RETURN = [98, 80];
export const WORKSHOP_ARRIVAL = [65, 323];   // chegada do portal Vila → Oficina
export const WORKSHOP_EXIT = [63, 321];      // porta de saída (parede norte do corredor)
export const WORKSHOP_COACH = [83, 330];     // chegada da carroça (TravelDest "oficina" em shared/data/npcs.ts)

export function expand3({ old, ts, S, L, spawnTile, village }) {
  const W = old.w, OLD_H = old.h, H = NEW_H3;
  if (H < OLD_H + 24) throw new Error('EXPANSION3: o mapa novo precisa de >= 24 linhas a mais');
  const map = new GameMap(W, H, ts);
  for (const k of Object.keys(map.layers)) map.layers[k].set(old.layers[k]); // mesma largura: o prefixo é o mapa antigo
  map.occ.set(old.occ);
  map.objects = old.objects.slice();
  map.nextId = old.nextId;
  const idx = (x, y) => y * W + x;
  const prop = (o, n) => o.properties?.find((p) => p.name === n)?.value;
  const oldPortals = old.objects.filter((o) => o.type === 'portal').map((o) => [o.x / 16, o.y / 16, prop(o, 'toX'), prop(o, 'toY')]);
  const fail = (msg) => { throw new Error('EXPANSION3 VALIDATION FAILED: ' + msg); };

  // vazio sólido em todas as linhas novas
  for (let y = OLD_H; y < H; y++) for (let x = 0; x < W; x++) { map.put('ground', x, y, 'O', 1, 1); map.block(x, y); }

  // ================================================================== planta do bloco (coordenadas locais)
  const { x0: X0, y0: Y0, w: BW, h: BH } = BLOCK3;
  const G = (lx, ly) => [X0 + lx, Y0 + ly];
  const WOOD = 1, STONE = 2, COBBLE = 3; // estilos de piso (famílias nine-slice do TilesetInteriorFloor)
  const floor = new Uint8Array(BW * BH);
  const lidx = (lx, ly) => ly * BW + lx;
  const rect = (x0, y0, x1, y1, style) => { for (let ly = y0; ly <= y1; ly++) for (let lx = x0; lx <= x1; lx++) floor[lidx(lx, ly)] = style; };
  rect(2, 2, 12, 7, WOOD);      // War Room
  rect(15, 2, 27, 7, WOOD);     // Copa
  rect(2, 10, 27, 12, STONE);   // corredor
  rect(2, 15, 12, 20, WOOD);    // Bancada
  rect(15, 15, 27, 20, COBBLE); // Pátio de Encomendas
  rect(6, 8, 7, 9, STONE); rect(20, 8, 21, 9, STONE);   // portas norte
  rect(6, 13, 7, 14, STONE); rect(20, 13, 21, 14, STONE); // portas sul
  rect(14, 9, 14, 9, STONE);    // nicho do Banheiro Quântico
  const inL = (lx, ly) => lx >= 0 && ly >= 0 && lx < BW && ly < BH;
  const styleAt = (lx, ly) => (inL(lx, ly) ? floor[lidx(lx, ly)] : 0);
  const isFloor = (lx, ly) => styleAt(lx, ly) !== 0;
  // parede = toda célula não-piso do retângulo lx 1..28 × ly 0..21 (fecha os cantos, ao contrário da regra por vizinhança)
  const isWall = (lx, ly) => inL(lx, ly) && lx >= 1 && lx <= 28 && ly <= 21 && !isFloor(lx, ly);

  // ---- piso: nine-slice por estilo (como a praça da Vila: cols 0..2 × linhas {topo, meio, base})
  const SLICE = { [WOOD]: [6, 7, 9], [STONE]: [0, 1, 3], [COBBLE]: [12, 13, 15] };
  for (let ly = 0; ly < BH; ly++) for (let lx = 0; lx < BW; lx++) {
    const s = styleAt(lx, ly);
    if (!s) continue;
    const same = (a, b) => styleAt(a, b) === s;
    const top = !same(lx, ly - 1), bot = !same(lx, ly + 1), lef = !same(lx - 1, ly), rig = !same(lx + 1, ly);
    const [r0, r1, r2] = SLICE[s];
    const [x, y] = G(lx, ly);
    map.put('ground', x, y, 'I', lef ? 0 : rig ? 2 : 1, top ? r0 : bot ? r2 : r1);
    map.block(x, y, false);
  }
  // ---- paredes: blocos de pedra marrom do TilesetRelief (cols 4/5/6 × linhas 5/6/7), mesma regra das masmorras;
  // numa parede de 1 tile de largura com piso de um lado só, a borda fica do lado do piso
  for (let ly = 0; ly < BH; ly++) for (let lx = 0; lx < BW; lx++) {
    if (!isWall(lx, ly)) continue;
    const above = isWall(lx, ly - 1), below = isWall(lx, ly + 1), left = isWall(lx - 1, ly), right = isWall(lx + 1, ly);
    const row = isFloor(lx, ly + 1) ? 2 : !above ? 0 : !below ? 2 : 1;
    const col = !left && !right ? (isFloor(lx - 1, ly) ? 4 : 6) : !left ? 4 : !right ? 6 : 5;
    const [x, y] = G(lx, ly);
    map.put('deco', x, y, 'R', col, 5 + row);
    map.block(x, y);
  }
  map.reserve(X0, Y0, BW, BH);

  // ================================================================== móveis (TilesetElement) — nunca sobre NPC, chegada ou porta
  const S3 = {
    tableLong: ['E', 11, 1, 3, 1, { blockAll: true }],   // mesa comprida
    counter: ['E', 2, 10, 3, 1, { blockAll: true }],      // balcão / bancada
    bookshelf: ['E', 3, 7, 2, 2, { blockAll: true }],     // estante com livros
    bookshelf2: ['E', 8, 7, 2, 2, { blockAll: true }],    // estante com livros e caixas
    shelves: ['E', 10, 7, 2, 2, { blockAll: true }],      // prateleiras vazias
    dresser: ['E', 6, 7, 2, 2, { blockAll: true }],       // cômoda
    locker: ['E', 2, 7, 1, 2, { blockAll: true }],        // armário
    clock: ['E', 0, 5, 1, 2, { blockAll: true }],         // relógio de pé
    plant: ['E', 0, 7, 1, 2, { blockAll: true }],         // planta no vaso
    wagon: ['E', 0, 3, 2, 2, { blockAll: true }],         // carroça
    coveredWagon: ['E', 2, 3, 2, 2, { blockAll: true }],  // carroça coberta
    chair: ['E', 0, 9, 1, 1], chairRed: ['E', 7, 4, 1, 1], stool: ['E', 3, 9, 1, 1],
    crate: ['E', 0, 2, 1, 1], crateStriped: ['E', 7, 2, 1, 1], box: ['E', 9, 2, 1, 1],
    barrel: ['E', 0, 0, 1, 1], sack: ['E', 1, 1, 1, 1], pot: ['E', 4, 1, 1, 1], jar: ['E', 0, 10, 1, 1],
    board: ['E', 1, 2, 1, 1], lamp: ['E', 6, 3, 1, 2],
  };
  const npcs = [
    // War Room
    ['quadro_gestao', ...G(7, 2)], ['guilherme_boss', ...G(4, 5)], ['luan', ...G(10, 5)],
    // Copa
    ['geladeira', ...G(16, 2)], ['trofeu_demoday', ...G(26, 2)], ['gabriel', ...G(21, 6)],
    // nicho na parede norte do corredor
    ['banheiro_quantico', ...G(14, 9)],
    // Bancada
    ['juliao', ...G(4, 15)], ['iago', ...G(10, 15)], ['em1000', ...G(3, 19)], ['pedrao', ...G(10, 19)],
    // Pátio de Encomendas
    ['bianca', ...G(16, 15)], ['alexandre_quantico', ...G(16, 19)], ['coach_oficina', ...G(26, 16)],
  ];
  const keep = new Set([...npcs.map(([, x, y]) => `${x},${y}`), WORKSHOP_ARRIVAL.join(), WORKSHOP_EXIT.join(), WORKSHOP_COACH.join()]);
  for (const [lx, ly] of [[6, 8], [7, 8], [6, 9], [7, 9], [20, 8], [21, 8], [20, 9], [21, 9], [6, 13], [7, 13], [6, 14], [7, 14], [20, 13], [21, 13], [20, 14], [21, 14], [14, 10]]) keep.add(G(lx, ly).join());
  const furniture = [];
  const put = (name, lx, ly) => {
    const [t, c, r, w, h, o = {}] = S3[name];
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const [x, y] = G(lx + i, ly + j);
      if (keep.has(`${x},${y}`)) fail(`móvel ${name} em ${x},${y} cobre NPC, chegada ou porta`);
      if (!isFloor(lx + i, ly + j) && !(h === 2 && j === 0 && isWall(lx + i, ly + j))) fail(`móvel ${name} em ${x},${y} fora do piso`);
    }
    map.stamp(t, c, r, w, h, G(lx, ly)[0], G(lx, ly)[1], o);
    furniture.push([name, lx, ly]);
  };
  const lights = [];
  const lamp = (lx, ly) => { put('lamp', lx, ly - 1); lights.push([...G(lx, ly), 5, '#ffc060', true]); }; // (lx,ly) = poste
  const wallDeco = (lx, ly, c, r) => { if (!isWall(lx, ly)) fail(`decoração de parede fora da parede em ${lx},${ly}`); map.put('above', ...G(lx, ly), 'E', c, r); };

  // War Room: mesa comprida com cadeiras, a cadeira vermelha do Boss na cabeceira, estantes, quadro na parede
  put('tableLong', 6, 5); put('chairRed', 5, 5); put('chair', 9, 5);
  put('chair', 6, 4); put('chair', 8, 4); put('chair', 6, 6); put('chair', 8, 6);
  put('bookshelf', 2, 2); put('shelves', 11, 2); put('plant', 12, 6); lamp(2, 7);
  wallDeco(7, 1, 8, 10); // quadro emoldurado acima do Quadro de Gestão
  // Copa: armário, balcão com panela ao lado da geladeira; mesa de refeições; prateleiras e relógio junto ao troféu
  put('locker', 15, 2); put('counter', 17, 2); put('pot', 20, 2); put('jar', 21, 2);
  put('tableLong', 19, 5); put('chair', 19, 4); put('chair', 21, 4); put('chair', 19, 6);
  put('shelves', 24, 2); put('clock', 27, 2); put('plant', 15, 6); lamp(27, 7);
  // corredor: lampiões nos cantos e na parede
  lamp(2, 12); lamp(27, 12); lamp(10, 10); lamp(18, 10);
  // Bancada: bancadas de trabalho, estante, cômoda e os caixotes do "Chegou!"
  put('tableLong', 2, 17); put('counter', 6, 17); put('stool', 6, 18); put('stool', 8, 18);
  put('bookshelf2', 11, 17); put('dresser', 4, 19);
  put('crate', 12, 19); put('crateStriped', 12, 20); put('box', 8, 20); put('sack', 3, 20); put('barrel', 2, 15); lamp(12, 15);
  // Pátio de Encomendas: quadro de avisos e guichê, carroças encostadas na parede sul, caixotes
  put('board', 17, 15); put('counter', 17, 17); put('plant', 15, 18);
  put('wagon', 24, 19); put('coveredWagon', 26, 19);
  put('crate', 18, 20); put('crateStriped', 19, 20); put('box', 18, 19); put('barrel', 15, 20);
  lamp(22, 15); lamp(22, 20);

  // ================================================================== portais e porta de saída
  const doorDefs = [
    { at: VILLAGE_DOOR, to: WORKSHOP_ARRIVAL },                        // Vila → Oficina (sem arte: só a luz marca o lugar)
    { at: WORKSHOP_EXIT, to: VILLAGE_RETURN, art: ['D', 1, 3] },       // Oficina → Vila (porta na parede norte do corredor)
  ];
  for (const d of doorDefs) if (d.art) { map.put('deco', d.at[0], d.at[1], ...d.art); map.block(d.at[0], d.at[1], false); }
  lights.push([...VILLAGE_DOOR, 3, '#ffe066', true]);

  // ================================================================== OBJETOS (depois de todos os antigos)
  for (const [id, x, y] of npcs) map.tileObj('npc', x, y, { npcId: id }, id);
  for (const d of doorDefs) map.tileObj('portal', d.at[0], d.at[1], { toX: d.to[0], toY: d.to[1] }, 'portal');
  map.addObject({ type: 'zone', name: 'Oficina dos Engenhos', x: X0 * 16, y: Y0 * 16, width: BW * 16, height: BH * 16, rect: true, props: { music: '36 - Village.ogg', pz: true } });
  for (const [x, y, radius, color, flicker] of lights) map.tileObj('light', x, y, { radius, color, flicker }, 'light');

  // ================================================================== VALIDAÇÃO
  const [vx, vy] = VILLAGE_DOOR, [rx, ry] = VILLAGE_RETURN;
  if (vx < village.x0 || vx > village.x1 || vy < village.y0 || vy > village.y1) fail(`porta da Vila ${vx},${vy} fora da Vila`);
  if (old.layers.collision[vy * W + vx] !== 0) fail(`porta da Vila ${vx},${vy} bloqueada no mapa antigo`);
  if (old.objects.some((o) => o.point && o.x / 16 === vx && o.y / 16 === vy)) fail(`porta da Vila ${vx},${vy} tem objeto antigo em cima`);
  if (oldPortals.some(([x, y]) => x === vx && y === vy)) fail('porta da Vila é um portal antigo');
  if (oldPortals.some(([, , tx, ty]) => tx === vx && ty === vy)) fail('porta da Vila é alvo de um portal antigo');
  if (rx === vx && ry === vy) fail('tile de retorno igual à porta da Vila');
  if (map.blocked(rx, ry)) fail(`tile de retorno ${rx},${ry} bloqueado`);
  const newPortals = doorDefs.map((d) => [d.at[0], d.at[1], d.to[0], d.to[1]]);
  const portalMap = new Map(oldPortals.concat(newPortals).map(([x, y, tx, ty]) => [x + ',' + y, [tx, ty]]));
  for (const [x, y, tx, ty] of newPortals) {
    if (map.blocked(x, y)) fail(`portal ${x},${y} bloqueado`);
    if (map.blocked(tx, ty)) fail(`destino de portal ${tx},${ty} bloqueado`);
    if (portalMap.has(tx + ',' + ty)) fail(`destino de portal ${tx},${ty} é ele mesmo um portal`);
  }
  for (const [id, x, y] of npcs) if (map.blocked(x, y)) fail(`npc ${id} em ${x},${y} bloqueado`);
  for (let i = 0; i < npcs.length; i++) for (let j = i + 1; j < npcs.length; j++) {
    const d = Math.max(Math.abs(npcs[i][1] - npcs[j][1]), Math.abs(npcs[i][2] - npcs[j][2]));
    if (d < 2) fail(`npcs ${npcs[i][0]} e ${npcs[j][0]} a menos de 2 tiles`);
  }
  if (map.blocked(...WORKSHOP_COACH)) fail('chegada da carroça bloqueada');
  if (portalMap.has(WORKSHOP_COACH.join())) fail('chegada da carroça é um portal');
  const reach = bfs(map, spawnTile[0], spawnTile[1], portalMap);
  const R = (x, y) => reach[idx(x, y)] === 1;
  for (const [id, x, y] of npcs) if (!R(x, y)) fail(`npc ${id} em ${x},${y} inalcançável`);
  for (const [nm, [x, y]] of [['chegada do portal', WORKSHOP_ARRIVAL], ['chegada da carroça', WORKSHOP_COACH], ['saída', WORKSHOP_EXIT], ['porta da Vila', VILLAGE_DOOR], ['retorno', VILLAGE_RETURN]]) if (!R(x, y)) fail(`${nm} ${x},${y} inalcançável`);
  // vazamento: nenhum tile andável nas linhas novas fora do bloco
  for (let y = OLD_H; y < H; y++) for (let x = 0; x < W; x++) {
    if (map.layers.collision[idx(x, y)] === 0 && !(x >= X0 && x < X0 + BW && y >= Y0 && y < Y0 + BH)) fail(`tile andável fora do bloco em ${x},${y}`);
  }
  for (const [id, x, y] of npcs) map.block(x, y);
  // com os NPCs já virados obstáculo, todo tile andável do bloco continua alcançável a partir da chegada (nenhum
  // bolsão atrás de móvel ou de NPC)
  const reachIn = bfs(map, WORKSHOP_ARRIVAL[0], WORKSHOP_ARRIVAL[1], portalMap);
  let walk = 0, reached = 0;
  const lost = [];
  for (let y = Y0; y < Y0 + BH; y++) for (let x = X0; x < X0 + BW; x++) {
    const i = idx(x, y);
    if (map.layers.collision[i]) continue;
    walk++;
    if (reach[i] && reachIn[i]) reached++; else lost.push(`${x},${y}`);
  }
  console.log(`expansion3: ${W}x${H}, bloco ${BW}x${BH} em ${X0},${Y0}, ${npcs.length} npcs, ${newPortals.length} portals, ${furniture.length} móveis, ${lights.length} luzes; ${reached}/${walk} tiles andáveis alcançáveis`);
  if (lost.length) fail(`${lost.length} tiles andáveis do bloco inalcançáveis: ${lost.join(' ')}`);
  return { map, lights, reach, portalMap };
}

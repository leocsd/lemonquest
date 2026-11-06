// Salão de Minijogos (JJ-5, 2026-11-06; regras em shared/data/minigames.ts): saguão com o Mestre do Salão e duas salas
// quadradas de 11×11 onde se joga Chuva de Limões, Chão que Cai, Pega-Limão e Genius do Escritório.
//
// Oitava expansão, de novo PARA BAIXO: o mapa anterior (400×888) é copiado tile a tile para um mapa de 400×936 e o bloco
// 41×17 é desenhado em (60,912), com 24 linhas de vazio entre ele e o fundo da Montadora (y 885). Nenhum tile antigo
// muda: a entrada da Vila é a porta da casinha laranja do sul da praça (79,106), só um OBJETO portal. Os objetos novos
// entram DEPOIS dos antigos (ids estáveis). Sem arte nova nem tileset novo (pisos e paredes do TilesetInteriorFloor /
// TilesetRelief, como a Oficina). Nada aqui consome gerador aleatório.
//
// Bloco 41×17 em (60,912): local (lx, ly) → global (60+lx, 912+ly)
//   ly 0..1    parede norte; porta de SAÍDA em (7,1) (parede com arte de porta, desbloqueada) → volta para a Vila
//   Saguão     lx 2..12,  ly 2..15  piso de madeira; chegada em (7,3); Mestre do Salão em (4,6); volta das salas (8,10)
//   Sala 1     lx 15..25, ly 3..13  piso de pedra (11×11, objeto "minigame_room" roomId 1)
//   Sala 2     lx 28..38, ly 3..13  piso de pedra (11×11, objeto "minigame_room" roomId 2)
//   As salas não têm porta: só se entra e sai por teleporte do servidor. lx 1 e 39 paredes; lx 0 e 40 vazio.
import { GameMap, bfs } from './lib.mjs';

export const NEW_H8 = 936;
export const BLOCK8 = { x0: 60, y0: 912, w: 41, h: 17 };
const G = (lx, ly) => [BLOCK8.x0 + lx, BLOCK8.y0 + ly];
/** Porta da casinha laranja do sul da praça (tile andável, sem objeto) e o tile de volta logo abaixo. */
export const VILA_DOOR8 = [79, 106];
export const VILA_RETURN8 = [79, 108];
export const SALAO_ARRIVAL = G(7, 3);
export const SALAO_EXIT = G(7, 1);
export const SALAO_BACK = G(8, 10);
/** = MINIGAME_ROOM_SIZE (shared/data/minigames.ts); conferido em server/systems/minigames.test.ts. */
const ROOM = 11;
const ROOMS = [{ id: 1, lx: 15, ly: 3 }, { id: 2, lx: 28, ly: 3 }];

export function expand8({ old, ts, S, spawnTile }) {
  const W = old.w, OLD_H = old.h, H = NEW_H8;
  const { x0: X0, y0: Y0, w: BW, h: BH } = BLOCK8;
  const fail = (msg) => { throw new Error('EXPANSION8 VALIDATION FAILED: ' + msg); };
  if (Y0 < OLD_H + 20) fail(`bloco em y ${Y0} perto demais do fundo antigo (${OLD_H})`);
  if (Y0 + BH + 2 > H) fail('o mapa novo não cabe o bloco');
  const map = new GameMap(W, H, ts);
  for (const k of Object.keys(map.layers)) map.layers[k].set(old.layers[k]); // mesma largura: o prefixo é o mapa antigo
  map.occ.set(old.occ);
  map.objects = old.objects.slice();
  map.nextId = old.nextId;
  const idx = (x, y) => y * W + x;
  const prop = (o, n) => o.properties?.find((p) => p.name === n)?.value;
  const oldPortals = old.objects.filter((o) => o.type === 'portal').map((o) => [o.x / 16, o.y / 16, prop(o, 'toX'), prop(o, 'toY')]);

  // vazio sólido em todas as linhas novas
  for (let y = OLD_H; y < H; y++) for (let x = 0; x < W; x++) { map.put('ground', x, y, 'O', 1, 1); map.block(x, y); }

  // ================================================================== planta
  const WOOD = 1, STONE = 2;
  const floor = new Uint8Array(BW * BH);
  const lidx = (lx, ly) => ly * BW + lx;
  const rect = (x0, y0, x1, y1, style) => { for (let ly = y0; ly <= y1; ly++) for (let lx = x0; lx <= x1; lx++) floor[lidx(lx, ly)] = style; };
  rect(2, 2, 12, 15, WOOD);
  const R = ROOM;
  for (const r of ROOMS) rect(r.lx, r.ly, r.lx + R - 1, r.ly + R - 1, STONE);
  const inL = (lx, ly) => lx >= 0 && ly >= 0 && lx < BW && ly < BH;
  const styleAt = (lx, ly) => (inL(lx, ly) ? floor[lidx(lx, ly)] : 0);
  const isFloor = (lx, ly) => styleAt(lx, ly) !== 0;
  const isWall = (lx, ly) => inL(lx, ly) && lx >= 1 && lx <= BW - 2 && ly <= BH - 1 && !isFloor(lx, ly);

  // ---- piso: nine-slice por estilo (igual à Oficina, expansion3)
  const SLICE = { [WOOD]: [6, 7, 9], [STONE]: [0, 1, 3] };
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
  // ---- paredes: blocos de pedra do TilesetRelief (mesma regra da Oficina)
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

  // ================================================================== saguão: móveis (TilesetElement), nunca nas passagens
  const S8 = {
    bookshelf: ['E', 3, 7, 2, 2, { blockAll: true }], shelves: ['E', 10, 7, 2, 2, { blockAll: true }],
    plant: ['E', 0, 7, 1, 2, { blockAll: true }], clock: ['E', 0, 5, 1, 2, { blockAll: true }],
    tableLong: ['E', 11, 1, 3, 1, { blockAll: true }], chair: ['E', 0, 9, 1, 1], stool: ['E', 3, 9, 1, 1],
    barrel: ['E', 0, 0, 1, 1], crate: ['E', 0, 2, 1, 1], board: ['E', 1, 2, 1, 1], lamp: ['E', 6, 3, 1, 2],
  };
  const npcs = [['salao_mestre', ...G(4, 6)]];
  const keep = new Set([...npcs.map(([, x, y]) => `${x},${y}`), SALAO_ARRIVAL.join(), SALAO_EXIT.join(), SALAO_BACK.join()]);
  for (const [lx, ly] of [[7, 2], [6, 3], [8, 3], [7, 4], [4, 7], [5, 6], [3, 6]]) keep.add(G(lx, ly).join());
  const furniture = [];
  const put = (name, lx, ly) => {
    const [t, c, r, w, h, o = {}] = S8[name];
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const [x, y] = G(lx + i, ly + j);
      if (keep.has(`${x},${y}`)) fail(`móvel ${name} em ${x},${y} cobre NPC, chegada ou porta`);
      if (!isFloor(lx + i, ly + j) && !(h === 2 && j === 0 && isWall(lx + i, ly + j))) fail(`móvel ${name} em ${x},${y} fora do piso`);
      if (lx + i > 12) fail(`móvel ${name} em ${x},${y} fora do saguão`);
    }
    map.stamp(t, c, r, w, h, G(lx, ly)[0], G(lx, ly)[1], o);
    furniture.push([name, lx, ly]);
  };
  const lights = [];
  const lamp = (lx, ly) => { put('lamp', lx, ly - 1); lights.push([...G(lx, ly), 5, '#ffd27a', true]); };
  put('bookshelf', 2, 2); put('shelves', 11, 2); put('clock', 10, 2);
  put('board', 6, 6); // quadro dos recordes ao lado do Mestre
  put('tableLong', 3, 11); put('chair', 3, 10); put('chair', 5, 10); put('stool', 4, 12);
  put('tableLong', 8, 13); put('chair', 8, 12); put('stool', 10, 12);
  put('plant', 2, 14); put('plant', 12, 14); put('barrel', 12, 8); put('crate', 2, 8);
  lamp(2, 5); lamp(12, 5);
  // salas: só luz (nenhum móvel dentro: o piso inteiro é jogo)
  for (const r of ROOMS) {
    const [cx, cy] = G(r.lx + (R - 1) / 2, r.ly + (R - 1) / 2);
    lights.push([cx, cy, 8, '#fff2c0', false]);
  }

  // ================================================================== portais
  const doorDefs = [
    { at: VILA_DOOR8, to: SALAO_ARRIVAL },                   // Vila → Salão (porta da casinha: arte que já existe)
    { at: SALAO_EXIT, to: VILA_RETURN8, art: ['D', 1, 3] },  // Salão → Vila (porta na parede norte do saguão)
  ];
  for (const d of doorDefs) if (d.art) { map.put('deco', d.at[0], d.at[1], ...d.art); map.block(d.at[0], d.at[1], false); }

  // ================================================================== OBJETOS (depois de todos os antigos)
  for (const [id, x, y] of npcs) map.tileObj('npc', x, y, { npcId: id }, id);
  for (const d of doorDefs) map.tileObj('portal', d.at[0], d.at[1], { toX: d.to[0], toY: d.to[1] }, 'portal');
  map.addObject({ type: 'zone', name: 'Salão de Minijogos', x: X0 * 16, y: Y0 * 16, width: BW * 16, height: BH * 16, rect: true, props: { music: '20 - Good Time.ogg', pz: true } });
  for (const r of ROOMS) {
    const [x, y] = G(r.lx, r.ly);
    map.addObject({ type: 'minigame_room', name: `sala ${r.id}`, x: x * 16, y: y * 16, width: R * 16, height: R * 16, rect: true, props: { roomId: r.id } });
  }
  map.tileObj('minigame_exit', SALAO_BACK[0], SALAO_BACK[1], {}, 'minigame_exit');
  for (const [x, y, radius, color, flicker] of lights) map.tileObj('light', x, y, { radius, color, flicker }, 'light');

  // ================================================================== VALIDAÇÃO
  const [vx, vy] = VILA_DOOR8, [rx, ry] = VILA_RETURN8;
  if (old.layers.collision[vy * W + vx] !== 0) fail(`porta da Vila ${vx},${vy} bloqueada no mapa antigo`);
  if (old.objects.some((o) => o.type !== 'light' && Math.floor(o.x / 16) === vx && Math.floor(o.y / 16) === vy && !o.width)) fail(`porta da Vila ${vx},${vy} tem objeto antigo em cima`);
  if (oldPortals.some(([x, y]) => x === vx && y === vy)) fail('porta da Vila é um portal antigo');
  if (oldPortals.some(([, , tx, ty]) => tx === vx && ty === vy)) fail('porta da Vila é alvo de um portal antigo');
  if (map.blocked(rx, ry)) fail(`tile de retorno ${rx},${ry} bloqueado`);
  const newPortals = doorDefs.map((d) => [d.at[0], d.at[1], d.to[0], d.to[1]]);
  const portalMap = new Map(oldPortals.concat(newPortals).map(([x, y, tx, ty]) => [x + ',' + y, [tx, ty]]));
  for (const [x, y, tx, ty] of newPortals) {
    if (map.blocked(x, y)) fail(`portal ${x},${y} bloqueado`);
    if (map.blocked(tx, ty)) fail(`destino de portal ${tx},${ty} bloqueado`);
    if (portalMap.has(tx + ',' + ty)) fail(`destino de portal ${tx},${ty} é ele mesmo um portal`);
  }
  if (old.objects.some((o) => o.type === 'npc' && Math.max(Math.abs(o.x / 16 - rx), Math.abs(o.y / 16 - ry)) < 1)) fail('retorno em cima de NPC');
  const reach = bfs(map, spawnTile[0], spawnTile[1], portalMap);
  const Rch = (x, y) => reach[idx(x, y)] === 1;
  for (const [id, x, y] of npcs) if (map.blocked(x, y) || !Rch(x, y)) fail(`npc ${id} em ${x},${y} bloqueado ou inalcançável`);
  for (const [nm, [x, y]] of [['chegada', SALAO_ARRIVAL], ['saída', SALAO_EXIT], ['volta das salas', SALAO_BACK], ['porta da Vila', VILA_DOOR8], ['retorno', VILA_RETURN8]]) if (!Rch(x, y)) fail(`${nm} ${x},${y} inalcançável`);
  // as salas são fechadas: nenhum tile delas se alcança andando (só por teleporte) e todas têm o piso inteiro livre
  for (const r of ROOMS) for (let j = 0; j < R; j++) for (let i = 0; i < R; i++) {
    const [x, y] = G(r.lx + i, r.ly + j);
    if (map.blocked(x, y)) fail(`sala ${r.id}: tile ${x},${y} bloqueado`);
    if (Rch(x, y)) fail(`sala ${r.id}: tile ${x},${y} alcançável andando`);
  }
  // vazamento: nenhum tile andável nas linhas novas fora do bloco
  for (let y = OLD_H; y < H; y++) for (let x = 0; x < W; x++) {
    if (map.layers.collision[idx(x, y)] === 0 && !(x >= X0 && x < X0 + BW && y >= Y0 && y < Y0 + BH)) fail(`tile andável fora do bloco em ${x},${y}`);
  }
  // saguão sem bolsão: com o NPC virado obstáculo, todo tile andável do saguão se alcança da chegada
  for (const [, x, y] of npcs) map.block(x, y);
  const reachIn = bfs(map, SALAO_ARRIVAL[0], SALAO_ARRIVAL[1], portalMap);
  const lost = [];
  let walk = 0;
  for (let ly = 0; ly < BH; ly++) for (let lx = 0; lx <= 12; lx++) {
    const [x, y] = G(lx, ly);
    if (map.layers.collision[idx(x, y)]) continue;
    walk++;
    if (!reachIn[idx(x, y)]) lost.push(`${x},${y}`);
  }
  for (const [, x, y] of npcs) map.block(x, y, false);
  if (lost.length) fail(`${lost.length} tiles do saguão inalcançáveis: ${lost.join(' ')}`);
  console.log(`expansion8: ${W}x${H}, bloco ${BW}x${BH} em ${X0},${Y0}, ${npcs.length} npc, ${newPortals.length} portais, ${ROOMS.length} salas ${R}x${R}, ${furniture.length} móveis, ${lights.length} luzes; saguão ${walk} tiles andáveis`);
  return { map, portalMap };
}

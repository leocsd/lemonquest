// Caves profundas (ciclo 13, pedido do dono: "mais caves", uma por faixa de level): Minas Abandonadas (12–28), Grutas
// Alagadas (35–55), Catacumbas Esquecidas (60–85) e Abismo Profundo (100–130).
//
// Quinta expansão, de novo PARA BAIXO: o mapa anterior (400×472) é copiado tile a tile para um mapa mais alto e as quatro
// caves são escavadas nas linhas y >= 498, com 26+ linhas de vazio sólido entre elas e o Túnel da Serra (y 469). Nenhum
// tile antigo muda: a entrada de cada cave é só um OBJETO portal (com level mínimo) num recanto andável da região de
// origem — o cliente já desenha o brilho roxo de todo portal (lightSources.ts). Ciclo 17: o desenho dessas entradas
// (bocas de caverna, cripta e fenda) veio depois, em tools/mapgen/entrances14.mjs, como exceção controlada que muda
// tiles só nos retângulos das entradas; esta etapa continua sem mudar tile antigo. Os objetos novos entram DEPOIS dos
// antigos (ids estáveis). Determinístico: gerador aleatório com semente própria; nenhum tileset novo (só tiles do
// TilesetInterior/Relief/Cave já usados pelas masmorras e decorações Lemon já existentes).
//
// Cada cave ocupa uma faixa de ~92 colunas e tem a mesma planta (salas 0..4), com o estilo de piso da masmorra:
//   0 entrada (porta de saída na parede norte, chegada 3 tiles abaixo)  →  1 e 2 salas de caça  →  3 galeria funda
//   →  4 covil (o mais difícil).
import { GameMap, bfs, mulberry32 } from './lib.mjs';

export const NEW_H5 = 560;
export const Y5 = 498;

// [nome da zona, x de origem da faixa, estilo, música, entrada (tile antigo), retorno (tile antigo), level mínimo]
const CAVES = [
  { id: 'minas', name: 'Minas Abandonadas', x: 8, style: 'cave', music: '2 - The Cave.ogg', door: [89, 74], ret: [88, 74], minLevel: 10 },
  { id: 'grutas', name: 'Grutas Alagadas', x: 104, mirror: true, style: 'temple', music: '14 - Curse.ogg', door: [283, 116], ret: [284, 116], minLevel: 35 },
  { id: 'catacumbas', name: 'Catacumbas Esquecidas', x: 204, mirror: true, style: 'dark', music: '40 - Crypt.ogg', door: [163, 54], ret: [164, 54], minLevel: 60 },
  { id: 'profundo', name: 'Abismo Profundo', x: 304, style: 'abyss', music: '30 - Ruins.ogg', door: [256, 136], ret: [255, 136], minLevel: 100 },
];

// Planta relativa (dx a partir de cave.x, y absoluto): [x0, y0, x1, y1, chanfro]
const ROOMS = [
  [4, 502, 14, 509, 1],     // 0 entrada
  [8, 510, 10, 513, 0],     //   corredor 0→1
  [0, 514, 28, 530, 2],     // 1 caça
  [29, 521, 34, 523, 0],    //   corredor 1→2
  [35, 506, 62, 526, 2],    // 2 caça
  [48, 527, 50, 532, 0],    //   corredor 2→3
  [32, 533, 66, 552, 3],    // 3 galeria funda
  [67, 541, 72, 543, 0],    //   corredor 3→4
  [73, 530, 91, 552, 2],    // 4 covil
];
const DOOR_DX = 9, ARRIVAL_DY = 3;
const SPAN = 91; // largura da planta (dx 0..91)
// Caves com `mirror` usam a planta espelhada na horizontal: as vizinhas não ficam iguais.
const X = (c, dx) => (c.mirror ? c.x + SPAN - dx : c.x + dx); // porta na parede norte da entrada (y 501) e chegada em y 504

// Spawns por cave: [monstro, count, radius, level, dx, y]
const SPAWNS = {
  minas: [
    ['mine_larva', 4, 4, 14, 10, 521], ['mine_larva', 3, 4, 14, 22, 522], ['bat', 2, 3, 18, 6, 526],
    ['mine_mole', 4, 5, 22, 48, 515], ['spider', 3, 4, 16, 40, 512],
    ['skeleton', 3, 5, 24, 42, 545], ['mine_mole', 3, 4, 22, 56, 540],
    ['mine_mole', 3, 4, 22, 82, 536], ['spider', 2, 3, 16, 82, 547], ['skeleton', 2, 3, 24, 86, 541],
  ],
  grutas: [
    ['crocodile', 3, 4, 36, 8, 522], ['kappa', 3, 4, 40, 20, 520],
    ['merlkin', 3, 4, 32, 42, 512], ['kappa', 4, 5, 40, 54, 518],
    ['cave_octopus', 3, 5, 50, 42, 544], ['kappa', 3, 4, 40, 58, 540],
    ['cave_octopus', 3, 4, 50, 82, 537], ['kappa', 2, 3, 40, 82, 547],
  ],
  catacumbas: [
    ['flame_skull', 3, 4, 70, 8, 522], ['flame_skull', 2, 4, 70, 22, 519],
    ['necromancer', 2, 4, 68, 42, 512], ['black_knight', 3, 4, 65, 54, 519],
    ['red_lantern', 3, 5, 78, 42, 544], ['flame_skull', 2, 4, 70, 58, 540],
    ['hero', 3, 4, 72, 82, 537], ['red_lantern', 2, 3, 78, 82, 547],
  ],
  profundo: [
    ['abyss_tengu', 3, 4, 112, 8, 522], ['behemoth', 2, 4, 90, 22, 519],
    ['demon', 3, 4, 100, 42, 512], ['abyss_tengu', 2, 4, 112, 54, 519],
    ['abyss_samurai', 3, 5, 120, 42, 544], ['juggernaut', 2, 4, 110, 58, 540],
    ['abyss_samurai', 2, 3, 120, 82, 537], ['abyss_tengu', 2, 3, 112, 82, 547],
  ],
};

export function expand5({ old, L, spawnTile }) {
  const W = old.w, OLD_H = old.h, H = NEW_H5;
  const fail = (msg) => { throw new Error('EXPANSION5 VALIDATION FAILED: ' + msg); };
  let lastRow = 0;
  for (let i = 0; i < old.layers.collision.length; i++) if (old.layers.collision[i] === 0) lastRow = Math.floor(i / W);
  if (Y5 - 1 - lastRow < 26) fail(`o bloco novo precisa de >= 26 linhas de vazio até o último tile andável (y ${lastRow})`);
  const map = new GameMap(W, H, old.ts);
  for (const k of Object.keys(map.layers)) map.layers[k].set(old.layers[k]);
  map.occ.set(old.occ);
  map.objects = old.objects.slice();
  map.nextId = old.nextId;
  const idx = (x, y) => y * W + x;
  const inb = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  const prop = (o, n) => o.properties?.find((p) => p.name === n)?.value;
  const oldPortals = old.objects.filter((o) => o.type === 'portal').map((o) => [o.x / 16, o.y / 16, prop(o, 'toX'), prop(o, 'toY')]);
  const rng = mulberry32(20261025);
  const pick = (a) => a[Math.floor(rng() * a.length)];

  // vazio sólido em todas as linhas novas
  for (let y = OLD_H; y < H; y++) for (let x = 0; x < W; x++) { map.put('ground', x, y, 'O', 1, 1); map.block(x, y); }

  // ================================================================== piso
  const STYLE = { cave: 1, temple: 2, dark: 3, abyss: 4 };
  const floorG = new Uint8Array(W * H);
  const carve = (x0, y0, x1, y1, style, chamfer = 0) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (chamfer) { const dx = Math.min(x - x0, x1 - x), dy = Math.min(y - y0, y1 - y); if (dx + dy < chamfer) continue; }
      floorG[idx(x, y)] = style;
    }
  };
  for (const c of CAVES) for (const [dx0, y0, dx1, y1, ch] of ROOMS) {
    const a = X(c, dx0), b = X(c, dx1);
    carve(Math.min(a, b), y0, Math.max(a, b), y1, STYLE[c.style], ch);
  }
  // pilares de rocha nas salas grandes (quebram a linha de visão e dão onde se esconder)
  for (const c of CAVES) for (const [dx, y] of [[14, 518], [14, 526], [48, 510], [48, 522], [40, 538], [58, 548], [80, 535], [86, 548]]) floorG[idx(X(c, dx), y)] = 0;

  const isFloor = (x, y) => inb(x, y) && floorG[idx(x, y)] !== 0;
  const wall = new Uint8Array(W * H);
  for (let y = Y5 - 2; y < H; y++) for (let x = 0; x < W; x++) {
    if (isFloor(x, y)) continue;
    let w = false;
    for (let j = -1; j <= 1 && !w; j++) for (let i = -1; i <= 1; i++) if (isFloor(x + i, y + j)) { w = true; break; }
    if (!w && isFloor(x, y + 2)) w = true;
    if (w) wall[idx(x, y)] = 1;
  }
  const isWall = (x, y) => inb(x, y) && wall[idx(x, y)] === 1;
  for (let y = 0; y < OLD_H; y++) for (let x = 0; x < W; x++) if (isFloor(x, y) || isWall(x, y)) fail(`cave encosta no mapa antigo em ${x},${y}`);

  for (let y = Y5 - 2; y < H; y++) for (let x = 0; x < W; x++) {
    const f = floorG[idx(x, y)];
    if (f) {
      map.block(x, y, false);
      if (f === STYLE.dark || f === STYLE.abyss) { const [c, r] = pick([[20, 14], [21, 14], [20, 15], [21, 15]]); map.put('ground', x, y, 'I', c, r); }
      else if (f === STYLE.temple) map.put('ground', x, y, 'I', 15 + (x & 3), 6 + (y & 3));
      else { let [c, r] = [12, 15]; if (rng() < 0.05) [c, r] = pick([[11, 18], [12, 18]]); map.put('ground', x, y, 'C', c, r); }
    } else if (isWall(x, y)) {
      const above = isWall(x, y - 1), below = isWall(x, y + 1), left = isWall(x - 1, y), right = isWall(x + 1, y);
      const row = isFloor(x, y + 1) ? 2 : !above ? 0 : !below ? 2 : 1;
      map.put('deco', x, y, 'R', !left ? 4 : !right ? 6 : 5, row); map.block(x, y);
    }
  }

  // ================================================================== portas e chegadas
  const doorDefs = [];
  for (const c of CAVES) {
    const exit = [X(c, DOOR_DX), ROOMS[0][1] - 1], arrival = [X(c, DOOR_DX), ROOMS[0][1] - 1 + ARRIVAL_DY];
    c.exit = exit; c.arrival = arrival;
    doorDefs.push({ cave: c.id, at: c.door, to: arrival, req: { minLevel: c.minLevel } });   // região → cave (porta com level)
    doorDefs.push({ cave: c.id, at: exit, to: c.ret, art: ['D', c.style === 'cave' ? 1 : 2, 0] }); // cave → região
  }
  for (const d of doorDefs) if (d.art) { map.put('deco', d.at[0], d.at[1], ...d.art); map.block(d.at[0], d.at[1], false); }

  // ================================================================== spawns, luzes e decoração
  const spawns = [];
  for (const c of CAVES) for (const [m, count, radius, level, dx, y] of SPAWNS[c.id]) spawns.push([m, count, radius, level, X(c, dx), y]);
  const lights = [];
  const light = (x, y, radius, color, flicker) => lights.push([x, y, radius, color, flicker]);
  const brazier = (x, y, color) => { map.layers.deco[idx(x, y)] = L.S.brazier; map.block(x, y); light(x, y, 6, color, true); };
  const BRAZ = { cave: '#ffb050', temple: '#9aff70', dark: '#c070ff', abyss: '#ff3020' };
  for (const c of CAVES) {
    // entrada iluminada (cantos da sala 0) e o covil (cantos da sala 4)
    for (const [dx, y] of [[5, 504], [13, 504], [75, 532], [89, 532], [75, 550], [89, 550]]) brazier(X(c, dx), y, BRAZ[c.style]);
    light(c.exit[0], c.exit[1] + 1, 3, '#ffe066', true);
  }
  const protect = new Set(spawns.map((s) => `${s[4]},${s[5]}`).concat(doorDefs.flatMap((d) => [d.to.join(), d.at.join()])));
  const nearProtected = (x, y) => { for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) if (protect.has(`${x + i},${y + j}`)) return true; return false; };
  for (let y = Y5; y < H; y++) for (let x = 0; x < W; x++) {
    const f = floorG[idx(x, y)];
    if (!f || map.layers.deco[idx(x, y)] || nearProtected(x, y)) continue;
    let open = true; for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (!isFloor(x + i, y + j)) open = false;
    if (!open) continue;
    if (f === STYLE.abyss) {
      if (rng() < 0.03) { map.layers.deco[idx(x, y)] = pick(L.S.crackLava); light(x, y, 3, '#ff4020', true); }
      else if (rng() < 0.015) map.layers.deco[idx(x, y)] = pick(L.S.bone);
    } else if (f === STYLE.dark) {
      if (rng() < 0.025) map.layers.deco[idx(x, y)] = pick(L.S.bone);
      else if (rng() < 0.012) map.layers.deco[idx(x, y)] = pick(L.S.cobweb);
    } else if (f === STYLE.temple) {
      if (rng() < 0.02) map.layers.deco[idx(x, y)] = pick(L.S.shroomBrown);
      else if (rng() < 0.01) map.layers.deco[idx(x, y)] = pick(L.S.cobweb);
    } else if (rng() < 0.02) map.put('deco', x, y, 'FD', pick([5, 6, 7, 14, 15]), 0);
    else if (rng() < 0.012) { map.layers.deco[idx(x, y)] = pick(L.S.stalag); map.block(x, y); }
  }

  // ================================================================== OBJETOS (depois de todos os antigos)
  for (const d of doorDefs) map.tileObj('portal', d.at[0], d.at[1], { toX: d.to[0], toY: d.to[1], ...(d.req ?? {}) }, d.req ? 'quest_door' : 'portal');
  for (const [m, count, radius, level, x, y] of spawns) map.tileObj('monster_spawn', x, y, { monster: m, count, radius, level }, m);
  for (const c of CAVES) {
    const x0 = c.x - 1, x1 = c.x + 92;
    map.addObject({ type: 'zone', name: c.name, x: x0 * 16, y: (Y5 - 2) * 16, width: (x1 - x0 + 1) * 16, height: (H - Y5 + 2) * 16, rect: true, props: { music: c.music } });
  }
  for (const [x, y, radius, color, flicker] of lights) map.tileObj('light', x, y, { radius, color, flicker }, 'light');

  // ================================================================== VALIDAÇÃO
  const newPortals = doorDefs.map((d) => [d.at[0], d.at[1], d.to[0], d.to[1]]);
  const portalMap = new Map(oldPortals.concat(newPortals).map(([x, y, tx, ty]) => [x + ',' + y, [tx, ty]]));
  const pointObjs = old.objects.filter((o) => o.point || o.type === 'npc' || o.type === 'portal' || o.type === 'monster_spawn').map((o) => [Math.floor(o.x / 16), Math.floor(o.y / 16)]);
  for (const c of CAVES) {
    const [dx, dy] = c.door, [rx, ry] = c.ret;
    if (old.layers.collision[dy * W + dx] !== 0) fail(`entrada ${c.id} ${dx},${dy} bloqueada no mapa antigo`);
    if (pointObjs.some(([a, b]) => a === dx && b === dy)) fail(`entrada ${c.id} ${dx},${dy} tem objeto antigo em cima`);
    if (oldPortals.some(([, , tx, ty]) => tx === dx && ty === dy)) fail(`entrada ${c.id} é destino de um portal antigo`);
    if (old.layers.collision[ry * W + rx] !== 0) fail(`retorno ${c.id} ${rx},${ry} bloqueado`);
    if (portalMap.has(`${rx},${ry}`)) fail(`retorno ${c.id} é um portal`);
    if (Math.max(Math.abs(rx - dx), Math.abs(ry - dy)) !== 1) fail(`retorno ${c.id} não é vizinho da entrada`);
  }
  for (const [x, y, tx, ty] of newPortals) {
    if (map.blocked(x, y)) fail(`portal ${x},${y} bloqueado`);
    if (map.blocked(tx, ty)) fail(`destino de portal ${tx},${ty} bloqueado`);
    if (portalMap.has(tx + ',' + ty)) fail(`destino de portal ${tx},${ty} é ele mesmo um portal`);
  }
  for (const [m, , radius, , x, y] of spawns) {
    if (map.blocked(x, y)) fail(`spawn ${m} em ${x},${y} bloqueado`);
    for (const d of doorDefs) if (Math.max(Math.abs(d.to[0] - x), Math.abs(d.to[1] - y)) <= radius + 4) fail(`spawn ${m} em ${x},${y} perto demais da chegada ${d.to}`);
  }
  const reach = bfs(map, spawnTile[0], spawnTile[1], portalMap);
  const R = (x, y) => reach[idx(x, y)] === 1;
  let walk = 0, reached = 0;
  const lost = [];
  for (let y = OLD_H; y < H; y++) for (let x = 0; x < W; x++) {
    if (map.layers.collision[idx(x, y)]) continue;
    walk++;
    if (R(x, y)) reached++; else lost.push(`${x},${y}`);
  }
  for (const [m, , , , x, y] of spawns) if (!R(x, y)) fail(`spawn ${m} em ${x},${y} inalcançável`);
  console.log(`expansion5: ${W}x${H}, ${CAVES.length} caves, ${newPortals.length} portais, ${spawns.length} spawns (${spawns.reduce((s, x) => s + x[1], 0)} monstros), ${lights.length} luzes; ${reached}/${walk} tiles andáveis alcançáveis`);
  if (lost.length) fail(`${lost.length} tiles andáveis das caves inalcançáveis: ${lost.slice(0, 20).join(' ')}`);
  return { map, reach, portalMap, caves: CAVES };
}

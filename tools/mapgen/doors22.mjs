// Portas de sala (ciclo 22, pedido do dono: "portal para entrar numa sala e outro ao lado para sair, sem nexo"; viagem só
// nos NPCs). Última etapa do gerador, sobre o mapa já publicado:
//   1. Tira os portais de VIAGEM (já há NPC de viagem fazendo o mesmo trajeto) e os pares "porta-portal + saída" das salas.
//   2. Põe no lugar objetos "door" (shared/data/doors.ts) na parede da sala: usar para abrir/fechar, como no Tibia.
//   3. Onde a sala ficava atrás de rocha grossa (5 a 10 tiles), cava um corredor de 1 tile com o chão de dentro da sala e
//      levanta parede dos dois lados dele (a mesma regra de parede da caverna ou a parede da fábrica), para o corredor não
//      virar uma faixa de chão solta no vazio.
//   4. A arte da porta é a do próprio lugar (prop `art`: tiles que o cliente troca entre fechada e aberta):
//      caverna = o bloco de fechadura que já marcava a porta-portal (aberta = o chão); Siderúrgica = a folha do portão de
//      correr que já estava no tile (aberta = a folha some e sobra a outra metade, portão meio aberto); Pátio de Minério =
//      a cancela (fechada = braço deitado; aberta = braço erguido). Ciclo 23: nas cavernas, na Siderúrgica e na Montadora
//      a porta passou a ser a do Tibia (batente + folha, doors23.mjs); a cancela continua.
// Ficam como portal as entradas de área separada (caves, cripta, labirinto, abismo, Caverna do Yeti, Cidadela, Túnel da
// Serra, Salão de Minijogos, a escotilha do Coração do Forno e a rampa da Sala dos Protótipos, que descem para uma área de
// baixo) e as saídas das salas de recompensa (tesouro da Aniquilação, Boxe dos Troféus).
//
// EXCEÇÃO CONTROLADA ao "0 tiles alterados", autorizada pelo dono (2026-11-09): tiles mudam SÓ nos corredores cavados
// e nas paredes ao lado deles (retângulos de DOOR_RECTS, os mesmos do `diff-world.mjs --allow`); nenhum tileset novo; tiles Lemon novos só no fim do
// atlas (painel de portão, cancela erguida; `diff-atlas.mjs` prova os antigos iguais). Objetos: os
// portais removidos saem da lista (ids em REMOVED_IDS, para o `diff-world.mjs --removed`) e as portas entram no fim.
import { bfs } from './lib.mjs';
import { DOOR_FRAME_RECTS, doorArt23 } from './doors23.mjs';

/** Portais de viagem removidos (tile do portal). O trajeto segue pelos NPCs de viagem (shared/data/npcs.ts). */
const TRAVEL = [
  [99, 79], [63, 321],   // Vila ↔ Oficina dos Engenhos (Cocheiro da Vila / Cocheiro da Oficina)
  [99, 104], [44, 371],  // Vila ↔ Estação Central da Malha (chefes de estação)
  [46, 384], [8, 591],   // Estação Central → Estação do Minério (chefe da Malha / chefe do Minério)
  [83, 332], [219, 776], // Oficina → Portaria da Montadora (Cocheiro da Oficina / motorista da Montadora)
];

/** Chegadas das viagens de NPC (TravelDest de shared/data/npcs.ts), conferidas em shared/data/doors.test.ts. */
export const TRAVEL_HUBS = [[97, 98], [214, 61], [372, 64], [83, 330], [60, 374], [24, 594], [232, 758]];

/**
 * Portas: `door` = tile da porta (numa parede, com um lado andável fora); `inside` = primeiro tile de dentro (a antiga
 * chegada do portal); `portals` = portais que a porta substitui; `req` = requisito (o mesmo da antiga porta-portal).
 * O corredor (se houver rocha entre a porta e a sala) sai sozinho: o caminho mais curto por tiles bloqueados até a sala.
 * `kind` = de onde vem a arte (ver o cabeçalho): 'caverna' | 'portao' (Siderúrgica) | 'cancela' | 'fabrica' (Montadora).
 */
export const DOORS = [
  // --- cavernas antigas (rocha grossa: corredor)
  { id: 'piratas_tesouro', kind: 'caverna', door: [353, 159], inside: [360, 159], req: { minLevel: 35 }, portals: [[353, 159], [357, 159]] },
  { id: 'banuta_santuario', kind: 'caverna', door: [384, 171], inside: [384, 180], req: { minLevel: 40 }, portals: [[384, 171], [384, 177]] },
  { id: 'herois_salao', kind: 'caverna', door: [291, 242], inside: [291, 252], req: { minLevel: 60 }, portals: [[291, 242], [291, 249]] },
  { id: 'cidadela_salao', kind: 'caverna', door: [220, 221], inside: [220, 230], req: { minLevel: 100 }, portals: [[220, 221], [220, 227]] },
  { id: 'yeti_ninho', kind: 'caverna', door: [335, 219], inside: [345, 203], req: { quest: 'yeti_hunt' }, portals: [[335, 219], [341, 203]] },
  { id: 'aniquilacao_tesouro', kind: 'caverna', door: [197, 277], inside: [206, 278], portals: [[197, 277]] }, // salão da Aniquilação → tesouro; a saída (209,273) fica
  { id: 'goroma_cratera', kind: 'caverna', door: [372, 96], inside: [372, 98], req: { minLevel: 80 }, portals: [[372, 96], [374, 96]] },
  // --- Siderúrgica (cerca/parede de 1 tile). A porta do Pátio é o braço da cancela (24,607); o pedestal (23,607) fica.
  // O Coração do Forno (escotilha 34,672) segue portal: desce para a área de baixo, como uma cave.
  { id: 'sid_patio', kind: 'cancela', door: [24, 607], inside: [24, 609], req: { minLevel: 10 }, portals: [[23, 606], [24, 608]] },
  { id: 'sid_correias', kind: 'portao', door: [100, 604], inside: [102, 604], req: { minLevel: 25 }, portals: [[99, 604], [101, 605]] },
  { id: 'sid_altoforno', kind: 'portao', door: [152, 627], inside: [152, 629], req: { minLevel: 40 }, portals: [[152, 626], [153, 628]] },
  { id: 'sid_aciaria', kind: 'portao', door: [123, 652], inside: [121, 652], req: { minLevel: 60 }, portals: [[124, 652], [122, 653]] },
  { id: 'sid_lingotamento', kind: 'portao', door: [65, 660], inside: [63, 660], req: { minLevel: 80 }, portals: [[66, 660], [64, 661]] },
  // --- Montadora
  { id: 'mt_estamparia', kind: 'fabrica', door: [320, 766], inside: [323, 766], req: { minLevel: 25 }, portals: [[320, 766], [320, 769]] },
  { id: 'mt_funilaria', kind: 'fabrica', door: [256, 792], inside: [256, 795], req: { minLevel: 40 }, portals: [[256, 792], [260, 792]] },
  { id: 'mt_pintura', kind: 'fabrica', door: [300, 804], inside: [304, 804], req: { minLevel: 60 }, portals: [[300, 804], [301, 808]] },
  { id: 'mt_montagem', kind: 'fabrica', door: [311, 818], inside: [311, 822], req: { minLevel: 80 }, portals: [[311, 818], [306, 819]] },
  { id: 'mt_pista', kind: 'fabrica', door: [316, 830], inside: [320, 830], req: { minLevel: 90 }, portals: [[316, 830], [316, 838]] },
  // a Sala dos Protótipos (rampa 387,840) segue portal: desce para a área de baixo
  { id: 'mt_boxe', kind: 'fabrica', door: [261, 858], inside: [267, 858], portals: [[261, 858]] }, // a saída do Boxe (270,853) fica
];

/** Corredores cavados (retângulos inclusivos [x0,y0,x1,y1]): calculados por `placeDoors22` e conferidos aqui. */
export const DOOR_RECTS = {
  piratas_tesouro: [354, 157, 357, 160],
  banuta_santuario: [383, 172, 385, 177],
  herois_salao: [290, 243, 292, 249],
  cidadela_salao: [219, 222, 221, 227],
  yeti_ninho: [336, 202, 346, 220],
  aniquilacao_tesouro: [198, 275, 203, 278],
  mt_pintura: [300, 804, 301, 804],
  mt_montagem: [311, 818, 311, 819],
  mt_boxe: [261, 857, 265, 859],
  goroma_cratera: [370, 96, 376, 96],
  mt_estamparia: [320, 766, 320, 766],
  mt_funilaria: [256, 792, 256, 792],
  mt_pista: [316, 830, 316, 830],
  // saídas antigas no meio da parede (andáveis só por serem portal): fechadas, senão viravam passagem livre ao lado da porta
  goroma_cratera_saida: [374, 96, 374, 96],
  mt_estamparia_saida: [320, 769, 320, 769],
  mt_funilaria_saida: [260, 792, 260, 792],
  mt_pista_saida: [316, 838, 316, 838],
  // o próprio tile da porta, quando era portal numa parede (andável): fica bloqueado também na camada de colisão
};

export function placeDoors22({ map, spawnTile, lemon }) {
  const W = map.w, idx = (x, y) => y * W + x;
  const fail = (msg) => { throw new Error('DOORS22 VALIDATION FAILED: ' + msg); };
  const prop = (o, n) => o.properties?.find((p) => p.name === n)?.value;
  const tileOf = (o) => [Math.floor(o.x / 16), Math.floor(o.y / 16)];
  const isPortalAt = (x, y) => (o) => o.type === 'portal' && tileOf(o)[0] === x && tileOf(o)[1] === y;
  const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  // ---- 1. portais removidos (viagem + pares das salas) e as luzes que marcavam exatamente esses tiles
  const gone = [...TRAVEL, ...DOORS.flatMap((d) => d.portals)];
  const removedIds = [];
  for (const [x, y] of gone) {
    const o = map.objects.find(isPortalAt(x, y));
    if (!o) fail(`não há portal em ${x},${y}`);
    removedIds.push(o.id);
  }
  for (const o of map.objects) {
    if (o.type !== 'light') continue;
    const [x, y] = tileOf(o);
    if (gone.some(([gx, gy]) => gx === x && gy === y)) removedIds.push(o.id);
  }
  map.objects = map.objects.filter((o) => !removedIds.includes(o.id));
  const portalMap = new Map(map.objects.filter((o) => o.type === 'portal').map((o) => [tileOf(o).join(','), [prop(o, 'toX'), prop(o, 'toY')]]));

  // ---- 2. corredores: caminho mais curto (4 direções) por tiles bloqueados, da porta até a sala (componente de `inside`)
  const before = { ground: map.layers.ground.slice(), deco: map.layers.deco.slice(), above: map.layers.above.slice(), collision: map.layers.collision.slice() };
  // Porta é parede (o objeto bloqueia em jogo; aqui também, para separar a sala do lado de fora).
  const doorSet = new Set(DOORS.map((d) => d.door.join(',')));
  const wall = (x, y) => map.blocked(x, y) || doorSet.has(`${x},${y}`);
  const comp = (sx, sy) => { // tiles andáveis ligados a pé (sem portais), a partir de (sx,sy)
    const seen = new Uint8Array(W * map.h), q = [[sx, sy]];
    seen[idx(sx, sy)] = 1;
    while (q.length) {
      const [x, y] = q.pop();
      for (const [dx, dy] of N4) {
        const nx = x + dx, ny = y + dy;
        if (!map.inb(nx, ny) || seen[idx(nx, ny)] || wall(nx, ny)) continue;
        seen[idx(nx, ny)] = 1; q.push([nx, ny]);
      }
    }
    return seen;
  };
  // Saídas das salas que eram um tile andável no meio da parede (ligam os dois lados sem o portal): bloqueia.
  const sealed = [];
  for (const d of DOORS) for (const [x, y] of d.portals) {
    if (doorSet.has(`${x},${y}`) || map.blocked(x, y)) continue;
    map.block(x, y);
    const nb = N4.map(([a, b]) => [x + a, y + b]).filter(([nx, ny]) => !wall(nx, ny));
    const first = nb.length ? comp(nb[0][0], nb[0][1]) : null;
    if (first && nb.some(([nx, ny]) => !first[idx(nx, ny)])) { sealed.push([d.id, x, y]); continue; }
    map.block(x, y, false); // recanto sem saída: fica como estava
  }
  const carved = {};
  for (const d of DOORS) {
    const [dx0, dy0] = d.door, [ix, iy] = d.inside;
    if (N4.filter(([a, b]) => wall(dx0 + a, dy0 + b)).length < 2) fail(`${d.id}: a porta ${dx0},${dy0} não está numa parede`);
    if (wall(ix, iy)) fail(`${d.id}: o tile de dentro ${ix},${iy} está bloqueado`);
    const inside = comp(ix, iy);
    if (N4.some(([a, b]) => inside[idx(dx0 + a, dy0 + b)])) { carved[d.id] = []; continue; }
    // BFS pelas paredes; a porta não conta como corredor
    const prev = new Map([[idx(dx0, dy0), -1]]);
    const q = [[dx0, dy0]];
    let end = -1;
    for (let k = 0; k < q.length && end < 0; k++) {
      const [x, y] = q[k];
      for (const [a, b] of N4) {
        const nx = x + a, ny = y + b, i = idx(nx, ny);
        if (!map.inb(nx, ny) || prev.has(i)) continue;
        if (inside[i]) { if (!(x === dx0 && y === dy0)) { prev.set(i, idx(x, y)); end = idx(x, y); } break; }
        if (!wall(nx, ny)) continue; // chão de outra área: o corredor não passa por ela
        prev.set(i, idx(x, y)); q.push([nx, ny]);
      }
    }
    if (end < 0) fail(`${d.id}: sem corredor possível da porta até a sala`);
    const tiles = [];
    for (let i = end; i !== idx(dx0, dy0); i = prev.get(i)) tiles.push([i % W, Math.floor(i / W)]);
    const floor = map.get('ground', ix, iy);
    for (const [x, y] of tiles) { map.set('ground', x, y, floor); map.set('deco', x, y, 0); map.set('above', x, y, 0); map.block(x, y, false); }
    carved[d.id] = tiles;
  }

  // ---- 2b. paredes dos lados do corredor e arte da porta (ver o cabeçalho)
  const VOID = map.get('ground', 0, map.h - 1); // o canto do mapa é vazio
  const isVoid = (x, y) => map.inb(x, y) && map.get('ground', x, y) === VOID && !map.get('deco', x, y);
  const floor = (x, y) => map.inb(x, y) && !map.blocked(x, y) && !doorSet.has(`${x},${y}`);
  const art = {}; // id → [[camada, dx, dy, fechada, aberta], ...]
  const I = lemon.industry();
  // estilo da parede industrial pelo gid (chaves do atlas: ind_parede_<estilo>:<hash>; sem criar tile nenhum)
  const wallStyle = new Map();
  for (const [key, id] of lemon.set.keys) { const m = /^ind_parede_(metal|concrete):/.exec(key); if (m) wallStyle.set(lemon.t.firstgid + id, m[1]); }
  const relief = new Set(); for (let c = 4; c <= 6; c++) for (let r = 0; r <= 2; r++) relief.add(map.ts.gid('R', c, r));
  for (const d of DOORS) {
    const [dx0, dy0] = d.door, tiles = carved[d.id];
    const inFloor = map.get('ground', d.inside[0], d.inside[1]);
    const doorDeco = map.get('deco', dx0, dy0);
    if (d.kind === 'caverna') {
      // as antigas saídas (buraco/caveira na parede da sala de dentro) viram chão: o corredor entra pela abertura
      const seeds = [...tiles, d.door];
      for (const [x, y] of d.portals) {
        if (x === dx0 && y === dy0) continue;
        seeds.push([x, y]);
        if (floor(x, y)) { map.set('ground', x, y, inFloor); map.set('deco', x, y, 0); map.set('above', x, y, 0); }
      }
      // regra de parede da caverna (generate.mjs): não-chão a 1 tile (8 vizinhos) de chão, ou com chão 2 tiles abaixo
      const shouldWall = (x, y) => {
        if (floor(x, y)) return false;
        for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (floor(x + i, y + j)) return true;
        return floor(x, y + 2);
      };
      const cells = new Map();
      for (const [sx, sy] of seeds) for (let j = -3; j <= 3; j++) for (let i = -2; i <= 2; i++) {
        const x = sx + i, y = sy + j, k = `${x},${y}`;
        if (!map.inb(x, y) || cells.has(k) || doorSet.has(k) || floor(x, y)) continue;
        const deco = map.get('deco', x, y);
        if (!(isVoid(x, y) || relief.has(deco) || sealed.some(([, a, b]) => a === x && b === y))) continue;
        if (shouldWall(x, y)) cells.set(k, [x, y]);
      }
      const isW = (x, y) => cells.has(`${x},${y}`) || doorSet.has(`${x},${y}`) || relief.has(map.get('deco', x, y));
      const paint = [];
      for (const [x, y] of cells.values()) {
        const row = floor(x, y + 1) ? 2 : !isW(x, y - 1) ? 0 : !isW(x, y + 1) ? 2 : 1;
        const col = !isW(x - 1, y) ? 4 : !isW(x + 1, y) ? 6 : 5;
        paint.push([x, y, map.ts.gid('R', col, row)]);
      }
      for (const [x, y, g] of paint) { map.set('ground', x, y, VOID); map.set('deco', x, y, g); map.set('above', x, y, 0); map.block(x, y); }
      if (!doorDeco) fail(`${d.id}: porta de caverna sem a arte de fechadura no tile`);
      // ciclo 23: porta de madeira com moldura de pedra, como no Tibia (doors23.mjs), no lugar do bloco de fechadura
      art[d.id] = doorArt23({ map, lemon, d }).art;
    } else if (d.kind === 'portao') {
      if (!doorDeco) fail(`${d.id}: porta sem a folha do portão no tile`);
      // ciclo 23: porta de aço no lugar da folha listrada; a outra folha ao lado vira parede (doors23.mjs)
      art[d.id] = doorArt23({ map, lemon, d }).art;
    } else if (d.kind === 'cancela') {
      const ped = map.get('deco', dx0 - 1, dy0);
      if (!doorDeco || !ped) fail(`${d.id}: cancela incompleta em ${dx0 - 1}..${dx0},${dy0}`);
      if (map.get('above', dx0 - 1, dy0 - 1)) fail(`${d.id}: já há arte acima do pedestal`);
      const [top, base] = cancelaErguida(lemon);
      art[d.id] = [['deco', 0, 0, doorDeco, 0], ['deco', -1, 0, ped, base], ['above', -1, -1, 0, top]];
    } else if (d.kind === 'fabrica') {
      if (doorDeco) fail(`${d.id}: o vão da porta já tem arte`);
      // corredor por cima do vazio entre duas paredes: parede da fábrica dos dois lados
      if (tiles.length) {
        let style = null; // a parede mais perto da porta
        for (let j = -3; j <= 3 && !style; j++) for (let i = -3; i <= 3 && !style; i++) style = wallStyle.get(map.get('deco', dx0 + i, dy0 + j)) ?? null;
        const ground = map.get('ground', dx0, dy0 - 1);
        const add = new Map();
        for (const [x, y] of tiles) for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (isVoid(x + i, y + j)) add.set(`${x + i},${y + j}`, [x + i, y + j]);
        const solid = (x, y) => add.has(`${x},${y}`) || (map.blocked(x, y) && !isVoid(x, y));
        const paint = [...add.values()].map(([x, y]) => [x, y, I.wall(style ?? fail(`${d.id}: sem parede industrial perto da porta`), { n: solid(x, y - 1), e: solid(x + 1, y), s: solid(x, y + 1), w: solid(x - 1, y) })]);
        for (const [x, y, g] of paint) { map.set('ground', x, y, ground); map.set('deco', x, y, g); map.block(x, y); }
      }
      // ciclo 23: porta de aço no vão (doors23.mjs), no lugar do painel listrado; as folhas de portão ao lado viram parede
      art[d.id] = doorArt23({ map, lemon, d }).art;
    } else fail(`${d.id}: kind desconhecido ${d.kind}`);
  }

  // ---- 3. validação: corredor dentro do retângulo declarado, que só encosta na sala; porta com exatamente dois lados
  const inRect = ([x0, y0, x1, y1], x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
  for (const d of DOORS) {
    const rect = DOOR_RECTS[d.id], tiles = carved[d.id];
    if (tiles.length && !rect) fail(`${d.id}: corredor de ${tiles.length} tiles sem retângulo em DOOR_RECTS`);
    for (const [x, y] of tiles) if (!inRect(rect, x, y)) fail(`${d.id}: corredor sai do retângulo em ${x},${y}`);
    const inside = comp(d.inside[0], d.inside[1]);
    const [x, y] = d.door;
    const sides = N4.map(([a, b]) => [x + a, y + b]).filter(([sx, sy]) => !wall(sx, sy));
    if (sides.length !== 2) fail(`${d.id}: a porta ${x},${y} tem ${sides.length} lados andáveis (precisa de 2)`);
    const outSides = sides.filter(([sx, sy]) => !inside[idx(sx, sy)]);
    if (outSides.length !== 1) fail(`${d.id}: a porta ${x},${y} não separa a sala do lado de fora (${outSides.length} lado(s) fora)`);
    if (inside[idx(outSides[0][0], outSides[0][1])]) fail(`${d.id}: a sala já era alcançável pelo lado de fora`);
  }
  for (const [id, x, y] of sealed) if (!inRect(DOOR_RECTS[`${id}_saida`] ?? [-1, -1, -1, -1], x, y)) fail(`${id}: saída fechada em ${x},${y} fora de DOOR_RECTS.${id}_saida`);
  for (const [k, r] of Object.entries(DOOR_RECTS)) if (k.endsWith('_saida') && !sealed.some(([id, x, y]) => `${id}_saida` === k && inRect(r, x, y))) fail(`DOOR_RECTS.${k} sem saída fechada`);
  // nenhum tile fora dos retângulos mudou (corredores do ciclo 22 e, no ciclo 23, a porta e a linha da parede em volta)
  const rects = [...Object.values(DOOR_RECTS), ...Object.values(DOOR_FRAME_RECTS)];
  const changed = [];
  for (const k of Object.keys(before)) {
    const now = map.layers[k];
    for (let i = 0; i < now.length; i++) if (now[i] !== before[k][i]) changed.push([i % W, Math.floor(i / W), k]);
  }
  if (process.env.DOORS22_DEBUG) { // caixa das mudanças de cada porta (para conferir DOOR_RECTS)
    const dist = (x, y, o) => Math.abs(x - o.door[0]) + Math.abs(y - o.door[1]);
    for (const d of DOORS) {
      const near = changed.filter(([x, y]) => DOORS.every((o) => dist(x, y, o) >= dist(x, y, d)));
      if (near.length) console.log(`doors22 ${d.id}: [${Math.min(...near.map((c) => c[0]))}, ${Math.min(...near.map((c) => c[1]))}, ${Math.max(...near.map((c) => c[0]))}, ${Math.max(...near.map((c) => c[1]))}]`);
    }
  }
  for (const [x, y, k] of changed) if (!rects.some((r) => inRect(r, x, y))) fail(`camada ${k} mudou fora dos retângulos em ${x},${y}`);

  // ---- 4. objetos de porta no fim (ids novos)
  for (const d of DOORS) {
    // art: "camada,dx,dy,gidFechada,gidAberta;..." (gid 0 = sem tile), trocado pelo cliente (client/game/doors.ts)
    const props = { doorId: d.id, art: art[d.id].map((a) => a.join(',')).join(';'), inside: d.inside.join(','), ...(d.req ?? {}) };
    map.tileObj('door', d.door[0], d.door[1], props, d.id);
  }

  // ---- 5. alcançável: com as portas como passagem, toda sala continua alcançável do templo ou de uma chegada de viagem
  // (sem os portais de viagem, Oficina, Malha, Siderúrgica e Montadora só se alcançam pelos NPCs; o servidor faz igual)
  const doorTiles = new Set(DOORS.map((d) => d.door.join(',')));
  const reach = new Uint8Array(W * map.h);
  // bfs trata tile bloqueado como parede; a porta, que pode ser andável na camada (era portal), entra como passagem
  // e dos destinos das alavancas de grupo (o salão da Aniquilação só se alcança pela alavanca)
  const leverDests = map.objects.filter((o) => o.type === 'quest_lever')
    .flatMap((o) => String(prop(o, 'dests') ?? '').split(';').filter(Boolean).map((t) => t.split(',').map(Number)));
  for (const [sx, sy] of [spawnTile, ...TRAVEL_HUBS, ...leverDests]) {
    if (map.blocked(sx, sy)) fail(`chegada de viagem ${sx},${sy} bloqueada`);
    const r = bfs(map, sx, sy, portalMap, doorTiles);
    for (let i = 0; i < r.length; i++) reach[i] |= r[i];
  }
  for (const d of DOORS) if (!reach[idx(d.inside[0], d.inside[1])]) fail(`${d.id}: a sala não é alcançável pela porta`);
  const n = Object.values(carved).reduce((s, t) => s + t.length, 0);
  console.log(`doors22: saídas fechadas ${sealed.map(([, x, y]) => `${x},${y}`).join(' ') || 'nenhuma'}`);
  console.log(`doors22: ${DOORS.length} portas, ${removedIds.length} objetos removidos (${gone.length} portais), ${n} tiles de corredor`);
  // ciclo 23: a porta e as folhas antigas trocadas pela parede, para o `diff-world.mjs --allow`
  console.log(`doors23: retângulos ${Object.values(DOOR_FRAME_RECTS).map((r) => r.join(',')).join(' ')}`);
  return { removedIds };
}

// ---- arte nova (fim do atlas Lemon)
const OL = '#141b1b';
/** cancela erguida (pedestal da cancela da passagem de nível com o braço em pé): [gid de cima (above), gid do pedestal] */
function cancelaErguida(L) {
  const cv = new L.Cv(16, 32), o = 16; // mesmo pedestal de lemon.mjs gateCv, um tile para baixo
  const R1 = '#d14b34', R2 = '#f2eaf1';
  cv.rect(3, o + 4, 3, 11, '#5d6264'); cv.rect(2, o + 13, 5, 2, '#3d3a3c'); cv.rect(1, o + 5, 2, 4, '#3d3a3c');
  for (let y = 3; y < o + 7; y++) cv.rect(5, y, 2, 1, ((y >> 2) & 1) ? R1 : R2);
  cv.set(4, o + 3, '#ff5a3c'); cv.glow(4, o + 3, 4, '#ff6a4a', 50);
  cv.outline();
  return [L.tile('porta22_cancela_erguida:0', () => cv.slice(0, 0)), L.tile('porta22_cancela_erguida:1', () => cv.slice(0, 1))];
}

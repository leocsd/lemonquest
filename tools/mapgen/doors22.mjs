// Portas de sala (ciclo 22, pedido do dono: "portal para entrar numa sala e outro ao lado para sair, sem nexo"; viagem só
// nos NPCs). Última etapa do gerador, sobre o mapa já publicado:
//   1. Tira os portais de VIAGEM (já há NPC de viagem fazendo o mesmo trajeto) e os pares "porta-portal + saída" das salas.
//   2. Põe no lugar objetos "door" (shared/data/doors.ts) na parede da sala: usar para abrir/fechar, como no Tibia.
//   3. Onde a sala ficava atrás de rocha grossa (5 a 10 tiles), cava um corredor de 1 tile com o chão de dentro da sala.
// Ficam como portal as entradas de área separada (caves, cripta, labirinto, abismo, Caverna do Yeti, Cidadela, Túnel da
// Serra, Salão de Minijogos) e as saídas das salas de recompensa (tesouro da Aniquilação, Boxe dos Troféus).
//
// EXCEÇÃO CONTROLADA ao "0 tiles alterados", autorizada pelo dono (2026-11-09): tiles mudam SÓ nos corredores cavados
// (retângulos de DOOR_RECTS, os mesmos do `diff-world.mjs --allow`); nenhum tileset ou tile Lemon novo. Objetos: os
// portais removidos saem da lista (ids em REMOVED_IDS, para o `diff-world.mjs --removed`) e as portas entram no fim.
import { bfs } from './lib.mjs';

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
 */
export const DOORS = [
  // --- cavernas antigas (rocha grossa: corredor)
  { id: 'piratas_tesouro', door: [353, 159], inside: [360, 159], req: { minLevel: 35 }, portals: [[353, 159], [357, 159]] },
  { id: 'banuta_santuario', door: [384, 171], inside: [384, 180], req: { minLevel: 40 }, portals: [[384, 171], [384, 177]] },
  { id: 'herois_salao', door: [291, 242], inside: [291, 252], req: { minLevel: 60 }, portals: [[291, 242], [291, 249]] },
  { id: 'cidadela_salao', door: [220, 221], inside: [220, 230], req: { minLevel: 100 }, portals: [[220, 221], [220, 227]] },
  { id: 'yeti_ninho', door: [335, 219], inside: [345, 203], req: { quest: 'yeti_hunt' }, portals: [[335, 219], [341, 203]] },
  { id: 'aniquilacao_tesouro', door: [197, 277], inside: [206, 278], portals: [[197, 277]] }, // salão da Aniquilação → tesouro; a saída (209,273) fica
  { id: 'goroma_cratera', door: [372, 96], inside: [372, 98], req: { minLevel: 80 }, portals: [[372, 96], [374, 96]] },
  // --- Siderúrgica (cerca/parede de 1 tile; o Coração do Forno fica atrás de rocha)
  { id: 'sid_patio', door: [23, 607], inside: [23, 609], req: { minLevel: 10 }, style: 'grade', portals: [[23, 606], [24, 608]] },
  { id: 'sid_correias', door: [100, 604], inside: [102, 604], req: { minLevel: 25 }, portals: [[99, 604], [101, 605]] },
  { id: 'sid_altoforno', door: [152, 627], inside: [152, 629], req: { minLevel: 40 }, portals: [[152, 626], [153, 628]] },
  { id: 'sid_aciaria', door: [123, 652], inside: [121, 652], req: { minLevel: 60 }, portals: [[124, 652], [122, 653]] },
  { id: 'sid_lingotamento', door: [65, 660], inside: [63, 660], req: { minLevel: 80 }, portals: [[66, 660], [64, 661]] },
  { id: 'sid_coracao', door: [34, 677], inside: [34, 686], req: { minLevel: 100 }, portals: [[34, 672], [34, 683]] },
  // --- Montadora
  { id: 'mt_estamparia', door: [320, 766], inside: [323, 766], req: { minLevel: 25 }, portals: [[320, 766], [320, 769]] },
  { id: 'mt_funilaria', door: [256, 792], inside: [256, 795], req: { minLevel: 40 }, portals: [[256, 792], [260, 792]] },
  { id: 'mt_pintura', door: [300, 804], inside: [304, 804], req: { minLevel: 60 }, portals: [[300, 804], [301, 808]] },
  { id: 'mt_montagem', door: [311, 818], inside: [311, 822], req: { minLevel: 80 }, portals: [[311, 818], [306, 819]] },
  { id: 'mt_pista', door: [316, 830], inside: [320, 830], req: { minLevel: 90 }, portals: [[316, 830], [316, 838]] },
  { id: 'mt_prototipos', door: [376, 843], inside: [376, 855], req: { minLevel: 110 }, portals: [[387, 840], [376, 852]] },
  { id: 'mt_boxe', door: [261, 858], inside: [267, 858], portals: [[261, 858]] }, // a saída do Boxe (270,853) fica
];

/** Corredores cavados (retângulos inclusivos [x0,y0,x1,y1]): calculados por `placeDoors22` e conferidos aqui. */
export const DOOR_RECTS = {
  piratas_tesouro: [354, 159, 356, 159],
  banuta_santuario: [384, 172, 384, 176],
  herois_salao: [291, 243, 291, 248],
  cidadela_salao: [220, 222, 220, 226],
  yeti_ninho: [336, 215, 345, 219],
  aniquilacao_tesouro: [198, 277, 203, 277],
  sid_coracao: [34, 678, 34, 682],
  mt_pintura: [301, 804, 301, 804],
  mt_montagem: [311, 819, 311, 819],
  mt_prototipos: [376, 844, 376, 851],
  mt_boxe: [262, 858, 265, 858],
  // saídas antigas no meio da parede (andáveis só por serem portal): fechadas, senão viravam passagem livre ao lado da porta
  goroma_cratera_saida: [374, 96, 374, 96],
  mt_estamparia_saida: [320, 769, 320, 769],
  mt_funilaria_saida: [260, 792, 260, 792],
  mt_pista_saida: [316, 838, 316, 838],
  // o próprio tile da porta, quando era portal numa parede (andável): fica bloqueado também na camada de colisão
};

export function placeDoors22({ map, spawnTile }) {
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

  // ---- 3. validação: corredor dentro do retângulo declarado, que só encosta na sala; porta com exatamente dois lados
  const inRect = ([x0, y0, x1, y1], x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
  for (const d of DOORS) {
    const rect = DOOR_RECTS[d.id], tiles = carved[d.id];
    if (tiles.length && !rect) fail(`${d.id}: corredor de ${tiles.length} tiles sem retângulo em DOOR_RECTS`);
    if (!tiles.length && rect) fail(`${d.id}: retângulo em DOOR_RECTS sem corredor`);
    if (process.env.DOORS22_DEBUG) console.log(`doors22 ${d.id}: ${tiles.map(([x, y]) => `${x},${y}`).join(" ")}`);
    else for (const [x, y] of tiles) if (!inRect(rect, x, y)) fail(`${d.id}: corredor sai do retângulo em ${x},${y}`);
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
  // nenhum tile fora dos retângulos mudou
  const rects = Object.values(DOOR_RECTS);
  for (const k of Object.keys(before)) {
    const now = map.layers[k];
    for (let i = 0; i < now.length; i++) if (now[i] !== before[k][i] && !rects.some((r) => inRect(r, i % W, Math.floor(i / W)))) fail(`camada ${k} mudou fora dos corredores em ${i % W},${Math.floor(i / W)}`);
  }

  // ---- 4. objetos de porta no fim (ids novos)
  for (const d of DOORS) {
    const props = { doorId: d.id, style: d.style ?? 'arco', inside: d.inside.join(','), ...(d.req ?? {}) };
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
  return { removedIds };
}

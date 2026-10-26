// Bocas de caverna (ciclo 17, item 17-12): o desenho das entradas das quatro caves do ciclo 13 (expansion5.mjs), que até
// aqui eram só o brilho do portal num recanto da superfície.
//
// EXCEÇÃO CONTROLADA ao "0 tiles alterados", autorizada pelo dono: esta etapa muda tiles antigos, mas SÓ dentro dos
// retângulos de ENTRANCE_RECTS (os mesmos que se passam ao `diff-world.mjs --allow`). Roda depois de todas as etapas
// publicadas (inclusive os objetos do ciclo 16), não mexe em objeto antigo e só acrescenta objetos `light` no fim.
// Nenhum tileset novo nem tile novo no atlas Lemon: só tiles do pack e do Lemon que o mapa já usa.
//   Minas Abandonadas (89,74)  boca de caverna marrom (Floresta Sussurrante, pedras marrons), no lugar de 4 árvores
//   Grutas Alagadas  (283,116) boca de caverna cinza (Selva de Banuta, pedras cinzas), no lugar de uma árvore grande
//   Catacumbas       (163,54)  cripta: bloco de pedra com a porta-caveira (como o mausoléu das Ruínas), braseiro e lajes
//   Abismo Profundo  (256,136) fenda no chão do salão: rachadura funda com lava, borda de rocha e rachaduras em volta
// O tile do portal é a "porta" de cada desenho e continua andável; o tile de retorno (ao lado, onde se chega ao sair da
// cave) continua andável e ganha um pé do desenho por baixo do jogador quando a boca encosta nele.
import { bfs } from './lib.mjs';

// Retângulos inclusivos [x0, y0, x1, y1] por cave: nenhum tile fora deles muda.
export const ENTRANCE_RECTS = {
  minas: [87, 71, 92, 75],
  grutas: [282, 113, 285, 116],
  catacumbas: [162, 52, 164, 55],
  profundo: [254, 134, 256, 138],
};

export function drawEntrances14({ map, S, L, spawnTile, portalMap, caves }) {
  const W = map.w, idx = (x, y) => y * W + x;
  const fail = (msg) => { throw new Error('ENTRANCES14 VALIDATION FAILED: ' + msg); };
  const rects = Object.entries(ENTRANCE_RECTS);
  const inRect = ([x0, y0, x1, y1], x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
  const rectOf = (x, y) => rects.find(([, r]) => inRect(r, x, y))?.[0];
  const LAYERS = ['ground', 'deco', 'above', 'collision'];
  const before = Object.fromEntries(LAYERS.map((k) => [k, map.layers[k].slice()]));
  const atlasBefore = L.set.used;
  const reachBefore = bfs(map, spawnTile[0], spawnTile[1], portalMap);

  // ---- pincéis (cada escrita confere o retângulo da cave em desenho)
  let cur = null;
  const guard = (x, y) => { if (!inRect(ENTRANCE_RECTS[cur], x, y)) fail(`${cur}: escrita fora do retângulo em ${x},${y}`); };
  const clear = (x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { guard(x, y); map.set('deco', x, y, 0); map.set('above', x, y, 0); map.block(x, y, false); } };
  const stamp = (name, x, y) => {
    const [t, c, r, w, h, o = {}] = S[name];
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) guard(x + i, y + j);
    map.stamp(t, c, r, w, h, x, y, { ...o, reserve: false });
  };
  const deco = (x, y, gid, block = false) => { guard(x, y); map.set('deco', x, y, gid); map.block(x, y, block); };
  const ground = (x, y, gid) => { guard(x, y); map.set('ground', x, y, gid); };
  const walk = (x, y) => { guard(x, y); map.block(x, y, false); };
  const gid = (t, c, r) => map.ts.gid(t, c, r);
  // tile do Lemon que o atlas já tem (pedir uma chave nova acrescentaria um tile ao atlas: proibido aqui)
  const lemonKey = (key) => { if (!L.set.keys.has(key)) fail(`tile Lemon ${key} não existe no atlas`); return L.t.firstgid + L.set.keys.get(key); };
  const lights = [];
  const cave = (id) => caves.find((c) => c.id === id) ?? fail(`cave ${id} não existe`);

  // ================================================================== Minas Abandonadas: boca marrom
  cur = 'minas';
  {
    const { door: [dx, dy], ret: [rx, ry] } = cave('minas');
    // tiram-se as árvores que cobriam o recanto: oliveira (87..88,72..73), pinheiro (89..92,71..73) e as duas
    // oliveiras da fila de baixo (88..91,74..75), cuja copa escondia a porta
    clear(89, 71, 92, 71); clear(87, 72, 92, 73); clear(88, 74, 91, 75);
    stamp('caveMouthBrown', dx - 1, dy - 2);
    walk(rx, ry);                                  // retorno: pé da boca por baixo do jogador
    stamp('boulderBrown', 91, 72);                 // pedra grande a leste da boca
    stamp('rockSmallBrown', 87, 73);               // pedrinha a oeste
    deco(90, 75, gid('D', 0, 5));                  // cascalho na frente da boca (andável)
  }

  // ================================================================== Grutas Alagadas: boca cinza
  cur = 'grutas';
  {
    const { door: [dx, dy], ret: [rx, ry] } = cave('grutas');
    // tira a árvore grande (283..285,113..115) e os arbustos da coluna 282; a copa da árvore do pântano ao sul
    // (280..283,116..118) continua por cima do pé esquerdo da boca
    clear(283, 113, 285, 115); clear(282, 114, 282, 115);
    stamp('caveMouthGray', dx - 1, dy - 2);
    walk(rx, ry);
    stamp('rockSmallGray', 285, 115);
  }

  // ================================================================== Catacumbas Esquecidas: cripta
  cur = 'catacumbas';
  {
    const { door: [dx, dy], ret: [rx, ry] } = cave('catacumbas');
    // tiram-se as duas árvores mortas (163..164,52..53 e 54..55) e os arbustos da coluna 162
    clear(162, 52, 162, 54); clear(163, 52, 164, 55);
    // bloco de pedra 2×3 (paredes do mausoléu das Ruínas) com a porta-caveira no canto de baixo: a porta não fica no
    // meio porque o retorno, logo a leste dela, precisa continuar livre
    const cols = [[dx - 1, 4], [dx, 6]];
    for (const [x, c] of cols) for (let j = 0; j < 3; j++) deco(x, dy - 2 + j, gid('R', c, j), true);
    deco(dx, dy, gid('D', 2, 0));                  // porta-caveira (andável: é o portal)
    // trepadeiras sobre a porta (a mesma arte das ruínas) e o estandarte negro de caveira pendurado na parede
    for (const j of [0, 1]) deco(dx, dy - 2 + j, lemonKey(`ov:vine:1:${gid('R', 6, j)}`), true);
    for (const j of [0, 1]) { guard(dx - 1, dy - 2 + j); map.set('above', dx - 1, dy - 2 + j, L.S.bannerBlack[j][0]); }
    // braseiro acima do retorno, ossos e lajes do mausoléu na frente da porta
    deco(rx, ry - 1, L.S.brazier, true); lights.push([rx, ry - 1, 5, '#c070ff', true]);
    deco(rx, ry - 2, L.S.bone[0]);
    const flags = [0, 1, 2, 3].map((v) => lemonKey('flag' + v));
    for (const [x, y, v] of [[rx, ry, 0], [dx, dy + 1, 2], [rx, ry + 1, 1]]) { ground(x, y, flags[v]); walk(x, y); }
    deco(rx, ry + 1, L.S.crackStone[1]);
  }

  // ================================================================== Abismo Profundo: fenda no chão do salão
  cur = 'profundo';
  {
    const { door: [dx, dy], ret: [rx, ry] } = cave('profundo');
    // rachadura funda de 1 tile de largura colada à parede leste (y 134..138), com a borda de rocha do TilesetHole;
    // a porta é o meio da fenda (andável), o resto bloqueia. Lava no fundo e rachaduras no piso em volta.
    for (let y = dy - 2; y <= dy + 2; y++) {
      const edge = y === dy - 2 ? 0 : y === dy + 2 ? 2 : 1;
      ground(dx, y, gid('O', 3, edge));
      deco(dx, y, edge === 1 ? L.S.crackLava[y - dy + 1] : 0, y !== dy);
    }
    lights.push([dx, dy - 1, 3, '#ff4020', true], [dx, dy + 1, 3, '#ff4020', true]);
    deco(rx, ry - 2, L.S.rubbleGray[0]); deco(rx, ry + 2, L.S.rubbleGray[2]);
    deco(rx, ry - 1, L.S.crackLava[2]); deco(rx, ry + 1, L.S.crackLava[0]);
    deco(rx - 1, ry - 1, L.S.crackStone[0]); deco(rx - 1, ry + 2, L.S.crackStone[3]);
  }
  cur = null;

  // ================================================================== VALIDAÇÃO
  if (L.set.used !== atlasBefore) fail(`o atlas Lemon ganhou ${L.set.used - atlasBefore} tile(s)`);
  const changed = Object.fromEntries(rects.map(([id]) => [id, 0]));
  for (let y = 0; y < map.h; y++) for (let x = 0; x < W; x++) {
    const i = idx(x, y);
    if (!LAYERS.some((k) => map.layers[k][i] !== before[k][i])) continue;
    const id = rectOf(x, y);
    if (!id) fail(`tile ${x},${y} mudou fora dos retângulos`);
    changed[id]++;
  }
  // objetos antigos: nenhum objeto pontual dentro de um retângulo pode ficar bloqueado (só se acrescentam luzes)
  for (const o of map.objects) {
    if (!o.point) continue;
    const x = Math.floor(o.x / 16), y = Math.floor(o.y / 16);
    if (rectOf(x, y) && !before.collision[idx(x, y)] && map.blocked(x, y)) fail(`objeto ${o.type}/${o.name} #${o.id} em ${x},${y} ficou coberto`);
  }
  const reach = bfs(map, spawnTile[0], spawnTile[1], portalMap);
  // portas e retornos: andáveis, alcançáveis, porta sem copa por cima, e os portais apontam para onde apontavam
  for (const c of caves) {
    const [dx, dy] = c.door, [rx, ry] = c.ret;
    if (!rectOf(dx, dy) || !rectOf(rx, ry)) fail(`${c.id}: porta ou retorno fora do retângulo da entrada`);
    if (map.blocked(dx, dy) || !reach[idx(dx, dy)]) fail(`${c.id}: porta ${dx},${dy} bloqueada ou inalcançável`);
    if (map.blocked(rx, ry) || !reach[idx(rx, ry)]) fail(`${c.id}: retorno ${rx},${ry} bloqueado ou inalcançável`);
    if (map.layers.above[idx(dx, dy)]) fail(`${c.id}: porta ${dx},${dy} escondida por baixo de uma copa`);
    if (!map.layers.deco[idx(dx, dy)]) fail(`${c.id}: porta ${dx},${dy} sem desenho`);
    const to = portalMap.get(`${dx},${dy}`), back = portalMap.get(`${c.exit[0]},${c.exit[1]}`);
    if (!to || to[0] !== c.arrival[0] || to[1] !== c.arrival[1]) fail(`${c.id}: portal da porta não leva mais à chegada`);
    if (!back || back[0] !== rx || back[1] !== ry) fail(`${c.id}: saída da cave não devolve mais ao retorno`);
    if (!reach[idx(c.arrival[0], c.arrival[1])]) fail(`${c.id}: chegada da cave inalcançável`);
  }
  // alcance a pé: fora dos retângulos, exatamente os mesmos tiles alcançáveis a partir do templo
  let outside = 0, lost = 0, gained = 0;
  const inside = Object.fromEntries(rects.map(([id]) => [id, [0, 0]]));
  for (let i = 0; i < reach.length; i++) {
    const x = i % W, y = Math.floor(i / W), id = rectOf(x, y);
    if (id) { inside[id][0] += reachBefore[i]; inside[id][1] += reach[i]; continue; }
    outside += reach[i];
    if (reachBefore[i] && !reach[i]) lost++;
    if (!reachBefore[i] && reach[i]) gained++;
  }
  if (lost || gained) fail(`alcance fora das entradas mudou: ${lost} tile(s) perdidos, ${gained} ganhos`);

  // ================================================================== OBJETOS (só luzes, depois de todos os antigos)
  for (const [x, y, radius, color, flicker] of lights) map.tileObj('light', x, y, { radius, color, flicker }, 'light');

  const per = rects.map(([id, [x0, y0, x1, y1]]) => `${id} ${x0},${y0}-${x1},${y1}: ${changed[id]} tiles, alcançáveis ${inside[id][0]}→${inside[id][1]}`).join('; ');
  console.log(`entrances14: ${per}; fora das entradas ${outside} tiles alcançáveis (iguais); ${lights.length} luzes`);
  return { changed, rects: ENTRANCE_RECTS };
}

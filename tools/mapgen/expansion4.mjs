// Malha da Ferrovia (ciclo 11): região ferroviária isolada, lv 25–60, ligada à Vila só de trem (TravelDest dos chefes de
// estação) e, por baixo, por um par de portais ocultos plataforma ↔ plataforma (o servidor exige alcance a pé a partir
// do spawn para aceitar login lá dentro).
//
// Quarta expansão, de novo PARA BAIXO: o mapa anterior (400×336) é copiado tile a tile para um mapa mais alto e o bloco
// novo é desenhado nas linhas y >= 360, com 26 linhas de vazio sólido entre ele e a Oficina dos Engenhos (y 333). Nenhum
// tile antigo muda; os objetos novos entram DEPOIS dos antigos (ids estáveis). A arte nova (trilho, lastro, dormente,
// AMV, vagões, pórtico, abrigo, estação) vem de `L.rail()` (lemon.mjs), chamada só aqui: os tiles Lemon antigos mantêm
// o id. Determinístico: o gerador aleatório daqui tem semente própria e não mexe nos fluxos das etapas anteriores.
//
// Bloco 160×110 em (40,360); coordenadas locais (lx, ly) → global (40+lx, 360+ly).
//   superfície ly 0..71 (borda de mata em lx<=2, lx>=157, ly<=2, ly>=69):
//     Estação Central da Malha (PZ)  lx 3..36,   ly 3..27   prédio, plataformas 1 (ly 11..15) e 2 (ly 17..19), vias 1 e 2
//     Pátio de Manobra               lx 37..103, ly 3..37   feixe de 7 linhas com AMVs nas duas pontas, vagões parados
//     Portal de Inspeção             lx 104..156, ly 3..41  linha principal desce (lx 116) pelo pórtico; abrigo do CLP
//     Oficina de Vagões              lx 117..157, ly 42..68 galpão com 2 linhas, locomotiva, sala do Vagão Não Inspecionável
//     Via Permanente                 o resto: linha ao longo de ly 62, ponte sobre o rio, Serra (lx 3..36, ly 29..56)
//                                    com o emboque do túnel em (22,55)
//   Túnel da Serra ly 76..109: túnel escuro (portal no emboque), galeria de serviço e o covil da Locomotiva Fantasma.
import { GameMap, bfs, blobTable, blobMask, mulberry32, noise2 } from './lib.mjs';

export const NEW_H4 = 472;
export const BLOCK4 = { x0: 40, y0: 360, w: 160, h: 110 };
const G = (lx, ly) => [BLOCK4.x0 + lx, BLOCK4.y0 + ly];
// Vila: chefe da estação ao lado da carroça do Bastião; chegada do trem; portal oculto no recanto atrás da casinha de
// barro, entre ela e a paliçada leste (fora do caminho), e o tile de retorno (diagonal, nunca o próprio portal)
export const VILLAGE_STATION_MASTER = [95, 100];
export const VILLAGE_TRAIN_ARRIVAL = [95, 98];
export const VILLAGE_STATION_PORTAL = [99, 104];
export const VILLAGE_STATION_RETURN = [98, 103];
// Malha: chegada do trem na plataforma 1; portal oculto no canto oeste da plataforma ↔ chegada vinda da Vila
export const MALHA_TRAIN_ARRIVAL = G(20, 14);
export const MALHA_STATION_PORTAL = G(4, 11);
export const MALHA_PORTAL_ARRIVAL = G(7, 13);
// caixas do "Chegou!" (sistema ClickUp): plataforma 1 da Estação Central e Pátio de Encomendas da Oficina dos Engenhos
export const CHEGOU_DROP = G(31, 14);
export const CHEGOU_DROP_OFICINA = [80, 330];
// túnel: emboque na face da Serra ↔ saída no salão de entrada do túnel
export const TUNNEL_MOUTH = G(22, 55);
export const TUNNEL_ARRIVAL = G(10, 88);
export const TUNNEL_EXIT = G(10, 86);
export const TUNNEL_RETURN = G(21, 58);

export function expand4({ old, ts, S, L, spawnTile, village, workshopPatio }) {
  const W = old.w, OLD_H = old.h, H = NEW_H4;
  const { x0: X0, y0: Y0, w: BW, h: BH } = BLOCK4;
  let lastRow = 0;
  for (let i = 0; i < old.layers.collision.length; i++) if (old.layers.collision[i] === 0) lastRow = Math.floor(i / W);
  if (Y0 - lastRow <= 26) throw new Error(`EXPANSION4: o bloco novo precisa de >= 26 linhas de vazio até o último tile andável (y ${lastRow})`);
  const map = new GameMap(W, H, ts);
  for (const k of Object.keys(map.layers)) map.layers[k].set(old.layers[k]);
  map.occ.set(old.occ);
  map.objects = old.objects.slice();
  map.nextId = old.nextId;
  const idx = (x, y) => y * W + x;
  const prop = (o, n) => o.properties?.find((p) => p.name === n)?.value;
  const oldPortals = old.objects.filter((o) => o.type === 'portal').map((o) => [o.x / 16, o.y / 16, prop(o, 'toX'), prop(o, 'toY')]);
  const fail = (msg) => { throw new Error('EXPANSION4 VALIDATION FAILED: ' + msg); };
  const R = L.rail();
  const rng = mulberry32(20261024);
  const pick = (a) => a[Math.floor(rng() * a.length)];
  const blob = blobTable();

  for (let y = OLD_H; y < H; y++) for (let x = 0; x < W; x++) { map.put('ground', x, y, 'O', 1, 1); map.block(x, y); }

  // ================================================================== máscaras (coordenadas locais)
  const ROAD = 14, NONE = 0, GRASS = 1, BORDER = 2, YARD = 3, WATER = 4, BRIDGE = 5, MOUNT = 6, PLATFORM = 7, SHED = 8, SHEDWALL = 9, TUN = 10, TUNWALL = 11, DARK = 12, PAD = 13;
  const kind = new Uint8Array(BW * BH);
  const li = (lx, ly) => ly * BW + lx;
  const inL = (lx, ly) => lx >= 0 && ly >= 0 && lx < BW && ly < BH;
  const K = (lx, ly) => (inL(lx, ly) ? kind[li(lx, ly)] : NONE);
  const fill = (x0, y0, x1, y1, k) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (inL(x, y)) kind[li(x, y)] = k; };
  const SURF_H = 72;
  fill(0, 0, BW - 1, SURF_H - 1, GRASS);
  for (let ly = 0; ly < SURF_H; ly++) for (let lx = 0; lx < BW; lx++) if (lx <= 2 || lx >= BW - 3 || ly <= 2 || ly >= SURF_H - 3) kind[li(lx, ly)] = BORDER;
  // pátio: chão de terra batida entre as linhas
  // (o pátio fica na grama: o lastro das linhas já cobre quase tudo e a via aparece melhor que sobre brita lisa)
  // Serra: planalto com face de rocha ao sul (ly 52..56) e o emboque do túnel
  const MT = { x0: 3, y0: 29, x1: 36, y1: 56, face: 52 };
  fill(MT.x0, MT.y0, MT.x1, MT.y1, MOUNT);
  // rio: lagoa ao sul do pátio e o leito descendo até a borda; a via passa por cima na ponte (ly 61..63)
  for (let ly = 39; ly < SURF_H - 3; ly++) for (let lx = 60; lx < 90; lx++) {
    const pond = ((lx - 73) / 8.5) ** 2 + ((ly - 43) / 4.2) ** 2 <= 1;
    const river = ly >= 44 && lx >= 72 + Math.round(Math.sin(ly / 4) * 0.8) && lx <= 75 + Math.round(Math.sin(ly / 4) * 0.8);
    if (pond || river) kind[li(lx, ly)] = WATER;
  }
  for (let lx = 70; lx <= 78; lx++) for (let ly = 61; ly <= 63; ly++) if (K(lx, ly) === WATER || K(lx - 1, ly) === WATER || K(lx + 1, ly) === WATER) kind[li(lx, ly)] = BRIDGE;
  // estrada de terra que cruza a Via Permanente numa passagem de nível (lx 95..96)
  fill(95, 38, 96, SURF_H - 4, ROAD);
  // plataformas da estação
  fill(6, 11, 33, 15, PLATFORM); fill(9, 17, 32, 19, PLATFORM);
  // pátio de cascalho do Portal (pórtico + abrigo)
  fill(108, 26, 126, 38, PAD);
  // galpão da Oficina de Vagões (paredes = borda do retângulo; divisórias da sala do mini-chefe)
  const SH = { x0: 125, y0: 44, x1: 156, y1: 67 };
  fill(SH.x0, SH.y0, SH.x1, SH.y1, SHEDWALL); fill(SH.x0 + 1, SH.y0 + 1, SH.x1 - 1, SH.y1 - 1, SHED);
  for (const [a, b] of [[49, 51], [55, 57]]) fill(SH.x0, a, SH.x0, b, SHED); // portões das linhas no oitão oeste
  fill(SH.x0, 62, SH.x0, 63, SHED); // porta de pessoal
  fill(140, 59, 156, 59, SHEDWALL); fill(140, 59, 140, 67, SHEDWALL); fill(147, 59, 148, 59, SHED); // sala do mini-chefe
  // túnel (estilo masmorra: piso de brita, paredes de rocha, vazio em volta)
  const carve = (x0, y0, x1, y1, ch = 0) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { if (ch) { const dx = Math.min(x - x0, x1 - x), dy = Math.min(y - y0, y1 - y); if (dx + dy < ch) continue; } kind[li(x, y)] = TUN; } };
  carve(4, 86, 16, 96, 2);        // salão de entrada
  carve(17, 89, 121, 93);         // túnel principal (via em ly 91)
  for (const x of [30, 52, 74, 96]) carve(x, 87, x + 2, 88); // refúgios (nichos na parede norte)
  carve(40, 79, 70, 84, 1);       // galeria de serviço (desabamento antigo)
  carve(42, 85, 43, 88); carve(67, 85, 68, 88);
  carve(122, 80, 155, 105, 4);    // covil da Locomotiva Fantasma
  for (const [x, y, w, h] of [[104, 89, 2, 1], [108, 93, 3, 1], [112, 89, 1, 1], [134, 84, 2, 2], [146, 98, 2, 2], [128, 99, 2, 1]]) fill(x, y, x + w - 1, y + h - 1, NONE); // entulho do desabamento / pilares
  fill(9, 85, 11, 85, TUN); // abertura do emboque (de dentro)
  for (let ly = 74; ly < BH; ly++) for (let lx = 0; lx < BW; lx++) {
    if (K(lx, ly) === TUN) continue;
    let w = false;
    for (let j = -1; j <= 1 && !w; j++) for (let i = -1; i <= 1; i++) if (K(lx + i, ly + j) === TUN) { w = true; break; }
    if (!w && K(lx, ly + 2) === TUN) w = true;
    if (w) kind[li(lx, ly)] = TUNWALL;
  }

  // ================================================================== a via (segmentos em coordenadas globais)
  const seg = (a, b, o = {}) => ({ a: G(...a), b: G(...b), ...o });
  const segsRaw = [
    // Estação: via 1 (linha principal) e via 2
    seg([5, 16], [108, 16], { endA: true }), seg([8, 20], [96, 20], { endA: true, endB: true }),
    // Pátio, ponta oeste: escada de AMVs para o norte (vias 12 e 8) e para o sul (vias 24, 28, 32)
    seg([42, 16], [50, 8]), seg([46, 12], [92, 12], { endB: true }), seg([50, 8], [94, 8], { endB: true }),
    seg([46, 16], [62, 32]), seg([54, 24], [96, 24], { endB: true }), seg([58, 28], [96, 28], { endB: true }), seg([62, 32], [90, 32], { endB: true }),
    // ponta leste: travessão da via 2 para a principal
    seg([84, 20], [88, 16]),
    // Portal de Inspeção: a principal desce pelo pórtico
    seg([108, 16], [116, 24]), seg([116, 24], [116, 58]),
    // Oficina de Vagões: dois ramais entrando no galpão
    seg([116, 42], [124, 50]), seg([124, 50], [150, 50], { endB: true }),
    seg([116, 50], [122, 56]), seg([122, 56], [145, 56], { endB: true }),
    // Via Permanente: desce, segue para oeste pela ponte e sobe para o emboque do túnel
    seg([116, 58], [112, 62]), seg([112, 62], [28, 62]), seg([28, 62], [22, 56]), seg([22, 56], [22, 54]),
    // Túnel da Serra
    seg([6, 91], [140, 91], { endA: true, endB: true }),
  ];
  const segs = R.prep(segsRaw);
  const trackGid = new Map();
  for (let ly = 0; ly < BH; ly++) for (let lx = 0; lx < BW; lx++) { const [x, y] = G(lx, ly); const t = R.track(segs, x, y); if (t) trackGid.set(li(lx, ly), t); }
  const onTrack = (lx, ly) => trackGid.has(li(lx, ly));
  const nearTrack = (lx, ly, r = 1) => { for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (onTrack(lx + i, ly + j)) return true; return false; };

  // ================================================================== chão
  const gidPx = (gid) => { const loc = ts.locate(gid), p = loc.t.png.data, wd = loc.t.imagewidth; return (i, j) => { const k = ((loc.row * 16 + j) * wd + loc.col * 16 + i) * 4; return [p[k], p[k + 1], p[k + 2]]; }; };
  const hv = (lx, ly, s) => { let h = (Math.imul(lx, 374761393) + Math.imul(ly, 668265263) + Math.imul(s, 1442695041)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const isWater = (lx, ly) => K(lx, ly) === WATER || K(lx, ly) === BRIDGE;
  const plateauGid = {};
  const relief = (c, r) => R.plateau(ts.gid('R', c, r));
  for (let ly = 0; ly < BH; ly++) for (let lx = 0; lx < BW; lx++) {
    const [x, y] = G(lx, ly), k = K(lx, ly);
    if (k === NONE) continue;
    if (k === GRASS || k === BORDER) {
      const t = hv(lx, ly, 1);
      map.put('ground', x, y, 'F', t < 0.1 ? 1 + Math.floor(t * 40) : 0, 12);
    } else if (k === ROAD) {
      if (ly >= 61 && ly <= 63) map.set('ground', x, y, R.platform(0, false, 0, false, ly % 2)); // tabuleiro da passagem de nível
      else { const [c, r] = blob[blobMask((a, b) => K(a - X0, b - Y0) === ROAD || (K(a - X0, b - Y0) === BORDER && K(a - X0, b - Y0 - 1) === ROAD), x, y)]; map.put('ground', x, y, 'F', c, r); }
    } else if (k === PAD || k === YARD) map.set('ground', x, y, R.gravel(Math.floor(hv(lx, ly, 2) * 4))); else if (k === WATER) {
      const [c, r] = blob[blobMask((a, b) => isWater(a - X0, b - Y0) || K(a - X0, b - Y0) === BORDER, x, y)];
      map.put('ground', x, y, 'W', c, r - 1); map.block(x, y);
    } else if (k === BRIDGE) {
      map.set('ground', x, y, R.bridge(ly === 61 ? 'n' : ly === 63 ? 's' : 'm'));
    } else if (k === MOUNT) {
      const top = ly === MT.y0, left = lx === MT.x0, right = lx === MT.x1;
      const col = left ? 1 : right ? 3 : 2;
      let g;
      if (ly < MT.face) g = relief(col, top ? 0 : 1);
      else if (ly === MT.face) g = relief(col, 2);
      else g = ts.gid('R', left ? 4 : right ? 6 : 5, ly === MT.y1 ? 2 : 1);
      map.set('ground', x, y, g); map.block(x, y);
    } else if (k === PLATFORM) {
      const n = K(lx, ly - 1) === PLATFORM ? 0 : onTrack(lx, ly - 1) ? 2 : 1, s = K(lx, ly + 1) === PLATFORM ? 0 : onTrack(lx, ly + 1) ? 2 : 1;
      map.set('ground', x, y, R.platform(n, K(lx + 1, ly) !== PLATFORM, s, K(lx - 1, ly) !== PLATFORM, (lx + ly) % 2));
    } else if (k === SHED) {
      map.set('ground', x, y, R.platform(0, false, 0, false, (lx * 3 + ly) % 2));
    } else if (k === TUN) {
      map.set('ground', x, y, R.gravel(Math.floor(hv(lx, ly, 2) * 4)));
    }
  }
  // lastro sob a via (por cima de grama/terra), trilho na camada deco
  for (let ly = 0; ly < BH; ly++) for (let lx = 0; lx < BW; lx++) {
    const [x, y] = G(lx, ly), k = K(lx, ly);
    if ((k === GRASS || k === YARD || k === PAD || (k === ROAD && (ly < 61 || ly > 63))) && nearTrack(lx, ly)) map.set('ground', x, y, R.ballast(segs, x, y, gidPx(map.get('ground', x, y)), Math.floor(hv(lx, ly, 3) * 4)));
    const t = trackGid.get(li(lx, ly));
    if (t && (k === ROAD || k === GRASS || k === YARD || k === PAD || k === PLATFORM || k === SHED || k === BRIDGE || k === TUN)) map.set('deco', x, y, t);
  }
  // colisão básica
  for (let ly = 0; ly < BH; ly++) for (let lx = 0; lx < BW; lx++) {
    const [x, y] = G(lx, ly), k = K(lx, ly);
    if (k === NONE || k === BORDER || k === WATER || k === MOUNT || k === SHEDWALL || k === TUNWALL) map.block(x, y);
    else map.block(x, y, false);
  }

  // ================================================================== estruturas e enfeites
  const keep = new Set(); // tiles que nenhum enfeite pode cobrir (NPCs, chegadas, portais, spawns, pontos de drop)
  const keepL = (lx, ly) => keep.add(li(lx, ly));
  const lights = [];
  const light = (lx, ly, radius, color, flicker = true) => lights.push([...G(lx, ly), radius, color, flicker]);
  const free = (lx, ly) => inL(lx, ly) && !keep.has(li(lx, ly)) && !map.blocked(...G(lx, ly));
  /** folha de tiles (linhas de gids, de cima para baixo): linhas de base em deco + colisão, o resto em above */
  const putSheet = (rows, lx, ly, { baseRows = 1, blockAll = false } = {}) => {
    const h = rows.length;
    rows.forEach((row, j) => row.forEach((g, i) => {
      if (!g) return;
      const [x, y] = G(lx + i, ly + j);
      if (keep.has(li(lx + i, ly + j))) fail(`peça em ${x},${y} cobre NPC, chegada, portal ou spawn`);
      if (j >= h - baseRows) { map.set('deco', x, y, g); map.block(x, y); } else { map.set('above', x, y, g); if (blockAll) map.block(x, y); }
      map.reserve(x, y);
    }));
  };
  /** sprite sobre a via (vagão, locomotiva): linha de baixo bloqueia a via, a de cima vai para above */
  const putOnTrack = (cv, wt, ht, lx, ly) => {
    const [x, y] = G(lx, ly);
    const rows = R.overTrack(cv, wt, ht, segs, x, y);
    rows.forEach((row, j) => row.forEach(([deco, above], i) => {
      const [tx, ty] = G(lx + i, ly - (ht - 1) + j);
      if (keep.has(li(lx + i, ly - (ht - 1) + j))) fail(`veículo em ${tx},${ty} cobre NPC, chegada, portal ou spawn`);
      if (deco) map.set('deco', tx, ty, deco);
      if (above) map.set('above', tx, ty, above);
      if (j === ht - 1) map.block(tx, ty);
      map.reserve(tx, ty);
    }));
  };
  const stampL = (name, lx, ly, opts) => { const [t, c, r, w, h, o = {}] = S[name] ?? opts; for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (keep.has(li(lx + i, ly + j))) fail(`${name} em ${G(lx + i, ly + j)} cobre NPC/chegada`); map.stamp(t, c, r, w, h, ...G(lx, ly), o); };
  const E = (c, r, lx, ly, block = true) => { if (keep.has(li(lx, ly))) fail(`enfeite em ${G(lx, ly)} cobre NPC/chegada`); map.put('deco', ...G(lx, ly), 'E', c, r); if (block) map.block(...G(lx, ly)); map.reserve(...G(lx, ly)); };
  const lamp = (lx, ly) => { stampL('lamp', lx, ly - 1); light(lx, ly, 5, '#ffc060'); };

  // ---- pontos que precisam ficar livres
  const L2 = ([x, y]) => [x - X0, y - Y0];
  const npcs = [
    // Estação Central (plataforma 1)
    ['painel_obra', 8, 12], ['chefe_estacao_malha', 16, 12], ['ferramenteiro', 23, 12], ['depot_malha', 28, 12],
    // Portal de Inspeção
    ['inspetora_portal', 112, 37], ['operador_abrigo', 122, 31],
    // Oficina de Vagões
    ['mecanico_vagao', 129, 53],
    // Via Permanente, perto do emboque do túnel
    ['maquinista_aposentado', 30, 60],
  ];
  for (const [, lx, ly] of npcs) keepL(lx, ly);
  for (const p of [MALHA_TRAIN_ARRIVAL, MALHA_STATION_PORTAL, MALHA_PORTAL_ARRIVAL, CHEGOU_DROP, TUNNEL_MOUTH, TUNNEL_ARRIVAL, TUNNEL_EXIT, TUNNEL_RETURN]) keepL(...L2(p));
  // [monstro, count, radius, level, lx, ly]
  const spawns = [
    ['engate_solto', 5, 4, 28, 70, 10], ['engate_solto', 5, 4, 28, 84, 14],
    ['sapata_gasta', 5, 4, 32, 74, 26], ['sapata_gasta', 5, 4, 32, 88, 30],
    ['iluminador_rebelde', 4, 4, 36, 110, 10], ['iluminador_rebelde', 4, 4, 36, 132, 36],
    ['frame_descartado', 4, 4, 40, 132, 14], ['frame_descartado', 4, 4, 40, 106, 24],
    ['rodeiro_trincado', 4, 4, 45, 140, 47], ['rodeiro_trincado', 4, 4, 45, 135, 62],
    ['truque_desalinhado', 4, 4, 48, 147, 52], ['truque_desalinhado', 3, 4, 48, 121, 64],
    ['vagao_nao_inspecionavel', 1, 2, 50, 148, 63],
    ['rato_de_lastro', 6, 5, 50, 50, 57],
    ['rato_de_lastro', 8, 5, 50, 34, 91], ['rato_de_lastro', 8, 5, 50, 56, 81], ['rato_de_lastro', 6, 4, 50, 84, 91], ['rato_de_lastro', 6, 4, 50, 110, 91],
    ['locomotiva_fantasma', 1, 3, 60, 141, 92],
  ];
  for (const s of spawns) keepL(s[4], s[5]);

  // ---- Estação Central: prédio, paliçada, mobiliário da plataforma
  putSheet(R.station(), 11, 6, { baseRows: 3, blockAll: true });
  const fenceH = (ly, x0, x1, gaps = []) => { for (let lx = x0; lx <= x1; lx++) { if (gaps.some(([a, b]) => lx >= a && lx <= b)) continue; const [x, y] = G(lx, ly); map.layers.deco[idx(x, y)] = ts.gid('H', lx % 2 ? 11 : 12, 5); map.block(x, y); map.reserve(x, y); } };
  const fenceV = (lx, y0, y1, gaps = []) => { for (let ly = y0; ly <= y1; ly++) { if (gaps.some(([a, b]) => ly >= a && ly <= b)) continue; const [x, y] = G(lx, ly); map.layers.deco[idx(x, y)] = ts.gid('H', 11, 6); map.block(x, y); map.reserve(x, y); } };
  fenceH(3, 3, 36); fenceH(27, 3, 36, [[18, 20]]); fenceV(3, 4, 26); fenceV(36, 4, 26, [[14, 22]]);
  putSheet(R.bench(), 19, 11); putSheet(R.bench(), 25, 11); putSheet(R.bench(), 13, 18); putSheet(R.bench(), 27, 18);
  putSheet(R.clockPost(), 12, 13); putSheet(R.clockPost(), 21, 17);
  for (const lx of [10, 30]) lamp(lx, 11);
  for (const lx of [17, 24]) lamp(lx, 19);
  E(0, 2, 32, 11); E(7, 2, 33, 11); E(9, 2, 33, 12); E(0, 0, 6, 11); // caixotes do "Chegou!" e barril
  putSheet(R.signal('green'), 35, 14); putSheet(R.signal('red'), 35, 21);
  // canteiros, depósito de cargas e árvores no lado sul
  stampL('houseOrange', 5, 22); stampL('barrel', 10, 24); E(0, 2, 11, 24); E(7, 2, 11, 25);
  for (const [lx, ly] of [[23, 23], [29, 23], [33, 24]]) stampL(pick(['treeRound2', 'treeOlive2']), lx, ly);
  for (const [lx, ly] of [[5, 5], [8, 5], [24, 5], [30, 5], [34, 6]]) stampL(pick(['treeRound2', 'treeOlive2', 'treePine2']), lx, ly);
  light(7, 13, 3, '#ffe066');

  // ---- Pátio de Manobra: vagões parados (só nas linhas secundárias), sinais, pilhas de material, cabine de manobra
  const wagons = [
    ['gondola', 58, 8], ['gondola', 61, 8], ['gondola', 64, 8], ['box', 78, 8], ['hopper', 88, 8],
    ['tank', 54, 12], ['tank', 57, 12], ['hopper', 70, 12], ['container', 82, 12],
    ['gondola', 64, 24], ['gondola', 67, 24], ['gondola', 70, 24], ['box', 86, 24],
    ['hopper', 66, 28], ['box', 76, 28], ['tank', 90, 28],
    ['container', 70, 32], ['gondola', 80, 32], ['gondola', 83, 32],
  ];
  for (const [w, lx, ly] of wagons) putOnTrack(R.wagonCv(w), 3, 2, lx, ly);
  for (const [lx, ly, a] of [[40, 15, 'red'], [44, 21, 'green'], [97, 15, 'green'], [100, 21, 'red']]) putSheet(R.signal(a), lx, ly - 1);
  putSheet(R.railStack(), 98, 26); putSheet(R.sleeperStack(), 98, 30); putSheet(R.sleeperStack(), 40, 30); putSheet(R.railStack(), 40, 34);
  stampL('shopBlue', 98, 4); lamp(97, 6);
  for (const [lx, ly] of [[56, 5], [72, 5], [88, 5], [56, 35], [76, 35]]) map.tileObj('light', ...G(lx, ly), { radius: 6, color: '#ffd890', flicker: false }, 'light');

  // ---- Portal de Inspeção: pórtico sobre a principal, abrigo do CLP, sinais, passagem de nível
  {
    const [ax, ay] = [114, 33];
    putOnTrack(R.archCv(), 5, 4, ax, ay);
    for (let j = 0; j < 4; j++) { map.block(...G(ax, ay - j)); map.block(...G(ax + 4, ay - j)); }
    for (let j = 0; j < 4; j++) for (const i of [1, 2, 3]) map.block(...G(ax + i, ay - j), false);
    for (const [lx, ly] of [[115, 31], [117, 31], [115, 32], [117, 32]]) light(lx, ly, 5, '#d8f0ff', false);
    // dois sensores de roda no trilho antes do pórtico (o trem vem do norte)
    for (const ly of [26, 28]) map.set('deco', ...G(116, ly), R.wheelSensor(segs, ...G(116, ly)));
  }
  putSheet(R.shelter(), 121, 28, { baseRows: 2, blockAll: true });
  putSheet(R.signal('red'), 117, 21); putSheet(R.signal('green'), 115, 39);
  E(0, 0, 124, 32); E(7, 2, 125, 32);
  light(122, 32, 4, '#ffc060');

  // ---- Oficina de Vagões: paredes do galpão (pedra cinza), locomotiva e vagão em manutenção, peças, sala do mini-chefe
  const isShedFloor = (lx, ly) => K(lx, ly) === SHED;
  for (let ly = SH.y0; ly <= SH.y1; ly++) for (let lx = SH.x0; lx <= SH.x1; lx++) {
    if (K(lx, ly) !== SHEDWALL) continue;
    const isW = (a, b) => K(a, b) === SHEDWALL;
    const above = isW(lx, ly - 1), below = isW(lx, ly + 1), left = isW(lx - 1, ly), right = isW(lx + 1, ly);
    const row = isShedFloor(lx, ly + 1) ? 2 : !above ? 0 : !below ? 2 : 1;
    const col = !left && !right ? (isShedFloor(lx - 1, ly) ? 4 : 6) : !left ? 4 : !right ? 6 : 5;
    map.put('deco', ...G(lx, ly), 'R', col, row);
  }
  putOnTrack(R.locoCv(), 4, 2, 135, 50);
  putOnTrack(R.wagonCv('box'), 3, 2, 133, 56);
  for (const [lx, ly] of [[142, 46], [143, 46], [144, 46], [152, 52], [153, 52]]) { map.set('deco', ...G(lx, ly), R.wheelset()); map.block(...G(lx, ly)); }
  putSheet(R.bogie(), 146, 47); putSheet(R.bogie(), 150, 47); putSheet(R.railStack(), 128, 46); putSheet(R.sleeperStack(), 131, 66);
  stampL('counter', 152, 45, ['E', 2, 10, 3, 1, { blockAll: true }]); E(0, 0, 155, 47); E(0, 0, 155, 48); E(9, 2, 154, 55);
  stampL('shelves', 127, 59, ['E', 10, 7, 2, 2, { blockAll: true }]); stampL('locker', 130, 60, ['E', 2, 7, 1, 2, { blockAll: true }]);
  // sala do mini-chefe: rodeiros e truques largados
  for (const [lx, ly] of [[142, 61], [143, 66], [154, 66], [155, 61]]) { map.set('deco', ...G(lx, ly), R.wheelset()); map.block(...G(lx, ly)); }
  putSheet(R.bogie(), 151, 66);
  for (const [lx, ly] of [[128, 55], [138, 53], [150, 54], [133, 64], [146, 62], [152, 64]]) light(lx, ly, 5, '#ffe2a0', false);
  stampL('lamp', 126, 40); light(126, 41, 5, '#ffc060');

  // ---- Via Permanente: sinais, marcos quilométricos, casa do maquinista, o emboque do túnel
  for (let lx = 104; lx >= 30; lx -= 12) if (!(lx >= 69 && lx <= 79)) { map.set('deco', ...G(lx, 60), R.kmPost()); map.block(...G(lx, 60)); }
  putSheet(R.signal('green'), 108, 59);
  // passagem de nível: cancelas abertas dos dois lados da via e cruzes de Santo André
  putSheet(R.gate(false), 97, 60); putSheet(R.gate(true), 93, 64); putSheet(R.crossbuck(), 94, 59); putSheet(R.crossbuck(), 97, 63); putSheet(R.signal('red'), 36, 63);
  stampL('houseOrange', 30, 64); light(31, 68 - 1, 4, '#ffc060');
  {
    // emboque: interior escuro atrás do arco de pedra; a via some na escuridão
    for (const [lx, ly] of [[21, 54], [22, 54], [23, 54], [21, 55], [23, 55]]) { kind[li(lx, ly)] = DARK; map.put('ground', ...G(lx, ly), 'O', 1, 1); map.block(...G(lx, ly)); }
    for (const [lx, ly] of [[22, 55], [21, 56], [22, 56], [23, 56]]) { kind[li(lx, ly)] = DARK; map.set('ground', ...G(lx, ly), R.gravel(1)); map.block(...G(lx, ly), false); }
    for (let ly = 54; ly <= 56; ly++) { const t = trackGid.get(li(22, ly)); if (t) map.set('deco', ...G(22, ly), t); }
    const arch = L.S.arch;
    arch.forEach((row, j) => row.forEach((g, i) => { if (!g) return; const [x, y] = G(20 + i, 53 + j); if (j === 3) { if (i === 0 || i === 4) { map.set('deco', x, y, g); map.block(x, y); } else map.set('above', x, y, g); } else map.set('above', x, y, g); }));
  }

  // ---- túnel: paredes, arandelas, entulho, teias; o covil com ossos e um vagão abandonado
  const sconce = L.overlay(ts.gid('R', 5, 2), 'sconce', 1, L.draw.sconce);
  for (let ly = 74; ly < BH; ly++) for (let lx = 0; lx < BW; lx++) {
    if (K(lx, ly) !== TUNWALL) continue;
    const isW = (a, b) => K(a, b) === TUNWALL;
    const above = isW(lx, ly - 1), below = isW(lx, ly + 1), left = isW(lx - 1, ly), right = isW(lx + 1, ly);
    const row = K(lx, ly + 1) === TUN ? 2 : !above ? 0 : !below ? 2 : 1;
    const col = !left ? 4 : !right ? 6 : 5;
    map.put('deco', ...G(lx, ly), 'R', col, row);
  }
  for (let lx = 20; lx < 120; lx += 11) if (K(lx, 88) === TUNWALL && K(lx, 89) === TUN) { map.set('deco', ...G(lx, 88), sconce); light(lx, 89, 5, '#ff9a3c'); }
  for (const [lx, ly] of [[126, 85], [150, 85], [126, 100], [150, 100]]) if (K(lx, ly - 1) === TUNWALL || true) light(lx, ly, 6, '#ff9a3c');
  // saída do túnel: arco de pedra na parede norte do salão, a luz do dia entra por ele
  {
    for (const [lx, ly] of [[9, 85], [11, 85]]) { map.put('ground', ...G(lx, ly), 'O', 1, 1); kind[li(lx, ly)] = TUNWALL; map.block(...G(lx, ly)); map.set('deco', ...G(lx, ly), 0); }
    for (const [lx, ly] of [[10, 85], [9, 84], [10, 84], [11, 84]]) { map.put('ground', ...G(lx, ly), 'O', 1, 1); kind[li(lx, ly)] = TUNWALL; map.block(...G(lx, ly)); map.set('deco', ...G(lx, ly), 0); }
    const arch = L.S.arch;
    arch.forEach((row, j) => row.forEach((g, i) => { if (!g) return; const [x, y] = G(8 + i, 83 + j); if (j === 3 && (i === 0 || i === 4)) { map.set('deco', x, y, g); map.block(x, y); } else map.set('above', x, y, g); }));
    for (const i of [1, 3]) { map.block(...G(8 + i, 86)); }
    light(10, 86, 5, '#fff2c0', false);
  }
  const tunFree = (lx, ly) => K(lx, ly) === TUN && !onTrack(lx, ly) && !keep.has(li(lx, ly)) && !map.blocked(...G(lx, ly));
  for (let ly = 76; ly < BH; ly++) for (let lx = 0; lx < BW; lx++) {
    if (!tunFree(lx, ly) || nearTrack(lx, ly, 0)) continue;
    let open = true; for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (K(lx + i, ly + j) !== TUN) open = false;
    const r = rng();
    if (open && r < 0.04) { map.set('deco', ...G(lx, ly), pick(L.S.rubbleGray)); map.block(...G(lx, ly)); }
    else if (open && r < 0.07) map.set('deco', ...G(lx, ly), pick(L.S.crackStone));
    else if (!open && r < 0.05 && K(lx - 1, ly - 1) === TUNWALL) map.set('deco', ...G(lx, ly), L.S.cobweb[0]);
    else if (!open && r < 0.05 && K(lx + 1, ly - 1) === TUNWALL) map.set('deco', ...G(lx, ly), L.S.cobweb[1]);
    else if (lx > 122 && r < 0.12) map.set('deco', ...G(lx, ly), pick(L.S.bone));
  }
  putOnTrack(R.wagonCv('box'), 3, 2, 126, 91);
  putSheet(R.railStack(), 58, 93); putSheet(R.sleeperStack(), 88, 93);

  // ---- mata da borda, árvores e pedras na superfície, pinheiros no alto da serra
  const treeKinds = ['treePine2', 'treeOlive2', 'treeRound2', 'treePine2'];
  for (let ly = 1; ly < SURF_H; ly += 2) for (let lx = 1; lx < BW; lx += 2) {
    if (K(lx, ly) !== BORDER || K(lx + 1, ly + 1) !== BORDER) continue;
    const [t, c, r, w, h] = S[pick(treeKinds)];
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const g = ts.gid(t, c + i, r + j); if (!ts.isEmpty(t, c + i, r + j)) map.set(j === h - 1 ? 'deco' : 'above', ...G(lx + i, ly + j), g); }
  }
  for (let ly = MT.y0 + 1; ly < MT.face - 2; ly += 2) for (let lx = MT.x0 + 1; lx < MT.x1 - 1; lx += 2) {
    const r = rng(); if (r > 0.85) continue;
    const name = r < 0.6 ? 'treePine2' : r < 0.7 ? 'treeDead2' : pick(['rockGrayA', 'rockGrayB', 'boulderGray']);
    const [t, c, rr, w, h] = S[name];
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { if (ts.isEmpty(t, c + i, rr + j)) continue; map.set(j === h - 1 ? 'deco' : 'above', ...G(lx + i, ly + j), ts.gid(t, c + i, rr + j)); }
  }
  const scatterOK = (lx, ly, w, h) => { for (let j = -1; j <= h; j++) for (let i = -1; i <= w; i++) { const k = K(lx + i, ly + j); if (k !== GRASS || nearTrack(lx + i, ly + j, 1) || keep.has(li(lx + i, ly + j)) || map.occ[idx(...G(lx + i, ly + j))]) return false; } return true; };
  const nearKeep = (lx, ly, r) => { for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (keep.has(li(lx + i, ly + j))) return true; return false; };
  for (let ly = 3; ly < SURF_H - 3; ly++) for (let lx = 3; lx < BW - 3; lx++) {
    const r = rng();
    const grove = noise2(lx, ly, 6, 811) > 0.6 ? 0.35 : 0.03;
    if (r < grove && scatterOK(lx, ly, 2, 2) && !nearKeep(lx, ly, 2) && !(lx < 37 && ly < 28)) { stampL(pick(['treeRound2', 'treeOlive2', 'treePine2', 'treeOlive2']), lx, ly); map.reserve(...G(lx - 1, ly - 1), 4, 4); }
    else if (r > 0.97 && scatterOK(lx, ly, 1, 1) && !nearKeep(lx, ly, 1)) { const k = rng(); if (k < 0.4) map.put('deco', ...G(lx, ly), 'N', pick([0, 1, 2, 3, 6]), 11); else if (k < 0.7) { map.put('deco', ...G(lx, ly), 'N', 0, 10); map.block(...G(lx, ly)); } else { stampL('rockSmallGray', lx, ly); } map.reserve(...G(lx, ly)); }
  }

  // ================================================================== bolsões: tile andável que o desenho isolou vira obstáculo
  const portalsNew = [
    { at: VILLAGE_STATION_PORTAL, to: MALHA_PORTAL_ARRIVAL },
    { at: MALHA_STATION_PORTAL, to: VILLAGE_STATION_RETURN },
    { at: TUNNEL_MOUTH, to: TUNNEL_ARRIVAL },
    { at: TUNNEL_EXIT, to: TUNNEL_RETURN },
  ];
  const newPortals = portalsNew.map((d) => [d.at[0], d.at[1], d.to[0], d.to[1]]);
  const portalMap = new Map(oldPortals.concat(newPortals).map(([x, y, tx, ty]) => [x + ',' + y, [tx, ty]]));
  for (const [, lx, ly] of npcs) map.block(...G(lx, ly));
  let pockets = 0;
  {
    const reachIn = bfs(map, ...MALHA_TRAIN_ARRIVAL, portalMap);
    for (let y = Y0; y < Y0 + BH; y++) for (let x = X0; x < X0 + BW; x++) if (!map.layers.collision[idx(x, y)] && !reachIn[idx(x, y)]) {
      if (keep.has(li(x - X0, y - Y0))) continue; // validação abaixo acusa
      map.block(x, y); pockets++;
    }
  }
  for (const [, lx, ly] of npcs) map.block(...G(lx, ly), false);

  // ================================================================== OBJETOS (depois de todos os antigos)
  map.tileObj('npc', ...VILLAGE_STATION_MASTER, { npcId: 'chefe_estacao_vila' }, 'chefe_estacao_vila');
  for (const [id, lx, ly] of npcs) map.tileObj('npc', ...G(lx, ly), { npcId: id }, id);
  for (const d of portalsNew) map.tileObj('portal', d.at[0], d.at[1], { toX: d.to[0], toY: d.to[1] }, 'portal');
  const zones = [
    ['Via Permanente', 0, 0, BW, SURF_H + 2, '11 - Clearing.ogg', false],
    ['Estação Central da Malha', 3, 3, 34, 25, '36 - Village.ogg', true],
    ['Pátio de Manobra', 37, 3, 67, 35, '30 - Ruins.ogg', false],
    ['Portal de Inspeção', 104, 3, 53, 39, '14 - Curse.ogg', false],
    ['Oficina de Vagões', 117, 42, 41, 27, '17 - Fight.ogg', false],
    ['Túnel da Serra', 0, 74, BW, BH - 74, '2 - The Cave.ogg', false],
  ];
  for (const [name, lx, ly, w, h, music, pz] of zones) map.addObject({ type: 'zone', name, x: (X0 + lx) * 16, y: (Y0 + ly) * 16, width: w * 16, height: h * 16, rect: true, props: { music, pz } });
  for (const [m, count, radius, level, lx, ly] of spawns) map.tileObj('monster_spawn', ...G(lx, ly), { monster: m, count, radius, level }, m);
  map.tileObj('chegou_drop', ...CHEGOU_DROP, {}, 'chegou_drop');
  map.tileObj('chegou_drop_oficina', ...CHEGOU_DROP_OFICINA, {}, 'chegou_drop_oficina');
  lights.push([...VILLAGE_STATION_PORTAL, 2, '#ffe066', true]);
  for (const [x, y, radius, color, flicker] of lights) map.tileObj('light', x, y, { radius, color, flicker }, 'light');

  // ================================================================== VALIDAÇÃO
  const inRect = (r, x, y) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
  const oldNpcs = old.objects.filter((o) => o.type === 'npc').map((o) => [o.x / 16, o.y / 16]);
  // Vila: só objetos novos em tiles andáveis, livres e fora de portais antigos
  for (const [nm, [x, y]] of [['chefe_estacao_vila', VILLAGE_STATION_MASTER], ['chegada do trem na Vila', VILLAGE_TRAIN_ARRIVAL], ['portal da estação na Vila', VILLAGE_STATION_PORTAL], ['retorno na Vila', VILLAGE_STATION_RETURN]]) {
    if (!inRect(village, x, y)) fail(`${nm} ${x},${y} fora da Vila`);
    if (old.layers.collision[idx(x, y)] !== 0) fail(`${nm} ${x},${y} bloqueado no mapa antigo`);
    if (old.objects.some((o) => o.point && o.x / 16 === x && o.y / 16 === y)) fail(`${nm} ${x},${y} tem objeto antigo em cima`);
    if (oldPortals.some(([px, py, tx, ty]) => (px === x && py === y) || (tx === x && ty === y))) fail(`${nm} ${x},${y} é portal antigo ou alvo de um`);
  }
  for (const [x, y] of oldNpcs) if (Math.max(Math.abs(x - VILLAGE_STATION_MASTER[0]), Math.abs(y - VILLAGE_STATION_MASTER[1])) < 2) fail(`chefe_estacao_vila a menos de 2 tiles do npc em ${x},${y}`);
  if (!inRect(workshopPatio, ...CHEGOU_DROP_OFICINA)) fail('chegou_drop_oficina fora do Pátio de Encomendas');
  if (old.layers.collision[idx(...CHEGOU_DROP_OFICINA)] !== 0) fail('chegou_drop_oficina bloqueado');
  if (old.objects.some((o) => o.point && o.type === 'npc' && o.x / 16 === CHEGOU_DROP_OFICINA[0] && o.y / 16 === CHEGOU_DROP_OFICINA[1])) fail('chegou_drop_oficina em tile de NPC');
  // portais: andáveis, destinos andáveis e que não são portais
  for (const [x, y, tx, ty] of newPortals) {
    if (map.blocked(x, y)) fail(`portal ${x},${y} bloqueado`);
    if (map.blocked(tx, ty)) fail(`destino de portal ${tx},${ty} bloqueado`);
    if (portalMap.has(tx + ',' + ty)) fail(`destino de portal ${tx},${ty} é ele mesmo um portal`);
  }
  const allNpcs = [['chefe_estacao_vila', ...VILLAGE_STATION_MASTER], ...npcs.map(([id, lx, ly]) => [id, ...G(lx, ly)])];
  for (const [id, x, y] of allNpcs) if (map.blocked(x, y)) fail(`npc ${id} em ${x},${y} bloqueado`);
  for (let i = 0; i < allNpcs.length; i++) for (let j = i + 1; j < allNpcs.length; j++) {
    const d = Math.max(Math.abs(allNpcs[i][1] - allNpcs[j][1]), Math.abs(allNpcs[i][2] - allNpcs[j][2]));
    if (d < 2) fail(`npcs ${allNpcs[i][0]} e ${allNpcs[j][0]} a menos de 2 tiles`);
  }
  const points = [['chegada do trem (Malha)', MALHA_TRAIN_ARRIVAL], ['chegada do trem (Vila)', VILLAGE_TRAIN_ARRIVAL], ['chegou_drop', CHEGOU_DROP], ['chegou_drop_oficina', CHEGOU_DROP_OFICINA], ...newPortals.map(([x, y, tx, ty]) => [`portal ${x},${y}`, [x, y]]).concat(newPortals.map(([, , tx, ty]) => [`destino ${tx},${ty}`, [tx, ty]]))];
  for (const [nm, [x, y]] of points) {
    if (map.blocked(x, y)) fail(`${nm} ${x},${y} bloqueado`);
    if (allNpcs.some(([, nx, ny]) => nx === x && ny === y)) fail(`${nm} ${x},${y} é tile de NPC`);
  }
  for (const [nm, [x, y]] of [['chegada do trem (Malha)', MALHA_TRAIN_ARRIVAL], ['chegada do trem (Vila)', VILLAGE_TRAIN_ARRIVAL], ['chegou_drop', CHEGOU_DROP]]) {
    if (portalMap.has(x + ',' + y)) fail(`${nm} é portal`);
    if (allNpcs.some(([, nx, ny]) => Math.max(Math.abs(nx - x), Math.abs(ny - y)) < 2)) fail(`${nm} ${x},${y} colado num NPC`);
  }
  const station = { x0: X0 + 3, y0: Y0 + 3, x1: X0 + 36, y1: Y0 + 27 };
  for (const [nm, p] of [['chegada do trem (Malha)', MALHA_TRAIN_ARRIVAL], ['chegou_drop', CHEGOU_DROP], ['chegada do portal da Vila', MALHA_PORTAL_ARRIVAL]]) if (!inRect(station, ...p)) fail(`${nm} fora da Estação Central`);
  if (K(...L2(MALHA_TRAIN_ARRIVAL)) !== PLATFORM || K(...L2(CHEGOU_DROP)) !== PLATFORM) fail('chegada do trem e chegou_drop precisam estar na plataforma');
  // spawns: andáveis, fora da PZ (raio + 6 de folga), longe de NPCs (8), portais e chegadas (7 + raio); chefes isolados
  const avoid = [...newPortals.flatMap(([x, y, tx, ty]) => [[x, y], [tx, ty]]), MALHA_TRAIN_ARRIVAL];
  for (const [m, count, radius, , lx, ly] of spawns) {
    const [x, y] = G(lx, ly);
    if (map.blocked(x, y)) fail(`spawn ${m} em ${x},${y} bloqueado`);
    const dz = Math.max(station.x0 - x, 0, x - station.x1, station.y0 - y, 0, y - station.y1);
    if (dz < radius + 6) fail(`spawn ${m} em ${x},${y} a ${dz} da Estação (PZ)`);
    for (const [id, nx, ny] of allNpcs) if (Math.max(Math.abs(nx - x), Math.abs(ny - y)) < 8) fail(`spawn ${m} em ${x},${y} a menos de 8 do npc ${id}`);
    for (const [px, py] of avoid) if (Math.max(Math.abs(px - x), Math.abs(py - y)) < 7 + radius) fail(`spawn ${m} em ${x},${y} perto do portal/chegada ${px},${py}`);
    let room = 0; for (let j = -radius; j <= radius; j++) for (let i = -radius; i <= radius; i++) if (!map.blocked(x + i, y + j)) room++;
    if (room < count * 3) fail(`spawn ${m} em ${x},${y} sem espaço (${room} tiles para ${count})`);
  }
  for (const boss of ['vagao_nao_inspecionavel', 'locomotiva_fantasma']) {
    const b = spawns.find((s) => s[0] === boss);
    for (const s of spawns) if (s !== b && Math.max(Math.abs(s[4] - b[4]), Math.abs(s[5] - b[5])) < 11) fail(`spawn ${s[0]} a menos de 11 do covil de ${boss}`);
  }
  // alcance a pé (com portais) a partir do spawn do jogo
  const reach = bfs(map, spawnTile[0], spawnTile[1], portalMap);
  const Rch = (x, y) => reach[idx(x, y)] === 1;
  for (const [id, x, y] of allNpcs) if (!Rch(x, y)) fail(`npc ${id} em ${x},${y} inalcançável`);
  for (const [nm, [x, y]] of points) if (!Rch(x, y)) fail(`${nm} ${x},${y} inalcançável`);
  for (const [m, , , , lx, ly] of spawns) if (!Rch(...G(lx, ly))) fail(`spawn ${m} em ${G(lx, ly)} inalcançável`);
  // vazamento: nenhum tile andável nas linhas novas fora do bloco
  for (let y = OLD_H; y < H; y++) for (let x = 0; x < W; x++) {
    if (map.layers.collision[idx(x, y)] === 0 && !(x >= X0 && x < X0 + BW && y >= Y0 && y < Y0 + BH)) fail(`tile andável fora do bloco em ${x},${y}`);
  }
  // com os NPCs virados obstáculo, todo tile andável do bloco é alcançável a partir da chegada do trem
  for (const [, x, y] of allNpcs) map.block(x, y);
  const reachIn = bfs(map, ...MALHA_TRAIN_ARRIVAL, portalMap);
  let walk = 0, reached = 0;
  const lost = [];
  for (let y = Y0; y < Y0 + BH; y++) for (let x = X0; x < X0 + BW; x++) {
    const i = idx(x, y);
    if (map.layers.collision[i]) continue;
    walk++;
    if (reach[i] && reachIn[i]) reached++; else lost.push(`${x},${y}`);
  }
  for (const [, x, y] of allNpcs) map.block(x, y, false);
  console.log(`expansion4: ${W}x${H}, bloco ${BW}x${BH} em ${X0},${Y0}, ${allNpcs.length} npcs, ${newPortals.length} portais, ${spawns.length} spawns, ${lights.length} luzes, ${R ? L.set.used : 0} tiles Lemon; ${reached}/${walk} tiles andáveis alcançáveis (${pockets} bolsões fechados)`);
  if (lost.length) fail(`${lost.length} tiles andáveis do bloco inalcançáveis: ${lost.slice(0, 20).join(' ')}`);
  return { map, reach, portalMap };
}

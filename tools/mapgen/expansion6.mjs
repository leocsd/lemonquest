// Siderúrgica (ciclo 19, especificação em docs/regioes/siderurgica.md): o Alto-Forno acordou. Região de lv 10–120 em
// seis setores selados ligados por portas de level (10 → 25 → 40 → 60 → 80 → 100), com a Estação do Minério (PZ, trem) e a
// Sala de Controle (PZ, posto avançado) e, embaixo, o Coração do Forno (escuro). Só fantasia industrial.
//
// Sexta expansão, de novo PARA BAIXO: o mapa anterior (400×560) é copiado tile a tile para um mapa mais alto e o bloco
// 180×140 é desenhado em (4,580), com 30 linhas de vazio sólido entre ele e o fundo das caves do ciclo 13 (y 552). Nenhum
// tile antigo muda: o atalho da Malha é só um OBJETO portal na porta da casinha de cargas (46,384). Os objetos novos entram
// DEPOIS dos antigos (ids estáveis). A arte nova vem de `L.industry()`/`L.steel()` (tools/mapgen/industry.mjs), chamadas
// pela primeira vez aqui: os tiles Lemon antigos mantêm o id. Determinístico: gerador aleatório com semente própria.
//
// Bloco em (4,580); local (lx, ly) → global (4+lx, 580+ly). Superfície ly 3..96, borda em lx<=2, lx>=177, ly<=2, ly 97..99:
//   Estação do Minério (PZ)    lx 3..36,  ly 3..27   cópia da planta da Estação Central da Malha, anel de cerca fechado
//   Pátio de Minério (10–25)   lx 37..95, ly 3..46 + lx 3..36, ly 28..46 (em L, abraça a Estação)
//   Correias e Coqueria (25–40) lx 97..176, ly 3..46
//   Lingotamento (80–100)      lx 3..60,  ly 48..96  (Sala de Controle, PZ, em lx 3..19 × ly 48..63)
//   Aciaria (60–80, galpão)    lx 62..118, ly 48..96
//   Alto-Forno (40–60)         lx 120..176, ly 48..96
//   Coração do Forno (100–120) ly 100..137: salas de caverna escura com rios e poças de gusa e crosta de escória
// Os setores só se ligam por pares de portais encostados na mesma parede: porta com `minLevel` do lado de baixo, saída
// sem level do lado de cima. Monstro nunca pisa em portal, então nada vaza; quem perde level sempre sai.
import { GameMap, bfs, blobTable, blobMask, mulberry32, noise2 } from './lib.mjs';

export const NEW_H6 = 722;
export const BLOCK6 = { x0: 4, y0: 580, w: 180, h: 140 };
const G = (lx, ly) => [BLOCK6.x0 + lx, BLOCK6.y0 + ly];
/** Chegada do trem (plataforma 1; npcs.ts MINERIO_ARRIVAL). */
export const MINERIO_TRAIN_ARRIVAL = G(20, 14);
/** Portal oculto na Estação → volta na Malha; chegada de quem vem pela casinha de cargas da Malha. */
export const MINERIO_HIDDEN_PORTAL = G(4, 11);
export const MINERIO_PORTAL_ARRIVAL = G(7, 13);
/** Porta da casinha de cargas da Malha (houseOrange da Estação Central, expansion4) e o tile de volta. */
export const MALHA_CARGO_DOOR = [46, 384];
export const MALHA_CARGO_RETURN = [46, 385];
/** Chegada de viagem na Sala de Controle (reservada: opcional C7 da especificação) e reserva do Caminhão de Bobinas (ciclo 20). */
export const CONTROL_ROOM_ARRIVAL = G(11, 57);
export const TRUCK_RESERVE = G(26, 25);

// [npcId, lx, ly] — viram obstáculo em jogo (17 = 12 + 5 placas)
const NPCS = [
  ['chefe_estacao_minerio', 16, 12], ['almoxarife', 23, 12], ['depot_minerio', 28, 12], ['capela_epi', 30, 18], ['mestre_turno', 17, 24],
  ['operadora_correia', 103, 12], ['encarregada_coqueria', 128, 10], ['forneiro_chefe', 130, 62], ['mestre_aciaria', 112, 54],
  ['operador_laminador', 7, 52], ['supervisora_controle', 11, 52], ['espirito_fundidor', 15, 52],
  ['placa_correias', 94, 21], ['placa_area_quente', 145, 45], ['placa_epi', 122, 69], ['placa_carga_suspensa', 64, 77], ['placa_forno_acordado', 27, 90],
];
// Portas de level (local): porta A (lado de baixo, com minLevel) → chegada B; saída B (sem level) → volta A; portão = arte bloqueada.
const DOORS = [
  { id: 'D1', from: 'estacao', to: 'patio', minLevel: 10, door: [19, 26], arrive: [19, 29], exit: [20, 28], back: [20, 25], gate: [[19, 27], [20, 27]] },
  { id: 'D2', from: 'patio', to: 'correias', minLevel: 25, door: [95, 24], arrive: [98, 24], exit: [97, 25], back: [94, 25], gate: [[96, 24], [96, 25]] },
  { id: 'D3', from: 'correias', to: 'alto', minLevel: 40, door: [148, 46], arrive: [148, 49], exit: [149, 48], back: [149, 45], gate: [[148, 47], [149, 47]] },
  { id: 'D4', from: 'alto', to: 'aciaria', minLevel: 60, door: [120, 72], arrive: [117, 72], exit: [118, 73], back: [121, 73], gate: [[119, 72], [119, 73]] },
  { id: 'D5', from: 'aciaria', to: 'ling', minLevel: 80, door: [62, 80], arrive: [59, 80], exit: [60, 81], back: [63, 81], gate: [[61, 80], [61, 81]] },
  // escotilha do Poço do Cadinho: a saída fica na parede norte da sala de entrada e a chegada 3 tiles abaixo (regra das caves)
  { id: 'D6', from: 'ling', to: 'coracao', minLevel: 100, door: [30, 92], arrive: [30, 106], exit: [30, 103], back: [31, 93], gate: [[29, 91], [30, 91], [31, 91], [29, 92], [31, 92]], arrivalDist: 3 },
];
// [monstro, count, radius, level, x, y] em coordenadas GLOBAIS (especificação §3.5)
const SPAWNS = [
  // Pátio de Minério (10–25)
  ['caracol_ferrugem', 4, 4, 12, 12, 618], ['caracol_ferrugem', 4, 4, 12, 34, 621], ['caracol_ferrugem', 4, 4, 12, 52, 617],
  ['guaxinim_carvao', 6, 5, 15, 66, 592], ['morcego_chamine', 3, 4, 19, 86, 589], ['morcego_chamine', 3, 4, 19, 84, 618],
  ['slag_slime', 4, 4, 20, 66, 610],
  // Correias e Coqueria (25–40)
  ['serpente_correia', 4, 4, 27, 116, 616], ['serpente_correia', 4, 4, 27, 128, 606], ['serpente_correia', 4, 4, 27, 134, 620],
  ['gosma_gusa', 5, 5, 31, 146, 602], ['gosma_gusa', 3, 4, 31, 162, 594],
  ['coruja_fuligem', 3, 4, 35, 174, 588], ['coruja_fuligem', 3, 4, 35, 154, 610],
  ['contramestre_fuligem', 1, 3, 36, 168, 614],
  // Alto-Forno (40–60)
  ['salamandra_cadinho', 4, 4, 43, 156, 652], ['salamandra_cadinho', 4, 4, 43, 142, 670],
  ['golem_escoria', 3, 4, 53, 172, 662], ['golem_escoria', 3, 4, 53, 170, 638],
  ['truque_desalinhado', 3, 4, 48, 130, 668],
  // Aciaria (60–80)
  ['cavaleiro_aco_fundido', 3, 4, 64, 104, 640], ['cavaleiro_aco_fundido', 3, 4, 64, 92, 664], ['coracao_brasa', 2, 4, 67, 92, 664],
  ['coracao_brasa', 2, 4, 67, 112, 668], ['flame_skull', 3, 4, 70, 80, 672],
  ['golem_convertedor', 1, 3, 76, 80, 638],
  // Lingotamento e Laminação (80–100)
  ['rex_ferro', 3, 4, 88, 48, 642], ['rex_ferro', 3, 4, 88, 28, 656], ['magma_elemental', 3, 4, 86, 50, 670], ['hellhound', 3, 4, 95, 18, 668],
  // Coração do Forno (100–120)
  ['forjador_rubro', 3, 4, 104, 64, 692], ['gosma_aco_liquido', 3, 4, 114, 92, 696], ['forjador_rubro', 3, 4, 104, 126, 692],
  ['gosma_aco_liquido', 3, 4, 114, 130, 706], ['juggernaut', 2, 4, 110, 54, 711],
  ['fornalha_primordial', 1, 3, 118, 165, 700],
];
const BOSSES = ['contramestre_fuligem', 'golem_convertedor', 'fornalha_primordial'];
// [nome, x, y, w, h (tiles globais), pz, faixa, música] — o Pátio tem dois retângulos; a Sala vence o Lingotamento pela área
const ZONES = [
  ['Estação do Minério', 7, 583, 34, 25, true, null, '36 - Village.ogg'],
  ['Pátio de Minério', 41, 583, 59, 44, false, '10-25', '23 - Road.ogg'],
  ['Pátio de Minério', 7, 608, 34, 19, false, '10-25', '23 - Road.ogg'],
  ['Correias e Coqueria', 101, 583, 80, 44, false, '25-40', '28 - Tension.ogg'],
  ['Alto-Forno', 124, 628, 57, 49, false, '40-60', '17 - Fight.ogg'],
  ['Aciaria', 66, 628, 57, 49, false, '60-80', '10 - Dark Castle.ogg'],
  ['Lingotamento e Laminação', 7, 628, 58, 49, false, '80-100', '21 - Dungeon.ogg'],
  ['Sala de Controle', 7, 628, 17, 16, true, null, '27 - Chill.ogg'],
  ['Coração do Forno', 7, 680, 174, 38, false, '100-120', '24 - Final Area.ogg'],
];
// Coração do Forno: salas [lx0, ly0, lx1, ly1, chanfro] (especificação §1.6)
const ROOMS = [
  [22, 104, 38, 112, 2],   // 0 entrada (saída de D6 na parede norte)
  [39, 107, 46, 109, 0],   //   corredor 0→2
  [47, 104, 100, 121, 3],  // 2 Galeria da Gusa (rio norte-sul em lx 74..75)
  [101, 112, 106, 114, 0], //   corredor 2→4
  [107, 106, 140, 130, 3], // 4 Salão dos Forjadores
  [70, 122, 72, 125, 0],   //   corredor 2→6
  [20, 126, 100, 136, 2],  // 6 Fosso de Escória
  [141, 117, 146, 119, 0], //   corredor 4→8
  [147, 104, 175, 136, 4], // 8 Cadinho Primordial (chefe em 161,120)
];

export function expand6({ old, ts, S, L, spawnTile }) {
  const W = old.w, OLD_H = old.h, H = NEW_H6;
  const { x0: X0, y0: Y0, w: BW, h: BH } = BLOCK6;
  const fail = (msg) => { throw new Error('EXPANSION6 VALIDATION FAILED: ' + msg); };
  if (OLD_H >= Y0) fail(`o mapa anterior (${W}x${OLD_H}) já chega no bloco novo (y ${Y0})`);
  let lastRow = 0;
  for (let i = 0; i < old.layers.collision.length; i++) if (old.layers.collision[i] === 0) lastRow = Math.floor(i / W);
  const N0 = L.set.used; // tiles Lemon antes da etapa: tudo daqui para frente é novo (diff-atlas confere)
  const map = new GameMap(W, H, ts);
  for (const k of Object.keys(map.layers)) map.layers[k].set(old.layers[k]);
  map.occ.set(old.occ);
  map.objects = old.objects.slice();
  map.nextId = old.nextId;
  const nOldObjects = old.objects.length;
  const idx = (x, y) => y * W + x;
  const prop = (o, n) => o.properties?.find((p) => p.name === n)?.value;
  const cheb = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
  const oldPortals = old.objects.filter((o) => o.type === 'portal').map((o) => [o.x / 16, o.y / 16, prop(o, 'toX'), prop(o, 'toY')]);
  const I = L.industry(), T = L.steel(), R = L.rail();
  const rng = mulberry32(20261026);
  const pick = (a) => a[Math.floor(rng() * a.length)];
  const blob = blobTable();
  const hv = (lx, ly, s) => { let h = (Math.imul(lx, 374761393) + Math.imul(ly, 668265263) + Math.imul(s, 1442695041)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

  for (let y = OLD_H; y < H; y++) for (let x = 0; x < W; x++) { map.put('ground', x, y, 'O', 1, 1); map.block(x, y); }

  // ================================================================== máscaras (coordenadas locais)
  const NONE = 0, BORDER = 1, WALL = 2, FENCE = 3, PAL = 4, GATE = 5,
    STATION = 10, PATIO = 11, CORREIAS = 12, ALTO = 13, ACI = 14, LING = 15, SALA = 16, COR = 17, CORWALL = 18;
  const SECTOR = { [STATION]: 'estacao', [PATIO]: 'patio', [CORREIAS]: 'correias', [ALTO]: 'alto', [ACI]: 'aciaria', [LING]: 'ling', [SALA]: 'ling', [COR]: 'coracao' };
  const kind = new Uint8Array(BW * BH);
  const metal = new Uint8Array(BW * BH); // parede metálica (o resto das paredes é muro de concreto)
  const li = (lx, ly) => ly * BW + lx;
  const inL = (lx, ly) => lx >= 0 && ly >= 0 && lx < BW && ly < BH;
  const K = (lx, ly) => (inL(lx, ly) ? kind[li(lx, ly)] : NONE);
  const fill = (x0, y0, x1, y1, k) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (inL(x, y)) kind[li(x, y)] = k; };
  const SURF_H = 100;
  fill(0, 0, BW - 1, SURF_H - 1, BORDER);
  fill(3, 3, 36, 27, STATION);
  fill(37, 3, 95, 46, PATIO); fill(3, 28, 36, 46, PATIO);
  fill(97, 3, 176, 46, CORREIAS);
  fill(3, 48, 60, 96, LING); fill(3, 48, 19, 62, SALA);
  fill(62, 48, 118, 96, ACI);
  fill(120, 48, 176, 96, ALTO);
  // linhas que selam (1 tile, bloqueadas) e o perímetro (muro na borda de dentro, fora da Estação)
  fill(96, 3, 96, 46, FENCE);
  fill(3, 47, 176, 47, WALL); fill(61, 48, 61, 96, WALL); fill(119, 48, 119, 96, WALL);
  fill(20, 48, 20, 63, WALL); fill(3, 63, 20, 63, WALL); fill(11, 63, 12, 63, SALA); // Sala de Controle: vão aberto
  fill(2, 28, 2, 97, WALL); fill(177, 2, 177, 97, WALL); fill(37, 2, 177, 2, WALL); fill(2, 97, 177, 97, WALL);
  for (let lx = 3; lx <= 36; lx++) { kind[li(lx, 3)] = PAL; kind[li(lx, 27)] = PAL; }
  for (let ly = 3; ly <= 27; ly++) { kind[li(3, ly)] = PAL; kind[li(36, ly)] = PAL; }
  for (const d of DOORS) for (const [gx, gy] of d.gate) if (d.id !== 'D6') kind[li(gx, gy)] = GATE;
  for (let ly = 0; ly < SURF_H; ly++) for (let lx = 0; lx < BW; lx++) {
    const k = K(lx, ly);
    if (k !== WALL && k !== GATE) continue;
    if ((lx >= 61 && lx <= 119 && (ly === 47 || ly === 97)) || ((lx === 61 || lx === 119) && ly >= 47) || (lx === 20 && ly >= 48 && ly <= 63) || (ly === 63 && lx >= 3 && lx <= 20)) metal[li(lx, ly)] = 1;
  }
  // Coração do Forno: salas escavadas no vazio, paredes pela regra das caves (vizinho de piso ou piso 2 abaixo)
  for (const [x0, y0, x1, y1, ch] of ROOMS) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (ch) { const dx = Math.min(x - x0, x1 - x), dy = Math.min(y - y0, y1 - y); if (dx + dy < ch) continue; }
    kind[li(x, y)] = COR;
  }
  // pilares de rocha (quebram a linha de visão)
  for (const [x, y] of [[56, 106], [92, 110], [62, 120], [86, 105], [116, 109], [134, 126], [112, 127], [36, 130], [88, 134], [60, 134], [28, 128]]) kind[li(x, y)] = NONE;
  const isCor = (lx, ly) => K(lx, ly) === COR;
  for (let ly = SURF_H; ly < BH; ly++) for (let lx = 0; lx < BW; lx++) {
    if (K(lx, ly) !== NONE) continue;
    let w = false;
    for (let j = -1; j <= 1 && !w; j++) for (let i = -1; i <= 1; i++) if (isCor(lx + i, ly + j)) { w = true; break; }
    if (!w && isCor(lx, ly + 2)) w = true;
    if (w) kind[li(lx, ly)] = CORWALL;
  }
  kind[li(30, 103)] = COR; // saída de D6: porta na parede norte da sala de entrada (arte 'D' 2,0, como as caves)
  const isWalkKind = (k) => k >= STATION && k <= COR;

  // ================================================================== pontos que precisam ficar livres
  const keep = new Set(), keepNear = new Set();
  const addKeep = (lx, ly, r) => { keep.add(li(lx, ly)); for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (inL(lx + i, ly + j)) keepNear.add(li(lx + i, ly + j)); };
  const L2 = ([x, y]) => [x - X0, y - Y0];
  for (const [, lx, ly] of NPCS) addKeep(lx, ly, 1);
  for (const d of DOORS) for (const p of [d.door, d.arrive, d.exit, d.back]) addKeep(...p, 1);
  for (const p of [MINERIO_TRAIN_ARRIVAL, MINERIO_HIDDEN_PORTAL, MINERIO_PORTAL_ARRIVAL, CONTROL_ROOM_ARRIVAL, TRUCK_RESERVE]) addKeep(...L2(p), 1);
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) addKeep(L2(TRUCK_RESERVE)[0] + i, L2(TRUCK_RESERVE)[1] + j, 0);
  for (const s of SPAWNS) addKeep(s[4] - X0, s[5] - Y0, 2);

  // ================================================================== líquidos (gusa / escória) e passarelas
  const GUSA = 1, SLAG = 2;
  const liq = new Uint8Array(BW * BH), walkway = new Uint8Array(BW * BH), merge = new Uint8Array(BW * BH);
  const LQ = (lx, ly) => (inL(lx, ly) ? liq[li(lx, ly)] : 0);
  const setLiq = (x0, y0, x1, y1, v) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) liq[li(x, y)] = v; };
  // Alto-Forno: canal de gusa do furo (142,63) até ly 81 (2 de largura), duas passarelas; sai de baixo do forno
  setLiq(142, 63, 143, 81, GUSA);
  for (const ly of [68, 75]) for (const lx of [142, 143]) { liq[li(lx, ly)] = 0; walkway[li(lx, ly)] = 1; }
  merge[li(142, 62)] = GUSA; merge[li(143, 62)] = GUSA;
  // Alto-Forno: poços de escória (lx 164..175 × ly 88..95, cantos chanfrados)
  for (let ly = 88; ly <= 95; ly++) for (let lx = 164; lx <= 175; lx++) { const dx = Math.min(lx - 164, 175 - lx), dy = Math.min(ly - 88, 95 - ly); if (dx + dy >= 2) liq[li(lx, ly)] = SLAG; }
  // Coração: rio de gusa norte-sul na Galeria (lx 74..75) com passarelas em ly 108..109 e 116..117
  for (let ly = 104; ly <= 121; ly++) for (const lx of [74, 75]) { if (!isCor(lx, ly)) continue; if ((ly >= 108 && ly <= 109) || (ly >= 116 && ly <= 117)) walkway[li(lx, ly)] = 1; else liq[li(lx, ly)] = GUSA; }
  for (const ly of [102, 103, 122, 123]) for (const lx of [74, 75]) merge[li(lx, ly)] = GUSA;
  // Coração: poças 3×3 no Salão dos Forjadores
  setLiq(130, 110, 132, 112, GUSA);
  // Coração: anel de gusa junto às paredes do Cadinho Primordial (fica livre a entrada do corredor e o raio 6 do chefe)
  {
    const [x0, y0, x1, y1] = ROOMS[8];
    for (let ly = y0; ly <= y1; ly++) for (let lx = x0; lx <= x1; lx++) {
      if (!isCor(lx, ly)) continue;
      let nearWall = false;
      for (let j = -2; j <= 2 && !nearWall; j++) for (let i = -2; i <= 2; i++) if (K(lx + i, ly + j) === CORWALL) { nearWall = true; break; }
      if (!nearWall) continue;
      if (lx <= x0 + 4 && ly >= 114 && ly <= 122) continue; // entrada do corredor 4→8
      if (cheb(lx, ly, 161, 120) <= 6) continue;
      liq[li(lx, ly)] = GUSA;
    }
    for (let ly = y0 - 2; ly <= y1 + 2; ly++) for (let lx = x0 - 2; lx <= x1 + 2; lx++) if (K(lx, ly) === CORWALL) merge[li(lx, ly)] = GUSA;
  }
  // Coração: crosta de escória e poças de gusa no Fosso (retângulos chanfrados, longe do corredor 2→6 e do Colosso)
  for (const [x0, y0, x1, y1, v] of [[22, 128, 27, 133, SLAG], [34, 132, 42, 135, SLAG], [57, 127, 62, 130, GUSA], [80, 128, 87, 132, SLAG], [92, 130, 98, 135, GUSA], [66, 133, 74, 135, SLAG]]) {
    for (let ly = y0; ly <= y1; ly++) for (let lx = x0; lx <= x1; lx++) {
      const dx = Math.min(lx - x0, x1 - lx), dy = Math.min(ly - y0, y1 - ly);
      if (dx + dy >= 1 && isCor(lx, ly) && !keepNear.has(li(lx, ly))) liq[li(lx, ly)] = v;
    }
  }
  for (let ly = 124; ly <= 138; ly++) for (let lx = 18; lx <= 102; lx++) if (K(lx, ly) === CORWALL && !merge[li(lx, ly)]) merge[li(lx, ly)] = SLAG;
  // poça não pode cobrir ponto protegido
  for (const k of keep) if (liq[k]) fail(`gusa/escória cobre ponto protegido em ${G(k % BW, Math.floor(k / BW))}`);

  // ================================================================== a via (segmentos em coordenadas globais)
  const seg = (a, b, o = {}) => ({ a: G(...a), b: G(...b), ...o });
  const segs = R.prep([
    // Estação: via 1 (plataforma 1) e via 2 (plataforma 2), fechadas com para-choque nas duas pontas
    seg([5, 16], [33, 16], { endA: true, endB: true }), seg([8, 20], [32, 20], { endA: true, endB: true }),
    // Pátio: Ramal do Minério (começa depois da rua de asfalto norte-sul)
    seg([45, 6], [92, 6], { endA: true, endB: true }), seg([45, 14], [90, 14], { endA: true, endB: true }),
    // Alto-Forno: via dos carros-torpedo
    seg([122, 84], [175, 84], { endA: true, endB: true }),
  ]);
  const trackGid = new Map();
  for (let ly = 0; ly < SURF_H; ly++) for (let lx = 0; lx < BW; lx++) { const [x, y] = G(lx, ly); const t = R.track(segs, x, y); if (t) trackGid.set(li(lx, ly), t); }
  const onTrack = (lx, ly) => trackGid.has(li(lx, ly));
  const nearTrack = (lx, ly, r = 1) => { for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (onTrack(lx + i, ly + j)) return true; return false; };

  // ================================================================== máscaras de chão especiais: asfalto, esteira, chapa
  const asph = new Uint8Array(BW * BH), belt = new Uint8Array(BW * BH), plate = new Uint8Array(BW * BH);
  const box = (arr, x0, y0, x1, y1, v = 1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) arr[li(x, y)] = v; };
  // Pátio: avenida (ly 29..31) da Estação até o canto, subindo por lx 88..90 até a porta D2; rua norte-sul em lx 40..42
  box(asph, 12, 29, 90, 31); box(asph, 88, 23, 90, 28); box(asph, 91, 23, 95, 25); box(asph, 40, 5, 42, 28);
  // esteiras: 1 = nervura 'h', 2 = 'v'. Correia 1 sai do Pátio (lx 84) e sobe em lx 140..141 até ly 9; correia 2 em ly 32..33
  box(belt, 84, 18, 146, 19, 1); box(belt, 145, 9, 146, 17, 2); box(belt, 100, 32, 150, 33, 1);
  // chapa xadrez: casa de corrida do Alto-Forno, linha de laminação e o pé do lingotamento contínuo
  box(plate, 134, 50, 151, 67); box(plate, 13, 64, 60, 71); box(plate, 26, 48, 40, 63); box(plate, 26, 88, 34, 95);

  // ================================================================== chão
  const gidPx = (gid) => { const loc = ts.locate(gid), p = loc.t.png.data, wd = loc.t.imagewidth; return (i, j) => { const k = ((loc.row * 16 + j) * wd + loc.col * 16 + i) * 4; return [p[k], p[k + 1], p[k + 2]]; }; };
  const parity = (lx, ly) => ((lx & 1) ? 1 : 0) | ((ly & 1) ? 2 : 0);
  const concreteAt = (lx, ly) => I.concrete(((lx & 3) === 3 ? 1 : 0) | ((ly & 3) === 3 ? 2 : 0) | (hv(lx, ly, 7) < 0.04 ? 4 : 0));
  const grassAt = (lx, ly) => { const t = hv(lx, ly, 1); return ts.gid('F', t < 0.1 ? 1 + Math.floor(t * 40) : 0, 12); };
  const salaFloor = (lx, ly) => {
    const same = (a, b) => K(a, b) === SALA;
    const top = !same(lx, ly - 1), bot = !same(lx, ly + 1), lef = !same(lx - 1, ly), rig = !same(lx + 1, ly);
    return ts.gid('I', 11 + (lef ? 0 : rig ? 2 : 1), top ? 6 : bot ? 9 : 7);
  };
  for (let ly = 0; ly < BH; ly++) for (let lx = 0; lx < BW; lx++) {
    const [x, y] = G(lx, ly), k = K(lx, ly);
    let g = 0;
    if (k === BORDER || k === STATION || k === PAL) g = grassAt(lx, ly);
    else if (k === PATIO || k === FENCE) g = R.gravel(Math.floor(hv(lx, ly, 2) * 4));
    else if (k === GATE) g = lx <= 36 && ly <= 27 ? grassAt(lx, ly) : lx === 96 ? R.gravel(1) : concreteAt(lx, ly);
    else if (k === CORREIAS || k === WALL) g = concreteAt(lx, ly);
    else if (k === ALTO || k === LING) g = plate[li(lx, ly)] ? I.checker(parity(lx, ly)) : concreteAt(lx, ly);
    else if (k === ACI) g = I.checker(parity(lx, ly));
    else if (k === SALA) g = salaFloor(lx, ly);
    else if (k === COR) { const [c, r] = pick([[20, 14], [21, 14], [20, 15], [21, 15]]); g = ts.gid('I', c, r); }
    if (g) map.set('ground', x, y, g);
  }
  // plataformas da Estação (mesma planta da Estação Central)
  const isPlat = (lx, ly) => (lx >= 6 && lx <= 33 && ly >= 11 && ly <= 15) || (lx >= 9 && lx <= 32 && ly >= 17 && ly <= 19);
  for (let ly = 11; ly <= 19; ly++) for (let lx = 6; lx <= 33; lx++) {
    if (!isPlat(lx, ly)) continue;
    const n = isPlat(lx, ly - 1) ? 0 : onTrack(lx, ly - 1) ? 2 : 1, s = isPlat(lx, ly + 1) ? 0 : onTrack(lx, ly + 1) ? 2 : 1;
    map.set('ground', ...G(lx, ly), R.platform(n, !isPlat(lx + 1, ly), s, !isPlat(lx - 1, ly), (lx + ly) % 2));
  }
  // asfalto (meio-fio onde o vizinho não é asfalto; faixa tracejada no meio das retas)
  const A = (lx, ly) => inL(lx, ly) && asph[li(lx, ly)] === 1;
  for (let ly = 0; ly < SURF_H; ly++) for (let lx = 0; lx < BW; lx++) {
    if (!A(lx, ly)) continue;
    let line = null;
    if (ly === 30 && lx >= 13 && lx <= 86 && !(lx >= 39 && lx <= 43)) line = 'h';
    else if (lx === 41 && ly >= 6 && ly <= 27) line = 'v';
    else if (lx === 89 && ly >= 26 && ly <= 28) line = 'v';
    else if (ly === 24 && lx >= 91 && lx <= 93) line = 'h';
    map.set('ground', ...G(lx, ly), I.asphalt({ n: !A(lx, ly - 1), e: !A(lx + 1, ly), s: !A(lx, ly + 1), w: !A(lx - 1, ly) }, line, 0));
  }
  // esteiras (estrutura nos lados sem esteira vizinha; passa por baixo da cerca de tela em lx 96)
  const B = (lx, ly) => inL(lx, ly) && belt[li(lx, ly)] !== 0;
  for (let ly = 0; ly < SURF_H; ly++) for (let lx = 0; lx < BW; lx++) {
    if (!B(lx, ly)) continue;
    map.set('ground', ...G(lx, ly), I.belt(belt[li(lx, ly)] === 1 ? 'h' : 'v', { n: !B(lx, ly - 1), e: !B(lx + 1, ly), s: !B(lx, ly + 1), w: !B(lx - 1, ly) }));
  }
  // lastro sob a via da Estação (por cima da grama) e do Alto-Forno (por cima do concreto); trilho na camada deco
  for (let ly = 0; ly < SURF_H; ly++) for (let lx = 0; lx < BW; lx++) {
    const [x, y] = G(lx, ly), k = K(lx, ly);
    // base lisa (grama / concreto sem junta) e 2 variantes: a via comprida não multiplica tiles no atlas
    if ((k === STATION && !isPlat(lx, ly)) || k === ALTO) { if (nearTrack(lx, ly)) map.set('ground', x, y, R.ballast(segs, x, y, gidPx(k === STATION ? ts.gid('F', 0, 12) : I.concrete(0)), lx & 1)); }
    const t = trackGid.get(li(lx, ly));
    if (t && (k === STATION || k === PATIO || k === ALTO)) map.set('deco', x, y, t);
  }
  // Aciaria: faixas zebradas (corredores em ly 68/72 e lx 90) e o trilho embutido do carro de panela em ly 70
  for (let ly = 48; ly <= 96; ly++) for (let lx = 62; lx <= 118; lx++) {
    const hz = ly === 68 || ly === 72, vt = lx === 90 && ly !== 70;
    if (ly === 70 && lx >= 64 && lx <= 116) map.set('ground', ...G(lx, ly), T.embeddedRail(lx === 64 ? 'l' : lx === 116 ? 'r' : 'm'));
    else if (hz || vt) map.set('ground', ...G(lx, ly), I.stripe(hz && vt ? 'x' : hz ? 'h' : 'v'));
  }
  for (let lx = 64; lx <= 88; lx++) map.set('ground', ...G(lx, 53), I.stripe('h')); // borda da nave dos convertedores
  // gusa / escória (blob) e passarelas
  const liqInside = (v) => (a, b) => { const lx = a - X0, ly = b - Y0; if (!inL(lx, ly)) return false; const k = li(lx, ly); return liq[k] === v || merge[k] === v || (v === GUSA && walkway[k] === 1); };
  const inG = liqInside(GUSA), inS = liqInside(SLAG);
  for (let ly = 0; ly < BH; ly++) for (let lx = 0; lx < BW; lx++) {
    const k = li(lx, ly), [x, y] = G(lx, ly);
    if (liq[k]) map.set('deco', x, y, T.liquid(liq[k] === GUSA ? 'gusa' : 'escoria', blob[blobMask(liq[k] === GUSA ? inG : inS, x, y)]));
    else if (walkway[k]) {
      const n = walkway[li(lx, ly - 1)], s = walkway[li(lx, ly + 1)];
      map.set('ground', x, y, T.catwalk(!n && !s ? 'ns' : !n ? 'n' : 's'));
    }
  }
  // escotilha do Poço do Cadinho
  map.set('ground', ...G(30, 92), T.hatch());

  // ================================================================== colisão básica
  for (let ly = 0; ly < BH; ly++) for (let lx = 0; lx < BW; lx++) {
    const [x, y] = G(lx, ly), k = K(lx, ly);
    if (isWalkKind(k) && !liq[li(lx, ly)]) map.block(x, y, false); else map.block(x, y);
  }

  // ================================================================== paredes, cercas e portões
  const isWallish = (k) => k === WALL || k === GATE || k === FENCE || k === CORWALL;
  const nb = (lx, ly, test) => ({ n: test(K(lx, ly - 1)), e: test(K(lx + 1, ly)), s: test(K(lx, ly + 1)), w: test(K(lx - 1, ly)) });
  for (let ly = 0; ly < BH; ly++) for (let lx = 0; lx < BW; lx++) {
    const k = K(lx, ly), [x, y] = G(lx, ly);
    if (k === WALL) map.set('deco', x, y, I.wall(metal[li(lx, ly)] ? 'metal' : 'concrete', nb(lx, ly, isWallish)));
    else if (k === FENCE) map.set('deco', x, y, I.chainFence(nb(lx, ly, (q) => q === FENCE || q === GATE || q === WALL)));
    else if (k === CORWALL) {
      const isW = (a, b) => K(a, b) === CORWALL;
      const row = isCor(lx, ly + 1) ? 2 : !isW(lx, ly - 1) ? 0 : !isW(lx, ly + 1) ? 2 : 1;
      map.put('deco', x, y, 'R', !isW(lx - 1, ly) ? 4 : !isW(lx + 1, ly) ? 6 : 5, row);
    }
  }
  // paliçada da Estação (a mesma da Estação Central), fechada: a cancela de D1 fica no lugar da brecha sul
  for (let lx = 3; lx <= 36; lx++) for (const ly of [3, 27]) if (K(lx, ly) === PAL) map.put('deco', ...G(lx, ly), 'H', lx % 2 ? 11 : 12, 5);
  for (let ly = 4; ly <= 26; ly++) for (const lx of [3, 36]) map.put('deco', ...G(lx, ly), 'H', 11, 6);
  const putRows = (rows, lx, ly, layer = 'deco') => rows.forEach((row, j) => row.forEach((g, i) => { if (g) map.set(layer, ...G(lx + i, ly + j), g); }));
  putRows(R.gate(false), 19, 27);
  putRows(I.slidingDoor('v'), 96, 24); putRows(I.slidingDoor('h'), 148, 47); putRows(I.slidingDoor('v'), 119, 72); putRows(I.slidingDoor('v'), 61, 80);
  // corrimão em volta da escotilha (aberto para o sul, onde fica a volta)
  {
    const rail = new Set(DOORS[5].gate.map(([gx, gy]) => li(gx, gy)));
    const Rl = (a, b) => rail.has(li(a, b));
    for (const [gx, gy] of DOORS[5].gate) map.set('deco', ...G(gx, gy), I.railing({ n: Rl(gx, gy - 1), e: Rl(gx + 1, gy), s: Rl(gx, gy + 1), w: Rl(gx - 1, gy) }));
  }
  for (const [gx, gy] of DOORS.flatMap((d) => d.gate)) map.block(...G(gx, gy));

  // ================================================================== estruturas e enfeites
  const lights = [];
  const light = (lx, ly, radius, color, flicker = true) => lights.push([...G(lx, ly), radius, color, flicker]);
  const guard = (lx, ly, what) => { if (keepNear.has(li(lx, ly))) fail(`${what} em ${G(lx, ly)} encosta em NPC, porta, chegada ou spawn`); };
  /** folha de tiles (linhas de gids, de cima para baixo): linhas de base em deco + colisão, o resto em above */
  const putSheet = (rows, lx, ly, { baseRows = 1, blockAll = false, what = 'peça' } = {}) => {
    const h = rows.length;
    rows.forEach((row, j) => row.forEach((g, i) => {
      if (!g) return;
      guard(lx + i, ly + j, what);
      const [x, y] = G(lx + i, ly + j);
      if (j >= h - baseRows) { map.set('deco', x, y, g); map.block(x, y); } else { map.set('above', x, y, g); if (blockAll) map.block(x, y); }
      map.reserve(x, y);
    }));
  };
  /** sprite sobre a via (vagão, locomotiva, carro-torpedo): linha de baixo bloqueia a via, as de cima vão para above */
  const putOnTrack = (cv, wt, ht, lx, ly) => {
    const rows = R.overTrack(cv, wt, ht, segs, ...G(lx, ly));
    rows.forEach((row, j) => row.forEach(([deco, above], i) => {
      const tlx = lx + i, tly = ly - (ht - 1) + j, [tx, ty] = G(tlx, tly);
      guard(tlx, tly, 'veículo');
      if (deco) map.set('deco', tx, ty, deco);
      if (above) map.set('above', tx, ty, above);
      if (j === ht - 1) map.block(tx, ty);
      map.reserve(tx, ty);
    }));
  };
  const stampL = (name, lx, ly, def) => { const [t, c, r, w, h, o = {}] = S[name] ?? def; for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) guard(lx + i, ly + j, name); map.stamp(t, c, r, w, h, ...G(lx, ly), o); };
  const E = (c, r, lx, ly, block = true) => { if (keep.has(li(lx, ly))) fail(`enfeite em ${G(lx, ly)} cobre NPC/chegada`); map.put('deco', ...G(lx, ly), 'E', c, r); if (block) map.block(...G(lx, ly)); map.reserve(...G(lx, ly)); };
  const lamp = (lx, ly) => { stampL('lamp', lx, ly - 1); light(lx, ly, 5, '#ffc060'); };
  const brazier = (lx, ly, color = '#ff9a3c') => { guard(lx, ly, 'braseiro'); map.set('deco', ...G(lx, ly), L.S.brazier); map.block(...G(lx, ly)); light(lx, ly, 6, color, true); };
  const deco1 = (lx, ly, g, block = true) => { guard(lx, ly, 'enfeite'); map.set('deco', ...G(lx, ly), g); if (block) map.block(...G(lx, ly)); map.reserve(...G(lx, ly)); };

  // ---- Estação do Minério: cópia da planta da Estação Central (expansion4), anel fechado, vias com para-choque
  putSheet(R.station(), 11, 6, { baseRows: 3, blockAll: true, what: 'prédio da estação' });
  putSheet(R.bench(), 19, 11); putSheet(R.bench(), 25, 11); putSheet(R.bench(), 13, 18); putSheet(R.bench(), 27, 18);
  putSheet(R.clockPost(), 12, 13); putSheet(R.clockPost(), 21, 17);
  for (const lx of [10, 30]) lamp(lx, 11);
  for (const lx of [17, 24]) lamp(lx, 19);
  E(0, 2, 32, 11); E(7, 2, 33, 11); E(9, 2, 33, 12); E(0, 0, 6, 11); // caixotes e barril, como na Malha
  putSheet(R.signal('green'), 35, 14); putSheet(R.signal('red'), 35, 21);
  stampL('houseOrange', 5, 22); stampL('barrel', 10, 24); E(0, 2, 11, 24); E(7, 2, 11, 25);
  for (const [lx, ly] of [[5, 5], [8, 5], [24, 5], [30, 5], [34, 6], [29, 23], [33, 24]]) stampL(pick(['treeRound2', 'treeOlive2', 'treePine2']), lx, ly);
  light(7, 13, 3, '#ffe066');

  // ---- Pátio de Minério: Ramal do Minério com hoppers e locomotiva, pilhas, esteira para as Correias, escória ao sul
  for (const lx of [47, 50, 53]) putOnTrack(R.wagonCv('hopper'), 3, 2, lx, 6);
  putOnTrack(R.locoCv(), 4, 2, 70, 6);
  for (const lx of [69, 72]) putOnTrack(R.wagonCv('gondola'), 3, 2, lx, 14);
  putSheet(T.windrow('ferro', 11), 46, 17, { blockAll: true, what: 'leira de minério' }); putSheet(T.windrow('ferro', 20), 54, 42, { blockAll: true, what: 'leira de minério' });
  putSheet(T.windrow('carvao', 11), 68, 21, { blockAll: true, what: 'leira de carvão' });
  putSheet(T.orePile('carvao'), 60, 20, { blockAll: true }); putSheet(T.orePile('ferro'), 74, 17, { blockAll: true });
  for (const [lx, ly] of [[14, 34], [21, 43]]) putSheet(T.orePile('escoria'), lx, ly, { blockAll: true });
  stampL('shopBlue', 85, 40); light(86, 43, 4, '#ffc060');
  for (const lx of [24, 36, 48, 56, 72, 84]) lamp(lx, 33);
  for (const ly of [12, 24]) lamp(38, ly);
  E(0, 0, 93, 5); E(0, 0, 93, 7); E(7, 2, 43, 4); E(0, 2, 44, 4);
  for (let ly = 28; ly <= 46; ly++) for (let lx = 3; lx <= 95; lx++) {
    if (K(lx, ly) !== PATIO || A(lx, ly) || keepNear.has(li(lx, ly)) || map.blocked(...G(lx, ly)) || map.occ[idx(...G(lx, ly))]) continue;
    if (hv(lx, ly, 21) < (lx < 37 ? 0.05 : 0.025)) deco1(lx, ly, pick(L.S.rubbleGray));
  }

  // ---- Correias e Coqueria: silos, bateria de fornos de coque, torre de apagamento, chaminé, galerias sobre as esteiras
  putSheet(T.silo(), 100, 4, { blockAll: true }); putSheet(T.silo(), 105, 4, { blockAll: true });
  for (let lx = 112; lx <= 143; lx++) {
    const kindOven = lx === 112 ? 'endL' : lx === 143 ? 'endR' : ['door0', 'door1', 'door2', 'door1'][Math.floor(hv(lx, 3, 11) * 4)];
    putSheet(T.cokeOven(kindOven), lx, 3, { baseRows: 2, blockAll: true, what: 'bateria de coque' });
    if (lx !== 112 && lx !== 143 && (lx - 115) % 6 === 0) light(lx, 8, 3, '#ff7a30', true);
  }
  for (let lx = 112; lx <= 143; lx++) map.set('above', ...G(lx, 8), I.pipe(lx === 112 ? 'h1' : lx === 143 ? 'h2' : 'h'));
  putSheet(T.coalTower(), 144, 3, { baseRows: 2, blockAll: true, what: 'torre de carvão' });
  putSheet(T.quenchTower(), 151, 3, { baseRows: 2, blockAll: true });
  putSheet(T.windrow('carvao', 13), 112, 12, { blockAll: true, what: 'leira de carvão' });
  putSheet(T.gasHolder(), 101, 38, { baseRows: 2, blockAll: true, what: 'gasômetro' });
  putSheet(T.windrow('carvao', 6), 148, 10, { blockAll: true, what: 'leira de coque' });
  stampL('houseRed', 166, 18); E(0, 0, 171, 19); E(0, 0, 171, 20); light(167, 21, 4, '#ffc060'); // vestiário do turno
  // rack de canos aéreo atravessando o setor, com suportes a cada 8 tiles (fora de esteira, spawn e passagem)
  for (let lx = 98; lx <= 147; lx++) {
    map.set('above', ...G(lx, 28), I.pipe(lx === 98 ? 'h1' : lx === 147 ? 'h2' : 'h'));
    if ((lx - 98) % 8 === 0 && !keepNear.has(li(lx, 28)) && !map.blocked(...G(lx, 28)) && !B(lx, 28)) deco1(lx, 28, I.pipeSupport());
  }
  putSheet(T.chimney(), 160, 3, { baseRows: 1, blockAll: true });
  const gallery = (lx0, lx1, ly) => { for (let lx = lx0; lx <= lx1; lx++) putRows(T.gallery(lx === lx0 ? 'l' : lx === lx1 ? 'r' : 'm'), lx, ly, 'above'); };
  gallery(118, 125, 17); gallery(104, 110, 31);
  for (const [lx, ly] of [[155, 26], [172, 27], [172, 35], [172, 43], [160, 44]]) putSheet(T.orePile('coque'), lx, ly, { blockAll: true });
  for (const [lx, ly] of [[106, 24], [132, 26], [146, 40], [120, 44], [110, 45], [168, 24]]) lamp(lx, ly);
  E(0, 0, 98, 10); E(0, 0, 98, 11); E(7, 2, 99, 10);

  // ---- Alto-Forno: o forno, três regeneradores, ar quente, canal de gusa, carros-torpedo, poços de escória
  putSheet(T.blastFurnace(), 140, 54, { baseRows: 3, blockAll: true, what: 'Alto-Forno' });
  for (const lx of [124, 128, 132]) putSheet(T.stove(), lx, 49, { baseRows: 2, blockAll: true, what: 'regenerador' });
  for (let lx = 126; lx <= 139; lx++) map.set('above', ...G(lx, 55), I.pipe(lx === 126 ? 'h1' : lx === 139 ? 'h2' : 'h'));
  for (const lx of [143, 156]) putOnTrack(T.torpedoCv(), 5, 2, lx, 84);
  for (const lx of [160, 164, 168]) putSheet(T.silo(), lx, 49, { blockAll: true, what: 'silo do alto-forno' });
  putSheet(T.gasHolder(), 168, 64, { baseRows: 2, blockAll: true, what: 'gasômetro' });
  for (const [lx, ly] of [[128, 80], [132, 80], [150, 90]]) putSheet(T.slabPile(), lx, ly);
  for (const lx of [156, 160]) putSheet(T.ladle(), lx, 88, { blockAll: true, what: 'panela de escória' });
  for (let ly = 70; ly <= 74; ly++) for (let lx = 173; lx <= 175; lx++) if (hv(lx, ly, 15) < 0.7) deco1(lx, ly, T.scrap(Math.floor(hv(lx, ly, 16) * 3)));
  for (const [lx, ly] of [[121, 49], [175, 49], [121, 95], [160, 95]]) brazier(lx, ly);
  for (let ly = 63; ly <= 81; ly += 3) light(ly % 2 ? 142 : 143, ly, 3, '#ff6020', true);
  for (let lx = 165; lx <= 174; lx += 4) light(lx, 91, 3, '#ff7a30', true);
  light(142, 61, 6, '#ff7a30', true); // furo do forno
  for (const [lx, ly] of [[128, 76], [160, 64], [134, 90], [168, 74]]) light(lx, ly, 5, '#ffd890', false);

  // ---- Aciaria (galpão): convertedores, panelas, pontes rolantes (só visual), pátio de sucata, luz de galpão
  for (const lx of [65, 84]) putSheet(T.converter(), lx, 49, { baseRows: 2, blockAll: true, what: 'convertedor' });
  for (const lx of [96, 104]) putSheet(T.ladle(), lx, 50, { blockAll: true, what: 'panela' });
  for (const ly of [64, 82]) for (let lx = 62; lx <= 118; lx++) map.set('above', ...G(lx, ly), T.crane(lx === 62 ? 'endL' : lx === 118 ? 'endR' : lx === (ly === 64 ? 76 : 100) ? 'trolley' : 'beam'));
  for (let ly = 90; ly <= 95; ly++) for (let lx = 113; lx <= 117; lx++) deco1(lx, ly, T.scrap(Math.floor(hv(lx, ly, 13) * 3)));
  for (let ly = 91; ly <= 95; ly++) for (let lx = 63; lx <= 67; lx++) deco1(lx, ly, T.scrap(Math.floor(hv(lx, ly, 14) * 3)));
  for (const lx of [69, 83, 97, 111]) for (const ly of [58, 78]) putSheet(I.column(), lx, ly - 1, { what: 'pilar do galpão' });
  for (const lx of [80, 104]) putSheet(T.ladle(), lx, 69, { blockAll: true, what: 'panela no carro' });
  for (const [lx, ly] of [[94, 91], [98, 91], [94, 94], [98, 94]]) putSheet(T.slabPile(), lx, ly);
  for (const lx of [67, 79, 91, 103, 115]) for (const ly of [52, 66, 86]) light(lx, ly, 6, '#ffe2a0', false);
  light(66, 48, 4, '#ff8a3c', true); light(85, 48, 4, '#ff8a3c', true);

  // ---- Lingotamento e Laminação: Sala de Controle, lingotamento contínuo, mesas de rolos, cadeiras, pátio de bobinas
  putSheet(T.controlDesk(), 5, 49, { what: 'mesa de controle' }); putSheet(T.controlDesk(), 13, 49, { what: 'mesa de controle' });
  stampL('locker', 18, 48, ['E', 2, 7, 1, 2, { blockAll: true }]); stampL('shelves', 3, 60, ['E', 10, 7, 2, 2, { blockAll: true }]);
  light(11, 55, 6, '#fff2c0', false);
  putSheet(T.caster(), 30, 50, { baseRows: 2, blockAll: true, what: 'lingotamento contínuo' });
  const rollers = (ly, x0, x1, gap, hot) => {
    for (let lx = x0; lx <= x1; lx++) {
      if (lx >= gap[0] && lx <= gap[1]) continue;
      const part = lx === x0 || lx === gap[1] + 1 ? 'l' : lx === x1 || lx === gap[0] - 1 ? 'r' : 'm';
      deco1(lx, ly, T.rollerTable(part, hot(lx)));
    }
  };
  for (let lx = 13; lx <= 21; lx++) putSheet(T.cokeOven(lx === 13 ? 'endL' : lx === 21 ? 'endR' : (lx & 1) ? 'door0' : 'door1'), lx, 64, { baseRows: 2, blockAll: true, what: 'forno de reaquecimento' });
  for (let lx = 14; lx <= 20; lx += 2) light(lx, 69, 3, '#ff7a30', true);
  rollers(68, 22, 58, [40, 41], (lx) => lx <= 26 || (lx >= 31 && lx <= 35) || (lx >= 53 && lx <= 56));
  for (const ly of [58, 60, 62]) rollers(ly, 33, 39, [99, 99], (lx) => ly === 58 && lx <= 36);
  for (let lx = 47; lx <= 59; lx++) map.set('above', ...G(lx, 75), T.crane(lx === 47 ? 'endL' : lx === 59 ? 'endR' : lx === 53 ? 'trolley' : 'beam'));
  for (const [lx, ly] of [[53, 84], [56, 87], [53, 90], [5, 72], [9, 72], [5, 75], [9, 75], [5, 78], [9, 78]]) putSheet(T.slabPile(), lx, ly);
  rollers(82, 22, 40, [30, 31], (lx) => lx >= 24 && lx <= 27);
  for (const lx of [28, 50]) putSheet(T.millStand(), lx, 66, { baseRows: 2, blockAll: true, what: 'cadeira de laminação' });
  for (let ly = 72; ly <= 78; ly += 2) for (let lx = 50; lx <= 56; lx += 2) deco1(lx, ly, T.coil());
  putSheet(T.slabPile(), 57, 74); putSheet(T.slabPile(), 44, 78);
  for (const [lx, ly] of [[33, 68], [55, 68], [25, 82]]) light(lx, ly, 4, '#ff8a3c', true);
  for (const [lx, ly] of [[24, 60], [52, 60], [14, 74], [40, 76], [52, 86], [24, 94], [8, 94]]) light(lx, ly, 5, '#ffd890', false);
  light(30, 92, 4, '#ff7a30', true); // escotilha

  // ---- luzes das portas: um poste de luz no primeiro tile do portão
  for (const d of DOORS) if (d.id !== 'D6') light(...d.gate[0], 4, '#ffd060', false);

  // ---- Coração do Forno: braseiros na entrada e nos cantos das salas grandes, rachaduras de lava, ossos
  light(30, 104, 3, '#ffe066', true);
  map.put('deco', ...G(30, 103), 'D', 2, 0);
  for (const [lx, ly] of [[24, 105], [36, 105], [24, 111], [36, 111], [50, 106], [97, 106], [50, 119], [97, 119], [110, 109], [137, 109], [110, 127], [137, 127]]) brazier(lx, ly, '#ff3020');
  for (let ly = SURF_H; ly < BH; ly++) for (let lx = 0; lx < BW; lx++) {
    if (!isCor(lx, ly) || liq[li(lx, ly)] || walkway[li(lx, ly)] || map.layers.deco[idx(...G(lx, ly))] || keepNear.has(li(lx, ly))) continue;
    let open = true; for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (!isCor(lx + i, ly + j) || liq[li(lx + i, ly + j)]) open = false;
    if (!open) continue;
    const r = rng();
    if (r < 0.025) { map.set('deco', ...G(lx, ly), pick(L.S.crackLava)); light(lx, ly, 3, '#ff4020', true); }
    else if (r < 0.04) map.set('deco', ...G(lx, ly), pick(L.S.bone));
  }
  for (const [lx, ly] of [[114, 118], [118, 122], [132, 118], [128, 121], [136, 114], [116, 113]]) { deco1(lx, ly, T.anvil()); light(lx, ly, 2, '#ff8a3c', true); }
  // gusa do Coração: um brilho a cada poucos tiles
  for (let ly = SURF_H; ly < BH; ly++) for (let lx = 0; lx < BW; lx++) if (liq[li(lx, ly)] === GUSA && hv(lx, ly, 17) < 0.14) light(lx, ly, 3, '#ff6020', true);

  // ---- mata da borda: árvores atrás do muro do perímetro e em volta da Estação
  const treeKinds = ['treePine2', 'treeOlive2', 'treeRound2', 'treePine2'];
  for (let ly = 0; ly < SURF_H; ly += 2) for (let lx = 0; lx < BW; lx += 2) {
    if (K(lx, ly) !== BORDER || K(lx + 1, ly) !== BORDER || K(lx, ly + 1) !== BORDER || K(lx + 1, ly + 1) !== BORDER) continue;
    const [t, c, r, w, h] = S[pick(treeKinds)];
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { if (ts.isEmpty(t, c + i, r + j)) continue; map.set(j === h - 1 ? 'deco' : 'above', ...G(lx + i, ly + j), ts.gid(t, c + i, r + j)); }
  }

  // ================================================================== bolsões: tile andável que o desenho isolou vira obstáculo
  const doorPortals = DOORS.flatMap((d) => [{ at: G(...d.door), to: G(...d.arrive), req: { minLevel: d.minLevel }, door: d }, { at: G(...d.exit), to: G(...d.back), door: d }]);
  const portalsNew = [
    { at: MALHA_CARGO_DOOR, to: MINERIO_PORTAL_ARRIVAL, req: { minLevel: 10 } },
    { at: MINERIO_HIDDEN_PORTAL, to: MALHA_CARGO_RETURN },
    ...doorPortals,
  ];
  const newPortals = portalsNew.map((d) => [d.at[0], d.at[1], d.to[0], d.to[1]]);
  const portalMap = new Map(oldPortals.concat(newPortals).map(([x, y, tx, ty]) => [x + ',' + y, [tx, ty]]));
  const npcG = NPCS.map(([id, lx, ly]) => [id, ...G(lx, ly)]);
  for (const [, x, y] of npcG) map.block(x, y);
  let pockets = 0;
  {
    const reachIn = bfs(map, ...MINERIO_TRAIN_ARRIVAL, portalMap);
    for (let y = Y0; y < Y0 + BH; y++) for (let x = X0; x < X0 + BW; x++) if (!map.layers.collision[idx(x, y)] && !reachIn[idx(x, y)]) {
      if (keep.has(li(x - X0, y - Y0))) continue; // validação abaixo acusa
      map.block(x, y); pockets++;
    }
  }
  for (const [, x, y] of npcG) map.block(x, y, false);

  // ================================================================== OBJETOS (depois de todos os antigos)
  for (const [id, x, y] of npcG) map.tileObj('npc', x, y, { npcId: id }, id);
  for (const d of portalsNew) map.tileObj('portal', d.at[0], d.at[1], { toX: d.to[0], toY: d.to[1], ...(d.req ?? {}) }, d.req ? 'quest_door' : 'portal');
  for (const [name, x, y, w, h, pz, faixa, music] of ZONES) map.addObject({ type: 'zone', name, x: x * 16, y: y * 16, width: w * 16, height: h * 16, rect: true, props: { music, pz, ...(faixa ? { faixa } : {}), regiao: 'Siderúrgica' } });
  for (const [m, count, radius, level, x, y] of SPAWNS) map.tileObj('monster_spawn', x, y, { monster: m, count, radius, level }, m);
  for (const [x, y, radius, color, flicker] of lights) map.tileObj('light', x, y, { radius, color, flicker }, 'light');

  // ================================================================== VALIDAÇÃO (falha alto)
  const walkable = (x, y) => !map.blocked(x, y);
  // 1. vazio entre o mapa antigo e a região; nada andável nas linhas de folga
  let firstRow = -1;
  for (let y = OLD_H; y < H && firstRow < 0; y++) for (let x = 0; x < W; x++) if (walkable(x, y)) { firstRow = y; break; }
  if (firstRow - 1 - lastRow < 26) fail(`vazio de ${firstRow - 1 - lastRow} linhas entre y ${lastRow} e y ${firstRow} (mínimo 26)`);
  for (let y = OLD_H; y < H; y++) for (let x = 0; x < W; x++) {
    if (!walkable(x, y)) continue;
    if (y < 583 || y > 716) fail(`tile andável na faixa de vazio em ${x},${y}`);
    // 2. nada andável fora do bloco (x 7..180) nem na faixa ao lado
    if (x < 7 || x > 180) fail(`tile andável fora do bloco em ${x},${y}`);
  }
  // 3. mapa antigo intacto (camadas de y < OLD_H e objetos antigos)
  for (const k of Object.keys(map.layers)) for (let i = 0; i < W * OLD_H; i++) if (map.layers[k][i] !== old.layers[k][i]) fail(`camada ${k} mudou no mapa antigo em ${i % W},${Math.floor(i / W)}`);
  for (let i = 0; i < nOldObjects; i++) if (JSON.stringify(map.objects[i]) !== JSON.stringify(old.objects[i])) fail(`objeto antigo #${i} mudou`);
  // zonas da região (menor área vence, como daynight.zoneAt e o índice do mundo)
  const zoneRects = ZONES.map(([name, x, y, w, h, pz, faixa]) => ({ name, x0: x, y0: y, x1: x + w - 1, y1: y + h - 1, pz, faixa }));
  const zoneAt = (x, y) => { let best = null; for (const z of zoneRects) if (x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1 && (!best || (z.x1 - z.x0 + 1) * (z.y1 - z.y0 + 1) < (best.x1 - best.x0 + 1) * (best.y1 - best.y0 + 1))) best = z; return best; };
  const sectorAt = (x, y) => SECTOR[K(x - X0, y - Y0)];
  // 10. zonas: 9 objetos com as props; todo andável do bloco numa zona da região
  const zoneObjs = map.objects.slice(nOldObjects).filter((o) => o.type === 'zone');
  if (zoneObjs.length !== 9) fail(`esperadas 9 zonas, há ${zoneObjs.length}`);
  for (const o of zoneObjs) { for (const p of ['music', 'pz', 'regiao']) if (prop(o, p) === undefined) fail(`zona ${o.name} sem ${p}`); if (prop(o, 'pz') === false && !/^\d+-\d+$/.test(prop(o, 'faixa') ?? '')) fail(`zona ${o.name} sem faixa`); }
  for (let y = Y0; y < Y0 + BH; y++) for (let x = X0; x < X0 + BW; x++) if (walkable(x, y) && !zoneAt(x, y)) fail(`tile andável ${x},${y} fora das zonas da região`);
  const pz = zoneRects.filter((z) => z.pz);
  const inPz = (x, y) => pz.some((z) => x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1);
  const distRect = (z, x, y) => Math.max(z.x0 - x, 0, x - z.x1, z.y0 - y, 0, y - z.y1);
  // 6. portas: minLevel crescente na ordem da cadeia, saída sem requisito do outro lado, vizinhas, andáveis
  const chain = ['estacao', 'patio', 'correias', 'alto', 'aciaria', 'ling', 'coracao'];
  let lastLv = 0;
  for (const [i, d] of DOORS.entries()) {
    if (d.from !== chain[i] || d.to !== chain[i + 1]) fail(`porta ${d.id} fora da ordem da cadeia`);
    if (!(d.minLevel > lastLv)) fail(`porta ${d.id}: minLevel ${d.minLevel} não é maior que ${lastLv}`);
    lastLv = d.minLevel;
    const [door, arrive, exit, back] = [d.door, d.arrive, d.exit, d.back].map((p) => G(...p));
    for (const [nm, p] of [['porta', door], ['chegada', arrive], ['saída', exit], ['volta', back]]) {
      if (!walkable(...p)) fail(`porta ${d.id}: ${nm} ${p} bloqueada`);
    }
    if (sectorAt(...door) !== d.from || sectorAt(...back) !== d.from) fail(`porta ${d.id}: porta/volta fora do setor ${d.from}`);
    if (sectorAt(...arrive) !== d.to || sectorAt(...exit) !== d.to) fail(`porta ${d.id}: chegada/saída fora do setor ${d.to}`);
    if (cheb(...arrive, ...exit) > (d.arrivalDist ?? 1)) fail(`porta ${d.id}: chegada ${arrive} longe da saída ${exit}`);
    if (cheb(...back, ...door) !== 1) fail(`porta ${d.id}: volta ${back} não é vizinha da porta ${door}`);
    if (portalMap.has(arrive.join()) || portalMap.has(back.join())) fail(`porta ${d.id}: destino é portal`);
    for (const g of d.gate) if (walkable(...G(...g))) fail(`porta ${d.id}: portão ${G(...g)} andável`);
    const pd = map.objects.find((o) => o.type === 'portal' && o.x === door[0] * 16 && o.y === door[1] * 16);
    const pe = map.objects.find((o) => o.type === 'portal' && o.x === exit[0] * 16 && o.y === exit[1] * 16);
    if (prop(pd, 'minLevel') !== d.minLevel) fail(`porta ${d.id} sem minLevel ${d.minLevel}`);
    if (prop(pe, 'minLevel') !== undefined || prop(pe, 'quest') !== undefined) fail(`saída da porta ${d.id} tem requisito`);
  }
  // atalho e portais em geral: andáveis, destino andável e que não é portal
  for (const [x, y, tx, ty] of newPortals) {
    if (!walkable(x, y)) fail(`portal ${x},${y} bloqueado`);
    if (!walkable(tx, ty)) fail(`destino de portal ${tx},${ty} bloqueado`);
    if (portalMap.has(tx + ',' + ty)) fail(`destino de portal ${tx},${ty} é ele mesmo um portal`);
  }
  // 9. pontos fixos
  {
    const [dx, dy] = MALHA_CARGO_DOOR, [rx, ry] = MALHA_CARGO_RETURN;
    if (old.layers.collision[idx(dx, dy)] !== 0) fail('porta da casinha de cargas da Malha bloqueada no mapa antigo');
    if (old.objects.some((o) => o.point && Math.floor(o.x / 16) === dx && Math.floor(o.y / 16) === dy)) fail('porta da casinha de cargas tem objeto antigo em cima');
    if (oldPortals.some(([px, py, tx, ty]) => (px === dx && py === dy) || (tx === dx && ty === dy))) fail('porta da casinha de cargas é portal antigo ou destino de um');
    if (old.layers.collision[idx(rx, ry)] !== 0 || portalMap.has(`${rx},${ry}`) || cheb(dx, dy, rx, ry) !== 1) fail('volta na Malha precisa ser andável, não portal e vizinha da porta');
    const [ax, ay] = MINERIO_TRAIN_ARRIVAL;
    if (!isPlat(ax - X0, ay - Y0) || !inPz(ax, ay)) fail('chegada do trem fora da plataforma ou da PZ');
    if (npcG.some(([, x, y]) => cheb(x, y, ax, ay) < 2)) fail('chegada do trem colada num NPC');
    if (portalMap.has(`${ax},${ay}`)) fail('chegada do trem é portal');
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const [x, y] = [TRUCK_RESERVE[0] + i, TRUCK_RESERVE[1] + j];
      if (!walkable(x, y) || npcG.some(([, nx, ny]) => nx === x && ny === y) || portalMap.has(`${x},${y}`)) fail(`reserva do Caminhão de Bobinas: ${x},${y} não está livre`);
    }
    const [cx, cy] = CONTROL_ROOM_ARRIVAL;
    if (!walkable(cx, cy) || npcG.some(([, nx, ny]) => cheb(nx, ny, cx, cy) < 2) || portalMap.has(`${cx},${cy}`) || zoneAt(cx, cy)?.name !== 'Sala de Controle') fail('chegada da Sala de Controle não está livre');
  }
  // 8. NPCs: andáveis, >= 2 entre si, fora de portal/destino/chegada, os da Estação e da Sala na PZ
  const portalOrTarget = new Set(newPortals.flatMap(([x, y, tx, ty]) => [`${x},${y}`, `${tx},${ty}`]));
  for (const [id, x, y] of npcG) {
    if (!walkable(x, y)) fail(`npc ${id} em ${x},${y} bloqueado`);
    if (portalOrTarget.has(`${x},${y}`) || (x === MINERIO_TRAIN_ARRIVAL[0] && y === MINERIO_TRAIN_ARRIVAL[1])) fail(`npc ${id} em portal, destino ou chegada`);
    const z = zoneAt(x, y)?.name;
    if (['chefe_estacao_minerio', 'almoxarife', 'depot_minerio', 'capela_epi', 'mestre_turno'].includes(id) && z !== 'Estação do Minério') fail(`npc ${id} fora da Estação`);
    if (['operador_laminador', 'supervisora_controle', 'espirito_fundidor'].includes(id) && z !== 'Sala de Controle') fail(`npc ${id} fora da Sala de Controle`);
  }
  for (let i = 0; i < npcG.length; i++) for (let j = i + 1; j < npcG.length; j++) if (cheb(npcG[i][1], npcG[i][2], npcG[j][1], npcG[j][2]) < 2) fail(`npcs ${npcG[i][0]} e ${npcG[j][0]} a menos de 2 tiles`);
  // 7. spawns
  const avoid = [...newPortals.flatMap(([x, y, tx, ty]) => [[x, y], [tx, ty]]).filter(([, y]) => y >= Y0), MINERIO_TRAIN_ARRIVAL];
  for (const [m, count, radius, level, x, y] of SPAWNS) {
    if (!walkable(x, y)) fail(`spawn ${m} em ${x},${y} bloqueado`);
    const z = zoneAt(x, y);
    if (!z || z.pz) fail(`spawn ${m} em ${x},${y} fora de setor de caça`);
    for (let j = -radius; j <= radius; j++) for (let i = -radius; i <= radius; i++) if (zoneAt(x + i, y + j)?.name !== z.name) fail(`spawn ${m} em ${x},${y}: raio ${radius} sai da zona ${z.name}`);
    const [lo, hi] = z.faixa.split('-').map(Number);
    if (level < lo || level > hi) fail(`spawn ${m} lv ${level} fora da faixa ${z.faixa} de ${z.name}`);
    for (const p of pz) if (distRect(p, x, y) < radius + 6) fail(`spawn ${m} em ${x},${y} a ${distRect(p, x, y)} da PZ ${p.name}`);
    for (const [id, nx, ny] of npcG) if (cheb(nx, ny, x, y) - radius < 8) fail(`spawn ${m} em ${x},${y} perto demais do npc ${id}`);
    for (const [px, py] of avoid) if (cheb(px, py, x, y) < 7 + radius) fail(`spawn ${m} em ${x},${y} perto do portal/chegada ${px},${py}`);
    let room = 0; for (let j = -radius; j <= radius; j++) for (let i = -radius; i <= radius; i++) if (walkable(x + i, y + j)) room++;
    if (room < count * 3) fail(`spawn ${m} em ${x},${y} sem espaço (${room} tiles para ${count})`);
  }
  for (const boss of BOSSES) {
    const list = SPAWNS.filter((s) => s[0] === boss);
    if (list.length !== 1) fail(`chefe ${boss} com ${list.length} spawns (esperado 1)`);
    for (const s of SPAWNS) if (s !== list[0] && cheb(s[4], s[5], list[0][4], list[0][5]) < 11) fail(`spawn ${s[0]} a menos de 11 do chefe ${boss}`);
  }
  // 4. tudo alcançável a pé do templo (com portais), com NPCs e placas virados obstáculo
  const reach = bfs(map, spawnTile[0], spawnTile[1], portalMap);
  for (const [id, x, y] of npcG) if (!reach[idx(x, y)]) fail(`npc ${id} em ${x},${y} inalcançável`);
  for (const [m, , , , x, y] of SPAWNS) if (!reach[idx(x, y)]) fail(`spawn ${m} em ${x},${y} inalcançável`);
  for (const [nm, p] of [['chegada do trem', MINERIO_TRAIN_ARRIVAL], ['chegada da Sala', CONTROL_ROOM_ARRIVAL], ['reserva do caminhão', TRUCK_RESERVE]]) if (!reach[idx(...p)]) fail(`${nm} inalcançável`);
  const countIn = (r) => { let n = 0; for (let y = Y0; y < Y0 + BH; y++) for (let x = X0; x < X0 + BW; x++) if (r[idx(x, y)] && walkable(x, y)) n++; return n; };
  const before = countIn(bfs(map, spawnTile[0], spawnTile[1], portalMap));
  for (const [, x, y] of npcG) map.block(x, y);
  const reachNpc = bfs(map, spawnTile[0], spawnTile[1], portalMap);
  let walk = 0;
  const lost = [];
  for (let y = Y0; y < Y0 + BH; y++) for (let x = X0; x < X0 + BW; x++) { if (!walkable(x, y)) continue; walk++; if (!reachNpc[idx(x, y)]) lost.push(`${x},${y}`); }
  if (lost.length) fail(`${lost.length} tiles andáveis da região inalcançáveis com os NPCs como obstáculo: ${lost.slice(0, 12).join(' ')}`);
  if (countIn(reachNpc) !== before - npcG.length) fail(`NPCs como obstáculo fecham ${before - npcG.length - countIn(reachNpc)} tile(s)`);
  // 5. setores selados: BFS sem portais de cada chegada só visita o próprio setor, e visita todos os andáveis dele
  const perSector = {};
  for (let y = Y0; y < Y0 + BH; y++) for (let x = X0; x < X0 + BW; x++) if (walkable(x, y)) { const s = sectorAt(x, y); if (!s) fail(`tile andável ${x},${y} sem setor`); perSector[s] = (perSector[s] ?? 0) + 1; }
  const entries = { estacao: MINERIO_TRAIN_ARRIVAL, ...Object.fromEntries(DOORS.map((d) => [d.to, G(...d.arrive)])) };
  for (const [sec, p] of Object.entries(entries)) {
    const r = bfs(map, p[0], p[1]);
    let n = 0;
    for (let y = Y0; y < Y0 + BH; y++) for (let x = X0; x < X0 + BW; x++) if (r[idx(x, y)]) { if (sectorAt(x, y) !== sec) fail(`setor ${sec} vaza para ${sectorAt(x, y) ?? 'fora'} em ${x},${y}`); n++; }
    for (let y = 0; y < Y0; y++) for (let x = 0; x < W; x++) if (r[idx(x, y)]) fail(`setor ${sec} vaza para o mapa antigo em ${x},${y}`);
    if (n !== perSector[sec]) fail(`setor ${sec}: a chegada alcança ${n} de ${perSector[sec]} tiles sem portal`);
  }
  for (const [, x, y] of npcG) map.block(x, y, false);
  // 11/12. atlas e resumo
  const newTiles = L.set.used - N0;
  const sectorLine = Object.entries(perSector).map(([s, n]) => `${s} ${n}`).join(', ');
  console.log(`expansion6: ${W}x${H}, bloco ${BW}x${BH} em ${X0},${Y0}; vazio ${firstRow - 1 - lastRow} linhas (y ${lastRow + 1}..${firstRow - 1}); andáveis por setor: ${sectorLine}; ${npcG.length} npcs, ${newPortals.length} portais, ${SPAWNS.length} spawns (${SPAWNS.reduce((s, x) => s + x[1], 0)} monstros), ${lights.length} luzes, ${map.objects.length - nOldObjects} objetos novos; tiles Lemon ${N0} → ${L.set.used} (+${newTiles}); ${pockets} bolsões fechados; ${walk} tiles andáveis alcançáveis`);
  if (newTiles < 150 || newTiles > 500) console.warn(`expansion6: AVISO — ${newTiles} tiles Lemon novos (esperado 250–400)`);
  return { map, reach, portalMap };
}

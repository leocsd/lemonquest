// Montadora (ciclo 20, especificação em docs/regioes/montadora.md): as máquinas da linha criaram vontade própria e tudo o
// que sai da linha sai amarelo-limão. Região de lv 10–120 em setores selados ligados por portas de level (25 → 40 → 60 →
// 80 → 90 → 110), com a Portaria (PZ: cegonha, Caminhão de Bobinas, cantina) e a Sala de Descanso (PZ, posto avançado) e,
// no subsolo, a Sala dos Protótipos (escura) e a Pista do Crash Test (alavanca) com o Boxe dos Troféus. Só fantasia.
//
// Sétima expansão, de novo PARA BAIXO: o mapa anterior (400×722) é copiado tile a tile para um mapa de 400×888 e o bloco
// 180×140 é desenhado em (216,746), com 29 linhas de vazio entre ele e o fundo da Siderúrgica (y 716). Nenhum tile antigo
// muda: o atalho da Oficina, a cegonha da Vila e o Caminhão de Bobinas da Estação do Minério são só OBJETOS. Os objetos
// novos entram DEPOIS dos antigos (ids estáveis). A arte nova vem de `L.factory()` (industry.mjs), chamada pela primeira
// vez aqui; `L.industry()`/`L.steel()`/`L.rail()` já existem (memorizadas: nada se realoca). Semente própria.
//
// Bloco em (216,746); local (lx, ly) → global (216+lx, 746+ly). Superfície ly 0..99 (muro externo em lx 2, lx 177, ly 2,
// ly 97; mata do lado de fora); subsolo ly 104..137:
//   Portaria (PZ)                lx 3..30,   ly 3..32   cerca em lx 31 com a cancela aberta (ly 14..18), muro em ly 33
//   Pátio de Carros (10–25)      lx 32..103, ly 3..45 + lx 3..31, ly 34..45; Lava-Rápido (galpão) em lx 80..103, ly 26..45
//   Estamparia (25–40)           lx 104..176, ly 3..45   galpão
//   Funilaria e Armação (40–60)  lx 3..84,   ly 46..72  galpão
//   Cabines de Pintura (60–80)   lx 85..176, ly 46..72  galpão; Estufa (chefe) em lx 150..176, ly 56..72
//   Montagem Final (80–100)      lx 3..100,  ly 73..96  galpão; Sala de Descanso (PZ) em lx 4..19, ly 74..84
//   Pista de Testes (90–110)     lx 101..176, ly 73..96 ao ar livre: oval, boxes, alavanca e a rampa do subsolo
//   Sala dos Protótipos (110–120) rampa, Galeria e Salão do Protótipo; Pista do Crash Test e Boxe dos Troféus (alavanca)
// Portas: o portal é o próprio vão da parede (como as da Cidadela, expansion2) e a saída sem level fica na mesma parede.
// Onde dois galpões encostam, a parede é dupla: o portal fica na parede de quem entra e a saída na do outro lado; o tile
// da outra parede atrás de cada um é uma barreira zebrada (bloqueada). Monstro nunca pisa em portal nem em PZ.
import { GameMap, bfs, mulberry32 } from './lib.mjs';

export const NEW_H7 = 888;
export const Y7 = 746;
export const BLOCK7 = { x0: 216, y0: 746, w: 180, h: 140 };
const G = (lx, ly) => [BLOCK7.x0 + lx, BLOCK7.y0 + ly];
/** Chegada da cegonha, do Cocheiro Dito e do Caminhão de Bobinas (npcs.ts MONTADORA_ARRIVAL). */
export const PORTARIA_ARRIVAL = G(16, 12);
/** Portão de serviço da Portaria: chegada de quem vem pelo atalho da Oficina e o portal de volta. */
export const SHORTCUT_ARRIVAL = G(6, 28);
export const SHORTCUT_BACK = G(3, 30);
/** Recanto do Pátio de Encomendas da Oficina (portal lv 10) e o tile de volta. */
export const OFICINA_PORTAL = [83, 332];
export const OFICINA_RETURN = [83, 331];
/** NPCs fora do bloco (só o objeto; nenhum tile muda): [npcId, x, y, zona PZ onde ficam]. */
const OUTSIDE_NPCS = [['mt_cegonha_vila', 91, 100, 'Vila de Pedra Clara'], ['mt_bobinas_sid', 30, 605, 'Estação do Minério']];

// [npcId, lx, ly] — viram obstáculo em jogo (18 = 12 NPCs + 6 placas)
const NPCS = [
  ['mt_motorista', 12, 8], ['mt_bobinas', 24, 8], ['mt_porteiro', 27, 13], ['mt_cantineira', 7, 18], ['mt_depot', 11, 18],
  ['mt_enfermeira', 20, 22], ['mt_lavador', 24, 28], ['mt_placa_patio', 29, 20],
  ['mt_placa_estamparia', 101, 18], ['mt_placa_funilaria', 37, 43], ['mt_prensista', 110, 26], ['mt_soldadora', 36, 50],
  ['mt_placa_pintura', 81, 60], ['mt_pintor', 90, 55], ['mt_placa_montagem', 98, 69], ['mt_supervisora', 10, 78],
  ['mt_placa_pista', 97, 81], ['mt_piloto', 126, 90],
];
const PZ_NPCS = { 'Portaria da Montadora': ['mt_motorista', 'mt_bobinas', 'mt_porteiro', 'mt_cantineira', 'mt_depot', 'mt_enfermeira', 'mt_lavador', 'mt_placa_patio'], 'Sala de Descanso': ['mt_supervisora'] };
// Portas de level (local): porta (com minLevel, no vão da parede de quem entra) → chegada; saída (sem level) → volta.
// twins = o tile da parede dupla atrás da porta e atrás da saída (barreira). A da rampa é no chão, na boca do prédio.
const DOORS = [
  { id: 'estamparia', from: 'patio', to: 'estamparia', minLevel: 25, door: [104, 20], arrive: [107, 20], exit: [104, 23], back: [102, 23], wall: 'v' },
  { id: 'funilaria', from: 'patio', to: 'funilaria', minLevel: 40, door: [40, 46], arrive: [40, 49], exit: [44, 46], back: [44, 44], wall: 'h' },
  { id: 'cabines', from: 'funilaria', to: 'cabines', minLevel: 60, door: [84, 58], arrive: [88, 58], exit: [85, 62], back: [82, 62], wall: 'v', twins: [[85, 58], [84, 62]] },
  { id: 'montagem', from: 'cabines', to: 'montagem', minLevel: 80, door: [95, 72], arrive: [95, 76], exit: [90, 73], back: [90, 70], wall: 'h', twins: [[95, 73], [90, 72]] },
  { id: 'pista', from: 'montagem', to: 'pista', minLevel: 90, door: [100, 84], arrive: [104, 84], exit: [100, 92], back: [98, 92], wall: 'v' },
  { id: 'subsolo', from: 'pista', to: 'prototipos', minLevel: 110, door: [171, 94], arrive: [160, 109], exit: [160, 106], back: [169, 94], floor: true },
];
/** Distância máxima (Chebyshev) entre a porta com level e a saída sem level (a da Pista, 84→92, é a maior). */
const DOOR_EXIT_MAX = 8;
// Alavanca "Crash Test" (local): placas no gramado em frente aos boxes; sala da alavanca no subsolo, sem acesso a pé.
const LEVER = {
  lever: [139, 89], plates: [[132, 89], [134, 89], [136, 89], [138, 89]], dests: [[8, 108], [8, 110], [8, 112], [8, 114]],
  room: [4, 106, 44, 118], spawns: [[32, 108], [36, 112], [32, 116], [40, 108], [42, 112], [40, 116]],
};
const ARENA_DOOR = { at: [45, 112], to: [51, 112] };   // Pista do Crash Test → Boxe dos Troféus
const TROPHY_EXIT = { at: [54, 107], to: [130, 92] };  // Boxe dos Troféus → pista, ao lado dos boxes
const TROPHY_ROOM = [50, 108, 57, 116];
const CHESTS = [['mt_crash_knight', 57, 109], ['mt_crash_paladin', 57, 111], ['mt_crash_sorcerer', 57, 113], ['mt_crash_druid', 57, 115]];
// [monstro, count, radius, level, lx, ly] (especificação §2.6)
const SPAWNS_L = [
  // Pátio de Carros (10–25)
  ['mt_calota', 4, 4, 12, 45, 10], ['mt_calota', 3, 4, 12, 62, 22], ['mt_calota', 3, 3, 12, 14, 42], ['mt_calota', 3, 4, 12, 88, 10],
  ['mt_serpente_fiacao', 3, 4, 16, 50, 30], ['mt_serpente_fiacao', 3, 4, 16, 72, 12], ['mt_serpente_fiacao', 3, 4, 16, 66, 38],
  // Lava-Rápido (Gosma Azul e o Sapão na baia do fundo)
  ['runaway_drum', 4, 4, 10, 86, 38], ['runaway_drum', 3, 3, 10, 86, 30], ['mt_sapao', 1, 2, 26, 97, 36],
  // Estamparia (25–40)
  ['mt_polvo_graxa', 4, 4, 30, 118, 10], ['mt_polvo_graxa', 4, 4, 30, 140, 36], ['mt_polvo_graxa', 3, 4, 30, 165, 32],
  ['mt_estampador', 3, 4, 36, 130, 20], ['mt_estampador', 3, 4, 36, 158, 12], ['mt_estampador', 2, 3, 36, 150, 28],
  // Funilaria e Armação (40–60)
  ['mt_lagartixa_faisca', 5, 4, 42, 15, 56], ['mt_lagartixa_faisca', 5, 4, 42, 60, 64], ['mt_lagartixa_faisca', 3, 3, 42, 52, 57],
  ['mt_robo_soldador', 3, 4, 52, 30, 64], ['mt_robo_soldador', 3, 4, 52, 70, 52], ['mt_robo_soldador', 2, 3, 52, 45, 67],
  // Cabines de Pintura (60–80) e o chefe da Estufa
  ['mt_mariposa_tinta', 4, 4, 64, 104, 60], ['mt_mariposa_tinta', 4, 4, 64, 128, 62], ['mt_mariposa_tinta', 3, 3, 64, 145, 66],
  ['mt_robo_pintor', 2, 4, 70, 115, 66], ['mt_robo_pintor', 2, 4, 70, 140, 51],
  ['mt_monstro_estufa', 1, 2, 74, 164, 64],
  // Montagem Final (80–100)
  ['mt_robo_montador', 3, 4, 84, 35, 80], ['mt_robo_montador', 3, 4, 84, 70, 92], ['mt_robo_montador', 2, 3, 84, 30, 92],
  ['mt_duble', 3, 4, 92, 55, 80], ['mt_duble', 3, 4, 92, 80, 90],
  // Pista de Testes (90–110)
  ['mt_tengu_cromado', 3, 4, 104, 115, 79], ['mt_tengu_cromado', 3, 4, 104, 163, 79], ['mt_piloto_fantasma', 3, 4, 108, 140, 77],
  ['mt_piloto_fantasma', 3, 4, 108, 117, 92], ['mt_duble', 2, 3, 92, 155, 93],
  // Sala dos Protótipos (110–120): poucos "protótipos rubros" do Abismo na Galeria (são a fonte comum do tier 8, do
  // Fragmento Abissal e da Essência Demoníaca: no mundo passam de 12 para 15), o resto é Colosso; O Protótipo no Salão
  ['abyss_tengu', 2, 4, 112, 150, 125], ['juggernaut', 4, 4, 110, 132, 124], ['juggernaut', 3, 4, 110, 114, 122], ['abyss_samurai', 1, 3, 120, 120, 128],
  ['mt_prototipo', 1, 3, 120, 78, 123],
];
const BOSSES = ['mt_sapao', 'mt_monstro_estufa', 'mt_prototipo'];
/** Faixa de level de cada setor de caça (o level do spawn comum fica dentro; chefes conferidos à parte). */
const SECTOR_BAND = { patio: [10, 25], lavarapido: [10, 25], estamparia: [25, 40], funilaria: [40, 60], cabines: [60, 80], estufa: [60, 80], montagem: [80, 100], pista: [90, 110], prototipos: [110, 120] };
// [nome, x, y, w, h (tiles globais), pz, faixa, música] — a zona menor vence (Lava-Rápido, Estufa e Sala de Descanso)
const ZONES = [
  ['Montadora', 216, 746, 180, 140, false, null, '31 - Sunny.ogg'],
  ['Portaria da Montadora', 219, 749, 28, 30, true, null, '33 - Calm Village.ogg'],
  ['Pátio de Carros', 248, 749, 72, 43, false, '10-25', '20 - Good Time.ogg'],
  ['Pátio de Carros', 219, 780, 29, 12, false, '10-25', '20 - Good Time.ogg'],
  ['Lava-Rápido', 296, 772, 24, 20, false, '10-25', '18 - Aquatic.ogg'],
  ['Estamparia', 320, 749, 73, 43, false, '25-40', '3 - Revelation.ogg'],
  ['Funilaria e Armação', 219, 792, 82, 27, false, '40-60', '38 - Intro.ogg'],
  ['Cabines de Pintura', 301, 792, 92, 27, false, '60-80', '13 - Mystical.ogg'],
  ['Estufa', 366, 802, 27, 17, false, '60-80', '37 - Dark Forest.ogg'],
  ['Montagem Final', 219, 819, 98, 24, false, '80-100', '32 - Manor.ogg'],
  ['Sala de Descanso', 220, 820, 16, 11, true, null, '9 - Quiet.ogg'],
  ['Pista de Testes', 317, 819, 76, 24, false, '90-110', '35 - Adventure.ogg'],
  ['Sala dos Protótipos', 276, 850, 117, 34, false, '110-120', '25 - End Theme 2.ogg'],
  ['Pista do Crash Test', 220, 852, 41, 13, false, null, '19 - Ascension.ogg'],
  ['Boxe dos Troféus', 266, 854, 9, 9, false, null, '5 - Peaceful.ogg'],
];
/** Zonas sem faixa de propósito: o fundo da região e as duas salas da alavanca (não são setor de caça). */
const NO_FAIXA = new Set(['Montadora', 'Pista do Crash Test', 'Boxe dos Troféus']);
// Subsolo: salas escavadas [lx0, ly0, lx1, ly1, chanfro] (especificação §2.7)
const ROOMS = [
  [152, 107, 168, 114, 1], // rampa (saída na parede norte em 160,106)
  [159, 115, 161, 117, 0], //   corredor rampa → Galeria
  [100, 118, 170, 131, 2], // Galeria dos Protótipos
  [96, 123, 99, 125, 0],   //   corredor Galeria → Salão
  [62, 110, 95, 135, 3],   // Salão do Protótipo (plataforma giratória no centro)
];
// Oval da Pista de Testes: centro no tile local (139,85); raios em tiles (industry.mjs TRACK: 35×11 e 27×6)
const OVAL = { cx: 139, cy: 85 };

export function expand7({ old, ts, S, L, spawnTile }) {
  const W = old.w, OLD_H = old.h, H = NEW_H7;
  const { x0: X0, y0: Y0, w: BW, h: BH } = BLOCK7;
  const fail = (msg) => { throw new Error('EXPANSION7 VALIDATION FAILED: ' + msg); };
  if (OLD_H >= Y0) fail(`o mapa anterior (${W}x${OLD_H}) já chega no bloco novo (y ${Y0})`);
  if (X0 + BW > W) fail('o bloco não cabe na largura do mapa');
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
  const I = L.industry(), T = L.steel(), R = L.rail(), F = L.factory();
  const rng = mulberry32(20261027);
  const pick = (a) => a[Math.floor(rng() * a.length)];
  const hv = (lx, ly, s) => { let h = (Math.imul(lx, 374761393) + Math.imul(ly, 668265263) + Math.imul(s, 1442695041)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

  for (let y = OLD_H; y < H; y++) for (let x = 0; x < W; x++) { map.put('ground', x, y, 'O', 1, 1); map.block(x, y); }

  // ================================================================== máscaras (coordenadas locais)
  const NONE = 0, BORDER = 1, WALL = 2, CWALL = 3, FENCE = 4, GLASS = 5, GATE = 6, BARRIER = 7, DOORWAY = 8, PWALL = 9,
    PORTARIA = 10, PATIO = 11, LAVA = 12, ESTAMP = 13, FUNIL = 14, CABINES = 15, ESTUFA = 16, MONTAGEM = 17, DESCANSO = 18,
    PISTA = 19, PROTO = 20, ARENA = 21, TROFEUS = 22;
  const SECTOR = { [PORTARIA]: 'portaria', [PATIO]: 'patio', [LAVA]: 'lavarapido', [ESTAMP]: 'estamparia', [FUNIL]: 'funilaria', [CABINES]: 'cabines', [ESTUFA]: 'estufa', [MONTAGEM]: 'montagem', [DESCANSO]: 'descanso', [PISTA]: 'pista', [PROTO]: 'prototipos', [ARENA]: 'arena', [TROFEUS]: 'trofeus' };
  /** setores ligados a pé (sem portal); monstro não entra nos de PZ */
  const GROUP = { portaria: 'entrada', patio: 'entrada', lavarapido: 'entrada', estamparia: 'estamparia', funilaria: 'funilaria', cabines: 'cabines', estufa: 'cabines', montagem: 'montagem', descanso: 'montagem', pista: 'pista', prototipos: 'prototipos', arena: 'arena', trofeus: 'trofeus' };
  const kind = new Uint8Array(BW * BH);
  const li = (lx, ly) => ly * BW + lx;
  const inL = (lx, ly) => lx >= 0 && ly >= 0 && lx < BW && ly < BH;
  const K = (lx, ly) => (inL(lx, ly) ? kind[li(lx, ly)] : NONE);
  const fill = (x0, y0, x1, y1, k) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (inL(x, y)) kind[li(x, y)] = k; };
  const SURF_H = 100;
  fill(0, 0, BW - 1, SURF_H - 1, BORDER);
  fill(2, 2, 177, 97, CWALL); // muro externo (o que sobra depois dos setores)
  // Portaria: cerca de tela em lx 31 com a cancela aberta (postes em ly 13 e 19), muro sul em ly 33
  fill(3, 3, 30, 32, PORTARIA);
  fill(31, 3, 31, 33, FENCE); fill(31, 14, 31, 18, PATIO); kind[li(31, 13)] = GATE; kind[li(31, 19)] = GATE;
  fill(3, 33, 30, 33, CWALL);
  // Pátio (L em volta da Portaria) e o Lava-Rápido (galpão com a frente aberta a oeste e a divisória da baia do fundo)
  fill(32, 3, 103, 45, PATIO); fill(3, 34, 31, 45, PATIO);
  fill(80, 26, 103, 45, WALL); fill(81, 27, 102, 44, LAVA); fill(80, 33, 80, 37, LAVA); fill(91, 27, 91, 44, WALL); fill(91, 34, 91, 36, LAVA);
  // Estamparia
  fill(104, 3, 104, 45, WALL); fill(105, 3, 176, 45, ESTAMP);
  // Funilaria, Cabines e a Estufa (parede em lx 150 e ly 56, vão em lx 150, ly 63..65)
  fill(3, 46, 84, 72, WALL); fill(3, 47, 83, 71, FUNIL);
  fill(85, 46, 176, 72, WALL); fill(86, 47, 176, 71, CABINES);
  fill(150, 56, 176, 56, WALL); fill(150, 57, 150, 71, WALL); fill(151, 57, 176, 71, ESTUFA); fill(150, 63, 150, 65, ESTUFA);
  // Montagem Final e a Sala de Descanso (parede em lx 3, lx 20 e ly 85; vão em lx 20, ly 78..79)
  fill(3, 73, 100, 73, WALL); fill(100, 74, 100, 96, WALL); fill(3, 74, 99, 96, MONTAGEM);
  fill(3, 74, 3, 85, WALL); fill(3, 85, 20, 85, WALL); fill(20, 74, 20, 85, WALL); fill(4, 74, 19, 84, DESCANSO); fill(20, 78, 20, 79, MONTAGEM);
  // Pista de Testes (ao ar livre, cerca de tela no norte)
  fill(101, 73, 176, 73, FENCE); fill(101, 74, 176, 96, PISTA);
  // cabines de pintura: 5 de 7×6 na parede norte, parede sul em ly 53 com vão de 2 (lx +2..+3)
  const BOOTHS = [90, 99, 108, 117, 126];
  for (const x0 of BOOTHS) { fill(x0, 47, x0, 53, GLASS); fill(x0 + 6, 47, x0 + 6, 53, GLASS); fill(x0, 53, x0 + 6, 53, GLASS); fill(x0 + 2, 53, x0 + 3, 53, CABINES); }
  // vãos das portas e as barreiras das paredes duplas
  for (const d of DOORS) {
    if (d.floor) continue;
    kind[li(...d.door)] = DOORWAY; kind[li(...d.exit)] = DOORWAY;
    for (const t of d.twins ?? []) kind[li(...t)] = BARRIER;
  }
  // subsolo: salas escavadas (paredes pela regra das caves) + Pista do Crash Test e Boxe dos Troféus (galpões de chapa)
  for (const [x0, y0, x1, y1, ch] of ROOMS) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (ch) { const dx = Math.min(x - x0, x1 - x), dy = Math.min(y - y0, y1 - y); if (dx + dy < ch) continue; }
    kind[li(x, y)] = PROTO;
  }
  const isProto = (lx, ly) => K(lx, ly) === PROTO;
  for (let ly = SURF_H; ly < BH; ly++) for (let lx = 0; lx < BW; lx++) {
    if (K(lx, ly) !== NONE) continue;
    let w = false;
    for (let j = -1; j <= 1 && !w; j++) for (let i = -1; i <= 1; i++) if (isProto(lx + i, ly + j)) { w = true; break; }
    if (!w && isProto(lx, ly + 2)) w = true;
    if (w) kind[li(lx, ly)] = PWALL;
  }
  kind[li(160, 106)] = PROTO; // saída da rampa: porta na parede norte (arte 'D' 2,0, como as caves)
  fill(3, 105, 45, 119, WALL); fill(4, 106, 44, 118, ARENA); kind[li(...ARENA_DOOR.at)] = DOORWAY;
  fill(49, 107, 58, 117, WALL); fill(50, 108, 57, 116, TROFEUS); kind[li(...TROPHY_EXIT.at)] = DOORWAY;
  // muro externo de chapa onde encosta num galpão; de concreto no resto
  const INDOOR = new Set([LAVA, ESTAMP, FUNIL, CABINES, ESTUFA, MONTAGEM, DESCANSO]);
  for (let ly = 0; ly < SURF_H; ly++) for (let lx = 0; lx < BW; lx++) {
    if (K(lx, ly) !== CWALL || ly === 33) continue;
    let indoor = false; for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (INDOOR.has(K(lx + i, ly + j))) indoor = true;
    if (indoor) kind[li(lx, ly)] = WALL;
  }
  const isWalkKind = (k) => (k >= PORTARIA && k <= TROFEUS) || k === DOORWAY;

  // ================================================================== pontos que precisam ficar livres
  const keep = new Set(), keepNear = new Set();
  const addKeep = (lx, ly, r) => { keep.add(li(lx, ly)); for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (inL(lx + i, ly + j)) keepNear.add(li(lx + i, ly + j)); };
  const L2 = ([x, y]) => [x - X0, y - Y0];
  for (const [, lx, ly] of NPCS) addKeep(lx, ly, 1);
  for (const d of DOORS) for (const p of [d.door, d.arrive, d.exit, d.back]) addKeep(...p, 1);
  for (const p of [PORTARIA_ARRIVAL, SHORTCUT_ARRIVAL, SHORTCUT_BACK]) addKeep(...L2(p), 1);
  for (const p of [ARENA_DOOR.at, ARENA_DOOR.to, TROPHY_EXIT.at, TROPHY_EXIT.to, LEVER.lever, ...LEVER.plates, ...LEVER.dests, ...LEVER.spawns]) addKeep(...p, 1);
  for (const [, lx, ly] of CHESTS) addKeep(lx - 1, ly, 0);
  for (const s of SPAWNS_L) addKeep(s[4], s[5], 2);

  // ================================================================== chão
  const parity = (lx, ly) => ((lx & 1) ? 1 : 0) | ((ly & 1) ? 2 : 0);
  const concreteAt = (lx, ly) => I.concrete(((lx & 3) === 3 ? 1 : 0) | ((ly & 3) === 3 ? 2 : 0) | (hv(lx, ly, 7) < 0.03 ? 4 : 0));
  const epoxyAt = (lx, ly) => F.epoxy(((lx & 3) === 3 ? 1 : 0) | ((ly & 3) === 3 ? 2 : 0));
  const grassAt = (lx, ly) => { const t = hv(lx, ly, 1); return ts.gid('F', t < 0.1 ? 1 + Math.floor(t * 40) : 0, 12); };
  const darkFloor = () => { const [c, r] = pick([[20, 14], [21, 14], [20, 15], [21, 15]]); return ts.gid('I', c, r); };
  const restFloor = (lx, ly) => { // piso de madeira com rodapé da Sala de Descanso (o mesmo da Sala de Controle)
    const same = (a, b) => K(a, b) === DESCANSO;
    const top = !same(lx, ly - 1), bot = !same(lx, ly + 1), lef = !same(lx - 1, ly), rig = !same(lx + 1, ly);
    return ts.gid('I', 11 + (lef ? 0 : rig ? 2 : 1), top ? 6 : bot ? 9 : 7);
  };
  // asfalto: Pátio inteiro (menos as ilhas de grama), pátio dos caminhões da Portaria e a pista de acesso até a cancela
  const asph = new Uint8Array(BW * BH), grass = new Uint8Array(BW * BH);
  const box = (arr, x0, y0, x1, y1, v = 1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) arr[li(x, y)] = v; };
  for (let ly = 0; ly < SURF_H; ly++) for (let lx = 0; lx < BW; lx++) if (K(lx, ly) === PATIO) asph[li(lx, ly)] = 1;
  box(asph, 3, 3, 30, 10); box(asph, 29, 11, 30, 18);
  // ilhas de grama do Pátio (com limoeiros) e os canteiros da Portaria
  const ISLANDS = [[32, 3, 38, 12], [93, 3, 96, 12], [32, 36, 38, 40], [90, 19, 96, 24], [3, 39, 8, 41], [3, 20, 6, 25], [25, 22, 29, 25], [12, 26, 16, 30]];
  for (const [x0, y0, x1, y1] of ISLANDS) { box(grass, x0, y0, x1, y1); box(asph, x0, y0, x1, y1, 0); }
  const curbAt = (lx, ly) => { const k = K(lx, ly); if (!(k === PORTARIA || k === PATIO)) return false; return !asph[li(lx, ly)]; };
  // eixo das ruas (faixa tracejada): rua principal ly 16, rua norte-sul lx 42, rua do Lava-Rápido ly 35
  const roadLine = (lx, ly) => {
    if (ly === 16 && lx >= 33 && lx <= 95 && !(lx >= 39 && lx <= 45)) return 'h';
    if (lx === 42 && ly >= 20 && ly <= 44 && !(ly >= 32 && ly <= 38)) return 'v';
    if (ly === 35 && lx >= 46 && lx <= 78) return 'h';
    return null;
  };
  // pintura do chão: vagas (divisória 'v' a cada 3 tiles, zebrado nas pontas) e a faixa de pedestre da Portaria
  const paint = new Map();
  /** fileiras de vagas [lx0, lx1, ly0]: carros 2×3 de frente para o norte entre divisórias */
  const STALL_ROWS = [[39, 92, 3], [39, 92, 9], [45, 89, 19], [45, 77, 25], [45, 77, 28], [45, 77, 39], [45, 77, 42], [32, 38, 20], [32, 38, 25], [32, 38, 30], [9, 30, 35], [9, 30, 42]];
  const stalls = [];
  for (const [x0, x1, y0] of STALL_ROWS) {
    for (let x = x0; x <= x1; x += 3) {
      const end = x === x0 || x + 3 > x1;
      for (let y = y0; y < y0 + 3; y++) if (asph[li(x, y)]) paint.set(li(x, y), end ? 'hatch' : 'v');
      if (x + 2 <= x1) stalls.push([x + 1, y0]);
    }
  }
  for (let lx = 14; lx <= 18; lx++) for (const ly of [8, 9]) paint.set(li(lx, ly), 'cross');
  for (let ly = 0; ly < BH; ly++) for (let lx = 0; lx < BW; lx++) {
    const [x, y] = G(lx, ly), k = K(lx, ly);
    let g = 0;
    if (k === BORDER) g = grassAt(lx, ly);
    else if (k === PORTARIA || k === PATIO || k === FENCE || k === GATE || k === CWALL || k === WALL) g = concreteAt(lx, ly);
    else if (k === LAVA) g = hv(lx, ly, 3) < 0.06 ? F.wetFloor(2) : F.wetFloor(hv(lx, ly, 4) < 0.5 ? 0 : 1);
    else if (k === ESTAMP || k === FUNIL || k === ARENA || k === TROFEUS) g = I.checker(parity(lx, ly));
    else if (k === CABINES || k === GLASS) g = epoxyAt(lx, ly);
    else if (k === ESTUFA) g = F.grate(ly & 1);
    else if (k === MONTAGEM) g = concreteAt(lx, ly);
    else if (k === DESCANSO) g = restFloor(lx, ly);
    else if (k === PISTA) g = F.track(lx - OVAL.cx, ly - OVAL.cy, lx === OVAL.cx && ly > OVAL.cy) || grassAt(lx, ly);
    else if (k === PROTO) g = darkFloor();
    if (ly === 73 && k === FENCE) g = grassAt(lx, ly);
    if (g) map.set('ground', x, y, g);
  }
  for (let ly = 0; ly < SURF_H; ly++) for (let lx = 0; lx < BW; lx++) {
    const [x, y] = G(lx, ly);
    if (grass[li(lx, ly)]) { map.set('ground', x, y, grassAt(lx, ly)); continue; }
    if (!asph[li(lx, ly)]) continue;
    const e = { n: curbAt(lx, ly - 1), e: curbAt(lx + 1, ly), s: curbAt(lx, ly + 1), w: curbAt(lx - 1, ly) }, p = paint.get(li(lx, ly));
    if (p && !e.n && !e.e && !e.s && !e.w) { map.set('ground', x, y, F.lotPaint(p)); continue; }
    paint.delete(li(lx, ly));
    map.set('ground', x, y, I.asphalt(e, roadLine(lx, ly), hv(lx, ly, 5) < 0.12 ? 1 : 0));
  }
  // vãos de porta e barreiras: limiar zebrado
  for (let ly = 0; ly < BH; ly++) for (let lx = 0; lx < BW; lx++) {
    const k = K(lx, ly);
    if (k !== DOORWAY && k !== BARRIER) continue;
    const vert = K(lx - 1, ly) !== WALL && K(lx + 1, ly) !== WALL; // parede em pé (vizinhos de cima/baixo são parede)
    map.set('ground', ...G(lx, ly), I.stripe(vert ? 'v' : 'h'));
  }
  map.set('ground', ...G(...DOORS[5].door), I.stripe('h')); // boca da rampa do subsolo
  // faixas zebradas: corredores da Funilaria, pista da Montagem, Crash Test
  const lane = new Uint8Array(BW * BH);
  const stripeLine = (x0, y0, x1, y1, keepKind) => { for (let ly = y0; ly <= y1; ly++) for (let lx = x0; lx <= x1; lx++) if (K(lx, ly) === keepKind) { map.set('ground', ...G(lx, ly), I.stripe(y0 === y1 ? 'h' : 'v')); lane[li(lx, ly)] = 1; } };
  for (const ly of [54, 62]) stripeLine(3, ly, 83, ly, FUNIL);
  for (const lx of [24, 42, 63]) stripeLine(lx, 47, lx, 71, FUNIL);
  for (const [lx, ly] of [[24, 54], [42, 54], [63, 54], [24, 62], [42, 62], [63, 62]]) map.set('ground', ...G(lx, ly), I.stripe('x'));
  for (const ly of [85, 92]) stripeLine(21, ly, 99, ly, MONTAGEM);
  for (const ly of [8, 39]) stripeLine(105, ly, 176, ly, ESTAMP);
  for (const ly of [109, 115]) stripeLine(12, ly, 43, ly, ARENA);
  // esteiras: Estamparia (ly 14..15 e 30..31, lx 110..172) e a linha de montagem (ly 88..89, lx 22..96)
  const belt = new Uint8Array(BW * BH);
  box(belt, 110, 14, 172, 15); box(belt, 110, 30, 172, 31); box(belt, 22, 88, 96, 89);
  const B = (lx, ly) => inL(lx, ly) && belt[li(lx, ly)] !== 0;
  for (let ly = 0; ly < SURF_H; ly++) for (let lx = 0; lx < BW; lx++) if (B(lx, ly)) map.set('ground', ...G(lx, ly), I.belt('h', { n: !B(lx, ly - 1), e: !B(lx + 1, ly), s: !B(lx, ly + 1), w: !B(lx - 1, ly) }));

  // ================================================================== colisão básica
  for (let ly = 0; ly < BH; ly++) for (let lx = 0; lx < BW; lx++) {
    const [x, y] = G(lx, ly);
    if (isWalkKind(K(lx, ly))) map.block(x, y, false); else map.block(x, y);
  }

  // ================================================================== paredes, cercas, vidro e cancelas
  const isWallish = (k) => k === WALL || k === CWALL || k === FENCE || k === GATE;
  const nb = (lx, ly, test) => ({ n: test(K(lx, ly - 1)), e: test(K(lx + 1, ly)), s: test(K(lx, ly + 1)), w: test(K(lx - 1, ly)) });
  for (let ly = 0; ly < BH; ly++) for (let lx = 0; lx < BW; lx++) {
    const k = K(lx, ly), [x, y] = G(lx, ly);
    if (k === WALL || k === CWALL) map.set('deco', x, y, I.wall(k === WALL ? 'metal' : 'concrete', nb(lx, ly, isWallish)));
    else if (k === FENCE) map.set('deco', x, y, I.chainFence(nb(lx, ly, (q) => q === FENCE || q === GATE || q === WALL || q === CWALL)));
    else if (k === GLASS) map.set('deco', x, y, F.glassWall(nb(lx, ly, (q) => q === GLASS)));
    else if (k === PWALL) {
      const isW = (a, b) => K(a, b) === PWALL;
      const row = isProto(lx, ly + 1) ? 2 : !isW(lx, ly - 1) ? 0 : !isW(lx, ly + 1) ? 2 : 1;
      map.put('deco', x, y, 'R', !isW(lx - 1, ly) ? 4 : !isW(lx + 1, ly) ? 6 : 5, row);
    }
  }
  const putRows = (rows, lx, ly, layer = 'deco') => rows.forEach((row, j) => row.forEach((g, i) => { if (g) map.set(layer, ...G(lx + i, ly + j), g); }));
  // cancelas abertas: pedestal na cerca, braço erguido por cima
  for (const ly of [13, 19]) { const [top, base] = F.boomGate(); map.set('deco', ...G(31, ly), base[0]); map.set('above', ...G(31, ly - 1), top[0]); }
  // folhas abertas dos portões de correr, na parede ao lado de cada vão
  putRows(I.slidingDoor('v'), 104, 21);                                    // Estamparia (entre a porta e a saída)
  putRows(I.slidingDoor('h'), 38, 46); putRows(I.slidingDoor('h'), 45, 46); // Funilaria
  putRows(I.slidingDoor('v'), 84, 56); putRows(I.slidingDoor('v'), 85, 63); // Cabines
  putRows(I.slidingDoor('h'), 96, 72); putRows(I.slidingDoor('h'), 88, 73); // Montagem
  putRows(I.slidingDoor('v'), 100, 85); putRows(I.slidingDoor('v'), 100, 89); // Pista
  putRows(I.slidingDoor('v'), 2, 28);                                        // portão de serviço da Portaria (no muro)

  // ================================================================== estruturas e enfeites
  const lights = [];
  const light = (lx, ly, radius, color, flicker = false) => lights.push([...G(lx, ly), radius, color, flicker]);
  const guard = (lx, ly, what, loose = false) => { if (loose ? keep.has(li(lx, ly)) : keepNear.has(li(lx, ly))) fail(`${what} em ${G(lx, ly)} encosta em NPC, porta, chegada ou spawn`); if (!isWalkKind(K(lx, ly)) || K(lx, ly) === DOORWAY) fail(`${what} em ${G(lx, ly)} fora do chão do setor`); };
  /** a peça cabe? (chão do setor, fora das folgas, sem outra peça, sem esteira) */
  const decals = new Set();
  const free = (lx, ly) => { const k = K(lx, ly); return isWalkKind(k) && k !== DOORWAY && !keepNear.has(li(lx, ly)) && !map.occ[idx(...G(lx, ly))] && !B(lx, ly) && !lane[li(lx, ly)] && !paint.has(li(lx, ly)) && (!map.layers.deco[idx(...G(lx, ly))] || decals.has(li(lx, ly))); };
  const fits = (rows, lx, ly) => rows.every((row, j) => row.every((g, i) => !g || free(lx + i, ly + j)));
  /** folha de tiles (linhas de gids, de cima para baixo): as `baseRows` de baixo em deco + colisão, o resto em above */
  const putSheet = (rows, lx, ly, { baseRows = 1, blockAll = false, what = 'peça', loose = false } = {}) => {
    const h = rows.length;
    rows.forEach((row, j) => row.forEach((g, i) => {
      if (!g) return;
      guard(lx + i, ly + j, what, loose);
      const [x, y] = G(lx + i, ly + j);
      if (j >= h - baseRows) { map.set('deco', x, y, g); map.block(x, y); } else { map.set('above', x, y, g); if (blockAll) map.block(x, y); }
      map.reserve(x, y);
    }));
  };
  /** peça chata (carro, prensa, caminhão): tudo em deco e bloqueado */
  const putFlat = (rows, lx, ly, what, loose = false) => putSheet(rows, lx, ly, { baseRows: rows.length, what, loose });
  const tryFlat = (rows, lx, ly) => { if (!fits(rows, lx, ly)) return false; putFlat(rows, lx, ly); return true; };
  const tryTall = (rows, lx, ly, opts) => { if (!fits(rows, lx, ly)) return false; putSheet(rows, lx, ly, opts); return true; };
  const deco1 = (lx, ly, g, block = true) => { guard(lx, ly, 'enfeite'); map.set('deco', ...G(lx, ly), g); if (block) map.block(...G(lx, ly)); map.reserve(...G(lx, ly)); };
  const try1 = (lx, ly, g, block = true) => { if (!free(lx, ly)) return false; deco1(lx, ly, g, block); return true; };
  /** decalque andável (calota, respingo, espuma, graxa): só onde o deco está vazio e não é portal/placa */
  const portalL = new Set([...DOORS.flatMap((d) => [d.door, d.exit]), L2(SHORTCUT_BACK), ARENA_DOOR.at, TROPHY_EXIT.at].map(([a, b]) => li(a, b)));
  const decal = (lx, ly, g) => { const k = K(lx, ly); if (!isWalkKind(k) || k === DOORWAY || portalL.has(li(lx, ly)) || map.layers.deco[idx(...G(lx, ly))] || map.occ[idx(...G(lx, ly))]) return false; map.set('deco', ...G(lx, ly), g); decals.add(li(lx, ly)); return true; };
  const stampL = (name, lx, ly, def) => { const [t, c, r, w, h, o = {}] = S[name] ?? def; for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (!ts.isEmpty(t, c + i, r + j)) guard(lx + i, ly + j, name); map.stamp(t, c, r, w, h, ...G(lx, ly), o); };
  const fitsStamp = (name, lx, ly, def) => { const [t, c, r, w, h] = S[name] ?? def; for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (!ts.isEmpty(t, c + i, r + j) && !free(lx + i, ly + j)) return false; return true; };
  const E = (c, r, lx, ly) => try1(lx, ly, ts.gid('E', c, r));
  const lamp = (lx, ly, color = '#ffc060') => { if (!free(lx, ly) || !free(lx, ly - 1)) return false; stampL('lamp', lx, ly - 1); light(lx, ly, 5, color); return true; };
  const tree = (lx, ly) => { const name = pick(['treeRound2', 'treeOlive2', 'treeRound2']); if (!fitsStamp(name, lx, ly)) return false; stampL(name, lx, ly); return true; };
  const carColor = (lx, ly) => { const t = hv(lx, ly, 31); return t < 0.6 ? 'limao' : F.CAR_COLORS[1 + Math.floor((t - 0.6) / 0.1)]; };

  // ---- Portaria: cegonha e Caminhão de Bobinas no pátio de asfalto, guarita, cantina, guarda-volumes, ambulatório
  putFlat(F.carrier(), 4, 4, 'cegonha');
  putFlat(F.coilTruck(), 16, 4, 'caminhão de bobinas');
  for (const lx of [20, 21, 22]) map.set('deco', ...G(lx, 5), T.coil()); // as três bobinas na carroceria
  putFlat(F.guardhouse(), 25, 9, 'guarita', true); // encosta em diagonal no Motorista do Caminhão (24,8), como na planta
  stampL('houseRed', 4, 14); stampL('shopBlue', 10, 14); stampL('houseBeige', 18, 17);
  for (const [lx, ly] of [[3, 20], [3, 23], [26, 22], [12, 27], [14, 29], [33, 4], [35, 8], [33, 37], [93, 4], [93, 8], [91, 20], [4, 39]]) tree(lx, ly);
  for (const [lx, ly] of [[8, 13], [23, 12], [9, 24], [17, 24], [26, 30], [3, 12], [22, 31]]) lamp(lx, ly);
  for (const [lx, ly] of [[8, 21], [21, 26], [14, 21], [7, 29]]) if (fits(R.bench(), lx, ly)) putFlat(R.bench(), lx, ly);
  for (const [c, r, lx, ly] of [[0, 0, 9, 16], [0, 2, 9, 15], [7, 2, 13, 16], [0, 0, 22, 19], [0, 2, 3, 32], [7, 2, 4, 32], [0, 0, 5, 32], [0, 0, 3, 3], [0, 2, 30, 32]]) E(c, r, lx, ly);
  for (const [c, r, lx, ly] of [[3, 9, 14, 19], [0, 9, 13, 19], [3, 9, 16, 21], [0, 9, 15, 21], [1, 2, 23, 16], [2, 9, 26, 17], [2, 9, 27, 17], [0, 2, 28, 12], [7, 2, 28, 15]]) E(c, r, lx, ly);
  for (const [lx, ly] of [[3, 15], [8, 16], [17, 18], [22, 16]]) tryTall([[ts.gid('E', 0, 7)], [ts.gid('E', 0, 8)]], lx, ly - 1, { baseRows: 1, blockAll: true });
  light(...L2(SHORTCUT_BACK), 3, '#ffe066'); light(13, 6, 4, '#ffc060'); light(21, 10, 4, '#ffc060');

  // ---- Pátio de Carros: vagas com carros (a maioria limão), ilhas com limoeiros, postes, calotas soltas, cones
  for (const [lx, ly] of stalls) { if (hv(lx, ly, 33) < 0.16) continue; tryFlat(F.car(carColor(lx, ly), 'v'), lx, ly); }
  for (const lx of [36, 48, 60, 72, 84]) lamp(lx, 13);
  for (const lx of [47, 59, 71]) lamp(lx, 19);
  for (const ly of [26, 32, 38]) lamp(39, ly);
  for (const [lx, ly] of [[79, 31], [79, 39], [97, 13], [97, 26], [30, 38], [20, 41], [56, 44]]) lamp(lx, ly);
  for (const [lx, ly] of [[45, 32], [46, 32], [78, 32], [97, 14], [103, 14], [79, 38], [44, 18], [39, 14]]) try1(lx, ly, F.cone());
  for (const [lx, ly] of [[99, 3], [100, 3], [101, 3], [102, 3], [97, 3]]) try1(lx, ly, F.pallet());
  for (const [lx, ly] of [[99, 5], [101, 5]]) if (fits(F.sheetStack(), lx, ly)) putFlat(F.sheetStack(), lx, ly);
  for (let ly = 3; ly <= 45; ly++) for (let lx = 3; lx <= 103; lx++) {
    if (K(lx, ly) !== PATIO || grass[li(lx, ly)]) continue;
    const t = hv(lx, ly, 21);
    if (t < 0.012) decal(lx, ly, F.hubcap()); else if (t < 0.02) decal(lx, ly, F.oil(Math.floor(hv(lx, ly, 22) * 2)));
  }

  // ---- Lava-Rápido: piso molhado com ralos, rolos de lavagem em pares, um carro na baia, a "piscina" de espuma do Sapão
  for (let ly = 28; ly <= 43; ly += 5) for (const lx of [85, 96]) if (K(lx, ly) === LAVA && !keepNear.has(li(lx, ly))) map.set('ground', ...G(lx, ly), F.drain());
  for (const [lx, ly] of [[82, 27], [89, 27], [82, 42], [89, 42], [82, 33], [89, 33]]) tryTall(F.washRoller(), lx, ly, { baseRows: 2 });
  tryFlat(F.car('limao', 'v'), 85, 42);
  for (let ly = 27; ly <= 44; ly++) for (let lx = 92; lx <= 102; lx++) {
    const d = ((lx - 97) / 5.2) ** 2 + ((ly - 36) / 6.2) ** 2;
    if (d <= 1) decal(lx, ly, F.foam(d < 0.55 ? 3 : 2));
    else if (d < 1.6 && hv(lx, ly, 41) < 0.45) decal(lx, ly, F.foam(Math.floor(hv(lx, ly, 42) * 2)));
  }
  for (let ly = 27; ly <= 44; ly++) for (let lx = 81; lx <= 90; lx++) if (hv(lx, ly, 43) < 0.07) decal(lx, ly, F.foam(Math.floor(hv(lx, ly, 44) * 3)));
  for (const [lx, ly] of [[90, 27], [90, 44], [81, 44], [102, 27], [102, 44], [92, 27]]) E(0, 0, lx, ly);
  light(97, 36, 6, '#7fd4ff', true); light(94, 30, 4, '#7fd4ff'); light(100, 42, 4, '#7fd4ff');
  for (const [lx, ly] of [[85, 29], [85, 40], [86, 35]]) light(lx, ly, 5, '#e8f4ff');

  // ---- Estamparia: prensas nas paredes norte e sul, bobinas esperando, esteiras, pilhas de chapa, pontes rolantes
  for (const lx of [108, 120, 132, 144, 156, 168]) { putFlat(F.press(), lx, 4, 'prensa'); putFlat(F.press(), lx, 41, 'prensa'); light(lx + 1, 7, 3, '#ffd040', true); }
  for (const lx of [112, 113, 124, 125, 136, 137, 148, 149, 160, 161, 172, 173]) for (const ly of [5, 6, 42, 43]) try1(lx, ly, T.coil());
  for (const lx of [106, 174]) for (const ly of [14, 30]) if (fits(F.sheetStack(), lx, ly - 1)) putFlat(F.sheetStack(), lx, ly - 1);
  for (let lx = 112; lx <= 170; lx += 6) for (const ly of [18, 27]) if (hv(lx, ly, 51) < 0.7 && fits(F.sheetStack(), lx, ly)) putFlat(F.sheetStack(), lx, ly);
  for (let lx = 115; lx <= 171; lx += 8) for (const ly of [22, 36]) if (fits(I.column(), lx, ly - 1)) putSheet(I.column(), lx, ly - 1, { what: 'pilar do galpão' });
  for (let lx = 109; lx <= 173; lx += 9) for (const ly of [9, 24, 34]) if (hv(lx, ly, 52) < 0.55) try1(lx, ly, F.pallet());
  for (const ly of [11, 26]) for (let lx = 105; lx <= 176; lx++) map.set('above', ...G(lx, ly), T.crane(lx === 105 ? 'endL' : lx === 176 ? 'endR' : lx === (ly === 11 ? 126 : 150) ? 'trolley' : 'beam'));
  for (let ly = 3; ly <= 45; ly++) for (let lx = 105; lx <= 176; lx++) if (K(lx, ly) === ESTAMP && !B(lx, ly) && hv(lx, ly, 53) < 0.03) decal(lx, ly, F.oil(Math.floor(hv(lx, ly, 54) * 2)));
  const rollerLine = (x0, x1, ly) => { for (let lx = x0; lx <= x1; lx++) if (!free(lx, ly)) return false; for (let lx = x0; lx <= x1; lx++) deco1(lx, ly, T.rollerTable(lx === x0 ? 'l' : lx === x1 ? 'r' : 'm', false)); return true; };
  for (const [x0, x1, ly] of [[113, 120, 23], [137, 144, 23], [159, 166, 23], [121, 126, 19], [145, 152, 19], [113, 118, 34], [125, 132, 34], [150, 157, 37], [161, 166, 38]]) rollerLine(x0, x1, ly);
  for (const [x0, y0] of [[169, 18], [169, 25], [118, 28], [142, 18]]) for (let j = 0; j < 2; j++) for (let i = 0; i < 3; i++) try1(x0 + i, y0 + j, T.coil());
  if (fits(F.guardhouse(), 105, 34)) putFlat(F.guardhouse(), 105, 34, 'sala do encarregado');
  for (const [lx, ly] of [[175, 19], [175, 20], [176, 20], [175, 27], [176, 27], [176, 28], [126, 44], [127, 44], [150, 44], [151, 3], [152, 3]]) try1(lx, ly, T.scrap(Math.floor(hv(lx, ly, 56) * 3)));
  for (const [lx, ly] of [[106, 44], [107, 44], [175, 3], [176, 3], [175, 44], [176, 44], [106, 3]]) E(0, 0, lx, ly);
  for (const lx of [111, 123, 135, 147, 159, 171]) for (const ly of [9, 22, 37]) light(lx, ly, 6, '#e8f4ff');

  // ---- Funilaria e Armação: gabaritos com carrocerias em primer, braços robóticos de solda e as faíscas
  for (const [ly, yArm] of [[48, 49], [56, 57], [64, 65]]) {
    for (let lx = 5, k = 0; lx <= 78; lx += 8, k++) {
      if (!fits(F.primer(), lx, ly)) continue;
      const flip = k & 1, ax = flip ? lx - 2 : lx + 2;
      if (!fits(F.robotArm(!!flip), ax, yArm)) { putFlat(F.primer(), lx, ly, 'gabarito'); continue; }
      putFlat(F.primer(), lx, ly, 'gabarito');
      putFlat(F.robotArm(!!flip), ax, yArm, 'braço robótico');
      light(flip ? ax : ax + 1, yArm + 1, 3, '#ffb050', true);
      const bx = flip ? lx + 2 : lx - 2;
      if (hv(lx, ly, 57) < 0.6 && tryFlat(F.robotArm(!flip), bx, yArm)) light(flip ? bx + 1 : bx, yArm + 1, 3, '#ffb050', true);
    }
  }
  for (const [lx, ly] of [[4, 47], [5, 47], [4, 71], [5, 71], [82, 47], [82, 71], [70, 71], [71, 71], [30, 71], [31, 47]]) E(pick([0, 0, 7]), pick([0, 2]), lx, ly);
  for (const [lx, ly] of [[8, 70], [50, 70], [76, 69], [76, 47], [18, 52], [58, 52], [26, 68], [68, 60], [10, 60], [36, 60], [50, 47], [16, 47]]) if (fits(F.sheetStack(), lx, ly)) putFlat(F.sheetStack(), lx, ly);
  for (let ly = 47; ly <= 71; ly += 4) for (const lx of [3, 83]) if (hv(lx, ly, 58) < 0.5) try1(lx, ly, F.pallet());
  for (let ly = 47; ly <= 71; ly++) for (let lx = 3; lx <= 83; lx++) if (K(lx, ly) === FUNIL && hv(lx, ly, 55) < 0.02) decal(lx, ly, F.oil(0));
  for (const lx of [12, 33, 53, 73]) for (const ly of [51, 59, 68]) light(lx, ly, 6, '#e8f4ff');

  // ---- Cabines de Pintura: cabines de vidro com carros sendo pintados, latas, carrocerias secando, respingos
  for (const [k, x0] of BOOTHS.entries()) {
    putFlat(k === 2 ? F.primer() : F.car('limao', 'v'), x0 + 2, 48, 'carro na cabine');
    light(x0 + 3, 50, 4, '#f2f8ff');
    for (let ly = 47; ly <= 52; ly++) for (let lx = x0 + 1; lx <= x0 + 5; lx++) if (hv(lx, ly, 61) < 0.3) decal(lx, ly, F.splat('limao'));
  }
  for (const [lx, ly] of [[135, 48], [146, 48], [135, 60], [93, 66], [123, 58], [138, 68], [106, 68], [120, 70]]) if (fits(F.car('limao', 'h'), lx, ly)) putFlat(F.car('limao', 'h'), lx, ly);
  for (const [lx, ly] of [[86, 47], [87, 47], [86, 48], [133, 47], [134, 47], [149, 47], [149, 48], [86, 71], [87, 71], [148, 71], [149, 71], [111, 71], [112, 71], [97, 47], [106, 47], [115, 47], [124, 47]]) try1(lx, ly, F.paintCans());
  for (let ly = 47; ly <= 71; ly++) for (let lx = 86; lx <= 149; lx++) if (K(lx, ly) === CABINES && hv(lx, ly, 62) < 0.05) decal(lx, ly, F.splat(F.CAR_COLORS[Math.floor(hv(lx, ly, 63) * 5)]));
  for (const [lx, ly] of [[86, 68], [100, 67], [120, 68], [133, 68], [140, 60], [110, 55]]) if (tryTall(T.silo(), lx, ly, { baseRows: 1, blockAll: true, what: 'tanque de tinta' })) { try1(lx + 3, ly + 2, F.paintCans()); try1(lx - 1, ly + 2, ts.gid('E', 0, 0)); }
  for (const [lx, ly] of [[92, 58], [108, 58], [134, 64], [97, 62], [120, 61], [111, 64], [125, 66], [146, 59], [89, 66]]) if (fits(F.car('limao', 'h'), lx, ly)) putFlat(F.car('limao', 'h'), lx, ly);
  for (let lx = 86; lx <= 149; lx++) map.set('above', ...G(lx, 55), I.pipe(lx === 86 ? 'h1' : lx === 149 ? 'h2' : 'h'));
  for (const lx of [92, 104, 116, 128, 140]) for (const ly of [58, 67]) light(lx, ly, 6, '#e8f4ff');
  light(142, 51, 5, '#e8f4ff');
  // Estufa: grelha quente, portas de forno na parede leste, carros secando, luz de forno
  for (const ly of [58, 67]) putFlat(F.ovenDoor(), 175, ly, 'porta de forno');
  for (const [lx, ly] of [[153, 58], [153, 69], [168, 58], [168, 69], [158, 69]]) if (fits(F.car('limao', 'h'), lx, ly)) putFlat(F.car('limao', 'h'), lx, ly);
  for (const [lx, ly] of [[164, 64], [156, 61], [172, 68], [158, 66]]) light(lx, ly, 6, '#ff7a3c', true);
  light(175, 59, 4, '#ff8a3c', true); light(175, 68, 4, '#ff8a3c', true);

  // ---- Montagem Final: linha de montagem (esteira) com carros, braços nas margens, estoque de peças, Sala de Descanso
  const LINE_CARS = [23, 29, 35, 43, 49, 55, 64, 70, 75, 84, 90];
  for (const lx of LINE_CARS) { let ok = true; for (let j = 0; j < 2; j++) for (let i = 0; i < 3; i++) if (keepNear.has(li(lx + i, 88 + j)) || !B(lx + i, 88 + j)) ok = false; if (ok) putFlat(F.car('limao', 'h'), lx, 88, 'carro na linha'); }
  for (const [k, lx] of LINE_CARS.entries()) {
    const flip = !!(k & 1);
    if (tryFlat(F.robotArm(flip), lx + (flip ? 0 : 1), 86)) light(lx + 1, 87, 3, '#ffb050', true);
    if (k % 2 === 0 && tryFlat(F.robotArm(!flip), lx + 1, 90)) light(lx + 1, 91, 3, '#ffb050', true);
  }
  for (let lx = 22; lx <= 96; lx += 3) tryTall([[ts.gid('E', 10, 7), ts.gid('E', 11, 7)], [ts.gid('E', 10, 8), ts.gid('E', 11, 8)]], lx, 74, { baseRows: 1, blockAll: true });
  for (let lx = 24; lx <= 92; lx += 6) for (const ly of [78, 82]) {
    const t = hv(lx, ly, 71);
    if (t < 0.35) { for (const [i, j] of [[0, 0], [1, 0], [0, 1], [1, 1]]) try1(lx + i, ly + j, F.motor()); }
    else if (t < 0.65) { for (const [i, j] of [[0, 0], [1, 0], [0, 1]]) try1(lx + i, ly + j, F.tireStack()); }
    else if (fits(F.sheetStack(), lx, ly)) putFlat(F.sheetStack(), lx, ly);
  }
  for (let ly = 87; ly <= 96; ly += 3) for (let lx = 4; lx <= 18; lx += 4) { const t = hv(lx, ly, 72); if (t < 0.5) try1(lx, ly, F.tireStack()); else if (t < 0.8) try1(lx, ly, F.pallet()); }
  for (let lx = 23; lx <= 97; lx += 4) { const t = hv(lx, 95, 73); if (t < 0.3) { try1(lx, 95, F.motor()); try1(lx + 1, 95, F.motor()); } else if (t < 0.55) { try1(lx, 95, F.tireStack()); try1(lx, 96, F.tireStack()); } else if (t < 0.8) { if (fits(F.sheetStack(), lx, 96)) putFlat(F.sheetStack(), lx, 96); } else try1(lx, 96, F.pallet()); }
  for (const [lx, ly] of [[3, 86], [3, 96], [99, 96], [99, 74], [21, 96], [60, 96]]) E(0, 0, lx, ly);
  for (const lx of [12, 30, 48, 66, 84]) for (const ly of [79, 93]) light(lx, ly, 6, '#e8f4ff');
  // Sala de Descanso: armários, mesa, bancos, máquina de café, relógio de ponto
  for (let lx = 4; lx <= 8; lx++) tryTall([[ts.gid('E', 2, 7)], [ts.gid('E', 2, 8)]], lx, 74, { baseRows: 1, blockAll: true });
  if (fits(F.coffee(), 17, 74)) putSheet(F.coffee(), 17, 74, { blockAll: true, what: 'máquina de café' });
  if (fits(F.punchClock(), 19, 76)) putSheet(F.punchClock(), 19, 76, { blockAll: true, what: 'relógio de ponto' });
  if (fitsStamp('table', 13, 80, ['E', 2, 10, 3, 1])) stampL('table', 13, 80, ['E', 2, 10, 3, 1, { blockAll: true }]);
  for (const [lx, ly] of [[13, 82], [5, 82]]) if (fits(R.bench(), lx, ly)) putFlat(R.bench(), lx, ly);
  for (const [lx, ly] of [[4, 84], [19, 84]]) tryTall([[ts.gid('E', 0, 7)], [ts.gid('E', 0, 8)]], lx, ly - 1, { baseRows: 1, blockAll: true });
  light(11, 80, 5, '#fff2c0');

  // ---- Pista de Testes: boxes, alavanca e placas, semáforo, pneus e cones fora do oval, holofotes, rampa do subsolo
  putFlat(F.pitBoxes(), 130, 81, 'boxes');
  for (const [lx, ly] of LEVER.plates) map.put('deco', ...G(lx, ly), 'G', 0, 1);
  map.put('deco', ...G(...LEVER.lever), 'G', 3, 3); map.block(...G(...LEVER.lever)); map.reserve(...G(...LEVER.lever));
  if (fits(F.startLight(), 142, 89)) putSheet(F.startLight(), 142, 89, { what: 'semáforo' });
  putFlat(F.rampHouse(), 170, 91, 'prédio da rampa', true); // a boca da rampa é o tile do portal, logo abaixo
  const onTrack = (lx, ly) => { const u = lx - OVAL.cx, v = ly - OVAL.cy; return (u / 35) ** 2 + (v / 11) ** 2 <= 1.04 && (u / 27) ** 2 + (v / 6) ** 2 >= 0.96; };
  for (let ly = 74; ly <= 96; ly++) for (let lx = 101; lx <= 176; lx++) {
    if (onTrack(lx, ly) || K(lx, ly) !== PISTA) continue;
    let nearTrack = false; for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (onTrack(lx + i, ly + j)) nearTrack = true;
    const inner = ((lx - OVAL.cx) / 27) ** 2 + ((ly - OVAL.cy) / 6) ** 2 < 1;
    if (nearTrack && !inner && (lx < 112 || lx > 166) && (lx + ly) % 2 === 0) try1(lx, ly, F.tireStack());
    else if (!nearTrack && !inner && hv(lx, ly, 81) < 0.05) try1(lx, ly, F.cone());
  }
  for (const [lx, ly] of [[147, 88], [148, 88], [128, 84], [128, 85], [149, 84], [128, 88]]) try1(lx, ly, F.tireStack());
  for (const [lx, ly] of [[121, 87], [158, 87], [125, 84], [153, 84]]) try1(lx, ly, F.cone());
  for (const [lx, ly] of [[102, 75], [175, 75], [102, 95], [167, 95], [139, 74], [120, 74], [158, 74]]) light(lx, ly, 6, '#fff2c0');
  for (const lx of [132, 138, 144]) light(lx, 87, 4, '#fff2c0');
  light(171, 94, 4, '#ffe066');

  // ---- subsolo: rampa, Galeria dos Protótipos (protótipos sob lona servem de pilares), Salão com a plataforma giratória
  map.put('deco', ...G(160, 106), 'D', 2, 0);
  putRows(F.turntable(), 76, 121, 'ground');
  for (let ly = 119; ly <= 128; ly += 9) for (let lx = 104; lx <= 166; lx += 8) if (fits(F.tarpCar(), lx, ly)) putFlat(F.tarpCar(), lx, ly);
  for (const lx of [104, 125, 140, 158, 166]) if (fits(F.tarpCar(), lx, 123)) putFlat(F.tarpCar(), lx, 123);
  for (const [lx, ly] of [[155, 108], [165, 108], [155, 112], [165, 112]]) if (fits(F.tarpCar(), lx, ly - 1)) putFlat(F.tarpCar(), lx, ly - 1);
  for (let ly = SURF_H; ly < BH; ly++) for (let lx = 60; lx < BW; lx++) {
    if (!isProto(lx, ly) || map.layers.deco[idx(...G(lx, ly))] || keepNear.has(li(lx, ly)) || map.occ[idx(...G(lx, ly))]) continue;
    if (lx >= 75 && lx <= 81 && ly >= 120 && ly <= 126) continue;
    let open = true; for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (!isProto(lx + i, ly + j)) open = false;
    if (!open) continue;
    const r = rng();
    if (r < 0.02) map.set('deco', ...G(lx, ly), pick(L.S.rubbleGray));
    else if (r < 0.035) map.set('deco', ...G(lx, ly), pick(L.S.crackStone));
    else if (r < 0.045) decal(lx, ly, F.oil(1));
  }
  for (const [lx, ly] of [[69, 111], [75, 111], [81, 111], [87, 111], [69, 131], [75, 131], [81, 131], [87, 131], [63, 117], [63, 126], [92, 115], [92, 130]]) if (fits(F.tarpCar(), lx, ly)) putFlat(F.tarpCar(), lx, ly);
  for (const [lx, ly] of [[66, 112], [67, 112], [90, 133], [91, 133], [65, 133], [92, 112], [140, 119], [141, 119], [120, 130], [156, 130], [101, 125]]) E(pick([0, 7]), pick([0, 2]), lx, ly);
  for (const [lx, ly] of [[66, 114], [91, 114], [66, 131], [91, 131]]) light(lx, ly, 6, '#f2e14a');
  light(78, 123, 5, '#f2e14a', true);
  for (const [lx, ly] of [[106, 124], [126, 121], [146, 129], [166, 124], [160, 110]]) light(lx, ly, 4, '#c8d8ff');
  light(160, 107, 3, '#ffe066');
  // Pista do Crash Test: parede de impacto no lado leste (vão em 111..113 até a porta), pneus nos cantos; troféus
  for (let ly = 106; ly <= 118; ly++) { if (ly >= 111 && ly <= 113) continue; deco1(44, ly, F.impactWall(ly === 106 || ly === 114 ? 'n' : ly === 110 || ly === 118 ? 's' : 'm')); }
  for (const [lx, ly] of [[4, 106], [5, 106], [4, 118], [5, 118], [43, 106], [43, 118], [20, 106], [20, 118], [12, 106], [28, 106], [12, 118], [28, 118], [36, 106], [36, 118]]) try1(lx, ly, F.tireStack());
  for (const [lx, ly] of [[15, 106], [24, 116]]) if (fits(F.primer(), lx, ly)) putFlat(F.primer(), lx, ly, 'carroceria batida');
  for (const [lx, ly] of [[8, 106], [24, 106], [38, 106], [8, 118], [24, 118], [38, 118]]) light(lx, ly, 6, '#fff2c0');
  for (const [, lx, ly] of CHESTS) { map.put('deco', ...G(lx, ly), 'E', 3, 1); map.block(...G(lx, ly)); map.reserve(...G(lx, ly)); }
  putFlat(F.car('limao', 'v'), 53, 113, 'carro do troféu');
  light(53, 110, 5, '#ffe066');

  // ---- luz de cada porta, no tile de dentro
  for (const d of DOORS) light(...d.arrive, 4, '#ffe066');

  // ---- mata da borda: árvores atrás do muro externo
  const treeKinds = ['treePine2', 'treeOlive2', 'treeRound2', 'treePine2'];
  for (let ly = 0; ly < SURF_H; ly += 2) for (let lx = 0; lx < BW; lx += 2) {
    if (K(lx, ly) !== BORDER || K(lx + 1, ly) !== BORDER || K(lx, ly + 1) !== BORDER || K(lx + 1, ly + 1) !== BORDER) continue;
    const [t, c, r, w, h] = S[pick(treeKinds)];
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { if (ts.isEmpty(t, c + i, r + j)) continue; map.set(j === h - 1 ? 'deco' : 'above', ...G(lx + i, ly + j), ts.gid(t, c + i, r + j)); }
  }

  // ================================================================== bolsões: tile andável que o desenho isolou vira obstáculo
  const doorPortals = DOORS.flatMap((d) => [{ at: G(...d.door), to: G(...d.arrive), req: { minLevel: d.minLevel } }, { at: G(...d.exit), to: G(...d.back) }]);
  const portalsNew = [
    { at: OFICINA_PORTAL, to: SHORTCUT_ARRIVAL, req: { minLevel: 10 } },
    { at: SHORTCUT_BACK, to: OFICINA_RETURN },
    ...doorPortals,
    { at: G(...ARENA_DOOR.at), to: G(...ARENA_DOOR.to) },
    { at: G(...TROPHY_EXIT.at), to: G(...TROPHY_EXIT.to) },
  ];
  const newPortals = portalsNew.map((d) => [d.at[0], d.at[1], d.to[0], d.to[1]]);
  const portalMap = new Map(oldPortals.concat(newPortals).map(([x, y, tx, ty]) => [x + ',' + y, [tx, ty]]));
  const npcG = NPCS.map(([id, lx, ly]) => [id, ...G(lx, ly)]);
  const leverG = { lever: G(...LEVER.lever), plates: LEVER.plates.map((p) => G(...p)), dests: LEVER.dests.map((p) => G(...p)), spawns: LEVER.spawns.map((p) => G(...p)), room: [...G(LEVER.room[0], LEVER.room[1]), ...G(LEVER.room[2], LEVER.room[3])] };
  const leverOnly = (lx, ly) => { const k = K(lx, ly); return k === ARENA || k === TROFEUS || (lx === ARENA_DOOR.at[0] && ly === ARENA_DOOR.at[1]) || (lx === TROPHY_EXIT.at[0] && ly === TROPHY_EXIT.at[1]); };
  for (const [, x, y] of npcG) map.block(x, y);
  let pockets = 0;
  {
    const reachIn = bfs(map, ...PORTARIA_ARRIVAL, portalMap);
    for (let y = Y0; y < Y0 + BH; y++) for (let x = X0; x < X0 + BW; x++) if (!map.layers.collision[idx(x, y)] && !reachIn[idx(x, y)]) {
      if (keep.has(li(x - X0, y - Y0)) || leverOnly(x - X0, y - Y0)) continue; // validação abaixo acusa
      map.block(x, y); pockets++;
    }
  }
  for (const [, x, y] of npcG) map.block(x, y, false);

  // ================================================================== OBJETOS (depois de todos os antigos)
  const outsideG = OUTSIDE_NPCS.map(([id, x, y]) => [id, x, y]);
  for (const [id, x, y] of npcG.concat(outsideG)) map.tileObj('npc', x, y, { npcId: id }, id);
  for (const d of portalsNew) map.tileObj('portal', d.at[0], d.at[1], { toX: d.to[0], toY: d.to[1], ...(d.req ?? {}) }, d.req ? 'quest_door' : 'portal');
  for (const [name, x, y, w, h, pz, faixa, music] of ZONES) map.addObject({ type: 'zone', name, x: x * 16, y: y * 16, width: w * 16, height: h * 16, rect: true, props: { music, pz, ...(faixa ? { faixa } : {}), regiao: 'Montadora' } });
  const SPAWNS = SPAWNS_L.map(([m, count, radius, level, lx, ly]) => [m, count, radius, level, ...G(lx, ly)]);
  for (const [m, count, radius, level, x, y] of SPAWNS) map.tileObj('monster_spawn', x, y, { monster: m, count, radius, level }, m);
  const pts = (a) => a.map((p) => p.join(',')).join(';');
  map.tileObj('quest_lever', ...leverG.lever, { leverId: 'crash_test', plates: pts(leverG.plates), dests: pts(leverG.dests), room: leverG.room.join(','), spawns: pts(leverG.spawns) }, 'crash_test');
  for (const [id, lx, ly] of CHESTS) map.tileObj('quest_chest', ...G(lx, ly), { chestId: id }, id);
  for (const [x, y, radius, color, flicker] of lights) map.tileObj('light', x, y, { radius, color, flicker }, 'light');

  // ================================================================== VALIDAÇÃO (falha alto)
  const walkable = (x, y) => !map.blocked(x, y);
  const kindAt = (x, y) => K(x - X0, y - Y0);
  const sectorAt = (x, y) => SECTOR[kindAt(x, y)];
  // 1. vazio entre a Siderúrgica e a região; nada andável fora do bloco nas linhas novas
  let firstRow = -1;
  for (let y = OLD_H; y < H && firstRow < 0; y++) for (let x = 0; x < W; x++) if (walkable(x, y)) { firstRow = y; break; }
  if (firstRow - 1 - lastRow < 26) fail(`vazio de ${firstRow - 1 - lastRow} linhas entre y ${lastRow} e y ${firstRow} (mínimo 26)`);
  for (let y = OLD_H; y < H; y++) for (let x = 0; x < W; x++) {
    if (!walkable(x, y)) continue;
    if (y < Y0 + 3 || y > Y0 + BH - 3) fail(`tile andável fora das linhas do bloco em ${x},${y}`);
    if (x < X0 + 3 || x > X0 + BW - 4) fail(`tile andável fora do bloco em ${x},${y}`);
  }
  // 2. nada do bloco encosta nas linhas antigas; mapa antigo intacto (camadas de y < OLD_H e objetos antigos)
  for (const k of Object.keys(map.layers)) for (let i = 0; i < W * OLD_H; i++) if (map.layers[k][i] !== old.layers[k][i]) fail(`camada ${k} mudou no mapa antigo em ${i % W},${Math.floor(i / W)}`);
  for (let i = 0; i < nOldObjects; i++) if (JSON.stringify(map.objects[i]) !== JSON.stringify(old.objects[i])) fail(`objeto antigo #${i} mudou`);
  // zonas da região (menor área vence, como daynight.zoneAt e o índice do mundo)
  const zoneRects = ZONES.map(([name, x, y, w, h, pz, faixa]) => ({ name, x0: x, y0: y, x1: x + w - 1, y1: y + h - 1, pz, faixa }));
  const zoneAt = (x, y) => { let best = null; for (const z of zoneRects) if (x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1 && (!best || (z.x1 - z.x0 + 1) * (z.y1 - z.y0 + 1) < (best.x1 - best.x0 + 1) * (best.y1 - best.y0 + 1))) best = z; return best; };
  const zoneObjs = map.objects.slice(nOldObjects).filter((o) => o.type === 'zone');
  if (zoneObjs.length !== ZONES.length) fail(`esperadas ${ZONES.length} zonas, há ${zoneObjs.length}`);
  for (const o of zoneObjs) {
    for (const p of ['music', 'pz', 'regiao']) if (prop(o, p) === undefined) fail(`zona ${o.name} sem ${p}`);
    if (prop(o, 'pz') === false && !NO_FAIXA.has(o.name) && !/^\d+-\d+$/.test(prop(o, 'faixa') ?? '')) fail(`zona ${o.name} sem faixa`);
  }
  for (let y = Y0; y < Y0 + BH; y++) for (let x = X0; x < X0 + BW; x++) if (walkable(x, y) && !zoneAt(x, y)) fail(`tile andável ${x},${y} fora das zonas da região`);
  const pz = zoneRects.filter((z) => z.pz);
  const inPz = (x, y) => pz.some((z) => x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1);
  const distRect = (z, x, y) => Math.max(z.x0 - x, 0, x - z.x1, z.y0 - y, 0, y - z.y1);
  // 7. portas: minLevel crescente, saída sem requisito perto, vãos e destinos andáveis, destino não é portal
  const chain = [25, 40, 60, 80, 90, 110];
  for (const [i, d] of DOORS.entries()) {
    if (d.minLevel !== chain[i]) fail(`porta ${d.id}: minLevel ${d.minLevel} fora da cadeia ${chain}`);
    const [door, arrive, exit, back] = [d.door, d.arrive, d.exit, d.back].map((p) => G(...p));
    for (const [nm, p] of [['porta', door], ['chegada', arrive], ['saída', exit], ['volta', back]]) if (!walkable(...p)) fail(`porta ${d.id}: ${nm} ${p} bloqueada`);
    if (GROUP[sectorAt(...back)] !== GROUP[d.from] || GROUP[sectorAt(...arrive)] !== GROUP[d.to]) fail(`porta ${d.id}: volta/chegada fora dos setores ${d.from}/${d.to}`);
    const touches = (p, sec) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => GROUP[sectorAt(p[0] + a, p[1] + b)] === GROUP[sec] && walkable(p[0] + a, p[1] + b));
    if (!touches(door, d.from)) fail(`porta ${d.id}: o vão ${door} não encosta no setor ${d.from}`);
    if (!touches(exit, d.to)) fail(`porta ${d.id}: a saída ${exit} não encosta no setor ${d.to}`);
    if (cheb(...door, ...exit) > DOOR_EXIT_MAX && cheb(...arrive, ...exit) > 6) fail(`porta ${d.id}: saída ${exit} longe da porta ${door} e da chegada ${arrive}`);
    if (portalMap.has(arrive.join()) || portalMap.has(back.join())) fail(`porta ${d.id}: destino é portal`);
    for (const t of d.twins ?? []) if (walkable(...G(...t))) fail(`porta ${d.id}: barreira ${G(...t)} andável`);
    const pd = map.objects.find((o) => o.type === 'portal' && o.x === door[0] * 16 && o.y === door[1] * 16);
    const pe = map.objects.find((o) => o.type === 'portal' && o.x === exit[0] * 16 && o.y === exit[1] * 16);
    if (prop(pd, 'minLevel') !== d.minLevel) fail(`porta ${d.id} sem minLevel ${d.minLevel}`);
    if (prop(pe, 'minLevel') !== undefined || prop(pe, 'quest') !== undefined) fail(`saída da porta ${d.id} tem requisito`);
  }
  for (const [x, y, tx, ty] of newPortals) {
    if (!walkable(x, y)) fail(`portal ${x},${y} bloqueado`);
    if (!walkable(tx, ty)) fail(`destino de portal ${tx},${ty} bloqueado`);
    if (portalMap.has(tx + ',' + ty)) fail(`destino de portal ${tx},${ty} é ele mesmo um portal`);
  }
  // 6. atalho da Oficina: recanto andável, sem objeto, que não é portal nem destino antigo; volta vizinha
  {
    const [dx, dy] = OFICINA_PORTAL, [rx, ry] = OFICINA_RETURN;
    if (old.layers.collision[idx(dx, dy)] !== 0) fail('recanto da Oficina bloqueado no mapa antigo');
    if (old.objects.some((o) => o.point && Math.floor(o.x / 16) === dx && Math.floor(o.y / 16) === dy)) fail('recanto da Oficina tem objeto antigo em cima');
    if (oldPortals.some(([px, py, tx, ty]) => (px === dx && py === dy) || (tx === dx && ty === dy))) fail('recanto da Oficina é portal antigo ou destino de um');
    if (old.layers.collision[idx(rx, ry)] !== 0 || portalMap.has(`${rx},${ry}`) || cheb(dx, dy, rx, ry) !== 1) fail('volta na Oficina precisa ser andável, não portal e vizinha do recanto');
  }
  // 5. chegadas: andáveis, não são portal, a 2+ de NPC, dentro da PZ da Portaria
  for (const [nm, p] of [['chegada da Portaria', PORTARIA_ARRIVAL], ['chegada do atalho', SHORTCUT_ARRIVAL]]) {
    if (!walkable(...p) || portalMap.has(p.join())) fail(`${nm} ${p} bloqueada ou em portal`);
    if (npcG.some(([, x, y]) => cheb(x, y, ...p) < 2)) fail(`${nm} colada num NPC`);
    if (zoneAt(...p)?.name !== 'Portaria da Montadora') fail(`${nm} fora da PZ da Portaria`);
  }
  // 4. NPCs: andáveis, >= 2 entre si, fora de portal/destino/chegada; os das PZ dentro delas
  const portalOrTarget = new Set(newPortals.flatMap(([x, y, tx, ty]) => [`${x},${y}`, `${tx},${ty}`]));
  for (const [id, x, y] of npcG) {
    if (!walkable(x, y)) fail(`npc ${id} em ${x},${y} bloqueado`);
    if (portalOrTarget.has(`${x},${y}`) || leverG.plates.some(([a, b]) => a === x && b === y)) fail(`npc ${id} em portal, destino ou placa`);
    if (zoneAt(x, y)?.name === 'Montadora') fail(`npc ${id} fora dos setores`);
  }
  for (const [zone, ids] of Object.entries(PZ_NPCS)) for (const id of ids) { const n = npcG.find((q) => q[0] === id); if (zoneAt(n[1], n[2])?.name !== zone) fail(`npc ${id} fora da ${zone}`); }
  for (let i = 0; i < npcG.length; i++) for (let j = i + 1; j < npcG.length; j++) if (cheb(npcG[i][1], npcG[i][2], npcG[j][1], npcG[j][2]) < 2) fail(`npcs ${npcG[i][0]} e ${npcG[j][0]} a menos de 2 tiles`);
  // 8. spawns: zona e faixa, raio dentro da zona, folgas de PZ/NPC/portal/alavanca, espaço, chefes
  const avoid = [...newPortals.flatMap(([x, y, tx, ty]) => [[x, y], [tx, ty]]).filter(([, y]) => y >= Y0), PORTARIA_ARRIVAL, SHORTCUT_ARRIVAL];
  for (const [m, count, radius, level, x, y] of SPAWNS) {
    if (!walkable(x, y)) fail(`spawn ${m} em ${x},${y} bloqueado`);
    const z = zoneAt(x, y), sec = sectorAt(x, y);
    if (!z || z.pz || !z.faixa) fail(`spawn ${m} em ${x},${y} fora de setor de caça`);
    for (let j = -radius; j <= radius; j++) for (let i = -radius; i <= radius; i++) if (zoneAt(x + i, y + j)?.name !== z.name) fail(`spawn ${m} em ${x},${y}: raio ${radius} sai da zona ${z.name}`);
    const [lo, hi] = SECTOR_BAND[sec] ?? fail(`spawn ${m} em ${x},${y} no setor ${sec} sem faixa`);
    const [zlo, zhi] = z.faixa.split('-').map(Number);
    if (lo !== zlo || hi !== zhi) fail(`faixa do setor ${sec} (${lo}-${hi}) diferente da zona ${z.name} (${z.faixa})`);
    if (!BOSSES.includes(m) && (level < lo || level > hi)) fail(`spawn ${m} lv ${level} fora da faixa ${lo}-${hi} de ${sec}`);
    for (const p of pz) if (distRect(p, x, y) < radius + 6) fail(`spawn ${m} em ${x},${y} a ${distRect(p, x, y)} da PZ ${p.name}`);
    for (const [id, nx, ny] of npcG) if (cheb(nx, ny, x, y) < 8) fail(`spawn ${m} em ${x},${y} perto demais do npc ${id}`); // §2.6: centro a 8+ de NPC
    for (const [px, py] of avoid) if (cheb(px, py, x, y) < 7 + radius) fail(`spawn ${m} em ${x},${y} perto do portal/chegada ${px},${py}`);
    for (const p of [leverG.lever, ...leverG.plates]) if (cheb(...p, x, y) < 10) fail(`spawn ${m} em ${x},${y} perto da alavanca/placa ${p}`);
    let room = 0; for (let j = -radius; j <= radius; j++) for (let i = -radius; i <= radius; i++) if (walkable(x + i, y + j)) room++;
    if (room < count * 3) fail(`spawn ${m} em ${x},${y} sem espaço (${room} tiles para ${count})`);
  }
  for (const boss of BOSSES) {
    const list = SPAWNS.filter((s) => s[0] === boss);
    if (list.length !== 1) fail(`chefe ${boss} com ${list.length} spawns (esperado 1)`);
    for (const s of SPAWNS) if (s !== list[0] && cheb(s[4], s[5], list[0][4], list[0][5]) < 11) fail(`spawn ${s[0]} a menos de 11 do chefe ${boss}`);
  }
  // monstro não vaza: BFS sem portais e sem PZ a partir de cada spawn fica no grupo de setores dele
  const portalTiles = new Set(portalMap.keys());
  const sealBfs = (sx, sy, pzBlocked) => {
    const seen = new Uint8Array(W * H), q = [[sx, sy]]; seen[idx(sx, sy)] = 1;
    while (q.length) {
      const [x, y] = q.pop();
      for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + a, ny = y + b;
        if (!map.inb(nx, ny) || seen[idx(nx, ny)] || map.blocked(nx, ny) || portalTiles.has(nx + ',' + ny) || (pzBlocked && inPz(nx, ny))) continue;
        seen[idx(nx, ny)] = 1; q.push([nx, ny]);
      }
    }
    return seen;
  };
  for (const [m, , , , x, y] of SPAWNS) {
    const g = GROUP[sectorAt(x, y)], r = sealBfs(x, y, true);
    for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) if (r[idx(xx, yy)] && GROUP[sectorAt(xx, yy)] !== g) fail(`spawn ${m} em ${x},${y} vaza para ${sectorAt(xx, yy) ?? 'fora'} em ${xx},${yy}`);
  }
  // 3. tudo alcançável do templo (com portais), com NPCs e placas virados obstáculo; Crash Test e troféus só pela alavanca
  const reach = bfs(map, spawnTile[0], spawnTile[1], portalMap);
  for (const [id, x, y] of npcG) if (!reach[idx(x, y)]) fail(`npc ${id} em ${x},${y} inalcançável`);
  for (const [m, , , , x, y] of SPAWNS) if (!reach[idx(x, y)]) fail(`spawn ${m} em ${x},${y} inalcançável`);
  for (const [nm, p] of [['chegada da Portaria', PORTARIA_ARRIVAL], ['chegada do atalho', SHORTCUT_ARRIVAL]]) if (!reach[idx(...p)]) fail(`${nm} inalcançável`);
  const countIn = (r) => { let n = 0; for (let y = Y0; y < Y0 + BH; y++) for (let x = X0; x < X0 + BW; x++) if (r[idx(x, y)] && walkable(x, y)) n++; return n; };
  const before = countIn(reach);
  for (const [, x, y] of npcG) map.block(x, y);
  const reachNpc = bfs(map, spawnTile[0], spawnTile[1], portalMap);
  let walk = 0, leverTiles = 0;
  const lost = [];
  for (let y = Y0; y < Y0 + BH; y++) for (let x = X0; x < X0 + BW; x++) {
    if (!walkable(x, y)) continue;
    if (leverOnly(x - X0, y - Y0)) { leverTiles++; if (reachNpc[idx(x, y)]) fail(`Crash Test/troféus alcançável a pé em ${x},${y}`); continue; }
    walk++; if (!reachNpc[idx(x, y)]) lost.push(`${x},${y}`);
  }
  if (lost.length) fail(`${lost.length} tiles andáveis da região inalcançáveis com os NPCs como obstáculo: ${lost.slice(0, 12).join(' ')}`);
  if (countIn(reachNpc) !== before - npcG.length) fail(`NPCs como obstáculo fecham ${before - npcG.length - countIn(reachNpc)} tile(s)`);
  // setores selados (para quem anda): BFS sem portais de cada chegada visita o grupo inteiro e só ele
  const perGroup = {};
  for (let y = Y0; y < Y0 + BH; y++) for (let x = X0; x < X0 + BW; x++) if (walkable(x, y) && !portalTiles.has(x + ',' + y)) { const s = sectorAt(x, y); if (!s) fail(`tile andável ${x},${y} sem setor`); perGroup[GROUP[s]] = (perGroup[GROUP[s]] ?? 0) + 1; }
  const entries = { entrada: PORTARIA_ARRIVAL, ...Object.fromEntries(DOORS.map((d) => [GROUP[d.to], G(...d.arrive)])), arena: leverG.dests[0], trofeus: G(...ARENA_DOOR.to) };
  for (const [grp, p] of Object.entries(entries)) {
    const r = sealBfs(p[0], p[1], false);
    let n = 0;
    for (let y = Y0; y < Y0 + BH; y++) for (let x = X0; x < X0 + BW; x++) {
      if (!r[idx(x, y)] || portalTiles.has(x + ',' + y)) continue;
      if (GROUP[sectorAt(x, y)] !== grp) fail(`grupo ${grp} vaza para ${sectorAt(x, y) ?? 'fora'} em ${x},${y}`);
      n++;
    }
    for (let y = 0; y < Y0; y++) for (let x = 0; x < W; x++) if (r[idx(x, y)]) fail(`grupo ${grp} vaza para o mapa antigo em ${x},${y}`);
    if (n !== perGroup[grp]) fail(`grupo ${grp}: a chegada alcança ${n} de ${perGroup[grp]} tiles sem portal`);
  }
  for (const [, x, y] of npcG) map.block(x, y, false);
  // 9. alavanca: placas andáveis e alcançáveis fora da sala, alavanca bloqueada ao lado de uma placa, destinos e monstros
  // dentro da sala, baús bloqueados com vizinho andável alcançável a partir da chegada dos troféus
  {
    const [rx0, ry0, rx1, ry1] = leverG.room, inRoom = (x, y) => x >= rx0 && x <= rx1 && y >= ry0 && y <= ry1;
    for (const [x, y] of leverG.plates) if (!walkable(x, y) || !reach[idx(x, y)] || inRoom(x, y)) fail(`placa ${x},${y} bloqueada, inalcançável ou dentro da sala`);
    if (walkable(...leverG.lever) || !leverG.plates.some(([x, y]) => cheb(x, y, ...leverG.lever) <= 1)) fail('alavanca andável ou sem placa ao lado');
    const fromDest = bfs(map, ...leverG.dests[0], portalMap);
    for (const [x, y] of leverG.dests.concat(leverG.spawns)) if (!walkable(x, y) || !inRoom(x, y) || !fromDest[idx(x, y)]) fail(`alavanca: ${x},${y} fora da sala ou bloqueado`);
    const fromTrophy = bfs(map, ...G(...ARENA_DOOR.to), portalMap);
    if (!fromDest[idx(...G(...ARENA_DOOR.to))]) fail('a porta do Crash Test não leva aos troféus');
    const nb8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (const [id, lx, ly] of CHESTS) {
      const [x, y] = G(lx, ly);
      if (walkable(x, y)) fail(`baú ${id} em ${x},${y} andável`);
      if (!nb8.some(([a, b]) => walkable(x + a, y + b) && fromTrophy[idx(x + a, y + b)] && kindAt(x + a, y + b) === TROFEUS)) fail(`baú ${id} em ${x},${y} sem vizinho alcançável`);
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (fromDest[idx(x, y)] && !reach[idx(x, y)] && !leverOnly(x - X0, y - Y0)) fail(`Crash Test vaza para ${x},${y}`);
  }
  // 4b. NPCs de fora do bloco: andáveis no mapa antigo, sem objeto, na PZ certa, longe de spawn e sem fechar bolsão
  {
    const oldZones = old.objects.filter((o) => o.type === 'zone');
    const inZone = (name, x, y) => oldZones.some((z) => z.name === name && prop(z, 'pz') === true && x * 16 >= z.x && x * 16 < z.x + z.width && y * 16 >= z.y && y * 16 < z.y + z.height)
      || (name === 'Vila de Pedra Clara' && oldZones.some((z) => z.name === name && x * 16 >= z.x && x * 16 < z.x + z.width && y * 16 >= z.y && y * 16 < z.y + z.height));
    const pointAt = new Set(old.objects.filter((o) => o.point || o.type === 'npc' || o.type === 'portal').map((o) => `${Math.floor(o.x / 16)},${Math.floor(o.y / 16)}`));
    const npcOld = old.objects.filter((o) => o.type === 'npc').map((o) => [o.x / 16, o.y / 16]);
    const spawnOld = old.objects.filter((o) => o.type === 'monster_spawn').map((o) => [o.x / 16, o.y / 16, prop(o, 'radius') ?? 0]);
    const targets = new Set(oldPortals.map(([, , tx, ty]) => `${tx},${ty}`));
    const r0 = bfs(map, spawnTile[0], spawnTile[1], portalMap);
    let n0 = 0; for (let i = 0; i < r0.length; i++) n0 += r0[i];
    for (const [id, x, y, zone] of OUTSIDE_NPCS) {
      if (old.layers.collision[idx(x, y)] !== 0) fail(`npc ${id} em ${x},${y} bloqueado no mapa antigo`);
      if (pointAt.has(`${x},${y}`) || targets.has(`${x},${y}`)) fail(`npc ${id} em ${x},${y} em cima de outro objeto ou destino de portal`);
      if (!inZone(zone, x, y)) fail(`npc ${id} em ${x},${y} fora de ${zone}`);
      if (npcOld.some(([a, b]) => cheb(a, b, x, y) < 2)) fail(`npc ${id} a menos de 2 tiles de outro NPC`);
      if (spawnOld.some(([a, b, r]) => cheb(a, b, x, y) - r < 8)) fail(`npc ${id} perto demais de um spawn`);
      if (x === spawnTile[0] && y === spawnTile[1]) fail(`npc ${id} no tile de nascimento`);
      map.block(x, y);
      const r = bfs(map, spawnTile[0], spawnTile[1], portalMap);
      map.block(x, y, false);
      let n = 0; for (let i = 0; i < r.length; i++) n += r[i];
      if (n !== n0 - 1) fail(`npc ${id} em ${x},${y} fecha ${n0 - 1 - n} tile(s) do mapa`);
    }
  }
  // 10. atlas e resumo
  const newTiles = L.set.used - N0;
  const monsters = SPAWNS.reduce((s, x) => s + x[1], 0);
  console.log(`expansion7: ${W}x${H}, bloco ${BW}x${BH} em ${X0},${Y0}; vazio ${firstRow - 1 - lastRow} linhas (y ${lastRow + 1}..${firstRow - 1}); ${npcG.length + OUTSIDE_NPCS.length} npcs, ${newPortals.length} portais, ${SPAWNS.length} spawns (${monsters} monstros), ${lights.length} luzes, ${map.objects.length - nOldObjects} objetos novos; tiles Lemon ${N0} → ${L.set.used} (+${newTiles}); ${walk}/${walk} tiles andáveis alcançáveis + ${leverTiles} só pela alavanca (${pockets} bolsões fechados)`);
  // ~360 dos tiles novos são o zebrado da pista, desenhado por pixel ao longo das duas elipses (cada tile da curva é único)
  if (newTiles < 400 || newTiles > 800) console.warn(`expansion7: AVISO — ${newTiles} tiles Lemon novos (esperado ~550–700)`);
  return { map, reach, portalMap };
}

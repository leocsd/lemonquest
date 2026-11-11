// Stamp catalog: [tilesetShort, col, row, w, h, opts]. Coordinates are tile indices in the tileset PNG.
// Short names: F Floor, W Water, N Nature, H House, R Relief, D ReliefDetail, O Hole, FD FloorDetail, V VillageAbandoned, G Dungeon, E Element, I InteriorFloor
export const S = {
  // ---- trees (Nature). baseRows = bottom rows that block + draw below actors; the rest is canopy ("above")
  treeOlive2: ['N', 0, 0, 2, 2], treePine2: ['N', 2, 0, 2, 2], treeDead2: ['N', 4, 0, 2, 2], treeRoot2: ['N', 6, 0, 2, 2],
  treeSwamp2: ['N', 18, 0, 2, 2], treeOliveB2: ['N', 16, 0, 2, 2], treeRound2: ['N', 6, 8, 2, 2],
  treeOlive4: ['N', 4, 2, 4, 3], treePine4: ['N', 0, 2, 4, 3], treeDead4: ['N', 0, 5, 4, 3], treeSwamp4: ['N', 20, 2, 4, 3], treeOliveB4: ['N', 16, 2, 4, 3],
  treeBig3Olive: ['N', 3, 18, 3, 3],
  stumpDark: ['N', 0, 8, 2, 2, { baseRows: 2 }], stumpOrange: ['N', 2, 8, 2, 2, { baseRows: 2 }],
  // ---- rocks (Nature)
  rockBrown4: ['N', 12, 5, 4, 3], rockGray4: ['N', 16, 5, 4, 3],
  boulderBrown: ['N', 13, 8, 2, 2, { baseRows: 2 }], boulderGray: ['N', 16, 8, 2, 2, { baseRows: 2 }],
  rockBrownA: ['N', 15, 10, 2, 2, { baseRows: 2 }], rockBrownB: ['N', 15, 12, 2, 2, { baseRows: 2 }],
  rockGrayA: ['N', 15, 14, 2, 2, { baseRows: 2 }], rockGrayB: ['N', 15, 16, 2, 2, { baseRows: 2 }],
  rockGrayWide: ['N', 17, 14, 4, 3, { baseRows: 2 }], rockGrayTall: ['N', 21, 14, 2, 3, { baseRows: 2 }],
  rockSmallGray: ['N', 18, 9, 1, 1, { baseRows: 1 }], rockSmallBrown: ['N', 15, 9, 1, 1, { baseRows: 1 }],
  boulderTeal: ['N', 0, 12, 2, 2, { baseRows: 2 }],
  // ---- buildings (House): doors = [[dx,dy]] walkable cells. roof rows go to "above"
  houseOrange: ['H', 0, 0, 4, 3, { doors: [[1, 2]], blockAll: true }],
  houseBeige: ['H', 4, 0, 4, 3, { doors: [[1, 2]], blockAll: true }],
  houseOrange2: ['H', 8, 0, 4, 3, { doors: [[1, 2]], blockAll: true }],
  houseRed: ['H', 12, 0, 4, 3, { doors: [[1, 2]], blockAll: true }],
  shopBlue: ['H', 16, 0, 3, 3, { doors: [[1, 2]], blockAll: true }],
  inn: ['H', 19, 0, 3, 3, { doors: [[2, 2]], blockAll: true }],
  yurt: ['H', 23, 0, 3, 3, { doors: [[1, 2]], blockAll: true }],
  peach: ['H', 26, 0, 3, 3, { doors: [[1, 2]], blockAll: true }],
  torii: ['H', 1, 5, 3, 2],
  statue: ['H', 5, 15, 2, 2],
  statueB: ['H', 3, 15, 2, 2],
  sandPillar: ['H', 0, 15, 1, 3, { baseRows: 1 }],
  statueC: ['H', 5, 17, 2, 2], statueD: ['H', 3, 17, 2, 2],
  // ---- colosseum (Desert): gatehouse tower 3x6, crenellated wall 3x3, lion statues 2x3
  desertTower: ['T', 14, 4, 3, 6, { blockAll: true }], lionA: ['T', 0, 6, 2, 3], lionB: ['T', 0, 9, 2, 3],
  // ---- props (Element)
  lamp: ['E', 6, 3, 1, 2], well: ['E', 6, 1, 1, 1], board: ['E', 1, 2, 1, 1], chest: ['E', 3, 1, 1, 1], barrel: ['E', 0, 0, 1, 1],
  graveCross: ['E', 3, 2, 1, 1], graveA: ['E', 4, 2, 1, 1], graveB: ['E', 5, 2, 1, 1],
  // ---- ruins (VillageAbandoned)
  ruinHouse: ['V', 0, 0, 4, 3, { baseRows: 3 }], ruinHouse2: ['V', 4, 0, 4, 3, { baseRows: 3 }], ruinWall: ['V', 8, 0, 3, 3, { baseRows: 3 }],
  ruinStatue: ['V', 0, 3, 3, 3, { baseRows: 2 }], pillar: ['V', 2, 3, 1, 3, { baseRows: 1 }],
  // ---- caves
  caveMouthGray: ['D', 0, 7, 3, 3, { baseRows: 3, doors: [[1, 2]] }],
  caveMouthBrown: ['D', 3, 7, 3, 3, { baseRows: 3, doors: [[1, 2]] }],
  crystalA: ['N', 0, 15, 1, 1], crystalB: ['N', 1, 15, 1, 1], crystalC: ['N', 2, 15, 1, 1], crystalD: ['N', 3, 15, 1, 1],
  crystalBigA: ['N', 0, 16, 1, 1], crystalBigB: ['N', 1, 16, 1, 1], crystalBigC: ['N', 2, 16, 1, 1], crystalBigD: ['N', 3, 16, 1, 1],
};

// ---- Lemon polish (swamp / ruins dressing): mossy VillageAbandoned huts, grey mossy statues, fallen logs.
Object.assign(S, {
  swampHutA: ['V', 11, 0, 3, 3, { baseRows: 3 }], swampHutB: ['V', 11, 3, 3, 3, { baseRows: 3 }],
  swampHutBig: ['V', 12, 6, 4, 5, { baseRows: 5 }], swampHutBig2: ['V', 16, 5, 4, 6, { baseRows: 6 }],
  frogStatue: ['V', 9, 5, 2, 2, { baseRows: 2 }], stumpBig: ['V', 7, 8, 2, 3, { baseRows: 2 }],
  logV1: ['N', 12, 14, 1, 2, { baseRows: 2 }], logV2: ['N', 13, 14, 1, 2, { baseRows: 2 }], logV3: ['V', 6, 6, 1, 2, { baseRows: 2 }],
  stumpMoss: ['V', 6, 7, 2, 1, { baseRows: 1 }],
  statueG1: ['H', 3, 19, 2, 2], statueG2: ['H', 5, 19, 2, 2], statueG3: ['H', 3, 21, 2, 2], idolG: ['H', 1, 19, 3, 3], pillarG: ['H', 0, 19, 1, 3, { baseRows: 1 }],
  ruinWallB: ['V', 6, 0, 5, 3, { baseRows: 3 }], brokenFence: ['V', 9, 9, 3, 2, { baseRows: 1 }],
  bushA: ['N', 0, 10, 1, 1, { baseRows: 1, collide: false }],
});

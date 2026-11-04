'use strict';

// Ember Quest does not exist. Its maps, tiles and numbers were invented for the
// course, so the demo can run and be published without anyone else's material.

const PALETTES = {
  ember: { grass: [76, 154, 74], speck: [58, 128, 62], leaf: [34, 94, 52], stone: [122, 124, 138], mortar: [84, 86, 100], floor: [74, 62, 62], floorLine: [58, 48, 50] },
  star: { grass: [92, 92, 150], speck: [76, 76, 130], leaf: [52, 44, 102], stone: [150, 130, 160], mortar: [104, 88, 118], floor: [60, 60, 88], floorLine: [46, 46, 72] },
};

function makeTile(kind, pal) {
  const px = Array.from({ length: 16 }, () => Array(16).fill(pal.grass));
  const set = (x, y, c) => { if (x >= 0 && y >= 0 && x < 16 && y < 16) px[y][x] = c; };
  const fill = (x0, y0, x1, y1, c) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, c); };
  const specks = c => { for (const [x, y] of [[2, 3], [9, 1], [13, 6], [5, 9], [11, 12], [3, 14]]) set(x, y, c); };
  const bricks = () => {
    fill(0, 0, 15, 15, pal.stone);
    for (const y of [3, 7, 11, 15]) fill(0, y, 15, y, pal.mortar);
    for (const [y0, xs] of [[0, [7]], [4, [3, 11]], [8, [7]], [12, [3, 11]]]) for (const x of xs) fill(x, y0, x, y0 + 2, pal.mortar);
  };
  const floor = () => {
    fill(0, 0, 15, 15, pal.floor);
    fill(0, 7, 15, 7, pal.floorLine);
    fill(7, 0, 7, 6, pal.floorLine);
    fill(11, 8, 11, 15, pal.floorLine);
  };
  const chest = () => {
    fill(3, 5, 12, 12, [128, 76, 36]);
    fill(3, 5, 12, 6, [168, 104, 48]);
    fill(3, 8, 12, 8, [226, 186, 70]);
    fill(7, 7, 8, 10, [240, 214, 110]);
  };
  switch (kind) {
    case 'grass': specks(pal.speck); break;
    case 'path': fill(0, 0, 15, 15, [201, 162, 107]); for (const [x, y] of [[3, 4], [11, 2], [7, 9], [13, 12], [2, 13]]) set(x, y, [173, 134, 84]); break;
    case 'tree': specks(pal.speck); fill(7, 11, 8, 15, [106, 70, 40]); fill(3, 2, 12, 10, pal.leaf); fill(5, 0, 10, 12, pal.leaf); fill(5, 3, 7, 5, [62, 138, 76]); break;
    case 'water': fill(0, 0, 15, 15, [52, 104, 188]); fill(2, 4, 7, 4, [120, 170, 232]); fill(9, 10, 14, 10, [120, 170, 232]); break;
    case 'roof': fill(0, 0, 15, 15, [158, 62, 52]); for (const y of [3, 7, 11, 15]) fill(0, y, 15, y, [118, 44, 40]); break;
    case 'shop': fill(0, 0, 15, 15, [214, 190, 150]); fill(4, 6, 11, 15, [106, 70, 40]); fill(10, 10, 10, 11, [240, 214, 110]); fill(3, 1, 12, 4, [40, 40, 56]); fill(5, 2, 10, 3, [226, 226, 236]); break;
    case 'cave': specks(pal.speck); fill(2, 3, 13, 15, pal.mortar); fill(4, 6, 11, 15, [14, 12, 18]); break;
    case 'wall': bricks(); break;
    case 'floor': floor(); break;
    case 'exit': floor(); fill(3, 9, 12, 15, [230, 222, 170]); fill(5, 11, 10, 15, [120, 196, 120]); break;
    case 'chest': specks(pal.speck); chest(); break;
    case 'cave-chest': floor(); chest(); break;
    case 'lava': fill(0, 0, 15, 15, [206, 70, 26]); fill(2, 3, 8, 5, [250, 164, 46]); fill(9, 10, 13, 12, [250, 200, 70]); break;
    case 'altar': floor(); fill(2, 2, 13, 13, [96, 44, 44]); fill(4, 4, 11, 11, [158, 62, 42]); break;
    case 'castle': fill(2, 4, 13, 15, pal.stone); for (const x of [2, 6, 10, 13]) fill(x, 2, x, 4, pal.stone); fill(6, 10, 9, 15, [40, 34, 40]); break;
    default: throw new Error(`Unknown tile ${kind}`);
  }
  return px;
}

const LEGEND = {
  ',': { kind: 'grass', walkable: true },
  p: { kind: 'path', walkable: true },
  T: { kind: 'tree', walkable: false },
  '~': { kind: 'water', walkable: false },
  B: { kind: 'roof', walkable: false },
  S: { kind: 'shop', walkable: true, special: 'shop' },
  A: { kind: 'cave', walkable: true, special: 'cave' },
  C: { kind: 'chest', walkable: true, special: 'chest' },
  '#': { kind: 'wall', walkable: false },
  _: { kind: 'floor', walkable: true },
  E: { kind: 'exit', walkable: true, special: 'town' },
  K: { kind: 'cave-chest', walkable: true, special: 'chest' },
  L: { kind: 'lava', walkable: false },
  X: { kind: 'altar', walkable: true, special: 'boss' },
  V: { kind: 'castle', walkable: true },
};

const MAPS = {
  'EmberQuest-World.png': { palette: 'ember', rows: [
    '~~~~~~~~~~~~~~~~', '~~~,,,,,,,~~~~~~', '~~,,TT,,,,,,~~~~', '~~,,TT,,V,,,,~~~', '~,,,,,,,p,,,,~~~', '~,,A,,,,p,,TT,~~',
    '~,,p,,,,p,,TT,~~', '~,,ppppppp,,,,~~', '~~,,,,,,,,,,~~~~', '~~~,,,,TT,,~~~~~', '~~~~~,,,,~~~~~~~', '~~~~~~~~~~~~~~~~',
  ] },
  'EmberQuest-AshfordTown.png': { palette: 'ember', rows: [
    'TTTTTTTTTTTTTTTT', 'T,,,,,,,,,,,,,,T', 'T,BBBB,,,,,,,,,T', 'T,BSBB,,,,,,C,,T', 'T,,p,,,,,,,,,,,T', 'T,,pppppppppppAT',
    'T,,,,,,p,,,,,,,T', 'T,,~~~,p,,,,,,,T', 'T,,~~~,p,,TT,,,T', 'T,,,,,,p,,TT,,,T', 'T,,,,,,p,,,,,,,T', 'TTTTTTTpTTTTTTTT',
  ] },
  'EmberQuest-EmberfallCave.png': { palette: 'ember', rows: [
    '################', '#______#___LLL_#', '#_####_#_#_____#', '#_#K_#___#_###_#', '#_#__#####_#X#_#', '#_##_______#_#_#',
    '#____###_###_#_#', '####_#___#___#_#', '#____#_###_###_#', '#_####_____LLL_#', '#E_____###_____#', '################',
  ] },
  'StarKnight-World.png': { palette: 'star', rows: [
    '~~~~~~~~~~~~~~~~', '~~,,,,,,,,,,,,~~', '~,,TT,,,,V,,,,~~', '~,,TT,,,,p,,,,,~', '~,,,,,,,,p,,TT,~', '~~,,,,,,,p,,TT,~',
    '~~~,,ppppp,,,,~~', '~~~,,p,,,,,,,~~~', '~~~~,,,,,,,,~~~~', '~~~~~,,,,,~~~~~~', '~~~~~~~~~~~~~~~~', '~~~~~~~~~~~~~~~~',
  ] },
  'StarKnight-MoonKeep.png': { palette: 'star', rows: [
    '################', '#______________#', '#_####_##_####_#', '#_#__________#_#', '#_#_###__###_#_#', '#___#______#___#',
    '#___#______#___#', '#_#_###__###_#_#', '#_#__________#_#', '#_####_##_####_#', '#______E_______#', '################',
  ] },
};

const GAME = {
  title: 'Ember Quest',
  edition: 'Retro (1989)',
  mapPrefix: 'EmberQuest-',
  startingGold: 50,
  start: { map: 'EmberQuest-AshfordTown.png', x: 7, y: 10 },
};

module.exports = { MAPS, LEGEND, PALETTES, GAME, makeTile };

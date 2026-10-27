'use strict';

// Cell counts for a robos:blockout collision grid. robos-crpg-blockout writes
// cover as cover.half and cover["three-quarters"]; the flat halfCover and
// threeQuarterCover keys are read only as a fallback for older grids.
function countBlockoutStats(blockout) {
  const grid = blockout || {};
  const cover = grid.cover || {};
  const count = (cells) => (Array.isArray(cells) ? cells.length : 0);
  return {
    blocked: count(grid.blocked),
    opaque: count(grid.opaque),
    difficult: count(grid.difficult),
    halfCover: count(cover.half || grid.halfCover),
    threeQuarterCover: count(cover['three-quarters'] || grid.threeQuarterCover),
  };
}

module.exports = { countBlockoutStats };

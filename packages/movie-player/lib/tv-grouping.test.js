'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseVideoMediaInfo,
  guessFromRemotePath,
  upgradeTrackVideoGrouping,
} = require('./track-metadata');
const {
  buildIndex,
  summarizeMediaBreakdown,
} = require('./library-index');

test('parseVideoMediaInfo distinguishes Movies from TV Shows and extracts Season & Episode breakdown', () => {
  const tv1 = parseVideoMediaInfo(
    'Atypical.S01E01.Antarctica.720p.WEBRip.2CH.x265.HEVC-PSA',
    'Atypical.SEASON.01.S01.COMPLETE.720p.WEBRip.2CH.x265.HEVC-PSA',
    'Movies'
  );
  assert.equal(tv1.isTvShow, true);
  assert.equal(tv1.mediaType, 'tv');
  assert.equal(tv1.showName, 'Atypical');
  assert.equal(tv1.seasonNumber, 1);
  assert.equal(tv1.episodeNumber, 1);
  assert.equal(tv1.episodeCode, 'S01E01');
  assert.equal(tv1.episodeTitle, 'Antarctica');

  const tv2 = parseVideoMediaInfo('Breaking.Bad.2x03.Bit.by.a.Dead.Bee.1080p.BluRay');
  assert.equal(tv2.isTvShow, true);
  assert.equal(tv2.showName, 'Breaking Bad');
  assert.equal(tv2.seasonNumber, 2);
  assert.equal(tv2.episodeNumber, 3);
  assert.equal(tv2.episodeCode, 'S02E03');
  assert.equal(tv2.episodeTitle, 'Bit by a Dead Bee');

  const movie = parseVideoMediaInfo('Dune.2021.2160p.4K.BluRay.x265', 'Dune (2021)');
  assert.equal(movie.isTvShow, false);
  assert.equal(movie.mediaType, 'movie');
  assert.equal(movie.showName, null);
  assert.equal(movie.year, 2021);
});

test('buildIndex groups TV Show episodes into a single Show with Season & Episode breakdown', () => {
  const tracks = [
    guessFromRemotePath('/Movies/Dune.2021.1080p.BluRay.mp4'),
    guessFromRemotePath('/Movies/Atypical.SEASON.01/Atypical.S01E02.A.Human.Female.720p.WEBRip.mkv'),
    guessFromRemotePath('/Movies/Atypical.SEASON.01/Atypical.S01E01.Antarctica.720p.WEBRip.mkv'),
    guessFromRemotePath('/Movies/Atypical.SEASON.02/Atypical.S02E01.Juiced.720p.WEBRip.mkv'),
  ].map((g, i) => ({ id: `t_${i}`, ...g, duration: 2400 }));

  const index = buildIndex(tracks);
  assert.equal(index.moviesOnly.length, 1);
  assert.equal(index.moviesOnly[0].title, 'Dune (2021)');

  assert.equal(index.tvShows.length, 1);
  const show = index.tvShows[0];
  assert.equal(show.title, 'Atypical');
  assert.equal(show.isTvShow, true);
  assert.equal(show.seasonCount, 2);
  assert.equal(show.episodeCount, 3);
  assert.equal(show.seasons.length, 2);
  assert.equal(show.seasons[0].seasonNumber, 1);
  assert.equal(show.seasons[0].episodeCount, 2);
  // Sorted by episode number within Season 1
  assert.equal(show.seasons[0].episodes[0].episodeCode, 'S01E01');
  assert.equal(show.seasons[0].episodes[1].episodeCode, 'S01E02');
  assert.equal(show.seasons[1].seasonNumber, 2);
  assert.equal(show.seasons[1].episodes[0].episodeCode, 'S02E01');

  const breakdown = summarizeMediaBreakdown(tracks);
  assert.equal(breakdown.movieCount, 1);
  assert.equal(breakdown.showCount, 1);
  assert.equal(breakdown.seasonCount, 2);
  assert.equal(breakdown.episodeCount, 3);
  assert.equal(breakdown.shows[0].showName, 'Atypical');
});

test('upgradeTrackVideoGrouping self-heals legacy un-grouped TV episode tracks', () => {
  const legacy = {
    id: 'trk_legacy',
    filePath: '/home/user/.cache/Atypical.S01E04.A.Nice.Neutral.Smell.720p.WEBRip.mkv',
    title: 'Atypical S01E04 A Nice Neutral Smell',
    album: 'Atypical S01E04 A Nice Neutral Smell',
    artist: '720p WEBRip',
    genre: 'Movies',
  };
  const changed = upgradeTrackVideoGrouping(legacy);
  assert.equal(changed, true);
  assert.equal(legacy.mediaType, 'tv');
  assert.equal(legacy.showName, 'Atypical');
  assert.equal(legacy.album, 'Atypical');
  assert.equal(legacy.seasonNumber, 1);
  assert.equal(legacy.episodeNumber, 4);
  assert.equal(legacy.episodeCode, 'S01E04');
  assert.equal(legacy.episodeTitle, 'A Nice Neutral Smell');
  assert.equal(legacy.genre, 'TV Series');
});

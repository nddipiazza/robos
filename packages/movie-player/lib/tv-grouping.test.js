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
  getTrackWatchState,
  getShowWatchState,
  inProgressTracks,
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

test('parseVideoMediaInfo handles /downloads/shows patterns (Firefly, Book One/Two/Three, S01Extra, casing normalization)', () => {
  const firefly = guessFromRemotePath('/downloads/shows/Firefly Complete Series/01 Firefly The Train Job - Episode 01.mp4');
  assert.equal(firefly.mediaType, 'tv');
  assert.equal(firefly.showName, 'Firefly');
  assert.equal(firefly.seasonNumber, 1);
  assert.equal(firefly.episodeNumber, 1);
  assert.equal(firefly.episodeTitle, 'The Train Job');

  const avatar = guessFromRemotePath('/downloads/shows/Avatar - The Last Airbender/Book Two - Earth/Avatar - S02E01 - The Avatar State.mkv');
  assert.equal(avatar.mediaType, 'tv');
  assert.equal(avatar.showName, 'Avatar: The Last Airbender');
  assert.equal(avatar.seasonNumber, 2);
  assert.equal(avatar.episodeNumber, 1);

  const korraExtra = guessFromRemotePath('/downloads/shows/The Legend of Korra/Season 1/S01 Extras/The Legend of Korra - S01Extra - Republic City Hustle Pt. 1.mkv');
  assert.equal(korraExtra.mediaType, 'tv');
  assert.equal(korraExtra.showName, 'The Legend of Korra');
  assert.equal(korraExtra.seasonNumber, 0);

  const breakingBadLower = guessFromRemotePath('/downloads/shows/breaking bad/Season 3/Breaking.Bad.S03E01.No.Mas.mkv');
  const breakingBadUpper = guessFromRemotePath('/downloads/shows/Breaking Bad/Season 4/Breaking.Bad.S04E01.Box.Cutter.mkv');
  assert.equal(breakingBadLower.showName, 'Breaking Bad');
  assert.equal(breakingBadUpper.showName, 'Breaking Bad');
});

test('getTrackWatchState, getShowWatchState, and inProgressTracks track resume position and next episode', () => {
  const tracks = [
    { id: 'ep1', ...guessFromRemotePath('/downloads/shows/Severance/Season 1/Severance.S01E01.Good.News.About.Hell.mkv'), duration: 3400 },
    { id: 'ep2', ...guessFromRemotePath('/downloads/shows/Severance/Season 1/Severance.S01E02.Half.Loop.mkv'), duration: 3200 },
    { id: 'ep3', ...guessFromRemotePath('/downloads/shows/Severance/Season 1/Severance.S01E03.In.Perpetuity.mkv'), duration: 3100 },
    { id: 'mov1', ...guessFromRemotePath('/downloads/movies/Dune.2021.1080p.BluRay.mp4'), duration: 9300 },
  ];
  const index = buildIndex(tracks);
  const show = index.tvShows[0];

  // Episode 1 completed, Episode 2 paused at 14:20 (860s), Movie paused at 2400s
  const stats = {
    ep1: { plays: 1, lastPlayed: '2026-10-28T10:00:00Z', positionSec: 0, durationSec: 3400, progressPct: 100, inProgress: false, completed: true },
    ep2: { plays: 1, lastPlayed: '2026-10-28T10:30:00Z', positionSec: 860, durationSec: 3200, progressPct: 27, inProgress: true, completed: false },
    mov1: { plays: 1, lastPlayed: '2026-10-28T09:00:00Z', positionSec: 2400, durationSec: 9300, progressPct: 26, inProgress: true, completed: false },
  };

  const ep2State = getTrackWatchState(tracks[1], stats);
  assert.equal(ep2State.inProgress, true);
  assert.equal(ep2State.positionSec, 860);
  assert.equal(ep2State.progressPct, 27);

  const showState = getShowWatchState(show, stats);
  assert.equal(showState.hasActivity, true);
  assert.equal(showState.completed, false);
  assert.equal(showState.completedCount, 1);
  assert.equal(showState.inProgressCount, 1);
  assert.equal(showState.resumeTrack.id, 'ep2');
  assert.equal(showState.resumeIndex, 1);
  assert.equal(showState.resumePositionSec, 860);

  // When ep2 finishes, showState should automatically advance to ep3 at 0:00
  stats.ep2 = { plays: 1, lastPlayed: '2026-10-28T10:55:00Z', positionSec: 0, durationSec: 3200, progressPct: 100, inProgress: false, completed: true };
  const nextShowState = getShowWatchState(show, stats);
  assert.equal(nextShowState.resumeTrack.id, 'ep3');
  assert.equal(nextShowState.resumeIndex, 2);
  assert.equal(nextShowState.resumePositionSec, 0);

  const inProg = inProgressTracks(tracks, stats);
  assert.equal(inProg.length, 1);
  assert.equal(inProg[0].id, 'mov1');
});


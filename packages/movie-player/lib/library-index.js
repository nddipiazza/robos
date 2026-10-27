'use strict';

// Pure, dependency-free library browsing model shared by the renderer (bundled by
// esbuild) and the unit tests. Groups tracks into albums, artists, genres, decades
// and composers, and implements search and sorting.

const UNKNOWN_ARTIST = 'Unknown Artist';
const UNKNOWN_ALBUM = 'Unknown Album';
const VARIOUS_ARTISTS = 'Various Artists';
const PLACEHOLDER_ARTISTS = new Set(['unknown artist', 'cloud stream', 'local file', '']);
const GENERIC_MOVIE_GENRES = new Set(['movies', 'movie', 'video', 'videos', 'film', 'films', 'feature film', 'unknown', '']);

const MOVIE_GENRE_RULES = [
  {
    genre: 'TV Series',
    re: /\b(s\d{1,2}e\d{1,2}|season\s*\d+|episode\s*\d+|atypical|stranger things|breaking bad|mandalorian|the office|friends|game of thrones|house of the dragon|last of us|fallout|arcane|wednesday|boys|invincible|severed|severance)\b/i,
  },
  {
    genre: 'Sci-Fi & Fantasy',
    re: /\b(dune|harry potter|lord of the rings|fellowship of the ring|two towers|return of the king|hobbit|ex machina|serenity|wicked|wizard of oz|willow|ne zha|star wars|matrix|avatar|interstellar|blade runner|alien|predator|backrooms|arrival|inception|terminator|tron|fantastic beasts|narnia|labyrinth|fifth element|mad max)\b/i,
  },
  {
    genre: 'Action & Adventure',
    re: /\b(avengers|endgame|infinity war|mortal kombat|resident evil|dune|lord of the rings|fellowship of the ring|two towers|return of the king|harry potter|willow|hunting games|outpost|serenity|ne zha|spider-?man|batman|dark knight|john wick|top gun|mission impossible|gladiator|deadpool|wolverine|iron man|captain america|thor|black panther|jurassic|indiana jones|pirates of the caribbean|fast and furious|bond|007|transformers)\b/i,
  },
  {
    genre: 'Animation & Family',
    re: /\b(inside out|riley'?s first date|tangled|zootopia|super mario|ne zha|home\b|matilda|cruella|spirited|wizard of oz|wicked|kpop demon hunters|harry potter|toy story|shrek|frozen|moana|encanto|coco|minions|despicable me|kung fu panda|how to train your dragon|finding nemo|finding dory|incredibles|wall-?e|up\b|ratatouille|cars\b|monsters inc|brave|soul|luca|turning red|elemental|wild robot|puss in boots|spider-?verse|sonic|paddington|wonka)\b/i,
  },
  {
    genre: 'Horror & Supernatural',
    re: /\b(conjuring|annabelle|insidious|scream|paranormal activity|the nun|nun ii|final destination|friday the 13th|halloween|terrifier|babadook|malignant|it follows|smile|orphan|lights out|five nights at freddy|fnaf|jennifer'?s body|megan is missing|backrooms|other mommy|hokum|beetlejuice|exorcist|hereditary|midsommar|nosferatu|evil dead|saw\b|chucky|candyman|sinister|quiet place|us\b|get out|nope|talk to me|longlegs|witch|lighthouse)\b/i,
  },
  {
    genre: 'Comedy & Romance',
    re: /\b(scary movie|anyone but you|ticket to paradise|four rooms|beetlejuice|buddy|spirited|men up|heist before christmas|cruella|matilda|atypical|jennifer'?s body|riley'?s first date|deadpool|barbie|superbad|hangover|mean girls|bridesmaids|knives out|grand budapest|palm springs|crazy rich asians|la la land|clueless|legally blonde|ghostbusters|shaun of the dead|hot fuzz|step brothers|anchorman|tropic thunder)\b/i,
  },
  {
    genre: 'Thriller & Mystery',
    re: /\b(ready or not|missing|housemaid|obsession|passenger|megan is missing|orphan|scream|final destination|ex machina|it follows|malignant|hunting games|outpost|gone girl|shutter island|se7en|zodiac|prisoners|nightcrawler|parasite|knives out|glass onion|sixth sense|split|unbreakable|black swan|donnie darko|memento|prestige|departed|sicario)\b/i,
  },
];

const FRANCHISE_RULES = [
  { name: 'Harry Potter Wizarding World', re: /\b(harry potter|fantastic beasts|hogwarts)\b/i },
  { name: 'The Lord of the Rings', re: /\b(lord of the rings|fellowship of the ring|two towers|return of the king|hobbit)\b/i },
  { name: 'The Conjuring Universe', re: /\b(the conjuring|conjuring|annabelle|the nun|nun ii)\b/i },
  { name: 'Insidious Collection', re: /\binsidious\b/i },
  { name: 'Scream Collection', re: /\bscream\b/i },
  { name: 'Final Destination Collection', re: /\bfinal destination\b/i },
  { name: 'Paranormal Activity Collection', re: /\bparanormal activity\b/i },
  { name: 'Marvel & Avengers', re: /\b(avengers|iron man|captain america|thor|spider-?man|black panther|guardians of the galaxy|deadpool)\b/i },
  { name: 'Mortal Kombat Collection', re: /\bmortal kombat\b/i },
  { name: 'Scary Movie Collection', re: /\bscary movie\b/i },
  { name: 'Wicked & Wizard of Oz', re: /\b(wicked|wizard of oz)\b/i },
  { name: 'Resident Evil Collection', re: /\bresident evil\b/i },
  { name: "Five Nights at Freddy's", re: /\b(five nights at freddy|fnaf)\b/i },
  { name: 'Ne Zha Collection', re: /\bne zha\b/i },
  { name: 'Halloween Collection', re: /\bhalloween\b/i },
  { name: 'Orphan Collection', re: /\borphan\b/i },
  { name: 'Inside Out Collection', re: /\b(inside out|riley'?s first date)\b/i },
  { name: 'Atypical (Series)', re: /\batypical\b/i },
];

function inferMovieGenres(track) {
  if (!track) return [];
  const explicit = splitGenres(track.genre).filter(g => !GENERIC_MOVIE_GENRES.has(fold(g)));
  const hay = `${track.title || ''} ${track.album || ''}`;
  const matched = [...explicit];
  const seen = new Set(matched.map(fold));
  for (const rule of MOVIE_GENRE_RULES) {
    if (rule.re.test(hay) && !seen.has(fold(rule.genre))) {
      seen.add(fold(rule.genre));
      matched.push(rule.genre);
    }
  }
  if (!matched.length) {
    if (explicit.length) return explicit;
    const rawGenres = splitGenres(track.genre);
    if (rawGenres.length && !GENERIC_MOVIE_GENRES.has(fold(rawGenres[0]))) return rawGenres;
    return ['Drama & Cinema'];
  }
  return matched;
}

function inferMovieFranchise(track) {
  if (!track) return null;
  const hay = `${track.title || ''} ${track.album || ''}`;
  for (const rule of FRANCHISE_RULES) {
    if (rule.re.test(hay)) return rule.name;
  }
  return null;
}

function inferQualityMeta(track) {
  if (!track) return { resolution: 'HD', source: null, container: null, badge: 'HD' };
  const hay = `${track.artist || ''} ${track.album || ''} ${track.filePath || ''} ${track.codec || ''}`;
  let resolution = null;
  if (/\b(2160p|4k|uhd)\b/i.test(hay)) resolution = '4K UHD';
  else if (/\b1080p\b/i.test(hay)) resolution = '1080p';
  else if (/\b720p\b/i.test(hay)) resolution = '720p';
  else if (/\b480p\b/i.test(hay)) resolution = '480p';

  let source = null;
  if (/\b(blu-?ray|brrip|bdrip)\b/i.test(hay)) source = 'BluRay';
  else if (/\b(web-?dl|webrip|web)\b/i.test(hay)) source = 'WEB-DL';
  else if (/\bhdrip\b/i.test(hay)) source = 'HDRip';
  else if (/\bdvdrip\b/i.test(hay)) source = 'DVDRip';

  let container = null;
  if (/\.mkv(\?|$)/i.test(hay)) container = 'MKV';
  else if (/\.mp4(\?|$)/i.test(hay)) container = 'MP4';

  const badge = [resolution, source].filter(Boolean).join(' · ') || resolution || source || container || 'Cinema';
  return { resolution, source, container, badge };
}

// Artist, album and genre strings repeat thousands of times in a big library, so
// the (slow) Unicode normalisation is cached per distinct string.
const foldCache = new Map();
const FOLD_CACHE_LIMIT = 300000;

function fold(value) {
  const raw = value == null ? '' : String(value);
  let out = foldCache.get(raw);
  if (out === undefined) {
    if (foldCache.size > FOLD_CACHE_LIMIT) foldCache.clear();
    out = raw.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    foldCache.set(raw, out);
  }
  return out;
}

// Sorting 100k tracks makes ~1.7M comparisons, so names are reduced once to a
// key that compares correctly as a plain string: case- and accent-folded, without
// a leading "The"/"A", and with numbers zero-padded so "Track 2" < "Track 10".
const sortNameCache = new Map();

// Display/grouping form: folded, without a leading article.
function sortName(value) {
  return sortKey(value).replace(/\d{12}/g, d => String(Number(d)));
}

function sortKey(value) {
  const raw = value == null ? '' : String(value);
  let key = sortNameCache.get(raw);
  if (key === undefined) {
    if (sortNameCache.size > FOLD_CACHE_LIMIT) sortNameCache.clear();
    key = fold(raw).replace(/^(the|a|an)\s+/, '').replace(/\d+/g, d => d.padStart(12, '0'));
    sortNameCache.set(raw, key);
  }
  return key;
}

function compareNames(a, b) {
  const ka = sortKey(a);
  const kb = sortKey(b);
  return ka < kb ? -1 : ka > kb ? 1 : 0;
}

// Letter used for A–Z jump bars; digits and symbols go under '#'.
function indexLetter(name) {
  const c = sortKey(name).charAt(0).toUpperCase();
  return c >= 'A' && c <= 'Z' ? c : '#';
}

function isPlaceholderArtist(name) {
  return PLACEHOLDER_ARTISTS.has(fold(name));
}

function splitGenres(genre) {
  if (!genre) return [];
  return String(genre).split(/\s*[;|]\s*/).map(g => g.trim()).filter(Boolean);
}

function dirOf(filePath) {
  if (!filePath) return '';
  const parts = String(filePath).split('/');
  parts.pop();
  // Treat ".../Album/CD1" and ".../Album/Disc 2" as the same album folder.
  if (parts.length > 1 && /^(cd|disc|disk)\s*\d+$/i.test(parts[parts.length - 1])) parts.pop();
  return parts.join('/');
}

function albumKeyOf(track) {
  const title = fold(track.album || UNKNOWN_ALBUM);
  if (track.albumArtist) return `${title}\u0001aa:${fold(track.albumArtist)}`;
  // Without an album-artist tag, tracks of one album normally share a folder; that
  // keeps compilations together while separating same-named albums by different artists.
  if (track.filePath) return `${title}\u0001dir:${dirOf(track.filePath)}`;
  return `${title}\u0001ar:${fold(track.artist)}`;
}

function compareAlbumOrder(a, b) {
  return (a.discNumber || 1) - (b.discNumber || 1)
    || (a.trackNumber || 9999) - (b.trackNumber || 9999)
    || compareNames(a.title, b.title);
}

function mostCommon(values) {
  const counts = new Map();
  let best = null;
  let bestCount = 0;
  for (const v of values) {
    if (!v) continue;
    const n = (counts.get(v) || 0) + 1;
    counts.set(v, n);
    if (n > bestCount) { best = v; bestCount = n; }
  }
  return best;
}

function sumDuration(tracks) {
  let total = 0;
  for (const t of tracks) total += t.duration || 0;
  return total;
}

function latest(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return a > b ? a : b;
}

/**
 * Build the full browsing index for a list of tracks.
 */
function buildIndex(tracks = []) {
  const albumMap = new Map();
  for (const t of tracks) {
    const key = albumKeyOf(t);
    let album = albumMap.get(key);
    if (!album) {
      album = { key, title: t.album || UNKNOWN_ALBUM, tracks: [] };
      albumMap.set(key, album);
    }
    album.tracks.push(t);
  }

  // One pass per album with no per-album temporary collections: a 100k-track
  // library can have tens of thousands of albums.
  const albums = [];
  for (const album of albumMap.values()) {
    const list = album.tracks;
    if (list.length > 1) list.sort(compareAlbumOrder);
    let trackArtist = null;
    let multipleArtists = false;
    let albumArtist = null;
    let mixedAlbumArtists = false;
    let year = null;
    let artId = null;
    let duration = 0;
    let addedAt = null;
    let lossless = true;
    let discCount = 0;
    let lastDisc = null;
    let genre = null;
    let mixedGenres = false;
    let codec = null;
    for (const t of list) {
      if (t.artist && !isPlaceholderArtist(t.artist)) {
        if (trackArtist === null) trackArtist = t.artist;
        else if (t.artist !== trackArtist) multipleArtists = true;
      }
      if (t.albumArtist) {
        if (albumArtist === null) albumArtist = t.albumArtist;
        else if (t.albumArtist !== albumArtist) mixedAlbumArtists = true;
      }
      if (t.year && (year === null || t.year < year)) year = t.year;
      if (!artId && t.artId) artId = t.artId;
      duration += t.duration || 0;
      if (t.addedAt && (!addedAt || t.addedAt > addedAt)) addedAt = t.addedAt;
      if (!t.lossless) lossless = false;
      const disc = t.discNumber || 1;
      if (disc !== lastDisc) { discCount++; lastDisc = disc; }
      if (t.genre) {
        if (genre === null) genre = t.genre;
        else if (t.genre !== genre) mixedGenres = true;
      }
      if (!codec && t.codec) codec = t.codec;
    }
    if (mixedAlbumArtists) albumArtist = mostCommon(list.map(t => t.albumArtist));
    album.artist = albumArtist
      || (multipleArtists ? VARIOUS_ARTISTS : (trackArtist || list[0].artist || UNKNOWN_ARTIST));
    album.artistKey = fold(album.artist);
    album.isCompilation = album.artist === VARIOUS_ARTISTS;
    album.year = year;
    const inferredGenres = topValues(list.flatMap(t => inferMovieGenres(t)), 3);
    album.genres = inferredGenres;
    album.genre = inferredGenres[0]
      || (mixedGenres ? mostCommon(list.flatMap(t => splitGenres(t.genre))) : (splitGenres(genre)[0] || null));
    album.franchise = inferMovieFranchise(list[0]);
    album.quality = inferQualityMeta(list[0]);
    album.isTvShow = inferredGenres.includes('TV Series') || /\bs\d{1,2}\s*e\d{1,2}\b|\bseason\s*\d+\b|\bepisode\s*\d+\b/i.test(`${album.title || ''} ${list[0]?.title || ''}`);
    album.artId = artId;
    album.duration = duration;
    album.discCount = discCount;
    album.addedAt = addedAt;
    album.lossless = list.length > 0 && lossless;
    album.codec = codec;
    album.isUnknown = fold(album.title) === 'unknown album';
    albums.push(album);
  }
  albums.sort((a, b) => compareNames(a.title, b.title) || compareNames(a.artist, b.artist));
  const albumByKey = new Map(albums.map(a => [a.key, a]));
  const albumOfTrack = new Map();
  for (const a of albums) for (const t of a.tracks) albumOfTrack.set(t, a);

  // Artists: everyone credited on a track, plus album artists.
  const artistMap = new Map();
  const ensureArtist = (name) => {
    const key = fold(name);
    let artist = artistMap.get(key);
    if (!artist) {
      artist = { key, name, tracks: [], albumKeys: new Set(), appearsOnKeys: new Set() };
      artistMap.set(key, artist);
    }
    return artist;
  };
  for (const album of albums) {
    if (!album.isCompilation && !isPlaceholderArtist(album.artist)) ensureArtist(album.artist).albumKeys.add(album.key);
  }
  for (const t of tracks) {
    const name = t.artist || UNKNOWN_ARTIST;
    const artist = ensureArtist(name);
    artist.tracks.push(t);
    const album = albumOfTrack.get(t);
    if (album && album.artistKey !== artist.key) artist.appearsOnKeys.add(album.key);
  }
  const artists = [];
  for (const artist of artistMap.values()) {
    // Album artists with no own tracks under that exact name still get their albums' tracks.
    if (!artist.tracks.length) {
      for (const key of artist.albumKeys) artist.tracks.push(...albumByKey.get(key).tracks);
    }
    const ownAlbums = [...artist.albumKeys].map(k => albumByKey.get(k));
    artist.albums = ownAlbums.sort((a, b) => (a.year || 9999) - (b.year || 9999) || compareNames(a.title, b.title));
    artist.appearsOn = [...artist.appearsOnKeys].map(k => albumByKey.get(k))
      .filter(a => !artist.albumKeys.has(a.key))
      .sort((a, b) => (a.year || 9999) - (b.year || 9999));
    delete artist.albumKeys;
    delete artist.appearsOnKeys;
    artist.artId = (artist.albums.find(a => a.artId) || artist.appearsOn.find(a => a.artId) || {}).artId
      || (artist.tracks.find(t => t.artId) || {}).artId || null;
    artist.duration = sumDuration(artist.tracks);
    artist.genres = topValues(artist.tracks.flatMap(t => splitGenres(t.genre)), 3);
    artist.isPlaceholder = isPlaceholderArtist(artist.name);
    artists.push(artist);
  }
  artists.sort((a, b) => (a.isPlaceholder - b.isPlaceholder) || compareNames(a.name, b.name));
  const artistByKey = new Map(artists.map(a => [a.key, a]));

  const genres = groupBy(tracks, t => inferMovieGenres(t), albumOfTrack);
  const franchises = groupBy(tracks, t => {
    const f = inferMovieFranchise(t);
    return f ? [f] : [];
  }, albumOfTrack);
  for (const f of franchises) {
    f.albums.sort((a, b) => (a.year || 9999) - (b.year || 9999) || compareNames(a.title, b.title));
  }
  franchises.sort((a, b) => b.albums.length - a.albums.length || compareNames(a.name, b.name));
  const composers = groupBy(tracks, t => (t.composer ? [t.composer] : []), albumOfTrack);
  const decades = groupBy(tracks, t => (t.year ? [`${Math.floor(t.year / 10) * 10}s`] : []), albumOfTrack);
  for (const d of decades) d.start = parseInt(d.name, 10);
  decades.sort((a, b) => b.start - a.start);

  const moviesOnly = albums.filter(a => !a.isTvShow);
  const tvShows = albums.filter(a => a.isTvShow);

  return {
    tracks,
    albums,
    moviesOnly,
    tvShows,
    artists,
    genres,
    franchises,
    decades,
    composers,
    albumByKey,
    artistByKey,
    genreByKey: new Map(genres.map(g => [g.key, g])),
    franchiseByKey: new Map(franchises.map(f => [f.key, f])),
    decadeByKey: new Map(decades.map(d => [d.key, d])),
    composerByKey: new Map(composers.map(c => [c.key, c])),
    albumOfTrack,
    totalDuration: sumDuration(tracks),
  };
}

function topValues(values, n) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([v]) => v);
}

function groupBy(tracks, namesOf, albumOfTrack) {
  const map = new Map();
  for (const t of tracks) {
    for (const name of namesOf(t)) {
      const key = fold(name);
      let g = map.get(key);
      if (!g) {
        g = { key, name, tracks: [] };
        map.set(key, g);
      }
      g.tracks.push(t);
    }
  }
  const groups = [...map.values()];
  for (const g of groups) {
    const albums = [];
    const seen = new Set();
    for (const t of g.tracks) {
      const a = albumOfTrack.get(t);
      if (a && !seen.has(a.key)) { seen.add(a.key); albums.push(a); }
    }
    g.albums = albums;
    g.artistCount = new Set(g.tracks.map(t => fold(t.artist))).size;
    g.artIds = [...new Set(albums.map(a => a.artId).filter(Boolean))].slice(0, 4);
    g.duration = sumDuration(g.tracks);
  }
  groups.sort((a, b) => compareNames(a.name, b.name));
  return groups;
}

// ── Search ──────────────────────────────────────────────────────────────────

const haystackCache = new WeakMap();

function cachedHaystack(item, text) {
  let hay = haystackCache.get(item);
  if (hay === undefined) {
    hay = fold(text());
    haystackCache.set(item, hay);
  }
  return hay;
}

function trackHaystack(t) {
  let hay = haystackCache.get(t);
  if (hay === undefined) {
    hay = fold([
      t.title,
      t.artist,
      t.albumArtist,
      t.album,
      t.genre,
      ...inferMovieGenres(t),
      inferMovieFranchise(t),
      t.composer,
      t.year,
    ].filter(Boolean).join(' '));
    haystackCache.set(t, hay);
  }
  return hay;
}

/**
 * Every whitespace-separated term must appear somewhere in the item, so
 * "beatles abbey" finds Abbey Road tracks by The Beatles.
 */
function searchIndex(index, query, limits = {}) {
  const terms = fold(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return { terms, tracks: [], albums: [], artists: [], genres: [] };
  const matches = (hay) => terms.every(term => hay.includes(term));
  const nameScore = (name) => {
    const n = fold(name);
    const q = terms.join(' ');
    return n === q ? 0 : n.startsWith(q) ? 1 : 2;
  };
  const byScore = (nameOf) => (a, b) => nameScore(nameOf(a)) - nameScore(nameOf(b)) || compareNames(nameOf(a), nameOf(b));

  const artists = index.artists.filter(a => matches(fold(a.name))).sort(byScore(a => a.name));
  const albums = index.albums.filter(a => matches(cachedHaystack(a, () => `${a.title} ${a.artist} ${a.year || ''}`))).sort(byScore(a => a.title));
  const genres = index.genres.filter(g => matches(g.key)).sort(byScore(g => g.name));
  const tracks = index.tracks.filter(t => matches(trackHaystack(t))).sort(byScore(t => t.title));
  return {
    terms,
    artists: limits.artists ? artists.slice(0, limits.artists) : artists,
    albums: limits.albums ? albums.slice(0, limits.albums) : albums,
    genres: limits.genres ? genres.slice(0, limits.genres) : genres,
    tracks,
    totals: { artists: artists.length, albums: albums.length, genres: genres.length, tracks: tracks.length },
  };
}

// ── Sorting ─────────────────────────────────────────────────────────────────

const TRACK_SORTS = {
  title: (a, b) => compareNames(a.title, b.title),
  artist: (a, b) => compareNames(a.artist, b.artist) || compareNames(a.album, b.album) || compareAlbumOrder(a, b),
  album: (a, b) => compareNames(a.album, b.album) || compareAlbumOrder(a, b),
  genre: (a, b) => compareNames(a.genre || '￿', b.genre || '￿') || compareNames(a.artist, b.artist),
  year: (a, b) => (a.year || 0) - (b.year || 0) || compareNames(a.album, b.album) || compareAlbumOrder(a, b),
  duration: (a, b) => (a.duration || 0) - (b.duration || 0),
  addedAt: (a, b) => String(a.addedAt || '').localeCompare(String(b.addedAt || '')),
  trackNumber: compareAlbumOrder,
};

function sortTracks(tracks, key = 'title', dir = 'asc', stats = {}) {
  let cmp = TRACK_SORTS[key];
  if (key === 'plays') cmp = (a, b) => ((stats[a.id] || {}).plays || 0) - ((stats[b.id] || {}).plays || 0);
  if (key === 'lastPlayed') cmp = (a, b) => String((stats[a.id] || {}).lastPlayed || '').localeCompare(String((stats[b.id] || {}).lastPlayed || ''));
  if (key === 'loved') cmp = (a, b) => Number(!!(stats[a.id] || {}).loved) - Number(!!(stats[b.id] || {}).loved);
  if (!cmp) cmp = TRACK_SORTS.title;
  const sign = dir === 'desc' ? -1 : 1;
  // Stable tie-break on title keeps equal rows in a predictable order.
  return [...tracks].sort((a, b) => sign * cmp(a, b) || TRACK_SORTS.title(a, b));
}

const ALBUM_SORTS = {
  title: (a, b) => compareNames(a.title, b.title) || compareNames(a.artist, b.artist),
  artist: (a, b) => compareNames(a.artist, b.artist) || (a.year || 0) - (b.year || 0),
  year: (a, b) => (b.year || 0) - (a.year || 0) || compareNames(a.title, b.title),
  addedAt: (a, b) => String(b.addedAt || '').localeCompare(String(a.addedAt || '')),
  tracks: (a, b) => b.tracks.length - a.tracks.length,
};

function sortAlbums(albums, key = 'title') {
  return [...albums].sort(ALBUM_SORTS[key] || ALBUM_SORTS.title);
}

const ARTIST_SORTS = {
  name: (a, b) => (a.isPlaceholder - b.isPlaceholder) || compareNames(a.name, b.name),
  tracks: (a, b) => b.tracks.length - a.tracks.length || compareNames(a.name, b.name),
  albums: (a, b) => b.albums.length - a.albums.length || compareNames(a.name, b.name),
};

function sortArtists(artists, key = 'name', stats = {}) {
  if (key === 'plays') {
    const plays = (a) => a.tracks.reduce((n, t) => n + ((stats[t.id] || {}).plays || 0), 0);
    return [...artists].sort((a, b) => plays(b) - plays(a) || compareNames(a.name, b.name));
  }
  return [...artists].sort(ARTIST_SORTS[key] || ARTIST_SORTS.name);
}

// ── Smart collections ───────────────────────────────────────────────────────

function lovedTracks(tracks, stats = {}) {
  return tracks
    .filter(t => (stats[t.id] || {}).loved)
    .sort((a, b) => String((stats[b.id] || {}).lovedAt || '').localeCompare(String((stats[a.id] || {}).lovedAt || '')));
}

function recentlyAddedTracks(tracks) {
  return sortTracks(tracks.filter(t => t.addedAt), 'addedAt', 'desc');
}

function recentlyPlayedTracks(tracks, stats = {}) {
  return sortTracks(tracks.filter(t => (stats[t.id] || {}).lastPlayed), 'lastPlayed', 'desc', stats);
}

function mostPlayedTracks(tracks, stats = {}) {
  return sortTracks(tracks.filter(t => (stats[t.id] || {}).plays > 0), 'plays', 'desc', stats);
}

function unplayedTracks(tracks, stats = {}) {
  return tracks.filter(t => !((stats[t.id] || {}).plays > 0));
}

// ── Formatting ──────────────────────────────────────────────────────────────

function formatDuration(sec) {
  if (!sec || isNaN(sec)) return '--:--';
  const total = Math.round(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = `${s < 10 ? '0' : ''}${s}`;
  return h > 0 ? `${h}:${m < 10 ? '0' : ''}${m}:${ss}` : `${m}:${ss}`;
}

function formatLongDuration(sec) {
  const totalMin = Math.round((sec || 0) / 60);
  if (totalMin < 60) return `${totalMin} min`;
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `${days}d ${hours}h`;
  return mins ? `${hours} hr ${mins} min` : `${hours} hr`;
}

function plural(n, word, pluralWord) {
  return `${Number(n).toLocaleString()} ${n === 1 ? word : (pluralWord || `${word}s`)}`;
}

module.exports = {
  UNKNOWN_ARTIST,
  UNKNOWN_ALBUM,
  VARIOUS_ARTISTS,
  fold,
  sortName,
  compareNames,
  indexLetter,
  splitGenres,
  inferMovieGenres,
  inferMovieFranchise,
  inferQualityMeta,
  albumKeyOf,
  buildIndex,
  searchIndex,
  sortTracks,
  sortAlbums,
  sortArtists,
  lovedTracks,
  recentlyAddedTracks,
  recentlyPlayedTracks,
  mostPlayedTracks,
  unplayedTracks,
  formatDuration,
  formatLongDuration,
  plural,
};

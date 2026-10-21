'use strict';

// AI playlists and the Virtual DJ, built on the user's RobOS agent.
//
// The agent is passed in as `ask(prompt) -> { ok, text, error }` (robos-lib/ai-agent),
// so everything here is testable with a fake agent.
//
// A big library doesn't fit in one prompt (a CLI argument tops out around 128 KB),
// so large libraries take two calls: the agent reads a summary of the library and
// answers with selection criteria, the candidates are pre-filtered locally, and the
// agent then picks and orders the playlist from that shortlist.

const { buildIndex, fold, splitGenres, formatDuration } = require('./library-index');

const SINGLE_CALL_MAX = 400;   // libraries this small skip the criteria step
const CANDIDATE_LIMIT = 400;   // songs shown to the agent for the final pick
const FIELD_MAX = 60;
const MAX_SONGS = 100;
const DJ_FREQUENCIES = ['every', 'alternate', 'sometimes'];

const JSON_ONLY = [
  'Respond with a single JSON object and nothing else: no prose, no markdown fences.',
  'Keep every string on one line; use straight ASCII double quotes.',
].join(' ');

const DJ_STYLE = [
  'Write it to be spoken aloud by text-to-speech: plain sentences, no emojis, no markdown,',
  'no stage directions, no sound effects, no hashtags. Never name the song that just played.',
  'Only state facts about a song or artist you are sure of; otherwise talk about the mood.',
].join(' ');

const clip = (value, max = FIELD_MAX) => {
  const s = String(value == null ? '' : value).replace(/[\r\n|]+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};

function songLine(n, t) {
  return [n, clip(t.artist), clip(t.title), clip(t.album), t.year || '', clip(t.genre, 30), formatDuration(t.duration)].join(' | ');
}

// ── Parsing ─────────────────────────────────────────────────────────────────

// Agents sometimes wrap JSON in prose or fences; take the outermost object.
function parseJsonReply(text, parseJson = null) {
  if (parseJson) {
    try {
      const out = parseJson(text);
      // robos-lib/ai-json's parseAIJson answers { ok, data } rather than the object itself.
      const data = out && typeof out === 'object' && 'ok' in out && !('picks' in out) ? (out.ok ? out.data : null) : out;
      if (data && typeof data === 'object' && !Array.isArray(data)) return data;
    } catch {}
  }
  const raw = String(text || '');
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('The agent did not answer with JSON.');
  return JSON.parse(raw.slice(start, end + 1));
}

// ── Library summary & candidate filtering ───────────────────────────────────

function summarizeLibrary(tracks) {
  const index = buildIndex(tracks);
  return {
    trackCount: tracks.length,
    genres: [...index.genres].sort((a, b) => b.tracks.length - a.tracks.length).slice(0, 80)
      .map(g => `${g.name} (${g.tracks.length})`),
    decades: index.decades.map(d => `${d.name} (${d.tracks.length})`),
    artists: index.artists.filter(a => !a.isPlaceholder)
      .sort((a, b) => b.tracks.length - a.tracks.length).slice(0, 300)
      .map(a => `${clip(a.name, 40)} (${a.tracks.length}${a.genres.length ? `, ${a.genres.slice(0, 2).join('/')}` : ''})`),
  };
}

function buildCriteriaPrompt(request, summary, count) {
  return [
    'You help build a music playlist from the user\'s own library.',
    `The user asked for: """${request}"""`,
    `They want about ${count} songs. Their library has ${summary.trackCount} songs.`,
    '',
    `Genres in the library (song counts): ${summary.genres.join(', ') || 'none tagged'}`,
    `Decades: ${summary.decades.join(', ') || 'unknown'}`,
    `Artists with the most songs: ${summary.artists.join('; ')}`,
    '',
    'Turn the request into search criteria using the library\'s own genre and artist names where they fit.',
    'Fields: "name" (short playlist title), "description" (one sentence), "genres", "artists",',
    '"decades" (like "1990s"), "yearFrom", "yearTo", "keywords" (words likely in song or album titles),',
    '"excludeArtists", "excludeGenres", "excludeKeywords". Use empty arrays or null for anything unused.',
    JSON_ONLY,
  ].join('\n');
}

const lowerSet = (list) => new Set((Array.isArray(list) ? list : []).map(v => fold(v)).filter(Boolean));

/**
 * Score every track against the criteria and return a varied shortlist: the best
 * matches, at most a few songs per artist (unless the artist was asked for), and
 * random fill when the criteria match too little.
 */
function filterCandidates(tracks, criteria = {}, limit = CANDIDATE_LIMIT, random = Math.random) {
  const genres = lowerSet(criteria.genres);
  const artists = lowerSet(criteria.artists);
  const decades = lowerSet(criteria.decades);
  const keywords = [...lowerSet(criteria.keywords)];
  const noArtists = lowerSet(criteria.excludeArtists);
  const noGenres = lowerSet(criteria.excludeGenres);
  const noKeywords = [...lowerSet(criteria.excludeKeywords)];
  const yearFrom = Number(criteria.yearFrom) || null;
  const yearTo = Number(criteria.yearTo) || null;

  const scored = [];
  for (const t of tracks) {
    const artist = fold(t.artist);
    const trackGenres = splitGenres(t.genre).map(fold);
    const text = fold(`${t.title} ${t.album}`);
    if (noArtists.has(artist) || trackGenres.some(g => noGenres.has(g)) || noKeywords.some(k => text.includes(k))) continue;
    let score = 0;
    if (artists.has(artist) || artists.has(fold(t.albumArtist))) score += 6;
    if (trackGenres.some(g => genres.has(g))) score += 4;
    else if (genres.size && trackGenres.some(g => [...genres].some(want => g.includes(want) || want.includes(g)))) score += 2;
    if (t.year) {
      if (decades.has(`${Math.floor(t.year / 10) * 10}s`)) score += 2;
      if ((yearFrom || yearTo) && (!yearFrom || t.year >= yearFrom) && (!yearTo || t.year <= yearTo)) score += 2;
    }
    for (const k of keywords) if (text.includes(k)) score += 1;
    scored.push({ t, score: score + random() * 0.5 });
  }

  scored.sort((a, b) => b.score - a.score);
  const perArtistCap = Math.max(4, Math.ceil(limit / 40));
  const perArtist = new Map();
  const picked = [];
  const leftovers = [];
  for (const s of scored) {
    if (picked.length >= limit) break;
    if (s.score <= 0.5) { leftovers.push(s.t); continue; }
    const key = fold(s.t.artist);
    const n = perArtist.get(key) || 0;
    if (n >= perArtistCap && !artists.has(key)) { leftovers.push(s.t); continue; }
    perArtist.set(key, n + 1);
    picked.push(s.t);
  }
  // Too few matches: give the agent some variety to choose from anyway.
  for (const t of leftovers) {
    if (picked.length >= limit) break;
    picked.push(t);
  }
  return picked;
}

// ── Final selection (and the DJ script) ─────────────────────────────────────

function buildSelectionPrompt({ request, count, candidates, criteria, dj }) {
  const lines = [
    'You are a music curator building a playlist from the user\'s own library.',
    `The user asked for: """${request}"""`,
    criteria && criteria.name ? `Working title: ${criteria.name}` : '',
    '',
    `Pick ${count} songs from the numbered list below (fewer only if there aren't ${count} that fit).`,
    'Order them for a good listening flow: shape the energy, make smooth transitions, and avoid the same artist back to back.',
    'Fields: "name" (short playlist title), "description" (one sentence), "picks" (song numbers in play order).',
  ];
  if (dj) {
    lines.push(
      '',
      `Also write the script for a radio DJ between the songs. The DJ: """${dj.persona}"""`,
      'Add "dj": {"intro": "...", "lines": [{"pick": <song number>, "text": "..."}]}.',
      '"intro" welcomes listeners and introduces the first song (at most 2 sentences).',
      'Give one line for every picked song after the first: what the DJ says right before it plays,',
      'introducing it by title and artist in at most 2 sentences (under 40 words).',
      DJ_STYLE,
    );
  }
  lines.push(
    '',
    JSON_ONLY,
    '',
    'Songs (number | artist | title | album | year | genre | length):',
    ...candidates.map((t, i) => songLine(i + 1, t)),
  );
  return lines.filter(l => l !== null).join('\n');
}

function resolvePicks(reply, candidates, count) {
  const seen = new Set();
  const tracks = [];
  for (const raw of Array.isArray(reply.picks) ? reply.picks : []) {
    const n = parseInt(raw, 10);
    const t = candidates[n - 1];
    if (!t || seen.has(t)) continue;
    seen.add(t);
    tracks.push(t);
    if (tracks.length >= count) break;
  }
  return tracks;
}

function resolveDjScript(reply, candidates, tracks) {
  const dj = reply && typeof reply.dj === 'object' && reply.dj ? reply.dj : {};
  const chosen = new Set(tracks);
  const lines = {};
  for (const entry of Array.isArray(dj.lines) ? dj.lines : []) {
    const t = candidates[parseInt(entry && entry.pick, 10) - 1];
    const text = clip(entry && entry.text, 400);
    if (t && chosen.has(t) && t.id && text) lines[t.id] = text;
  }
  return { intro: clip(dj.intro, 400), lines };
}

/**
 * Build a playlist from a natural-language request.
 * @returns {Promise<{ ok, playlist?, error? }>} playlist: { name, description, tracks, ai, dj? }
 */
async function generateAiPlaylist({ tracks, request, count = 25, dj = null }, { ask, parseJson = null, onProgress = () => {} }) {
  const wanted = Math.max(3, Math.min(MAX_SONGS, parseInt(count, 10) || 25));
  const prompt = String(request || '').trim();
  if (!prompt) return { ok: false, error: 'Describe the playlist you want.' };
  const library = (tracks || []).filter(t => t && t.id);
  if (!library.length) return { ok: false, error: 'Your library is empty. Add a music folder first.' };
  const djOpts = dj && String(dj.persona || '').trim() ? { ...dj, persona: String(dj.persona).trim() } : null;

  let candidates = library;
  let criteria = null;
  if (library.length > SINGLE_CALL_MAX) {
    onProgress({ step: 'criteria', message: `Asking your agent what to look for in ${library.length.toLocaleString()} songs…` });
    const res = await ask(buildCriteriaPrompt(prompt, summarizeLibrary(library), wanted));
    if (!res || !res.ok) return { ok: false, error: (res && res.error) || 'The agent did not answer.' };
    try {
      criteria = parseJsonReply(res.text, parseJson);
    } catch (err) {
      return { ok: false, error: `Could not read the agent's answer: ${err.message}` };
    }
    candidates = filterCandidates(library, criteria);
    onProgress({ step: 'shortlist', message: `Shortlisted ${candidates.length} songs. Asking your agent to pick and order them…` });
  } else {
    onProgress({ step: 'pick', message: 'Asking your agent to pick and order songs…' });
  }

  const res = await ask(buildSelectionPrompt({ request: prompt, count: wanted, candidates, criteria, dj: djOpts }));
  if (!res || !res.ok) return { ok: false, error: (res && res.error) || 'The agent did not answer.' };
  let reply;
  try {
    reply = parseJsonReply(res.text, parseJson);
  } catch (err) {
    return { ok: false, error: `Could not read the agent's answer: ${err.message}` };
  }
  const picked = resolvePicks(reply, candidates, wanted);
  if (!picked.length) return { ok: false, error: 'The agent did not pick any songs from your library. Try describing it differently.' };

  const playlist = {
    name: clip(reply.name || (criteria && criteria.name) || 'AI Playlist', 80),
    description: clip(reply.description || (criteria && criteria.description) || prompt, 240),
    tracks: picked,
    ai: { request: prompt, createdAt: new Date().toISOString() },
  };
  if (djOpts) {
    playlist.dj = {
      persona: djOpts.persona,
      voice: djOpts.voice || '',
      frequency: DJ_FREQUENCIES.includes(djOpts.frequency) ? djOpts.frequency : 'every',
      ...resolveDjScript(reply, candidates, picked),
    };
  }
  onProgress({ step: 'done', message: `Picked ${picked.length} songs.` });
  return { ok: true, playlist };
}

// ── Virtual DJ lines for any queue ──────────────────────────────────────────

function buildDjLinesPrompt(persona, upcoming) {
  return [
    `You are a radio DJ between songs. Your persona: """${persona}"""`,
    'For each upcoming song below, write what you say right before it plays,',
    'introducing it by title and artist in at most 2 sentences (under 40 words). Vary your openings.',
    DJ_STYLE,
    'Answer as {"lines": [{"n": <song number>, "text": "..."}]}.',
    JSON_ONLY,
    '',
    'Upcoming songs (number | artist | title | album | year | genre | length):',
    ...upcoming.map((t, i) => songLine(i + 1, t)),
  ].join('\n');
}

/** Write DJ lines for upcoming tracks. Returns { ok, lines: { [trackId]: text } }. */
async function generateDjLines({ persona, upcoming }, { ask, parseJson = null }) {
  const who = String(persona || '').trim();
  const list = (upcoming || []).filter(t => t && t.id).slice(0, 8);
  if (!who || !list.length) return { ok: true, lines: {} };
  const res = await ask(buildDjLinesPrompt(who, list));
  if (!res || !res.ok) return { ok: false, error: (res && res.error) || 'The agent did not answer.', lines: {} };
  let reply;
  try {
    reply = parseJsonReply(res.text, parseJson);
  } catch (err) {
    return { ok: false, error: `Could not read the agent's answer: ${err.message}`, lines: {} };
  }
  const lines = {};
  for (const entry of Array.isArray(reply.lines) ? reply.lines : []) {
    const t = list[parseInt(entry && entry.n, 10) - 1];
    const text = clip(entry && entry.text, 400);
    if (t && text) lines[t.id] = text;
  }
  return { ok: true, lines };
}

module.exports = {
  DJ_FREQUENCIES,
  SINGLE_CALL_MAX,
  CANDIDATE_LIMIT,
  parseJsonReply,
  summarizeLibrary,
  buildCriteriaPrompt,
  filterCandidates,
  buildSelectionPrompt,
  buildDjLinesPrompt,
  generateAiPlaylist,
  generateDjLines,
};

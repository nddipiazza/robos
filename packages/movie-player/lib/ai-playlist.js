/**
 * AI Watchlist / Movie Marathon & Virtual Cinema Host for RobOS Movie Player
 *
 * Uses `robos-lib/ai-agent` (the user's configured coding agent CLI or optional
 * `robos-llm` API mode, pre-screened by the Prompt Security Guard) to:
 *   1. Pick and order a movie marathon / watchlist from the user's library for a free-text
 *      description (mood, director, franchise, runtime, era, double-feature theme, etc.).
 *   2. Pre-generate short, atmospheric Virtual Cinema Host intros (spoken between films
 *      or episodes with RobOS Voice) for a slice of the Watchlist / Now Playing queue.
 *
 * Both functions fall back to deterministic local heuristics when no AI agent
 * is configured or the response cannot be parsed, so the app works without AI.
 */

let aiAgent = null;
try {
  aiAgent = require('/usr/local/share/robos/robos-lib/ai-agent');
} catch (_) {
  try {
    aiAgent = require('../../robos-lib/ai-agent');
  } catch (_) {}
}

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for', 'from',
  'in', 'into', 'is', 'it', 'me', 'my', 'of', 'on', 'or', 'play', 'playlist',
  'watchlist', 'marathon', 'movie', 'movies', 'film', 'films', 'some', 'songs',
  'that', 'the', 'to', 'up', 'with', 'make', 'build', 'create'
]);

function extractJsonObject(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const text = fenced ? fenced[1] : raw;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch (_) {
    return null;
  }
}

function tokenizePrompt(prompt) {
  return String(prompt || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2 && !STOP_WORDS.has(w));
}

function scoreCandidates(tracks, prompt, limit = 150) {
  const tokens = tokenizePrompt(prompt);
  const decadeMatch = String(prompt || '').match(/\b(19\d0|20\d0)s?\b/i);
  const wantedDecade = decadeMatch ? parseInt(decadeMatch[1], 10) : null;
  const wants4k = /\b(4k|2160p|uhd)\b/i.test(prompt || '');
  const wantsShort = /\b(short|quick|episode|clip|under\s+30)\b/i.test(prompt || '');
  const wantsFeature = /\b(feature|epic|marathon|long|cinema)\b/i.test(prompt || '');

  const scored = [];
  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i];
    if (!t || !t.id) continue;
    const hay = (t._q || `${t.title || ''} ${t.artist || ''} ${t.album || ''} ${t.genre || ''} ${t.year || ''} ${t.resolution || ''}`).toLowerCase();
    let score = 0;
    for (let k = 0; k < tokens.length; k++) {
      const tok = tokens[k];
      if ((t.genre || '').toLowerCase().includes(tok)) score += 6;
      if ((t.artist || '').toLowerCase().includes(tok)) score += 5;
      if ((t.album || '').toLowerCase().includes(tok)) score += 4;
      if ((t.title || '').toLowerCase().includes(tok)) score += 4;
      else if (hay.includes(tok)) score += 2;
    }
    if (wantedDecade && t.year && Math.floor(t.year / 10) * 10 === wantedDecade) {
      score += 6;
    }
    if (wants4k && t.resolution === '4K') score += 5;
    if (wantsShort && t.duration > 0 && t.duration <= 1800) score += 4;
    if (wantsFeature && t.duration >= 3600) score += 4;
    if (t.loved) score += 1.5;
    if (t.playCount > 0) score += Math.min(2, t.playCount * 0.25);
    const tie = ((i * 2654435761) >>> 0) / 0xffffffff;
    scored.push({ track: t, score, tie });
  }

  scored.sort((a, b) => (b.score - a.score) || (b.tie - a.tie));
  return scored.slice(0, limit).map(s => s.track);
}

function defaultPlaylistName(prompt) {
  const clean = String(prompt || '').trim().replace(/\s+/g, ' ');
  if (!clean) return 'AI Cinema Watchlist';
  const words = clean.split(' ').slice(0, 5).join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

async function generateAiPlaylist({
  prompt,
  libraryIndex,
  count = 15,
  virtualDj = false,
  djStyle = 'warm classic cinema host',
  askFn = null
} = {}) {
  const maxTracks = Math.max(1, Math.min(100, Number(count) || 15));
  const allTracks = (libraryIndex && Array.isArray(libraryIndex.tracks)) ? libraryIndex.tracks : [];
  if (allTracks.length === 0) {
    return {
      name: defaultPlaylistName(prompt),
      description: prompt || '',
      tracks: [],
      virtualDj: Boolean(virtualDj),
      djStyle,
      source: 'empty-library'
    };
  }

  const candidates = scoreCandidates(allTracks, prompt, Math.min(150, Math.max(maxTracks * 4, 60)));
  const catalogLines = candidates.map((t, idx) =>
    `${idx + 1}. [${t.id}] "${t.title || 'Untitled'}" — dir. ${t.artist || 'Unknown'} (${t.album || 'Standalone'}${t.year ? ', ' + t.year : ''}${t.genre ? ', ' + t.genre : ''}${t.resolution ? ', ' + t.resolution : ''})`
  ).join('\n');

  const aiPrompt = [
    'You are curating a movie marathon / watchlist from the user\'s RobOS Movie Player library.',
    `User request: "${String(prompt || 'A great movie marathon').trim()}"`,
    `Target count: up to ${maxTracks} movies/videos, ordered for a great viewing flow.`,
    '',
    'Candidate catalog (choose ONLY from these IDs in brackets):',
    catalogLines,
    '',
    'Respond with ONLY a JSON object in this exact shape:',
    '{"name":"Short evocative watchlist title","description":"One-sentence vibe summary","trackIds":["id1","id2"]}'
  ].join('\n');

  const ask = askFn || (aiAgent && typeof aiAgent.ask === 'function' ? (p) => aiAgent.ask(p, { timeout: 60000 }) : null);
  let parsed = null;
  let source = 'heuristic';

  if (ask) {
    try {
      const res = await ask(aiPrompt);
      if (res && res.ok && res.text) {
        parsed = extractJsonObject(res.text);
        if (parsed && Array.isArray(parsed.trackIds) && parsed.trackIds.length > 0) {
          source = res.provider ? `ai:${res.provider}` : 'ai';
        }
      }
    } catch (_) {}
  }

  const byId = new Map(allTracks.map(t => [t.id, t]));
  const picked = [];
  const seen = new Set();

  if (parsed && Array.isArray(parsed.trackIds)) {
    for (const id of parsed.trackIds) {
      const cleanId = String(id || '').trim();
      const track = byId.get(cleanId);
      if (track && !seen.has(track.id)) {
        seen.add(track.id);
        picked.push(track);
        if (picked.length >= maxTracks) break;
      }
    }
  }

  if (picked.length === 0) {
    for (const t of candidates) {
      if (!seen.has(t.id)) {
        seen.add(t.id);
        picked.push(t);
        if (picked.length >= maxTracks) break;
      }
    }
  }

  return {
    name: (parsed && typeof parsed.name === 'string' && parsed.name.trim()) || defaultPlaylistName(prompt),
    description: (parsed && typeof parsed.description === 'string' && parsed.description.trim()) || String(prompt || '').trim(),
    tracks: picked,
    virtualDj: Boolean(virtualDj),
    djStyle,
    source
  };
}

function fallbackDjIntro(prevTrack, nextTrack) {
  if (!nextTrack) return '';
  const yearBit = nextTrack.year ? ` from ${nextTrack.year}` : '';
  const dirBit = nextTrack.artist && nextTrack.artist !== 'Unknown Director' ? ` directed by ${nextTrack.artist}` : '';
  if (prevTrack && prevTrack.title) {
    return `That was ${prevTrack.title}. Dim the lights — our next feature is ${nextTrack.title}${dirBit}${yearBit}.`;
  }
  return `Welcome to the theater. Tonight's feature presentation is ${nextTrack.title}${dirBit}${yearBit}.`;
}

async function generateDjIntros({
  tracks = [],
  playlistName = '',
  djStyle = 'warm classic cinema host',
  askFn = null
} = {}) {
  const list = (Array.isArray(tracks) ? tracks : []).filter(t => t && t.id);
  if (list.length === 0) return { intros: {}, source: 'empty' };

  const transitions = list.map((t, i) => {
    const prev = i > 0 ? list[i - 1] : null;
    const prevDesc = prev ? `after "${prev.title}" (dir. ${prev.artist || 'Unknown'})` : 'opening the screening';
    return `${i + 1}. [${t.id}] Intro ${prevDesc} -> into "${t.title}" directed by ${t.artist || 'Unknown'}${t.album ? ` (${t.album})` : ''}${t.year ? `, ${t.year}` : ''}${t.genre ? `, ${t.genre}` : ''}`;
  }).join('\n');

  const aiPrompt = [
    'You are the Virtual Cinema Host in the RobOS Movie Player.',
    `Persona / style: ${djStyle}.`,
    playlistName ? `Watchlist / Marathon: "${playlistName}".` : '',
    'Write one short, natural spoken cinema intro (1-2 sentences, 12-28 words, no stage directions, no markdown, no quotes) for each upcoming film below.',
    '',
    transitions,
    '',
    'Respond with ONLY a JSON object mapping each movie ID to its spoken intro line:',
    '{"intros":{"trackId":"Spoken cinema intro line..."}}'
  ].filter(Boolean).join('\n');

  const ask = askFn || (aiAgent && typeof aiAgent.ask === 'function' ? (p) => aiAgent.ask(p, { timeout: 45000 }) : null);
  const intros = {};
  let source = 'fallback';

  if (ask) {
    try {
      const res = await ask(aiPrompt);
      if (res && res.ok && res.text) {
        const parsed = extractJsonObject(res.text);
        const map = (parsed && typeof parsed.intros === 'object' && parsed.intros) || parsed;
        if (map && typeof map === 'object') {
          for (const t of list) {
            if (typeof map[t.id] === 'string' && map[t.id].trim()) {
              intros[t.id] = map[t.id].trim();
            }
          }
          if (Object.keys(intros).length > 0) {
            source = res.provider ? `ai:${res.provider}` : 'ai';
          }
        }
      }
    } catch (_) {}
  }

  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    if (!intros[t.id]) {
      intros[t.id] = fallbackDjIntro(i > 0 ? list[i - 1] : null, t);
    }
  }

  return { intros, source };
}

module.exports = {
  generateAiPlaylist,
  generateDjIntros,
  scoreCandidates,
  extractJsonObject,
  fallbackDjIntro
};

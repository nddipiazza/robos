'use strict';

/**
 * RobOS Nabu Voice Command & Media Router
 * ----------------------------------------
 * Connects "Hello Nabu / Okay Nabu -> {command}" on the Home Assistant Voice PE
 * (NC-VK-9727) to:
 *   1. RobOS Audio Player (best-match fuzzy search across ~/.config/robos/audio-library.json)
 *   2. RobOS Movie Player (best-match fuzzy search across ~/.config/robos/movie-library.json)
 *   3. Media transport controls (pause, resume, next, previous)
 *   4. All 48 RobOS Voice Skills + AI Coding Agent fallback (packages/voice-prompt/lib/skills-executor.js)
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const WORD_NUMBERS = {
  one: '1', two: '2', three: '3', four: '4', five: '5',
  six: '6', seven: '7', eight: '8', nine: '9', ten: '10',
  i: '1', ii: '2', iii: '3', iv: '4', v: '5',
};

function foldText(str) {
  return String(str || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeNumberTokens(str) {
  return foldText(str)
    .split(' ')
    .filter(Boolean)
    .map(tok => WORD_NUMBERS[tok] || tok)
    .join(' ');
}

/**
 * Strip wake words ("Hello Nabu", "Okay Nabu", "Hey Nabu", "Hello RobOS", etc.)
 * and polite prefixes from the start of a voice transcript.
 */
function stripWakePhrase(rawText) {
  let s = String(rawText || '').trim();
  // Remove leading wake words repeatedly if spoken twice
  const wakeRegex = /^(?:(?:hello|hey|hi|okay|ok|yo)\s+)?(?:nabu|na\s+bu|naboo|robos|rob\s+os|row\s+bose|computer|assistant)\b[,.:;!\-\s]*/i;
  for (let i = 0; i < 2; i++) {
    s = s.replace(wakeRegex, '').trim();
  }
  s = s.replace(/^(?:can\s+you\s+|could\s+you\s+|would\s+you\s+)?(?:please\s+)?/i, '').trim();
  return s;
}

/**
 * Bounded Levenshtein edit distance for fuzzy token matching (handles Whisper
 * spelling differences like "tranquility" vs "tranquillity").
 */
function editDistance(a, b, maxDist = 3) {
  if (a === b) return 0;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > maxDist) return maxDist + 1;
  const dp = Array.from({ length: lb + 1 }, (_, j) => j);
  for (let i = 1; i <= la; i++) {
    let prev = dp[0];
    dp[0] = i;
    let rowMin = dp[0];
    for (let j = 1; j <= lb; j++) {
      const temp = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = temp;
      if (dp[j] < rowMin) rowMin = dp[j];
    }
    if (rowMin > maxDist) return maxDist + 1;
  }
  return dp[lb];
}

function tokenSimilarity(qTok, targetTokens) {
  if (!qTok || !targetTokens.length) return 0;
  let best = 0;
  for (const tTok of targetTokens) {
    if (tTok === qTok) return 1.0;
    if (tTok.length >= 4 && qTok.length >= 4) {
      if (tTok.startsWith(qTok) || qTok.startsWith(tTok)) {
        best = Math.max(best, 0.88);
        continue;
      }
      const maxEdit = qTok.length >= 7 ? 2 : 1;
      const dist = editDistance(qTok, tTok, maxEdit);
      if (dist <= maxEdit) {
        const sim = 1 - dist / Math.max(qTok.length, tTok.length);
        best = Math.max(best, sim);
      }
    }
  }
  return best;
}

const AUDIO_STOP_WORDS = new Set([
  'play', 'playing', 'put', 'on', 'some', 'a', 'an', 'the', 'music', 'song', 'songs',
  'track', 'tracks', 'tune', 'tunes', 'by', 'from', 'artist', 'band', 'album', 'record',
  'listen', 'to', 'for', 'me', 'shuffle', 'shuffling', 'in', 'audio', 'player', 'speaker',
  'here', 'now', 'please',
]);

const MOVIE_STOP_WORDS = new Set([
  'play', 'playing', 'watch', 'watching', 'put', 'on', 'some', 'a', 'an', 'the',
  'movie', 'movies', 'film', 'films', 'video', 'show', 'episode', 'in', 'movie',
  'player', 'tv', 'for', 'me', 'now', 'please',
]);

/**
 * Extract the clean search query and flags from a spoken media command.
 */
function parseMediaQuery(cleanedCommand, kind = 'audio') {
  const raw = foldText(cleanedCommand);
  const shuffle = /\b(?:shuffle|shuffling|random|some)\b/i.test(raw);
  const onSpeaker = /\b(?:on\s+(?:the\s+)?speaker|right\s+here|out\s+loud)\b/i.test(raw);
  const explicitAlbum = /\b(?:album|record)\b/i.test(raw);
  const explicitArtist = /\b(?:artist|band|songs?\s+by|music\s+by)\b/i.test(raw);

  // Strip leading verb phrases ("play some", "put on the movie", "listen to", "watch", etc.)
  let stripped = raw
    .replace(/^(?:play|watch|put\s+on|start|queue|listen\s+to|shuffle)\s+/i, '')
    .replace(/^(?:some|a|an|the)\s+/i, '')
    .replace(/^(?:music|songs?|tracks?|album|artist|band|movie|film|video|show)\s+(?:called\s+|named\s+|by\s+|from\s+)?/i, '')
    .replace(/\s+(?:on\s+(?:the\s+)?speaker|in\s+(?:the\s+)?(?:robos\s+)?(?:audio|movie)\s+player|for\s+me|right\s+now|please)$/i, '')
    .trim();

  const stopSet = kind === 'movie' ? MOVIE_STOP_WORDS : AUDIO_STOP_WORDS;
  const tokens = normalizeNumberTokens(stripped)
    .split(' ')
    .filter(t => t && (!stopSet.has(t) || stripped.split(' ').length <= 2));

  const queryPhrase = tokens.join(' ').trim() || normalizeNumberTokens(stripped);
  return {
    queryPhrase,
    tokens: queryPhrase.split(' ').filter(Boolean),
    shuffle,
    onSpeaker,
    explicitAlbum,
    explicitArtist,
  };
}

/**
 * Score and rank tracks in a library (audio-library.json or movie-library.json)
 * against a spoken query.
 */
function findBestMediaMatches(cleanedCommand, tracks = [], { kind = 'audio', limit = 35 } = {}) {
  const list = Array.isArray(tracks) ? tracks.filter(Boolean) : [];
  if (!list.length) {
    return { ok: false, error: `Your ${kind === 'movie' ? 'movie' : 'music'} library is empty.` };
  }

  const parsed = parseMediaQuery(cleanedCommand, kind);
  const qPhrase = parsed.queryPhrase;
  const qTokens = parsed.tokens;

  if (!qPhrase || !qTokens.length) {
    // User just said "play some music" -> return a shuffled selection from the library
    const picks = [...list].sort(() => Math.random() - 0.5).slice(0, limit);
    return {
      ok: true,
      matchType: 'library-shuffle',
      score: 50,
      bestTrack: picks[0],
      tracks: picks,
      shuffle: true,
      onSpeaker: parsed.onSpeaker,
      summaryText: `Shuffling ${picks.length} tracks from your library, starting with "${picks[0].title}" by ${picks[0].artist || 'Unknown'}`,
    };
  }

  const scored = [];
  for (const t of list) {
    const titleNorm = normalizeNumberTokens(t.title || '');
    const artistNorm = normalizeNumberTokens(t.artist || t.albumArtist || '');
    const albumNorm = normalizeNumberTokens(t.album || t.seriesTitle || '');
    const genreNorm = normalizeNumberTokens(t.genre || '');
    const yearStr = t.year ? String(t.year) : '';

    const titleTokens = titleNorm.split(' ').filter(Boolean);
    const artistTokens = artistNorm.split(' ').filter(Boolean);
    const albumTokens = albumNorm.split(' ').filter(Boolean);
    const genreTokens = genreNorm.split(' ').filter(Boolean);
    const allTokens = [...titleTokens, ...artistTokens, ...albumTokens, ...genreTokens];

    let score = 0;
    let fieldHit = 'none';

    // 1. Exact full-field matches
    if (titleNorm && titleNorm === qPhrase) {
      score += 130;
      fieldHit = 'title';
    } else if (artistNorm && artistNorm === qPhrase) {
      score += 120;
      fieldHit = 'artist';
    } else if (albumNorm && albumNorm === qPhrase) {
      score += 115;
      fieldHit = 'album';
    } else if (`${titleNorm} ${artistNorm}`.trim() === qPhrase || `${artistNorm} ${titleNorm}`.trim() === qPhrase) {
      score += 135;
      fieldHit = 'title';
    }

    // 2. Whole-phrase prefix or substring match
    if (score < 110 && qPhrase.length >= 3) {
      if (titleNorm.startsWith(qPhrase) || titleNorm.includes(` ${qPhrase}`)) {
        score += 80;
        if (fieldHit === 'none') fieldHit = 'title';
      }
      if (artistNorm.startsWith(qPhrase) || artistNorm.includes(` ${qPhrase}`)) {
        score += 78;
        if (fieldHit === 'none') fieldHit = 'artist';
      }
      if (albumNorm.startsWith(qPhrase) || albumNorm.includes(` ${qPhrase}`)) {
        score += 72;
        if (fieldHit === 'none') fieldHit = 'album';
      }
      if (genreNorm && (genreNorm === qPhrase || genreNorm.includes(qPhrase))) {
        score += 65;
        if (fieldHit === 'none') fieldHit = 'genre';
      }
    }

    // 3. Per-token fuzzy similarity across title, artist, album, genre
    let matchedTokenCount = 0;
    let titleSimSum = 0;
    let artistSimSum = 0;
    let albumSimSum = 0;
    let genreSimSum = 0;

    for (const qt of qTokens) {
      const tSim = tokenSimilarity(qt, titleTokens);
      const arSim = tokenSimilarity(qt, artistTokens);
      const alSim = tokenSimilarity(qt, albumTokens);
      const gSim = tokenSimilarity(qt, genreTokens);
      const ySim = (yearStr && qt === yearStr) ? 1.0 : 0;

      const bestTokSim = Math.max(tSim, arSim, alSim, gSim, ySim);
      if (bestTokSim >= 0.72) matchedTokenCount++;

      titleSimSum += tSim;
      artistSimSum += arSim;
      albumSimSum += alSim;
      genreSimSum += gSim;
    }

    const tokenCoverage = matchedTokenCount / qTokens.length;
    const avgTitleSim = titleSimSum / qTokens.length;
    const avgArtistSim = artistSimSum / qTokens.length;
    const avgAlbumSim = albumSimSum / qTokens.length;
    const avgGenreSim = genreSimSum / qTokens.length;

    score += tokenCoverage * 40;
    score += avgTitleSim * 38;
    score += avgArtistSim * 36;
    score += avgAlbumSim * 30;
    score += avgGenreSim * 22;

    if (fieldHit === 'none') {
      const maxAvg = Math.max(avgTitleSim, avgArtistSim, avgAlbumSim, avgGenreSim);
      if (maxAvg >= 0.7) {
        if (maxAvg === avgArtistSim && avgArtistSim > avgTitleSim) fieldHit = 'artist';
        else if (maxAvg === avgAlbumSim && avgAlbumSim > avgTitleSim) fieldHit = 'album';
        else if (maxAvg === avgTitleSim) fieldHit = 'title';
        else fieldHit = 'genre';
      }
    }

    if (parsed.explicitArtist && avgArtistSim >= 0.7) {
      score += 20;
      fieldHit = 'artist';
    }
    if (parsed.explicitAlbum && avgAlbumSim >= 0.7) {
      score += 20;
      fieldHit = 'album';
    }

    if (score >= 32) {
      scored.push({ track: t, score, fieldHit, artistNorm, albumNorm, titleNorm });
    }
  }

  if (!scored.length) {
    return {
      ok: false,
      score: 0,
      queryPhrase: qPhrase,
      error: `Could not find any ${kind === 'movie' ? 'movies' : 'songs'} matching "${qPhrase}" in your library.`,
    };
  }

  scored.sort((a, b) => b.score - a.score);
  const top = scored[0];

  if (kind === 'movie') {
    const moviePicks = scored.slice(0, 10).map(s => s.track);
    return {
      ok: true,
      matchType: 'movie',
      score: top.score,
      bestTrack: top.track,
      tracks: [top.track],
      alternatives: moviePicks.slice(1, 5),
      shuffle: false,
      onSpeaker: false,
      summaryText: `Playing "${top.track.title}"${top.track.year ? ` (${top.track.year})` : ''} in RobOS Movie Player`,
    };
  }

  // For Audio: if the top hit is an artist (e.g. "play some Dark Tranquillity"),
  // gather all tracks by that artist!
  if (top.fieldHit === 'artist' && top.artistNorm) {
    const artistTracks = scored
      .filter(s => s.artistNorm === top.artistNorm)
      .map(s => s.track);
    const tracksOut = (parsed.shuffle ? [...artistTracks].sort(() => Math.random() - 0.5) : artistTracks).slice(0, limit);
    const first = tracksOut[0] || top.track;
    return {
      ok: true,
      matchType: 'artist',
      score: top.score,
      bestTrack: first,
      tracks: tracksOut,
      shuffle: parsed.shuffle,
      onSpeaker: parsed.onSpeaker,
      summaryText: `Playing ${tracksOut.length} songs by ${first.artist || top.track.artist}, starting with "${first.title}"`,
    };
  }

  // If the top hit is an album (e.g. "play Atoma"), gather all tracks on that album in track order!
  if (top.fieldHit === 'album' && top.albumNorm) {
    const albumTracks = scored
      .filter(s => s.albumNorm === top.albumNorm)
      .map(s => s.track)
      .sort((a, b) => (Number(a.trackNumber) || 999) - (Number(b.trackNumber) || 999));
    const tracksOut = albumTracks.slice(0, limit);
    const first = tracksOut[0] || top.track;
    return {
      ok: true,
      matchType: 'album',
      score: top.score,
      bestTrack: first,
      tracks: tracksOut,
      shuffle: false,
      onSpeaker: parsed.onSpeaker,
      summaryText: `Playing album "${first.album}" by ${first.artist || 'Unknown'} (${tracksOut.length} tracks), starting with "${first.title}"`,
    };
  }

  // Specific song match: put the best song first, followed by other songs by the same artist/album
  const companionTracks = scored
    .slice(1)
    .filter(s => (top.artistNorm && s.artistNorm === top.artistNorm) || s.score >= 60)
    .map(s => s.track)
    .slice(0, limit - 1);
  const tracksOut = [top.track, ...companionTracks];
  return {
    ok: true,
    matchType: 'song',
    score: top.score,
    bestTrack: top.track,
    tracks: tracksOut,
    shuffle: false,
    onSpeaker: parsed.onSpeaker,
    summaryText: `Playing "${top.track.title}" by ${top.track.artist || 'Unknown'}`,
  };
}

function loadLibraryTracks(kind = 'audio', configDir = path.join(os.homedir(), '.config', 'robos')) {
  const file = path.join(configDir, kind === 'movie' ? 'movie-library.json' : 'audio-library.json');
  try {
    if (!fs.existsSync(file)) return [];
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(data.tracks) ? data.tracks : [];
  } catch {
    return [];
  }
}

/**
 * Ensure `audio-player` or `movie-player` is running and return its control client.
 */
async function ensureMediaPlayerRunning(appId, createClient, { configDir, timeoutMs = 9500 } = {}) {
  const client = createClient({ configDir });
  if (client.running()) {
    const st = await client.status();
    if (st && st.ok) return client;
  }

  // Spawn the Electron app in the background
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const appDir = path.join(repoRoot, 'packages', appId);
  let electronBin = 'electron';
  const candidateBins = [
    path.join(appDir, 'node_modules', '.bin', 'electron'),
    path.join(repoRoot, 'node_modules', '.bin', 'electron'),
    path.join(repoRoot, 'packages', 'voice-prompt', 'node_modules', 'electron', 'dist', 'electron'),
    path.join(repoRoot, 'packages', 'app-manager', 'node_modules', 'electron', 'dist', 'electron'),
  ];
  for (const bin of candidateBins) {
    if (fs.existsSync(bin)) {
      electronBin = bin;
      break;
    }
  }

  try {
    const child = spawn(electronBin, [appDir, '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, DISPLAY: process.env.DISPLAY || ':0' },
    });
    child.unref();
  } catch (err) {
    console.warn(`[NabuRouter] Could not launch ${appId}:`, err.message);
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 280));
    const c = createClient({ configDir });
    if (c.running()) {
      const st = await c.status();
      if (st && st.ok) return c;
    }
  }
  return createClient({ configDir });
}

/**
 * Classify whether a cleaned voice command is a media transport command, a movie play
 * command, a music play command, or a general RobOS skill / AI agent request.
 */
function classifyVoiceCommand(cleanedText) {
  const q = foldText(cleanedText);
  if (!q) return { type: 'empty' };

  // 1. Transport controls
  if (/^(?:pause|pause\s+(?:the\s+)?(?:music|song|movie|video|playback)|hold\s+on)$/.test(q)) {
    return { type: 'transport', action: 'pause' };
  }
  if (/^(?:resume|continue|unpause|(?:resume|continue)\s+(?:the\s+)?(?:music|song|movie|video|playback)|keep\s+playing)$/.test(q)) {
    return { type: 'transport', action: 'resume' };
  }
  if (/^(?:next|skip|next\s+(?:song|track|movie|video)|skip\s+(?:this\s+)?(?:song|track))$/.test(q)) {
    return { type: 'transport', action: 'next' };
  }
  if (/^(?:previous|prev|go\s+back|previous\s+(?:song|track|movie|video)|last\s+(?:song|track))$/.test(q)) {
    return { type: 'transport', action: 'previous' };
  }

  // 2. Explicit Movie playback ("play the movie Dune", "watch Scary Movie 2", "put on the film ...")
  if (/^(?:watch|play\s+(?:the\s+)?(?:movie|film|video|show)|put\s+on\s+(?:the\s+)?(?:movie|film))\b/.test(q) ||
      /\b(?:in\s+(?:robos\s+)?movie\s+player)\b/.test(q)) {
    return { type: 'play-movie', query: cleanedText };
  }

  // 3. Music / Media playback ("play some Dark Tranquillity", "play Caves and Embers", "listen to ...", "shuffle ...")
  if (/^(?:play|listen\s+to|put\s+on|shuffle|queue)\b/.test(q)) {
    // Avoid intercepting "play tabletop" or "play game"
    if (!/\b(?:game|crpg|quest\s+warrior|starfall|party\s+game)\b/.test(q)) {
      return { type: 'play-media', query: cleanedText };
    }
  }

  return { type: 'robos-skill', query: cleanedText };
}

/**
 * Execute any spoken "Hello Nabu / Okay Nabu -> {command}" across Audio Player,
 * Movie Player, and all 48 RobOS Voice Skills + AI Agent.
 */
async function executeNabuCommand(rawTranscript, {
  configDir = path.join(os.homedir(), '.config', 'robos'),
  autoLaunchPlayers = process.env.ROBOS_TEST !== '1',
  skillsExecutor = null,
} = {}) {
  const cleaned = stripWakePhrase(rawTranscript);
  if (!cleaned) {
    return {
      ok: false,
      skill: 'none',
      cleanedCommand: '',
      response: 'I am listening. How can I help you?',
    };
  }

  const intent = classifyVoiceCommand(cleaned);
  const { createAudioPlayerClient } = require('../../audio-player/lib/control-server');
  const { createAudioPlayerClient: createMoviePlayerClient } = require('../../movie-player/lib/control-server');

  // ── 1. Transport controls (pause / resume / next / previous) ────────────────
  if (intent.type === 'transport') {
    const audioClient = createAudioPlayerClient({ configDir });
    const movieClient = createMoviePlayerClient({ configDir });
    let targetClient = null;
    let targetName = 'Audio Player';

    if (audioClient.running()) targetClient = audioClient;
    else if (movieClient.running()) {
      targetClient = movieClient;
      targetName = 'Movie Player';
    }

    if (!targetClient) {
      return {
        ok: false,
        skill: `media-${intent.action}`,
        cleanedCommand: cleaned,
        response: 'Neither Audio Player nor Movie Player is currently running.',
      };
    }

    const res = await targetClient[intent.action]();
    const actionLabels = {
      pause: `Paused ${targetName}.`,
      resume: `Resumed playback in ${targetName}.`,
      next: `Skipped to the next track in ${targetName}.`,
      previous: `Went back to the previous track in ${targetName}.`,
    };
    return {
      ok: Boolean(res && res.ok !== false),
      skill: `media-${intent.action}`,
      cleanedCommand: cleaned,
      response: actionLabels[intent.action] || `Updated ${targetName}.`,
      data: res,
    };
  }

  // ── 2. Movie & Music Library Best-Match Playback ────────────────────────────
  if (intent.type === 'play-movie' || intent.type === 'play-media') {
    const audioTracks = loadLibraryTracks('audio', configDir);
    const movieTracks = loadLibraryTracks('movie', configDir);

    let chosenKind = intent.type === 'play-movie' ? 'movie' : 'audio';
    let match = findBestMediaMatches(
      cleaned,
      chosenKind === 'movie' ? movieTracks : audioTracks,
      { kind: chosenKind }
    );

    // If user said "play Dune" (ambiguous) and audio had no strong match while movies has a strong match, switch to movie!
    if (intent.type === 'play-media' && (!match.ok || match.score < 55) && movieTracks.length > 0) {
      const movieMatch = findBestMediaMatches(cleaned, movieTracks, { kind: 'movie' });
      if (movieMatch.ok && movieMatch.score >= Math.max(70, (match.score || 0) + 15)) {
        chosenKind = 'movie';
        match = movieMatch;
      }
    }

    if (!match.ok) {
      return {
        ok: false,
        skill: chosenKind === 'movie' ? 'movie-play' : 'audio-play',
        cleanedCommand: cleaned,
        response: match.error || `I couldn't find that in your ${chosenKind} library.`,
      };
    }

    const appId = chosenKind === 'movie' ? 'movie-player' : 'audio-player';
    const factory = chosenKind === 'movie' ? createMoviePlayerClient : createAudioPlayerClient;
    let playResult = null;

    if (autoLaunchPlayers) {
      const client = await ensureMediaPlayerRunning(appId, factory, { configDir });
      playResult = await client.play({
        trackIds: match.tracks.map(t => t.id),
        shuffle: Boolean(match.shuffle),
      });
    }

    return {
      ok: true,
      skill: chosenKind === 'movie' ? 'movie-play' : 'audio-play',
      cleanedCommand: cleaned,
      matchType: match.matchType,
      score: Math.round(match.score),
      bestTrack: match.bestTrack,
      trackCount: match.tracks.length,
      onSpeaker: Boolean(match.onSpeaker),
      playResult,
      response: match.summaryText,
      data: {
        kind: chosenKind,
        matchType: match.matchType,
        score: Math.round(match.score),
        bestTrack: match.bestTrack,
        trackIds: match.tracks.map(t => t.id),
      },
    };
  }

  // ── 3. All 48 RobOS Voice Skills + AI Coding Agent Fallback ─────────────────
  let executor = skillsExecutor;
  if (!executor) {
    const { SkillsExecutor } = require('../../voice-prompt/lib/skills-executor');
    executor = new SkillsExecutor();
  }
  const skillRes = await executor.executeCommand(cleaned, { source: 'home-assistant-voice-pe' });
  return {
    ...skillRes,
    cleanedCommand: cleaned,
  };
}

module.exports = {
  stripWakePhrase,
  parseMediaQuery,
  findBestMediaMatches,
  loadLibraryTracks,
  classifyVoiceCommand,
  executeNabuCommand,
};

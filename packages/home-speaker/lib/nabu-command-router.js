'use strict';

/**
 * RobOS Nabu Voice Command & Natural Language Media Router
 * --------------------------------------------------------
 * Connects "Hello Nabu / Okay Nabu -> {command}" on the Home Assistant Voice PE
 * (NC-VK-9727) to:
 *   1. RobOS Audio Player (NLP + Phonetic + IDF + Jaro-Winkler search across ~/.config/robos/audio-library.json)
 *   2. RobOS Movie Player (NLP + Phonetic + IDF + Jaro-Winkler search across ~/.config/robos/movie-library.json)
 *   3. Media transport controls (pause, resume, next, previous)
 *   4. All 48 RobOS Voice Skills + AI Coding Agent fallback (packages/voice-prompt/lib/skills-executor.js)
 *
 * Designed specifically to handle ASR coarticulation and phonetic mishearings
 * (e.g. Whisper hearing "Play some..." or "Play Slayer..." as "Place some..." or
 * "Place Slayer...", or "Seasons in the Abyss" as "seasons of the Abyss", while
 * preserving proper-noun band names like "In Flames" or "At the Gates").
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

// Common English function words that have low standalone weight unless part of an exact phrase match
const LOW_IDF_WORDS = new Set(['the', 'a', 'an', 'of', 'in', 'on', 'at', 'to', 'for', 'and', 'with', 'from', 'by']);

// Phonetic / coarticulation variants of "play" (/pleɪ/) produced by Whisper when followed by /s/, /t/, /d/
const PLAY_VERB_VARIANTS = new Set([
  'play', 'playing', 'plays', 'played', 'place', 'placed', 'places',
  'plate', 'plates', 'plane', 'plain', 'plague', 'plea', 'pray',
  'player', 'clay', 'lay', 'spin', 'jam', 'queue', 'shuffle', 'shuffling',
]);

function foldText(str) {
  return String(str || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/&/g, ' and ')
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
  const wakeRegex = /^(?:(?:hello|hey|hi|okay|ok|yo)\s+)?(?:nabu|na\s+bu|naboo|robos|rob\s+os|row\s+bose|computer|assistant)\b[,.:;!\-\s]*/i;
  for (let i = 0; i < 2; i++) {
    s = s.replace(wakeRegex, '').trim();
  }
  s = s.replace(/^(?:can\s+you\s+|could\s+you\s+|would\s+you\s+)?(?:please\s+)?/i, '').trim();
  return s;
}

/**
 * Phonetic key (Metaphone-inspired) so words that sound alike in English
 * ("tranquility" vs "tranquillity", "play" vs "place" prefix, "kaves" vs "caves")
 * map to similar phonetic skeletons.
 */
function phoneticCode(word) {
  const w = foldText(word).replace(/[^a-z0-9]/g, '');
  if (!w) return '';
  if (/^\d+$/.test(w)) return w;
  let s = w
    .replace(/([a-z])\1+/g, '$1') // collapse doubled letters ("tranquillity" -> "tranquility")
    .replace(/^kn|^gn|^pn|^wr/, n => n.slice(1))
    .replace(/^wh/, 'w')
    .replace(/^x/, 's')
    .replace(/ph/g, 'f')
    .replace(/ck/g, 'k')
    .replace(/sch/g, 'sk')
    .replace(/sh/g, 'x')
    .replace(/ch/g, 'x')
    .replace(/th/g, '0')
    .replace(/dg/g, 'j')
    .replace(/c(?=[eiy])/g, 's')
    .replace(/c/g, 'k')
    .replace(/q/g, 'k')
    .replace(/z/g, 's')
    .replace(/v/g, 'f');
  const first = s[0];
  const rest = s.slice(1).replace(/[aeiouy]/g, '');
  return (first + rest).slice(0, 8);
}

/**
 * Jaro-Winkler similarity in [0, 1] between two normalized strings.
 * Gives higher scores to strings that share prefixes and character transpositions.
 */
function jaroWinkler(s1, s2) {
  if (s1 === s2) return 1.0;
  const len1 = s1.length;
  const len2 = s2.length;
  if (!len1 || !len2) return 0.0;

  const matchDistance = Math.max(0, Math.floor(Math.max(len1, len2) / 2) - 1);
  const s1Matches = new Array(len1).fill(false);
  const s2Matches = new Array(len2).fill(false);

  let matches = 0;
  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, len2);
    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }
  if (!matches) return 0.0;

  let t = 0;
  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) t++;
    k++;
  }
  t /= 2;

  const jaro = (matches / len1 + matches / len2 + (matches - t) / matches) / 3;
  let prefix = 0;
  for (let i = 0; i < Math.min(4, len1, len2); i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }
  return jaro + prefix * 0.1 * (1 - jaro);
}

/**
 * Bounded Levenshtein edit distance for token matching.
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

/**
 * Compute similarity in [0, 1] between a query token and a list of target tokens
 * using exact match, singular/plural stem match, phonetic Metaphone match,
 * Jaro-Winkler, and bounded Levenshtein distance.
 */
function tokenSimilarity(qTok, targetTokens) {
  if (!qTok || !targetTokens.length) return 0;
  const qPhone = phoneticCode(qTok);
  const qStem = qTok.length > 3 && qTok.endsWith('s') ? qTok.slice(0, -1) : qTok;
  let best = 0;

  for (const tTok of targetTokens) {
    if (tTok === qTok) return 1.0;
    const tStem = tTok.length > 3 && tTok.endsWith('s') ? tTok.slice(0, -1) : tTok;
    if (qStem === tStem && qStem.length >= 3) {
      best = Math.max(best, 0.95);
      continue;
    }
    if (qPhone && qPhone.length >= 3 && qPhone === phoneticCode(tTok)) {
      best = Math.max(best, 0.92);
    }
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
      } else {
        const jw = jaroWinkler(qTok, tTok);
        if (jw >= 0.86) best = Math.max(best, jw * 0.9);
      }
    }
  }
  return best;
}

/**
 * Check if a command is a genuine Tabletop Quest Editor command
 * (e.g. "place 2 skeletons in room 1", "put a chest in room 3").
 * Prevents "Place some Dark Tranquillity" or "Place Slayer..." from being hijacked by Tabletop!
 */
function isGenuineTabletopCommand(text) {
  const norm = foldText(text);
  const hasTabletopTarget = /\b(?:room|tile|corridor|hallway)\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/i.test(norm);
  const hasTabletopEntity = /\b(?:skeletons?|goblins?|orcs?|zombies?|mumm(?:y|ies)|fimirs?|chaos\s+warriors?|gargoyles?|werewol(?:f|ves)|chests?|throne|bookcase|torture\s+rack|pit\s+trap|spear\s+trap|falling\s+rock|secret\s+door)\b/i.test(norm);
  return hasTabletopTarget && hasTabletopEntity;
}

/**
 * Extract the clean search query and flags from a spoken media command.
 * IMPORTANT: Preserves internal prepositions ("in", "of", "the", "at") so proper
 * nouns like "In Flames", "At the Gates", and "Seasons in the Abyss" stay intact!
 */
function parseMediaQuery(cleanedCommand, kind = 'audio') {
  const raw = foldText(cleanedCommand);
  const shuffle = /\b(?:shuffle|shuffling|random|some)\b/i.test(raw);
  const onSpeaker = /\b(?:on\s+(?:the\s+)?speaker|right\s+here|out\s+loud)\b/i.test(raw);
  const explicitAlbum = /\b(?:album|record)\b/i.test(raw);
  const explicitArtist = /\b(?:artist|band|songs?\s+by|music\s+by)\b/i.test(raw);

  // Strip ONLY leading verb phrases (including Whisper phonetic variants like "place some", "plays", "played", "plate")
  const verbPattern = /^(?:play|playing|plays|played|place|placed|places|plate|plates|plane|plain|plague|plea|pray|watch|watching|put\s+on|start|queue|listen\s+to|shuffle|shuffling|hear|spin)\s+/i;
  let stripped = raw
    .replace(verbPattern, '')
    .replace(/^(?:some\s+(?:music\s+by\s+|songs?\s+by\s+)?|a\s+(?:song|track|movie|film)\s+(?:by\s+|called\s+|named\s+)?|the\s+(?:song|track|album|band|artist|movie|film|show)\s+(?:by\s+|called\s+|named\s+)?)/i, '')
    .replace(/^(?:music|songs?|tracks?|album|artist|band|movie|film|video|show)\s+(?:called\s+|named\s+|by\s+|from\s+)/i, '')
    .replace(/\s+(?:on\s+(?:the\s+)?speaker|in\s+(?:the\s+)?(?:robos\s+)?(?:audio|movie)\s+player|for\s+me|right\s+now|please)$/i, '')
    .trim();

  // If the user said "play some music" or "play music", stripped is just "music" / "songs"
  if (/^(?:music|songs?|tracks?|something|anything|tunes?)$/i.test(stripped)) {
    stripped = '';
  }

  const queryPhrase = normalizeNumberTokens(stripped);
  const allTokens = queryPhrase.split(' ').filter(Boolean);
  // Keep all tokens for 1-2 word proper nouns (like "In Flames" or "The Who"); only filter low-IDF prepositions on 3+ word queries
  const filteredTokens = allTokens.length > 2 ? allTokens.filter(t => !LOW_IDF_WORDS.has(t)) : allTokens;
  const contentTokens = filteredTokens.length ? filteredTokens : allTokens;

  return {
    queryPhrase,
    tokens: allTokens,
    contentTokens: contentTokens.length ? contentTokens : allTokens,
    shuffle,
    onSpeaker,
    explicitAlbum,
    explicitArtist,
  };
}

/**
 * Score and rank tracks in a library (audio-library.json or movie-library.json)
 * against a spoken query using Exact Phrase + Jaro-Winkler + Phonetic Metaphone +
 * Combined (Artist + Title / Artist + Album) matching.
 */
function findBestMediaMatches(cleanedCommand, tracks = [], { kind = 'audio', limit = 35 } = {}) {
  const list = Array.isArray(tracks) ? tracks.filter(Boolean) : [];
  if (!list.length) {
    return { ok: false, error: `Your ${kind === 'movie' ? 'movie' : 'music'} library is empty.` };
  }

  const parsed = parseMediaQuery(cleanedCommand, kind);
  const qPhrase = parsed.queryPhrase;
  const qTokens = parsed.tokens;
  const qContentTokens = parsed.contentTokens;

  if (!qPhrase || !qTokens.length) {
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

  const qPhoneticPhrase = qTokens.map(phoneticCode).join(' ');

  const scored = [];
  for (const t of list) {
    const titleNorm = normalizeNumberTokens(t.title || '');
    const artistNorm = normalizeNumberTokens(t.artist || t.albumArtist || '');
    const albumNorm = normalizeNumberTokens(t.album || t.seriesTitle || '');
    const genreNorm = normalizeNumberTokens(t.genre || '');
    const yearStr = t.year ? String(t.year) : '';

    const artistTitleNorm = `${artistNorm} ${titleNorm}`.trim();
    const titleArtistNorm = `${titleNorm} ${artistNorm}`.trim();
    const artistAlbumNorm = `${artistNorm} ${albumNorm}`.trim();

    const titleTokens = titleNorm.split(' ').filter(Boolean);
    const artistTokens = artistNorm.split(' ').filter(Boolean);
    const albumTokens = albumNorm.split(' ').filter(Boolean);
    const genreTokens = genreNorm.split(' ').filter(Boolean);
    const combinedTokens = [...artistTokens, ...titleTokens, ...albumTokens];

    let score = 0;
    let fieldHit = 'none';

    // 1. Exact full-field or exact phonetic full-field matches (highest priority: e.g. "in flames", "dark tranquility", "atoma")
    if (artistNorm && (artistNorm === qPhrase || artistTokens.map(phoneticCode).join(' ') === qPhoneticPhrase)) {
      score += 150;
      fieldHit = 'artist';
    } else if (titleNorm && (titleNorm === qPhrase || titleTokens.map(phoneticCode).join(' ') === qPhoneticPhrase)) {
      score += 155;
      fieldHit = 'title';
    } else if (albumNorm && (albumNorm === qPhrase || albumNorm.replace(/\s+\d{4}$/, '') === qPhrase)) {
      score += 145;
      fieldHit = 'album';
    } else if (artistTitleNorm === qPhrase || titleArtistNorm === qPhrase) {
      score += 165;
      fieldHit = 'title';
    } else if (artistAlbumNorm === qPhrase) {
      score += 160;
      fieldHit = 'album';
    }

    // 2. Whole-phrase prefix or word-boundary substring match
    if (score < 140 && qPhrase.length >= 3) {
      if (artistNorm && (` ${artistNorm} `.includes(` ${qPhrase} `) || artistNorm.startsWith(qPhrase))) {
        score += 95;
        if (fieldHit === 'none') fieldHit = 'artist';
      }
      if (titleNorm && (` ${titleNorm} `.includes(` ${qPhrase} `) || titleNorm.startsWith(qPhrase))) {
        score += 92;
        if (fieldHit === 'none') fieldHit = 'title';
      }
      if (albumNorm && (` ${albumNorm} `.includes(` ${qPhrase} `) || albumNorm.startsWith(qPhrase))) {
        score += 86;
        if (fieldHit === 'none') fieldHit = 'album';
      }
      if (genreNorm && (genreNorm === qPhrase || genreNorm.includes(qPhrase))) {
        score += 70;
        if (fieldHit === 'none') fieldHit = 'genre';
      }
    }

    // 3. Combined Artist + Song / Artist + Album match (e.g. "Slayer Seasons of the Abyss")
    // When user speaks both artist and song/album in one utterance, check if artist matches AND song/album matches!
    let artistMatchedInCombo = false;
    if (artistTokens.length > 0 && qContentTokens.length >= 2) {
      const artistTokenHits = artistTokens.filter(at => tokenSimilarity(at, qContentTokens) >= 0.85).length;
      if (artistTokenHits === artistTokens.length) {
        artistMatchedInCombo = true;
        // Remaining content tokens after removing the artist tokens
        const remTokens = qContentTokens.filter(qt => tokenSimilarity(qt, artistTokens) < 0.85);
        if (remTokens.length > 0) {
          const remTitleHits = remTokens.reduce((acc, rt) => acc + tokenSimilarity(rt, titleTokens), 0) / remTokens.length;
          const remAlbumHits = remTokens.reduce((acc, rt) => acc + tokenSimilarity(rt, albumTokens), 0) / remTokens.length;
          if (remTitleHits >= 0.75) {
            score += 65 + remTitleHits * 65;
            fieldHit = 'title';
          } else if (remAlbumHits >= 0.75) {
            score += 60 + remAlbumHits * 60;
            if (fieldHit !== 'title') fieldHit = 'album';
          }
        }
      }
    }

    // 4. Per-token fuzzy similarity (weighted by content vs low-IDF function words)
    let totalWeight = 0;
    let matchedWeight = 0;
    let contentMatched = 0;
    let titleSimSum = 0;
    let artistSimSum = 0;
    let albumSimSum = 0;
    let genreSimSum = 0;
    let combinedSimSum = 0;

    for (const qt of qTokens) {
      const isLowIdf = LOW_IDF_WORDS.has(qt) && qTokens.length > 2;
      const w = isLowIdf ? 0.25 : 1.0;
      totalWeight += w;

      const tSim = tokenSimilarity(qt, titleTokens);
      const arSim = tokenSimilarity(qt, artistTokens);
      const alSim = tokenSimilarity(qt, albumTokens);
      const gSim = tokenSimilarity(qt, genreTokens);
      const cSim = tokenSimilarity(qt, combinedTokens);
      const ySim = (yearStr && qt === yearStr) ? 1.0 : 0;

      const bestTokSim = Math.max(tSim, arSim, alSim, gSim, cSim, ySim);
      if (bestTokSim >= 0.78) {
        matchedWeight += w * bestTokSim;
        if (!isLowIdf) contentMatched++;
      }

      titleSimSum += w * tSim;
      artistSimSum += w * arSim;
      albumSimSum += w * alSim;
      genreSimSum += w * gSim;
      combinedSimSum += w * cSim;
    }

    const contentCoverage = qContentTokens.length ? contentMatched / qContentTokens.length : 1;
    // Reject weak partial matches where most of the requested proper noun is missing from the library
    // (e.g. "Slayer Seasons of the Abyss" matching only "Seasons", or "In Flames" matching only "Flame")
    if (qTokens.length >= 2 && score < 110 && contentCoverage < 0.65) {
      continue;
    }

    const normWeight = totalWeight || 1;
    const tokenCoverage = matchedWeight / normWeight;
    const avgTitleSim = titleSimSum / normWeight;
    const avgArtistSim = artistSimSum / normWeight;
    const avgAlbumSim = albumSimSum / normWeight;
    const avgGenreSim = genreSimSum / normWeight;
    const avgCombinedSim = combinedSimSum / normWeight;

    // Penalize partial single-word hits when the user asked for a multi-word proper noun (like "In Flames")
    const targetCoverageArtist = artistTokens.length
      ? artistTokens.reduce((acc, at) => acc + tokenSimilarity(at, qTokens), 0) / artistTokens.length
      : 0;

    score += tokenCoverage * 38;
    score += avgTitleSim * 35;
    score += (avgArtistSim * 0.6 + targetCoverageArtist * 0.4) * 38;
    score += avgAlbumSim * 28;
    score += avgCombinedSim * 25;
    score += avgGenreSim * 18;

    if (fieldHit === 'none') {
      if (artistMatchedInCombo) {
        fieldHit = avgTitleSim >= avgAlbumSim ? 'title' : 'album';
      } else {
        const maxAvg = Math.max(avgTitleSim, avgArtistSim, avgAlbumSim, avgGenreSim);
        if (maxAvg >= 0.68) {
          if (maxAvg === avgArtistSim && targetCoverageArtist >= 0.75) fieldHit = 'artist';
          else if (maxAvg === avgAlbumSim && avgAlbumSim > avgTitleSim) fieldHit = 'album';
          else if (maxAvg === avgTitleSim) fieldHit = 'title';
          else fieldHit = 'genre';
        }
      }
    }

    if (parsed.explicitArtist && avgArtistSim >= 0.7) {
      score += 25;
      fieldHit = 'artist';
    }
    if (parsed.explicitAlbum && avgAlbumSim >= 0.7) {
      score += 25;
      fieldHit = 'album';
    }

    if (score >= 65) {
      const artistPhoneticKey = artistTokens.map(phoneticCode).join(' ');
      scored.push({ track: t, score, fieldHit, artistNorm, artistPhoneticKey, albumNorm, titleNorm });
    }
  }

  if (!scored.length) {
    return {
      ok: false,
      score: 0,
      queryPhrase: qPhrase,
      error: `Could not find "${qPhrase}" in your ${kind === 'movie' ? 'movie' : 'music'} library.`,
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

  // Artist match (e.g. "play some Dark Tranquillity"): gather all tracks by that artist (unifying phonetic spelling variants)
  if (top.fieldHit === 'artist' && top.artistNorm) {
    const artistTracks = scored
      .filter(s => s.artistNorm === top.artistNorm || (top.artistPhoneticKey && s.artistPhoneticKey === top.artistPhoneticKey))
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

  // Album match (e.g. "play Atoma"): gather tracks on that album in track order
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

  // Specific song match: put the best song first, followed by other songs by the same artist
  const companionTracks = scored
    .slice(1)
    .filter(s => (top.artistNorm && s.artistNorm === top.artistNorm) || s.score >= 70)
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
 * command, a music play command (including phonetic ASR mishearings like "place some..."
 * or "place Slayer..."), or a general RobOS skill / AI agent request.
 */
function classifyVoiceCommand(cleanedText, { audioTracks = null, movieTracks = null } = {}) {
  const q = foldText(cleanedText);
  if (!q) return { type: 'empty' };

  const words = q.split(' ').filter(Boolean);
  const firstWord = words[0] || '';

  // 1. Transport controls (exact or phonetic Jaro-Winkler match)
  if (/^(?:pause|paws|pos|pause\s+(?:the\s+)?(?:music|song|movie|video|playback)|hold\s+on)$/.test(q)) {
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

  // 2. If it's a genuine Tabletop Quest Editor command ("place 2 skeletons in room 1"), let Tabletop handle it
  if (isGenuineTabletopCommand(q)) {
    return { type: 'robos-skill', query: cleanedText };
  }

  // 3. Explicit Movie playback ("play/place the movie Dune", "watch Scary Movie 2", "put on the film ...")
  const isPlayLikeVerb = PLAY_VERB_VARIANTS.has(firstWord) || jaroWinkler(firstWord, 'play') >= 0.80;
  if (/^(?:watch|wash)\b/.test(q) ||
      (isPlayLikeVerb && /\b(?:movie|film|video|cinema)\b/.test(q)) ||
      /\b(?:in\s+(?:robos\s+)?movie\s+player)\b/.test(q)) {
    return { type: 'play-movie', query: cleanedText };
  }

  // 4. Music / Media playback (including phonetic coarticulations: "place some dark tranquility", "place Slayer seasons of the abyss")
  if ((isPlayLikeVerb && words.length >= 2) || /^(?:listen\s+to|put\s+on)\b/.test(q)) {
    if (!/\b(?:game|crpg|quest\s+warrior|starfall|party\s+game)\b/.test(q)) {
      return { type: 'play-media', query: cleanedText };
    }
  }

  // 5. Library-Grounded Natural Language Fallback:
  // If the first word wasn't a known system skill verb ("open", "add", "list", "validate", "git", "what", "how", "why"),
  // check if the utterance strongly matches an entity in the user's audio or movie library!
  const isSystemVerb = /^(?:open|launch|add|create|list|show|view|validate|search|check|restart|read|what|who|where|when|why|how|is|are|can|tell)\b/.test(q);
  if (!isSystemVerb && (Array.isArray(audioTracks) || Array.isArray(movieTracks))) {
    const aMatch = Array.isArray(audioTracks) && audioTracks.length
      ? findBestMediaMatches(cleanedText, audioTracks, { kind: 'audio' })
      : null;
    const mMatch = Array.isArray(movieTracks) && movieTracks.length
      ? findBestMediaMatches(cleanedText, movieTracks, { kind: 'movie' })
      : null;

    if (aMatch && aMatch.ok && aMatch.score >= 115 && (!mMatch || aMatch.score >= (mMatch.score || 0))) {
      return { type: 'play-media', query: cleanedText };
    }
    if (mMatch && mMatch.ok && mMatch.score >= 120) {
      return { type: 'play-movie', query: cleanedText };
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

  const audioTracks = loadLibraryTracks('audio', configDir);
  const movieTracks = loadLibraryTracks('movie', configDir);
  const intent = classifyVoiceCommand(cleaned, { audioTracks, movieTracks });

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
    let chosenKind = intent.type === 'play-movie' ? 'movie' : 'audio';
    let match = findBestMediaMatches(
      cleaned,
      chosenKind === 'movie' ? movieTracks : audioTracks,
      { kind: chosenKind }
    );

    if (intent.type === 'play-media' && (!match.ok || match.score < 65) && movieTracks.length > 0) {
      const movieMatch = findBestMediaMatches(cleaned, movieTracks, { kind: 'movie' });
      if (movieMatch.ok && movieMatch.score >= Math.max(85, (match.score || 0) + 15)) {
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
  phoneticCode,
  jaroWinkler,
  isGenuineTabletopCommand,
  parseMediaQuery,
  findBestMediaMatches,
  loadLibraryTracks,
  classifyVoiceCommand,
  executeNabuCommand,
};

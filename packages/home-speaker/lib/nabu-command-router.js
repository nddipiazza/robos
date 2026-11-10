'use strict';

/**
 * RobOS Nabu Voice Command & Natural Language Media Router
 * --------------------------------------------------------
 * Connects "Hello Nabu / Okay Nabu -> {command}" on the Home Assistant Voice PE
 * (NC-VK-9727) to:
 *   1. RobOS Audio Player (NLP + Phonetic + IDF + Jaro-Winkler search across ~/.config/robos/audio-library.json)
 *   2. RobOS Movie Player (NLP + Phonetic + Season/Episode + Jaro-Winkler search across ~/.config/robos/movie-library.json)
 *   3. Smart TV & Speaker Target Device Casting ("on the roku", "on the kitchen speaker", "on the basement tv", etc.)
 *   4. Media transport controls (pause, resume, next, previous)
 *   5. All 48 RobOS Voice Skills + AI Coding Agent fallback (packages/voice-prompt/lib/skills-executor.js)
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const WORD_NUMBERS = {
  zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5',
  six: '6', seven: '7', eight: '8', nine: '9', ten: '10',
  eleven: '11', twelve: '12', thirteen: '13', fourteen: '14', fifteen: '15',
  sixteen: '16', seventeen: '17', eighteen: '18', nineteen: '19', twenty: '20',
  first: '1', second: '2', third: '3', fourth: '4', fifth: '5',
  sixth: '6', seventh: '7', eighth: '8', ninth: '9', tenth: '10',
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

// Known device cue tokens so we distinguish "on the roku" / "on the kitchen speaker" from song titles like "House on Haunted Hill"
const DEVICE_CUE_WORDS = new Set([
  'roku', 'tcl', 'tv', 'television', 'screen', 'speaker', 'speakers', 'chromecast',
  'cast', 'kitchen', 'basement', 'bedroom', 'master', 'clock', 'living', 'room',
  'oled', 'lg', 'samsung', 'tizen', 'bravia', 'sony', 'studio', 'lounge', 'leo',
  'leos', 'nabu', 'local', 'computer', 'desktop', 'everywhere',
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
 */
function isGenuineTabletopCommand(text) {
  const norm = foldText(text);
  const hasTabletopTarget = /\b(?:room|tile|corridor|hallway)\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/i.test(norm);
  const hasTabletopEntity = /\b(?:skeletons?|goblins?|orcs?|zombies?|mumm(?:y|ies)|fimirs?|chaos\s+warriors?|gargoyles?|werewol(?:f|ves)|chests?|throne|bookcase|torture\s+rack|pit\s+trap|spear\s+trap|falling\s+rock|secret\s+door)\b/i.test(norm);
  return hasTabletopTarget && hasTabletopEntity;
}

/**
 * Load all configured Smart TVs (from ~/.config/robos/tv-studio.json) and Smart Speakers
 * (from ~/.config/robos/home-speakers.json) for natural-language device resolution.
 */
function loadCastDevices(configDir = path.join(os.homedir(), '.config', 'robos')) {
  const byIp = new Map();

  // 1. Load Smart TVs from tv-studio.json
  const tvFile = path.join(configDir, 'tv-studio.json');
  try {
    if (fs.existsSync(tvFile)) {
      const data = JSON.parse(fs.readFileSync(tvFile, 'utf8'));
      for (const tv of (data.tvs || [])) {
        if (!tv || !tv.ip) continue;
        const isRealLanDevice = Boolean(tv.lastSeen || tv.ecpDeviceInfo);
        byIp.set(tv.ip, {
          ip: tv.ip,
          id: tv.id || `tv-${tv.ip}`,
          name: tv.name || `Smart TV (${tv.ip})`,
          model: tv.model || tv.platformName || 'Smart TV',
          platformId: tv.platformId || 'smart-tv',
          platformName: tv.platformName || '',
          deviceType: 'tv',
          protocol: tv.platformId === 'roku-os' ? 'roku-ecp' : 'cast',
          isRealLanDevice,
          ports: tv.ports || {},
        });
      }
    }
  } catch {}

  // 2. Load Smart Speakers from home-speakers.json
  const spkFile = path.join(configDir, 'home-speakers.json');
  try {
    if (fs.existsSync(spkFile)) {
      const data = JSON.parse(fs.readFileSync(spkFile, 'utf8'));
      for (const spk of (data.speakers || [])) {
        if (!spk || !spk.ip) continue;
        const existing = byIp.get(spk.ip);
        const looksLikeTv = /\b(?:tv|bravia|roku|oled|frame)\b/i.test(`${spk.name || ''} ${spk.model || ''}`);
        byIp.set(spk.ip, {
          ...(existing || {}),
          ip: spk.ip,
          id: existing?.id || `spk-${spk.ip}`,
          name: existing?.name || spk.name || `Speaker (${spk.ip})`,
          model: spk.model || existing?.model || 'Smart Speaker',
          platformId: existing?.platformId || (spk.protocol === 'esphome-native' ? 'esphome-native' : (looksLikeTv ? 'android-tv' : 'google-cast')),
          platformName: existing?.platformName || (spk.protocol === 'esphome-native' ? 'ESPHome Voice Satellite' : 'Google Cast'),
          deviceType: existing?.deviceType || (looksLikeTv ? 'tv' : 'speaker'),
          protocol: spk.protocol || existing?.protocol || 'cast',
          isRealLanDevice: true,
        });
      }
    }
  } catch {}

  return Array.from(byIp.values());
}

/**
 * Resolve a natural language device phrase (e.g. "the roku", "living room tv",
 * "kitchen speaker", "basement tv", "bedroom clock") to the closest configured
 * Smart TV or Smart Speaker.
 */
function resolveTargetDevice(deviceQuery, { configDir = path.join(os.homedir(), '.config', 'robos'), devices = null } = {}) {
  const qRaw = foldText(deviceQuery)
    .replace(/^(?:on|to|in|at)\s+/i, '')
    .replace(/^(?:the|my|our|a|an)\s+/i, '')
    .replace(/\s+(?:right\s+now|please|for\s+me)$/i, '')
    .trim();

  if (!qRaw) return null;

  if (/^(?:local|this\s+computer|my\s+computer|computer|desktop|laptop|here)$/i.test(qRaw)) {
    return {
      ip: 'local',
      id: 'local',
      name: 'This Computer (Local)',
      deviceType: 'local',
      score: 160,
    };
  }
  if (/^(?:all\s+speakers|every\s+speaker|everywhere)$/i.test(qRaw)) {
    return {
      ip: 'all',
      id: 'all',
      name: 'All Speakers',
      deviceType: 'speaker',
      score: 160,
    };
  }

  const list = Array.isArray(devices) ? devices : loadCastDevices(configDir);
  if (!list.length) return null;

  const qTokens = qRaw.split(' ').filter(Boolean);
  // Check if at least one token is a known device cue or matches a device name token
  const hasCue = qTokens.some(t => DEVICE_CUE_WORDS.has(t));

  let best = null;
  let bestScore = 0;

  for (const dev of list) {
    const nameNorm = foldText(dev.name || '');
    const modelNorm = foldText(dev.model || '');
    const platformNorm = foldText(`${dev.platformId || ''} ${dev.platformName || ''}`);
    const combinedNorm = `${nameNorm} ${modelNorm} ${platformNorm}`.trim();

    const nameTokens = nameNorm.split(' ').filter(Boolean);
    const allDevTokens = combinedNorm.split(' ').filter(Boolean);

    let score = 0;

    // Exact name match
    if (nameNorm === qRaw) {
      score += 170;
    } else if (` ${nameNorm} `.includes(` ${qRaw} `) || ` ${combinedNorm} `.includes(` ${qRaw} `)) {
      score += 125;
    }

    // Platform / brand keyword shortcuts ("on the roku", "on the tcl", "on the bravia", "on the kitchen", "on leo's speaker")
    if (qTokens.includes('roku') && (platformNorm.includes('roku') || nameNorm.includes('roku'))) {
      score += 140;
    }
    if (qTokens.includes('tcl') && (nameNorm.includes('tcl') || modelNorm.includes('tcl'))) {
      score += 135;
    }
    if ((qTokens.includes('kitchen')) && nameNorm.includes('kitchen')) {
      score += 145;
    }
    if ((qTokens.includes('basement')) && nameNorm.includes('basement')) {
      score += 145;
    }
    if ((qTokens.includes('bedroom') || qTokens.includes('clock') || qTokens.includes('master')) &&
        (nameNorm.includes('bedroom') || nameNorm.includes('clock'))) {
      score += 140;
    }
    if ((qTokens.includes('leo') || qTokens.includes('leos')) && nameNorm.includes('leo')) {
      score += 145;
    }
    if ((qTokens.includes('nabu') || qRaw.includes('home assistant')) &&
        (nameNorm.includes('home assistant') || dev.protocol === 'esphome-native')) {
      score += 145;
    }

    // Token similarity coverage
    let matchedTokens = 0;
    let tokSimSum = 0;
    for (const qt of qTokens) {
      if (LOW_IDF_WORDS.has(qt)) continue;
      const sim = Math.max(tokenSimilarity(qt, nameTokens), tokenSimilarity(qt, allDevTokens));
      if (sim >= 0.80) matchedTokens++;
      tokSimSum += sim;
    }
    const contentCount = qTokens.filter(t => !LOW_IDF_WORDS.has(t)).length || 1;
    const avgSim = tokSimSum / contentCount;
    const coverage = matchedTokens / contentCount;

    if (coverage < 0.5 && score < 110) continue;

    score += avgSim * 55 + coverage * 35;

    // Device type alignment ("tv" / "screen" vs "speaker" / "clock")
    if ((qTokens.includes('tv') || qTokens.includes('television') || qTokens.includes('roku')) && dev.deviceType === 'tv') {
      score += 20;
    }
    if ((qTokens.includes('speaker') || qTokens.includes('clock')) && dev.deviceType === 'speaker') {
      score += 20;
    }

    // Prefer real discovered LAN devices over demo/offline entries
    if (dev.isRealLanDevice) {
      score += 25;
    }

    if (score > bestScore && (hasCue || score >= 115)) {
      bestScore = score;
      best = { ...dev, score: Math.round(score) };
    }
  }

  return best && best.score >= 85 ? best : null;
}

/**
 * Split a spoken media command into `{ mediaCommand, targetDevice, rawDeviceQuery }`
 * if and only if a trailing `"on {device}"` / `"to {device}"` suffix matches a real
 * configured Smart TV or Smart Speaker.
 */
function extractDeviceFromCommand(cleanedCommand, { configDir = path.join(os.homedir(), '.config', 'robos'), devices = null } = {}) {
  const list = Array.isArray(devices) ? devices : loadCastDevices(configDir);
  const raw = String(cleanedCommand || '').trim();

  // Check trailing "on (the|my|our)? <device>" or "to (the|my|our)? <device>"
  // Use a non-greedy prefix `.+?` so we capture the trailing device phrase cleanly
  const patterns = [
    /^(.+?)\s+(?:on|to)\s+(?:the\s+|my\s+|our\s+)?([a-z0-9\s"'.-]+?)(?:\s+(?:right\s+now|please|for\s+me))?$/i,
    /^(.+?)\s+in\s+(?:the\s+)?((?:living\s+room|basement|kitchen|master\s+bedroom|bedroom)(?:\s+(?:tv|roku|speaker|clock))?)(?:\s+(?:right\s+now|please|for\s+me))?$/i,
  ];

  for (const re of patterns) {
    const m = raw.match(re);
    if (!m) continue;
    const candidateMedia = m[1].trim();
    const candidateDeviceStr = m[2].trim();
    if (!candidateMedia || !candidateDeviceStr) continue;

    const resolved = resolveTargetDevice(candidateDeviceStr, { configDir, devices: list });
    if (resolved && resolved.score >= 85) {
      return {
        mediaCommand: candidateMedia,
        targetDevice: resolved,
        rawDeviceQuery: candidateDeviceStr,
      };
    }
  }

  return {
    mediaCommand: raw,
    targetDevice: null,
    rawDeviceQuery: null,
  };
}

/**
 * Parse TV Season & Episode numbers from natural language queries such as:
 *   - "rick and morty season 8 episode 1"
 *   - "rick and morty season eight episode one"
 *   - "rick and morty s08e01" / "s8e1" / "8x01"
 *   - "rick and morty season 8"
 * Returns `{ strippedText, seasonNumber, episodeNumber, episodeCode }`.
 */
function parseSeasonEpisode(normText) {
  let s = normalizeNumberTokens(normText);
  let seasonNumber = null;
  let episodeNumber = null;

  // 1. "season 8 episode 1" / "season 8 ep 1"
  let m = s.match(/\bseason\s+(\d+)\s+(?:episode|ep)\s+(\d+)\b/i);
  if (m) {
    seasonNumber = parseInt(m[1], 10);
    episodeNumber = parseInt(m[2], 10);
    s = s.replace(m[0], ' ').replace(/\s+/g, ' ').trim();
  }

  // 2. "s08e01" / "s8e1" / "s08 e01"
  if (seasonNumber == null) {
    m = s.match(/\bs0*(\d+)\s*e0*(\d+)\b/i);
    if (m) {
      seasonNumber = parseInt(m[1], 10);
      episodeNumber = parseInt(m[2], 10);
      s = s.replace(m[0], ' ').replace(/\s+/g, ' ').trim();
    }
  }

  // 3. "8x01" / "8x1"
  if (seasonNumber == null) {
    m = s.match(/\b(\d+)x0*(\d+)\b/i);
    if (m) {
      seasonNumber = parseInt(m[1], 10);
      episodeNumber = parseInt(m[2], 10);
      s = s.replace(m[0], ' ').replace(/\s+/g, ' ').trim();
    }
  }

  // 4. Standalone "season 8" (without episode)
  if (seasonNumber == null) {
    m = s.match(/\bseason\s+(\d+)\b/i);
    if (m) {
      seasonNumber = parseInt(m[1], 10);
      s = s.replace(m[0], ' ').replace(/\s+/g, ' ').trim();
    }
  }

  // 5. Standalone "episode 1" (without season)
  if (episodeNumber == null) {
    m = s.match(/\b(?:episode|ep)\s+(\d+)\b/i);
    if (m) {
      episodeNumber = parseInt(m[1], 10);
      s = s.replace(m[0], ' ').replace(/\s+/g, ' ').trim();
    }
  }

  const episodeCode = (seasonNumber != null && episodeNumber != null)
    ? `s${String(seasonNumber).padStart(2, '0')}e${String(episodeNumber).padStart(2, '0')}`
    : null;

  return {
    strippedText: s,
    seasonNumber,
    episodeNumber,
    episodeCode,
  };
}

/**
 * Extract the clean search query, season/episode numbers, and flags from a spoken media command.
 * Preserves internal prepositions ("in", "of", "the", "at") so proper nouns like
 * "In Flames", "At the Gates", "Rick and Morty", and "Seasons in the Abyss" stay intact!
 */
function parseMediaQuery(cleanedCommand, kind = 'audio', { configDir = path.join(os.homedir(), '.config', 'robos'), devices = null } = {}) {
  const { mediaCommand, targetDevice, rawDeviceQuery } = extractDeviceFromCommand(cleanedCommand, { configDir, devices });
  const raw = foldText(mediaCommand);
  const shuffle = /\b(?:shuffle|shuffling|random|some)\b/i.test(raw);
  const onSpeaker = Boolean(targetDevice && targetDevice.ip !== 'local') || /\b(?:on\s+(?:the\s+)?speaker|right\s+here|out\s+loud)\b/i.test(raw);
  const explicitAlbum = /\b(?:album|record)\b/i.test(raw);
  const explicitArtist = /\b(?:artist|band|songs?\s+by|music\s+by)\b/i.test(raw);
  const explicitMovieOrTv = /\b(?:movie|film|video|cinema|show|series|season|episode|s\d+e\d+)\b/i.test(raw);
  const explicitAudio = /\b(?:song|songs|track|tracks|album|artist|band|music)\b/i.test(raw);

  // Strip ONLY leading verb phrases (including Whisper phonetic variants like "place some", "plays", "played", "plate")
  const verbPattern = /^(?:play|playing|plays|played|place|placed|places|plate|plates|plane|plain|plague|plea|pray|watch|watching|put\s+on|start|queue|listen\s+to|shuffle|shuffling|hear|spin)\s+/i;
  let stripped = raw
    .replace(verbPattern, '')
    .replace(/^(?:some\s+(?:music\s+by\s+|songs?\s+by\s+)?|a\s+(?:song|track|movie|film|show|episode)\s+(?:by\s+|called\s+|named\s+)?|the\s+(?:song|track|album|band|artist|movie|film|show|series|episode)\s+(?:by\s+|called\s+|named\s+)?)/i, '')
    .replace(/^(?:music|songs?|tracks?|album|artist|band|movie|film|video|show|series)\s+(?:called\s+|named\s+|by\s+|from\s+)/i, '')
    .replace(/\s+(?:on\s+(?:the\s+)?speaker|in\s+(?:the\s+)?(?:robos\s+)?(?:audio|movie)\s+player|for\s+me|right\s+now|please)$/i, '')
    .trim();

  // Extract TV Season & Episode numbers ("season 8 episode 1", "s08e01", etc.)
  const se = parseSeasonEpisode(stripped);
  stripped = se.strippedText;

  // If the user said "play some music" or "play music", stripped is just "music" / "songs"
  if (/^(?:music|songs?|tracks?|movies?|films?|something|anything|tunes?)$/i.test(stripped)) {
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
    seasonNumber: se.seasonNumber,
    episodeNumber: se.episodeNumber,
    episodeCode: se.episodeCode,
    targetDevice,
    rawDeviceQuery,
    shuffle,
    onSpeaker,
    explicitAlbum,
    explicitArtist,
    explicitMovieOrTv: explicitMovieOrTv || se.seasonNumber != null || se.episodeNumber != null,
    explicitAudio,
  };
}

/**
 * Score and rank tracks in a library (audio-library.json or movie-library.json)
 * against a spoken query using Exact Phrase + Season/Episode + Jaro-Winkler +
 * Phonetic Metaphone + Combined (Artist + Title / Artist + Album) matching.
 */
function findBestMediaMatches(cleanedCommand, tracks = [], {
  kind = 'audio',
  limit = 35,
  configDir = path.join(os.homedir(), '.config', 'robos'),
  devices = null,
} = {}) {
  const list = Array.isArray(tracks) ? tracks.filter(Boolean) : [];
  if (!list.length) {
    return { ok: false, error: `Your ${kind === 'movie' ? 'movie' : 'music'} library is empty.` };
  }

  const parsed = parseMediaQuery(cleanedCommand, kind, { configDir, devices });
  const qPhrase = parsed.queryPhrase;
  const qTokens = parsed.tokens;
  const qContentTokens = parsed.contentTokens;
  const targetDevice = parsed.targetDevice;
  const deviceSuffix = targetDevice && targetDevice.ip !== 'local' ? ` on ${targetDevice.name}` : '';

  if (!qPhrase || !qTokens.length) {
    const picks = [...list].sort(() => Math.random() - 0.5).slice(0, limit);
    return {
      ok: true,
      kind,
      matchType: 'library-shuffle',
      score: 50,
      bestTrack: picks[0],
      tracks: picks,
      shuffle: true,
      onSpeaker: parsed.onSpeaker,
      targetDevice,
      targetIp: targetDevice ? targetDevice.ip : null,
      summaryText: `Shuffling ${picks.length} tracks from your library, starting with "${picks[0].title}"${deviceSuffix}`,
    };
  }

  const qPhoneticPhrase = qTokens.map(phoneticCode).join(' ');

  const scored = [];
  for (const t of list) {
    const titleNorm = normalizeNumberTokens(t.title || '');
    const showNameNorm = normalizeNumberTokens(t.showName || '');
    const epTitleNorm = normalizeNumberTokens(t.episodeTitle || '');
    const epCodeNorm = foldText(t.episodeCode || '');
    const artistNorm = normalizeNumberTokens(t.artist || t.albumArtist || '');
    const albumNorm = normalizeNumberTokens(t.album || t.seriesTitle || '');
    const genreNorm = normalizeNumberTokens(t.genre || '');
    const yearStr = t.year ? String(t.year) : '';
    const tSeason = t.seasonNumber != null ? Number(t.seasonNumber) : null;
    const tEpisode = t.episodeNumber != null ? Number(t.episodeNumber) : null;

    const artistTitleNorm = `${artistNorm} ${titleNorm}`.trim();
    const titleArtistNorm = `${titleNorm} ${artistNorm}`.trim();
    const artistAlbumNorm = `${artistNorm} ${albumNorm}`.trim();

    const titleTokens = titleNorm.split(' ').filter(Boolean);
    const showTokens = showNameNorm.split(' ').filter(Boolean);
    const epTitleTokens = epTitleNorm.split(' ').filter(Boolean);
    const artistTokens = artistNorm.split(' ').filter(Boolean);
    const albumTokens = albumNorm.split(' ').filter(Boolean);
    const genreTokens = genreNorm.split(' ').filter(Boolean);
    const combinedTokens = [...artistTokens, ...titleTokens, ...showTokens, ...epTitleTokens, ...albumTokens];

    let score = 0;
    let fieldHit = 'none';

    // 1. Exact full-field or exact phonetic full-field matches
    if (showNameNorm && (showNameNorm === qPhrase || showTokens.map(phoneticCode).join(' ') === qPhoneticPhrase)) {
      score += 158;
      fieldHit = 'show';
    } else if (artistNorm && (artistNorm === qPhrase || artistTokens.map(phoneticCode).join(' ') === qPhoneticPhrase)) {
      score += 150;
      fieldHit = 'artist';
    } else if (titleNorm && (titleNorm === qPhrase || titleTokens.map(phoneticCode).join(' ') === qPhoneticPhrase)) {
      score += 155;
      fieldHit = 'title';
    } else if (epTitleNorm && (epTitleNorm === qPhrase || epTitleTokens.map(phoneticCode).join(' ') === qPhoneticPhrase)) {
      score += 152;
      fieldHit = 'episode';
    } else if (albumNorm && (albumNorm === qPhrase || albumNorm.replace(/\s+\d{4}$/, '') === qPhrase || albumNorm.replace(/\s+season\s+\d+$/, '') === qPhrase)) {
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
      if (showNameNorm && (` ${showNameNorm} `.includes(` ${qPhrase} `) || showNameNorm.startsWith(qPhrase))) {
        score += 100;
        if (fieldHit === 'none') fieldHit = 'show';
      }
      if (artistNorm && (` ${artistNorm} `.includes(` ${qPhrase} `) || artistNorm.startsWith(qPhrase))) {
        score += 95;
        if (fieldHit === 'none') fieldHit = 'artist';
      }
      if (titleNorm && (` ${titleNorm} `.includes(` ${qPhrase} `) || titleNorm.startsWith(qPhrase))) {
        score += 92;
        if (fieldHit === 'none') fieldHit = 'title';
      }
      if (epTitleNorm && (` ${epTitleNorm} `.includes(` ${qPhrase} `) || epTitleNorm.startsWith(qPhrase))) {
        score += 92;
        if (fieldHit === 'none') fieldHit = 'episode';
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

    // 3. Combined Artist + Song / Artist + Album / Show + Episode Title match
    let artistMatchedInCombo = false;
    const primaryEntityTokens = showTokens.length ? showTokens : artistTokens;
    if (primaryEntityTokens.length > 0 && qContentTokens.length >= 2) {
      const entityHits = primaryEntityTokens.filter(at => tokenSimilarity(at, qContentTokens) >= 0.85).length;
      if (entityHits === primaryEntityTokens.length) {
        artistMatchedInCombo = true;
        const remTokens = qContentTokens.filter(qt => tokenSimilarity(qt, primaryEntityTokens) < 0.85);
        if (remTokens.length > 0) {
          const remTitleHits = remTokens.reduce((acc, rt) => acc + tokenSimilarity(rt, epTitleTokens.length ? epTitleTokens : titleTokens), 0) / remTokens.length;
          const remAlbumHits = remTokens.reduce((acc, rt) => acc + tokenSimilarity(rt, albumTokens), 0) / remTokens.length;
          if (remTitleHits >= 0.75) {
            score += 65 + remTitleHits * 65;
            fieldHit = epTitleTokens.length ? 'episode' : 'title';
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
    let showSimSum = 0;
    let artistSimSum = 0;
    let albumSimSum = 0;
    let genreSimSum = 0;
    let combinedSimSum = 0;

    for (const qt of qTokens) {
      const isLowIdf = LOW_IDF_WORDS.has(qt) && qTokens.length > 2;
      const w = isLowIdf ? 0.25 : 1.0;
      totalWeight += w;

      const tSim = Math.max(tokenSimilarity(qt, titleTokens), tokenSimilarity(qt, epTitleTokens));
      const shSim = tokenSimilarity(qt, showTokens);
      const arSim = tokenSimilarity(qt, artistTokens);
      const alSim = tokenSimilarity(qt, albumTokens);
      const gSim = tokenSimilarity(qt, genreTokens);
      const cSim = tokenSimilarity(qt, combinedTokens);
      const ySim = (yearStr && qt === yearStr) ? 1.0 : 0;

      const bestTokSim = Math.max(tSim, shSim, arSim, alSim, gSim, cSim, ySim);
      if (bestTokSim >= 0.78) {
        matchedWeight += w * bestTokSim;
        if (!isLowIdf) contentMatched++;
      }

      titleSimSum += w * tSim;
      showSimSum += w * shSim;
      artistSimSum += w * arSim;
      albumSimSum += w * alSim;
      genreSimSum += w * gSim;
      combinedSimSum += w * cSim;
    }

    const contentCoverage = qContentTokens.length ? contentMatched / qContentTokens.length : 1;
    if (qTokens.length >= 2 && score < 110 && contentCoverage < 0.65) {
      continue;
    }

    const normWeight = totalWeight || 1;
    const tokenCoverage = matchedWeight / normWeight;
    const avgTitleSim = Math.max(titleSimSum, showSimSum) / normWeight;
    const avgArtistSim = artistSimSum / normWeight;
    const avgAlbumSim = albumSimSum / normWeight;
    const avgGenreSim = genreSimSum / normWeight;
    const avgCombinedSim = combinedSimSum / normWeight;

    const targetCoverageArtist = artistTokens.length
      ? artistTokens.reduce((acc, at) => acc + tokenSimilarity(at, qTokens), 0) / artistTokens.length
      : 0;

    score += tokenCoverage * 38;
    score += avgTitleSim * 35;
    score += (avgArtistSim * 0.6 + targetCoverageArtist * 0.4) * 38;
    score += avgAlbumSim * 28;
    score += avgCombinedSim * 25;
    score += avgGenreSim * 18;

    // 5. TV Season & Episode exact matching bonus / penalty
    if (parsed.seasonNumber != null || parsed.episodeNumber != null) {
      if (kind !== 'movie') {
        // Audio tracks rarely have season+episode; penalize audio library when user explicitly asks for Season X Episode Y
        score -= 75;
      } else if (t.mediaType === 'tv' || tSeason != null || tEpisode != null) {
        const seasonMatches = parsed.seasonNumber == null || tSeason === parsed.seasonNumber;
        const episodeMatches = parsed.episodeNumber == null || tEpisode === parsed.episodeNumber;
        if (seasonMatches && episodeMatches) {
          if (parsed.seasonNumber != null && parsed.episodeNumber != null) {
            score += 220;
            fieldHit = 'episode';
          } else if (parsed.seasonNumber != null) {
            score += 125;
            fieldHit = 'season';
          } else {
            score += 110;
            fieldHit = 'episode';
          }
        } else if (parsed.episodeCode && epCodeNorm === parsed.episodeCode) {
          score += 220;
          fieldHit = 'episode';
        } else {
          // Wrong season or wrong episode of this TV show
          score -= 95;
        }
      } else {
        score -= 60;
      }
    }

    if (fieldHit === 'none') {
      if (artistMatchedInCombo) {
        fieldHit = avgTitleSim >= avgAlbumSim ? 'title' : 'album';
      } else {
        const maxAvg = Math.max(avgTitleSim, avgArtistSim, avgAlbumSim, avgGenreSim);
        if (maxAvg >= 0.68) {
          if (maxAvg === avgArtistSim && targetCoverageArtist >= 0.75) fieldHit = 'artist';
          else if (maxAvg === avgAlbumSim && avgAlbumSim > avgTitleSim) fieldHit = 'album';
          else if (maxAvg === avgTitleSim) fieldHit = showNameNorm ? 'show' : 'title';
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
      scored.push({
        track: t,
        score,
        fieldHit,
        artistNorm,
        artistPhoneticKey,
        albumNorm,
        titleNorm,
        showNameNorm,
        tSeason,
        tEpisode,
      });
    }
  }

  if (!scored.length) {
    return {
      ok: false,
      kind,
      score: 0,
      queryPhrase: qPhrase,
      targetDevice,
      error: `Could not find "${qPhrase}" in your ${kind === 'movie' ? 'movie' : 'music'} library.`,
    };
  }

  // Sort by score descending; for equal-score TV episodes (e.g. "play Rick and Morty" or "play Rick and Morty Season 8"),
  // order by Season ascending then Episode ascending so Episode 1 starts first!
  scored.sort((a, b) => {
    if (Math.abs(b.score - a.score) > 2) return b.score - a.score;
    if (a.tSeason != null && b.tSeason != null && a.tSeason !== b.tSeason) return a.tSeason - b.tSeason;
    if (a.tEpisode != null && b.tEpisode != null && a.tEpisode !== b.tEpisode) return a.tEpisode - b.tEpisode;
    return b.score - a.score;
  });

  const top = scored[0];

  if (kind === 'movie') {
    const best = top.track;
    if (best.mediaType === 'tv' || top.showNameNorm) {
      // Gather subsequent episodes in the same season so playback continues smoothly through the season
      const seasonEps = list
        .filter(t =>
          t &&
          normalizeNumberTokens(t.showName || '') === top.showNameNorm &&
          Number(t.seasonNumber) === Number(best.seasonNumber) &&
          Number(t.episodeNumber) >= Number(best.episodeNumber || 1)
        )
        .sort((a, b) => (Number(a.episodeNumber) || 0) - (Number(b.episodeNumber) || 0));

      const queueTracks = seasonEps.length ? seasonEps : [best];
      const epLabel = best.seasonNumber != null && best.episodeNumber != null
        ? `Season ${best.seasonNumber} Episode ${best.episodeNumber}${best.episodeTitle ? ` ("${best.episodeTitle}")` : ''}`
        : best.title;
      const showLabel = best.showName || best.artist || best.title;

      return {
        ok: true,
        kind: 'movie',
        matchType: parsed.episodeNumber != null ? 'tv-episode' : 'tv-show',
        score: top.score,
        bestTrack: best,
        tracks: queueTracks,
        alternatives: scored.slice(1, 5).map(s => s.track),
        shuffle: false,
        onSpeaker: parsed.onSpeaker,
        targetDevice,
        targetIp: targetDevice ? targetDevice.ip : null,
        summaryText: `Playing ${showLabel} ${epLabel}${deviceSuffix || ' in RobOS Movie Player'}`,
      };
    }

    const moviePicks = scored.slice(0, 10).map(s => s.track);
    return {
      ok: true,
      kind: 'movie',
      matchType: 'movie',
      score: top.score,
      bestTrack: best,
      tracks: [best],
      alternatives: moviePicks.slice(1, 5),
      shuffle: false,
      onSpeaker: parsed.onSpeaker,
      targetDevice,
      targetIp: targetDevice ? targetDevice.ip : null,
      summaryText: `Playing "${best.title}"${best.year ? ` (${best.year})` : ''}${deviceSuffix || ' in RobOS Movie Player'}`,
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
      kind: 'audio',
      matchType: 'artist',
      score: top.score,
      bestTrack: first,
      tracks: tracksOut,
      shuffle: parsed.shuffle,
      onSpeaker: parsed.onSpeaker,
      targetDevice,
      targetIp: targetDevice ? targetDevice.ip : null,
      summaryText: `Playing ${tracksOut.length} songs by ${first.artist || top.track.artist}, starting with "${first.title}"${deviceSuffix}`,
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
      kind: 'audio',
      matchType: 'album',
      score: top.score,
      bestTrack: first,
      tracks: tracksOut,
      shuffle: false,
      onSpeaker: parsed.onSpeaker,
      targetDevice,
      targetIp: targetDevice ? targetDevice.ip : null,
      summaryText: `Playing album "${first.album}" by ${first.artist || 'Unknown'} (${tracksOut.length} tracks), starting with "${first.title}"${deviceSuffix}`,
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
    kind: 'audio',
    matchType: 'song',
    score: top.score,
    bestTrack: top.track,
    tracks: tracksOut,
    shuffle: false,
    onSpeaker: parsed.onSpeaker,
    targetDevice,
    targetIp: targetDevice ? targetDevice.ip : null,
    summaryText: `Playing "${top.track.title}" by ${top.track.artist || 'Unknown'}${deviceSuffix}`,
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

// ── Watch status questions ("what season of The Office did we leave off on?") ──

function requireMediaWatch() {
  const candidates = [
    process.env.ROBOS_LIB_PATH && path.join(process.env.ROBOS_LIB_PATH, 'media-watch'),
    path.resolve(__dirname, '..', '..', 'robos-lib', 'media-watch'),
    '/usr/local/share/robos/robos-lib/media-watch',
  ].filter(Boolean);
  for (const p of candidates) {
    try { return require(p); } catch (err) { if (err.code !== 'MODULE_NOT_FOUND') throw err; }
  }
  return null;
}

// Speech-to-text gives "we", "I" or "you" for the same question.
const WE = String.raw`(?:we|i|you|us|me)`;
const LEFT = String.raw`(?:leave\s+off|left\s+off|stop|stopped|get\s+to|got\s+to)`;
const WATCH_STATUS_PATTERNS = [
  // what season / episode of X did we leave off on | are we on | were we up to
  new RegExp(String.raw`^(?:what|which)\s+(?:season|episode|part)\s+(?:of|in|on)\s+(.+?)\s+(?:did|do|were|are|was|am|have)\s+${WE}\s+(?:${LEFT}(?:\s+(?:on|at|with|in))?|on|at|up\s+to|watching|in)$`),
  // what season / episode did we leave off on (in|of|with) X | what episode are we on in X
  new RegExp(String.raw`^(?:what|which)\s+(?:season|episode|part)\s+(?:did|do|were|are|was|am|have)\s+${WE}\s+(?:${LEFT}|on|at|up\s+to)(?:\s+(?:on|at))?\s+(?:in|of|with|for|on)\s+(.+)$`),
  // where did we leave off (on|in|with) X | where were we in X | where are we in X
  new RegExp(String.raw`^where\s+(?:did|do|were|are|was|am|have)\s+${WE}(?:\s+${LEFT})?\s+(?:on|in|with|at|for)\s+(.+)$`),
  // how far (along) into X are we | how far are we in X
  new RegExp(String.raw`^how\s+far\s+(?:along\s+)?(?:into|in|through|with)\s+(.+?)(?:\s+(?:are|am|were|did|have)\s+${WE}(?:\s+gotten|\s+got)?)?$`),
  new RegExp(String.raw`^how\s+far\s+(?:are|am|were|did|have)\s+${WE}\s+(?:get\s+|gotten\s+|got\s+)?(?:into|in|through|with)\s+(.+)$`),
  // what's next (on|in|for) X | what episode is next (in|of) X
  /^(?:whats|what\s+is|what\s+s)\s+next\s+(?:on|in|for|of)\s+(.+)$/,
  /^(?:what|which)\s+episode\s+(?:is|comes)\s+next\s+(?:on|in|for|of)\s+(.+)$/,
  // what was the last episode of X (we watched)
  new RegExp(String.raw`^(?:what|which)\s+(?:was|is)\s+the\s+last\s+episode\s+(?:of|in)\s+(.+?)(?:\s+(?:that\s+)?${WE}\s+(?:watched|saw|finished))?$`),
];
const MOVIE_STATUS_PATTERNS = [
  // have we seen / watched / finished X | did we finish X (yet)
  new RegExp(String.raw`^(?:have|did|has)\s+${WE}\s+(?:already\s+)?(?:seen|see|watched|watch|finished|finish)\s+(.+?)(?:\s+(?:yet|already|before))?$`),
];
const CONTINUE_PATTERNS = [
  new RegExp(String.raw`^(?:what|which)\s+(?:shows?\s+|series\s+|movies?\s+)?(?:are|were)\s+${WE}\s+(?:watching|in\s+the\s+middle\s+of)(?:\s+right\s+now|\s+now|\s+lately)?$`),
  /^(?:whats|what\s+is)\s+(?:on\s+)?(?:my|our)\s+continue\s+watching(?:\s+list)?$/,
];
const NEXT_EPISODE_PATTERNS = [
  /^(?:play|watch|put\s+on|start)\s+(?:the\s+)?next\s+episode\s+(?:of|in)\s+(.+)$/,
  /^(?:continue|resume|keep)\s+watching\s+(.+)$/,
  /^(?:pick\s+up|start)\s+(.+?)\s+where\s+(?:we|i)\s+left\s+off$/,
];

function cleanWatchTitle(t) {
  return String(t || '')
    .replace(/^(?:the\s+(?:show|series|tv\s+show|movie|film)\s+|(?:show|series|movie|film)\s+)/, '')
    .replace(/\s+(?:yet|already|again|please|now|right\s+now|on\s+(?:the\s+)?(?:tv|roku|chromecast|television))$/, '')
    .replace(/\s+(?:on|at|in|with)$/, '')
    .trim();
}

/** "what season of breaking bad did we leave off on" → { type: 'watch-status', scope: 'show', title: 'breaking bad' } */
function parseWatchStatusQuery(cleanedText) {
  const q = foldText(cleanedText).replace(/\s+(?:please|robos|nabu)$/, '');
  if (!q) return null;
  for (const re of CONTINUE_PATTERNS) if (re.test(q)) return { type: 'watch-status', scope: 'continue', title: '' };
  for (const re of NEXT_EPISODE_PATTERNS) { const m = q.match(re); if (m && cleanWatchTitle(m[1])) return { type: 'play-next-episode', title: cleanWatchTitle(m[1]) }; }
  for (const re of WATCH_STATUS_PATTERNS) { const m = q.match(re); if (m && cleanWatchTitle(m[1])) return { type: 'watch-status', scope: 'show', title: cleanWatchTitle(m[1]) }; }
  for (const re of MOVIE_STATUS_PATTERNS) { const m = q.match(re); if (m && cleanWatchTitle(m[1])) return { type: 'watch-status', scope: /\b(?:movie|film)\b/.test(q) ? 'movie' : 'any', title: cleanWatchTitle(m[1]) }; }
  return null;
}

/** Answers a watch-status intent from the synced watch history (every computer). */
async function answerWatchStatus(intent, { configDir } = {}) {
  const watch = requireMediaWatch();
  if (!watch) return { ok: false, response: 'RobOS media history is not installed on this computer.' };
  const opts = { configDir };
  let res;
  if (intent.scope === 'continue') res = await watch.continueWatching(opts);
  else if (intent.scope === 'movie') res = await watch.movieStatus(intent.title, opts);
  else {
    res = await watch.watchStatus(intent.title, opts);
    if (!res.ok || res.matchScore < 0.8) {
      const movie = await watch.movieStatus(intent.title, opts);
      if (movie.ok) res = movie;
    }
  }
  return { ok: Boolean(res.ok), response: res.spoken || res.error || 'I could not find that in your watch history.', data: res };
}

/**
 * Classify whether a cleaned voice command is a media transport command, a movie play
 * command, a music/media play command (including phonetic ASR mishearings like "place some..."
 * or "place Slayer..."), or a general RobOS skill / AI agent request.
 */
function classifyVoiceCommand(cleanedText, { audioTracks = null, movieTracks = null, configDir = path.join(os.homedir(), '.config', 'robos') } = {}) {
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

  // 1.5 Voice Identity & Spoken Voice Onboarding intents
  if (/^(?:who\s+am\s+i|whose\s+voice\s+is\s+this|who\s+is\s+(?:speaking|talking)|do\s+you\s+(?:know|recognize)\s+(?:my\s+voice|who\s+i\s+am)|what\s+is\s+my\s+name|identify\s+my\s+voice)$/.test(q)) {
    return { type: 'voice-whoami', query: cleanedText };
  }
  const enrollMatch = cleanedText.match(/^(?:(?:remember|enroll|register|save|onboard)\s+my\s+voice\s+as|my\s+name\s+is|i\s+am\s+speaking\s+as|this\s+is\s+the\s+voice\s+of)\s+([a-zA-Z][a-zA-Z0-9\s.'-]{1,40}?)[.!?]*$/i);
  if (enrollMatch) {
    return { type: 'voice-enroll', targetName: enrollMatch[1].trim(), query: cleanedText };
  }

  // 1.6 Watch status questions and "continue watching X"
  const watchIntent = parseWatchStatusQuery(cleanedText);
  if (watchIntent) return { ...watchIntent, query: cleanedText };

  // 2. If it's a genuine Tabletop Quest Editor command ("place 2 skeletons in room 1"), let Tabletop handle it
  if (isGenuineTabletopCommand(q)) {
    return { type: 'robos-skill', query: cleanedText };
  }

  // 2.1 If it's a Household Shopping Lists command ("add milk to grocery", "put eggs on target list", "remove milk from costco", "check off avocados"), route to robos-skill
  let normShopQ = q;
  try {
    const { normalizeShoppingVoiceTranscript } = require('../../shopping-lists/lib/defaults');
    normShopQ = normalizeShoppingVoiceTranscript(cleanedText).toLowerCase();
  } catch {}
  if (
    /\b(?:shopping\s+lists?|grocery(?:\s+lists?)?|target\s+lists?|costco(?:\s+lists?)?|@(?:grocery|target|costco))\b/i.test(normShopQ) ||
    /^(?:add|put|buy|get|need|remove|delete|check(?:\s+off)?|uncheck|clear(?:\s+checked)?)\b.+\b(?:to|on|in|from|at|for)\s+(?:[a-z0-9'\-\s]{1,30}\s+)?(?:grocery|target|costco|shopping|lists?)\b/i.test(normShopQ)
  ) {
    return { type: 'robos-skill', query: cleanedText };
  }

  // 3. Explicit Movie / TV playback ("play/place the movie Dune", "watch Scary Movie 2", "play rick and morty season 8 episode 1 on the roku")
  const isPlayLikeVerb = PLAY_VERB_VARIANTS.has(firstWord) || jaroWinkler(firstWord, 'play') >= 0.80;
  const hasTvSeasonEpisode = /\b(?:season\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)|episode\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)|s\d+\s*e\d+|\d+x\d+)\b/i.test(q);
  if (/^(?:watch|wash)\b/.test(q) ||
      (isPlayLikeVerb && (/\b(?:movie|film|video|cinema|episode|season|series|show)\b/.test(q) || hasTvSeasonEpisode)) ||
      /\b(?:in\s+(?:robos\s+)?movie\s+player)\b/.test(q)) {
    return { type: 'play-movie', query: cleanedText };
  }

  // 4. Unified Media playback (works for BOTH Audio and Movie/TV libraries!)
  if ((isPlayLikeVerb && words.length >= 2) || /^(?:listen\s+to|put\s+on)\b/.test(q)) {
    if (!/\b(?:game|crpg|quest\s+warrior|starfall|party\s+game)\b/.test(q)) {
      return { type: 'play-media', query: cleanedText };
    }
  }

  // 5. Library-Grounded Natural Language Fallback:
  // If the first word wasn't a known system skill verb, check if the utterance strongly matches an entity in the user's audio or movie library!
  const isSystemVerb = /^(?:open|launch|add|create|list|show|view|validate|search|check|restart|read|what|who|where|when|why|how|is|are|can|tell)\b/.test(q);
  if (!isSystemVerb && (Array.isArray(audioTracks) || Array.isArray(movieTracks))) {
    const aMatch = Array.isArray(audioTracks) && audioTracks.length
      ? findBestMediaMatches(cleanedText, audioTracks, { kind: 'audio', configDir })
      : null;
    const mMatch = Array.isArray(movieTracks) && movieTracks.length
      ? findBestMediaMatches(cleanedText, movieTracks, { kind: 'movie', configDir })
      : null;

    if (mMatch && mMatch.ok && mMatch.score >= 120 && (!aMatch || mMatch.score > (aMatch.score || 0))) {
      return { type: 'play-movie', query: cleanedText };
    }
    if (aMatch && aMatch.ok && aMatch.score >= 115) {
      return { type: 'play-media', query: cleanedText };
    }
  }

  return { type: 'robos-skill', query: cleanedText };
}

/**
 * Compare Audio Library and Movie/TV Library matches for a spoken `"play {something} {optional on device}"`
 * command and return the closest match across both libraries.
 */
function findUnifiedMediaMatch(cleanedCommand, {
  audioTracks = [],
  movieTracks = [],
  preferredKind = null,
  configDir = path.join(os.homedir(), '.config', 'robos'),
  devices = null,
} = {}) {
  const castDevices = Array.isArray(devices) ? devices : loadCastDevices(configDir);
  const parsed = parseMediaQuery(cleanedCommand, preferredKind || 'audio', { configDir, devices: castDevices });

  const audioMatch = audioTracks.length
    ? findBestMediaMatches(cleanedCommand, audioTracks, { kind: 'audio', configDir, devices: castDevices })
    : { ok: false, score: 0, kind: 'audio' };
  const movieMatch = movieTracks.length
    ? findBestMediaMatches(cleanedCommand, movieTracks, { kind: 'movie', configDir, devices: castDevices })
    : { ok: false, score: 0, kind: 'movie' };

  if (!audioMatch.ok && !movieMatch.ok) {
    return preferredKind === 'movie' ? movieMatch : audioMatch;
  }
  if (movieMatch.ok && !audioMatch.ok) return movieMatch;
  if (audioMatch.ok && !movieMatch.ok) return audioMatch;

  // Both libraries produced a candidate; compute context-weighted score
  let audioEffective = audioMatch.score || 0;
  let movieEffective = movieMatch.score || 0;

  if (preferredKind === 'movie' || parsed.explicitMovieOrTv) {
    movieEffective += 75;
  }
  if (parsed.explicitAudio) {
    audioEffective += 75;
  }
  if (parsed.targetDevice) {
    if (parsed.targetDevice.deviceType === 'tv') movieEffective += 25;
    else if (parsed.targetDevice.deviceType === 'speaker') audioEffective += 25;
  }

  return movieEffective > audioEffective ? movieMatch : audioMatch;
}

/**
 * Execute any spoken "Hello Nabu / Okay Nabu -> {command}" across Audio Player,
 * Movie Player, Smart TV / Speaker casting, and all 48 RobOS Voice Skills + AI Agent,
 * while propagating the identified "robosUser" voice metadata to target apps.
 */
async function executeNabuCommand(rawTranscript, {
  configDir = path.join(os.homedir(), '.config', 'robos'),
  autoLaunchPlayers = process.env.ROBOS_TEST !== '1',
  skillsExecutor = null,
  robosUser = null,
  pcmBuffer = null,
  wavPath = null,
  speakerIp = null,
  voiceIdentityService = null,
} = {}) {
  const { VoiceIdentityService } = require('./voice-identity-service');
  const idSvc = voiceIdentityService || new VoiceIdentityService({ configDir });

  // Resolve speaker identity if audio was provided or fall back to active/default user
  let activeUser = robosUser;
  if (!activeUser && (pcmBuffer || wavPath)) {
    try {
      const idRes = await idSvc.identifySpeaker({ pcmBuffer, wavPath, speakerIp });
      if (idRes && idRes.robosUser) activeUser = idRes.robosUser;
    } catch {}
  }
  if (!activeUser) {
    const savedCtx = idSvc.readActiveVoiceContext();
    if (savedCtx && savedCtx.robosUser) {
      activeUser = savedCtx.robosUser;
    } else {
      const def = idSvc.getDefaultWorkstationUser();
      activeUser = {
        userId: def.userId,
        name: def.name,
        displayName: def.name,
        role: def.role,
        email: def.email || '',
        identified: false,
        enrolled: false,
        confidence: 0,
        source: 'workstation-default',
      };
    }
  }

  const cleaned = stripWakePhrase(rawTranscript);
  if (!cleaned) {
    return {
      ok: false,
      skill: 'none',
      cleanedCommand: '',
      robosUser: activeUser,
      response: 'I am listening. How can I help you?',
    };
  }

  try {
    idSvc.writeActiveVoiceContext(activeUser, { lastCommand: cleaned });
  } catch {}

  const audioTracks = loadLibraryTracks('audio', configDir);
  const movieTracks = loadLibraryTracks('movie', configDir);
  const castDevices = loadCastDevices(configDir);
  const intent = classifyVoiceCommand(cleaned, { audioTracks, movieTracks, configDir });

  // ── 0.1 Voice Identity Query ("who am I?", "whose voice is this?") ──────────
  if (intent.type === 'voice-whoami') {
    const pct = Math.round((Number(activeUser?.confidence) || 0) * 100);
    if (activeUser && activeUser.identified) {
      return {
        ok: true,
        skill: 'voice-whoami',
        cleanedCommand: cleaned,
        robosUser: activeUser,
        response: `You are ${activeUser.name} (${activeUser.role || 'RobOS User'}), identified by your voiceprint with ${pct}% confidence.`,
        data: { robosUser: activeUser },
      };
    }
    const enrolledList = idSvc.listProfiles();
    const hint = enrolledList.length === 0
      ? `No voice profiles are enrolled yet. Say "Hello Nabu, remember my voice as" followed by your name, or open Voice Onboarding in RobOS Home Speaker.`
      : `I could not confidently match your voice against the ${enrolledList.length} enrolled profile${enrolledList.length === 1 ? '' : 's'}. Say "Hello Nabu, remember my voice as" followed by your name to add a voice sample.`;
    return {
      ok: true,
      skill: 'voice-whoami',
      cleanedCommand: cleaned,
      robosUser: activeUser,
      response: hint,
      data: { robosUser: activeUser, enrolledCount: enrolledList.length },
    };
  }

  // ── 0.2 Spoken Voice Enrollment ("remember my voice as Nicholas", "my name is Sarah") ──
  if (intent.type === 'voice-enroll') {
    const targetName = intent.targetName;
    if (pcmBuffer || wavPath) {
      const enrollRes = await idSvc.enrollVoiceSample({
        name: targetName,
        pcmBuffer,
        wavPath,
        phrase: rawTranscript,
        transcript: cleaned,
        source: speakerIp ? `speaker:${speakerIp}` : 'voice-command',
      });
      if (enrollRes && enrollRes.ok && enrollRes.profile) {
        const newlyEnrolledUser = {
          userId: enrollRes.profile.userId,
          name: enrollRes.profile.name,
          displayName: enrollRes.profile.displayName || enrollRes.profile.name,
          role: enrollRes.profile.role,
          avatarColor: enrollRes.profile.avatarColor,
          identified: true,
          enrolled: true,
          confidence: 1.0,
          source: 'spoken-enrollment',
          speakerIp: speakerIp || null,
          identifiedAt: new Date().toISOString(),
        };
        try {
          idSvc.writeActiveVoiceContext(newlyEnrolledUser, { lastCommand: cleaned });
        } catch {}
        return {
          ok: true,
          skill: 'voice-enroll',
          cleanedCommand: cleaned,
          robosUser: newlyEnrolledUser,
          response: `Got it, ${enrollRes.profile.name}! I saved your voiceprint (${enrollRes.profile.sampleCount} sample${enrollRes.profile.sampleCount === 1 ? '' : 's'} enrolled). RobOS apps will now recognize your voice as ${enrollRes.profile.name}.`,
          data: { robosUser: newlyEnrolledUser, profile: enrollRes.profile },
        };
      }
    }
    // Profile created/updated without live PCM (e.g. text command test)
    const prof = idSvc.upsertUserProfile({ name: targetName });
    const createdUser = {
      userId: prof.userId,
      name: prof.name,
      displayName: prof.displayName || prof.name,
      role: prof.role,
      avatarColor: prof.avatarColor,
      identified: true,
      enrolled: prof.sampleCount > 0,
      confidence: 1.0,
      source: 'profile-registration',
    };
    return {
      ok: true,
      skill: 'voice-enroll',
      cleanedCommand: cleaned,
      robosUser: createdUser,
      response: `Registered RobOS User profile for ${prof.name}. Speak to the speaker or record 3 phrases in Voice Onboarding to complete your biometric voiceprint.`,
      data: { robosUser: createdUser, profile: prof },
    };
  }

  const { createAudioPlayerClient } = require('../../audio-player/lib/control-server');
  const { createAudioPlayerClient: createMoviePlayerClient } = require('../../movie-player/lib/control-server');

  // ── 0.5 Watch status ("what season of The Office did we leave off on?") ────
  if (intent.type === 'watch-status') {
    const answer = await answerWatchStatus(intent, { configDir });
    return { ok: answer.ok, skill: 'media-watch-status', cleanedCommand: cleaned, robosUser: activeUser, response: answer.response, data: answer.data || null };
  }

  // ── 0.6 Continue watching / play the next episode of a show ───────────────
  if (intent.type === 'play-next-episode') {
    const watch = requireMediaWatch();
    if (!watch) return { ok: false, skill: 'media-next-episode', cleanedCommand: cleaned, robosUser: activeUser, response: 'RobOS media history is not installed on this computer.' };
    if (autoLaunchPlayers) await ensureMediaPlayerRunning('movie-player', createMoviePlayerClient, { configDir });
    const { targetDevice } = extractDeviceFromCommand(cleaned, { configDir, devices: castDevices });
    const res = await watch.playNextEpisode({ show: intent.title, targetIp: (targetDevice && targetDevice.ip) || null, configDir });
    return {
      ok: Boolean(res.ok), skill: 'media-next-episode', cleanedCommand: cleaned, robosUser: activeUser,
      response: res.spoken || res.error || `I could not start ${intent.title}.`, data: res,
    };
  }

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
        robosUser: activeUser,
        response: 'Neither Audio Player nor Movie Player is currently running.',
      };
    }

    const res = await targetClient[intent.action]({ robosUser: activeUser });
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
      robosUser: activeUser,
      response: actionLabels[intent.action] || `Updated ${targetName}.`,
      data: { ...(res || {}), robosUser: activeUser },
    };
  }

  // ── 2. Unified Movie/TV & Music Library Best-Match Playback + Device Casting ──
  if (intent.type === 'play-movie' || intent.type === 'play-media') {
    const preferredKind = intent.type === 'play-movie' ? 'movie' : null;
    const match = findUnifiedMediaMatch(cleaned, {
      audioTracks,
      movieTracks,
      preferredKind,
      configDir,
      devices: castDevices,
    });

    const chosenKind = match.kind || (intent.type === 'play-movie' ? 'movie' : 'audio');

    if (!match.ok) {
      return {
        ok: false,
        skill: chosenKind === 'movie' ? 'movie-play' : 'audio-play',
        cleanedCommand: cleaned,
        robosUser: activeUser,
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
        targetIp: match.targetIp || null,
        robosUser: activeUser,
      });
    }

    return {
      ok: true,
      skill: chosenKind === 'movie' ? 'movie-play' : 'audio-play',
      cleanedCommand: cleaned,
      robosUser: activeUser,
      matchType: match.matchType,
      score: Math.round(match.score),
      bestTrack: match.bestTrack,
      trackCount: match.tracks.length,
      onSpeaker: Boolean(match.onSpeaker),
      targetDevice: match.targetDevice || null,
      targetIp: match.targetIp || null,
      playResult,
      response: match.summaryText,
      data: {
        kind: chosenKind,
        matchType: match.matchType,
        score: Math.round(match.score),
        bestTrack: match.bestTrack,
        trackIds: match.tracks.map(t => t.id),
        targetDevice: match.targetDevice || null,
        targetIp: match.targetIp || null,
        robosUser: activeUser,
      },
    };
  }

  // ── 3. All 48 RobOS Voice Skills + AI Coding Agent Fallback ─────────────────
  let executor = skillsExecutor;
  if (!executor) {
    const { SkillsExecutor } = require('../../voice-prompt/lib/skills-executor');
    executor = new SkillsExecutor();
  }
  const skillRes = await executor.executeCommand(cleaned, {
    source: 'home-assistant-voice-pe',
    robosUser: activeUser,
  });
  return {
    ...skillRes,
    cleanedCommand: cleaned,
    robosUser: activeUser,
    data: skillRes.data && typeof skillRes.data === 'object'
      ? { ...skillRes.data, robosUser: activeUser }
      : { result: skillRes.data || null, robosUser: activeUser },
  };
}

module.exports = {
  parseWatchStatusQuery,
  answerWatchStatus,
  stripWakePhrase,
  phoneticCode,
  jaroWinkler,
  isGenuineTabletopCommand,
  loadCastDevices,
  resolveTargetDevice,
  extractDeviceFromCommand,
  parseSeasonEpisode,
  parseMediaQuery,
  findBestMediaMatches,
  findUnifiedMediaMatch,
  loadLibraryTracks,
  classifyVoiceCommand,
  executeNabuCommand,
};

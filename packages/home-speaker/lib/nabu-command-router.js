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
 * Strip wake words ("Hello Nabu", "Okay Nabu", "Hey Nabu", "Commander", etc.)
 * and polite prefixes from the start of a voice transcript.
 */
function stripWakePhrase(rawText) {
  let s = String(rawText || '').trim();
  const wakeRegex = /^(?:(?:hello|hey|hi|okay|ok|yo)\s+)?(?:nabu|na\s+bu|naboo|commander|computer|assistant)\b[,.:;!\-\s]*/i;
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
  if (/^(?:all\s+(?:smart\s+)?tvs|every\s+(?:smart\s+)?tv|all\s+screens)$/i.test(qRaw)) {
    return {
      ip: 'all',
      id: 'all',
      name: 'All Smart TVs',
      deviceType: 'tv',
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
    const specificDevNameTokens = nameTokens.filter(t => !LOW_IDF_WORDS.has(t) && !['tv', 'television', 'smart', 'speaker', 'speakers'].includes(t));

    let score = 0;

    // Exact name match
    if (nameNorm === qRaw) {
      score += 170;
    } else if (` ${nameNorm} `.includes(` ${qRaw} `) || ` ${combinedNorm} `.includes(` ${qRaw} `)) {
      score += 125;
    } else if (specificDevNameTokens.length > 0 && specificDevNameTokens.every(dt => tokenSimilarity(dt, qTokens) >= 0.88)) {
      // Custom-named RobOS Smart TVs (e.g. "Garage Projector", "Studio Wall Display") match even without hardcoded cue words
      score += 135;
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
    /^(.+?)\s+(?:on|to|onto)\s+(?:the\s+|my\s+|our\s+)?["“”']?([a-z0-9\s"“”'.-]+?)["“”']?(?:\s+(?:right\s+now|please|for\s+me|for\s+us))?$/i,
    /^(.+?)\s+in\s+(?:the\s+)?["“”']?((?:living\s+room|basement|kitchen|master\s+bedroom|bedroom|studio|office)(?:\s+(?:tv|roku|oled|display|speaker|clock))?)["“”']?(?:\s+(?:right\s+now|please|for\s+me))?$/i,
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

function isHeadlessEnvironment() {
  if (process.env.ROBOS_HEADLESS === '1' || process.env.ROBOS_HEADLESS === 'true') return true;
  if (process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) return true;
  return false;
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
  if (isHeadlessEnvironment()) {
    return client;
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
  /^(?:play|watch|put\s+on|start)\s+(?:the\s+)?next\s+episode\s+(?:of|in|for)\s+(.+)$/,
  /^(?:continue|resume|keep)\s+watching\s+(.+)$/,
  /^resume\s+(?:the\s+(?:show|series)\s+)?(.+)$/,
  /^(?:pick\s+up|start)\s+(.+?)\s+where\s+(?:we|i)\s+left\s+off$/,
];

function cleanWatchTitle(t) {
  return String(t || '')
    .replace(/^(?:the\s+(?:show|series|tv\s+show|movie|film)\s+|(?:show|series|movie|film)\s+)/, '')
    .replace(/\s+(?:yet|already|again|please|now|right\s+now|on\s+(?:the\s+)?(?:tv|roku|roku\s+tv|chromecast|television))$/, '')
    .replace(/\s+(?:on|at|in|with)$/, '')
    .trim();
}

/** "what season of breaking bad did we leave off on" → { type: 'watch-status', scope: 'show', title: 'breaking bad' } */
function parseWatchStatusQuery(cleanedText, { configDir = path.join(os.homedir(), '.config', 'robos'), devices = null } = {}) {
  const { mediaCommand, targetDevice } = extractDeviceFromCommand(cleanedText, { configDir, devices });
  const qFull = foldText(cleanedText).replace(/\s+(?:please|robos|nabu)$/, '');
  const qMedia = foldText(mediaCommand).replace(/\s+(?:please|robos|nabu)$/, '');
  if (!qFull) return null;
  for (const re of CONTINUE_PATTERNS) if (re.test(qFull)) return { type: 'watch-status', scope: 'continue', title: '' };
  for (const re of NEXT_EPISODE_PATTERNS) {
    const m = qMedia.match(re) || qFull.match(re);
    if (m && cleanWatchTitle(m[1])) {
      const cand = cleanWatchTitle(m[1]);
      // Don't hijack bare "resume playback" / "resume music" / "resume movie"
      if (/^(?:playback|playing|music|song|track|movie|video|it|this)$/.test(cand)) continue;
      return { type: 'play-next-episode', title: cand, targetDevice: targetDevice || null };
    }
  }
  for (const re of WATCH_STATUS_PATTERNS) { const m = qFull.match(re); if (m && cleanWatchTitle(m[1])) return { type: 'watch-status', scope: 'show', title: cleanWatchTitle(m[1]) }; }
  for (const re of MOVIE_STATUS_PATTERNS) { const m = qFull.match(re); if (m && cleanWatchTitle(m[1])) return { type: 'watch-status', scope: /\b(?:movie|film)\b/.test(qFull) ? 'movie' : 'any', title: cleanWatchTitle(m[1]) }; }
  return null;
}

const WATCHLIST_NOUN = String.raw`(?:(?:movie|tv|show|robos)\s+)?(?:watch\s*lists?|watchlists?|watch\s+later(?:\s+lists?)?)`;
const WATCHLIST_OR_CONTINUE_NOUN = String.raw`(?:${WATCHLIST_NOUN}|continue\s+watching(?:\s+lists?)?)`;

/**
 * Parses natural-language Movie Player Watchlist & Episode-Cursor voice commands:
 *   - "what's on my watch list" / "show our movie watchlist"
 *   - "add Severance to my watch list"
 *   - "remove Family Guy from my watch list" / "take Dune off our watchlist"
 *   - "mark all episodes of Severance as new" / "mark Family Guy as unwatched"
 *   - "my/our current episode of {show} is {exp}" / "update {show} to S02E05" / "we're on season 2 episode 3 of {show}"
 */
function parseWatchlistCommand(cleanedText) {
  const raw = String(cleanedText || '').replace(/^\/movie-watchlist\s*/i, '').trim();
  const q = foldText(raw).replace(/\s+(?:please|right\s+now|now|for\s+me|for\s+us|in\s+(?:robos\s+)?movie\s+player|on\s+(?:robos\s+)?movie\s+player)$/, '').trim();
  if (!q) return null;

  // 1. Set current episode cursor ("my/our current episode of {show} is {exp}")
  const currentPatterns = [
    // "my/our/the current episode of/in/for {show} is/to {exp}"
    /^(?:(?:set|update|change|make)\s+)?(?:(?:my|our|the)\s+)?current\s+episode\s+(?:of|in|for|on)\s+(.+?)\s+(?:is|to|as|at|now)\s+(.+)$/,
    // "for/in/on {show} my/our current episode is {exp}"
    /^(?:for|in|on)\s+(.+?)\s+(?:my|our|the)\s+current\s+episode\s+is\s+(.+)$/,
    // "mark (all)? (the)? episodes (of|in) {show} (as)? watched up (until|to|through) {exp}"
    /^(?:mark|set)\s+(?:all\s+)?(?:the\s+)?(?:episodes?\s+(?:of|in|for)\s+)?(.+?)\s+(?:as\s+)?(?:watched\s+)?up\s+(?:until|to|till)\s+(.+)$/,
  ];
  for (const re of currentPatterns) {
    const m = q.match(re);
    if (m && cleanWatchTitle(m[1]) && m[2].trim()) {
      return {
        type: 'movie-watchlist',
        action: 'set-current',
        show: cleanWatchTitle(m[1]),
        ep: m[2].trim(),
      };
    }
  }

  // "we are on / i'm on / we're at / we got up to {epSpec} (of|in|for) {show}"
  const EP_CUE = String.raw`(?:s\d+\s*e\d+|\d+\s*x\s*\d+|season\s+[a-z0-9\s]+?(?:episode\s+[a-z0-9\s]+?)?|episode\s+[a-z0-9\s]+?)`;
  const weAreOnMatch = q.match(new RegExp(String.raw`^(?:we\s+are|we\s+re|were|i\s+am|i\s+m|im)\s+(?:now\s+|currently\s+)?(?:on|at|up\s+to)\s+(${EP_CUE})\s+(?:of|in|for|on)\s+(.+)$`));
  if (weAreOnMatch && cleanWatchTitle(weAreOnMatch[2])) {
    return {
      type: 'movie-watchlist',
      action: 'set-current',
      show: cleanWatchTitle(weAreOnMatch[2]),
      ep: weAreOnMatch[1].trim(),
    };
  }

  // "update/set {show} (current episode)? to {epSpec}" (requires explicit episode/season cue so we don't collide with unrelated "set X to Y")
  const updateToMatch = q.match(/^(?:update|set|move|advance)\s+(.+?)(?:\s+current\s+episode|\s+progress)?\s+to\s+(.+)$/);
  if (updateToMatch && /\b(?:s\d+\s*e\d+|\d+\s*x\s*\d+|season\s+\w+|episode\s+\w+|ep\s+\w+)\b/.test(updateToMatch[2])) {
    const showClean = cleanWatchTitle(updateToMatch[1]);
    if (showClean && !/\b(?:voice|volume|speaker|light|lights|brightness|calendar|task)\b/.test(showClean)) {
      return {
        type: 'movie-watchlist',
        action: 'set-current',
        show: showClean,
        ep: updateToMatch[2].trim(),
      };
    }
  }

  // 2. Mark all episodes (or a season) as new / unwatched
  // Season-scoped: "mark season 2 of {show} as new/unwatched" or "mark {show} season 2 as new/unwatched"
  const normNums = normalizeNumberTokens(q);
  let seasonNewMatch = normNums.match(/^(?:mark|set|reset)\s+(?:all\s+(?:the\s+)?episodes?\s+(?:of|in)\s+)?season\s+(\d{1,3})\s+(?:of|in|for)\s+(.+?)(?:\s+(?:as\s+|to\s+)?(?:all\s+)?(?:brand\s+)?(?:new|unwatched|unread))?$/);
  if (seasonNewMatch && /\b(?:new|unwatched|reset)\b/.test(normNums)) {
    const showClean = cleanWatchTitle(seasonNewMatch[2]);
    if (showClean) return { type: 'movie-watchlist', action: 'mark-new', show: showClean, season: Number(seasonNewMatch[1]) };
  }
  seasonNewMatch = normNums.match(/^(?:mark|set|reset)\s+(.+?)\s+season\s+(\d{1,3})\s+(?:episodes?\s+)?(?:as\s+|to\s+)?(?:all\s+)?(?:brand\s+)?(?:new|unwatched)$/);
  if (seasonNewMatch && cleanWatchTitle(seasonNewMatch[1])) {
    return { type: 'movie-watchlist', action: 'mark-new', show: cleanWatchTitle(seasonNewMatch[1]), season: Number(seasonNewMatch[2]) };
  }

  const markNewPatterns = [
    // "mark all (the)? episodes of/in/for {show} (as)? (brand)? new / unwatched"
    /^(?:mark|set)\s+(?:all\s+|every\s+)?(?:the\s+)?episodes?\s+(?:of|in|for|on)\s+(.+?)\s+(?:as\s+|to\s+)?(?:all\s+)?(?:brand\s+)?(?:new|unwatched)$/,
    // "mark all (the)? {show} episodes (as)? new / unwatched"
    /^(?:mark|set)\s+(?:all\s+|every\s+)?(?:the\s+)?(.+?)\s+episodes?\s+(?:as\s+|to\s+)?(?:all\s+)?(?:brand\s+)?(?:new|unwatched)$/,
    // "mark {show} as new / unwatched" | "mark {show} unwatched"
    /^(?:mark|set)\s+(.+?)\s+(?:(?:as|to)\s+(?:all\s+)?(?:brand\s+)?(?:new|unwatched)|unwatched)$/,
    // "mark all episodes as new for/in/of {show}"
    /^(?:mark|set)\s+(?:all\s+|every\s+)?(?:the\s+)?episodes?\s+(?:as\s+|to\s+)?(?:brand\s+)?(?:new|unwatched)\s+(?:for|in|of|on)\s+(.+)$/,
    // "reset watch progress/history for {show}" | "reset all episodes of {show}"
    /^reset\s+(?:(?:my|our|the)\s+)?(?:watch\s+(?:progress|history|status)|all\s+(?:the\s+)?episodes?|episodes?)\s+(?:for|of|in|on)\s+(.+)$/,
    /^reset\s+(.+?)\s+(?:watch\s+(?:progress|history|status)|episodes?)$/,
  ];
  for (const re of markNewPatterns) {
    const m = q.match(re);
    if (m && cleanWatchTitle(m[1])) {
      return { type: 'movie-watchlist', action: 'mark-new', show: cleanWatchTitle(m[1]), season: null };
    }
  }

  // 2.5 Mark all episodes (or a season) as watched
  let seasonWatchedMatch = normNums.match(/^(?:mark|set)\s+(?:all\s+(?:the\s+)?episodes?\s+(?:of|in)\s+)?season\s+(\d{1,3})\s+(?:of|in|for)\s+(.+?)\s+(?:as\s+)?(?:watched|seen|finished|complete|completed)$/);
  if (seasonWatchedMatch && cleanWatchTitle(seasonWatchedMatch[2])) {
    return { type: 'movie-watchlist', action: 'mark-watched', show: cleanWatchTitle(seasonWatchedMatch[2]), season: Number(seasonWatchedMatch[1]) };
  }
  seasonWatchedMatch = normNums.match(/^(?:mark|set)\s+(.+?)\s+season\s+(\d{1,3})\s+(?:as\s+)?(?:watched|seen|finished|complete|completed)$/);
  if (seasonWatchedMatch && cleanWatchTitle(seasonWatchedMatch[1])) {
    return { type: 'movie-watchlist', action: 'mark-watched', show: cleanWatchTitle(seasonWatchedMatch[1]), season: Number(seasonWatchedMatch[2]) };
  }
  const markWatchedMatch = q.match(/^(?:mark|set)\s+(?:all\s+(?:the\s+)?episodes?\s+(?:of|in|for)\s+)?(.+?)(?:\s+episodes?)?\s+(?:as\s+)?(?:watched|finished|completed)$/);
  if (markWatchedMatch && cleanWatchTitle(markWatchedMatch[1])) {
    return { type: 'movie-watchlist', action: 'mark-watched', show: cleanWatchTitle(markWatchedMatch[1]), season: null };
  }

  // 3. List / read Watchlist ("what's on my watch list", "read our movie watchlist", "show my watchlist")
  const listPatterns = [
    new RegExp(String.raw`^(?:whats|what\s+is|what\s+s|what\s+are)\s+(?:currently\s+)?(?:on|in)\s+(?:(?:my|our|the)\s+)?${WATCHLIST_NOUN}$`),
    new RegExp(String.raw`^(?:show|list|read|view|check|tell\s+me|what\s+is)\s+(?:me\s+|us\s+)?(?:(?:my|our|the)\s+)?${WATCHLIST_NOUN}$`),
  ];
  for (const re of listPatterns) {
    if (re.test(q)) return { type: 'movie-watchlist', action: 'list' };
  }

  // 4. Remove from Watchlist / Continue Watching
  const removePatterns = [
    new RegExp(String.raw`^(?:remove|delete|drop|clear)\s+(.+?)\s+(?:from|off(?:\s+of)?)\s+(?:(?:my|our|the)\s+)?${WATCHLIST_OR_CONTINUE_NOUN}$`),
    new RegExp(String.raw`^(?:take|pull)\s+(.+?)\s+off(?:\s+of)?\s+(?:(?:my|our|the)\s+)?${WATCHLIST_OR_CONTINUE_NOUN}$`),
    new RegExp(String.raw`^(?:remove|delete)\s+(?:from\s+)?(?:(?:my|our|the)\s+)?${WATCHLIST_OR_CONTINUE_NOUN}\s+(.+)$`),
  ];
  for (const re of removePatterns) {
    const m = q.match(re);
    if (m && cleanWatchTitle(m[1])) {
      const explicitMovie = /\b(?:movie|film)\b/.test(m[1]);
      const explicitShow = /\b(?:show|series|tv\s+show)\b/.test(m[1]);
      return {
        type: 'movie-watchlist',
        action: 'remove',
        title: cleanWatchTitle(m[1]),
        kind: explicitMovie ? 'movie' : (explicitShow ? 'tv' : null),
      };
    }
  }

  // 5. Add to Watchlist
  const addPatterns = [
    new RegExp(String.raw`^(?:add|put|save|queue)\s+(.+?)\s+(?:to|on|onto|in|into)\s+(?:(?:my|our|the)\s+)?${WATCHLIST_NOUN}$`),
    new RegExp(String.raw`^(?:watchlist|watch\s+later)\s+(.+)$`),
  ];
  for (const re of addPatterns) {
    const m = q.match(re);
    if (m && cleanWatchTitle(m[1])) {
      const explicitMovie = /\b(?:movie|film)\b/.test(m[1]);
      const explicitShow = /\b(?:show|series|tv\s+show)\b/.test(m[1]);
      return {
        type: 'movie-watchlist',
        action: 'add',
        title: cleanWatchTitle(m[1]),
        kind: explicitMovie ? 'movie' : (explicitShow ? 'tv' : null),
      };
    }
  }

  // 6. Import Watch History ("import my watch history", "import plex watch history", "import watch history from ~/Downloads/plex-watch-history.json")
  const importPathMatch = raw.match(/^(?:import|load)\s+(?:(?:my|our|the)\s+)?(?:plex\s+)?watch\s+history(?:\s+(?:file\s+)?from\s+(.+))?$/i);
  if (importPathMatch) {
    const rawFrom = (importPathMatch[1] || '').trim().replace(/^["']|["']$/g, '');
    const explicitFile = rawFrom && (rawFrom.includes('/') || rawFrom.includes('\\') || /\.(?:json|csv|tsv)$/i.test(rawFrom))
      ? rawFrom
      : null;
    return {
      type: 'movie-watchlist',
      action: 'import',
      filePath: explicitFile,
    };
  }

  return null;
}

/** Executes a parsed `movie-watchlist` intent via `robos-lib/media-watch`. */
async function executeWatchlistCommand(intent, { configDir } = {}) {
  const watch = requireMediaWatch();
  if (!watch) return { ok: false, response: 'RobOS media watchlist is not installed on this computer.' };
  const opts = { configDir };
  let res;
  switch (intent.action) {
    case 'list':
      res = await watch.watchlist(opts);
      break;
    case 'add':
      res = await watch.addToWatchlist({ query: intent.title, kind: intent.kind || null, ...opts });
      break;
    case 'remove':
      res = await watch.removeFromWatchlist({ query: intent.title, kind: intent.kind || null, ...opts });
      break;
    case 'mark-new':
      res = await watch.markAllNew({ show: intent.show, season: intent.season ?? null, ...opts });
      break;
    case 'mark-watched':
      res = await watch.setWatched({ show: intent.show, season: intent.season ?? null, watched: true, ...opts });
      break;
    case 'set-current':
      res = await watch.setCurrentEpisode({ show: intent.show, ep: intent.ep, ...opts });
      break;
    case 'import':
      res = await watch.importWatchHistory({ filePath: intent.filePath || null, ...opts });
      break;
    default:
      return { ok: false, response: 'Unsupported movie watchlist action.' };
  }
  return {
    ok: Boolean(res && res.ok),
    response: (res && (res.spoken || res.error)) || 'Updated your Movie Player watchlist.',
    data: res || null,
  };
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

// ── Cinema & Named RobOS Smart TV Voice Commands ─────────────────────────────

const GENRE_SYNONYMS = {
  'sci fi': ['sci fi', 'scifi', 'science fiction'],
  'science fiction': ['sci fi', 'scifi', 'science fiction'],
  scary: ['horror', 'thriller'],
  horror: ['horror'],
  funny: ['comedy'],
  comedy: ['comedy'],
  animated: ['animation', 'animated', 'family'],
  animation: ['animation', 'animated'],
  kids: ['family', 'animation', 'kids', 'children'],
  family: ['family', 'animation'],
  action: ['action', 'adventure'],
  adventure: ['adventure', 'action'],
  thriller: ['thriller', 'mystery', 'suspense'],
  drama: ['drama'],
  fantasy: ['fantasy'],
  romance: ['romance', 'romantic'],
  documentary: ['documentary'],
};

function shuffleCopy(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function readWatchedKeyAndTrackSets(configDir) {
  const watchedIds = new Set();
  const watchedKeys = new Set();
  try {
    const statsRaw = JSON.parse(fs.readFileSync(path.join(configDir, 'movie-track-stats.json'), 'utf8'));
    for (const [id, st] of Object.entries(statsRaw?.tracks || {})) {
      if (st && st.completed) watchedIds.add(id);
    }
  } catch {}
  try {
    const histRaw = JSON.parse(fs.readFileSync(path.join(configDir, 'media-history', 'movie-player.json'), 'utf8'));
    for (const [k, ent] of Object.entries(histRaw?.entries || {})) {
      if (ent && ent.completed) watchedKeys.add(k);
    }
  } catch {}
  return { watchedIds, watchedKeys };
}

function findShowEpisodePool(showQuery, movieTracks = [], { seasonNumber = null } = {}) {
  let canonicalShowPartsFn = null;
  try {
    canonicalShowPartsFn = require('../../robos-lib/watch-history-import').canonicalShowParts;
  } catch {}
  let historyLib = null;
  try {
    historyLib = require('../../robos-lib/media-history');
  } catch {}

  const tvTracks = (Array.isArray(movieTracks) ? movieTracks : []).filter(t =>
    t && (t.mediaType === 'tv' || (t.showName && t.seasonNumber != null && t.episodeNumber != null))
  );
  if (!tvTracks.length) return { ok: false, error: 'Your TV show library is empty.' };

  const distinctShows = [...new Set(tvTracks.map(t => String(t.showName || t.album || '').trim()).filter(Boolean))];
  const qNorm = normalizeNumberTokens(showQuery);

  // Match best show name via media-history bestMatch + tokenSimilarity
  let bestName = null;
  let bestScore = 0;
  for (const name of distinctShows) {
    const s1 = historyLib ? historyLib.titleScore(showQuery, name) : 0;
    const nNorm = normalizeNumberTokens(name);
    const s2 = nNorm === qNorm ? 1.0 : jaroWinkler(qNorm, nNorm) * 0.85;
    const sc = Math.max(s1, s2);
    if (sc > bestScore) {
      bestScore = sc;
      bestName = name;
    }
  }
  if (!bestName || bestScore < 0.5) {
    return { ok: false, error: `Could not find a TV show matching "${showQuery}" in your library.` };
  }

  const matchedParts = canonicalShowPartsFn ? canonicalShowPartsFn(bestName) : { base: foldText(bestName), aliases: [foldText(bestName)] };
  const targetAliases = new Set(matchedParts.aliases || [matchedParts.base]);

  // Gather episodes across all folder variants of the same canonical show, deduplicating by (season, episode)
  const byEp = new Map();
  for (const t of tvTracks) {
    const sName = String(t.showName || t.album || '').trim();
    const parts = canonicalShowPartsFn ? canonicalShowPartsFn(sName) : { aliases: [foldText(sName)] };
    const sharesAlias = (parts.aliases || []).some(a => targetAliases.has(a));
    if (!sharesAlias) continue;
    const s = Number(t.seasonNumber ?? t.discNumber ?? 1);
    const e = Number(t.episodeNumber ?? t.trackNumber ?? 1);
    if (seasonNumber != null && s !== Number(seasonNumber)) continue;
    const k = `${s}:${e}`;
    if (!byEp.has(k)) {
      byEp.set(k, t);
    } else {
      // Prefer track whose showName is cleanest (shortest) or has episodeTitle
      const cur = byEp.get(k);
      if ((!cur.episodeTitle && t.episodeTitle) || String(t.showName || '').length < String(cur.showName || '').length) {
        byEp.set(k, t);
      }
    }
  }

  const episodes = [...byEp.values()].sort((a, b) =>
    (Number(a.seasonNumber || 1) - Number(b.seasonNumber || 1)) ||
    (Number(a.episodeNumber || 1) - Number(b.episodeNumber || 1))
  );

  // Pick cleanest display label (e.g. "House" over "House (2004) Season 1-8 S01-S08")
  const candidateLabels = [...new Set(episodes.map(t => String(t.showName || '').trim()).filter(Boolean))]
    .sort((a, b) => a.length - b.length);
  const showLabel = candidateLabels[0] || bestName;

  if (!episodes.length) {
    return {
      ok: false,
      show: showLabel,
      error: seasonNumber != null
        ? `Could not find Season ${seasonNumber} of ${showLabel} in your library.`
        : `No episodes of ${showLabel} were found in your library.`,
    };
  }

  return { ok: true, show: showLabel, episodes };
}

/**
 * Parses specialized Movie Player & Named Smart TV voice commands:
 *   - "play a random episode of House on the Roku TV"
 *   - "play a random unwatched episode of Family Guy on Basement TV"
 *   - "play a random [horror / 90s / unwatched] movie on the Roku TV"
 *   - "play the latest / newest episode of Ghosts on the Roku TV"
 *   - "play the first episode / pilot of Firefly on the Roku TV" / "start Severance from the beginning on the Roku TV"
 *   - "move playback to the Roku TV" / "stop casting" / "open the movie library on the Roku TV" / "list my smart tvs"
 */
function parseCinemaSpecialCommand(cleanedText, {
  configDir = path.join(os.homedir(), '.config', 'robos'),
  devices = null,
  movieTracks = null,
} = {}) {
  const list = Array.isArray(devices) ? devices : loadCastDevices(configDir);
  const qFull = foldText(cleanedText).replace(/\s+(?:please|right\s+now|now|for\s+me|for\s+us)$/, '').trim();
  if (!qFull) return null;

  // 1. Smart TV discovery ("list my smart tvs", "what smart tvs are paired")
  if (/^(?:list|show|what\s+are|read)\s+(?:(?:my|our|the)\s+)?(?:paired\s+|configured\s+|available\s+)?(?:robos\s+)?smart\s+tvs?$/.test(qFull) ||
      /^(?:what|which)\s+(?:robos\s+)?smart\s+tvs?\s+(?:do\s+(?:i|we)\s+have|are\s+(?:paired|available|connected|online))$/.test(qFull)) {
    return { type: 'smart-tv-control', action: 'list-tvs' };
  }

  // 2. Stop casting / return playback to computer ("stop casting", "disconnect from the roku tv", "move playback to this computer")
  const { mediaCommand, targetDevice } = extractDeviceFromCommand(cleanedText, { configDir, devices: list });
  const qMedia = foldText(mediaCommand).replace(/\s+(?:please|right\s+now|now|for\s+me|for\s+us)$/, '').trim();

  if (/^(?:stop|end|cancel|quit)\s+(?:casting|tv\s+cast|smart\s+tv(?:\s+playback)?)$/.test(qMedia) ||
      /^(?:stop|end|cancel)\s+casting$/.test(qFull) ||
      /^disconnect\s+(?:from\s+)?(?:the\s+|my\s+|our\s+)?.+$/.test(qFull) && (targetDevice || /\b(?:tv|roku|oled|chromecast|cast)\b/.test(qFull))) {
    return { type: 'smart-tv-control', action: 'stop-cast', targetDevice: targetDevice || null };
  }
  if (targetDevice && targetDevice.ip === 'local' &&
      /^(?:move|switch|bring|transfer|send)\s+(?:(?:the|my|our|current)\s+)?(?:playback|movie|show|episode|video|it|this)(?:\s+back)?$/.test(qMedia)) {
    return { type: 'smart-tv-control', action: 'transfer-to-local', targetDevice };
  }

  // 3. Open 10-foot Movie Library on Named Smart TV ("open the movie library on the roku tv", "launch robos movie player on basement tv")
  if (targetDevice && targetDevice.ip !== 'local' && targetDevice.deviceType === 'tv') {
    if (/^(?:open|launch|show|display|bring\s+up)\s+(?:the\s+)?(?:robos\s+)?(?:movie\s+library|cinema\s+library|tv\s+library|movie\s+player|movies\s+browser|library)$/.test(qMedia)) {
      return { type: 'smart-tv-control', action: 'open-tv-library', targetDevice };
    }
    // 4. Transfer live playback to Named Smart TV ("move playback to the roku tv", "cast this to the roku tv", "send this movie to basement tv")
    if (/^(?:move|switch|send|cast|transfer|put)\s+(?:(?:the|my|our|current)\s+)?(?:playback|movie|show|episode|video|stream|this|it)$/.test(qMedia) ||
        /^switch\s+output$/.test(qMedia)) {
      return { type: 'smart-tv-control', action: 'transfer-to-tv', targetDevice };
    }
  }

  // 5. Random Episode of a TV Show ("play a random [unwatched] episode of House [Season 3] [on the Roku TV]")
  const PLAY_LEAD = String.raw`(?:play|playing|plays|place|watch|put\s+on|start|pick|choose|give\s+(?:me|us)|throw\s+on)`;
  const UNWATCHED_OPT = String.raw`(?:(unwatched|new|unseen)\s+)?`;

  const randEpPatterns = [
    // "play a random [unwatched] [season N] episode of {show}"
    new RegExp(String.raw`^${PLAY_LEAD}\s+(?:a\s+|an\s+|some\s+)?random\s+${UNWATCHED_OPT}(?:season\s+(\w+)\s+)?episodes?\s+(?:of|in|from|for)\s+(.+)$`),
    // "play an unwatched / new episode of {show}" (without word "random" -> picks random unwatched or next? Wait: "random unwatched" handled above; "a random ... episode" below)
    new RegExp(String.raw`^surprise\s+(?:me|us)\s+with\s+(?:a\s+|an\s+)?(?:random\s+)?${UNWATCHED_OPT}(?:season\s+(\w+)\s+)?episodes?\s+(?:of|in|from|for)\s+(.+)$`),
  ];
  for (const re of randEpPatterns) {
    const m = qMedia.match(re);
    if (m) {
      const unwatchedOnly = Boolean(m[1]);
      const seasonPrefix = m[2] ? Number(WORD_NUMBERS[m[2]] || m[2]) : null;
      const se = parseSeasonEpisode(m[3]);
      const showClean = cleanWatchTitle(se.strippedText);
      if (showClean) {
        return {
          type: 'cinema-special',
          mode: 'random-episode',
          unwatchedOnly,
          show: showClean,
          seasonNumber: Number.isFinite(seasonPrefix) ? seasonPrefix : se.seasonNumber,
          targetDevice: targetDevice || null,
        };
      }
    }
  }

  // "play a random [unwatched] {show} episode"
  const randShowEpAlt = qMedia.match(new RegExp(String.raw`^${PLAY_LEAD}\s+(?:a\s+|an\s+)?random\s+${UNWATCHED_OPT}(.+?)\s+episodes?$`));
  if (randShowEpAlt && cleanWatchTitle(randShowEpAlt[2])) {
    const se = parseSeasonEpisode(randShowEpAlt[2]);
    return {
      type: 'cinema-special',
      mode: 'random-episode',
      unwatchedOnly: Boolean(randShowEpAlt[1]),
      show: cleanWatchTitle(se.strippedText),
      seasonNumber: se.seasonNumber,
      targetDevice: targetDevice || null,
    };
  }

  // "shuffle [unwatched] episodes of {show} [season N]" or "shuffle {show} on the Roku TV"
  const shuffleEpsMatch = qMedia.match(/^shuffle\s+(?:all\s+)?(?:(unwatched|new|unseen)\s+)?(?:(?:the\s+)?episodes?\s+(?:of|in|from|for)\s+)?(.+)$/);
  if (shuffleEpsMatch) {
    const unwatchedOnly = Boolean(shuffleEpsMatch[1]);
    const explicitEps = /\bepisodes?\b/.test(qMedia);
    const se = parseSeasonEpisode(shuffleEpsMatch[2]);
    const showCand = cleanWatchTitle(se.strippedText);
    if (showCand && (explicitEps || se.seasonNumber != null || (targetDevice && targetDevice.deviceType === 'tv'))) {
      const tracksCheck = Array.isArray(movieTracks) ? movieTracks : loadLibraryTracks('movie', configDir);
      const pool = findShowEpisodePool(showCand, tracksCheck, { seasonNumber: se.seasonNumber });
      if (pool.ok) {
        return {
          type: 'cinema-special',
          mode: 'random-episode',
          unwatchedOnly,
          show: showCand,
          seasonNumber: se.seasonNumber,
          targetDevice: targetDevice || null,
        };
      }
    }
  }

  // 6. Random Movie ("play a random [unwatched] [horror / 90s] movie [on the Roku TV]")
  const randMoviePatterns = [
    new RegExp(String.raw`^${PLAY_LEAD}\s+(?:a\s+|an\s+)?random\s+${UNWATCHED_OPT}(?:([a-z0-9\s]+?)\s+)?(?:movie|film)s?$`),
    /^surprise\s+(?:me|us)\s+with\s+(?:a\s+|an\s+)?(?:(unwatched|new|unseen)\s+)?(?:([a-z0-9\s]+?)\s+)?(?:movie|film)$/,
  ];
  for (const re of randMoviePatterns) {
    const m = qMedia.match(re);
    if (m) {
      return {
        type: 'cinema-special',
        mode: 'random-movie',
        unwatchedOnly: Boolean(m[1]),
        filterPhrase: (m[2] || '').trim() || null,
        targetDevice: targetDevice || null,
      };
    }
  }

  // 7. Latest / Newest Episode ("play the latest/newest episode of {show} [on the Roku TV]")
  const latestMatch = qMedia.match(new RegExp(String.raw`^${PLAY_LEAD}\s+(?:the\s+)?(?:latest|newest|most\s+recent)\s+episode\s+(?:of|in|from|for)\s+(.+)$`));
  if (latestMatch && cleanWatchTitle(latestMatch[1])) {
    return {
      type: 'cinema-special',
      mode: 'latest-episode',
      show: cleanWatchTitle(latestMatch[1]),
      targetDevice: targetDevice || null,
    };
  }

  // 8. First Episode / Pilot / Start From Beginning ("play the pilot of House on the Roku TV", "start Severance from the beginning on the Roku TV")
  const firstPatterns = [
    new RegExp(String.raw`^${PLAY_LEAD}\s+(?:the\s+)?(?:very\s+first\s+episode|first\s+episode|pilot(?:\s+episode)?)\s+(?:of|in|from|for)\s+(.+)$`),
    /^(?:start|play|watch|restart|begin)\s+(.+?)\s+from\s+(?:the\s+)?(?:very\s+)?(?:beginning|start|first\s+episode|episode\s+(?:1|one))$/,
  ];
  for (const re of firstPatterns) {
    const m = qMedia.match(re);
    if (m && cleanWatchTitle(m[1])) {
      return {
        type: 'cinema-special',
        mode: 'from-beginning',
        title: cleanWatchTitle(m[1]),
        targetDevice: targetDevice || null,
      };
    }
  }

  return null;
}

function resolveCinemaSpecialPlayback(intent, movieTracks = [], { configDir = path.join(os.homedir(), '.config', 'robos') } = {}) {
  const targetDevice = intent.targetDevice || null;
  const targetIp = targetDevice ? targetDevice.ip : null;
  const deviceSuffix = targetDevice && targetDevice.ip !== 'local'
    ? ` on ${targetDevice.name}`
    : ' in RobOS Movie Player';
  let historyLib = null;
  try { historyLib = require('../../robos-lib/media-history'); } catch {}

  if (intent.mode === 'random-episode') {
    const poolRes = findShowEpisodePool(intent.show, movieTracks, { seasonNumber: intent.seasonNumber });
    if (!poolRes.ok) return { ok: false, error: poolRes.error };

    let candidates = poolRes.episodes;
    let unwatchedFallbackNote = '';
    if (intent.unwatchedOnly) {
      const { watchedIds, watchedKeys } = readWatchedKeyAndTrackSets(configDir);
      const unwatched = candidates.filter(t => {
        if (watchedIds.has(t.id)) return false;
        const pk = historyLib ? historyLib.mediaKey(t) : null;
        if (pk && watchedKeys.has(pk)) return false;
        return true;
      });
      if (unwatched.length > 0) {
        candidates = unwatched;
      } else {
        unwatchedFallbackNote = ' (all episodes are already watched, so picking from the full series)';
      }
    }

    const shuffled = shuffleCopy(candidates);
    const chosen = shuffled[0];
    const s = Number(chosen.seasonNumber ?? 1);
    const e = Number(chosen.episodeNumber ?? 1);
    const cleanEpTitle = chosen.episodeTitle && !/^episode\s+\d+$/i.test(chosen.episodeTitle)
      ? ` ("${chosen.episodeTitle}")`
      : '';
    const seasonNote = intent.seasonNumber != null ? ` Season ${intent.seasonNumber}` : '';
    const unwatchedNote = intent.unwatchedOnly && !unwatchedFallbackNote ? ' unwatched' : '';

    return {
      ok: true,
      kind: 'movie',
      matchType: 'tv-random-episode',
      bestTrack: chosen,
      tracks: shuffled.slice(0, 40),
      shuffle: false,
      keepFirst: true,
      startAt: 0,
      targetDevice,
      targetIp,
      summaryText: `Playing a random${unwatchedNote} episode of ${poolRes.show}${seasonNote}: Season ${s}, Episode ${e}${cleanEpTitle}${deviceSuffix}${unwatchedFallbackNote}.`,
    };
  }

  if (intent.mode === 'random-movie') {
    const allMovies = (Array.isArray(movieTracks) ? movieTracks : []).filter(t => t && t.mediaType === 'movie');
    if (!allMovies.length) return { ok: false, error: 'Your movie library is empty.' };

    // Exclude numbered tutorial/course videos (e.g. "001 Section Intro") when real feature films exist
    const featureFilms = allMovies.filter(t => !/^\d{3}\s/.test(String(t.title || '').trim()));
    let pool = featureFilms.length ? featureFilms : allMovies;

    let filterDesc = '';
    if (intent.filterPhrase) {
      const fp = foldText(intent.filterPhrase);
      const decadeMatch = fp.match(/^(?:19|20)?(\d0)s$/);
      if (decadeMatch) {
        const twoDigit = Number(decadeMatch[1]);
        const startYear = fp.length >= 5 ? Number(fp.slice(0, 4)) : (twoDigit >= 30 ? 1900 + twoDigit : 2000 + twoDigit);
        const byDecade = pool.filter(t => Number(t.year) >= startYear && Number(t.year) < startYear + 10);
        if (!byDecade.length) {
          return { ok: false, error: `Could not find any ${intent.filterPhrase} movies in your library.` };
        }
        pool = byDecade;
        filterDesc = ` ${intent.filterPhrase}`;
      } else {
        const expanded = GENRE_SYNONYMS[fp] || [fp];
        const byGenre = pool.filter(t => {
          const hay = foldText(`${t.genre || ''} ${(t.tags || []).join(' ')} ${t.overview || ''} ${t.title || ''}`);
          return expanded.some(term => hay.includes(term));
        });
        if (!byGenre.length) {
          return { ok: false, error: `Could not find any "${intent.filterPhrase}" movies in your library.` };
        }
        pool = byGenre;
        filterDesc = ` ${intent.filterPhrase}`;
      }
    }

    if (intent.unwatchedOnly) {
      const { watchedIds, watchedKeys } = readWatchedKeyAndTrackSets(configDir);
      const unwatched = pool.filter(t => {
        if (watchedIds.has(t.id)) return false;
        const pk = historyLib ? historyLib.mediaKey(t) : null;
        if (pk && watchedKeys.has(pk)) return false;
        return true;
      });
      if (unwatched.length) pool = unwatched;
    }

    const shuffled = shuffleCopy(pool);
    const chosen = shuffled[0];
    const unwatchedLabel = intent.unwatchedOnly ? ' unwatched' : '';
    return {
      ok: true,
      kind: 'movie',
      matchType: 'random-movie',
      bestTrack: chosen,
      tracks: [chosen],
      shuffle: false,
      keepFirst: true,
      startAt: 0,
      targetDevice,
      targetIp,
      summaryText: `Playing a random${unwatchedLabel}${filterDesc} movie: "${chosen.title}"${chosen.year ? ` (${chosen.year})` : ''}${deviceSuffix}.`,
    };
  }

  if (intent.mode === 'latest-episode') {
    const poolRes = findShowEpisodePool(intent.show, movieTracks);
    if (!poolRes.ok) return { ok: false, error: poolRes.error };
    const latest = poolRes.episodes[poolRes.episodes.length - 1];
    const s = Number(latest.seasonNumber ?? 1);
    const e = Number(latest.episodeNumber ?? 1);
    const cleanEpTitle = latest.episodeTitle && !/^episode\s+\d+$/i.test(latest.episodeTitle)
      ? ` ("${latest.episodeTitle}")`
      : '';
    return {
      ok: true,
      kind: 'movie',
      matchType: 'tv-latest-episode',
      bestTrack: latest,
      tracks: [latest],
      shuffle: false,
      keepFirst: true,
      startAt: null,
      targetDevice,
      targetIp,
      summaryText: `Playing the latest episode of ${poolRes.show}: Season ${s}, Episode ${e}${cleanEpTitle}${deviceSuffix}.`,
    };
  }

  if (intent.mode === 'from-beginning') {
    // Check if title matches a TV show first; otherwise match a Movie and start at 0:00
    const poolRes = findShowEpisodePool(intent.title, movieTracks);
    if (poolRes.ok && poolRes.episodes.length) {
      const regularEps = poolRes.episodes.filter(t => Number(t.seasonNumber ?? 1) >= 1);
      const list = regularEps.length ? regularEps : poolRes.episodes;
      const first = list[0];
      const firstSeason = list.filter(t => Number(t.seasonNumber) === Number(first.seasonNumber));
      const s = Number(first.seasonNumber ?? 1);
      const e = Number(first.episodeNumber ?? 1);
      const cleanEpTitle = first.episodeTitle && !/^episode\s+\d+$/i.test(first.episodeTitle)
        ? ` ("${first.episodeTitle}")`
        : '';
      return {
        ok: true,
        kind: 'movie',
        matchType: 'tv-first-episode',
        bestTrack: first,
        tracks: firstSeason.slice(0, 30),
        shuffle: false,
        keepFirst: true,
        startAt: 0,
        targetDevice,
        targetIp,
        summaryText: `Starting ${poolRes.show} from the beginning: Season ${s}, Episode ${e}${cleanEpTitle}${deviceSuffix}.`,
      };
    }

    const movieHit = findBestMediaMatches(`play movie ${intent.title}`, movieTracks, { kind: 'movie', configDir });
    if (movieHit.ok && movieHit.bestTrack) {
      const m = movieHit.bestTrack;
      return {
        ok: true,
        kind: 'movie',
        matchType: 'movie',
        bestTrack: m,
        tracks: [m],
        shuffle: false,
        keepFirst: true,
        startAt: 0,
        targetDevice,
        targetIp,
        summaryText: `Starting "${m.title}"${m.year ? ` (${m.year})` : ''} from the beginning${deviceSuffix}.`,
      };
    }
    return { ok: false, error: `Could not find "${intent.title}" in your movie or TV library.` };
  }

  return { ok: false, error: 'Unsupported cinema voice command.' };
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

  // 1. Transport controls (exact, phonetic, or Smart TV scoped like "pause on the roku tv", "next episode", "start over")
  const { mediaCommand: transportCore, targetDevice: transportDevice } = extractDeviceFromCommand(cleanedText, { configDir });
  const qTransport = foldText(transportCore);
  const preferMovieTransport = Boolean(
    /\b(?:movie|film|episode|show|series|video|cinema)\b/.test(qTransport) ||
    (transportDevice && transportDevice.deviceType === 'tv')
  );
  if (/^(?:pause|paws|pos|pause\s+(?:the\s+)?(?:music|song|movie|episode|show|video|playback)|hold\s+on)$/.test(qTransport)) {
    return { type: 'transport', action: 'pause', preferMoviePlayer: preferMovieTransport, targetDevice: transportDevice || null };
  }
  if (/^(?:resume|continue|unpause|(?:resume|continue)\s+(?:the\s+)?(?:music|song|movie|episode|show|video|playback)|keep\s+playing)$/.test(qTransport)) {
    return { type: 'transport', action: 'resume', preferMoviePlayer: preferMovieTransport, targetDevice: transportDevice || null };
  }
  if (/^(?:next|skip|next\s+(?:song|track|movie|episode|video)|skip\s+(?:this\s+)?(?:song|track|episode|movie))$/.test(qTransport)) {
    return { type: 'transport', action: 'next', preferMoviePlayer: preferMovieTransport, targetDevice: transportDevice || null };
  }
  if (/^(?:previous|prev|go\s+back|previous\s+(?:song|track|movie|episode|video)|last\s+(?:song|track|episode))$/.test(qTransport)) {
    return { type: 'transport', action: 'previous', preferMoviePlayer: preferMovieTransport, targetDevice: transportDevice || null };
  }
  if (/^(?:start\s+over|restart|restart\s+(?:this\s+|the\s+)?(?:movie|episode|video|song|track))$/.test(qTransport)) {
    return { type: 'transport', action: 'restart', preferMoviePlayer: preferMovieTransport || !/\b(?:song|track)\b/.test(qTransport), targetDevice: transportDevice || null };
  }

  // 1.5 Voice Identity & Spoken Voice Onboarding intents
  if (/^(?:who\s+am\s+i|whose\s+voice\s+is\s+this|who\s+is\s+(?:speaking|talking)|do\s+you\s+(?:know|recognize)\s+(?:my\s+voice|who\s+i\s+am)|what\s+is\s+my\s+name|identify\s+my\s+voice)$/.test(q)) {
    return { type: 'voice-whoami', query: cleanedText };
  }
  const enrollMatch = cleanedText.match(/^(?:(?:remember|enroll|register|save|onboard)\s+my\s+voice\s+as|my\s+name\s+is|i\s+am\s+speaking\s+as|this\s+is\s+the\s+voice\s+of)\s+([a-zA-Z][a-zA-Z0-9\s.'-]{1,40}?)[.!?]*$/i);
  if (enrollMatch) {
    return { type: 'voice-enroll', targetName: enrollMatch[1].trim(), query: cleanedText };
  }

  // 1.6 Watchlist management ("remove X from watch list", "mark all episodes of X as new", "my current episode of X is S02E04") & Watch status
  const watchlistIntent = parseWatchlistCommand(cleanedText);
  if (watchlistIntent) return { ...watchlistIntent, query: cleanedText };
  const watchIntent = parseWatchStatusQuery(cleanedText, { configDir });
  if (watchIntent) return { ...watchIntent, query: cleanedText };

  // 1.7 Specialized Cinema & Named Smart TV Commands ("play a random episode of House on the Roku TV", "move playback to the Roku TV", etc.)
  const cinemaSpecial = parseCinemaSpecialCommand(cleanedText, { configDir, movieTracks });
  if (cinemaSpecial) return { ...cinemaSpecial, query: cleanedText };

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
    !/\b(?:watch\s*lists?|watchlists?|watch\s+later)\b/i.test(normShopQ) && (
      /\b(?:shopping\s+lists?|grocery(?:\s+shopping)?(?:\s+lists?)?|target(?:\s+shopping)?\s+lists?|costco(?:\s+shopping)?(?:\s+lists?)?|@(?:grocery|target|costco))\b/i.test(normShopQ) ||
      /\b(?:to|on|in|from|at|for)\s+(?:[a-z0-9'\-\s]{1,30}\s+)?(?:grocery|target|costco|shopping|lists?)\b/i.test(normShopQ)
    )
  ) {
    return { type: 'robos-skill', query: cleanedText };
  }

  // 2.2 If it's a Google Calendar / Appointments command ("add an appointment to the kids calendar Friday at 2pm", "add a new medical appointment to the kids calendar"), route to robos-skill
  let normCalQ = q;
  try {
    const { normalizeCalendarVoiceTranscript } = require('../../google-calendar/lib/named-calendars');
    normCalQ = normalizeCalendarVoiceTranscript(cleanedText).toLowerCase();
  } catch {}
  if (/\b(?:calendar|calendars|appointment|appointments)\b/i.test(normCalQ) || /^(?:schedule|book)\b/i.test(normCalQ)) {
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
  const headlessTvCast = require('../../robos-lib/headless-tv-cast');

  // ── 0.45 Movie Player Watchlist & Episode Cursor ("remove X from watch list", "mark all episodes of X as new", "my current episode of X is S02E04") ──
  if (intent.type === 'movie-watchlist') {
    const wlRes = await executeWatchlistCommand(intent, { configDir });
    return {
      ok: wlRes.ok,
      skill: 'movie-watchlist',
      cleanedCommand: cleaned,
      robosUser: activeUser,
      response: wlRes.response,
      data: wlRes.data || null,
    };
  }

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
    const targetDev = intent.targetDevice || extractDeviceFromCommand(cleaned, { configDir, devices: castDevices }).targetDevice;
    const res = await watch.playNextEpisode({ show: intent.title, targetIp: (targetDev && targetDev.ip) || null, configDir });
    const tvNote = targetDev && targetDev.ip !== 'local' && res && res.ok ? ` Casting to ${targetDev.name}.` : '';
    return {
      ok: Boolean(res.ok), skill: 'media-next-episode', cleanedCommand: cleaned, robosUser: activeUser,
      targetDevice: targetDev || null,
      targetIp: targetDev ? targetDev.ip : null,
      response: ((res.spoken || res.error || `I could not start ${intent.title}.`) + tvNote).trim(),
      data: { ...(res || {}), targetDevice: targetDev || null, targetIp: targetDev ? targetDev.ip : null },
    };
  }

  // ── 0.7 Smart TV Session Controls (list TVs, open 10-foot library, transfer playback, stop casting) ──
  if (intent.type === 'smart-tv-control') {
    if (intent.action === 'list-tvs') {
      const tvs = castDevices.filter(d => d.deviceType === 'tv');
      if (!tvs.length) {
        return {
          ok: true,
          skill: 'smart-tv-control',
          cleanedCommand: cleaned,
          robosUser: activeUser,
          response: 'No RobOS Smart TVs are paired yet. Open RobOS Smart TV Studio to pair a TV.',
          data: { tvs: [] },
        };
      }
      const names = tvs.map(t => `${t.name} (${t.ip})`).join(', ');
      return {
        ok: true,
        skill: 'smart-tv-control',
        cleanedCommand: cleaned,
        robosUser: activeUser,
        response: `You have ${tvs.length} paired RobOS Smart TV${tvs.length === 1 ? '' : 's'}: ${names}.`,
        data: { tvs },
      };
    }

    if (intent.action === 'open-tv-library') {
      const dev = intent.targetDevice;
      let res = null;
      if (autoLaunchPlayers) {
        const client = await ensureMediaPlayerRunning('movie-player', createMoviePlayerClient, { configDir });
        if (client.running() && typeof client.openTvLibrary === 'function') {
          res = await client.openTvLibrary({ targetIp: dev.ip, robosUser: activeUser });
        } else {
          res = await headlessTvCast.controlHeadlessTv('open-tv-library', { targetIp: dev.ip, configDir });
        }
      }
      return {
        ok: !res || res.ok !== false,
        skill: 'smart-tv-control',
        cleanedCommand: cleaned,
        robosUser: activeUser,
        targetDevice: dev,
        targetIp: dev.ip,
        response: `Opened the RobOS Movie Player library on ${dev.name}.`,
        data: { ...(res || {}), targetDevice: dev, targetIp: dev.ip },
      };
    }

    if (intent.action === 'transfer-to-tv') {
      const dev = intent.targetDevice;
      const client = createMoviePlayerClient({ configDir });
      if (!client.running()) {
        const hs = headlessTvCast.readHeadlessSession(configDir);
        if (hs && hs.active && Array.isArray(hs.tracks) && hs.tracks.length) {
          const res = await headlessTvCast.playTracksHeadless({
            tracks: hs.tracks,
            initialIndex: hs.currentIndex || 0,
            targetIp: dev.ip,
            targetDevice: dev,
            configDir,
          });
          return {
            ok: Boolean(res && res.ok !== false),
            skill: 'smart-tv-control',
            cleanedCommand: cleaned,
            robosUser: activeUser,
            targetDevice: dev,
            targetIp: dev.ip,
            response: `Moved playback to ${dev.name}.`,
            data: { ...(res || {}), targetDevice: dev, targetIp: dev.ip },
          };
        }
        return {
          ok: false,
          skill: 'smart-tv-control',
          cleanedCommand: cleaned,
          robosUser: activeUser,
          response: 'RobOS Movie Player is not currently playing anything to transfer.',
        };
      }
      const res = typeof client.transferOutput === 'function'
        ? await client.transferOutput({ targetIp: dev.ip, robosUser: activeUser })
        : { ok: false, error: 'Transfer unavailable' };
      return {
        ok: Boolean(res && res.ok !== false),
        skill: 'smart-tv-control',
        cleanedCommand: cleaned,
        robosUser: activeUser,
        targetDevice: dev,
        targetIp: dev.ip,
        response: res && res.ok !== false
          ? `Moved playback to ${dev.name}.`
          : (res?.error || `Could not move playback to ${dev.name}.`),
        data: { ...(res || {}), targetDevice: dev, targetIp: dev.ip },
      };
    }

    if (intent.action === 'stop-cast' || intent.action === 'transfer-to-local') {
      const client = createMoviePlayerClient({ configDir });
      let res = { ok: true };
      if (client.running()) {
        res = intent.action === 'transfer-to-local' && typeof client.transferOutput === 'function'
          ? await client.transferOutput({ targetIp: 'local', robosUser: activeUser })
          : (typeof client.stopCast === 'function' ? await client.stopCast({ targetIp: intent.targetDevice?.ip || null }) : { ok: true });
      } else if (autoLaunchPlayers) {
        res = await headlessTvCast.controlHeadlessTv('stop-cast', { targetIp: intent.targetDevice?.ip || null, configDir });
      }
      return {
        ok: Boolean(res && res.ok !== false),
        skill: 'smart-tv-control',
        cleanedCommand: cleaned,
        robosUser: activeUser,
        response: intent.action === 'transfer-to-local'
          ? 'Moved playback back to this computer.'
          : `Stopped Smart TV casting${intent.targetDevice && intent.targetDevice.ip !== 'local' ? ` on ${intent.targetDevice.name}` : ''}.`,
        data: res || {},
      };
    }
  }

  // ── 0.8 Specialized Cinema Playback (Random Episode / Unwatched / Random Movie / Latest / From Beginning) ──
  if (intent.type === 'cinema-special') {
    const match = resolveCinemaSpecialPlayback(intent, movieTracks, { configDir });
    if (!match.ok) {
      return {
        ok: false,
        skill: 'movie-play',
        cleanedCommand: cleaned,
        robosUser: activeUser,
        response: match.error || 'I could not find matching movies or episodes in your library.',
      };
    }
    let playResult = null;
    if (autoLaunchPlayers) {
      const client = await ensureMediaPlayerRunning('movie-player', createMoviePlayerClient, { configDir });
      if (client.running()) {
        playResult = await client.play({
          trackIds: match.tracks.map(t => t.id),
          shuffle: false,
          keepFirst: Boolean(match.keepFirst),
          startAt: match.startAt !== undefined ? match.startAt : null,
          targetIp: match.targetIp || null,
          robosUser: activeUser,
        });
      } else if (match.targetIp && match.targetIp !== 'local') {
        playResult = await headlessTvCast.playTracksHeadless({
          tracks: match.tracks,
          targetIp: match.targetIp,
          targetDevice: match.targetDevice || null,
          startAt: match.startAt !== undefined ? match.startAt : null,
          configDir,
        });
      } else {
        return {
          ok: false,
          skill: 'movie-play',
          cleanedCommand: cleaned,
          robosUser: activeUser,
          response: 'This RobOS server is running headlessly — include a Smart TV name like "on the Roku TV" to cast directly.',
        };
      }
    }
    return {
      ok: !playResult || playResult.ok !== false,
      skill: 'movie-play',
      cleanedCommand: cleaned,
      robosUser: activeUser,
      matchType: match.matchType,
      bestTrack: match.bestTrack,
      trackCount: match.tracks.length,
      targetDevice: match.targetDevice || null,
      targetIp: match.targetIp || null,
      playResult,
      response: playResult && playResult.ok === false ? (playResult.error || match.summaryText) : match.summaryText,
      data: {
        kind: 'movie',
        matchType: match.matchType,
        bestTrack: match.bestTrack,
        trackIds: match.tracks.map(t => t.id),
        targetDevice: match.targetDevice || null,
        targetIp: match.targetIp || null,
        robosUser: activeUser,
      },
    };
  }

  // ── 1. Transport controls (pause / resume / next / previous / restart) ──────
  if (intent.type === 'transport') {
    const audioClient = createAudioPlayerClient({ configDir });
    const movieClient = createMoviePlayerClient({ configDir });
    let targetClient = null;
    let targetName = 'Audio Player';

    if (intent.preferMoviePlayer && movieClient.running()) {
      targetClient = movieClient;
      targetName = 'Movie Player';
    } else if (movieClient.running() && audioClient.running()) {
      const [mSt, aSt] = await Promise.all([movieClient.status(), audioClient.status()]);
      if (mSt?.playing && !aSt?.playing) {
        targetClient = movieClient;
        targetName = 'Movie Player';
      } else {
        targetClient = audioClient;
      }
    } else if (audioClient.running()) {
      targetClient = audioClient;
    } else if (movieClient.running()) {
      targetClient = movieClient;
      targetName = 'Movie Player';
    }

    if (!targetClient) {
      if (headlessTvCast.hasActiveHeadlessSession(configDir)) {
        const hs = headlessTvCast.readHeadlessSession(configDir);
        const res = await headlessTvCast.controlHeadlessTv(intent.action, {
          targetIp: intent.targetDevice?.ip || hs?.targetIp || null,
          configDir,
        });
        const tvDisplay = intent.targetDevice?.name || hs?.targetDevice?.name || 'Smart TV';
        const headlessLabels = {
          pause: `Paused playback on ${tvDisplay}.`,
          resume: `Resumed playback on ${tvDisplay}.`,
          next: `Skipped to the next item on ${tvDisplay}.`,
          previous: `Went back to the previous item on ${tvDisplay}.`,
          restart: `Restarted from the beginning on ${tvDisplay}.`,
        };
        return {
          ok: Boolean(res && res.ok !== false),
          skill: `media-${intent.action}`,
          cleanedCommand: cleaned,
          robosUser: activeUser,
          response: res && res.ok !== false ? (headlessLabels[intent.action] || `Updated ${tvDisplay}.`) : (res?.error || `Could not update ${tvDisplay}.`),
          data: { ...(res || {}), robosUser: activeUser },
        };
      }
      return {
        ok: false,
        skill: `media-${intent.action}`,
        cleanedCommand: cleaned,
        robosUser: activeUser,
        response: 'Neither Audio Player nor Movie Player is currently running.',
      };
    }

    const res = typeof targetClient[intent.action] === 'function'
      ? await targetClient[intent.action]({ robosUser: activeUser })
      : { ok: false, error: `${intent.action} not supported` };
    const devLabel = intent.targetDevice && intent.targetDevice.ip !== 'local' ? ` on ${intent.targetDevice.name}` : ` in ${targetName}`;
    const actionLabels = {
      pause: `Paused playback${devLabel}.`,
      resume: `Resumed playback${devLabel}.`,
      next: `Skipped to the next item${devLabel}.`,
      previous: `Went back to the previous item${devLabel}.`,
      restart: `Restarted from the beginning${devLabel}.`,
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
      if (client.running()) {
        playResult = await client.play({
          trackIds: match.tracks.map(t => t.id),
          shuffle: Boolean(match.shuffle),
          targetIp: match.targetIp || null,
          robosUser: activeUser,
        });
      } else if (chosenKind === 'movie' && match.targetIp && match.targetIp !== 'local') {
        playResult = await headlessTvCast.playTracksHeadless({
          tracks: match.tracks,
          targetIp: match.targetIp,
          targetDevice: match.targetDevice || null,
          configDir,
        });
      } else if (!client.running()) {
        return {
          ok: false,
          skill: chosenKind === 'movie' ? 'movie-play' : 'audio-play',
          cleanedCommand: cleaned,
          robosUser: activeUser,
          response: chosenKind === 'movie'
            ? 'This RobOS server is running headlessly — include a Smart TV name like "on the Roku TV" to cast directly.'
            : 'Audio Player is not running on this headless server.',
        };
      }
    }

    return {
      ok: !playResult || playResult.ok !== false,
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
      response: playResult && playResult.ok === false ? (playResult.error || match.summaryText) : match.summaryText,
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
  parseWatchlistCommand,
  executeWatchlistCommand,
  parseCinemaSpecialCommand,
  resolveCinemaSpecialPlayback,
  findShowEpisodePool,
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

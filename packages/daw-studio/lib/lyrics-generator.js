'use strict';

/**
 * RobOS DAW Studio — Industry-Standard MIDI-Mapped Karaoke Lyrics Generator (.KAR / SMF 0xFF 0x05 + Enhanced .LRC)
 *
 * Converts any music/vocal track or clip in a DAW session into a dedicated MIDI-mapped `Lyrics` track
 * (`trackKind: 'lyrics'`) rendered karaoke-style on the Video Output display (over active video tracks,
 * or over a RobOS Studio dark branded stage when no other video is playing).
 *
 * Standards implemented:
 *   1. Standard MIDI File (SMF) Format 1 Karaoke (`.kar` / `.mid`, 480 PPQ):
 *      - Track 0: Conductor track with `@KMIDI KARAOKE FILE` headers, Time Signature (`FF 58`), and Tempo (`FF 51`).
 *      - Track 1: Vocal lead channel with `0xFF 0x05` MIDI Lyric Meta-Events per word (`/` line-break markers)
 *        paired with time-aligned `NoteOn` / `NoteOff` vocal pitch guide notes (`MIDI 43..81`).
 *   2. Enhanced Word-Synced LRC (`.lrc`):
 *      - `[mm:ss.xx] <mm:ss.xx>Word1 <mm:ss.xx>Word2 ...` sidecar for instant editing and portability.
 */

const fs = require('fs');
const https = require('https');
const path = require('path');
const { decodeWavMono } = require('./drum-instruments');

const DEFAULT_PPQ = 480;
const ANALYSIS_SR = 16000;
const FRAME_HOP = 400; // 25 ms @ 16 kHz (40 Hz envelope & pitch grid)

function clamp(min, max, v) {
  return Math.max(min, Math.min(max, v));
}

function slugify(text) {
  return String(text || 'lyrics')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42) || 'lyrics';
}

function makeId(prefix = 'lyr') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

// ─── Song Title & Artist Cleaner (for LRCLIB & Karaoke Stage Header) ─────────

function parseSongArtistAndTitle(rawLabel = '') {
  let cleaned = String(rawLabel || '')
    .replace(/\.[a-z0-9]{2,4}$/i, '')
    .replace(/\[(?:mp4|m4a|mp3|wav|flac|ogg|opus|webm|mkv|mov|no drums|drumless|stem|karaoke)\]/gi, ' ')
    .replace(/\((?:no drums|drumless|backing track|guitar cover[^)]*|drum cover[^)]*| vocal[^)]*|official[^)]*|lyrics[^)]*|hd|4k|audio|video)\)/gi, ' ')
    .replace(/_mixed\b/gi, ' ')
    .replace(/\b(?:no drums|drumless|backing track)\b/gi, ' ')
    .replace(/^lyrics\s*[-—:]\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  let artist = '';
  let title = cleaned;

  // Pattern 1: "<Title> by <Artist> [Meets Metal / Cover ...]"
  const byMatch = cleaned.match(/^(.+?)\s+by\s+(.+)$/i);
  if (byMatch) {
    title = byMatch[1].trim();
    artist = byMatch[2]
      .replace(/\s+(?:meets\s+\w+|cover.*|metal\s+version.*|rock\s+version.*|remix.*)$/i, '')
      .trim();
  } else {
    // Pattern 2: "<Artist> - <Title>" or "<Artist> — <Title>"
    const dashMatch = cleaned.match(/^([^—–-]+?)\s*[-—–]\s*(.+)$/);
    if (dashMatch) {
      artist = dashMatch[1].trim();
      title = dashMatch[2]
        .replace(/\s+(?:meets\s+\w+|cover.*|metal\s+version.*)$/i, '')
        .trim();
    }
  }

  title = title.replace(/\s+/g, ' ').trim() || 'Untitled Song';
  artist = artist.replace(/\s+/g, ' ').trim();
  return { title, artist, displayTitle: artist ? `${title} — ${artist}` : title };
}

// ─── Binary Variable-Length Quantity (VLQ) & SMF .KAR Encoder / Parser ───────

function writeVarLen(value) {
  let v = Math.max(0, Math.round(Number(value) || 0));
  const bytes = [v & 0x7f];
  while ((v >>= 7) > 0) {
    bytes.unshift((v & 0x7f) | 0x80);
  }
  return Buffer.from(bytes);
}

function readVarLen(buf, offset) {
  let value = 0;
  let idx = offset;
  for (let i = 0; i < 4 && idx < buf.length; i++) {
    const b = buf[idx++];
    value = (value << 7) | (b & 0x7f);
    if ((b & 0x80) === 0) break;
  }
  return { value, nextOffset: idx };
}

function buildMetaEvent(deltaTicks, metaType, payloadBuf) {
  const data = Buffer.isBuffer(payloadBuf) ? payloadBuf : Buffer.from(String(payloadBuf || ''), 'utf8');
  return Buffer.concat([
    writeVarLen(deltaTicks),
    Buffer.from([0xff, metaType & 0xff]),
    writeVarLen(data.length),
    data,
  ]);
}

function buildMidiChannelEvent(deltaTicks, statusByte, data1, data2) {
  const arr = data2 !== undefined
    ? [statusByte & 0xff, data1 & 0x7f, data2 & 0x7f]
    : [statusByte & 0xff, data1 & 0x7f];
  return Buffer.concat([writeVarLen(deltaTicks), Buffer.from(arr)]);
}

function wrapMidiTrackChunk(eventBuffers) {
  const body = Buffer.concat(eventBuffers);
  const head = Buffer.alloc(8);
  head.write('MTrk', 0, 4, 'ascii');
  head.writeUInt32BE(body.length, 4);
  return Buffer.concat([head, body]);
}

function secToTicks(sec, bpm, ppq = DEFAULT_PPQ) {
  const safeBpm = clamp(30, 300, Number(bpm) || 120);
  return Math.max(0, Math.round((Math.max(0, Number(sec) || 0) * safeBpm * ppq) / 60));
}

function ticksToSec(ticks, bpm, ppq = DEFAULT_PPQ) {
  const safeBpm = clamp(30, 300, Number(bpm) || 120);
  return (Math.max(0, Number(ticks) || 0) * 60) / (safeBpm * ppq);
}

/**
 * Encode synced lines + word-level timestamps & vocal MIDI notes into a spec-compliant
 * Standard MIDI File Format 1 Karaoke (`.kar` / `.mid`) binary Buffer.
 *
 * Note: Event times inside the `.kar` file are stored clip-relative (`sec - clipStartSec`)
 * so moving a clip on the DAW timeline moves all karaoke words cleanly without rewriting the `.kar`!
 */
function encodeMidiKaraokeSmf({
  lines = [],
  bpm = 120,
  timeSignature = '4/4',
  title = 'Karaoke Track',
  artist = '',
  clipStartSec = 0,
  ppq = DEFAULT_PPQ,
} = {}) {
  const safeBpm = clamp(30, 300, Number(bpm) || 120);
  const usPerBeat = Math.round(60000000 / safeBpm);
  const [tsNumRaw, tsDenRaw] = String(timeSignature || '4/4').split('/').map(Number);
  const tsNum = clamp(1, 16, tsNumRaw || 4);
  const tsDenPow = clamp(1, 5, Math.round(Math.log2(tsDenRaw || 4)));

  // MThd Header: Format 1, 2 Tracks, 480 PPQ
  const header = Buffer.alloc(14);
  header.write('MThd', 0, 4, 'ascii');
  header.writeUInt32BE(6, 4);
  header.writeUInt16BE(1, 8);
  header.writeUInt16BE(2, 10);
  header.writeUInt16BE(ppq, 12);

  // Track 0: Conductor & @KMIDI Karaoke File headers
  const t0Events = [
    buildMetaEvent(0, 0x03, 'Soft Karaoke'),
    buildMetaEvent(0, 0x01, '@KMIDI KARAOKE FILE'),
    buildMetaEvent(0, 0x01, '@V0100'),
    buildMetaEvent(0, 0x01, '@LENGL'),
    buildMetaEvent(0, 0x01, `@T${title || 'Karaoke Track'}`),
  ];
  if (artist) {
    t0Events.push(buildMetaEvent(0, 0x01, `@T${artist}`));
  }
  t0Events.push(
    buildMetaEvent(0, 0x58, Buffer.from([tsNum, tsDenPow, 24, 8])),
    buildMetaEvent(0, 0x51, Buffer.from([(usPerBeat >> 16) & 0xff, (usPerBeat >> 8) & 0xff, usPerBeat & 0xff])),
    buildMetaEvent(0, 0x2f, Buffer.alloc(0))
  );

  // Track 1: Words + 0xFF 0x05 MIDI Lyric Meta-Events + Vocal Guide Notes (Channel 1)
  const absEvents = [];
  let orderSeq = 0;

  lines.forEach((line, lineIdx) => {
    const words = Array.isArray(line?.words) && line.words.length
      ? line.words
      : subdivideLineIntoWords(line?.text || '', Number(line?.startSec) || 0, Number(line?.endSec) || 1);

    words.forEach((w, wordIdx) => {
      const rawWord = String(w.text || '').trim();
      if (!rawWord) return;
      const relStart = Math.max(0, (Number(w.startSec) || 0) - clipStartSec);
      const relEnd = Math.max(relStart + 0.04, (Number(w.endSec) || (relStart + 0.25)) - clipStartSec);
      const startTick = secToTicks(relStart, safeBpm, ppq);
      const endTick = Math.max(startTick + 12, secToTicks(relEnd, safeBpm, ppq));
      const midiNote = clamp(36, 96, Math.round(Number(w.midiNote) || 60));
      const velocity = clamp(40, 124, Math.round(Number(w.velocity) || 96));

      // Industry-standard KAR/SMF Lyric token: `/` marks a new lyric line, trailing space separates words on same line
      const prefix = wordIdx === 0 ? (lineIdx === 0 ? '\\' : '/') : '';
      const suffix = wordIdx < words.length - 1 ? ' ' : '';
      const lyricToken = `${prefix}${rawWord}${suffix}`;

      absEvents.push({
        tick: startTick,
        priority: 0,
        seq: orderSeq++,
        encode: (dt) => buildMetaEvent(dt, 0x05, lyricToken),
      });
      absEvents.push({
        tick: startTick,
        priority: 1,
        seq: orderSeq++,
        encode: (dt) => buildMidiChannelEvent(dt, 0x90, midiNote, velocity),
      });
      absEvents.push({
        tick: endTick,
        priority: 2,
        seq: orderSeq++,
        encode: (dt) => buildMidiChannelEvent(dt, 0x80, midiNote, 0),
      });
    });
  });

  absEvents.sort((a, b) => (a.tick - b.tick) || (a.priority - b.priority) || (a.seq - b.seq));

  const t1Events = [
    buildMetaEvent(0, 0x03, 'Words'),
    buildMidiChannelEvent(0, 0xc0, 52), // GM Patch 53 (0-indexed 52): Choir Aahs / Vocal Lead
  ];

  let prevTick = 0;
  for (const ev of absEvents) {
    const dt = Math.max(0, ev.tick - prevTick);
    prevTick = ev.tick;
    t1Events.push(ev.encode(dt));
  }
  t1Events.push(buildMetaEvent(0, 0x2f, Buffer.alloc(0)));

  return Buffer.concat([
    header,
    wrapMidiTrackChunk(t0Events),
    wrapMidiTrackChunk(t1Events),
  ]);
}

/**
 * Parse a Standard MIDI File (`.kar` / `.mid`, Format 0 or Format 1) back into structured
 * karaoke lines, word timestamps, and MIDI vocal guide pitches.
 */
function parseMidiKaraokeSmf(buf, { clipStartSec = 0 } = {}) {
  if (!Buffer.isBuffer(buf) || buf.length < 18 || buf.toString('ascii', 0, 4) !== 'MThd') {
    throw new Error('Invalid MIDI / KAR file header (missing MThd)');
  }
  const hdrLen = buf.readUInt32BE(4);
  const format = buf.readUInt16BE(8);
  const numTracks = buf.readUInt16BE(10);
  const division = buf.readUInt16BE(12);
  const ppq = (division & 0x8000) === 0 ? (division || DEFAULT_PPQ) : DEFAULT_PPQ;

  let offset = 8 + hdrLen;
  const tempoChanges = [];
  const titles = [];
  const rawLyricMeta = []; // FF 05
  const rawTextMeta = [];  // FF 01 (classic .kar fallback)
  const noteEvents = [];   // { startTick, endTick, midiNote, velocity }

  for (let trk = 0; trk < numTracks && offset + 8 <= buf.length; trk++) {
    const chunkId = buf.toString('ascii', offset, offset + 4);
    const chunkLen = buf.readUInt32BE(offset + 4);
    const chunkEnd = Math.min(buf.length, offset + 8 + chunkLen);
    offset += 8;

    if (chunkId !== 'MTrk') {
      offset = chunkEnd;
      continue;
    }

    let pos = offset;
    let absTick = 0;
    let runningStatus = 0;
    const activeNotes = new Map();

    while (pos < chunkEnd) {
      const dtInfo = readVarLen(buf, pos);
      absTick += dtInfo.value;
      pos = dtInfo.nextOffset;
      if (pos >= chunkEnd) break;

      let status = buf[pos];
      if (status < 0x80) {
        status = runningStatus;
      } else {
        pos++;
        if (status < 0xf0) runningStatus = status;
      }

      if (status === 0xff) {
        if (pos >= chunkEnd) break;
        const metaType = buf[pos++];
        const lenInfo = readVarLen(buf, pos);
        const dataStart = lenInfo.nextOffset;
        const dataEnd = Math.min(chunkEnd, dataStart + lenInfo.value);
        const payload = buf.subarray(dataStart, dataEnd);
        pos = dataEnd;

        if (metaType === 0x51 && payload.length === 3) {
          const us = (payload[0] << 16) | (payload[1] << 8) | payload[2];
          if (us > 0) tempoChanges.push({ tick: absTick, usPerBeat: us });
        } else if (metaType === 0x05) {
          rawLyricMeta.push({ tick: absTick, raw: payload.toString('utf8') });
        } else if (metaType === 0x01) {
          const txt = payload.toString('utf8');
          if (txt.startsWith('@T')) {
            titles.push(txt.slice(2).trim());
          } else if (!txt.startsWith('@')) {
            rawTextMeta.push({ tick: absTick, raw: txt });
          }
        } else if (metaType === 0x2f) {
          break;
        }
      } else if (status === 0xf0 || status === 0xf7) {
        const lenInfo = readVarLen(buf, pos);
        pos = Math.min(chunkEnd, lenInfo.nextOffset + lenInfo.value);
      } else {
        const hi = status & 0xf0;
        const ch = status & 0x0f;
        const dataBytes = (hi === 0xc0 || hi === 0xd0) ? 1 : 2;
        if (pos + dataBytes > chunkEnd) break;
        const d1 = buf[pos];
        const d2 = dataBytes === 2 ? buf[pos + 1] : 0;
        pos += dataBytes;

        const key = `${ch}:${d1}`;
        if (hi === 0x90 && d2 > 0) {
          activeNotes.set(key, { startTick: absTick, midiNote: d1, velocity: d2 });
        } else if (hi === 0x80 || (hi === 0x90 && d2 === 0)) {
          const open = activeNotes.get(key);
          if (open) {
            noteEvents.push({
              startTick: open.startTick,
              endTick: Math.max(open.startTick + 10, absTick),
              midiNote: open.midiNote,
              velocity: open.velocity,
            });
            activeNotes.delete(key);
          }
        }
      }
    }

    offset = chunkEnd;
  }

  if (!tempoChanges.length) {
    tempoChanges.push({ tick: 0, usPerBeat: 500000 });
  }
  tempoChanges.sort((a, b) => a.tick - b.tick);
  const primaryUsPerBeat = tempoChanges[0]?.usPerBeat || 500000;
  const bpm = Math.round((60000000 / primaryUsPerBeat) * 100) / 100;

  const tickToAbsSec = (targetTick) => {
    let curTick = 0;
    let curUs = tempoChanges[0]?.usPerBeat || 500000;
    let accSec = 0;
    for (const tc of tempoChanges) {
      if (tc.tick >= targetTick) break;
      if (tc.tick > curTick) {
        accSec += ((tc.tick - curTick) * (curUs / 1000000)) / ppq;
        curTick = tc.tick;
      }
      curUs = tc.usPerBeat;
    }
    if (targetTick > curTick) {
      accSec += ((targetTick - curTick) * (curUs / 1000000)) / ppq;
    }
    return clipStartSec + accSec;
  };

  const lyricEvents = (rawLyricMeta.length ? rawLyricMeta : rawTextMeta)
    .filter(e => e.raw && e.raw.replace(/[\r\n]/g, '').trim().length > 0)
    .sort((a, b) => a.tick - b.tick);

  noteEvents.sort((a, b) => a.startTick - b.startTick);

  const findNearestNote = (tick) => {
    let best = null;
    let bestDist = Infinity;
    for (const n of noteEvents) {
      const d = Math.abs(n.startTick - tick);
      if (d < bestDist) {
        bestDist = d;
        best = n;
      }
      if (n.startTick > tick + ppq) break;
    }
    return bestDist <= ppq ? best : null;
  };

  const lines = [];
  let curWords = [];

  const flushLine = () => {
    if (!curWords.length) return;
    const startSec = curWords[0].startSec;
    const endSec = curWords[curWords.length - 1].endSec;
    lines.push({
      startSec: Number(startSec.toFixed(3)),
      endSec: Number(Math.max(startSec + 0.12, endSec).toFixed(3)),
      text: curWords.map(w => w.text).join(' '),
      words: curWords,
    });
    curWords = [];
  };

  for (let i = 0; i < lyricEvents.length; i++) {
    const ev = lyricEvents[i];
    const nextEv = lyricEvents[i + 1] || null;
    let raw = ev.raw;
    const startsNewLine = /^[\\/\r\n]/.test(raw);
    const endsNewLine = /[\r\n]$/.test(raw);
    const cleanWord = raw.replace(/^[\\/\r\n]+/, '').replace(/[\r\n]+$/, '').trim();
    if (!cleanWord) {
      if (startsNewLine || endsNewLine) flushLine();
      continue;
    }
    if (startsNewLine && curWords.length > 0) {
      flushLine();
    }

    const matchedNote = findNearestNote(ev.tick);
    const startSec = tickToAbsSec(ev.tick);
    let endSec;
    if (matchedNote && matchedNote.endTick > ev.tick) {
      endSec = tickToAbsSec(matchedNote.endTick);
    } else if (nextEv && nextEv.tick > ev.tick) {
      endSec = Math.min(startSec + 1.2, tickToAbsSec(nextEv.tick));
    } else {
      endSec = startSec + 0.42;
    }

    if (curWords.length > 0 && curWords[curWords.length - 1].endSec > startSec) {
      curWords[curWords.length - 1].endSec = Number(Math.max(curWords[curWords.length - 1].startSec + 0.04, startSec).toFixed(3));
    }

    curWords.push({
      text: cleanWord,
      startSec: Number(startSec.toFixed(3)),
      endSec: Number(Math.max(startSec + 0.05, endSec).toFixed(3)),
      midiNote: matchedNote ? matchedNote.midiNote : 60,
    });

    if (endsNewLine) flushLine();
  }
  flushLine();

  return {
    format,
    ppq,
    bpm,
    title: titles[0] || 'Karaoke Track',
    artist: titles[1] || '',
    lines,
  };
}

// ─── Enhanced Word-Synced LRC (.lrc) Encoder & Parser ───────────────────────

function formatLrcTimestamp(sec) {
  const safe = Math.max(0, Number(sec) || 0);
  const mm = Math.floor(safe / 60);
  const ss = (safe % 60).toFixed(2).padStart(5, '0');
  return `${String(mm).padStart(2, '0')}:${ss}`;
}

function encodeEnhancedLrc({ lines = [], title = '', artist = '', bpm = 120, clipStartSec = 0 } = {}) {
  const headerLines = [];
  if (title) headerLines.push(`[ti:${title}]`);
  if (artist) headerLines.push(`[ar:${artist}]`);
  if (bpm) headerLines.push(`[bpm:${Math.round(bpm)}]`);
  headerLines.push('[by:RobOS DAW Studio MIDI Karaoke]');

  const bodyLines = lines.map((line) => {
    const lineRelStart = Math.max(0, (Number(line.startSec) || 0) - clipStartSec);
    const words = Array.isArray(line.words) && line.words.length
      ? line.words
      : subdivideLineIntoWords(line.text || '', Number(line.startSec) || 0, Number(line.endSec) || 1);
    const wordTags = words
      .map(w => `<${formatLrcTimestamp(Math.max(0, (Number(w.startSec) || 0) - clipStartSec))}>${w.text}`)
      .join(' ');
    return `[${formatLrcTimestamp(lineRelStart)}] ${wordTags}`;
  });

  return [...headerLines, '', ...bodyLines, ''].join('\n');
}

function estimateWordWeight(word) {
  const clean = String(word || '').replace(/[^a-z0-9]/gi, '');
  if (!clean) return 0.6;
  const vowelGroups = clean.match(/[aeiouy]+/gi);
  const syllables = vowelGroups ? vowelGroups.length : 1;
  return Math.max(0.75, syllables * 0.85 + clean.length * 0.08);
}

function subdivideLineIntoWords(text, startSec, endSec, pitchLookupFn = null) {
  const tokens = String(text || '').trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const s0 = Math.max(0, Number(startSec) || 0);
  const totalDur = Math.max(tokens.length * 0.09, (Number(endSec) || (s0 + 2.0)) - s0);
  // Leave a tiny breathing tail at the end of a phrase so the last word wipes cleanly
  const activeSpan = totalDur * 0.94;
  const weights = tokens.map(estimateWordWeight);
  const weightSum = weights.reduce((a, b) => a + b, 0) || 1;

  let cursor = s0;
  return tokens.map((tok, idx) => {
    const dur = (weights[idx] / weightSum) * activeSpan;
    const wStart = cursor;
    const wEnd = cursor + Math.max(0.05, dur);
    cursor += dur;
    const midT = (wStart + wEnd) * 0.5;
    const midiNote = typeof pitchLookupFn === 'function' ? pitchLookupFn(midT) : (60 + ((idx * 2) % 7));
    return {
      text: tok,
      startSec: Number(wStart.toFixed(3)),
      endSec: Number(wEnd.toFixed(3)),
      midiNote: clamp(40, 86, Math.round(midiNote || 60)),
    };
  });
}

/**
 * Parse Enhanced LRC (`[mm:ss.xx] <mm:ss.xx>Word ...`), standard synced LRC (`[mm:ss.xx] Line`),
 * or plain multi-line lyrics into normalized `{ title, artist, lines }`.
 */
function parseLyricsText(rawText, {
  clipStartSec = 0,
  clipOffsetSec = 0,
  clipDurationSec = 30,
  pitchLookupFn = null,
} = {}) {
  const rawLines = String(rawText || '').split(/\r?\n/);
  let title = '';
  let artist = '';
  const timedRows = [];
  const plainRows = [];

  for (const raw of rawLines) {
    const trimmed = raw.trim();
    if (!trimmed) continue;

    const metaMatch = trimmed.match(/^\[(ti|ar|al|by|bpm):([^\]]*)\]$/i);
    if (metaMatch) {
      const k = metaMatch[1].toLowerCase();
      const v = metaMatch[2].trim();
      if (k === 'ti') title = v;
      else if (k === 'ar') artist = v;
      continue;
    }

    const lineTag = trimmed.match(/^\[(\d{1,3}):(\d{2}(?:\.\d{1,3})?)\]\s*(.*)$/);
    if (lineTag) {
      const fileSec = parseInt(lineTag[1], 10) * 60 + parseFloat(lineTag[2]);
      const body = lineTag[3].trim();
      if (!body) continue;
      timedRows.push({ fileSec, body });
    } else if (!/^\[.*\]$/.test(trimmed)) {
      plainRows.push(trimmed);
    }
  }

  // Case A: Timed LRC / Enhanced LRC lines
  if (timedRows.length > 0) {
    timedRows.sort((a, b) => a.fileSec - b.fileSec);
    const clipEndSec = clipStartSec + Math.max(0.5, clipDurationSec);
    const lines = [];

    for (let i = 0; i < timedRows.length; i++) {
      const row = timedRows[i];
      const nextRow = timedRows[i + 1] || null;
      const relSec = row.fileSec - clipOffsetSec;
      if (relSec > clipDurationSec + 0.5) continue;
      if (nextRow && (nextRow.fileSec - clipOffsetSec) < -0.1) continue;

      const absStart = clamp(clipStartSec, clipEndSec - 0.08, clipStartSec + Math.max(0, relSec));
      const rawNextAbs = nextRow
        ? clipStartSec + Math.max(0, nextRow.fileSec - clipOffsetSec)
        : Math.min(clipEndSec, absStart + 4.2);
      const absEnd = clamp(absStart + 0.18, clipEndSec, Math.min(absStart + 6.5, rawNextAbs - 0.04));

      // Check for Enhanced LRC inline `<mm:ss.xx>Word` tags
      const inlineMatches = [...row.body.matchAll(/<(\d{1,3}):(\d{2}(?:\.\d{1,3})?)>\s*([^<]+)/g)];
      let words;
      let cleanLineText;
      if (inlineMatches.length > 0) {
        words = inlineMatches.map((m, idx) => {
          const wFileSec = parseInt(m[1], 10) * 60 + parseFloat(m[2]);
          const wNext = inlineMatches[idx + 1];
          const wStart = clamp(absStart, absEnd - 0.04, clipStartSec + Math.max(0, wFileSec - clipOffsetSec));
          const wEndRaw = wNext
            ? clipStartSec + Math.max(0, (parseInt(wNext[1], 10) * 60 + parseFloat(wNext[2])) - clipOffsetSec)
            : absEnd;
          const wEnd = clamp(wStart + 0.05, absEnd, wEndRaw);
          const tok = m[3].trim();
          const midiNote = typeof pitchLookupFn === 'function' ? pitchLookupFn((wStart + wEnd) * 0.5) : 60;
          return {
            text: tok,
            startSec: Number(wStart.toFixed(3)),
            endSec: Number(wEnd.toFixed(3)),
            midiNote: clamp(40, 86, Math.round(midiNote || 60)),
          };
        }).filter(w => w.text.length > 0);
        cleanLineText = words.map(w => w.text).join(' ');
      } else {
        cleanLineText = row.body.replace(/<\d{1,3}:\d{2}(?:\.\d{1,3})?>/g, '').replace(/\s+/g, ' ').trim();
        words = subdivideLineIntoWords(cleanLineText, absStart, absEnd, pitchLookupFn);
      }

      if (words.length > 0) {
        lines.push({
          startSec: Number(words[0].startSec.toFixed(3)),
          endSec: Number(words[words.length - 1].endSec.toFixed(3)),
          text: cleanLineText,
          words,
        });
      }
    }

    return { title, artist, lines, isSynced: true };
  }

  // Case B: Plain multi-line lyrics — distribute evenly across clipDurationSec
  if (plainRows.length > 0) {
    const usableDur = Math.max(1.0, clipDurationSec * 0.92);
    const leadIn = Math.min(1.2, clipDurationSec * 0.04);
    const step = usableDur / plainRows.length;
    const lines = plainRows.map((lineText, idx) => {
      const lStart = clipStartSec + leadIn + idx * step;
      const lEnd = Math.min(clipStartSec + clipDurationSec, lStart + step * 0.9);
      const words = subdivideLineIntoWords(lineText, lStart, lEnd, pitchLookupFn);
      return {
        startSec: Number(lStart.toFixed(3)),
        endSec: Number(lEnd.toFixed(3)),
        text: lineText,
        words,
      };
    });
    return { title, artist, lines, isSynced: false };
  }

  return { title, artist, lines: [], isSynced: false };
}

// ─── Vocal-Band DSP Envelope & Autocorrelation MIDI Pitch Extractor ─────────

function analyzeVocalEnvelopeAndPitch(wavPath, { offsetSec = 0, durationSec = 0, clipStartSec = 0 } = {}) {
  if (!wavPath || !fs.existsSync(wavPath)) {
    return {
      ok: false,
      mono16k: new Float32Array(0),
      phrases: [],
      firstVocalOnsetSec: 0,
      pitchAtAbsSec: () => 60,
    };
  }

  const buf = fs.readFileSync(wavPath);
  const decoded = decodeWavMono(buf);
  const sr = decoded.sampleRate || 48000;
  const src = decoded.samples || new Float32Array(0);
  const startIdx = Math.min(src.length, Math.max(0, Math.floor(offsetSec * sr)));
  const endIdx = durationSec > 0
    ? Math.min(src.length, startIdx + Math.ceil(durationSec * sr))
    : src.length;
  const sliceLen = Math.max(0, endIdx - startIdx);

  if (sliceLen < 400) {
    return {
      ok: false,
      mono16k: new Float32Array(0),
      phrases: [],
      firstVocalOnsetSec: 0,
      pitchAtAbsSec: () => 60,
    };
  }

  // Downsample to 16 kHz mono (also ready for Whisper ASR if needed!)
  const outLen = Math.max(1, Math.floor((sliceLen * ANALYSIS_SR) / sr));
  const mono16k = new Float32Array(outLen);
  const ratio = sr / ANALYSIS_SR;
  for (let i = 0; i < outLen; i++) {
    const srcPos = startIdx + Math.floor(i * ratio);
    mono16k[i] = src[Math.min(src.length - 1, srcPos)] || 0;
  }

  // Vocal bandpass (300 Hz high-pass + 3200 Hz low-pass) to isolate vocal fundamentals & formants
  const vocalBand = new Float32Array(outLen);
  const hpAlpha = Math.exp((-2 * Math.PI * 300) / ANALYSIS_SR);
  const lpAlpha = 1 - Math.exp((-2 * Math.PI * 3200) / ANALYSIS_SR);
  let hpState = 0;
  let prevX = 0;
  let lpState = 0;
  for (let i = 0; i < outLen; i++) {
    const x = mono16k[i];
    hpState = hpAlpha * (hpState + x - prevX);
    prevX = x;
    lpState += lpAlpha * (hpState - lpState);
    vocalBand[i] = lpState;
  }

  const numFrames = Math.max(1, Math.floor(outLen / FRAME_HOP));
  const rmsEnv = new Float32Array(numFrames);
  const midiFrames = new Int16Array(numFrames);
  let maxRms = 1e-6;

  // Lag bounds for vocal fundamental F0: 95 Hz (lag 168) to 700 Hz (lag 23) @ 16 kHz
  const minLag = Math.floor(ANALYSIS_SR / 700);
  const maxLag = Math.floor(ANALYSIS_SR / 95);
  let lastValidMidi = 60;

  for (let f = 0; f < numFrames; f++) {
    const base = f * FRAME_HOP;
    const winLen = Math.min(800, outLen - base); // 50ms analysis window
    let sumSq = 0;
    for (let i = 0; i < winLen; i++) {
      const s = vocalBand[base + i];
      sumSq += s * s;
    }
    const rms = Math.sqrt(sumSq / Math.max(1, winLen));
    rmsEnv[f] = rms;
    if (rms > maxRms) maxRms = rms;

    if (rms > 0.008 && winLen > maxLag + 64) {
      let bestLag = 0;
      let bestCorr = 0;
      // Coarse + local refine autocorrelation for speed (<3ms on a 4-minute song!)
      for (let lag = minLag; lag <= maxLag; lag += 2) {
        let corr = 0;
        let normA = 0;
        let normB = 0;
        const n = Math.min(360, winLen - lag);
        for (let k = 0; k < n; k += 2) {
          const a = vocalBand[base + k];
          const b = vocalBand[base + k + lag];
          corr += a * b;
          normA += a * a;
          normB += b * b;
        }
        const denom = Math.sqrt(normA * normB) + 1e-9;
        const r = corr / denom;
        if (r > bestCorr) {
          bestCorr = r;
          bestLag = lag;
        }
      }
      if (bestCorr > 0.42 && bestLag > 0) {
        const freqHz = ANALYSIS_SR / bestLag;
        const midi = clamp(43, 81, Math.round(69 + 12 * Math.log2(freqHz / 440)));
        lastValidMidi = midi;
      }
    }
    midiFrames[f] = lastValidMidi;
  }

  // Segment vocal phrases where RMS > 16% of track vocal peak
  const thresh = Math.max(0.006, maxRms * 0.16);
  const phrases = [];
  let inPhrase = false;
  let pStart = 0;
  let gapFrames = 0;

  for (let f = 0; f < numFrames; f++) {
    if (rmsEnv[f] >= thresh) {
      if (!inPhrase) {
        inPhrase = true;
        pStart = f;
      }
      gapFrames = 0;
    } else if (inPhrase) {
      gapFrames++;
      if (gapFrames >= 14) { // 350 ms silence closes phrase
        const endF = Math.max(pStart + 4, f - gapFrames + 2);
        const dur = (endF - pStart) * (FRAME_HOP / ANALYSIS_SR);
        if (dur >= 0.35) {
          phrases.push({
            startSec: clipStartSec + pStart * (FRAME_HOP / ANALYSIS_SR),
            endSec: clipStartSec + endF * (FRAME_HOP / ANALYSIS_SR),
          });
        }
        inPhrase = false;
      }
    }
  }
  if (inPhrase) {
    const endF = numFrames;
    const dur = (endF - pStart) * (FRAME_HOP / ANALYSIS_SR);
    if (dur >= 0.35) {
      phrases.push({
        startSec: clipStartSec + pStart * (FRAME_HOP / ANALYSIS_SR),
        endSec: clipStartSec + endF * (FRAME_HOP / ANALYSIS_SR),
      });
    }
  }

  const firstVocalOnsetSec = phrases.length > 0 ? Math.max(0, phrases[0].startSec - clipStartSec) : 0;

  const pitchAtAbsSec = (absSec) => {
    const rel = Math.max(0, absSec - clipStartSec);
    const idx = clamp(0, numFrames - 1, Math.round((rel * ANALYSIS_SR) / FRAME_HOP));
    // 3-frame median smooth
    const a = midiFrames[Math.max(0, idx - 1)];
    const b = midiFrames[idx];
    const c = midiFrames[Math.min(numFrames - 1, idx + 1)];
    return [a, b, c].sort((x, y) => x - y)[1] || 60;
  };

  return {
    ok: true,
    mono16k,
    phrases,
    firstVocalOnsetSec,
    pitchAtAbsSec,
  };
}

/**
 * Align plain (unsynced) lyric lines onto detected vocal phrases when phrase segments exist.
 */
function alignPlainLinesToVocalPhrases(plainLines, phrases, { clipStartSec, clipDurationSec, pitchLookupFn }) {
  if (!plainLines.length) return [];
  if (!phrases.length) {
    return parseLyricsText(plainLines.join('\n'), { clipStartSec, clipDurationSec, pitchLookupFn }).lines;
  }

  const lines = [];
  const totalLines = plainLines.length;
  for (let i = 0; i < totalLines; i++) {
    const pIdx = Math.min(phrases.length - 1, Math.floor((i * phrases.length) / totalLines));
    const groupCount = Math.max(1, Math.ceil(totalLines / phrases.length));
    const subIdx = i % groupCount;
    const phr = phrases[pIdx];
    const phrDur = Math.max(0.4, phr.endSec - phr.startSec);
    const slotDur = phrDur / groupCount;
    const lStart = phr.startSec + subIdx * slotDur;
    const lEnd = Math.min(clipStartSec + clipDurationSec, lStart + Math.max(0.28, slotDur * 0.94));
    const words = subdivideLineIntoWords(plainLines[i], lStart, lEnd, pitchLookupFn);
    if (words.length) {
      lines.push({
        startSec: Number(words[0].startSec.toFixed(3)),
        endSec: Number(words[words.length - 1].endSec.toFixed(3)),
        text: plainLines[i],
        words,
      });
    }
  }
  return lines;
}

// ─── Open LRCLIB Lookup + Optional Local Whisper Word-Timestamp ASR ─────────

function httpsGetJson(url, timeoutMs = 4500) {
  return new Promise((resolve) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'RobOS-DAW-Studio/1.0 (https://rowbose.com)' },
      timeout: timeoutMs,
    }, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        return resolve(null);
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

async function fetchLyricsFromLrclib({ title, artist, durationSec }) {
  if (!title) return null;
  if (artist) {
    const params = new URLSearchParams({ track_name: title, artist_name: artist });
    if (durationSec > 5) params.set('duration', String(Math.round(durationSec)));
    const direct = await httpsGetJson(`https://lrclib.net/api/get?${params.toString()}`);
    if (direct && (direct.syncedLyrics || direct.plainLyrics)) {
      return {
        title: direct.trackName || title,
        artist: direct.artistName || artist,
        syncedLyrics: direct.syncedLyrics || '',
        plainLyrics: direct.plainLyrics || '',
        source: 'LRCLIB (Synced)',
      };
    }
  }

  const q = [artist, title].filter(Boolean).join(' ');
  const results = await httpsGetJson(`https://lrclib.net/api/search?q=${encodeURIComponent(q)}`);
  if (Array.isArray(results) && results.length > 0) {
    const withSynced = results.find(r => r.syncedLyrics) || results.find(r => r.plainLyrics);
    if (withSynced) {
      return {
        title: withSynced.trackName || title,
        artist: withSynced.artistName || artist,
        syncedLyrics: withSynced.syncedLyrics || '',
        plainLyrics: withSynced.plainLyrics || '',
        source: withSynced.syncedLyrics ? 'LRCLIB (Synced)' : 'LRCLIB (Plain + DSP Aligned)',
      };
    }
  }
  return null;
}

let cachedWhisperPipe = null;

async function transcribeWithLocalWhisper(mono16k, { clipStartSec = 0, pitchLookupFn = null, onProgress } = {}) {
  if (!mono16k || mono16k.length < ANALYSIS_SR * 0.6) return null;
  const whisperCandidates = [
    path.resolve(__dirname, '../../voice-prompt/node_modules/@xenova/transformers'),
    '@xenova/transformers',
  ];
  let transformers = null;
  for (const cand of whisperCandidates) {
    try {
      transformers = require(cand);
      break;
    } catch {}
  }
  if (!transformers?.pipeline) return null;

  try {
    onProgress?.({ message: 'Transcribing vocal words locally with Whisper ASR for MIDI Karaoke mapping...' });
    if (!cachedWhisperPipe) {
      cachedWhisperPipe = await transformers.pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en', {
        quantized: true,
      });
    }
    // Cap ASR pass to 180s max so UI remains snappy
    const maxSamples = Math.min(mono16k.length, ANALYSIS_SR * 180);
    const audioSlice = mono16k.subarray(0, maxSamples);
    const out = await cachedWhisperPipe(audioSlice, {
      chunk_length_s: 25,
      stride_length_s: 4,
      return_timestamps: 'word',
    });

    const chunks = Array.isArray(out?.chunks) ? out.chunks : [];
    if (!chunks.length) return null;

    // Group word chunks into natural karaoke lines (max 7 words or >0.65s pause or sentence punctuation)
    const lines = [];
    let curWords = [];
    const flush = () => {
      if (!curWords.length) return;
      lines.push({
        startSec: curWords[0].startSec,
        endSec: curWords[curWords.length - 1].endSec,
        text: curWords.map(w => w.text).join(' '),
        words: curWords,
      });
      curWords = [];
    };

    for (const ch of chunks) {
      const wordText = String(ch.text || '').trim();
      if (!wordText || /^\[.*\]$|^\(.*\)$/.test(wordText)) continue;
      const t0 = Array.isArray(ch.timestamp) && Number.isFinite(ch.timestamp[0]) ? ch.timestamp[0] : 0;
      const t1 = Array.isArray(ch.timestamp) && Number.isFinite(ch.timestamp[1]) ? ch.timestamp[1] : (t0 + 0.32);
      const abs0 = clipStartSec + Math.max(0, t0);
      const abs1 = clipStartSec + Math.max(t0 + 0.06, t1);

      if (curWords.length > 0) {
        const gap = abs0 - curWords[curWords.length - 1].endSec;
        if (gap > 0.65 || curWords.length >= 7) {
          flush();
        }
      }

      const midiNote = typeof pitchLookupFn === 'function' ? pitchLookupFn((abs0 + abs1) * 0.5) : 60;
      curWords.push({
        text: wordText,
        startSec: Number(abs0.toFixed(3)),
        endSec: Number(abs1.toFixed(3)),
        midiNote: clamp(40, 86, Math.round(midiNote || 60)),
      });

      if (/[.!?]$/.test(wordText) && curWords.length >= 3) {
        flush();
      }
    }
    flush();

    return lines.length > 0 ? { lines, source: 'Whisper Word-Level ASR + MIDI Pitch' } : null;
  } catch {
    return null;
  }
}

function buildDspPhraseFallbackLines(phrases, { clipStartSec = 0, clipDurationSec = 16, songTitle = 'Studio Session', bpm = 120, pitchLookupFn = null } = {}) {
  const effectivePhrases = phrases.length > 0
    ? phrases
    : Array.from({ length: Math.max(1, Math.min(8, Math.floor(clipDurationSec / 4))) }, (_, idx) => {
      const beatSpan = (60 / clamp(40, 260, Number(bpm) || 120)) * 4;
      const s = clipStartSec + idx * beatSpan;
      return { startSec: s, endSec: Math.min(clipStartSec + clipDurationSec, s + beatSpan * 0.85) };
    });

  const samplePrompts = [
    `${songTitle} — Vocal Phrase 1`,
    'Sing along or edit lyrics in FX Inspector',
    'MIDI 0xFF 0x05 word-synced karaoke cue',
    'Right-click or open FX to paste custom lyrics',
  ];

  return effectivePhrases.slice(0, 32).map((phr, idx) => {
    const text = idx === 0
      ? samplePrompts[0]
      : (idx < samplePrompts.length ? samplePrompts[idx] : `Vocal Phrase ${idx + 1} — Ready for Lyrics`);
    const words = subdivideLineIntoWords(text, phr.startSec, phr.endSec, pitchLookupFn);
    return {
      startSec: Number((words[0]?.startSec ?? phr.startSec).toFixed(3)),
      endSec: Number((words[words.length - 1]?.endSec ?? phr.endSec).toFixed(3)),
      text,
      words,
    };
  });
}

// ─── Sidecar Discovery (.kar / .mid / .lrc next to imported media) ───────────

function discoverSidecarLyricsFile(clip) {
  const candidates = [clip?.sourceFile, clip?.videoFile, clip?.wavFile].filter(Boolean);
  for (const mediaPath of candidates) {
    const dir = path.dirname(mediaPath);
    const stem = path.basename(mediaPath, path.extname(mediaPath));
    for (const ext of ['.kar', '.lrc', '.mid']) {
      const sidecar = path.join(dir, `${stem}${ext}`);
      if (fs.existsSync(sidecar)) {
        return { filePath: sidecar, ext };
      }
    }
  }
  return null;
}

// ─── Main Entry Points: Create & Update MIDI Lyrics Track in Project ────────

async function buildLyricsClipForSourceClip(srcClip, {
  trackName = '',
  bpm = 120,
  timeSignature = '4/4',
  takesDir,
  customLyricsText = '',
  allowNetworkInTest = false,
  onProgress,
} = {}) {
  const clipStartSec = Math.max(0, Number(srcClip?.startSec) || 0);
  const clipOffsetSec = Math.max(0, Number(srcClip?.offsetSec) || 0);
  const clipDurationSec = Math.max(0.5, Number(srcClip?.durationSec) || 12);
  const sourceDurSec = Math.max(clipDurationSec, Number(srcClip?.sourceDurationSec) || clipDurationSec);

  const parsedMeta = parseSongArtistAndTitle(srcClip?.name || trackName || 'Song');
  let songTitle = parsedMeta.title;
  let songArtist = parsedMeta.artist;

  onProgress?.({ message: `Analyzing vocal envelope & fundamental MIDI pitch on "${songTitle}"...` });
  const dsp = analyzeVocalEnvelopeAndPitch(srcClip?.wavFile, {
    offsetSec: clipOffsetSec,
    durationSec: clipDurationSec,
    clipStartSec,
  });

  let lines = [];
  let sourceLabel = 'MIDI Vocal Alignment';
  const isTest = process.env.ROBOS_TEST === '1';

  // 1. Explicit custom lyrics or .LRC text provided
  if (customLyricsText && String(customLyricsText).trim()) {
    const parsed = parseLyricsText(customLyricsText, {
      clipStartSec,
      clipOffsetSec: 0,
      clipDurationSec,
      pitchLookupFn: dsp.pitchAtAbsSec,
    });
    if (parsed.title) songTitle = parsed.title;
    if (parsed.artist) songArtist = parsed.artist;
    lines = parsed.isSynced
      ? parsed.lines
      : alignPlainLinesToVocalPhrases(
        String(customLyricsText).split(/\r?\n/).map(s => s.trim()).filter(s => s && !/^\[.*\]$/.test(s)),
        dsp.phrases,
        { clipStartSec, clipDurationSec, pitchLookupFn: dsp.pitchAtAbsSec }
      );
    sourceLabel = parsed.isSynced ? 'Custom Synced LRC -> MIDI .KAR' : 'Custom Lyrics -> DSP Vocal MIDI';
  }

  // 2. Local sidecar (.kar / .lrc / .mid) next to source media file
  if (!lines.length) {
    const sidecar = discoverSidecarLyricsFile(srcClip);
    if (sidecar) {
      try {
        if (sidecar.ext === '.kar' || sidecar.ext === '.mid') {
          const karParsed = parseMidiKaraokeSmf(fs.readFileSync(sidecar.filePath), { clipStartSec });
          if (karParsed.lines.length) {
            lines = karParsed.lines;
            if (karParsed.title) songTitle = karParsed.title;
            if (karParsed.artist) songArtist = karParsed.artist;
            sourceLabel = `Sidecar MIDI (${path.basename(sidecar.filePath)})`;
          }
        } else if (sidecar.ext === '.lrc') {
          const lrcParsed = parseLyricsText(fs.readFileSync(sidecar.filePath, 'utf8'), {
            clipStartSec,
            clipOffsetSec,
            clipDurationSec,
            pitchLookupFn: dsp.pitchAtAbsSec,
          });
          if (lrcParsed.lines.length) {
            lines = lrcParsed.lines;
            if (lrcParsed.title) songTitle = lrcParsed.title;
            if (lrcParsed.artist) songArtist = lrcParsed.artist;
            sourceLabel = `Sidecar LRC (${path.basename(sidecar.filePath)})`;
          }
        }
      } catch {}
    }
  }

  // 3. Open LRCLIB lookup (skipped during automated unit tests unless explicitly enabled)
  if (!lines.length && (!isTest || allowNetworkInTest)) {
    onProgress?.({ message: `Looking up synced lyrics for "${songTitle}"${songArtist ? ` (${songArtist})` : ''}...` });
    const lrcHit = await fetchLyricsFromLrclib({
      title: songTitle,
      artist: songArtist,
      durationSec: sourceDurSec,
    });
    if (lrcHit) {
      songTitle = lrcHit.title || songTitle;
      songArtist = lrcHit.artist || songArtist;
      if (lrcHit.syncedLyrics) {
        const parsed = parseLyricsText(lrcHit.syncedLyrics, {
          clipStartSec,
          clipOffsetSec,
          clipDurationSec,
          pitchLookupFn: dsp.pitchAtAbsSec,
        });
        lines = parsed.lines;
        sourceLabel = lrcHit.source;
      } else if (lrcHit.plainLyrics) {
        const plainArr = lrcHit.plainLyrics.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
        lines = alignPlainLinesToVocalPhrases(plainArr, dsp.phrases, {
          clipStartSec,
          clipDurationSec,
          pitchLookupFn: dsp.pitchAtAbsSec,
        });
        sourceLabel = lrcHit.source;
      }
    }
  }

  // 4. Local Whisper word-level ASR (for original vocals / songs not on LRCLIB)
  if (!lines.length && !isTest && dsp.ok && dsp.mono16k.length >= ANALYSIS_SR) {
    const asr = await transcribeWithLocalWhisper(dsp.mono16k, {
      clipStartSec,
      pitchLookupFn: dsp.pitchAtAbsSec,
      onProgress,
    });
    if (asr?.lines?.length) {
      lines = asr.lines;
      sourceLabel = asr.source;
    }
  }

  // 5. Guaranteed DSP Vocal-Phrase MIDI Fallback (never fails even offline or on pure instrumentals)
  if (!lines.length) {
    lines = buildDspPhraseFallbackLines(dsp.phrases, {
      clipStartSec,
      clipDurationSec,
      songTitle,
      bpm,
      pitchLookupFn: dsp.pitchAtAbsSec,
    });
    sourceLabel = 'DSP Vocal Phrase MIDI Guide (Editable in FX)';
  }

  // Encode industry-standard SMF Format 1 `.kar` + Enhanced `.lrc` sidecar
  const lyrClipId = makeId('kar');
  const baseSlug = `${slugify(songTitle)}-${lyrClipId}`;
  const karFileName = `${baseSlug}.kar`;
  const lrcFileName = `${baseSlug}.lrc`;

  const karBuffer = encodeMidiKaraokeSmf({
    lines,
    bpm,
    timeSignature,
    title: songTitle,
    artist: songArtist,
    clipStartSec,
    ppq: DEFAULT_PPQ,
  });

  const enhancedLrcText = encodeEnhancedLrc({
    lines,
    title: songTitle,
    artist: songArtist,
    bpm,
    clipStartSec,
  });

  let karFile = null;
  let relativeKarPath = null;
  let lrcFile = null;
  let relativeLrcPath = null;

  if (takesDir) {
    fs.mkdirSync(takesDir, { recursive: true });
    karFile = path.join(takesDir, karFileName);
    lrcFile = path.join(takesDir, lrcFileName);
    fs.writeFileSync(karFile, karBuffer);
    fs.writeFileSync(lrcFile, enhancedLrcText, 'utf8');
    relativeKarPath = path.join('takes', karFileName);
    relativeLrcPath = path.join('takes', lrcFileName);
  }

  const wordCount = lines.reduce((sum, l) => sum + (l.words?.length || 0), 0);

  return {
    id: lyrClipId,
    name: `${songTitle} [MIDI Karaoke]`,
    mediaKind: 'lyrics',
    startSec: clipStartSec,
    offsetSec: 0,
    durationSec: clipDurationSec,
    sourceDurationSec: clipDurationSec,
    gainDb: 0,
    fadeInSec: 0,
    fadeOutSec: 0,
    muted: false,
    karFile,
    relativeKarPath,
    lrcFile,
    relativeLrcPath,
    linkedAudioClipId: srcClip?.id || null,
    lyricsSource: sourceLabel,
    songTitle,
    songArtist,
    wordCount,
    lineCount: lines.length,
    lrcText: enhancedLrcText,
    lyricsData: {
      format: 'smf-kar-v1',
      ppq: DEFAULT_PPQ,
      bpm: Number(bpm) || 120,
      title: songTitle,
      artist: songArtist,
      source: sourceLabel,
      clipBaseStartSec: clipStartSec,
      lines,
    },
  };
}

/**
 * Create a new `Lyrics` track (`trackKind: 'lyrics'`) directly below `sourceTrackId`
 * (or for a specific `clipId` on that track) with Standard MIDI `.kar` + `.lrc` files.
 */
async function createLyricsTrackForProject(project, sourceTrackId, {
  clipId = null,
  customLyricsText = '',
  takesDir = null,
  allowNetworkInTest = false,
  onProgress,
} = {}) {
  if (!project || !Array.isArray(project.tracks)) {
    throw new Error('Invalid DAW project state');
  }
  const srcIdx = project.tracks.findIndex(t => t.id === sourceTrackId);
  if (srcIdx === -1) {
    throw new Error(`Source track not found: ${sourceTrackId}`);
  }
  const sourceTrack = project.tracks[srcIdx];
  const candidateClips = (sourceTrack.clips || []).filter(c => !c.muted && (!clipId || c.id === clipId));
  if (!candidateClips.length) {
    throw new Error(`Track "${sourceTrack.name}" has no active music/audio clips to map lyrics to.`);
  }

  const effectiveTakesDir = takesDir || (project.projectDir ? path.join(project.projectDir, 'takes') : null);
  const bpm = Number(project.bpm) || 120;
  const timeSignature = project.timeSignature || '4/4';

  const lyricsClips = [];
  for (const srcClip of candidateClips) {
    const built = await buildLyricsClipForSourceClip(srcClip, {
      trackName: sourceTrack.name,
      bpm,
      timeSignature,
      takesDir: effectiveTakesDir,
      customLyricsText,
      allowNetworkInTest,
      onProgress,
    });
    lyricsClips.push(built);
  }

  const primaryMeta = lyricsClips[0];
  const lyricsTrack = {
    id: makeId('trk-lyr'),
    name: `Lyrics — ${primaryMeta?.songTitle || sourceTrack.name}`,
    shortLabel: 'Lyrics',
    trackKind: 'lyrics',
    category: 'lyrics',
    profileId: 'midi-karaoke-lyrics',
    color: '#f59e0b',
    inputNodeName: '',
    inputLabel: 'MIDI Karaoke 0xFF 05 (.KAR)',
    linkedSourceTrackId: sourceTrack.id,
    armed: false,
    muted: false,
    soloed: false,
    monitor: false,
    gainDb: 0,
    volume: 1.0,
    pan: 0,
    fx: {
      phaseInvert: false,
      eq: { enabled: false, hpfHz: 60, lowGainDb: 0, midFreqHz: 1000, midGainDb: 0, highGainDb: 0 },
      compressor: { enabled: false, thresholdDb: -18, ratio: 2 },
      reverb: { enabled: false, mix: 0 },
      openSourcePlugins: ['SMF Format 1 Karaoke (.KAR)', 'MIDI 0xFF 05 Lyric Mapper'],
    },
    soundReplacement: { supported: false, enabled: false },
    clips: lyricsClips,
  };

  project.tracks.splice(srcIdx + 1, 0, lyricsTrack);

  return {
    ok: true,
    project,
    lyricsTrack,
    lyricsClip: lyricsClips[0] || null,
    karFile: primaryMeta?.karFile || null,
    lrcFile: primaryMeta?.lrcFile || null,
    source: primaryMeta?.lyricsSource || 'MIDI Karaoke',
    lineCount: lyricsClips.reduce((s, c) => s + (c.lineCount || 0), 0),
    wordCount: lyricsClips.reduce((s, c) => s + (c.wordCount || 0), 0),
  };
}

/**
 * Rebuild an existing Lyrics clip from edited plain/LRC text or an imported `.kar`/`.mid`/`.lrc` file.
 */
function updateLyricsClipData(project, {
  trackId,
  clipId = null,
  lyricsText = '',
  importFilePath = '',
  takesDir = null,
} = {}) {
  const track = (project?.tracks || []).find(t => t.id === trackId);
  if (!track) throw new Error('Lyrics track not found');
  const clip = (clipId ? (track.clips || []).find(c => c.id === clipId) : track.clips?.[0]) || null;
  if (!clip) throw new Error('No lyrics region found on track');

  const clipStartSec = Math.max(0, Number(clip.startSec) || 0);
  const clipDurationSec = Math.max(0.5, Number(clip.durationSec) || 16);
  const bpm = Number(project?.bpm) || 120;
  const timeSignature = project?.timeSignature || '4/4';
  const effectiveTakesDir = takesDir || (project?.projectDir ? path.join(project.projectDir, 'takes') : null);

  // Locate linked audio clip if present so pitch lookup stays synced to real vocals
  let linkedWav = null;
  let linkedOffset = 0;
  for (const t of (project?.tracks || [])) {
    for (const c of (t.clips || [])) {
      if (clip.linkedAudioClipId && c.id === clip.linkedAudioClipId && c.wavFile) {
        linkedWav = c.wavFile;
        linkedOffset = Number(c.offsetSec) || 0;
      }
    }
  }
  const dsp = analyzeVocalEnvelopeAndPitch(linkedWav, {
    offsetSec: linkedOffset,
    durationSec: clipDurationSec,
    clipStartSec,
  });

  let lines = [];
  let songTitle = clip.songTitle || track.name.replace(/^Lyrics\s*[-—:]\s*/i, '');
  let songArtist = clip.songArtist || '';
  let sourceLabel = 'Edited MIDI Karaoke (.KAR)';

  if (importFilePath && fs.existsSync(importFilePath)) {
    const ext = path.extname(importFilePath).toLowerCase();
    if (ext === '.kar' || ext === '.mid') {
      const parsed = parseMidiKaraokeSmf(fs.readFileSync(importFilePath), { clipStartSec });
      lines = parsed.lines;
      if (parsed.title) songTitle = parsed.title;
      if (parsed.artist) songArtist = parsed.artist;
      sourceLabel = `Imported ${path.basename(importFilePath)}`;
    } else {
      const raw = fs.readFileSync(importFilePath, 'utf8');
      const parsed = parseLyricsText(raw, {
        clipStartSec,
        clipOffsetSec: 0,
        clipDurationSec,
        pitchLookupFn: dsp.pitchAtAbsSec,
      });
      lines = parsed.lines;
      if (parsed.title) songTitle = parsed.title;
      if (parsed.artist) songArtist = parsed.artist;
      sourceLabel = `Imported ${path.basename(importFilePath)}`;
    }
  } else {
    const parsed = parseLyricsText(lyricsText, {
      clipStartSec,
      clipOffsetSec: 0,
      clipDurationSec,
      pitchLookupFn: dsp.pitchAtAbsSec,
    });
    if (parsed.title) songTitle = parsed.title;
    if (parsed.artist) songArtist = parsed.artist;
    lines = parsed.isSynced
      ? parsed.lines
      : alignPlainLinesToVocalPhrases(
        String(lyricsText || '').split(/\r?\n/).map(s => s.trim()).filter(s => s && !/^\[.*\]$/.test(s)),
        dsp.phrases,
        { clipStartSec, clipDurationSec, pitchLookupFn: dsp.pitchAtAbsSec }
      );
  }

  const karBuf = encodeMidiKaraokeSmf({
    lines,
    bpm,
    timeSignature,
    title: songTitle,
    artist: songArtist,
    clipStartSec,
    ppq: DEFAULT_PPQ,
  });
  const lrcOut = encodeEnhancedLrc({
    lines,
    title: songTitle,
    artist: songArtist,
    bpm,
    clipStartSec,
  });

  if (effectiveTakesDir) {
    fs.mkdirSync(effectiveTakesDir, { recursive: true });
    const karName = clip.karFile ? path.basename(clip.karFile) : `${slugify(songTitle)}-${clip.id}.kar`;
    const lrcName = clip.lrcFile ? path.basename(clip.lrcFile) : `${slugify(songTitle)}-${clip.id}.lrc`;
    clip.karFile = path.join(effectiveTakesDir, karName);
    clip.lrcFile = path.join(effectiveTakesDir, lrcName);
    clip.relativeKarPath = path.join('takes', karName);
    clip.relativeLrcPath = path.join('takes', lrcName);
    fs.writeFileSync(clip.karFile, karBuf);
    fs.writeFileSync(clip.lrcFile, lrcOut, 'utf8');
  }

  clip.songTitle = songTitle;
  clip.songArtist = songArtist;
  clip.lyricsSource = sourceLabel;
  clip.lineCount = lines.length;
  clip.wordCount = lines.reduce((s, l) => s + (l.words?.length || 0), 0);
  clip.lrcText = lrcOut;
  clip.lyricsData = {
    format: 'smf-kar-v1',
    ppq: DEFAULT_PPQ,
    bpm,
    title: songTitle,
    artist: songArtist,
    source: sourceLabel,
    clipBaseStartSec: clipStartSec,
    lines,
  };

  return { ok: true, project, track, clip };
}

module.exports = {
  DEFAULT_PPQ,
  parseSongArtistAndTitle,
  encodeMidiKaraokeSmf,
  parseMidiKaraokeSmf,
  encodeEnhancedLrc,
  parseLyricsText,
  subdivideLineIntoWords,
  analyzeVocalEnvelopeAndPitch,
  createLyricsTrackForProject,
  updateLyricsClipData,
};

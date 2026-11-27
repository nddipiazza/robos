'use strict';

/**
 * RobOS DAW Studio — Idempotent Kdenlive Project Exporter & Track Synchronizer (`.kdenlive` MLT XML 1.1)
 *
 * Exports a DAW Studio session into a native Kdenlive (`.kdenlive`) multi-track video editing project:
 *   1. Renders/writes the stereo DAW audio mixdown (24-bit 48 kHz lossless PCM WAV for zero codec delay)
 *      onto the named audio track `"RobOS Audio Mixdown"`.
 *   2. Creates/updates a dedicated named Kdenlive video track (`"RobOS Video — <Track Name>"`) for each
 *      video track in the DAW session, placing every recorded/imported video take at its exact frame-accurate
 *      timeline offset (`startSec`, `offsetSec`, `durationSec`) lined up with the audio mixdown.
 *   3. Full round-trip re-export support:
 *      - No `.kdenlive` file yet? Creates a complete Kdenlive 1.1 MLT XML project + `<name>_robos_assets/` folder.
 *      - `.kdenlive` file already exists (even after editing & saving inside Kdenlive)? Replaces/updates
 *        `"RobOS Audio Mixdown"` and each `"RobOS Video — <Track>"` track in place, recreates any named tracks
 *        that were deleted in Kdenlive, removes obsolete RobOS video tracks, and preserves all user-added
 *        Kdenlive tracks, titles, bin clips, guides, and track effects!
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { transcodeMixdownBuffer } = require('./mixdown-exporter');

const ROBOS_AUDIO_TRACK_NAME = 'RobOS Audio Mixdown';
const ROBOS_VIDEO_TRACK_PREFIX = 'RobOS Video — ';
const DEFAULT_FPS_NUM = 30;
const DEFAULT_FPS_DEN = 1;

// ─── Minimal Lossless MLT XML Parser & Serializer (Zero External Deps) ───────

function escapeXmlText(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeXmlAttr(str) {
  return escapeXmlText(str)
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function unescapeXml(str) {
  return String(str ?? '')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_m, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, '&');
}

function parseXmlAttributes(attrStr) {
  const attrs = {};
  const re = /([A-Za-z_:][A-Za-z0-9_.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(attrStr)) !== null) {
    attrs[m[1]] = unescapeXml(m[2] !== undefined ? m[2] : m[3]);
  }
  return attrs;
}

function parseMltXml(xmlString) {
  const src = String(xmlString || '');
  let declaration = "<?xml version='1.0' encoding='utf-8'?>";
  const declMatch = src.match(/^\s*(<\?xml[^?]*\?>)/i);
  if (declMatch) declaration = declMatch[1];

  const rootHolder = { type: 'root', children: [] };
  const stack = [rootHolder];
  const tokenRe = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[\s\S]*?>|<\/([A-Za-z_:][A-Za-z0-9_.:-]*)\s*>|<([A-Za-z_:][A-Za-z0-9_.:-]*)((?:\s+[A-Za-z_:][A-Za-z0-9_.:-]*\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;

  let m;
  while ((m = tokenRe.exec(src)) !== null) {
    const full = m[0];
    if (full.startsWith('<?') || full.startsWith('<!DOCTYPE')) {
      continue;
    }
    if (full.startsWith('<!--')) {
      stack[stack.length - 1].children.push({ type: 'comment', value: full.slice(4, -3) });
      continue;
    }
    if (m[1]) {
      // Closing tag </tag>
      if (stack.length > 1) stack.pop();
      continue;
    }
    if (m[2]) {
      // Opening or self-closing tag
      const el = {
        type: 'element',
        tag: m[2],
        attrs: parseXmlAttributes(m[3] || ''),
        children: [],
      };
      stack[stack.length - 1].children.push(el);
      if (m[4] !== '/') {
        stack.push(el);
      }
      continue;
    }
    if (m[5] !== undefined) {
      const txt = m[5];
      if (txt.trim().length > 0 || (stack[stack.length - 1].tag === 'property')) {
        stack[stack.length - 1].children.push({ type: 'text', value: unescapeXml(txt) });
      }
    }
  }

  const root = rootHolder.children.find(c => c.type === 'element' && c.tag === 'mlt');
  if (!root) throw new Error('Invalid .kdenlive file: missing root <mlt> element');
  return { declaration, root };
}

function serializeMltNode(node, indent = '') {
  if (node.type === 'comment') {
    return `${indent}<!--${node.value}-->`;
  }
  if (node.type === 'text') {
    return escapeXmlText(node.value);
  }
  const attrPairs = Object.entries(node.attrs || {})
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}="${escapeXmlAttr(v)}"`)
    .join(' ');
  const openHead = attrPairs ? `<${node.tag} ${attrPairs}` : `<${node.tag}`;

  const kids = node.children || [];
  if (kids.length === 0) {
    return `${indent}${openHead}/>`;
  }
  if (kids.length === 1 && kids[0].type === 'text') {
    const txt = kids[0].value;
    if (txt === '') return `${indent}${openHead}/>`;
    return `${indent}${openHead}>${escapeXmlText(txt)}</${node.tag}>`;
  }

  const childLines = kids.map(k => {
    if (k.type === 'text') {
      if (!k.value.trim()) return '';
      return `${indent} ${escapeXmlText(k.value)}`;
    }
    return serializeMltNode(k, `${indent} `);
  }).filter(Boolean);

  if (!childLines.length) {
    return `${indent}${openHead}/>`;
  }
  return `${indent}${openHead}>\n${childLines.join('\n')}\n${indent}</${node.tag}>`;
}

function serializeMltXml(doc) {
  return `${doc.declaration || "<?xml version='1.0' encoding='utf-8'?>"}
${serializeMltNode(doc.root, '')}
`;
}

// ─── DOM Helpers for MLT `<property>` & ID Management ────────────────────────

function el(tag, attrs = {}, children = []) {
  return { type: 'element', tag, attrs: { ...attrs }, children: [...children] };
}

function propEl(name, value = '') {
  const str = value === undefined || value === null ? '' : String(value);
  return el('property', { name }, str === '' ? [] : [{ type: 'text', value: str }]);
}

function getProp(element, propName) {
  if (!element || !Array.isArray(element.children)) return null;
  const found = element.children.find(
    c => c.type === 'element' && c.tag === 'property' && c.attrs?.name === propName
  );
  if (!found) return null;
  return found.children.filter(c => c.type === 'text').map(c => c.value).join('');
}

function setProp(element, propName, value) {
  if (!element.children) element.children = [];
  const str = value === undefined || value === null ? '' : String(value);
  const existing = element.children.find(
    c => c.type === 'element' && c.tag === 'property' && c.attrs?.name === propName
  );
  if (existing) {
    existing.children = str === '' ? [] : [{ type: 'text', value: str }];
    return;
  }
  // Insert property before non-property children (tracks/entries/filters/transitions)
  const firstNonPropIdx = element.children.findIndex(
    c => c.type === 'element' && c.tag !== 'property'
  );
  const node = propEl(propName, str);
  if (firstNonPropIdx === -1) element.children.push(node);
  else element.children.splice(firstNonPropIdx, 0, node);
}

function walkElements(node, fn) {
  if (!node || node.type !== 'element') return;
  fn(node);
  for (const ch of (node.children || [])) {
    if (ch.type === 'element') walkElements(ch, fn);
  }
}

function createIdAllocator(root) {
  const counters = {
    chain: 0,
    producer: 0,
    playlist: 0,
    tractor: 0,
    filter: 0,
    transition: 0,
    kdenliveId: 3,
  };
  walkElements(root, (node) => {
    const id = String(node.attrs?.id || '');
    for (const prefix of ['chain', 'producer', 'playlist', 'tractor', 'filter', 'transition']) {
      const m = id.match(new RegExp(`^${prefix}(\\d+)$`));
      if (m) {
        const n = parseInt(m[1], 10);
        if (n >= counters[prefix]) counters[prefix] = n + 1;
      }
    }
    if (node.tag === 'property' && node.attrs?.name === 'kdenlive:id') {
      const txt = node.children.filter(c => c.type === 'text').map(c => c.value).join('');
      const kid = parseInt(txt, 10);
      if (Number.isFinite(kid) && kid >= counters.kdenliveId) {
        counters.kdenliveId = kid + 1;
      }
    }
  });
  return {
    nextId(prefix) {
      const val = counters[prefix] ?? 0;
      counters[prefix] = val + 1;
      return `${prefix}${val}`;
    },
    nextKdenliveId() {
      return String(counters.kdenliveId++);
    },
  };
}

// ─── Kdenlive File Hash & Media Probing ──────────────────────────────────────

/**
 * Exact Kdenlive `ProjectClip::getFileHash` algorithm:
 * If file > 2,000,000 bytes, MD5(first 1,000,000 bytes + last 1,000,000 bytes); else MD5(entire file).
 */
function computeKdenliveFileHash(filePath) {
  const stat = fs.statSync(filePath);
  const size = stat.size;
  const hash = crypto.createHash('md5');
  const CHUNK = 1000000;
  if (size > CHUNK * 2) {
    const fd = fs.openSync(filePath, 'r');
    try {
      const head = Buffer.allocUnsafe(CHUNK);
      const tail = Buffer.allocUnsafe(CHUNK);
      fs.readSync(fd, head, 0, CHUNK, 0);
      fs.readSync(fd, tail, 0, CHUNK, size - CHUNK);
      hash.update(head);
      hash.update(tail);
    } finally {
      fs.closeSync(fd);
    }
  } else {
    hash.update(fs.readFileSync(filePath));
  }
  return { fileSize: size, fileHash: hash.digest('hex') };
}

function probeMediaForKdenlive(filePath) {
  return new Promise((resolve) => {
    execFile('ffprobe', [
      '-v', 'error',
      '-show_entries', 'stream=index,codec_type,codec_name,width,height,sample_rate,channels:format=duration',
      '-of', 'json',
      filePath,
    ], { timeout: 12000 }, (err, stdout) => {
      let durationSec = 0;
      let hasVideo = false;
      let hasAudio = false;
      let videoIndex = -1;
      let audioIndex = -1;
      let width = 0;
      let height = 0;
      if (!err && stdout) {
        try {
          const parsed = JSON.parse(stdout);
          durationSec = Number(parsed.format?.duration) || 0;
          for (const s of (parsed.streams || [])) {
            if (s.codec_type === 'video' && !hasVideo) {
              hasVideo = true;
              videoIndex = Number.isFinite(Number(s.index)) ? Number(s.index) : 0;
              width = Number(s.width) || 0;
              height = Number(s.height) || 0;
            } else if (s.codec_type === 'audio' && !hasAudio) {
              hasAudio = true;
              audioIndex = Number.isFinite(Number(s.index)) ? Number(s.index) : (hasVideo ? 1 : 0);
            }
          }
        } catch {}
      }
      const { fileSize, fileHash } = fs.existsSync(filePath)
        ? computeKdenliveFileHash(filePath)
        : { fileSize: 0, fileHash: '' };
      resolve({
        filePath,
        durationSec: Math.max(0.05, durationSec),
        hasVideo,
        hasAudio,
        videoIndex,
        audioIndex,
        width,
        height,
        fileSize,
        fileHash,
      });
    });
  });
}

// ─── Frame & MLT Clock Conversions (`HH:MM:SS.mmm`) ──────────────────────────

function secToFrames(sec, fps) {
  return Math.max(0, Math.round((Math.max(0, Number(sec) || 0)) * fps));
}

function framesToClock(frames, fps) {
  const safeFrames = Math.max(0, Math.round(Number(frames) || 0));
  const totalMs = Math.round((safeFrames / fps) * 1000);
  const hh = Math.floor(totalMs / 3600000);
  const rem1 = totalMs % 3600000;
  const mm = Math.floor(rem1 / 60000);
  const rem2 = rem1 % 60000;
  const ss = Math.floor(rem2 / 1000);
  const ms = rem2 % 1000;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

function framesToSmpteDuration(frames, fps) {
  const fInt = Math.max(1, Math.round(fps));
  const safe = Math.max(0, Math.round(Number(frames) || 0));
  const ff = safe % fInt;
  const totalSec = Math.floor(safe / fInt);
  const hh = Math.floor(totalSec / 3600);
  const mm = Math.floor((totalSec % 3600) / 60);
  const ss = totalSec % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}:${String(ff).padStart(2, '0')}`;
}

function formatResourceForRoot(absFilePath, rootDir) {
  const resolvedFile = path.resolve(absFilePath);
  const resolvedRoot = path.resolve(rootDir);
  const rel = path.relative(resolvedRoot, resolvedFile);
  if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) {
    return rel.split(path.sep).join('/');
  }
  return resolvedFile;
}

function resolveResourceAgainstRoot(resourceStr, rootDir) {
  const raw = String(resourceStr || '').trim();
  if (!raw || raw === 'black' || raw.startsWith('<')) return '';
  if (path.isAbsolute(raw)) return path.resolve(raw);
  return path.resolve(rootDir || process.cwd(), raw);
}

// ─── Non-Overlapping Video Clip Comping per DAW Video Track ─────────────────

function resolveClipVideoPath(clip) {
  if (!clip || clip.muted) return '';
  const cand = clip.videoFile || (clip.mediaKind === 'video' ? clip.sourceFile : '') || '';
  return (cand && fs.existsSync(cand)) ? path.resolve(cand) : '';
}

/**
 * Given a DAW track's clips (where later takes override earlier overlapping takes),
 * return strictly ordered, non-overlapping timeline segments ready for an MLT `<playlist>`.
 */
function buildNonOverlappingVideoSegments(clips = []) {
  // Later clips in array have higher comping priority
  const valid = [];
  for (let i = 0; i < clips.length; i++) {
    const c = clips[i];
    const vf = resolveClipVideoPath(c);
    if (!vf) continue;
    const start = Math.max(0, Number(c.startSec) || 0);
    const dur = Math.max(0.04, Number(c.durationSec) || 0);
    const off = Math.max(0, Number(c.videoOffsetSec ?? c.offsetSec) || 0);
    valid.push({
      clipId: c.id || `clip-${i}`,
      name: c.name || path.basename(vf),
      videoFile: vf,
      startSec: start,
      endSec: start + dur,
      offsetSec: off,
      priority: i,
    });
  }

  // Slice lower-priority segments around higher-priority segments
  let segments = [];
  for (const incoming of valid) {
    const nextList = [];
    for (const prev of segments) {
      if (incoming.endSec <= prev.startSec + 0.001 || incoming.startSec >= prev.endSec - 0.001) {
        nextList.push(prev);
        continue;
      }
      // Left remnant of prev
      if (incoming.startSec > prev.startSec + 0.02) {
        nextList.push({
          ...prev,
          endSec: incoming.startSec,
        });
      }
      // Right remnant of prev
      if (incoming.endSec < prev.endSec - 0.02) {
        const cutDelta = incoming.endSec - prev.startSec;
        nextList.push({
          ...prev,
          startSec: incoming.endSec,
          offsetSec: prev.offsetSec + cutDelta,
        });
      }
    }
    nextList.push(incoming);
    segments = nextList;
  }

  segments.sort((a, b) => a.startSec - b.startSec);
  return segments.map(s => ({
    clipId: s.clipId,
    name: s.name,
    videoFile: s.videoFile,
    timelineStartSec: Number(s.startSec.toFixed(4)),
    sourceOffsetSec: Number(s.offsetSec.toFixed(4)),
    durationSec: Number(Math.max(0.04, s.endSec - s.startSec).toFixed(4)),
  }));
}

function extractDawVideoTracksSpec(project) {
  const tracks = Array.isArray(project?.tracks) ? project.tracks : [];
  const usedNames = new Map();
  const out = [];

  for (const tr of tracks) {
    if (tr.muted) continue;
    const segments = buildNonOverlappingVideoSegments(tr.clips || []);
    if (!segments.length && tr.trackKind !== 'video') continue;
    if (!segments.length) continue;

    const baseLabel = String(tr.name || 'Video Cam').trim() || 'Video Cam';
    const count = (usedNames.get(baseLabel) || 0) + 1;
    usedNames.set(baseLabel, count);
    const kdenliveTrackName = count === 1
      ? `${ROBOS_VIDEO_TRACK_PREFIX}${baseLabel}`
      : `${ROBOS_VIDEO_TRACK_PREFIX}${baseLabel} (${count})`;

    out.push({
      dawTrackId: tr.id,
      dawTrackName: baseLabel,
      kdenliveTrackName,
      segments,
    });
  }
  return out;
}

// ─── Silent Stereo Fallback WAV Builder (when 0 audio clips exist yet) ───────

function createSilentStereoWavBuffer(durationSec = 2.0, sampleRate = 48000) {
  const frames = Math.max(480, Math.round(durationSec * sampleRate));
  const dataBytes = frames * 4; // 16-bit stereo
  const buf = Buffer.alloc(44 + dataBytes, 0);
  buf.write('RIFF', 0, 4, 'ascii');
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8, 4, 'ascii');
  buf.write('fmt ', 12, 4, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(2, 22); // Stereo
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36, 4, 'ascii');
  buf.writeUInt32LE(dataBytes, 40);
  return buf;
}

// ─── Kdenlive MLT Element Builders ───────────────────────────────────────────

function buildChainElement({
  chainId,
  resource,
  clipName,
  kdenliveId,
  probe,
  fps,
  forTimeline = false,
  isAudioOnly = false,
}) {
  const totalFrames = Math.max(1, secToFrames(probe.durationSec, fps));
  const outClock = framesToClock(totalFrames - 1, fps);
  const durClock = framesToClock(totalFrames, fps);
  // kdenlive:clip_type -> 0: AV, 1: Audio-only, 2: Video-only
  const clipType = isAudioOnly ? '1' : (probe.hasAudio ? '0' : '2');

  const props = [
    propEl('length', String(totalFrames)),
    propEl('eof', 'pause'),
    propEl('resource', resource),
    propEl('mlt_service', 'avformat-novalidate'),
    propEl('seekable', '1'),
    propEl('audio_index', isAudioOnly ? '0' : String(probe.hasAudio ? probe.audioIndex : -1)),
    propEl('video_index', isAudioOnly ? '-1' : String(probe.hasVideo ? probe.videoIndex : 0)),
    propEl('mute_on_pause', '0'),
    propEl('kdenlive:clipname', clipName || ''),
    propEl('kdenlive:clip_type', clipType),
    propEl('kdenlive:folderid', '-1'),
    propEl('kdenlive:id', String(kdenliveId)),
    propEl('kdenlive:duration', durClock),
    propEl('kdenlive:file_size', String(probe.fileSize)),
    propEl('kdenlive:file_hash', probe.fileHash),
  ];

  if (forTimeline) {
    props.push(propEl('xml', 'was here'));
    if (isAudioOnly) {
      props.push(propEl('set.test_audio', '0'));
      props.push(propEl('set.test_image', '1'));
    } else {
      // Video track chain: suppress embedded camera audio so only RobOS Audio Mixdown plays!
      props.push(propEl('set.test_audio', '1'));
      props.push(propEl('set.test_image', '0'));
    }
  }

  return el('chain', { id: chainId, in: '00:00:00.000', out: outClock }, props);
}

function buildAudioTrackFilters(alloc) {
  return [
    el('filter', { id: alloc.nextId('filter') }, [
      propEl('window', '75'),
      propEl('max_gain', '20dB'),
      propEl('mlt_service', 'volume'),
      propEl('internal_added', '237'),
      propEl('disable', '1'),
    ]),
    el('filter', { id: alloc.nextId('filter') }, [
      propEl('channel', '-1'),
      propEl('mlt_service', 'panner'),
      propEl('internal_added', '237'),
      propEl('start', '0.5'),
      propEl('disable', '1'),
    ]),
    el('filter', { id: alloc.nextId('filter') }, [
      propEl('iec_scale', '0'),
      propEl('mlt_service', 'audiolevel'),
      propEl('dbpeak', '1'),
      propEl('disable', '1'),
    ]),
  ];
}

function buildMasterSequenceFilters(alloc) {
  return buildAudioTrackFilters(alloc);
}

function buildInternalTrackTransitions(alloc, trackSpecs) {
  // trackSpecs: array matching sequenceTractor's non-black tracks (1-based index in sequenceTractor)
  const transitions = [];
  trackSpecs.forEach((spec, idx) => {
    const bTrack = idx + 1; // 0 is black_track
    if (spec.isAudio) {
      transitions.push(el('transition', { id: alloc.nextId('transition') }, [
        propEl('a_track', '0'),
        propEl('b_track', String(bTrack)),
        propEl('mlt_service', 'mix'),
        propEl('kdenlive_id', 'mix'),
        propEl('internal_added', '237'),
        propEl('always_active', '1'),
        propEl('accepts_blanks', '1'),
        propEl('sum', '1'),
      ]));
    } else {
      transitions.push(el('transition', { id: alloc.nextId('transition') }, [
        propEl('a_track', '0'),
        propEl('b_track', String(bTrack)),
        propEl('version', '0.1'),
        propEl('mlt_service', 'frei0r.cairoblend'),
        propEl('kdenlive_id', 'frei0r.cairoblend'),
        propEl('internal_added', '237'),
        propEl('always_active', '1'),
      ]));
    }
  });
  return transitions;
}

function createFreshKdenliveSkeleton(projectName, rootDir) {
  const seqUuid = `{${crypto.randomUUID()}}`;
  const docId = String(Date.now());

  const root = el('mlt', {
    LC_NUMERIC: 'C',
    producer: 'main_bin',
    version: '7.22.0',
    root: rootDir,
  }, [
    el('profile', {
      description: 'HD 1080p 30 fps',
      width: '1920',
      height: '1080',
      progressive: '1',
      sample_aspect_num: '1',
      sample_aspect_den: '1',
      display_aspect_num: '16',
      display_aspect_den: '9',
      frame_rate_num: String(DEFAULT_FPS_NUM),
      frame_rate_den: String(DEFAULT_FPS_DEN),
      colorspace: '709',
    }),
    el('producer', { id: 'producer0', in: '00:00:00.000', out: '00:20:00.000' }, [
      propEl('length', '2147483647'),
      propEl('eof', 'continue'),
      propEl('resource', 'black'),
      propEl('aspect_ratio', '1'),
      propEl('mlt_service', 'color'),
      propEl('kdenlive:playlistid', 'black_track'),
      propEl('mlt_image_format', 'rgba'),
      propEl('set.test_audio', '0'),
    ]),
    el('tractor', { id: seqUuid, in: '00:00:00.000', out: '00:00:01.000' }, [
      propEl('kdenlive:uuid', seqUuid),
      propEl('kdenlive:clipname', projectName || 'Sequence 1'),
      propEl('kdenlive:sequenceproperties.hasAudio', '1'),
      propEl('kdenlive:sequenceproperties.hasVideo', '1'),
      propEl('kdenlive:sequenceproperties.activeTrack', '1'),
      propEl('kdenlive:sequenceproperties.tracksCount', '1'),
      propEl('kdenlive:sequenceproperties.documentuuid', seqUuid),
      propEl('kdenlive:duration', '00:00:01:00'),
      propEl('kdenlive:maxduration', '30'),
      propEl('kdenlive:producer_type', '17'),
      propEl('kdenlive:id', '3'),
      propEl('kdenlive:clip_type', '0'),
      propEl('kdenlive:folderid', '2'),
      el('track', { producer: 'producer0' }),
    ]),
    el('playlist', { id: 'main_bin' }, [
      propEl('kdenlive:folder.-1.2', 'Sequences'),
      propEl('kdenlive:sequenceFolder', '2'),
      propEl('kdenlive:docproperties.audioChannels', '2'),
      propEl('kdenlive:docproperties.compositing', '1'),
      propEl('kdenlive:docproperties.documentid', docId),
      propEl('kdenlive:docproperties.enableTimelineZone', '0'),
      propEl('kdenlive:docproperties.enableexternalproxy', '0'),
      propEl('kdenlive:docproperties.enableproxy', '0'),
      propEl('kdenlive:docproperties.kdenliveversion', '24.08.0'),
      propEl('kdenlive:docproperties.profile', 'atsc_1080p_30'),
      propEl('kdenlive:docproperties.seekOffset', '30000'),
      propEl('kdenlive:docproperties.uuid', seqUuid),
      propEl('kdenlive:docproperties.version', '1.1'),
      propEl('kdenlive:docproperties.opensequences', seqUuid),
      propEl('kdenlive:docproperties.activetimeline', seqUuid),
      propEl('kdenlive:expandedFolders'),
      propEl('kdenlive:documentnotes', 'Synced with RobOS DAW Studio'),
      propEl('xml_retain', '1'),
      el('entry', { producer: seqUuid, in: '00:00:00.000', out: '00:00:00.000' }),
    ]),
    el('tractor', { id: 'tractor_project', in: '00:00:00.000', out: '00:00:01.000' }, [
      propEl('kdenlive:projectTractor', '1'),
      el('track', { producer: seqUuid, in: '00:00:00.000', out: '00:00:01.000' }),
    ]),
  ]);

  return {
    declaration: "<?xml version='1.0' encoding='utf-8'?>",
    root,
  };
}

function locateSequenceTractorAndBin(mltRoot) {
  const topChildren = mltRoot.children.filter(c => c.type === 'element');
  const byId = new Map();
  for (const node of topChildren) {
    if (node.attrs?.id) byId.set(node.attrs.id, node);
  }

  const mainBin = byId.get('main_bin') || topChildren.find(n => n.tag === 'playlist' && n.attrs?.id === 'main_bin');
  if (!mainBin) throw new Error('Existing .kdenlive file is missing <playlist id="main_bin">');

  // Kdenlive 1.1: <tractor><property name="kdenlive:projectTractor">1</property><track producer="{uuid}"/></tractor>
  const projectWrapper = topChildren.find(n => n.tag === 'tractor' && getProp(n, 'kdenlive:projectTractor') === '1') || null;
  let seqTractor = null;

  if (projectWrapper) {
    const refTrack = projectWrapper.children.find(c => c.type === 'element' && c.tag === 'track' && c.attrs?.producer);
    if (refTrack && byId.get(refTrack.attrs.producer)) {
      seqTractor = byId.get(refTrack.attrs.producer);
    }
  }
  if (!seqTractor) {
    const activeUuid = getProp(mainBin, 'kdenlive:docproperties.activetimeline') || getProp(mainBin, 'kdenlive:docproperties.uuid');
    if (activeUuid && byId.get(activeUuid)) {
      seqTractor = byId.get(activeUuid);
    }
  }
  if (!seqTractor) {
    // Kdenlive 1.04 fallback: last <tractor> containing black_track
    const tractors = topChildren.filter(n => n.tag === 'tractor' && n !== projectWrapper);
    seqTractor = tractors.reverse().find(t =>
      t.children.some(c => c.type === 'element' && c.tag === 'track' && (c.attrs?.producer === 'black_track' || c.attrs?.producer === 'producer0'))
    ) || tractors[0];
  }
  if (!seqTractor) throw new Error('Could not locate timeline sequence <tractor> in .kdenlive file');

  const profileEl = topChildren.find(n => n.tag === 'profile');
  const fpsNum = Number(profileEl?.attrs?.frame_rate_num) || DEFAULT_FPS_NUM;
  const fpsDen = Number(profileEl?.attrs?.frame_rate_den) || DEFAULT_FPS_DEN;
  const fps = Math.max(1, fpsNum / fpsDen);

  return { mainBin, seqTractor, projectWrapper, byId, fps };
}

// ─── Main Export / Re-Sync Engine ────────────────────────────────────────────

/**
 * Save or non-destructively update a `.kdenlive` project file with:
 *   - 1 freshly mixed-down audio track (`RobOS Audio Mixdown`)
 *   - 1 video track per DAW video track (`RobOS Video — <Name>`), frame-aligned to the audio mixdown
 */
async function saveOrUpdateKdenliveProject({
  project,
  kdenlivePath,
  mixdownWavBuffer = null,
  mixdownSourceWavPath = '',
} = {}) {
  if (!project || typeof project !== 'object') {
    throw new Error('Missing DAW project state for Kdenlive export.');
  }
  if (!kdenlivePath) {
    throw new Error('Missing target .kdenlive file path.');
  }

  const resolvedKdenlivePath = /\.kdenlive$/i.test(kdenlivePath)
    ? path.resolve(kdenlivePath)
    : `${path.resolve(kdenlivePath)}.kdenlive`;
  const kdenliveDir = path.dirname(resolvedKdenlivePath);
  const kdenliveStem = path.basename(resolvedKdenlivePath, path.extname(resolvedKdenlivePath));
  const assetsDir = path.join(kdenliveDir, `${kdenliveStem}_robos_assets`);
  fs.mkdirSync(assetsDir, { recursive: true });

  // 1. Write lossless 24-bit 48 kHz stereo mixdown WAV into `<stem>_robos_assets/`
  const mixdownWavPath = path.join(assetsDir, `${kdenliveStem}-robos-mixdown.wav`);
  if (mixdownWavBuffer && Buffer.isBuffer(mixdownWavBuffer) && mixdownWavBuffer.length > 44) {
    await transcodeMixdownBuffer(mixdownWavBuffer, {
      outPath: mixdownWavPath,
      format: 'wav',
      quality: 'pcm_s24le',
      sampleRate: Number(project.sampleRate) || 48000,
      title: `${project.name || kdenliveStem} — RobOS Audio Mixdown`,
    });
  } else if (mixdownSourceWavPath && fs.existsSync(mixdownSourceWavPath)) {
    fs.copyFileSync(mixdownSourceWavPath, mixdownWavPath);
  } else {
    // Fallback silent WAV spanning the longest video clip so video-only sessions still get a valid audio mixdown track
    let maxVidEnd = 2.0;
    for (const t of (project.tracks || [])) {
      for (const c of (t.clips || [])) {
        const e = (Number(c.startSec) || 0) + (Number(c.durationSec) || 0);
        if (e > maxVidEnd) maxVidEnd = e;
      }
    }
    fs.writeFileSync(mixdownWavPath, createSilentStereoWavBuffer(maxVidEnd, Number(project.sampleRate) || 48000));
  }

  // 2. Collect DAW video tracks & probe all media files (mixdown WAV + unique video files)
  const dawVideoTracks = extractDawVideoTracksSpec(project);
  const uniqueVideoPaths = Array.from(new Set(
    dawVideoTracks.flatMap(vt => vt.segments.map(s => s.videoFile))
  ));

  const probeMap = new Map();
  probeMap.set(mixdownWavPath, await probeMediaForKdenlive(mixdownWavPath));
  for (const vp of uniqueVideoPaths) {
    probeMap.set(vp, await probeMediaForKdenlive(vp));
  }

  // 3. Load existing `.kdenlive` XML if present, else construct fresh Kdenlive 1.1 skeleton
  const existedBefore = fs.existsSync(resolvedKdenlivePath);
  const doc = existedBefore
    ? parseMltXml(fs.readFileSync(resolvedKdenlivePath, 'utf8'))
    : createFreshKdenliveSkeleton(project.name || kdenliveStem, kdenliveDir);

  const mltRoot = doc.root;
  const effectiveRootDir = mltRoot.attrs?.root ? path.resolve(kdenliveDir, mltRoot.attrs.root) : kdenliveDir;
  if (!existedBefore) mltRoot.attrs.root = kdenliveDir;

  const { mainBin, seqTractor, projectWrapper, fps } = locateSequenceTractorAndBin(mltRoot);
  const alloc = createIdAllocator(mltRoot);

  const rebuildById = () => {
    const map = new Map();
    for (const c of mltRoot.children) {
      if (c.type === 'element' && c.attrs?.id) map.set(c.attrs.id, c);
    }
    return map;
  };
  let byId = rebuildById();

  // 4. Ensure Project Bin (`main_bin`) has an up-to-date bin `<chain>` for the mixdown WAV + every video file
  const binEntryIds = new Set(
    mainBin.children
      .filter(c => c.type === 'element' && c.tag === 'entry' && c.attrs?.producer)
      .map(c => c.attrs.producer)
  );

  const findExistingBinProducerForFile = (absPath) => {
    const targetResolved = path.resolve(absPath);
    for (const prodId of binEntryIds) {
      const node = byId.get(prodId);
      if (!node || (node.tag !== 'chain' && node.tag !== 'producer')) continue;
      const resRaw = getProp(node, 'resource');
      if (!resRaw) continue;
      if (resolveResourceAgainstRoot(resRaw, effectiveRootDir) === targetResolved) {
        return node;
      }
    }
    return null;
  };

  const insertBeforeMainBin = (newNode) => {
    const idx = mltRoot.children.indexOf(mainBin);
    if (idx === -1) mltRoot.children.unshift(newNode);
    else mltRoot.children.splice(idx, 0, newNode);
    if (newNode.attrs?.id) byId.set(newNode.attrs.id, newNode);
  };

  const ensureBinAsset = (absPath, clipName, isAudioOnly) => {
    const probe = probeMap.get(absPath);
    const totalFrames = Math.max(1, secToFrames(probe.durationSec, fps));
    const outClock = framesToClock(totalFrames - 1, fps);
    const durClock = framesToClock(totalFrames, fps);
    const resStr = formatResourceForRoot(absPath, effectiveRootDir);

    const existing = findExistingBinProducerForFile(absPath);
    if (existing) {
      const kid = getProp(existing, 'kdenlive:id') || alloc.nextKdenliveId();
      existing.attrs.in = '00:00:00.000';
      existing.attrs.out = outClock;
      setProp(existing, 'length', String(totalFrames));
      setProp(existing, 'resource', resStr);
      setProp(existing, 'kdenlive:id', kid);
      setProp(existing, 'kdenlive:duration', durClock);
      setProp(existing, 'kdenlive:file_size', String(probe.fileSize));
      setProp(existing, 'kdenlive:file_hash', probe.fileHash);
      const binEntry = mainBin.children.find(
        c => c.type === 'element' && c.tag === 'entry' && c.attrs?.producer === existing.attrs.id
      );
      if (binEntry) {
        binEntry.attrs.in = '00:00:00.000';
        binEntry.attrs.out = outClock;
      }
      return { binProducerId: existing.attrs.id, kdenliveId: kid, resource: resStr, probe };
    }

    const chainId = alloc.nextId('chain');
    const kid = alloc.nextKdenliveId();
    const chainNode = buildChainElement({
      chainId,
      resource: resStr,
      clipName,
      kdenliveId: kid,
      probe,
      fps,
      forTimeline: false,
      isAudioOnly,
    });
    insertBeforeMainBin(chainNode);
    mainBin.children.push(el('entry', { producer: chainId, in: '00:00:00.000', out: outClock }));
    binEntryIds.add(chainId);
    return { binProducerId: chainId, kdenliveId: kid, resource: resStr, probe };
  };

  const mixdownBinAsset = ensureBinAsset(mixdownWavPath, ROBOS_AUDIO_TRACK_NAME, true);
  const videoBinAssets = new Map();
  for (const vp of uniqueVideoPaths) {
    videoBinAssets.set(vp, ensureBinAsset(vp, path.basename(vp, path.extname(vp)), false));
  }

  // 5. Inspect existing timeline tracks inside `seqTractor`
  const seqTrackRefs = seqTractor.children.filter(c => c.type === 'element' && c.tag === 'track' && c.attrs?.producer);
  const blackTrackId = seqTrackRefs[0]?.attrs?.producer || 'producer0';
  const blackTrackNode = byId.get(blackTrackId);

  const existingTrackEntries = [];
  for (const trRef of seqTrackRefs) {
    const tid = trRef.attrs.producer;
    if (tid === blackTrackId || tid === 'black_track') continue;
    const tNode = byId.get(tid);
    if (!tNode || tNode.tag !== 'tractor') continue;
    const trackName = getProp(tNode, 'kdenlive:track_name') || '';
    const isAudio = getProp(tNode, 'kdenlive:audio_track') === '1';
    const isRobosAudio = trackName === ROBOS_AUDIO_TRACK_NAME || getProp(tNode, 'robos:role') === 'audio-mixdown';
    const isRobosVideo = trackName.startsWith(ROBOS_VIDEO_TRACK_PREFIX) || getProp(tNode, 'robos:role') === 'video-track';
    existingTrackEntries.push({
      tractorId: tid,
      tractorNode: tNode,
      trackName,
      isAudio,
      isRobosAudio,
      isRobosVideo,
    });
  }

  const insertBeforeSeqTractor = (newNode) => {
    const idx = mltRoot.children.indexOf(seqTractor);
    if (idx === -1) mltRoot.children.push(newNode);
    else mltRoot.children.splice(idx, 0, newNode);
    if (newNode.attrs?.id) byId.set(newNode.attrs.id, newNode);
  };

  const removeOrphanedTimelineChainsForPlaylists = (playlistNodes) => {
    const oldChainIds = new Set();
    for (const pl of playlistNodes) {
      for (const ch of (pl.children || [])) {
        if (ch.type === 'element' && ch.tag === 'entry' && ch.attrs?.producer && !binEntryIds.has(ch.attrs.producer)) {
          oldChainIds.add(ch.attrs.producer);
        }
      }
    }
    if (oldChainIds.size > 0) {
      mltRoot.children = mltRoot.children.filter(
        c => !(c.type === 'element' && c.attrs?.id && oldChainIds.has(c.attrs.id))
      );
      byId = rebuildById();
    }
  };

  const trackReport = [];
  let maxTimelineFrames = 30;

  // ── 5A. Reconcile `RobOS Audio Mixdown` Track (Update Existing OR Create New) ──
  const mixFrames = Math.max(1, secToFrames(mixdownBinAsset.probe.durationSec, fps));
  if (mixFrames > maxTimelineFrames) maxTimelineFrames = mixFrames;
  const mixOutClock = framesToClock(mixFrames - 1, fps);

  const tlMixChainId = alloc.nextId('chain');
  const tlMixChain = buildChainElement({
    chainId: tlMixChainId,
    resource: mixdownBinAsset.resource,
    clipName: ROBOS_AUDIO_TRACK_NAME,
    kdenliveId: mixdownBinAsset.kdenliveId,
    probe: mixdownBinAsset.probe,
    fps,
    forTimeline: true,
    isAudioOnly: true,
  });
  insertBeforeSeqTractor(tlMixChain);

  let audioTractorInfo = existingTrackEntries.find(e => e.isRobosAudio) || null;
  if (audioTractorInfo) {
    const tNode = audioTractorInfo.tractorNode;
    const plRefs = tNode.children
      .filter(c => c.type === 'element' && c.tag === 'track' && c.attrs?.producer)
      .map(c => byId.get(c.attrs.producer))
      .filter(Boolean);
    removeOrphanedTimelineChainsForPlaylists(plRefs);

    let pl0 = plRefs[0];
    let pl1 = plRefs[1];
    if (!pl0) {
      pl0 = el('playlist', { id: alloc.nextId('playlist') }, [propEl('kdenlive:audio_track', '1')]);
      insertBeforeSeqTractor(pl0);
    }
    if (!pl1) {
      pl1 = el('playlist', { id: alloc.nextId('playlist') }, [propEl('kdenlive:audio_track', '1')]);
      insertBeforeSeqTractor(pl1);
    }
    pl0.children = [
      propEl('kdenlive:audio_track', '1'),
      el('entry', { producer: tlMixChainId, in: '00:00:00.000', out: mixOutClock }, [
        propEl('kdenlive:id', mixdownBinAsset.kdenliveId),
      ]),
    ];
    pl1.children = [propEl('kdenlive:audio_track', '1')];

    tNode.attrs.in = '00:00:00.000';
    tNode.attrs.out = mixOutClock;
    setProp(tNode, 'kdenlive:audio_track', '1');
    setProp(tNode, 'kdenlive:track_name', ROBOS_AUDIO_TRACK_NAME);
    setProp(tNode, 'robos:role', 'audio-mixdown');

    trackReport.push({ name: ROBOS_AUDIO_TRACK_NAME, kind: 'audio', action: 'updated', clips: 1 });
  } else {
    const pl0Id = alloc.nextId('playlist');
    const pl1Id = alloc.nextId('playlist');
    const trId = alloc.nextId('tractor');
    const pl0 = el('playlist', { id: pl0Id }, [
      propEl('kdenlive:audio_track', '1'),
      el('entry', { producer: tlMixChainId, in: '00:00:00.000', out: mixOutClock }, [
        propEl('kdenlive:id', mixdownBinAsset.kdenliveId),
      ]),
    ]);
    const pl1 = el('playlist', { id: pl1Id }, [propEl('kdenlive:audio_track', '1')]);
    const trNode = el('tractor', { id: trId, in: '00:00:00.000', out: mixOutClock }, [
      propEl('kdenlive:audio_track', '1'),
      propEl('kdenlive:trackheight', '67'),
      propEl('kdenlive:timeline_active', '1'),
      propEl('kdenlive:collapsed', '0'),
      propEl('kdenlive:track_name', ROBOS_AUDIO_TRACK_NAME),
      propEl('robos:role', 'audio-mixdown'),
      propEl('kdenlive:thumbs_format'),
      propEl('kdenlive:audio_rec'),
      el('track', { hide: 'video', producer: pl0Id }),
      el('track', { hide: 'video', producer: pl1Id }),
      ...buildAudioTrackFilters(alloc),
    ]);
    insertBeforeSeqTractor(pl0);
    insertBeforeSeqTractor(pl1);
    insertBeforeSeqTractor(trNode);
    audioTractorInfo = {
      tractorId: trId,
      tractorNode: trNode,
      trackName: ROBOS_AUDIO_TRACK_NAME,
      isAudio: true,
      isRobosAudio: true,
      isRobosVideo: false,
    };
    trackReport.push({ name: ROBOS_AUDIO_TRACK_NAME, kind: 'audio', action: 'created', clips: 1 });
  }

  // ── 5B. Reconcile Named `RobOS Video — <Track>` Tracks (Update Existing OR Create New) ──
  const desiredVideoNames = new Set(dawVideoTracks.map(v => v.kdenliveTrackName));
  const existingRobosVideoByName = new Map();

  // Purge any obsolete RobOS video tracks whose DAW track was removed
  for (const entry of existingTrackEntries) {
    if (!entry.isRobosVideo) continue;
    if (desiredVideoNames.has(entry.trackName) && !existingRobosVideoByName.has(entry.trackName)) {
      existingRobosVideoByName.set(entry.trackName, entry);
    } else {
      const plIds = entry.tractorNode.children
        .filter(c => c.type === 'element' && c.tag === 'track' && c.attrs?.producer)
        .map(c => c.attrs.producer);
      const plNodes = plIds.map(id => byId.get(id)).filter(Boolean);
      removeOrphanedTimelineChainsForPlaylists(plNodes);
      const dropIds = new Set([entry.tractorId, ...plIds]);
      mltRoot.children = mltRoot.children.filter(c => !(c.type === 'element' && c.attrs?.id && dropIds.has(c.attrs.id)));
      byId = rebuildById();
      trackReport.push({ name: entry.trackName, kind: 'video', action: 'removed-stale', clips: 0 });
    }
  }

  const finalRobosVideoEntries = [];
  for (const vt of dawVideoTracks) {
    // Build sequential <blank> + <entry> children for this video track's takes
    const playlistChildren = [];
    let cursorFrames = 0;

    for (const seg of vt.segments) {
      const binAsset = videoBinAssets.get(seg.videoFile);
      const probe = binAsset.probe;
      const sourceMaxFrames = Math.max(1, secToFrames(probe.durationSec, fps));

      const startFrames = secToFrames(seg.timelineStartSec, fps);
      const gapFrames = startFrames - cursorFrames;
      if (gapFrames > 0) {
        playlistChildren.push(el('blank', { length: framesToClock(gapFrames, fps) }));
        cursorFrames += gapFrames;
      }

      const inFrames = Math.min(sourceMaxFrames - 1, secToFrames(seg.sourceOffsetSec, fps));
      const requestedDurFrames = Math.max(1, secToFrames(seg.durationSec, fps));
      const availFrames = Math.max(1, sourceMaxFrames - inFrames);
      const durFrames = Math.min(requestedDurFrames, availFrames);
      const outFrames = inFrames + durFrames - 1;

      const tlChainId = alloc.nextId('chain');
      const tlChain = buildChainElement({
        chainId: tlChainId,
        resource: binAsset.resource,
        clipName: seg.name || vt.dawTrackName,
        kdenliveId: binAsset.kdenliveId,
        probe,
        fps,
        forTimeline: true,
        isAudioOnly: false,
      });
      insertBeforeSeqTractor(tlChain);

      playlistChildren.push(el('entry', {
        producer: tlChainId,
        in: framesToClock(inFrames, fps),
        out: framesToClock(outFrames, fps),
      }, [
        propEl('kdenlive:id', binAsset.kdenliveId),
      ]));

      cursorFrames += durFrames;
      if (cursorFrames > maxTimelineFrames) maxTimelineFrames = cursorFrames;
    }

    const trackOutClock = framesToClock(Math.max(0, cursorFrames - 1), fps);
    const existingVid = existingRobosVideoByName.get(vt.kdenliveTrackName) || null;

    if (existingVid) {
      const tNode = existingVid.tractorNode;
      const plRefs = tNode.children
        .filter(c => c.type === 'element' && c.tag === 'track' && c.attrs?.producer)
        .map(c => byId.get(c.attrs.producer))
        .filter(Boolean);
      removeOrphanedTimelineChainsForPlaylists(plRefs);

      let pl0 = plRefs[0];
      let pl1 = plRefs[1];
      if (!pl0) {
        pl0 = el('playlist', { id: alloc.nextId('playlist') });
        insertBeforeSeqTractor(pl0);
      }
      if (!pl1) {
        pl1 = el('playlist', { id: alloc.nextId('playlist') });
        insertBeforeSeqTractor(pl1);
      }
      pl0.children = playlistChildren;
      pl1.children = [];

      tNode.attrs.in = '00:00:00.000';
      tNode.attrs.out = trackOutClock;
      setProp(tNode, 'kdenlive:track_name', vt.kdenliveTrackName);
      setProp(tNode, 'robos:role', 'video-track');
      setProp(tNode, 'robos:daw_track_id', vt.dawTrackId);

      finalRobosVideoEntries.push(existingVid);
      trackReport.push({ name: vt.kdenliveTrackName, kind: 'video', action: 'updated', clips: vt.segments.length });
    } else {
      const pl0Id = alloc.nextId('playlist');
      const pl1Id = alloc.nextId('playlist');
      const trId = alloc.nextId('tractor');

      const pl0 = el('playlist', { id: pl0Id }, playlistChildren);
      const pl1 = el('playlist', { id: pl1Id });
      const trNode = el('tractor', { id: trId, in: '00:00:00.000', out: trackOutClock }, [
        propEl('kdenlive:trackheight', '67'),
        propEl('kdenlive:timeline_active', '1'),
        propEl('kdenlive:collapsed', '0'),
        propEl('kdenlive:track_name', vt.kdenliveTrackName),
        propEl('robos:role', 'video-track'),
        propEl('robos:daw_track_id', vt.dawTrackId),
        propEl('kdenlive:thumbs_format'),
        propEl('kdenlive:audio_rec'),
        el('track', { hide: 'audio', producer: pl0Id }),
        el('track', { hide: 'audio', producer: pl1Id }),
      ]);

      insertBeforeSeqTractor(pl0);
      insertBeforeSeqTractor(pl1);
      insertBeforeSeqTractor(trNode);

      finalRobosVideoEntries.push({
        tractorId: trId,
        tractorNode: trNode,
        trackName: vt.kdenliveTrackName,
        isAudio: false,
        isRobosAudio: false,
        isRobosVideo: true,
      });
      trackReport.push({ name: vt.kdenliveTrackName, kind: 'video', action: 'created', clips: vt.segments.length });
    }
  }

  // 6. Reassemble `seqTractor` tracks preserving all non-RobOS user Kdenlive tracks!
  // Kdenlive ordering convention: black_track (0), Audio tracks (1..A), Video tracks (A+1..A+V)
  const userAudioTracks = existingTrackEntries.filter(e => !e.isRobosAudio && !e.isRobosVideo && e.isAudio);
  const userVideoTracks = existingTrackEntries.filter(e => !e.isRobosAudio && !e.isRobosVideo && !e.isAudio);

  const orderedTimelineTracks = [
    ...userAudioTracks,
    audioTractorInfo,
    ...finalRobosVideoEntries,
    ...userVideoTracks,
  ];

  // Keep existing properties, user transitions (without internal_added="237"), and master filters on `seqTractor`
  const seqProps = seqTractor.children.filter(c => c.type === 'element' && c.tag === 'property');
  const userTransitions = seqTractor.children.filter(
    c => c.type === 'element' && c.tag === 'transition' && getProp(c, 'internal_added') !== '237'
  );
  let masterFilters = seqTractor.children.filter(c => c.type === 'element' && c.tag === 'filter');
  if (!masterFilters.length) {
    masterFilters = buildMasterSequenceFilters(alloc);
  }

  const seqOutClock = framesToClock(Math.max(0, maxTimelineFrames - 1), fps);
  const blackOutClock = framesToClock(maxTimelineFrames + Math.round(fps * 300), fps);
  if (blackTrackNode) {
    blackTrackNode.attrs.in = '00:00:00.000';
    blackTrackNode.attrs.out = blackOutClock;
  }

  seqTractor.attrs.in = '00:00:00.000';
  seqTractor.attrs.out = seqOutClock;
  seqTractor.children = [
    ...seqProps,
    el('track', { producer: blackTrackId }),
    ...orderedTimelineTracks.map(t => el('track', { producer: t.tractorId })),
    ...userTransitions,
    ...buildInternalTrackTransitions(alloc, orderedTimelineTracks),
    ...masterFilters,
  ];

  setProp(seqTractor, 'kdenlive:sequenceproperties.tracksCount', String(orderedTimelineTracks.length));
  setProp(seqTractor, 'kdenlive:sequenceproperties.hasAudio', '1');
  setProp(seqTractor, 'kdenlive:sequenceproperties.hasVideo', orderedTimelineTracks.some(t => !t.isAudio) ? '1' : '0');
  setProp(seqTractor, 'kdenlive:duration', framesToSmpteDuration(maxTimelineFrames, fps));
  setProp(seqTractor, 'kdenlive:maxduration', String(maxTimelineFrames));

  if (projectWrapper) {
    projectWrapper.attrs.in = '00:00:00.000';
    projectWrapper.attrs.out = seqOutClock;
    const wTrack = projectWrapper.children.find(c => c.type === 'element' && c.tag === 'track');
    if (wTrack) {
      wTrack.attrs.in = '00:00:00.000';
      wTrack.attrs.out = seqOutClock;
    }
  }

  // 7. Write `.kdenlive` atomically
  const xmlOut = serializeMltXml(doc);
  const tmpFile = `${resolvedKdenlivePath}.tmp`;
  fs.writeFileSync(tmpFile, xmlOut, 'utf8');
  fs.renameSync(tmpFile, resolvedKdenlivePath);

  const createdCount = trackReport.filter(r => r.action === 'created').length;
  const updatedCount = trackReport.filter(r => r.action === 'updated').length;

  return {
    ok: true,
    kdenlivePath: resolvedKdenlivePath,
    mixdownWavPath,
    assetsDir,
    existedBefore,
    fps,
    audioTrackName: ROBOS_AUDIO_TRACK_NAME,
    videoTrackCount: dawVideoTracks.length,
    preservedUserTrackCount: userAudioTracks.length + userVideoTracks.length,
    createdTrackCount: createdCount,
    updatedTrackCount: updatedCount,
    tracks: trackReport,
  };
}

module.exports = {
  ROBOS_AUDIO_TRACK_NAME,
  ROBOS_VIDEO_TRACK_PREFIX,
  parseMltXml,
  serializeMltXml,
  getProp,
  setProp,
  computeKdenliveFileHash,
  buildNonOverlappingVideoSegments,
  extractDawVideoTracksSpec,
  saveOrUpdateKdenliveProject,
};

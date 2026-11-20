'use strict';

/**
 * RobOS DAW Studio — Ultra-Low-Latency Discrete Multi-Channel PipeWire Raw PCM Capture Engine
 *
 * Captures any combination of 1-channel PipeWire targets (`Input 1..8`, `S/PDIF 1..2`)
 * AND multi-channel de-interleaved ADAT targets (`...HiFi__Direct2__source#ch=0..7&total=8`)
 * into discrete mono 16-bit PCM `.wav` files with sub-25ms streaming waveform slices
 * and real-time dBFS metering.
 */

const fs = require('fs');
const { spawn, execFile, execFileSync } = require('child_process');

let cachedSplitParentMap = null;

function parsePwDumpSplitMap(jsonText) {
  const map = new Map();
  try {
    const arr = JSON.parse(jsonText);
    for (const obj of arr) {
      const p = obj?.info?.props;
      if (!p || !p['node.name'] || !p['api.alsa.split.name'] || p['api.alsa.split.parent']) continue;
      if (p['media.class'] !== 'Audio/Source') continue;
      const hwPos = String(p['api.alsa.split.hw-position'] || '').replace(/[\[\]\s]/g, '').split(',').filter(Boolean);
      const pos = String(p['api.alsa.split.position'] || '').replace(/[\[\]\s]/g, '').split(',').filter(Boolean);
      const indices = pos.map(ch => hwPos.indexOf(ch)).filter(i => i >= 0);
      if (indices.length && hwPos.length > 1) {
        map.set(p['node.name'], {
          parentNodeName: p['api.alsa.split.name'],
          totalChannels: hwPos.length,
          indices,
        });
      }
    }
  } catch {}
  return map;
}

function warmSplitParentCache() {
  return new Promise((resolve) => {
    execFile('pw-dump', ['PipeWire:Interface:Node'], { maxBuffer: 16 * 1024 * 1024, timeout: 2500 }, (err, stdout) => {
      if (!err && stdout) {
        cachedSplitParentMap = parsePwDumpSplitMap(stdout);
      }
      resolve(cachedSplitParentMap);
    });
  });
}

function getSplitParentMapSync() {
  if (cachedSplitParentMap) return cachedSplitParentMap;
  try {
    const out = execFileSync('pw-dump', ['PipeWire:Interface:Node'], {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      timeout: 1500,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    cachedSplitParentMap = parsePwDumpSplitMap(out);
  } catch {
    cachedSplitParentMap = new Map();
  }
  return cachedSplitParentMap;
}

function parseChannelTarget(targetNodeName) {
  const raw = String(targetNodeName || '');
  const m = raw.match(/^([^#]+)#ch=(\d+)(?:&total=(\d+))?$/);
  if (!m) return { baseNodeName: raw, channelIndex: null, totalChannels: 1 };
  return {
    baseNodeName: m[1],
    channelIndex: parseInt(m[2], 10),
    totalChannels: parseInt(m[3] || '8', 10),
  };
}

/**
 * When 2+ armed tracks belong to the same multi-channel USB interface (e.g. Focusrite Scarlett 18i20
 * Analog Inputs `Mic1/Line9` + `ADAT Direct2`), unify them onto their single ALSA hardware split parent
 * (`alsa_input.hw_USB_0`, 20 channels) so ONE `pw-cat` process captures all channels with 0.000ms skew.
 */
function unifyHardwareSplitTargets(parsedList) {
  const namedCount = parsedList.filter(p => Boolean(p.baseNodeName)).length;
  if (namedCount < 2) return parsedList;

  const splitMap = getSplitParentMapSync();
  if (!splitMap || splitMap.size === 0) return parsedList;

  // Count how many armed tracks share each parent hardware node
  const parentCounts = new Map();
  for (const p of parsedList) {
    const info = splitMap.get(p.baseNodeName);
    if (info) {
      parentCounts.set(info.parentNodeName, (parentCounts.get(info.parentNodeName) || 0) + 1);
    }
  }

  return parsedList.map(p => {
    const info = splitMap.get(p.baseNodeName);
    if (!info || (parentCounts.get(info.parentNodeName) || 0) < 2) return p;
    const subIdx = p.channelIndex !== null ? p.channelIndex : 0;
    const hwChan = info.indices[subIdx];
    if (hwChan === undefined || hwChan < 0) return p;
    return {
      baseNodeName: info.parentNodeName,
      channelIndex: hwChan,
      totalChannels: info.totalChannels,
    };
  });
}

function makeWavHeader(dataBytes, sampleRate = 48000) {
  const hdr = Buffer.alloc(44);
  hdr.write('RIFF', 0);
  hdr.writeUInt32LE(36 + dataBytes, 4);
  hdr.write('WAVE', 8);
  hdr.write('fmt ', 12);
  hdr.writeUInt32LE(16, 16);
  hdr.writeUInt16LE(1, 20);
  hdr.writeUInt16LE(1, 22);
  hdr.writeUInt32LE(sampleRate, 24);
  hdr.writeUInt32LE(sampleRate * 2, 28);
  hdr.writeUInt16LE(2, 32);
  hdr.writeUInt16LE(16, 34);
  hdr.write('data', 36);
  hdr.writeUInt32LE(dataBytes, 40);
  return hdr;
}

/**
 * Feed mono 16-bit PCM samples into a trackState's 20ms waveform slice accumulator.
 */
function ingestMonoPcmBuffer(st, monoSlice, sliceSamples) {
  let localMax = 0;
  let slicePos = st.slicePos;
  let slicePeak = st.slicePeak;

  for (let i = 0; i + 2 <= monoSlice.length; i += 2) {
    const a = Math.abs(monoSlice.readInt16LE(i)) / 32768;
    if (a > localMax) localMax = a;
    if (a > slicePeak) slicePeak = a;
    slicePos++;
    if (slicePos >= sliceSamples) {
      st.pendingPeaks.push(Number(slicePeak.toFixed(5)));
      slicePos = 0;
      slicePeak = 0;
    }
  }

  st.slicePos = slicePos;
  st.slicePeak = slicePeak;
  if (localMax > st.windowPeakLin) st.windowPeakLin = localMax;
  if (localMax > st.maxPeakLin) st.maxPeakLin = localMax;
}

/**
 * Start parallel discrete capture for an array of items:
 *   `[{ id, inputNodeName, wavFile, ...meta }]`
 */
function startDiscreteCaptureSession(
  items,
  {
    sampleRate = 48000,
    onMeter = null,
    meterIntervalMs = 36,
    minFlushIntervalMs = 22,
    sliceDurationSec = 0.02,
    pwLatency = '10ms',
  } = {}
) {
  const startedAtMs = Date.now();
  const sliceSamples = Math.max(64, Math.round(sampleRate * sliceDurationSec));
  const actualSliceDurationSec = sliceSamples / sampleRate;

  const rawParsed = items.map(item => parseChannelTarget(item.inputNodeName));
  const unifiedTargets = unifyHardwareSplitTargets(rawParsed);

  const trackStates = items.map((item, idx) => {
    const parsed = unifiedTargets[idx];
    const fd = fs.openSync(item.wavFile, 'w');
    // Reserve 44-byte WAV header upfront
    fs.writeSync(fd, makeWavHeader(0, sampleRate), 0, 44, 0);
    return {
      ...item,
      ...parsed,
      fd,
      dataBytes: 0,
      inflightWrites: 0,
      windowPeakLin: 0,
      maxPeakLin: 0,
      lastPeakDb: -96,
      slicePos: 0,
      slicePeak: 0,
      pendingPeaks: [],
    };
  });

  function queueAsyncPcmWrite(st, pcmBuf) {
    if (st.fd === null || pcmBuf.length <= 0) return;
    // Copy slice if backed by shared stdout slab so buffer stays immutable while pwrite completes
    const owned = Buffer.from(pcmBuf);
    const writePos = 44 + st.dataBytes;
    st.dataBytes += owned.length;
    st.inflightWrites++;
    fs.write(st.fd, owned, 0, owned.length, writePos, () => {
      st.inflightWrites = Math.max(0, st.inflightWrites - 1);
    });
  }

  let stopped = false;
  let lastFlushAtMs = 0;
  let pendingFlushTimer = null;

  // Sub-millisecond hardware sync: wall-clock timestamp when Sample #0 left PipeWire / hit the mic
  // Includes pw-cat stream quantum (~10ms) + 256-sample ALSA USB DMA period (~5.33ms) + USB/ADC (~2.7ms)
  const reqLatMatch = String(pwLatency || '10ms').match(/([\d.]+)\s*ms/i);
  const adcCaptureLatencyMs = (reqLatMatch ? Number(reqLatMatch[1]) : 10) + 8.0;
  let firstSampleEmittedAtMs = null;
  let resolveFirstSample = null;
  const firstSamplePromise = new Promise((resolve) => {
    resolveFirstSample = resolve;
  });

  function recordFirstSampleTimestamp(chunkFrames) {
    if (firstSampleEmittedAtMs !== null || chunkFrames <= 0) return;
    firstSampleEmittedAtMs = Date.now() - (chunkFrames / sampleRate) * 1000;
    if (resolveFirstSample) {
      const fn = resolveFirstSample;
      resolveFirstSample = null;
      fn(firstSampleEmittedAtMs);
    }
  }

  function getFirstSampleMicWallMs() {
    return firstSampleEmittedAtMs !== null ? (firstSampleEmittedAtMs - adcCaptureLatencyMs) : null;
  }

  function waitReady(timeoutMs = 280) {
    if (firstSampleEmittedAtMs !== null || stopped) {
      return Promise.resolve(firstSampleEmittedAtMs);
    }
    return Promise.race([
      firstSamplePromise,
      new Promise((resolve) => {
        const t = setTimeout(() => resolve(firstSampleEmittedAtMs), timeoutMs);
        if (t.unref) t.unref();
      }),
    ]);
  }

  function flushProgress() {
    if (stopped) return;
    if (pendingFlushTimer) {
      clearTimeout(pendingFlushTimer);
      pendingFlushTimer = null;
    }
    lastFlushAtMs = Date.now();
    if (!onMeter) {
      for (const st of trackStates) st.pendingPeaks.length = 0;
      return;
    }

    const elapsedSec = Number(((lastFlushAtMs - startedAtMs) / 1000).toFixed(3));
    const meters = trackStates.map(st => {
      const lin = st.windowPeakLin;
      st.windowPeakLin = lin * 0.55; // Responsive meter ballistics decay at ~40fps
      const peakDb = lin <= 0.000015 ? -96 : Number((20 * Math.log10(lin)).toFixed(1));
      st.lastPeakDb = peakDb;
      const maxPeakDb = st.maxPeakLin <= 0.000015 ? -96 : Number((20 * Math.log10(st.maxPeakLin)).toFixed(1));
      const framesRecorded = Math.floor(st.dataBytes / 2);
      const newPeaks = st.pendingPeaks.length ? st.pendingPeaks.splice(0) : [];
      return {
        id: st.id,
        channelIndex: st.channelIndex,
        inputNodeName: st.inputNodeName,
        bytes: 44 + st.dataBytes,
        framesRecorded,
        durationSec: Number((framesRecorded / sampleRate).toFixed(3)),
        peakDb,
        maxPeakDb,
        currentPeak: Number(st.slicePeak.toFixed(5)),
        newPeaks,
      };
    });

    try {
      onMeter({
        elapsedSec,
        sampleRate,
        sliceDurationSec: actualSliceDurationSec,
        tracks: meters,
      });
    } catch {}
  }

  function scheduleLiveFlush() {
    if (stopped || !onMeter) return;
    const now = Date.now();
    const sinceLast = now - lastFlushAtMs;
    if (sinceLast >= minFlushIntervalMs) {
      flushProgress();
    } else if (!pendingFlushTimer) {
      pendingFlushTimer = setTimeout(flushProgress, Math.max(4, minFlushIntervalMs - sinceLast));
      if (pendingFlushTimer.unref) pendingFlushTimer.unref();
    }
  }

  // Group channels that share the same multi-channel PipeWire node (e.g. 8-channel ADAT Direct2)
  const muxGroups = new Map();
  const monoStates = [];
  for (const st of trackStates) {
    if (st.channelIndex !== null && st.totalChannels > 1) {
      const key = `${st.baseNodeName}::${st.totalChannels}`;
      if (!muxGroups.has(key)) {
        muxGroups.set(key, { baseNodeName: st.baseNodeName, totalChannels: st.totalChannels, members: [] });
      }
      muxGroups.get(key).members.push(st);
    } else {
      monoStates.push(st);
    }
  }

  const procs = [];
  const totalStreamCount = monoStates.length + muxGroups.size;
  const startedStreams = new Set();
  let allStreamsArmed = totalStreamCount <= 1;
  let barrierFallbackTimer = null;
  if (!allStreamsArmed) {
    barrierFallbackTimer = setTimeout(() => { allStreamsArmed = true; }, 120);
    if (barrierFallbackTimer.unref) barrierFallbackTimer.unref();
  }
  const markStreamLive = (streamId) => {
    if (allStreamsArmed) return true;
    startedStreams.add(streamId);
    if (startedStreams.size >= totalStreamCount) {
      allStreamsArmed = true;
      if (barrierFallbackTimer) {
        clearTimeout(barrierFallbackTimer);
        barrierFallbackTimer = null;
      }
      return true;
    }
    return false;
  };

  // 1. Spawn low-latency 1-channel raw streams (`--latency 10ms`)
  monoStates.forEach((st, mIdx) => {
    const streamId = `mono:${mIdx}`;
    const args = [
      '--record',
      '--raw',
      '--latency',
      String(pwLatency),
      '--rate',
      String(sampleRate),
      '--channels',
      '1',
      '--format',
      's16',
    ];
    if (st.baseNodeName) args.push('--target', st.baseNodeName);
    args.push('-');

    let remainder = Buffer.alloc(0);
    const child = spawn('pw-cat', args, { stdio: ['ignore', 'pipe', 'ignore'] });
    child.stdout.on('data', (chunk) => {
      if (stopped) return;
      const buf = remainder.length ? Buffer.concat([remainder, chunk]) : chunk;
      const usableLen = buf.length - (buf.length % 2);
      remainder = usableLen < buf.length ? buf.subarray(usableLen) : Buffer.alloc(0);
      if (!markStreamLive(streamId)) return; // Discard early pre-roll until all devices start!
      if (usableLen <= 0 || st.fd === null) return;

      const slice = buf.subarray(0, usableLen);
      recordFirstSampleTimestamp(slice.length / 2);
      queueAsyncPcmWrite(st, slice);

      ingestMonoPcmBuffer(st, slice, sliceSamples);
      scheduleLiveFlush();
    });

    procs.push({
      child,
      closed: new Promise(resolve => {
        child.on('close', resolve);
        child.on('error', resolve);
      }),
    });
  });

  // 2. Spawn low-latency shared N-channel raw streams (e.g. 20-channel USB parent or 8-channel ADAT) and de-interleave!
  let muxIdx = 0;
  for (const group of muxGroups.values()) {
    const streamId = `mux:${muxIdx++}`;
    const frameBytes = group.totalChannels * 2;
    const args = [
      '--record',
      '--raw',
      '--latency',
      String(pwLatency),
      '--rate',
      String(sampleRate),
      '--channels',
      String(group.totalChannels),
      '--format',
      's16',
    ];
    if (group.baseNodeName) args.push('--target', group.baseNodeName);
    args.push('-');

    let remainder = Buffer.alloc(0);
    const child = spawn('pw-cat', args, { stdio: ['ignore', 'pipe', 'ignore'] });
    child.stdout.on('data', (chunk) => {
      if (stopped) return;
      const buf = remainder.length ? Buffer.concat([remainder, chunk]) : chunk;
      const frames = Math.floor(buf.length / frameBytes);
      const usableLen = frames * frameBytes;
      remainder = usableLen < buf.length ? buf.subarray(usableLen) : Buffer.alloc(0);
      if (!markStreamLive(streamId)) return; // Discard early pre-roll until all devices start!
      if (frames <= 0) return;
      recordFirstSampleTimestamp(frames);

      for (const st of group.members) {
        if (st.fd === null || st.channelIndex >= group.totalChannels) continue;
        const monoBuf = Buffer.allocUnsafe(frames * 2);
        let localMax = 0;
        let slicePos = st.slicePos;
        let slicePeak = st.slicePeak;
        const chByteOffset = st.channelIndex * 2;
        for (let f = 0; f < frames; f++) {
          const sample = buf.readInt16LE(f * frameBytes + chByteOffset);
          monoBuf.writeInt16LE(sample, f * 2);
          const a = Math.abs(sample) / 32768;
          if (a > localMax) localMax = a;
          if (a > slicePeak) slicePeak = a;
          slicePos++;
          if (slicePos >= sliceSamples) {
            st.pendingPeaks.push(Number(slicePeak.toFixed(5)));
            slicePos = 0;
            slicePeak = 0;
          }
        }
        st.slicePos = slicePos;
        st.slicePeak = slicePeak;
        if (st.fd !== null) {
          const writePos = 44 + st.dataBytes;
          st.dataBytes += monoBuf.length;
          st.inflightWrites++;
          fs.write(st.fd, monoBuf, 0, monoBuf.length, writePos, () => {
            st.inflightWrites = Math.max(0, st.inflightWrites - 1);
          });
        }
        if (localMax > st.windowPeakLin) st.windowPeakLin = localMax;
        if (localMax > st.maxPeakLin) st.maxPeakLin = localMax;
      }
      scheduleLiveFlush();
    });

    procs.push({
      child,
      closed: new Promise(resolve => {
        child.on('close', resolve);
        child.on('error', resolve);
      }),
    });
  }

  // Fallback heartbeat timer (in case PipeWire hasn't delivered chunks yet or running in headless container)
  const meterTimer = setInterval(() => {
    if (stopped) return;
    if (Date.now() - lastFlushAtMs >= meterIntervalMs) {
      flushProgress();
    }
  }, meterIntervalMs);
  if (meterTimer.unref) meterTimer.unref();

  async function stop() {
    if (stopped) return trackStates;
    stopped = true;
    if (resolveFirstSample) {
      const fn = resolveFirstSample;
      resolveFirstSample = null;
      fn(firstSampleEmittedAtMs);
    }
    clearInterval(meterTimer);
    if (pendingFlushTimer) {
      clearTimeout(pendingFlushTimer);
      pendingFlushTimer = null;
    }

    // Node writes the RIFF WAV header directly, so tear down raw pw-cat pipes immediately (<5ms)
    for (const p of procs) {
      try { p.child.stdout?.destroy(); } catch {}
      try { p.child.kill('SIGKILL'); } catch {}
    }
    await Promise.race([
      Promise.all(procs.map(p => p.closed)),
      new Promise(r => { const t = setTimeout(r, 25); if (t.unref) t.unref(); }),
    ]);

    // Drain any in-flight positional pwrite calls (typically <2ms)
    const drainDeadline = Date.now() + 120;
    while (trackStates.some(st => st.inflightWrites > 0) && Date.now() < drainDeadline) {
      await new Promise(r => setTimeout(r, 1));
    }

    for (const st of trackStates) {
      if (st.fd !== null) {
        try {
          // Finalize RIFF WAV byte length header at offset 0..43
          fs.writeSync(st.fd, makeWavHeader(st.dataBytes, sampleRate), 0, 44, 0);
          fs.closeSync(st.fd);
        } catch {}
        st.fd = null;
      }
    }
    return trackStates;
  }

  return {
    startedAtMs,
    sliceDurationSec: actualSliceDurationSec,
    trackStates,
    waitReady,
    getFirstSampleMicWallMs,
    stop,
  };
}

module.exports = {
  parseChannelTarget,
  parsePwDumpSplitMap,
  unifyHardwareSplitTargets,
  warmSplitParentCache,
  makeWavHeader,
  ingestMonoPcmBuffer,
  startDiscreteCaptureSession,
};

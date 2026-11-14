'use strict';

/**
 * RobOS DAW Studio — Discrete Multi-Channel PipeWire Raw PCM Capture Engine
 *
 * Captures any combination of 1-channel PipeWire targets (`Input 1..8`, `S/PDIF 1..2`)
 * AND multi-channel de-interleaved ADAT targets (`...HiFi__Direct2__source#ch=0..7&total=8`)
 * into discrete mono 16-bit PCM `.wav` files with real-time in-memory dBFS metering.
 */

const fs = require('fs');
const { spawn } = require('child_process');

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
 * Start parallel discrete capture for an array of items:
 *   `[{ id, inputNodeName, wavFile, ...meta }]`
 */
function startDiscreteCaptureSession(items, { sampleRate = 48000, onMeter = null, meterIntervalMs = 150 } = {}) {
  const startedAtMs = Date.now();
  const trackStates = items.map(item => {
    const parsed = parseChannelTarget(item.inputNodeName);
    const fd = fs.openSync(item.wavFile, 'w');
    // Reserve 44-byte WAV header upfront
    fs.writeSync(fd, makeWavHeader(0, sampleRate), 0, 44, 0);
    return {
      ...item,
      ...parsed,
      fd,
      dataBytes: 0,
      windowPeakLin: 0,
      maxPeakLin: 0,
      lastPeakDb: -96,
    };
  });

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

  // 1. Spawn 1-channel raw streams
  for (const st of monoStates) {
    const args = ['--record', '--raw', '--rate', String(sampleRate), '--channels', '1', '--format', 's16'];
    if (st.baseNodeName) args.push('--target', st.baseNodeName);
    args.push('-');

    let remainder = Buffer.alloc(0);
    const child = spawn('pw-cat', args, { stdio: ['ignore', 'pipe', 'ignore'] });
    child.stdout.on('data', (chunk) => {
      const buf = remainder.length ? Buffer.concat([remainder, chunk]) : chunk;
      const usableLen = buf.length - (buf.length % 2);
      remainder = usableLen < buf.length ? buf.subarray(usableLen) : Buffer.alloc(0);
      if (usableLen <= 0 || st.fd === null) return;

      const slice = buf.subarray(0, usableLen);
      try {
        fs.writeSync(st.fd, slice, 0, slice.length, 44 + st.dataBytes);
        st.dataBytes += slice.length;
      } catch {}

      let localMax = 0;
      for (let i = 0; i + 2 <= slice.length; i += 2) {
        const a = Math.abs(slice.readInt16LE(i)) / 32768;
        if (a > localMax) localMax = a;
      }
      if (localMax > st.windowPeakLin) st.windowPeakLin = localMax;
      if (localMax > st.maxPeakLin) st.maxPeakLin = localMax;
    });

    procs.push({
      child,
      closed: new Promise(resolve => {
        child.on('close', resolve);
        child.on('error', resolve);
      }),
    });
  }

  // 2. Spawn shared N-channel raw streams (e.g. 8-channel ADAT Optical Input) and de-interleave!
  for (const group of muxGroups.values()) {
    const frameBytes = group.totalChannels * 2;
    const args = ['--record', '--raw', '--rate', String(sampleRate), '--channels', String(group.totalChannels), '--format', 's16'];
    if (group.baseNodeName) args.push('--target', group.baseNodeName);
    args.push('-');

    let remainder = Buffer.alloc(0);
    const child = spawn('pw-cat', args, { stdio: ['ignore', 'pipe', 'ignore'] });
    child.stdout.on('data', (chunk) => {
      const buf = remainder.length ? Buffer.concat([remainder, chunk]) : chunk;
      const frames = Math.floor(buf.length / frameBytes);
      const usableLen = frames * frameBytes;
      remainder = usableLen < buf.length ? buf.subarray(usableLen) : Buffer.alloc(0);
      if (frames <= 0) return;

      for (const st of group.members) {
        if (st.fd === null || st.channelIndex >= group.totalChannels) continue;
        const monoBuf = Buffer.allocUnsafe(frames * 2);
        let localMax = 0;
        const chByteOffset = st.channelIndex * 2;
        for (let f = 0; f < frames; f++) {
          const sample = buf.readInt16LE(f * frameBytes + chByteOffset);
          monoBuf.writeInt16LE(sample, f * 2);
          const a = Math.abs(sample) / 32768;
          if (a > localMax) localMax = a;
        }
        try {
          fs.writeSync(st.fd, monoBuf, 0, monoBuf.length, 44 + st.dataBytes);
          st.dataBytes += monoBuf.length;
        } catch {}
        if (localMax > st.windowPeakLin) st.windowPeakLin = localMax;
        if (localMax > st.maxPeakLin) st.maxPeakLin = localMax;
      }
    });

    procs.push({
      child,
      closed: new Promise(resolve => {
        child.on('close', resolve);
        child.on('error', resolve);
      }),
    });
  }

  let stopped = false;
  const meterTimer = setInterval(() => {
    if (stopped) return;
    const elapsedSec = Number(((Date.now() - startedAtMs) / 1000).toFixed(2));
    const meters = trackStates.map(st => {
      const lin = st.windowPeakLin;
      st.windowPeakLin = lin * 0.35; // Smooth meter ballistics decay
      const peakDb = lin <= 0.000015 ? -96 : Number((20 * Math.log10(lin)).toFixed(1));
      st.lastPeakDb = peakDb;
      const maxPeakDb = st.maxPeakLin <= 0.000015 ? -96 : Number((20 * Math.log10(st.maxPeakLin)).toFixed(1));
      return {
        id: st.id,
        channelIndex: st.channelIndex,
        inputNodeName: st.inputNodeName,
        bytes: 44 + st.dataBytes,
        peakDb,
        maxPeakDb,
      };
    });
    if (onMeter) {
      try { onMeter({ elapsedSec, tracks: meters }); } catch {}
    }
  }, meterIntervalMs);

  async function stop() {
    if (stopped) return trackStates;
    stopped = true;
    clearInterval(meterTimer);

    for (const p of procs) {
      try { p.child.kill('SIGINT'); } catch {}
    }
    await Promise.race([
      Promise.all(procs.map(p => p.closed)),
      new Promise(r => setTimeout(r, 1800)),
    ]);

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
    trackStates,
    stop,
  };
}

module.exports = {
  parseChannelTarget,
  makeWavHeader,
  startDiscreteCaptureSession,
};

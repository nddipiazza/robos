'use strict';

/**
 * RobOS DAW Studio — "Strike Instrument / Tap the Mic" Multi-Channel Auto-Detector
 *
 * Continuously probes PipeWire capture inputs in parallel short windows
 * so striking a drum, strumming a guitar, or tapping a microphone identifies the
 * exact physical Focusrite / PipeWire channel automatically.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { analyzeWavSamples } = require('../../robos-lib/audio-devices');

function probeSingleInput(inputNode, windowMs = 260, activeChildren = null) {
  return new Promise((resolve) => {
    const tmp = path.join(os.tmpdir(), `robos-tap-${process.pid}-${inputNode.id}-${Date.now()}.wav`);
    const args = ['--rate', '48000', '--channels', '1', '--format', 's16', '--target', inputNode.name, tmp];
    const child = execFile('pw-record', args, { timeout: windowMs + 1200 }, () => {});
    if (activeChildren) activeChildren.add(child);
    const timer = setTimeout(() => {
      try { child.kill('SIGINT'); } catch {}
    }, windowMs);
    child.on('close', () => {
      clearTimeout(timer);
      if (activeChildren) activeChildren.delete(child);
      let stats = { peakDb: -96, rmsDb: -96, peakLinear: 0 };
      try {
        if (fs.existsSync(tmp)) {
          const buf = fs.readFileSync(tmp);
          try { fs.unlinkSync(tmp); } catch {}
          if (buf.length >= 64) stats = analyzeWavSamples(buf);
        }
      } catch {}
      resolve({
        id: inputNode.id,
        name: inputNode.name,
        description: inputNode.description,
        isFocusrite: Boolean(inputNode.isFocusrite),
        peakDb: stats.peakDb,
        rmsDb: stats.rmsDb,
      });
    });
  });
}

class MultiChannelTapDetector {
  constructor() {
    this.running = false;
    this.loopPromise = null;
    this.activeChildren = new Set();
  }

  start(inputs, { onLevels, strikeThresholdDb = -26, windowMs = 260 } = {}) {
    this.stop();
    const focusriteOnly = (inputs || []).filter(n => n.isFocusrite);
    const pool = focusriteOnly.length ? focusriteOnly : (inputs || []);
    const candidates = pool.slice(0, 20);
    if (!candidates.length) return { ok: false, error: 'No capture inputs available' };

    this.running = true;
    const runLoop = async () => {
      while (this.running) {
        const levels = await Promise.all(candidates.map(node => probeSingleInput(node, windowMs, this.activeChildren)));
        if (!this.running) break;

        const sorted = [...levels].sort((a, b) => b.peakDb - a.peakDb);
        const loudest = sorted[0] || null;
        const runnerUpDb = sorted[1] ? sorted[1].peakDb : -96;
        // Require clear transient prominence (>= threshold and >= 6 dB above next channel)
        const detected = (loudest && loudest.peakDb >= strikeThresholdDb && (candidates.length === 1 || loudest.peakDb >= runnerUpDb + 6))
          ? loudest
          : null;
        if (onLevels) {
          try { onLevels({ levels, loudest, detected, timestamp: Date.now() }); } catch {}
        }
      }
    };
    this.loopPromise = runLoop();
    return { ok: true, monitoringCount: candidates.length };
  }

  stop() {
    this.running = false;
    for (const child of this.activeChildren) {
      try { child.kill('SIGINT'); } catch {}
    }
    this.activeChildren.clear();
    return { ok: true };
  }
}

module.exports = {
  probeSingleInput,
  MultiChannelTapDetector,
};

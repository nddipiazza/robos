'use strict';

/**
 * RobOS DAW Studio — "Strike Instrument / Tap the Mic" Multi-Channel Auto-Detector
 *
 * Continuously streams all Focusrite / PipeWire inputs simultaneously (including
 * 8-channel de-interleaved ADAT Optical inputs!) via `pcm-capture.js` so striking
 * any drum, cymbal, or tapping any microphone locks onto its channel instantaneously.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { startDiscreteCaptureSession } = require('./pcm-capture');

class MultiChannelTapDetector {
  constructor() {
    this.running = false;
    this.capture = null;
    this.tmpDir = null;
  }

  start(inputs, { onLevels, strikeThresholdDb = -26 } = {}) {
    this.stop();
    const focusriteOnly = (inputs || []).filter(n => n.isFocusrite);
    const pool = focusriteOnly.length ? focusriteOnly : (inputs || []);
    const candidates = pool.slice(0, 24);
    if (!candidates.length) return { ok: false, error: 'No capture inputs available' };

    const tmpDir = path.join(os.tmpdir(), `robos-tap-${process.pid}-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    this.tmpDir = tmpDir;
    this.running = true;

    const items = candidates.map((node, idx) => ({
      id: node.id,
      name: node.name,
      inputNodeName: node.name,
      description: node.description,
      isFocusrite: Boolean(node.isFocusrite),
      wavFile: path.join(tmpDir, `tap-${idx}.wav`),
    }));

    this.capture = startDiscreteCaptureSession(items, {
      sampleRate: 48000,
      meterIntervalMs: 160,
      onMeter: ({ tracks }) => {
        if (!this.running) return;
        const levels = tracks.map((m, idx) => ({
          id: items[idx].id,
          name: items[idx].name,
          description: items[idx].description,
          isFocusrite: items[idx].isFocusrite,
          peakDb: m.peakDb,
          rmsDb: m.peakDb,
        }));

        const sorted = [...levels].sort((a, b) => b.peakDb - a.peakDb);
        const loudest = sorted[0] || null;
        const runnerUpDb = sorted[1] ? sorted[1].peakDb : -96;
        const detected = (loudest && loudest.peakDb >= strikeThresholdDb && (candidates.length === 1 || loudest.peakDb >= runnerUpDb + 6))
          ? loudest
          : null;

        if (onLevels) {
          try { onLevels({ levels, loudest, detected, timestamp: Date.now() }); } catch {}
        }
      },
    });

    return { ok: true, monitoringCount: candidates.length };
  }

  stop() {
    this.running = false;
    const cap = this.capture;
    const dir = this.tmpDir;
    this.capture = null;
    this.tmpDir = null;
    if (cap) {
      cap.stop().finally(() => {
        if (dir) {
          try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
        }
      });
    }
    return { ok: true };
  }
}

module.exports = {
  MultiChannelTapDetector,
};

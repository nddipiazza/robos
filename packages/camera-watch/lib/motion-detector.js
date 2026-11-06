'use strict';

// Motion detection on small grayscale frames (one byte per pixel), the same idea
// iSpy and most NVRs use: keep a slowly-updated background picture, count the
// pixels that differ from it by more than a threshold, and call it motion when
// enough of the picture changed for a couple of frames in a row.
//
// - sensitivity 1–100: higher means a smaller brightness change counts.
// - minAreaPercent: how much of the picture (or of the zones) must change.
// - zones: optional rectangles in 0–1 coordinates ({ x, y, w, h }); only pixels
//   inside a zone are counted. No zones means the whole picture.
// - A sudden change over most of the picture (lights switched on, the camera's
//   IR mode flipping) resets the background instead of raising motion.
// - Motion ends after cooldownMs without a motion frame.

const DEFAULTS = {
  sensitivity: 60,
  minAreaPercent: 1.5,
  framesToTrigger: 2,
  cooldownMs: 5000,
  lightingChangePercent: 65,
  backgroundRate: 0.08,
};

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function pixelThreshold(sensitivity) {
  // sensitivity 100 → 6 grey levels, sensitivity 1 → 70.
  const s = clamp(Number(sensitivity) || DEFAULTS.sensitivity, 1, 100);
  return Math.round(70 - ((s - 1) / 99) * 64);
}

function buildMask(width, height, zones) {
  if (!Array.isArray(zones) || zones.length === 0) return null;
  const mask = new Uint8Array(width * height);
  let count = 0;
  for (const z of zones) {
    const x0 = clamp(Math.floor((Number(z.x) || 0) * width), 0, width);
    const y0 = clamp(Math.floor((Number(z.y) || 0) * height), 0, height);
    const x1 = clamp(Math.ceil(((Number(z.x) || 0) + (Number(z.w) || 0)) * width), 0, width);
    const y1 = clamp(Math.ceil(((Number(z.y) || 0) + (Number(z.h) || 0)) * height), 0, height);
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = y * width + x;
        if (!mask[i]) { mask[i] = 1; count++; }
      }
    }
  }
  return count > 0 ? mask : null;
}

function createMotionDetector(options = {}) {
  const width = Number(options.width);
  const height = Number(options.height);
  if (!(width > 0 && height > 0)) throw new Error('Motion detector needs a frame width and height.');
  const pixels = width * height;
  let cfg = { ...DEFAULTS };
  let threshold = 0;
  let mask = null;
  let maskCount = pixels;

  function configure(next = {}) {
    cfg = { ...cfg, ...Object.fromEntries(Object.entries(next).filter(([, v]) => v !== undefined)) };
    threshold = pixelThreshold(cfg.sensitivity);
    mask = buildMask(width, height, cfg.zones);
    maskCount = mask ? mask.reduce((a, b) => a + b, 0) : pixels;
  }
  configure(options);

  let background = null;
  let hotFrames = 0;
  let active = false;
  let lastMotionAt = 0;
  let peakScore = 0;

  function feed(frame, now = Date.now()) {
    if (!frame || frame.length < pixels) {
      return { score: 0, motion: active, started: false, ended: false, ignored: true };
    }
    if (!background) {
      background = new Float32Array(pixels);
      for (let i = 0; i < pixels; i++) background[i] = frame[i];
      return { score: 0, motion: false, started: false, ended: false };
    }

    let changed = 0;
    let changedAll = 0;
    for (let i = 0; i < pixels; i++) {
      const diff = Math.abs(frame[i] - background[i]);
      if (diff > threshold) {
        changedAll++;
        if (!mask || mask[i]) changed++;
      }
    }
    const score = (changed / maskCount) * 100;
    const wholePicture = (changedAll / pixels) * 100;

    if (wholePicture >= cfg.lightingChangePercent) {
      // Lighting change, not motion: start over from this frame.
      for (let i = 0; i < pixels; i++) background[i] = frame[i];
      hotFrames = 0;
      return finish(score, false, now, true);
    }

    const rate = cfg.backgroundRate;
    for (let i = 0; i < pixels; i++) background[i] += (frame[i] - background[i]) * rate;

    const hot = score >= cfg.minAreaPercent;
    hotFrames = hot ? hotFrames + 1 : 0;
    return finish(score, hotFrames >= cfg.framesToTrigger, now, false);
  }

  function finish(score, isMotionFrame, now, lightingChange) {
    let started = false;
    let ended = false;
    if (isMotionFrame) {
      lastMotionAt = now;
      peakScore = Math.max(peakScore, score);
      if (!active) { active = true; started = true; }
    } else if (active && now - lastMotionAt >= cfg.cooldownMs) {
      active = false;
      ended = true;
    }
    const result = { score: Math.round(score * 100) / 100, motion: active, started, ended };
    if (ended) { result.peakScore = Math.round(peakScore * 100) / 100; peakScore = 0; }
    if (lightingChange) result.lightingChange = true;
    return result;
  }

  function reset() {
    background = null;
    hotFrames = 0;
    active = false;
    peakScore = 0;
  }

  return { feed, reset, configure, get active() { return active; }, get threshold() { return threshold; } };
}

module.exports = { createMotionDetector, pixelThreshold, DEFAULTS };

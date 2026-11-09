'use strict';

// Saved personalities and their conversations, in ~/.config/robos/personality/.
//
//   personalities.json   { activeId, personalities: [...] }
//   history/<id>.json    the last turns of each personality's conversation
//
// A personality is the set of parts the app wires together: a face, a voice,
// ears, eyes and the AI model that thinks for it.

const fs = require('node:fs');
const path = require('node:path');

const FACE_STYLES = ['robot', 'buddy'];
const HISTORY_LIMIT = 60;

const DEFAULT_PERSONALITY = {
  id: 'robo',
  name: 'Robo',
  persona: 'A warm, curious robot who lives in this computer. Robo talks like a friendly person: short plain sentences, a little playful, and always honest about what it does not know.',
  face: { style: 'robot', color: '#00bcd4' },
  voice: { engine: 'kokoro', voice: 'af_heart', speed: 1, outputDeviceId: 'default', captions: true },
  ears: { deviceId: 'default', sensitivity: 0.5 },
  eyes: { cameraId: '', pip: true },
  model: { provider: '', model: '', effort: '' },
};

function str(v, fallback = '', max = 4000) {
  return typeof v === 'string' ? v.slice(0, max) : fallback;
}

function num(v, fallback, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function slug(name) {
  return String(name || 'personality').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'personality';
}

function normalizePersonality(input = {}, base = DEFAULT_PERSONALITY) {
  const face = input.face || {};
  const voice = input.voice || {};
  const ears = input.ears || {};
  const eyes = input.eyes || {};
  const model = input.model || {};
  const color = /^#[0-9a-f]{6}$/i.test(face.color || '') ? face.color : base.face.color;
  return {
    id: str(input.id, base.id, 60) || slug(input.name),
    name: str(input.name, base.name, 60).trim() || base.name,
    persona: str(input.persona, base.persona, 2000),
    face: {
      style: FACE_STYLES.includes(face.style) ? face.style : base.face.style,
      color,
    },
    voice: {
      engine: str(voice.engine, base.voice.engine, 30),
      voice: str(voice.voice, base.voice.voice, 80),
      speed: num(voice.speed, base.voice.speed, 0.5, 2),
      outputDeviceId: str(voice.outputDeviceId, 'default', 300) || 'default',
      captions: voice.captions !== undefined ? Boolean(voice.captions) : base.voice.captions,
    },
    ears: {
      deviceId: str(ears.deviceId, 'default', 300) || 'default',
      sensitivity: num(ears.sensitivity, base.ears.sensitivity, 0, 1),
    },
    eyes: {
      cameraId: str(eyes.cameraId, '', 80),
      pip: eyes.pip !== undefined ? Boolean(eyes.pip) : base.eyes.pip,
    },
    model: {
      provider: str(model.provider, '', 40),
      model: str(model.model, '', 120),
      effort: str(model.effort, '', 40),
    },
  };
}

function createStore({ configDir }) {
  const dir = path.join(configDir, 'personality');
  const file = path.join(dir, 'personalities.json');
  const historyDir = path.join(dir, 'history');

  function readJson(p, fallback) {
    try {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch {
      return fallback;
    }
  }

  function writeJson(p, value) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const tmp = `${p}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
    fs.renameSync(tmp, p);
  }

  let data = readJson(file, null);
  if (!data || !Array.isArray(data.personalities) || !data.personalities.length) {
    data = { activeId: DEFAULT_PERSONALITY.id, personalities: [normalizePersonality(DEFAULT_PERSONALITY)] };
  } else {
    data.personalities = data.personalities.map((p) => normalizePersonality(p));
    if (!data.personalities.some((p) => p.id === data.activeId)) data.activeId = data.personalities[0].id;
  }

  function save() {
    writeJson(file, data);
  }

  function historyFile(id) {
    return path.join(historyDir, `${slug(id)}.json`);
  }

  return {
    list: () => data.personalities.map((p) => ({ ...p })),
    active() {
      return { ...(data.personalities.find((p) => p.id === data.activeId) || data.personalities[0]) };
    },
    setActive(id) {
      if (!data.personalities.some((p) => p.id === id)) throw new Error('No such personality');
      data.activeId = id;
      save();
      return this.active();
    },
    /** Merges a patch into the active personality (or the one with patch.id). */
    update(patch = {}) {
      const id = patch.id || data.activeId;
      const idx = data.personalities.findIndex((p) => p.id === id);
      if (idx < 0) throw new Error('No such personality');
      const cur = data.personalities[idx];
      const merged = {
        ...cur,
        ...patch,
        id: cur.id,
        face: { ...cur.face, ...(patch.face || {}) },
        voice: { ...cur.voice, ...(patch.voice || {}) },
        ears: { ...cur.ears, ...(patch.ears || {}) },
        eyes: { ...cur.eyes, ...(patch.eyes || {}) },
        model: { ...cur.model, ...(patch.model || {}) },
      };
      data.personalities[idx] = normalizePersonality(merged, cur);
      save();
      return { ...data.personalities[idx] };
    },
    create(name) {
      const cleanName = String(name || '').trim().slice(0, 60) || 'New personality';
      let id = slug(cleanName);
      for (let n = 2; data.personalities.some((p) => p.id === id); n++) id = `${slug(cleanName)}-${n}`;
      const fresh = normalizePersonality({
        ...DEFAULT_PERSONALITY,
        id,
        name: cleanName,
        persona: `${cleanName} is a friendly companion who talks in short, plain sentences.`,
      });
      data.personalities.push(fresh);
      data.activeId = id;
      save();
      return { ...fresh };
    },
    remove(id) {
      if (data.personalities.length <= 1) throw new Error('Keep at least one personality');
      data.personalities = data.personalities.filter((p) => p.id !== id);
      if (data.activeId === id) data.activeId = data.personalities[0].id;
      try { fs.rmSync(historyFile(id), { force: true }); } catch {}
      save();
      return this.active();
    },
    history(id = data.activeId) {
      const h = readJson(historyFile(id), []);
      return Array.isArray(h) ? h : [];
    },
    appendHistory(id, turn) {
      const h = this.history(id);
      h.push({ ...turn, at: turn.at || new Date().toISOString() });
      writeJson(historyFile(id), h.slice(-HISTORY_LIMIT));
    },
    clearHistory(id = data.activeId) {
      try { fs.rmSync(historyFile(id), { force: true }); } catch {}
    },
  };
}

module.exports = { createStore, normalizePersonality, DEFAULT_PERSONALITY, FACE_STYLES, HISTORY_LIMIT };

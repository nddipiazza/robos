'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME_DIR = process.env.HOME || os.homedir();
const CONFIG_DIR = process.env.ROBOS_CONFIG_DIR || path.join(HOME_DIR, '.config', 'robos');
const PROMPTS_FILE = process.env.ROBOS_VOICE_PROMPTS_FILE || path.join(CONFIG_DIR, 'voice-prompts.json');
const PREFS_FILE = process.env.ROBOS_VOICE_PREFS_FILE || path.join(CONFIG_DIR, 'voice-prompt-prefs.json');
const { DEFAULT_GREETINGS } = require('./greetings');

const DEFAULT_PREFS = {
  configuredDevice: 'default',
  sampleRate: 16000,
  language: 'en-US',
  pushToTalkKey: 'Super+V',
  autoSaveContext: true,
  streamTranscriptions: true,
  hudPosition: 'bottom-right',
  hudAutoCloseMs: 15000,
  wakeGreetings: DEFAULT_GREETINGS,
  showHudOnWake: true,
  activeVoiceAgent: 'robos-desktop-assistant',
};

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadPrompts(customPath) {
  const target = customPath || PROMPTS_FILE;
  try {
    if (fs.existsSync(target)) {
      const data = JSON.parse(fs.readFileSync(target, 'utf8'));
      if (Array.isArray(data)) return data;
    }
  } catch (err) {
    console.warn('[voice-prompt] loadPrompts error:', err.message);
  }
  return [];
}

function savePrompts(prompts, customPath) {
  const target = customPath || PROMPTS_FILE;
  try {
    ensureDir(target);
    const trimmed = (prompts || []).slice(0, 500); // Keep last 500 prompts
    fs.writeFileSync(target, JSON.stringify(trimmed, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('[voice-prompt] savePrompts error:', err.message);
    return false;
  }
}

function savePrompt(entry, customPath) {
  const prompts = loadPrompts(customPath);
  const prompt = {
    id: entry.id || `vp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    text: entry.text || '',
    timestamp: entry.timestamp || new Date().toISOString(),
    status: entry.status || 'recorded',
    durationMs: entry.durationMs || 0,
    device: entry.device || 'default',
    metadata: entry.metadata || {},
  };
  prompts.unshift(prompt);
  savePrompts(prompts, customPath);
  return prompt;
}

function getPrompt(id, customPath) {
  const prompts = loadPrompts(customPath);
  return prompts.find(p => p.id === id) || null;
}

function deletePrompt(id, customPath) {
  const prompts = loadPrompts(customPath);
  const filtered = prompts.filter(p => p.id !== id);
  savePrompts(filtered, customPath);
  return true;
}

function clearPrompts(customPath) {
  savePrompts([], customPath);
  return true;
}

function loadPrefs(customPath) {
  const target = customPath || PREFS_FILE;
  try {
    if (fs.existsSync(target)) {
      return { ...DEFAULT_PREFS, ...JSON.parse(fs.readFileSync(target, 'utf8')) };
    }
  } catch (err) {
    console.warn('[voice-prompt] loadPrefs error:', err.message);
  }
  return { ...DEFAULT_PREFS };
}

function savePrefs(prefs, customPath) {
  const target = customPath || PREFS_FILE;
  try {
    ensureDir(target);
    const merged = { ...loadPrefs(customPath), ...(prefs || {}) };
    fs.writeFileSync(target, JSON.stringify(merged, null, 2), 'utf8');
    return merged;
  } catch (err) {
    console.error('[voice-prompt] savePrefs error:', err.message);
    return null;
  }
}

module.exports = {
  loadPrompts,
  savePrompts,
  savePrompt,
  getPrompt,
  deletePrompt,
  clearPrompts,
  loadPrefs,
  savePrefs,
  PROMPTS_FILE,
  PREFS_FILE,
  DEFAULT_PREFS,
};

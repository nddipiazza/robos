'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME_DIR = process.env.HOME || os.homedir();
const CONFIG_DIR = process.env.ROBOS_CONFIG_DIR || path.join(HOME_DIR, '.config', 'robos');
const PROMPTS_FILE = process.env.ROBOS_VOICE_PROMPTS_FILE || path.join(CONFIG_DIR, 'voice-prompts.json');
const PREFS_FILE = process.env.ROBOS_VOICE_PREFS_FILE || path.join(CONFIG_DIR, 'voice-prompt-prefs.json');
const BUBBLES_FILE = process.env.ROBOS_VOICE_BUBBLES_FILE || path.join(CONFIG_DIR, 'voice-bubbles-live.json');
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

function normalizeBubbleText(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function mergeBubbleWithPrevious(prevText, newText) {
  const normPrev = normalizeBubbleText(prevText);
  const normNew = normalizeBubbleText(newText);
  if (!normNew) return { action: 'ignore' };
  if (!normPrev) return { action: 'append' };
  if (normPrev === normNew || normPrev.includes(normNew)) {
    return { action: 'ignore' };
  }
  if (normNew.startsWith(normPrev)) {
    return { action: 'replace', text: newText };
  }
  const wordsPrev = String(prevText).trim().split(/\s+/);
  const wordsNew = String(newText).trim().split(/\s+/);
  const normWordsPrev = wordsPrev.map((w) => normalizeBubbleText(w));
  const normWordsNew = wordsNew.map((w) => normalizeBubbleText(w));
  const maxCheck = Math.min(normWordsPrev.length, normWordsNew.length, 12);
  for (let k = maxCheck; k >= 2; k--) {
    const prevSuffix = normWordsPrev.slice(-k).join(' ');
    const newPrefix = normWordsNew.slice(0, k).join(' ');
    if (prevSuffix === newPrefix) {
      const remaining = wordsNew.slice(k);
      if (remaining.length === 0) return { action: 'ignore' };
      return { action: 'replace', text: `${wordsPrev.join(' ')} ${remaining.join(' ')}` };
    }
  }
  return { action: 'append' };
}

function formatBubbleClock(isoOrDate = new Date()) {
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate || new Date();
  if (Number.isNaN(d.getTime())) return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function loadLiveBubbles(customPath) {
  const target = customPath || BUBBLES_FILE;
  try {
    if (fs.existsSync(target)) {
      const parsed = JSON.parse(fs.readFileSync(target, 'utf8'));
      if (parsed && typeof parsed === 'object') {
        return {
          active: Boolean(parsed.active),
          backgroundMode: Boolean(parsed.backgroundMode),
          assistantState: parsed.assistantState || 'IDLE',
          pid: parsed.pid || null,
          cleared: Boolean(parsed.cleared),
          interimBubble: parsed.interimBubble || null,
          bubbles: Array.isArray(parsed.bubbles) ? parsed.bubbles : [],
          updatedAt: parsed.updatedAt || new Date().toISOString(),
        };
      }
    }
  } catch {}
  return {
    active: false,
    backgroundMode: false,
    assistantState: 'IDLE',
    pid: null,
    cleared: false,
    interimBubble: null,
    bubbles: [],
    updatedAt: new Date().toISOString(),
  };
}

function saveLiveBubbles(stateUpdate = {}, customPath) {
  const target = customPath || BUBBLES_FILE;
  try {
    ensureDir(target);
    const current = loadLiveBubbles(target);
    const next = {
      ...current,
      ...stateUpdate,
      pid: stateUpdate.pid !== undefined ? stateUpdate.pid : process.pid,
      updatedAt: new Date().toISOString(),
    };
    if (Array.isArray(next.bubbles)) {
      next.bubbles = next.bubbles.slice(-30);
    }
    fs.writeFileSync(target, JSON.stringify(next, null, 2), 'utf8');
    return next;
  } catch (err) {
    console.warn('[voice-prompt] saveLiveBubbles error:', err.message);
    return null;
  }
}

function recordLiveBubble(bubbleInput = {}, customPath) {
  const target = customPath || BUBBLES_FILE;
  const current = loadLiveBubbles(target);
  const cleanText = String(bubbleInput.text || bubbleInput.msg || '').trim();
  if (!cleanText) return current;

  const nowMs = Date.now();
  const isoTime = bubbleInput.isoTime || new Date(nowMs).toISOString();
  const timeStr = bubbleInput.time || bubbleInput.timestamp || formatBubbleClock(isoTime);
  const isFinal = bubbleInput.isFinal !== false;

  if (!isFinal) {
    return saveLiveBubbles(
      {
        active: true,
        cleared: false,
        interimBubble: {
          id: bubbleInput.id || bubbleInput.bubbleId || `interim-${nowMs}`,
          text: cleanText,
          msg: cleanText,
          time: timeStr,
          isoTime,
          ts: nowMs,
          isFinal: false,
          likelySkills: Array.isArray(bubbleInput.likelySkills) ? bubbleInput.likelySkills : [],
          isAmbient: Boolean(bubbleInput.isAmbient),
          ambientReason: bubbleInput.ambientReason || null,
        },
      },
      target
    );
  }

  const bubbles = Array.isArray(current.bubbles) ? [...current.bubbles] : [];
  const last = bubbles[bubbles.length - 1];
  if (last && nowMs - Number(last.ts || 0) < 15000) {
    const merge = mergeBubbleWithPrevious(last.text || last.msg, cleanText);
    if (merge.action === 'ignore') {
      return saveLiveBubbles({ interimBubble: null, cleared: false }, target);
    }
    if (merge.action === 'replace') {
      last.text = merge.text;
      last.msg = merge.text;
      last.ts = nowMs;
      last.isoTime = isoTime;
      if (Array.isArray(bubbleInput.likelySkills) && bubbleInput.likelySkills.length > 0) {
        last.likelySkills = bubbleInput.likelySkills;
      }
      if (bubbleInput.commandCard) {
        last.commandCard = bubbleInput.commandCard;
      }
      return saveLiveBubbles({ bubbles, interimBubble: null, cleared: false }, target);
    }
  }

  const newBubble = {
    id: bubbleInput.id || bubbleInput.bubbleId || `msg-${nowMs}-${Math.random().toString(36).slice(2, 6)}`,
    text: cleanText,
    msg: cleanText,
    time: timeStr,
    isoTime,
    ts: nowMs,
    isFinal: true,
    role: bubbleInput.role || 'user',
    likelySkills: Array.isArray(bubbleInput.likelySkills) ? bubbleInput.likelySkills : [],
    isAmbient: Boolean(bubbleInput.isAmbient),
    ambientReason: bubbleInput.ambientReason || null,
    commandCard: bubbleInput.commandCard || null,
  };
  bubbles.push(newBubble);
  return saveLiveBubbles({ bubbles: bubbles.slice(-30), interimBubble: null, cleared: false }, target);
}

function clearLiveBubbles(customPath) {
  const target = customPath || BUBBLES_FILE;
  return saveLiveBubbles(
    {
      bubbles: [],
      interimBubble: null,
      cleared: true,
    },
    target
  );
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
  loadLiveBubbles,
  saveLiveBubbles,
  recordLiveBubble,
  clearLiveBubbles,
  mergeBubbleWithPrevious,
  PROMPTS_FILE,
  PREFS_FILE,
  BUBBLES_FILE,
  DEFAULT_PREFS,
};

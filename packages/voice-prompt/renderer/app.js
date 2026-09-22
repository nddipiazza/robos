'use strict';

let isRecording = false;
let currentPrompts = [];
let speechRecognizer = null;

// DOM Elements
const statusPill = document.getElementById('status-pill');
const statusText = document.getElementById('status-text');
const btnToggleMic = document.getElementById('btn-toggle-mic');
const btnMicLabel = document.getElementById('btn-mic-label');
const selectDevice = document.getElementById('select-device');
const waveform = document.getElementById('recording-waveform');
const dictationInput = document.getElementById('dictation-input');
const btnSaveDictation = document.getElementById('btn-save-dictation');
const btnClearDictation = document.getElementById('btn-clear-dictation');
const btnRefreshContext = document.getElementById('btn-refresh-context');
const ctxActiveApp = document.getElementById('ctx-active-app');
const ctxWindowTitle = document.getElementById('ctx-window-title');
const ctxRunningApps = document.getElementById('ctx-running-apps');
const ctxWorkspace = document.getElementById('ctx-workspace');
const promptsList = document.getElementById('prompts-list');
const promptsCount = document.getElementById('prompts-count');
const inputSearch = document.getElementById('input-search');
const btnClearAll = document.getElementById('btn-clear-all');
const statDevice = document.getElementById('stat-device');

// Initialize
async function init() {
  await loadDevices();
  await refreshAppContext();
  await loadPrompts();
  setupSpeechRecognition();
  setupEventListeners();

  // Periodic background context refresh
  setInterval(refreshAppContext, 5000);
}

// Load audio devices
async function loadDevices() {
  if (!window.voicePrompt) return;
  try {
    const devices = await window.voicePrompt.listDevices();
    const prefs = await window.voicePrompt.getPrefs();
    selectDevice.innerHTML = '';
    devices.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = d.name;
      if (d.id === prefs.configuredDevice) opt.selected = true;
      selectDevice.appendChild(opt);
    });
    statDevice.textContent = selectDevice.options[selectDevice.selectedIndex]?.text || 'Default';
  } catch (err) {
    console.warn('Failed to load devices:', err);
  }
}

// Setup Speech Recognition (Chromium / WebKit)
function setupSpeechRecognition() {
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRec) {
    try {
      speechRecognizer = new SpeechRec();
      speechRecognizer.continuous = true;
      speechRecognizer.interimResults = true;
      speechRecognizer.lang = 'en-US';

      speechRecognizer.onresult = (event) => {
        let interim = '';
        let final = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            final += event.results[i][0].transcript;
          } else {
            interim += event.results[i][0].transcript;
          }
        }
        dictationInput.value = (final || interim).trim();
      };

      speechRecognizer.onerror = (err) => {
        console.warn('Speech recognition error:', err);
      };
    } catch (e) {
      console.warn('Speech recognition setup notice:', e);
    }
  }
}

// Refresh Active RobOS App Context
async function refreshAppContext() {
  if (!window.voicePrompt) return;
  try {
    const ctx = await window.voicePrompt.getAppContext();
    if (!ctx) return;

    // Active App Badge
    const appId = ctx.activeApp?.appId || 'desktop';
    ctxActiveApp.textContent = appId.toUpperCase();
    ctxActiveApp.title = ctx.activeApp?.wmClass || appId;

    // Window Title
    ctxWindowTitle.textContent = ctx.activeApp?.title || 'Desktop';
    ctxWindowTitle.title = ctx.activeApp?.title || '';

    // Running Apps Chips
    ctxRunningApps.innerHTML = '';
    const apps = ctx.runningApps || [];
    if (apps.length === 0) {
      ctxRunningApps.innerHTML = '<span class="chip">desktop</span>';
    } else {
      apps.slice(0, 8).forEach(a => {
        const chip = document.createElement('span');
        chip.className = 'chip';
        chip.textContent = a.appId;
        ctxRunningApps.appendChild(chip);
      });
    }

    // Workspace
    if (ctx.workspace) {
      ctxWorkspace.textContent = `${ctx.workspace.name} (branch: ${ctx.workspace.branch || 'main'})`;
    }
  } catch (err) {
    console.warn('Context refresh error:', err);
  }
}

// Set UI Recording State
function setRecordingState(active) {
  isRecording = active;
  if (active) {
    statusPill.className = 'status-pill recording';
    statusText.textContent = 'LISTENING ● REC';
    btnToggleMic.className = 'btn-mic-toggle recording';
    btnMicLabel.textContent = 'Stop Listening';
    waveform.classList.remove('hidden');

    if (speechRecognizer) {
      try { speechRecognizer.start(); } catch {}
    }
  } else {
    statusPill.className = 'status-pill idle';
    statusText.textContent = 'STANDBY';
    btnToggleMic.className = 'btn-mic-toggle idle';
    btnMicLabel.textContent = 'Activate Microphone';
    waveform.classList.add('hidden');

    if (speechRecognizer) {
      try { speechRecognizer.stop(); } catch {}
    }
  }
}

// Toggle Mic Activation
async function toggleActivation() {
  if (!window.voicePrompt) return;
  if (isRecording) {
    await window.voicePrompt.deactivate();
    setRecordingState(false);
    // If text was dictated, automatically prompt save
    if (dictationInput.value.trim()) {
      await saveCurrentDictation();
    }
  } else {
    const selectedDeviceId = selectDevice.value;
    await window.voicePrompt.activate({ device: selectedDeviceId });
    setRecordingState(true);
  }
}

// Save Current Dictation
async function saveCurrentDictation() {
  const text = dictationInput.value.trim();
  if (!text || !window.voicePrompt) return;

  const result = await window.voicePrompt.dictate({
    text,
    device: selectDevice.value,
  });

  dictationInput.value = '';
  await loadPrompts();
}

// Load and Render Prompts
async function loadPrompts() {
  if (!window.voicePrompt) return;
  try {
    currentPrompts = await window.voicePrompt.getPrompts();
    renderPrompts();
  } catch (err) {
    console.warn('Failed to load prompts:', err);
  }
}

function renderPrompts() {
  const filter = (inputSearch.value || '').toLowerCase().trim();
  const filtered = currentPrompts.filter(p => {
    if (!filter) return true;
    const textMatch = (p.text || '').toLowerCase().includes(filter);
    const appMatch = (p.metadata?.activeApp?.appId || '').toLowerCase().includes(filter);
    return textMatch || appMatch;
  });

  promptsCount.textContent = filtered.length;

  if (filtered.length === 0) {
    promptsList.innerHTML = `
      <div class="empty-state">
        <p>No voice prompts match your search.</p>
        <p class="empty-sub">Activate microphone or type text to record your first prompt.</p>
      </div>`;
    return;
  }

  promptsList.innerHTML = filtered.map(p => {
    const app = p.metadata?.activeApp?.appId || 'desktop';
    const title = p.metadata?.activeApp?.title || '';
    const dateStr = new Date(p.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const jsonStr = JSON.stringify(p.metadata, null, 2);

    return `
      <div class="prompt-item" id="item-${p.id}">
        <div class="prompt-top">
          <span class="prompt-text">${escapeHtml(p.text)}</span>
          <button class="btn-icon" onclick="deletePromptItem('${p.id}')" title="Delete Prompt">✕</button>
        </div>
        <div class="prompt-meta-row">
          <div class="prompt-context-tag">
            <span>📱 ${escapeHtml(app)}</span>
            ${title ? `<span>&bull; ${escapeHtml(title.slice(0, 30))}</span>` : ''}
          </div>
          <div>
            <span>${dateStr}</span>
            &bull;
            <button class="btn-meta-toggle" onclick="toggleJsonView('${p.id}')">Context Metadata</button>
          </div>
        </div>
        <div id="json-${p.id}" class="prompt-json-view hidden">${escapeHtml(jsonStr)}</div>
      </div>
    `;
  }).join('');
}

window.deletePromptItem = async function(id) {
  if (!window.voicePrompt) return;
  await window.voicePrompt.deletePrompt(id);
  await loadPrompts();
};

window.toggleJsonView = function(id) {
  const el = document.getElementById(`json-${id}`);
  if (el) {
    el.classList.toggle('hidden');
  }
};

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Event Listeners
function setupEventListeners() {
  btnToggleMic.addEventListener('click', toggleActivation);

  selectDevice.addEventListener('change', async () => {
    const deviceId = selectDevice.value;
    statDevice.textContent = selectDevice.options[selectDevice.selectedIndex]?.text || 'Default';
    if (window.voicePrompt) {
      await window.voicePrompt.savePrefs({ configuredDevice: deviceId });
    }
  });

  btnSaveDictation.addEventListener('click', saveCurrentDictation);
  btnClearDictation.addEventListener('click', () => { dictationInput.value = ''; });
  btnRefreshContext.addEventListener('click', refreshAppContext);

  inputSearch.addEventListener('input', renderPrompts);

  btnClearAll.addEventListener('click', async () => {
    if (confirm('Clear all recorded voice prompts?')) {
      if (window.voicePrompt) {
        await window.voicePrompt.clearPrompts();
        await loadPrompts();
      }
    }
  });

  // Hotkey triggers from main process
  if (window.voicePrompt) {
    window.voicePrompt.onActivated(() => setRecordingState(true));
    window.voicePrompt.onDeactivated(() => setRecordingState(false));
    window.voicePrompt.onDictation((prompt) => {
      loadPrompts();
    });
  }
}

// Run on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

'use strict';

let isRecording = false;
let currentPrompts = [];
let audioCtx = null;
let mediaStream = null;
let analyserNode = null;
let animFrameId = null;

// DOM Elements
const statusPill = document.getElementById('status-pill');
const statusText = document.getElementById('status-text');
const btnToggleMic = document.getElementById('btn-toggle-mic');
const btnMicLabel = document.getElementById('btn-mic-label');
const selectDevice = document.getElementById('select-device');
const waveform = document.getElementById('recording-waveform');
const dictationInput = document.getElementById('dictation-input');
const streamingIndicator = document.getElementById('streaming-indicator');
const chkStreamAgent = document.getElementById('chk-stream-agent');
const selectAgentTarget = document.getElementById('select-agent-target');
const btnSendAgent = document.getElementById('btn-send-agent');
const agentStatusBadge = document.getElementById('agent-status-badge');
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
const feedbackBanner = document.getElementById('feedback-banner');

function showFeedback(msg, type = 'success') {
  if (!feedbackBanner) return;
  feedbackBanner.className = `feedback-banner ${type}`;
  feedbackBanner.textContent = msg;
  feedbackBanner.classList.remove('hidden');
  clearTimeout(feedbackBanner._timer);
  feedbackBanner._timer = setTimeout(() => {
    feedbackBanner.classList.add('hidden');
  }, 6000);
}

// Initialize
async function init() {
  await loadDevices();
  await refreshAppContext();
  await loadPrompts();
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
      if (d.id === prefs.configuredDevice || (d.isDefault && prefs.configuredDevice === 'default')) {
        opt.selected = true;
      }
      selectDevice.appendChild(opt);
    });
    statDevice.textContent = selectDevice.options[selectDevice.selectedIndex]?.text || 'Default';
  } catch (err) {
    console.warn('Failed to load devices:', err);
  }
}

// Live audio waveform using Web Audio API
async function startAudioWaveform() {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioCtx.createMediaStreamSource(mediaStream);
    analyserNode = audioCtx.createAnalyser();
    analyserNode.fftSize = 64;
    source.connect(analyserNode);

    const bufferLength = analyserNode.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const bars = waveform.querySelectorAll('.wave-bar');

    function animate() {
      if (!isRecording) return;
      animFrameId = requestAnimationFrame(animate);
      analyserNode.getByteFrequencyData(dataArray);

      bars.forEach((bar, index) => {
        const val = dataArray[index % bufferLength] || 0;
        const height = Math.max(4, (val / 255) * 36);
        bar.style.height = `${height}px`;
      });
    }
    animate();
  } catch (err) {
    console.warn('Microphone audio waveform preview notice:', err.message);
  }
}

function stopAudioWaveform() {
  if (animFrameId) cancelAnimationFrame(animFrameId);
  if (mediaStream) {
    mediaStream.getTracks().forEach(t => t.stop());
    mediaStream = null;
  }
  if (audioCtx) {
    try { audioCtx.close(); } catch {}
    audioCtx = null;
  }
  const bars = waveform.querySelectorAll('.wave-bar');
  bars.forEach(b => { b.style.height = '4px'; });
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
    statusText.textContent = 'LISTENING ● STREAMING LIVE';
    btnToggleMic.className = 'btn-mic-toggle recording';
    btnMicLabel.textContent = 'Stop Listening';
    btnToggleMic.disabled = false;
    waveform.classList.remove('hidden');
    if (streamingIndicator) streamingIndicator.classList.remove('hidden');
    startAudioWaveform();
  } else {
    stopAudioWaveform();
    statusPill.className = 'status-pill idle';
    statusText.textContent = 'STANDBY';
    btnToggleMic.className = 'btn-mic-toggle idle';
    btnMicLabel.textContent = 'Activate Microphone';
    btnToggleMic.disabled = false;
    waveform.classList.add('hidden');
    if (streamingIndicator) streamingIndicator.classList.add('hidden');
  }
}

// Toggle Mic Activation
async function toggleActivation() {
  if (!window.voicePrompt) return;
  if (isRecording) {
    statusPill.className = 'status-pill transcribing';
    statusText.textContent = 'FINALIZING TRANSCRIPTION...';
    btnMicLabel.textContent = 'Finalizing...';
    btnToggleMic.disabled = true;

    try {
      const res = await window.voicePrompt.deactivate();
      setRecordingState(false);
      if (res && res.prompt) {
        dictationInput.value = res.prompt.text;
        await loadPrompts();
        showFeedback(`Captured & Saved: "${res.prompt.text}"`, 'success');
      } else if (res && res.text) {
        dictationInput.value = res.text;
        showFeedback(`Transcribed: "${res.text}"`, 'success');
      } else {
        showFeedback('Listening stopped. No clear speech detected (silence or background noise). Speak clearly into your mic and try again.', 'warning');
      }
    } catch (err) {
      setRecordingState(false);
      showFeedback('Transcription error: ' + err.message, 'error');
    }
  } else {
    const selectedDeviceId = selectDevice.value;
    await window.voicePrompt.activate({ device: selectedDeviceId });
    setRecordingState(true);
    showFeedback('Microphone active! Speak now — text streams live as you speak.', 'success');
  }
}

// Save Current Dictation (manual edit or typing)
async function saveCurrentDictation() {
  const text = dictationInput.value.trim();
  if (!text || !window.voicePrompt) return;

  const result = await window.voicePrompt.dictate({
    text,
    device: selectDevice.value,
  });

  dictationInput.value = '';
  await loadPrompts();
  showFeedback('Voice prompt saved with active app context!', 'success');
}

// Stream Current Dictated Text to RobOS Agent
async function sendCurrentTextToAgent(isAuto = false) {
  const text = dictationInput.value.trim();
  if (!text || !window.voicePrompt) return;

  const targetAgent = selectAgentTarget ? selectAgentTarget.value : 'fast-reactive';
  if (agentStatusBadge) {
    agentStatusBadge.className = 'agent-status-badge streaming';
    agentStatusBadge.textContent = 'Agent: Streaming...';
  }

  try {
    const res = await window.voicePrompt.streamToAgent({
      text,
      agentId: targetAgent,
      isAuto,
    });

    if (agentStatusBadge) {
      agentStatusBadge.className = 'agent-status-badge sent';
      agentStatusBadge.textContent = 'Agent: Dispatched';
      setTimeout(() => {
        if (agentStatusBadge) {
          agentStatusBadge.className = 'agent-status-badge idle';
          agentStatusBadge.textContent = 'Agent: Standby';
        }
      }, 3000);
    }

    if (res && res.response) {
      showFeedback(`Streamed to ${targetAgent}: "${res.response.slice(0, 50)}${res.response.length > 50 ? '...' : ''}"`, 'success');
    } else {
      showFeedback(`Streamed to RobOS agent (${targetAgent})!`, 'success');
    }
  } catch (err) {
    if (agentStatusBadge) {
      agentStatusBadge.className = 'agent-status-badge idle';
      agentStatusBadge.textContent = 'Agent: Error';
    }
    showFeedback(`Agent stream error: ${err.message}`, 'error');
  }
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

  if (btnSendAgent) {
    btnSendAgent.addEventListener('click', () => sendCurrentTextToAgent(false));
  }

  inputSearch.addEventListener('input', renderPrompts);

  btnClearAll.addEventListener('click', async () => {
    if (confirm('Clear all recorded voice prompts?')) {
      if (window.voicePrompt) {
        await window.voicePrompt.clearPrompts();
        await loadPrompts();
      }
    }
  });

  // Hotkey triggers and IPC events from main process
  if (window.voicePrompt) {
    window.voicePrompt.onActivated(() => {
      setRecordingState(true);
      showFeedback('Microphone listening via hotkey Super+V... Speak now!', 'success');
    });
    window.voicePrompt.onDeactivated(async (data) => {
      setRecordingState(false);
      btnToggleMic.disabled = false;
      if (data && data.prompt) {
        dictationInput.value = data.prompt.text;
        await loadPrompts();
        showFeedback(`Captured & Saved: "${data.prompt.text}"`, 'success');
        if (chkStreamAgent && chkStreamAgent.checked) {
          sendCurrentTextToAgent(true);
        }
      } else if (data && data.text) {
        dictationInput.value = data.text;
        showFeedback(`Transcribed: "${data.text}"`, 'success');
        if (chkStreamAgent && chkStreamAgent.checked) {
          sendCurrentTextToAgent(true);
        }
      } else {
        showFeedback('Listening stopped. No clear speech detected.', 'warning');
      }
    });
    window.voicePrompt.onDictation(() => {
      loadPrompts();
    });
    if (typeof window.voicePrompt.onInterimText === 'function') {
      window.voicePrompt.onInterimText((data) => {
        if (data && data.text) {
          dictationInput.value = data.text;
          dictationInput.scrollTop = dictationInput.scrollHeight;
        }
      });
    }
  }
}

// Run on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

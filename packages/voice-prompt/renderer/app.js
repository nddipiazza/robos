'use strict';

let isRecording = false;
let isBackgroundMode = false;
let currentPrompts = [];
let availableVoices = {};
let audioCtx = null;
let mediaStream = null;
let analyserNode = null;
let animFrameId = null;

const api = window.robosVoice || window.voicePrompt;

// ── DOM Elements ─────────────────────────────────────────────────────────────
const statusPill = document.getElementById('status-pill');
const statusText = document.getElementById('status-text');
const btnToggleMic = document.getElementById('btn-toggle-mic');
const btnMicLabel = document.getElementById('btn-mic-label');
const selectDevice = document.getElementById('select-device');
const waveform = document.getElementById('recording-waveform');
const dictationInput = document.getElementById('dictation-input');
const streamingIndicator = document.getElementById('streaming-indicator');
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
const statTtsEngine = document.getElementById('stat-tts-engine');
const statStreamMode = document.getElementById('stat-stream-mode');
const feedbackBanner = document.getElementById('feedback-banner');
const btnToggleBgStream = document.getElementById('btn-toggle-bg-stream');
const bgStreamLabel = document.getElementById('bg-stream-label');

// Outgoing TTS Elements
const selectTtsEngine = document.getElementById('select-tts-engine');
const selectTtsVoice = document.getElementById('select-tts-voice');
const sliderTtsSpeed = document.getElementById('slider-tts-speed');
const valTtsSpeed = document.getElementById('val-tts-speed');
const sliderTtsPitch = document.getElementById('slider-tts-pitch');
const valTtsPitch = document.getElementById('val-tts-pitch');
const sliderTtsVolume = document.getElementById('slider-tts-volume');
const valTtsVolume = document.getElementById('val-tts-volume');
const chkAutoSpeak = document.getElementById('chk-auto-speak');
const btnSaveTtsPrefs = document.getElementById('btn-save-tts-prefs');
const ttsPreviewInput = document.getElementById('tts-preview-input');
const btnTestSpeak = document.getElementById('btn-test-speak');
const btnStopSpeak = document.getElementById('btn-stop-speak');
const ttsPlayingBadge = document.getElementById('tts-playing-badge');

// Desktop Assistant Elements
const chkWakeWord = document.getElementById('chk-wake-word');
const chkBgStreamMode = document.getElementById('chk-bg-stream-mode');
const assistantStateBadge = document.getElementById('assistant-state-badge');
const streamLiveBanner = document.getElementById('stream-live-banner');
const streamLiveText = document.getElementById('stream-live-text');
const assistantChatFeed = document.getElementById('assistant-chat-feed');
const assistantTextInput = document.getElementById('assistant-text-input');
const btnSendAssistant = document.getElementById('btn-send-assistant');
const btnClearChat = document.getElementById('btn-clear-chat');

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

// ── Initialize App ───────────────────────────────────────────────────────────
async function init() {
  setupTabs();
  await loadDevices();
  await refreshAppContext();
  await loadPrompts();
  await loadTTSConfig();
  await loadAssistantHistory();
  setupEventListeners();

  // Periodic background context refresh
  setInterval(refreshAppContext, 6000);
}

// ── Tabs Setup ───────────────────────────────────────────────────────────────
function setupTabs() {
  const tabs = document.querySelectorAll('.nav-tab');
  const panels = document.querySelectorAll('.tab-panel');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetId = tab.getAttribute('data-tab');
      tabs.forEach(t => t.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const panel = document.getElementById(targetId);
      if (panel) panel.classList.add('active');
    });
  });
}

// ── Outgoing TTS Setup ───────────────────────────────────────────────────────
async function loadTTSConfig() {
  if (!api || typeof api.listVoices !== 'function') return;
  try {
    availableVoices = await api.listVoices();
    renderVoiceOptions();

    if (api.getTTSPrefs) {
      const prefs = await api.getTTSPrefs();
      if (prefs) {
        if (prefs.engine && selectTtsEngine) selectTtsEngine.value = prefs.engine;
        renderVoiceOptions();
        if (prefs.voice && selectTtsVoice) selectTtsVoice.value = prefs.voice;
        if (prefs.speed != null && sliderTtsSpeed) {
          sliderTtsSpeed.value = prefs.speed;
          valTtsSpeed.textContent = `${Number(prefs.speed).toFixed(2)}x`;
        }
        if (prefs.pitch != null && sliderTtsPitch) {
          sliderTtsPitch.value = prefs.pitch;
          valTtsPitch.textContent = `${prefs.pitch} Hz`;
        }
        if (prefs.volume != null && sliderTtsVolume) {
          sliderTtsVolume.value = prefs.volume;
          valTtsVolume.textContent = `${prefs.volume}%`;
        }
        if (prefs.autoSpeakResponses != null && chkAutoSpeak) {
          chkAutoSpeak.checked = Boolean(prefs.autoSpeakResponses);
        }
        if (statTtsEngine) {
          statTtsEngine.textContent = `${prefs.engine || 'kokoro'} (${prefs.voice || 'af_heart'})`;
        }
      }
    }
  } catch (err) {
    console.warn('Failed to load TTS config:', err);
  }
}

function renderVoiceOptions() {
  if (!selectTtsVoice) return;
  const currentEngine = selectTtsEngine?.value || 'kokoro';
  const voices = availableVoices[currentEngine] || [];
  selectTtsVoice.innerHTML = '';

  voices.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v.id;
    opt.textContent = `${v.name}${v.recommended ? ' ★' : ''}`;
    selectTtsVoice.appendChild(opt);
  });
}

// ── Audio Device Loading ─────────────────────────────────────────────────────
async function loadDevices() {
  if (!api || !api.listDevices) return;
  try {
    const devices = await api.listDevices();
    const prefs = await api.getPrefs();
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
    if (statDevice) {
      statDevice.textContent = selectDevice.options[selectDevice.selectedIndex]?.text || 'Default';
    }
  } catch (err) {
    console.warn('Failed to load devices:', err);
  }
}

// ── App Context ──────────────────────────────────────────────────────────────
async function refreshAppContext() {
  if (!api || !api.getAppContext) return;
  try {
    const ctx = await api.getAppContext();
    if (!ctx) return;

    if (ctxActiveApp) {
      ctxActiveApp.textContent = ctx.activeApp?.title ? `${ctx.activeApp.appId || 'desktop'}: ${ctx.activeApp.title.slice(0, 26)}` : 'Desktop';
    }
    if (ctxWindowTitle) {
      ctxWindowTitle.textContent = ctx.activeApp?.title || 'None';
    }
    if (ctxWorkspace) {
      const ws = ctx.workspace || {};
      ctxWorkspace.textContent = `${ws.name || 'robos'} (${ws.branch || 'main'})${ws.git?.dirty ? ' *' : ''}`;
    }
    if (ctxRunningApps && ctx.runningApps) {
      ctxRunningApps.innerHTML = '';
      ctx.runningApps.slice(0, 5).forEach(a => {
        const chip = document.createElement('span');
        chip.className = 'chip';
        chip.textContent = a.appId;
        ctxRunningApps.appendChild(chip);
      });
    }
  } catch (err) {
    console.warn('Failed to refresh context:', err);
  }
}

// ── Prompts History ──────────────────────────────────────────────────────────
async function loadPrompts() {
  if (!api || !api.getPrompts) return;
  try {
    currentPrompts = await api.getPrompts();
    renderPromptsList(currentPrompts);
  } catch (err) {
    console.warn('Failed to load prompts:', err);
  }
}

function renderPromptsList(prompts) {
  if (!promptsList) return;
  if (promptsCount) promptsCount.textContent = prompts.length;

  if (prompts.length === 0) {
    promptsList.innerHTML = `
      <div class="empty-state">
        <p>No voice prompts recorded yet.</p>
        <p class="empty-sub">Activate microphone or type text to record your first prompt.</p>
      </div>`;
    return;
  }

  promptsList.innerHTML = '';
  prompts.slice().reverse().forEach(p => {
    const item = document.createElement('div');
    item.className = 'prompt-item';
    item.innerHTML = `
      <div class="prompt-top">
        <span class="prompt-text">${escapeHtml(p.text)}</span>
        <button class="btn-icon btn-delete-prompt" data-id="${p.id}" title="Delete prompt">🗑️</button>
      </div>
      <div class="prompt-meta-row">
        <span class="prompt-context-tag">📱 ${escapeHtml(p.metadata?.activeApp?.appId || 'desktop')}</span>
        <span>${formatTime(p.timestamp)}</span>
        <button class="btn-meta-toggle">Context Metadata</button>
      </div>
      <pre class="prompt-json-view hidden">${escapeHtml(JSON.stringify(p.metadata || {}, null, 2))}</pre>`;

    item.querySelector('.btn-delete-prompt')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      await api.deletePrompt(p.id);
      await loadPrompts();
    });

    item.querySelector('.btn-meta-toggle')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const jsonView = item.querySelector('.prompt-json-view');
      jsonView?.classList.toggle('hidden');
    });

    item.addEventListener('click', () => {
      if (dictationInput) dictationInput.value = p.text;
    });

    promptsList.appendChild(item);
  });
}

// ── Desktop Assistant ────────────────────────────────────────────────────────
async function loadAssistantHistory() {
  if (!api || !api.getAssistantHistory) return;
  try {
    const history = await api.getAssistantHistory();
    if (history && history.length > 0) {
      if (assistantChatFeed) assistantChatFeed.innerHTML = '';
      history.forEach(turn => appendChatTurn(turn));
    }
  } catch (err) {
    console.warn('Failed to load assistant history:', err);
  }
}

function appendChatTurn(turn) {
  if (!assistantChatFeed) return;
  const turnEl = document.createElement('div');
  turnEl.className = 'chat-turn';

  turnEl.innerHTML = `
    <div class="chat-bubble user">
      <div class="bubble-text">${escapeHtml(turn.query)}</div>
      <div class="bubble-meta">
        <span>You</span> • <span>${formatTime(turn.timestamp)}</span>
      </div>
    </div>
    <div class="chat-bubble assistant">
      <div class="bubble-text">${escapeHtml(turn.response)}</div>
      <div class="bubble-meta">
        <span>RobOS Assistant</span>
        ${turn.actionDone ? `• <span class="badge" style="background:#1e293b; color:#38bdf8; font-size:11px; padding:2px 6px; border-radius:4px; border:1px solid #334155;">⚡ ${escapeHtml(turn.actionDone)}</span>` : ''}
        • <button class="btn-icon btn-sm btn-replay-turn" title="Replay spoken audio">🔊 Play</button>
      </div>
    </div>`;

  turnEl.querySelector('.btn-replay-turn')?.addEventListener('click', () => {
    if (api && api.speak) {
      api.speak(turn.response);
    }
  });

  assistantChatFeed.appendChild(turnEl);
  assistantChatFeed.scrollTop = assistantChatFeed.scrollHeight;
}

function updateAssistantState(state) {
  if (!assistantStateBadge) return;
  assistantStateBadge.className = `state-badge ${state.toLowerCase()}`;
  assistantStateBadge.textContent = state;
}

// ── Event Listeners ──────────────────────────────────────────────────────────
function setupEventListeners() {
  // Navigation & sliders
  selectTtsEngine?.addEventListener('change', () => {
    renderVoiceOptions();
  });

  sliderTtsSpeed?.addEventListener('input', () => {
    valTtsSpeed.textContent = `${Number(sliderTtsSpeed.value).toFixed(2)}x`;
  });

  sliderTtsPitch?.addEventListener('input', () => {
    valTtsPitch.textContent = `${sliderTtsPitch.value} Hz`;
  });

  sliderTtsVolume?.addEventListener('input', () => {
    valTtsVolume.textContent = `${sliderTtsVolume.value}%`;
  });

  // Outgoing TTS save preferences
  btnSaveTtsPrefs?.addEventListener('click', async () => {
    const prefs = {
      engine: selectTtsEngine.value,
      voice: selectTtsVoice.value,
      speed: parseFloat(sliderTtsSpeed.value),
      pitch: parseInt(sliderTtsPitch.value, 10),
      volume: parseInt(sliderTtsVolume.value, 10),
      autoSpeakResponses: chkAutoSpeak.checked,
    };
    if (api && api.saveTTSPrefs) {
      await api.saveTTSPrefs(prefs);
      if (statTtsEngine) statTtsEngine.textContent = `${prefs.engine} (${prefs.voice})`;
      showFeedback('Voice preferences saved successfully!');
    }
  });

  // Outgoing TTS Test Speak
  btnTestSpeak?.addEventListener('click', async () => {
    const text = (ttsPreviewInput?.value || '').trim();
    if (!text) return;
    if (ttsPlayingBadge) ttsPlayingBadge.classList.remove('hidden');

    try {
      const opts = {
        engine: selectTtsEngine?.value,
        voice: selectTtsVoice?.value,
        speed: parseFloat(sliderTtsSpeed?.value || 1.0),
        pitch: parseInt(sliderTtsPitch?.value || 0, 10),
        volume: parseInt(sliderTtsVolume?.value || 100, 10),
      };
      await api.speak(text, opts);
    } catch (err) {
      showFeedback(`Speech error: ${err.message}`, 'error');
    } finally {
      if (ttsPlayingBadge) ttsPlayingBadge.classList.add('hidden');
    }
  });

  btnStopSpeak?.addEventListener('click', async () => {
    if (api && api.stopSpeaking) {
      await api.stopSpeaking();
    }
    if (ttsPlayingBadge) ttsPlayingBadge.classList.add('hidden');
  });

  // Background stream mode toggles
  btnToggleBgStream?.addEventListener('click', async () => {
    isBackgroundMode = !isBackgroundMode;
    updateBgStreamUI(isBackgroundMode);
    if (api && api.toggleBackground) {
      await api.toggleBackground(isBackgroundMode);
    }
  });

  chkBgStreamMode?.addEventListener('change', async () => {
    isBackgroundMode = chkBgStreamMode.checked;
    updateBgStreamUI(isBackgroundMode);
    if (api && api.toggleBackground) {
      await api.toggleBackground(isBackgroundMode);
    }
  });

  function updateBgStreamUI(enabled) {
    if (btnToggleBgStream) {
      btnToggleBgStream.className = `btn-badge-toggle ${enabled ? 'active' : ''}`;
    }
    if (bgStreamLabel) {
      bgStreamLabel.textContent = `Background Stream: ${enabled ? 'ON' : 'OFF'}`;
    }
    if (chkBgStreamMode) chkBgStreamMode.checked = enabled;
    if (statStreamMode) statStreamMode.textContent = enabled ? 'Continuous Topic' : 'Standard';
    showFeedback(enabled ? 'Continuous background streaming topic active (ephemeral).' : 'Background streaming stopped.');
  }

  // Wake-word toggle
  chkWakeWord?.addEventListener('change', async () => {
    if (api && api.toggleWakeWord) {
      await api.toggleWakeWord(chkWakeWord.checked);
      showFeedback(chkWakeWord.checked ? 'Wake-word detection enabled ("hello robos" / "row bose").' : 'Wake-word detection disabled.');
    }
  });

  // Microphone toggle button
  btnToggleMic?.addEventListener('click', async () => {
    if (isRecording) {
      await api.deactivate();
    } else {
      await api.activate({ device: selectDevice.value });
    }
  });

  // Send to assistant
  const sendAssistantQuery = async () => {
    const query = (assistantTextInput?.value || '').trim();
    if (!query) return;
    assistantTextInput.value = '';

    appendChatTurn({
      query,
      response: 'Thinking...',
      timestamp: new Date().toISOString(),
    });

    try {
      const res = await api.askAssistant(query, {
        engine: selectTtsEngine?.value,
        voice: selectTtsVoice?.value,
      });
      if (res && res.turn) {
        // Remove temporary turn and add real one
        assistantChatFeed.lastElementChild?.remove();
        appendChatTurn(res.turn);
      }
    } catch (err) {
      showFeedback(`Assistant query failed: ${err.message}`, 'error');
    }
  };

  btnSendAssistant?.addEventListener('click', sendAssistantQuery);
  assistantTextInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendAssistantQuery();
  });

  btnClearChat?.addEventListener('click', async () => {
    if (api && api.clearAssistantHistory) {
      await api.clearAssistantHistory();
      if (assistantChatFeed) {
        assistantChatFeed.innerHTML = `
          <div class="chat-welcome">
            <div class="welcome-icon">🤖</div>
            <h4>RobOS Desktop Assistant Ready</h4>
            <p>Conversation history cleared.</p>
          </div>`;
      }
    }
  });

  // Save manual dictation
  btnSaveDictation?.addEventListener('click', async () => {
    const text = (dictationInput?.value || '').trim();
    if (!text) return;
    await api.dictate({ text });
    dictationInput.value = '';
    await loadPrompts();
    showFeedback('Voice prompt saved!');
  });

  btnClearDictation?.addEventListener('click', () => {
    if (dictationInput) dictationInput.value = '';
  });

  btnClearAll?.addEventListener('click', async () => {
    if (confirm('Clear all recorded voice prompts?')) {
      await api.clearPrompts();
      await loadPrompts();
      showFeedback('All prompts cleared.');
    }
  });

  inputSearch?.addEventListener('input', () => {
    const q = inputSearch.value.toLowerCase();
    const filtered = currentPrompts.filter(p =>
      p.text.toLowerCase().includes(q) || (p.metadata?.activeApp?.appId || '').toLowerCase().includes(q)
    );
    renderPromptsList(filtered);
  });

  // IPC Event Subscriptions
  if (api) {
    if (api.onActivated) {
      api.onActivated(() => {
        isRecording = true;
        updateStatus(true);
      });
    }

    if (api.onDeactivated) {
      api.onDeactivated(async (res) => {
        isRecording = false;
        updateStatus(false);
        if (res.prompt) await loadPrompts();
      });
    }

    if (api.onInterimText) {
      api.onInterimText((data) => {
        if (dictationInput && !data.backgroundMode) {
          dictationInput.value = data.text;
        }
      });
    }

    if (api.onStreamText) {
      api.onStreamText((data) => {
        if (streamLiveBanner && streamLiveText) {
          streamLiveBanner.classList.remove('hidden');
          streamLiveText.textContent = data.text;
          clearTimeout(streamLiveBanner._timer);
          streamLiveBanner._timer = setTimeout(() => {
            streamLiveBanner.classList.add('hidden');
          }, 4000);
        }
      });
    }

    if (api.onWakeWord) {
      api.onWakeWord((data) => {
        showFeedback(`Wake word detected: "${data.trigger}"! Listening...`, 'success');
        if (dictationInput && isBackgroundMode) {
          dictationInput.value = '';
        }
      });
    }

    if (api.onWakeGreeting) {
      api.onWakeGreeting((data) => {
        appendChatTurn({
          query: data.trigger || 'Hello RobOS',
          response: data.greeting || 'Hi!',
          timestamp: new Date().toISOString(),
        });
      });
    }

    if (api.onAssistantState) {
      api.onAssistantState((data) => {
        updateAssistantState(data.state || 'IDLE');
      });
    }

    if (api.onAssistantTurn) {
      api.onAssistantTurn((data) => {
        appendChatTurn(data);
      });
    }
  }
}

function updateStatus(active) {
  if (statusPill && statusText) {
    if (active) {
      statusPill.className = 'status-pill active';
      statusText.textContent = 'LISTENING';
      btnToggleMic.className = 'btn-mic-toggle recording';
      btnMicLabel.textContent = 'Stop Listening';
      if (waveform) waveform.classList.remove('hidden');
      if (streamingIndicator) streamingIndicator.classList.remove('hidden');
    } else {
      statusPill.className = 'status-pill idle';
      statusText.textContent = 'STANDBY';
      btnToggleMic.className = 'btn-mic-toggle idle';
      btnMicLabel.textContent = 'Activate Microphone';
      if (waveform) waveform.classList.add('hidden');
      if (streamingIndicator) streamingIndicator.classList.add('hidden');
    }
  }
}

function formatTime(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

document.addEventListener('DOMContentLoaded', init);

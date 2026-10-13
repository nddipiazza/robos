/**
 * RobOS UI — RobosVoiceButton Web Component (<robos-voice-button>)
 *
 * A reusable voice dictation button for RobOS Electron and web applications.
 * Enables push-to-talk or click-to-dictate with task guidance prompts,
 * real-time interim speech streaming, floating live HUD drawer, and
 * seamless fallbacks (RobOS Voice API daemon, Chromium SpeechRecognition, or simulated injection).
 *
 * Attributes / Properties:
 *   - guidance-prompt: Guidance context / instructions for the listening agent / parser
 *   - label: Button text when idle (default: "Voice Input")
 *   - recording-label: Button text when recording (default: "Stop Recording")
 *   - api-url: RobOS Voice daemon endpoint (default: "http://127.0.0.1:19188")
 *   - show-drawer: Whether to show floating live stream HUD drawer (default: "true")
 *   - agent-id: Optional agent ID (e.g. "fast-reactive") to route streaming tokens to
 *
 * Events:
 *   - robos-voice-start: { guidancePrompt, startTime }
 *   - robos-voice-interim: { text, interimText, elapsedMs }
 *   - robos-voice-stop: { text, durationMs }
 *   - robos-voice-complete: { text, guidancePrompt, fullPrompt, durationMs, timestamp }
 */

(function (global) {
  'use strict';

  const VOICE_STYLES = `
/* RobOS Voice Button & Drawer Styles */
robos-voice-button {
  display: inline-block;
  vertical-align: middle;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  user-select: none;
}

.robos-voice-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  background: #111822;
  color: #e2e8f0;
  border: 1px solid #334155;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.18s ease-in-out;
  outline: none;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

.robos-voice-btn:hover:not(:disabled) {
  background: #1e293b;
  border-color: #00bcd4;
  color: #ffffff;
  box-shadow: 0 0 10px rgba(0, 188, 212, 0.25);
}

.robos-voice-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Icon-Only Mode (all text removed) */
.robos-voice-btn.icon-only {
  padding: 6px 8px;
  min-width: 32px;
  height: 28px;
  justify-content: center;
  gap: 0;
}

.robos-voice-btn.icon-only .robos-voice-label-text,
.robos-voice-btn.icon-only .robos-voice-timer,
.robos-voice-btn.icon-only .robos-voice-rec-dot {
  display: none !important;
}

/* Active Recording State */
.robos-voice-btn.recording {
  background: #2b0b11;
  border-color: #ef4444;
  color: #fecaca;
  box-shadow: 0 0 14px rgba(239, 68, 68, 0.45);
  animation: robos-rec-pulse 1.8s infinite;
}

.robos-voice-btn.recording:hover {
  background: #3b0d17;
  border-color: #f87171;
  color: #ffffff;
}

@keyframes robos-rec-pulse {
  0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.6); }
  70% { box-shadow: 0 0 0 8px rgba(239, 68, 68, 0); }
  100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
}

.robos-voice-icon-wrap {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  position: relative;
}

.robos-voice-icon-mic {
  width: 15px;
  height: 15px;
  stroke: #00bcd4;
  fill: none;
}

.robos-voice-btn.recording .robos-voice-icon-mic {
  display: none;
}

.robos-voice-icon-stop {
  display: none;
  width: 14px;
  height: 14px;
  background: #ef4444;
  border-radius: 2px;
}

.robos-voice-btn.recording .robos-voice-icon-stop {
  display: block;
}

.robos-voice-rec-dot {
  display: none;
  width: 7px;
  height: 7px;
  background: #ef4444;
  border-radius: 50%;
  animation: robos-blink 1s infinite alternate;
}

.robos-voice-btn.recording .robos-voice-rec-dot {
  display: inline-block;
}

@keyframes robos-blink {
  from { opacity: 1; }
  to { opacity: 0.2; }
}

.robos-voice-timer {
  display: none;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
  color: #fca5a5;
  margin-left: 2px;
}

.robos-voice-btn.recording .robos-voice-timer {
  display: inline-block;
}

/* Floating Voice Stream HUD Drawer */
.robos-voice-drawer {
  position: fixed;
  bottom: 24px;
  right: 24px;
  width: 420px;
  max-width: calc(100vw - 48px);
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 10px;
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(0, 188, 212, 0.2);
  color: #f8fafc;
  z-index: 99999;
  overflow: hidden;
  font-size: 13px;
  animation: robos-drawer-slide-up 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes robos-drawer-slide-up {
  from { transform: translateY(20px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

.robos-voice-drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: #1e293b;
  border-bottom: 1px solid #334155;
}

.robos-voice-drawer-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 13px;
  color: #e2e8f0;
}

.robos-voice-badge-rec {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
  border: 1px solid rgba(239, 68, 68, 0.4);
  padding: 2px 7px;
  border-radius: 12px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.5px;
}

.robos-voice-drawer-body {
  padding: 14px;
}

.robos-voice-guidance-card {
  background: rgba(15, 23, 42, 0.85);
  border: 1px dashed #38bdf8;
  border-radius: 6px;
  padding: 8px 10px;
  margin-bottom: 12px;
  font-size: 11px;
  color: #bae6fd;
  line-height: 1.45;
}

.robos-voice-guidance-label {
  font-weight: 700;
  color: #38bdf8;
  text-transform: uppercase;
  font-size: 9px;
  letter-spacing: 0.6px;
  margin-bottom: 3px;
  display: block;
}

.robos-voice-transcript-box {
  min-height: 64px;
  max-height: 140px;
  overflow-y: auto;
  background: #090d16;
  border: 1px solid #1e293b;
  border-radius: 6px;
  padding: 10px 12px;
  font-size: 13px;
  line-height: 1.5;
  color: #e2e8f0;
  position: relative;
  word-break: break-word;
}

.robos-voice-transcript-placeholder {
  color: #64748b;
  font-style: italic;
}

.robos-voice-cursor {
  display: inline-block;
  width: 7px;
  height: 14px;
  background: #00bcd4;
  vertical-align: middle;
  margin-left: 3px;
  animation: robos-cursor-blink 0.8s infinite;
}

@keyframes robos-cursor-blink {
  50% { opacity: 0; }
}

/* Audio Waveform Bars */
.robos-voice-wave {
  display: flex;
  align-items: center;
  gap: 3px;
  height: 18px;
  margin-top: 10px;
  padding: 0 4px;
}

.robos-voice-bar {
  flex: 1;
  background: #00bcd4;
  height: 4px;
  border-radius: 2px;
  transition: height 0.1s ease;
  animation: robos-wave-pulse 1.2s infinite ease-in-out;
}

.robos-voice-bar:nth-child(2) { animation-delay: 0.15s; }
.robos-voice-bar:nth-child(3) { animation-delay: 0.3s; }
.robos-voice-bar:nth-child(4) { animation-delay: 0.45s; }
.robos-voice-bar:nth-child(5) { animation-delay: 0.2s; }
.robos-voice-bar:nth-child(6) { animation-delay: 0.35s; }
.robos-voice-bar:nth-child(7) { animation-delay: 0.5s; }
.robos-voice-bar:nth-child(8) { animation-delay: 0.1s; }

@keyframes robos-wave-pulse {
  0%, 100% { height: 4px; background: #00bcd4; }
  50% { height: 16px; background: #38bdf8; }
}

.robos-voice-drawer-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 10px 14px;
  background: #131d2e;
  border-top: 1px solid #1e293b;
}

.robos-voice-btn-action {
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 500;
  border-radius: 5px;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.15s ease;
}

.robos-voice-btn-cancel {
  background: transparent;
  color: #94a3b8;
  border-color: #334155;
}

.robos-voice-btn-cancel:hover {
  background: #1e293b;
  color: #f1f5f9;
}

.robos-voice-btn-stop-send {
  background: #ef4444;
  color: #ffffff;
  border-color: #dc2626;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
}

.robos-voice-btn-stop-send:hover {
  background: #dc2626;
  box-shadow: 0 0 10px rgba(239, 68, 68, 0.4);
}
`;

  function injectStyles() {
    if (typeof document === 'undefined') return;
    if (document.getElementById('robos-voice-button-styles')) return;
    const styleEl = document.createElement('style');
    styleEl.id = 'robos-voice-button-styles';
    styleEl.textContent = VOICE_STYLES;
    document.head.appendChild(styleEl);
  }

  class RobosVoiceButton extends HTMLElement {
    static get observedAttributes() {
      return ['guidance-prompt', 'label', 'recording-label', 'api-url', 'show-drawer', 'agent-id', 'disabled', 'icon-only'];
    }

    constructor() {
      super();
      this._isRecording = false;
      this._guidancePrompt = '';
      this._apiUrl = 'http://127.0.0.1:19188';
      this._showDrawer = true;
      this._agentId = 'fast-reactive';
      this._capturedText = '';
      this._interimText = '';
      this._startTime = 0;
      this._timerInterval = null;
      this._eventSource = null;
      this._recognition = null;
      this._drawerEl = null;
      this._simulatedMode = false;
      this._usingOverlayApp = false;
    }

    get usingOverlayApp() {
      return this._usingOverlayApp;
    }

    _isIconOnly() {
      if (this.hasAttribute('icon-only')) return true;
      if (this.hasAttribute('label')) {
        const lbl = this.getAttribute('label');
        if (lbl === null || String(lbl).trim() === '') return true;
      }
      return false;
    }

    connectedCallback() {
      injectStyles();
      this._guidancePrompt = this.getAttribute('guidance-prompt') || '';
      this._apiUrl = this.getAttribute('api-url') || 'http://127.0.0.1:19188';
      this._showDrawer = this.getAttribute('show-drawer') !== 'false';
      this._agentId = this.getAttribute('agent-id') || 'fast-reactive';

      this.render();
    }

    disconnectedCallback() {
      this.cancel();
      if (this._drawerEl && this._drawerEl.parentNode) {
        this._drawerEl.parentNode.removeChild(this._drawerEl);
      }
    }

    attributeChangedCallback(name, oldValue, newValue) {
      if (oldValue === newValue) return;
      if (name === 'guidance-prompt') {
        this._guidancePrompt = newValue || '';
        if (this._drawerEl) {
          const gText = this._drawerEl.querySelector('.robos-voice-guidance-text');
          if (gText) gText.textContent = this._guidancePrompt;
        }
      } else if (name === 'api-url') {
        this._apiUrl = newValue || 'http://127.0.0.1:19188';
      } else if (name === 'show-drawer') {
        this._showDrawer = newValue !== 'false';
      } else if (name === 'label' || name === 'recording-label' || name === 'icon-only') {
        this.render();
      } else if (name === 'disabled') {
        const btn = this.querySelector('.robos-voice-btn');
        if (btn) btn.disabled = this.hasAttribute('disabled');
      }
    }

    get guidancePrompt() {
      return this._guidancePrompt;
    }

    set guidancePrompt(val) {
      this._guidancePrompt = val || '';
      this.setAttribute('guidance-prompt', this._guidancePrompt);
    }

    get isRecording() {
      return this._isRecording;
    }

    render() {
      const isIconOnly = this._isIconOnly();
      const rawLabel = this.getAttribute('label');
      const label = isIconOnly ? '' : (rawLabel !== null ? rawLabel : 'Voice Input');
      const buttonTitle = this.getAttribute('title') || (isIconOnly ? 'Dictate voice commands' : (label || 'Dictate voice commands'));
      const ariaLabel = this.getAttribute('aria-label') || this.getAttribute('title') || label || 'Dictate voice commands';

      this.innerHTML = `
        <button type="button" class="robos-voice-btn${isIconOnly ? ' icon-only' : ''}" title="${this._escapeHtml(buttonTitle)}" aria-label="${this._escapeHtml(ariaLabel)}" aria-pressed="false">
          <span class="robos-voice-icon-wrap">
            <svg class="robos-voice-icon-mic" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="22" />
            </svg>
            <span class="robos-voice-icon-stop" aria-hidden="true"></span>
          </span>
          ${isIconOnly ? '' : `
            <span class="robos-voice-rec-dot" aria-hidden="true"></span>
            <span class="robos-voice-label-text">${this._escapeHtml(label)}</span>
            <span class="robos-voice-timer" aria-live="polite">00:00</span>
          `}
        </button>
      `;

      const btn = this.querySelector('.robos-voice-btn');
      if (btn) {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          this.toggle();
        });
      }
    }

    _escapeHtml(str) {
      return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    _updateButtonContent() {
      const btn = this.querySelector('.robos-voice-btn');
      if (!btn) return;
      const isIconOnly = this._isIconOnly();
      const labelText = this.querySelector('.robos-voice-label-text');

      if (this._isRecording) {
        btn.classList.add('recording');
        btn.setAttribute('aria-pressed', 'true');
        if (!isIconOnly && labelText) {
          const recLabel = this.getAttribute('recording-label') || 'Stop Recording';
          labelText.textContent = recLabel;
        }
      } else {
        btn.classList.remove('recording');
        btn.setAttribute('aria-pressed', 'false');
        if (!isIconOnly && labelText) {
          const rawLabel = this.getAttribute('label');
          const normLabel = rawLabel !== null ? rawLabel : 'Voice Input';
          labelText.textContent = normLabel;
        }
      }
    }

    toggle() {
      if (this._isRecording) {
        return this.stop();
      } else {
        return this.start();
      }
    }

    /**
     * Start listening / dictating
     */
    async start() {
      if (this._isRecording) return;
      this._isRecording = true;
      this._capturedText = '';
      this._interimText = '';
      this._usingOverlayApp = false;
      this._startTime = Date.now();

      this._updateButtonContent();
      this._startTimer();

      this.dispatchEvent(new CustomEvent('robos-voice-start', {
        detail: {
          guidancePrompt: this._guidancePrompt,
          startTime: this._startTime,
        },
        bubbles: true,
      }));

      // Start underlying speech capture mechanism
      await this._connectAudioStream();

      // Only show internal drawer if overlay app is not handling the visual HUD bubbles
      if (this._showDrawer && !this._usingOverlayApp) {
        this._renderDrawer();
      }

      return true;
    }

    /**
     * Ensure RobOS Voice overlay daemon is running; invoke host app IPC if offline
     */
    async _ensureVoiceAppRunning(maxWaitMs = 5000) {
      // 1. Probe if daemon is already alive
      try {
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), 600) : null;
        const res = await fetch(`${this._apiUrl}/api/status`, {
          signal: controller ? controller.signal : undefined,
        });
        if (timer) clearTimeout(timer);
        if (res.ok) return true;
      } catch {}

      // 2. Request host Electron application to start the overlay app
      let launchTriggered = false;
      try {
        if (typeof window !== 'undefined') {
          if (window.robosQuestEditor && typeof window.robosQuestEditor.ensureVoiceApp === 'function') {
            await window.robosQuestEditor.ensureVoiceApp();
            launchTriggered = true;
          } else if (window.robosVoiceHud && typeof window.robosVoiceHud.ensureRunning === 'function') {
            await window.robosVoiceHud.ensureRunning();
            launchTriggered = true;
          } else if (window.robosDesktop && typeof window.robosDesktop.launchApp === 'function') {
            window.robosDesktop.launchApp('voice-prompt');
            launchTriggered = true;
          }
        }
      } catch (err) {
        console.warn('[RobosVoiceButton] Unable to trigger host voice app launch:', err);
      }

      // If initial probe was offline and no launcher could be triggered, return immediately
      if (!launchTriggered) {
        return false;
      }

      // 3. Poll /api/status until daemon responds or maxWaitMs expires
      const start = Date.now();
      while (Date.now() - start < maxWaitMs) {
        try {
          const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
          const timer = controller ? setTimeout(() => controller.abort(), 500) : null;
          const res = await fetch(`${this._apiUrl}/api/status`, {
            signal: controller ? controller.signal : undefined,
          });
          if (timer) clearTimeout(timer);
          if (res.ok) return true;
        } catch {}
        await new Promise(r => setTimeout(r, 250));
      }
      return false;
    }

    /**
     * Connect to voice streaming: local Voice Daemon -> Web Speech API -> Simulation
     */
    async _connectAudioStream() {
      // 1. Try local RobOS Voice API daemon (start overlay app if offline)
      let connectedToDaemon = false;
      try {
        const isRunning = await this._ensureVoiceAppRunning(5000);
        if (isRunning) {
          const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
          const timer = controller ? setTimeout(() => controller.abort(), 3000) : null;
          const res = await fetch(`${this._apiUrl}/api/activate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              backgroundMode: false,
              guidancePrompt: this._guidancePrompt,
              agentId: this._agentId,
            }),
            signal: controller ? controller.signal : undefined,
          });
          if (timer) clearTimeout(timer);
          if (res.ok) {
            connectedToDaemon = true;
            this._usingOverlayApp = true;
            this._initDaemonSseStream();
          }
        }
      } catch {
        connectedToDaemon = false;
      }

      if (connectedToDaemon) return;

      // 2. Fallback: Browser native SpeechRecognition (available in Electron/Chromium offline)
      const SpeechRecognition = global.SpeechRecognition || global.webkitSpeechRecognition;
      if (typeof SpeechRecognition === 'function') {
        try {
          this._recognition = new SpeechRecognition();
          this._recognition.continuous = true;
          this._recognition.interimResults = true;
          this._recognition.lang = 'en-US';

          this._recognition.onresult = (event) => {
            let interim = '';
            let finalStr = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
              const transcript = event.results[i][0].transcript;
              if (event.results[i].isFinal) {
                finalStr += transcript + ' ';
              } else {
                interim += transcript;
              }
            }
            if (finalStr) {
              this._capturedText = (this._capturedText + ' ' + finalStr).trim();
            }
            this._interimText = interim.trim();
            this._onSpeechToken(this._capturedText + (this._interimText ? ' ' + this._interimText : ''));
          };

          this._recognition.onerror = () => {
            // Ignore benign speech network / abort errors
          };

          this._recognition.onend = () => {
            if (this._isRecording && this._recognition) {
              try { this._recognition.start(); } catch {}
            }
          };

          this._recognition.start();
          return;
        } catch {}
      }

      // 3. Fallback: Ready for simulatedInput() calls
      this._simulatedMode = true;
    }

    _initDaemonSseStream() {
      if (typeof EventSource === 'undefined') return;
      try {
        this._eventSource = new EventSource(`${this._apiUrl}/api/stream`);
        this._eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.text) {
              if (data.isFinal) {
                this._capturedText = (this._capturedText + ' ' + data.text).trim();
                this._interimText = '';
              } else {
                this._interimText = data.text;
              }
              const currentTotal = (this._capturedText + ' ' + this._interimText).trim();
              this._onSpeechToken(currentTotal);
            }
          } catch {}
        };
      } catch {}
    }

    _onSpeechToken(fullText) {
      if (this._drawerEl) {
        const textContainer = this._drawerEl.querySelector('.robos-voice-transcript-text');
        const placeholder = this._drawerEl.querySelector('.robos-voice-transcript-placeholder');
        if (textContainer && fullText) {
          textContainer.textContent = fullText;
          if (placeholder && placeholder.style) placeholder.style.display = 'none';
        }
      }

      this.dispatchEvent(new CustomEvent('robos-voice-interim', {
        detail: {
          text: fullText,
          interimText: this._interimText,
          elapsedMs: Date.now() - this._startTime,
        },
        bubbles: true,
      }));
    }

    /**
     * Programmatic simulation for tests & accessibility
     */
    simulateInput(text, isFinal = true) {
      const clean = (text || '').trim();
      if (isFinal) {
        this._capturedText = (this._capturedText + ' ' + clean).trim();
        this._interimText = '';
      } else {
        this._interimText = clean;
      }
      this._onSpeechToken(this._capturedText + (this._interimText ? ' ' + this._interimText : ''));
    }

    _startTimer() {
      if (this._timerInterval) clearInterval(this._timerInterval);
      const timerEls = [
        this.querySelector('.robos-voice-timer'),
        this._drawerEl ? this._drawerEl.querySelector('.robos-voice-drawer-timer') : null,
      ].filter(Boolean);

      this._timerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - this._startTime) / 1000);
        const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
        const secs = String(elapsed % 60).padStart(2, '0');
        const timeStr = `${mins}:${secs}`;

        const currentTimerEls = [
          this.querySelector('.robos-voice-timer'),
          this._drawerEl ? this._drawerEl.querySelector('.robos-voice-drawer-timer') : null,
        ].filter(Boolean);

        for (const el of currentTimerEls) {
          el.textContent = timeStr;
        }
      }, 500);

      if (this._timerInterval && typeof this._timerInterval.unref === 'function') {
        this._timerInterval.unref();
      }
    }

    _stopTimer() {
      if (this._timerInterval) {
        clearInterval(this._timerInterval);
        this._timerInterval = null;
      }
    }

    _renderDrawer() {
      if (this._drawerEl) {
        this._closeDrawer();
      }

      this._drawerEl = document.createElement('div');
      this._drawerEl.className = 'robos-voice-drawer';
      this._drawerEl.setAttribute('role', 'dialog');
      this._drawerEl.setAttribute('aria-label', 'RobOS Voice Dictation Stream');

      const label = this.getAttribute('label') || 'Voice Stream';

      this._drawerEl.innerHTML = `
        <div class="robos-voice-drawer-header">
          <div class="robos-voice-drawer-title">
            <span>🎙️ ${this._escapeHtml(label)}</span>
            <span class="robos-voice-badge-rec">
              <span class="robos-voice-rec-dot" style="display:inline-block;" aria-hidden="true"></span>
              REC <span class="robos-voice-drawer-timer">00:00</span>
            </span>
          </div>
          <button type="button" class="robos-voice-btn-action robos-voice-btn-cancel" style="padding:2px 8px; font-size:11px;" title="Cancel recording (Esc)">✕</button>
        </div>

        <div class="robos-voice-drawer-body">
          ${this._guidancePrompt ? `
            <div class="robos-voice-guidance-card">
              <span class="robos-voice-guidance-label">🎯 Active Guidance Prompt</span>
              <span class="robos-voice-guidance-text">${this._escapeHtml(this._guidancePrompt)}</span>
            </div>
          ` : ''}

          <div class="robos-voice-transcript-box">
            <span class="robos-voice-transcript-placeholder">Listening... Speak your instructions now.</span>
            <span class="robos-voice-transcript-text"></span>
            <span class="robos-voice-cursor"></span>
          </div>

          <div class="robos-voice-wave" aria-hidden="true">
            <span class="robos-voice-bar"></span>
            <span class="robos-voice-bar"></span>
            <span class="robos-voice-bar"></span>
            <span class="robos-voice-bar"></span>
            <span class="robos-voice-bar"></span>
            <span class="robos-voice-bar"></span>
            <span class="robos-voice-bar"></span>
            <span class="robos-voice-bar"></span>
          </div>
        </div>

        <div class="robos-voice-drawer-footer">
          <button type="button" class="robos-voice-btn-action robos-voice-btn-cancel btn-drawer-cancel">Cancel</button>
          <button type="button" class="robos-voice-btn-action robos-voice-btn-stop-send btn-drawer-stop">
            <span>⏹️</span>
            <span>Stop &amp; Send</span>
          </button>
        </div>
      `;

      if (typeof document !== 'undefined' && document.body && typeof document.body.appendChild === 'function') {
        document.body.appendChild(this._drawerEl);
      }

      if (this._drawerEl.querySelectorAll) {
        const cancelBtns = this._drawerEl.querySelectorAll('.robos-voice-btn-cancel');
        if (cancelBtns && cancelBtns.forEach) {
          cancelBtns.forEach(b => b.addEventListener('click', () => this.cancel()));
        }
      }

      if (this._drawerEl.querySelector) {
        const stopBtn = this._drawerEl.querySelector('.btn-drawer-stop');
        if (stopBtn && stopBtn.addEventListener) {
          stopBtn.addEventListener('click', () => this.stop());
        }
      }
    }

    _closeDrawer() {
      if (this._drawerEl) {
        if (this._drawerEl.parentNode && typeof this._drawerEl.parentNode.removeChild === 'function') {
          try { this._drawerEl.parentNode.removeChild(this._drawerEl); } catch {}
        } else if (typeof this._drawerEl.remove === 'function') {
          try { this._drawerEl.remove(); } catch {}
        }
        this._drawerEl = null;
      }
    }

    /**
     * Stop dictating and emit complete event with captured text + guidance prompt
     */
    async stop() {
      if (!this._isRecording) return null;
      this._isRecording = false;
      this._stopTimer();

      // Clean up audio inputs
      if (this._eventSource) {
        try { this._eventSource.close(); } catch {}
        this._eventSource = null;
      }

      if (this._recognition) {
        try {
          this._recognition.onend = null;
          this._recognition.stop();
        } catch {}
        this._recognition = null;
      }

      // Try deactivating on daemon if connected
      try {
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        // Whisper speech transcription finalization may take a couple seconds
        const timer = controller ? setTimeout(() => controller.abort(), 6000) : null;
        const res = await fetch(`${this._apiUrl}/api/deactivate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller ? controller.signal : undefined,
        });
        if (timer) clearTimeout(timer);
        if (res.ok) {
          const data = await res.json();
          if (data && data.text && data.text.trim()) {
            this._capturedText = data.text.trim();
          }
        }
      } catch {}

      const durationMs = Math.max(0, Date.now() - this._startTime);
      const finalText = (this._capturedText || this._interimText || '').trim();

      const detail = {
        text: finalText,
        guidancePrompt: this._guidancePrompt,
        fullPrompt: `[Guidance Context]\n${this._guidancePrompt}\n\n[Captured Voice Audio Transcript]\n"${finalText}"`,
        durationMs,
        timestamp: new Date().toISOString(),
      };

      this._usingOverlayApp = false;
      this._updateButtonContent();
      this._closeDrawer();

      this.dispatchEvent(new CustomEvent('robos-voice-stop', {
        detail: { text: finalText, durationMs },
        bubbles: true,
      }));

      this.dispatchEvent(new CustomEvent('robos-voice-complete', {
        detail,
        bubbles: true,
      }));

      return detail;
    }

    /**
     * Cancel recording without emitting completion payload
     */
    cancel() {
      if (!this._isRecording) return;
      this._isRecording = false;
      this._stopTimer();

      if (this._eventSource) {
        try { this._eventSource.close(); } catch {}
        this._eventSource = null;
      }

      if (this._recognition) {
        try {
          this._recognition.onend = null;
          this._recognition.stop();
        } catch {}
        this._recognition = null;
      }

      try {
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), 2000) : null;
        fetch(`${this._apiUrl}/api/deactivate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller ? controller.signal : undefined,
        }).then(() => { if (timer) clearTimeout(timer); }).catch(() => {});
      } catch {}

      this._usingOverlayApp = false;
      this._updateButtonContent();
      this._closeDrawer();

      this.dispatchEvent(new CustomEvent('robos-voice-cancel', {
        bubbles: true,
      }));
    }
  }

  // Register Custom Element
  if (typeof customElements !== 'undefined' && !customElements.get('robos-voice-button')) {
    customElements.define('robos-voice-button', RobosVoiceButton);
  }

  // Export
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { RobosVoiceButton };
  } else {
    global.RobosVoiceButton = RobosVoiceButton;
  }

})(typeof window !== 'undefined' ? window : globalThis);

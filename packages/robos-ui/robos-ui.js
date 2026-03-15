/**
 * RobOS UI Component Library
 * A self-contained component library for RobOS Electron apps.
 * No build step required — include as a plain <script> tag.
 *
 * Components:
 *   - <robos-ai-textarea> — AI-powered textarea with slash commands,
 *     @mentions, streaming, Ctrl+Enter submit, auto-resize
 *   - <robos-person-selector-textbox> — people directory search input;
 *     auto-loads via window.api.listPeople() or 'robos-people-load' event
 *
 * Usage:
 *   <script src="/path/to/robos-ui.js"></script>
 *   <robos-ai-textarea id="my-input" placeholder="Describe your task…"></robos-ai-textarea>
 *   <robos-person-selector-textbox id="owner" placeholder="Search people…"></robos-person-selector-textbox>
 *
 *   const el = document.getElementById('my-input');
 *   el.addEventListener('robos-submit', e => console.log(e.detail.value));
 *   el.addEventListener('robos-command', e => console.log(e.detail.command, e.detail.args));
 *   el.streamChunk('partial response text…');
 *   el.streamDone();
 *
 *   const ps = document.getElementById('owner');
 *   ps.value          // → selected person uid
 *   ps.selectedPerson // → full person object or null
 *   ps.addEventListener('change', e => console.log(e.detail.uid, e.detail.person));
 */

(function (global) {
  'use strict';

  // ── Slash commands registry ──────────────────────────────────────────────────
  const DEFAULT_COMMANDS = [
    { name: 'generate',  icon: '✦', desc: 'Generate code or content from description' },
    { name: 'refine',    icon: '🔄', desc: 'Refine or improve existing content' },
    { name: 'fix',       icon: '🔧', desc: 'Fix a bug or problem' },
    { name: 'explain',   icon: '💡', desc: 'Explain code or a concept' },
    { name: 'summarize', icon: '📋', desc: 'Summarize long content' },
    { name: 'test',      icon: '🧪', desc: 'Generate tests for code' },
    { name: 'review',    icon: '👁',  desc: 'Review code for issues' },
    { name: 'document',  icon: '📝', desc: 'Add documentation or comments' },
    { name: 'optimize',  icon: '⚡', desc: 'Optimize performance' },
    { name: 'translate', icon: '🌐', desc: 'Translate between languages or formats' },
  ];

  // ── Styles (injected once) ────────────────────────────────────────────────────
  const STYLES = `
robos-ai-textarea {
  display: block;
  position: relative;
  width: 100%;
  min-width: 0;
  font-family: -apple-system, 'Segoe UI', system-ui, sans-serif;
}

.robos-ai-textarea-wrap {
  position: relative;
  background: #0d1117;
  border: 1px solid #30363d;
  border-radius: 8px;
  transition: border-color .15s, box-shadow .15s;
  resize: vertical;
  overflow: hidden;
  min-height: 80px;
  width: 100%;
  box-sizing: border-box;
}
.robos-ai-textarea-wrap:focus-within {
  border-color: #1f6feb;
  box-shadow: 0 0 0 2px #1f6feb22;
}
.robos-ai-textarea-wrap.streaming {
  border-color: #3fb950;
  box-shadow: 0 0 0 2px #3fb95022;
}
/* Top-right waiting indicator */
.robos-wait-badge {
  display: none;
  position: absolute;
  top: 6px; right: 8px;
  align-items: center; gap: 5px;
  background: #010d1a;
  border: 1px solid #3fb95055;
  border-radius: 10px;
  padding: 2px 8px 2px 5px;
  font-size: 10px; color: #3fb950;
  font-weight: 600; letter-spacing: .04em;
  z-index: 10; pointer-events: none;
}
.robos-wait-badge.active { display: flex; }
.robos-wait-spin {
  width: 8px; height: 8px;
  border: 1.5px solid #3fb95033;
  border-top-color: #3fb950;
  border-radius: 50%;
  animation: robos-spin .6s linear infinite;
}

.robos-ai-inner {
  width: 100%;
  box-sizing: border-box;
  min-height: 80px;
  max-height: none;
  overflow-y: auto;
  padding: 12px 40px 36px 12px;
  font-size: 13px;
  line-height: 1.6;
  color: #c9d1d9;
  outline: none;
  white-space: pre-wrap;
  word-break: break-word;
  cursor: text;
}
.robos-ai-inner:empty::before {
  content: attr(data-placeholder);
  color: #484f58;
  pointer-events: none;
}

/* Inline highlights */
.robos-cmd-token {
  color: #d2a8ff;
  font-weight: 600;
  background: #6e40c922;
  border-radius: 3px;
  padding: 0 2px;
}
.robos-mention-token {
  color: #79c0ff;
  background: #1f3a5f44;
  border-radius: 3px;
  padding: 0 2px;
}

/* Streaming response overlay */
.robos-stream-overlay {
  display: none;
  background: #010d1a;
  border-top: 1px solid #1f6feb44;
  border-radius: 0 0 7px 7px;
  font-size: 12px;
  color: #3fb950;
  font-family: 'Courier New', monospace;
  max-height: 220px;
  overflow: hidden;
  white-space: pre-wrap;
  word-break: break-word;
  flex-direction: column;
}
.robos-stream-overlay.active { display: flex; }
.robos-stream-header {
  display: flex; align-items: center; gap: 6px;
  padding: 4px 10px; border-bottom: 1px solid #1f6feb22;
  background: #010d1a; flex-shrink: 0;
}
.robos-stream-spinner {
  width: 12px; height: 12px;
  border: 2px solid #3fb95033;
  border-top-color: #3fb950;
  border-radius: 50%;
  animation: robos-spin .6s linear infinite;
  flex-shrink: 0;
}
@keyframes robos-spin { to { transform: rotate(360deg); } }
.robos-stream-label { font-size: 10px; color: #3fb950; flex: 1; font-weight: 600; letter-spacing: .04em; }
.robos-tail-label { display: flex; align-items: center; gap: 4px; font-size: 10px; color: #8b949e; cursor: pointer; user-select: none; }
.robos-tail-label input { accent-color: #3fb950; cursor: pointer; margin: 0; }
.robos-stream-body {
  padding: 8px 12px; overflow-y: auto; flex: 1;
}
.robos-stream-overlay.active { display: flex; }
.robos-stream-cursor {
  display: inline-block;
  width: 7px;
  height: 13px;
  background: #3fb950;
  border-radius: 1px;
  animation: robos-blink .8s step-end infinite;
  vertical-align: text-bottom;
  margin-left: 1px;
}
@keyframes robos-blink { 0%,100%{opacity:1} 50%{opacity:0} }

/* Toolbar */
.robos-ai-toolbar {
  position: absolute;
  bottom: 8px;
  left: 10px;
  right: 10px;
  display: flex;
  align-items: center;
  gap: 6px;
  pointer-events: none;
}
.robos-ai-toolbar-left { flex: 1; display: flex; gap: 4px; pointer-events: all; }
.robos-ai-toolbar-right { display: flex; align-items: center; gap: 6px; pointer-events: all; }

.robos-cmd-pill {
  display: flex; align-items: center; gap: 3px;
  background: #6e40c922; border: 1px solid #6e40c944;
  border-radius: 12px; padding: 2px 8px;
  font-size: 10px; color: #d2a8ff; cursor: pointer;
  transition: background .12s;
}
.robos-cmd-pill:hover { background: #6e40c944; }
.robos-cmd-pill.active { background: #6e40c966; border-color: #d2a8ff; }

.robos-hint {
  font-size: 10px; color: #484f58; flex: 1; text-align: right;
}
.robos-submit-btn {
  display: flex; align-items: center; gap: 4px;
  padding: 4px 12px;
  background: #1f6feb;
  color: #fff;
  border: none;
  border-radius: 5px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: background .12s;
}
.robos-submit-btn:hover { background: #388bfd; }
.robos-submit-btn:disabled { background: #1f6feb44; cursor: not-allowed; }

/* Quick-ask "?" button */
.robos-ask-btn {
  display: flex; align-items: center; justify-content: center;
  width: 22px; height: 22px;
  background: #21262d;
  color: #8b949e;
  border: 1px solid #30363d;
  border-radius: 50%;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  transition: background .12s, color .12s, border-color .12s;
  flex-shrink: 0;
  line-height: 1;
  padding: 0;
}
.robos-ask-btn:hover { background: #1c2a3a; color: #58a6ff; border-color: #388bfd; }

/* Quick-ask floating dialog */
.robos-ask-dialog {
  position: fixed;
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 10px;
  box-shadow: 0 12px 40px rgba(0,0,0,.9);
  z-index: 2147483647;
  width: 420px;
  max-width: 96vw;
  display: none;
  flex-direction: column;
  overflow: hidden;
}
.robos-ask-dialog.open { display: flex; }
.robos-ask-dialog-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 14px 8px;
  border-bottom: 1px solid #21262d;
  font-size: 12px; font-weight: 700; color: #e6edf3;
  gap: 8px;
}
.robos-ask-dialog-title { display: flex; align-items: center; gap: 6px; }
.robos-ask-dialog-close {
  background: none; border: none; color: #6e7681; cursor: pointer;
  font-size: 16px; line-height: 1; padding: 0 2px;
  transition: color .12s;
}
.robos-ask-dialog-close:hover { color: #f85149; }
.robos-ask-ctx {
  padding: 6px 14px;
  font-size: 10px; color: #6e7681;
  border-bottom: 1px solid #21262d;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  cursor: pointer;
  user-select: none;
}
.robos-ask-ctx:hover { color: #8b949e; }
.robos-ask-ctx-expand {
  max-height: 80px; overflow-y: auto;
  padding: 6px 14px; background: #0d1117;
  font-size: 11px; font-family: monospace; color: #8b949e;
  border-bottom: 1px solid #21262d;
  white-space: pre-wrap; word-break: break-all;
  display: none;
}
.robos-ask-ctx-expand.open { display: block; }
.robos-ask-input-row {
  display: flex; gap: 8px; padding: 10px 14px;
  border-bottom: 1px solid #21262d;
}
.robos-ask-input {
  flex: 1;
  background: #0d1117; border: 1px solid #30363d; border-radius: 6px;
  color: #c9d1d9; padding: 7px 10px; font-size: 12px;
  font-family: inherit; resize: none; outline: none;
  min-height: 36px; max-height: 120px; line-height: 1.5;
  transition: border-color .12s;
}
.robos-ask-input:focus { border-color: #388bfd; }
.robos-ask-send {
  padding: 0 14px; background: #1f6feb; color: #fff; border: none;
  border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer;
  transition: background .12s; align-self: flex-end; height: 36px;
  white-space: nowrap;
}
.robos-ask-send:hover { background: #388bfd; }
.robos-ask-send:disabled { background: #1f6feb44; cursor: not-allowed; }
.robos-ask-response {
  flex: 1; overflow-y: auto; min-height: 60px; max-height: 260px;
  padding: 10px 14px;
  font-size: 12px; font-family: 'Ubuntu Mono', monospace; color: #c9d1d9;
  white-space: pre-wrap; word-break: break-word; line-height: 1.6;
  background: #0d1117;
}
.robos-ask-response-placeholder { color: #484f58; font-style: italic; font-family: inherit; font-size: 12px; }

.robos-char-count {
  font-size: 10px;
  color: #484f58;
  min-width: 40px;
  text-align: right;
}
.robos-char-count.warn { color: #d29922; }
.robos-char-count.over { color: #f85149; }

/* Command palette dropdown — fixed to viewport, never clipped by parent */
.robos-palette {
  position: fixed;
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0,0,0,.85);
  z-index: 2147483647;
  overflow: hidden;
  display: none;
  min-width: 320px;
}
.robos-palette.open { display: block; }
.robos-palette-hdr {
  padding: 8px 12px 4px;
  font-size: 10px;
  color: #6e7681;
  text-transform: uppercase;
  letter-spacing: .5px;
  font-weight: 600;
}
.robos-palette-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  cursor: pointer;
  transition: background .1s;
}
.robos-palette-item:hover,
.robos-palette-item.highlighted {
  background: #0d2137;
}
.robos-palette-icon { font-size: 15px; width: 20px; text-align: center; }
.robos-palette-name {
  font-size: 12px; font-weight: 600; color: #d2a8ff;
  min-width: 80px;
}
.robos-palette-sep { width: 1px; height: 14px; background: #30363d; }
.robos-palette-desc { font-size: 11px; color: #8b949e; flex: 1; }
.robos-palette-kbd { font-size: 10px; color: #484f58; font-family: monospace; }

/* Mention autocomplete — fixed to viewport, never clipped */
.robos-mention-list {
  position: fixed;
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0,0,0,.9);
  z-index: 2147483647;
  max-height: 320px;
  overflow-y: auto;
  min-width: 380px;
  display: none;
}
.robos-mention-list.open { display: block; }
.robos-mention-list-hdr {
  padding: 6px 12px 4px;
  font-size: 10px; font-weight: 600; letter-spacing:.06em; text-transform: uppercase;
  color: #484f58; border-bottom: 1px solid #21262d;
  display: flex; align-items: center; gap: 6px;
}
.robos-mention-spinner {
  display: inline-block; width: 8px; height: 8px;
  border: 1.5px solid #484f58; border-top-color: #58a6ff;
  border-radius: 50%; animation: robos-spin .6s linear infinite;
}
@keyframes robos-spin { to { transform: rotate(360deg); } }
.robos-mention-item {
  display: flex; align-items: center; gap: 8px;
  padding: 7px 12px;
  cursor: pointer; font-size: 12px;
  transition: background .1s;
}
.robos-mention-item:hover,
.robos-mention-item.highlighted { background: #0d2137; }
.robos-mention-item-icon { color: #8b949e; flex-shrink: 0; font-size: 13px; }
.robos-mention-item-body { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1; }
.robos-mention-item-name { color: #c9d1d9; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.robos-mention-item-name mark.fz-m { background: none; color: #79c0ff; font-weight: 700; }
.robos-mention-item-dir { color: #484f58; font-size: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.robos-mention-empty { padding: 12px; text-align: center; color: #484f58; font-size: 11px; }

/* Context chips (files/docs attached) */
.robos-context-chips {
  display: flex; flex-wrap: wrap; gap: 4px;
  padding: 6px 10px 0;
}
.robos-context-chip {
  display: flex; align-items: center; gap: 4px;
  background: #1f3a5f; border: 1px solid #1f6feb44;
  border-radius: 12px; padding: 2px 8px;
  font-size: 10px; color: #79c0ff;
}
.robos-context-chip-remove {
  cursor: pointer; color: #484f58; font-size: 11px; margin-left: 2px;
}
.robos-context-chip-remove:hover { color: #f85149; }
`;

  let stylesInjected = false;
  function injectStyles() {
    if (stylesInjected) return;
    stylesInjected = true;
    const style = document.createElement('style');
    style.textContent = STYLES;
    document.head.appendChild(style);
  }

  // ── RobosAITextarea custom element ────────────────────────────────────────────
  class RobosAITextarea extends HTMLElement {
    constructor() {
      super();
      this._commands = [...DEFAULT_COMMANDS];
      this._activeCommand = null;
      this._paletteIdx = 0;
      this._paletteOpen = false;
      this._paletteFilter = '';
      this._mentionOpen = false;
      this._mentionIdx = 0;
      this._contextItems = []; // attached @files
      this._streaming = false;
      this._streamText = '';
      this._maxChars = parseInt(this.getAttribute('max-chars') || '0');
      this._showSubmit   = this.getAttribute('show-submit') !== 'false';
      this._showCommands = this.getAttribute('show-commands') !== 'false';
    }

    get value() {
      return this._inner ? this._inner.innerText.trim() : '';
    }

    set value(v) {
      if (this._inner) this._inner.innerText = v;
    }

    get placeholder() { return this.getAttribute('placeholder') || (this._showCommands ? 'Type your message… (/ for commands, @ for files)' : 'Type your message… (@ for files)'); }

    connectedCallback() {
      injectStyles();
      this._render();
      this._bind();
    }

    // ── Register custom slash commands ──────────────────────────────────────────
    registerCommand(cmd) {
      this._commands = this._commands.filter(c => c.name !== cmd.name);
      this._commands.push(cmd);
    }

    // ── Stream API ──────────────────────────────────────────────────────────────
    // Call this immediately when request is sent (before chunks arrive)
    startWaiting() {
      this._waitBadge.classList.add('active');
      if (this._submitBtn) this._submitBtn.disabled = true;
    }

    streamChunk(text) {
      if (!this._streaming) {
        this._streaming = true;
        this._streamText = '';
        this._wrap.classList.add('streaming');
        this._streamOverlay.classList.add('active');
        this._waitBadge.classList.remove('active'); // replace "Waiting…" with stream overlay
        if (this._submitBtn) this._submitBtn.disabled = true;
      }
      this._streamText += text;
      this._streamContent.textContent = this._streamText;
      if (this._tailChk && this._tailChk.checked) {
        this._streamBody.scrollTop = this._streamBody.scrollHeight;
      }
    }

    streamDone() {
      this._streaming = false;
      this._wrap.classList.remove('streaming');
      this._waitBadge.classList.remove('active');
      this._streamCursor.style.display = 'none';
      if (this._submitBtn) this._submitBtn.disabled = false;
    }

    clearStream() {
      this._streamText = '';
      this._streamContent.textContent = '';
      this._streamOverlay.classList.remove('active');
      this._streamCursor.style.display = '';
      this._waitBadge.classList.remove('active');
      this._streaming = false;
      this._wrap.classList.remove('streaming');
      if (this._submitBtn) this._submitBtn.disabled = false;
    }

    // ── Build DOM ───────────────────────────────────────────────────────────────
    _render() {
      this.innerHTML = '';

      // Context chips row
      this._chipsRow = document.createElement('div');
      this._chipsRow.className = 'robos-context-chips';
      this._chipsRow.style.display = 'none';
      this.appendChild(this._chipsRow);

      this._wrap = document.createElement('div');
      this._wrap.className = 'robos-ai-textarea-wrap';
      this.appendChild(this._wrap);

      // Top-right waiting badge
      this._waitBadge = document.createElement('div');
      this._waitBadge.className = 'robos-wait-badge';
      const waitSpin = document.createElement('div');
      waitSpin.className = 'robos-wait-spin';
      this._waitBadge.appendChild(waitSpin);
      this._waitBadge.appendChild(document.createTextNode('Waiting…'));
      this._wrap.appendChild(this._waitBadge);

      // Editable area
      this._inner = document.createElement('div');
      this._inner.className = 'robos-ai-inner';
      this._inner.contentEditable = 'true';
      this._inner.dataset.placeholder = this.placeholder;
      this._inner.setAttribute('spellcheck', 'true');
      // Support min-height attribute (in px)
      const minH = parseInt(this.getAttribute('min-height') || '0');
      if (minH > 0) this._inner.style.minHeight = minH + 'px';
      this._wrap.appendChild(this._inner);

      // Stream overlay
      this._streamOverlay = document.createElement('div');
      this._streamOverlay.className = 'robos-stream-overlay';

      // Stream header: spinner + label + tail checkbox
      const streamHdr = document.createElement('div');
      streamHdr.className = 'robos-stream-header';
      this._streamSpinner = document.createElement('div');
      this._streamSpinner.className = 'robos-stream-spinner';
      const streamLbl = document.createElement('span');
      streamLbl.className = 'robos-stream-label';
      streamLbl.textContent = '● STREAMING';
      this._tailLabel = document.createElement('label');
      this._tailLabel.className = 'robos-tail-label';
      this._tailChk = document.createElement('input');
      this._tailChk.type = 'checkbox';
      this._tailChk.checked = true;
      this._tailLabel.appendChild(this._tailChk);
      this._tailLabel.appendChild(document.createTextNode('Auto-scroll'));
      streamHdr.appendChild(this._streamSpinner);
      streamHdr.appendChild(streamLbl);
      streamHdr.appendChild(this._tailLabel);
      this._streamOverlay.appendChild(streamHdr);

      // Stream body
      this._streamBody = document.createElement('div');
      this._streamBody.className = 'robos-stream-body';
      this._streamContent = document.createElement('span');
      this._streamCursor = document.createElement('span');
      this._streamCursor.className = 'robos-stream-cursor';
      this._streamBody.appendChild(this._streamContent);
      this._streamBody.appendChild(this._streamCursor);
      this._streamOverlay.appendChild(this._streamBody);
      this._wrap.appendChild(this._streamOverlay);

      // Toolbar
      this._toolbar = document.createElement('div');
      this._toolbar.className = 'robos-ai-toolbar';

      this._toolbarLeft = document.createElement('div');
      this._toolbarLeft.className = 'robos-ai-toolbar-left';

      this._toolbarRight = document.createElement('div');
      this._toolbarRight.className = 'robos-ai-toolbar-right';

      // Slash hint pill
      this._hintPill = document.createElement('div');
      this._hintPill.className = 'robos-cmd-pill';
      this._hintPill.innerHTML = '<span>/ commands</span>';
      this._hintPill.title = 'Type / for AI command palette';
      this._hintPill.addEventListener('click', () => { this._inner.focus(); this._triggerPalette(''); });
      if (this._showCommands) this._toolbarLeft.appendChild(this._hintPill);

      // Char count
      if (this._maxChars) {
        this._charCount = document.createElement('div');
        this._charCount.className = 'robos-char-count';
        this._toolbarRight.appendChild(this._charCount);
      }

      // Hint
      const hint = document.createElement('div');
      hint.className = 'robos-hint';
      hint.textContent = 'Ctrl+↵ submit';
      this._toolbarRight.appendChild(hint);

      // Submit button
      if (this._showSubmit) {
        this._submitBtn = document.createElement('button');
        this._submitBtn.className = 'robos-submit-btn';
        this._submitBtn.innerHTML = '✦ Submit';
        this._submitBtn.addEventListener('click', () => this._doSubmit());
        this._toolbarRight.appendChild(this._submitBtn);
      }

      // Quick-ask "?" button
      this._askBtn = document.createElement('button');
      this._askBtn.className = 'robos-ask-btn';
      this._askBtn.textContent = '?';
      this._askBtn.title = 'Ask AI a quick question using this context';
      this._askBtn.addEventListener('click', (e) => { e.stopPropagation(); this._openAskDialog(); });
      this._toolbarRight.appendChild(this._askBtn);

      // Quick-ask dialog — appended to body
      this._buildAskDialog();

      this._toolbar.appendChild(this._toolbarLeft);
      this._toolbar.appendChild(this._toolbarRight);
      this._wrap.appendChild(this._toolbar);

      // Command palette — appended to body so it's never clipped by parent overflow/z-index
      this._palette = document.createElement('div');
      this._palette.className = 'robos-palette';
      document.body.appendChild(this._palette);

      // Mention list — also on body
      this._mentionList = document.createElement('div');
      this._mentionList.className = 'robos-mention-list';
      document.body.appendChild(this._mentionList);
    }

    disconnectedCallback() {
      // Clean up body-appended popups when element is removed
      if (this._palette && this._palette.parentNode === document.body) document.body.removeChild(this._palette);
      if (this._mentionList && this._mentionList.parentNode === document.body) document.body.removeChild(this._mentionList);
      if (this._askDialog && this._askDialog.parentNode === document.body) document.body.removeChild(this._askDialog);
    }

    // ── Bind events ─────────────────────────────────────────────────────────────
    _bind() {
      this._inner.addEventListener('input', () => this._onInput());
      this._inner.addEventListener('keydown', (e) => this._onKeydown(e));
      this._inner.addEventListener('focus', () => this._onFocus());

      // Close palette on outside click
      document.addEventListener('click', (e) => {
        if (!this.contains(e.target)) {
          this._closePalette();
          this._closeMention();
        }
      });
    }

    _onFocus() {
      // noop for now
    }

    _onInput() {
      // Re-dispatch at custom element level so external listeners on <robos-ai-textarea> work
      this.dispatchEvent(new Event('input', { bubbles: true }));

      const text = this._inner.innerText;
      this._updateCharCount(text);

      // Detect slash command trigger
      const sel = window.getSelection();
      if (!sel.rangeCount) return;
      const range = sel.getRangeAt(0);
      const node  = range.startContainer;
      const offset = range.startOffset;
      const lineText = (node.textContent || '').substring(0, offset);

      // /command trigger
      const slashMatch = lineText.match(/(?:^|\s)\/([\w]*)$/);
      if (this._showCommands && slashMatch) {
        this._triggerPalette(slashMatch[1]);
        return;
      } else if (this._paletteOpen) {
        this._closePalette();
      }

      // @mention trigger — supports @/path, @~/path, @./path, @name
      const mentionMatch = lineText.match(/@([\w./~\\-]*)$/);
      if (mentionMatch) {
        this._triggerMention(mentionMatch[1]);
        return;
      } else if (this._mentionOpen) {
        this._closeMention();
      }
    }

    _onKeydown(e) {
      // Palette navigation
      if (this._paletteOpen) {
        if (e.key === 'ArrowDown') { e.preventDefault(); this._paletteMove(1); return; }
        if (e.key === 'ArrowUp')   { e.preventDefault(); this._paletteMove(-1); return; }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          this._paletteSelect();
          return;
        }
        if (e.key === 'Escape') { e.preventDefault(); this._closePalette(); return; }
      }

      // Mention navigation
      if (this._mentionOpen) {
        if (e.key === 'ArrowDown') { e.preventDefault(); this._mentionMove(1); return; }
        if (e.key === 'ArrowUp')   { e.preventDefault(); this._mentionMove(-1); return; }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          this._mentionSelect();
          return;
        }
        if (e.key === 'Escape') { e.preventDefault(); this._closeMention(); return; }
      }

      // Ctrl+Enter = submit
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        this._doSubmit();
        return;
      }

      // Shift+Enter = newline (default contenteditable behavior, just don't submit)
      if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        // Allow default newline
      }
    }

    _updateCharCount(text) {
      if (!this._maxChars || !this._charCount) return;
      const len = text.length;
      this._charCount.textContent = `${len}/${this._maxChars}`;
      this._charCount.className = 'robos-char-count' +
        (len > this._maxChars ? ' over' : len > this._maxChars * 0.9 ? ' warn' : '');
    }

    // ── Position a fixed popup relative to the textarea wrap ────────────────────
    _positionPopup(popup) {
      const rect = this._wrap.getBoundingClientRect();
      const popupH = popup.offsetHeight || 300;
      const spaceBelow = window.innerHeight - rect.bottom - 8;
      const spaceAbove = rect.top - 8;

      popup.style.left  = rect.left + 'px';
      popup.style.width = rect.width + 'px';

      if (spaceBelow >= Math.min(popupH, 200) || spaceBelow >= spaceAbove) {
        // Open below
        popup.style.top    = (rect.bottom + 4) + 'px';
        popup.style.bottom = '';
        popup.style.maxHeight = Math.max(spaceBelow, 100) + 'px';
      } else {
        // Flip above
        popup.style.bottom = (window.innerHeight - rect.top + 4) + 'px';
        popup.style.top    = '';
        popup.style.maxHeight = Math.max(spaceAbove, 100) + 'px';
      }
    }

    // ── Command palette ──────────────────────────────────────────────────────────
    _triggerPalette(filter) {
      this._paletteFilter = filter.toLowerCase();
      const filtered = this._commands.filter(c =>
        !filter || c.name.startsWith(filter) || c.desc.toLowerCase().includes(filter)
      );
      if (!filtered.length) { this._closePalette(); return; }

      this._paletteOpen = true;
      this._paletteIdx  = 0;
      this._palette.classList.add('open');
      this._palette.innerHTML = `<div class="robos-palette-hdr">AI Commands</div>` +
        filtered.map((c, i) => `
          <div class="robos-palette-item${i === 0 ? ' highlighted' : ''}" data-cmd="${c.name}">
            <span class="robos-palette-icon">${c.icon}</span>
            <span class="robos-palette-name">/${c.name}</span>
            <span class="robos-palette-sep"></span>
            <span class="robos-palette-desc">${c.desc}</span>
            <span class="robos-palette-kbd">↵</span>
          </div>`
        ).join('');

      this._palette.querySelectorAll('.robos-palette-item').forEach((item, i) => {
        item.addEventListener('click', () => {
          this._paletteIdx = i;
          this._paletteSelect();
        });
        item.addEventListener('mouseenter', () => {
          this._paletteIdx = i;
          this._highlightPalette();
        });
      });
      this._paletteItems = filtered;
      // Position after render so offsetHeight is correct
      requestAnimationFrame(() => this._positionPopup(this._palette));
    }

    _paletteMove(delta) {
      this._paletteIdx = Math.max(0, Math.min((this._paletteItems || []).length - 1, this._paletteIdx + delta));
      this._highlightPalette();
    }

    _highlightPalette() {
      this._palette.querySelectorAll('.robos-palette-item').forEach((el, i) => {
        el.classList.toggle('highlighted', i === this._paletteIdx);
        if (i === this._paletteIdx) el.scrollIntoView({ block: 'nearest' });
      });
    }

    _paletteSelect() {
      const items = this._paletteItems || [];
      const cmd = items[this._paletteIdx];
      if (!cmd) return;

      // Replace the /filter text in the editor with /command then focus
      const text = this._inner.innerText;
      const newText = text.replace(/(?:^|\s)\/([\w]*)$/, (m, g) => m.replace('/' + g, '/' + cmd.name + ' '));
      this._inner.innerText = newText;
      // Move cursor to end
      const range = document.createRange();
      const sel   = window.getSelection();
      range.selectNodeContents(this._inner);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);

      this._activeCommand = cmd.name;
      this._hintPill.innerHTML = `<span>${cmd.icon}</span><span>/${cmd.name}</span>`;
      this._hintPill.classList.add('active');
      this._closePalette();
      this._inner.focus();

      this.dispatchEvent(new CustomEvent('robos-command-selected', { detail: { command: cmd.name }, bubbles: true }));
    }

    _closePalette() {
      this._paletteOpen = false;
      this._palette.classList.remove('open');
    }

    // ── @mention autocomplete ────────────────────────────────────────────────────
    _esc(s) {
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    _fuzzyScore(text, query) {
      if (!query) return { score: 0, indices: [] };
      const t = text.toLowerCase(), q = query.toLowerCase();
      let ti = 0, qi = 0, score = 0, consec = 0;
      const indices = [];
      while (ti < t.length && qi < q.length) {
        if (t[ti] === q[qi]) {
          indices.push(ti);
          if (ti === 0) score += 10;
          if (consec > 0) score += 5 * consec;
          if (ti > 0 && /[\s\-_./]/.test(t[ti - 1])) score += 8;
          score += 1; consec++; qi++;
        } else { consec = 0; }
        ti++;
      }
      return qi < q.length ? { score: -1, indices: [] } : { score, indices };
    }

    _fuzzyHighlight(text, indices) {
      if (!indices || !indices.length) return this._esc(text);
      const set = new Set(indices);
      return text.split('').map((ch, i) =>
        set.has(i) ? `<mark class="fz-m">${this._esc(ch)}</mark>` : this._esc(ch)
      ).join('');
    }

    _triggerMention(filter) {
      this._mentionFilter = filter;
      // Show loading state — position BEFORE adding 'open' to avoid unpositioned popup causing reflow
      this._mentionOpen = true;
      this._mentionItems = [];
      this._mentionList.innerHTML = `<div class="robos-mention-list-hdr"><span class="robos-mention-spinner"></span> Searching…</div>`;
      this._positionPopup(this._mentionList);
      this._mentionList.classList.add('open');
      requestAnimationFrame(() => this._positionPopup(this._mentionList));

      if (filter.startsWith('/') || filter.startsWith('~') || filter.startsWith('./')) {
        this.dispatchEvent(new CustomEvent('robos-path-query', { detail: { query: filter }, bubbles: true, cancelable: true }));
        return;
      }
      // Treat bare @word as home-relative path query
      this.dispatchEvent(new CustomEvent('robos-path-query', { detail: { query: '~/' + filter }, bubbles: true, cancelable: true }));
    }

    _showMentions(items) {
      if (!items || !items.length) {
        this._mentionList.innerHTML = `<div class="robos-mention-list-hdr">No results</div><div class="robos-mention-empty">No matches found for "${this._esc(this._mentionFilter || '')}"</div>`;
        this._mentionOpen = true;
        this._mentionItems = [];
        this._positionPopup(this._mentionList);
        this._mentionList.classList.add('open');
        requestAnimationFrame(() => this._positionPopup(this._mentionList));
        return;
      }

      // Repos first, then people, then groups, then files — fuzzy-score each group separately
      const q = (this._mentionFilter || '').replace(/^.*\//, '');
      const scored = items.map(item => {
        const name = (item.name || '').replace(/\/$/, '');
        // For people also score against the github username (item.path)
        const altScore = item.isPerson ? this._fuzzyScore(item.path || '', q) : { score: -1, indices: [] };
        const { score, indices } = this._fuzzyScore(name, q);
        const bestScore = altScore.score > score ? altScore.score : score;
        return { item, score: bestScore, indices: altScore.score > score ? altScore.indices : indices };
      }).sort((a, b) => {
        const typeOrder = v => v.isRepo ? 0 : v.isPerson ? 1 : v.isGroup ? 2 : 3;
        const to = typeOrder(a.item) - typeOrder(b.item);
        if (to !== 0) return to;
        return b.score - a.score;
      });

      this._mentionOpen = true;
      this._mentionIdx  = 0;
      this._mentionItems = scored.map(s => s.item);
      const hasRepos   = items.some(i => i.isRepo);
      const hasPeople  = items.some(i => i.isPerson);
      const hasGroups  = items.some(i => i.isGroup);
      const hasFiles   = items.some(i => !i.isRepo && !i.isPerson && !i.isGroup);
      const parts = [];
      if (hasRepos)  parts.push('🗄 Repos');
      if (hasPeople) parts.push('👤 People');
      if (hasGroups) parts.push('👥 Groups');
      if (hasFiles)  parts.push('📂 Files');
      const hdrLabel = parts.join(' &amp; ') || '📂 Files';
      this._mentionList.innerHTML =
        `<div class="robos-mention-list-hdr">${hdrLabel} matching <em>${this._esc(this._mentionFilter || '')}</em></div>` +
        scored.map(({ item, indices }, i) => {
          const name = (item.name || '').replace(/\/$/, '');
          const nameHl = this._fuzzyHighlight(name, indices);
          if (item.isRepo) {
            return `<div class="robos-mention-item${i === 0 ? ' highlighted' : ''}" data-idx="${i}">
              <span class="robos-mention-item-icon">🗄</span>
              <span class="robos-mention-item-body">
                <span class="robos-mention-item-name">${nameHl}</span>
                <span class="robos-mention-item-dir" style="color:#58a6ff">github.com</span>
              </span>
            </div>`;
          }
          if (item.isPerson) {
            return `<div class="robos-mention-item${i === 0 ? ' highlighted' : ''}" data-idx="${i}">
              <span class="robos-mention-item-icon">👤</span>
              <span class="robos-mention-item-body">
                <span class="robos-mention-item-name">${nameHl}</span>
                <span class="robos-mention-item-dir" style="color:#3fb950">@${this._esc(item.path || '')}</span>
              </span>
            </div>`;
          }
          if (item.isGroup) {
            return `<div class="robos-mention-item${i === 0 ? ' highlighted' : ''}" data-idx="${i}">
              <span class="robos-mention-item-icon">👥</span>
              <span class="robos-mention-item-body">
                <span class="robos-mention-item-name">${nameHl}</span>
                <span class="robos-mention-item-dir" style="color:#d29922">${this._esc(item.path || '')}</span>
              </span>
            </div>`;
          }
          const dir  = item.path ? item.path.replace(/\/[^/]+\/?$/, '/') : '';
          const icon = item.isDir ? '📁' : this._fileIcon(name);
          return `<div class="robos-mention-item${i === 0 ? ' highlighted' : ''}" data-idx="${i}">
            <span class="robos-mention-item-icon">${icon}</span>
            <span class="robos-mention-item-body">
              <span class="robos-mention-item-name">${nameHl}</span>
              <span class="robos-mention-item-dir">${this._esc(dir)}</span>
            </span>
          </div>`;
        }).join('');

      this._mentionList.querySelectorAll('.robos-mention-item').forEach((el, i) => {
        el.addEventListener('click', () => { this._mentionIdx = i; this._mentionSelect(); });
        el.addEventListener('mouseenter', () => { this._mentionIdx = i; this._highlightMention(); });
      });
      // Position BEFORE making visible to prevent unpositioned popup from causing reflow
      this._positionPopup(this._mentionList);
      this._mentionList.classList.add('open');
      requestAnimationFrame(() => this._positionPopup(this._mentionList));
    }

    _fileIcon(name) {
      const ext = (name.split('.').pop() || '').toLowerCase();
      const map = { js:'📜',ts:'📜',jsx:'📜',tsx:'📜',py:'🐍',rb:'💎',go:'🐹',rs:'🦀',
        java:'☕',c:'⚙️',cpp:'⚙️',json:'📋',yaml:'📋',yml:'📋',md:'📝',txt:'📝',
        sh:'🔧',bash:'🔧',html:'🌐',css:'🎨',scss:'🎨',png:'🖼️',jpg:'🖼️',svg:'🖼️',
        pdf:'📕',zip:'📦',log:'📋',conf:'⚙️',env:'⚙️' };
      return map[ext] || '📄';
    }

    _highlightMention() {
      this._mentionList.querySelectorAll('.robos-mention-item').forEach((el, i) => {
        el.classList.toggle('highlighted', i === this._mentionIdx);
      });
    }

    _mentionMove(d) {
      this._mentionIdx = Math.max(0, Math.min((this._mentionItems || []).length - 1, this._mentionIdx + d));
      this._highlightMention();
    }

    _mentionSelect() {
      const item = (this._mentionItems || [])[this._mentionIdx];
      if (!item) return;
      // For repos: use github.com/org/repo path; for people: GitHub username; for groups: group id; for path completions: full path; else name
      const replacement = item.isRepo || item.isPerson || item.isGroup ? item.path : (item.isPath && item.path) ? item.path : (item.name || item.path);
      const text = this._inner.innerText;
      const replaced = text.replace(/@([\w./~\\-]*)$/, `@${replacement}`);
      this._inner.innerText = replaced;
      // Move cursor to end
      const range = document.createRange();
      const sel   = window.getSelection();
      range.selectNodeContents(this._inner);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);

      // Add context chip
      this._addContextChip(item);
      this._closeMention();
      this.dispatchEvent(new CustomEvent('robos-mention-selected', { detail: { item }, bubbles: true }));
    }

    _closeMention() {
      this._mentionOpen = false;
      this._mentionList.classList.remove('open');
    }

    // ── Context chips ────────────────────────────────────────────────────────────
    _addContextChip(item) {
      if (this._contextItems.find(c => (c.path || c.name) === (item.path || item.name))) return;
      this._contextItems.push(item);
      this._renderChips();
    }

    _removeContextChip(nameOrPath) {
      this._contextItems = this._contextItems.filter(c => (c.path || c.name) !== nameOrPath);
      this._renderChips();
    }

    _renderChips() {
      if (!this._contextItems.length) {
        this._chipsRow.style.display = 'none';
        return;
      }
      this._chipsRow.style.display = 'flex';
      this._chipsRow.innerHTML = this._contextItems.map(item => {
        const key = item.path || item.name;
        const icon = item.isRepo ? '🗄' : item.isDir ? '📁' : '📄';
        return `<div class="robos-context-chip">
          <span>${icon}</span>
          <span>${item.name}</span>
          <span class="robos-context-chip-remove" data-key="${key}">✕</span>
        </div>`;
      }).join('');
      this._chipsRow.querySelectorAll('.robos-context-chip-remove').forEach(btn => {
        btn.addEventListener('click', () => this._removeContextChip(btn.dataset.key));
      });
    }

    // ── Quick-ask dialog ─────────────────────────────────────────────────────────
    _buildAskDialog() {
      this._askDialog = document.createElement('div');
      this._askDialog.className = 'robos-ask-dialog';

      // Header
      const hdr = document.createElement('div');
      hdr.className = 'robos-ask-dialog-header';
      hdr.innerHTML = '<div class="robos-ask-dialog-title">💬 Ask a Quick Question</div>';
      const closeBtn = document.createElement('button');
      closeBtn.className = 'robos-ask-dialog-close';
      closeBtn.textContent = '✕';
      closeBtn.title = 'Close';
      closeBtn.addEventListener('click', () => this._closeAskDialog());
      hdr.appendChild(closeBtn);
      this._askDialog.appendChild(hdr);

      // Context preview (collapsed)
      this._askCtxRow = document.createElement('div');
      this._askCtxRow.className = 'robos-ask-ctx';
      this._askCtxRow.title = 'Click to show/hide context being used';
      this._askCtxExpand = document.createElement('div');
      this._askCtxExpand.className = 'robos-ask-ctx-expand';
      this._askCtxRow.addEventListener('click', () => this._askCtxExpand.classList.toggle('open'));
      this._askDialog.appendChild(this._askCtxRow);
      this._askDialog.appendChild(this._askCtxExpand);

      // Input row
      const inputRow = document.createElement('div');
      inputRow.className = 'robos-ask-input-row';
      this._askInput = document.createElement('textarea');
      this._askInput.className = 'robos-ask-input';
      this._askInput.placeholder = 'e.g. What are the main risks here? How should I handle errors?';
      this._askInput.rows = 2;
      this._askInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this._doAsk(); }
      });
      this._askSend = document.createElement('button');
      this._askSend.className = 'robos-ask-send';
      this._askSend.textContent = '↵ Ask';
      this._askSend.addEventListener('click', () => this._doAsk());
      inputRow.appendChild(this._askInput);
      inputRow.appendChild(this._askSend);
      this._askDialog.appendChild(inputRow);

      // Response area
      this._askResponse = document.createElement('div');
      this._askResponse.className = 'robos-ask-response';
      this._askResponsePlaceholder = document.createElement('span');
      this._askResponsePlaceholder.className = 'robos-ask-response-placeholder';
      this._askResponsePlaceholder.textContent = 'Answer will appear here…';
      this._askResponse.appendChild(this._askResponsePlaceholder);
      this._askDialog.appendChild(this._askResponse);

      document.body.appendChild(this._askDialog);

      // Close on outside click
      document.addEventListener('click', (e) => {
        if (this._askDialog.classList.contains('open') && !this._askDialog.contains(e.target) && e.target !== this._askBtn) {
          this._closeAskDialog();
        }
      });
    }

    _openAskDialog() {
      if (!this._askDialog) return;
      // Position near the button
      const btnRect = this._askBtn.getBoundingClientRect();
      const dw = 420, dh = 360;
      let top  = btnRect.bottom + 6;
      let left = btnRect.right - dw;
      if (left < 8) left = 8;
      if (top + dh > window.innerHeight - 8) top = btnRect.top - dh - 6;
      this._askDialog.style.top  = `${top}px`;
      this._askDialog.style.left = `${left}px`;

      // Populate context preview
      const ctxValue = this.value || '';
      const ctxFiles = this._contextItems.map(c => c.path || c.label || c).join(', ');
      const preview  = ctxValue.length > 80 ? ctxValue.slice(0, 80) + '…' : (ctxValue || '(no text entered yet)');
      this._askCtxRow.textContent = `📎 Context: "${preview}"${ctxFiles ? ` + files: ${ctxFiles}` : ''}`;
      this._askCtxExpand.textContent = ctxValue || '(empty)';

      this._askDialog.classList.add('open');
      this._askInput.focus();
    }

    _closeAskDialog() {
      if (this._askDialog) this._askDialog.classList.remove('open');
    }

    _doAsk() {
      const question = this._askInput.value.trim();
      if (!question) return;
      this._askSend.disabled = true;
      this._askResponsePlaceholder.style.display = 'none';
      this._askResponse.textContent = '';
      this._askResponse.appendChild(this._askResponsePlaceholder);
      this._askResponsePlaceholder.style.display = 'none';

      const context = this.value || '';
      const contextFiles = this._contextItems.map(c => c.path || c.label || c);

      if (typeof window.robosQuickAsk === 'function') {
        let responseText = '';
        window.robosQuickAsk(question, context, contextFiles, (chunk) => {
          responseText += chunk;
          this._askResponse.textContent = responseText;
          this._askResponse.scrollTop = this._askResponse.scrollHeight;
        }, () => {
          // done
          this._askSend.disabled = false;
        }, (err) => {
          this._askResponse.textContent = `⚠ Error: ${err}`;
          this._askSend.disabled = false;
        });
      } else {
        this._askResponse.textContent = '⚠ Quick-ask not available in this app. The app needs to set window.robosQuickAsk.';
        this._askSend.disabled = false;
      }
    }

    // ── Submit ───────────────────────────────────────────────────────────────────
    _doSubmit() {
      if (this._streaming) return;
      const value = this.value;
      if (!value) return;

      // Parse out command if present
      const cmdMatch = value.match(/^\/(\w+)\s*([\s\S]*)$/);
      const command  = cmdMatch ? cmdMatch[1] : this._activeCommand;
      const text     = cmdMatch ? cmdMatch[2].trim() : value;

      // Optional journal hook — apps can set window.robosJournalLog = async (evt) => ...
      if (typeof window.robosJournalLog === 'function') {
        try {
          window.robosJournalLog({
            type: 'ai-prompt-submitted',
            source: this.getAttribute('journal-source') || document.title || 'RobOS App',
            title: `📝 AI Prompt${command ? ` (/${command})` : ''}`,
            detail: text.slice(0, 200),
            status: 'started',
          });
        } catch {}
      }

      this.dispatchEvent(new CustomEvent('robos-submit', {
        detail: { value, command, text, context: [...this._contextItems] },
        bubbles: true,
      }));
    }

    // ── Public clear ────────────────────────────────────────────────────────────
    clear() {
      this._inner.innerText = '';
      this._activeCommand = null;
      this._hintPill.innerHTML = '<span>/ commands</span>';
      this._hintPill.classList.remove('active');
      this._contextItems = [];
      this._renderChips();
      this.clearStream();
    }
  }

  // Register custom element
  if (!customElements.get('robos-ai-textarea')) {
    customElements.define('robos-ai-textarea', RobosAITextarea);
  }

  // ── RobosPersonSelectorTextbox ────────────────────────────────────────────────
  //
  // Usage:
  //   <robos-person-selector-textbox id="owner-field" placeholder="Search people…">
  //   </robos-person-selector-textbox>
  //
  //   el.value          → selected person's uid (empty string if none)
  //   el.selectedPerson → full person object or null
  //   el.people = [...] → provide people list directly (optional; component
  //                        also auto-loads via window.api?.listPeople or
  //                        dispatches 'robos-people-load' for the host to handle)
  //
  //   Events:
  //     'change'  — fires when selection changes; detail: { uid, person }
  //
  // ─────────────────────────────────────────────────────────────────────────────

  const PERSON_SELECTOR_STYLES = `
robos-person-selector-textbox {
  display: block;
  position: relative;
  width: 100%;
  font-family: -apple-system, 'Segoe UI', system-ui, sans-serif;
}
.rpst-wrap {
  position: relative;
  width: 100%;
}
.rpst-input {
  width: 100%;
  box-sizing: border-box;
  background: #0d1117;
  border: 1px solid #30363d;
  border-radius: 6px;
  color: #c9d1d9;
  font-size: 13px;
  padding: 6px 28px 6px 10px;
  outline: none;
  transition: border-color 0.15s;
}
.rpst-input:focus {
  border-color: #58a6ff;
  box-shadow: 0 0 0 2px rgba(88,166,255,0.2);
}
.rpst-input::placeholder { color: #484f58; }
.rpst-input:disabled { opacity: 0.5; cursor: not-allowed; }
.rpst-clear {
  position: absolute;
  right: 7px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: #484f58;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 0 2px;
  display: none;
}
.rpst-clear:hover { color: #c9d1d9; }
.rpst-dropdown {
  display: none;
  position: fixed;
  z-index: 99999;
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.5);
  max-height: 220px;
  overflow-y: auto;
  min-width: 240px;
}
.rpst-dropdown.open { display: block; }
.rpst-dropdown-hdr {
  padding: 6px 10px 4px;
  font-size: 10px;
  color: #484f58;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  border-bottom: 1px solid #21262d;
}
.rpst-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  cursor: pointer;
  border-bottom: 1px solid #21262d;
}
.rpst-item:last-child { border-bottom: none; }
.rpst-item:hover, .rpst-item.highlighted { background: #0d2137; }
.rpst-item-avatar {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: #21262d;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  flex-shrink: 0;
  color: #8b949e;
  overflow: hidden;
}
.rpst-item-avatar img { width: 100%; height: 100%; object-fit: cover; }
.rpst-item-body { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1; }
.rpst-item-name { color: #c9d1d9; font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rpst-item-name mark { background: none; color: #79c0ff; font-weight: 700; }
.rpst-item-meta { color: #484f58; font-size: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rpst-item-meta .rpst-username { color: #3fb950; }
.rpst-empty { padding: 12px; text-align: center; color: #484f58; font-size: 11px; }
.rpst-loading { padding: 10px; text-align: center; color: #484f58; font-size: 11px; }
`;

  class RobosPersonSelectorTextbox extends HTMLElement {
    static get observedAttributes() { return ['value', 'placeholder', 'disabled']; }

    constructor() {
      super();
      this._uid      = '';
      this._person   = null;
      this._people   = null; // null = not loaded yet
      this._filtered = [];
      this._open     = false;
      this._idx      = 0;
      this._loading  = false;
    }

    connectedCallback() {
      if (!this._input) this._build();
      this._uid = this.getAttribute('value') || '';
      this._updateDisplay();
    }

    disconnectedCallback() {
      if (this._dropdown && this._dropdown.parentNode) this._dropdown.parentNode.removeChild(this._dropdown);
    }

    attributeChangedCallback(name, _old, newVal) {
      if (name === 'value') {
        this._uid = newVal || '';
        this._updateDisplay();
      }
      if (name === 'placeholder' && this._input) {
        this._input.placeholder = newVal || '';
      }
      if (name === 'disabled' && this._input) {
        this._input.disabled = newVal !== null;
      }
    }

    get value() { return this._uid; }
    set value(v) {
      this._uid = v || '';
      this.setAttribute('value', this._uid);
      this._updateDisplay();
    }

    get selectedPerson() { return this._person; }

    set people(list) {
      this._people = Array.isArray(list) ? list : [];
      this._updateDisplay();
    }

    _build() {
      // Inject styles once
      if (!document.getElementById('rpst-styles')) {
        const s = document.createElement('style');
        s.id = 'rpst-styles';
        s.textContent = PERSON_SELECTOR_STYLES;
        document.head.appendChild(s);
      }

      const wrap = document.createElement('div');
      wrap.className = 'rpst-wrap';

      this._input = document.createElement('input');
      this._input.type = 'text';
      this._input.className = 'rpst-input';
      this._input.placeholder = this.getAttribute('placeholder') || 'Search people…';
      if (this.hasAttribute('disabled')) this._input.disabled = true;
      wrap.appendChild(this._input);

      this._clearBtn = document.createElement('button');
      this._clearBtn.className = 'rpst-clear';
      this._clearBtn.type = 'button';
      this._clearBtn.title = 'Clear';
      this._clearBtn.textContent = '✕';
      wrap.appendChild(this._clearBtn);

      this.appendChild(wrap);

      this._dropdown = document.createElement('div');
      this._dropdown.className = 'rpst-dropdown';
      document.body.appendChild(this._dropdown);

      this._input.addEventListener('focus',   () => this._onFocus());
      this._input.addEventListener('input',   () => this._onInput());
      this._input.addEventListener('keydown', (e) => this._onKey(e));
      this._input.addEventListener('blur',    (e) => this._onBlur(e));
      this._clearBtn.addEventListener('mousedown', (e) => { e.preventDefault(); this._clear(); });

      this._dropdown.addEventListener('mousedown', (e) => e.preventDefault());
    }

    async _ensurePeople() {
      if (this._people !== null) return;
      this._people = [];
      try {
        // Try direct IPC (Electron with window.api exposed)
        if (typeof window.api?.listPeople === 'function') {
          this._people = await window.api.listPeople() || [];
        } else {
          // Dispatch event for host to handle
          const ev = new CustomEvent('robos-people-load', { bubbles: true, cancelable: false, detail: { resolve: (list) => { this._people = list || []; } } });
          this.dispatchEvent(ev);
        }
      } catch { this._people = []; }
      this._updateDisplay();
    }

    _updateDisplay() {
      if (!this._input) return;
      if (this._uid && this._people) {
        const match = this._people.find(p => p.uid === this._uid);
        if (match) {
          this._person = match;
          if (document.activeElement !== this._input) {
            this._input.value = match.displayName || match.username || this._uid;
          }
          this._clearBtn.style.display = 'block';
          return;
        }
      }
      if (this._uid && !this._people) {
        // People not loaded yet; show uid as placeholder
        if (document.activeElement !== this._input) this._input.value = this._uid;
        this._clearBtn.style.display = 'block';
        return;
      }
      if (!this._uid && document.activeElement !== this._input) {
        this._input.value = '';
        this._clearBtn.style.display = 'none';
        this._person = null;
      }
    }

    async _onFocus() {
      if (this._people === null) {
        this._loading = true;
        await this._ensurePeople();
        this._loading = false;
      }
      this._input.select();
      this._showDropdown(this._input.value);
    }

    _onInput() {
      this._uid = '';
      this._person = null;
      this._clearBtn.style.display = this._input.value ? 'block' : 'none';
      this._showDropdown(this._input.value);
    }

    _onKey(e) {
      if (!this._open) {
        if (e.key === 'ArrowDown' || e.key === 'Enter') { e.preventDefault(); this._showDropdown(this._input.value); }
        return;
      }
      if (e.key === 'ArrowDown') { e.preventDefault(); this._idx = Math.min(this._idx + 1, this._filtered.length - 1); this._highlight(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); this._idx = Math.max(this._idx - 1, 0); this._highlight(); }
      else if (e.key === 'Enter') { e.preventDefault(); this._select(this._filtered[this._idx]); }
      else if (e.key === 'Escape') { e.preventDefault(); this._closeDropdown(); }
    }

    _onBlur(e) {
      // Small delay to allow click events on dropdown to fire
      setTimeout(() => {
        if (!this._dropdown.contains(document.activeElement)) {
          this._closeDropdown();
          // If no valid uid, clear or restore display name
          if (!this._uid) { this._input.value = ''; this._clearBtn.style.display = 'none'; }
          else this._updateDisplay();
        }
      }, 150);
    }

    _showDropdown(query) {
      if (!this._people) { this._renderLoading(); return; }
      const q = (query || '').toLowerCase().trim();
      this._filtered = q
        ? this._people.filter(p =>
            (p.displayName || '').toLowerCase().includes(q) ||
            (p.username    || '').toLowerCase().includes(q) ||
            (p.email       || '').toLowerCase().includes(q) ||
            (p.title       || '').toLowerCase().includes(q))
        : this._people.slice(0, 50);

      this._idx = 0;
      this._renderItems();
      this._positionDropdown();
      this._dropdown.classList.add('open');
      this._open = true;
    }

    _renderLoading() {
      this._dropdown.innerHTML = `<div class="rpst-loading">Loading people…</div>`;
      this._positionDropdown();
      this._dropdown.classList.add('open');
      this._open = true;
    }

    _renderItems() {
      if (!this._filtered.length) {
        this._dropdown.innerHTML = `<div class="rpst-empty">No people found</div>`;
        return;
      }
      const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
      const hl  = (text, q) => {
        if (!q) return esc(text);
        const idx = text.toLowerCase().indexOf(q.toLowerCase());
        if (idx < 0) return esc(text);
        return esc(text.slice(0, idx)) + `<mark>${esc(text.slice(idx, idx + q.length))}</mark>` + esc(text.slice(idx + q.length));
      };
      const q = (this._input.value || '').toLowerCase().trim();
      this._dropdown.innerHTML =
        `<div class="rpst-dropdown-hdr">People</div>` +
        this._filtered.map((p, i) => {
          const initials = ((p.displayName || p.username || '?')[0] || '?').toUpperCase();
          const avatar = p.avatarUrl
            ? `<img src="${esc(p.avatarUrl)}" alt="">`
            : initials;
          const metaParts = [];
          if (p.username) metaParts.push(`<span class="rpst-username">@${esc(p.username)}</span>`);
          if (p.title) metaParts.push(esc(p.title));
          return `<div class="rpst-item${i === 0 ? ' highlighted' : ''}" data-idx="${i}">
            <div class="rpst-item-avatar">${avatar}</div>
            <div class="rpst-item-body">
              <div class="rpst-item-name">${hl(p.displayName || p.username || p.uid, q)}</div>
              ${metaParts.length ? `<div class="rpst-item-meta">${metaParts.join(' · ')}</div>` : ''}
            </div>
          </div>`;
        }).join('');

      this._dropdown.querySelectorAll('.rpst-item').forEach((el, i) => {
        el.addEventListener('click', () => this._select(this._filtered[i]));
        el.addEventListener('mouseenter', () => { this._idx = i; this._highlight(); });
      });
    }

    _highlight() {
      this._dropdown.querySelectorAll('.rpst-item').forEach((el, i) => {
        el.classList.toggle('highlighted', i === this._idx);
      });
      const highlighted = this._dropdown.querySelector('.rpst-item.highlighted');
      if (highlighted) highlighted.scrollIntoView({ block: 'nearest' });
    }

    _select(person) {
      if (!person) return;
      this._person = person;
      this._uid    = person.uid || '';
      this._input.value = person.displayName || person.username || person.uid;
      this._clearBtn.style.display = 'block';
      this.setAttribute('value', this._uid);
      this._closeDropdown();
      this.dispatchEvent(new CustomEvent('change', { detail: { uid: this._uid, person }, bubbles: true }));
    }

    _clear() {
      this._uid    = '';
      this._person = null;
      this._input.value = '';
      this._clearBtn.style.display = 'none';
      this.removeAttribute('value');
      this._closeDropdown();
      this.dispatchEvent(new CustomEvent('change', { detail: { uid: '', person: null }, bubbles: true }));
      this._input.focus();
    }

    _closeDropdown() {
      this._dropdown.classList.remove('open');
      this._open = false;
    }

    _positionDropdown() {
      const rect = this._input.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const ddHeight = Math.min(220, this._dropdown.scrollHeight || 220);
      if (spaceBelow >= ddHeight || spaceBelow >= 100) {
        this._dropdown.style.top    = `${rect.bottom + window.scrollY + 2}px`;
        this._dropdown.style.bottom = 'auto';
      } else {
        this._dropdown.style.bottom = `${window.innerHeight - rect.top + window.scrollY + 2}px`;
        this._dropdown.style.top    = 'auto';
      }
      this._dropdown.style.left  = `${rect.left + window.scrollX}px`;
      this._dropdown.style.width = `${Math.max(rect.width, 240)}px`;
    }
  }

  if (!customElements.get('robos-person-selector-textbox')) {
    customElements.define('robos-person-selector-textbox', RobosPersonSelectorTextbox);
  }

  // Export
  global.RobosUI = { RobosAITextarea, RobosPersonSelectorTextbox, DEFAULT_COMMANDS };

})(typeof window !== 'undefined' ? window : globalThis);

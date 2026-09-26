'use strict';

function normalize(str) {
  return (str || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Evaluates relationship between previous text and incoming speech text.
 * Prevents replaying overlapping streams of audio data and duplicate recall fragments.
 */
function mergeWithPrevious(prevText, newText) {
  const normPrev = normalize(prevText);
  const normNew = normalize(newText);
  if (!normNew) return { action: 'ignore' };
  if (!normPrev) return { action: 'append' };

  // 1. Exact match (ignore duplicate)
  if (normPrev === normNew) {
    return { action: 'ignore' };
  }

  // 2. Substring recall check: newText is already fully contained within prevText
  // (e.g. prev="the link data section is really stupid", new="really stupid")
  if (normPrev.includes(normNew)) {
    return { action: 'ignore' };
  }

  // 3. Extension check: newText starts with and extends prevText
  // (e.g. prev="The", new="The Json LD link data")
  // (e.g. prev="It is me", new="It is me, Nick")
  if (normNew.startsWith(normPrev)) {
    return { action: 'replace', text: newText };
  }

  // 4. Word-level suffix-prefix overlap check (Whisper sliding window overlap)
  // (e.g. prev="The Json LD link data", new="link data section is really stupid")
  const wordsPrev = prevText.trim().split(/\s+/);
  const wordsNew = newText.trim().split(/\s+/);
  const normWordsPrev = wordsPrev.map(w => normalize(w));
  const normWordsNew = wordsNew.map(w => normalize(w));

  const maxCheck = Math.min(normWordsPrev.length, normWordsNew.length, 12);
  for (let k = maxCheck; k >= 2; k--) {
    const prevSuffix = normWordsPrev.slice(-k).join(' ');
    const newPrefix = normWordsNew.slice(0, k).join(' ');
    if (prevSuffix === newPrefix) {
      const remainingNewWords = wordsNew.slice(k);
      if (remainingNewWords.length === 0) {
        return { action: 'ignore' };
      }
      const stitched = wordsPrev.join(' ') + ' ' + remainingNewWords.join(' ');
      return { action: 'replace', text: stitched };
    }
  }

  // Check with 1-2 words offset in newText (e.g. "the link data" where "the" was added)
  for (let start = 1; start < Math.min(3, normWordsNew.length); start++) {
    for (let k = Math.min(normWordsPrev.length, normWordsNew.length - start, 8); k >= 2; k--) {
      const prevSuffix = normWordsPrev.slice(-k).join(' ');
      const newPart = normWordsNew.slice(start, start + k).join(' ');
      if (prevSuffix === newPart) {
        const remainingNewWords = wordsNew.slice(start + k);
        if (remainingNewWords.length === 0) {
          return { action: 'ignore' };
        }
        const stitched = wordsPrev.join(' ') + ' ' + remainingNewWords.join(' ');
        return { action: 'replace', text: stitched };
      }
    }
  }

  return { action: 'append' };
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', async () => {
  const chatFeed = document.getElementById('chat-feed');
  const chatWelcome = document.getElementById('chat-welcome');
  const btnToggleRecord = document.getElementById('btn-toggle-record');
  const recordBtnLabel = document.getElementById('record-btn-label');
  const recordStatusHint = document.getElementById('record-status-hint');
  const btnCopyAll = document.getElementById('btn-copy-all');
  const copyAllLabel = document.getElementById('copy-all-label');
  const btnClearChat = document.getElementById('btn-clear-chat');
  const btnPosCycle = document.getElementById('btn-pos-cycle');
  const posLabel = document.getElementById('pos-label');
  const btnCloseHud = document.getElementById('btn-close-hud');
  const btnVoiceCommands = document.getElementById('btn-voice-commands');
  const voiceCommandsModal = document.getElementById('voice-commands-modal');
  const btnCloseCommandsModal = document.getElementById('btn-close-commands-modal');
  const commandsSearchInput = document.getElementById('commands-search-input');
  const btnClearCommandsSearch = document.getElementById('btn-clear-commands-search');
  const commandsCountBadge = document.getElementById('commands-count-badge');
  const commandsListContainer = document.getElementById('commands-list-container');
  const filterTabBtns = document.querySelectorAll('.commands-tab-btn');

  let cachedCommands = [];
  let currentFilterTab = 'all';

  const positions = ['bottom-right', 'bottom-left', 'top-left', 'top-right'];
  const posShort = {
    'bottom-right': 'BR',
    'bottom-left': 'BL',
    'top-left': 'TL',
    'top-right': 'TR',
  };

  let currentPos = 'bottom-right';
  let isRecording = false;
  let currentInterimBubble = null;
  let silenceTimer = null;
  const finalizedMessages = [];

  // Load position from saved preferences
  if (window.robosVoiceHud && typeof window.robosVoiceHud.getPrefs === 'function') {
    try {
      const prefs = await window.robosVoiceHud.getPrefs();
      if (prefs && prefs.hudPosition) {
        currentPos = prefs.hudPosition;
        if (posLabel) posLabel.textContent = posShort[currentPos] || 'BR';
      }
    } catch {}
  }

  // Check initial recording status
  if (window.robosVoiceHud && typeof window.robosVoiceHud.getStatus === 'function') {
    try {
      const status = await window.robosVoiceHud.getStatus();
      updateRecordingUI(Boolean(status && status.active));
    } catch {}
  }

  function formatTime(isoOrDate = new Date()) {
    const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : (isoOrDate || new Date());
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function hideWelcome() {
    if (chatWelcome) {
      chatWelcome.style.display = 'none';
      chatWelcome.classList.add('hidden');
    }
  }

  function showWelcomeIfEmpty() {
    if (!chatFeed) return;
    const bubbles = chatFeed.querySelectorAll('.dictation-bubble:not(.interim)');
    if (bubbles.length === 0 && chatWelcome) {
      chatWelcome.style.display = 'flex';
      chatWelcome.classList.remove('hidden');
    }
  }

  function scrollToBottom() {
    if (chatFeed) {
      chatFeed.scrollTop = chatFeed.scrollHeight;
    }
  }

  function updateRecordingUI(active) {
    isRecording = Boolean(active);
    if (!btnToggleRecord) return;

    if (isRecording) {
      btnToggleRecord.classList.add('recording');
      btnToggleRecord.title = 'Stop Recording (Super+V)';
      if (recordBtnLabel) recordBtnLabel.textContent = 'Stop Recording';
      if (recordStatusHint) recordStatusHint.textContent = 'Recording live... Dictate naturally';
    } else {
      btnToggleRecord.classList.remove('recording');
      btnToggleRecord.title = 'Start Recording (Super+V)';
      if (recordBtnLabel) recordBtnLabel.textContent = 'Start Recording';
      if (recordStatusHint) recordStatusHint.textContent = 'Click to record or press Super+V';
    }
  }

  async function copyTextToClipboard(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {}
    // Fallback using temporary textarea
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand('copy');
      ta.remove();
      return true;
    } catch {}
    return false;
  }


  // Update or create live interim text bubble
  function updateInterimBubble(text) {
    const cleanText = (text || '').trim();
    if (!cleanText || !chatFeed) return;

    // Check against the last finalized message if it was finalized within the last 6 seconds
    const lastFinal = finalizedMessages[finalizedMessages.length - 1];
    const now = Date.now();
    if (lastFinal && (now - (lastFinal.ts || 0) < 6000)) {
      const merge = mergeWithPrevious(lastFinal.text, cleanText);
      if (merge.action === 'ignore') {
        if (currentInterimBubble) {
          currentInterimBubble.remove();
          currentInterimBubble = null;
        }
        return;
      }
      if (merge.action === 'replace') {
        lastFinal.text = merge.text;
        lastFinal.ts = now;
        const lastEl = chatFeed.querySelector(`[data-id="${lastFinal.id}"] .bubble-text`);
        if (lastEl) lastEl.textContent = merge.text;
        if (currentInterimBubble) {
          currentInterimBubble.remove();
          currentInterimBubble = null;
        }
        return;
      }
    }

    hideWelcome();

    if (!currentInterimBubble) {
      currentInterimBubble = document.createElement('div');
      currentInterimBubble.className = 'dictation-bubble interim';
      currentInterimBubble.innerHTML = `
        <div class="bubble-header">
          <span class="bubble-time">${formatTime()}</span>
          <span class="bubble-live-badge">
            <span class="live-dot"></span>
            <span>Listening</span>
          </span>
        </div>
        <div class="bubble-text">${escapeHtml(cleanText)}</div>`;
      chatFeed.appendChild(currentInterimBubble);
    } else {
      const textEl = currentInterimBubble.querySelector('.bubble-text');
      if (textEl) textEl.textContent = cleanText;
    }

    scrollToBottom();
  }

  function scheduleBubbleSettle(bubbleEl, text) {
    if (!bubbleEl) return;
    if (bubbleEl._settleTimer) {
      clearTimeout(bubbleEl._settleTimer);
    }
    bubbleEl._settleTimer = setTimeout(() => {
      bubbleEl._settleTimer = null;
      checkAndExecuteVoiceCommand(bubbleEl, text);
    }, 650);
  }

  async function checkAndExecuteVoiceCommand(bubbleEl, text) {
    if (!bubbleEl || bubbleEl._commandMatched) return;
    if (!window.robosVoiceHud || typeof window.robosVoiceHud.matchVoiceCommand !== 'function') return;

    const currentText = bubbleEl.querySelector('.bubble-text')?.textContent || text || '';
    if (!currentText.trim()) return;

    try {
      const match = await window.robosVoiceHud.matchVoiceCommand(currentText);
      if (!match || !match.matched || !match.command) {
        return;
      }

      bubbleEl._commandMatched = true;
      const cmd = match.command;

      // 1. Play bounce effect
      bubbleEl.classList.remove('command-matched-bounce');
      void bubbleEl.offsetWidth; // Force reflow to replay bounce animation
      bubbleEl.classList.add('command-matched-bounce');

      // 2. Format dialog bubble showing what command ran
      const typeLabel = cmd.targetType === 'app' ? 'App' : 'Skill';
      const typeClass = cmd.targetType === 'app' ? 'app' : 'skill';
      const cardEl = document.createElement('div');
      cardEl.className = 'bubble-command-card';
      cardEl.innerHTML = `
        <div class="command-card-header">
          <div class="command-card-title-group">
            <span class="command-card-icon">⚡</span>
            <span class="command-type-badge ${typeClass}">${typeLabel}</span>
            <span class="command-card-title" title="${escapeHtml(cmd.title)}">${escapeHtml(cmd.title)}</span>
          </div>
          <span class="command-status-badge running">
            <span class="live-dot"></span>
            <span>Executing</span>
          </span>
        </div>
        <div class="command-card-result">Executing <strong>${escapeHtml(cmd.title)}</strong>...</div>
      `;
      bubbleEl.appendChild(cardEl);
      scrollToBottom();

      // 3. Execute the command
      if (typeof window.robosVoiceHud.executeVoiceCommand === 'function') {
        const result = await window.robosVoiceHud.executeVoiceCommand(cmd.id, match.args, currentText);
        const statusBadge = cardEl.querySelector('.command-status-badge');
        const resultText = cardEl.querySelector('.command-card-result');

        if (result && result.ok) {
          if (statusBadge) {
            statusBadge.className = 'command-status-badge done';
            statusBadge.textContent = '✓ Done';
          }
          if (resultText) {
            resultText.innerHTML = escapeHtml(result.actionDone || result.response || `Successfully executed ${cmd.title}`);
          }
        } else {
          if (statusBadge) {
            statusBadge.className = 'command-status-badge failed';
            statusBadge.textContent = '✕ Error';
          }
          if (resultText) {
            resultText.textContent = (result && result.error) || 'Command failed or encountered an error';
          }
        }
        scrollToBottom();
      }
    } catch (err) {
      console.warn('Error checking voice command:', err);
    }
  }

  // Finalize an interim bubble into a permanent bubble with timestamp & copy button
  function finalizeBubble(text, time = new Date()) {
    const cleanText = (text || '').trim();
    if (!cleanText) {
      if (currentInterimBubble) {
        currentInterimBubble.remove();
        currentInterimBubble = null;
      }
      return;
    }

    const now = Date.now();
    const lastFinal = finalizedMessages[finalizedMessages.length - 1];

    if (lastFinal) {
      const merge = mergeWithPrevious(lastFinal.text, cleanText);
      if (merge.action === 'ignore') {
        if (currentInterimBubble) {
          currentInterimBubble.remove();
          currentInterimBubble = null;
        }
        return;
      }
      if (merge.action === 'replace') {
        lastFinal.text = merge.text;
        lastFinal.ts = now;
        const lastEl = chatFeed.querySelector(`[data-id="${lastFinal.id}"] .bubble-text`);
        if (lastEl) lastEl.textContent = merge.text;
        const lastBubble = chatFeed.querySelector(`[data-id="${lastFinal.id}"]`);
        if (lastBubble) {
          scheduleBubbleSettle(lastBubble, merge.text);
        }
        if (currentInterimBubble) {
          currentInterimBubble.remove();
          currentInterimBubble = null;
        }
        return;
      }
    }

    hideWelcome();

    const formattedTime = formatTime(time);
    const msgId = `msg-${now}-${Math.random().toString(36).slice(2, 6)}`;
    finalizedMessages.push({ id: msgId, text: cleanText, time: formattedTime, ts: now });

    let bubbleEl = currentInterimBubble;
    if (bubbleEl) {
      bubbleEl.className = 'dictation-bubble';
      bubbleEl.setAttribute('data-id', msgId);
      currentInterimBubble = null;
    } else {
      bubbleEl = document.createElement('div');
      bubbleEl.className = 'dictation-bubble';
      bubbleEl.setAttribute('data-id', msgId);
      chatFeed.appendChild(bubbleEl);
    }

    bubbleEl.innerHTML = `
      <div class="bubble-header">
        <span class="bubble-time">${formattedTime}</span>
        <button type="button" class="btn-copy-msg" title="Copy this message">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
          <span class="copy-label">Copy</span>
        </button>
      </div>
      <div class="bubble-text">${escapeHtml(cleanText)}</div>`;

    const copyBtn = bubbleEl.querySelector('.btn-copy-msg');
    const copyLabel = bubbleEl.querySelector('.copy-label');
    copyBtn?.addEventListener('click', async () => {
      const textToCopy = bubbleEl.querySelector('.bubble-text')?.textContent || cleanText;
      const ok = await copyTextToClipboard(textToCopy);
      if (ok && copyLabel) {
        copyLabel.textContent = 'Copied!';
        copyBtn.classList.add('copied');
        setTimeout(() => {
          copyLabel.textContent = 'Copy';
          copyBtn.classList.remove('copied');
        }, 1500);
      }
    });

    scheduleBubbleSettle(bubbleEl, cleanText);
    scrollToBottom();
  }

  // Toggle Record Button Click
  btnToggleRecord?.addEventListener('click', async () => {
    const nextState = !isRecording;
    updateRecordingUI(nextState);

    if (window.robosVoiceHud && typeof window.robosVoiceHud.toggleMic === 'function') {
      try {
        const res = await window.robosVoiceHud.toggleMic(nextState);
        if (res && res.active !== undefined) {
          updateRecordingUI(Boolean(res.active));
        }
      } catch (err) {
        console.warn('Failed to toggle mic:', err);
      }
    }
  });

  // Copy All Button Click
  btnCopyAll?.addEventListener('click', async () => {
    const bubbles = chatFeed?.querySelectorAll('.dictation-bubble:not(.interim)');
    if (!bubbles || bubbles.length === 0) {
      if (copyAllLabel) {
        copyAllLabel.textContent = 'Nothing to copy';
        setTimeout(() => { copyAllLabel.textContent = 'Copy All'; }, 1200);
      }
      return;
    }

    const lines = [];
    bubbles.forEach(b => {
      const time = b.querySelector('.bubble-time')?.textContent || '';
      const text = b.querySelector('.bubble-text')?.textContent || '';
      if (text.trim()) {
        lines.push(`[${time}] ${text.trim()}`);
      }
    });

    const fullContent = lines.join('\n');
    const ok = await copyTextToClipboard(fullContent);
    if (ok && copyAllLabel) {
      copyAllLabel.textContent = 'Copied All!';
      btnCopyAll.classList.add('copied');
      setTimeout(() => {
        copyAllLabel.textContent = 'Copy All';
        btnCopyAll.classList.remove('copied');
      }, 1500);
    }
  });

  // Clear Chat Feed
  btnClearChat?.addEventListener('click', () => {
    if (currentInterimBubble) {
      currentInterimBubble.remove();
      currentInterimBubble = null;
    }
    finalizedMessages.length = 0;
    if (chatFeed) {
      chatFeed.querySelectorAll('.dictation-bubble').forEach(b => b.remove());
      showWelcomeIfEmpty();
    }
  });

  // Position Cycle Button
  btnPosCycle?.addEventListener('click', async () => {
    const nextIndex = (positions.indexOf(currentPos) + 1) % positions.length;
    currentPos = positions[nextIndex];
    if (posLabel) posLabel.textContent = posShort[currentPos] || 'BR';
    if (window.robosVoiceHud && typeof window.robosVoiceHud.setHudPosition === 'function') {
      await window.robosVoiceHud.setHudPosition(currentPos);
    }
  });

  // Close Button
  btnCloseHud?.addEventListener('click', async () => {
    if (window.robosVoiceHud && typeof window.robosVoiceHud.hideHud === 'function') {
      await window.robosVoiceHud.hideHud();
    }
  });

  // ── Voice Activated Commands Configuration Modal ──────────────────────────────
  async function loadVoiceCommands() {
    if (window.robosVoiceHud && typeof window.robosVoiceHud.getVoiceCommands === 'function') {
      try {
        cachedCommands = await window.robosVoiceHud.getVoiceCommands();
      } catch (err) {
        console.warn('Failed to load voice commands:', err);
      }
    }
    if (commandsCountBadge) {
      commandsCountBadge.textContent = cachedCommands.length;
    }
  }

  function renderVoiceCommandsList() {
    if (!commandsListContainer) return;
    const query = normalize(commandsSearchInput?.value || '');

    let list = cachedCommands;
    if (currentFilterTab === 'apps') {
      list = list.filter(c => c.targetType === 'app');
    } else if (currentFilterTab === 'skills') {
      list = list.filter(c => c.targetType === 'skill');
    }

    if (query) {
      list = list.filter(c => {
        if (normalize(c.title).includes(query)) return true;
        if (normalize(c.description).includes(query)) return true;
        if (normalize(c.targetId).includes(query)) return true;
        return Array.isArray(c.matchers) && c.matchers.some(m => normalize(m).includes(query));
      });
    }

    if (list.length === 0) {
      commandsListContainer.innerHTML = `
        <div class="commands-empty-state">
          No voice commands matching "${escapeHtml(commandsSearchInput?.value || '')}"
        </div>`;
      return;
    }

    commandsListContainer.innerHTML = '';
    list.forEach(cmd => {
      const card = document.createElement('div');
      card.className = 'command-item-card';

      const typeLabel = cmd.targetType === 'app' ? 'App' : 'Skill';
      const typeClass = cmd.targetType === 'app' ? 'app' : 'skill';

      const phrasesHtml = (cmd.matchers || []).slice(0, 4).map(p =>
        `<span class="cmd-phrase-badge" data-phrase="${escapeHtml(p)}" title="Click to dictate: &quot;${escapeHtml(p)}&quot;">&ldquo;${escapeHtml(p)}&rdquo;</span>`
      ).join('');

      card.innerHTML = `
        <div class="command-item-top">
          <div class="command-item-title-wrap">
            <span class="command-type-badge ${typeClass}">${typeLabel}</span>
            <span class="command-item-title">${escapeHtml(cmd.title)}</span>
          </div>
          <button type="button" class="btn-test-cmd" data-phrase="${escapeHtml(cmd.matchers?.[0] || cmd.title)}">Test</button>
        </div>
        <div class="command-item-desc">${escapeHtml(cmd.description || '')}</div>
        <div class="command-item-phrases">${phrasesHtml}</div>
      `;

      card.querySelector('.btn-test-cmd')?.addEventListener('click', (e) => {
        const phrase = e.currentTarget.getAttribute('data-phrase');
        testCommandPhrase(phrase);
      });

      card.querySelectorAll('.cmd-phrase-badge').forEach(badge => {
        badge.addEventListener('click', (e) => {
          const phrase = e.currentTarget.getAttribute('data-phrase');
          testCommandPhrase(phrase);
        });
      });

      commandsListContainer.appendChild(card);
    });
  }

  function testCommandPhrase(phrase) {
    if (!phrase) return;
    if (voiceCommandsModal) {
      voiceCommandsModal.classList.add('hidden');
    }
    btnVoiceCommands?.classList.remove('active');
    finalizeBubble(phrase);
  }

  btnVoiceCommands?.addEventListener('click', async () => {
    if (!voiceCommandsModal) return;
    const isHidden = voiceCommandsModal.classList.contains('hidden');
    if (isHidden) {
      voiceCommandsModal.classList.remove('hidden');
      btnVoiceCommands.classList.add('active');
      if (cachedCommands.length === 0) {
        await loadVoiceCommands();
      }
      renderVoiceCommandsList();
      commandsSearchInput?.focus();
    } else {
      voiceCommandsModal.classList.add('hidden');
      btnVoiceCommands.classList.remove('active');
    }
  });

  btnCloseCommandsModal?.addEventListener('click', () => {
    voiceCommandsModal?.classList.add('hidden');
    btnVoiceCommands?.classList.remove('active');
  });

  commandsSearchInput?.addEventListener('input', () => {
    const val = commandsSearchInput.value || '';
    if (btnClearCommandsSearch) {
      if (val.trim()) {
        btnClearCommandsSearch.classList.remove('hidden');
      } else {
        btnClearCommandsSearch.classList.add('hidden');
      }
    }
    renderVoiceCommandsList();
  });

  btnClearCommandsSearch?.addEventListener('click', () => {
    if (commandsSearchInput) {
      commandsSearchInput.value = '';
      commandsSearchInput.focus();
    }
    btnClearCommandsSearch.classList.add('hidden');
    renderVoiceCommandsList();
  });

  filterTabBtns.forEach(tabBtn => {
    tabBtn.addEventListener('click', () => {
      filterTabBtns.forEach(b => b.classList.remove('active'));
      tabBtn.classList.add('active');
      currentFilterTab = tabBtn.getAttribute('data-tab') || 'all';
      renderVoiceCommandsList();
    });
  });

  // Preload voice commands on startup
  loadVoiceCommands();

  // IPC Event Listeners from Main Process
  if (window.robosVoiceHud) {
    // 1. Live interim speech stream (words being spoken in real-time)
    window.robosVoiceHud.onInterimText((evt = {}) => {
      const text = (evt.text || '').trim();
      if (!text) return;
      updateInterimBubble(text);

      if (silenceTimer) clearTimeout(silenceTimer);
      silenceTimer = setTimeout(() => {
        if (currentInterimBubble) {
          const interimText = currentInterimBubble.querySelector('.bubble-text')?.textContent || '';
          if (interimText.trim()) finalizeBubble(interimText);
        }
      }, 12000);
    });

    // 2. Finalized speech stream
    window.robosVoiceHud.onStreamText((evt = {}) => {
      const text = (evt.text || '').trim();
      if (!text) return;

      if (evt.isFinal) {
        if (silenceTimer) clearTimeout(silenceTimer);
        finalizeBubble(text);
      } else {
        updateInterimBubble(text);
      }
    });

    // 3. Recording state changes (e.g. from hotkey Super+V)
    if (typeof window.robosVoiceHud.onRecordingState === 'function') {
      window.robosVoiceHud.onRecordingState((evt = {}) => {
        updateRecordingUI(Boolean(evt && evt.active));
      });
    }
  }
});
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    normalize,
    mergeWithPrevious,
  };
}

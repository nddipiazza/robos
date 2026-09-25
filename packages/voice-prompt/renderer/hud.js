'use strict';

document.addEventListener('DOMContentLoaded', async () => {
  const chatFeed = document.getElementById('chat-feed');
  const chatWelcome = document.getElementById('chat-welcome');
  const chatForm = document.getElementById('chat-form');
  const chatInput = document.getElementById('chat-input');
  const btnChatSend = document.getElementById('btn-chat-send');
  const btnToggleMic = document.getElementById('btn-toggle-mic');
  const btnClearChat = document.getElementById('btn-clear-chat');
  const btnPosCycle = document.getElementById('btn-pos-cycle');
  const posLabel = document.getElementById('pos-label');
  const btnCloseHud = document.getElementById('btn-close-hud');
  const hudStatusBadge = document.getElementById('hud-status-badge');
  const hudStatusText = document.getElementById('hud-status-text');

  const positions = ['bottom-right', 'bottom-left', 'top-left', 'top-right'];
  const posShort = {
    'bottom-right': 'BR',
    'bottom-left': 'BL',
    'top-left': 'TL',
    'top-right': 'TR',
  };

  let currentPos = 'bottom-right';
  let micActive = true;
  let currentInterimEl = null;
  let thinkingBubbleEl = null;
  let silenceTimer = null;
  let lastAssistantResponse = null;

  // Initialize from saved prefs
  if (window.robosVoiceHud && typeof window.robosVoiceHud.getPrefs === 'function') {
    try {
      const prefs = await window.robosVoiceHud.getPrefs();
      if (prefs && prefs.hudPosition) {
        currentPos = prefs.hudPosition;
        if (posLabel) posLabel.textContent = posShort[currentPos] || 'BR';
      }
    } catch {}
  }

  // Load existing assistant history if any
  if (window.robosVoiceHud && typeof window.robosVoiceHud.getAssistantHistory === 'function') {
    try {
      const history = await window.robosVoiceHud.getAssistantHistory();
      if (Array.isArray(history) && history.length > 0) {
        history.slice(-10).forEach(turn => {
          if (turn.query) appendUserBubble(turn.query, false);
          if (turn.response) appendAssistantBubble(turn.response, turn.actionDone);
        });
      }
    } catch {}
  }

  // Helper: Escape HTML
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatTime(isoString) {
    const d = isoString ? new Date(isoString) : new Date();
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function hideWelcome() {
    if (chatWelcome && !chatWelcome.classList.contains('hidden')) {
      chatWelcome.style.display = 'none';
      chatWelcome.classList.add('hidden');
    }
  }

  function showWelcomeIfEmpty() {
    if (!chatFeed) return;
    const bubbles = chatFeed.querySelectorAll('.chat-bubble');
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

  // State Management
  function setAssistantState(state) {
    if (!hudStatusBadge || !hudStatusText) return;
    const cleanState = (state || 'IDLE').toUpperCase();
    hudStatusText.textContent = cleanState;

    hudStatusBadge.className = 'hud-status-badge';
    if (cleanState === 'LISTENING') {
      hudStatusBadge.classList.add('listening');
      hideThinking();
    } else if (cleanState === 'PROCESSING') {
      hudStatusBadge.classList.add('processing');
      showThinking();
    } else if (cleanState === 'SPEAKING') {
      hudStatusBadge.classList.add('speaking');
      hideThinking();
    } else {
      hudStatusBadge.classList.add('idle');
      hideThinking();
    }
  }

  // Thinking Bubble Indicator
  function showThinking() {
    if (thinkingBubbleEl || !chatFeed) return;
    hideWelcome();
    thinkingBubbleEl = document.createElement('div');
    thinkingBubbleEl.className = 'chat-bubble thinking';
    thinkingBubbleEl.innerHTML = `
      <div class="dot-wave">
        <span></span>
        <span></span>
        <span></span>
      </div>`;
    chatFeed.appendChild(thinkingBubbleEl);
    scrollToBottom();
  }

  function hideThinking() {
    if (thinkingBubbleEl) {
      thinkingBubbleEl.remove();
      thinkingBubbleEl = null;
    }
  }

  // User Bubble Creation & Live Interim Updates
  function appendUserBubble(text, isInterim = false) {
    const cleanText = (text || '').trim();
    if (!cleanText || !chatFeed) return;

    hideWelcome();

    if (isInterim) {
      if (currentInterimEl) {
        const textSpan = currentInterimEl.querySelector('.bubble-text');
        if (textSpan) textSpan.textContent = cleanText;
      } else {
        const bubble = document.createElement('div');
        bubble.className = 'chat-bubble user interim';
        bubble.innerHTML = `
          <span class="bubble-text">${escapeHtml(cleanText)}</span>
          <span class="bubble-live-dots"><span></span><span></span><span></span></span>`;
        chatFeed.appendChild(bubble);
        currentInterimEl = bubble;
      }
    } else {
      if (currentInterimEl) {
        const textSpan = currentInterimEl.querySelector('.bubble-text');
        if (textSpan) textSpan.textContent = cleanText;
        currentInterimEl.classList.remove('interim');
        const liveDots = currentInterimEl.querySelector('.bubble-live-dots');
        if (liveDots) liveDots.remove();
        currentInterimEl = null;
      } else {
        const bubble = document.createElement('div');
        bubble.className = 'chat-bubble user';
        bubble.innerHTML = `<span class="bubble-text">${escapeHtml(cleanText)}</span>`;
        chatFeed.appendChild(bubble);
      }
    }

    scrollToBottom();
  }

  function finalizeInterimBubble() {
    if (currentInterimEl) {
      currentInterimEl.classList.remove('interim');
      const liveDots = currentInterimEl.querySelector('.bubble-live-dots');
      if (liveDots) liveDots.remove();
      currentInterimEl = null;
    }
  }

  // Assistant Bubble Creation
  function appendAssistantBubble(text, actionDone = null) {
    const cleanText = (text || '').trim();
    if (!cleanText || !chatFeed) return;

    hideWelcome();
    hideThinking();
    finalizeInterimBubble();

    // Deduplicate rapid repeat rendering
    if (lastAssistantResponse === cleanText) return;
    lastAssistantResponse = cleanText;
    setTimeout(() => { if (lastAssistantResponse === cleanText) lastAssistantResponse = null; }, 1000);

    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble assistant';

    let actionHtml = '';
    if (actionDone) {
      actionHtml = `<div class="action-tag">⚡ ${escapeHtml(actionDone)}</div>`;
    }

    bubble.innerHTML = `
      <div class="bubble-header">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span>RobOS Voice</span>
      </div>
      <div class="bubble-text">${escapeHtml(cleanText)}</div>
      ${actionHtml}
      <div class="bubble-meta-row">
        <span>${formatTime()}</span>
        <button type="button" class="btn-replay-audio" title="Play audio response">🔊 Play</button>
      </div>`;

    bubble.querySelector('.btn-replay-audio')?.addEventListener('click', () => {
      if (window.robosVoiceHud && typeof window.robosVoiceHud.speak === 'function') {
        window.robosVoiceHud.speak(cleanText);
      }
    });

    chatFeed.appendChild(bubble);
    scrollToBottom();
  }

  // Submit User Message
  async function submitQuery(queryText) {
    const text = (queryText || '').trim();
    if (!text) return;

    if (silenceTimer) clearTimeout(silenceTimer);
    appendUserBubble(text, false);
    setAssistantState('PROCESSING');

    if (window.robosVoiceHud && typeof window.robosVoiceHud.askAssistant === 'function') {
      try {
        const res = await window.robosVoiceHud.askAssistant(text);
        if (res && res.turn) {
          appendAssistantBubble(res.turn.response || 'Done.', res.turn.actionDone);
        }
      } catch (err) {
        appendAssistantBubble(`Error: ${err.message}`);
      } finally {
        setAssistantState('IDLE');
      }
    }
  }

  // Chat Form Submit
  chatForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = (chatInput?.value || '').trim();
    if (text) {
      chatInput.value = '';
      submitQuery(text);
    }
  });

  // Quick Chips
  document.querySelectorAll('.quick-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const prompt = chip.getAttribute('data-prompt');
      if (prompt) submitQuery(prompt);
    });
  });

  // Clear Chat History
  btnClearChat?.addEventListener('click', async () => {
    if (silenceTimer) clearTimeout(silenceTimer);
    currentInterimEl = null;
    hideThinking();
    if (chatFeed) {
      const bubbles = chatFeed.querySelectorAll('.chat-bubble');
      bubbles.forEach(b => b.remove());
      showWelcomeIfEmpty();
    }
    if (window.robosVoiceHud && typeof window.robosVoiceHud.clearAssistantHistory === 'function') {
      await window.robosVoiceHud.clearAssistantHistory();
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

  // Toggle Mic Button
  btnToggleMic?.addEventListener('click', async () => {
    micActive = !micActive;
    if (micActive) {
      btnToggleMic.classList.add('active');
      btnToggleMic.title = 'Microphone Active';
    } else {
      btnToggleMic.classList.remove('active');
      btnToggleMic.title = 'Microphone Muted';
    }
    if (window.robosVoiceHud && typeof window.robosVoiceHud.toggleMic === 'function') {
      await window.robosVoiceHud.toggleMic(micActive);
    }
  });

  // Handle incoming IPC events from main process
  if (window.robosVoiceHud) {
    // 1. Wake Greeting from voice assistant
    window.robosVoiceHud.onWakeGreeting((evt = {}) => {
      const greeting = evt.greeting || "I hear you, what's up?";
      appendAssistantBubble(greeting);
      setAssistantState('LISTENING');
      if (chatInput) chatInput.focus();
    });

    // 2. Continuous Speech Stream & Fast Silence Detection
    window.robosVoiceHud.onStreamText((evt = {}) => {
      const text = (evt.text || '').trim();
      if (!text) return;

      if (evt.isFinal) {
        if (silenceTimer) clearTimeout(silenceTimer);
        appendUserBubble(text, false);
      } else {
        appendUserBubble(text, true);

        // Responsive silence timer: if user stops speaking for 800ms, finalize user bubble
        if (silenceTimer) clearTimeout(silenceTimer);
        silenceTimer = setTimeout(() => {
          finalizeInterimBubble();
        }, 800);
      }

      if (evt.state) {
        setAssistantState(evt.state);
      }
    });

    // 3. Interim Speech Updates
    window.robosVoiceHud.onInterimText((evt = {}) => {
      const text = (evt.text || '').trim();
      if (!text) return;
      appendUserBubble(text, true);

      if (silenceTimer) clearTimeout(silenceTimer);
      silenceTimer = setTimeout(() => {
        finalizeInterimBubble();
      }, 800);
    });

    // 4. Assistant State Change
    window.robosVoiceHud.onAssistantState((evt = {}) => {
      setAssistantState(evt.state);
    });

    // 5. Assistant Turn Completed
    window.robosVoiceHud.onAssistantTurn((turn = {}) => {
      if (turn.query) {
        appendUserBubble(turn.query, false);
      }
      if (turn.response) {
        appendAssistantBubble(turn.response, turn.actionDone);
      }
      setAssistantState('IDLE');
    });

    // 6. Action Done Event
    window.robosVoiceHud.onActionDone((evt = {}) => {
      if (evt.response) {
        appendAssistantBubble(evt.response, evt.actionDone);
      }
    });
  }
});

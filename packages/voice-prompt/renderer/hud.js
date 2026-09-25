'use strict';

document.addEventListener('DOMContentLoaded', async () => {
  const btnCloseHud = document.getElementById('btn-close-hud');
  const btnPosCycle = document.getElementById('btn-pos-cycle');
  const posLabel = document.getElementById('pos-label');
  const hudStatusBadge = document.getElementById('hud-status-badge');
  const hudStatusText = document.getElementById('hud-status-text');
  const hudGreeting = document.getElementById('hud-greeting');
  const hudWaveform = document.getElementById('hud-waveform');
  const transcriptText = document.getElementById('transcript-text');
  const hudActionCard = document.getElementById('hud-action-card');
  const actionTitle = document.getElementById('action-title');
  const actionDetail = document.getElementById('action-detail');
  const btnStopAudio = document.getElementById('btn-stop-audio');
  const btnToggleMic = document.getElementById('btn-toggle-mic');
  const micLabel = document.getElementById('mic-label');
  const btnHelloRobos = document.getElementById('btn-hello-robos');
  const hudCmdInput = document.getElementById('hud-cmd-input');
  const btnHudSend = document.getElementById('btn-hud-send');

  const positions = ['bottom-right', 'bottom-left', 'top-left', 'top-right'];
  const posShort = {
    'bottom-right': 'BR',
    'bottom-left': 'BL',
    'top-left': 'TL',
    'top-right': 'TR',
  };

  let currentPos = 'bottom-right';
  let micActive = true;

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

  // Position Cycle Button
  if (btnPosCycle) {
    btnPosCycle.addEventListener('click', async () => {
      const nextIndex = (positions.indexOf(currentPos) + 1) % positions.length;
      currentPos = positions[nextIndex];
      if (posLabel) posLabel.textContent = posShort[currentPos] || 'BR';
      if (window.robosVoiceHud && typeof window.robosVoiceHud.setHudPosition === 'function') {
        await window.robosVoiceHud.setHudPosition(currentPos);
      }
    });
  }

  // Close Button
  if (btnCloseHud) {
    btnCloseHud.addEventListener('click', async () => {
      if (window.robosVoiceHud && typeof window.robosVoiceHud.hideHud === 'function') {
        await window.robosVoiceHud.hideHud();
      }
    });
  }

  // Stop Audio Button
  if (btnStopAudio) {
    btnStopAudio.addEventListener('click', async () => {
      if (window.robosVoiceHud && typeof window.robosVoiceHud.stopTts === 'function') {
        await window.robosVoiceHud.stopTts();
      }
      setAssistantState('IDLE');
    });
  }

  // Toggle Mic Button
  if (btnToggleMic) {
    btnToggleMic.addEventListener('click', async () => {
      micActive = !micActive;
      if (micActive) {
        btnToggleMic.classList.add('active');
        if (micLabel) micLabel.textContent = 'Mic ON';
      } else {
        btnToggleMic.classList.remove('active');
        if (micLabel) micLabel.textContent = 'Mic OFF';
      }
      if (window.robosVoiceHud && typeof window.robosVoiceHud.toggleMic === 'function') {
        await window.robosVoiceHud.toggleMic(micActive);
      }
    });
  }

  // Hello RobOS Button (Click to trigger wake greeting)
  if (btnHelloRobos) {
    btnHelloRobos.addEventListener('click', async () => {
      setAssistantState('LISTENING');
      if (hudCmdInput) hudCmdInput.focus();
      if (window.robosVoiceHud && typeof window.robosVoiceHud.triggerWakeWord === 'function') {
        await window.robosVoiceHud.triggerWakeWord();
      }
    });
  }

  // Command Send & Receive Execution
  const executeHudCommand = async () => {
    let cmd = (hudCmdInput?.value || '').trim();
    if (!cmd && transcriptText && transcriptText.textContent !== 'Listening for speech...') {
      cmd = transcriptText.textContent.trim();
    }
    if (!cmd) cmd = '10-4';
    if (hudCmdInput) hudCmdInput.value = '';

    setAssistantState('PROCESSING');
    if (transcriptText) {
      transcriptText.textContent = `Executing: "${cmd}"...`;
      transcriptText.classList.add('highlight');
    }

    if (window.robosVoiceHud && typeof window.robosVoiceHud.askAssistant === 'function') {
      try {
        const res = await window.robosVoiceHud.askAssistant(cmd);
        if (res && res.turn) {
          if (hudActionCard && actionTitle && actionDetail) {
            actionTitle.textContent = res.turn.actionDone || 'Action Executed';
            actionDetail.textContent = res.turn.response || '';
            hudActionCard.classList.remove('hidden');
          }
          if (transcriptText) {
            transcriptText.textContent = res.turn.response || 'Done.';
          }
        }
      } catch (err) {
        if (actionDetail) actionDetail.textContent = `Error: ${err.message}`;
      }
    }
  };

  btnHudSend?.addEventListener('click', executeHudCommand);
  hudCmdInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') executeHudCommand();
  });

  // State Management Helper
  function setAssistantState(state) {
    if (!hudStatusBadge || !hudStatusText) return;
    const cleanState = (state || 'IDLE').toUpperCase();
    hudStatusText.textContent = cleanState;

    hudStatusBadge.className = 'hud-status-badge';
    if (cleanState === 'LISTENING') {
      hudStatusBadge.classList.add('listening');
      if (hudWaveform) hudWaveform.classList.add('active');
    } else if (cleanState === 'PROCESSING') {
      hudStatusBadge.classList.add('processing');
      if (hudWaveform) hudWaveform.classList.remove('active');
    } else if (cleanState === 'SPEAKING') {
      hudStatusBadge.classList.add('speaking');
      if (hudWaveform) hudWaveform.classList.add('active');
    } else {
      hudStatusBadge.classList.add('idle');
      if (hudWaveform) hudWaveform.classList.remove('active');
    }
  }

  // Wire incoming IPC events
  if (window.robosVoiceHud) {
    // 1. Wake Greeting
    window.robosVoiceHud.onWakeGreeting((evt = {}) => {
      const greeting = evt.greeting || "I hear you, what's up? let me know when you're done with a 10/4 or say Done!";
      if (hudGreeting) {
        hudGreeting.textContent = `"${greeting}"`;
      }
      if (transcriptText) {
        transcriptText.textContent = 'Listening for speech...';
        transcriptText.classList.remove('highlight');
      }
      if (hudActionCard) {
        hudActionCard.classList.add('hidden');
      }
      if (hudCmdInput) {
        hudCmdInput.focus();
      }
      setAssistantState('LISTENING');
    });

    // 2. Live Streaming Text
    window.robosVoiceHud.onStreamText((evt = {}) => {
      const text = (evt.text || '').trim();
      if (transcriptText && text) {
        transcriptText.textContent = text;
        transcriptText.classList.add('highlight');
      }
      if (hudCmdInput && text && !hudCmdInput.matches(':focus')) {
        hudCmdInput.value = text;
      }
      if (evt.state) {
        setAssistantState(evt.state);
      }
    });

    // 3. Interim Text
    window.robosVoiceHud.onInterimText((evt = {}) => {
      const text = (evt.text || '').trim();
      if (transcriptText && text) {
        transcriptText.textContent = text;
        transcriptText.classList.add('highlight');
      }
    });

    // 4. Assistant State Change
    window.robosVoiceHud.onAssistantState((evt = {}) => {
      setAssistantState(evt.state);
      if (evt.query && transcriptText) {
        transcriptText.textContent = evt.query;
      }
    });

    // 5. Action Executed Card
    window.robosVoiceHud.onActionDone((evt = {}) => {
      if (hudActionCard && actionTitle && actionDetail) {
        actionTitle.textContent = evt.actionDone || 'Action Done';
        actionDetail.textContent = evt.response || '';
        hudActionCard.classList.remove('hidden');
      }
    });
  }
});

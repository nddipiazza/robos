'use strict';

document.addEventListener('DOMContentLoaded', async () => {
  const countBadge = document.getElementById('commands-count-badge');
  const searchInput = document.getElementById('commands-search-input');
  const btnClearSearch = document.getElementById('btn-clear-search');
  const btnCloseWindow = document.getElementById('btn-close-window');
  const tabButtons = document.querySelectorAll('.category-tab-btn');
  const listContainer = document.getElementById('commands-list-container');
  const toastBanner = document.getElementById('toast-banner');
  const toastMessage = document.getElementById('toast-message');

  let allCommands = [];
  let currentCategory = 'all';
  let toastTimer = null;

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalize(str) {
    return (str || '').toLowerCase().trim();
  }

  function showToast(msg, durationMs = 3000) {
    if (!toastBanner || !toastMessage) return;
    toastMessage.textContent = msg;
    toastBanner.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastBanner.classList.add('hidden');
    }, durationMs);
  }

  async function loadCommands() {
    if (window.voiceCommandsApi && typeof window.voiceCommandsApi.getCommands === 'function') {
      try {
        allCommands = await window.voiceCommandsApi.getCommands();
      } catch (err) {
        console.warn('Failed to load commands:', err);
      }
    }
    if (countBadge) {
      countBadge.textContent = allCommands.length;
    }
    renderCommands();
  }

  function renderCommands() {
    if (!listContainer) return;
    const query = normalize(searchInput?.value || '');

    let filtered = allCommands;
    if (currentCategory === 'apps') {
      filtered = filtered.filter(c => c.targetType === 'app');
    } else if (currentCategory === 'skills') {
      filtered = filtered.filter(c => c.targetType === 'skill');
    }

    if (query) {
      filtered = filtered.filter(c => {
        if (normalize(c.title).includes(query)) return true;
        if (normalize(c.description).includes(query)) return true;
        if (normalize(c.targetId).includes(query)) return true;
        return Array.isArray(c.matchers) && c.matchers.some(m => normalize(m).includes(query));
      });
    }

    if (filtered.length === 0) {
      listContainer.innerHTML = `
        <div class="empty-state">
          No voice commands matching "${escapeHtml(searchInput?.value || '')}"
        </div>`;
      return;
    }

    listContainer.innerHTML = '';
    filtered.forEach(cmd => {
      const card = document.createElement('div');
      card.className = 'command-card';

      const typeLabel = cmd.targetType === 'app' ? 'App' : 'Skill';
      const typeClass = cmd.targetType === 'app' ? 'app' : 'skill';

      const phrasesHtml = (cmd.matchers || []).slice(0, 5).map(p =>
        `<span class="cmd-phrase-pill" data-phrase="${escapeHtml(p)}" title="Click to test: &quot;${escapeHtml(p)}&quot;">&ldquo;${escapeHtml(p)}&rdquo;</span>`
      ).join('');

      card.innerHTML = `
        <div class="command-card-top">
          <div class="command-card-title-group">
            <span class="command-type-badge ${typeClass}">${typeLabel}</span>
            <span class="command-card-title">${escapeHtml(cmd.title)}</span>
            <span class="command-target-pill">${escapeHtml(cmd.targetId)}</span>
          </div>
          <button type="button" class="btn-test-card" data-phrase="${escapeHtml(cmd.matchers?.[0] || cmd.title)}">Test</button>
        </div>
        <div class="command-card-desc">${escapeHtml(cmd.description || '')}</div>
        <div class="command-phrases-group">
          <span class="phrases-label">Spoken Triggers:</span>
          ${phrasesHtml}
        </div>
      `;

      card.querySelector('.btn-test-card')?.addEventListener('click', (e) => {
        const phrase = e.currentTarget.getAttribute('data-phrase');
        testPhrase(phrase);
      });

      card.querySelectorAll('.cmd-phrase-pill').forEach(pill => {
        pill.addEventListener('click', (e) => {
          const phrase = e.currentTarget.getAttribute('data-phrase');
          testPhrase(phrase);
        });
      });

      listContainer.appendChild(card);
    });
  }

  async function testPhrase(phrase) {
    if (!phrase) return;
    showToast(`⚡ Sent to RobOS Voice HUD: "${phrase}"`);
    if (window.voiceCommandsApi && typeof window.voiceCommandsApi.testPhrase === 'function') {
      await window.voiceCommandsApi.testPhrase(phrase);
    }
  }

  // Search input events
  searchInput?.addEventListener('input', () => {
    const val = searchInput.value || '';
    if (btnClearSearch) {
      if (val.trim()) {
        btnClearSearch.classList.remove('hidden');
      } else {
        btnClearSearch.classList.add('hidden');
      }
    }
    renderCommands();
  });

  btnClearSearch?.addEventListener('click', () => {
    if (searchInput) {
      searchInput.value = '';
      searchInput.focus();
    }
    btnClearSearch.classList.add('hidden');
    renderCommands();
  });

  // Category tab switching
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentCategory = btn.getAttribute('data-tab') || 'all';
      renderCommands();
    });
  });

  // Close button & Escape key
  btnCloseWindow?.addEventListener('click', () => {
    if (window.voiceCommandsApi && typeof window.voiceCommandsApi.closeWindow === 'function') {
      window.voiceCommandsApi.closeWindow();
    } else {
      window.close();
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (window.voiceCommandsApi && typeof window.voiceCommandsApi.closeWindow === 'function') {
        window.voiceCommandsApi.closeWindow();
      } else {
        window.close();
      }
    }
  });

  const settingsTabs = [...document.querySelectorAll('[role="tab"]')];
  function selectTab(tab) {
    if (tab.id !== 'tab-device') stopMicrophoneTest();
    settingsTabs.forEach(button => {
      const selected = button === tab;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
      document.getElementById(button.getAttribute('aria-controls')).hidden = !selected;
    });
  }
  settingsTabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTab(tab));
    tab.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % settingsTabs.length;
      if (event.key === 'ArrowLeft') next = (index + settingsTabs.length - 1) % settingsTabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = settingsTabs.length - 1;
      if (next === undefined) return;
      event.preventDefault();
      selectTab(settingsTabs[next]);
      settingsTabs[next].focus();
    });
  });

  const deviceSelect = document.getElementById('select-settings-device');
  const refreshDevices = document.getElementById('btn-refresh-devices');
  const saveDevice = document.getElementById('btn-save-device');
  const deviceStatus = document.getElementById('device-status');
  const testDevice = document.getElementById('btn-test-device');
  const testStatus = document.getElementById('microphone-test-status');
  const wave = document.getElementById('microphone-wave');
  const ctx = wave.getContext('2d');
  let testing = false;
  let testGeneration = 0;
  function drawWave(samples = []) {
    ctx.clearRect(0, 0, wave.width, wave.height);
    ctx.strokeStyle = '#00bcd4';
    ctx.beginPath();
    ctx.moveTo(0, 45); ctx.lineTo(wave.width, 45);
    samples.forEach((sample, index) => {
      const height = Math.min(42, sample * 180);
      const x = (index + .5) * wave.width / samples.length;
      ctx.moveTo(x, 45 - height); ctx.lineTo(x, 45 + height);
    });
    ctx.stroke();
  }
  function resetTest(text = 'Microphone test stopped.') {
    testing = false;
    testDevice.textContent = 'Test microphone';
    testDevice.setAttribute('aria-pressed', 'false');
    testStatus.textContent = text;
    drawWave();
  }
  function stopMicrophoneTest() {
    testGeneration++;
    if (testing) window.voiceCommandsApi.stopMicrophoneTest().catch(() => {});
    resetTest();
  }
  window.voiceCommandsApi.onMicrophoneTestData(data => {
    if (data.generation !== testGeneration) return;
    if (data.error) { resetTest(`Could not test microphone: ${data.error}`); return; }
    if (data.stopped) { resetTest(); return; }
    if (!testing) return;
    drawWave(data.samples);
    wave.dataset.frames = String(Number(wave.dataset.frames || 0) + 1);
    testStatus.textContent = data.level > .005 ? 'Microphone is receiving sound.' : 'Listening — speak into your microphone.';
  });
  testDevice.addEventListener('click', async () => {
    if (testing) { stopMicrophoneTest(); return; }
    const generation = ++testGeneration;
    testing = true;
    testDevice.textContent = 'Stop test';
    testDevice.setAttribute('aria-pressed', 'true');
    testStatus.textContent = 'Starting microphone test… (stops automatically after 30 seconds)';
    wave.dataset.frames = '0';
    try {
      await window.voiceCommandsApi.startMicrophoneTest(deviceSelect.value, generation);
    } catch (error) {
      if (generation === testGeneration) resetTest(`Could not test microphone: ${error.message}`);
    }
  });
  window.addEventListener('beforeunload', stopMicrophoneTest);
  drawWave();
  function deviceMessage(text, error = false) {
    deviceStatus.textContent = text;
    deviceStatus.dataset.error = String(error);
  }
  async function loadDevices() {
    stopMicrophoneTest();
    testDevice.disabled = true;
    deviceSelect.disabled = saveDevice.disabled = refreshDevices.disabled = true;
    deviceMessage('Loading microphones…');
    try {
      const [devices, prefs] = await Promise.all([
        window.voiceCommandsApi.listDevices(), window.voiceCommandsApi.getPrefs(),
      ]);
      deviceSelect.replaceChildren();
      for (const device of devices) {
        deviceSelect.add(new Option(device.name, String(device.id)));
      }
      const savedId = String(prefs.configuredDevice || 'default');
      const selected = devices.find(device => device.legacyId === savedId)?.id || savedId;
      const available = devices.some(device => String(device.id) === selected);
      if (!available) {
        const missing = new Option(`Unavailable microphone (${selected})`, selected);
        missing.disabled = true;
        deviceSelect.add(missing);
      }
      deviceSelect.value = selected;
      deviceSelect.disabled = false;
      saveDevice.disabled = testDevice.disabled = !available;
      deviceMessage(available ? '' : 'The saved microphone is unavailable. Choose another input or refresh.', !available);
    } catch (error) {
      deviceMessage(`Could not load microphones: ${error.message}`, true);
    } finally {
      refreshDevices.disabled = false;
    }
  }
  deviceSelect.addEventListener('change', () => {
    stopMicrophoneTest();
    testDevice.disabled = false;
    saveDevice.disabled = false;
    deviceMessage('Selection not saved yet.');
  });
  refreshDevices.addEventListener('click', loadDevices);
  saveDevice.addEventListener('click', async () => {
    saveDevice.disabled = deviceSelect.disabled = refreshDevices.disabled = true;
    try {
      const saved = await window.voiceCommandsApi.savePrefs({ configuredDevice: deviceSelect.value });
      if (!saved || saved.configuredDevice !== deviceSelect.value) throw new Error('Device selection was not saved');
      deviceMessage('Microphone saved. It will be used for the next recording.');
    } catch (error) {
      deviceMessage(`Could not save microphone: ${error.message}`, true);
    } finally {
      saveDevice.disabled = deviceSelect.disabled = refreshDevices.disabled = false;
    }
  });

  // Initialize
  await loadDevices();
  await loadCommands();
});

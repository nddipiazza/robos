'use strict';

// DOM Elements
const speakerSelect = document.getElementById('speaker-select');
const btnScan = document.getElementById('btn-scan');
const volumeSlider = document.getElementById('volume-slider');
const volumeLabel = document.getElementById('volume-label');
const speakerStatusDot = document.getElementById('speaker-status-dot');
const btnStopAll = document.getElementById('btn-stop-all');

// Tab Navigation
const tabButtons = document.querySelectorAll('.tab-btn');
const tabPanes = document.querySelectorAll('.tab-pane');

// Tab 1: Voice Recorder Elements
const btnRecordToggle = document.getElementById('btn-record-toggle');
const recBtnText = document.getElementById('rec-btn-text');
const recordTimer = document.getElementById('record-timer');
const waveformCanvas = document.getElementById('waveform-canvas');
const recPreviewContainer = document.getElementById('rec-preview-container');
const recAudioPreview = document.getElementById('rec-audio-preview');
const btnSendRecording = document.getElementById('btn-send-recording');
const btnDiscardRecording = document.getElementById('btn-discard-recording');
const recPrependChime = document.getElementById('rec-prepend-chime');

// Tab 2: TTS Elements
const ttsTextInput = document.getElementById('tts-text-input');
const ttsVoiceSelect = document.getElementById('tts-voice-select');
const ttsSpeedSlider = document.getElementById('tts-speed');
const ttsSpeedVal = document.getElementById('tts-speed-val');
const ttsPrependChime = document.getElementById('tts-prepend-chime');
const btnTtsPreview = document.getElementById('btn-tts-preview');
const btnTtsCast = document.getElementById('btn-tts-cast');
const presetButtons = document.querySelectorAll('.preset-btn');

// Tab 3: File Elements
const btnBrowseFile = document.getElementById('btn-browse-file');
const fileDropzone = document.getElementById('file-dropzone');
const selectedFileCard = document.getElementById('selected-file-card');
const activeFileName = document.getElementById('active-file-name');
const activeFilePath = document.getElementById('active-file-path');
const btnCastSelectedFile = document.getElementById('btn-cast-selected-file');
const quickCastButtons = document.querySelectorAll('.btn-quick-cast');

// Tab 4: Soundboard Container
const soundboardContainer = document.getElementById('soundboard-container');

// Tab 5: Ambient Elements
const ambientTimer = document.getElementById('ambient-timer');
const ambientPlayButtons = document.querySelectorAll('.btn-ambient-play');

// Playback Bar
const playbackIndicator = document.getElementById('playback-indicator');
const playbackTitle = document.getElementById('playback-title');
const playbackTarget = document.getElementById('playback-target');
const btnFooterPause = document.getElementById('btn-footer-pause');
const btnFooterStop = document.getElementById('btn-footer-stop');

// State
let currentSelectedFile = null;
let mediaRecorder = null;
let audioChunks = [];
let audioContext = null;
let analyserNode = null;
let animFrameId = null;
let recordTimerInterval = null;
let recordStartTime = 0;
let recordedBlob = null;
let isRecording = false;
let isPlaying = false;

// 1. Tab Switching
tabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    tabButtons.forEach(b => b.classList.remove('active'));
    tabPanes.forEach(p => p.classList.remove('active'));

    btn.classList.add('active');
    const targetId = btn.dataset.tab;
    const targetPane = document.getElementById(targetId);
    if (targetPane) {
      targetPane.classList.add('active');
    }
  });
});

// 2. Speaker Discovery & Volume
async function loadSpeakers(probe = true) {
  try {
    let speakers = [];
    if (probe) {
      speakers = await window.robosSpeaker.probeSpeakers();
    } else {
      speakers = await window.robosSpeaker.getSpeakers();
    }

    if (!speakers || speakers.length === 0) {
      speakerSelect.innerHTML = `
        <option value="192.168.1.10">Kitchen speaker (192.168.1.10)</option>
        <option value="all">📢 All Speakers (Broadcast)</option>
      `;
      return;
    }

    const currentVal = speakerSelect.value;
    speakerSelect.innerHTML = '';

    speakers.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.ip;
      const isPe = s.modelCode === 'NC-VK-9727' || (s.model || '').includes('NC-VK-9727');
      const prefix = isPe ? '🎙️ ' : '';
      const badge = isPe ? ' [HA Voice PE]' : '';
      opt.textContent = `${prefix}${s.name || 'Smart Speaker'}${badge} (${s.ip}) ${s.online ? '• Online' : '• Offline'}`;
      if (s.ip === currentVal || (!currentVal && isPe)) {
        opt.selected = true;
      }
      speakerSelect.appendChild(opt);
    });

    // Add Broadcast All option
    const allOpt = document.createElement('option');
    allOpt.value = 'all';
    allOpt.textContent = '📢 All Speakers (Broadcast)';
    if (currentVal === 'all') allOpt.selected = true;
    speakerSelect.appendChild(allOpt);

    updateSpeakerStatusBadge();
  } catch (err) {
    console.warn('Error loading speakers:', err);
  }
}

function updateSpeakerStatusBadge() {
  const selectedIp = speakerSelect.value;
  playbackTarget.textContent = speakerSelect.options[speakerSelect.selectedIndex]?.textContent.split('(')[0].trim() || 'Kitchen speaker';
  speakerStatusDot.className = 'status-dot online';
}

speakerSelect.addEventListener('change', updateSpeakerStatusBadge);

btnScan.addEventListener('click', async () => {
  btnScan.disabled = true;
  btnScan.innerHTML = 'Scanning...';
  try {
    await window.robosSpeaker.scanSpeakers();
    await loadSpeakers(false);
  } finally {
    btnScan.disabled = false;
    btnScan.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
      Scan LAN
    `;
  }
});

volumeSlider.addEventListener('input', () => {
  const val = parseInt(volumeSlider.value, 10);
  volumeLabel.textContent = `${val}%`;
});

volumeSlider.addEventListener('change', async () => {
  const val = parseInt(volumeSlider.value, 10) / 100;
  const target = speakerSelect.value;
  try {
    await window.robosSpeaker.setVolume(target, val);
  } catch (err) {
    console.warn('Volume set error:', err);
  }
});

btnStopAll.addEventListener('click', async () => {
  try {
    await window.robosSpeaker.stopPlayback('all');
    setPlaybackState(false, 'Stopped');
  } catch (err) {
    console.warn('Stop error:', err);
  }
});

function setPlaybackState(active, title = 'Idle') {
  isPlaying = active;
  if (active) {
    playbackIndicator.classList.add('playing');
    playbackTitle.textContent = title;
    btnFooterPause.disabled = false;
    btnFooterStop.disabled = false;
  } else {
    playbackIndicator.classList.remove('playing');
    playbackTitle.textContent = title;
    btnFooterPause.disabled = true;
    btnFooterStop.disabled = true;
  }
}

btnFooterPause.addEventListener('click', async () => {
  const target = speakerSelect.value;
  await window.robosSpeaker.pausePlayback(target);
  playbackTitle.textContent = 'Paused';
});

btnFooterStop.addEventListener('click', async () => {
  const target = speakerSelect.value;
  await window.robosSpeaker.stopPlayback(target);
  setPlaybackState(false, 'Stopped');
});

// 3. Tab 1: Voice Intercom / Walkie-Talkie Recording
function initWaveformCanvas() {
  const ctx = waveformCanvas.getContext('2d');
  ctx.fillStyle = '#0d1117';
  ctx.fillRect(0, 0, waveformCanvas.width, waveformCanvas.height);
  ctx.strokeStyle = '#30363d';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, waveformCanvas.height / 2);
  ctx.lineTo(waveformCanvas.width, waveformCanvas.height / 2);
  ctx.stroke();
}

btnRecordToggle.addEventListener('click', async () => {
  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
});

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];
    isRecording = true;

    btnRecordToggle.classList.add('recording');
    recBtnText.textContent = 'Stop Recording';
    recPreviewContainer.classList.add('hidden');

    recordStartTime = Date.now();
    recordTimer.textContent = '00:00';
    recordTimerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - recordStartTime) / 1000);
      const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
      const secs = String(elapsed % 60).padStart(2, '0');
      recordTimer.textContent = `${mins}:${secs}`;
    }, 1000);

    // Audio context & waveform visualizer
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(stream);
    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 256;
    source.connect(analyserNode);

    drawWaveform();

    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        audioChunks.push(e.data);
      }
    };

    mediaRecorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      recordedBlob = new Blob(audioChunks, { type: 'audio/webm' });
      recAudioPreview.src = URL.createObjectURL(recordedBlob);
      recPreviewContainer.classList.remove('hidden');
    };

    mediaRecorder.start(100);
  } catch (err) {
    alert(`Microphone access error: ${err.message}`);
  }
}

function stopRecording() {
  isRecording = false;
  btnRecordToggle.classList.remove('recording');
  recBtnText.textContent = 'Record Voice Note';
  clearInterval(recordTimerInterval);

  if (animFrameId) cancelAnimationFrame(animFrameId);
  if (audioContext && audioContext.state !== 'closed') audioContext.close();

  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  initWaveformCanvas();
}

function drawWaveform() {
  if (!isRecording) return;
  const ctx = waveformCanvas.getContext('2d');
  const bufferLength = analyserNode.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  analyserNode.getByteTimeDomainData(dataArray);

  ctx.fillStyle = '#0d1117';
  ctx.fillRect(0, 0, waveformCanvas.width, waveformCanvas.height);
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#00bcd4';
  ctx.beginPath();

  const sliceWidth = waveformCanvas.width / bufferLength;
  let x = 0;

  for (let i = 0; i < bufferLength; i++) {
    const v = dataArray[i] / 128.0;
    const y = (v * waveformCanvas.height) / 2;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
    x += sliceWidth;
  }

  ctx.lineTo(waveformCanvas.width, waveformCanvas.height / 2);
  ctx.stroke();
  animFrameId = requestAnimationFrame(drawWaveform);
}

btnDiscardRecording.addEventListener('click', () => {
  recPreviewContainer.classList.add('hidden');
  recAudioPreview.src = '';
  recordedBlob = null;
  recordTimer.textContent = '00:00';
});

btnSendRecording.addEventListener('click', async () => {
  if (!recordedBlob) return;
  const target = speakerSelect.value;
  const prependChime = recPrependChime.checked;

  btnSendRecording.disabled = true;
  btnSendRecording.textContent = 'Sending...';

  try {
    const arrayBuffer = await recordedBlob.arrayBuffer();
    setPlaybackState(true, 'Voice Note Intercom');
    await window.robosSpeaker.castVoiceRecording(target, arrayBuffer, {
      format: 'webm',
      prependChime
    });
  } catch (err) {
    alert(`Error casting voice note: ${err.message}`);
    setPlaybackState(false, 'Error');
  } finally {
    btnSendRecording.disabled = false;
    btnSendRecording.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
      Send to Speaker
    `;
  }
});

// 4. Tab 2: TTS Announcer
ttsSpeedSlider.addEventListener('input', () => {
  ttsSpeedVal.textContent = `${ttsSpeedSlider.value}x`;
});

presetButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    ttsTextInput.value = btn.dataset.text;
    ttsTextInput.focus();
  });
});

btnTtsPreview.addEventListener('click', () => {
  const text = ttsTextInput.value.trim();
  if (!text) {
    alert('Please enter text to preview.');
    return;
  }
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = parseFloat(ttsSpeedSlider.value);
    window.speechSynthesis.speak(utt);
  } else {
    alert('Local browser speech synthesis not supported in this environment.');
  }
});

btnTtsCast.addEventListener('click', async () => {
  const text = ttsTextInput.value.trim();
  if (!text) {
    alert('Please enter text to broadcast.');
    return;
  }

  const target = speakerSelect.value;
  const voice = ttsVoiceSelect.value;
  const speed = parseFloat(ttsSpeedSlider.value);
  const prependChime = ttsPrependChime.checked;

  btnTtsCast.disabled = true;
  btnTtsCast.textContent = 'Broadcasting...';

  try {
    setPlaybackState(true, `TTS: "${text.slice(0, 25)}..."`);
    await window.robosSpeaker.castTTS(target, text, {
      voice,
      speed,
      prependChime
    });
  } catch (err) {
    alert(`TTS Broadcast Error: ${err.message}`);
    setPlaybackState(false, 'Error');
  } finally {
    btnTtsCast.disabled = false;
    btnTtsCast.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
      Broadcast to Speaker
    `;
  }
});

// 5. Tab 3: Custom Audio File
btnBrowseFile.addEventListener('click', async () => {
  const filePath = await window.robosSpeaker.openAudioFileDialog();
  if (filePath) {
    selectAudioFile(filePath);
  }
});

fileDropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  fileDropzone.classList.add('dragover');
});

fileDropzone.addEventListener('dragleave', () => {
  fileDropzone.classList.remove('dragover');
});

fileDropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  fileDropzone.classList.remove('dragover');
  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    const file = e.dataTransfer.files[0];
    if (file.path) {
      selectAudioFile(file.path);
    }
  }
});

function selectAudioFile(filePath) {
  currentSelectedFile = filePath;
  const parts = filePath.split('/');
  const name = parts[parts.length - 1];
  activeFileName.textContent = name;
  activeFilePath.textContent = filePath;
  selectedFileCard.classList.remove('hidden');
}

btnCastSelectedFile.addEventListener('click', async () => {
  if (!currentSelectedFile) return;
  const target = speakerSelect.value;
  btnCastSelectedFile.disabled = true;
  btnCastSelectedFile.textContent = 'Streaming...';

  try {
    setPlaybackState(true, activeFileName.textContent);
    await window.robosSpeaker.castFile(target, currentSelectedFile);
  } catch (err) {
    alert(`Error casting file: ${err.message}`);
    setPlaybackState(false, 'Error');
  } finally {
    btnCastSelectedFile.disabled = false;
    btnCastSelectedFile.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
      Cast to Speaker
    `;
  }
});

quickCastButtons.forEach(btn => {
  btn.addEventListener('click', async (e) => {
    const item = e.target.closest('.audio-clip-item');
    const target = speakerSelect.value;
    const name = item.dataset.name;

    btn.disabled = true;
    btn.textContent = 'Casting...';
    try {
      setPlaybackState(true, name);
      await window.robosSpeaker.playSound(target, 'witch_laugh');
    } catch (err) {
      alert(`Error playing clip: ${err.message}`);
      setPlaybackState(false, 'Error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Cast';
    }
  });
});

// 6. Tab 4: Soundboard
async function loadSoundboard() {
  try {
    const sounds = await window.robosSpeaker.listSounds();
    soundboardContainer.innerHTML = '';

    sounds.forEach(sound => {
      const card = document.createElement('div');
      card.className = 'sound-card';
      card.dataset.soundId = sound.id;
      card.innerHTML = `
        <span class="sound-icon">${sound.icon}</span>
        <span class="sound-name">${sound.name}</span>
        <span class="sound-desc">${sound.description}</span>
      `;

      card.addEventListener('click', async () => {
        const target = speakerSelect.value;
        card.style.borderColor = 'var(--accent)';
        setPlaybackState(true, sound.name);

        try {
          await window.robosSpeaker.playSound(target, sound.id);
        } catch (err) {
          console.warn('Sound error:', err);
        } finally {
          setTimeout(() => {
            card.style.borderColor = '';
          }, 800);
        }
      });

      soundboardContainer.appendChild(card);
    });
  } catch (err) {
    console.warn('Error loading soundboard:', err);
  }
}

// 7. Tab 5: Ambient
ambientPlayButtons.forEach(btn => {
  btn.addEventListener('click', async (e) => {
    const card = e.target.closest('.ambient-card');
    const ambientType = card.dataset.ambient;
    const duration = parseInt(ambientTimer.value, 10);
    const target = speakerSelect.value;
    const title = card.querySelector('h3').textContent;

    btn.disabled = true;
    btn.textContent = 'Generating...';

    try {
      setPlaybackState(true, `${title} (${duration}m)`);
      await window.robosSpeaker.playAmbient(target, ambientType, duration);
      btn.textContent = 'Playing';
    } catch (err) {
      alert(`Ambient error: ${err.message}`);
      setPlaybackState(false, 'Error');
      btn.textContent = 'Play Ambient';
    } finally {
      btn.disabled = false;
    }
  });
});

// 8. Tab 6: RobOS Media Player Music Library
const musicSearchInput = document.getElementById('music-search-input');
const btnRefreshLibrary = document.getElementById('btn-refresh-library');
const musicTracksContainer = document.getElementById('music-tracks-container');

function formatDuration(sec) {
  if (!sec || isNaN(sec)) return '--:--';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

async function loadMusicLibrary(query = '') {
  try {
    const tracks = await window.robosSpeaker.searchLibrary(query);
    musicTracksContainer.innerHTML = '';

    // Update schedule form music dropdown as well
    const schedMusicSelect = document.getElementById('sched-music-select');
    if (schedMusicSelect) {
      schedMusicSelect.innerHTML = '';
      tracks.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = `${t.title || 'Untitled'} - ${t.artist || 'Unknown'}`;
        schedMusicSelect.appendChild(opt);
      });
    }

    if (!tracks || tracks.length === 0) {
      musicTracksContainer.innerHTML = `
        <div style="padding: 20px; text-align: center; color: var(--text-secondary);">
          No music tracks found in RobOS Media Player library (~/.config/robos/audio-library.json).
        </div>
      `;
      return;
    }

    tracks.forEach(track => {
      const row = document.createElement('div');
      row.className = 'track-row';
      row.innerHTML = `
        <div class="track-info">
          <span class="track-icon">🎵</span>
          <div class="track-texts">
            <span class="track-title">${track.title || 'Untitled Track'}</span>
            <span class="track-artist">${track.artist || 'Unknown Artist'} • ${track.album || 'Unknown Album'}</span>
          </div>
        </div>
        <div class="track-meta">
          <span class="track-duration">${formatDuration(track.duration)}</span>
          <div class="track-actions">
            <button class="btn btn-secondary btn-sm btn-cast-track" data-id="${track.id}" data-title="${track.title}">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              Cast
            </button>
            <button class="btn btn-secondary btn-sm btn-schedule-track" data-id="${track.id}" data-title="${track.title}">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              Schedule
            </button>
          </div>
        </div>
      `;

      row.querySelector('.btn-cast-track').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        const target = speakerSelect.value;
        btn.disabled = true;
        btn.textContent = 'Streaming...';

        try {
          setPlaybackState(true, track.title);
          await window.robosSpeaker.castLibraryTrack(target, track.id);
        } catch (err) {
          alert(`Error casting track: ${err.message}`);
          setPlaybackState(false, 'Error');
        } finally {
          btn.disabled = false;
          btn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            Cast
          `;
        }
      });

      row.querySelector('.btn-schedule-track').addEventListener('click', () => {
        // Switch to schedules tab and pre-fill form
        const schedTabBtn = document.querySelector('[data-tab="tab-schedules"]');
        if (schedTabBtn) schedTabBtn.click();
        openScheduleForm({
          name: `Play: ${track.title}`,
          actionType: 'music',
          trackId: track.id
        });
      });

      musicTracksContainer.appendChild(row);
    });
  } catch (err) {
    console.warn('Error loading music library:', err);
  }
}

if (musicSearchInput) {
  let searchTimer = null;
  musicSearchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      loadMusicLibrary(musicSearchInput.value);
    }, 250);
  });
}

if (btnRefreshLibrary) {
  btnRefreshLibrary.addEventListener('click', () => {
    loadMusicLibrary(musicSearchInput?.value || '');
  });
}

// 9. Tab 7: Schedules & Alarms
const btnToggleAddSchedule = document.getElementById('btn-toggle-add-schedule');
const scheduleFormContainer = document.getElementById('schedule-form-container');
const btnSaveSchedule = document.getElementById('btn-save-schedule');
const btnCancelSchedule = document.getElementById('btn-cancel-schedule');
const scheduleListContainer = document.getElementById('schedule-list-container');

const schedName = document.getElementById('sched-name');
const schedTime = document.getElementById('sched-time');
const schedTarget = document.getElementById('sched-target');
const schedDays = document.getElementById('sched-days');
const schedActionType = document.getElementById('sched-action-type');
const schedSoundSelect = document.getElementById('sched-sound-select');
const schedTtsText = document.getElementById('sched-tts-text');
const schedMusicSelect = document.getElementById('sched-music-select');
const schedAmbientSelect = document.getElementById('sched-ambient-select');
const schedVolume = document.getElementById('sched-volume');

const schedPayloadSoundGroup = document.getElementById('sched-payload-sound-group');
const schedPayloadTtsGroup = document.getElementById('sched-payload-tts-group');
const schedPayloadMusicGroup = document.getElementById('sched-payload-music-group');
const schedPayloadAmbientGroup = document.getElementById('sched-payload-ambient-group');

function updateSchedulePayloadVisibility() {
  const type = schedActionType.value;
  schedPayloadSoundGroup.classList.toggle('hidden', type !== 'sound');
  schedPayloadTtsGroup.classList.toggle('hidden', type !== 'tts');
  schedPayloadMusicGroup.classList.toggle('hidden', type !== 'music');
  schedPayloadAmbientGroup.classList.toggle('hidden', type !== 'ambient');
}

if (schedActionType) {
  schedActionType.addEventListener('change', updateSchedulePayloadVisibility);
}

function openScheduleForm(prefill = {}) {
  scheduleFormContainer.classList.remove('hidden');
  if (prefill.name) schedName.value = prefill.name;
  if (prefill.actionType) {
    schedActionType.value = prefill.actionType;
    updateSchedulePayloadVisibility();
  }
  if (prefill.trackId && schedMusicSelect) {
    schedMusicSelect.value = prefill.trackId;
  }
  schedName.focus();
}

if (btnToggleAddSchedule) {
  btnToggleAddSchedule.addEventListener('click', () => {
    scheduleFormContainer.classList.toggle('hidden');
    updateSchedulePayloadVisibility();
  });
}

if (btnCancelSchedule) {
  btnCancelSchedule.addEventListener('click', () => {
    scheduleFormContainer.classList.add('hidden');
  });
}

if (btnSaveSchedule) {
  btnSaveSchedule.addEventListener('click', async () => {
    const name = schedName.value.trim() || 'Scheduled Alert';
    const time = schedTime.value || '09:00';
    const target = schedTarget.value;
    const daysVal = schedDays.value;
    const actionType = schedActionType.value;
    const volumeVal = schedVolume.value ? parseInt(schedVolume.value, 10) : null;

    const payload = {};
    if (actionType === 'sound') {
      payload.soundId = schedSoundSelect.value;
    } else if (actionType === 'tts') {
      payload.text = schedTtsText.value.trim() || 'Scheduled announcement';
      payload.prependChime = true;
    } else if (actionType === 'music') {
      payload.trackId = schedMusicSelect.value;
    } else if (actionType === 'ambient') {
      payload.ambientType = schedAmbientSelect.value;
      payload.durationMinutes = 30;
    }

    try {
      await window.robosSpeaker.addSchedule({
        name,
        time,
        target,
        days: [daysVal],
        actionType,
        payload,
        volume: volumeVal,
        enabled: true
      });

      scheduleFormContainer.classList.add('hidden');
      schedName.value = '';
      await loadSchedules();
    } catch (err) {
      alert(`Error saving schedule: ${err.message}`);
    }
  });
}

async function loadSchedules() {
  try {
    const schedules = await window.robosSpeaker.listSchedules();
    scheduleListContainer.innerHTML = '';

    if (!schedules || schedules.length === 0) {
      scheduleListContainer.innerHTML = `
        <div style="padding: 30px; text-align: center; color: var(--text-secondary);">
          No scheduled broadcasts yet. Click <strong>New Schedule</strong> above to set an alert or chime.
        </div>
      `;
      return;
    }

    schedules.forEach(job => {
      const card = document.createElement('div');
      card.className = `schedule-card ${job.enabled ? '' : 'disabled'}`;

      let typeIcon = '🔔';
      let typeDesc = job.payload?.soundId || 'Chime';
      if (job.actionType === 'tts') {
        typeIcon = '🗣️';
        typeDesc = `"${job.payload?.text || ''}"`;
      } else if (job.actionType === 'music') {
        typeIcon = '🎵';
        typeDesc = `Track: ${job.payload?.trackId || 'Music'}`;
      } else if (job.actionType === 'ambient') {
        typeIcon = '🌧️';
        typeDesc = `Ambient: ${job.payload?.ambientType || 'Focus'}`;
      }

      card.innerHTML = `
        <div class="sched-left">
          <div class="sched-time-badge">${job.time}</div>
          <div class="sched-details">
            <span class="sched-title">${job.name}</span>
            <div class="sched-badges">
              <span class="badge">${typeIcon} ${typeDesc}</span>
              <span class="badge badge-target">📢 ${job.target}</span>
              <span class="badge">🗓️ ${(job.days || []).join(', ')}</span>
            </div>
          </div>
        </div>

        <div class="sched-actions">
          <button class="btn btn-secondary btn-sm btn-trigger-sched" title="Test broadcast now">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            Test
          </button>
          <button class="btn btn-secondary btn-sm btn-toggle-sched">
            ${job.enabled ? 'Disable' : 'Enable'}
          </button>
          <button class="btn btn-danger btn-sm btn-delete-sched" title="Delete schedule">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      `;

      card.querySelector('.btn-trigger-sched').addEventListener('click', async () => {
        try {
          await window.robosSpeaker.triggerSchedule(job.id);
        } catch (err) {
          alert(`Trigger error: ${err.message}`);
        }
      });

      card.querySelector('.btn-toggle-sched').addEventListener('click', async () => {
        try {
          await window.robosSpeaker.updateSchedule(job.id, { enabled: !job.enabled });
          await loadSchedules();
        } catch (err) {
          alert(`Update error: ${err.message}`);
        }
      });

      card.querySelector('.btn-delete-sched').addEventListener('click', async () => {
        if (confirm(`Delete scheduled broadcast "${job.name}"?`)) {
          await window.robosSpeaker.removeSchedule(job.id);
          await loadSchedules();
        }
      });

      scheduleListContainer.appendChild(card);
    });
  } catch (err) {
    console.warn('Error loading schedules:', err);
  }
}

// 10. Tab 8: Home Assistant Devices & Add Device Wizard (NC-VK-9727 #1 Supported)
const btnAddDeviceWizardHeader = document.getElementById('btn-add-device-wizard');
const btnLaunchWizardInline = document.getElementById('btn-launch-wizard-inline');
const btnDiscoverHaDevices = document.getElementById('btn-discover-ha-devices');
const supportedCatalogGrid = document.getElementById('supported-catalog-grid');
const wizardSelectedLabel = document.getElementById('wizard-selected-label');
const wizardStepPill = document.getElementById('wizard-step-pill');
const wizStepTabs = document.querySelectorAll('.wiz-step-tab');
const wizStep1 = document.getElementById('wizard-step-1');
const wizStep2 = document.getElementById('wizard-step-2');
const wizStep3 = document.getElementById('wizard-step-3');

const btnWizNext1 = document.getElementById('btn-wiz-next-1');
const btnWizBack2 = document.getElementById('btn-wiz-back-2');
const btnWizNext2 = document.getElementById('btn-wiz-next-2');
const btnWizBack3 = document.getElementById('btn-wiz-back-3');
const btnWizSaveDevice = document.getElementById('btn-wiz-save-device');

const wizIpInput = document.getElementById('wiz-ip-input');
const wizPortInput = document.getElementById('wiz-port-input');
const btnWizProbeIp = document.getElementById('btn-wiz-probe-ip');
const btnWizScanLan = document.getElementById('btn-wiz-scan-lan');
const wizProbeResult = document.getElementById('wiz-probe-result');
const wizDiscoveredList = document.getElementById('wiz-discovered-list');

const wizBleMac = document.getElementById('wiz-ble-mac');
const btnWizScanBle = document.getElementById('btn-wiz-scan-ble');
const wizWifiSsid = document.getElementById('wiz-wifi-ssid');
const wizWifiPass = document.getElementById('wiz-wifi-pass');
const btnWizProvisionBle = document.getElementById('btn-wiz-provision-ble');
const wizBleStatus = document.getElementById('wiz-ble-status');

const wizDeviceName = document.getElementById('wiz-device-name');
const wizDeviceRoom = document.getElementById('wiz-device-room');
const wizLedColor = document.getElementById('wiz-led-color');
const btnWizTestLed = document.getElementById('btn-wiz-test-led');
const btnWizLedOff = document.getElementById('btn-wiz-led-off');
const btnWizTestAudio = document.getElementById('btn-wiz-test-audio');
const btnWizTestTts = document.getElementById('btn-wiz-test-tts');
const wizVerifyStatus = document.getElementById('wiz-verify-status');
const registeredDevicesGrid = document.getElementById('registered-devices-grid');

let supportedCatalog = [];
let selectedCatalogItem = null;

function setWizardStep(stepNum) {
  const stepTitles = {
    1: 'Step 1 of 3',
    2: 'Step 2 of 3',
    3: 'Step 3 of 3',
  };
  if (wizardStepPill) wizardStepPill.textContent = stepTitles[stepNum] || stepTitles[1];
  wizStepTabs.forEach((tab) => {
    tab.classList.toggle('active', Number(tab.dataset.wizStep) === stepNum);
  });
  if (wizStep1) wizStep1.classList.toggle('hidden', stepNum !== 1);
  if (wizStep2) wizStep2.classList.toggle('hidden', stepNum !== 2);
  if (wizStep3) wizStep3.classList.toggle('hidden', stepNum !== 3);
}

wizStepTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    setWizardStep(Number(tab.dataset.wizStep) || 1);
  });
});

function openDeviceWizard() {
  const devTabBtn = document.getElementById('tab-btn-devices');
  if (devTabBtn) devTabBtn.click();
  setWizardStep(1);
}

if (btnAddDeviceWizardHeader) {
  btnAddDeviceWizardHeader.addEventListener('click', openDeviceWizard);
}
if (btnLaunchWizardInline) {
  btnLaunchWizardInline.addEventListener('click', () => setWizardStep(1));
}
if (btnWizNext1) btnWizNext1.addEventListener('click', () => setWizardStep(2));
if (btnWizBack2) btnWizBack2.addEventListener('click', () => setWizardStep(1));
if (btnWizNext2) btnWizNext2.addEventListener('click', () => setWizardStep(3));
if (btnWizBack3) btnWizBack3.addEventListener('click', () => setWizardStep(2));

async function loadDeviceCatalog() {
  if (!window.robosSpeaker || !window.robosSpeaker.getSupportedCatalog || !supportedCatalogGrid) return;
  try {
    supportedCatalog = await window.robosSpeaker.getSupportedCatalog();
    if (!selectedCatalogItem && supportedCatalog.length > 0) {
      selectedCatalogItem = supportedCatalog[0]; // #1 NC-VK-9727
    }
    renderCatalogGrid();
  } catch (err) {
    console.warn('Error loading supported speaker catalog:', err);
  }
}

function renderCatalogGrid() {
  if (!supportedCatalogGrid) return;
  supportedCatalogGrid.innerHTML = '';
  supportedCatalog.forEach((item) => {
    const isSel = selectedCatalogItem && selectedCatalogItem.id === item.id;
    const card = document.createElement('div');
    card.className = `catalog-card ${isSel ? 'selected' : ''}`;
    card.dataset.catalogId = item.id;
    const summaryText = item.summary || 'Smart network speaker for voice announcements and music.';
    card.innerHTML = `
      <div class="catalog-card-top">
        <div class="catalog-icon-title">
          <span class="catalog-icon">${item.icon || '🔊'}</span>
          <div class="catalog-title-block">
            <div class="catalog-title">${item.name}</div>
            <div class="catalog-vendor">${item.vendor}</div>
          </div>
        </div>
        <span class="catalog-badge ${item.featured ? 'featured' : ''}">${item.badge}</span>
      </div>
      <p class="catalog-summary">${summaryText}</p>
      <details class="catalog-details">
        <summary>Show technical details</summary>
        <div class="catalog-specs">
          <div><strong>Model:</strong> ${item.modelCode}</div>
          <div><strong>Audio:</strong> ${item.specs?.dsp || ''}</div>
          <div><strong>Controls:</strong> ${item.specs?.controls || ''}</div>
          <div><strong>Connection:</strong> ${item.specs?.connectivity || `${item.protocol} (:${item.defaultPort})`}</div>
        </div>
      </details>
    `;
    card.addEventListener('click', (e) => {
      if (e.target.closest('details')) return;
      selectedCatalogItem = item;
      if (wizardSelectedLabel) {
        wizardSelectedLabel.textContent = `Selected: ${item.name} (${item.modelCode})`;
      }
      if (wizPortInput) {
        wizPortInput.value = String(item.defaultPort || 6053);
      }
      if (item.id === 'ha-voice-pe-nc-vk-9727' && wizIpInput && !wizIpInput.value) {
        wizIpInput.value = '192.168.1.64';
      }
      renderCatalogGrid();
    });
    supportedCatalogGrid.appendChild(card);
  });
}

async function probeWizardIp() {
  if (!wizIpInput || !window.robosSpeaker?.probeSingleDevice) return;
  const ip = wizIpInput.value.trim();
  const port = Number(wizPortInput?.value || 6053);
  const protocol = selectedCatalogItem?.protocol || 'esphome-native';

  wizProbeResult.className = 'probe-result-box';
  wizProbeResult.textContent = `Probing ${ip}:${port} (${protocol})...`;

  try {
    const res = await window.robosSpeaker.probeSingleDevice({ ip, port, protocol });
    if (res && res.ok && res.device) {
      const d = res.device;
      wizProbeResult.className = 'probe-result-box ok';
      wizProbeResult.innerHTML = `✓ Connected to <strong>${d.name}</strong> (${d.model || d.modelCode}) • MAC: <code>${d.mac || 'N/A'}</code> • Firmware: <code>${d.firmware || '25.5.2'}</code>`;
      if (wizDeviceName && d.name) wizDeviceName.value = d.name;
    } else {
      wizProbeResult.textContent = `⚠️ ${res?.error || 'Device did not respond.'}`;
    }
  } catch (err) {
    wizProbeResult.textContent = `⚠️ Probe error: ${err.message}`;
  }
}

if (btnWizProbeIp) {
  btnWizProbeIp.addEventListener('click', probeWizardIp);
}

async function scanHaLanDevices() {
  if (!window.robosSpeaker?.discoverHADevices) return;
  wizProbeResult.className = 'probe-result-box';
  wizProbeResult.textContent = 'Scanning local subnet for Home Assistant Voice PE & ESPHome devices (:6053)...';
  try {
    const { lanDevices } = await window.robosSpeaker.discoverHADevices({ includeBle: false, timeoutMs: 1400 });
    wizDiscoveredList.innerHTML = '';
    if (!lanDevices || lanDevices.length === 0) {
      wizProbeResult.textContent = 'No ESPHome devices responded on port 6053. Try entering the IP directly above.';
      return;
    }
    wizProbeResult.className = 'probe-result-box ok';
    wizProbeResult.textContent = `Found ${lanDevices.length} Home Assistant / ESPHome voice device(s) on LAN:`;
    lanDevices.forEach((dev) => {
      const row = document.createElement('div');
      row.className = 'discovered-mini-row';
      row.innerHTML = `
        <div>
          <strong>🎙️ ${dev.name}</strong> <code>${dev.ip}:${dev.port || 6053}</code> • <span>${dev.model}</span>
        </div>
        <button type="button" class="btn btn-primary btn-sm">Use This Device</button>
      `;
      row.querySelector('button').addEventListener('click', () => {
        if (wizIpInput) wizIpInput.value = dev.ip;
        if (wizPortInput) wizPortInput.value = String(dev.port || 6053);
        if (wizDeviceName) wizDeviceName.value = dev.name;
        setWizardStep(3);
      });
      wizDiscoveredList.appendChild(row);
    });
  } catch (err) {
    wizProbeResult.textContent = `Scan error: ${err.message}`;
  }
}

if (btnWizScanLan) btnWizScanLan.addEventListener('click', scanHaLanDevices);
if (btnDiscoverHaDevices) btnDiscoverHaDevices.addEventListener('click', scanHaLanDevices);

if (btnWizScanBle) {
  btnWizScanBle.addEventListener('click', async () => {
    if (!window.robosSpeaker?.scanBleDevices) return;
    wizBleStatus.textContent = 'Scanning Bluetooth Low Energy for ha-voice-pe / Improv BLE devices...';
    try {
      const bleDevs = await window.robosSpeaker.scanBleDevices(4);
      if (!bleDevs || bleDevs.length === 0) {
        wizBleStatus.textContent = 'No unprovisioned BLE devices found (device may already be connected to Wi-Fi at 192.168.1.64).';
      } else {
        const first = bleDevs[0];
        if (wizBleMac) wizBleMac.value = first.mac;
        wizBleStatus.className = 'probe-result-box ok';
        wizBleStatus.innerHTML = `Found BLE device: <strong>${first.name}</strong> (<code>${first.mac}</code>). Press the center button on the puck and click <strong>Push Wi-Fi</strong>.`;
      }
    } catch (err) {
      wizBleStatus.textContent = `BLE scan error: ${err.message}`;
    }
  });
}

if (btnWizProvisionBle) {
  btnWizProvisionBle.addEventListener('click', async () => {
    if (!window.robosSpeaker?.provisionBleWifi) return;
    const mac = wizBleMac?.value.trim();
    const ssid = wizWifiSsid?.value.trim();
    const password = wizWifiPass?.value || '';
    if (!mac || !ssid) {
      wizBleStatus.textContent = 'Please provide both the Bluetooth MAC and 2.4 GHz Wi-Fi SSID.';
      return;
    }
    wizBleStatus.textContent = `Connecting to ${mac} over Bluetooth LE and sending Wi-Fi credentials for "${ssid}"...`;
    try {
      const res = await window.robosSpeaker.provisionBleWifi({ mac, ssid, password });
      if (res && res.needsAuthorizationButton) {
        wizBleStatus.textContent = '⚠️ Device requires physical authorization: press the center button on top of the NC-VK-9727 once, then click Push Wi-Fi again!';
      } else {
        wizBleStatus.className = 'probe-result-box ok';
        wizBleStatus.textContent = `✓ Wi-Fi credentials sent to ${mac}! Click Scan LAN on the left to detect its IP address.`;
      }
    } catch (err) {
      wizBleStatus.textContent = `Provisioning error: ${err.message}`;
    }
  });
}

if (btnWizTestLed) {
  btnWizTestLed.addEventListener('click', async () => {
    const ip = wizIpInput?.value.trim() || '192.168.1.64';
    const hexColor = wizLedColor?.value || '#00bcd4';
    wizVerifyStatus.textContent = `Lighting up 12-LED RGB Halo Ring on ${ip} (${hexColor})...`;
    try {
      await window.robosSpeaker.setDeviceLedRing(ip, { state: true, brightness: 0.9, hexColor });
      wizVerifyStatus.className = 'probe-result-box ok';
      wizVerifyStatus.textContent = `✓ 12-LED RGB Halo Ring active on ${ip} (${hexColor})!`;
    } catch (err) {
      wizVerifyStatus.textContent = `LED Ring error: ${err.message}`;
    }
  });
}

if (btnWizLedOff) {
  btnWizLedOff.addEventListener('click', async () => {
    const ip = wizIpInput?.value.trim() || '192.168.1.64';
    try {
      await window.robosSpeaker.setDeviceLedRing(ip, { state: false });
      wizVerifyStatus.textContent = `LED Halo Ring turned off on ${ip}.`;
    } catch (err) {
      wizVerifyStatus.textContent = `LED Ring error: ${err.message}`;
    }
  });
}

if (btnWizTestAudio) {
  btnWizTestAudio.addEventListener('click', async () => {
    const ip = wizIpInput?.value.trim() || '192.168.1.64';
    const hexColor = wizLedColor?.value || '#00bcd4';
    wizVerifyStatus.textContent = `Streaming 48kHz FLAC test chime + LED halo pulse to ${ip}...`;
    try {
      await window.robosSpeaker.testDevice(ip, { hexColor, soundId: 'chime' });
      wizVerifyStatus.className = 'probe-result-box ok';
      wizVerifyStatus.textContent = `✓ 48kHz FLAC Chime + Halo Ring verified on ${ip}!`;
    } catch (err) {
      wizVerifyStatus.textContent = `Audio test error: ${err.message}`;
    }
  });
}

if (btnWizTestTts) {
  btnWizTestTts.addEventListener('click', async () => {
    const ip = wizIpInput?.value.trim() || '192.168.1.64';
    const name = wizDeviceName?.value.trim() || 'Home Assistant Voice';
    wizVerifyStatus.textContent = `Synthesizing Kokoro neural greeting for ${name} (${ip})...`;
    try {
      await window.robosSpeaker.castTTS(ip, `Hello from RobOS Home Speaker! ${name} is connected and ready.`, {
        voice: 'af_heart',
        prependChime: true,
      });
      wizVerifyStatus.className = 'probe-result-box ok';
      wizVerifyStatus.textContent = `✓ Kokoro TTS greeting streamed to ${name} (${ip})!`;
    } catch (err) {
      wizVerifyStatus.textContent = `TTS test error: ${err.message}`;
    }
  });
}

if (btnWizSaveDevice) {
  btnWizSaveDevice.addEventListener('click', async () => {
    const ip = wizIpInput?.value.trim() || '192.168.1.64';
    const port = Number(wizPortInput?.value || 6053);
    const name = wizDeviceName?.value.trim() || 'Home Assistant Voice 0ad22c';
    const room = wizDeviceRoom?.value || 'Studio & Dev Desk';
    const catalogId = selectedCatalogItem?.id || 'ha-voice-pe-nc-vk-9727';
    const protocol = selectedCatalogItem?.protocol || 'esphome-native';

    try {
      const saved = await window.robosSpeaker.addDevice({
        ip,
        port,
        name,
        room,
        catalogId,
        protocol,
      });
      wizVerifyStatus.className = 'probe-result-box ok';
      wizVerifyStatus.innerHTML = `✓ Saved <strong>${saved.name}</strong> (<code>${saved.ip}:${saved.port}</code>) to RobOS Home Speaker!`;
      await loadSpeakers(false);
      if (speakerSelect) {
        speakerSelect.value = saved.ip;
        updateSpeakerStatusBadge();
      }
      await renderRegisteredDevices();
    } catch (err) {
      wizVerifyStatus.textContent = `Save error: ${err.message}`;
    }
  });
}

async function renderRegisteredDevices() {
  if (!registeredDevicesGrid || !window.robosSpeaker?.getSpeakers) return;
  try {
    const speakers = await window.robosSpeaker.getSpeakers();
    registeredDevicesGrid.innerHTML = '';

    speakers.forEach((s) => {
      const isPe = s.modelCode === 'NC-VK-9727' || s.protocol === 'esphome-native';
      const friendlyType = isPe ? 'Home Assistant Voice Speaker' : 'Google Home / Cast Speaker';
      const card = document.createElement('div');
      card.className = `device-inventory-card ${isPe ? 'voice-pe' : ''}`;
      card.innerHTML = `
        <div>
          <div class="device-card-head">
            <div class="catalog-title-block">
              <div class="device-card-title">${s.name}</div>
              <div class="device-card-sub">${friendlyType} • ${s.online ? 'Online' : 'Offline'}</div>
            </div>
            <span class="status-dot ${s.online ? 'online' : 'offline'}" title="${s.online ? 'Online' : 'Offline'}"></span>
          </div>
          <details class="catalog-details" style="margin-top:8px;">
            <summary>Show details</summary>
            <div class="catalog-specs">
              <div><strong>IP Address:</strong> ${s.ip}${s.port ? ':' + s.port : ''}</div>
              ${s.modelCode ? `<div><strong>Model:</strong> ${s.modelCode}</div>` : ''}
              ${s.firmware ? `<div><strong>Firmware:</strong> v${s.firmware}</div>` : ''}
              ${s.mac ? `<div><strong>MAC:</strong> ${s.mac}</div>` : ''}
            </div>
          </details>
        </div>
        <div class="device-card-actions">
          <button type="button" class="btn btn-secondary btn-sm btn-dev-select">Use Speaker</button>
          <button type="button" class="btn btn-secondary btn-sm btn-dev-chime">Play Chime</button>
          ${isPe ? '<button type="button" class="btn btn-secondary btn-sm btn-dev-halo">Light Ring</button>' : ''}
        </div>
      `;

      card.querySelector('.btn-dev-select').addEventListener('click', () => {
        if (speakerSelect) {
          speakerSelect.value = s.ip;
          updateSpeakerStatusBadge();
        }
      });

      card.querySelector('.btn-dev-chime').addEventListener('click', async () => {
        setPlaybackState(true, `Test Chime → ${s.name}`);
        await window.robosSpeaker.testDevice(s.ip, { soundId: 'chime' });
      });

      const haloBtn = card.querySelector('.btn-dev-halo');
      if (haloBtn) {
        haloBtn.addEventListener('click', async () => {
          await window.robosSpeaker.setDeviceLedRing(s.ip, { state: true, brightness: 0.9, hexColor: '#00bcd4' });
          setTimeout(() => {
            window.robosSpeaker.setDeviceLedRing(s.ip, { state: false }).catch(() => {});
          }, 3000);
        });
      }

      registeredDevicesGrid.appendChild(card);
    });
  } catch (err) {
    console.warn('Error rendering registered devices:', err);
  }
}

// Init
const btnToggleListener = document.getElementById('btn-toggle-listener');
const btnTriggerMicNow = document.getElementById('btn-trigger-mic-now');
const listenerAutoReply = document.getElementById('listener-auto-reply');
const listenerStatusDot = document.getElementById('listener-status-dot');
const listenerStatusText = document.getElementById('listener-status-text');
const btnClearInbox = document.getElementById('btn-clear-inbox');
const incomingVoiceList = document.getElementById('incoming-voice-list');

let currentListenerStatus = { active: false, status: 'idle', inbox: [] };

function renderIncomingListenerState(st) {
  if (!st) return;
  currentListenerStatus = st;
  if (!listenerStatusDot || !listenerStatusText || !btnToggleListener) return;

  if (st.active) {
    listenerStatusDot.className = 'status-dot online';
    btnToggleListener.textContent = 'Stop Listening';
    btnToggleListener.className = 'btn btn-secondary btn-sm';

    const labels = {
      connecting: `Connecting to speaker microphone (${st.ip})...`,
      listening_for_wake_word: `Listening on speaker (${st.ip}) — Say "Okay Nabu" or press the speaker's center button to talk`,
      capturing_speech: `Hearing you speak on the speaker right now...`,
      transcribing: `Transcribing what you said...`,
      replying: `Speaking reply out loud on the speaker...`,
    };
    listenerStatusText.textContent = labels[st.status] || `Listening on speaker (${st.ip})`;
  } else {
    listenerStatusDot.className = 'status-dot offline';
    btnToggleListener.textContent = 'Start Listening';
    btnToggleListener.className = 'btn btn-primary btn-sm';
    listenerStatusText.textContent = st.status === 'error'
      ? 'Could not reach speaker microphone — check that your speaker is powered on.'
      : 'Speaker microphone is off — click Start Listening to turn it on.';
  }

  if (incomingVoiceList) {
    const inbox = Array.isArray(st.inbox) ? st.inbox : [];
    if (inbox.length === 0) {
      incomingVoiceList.innerHTML = `
        <div class="incoming-empty-state">
          No incoming voice messages yet. Once listening is on, press the center button on your Home Assistant Voice speaker or say <strong>"Okay Nabu"</strong> and speak!
        </div>
      `;
    } else {
      incomingVoiceList.innerHTML = inbox
        .map(
          (item) => `
          <div class="incoming-msg-card">
            <div class="incoming-msg-top">
              <span>From Speaker (${item.speakerIp}) • Triggered by: ${item.wakeWord || 'Speaker Mic'}</span>
              <span>${item.timestamp || ''}</span>
            </div>
            <div class="incoming-msg-text">"${item.transcript}"</div>
            ${item.reply ? `<div class="incoming-msg-reply">↳ Speaker Reply: "${item.reply}"</div>` : ''}
            ${item.audioWavPath ? `<audio controls class="incoming-msg-audio" src="file://${item.audioWavPath}"></audio>` : ''}
          </div>
        `
        )
        .join('');
    }
  }
}

if (btnToggleListener) {
  btnToggleListener.addEventListener('click', async () => {
    if (!window.robosSpeaker?.startVoiceListener) return;
    if (currentListenerStatus.active) {
      const st = await window.robosSpeaker.stopVoiceListener();
      renderIncomingListenerState(st);
    } else {
      btnToggleListener.disabled = true;
      btnToggleListener.textContent = 'Connecting...';
      try {
        const res = await window.robosSpeaker.startVoiceListener('192.168.1.64', {
          autoReply: listenerAutoReply ? listenerAutoReply.checked : true,
        });
        if (res && res.status) renderIncomingListenerState(res.status);
      } finally {
        btnToggleListener.disabled = false;
      }
    }
  });
}

if (btnTriggerMicNow) {
  btnTriggerMicNow.addEventListener('click', async () => {
    if (!window.robosSpeaker?.triggerSpeakerMicNow) return;
    btnTriggerMicNow.disabled = true;
    btnTriggerMicNow.textContent = 'Opening Speaker Mic...';
    try {
      await window.robosSpeaker.triggerSpeakerMicNow('192.168.1.64', {
        autoReply: listenerAutoReply ? listenerAutoReply.checked : true,
      });
    } finally {
      btnTriggerMicNow.disabled = false;
      btnTriggerMicNow.textContent = 'Record from Speaker Now';
    }
  });
}

if (btnClearInbox) {
  btnClearInbox.addEventListener('click', async () => {
    if (!window.robosSpeaker?.clearVoiceInbox) return;
    await window.robosSpeaker.clearVoiceInbox();
    const st = await window.robosSpeaker.getVoiceListenerStatus();
    renderIncomingListenerState(st);
  });
}

async function initIncomingListener() {
  if (!window.robosSpeaker?.getVoiceListenerStatus) return;
  if (window.robosSpeaker.onVoiceListenerUpdate) {
    window.robosSpeaker.onVoiceListenerUpdate((st) => {
      renderIncomingListenerState(st);
    });
  }
  const st = await window.robosSpeaker.getVoiceListenerStatus();
  renderIncomingListenerState(st);
}

document.addEventListener('DOMContentLoaded', () => {
  initWaveformCanvas();
  loadSpeakers(true);
  loadSoundboard();
  loadMusicLibrary();
  loadSchedules();
  loadDeviceCatalog();
  renderRegisteredDevices();
  initIncomingListener();
});


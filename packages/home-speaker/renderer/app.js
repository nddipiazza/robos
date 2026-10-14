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
      opt.textContent = `${s.name || 'Cast Device'} (${s.ip}) ${s.online ? '• Online' : '• Offline'}`;
      if (s.ip === currentVal || (!currentVal && s.name.toLowerCase().includes('kitchen'))) {
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

// Init
document.addEventListener('DOMContentLoaded', () => {
  initWaveformCanvas();
  loadSpeakers(true);
  loadSoundboard();
  loadMusicLibrary();
  loadSchedules();
});


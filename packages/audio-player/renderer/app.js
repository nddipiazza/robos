'use strict';

// ── Application State ────────────────────────────────────────────────────────

const state = {
  playlist: [],
  currentIndex: -1,
  currentHowl: null,
  activeAmbientNode: null,
  activeAmbientType: null,
  audioCtx: null,
  analyser: null,
  outputTarget: 'local', // 'local' or speaker IP or 'all'
  discoveredSpeakers: [],
  isPlaying: false,
  isMuted: false,
  volume: 0.70,
  repeat: false,
  shuffle: false,
  progressInterval: null,
  visualizerAnimFrame: null,
};

// ── DOM Elements ─────────────────────────────────────────────────────────────

const DOM = {
  outputSelect: document.getElementById('output-select'),
  btnScanSpeakers: document.getElementById('btn-scan-speakers'),
  canvas: document.getElementById('visualizer-canvas'),
  outputBadge: document.getElementById('output-badge'),
  statusBadge: document.getElementById('status-badge'),
  trackTitle: document.getElementById('track-title'),
  trackArtist: document.getElementById('track-artist'),
  timeCurrent: document.getElementById('time-current'),
  timeDuration: document.getElementById('time-duration'),
  progressBar: document.getElementById('progress-bar'),
  btnShuffle: document.getElementById('btn-shuffle'),
  btnPrev: document.getElementById('btn-prev'),
  btnPlayPause: document.getElementById('btn-play-pause'),
  iconPlay: document.getElementById('icon-play'),
  iconPause: document.getElementById('icon-pause'),
  btnStop: document.getElementById('btn-stop'),
  btnNext: document.getElementById('btn-next'),
  btnRepeat: document.getElementById('btn-repeat'),
  btnMute: document.getElementById('btn-mute'),
  iconVol: document.getElementById('icon-vol'),
  iconMute: document.getElementById('icon-mute'),
  volumeSlider: document.getElementById('volume-slider'),
  volumePct: document.getElementById('volume-pct'),
  announcerTargetLabel: document.getElementById('announcer-target-label'),
  ttsInput: document.getElementById('tts-input'),
  btnBroadcastTTS: document.getElementById('btn-broadcast-tts'),
  playlistCount: document.getElementById('playlist-count'),
  btnAddFiles: document.getElementById('btn-add-files'),
  dropzone: document.getElementById('dropzone'),
  playlistList: document.getElementById('playlist-list'),
  toast: document.getElementById('toast'),
};

// ── Web Audio & Visualizer Setup ─────────────────────────────────────────────

function getAudioContext() {
  if (!state.audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    state.audioCtx = new AudioContextClass();
    state.analyser = state.audioCtx.createAnalyser();
    state.analyser.fftSize = 64;
    state.analyser.smoothingTimeConstant = 0.8;
  }
  if (state.audioCtx.state === 'suspended') {
    state.audioCtx.resume();
  }
  return state.audioCtx;
}

function startVisualizer() {
  const ctx = DOM.canvas.getContext('2d');
  const bufferLength = state.analyser ? state.analyser.frequencyBinCount : 32;
  const dataArray = new Uint8Array(bufferLength);

  function resizeCanvas() {
    DOM.canvas.width = DOM.canvas.clientWidth * window.devicePixelRatio;
    DOM.canvas.height = DOM.canvas.clientHeight * window.devicePixelRatio;
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  function render() {
    state.visualizerAnimFrame = requestAnimationFrame(render);
    const width = DOM.canvas.width;
    const height = DOM.canvas.height;

    ctx.clearRect(0, 0, width, height);

    if (state.isPlaying && state.analyser) {
      state.analyser.getByteFrequencyData(dataArray);
    } else {
      // Idle wave
      for (let i = 0; i < bufferLength; i++) {
        dataArray[i] = Math.max(4, Math.sin((Date.now() / 600) + (i / 4)) * 12 + 12);
      }
    }

    const barWidth = (width / bufferLength) * 1.8;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
      const v = dataArray[i] / 255.0;
      const barHeight = Math.max(3, v * height * 0.9);

      // Cyan gradient
      const grad = ctx.createLinearGradient(0, height - barHeight, 0, height);
      grad.addColorStop(0, '#00bcd4');
      grad.addColorStop(1, '#063a48');

      ctx.fillStyle = grad;
      ctx.shadowColor = '#00bcd4';
      ctx.shadowBlur = state.isPlaying ? 8 : 2;
      ctx.fillRect(x, height - barHeight, barWidth - 4, barHeight);

      x += barWidth;
    }
  }

  render();
}

// ── Audio Engine: Howler & Web Audio ─────────────────────────────────────────

function playLocalTrack(track) {
  stopAllPlayback();

  state.currentHowl = new Howl({
    src: [track.src],
    html5: false, // Use Web Audio for visualizer hook
    volume: state.isMuted ? 0 : state.volume,
    onload: () => {
      DOM.timeDuration.textContent = formatTime(state.currentHowl.duration());
      DOM.progressBar.max = state.currentHowl.duration();
    },
    onplay: () => {
      state.isPlaying = true;
      updatePlayPauseUI(true);
      startProgressLoop();
      connectHowlerToAnalyser();
    },
    onpause: () => {
      state.isPlaying = false;
      updatePlayPauseUI(false);
      stopProgressLoop();
    },
    onstop: () => {
      state.isPlaying = false;
      updatePlayPauseUI(false);
      stopProgressLoop();
    },
    onend: () => {
      if (state.repeat) {
        state.currentHowl.play();
      } else {
        playNextTrack();
      }
    },
    onloaderror: (_id, err) => {
      showToast('Error loading audio track: ' + err);
    }
  });

  state.currentHowl.play();
}

function connectHowlerToAnalyser() {
  try {
    const actx = getAudioContext();
    if (Howler && Howler.masterGain && state.analyser) {
      Howler.masterGain.connect(state.analyser);
      state.analyser.connect(actx.destination);
    }
  } catch {}
}

function stopAllPlayback() {
  if (state.currentHowl) {
    state.currentHowl.stop();
    state.currentHowl.unload();
    state.currentHowl = null;
  }
  if (state.activeAmbientNode) {
    try { state.activeAmbientNode.stop(); } catch {}
    state.activeAmbientNode = null;
    state.activeAmbientType = null;
    document.querySelectorAll('.btn-ambient').forEach(b => b.classList.remove('playing'));
  }
  stopProgressLoop();
  state.isPlaying = false;
  updatePlayPauseUI(false);
}

// ── Procedural Ambient Synthesizers (Web Audio API) ──────────────────────────

function playAmbientSound(type) {
  // If clicking active, toggle off
  if (state.activeAmbientType === type) {
    stopAllPlayback();
    DOM.trackTitle.textContent = 'No Track Selected';
    DOM.trackArtist.textContent = 'Ambient soundscape stopped';
    return;
  }

  stopAllPlayback();
  const actx = getAudioContext();
  const gainNode = actx.createGain();
  gainNode.gain.setValueAtTime(state.isMuted ? 0 : state.volume * 0.4, actx.currentTime);

  let sourceNode = null;
  let label = '';

  if (type === 'rain' || type === 'pink') {
    // Generate pink noise buffer
    const bufferSize = actx.sampleRate * 4;
    const noiseBuffer = actx.createBuffer(1, bufferSize, actx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;

    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }

    const whiteSource = actx.createBufferSource();
    whiteSource.buffer = noiseBuffer;
    whiteSource.loop = true;

    if (type === 'rain') {
      const filter = actx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(900, actx.currentTime);
      whiteSource.connect(filter);
      filter.connect(gainNode);
      label = '🌧️ Coding Rain Soundscape';
    } else {
      whiteSource.connect(gainNode);
      label = '📻 Deep Pink Noise';
    }

    whiteSource.start();
    sourceNode = whiteSource;

  } else if (type === 'synth') {
    // Dual detuned saw oscillators
    const osc1 = actx.createOscillator();
    const osc2 = actx.createOscillator();
    const filter = actx.createBiquadFilter();

    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(55, actx.currentTime); // A1 note
    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(55.6, actx.currentTime); // detuned

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(320, actx.currentTime);
    filter.Q.setValueAtTime(4, actx.currentTime);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gainNode);

    osc1.start();
    osc2.start();
    sourceNode = { stop: () => { osc1.stop(); osc2.stop(); } };
    label = '🌌 Cyberpunk Focus Drone';

  } else if (type === 'chimes') {
    // Periodic gentle chimes
    const pentatonic = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25];
    const chimeTimer = setInterval(() => {
      const freq = pentatonic[Math.floor(Math.random() * pentatonic.length)];
      const osc = actx.createOscillator();
      const env = actx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, actx.currentTime);
      env.gain.setValueAtTime(0.001, actx.currentTime);
      env.gain.exponentialRampToValueAtTime(0.25, actx.currentTime + 0.05);
      env.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + 3.5);
      osc.connect(env);
      env.connect(gainNode);
      osc.start();
      osc.stop(actx.currentTime + 3.6);
    }, 1800);

    sourceNode = { stop: () => clearInterval(chimeTimer) };
    label = '🔔 Zen Studio Chimes';
  }

  gainNode.connect(state.analyser);
  state.analyser.connect(actx.destination);

  state.activeAmbientNode = sourceNode;
  state.activeAmbientType = type;
  state.isPlaying = true;

  document.querySelectorAll('.btn-ambient').forEach(b => {
    b.classList.toggle('playing', b.dataset.sound === type);
  });

  DOM.trackTitle.textContent = label;
  DOM.trackArtist.textContent = 'Web Audio Synthesizer (Procedural)';
  DOM.timeDuration.textContent = '∞';
  updatePlayPauseUI(true);
}

// ── Google Cast Smart Speaker Streaming ──────────────────────────────────────

async function refreshSpeakers() {
  DOM.btnScanSpeakers.classList.add('loading');
  try {
    showToast('Scanning local network for Google Cast speakers...');
    const speakers = await window.robosAudio.discoverSpeakers();
    state.discoveredSpeakers = speakers || [];

    // Rebuild select options
    DOM.outputSelect.innerHTML = '<option value="local">💻 Desktop (Local Audio)</option>';

    if (state.discoveredSpeakers.length > 0) {
      state.discoveredSpeakers.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.ip;
        opt.textContent = `🔊 ${s.name} (${s.ip})`;
        DOM.outputSelect.appendChild(opt);
      });

      const optAll = document.createElement('option');
      optAll.value = 'all';
      optAll.textContent = '📢 Broadcast to All Speakers';
      DOM.outputSelect.appendChild(optAll);

      showToast(`Discovered ${state.discoveredSpeakers.length} local smart speakers!`);
    } else {
      showToast('No Cast speakers responded on local subnet.');
    }
  } catch (err) {
    showToast('Speaker discovery error: ' + err.message);
  } finally {
    DOM.btnScanSpeakers.classList.remove('loading');
  }
}

async function castCurrentTrack(speakerIp, track) {
  stopAllPlayback();

  DOM.statusBadge.textContent = 'Casting...';
  DOM.statusBadge.className = 'badge badge-playing';

  const metadata = {
    title: track.title,
    artist: track.artist,
  };

  showToast(`Casting "${track.title}" to ${speakerIp}...`);

  if (speakerIp === 'all') {
    for (const sp of state.discoveredSpeakers) {
      if (track.filePath) {
        window.robosAudio.castFile(sp.ip, track.filePath, metadata);
      } else if (track.src) {
        window.robosAudio.castUrl(sp.ip, track.src, metadata);
      }
    }
  } else {
    if (track.filePath) {
      const res = await window.robosAudio.castFile(speakerIp, track.filePath, metadata);
      if (!res.ok) showToast('Cast error: ' + res.error);
    } else if (track.src) {
      const res = await window.robosAudio.castUrl(speakerIp, track.src, metadata);
      if (!res.ok) showToast('Cast error: ' + res.error);
    }
  }

  state.isPlaying = true;
  updatePlayPauseUI(true);
}

// ── Voice Announcer ──────────────────────────────────────────────────────────

async function broadcastVoiceAnnouncement() {
  const text = DOM.ttsInput.value.trim();
  if (!text) {
    showToast('Please enter text to announce');
    return;
  }

  const target = state.outputTarget;
  if (target === 'local') {
    // Speak using HTML5 SpeechSynthesis
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.volume = state.volume;
      window.speechSynthesis.speak(utterance);
      showToast('Announced through Desktop audio!');
    }
    return;
  }

  // Cast to speaker
  showToast(`Broadcasting speech announcement to ${target}...`);
  DOM.statusBadge.textContent = 'Speaking...';
  DOM.statusBadge.className = 'badge badge-playing';

  try {
    if (target === 'all') {
      for (const sp of state.discoveredSpeakers) {
        window.robosAudio.castTTS(sp.ip, text);
      }
      showToast('Broadcasted announcement to all speakers!');
    } else {
      const res = await window.robosAudio.castTTS(target, text);
      if (res && res.ok) {
        showToast('Spoken announcement finished on speaker!');
      } else {
        showToast('TTS cast error: ' + (res?.error || 'Unknown error'));
      }
    }
  } catch (err) {
    showToast('TTS broadcast failed: ' + err.message);
  } finally {
    DOM.statusBadge.textContent = 'Ready';
    DOM.statusBadge.className = 'badge badge-idle';
  }
}

// ── Playlist Management ──────────────────────────────────────────────────────

function addTracks(newTracks) {
  const startIndex = state.playlist.length;
  state.playlist.push(...newTracks);
  DOM.playlistCount.textContent = state.playlist.length;
  renderPlaylist();

  if (state.currentIndex === -1 && state.playlist.length > 0) {
    selectTrack(startIndex);
  }
}

function selectTrack(index) {
  if (index < 0 || index >= state.playlist.length) return;
  state.currentIndex = index;
  const track = state.playlist[index];

  DOM.trackTitle.textContent = track.title;
  DOM.trackArtist.textContent = track.artist || 'Local Audio';
  renderPlaylist();

  if (state.outputTarget === 'local') {
    playLocalTrack(track);
  } else {
    castCurrentTrack(state.outputTarget, track);
  }
}

function playNextTrack() {
  if (state.playlist.length === 0) return;
  let next = state.currentIndex + 1;
  if (state.shuffle) {
    next = Math.floor(Math.random() * state.playlist.length);
  } else if (next >= state.playlist.length) {
    next = 0;
  }
  selectTrack(next);
}

function playPrevTrack() {
  if (state.playlist.length === 0) return;
  let prev = state.currentIndex - 1;
  if (prev < 0) prev = state.playlist.length - 1;
  selectTrack(prev);
}

function renderPlaylist() {
  DOM.playlistList.innerHTML = '';
  state.playlist.forEach((track, i) => {
    const li = document.createElement('li');
    li.className = `playlist-item ${i === state.currentIndex ? 'active' : ''}`;

    const left = document.createElement('div');
    left.className = 'item-left';
    left.innerHTML = `
      <span class="item-title">${i + 1}. ${escapeHtml(track.title)}</span>
      <span class="item-artist">${escapeHtml(track.artist || 'Audio Track')}</span>
    `;

    const actions = document.createElement('div');
    actions.className = 'item-actions';
    const btnRemove = document.createElement('button');
    btnRemove.className = 'btn-remove-item';
    btnRemove.innerHTML = '✕';
    btnRemove.title = 'Remove';
    btnRemove.onclick = (e) => {
      e.stopPropagation();
      state.playlist.splice(i, 1);
      if (state.currentIndex === i) {
        stopAllPlayback();
        state.currentIndex = -1;
      } else if (state.currentIndex > i) {
        state.currentIndex--;
      }
      DOM.playlistCount.textContent = state.playlist.length;
      renderPlaylist();
    };

    actions.appendChild(btnRemove);
    li.appendChild(left);
    li.appendChild(actions);

    li.onclick = () => selectTrack(i);
    DOM.playlistList.appendChild(li);
  });
}

// ── Helpers & Loops ──────────────────────────────────────────────────────────

function startProgressLoop() {
  stopProgressLoop();
  state.progressInterval = setInterval(() => {
    if (state.currentHowl && state.currentHowl.playing()) {
      const seek = state.currentHowl.seek() || 0;
      DOM.timeCurrent.textContent = formatTime(seek);
      DOM.progressBar.value = seek;
    }
  }, 250);
}

function stopProgressLoop() {
  if (state.progressInterval) {
    clearInterval(state.progressInterval);
    state.progressInterval = null;
  }
}

function updatePlayPauseUI(playing) {
  DOM.iconPlay.classList.toggle('hidden', playing);
  DOM.iconPause.classList.toggle('hidden', !playing);
  DOM.statusBadge.textContent = playing ? 'Playing' : 'Ready';
  DOM.statusBadge.className = `badge ${playing ? 'badge-playing' : 'badge-idle'}`;
}

function formatTime(secs) {
  const m = Math.floor(secs / 60) || 0;
  const s = Math.floor(secs % 60) || 0;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function showToast(msg) {
  DOM.toast.textContent = msg;
  DOM.toast.classList.remove('hidden');
  setTimeout(() => DOM.toast.classList.add('hidden'), 3500);
}

function escapeHtml(str) {
  return (str || '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[m]));
}

// ── Event Handlers ───────────────────────────────────────────────────────────

function setupEventHandlers() {
  // Output Select
  DOM.outputSelect.addEventListener('change', (e) => {
    state.outputTarget = e.target.value;
    const selectedText = e.target.options[e.target.selectedIndex].text;
    DOM.outputBadge.textContent = selectedText.split(' ')[0] + ' ' + selectedText.split('(')[0].trim();
    DOM.announcerTargetLabel.textContent = `Target: ${selectedText}`;

    showToast(`Switched audio output to: ${selectedText}`);

    // If currently playing, restart track to new output target
    if (state.currentIndex >= 0 && state.playlist[state.currentIndex]) {
      selectTrack(state.currentIndex);
    }
  });

  // Scan Speakers
  DOM.btnScanSpeakers.addEventListener('click', refreshSpeakers);

  // Play / Pause
  DOM.btnPlayPause.addEventListener('click', () => {
    if (state.outputTarget !== 'local') {
      if (state.isPlaying) {
        window.robosAudio.castPause(state.outputTarget);
        state.isPlaying = false;
        updatePlayPauseUI(false);
      } else {
        window.robosAudio.castResume(state.outputTarget);
        state.isPlaying = true;
        updatePlayPauseUI(true);
      }
      return;
    }

    if (state.currentHowl) {
      if (state.currentHowl.playing()) {
        state.currentHowl.pause();
      } else {
        state.currentHowl.play();
      }
    } else if (state.playlist.length > 0) {
      selectTrack(0);
    } else {
      // Default to ambient rain
      playAmbientSound('rain');
    }
  });

  // Stop
  DOM.btnStop.addEventListener('click', () => {
    if (state.outputTarget !== 'local') {
      window.robosAudio.castStop(state.outputTarget);
    }
    stopAllPlayback();
  });

  // Prev / Next
  DOM.btnPrev.addEventListener('click', playPrevTrack);
  DOM.btnNext.addEventListener('click', playNextTrack);

  // Shuffle & Repeat
  DOM.btnShuffle.addEventListener('click', () => {
    state.shuffle = !state.shuffle;
    DOM.btnShuffle.classList.toggle('active', state.shuffle);
    showToast(`Shuffle: ${state.shuffle ? 'On' : 'Off'}`);
  });

  DOM.btnRepeat.addEventListener('click', () => {
    state.repeat = !state.repeat;
    DOM.btnRepeat.classList.toggle('active', state.repeat);
    showToast(`Repeat: ${state.repeat ? 'On' : 'Off'}`);
  });

  // Scrubbing
  DOM.progressBar.addEventListener('input', (e) => {
    if (state.currentHowl) {
      const seek = parseFloat(e.target.value);
      state.currentHowl.seek(seek);
      DOM.timeCurrent.textContent = formatTime(seek);
    }
  });

  // Volume
  DOM.volumeSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    state.volume = val / 100.0;
    DOM.volumePct.textContent = `${val}%`;

    if (state.outputTarget === 'local') {
      Howler.volume(state.isMuted ? 0 : state.volume);
    } else if (state.outputTarget !== 'all') {
      window.robosAudio.setSpeakerVolume(state.outputTarget, state.volume, state.isMuted);
    }
  });

  // Mute
  DOM.btnMute.addEventListener('click', () => {
    state.isMuted = !state.isMuted;
    DOM.iconVol.classList.toggle('hidden', state.isMuted);
    DOM.iconMute.classList.toggle('hidden', !state.isMuted);

    if (state.outputTarget === 'local') {
      Howler.volume(state.isMuted ? 0 : state.volume);
    } else if (state.outputTarget !== 'all') {
      window.robosAudio.setSpeakerVolume(state.outputTarget, state.volume, state.isMuted);
    }
  });

  // Ambient sound buttons
  document.querySelectorAll('.btn-ambient').forEach(btn => {
    btn.addEventListener('click', () => {
      playAmbientSound(btn.dataset.sound);
    });
  });

  // Presets
  document.querySelectorAll('.btn-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      DOM.ttsInput.value = btn.dataset.msg;
      broadcastVoiceAnnouncement();
    });
  });

  // Broadcast button & Enter key
  DOM.btnBroadcastTTS.addEventListener('click', broadcastVoiceAnnouncement);
  DOM.ttsInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') broadcastVoiceAnnouncement();
  });

  // Add Files Dialog
  DOM.btnAddFiles.addEventListener('click', async () => {
    const res = await window.robosAudio.openFileDialog();
    if (!res.canceled && res.tracks && res.tracks.length > 0) {
      addTracks(res.tracks);
      showToast(`Added ${res.tracks.length} track(s) to playlist`);
    }
  });

  // Drag and Drop
  DOM.dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    DOM.dropzone.classList.add('dragover');
  });

  DOM.dropzone.addEventListener('dragleave', () => {
    DOM.dropzone.classList.remove('dragover');
  });

  DOM.dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    DOM.dropzone.classList.remove('dragover');

    const files = Array.from(e.dataTransfer.files).filter(f => {
      return f.type.startsWith('audio/') || /\.(mp3|wav|ogg|flac|aac|m4a)$/i.test(f.name);
    });

    if (files.length === 0) {
      showToast('Please drop valid audio files');
      return;
    }

    const newTracks = files.map(f => ({
      title: f.name.replace(/\.[^.]+$/, ''),
      artist: 'Local File',
      filePath: f.path,
      src: `file://${f.path}`
    }));

    addTracks(newTracks);
    showToast(`Added ${newTracks.length} dropped track(s) to playlist`);
  });

  // Listen to remote speaker status changes
  if (window.robosAudio && window.robosAudio.onSpeakerStatusChange) {
    window.robosAudio.onSpeakerStatusChange(({ ip, status }) => {
      if (ip === state.outputTarget) {
        if (status.playerState === 'PLAYING') {
          state.isPlaying = true;
          updatePlayPauseUI(true);
        } else if (status.playerState === 'PAUSED' || status.playerState === 'IDLE') {
          state.isPlaying = false;
          updatePlayPauseUI(false);
        }
      }
    });
  }
}

// ── Initialization ───────────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', () => {
  setupEventHandlers();
  startVisualizer();
  refreshSpeakers();

  // Add default welcome focus track
  addTracks([
    {
      title: 'RobOS Lo-Fi Synth Session',
      artist: 'Procedural Ambient Engine',
      src: 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=lofi-study-112191.mp3'
    }
  ]);
});

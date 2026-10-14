import React, { useState, useEffect, useRef } from 'react';
import AudioPlayer from 'react-h5-audio-player';

export default function App() {
  const [activeTab, setActiveTab] = useState('player'); // 'player' | 'library' | 'ambient' | 'speakers'
  const [playlist, setPlaylist] = useState([
    {
      id: 'default-1',
      title: 'RobOS Lo-Fi Synth Session',
      artist: 'Procedural Ambient Engine',
      album: 'RobOS Focus Series',
      src: 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=lofi-study-112191.mp3'
    }
  ]);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [outputTarget, setOutputTarget] = useState('local'); // 'local' | speaker IP | 'all'
  const [speakers, setSpeakers] = useState([]);
  const [library, setLibrary] = useState({ tracks: [], artists: [], albums: [] });
  const [searchQuery, setSearchQuery] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(null);
  const [ttsMessage, setTtsMessage] = useState('Hello from RobOS! Smart home audio is online.');
  const [statusMsg, setStatusMsg] = useState('');
  const [activeAmbient, setActiveAmbient] = useState(null);

  const playerRef = useRef(null);
  const canvasRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const ambientNodeRef = useRef(null);

  // ── Initial Load & Speaker Discovery ──────────────────────────────────────

  useEffect(() => {
    refreshSpeakers();
    loadLibrary();

    // Listen to background progress
    if (window.robosAudio?.onLibraryScanProgress) {
      const unsub = window.robosAudio.onLibraryScanProgress((p) => {
        setScanProgress(p);
      });
      return () => unsub();
    }
  }, []);

  const showStatus = (msg) => {
    setStatusMsg(msg);
    setTimeout(() => setStatusMsg(''), 4000);
  };

  const refreshSpeakers = async () => {
    setIsScanning(true);
    showStatus('Scanning local network for Google Cast speakers...');
    try {
      const found = await window.robosAudio.discoverSpeakers();
      setSpeakers(found || []);
      if (found && found.length > 0) {
        showStatus(`Discovered ${found.length} local Google Cast speakers!`);
      } else {
        showStatus('No Cast speakers responded on local subnet.');
      }
    } catch (err) {
      showStatus('Discovery error: ' + err.message);
    } finally {
      setIsScanning(false);
    }
  };

  const loadLibrary = async () => {
    try {
      const lib = await window.robosAudio.getLibrary();
      if (lib && lib.tracks) {
        setLibrary(lib);
      }
    } catch {}
  };

  const handleSelectFolder = async () => {
    showStatus('Select music folder to scan with music-metadata...');
    const res = await window.robosAudio.selectLibraryFolder();
    if (!res.canceled && res.tracks) {
      setLibrary({
        tracks: res.tracks,
        artists: [],
        albums: []
      });
      loadLibrary();
      showStatus(`Imported ${res.totalFound} audio tracks into media library!`);
    }
  };

  // ── Track Selection & Routing ─────────────────────────────────────────────

  const currentTrack = playlist[currentTrackIndex] || playlist[0] || null;

  const playTrack = (track) => {
    // If not in playlist, append
    const existingIdx = playlist.findIndex(t => t.filePath === track.filePath || t.src === track.src);
    if (existingIdx >= 0) {
      setCurrentTrackIndex(existingIdx);
    } else {
      setPlaylist(prev => [...prev, track]);
      setCurrentTrackIndex(playlist.length);
    }

    if (outputTarget !== 'local') {
      castTrack(outputTarget, track);
    }
  };

  const castTrack = async (speakerIp, track) => {
    showStatus(`Casting "${track.title}" to ${speakerIp}...`);
    const metadata = {
      title: track.title,
      artist: track.artist,
      album: track.album,
    };
    if (track.artId) {
      metadata.images = [{ url: `http://192.168.1.34:0/art/${track.artId}.jpg` }];
    }

    if (speakerIp === 'all') {
      speakers.forEach(s => {
        if (track.filePath) window.robosAudio.castFile(s.ip, track.filePath, metadata);
        else if (track.src) window.robosAudio.castUrl(s.ip, track.src, metadata);
      });
    } else {
      if (track.filePath) {
        await window.robosAudio.castFile(speakerIp, track.filePath, metadata);
      } else if (track.src) {
        await window.robosAudio.castUrl(speakerIp, track.src, metadata);
      }
    }
  };

  const handlePlayNext = () => {
    if (playlist.length <= 1) return;
    const nextIdx = (currentTrackIndex + 1) % playlist.length;
    setCurrentTrackIndex(nextIdx);
    if (outputTarget !== 'local') {
      castTrack(outputTarget, playlist[nextIdx]);
    }
  };

  const handlePlayPrev = () => {
    if (playlist.length <= 1) return;
    const prevIdx = (currentTrackIndex - 1 + playlist.length) % playlist.length;
    setCurrentTrackIndex(prevIdx);
    if (outputTarget !== 'local') {
      castTrack(outputTarget, playlist[prevIdx]);
    }
  };

  // ── Voice Announcer ───────────────────────────────────────────────────────

  const handleBroadcastTTS = async () => {
    if (!ttsMessage.trim()) return;
    const target = outputTarget === 'local' ? (speakers[0]?.ip || '192.168.1.10') : outputTarget;
    showStatus(`Broadcasting speech announcement to ${target}...`);
    try {
      if (target === 'all') {
        speakers.forEach(s => window.robosAudio.castTTS(s.ip, ttsMessage));
      } else {
        await window.robosAudio.castTTS(target, ttsMessage);
      }
      showStatus('Announcement broadcast complete!');
    } catch (err) {
      showStatus('TTS error: ' + err.message);
    }
  };

  // ── Ambient Synthesizers (Web Audio) ──────────────────────────────────────

  const playAmbient = (type) => {
    if (activeAmbient === type) {
      if (ambientNodeRef.current) {
        try { ambientNodeRef.current.stop(); } catch {}
        ambientNodeRef.current = null;
      }
      setActiveAmbient(null);
      return;
    }

    if (ambientNodeRef.current) {
      try { ambientNodeRef.current.stop(); } catch {}
      ambientNodeRef.current = null;
    }

    if (!audioCtxRef.current) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      audioCtxRef.current = new AudioCtx();
    }
    const actx = audioCtxRef.current;
    if (actx.state === 'suspended') actx.resume();

    const gain = actx.createGain();
    gain.gain.setValueAtTime(0.3, actx.currentTime);
    gain.connect(actx.destination);

    if (type === 'rain' || type === 'pink') {
      const bufferSize = actx.sampleRate * 2;
      const buffer = actx.createBuffer(1, bufferSize, actx.sampleRate);
      const data = buffer.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99 * b0 + white * 0.05;
        b1 = 0.96 * b1 + white * 0.15;
        b2 = 0.86 * b2 + white * 0.30;
        data[i] = (b0 + b1 + b2) * 0.15;
      }
      const noise = actx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      if (type === 'rain') {
        const filter = actx.createBiquadFilter();
        filter.frequency.setValueAtTime(800, actx.currentTime);
        noise.connect(filter);
        filter.connect(gain);
      } else {
        noise.connect(gain);
      }
      noise.start();
      ambientNodeRef.current = noise;
    } else if (type === 'synth') {
      const o1 = actx.createOscillator();
      const o2 = actx.createOscillator();
      o1.type = 'sawtooth';
      o1.frequency.setValueAtTime(55, actx.currentTime);
      o2.type = 'sawtooth';
      o2.frequency.setValueAtTime(55.5, actx.currentTime);
      const filter = actx.createBiquadFilter();
      filter.frequency.setValueAtTime(350, actx.currentTime);
      o1.connect(filter);
      o2.connect(filter);
      filter.connect(gain);
      o1.start();
      o2.start();
      ambientNodeRef.current = { stop: () => { o1.stop(); o2.stop(); } };
    }

    setActiveAmbient(type);
    showStatus(`Playing procedural ambient soundscape: ${type}`);
  };

  // ── Filtered Library Tracks ───────────────────────────────────────────────

  const filteredLibrary = library.tracks.filter(t => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (t.title && t.title.toLowerCase().includes(q)) ||
           (t.artist && t.artist.toLowerCase().includes(q)) ||
           (t.album && t.album.toLowerCase().includes(q)) ||
           (t.genre && t.genre.toLowerCase().includes(q));
  });

  return (
    <div className="react-audio-app">
      {/* Header */}
      <header className="app-header">
        <div className="header-brand">
          <svg className="brand-icon" xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#00bcd4" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 18v-6a9 9 0 0 1 18 0v6"/>
            <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>
            <polygon points="10 10 15 12 10 14 10 10" fill="#00bcd4"/>
          </svg>
          <div>
            <h1>RobOS Audio Player</h1>
            <span className="subtitle">React H5AudioPlayer & Zero-Cloud Google Cast Streaming</span>
          </div>
        </div>

        {/* Output Selector */}
        <div className="output-selector-wrapper">
          <label>Audio Output:</label>
          <div className="select-group">
            <select
              id="output-select"
              value={outputTarget}
              onChange={(e) => {
                setOutputTarget(e.target.value);
                showStatus(`Switched output to: ${e.target.options[e.target.selectedIndex].text}`);
              }}
            >
              <option value="local">💻 Desktop (Local Audio)</option>
              {speakers.map(s => (
                <option key={s.ip} value={s.ip}>🔊 {s.name} ({s.ip})</option>
              ))}
              {speakers.length > 0 && (
                <option value="all">📢 Broadcast to All Speakers</option>
              )}
            </select>
            <button
              id="btn-scan-speakers"
              className={`btn-icon ${isScanning ? 'loading' : ''}`}
              onClick={refreshSpeakers}
              title="Scan LAN for Google Cast speakers"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/></svg>
              <span>Scan Speakers</span>
            </button>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="nav-tabs">
        <button
          className={`tab-btn ${activeTab === 'player' ? 'active' : ''}`}
          onClick={() => setActiveTab('player')}
        >
          🎵 Now Playing
        </button>
        <button
          className={`tab-btn ${activeTab === 'library' ? 'active' : ''}`}
          onClick={() => setActiveTab('library')}
        >
          📚 Media Library ({library.tracks.length})
        </button>
        <button
          className={`tab-btn ${activeTab === 'ambient' ? 'active' : ''}`}
          onClick={() => setActiveTab('ambient')}
        >
          ⚡ Ambient Synthesizers
        </button>
        <button
          className={`tab-btn ${activeTab === 'speakers' ? 'active' : ''}`}
          onClick={() => setActiveTab('speakers')}
        >
          🔊 Discovered Speakers ({speakers.length})
        </button>
      </nav>

      {/* Main Content Area */}
      <main className="tab-content">
        {/* TAB 1: NOW PLAYING */}
        {activeTab === 'player' && (
          <div className="player-deck-container">
            <div className="deck-card">
              <div className="track-hero">
                <div className="album-art-box">
                  {currentTrack?.artId ? (
                    <img src={`http://192.168.1.34:0/art/${currentTrack.artId}.jpg`} alt="Album Art" />
                  ) : (
                    <div className="art-fallback">
                      <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#00bcd4" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="4"/></svg>
                    </div>
                  )}
                </div>
                <div className="track-details">
                  <h2 id="track-title">{currentTrack?.title || 'No Track Selected'}</h2>
                  <p id="track-artist">{currentTrack?.artist || 'Unknown Artist'} &bull; {currentTrack?.album || 'RobOS Library'}</p>
                  <div className="track-meta-pills">
                    <span className="badge">Output: {outputTarget === 'local' ? 'Desktop' : outputTarget}</span>
                    {currentTrack?.genre && <span className="badge">{currentTrack.genre}</span>}
                    {currentTrack?.year && <span className="badge">{currentTrack.year}</span>}
                  </div>
                </div>
              </div>

              {/* Existing React Component: React H5 Audio Player */}
              <div className="react-h5-wrapper">
                <AudioPlayer
                  ref={playerRef}
                  src={currentTrack?.src || (currentTrack?.filePath ? `file://${currentTrack.filePath}` : '')}
                  showSkipControls={true}
                  showJumpControls={false}
                  onClickNext={handlePlayNext}
                  onClickPrevious={handlePlayPrev}
                  onEnded={handlePlayNext}
                  className="robos-rhap-theme"
                  layout="stacked"
                  customAdditionalControls={[]}
                />
              </div>

              {/* Quick Speaker Announcer Bar */}
              <div className="announcer-panel">
                <div className="announcer-header">
                  <h3>🎙️ Smart Speaker Voice Announcer</h3>
                  <span className="announcer-target">Target: {outputTarget === 'local' ? 'Kitchen speaker' : outputTarget}</span>
                </div>
                <div className="announcer-presets">
                  {['Build succeeded! All tests passing.', 'Pull request approved and ready for merge.', 'Time for sprint standup in Dev Central.', 'Stretch break! Take 5 minutes.'].map((msg, i) => (
                    <button key={i} className="btn-preset" onClick={() => setTtsMessage(msg)}>
                      {msg.split('!')[0]}
                    </button>
                  ))}
                </div>
                <div className="announcer-input-row">
                  <input
                    type="text"
                    id="tts-input"
                    value={ttsMessage}
                    onChange={(e) => setTtsMessage(e.target.value)}
                    placeholder="Type speech announcement to broadcast..."
                  />
                  <button id="btn-broadcast-tts" className="btn-accent" onClick={handleBroadcastTTS}>
                    <span>Broadcast</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: MEDIA LIBRARY BROWSER */}
        {activeTab === 'library' && (
          <div className="media-browser-container">
            <div className="browser-toolbar">
              <div className="search-box">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input
                  type="text"
                  placeholder="Search by track, artist, album, genre..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="browser-actions">
                <button className="btn-secondary" onClick={handleSelectFolder}>
                  📂 Scan Music Folder (music-metadata)
                </button>
                <button className="btn-secondary" onClick={() => window.robosAudio.openFileDialog().then(r => {
                  if (!r.canceled && r.tracks) {
                    setPlaylist(prev => [...prev, ...r.tracks]);
                    showStatus(`Added ${r.tracks.length} tracks to queue`);
                  }
                })}>
                  ➕ Add Audio Files
                </button>
              </div>
            </div>

            {/* Library Grid */}
            <div className="library-grid">
              {filteredLibrary.length === 0 ? (
                <div className="empty-state">
                  <p>No tracks found in media library. Click <strong>Scan Music Folder</strong> to index local music with <code>music-metadata</code>!</p>
                </div>
              ) : (
                filteredLibrary.map((t, idx) => (
                  <div key={t.id || idx} className="track-card" onClick={() => playTrack(t)}>
                    <div className="card-thumb">
                      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#00bcd4" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8" fill="#00bcd4"/></svg>
                    </div>
                    <div className="card-info">
                      <h4>{t.title}</h4>
                      <p>{t.artist} &bull; {t.album}</p>
                    </div>
                    <div className="card-actions">
                      <button className="btn-chip" onClick={(e) => { e.stopPropagation(); playTrack(t); }}>
                        ▶ Play
                      </button>
                      {speakers.length > 0 && (
                        <button className="btn-chip" onClick={(e) => { e.stopPropagation(); castTrack(speakers[0].ip, t); }}>
                          🔊 Cast
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* TAB 3: AMBIENT SYNTHESIZERS */}
        {activeTab === 'ambient' && (
          <div className="ambient-container">
            <h3>⚡ Procedural Focus Soundscapes</h3>
            <p className="subtitle">Synthesized in real-time with Web Audio API nodes (zero external files)</p>
            <div className="ambient-grid">
              {[
                { id: 'rain', emoji: '🌧️', name: 'Coding Rain', desc: 'Resonant filtered pink noise mimicking rainfall' },
                { id: 'synth', emoji: '🌌', name: 'Cyber Synth', desc: 'Dual detuned sawtooth oscillators with analog low-pass filter' },
                { id: 'pink', emoji: '📻', name: 'Pink Noise', desc: 'Voss-McCartney noise buffer for deep technical focus' },
              ].map(s => (
                <div key={s.id} className={`ambient-card-item ${activeAmbient === s.id ? 'active' : ''}`} onClick={() => playAmbient(s.id)}>
                  <span className="card-emoji">{s.emoji}</span>
                  <h4>{s.name}</h4>
                  <p>{s.desc}</p>
                  <button className="btn-accent">
                    {activeAmbient === s.id ? 'Stop' : 'Start'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 4: DISCOVERED SPEAKERS */}
        {activeTab === 'speakers' && (
          <div className="speakers-container">
            <div className="speakers-header">
              <h3>🔊 Connected Google Cast Smart Speakers</h3>
              <button className="btn-secondary" onClick={refreshSpeakers}>
                🔄 Refresh Subnet Scan
              </button>
            </div>
            <div className="speakers-grid">
              {speakers.map(s => (
                <div key={s.ip} className="speaker-card">
                  <div className="speaker-badge">ONLINE</div>
                  <h4>{s.name}</h4>
                  <p className="speaker-ip">IP Address: <code>{s.ip}</code></p>
                  <p className="speaker-model">Model: {s.model}</p>
                  <div className="speaker-actions">
                    <button className="btn-accent" onClick={() => { setOutputTarget(s.ip); setActiveTab('player'); }}>
                      Set as Output
                    </button>
                    <button className="btn-secondary" onClick={() => window.robosAudio.castTTS(s.ip, `Test tone from RobOS Audio Player on ${s.name}`)}>
                      Test Speaker
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Toast Notification */}
      {statusMsg && <div className="toast">{statusMsg}</div>}
    </div>
  );
}

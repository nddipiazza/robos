import React, { useState, useEffect, useRef, useCallback } from 'react';
import AudioPlayer from 'react-h5-audio-player';
import { LibraryBrowser } from './Library';
import { CloudBrowser } from './CloudBrowser';
import { NowPlayingPanel } from './NowPlayingPanel';
import { LyricsPanel } from './Lyrics';
import { AiPlaylistModal } from './AiPlaylist';
import { AiFixMetadataModal } from './AiFixMetadata';
import { useVirtualDj } from './useVirtualDj';
import { useArtUrl, CoverThumb, formatTime } from './library-ui';
import { useResizablePane } from './resizable';
import { CastClockCard, CastAmbientCard } from './castClock';
import { useSpeakerTakeover } from './useSpeakerTakeover';
import { Icon } from './Icon';

const AMBIENT_PRESETS = [
  { id: 'rain', name: 'Cinema Rain', desc: 'Filtered brownian rain outside the theater', color: '#38bdf8' },
  { id: 'pink', name: 'Projector Reel Hum', desc: 'Warm analog 35mm projector & room tone', color: '#f472b6' },
  { id: 'drone', name: 'Sci-Fi Intermission Drone', desc: 'Detuned binaural fifth pad (110 Hz + 165 Hz)', color: '#a78bfa' },
  { id: 'brown', name: 'Deep Sub-Bass Rumble', desc: 'Warm low-frequency theater acoustics', color: '#fb923c' }
];

function createNoiseEngine(type) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const ctx = new AudioCtx();
  const gainNode = ctx.createGain();
  gainNode.gain.value = 0.25;
  gainNode.connect(ctx.destination);

  if (type === 'drone') {
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    osc1.type = 'sawtooth';
    osc2.type = 'triangle';
    osc1.frequency.value = 110;
    osc2.frequency.value = 164.81;
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gainNode);
    osc1.start();
    osc2.start();
    return {
      setVolume: (v) => { gainNode.gain.setTargetAtTime(v * 0.35, ctx.currentTime, 0.05); },
      stop: () => { try { osc1.stop(); osc2.stop(); ctx.close(); } catch (_) {} }
    };
  }

  const bufferSize = 2 * ctx.sampleRate;
  const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const output = noiseBuffer.getChannelData(0);

  if (type === 'pink') {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.04;
      b6 = white * 0.115926;
    }
  } else {
    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      output[i] = (lastOut + (0.02 * white)) / 1.02;
      lastOut = output[i];
      output[i] *= 1.8;
    }
  }

  const whiteNoise = ctx.createBufferSource();
  whiteNoise.buffer = noiseBuffer;
  whiteNoise.loop = true;

  const filter = ctx.createBiquadFilter();
  filter.type = type === 'rain' ? 'bandpass' : 'lowpass';
  filter.frequency.value = type === 'rain' ? 950 : 420;

  whiteNoise.connect(filter);
  filter.connect(gainNode);
  whiteNoise.start(0);

  return {
    setVolume: (v) => { gainNode.gain.setTargetAtTime(v * 0.5, ctx.currentTime, 0.05); },
    stop: () => { try { whiteNoise.stop(); ctx.close(); } catch (_) {} }
  };
}

export function App() {
  const [activeTab, setActiveTab] = useState('now-playing');
  const [libraryAgg, setLibraryAgg] = useState({
    summary: { trackCount: 0, albumCount: 0, artistCount: 0, genreCount: 0, cloudCount: 0, totalDuration: 0, totalSize: 0 },
    albums: [],
    artists: [],
    genres: [],
    decades: [],
    composers: [],
    folders: []
  });
  const [scanStatus, setScanStatus] = useState({ active: false, processed: 0, total: 0 });
  const [cloudSources, setCloudSources] = useState([]);
  const [cloudCache, setCloudCache] = useState(null);

  const [playlists, setPlaylists] = useState([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState(null);
  const [queue, setQueue] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [currentSrc, setCurrentSrc] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);

  // Movie / Cinema stage specific state
  const [playbackRate, setPlaybackRate] = useState(1);
  const [videoFit, setVideoFit] = useState('contain'); // 'contain' | 'cover' | 'fill'
  const [theaterExpanded, setTheaterExpanded] = useState(false);
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(true);
  const [activeSubtitleCue, setActiveSubtitleCue] = useState(null);
  const [snapshotNotice, setSnapshotNotice] = useState('');

  // Ambient soundscape state
  const [activeAmbient, setActiveAmbient] = useState(null);
  const [ambientVolume, setAmbientVolume] = useState(0.35);
  const ambientEngineRef = useRef(null);

  // Cast state
  const [castDevices, setCastDevices] = useState([]);
  const [activeCastDevice, setActiveCastDevice] = useState(null);
  const [castStatusText, setCastStatusText] = useState('');
  const [testingDeviceId, setTestingDeviceId] = useState(null);
  const [manualHost, setManualHost] = useState('');
  const [manualName, setManualName] = useState('');
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [npCollapsed, setNpCollapsed] = useState(false);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [fixMetaModal, setFixMetaModal] = useState({ open: false, tracks: [] });
  const [virtualDjEnabled, setVirtualDjEnabled] = useState(false);
  const [djStyle, setDjStyle] = useState('warm classic cinema host');

  const sidebarResize = useResizablePane({ initial: 215, min: 155, max: 380, direction: 'right' });
  const queueResize = useResizablePane({ initial: 280, min: 210, max: 460, direction: 'left' });

  const playerRef = useRef(null);
  const videoRef = useRef(null);
  const stageShellRef = useRef(null);
  const currentTrack = currentIndex >= 0 && currentIndex < queue.length ? queue[currentIndex] : null;
  const currentArtUrl = useArtUrl(currentTrack?.artId);

  const advanceAfterDj = useCallback((nextIndex) => {
    setCurrentIndex(nextIndex);
    setIsPlaying(true);
  }, []);

  const virtualDj = useVirtualDj({
    enabled: virtualDjEnabled,
    djStyle,
    playlistName: (playlists.find(p => p.id === selectedPlaylistId)?.name) || 'Screening Queue',
    queue,
    currentIndex,
    activeCastDevice,
    onAdvanceToIndex: advanceAfterDj
  });

  const { takeoverBanner, dismissTakeover } = useSpeakerTakeover({
    castDevices,
    activeCastDevice,
    onExternalTakeover: (evt) => {
      const a = getAudioEl();
      if (a && !a.paused) a.pause();
      if (videoRef.current && !videoRef.current.paused) videoRef.current.pause();
      setIsPlaying(false);
      setActiveCastDevice(null);
      setCastStatusText(
        `Stopped: ${evt.deviceName} switched to ${evt.title || evt.appName || 'another cast session'}`
      );
    }
  });

  const getAudioEl = useCallback(() => {
    return playerRef.current?.audio?.current || null;
  }, []);

  useEffect(() => {
    window.robosAudio.getLibrary().then((lib) => {
      if (!lib) return;
      setLibraryAgg({
        summary: lib.summary || {},
        albums: lib.albums || [],
        artists: lib.artists || [],
        genres: lib.genres || [],
        decades: lib.decades || [],
        composers: lib.composers || [],
        folders: lib.folders || []
      });
    });

    window.robosAudio.getPlaylists().then((pls) => {
      const list = Array.isArray(pls) ? pls : [];
      setPlaylists(list);
      if (list.length > 0) {
        setSelectedPlaylistId(list[0].id);
        const initialPl = list.find(p => Array.isArray(p.tracks) && p.tracks.length > 0) || list[0];
        if (initialPl && Array.isArray(initialPl.tracks) && initialPl.tracks.length > 0) {
          setQueue(initialPl.tracks);
          setCurrentIndex(0);
        }
      }
    });

    window.robosAudio.getCloudSources().then((res) => {
      if (res) {
        setCloudSources(res.sources || []);
        setCloudCache(res.cache || null);
      }
    });

    window.robosAudio.getCastDevices().then((devs) => {
      setCastDevices(Array.isArray(devs) ? devs : []);
    });

    const offScan = window.robosAudio.onScanProgress((prog) => {
      setScanStatus(prog);
      if (!prog.active) {
        window.robosAudio.getLibrarySummary().then(agg => {
          if (agg) setLibraryAgg(agg);
        });
      }
    });
    const offDevs = window.robosAudio.onCastDevicesUpdated((devs) => {
      setCastDevices(Array.isArray(devs) ? devs : []);
    });
    const offStatus = window.robosAudio.onCastStatus(({ device, status }) => {
      if (status && status.playerState) {
        setCastStatusText(`${device.name}: ${status.playerState}`);
      }
    });

    return () => {
      offScan();
      offDevs();
      offStatus();
      if (ambientEngineRef.current) ambientEngineRef.current.stop();
    };
  }, []);

  // Resolve playback URL (local file://, http(s)://, or on-demand HTTP byte-range proxy for cloud movies)
  useEffect(() => {
    if (!currentTrack) {
      setCurrentSrc('');
      return;
    }
    let cancelled = false;
    if (currentTrack.source === 'cloud') {
      window.robosAudio.getCloudStreamUrl(currentTrack.id).then(url => {
        if (!cancelled) setCurrentSrc(url);
      }).catch(() => {});
    } else {
      const src = (currentTrack.path.startsWith('http://') || currentTrack.path.startsWith('https://') || currentTrack.path.startsWith('file://'))
        ? currentTrack.path
        : `file://${encodeURI(currentTrack.path).replace(/#/g, '%23')}`;
      setCurrentSrc(src);
    }
    window.robosAudio.recordPlay(currentTrack.id).catch(() => {});
    return () => { cancelled = true; };
  }, [currentTrack?.id]);

  // Synchronize HTML5 <video> element and transport deck <audio> element:
  // We mute the hidden <audio> element inside react-h5-audio-player so <video> carries both video & audio,
  // while keeping react-h5-audio-player's scrubber, transport buttons, and keyboard shortcuts 100% synced!
  useEffect(() => {
    const a = getAudioEl();
    if (a) {
      a.muted = true;
      a.playbackRate = playbackRate;
    }
    if (videoRef.current) {
      videoRef.current.volume = activeCastDevice ? 0 : volume;
      videoRef.current.playbackRate = playbackRate;
    }
  }, [currentSrc, volume, playbackRate, activeCastDevice, getAudioEl]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !currentSrc) return;
    if (isPlaying && !activeCastDevice) {
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  }, [isPlaying, currentSrc, activeCastDevice]);

  const handlePlayTrack = useCallback(async (track, contextQueue = null) => {
    const targetQueue = Array.isArray(contextQueue) && contextQueue.length > 0 ? contextQueue : queue;
    let idx = targetQueue.findIndex(t => t.id === track.id || t.path === track.path);
    let nextQueue = targetQueue;
    if (idx === -1) {
      nextQueue = [...targetQueue, track];
      idx = nextQueue.length - 1;
    }
    setQueue(nextQueue);
    setCurrentIndex(idx);
    setIsPlaying(true);

    if (activeCastDevice) {
      try {
        setCastStatusText(`Casting "${track.title}" to ${activeCastDevice.name}...`);
        await window.robosAudio.castTrack(activeCastDevice, track, 0);
        const a = getAudioEl();
        if (a) a.pause();
        if (videoRef.current) videoRef.current.pause();
      } catch (err) {
        setCastStatusText(`Cast error: ${err.message}`);
      }
    }
  }, [queue, activeCastDevice, getAudioEl]);

  const togglePlayPause = useCallback(() => {
    if (!currentTrack && queue.length > 0) {
      setCurrentIndex(0);
      setIsPlaying(true);
      return;
    }
    const a = getAudioEl();
    const v = videoRef.current;
    if (!a && !v) return;
    const paused = v ? v.paused : a.paused;
    if (paused) {
      if (v && !activeCastDevice) v.play().catch(() => {});
      if (a) a.play().catch(() => {});
      setIsPlaying(true);
      if (activeCastDevice) window.robosAudio.castControl('play');
    } else {
      if (v) v.pause();
      if (a) a.pause();
      setIsPlaying(false);
      if (activeCastDevice) window.robosAudio.castControl('pause');
    }
  }, [currentTrack, queue, activeCastDevice, getAudioEl]);

  const computeNextIndex = useCallback(() => {
    if (queue.length === 0) return -1;
    if (shuffle) return Math.floor(Math.random() * queue.length);
    const nextIdx = currentIndex + 1;
    if (nextIdx >= queue.length) return repeat ? 0 : -1;
    return nextIdx;
  }, [queue.length, shuffle, repeat, currentIndex]);

  const handleNext = useCallback(() => {
    const nextIdx = computeNextIndex();
    if (nextIdx === -1) {
      setIsPlaying(false);
      return;
    }
    setCurrentIndex(nextIdx);
    setIsPlaying(true);
  }, [computeNextIndex]);

  const handleTrackEnded = useCallback(() => {
    const nextIdx = computeNextIndex();
    if (nextIdx === -1) {
      setIsPlaying(false);
      return;
    }
    if (virtualDjEnabled) {
      const a = getAudioEl();
      if (a) a.pause();
      if (videoRef.current) videoRef.current.pause();
      virtualDj.TransitionWithDj(nextIdx);
      return;
    }
    setCurrentIndex(nextIdx);
    setIsPlaying(true);
  }, [computeNextIndex, virtualDjEnabled, virtualDj, getAudioEl]);

  const handlePrev = useCallback(() => {
    if (queue.length === 0) return;
    const v = videoRef.current;
    const a = getAudioEl();
    if ((v && v.currentTime > 3) || (a && a.currentTime > 3)) {
      if (v) v.currentTime = 0;
      if (a) a.currentTime = 0;
      return;
    }
    const prevIdx = currentIndex > 0 ? currentIndex - 1 : queue.length - 1;
    setCurrentIndex(prevIdx);
    setIsPlaying(true);
  }, [queue.length, currentIndex, getAudioEl]);

  useEffect(() => {
    if (!window.robosAudio || !window.robosAudio.reportPlaybackState) return;
    window.robosAudio.reportPlaybackState({
      isPlaying,
      currentTrack: currentTrack ? {
        id: currentTrack.id,
        title: currentTrack.title,
        artist: currentTrack.artist,
        album: currentTrack.album,
        resolution: currentTrack.resolution,
        duration: currentTrack.duration || duration,
        path: currentTrack.path
      } : null,
      currentTime,
      duration,
      volume,
      activeCastDevice
    }).catch(() => {});
  }, [isPlaying, currentTrack?.id, Math.floor(currentTime / 2), duration, volume, activeCastDevice]);

  useEffect(() => {
    if (!window.robosAudio || !window.robosAudio.onRemoteCommand) return undefined;
    return window.robosAudio.onRemoteCommand((cmd) => {
      if (!cmd || !cmd.action) return;
      const a = getAudioEl();
      const v = videoRef.current;
      if (cmd.action === 'play') {
        if (v && v.paused) v.play().catch(() => {});
        if (a && a.paused) a.play().catch(() => {});
        setIsPlaying(true);
      } else if (cmd.action === 'pause') {
        if (v && !v.paused) v.pause();
        if (a && !a.paused) a.pause();
        setIsPlaying(false);
      } else if (cmd.action === 'toggle') {
        togglePlayPause();
      } else if (cmd.action === 'next') {
        handleNext();
      } else if (cmd.action === 'prev') {
        handlePrev();
      } else if (cmd.action === 'volume' && typeof cmd.volume === 'number') {
        const vol = Math.max(0, Math.min(1, cmd.volume));
        setVolume(vol);
        if (v) v.volume = vol;
      } else if (cmd.action === 'seek' && typeof cmd.time === 'number') {
        if (v) v.currentTime = cmd.time;
        if (a) a.currentTime = cmd.time;
        setCurrentTime(cmd.time);
      } else if (cmd.action === 'play-track' && cmd.track) {
        handlePlayTrack(cmd.track);
      }
    });
  }, [togglePlayPause, handleNext, handlePrev, handlePlayTrack, getAudioEl]);

  const handleSeekTo = (sec) => {
    const v = videoRef.current;
    const a = getAudioEl();
    if (v) v.currentTime = sec;
    if (a) a.currentTime = sec;
    setCurrentTime(sec);
    if (activeCastDevice) window.robosAudio.castControl('seek', sec);
  };

  const handleCycleSpeed = () => {
    const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
    const next = speeds[(speeds.indexOf(playbackRate) + 1) % speeds.length] || 1;
    setPlaybackRate(next);
  };

  const handleCycleVideoFit = () => {
    const modes = ['contain', 'cover', 'fill'];
    const next = modes[(modes.indexOf(videoFit) + 1) % modes.length] || 'contain';
    setVideoFit(next);
  };

  const handleTogglePiP = async () => {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (videoRef.current && videoRef.current.requestPictureInPicture) {
        await videoRef.current.requestPictureInPicture();
      }
    } catch (_) {}
  };

  const handleToggleFullscreen = () => {
    const el = stageShellRef.current || videoRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else if (el.requestFullscreen) {
      el.requestFullscreen().catch(() => {});
    }
  };

  const handleCaptureSnapshot = async () => {
    const v = videoRef.current;
    if (!v || !currentTrack) return;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = v.videoWidth || 1280;
      canvas.height = v.videoHeight || 720;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/png');
      const res = await window.robosMovie.saveSnapshotFrame({
        dataUrl,
        title: currentTrack.title,
        timestamp: currentTime
      });
      if (res && res.ok) {
        setSnapshotNotice(`Saved frame to ${res.path}`);
        setTimeout(() => setSnapshotNotice(''), 4000);
      }
    } catch (err) {
      setSnapshotNotice(`Snapshot error: ${err.message}`);
      setTimeout(() => setSnapshotNotice(''), 4000);
    }
  };

  const handleAddFolder = async () => {
    const res = await window.robosAudio.pickFolder();
    if (res && res.summary) setLibraryAgg(res);
  };

  const handleAddFiles = async () => {
    const res = await window.robosAudio.pickFiles();
    if (res && res.summary) setLibraryAgg(res);
  };

  const handleRescan = async () => {
    const res = await window.robosAudio.scanFolders();
    if (res && res.summary) setLibraryAgg(res);
  };

  const handleIndexCloudSource = async (sourceId, remotePath) => {
    const res = await window.robosAudio.indexCloudSource(sourceId, remotePath);
    if (res && res.summary) setLibraryAgg(res);
    const cs = await window.robosAudio.getCloudSources();
    if (cs) setCloudCache(cs.cache);
  };

  const handleRemoveCloudSourceTracks = async (sourceId) => {
    const res = await window.robosAudio.removeCloudSourceTracks(sourceId);
    if (res && res.summary) setLibraryAgg(res);
  };

  const handlePlayCloudItem = async (sourceId, item) => {
    await handleIndexCloudSource(sourceId, item.path.split('/').slice(0, -1).join('/') || '/');
    const q = await window.robosAudio.queryTracks({ sourceId, search: item.name, limit: 5 });
    if (q && q.tracks && q.tracks[0]) {
      handlePlayTrack(q.tracks[0], q.tracks);
      setActiveTab('now-playing');
    }
  };

  const handleCreatePlaylist = async () => {
    const name = newPlaylistName.trim();
    if (!name) return;
    const next = [...playlists, { id: `pl-${Date.now()}`, name, description: 'Custom movie watchlist', tracks: [] }];
    setPlaylists(next);
    setSelectedPlaylistId(next[next.length - 1].id);
    setNewPlaylistName('');
    await window.robosAudio.savePlaylists(next);
  };

  const handleDeletePlaylist = async (id) => {
    const next = playlists.filter(p => p.id !== id);
    setPlaylists(next);
    if (selectedPlaylistId === id) setSelectedPlaylistId(next[0]?.id || null);
    await window.robosAudio.savePlaylists(next);
  };

  const handleAddTrackToPlaylist = async (playlistId, track) => {
    const next = playlists.map(pl => {
      if (pl.id !== playlistId) return pl;
      if (pl.tracks.some(t => t.path === track.path)) return pl;
      return { ...pl, tracks: [...pl.tracks, track] };
    });
    setPlaylists(next);
    await window.robosAudio.savePlaylists(next);
  };

  const handleRemoveTrackFromPlaylist = async (playlistId, trackPath) => {
    const next = playlists.map(pl => {
      if (pl.id !== playlistId) return pl;
      return { ...pl, tracks: pl.tracks.filter(t => t.path !== trackPath) };
    });
    setPlaylists(next);
    await window.robosAudio.savePlaylists(next);
  };

  const handleMovePlaylistTrack = async (playlistId, fromIdx, toIdx) => {
    const next = playlists.map(pl => {
      if (pl.id !== playlistId) return pl;
      const list = [...(pl.tracks || [])];
      if (toIdx < 0 || toIdx >= list.length) return pl;
      const [item] = list.splice(fromIdx, 1);
      list.splice(toIdx, 0, item);
      return { ...pl, tracks: list };
    });
    setPlaylists(next);
    await window.robosAudio.savePlaylists(next);
  };

  const handleImportM3U = async () => {
    const res = await window.robosAudio.importM3U();
    if (res && res.playlists) {
      setPlaylists(res.playlists);
      if (res.imported) setSelectedPlaylistId(res.imported.id);
    }
  };

  const handleAiPlaylistCreated = (res) => {
    if (res && Array.isArray(res.playlists)) {
      setPlaylists(res.playlists);
    }
    if (res && res.playlist) {
      setSelectedPlaylistId(res.playlist.id);
    }
    if (res && Array.isArray(res.tracks) && res.tracks.length > 0) {
      setVirtualDjEnabled(Boolean(res.virtualDj));
      if (res.djStyle) setDjStyle(res.djStyle);
      setQueue(res.tracks);
      setCurrentIndex(0);
      setIsPlaying(true);
      setActiveTab('playlists');
    }
  };

  const handleOpenFixMetadata = (tracks = []) => {
    setFixMetaModal({ open: true, tracks: Array.isArray(tracks) ? tracks : [] });
  };

  const handleMetadataFixed = (res) => {
    if (res && res.library) setLibraryAgg(res.library);
    if (res && Array.isArray(res.playlists)) setPlaylists(res.playlists);
    if (res && Array.isArray(res.results) && res.results.length > 0) {
      const byId = new Map(res.results.map(r => [r.id, r.after]));
      setQueue(prev => prev.map(t => (byId.has(t.id) ? { ...t, ...byId.get(t.id) } : t)));
    }
  };

  const toggleAmbient = (presetId) => {
    if (activeAmbient === presetId) {
      if (ambientEngineRef.current) ambientEngineRef.current.stop();
      ambientEngineRef.current = null;
      setActiveAmbient(null);
      return;
    }
    if (ambientEngineRef.current) ambientEngineRef.current.stop();
    const engine = createNoiseEngine(presetId);
    engine.setVolume(ambientVolume);
    ambientEngineRef.current = engine;
    setActiveAmbient(presetId);
  };

  const handleAmbientVolume = (v) => {
    setAmbientVolume(v);
    if (ambientEngineRef.current) ambientEngineRef.current.setVolume(v);
  };

  const handleSelectCastDevice = async (device) => {
    if (activeCastDevice && activeCastDevice.id === device.id) {
      await window.robosAudio.castDisconnect();
      setActiveCastDevice(null);
      setCastStatusText('');
      return;
    }
    setActiveCastDevice(device);
    setCastStatusText(`Connected to ${device.name}`);
    if (currentTrack) {
      try {
        await window.robosAudio.castTrack(device, currentTrack, currentTime);
        const a = getAudioEl();
        if (a) a.pause();
        if (videoRef.current) videoRef.current.pause();
      } catch (err) {
        setCastStatusText(`Cast failed: ${err.message}`);
      }
    }
  };

  const handleAddManualDevice = async (e) => {
    e.preventDefault();
    if (!manualHost.trim()) return;
    const dev = await window.robosAudio.addManualCastDevice({
      name: manualName.trim() || manualHost.trim(),
      host: manualHost.trim(),
      port: 8009
    });
    setCastDevices(prev => [...prev.filter(d => d.id !== dev.id), dev]);
    setManualHost('');
    setManualName('');
  };

  const handleCastEntirePlaylist = async (pl) => {
    if (!pl || !Array.isArray(pl.tracks) || pl.tracks.length === 0) return;
    const targetDevice = activeCastDevice || castDevices[0];
    if (!targetDevice) {
      setActiveTab('cast');
      setCastStatusText('Select or add a Smart TV / Chromecast device first to cast this watchlist.');
      return;
    }
    setActiveCastDevice(targetDevice);
    setQueue(pl.tracks);
    setCurrentIndex(0);
    try {
      setCastStatusText(`Casting watchlist "${pl.name}" (${pl.tracks.length} movies) to ${targetDevice.name}…`);
      await window.robosAudio.castPlaylist(targetDevice, pl.tracks, 0);
      const a = getAudioEl();
      if (a) a.pause();
      if (videoRef.current) videoRef.current.pause();
      setCastStatusText(`Playing "${pl.name}" (${pl.tracks.length} movies) on ${targetDevice.name}`);
    } catch (err) {
      setCastStatusText(`Cast watchlist error: ${err.message}`);
    }
  };

  const handleTestCastSpeaker = async (device) => {
    if (!device) return;
    setTestingDeviceId(device.id);
    setCastStatusText(`Sending test chime to ${device.name} (${device.host})…`);
    try {
      await window.robosAudio.testCastSpeaker(device);
      setActiveCastDevice(device);
      setCastStatusText(`Test chime playing on ${device.name}`);
    } catch (err) {
      setCastStatusText(`Speaker test failed on ${device.name}: ${err.message}`);
    } finally {
      setTestingDeviceId(null);
    }
  };

  const selectedPlaylist = playlists.find(p => p.id === selectedPlaylistId) || null;

  return (
    <div className="app-shell">
      <div className="main-split">
        {/* Left Navigation Sidebar */}
        <aside className="sidebar" style={{ width: sidebarResize.size, minWidth: sidebarResize.size }}>
          <div className="brand">
            <div className="brand-icon"><Icon name="film" size={20} /></div>
            <div>
              <div className="brand-title">RobOS Movie</div>
              <div className="brand-sub">Cinema &amp; Cast Studio</div>
            </div>
          </div>

          <nav className="nav-list">
            {[
              { id: 'now-playing', icon: 'film', label: 'Now Playing' },
              { id: 'playlists', icon: 'list', label: 'Playlists' },
              { id: 'library', icon: 'disc', label: 'Library', badge: libraryAgg.summary.trackCount ? libraryAgg.summary.trackCount.toLocaleString() : null },
              { id: 'cloud', icon: 'cloud', label: 'Cloud Storage', badge: cloudSources.length || null },
              { id: 'ambient', icon: 'waves', label: 'Ambient' },
              { id: 'cast', icon: 'cast', label: 'Cast Devices', badge: castDevices.length || null }
            ].map(tab => (
              <button
                key={tab.id}
                className={`nav-item ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span className="nav-icon"><Icon name={tab.icon} size={16} /></span>
                <span>{tab.label}</span>
                {tab.badge && <span className="nav-badge">{tab.badge}</span>}
              </button>
            ))}
          </nav>

          <div className="sidebar-footer">
            {activeAmbient && (
              <div className="status-pill ambient-pill">
                <Icon name="waves" size={13} /> Ambient: {AMBIENT_PRESETS.find(p => p.id === activeAmbient)?.name}
              </div>
            )}
            {activeCastDevice && (
              <div className="status-pill cast-pill">
                <Icon name="cast" size={13} /> Casting: {activeCastDevice.name}
              </div>
            )}
          </div>
        </aside>

        <div
          className="pane-resizer"
          onMouseDown={sidebarResize.onMouseDown}
          title="Drag to resize navigation sidebar"
        />

        {/* Center Main Stage */}
        <main className="content-area">
          {takeoverBanner && (
            <div className="speaker-takeover-banner">
              <div className="speaker-takeover-text">
                <Icon name="cast" size={15} />
                <span>
                  <strong>{takeoverBanner.deviceName}</strong> was taken over by{' '}
                  <strong>{takeoverBanner.appName || 'another cast session'}</strong>
                  {takeoverBanner.title ? ` (“${takeoverBanner.title}”)` : ''}. Local &amp; Cast playback paused.
                </span>
              </div>
              <button className="btn btn-xs" onClick={dismissTakeover}>Dismiss</button>
            </div>
          )}

          {activeTab === 'now-playing' && (
            <div className="now-playing-view">
              <div className="cinema-stage-card">
                {/* Cinema Video Viewport */}
                <div
                  ref={stageShellRef}
                  className={`video-viewport-shell ${theaterExpanded ? 'theater-expanded' : ''}`}
                  onDoubleClick={handleToggleFullscreen}
                >
                  <video
                    ref={videoRef}
                    src={currentSrc || undefined}
                    poster={currentArtUrl || undefined}
                    className={`cinema-video-element fit-${videoFit}`}
                    playsInline
                    onClick={togglePlayPause}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    onTimeUpdate={(e) => {
                      const t = e.currentTarget.currentTime || 0;
                      setCurrentTime(t);
                      const a = getAudioEl();
                      if (a && Math.abs((a.currentTime || 0) - t) > 0.6) {
                        a.currentTime = t;
                      }
                    }}
                    onLoadedMetadata={(e) => {
                      const d = e.currentTarget.duration || currentTrack?.duration || 0;
                      setDuration(d);
                    }}
                    onEnded={handleTrackEnded}
                  />

                  {!currentTrack && (
                    <div className="video-idle-backdrop">
                      <Icon name="film" size={44} />
                      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-main)' }}>
                        RobOS Cinema Stage Ready
                      </div>
                      <div style={{ fontSize: 13 }}>
                        Choose a film from your Library, Playlists, or Cloud Storage to begin screening.
                      </div>
                    </div>
                  )}

                  {subtitlesEnabled && activeSubtitleCue && activeSubtitleCue.text && (
                    <div className="video-subtitle-overlay">
                      <div className="video-subtitle-pill">{activeSubtitleCue.text}</div>
                    </div>
                  )}
                </div>

                {/* Video Stage Toolbar (Speed, Aspect Fit, Subtitles, Snapshot, PiP, Fullscreen) */}
                <div className="video-stage-toolbar">
                  <div className="video-stage-toolbar-group">
                    <span className="video-badge-pill">
                      <Icon name="tv" size={12} />
                      {currentTrack?.resolution || '1080p'}
                    </span>
                    {currentTrack?.videoCodec && (
                      <span className="video-badge-pill">{currentTrack.videoCodec}</span>
                    )}
                    {currentTrack?.year && (
                      <span className="video-badge-pill">{currentTrack.year}</span>
                    )}
                    {currentTrack?.genre && (
                      <span className="video-badge-pill">{currentTrack.genre}</span>
                    )}
                    {snapshotNotice && (
                      <span className="pill" style={{ color: 'var(--accent)' }}>{snapshotNotice}</span>
                    )}
                  </div>

                  <div className="video-stage-toolbar-group">
                    <button
                      className={`btn btn-xs ${subtitlesEnabled ? 'btn-accent' : ''}`}
                      onClick={() => setSubtitlesEnabled(v => !v)}
                      title="Toggle on-screen closed captions / subtitles"
                    >
                      <Icon name="subtitles" size={13} /> CC {subtitlesEnabled ? 'On' : 'Off'}
                    </button>
                    <button
                      className="btn btn-xs"
                      onClick={handleCycleSpeed}
                      title="Cycle video playback speed (0.5x – 2x)"
                    >
                      Speed: {playbackRate}x
                    </button>
                    <button
                      className="btn btn-xs"
                      onClick={handleCycleVideoFit}
                      title="Cycle video aspect fit (Contain, Cover, Stretch)"
                    >
                      Fit: {videoFit.toUpperCase()}
                    </button>
                    <button
                      className={`btn btn-xs ${theaterExpanded ? 'btn-active-pill' : ''}`}
                      onClick={() => setTheaterExpanded(v => !v)}
                      title="Toggle expanded theater screen height"
                    >
                      Theater
                    </button>
                    <button
                      className="btn btn-xs"
                      onClick={handleCaptureSnapshot}
                      disabled={!currentTrack}
                      title="Capture PNG frame snapshot to ~/Pictures/RobOS Movie Snapshots"
                    >
                      <Icon name="camera" size={13} /> Frame
                    </button>
                    <button
                      className="btn btn-xs"
                      onClick={handleTogglePiP}
                      disabled={!currentTrack}
                      title="Toggle Picture-in-Picture floating window"
                    >
                      <Icon name="pip" size={13} /> PiP
                    </button>
                    <button
                      className="btn btn-xs"
                      onClick={handleToggleFullscreen}
                      title="Toggle Fullscreen cinema view"
                    >
                      <Icon name="fullscreen" size={13} /> Fullscreen
                    </button>
                  </div>
                </div>

                {/* Movie Title & Director Metadata Strip */}
                <div className="video-meta-strip">
                  <div className="video-meta-strip-left">
                    <div className="video-mini-poster">
                      {currentArtUrl ? (
                        <img src={currentArtUrl} alt={currentTrack?.title || 'Poster'} />
                      ) : (
                        <Icon name="film" size={24} />
                      )}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <h2 className="hero-title" style={{ fontSize: 18, margin: 0 }}>
                        {currentTrack ? currentTrack.title : 'No Movie Loaded'}
                      </h2>
                      <div className="hero-artist" style={{ fontSize: 13 }}>
                        {currentTrack
                          ? `${currentTrack.artist} — ${currentTrack.album}`
                          : 'Scan a local folder, open a video file, or stream from Cloud Storage'}
                      </div>
                    </div>
                  </div>
                  <div className="hero-badges">
                    {currentTrack?.source === 'cloud' && <span className="pill">CLOUD STREAM</span>}
                    {activeCastDevice && <span className="pill">CAST: {activeCastDevice.name}</span>}
                  </div>
                </div>

                {/* Transport Deck */}
                <div className="transport-deck">
                  <div className="rhap-deck-wrapper">
                    <AudioPlayer
                      ref={playerRef}
                      src={currentSrc}
                      autoPlay={false}
                      showSkipControls={true}
                      showJumpControls={true}
                      progressJumpSteps={{ backward: 10000, forward: 10000 }}
                       onClickPrevious={handlePrev}
                      onClickNext={handleNext}
                      onEnded={handleTrackEnded}
                      onPlay={() => {
                        setIsPlaying(true);
                        if (videoRef.current && videoRef.current.paused && !activeCastDevice) {
                          videoRef.current.play().catch(() => {});
                        }
                      }}
                      onPause={() => {
                        setIsPlaying(false);
                        if (videoRef.current && !videoRef.current.paused) {
                          videoRef.current.pause();
                        }
                      }}
                      onSeeked={(e) => {
                        const t = e.target.currentTime || 0;
                        setCurrentTime(t);
                        if (videoRef.current && Math.abs((videoRef.current.currentTime || 0) - t) > 0.3) {
                          videoRef.current.currentTime = t;
                        }
                        if (activeCastDevice) window.robosAudio.castControl('seek', t);
                      }}
                      onVolumeChange={(e) => {
                        const v = e.target.volume;
                        setVolume(v);
                        if (videoRef.current) videoRef.current.volume = activeCastDevice ? 0 : v;
                      }}
                      listenInterval={250}
                      className="robos-rhap-theme"
                    />
                    <div className="deck-mode-toggles">
                      <button
                        className={`btn-icon ${shuffle ? 'active' : ''}`}
                        onClick={() => setShuffle(!shuffle)}
                        title="Shuffle Watchlist"
                      >
                        <Icon name="shuffle" size={15} />
                      </button>
                      <button
                        className={`btn-icon ${repeat ? 'active' : ''}`}
                        onClick={() => setRepeat(!repeat)}
                        title="Repeat Movie / Queue"
                      >
                        <Icon name="repeat" size={15} />
                      </button>
                    </div>
                  </div>

                  {/* Quick Smart TV / Cast Selector Bar */}
                  <div className="quick-cast-bar">
                    <div className="quick-cast-left">
                      <Icon name="cast" size={14} />
                      <span className="quick-cast-label">Screen Output:</span>
                      <select
                        className="select-sm"
                        value={activeCastDevice ? activeCastDevice.id : '__local__'}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '__local__') {
                            if (activeCastDevice) handleSelectCastDevice(activeCastDevice);
                          } else {
                            const dev = castDevices.find(d => d.id === val);
                            if (dev) handleSelectCastDevice(dev);
                          }
                        }}
                      >
                        <option value="__local__">Local Cinema Stage (This Display)</option>
                        {castDevices.map(dev => (
                          <option key={dev.id} value={dev.id}>
                            {dev.name} ({dev.host})
                          </option>
                        ))}
                      </select>
                      {activeCastDevice && (
                        <button
                          className="btn btn-xs"
                          disabled={testingDeviceId === activeCastDevice.id}
                          onClick={() => handleTestCastSpeaker(activeCastDevice)}
                        >
                          {testingDeviceId === activeCastDevice.id ? 'Testing…' : 'Test TV Chime'}
                        </button>
                      )}
                    </div>
                    <button
                      className="btn btn-xs"
                      onClick={() => setActiveTab('cast')}
                      title="Manage Smart TVs, Chromecasts & speakers"
                    >
                      Manage TVs ({castDevices.length})
                    </button>
                  </div>
                </div>
              </div>

              {virtualDjEnabled && (virtualDj.djSpeaking || virtualDj.djStatus || virtualDj.currentIntroText) && (
                <div className={`virtual-dj-banner ${virtualDj.djSpeaking ? 'speaking' : ''}`}>
                  <div className="virtual-dj-left">
                    <Icon name="mic" size={15} />
                    <span className="virtual-dj-badge">Virtual Cinema Host</span>
                    <span className="virtual-dj-text">
                      {virtualDj.djStatus || virtualDj.currentIntroText}
                    </span>
                  </div>
                  <button
                    className="btn btn-xs"
                    onClick={() => setVirtualDjEnabled(false)}
                    title="Turn off Virtual Cinema Host"
                  >
                    Turn Off Host
                  </button>
                </div>
              )}

              <LyricsPanel
                currentTrack={currentTrack}
                currentTime={currentTime}
                onSeek={handleSeekTo}
                onActiveCueChange={setActiveSubtitleCue}
              />
            </div>
          )}

          {activeTab === 'playlists' && (
            <div className="playlists-view">
              <div className="playlists-sidebar">
                <div className="playlist-create-row">
                  <input
                    type="text"
                    placeholder="New watchlist name..."
                    value={newPlaylistName}
                    onChange={(e) => setNewPlaylistName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCreatePlaylist()}
                    className="input"
                  />
                  <button className="btn btn-accent" onClick={handleCreatePlaylist}>+</button>
                </div>
                <div className="playlist-io-row">
                  <button
                    className="btn btn-sm btn-accent"
                    onClick={() => setAiModalOpen(true)}
                    title="Create a movie marathon watchlist with AI + optional Virtual Cinema Host"
                  >
                    <Icon name="sparkles" size={13} /> ✦ AI Watchlist
                  </button>
                  <button className="btn btn-sm" onClick={handleImportM3U}>Import M3U</button>
                  {selectedPlaylist && (
                    <button className="btn btn-sm" onClick={() => window.robosAudio.exportM3U(selectedPlaylist)}>
                      Export M3U
                    </button>
                  )}
                </div>
                <div className="playlist-list">
                  {playlists.map(pl => (
                    <div
                      key={pl.id}
                      className={`playlist-card ${pl.id === selectedPlaylistId ? 'active' : ''}`}
                      onClick={() => setSelectedPlaylistId(pl.id)}
                    >
                      <div>
                        <div className="playlist-card-name">
                          {pl.aiGenerated && <span className="ai-sparkle-prefix">✦ </span>}
                          {pl.name}
                        </div>
                        <div className="playlist-card-count">
                          {(pl.tracks || []).length} movies
                          {pl.virtualDj ? ' • Host' : ''}
                        </div>
                      </div>
                      {pl.id !== 'favorites' && (
                        <button
                          className="btn-icon"
                          onClick={(e) => { e.stopPropagation(); handleDeletePlaylist(pl.id); }}
                          title="Delete watchlist"
                        >✕</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="playlist-detail">
                {selectedPlaylist ? (
                  <>
                    <div className="section-header">
                      <div>
                        <h2>{selectedPlaylist.name}</h2>
                        <p className="muted">{selectedPlaylist.description || 'Custom movie watchlist'}</p>
                      </div>
                      <div className="header-actions">
                        <button
                          className={`btn btn-sm ${virtualDjEnabled ? 'btn-accent' : ''}`}
                          onClick={() => setVirtualDjEnabled(v => !v)}
                          title="Speak short cinema host intros between movies using RobOS Voice"
                        >
                          <Icon name="mic" size={14} /> Virtual Host: {virtualDjEnabled ? 'On' : 'Off'}
                        </button>
                        <button
                          className="btn btn-accent"
                          disabled={(selectedPlaylist.tracks || []).length === 0}
                          onClick={() => {
                            if (selectedPlaylist.virtualDj && !virtualDjEnabled) {
                              setVirtualDjEnabled(true);
                            }
                            if (selectedPlaylist.djStyle) setDjStyle(selectedPlaylist.djStyle);
                            handlePlayTrack(selectedPlaylist.tracks[0], selectedPlaylist.tracks);
                            setActiveTab('now-playing');
                          }}
                        >
                          <Icon name="play" size={14} /> Screen Watchlist
                        </button>
                        <button
                          className="btn btn-sm"
                          disabled={(selectedPlaylist.tracks || []).length === 0}
                          onClick={() => handleCastEntirePlaylist(selectedPlaylist)}
                          title="Cast entire watchlist queue to a Google TV or Chromecast"
                        >
                          <Icon name="cast" size={14} /> Cast Watchlist
                        </button>
                      </div>
                    </div>
                    <div className="track-table">
                      {(selectedPlaylist.tracks || []).length === 0 ? (
                        <div className="empty-state">
                          No movies in this watchlist yet. Right-click any movie in the Library tab to add it.
                        </div>
                      ) : (
                        selectedPlaylist.tracks.map((track, idx) => (
                          <div
                            key={`${track.path}-${idx}`}
                            className="track-row"
                            onDoubleClick={() => {
                              handlePlayTrack(track, selectedPlaylist.tracks);
                              setActiveTab('now-playing');
                            }}
                          >
                            <span className="track-idx">{idx + 1}</span>
                            <CoverThumb artId={track.artId} fallback="film" className="vt-art" />
                            <div className="track-main">
                              <div className="track-title">
                                {track.title}
                                {track.resolution && (
                                  <span className="vt-cloud-pill" style={{ marginLeft: 8 }}>{track.resolution}</span>
                                )}
                              </div>
                              <div className="track-sub">{track.artist} • {track.album}</div>
                            </div>
                            <span className="track-dur">{formatTime(track.duration)}</span>
                            <div className="playlist-row-actions">
                              <button
                                className="btn-icon"
                                disabled={idx === 0}
                                onClick={() => handleMovePlaylistTrack(selectedPlaylist.id, idx, idx - 1)}
                                title="Move up"
                              >↑</button>
                              <button
                                className="btn-icon"
                                disabled={idx === selectedPlaylist.tracks.length - 1}
                                onClick={() => handleMovePlaylistTrack(selectedPlaylist.id, idx, idx + 1)}
                                title="Move down"
                              >↓</button>
                              <button
                                className="btn-icon"
                                onClick={() => handleRemoveTrackFromPlaylist(selectedPlaylist.id, track.path)}
                                title="Remove from watchlist"
                              >✕</button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </>
                ) : (
                  <div className="empty-state">Select or create a watchlist</div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'library' && (
            <LibraryBrowser
              summary={libraryAgg.summary}
              albums={libraryAgg.albums}
              artists={libraryAgg.artists}
              genres={libraryAgg.genres}
              decades={libraryAgg.decades}
              composers={libraryAgg.composers}
              folders={libraryAgg.folders}
              currentTrack={currentTrack}
              isPlaying={isPlaying}
              scanStatus={scanStatus}
              playlists={playlists}
              onPlayTrack={(track, ctx) => {
                handlePlayTrack(track, ctx);
                setActiveTab('now-playing');
              }}
              onQueueTrack={(track) => setQueue(prev => [...prev, track])}
              onQueueTracks={(tracks) => setQueue(prev => [...prev, ...tracks])}
              onAddTrackToPlaylist={handleAddTrackToPlaylist}
              onOpenAiPlaylist={() => setAiModalOpen(true)}
              onOpenFixMetadata={handleOpenFixMetadata}
              onLibraryChanged={(agg) => setLibraryAgg(agg)}
              onAddFolder={handleAddFolder}
              onAddFiles={handleAddFiles}
              onRescan={handleRescan}
            />
          )}

          {activeTab === 'cloud' && (
            <CloudBrowser
              cloudSources={cloudSources}
              cloudCache={cloudCache}
              onIndexCloudSource={handleIndexCloudSource}
              onRemoveCloudSourceTracks={handleRemoveCloudSourceTracks}
              onPlayCloudItem={handlePlayCloudItem}
              onOpenDataSources={() => window.robosAudio.openDataSourcesApp()}
              onRefreshCloudSources={async () => {
                const cs = await window.robosAudio.getCloudSources();
                if (cs) {
                  setCloudSources(cs.sources || []);
                  setCloudCache(cs.cache || null);
                }
              }}
            />
          )}

          {activeTab === 'ambient' && (
            <div className="ambient-view">
              <div className="section-header">
                <div>
                  <h2>Theater &amp; Focus Soundscapes</h2>
                  <p className="muted">Procedural Web Audio API theater atmospheres — can play solo or layer beneath movies</p>
                </div>
                <div className="ambient-vol">
                  <span>Ambient Volume</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={ambientVolume}
                    onChange={(e) => handleAmbientVolume(parseFloat(e.target.value))}
                  />
                </div>
              </div>
              <div className="ambient-grid">
                {AMBIENT_PRESETS.map(preset => {
                  const active = activeAmbient === preset.id;
                  return (
                    <div
                      key={preset.id}
                      className={`ambient-card ${active ? 'active' : ''}`}
                      style={{ '--ambient-color': preset.color }}
                      onClick={() => toggleAmbient(preset.id)}
                    >
                      <div className="ambient-card-header">
                        <span className="ambient-dot" style={{ background: preset.color }} />
                        <span className="ambient-status">{active ? 'PLAYING' : 'CLICK TO START'}</span>
                      </div>
                      <h3>{preset.name}</h3>
                      <p className="muted">{preset.desc}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'cast' && (
            <div className="cast-view">
              <div className="section-header">
                <div>
                  <h2>Smart TVs, Chromecast &amp; Speakers (Zero-Cloud LAN)</h2>
                  <p className="muted">
                    Discovers Google TV, Chromecast, Nest Hub, and Cast devices via mDNS (<code>_googlecast._tcp.local</code>) and streams local or cloud movies over HTTP Range.
                  </p>
                </div>
                <button
                  className="btn btn-sm"
                  onClick={() => window.robosAudio.getCastDevices().then(setCastDevices)}
                >
                  <Icon name="refresh" size={14} /> Refresh mDNS
                </button>
              </div>

              {castStatusText && <div className="cast-banner">{castStatusText}</div>}

              <div className="cast-grid">
                {castDevices.length === 0 ? (
                  <div className="empty-state">
                    No Google Cast TVs or displays auto-discovered on this network yet. Add one by IP below.
                  </div>
                ) : (
                  castDevices.map(dev => {
                    const connected = activeCastDevice && activeCastDevice.id === dev.id;
                    return (
                      <div key={dev.id} className={`cast-card ${connected ? 'active' : ''}`}>
                        <div className="cast-card-icon"><Icon name="tv" size={22} /></div>
                        <div className="cast-card-info">
                          <div className="cast-card-name">{dev.name}</div>
                          <div className="cast-card-sub">{dev.model} • {dev.host}:{dev.port}</div>
                        </div>
                        <div className="cast-card-actions">
                          <button
                            className="btn btn-sm"
                            disabled={testingDeviceId === dev.id}
                            onClick={() => handleTestCastSpeaker(dev)}
                            title="Play a test chord chime on this TV/speaker"
                          >
                            {testingDeviceId === dev.id ? 'Testing…' : 'Test Chime'}
                          </button>
                          <button
                            className={`btn btn-sm ${connected ? 'btn-danger' : 'btn-accent'}`}
                            onClick={() => handleSelectCastDevice(dev)}
                          >
                            {connected ? 'Disconnect' : 'Cast Here'}
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <CastClockCard castDevices={castDevices} activeCastDevice={activeCastDevice} />
              <CastAmbientCard castDevices={castDevices} activeCastDevice={activeCastDevice} />

              <form className="manual-cast-form" onSubmit={handleAddManualDevice}>
                <h4>Add Smart TV / Chromecast by IP Address</h4>
                <div className="manual-cast-inputs">
                  <input
                    type="text"
                    className="input"
                    placeholder="Living Room Google TV"
                    value={manualName}
                    onChange={(e) => setManualName(e.target.value)}
                  />
                  <input
                    type="text"
                    className="input"
                    placeholder="192.168.1.50"
                    value={manualHost}
                    onChange={(e) => setManualHost(e.target.value)}
                  />
                  <button type="submit" className="btn btn-accent">Add TV / Device</button>
                </div>
              </form>
            </div>
          )}
        </main>

        {!npCollapsed && (
          <div
            className="pane-resizer"
            onMouseDown={queueResize.onMouseDown}
            title="Drag to resize Screening Queue dock"
          />
        )}

        {/* Right-Side Collapsible Screening Queue Dock */}
        <NowPlayingPanel
          queue={queue}
          currentTrack={currentTrack}
          isPlaying={isPlaying}
          collapsed={npCollapsed}
          width={queueResize.size}
          onToggleCollapse={() => setNpCollapsed(c => !c)}
          onPlayTrack={handlePlayTrack}
          onRemoveFromQueue={(idx) => setQueue(prev => prev.filter((_, i) => i !== idx))}
          onMoveQueueItem={(fromIdx, toIdx) => {
            setQueue(prev => {
              const next = [...prev];
              if (toIdx < 0 || toIdx >= next.length) return prev;
              const [item] = next.splice(fromIdx, 1);
              next.splice(toIdx, 0, item);
              return next;
            });
          }}
          onClearQueue={() => { setQueue([]); setCurrentIndex(-1); setIsPlaying(false); }}
        />
      </div>

      {/* Persistent Bottom Mini-Player Bar */}
      <footer className="mini-player-bar">
        <div
          className="mini-track-info"
          onClick={() => setActiveTab('now-playing')}
          style={{ cursor: 'pointer' }}
        >
          <CoverThumb artId={currentTrack?.artId} fallback="film" className="mini-cover" />
          <div className="mini-meta">
            <div className="mini-title">{currentTrack ? currentTrack.title : 'Ready to Screen'}</div>
            <div className="mini-artist">
              {currentTrack
                ? `${currentTrack.artist}${currentTrack.resolution ? ` • ${currentTrack.resolution}` : ''}`
                : `${(libraryAgg.summary.trackCount || 0).toLocaleString()} movies indexed`}
            </div>
          </div>
        </div>

        <div className="mini-transport">
          <button className="btn-icon" onClick={handlePrev} title="Previous Movie"><Icon name="skipBack" size={16} /></button>
          <button className="btn-play-sm" onClick={togglePlayPause} title={isPlaying ? 'Pause' : 'Play'}>
            <Icon name={isPlaying ? 'pause' : 'play'} size={15} />
          </button>
          <button className="btn-icon" onClick={handleNext} title="Next Movie"><Icon name="skipForward" size={16} /></button>
          <span className="mini-time">{formatTime(currentTime)} / {formatTime(duration)}</span>
        </div>

        <div className="mini-extra">
          <button
            className={`btn btn-xs ${virtualDjEnabled ? 'btn-accent' : ''}`}
            onClick={() => setVirtualDjEnabled(v => !v)}
            title="Toggle Virtual Cinema Host spoken introductions between films"
          >
            <Icon name="mic" size={13} /> Host {virtualDjEnabled ? 'On' : 'Off'}
          </button>
          <button
            className="btn btn-xs btn-accent"
            onClick={() => setAiModalOpen(true)}
            title="Create an AI Watchlist"
          >
            <Icon name="sparkles" size={13} /> ✦ AI Watchlist
          </button>
          <button
            className={`btn btn-xs ${activeCastDevice ? 'btn-accent' : ''}`}
            onClick={() => setActiveTab('cast')}
            title="Cast to Smart TV or Chromecast"
          >
            <Icon name="cast" size={13} /> {activeCastDevice ? activeCastDevice.name : 'Cast'}
          </button>
        </div>
      </footer>

      <AiPlaylistModal
        open={aiModalOpen}
        trackCount={libraryAgg.summary.trackCount || 0}
        onClose={() => setAiModalOpen(false)}
        onCreated={handleAiPlaylistCreated}
      />

      <AiFixMetadataModal
        open={fixMetaModal.open}
        selectedTracks={fixMetaModal.tracks}
        totalLibraryTracks={libraryAgg.summary.trackCount || 0}
        onClose={() => setFixMetaModal({ open: false, tracks: [] })}
        onCompleted={handleMetadataFixed}
      />
    </div>
  );
}

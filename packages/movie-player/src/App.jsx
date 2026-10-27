import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import AudioPlayer, { RHAP_UI } from 'react-h5-audio-player';
import { Icon } from './Icon.jsx';
import CloudBrowser from './CloudBrowser.jsx';
import Lyrics from './Lyrics.jsx';
import Library from './Library.jsx';
import NowPlayingPanel from './NowPlayingPanel.jsx';
import TrackInfo from './TrackInfo.jsx';
import { AiPlaylistModal, DjSettingsModal } from './AiPlaylist.jsx';
import { AiFixMetadataModal } from './AiFixMetadata.jsx';
import { Splitter, useColumns, useLayoutPref } from './resizable.jsx';
import { castClock, CastProgress, useCastPlaying } from './castClock.jsx';
import { useVirtualDj } from './useVirtualDj.js';
import { useSpeakerTakeover } from './useSpeakerTakeover.js';
import { LibraryContext, ContextMenu, LoveButton, Cover, artUrlFor } from './library-ui.jsx';
import { albumKeyOf, fold, splitGenres, sortTracks } from '../lib/library-index.js';

const DEFAULT_QUEUE = [
  {
    id: 'default-1',
    title: 'RobOS Lo-Fi Synth Session',
    artist: 'Procedural Ambient Engine',
    album: 'RobOS Focus Series',
    src: 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=lofi-study-112191.mp3'
  }
];
const QUEUE_KEY = 'robos-movie-player.queue.v1';
const PLAYER_PREFS_KEY = 'robos-movie-player.player-prefs.v1';
const MAX_SAVED_QUEUE = 5000;
const VIDEO_EXT_RE = /\.(mp4|mkv|webm|mov|m4v|avi|ogv|ts|m2ts|mpg|mpeg|flv|wmv|3gp)(\?|$)/i;
const isVideoTrack = (t) => !!(t && (VIDEO_EXT_RE.test(t.filePath || '') || VIDEO_EXT_RE.test(t.src || '') || t.genre === 'Movies'));

function loadJson(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}

// The queue (and position) survives restarts, like VLC's last playlist.
function restoredQueue() {
  const saved = loadJson(QUEUE_KEY);
  if (saved && Array.isArray(saved.queue) && saved.queue.length) {
    return { queue: saved.queue, index: Math.max(0, Math.min(saved.index || 0, saved.queue.length - 1)) };
  }
  return { queue: DEFAULT_QUEUE, index: 0 };
}

const fileUrl = (filePath) => `file://${filePath.split('/').map(encodeURIComponent).join('/')}`;

const PLAYLIST_SIDEBAR_WIDTH = 270;
const PLAYLIST_COLUMNS = [
  { key: 'num', width: '36px', fixed: true },
  { key: 'title', label: 'Title', width: 'minmax(0, 3fr)', fill: true },
  { key: 'artist', label: 'Release Format', width: 'minmax(0, 2fr)', min: 60 },
  { key: 'album', label: 'Release / Series', width: 'minmax(0, 2fr)', min: 60 },
  { key: 'duration', label: 'Runtime', width: '75px', min: 56 },
  { key: 'actions', width: '120px', fixed: true },
];

export default function App() {
  const [initial] = useState(restoredQueue);
  const [playerPrefs] = useState(() => loadJson(PLAYER_PREFS_KEY) || {});
  const [activeTab, setActiveTab] = useState('player'); // 'player' | 'playlists' | 'library' | 'cloud' | 'ambient' | 'speakers'
  const [playlist, setPlaylist] = useState(initial.queue);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(initial.index);
  const [folders, setFolders] = useState([]);
  const [syncingFolder, setSyncingFolder] = useState(null);
  const [outputTarget, setOutputTarget] = useState('local'); // 'local' | speaker IP | 'all'
  const [speakers, setSpeakers] = useState([]);
  const [library, setLibrary] = useState({ tracks: [], artists: [], albums: [] });
  const [stats, setStats] = useState({});
  const [artBase, setArtBase] = useState({ local: null, cast: null });
  const [repeatMode, setRepeatMode] = useState(playerPrefs.repeat || 'all'); // 'off' | 'all' | 'one'
  const [shuffleMode, setShuffleMode] = useState(!!playerPrefs.shuffle);
  const [dockCollapsed, setDockCollapsed] = useState(!!playerPrefs.dockCollapsed);
  const [playlistSidebarWidth, setPlaylistSidebarWidth] = useLayoutPref('playlistSidebarWidth', PLAYLIST_SIDEBAR_WIDTH);
  const playlistColumns = useColumns('playlist', PLAYLIST_COLUMNS);
  const [libNav, setLibNav] = useState(() => {
    const saved = playerPrefs.librarySection;
    // Default to All Movies & Shows ('albums') so the user opens directly into the Plex/Netflix visual library
    const initialSection = (!saved || saved === 'songs') ? 'albums' : saved;
    return [{ section: initialSection }];
  });
  const [menu, setMenu] = useState(null);
  const [infoTrack, setInfoTrack] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isScanningLibrary, setIsScanningLibrary] = useState(false);
  const [libraryScanStatus, setLibraryScanStatus] = useState(null);
  const [activeCastSession, setActiveCastSession] = useState(null); // { ip, trackId, filePath, isPaused }
  const [statusMsg, setStatusMsg] = useState('');
  const [activeAmbient, setActiveAmbient] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // ── Playlist Management State ──────────────────────────────────────────────
  const [playlists, setPlaylists] = useState([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState(null);
  const [showCreatePlaylistModal, setShowCreatePlaylistModal] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [newPlaylistDesc, setNewPlaylistDesc] = useState('');
  const [showSaveQueueModal, setShowSaveQueueModal] = useState(false);
  const [saveQueueName, setSaveQueueName] = useState('');
  const [saveQueueDesc, setSaveQueueDesc] = useState('');
  const [tracksForPlaylist, setTracksForPlaylist] = useState(null);
  const [showAiPlaylist, setShowAiPlaylist] = useState(false);
  const [showDjSettings, setShowDjSettings] = useState(false);
  const [tracksForAiFix, setTracksForAiFix] = useState(null); // null = closed, [] = open for library, [t1, t2] = open for subset
  // Agent, model and effort picked in <robos-agent-selector>, remembered between sessions.
  const [aiAgent, setAiAgent] = useState(playerPrefs.aiAgent || null);
  const [quickPlaylistName, setQuickPlaylistName] = useState('');

  const playerRef = useRef(null);
  const videoRef = useRef(null);
  const [videoFit, setVideoFit] = useState('contain');
  const getMediaEl = () => (isVideoTrack(latestRef.current.currentTrack) && videoRef.current) ? videoRef.current : playerRef.current?.audio?.current;
  const audioCtxRef = useRef(null);
  const ambientNodeRef = useRef(null);
  const toastTimerRef = useRef(null);
  const searchInputRef = useRef(null);
  const playedRef = useRef({ key: null, counted: false });
  const shuffleHistoryRef = useRef([]);
  const latestRef = useRef({});

  const formatDuration = (sec) => {
    if (!sec || isNaN(sec)) return '--:--';
    const totalSec = Math.round(sec);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const formatTotalDuration = (tracks) => {
    if (!tracks || !tracks.length) return '0 min';
    const totalSec = tracks.reduce((acc, t) => acc + (t.duration || 0), 0);
    const mins = Math.floor(totalSec / 60);
    const hours = Math.floor(mins / 60);
    if (hours > 0) {
      return `${hours}h ${mins % 60}m`;
    }
    return `${mins} min`;
  };

  const getSpeakerName = (ip) => {
    if (!ip) return 'Smart TV';
    if (ip === 'local') return 'Desktop (Local Cinema)';
    if (ip === 'all') return 'All RobOS Smart TVs';
    const found = speakers.find(s => s.ip === ip);
    return found ? found.name : `Smart TV (${ip})`;
  };

  // ── Initial Load & Speaker Discovery ──────────────────────────────────────

  useEffect(() => {
    refreshSpeakers(false);
    loadLibrary();
    loadStats();
    refreshFolders();
    refreshPlaylists();
    if (window.robosAudio?.getArtBase) {
      window.robosAudio.getArtBase().then(base => base && setArtBase(base)).catch(() => {});
    }
    if (window.robosAudio?.getActiveCast) {
      window.robosAudio.getActiveCast().then((active) => {
        if (active && active.active && active.ip) {
          setOutputTarget(active.ip);
          setActiveCastSession({
            ip: active.ip,
            trackId: active.trackId || null,
            title: active.title || null,
            filePath: active.filePath || null,
            isPaused: Boolean(active.isPaused),
          });
          if (active.loadId != null) {
            songLoadsRef.current = new Set([active.loadId]);
          }
          castClock.set({
            position: Number(active.positionSec) || 0,
            duration: Number(active.durationSec) || 0,
            playing: !active.isPaused,
          });
          setIsPlaying(!active.isPaused);
          if (active.trackId) {
            setPlaylist((prev) => {
              const idx = prev.findIndex((t) => t.id === active.trackId);
              if (idx >= 0) setCurrentTrackIndex(idx);
              return prev;
            });
          }
        }
      }).catch(() => {});
    }

    const cleanups = [];
    if (window.robosAudio?.onFoldersUpdated) cleanups.push(window.robosAudio.onFoldersUpdated(applyFolderState));

    if (window.robosAudio?.onLibraryScanDiscovered) {
      cleanups.push(window.robosAudio.onLibraryScanDiscovered((info) => {
        setIsScanningLibrary(true);
        setLibraryScanStatus({
          current: 0,
          total: info.total,
          file: 'Starting background metadata extraction...'
        });
        showStatus(`Discovered ${info.total} audio files. Scanning in background...`);
      }));
    }

    if (window.robosAudio?.onLibraryScanProgress) {
      cleanups.push(window.robosAudio.onLibraryScanProgress((p) => {
        setIsScanningLibrary(true);
        setLibraryScanStatus(p);
      }));
    }

    if (window.robosAudio?.onLibraryScanBatch) {
      cleanups.push(window.robosAudio.onLibraryScanBatch((batch) => {
        // Scanned tracks go to the library only; the play queue stays what the user built.
        if (batch.library) {
          setLibrary(batch.library);
        }
      }));
    }

    if (window.robosAudio?.onLibraryScanComplete) {
      cleanups.push(window.robosAudio.onLibraryScanComplete((done) => {
        setIsScanningLibrary(false);
        setLibraryScanStatus(null);
        if (done.library) setLibrary(done.library);
        refreshFolders();
        showStatus(`Library background scan complete! Found ${done.totalFound} track(s).`);
      }));
    }

    if (window.robosAudio?.onLibraryScanCanceled) {
      cleanups.push(window.robosAudio.onLibraryScanCanceled(() => {
        setIsScanningLibrary(false);
        setLibraryScanStatus(null);
        showStatus('Library background scan canceled.');
      }));
    }

    if (window.robosAudio?.onLibraryScanError) {
      cleanups.push(window.robosAudio.onLibraryScanError((err) => {
        setIsScanningLibrary(false);
        setLibraryScanStatus(null);
        showStatus(`Library scan error: ${err.error}`);
      }));
    }

    if (window.robosAudio?.onSpeakerPlaybackStopped) {
      cleanups.push(window.robosAudio.onSpeakerPlaybackStopped((data) => {
        setActiveCastSession(null);
        castClock.set({ playing: false });
        setIsPlaying(false);
      }));
    }

    if (window.robosAudio?.onSpeakerStatusChange) {
      cleanups.push(window.robosAudio.onSpeakerStatusChange(({ ip, status }) => {
        if (!status) return;
        const L = latestRef.current;
        if (L.outputTarget === 'local' || (L.outputTarget !== 'all' && ip !== L.outputTarget)) return;
        const finished = status.playerState === 'IDLE' && status.idleReason === 'FINISHED';
        // A clip another RobOS app asked for (control API): its end hands back too.
        if (status.role === 'clip') {
          if (finished) L.controlClipFinished(status.loadId);
          return;
        }
        // A Virtual DJ line on the speaker: its end hands back to the music.
        if (status.role === 'dj') {
          if (finished) L.djCastLineFinished();
          return;
        }
        // The speaker is the clock while casting: progress, play counts, song end.
        if (status.currentTime != null) {
          const nextDur = (status.duration && status.duration > 0)
            ? status.duration
            : (castClock.get().duration || (videoRef.current && isFinite(videoRef.current.duration) ? videoRef.current.duration : 0));
          castClock.set({ position: status.currentTime, duration: nextDur, playing: status.playerState === 'PLAYING' });
          if (videoRef.current && videoRef.current.paused && Math.abs((videoRef.current.currentTime || 0) - status.currentTime) > 0.75) {
            syncVideoElementTime(status.currentTime);
          }
          L.countCastPlay(status.currentTime, nextDur);
        } else if (status.playerState) {
          castClock.set({ playing: status.playerState === 'PLAYING' });
        }
        if (finished) {
          const loads = songLoadsRef.current;
          if (!loads.has(status.loadId)) return; // an earlier song, or already handled
          loads.clear();
          setActiveCastSession(null);
          castClock.set({ playing: false, position: castClock.get().duration || castClock.get().position });
          L.castSongFinished();
        } else if (status?.playerState === 'PAUSED') {
          setActiveCastSession(prev => prev ? { ...prev, isPaused: true } : prev);
        } else if (status?.playerState === 'PLAYING') {
          setActiveCastSession(prev => prev ? { ...prev, isPaused: false } : prev);
        }
        if (status.playerState === 'PLAYING' || status.playerState === 'PAUSED') {
          setIsPlaying(status.playerState === 'PLAYING');
        } else if (status.playerState === 'IDLE' && !finished) {
          setIsPlaying(false);
        }
      }));
    }

    return () => {
      cleanups.forEach(fn => { try { fn(); } catch {} });
    };
  }, []);

  const refreshFolders = async () => {
    try {
      const res = await window.robosAudio.listFolders();
      if (res && res.folders) setFolders(res.folders);
    } catch {}
  };

  const applyFolderState = (res) => {
    if (!res) return;
    if (res.folders) setFolders(res.folders);
    if (res.library) setLibrary(res.library);
  };

  const handleRescanFolder = async (id) => {
    setSyncingFolder(id || 'all');
    showStatus(id ? 'Syncing folder...' : 'Syncing all folders...');
    try {
      const res = await window.robosAudio.rescanFolders(id);
      applyFolderState(res);
      showStatus(res.ok ? 'Folder sync finished.' : `Sync problem: ${res.error}`);
    } catch (err) { showStatus(`Sync problem: ${err.message}`); }
    finally { setSyncingFolder(null); }
  };

  const handleRenameFolder = async (id, label) => applyFolderState(await window.robosAudio.renameFolder(id, label));

  const handleFolderEnabled = async (id, enabled) => {
    setSyncingFolder(id);
    try {
      const res = await window.robosAudio.setFolderEnabled(id, enabled);
      applyFolderState(res);
      showStatus(res.ok ? (enabled ? 'Folder synced. Updates will be checked at startup.' : 'Folder sync paused. Existing music stays in your library.') : `Sync problem: ${res.error}`);
    } catch (err) { showStatus(`Sync problem: ${err.message}`); }
    finally { setSyncingFolder(null); }
  };

  const handleRemoveFolder = async (id, removeTracks) => {
    const res = await window.robosAudio.removeFolder(id, removeTracks);
    applyFolderState(res);
    showStatus(removeTracks ? 'Folder and its tracks removed from the library.' : 'Folder removed. Its tracks stay in the library.');
  };

  const showStatus = (msg) => {
    setStatusMsg(msg);
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = setTimeout(() => {
      setStatusMsg('');
      toastTimerRef.current = null;
    }, 4000);
  };

  const refreshSpeakers = async (scanLan = true) => {
    setIsScanning(true);
    if (scanLan) showStatus('Scanning local network & RobOS Smart TV Studio for Smart TVs...');
    try {
      const found = await window.robosAudio.discoverSpeakers({ scanLan });
      setSpeakers(found || []);
      if (scanLan) {
        if (found && found.length > 0) {
          showStatus(`Discovered ${found.length} RobOS Smart TV(s)!`);
        } else {
          showStatus('No Smart TVs responded on local subnet.');
        }
      }
    } catch (err) {
      if (scanLan) showStatus('Discovery error: ' + err.message);
    } finally {
      setIsScanning(false);
    }
  };

  const loadLibrary = async () => {
    try {
      const lib = await window.robosAudio.getLibrary();
      if (lib && lib.tracks) {
        setLibrary(lib);
        if (lib.tracks.length > 0) {
          setPlaylist(prev => (prev.length === 1 && prev[0].id === 'default-1') ? lib.tracks.slice(0, 25) : prev);
        }
      }
    } catch {}
  };

  const loadStats = async () => {
    try {
      if (window.robosAudio?.getTrackStats) setStats((await window.robosAudio.getTrackStats()) || {});
    } catch {}
  };

  const refreshPlaylists = async () => {
    try {
      if (window.robosAudio?.getPlaylists) {
        const list = await window.robosAudio.getPlaylists();
        setPlaylists(list || []);
        if (list && list.length > 0) {
          setSelectedPlaylistId(prev => prev && list.some(p => p.id === prev) ? prev : list[0].id);
        }
      }
    } catch (err) {
      console.error('Error fetching playlists:', err);
    }
  };

  const handleSelectFolder = async () => {
    showStatus('Opening file manager to select music folder(s)...');
    try {
      const res = await window.robosAudio.addLocalFolder();
      if (res && !res.canceled) {
        applyFolderState(res);
        setIsScanningLibrary(true);
        setLibraryScanStatus({ current: 0, total: 0, file: 'Discovering audio files in folder(s)...' });
        showStatus('Folder added to your library. Scanning in the background...');
      }
    } catch (err) {
      showStatus('Error adding folder: ' + err.message);
    }
  };

  const handleCancelScan = async () => {
    try {
      await window.robosAudio.cancelLibraryScan();
      setIsScanningLibrary(false);
      setLibraryScanStatus(null);
      showStatus('Canceled background library scan.');
    } catch (err) {
      showStatus('Error canceling scan: ' + err.message);
    }
  };

  const handleAddFiles = async () => {
    try {
      const res = await window.robosAudio.openFileDialog();
      if (!res.canceled && res.tracks && res.tracks.length > 0) {
        setPlaylist(prev => [...prev, ...res.tracks]);
        showStatus(`Added ${res.tracks.length} track(s) to playlist`);
      }
    } catch (err) {
      showStatus('Error opening files: ' + err.message);
    }
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files);
    if (!droppedFiles.length) return;
    const paths = droppedFiles.map(f => f.path).filter(Boolean);
    if (!paths.length) return;

    showStatus(`Importing ${paths.length} dropped item(s)...`);
    try {
      const res = await window.robosAudio.importPaths(paths);
      if (res && res.tracks && res.tracks.length > 0) {
        setPlaylist(prev => {
          const existingPaths = new Set(prev.map(t => t.filePath));
          const newItems = res.tracks.filter(t => !existingPaths.has(t.filePath));
          return [...prev, ...newItems];
        });
        if (res.library) setLibrary(res.library);
      }
      if (res && res.scanningDirs) {
        setIsScanningLibrary(true);
        showStatus(`Scanning ${res.dirs.length} directory/directories in background...`);
      } else if (res && res.tracks && res.tracks.length > 0) {
        showStatus(`Imported ${res.tracks.length} track(s) into library & queue!`);
      }
    } catch (err) {
      showStatus('Error importing dropped items: ' + err.message);
    }
  };

  // ── Playlist & Queue Handlers ──────────────────────────────────────────────

  const selectedPlaylist = playlists.find(p => p.id === selectedPlaylistId) || playlists[0] || null;

  const handlePlayPlaylist = (pl, replaceQueue = true) => {
    if (!pl || !pl.tracks || pl.tracks.length === 0) {
      showStatus(`Playlist "${pl?.name || 'Playlist'}" has no tracks to play.`);
      return;
    }
    if (replaceQueue && pl.dj && pl.dj.persona) {
      startWithDj(pl);
      return;
    }
    if (replaceQueue) {
      setPlaylist([...pl.tracks]);
      setCurrentTrackIndex(0);
      const first = pl.tracks[0];
      if (outputTarget !== 'local') {
        castTrack(outputTarget, first);
        if (playerRef.current?.audio?.current) {
          playerRef.current.audio.current.muted = true;
          playerRef.current.audio.current.play().catch(() => {});
        }
      } else {
        if (activeCastSession) handleStopCast();
        if (playerRef.current?.audio?.current) {
          playerRef.current.audio.current.muted = false;
          playerRef.current.audio.current.play().catch(() => {});
        }
      }
      showStatus(`Playing playlist "${pl.name}" (${pl.tracks.length} tracks)`);
    } else {
      setPlaylist(prev => [...prev, ...pl.tracks]);
      showStatus(`Appended ${pl.tracks.length} track(s) from "${pl.name}" to queue`);
    }
  };

  const handleAppendPlaylistToQueue = (pl) => {
    if (!pl || !pl.tracks || pl.tracks.length === 0) {
      showStatus(`Playlist "${pl?.name || 'Playlist'}" has no tracks.`);
      return;
    }
    setPlaylist(prev => [...prev, ...pl.tracks]);
    showStatus(`Appended ${pl.tracks.length} track(s) from "${pl.name}" to queue`);
  };

  const castTracks = (tracks, label = null) => {
    if (!tracks || tracks.length === 0) {
      showStatus(`${label ? `"${label}"` : 'Selection'} has no tracks.`);
      return;
    }
    if (!speakers.length) {
      showStatus('No RobOS Smart TVs found yet. Use "Scan Smart TVs" first.');
      return;
    }
    const target = outputTarget !== 'local' ? outputTarget : (speakers[0]?.ip || 'all');
    const list = tracks.map(t => ({ ...t }));
    setOutputTarget(target);
    setPlaylist(list);
    setCurrentTrackIndex(0);
    shuffleHistoryRef.current = [];
    castTrack(target, list[0]);
    playerRef.current?.audio?.current?.pause();
    if (videoRef.current) videoRef.current.pause();
    setIsPlaying(true);
    showStatus(`Casting ${label ? `"${label}"` : `${list.length} movie(s)`} to ${getSpeakerName(target)}!`);
  };

  const handleCastPlaylist = (pl) => castTracks(pl?.tracks, pl?.name || 'Playlist');

  const handleCreatePlaylist = async () => {
    if (!newPlaylistName.trim()) {
      showStatus('Please enter a playlist name');
      return;
    }
    try {
      const created = await window.robosAudio.createPlaylist({
        name: newPlaylistName.trim(),
        description: newPlaylistDesc.trim(),
        tracks: []
      });
      await refreshPlaylists();
      if (created) setSelectedPlaylistId(created.id);
      setNewPlaylistName('');
      setNewPlaylistDesc('');
      setShowCreatePlaylistModal(false);
      showStatus(`Created playlist "${created?.name || newPlaylistName}"!`);
    } catch (err) {
      showStatus('Error creating playlist: ' + err.message);
    }
  };

  const handleDeletePlaylist = async (id) => {
    const pl = playlists.find(p => p.id === id);
    const confirmDelete = window.confirm(`Are you sure you want to delete playlist "${pl?.name || 'this playlist'}"?`);
    if (!confirmDelete) return;
    try {
      await window.robosAudio.deletePlaylist(id);
      const updated = playlists.filter(p => p.id !== id);
      setPlaylists(updated);
      if (selectedPlaylistId === id) {
        setSelectedPlaylistId(updated[0]?.id || null);
      }
      showStatus(`Deleted playlist "${pl?.name || ''}"`);
    } catch (err) {
      showStatus('Error deleting playlist: ' + err.message);
    }
  };

  const handleAddTracksToPlaylist = async (playlistId, tracks) => {
    if (!tracks || !tracks.length) return;
    try {
      await window.robosAudio.addTracksToPlaylist(playlistId, tracks);
      await refreshPlaylists();
      const targetPl = playlists.find(p => p.id === playlistId);
      setTracksForPlaylist(null);
      const what = tracks.length === 1 ? `"${tracks[0].title}"` : `${tracks.length} tracks`;
      showStatus(`Added ${what} to "${targetPl?.name || 'playlist'}"!`);
    } catch (err) {
      showStatus('Error adding to playlist: ' + err.message);
    }
  };

  const handleAddTrackToPlaylist = (playlistId, track) => handleAddTracksToPlaylist(playlistId, [track]);

  const handleCreatePlaylistFromTracks = async () => {
    const tracks = tracksForPlaylist || [];
    const name = quickPlaylistName.trim();
    if (!name) {
      showStatus('Please enter a playlist name');
      return;
    }
    try {
      const created = await window.robosAudio.createPlaylist({ name, description: '', tracks });
      await refreshPlaylists();
      if (created) setSelectedPlaylistId(created.id);
      setQuickPlaylistName('');
      setTracksForPlaylist(null);
      showStatus(`Created playlist "${name}" with ${tracks.length} track(s)!`);
    } catch (err) {
      showStatus('Error creating playlist: ' + err.message);
    }
  };

  const handleRemoveTrackFromPlaylist = async (playlistId, trackIndex) => {
    try {
      await window.robosAudio.removeTrackFromPlaylist(playlistId, trackIndex);
      await refreshPlaylists();
      showStatus('Removed track from playlist');
    } catch (err) {
      showStatus('Error removing track: ' + err.message);
    }
  };

  const handleMoveTrackInPlaylist = async (playlistId, fromIdx, toIdx) => {
    try {
      await window.robosAudio.reorderPlaylistTracks(playlistId, fromIdx, toIdx);
      await refreshPlaylists();
    } catch (err) {
      showStatus('Error reordering playlist: ' + err.message);
    }
  };

  const handleExportM3u = async (plId) => {
    try {
      const res = await window.robosAudio.exportPlaylistM3u(plId);
      if (!res.canceled && res.ok) {
        showStatus(`Playlist exported to ${res.path}`);
      }
    } catch (err) {
      showStatus('Error exporting playlist: ' + err.message);
    }
  };

  const handleImportM3u = async () => {
    try {
      const res = await window.robosAudio.importPlaylistM3u();
      if (!res.canceled && res.playlist) {
        await refreshPlaylists();
        setSelectedPlaylistId(res.playlist.id);
        showStatus(`Imported playlist "${res.playlist.name}" (${res.playlist.tracks.length} tracks)!`);
      }
    } catch (err) {
      showStatus('Error importing M3U: ' + err.message);
    }
  };

  const handleAddFilesToSelectedPlaylist = async () => {
    if (!selectedPlaylistId) return;
    try {
      const res = await window.robosAudio.openFileDialog();
      if (!res.canceled && res.tracks && res.tracks.length > 0) {
        await window.robosAudio.addTracksToPlaylist(selectedPlaylistId, res.tracks);
        await refreshPlaylists();
        showStatus(`Added ${res.tracks.length} track(s) to playlist`);
      }
    } catch (err) {
      showStatus('Error adding files to playlist: ' + err.message);
    }
  };

  const handleSaveQueueAsPlaylist = async () => {
    if (!saveQueueName.trim()) {
      showStatus('Please enter a playlist name');
      return;
    }
    try {
      const created = await window.robosAudio.createPlaylist({
        name: saveQueueName.trim(),
        description: saveQueueDesc.trim() || `Saved queue of ${playlist.length} track(s)`,
        tracks: playlist
      });
      await refreshPlaylists();
      if (created) setSelectedPlaylistId(created.id);
      setSaveQueueName('');
      setSaveQueueDesc('');
      setShowSaveQueueModal(false);
      showStatus(`Saved queue as playlist "${created?.name || saveQueueName}" (${playlist.length} tracks)!`);
    } catch (err) {
      showStatus('Error saving queue as playlist: ' + err.message);
    }
  };

  // ── Queue editing (Now Playing panel) ────────────────────────────────────

  const handleMoveInQueue = (indices, target) => {
    const sorted = [...new Set(indices)].filter(i => i >= 0 && i < playlist.length).sort((a, b) => a - b);
    if (!sorted.length) return;
    const moving = sorted.map(i => playlist[i]);
    const set = new Set(sorted);
    const rest = playlist.filter((_, i) => !set.has(i));
    const pos = Math.max(0, Math.min(rest.length, target - sorted.filter(i => i < target).length));
    const next = [...rest.slice(0, pos), ...moving, ...rest.slice(pos)];
    const current = playlist[currentTrackIndex];
    setPlaylist(next);
    setCurrentTrackIndex(Math.max(0, next.indexOf(current)));
  };

  const handleRemoveFromQueue = (indices) => {
    const set = new Set(indices);
    if (!set.size) return;
    const next = playlist.filter((_, i) => !set.has(i));
    const current = playlist[currentTrackIndex];
    let idx = next.indexOf(current);
    if (idx < 0) {
      const removedBefore = indices.filter(i => i < currentTrackIndex).length;
      idx = Math.min(currentTrackIndex - removedBefore, next.length - 1);
    }
    if (!next.length) {
      playerRef.current?.audio?.current?.pause();
      setIsPlaying(false);
    }
    setPlaylist(next);
    setCurrentTrackIndex(Math.max(0, idx));
    showStatus(set.size === 1 ? 'Removed track from queue' : `Removed ${set.size} tracks from queue`);
  };

  const handleInsertIntoQueue = (tracks, at) => {
    const items = tracks.map(t => ({ ...t }));
    const pos = Math.max(0, Math.min(playlist.length, at));
    setPlaylist([...playlist.slice(0, pos), ...items, ...playlist.slice(pos)]);
    if (playlist.length && pos <= currentTrackIndex) setCurrentTrackIndex(currentTrackIndex + items.length);
    showStatus(`Added ${items.length} track(s) to the queue`);
  };

  const handleSortQueue = (key, dir) => {
    const current = playlist[currentTrackIndex];
    const next = sortTracks(playlist, key, dir, stats);
    setPlaylist(next);
    setCurrentTrackIndex(Math.max(0, next.indexOf(current)));
  };

  const handleShuffleQueue = () => {
    if (playlist.length <= 1) return;
    const current = playlist[currentTrackIndex];
    const rest = playlist.filter((_, idx) => idx !== currentTrackIndex);
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    setPlaylist([current, ...rest]);
    setCurrentTrackIndex(0);
    showStatus('Queue shuffled!');
  };

  const handleClearQueue = () => {
    if (playlist.length <= 1) return;
    const current = playlist[currentTrackIndex];
    setPlaylist([current]);
    setCurrentTrackIndex(0);
    showStatus('Cleared other tracks from queue');
  };


  // ── Track Selection & Routing ─────────────────────────────────────────────

  const currentTrack = playlist[currentTrackIndex] || playlist[0] || null;

  const libraryById = useMemo(() => new Map(library.tracks.map(t => [t.id, t])), [library.tracks]);

  // Cloud stream URLs embed the stream server's port, which changes every launch,
  // so always prefer the library's fresh URL for cloud tracks.
  const resolveSrc = (t) => {
    if (!t) return '';
    if (t.cloud) {
      const fresh = libraryById.get(t.id);
      if (fresh && fresh.src) return fresh.src;
    }
    return t.src || (t.filePath ? fileUrl(t.filePath) : '');
  };

  const handleStopCast = async (targetIp = null) => {
    const ipToStop = targetIp || activeCastSession?.ip || (outputTarget !== 'local' ? outputTarget : null);
    showStatus(`Stopping playback on ${ipToStop ? getSpeakerName(ipToStop) : 'speakers'}...`);
    try {
      if (ipToStop && ipToStop !== 'all') {
        await window.robosAudio.castStop(ipToStop);
      } else {
        await window.robosAudio.castStopAll();
      }
      setActiveCastSession(null);
      castClock.set({ playing: false });
      setIsPlaying(false);
      if (playerRef.current?.audio?.current) {
        playerRef.current.audio.current.pause();
      }
      showStatus('Cast playback stopped.');
    } catch (err) {
      showStatus('Error stopping cast: ' + err.message);
    }
  };

  const handleToggleCastPause = async () => {
    if (!activeCastSession?.ip) return;
    try {
      if (activeCastSession.isPaused) {
        await window.robosAudio.castResume(activeCastSession.ip);
        setActiveCastSession(prev => ({ ...prev, isPaused: false }));
        castClock.set({ playing: true });
        setIsPlaying(true);
        showStatus(`Resumed cast on ${getSpeakerName(activeCastSession.ip)}`);
      } else {
        await window.robosAudio.castPause(activeCastSession.ip);
        setActiveCastSession(prev => ({ ...prev, isPaused: true }));
        castClock.set({ position: castClock.now(), playing: false });
        setIsPlaying(false);
        showStatus(`Paused cast on ${getSpeakerName(activeCastSession.ip)}`);
      }
    } catch (err) {
      showStatus('Error toggling pause: ' + err.message);
    }
  };

  // Where to continue locally after switching back from a speaker.
  const pendingLocalSeekRef = useRef(null);
  //Loads (one per speaker) of the song now playing; a speaker reports "finished"
  // more than once, and only the first report for the current song moves on.
  const songLoadsRef = useRef(new Set());
  const internalVideoSyncTimeoutRef = useRef(null);
  const lastProgrammaticVideoSeekRef = useRef({ time: 0, target: 0 });

  const syncVideoElementTime = (targetSec) => {
    const v = videoRef.current;
    if (!v || !isFinite(targetSec)) return;
    lastProgrammaticVideoSeekRef.current = { time: Date.now(), target: targetSec };
    try { v.currentTime = targetSec; } catch {}
  };

  const getRealTrackDuration = (track) => {
    const v = videoRef.current;
    if (v && isFinite(v.duration) && v.duration > 0) return v.duration;
    const a = playerRef.current?.audio?.current;
    if (a && isFinite(a.duration) && a.duration > 0) return a.duration;
    return Number(track?.duration) > 0 ? Number(track.duration) : 0;
  };

  const handleCastSeek = (seconds) => {
    const targetSec = Math.max(0, Number(seconds) || 0);
    castClock.set({ position: targetSec });
    if (videoRef.current && Math.abs((videoRef.current.currentTime || 0) - targetSec) > 0.5) {
      syncVideoElementTime(targetSec);
    }
    if (outputTarget !== 'local') window.robosAudio.castSeek(outputTarget, targetSec).catch(() => {});
  };

  const castTrack = async (speakerIp, track, { startAt = 0 } = {}) => {
    if (!speakerIp || speakerIp === 'local' || !track) return;
    const knownDuration = getRealTrackDuration(track);
    castClock.set({ position: startAt || 0, duration: knownDuration, playing: true });
    const loads = new Set();
    songLoadsRef.current = loads;
    const remember = (res) => { if (res && res.loadId != null) loads.add(res.loadId); return res; };
    showStatus(`Casting "${track.title}" to ${getSpeakerName(speakerIp)}...`);
    const metadata = {
      title: track.title,
      artist: track.artist,
      album: track.album,
      duration: knownDuration,
    };
    if (startAt > 0) metadata.currentTime = startAt;
    const castArt = artUrlFor(artBase.cast, track.artId);
    if (castArt) {
      metadata.images = [{ url: castArt }];
    }

    try {
      if (speakerIp === 'all') {
        for (const s of speakers) {
          if (track.filePath) window.robosAudio.castFile(s.ip, track.filePath, metadata).then(remember);
          else if (track.src) window.robosAudio.castUrl(s.ip, track.src, metadata).then(remember);
        }
        setActiveCastSession({ ip: 'all', trackId: track.id, filePath: track.filePath, isPaused: false });
      } else {
        if (track.filePath) {
          remember(await window.robosAudio.castFile(speakerIp, track.filePath, metadata));
        } else if (track.src) {
          remember(await window.robosAudio.castUrl(speakerIp, track.src, metadata));
        }
        setActiveCastSession({ ip: speakerIp, trackId: track.id, filePath: track.filePath, isPaused: false });
      }
      showStatus(`Streaming "${track.title}" to ${getSpeakerName(speakerIp)}!`);
    } catch (err) {
      showStatus('Error casting track: ' + err.message);
      setActiveCastSession(null);
    }
  };

  // Routes a track that was just made current to the speaker or local output.
  // `sameSrc` restarts the audio element when the source didn't change.
  const beginPlayback = (trackToPlay, sameSrc = false) => {
    const audio = playerRef.current?.audio?.current;
    playedRef.current = { key: null, counted: false };
    if (sameSrc && audio) audio.currentTime = 0;
    if (outputTarget !== 'local') {
      // The speaker plays it; the local player stays silent and idle.
      castTrack(outputTarget, trackToPlay);
      if (audio) audio.pause();
    } else {
      if (activeCastSession) handleStopCast();
      if (audio) {
        audio.muted = false;
      }
      setTimeout(() => {
        const el = isVideoTrack(trackToPlay) && videoRef.current ? videoRef.current : playerRef.current?.audio?.current;
        if (el) {
          el.muted = false;
          el.play().catch((err) => {
            console.warn('[MoviePlayer] Playback error:', err);
          });
        }
      }, 80);
    }
    setIsPlaying(true);
  };

  /**
   * Replace the queue with `tracks` and start at `startIndex` — what double-click
   * and every "Play" button in the library do.
   */
  const playTracks = (tracks, startIndex = 0, { shuffle = false } = {}) => {
    if (!tracks || !tracks.length) return;
    const list = tracks.map(t => ({ ...t }));
    let idx = Math.max(0, Math.min(startIndex, list.length - 1));
    if (shuffle) {
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
      }
      idx = 0;
    }
    const first = list[idx];
    if (first.filePath && !first.cloud && window.robosAudio?.ensureFileAccessible) {
      window.robosAudio.ensureFileAccessible(first.filePath).catch(() => {});
    }
    const sameSrc = resolveSrc(first) === resolveSrc(currentTrack);
    shuffleHistoryRef.current = [];
    setPlaylist(list);
    setCurrentTrackIndex(idx);
    beginPlayback(first, sameSrc);
    showStatus(list.length === 1
      ? `Playing "${first.title}" by ${first.artist || 'Unknown'}`
      : `${shuffle ? 'Shuffling' : 'Playing'} ${list.length} tracks — starting with "${first.title}"`);
  };

  // "Play next" inserts right after the playing track; "end" appends.
  const queueTracks = (tracks, where = 'end') => {
    if (!tracks || !tracks.length) return;
    const items = tracks.map(t => ({ ...t }));
    if (!playlist.length) {
      setPlaylist(items);
      setCurrentTrackIndex(0);
    } else if (where === 'next') {
      const at = Math.min(playlist.length, currentTrackIndex + 1);
      setPlaylist([...playlist.slice(0, at), ...items, ...playlist.slice(at)]);
    } else {
      setPlaylist([...playlist, ...items]);
    }
    const what = items.length === 1 ? `"${items[0].title}"` : `${items.length} tracks`;
    showStatus(where === 'next' ? `${what} will play next` : `Added ${what} to the queue`);
  };

  const playTrack = async (track) => {
    if (!track) return;

    if (track.filePath && window.robosAudio?.ensureFileAccessible) {
      await window.robosAudio.ensureFileAccessible(track.filePath).catch(() => {});
    }

    let trackToPlay = { ...track };
    if (!trackToPlay.src && trackToPlay.filePath) {
      trackToPlay.src = fileUrl(trackToPlay.filePath);
    }
    const sameSrc = resolveSrc(trackToPlay) === resolveSrc(currentTrack);

    const existingIdx = playlist.findIndex(t => 
      (t.id && trackToPlay.id && t.id === trackToPlay.id) || 
      (t.filePath && trackToPlay.filePath && t.filePath === trackToPlay.filePath) || 
      (t.src && trackToPlay.src && t.src === trackToPlay.src)
    );

    if (existingIdx >= 0) {
      setCurrentTrackIndex(existingIdx);
    } else {
      setPlaylist(prev => [...prev, trackToPlay]);
      setCurrentTrackIndex(playlist.length);
    }
    if (sameSrc && playerRef.current?.audio?.current) playerRef.current.audio.current.currentTime = 0;

    if (outputTarget !== 'local') {
      // Cast the track to the selected speaker
      castTrack(outputTarget, trackToPlay);
      // Mute local audio element so it acts as synchronized visual seeker without audio leak
      if (playerRef.current?.audio?.current) {
        playerRef.current.audio.current.muted = true;
        setTimeout(() => {
          playerRef.current?.audio?.current?.play().catch(() => {});
        }, 60);
      }
    } else {
      // Local desktop playback: stop any remote casting sessions
      if (activeCastSession) {
        handleStopCast();
      }
      setTimeout(() => {
        const el = isVideoTrack(trackToPlay) && videoRef.current ? videoRef.current : playerRef.current?.audio?.current;
        if (el) {
          el.muted = false;
          el.play().catch((err) => {
            console.warn('[MoviePlayer] Playback error:', err);
            showStatus(`Playback error: ${err.message || 'File not accessible'}`);
          });
        }
      }, 80);
    }
    setIsPlaying(true);
    showStatus(`Playing "${trackToPlay.title}" by ${trackToPlay.artist || 'Unknown'}`);
  };

  // The local player's own play/pause. While casting it is idle and the speaker's
  // status drives the play state instead.
  const handlePlayerPlay = () => {
    if (outputTarget === 'local') setIsPlaying(true);
  };

  const handlePlayerPause = () => {
    if (outputTarget === 'local') setIsPlaying(false);
  };

  const handleTogglePlayPause = () => {
    // While the DJ is talking, "play" means "get on with the music".
    if (latestRef.current.djSpeaking) {
      latestRef.current.skipDj();
      return;
    }
    if (outputTarget !== 'local') {
      handleToggleCastPause();
    } else {
      if (playerRef.current?.audio?.current) {
        if (playerRef.current.audio.current.paused) {
          playerRef.current.audio.current.play().catch(() => {});
          setIsPlaying(true);
        } else {
          playerRef.current.audio.current.pause();
          setIsPlaying(false);
        }
      }
    }
  };

  // ── Next / previous with VLC-style random and repeat modes ────────────────

  // Returns the queue index to play after the current one, or null to stop.
  const pickNextIndex = (fromEnded) => {
    const n = playlist.length;
    if (!n) return null;
    if (shuffleMode && n > 1) {
      const played = new Set(shuffleHistoryRef.current);
      let candidates = playlist.map((_, i) => i).filter(i => i !== currentTrackIndex && !played.has(playlist[i]));
      if (!candidates.length) {
        if (fromEnded && repeatMode === 'off') return null;
        shuffleHistoryRef.current = [];
        candidates = playlist.map((_, i) => i).filter(i => i !== currentTrackIndex);
      }
      return candidates[Math.floor(Math.random() * candidates.length)];
    }
    if (currentTrackIndex + 1 < n) return currentTrackIndex + 1;
    if (fromEnded && repeatMode === 'off') return null;
    return 0;
  };

  const restartCurrent = () => {
    const audio = playerRef.current?.audio?.current;
    playedRef.current = { key: null, counted: false };
    if (audio && outputTarget === 'local') {
      audio.currentTime = 0;
      audio.play().catch(() => {});
    }
    if (outputTarget !== 'local' && currentTrack) castTrack(outputTarget, currentTrack);
  };

  // Jump to a queue entry (double-click in the Now Playing panel, next/prev, auto-advance).
  const goToIndex = (idx, { remember = true } = {}) => {
    const track = playlist[idx];
    if (!track) return;
    if (remember && playlist[currentTrackIndex]) {
      shuffleHistoryRef.current = [...shuffleHistoryRef.current.slice(-500), playlist[currentTrackIndex]];
    }
    if (idx === currentTrackIndex) {
      restartCurrent();
      return;
    }
    setCurrentTrackIndex(idx);
    if (outputTarget !== 'local') castTrack(outputTarget, track);
    else if (playerRef.current?.audio?.current) playerRef.current.audio.current.muted = false;
    setIsPlaying(true);
  };

  const handlePlayNext = () => {
    const idx = pickNextIndex(false);
    if (idx != null) goToIndex(idx);
  };

  // With random playback on, the next song is chosen when the current one starts,
  // so the Virtual DJ can prepare an intro for it.
  const plannedNextIndex = useMemo(
    () => (shuffleMode ? pickNextIndex(true) : null),
    [shuffleMode, currentTrackIndex, playlist, repeatMode] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const upcomingTracks = useMemo(() => {
    if (shuffleMode) return plannedNextIndex != null ? [playlist[plannedNextIndex]] : [];
    const next = playlist.slice(currentTrackIndex + 1, currentTrackIndex + 4);
    if (next.length < 3 && repeatMode === 'all') next.push(...playlist.slice(0, 3 - next.length));
    return next;
  }, [shuffleMode, plannedNextIndex, playlist, currentTrackIndex, repeatMode]);

  // Cloud songs download whole on a cache miss; fetch the next one ahead of time.
  const nextCloudPath = upcomingTracks[0] && upcomingTracks[0].cloud && !upcomingTracks[0].cloud.cached ? upcomingTracks[0].filePath : null;
  useEffect(() => {
    if (!nextCloudPath || !isPlaying || !window.robosAudio?.prefetchTrack) return undefined;
    const timer = setTimeout(() => { window.robosAudio.prefetchTrack(nextCloudPath).catch(() => {}); }, 5000);
    return () => clearTimeout(timer);
  }, [nextCloudPath, isPlaying]);

  const dj = useVirtualDj({
    initial: playerPrefs.dj,
    upcoming: upcomingTracks,
    outputTarget,
    getVolume: () => playerRef.current?.audio?.current?.volume ?? 1,
    showStatus,
    getAgent: () => latestRef.current.aiAgent,
    // DJ lines go to the speaker(s) the music is cast to.
    castClip: (filePath, meta) => {
      const target = latestRef.current.outputTarget;
      if (target === 'all') return Promise.all(latestRef.current.speakers.map(sp => window.robosAudio.castFile(sp.ip, filePath, meta))).then(r => r.find(x => x && x.ok === false) || { ok: true });
      return window.robosAudio.castFile(target, filePath, meta);
    },
  });

  // Other RobOS apps (e.g. RobOS Party Game) can play a clip on the music's
  // speaker; the song picks up where it was afterwards.
  const getControlPlayer = useCallback(() => latestRef.current.controlPlayer(), []);
  const speakerTakeover = useSpeakerTakeover({ getPlayer: getControlPlayer, showStatus });

  const handleTrackEnded = () => {
    if (repeatMode === 'one') {
      restartCurrent();
      return;
    }
    const planned = shuffleMode && plannedNextIndex != null && playlist[plannedNextIndex] ? plannedNextIndex : null;
    const idx = planned != null ? planned : pickNextIndex(true);
    if (idx == null) {
      setIsPlaying(false);
      showStatus('Reached the end of the queue.');
      return;
    }
    const nextTrack = playlist[idx];
    // The DJ talks between songs that end on their own (never on a manual skip),
    // then hands over to whatever the queue holds by then.
    if (dj.talkBefore(nextTrack, () => latestRef.current.goToTrack(nextTrack, idx))) {
      setIsPlaying(false);
      return;
    }
    goToIndex(idx);
  };

  // "Announce this song": hear the DJ's intro for a track now. The music pauses
  // for it and picks up where it was.
  const handleDjPreview = (track) => {
    if (!dj.settings.persona.trim()) {
      showStatus('Set up the Virtual DJ first: describe the DJ you want.');
      setShowDjSettings(true);
      return;
    }
    const audio = playerRef.current?.audio?.current;
    const casting = outputTarget !== 'local';
    // The speaker may not have reported yet; then go by the app's play state.
    const wasPlaying = casting
      ? (castClock.get().playing || (isPlaying && !(activeCastSession && activeCastSession.isPaused)))
      : !!(isPlaying && audio && !audio.paused);
    // While casting, the line replaces the song on the speaker; it is cast again
    // afterwards from where it was (the muted local copy keeps the position).
    const song = playlist[currentTrackIndex];
    const position = casting ? castClock.now() : (audio ? audio.currentTime : 0);
    if (audio && !audio.paused) audio.pause();
    dj.preview(track, () => {
      if (casting) {
        // The line replaced the song on the speaker: always put the song back.
        if (song) latestRef.current.resumeCastAt(song, position, wasPlaying);
        return;
      }
      if (wasPlaying) { playerRef.current?.audio?.current?.play().catch(() => {}); setIsPlaying(true); }
    });
  };

  // Start a playlist that comes with a DJ script: intro first, then the music.
  const startWithDj = (pl) => {
    dj.loadScript(pl.dj);
    playerRef.current?.audio?.current?.pause();
    setIsPlaying(false);
    showStatus(`🎙 Starting "${pl.name}" with your Virtual DJ…`);
    dj.announce(pl.dj.intro, () => latestRef.current.playTracks(pl.tracks, 0));
  };

  const handleAiPlaylistPlay = (pl) => {
    setShowAiPlaylist(false);
    if (pl.dj && pl.dj.persona) startWithDj(pl);
    else playTracks(pl.tracks, 0);
  };

  const handleAiPlaylistSave = async (pl) => {
    try {
      const created = await window.robosAudio.createPlaylist({
        name: pl.name,
        description: pl.description,
        tracks: pl.tracks,
        ai: pl.ai,
        dj: pl.dj,
      });
      await refreshPlaylists();
      if (created) setSelectedPlaylistId(created.id);
      setShowAiPlaylist(false);
      setActiveTab('playlists');
      showStatus(`Saved AI playlist "${pl.name}" (${pl.tracks.length} songs)`);
    } catch (err) {
      showStatus('Error saving playlist: ' + err.message);
    }
  };

  const handlePlayPrev = () => {
    const audio = playerRef.current?.audio?.current;
    // Like most players: "previous" first rewinds a track that's been playing a while.
    if (outputTarget !== 'local') {
      if (castClock.now() > 3) { handleCastSeek(0); return; }
    } else if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    if (shuffleMode) {
      const history = shuffleHistoryRef.current;
      while (history.length) {
        const idx = playlist.indexOf(history.pop());
        if (idx >= 0) { goToIndex(idx, { remember: false }); return; }
      }
    }
    if (playlist.length <= 1) return;
    goToIndex((currentTrackIndex - 1 + playlist.length) % playlist.length, { remember: false });
  };

  const cycleRepeat = () => {
    const next = repeatMode === 'off' ? 'all' : repeatMode === 'all' ? 'one' : 'off';
    setRepeatMode(next);
    showStatus({ off: 'Repeat off', all: 'Repeat whole queue', one: 'Repeat current track' }[next]);
  };

  const toggleShuffleMode = () => {
    setShuffleMode(on => {
      shuffleHistoryRef.current = [];
      showStatus(on ? 'Random playback off' : 'Random playback on');
      return !on;
    });
  };

  // ── Library navigation, loved tracks, track info ──────────────────────────

  const libraryNav = libNav[libNav.length - 1];

  const navigateLibrary = (view) => {
    setActiveTab('library');
    setLibNav(prev => {
      const top = prev[prev.length - 1];
      if (JSON.stringify(top) === JSON.stringify(view)) return prev;
      return [...prev.slice(-40), view];
    });
  };

  const libraryBack = () => setLibNav(prev => (prev.length > 1 ? prev.slice(0, -1) : prev));

  const goToAlbumOf = (track) => navigateLibrary({ section: 'albums', detail: { type: 'album', key: albumKeyOf(track) } });
  const goToArtist = (name) => navigateLibrary({ section: 'artists', detail: { type: 'artist', key: fold(name || 'Unknown Artist') } });
  const goToGenre = (genre) => navigateLibrary({ section: 'genres', detail: { type: 'genre', key: fold(splitGenres(genre)[0] || genre) } });

  const setLovedTracks = async (tracks, loved) => {
    const ids = [...new Set((tracks || []).map(t => t.id).filter(Boolean))];
    if (!ids.length) return;
    const now = new Date().toISOString();
    setStats(prev => {
      const next = { ...prev };
      for (const id of ids) next[id] = { ...(prev[id] || {}), loved, lovedAt: loved ? now : null };
      return next;
    });
    try {
      const changed = await window.robosAudio.setLoved(ids, loved);
      if (changed) setStats(prev => ({ ...prev, ...changed }));
    } catch {}
    const what = ids.length === 1 ? `"${tracks[0].title}"` : `${ids.length} tracks`;
    showStatus(loved ? `Added ${what} to Loved` : `Removed ${what} from Loved`);
  };

  const recordPlay = (track) => {
    if (!track?.id || !window.robosAudio?.recordPlay) return;
    window.robosAudio.recordPlay(track.id)
      .then(entry => { if (entry) setStats(prev => ({ ...prev, [track.id]: entry })); })
      .catch(() => {});
  };

  const showInFolder = async (track) => {
    const res = await window.robosAudio.showInFolder(track.filePath).catch(() => null);
    if (!res || !res.ok) showStatus('That file is not reachable right now.');
  };

  const openMenu = useCallback((e, items) => {
    e.preventDefault?.();
    e.stopPropagation?.();
    setMenu({ x: e.clientX, y: e.clientY, items });
  }, []);
  const closeMenu = useCallback(() => setMenu(null), []);

  const handleAiMetadataApplied = async (res) => {
    if (res && res.library) {
      setLibrary(res.library);
    } else {
      await loadLibrary();
    }
    await refreshPlaylists();
    if (Array.isArray(res?.tracks) && res.tracks.length) {
      const updatedById = new Map(res.tracks.map(t => [t.id, t]));
      setPlaylist(prev => prev.map(pt => (pt && updatedById.has(pt.id) ? { ...pt, ...updatedById.get(pt.id) } : pt)));
      setInfoTrack(prev => (prev && updatedById.has(prev.id) ? { ...prev, ...updatedById.get(prev.id) } : prev));
    }
    showStatus(`✦ AI updated metadata & artwork for ${res?.updatedCount || 0} track(s)!`);
  };

  const libraryCtx = {
    artBase: artBase.local,
    stats,
    currentTrack,
    isPlaying,
    openMenu,
    actions: {
      playTracks,
      queueTracks,
      castTracks,
      hasSpeakers: speakers.length > 0,
      addToPlaylist: (tracks) => { setQuickPlaylistName(''); setTracksForPlaylist(tracks); },
      fixMetadata: (tracks) => setTracksForAiFix(Array.isArray(tracks) ? tracks : []),
      setLoved: setLovedTracks,
      showInfo: setInfoTrack,
      showInFolder,
      goToAlbumOf,
      goToArtist,
      goToGenre,
    },
  };

  latestRef.current = {
    next: handlePlayNext,
    prev: handlePlayPrev,
    toggle: () => handleTogglePlayPause(),
    playTracks,
    djSpeaking: !!dj.speaking,
    aiAgent,
    skipDj: dj.skip,
    // Speaker events while casting (see onSpeakerStatusChange).
    castSongFinished: () => handleTrackEnded(),
    djCastLineFinished: () => dj.castLineFinished(),
    countCastPlay: (position, duration) => {
      const t = playlist[currentTrackIndex];
      if (!t || position == null) return;
      const key = `${currentTrackIndex}:${t.id || t.src}`;
      if (playedRef.current.key !== key) playedRef.current = { key, counted: false };
      if (!playedRef.current.counted && position >= Math.min(30, (duration || t.duration || 60) / 2)) {
        playedRef.current.counted = true;
        recordPlay(t);
      }
    },
    outputTarget,
    speakers,
    // Re-cast the song after a DJ preview, from `position`; paused if it was paused.
    resumeCastAt: async (song, position, play) => {
      await castTrack(outputTarget, song, { startAt: position });
      if (play) setIsPlaying(true);
      else if (outputTarget !== 'all') {
        await window.robosAudio.castPause(outputTarget);
        setActiveCastSession(prev => (prev ? { ...prev, isPaused: true } : prev));
      }
    },
    controlClipFinished: (loadId) => speakerTakeover.clipFinished(loadId),
    // What the control API sees and does (see useSpeakerTakeover).
    controlPlayer: () => {
      const audio = playerRef.current?.audio?.current;
      const casting = outputTarget !== 'local';
      return {
        outputTarget,
        speakers,
        song: playlist[currentTrackIndex] || null,
        castActive: !!activeCastSession,
        position: casting ? castClock.now() : (audio ? audio.currentTime : 0),
        playing: casting
          ? (castClock.get().playing || (isPlaying && !!activeCastSession && !activeCastSession.isPaused))
          : !!(audio && !audio.paused),
        djSpeaking: !!dj.speaking,
        holdClock: (position) => castClock.set({ position, playing: false }),
        resumeCastAt: (song, position, play) => latestRef.current.resumeCastAt(song, position, play),
        pauseMusic: async () => {
          if (outputTarget === 'local') {
            if (audio && !audio.paused) { audio.pause(); setIsPlaying(false); }
          } else if (activeCastSession && !activeCastSession.isPaused) {
            await handleToggleCastPause();
          }
          return { ok: true, playing: false };
        },
        resumeMusic: async () => {
          const song = playlist[currentTrackIndex];
          if (!song) return { ok: false, error: 'Nothing to play' };
          if (outputTarget === 'local') {
            if (audio && audio.paused) { audio.play().catch(() => {}); setIsPlaying(true); }
          } else if (activeCastSession) {
            if (activeCastSession.isPaused) await handleToggleCastPause();
          } else {
            await castTrack(outputTarget, song, { startAt: castClock.now() });
            setIsPlaying(true);
          }
          return { ok: true, playing: true };
        },
      };
    },
    // After a DJ break the queue may have changed: find the planned song again.
    goToTrack: (track, fallbackIdx) => {
      const idx = playlist.indexOf(track);
      if (idx >= 0) goToIndex(idx);
      else if (playlist[fallbackIdx]) goToIndex(fallbackIdx);
    },
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

  latestRef.current.currentTrack = currentTrack;
  latestRef.current.currentIndex = currentTrackIndex;
  latestRef.current.recordPlay = recordPlay;

  // Count a play once a track has been heard for 30 s (or half of a short track).
  useEffect(() => {
    const audio = playerRef.current?.audio?.current;
    if (!audio) return undefined;
    const onTime = () => {
      const { currentTrack: t, currentIndex } = latestRef.current;
      if (!t) return;
      const key = `${currentIndex}:${t.id || t.src}`;
      if (playedRef.current.key !== key) playedRef.current = { key, counted: false };
      if (playedRef.current.counted) return;
      const threshold = Math.min(30, (audio.duration || 60) / 2);
      if (audio.currentTime >= threshold) {
        playedRef.current.counted = true;
        latestRef.current.recordPlay(t);
      }
    };
    const onEnded = () => { playedRef.current = { key: null, counted: false }; };
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('ended', onEnded);
    };
  }, []);

  // Media keys, GNOME's media controls and MPRIS all go through the Media Session API.
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const isPaused = () => {
      const audio = playerRef.current?.audio?.current;
      return !audio || audio.paused;
    };
    const handlers = {
      previoustrack: () => latestRef.current.prev(),
      nexttrack: () => latestRef.current.next(),
      play: () => { if (isPaused()) latestRef.current.toggle(); },
      pause: () => { if (!isPaused()) latestRef.current.toggle(); },
    };
    for (const [action, fn] of Object.entries(handlers)) {
      try { navigator.mediaSession.setActionHandler(action, fn); } catch {}
    }
  }, []);

  useEffect(() => {
    if (!('mediaSession' in navigator) || !currentTrack || typeof MediaMetadata === 'undefined') return;
    const art = artUrlFor(artBase.local, currentTrack.artId);
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title || '',
        artist: currentTrack.artist || '',
        album: currentTrack.album || '',
        artwork: art ? [{ src: art, sizes: '512x512' }] : [],
      });
    } catch {}
  }, [currentTrack?.id, currentTrack?.title, currentTrack?.artId, artBase.local]);

  // Space: play/pause · Ctrl+→ / Ctrl+←: next / previous · Ctrl+F: search the library.
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setActiveTab('library');
        if (searchInputRef.current) searchInputRef.current.focus();
        else setTimeout(() => searchInputRef.current?.focus(), 30);
        return;
      }
      if (typing || (e.target.closest && e.target.closest('.rhap_container'))) return;
      if (e.code === 'Space' && tag !== 'button') {
        e.preventDefault();
        latestRef.current.toggle();
      } else if (mod && e.key === 'ArrowRight') {
        e.preventDefault();
        latestRef.current.next();
      } else if (mod && e.key === 'ArrowLeft') {
        e.preventDefault();
        latestRef.current.prev();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Persist the queue and player preferences.
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        // Huge queues (e.g. "Shuffle library" on 100k tracks) keep a window around the
        // playing track so the restored position is right and localStorage stays small.
        const start = Math.max(0, Math.min(currentTrackIndex - 500, playlist.length - MAX_SAVED_QUEUE));
        const queue = playlist.slice(start, start + MAX_SAVED_QUEUE).map(t => (t.cloud ? { ...t, src: undefined } : t));
        localStorage.setItem(QUEUE_KEY, JSON.stringify({ queue, index: Math.min(currentTrackIndex - start, Math.max(0, queue.length - 1)) }));
      } catch {}
    }, 400);
    return () => clearTimeout(timer);
  }, [playlist, currentTrackIndex]);

  useEffect(() => {
    try {
      localStorage.setItem(PLAYER_PREFS_KEY, JSON.stringify({
        repeat: repeatMode,
        shuffle: shuffleMode,
        dockCollapsed,
        librarySection: libraryNav.section,
        dj: dj.settings,
        aiAgent,
      }));
    } catch {}
  }, [repeatMode, shuffleMode, dockCollapsed, libraryNav.section, dj.settings, aiAgent]);

  return (
    <LibraryContext.Provider value={libraryCtx}>
    <div
      className="react-audio-app"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {/* Header */}
      <header className="app-header">
        <div className="header-brand">
          <svg className="brand-icon" xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#e8a33d" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="18" rx="2.5"/>
            <line x1="7" y1="3" x2="7" y2="21"/>
            <line x1="17" y1="3" x2="17" y2="21"/>
            <line x1="2" y1="12" x2="22" y2="12"/>
            <polygon points="10 9 15 12 10 15 10 9" fill="#e8a33d"/>
          </svg>
          <div>
            <h1>RobOS Movie Player</h1>
            <span className="subtitle">Local cinema library, SFTP/Cloud storage and RobOS Smart TV Cast</span>
          </div>
        </div>

        {/* Global Action Buttons in Header */}
        <div className="header-actions">
          <button
            id="btn-header-add-folder"
            className="btn-accent"
            onClick={handleSelectFolder}
            title="Open built-in system file manager to add movie folder"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/><line x1="12" y1="10" x2="12" y2="16"/><line x1="9" y1="13" x2="15" y2="13"/></svg>
            <span>Add Folder</span>
          </button>
          <button
            id="btn-header-add-files"
            className="btn-secondary"
            onClick={handleAddFiles}
            title="Open file picker to select individual movie files"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
            <span>Add Files</span>
          </button>
        </div>

        {/* Output Selector */}
        <div className="output-selector-wrapper">
          <label>Display Output:</label>
          <div className="select-group">
            <select
              id="output-select"
              value={outputTarget}
              onChange={(e) => {
                const target = e.target.value;
                setOutputTarget(target);
                const audio = getMediaEl();
                if (target === 'local') {
                  // Pick up locally where the Smart TV was.
                  if (outputTarget !== 'local' && currentTrack) pendingLocalSeekRef.current = castClock.now();
                  if (activeCastSession) handleStopCast();
                  if (audio) audio.muted = false;
                } else {
                  const from = outputTarget === 'local' && audio ? audio.currentTime : castClock.now();
                  if (audio) { audio.pause(); audio.muted = true; }
                  if (videoRef.current) { videoRef.current.pause(); videoRef.current.muted = true; }
                  if (currentTrack) {
                    castTrack(target, currentTrack, { startAt: from > 1 ? from : 0 });
                  }
                }
                showStatus(`Switched display output to: ${e.target.options[e.target.selectedIndex].text}`);
              }}
            >
              <option value="local">Desktop (Local Cinema)</option>
              {speakers.map(s => (
                <option key={s.ip} value={s.ip}>{s.name} ({s.ip})</option>
              ))}
              {speakers.length > 0 && (
                <option value="all">Broadcast to All Smart TVs</option>
              )}
            </select>
            <button
              id="btn-scan-speakers"
              className={`btn-icon ${isScanning ? 'loading' : ''}`}
              onClick={() => refreshSpeakers(true)}
              title="Scan LAN & RobOS Smart TV Studio for Smart TVs"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/></svg>
              <span>Scan Smart TVs</span>
            </button>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="nav-tabs">
        <button
          id="tab-btn-player"
          className={`tab-btn ${activeTab === 'player' ? 'active' : ''}`}
          onClick={() => setActiveTab('player')}
        >
          <Icon name="tv" /><span>Cinema Stage</span>
        </button>
        <button
          id="tab-btn-playlists"
          className={`tab-btn ${activeTab === 'playlists' ? 'active' : ''}`}
          onClick={() => setActiveTab('playlists')}
        >
          <Icon name="list" /><span>Watchlists ({playlists.length})</span>
        </button>
        <button
          id="tab-btn-library"
          className={`tab-btn ${activeTab === 'library' ? 'active' : ''}`}
          onClick={() => setActiveTab('library')}
        >
          <Icon name="library" /><span>Movies &amp; Shows ({library.tracks.length})</span>
        </button>
        <button
          id="tab-btn-cloud"
          className={`tab-btn ${activeTab === 'cloud' ? 'active' : ''}`}
          onClick={() => setActiveTab('cloud')}
        >
          <Icon name="cloud" /><span>Cloud Storage</span>
        </button>
        <button
          id="tab-btn-ambient"
          className={`tab-btn ${activeTab === 'ambient' ? 'active' : ''}`}
          onClick={() => setActiveTab('ambient')}
        >
          <Icon name="wave" /><span>Theater Ambience</span>
        </button>
        <button
          id="tab-btn-speakers"
          className={`tab-btn ${activeTab === 'speakers' ? 'active' : ''}`}
          onClick={() => setActiveTab('speakers')}
        >
          <Icon name="tv" /><span>Smart TVs ({speakers.length})</span>
        </button>
        <span className="nav-spacer" />
        <button
          id="btn-toggle-queue-panel"
          className={`tab-btn ${dockCollapsed ? '' : 'active'}`}
          onClick={() => setDockCollapsed(c => !c)}
          title="Show or hide the Watch Queue"
        >
          <Icon name="panel" /><span>Watch Queue</span>
        </button>
      </nav>

      <div className="app-body">
      {/* Main Content Area */}
      <main className={`tab-content ${activeTab === 'library' ? 'library-active' : ''}`}>
        {/* Background Scan Banner */}
        {isScanningLibrary && (
          <div className="scan-progress-banner">
            <div className="scan-progress-info">
              <div className="scan-spinner"></div>
              <div className="scan-text">
                <strong>Background Library Scanning Active</strong>
                <span className="scan-details">
                  {libraryScanStatus?.total > 0
                    ? `${libraryScanStatus.current || 0} / ${libraryScanStatus.total} files (${Math.round(((libraryScanStatus.current || 0) / libraryScanStatus.total) * 100)}%)`
                    : 'Discovering audio files in folder(s)...'}
                  {libraryScanStatus?.file ? ` — ${libraryScanStatus.file.split('/').slice(-2).join('/')}` : ''}
                </span>
              </div>
            </div>
            <div className="scan-bar-container">
              <div
                className="scan-bar-fill"
                style={{
                  width: `${libraryScanStatus?.total > 0 ? Math.min(100, Math.round(((libraryScanStatus.current || 0) / libraryScanStatus.total) * 100)) : 100}%`
                }}
              />
            </div>
            <button className="btn-cancel-scan" onClick={handleCancelScan}>
              Cancel Scan
            </button>
          </div>
        )}

        {/* TAB 1: NOW PLAYING */}
        <div className="player-deck-container" style={{ display: activeTab === 'player' ? 'block' : 'none' }}>
          <div className="deck-card">
              {/* Active Cast Routing Bar */}
              {(outputTarget !== 'local' || activeCastSession) && (
                <div className="active-cast-bar">
                  <div className="cast-bar-indicator">
                    <span
                      className="cast-pulse-dot"
                      style={{ background: activeCastSession?.isPaused ? '#eab308' : '#22c55e' }}
                    ></span>
                    <span>
                      {activeCastSession
                        ? `Casting "${activeCastSession.title || currentTrack?.title || 'Movie'}" to ${getSpeakerName(activeCastSession.ip)}${activeCastSession.isPaused ? ' (Paused)' : ' (Live)'}`
                        : `Output routed to ${getSpeakerName(outputTarget)} (Local desktop muted)`}
                    </span>
                  </div>
                  <div className="cast-bar-controls">
                    {activeCastSession && (
                      <button className="btn-chip" onClick={handleToggleCastPause}>
                        {activeCastSession.isPaused ? 'Resume cast' : 'Pause cast'}
                      </button>
                    )}
                    <button
                      className="btn-chip btn-stop-cast"
                      onClick={() => handleStopCast(activeCastSession?.ip || (outputTarget !== 'local' ? outputTarget : speakers[0]?.ip))}
                    >
                      Stop Cast
                    </button>
                    {outputTarget !== 'local' && (
                      <button className="btn-chip" onClick={() => { setOutputTarget('local'); handleStopCast(); }}>
                        Switch to Local Desktop
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Cinema Video Stage */}
              {isVideoTrack(currentTrack) && (
                <div className="cinema-stage-box">
                  <video
                    id="cinema-video-element"
                    ref={videoRef}
                    className={`cinema-video-el fit-${videoFit}`}
                    src={resolveSrc(currentTrack)}
                    poster={artUrlFor(artBase.local, currentTrack?.artId) || undefined}
                    muted={outputTarget !== 'local'}
                    controls
                    playsInline
                    onLoadedMetadata={(e) => {
                      const d = e.currentTarget?.duration;
                      if (d && isFinite(d) && d > 0) {
                        if (currentTrack && !currentTrack.duration) currentTrack.duration = d;
                        if (outputTarget !== 'local') {
                          castClock.set({ duration: d });
                        }
                      }
                      const at = pendingLocalSeekRef.current;
                      if (outputTarget === 'local' && at != null && e.currentTarget) {
                        pendingLocalSeekRef.current = null;
                        e.currentTarget.currentTime = at;
                      }
                    }}
                    onDurationChange={(e) => {
                      const d = e.currentTarget?.duration;
                      if (d && isFinite(d) && d > 0) {
                        if (currentTrack && !currentTrack.duration) currentTrack.duration = d;
                        if (outputTarget !== 'local') {
                          castClock.set({ duration: d });
                        }
                      }
                    }}
                    onSeeked={(e) => {
                      if (outputTarget !== 'local') {
                        const sec = e.currentTarget?.currentTime || 0;
                        const last = lastProgrammaticVideoSeekRef.current;
                        if (Date.now() - last.time < 4000 && Math.abs(sec - last.target) < 4.0) {
                          return;
                        }
                        handleCastSeek(sec);
                      }
                    }}
                    onPlay={() => {
                      if (outputTarget === 'local') {
                        setIsPlaying(true);
                      } else if (activeCastSession?.isPaused) {
                        handleToggleCastPause();
                      }
                    }}
                    onPause={() => {
                      if (outputTarget === 'local') {
                        setIsPlaying(false);
                      }
                    }}
                    onEnded={() => { if (outputTarget === 'local') handleTrackEnded(); }}
                  />
                  <div className="cinema-stage-toolbar">
                    <span className="cinema-stage-badge">
                      🎬 {currentTrack?.title || 'Cinema Stage'} {currentTrack?.year ? `(${currentTrack.year})` : ''}
                    </span>
                    <div className="cinema-stage-actions">
                      <button
                        type="button"
                        className="btn-chip"
                        onClick={() => setVideoFit(f => f === 'contain' ? 'cover' : 'contain')}
                        title="Toggle widescreen aspect fit"
                      >
                        Fit: {videoFit === 'contain' ? 'Letterbox' : 'Fill'}
                      </button>
                      <button
                        type="button"
                        className="btn-chip"
                        onClick={() => {
                          if (videoRef.current && document.pictureInPictureEnabled) {
                            if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => {});
                            else videoRef.current.requestPictureInPicture().catch(() => {});
                          }
                        }}
                        title="Toggle Picture-in-Picture"
                      >
                        PiP
                      </button>
                      {speakers.length > 0 && (
                        <>
                          <button
                            type="button"
                            className="btn-chip"
                            style={{ borderColor: '#e8a33d', color: '#e8a33d' }}
                            onClick={() => {
                              const target = outputTarget !== 'local' ? outputTarget : speakers[0].ip;
                              setOutputTarget(target);
                              const v = videoRef.current;
                              const from = v ? v.currentTime : 0;
                              if (v) { v.pause(); v.muted = true; }
                              if (currentTrack) {
                                castTrack(target, currentTrack, { startAt: from > 1 ? from : 0 });
                                setIsPlaying(true);
                              }
                            }}
                            title={`Cast movie to ${getSpeakerName(outputTarget !== 'local' ? outputTarget : speakers[0].ip)}`}
                          >
                            📺 Cast to {outputTarget !== 'local' ? getSpeakerName(outputTarget) : speakers[0].name}
                          </button>
                          <button
                            type="button"
                            className="btn-chip"
                            style={{ borderColor: '#38bdf8', color: '#38bdf8' }}
                            onClick={async () => {
                              const target = outputTarget !== 'local' ? outputTarget : speakers[0].ip;
                              if (window.robosAudio?.launchTvLibrary) {
                                const res = await window.robosAudio.launchTvLibrary(target);
                                if (res && res.ok) {
                                  showStatus(`📺 10-Foot Movie Library opened on ${getSpeakerName(target)}! Use your TV remote D-Pad (Up/Down/OK) to browse & play.`);
                                }
                              }
                            }}
                            title="Open the interactive 10-foot Movie Library on your Smart TV so you can browse and play movies with your physical TV remote"
                          >
                            🎮 TV Library (Remote UI)
                          </button>
                          <button
                            type="button"
                            className="btn-chip btn-stop-cast"
                            onClick={() => {
                              const target = activeCastSession?.ip || (outputTarget !== 'local' ? outputTarget : speakers[0].ip);
                              setOutputTarget('local');
                              handleStopCast(target);
                            }}
                            title={`Stop movie playback on ${getSpeakerName(activeCastSession?.ip || (outputTarget !== 'local' ? outputTarget : speakers[0].ip))}`}
                          >
                            ⏹ Stop TV
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        className="btn-chip"
                        onClick={() => {
                          const v = videoRef.current;
                          if (v && v.requestFullscreen) v.requestFullscreen().catch(() => {});
                        }}
                        title="Fullscreen video"
                      >
                        Fullscreen
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="track-hero">
                <div className="album-art-box">
                  <Cover artId={currentTrack?.artId} name={currentTrack?.album || currentTrack?.title} icon={currentTrack?.artId ? null : 'disc'} />
                </div>
                <div className="track-details">
                  <h2 id="track-title">
                    {currentTrack?.title || 'No Track Selected'}
                    {currentTrack && <LoveButton track={currentTrack} size={16} />}
                  </h2>
                  <p id="track-artist">
                    <a className="link" onClick={() => currentTrack && goToArtist(currentTrack.artist)}>{currentTrack?.artist || 'Unknown Artist'}</a>
                    {' '}&bull;{' '}
                    <a className="link" onClick={() => currentTrack && goToAlbumOf(currentTrack)}>{currentTrack?.album || 'RobOS Library'}</a>
                  </p>
                  <div className="track-meta-pills">
                    <span className="badge">Output: {getSpeakerName(outputTarget)}</span>
                    {activeCastSession && (
                      <span className="badge" style={{ color: '#22c55e', borderColor: '#22c55e' }}>
                        {activeCastSession.isPaused ? 'Cast Paused' : 'Casting Active'}
                      </span>
                    )}
                    {currentTrack?.genre && <span className="badge link" onClick={() => goToGenre(currentTrack.genre)}>{currentTrack.genre}</span>}
                    {currentTrack?.year && <span className="badge">{currentTrack.year}</span>}
                  </div>
                </div>

                <div className="hero-quick-actions">
                  <button className="btn-secondary" onClick={handleSelectFolder} title="Add folder via file manager">
                    Add Folder
                  </button>
                  <button className="btn-secondary" onClick={handleAddFiles} title="Add files">
                    Add Files
                  </button>
                </div>
              </div>

              {/* React H5 Audio Player Component */}
              <div className="react-h5-wrapper">
                <AudioPlayer
                  ref={playerRef}
                  src={outputTarget === 'local' && !isVideoTrack(currentTrack) ? resolveSrc(currentTrack) : undefined}
                  onLoadedMetaData={() => {
                    // Back from a speaker: continue where the speaker was.
                    const at = pendingLocalSeekRef.current;
                    const a = getMediaEl();
                    if (at != null && a) { pendingLocalSeekRef.current = null; a.currentTime = at; }
                  }}
                  customProgressBarSection={outputTarget !== 'local'
                    ? [<CastProgress key="cast-progress" className="mini-progress rhap-cast-progress" id="cast-progress" onSeek={handleCastSeek} />]
                    : isVideoTrack(currentTrack)
                      ? [<MiniProgress key="video-progress" trackId={currentTrack?.id || currentTrack?.filePath} getAudio={() => videoRef.current} />]
                      : undefined}
                  customControlsSection={(outputTarget !== 'local' || isVideoTrack(currentTrack))
                    ? [
                        RHAP_UI.ADDITIONAL_CONTROLS,
                        <div key="video-cast-controls" className="rhap_main-controls">
                          <button type="button" className="rhap_button-clear rhap_main-controls-button rhap_skip-button" aria-label="Previous" onClick={handlePlayPrev}><Icon name="prev" size={24} /></button>
                          <button
                            type="button"
                            id="cast-play-pause"
                            className="rhap_button-clear rhap_main-controls-button rhap_play-pause-button"
                            aria-label={isPlaying ? 'Pause' : 'Play'}
                            onClick={() => {
                              if (outputTarget === 'local' && isVideoTrack(currentTrack) && videoRef.current) {
                                if (videoRef.current.paused) { videoRef.current.play().catch(() => {}); setIsPlaying(true); }
                                else { videoRef.current.pause(); setIsPlaying(false); }
                              } else {
                                handleTogglePlayPause();
                              }
                            }}
                          >
                            <Icon name={isPlaying ? 'pause' : 'play'} size={34} />
                          </button>
                          <button type="button" className="rhap_button-clear rhap_main-controls-button rhap_skip-button" aria-label="Next" onClick={handlePlayNext}><Icon name="next" size={24} /></button>
                        </div>,
                        <div key="cast-spacer" className="rhap_volume-controls" />
                      ]
                    : undefined}
                  showSkipControls={true}
                  showJumpControls={false}
                  autoPlayAfterSrcChange={true}
                  onClickNext={handlePlayNext}
                  onClickPrevious={handlePlayPrev}
                  onEnded={() => { if (outputTarget === 'local') handleTrackEnded(); }}
                  onPlay={handlePlayerPlay}
                  onPause={handlePlayerPause}
                  onError={(e) => {
                    if (!currentTrack || outputTarget !== 'local') return;
                    console.warn('[AudioPlayer] Audio playback error:', e);
                    setIsPlaying(false);
                    showStatus('Playback error: Track file may be missing, network drive unmounted, or format unsupported.');
                  }}
                  className="robos-rhap-theme"
                  // Local icons: the library's defaults are fetched from api.iconify.design,
                  // which leaves the deck without buttons on offline machines.
                  customIcons={{
                    play: <Icon name="play" size={34} />,
                    pause: <Icon name="pause" size={34} />,
                    previous: <Icon name="prev" size={24} />,
                    next: <Icon name="next" size={24} />,
                    volume: <Icon name="volume" size={20} />,
                    volumeMute: <Icon name="volumeMute" size={20} />,
                  }}
                  layout="stacked"
                  customAdditionalControls={[]}
                  muted={outputTarget !== 'local'}
                />
              </div>

              <Lyrics
                track={currentTrack}
                getTime={() => (outputTarget !== 'local' ? castClock.now() : getMediaEl()?.currentTime ?? null)}
                onSeek={(t) => {
                  if (outputTarget !== 'local') handleCastSeek(t);
                  else if (getMediaEl()) getMediaEl().currentTime = t;
                }}
              />

          </div>
        </div>

        {/* TAB: WATCHLISTS */}
        {activeTab === 'playlists' && (
          <div className="playlists-view-container">
            <div className="playlists-header">
              <div className="playlists-title-group">
                <h3>Custom Watchlists ({playlists.length})</h3>
                <p className="subtitle">Curate custom movie &amp; show watchlists, import/export M3U queues, and cast directly to Smart TVs</p>
              </div>
              <div className="playlists-header-actions">
                <button
                  id="btn-create-playlist"
                  className="btn-accent"
                  onClick={() => setShowCreatePlaylistModal(true)}
                >
                  New Watchlist
                </button>
                <button
                  id="btn-ai-playlist"
                  className="btn-accent ai-btn"
                  onClick={() => setShowAiPlaylist(true)}
                  title="Describe a watchlist or marathon and let your RobOS agent build it"
                >
                  ✦ AI Watchlist
                </button>
                <button
                  id="btn-import-m3u"
                  className="btn-secondary"
                  onClick={handleImportM3u}
                  title="Import external .m3u or .m3u8 playlist file"
                >
                  Import M3U
                </button>
              </div>
            </div>

            <div className="playlists-layout">
              {/* Left Sidebar: Playlists List */}
              <div className="playlists-sidebar" style={{ width: playlistSidebarWidth }}>
                {playlists.length === 0 ? (
                  <div className="empty-playlists-sidebar">
                    <p>No playlists created yet.</p>
                    <button className="btn-accent" onClick={() => setShowCreatePlaylistModal(true)} style={{ marginTop: '8px' }}>
                      Create Playlist
                    </button>
                  </div>
                ) : (
                  playlists.map(pl => (
                    <div
                      key={pl.id}
                      className={`playlist-sidebar-card ${selectedPlaylistId === pl.id ? 'active' : ''}`}
                      onClick={() => setSelectedPlaylistId(pl.id)}
                    >
                      <div className="playlist-sidebar-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                      </div>
                      <div className="playlist-sidebar-info">
                        <span className="playlist-sidebar-name">{pl.name}</span>
                        <span className="playlist-sidebar-meta">{pl.tracks?.length || 0} track{(pl.tracks?.length || 0) === 1 ? '' : 's'}</span>
                      </div>
                      <button
                        className="btn-playlist-quick-play"
                        title={`Play "${pl.name}"`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePlayPlaylist(pl, true);
                        }}
                      >
                        <Icon name="play" size={14} />
                      </button>
                    </div>
                  ))
                )}
              </div>

              <Splitter
                id="playlists-splitter"
                label="Playlist list width"
                width={playlistSidebarWidth}
                onChange={setPlaylistSidebarWidth}
                min={180}
                max={() => Math.max(220, Math.min(560, window.innerWidth - 700))}
                defaultWidth={PLAYLIST_SIDEBAR_WIDTH}
              />

              {/* Right Detail Pane: Playlist View */}
              <div className="playlist-detail-pane">
                {selectedPlaylist ? (
                  <>
                    <div className="playlist-detail-header">
                      <div className="playlist-detail-meta">
                        <div className="playlist-cover-icon">
                          <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#e8a33d" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                        </div>
                        <div className="playlist-text-meta">
                          <h2>{selectedPlaylist.name}</h2>
                          <p className="playlist-description">{selectedPlaylist.description || 'No description provided.'}</p>
                          <div className="playlist-stats">
                            <span className="badge">{selectedPlaylist.tracks?.length || 0} Tracks</span>
                            <span className="badge">Duration: {formatTotalDuration(selectedPlaylist.tracks)}</span>
                            {selectedPlaylist.ai && <span className="badge" title={selectedPlaylist.ai.request}>✦ AI playlist</span>}
                            {selectedPlaylist.dj && <span className="badge" title={selectedPlaylist.dj.persona}>🎙 Virtual DJ</span>}
                            <span className="badge">Updated: {new Date(selectedPlaylist.updatedAt || selectedPlaylist.createdAt || Date.now()).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>

                      <div className="playlist-actions-bar">
                        <button
                          id="btn-play-all-playlist"
                          className="btn-accent"
                          onClick={() => handlePlayPlaylist(selectedPlaylist, true)}
                          disabled={!selectedPlaylist.tracks?.length}
                          title="Play all tracks in order (replaces queue)"
                        >
                          Play All
                        </button>
                        <button
                          id="btn-append-playlist"
                          className="btn-secondary"
                          onClick={() => handleAppendPlaylistToQueue(selectedPlaylist)}
                          disabled={!selectedPlaylist.tracks?.length}
                          title="Append all tracks to current queue"
                        >
                          Append to Queue
                        </button>
                        {speakers.length > 0 && (
                          <button
                            id="btn-cast-playlist"
                            className="btn-secondary"
                            onClick={() => handleCastPlaylist(selectedPlaylist)}
                            disabled={!selectedPlaylist.tracks?.length}
                            title={`Cast playlist to ${getSpeakerName(outputTarget !== 'local' ? outputTarget : speakers[0].ip)}`}
                          >
                            Cast to Smart TV
                          </button>
                        )}
                        <button
                          id="btn-export-m3u"
                          className="btn-secondary"
                          onClick={() => handleExportM3u(selectedPlaylist.id)}
                          title="Export playlist to .m3u file"
                        >
                          Export M3U
                        </button>
                        <button
                          id="btn-delete-playlist"
                          className="btn-chip btn-stop-cast"
                          onClick={() => handleDeletePlaylist(selectedPlaylist.id)}
                          title="Delete playlist"
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    {/* Tracks Listing */}
                    <div className="playlist-tracks-container">
                      {(!selectedPlaylist.tracks || selectedPlaylist.tracks.length === 0) ? (
                        <div className="empty-playlist-tracks">
                          <p>This playlist has no tracks yet.</p>
                          <span className="hint">Choose tracks from your Media Library below or import local files.</span>
                          <button
                            className="btn-accent"
                            onClick={handleAddFilesToSelectedPlaylist}
                            style={{ marginTop: '12px' }}
                          >
                            Add Audio Files from Disk
                          </button>
                        </div>
                      ) : (
                        <div className="playlist-tracks-table" style={{ '--pl-grid': playlistColumns.template }}>
                          <div className="playlist-table-header">
                            <span className="col-num">#</span>
                            <span className="col-title col-resizable">Title{playlistColumns.handleFor('title')}</span>
                            <span className="col-artist col-resizable">Release Format{playlistColumns.handleFor('artist')}</span>
                            <span className="col-album col-resizable">Release / Series{playlistColumns.handleFor('album')}</span>
                            <span className="col-duration">Runtime</span>
                            <span className="col-actions">Actions</span>
                          </div>
                          <div className="playlist-table-body">
                            {selectedPlaylist.tracks.map((track, tIdx) => (
                              <div key={track.id || tIdx} className="playlist-table-row">
                                <span className="col-num">{tIdx + 1}</span>
                                <span className="col-title" title={track.title}>{track.title}</span>
                                <span className="col-artist" title={track.artist}>{track.artist}</span>
                                <span className="col-album" title={track.album}>{track.album}</span>
                                <span className="col-duration">{formatDuration(track.duration)}</span>
                                <span className="col-actions">
                                  <button
                                    className="btn-row-action"
                                    title="Play track"
                                    onClick={() => playTrack(track)}
                                  >
                                    <Icon name="play" size={14} />
                                  </button>
                                  <button
                                    className="btn-row-action"
                                    title="Move up"
                                    disabled={tIdx === 0}
                                    onClick={() => handleMoveTrackInPlaylist(selectedPlaylist.id, tIdx, tIdx - 1)}
                                  >
                                    <Icon name="up" size={14} />
                                  </button>
                                  <button
                                    className="btn-row-action"
                                    title="Move down"
                                    disabled={tIdx === selectedPlaylist.tracks.length - 1}
                                    onClick={() => handleMoveTrackInPlaylist(selectedPlaylist.id, tIdx, tIdx + 1)}
                                  >
                                    <Icon name="down" size={14} />
                                  </button>
                                  <button
                                    className="btn-row-action btn-danger"
                                    title="Remove from playlist"
                                    onClick={() => handleRemoveTrackFromPlaylist(selectedPlaylist.id, tIdx)}
                                  >
                                    <Icon name="x" size={14} />
                                  </button>
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Quick Add from Media Library Selector */}
                      {library.tracks.length > 0 && (
                        <div className="quick-add-from-library">
                          <h4>Add Tracks from Media Library</h4>
                          <div className="quick-add-controls">
                            <select
                              id="select-track-to-add"
                              className="library-track-picker"
                              defaultValue=""
                              onChange={(e) => {
                                if (!e.target.value) return;
                                const track = library.tracks.find(t => t.id === e.target.value || t.filePath === e.target.value);
                                if (track) {
                                  handleAddTrackToPlaylist(selectedPlaylist.id, track);
                                  e.target.value = '';
                                }
                              }}
                            >
                              <option value="" disabled>Select track to add to "{selectedPlaylist.name}"...</option>
                              {library.tracks.map((t, idx) => (
                                <option key={t.id || idx} value={t.id || t.filePath}>
                                  {t.title} — {t.artist} ({formatDuration(t.duration)})
                                </option>
                              ))}
                            </select>
                            <button className="btn-secondary" onClick={handleAddFilesToSelectedPlaylist}>
                              Add Audio Files
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="empty-state">
                    <p>Select a playlist from the left or create a new one.</p>
                    <button className="btn-accent" onClick={() => setShowCreatePlaylistModal(true)} style={{ marginTop: '12px' }}>
                      Create Playlist
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: MEDIA LIBRARY BROWSER */}
        {activeTab === 'library' && (
          <div className="library-tab">
            {activeCastSession && (
              <div className="active-cast-bar">
                <div className="cast-bar-indicator">
                  <span
                    className="cast-pulse-dot"
                    style={{ background: activeCastSession.isPaused ? '#eab308' : '#22c55e' }}
                  ></span>
                  <span>Currently casting to <strong>{getSpeakerName(activeCastSession.ip)}</strong></span>
                </div>
                <div className="cast-bar-controls">
                  <button className="btn-chip" onClick={handleToggleCastPause}>
                    {activeCastSession.isPaused ? 'Resume' : 'Pause'}
                  </button>
                  <button className="btn-chip btn-stop-cast" onClick={() => handleStopCast(activeCastSession.ip)}>
                    Stop Cast
                  </button>
                </div>
              </div>
            )}
            <Library
              tracks={library.tracks}
              folders={folders}
              nav={libraryNav}
              onNavigate={navigateLibrary}
              onBack={libraryBack}
              canGoBack={libNav.length > 1}
              searchInputRef={searchInputRef}
              isScanning={isScanningLibrary}
              onAiPlaylist={() => setShowAiPlaylist(true)}
              onAiFixMetadata={(scopedTracks) => setTracksForAiFix(Array.isArray(scopedTracks) ? scopedTracks : [])}
              onAddFolder={handleSelectFolder}
              onAddFiles={handleAddFiles}
              onRefresh={async () => {
                await loadLibrary();
                await loadStats();
                showStatus('Library refreshed from disk cache.');
              }}
              folderProps={{
                onAddLocal: handleSelectFolder,
                onAddCloud: () => setActiveTab('cloud'),
                onRescan: handleRescanFolder,
                onEnabled: handleFolderEnabled,
                onRename: handleRenameFolder,
                onRemove: handleRemoveFolder,
                busyId: syncingFolder === 'all' ? '__all__' : syncingFolder,
              }}
            />
          </div>
        )}

        {/* TAB: CLOUD STORAGE (Data Sources FTP / SFTP) */}
        {activeTab === 'cloud' && (
          <CloudBrowser
            folders={folders}
            onEnabled={handleFolderEnabled}
            onRescan={handleRescanFolder}
            busyId={syncingFolder}
            showStatus={showStatus}
            onFolders={applyFolderState}
            onLibrary={(lib) => { if (lib) setLibrary(lib); }}
          />
        )}

        {/* TAB 3: AMBIENT SYNTHESIZERS */}
        {activeTab === 'ambient' && (
          <div className="ambient-container">
            <h3>Procedural Focus Soundscapes</h3>
            <p className="subtitle">Synthesized in real-time with Web Audio API nodes (zero external files)</p>
            <div className="ambient-grid">
              {[
                { id: 'rain', icon: 'rain', name: 'Coding Rain', desc: 'Resonant filtered pink noise mimicking rainfall' },
                { id: 'synth', icon: 'synth', name: 'Cyber Synth', desc: 'Dual detuned sawtooth oscillators with analog low-pass filter' },
                { id: 'pink', icon: 'noise', name: 'Pink Noise', desc: 'Voss-McCartney noise buffer for deep technical focus' },
              ].map(s => (
                <div key={s.id} className={`ambient-card-item ${activeAmbient === s.id ? 'active' : ''}`} onClick={() => playAmbient(s.id)}>
                  <span className="card-emoji"><Icon name={s.icon} size={28} /></span>
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

        {/* TAB 4: ROBOS SMART TVS */}
        {activeTab === 'speakers' && (
          <div className="speakers-container">
            <div className="speakers-header">
              <div>
                <h3>Paired RobOS Smart TVs ({speakers.length})</h3>
                <p className="subtitle" style={{ marginTop: '4px' }}>
                  Cast movies directly to RobOS Smart TVs (Roku OS, Google TV / Cast, LG webOS, Samsung Tizen) over zero-cloud LAN
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn-chip btn-stop-cast" onClick={() => handleStopCast()}>
                  Stop All Smart TVs
                </button>
                <button className="btn-secondary" onClick={() => refreshSpeakers(true)}>
                  Scan Smart TVs
                </button>
              </div>
            </div>
            <div className="speakers-grid">
              {speakers.map(s => {
                const isSelected = outputTarget === s.ip || outputTarget === 'all';
                const isCastingHere = activeCastSession && (activeCastSession.ip === s.ip || activeCastSession.ip === 'all');
                return (
                  <div
                    key={s.ip}
                    className="speaker-card"
                    style={isSelected ? { borderColor: '#e8a33d', boxShadow: '0 0 0 1px rgba(232,163,61,0.35)' } : undefined}
                  >
                    <div className="speaker-badge">
                      {isCastingHere ? 'CASTING LIVE' : (s.online !== false ? 'ONLINE · READY' : 'PAIRED')}
                    </div>
                    <h4 style={{ paddingRight: '108px' }}>{s.name}</h4>
                    {s.platformName && (
                      <p className="speaker-model" style={{ color: '#e8a33d', fontWeight: 600 }}>
                        Platform: {s.platformName}
                      </p>
                    )}
                    <p className="speaker-ip">LAN IP: <code>{s.ip}</code></p>
                    <p className="speaker-model">Model: {s.model}</p>
                    {s.sideloadStatus && (
                      <p className="speaker-model" style={{ fontSize: '12px', opacity: 0.8 }}>
                        RobOS TV Studio: <code>{s.sideloadStatus}</code>
                      </p>
                    )}
                    <div className="speaker-actions">
                      <button
                        className="btn-accent"
                        onClick={() => {
                          setOutputTarget(s.ip);
                          const el = getMediaEl();
                          const from = outputTarget === 'local' && el ? el.currentTime : castClock.now();
                          if (el) { el.pause(); el.muted = true; }
                          if (currentTrack) {
                            castTrack(s.ip, currentTrack, { startAt: from > 1 ? from : 0 });
                            setIsPlaying(true);
                          }
                          setActiveTab('player');
                        }}
                      >
                        {currentTrack ? `Display "${currentTrack.title.slice(0, 22)}${currentTrack.title.length > 22 ? '…' : ''}" on TV` : 'Display on TV'}
                      </button>
                      <button
                        className="btn-secondary"
                        style={{ borderColor: '#38bdf8', color: '#38bdf8' }}
                        onClick={async () => {
                          showStatus(`Opening 10-Foot Movie Library UI on ${s.name} (${s.ip})...`);
                          try {
                            const res = await window.robosAudio.launchTvLibrary(s.ip);
                            if (res && res.ok) {
                              showStatus(`📺 Movie Library (${res.totalMovies || library.tracks.length} movies) is now open on ${s.name}! Use your TV remote D-Pad (Up/Down/OK) to browse & play.`);
                            } else {
                              showStatus(`Could not open TV Library: ${res?.error || 'Unknown error'}`);
                            }
                          } catch (err) {
                            showStatus('Error opening TV Library: ' + err.message);
                          }
                        }}
                        title="Open the interactive 10-foot Movie Library on this Smart TV to browse and play movies using your physical TV remote"
                      >
                        🎮 Open TV Library (Remote UI)
                      </button>
                      <button className="btn-chip btn-stop-cast" onClick={async () => {
                        if (window.robosAudio?.closeTvLibrary) await window.robosAudio.closeTvLibrary(s.ip).catch(() => {});
                        handleStopCast(s.ip);
                      }}>
                        Stop TV
                      </button>
                      <button className="btn-secondary" onClick={async () => {
                        showStatus(`Sending test signal to ${s.name} (${s.ip})...`);
                        try {
                          await window.robosAudio.playTestChime(s.ip);
                          showStatus(`Test signal verified on ${s.name}`);
                        } catch (err) {
                          showStatus('TV test error: ' + err.message);
                        }
                      }}>
                        Test TV Signal
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      <NowPlayingPanel
        queue={playlist}
        currentIndex={currentTrack ? currentTrackIndex : -1}
        collapsed={dockCollapsed}
        onToggleCollapsed={() => setDockCollapsed(c => !c)}
        onPlayIndex={(idx) => goToIndex(idx)}
        onRemove={handleRemoveFromQueue}
        onMove={handleMoveInQueue}
        onInsert={handleInsertIntoQueue}
        onSort={handleSortQueue}
        onClear={handleClearQueue}
        onSave={() => setShowSaveQueueModal(true)}
        onShuffleOrder={handleShuffleQueue}
        shuffle={shuffleMode}
        repeat={repeatMode}
        onToggleShuffle={toggleShuffleMode}
        onCycleRepeat={cycleRepeat}
        dj={{
          enabled: dj.active,
          speaking: dj.speaking,
          persona: dj.settings.persona,
          onSkip: dj.skip,
          nextTrack: upcomingTracks[0] || null,
          onPreview: handleDjPreview,
          onSettings: () => setShowDjSettings(true),
          onAiPlaylist: () => setShowAiPlaylist(true),
        }}
      />
      </div>

      {/* Persistent Bottom Mini-Player when browsing library/playlists/etc */}
      {activeTab !== 'player' && currentTrack && (
        <footer className="mini-player-bar">
          <div className="mini-player-info" onClick={() => setActiveTab('player')}>
            <div className="mini-art">
              <Cover artId={currentTrack.artId} name={currentTrack.album || currentTrack.title} size={38} />
            </div>
            <div className="mini-text">
              <span className="mini-title">{currentTrack.title}</span>
              <span className="mini-artist">{currentTrack.artist || 'Unknown'} &bull; {currentTrack.album || ''}</span>
            </div>
          </div>
          <LoveButton track={currentTrack} size={15} />
          <div className="mini-player-center">
            <div className="mini-player-controls">
              <button className={`mini-ctrl-btn mini-mode ${shuffleMode ? 'on' : ''}`} title={shuffleMode ? 'Random: on' : 'Random: off'} onClick={toggleShuffleMode}><Icon name="shuffle" size={15} /></button>
              <button className="mini-ctrl-btn" title="Previous (Ctrl+←)" onClick={handlePlayPrev}><Icon name="prev" size={18} /></button>
              <button className="mini-ctrl-btn mini-btn-play" title={isPlaying ? "Pause (Space)" : "Play (Space)"} onClick={handleTogglePlayPause}>
                <Icon name={isPlaying ? 'pause' : 'play'} size={18} />
              </button>
              <button className="mini-ctrl-btn" title="Next (Ctrl+→)" onClick={handlePlayNext}><Icon name="next" size={18} /></button>
              <button className={`mini-ctrl-btn mini-mode ${repeatMode !== 'off' ? 'on' : ''}`} title={`Repeat: ${repeatMode}`} onClick={cycleRepeat}><Icon name={repeatMode === 'one' ? 'repeatOne' : 'repeat'} size={15} /></button>
            </div>
            {outputTarget !== 'local'
              ? <CastProgress onSeek={handleCastSeek} />
              : <MiniProgress trackId={currentTrack?.id || currentTrack?.filePath} getAudio={getMediaEl} />}
          </div>
          <div className="mini-player-right">
            <span className="badge mini-badge">Output: {getSpeakerName(outputTarget)}</span>
            <button id="btn-mini-now-playing" className="btn-chip" onClick={() => setActiveTab('player')}>
              Now Playing
            </button>
          </div>
        </footer>
      )}

      {showAiPlaylist && (
        <AiPlaylistModal
          initialDj={dj.settings}
          agent={aiAgent}
          onAgentChange={setAiAgent}
          onClose={() => setShowAiPlaylist(false)}
          onPlay={handleAiPlaylistPlay}
          onSave={handleAiPlaylistSave}
        />
      )}

      {showDjSettings && (
        <DjSettingsModal
          value={dj.settings}
          agent={aiAgent}
          onAgentChange={setAiAgent}
          onClose={() => setShowDjSettings(false)}
          onSave={(next) => {
            dj.setSettings(next);
            setShowDjSettings(false);
            showStatus(next.enabled ? '🎙 Virtual DJ is on — they’ll talk between songs.' : 'Virtual DJ is off.');
          }}
        />
      )}

      {tracksForAiFix !== null && (
        <AiFixMetadataModal
          tracks={library.tracks}
          initialTracks={tracksForAiFix}
          agent={aiAgent}
          onAgentChange={setAiAgent}
          onApplied={handleAiMetadataApplied}
          onClose={() => setTracksForAiFix(null)}
        />
      )}

      {/* Modal: Create Playlist */}
      {showCreatePlaylistModal && (
        <div className="modal-overlay" onClick={() => setShowCreatePlaylistModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>Create New Playlist</h3>
            <div className="modal-input-group">
              <label>Playlist Name</label>
              <input
                id="input-playlist-name"
                type="text"
                placeholder="e.g. Focus Flow, Night Drive..."
                value={newPlaylistName}
                autoFocus
                onChange={(e) => setNewPlaylistName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreatePlaylist(); }}
              />
            </div>
            <div className="modal-input-group">
              <label>Description (Optional)</label>
              <textarea
                id="input-playlist-desc"
                rows="3"
                placeholder="A collection of favorite tracks..."
                value={newPlaylistDesc}
                onChange={(e) => setNewPlaylistDesc(e.target.value)}
              />
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowCreatePlaylistModal(false)}>Cancel</button>
              <button id="btn-modal-create-playlist" className="btn-accent" onClick={handleCreatePlaylist}>Create Playlist</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Save Queue as Playlist */}
      {showSaveQueueModal && (
        <div className="modal-overlay" onClick={() => setShowSaveQueueModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>Save Queue as Playlist</h3>
            <p className="subtitle" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Save all {playlist.length} track(s) from your current playback queue into a permanent playlist.
            </p>
            <div className="modal-input-group">
              <label>Playlist Name</label>
              <input
                id="input-save-queue-name"
                type="text"
                placeholder="e.g. My Queue Session..."
                value={saveQueueName}
                autoFocus
                onChange={(e) => setSaveQueueName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveQueueAsPlaylist(); }}
              />
            </div>
            <div className="modal-input-group">
              <label>Description (Optional)</label>
              <textarea
                id="input-save-queue-desc"
                rows="2"
                placeholder="Saved queue session..."
                value={saveQueueDesc}
                onChange={(e) => setSaveQueueDesc(e.target.value)}
              />
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowSaveQueueModal(false)}>Cancel</button>
              <button id="btn-modal-save-queue" className="btn-accent" onClick={handleSaveQueueAsPlaylist}>Save Playlist</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Add Track(s) to Playlist */}
      {tracksForPlaylist && tracksForPlaylist.length > 0 && (
        <div className="modal-overlay" onClick={() => setTracksForPlaylist(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>Add to Playlist</h3>
            <div className="modal-selected-track-info">
              {tracksForPlaylist.length === 1 ? (
                <>
                  <strong>{tracksForPlaylist[0].title}</strong>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{tracksForPlaylist[0].artist} &bull; {tracksForPlaylist[0].album}</span>
                </>
              ) : (
                <>
                  <strong>{tracksForPlaylist.length} tracks</strong>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{formatTotalDuration(tracksForPlaylist)}</span>
                </>
              )}
            </div>
            <div className="modal-input-group">
              <label>Choose Destination Playlist</label>
              {playlists.length === 0 ? (
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No playlists exist yet.</p>
              ) : (
                <div className="modal-playlist-select-list">
                  {playlists.map(pl => (
                    <div
                      key={pl.id}
                      className="modal-playlist-select-item"
                      onClick={() => handleAddTracksToPlaylist(pl.id, tracksForPlaylist)}
                    >
                      <div>
                        <strong>{pl.name}</strong>
                        <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          {pl.tracks?.length || 0} track(s)
                        </span>
                      </div>
                      <span className="btn-chip">Add</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="modal-input-group">
              <label>…or create a new playlist with {tracksForPlaylist.length === 1 ? 'this track' : 'these tracks'}</label>
              <div className="modal-inline-create">
                <input
                  id="input-quick-playlist-name"
                  type="text"
                  placeholder="New playlist name"
                  value={quickPlaylistName}
                  onChange={(e) => setQuickPlaylistName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCreatePlaylistFromTracks(); }}
                />
                <button className="btn-accent" onClick={handleCreatePlaylistFromTracks}>Create</button>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setTracksForPlaylist(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <ContextMenu menu={menu} onClose={closeMenu} />
      {infoTrack && <TrackInfo track={infoTrack} onClose={() => setInfoTrack(null)} />}

      {/* Toast Notification */}
      {statusMsg && <div className="toast">{statusMsg}</div>}
    </div>
    </LibraryContext.Provider>
  );
}

// Prev / play-pause / next for the deck while casting (the local player is idle).
function CastControls({ onPrev, onToggle, onNext }) {
  const playing = useCastPlaying();
  return (
    <div className="rhap_main-controls">
      <button type="button" className="rhap_button-clear rhap_main-controls-button rhap_skip-button" aria-label="Previous" onClick={onPrev}><Icon name="prev" size={24} /></button>
      <button type="button" id="cast-play-pause" className="rhap_button-clear rhap_main-controls-button rhap_play-pause-button" aria-label={playing ? 'Pause' : 'Play'} onClick={onToggle}>
        <Icon name={playing ? 'pause' : 'play'} size={34} />
      </button>
      <button type="button" className="rhap_button-clear rhap_main-controls-button rhap_skip-button" aria-label="Next" onClick={onNext}><Icon name="next" size={24} /></button>
    </div>
  );
}

// Seek bar for the mini player. Subscribes to the audio/video element itself so the
// rest of the app doesn't re-render on every timeupdate.
function MiniProgress({ getAudio, trackId }) {
  const [time, setTime] = useState({ current: 0, duration: 0 });
  const [dragging, setDragging] = useState(null);
  useEffect(() => {
    let attached = null;
    let pollTimer = null;
    const update = () => {
      const el = getAudio();
      if (!el) return;
      const d = (isFinite(el.duration) && el.duration > 0) ? el.duration : 0;
      setTime({ current: el.currentTime || 0, duration: d });
    };
    const attach = () => {
      const el = getAudio();
      if (!el || el === attached) return;
      if (attached) {
        attached.removeEventListener('timeupdate', update);
        attached.removeEventListener('durationchange', update);
        attached.removeEventListener('loadedmetadata', update);
        attached.removeEventListener('seeked', update);
        attached.removeEventListener('emptied', update);
      }
      attached = el;
      update();
      el.addEventListener('timeupdate', update);
      el.addEventListener('durationchange', update);
      el.addEventListener('loadedmetadata', update);
      el.addEventListener('seeked', update);
      el.addEventListener('emptied', update);
    };
    attach();
    pollTimer = setInterval(() => {
      attach();
      update();
    }, 350);
    return () => {
      if (pollTimer) clearInterval(pollTimer);
      if (attached) {
        attached.removeEventListener('timeupdate', update);
        attached.removeEventListener('durationchange', update);
        attached.removeEventListener('loadedmetadata', update);
        attached.removeEventListener('seeked', update);
        attached.removeEventListener('emptied', update);
      }
    };
  }, [getAudio, trackId]);

  const fmt = (sec) => {
    if (!sec || !isFinite(sec)) return '0:00';
    const total = Math.max(0, Math.floor(sec));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const ss = total % 60;
    if (h > 0) {
      return `${h}:${m < 10 ? '0' : ''}${m}:${ss < 10 ? '0' : ''}${ss}`;
    }
    return `${m}:${ss < 10 ? '0' : ''}${ss}`;
  };
  const val = dragging != null ? dragging : time.current;
  const maxVal = time.duration > 0 ? time.duration : Math.max(val, 1);
  const pct = maxVal ? (Math.min(val, maxVal) / maxVal) * 100 : 0;
  return (
    <div className="mini-progress">
      <span>{fmt(val)}</span>
      <input
        type="range"
        min="0"
        max={maxVal}
        step="0.5"
        value={Math.min(val, maxVal)}
        style={{ '--pct': `${pct}%` }}
        aria-label="Seek"
        onChange={(e) => {
          const next = Number(e.target.value);
          setDragging(next);
          setTime(prev => ({ ...prev, current: next }));
          const audio = getAudio();
          if (audio) audio.currentTime = next;
        }}
        onMouseUp={() => setDragging(null)}
        onTouchEnd={() => setDragging(null)}
        onKeyUp={() => setDragging(null)}
      />
      <span>{fmt(time.duration)}</span>
    </div>
  );
}

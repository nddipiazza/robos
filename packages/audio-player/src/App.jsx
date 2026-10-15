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
  const [showAddToPlaylistModal, setShowAddToPlaylistModal] = useState(false);
  const [selectedTrackForPlaylist, setSelectedTrackForPlaylist] = useState(null);

  const playerRef = useRef(null);
  const audioCtxRef = useRef(null);
  const ambientNodeRef = useRef(null);
  const toastTimerRef = useRef(null);

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
    if (!ip) return 'Speaker';
    if (ip === 'local') return 'Desktop (Local Audio)';
    if (ip === 'all') return 'All Connected Speakers';
    const found = speakers.find(s => s.ip === ip);
    return found ? found.name : `Speaker (${ip})`;
  };

  // ── Initial Load & Speaker Discovery ──────────────────────────────────────

  useEffect(() => {
    refreshSpeakers();
    loadLibrary();
    refreshPlaylists();

    const cleanups = [];

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
        if (batch.library) {
          setLibrary(batch.library);
        }
        if (batch.tracks && batch.tracks.length > 0) {
          setPlaylist(prev => {
            const existingPaths = new Set(prev.map(t => t.filePath));
            const newItems = batch.tracks.filter(t => !existingPaths.has(t.filePath));
            return [...prev, ...newItems];
          });
        }
      }));
    }

    if (window.robosAudio?.onLibraryScanComplete) {
      cleanups.push(window.robosAudio.onLibraryScanComplete((done) => {
        setIsScanningLibrary(false);
        setLibraryScanStatus(null);
        if (done.library) setLibrary(done.library);
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
      }));
    }

    if (window.robosAudio?.onSpeakerStatusChange) {
      cleanups.push(window.robosAudio.onSpeakerStatusChange(({ ip, status }) => {
        if (status?.playerState === 'IDLE' && status?.idleReason === 'FINISHED') {
          setActiveCastSession(null);
        } else if (status?.playerState === 'PAUSED') {
          setActiveCastSession(prev => prev ? { ...prev, isPaused: true } : prev);
        } else if (status?.playerState === 'PLAYING') {
          setActiveCastSession(prev => prev ? { ...prev, isPaused: false } : prev);
        }
      }));
    }

    return () => {
      cleanups.forEach(fn => { try { fn(); } catch {} });
    };
  }, []);

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
      const res = await window.robosAudio.selectLibraryFolder();
      if (!res.canceled && res.started) {
        setIsScanningLibrary(true);
        setLibraryScanStatus({
          current: 0,
          total: 0,
          file: 'Discovering audio files in folder(s)...'
        });
        showStatus(`Started background scanning of ${res.folders?.length || 1} folder(s)...`);
      }
    } catch (err) {
      showStatus('Error scanning folder: ' + err.message);
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

  const handleCastPlaylist = (pl) => {
    if (!pl || !pl.tracks || pl.tracks.length === 0) {
      showStatus(`Playlist "${pl?.name || 'Playlist'}" has no tracks.`);
      return;
    }
    const target = outputTarget !== 'local' ? outputTarget : (speakers[0]?.ip || 'all');
    setOutputTarget(target);
    setPlaylist([...pl.tracks]);
    setCurrentTrackIndex(0);
    castTrack(target, pl.tracks[0]);
    if (playerRef.current?.audio?.current) {
      playerRef.current.audio.current.muted = true;
      playerRef.current.audio.current.play().catch(() => {});
    }
    showStatus(`Casting playlist "${pl.name}" to ${getSpeakerName(target)}!`);
  };

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

  const handleAddTrackToPlaylist = async (playlistId, track) => {
    try {
      await window.robosAudio.addTracksToPlaylist(playlistId, [track]);
      await refreshPlaylists();
      const targetPl = playlists.find(p => p.id === playlistId);
      setShowAddToPlaylistModal(false);
      setSelectedTrackForPlaylist(null);
      showStatus(`Added "${track.title}" to "${targetPl?.name || 'playlist'}"!`);
    } catch (err) {
      showStatus('Error adding to playlist: ' + err.message);
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

  const handleRemoveQueueTrack = (idxToRemove) => {
    if (playlist.length <= 1) {
      showStatus('Cannot remove the only track in queue');
      return;
    }
    const newQueue = playlist.filter((_, idx) => idx !== idxToRemove);
    let nextCurrent = currentTrackIndex;
    if (idxToRemove === currentTrackIndex) {
      nextCurrent = Math.min(currentTrackIndex, newQueue.length - 1);
    } else if (idxToRemove < currentTrackIndex) {
      nextCurrent = currentTrackIndex - 1;
    }
    setPlaylist(newQueue);
    setCurrentTrackIndex(nextCurrent);
    showStatus('Removed track from queue');
  };

  // ── Track Selection & Routing ─────────────────────────────────────────────

  const currentTrack = playlist[currentTrackIndex] || playlist[0] || null;

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
        if (playerRef.current?.audio?.current) {
          playerRef.current.audio.current.play().catch(() => {});
        }
        showStatus(`Resumed cast on ${getSpeakerName(activeCastSession.ip)}`);
      } else {
        await window.robosAudio.castPause(activeCastSession.ip);
        setActiveCastSession(prev => ({ ...prev, isPaused: true }));
        if (playerRef.current?.audio?.current) {
          playerRef.current.audio.current.pause();
        }
        showStatus(`Paused cast on ${getSpeakerName(activeCastSession.ip)}`);
      }
    } catch (err) {
      showStatus('Error toggling pause: ' + err.message);
    }
  };

  const castTrack = async (speakerIp, track) => {
    if (!speakerIp || speakerIp === 'local' || !track) return;
    showStatus(`Casting "${track.title}" to ${getSpeakerName(speakerIp)}...`);
    const metadata = {
      title: track.title,
      artist: track.artist,
      album: track.album,
    };
    if (track.artId) {
      metadata.images = [{ url: `http://192.168.1.34:0/art/${track.artId}.jpg` }];
    }

    try {
      if (speakerIp === 'all') {
        for (const s of speakers) {
          if (track.filePath) window.robosAudio.castFile(s.ip, track.filePath, metadata);
          else if (track.src) window.robosAudio.castUrl(s.ip, track.src, metadata);
        }
        setActiveCastSession({ ip: 'all', trackId: track.id, filePath: track.filePath, isPaused: false });
      } else {
        if (track.filePath) {
          await window.robosAudio.castFile(speakerIp, track.filePath, metadata);
        } else if (track.src) {
          await window.robosAudio.castUrl(speakerIp, track.src, metadata);
        }
        setActiveCastSession({ ip: speakerIp, trackId: track.id, filePath: track.filePath, isPaused: false });
      }
      showStatus(`Streaming "${track.title}" to ${getSpeakerName(speakerIp)}!`);
    } catch (err) {
      showStatus('Error casting track: ' + err.message);
      setActiveCastSession(null);
    }
  };

  const playTrack = async (track) => {
    if (!track) return;

    if (track.filePath && window.robosAudio?.ensureFileAccessible) {
      await window.robosAudio.ensureFileAccessible(track.filePath).catch(() => {});
    }

    let trackToPlay = { ...track };
    if (!trackToPlay.src && trackToPlay.filePath) {
      trackToPlay.src = encodeURI(`file://${trackToPlay.filePath}`);
    }

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
      if (playerRef.current?.audio?.current) {
        playerRef.current.audio.current.muted = false;
        setTimeout(() => {
          playerRef.current?.audio?.current?.play().catch((err) => {
            console.warn('[AudioPlayer] Playback error:', err);
            showStatus(`⚠️ Playback error: ${err.message || 'File not accessible'}`);
          });
        }, 60);
      }
    }
    setIsPlaying(true);
    showStatus(`Playing "${trackToPlay.title}" by ${trackToPlay.artist || 'Unknown'}`);
  };

  const handlePlayerPlay = () => {
    setIsPlaying(true);
    if (outputTarget !== 'local') {
      if (playerRef.current?.audio?.current) {
        playerRef.current.audio.current.muted = true;
      }
      if (activeCastSession && activeCastSession.isPaused) {
        window.robosAudio.castResume(activeCastSession.ip);
        setActiveCastSession(prev => ({ ...prev, isPaused: false }));
        showStatus(`Resumed casting on ${getSpeakerName(activeCastSession.ip)}`);
      } else if (currentTrack) {
        castTrack(outputTarget, currentTrack);
      }
    }
  };

  const handlePlayerPause = () => {
    setIsPlaying(false);
    if (outputTarget !== 'local' && activeCastSession) {
      window.robosAudio.castPause(activeCastSession.ip);
      setActiveCastSession(prev => ({ ...prev, isPaused: true }));
      showStatus(`Paused casting on ${getSpeakerName(activeCastSession.ip)}`);
    }
  };

  const handleTogglePlayPause = () => {
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
    <div
      className="react-audio-app"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
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

        {/* Global Action Buttons in Header */}
        <div className="header-actions">
          <button
            id="btn-header-add-folder"
            className="btn-accent"
            onClick={handleSelectFolder}
            title="Open built-in system file manager to add music folder"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/><line x1="12" y1="10" x2="12" y2="16"/><line x1="9" y1="13" x2="15" y2="13"/></svg>
            <span>Add Folder</span>
          </button>
          <button
            id="btn-header-add-files"
            className="btn-secondary"
            onClick={handleAddFiles}
            title="Open file picker to select individual audio files"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
            <span>Add Files</span>
          </button>
        </div>

        {/* Output Selector */}
        <div className="output-selector-wrapper">
          <label>Audio Output:</label>
          <div className="select-group">
            <select
              id="output-select"
              value={outputTarget}
              onChange={(e) => {
                const target = e.target.value;
                setOutputTarget(target);
                if (target === 'local') {
                  if (activeCastSession) handleStopCast();
                  if (playerRef.current?.audio?.current) {
                    playerRef.current.audio.current.muted = false;
                  }
                } else {
                  if (playerRef.current?.audio?.current) {
                    playerRef.current.audio.current.muted = true;
                  }
                  if (currentTrack) {
                    castTrack(target, currentTrack);
                  }
                }
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
          id="tab-btn-player"
          className={`tab-btn ${activeTab === 'player' ? 'active' : ''}`}
          onClick={() => setActiveTab('player')}
        >
          🎵 Now Playing
        </button>
        <button
          id="tab-btn-playlists"
          className={`tab-btn ${activeTab === 'playlists' ? 'active' : ''}`}
          onClick={() => setActiveTab('playlists')}
        >
          📑 Playlists ({playlists.length})
        </button>
        <button
          id="tab-btn-library"
          className={`tab-btn ${activeTab === 'library' ? 'active' : ''}`}
          onClick={() => setActiveTab('library')}
        >
          📚 Media Library ({library.tracks.length})
        </button>
        <button
          id="tab-btn-ambient"
          className={`tab-btn ${activeTab === 'ambient' ? 'active' : ''}`}
          onClick={() => setActiveTab('ambient')}
        >
          ⚡ Ambient Synthesizers
        </button>
        <button
          id="tab-btn-speakers"
          className={`tab-btn ${activeTab === 'speakers' ? 'active' : ''}`}
          onClick={() => setActiveTab('speakers')}
        >
          🔊 Discovered Speakers ({speakers.length})
        </button>
      </nav>

      {/* Main Content Area */}
      <main className="tab-content">
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
              ✕ Cancel Scan
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
                        ? `🔊 Casting "${currentTrack?.title || 'Track'}" to ${getSpeakerName(activeCastSession.ip)}${activeCastSession.isPaused ? ' (Paused)' : ' (Live)'}`
                        : `🎯 Output routed to ${getSpeakerName(outputTarget)} (Local desktop muted)`}
                    </span>
                  </div>
                  <div className="cast-bar-controls">
                    {activeCastSession && (
                      <button className="btn-chip" onClick={handleToggleCastPause}>
                        {activeCastSession.isPaused ? '▶ Resume Cast' : '⏸ Pause Cast'}
                      </button>
                    )}
                    {activeCastSession && (
                      <button className="btn-chip btn-stop-cast" onClick={() => handleStopCast(activeCastSession.ip)}>
                        ⏹ Stop Cast
                      </button>
                    )}
                    {outputTarget !== 'local' && (
                      <button className="btn-chip" onClick={() => { setOutputTarget('local'); handleStopCast(); }}>
                        💻 Switch to Local Desktop
                      </button>
                    )}
                  </div>
                </div>
              )}

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
                    <span className="badge">Output: {getSpeakerName(outputTarget)}</span>
                    {activeCastSession && (
                      <span className="badge" style={{ color: '#22c55e', borderColor: '#22c55e' }}>
                        {activeCastSession.isPaused ? '⏸ Cast Paused' : '🔊 Casting Active'}
                      </span>
                    )}
                    {currentTrack?.genre && <span className="badge">{currentTrack.genre}</span>}
                    {currentTrack?.year && <span className="badge">{currentTrack.year}</span>}
                  </div>
                </div>

                <div className="hero-quick-actions">
                  <button className="btn-secondary" onClick={handleSelectFolder} title="Add folder via file manager">
                    📁 Add Folder
                  </button>
                  <button className="btn-secondary" onClick={handleAddFiles} title="Add files">
                    ➕ Add Files
                  </button>
                </div>
              </div>

              {/* React H5 Audio Player Component */}
              <div className="react-h5-wrapper">
                <AudioPlayer
                  ref={playerRef}
                  src={currentTrack?.src || (currentTrack?.filePath ? `file://${currentTrack.filePath}` : '')}
                  showSkipControls={true}
                  showJumpControls={false}
                  autoPlayAfterSrcChange={true}
                  onClickNext={handlePlayNext}
                  onClickPrevious={handlePlayPrev}
                  onEnded={handlePlayNext}
                  onPlay={handlePlayerPlay}
                  onPause={handlePlayerPause}
                  onError={(e) => {
                    console.warn('[AudioPlayer] Audio playback error:', e);
                    setIsPlaying(false);
                    showStatus('⚠️ Playback error: Track file may be missing, network drive unmounted, or format unsupported.');
                  }}
                  className="robos-rhap-theme"
                  layout="stacked"
                  customAdditionalControls={[]}
                  muted={outputTarget !== 'local'}
                />
              </div>

              {/* Queue bar */}
              <div className="queue-quick-peek">
                <div className="queue-header">
                  <div>
                    <h4>Playback Queue ({playlist.length})</h4>
                    <span className="queue-subtitle">Drag & drop files or save queue as a custom playlist</span>
                  </div>
                  <div className="queue-header-actions">
                    <button
                      id="btn-save-queue-as-playlist"
                      className="btn-chip"
                      onClick={() => setShowSaveQueueModal(true)}
                      title="Save current playback queue as a permanent playlist"
                    >
                      💾 Save as Playlist
                    </button>
                    <button
                      id="btn-shuffle-queue"
                      className="btn-chip"
                      onClick={handleShuffleQueue}
                      title="Shuffle queue"
                    >
                      🔀 Shuffle
                    </button>
                    <button
                      id="btn-clear-queue"
                      className="btn-chip btn-stop-cast"
                      onClick={handleClearQueue}
                      title="Clear other tracks from queue"
                    >
                      🗑 Clear
                    </button>
                  </div>
                </div>
                <div className="queue-items-scroll">
                  {playlist.map((t, idx) => (
                    <div
                      key={t.id || idx}
                      className={`queue-chip ${idx === currentTrackIndex ? 'active' : ''}`}
                      onClick={() => {
                        setCurrentTrackIndex(idx);
                        if (outputTarget !== 'local') castTrack(outputTarget, t);
                      }}
                    >
                      <div className="queue-chip-content">
                        <span className="queue-chip-title">{idx + 1}. {t.title}</span>
                        <span className="queue-chip-artist">{t.artist}</span>
                      </div>
                      {playlist.length > 1 && (
                        <button
                          className="btn-remove-queue-item"
                          title="Remove from queue"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveQueueTrack(idx);
                          }}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>

        {/* TAB: PLAYLISTS */}
        {activeTab === 'playlists' && (
          <div className="playlists-view-container">
            <div className="playlists-header">
              <div className="playlists-title-group">
                <h3>📑 Custom Playlists ({playlists.length})</h3>
                <p className="subtitle">Curate custom music collections, import/export M3U playlists, and cast directly to speakers</p>
              </div>
              <div className="playlists-header-actions">
                <button
                  id="btn-create-playlist"
                  className="btn-accent"
                  onClick={() => setShowCreatePlaylistModal(true)}
                >
                  ➕ New Playlist
                </button>
                <button
                  id="btn-import-m3u"
                  className="btn-secondary"
                  onClick={handleImportM3u}
                  title="Import external .m3u or .m3u8 playlist file"
                >
                  📥 Import M3U
                </button>
              </div>
            </div>

            <div className="playlists-layout">
              {/* Left Sidebar: Playlists List */}
              <div className="playlists-sidebar">
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
                        ▶
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Right Detail Pane: Playlist View */}
              <div className="playlist-detail-pane">
                {selectedPlaylist ? (
                  <>
                    <div className="playlist-detail-header">
                      <div className="playlist-detail-meta">
                        <div className="playlist-cover-icon">
                          <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#00bcd4" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                        </div>
                        <div className="playlist-text-meta">
                          <h2>{selectedPlaylist.name}</h2>
                          <p className="playlist-description">{selectedPlaylist.description || 'No description provided.'}</p>
                          <div className="playlist-stats">
                            <span className="badge">{selectedPlaylist.tracks?.length || 0} Tracks</span>
                            <span className="badge">Duration: {formatTotalDuration(selectedPlaylist.tracks)}</span>
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
                          ▶ Play All
                        </button>
                        <button
                          id="btn-append-playlist"
                          className="btn-secondary"
                          onClick={() => handleAppendPlaylistToQueue(selectedPlaylist)}
                          disabled={!selectedPlaylist.tracks?.length}
                          title="Append all tracks to current queue"
                        >
                          ➕ Append to Queue
                        </button>
                        {speakers.length > 0 && (
                          <button
                            id="btn-cast-playlist"
                            className="btn-secondary"
                            onClick={() => handleCastPlaylist(selectedPlaylist)}
                            disabled={!selectedPlaylist.tracks?.length}
                            title={`Cast playlist to ${getSpeakerName(outputTarget !== 'local' ? outputTarget : speakers[0].ip)}`}
                          >
                            🔊 Cast Playlist
                          </button>
                        )}
                        <button
                          id="btn-export-m3u"
                          className="btn-secondary"
                          onClick={() => handleExportM3u(selectedPlaylist.id)}
                          title="Export playlist to .m3u file"
                        >
                          📤 Export M3U
                        </button>
                        <button
                          id="btn-delete-playlist"
                          className="btn-chip btn-stop-cast"
                          onClick={() => handleDeletePlaylist(selectedPlaylist.id)}
                          title="Delete playlist"
                        >
                          🗑 Delete
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
                            ➕ Add Audio Files from Disk
                          </button>
                        </div>
                      ) : (
                        <div className="playlist-tracks-table">
                          <div className="playlist-table-header">
                            <span className="col-num">#</span>
                            <span className="col-title">Title</span>
                            <span className="col-artist">Artist</span>
                            <span className="col-album">Album</span>
                            <span className="col-duration">Duration</span>
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
                                    ▶
                                  </button>
                                  <button
                                    className="btn-row-action"
                                    title="Move up"
                                    disabled={tIdx === 0}
                                    onClick={() => handleMoveTrackInPlaylist(selectedPlaylist.id, tIdx, tIdx - 1)}
                                  >
                                    ▲
                                  </button>
                                  <button
                                    className="btn-row-action"
                                    title="Move down"
                                    disabled={tIdx === selectedPlaylist.tracks.length - 1}
                                    onClick={() => handleMoveTrackInPlaylist(selectedPlaylist.id, tIdx, tIdx + 1)}
                                  >
                                    ▼
                                  </button>
                                  <button
                                    className="btn-row-action btn-danger"
                                    title="Remove from playlist"
                                    onClick={() => handleRemoveTrackFromPlaylist(selectedPlaylist.id, tIdx)}
                                  >
                                    ✕
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
                          <h4>➕ Add Tracks from Media Library</h4>
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
                              📁 Add Audio Files
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
                      ➕ Create Playlist
                    </button>
                  </div>
                )}
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
                <button
                  id="btn-browse-refresh"
                  className="btn-secondary"
                  onClick={async () => {
                    await loadLibrary();
                    showStatus('Library refreshed from disk cache.');
                  }}
                  title="Refresh and sync library index"
                >
                  <span>🔄 Refresh</span>
                </button>
                <button id="btn-browse-add-folder" className="btn-accent" onClick={handleSelectFolder}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/><line x1="12" y1="10" x2="12" y2="16"/><line x1="9" y1="13" x2="15" y2="13"/></svg>
                  <span>Add Folder via File Manager</span>
                </button>
                <button className="btn-secondary" onClick={handleAddFiles}>
                  <span>➕ Add Files</span>
                </button>
              </div>
            </div>

            {/* Active Cast Bar in Library */}
            {activeCastSession && (
              <div className="active-cast-bar" style={{ marginBottom: '16px' }}>
                <div className="cast-bar-indicator">
                  <span
                    className="cast-pulse-dot"
                    style={{ background: activeCastSession.isPaused ? '#eab308' : '#22c55e' }}
                  ></span>
                  <span>🔊 Currently casting to <strong>{getSpeakerName(activeCastSession.ip)}</strong></span>
                </div>
                <div className="cast-bar-controls">
                  <button className="btn-chip" onClick={handleToggleCastPause}>
                    {activeCastSession.isPaused ? '▶ Resume' : '⏸ Pause'}
                  </button>
                  <button className="btn-chip btn-stop-cast" onClick={() => handleStopCast(activeCastSession.ip)}>
                    ⏹ Stop Cast
                  </button>
                </div>
              </div>
            )}

            {/* Dropzone Hint */}
            <div className="dropzone-banner" onClick={handleSelectFolder}>
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#00bcd4" stroke-width="2"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>
              <p>Click here or drag & drop any music folder from your file manager to scan and index</p>
            </div>

            {/* Library Grid */}
            <div className="library-grid">
              {filteredLibrary.length === 0 ? (
                <div className="empty-state">
                  <p>No tracks indexed in media library yet.</p>
                  <button className="btn-accent" onClick={handleSelectFolder} style={{ marginTop: '12px' }}>
                    📁 Add Folder via File Manager Popup
                  </button>
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
                      <button
                        className="btn-chip"
                        title="Add to current playback queue"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPlaylist(prev => [...prev, t]);
                          showStatus(`Added "${t.title}" to queue`);
                        }}
                      >
                        ➕ Queue
                      </button>
                      <button
                        className="btn-chip"
                        title="Add track to a custom playlist"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedTrackForPlaylist(t);
                          setShowAddToPlaylistModal(true);
                        }}
                      >
                        📑 Playlist
                      </button>
                      {speakers.length > 0 && (
                        (activeCastSession && (activeCastSession.trackId === t.id || activeCastSession.filePath === t.filePath)) ? (
                          <button
                            className="btn-chip btn-stop-cast active"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStopCast(activeCastSession.ip);
                            }}
                            title="Stop playback on Google Cast speaker"
                          >
                            ⏹ Stop Cast
                          </button>
                        ) : (
                          <button
                            className="btn-chip"
                            onClick={(e) => {
                              e.stopPropagation();
                              const target = outputTarget !== 'local' ? outputTarget : speakers[0].ip;
                              if (outputTarget === 'local') setOutputTarget(target);
                              playTrack(t);
                            }}
                            title={`Cast to ${getSpeakerName(outputTarget !== 'local' ? outputTarget : speakers[0].ip)}`}
                          >
                            🔊 Cast
                          </button>
                        )
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
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn-chip btn-stop-cast" onClick={() => handleStopCast()}>
                  ⏹ Stop All Speakers
                </button>
                <button className="btn-secondary" onClick={refreshSpeakers}>
                  🔄 Refresh Subnet Scan
                </button>
              </div>
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
                    <button className="btn-chip btn-stop-cast" onClick={() => handleStopCast(s.ip)}>
                      ⏹ Stop Playback
                    </button>
                    <button className="btn-secondary" onClick={async () => {
                      showStatus(`Playing harmonic test chime on ${s.name}...`);
                      try {
                        await window.robosAudio.playTestChime(s.ip);
                        showStatus(`Test chime played on ${s.name}`);
                      } catch (err) {
                        showStatus('Test chime error: ' + err.message);
                      }
                    }}>
                      🔔 Play Test Chime
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Persistent Bottom Mini-Player when browsing library/playlists/etc */}
      {activeTab !== 'player' && currentTrack && (
        <footer className="mini-player-bar">
          <div className="mini-player-info" onClick={() => setActiveTab('player')}>
            <div className="mini-art">
              {currentTrack?.artId ? (
                <img src={`http://192.168.1.34:0/art/${currentTrack.artId}.jpg`} alt="" />
              ) : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#00bcd4" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8" fill="#00bcd4"/></svg>
              )}
            </div>
            <div className="mini-text">
              <span className="mini-title">{currentTrack.title}</span>
              <span className="mini-artist">{currentTrack.artist || 'Unknown'} &bull; {currentTrack.album || ''}</span>
            </div>
          </div>
          <div className="mini-player-controls">
            <button className="mini-ctrl-btn" title="Previous" onClick={handlePlayPrev}>⏮</button>
            <button className="mini-ctrl-btn mini-btn-play" title={isPlaying ? "Pause" : "Play"} onClick={handleTogglePlayPause}>
              {isPlaying ? '⏸' : '▶'}
            </button>
            <button className="mini-ctrl-btn" title="Next" onClick={handlePlayNext}>⏭</button>
          </div>
          <div className="mini-player-right">
            <span className="badge mini-badge">Output: {getSpeakerName(outputTarget)}</span>
            <button id="btn-mini-now-playing" className="btn-chip" onClick={() => setActiveTab('player')}>
              🎵 Now Playing
            </button>
          </div>
        </footer>
      )}

      {/* Modal: Create Playlist */}
      {showCreatePlaylistModal && (
        <div className="modal-overlay" onClick={() => setShowCreatePlaylistModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>➕ Create New Playlist</h3>
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
            <h3>💾 Save Queue as Playlist</h3>
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

      {/* Modal: Add Track to Playlist */}
      {showAddToPlaylistModal && selectedTrackForPlaylist && (
        <div className="modal-overlay" onClick={() => { setShowAddToPlaylistModal(false); setSelectedTrackForPlaylist(null); }}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>📑 Add Track to Playlist</h3>
            <div className="modal-selected-track-info">
              <strong>{selectedTrackForPlaylist.title}</strong>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{selectedTrackForPlaylist.artist} &bull; {selectedTrackForPlaylist.album}</span>
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
                      onClick={() => handleAddTrackToPlaylist(pl.id, selectedTrackForPlaylist)}
                    >
                      <div>
                        <strong>{pl.name}</strong>
                        <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          {pl.tracks?.length || 0} track(s)
                        </span>
                      </div>
                      <span className="btn-chip">➕ Add</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
              <button
                className="btn-chip"
                onClick={() => {
                  setShowAddToPlaylistModal(false);
                  setShowCreatePlaylistModal(true);
                }}
              >
                ➕ New Playlist
              </button>
              <button
                className="btn-secondary"
                onClick={() => {
                  setShowAddToPlaylistModal(false);
                  setSelectedTrackForPlaylist(null);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {statusMsg && <div className="toast">{statusMsg}</div>}
    </div>
  );
}

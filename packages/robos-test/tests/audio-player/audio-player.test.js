'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const http = require('http');

const APP_DIR = path.resolve(__dirname, '../../../audio-player');
const { CastService } = require(path.join(APP_DIR, 'lib', 'cast-service'));
const { MediaLibrary } = require(path.join(APP_DIR, 'lib', 'media-library'));

describe('RobOS Audio Player Tests', () => {

  describe('Package Structure & Registrations', () => {
    it('package.json exists and contains React, H5AudioPlayer, and music-metadata', () => {
      const pkgPath = path.join(APP_DIR, 'package.json');
      assert.ok(fs.existsSync(pkgPath), 'package.json should exist');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      assert.strictEqual(pkg.name, 'robos-audio-player');
      assert.ok(pkg.dependencies['castv2-client'], 'castv2-client should be present');
      assert.ok(pkg.dependencies['react'], 'react should be present');
      assert.ok(pkg.dependencies['react-dom'], 'react-dom should be present');
      assert.ok(pkg.dependencies['react-h5-audio-player'], 'react-h5-audio-player should be present');
      assert.ok(pkg.dependencies['music-metadata'], 'music-metadata should be present');
    });

    it('.desktop file exists and conforms to RobOS standards', () => {
      const desktopPath = path.join(APP_DIR, 'audio-player.desktop');
      assert.ok(fs.existsSync(desktopPath), 'audio-player.desktop should exist');
      const content = fs.readFileSync(desktopPath, 'utf8');
      assert.ok(content.includes('X-RobOS-App=true'), 'Should have X-RobOS-App=true');
      assert.ok(content.includes('X-RobOS-Category=Tools'), 'Should have X-RobOS-Category=Tools');
      assert.ok(content.includes('StartupWMClass=robos-audio-player'), 'Should have StartupWMClass');
    });

    it('icon.svg exists and is valid 48x48 SVG', () => {
      const iconPath = path.join(APP_DIR, 'icon.svg');
      assert.ok(fs.existsSync(iconPath), 'icon.svg should exist');
      const content = fs.readFileSync(iconPath, 'utf8');
      assert.ok(content.includes('width="48"'), 'Width should be 48');
      assert.ok(content.includes('height="48"'), 'Height should be 48');
      assert.ok(content.includes('#00bcd4'), 'Accent color should match RobOS cyan');
    });

    it('icon.png exists and is a valid raster PNG for BrowserWindow _NET_WM_ICON', () => {
      const pngPath = path.join(APP_DIR, 'icon.png');
      assert.ok(fs.existsSync(pngPath), 'icon.png should exist');
      const stat = fs.statSync(pngPath);
      assert.ok(stat.size > 100, `icon.png should be non-empty, got ${stat.size} bytes`);
    });

    it('desktop shortcut exists in ~/Desktop/audio-player.desktop', () => {
      const desktopShortcut = path.join(process.env.HOME || '/home/ndipiazza', 'Desktop', 'audio-player.desktop');
      assert.ok(fs.existsSync(desktopShortcut), 'Desktop shortcut should exist on ~/Desktop');
      const content = fs.readFileSync(desktopShortcut, 'utf8');
      assert.ok(content.includes('Name=RobOS Audio Player'), 'Shortcut should have correct Name');
      assert.ok(content.includes('Exec='), 'Shortcut should have Exec command');
      assert.ok(content.includes('StartupWMClass=robos-audio-player'), 'Shortcut should have StartupWMClass');
    });

    it('compiled React bundle exists and is valid', () => {
      const bundlePath = path.join(APP_DIR, 'renderer', 'bundle.js');
      assert.ok(fs.existsSync(bundlePath), 'bundle.js should exist');
      const stat = fs.statSync(bundlePath);
      assert.ok(stat.size > 100000, `bundle.js should be non-empty (>100KB), got ${stat.size}`);
    });

    it('renderer HTML mounts React app into root', () => {
      const htmlPath = path.join(APP_DIR, 'renderer', 'index.html');
      assert.ok(fs.existsSync(htmlPath), 'index.html should exist');
      const html = fs.readFileSync(htmlPath, 'utf8');
      assert.ok(html.includes('id="root"'), 'Should have root element');
      assert.ok(html.includes('src="bundle.js"'), 'Should load bundle.js');
    });

    it('snapshot-cli port registry includes audio-player on port 19196', () => {
      const snapPath = path.resolve(__dirname, '../../../robos-lib/snapshot-cli.js');
      const content = fs.readFileSync(snapPath, 'utf8');
      assert.ok(content.includes("'audio-player':      19196"), 'Port 19196 should be registered in snapshot-cli.js');
    });

    it('robos-icons includes audio-player in BUILTIN_APPS', () => {
      const iconsPath = path.resolve(__dirname, '../../../robos-icons/index.js');
      const content = fs.readFileSync(iconsPath, 'utf8');
      assert.ok(content.includes("appId: 'audio-player'"), 'appId audio-player should be registered in robos-icons');
    });

    it('AGENTS.md lists RobOS Audio Player in Supporting Apps', () => {
      const agentsMdPath = path.resolve(__dirname, '../../../../AGENTS.md');
      const content = fs.readFileSync(agentsMdPath, 'utf8');
      assert.ok(content.includes('**RobOS Audio Player**'), 'AGENTS.md should list RobOS Audio Player');
    });

    it('documentation page exists in docs/_apps/audio-player.md', () => {
      const docPath = path.resolve(__dirname, '../../../../docs/_apps/audio-player.md');
      assert.ok(fs.existsSync(docPath), 'docs/_apps/audio-player.md should exist');
    });

    it('.robos/packages.yaml lists audio-player', () => {
      const pkgYaml = path.resolve(__dirname, '../../../../.robos/packages.yaml');
      const content = fs.readFileSync(pkgYaml, 'utf8');
      assert.ok(content.includes('urn:robos:desktop-app:audio-player'), 'packages.yaml should include audio-player');
    });

    it('preload.js exposes playTestChime, ensureFileAccessible, and omits voice announcer/TTS methods', () => {
      const preloadPath = path.join(APP_DIR, 'preload.js');
      const content = fs.readFileSync(preloadPath, 'utf8');
      assert.ok(content.includes('playTestChime:'), 'preload should expose playTestChime');
      assert.ok(content.includes('ensureFileAccessible:'), 'preload should expose ensureFileAccessible');
      assert.ok(!content.includes('castTTS:'), 'preload should NOT expose castTTS (voice announcer moved to dedicated app)');
    });

    it('renderer bundle.js includes persistent mini-player and omits voice announcer panel', () => {
      const bundlePath = path.join(APP_DIR, 'renderer', 'bundle.js');
      const content = fs.readFileSync(bundlePath, 'utf8');
      assert.ok(content.includes('mini-player-bar'), 'bundle should contain persistent mini-player-bar');
      assert.ok(content.includes('btn-browse-refresh'), 'bundle should contain btn-browse-refresh');
      assert.ok(!content.includes('announcer-panel'), 'bundle should not have announcer-panel');
      assert.ok(!content.includes('tts-input'), 'bundle should not have tts-input');
      assert.ok(!content.includes('Smart Speaker Voice Announcer'), 'bundle should not have Voice Announcer title');
    });
  });

  describe('MediaLibrary with music-metadata', () => {
    it('initializes MediaLibrary and loads parser', async () => {
      const lib = new MediaLibrary({ configDir: '/tmp' });
      assert.ok(lib, 'MediaLibrary instance created');
      const parser = await lib._getParser();
      assert.ok(parser.parseFile, 'music-metadata parseFile function available');
    });

    it('handles non-existent or dummy file gracefully', async () => {
      const lib = new MediaLibrary({ configDir: '/tmp' });
      const dummyPath = '/tmp/nonexistent-song.mp3';
      const track = await lib.parseTrack(dummyPath);
      assert.strictEqual(track.title, 'nonexistent-song');
      assert.strictEqual(track.filePath, dummyPath);
    });

    it('scans folders in background worker thread without blocking', async () => {
      const testDir = '/tmp/robos-audio-test-bg';
      fs.mkdirSync(testDir, { recursive: true });
      const testFile = path.join(testDir, 'sample-song.mp3');
      fs.writeFileSync(testFile, 'ID3\x03\x00\x00\x00\x00\x00\x00dummy sample audio content');

      const lib = new MediaLibrary({ configDir: '/tmp' });
      let progressCalled = false;
      let batchCalled = false;

      const result = await new Promise((resolve, reject) => {
        lib.scanFoldersInBackground(testDir, {
          onProgress: (p) => {
            progressCalled = true;
          },
          onBatch: (b) => {
            batchCalled = true;
          },
          onDone: (data) => {
            resolve(data);
          },
          onError: (err) => {
            reject(err);
          }
        });
      });

      assert.strictEqual(result.totalFound, 1);
      assert.strictEqual(result.tracks.length >= 1, true);
      assert.strictEqual(progressCalled, true);
      assert.strictEqual(batchCalled, true);

      // Clean up
      try {
        fs.unlinkSync(testFile);
        fs.rmdirSync(testDir);
      } catch {}
    });

    it('cancels active background scan cleanly', async () => {
      const lib = new MediaLibrary({ configDir: '/tmp' });
      lib.scanFoldersInBackground('/tmp', {});
      assert.strictEqual(lib.isScanning(), true);
      const canceled = lib.cancelScan();
      assert.strictEqual(canceled, true);
      assert.strictEqual(lib.isScanning(), false);
    });

    it('generates unique collision-free SHA-1 IDs for files sharing common directory prefixes', async () => {
      const lib = new MediaLibrary({ configDir: '/tmp' });
      const path1 = '/run/user/1000/gvfs/sftp:host=192.168.1.25/downloads/music/Album 1/Track 01.mp3';
      const path2 = '/run/user/1000/gvfs/sftp:host=192.168.1.25/downloads/music/Album 1/Track 02.mp3';

      const track1 = await lib.parseTrack(path1);
      const track2 = await lib.parseTrack(path2);

      assert.notStrictEqual(track1.id, track2.id, 'Tracks in same directory must have distinct IDs');
      assert.strictEqual(track1.id.startsWith('trk_'), true);
      assert.strictEqual(track2.id.startsWith('trk_'), true);
    });

    it('properly encodes file URLs with spaces and special characters using pathToFileURL', async () => {
      const lib = new MediaLibrary({ configDir: '/tmp' });
      const testPath = '/run/user/1000/gvfs/sftp:host=192.168.1.25/downloads/music/1993 - Album/Death - 01 - Song.mp3';
      const track = await lib.parseTrack(testPath);

      assert.strictEqual(track.src.includes(' '), false, 'URL should not contain raw unencoded spaces');
      assert.strictEqual(track.src.includes('%20'), true, 'Spaces in URL must be encoded as %20');
      assert.strictEqual(track.src.startsWith('file:///'), true, 'Must start with file:///');
    });

    it('self-heals legacy duplicate IDs and unencoded file URLs on cache load', async () => {
      const tmpConfigDir = path.join('/tmp', `robos-lib-test-${Date.now()}`);
      fs.mkdirSync(tmpConfigDir, { recursive: true });
      const cachePath = path.join(tmpConfigDir, 'audio-library.json');

      // Write mock legacy cache with duplicated IDs and unencoded spaces
      const legacyData = {
        updatedAt: '2026-10-14T00:00:00.000Z',
        tracks: [
          {
            id: 'trk_L3J1bi91c2VyLzEw',
            filePath: '/run/user/1000/gvfs/sftp:host=192.168.1.25/music/Album/Song 1.mp3',
            title: 'Song 1',
            src: 'file:///run/user/1000/gvfs/sftp:host=192.168.1.25/music/Album/Song 1.mp3'
          },
          {
            id: 'trk_L3J1bi91c2VyLzEw',
            filePath: '/run/user/1000/gvfs/sftp:host=192.168.1.25/music/Album/Song 2.mp3',
            title: 'Song 2',
            src: 'file:///run/user/1000/gvfs/sftp:host=192.168.1.25/music/Album/Song 2.mp3'
          }
        ]
      };
      fs.writeFileSync(cachePath, JSON.stringify(legacyData, null, 2));

      // Loading MediaLibrary must self-heal the duplicate IDs and URL encode src
      const lib = new MediaLibrary({ configDir: tmpConfigDir });
      assert.strictEqual(lib.tracks.length, 2);
      assert.notStrictEqual(lib.tracks[0].id, lib.tracks[1].id, 'Migrated IDs must be unique');
      assert.strictEqual(lib.tracks[0].src.includes('%20'), true, 'Migrated src must be encoded');
      assert.strictEqual(lib.tracks[1].src.includes('%20'), true, 'Migrated src must be encoded');

      // Verify the on-disk file was saved with the healed data
      const savedData = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      assert.notStrictEqual(savedData.tracks[0].id, savedData.tracks[1].id);

      // Clean up
      fs.rmSync(tmpConfigDir, { recursive: true, force: true });
    });
  });

  describe('CastService & Ephemeral Stream Server', () => {
    let service;

    before(() => {
      service = new CastService();
    });

    after(async () => {
      http.globalAgent.destroy();
      if (service && service.streamServer) {
        if (typeof service.streamServer.closeAllConnections === 'function') {
          service.streamServer.closeAllConnections();
        }
        await new Promise(r => service.streamServer.close(r));
      }
    });

    it('detects a valid host IPv4 address', () => {
      assert.ok(service.hostIp, 'Host IP should be detected');
      assert.ok(/^\d+\.\d+\.\d+\.\d+$/.test(service.hostIp), `Valid IPv4 format: ${service.hostIp}`);
    });

    it('starts ephemeral HTTP audio streamer on an open port', async () => {
      await new Promise(r => setTimeout(r, 100));
      assert.ok(service.streamPort > 0, `Stream port should be allocated, got ${service.streamPort}`);
    });

    it('registers an in-memory audio buffer and serves it over HTTP', async () => {
      const testBuffer = Buffer.from('FAKE_MP3_AUDIO_HEADER_AND_BYTES_123456');
      const streamUrl = service.registerBuffer(testBuffer, 'audio/mp3');
      assert.ok(streamUrl.includes(`:${service.streamPort}/media/`), `Stream URL formatted properly: ${streamUrl}`);

      const res = await new Promise((resolve, reject) => {
        http.get(streamUrl, { agent: false }, (response) => {
          const chunks = [];
          response.on('data', c => chunks.push(c));
          response.on('end', () => {
            resolve({
              statusCode: response.statusCode,
              headers: response.headers,
              body: Buffer.concat(chunks)
            });
          });
        }).on('error', reject);
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.headers['content-type'], 'audio/mp3');
      assert.strictEqual(res.headers['content-length'], String(testBuffer.length));
      assert.deepStrictEqual(res.body, testBuffer);
    });

    it('returns 404 for unknown media IDs', async () => {
      const invalidUrl = `http://${service.hostIp}:${service.streamPort}/media/nonexistent.mp3`;
      const res = await new Promise((resolve, reject) => {
        http.get(invalidUrl, { agent: false }, (response) => {
          resolve(response.statusCode);
        }).on('error', reject);
      });
      assert.strictEqual(res, 404);
    });

    it('stopPlayback handles inactive or non-existent client gracefully', async () => {
      const res = await service.stopPlayback('127.0.0.1');
      assert.ok(typeof res === 'object', 'Should return object');
      assert.strictEqual(res.ip, '127.0.0.1');
    });

    it('stopAllPlayback executes without error', async () => {
      const results = await service.stopAllPlayback();
      assert.ok(Array.isArray(results), 'Should return array of stop results');
    });

    it('generateChimeBuffer generates valid 16-bit PCM WAV audio buffer', () => {
      const chimeBuffer = service.generateChimeBuffer();
      assert.ok(Buffer.isBuffer(chimeBuffer), 'Chime must be a Node.js Buffer');
      assert.ok(chimeBuffer.length > 44, 'Chime buffer must be larger than 44-byte WAV header');
      assert.strictEqual(chimeBuffer.subarray(0, 4).toString('ascii'), 'RIFF');
      assert.strictEqual(chimeBuffer.subarray(8, 12).toString('ascii'), 'WAVE');
      assert.strictEqual(chimeBuffer.subarray(12, 16).toString('ascii'), 'fmt ');
      assert.strictEqual(chimeBuffer.subarray(36, 40).toString('ascii'), 'data');
    });
  });

  describe('Playlist Management & M3U Export/Import', () => {
    const testConfigDir = `/tmp/robos-audio-pl-test-${Date.now()}`;

    before(() => {
      fs.mkdirSync(testConfigDir, { recursive: true });
    });

    after(() => {
      try {
        fs.rmSync(testConfigDir, { recursive: true, force: true });
      } catch {}
    });

    it('initializes with default curated playlists when cache does not exist', () => {
      const lib = new MediaLibrary({ configDir: testConfigDir });
      const playlists = lib.getPlaylists();
      assert.ok(Array.isArray(playlists), 'Playlists must be an array');
      assert.ok(playlists.length >= 2, 'Should initialize with default playlists');
      const fav = playlists.find(p => p.id === 'pl_favorites');
      assert.ok(fav, 'Favorites playlist should exist');
      const focus = playlists.find(p => p.id === 'pl_focus');
      assert.ok(focus, 'Focus playlist should exist');
      assert.ok(focus.tracks.length >= 1, 'Focus playlist should have initial tracks');
    });

    it('creates a new custom playlist and persists to disk', () => {
      const lib = new MediaLibrary({ configDir: testConfigDir });
      const created = lib.createPlaylist({
        name: 'Coding Synthwave',
        description: 'Retrowave & electronic beats for high-speed coding',
        tracks: [
          {
            id: 'trk-1',
            title: 'Neon Horizon',
            artist: 'Synth Master',
            album: 'Cyber Grid',
            duration: 215,
            filePath: '/home/music/neon-horizon.mp3'
          }
        ]
      });

      assert.ok(created.id.startsWith('pl_'), 'Playlist ID should have prefix pl_');
      assert.strictEqual(created.name, 'Coding Synthwave');
      assert.strictEqual(created.tracks.length, 1);

      // Verify reloaded from disk cache
      const reloadedLib = new MediaLibrary({ configDir: testConfigDir });
      const found = reloadedLib.getPlaylist(created.id);
      assert.ok(found, 'Created playlist should be found after re-instantiation');
      assert.strictEqual(found.name, 'Coding Synthwave');
      assert.strictEqual(found.tracks[0].title, 'Neon Horizon');
    });

    it('adds tracks to an existing playlist', () => {
      const lib = new MediaLibrary({ configDir: testConfigDir });
      const pl = lib.createPlaylist({ name: 'Workout Beats', tracks: [] });
      const trackToAdd = {
        id: 'trk-2',
        title: 'Adrenaline Rush',
        artist: 'Pulse',
        album: 'Cardio Vol 1',
        duration: 180,
        filePath: '/home/music/pulse.mp3'
      };

      const updated = lib.addTracksToPlaylist(pl.id, [trackToAdd]);
      assert.strictEqual(updated.tracks.length, 1);
      assert.strictEqual(updated.tracks[0].title, 'Adrenaline Rush');
    });

    it('reorders tracks within a playlist', () => {
      const lib = new MediaLibrary({ configDir: testConfigDir });
      const pl = lib.createPlaylist({
        name: 'Reorder Test',
        tracks: [
          { id: 't1', title: 'Track 1', duration: 100 },
          { id: 't2', title: 'Track 2', duration: 200 },
          { id: 't3', title: 'Track 3', duration: 300 }
        ]
      });

      lib.reorderPlaylistTracks(pl.id, 0, 2);
      const reordered = lib.getPlaylist(pl.id);
      assert.strictEqual(reordered.tracks[0].title, 'Track 2');
      assert.strictEqual(reordered.tracks[1].title, 'Track 3');
      assert.strictEqual(reordered.tracks[2].title, 'Track 1');
    });

    it('removes a track from a playlist by index', () => {
      const lib = new MediaLibrary({ configDir: testConfigDir });
      const pl = lib.createPlaylist({
        name: 'Remove Track Test',
        tracks: [
          { id: 't1', title: 'First Song' },
          { id: 't2', title: 'Second Song' }
        ]
      });

      lib.removeTrackFromPlaylist(pl.id, 0);
      const remaining = lib.getPlaylist(pl.id);
      assert.strictEqual(remaining.tracks.length, 1);
      assert.strictEqual(remaining.tracks[0].title, 'Second Song');
    });

    it('updates playlist name and description', () => {
      const lib = new MediaLibrary({ configDir: testConfigDir });
      const pl = lib.createPlaylist({ name: 'Old Title', description: 'Old Desc' });
      const updated = lib.updatePlaylist(pl.id, {
        name: 'New Title',
        description: 'New Description'
      });
      assert.strictEqual(updated.name, 'New Title');
      assert.strictEqual(updated.description, 'New Description');
    });

    it('deletes a playlist', () => {
      const lib = new MediaLibrary({ configDir: testConfigDir });
      const pl = lib.createPlaylist({ name: 'To Be Deleted' });
      const deleted = lib.deletePlaylist(pl.id);
      assert.strictEqual(deleted, true);
      assert.strictEqual(lib.getPlaylist(pl.id), null);
    });

    it('exports a playlist to standard M3U format', () => {
      const lib = new MediaLibrary({ configDir: testConfigDir });
      const pl = lib.createPlaylist({
        name: 'Rock Classics',
        tracks: [
          {
            title: 'Stairway to Code',
            artist: 'Led Dev',
            duration: 480,
            filePath: '/audio/rock/song1.mp3'
          },
          {
            title: 'Bohemian Codeflow',
            artist: 'Queen of Bugs',
            duration: 355,
            filePath: '/audio/rock/song2.mp3'
          }
        ]
      });

      const exportPath = path.join(testConfigDir, 'rock_classics.m3u');
      const res = lib.exportM3u(pl.id, exportPath);
      assert.strictEqual(res.ok, true);
      assert.ok(fs.existsSync(exportPath), 'M3U file should exist');

      const content = fs.readFileSync(exportPath, 'utf8');
      assert.ok(content.startsWith('#EXTM3U'), 'Should start with #EXTM3U');
      assert.ok(content.includes('#PLAYLIST:Rock Classics'), 'Should include playlist name');
      assert.ok(content.includes('#EXTINF:480,Led Dev - Stairway to Code'), 'Should format track 1');
      assert.ok(content.includes('/audio/rock/song1.mp3'), 'Should include file path 1');
      assert.ok(content.includes('#EXTINF:355,Queen of Bugs - Bohemian Codeflow'), 'Should format track 2');
    });

    it('imports an external M3U playlist file into a new playlist', async () => {
      const lib = new MediaLibrary({ configDir: testConfigDir });
      const m3uFile = path.join(testConfigDir, 'imported_session.m3u');
      const m3uContent = `#EXTM3U
#PLAYLIST:Imported Dev Session
#EXTINF:240,Lo-Fi Producer - Deep Focus Beat
/music/focus/beat1.mp3
#EXTINF:195,Cyber Artist - Neural Network Chords
/music/focus/beat2.mp3
`;
      fs.writeFileSync(m3uFile, m3uContent, 'utf8');

      const imported = await lib.importM3u(m3uFile);
      assert.ok(imported, 'Imported playlist should be returned');
      assert.strictEqual(imported.name, 'Imported Dev Session');
      assert.strictEqual(imported.tracks.length, 2);
      assert.strictEqual(imported.tracks[0].title, 'Deep Focus Beat');
      assert.strictEqual(imported.tracks[0].artist, 'Lo-Fi Producer');
      assert.strictEqual(imported.tracks[0].duration, 240);
      assert.strictEqual(imported.tracks[1].title, 'Neural Network Chords');
    });

    it('preload.js exposes all playlist IPC methods', () => {
      const preloadPath = path.join(APP_DIR, 'preload.js');
      const content = fs.readFileSync(preloadPath, 'utf8');
      assert.ok(content.includes('getPlaylists:'), 'Should expose getPlaylists');
      assert.ok(content.includes('createPlaylist:'), 'Should expose createPlaylist');
      assert.ok(content.includes('updatePlaylist:'), 'Should expose updatePlaylist');
      assert.ok(content.includes('deletePlaylist:'), 'Should expose deletePlaylist');
      assert.ok(content.includes('addTracksToPlaylist:'), 'Should expose addTracksToPlaylist');
      assert.ok(content.includes('removeTrackFromPlaylist:'), 'Should expose removeTrackFromPlaylist');
      assert.ok(content.includes('reorderPlaylistTracks:'), 'Should expose reorderPlaylistTracks');
      assert.ok(content.includes('exportPlaylistM3u:'), 'Should expose exportPlaylistM3u');
      assert.ok(content.includes('importPlaylistM3u:'), 'Should expose importPlaylistM3u');
    });

    it('bundle.js contains playlist navigation and management components', () => {
      const bundlePath = path.join(APP_DIR, 'renderer', 'bundle.js');
      const content = fs.readFileSync(bundlePath, 'utf8');
      assert.ok(content.includes('tab-btn-playlists'), 'Bundle should contain playlists tab button');
      assert.ok(content.includes('btn-create-playlist'), 'Bundle should contain create playlist button');
      assert.ok(content.includes('btn-import-m3u'), 'Bundle should contain import M3U button');
      assert.ok(content.includes('btn-save-queue-as-playlist'), 'Bundle should contain save queue as playlist button');
      assert.ok(content.includes('playlists-view-container'), 'Bundle should contain playlists view container');
    });
  });

  describe('Cloud On-Demand Streaming & Bounded LRU Cache', () => {
    const cloud = require(path.join(APP_DIR, 'lib', 'cloud-storage'));

    it('exposes metadata-only indexing, streamCloudTrackToHttp, and bounded LRU cache functions', () => {
      assert.strictEqual(typeof cloud.indexCloudAudio, 'function');
      assert.strictEqual(typeof cloud.streamCloudTrackToHttp, 'function');
      assert.strictEqual(typeof cloud.enforceCacheLimit, 'function');
      assert.strictEqual(typeof cloud.getCacheStats, 'function');
      assert.strictEqual(typeof cloud.setMaxCacheBytes, 'function');
      assert.strictEqual(typeof cloud.clearCache, 'function');
    });

    it('buildCloudTrack creates on-demand streamable track metadata without requiring local file on disk', async () => {
      const tmpDir = `/tmp/robos-cloud-trk-test-${Date.now()}`;
      fs.mkdirSync(tmpDir, { recursive: true });
      const lib = new MediaLibrary({ configDir: tmpDir });
      const desc = {
        connectionId: 'gdrive-test',
        driverType: 'gdrive',
        remotePath: '/Soundtracks/Chrono Trigger - Corridors of Time.mp3',
        driveId: 'file_123',
        name: 'Chrono Trigger - Corridors of Time.mp3',
        size: 8400000,
        localPath: path.join(tmpDir, 'cache', 'Chrono Trigger - Corridors of Time.mp3'),
        cached: false,
      };
      const streamUrl = 'http://127.0.0.1:43210/cloud-stream/trk_test.mp3';
      const track = await lib.buildCloudTrack(desc, streamUrl);

      assert.strictEqual(track.artist, 'Chrono Trigger');
      assert.strictEqual(track.title, 'Corridors of Time');
      assert.strictEqual(track.album, 'Soundtracks');
      assert.strictEqual(track.src, streamUrl);
      assert.strictEqual(track.cloud.connectionId, 'gdrive-test');
      assert.strictEqual(track.cloud.driveId, 'file_123');
      assert.strictEqual(track.cloud.cached, false);

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('LibraryFolders automatically populates all linked folders from Cloud Data Sources and migrates legacy root entries', () => {
      const { LibraryFolders } = require(path.join(APP_DIR, 'lib', 'library-folders'));
      const tmpDir = `/tmp/robos-lib-folders-test-${Date.now()}`;
      fs.mkdirSync(tmpDir, { recursive: true });

      const mockCacheRoot = path.join(tmpDir, 'cache', 'gdrive-test');
      // Write a legacy "/" entry in audio-folders.json
      fs.writeFileSync(path.join(tmpDir, 'audio-folders.json'), JSON.stringify([
        {
          id: 'fld_legacy1',
          label: '/',
          addedAt: '2026-10-20T00:00:00.000Z',
          lastSynced: '2026-10-20T00:00:00.000Z',
          kind: 'cloud',
          connectionId: 'gdrive-test',
          path: '/'
        }
      ], null, 2));

      const mockMediaLibrary = {
        tracks: [
          { id: 't1', filePath: path.join(mockCacheRoot, 'LegacyRootSong.mp3') },
          { id: 't2', filePath: path.join(mockCacheRoot, 'Music', 'NewFolderSong.mp3') },
        ]
      };

      const mockCloud = {
        localDirFor: (connId, p) => path.join(tmpDir, 'cache', connId, (p || '').replace(/^\/+/, '')),
        listConnections: () => [
          {
            id: 'gdrive-test',
            name: 'My Google Drive',
            driverType: 'gdrive',
            browsable: true,
            folders: [
              { id: 'lf1', folderId: 'id_vgm', label: 'video game music', virtualName: 'video game music', remotePath: '/video game music' },
              { id: 'lf2', folderId: 'id_music', label: 'Music', virtualName: 'Music', remotePath: '/Music' },
            ]
          }
        ]
      };

      const lf = new LibraryFolders({ mediaLibrary: mockMediaLibrary, cloud: mockCloud, configDir: tmpDir });
      const listed = lf.list();

      assert.strictEqual(listed.length, 2, 'Should surface both linked folders from Data Sources');
      assert.strictEqual(listed[0].label, 'video game music');
      assert.strictEqual(listed[0].path, '/video game music');
      assert.strictEqual(listed[0].trackCount, 1, 'Primary folder should retain legacy root tracks');
      assert.strictEqual(listed[1].label, 'Music');
      assert.strictEqual(listed[1].path, '/Music');
      assert.strictEqual(listed[1].trackCount, 1, 'Second linked folder should count its own tracks');

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('remote-storage batches Google Drive subfolder queries during walk and caches directory listings and path-to-ID mappings', async () => {
      const rs = require(path.join(APP_DIR, '..', 'data-sources', 'lib', 'remote-storage'));
      assert.strictEqual(typeof rs.getCloudMetaCache, 'function');
      assert.strictEqual(typeof rs.invalidateDsListingCache, 'function');

      const originalFetch = global.fetch;
      let apiCallCount = 0;

      global.fetch = async (urlStr) => {
        apiCallCount++;
        const u = new URL(urlStr);
        const q = u.searchParams.get('q') || '';
        if (q.includes("'folder_root_123' in parents")) {
          return {
            ok: true,
            status: 200,
            headers: { get: () => null },
            json: async () => ({
              files: [
                { id: 'sub_a', name: 'Album A', mimeType: 'application/vnd.google-apps.folder', parents: ['folder_root_123'] },
                { id: 'sub_b', name: 'Album B', mimeType: 'application/vnd.google-apps.folder', parents: ['folder_root_123'] },
              ],
            }),
          };
        }
        if (q.includes("'sub_a' in parents") && q.includes("'sub_b' in parents")) {
          // Both Album A and Album B fetched in a SINGLE batched request!
          return {
            ok: true,
            status: 200,
            headers: { get: () => null },
            json: async () => ({
              files: [
                { id: 'song_1', name: 'Track 1.mp3', mimeType: 'audio/mpeg', size: 1000, parents: ['sub_a'] },
                { id: 'song_2', name: 'Track 2.mp3', mimeType: 'audio/mpeg', size: 2000, parents: ['sub_b'] },
              ],
            }),
          };
        }
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: async () => ({ files: [] }),
        };
      };

      try {
        const testDs = {
          id: `gdrive-cache-test-${Date.now()}`,
          name: 'Test GDrive Cache',
          driverType: 'gdrive',
          accessToken: 'ya29.real_looking_oauth_token_for_cache_test_999',
          folders: [{ id: 'folder_root_123', label: 'Music', virtualName: 'Music' }],
        };
        rs.invalidateDsListingCache(testDs);

        // 1st walk: 1 request for root + 1 batched request for BOTH Album A & Album B = 2 API calls total
        const files1 = await rs.walk(testDs, '/', (n) => n.endsWith('.mp3'));
        assert.strictEqual(files1.length, 2);
        assert.strictEqual(apiCallCount, 2, 'Walk across root + 2 subfolders should only make 2 batched API calls');

        // 2nd walk: served 100% from walkListings cache -> 0 new API calls!
        const files2 = await rs.walk(testDs, '/', (n) => n.endsWith('.mp3'));
        assert.strictEqual(files2.length, 2);
        assert.strictEqual(apiCallCount, 2, 'Cached walk should make 0 additional API calls');

        // Browsing into /Album A: already populated in dirListings cache -> 0 new API calls!
        const subDir = await rs.listDir(testDs, '/Album A');
        assert.strictEqual(subDir.entries.length, 1);
        assert.strictEqual(subDir.entries[0].name, 'Track 1.mp3');
        assert.strictEqual(apiCallCount, 2, 'Browsing cached subfolder should make 0 additional API calls');
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  describe('Library browsing: albums, artists, genres, decades, search & stats', () => {
    const idx = require(path.join(APP_DIR, 'lib', 'library-index'));
    const { trackFromMetadata } = require(path.join(APP_DIR, 'lib', 'track-metadata'));

    let seq = 0;
    const t = (over) => ({ id: `trk_fixture_${++seq}`, duration: 200, ...over });
    const fixture = () => [
      t({ title: 'Come Together', artist: 'The Beatles', albumArtist: 'The Beatles', album: 'Abbey Road', year: 1969, genre: 'Rock', trackNumber: 1, filePath: '/m/Beatles/Abbey Road/01.flac' }),
      t({ title: 'Something', artist: 'The Beatles', albumArtist: 'The Beatles', album: 'Abbey Road', year: 1969, genre: 'Rock', trackNumber: 2, filePath: '/m/Beatles/Abbey Road/02.flac' }),
      t({ title: 'Taxman', artist: 'The Beatles', album: 'Revolver', year: 1966, genre: 'Rock; Pop', trackNumber: 1, filePath: '/m/Beatles/Revolver/01.mp3' }),
      // Compilation without album-artist tags, one folder -> one "Various Artists" album
      t({ title: 'Hit 1', artist: 'Artist A', album: 'Summer Hits', year: 2020, genre: 'Pop', filePath: '/m/Comp/Summer Hits/1.mp3' }),
      t({ title: 'Hit 2', artist: 'The Beatles', album: 'Summer Hits', year: 2020, genre: 'Pop', filePath: '/m/Comp/Summer Hits/2.mp3' }),
      // Same album name by two different artists in different folders -> two albums
      t({ title: 'Intro', artist: 'Band X', album: 'Greatest Hits', filePath: '/m/X/Greatest Hits/1.mp3' }),
      t({ title: 'Intro', artist: 'Band Y', album: 'Greatest Hits', filePath: '/m/Y/Greatest Hits/1.mp3' }),
      // Multi-disc album split into CD1/CD2 folders stays one album
      t({ title: 'Disc One Song', artist: 'Pink Floyd', album: 'The Wall', year: 1979, discNumber: 1, trackNumber: 1, composer: 'Roger Waters', filePath: '/m/Floyd/The Wall/CD1/01.mp3' }),
      t({ title: 'Disc Two Song', artist: 'Pink Floyd', album: 'The Wall', year: 1979, discNumber: 2, trackNumber: 1, composer: 'Roger Waters', filePath: '/m/Floyd/The Wall/CD2/01.mp3' }),
    ];

    it('groups tracks into albums using album artist, folder and disc folders', () => {
      const index = idx.buildIndex(fixture());
      const titles = index.albums.map(a => `${a.title} — ${a.artist}`);
      assert.ok(titles.includes('Abbey Road — The Beatles'));
      assert.ok(titles.includes('Summer Hits — Various Artists'), 'untagged compilation in one folder is one album');
      assert.strictEqual(index.albums.filter(a => a.title === 'Greatest Hits').length, 2, 'same title by different artists stays separate');
      const wall = index.albums.find(a => a.title === 'The Wall');
      assert.strictEqual(wall.tracks.length, 2, 'CD1/CD2 folders merge into one album');
      assert.strictEqual(wall.discCount, 2);
      assert.deepStrictEqual(wall.tracks.map(x => x.title), ['Disc One Song', 'Disc Two Song'], 'ordered by disc then track');
    });

    it('builds artists with their own albums and "appears on" compilations', () => {
      const index = idx.buildIndex(fixture());
      const beatles = index.artistByKey.get(idx.fold('The Beatles'));
      assert.deepStrictEqual(beatles.albums.map(a => a.title), ['Revolver', 'Abbey Road'], 'albums ordered oldest first');
      assert.deepStrictEqual(beatles.appearsOn.map(a => a.title), ['Summer Hits']);
      assert.strictEqual(beatles.tracks.length, 4);
      assert.ok(!index.artistByKey.has(idx.fold('Various Artists')), 'Various Artists is not listed as an artist');
    });

    it('splits multi-value genres and groups decades and composers', () => {
      const index = idx.buildIndex(fixture());
      assert.deepStrictEqual(index.genres.map(g => g.name), ['Pop', 'Rock']);
      assert.strictEqual(index.genreByKey.get('pop').tracks.length, 3, 'Revolver "Rock; Pop" counts toward Pop');
      assert.deepStrictEqual(index.decades.map(d => d.name), ['2020s', '1970s', '1960s'], 'newest decade first');
      assert.strictEqual(index.composerByKey.get(idx.fold('Roger Waters')).tracks.length, 2);
    });

    it('search matches every term across title, artist, album and genre', () => {
      const index = idx.buildIndex(fixture());
      assert.deepStrictEqual(idx.searchIndex(index, 'beatles some').tracks.map(x => x.title), ['Something']);
      assert.ok(idx.searchIndex(index, 'abbey').albums.some(a => a.title === 'Abbey Road'));
      assert.ok(idx.searchIndex(index, 'BEATLES').artists.some(a => a.name === 'The Beatles'), 'case-insensitive');
      assert.strictEqual(idx.searchIndex(index, '   ').tracks.length, 0);
    });

    it('sorts tracks by play count and builds smart collections from stats', () => {
      const tracks = fixture();
      const stats = {
        [tracks[1].id]: { plays: 9, lastPlayed: '2026-10-20T10:00:00Z', loved: true, lovedAt: '2026-10-01T00:00:00Z' },
        [tracks[2].id]: { plays: 3, lastPlayed: '2026-10-21T10:00:00Z' },
      };
      assert.strictEqual(idx.sortTracks(tracks, 'plays', 'desc', stats)[0].title, 'Something');
      assert.deepStrictEqual(idx.mostPlayedTracks(tracks, stats).map(x => x.title), ['Something', 'Taxman']);
      assert.deepStrictEqual(idx.recentlyPlayedTracks(tracks, stats).map(x => x.title), ['Taxman', 'Something']);
      assert.deepStrictEqual(idx.lovedTracks(tracks, stats).map(x => x.title), ['Something']);
      assert.strictEqual(idx.sortTracks(tracks, 'artist', 'asc')[0].artist, 'Artist A');
      assert.strictEqual(idx.indexLetter('The Beatles'), 'B', 'leading "The" is ignored for A–Z');
      assert.strictEqual(idx.indexLetter('2Pac'), '#');
    });

    it('mergeTracks keeps the original date added across rescans', () => {
      const dir = fs.mkdtempSync('/tmp/robos-lib-merge-');
      const lib = new MediaLibrary({ configDir: dir });
      lib.mergeTracks([{ id: 'a', filePath: '/x/a.mp3', title: 'A', addedAt: '2020-01-01T00:00:00.000Z' }]);
      lib.mergeTracks([{ id: 'a', filePath: '/x/a.mp3', title: 'A (retagged)' }, { id: 'b', filePath: '/x/b.mp3', title: 'B' }]);
      const a = lib.tracks.find(x => x.filePath === '/x/a.mp3');
      assert.strictEqual(a.title, 'A (retagged)');
      assert.strictEqual(a.addedAt, '2020-01-01T00:00:00.000Z');
      assert.ok(lib.tracks.find(x => x.filePath === '/x/b.mp3').addedAt, 'new tracks get a date added');
      fs.rmSync(dir, { recursive: true, force: true });
    });

    it('records plays and loved tracks and persists them to audio-track-stats.json', () => {
      const dir = fs.mkdtempSync('/tmp/robos-lib-stats-');
      const lib = new MediaLibrary({ configDir: dir });
      lib.recordPlay('trk_1');
      lib.recordPlay('trk_1');
      lib.setLoved(['trk_1', 'trk_2'], true);
      lib.setLoved(['trk_2'], false);
      const reloaded = new MediaLibrary({ configDir: dir });
      assert.strictEqual(reloaded.getStats().trk_1.plays, 2);
      assert.ok(reloaded.getStats().trk_1.lastPlayed);
      assert.strictEqual(reloaded.getStats().trk_1.loved, true);
      assert.strictEqual(reloaded.getStats().trk_2.loved, false);
      fs.rmSync(dir, { recursive: true, force: true });
    });

    it('persists cover art to disk so it survives a restart', () => {
      const dir = fs.mkdtempSync('/tmp/robos-lib-art-');
      const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
      new MediaLibrary({ configDir: dir }).storeArt('art_0123456789abcdef', png, 'image/png');
      const art = new MediaLibrary({ configDir: dir }).getArt('art_0123456789abcdef');
      assert.ok(art, 'art reloads from the art cache directory');
      assert.strictEqual(art.format, 'image/png');
      assert.ok(art.buffer.equals(png));
      assert.strictEqual(new MediaLibrary({ configDir: dir }).getArt('../../etc/passwd'), null, 'rejects path-like ids');
      fs.rmSync(dir, { recursive: true, force: true });
    });

    it('uses folder cover images and shares one art id per album', () => {
      const dir = fs.mkdtempSync('/tmp/robos-lib-cover-');
      fs.writeFileSync(path.join(dir, 'Cover.JPG'), Buffer.from('fake jpeg bytes'));
      const meta = { common: { title: 'Song', album: 'Album', artist: 'Artist', albumartist: 'Artist', disk: { no: 2, of: 2 }, composer: ['Someone'] }, format: { duration: 100, codec: 'FLAC', lossless: true } };
      const one = trackFromMetadata(path.join(dir, '01.flac'), meta, { selectCover: () => null });
      const two = trackFromMetadata(path.join(dir, '02.flac'), meta, { selectCover: () => null });
      assert.ok(one.art, 'cover.jpg next to the tracks is used when no embedded art exists');
      assert.strictEqual(one.track.artId, two.track.artId, 'content-addressed art id is shared by the album');
      assert.strictEqual(one.track.albumArtist, 'Artist');
      assert.strictEqual(one.track.discNumber, 2);
      assert.strictEqual(one.track.composer, 'Someone');
      assert.strictEqual(one.track.lossless, true);
      fs.rmSync(dir, { recursive: true, force: true });
    });

    it('preload exposes library stats, art and file manager methods', () => {
      const content = fs.readFileSync(path.join(APP_DIR, 'preload.js'), 'utf8');
      for (const fn of ['getArtBase:', 'getTrackStats:', 'recordPlay:', 'setLoved:', 'showInFolder:']) {
        assert.ok(content.includes(fn), `preload should expose ${fn}`);
      }
    });

    it('bundle contains the library browser and the always-visible Now Playing panel', () => {
      const content = fs.readFileSync(path.join(APP_DIR, 'renderer', 'bundle.js'), 'utf8');
      for (const marker of ['lib-nav-', 'np-dock', 'btn-toggle-queue-panel', 'queue-list', 'library-search', 'btn-shuffle-library', 'context-menu']) {
        assert.ok(content.includes(marker), `bundle should contain ${marker}`);
      }
    });
  });

  describe('100,000-track libraries', () => {
    const idx = require(path.join(APP_DIR, 'lib', 'library-index'));
    // ~9k albums of 11 tracks by ~5.7k artists: the shape of a real 100k collection.
    const bigTrack = (i) => {
      const album = Math.floor(i / 11);
      const artist = Math.floor(album / 1.6);
      return {
        id: `trk_big_${i}`,
        filePath: `/music/Artist ${artist}/Album ${album}/${String((i % 11) + 1).padStart(2, '0')} Song ${i}.flac`,
        title: `Song ${i}`, artist: `Artist ${artist}`, albumArtist: `Artist ${artist}`, album: `Album ${album}`,
        year: 1960 + (album % 60), genre: ['Rock', 'Jazz', 'Pop', 'Hip-Hop; Rap'][album % 4], trackNumber: (i % 11) + 1, duration: 200,
      };
    };
    const timed = (fn) => { const t0 = Date.now(); const out = fn(); return [out, Date.now() - t0]; };

    it('merges scan batches in O(batch) time and keeps the path index correct', () => {
      const dir = fs.mkdtempSync('/tmp/robos-lib-100k-');
      const lib = new MediaLibrary({ configDir: dir });
      lib.mergeTracks(Array.from({ length: 50000 }, (_, i) => bigTrack(i)));
      const [, ms] = timed(() => {
        for (let b = 0; b < 200; b++) {
          lib.mergeTracks(Array.from({ length: 250 }, (_, k) => bigTrack(50000 + b * 250 + k)), { deferSave: true });
        }
      });
      assert.strictEqual(lib.tracks.length, 100000);
      assert.ok(ms < 3000, `200 batches into a growing 100k library took ${ms} ms`);

      // Re-scanning an existing file replaces it in place and keeps its date added.
      const before = lib.tracks.find(t => t.filePath === bigTrack(7).filePath);
      lib.mergeTracks([{ ...bigTrack(7), title: 'Retagged' }], { deferSave: true });
      assert.strictEqual(lib.tracks.length, 100000);
      const after = lib.tracks.find(t => t.filePath === bigTrack(7).filePath);
      assert.strictEqual(after.title, 'Retagged');
      assert.strictEqual(after.addedAt, before.addedAt);

      // Callers that reassign `tracks` (folder removal) must not leave a stale index.
      lib.tracks = lib.tracks.filter(t => !t.filePath.includes('/Artist 0/'));
      const removed = 100000 - lib.tracks.length;
      assert.ok(removed > 0);
      lib.mergeTracks([bigTrack(0)], { deferSave: true });
      assert.strictEqual(lib.tracks.length, 100000 - removed + 1);
      assert.strictEqual(lib.tracks.filter(t => t.filePath === bigTrack(0).filePath).length, 1);
      fs.rmSync(dir, { recursive: true, force: true });
    });

    it('batches cache writes during scans and flushes them on demand', () => {
      const dir = fs.mkdtempSync('/tmp/robos-lib-flush-');
      const lib = new MediaLibrary({ configDir: dir });
      const cache = path.join(dir, 'audio-library.json');
      lib.mergeTracks([bigTrack(1)], { deferSave: true });
      assert.ok(!fs.existsSync(cache), 'deferred merge does not write immediately');
      lib.flush();
      assert.strictEqual(JSON.parse(fs.readFileSync(cache, 'utf8')).tracks.length, 1);
      assert.ok(!fs.readFileSync(cache, 'utf8').includes('\n  '), 'cache is written as compact JSON');
      fs.rmSync(dir, { recursive: true, force: true });
    });

    it('indexes, sorts and searches 100k tracks fast enough for interactive use', () => {
      const tracks = Array.from({ length: 100000 }, (_, i) => bigTrack(i));
      const [index, buildMs] = timed(() => idx.buildIndex(tracks));
      assert.strictEqual(index.tracks.length, 100000);
      assert.strictEqual(index.albums.length, Math.ceil(100000 / 11));
      assert.ok(buildMs < 5000, `buildIndex took ${buildMs} ms`);
      const [sorted, sortMs] = timed(() => idx.sortTracks(tracks, 'artist'));
      assert.strictEqual(sorted[0].artist, 'Artist 0');
      assert.ok(sortMs < 3000, `sortTracks took ${sortMs} ms`);
      const [res, searchMs] = timed(() => idx.searchIndex(index, 'artist 4242'));
      assert.ok(res.artists.some(a => a.name === 'Artist 4242'));
      assert.ok(searchMs < 3000, `searchIndex took ${searchMs} ms`);
      // Natural number order without a locale collator: "Album 2" before "Album 10".
      assert.deepStrictEqual(idx.sortAlbums(index.albums.slice(0, 12), 'title').slice(0, 3).map(a => a.title), ['Album 0', 'Album 1', 'Album 2']);
    });

    it('scan worker groups files into a few large batches instead of one per handful', async () => {
      const dir = fs.mkdtempSync('/tmp/robos-scan-batches-');
      for (let i = 0; i < 600; i++) fs.writeFileSync(path.join(dir, `track-${i}.mp3`), 'ID3\x03\x00\x00\x00\x00\x00\x00not really audio');
      const lib = new MediaLibrary({ configDir: dir });
      let batches = 0;
      let progressEvents = 0;
      const done = await new Promise((resolve, reject) => {
        lib.scanFoldersInBackground(dir, {
          onProgress: () => { progressEvents++; },
          onBatch: () => { batches++; },
          onDone: resolve,
          onError: reject,
        });
      });
      assert.strictEqual(done.totalFound, 600);
      assert.strictEqual(done.tracks.length, 600);
      assert.strictEqual(lib.tracks.length, 600);
      assert.ok(batches >= 1 && batches < 60, `600 files arrived in ${batches} batches`);
      assert.ok(progressEvents < 600, `progress is throttled (${progressEvents} events)`);
      assert.ok(fs.existsSync(path.join(dir, 'audio-library.json')), 'library is saved when the scan finishes');
      fs.rmSync(dir, { recursive: true, force: true });
    });
  });

  describe('AI playlists & Virtual DJ (RobOS agent)', () => {
    const ai = require(path.join(APP_DIR, 'lib', 'ai-playlist'));
    const lib = (n) => Array.from({ length: n }, (_, k) => ({
      id: `trk_ai_${k}`, title: `Song ${k}`, artist: `Artist ${k % 40}`, album: `Album ${k % 90}`,
      year: 1970 + (k % 50), genre: ['Rock', 'Jazz', 'Pop', 'Ambient'][k % 4], duration: 200,
    }));
    // A scripted stand-in for robos-lib/ai-agent ask().
    const agent = (replies) => {
      const prompts = [];
      const ask = async (prompt) => {
        prompts.push(prompt);
        const reply = replies.shift();
        return typeof reply === 'string' ? { ok: true, text: reply } : reply;
      };
      return { ask, prompts };
    };

    it('builds a small-library playlist in one agent call, in the agent\'s order', async () => {
      const { ask, prompts } = agent([JSON.stringify({ name: 'Night Shift', description: 'Moody.', picks: [3, 1, 3, 999, 2] })]);
      const res = await ai.generateAiPlaylist({ tracks: lib(30), request: 'moody night music', count: 5 }, { ask });
      assert.strictEqual(res.ok, true);
      assert.strictEqual(prompts.length, 1, 'libraries under the single-call limit skip the criteria step');
      assert.ok(prompts[0].includes('moody night music'));
      assert.deepStrictEqual(res.playlist.tracks.map(t => t.id), ['trk_ai_2', 'trk_ai_0', 'trk_ai_1'], 'duplicates and unknown numbers are dropped');
      assert.strictEqual(res.playlist.name, 'Night Shift');
      assert.strictEqual(res.playlist.ai.request, 'moody night music');
      assert.strictEqual(res.playlist.dj, undefined);
    });

    it('large libraries: agent criteria, local shortlist, then the final pick', async () => {
      const criteria = 'Here you go:\n```json\n{"name":"Jazz Hour","genres":["Jazz"],"decades":["1990s"],"artists":[],"keywords":[],"excludeArtists":["Artist 1"]}\n```';
      const { ask, prompts } = agent([criteria, '{"name":"Jazz Hour","description":"x","picks":[1,2,3]}']);
      const progress = [];
      const res = await ai.generateAiPlaylist({ tracks: lib(5000), request: 'an hour of jazz', count: 3 }, { ask, onProgress: p => progress.push(p.step) });
      assert.strictEqual(res.ok, true);
      assert.strictEqual(prompts.length, 2);
      assert.ok(prompts[0].includes('Genres in the library'), 'first call sees a library summary, not every song');
      const shortlist = prompts[1].split('\n').filter(l => /^\d+ \| /.test(l));
      assert.ok(shortlist.length <= ai.CANDIDATE_LIMIT);
      assert.ok(shortlist.slice(0, 50).every(l => l.includes('Jazz')), 'best matches come first');
      assert.ok(!shortlist.some(l => l.split(' | ')[1] === 'Artist 1'), 'excluded artists are filtered out');
      assert.ok(prompts[1].length < 120 * 1024, 'prompt stays under the CLI argument limit');
      assert.deepStrictEqual(progress, ['criteria', 'shortlist', 'done']);
    });

    it('adds the Virtual DJ script: intro plus a line before each later song', async () => {
      const reply = JSON.stringify({
        name: 'Late Night', description: 'd', picks: [2, 1],
        dj: { intro: 'Good evening.', lines: [{ pick: 1, text: 'Here is Song 0.' }, { pick: 7, text: 'not in the playlist' }] },
      });
      const { ask, prompts } = agent([reply]);
      const res = await ai.generateAiPlaylist(
        { tracks: lib(10), request: 'late night', count: 2, dj: { persona: 'smooth jazz host', voice: 'kokoro:am_michael', frequency: 'alternate' } },
        { ask }
      );
      assert.ok(prompts[0].includes('smooth jazz host'));
      assert.deepStrictEqual(res.playlist.dj, {
        persona: 'smooth jazz host', voice: 'kokoro:am_michael', frequency: 'alternate',
        intro: 'Good evening.', lines: { trk_ai_0: 'Here is Song 0.' },
      });
    });

    it('reads answers through robos-lib ai-json (its { ok, data } result and repairs)', async () => {
      const { parseAIJson } = require(path.resolve(APP_DIR, '..', 'robos-lib', 'ai-json'));
      const fenced = '```json\n{"name":"Fenced","description":"d","picks":[2,1]}\n```';
      const res = await ai.generateAiPlaylist({ tracks: lib(5), request: 'x', count: 2 }, { ask: agent([fenced]).ask, parseJson: parseAIJson });
      assert.strictEqual(res.ok, true);
      assert.deepStrictEqual(res.playlist.tracks.map(t => t.id), ['trk_ai_1', 'trk_ai_0']);
      const lines = await ai.generateDjLines({ persona: 'p', upcoming: lib(2) }, { ask: agent(['{"lines":[{"n":1,"text":"Hi"}]}']).ask, parseJson: parseAIJson });
      assert.deepStrictEqual(lines.lines, { trk_ai_0: 'Hi' });
    });

    it('reports agent failures and unusable answers instead of throwing', async () => {
      let res = await ai.generateAiPlaylist({ tracks: lib(5), request: 'x' }, agent([{ ok: false, error: 'claude: not logged in' }]));
      assert.deepStrictEqual([res.ok, res.error], [false, 'claude: not logged in']);
      res = await ai.generateAiPlaylist({ tracks: lib(5), request: 'x' }, agent(['I am not sure what you mean.']));
      assert.strictEqual(res.ok, false);
      assert.match(res.error, /JSON/);
      res = await ai.generateAiPlaylist({ tracks: lib(5), request: 'x' }, agent(['{"picks":[]}']));
      assert.strictEqual(res.ok, false);
      res = await ai.generateAiPlaylist({ tracks: [], request: 'x' }, agent([]));
      assert.match(res.error, /library is empty/);
      res = await ai.generateAiPlaylist({ tracks: lib(5), request: '   ' }, agent([]));
      assert.strictEqual(res.ok, false);
    });

    it('writes DJ lines for any upcoming songs, keyed by track id', async () => {
      const { ask, prompts } = agent(['{"lines":[{"n":2,"text":"Next up, Song 1."},{"n":9,"text":"ignored"}]}']);
      const res = await ai.generateDjLines({ persona: 'hype radio host', upcoming: lib(3) }, { ask });
      assert.deepStrictEqual(res, { ok: true, lines: { trk_ai_1: 'Next up, Song 1.' } });
      assert.ok(prompts[0].includes('hype radio host') && prompts[0].includes('Song 2'));
      assert.deepStrictEqual(await ai.generateDjLines({ persona: '', upcoming: lib(3) }, { ask }), { ok: true, lines: {} });
    });

    it('playlists keep their AI request and DJ script when saved', () => {
      const dir = fs.mkdtempSync('/tmp/robos-ai-pl-');
      const lib0 = new MediaLibrary({ configDir: dir });
      const pl = lib0.createPlaylist({ name: 'AI', tracks: [], ai: { request: 'r' }, dj: { persona: 'p', lines: {} } });
      const again = new MediaLibrary({ configDir: dir }).getPlaylist(pl.id);
      assert.deepStrictEqual([again.ai, again.dj], [{ request: 'r' }, { persona: 'p', lines: {} }]);
      fs.rmSync(dir, { recursive: true, force: true });
    });

    it('wires the shared agent selector, provider catalog, quick-ask and voice into the app', () => {
      const preload = fs.readFileSync(path.join(APP_DIR, 'preload.js'), 'utf8');
      for (const fn of ['aiPlaylistGenerate:', 'djLines:', 'djVoices:', 'djSynthesize:', "'robosProviders'", "'robosQuickAsk'"]) {
        assert.ok(preload.includes(fn), `preload should expose ${fn}`);
      }
      assert.ok(!preload.includes('castTTS:'), 'the Virtual DJ does not bring back the old announcer API');
      const main = fs.readFileSync(path.join(APP_DIR, 'main.js'), 'utf8');
      for (const mod of ["'robos-agent-client/providers'", "'robos-agent-client/one-shot'", "'robos-lib/ai-json'", "'robos-lib/quick-ask'", "'voice-prompt/lib/tts-engine'"]) {
        assert.ok(main.includes(mod), `main should reuse ${mod}`);
      }
      assert.ok(!main.includes("'robos-lib/ai-agent'"), 'requests use the agent picked in the selector, not ai-agent\'s fixed default');
      const html = fs.readFileSync(path.join(APP_DIR, 'renderer', 'index.html'), 'utf8');
      assert.ok(html.includes('robos-ui/robos-ui.js'), 'renderer loads the shared robos-ui components');
      assert.ok(html.includes('robos-lib/agent-selector.js'), 'renderer loads the shared <robos-agent-selector>');
      const bundle = fs.readFileSync(path.join(APP_DIR, 'renderer', 'bundle.js'), 'utf8');
      for (const marker of ['robos-ai-textarea', 'robos-agent-selector', 'btn-ai-playlist', 'btn-dj-toggle', 'np-dj-banner']) {
        assert.ok(bundle.includes(marker), `bundle should contain ${marker}`);
      }
    });
  });
});

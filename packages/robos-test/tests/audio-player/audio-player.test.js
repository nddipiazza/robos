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
  });
});


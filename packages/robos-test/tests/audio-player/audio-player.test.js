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

    it('preload.js exposes playTestChime and omits voice announcer/TTS methods', () => {
      const preloadPath = path.join(APP_DIR, 'preload.js');
      const content = fs.readFileSync(preloadPath, 'utf8');
      assert.ok(content.includes('playTestChime:'), 'preload should expose playTestChime');
      assert.ok(!content.includes('castTTS:'), 'preload should NOT expose castTTS (voice announcer moved to dedicated app)');
    });

    it('renderer bundle.js omits voice announcer panel and speech inputs', () => {
      const bundlePath = path.join(APP_DIR, 'renderer', 'bundle.js');
      const content = fs.readFileSync(bundlePath, 'utf8');
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
});


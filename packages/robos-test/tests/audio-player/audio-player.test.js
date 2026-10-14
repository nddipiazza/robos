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

    after(() => {
      if (service && service.streamServer) {
        service.streamServer.close();
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
        http.get(streamUrl, (response) => {
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
        http.get(invalidUrl, (response) => {
          resolve(response.statusCode);
        }).on('error', reject);
      });
      assert.strictEqual(res, 404);
    });
  });
});

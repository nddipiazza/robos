'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const http = require('http');

const APP_DIR = path.resolve(__dirname, '../../../audio-player');
const { CastService } = require(path.join(APP_DIR, 'lib', 'cast-service'));

describe('RobOS Audio Player Tests', () => {

  describe('Package Structure & Registrations', () => {
    it('package.json exists and is valid', () => {
      const pkgPath = path.join(APP_DIR, 'package.json');
      assert.ok(fs.existsSync(pkgPath), 'package.json should exist');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      assert.strictEqual(pkg.name, 'robos-audio-player');
      assert.ok(pkg.dependencies['castv2-client'], 'castv2-client dependency should be present');
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

    it('open-source Howler.js engine is bundled', () => {
      const howlerPath = path.join(APP_DIR, 'renderer', 'howler.min.js');
      assert.ok(fs.existsSync(howlerPath), 'howler.min.js should be bundled');
      const stat = fs.statSync(howlerPath);
      assert.ok(stat.size > 20000, 'howler.min.js should be non-empty (>20KB)');
    });

    it('renderer HTML contains all essential player hooks', () => {
      const htmlPath = path.join(APP_DIR, 'renderer', 'index.html');
      assert.ok(fs.existsSync(htmlPath), 'index.html should exist');
      const html = fs.readFileSync(htmlPath, 'utf8');
      assert.ok(html.includes('id="visualizer-canvas"'), 'Should have visualizer canvas');
      assert.ok(html.includes('id="output-select"'), 'Should have output selector');
      assert.ok(html.includes('id="btn-play-pause"'), 'Should have play/pause button');
      assert.ok(html.includes('id="btn-broadcast-tts"'), 'Should have TTS broadcast button');
      assert.ok(html.includes('id="dropzone"'), 'Should have drag-and-drop dropzone');
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
      // Allow slight async spinup
      await new Promise(r => setTimeout(r, 100));
      assert.ok(service.streamPort > 0, `Stream port should be allocated, got ${service.streamPort}`);
    });

    it('registers an in-memory audio buffer and serves it over HTTP', async () => {
      const testBuffer = Buffer.from('FAKE_MP3_AUDIO_HEADER_AND_BYTES_123456');
      const streamUrl = service.registerBuffer(testBuffer, 'audio/mp3');
      assert.ok(streamUrl.includes(`:${service.streamPort}/media/`), `Stream URL formatted properly: ${streamUrl}`);

      // Fetch the registered buffer
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

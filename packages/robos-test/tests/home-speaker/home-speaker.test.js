'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const APP_DIR = path.resolve(__dirname, '../../../home-speaker');
const CLI_PATH = path.resolve(__dirname, '../../../robos-cli/robos-speaker');
const { HomeSpeakerService } = require(path.join(APP_DIR, 'lib', 'speaker-service'));
const { listSounds, getSound, generateIntercomChime } = require(path.join(APP_DIR, 'lib', 'soundboard'));

describe('RobOS Home Speaker Tests', () => {

  describe('Package Structure & Registrations', () => {
    it('package.json exists and has correct dependencies', () => {
      const pkgPath = path.join(APP_DIR, 'package.json');
      assert.ok(fs.existsSync(pkgPath), 'package.json should exist');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      assert.strictEqual(pkg.name, 'robos-home-speaker');
      assert.ok(pkg.dependencies['castv2-client'], 'castv2-client dependency should be present');
    });

    it('.desktop file exists and conforms to RobOS standards', () => {
      const desktopPath = path.join(APP_DIR, 'home-speaker.desktop');
      assert.ok(fs.existsSync(desktopPath), 'home-speaker.desktop should exist');
      const content = fs.readFileSync(desktopPath, 'utf8');
      assert.ok(content.includes('X-RobOS-App=true'), 'Should have X-RobOS-App=true');
      assert.ok(content.includes('X-RobOS-Category=Tools'), 'Should have X-RobOS-Category=Tools');
      assert.ok(content.includes('StartupWMClass=robos-home-speaker'), 'Should have StartupWMClass');
    });

    it('icon.svg exists and is valid 48x48 SVG with cyan palette', () => {
      const iconPath = path.join(APP_DIR, 'icon.svg');
      assert.ok(fs.existsSync(iconPath), 'icon.svg should exist');
      const content = fs.readFileSync(iconPath, 'utf8');
      assert.ok(content.includes('width="48"'), 'Width should be 48');
      assert.ok(content.includes('height="48"'), 'Height should be 48');
      assert.ok(content.includes('#00bcd4'), 'Stroke color should use RobOS cyan (#00bcd4)');
    });

    it('snapshot-cli port registry includes home-speaker on port 19200', () => {
      const snapPath = path.resolve(__dirname, '../../../robos-lib/snapshot-cli.js');
      const content = fs.readFileSync(snapPath, 'utf8');
      assert.ok(content.includes("'home-speaker':      19200"), 'Port 19200 should be registered in snapshot-cli.js');
    });

    it('robos-icons includes home-speaker in BUILTIN_APPS', () => {
      const iconsPath = path.resolve(__dirname, '../../../robos-icons/index.js');
      const content = fs.readFileSync(iconsPath, 'utf8');
      assert.ok(content.includes("appId: 'home-speaker'"), 'appId home-speaker should be registered in robos-icons');
    });

    it('AGENTS.md lists RobOS Home Speaker in Supporting Apps', () => {
      const agentsMdPath = path.resolve(__dirname, '../../../../AGENTS.md');
      const content = fs.readFileSync(agentsMdPath, 'utf8');
      assert.ok(content.includes('**RobOS Home Speaker**'), 'AGENTS.md should list RobOS Home Speaker');
    });

    it('documentation page exists in docs/_apps/home-speaker.md', () => {
      const docPath = path.resolve(__dirname, '../../../../docs/_apps/home-speaker.md');
      assert.ok(fs.existsSync(docPath), 'docs/_apps/home-speaker.md should exist');
      const content = fs.readFileSync(docPath, 'utf8');
      assert.ok(content.includes('package: home-speaker'), 'Documentation should specify package: home-speaker');
    });

    it('.robos/packages.yaml lists home-speaker', () => {
      const pkgYaml = path.resolve(__dirname, '../../../../.robos/packages.yaml');
      const content = fs.readFileSync(pkgYaml, 'utf8');
      assert.ok(content.includes('urn:robos:desktop-app:home-speaker'), 'packages.yaml should include home-speaker');
    });

    it('.robos/kgraphs/applications/package.jsonld lists home-speaker', () => {
      const kgraphPath = path.resolve(__dirname, '../../../../.robos/kgraphs/applications/package.jsonld');
      const content = fs.readFileSync(kgraphPath, 'utf8');
      assert.ok(content.includes('urn:robos:desktop-app:home-speaker'), 'applications package.jsonld should include home-speaker');
    });
  });

  describe('Main & Preload Modules', () => {
    it('main.js registers all required IPC handlers and QEMU flags', () => {
      const mainPath = path.join(APP_DIR, 'main.js');
      assert.ok(fs.existsSync(mainPath), 'main.js should exist');
      const content = fs.readFileSync(mainPath, 'utf8');
      assert.ok(content.includes('no-sandbox'), 'Should append no-sandbox flag');
      assert.ok(content.includes('disable-gpu'), 'Should append disable-gpu flag');
      assert.ok(content.includes('speakers:scan'), 'Should register speakers:scan');
      assert.ok(content.includes('speakers:castTTS'), 'Should register speakers:castTTS');
      assert.ok(content.includes('speakers:castVoiceRecording'), 'Should register speakers:castVoiceRecording');
      assert.ok(content.includes('speakers:playSound'), 'Should register speakers:playSound');
      assert.ok(content.includes('speakers:playAmbient'), 'Should register speakers:playAmbient');
      assert.ok(content.includes('dialog:openAudioFile'), 'Should register dialog:openAudioFile');
    });

    it('preload.js exposes robosSpeaker contextBridge APIs', () => {
      const preloadPath = path.join(APP_DIR, 'preload.js');
      assert.ok(fs.existsSync(preloadPath), 'preload.js should exist');
      const content = fs.readFileSync(preloadPath, 'utf8');
      assert.ok(content.includes('scanSpeakers:'), 'preload should expose scanSpeakers');
      assert.ok(content.includes('castTTS:'), 'preload should expose castTTS');
      assert.ok(content.includes('castVoiceRecording:'), 'preload should expose castVoiceRecording');
      assert.ok(content.includes('playSound:'), 'preload should expose playSound');
      assert.ok(content.includes('playAmbient:'), 'preload should expose playAmbient');
      assert.ok(content.includes('openAudioFileDialog:'), 'preload should expose openAudioFileDialog');
    });
  });

  describe('Soundboard Library & Procedural Audio', () => {
    it('listSounds returns complete sound effects catalog', () => {
      const sounds = listSounds();
      assert.ok(Array.isArray(sounds), 'listSounds should return array');
      assert.ok(sounds.length >= 5, 'Should have at least 5 sounds');
      const soundIds = sounds.map(s => s.id);
      assert.ok(soundIds.includes('chime'), 'Should include intercom chime');
      assert.ok(soundIds.includes('ping'), 'Should include attention ping');
      assert.ok(soundIds.includes('fanfare'), 'Should include victory fanfare');
      assert.ok(soundIds.includes('siren'), 'Should include alert siren');
      assert.ok(soundIds.includes('witch_laugh'), 'Should include witch laugh track');
    });

    it('witch_laugh sound references valid custom audio asset file', () => {
      const sound = getSound('witch_laugh');
      assert.ok(sound, 'witch_laugh sound should exist');
      assert.ok(sound.filePath, 'Should have a filePath');
      assert.ok(fs.existsSync(sound.filePath), `File should exist at ${sound.filePath}`);
      const stat = fs.statSync(sound.filePath);
      assert.ok(stat.size > 100000, `Audio file should be non-empty (>100KB), got ${stat.size}`);
    });

    it('generateIntercomChime produces valid 16-bit PCM WAV buffer with headers', () => {
      const buffer = generateIntercomChime();
      assert.ok(Buffer.isBuffer(buffer), 'Should return Buffer');
      assert.strictEqual(buffer.toString('ascii', 0, 4), 'RIFF');
      assert.strictEqual(buffer.toString('ascii', 8, 12), 'WAVE');
      assert.strictEqual(buffer.toString('ascii', 12, 16), 'fmt ');
      assert.strictEqual(buffer.toString('ascii', 36, 40), 'data');
      assert.ok(buffer.length > 44, 'Buffer should contain audio sample data');
    });
  });

  describe('Speaker Service Logic', () => {
    it('HomeSpeakerService initializes with default known speakers and audio stream server', () => {
      const service = new HomeSpeakerService();
      assert.ok(service.castService, 'Should have castService');
      const speakers = service.getSpeakers();
      assert.ok(Array.isArray(speakers), 'getSpeakers should return array');
      assert.ok(speakers.length > 0, 'Should have initial seeded or cached speakers');
      const kitchen = speakers.find(s => s.name.toLowerCase().includes('kitchen'));
      assert.ok(kitchen, 'Should include Kitchen speaker');
      assert.strictEqual(kitchen.ip, '192.168.1.10');
    });

    it('_resolveTargetIps handles single IP, speaker name, and all', () => {
      const service = new HomeSpeakerService();
      assert.deepStrictEqual(service._resolveTargetIps('192.168.1.10'), ['192.168.1.10']);
      const kitchenRes = service._resolveTargetIps('Kitchen speaker');
      assert.ok(kitchenRes.includes('192.168.1.10'));
      const allRes = service._resolveTargetIps('all');
      assert.ok(allRes.length >= 2, 'all should resolve to multiple speaker IPs');
    });
  });

  describe('CLI Utility (robos-speaker)', () => {
    it('CLI script exists, is executable, and displays help output', () => {
      assert.ok(fs.existsSync(CLI_PATH), 'CLI script should exist');
      const output = execSync(`${CLI_PATH} help`, { encoding: 'utf8' });
      assert.ok(output.includes('RobOS Smart Speaker CLI'), 'Help output should have header');
      assert.ok(output.includes('speak'), 'Should list speak command');
      assert.ok(output.includes('play'), 'Should list play command');
      assert.ok(output.includes('sound'), 'Should list sound command');
      assert.ok(output.includes('ambient'), 'Should list ambient command');
      assert.ok(output.includes('volume'), 'Should list volume command');
      assert.ok(output.includes('stop'), 'Should list stop command');
      assert.ok(output.includes('music'), 'Should list music command');
      assert.ok(output.includes('schedule'), 'Should list schedule command');
    });

    it('CLI music list command outputs RobOS Media Player tracks', () => {
      const output = execSync(`${CLI_PATH} music list`, { encoding: 'utf8' });
      assert.ok(output.includes('RobOS Media Player Library'), 'Should output library header');
      assert.ok(output.includes('Death') || output.includes('Overactive'), 'Should list tracks from audio-library.json');
    });

    it('CLI schedule add and list commands work cleanly', () => {
      const addOut = execSync(`${CLI_PATH} schedule add --name "Test Automated Alert" --time "10:15" --sound ping --speaker "Kitchen speaker"`, { encoding: 'utf8' });
      assert.ok(addOut.includes('Schedule created successfully'), 'Should confirm creation');
      const listOut = execSync(`${CLI_PATH} schedule list`, { encoding: 'utf8' });
      assert.ok(listOut.includes('Test Automated Alert'), 'Should include created schedule');
      // Extract ID and remove it
      const match = addOut.match(/ID:\s+(sch_[a-z0-9_]+)/);
      if (match) {
        execSync(`${CLI_PATH} schedule remove ${match[1]}`);
      }
    });
  });

  describe('RobOS Media Player Music Library Integration', () => {
    it('MediaLibraryClient loads tracks from ~/.config/robos/audio-library.json', () => {
      const { MediaLibraryClient } = require(path.join(APP_DIR, 'lib', 'media-library-client'));
      const client = new MediaLibraryClient();
      const tracks = client.getTracks();
      assert.ok(Array.isArray(tracks), 'Should return tracks array');
      assert.ok(tracks.length >= 1, 'Should load existing library tracks');
      assert.ok(tracks[0].title, 'Track should have a title');
      assert.ok(tracks[0].filePath, 'Track should have a filePath');
    });

    it('MediaLibraryClient searches tracks by query string', () => {
      const { MediaLibraryClient } = require(path.join(APP_DIR, 'lib', 'media-library-client'));
      const client = new MediaLibraryClient();
      const results = client.search('Overactive');
      assert.ok(Array.isArray(results), 'Should return array');
      assert.ok(results.length >= 1, 'Should find Overactive track');
      assert.ok(results[0].title.includes('Overactive'), 'Title should match query');
    });
  });

  describe('Speaker Scheduler Engine', () => {
    it('SpeakerScheduler adds, lists, and removes scheduled alerts', () => {
      const { SpeakerScheduler } = require(path.join(APP_DIR, 'lib', 'scheduler'));
      const sched = new SpeakerScheduler();
      const job = sched.add({
        name: 'Unit Test Alert',
        time: '14:00',
        target: 'Kitchen speaker',
        days: ['Daily'],
        actionType: 'sound',
        payload: { soundId: 'chime' }
      });
      assert.ok(job.id, 'Job should have generated ID');
      const list = sched.list();
      assert.ok(list.some(j => j.id === job.id), 'Job should be in schedule list');

      // Test matches logic
      const nowMatch = new Date();
      nowMatch.setHours(14, 0, 0, 0);
      assert.strictEqual(sched.matches(job, nowMatch), true, 'Should match at 14:00');

      const nowNoMatch = new Date();
      nowNoMatch.setHours(14, 1, 0, 0);
      assert.strictEqual(sched.matches(job, nowNoMatch), false, 'Should not match at 14:01');

      // Remove job
      const removed = sched.remove(job.id);
      assert.strictEqual(removed, true, 'Should remove job successfully');
    });
  });

  describe('Renderer UI Assets', () => {
    it('index.html contains all 7 functional tab panes', () => {
      const htmlPath = path.join(APP_DIR, 'renderer', 'index.html');
      assert.ok(fs.existsSync(htmlPath), 'index.html should exist');
      const html = fs.readFileSync(htmlPath, 'utf8');
      assert.ok(html.includes('id="tab-record"'), 'Should contain tab-record pane');
      assert.ok(html.includes('id="tab-tts"'), 'Should contain tab-tts pane');
      assert.ok(html.includes('id="tab-file"'), 'Should contain tab-file pane');
      assert.ok(html.includes('id="tab-soundboard"'), 'Should contain tab-soundboard pane');
      assert.ok(html.includes('id="tab-ambient"'), 'Should contain tab-ambient pane');
      assert.ok(html.includes('id="tab-music"'), 'Should contain tab-music pane');
      assert.ok(html.includes('id="tab-schedules"'), 'Should contain tab-schedules pane');
      assert.ok(html.includes('id="waveform-canvas"'), 'Should have waveform canvas');
    });

    it('style.css defines RobOS color palette variables', () => {
      const cssPath = path.join(APP_DIR, 'renderer', 'style.css');
      assert.ok(fs.existsSync(cssPath), 'style.css should exist');
      const css = fs.readFileSync(cssPath, 'utf8');
      assert.ok(css.includes('--bg-primary: #0d1117'), 'Should define bg-primary');
      assert.ok(css.includes('--accent: #00bcd4'), 'Should define accent');
      assert.ok(css.includes('sched-time-badge'), 'Should style schedule badges');
    });

    it('app.js contains event handlers for recording, casting, music, and schedules', () => {
      const jsPath = path.join(APP_DIR, 'renderer', 'app.js');
      assert.ok(fs.existsSync(jsPath), 'app.js should exist');
      const js = fs.readFileSync(jsPath, 'utf8');
      assert.ok(js.includes('startRecording'), 'Should implement startRecording');
      assert.ok(js.includes('castVoiceRecording'), 'Should call castVoiceRecording');
      assert.ok(js.includes('castTTS'), 'Should call castTTS');
      assert.ok(js.includes('loadMusicLibrary'), 'Should implement loadMusicLibrary');
      assert.ok(js.includes('loadSchedules'), 'Should implement loadSchedules');
    });
  });

});


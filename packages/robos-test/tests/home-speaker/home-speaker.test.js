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

    it('documentation page exists in site/_apps/home-speaker.md', () => {
      const docPath = path.resolve(__dirname, '../../../../site/_apps/home-speaker.md');
      assert.ok(fs.existsSync(docPath), 'site/_apps/home-speaker.md should exist');
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
      assert.ok(content.includes('speakers:getSupportedCatalog'), 'Should register speakers:getSupportedCatalog');
      assert.ok(content.includes('speakers:addDevice'), 'Should register speakers:addDevice');
      assert.ok(content.includes('speakers:setLedRing'), 'Should register speakers:setLedRing');
      assert.ok(content.includes('dialog:openAudioFile'), 'Should register dialog:openAudioFile');
    });

    it('preload.js exposes robosSpeaker contextBridge APIs', () => {
      const preloadPath = path.join(APP_DIR, 'preload.js');
      assert.ok(fs.existsSync(preloadPath), 'preload.js should exist');
      const content = fs.readFileSync(preloadPath, 'utf8');
      assert.ok(content.includes('scanSpeakers:'), 'preload should expose scanSpeakers');
      assert.ok(content.includes('getSupportedCatalog:'), 'preload should expose getSupportedCatalog');
      assert.ok(content.includes('addDevice:'), 'preload should expose addDevice');
      assert.ok(content.includes('setDeviceLedRing:'), 'preload should expose setDeviceLedRing');
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

    it('_resolveTargetIps handles single IP, speaker name, modelCode NC-VK-9727, and all', () => {
      const service = new HomeSpeakerService();
      assert.deepStrictEqual(service._resolveTargetIps('192.168.1.10'), ['192.168.1.10']);
      const kitchenRes = service._resolveTargetIps('Kitchen speaker');
      assert.ok(kitchenRes.includes('192.168.1.10'));
      const peRes = service._resolveTargetIps('NC-VK-9727');
      assert.ok(peRes.includes('192.168.1.64'), 'NC-VK-9727 should resolve to Home Assistant Voice PE IP');
      const allRes = service._resolveTargetIps('all');
      assert.ok(allRes.length >= 2, 'all should resolve to multiple speaker IPs');
    });

    it('getSupportedCatalog lists Home Assistant Voice Preview Edition (NC-VK-9727) first (#1)', () => {
      const service = new HomeSpeakerService();
      const catalog = service.getSupportedCatalog();
      assert.ok(Array.isArray(catalog) && catalog.length >= 4, 'Should return supported hardware catalog');
      assert.strictEqual(catalog[0].id, 'ha-voice-pe-nc-vk-9727', 'First item should be ha-voice-pe-nc-vk-9727');
      assert.strictEqual(catalog[0].modelCode, 'NC-VK-9727', 'First item modelCode should be NC-VK-9727');
      assert.strictEqual(catalog[0].rank, 1, 'First item should have rank 1');
      assert.strictEqual(catalog[0].featured, true, 'First item should be marked featured');
    });

    it('EspHomeVoiceService builds valid Improv BLE Wi-Fi packets, protobuf frames, and exposes incoming voice listener state', () => {
      const { EspHomeVoiceService, buildEspHomeFrame } = require(path.join(APP_DIR, 'lib', 'esphome-voice-service'));
      const esp = new EspHomeVoiceService();
      const pkt = esp.buildImprovWifiPacket('NETGEAR65', 'secret123');
      assert.strictEqual(pkt[0], 0x01, 'Command byte should be 0x01');
      assert.strictEqual(pkt[2], 9, 'SSID length should be 9');
      const frame = buildEspHomeFrame(9);
      assert.strictEqual(frame[0], 0x00, 'ESPHome frame preamble should be 0x00');
      assert.strictEqual(frame[2], 9, 'ESPHome frame msgType should be 9');
      const st = esp.getListenerStatus();
      assert.strictEqual(st.active, false);
      assert.ok(Array.isArray(st.inbox));
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
      assert.ok(html.includes('id="tab-devices"'), 'Should contain tab-devices pane for Home Assistant & Add Device Wizard');
      assert.ok(html.includes('id="device-wizard-modal"'), 'Should contain Add Device Wizard container');
      assert.ok(html.includes('Home Assistant Voice'), 'Wizard should highlight Home Assistant Voice');
      assert.ok(html.includes('id="btn-toggle-listener"'), 'Should have incoming voice listener toggle');
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
      assert.ok(js.includes('executeVoiceCommand'), 'Should wire Nabu command router in UI');
    });
  });

  describe('Nabu Voice Command & Media Router (Hello Nabu -> RobOS Skills + Media Library)', () => {
    it('strips wake phrases (Hello Nabu, Okay Nabu, Commander) and classifies intents', () => {
      const router = require(path.join(APP_DIR, 'lib', 'nabu-command-router'));
      assert.strictEqual(router.stripWakePhrase('Hello Nabu, play some Dark Tranquillity'), 'play some Dark Tranquillity');
      assert.strictEqual(router.stripWakePhrase('Commander, play some Dark Tranquillity'), 'play some Dark Tranquillity');
      assert.strictEqual(router.stripWakePhrase('Okay Nabu please open Task Explorer'), 'open Task Explorer');
      assert.strictEqual(router.classifyVoiceCommand('play some Dark Tranquillity').type, 'play-media');
      // Phonetic ASR coarticulation ("Place some..." / "Place Slayer..." instead of "Play...")
      assert.strictEqual(router.classifyVoiceCommand('Place some dark tranquility').type, 'play-media');
      assert.strictEqual(router.classifyVoiceCommand('Place Slayer seasons of the Abyss').type, 'play-media');
      // Genuine tabletop command still routes to tabletop skill
      assert.strictEqual(router.classifyVoiceCommand('place 2 skeletons in room 1').type, 'robos-skill');
      assert.strictEqual(router.classifyVoiceCommand('play the movie Dune').type, 'play-movie');
      assert.strictEqual(router.classifyVoiceCommand('pause the music').action, 'pause');
      assert.strictEqual(router.classifyVoiceCommand('next song').action, 'next');
      assert.strictEqual(router.classifyVoiceCommand('validate knowledge graph').type, 'robos-skill');
    });

    it('scores and ranks songs, artists, albums, and movies with fuzzy matching', async () => {
      const router = require(path.join(APP_DIR, 'lib', 'nabu-command-router'));
      const sampleAudio = [
        { id: 't1', title: 'Encircled', artist: 'Dark Tranquillity', album: 'Atoma', trackNumber: 1, year: 2016, genre: 'Melodic Death Metal' },
        { id: 't2', title: 'Caves and Embers', artist: 'Dark Tranquillity', album: 'Atoma', trackNumber: 12, year: 2016, genre: 'Melodic Death Metal' },
        { id: 't3', title: 'Overactive Imagination', artist: 'Death', album: 'Individual Thought Patterns', trackNumber: 1, year: 1993, genre: 'Death Metal' },
      ];
      // Fuzzy spelling ("Tranquility" with one 'l') matches artist "Dark Tranquillity"
      const artistMatch = router.findBestMediaMatches('play some Dark Tranquility', sampleAudio, { kind: 'audio' });
      assert.strictEqual(artistMatch.ok, true);
      assert.strictEqual(artistMatch.matchType, 'artist');
      assert.strictEqual(artistMatch.tracks.length, 2);

      // Exact song title match
      const songMatch = router.findBestMediaMatches('play Caves and Embers', sampleAudio, { kind: 'audio' });
      assert.strictEqual(songMatch.ok, true);
      assert.strictEqual(songMatch.bestTrack.id, 't2');

      // Movie number normalization ("two" -> "2")
      const sampleMovies = [
        { id: 'm1', title: 'Dune', year: 2021, album: 'Dune (2021)' },
        { id: 'm2', title: 'Scary Movie 2', year: 2001, album: 'Scary Movie 2 (2001)' },
      ];
      const movieMatch = router.findBestMediaMatches('watch Scary Movie two', sampleMovies, { kind: 'movie' });
      assert.strictEqual(movieMatch.ok, true);
      assert.strictEqual(movieMatch.bestTrack.id, 'm2');

      // RobOS skill execution via executeNabuCommand
      const skillRes = await router.executeNabuCommand('Hello Nabu validate knowledge graph', { autoLaunchPlayers: false });
      assert.strictEqual(skillRes.ok, true);
      assert.strictEqual(skillRes.skill, 'kgraph-validate');
    });

    it('matches TV Season & Episode queries and resolves target cast devices across Audio and Movie libraries', () => {
      const router = require(path.join(APP_DIR, 'lib', 'nabu-command-router'));
      const sampleDevices = [
        { ip: '192.0.2.15', id: 'tv-roku', name: '65" TCL Roku TV (Living room)', model: 'TCL Roku OS', platformId: 'roku-os', deviceType: 'tv', isRealLanDevice: true },
        { ip: '192.168.1.10', id: 'spk-kitchen', name: 'Kitchen speaker', model: 'Google Nest Audio', platformId: 'google-cast', deviceType: 'speaker', isRealLanDevice: true },
      ];
      const sampleAudio = [
        { id: 'a1', title: 'Misery\'s Crown', artist: 'Dark Tranquillity', album: 'Fiction', trackNumber: 3 },
      ];
      const sampleMovies = [
        { id: 'rm_s07e01', title: 'Rick and Morty · S07E01', showName: 'Rick and Morty', seasonNumber: 7, episodeNumber: 1, episodeCode: 'S07E01', mediaType: 'tv' },
        { id: 'rm_s08e01', title: 'Rick and Morty · S08E01 · Summer of All Fears', showName: 'Rick and Morty', seasonNumber: 8, episodeNumber: 1, episodeCode: 'S08E01', episodeTitle: 'Summer of All Fears', mediaType: 'tv' },
        { id: 'rm_s08e02', title: 'Rick and Morty · S08E02 · Valkyrick', showName: 'Rick and Morty', seasonNumber: 8, episodeNumber: 2, episodeCode: 'S08E02', episodeTitle: 'Valkyrick', mediaType: 'tv' },
      ];

      const tvRes = router.findUnifiedMediaMatch('play rick and morty season 8 episode 1 on the roku', {
        audioTracks: sampleAudio,
        movieTracks: sampleMovies,
        devices: sampleDevices,
      });
      assert.strictEqual(tvRes.ok, true);
      assert.strictEqual(tvRes.kind, 'movie');
      assert.strictEqual(tvRes.matchType, 'tv-episode');
      assert.strictEqual(tvRes.bestTrack.id, 'rm_s08e01');
      assert.strictEqual(tvRes.targetIp, '192.0.2.15');
      assert.ok(tvRes.summaryText.includes('Season 8 Episode 1'));
      assert.ok(tvRes.summaryText.includes('Roku TV'));

      const audioRes = router.findUnifiedMediaMatch('play some dark tranquility on the kitchen speaker', {
        audioTracks: sampleAudio,
        movieTracks: sampleMovies,
        devices: sampleDevices,
      });
      assert.strictEqual(audioRes.ok, true);
      assert.strictEqual(audioRes.kind, 'audio');
      assert.strictEqual(audioRes.bestTrack.id, 'a1');
      assert.strictEqual(audioRes.targetIp, '192.168.1.10');
      assert.ok(audioRes.summaryText.includes('Kitchen speaker'));
    });

    it('blocks session music playback until a current listening device is set, and plays on that device once set', async () => {
      const os = require('os');
      const router = require(path.join(APP_DIR, 'lib', 'nabu-command-router'));
      const tmpCfg = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-listening-session-'));
      try {
        fs.writeFileSync(path.join(tmpCfg, 'audio-library.json'), JSON.stringify({
          tracks: [
            { id: 'dt1', title: 'Void of Tranquility', artist: 'Dark Tranquility', album: 'Trail Of Life Decayed', trackNumber: 1 },
            { id: 'dt2', title: "Misery's Crown", artist: 'Dark Tranquillity', album: 'Fiction', trackNumber: 3 },
          ],
        }));
        fs.writeFileSync(path.join(tmpCfg, 'home-speakers.json'), JSON.stringify({
          speakers: [
            { ip: '192.168.1.10', name: 'Kitchen speaker', model: 'Google Cast Speaker', protocol: 'google-cast', online: true },
            { ip: '192.168.1.2', name: 'Master Bedroom clock', model: 'Google Cast Speaker', protocol: 'google-cast', online: true },
          ],
        }));

        // 1. Without a session listening device set, playing music stops and prompts the user
        const blocked = await router.executeNabuCommand('place the dark tranquility.', {
          configDir: tmpCfg,
          autoLaunchPlayers: false,
        });
        assert.strictEqual(blocked.ok, false);
        assert.strictEqual(blocked.needsListeningDevice, true);
        assert.strictEqual(blocked.skill, 'audio-play');
        assert.match(blocked.response, /set a current listening device/i);
        assert.match(blocked.response, /Kitchen speaker/);

        // 2. Setting the current listening device for the session succeeds
        const setRes = await router.executeNabuCommand('set my current listening device to Kitchen speaker', {
          configDir: tmpCfg,
          autoLaunchPlayers: false,
        });
        assert.strictEqual(setRes.ok, true);
        assert.strictEqual(setRes.skill, 'listening-device-control');
        assert.strictEqual(setRes.targetIp, '192.168.1.10');
        assert.match(setRes.response, /Kitchen speaker/);

        const getRes = await router.executeNabuCommand('what is my current listening device?', {
          configDir: tmpCfg,
          autoLaunchPlayers: false,
        });
        assert.strictEqual(getRes.ok, true);
        assert.strictEqual(getRes.targetIp, '192.168.1.10');
        assert.match(getRes.response, /Kitchen speaker/);

        // 3. Playing music now automatically uses Kitchen speaker for this session
        const allowed = await router.executeNabuCommand('place the dark tranquility.', {
          configDir: tmpCfg,
          autoLaunchPlayers: false,
        });
        assert.strictEqual(allowed.ok, true);
        assert.strictEqual(allowed.skill, 'audio-play');
        assert.strictEqual(allowed.targetIp, '192.168.1.10');
        assert.match(allowed.response, /on Kitchen speaker/);

        // 4. Clearing the session listening device re-arms the prompt gate
        const clearRes = await router.executeNabuCommand('clear current listening device', {
          configDir: tmpCfg,
          autoLaunchPlayers: false,
        });
        assert.strictEqual(clearRes.ok, true);
        const blockedAgain = await router.executeNabuCommand('play Void of Tranquility', {
          configDir: tmpCfg,
          autoLaunchPlayers: false,
        });
        assert.strictEqual(blockedAgain.ok, false);
        assert.strictEqual(blockedAgain.needsListeningDevice, true);

        // 5. Explicit "on Master Bedroom clock" in one command both plays and sets the session listening device
        const explicitPlay = await router.executeNabuCommand('play Void of Tranquility on Master Bedroom clock', {
          configDir: tmpCfg,
          autoLaunchPlayers: false,
        });
        assert.strictEqual(explicitPlay.ok, true);
        assert.strictEqual(explicitPlay.targetIp, '192.168.1.2');
        assert.strictEqual(router.getCurrentListeningDevice(tmpCfg).ip, '192.168.1.2');
      } finally {
        fs.rmSync(tmpCfg, { recursive: true, force: true });
      }
    });

    it('controls volume (0-100%, up/down, mute/unmute, status) across Cast speakers and Roku Smart TVs', async () => {
      const os = require('os');
      const router = require(path.join(APP_DIR, 'lib', 'nabu-command-router'));
      const tmpCfg = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-volume-ctrl-'));
      try {
        fs.writeFileSync(path.join(tmpCfg, 'home-speakers.json'), JSON.stringify({
          speakers: [
            { ip: '192.168.1.10', name: 'Kitchen speaker', model: 'Google Cast Speaker', protocol: 'google-cast', online: true, volume: 0.65, muted: false },
            { ip: '192.168.1.2', name: 'Master Bedroom clock', model: 'Google Cast Speaker', protocol: 'google-cast', online: true, volume: 0.50, muted: false },
          ],
        }));
        fs.writeFileSync(path.join(tmpCfg, 'tv-studio.json'), JSON.stringify({
          defaultTvId: 'tv-roku',
          defaultTvIp: '192.168.1.15',
          tvs: [
            { id: 'tv-roku', name: '65" TCL Roku TV (Living room)', ip: '192.168.1.15', platformId: 'roku-os', isRealLanDevice: true },
          ],
        }));

        // 1. Bare "volume up" before selecting a session device prompts cleanly
        const noDev = await router.executeNabuCommand('volume up', { configDir: tmpCfg, autoLaunchPlayers: false });
        assert.strictEqual(noDev.ok, false);
        assert.strictEqual(noDev.skill, 'volume-control');

        // 2. Explicit speaker volume set ("set Kitchen speaker volume to 40%")
        const set40 = await router.executeNabuCommand('set Kitchen speaker volume to 40%', { configDir: tmpCfg, autoLaunchPlayers: false });
        assert.strictEqual(set40.ok, true);
        assert.strictEqual(set40.skill, 'volume-control');
        assert.strictEqual(set40.targetIp, '192.168.1.10');
        assert.strictEqual(set40.data.volumePct, 40);

        // 3. Set session listening device, then bare "turn it up by 15%", "mute", "unmute", "what is the volume?"
        await router.executeNabuCommand('set current listening device to Kitchen speaker', { configDir: tmpCfg, autoLaunchPlayers: false });
        const up15 = await router.executeNabuCommand('turn it up by 15%', { configDir: tmpCfg, autoLaunchPlayers: false });
        assert.strictEqual(up15.ok, true);
        assert.strictEqual(up15.data.volumePct, 55);

        const muted = await router.executeNabuCommand('mute', { configDir: tmpCfg, autoLaunchPlayers: false });
        assert.strictEqual(muted.ok, true);
        assert.strictEqual(muted.data.muted, true);

        const getVol = await router.executeNabuCommand('what is the volume?', { configDir: tmpCfg, autoLaunchPlayers: false });
        assert.strictEqual(getVol.ok, true);
        assert.match(getVol.response, /55%.*muted/i);

        const unmuted = await router.executeNabuCommand('unmute Kitchen speaker', { configDir: tmpCfg, autoLaunchPlayers: false });
        assert.strictEqual(unmuted.ok, true);
        assert.strictEqual(unmuted.data.muted, false);

        // 4. Roku TV ECP step volume & mute ("turn up the Roku TV by 5", "turn down the TV", "mute the Roku TV")
        const rokuUp = await router.executeNabuCommand('turn up the Roku TV by 5', { configDir: tmpCfg, autoLaunchPlayers: false });
        assert.strictEqual(rokuUp.ok, true);
        assert.strictEqual(rokuUp.targetIp, '192.168.1.15');
        assert.strictEqual(rokuUp.data.steps, 5);
        assert.match(rokuUp.response, /5 steps/);

        const tvDown = await router.executeNabuCommand('turn down the TV', { configDir: tmpCfg, autoLaunchPlayers: false });
        assert.strictEqual(tvDown.ok, true);
        assert.strictEqual(tvDown.targetIp, '192.168.1.15');
        assert.strictEqual(tvDown.data.steps, 3);

        const rokuMute = await router.executeNabuCommand('mute the Roku TV', { configDir: tmpCfg, autoLaunchPlayers: false });
        assert.strictEqual(rokuMute.ok, true);
        assert.strictEqual(rokuMute.targetIp, '192.168.1.15');
      } finally {
        fs.rmSync(tmpCfg, { recursive: true, force: true });
      }
    });

    it('stops music playback via "stop playing music on {device}" across speakers, rooms, all speakers, and local', async () => {
      const os = require('os');
      const router = require(path.join(APP_DIR, 'lib', 'nabu-command-router'));
      const { SkillsExecutor } = require(path.resolve(__dirname, '../../../voice-prompt/lib/skills-executor'));
      const tmpCfg = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-stop-music-'));
      try {
        fs.writeFileSync(path.join(tmpCfg, 'home-speakers.json'), JSON.stringify({
          speakers: [
            { ip: '192.168.1.10', name: 'Kitchen speaker', model: 'Google Cast Speaker', protocol: 'google-cast', online: true },
            { ip: '192.168.1.6', name: "Leo's Rooom speaker", model: 'Google Cast Speaker', protocol: 'google-cast', online: true },
            { ip: '192.168.1.2', name: 'Master Bedroom clock', model: 'Google Cast Speaker', protocol: 'google-cast', online: true },
          ],
        }));

        // 1. Exact requested command: "Commander, stop playing music on Kitchen speaker"
        await router.executeNabuCommand('set current listening device to Kitchen speaker', { configDir: tmpCfg, autoLaunchPlayers: false });
        const stopKitchen = await router.executeNabuCommand('Commander, stop playing music on Kitchen speaker', { configDir: tmpCfg, autoLaunchPlayers: false });
        assert.strictEqual(stopKitchen.ok, true);
        assert.strictEqual(stopKitchen.skill, 'audio-stop');
        assert.strictEqual(stopKitchen.targetIp, '192.168.1.10');
        assert.strictEqual(stopKitchen.response, 'Stopped playing music on Kitchen speaker.');
        assert.strictEqual(router.getCurrentListeningDevice(tmpCfg), null);

        // 2. Room phrasing & typo cleanup: "stop playing music in Leo's room"
        const stopLeo = await router.executeNabuCommand("stop playing music in Leo's room", { configDir: tmpCfg, autoLaunchPlayers: false });
        assert.strictEqual(stopLeo.ok, true);
        assert.strictEqual(stopLeo.skill, 'audio-stop');
        assert.strictEqual(stopLeo.targetIp, '192.168.1.6');
        assert.strictEqual(stopLeo.response, "Stopped playing music on Leo's Room speaker.");

        // 3. "stop playing music on Master Bedroom clock" via SkillsExecutor (Voice Server path)
        const exec = new SkillsExecutor();
        exec.configDir = tmpCfg;
        const stopClock = await exec.executeCommand('stop playing music on Master Bedroom clock', {});
        assert.strictEqual(stopClock.ok, true);
        assert.strictEqual(stopClock.skill, 'audio-stop');
        assert.strictEqual(stopClock.response, 'Stopped playing music on Master Bedroom clock.');

        // 4. "stop playing music on all speakers" & "stop playing music everywhere"
        const stopAll = await router.executeNabuCommand('stop playing music on all speakers', { configDir: tmpCfg, autoLaunchPlayers: false });
        assert.strictEqual(stopAll.ok, true);
        assert.strictEqual(stopAll.targetIp, 'all');
        assert.strictEqual(stopAll.response, 'Stopped playing music on all speakers.');

        // 5. Unknown device lists available devices clearly
        const stopBad = await router.executeNabuCommand('stop playing music on Mars toaster', { configDir: tmpCfg, autoLaunchPlayers: false });
        assert.strictEqual(stopBad.ok, false);
        assert.match(stopBad.response, /Available devices:.*Kitchen speaker/i);
      } finally {
        fs.rmSync(tmpCfg, { recursive: true, force: true });
      }
    });
  });

});


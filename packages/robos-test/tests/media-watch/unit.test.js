'use strict';

/**
 * Two computers, one Google Drive, the same Movie Player and Audio Player history.
 *
 * Each computer is its own sandbox HOME (different user folders, so the same Drive episode
 * has a different local cache path and a different local track ID on each). Both sign in to
 * the same Google account against an in-memory Google Drive. The scenario:
 *
 *   1. Desk PC: "Use my Google Drive" creates the RobOS Config Vault and backs it up.
 *   2. Desk PC: the Movie Player library (a Google Drive TV folder) and Audio Player play
 *      counts; you watch The Office S01E01 and stop 11 minutes into S01E02.
 *   3. Laptop: "Use my Google Drive" finds that vault and loads it. The laptop indexes the same
 *      Drive folder, and its Movie Player shows S01E02 resuming at 11 minutes.
 *   4. Voice on the laptop: "what season of the office did we leave off on?"
 *   5. Both computers watch at the same time (desk finishes S01E02, laptop starts Dune) and
 *      sync: watch history merges, no conflict, both computers see both.
 *   6. The media MCP server and the CLI answer the same questions.
 *
 *   node --test tests/media-watch/unit.test.js
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');

const { startMockDrive } = require('../../lib/mock-gdrive-server');

const PKG = path.resolve(__dirname, '..', '..', '..');
const history = require(path.join(PKG, 'robos-lib/media-history'));
const sync = require(path.join(PKG, 'robos-lib/config-sync'));
const { startMediaCloudSync } = require(path.join(PKG, 'robos-lib/media-cloud-sync'));
const watch = require(path.join(PKG, 'robos-lib/media-watch'));
const { MediaLibrary: MovieLibrary } = require(path.join(PKG, 'movie-player/lib/media-library'));
const { MediaLibrary: AudioLibrary } = require(path.join(PKG, 'audio-player/lib/media-library'));
const { generateTrackId } = require(path.join(PKG, 'movie-player/lib/track-metadata'));
const nabu = require(path.join(PKG, 'home-speaker/lib/nabu-command-router'));

const EMAIL = 'nick@example.com';
const ACCOUNT = 'google-nick-example-com';
const CONNECTION = 'gdrive-google-nick-example-com';
const RUN = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-media-watch-'));

function computer(name, token) {
  const home = path.join(RUN, name);
  const configDir = path.join(home, '.config', 'robos');
  fs.mkdirSync(configDir, { recursive: true });
  // Signed in with Google (Preferences → Cloud Suite Accounts), which also added the Drive data source.
  fs.writeFileSync(path.join(configDir, 'cloud-accounts.json'), JSON.stringify({ version: 1, defaultAccountId: ACCOUNT, accounts: [{ id: ACCOUNT, provider: 'google', email: EMAIL, accessToken: token, refreshToken: `1//refresh-${token}`, scopes: ['https://www.googleapis.com/auth/drive'], loggedIn: true }] }, null, 2));
  fs.writeFileSync(path.join(configDir, 'data-sources.json'), JSON.stringify([{ id: CONNECTION, name: 'My Google Drive', driverType: 'gdrive', category: 'storage', folderId: 'root', user: EMAIL, accessToken: token, refreshToken: `1//refresh-${token}`, loggedIn: true }], null, 2));
  return { name, home, configDir };
}

// The same Drive folder, indexed on one computer: the cache path (and so the track ID) is local.
function officeEpisode(pc, season, episode, title) {
  const remotePath = `/TV/The Office/Season ${season}/The.Office.S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}.mkv`;
  const filePath = path.join(pc.home, '.cache', 'robos', 'movie-player', 'cloud', CONNECTION, ...remotePath.split('/').filter(Boolean));
  return {
    id: generateTrackId(filePath), filePath, title: `The Office · S0${season}E0${episode} · ${title}`, mediaType: 'tv',
    showName: 'The Office', seasonNumber: season, episodeNumber: episode, episodeTitle: title, album: 'The Office', albumArtist: 'The Office',
    discNumber: season, trackNumber: episode, duration: 1320, cloud: { connectionId: CONNECTION, remotePath, driveId: `drv-${season}-${episode}`, driverType: 'gdrive' },
  };
}
function dune(pc) {
  const filePath = path.join(pc.home, '.cache', 'robos', 'movie-player', 'cloud', CONNECTION, 'Movies', 'Dune.2021.mkv');
  return { id: generateTrackId(filePath), filePath, title: 'Dune', year: 2021, mediaType: 'movie', duration: 9300, cloud: { connectionId: CONNECTION, remotePath: '/Movies/Dune.2021.mkv', driveId: 'drv-dune' } };
}
function libraryOn(pc) {
  return [officeEpisode(pc, 1, 1, 'Pilot'), officeEpisode(pc, 1, 2, 'Diversity Day'), officeEpisode(pc, 1, 3, 'Health Care'), officeEpisode(pc, 2, 1, 'The Dundies'), dune(pc)];
}

function openMoviePlayer(pc) {
  const lib = new MovieLibrary({ configDir: pc.configDir });
  if (!lib.tracks.length) { lib.tracks = libraryOn(pc); lib._saveCache(); }
  let changes = 0;
  history.attachHistory(lib, { app: 'movie-player', configDir: pc.configDir, onChange: () => { changes++; } });
  return { lib, changes: () => changes };
}

function mediaSync(pc, category = 'movie-library') {
  return startMediaCloudSync({ category, homeDir: pc.home, startDelayMs: 1e9, intervalMs: 1e9 });
}

const as = (machine, fn) => { process.env.ROBOS_MACHINE_NAME = machine; return fn(); };

describe('two computers share the Movie Player and Audio Player library and watch history through Google Drive', () => {
  let drive;
  const desk = computer('desk', 'tok-desk');
  const laptop = computer('laptop', 'tok-laptop');

  before(async () => {
    drive = await startMockDrive({ users: { 'tok-desk': EMAIL, 'tok-laptop': EMAIL } });
    process.env.ROBOS_GDRIVE_API_BASE = drive.url;
    process.env.ROBOS_GDRIVE_WEB_BASE = drive.url;
    process.env.ROBOS_GDRIVE_CONSISTENCY_BASE_MS = '5';
  });
  after(async () => {
    await drive?.close();
    delete process.env.ROBOS_MACHINE_NAME;
    fs.rmSync(RUN, { recursive: true, force: true });
  });

  it('portable keys name what the media is, not where its file is', () => {
    const a = officeEpisode(desk, 1, 2, 'Diversity Day');
    const b = officeEpisode(laptop, 1, 2, 'Diversity Day');
    assert.notEqual(a.id, b.id, 'local track IDs differ between computers');
    assert.equal(history.mediaKey(a), 'tv:the office:s1:e2');
    assert.equal(history.mediaKey(b), history.mediaKey(a));
    assert.equal(history.mediaKey(dune(desk)), 'movie:dune:2021');
    assert.equal(history.mediaKey({ title: 'Airbag', artist: 'Radiohead', album: 'OK Computer', mediaType: 'audio' }), 'audio:radiohead:ok computer:airbag');
  });

  it('1. desk: "Use my Google Drive" creates the vault and backs this computer up', async () => {
    fs.writeFileSync(path.join(desk.configDir, 'movie-folders.json'), JSON.stringify([{ id: 'fld_tv', label: 'TV', kind: 'cloud', connectionId: CONNECTION, path: '/TV', syncEnabled: true, addedAt: '2026-11-01T00:00:00.000Z', lastSynced: '2026-11-06T10:00:00.000Z' }], null, 2));
    const res = await as('Desk PC', () => sync.connectGoogleDrive({ homeDir: desk.home }));
    assert.equal(res.created, true);
    assert.equal(res.vault.name, 'RobOS Config Vault');
    assert.ok(res.synced, 'the first sync ran without asking');
    assert.ok(res.synced.pushed.includes('config/movie-folders.json'));
    assert.ok(res.synced.pushed.includes('config/data-sources.json'), 'the Google Drive data source is backed up');
    const vaultBytes = Buffer.concat(drive.allContent()).toString('latin1');
    assert.ok(!vaultBytes.includes('tok-desk'), 'sign-in tokens never reach the vault');
  });

  it('2. desk: watching The Office records portable history and syncs it', async () => {
    const { lib, changes } = openMoviePlayer(desk);
    const [e1, e2] = lib.tracks;
    as('Desk PC', () => {
      lib.saveProgress(e1.id, { positionSec: 1320, durationSec: 1320, completed: true });
      lib.saveProgress(e2.id, { positionSec: 660, durationSec: 1320 });
    });
    assert.equal(changes(), 2);
    const h = history.readEntries('movie-player', desk.configDir);
    assert.equal(h['tv:the office:s1:e1'].completed, true);
    assert.equal(h['tv:the office:s1:e2'].positionSec, 660);
    assert.equal(h['tv:the office:s1:e2'].by, 'Desk PC');

    // Audio Player plays follow too.
    const audio = new AudioLibrary({ configDir: desk.configDir });
    audio.tracks = [{ id: 'trk_airbag', filePath: path.join(desk.home, 'Music', 'Airbag.mp3'), title: 'Airbag', artist: 'Radiohead', album: 'OK Computer', mediaType: 'audio' }];
    audio._saveCache();
    history.attachHistory(audio, { app: 'audio-player', configDir: desk.configDir });
    as('Desk PC', () => { audio.recordPlay('trk_airbag'); audio.recordPlay('trk_airbag'); audio.setLoved(['trk_airbag'], true); });

    const movieRun = await as('Desk PC', () => mediaSync(desk).runNow('change'));
    assert.equal(movieRun.outcome, 'synced');
    assert.ok(movieRun.pushed.includes('config/media-history/movie-player.json'));
    assert.ok(!movieRun.pushed.includes('config/movie-library.json'), 'the library index stays on each computer');
    const audioRun = await as('Desk PC', () => mediaSync(desk, 'audio-library').runNow('change'));
    assert.ok(audioRun.pushed.includes('config/media-history/audio-player.json'));
  });

  it('3. laptop: "Use my Google Drive" finds the vault, loads it, and the Movie Player resumes S01E02 at 11 minutes', async () => {
    const found = await sync.findDriveVaults({ homeDir: laptop.home });
    assert.equal(found.length, 1, 'the laptop finds the desk vault without a pasted link');
    const res = await as('Laptop', () => sync.connectGoogleDrive({ homeDir: laptop.home }));
    assert.equal(res.created, false);
    assert.ok(res.synced, 'a new computer loads the vault without asking');
    assert.ok(res.synced.pulled.includes('config/movie-folders.json'));
    assert.ok(res.synced.pulled.includes('config/media-history/movie-player.json'));

    const folders = JSON.parse(fs.readFileSync(path.join(laptop.configDir, 'movie-folders.json'), 'utf8'));
    assert.equal(folders[0].connectionId, CONNECTION, 'the same Google Drive folder is in the laptop library');
    assert.equal(folders[0].lastSynced, undefined, 'the laptop indexes it itself');
    const ds = JSON.parse(fs.readFileSync(path.join(laptop.configDir, 'data-sources.json'), 'utf8'));
    assert.equal(ds[0].accessToken, 'tok-laptop', "the laptop keeps its own Google sign-in");

    // The laptop's Movie Player indexes the Drive folder (different cache paths and track IDs)...
    const { lib } = openMoviePlayer(laptop);
    const e2 = lib.tracks.find(t => t.episodeNumber === 2 && t.seasonNumber === 1);
    // ...and shows where the desk left off.
    assert.equal(lib.getStats()[e2.id].positionSec, 660);
    assert.equal(lib.getStats()[e2.id].inProgress, true);
    assert.equal(lib.getStats()[e2.id].syncedFrom, 'Desk PC');
    assert.equal(lib.getStats()[lib.tracks[0].id].completed, true);

    const audio = JSON.parse(fs.readFileSync(path.join(laptop.configDir, 'media-history', 'audio-player.json'), 'utf8')).entries['audio:radiohead:ok computer:airbag'];
    assert.equal(audio.plays, 2);
    assert.equal(audio.loved, true);
  });

  it('4. laptop voice: "what season of the office did we leave off on?"', async () => {
    const intent = nabu.classifyVoiceCommand(nabu.stripWakePhrase('Hey Nabu, what season of The Office did we leave off on?'));
    assert.equal(intent.type, 'watch-status');
    assert.equal(intent.title, 'the office');
    const answer = await nabu.answerWatchStatus(intent, { configDir: laptop.configDir });
    assert.equal(answer.ok, true);
    assert.match(answer.response, /season 1 of The Office/);
    assert.match(answer.response, /episode 2, "Diversity Day", 11 minutes in/);
    assert.match(answer.response, /on Desk PC/);
    assert.equal(answer.data.nextUp.episode, 2);
    assert.equal(answer.data.nextUp.resume, true);
    assert.deepEqual(answer.data.seasons.map(s => [s.season, s.watched, s.inProgress]), [[1, 1, 1], [2, 0, 0]]);

    for (const [said, scope] of [['where did we leave off on the office', 'show'], ['what episode are we on in the office', 'show'], ['have we seen dune', 'any'], ['what are we watching', 'continue']]) {
      const i = nabu.parseWatchStatusQuery(said);
      assert.equal(i?.scope, scope, said);
    }
    assert.equal(nabu.parseWatchStatusQuery('continue watching the office').type, 'play-next-episode');
    assert.equal(nabu.parseWatchStatusQuery('play the office season 2 episode 3'), null, 'a play command stays a play command');
  });

  it('5. both computers watch at once and sync: history merges with no conflict', async () => {
    const deskPlayer = openMoviePlayer(desk);
    const laptopPlayer = openMoviePlayer(laptop);
    as('Desk PC', () => deskPlayer.lib.saveProgress(deskPlayer.lib.tracks[1].id, { positionSec: 1320, durationSec: 1320, completed: true }));
    await new Promise(r => setTimeout(r, 15));
    as('Laptop', () => laptopPlayer.lib.saveProgress(laptopPlayer.lib.tracks[4].id, { positionSec: 1800, durationSec: 9300 }));

    const d = await as('Desk PC', () => mediaSync(desk).runNow('change'));
    assert.equal(d.outcome, 'synced');
    const plan = await sync.planVaultSync({ homeDir: laptop.home, categories: ['movie-library'] });
    assert.deepEqual(plan.actions.map(a => [a.rel, a.action]), [['config/media-history/movie-player.json', 'merge']], 'changed on both computers: merged, not a conflict');
    const l = await as('Laptop', () => mediaSync(laptop).runNow('change'));
    assert.equal(l.outcome, 'synced');
    assert.deepEqual(l.merged, ['config/media-history/movie-player.json']);
    const back = await as('Desk PC', () => mediaSync(desk).runNow('interval'));
    assert.deepEqual(back.pulled, ['config/media-history/movie-player.json']);

    for (const pc of [desk, laptop]) {
      const entries = history.readEntries('movie-player', pc.configDir);
      assert.equal(entries['tv:the office:s1:e2'].completed, true, `${pc.name} sees S01E02 finished`);
      assert.equal(entries['movie:dune:2021'].positionSec, 1800, `${pc.name} sees Dune in progress`);
    }
    assert.deepEqual(history.readDoc(history.historyFile('movie-player', desk.configDir)), history.readDoc(history.historyFile('movie-player', laptop.configDir)), 'both computers hold the same history');

    // The open desk player applies what the laptop watched.
    const changed = deskPlayer.lib.syncHistory();
    const duneId = deskPlayer.lib.tracks[4].id;
    assert.equal(changed[duneId].positionSec, 1800);
    assert.equal(changed[duneId].syncedFrom, 'Laptop');

    const status = await watch.watchStatus('office', { configDir: desk.configDir });
    assert.equal(status.lastWatched.episode, 2);
    assert.equal(status.lastWatched.completed, true);
    assert.equal(status.nextUp.episode, 3);
    assert.match(status.spoken, /Next up is episode 3, "Health Care"/);
    const cw = await watch.continueWatching({ configDir: desk.configDir });
    assert.deepEqual(cw.items.map(i => i.kind === 'tv' ? `${i.show} ${i.code}` : i.title), ['Dune', 'The Office S01E02']);
    const movie = await watch.movieStatus('dune', { configDir: desk.configDir });
    assert.match(movie.spoken, /30 minutes into Dune \(2021\)/);
  });

  it('6. the media MCP server and the CLI answer from the synced history', async () => {
    const env = { ...process.env, HOME: laptop.home, USERPROFILE: laptop.home, ROBOS_CONFIG_DIR: laptop.configDir };
    const mcp = spawn(process.execPath, [path.join(PKG, 'movie-player/bin/media-mcp.js')], { env, stdio: ['pipe', 'pipe', 'inherit'] });
    const replies = [];
    let buf = '';
    mcp.stdout.on('data', c => { buf += c; let i; while ((i = buf.indexOf('\n')) >= 0) { replies.push(JSON.parse(buf.slice(0, i))); buf = buf.slice(i + 1); } });
    const send = msg => mcp.stdin.write(JSON.stringify(msg) + '\n');
    send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '1' } } });
    send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'robos_media_watch_status', arguments: { show: 'the office' } } });
    const deadline = Date.now() + 10000;
    while (replies.length < 3 && Date.now() < deadline) await new Promise(r => setTimeout(r, 20));
    mcp.kill();
    assert.equal(replies.length, 3, 'one reply per request, none for the notification');
    assert.equal(replies[0].result.serverInfo.name, 'robos-media');
    assert.ok(replies[1].result.tools.some(t => t.name === 'robos_media_watch_status'));
    const status = JSON.parse(replies[2].result.content[0].text);
    assert.equal(status.show, 'The Office');
    assert.equal(status.nextUp.episode, 3);

    const out = execFileSync(process.execPath, [path.join(PKG, 'movie-player/bin/watch-status.js'), 'show', 'the', 'office'], { env, encoding: 'utf8' });
    assert.match(out, /You left off on season 1 of The Office/);
    const offline = await watch.setWatched({ show: 'the office', season: 1, episode: 3, configDir: laptop.configDir });
    assert.equal(offline.via, 'history-file', 'with the Movie Player closed, the history file is updated directly');
    assert.equal(history.readEntries('movie-player', laptop.configDir)['tv:the office:s1:e3'].completed, true);
  });
});

describe('Movie Player control API', () => {
  it('answers watch-status queries and actions for other apps, behind the token', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-mp-control-'));
    const { createControlServer, createAudioPlayerClient } = require(path.join(PKG, 'movie-player/lib/control-server'));
    const seen = [];
    const server = createControlServer({
      configDir: dir,
      handlers: {
        status: () => ({ ok: true }), speakClip: () => ({ ok: true }), pause: () => ({ ok: true }), resume: () => ({ ok: true }),
        queries: { '/api/watch-status': q => ({ ok: true, show: q.show, spoken: `asked about ${q.show}` }) },
        actions: { '/api/set-watched': body => { seen.push(body); return { ok: true }; } },
      },
    });
    await server.start();
    try {
      const client = createAudioPlayerClient({ configDir: dir });
      const status = await client.watchStatus('the office');
      assert.equal(status.spoken, 'asked about the office');
      assert.equal((await client.setWatched({ show: 'the office', season: 2 })).ok, true);
      assert.deepEqual(seen, [{ show: 'the office', season: 2 }]);
      const port = server.port();
      const res = await fetch(`http://127.0.0.1:${port}/api/watch-status?show=x`);
      assert.equal(res.status, 401, 'no token, no answer');
      const missing = await fetch(`http://127.0.0.1:${port}/api/constructor`, { headers: { 'X-RobOS-Token': server.token } });
      assert.equal(missing.status, 404, 'only declared routes answer');
    } finally {
      server.stop();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('media history merge', () => {
  it('the newer change wins per entry and play counts never go down', () => {
    const a = { entries: { k: { key: 'k', positionSec: 10, plays: 3, updatedAt: '2026-11-06T10:00:00Z', lastPlayed: '2026-11-06T10:00:00Z' }, onlyA: { key: 'onlyA', updatedAt: '2026-11-01T00:00:00Z' } } };
    const b = { entries: { k: { key: 'k', positionSec: 99, plays: 1, completed: false, updatedAt: '2026-11-06T11:00:00Z' }, onlyB: { key: 'onlyB', updatedAt: '2026-11-02T00:00:00Z' } } };
    const m = history.mergeDocs(a, b);
    assert.deepEqual(Object.keys(m.entries), ['k', 'onlyA', 'onlyB']);
    assert.equal(m.entries.k.positionSec, 99);
    assert.equal(m.entries.k.plays, 3);
    assert.equal(m.entries.k.lastPlayed, '2026-11-06T10:00:00Z');
    assert.deepEqual(history.mergeDocs(b, a), m, 'merging is symmetric');
  });

  it('matches what people say to show names', () => {
    assert.ok(history.titleScore('office', 'The Office') >= 0.9);
    assert.ok(history.titleScore('breaking bad', 'Breaking Bad') === 1);
    assert.ok(history.titleScore('the bear', 'The Office') < 0.5);
  });
});

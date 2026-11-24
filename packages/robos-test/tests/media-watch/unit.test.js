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

describe('Movie Player watchlist & episode cursor skills (CLI, MCP, and RobOS Voice)', () => {
  it('parses flexible episode expressions including codes, spoken numbers, seasons, and titles', () => {
    assert.deepEqual(history.parseEpisodeSpec('S02E05'), { season: 2, episode: 5, raw: 'S02E05' });
    assert.deepEqual(history.parseEpisodeSpec('2x04'), { season: 2, episode: 4, raw: '2x04' });
    assert.deepEqual(
      history.parseEpisodeSpec('season twenty one episode five'),
      { season: 21, episode: 5, raw: 'season twenty one episode five' },
    );
    assert.deepEqual(
      history.parseEpisodeSpec('episode 3 of season 2'),
      { season: 2, episode: 3, raw: 'episode 3 of season 2' },
    );
    assert.deepEqual(
      history.parseEpisodeSpec('season 3'),
      { season: 3, episode: 1, seasonOnly: true, raw: 'season 3' },
    );
    assert.deepEqual(
      history.parseEpisodeSpec('Dinner Party'),
      { season: null, episode: null, titleQuery: 'Dinner Party', raw: 'Dinner Party' },
    );
  });

  it('controls watchlist, marks all episodes as new, and sets current episode cursor via RobOS Voice, CLI, and MCP', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-watchlist-skill-'));
    const home = path.join(tmp, 'home');
    const configDir = path.join(home, '.config', 'robos');
    fs.mkdirSync(configDir, { recursive: true });

    const { SkillsExecutor } = require(path.join(PKG, 'voice-prompt/lib/skills-executor'));
    const { buildIndex, getShowWatchState } = require(path.join(PKG, 'movie-player/lib/library-index'));

    const mkEp = (show, s, e, epTitle) => {
      const fp = path.join(home, 'Media', show, `Season ${s}`, `${show}.S${String(s).padStart(2, '0')}E${String(e).padStart(2, '0')}.mkv`);
      return {
        id: generateTrackId(fp),
        filePath: fp,
        title: `${show} · S0${s}E0${e} · ${epTitle}`,
        mediaType: 'tv',
        showName: show,
        seasonNumber: s,
        episodeNumber: e,
        episodeTitle: epTitle,
        album: show,
        albumArtist: show,
        discNumber: s,
        trackNumber: e,
        duration: 1800,
      };
    };

    const tracks = [
      mkEp('Severance', 1, 1, 'Good News About Hell'),
      mkEp('Severance', 1, 2, 'Half Loop'),
      mkEp('Severance', 1, 3, 'In Perpetuity'),
      mkEp('Severance', 2, 1, 'Hello, Ms. Cobel'),
      mkEp('Severance', 2, 2, 'Goodbye, Mrs. Selvig'),
      mkEp('Severance', 2, 3, 'Who Is Alive?'),
      mkEp('Severance', 2, 4, 'Woes Hollow'),
      {
        id: generateTrackId(path.join(home, 'Media', 'Movies', 'Interstellar.2014.mkv')),
        filePath: path.join(home, 'Media', 'Movies', 'Interstellar.2014.mkv'),
        title: 'Interstellar',
        year: 2014,
        mediaType: 'movie',
        duration: 10140,
      },
    ];
    fs.writeFileSync(path.join(configDir, 'movie-library.json'), JSON.stringify({ updatedAt: new Date().toISOString(), tracks }));

    const prevHome = process.env.HOME;
    const prevCfg = process.env.ROBOS_CONFIG_DIR;
    process.env.HOME = home;
    process.env.ROBOS_CONFIG_DIR = configDir;

    try {
      const executor = new SkillsExecutor();

      // 1. Voice: add show & movie to watchlist (must route to movie-watchlist, NOT shopping-lists!)
      assert.equal(executor.hasActionableIntent('add Severance to my watch list'), true);
      const addShow = await executor.executeCommand('Commander, add Severance to my watch list');
      assert.equal(addShow.ok, true);
      assert.equal(addShow.skill, 'movie-watchlist');
      assert.match(addShow.response, /Added Severance to your Movie Player watchlist/i);

      const addMovie = await executor.executeCommand('add Interstellar to our watchlist');
      assert.equal(addMovie.ok, true);
      assert.equal(addMovie.skill, 'movie-watchlist');
      assert.match(addMovie.response, /Added Interstellar \(2014\)/i);

      // 2. Voice: query watchlist
      const listRes = await executor.executeCommand('what is on my watch list');
      assert.equal(listRes.ok, true);
      assert.equal(listRes.skill, 'movie-watchlist');
      assert.match(listRes.response, /Severance/);
      assert.match(listRes.response, /Interstellar/);

      // 3. Voice: "our current episode of Severance is season two episode three"
      //    Should mark S01E01, S01E02, S01E03, S02E01, S02E02 (5 episodes) as Watched,
      //    and S02E03 + S02E04 (2 episodes) as Unwatched, so S02E03 is Next Up!
      assert.equal(executor.hasActionableIntent('our current episode of Severance is season two episode three'), true);
      const curRes = await executor.executeCommand('our current episode of Severance is season two episode three');
      assert.equal(curRes.ok, true);
      assert.equal(curRes.skill, 'movie-watchlist');
      assert.equal(curRes.data.targetCode, 'S02E03');
      assert.equal(curRes.data.watchedBeforeCount, 5);
      assert.equal(curRes.data.unwatchedFromCurrentCount, 2);

      const stAfterCur = await watch.watchStatus('Severance', { configDir });
      assert.equal(stAfterCur.watchedEpisodes, 5);
      assert.equal(stAfterCur.lastWatched.code, 'S02E02');
      assert.equal(stAfterCur.nextUp.code, 'S02E03');

      // Also verify Movie Player UI index agrees on Continue: S02E03
      const statsOnDisk = JSON.parse(fs.readFileSync(path.join(configDir, 'movie-track-stats.json'), 'utf8')).tracks;
      const idx = buildIndex(tracks);
      const uiState = getShowWatchState(idx.tvShows[0], statsOnDisk);
      assert.equal(uiState.watchedCount, 5);
      assert.equal(uiState.resumeEpisodeCode, 'S02E03');
      assert.equal(uiState.actionLabel, 'Continue: S02E03');

      // 4. Moving cursor backwards ("my current episode of Severance is S01E02")
      //    Marks only S01E01 watched and resets S01E02..S02E04 unwatched!
      const backRes = await executor.executeCommand('my current episode of Severance is S01E02');
      assert.equal(backRes.ok, true);
      assert.equal(backRes.data.watchedBeforeCount, 1);
      assert.equal(backRes.data.unwatchedFromCurrentCount, 6);
      const stBack = await watch.watchStatus('Severance', { configDir });
      assert.equal(stBack.watchedEpisodes, 1);
      assert.equal(stBack.nextUp.code, 'S01E02');

      // 5. Voice: "remove Severance from my watch list"
      //    Removes from My Watchlist AND hides from Continue Watching without wiping S01E01 watched
      const remRes = await executor.executeCommand('remove Severance from my watch list');
      assert.equal(remRes.ok, true);
      assert.equal(remRes.skill, 'movie-watchlist');
      assert.match(remRes.response, /Removed Severance from your watchlist/i);

      const wlAfterRemove = await watch.watchlist({ configDir });
      assert.equal(wlAfterRemove.items.some(i => i.kind === 'tv' && i.show === 'Severance'), false);
      const statsAfterRemove = JSON.parse(fs.readFileSync(path.join(configDir, 'movie-track-stats.json'), 'utf8')).tracks;
      const uiStateRemoved = getShowWatchState(idx.tvShows[0], statsAfterRemove);
      assert.equal(uiStateRemoved.dismissedFromWatchlist, true);
      assert.equal(uiStateRemoved.watchedCount, 1, 'previously watched count preserved until marked new');

      // 6. Voice: "mark all episodes of Severance as new"
      const newRes = await executor.executeCommand('mark all episodes of Severance as new');
      assert.equal(newRes.ok, true);
      assert.equal(newRes.skill, 'movie-watchlist');
      assert.match(newRes.response, /Marked all 7 episodes of Severance as new and unwatched/i);
      const stNew = await watch.watchStatus('Severance', { configDir });
      assert.equal(stNew.watchedEpisodes, 0);
      assert.equal(stNew.lastWatched, null);
      assert.equal(stNew.nextUp.code, 'S01E01');

      // 7. Standalone CLI (`robos-movie-watchlist`) & MCP (`media-mcp.js`)
      const cliOut = execFileSync(
        process.execPath,
        [path.join(PKG, 'robos-cli/robos-movie-watchlist'), 'say', 'my current episode of Severance is Woes Hollow'],
        { env: { ...process.env, HOME: home, ROBOS_CONFIG_DIR: configDir }, encoding: 'utf8' },
      );
      assert.match(cliOut, /Season 2, Episode 4/);
      const mcpMod = require(path.join(PKG, 'movie-player/bin/media-mcp.js'));
      const mcpList = await mcpMod.handle({ id: 1, method: 'tools/list' });
      assert.ok(mcpList.tools.some(t => t.name === 'robos_media_set_current_episode'));
      assert.ok(mcpList.tools.some(t => t.name === 'robos_media_watchlist_remove'));
      assert.ok(mcpList.tools.some(t => t.name === 'robos_media_mark_episodes_new'));
      assert.ok(mcpList.tools.some(t => t.name === 'robos_media_import_watch_history'));
    } finally {
      if (prevHome === undefined) delete process.env.HOME; else process.env.HOME = prevHome;
      if (prevCfg === undefined) delete process.env.ROBOS_CONFIG_DIR; else process.env.ROBOS_CONFIG_DIR = prevCfg;
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('imports Plex JSON & CSV watch history idempotently across Movie Player, Audio Player, folder variants, and year-distinct remakes', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-wh-import-'));
    const home = path.join(tmp, 'home');
    const downloads = path.join(home, 'Downloads');
    const configDir = path.join(home, '.config', 'robos');
    fs.mkdirSync(downloads, { recursive: true });
    fs.mkdirSync(configDir, { recursive: true });

    const movieTracks = [
      {
        id: 'trk-ghosts-410',
        filePath: '/tv/Ghosts/S04E10.mkv',
        title: 'Ghosts S04E10',
        mediaType: 'tv',
        showName: 'Ghosts',
        seasonNumber: 4,
        episodeNumber: 10,
        episodeTitle: 'The Not-So-Silent Partner',
        duration: 1320,
      },
      {
        id: 'trk-ghosts-411',
        filePath: '/tv/Ghosts/S04E11.mkv',
        title: 'Ghosts S04E11',
        mediaType: 'tv',
        showName: 'Ghosts',
        seasonNumber: 4,
        episodeNumber: 11,
        episodeTitle: 'Thorapy 2',
        duration: 1320,
      },
      {
        id: 'trk-avatar-2005-101',
        filePath: '/tv/Avatar 2005/S01E01.mkv',
        title: 'Avatar S01E01',
        mediaType: 'tv',
        showName: 'Avatar - The Last Airbender (2005 - 2008)',
        seasonNumber: 1,
        episodeNumber: 1,
        duration: 1400,
      },
      {
        id: 'trk-halloween-1978',
        filePath: '/movies/Halloween.1978.mkv',
        title: 'Halloween',
        year: 1978,
        mediaType: 'movie',
        duration: 5460,
      },
      {
        id: 'trk-halloween-2018',
        filePath: '/movies/Halloween.2018.mkv',
        title: 'Halloween',
        year: 2018,
        mediaType: 'movie',
        duration: 6360,
      },
    ];
    const audioTracks = [
      {
        id: 'aud-slayer-divine',
        filePath: '/music/Slayer/Divine Intervention/05 Divine Intervention.flac',
        title: 'Divine Intervention',
        artist: 'Slayer',
        album: 'Divine Intervention',
        mediaType: 'audio',
        duration: 333,
      },
    ];
    fs.writeFileSync(path.join(configDir, 'movie-library.json'), JSON.stringify({ updatedAt: new Date().toISOString(), tracks: movieTracks }));
    fs.writeFileSync(path.join(configDir, 'audio-library.json'), JSON.stringify({ updatedAt: new Date().toISOString(), tracks: audioTracks }));

    const plexExport = {
      exportedAt: '2026-11-24T20:27:21.413Z',
      server: 'home-plex',
      accounts: ['nick', 'leo'],
      count: 6,
      history: [
        { viewedAt: '2026-11-24T06:16:18.000Z', account: 'nick', type: 'episode', title: 'The Not-So-Silent Partner', show_or_artist: 'Ghosts (US)', season: 4, episode: 10, library: 'TV Shows' },
        { viewedAt: '2026-11-23T06:16:18.000Z', account: 'leo', type: 'episode', title: 'The Not-So-Silent Partner', show_or_artist: 'Ghosts (US)', season: 4, episode: 10, library: 'TV Shows' },
        // Both 2005 S01E02 (not in local lib) and 2024 S01E01 (live-action remake — must NOT mark 2005 S01E01 watched!)
        { viewedAt: '2026-10-01T01:00:00.000Z', account: 'nick', type: 'episode', title: 'The Avatar Returns', show_or_artist: 'Avatar: The Last Airbender', season: 1, episode: 2, library: 'TV Shows' },
        { viewedAt: '2026-10-05T01:00:00.000Z', account: 'nick', type: 'episode', title: 'Aang', show_or_artist: 'Avatar: The Last Airbender (2024)', season: 1, episode: 1, library: 'TV Shows' },
        // Halloween (2018) watched -> must mark 2018 watched, NOT 1978!
        { viewedAt: '2026-10-31T02:00:00.000Z', account: 'nick', type: 'movie', title: 'Halloween', released: '2018-10-19', library: 'Movies' },
        // Music track
        { viewedAt: '2026-11-24T19:40:26.000Z', account: 'nick', type: 'track', title: 'Divine Intervention', show_or_artist: 'Slayer', season_or_album: 'Divine Intervention', season: 1, episode: 5, library: 'Music' },
      ],
    };
    const plexFile = path.join(downloads, 'plex-watch-history.json');
    fs.writeFileSync(plexFile, JSON.stringify(plexExport, null, 2));

    const prevHome = process.env.HOME;
    const prevCfg = process.env.ROBOS_CONFIG_DIR;
    process.env.HOME = home;
    process.env.ROBOS_CONFIG_DIR = configDir;

    try {
      const { SkillsExecutor } = require(path.join(PKG, 'voice-prompt/lib/skills-executor'));
      const executor = new SkillsExecutor();

      // Voice auto-discovers ~/Downloads/plex-watch-history.json!
      const voiceImp = await executor.executeCommand('import my watch history');
      assert.equal(voiceImp.ok, true);
      assert.equal(voiceImp.skill, 'movie-watchlist');
      assert.equal(voiceImp.data.imported.totalEvents, 6);

      // Re-importing the exact same file is idempotent (plays stays 2, not 4!)
      const secondImp = await watch.importWatchHistory(plexFile, { configDir, homeDir: home, pushToServer: false });
      assert.equal(secondImp.ok, true);

      const mStats = JSON.parse(fs.readFileSync(path.join(configDir, 'movie-track-stats.json'), 'utf8')).tracks;
      assert.equal(mStats['trk-ghosts-410'].completed, true);
      assert.equal(mStats['trk-ghosts-410'].plays, 2, 'duplicate re-import does not double play count');
      assert.equal(Boolean(mStats['trk-avatar-2005-101']?.completed), false, '2024 remake did not falsely mark 2005 S01E01 watched');
      assert.equal(mStats['trk-halloween-2018'].completed, true);
      assert.equal(Boolean(mStats['trk-halloween-1978']?.completed), false, 'Halloween 2018 did not mark Halloween 1978 watched');

      // Ghosts nextUp should now be S04E11!
      const ghostsSt = await watch.watchStatus('Ghosts', { configDir });
      assert.equal(ghostsSt.lastWatched.code, 'S04E10');
      assert.equal(ghostsSt.nextUp.code, 'S04E11');

      // Audio Player stats updated for Slayer!
      const aStats = JSON.parse(fs.readFileSync(path.join(configDir, 'audio-track-stats.json'), 'utf8')).tracks;
      assert.equal(aStats['aud-slayer-divine'].plays, 1);

      // CSV import (Letterboxd style) marks Halloween 1978 watched too!
      const csvFile = path.join(downloads, 'letterboxd-watched.csv');
      fs.writeFileSync(csvFile, 'Date,Name,Year\n2026-10-30,"Halloween",1978\n');
      const csvImp = await watch.importWatchHistory(csvFile, { configDir, homeDir: home, pushToServer: false });
      assert.equal(csvImp.ok, true);
      const mStatsAfterCsv = JSON.parse(fs.readFileSync(path.join(configDir, 'movie-track-stats.json'), 'utf8')).tracks;
      assert.equal(mStatsAfterCsv['trk-halloween-1978'].completed, true);
    } finally {
      if (prevHome === undefined) delete process.env.HOME; else process.env.HOME = prevHome;
      if (prevCfg === undefined) delete process.env.ROBOS_CONFIG_DIR; else process.env.ROBOS_CONFIG_DIR = prevCfg;
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('routes random episode, unwatched, genre movie, pilot/latest, and Smart TV handoff voice commands to named RobOS Smart TVs', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-smarttv-voice-'));
    const configDir = path.join(tmp, '.config', 'robos');
    fs.mkdirSync(configDir, { recursive: true });

    // Configure named RobOS Smart TVs (including custom names without hardcoded cue words)
    fs.writeFileSync(path.join(configDir, 'tv-studio.json'), JSON.stringify({
      portalPort: 19210,
      tvs: [
        {
          id: 'tv-livingroom-tcl-roku',
          name: '65" TCL Roku TV (Living room)',
          ip: '192.168.1.15',
          platformId: 'roku-os',
          platformName: 'Roku OS TV & Streaming Players',
          model: 'TCL 65S425',
          ecpDeviceInfo: { modelName: '65S425' },
        },
        {
          id: 'tv-garage-proj',
          name: 'Garage Projector',
          ip: '192.168.1.88',
          platformId: 'android-tv',
          platformName: 'Google TV',
          model: 'Epson 4K',
          lastSeen: new Date().toISOString(),
        },
      ],
    }, null, 2));

    const movieTracks = [
      { id: 'house-101', filePath: '/tv/House/S01E01.mkv', title: 'House S01E01', mediaType: 'tv', showName: 'House', seasonNumber: 1, episodeNumber: 1, episodeTitle: 'Pilot', duration: 2640 },
      { id: 'house-205', filePath: '/tv/House2/S02E05.mkv', title: 'House S02E05', mediaType: 'tv', showName: 'House (2004) Season 1-8 S01-S08', seasonNumber: 2, episodeNumber: 5, episodeTitle: 'Daddy\'s Boy', duration: 2640 },
      { id: 'house-312', filePath: '/tv/House3/S03E12.mkv', title: 'House S03E12', mediaType: 'tv', showName: 'House, M D', seasonNumber: 3, episodeNumber: 12, episodeTitle: 'One Day, One Room', duration: 2640 },
      { id: 'mov-course', filePath: '/courses/001 Intro.mp4', title: '001 Course Structure and Projects', year: 2023, mediaType: 'movie', genre: 'Education', duration: 300 },
      { id: 'mov-alien', filePath: '/movies/Alien.1979.mkv', title: 'Alien', year: 1979, mediaType: 'movie', genre: 'Horror, Sci-Fi', duration: 7020 },
      { id: 'mov-matrix', filePath: '/movies/Matrix.1999.mkv', title: 'The Matrix', year: 1999, mediaType: 'movie', genre: 'Action, Sci-Fi', duration: 8160 },
    ];
    fs.writeFileSync(path.join(configDir, 'movie-library.json'), JSON.stringify({ updatedAt: new Date().toISOString(), tracks: movieTracks }));
    // Mark S01E01 & S02E05 watched so S03E12 is the only unwatched episode of House!
    fs.writeFileSync(path.join(configDir, 'movie-track-stats.json'), JSON.stringify({
      updatedAt: new Date().toISOString(),
      tracks: {
        'house-101': { completed: true, plays: 1, lastPlayed: '2026-11-01T00:00:00Z' },
        'house-205': { completed: true, plays: 1, lastPlayed: '2026-11-02T00:00:00Z' },
      },
    }));

    try {
      // 1. "play a random episode of house on the "roku tv""
      const randHouse = await nabu.executeNabuCommand('play a random episode of house on the "roku tv"', {
        configDir,
        autoLaunchPlayers: false,
      });
      assert.equal(randHouse.ok, true);
      assert.equal(randHouse.skill, 'movie-play');
      assert.equal(randHouse.matchType, 'tv-random-episode');
      assert.equal(randHouse.targetIp, '192.168.1.15');
      assert.match(randHouse.response, /65" TCL Roku TV \(Living room\)/);
      assert.ok(['house-101', 'house-205', 'house-312'].includes(randHouse.bestTrack.id));

      // 2. "play a random unwatched episode of House on Garage Projector" (custom TV name + unwatched filter!)
      const unwatchedHouse = await nabu.executeNabuCommand('play a random unwatched episode of House on Garage Projector', {
        configDir,
        autoLaunchPlayers: false,
      });
      assert.equal(unwatchedHouse.ok, true);
      assert.equal(unwatchedHouse.targetIp, '192.168.1.88');
      assert.equal(unwatchedHouse.bestTrack.id, 'house-312', 'picks the only unwatched episode across all House folder variants');

      // 3. "play a random 90s movie on the Roku TV" -> picks The Matrix (1999), never 001 Course clip!
      const rand90s = await nabu.executeNabuCommand('play a random 90s movie on the Roku TV', {
        configDir,
        autoLaunchPlayers: false,
      });
      assert.equal(rand90s.ok, true);
      assert.equal(rand90s.bestTrack.id, 'mov-matrix');
      assert.equal(rand90s.targetIp, '192.168.1.15');

      // 4. "play the pilot of House on the Roku TV" & "play the latest episode of House on the Roku TV"
      const pilot = await nabu.executeNabuCommand('play the pilot of House on the Roku TV', { configDir, autoLaunchPlayers: false });
      assert.equal(pilot.ok, true);
      assert.equal(pilot.bestTrack.id, 'house-101');
      assert.equal(pilot.targetIp, '192.168.1.15');

      const latest = await nabu.executeNabuCommand('play the latest episode of House on the Roku TV', { configDir, autoLaunchPlayers: false });
      assert.equal(latest.ok, true);
      assert.equal(latest.bestTrack.id, 'house-312');
      assert.equal(latest.targetIp, '192.168.1.15');

      // 5. "list my smart tvs" & "open the movie library on the Roku TV"
      const tvList = await nabu.executeNabuCommand('list my smart tvs', { configDir, autoLaunchPlayers: false });
      assert.equal(tvList.ok, true);
      assert.match(tvList.response, /65" TCL Roku TV/);
      assert.match(tvList.response, /Garage Projector/);

      const openLib = await nabu.executeNabuCommand('open the movie library on the Roku TV', { configDir, autoLaunchPlayers: false });
      assert.equal(openLib.ok, true);
      assert.equal(openLib.targetIp, '192.168.1.15');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('casts and controls Smart TV playback headlessly when ROBOS_HEADLESS=1 (no Electron window)', async () => {
    const http = require('node:http');
    const nabu = require('../../../home-speaker/lib/nabu-command-router');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-headless-cast-'));
    const configDir = path.join(tmp, 'config');
    fs.mkdirSync(configDir, { recursive: true });

    // Spin up an in-memory /api/roku-cast server matching packages/media-server/server.js behavior
    let activeCast = null;
    const srv = http.createServer((req, res) => {
      if (req.url === '/api/roku-cast' && req.method === 'POST') {
        let raw = '';
        req.on('data', c => { raw += c; });
        req.on('end', () => {
          const body = JSON.parse(raw || '{}');
          if (body.active === false) {
            activeCast = null;
          } else if (activeCast && !body.mediaUrl && body.paused !== undefined) {
            activeCast = { ...activeCast, paused: Boolean(body.paused) };
          } else {
            activeCast = { active: true, ...body, paused: Boolean(body.paused) };
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, cinemaCast: activeCast }));
        });
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise(resolve => srv.listen(0, '0.0.0.0', resolve));
    const port = srv.address().port;
    const baseEndpoint = `http://127.0.0.1:${port}`;

    fs.writeFileSync(path.join(configDir, 'media-servers.json'), JSON.stringify({
      servers: [{ id: 'srv-1', url: baseEndpoint, enabled: true }],
    }));
    fs.writeFileSync(path.join(configDir, 'tv-studio.json'), JSON.stringify({
      tvs: [
        { id: 'tv-living-roku', name: '65" TCL Roku TV (Living room)', platformId: 'roku-os', ip: '192.168.1.15', paired: true },
      ],
    }));
    const tracks = [
      {
        id: 'ghosts-410',
        title: 'Ghosts · S04E10 — Episode 10',
        showName: 'Ghosts',
        seasonNumber: 4,
        episodeNumber: 10,
        episodeTitle: 'Episode 10',
        mediaType: 'tv',
        mediaService: { endpoint: baseEndpoint, remoteItemId: 'ms-410', directStreamUrl: `${baseEndpoint}/stream/ms-410.mkv` },
      },
      {
        id: 'ghosts-411',
        title: 'Ghosts · S04E11 —Thorapy 2',
        showName: 'Ghosts',
        seasonNumber: 4,
        episodeNumber: 11,
        episodeTitle: 'Thorapy 2',
        mediaType: 'tv',
        mediaService: { endpoint: baseEndpoint, remoteItemId: 'ms-411', directStreamUrl: `${baseEndpoint}/stream/ms-411.mkv` },
      },
    ];
    fs.writeFileSync(path.join(configDir, 'movie-library.json'), JSON.stringify({ tracks }));

    // Record S04E10 watched so "continue watching Ghosts" resolves S04E11!
    const mh = new history.MediaHistory({ app: 'movie-player', configDir });
    mh.record(tracks[0], { completed: true, plays: 1, lastPlayed: '2026-11-20T00:00:00Z' });

    const prevHeadless = process.env.ROBOS_HEADLESS;
    process.env.ROBOS_HEADLESS = '1';
    try {
      // 1. "continue watching Ghosts on the Roku TV" -> casts S04E11 directly to /api/roku-cast!
      const cont = await nabu.executeNabuCommand('continue watching Ghosts on the Roku TV', {
        configDir,
        autoLaunchPlayers: true,
      });
      assert.equal(cont.ok, true);
      assert.equal(cont.targetIp, '192.168.1.15');
      assert.ok(activeCast && activeCast.active === true);
      assert.equal(activeCast.trackId, 'ms-411');
      assert.equal(activeCast.paused, false);
      const originalLoadKey = activeCast.loadKey;

      // 2. "pause the Roku TV" / "paused the Roku TV" / "resume the Roku TV" -> preserves loadKey + mediaUrl while toggling paused!
      const paused = await nabu.executeNabuCommand('paused the Roku TV', {
        configDir,
        autoLaunchPlayers: true,
      });
      assert.equal(paused.ok, true);
      assert.equal(activeCast.paused, true);
      assert.equal(activeCast.loadKey, originalLoadKey);
      assert.match(activeCast.mediaUrl, /\/stream\/ms-411\.mkv$/);

      const resumed = await nabu.executeNabuCommand('resume the Roku TV', {
        configDir,
        autoLaunchPlayers: true,
      });
      assert.equal(resumed.ok, true);
      assert.equal(activeCast.paused, false);
      assert.equal(activeCast.loadKey, originalLoadKey);

      // 3. "play a random episode of Ghosts on the Roku TV" -> casts S04E10 or S04E11
      const rand = await nabu.executeNabuCommand('play a random episode of Ghosts on the Roku TV', {
        configDir,
        autoLaunchPlayers: true,
      });
      assert.equal(rand.ok, true);
      assert.ok(['ms-410', 'ms-411'].includes(activeCast.trackId));
      assert.equal(activeCast.paused, false);

      // 4. "stop casting" -> clears activeCast
      const stopped = await nabu.executeNabuCommand('stop casting', {
        configDir,
        autoLaunchPlayers: true,
      });
      assert.equal(stopped.ok, true);
      assert.equal(activeCast, null);
    } finally {
      if (prevHeadless === undefined) delete process.env.ROBOS_HEADLESS;
      else process.env.ROBOS_HEADLESS = prevHeadless;
      await new Promise(resolve => srv.close(resolve));
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

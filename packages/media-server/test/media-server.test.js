'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const http = require('node:http');

const { createMediaServer } = require('../server');
const sync = require('../../robos-lib/config-sync');
const auto = require('../../robos-lib/config-sync-auto');
const mediaClient = require('../../robos-lib/media-service-client');
const { MediaLibrary: MovieMediaLibrary } = require('../../movie-player/lib/media-library');
const { LibraryFolders: MovieLibraryFolders } = require('../../movie-player/lib/library-folders');
const { MediaLibrary: AudioMediaLibrary } = require('../../audio-player/lib/media-library');
const { LibraryFolders: AudioLibraryFolders } = require('../../audio-player/lib/library-folders');

/**
 * Builds a minimal valid EPUB (ZIP) buffer in memory using pure Node Buffer + zlib.
 */
function buildMinimalEpub({ title = 'All Systems Red', author = 'Martha Wells', chapterText = 'I could have become a mass murderer after I hacked my governor module.' } = {}) {
  const files = [
    { name: 'mimetype', data: Buffer.from('application/epub+zip', 'utf8'), store: true },
    {
      name: 'META-INF/container.xml',
      data: Buffer.from(`<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`, 'utf8'),
    },
    {
      name: 'OEBPS/content.opf',
      data: Buffer.from(`<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${title}</dc:title>
    <dc:creator>${author}</dc:creator>
    <dc:description>A rogue SecUnit prefers watching serial dramas over hazardous human missions.</dc:description>
    <dc:date>2017</dc:date>
  </metadata>
  <manifest>
    <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="ch1"/>
  </spine>
</package>`, 'utf8'),
    },
    {
      name: 'OEBPS/ch1.xhtml',
      data: Buffer.from(`<html><head><title>Chapter One</title></head><body><h1>Chapter 1: Rogue SecUnit</h1><p>${chapterText}</p></body></html>`, 'utf8'),
    },
  ];

  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const f of files) {
    const nameBuf = Buffer.from(f.name, 'utf8');
    const compressed = f.store ? f.data : zlib.deflateRawSync(f.data);
    const method = f.store ? 0 : 8;

    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(0, 14); // crc32 ignored by reader
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(f.data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    nameBuf.copy(local, 30);

    const central = Buffer.alloc(46 + nameBuf.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(f.data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    nameBuf.copy(central, 46);

    localParts.push(local, compressed);
    centralParts.push(central);
    offset += local.length + compressed.length;
  }

  const cdBuf = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);

  return Buffer.concat([...localParts, cdBuf, eocd]);
}

function httpGetRaw(url, headers = {}) {
  return new Promise((resolve, reject) => {
    http.get(url, { headers }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    }).on('error', reject);
  });
}

function mcpCall(mcpUrl, method, params = {}, id = 1) {
  return new Promise((resolve, reject) => {
    const u = new URL(mcpUrl);
    const payload = JSON.stringify({ jsonrpc: '2.0', id, method, params });
    const req = http.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    }, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => resolve(JSON.parse(raw)));
    });
    req.on('error', reject);
    req.end(payload);
  });
}

test('RobOS Media Server indexes movies, shows, music, books & courses, serves HTTP 206 + subtitles + EPUB reader + MCP, and RobOS Preferences auto-syncs fresh machines', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-media-server-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const downloads = path.join(root, 'downloads');
  const moviesDir = path.join(downloads, 'movies');
  const showsDir = path.join(downloads, 'shows');
  const musicDir = path.join(downloads, 'music');
  const booksDir = path.join(downloads, 'books');
  const serverHome = path.join(root, 'server-home');
  const clientHome = path.join(root, 'client-home');
  const vaultParent = path.join(root, 'shared-vault');

  fs.mkdirSync(path.join(moviesDir, 'Avengers Endgame (2019) [1080p]'), { recursive: true });
  fs.mkdirSync(path.join(showsDir, 'House MD'), { recursive: true });
  fs.mkdirSync(path.join(musicDir, 'Chrono Trigger', '1995 - OST'), { recursive: true });
  fs.mkdirSync(path.join(booksDir, 'All Systems Red by Martha Wells EPUB'), { recursive: true });
  fs.mkdirSync(serverHome, { recursive: true });
  fs.mkdirSync(clientHome, { recursive: true });
  fs.mkdirSync(vaultParent, { recursive: true });

  // Seed movie + SRT subtitle
  const movieFile = path.join(moviesDir, 'Avengers Endgame (2019) [1080p]', 'Avengers.Endgame.2019.1080p.WEBRip.x264.mp4');
  fs.writeFileSync(movieFile, Buffer.from('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_MOVIE_BYTES'));
  fs.writeFileSync(
    movieFile.replace(/\.mp4$/, '.srt'),
    '1\n00:00:01,000 --> 00:00:04,500\nWhatever it takes.\n'
  );

  // Seed TV show episodes
  fs.writeFileSync(path.join(showsDir, 'House MD', 'House - S01E01 - Pilot.m4v'), Buffer.from('EPISODE_1_DATA_PAYLOAD'));
  fs.writeFileSync(path.join(showsDir, 'House MD', 'House - S01E02 - Paternity.m4v'), Buffer.from('EPISODE_2_DATA_PAYLOAD'));

  // Seed Music track
  fs.writeFileSync(path.join(musicDir, 'Chrono Trigger', '1995 - OST', '01 - Corridors of Time.mp3'), Buffer.from('MP3_AUDIO_PAYLOAD_DATA'));

  // Seed EPUB book
  const epubPath = path.join(booksDir, 'All Systems Red by Martha Wells EPUB', 'All Systems Red.epub');
  fs.writeFileSync(epubPath, buildMinimalEpub());

  // 1. Start RobOS Media Server with empty initial services, then register services via MCP!
  const mediaSrv = createMediaServer({
    port: 0,
    host: '127.0.0.1',
    homeDir: serverHome,
    initialServices: [],
    autoScanOnStart: false,
    autoWatch: false,
  });
  const srvInfo = await mediaSrv.start();
  t.after(() => mediaSrv.stop());

  const serverUrl = `http://127.0.0.1:${srvInfo.port}`;
  const mcpUrl = `${serverUrl}/mcp`;

  // Verify MCP initialize + tools/list
  const initRes = await mcpCall(mcpUrl, 'initialize', { protocolVersion: '2024-11-05' });
  assert.equal(initRes.result.serverInfo.name, 'robos-media-server');
  const toolsList = await mcpCall(mcpUrl, 'tools/list');
  assert.ok(toolsList.result.tools.some(tl => tl.name === 'robos_media_add_service'));
  assert.ok(toolsList.result.tools.some(tl => tl.name === 'robos_media_read_book'));

  // Add Movies, TV Shows, Music, and Books services via MCP!
  for (const svc of [
    { id: 'movies', name: 'Movies', kind: 'movies', folders: [moviesDir] },
    { id: 'shows', name: 'TV Shows', kind: 'shows', folders: [showsDir] },
    { id: 'music', name: 'Music', kind: 'music', folders: [musicDir] },
    { id: 'books', name: 'Books', kind: 'books', folders: [booksDir] },
  ]) {
    const addRes = await mcpCall(mcpUrl, 'tools/call', { name: 'robos_media_add_service', arguments: svc });
    const parsed = JSON.parse(addRes.result.content[0].text);
    assert.equal(parsed.ok, true);
  }

  // Verify status & counts over MCP
  const statusCall = await mcpCall(mcpUrl, 'tools/call', { name: 'robos_media_server_status', arguments: {} });
  const statusJson = JSON.parse(statusCall.result.content[0].text);
  assert.equal(statusJson.counts.movies, 1);
  assert.equal(statusJson.counts.shows, 1);
  assert.equal(statusJson.counts.episodes, 2);
  assert.equal(statusJson.counts.musicTracks, 1);
  assert.equal(statusJson.counts.books, 1);

  // Verify reading EPUB book chapters over MCP AND HTTP!
  const readBookCall = await mcpCall(mcpUrl, 'tools/call', {
    name: 'robos_media_read_book',
    arguments: { title: 'All Systems Red', chapterIndex: 0 },
  });
  const bookChapter = JSON.parse(readBookCall.result.content[0].text);
  assert.equal(bookChapter.ok, true);
  assert.equal(bookChapter.author, 'Martha Wells');
  assert.match(bookChapter.text, /governor module/);

  // Verify HTTP 206 byte-range streaming & SRT->WebVTT subtitle conversion
  const moviesCall = await mcpCall(mcpUrl, 'tools/call', { name: 'robos_media_list_movies', arguments: {} });
  const movieItem = JSON.parse(moviesCall.result.content[0].text).items[0];
  assert.equal(movieItem.title, 'Avengers Endgame');
  assert.equal(movieItem.year, 2019);

  const rangeRes = await httpGetRaw(`${serverUrl}/stream/${movieItem.id}.mp4`, { Range: 'bytes=4-13' });
  assert.equal(rangeRes.status, 206);
  assert.equal(rangeRes.body.toString('utf8'), '456789ABCD');

  const subRes = await httpGetRaw(`${serverUrl}/api/subtitles/${movieItem.id}.vtt`);
  assert.equal(subRes.status, 200);
  assert.match(subRes.body.toString('utf8'), /WEBVTT/);
  assert.match(subRes.body.toString('utf8'), /Whatever it takes/);

  const pbInfoRes = await httpGetRaw(`${serverUrl}/api/playback-info/${movieItem.id}`);
  assert.equal(pbInfoRes.status, 200);
  const pbInfo = JSON.parse(pbInfoRes.body.toString('utf8'));
  assert.equal(pbInfo.ok, true);
  assert.equal(pbInfo.id, movieItem.id);
  assert.equal(pbInfo.hasSubtitles, true);

  const { parseTvEpisode } = require('../lib/media-parser');
  const fgEp = parseTvEpisode('/downloads/shows/Family.Guy.S21/Family.Guy.S21E01.720p.DSNP.WEBRip.x264-GalaxyTV.mkv', '/downloads/shows');
  assert.equal(fgEp.showName, 'Family Guy');
  assert.equal(fgEp.episodeCode, 'S21E01');
  assert.equal(fgEp.episodeTitle, '');

  // 2. Save RobOS Media Service in Server's Preferences and sync to Config Sync Vault
  await mediaClient.saveMediaServer(
    { url: serverUrl, name: 'RobOS Server Cinema & Music' },
    { homeDir: serverHome, syncNow: true }
  );

  const createdVault = await sync.connectVault({
    homeDir: serverHome,
    create: true,
    kind: 'folder',
    parentPath: vaultParent,
    name: 'RobOS Config Vault',
  });
  assert.equal(createdVault.ok, true);
  await sync.applyVaultSync({ homeDir: serverHome, strategy: 'use-local' });

  // 3. Fresh Client Machine connects RobOS Preferences to the Vault (ZERO local media folders!)
  await sync.connectVault({
    homeDir: clientHome,
    create: false,
    kind: 'folder',
    ref: createdVault.vault.url,
  });
  await sync.applyVaultSync({ homeDir: clientHome, strategy: 'use-vault' });
  await mediaClient.syncMediaServicesToLocalApps({ homeDir: clientHome, force: true });

  // Verify Client Machine's Movie Player & Audio Player now have ALL movies, TV shows, music & MCP!
  const clientConfigDir = path.join(clientHome, '.config', 'robos');
  const movieLib = new MovieMediaLibrary({ configDir: clientConfigDir });
  const movieFolders = new MovieLibraryFolders({
    mediaLibrary: movieLib,
    cloud: { listConnections: () => [] },
    configDir: clientConfigDir,
  });

  const listedMovieFolders = movieFolders.list();
  assert.equal(listedMovieFolders.length, 1);
  assert.equal(listedMovieFolders[0].kind, 'media-service');
  assert.equal(movieLib.tracks.length, 3); // 1 movie + 2 TV episodes
  assert.ok(movieLib.tracks.some(tr => tr.title === 'Avengers Endgame' && tr.mediaType === 'movie'));
  assert.ok(movieLib.tracks.some(tr => tr.showName === 'House' && tr.seasonNumber === 1 && tr.episodeNumber === 1));

  const audioLib = new AudioMediaLibrary({ configDir: clientConfigDir });
  const audioFolders = new AudioLibraryFolders({
    mediaLibrary: audioLib,
    cloud: { listConnections: () => [] },
    configDir: clientConfigDir,
  });
  const listedAudioFolders = audioFolders.list();
  assert.equal(listedAudioFolders.length, 1);
  assert.equal(listedAudioFolders[0].kind, 'media-service');
  assert.equal(audioLib.tracks.length, 1);
  assert.equal(audioLib.tracks[0].title, 'Corridors of Time');

  // Verify MCP registry on Client Machine also received robos-media-server
  const mcpServers = JSON.parse(fs.readFileSync(path.join(clientConfigDir, 'mcp', 'servers.json'), 'utf8'));
  assert.ok(mcpServers['robos-media-server']);
  assert.equal(mcpServers['robos-media-server'].endpoint, mcpUrl);

  // 4. Add a new movie on the Server, scan, and verify Preferences auto-sync updates the Client!
  fs.writeFileSync(path.join(moviesDir, 'Dune.Part.Two.2024.1080p.BluRay.x264.mp4'), Buffer.from('DUNE_2_MOVIE_DATA'));
  await mediaSrv.store.scan({ serviceId: 'movies' });

  const autoRes = await mediaClient.syncMediaServicesToLocalApps({ homeDir: clientHome });
  assert.equal(autoRes.syncedServers[0].updatedCatalog, true);
  movieLib._loadCache();
  assert.equal(movieLib.tracks.length, 4);
  assert.ok(movieLib.tracks.some(tr => tr.title === 'Dune Part Two'));

  // Also test auto.runAutoSync flow when server pushes an updated media-servers.json
  await mediaClient.saveMediaServer(
    { url: serverUrl, name: 'Updated Server Label' },
    { homeDir: serverHome, syncNow: false }
  );
  await sync.applyVaultSync({ homeDir: serverHome });
  const clientAuto = await auto.runAutoSync({ homeDir: clientHome, force: true });
  assert.equal(clientAuto.outcome, 'synced');

  // 5. Verify resetAndLoadPlayerLibraries wipes legacy folders/playlists/stats/caches
  //    while preserving audio-devices.json, and avoids Data Sources Google Drive clutter.
  fs.writeFileSync(path.join(clientConfigDir, 'audio-devices.json'), JSON.stringify({ output: 'scarlett' }));
  fs.writeFileSync(path.join(clientConfigDir, 'movie-playlists.json'), JSON.stringify([{ id: 'pl_old', name: 'Old' }]));
  fs.writeFileSync(path.join(clientConfigDir, 'audio-playlists.json'), JSON.stringify([{ id: 'pl_old_a', name: 'Old Audio' }]));
  fs.writeFileSync(path.join(clientConfigDir, 'movie-folders.json'), JSON.stringify([
    { id: 'fld_legacy_sftp', kind: 'cloud', connectionId: 'sftp-1', path: '/downloads/movies', syncEnabled: true },
  ]));
  fs.writeFileSync(path.join(clientConfigDir, 'movie-library.json'), JSON.stringify({
    tracks: [{ id: 'legacy_track_1', filePath: '/old/sftp/movie.mkv', title: 'Stale SFTP Movie' }],
  }));

  const resetRes = await mediaClient.resetAndLoadPlayerLibraries({ homeDir: clientHome });
  assert.equal(resetRes.ok, true);
  assert.equal(fs.existsSync(path.join(clientConfigDir, 'movie-playlists.json')), false);
  assert.equal(fs.existsSync(path.join(clientConfigDir, 'audio-playlists.json')), false);
  assert.equal(fs.existsSync(path.join(clientConfigDir, 'audio-devices.json')), true);

  const cleanMovieLib = new MovieMediaLibrary({ configDir: clientConfigDir });
  const cleanMovieFolders = new MovieLibraryFolders({
    mediaLibrary: cleanMovieLib,
    cloud: {
      listConnections: () => [{
        id: 'gdrive-1',
        name: 'Google Drive',
        driverType: 'gdrive',
        browsable: true,
        folders: [{ folderId: 'root', label: 'My Drive', remotePath: '/' }],
      }],
    },
    configDir: clientConfigDir,
  });
  const afterResetMovieFolders = cleanMovieFolders.list();
  assert.equal(afterResetMovieFolders.length, 1);
  assert.equal(afterResetMovieFolders[0].kind, 'media-service');
  assert.equal(cleanMovieLib.tracks.length, 4);
  assert.ok(!cleanMovieLib.tracks.some(tr => tr.title === 'Stale SFTP Movie'));

  // 6. Verify Roku Cinema grouped feed (/api/roku-cinema), /api/tv-progress, and Roku Movie Player package builder
  const rokuRes = await httpGetRaw(`${serverUrl}/api/roku-cinema`);
  assert.equal(rokuRes.status, 200);
  const rokuFeed = JSON.parse(rokuRes.body.toString('utf8'));
  assert.equal(rokuFeed.ok, true);
  assert.equal(rokuFeed.counts.movies, 2);
  assert.equal(rokuFeed.counts.shows, 1);
  assert.equal(rokuFeed.counts.episodes, 2);
  const houseShow = rokuFeed.cinemaLibrary.items.find(it => it.isShowGroup && it.title === 'House');
  assert.ok(houseShow);
  assert.equal(houseShow.episodes.length, 2);

  const unchangedRes = await httpGetRaw(`${serverUrl}/api/roku-cinema?knownRev=${encodeURIComponent(rokuFeed.rev)}`);
  assert.equal(JSON.parse(unchangedRes.body.toString('utf8')).unchanged, true);

  const progRes = await httpGetRaw(`${serverUrl}/api/tv-progress?id=${encodeURIComponent(movieItem.id)}&positionSec=600&durationSec=1800`);
  assert.equal(progRes.status, 200);
  assert.equal(JSON.parse(progRes.body.toString('utf8')).entry.inProgress, true);

  const unwatchedRes = await httpGetRaw(`${serverUrl}/api/tv-progress?id=${encodeURIComponent(movieItem.id)}&unwatched=true`);
  assert.equal(unwatchedRes.status, 200);
  assert.equal(JSON.parse(unwatchedRes.body.toString('utf8')).entry.completed, false);
  assert.equal(JSON.parse(unwatchedRes.body.toString('utf8')).entry.inProgress, false);

  const rokuMetaRes = await httpGetRaw(`${serverUrl}/api/roku-playback-meta/${encodeURIComponent(movieItem.id)}?cueTrack=0&waitCues=1`);
  assert.equal(rokuMetaRes.status, 200);
  const rokuMeta = JSON.parse(rokuMetaRes.body.toString('utf8'));
  assert.equal(rokuMeta.ok, true);
  assert.equal(rokuMeta.container, 'MP4');
  assert.ok(rokuMeta.subtitleTracks.length >= 1);
  assert.equal(rokuMeta.cuesReady, true);
  assert.ok(rokuMeta.cues.some(c => /Whatever it takes/i.test(c.t)));

  const srtRes = await httpGetRaw(`${serverUrl}/api/subtitles/${encodeURIComponent(movieItem.id)}.srt?track=0`);
  assert.equal(srtRes.status, 200);
  assert.match(srtRes.body.toString('utf8'), /-->/);
  assert.match(srtRes.body.toString('utf8'), /Whatever it takes/);

  const { createTvEngine } = require('../../robos-lib/tv-engine');
  const tvEng = createTvEngine({ configDir: clientConfigDir });
  const rokuBuild = await tvEng.installRokuMoviePlayer({
    tvIp: '192.0.2.15',
    mediaServerUrl: serverUrl,
    sideload: false,
  });
  assert.equal(rokuBuild.ok, true);
  const manifestTxt = fs.readFileSync(path.join(rokuBuild.targetDir, 'manifest'), 'utf8');
  assert.match(manifestTxt, /title=RobOS Movie Player/);
  assert.match(manifestTxt, /mm_icon_focus_fhd=pkg:\/images\/robos-poster-[0-9a-f]+_fhd\.png/);
  assert.match(manifestTxt, /splash_color=#FFFFFF/);
  const fhdPosterBuf = fs.readFileSync(path.join(rokuBuild.targetDir, 'images', 'channel-poster_fhd.png'));
  assert.equal(fhdPosterBuf[25], 2, 'Roku channel poster must be 24-bit opaque RGB (colorType=2) with no alpha channel');
  const sceneXml = fs.readFileSync(path.join(rokuBuild.targetDir, 'components', 'MainScene.xml'), 'utf8');
  assert.match(sceneXml, /id="playerOsdGroup"/);
  assert.match(sceneXml, /id="subtitleOverlayGroup"/);
  assert.match(sceneXml, /2\. CC CAPTIONS/);
  assert.match(sceneXml, /3\. SEE SEASON/);
  assert.match(sceneXml, /4\. SEE SHOW/);
  assert.match(sceneXml, /5\. EP DETAILS/);
  assert.match(sceneXml, /7\. METADATA/);
  const sceneBrs = fs.readFileSync(path.join(rokuBuild.targetDir, 'components', 'MainScene.brs'), 'utf8');
  assert.match(sceneBrs, /function handleCinemaVideoKeyEvent/);
  assert.match(sceneBrs, /sub jumpToNeighborCaption/);
  const embeddedLib = JSON.parse(fs.readFileSync(path.join(rokuBuild.targetDir, 'source', 'cinema-library.json'), 'utf8'));
  assert.equal(embeddedLib.active, true);
  assert.equal(embeddedLib.items.length, 3); // 2 movies + 1 grouped TV series
});

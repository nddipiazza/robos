/**
 * Partial-Range Tag & Header Reader for Cloud Media Files
 *
 * Fetches only the first 64 KB (and optionally the last 128 bytes)
 * of a remote cloud media file using HTTP `Range: bytes=0-65535`, then parses tags
 * in memory via `music-metadata` (`parseBuffer`).
 */

const https = require('https');
const { storeArtworkBuffer } = require('./track-metadata');

let mmPromise = null;
function getMM() {
  if (!mmPromise) mmPromise = import('music-metadata').catch(() => null);
  return mmPromise;
}

function fetchByteRange(options, start = 0, end = 65535) {
  return new Promise((resolve, reject) => {
    const headers = {
      ...(options.headers || {}),
      Range: `bytes=${start}-${end}`
    };
    const req = https.request({ ...options, headers }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redir = new URL(res.headers.location);
        fetchByteRange({
          hostname: redir.hostname,
          path: redir.pathname + redir.search,
          method: 'GET',
          headers: options.headers
        }, start, end).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200 && res.statusCode !== 206) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} on range fetch`));
        return;
      }
      const chunks = [];
      let received = 0;
      const maxLen = (end - start + 1);
      res.on('data', chunk => {
        chunks.push(chunk);
        received += chunk.length;
        if (received >= maxLen) {
          req.destroy();
        }
      });
      const finish = () => resolve(Buffer.concat(chunks).slice(0, maxLen));
      res.on('end', finish);
      res.on('close', finish);
    });
    req.on('error', reject);
    req.setTimeout(10000, () => req.destroy(new Error('Range request timeout')));
    req.end();
  });
}

async function enrichCloudTrackTags({ track, source, token, artDir = null, headBytes = 98304 }) {
  if (!track || !source || !token) return track;

  let reqOptions = null;
  if (source.type === 'google-drive') {
    const fileId = track.driveFileId || track.remotePath;
    reqOptions = {
      hostname: 'www.googleapis.com',
      path: `/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` }
    };
  } else if (source.type === 'onedrive') {
    const itemPath = track.onedriveItemId
      ? `/v1.0/me/drive/items/${encodeURIComponent(track.onedriveItemId)}/content`
      : `/v1.0/me/drive/root:${encodeURI(track.remotePath)}:/content`;
    reqOptions = {
      hostname: 'graph.microsoft.com',
      path: itemPath,
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` }
    };
  } else if (source.type === 'dropbox') {
    reqOptions = {
      hostname: 'content.dropboxapi.com',
      path: '/2/files/download',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Dropbox-API-Arg': JSON.stringify({ path: track.remotePath })
      }
    };
  } else {
    return track;
  }

  const buf = await fetchByteRange(reqOptions, 0, headBytes - 1);
  const mm = await getMM();
  if (!mm || !buf || buf.length === 0) return track;

  const metadata = await mm.parseBuffer(buf, {
    mimeType: `video/${track.format || 'mp4'}`,
    size: track.size || buf.length
  }, { duration: false, skipPostHeaders: true });

  if (metadata && metadata.common) {
    const c = metadata.common;
    if (c.title) track.title = c.title;
    if (c.artist) track.artist = c.artist;
    if (c.album) track.album = c.album;
    if (c.albumartist) track.albumArtist = c.albumartist;
    if (Array.isArray(c.genre) && c.genre[0]) track.genre = c.genre[0];
    if (c.year) track.year = c.year;
    if (c.track && c.track.no) track.trackNumber = c.track.no;
    if (artDir && Array.isArray(c.picture) && c.picture.length > 0) {
      const pic = c.picture[0];
      const raw = Buffer.isBuffer(pic.data) ? pic.data : Buffer.from(pic.data);
      track.artId = storeArtworkBuffer(artDir, raw, pic.format);
    }
  }
  if (metadata && metadata.format) {
    const f = metadata.format;
    if (f.bitrate) track.bitrate = Math.round(f.bitrate / 1000);
    if (f.sampleRate) track.sampleRate = f.sampleRate;
    if (f.codec) {
      track.codec = f.codec;
      track.videoCodec = f.codec;
    }
  }
  return track;
}

module.exports = {
  fetchByteRange,
  enrichCloudTrackTags
};

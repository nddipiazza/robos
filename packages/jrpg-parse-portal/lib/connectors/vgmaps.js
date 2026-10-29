'use strict';

// VGMaps.com atlas connector. The atlas index for a console lists every map
// image as a relative link; a game's maps share a file-name prefix such as
// "FinalFantasy-". Maps stay on VGMaps: the kgraph records their URLs, credit
// and (optionally) measured dimensions, and a local cache can hold copies.

const ATLAS_BASE = 'https://www.vgmaps.com/Atlas/';

class VGMapsConnector {
  constructor({ http, console: consoleName = 'NES' }) {
    this.http = http;
    this.console = consoleName;
    this.indexUrl = `${ATLAS_BASE}${consoleName}/index.htm`;
  }

  // [{ file, url, label }] for every map whose file name starts with `prefix`.
  async listMaps(prefix) {
    const res = await this.http.text(this.indexUrl);
    if (!res.ok) throw new Error(`VGMaps atlas: ${res.error}`);
    const seen = new Set();
    const out = [];
    const re = /href="([^"]+\.(?:png|gif|jpe?g))"/gi;
    let m;
    while ((m = re.exec(res.body))) {
      const href = m[1];
      if (/^https?:/i.test(href) || !href.startsWith(prefix) || seen.has(href)) continue;
      seen.add(href);
      const label = href.slice(prefix.length).replace(/\.(png|gif|jpe?g)$/i, '')
        .replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\(([^)]*)\)/g, ' ($1)').replace(/\s+/g, ' ').trim();
      out.push({ file: href, url: `${ATLAS_BASE}${this.console}/${encodeURI(href).replace(/'/g, '%27')}`, label });
    }
    return out;
  }

  attribution(map) {
    return {
      site: 'VGMaps.com',
      url: map.url,
      pageUrl: this.indexUrl,
      license: 'Fan-made map; credit VGMaps.com and the map author, do not re-host without permission',
      credit: `Map from the VGMaps.com ${this.console} atlas`,
    };
  }
}

// Width/height of a PNG or GIF from its header bytes (no image library needed).
function imageSize(buf) {
  if (!buf || buf.length < 24) return null;
  if (buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG') return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), format: 'png' };
  if (buf.toString('ascii', 0, 3) === 'GIF') return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8), format: 'gif' };
  return null;
}

module.exports = { VGMapsConnector, imageSize };

'use strict';

// RPGamer archive connector. RPGamer keeps the 1990s SquareNet fan pages for
// each game, including fan MIDI/MOD/S3M arrangements of the soundtrack with
// the arranger credited beside each file. Arranger e-mail links are dropped.

const ARCHIVE = 'https://archive.rpgamer.com';

function decode(s) {
  return String(s).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, "'").replace(/\s+/g, ' ').trim();
}

class RPGamerConnector {
  constructor({ http }) { this.http = http; }

  // Fan music files on a game's music page: [{ title, theme, variant, url, arranger, format }]
  async fanMusic(pageUrl) {
    const res = await this.http.text(pageUrl);
    if (!res.ok) throw new Error(`RPGamer: ${res.error}`);
    const out = [];
    let format = 'MIDI';
    // Each table row holds one file link and optionally its arranger.
    for (const row of res.body.split(/<tr[\s>]/i)) {
      const heading = row.match(/>\s*(MIDI|MOD|S3M|XM|IT|MP3)\s*</);
      const link = row.match(/<a href="([^"]+\.(?:mid|mod|s3m|xm|it|mp3|zip))"[^>]*>([\s\S]*?)<\/a>/i);
      if (heading && !link) { format = heading[1]; continue; }
      if (!link) continue;
      const title = decode(link[2]);
      const arranger = (row.match(/email-protection[^>]*>([\s\S]*?)<\/a>/i) || row.match(/<td[^>]*width=25%[^>]*>\s*([^<]+?)\s*<\/td>/i) || [])[1];
      const [theme, variant] = title.split(/\s*~\s*/);
      out.push({
        title, theme: theme.trim(), variant: (variant || '').replace(/[()]/g, '').trim(),
        url: new URL(link[1], pageUrl).href, arranger: arranger ? decode(arranger) : '',
        format: (link[1].match(/\.([a-z0-9]+)$/i) || [])[1]?.toUpperCase() || format,
      });
    }
    return out;
  }
}

module.exports = { RPGamerConnector, ARCHIVE };

'use strict';

// MediaWiki API connector (Fandom wikis, StrategyWiki, Data Crystal, ...).
// Uses the documented api.php endpoints: batched page wikitext through
// action=query&prop=revisions and image URLs through prop=imageinfo.

class MediaWikiConnector {
  constructor({ apiUrl, http, siteName, license = 'CC BY-SA 3.0', licenseUrl = 'https://creativecommons.org/licenses/by-sa/3.0/' }) {
    if (!apiUrl) throw new Error('MediaWikiConnector needs apiUrl');
    this.apiUrl = apiUrl;
    this.http = http;
    this.siteName = siteName || new URL(apiUrl).host;
    this.license = license;
    this.licenseUrl = licenseUrl;
    this.wikiBase = apiUrl.replace(/api\.php$/, 'wiki/');
  }

  pageUrl(title) {
    return this.wikiBase + encodeURIComponent(String(title).replace(/ /g, '_')).replace(/%2F/g, '/').replace(/%3A/g, ':');
  }

  query(params) {
    const qs = new URLSearchParams({ format: 'json', formatversion: '2', ...params });
    return `${this.apiUrl}?${qs.toString()}`;
  }

  // Wikitext for many pages, following redirects. Returns Map(requestedTitle → { title, wikitext, url, missing }).
  async pages(titles) {
    const out = new Map();
    const unique = [...new Set(titles.filter(Boolean))];
    for (let i = 0; i < unique.length; i += 40) {
      const batch = unique.slice(i, i + 40);
      const res = await this.http.json(this.query({ action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main', redirects: '1', titles: batch.join('|') }));
      if (!res.ok) throw new Error(`${this.siteName}: ${res.error}`);
      const q = res.body.query || {};
      const alias = new Map();
      for (const n of q.normalized || []) alias.set(n.to, n.from);
      for (const r of q.redirects || []) alias.set(r.to, alias.get(r.from) || r.from);
      for (const page of q.pages || []) {
        const requested = alias.get(page.title) || page.title;
        const wikitext = page.revisions?.[0]?.slots?.main?.content || '';
        const entry = { title: page.title, wikitext, url: this.pageUrl(page.title), missing: Boolean(page.missing) };
        out.set(requested, entry);
        out.set(page.title, entry);
      }
    }
    return out;
  }

  async page(title) {
    const map = await this.pages([title]);
    return map.get(title) || { title, wikitext: '', missing: true, url: this.pageUrl(title) };
  }

  // Direct file URLs (and sizes) for File: names. Returns Map(fileName → info).
  async imageInfo(fileNames) {
    const out = new Map();
    const unique = [...new Set(fileNames.filter(Boolean).map(f => f.replace(/^(File|Image):/i, '').trim()))];
    for (let i = 0; i < unique.length; i += 40) {
      const batch = unique.slice(i, i + 40).map(f => `File:${f}`);
      const res = await this.http.json(this.query({ action: 'query', prop: 'imageinfo', iiprop: 'url|size|mime|sha1', redirects: '1', titles: batch.join('|') }));
      if (!res.ok) throw new Error(`${this.siteName}: ${res.error}`);
      const q = res.body.query || {};
      const alias = new Map();
      for (const n of q.normalized || []) alias.set(n.to, n.from);
      for (const r of q.redirects || []) alias.set(r.to, alias.get(r.from) || r.from);
      for (const page of q.pages || []) {
        const ii = page.imageinfo?.[0];
        if (!ii) continue;
        const requested = (alias.get(page.title) || page.title).replace(/^File:/, '');
        const info = { file: page.title.replace(/^File:/, ''), url: ii.url, descriptionUrl: ii.descriptionurl, width: ii.width, height: ii.height, mime: ii.mime, sha1: ii.sha1 };
        out.set(requested, info);
        out.set(info.file, info);
        out.set(requested.replace(/_/g, ' '), info);
      }
    }
    return out;
  }

  // Members of a category (main namespace by default).
  async categoryMembers(category, { namespace = 0, limit = 500 } = {}) {
    const titles = [];
    let cont = null;
    do {
      const params = { action: 'query', list: 'categorymembers', cmtitle: category.startsWith('Category:') ? category : `Category:${category}`, cmnamespace: String(namespace), cmlimit: String(limit) };
      if (cont) params.cmcontinue = cont;
      const res = await this.http.json(this.query(params));
      if (!res.ok) throw new Error(`${this.siteName}: ${res.error}`);
      for (const m of res.body.query?.categorymembers || []) titles.push(m.title);
      cont = res.body.continue?.cmcontinue || null;
    } while (cont);
    return titles;
  }

  attribution(title) {
    return {
      site: this.siteName,
      url: this.pageUrl(title),
      license: this.license,
      licenseUrl: this.licenseUrl,
      credit: `Text from "${title}" on ${this.siteName}, ${this.license}`,
    };
  }
}

module.exports = { MediaWikiConnector };

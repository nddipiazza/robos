'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { plan, validateCatalog, ORIGIN } = require('./catalog.cjs');
const { download, extract } = require('./download.cjs');
class Manager extends EventEmitter {
  constructor({ locations, native, version, platform = process.platform, arch = process.arch, downloader = download, extractor = extract, logger = { info() {}, error() {} } }) {
    super(); Object.assign(this, { locations, native, version, platform, arch, downloader, extractor, logger });
    this.file = path.join(locations.root, 'installed.json'); this.busy = false;
    fs.mkdirSync(locations.root, { recursive: true });
    this.installed = fs.existsSync(this.file) ? JSON.parse(fs.readFileSync(this.file, 'utf8')) : {};
    // A killed process leaves a transaction journal; restore the pre-install directory/state.
    this.recover();
  }
  save() { fs.writeFileSync(`${this.file}.tmp`, JSON.stringify(this.installed, null, 2)); fs.renameSync(`${this.file}.tmp`, this.file); }
  recover() {
    const journal = path.join(this.locations.root, 'transaction.json');
    if (!fs.existsSync(journal)) return;
    const { item, before, committed } = JSON.parse(fs.readFileSync(journal, 'utf8'));
    const destination = this.destination(item), backup = `${destination}.previous`;
    if (!committed) {
      if (fs.existsSync(backup)) { fs.rmSync(destination, { recursive: true, force: true }); fs.renameSync(backup, destination); }
      else if (!before) fs.rmSync(destination, { recursive: true, force: true });
      if (before) { this.installed[item.id] = before; if (before.kind === 'app') this.native.shortcut(before); }
      else { delete this.installed[item.id]; if (item.kind === 'app') this.native.shortcut(item, true); }
      this.save();
    } else fs.rmSync(backup, { recursive: true, force: true });
    fs.rmSync(journal);
  }
  destination(item) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.id) || !['app', 'library', 'data'].includes(item.kind)) throw new Error('Invalid component');
    if (item.kind === 'data') {
      if (item.id === 'graph-data') return path.join(this.locations.root, '.robos');
      if (item.id.startsWith('game-data-')) return path.join(this.locations.root, 'games', item.id.slice(10));
      throw new Error('Unknown data component');
    }
    return path.join(this.locations.root, 'packages', item.id);
  }
  async refresh() {
    if (this.busy) throw new Error('An installation is already in progress');
    const url = `${ORIGIN}v${this.version}/robos-catalog-${this.platform}-${this.arch}.json`;
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`App catalog unavailable (${response.status}). Check your connection and that this release has app downloads.`);
    const raw = await response.text();
    if (raw.length > 2 * 1024 ** 2) throw new Error('Catalog too large');
    const doc = validateCatalog(JSON.parse(raw), this.platform, this.arch);
    if (doc.version !== this.version) throw new Error('Catalog release does not match this manager');
    this.catalog = doc;
    fs.writeFileSync(path.join(this.locations.root, 'catalog.json'), raw);
    return this.state();
  }
  state() { return { catalog: this.catalog, installed: this.installed, busy: this.busy, platform: this.platform, version: this.version }; }
  loadCached() {
    const cache = path.join(this.locations.root, 'catalog.json');
    if (fs.existsSync(cache)) {
      const doc = validateCatalog(JSON.parse(fs.readFileSync(cache, 'utf8')), this.platform, this.arch);
      if (doc.version === this.version) this.catalog = doc;
    }
    return this.state();
  }
  preview(ids) {
    if (!this.catalog) throw new Error('Refresh the app catalog first');
    for (const id of ids) if (!this.catalog.components.some(item => item.id === id && item.kind === 'app')) throw new Error('Select an app from the catalog');
    const items = plan(this.catalog, ids, this.installed);
    return { items, bytes: items.reduce((n, item) => n + item.bytes, 0), unpackedBytes: items.reduce((n, item) => n + item.unpackedBytes, 0) };
  }
  async exclusive(work) {
    if (this.busy) throw new Error('Another operation is in progress');
    this.busy = true; this.controller = new AbortController(); this.emit('state', this.state());
    try { await work(); }
    catch (error) { this.logger.error({ err: error }, 'App operation failed'); throw error; }
    finally { this.busy = false; this.controller = null; this.emit('state', this.state()); }
    return this.state();
  }
  cancel() { this.controller?.abort(); }
  async install(ids) {
    const { items } = this.preview(ids);
    return this.exclusive(async () => {
      for (const item of items) {
        this.controller.signal.throwIfAborted();
        const space = fs.statfsSync(this.locations.root);
        if (space.bavail * space.bsize < item.bytes + item.unpackedBytes * 2 + 64 * 1024 ** 2) throw new Error('Not enough free disk space for this installation');
        const staging = fs.mkdtempSync(path.join(this.locations.root, '.install-'));
        try {
          const archive = path.join(staging, 'download.tgz'), payload = path.join(staging, 'payload'); fs.mkdirSync(payload);
          await this.downloader(item, archive, event => this.emit('progress', event), this.controller.signal);
          this.controller.signal.throwIfAborted(); this.emit('progress', { id: item.id, phase: 'Verifying and installing' });
          await this.extractor(archive, payload, item.unpackedBytes);
          this.controller.signal.throwIfAborted();
          if (item.kind !== 'data' && !fs.existsSync(path.join(payload, 'package.json'))) throw new Error('App download is missing package.json');
          const destination = this.destination(item), backup = `${destination}.previous`, before = this.installed[item.id];
          fs.mkdirSync(path.dirname(destination), { recursive: true });
          const journal = path.join(this.locations.root, 'transaction.json');
          const tx = { item, before: before || null, committed: false };
          fs.writeFileSync(journal, JSON.stringify(tx));
          try {
            if (fs.existsSync(destination)) fs.renameSync(destination, backup);
            fs.renameSync(payload, destination);
            if (item.kind === 'app') this.native.shortcut(item);
            this.installed[item.id] = { ...item, installedAt: new Date().toISOString() }; this.save();
            fs.writeFileSync(journal, JSON.stringify({ ...tx, committed: true }));
            fs.rmSync(backup, { recursive: true, force: true }); fs.rmSync(journal);
          } catch (error) { this.recover(); throw error; }
          this.logger.info({ id: item.id, version: item.version }, 'Installed app component'); this.emit('state', this.state());
        } finally { fs.rmSync(staging, { recursive: true, force: true }); }
      }
      return this.state();
    });
  }
  async uninstall(id) {
    return this.exclusive(async () => {
      const item = this.installed[id];
      if (!item || item.kind !== 'app') throw new Error('App is not installed');
      if (Object.values(this.installed).some(other => other.dependencies.includes(id))) throw new Error('Another installed app needs this app. Remove that app first.');
      const remove = entry => { this.native.shortcut(entry, true); fs.rmSync(this.destination(entry), { recursive: true, force: true }); delete this.installed[entry.id]; this.save(); };
      remove(item);
      // Reclaim shared packages only when no installed app needs them, including transitive dependencies.
      let unused;
      do {
        unused = Object.values(this.installed).filter(entry => entry.kind !== 'app' && !Object.values(this.installed).some(other => other.dependencies.includes(entry.id)));
        for (const entry of unused) { fs.rmSync(this.destination(entry), { recursive: true, force: true }); delete this.installed[entry.id]; this.save(); }
      } while (unused.length);
      return this.state();
    });
  }
  async removeAll() {
    return this.exclusive(async () => {
      this.native.removeAll(); fs.rmSync(this.locations.root, { recursive: true, force: true }); this.installed = {};
    });
  }
}
module.exports = { Manager };

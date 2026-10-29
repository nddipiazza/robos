'use strict';

// JRPG Parse Portal: turn fan resources for a classic JRPG into a kgraph
// folder that holds everything a remake needs. A game profile knows its fan
// sources and how to read them; the portal runs it, records provenance and
// coverage, and writes the folder.

const fs = require('fs');
const path = require('path');
const { HttpCache } = require('./http-cache');
const { writeKgraphFolder } = require('./kgraph-writer');
const { ASSET_TYPES, coverage } = require('./asset-types');

const PROFILES = {
  'dragon-warrior-usa': () => require('./profiles/dragon-warrior-usa'),
  'final-fantasy-usa': () => require('./profiles/final-fantasy-usa'),
};

function listProfiles() {
  return Object.keys(PROFILES).map(key => {
    const p = PROFILES[key]();
    return { id: p.id, title: p.title, platform: p.platform, region: p.region, year: p.year, description: p.description, sources: p.sources };
  });
}

function getProfile(id) {
  const load = PROFILES[id];
  if (!load) throw new Error(`Unknown game profile "${id}". Known: ${Object.keys(PROFILES).join(', ')}`);
  return load();
}

// What the profile plans to read, per asset type: which sources cover it.
function plan(profileId) {
  const p = getProfile(profileId);
  return ASSET_TYPES.map(a => ({
    ...a,
    sources: (p.sources || []).filter(s => (s.assetTypes || []).includes(a.id)).map(s => ({ title: s.title, url: s.url, kind: s.kind, status: s.status || 'planned' })),
  }));
}

async function acquire({ profileId, outDir, cacheDir, copyAssets = true, downloadImages = false, measureMaps = true, extraSources = [], log = () => {}, fetchImpl, minIntervalMs } = {}) {
  if (!outDir) throw new Error('acquire needs outDir');
  const profile = getProfile(profileId);
  fs.mkdirSync(outDir, { recursive: true });
  const cacheBase = cacheDir || path.join(outDir, 'cache');
  const http = new HttpCache({ cacheDir: path.join(cacheBase, 'http'), fetchImpl, log, ...(minIntervalMs !== undefined ? { minIntervalMs } : {}) });
  const started = Date.now();
  log(`Acquiring ${profile.title} (${profile.platform} ${profile.region})`);
  const result = await profile.acquire({ http, log, outDir, copyAssets, downloadImages, measureMaps, cacheDir: cacheBase });
  const sources = [...result.sources, ...extraSources];
  const written = writeKgraphFolder(outDir, { game: result.game, nodes: result.nodes, sources, warnings: result.warnings, profileId });
  written.renderers = installSiteRenderers(outDir);
  log(`Wrote ${written.nodeCount} nodes in ${written.packages.length} packages to ${outDir} (${((Date.now() - started) / 1000).toFixed(1)}s, ${http.stats.network} requests, ${http.stats.cached} cached)`);
  return { ...written, http: http.stats };
}

// The JRPG renderer pack travels with every kgraph folder (site/renderers),
// so KGraph Explorer's Pages builder draws maps, enemies and the story with
// them. Renderers written later by an agent or by hand are left alone.
const RENDERER_PACK = path.join(__dirname, '..', 'site-renderers');
function installSiteRenderers(outDir) {
  const dest = path.join(outDir, 'site', 'renderers');
  fs.mkdirSync(dest, { recursive: true });
  const files = fs.readdirSync(RENDERER_PACK).filter(f => f.endsWith('.js'));
  for (const f of files) fs.copyFileSync(path.join(RENDERER_PACK, f), path.join(dest, f));
  return files;
}

module.exports = { installSiteRenderers, listProfiles, getProfile, plan, acquire, coverage };

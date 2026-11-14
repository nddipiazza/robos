'use strict';

/**
 * RobOS DAW Studio — Custom VST / LV2 / CLAP / Sample Library Directory Manager
 *
 * Persists user-configured plugin and sample pack directories in:
 *   ~/.config/robos/daw-studio/vst-directories.json
 *   (or $ROBOS_DAW_CONFIG_DIR/vst-directories.json in hermetic tests)
 *
 * Never copies or commits audio binaries (.wav / .flac) or VST binaries into git;
 * external directories are indexed in-place on disk.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const AUDIO_SAMPLE_EXTS = new Set(['.wav', '.flac', '.ogg', '.mp3']);

function getDawConfigRoot() {
  if (process.env.ROBOS_DAW_CONFIG_DIR) return process.env.ROBOS_DAW_CONFIG_DIR;
  const home = process.env.HOME || os.homedir();
  return path.join(home, '.config', 'robos', 'daw-studio');
}

function getVstDirectoriesConfigPath() {
  return path.join(getDawConfigRoot(), 'vst-directories.json');
}

function expandUserPath(rawPath) {
  const trimmed = String(rawPath || '').trim();
  if (!trimmed) return '';
  const home = process.env.HOME || os.homedir();
  if (trimmed === '~') return home;
  if (trimmed.startsWith('~/')) return path.join(home, trimmed.slice(2));
  return path.resolve(trimmed);
}

function slugifyId(text) {
  return String(text || 'custom')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42) || 'custom';
}

function makeCustomKitId(resolvedDir) {
  const baseSlug = slugifyId(path.basename(resolvedDir));
  const shortHash = crypto.createHash('sha1').update(resolvedDir).digest('hex').slice(0, 6);
  return `custom-dir-${baseSlug}-${shortHash}`;
}

function loadVstDirectoriesConfig() {
  const cfgPath = getVstDirectoriesConfigPath();
  try {
    if (fs.existsSync(cfgPath)) {
      const parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      const dirs = Array.isArray(parsed?.directories) ? parsed.directories : [];
      const seen = new Set();
      const normalized = [];
      for (const item of dirs) {
        const raw = typeof item === 'string' ? item : item?.path;
        const resolved = expandUserPath(raw);
        if (!resolved || seen.has(resolved)) continue;
        seen.add(resolved);
        normalized.push({
          path: resolved,
          label: String(item?.label || path.basename(resolved) || resolved),
          addedAt: item?.addedAt || new Date().toISOString(),
          enabled: item?.enabled !== false,
        });
      }
      return { schema: 1, directories: normalized };
    }
  } catch {}
  return { schema: 1, directories: [] };
}

function saveVstDirectoriesConfig(cfg) {
  const cfgPath = getVstDirectoriesConfigPath();
  fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
  const payload = {
    schema: 1,
    updatedAt: new Date().toISOString(),
    directories: Array.isArray(cfg?.directories) ? cfg.directories : [],
  };
  fs.writeFileSync(cfgPath, JSON.stringify(payload, null, 2), 'utf8');
  return payload;
}

function getConfiguredVstDirectoryPaths({ includeDisabled = false } = {}) {
  const cfg = loadVstDirectoriesConfig();
  return cfg.directories
    .filter(d => includeDisabled || d.enabled !== false)
    .map(d => d.path);
}

function addVstDirectory(dirPath, { label } = {}) {
  const resolved = expandUserPath(dirPath);
  if (!resolved) {
    throw new Error('Directory path cannot be empty.');
  }
  if (!fs.existsSync(resolved)) {
    throw new Error(`Directory does not exist: ${resolved}`);
  }
  const st = fs.statSync(resolved);
  if (!st.isDirectory()) {
    throw new Error(`Path is not a directory: ${resolved}`);
  }

  const cfg = loadVstDirectoriesConfig();
  const existing = cfg.directories.find(d => d.path === resolved);
  if (existing) {
    existing.enabled = true;
    if (label) existing.label = String(label);
  } else {
    cfg.directories.push({
      path: resolved,
      label: String(label || path.basename(resolved) || resolved),
      addedAt: new Date().toISOString(),
      enabled: true,
    });
  }
  saveVstDirectoriesConfig(cfg);
  return existing || cfg.directories[cfg.directories.length - 1];
}

function removeVstDirectory(dirPath) {
  const resolved = expandUserPath(dirPath);
  const cfg = loadVstDirectoriesConfig();
  const before = cfg.directories.length;
  cfg.directories = cfg.directories.filter(d => d.path !== resolved && d.path !== String(dirPath || '').trim());
  saveVstDirectoriesConfig(cfg);
  return { removed: cfg.directories.length < before, directories: cfg.directories };
}

function toggleVstDirectory(dirPath, enabled) {
  const resolved = expandUserPath(dirPath);
  const cfg = loadVstDirectoriesConfig();
  const target = cfg.directories.find(d => d.path === resolved);
  if (target) {
    target.enabled = Boolean(enabled);
    saveVstDirectoriesConfig(cfg);
  }
  return cfg;
}

function getDefaultLinuxPluginSearchPaths() {
  const home = process.env.HOME || os.homedir();
  return [
    { path: path.join(home, '.vst3'), formatHint: 'VST3', scope: 'user' },
    { path: path.join(home, '.vst'), formatHint: 'VST2', scope: 'user' },
    { path: path.join(home, '.lv2'), formatHint: 'LV2', scope: 'user' },
    { path: path.join(home, '.clap'), formatHint: 'CLAP', scope: 'user' },
    { path: '/usr/lib/vst3', formatHint: 'VST3', scope: 'system' },
    { path: '/usr/local/lib/vst3', formatHint: 'VST3', scope: 'system' },
    { path: '/usr/lib/vst', formatHint: 'VST2', scope: 'system' },
    { path: '/usr/local/lib/vst', formatHint: 'VST2', scope: 'system' },
    { path: '/usr/lib/lv2', formatHint: 'LV2', scope: 'system' },
    { path: '/usr/local/lib/lv2', formatHint: 'LV2', scope: 'system' },
    { path: '/usr/lib/x86_64-linux-gnu/lv2', formatHint: 'LV2', scope: 'system' },
    { path: '/usr/lib/clap', formatHint: 'CLAP', scope: 'system' },
    { path: '/usr/local/lib/clap', formatHint: 'CLAP', scope: 'system' },
    { path: '/usr/lib/ladspa', formatHint: 'LADSPA', scope: 'system' },
    { path: '/usr/lib/x86_64-linux-gnu/ladspa', formatHint: 'LADSPA', scope: 'system' },
  ];
}

/**
 * Recursively scan a directory up to maxDepth for VST3/VST2/LV2/CLAP/LADSPA/SFZ plugins
 * and lossless/WAV audio samples (.wav, .flac, .ogg, .mp3).
 */
function scanDirectoryForPluginsAndSamples(rootDir, { maxDepth = 4, formatHint = '' } = {}) {
  const plugins = [];
  const sampleFiles = [];
  if (!rootDir || !fs.existsSync(rootDir)) {
    return { exists: false, plugins, sampleFiles };
  }

  const IGNORED_DIRS = new Set(['node_modules', '.git', '__MACOSX', '.Trash']);

  function walk(curDir, depth) {
    if (depth > maxDepth) return;
    let entries = [];
    try {
      entries = fs.readdirSync(curDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const name = entry.name;
      if (!name || IGNORED_DIRS.has(name)) continue;
      if (depth > 0 && name.startsWith('.')) continue;

      const fullPath = path.join(curDir, name);
      const lower = name.toLowerCase();
      const ext = path.extname(lower);

      let isDir = entry.isDirectory();
      let isFile = entry.isFile();
      if (entry.isSymbolicLink()) {
        try {
          const st = fs.statSync(fullPath);
          isDir = st.isDirectory();
          isFile = st.isFile();
        } catch {
          continue;
        }
      }

      // Bundle directories (.vst3, .lv2, .clap) count as single plugin units — do not recurse into bundle internals
      if (isDir && (ext === '.vst3' || ext === '.lv2' || ext === '.clap')) {
        const format = ext === '.vst3' ? 'VST3' : ext === '.lv2' ? 'LV2' : 'CLAP';
        plugins.push({
          name: path.basename(name, path.extname(name)),
          fileName: name,
          format,
          path: fullPath,
          rootDir,
        });
        continue;
      }

      if (isFile) {
        if (ext === '.vst3') {
          plugins.push({ name: path.basename(name, path.extname(name)), fileName: name, format: 'VST3', path: fullPath, rootDir });
        } else if (ext === '.clap') {
          plugins.push({ name: path.basename(name, path.extname(name)), fileName: name, format: 'CLAP', path: fullPath, rootDir });
        } else if (ext === '.sfz' || ext === '.sf2') {
          plugins.push({ name: path.basename(name, path.extname(name)), fileName: name, format: ext === '.sf2' ? 'SF2' : 'SFZ', path: fullPath, rootDir });
        } else if (ext === '.so') {
          const fmt = formatHint === 'LADSPA' || curDir.toLowerCase().includes('ladspa') ? 'LADSPA' : 'VST2';
          plugins.push({ name: path.basename(name, path.extname(name)), fileName: name, format: fmt, path: fullPath, rootDir });
        } else if (AUDIO_SAMPLE_EXTS.has(ext)) {
          sampleFiles.push(fullPath);
        }
        continue;
      }

      if (isDir) {
        walk(fullPath, depth + 1);
      }
    }
  }

  walk(rootDir, 0);
  sampleFiles.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  plugins.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  return { exists: true, plugins, sampleFiles };
}

function classifyDrumSampleCategory(filePath) {
  const base = path.basename(filePath, path.extname(filePath)).toLowerCase();
  const folder = path.basename(path.dirname(filePath)).toLowerCase();
  const token = `${folder} ${base}`;

  if (/\b(open[-_ ]?hat|openhat|hh[-_ ]?open|hihat[-_ ]?open|oh)\b/.test(token) || /^openhat/.test(base)) {
    return 'hihat-open';
  }
  if (/\b(hi[-_ ]?hat|hihat|closed[-_ ]?hat|chat|hh)\b/.test(token) || /^hihat/.test(base)) {
    return 'hihat';
  }
  if (/\b(kick|bass[-_ ]?drum|bd)\b/.test(token) || /^kick/.test(base)) {
    return 'kick';
  }
  if (/\b(snare|rimshot|sidestick|sd)\b/.test(token) || /^snare/.test(base)) {
    return 'snare';
  }
  if (/\b(tom|rototom|floortom|racktom)\b/.test(token) || /^tom/.test(base)) {
    return 'tom';
  }
  if (/\b(ride)\b/.test(token) || /^ride/.test(base)) {
    return 'ride';
  }
  if (/\b(crash|cymbal|china|splash)\b/.test(token) || /^(crash|cymbal|splash|china)/.test(base)) {
    return 'cymbal';
  }
  if (/\b(clap|handclap)\b/.test(token) || /^clap/.test(base)) {
    return 'clap';
  }
  if (/\b(cowbell)\b/.test(token) || /^cowbell/.test(base)) {
    return 'cowbell';
  }
  if (/\b(shaker|tamb|maraca|cabasa)\b/.test(token) || /^shaker/.test(base)) {
    return 'shaker';
  }
  return 'perc';
}

function acousticPreferenceScore(filePath) {
  const base = path.basename(filePath, path.extname(filePath)).toLowerCase();
  let score = 0;
  if (base.includes('acoustic')) score += 100;
  if (base.includes('classic') || base.includes('studio') || base.includes('natural')) score += 60;
  if (base.includes('punch') || base.includes('tight') || base.includes('big') || base.includes('heavy')) score += 40;
  if (base.includes('dry') || base.includes('plain')) score += 20;
  if (base.includes('808') || base.includes('909') || base.includes('electro') || base.includes('chiptune') || base.includes('zapper') || base.includes('noise') || base.includes('dist')) {
    score -= 25;
  }
  return score;
}

function makeVelocityLayersFromFiles(rootDir, chosenFiles) {
  const count = chosenFiles.length;
  if (!count) return [];
  return chosenFiles.map((fullPath, idx) => {
    const min = idx === 0 ? 0 : Number((idx / count).toFixed(3));
    const max = idx === count - 1 ? 1.0 : Number(((idx + 1) / count).toFixed(3));
    return {
      min,
      max,
      file: path.relative(rootDir, fullPath),
      localPath: fullPath,
      exists: true,
    };
  });
}

/**
 * Convert a user-added directory containing WAV/FLAC/OGG/MP3 files into a full
 * RobOS DAW Studio Drum Sound Replacement Kit with both canonical piece aliases
 * (kick, snare, tom-rack, tom-mid, tom-floor, hihat, hihat-open, cymbal, ride)
 * AND individual selectable entries for every sample in the pack.
 */
function buildCustomSampleKitFromDirectory(dirEntry, sampleFiles) {
  const rootDir = dirEntry.path;
  const buckets = {
    kick: [],
    snare: [],
    tom: [],
    hihat: [],
    'hihat-open': [],
    cymbal: [],
    ride: [],
    clap: [],
    cowbell: [],
    shaker: [],
    perc: [],
  };

  for (const filePath of sampleFiles) {
    const cat = classifyDrumSampleCategory(filePath);
    (buckets[cat] || buckets.perc).push(filePath);
  }

  const pickBest = (arr, limit = 2) => {
    if (!arr.length) return [];
    const ranked = [...arr].sort((a, b) => {
      const diff = acousticPreferenceScore(b) - acousticPreferenceScore(a);
      if (diff !== 0) return diff;
      return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    });
    return ranked.slice(0, limit);
  };

  const pieces = {};

  const registerCanonical = (pieceId, labelPrefix, files) => {
    if (!files || !files.length) return;
    const summaryNames = files.map(f => path.basename(f, path.extname(f))).join(' / ');
    pieces[pieceId] = {
      id: pieceId,
      label: `${labelPrefix} (${summaryNames})`,
      ready: true,
      isCanonical: true,
      layers: makeVelocityLayersFromFiles(rootDir, files),
    };
  };

  registerCanonical('kick', 'Kick Drum', pickBest(buckets.kick, 2));
  registerCanonical('snare', 'Snare Drum', pickBest(buckets.snare, 2));

  const rankedToms = pickBest(buckets.tom, 6);
  if (rankedToms.length >= 3) {
    registerCanonical('tom-rack', 'High / Rack Tom', [rankedToms[0]]);
    registerCanonical('tom-mid', 'Mid Tom', [rankedToms[1]]);
    registerCanonical('tom-floor', 'Floor Tom', [rankedToms[2]]);
  } else if (rankedToms.length === 2) {
    registerCanonical('tom-rack', 'High / Rack Tom', [rankedToms[0]]);
    registerCanonical('tom-mid', 'Mid Tom', [rankedToms[1]]);
    registerCanonical('tom-floor', 'Floor Tom', [rankedToms[1]]);
  } else if (rankedToms.length === 1) {
    registerCanonical('tom-rack', 'High / Rack Tom', [rankedToms[0]]);
    registerCanonical('tom-floor', 'Floor Tom', [rankedToms[0]]);
  }

  registerCanonical('hihat', 'Closed Hi-Hat', pickBest(buckets.hihat, 2));
  registerCanonical('hihat-open', 'Open Hi-Hat', pickBest(buckets['hihat-open'].length ? buckets['hihat-open'] : buckets.hihat, 1));
  registerCanonical('cymbal', 'Crash Cymbal', pickBest(buckets.cymbal, 1));
  registerCanonical('ride', 'Ride Cymbal', pickBest(buckets.ride.length ? buckets.ride : buckets.cymbal, 1));

  // Also expose every individual sample in the pack so the user can pick & audition any exact file
  const categoryBadges = {
    kick: 'Kick',
    snare: 'Snare',
    tom: 'Tom',
    hihat: 'Hi-Hat',
    'hihat-open': 'Open Hat',
    cymbal: 'Cymbal',
    ride: 'Ride',
    clap: 'Clap',
    cowbell: 'Cowbell',
    shaker: 'Shaker',
    perc: 'Perc',
  };

  const usedIds = new Set(Object.keys(pieces));
  for (const fullPath of sampleFiles) {
    const baseName = path.basename(fullPath, path.extname(fullPath));
    const cat = classifyDrumSampleCategory(fullPath);
    const badge = categoryBadges[cat] || 'Sample';
    let pieceId = `sample-${slugifyId(baseName)}`;
    if (usedIds.has(pieceId)) {
      const relSlug = slugifyId(path.relative(rootDir, fullPath));
      pieceId = `sample-${relSlug}`;
    }
    usedIds.add(pieceId);

    pieces[pieceId] = {
      id: pieceId,
      label: `[${badge}] ${baseName}`,
      ready: true,
      isCanonical: false,
      layers: [
        {
          min: 0,
          max: 1.0,
          file: path.relative(rootDir, fullPath),
          localPath: fullPath,
          exists: true,
        },
      ],
    };
  }

  return {
    id: makeCustomKitId(rootDir),
    name: dirEntry.label || path.basename(rootDir),
    author: 'Local Sample Directory',
    license: 'Custom Dir',
    sourceUrl: rootDir,
    description: `Indexed from ${rootDir}`,
    installed: true,
    isCustomDirectory: true,
    customDirPath: rootDir,
    sampleCount: sampleFiles.length,
    kitDir: rootDir,
    pieces,
  };
}

function getCustomDirectorySampleKits() {
  const cfg = loadVstDirectoriesConfig();
  const kits = [];
  for (const dirEntry of cfg.directories) {
    if (dirEntry.enabled === false) continue;
    const scan = scanDirectoryForPluginsAndSamples(dirEntry.path);
    if (scan.exists && scan.sampleFiles.length > 0) {
      kits.push(buildCustomSampleKitFromDirectory(dirEntry, scan.sampleFiles));
    }
  }
  return kits;
}

function getVstDirectoriesSnapshot() {
  const cfg = loadVstDirectoriesConfig();
  const customDirectories = cfg.directories.map(dirEntry => {
    const scan = dirEntry.enabled === false
      ? { exists: fs.existsSync(dirEntry.path), plugins: [], sampleFiles: [] }
      : scanDirectoryForPluginsAndSamples(dirEntry.path);
    const formats = Array.from(new Set([
      ...scan.plugins.map(p => p.format),
      ...(scan.sampleFiles.length > 0 ? ['SAMPLES'] : []),
    ]));
    return {
      ...dirEntry,
      exists: scan.exists,
      pluginCount: scan.plugins.length,
      sampleCount: scan.sampleFiles.length,
      formats,
      kitId: scan.sampleFiles.length > 0 ? makeCustomKitId(dirEntry.path) : null,
      plugins: scan.plugins,
    };
  });

  const systemPaths = getDefaultLinuxPluginSearchPaths().map(sp => {
    const scan = scanDirectoryForPluginsAndSamples(sp.path, { maxDepth: 2, formatHint: sp.formatHint });
    return {
      ...sp,
      exists: scan.exists,
      pluginCount: scan.plugins.length,
      plugins: scan.plugins,
    };
  });

  const discoveredPlugins = [
    ...customDirectories.flatMap(d => d.plugins.map(p => ({ ...p, source: 'custom' }))),
    ...systemPaths.flatMap(s => s.plugins.map(p => ({ ...p, source: s.scope }))),
  ];

  return {
    configPath: getVstDirectoriesConfigPath(),
    customDirectories,
    systemPaths,
    discoveredPlugins,
    totalCustomDirs: customDirectories.length,
    totalPlugins: discoveredPlugins.length,
    totalCustomSamples: customDirectories.reduce((sum, d) => sum + d.sampleCount, 0),
  };
}

module.exports = {
  getDawConfigRoot,
  getVstDirectoriesConfigPath,
  expandUserPath,
  makeCustomKitId,
  loadVstDirectoriesConfig,
  saveVstDirectoriesConfig,
  getConfiguredVstDirectoryPaths,
  addVstDirectory,
  removeVstDirectory,
  toggleVstDirectory,
  getDefaultLinuxPluginSearchPaths,
  scanDirectoryForPluginsAndSamples,
  classifyDrumSampleCategory,
  buildCustomSampleKitFromDirectory,
  getCustomDirectorySampleKits,
  getVstDirectoriesSnapshot,
};

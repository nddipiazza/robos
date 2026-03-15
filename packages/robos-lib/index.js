'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Canonical RobOS app category registry.
 *
 * Each entry:
 *   id     — the value written in X-RobOS-Category= (simple ASCII, no spaces)
 *   label  — human-readable label shown in menus
 *   emoji  — decorative prefix used in the GTK app menu
 *   order  — sort position (lower = higher in the menu)
 */
const CATEGORIES = [
  { id: 'Dev',      label: 'Dev',             emoji: '💻', order: 1 },
  { id: 'AI',       label: 'AI & Agents',     emoji: '🤖', order: 2 },
  { id: 'Security', label: 'Security',         emoji: '🔒', order: 3 },
  { id: 'People',   label: 'People & Org',     emoji: '👥', order: 4 },
  { id: 'Journal',  label: 'Info & Journal',   emoji: '📓', order: 5 },
  { id: 'System',   label: 'System',           emoji: '🖥',  order: 6 },
  { id: 'Internet', label: 'Internet',          emoji: '🌐', order: 7 },
  { id: 'Tools',    label: 'Terminal & Code',  emoji: '⚙',  order: 8 },
];

const VALID_CATEGORY_IDS = new Set(CATEGORIES.map(c => c.id));

/**
 * Parse a freedesktop .desktop file into a key→value map.
 * Only keys from the [Desktop Entry] section are returned.
 */
function parseDesktopFile(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  const kv = {};
  let inDesktopEntry = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (line === '[Desktop Entry]') { inDesktopEntry = true; continue; }
    if (line.startsWith('[') && line.endsWith(']')) { inDesktopEntry = false; continue; }
    if (!inDesktopEntry || !line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    kv[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return kv;
}

/**
 * Validate a RobOS .desktop file.
 *
 * Throws a descriptive Error if:
 *   - X-RobOS-App is not "true"
 *   - X-RobOS-Category is missing or not one of the canonical category IDs
 *   - Name is missing
 *   - Exec is missing
 *
 * Returns { name, category, exec } on success.
 */
function validateDesktopFile(filePath) {
  let kv;
  try {
    kv = parseDesktopFile(filePath);
  } catch (err) {
    throw new Error(`Cannot read ${filePath}: ${err.message}`);
  }

  const errors = [];

  if (kv['X-RobOS-App'] !== 'true') {
    errors.push('Missing or incorrect X-RobOS-App=true');
  }

  const cat = kv['X-RobOS-Category'];
  if (!cat) {
    errors.push(
      `Missing X-RobOS-Category (must be one of: ${[...VALID_CATEGORY_IDS].join(', ')})`
    );
  } else if (!VALID_CATEGORY_IDS.has(cat)) {
    errors.push(
      `Invalid X-RobOS-Category="${cat}" — must be one of: ${[...VALID_CATEGORY_IDS].join(', ')}`
    );
  }

  if (!kv['Name']) errors.push('Missing Name=');
  if (!kv['Exec']) errors.push('Missing Exec=');

  if (errors.length) {
    throw new Error(`${path.basename(filePath)} validation failed:\n  • ${errors.join('\n  • ')}`);
  }

  return { name: kv['Name'], category: cat, exec: kv['Exec'] };
}

/**
 * Scan a directory for .desktop files that have X-RobOS-App=true.
 * Returns an array of objects: { name, category, exec, filePath }
 * sorted by category order then name.
 */
function loadRobOSApps(desktopDir) {
  const dir = desktopDir || '/usr/local/share/applications';
  let files;
  try {
    files = fs.readdirSync(dir).filter(f => f.endsWith('.desktop'));
  } catch (_) {
    return [];
  }

  const apps = [];
  for (const file of files) {
    const fp = path.join(dir, file);
    let kv;
    try { kv = parseDesktopFile(fp); } catch (_) { continue; }

    if (kv['X-RobOS-App'] !== 'true') continue;
    if (!kv['X-RobOS-Category'] || !VALID_CATEGORY_IDS.has(kv['X-RobOS-Category'])) continue;
    if (!kv['Name'] || !kv['Exec']) continue;

    apps.push({
      name:     kv['Name'],
      category: kv['X-RobOS-Category'],
      exec:     kv['Exec'],
      filePath: fp,
    });
  }

  const catOrder = Object.fromEntries(CATEGORIES.map(c => [c.id, c.order]));
  apps.sort((a, b) => {
    const co = (catOrder[a.category] || 99) - (catOrder[b.category] || 99);
    return co !== 0 ? co : a.name.localeCompare(b.name);
  });

  return apps;
}

/**
 * Group the result of loadRobOSApps() into category buckets.
 * Returns an array of { category: {id,label,emoji,order}, apps: [...] }
 * in category order.
 */
function groupByCategory(apps) {
  const byId = {};
  for (const app of apps) {
    if (!byId[app.category]) byId[app.category] = [];
    byId[app.category].push(app);
  }

  return CATEGORIES
    .filter(c => byId[c.id] && byId[c.id].length > 0)
    .map(c => ({ category: c, apps: byId[c.id] }));
}

module.exports = {
  CATEGORIES,
  VALID_CATEGORY_IDS,
  parseDesktopFile,
  validateDesktopFile,
  loadRobOSApps,
  groupByCategory,
};

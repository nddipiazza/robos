const fs = require('fs');
const path = require('path');

// ── Canonical RobOS App Categories ──
const CATEGORIES = {
  'Dev':      { order: 1, label: 'Development',   icon: '🔧' },
  'AI':       { order: 2, label: 'AI & Agents',   icon: '🤖' },
  'Security': { order: 3, label: 'Security',      icon: '🔒' },
  'People':   { order: 4, label: 'People',        icon: '👥' },
  'Journal':  { order: 5, label: 'Journal',       icon: '📓' },
  'System':   { order: 6, label: 'System',        icon: '⚙️' },
  'Internet': { order: 7, label: 'Internet',      icon: '🌐' },
  'Tools':    { order: 8, label: 'Tools',         icon: '🛠️' },
};

const CATEGORY_IDS = Object.keys(CATEGORIES);

// ── .desktop file parsing ──

function parseDesktopFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  let inEntry = false;
  const entry = { path: filePath };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '[Desktop Entry]') { inEntry = true; continue; }
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) { inEntry = false; continue; }
    if (!inEntry || !trimmed.includes('=')) continue;

    const eqIdx = trimmed.indexOf('=');
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();

    switch (key) {
      case 'Name': entry.name = entry.name || val; break;
      case 'Exec': entry.exec = val; break;
      case 'Icon': entry.icon = val; break;
      case 'Comment': entry.comment = entry.comment || val; break;
      case 'Categories': entry.categories = val; break;
      case 'Type': entry.type = val; break;
      case 'NoDisplay': entry.noDisplay = val === 'true'; break;
      case 'Hidden': entry.hidden = val === 'true'; break;
      case 'X-RobOS-App': entry.isRobOS = val === 'true'; break;
      case 'X-RobOS-Category': entry.robosCategory = val; break;
      case 'StartupWMClass': entry.wmClass = val; break;
    }
  }
  return entry;
}

function loadRobOSApps(searchDirs) {
  const dirs = searchDirs || [
    '/usr/share/applications',
    path.join(process.env.HOME || '/home/robos', '.local/share/applications')
  ];

  const apps = [];
  const seen = new Set();

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.desktop') || seen.has(file)) continue;
      seen.add(file);
      try {
        const entry = parseDesktopFile(path.join(dir, file));
        if (entry.isRobOS && entry.name && entry.exec) {
          apps.push(entry);
        }
      } catch { /* skip broken files */ }
    }
  }

  return apps.sort((a, b) => a.name.localeCompare(b.name));
}

function groupByCategory(apps) {
  const groups = {};
  for (const cat of CATEGORY_IDS) {
    groups[cat] = [];
  }
  groups['Other'] = [];

  for (const app of apps) {
    const cat = app.robosCategory && CATEGORIES[app.robosCategory]
      ? app.robosCategory
      : 'Other';
    groups[cat].push(app);
  }

  // Return only non-empty groups, sorted by order
  return Object.entries(groups)
    .filter(([, apps]) => apps.length > 0)
    .sort(([a], [b]) => {
      const oa = CATEGORIES[a]?.order ?? 99;
      const ob = CATEGORIES[b]?.order ?? 99;
      return oa - ob;
    })
    .map(([id, apps]) => ({
      id,
      label: CATEGORIES[id]?.label || id,
      apps
    }));
}

// ── Display name helper ──

function displayName(name) {
  // Strip "RobOS " prefix for cleaner display
  return name.replace(/^RobOS\s+/i, '');
}

const onboardingState = require('./onboarding-state');
const { GitOpsSDLCParser } = require('./gitops-parser');

module.exports = {
  CATEGORIES,
  CATEGORY_IDS,
  parseDesktopFile,
  loadRobOSApps,
  groupByCategory,
  displayName,
  GitOpsSDLCParser,
  ...onboardingState,
};



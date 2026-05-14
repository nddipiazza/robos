let allApps = [];
let activeCategory = 'All';

const grid = document.getElementById('app-grid');
const searchInput = document.getElementById('search-input');
const emptyState = document.getElementById('empty-state');
const categoryBar = document.getElementById('category-bar');

// Map raw .desktop categories to friendly display groups
const CATEGORY_MAP = {
  'Utility': 'Utilities',
  'X-GNOME-Utilities': 'Utilities',
  'Core': 'Utilities',
  'System': 'System',
  'Settings': 'System',
  'X-GNOME-Settings-Panel': 'System',
  'DesktopSettings': 'System',
  'HardwareSettings': 'System',
  'X-GNOME-DevicesSettings': 'System',
  'X-GNOME-PrivacySettings': 'System',
  'X-GNOME-DetailsSettings': 'System',
  'X-GNOME-PersonalizationSettings': 'System',
  'X-GNOME-ConnectivitySettings': 'System',
  'X-GNOME-NetworkSettings': 'System',
  'X-GNOME-PersonalSettings': 'System',
  'Monitor': 'System',
  'Network': 'Internet',
  'WebBrowser': 'Internet',
  'Email': 'Internet',
  'Chat': 'Internet',
  'InstantMessaging': 'Internet',
  'Development': 'Development',
  'IDE': 'Development',
  'TextEditor': 'Development',
  'Debugger': 'Development',
  'Graphics': 'Graphics',
  'Photography': 'Graphics',
  'Viewer': 'Graphics',
  'Audio': 'Media',
  'Video': 'Media',
  'AudioVideo': 'Media',
  'Music': 'Media',
  'Player': 'Media',
  'Recorder': 'Media',
  'Office': 'Office',
  'WordProcessor': 'Office',
  'Spreadsheet': 'Office',
  'Presentation': 'Office',
  'Calendar': 'Office',
  'Game': 'Games',
  'Education': 'Education',
  'Science': 'Education',
  'Math': 'Education',
  'Accessibility': 'Accessibility',
};

// Display order for categories
const CATEGORY_ORDER = [
  'All', 'Utilities', 'System', 'Internet', 'Development',
  'Graphics', 'Media', 'Office', 'Games', 'Education', 'Accessibility', 'Other'
];

function resolveCategory(rawCategories) {
  if (!rawCategories) return ['Other'];
  const cats = rawCategories.split(';').filter(Boolean);
  const resolved = new Set();
  for (const cat of cats) {
    if (CATEGORY_MAP[cat]) {
      resolved.add(CATEGORY_MAP[cat]);
    }
  }
  return resolved.size > 0 ? [...resolved] : ['Other'];
}

function getActiveCategories(apps) {
  const counts = {};
  for (const app of apps) {
    for (const cat of app.resolvedCategories) {
      counts[cat] = (counts[cat] || 0) + 1;
    }
  }
  // Return categories that have at least one app, in display order
  return CATEGORY_ORDER.filter(c => c === 'All' || counts[c]);
}

function renderCategoryBar(apps) {
  categoryBar.innerHTML = '';
  const categories = getActiveCategories(apps);

  for (const cat of categories) {
    const btn = document.createElement('button');
    btn.className = 'category-btn' + (cat === activeCategory ? ' active' : '');
    btn.textContent = cat;
    btn.addEventListener('click', () => {
      activeCategory = cat;
      renderCategoryBar(allApps);
      renderApps(getFilteredApps());
    });
    categoryBar.appendChild(btn);
  }
}

function createFallbackIcon(name) {
  const div = document.createElement('div');
  div.className = 'app-icon-fallback';
  div.textContent = (name || '?')[0].toUpperCase();
  return div;
}

function renderApps(apps) {
  grid.innerHTML = '';

  if (apps.length === 0) {
    emptyState.classList.remove('hidden');
    return;
  }
  emptyState.classList.add('hidden');

  for (const app of apps) {
    const card = document.createElement('button');
    card.className = 'app-card';
    card.title = app.comment || app.name;

    if (app.iconPath) {
      const img = document.createElement('img');
      img.className = 'app-icon';
      img.src = app.iconPath;
      img.alt = app.name;
      img.onerror = () => {
        img.replaceWith(createFallbackIcon(app.name));
      };
      card.appendChild(img);
    } else {
      card.appendChild(createFallbackIcon(app.name));
    }

    const name = document.createElement('span');
    name.className = 'app-name';
    // Strip "RobOS " prefix for cleaner display
    name.textContent = app.name.replace(/^RobOS\s+/i, '');
    card.appendChild(name);

    card.addEventListener('click', () => {
      window.robos.launchApp(app.exec);
    });

    grid.appendChild(card);
  }
}

function getFilteredApps() {
  let apps = allApps;

  // Category filter
  if (activeCategory !== 'All') {
    apps = apps.filter(app => app.resolvedCategories.includes(activeCategory));
  }

  // Search filter
  const query = searchInput.value.trim();
  if (query) {
    const q = query.toLowerCase();
    apps = apps.filter(app => {
      const cleanName = app.name.replace(/^RobOS\s+/i, '').toLowerCase();
      return cleanName.includes(q) ||
        app.name.toLowerCase().includes(q) ||
        (app.comment && app.comment.toLowerCase().includes(q)) ||
        (app.categories && app.categories.toLowerCase().includes(q));
    });
  }

  return apps;
}

searchInput.addEventListener('input', () => {
  focusIndex = -1;
  renderApps(getFilteredApps());
});

// ── Keyboard navigation ──────────────────────────────────────────────────────

let focusIndex = -1;

function getGridColumns() {
  const cards = grid.querySelectorAll('.app-card');
  if (cards.length < 2) return 1;
  const firstTop = cards[0].getBoundingClientRect().top;
  let cols = 0;
  for (const card of cards) {
    if (card.getBoundingClientRect().top === firstTop) cols++;
    else break;
  }
  return cols || 1;
}

function focusCard(index) {
  const cards = grid.querySelectorAll('.app-card');
  if (cards.length === 0) return;
  focusIndex = Math.max(0, Math.min(index, cards.length - 1));
  cards[focusIndex].focus();
  cards[focusIndex].scrollIntoView({ block: 'nearest' });
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    window.robos.closeWindow();
    return;
  }

  const cards = grid.querySelectorAll('.app-card');
  if (cards.length === 0) return;

  // If typing a letter/number and search isn't focused, focus search
  if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && document.activeElement !== searchInput) {
    searchInput.focus();
    return;
  }

  const cols = getGridColumns();

  switch (e.key) {
    case 'ArrowRight':
      e.preventDefault();
      focusCard(focusIndex < 0 ? 0 : focusIndex + 1);
      break;
    case 'ArrowLeft':
      e.preventDefault();
      focusCard(focusIndex < 0 ? 0 : focusIndex - 1);
      break;
    case 'ArrowDown':
      e.preventDefault();
      if (document.activeElement === searchInput) {
        focusCard(0);
      } else {
        focusCard(focusIndex < 0 ? 0 : focusIndex + cols);
      }
      break;
    case 'ArrowUp':
      e.preventDefault();
      if (focusIndex < cols) {
        searchInput.focus();
        focusIndex = -1;
      } else {
        focusCard(focusIndex - cols);
      }
      break;
    case 'Enter':
      if (document.activeElement && document.activeElement.classList.contains('app-card')) {
        e.preventDefault(); // prevent native button click (we handle it explicitly)
        document.activeElement.click();
      } else if (document.activeElement === searchInput) {
        const filtered = getFilteredApps();
        if (filtered.length === 1) {
          window.robos.launchApp(filtered[0].exec);
        } else if (filtered.length > 1) {
          focusCard(0);
        }
      }
      break;
    case 'Tab':
      // Let tab work naturally between search and grid
      if (document.activeElement === searchInput) {
        e.preventDefault();
        focusCard(0);
      }
      break;
  }
});


// Load apps on startup
window.robos.getDesktopEntries().then(apps => {
  allApps = apps.map(app => ({
    ...app,
    resolvedCategories: resolveCategory(app.categories)
  }));
  renderCategoryBar(allApps);
  renderApps(allApps);
});

'use strict';
/* global launcher */

// Palette for initials fallback icons (consistent per app name)
const PALETTE = ['#1f6feb','#238636','#9e6a03','#8957e5','#cf222e','#0969da','#1a7f37','#953800','#6e40c9','#b91c1c'];
function colorFor(name) { let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0; return PALETTE[h % PALETTE.length]; }

const search    = document.getElementById('search');
const catTree   = document.getElementById('category-tree');
const appGrid   = document.getElementById('app-grid');
const gridHeader= document.getElementById('grid-header');
const btnClose  = document.getElementById('btn-close');

let allApps = [];
let selectedFilter = 'all';   // 'all' | 'cat:Developer' | 'sub:Developer/Planning'

// ── Category tree building ────────────────────────────────────────────────────

function buildTree(apps) {
  // tree: { catName: { subName: [apps] } }
  const tree = {};
  for (const app of apps) {
    let cat = 'Other', sub = 'General';
    if (app.robosCategory) {
      const parts = app.robosCategory.split('/');
      cat = parts[0] || 'Other';
      sub = parts[1] || 'General';
    } else {
      const c = app.categories.find(c => !['Application','GNOME','GTK','Qt','KDE','X-GNOME-Utilities'].includes(c));
      if (c) { cat = c; sub = 'General'; }
    }
    (tree[cat] = tree[cat] || {})[sub] = tree[cat][sub] || [];
    tree[cat][sub].push(app);
  }
  return tree;
}

// Canonical top-level sort order
const CAT_ORDER = ['RobOS Dev', 'RobOS AI', 'RobOS Security', 'RobOS System', 'RobOS People', 'RobOS Journal', 'RobOS Internet', 'RobOS Developer', 'Developer', 'System', 'Internet', 'Development', 'Utility', 'Office'];
function sortCats(cats) {
  return [...cats].sort((a, b) => {
    const ai = CAT_ORDER.indexOf(a), bi = CAT_ORDER.indexOf(b);
    if (ai >= 0 && bi >= 0) return ai - bi;
    if (ai >= 0) return -1;
    if (bi >= 0) return  1;
    return a.localeCompare(b);
  });
}

const CAT_ICONS = {
  'RobOS Dev':'󰖟', 'RobOS AI':'󰚩', 'RobOS Security':'󰌆', 'RobOS System':'󱄦',
  'RobOS People':'󰡉', 'RobOS Journal':'󰎞', 'RobOS Internet':'󰀹', 'RobOS Developer':'󰖟',
  Developer:'󰖟', System:'󱄦', Internet:'󰀹', Development:'󰆧', Utility:'󱁤', Office:'󱃢', Other:'󰉋',
};
function catIcon(cat) {
  // Fallback to emoji that renders reliably
  const MAP = {
    'RobOS Dev':'🛠', 'RobOS AI':'🤖', 'RobOS Security':'🔐', 'RobOS System':'⚙',
    'RobOS People':'👥', 'RobOS Journal':'📓', 'RobOS Internet':'🌐', 'RobOS Developer':'🛠',
    Developer:'🛠', System:'⚙', Internet:'🌐', Development:'💻', Utility:'🔧', Office:'📄', Other:'📦',
  };
  return MAP[cat] || '📁';
}

// ── Sidebar render ────────────────────────────────────────────────────────────

function renderSidebar(apps) {
  const tree = buildTree(apps);
  catTree.innerHTML = '';

  // All Apps
  const allEl = document.createElement('div');
  allEl.className = 'cat-all' + (selectedFilter === 'all' ? ' selected' : '');
  allEl.innerHTML = `<span>🔲</span><span>All Apps</span>`;
  allEl.onclick = () => setFilter('all', 'All Apps');
  catTree.appendChild(allEl);

  for (const cat of sortCats(Object.keys(tree))) {
    const subs = tree[cat];
    const subNames = Object.keys(subs).sort();
    const totalInCat = Object.values(subs).flat().length;

    const group = document.createElement('div');
    group.className = 'cat-group';
    // auto-expand if it's a top-level RobOS category or only one page of apps
    if (cat.startsWith('RobOS ') || ['Developer','System'].includes(cat) || totalInCat <= 3) group.classList.add('expanded');

    const parentEl = document.createElement('div');
    parentEl.className = 'cat-parent' + (selectedFilter === `cat:${cat}` ? ' selected' : '');
    parentEl.innerHTML = `
      <svg class="cat-chevron" viewBox="0 0 10 10"><path d="M3 2l4 3-4 3" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>
      <span class="cat-parent-icon">${catIcon(cat)}</span>
      <span>${cat}</span>`;
    parentEl.onclick = () => {
      group.classList.toggle('expanded');
      setFilter(`cat:${cat}`, cat);
    };
    group.appendChild(parentEl);

    const childrenEl = document.createElement('div');
    childrenEl.className = 'cat-children';

    for (const sub of subNames) {
      if (sub === 'General' && subNames.length === 1) continue; // hide trivial sub
      const childEl = document.createElement('div');
      const key = `sub:${cat}/${sub}`;
      childEl.className = 'cat-child' + (selectedFilter === key ? ' selected' : '');
      childEl.textContent = sub;
      childEl.onclick = (e) => { e.stopPropagation(); setFilter(key, `${cat} / ${sub}`); };
      childrenEl.appendChild(childEl);
    }
    group.appendChild(childrenEl);
    catTree.appendChild(group);
  }
}

// ── App grid render ───────────────────────────────────────────────────────────

function getFilteredApps() {
  const q = search.value.toLowerCase().trim();
  let apps = allApps;

  if (selectedFilter !== 'all') {
    const tree = buildTree(allApps);
    if (selectedFilter.startsWith('cat:')) {
      const cat = selectedFilter.slice(4);
      apps = Object.values(tree[cat] || {}).flat();
    } else if (selectedFilter.startsWith('sub:')) {
      const [cat, sub] = selectedFilter.slice(4).split('/');
      apps = (tree[cat] || {})[sub] || [];
    }
  }

  if (q) {
    apps = apps.filter(a =>
      a.name.toLowerCase().includes(q) ||
      a.comment.toLowerCase().includes(q) ||
      a.keywords.includes(q)
    );
  }
  return apps;
}

function renderGrid() {
  focusedCardIdx = -1;   // cards are recreated; old index is invalid
  const apps = getFilteredApps();
  appGrid.innerHTML = '';
  gridHeader.textContent = apps.length ? `${apps.length} app${apps.length !== 1 ? 's' : ''}` : '';

  if (!apps.length) {
    const em = document.createElement('div');
    em.className = 'empty-state';
    em.innerHTML = `<div style="font-size:32px">🔍</div><div>No apps found</div>`;
    appGrid.appendChild(em);
    return;
  }

  for (const app of apps) {
    const card = document.createElement('div');
    card.className = 'app-card';
    card.tabIndex = 0;
    card.title = app.comment || app.name;

    // Icon
    const iconWrap = document.createElement('div');
    iconWrap.className = 'app-icon-wrap';
    if (app.iconPath) {
      const img = document.createElement('img');
      img.src = `file://${app.iconPath}`;
      img.onerror = () => { iconWrap.innerHTML = initialsEl(app.name); };
      iconWrap.appendChild(img);
    } else {
      iconWrap.innerHTML = initialsEl(app.name);
    }

    // Name
    const nameEl = document.createElement('div');
    nameEl.className = 'app-name';
    nameEl.textContent = app.name.replace(/^RobOS\s+/, '');

    // Category badge (only in "All" view)
    const badge = document.createElement('div');
    badge.className = 'app-cat-badge';
    if (selectedFilter === 'all' && app.robosCategory) badge.textContent = app.robosCategory;

    card.appendChild(iconWrap);
    card.appendChild(nameEl);
    card.appendChild(badge);

    card.dataset.exec = app.exec;
    card.onclick = () => launchAndClose(app.exec);
    card.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); launchAndClose(app.exec); } };
    appGrid.appendChild(card);
  }
}

function initialsEl(name) {
  const initials = name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const color = colorFor(name);
  return `<div class="app-icon-initials" style="background:${color}">${initials}</div>`;
}

async function launchAndClose(exec) {
  await launcher.launchApp(exec);
  launcher.close();
}

// ── Filter state ──────────────────────────────────────────────────────────────

function setFilter(key, label) {
  selectedFilter = key;
  renderSidebar(allApps);
  renderGrid();
}

// ── Focus state ───────────────────────────────────────────────────────────────
// Track focused card index explicitly — avoids relying on document.activeElement
// which can be stale inside a keydown handler after calling card.focus().

let focusedCardIdx = -1;  // -1 = search/no card focused

function getCards() {
  return [...appGrid.querySelectorAll('.app-card')];
}

// Returns how many columns fit in the flex-wrap grid by counting cards on the first row
function getGridColumns() {
  const cards = getCards();
  if (cards.length < 2) return 1;
  const firstTop = cards[0].getBoundingClientRect().top;
  let cols = 0;
  for (const card of cards) {
    if (Math.abs(card.getBoundingClientRect().top - firstTop) > 4) break;
    cols++;
  }
  return cols || 1;
}

function focusCard(idx) {
  const cards = getCards();
  if (idx < 0 || idx >= cards.length) { returnToSearch(); return; }
  focusedCardIdx = idx;
  cards[idx].focus();
  cards[idx].scrollIntoView({ block: 'nearest' });
}

function returnToSearch() {
  focusedCardIdx = -1;
  search.focus();
}

// Reset card focus index whenever the grid is re-rendered

// ── Events ────────────────────────────────────────────────────────────────────

btnClose.onclick = () => launcher.close();

search.addEventListener('focus', () => { focusedCardIdx = -1; });
search.addEventListener('input', () => { focusedCardIdx = -1; renderGrid(); });

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { launcher.close(); return; }

  const cards = getCards();
  const onCard = focusedCardIdx >= 0 && focusedCardIdx < cards.length;
  const idx    = focusedCardIdx;

  if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
    if (onCard) {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? getGridColumns() : 1;
      focusCard(Math.min(idx + step, cards.length - 1));
    } else if (e.key === 'ArrowDown' && cards.length) {
      e.preventDefault();
      focusCard(0);
    }
    // ArrowRight from search: let the browser move the text cursor normally

  } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
    if (onCard) {
      e.preventDefault();
      const step = e.key === 'ArrowUp' ? getGridColumns() : 1;
      const target = idx - step;
      if (target >= 0) focusCard(target);
      else returnToSearch();
    }
    // ArrowLeft/Up from search: let the browser move the text cursor normally

  } else if (e.key === 'Enter') {
    if (!onCard && cards.length) {
      e.preventDefault();
      launchAndClose(cards[0].dataset.exec);
    }

  } else if (e.key === 'Tab') {
    if (!e.shiftKey && !onCard && cards.length) {
      e.preventDefault();
      focusCard(0);
    } else if (!e.shiftKey && onCard && idx === cards.length - 1) {
      e.preventDefault();
      returnToSearch();
    } else if (e.shiftKey && onCard && idx === 0) {
      e.preventDefault();
      returnToSearch();
    } else if (e.shiftKey && !onCard && cards.length) {
      e.preventDefault();
      focusCard(cards.length - 1);
    }
  }
});

// Redirect printable characters typed while a card is focused back to the search box
document.addEventListener('keypress', (e) => {
  if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && document.activeElement !== search) {
    returnToSearch();
  }
});

// ── Init ──────────────────────────────────────────────────────────────────────

(async () => {
  allApps = await launcher.listApps();
  renderSidebar(allApps);
  renderGrid();
  search.focus();
})();

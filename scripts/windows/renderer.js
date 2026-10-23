window.robos.list().then(apps => {
  const suiteInfo = {
    'point-of-sale': ['Point of Sale', 'Retail, cafes & bars', '#6cddd2', '#245f5635'],
    'auto-center': ['Auto Center', 'Service, repairs & vehicle care', '#a5b4fc', '#45447c40'],
    household: ['Household', 'Accounts, statements & spending', '#e6c28b', '#70562e35'],
    'audio-player': ['Audio Player', 'Your library, listening & casting', '#e4a6ca', '#6d34543a'],
    'robos-tabletop': ['Tabletop', 'Campaigns, quests & adventures', '#b5a5ed', '#4f397e35'],
    'pr-review': ['Code Review', 'Changes, evidence & walkthroughs', '#8abfe5', '#28577635'],
  };
  const groups = { suites: 'Everyday & business', developer: 'Developer tools', system: 'System & agents' };
  const titles = { all: 'Library', recent: 'Recently opened', ...groups };
  let filter = 'all';
  let recent = [];
  try { recent = JSON.parse(localStorage.getItem('robos-recent') || '[]'); if (!Array.isArray(recent)) recent = []; } catch {}
  const grid = document.getElementById('apps');
  const suites = document.getElementById('suites');
  let statusTimer;
  function icon(app, className) {
    const span = document.createElement('span'); span.className = className; span.setAttribute('aria-hidden', 'true');
    // Icons come from the installed RobOS icon registry, never network content.
    span.innerHTML = app.iconSvg || '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M9 9h6v6H9z"/></svg>';
    return span;
  }
  async function launch(app) {
    const status = document.getElementById('status'); clearTimeout(statusTimer);
    status.hidden = false; status.textContent = `Starting ${app.label}…`;
    try {
      await window.robos.launch(app.id);
      recent = [app.id, ...recent.filter(id => id !== app.id)].slice(0, 16);
      try { localStorage.setItem('robos-recent', JSON.stringify(recent)); } catch {}
      status.textContent = `Opening ${app.label}`;
    } catch (error) { status.textContent = error.message; return; }
    status.hidden = false; statusTimer = setTimeout(() => { status.hidden = true; }, 3500);
  }
  function group(app) {
    if (suiteInfo[app.id] && app.id !== 'pr-review') return 'suites';
    if (/system|security|agent|core-desktop|ai/i.test(app.category)) return 'system';
    return 'developer';
  }
  function tile(app) {
    const button = document.createElement('button'); button.className = 'app-tile';
    button.setAttribute('aria-label', app.label); button.append(icon(app, 'app-icon'));
    const copy = document.createElement('span'); copy.className = 'app-copy';
    const name = document.createElement('span'); name.className = 'app-name'; name.textContent = app.label;
    const category = document.createElement('span'); category.className = 'app-category'; category.textContent = groups[group(app)];
    copy.append(name, category); button.append(copy); button.addEventListener('click', () => launch(app)); return button;
  }
  for (const [id, info] of Object.entries(suiteInfo)) {
    const app = apps.find(a => a.id === id); if (!app) continue;
    const button = document.createElement('button'); button.className = 'suite-card'; button.setAttribute('aria-label', info[0]);
    button.style.setProperty('--accent', info[2]); button.style.setProperty('--wash', info[3]);
    const top = document.createElement('span'); top.className = 'suite-top'; top.append(icon(app, 'suite-icon'));
    const arrow = document.createElement('span'); arrow.className = 'arrow'; arrow.textContent = '↗'; arrow.setAttribute('aria-hidden', 'true'); top.append(arrow);
    const name = document.createElement('span'); name.className = 'suite-name'; name.textContent = info[0];
    const description = document.createElement('span'); description.className = 'suite-description'; description.textContent = info[1];
    button.append(top, name, description); button.addEventListener('click', () => launch(app)); suites.append(button);
  }
  function render() {
    const query = document.getElementById('search').value.trim().toLowerCase();
    const list = (filter === 'recent' ? recent.map(id => apps.find(a => a.id === id)).filter(Boolean) : apps)
      .filter(a => (filter === 'all' || filter === 'recent' || group(a) === filter) && `${a.label} ${a.id} ${a.category}`.toLowerCase().includes(query));
    document.getElementById('suite-section').hidden = filter !== 'all' || !!query;
    document.getElementById('view-title').textContent = titles[filter];
    document.getElementById('directory-title').textContent = query ? 'Search results' : filter === 'all' ? 'All applications' : titles[filter];
    document.getElementById('app-count').textContent = `${list.length} applications`;
    grid.replaceChildren(...list.map(tile));
    const empty = document.getElementById('empty'); empty.hidden = !!list.length;
    empty.textContent = filter === 'recent' && !query ? 'Applications you open will appear here.' : 'No applications found.';
  }
  document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {
    filter = button.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach(b => b.classList.toggle('active', b === button)); render();
  }));
  document.getElementById('search').addEventListener('input', render);
  const search = document.getElementById('search');
  window.robos.onShown(() => { search.focus(); search.select(); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') window.robos.hide();
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); search.focus(); }
  });
  let settings;
  const shortcut = document.getElementById('shortcut-toggle');
  const login = document.getElementById('login-toggle');
  function showSettings(value) {
    settings = value;
    shortcut.disabled = false; login.disabled = false;
    shortcut.setAttribute('aria-pressed', String(value.shortcutActive));
    shortcut.textContent = value.shortcutActive ? 'Win + Shift + Space enabled' : 'Enable Win + Shift + Space';
    login.setAttribute('aria-pressed', String(value.startAtLogin));
    login.textContent = value.startAtLogin ? 'Starts at Windows sign-in' : 'Run at Windows sign-in';
    document.getElementById('launcher-hint').textContent = value.shortcutError || 'Close the window to keep RobOS ready in the tray.';
  }
  async function setting(button, update) {
    button.disabled = true;
    try { showSettings(await update()); }
    catch (error) { document.getElementById('launcher-hint').textContent = error.message; }
    finally { button.disabled = false; }
  }
  shortcut.addEventListener('click', () => setting(shortcut, () => window.robos.setShortcut(!settings?.shortcutActive)));
  login.addEventListener('click', () => setting(login, () => window.robos.setStartAtLogin(!settings?.startAtLogin)));
  window.robos.launcherState().then(showSettings);
  render();
}).catch(error => { const status = document.getElementById('status'); status.hidden = false; status.textContent = error.message; });

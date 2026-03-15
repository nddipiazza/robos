async function init() {
  const apps = await window.api.getApps();
  const list = document.getElementById('app-list');

  for (const app of apps) {
    const item = document.createElement('div');
    item.className = 'app-item';
    item.innerHTML = `
      <div class="app-icon">${app.icon}</div>
      <div class="app-info">
        <div class="app-name">${app.label}</div>
        <div class="app-desc">${app.desc}</div>
      </div>
      <span class="app-arrow">›</span>
    `;
    item.addEventListener('click', () => window.api.launchApp(app.id));
    list.appendChild(item);
  }
}

init();

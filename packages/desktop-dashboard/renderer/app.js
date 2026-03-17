'use strict';

const grid = document.getElementById('widget-grid');

// ── Widget registry ───────────────────────────────────────────────────────────
// Each widget: { id, title, render() → HTML string, refresh() optional }
const widgets = [];

function registerWidget(widget) {
  widgets.push(widget);
}

function renderWidgets() {
  grid.innerHTML = widgets.map(w => `
    <div class="widget-card" id="widget-${w.id}">
      <div class="widget-header">
        <span class="widget-title">${w.title}</span>
      </div>
      <div class="widget-body">${w.render()}</div>
    </div>
  `).join('');
}

// ── Hello World Widget ────────────────────────────────────────────────────────
registerWidget({
  id: 'hello-world',
  title: 'Welcome',
  render() {
    const now = new Date();
    const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const date = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    return `
      <div class="hello-widget">
        <div class="hello-time">${time}</div>
        <div class="hello-date">${date}</div>
        <div class="hello-msg">RobOS Desktop Dashboard</div>
        <div class="hello-sub">Widget grid is ready. Add more widgets to populate your desktop.</div>
      </div>
    `;
  }
});

// ── Init ──────────────────────────────────────────────────────────────────────
renderWidgets();

// Refresh every 30 seconds (for clock etc)
setInterval(renderWidgets, 30000);

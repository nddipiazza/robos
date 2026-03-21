'use strict';

let _schema = null;
let _settings = {};

function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function init() {
  _schema = await window.api.getSchema();
  _settings = await window.api.loadSettings();
  renderSidebar();
  renderSections();
}

function renderSidebar() {
  const el = document.getElementById('sidebar');
  el.innerHTML = _schema.sections.map(s =>
    '<div class="sidebar-item" data-section="' + s.id + '">' + esc(s.label) + '</div>'
  ).join('');
  el.querySelectorAll('.sidebar-item').forEach(item => {
    item.addEventListener('click', () => {
      document.getElementById('section-' + item.dataset.section)?.scrollIntoView({ behavior: 'smooth' });
    });
  });
}

function renderSections() {
  const el = document.getElementById('sections');
  el.innerHTML = _schema.sections.map(section => {
    const fields = section.fields.map(f => {
      const val = _settings[f.key] !== undefined ? _settings[f.key] : f.default;
      let input = '';
      if (f.type === 'text' || f.type === 'password') {
        input = '<input type="' + f.type + '" class="text-input" data-key="' + f.key + '" value="' + esc(val) + '" />';
      } else if (f.type === 'checkbox') {
        input = '<input type="checkbox" data-key="' + f.key + '" ' + (val ? 'checked' : '') + ' />';
      } else if (f.type === 'select') {
        input = '<select class="select-input" data-key="' + f.key + '">' +
          f.options.map(o => '<option value="' + esc(o) + '"' + (o === val ? ' selected' : '') + '>' + esc(o) + '</option>').join('') +
          '</select>';
      }
      return '<div class="field-row">' +
        '<label class="field-label">' + esc(f.label) + '</label>' +
        '<div class="field-input">' + input + '</div>' +
      '</div>';
    }).join('');

    return '<div class="section" id="section-' + section.id + '">' +
      '<h3 class="section-title">' + esc(section.label) + '</h3>' +
      fields +
    '</div>';
  }).join('');
}

function collectSettings() {
  const data = {};
  document.querySelectorAll('[data-key]').forEach(el => {
    if (el.type === 'checkbox') {
      data[el.dataset.key] = el.checked;
    } else {
      data[el.dataset.key] = el.value;
    }
  });
  return data;
}

document.getElementById('btn-save').addEventListener('click', async () => {
  const data = collectSettings();
  const result = await window.api.saveSettings(data);
  const msg = document.getElementById('status-msg');
  if (result.ok) {
    msg.textContent = 'Settings saved successfully.';
    msg.className = 'status-msg success';
  } else {
    msg.textContent = 'Error saving settings.';
    msg.className = 'status-msg error';
  }
  msg.classList.remove('hidden');
  setTimeout(() => msg.classList.add('hidden'), 3000);
});

init();

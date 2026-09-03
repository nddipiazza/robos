'use strict';

let _schema = null;
let _settings = {};

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function init() {
  _schema = await window.api.getSchema();
  _settings = await window.api.loadSettings();
  renderSidebar();
  renderSections();
}

function renderSidebar() {
  const el = document.getElementById('sidebar');
  el.innerHTML = _schema.sections.map((s, idx) =>
    `<div class="sidebar-item ${idx === 0 ? 'active' : ''}" id="sidebar-item-${s.id}" data-section="${s.id}">${esc(s.label)}</div>`
  ).join('');
  el.querySelectorAll('.sidebar-item').forEach(item => {
    item.addEventListener('click', () => {
      el.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      const target = document.getElementById('section-' + item.dataset.section);
      if (target) target.scrollIntoView({ behavior: 'smooth' });
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
        input = `<input type="${f.type}" id="field-${f.key}" class="text-input" data-key="${f.key}" value="${esc(val)}" />`;
      } else if (f.type === 'checkbox') {
        input = `<input type="checkbox" id="field-${f.key}" data-key="${f.key}" ${val ? 'checked' : ''} />`;
      } else if (f.type === 'select') {
        input = `<select id="field-${f.key}" class="select-input" data-key="${f.key}">` +
          f.options.map(o => `<option value="${esc(o)}"${o === val ? ' selected' : ''}>${esc(o)}</option>`).join('') +
          `</select>`;
      }
      return `<div class="field-row">` +
        `<label class="field-label" for="field-${f.key}">${esc(f.label)}</label>` +
        `<div class="field-input">${input}</div>` +
      `</div>`;
    }).join('');

    return `<div class="section" id="section-${section.id}">` +
      `<h3 class="section-title">${esc(section.label)}</h3>` +
      fields +
    `</div>`;
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

window.setFieldValue = function(key, value) {
  const el = document.getElementById('field-' + key);
  if (!el) return false;
  if (el.type === 'checkbox') {
    el.checked = !!value;
  } else {
    el.value = value;
  }
  _settings[key] = value;
  return true;
};

window.saveAll = async function() {
  const data = collectSettings();
  const result = await window.api.saveSettings(data);
  const msg = document.getElementById('status-msg');
  if (result.ok) {
    msg.textContent = '✓ Settings saved successfully.';
    msg.className = 'status-msg success';
  } else {
    msg.textContent = 'Error saving settings.';
    msg.className = 'status-msg error';
  }
  msg.classList.remove('hidden');
  setTimeout(() => msg.classList.add('hidden'), 3000);
  return result;
};

document.getElementById('btn-save').addEventListener('click', window.saveAll);

init();

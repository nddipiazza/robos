'use strict';

let _schema = null;
let _settings = {};
let _githubAccountsSelection = null;

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function init() {
  _schema = await window.api.getSchema();
  _settings = await window.api.loadSettings();
  renderSidebar();
  renderSections();
  await loadGithubAccounts();
}

function renderSidebar() {
  const el = document.getElementById('sidebar');
  el.innerHTML = _schema.sections.map((s, idx) =>
    `<button type="button" class="sidebar-item ${idx === 0 ? 'active' : ''}" id="sidebar-item-${s.id}" data-section="${s.id}" aria-controls="section-${s.id}" ${idx === 0 ? 'aria-current="true"' : ''}>${esc(s.label)}</button>`
  ).join('');
  el.querySelectorAll('.sidebar-item').forEach(item => {
    item.addEventListener('click', () => {
      el.querySelectorAll('.sidebar-item').forEach(i => { i.classList.remove('active'); i.removeAttribute('aria-current'); });
      item.classList.add('active');
      item.setAttribute('aria-current', 'true');
      const target = document.getElementById('section-' + item.dataset.section);
      if (target) target.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    });
  });
  // Keep the selected navigation item accurate while scrolling or resizing.
  const content = document.getElementById('content');
  let pending = false;
  const updateCurrentSection = () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      const top = content.getBoundingClientRect().top + 36;
      const sections = [...document.querySelectorAll('#sections > .section')];
      const atBottom = content.scrollTop > 0 && content.scrollHeight - content.clientHeight - content.scrollTop < 2;
      const current = atBottom ? sections.at(-1) : sections.filter(section => section.getBoundingClientRect().top <= top).at(-1) || sections[0];
      if (!current) return;
      el.querySelectorAll('.sidebar-item').forEach(item => {
        const active = 'section-' + item.dataset.section === current.id;
        item.classList.toggle('active', active);
        if (active) item.setAttribute('aria-current', 'true');
        else item.removeAttribute('aria-current');
      });
    });
  };
  content.addEventListener('scroll', updateCurrentSection, { passive: true });
  window.addEventListener('resize', updateCurrentSection);
}

function renderSections() {
  const el = document.getElementById('sections');
  el.innerHTML = _schema.sections.map(section => {
    if (section.id === 'github_accounts') return githubAccountSection();
    const fields = section.fields.map(f => {
      const val = _settings[f.key] !== undefined ? _settings[f.key] : f.default;
      let input = '';
      if (f.type === 'text' || f.type === 'password') {
        input = `<input type="${f.type}" id="field-${f.key}" class="text-input" data-key="${f.key}" value="${esc(val)}" />`;
      } else if (f.type === 'checkbox') {
        input = `<input type="checkbox" id="field-${f.key}" data-key="${f.key}" ${val ? 'checked' : ''} />`;
      } else if (f.type === 'select') {
        input = `<select id="field-${f.key}" class="select-input" data-key="${f.key}">` +
          f.options.map(o => {const value=typeof o==='object'?o.value:o,label=typeof o==='object'?o.label:o;return `<option value="${esc(value)}"${value === val ? ' selected' : ''}>${esc(label)}</option>`;}).join('') +
          `</select>`;
      }
      return `<div class="field-row">` +
        `<label class="field-label" for="field-${f.key}">${esc(f.label)}</label>` +
        `<div class="field-input">${input}</div>` +
      `</div>`;
    }).join('');

    return `<div class="section" id="section-${section.id}">` +
      `<h2 class="section-title">${esc(section.label)}</h2>` +
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
  if (_githubAccountsSelection) {
    const selected = { git: document.getElementById('github-git-account').value, copilot: document.getElementById('github-copilot-account').value };
    if (selected.git !== _githubAccountsSelection.git || selected.copilot !== _githubAccountsSelection.copilot) {
      try { showGithubAccounts(await window.api.saveGithubAccounts(selected)); }
      catch (error) { document.getElementById('github-accounts-status').textContent = error.message; return { ok: false, error: error.message }; }
    }
  }
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

function githubAccountSection() {
  return `<section class="section" id="section-github_accounts">
    <h2 class="section-title">GitHub accounts</h2>
    <p class="section-description">Choose a saved GitHub account for each connection. Credentials stay in the existing GitHub credential store.</p>
    <div class="field-row"><div class="field-copy"><label class="field-label" for="github-git-account">Git client</label>
    <p class="field-description" id="git-account-description">Shared by Git Projects, GitHub task servers using Git client authentication, and PR Reviewer. This sets the active GitHub CLI account. Existing SSH keys and repository-specific credential helpers are managed separately.</p></div><div class="field-input"><select class="select-input" id="github-git-account" aria-describedby="git-account-description"></select></div></div>
    <div class="field-row"><div class="field-copy"><label class="field-label" for="github-copilot-account">Copilot AI agent</label>
    <p class="field-description" id="copilot-account-description">Used for new Copilot sessions and model access. Changing it does not switch the Git client account.</p></div><div class="field-input"><select class="select-input" id="github-copilot-account" aria-describedby="copilot-account-description"></select></div></div>
    <div class="section-actions"><button class="btn btn-primary" id="save-github-accounts" disabled>Save accounts</button><button class="btn" id="refresh-github-accounts">Refresh accounts</button><button class="btn" id="add-github-account">Add GitHub account</button></div>
    <p class="section-status" id="github-accounts-status" role="status" aria-live="polite">Loading saved accounts…</p>
  </section>`;
}
function showGithubAccounts(result) {
  if (!result.ok) throw Error(result.error);
  _githubAccountsSelection = { ...result.selected };
  for (const [kind, id] of [['git', 'github-git-account'], ['copilot', 'github-copilot-account']]) {
    const select = document.getElementById(id);
    select.replaceChildren(new Option('Choose an account…', ''));
    for (const account of result.accounts) {
      const option = new Option(account.login + (account.valid ? '' : ' — sign in again'), account.login);
      option.disabled = !account.valid; select.append(option);
    }
    if (result.selected[kind] && !result.accounts.some(a => a.login === result.selected[kind])) {
      const option = new Option(result.selected[kind] + ' — no longer signed in', result.selected[kind]); option.disabled = true; select.append(option);
    }
    select.value = result.selected[kind];
  }
  document.getElementById('save-github-accounts').disabled = !result.accounts.some(a => a.valid);
}
async function loadGithubAccounts() {
  const status = document.getElementById('github-accounts-status');
  try { showGithubAccounts(await window.api.githubAccounts()); status.textContent = 'Choose the account for each connection, then save.'; }
  catch (error) { status.textContent = error.message; }
  document.getElementById('refresh-github-accounts').onclick = loadGithubAccounts;
  document.getElementById('add-github-account').onclick = async () => {
    try { const result = await window.api.addGithubAccount(); if (!result.ok) throw Error(result.error); status.textContent = 'Complete sign-in in the terminal, then refresh accounts. Your saved Git client selection will be restored after sign-in.'; }
    catch (error) { status.textContent = error.message; }
  };
  document.getElementById('save-github-accounts').onclick = async () => {
    const buttons = [...document.querySelectorAll('#section-github_accounts button')]; buttons.forEach(b => { b.disabled = true; });
    status.textContent = 'Checking Copilot access and saving accounts…';
    try {
      const result = await window.api.saveGithubAccounts({ git: document.getElementById('github-git-account').value, copilot: document.getElementById('github-copilot-account').value });
      showGithubAccounts(result); status.textContent = `Saved. Git client: ${result.selected.git}. Copilot: ${result.selected.copilot}.`;
    } catch (error) { status.textContent = error.message; }
    finally { buttons.forEach(b => { b.disabled = false; }); }
  };
}
window.api.onShowGithubAccounts(() => document.getElementById('section-github_accounts')?.scrollIntoView());

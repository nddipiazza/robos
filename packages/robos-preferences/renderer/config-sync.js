'use strict';

/*
 * Config Sync & Sharing — the Preferences section for robos-lib/config-sync.
 *
 * Four tabs: Backup vault (one private folder all your machines sync with),
 * Share (publish chosen categories to family, a new teammate or a coworker),
 * Shared with me (join, update or leave someone else's share), Restore points.
 */

const cs = {
  tab: 'vault',
  status: null,
  accounts: [],
  plan: null,
  strategy: null,
  resolutions: {},
  shareTemplate: 'family',
  sharePreview: null,
  lastPublished: null,
  joinPreview: null,
  armed: null,
};
window.cs = cs;

const csEsc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const csCall = (name, opts) => window.api.configSync(name, opts);

function csAgo(iso) {
  if (!iso) return 'never';
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
}
const csBytes = n => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`);

function csSay(msg, kind = '') {
  const el = document.getElementById('cs-status');
  if (!el) return;
  el.textContent = msg || '';
  el.className = `section-status cs-status ${kind}`;
}

function configSyncSection() {
  return `<section class="section cs" id="section-config_sync">
    <h2 class="section-title">Config Sync &amp; Sharing</h2>
    <p class="section-description">Back up your whole RobOS setup (<code>~/.config/robos</code> and <code>~/.robos</code>) to a private folder on your cloud storage, load it on any other machine, and share parts of it with family, a new teammate or a coworker. Sign-ins, passwords and keys never leave this machine.</p>
    <div class="cs-tabs" role="tablist" aria-label="Config Sync">
      <button type="button" role="tab" class="cs-tab" data-cs-tab="vault" id="cs-tab-vault">Backup vault</button>
      <button type="button" role="tab" class="cs-tab" data-cs-tab="share" id="cs-tab-share">Share</button>
      <button type="button" role="tab" class="cs-tab" data-cs-tab="joined" id="cs-tab-joined">Shared with me</button>
      <button type="button" role="tab" class="cs-tab" data-cs-tab="restore" id="cs-tab-restore">Restore points</button>
    </div>
    <div class="cs-panel" id="cs-panel" role="tabpanel"></div>
    <p class="section-status cs-status" id="cs-status" role="status" aria-live="polite">Loading Config Sync…</p>
  </section>`;
}

async function loadConfigSync() {
  document.querySelectorAll('[data-cs-tab]').forEach(b => { b.onclick = () => csShowTab(b.dataset.csTab); });
  await csRefresh();
  csSay('');
}

async function csRefresh() {
  const [status, accounts] = await Promise.all([csCall('getStatus'), window.api.cloudAccounts().catch(() => ({ ok: false }))]);
  if (!status.ok) { csSay(status.error, 'error'); return; }
  cs.status = status;
  cs.accounts = (accounts.ok ? accounts.accounts : []).filter(a => a.provider === 'google' && a.loggedIn);
  csRender();
}

function csShowTab(tab) {
  cs.tab = tab;
  csRender();
}

function csRender() {
  document.querySelectorAll('[data-cs-tab]').forEach(b => {
    const on = b.dataset.csTab === cs.tab;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', String(on));
  });
  const joinedTab = document.getElementById('cs-tab-joined');
  const updates = (cs.status?.subscriptions || []).filter(s => s.latestGeneration > s.appliedGeneration).length;
  if (joinedTab) joinedTab.innerHTML = `Shared with me${updates ? ` <span class="cs-dot" title="${updates} update(s)">${updates}</span>` : ''}`;
  const panel = document.getElementById('cs-panel');
  if (!panel || !cs.status) return;
  panel.innerHTML = { vault: csVaultPanel, share: csSharePanel, joined: csJoinedPanel, restore: csRestorePanel }[cs.tab]();
  csBind[cs.tab]?.();
}

function csAccountOptions(selected, { allowFolder = false } = {}) {
  const opts = cs.accounts.map(a => `<option value="gdrive:${csEsc(a.id)}" ${selected === a.id ? 'selected' : ''}>Google Drive — ${csEsc(a.email)}</option>`);
  if (allowFolder) opts.push(`<option value="folder:">A folder on this computer (Dropbox, OneDrive, Nextcloud, NAS…)</option>`);
  return opts.join('');
}

function csNoAccountHint() {
  return cs.accounts.length ? '' : `<p class="cs-hint">No Google account is signed in on this machine. <button type="button" class="cs-link" id="cs-goto-accounts">Sign in under Cloud Suite Accounts</button> to use Google Drive, or use a folder on this computer.</p>`;
}

// ── Backup vault ─────────────────────────────────────────────────────────────

function csVaultPanel() {
  const v = cs.status.vault;
  if (!v) {
    return `${csNoAccountHint()}
    <div class="cs-two">
      <div class="cs-card" id="cs-create-card">
        <h3>Create a new vault</h3>
        <p class="cs-muted">Start your backup from this machine. RobOS creates a private folder that only you can open.</p>
        <label class="cs-field">Store it in<select id="cs-create-target" class="select-input">${csAccountOptions(cs.accounts[0]?.id, { allowFolder: true })}</select></label>
        <label class="cs-field hidden" id="cs-create-path-row">Parent folder<input id="cs-create-path" class="text-input" placeholder="~/Dropbox"></label>
        <label class="cs-field">Folder name<input id="cs-create-name" class="text-input" value="RobOS Config Vault"></label>
        <label class="cs-field"><span>Passphrase <span class="cs-muted">(optional: encrypts every file)</span></span><input id="cs-create-pass" type="password" class="text-input" autocomplete="new-password"></label>
        <button type="button" class="btn btn-primary" id="cs-create">Create vault</button>
      </div>
      <div class="cs-card" id="cs-connect-card">
        <h3>Use an existing vault</h3>
        <p class="cs-muted">Paste the folder link from your other machine. You review every change before anything on this machine is touched.</p>
        <label class="cs-field">Google account<select id="cs-connect-account" class="select-input">${csAccountOptions(cs.accounts[0]?.id)}<option value="">— a local folder path —</option></select></label>
        <label class="cs-field">Folder link, ID or path<input id="cs-connect-ref" class="text-input" placeholder="https://drive.google.com/drive/folders/…"></label>
        <label class="cs-field"><span>Passphrase <span class="cs-muted">(only if the vault has one)</span></span><input id="cs-connect-pass" type="password" class="text-input" autocomplete="off"></label>
        <button type="button" class="btn btn-primary" id="cs-connect">Connect</button>
      </div>
    </div>`;
  }
  const enabled = new Set(v.categories);
  const cats = cs.status.categories;
  return `
    <div class="cs-vault-head">
      <div>
        <div class="cs-title-row"><strong id="cs-vault-name">${csEsc(v.name)}</strong>
          <span class="cs-badge">${v.kind === 'gdrive' ? 'Google Drive' : 'Folder'}</span>
          ${v.encrypted ? '<span class="cs-badge cs-badge-good">Encrypted</span>' : ''}
          ${v.lastSyncAt ? '<span class="cs-badge cs-badge-good">Connected</span>' : '<span class="cs-badge cs-badge-warn">First sync pending</span>'}
        </div>
        <div class="cs-muted cs-small">Last sync ${csAgo(v.lastSyncAt)} · generation ${v.lastGeneration} · ${v.trackedFiles} files tracked · this machine is <strong>${csEsc(cs.status.machine.name)}</strong></div>
        <div class="cs-small"><code class="cs-url" id="cs-vault-url">${csEsc(v.url)}</code> <button type="button" class="cs-link" data-copy="${csEsc(v.url)}">Copy link</button></div>
      </div>
      <div class="cs-actions">
        <button type="button" class="btn" id="cs-review">Review changes</button>
        <button type="button" class="btn btn-primary" id="cs-sync">Sync now</button>
        <button type="button" class="btn" id="cs-disconnect">${cs.armed === 'disconnect' ? 'Click again to disconnect' : 'Disconnect'}</button>
      </div>
    </div>
    <div id="cs-plan">${cs.plan ? csPlanView(cs.plan) : ''}</div>
    <details class="cs-cats" ${cs.plan ? '' : 'open'}>
      <summary>What is backed up — ${enabled.size} of ${cats.length} categories</summary>
      <div class="cs-cat-grid">
        ${cats.map(c => `<label class="cs-cat"><input type="checkbox" data-cs-vault-cat="${c.id}" ${enabled.has(c.id) ? 'checked' : ''}>
          <span><strong>${csEsc(c.label)}</strong> <span class="cs-muted cs-small">${c.localFiles} files · ${csBytes(c.localBytes)}</span><br><span class="cs-muted cs-small">${csEsc(c.description)}</span></span></label>`).join('')}
      </div>
      <p class="cs-muted cs-small">Never copied: sign-in tokens, passwords and API keys, the Private Network machine key, caches, logs and downloaded media.</p>
    </details>`;
}

const CS_ACTION = {
  pull: ['↓', 'From vault', 'cs-act-pull'],
  push: ['↑', 'To vault', 'cs-act-push'],
  'delete-local': ['✕', 'Delete here', 'cs-act-del'],
  'delete-remote': ['✕', 'Delete in vault', 'cs-act-del'],
  conflict: ['⚠', 'Changed on both', 'cs-act-conflict'],
};

function csPlanView(plan) {
  const first = plan.firstSync ? `
    <div class="cs-first" id="cs-first-sync">
      <h3>First sync with this vault</h3>
      <p class="cs-muted cs-small">This machine has ${plan.local.files} files; the vault has ${plan.remote.files}${plan.remote.updatedBy ? `, last pushed by <strong>${csEsc(plan.remote.updatedBy.machineName)}</strong> ${csAgo(plan.remote.updatedAt)}` : ''}. How should files that differ be combined?</p>
      <div class="cs-strategies">
        ${[
          ['use-vault', 'Load the vault onto this machine', 'Files that differ come from the vault. Use this on a new or rebuilt machine.'],
          ['use-local', 'Upload this machine to the vault', 'Files that differ come from this machine.'],
          ['merge', 'Let me choose file by file', 'Files that differ are listed as conflicts below.'],
        ].map(([id, title, text]) => `<label class="cs-strategy ${plan.strategy === id ? 'active' : ''}"><input type="radio" name="cs-strategy" value="${id}" ${plan.strategy === id ? 'checked' : ''}>
          <span><strong>${title}</strong>${plan.recommended === id ? ' <span class="cs-badge cs-badge-good">Recommended</span>' : ''}<br><span class="cs-muted cs-small">${text}</span></span></label>`).join('')}
      </div>
      <p class="cs-muted cs-small">Nothing is deleted on the first sync. A restore point is saved before any file on this machine changes.</p>
    </div>` : '';
  const skipped = plan.local.skipped?.length ? `<p class="cs-hint" id="cs-skipped">Not backed up because they are too large: ${plan.local.skipped.map(s => `<code>${csEsc(s.rel)}</code>`).join(', ')}.</p>` : '';
  const c = plan.counts;
  const chips = [
    c.pull && `<span class="cs-chip cs-act-pull">↓ ${c.pull} from vault</span>`,
    c.push && `<span class="cs-chip cs-act-push">↑ ${c.push} to vault</span>`,
    (c['delete-local'] || c['delete-remote']) && `<span class="cs-chip cs-act-del">✕ ${(c['delete-local'] || 0) + (c['delete-remote'] || 0)} deleted</span>`,
    c.conflict && `<span class="cs-chip cs-act-conflict">⚠ ${c.conflict} conflict${c.conflict > 1 ? 's' : ''}</span>`,
  ].filter(Boolean).join('');
  if (!plan.actions.length) return `${first}${skipped}<div class="cs-uptodate" id="cs-uptodate">✓ This machine and the vault are in sync.</div>`;
  const byCat = new Map();
  for (const a of plan.actions) { if (!byCat.has(a.category)) byCat.set(a.category, []); byCat.get(a.category).push(a); }
  const label = id => cs.status.categories.find(x => x.id === id)?.label || id;
  const unresolved = plan.actions.filter(a => a.action === 'conflict' && !cs.resolutions[a.rel]).length;
  return `${first}${skipped}
    <div class="cs-plan-head"><div class="cs-chips">${chips}</div>
      <button type="button" class="btn btn-primary" id="cs-apply" ${unresolved ? 'disabled' : ''}>${unresolved ? `Resolve ${unresolved} conflict${unresolved > 1 ? 's' : ''} first` : `Apply ${plan.actions.length} change${plan.actions.length > 1 ? 's' : ''}`}</button></div>
    <div class="cs-table" id="cs-plan-table">
      ${[...byCat.entries()].map(([cat, rows]) => `<div class="cs-group">${csEsc(label(cat))}</div>` + rows.map(a => {
        const [icon, text, cls] = CS_ACTION[a.action];
        const detail = a.action === 'conflict'
          ? `<div class="cs-resolve" role="radiogroup" aria-label="Keep which version of ${csEsc(a.rel)}">
              <label><input type="radio" name="cs-res-${csEsc(a.rel)}" data-cs-res="${csEsc(a.rel)}" value="local" ${cs.resolutions[a.rel] === 'local' ? 'checked' : ''}> Keep this machine's <span class="cs-muted">(${csAgo(a.local?.mtime)})</span></label>
              <label><input type="radio" name="cs-res-${csEsc(a.rel)}" data-cs-res="${csEsc(a.rel)}" value="remote" ${cs.resolutions[a.rel] === 'remote' ? 'checked' : ''}> Take the vault's <span class="cs-muted">(from ${csEsc(a.remote?.by || 'vault')}, ${csAgo(a.remote?.mtime)})</span></label></div>`
          : `<span class="cs-muted cs-small">${a.remote?.by && a.action === 'pull' ? `from ${csEsc(a.remote.by)}` : ''}${a.removedSecrets ? ` · ${a.removedSecrets} credential(s) stay on this machine` : ''}</span>`;
        return `<div class="cs-row" data-cs-row="${csEsc(a.rel)}"><span class="cs-act ${cls}" title="${text}">${icon} ${text}</span><code class="cs-path">${csEsc(a.rel.replace(/^config\//, '~/.config/robos/').replace(/^robos\//, '~/.robos/'))}</code>${detail}</div>`;
      }).join('')).join('')}
    </div>`;
}

async function csLoadPlan(strategy) {
  csSay('Comparing this machine with the vault…');
  const plan = await csCall('planVaultSync', { strategy });
  if (!plan.ok) {
    if (plan.code === 'PASSPHRASE_REQUIRED' || plan.code === 'WRONG_PASSPHRASE') csSay(`${plan.error} Disconnect and connect again with the passphrase.`, 'error');
    else csSay(plan.error, 'error');
    return null;
  }
  cs.plan = plan;
  cs.strategy = plan.strategy;
  for (const rel of Object.keys(cs.resolutions)) if (!plan.actions.some(a => a.rel === rel && a.action === 'conflict')) delete cs.resolutions[rel];
  csRender();
  csSay(plan.actions.length ? `${plan.actions.length} change(s) to review.` : 'Up to date.');
  return plan;
}

async function csApply() {
  csSay('Syncing…');
  const res = await csCall('applyVaultSync', { strategy: cs.strategy, resolutions: cs.resolutions });
  if (!res.ok) {
    if (res.code === 'REMOTE_CHANGED') { await csLoadPlan(cs.strategy); csSay(res.error, 'error'); return res; }
    if (res.code === 'CONFLICTS') { await csLoadPlan(cs.strategy); csSay(res.error, 'error'); return res; }
    csSay(res.error, 'error'); return res;
  }
  cs.plan = null; cs.resolutions = {};
  await csRefresh();
  await csLoadPlan();
  csSay(`✓ Synced: ${res.pulled.length} file(s) from the vault, ${res.pushed.length} to the vault${res.deletedLocal.length + res.deletedRemote.length ? `, ${res.deletedLocal.length + res.deletedRemote.length} deleted` : ''}. Generation ${res.generation}.${res.restorePointId ? ' A restore point was saved.' : ''}`, 'good');
  return res;
}

function csArm(id, fn) {
  if (cs.armed === id) { cs.armed = null; return fn(); }
  cs.armed = id; csRender();
  setTimeout(() => { if (cs.armed === id) { cs.armed = null; csRender(); } }, 4000);
}

const csBind = {
  vault() {
    document.getElementById('cs-goto-accounts')?.addEventListener('click', () => document.getElementById('section-cloud_accounts')?.scrollIntoView());
    const target = document.getElementById('cs-create-target');
    if (target) {
      const sync = () => document.getElementById('cs-create-path-row').classList.toggle('hidden', !target.value.startsWith('folder:'));
      target.onchange = sync; sync();
      document.getElementById('cs-create').onclick = async () => {
        const [kind, accountId] = target.value.split(':');
        const name = document.getElementById('cs-create-name').value.trim() || 'RobOS Config Vault';
        const create = kind === 'gdrive' ? { kind, accountId, name } : { kind: 'folder', path: document.getElementById('cs-create-path').value.trim(), name };
        if (kind === 'folder' && !create.path) return csSay('Enter the folder on this computer to keep the vault in.', 'error');
        csSay('Creating the vault folder…');
        const res = await csCall('connectVault', { create, passphrase: document.getElementById('cs-create-pass').value || undefined });
        if (!res.ok) return csSay(res.error, 'error');
        cs.plan = res.plan; cs.strategy = res.plan.strategy; cs.resolutions = {};
        await csRefresh();
        csSay(`✓ Created ${res.vault.name}. Review and apply the first sync below.`, 'good');
      };
      document.getElementById('cs-connect').onclick = async () => {
        const accountId = document.getElementById('cs-connect-account').value.replace(/^gdrive:/, '') || undefined;
        const ref = document.getElementById('cs-connect-ref').value.trim();
        csSay('Opening the vault…');
        const res = await csCall('connectVault', { ref, accountId, passphrase: document.getElementById('cs-connect-pass').value || undefined });
        if (!res.ok) {
          if (res.code === 'PASSPHRASE_REQUIRED') document.getElementById('cs-connect-pass').focus();
          return csSay(res.error, 'error');
        }
        cs.plan = res.plan; cs.strategy = res.plan.strategy; cs.resolutions = {};
        await csRefresh();
        csSay(`✓ Connected to ${res.vault.name}. Review the first sync below.`, 'good');
      };
      return;
    }
    document.getElementById('cs-review').onclick = () => csLoadPlan(cs.plan?.firstSync ? cs.strategy : undefined);
    document.getElementById('cs-sync').onclick = async () => {
      const plan = cs.plan || await csLoadPlan();
      if (!plan) return;
      if (plan.actions.some(a => a.action === 'conflict' && !cs.resolutions[a.rel])) return csSay('Some files changed both here and in the vault. Choose which version to keep below.', 'error');
      return csApply();
    };
    document.getElementById('cs-disconnect').onclick = () => csArm('disconnect', async () => {
      await csCall('disconnectVault'); cs.plan = null; await csRefresh(); csSay('Disconnected. The vault folder is still in your cloud storage.');
    });
    document.getElementById('cs-apply')?.addEventListener('click', csApply);
    document.querySelectorAll('input[name="cs-strategy"]').forEach(r => { r.onchange = () => { cs.resolutions = {}; csLoadPlan(r.value); }; });
    document.querySelectorAll('[data-cs-res]').forEach(r => { r.onchange = () => { cs.resolutions[r.dataset.csRes] = r.value; csRender(); }; });
    document.querySelectorAll('[data-cs-vault-cat]').forEach(cb => {
      cb.onchange = async () => {
        const categories = [...document.querySelectorAll('[data-cs-vault-cat]:checked')].map(x => x.dataset.csVaultCat);
        await csCall('setVaultCategories', { categories });
        await csRefresh();
        if (cs.plan) await csLoadPlan(cs.strategy);
      };
    });
    csBindCopy();
  },
  share() { csBindShare(); },
  joined() { csBindJoined(); },
  restore() {
    document.querySelectorAll('[data-cs-restore-file]').forEach(b => {
      b.onclick = () => csArm(`restore:${b.dataset.csRestoreFile}:${b.dataset.rel}`, async () => {
        const res = await csCall('restoreRestorePoint', { id: b.dataset.csRestoreFile, files: [b.dataset.rel] });
        if (!res.ok) return csSay(res.error, 'error');
        await csRefresh();
        csSay(`✓ Restored ${b.dataset.rel.split('/').pop()}. Sync to send it to the vault, or restore again to undo.`, 'good');
      });
    });
    document.querySelectorAll('[data-cs-restore]').forEach(b => {
      b.onclick = () => csArm(`restore:${b.dataset.csRestore}`, async () => {
        const res = await csCall('restoreRestorePoint', { id: b.dataset.csRestore });
        if (!res.ok) return csSay(res.error, 'error');
        await csRefresh();
        csSay(`✓ Restored ${res.restored} file(s). The state before restoring is saved as a restore point too.`, 'good');
      });
    });
  },
};

function csBindCopy() {
  document.querySelectorAll('[data-copy]').forEach(b => {
    b.onclick = async () => {
      try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = 'Copied'; } catch { b.textContent = 'Select and copy'; }
      setTimeout(() => { b.textContent = 'Copy link'; }, 1600);
    };
  });
}

// ── Share ────────────────────────────────────────────────────────────────────

function csShareForm() {
  return {
    name: document.getElementById('cs-share-name')?.value.trim() || '',
    description: document.getElementById('cs-share-desc')?.value.trim() || '',
    categories: [...document.querySelectorAll('[data-cs-share-cat]:checked')].map(x => x.dataset.csShareCat),
    recipients: (document.getElementById('cs-share-to')?.value || '').split(/[\s,;]+/).filter(Boolean),
    passphrase: document.getElementById('cs-share-pass')?.value || undefined,
    includeNetworkSecret: Boolean(document.getElementById('cs-share-seal')?.checked),
    target: document.getElementById('cs-share-target')?.value || '',
    folder: document.getElementById('cs-share-folder')?.value.trim() || '',
  };
}

function csSharePanel() {
  const t = cs.status.templates.find(x => x.id === cs.shareTemplate) || cs.status.templates[0];
  const cats = cs.status.categories.filter(c => c.shareable);
  const pre = new Set(cs.shareDraft?.categories || t.categories);
  const draft = cs.shareDraft || {};
  const published = cs.status.shares;
  return `
    <div class="cs-templates" role="radiogroup" aria-label="Who is this for?">
      ${cs.status.templates.map(x => `<label class="cs-template ${x.id === t.id ? 'active' : ''}" data-cs-template="${x.id}"><input type="radio" name="cs-template" value="${x.id}" ${x.id === t.id ? 'checked' : ''}><strong>${csEsc(x.label)}</strong><span class="cs-muted cs-small">${csEsc(x.description)}</span></label>`).join('')}
    </div>
    <div class="cs-two">
      <div class="cs-card">
        <label class="cs-field">Share name<input id="cs-share-name" class="text-input" value="${csEsc(draft.name ?? (t.id === 'family' ? 'Family home network' : t.id === 'onboarding' ? 'Team onboarding' : t.id === 'coworker' ? 'Project handoff' : ''))}"></label>
        <label class="cs-field">Note for the people you share with<input id="cs-share-desc" class="text-input" value="${csEsc(draft.description || '')}" placeholder="What this sets up and anything they need to know"></label>
        <div class="cs-field">What to share
          <div class="cs-cat-list">${cats.map(c => `<label class="cs-cat cs-cat-compact"><input type="checkbox" data-cs-share-cat="${c.id}" ${pre.has(c.id) ? 'checked' : ''}><span><strong>${csEsc(c.label)}</strong> <span class="cs-muted cs-small">${c.localFiles} files</span></span></label>`).join('')}</div>
        </div>
      </div>
      <div class="cs-card">
        <label class="cs-field"><span>Share with <span class="cs-muted">(email addresses)</span></span><input id="cs-share-to" class="text-input" value="${csEsc((draft.recipients || []).join(', '))}" placeholder="sam@example.com, jordan@example.com"></label>
        <label class="cs-field">Publish to<select id="cs-share-target" class="select-input">${csAccountOptions(cs.accounts[0]?.id, { allowFolder: true })}</select></label>
        <label class="cs-field hidden" id="cs-share-folder-row">Parent folder<input id="cs-share-folder" class="text-input" placeholder="~/Dropbox/Shared"></label>
        <label class="cs-field"><span>Passphrase <span class="cs-muted">(optional: tell it to them in person or by phone)</span></span><input id="cs-share-pass" type="password" class="text-input" autocomplete="new-password" value="${csEsc(draft.passphrase || '')}"></label>
        <label class="cs-check"><input type="checkbox" id="cs-share-seal" ${draft.includeNetworkSecret ? 'checked' : ''}><span>Include the Private Network join secret <span class="cs-muted cs-small">(needs a passphrase and the Private Network category; lets them join your network without a separate invite)</span></span></label>
        <div class="cs-actions"><button type="button" class="btn" id="cs-share-preview">Preview</button><button type="button" class="btn btn-primary" id="cs-share-publish">Publish share</button></div>
      </div>
    </div>
    <div id="cs-share-result">${cs.lastPublished ? csPublishedCard(cs.lastPublished) : cs.sharePreview ? csSharePreviewView(cs.sharePreview) : ''}</div>
    <h3 class="cs-h3">Shares you publish</h3>
    ${published.length ? `<div class="cs-list" id="cs-published">${published.map(s => `
      <div class="cs-item" data-cs-share="${csEsc(s.id)}">
        <div><strong>${csEsc(s.name)}</strong> <span class="cs-badge">${csEsc(cs.status.templates.find(x => x.id === s.template)?.label || s.template)}</span>${s.encrypted ? ' <span class="cs-badge cs-badge-good">Encrypted</span>' : ''}
          <div class="cs-muted cs-small">Version ${s.generation} · published ${csAgo(s.publishedAt)} · ${s.files} files · ${s.categories.map(id => csEsc(cs.status.categories.find(c => c.id === id)?.label || id)).join(', ')}</div>
          <div class="cs-small">${s.recipients.length ? s.recipients.map(r => `<span class="cs-person ${r.ok ? '' : 'cs-person-bad'}" title="${csEsc(r.error || 'Has access')}">${r.ok ? '✓' : '✗'} ${csEsc(r.email)}</span>`).join(' ') : '<span class="cs-muted">Not shared with anyone yet</span>'}</div>
        </div>
        <div class="cs-actions">
          <input class="text-input cs-inline-input" placeholder="add email" data-cs-grant-input="${csEsc(s.id)}">
          <button type="button" class="btn" data-cs-grant="${csEsc(s.id)}">Add people</button>
          <button type="button" class="btn" data-cs-update="${csEsc(s.id)}">Publish update</button>
          <button type="button" class="btn" data-copy="${csEsc(s.url)}">Copy link</button>
        </div>
      </div>`).join('')}</div>` : '<p class="cs-muted cs-small">You have not published any shares from this machine.</p>'}`;
}

function csSharePreviewView(p) {
  const signIns = p.requires.filter(r => r.kind === 'sign-in');
  const conns = p.requires.filter(r => r.kind === 'connection');
  return `<div class="cs-card cs-preview" id="cs-share-preview-card">
    <h3>What they will get</h3>
    <div class="cs-chips">${p.categories.map(c => `<span class="cs-chip">${csEsc(c.label)} · ${c.files} files · ${csBytes(c.bytes)}</span>`).join('')}</div>
    ${p.sealedNetworkSecret ? '<p class="cs-small">🔒 The Private Network join secret is included, encrypted with your passphrase.</p>' : ''}
    <h4>Removed before sharing</h4>
    ${signIns.length ? `<ul class="cs-req">${signIns.map(r => `<li><strong>${csEsc(r.app)}</strong>: ${r.count} ${csEsc(r.keys.join(', '))}${r.where.length ? ` <span class="cs-muted">(${csEsc(r.where.join(', '))})</span>` : ''}</li>`).join('')}</ul>` : '<p class="cs-muted cs-small">No credentials were found in the shared files.</p>'}
    ${conns.length ? `<h4>Storage they will need</h4><ul class="cs-req">${conns.map(r => `<li>${csEsc(r.detail)}</li>`).join('')}</ul>` : ''}
  </div>`;
}

function csPublishedCard(r) {
  return `<div class="cs-card cs-published-card" id="cs-published-card">
    <h3>✓ Published “${csEsc(r.share.name)}”</h3>
    <p class="cs-small">Send this link to the people below. They open <strong>Preferences → Config Sync &amp; Sharing → Shared with me</strong> and paste it.${r.share.encrypted ? ' Tell them the passphrase separately.' : ''}</p>
    <div class="cs-linkbox"><code id="cs-share-link">${csEsc(r.url)}</code><button type="button" class="btn" data-copy="${csEsc(r.url)}">Copy link</button></div>
    <div class="cs-small">${r.grants.map(g => `<span class="cs-person ${g.ok ? '' : 'cs-person-bad'}">${g.ok ? '✓ Drive access granted to' : '✗'} ${csEsc(g.email)}${g.error ? ` — ${csEsc(g.error)}` : ''}</span>`).join(' ') || '<span class="cs-muted">No one has access yet. Add people below.</span>'}</div>
  </div>`;
}

function csBindShare() {
  const syncSeal = () => {
    const f = csShareForm();
    const seal = document.getElementById('cs-share-seal');
    const ok = Boolean(f.passphrase) && f.categories.includes('private-network');
    seal.disabled = !ok;
    if (!ok) seal.checked = false;
    document.getElementById('cs-share-folder-row').classList.toggle('hidden', !f.target.startsWith('folder:'));
  };
  document.querySelectorAll('input[name="cs-template"]').forEach(r => {
    r.onchange = () => {
      cs.shareTemplate = r.value; cs.shareDraft = null; cs.sharePreview = null; cs.lastPublished = null;
      const t = cs.status.templates.find(x => x.id === r.value);
      if (t?.sealNetworkSecret) cs.shareDraft = { categories: t.categories, includeNetworkSecret: true };
      csRender();
    };
  });
  ['cs-share-pass', 'cs-share-target'].forEach(id => document.getElementById(id)?.addEventListener('input', syncSeal));
  document.getElementById('cs-share-target')?.addEventListener('change', syncSeal);
  document.querySelectorAll('[data-cs-share-cat]').forEach(cb => cb.addEventListener('change', syncSeal));
  syncSeal();
  document.getElementById('cs-share-preview').onclick = async () => {
    const f = csShareForm();
    cs.shareDraft = f;
    const p = await csCall('previewShare', f);
    if (!p.ok) return csSay(p.error, 'error');
    cs.sharePreview = p; cs.lastPublished = null;
    csRender();
    document.getElementById('cs-share-preview-card')?.scrollIntoView({ block: 'nearest' });
    csSay(`${p.files.length} file(s) would be shared.`);
  };
  document.getElementById('cs-share-publish').onclick = async () => {
    const f = csShareForm();
    cs.shareDraft = f;
    const [kind, accountId] = f.target.split(':');
    const target = kind === 'gdrive' ? { kind, accountId } : { kind: 'folder', path: f.folder };
    csSay('Publishing…');
    const r = await csCall('publishShare', { ...f, template: cs.shareTemplate, target });
    if (!r.ok) return csSay(r.error, 'error');
    cs.lastPublished = r; cs.sharePreview = null; cs.shareDraft = null;
    await csRefresh();
    csSay(`✓ Published ${r.share.name}.`, 'good');
  };
  document.querySelectorAll('[data-cs-update]').forEach(b => {
    b.onclick = async () => {
      csSay('Publishing an update…');
      const r = await csCall('updateShare', { shareId: b.dataset.csUpdate });
      if (!r.ok) return csSay(r.error, 'error');
      await csRefresh();
      csSay(`✓ Published version ${r.generation} of ${r.share.name}. People who joined will see “Update available”.`, 'good');
    };
  });
  document.querySelectorAll('[data-cs-grant]').forEach(b => {
    b.onclick = async () => {
      const input = document.querySelector(`[data-cs-grant-input="${CSS.escape(b.dataset.csGrant)}"]`);
      const recipients = (input?.value || '').split(/[\s,;]+/).filter(Boolean);
      if (!recipients.length) return csSay('Type an email address first.', 'error');
      const r = await csCall('grantShare', { shareId: b.dataset.csGrant, recipients });
      if (!r.ok) return csSay(r.error, 'error');
      await csRefresh();
      csSay(r.grants.map(g => g.ok ? `✓ ${g.email} can open it` : `✗ ${g.email}: ${g.error}`).join(' · '), r.grants.every(g => g.ok) ? 'good' : 'error');
    };
  });
  csBindCopy();
}

// ── Shared with me ───────────────────────────────────────────────────────────

const CS_EFFECT = { add: 'New', merge: 'Merge', replace: 'Replace', same: 'Same' };

function csJoinedPanel() {
  const subs = cs.status.subscriptions;
  const p = cs.joinPreview;
  return `
    ${csNoAccountHint()}
    <div class="cs-card" id="cs-join-card">
      <h3>Open a share someone sent you</h3>
      <div class="cs-join-row">
        <label class="cs-field cs-grow">Share link<input id="cs-join-ref" class="text-input" placeholder="https://drive.google.com/drive/folders/…" value="${csEsc(cs.joinDraft?.ref || '')}"></label>
        <label class="cs-field">Open with<select id="cs-join-account" class="select-input">${csAccountOptions(cs.joinDraft?.accountId || cs.accounts[0]?.id)}<option value="">— a local folder path —</option></select></label>
        <label class="cs-field">Passphrase<input id="cs-join-pass" type="password" class="text-input" autocomplete="off" placeholder="if they gave you one"></label>
        <button type="button" class="btn btn-primary" id="cs-join-preview">Preview</button>
      </div>
    </div>
    ${p ? csJoinPreviewView(p) : ''}
    <div class="cs-h3-row"><h3 class="cs-h3">Shares you joined</h3>${subs.length ? '<button type="button" class="btn" id="cs-check-updates">Check for updates</button>' : ''}</div>
    ${subs.length ? `<div class="cs-list" id="cs-joined">${subs.map(s => {
      const update = s.latestGeneration > s.appliedGeneration;
      return `<div class="cs-item" data-cs-sub="${csEsc(s.id)}">
        <div><strong>${csEsc(s.name)}</strong> <span class="cs-muted cs-small">from ${csEsc(s.publisher?.name || '?')}${s.publisher?.email ? ` &lt;${csEsc(s.publisher.email)}&gt;` : ''}</span>
          ${update ? `<span class="cs-badge cs-badge-warn">Update available · version ${s.latestGeneration}</span>` : `<span class="cs-badge cs-badge-good">Up to date</span>`}
          <div class="cs-muted cs-small">Version ${s.appliedGeneration} applied ${csAgo(s.updatedAt)} · ${s.ownedItems} item(s) came from this share · ${s.categories.map(id => csEsc(cs.status.categories.find(c => c.id === id)?.label || id)).join(', ')}</div>
          ${s.error ? `<div class="cs-small cs-bad">${csEsc(s.error)}</div>` : ''}
        </div>
        <div class="cs-actions">
          ${update ? `<button type="button" class="btn btn-primary" data-cs-apply-update="${csEsc(s.id)}">Apply update</button>` : ''}
          <button type="button" class="btn" data-cs-leave="${csEsc(s.id)}">${cs.armed === `leave:${s.id}` ? `Click again: leave and remove ${s.ownedItems} item(s)` : 'Leave'}</button>
        </div>
      </div>`;
    }).join('')}</div>` : '<p class="cs-muted cs-small">You have not joined any shares on this machine.</p>'}`;
}

function csJoinPreviewView(p) {
  const s = p.share;
  return `<div class="cs-card cs-preview" id="cs-join-preview-card">
    <div class="cs-title-row"><h3>${csEsc(s.name)}</h3><span class="cs-badge">${csEsc(cs.status.templates.find(x => x.id === s.template)?.label || s.template)}</span>${s.encrypted ? '<span class="cs-badge cs-badge-good">Encrypted</span>' : ''}</div>
    <p class="cs-muted cs-small">From <strong>${csEsc(s.publisher?.name || '?')}</strong>${s.publisher?.email ? ` (${csEsc(s.publisher.email)})` : ''} · version ${s.generation} · updated ${csAgo(s.updatedAt)}${p.alreadyJoined ? ` · you applied version ${p.alreadyJoined.appliedGeneration}` : ''}</p>
    ${s.description ? `<p class="cs-note">“${csEsc(s.description)}”</p>` : ''}
    <p class="cs-small">Your own items stay. Lists are merged by id, and every item this share adds is remembered so leaving removes exactly those.</p>
    <div class="cs-join-cats">${p.categories.map(c => `
      <div class="cs-join-cat"><label class="cs-check"><input type="checkbox" data-cs-join-cat="${c.id}" checked><strong>${csEsc(c.label)}</strong></label>
        <ul class="cs-effects">${c.files.map(f => `<li><span class="cs-effect cs-effect-${f.effect}">${CS_EFFECT[f.effect]}</span> <code>${csEsc(f.rel.replace(/^config\//, '~/.config/robos/').replace(/^robos\//, '~/.robos/'))}</code>${f.stats && (f.stats.added || f.stats.updated) ? ` <span class="cs-muted cs-small">+${f.stats.added} new, ${f.stats.updated} changed</span>` : ''}</li>`).join('')}</ul></div>`).join('')}
    </div>
    ${p.connections.length ? `<h4>Storage</h4><ul class="cs-req">${p.connections.map(c => `<li>${csEsc(c.name)} <span class="cs-muted">(${csEsc(c.driverType)})</span> → ${c.mappedTo ? `uses your <strong>${csEsc(c.mappedName)}</strong> sign-in` : '<span class="cs-bad">no matching sign-in here: add one in Data Sources</span>'}</li>`).join('')}</ul>
      <p class="cs-muted cs-small">The files stay in ${csEsc(s.publisher?.name || 'the publisher')}'s storage. Ask them to share those folders with your account, or watch over a Private Network.</p>` : ''}
    ${p.requires.length ? `<h4>After joining, sign in to</h4><ul class="cs-req">${p.requires.map(r => `<li><label class="cs-check"><input type="checkbox"><span><strong>${csEsc(r.app)}</strong> <span class="cs-muted cs-small">${r.count} credential(s) were not shared${r.where?.length ? `: ${csEsc(r.where.join(', '))}` : ''}</span></span></label></li>`).join('')}</ul>` : ''}
    <div class="cs-actions"><button type="button" class="btn btn-primary" id="cs-join-apply">${p.alreadyJoined ? 'Apply this version' : 'Join and apply'}</button><button type="button" class="btn" id="cs-join-cancel">Cancel</button></div>
  </div>`;
}

function csBindJoined() {
  document.getElementById('cs-goto-accounts')?.addEventListener('click', () => document.getElementById('section-cloud_accounts')?.scrollIntoView());
  const draft = () => ({
    ref: document.getElementById('cs-join-ref').value.trim(),
    accountId: document.getElementById('cs-join-account').value.replace(/^gdrive:/, '') || undefined,
    passphrase: document.getElementById('cs-join-pass').value || cs.joinDraft?.passphrase || undefined,
  });
  document.getElementById('cs-join-preview').onclick = async () => {
    cs.joinDraft = draft();
    csSay('Opening the share…');
    const p = await csCall('previewJoin', cs.joinDraft);
    if (!p.ok) { cs.joinPreview = null; csRender(); return csSay(p.error, 'error'); }
    cs.joinPreview = p;
    csRender();
    csSay(`${p.share.name}: review what changes, then join.`);
  };
  document.getElementById('cs-join-cancel')?.addEventListener('click', () => { cs.joinPreview = null; csRender(); csSay(''); });
  document.getElementById('cs-join-apply')?.addEventListener('click', async () => {
    const categories = [...document.querySelectorAll('[data-cs-join-cat]:checked')].map(x => x.dataset.csJoinCat);
    csSay('Applying…');
    const r = await csCall('joinShare', { ...cs.joinDraft, categories });
    if (!r.ok) return csSay(r.error, 'error');
    cs.joinPreview = null; cs.joinDraft = null;
    await csRefresh();
    csSay(`✓ Joined ${r.subscription.name}: ${r.written.length} file(s) updated. A restore point was saved.`, 'good');
  });
  document.getElementById('cs-check-updates')?.addEventListener('click', async () => {
    const r = await csCall('checkSubscriptions');
    if (!r.ok) return csSay(r.error, 'error');
    await csRefresh();
    const n = r.subscriptions.filter(s => s.updateAvailable).length;
    csSay(n ? `${n} share(s) have an update.` : 'All shares are up to date.', n ? '' : 'good');
  });
  document.querySelectorAll('[data-cs-apply-update]').forEach(b => {
    b.onclick = async () => {
      csSay('Applying the update…');
      const r = await csCall('updateSubscription', { subscriptionId: b.dataset.csApplyUpdate });
      if (!r.ok) return csSay(r.error, 'error');
      await csRefresh();
      csSay(`✓ Applied version ${r.subscription.appliedGeneration} of ${r.subscription.name}.`, 'good');
    };
  });
  document.querySelectorAll('[data-cs-leave]').forEach(b => {
    b.onclick = () => csArm(`leave:${b.dataset.csLeave}`, async () => {
      const r = await csCall('leaveShare', { subscriptionId: b.dataset.csLeave, removeItems: true });
      if (!r.ok) return csSay(r.error, 'error');
      await csRefresh();
      csSay(`Left the share. Removed ${r.removedItems} item(s) and ${r.removedFiles} file(s) it added; your own items were kept.`, 'good');
    });
  });
}

// ── Restore points ───────────────────────────────────────────────────────────

function csRestorePanel() {
  const rps = cs.status.restorePoints;
  if (!rps.length) return '<p class="cs-muted cs-small">No restore points yet. One is saved automatically before Config Sync changes any file on this machine.</p>';
  return `<p class="cs-muted cs-small">Saved automatically before every sync, join, update or leave that changed files on this machine.</p>
    <div class="cs-list" id="cs-restore-list">${rps.map(rp => `
    <div class="cs-item"><div class="cs-grow"><strong>${csEsc(rp.reason)}</strong><div class="cs-muted cs-small">${new Date(rp.at).toLocaleString()} · ${rp.fileCount} file(s) as they were before</div>
        <ul class="cs-rp-files">${rp.files.slice(0, 8).map(f => `<li><code>${csEsc(f.replace(/^config\//, '~/.config/robos/').replace(/^robos\//, '~/.robos/'))}</code> <button type="button" class="cs-link" data-cs-restore-file="${csEsc(rp.id)}" data-rel="${csEsc(f)}">${cs.armed === `restore:${rp.id}:${f}` ? 'click again to restore this file' : 'restore this file'}</button></li>`).join('')}${rp.files.length > 8 ? `<li class="cs-muted">and ${rp.files.length - 8} more</li>` : ''}</ul></div>
      <div class="cs-actions"><button type="button" class="btn" data-cs-restore="${csEsc(rp.id)}">${cs.armed === `restore:${rp.id}` ? 'Click again to restore all' : 'Restore all'}</button></div></div>`).join('')}</div>`;
}

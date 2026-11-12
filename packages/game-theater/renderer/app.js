'use strict';

let appState = null;
let aiMode = 'generate';
let codeTab = 'server'; // 'server' | 'client'
let loadedGameDetail = null;
const sendingShareUids = new Set();
const recentlySentShareUntil = new Map();
const recentlyCopiedUidUntil = new Map();

const el = (id) => document.getElementById(id);

function isValidPlayerEmail(email) {
  const clean = String(email || '').trim().toLowerCase();
  if (!clean || !clean.includes('@')) return false;
  if (clean.endsWith('.local') || clean.endsWith('@localhost')) return false;
  return true;
}

function setBanner(msg, isError = false) {
  const b = el('status-banner');
  if (!msg) {
    b.classList.add('hidden');
    return;
  }
  b.textContent = msg;
  b.classList.toggle('error', Boolean(isError));
  b.classList.remove('hidden');
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function loadGameDetail(gameId) {
  if (!gameId) {
    loadedGameDetail = null;
    el('code-editor').value = '';
    el('btn-save-code').disabled = true;
    return;
  }
  const res = await window.robos.getGame(gameId);
  if (res?.ok && res.game) {
    loadedGameDetail = res.game;
    el('code-editor').value = codeTab === 'server' ? res.game.serverJs : res.game.clientGd;
    el('btn-save-code').disabled = false;
  }
}

async function refreshState() {
  const state = await window.robos.getState();
  if (!state?.ok) {
    setBanner(state?.error || 'Could not reach Game Theater server.', true);
    return;
  }
  appState = state;

  const ep = state.endpoints || {};
  el('endpoint-pill').textContent = ep.publicTunnelUrl
    ? `Public HTTPS: ${ep.publicTunnelUrl}`
    : `LAN HTTPS: ${ep.lanHttpsUrl || ep.localHttpUrl}`;

  const hostDocWrap = el('host-doc-link-wrap');
  if (state.hostDoc?.docUrl) {
    hostDocWrap.innerHTML = `<button class="link-btn" data-open-url="${esc(state.hostDoc.docUrl)}">📂 Host Directory Doc ↗</button>`;
  } else {
    hostDocWrap.innerHTML = '';
  }

  const now = Date.now();
  const onlineSet = new Set((state.lobby?.onlinePlayers || []).map((p) => p.uid));
  const tbody = el('players-tbody');
  tbody.innerHTML = (state.players || [])
    .map((p) => {
      const onlineDot = onlineSet.has(p.uid) ? '🟢 ' : '';
      const hasValidEmail = isValidPlayerEmail(p.email);
      const emailSub = hasValidEmail ? p.email : 'No Google email set';
      const targetHttpsUrl = p.lanHttpsLaunchUrl || p.launchUrl || p.localLaunchUrl;
      const shareUrl = p.doc?.docUrl || targetHttpsUrl;
      const docBtn = p.doc?.docUrl
        ? `<button class="link-btn" data-open-url="${esc(p.doc.docUrl)}" title="Open ${esc(p.name)}'s personal Google Doc">📄 Open Doc ↗</button>`
        : '<span class="muted">Not synced</span>';

      const isSending = sendingShareUids.has(p.uid);
      const isRecentlySent = (recentlySentShareUntil.get(p.uid) || 0) > now;
      const isRecentlyCopied = (recentlyCopiedUidUntil.get(p.uid) || 0) > now;

      const resendLabel = isSending
        ? '⏳ Sending...'
        : isRecentlySent
          ? '✅ Sent!'
          : '📨 Resend Share';
      const copyLabel = isRecentlyCopied ? '✅ Copied!' : '📋 Copy Link';

      return `
        <tr>
          <td>
            <strong>${onlineDot}${esc(p.avatar || '🎮')} ${esc(p.name)}</strong>
            <span class="player-sub">${esc(emailSub)}</span>
          </td>
          <td><code>@${esc(p.gamerTag)}</code></td>
          <td>
            <div class="doc-share-actions">
              ${docBtn}
              <button
                type="button"
                class="btn btn-secondary btn-xs"
                data-resend-uid="${esc(p.uid)}"
                data-resend-name="${esc(p.name)}"
                data-resend-email="${esc(p.email || '')}"
                data-resend-doc-url="${esc(shareUrl)}"
                ${isSending ? 'disabled' : ''}
                title="Sync personal Google Doc and resend share invitation email${hasValidEmail ? ` to ${esc(p.email)}` : ''}"
              >${resendLabel}</button>
              <button
                type="button"
                class="btn btn-secondary btn-xs"
                data-edit-share-uid="${esc(p.uid)}"
                data-edit-share-name="${esc(p.name)}"
                data-edit-share-email="${esc(hasValidEmail ? p.email : '')}"
                title="Send or resend share link to a specific email address"
              >✉️</button>
              <button
                type="button"
                class="btn btn-secondary btn-xs"
                data-copy-uid="${esc(p.uid)}"
                data-copy-name="${esc(p.name)}"
                data-copy-url="${esc(shareUrl)}"
                title="Copy share link to clipboard"
              >${copyLabel}</button>
            </div>
          </td>
          <td>
            <button class="btn btn-primary btn-sm" data-play-uid="${esc(p.uid)}" data-play-name="${esc(p.name)}" data-play-url="${esc(targetHttpsUrl)}">🎮 Play as ${esc(p.shortName || p.name)}</button>
          </td>
        </tr>`;
    })
    .join('');

  const games = state.lobby?.games || [];
  const activeGame = state.lobby?.activeGame || null;
  const select = el('game-select');
  if (games.length === 0) {
    select.innerHTML = '<option value="">No Games Generated Yet</option>';
    select.disabled = true;
    el('game-cap-pill').textContent = 'Stage: Empty';
    el('tab-modify').disabled = true;
    await loadGameDetail('');
  } else {
    select.disabled = false;
    el('tab-modify').disabled = false;
    select.innerHTML = games
      .map(
        (g) =>
          `<option value="${esc(g.id)}" ${activeGame?.id === g.id ? 'selected' : ''}>${esc(g.title)} (v${g.version} · max ${g.maxPlayers}P)</option>`,
      )
      .join('');
    if (activeGame) {
      const seatsCount = (state.lobby?.seats || []).length;
      el('game-cap-pill').textContent = `Seats: ${seatsCount}/${activeGame.maxPlayers} Max`;
      if (!loadedGameDetail || loadedGameDetail.id !== activeGame.id || loadedGameDetail.version !== activeGame.version) {
        await loadGameDetail(activeGame.id);
      }
    }
  }

  const ast = state.lobby?.agentStatus || {};
  if (ast.busy) {
    el('agent-live-status').textContent = `🤖 ${ast.requestedBy || 'Agent'}: ${ast.step || 'Working...'}`;
  } else if (ast.error) {
    el('agent-live-status').textContent = `⚠️ ${ast.error}`;
  } else if (ast.step) {
    el('agent-live-status').textContent = `✅ ${ast.step}`;
  }
}

function setAiMode(mode) {
  aiMode = mode;
  el('tab-generate').classList.toggle('active', mode === 'generate');
  el('tab-modify').classList.toggle('active', mode === 'modify');
  el('ai-game-title').style.display = mode === 'generate' ? '' : 'none';
  el('ai-game-prompt').placeholder =
    mode === 'generate'
      ? 'Describe your multiplayer game (e.g. "2-player Hangman, no more than 2 players allowed, random starter then alternate being the phrase chooser")...'
      : 'Describe how to modify the active game rules, server logic, or Godot 4 client UI...';
}

function setCodeTab(tab) {
  if (loadedGameDetail) {
    if (codeTab === 'server') loadedGameDetail.serverJs = el('code-editor').value;
    else loadedGameDetail.clientGd = el('code-editor').value;
  }
  codeTab = tab;
  el('code-tab-server').classList.toggle('active', tab === 'server');
  el('code-tab-client').classList.toggle('active', tab === 'client');
  if (loadedGameDetail) {
    el('code-editor').value = tab === 'server' ? loadedGameDetail.serverJs : loadedGameDetail.clientGd;
  }
}

function openResendDialog({ uid, name, email }) {
  const dlg = el('resend-share-dialog');
  if (!dlg) return;
  el('resend-dialog-uid').value = uid || '';
  el('resend-dialog-title').textContent = `📨 Resend Google Doc Share Link — ${name || 'Player'}`;
  el('resend-dialog-email').value = isValidPlayerEmail(email) ? email : '';
  el('resend-dialog-message').value = '';
  if (typeof dlg.showModal === 'function') dlg.showModal();
  el('resend-dialog-email').focus();
}

async function performResendShare({ uid, name, email, message = '', fallbackUrl = '' }) {
  if (!uid) return;
  sendingShareUids.add(uid);
  setBanner(`Syncing ${name || uid}'s Google Doc and resending share invitation to ${email}...`);
  await refreshState();
  try {
    const res = await window.robos.invitePlayer({ uid, email, message });
    if (res?.ok) {
      sendingShareUids.delete(uid);
      const docUrl = res.playerDoc?.docUrl || fallbackUrl;
      if (res.notificationEmailSent === false || res.delivery === 'owner-doc-ready') {
        recentlyCopiedUidUntil.set(uid, Date.now() + 4500);
        if (docUrl) await window.robos.copyText(docUrl);
        setBanner(
          `Google Drive suppresses self-share emails to ${res.invitedEmail} because you own this Doc — copied your Google Doc link to clipboard instead (click ✉️ to send to another email).`,
          true,
        );
      } else if (res.delivery === 'thunderbird-email') {
        recentlySentShareUntil.set(uid, Date.now() + 4500);
        if (docUrl) await window.robos.copyText(docUrl);
        setBanner(
          `Emailed ${res.player?.name || name}'s Google Doc share link to ${res.invitedEmail} via Thunderbird!`,
        );
      } else {
        recentlySentShareUntil.set(uid, Date.now() + 4500);
        setBanner(`Sent Google Doc share invitation email to ${res.player?.name || name} (${res.invitedEmail})!`);
      }
      await refreshState();
    } else {
      sendingShareUids.delete(uid);
      setBanner(res?.error || 'Failed to resend Google Doc share link.', true);
      await refreshState();
    }
  } catch (err) {
    sendingShareUids.delete(uid);
    setBanner(err?.message || 'Failed to resend Google Doc share link.', true);
    await refreshState();
  }
}

document.addEventListener('click', async (ev) => {
  const openBtn = ev.target.closest('[data-open-url]');
  if (openBtn) {
    window.robos.openExternal(openBtn.getAttribute('data-open-url'));
    return;
  }
  const resendBtn = ev.target.closest('[data-resend-uid]');
  if (resendBtn) {
    const uid = resendBtn.getAttribute('data-resend-uid');
    const name = resendBtn.getAttribute('data-resend-name') || uid;
    const email = (resendBtn.getAttribute('data-resend-email') || '').trim();
    const docUrl = resendBtn.getAttribute('data-resend-doc-url') || '';
    if (!isValidPlayerEmail(email) || ev.shiftKey) {
      openResendDialog({ uid, name, email });
      return;
    }
    await performResendShare({ uid, name, email, fallbackUrl: docUrl });
    return;
  }
  const editShareBtn = ev.target.closest('[data-edit-share-uid]');
  if (editShareBtn) {
    openResendDialog({
      uid: editShareBtn.getAttribute('data-edit-share-uid'),
      name: editShareBtn.getAttribute('data-edit-share-name'),
      email: editShareBtn.getAttribute('data-edit-share-email'),
    });
    return;
  }
  const copyBtn = ev.target.closest('[data-copy-url]');
  if (copyBtn) {
    const uid = copyBtn.getAttribute('data-copy-uid') || '';
    const name = copyBtn.getAttribute('data-copy-name') || 'player';
    const url = copyBtn.getAttribute('data-copy-url') || '';
    if (url) {
      await window.robos.copyText(url);
      if (uid) recentlyCopiedUidUntil.set(uid, Date.now() + 3500);
      setBanner(`Copied ${name}'s share link to clipboard!`);
      await refreshState();
    }
    return;
  }
  const playBtn = ev.target.closest('[data-play-uid]');
  if (playBtn) {
    await window.robos.openPlayerWindow({
      uid: playBtn.getAttribute('data-play-uid'),
      name: playBtn.getAttribute('data-play-name'),
      url: playBtn.getAttribute('data-play-url'),
    });
  }
});

el('btn-cancel-resend')?.addEventListener('click', () => {
  el('resend-share-dialog')?.close();
});

el('resend-share-form')?.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const uid = el('resend-dialog-uid').value.trim();
  const email = el('resend-dialog-email').value.trim();
  const message = el('resend-dialog-message').value.trim();
  if (!uid || !isValidPlayerEmail(email)) {
    setBanner('Please enter a valid Google email address.', true);
    return;
  }
  const playerObj = (appState?.players || []).find((p) => p.uid === uid);
  el('resend-share-dialog')?.close();
  await performResendShare({
    uid,
    name: playerObj?.name || uid,
    email,
    message,
    fallbackUrl: playerObj?.doc?.docUrl || playerObj?.launchUrl || '',
  });
});

el('btn-refresh').addEventListener('click', () => refreshState());

el('btn-sync-docs').addEventListener('click', async () => {
  const btn = el('btn-sync-docs');
  btn.disabled = true;
  setBanner('Syncing per-player Google Docs in Google Drive...');
  try {
    const res = await window.robos.syncDocs({});
    if (res?.ok) {
      setBanner(`Synced ${res.totalPlayerDocs} per-player Google Docs to Google Drive!`);
      await refreshState();
    } else {
      setBanner(res?.error || 'Google Doc sync failed.', true);
    }
  } finally {
    btn.disabled = false;
  }
});

el('add-player-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const name = el('new-player-name').value.trim();
  const gamerTag = el('new-player-tag').value.trim();
  const email = el('new-player-email').value.trim();
  if (!name) return;
  const res = await window.robos.addPlayer({ name, gamerTag, email });
  if (res?.ok) {
    el('new-player-name').value = '';
    el('new-player-tag').value = '';
    el('new-player-email').value = '';
    setBanner(`Added RobOS Game User "${res.player.name}". Click "Sync Per-Player Google Docs" to publish their Launch Doc.`);
    await refreshState();
  } else {
    setBanner(res?.error || 'Failed to add player.', true);
  }
});

el('tab-generate').addEventListener('click', () => setAiMode('generate'));
el('tab-modify').addEventListener('click', () => setAiMode('modify'));
el('code-tab-server').addEventListener('click', () => setCodeTab('server'));
el('code-tab-client').addEventListener('click', () => setCodeTab('client'));

el('game-select').addEventListener('change', async (ev) => {
  const gid = ev.target.value;
  if (!gid) return;
  await window.robos.selectGame(gid);
  await refreshState();
});

el('btn-run-agent').addEventListener('click', async () => {
  const prompt = el('ai-game-prompt').value.trim();
  const title = el('ai-game-title').value.trim();
  if (!prompt) {
    setBanner('Please enter a prompt for the RobOS Agent.', true);
    return;
  }
  const btn = el('btn-run-agent');
  btn.disabled = true;
  setBanner('RobOS Agent is dynamically generating and validating server.js + Godot 4 client.gd...');
  try {
    let res;
    if (aiMode === 'generate') {
      res = await window.robos.generateGame({ title, prompt });
    } else {
      const gameId = el('game-select').value;
      res = await window.robos.modifyGame({ gameId, prompt });
    }
    if (res?.ok) {
      el('ai-game-prompt').value = '';
      el('ai-game-title').value = '';
      setBanner(`Activated "${res.game.title}" (v${res.game.version}, max ${res.game.maxPlayers} players)!`);
      await refreshState();
    } else {
      setBanner(res?.error || 'Agent generation failed.', true);
    }
  } finally {
    btn.disabled = false;
  }
});

el('btn-save-code').addEventListener('click', async () => {
  if (!loadedGameDetail) return;
  if (codeTab === 'server') loadedGameDetail.serverJs = el('code-editor').value;
  else loadedGameDetail.clientGd = el('code-editor').value;

  const btn = el('btn-save-code');
  btn.disabled = true;
  setBanner('Validating Node VM + Headless Godot 4 compiler and hot-reloading...');
  try {
    const res = await window.robos.saveGameSource({
      gameId: loadedGameDetail.id,
      serverJs: loadedGameDetail.serverJs,
      clientGd: loadedGameDetail.clientGd,
    });
    if (res?.ok) {
      setBanner(`Validated & hot-reloaded "${res.game.title}" (v${res.game.version}) to all connected Godot 4 clients!`);
      await refreshState();
    } else {
      setBanner(res?.error || 'Validation failed.', true);
    }
  } finally {
    btn.disabled = false;
  }
});

refreshState();
setInterval(refreshState, 4000);

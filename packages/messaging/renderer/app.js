'use strict';

// RobOS Messaging window. Message text and names come from other people, so they are
// only ever put on the page with textContent, never as HTML.

const api = window.robos;

const state = {
  overview: null,
  view: 'inbox',
  networkId: null,
  tab: 'web',
  filter: '',
  conversations: [],
  conversationId: null,
  webviews: new Map(),
  signalLink: null,
  kdeDevices: null,
};

const $ = (id) => document.getElementById(id);

// append() and replaceChildren() would print null as text, so drop empty children first.
const kids = (...children) => children.flat().filter((c) => c != null && c !== false);

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function network(id) {
  return state.overview?.networks.find((n) => n.id === id) || null;
}

function relativeTime(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  const diff = Date.now() - date.getTime();
  if (diff < 60 * 1000) return 'now';
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)}m`;
  if (date.toDateString() === new Date().toDateString()) return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (diff < 6 * 24 * 60 * 60 * 1000) return date.toLocaleDateString([], { weekday: 'short' });
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function fullTime(iso) {
  return iso ? new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
}

// ── Sidebar ─────────────────────────────────────────────────────────────────

function networkStatus(n) {
  const parts = [];
  if (n.web?.enabled) parts.push('Web');
  if (n.api?.connected) parts.push(n.api.accountLabel || 'Connected');
  return parts.length ? parts.join(' · ') : 'Not set up';
}

function renderNav() {
  const list = $('network-list');
  list.replaceChildren(...state.overview.networks.map((n) => {
    const unread = (n.unread || 0) + (n.web?.unread || 0);
    const dot = el('span', { class: 'dot' });
    dot.style.background = n.color;
    return el('button', {
      class: `nav-item${state.view === 'network' && state.networkId === n.id ? ' active' : ''}`,
      id: `nav-${n.id}`,
      dataset: { network: n.id },
      onclick: () => openNetwork(n.id),
    },
    dot,
    el('span', { class: 'nav-label' }, n.label, el('span', { class: 'nav-status', text: networkStatus(n) })),
    unread ? el('span', { class: 'nav-count', text: String(unread) }) : null);
  }));

  const inboxUnread = state.overview.networks.reduce((sum, n) => sum + (n.unread || 0), 0);
  $('inbox-count').hidden = !inboxUnread;
  $('inbox-count').textContent = String(inboxUnread);
  $('nav-inbox').classList.toggle('active', state.view === 'inbox');
}

function showView(view) {
  state.view = view;
  for (const v of ['inbox', 'network', 'help']) $(`view-${v}`).hidden = v !== view;
  renderNav();
}

// ── Inbox ───────────────────────────────────────────────────────────────────

function readableNetworks() {
  return state.overview.networks.filter((n) => n.api?.connected);
}

function renderFilter() {
  const select = $('inbox-filter');
  const current = state.filter;
  select.replaceChildren(
    el('option', { value: '', text: 'All networks' }),
    ...readableNetworks().map((n) => el('option', { value: n.id, text: n.label })),
  );
  select.value = readableNetworks().some((n) => n.id === current) ? current : '';
  state.filter = select.value;
}

async function loadConversations() {
  state.conversations = await api.listConversations({ network: state.filter || null });
  renderConversations();
}

function renderConversations() {
  const list = $('conv-list');
  $('inbox-empty').hidden = state.conversations.length > 0;
  list.replaceChildren(...state.conversations.map((c) => {
    const n = network(c.network);
    const dot = el('span', { class: 'dot', title: c.networkLabel });
    dot.style.background = n?.color || '#00bcd4';
    const preview = c.lastMessage ? `${c.lastMessage.direction === 'out' ? 'You: ' : ''}${c.lastMessage.text.split('\n')[0]}` : '';
    return el('button', {
      class: `conv${c.id === state.conversationId ? ' active' : ''}${c.unread ? ' unread' : ''}`,
      dataset: { conversation: c.id },
      onclick: () => openConversation(c.id),
    },
    dot,
    el('span', { class: 'conv-title', text: c.title }),
    el('span', { class: 'conv-time', text: relativeTime(c.updatedAt) }),
    el('span', { class: 'conv-preview', text: preview }));
  }));
}

async function openConversation(id) {
  state.conversationId = id;
  const conv = await api.getConversation(id);
  $('new-message').hidden = true;
  if (!conv) {
    $('thread').hidden = true;
    $('thread-empty').hidden = false;
    return;
  }
  $('thread-empty').hidden = true;
  $('thread').hidden = false;
  $('thread-title').textContent = conv.title;
  const n = network(conv.network);
  $('thread-sub').textContent = `${conv.networkLabel}${conv.to ? ` · ${conv.to}` : ''}`;
  const msgs = $('messages');
  msgs.replaceChildren(...conv.messages.map((m) => el('div', { class: `msg ${m.direction}` },
    el('div', { class: 'msg-bubble', text: m.text }),
    el('div', { class: 'msg-meta', text: `${m.direction === 'out' ? 'You' : m.from} · ${fullTime(m.at)}` }))));
  msgs.scrollTop = msgs.scrollHeight;
  $('composer-error').hidden = true;
  const canSend = Boolean(n?.api?.connected);
  $('composer-text').disabled = !canSend;
  $('btn-send').disabled = !canSend;
  await refreshOverview();
  renderConversations();
}

async function sendInThread(event) {
  event.preventDefault();
  const text = $('composer-text').value;
  if (!text.trim() || !state.conversationId) return;
  $('btn-send').disabled = true;
  const result = await api.send({ conversationId: state.conversationId, text });
  $('btn-send').disabled = false;
  if (!result.ok) {
    $('composer-error').textContent = result.error;
    $('composer-error').hidden = false;
    return;
  }
  $('composer-text').value = '';
  await loadConversations();
  await openConversation(state.conversationId);
}

const RECIPIENT_HINTS = {
  signal: 'A phone number with country code. To write to a group, open its conversation from the inbox.',
  sms: 'A phone number. The text is sent by your phone through KDE Connect.',
  messenger: 'Meta only lets a Page message someone who wrote to it first. Answer from their conversation instead.',
  instagram: 'Meta only lets you message someone who wrote to you first. Answer from their conversation instead.',
};

function openNewMessage() {
  const sendable = state.overview.networks.filter((n) => n.api?.connected);
  $('thread').hidden = true;
  $('thread-empty').hidden = true;
  $('new-message').hidden = false;
  $('new-error').hidden = true;
  const select = $('new-network');
  if (!sendable.length) {
    select.replaceChildren(el('option', { value: '', text: 'Connect a network first' }));
    select.disabled = true;
  } else {
    select.disabled = false;
    const ordered = [...sendable].sort((a, b) => ['signal', 'sms'].indexOf(b.id) - ['signal', 'sms'].indexOf(a.id));
    select.replaceChildren(...ordered.map((n) => el('option', { value: n.id, text: n.label })));
  }
  updateNewHint();
  $('new-to').focus();
}

function updateNewHint() {
  $('new-hint').textContent = RECIPIENT_HINTS[$('new-network').value] || '';
}

async function sendNew(event) {
  event.preventDefault();
  const result = await api.send({ network: $('new-network').value, to: $('new-to').value.trim(), text: $('new-text').value });
  if (!result.ok) {
    $('new-error').textContent = result.error;
    $('new-error').hidden = false;
    return;
  }
  $('new-to').value = '';
  $('new-text').value = '';
  await loadConversations();
  await openConversation(result.conversationId);
}

// ── Network pages ───────────────────────────────────────────────────────────

function openNetwork(id, tab) {
  state.networkId = id;
  const n = network(id);
  state.tab = tab || (n.web ? 'web' : 'api');
  showView('network');
  renderNetwork();
}

function renderNetwork() {
  const n = network(state.networkId);
  if (!n) return;
  $('network-name').textContent = n.label;
  $('network-dot').style.background = n.color;
  $('tab-web').classList.toggle('active', state.tab === 'web');
  $('tab-api').classList.toggle('active', state.tab === 'api');
  $('panel-web').hidden = state.tab !== 'web';
  $('panel-api').hidden = state.tab !== 'api';
  renderWebPanel(n);
  if (state.tab === 'api') renderApiCard(n);
}

const WEB_INTRO = {
  messenger: 'Sign in to Facebook to use Messenger with your personal account. Your chats stay on Meta\'s site; RobOS shows the unread count and passes on notifications.',
  instagram: 'Sign in to Instagram to read and answer your direct messages with your personal account.',
  snapchat: 'Sign in to Snapchat for Web to chat with your friends. Snapchat for Web needs a recent Chrome, which RobOS Messaging presents itself as.',
  sms: 'Open Google Messages for Web, then scan the QR code it shows with the Messages app on your Android phone (Menu > Device pairing). Your texts then show here.',
};

function renderWebPanel(n) {
  // Keep every enabled network's webview alive; show only the current one.
  for (const [id, view] of state.webviews) view.classList.toggle('hidden-view', !(state.tab === 'web' && id === n.id));

  const enabled = Boolean(n.web?.enabled);
  $('web-host').hidden = !enabled;
  $('web-none').hidden = Boolean(n.web);
  $('web-none-text').textContent = n.webUnavailableReason || '';
  $('web-intro').hidden = !n.web || enabled;
  $('web-bar').hidden = !n.web || !enabled;
  if (!n.web) return;
  $('web-intro-title').textContent = `${n.label} on the web`;
  $('web-intro-text').textContent = WEB_INTRO[n.id] || '';
  $('web-bar-text').textContent = `Signed in separately from your other networks. Opens links in your browser.`;
  if (enabled) ensureWebview(n);
}

function ensureWebview(n) {
  if (state.webviews.has(n.id)) return state.webviews.get(n.id);
  const view = document.createElement('webview');
  view.id = `webview-${n.id}`;
  view.setAttribute('partition', n.web.partition);
  view.setAttribute('useragent', n.web.userAgent);
  view.setAttribute('allowpopups', '');
  view.setAttribute('src', n.web.src);
  view.addEventListener('page-title-updated', (event) => {
    const match = String(event.title || '').match(/\((\d+)\)/);
    const count = match ? Number(match[1]) : 0;
    if (count !== (n.web.unread || 0)) {
      n.web.unread = count;
      api.setWebUnread(n.id, count);
      renderNav();
    }
  });
  if (!(state.tab === 'web' && state.networkId === n.id)) view.classList.add('hidden-view');
  $('web-host').append(view);
  state.webviews.set(n.id, view);
  return view;
}

function dropWebview(id) {
  const view = state.webviews.get(id);
  if (view) view.remove();
  state.webviews.delete(id);
}

async function setWeb(enabled) {
  const id = state.networkId;
  state.overview = await api.setWebEnabled(id, enabled);
  if (!enabled) dropWebview(id);
  renderNetwork();
  renderNav();
}

async function signOutWeb() {
  const id = state.networkId;
  const n = network(id);
  if (!confirm(`Sign out of ${n.label} here? This clears its cookies and storage in RobOS Messaging.`)) return;
  const result = await api.signOutWeb(id);
  if (result.ok) state.overview = result.overview;
  state.overview = await api.setWebEnabled(id, false);
  dropWebview(id);
  renderNetwork();
  renderNav();
}

// ── Connector setup ─────────────────────────────────────────────────────────

const SETUP = {
  messenger: {
    steps: [
      ['Open ', { page: 'meta-apps', text: 'Meta for Developers' }, ' and create an app of type Business.'],
      ['Add the Messenger product and connect the Facebook Page whose inbox you want here.'],
      ['Generate a Page access token with the ', { code: 'pages_messaging' }, ', ', { code: 'pages_read_engagement' }, ' and ', { code: 'pages_manage_metadata' }, ' permissions.'],
      ['Copy the Page ID shown next to the token, then paste both below.'],
    ],
    docs: 'meta-messenger-docs',
  },
  instagram: {
    steps: [
      ['In the Instagram app, switch the account to a professional account (Settings > Account type and tools).'],
      ['Open ', { page: 'meta-apps', text: 'Meta for Developers' }, ', create an app and add the Instagram product with "API setup with Instagram login".'],
      ['Add your Instagram account and generate an access token. It needs the ', { code: 'instagram_business_basic' }, ' and ', { code: 'instagram_business_manage_messages' }, ' permissions.'],
      ['Paste the token below.'],
    ],
    docs: 'instagram-docs',
  },
  signal: {
    steps: [
      ['Install ', { page: 'signal-cli', text: 'signal-cli' }, ' on this computer (it needs Java 21 or newer).'],
      ['Press "Link this computer" and scan the code with Signal on your phone: Settings > Linked devices > Link new device.'],
      ['Enter your Signal number and press Connect.'],
    ],
  },
  sms: {
    steps: [
      ['Install KDE Connect on this computer (', { code: 'sudo apt install kdeconnect' }, ') and on your Android phone from Google Play or F-Droid. ', { page: 'kdeconnect', text: 'About KDE Connect' }],
      ['Pair them, and on the phone allow KDE Connect to send SMS.'],
      ['Press "Find phones", pick yours and press Connect.'],
      ['To read your texts as well, turn on Google Messages in the Web sign-in tab.'],
    ],
  },
};

function renderStep(parts) {
  return el('li', {}, ...parts.map((p) => {
    if (typeof p === 'string') return p;
    if (p.code) return el('code', { text: p.code });
    if (p.page) return el('button', { class: 'link-button', type: 'button', text: p.text, onclick: () => api.openSetupPage(p.page) });
    return '';
  }));
}

function renderApiCard(n) {
  const card = $('api-card');
  if (!n.api) {
    card.replaceChildren(...kids(
      el('h3', { text: 'No connector' }),
      el('p', { text: n.apiUnavailableReason || `${n.label} has no connector.` }),
      n.web ? el('p', { text: 'Use the Web sign-in tab instead.' }) : null,
    ));
    return;
  }

  const head = [el('h3', { text: n.api.label }), el('p', { text: n.api.summary })];

  if (n.api.connected) {
    card.replaceChildren(...kids(
      ...head,
      el('div', { class: 'connected-row' },
        el('span', { class: 'status-ok', text: `Connected as ${n.api.accountLabel}` }),
        el('span', { class: 'muted', text: n.api.lastSyncAt ? `Last checked ${fullTime(n.api.lastSyncAt)}` : (n.api.sendOnly ? 'Send only' : 'Not checked yet') })),
      n.api.lastError ? el('p', { class: 'status-err', id: 'api-last-error', text: n.api.lastError }) : null,
      el('div', { class: 'form-actions start' },
        n.api.sendOnly ? null : el('button', { class: 'btn', id: 'btn-api-refresh', text: 'Check now', onclick: async () => {
          const r = await api.refresh({ network: n.id });
          state.overview = r.overview;
          await loadConversations();
          renderNav();
          renderNetwork();
        } }),
        el('button', { class: 'btn danger', id: 'btn-api-disconnect', text: 'Disconnect', onclick: async () => {
          if (!confirm(`Disconnect ${n.label}? Its conversations are removed from the inbox and its token is deleted from this computer.`)) return;
          state.overview = await api.disconnectApi(n.id);
          renderFilter();
          await loadConversations();
          renderNav();
          renderNetwork();
        } })),
    ));
    return;
  }

  const setup = SETUP[n.id] || { steps: [] };
  const form = el('form', { class: 'form', id: 'api-form', style: 'padding:0' });
  const error = el('div', { class: 'form-error', id: 'api-error', hidden: true });

  if (n.id === 'signal') form.append(renderSignalLink());

  for (const field of n.api.fields) {
    if (n.id === 'sms' && field.id === 'deviceId') {
      form.append(renderKdeDevices());
      continue;
    }
    form.append(el('label', {}, field.label, el('input', {
      name: field.id,
      id: `api-field-${field.id}`,
      type: field.secret ? 'password' : 'text',
      autocomplete: 'off',
      spellcheck: 'false',
    })));
  }

  const submit = el('button', { class: 'btn primary', type: 'submit', id: 'btn-api-connect', text: 'Connect' });
  form.append(el('div', { class: 'form-actions start' }, submit), error);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(form).entries());
    submit.disabled = true;
    submit.textContent = 'Checking';
    const result = await api.connectApi(n.id, payload);
    submit.disabled = false;
    submit.textContent = 'Connect';
    if (!result.ok) {
      error.textContent = result.error;
      error.hidden = false;
      return;
    }
    state.overview = result.overview;
    renderFilter();
    await loadConversations();
    renderNav();
    renderNetwork();
  });

  card.replaceChildren(...kids(
    ...head,
    el('ol', { class: 'steps' }, ...setup.steps.map(renderStep)),
    setup.docs ? el('p', {}, el('button', { class: 'link-button', type: 'button', text: 'Meta\'s guide for this', onclick: () => api.openSetupPage(setup.docs) })) : null,
    form,
  ));
}

function renderSignalLink() {
  const box = el('div', { id: 'signal-link' });
  const link = state.signalLink;
  if (link?.state === 'waiting' && link.qr) {
    box.append(el('div', { class: 'qr' },
      el('img', { src: link.qr, alt: 'QR code to link this computer to Signal' }),
      el('div', {},
        el('p', { text: 'Scan this with Signal on your phone: Settings > Linked devices > Link new device.' }),
        el('button', { class: 'btn', type: 'button', text: 'Cancel', onclick: async () => {
          await api.cancelSignalLink();
          state.signalLink = null;
          renderNetwork();
        } }))));
  } else if (link?.state === 'waiting') {
    box.append(el('p', { text: `Open this address on your phone to link: ${link.uri}` }));
  } else if (link?.state === 'linked') {
    box.append(el('p', { class: 'status-ok', text: 'Linked. Enter your number and press Connect.' }));
  } else {
    if (link?.state === 'failed') box.append(el('p', { class: 'status-err', text: link.error || 'Linking failed.' }));
    box.append(el('div', { class: 'form-actions start' }, el('button', {
      class: 'btn', type: 'button', id: 'btn-signal-link', text: 'Link this computer',
      onclick: async (event) => {
        event.target.disabled = true;
        event.target.textContent = 'Starting signal-cli';
        state.signalLink = await api.startSignalLink();
        renderNetwork();
      },
    })));
  }
  return box;
}

function renderKdeDevices() {
  const box = el('div', { id: 'kde-devices' });
  const devices = state.kdeDevices;
  box.append(el('div', { class: 'form-actions start' }, el('button', {
    class: 'btn', type: 'button', id: 'btn-kde-find', text: 'Find phones',
    onclick: async () => {
      state.kdeDevices = await api.listKdeConnectDevices();
      renderNetwork();
    },
  })));
  if (devices && !devices.ok) box.append(el('p', { class: 'status-err', text: devices.error }));
  if (devices?.ok && !devices.devices.length) box.append(el('p', { class: 'muted', text: 'No paired phone is reachable. Open KDE Connect on the phone and try again.' }));
  if (devices?.ok && devices.devices.length) {
    box.append(el('div', { class: 'device-list' }, ...devices.devices.map((d, i) => el('label', {},
      el('input', { type: 'radio', name: 'deviceId', value: d.id, checked: i === 0 }),
      d.name))));
  }
  return box;
}

// ── Wiring ──────────────────────────────────────────────────────────────────

async function refreshOverview() {
  state.overview = await api.getOverview();
  renderNav();
}

async function init() {
  state.overview = await api.getOverview();
  renderNav();
  renderFilter();
  await loadConversations();
  for (const n of state.overview.networks) if (n.web?.enabled) ensureWebview(n);

  $('nav-inbox').addEventListener('click', () => showView('inbox'));
  $('nav-help').addEventListener('click', () => showView('help'));
  $('inbox-filter').addEventListener('change', async (e) => {
    state.filter = e.target.value;
    await loadConversations();
  });
  $('btn-refresh').addEventListener('click', async () => {
    const button = $('btn-refresh');
    button.disabled = true;
    const r = await api.refresh();
    button.disabled = false;
    state.overview = r.overview;
    renderNav();
    await loadConversations();
  });
  $('btn-new').addEventListener('click', openNewMessage);
  $('new-network').addEventListener('change', updateNewHint);
  $('new-form').addEventListener('submit', sendNew);
  $('new-cancel').addEventListener('click', () => {
    $('new-message').hidden = true;
    if (state.conversationId) openConversation(state.conversationId);
    else $('thread-empty').hidden = false;
  });
  $('composer').addEventListener('submit', sendInThread);
  $('composer-text').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      $('composer').requestSubmit();
    }
  });
  for (const tab of document.querySelectorAll('.tab')) {
    tab.addEventListener('click', () => {
      state.tab = tab.dataset.tab;
      renderNetwork();
    });
  }
  $('btn-web-on').addEventListener('click', () => setWeb(true));
  $('btn-web-off').addEventListener('click', () => setWeb(false));
  $('btn-web-signout').addEventListener('click', signOutWeb);
  $('btn-web-reload').addEventListener('click', () => state.webviews.get(state.networkId)?.reload());

  api.onEvent(async (event) => {
    if (event.type === 'signal-link') {
      state.signalLink = { ...state.signalLink, ...event.signalLink };
      if (state.view === 'network' && state.networkId === 'signal') renderNetwork();
      return;
    }
    if (event.type === 'messages' || event.type === 'sent') {
      await refreshOverview();
      await loadConversations();
      if (state.conversationId && event.type === 'messages' && event.messages.some((m) => m.conversationId === state.conversationId) && state.view === 'inbox') {
        await openConversation(state.conversationId);
      }
    }
  });
  api.onOpenConversation(async (id) => {
    showView('inbox');
    await loadConversations();
    await openConversation(id);
  });
}

init();

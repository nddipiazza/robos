'use strict';

// RobOS Messaging hub: one place where RobOS reads and sends chat messages on
// Messenger, Instagram, Snapchat, Signal and SMS.
//
// Each network can be reached in up to two ways:
//
//   web  The network's own web client, signed in inside RobOS Messaging (its own
//        isolated browser session per network). Works with personal accounts.
//        RobOS can show unread counts and notifications but cannot send on its own.
//
//   api  A connector RobOS can drive itself, so the inbox, the CLI and agents can
//        read and send:
//          messenger  Meta Messenger Platform, for a Facebook Page you manage
//          instagram  Instagram API with Instagram Login, for a professional account
//          signal     signal-cli, linked to your phone as a secondary device
//          sms        KDE Connect, sending through your Android phone
//        Snapchat has no public messaging API, so it is web only.
//
// Files under ~/.config/robos/messaging/:
//   accounts.json         which networks are on and each connector's non-secret settings
//   secrets.json          access tokens (mode 0600; Config Sync never copies it)
//   messages-cache.json   conversations fetched or received (never copied either)
//
// Nothing this module returns contains a token.

const fs = require('node:fs');
const path = require('node:path');
const { execFile, spawn } = require('node:child_process');

const GRAPH_VERSION = 'v24.0';
const REQUEST_TIMEOUT_MS = 20 * 1000;
const MAX_MESSAGES_PER_CONVERSATION = 200;
const MAX_TEXT_LENGTH = 2000;

const NETWORKS = [
  {
    id: 'messenger',
    label: 'Messenger',
    color: '#3b82f6',
    web: { url: 'https://www.facebook.com/messages/', host: 'facebook.com' },
    api: {
      kind: 'meta-page',
      label: 'Facebook Page inbox',
      summary: 'Read and answer messages sent to a Facebook Page you manage. Meta only lets a Page reply within 24 hours of the person\'s last message.',
      fields: [
        { id: 'pageId', label: 'Page ID', secret: false },
        { id: 'pageAccessToken', label: 'Page access token', secret: true },
      ],
      setupUrl: 'https://developers.facebook.com/apps/',
    },
  },
  {
    id: 'instagram',
    label: 'Instagram',
    color: '#ec4899',
    web: { url: 'https://www.instagram.com/direct/inbox/', host: 'instagram.com' },
    api: {
      kind: 'instagram-login',
      label: 'Instagram professional account',
      summary: 'Read and answer direct messages on an Instagram business or creator account. Personal accounts cannot use the API; use the web sign-in for those.',
      fields: [
        { id: 'accessToken', label: 'Instagram user access token', secret: true },
      ],
      setupUrl: 'https://developers.facebook.com/apps/',
    },
  },
  {
    id: 'snapchat',
    label: 'Snapchat',
    color: '#eab308',
    web: { url: 'https://www.snapchat.com/web', host: 'snapchat.com' },
    api: null,
    apiUnavailableReason: 'Snapchat has no public messaging API, so RobOS can only show Snapchat for Web.',
  },
  {
    id: 'signal',
    label: 'Signal',
    color: '#00bcd4',
    web: null,
    webUnavailableReason: 'Signal has no web client. Link this computer with signal-cli instead.',
    api: {
      kind: 'signal-cli',
      label: 'signal-cli linked device',
      summary: 'Link this computer to your phone\'s Signal account as a secondary device, the same way Signal Desktop is linked. Messages are end-to-end encrypted and stay on this computer.',
      fields: [
        { id: 'number', label: 'Your Signal phone number (+15551234567)', secret: false },
      ],
      setupUrl: 'https://github.com/AsamK/signal-cli',
    },
  },
  {
    id: 'sms',
    label: 'SMS',
    color: '#22c55e',
    web: { url: 'https://messages.google.com/web/conversations', host: 'messages.google.com' },
    api: {
      kind: 'kdeconnect',
      label: 'KDE Connect (send through your phone)',
      summary: 'Send text messages from your Android phone with KDE Connect. Reading texts happens in Google Messages for Web.',
      fields: [
        { id: 'deviceId', label: 'Phone', secret: false },
      ],
      setupUrl: 'https://kdeconnect.kde.org/',
      sendOnly: true,
    },
  },
];

const NETWORK_BY_ID = Object.fromEntries(NETWORKS.map((n) => [n.id, n]));

class MessagingError extends Error {
  constructor(message, { code = null, status = null } = {}) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function isTestMode(env) {
  return env.ROBOS_TEST === '1' || env.ROBOS_TEST_MODE === '1';
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, data, mode) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { encoding: 'utf8', ...(mode ? { mode } : {}) });
  fs.renameSync(tmp, file);
  if (mode) {
    try { fs.chmodSync(file, mode); } catch {}
  }
}

function cleanText(text) {
  const value = String(text ?? '').replace(/\r\n/g, '\n').trim();
  if (!value) throw new MessagingError('Write a message first.');
  if (value.length > MAX_TEXT_LENGTH) {
    throw new MessagingError(`Messages can be at most ${MAX_TEXT_LENGTH} characters.`);
  }
  return value;
}

function isoFrom(value) {
  if (value == null || value === '') return new Date().toISOString();
  const date = typeof value === 'number' ? new Date(value) : new Date(String(value));
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

// ── Meta Graph (Messenger Page inbox and Instagram) ─────────────────────────

function graphErrorMessage(body, status) {
  const err = body && body.error;
  if (!err) return `The request failed (HTTP ${status}).`;
  if (err.code === 190) return 'Meta rejected this access token. It may have expired; create a new one.';
  if (err.code === 10 || err.error_subcode === 2018278) {
    return 'Meta only allows a reply within 24 hours of the person\'s last message.';
  }
  if (err.code === 200 || err.code === 3) {
    return `This token is missing a permission Meta needs: ${err.message || 'check the app\'s permissions'}.`;
  }
  return err.message || `The request failed (HTTP ${status}).`;
}

function createGraphClient({ baseUrl, token, fetchImpl }) {
  async function call(method, endpoint, { query = {}, body = null } = {}) {
    const url = new URL(`${baseUrl}/${GRAPH_VERSION}/${endpoint.replace(/^\//, '')}`);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response;
    try {
      response = await fetchImpl(url.toString(), {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (error) {
      throw new MessagingError(
        error.name === 'AbortError' ? 'Meta did not answer in time.' : `Could not reach Meta: ${error.message}`,
      );
    } finally {
      clearTimeout(timer);
    }
    let parsed = null;
    try { parsed = await response.json(); } catch {}
    if (!response.ok || (parsed && parsed.error)) {
      throw new MessagingError(graphErrorMessage(parsed, response.status), {
        code: parsed?.error?.code ?? null,
        status: response.status,
      });
    }
    return parsed || {};
  }
  return {
    get: (endpoint, query) => call('GET', endpoint, { query }),
    post: (endpoint, body) => call('POST', endpoint, { body }),
  };
}

const CONVERSATION_FIELDS = 'participants,updated_time,messages.limit(25){id,message,from,created_time}';

function graphConversations(network, selfId, data) {
  return (data || []).map((conv) => {
    const people = conv.participants?.data || [];
    const peer = people.find((p) => String(p.id) !== String(selfId)) || people[0] || {};
    const peerName = peer.name || peer.username || 'Unknown';
    const messages = (conv.messages?.data || [])
      .filter((m) => m.message)
      .map((m) => {
        const fromId = String(m.from?.id ?? '');
        const outgoing = fromId === String(selfId);
        return {
          id: m.id,
          from: outgoing ? 'You' : (m.from?.name || m.from?.username || peerName),
          text: m.message,
          at: isoFrom(m.created_time),
          direction: outgoing ? 'out' : 'in',
        };
      })
      .sort((a, b) => a.at.localeCompare(b.at));
    return {
      id: `${network}:${conv.id}`,
      network,
      remoteId: conv.id,
      title: peerName,
      to: String(peer.id ?? ''),
      updatedAt: isoFrom(conv.updated_time),
      messages,
    };
  });
}

function createMetaPageConnector({ settings, secrets, baseUrl, fetchImpl }) {
  const pageId = String(settings.pageId || '').trim();
  const client = createGraphClient({ baseUrl, token: secrets.pageAccessToken, fetchImpl });
  return {
    async verify() {
      if (!pageId) throw new MessagingError('Enter the Page ID.');
      const page = await client.get(pageId, { fields: 'id,name' });
      return { accountLabel: page.name || `Page ${pageId}`, settings: { pageId: String(page.id || pageId) } };
    },
    async fetchConversations() {
      const result = await client.get(`${pageId}/conversations`, { platform: 'messenger', fields: CONVERSATION_FIELDS });
      return graphConversations('messenger', pageId, result.data);
    },
    async send({ to, text }) {
      const result = await client.post(`${pageId}/messages`, {
        recipient: { id: to },
        messaging_type: 'RESPONSE',
        message: { text },
      });
      return { remoteId: result.message_id || null };
    },
  };
}

function createInstagramConnector({ settings, secrets, baseUrl, fetchImpl }) {
  const client = createGraphClient({ baseUrl, token: secrets.accessToken, fetchImpl });
  let userId = String(settings.userId || '');
  return {
    async verify() {
      const me = await client.get('me', { fields: 'user_id,username' });
      userId = String(me.user_id || me.id || '');
      if (!userId) throw new MessagingError('Instagram did not return an account for this token.');
      return { accountLabel: me.username ? `@${me.username}` : `Account ${userId}`, settings: { userId } };
    },
    async fetchConversations() {
      const result = await client.get('me/conversations', { platform: 'instagram', fields: CONVERSATION_FIELDS });
      return graphConversations('instagram', userId, result.data);
    },
    async send({ to, text }) {
      const result = await client.post('me/messages', { recipient: { id: to }, message: { text } });
      return { remoteId: result.message_id || null };
    },
  };
}

// ── Command-line connectors (signal-cli, kdeconnect-cli) ────────────────────

function defaultRunCommand(bin, args, { timeoutMs = 60 * 1000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        if (error.code === 'ENOENT') {
          reject(new MessagingError(`${bin} is not installed.`, { code: 'not-installed' }));
          return;
        }
        const detail = String(stderr || error.message || '').trim().split('\n').slice(-1)[0];
        reject(new MessagingError(detail || `${bin} failed.`));
        return;
      }
      resolve({ stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

// signal-cli prints one JSON envelope per line with `-o json receive`.
function parseSignalEnvelopes(stdout, selfNumber) {
  const out = [];
  for (const line of String(stdout).split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;
    let parsed;
    try { parsed = JSON.parse(trimmed); } catch { continue; }
    const env = parsed.envelope || parsed;
    const data = env.dataMessage;
    const sent = env.syncMessage?.sentMessage;
    if (data && data.message) {
      const groupId = data.groupInfo?.groupId || null;
      const sender = env.sourceNumber || env.source || env.sourceUuid || 'unknown';
      out.push({
        conversationKey: groupId ? `group:${groupId}` : sender,
        title: groupId ? (data.groupInfo?.groupName || 'Signal group') : (env.sourceName || sender),
        to: groupId ? `group:${groupId}` : sender,
        message: {
          id: `${sender}:${data.timestamp || env.timestamp}`,
          from: env.sourceName || sender,
          text: data.message,
          at: isoFrom(data.timestamp || env.timestamp),
          direction: 'in',
        },
      });
    } else if (sent && sent.message) {
      // A message you sent from your phone, synced to this linked device.
      const groupId = sent.groupInfo?.groupId || null;
      const dest = sent.destinationNumber || sent.destination || sent.destinationUuid || selfNumber;
      out.push({
        conversationKey: groupId ? `group:${groupId}` : dest,
        // Keep whatever name the conversation already has.
        title: groupId ? (sent.groupInfo?.groupName || null) : null,
        to: groupId ? `group:${groupId}` : dest,
        message: {
          id: `${selfNumber}:${sent.timestamp || env.timestamp}`,
          from: 'You',
          text: sent.message,
          at: isoFrom(sent.timestamp || env.timestamp),
          direction: 'out',
        },
      });
    }
  }
  return out;
}

function createSignalConnector({ settings, runCommand, bin }) {
  const number = String(settings.number || '').trim();
  return {
    async verify() {
      if (!/^\+\d{6,15}$/.test(number)) throw new MessagingError('Enter the number with country code, like +15551234567.');
      const { stdout } = await runCommand(bin, ['-o', 'json', 'listAccounts'], { timeoutMs: 30 * 1000 });
      if (!stdout.includes(number)) {
        throw new MessagingError(`signal-cli has no account ${number} yet. Use "Link this computer" first.`);
      }
      return { accountLabel: number, settings: { number } };
    },
    // Signal delivers each message once: whatever this returns must be kept.
    async receive() {
      const { stdout } = await runCommand(bin, ['-a', number, '-o', 'json', 'receive', '--timeout', '2'], { timeoutMs: 90 * 1000 });
      return parseSignalEnvelopes(stdout, number);
    },
    async send({ to, text }) {
      const target = String(to || '');
      const args = ['-a', number, 'send', '-m', text];
      if (target.startsWith('group:')) args.push('-g', target.slice(6));
      else if (/^\+\d{6,15}$/.test(target)) args.push(target);
      else throw new MessagingError('Send to a phone number with country code, like +15551234567.');
      await runCommand(bin, args, { timeoutMs: 60 * 1000 });
      return { remoteId: null };
    },
  };
}

function parseKdeConnectDevices(stdout) {
  return String(stdout)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const space = line.indexOf(' ');
      return space > 0 ? { id: line.slice(0, space), name: line.slice(space + 1) } : { id: line, name: line };
    });
}

function createKdeConnectConnector({ settings, runCommand, bin }) {
  const deviceId = String(settings.deviceId || '').trim();
  return {
    async listDevices() {
      const { stdout } = await runCommand(bin, ['-a', '--id-name-only'], { timeoutMs: 15 * 1000 });
      return parseKdeConnectDevices(stdout);
    },
    async verify() {
      if (!deviceId) throw new MessagingError('Pick your phone first.');
      const devices = await this.listDevices();
      const device = devices.find((d) => d.id === deviceId);
      if (!device) throw new MessagingError('That phone is not reachable. Open KDE Connect on it and check it is paired.');
      return { accountLabel: device.name, settings: { deviceId } };
    },
    async send({ to, text }) {
      const target = String(to || '').replace(/[\s()-]/g, '');
      if (!/^\+?\d{3,15}$/.test(target)) throw new MessagingError('Send to a phone number, like +15551234567.');
      await runCommand(bin, ['-d', deviceId, '--send-sms', text, '--destination', target], { timeoutMs: 30 * 1000 });
      return { remoteId: null };
    },
  };
}

// ── Hub ─────────────────────────────────────────────────────────────────────

function createMessagingHub(options = {}) {
  const env = options.env || process.env;
  const testMode = isTestMode(env);
  const configDir = options.configDir;
  if (!configDir) throw new Error('createMessagingHub needs a configDir.');
  const dir = path.join(configDir, 'messaging');
  const accountsPath = path.join(dir, 'accounts.json');
  const secretsPath = path.join(dir, 'secrets.json');
  const cachePath = path.join(dir, 'messages-cache.json');
  const fetchImpl = options.fetchImpl || ((...args) => globalThis.fetch(...args));
  const runCommand = options.runCommand || defaultRunCommand;
  const now = options.now || (() => Date.now());
  // Only tests may point the connectors somewhere other than Meta and the real CLIs.
  const graphBase = (testMode && env.ROBOS_MESSAGING_GRAPH_URL) || options.graphBaseUrl || 'https://graph.facebook.com';
  const igBase = (testMode && env.ROBOS_MESSAGING_INSTAGRAM_URL) || options.instagramBaseUrl || 'https://graph.instagram.com';
  const signalBin = (testMode && env.ROBOS_MESSAGING_SIGNAL_BIN) || options.signalBin || 'signal-cli';
  const kdeBin = (testMode && env.ROBOS_MESSAGING_KDECONNECT_BIN) || options.kdeConnectBin || 'kdeconnect-cli';
  const allowNetwork = !testMode || Boolean(options.fetchImpl || env.ROBOS_MESSAGING_GRAPH_URL || env.ROBOS_MESSAGING_INSTAGRAM_URL);

  const listeners = new Set();
  let signalLink = null;

  function readAccounts() {
    const data = readJson(accountsPath, {});
    return { networks: data.networks && typeof data.networks === 'object' ? data.networks : {} };
  }
  function writeAccounts(data) { writeJson(accountsPath, data); }
  function readSecrets() { return readJson(secretsPath, {}) || {}; }
  function writeSecrets(data) { writeJson(secretsPath, data, 0o600); }
  function readCache() {
    const data = readJson(cachePath, {});
    return { conversations: data.conversations && typeof data.conversations === 'object' ? data.conversations : {} };
  }
  function writeCache(data) { writeJson(cachePath, data, 0o600); }

  function emit(event) {
    for (const fn of listeners) {
      try { fn(event); } catch {}
    }
  }

  function connectorFor(id) {
    const network = NETWORK_BY_ID[id];
    if (!network) throw new MessagingError(`Unknown network "${id}".`);
    if (!network.api) throw new MessagingError(network.apiUnavailableReason || `${network.label} has no API connector.`);
    const api = readAccounts().networks[id]?.api;
    if (!api || !api.connected) throw new MessagingError(`${network.label} is not connected. Connect it in RobOS Messaging first.`);
    return buildConnector(id, api.settings || {}, readSecrets()[id] || {});
  }

  function buildConnector(id, settings, secrets) {
    const kind = NETWORK_BY_ID[id].api.kind;
    if ((kind === 'meta-page' || kind === 'instagram-login') && !allowNetwork) {
      throw new MessagingError('Meta is not contacted in test mode.');
    }
    if (kind === 'meta-page') return createMetaPageConnector({ settings, secrets, baseUrl: graphBase, fetchImpl });
    if (kind === 'instagram-login') return createInstagramConnector({ settings, secrets, baseUrl: igBase, fetchImpl });
    if (kind === 'signal-cli') return createSignalConnector({ settings, runCommand, bin: signalBin });
    if (kind === 'kdeconnect') return createKdeConnectConnector({ settings, runCommand, bin: kdeBin });
    throw new MessagingError(`No connector for ${kind}.`);
  }

  function publicConversation(conv, { withMessages = false } = {}) {
    const last = conv.messages[conv.messages.length - 1] || null;
    const unread = conv.messages.filter((m) => m.direction === 'in' && (!conv.readAt || m.at > conv.readAt)).length;
    return {
      id: conv.id,
      network: conv.network,
      networkLabel: NETWORK_BY_ID[conv.network]?.label || conv.network,
      title: conv.title,
      to: conv.to,
      updatedAt: conv.updatedAt,
      unread,
      lastMessage: last ? { from: last.from, text: last.text, at: last.at, direction: last.direction } : null,
      ...(withMessages ? { messages: conv.messages.slice() } : {}),
    };
  }

  function mergeConversation(cache, incoming) {
    const existing = cache.conversations[incoming.id];
    const byId = new Map((existing?.messages || []).map((m) => [m.id, m]));
    for (const m of incoming.messages || []) byId.set(m.id, { ...byId.get(m.id), ...m });
    const messages = [...byId.values()].sort((a, b) => a.at.localeCompare(b.at)).slice(-MAX_MESSAGES_PER_CONVERSATION);
    const newIncoming = (incoming.messages || []).filter((m) => m.direction === 'in' && !existing?.messages?.some((e) => e.id === m.id));
    cache.conversations[incoming.id] = {
      id: incoming.id,
      network: incoming.network,
      remoteId: incoming.remoteId ?? existing?.remoteId ?? null,
      title: incoming.title || existing?.title || incoming.to || 'Conversation',
      to: incoming.to || existing?.to || '',
      updatedAt: [incoming.updatedAt, messages[messages.length - 1]?.at, existing?.updatedAt].filter(Boolean).sort().pop(),
      readAt: existing?.readAt || null,
      messages,
    };
    return newIncoming;
  }

  function getOverview() {
    const accounts = readAccounts();
    const cache = readCache();
    const unreadByNetwork = {};
    for (const conv of Object.values(cache.conversations)) {
      unreadByNetwork[conv.network] = (unreadByNetwork[conv.network] || 0) + publicConversation(conv).unread;
    }
    return {
      testMode,
      networks: NETWORKS.map((n) => {
        const entry = accounts.networks[n.id] || {};
        const api = entry.api || null;
        return {
          id: n.id,
          label: n.label,
          color: n.color,
          web: n.web ? { url: n.web.url, host: n.web.host, enabled: entry.webEnabled === true } : null,
          webUnavailableReason: n.webUnavailableReason || null,
          api: n.api
            ? {
                kind: n.api.kind,
                label: n.api.label,
                summary: n.api.summary,
                setupUrl: n.api.setupUrl,
                sendOnly: Boolean(n.api.sendOnly),
                fields: n.api.fields.map((f) => ({ id: f.id, label: f.label, secret: f.secret })),
                connected: Boolean(api?.connected),
                accountLabel: api?.accountLabel || null,
                connectedAt: api?.connectedAt || null,
                lastSyncAt: api?.lastSyncAt || null,
                lastError: api?.lastError || null,
              }
            : null,
          apiUnavailableReason: n.apiUnavailableReason || null,
          unread: unreadByNetwork[n.id] || 0,
        };
      }),
      signalLink: signalLink ? { uri: signalLink.uri, state: signalLink.state, error: signalLink.error } : null,
    };
  }

  function setWebEnabled(id, enabled) {
    const network = NETWORK_BY_ID[id];
    if (!network) throw new MessagingError(`Unknown network "${id}".`);
    if (!network.web) throw new MessagingError(network.webUnavailableReason || `${network.label} has no web client.`);
    const accounts = readAccounts();
    accounts.networks[id] = { ...(accounts.networks[id] || {}), webEnabled: Boolean(enabled) };
    writeAccounts(accounts);
    return getOverview();
  }

  // Saves a connector only after the service has accepted it.
  async function connectApi(id, payload = {}) {
    const network = NETWORK_BY_ID[id];
    if (!network) return { ok: false, error: `Unknown network "${id}".` };
    if (!network.api) return { ok: false, error: network.apiUnavailableReason };
    const settings = {};
    const secrets = {};
    for (const field of network.api.fields) {
      const value = String(payload[field.id] ?? '').trim();
      if (!value) return { ok: false, error: `Enter the ${field.label.toLowerCase()}.` };
      (field.secret ? secrets : settings)[field.id] = value;
    }
    try {
      const connector = buildConnector(id, settings, secrets);
      const verified = await connector.verify();
      const accounts = readAccounts();
      accounts.networks[id] = {
        ...(accounts.networks[id] || {}),
        api: {
          connected: true,
          accountLabel: verified.accountLabel,
          settings: { ...settings, ...verified.settings },
          connectedAt: new Date(now()).toISOString(),
          lastSyncAt: null,
          lastError: null,
        },
      };
      writeAccounts(accounts);
      if (Object.keys(secrets).length) {
        const all = readSecrets();
        all[id] = secrets;
        writeSecrets(all);
      }
      return { ok: true, overview: getOverview() };
    } catch (error) {
      return { ok: false, error: error.message, overview: getOverview() };
    }
  }

  function disconnectApi(id) {
    const accounts = readAccounts();
    if (accounts.networks[id]) {
      delete accounts.networks[id].api;
      writeAccounts(accounts);
    }
    const secrets = readSecrets();
    if (secrets[id]) {
      delete secrets[id];
      writeSecrets(secrets);
    }
    const cache = readCache();
    for (const [key, conv] of Object.entries(cache.conversations)) {
      if (conv.network === id) delete cache.conversations[key];
    }
    writeCache(cache);
    return getOverview();
  }

  function recordSync(id, error) {
    const accounts = readAccounts();
    const api = accounts.networks[id]?.api;
    if (!api) return;
    api.lastSyncAt = new Date(now()).toISOString();
    api.lastError = error ? String(error) : null;
    writeAccounts(accounts);
  }

  async function refreshNetwork(id) {
    const connector = connectorFor(id);
    const firstSync = !readAccounts().networks[id]?.api?.lastSyncAt;
    const cache = readCache();
    const fresh = [];
    if (connector.fetchConversations) {
      const conversations = await connector.fetchConversations();
      for (const conv of conversations) {
        const added = mergeConversation(cache, conv);
        // The first sync imports old conversations; only later ones are news.
        if (!firstSync) fresh.push(...added.map((m) => ({ conv: conv.id, message: m })));
      }
    } else if (connector.receive) {
      // Signal hands each message over once, so every one received is new.
      for (const item of await connector.receive()) {
        const convId = `${id}:${item.conversationKey}`;
        const added = mergeConversation(cache, {
          id: convId,
          network: id,
          title: item.title,
          to: item.to,
          updatedAt: item.message.at,
          messages: [item.message],
        });
        fresh.push(...added.map((m) => ({ conv: convId, message: m })));
      }
    }
    writeCache(cache);
    return fresh;
  }

  // Refreshes every connected network that can read. Never throws: errors are kept per network.
  async function refresh({ network = null } = {}) {
    const accounts = readAccounts();
    const ids = NETWORKS
      .filter((n) => n.api && !n.api.sendOnly && accounts.networks[n.id]?.api?.connected)
      .map((n) => n.id)
      .filter((id) => !network || id === network);
    const results = {};
    const newMessages = [];
    for (const id of ids) {
      try {
        const fresh = await refreshNetwork(id);
        recordSync(id, null);
        results[id] = { ok: true, newMessages: fresh.length };
        newMessages.push(...fresh.map((f) => ({ network: id, conversationId: f.conv, ...f.message })));
      } catch (error) {
        recordSync(id, error.message);
        results[id] = { ok: false, error: error.message };
      }
    }
    if (newMessages.length) emit({ type: 'messages', messages: newMessages });
    return { results, newMessages, overview: getOverview() };
  }

  function listConversations({ network = null } = {}) {
    const cache = readCache();
    return Object.values(cache.conversations)
      .filter((c) => !network || c.network === network)
      .map((c) => publicConversation(c))
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }

  function getConversation(id) {
    const conv = readCache().conversations[id];
    return conv ? publicConversation(conv, { withMessages: true }) : null;
  }

  function markRead(id) {
    const cache = readCache();
    const conv = cache.conversations[id];
    if (!conv) return null;
    conv.readAt = new Date(now()).toISOString();
    writeCache(cache);
    return publicConversation(conv);
  }

  // send({ conversationId, text }) answers a conversation; send({ network, to, text })
  // starts one (Signal and SMS take a phone number; Meta needs someone who wrote first).
  async function send({ conversationId = null, network = null, to = null, text } = {}) {
    try {
      const body = cleanText(text);
      let netId = network;
      let target = to;
      let convId = conversationId;
      if (conversationId) {
        const conv = readCache().conversations[conversationId];
        if (!conv) throw new MessagingError('That conversation is not in the inbox.');
        netId = conv.network;
        target = conv.to;
      }
      if (!netId) throw new MessagingError('Say which network to send on.');
      if (!target) throw new MessagingError('Say who to send to.');
      const connector = connectorFor(netId);
      const result = await connector.send({ to: target, text: body });
      const at = new Date(now()).toISOString();
      const message = { id: result.remoteId || `local-${now()}-${Math.random().toString(36).slice(2, 8)}`, from: 'You', text: body, at, direction: 'out' };
      const cache = readCache();
      if (!convId) {
        const existing = Object.values(cache.conversations).find((c) => c.network === netId && c.to === target);
        convId = existing ? existing.id : `${netId}:${target}`;
      }
      mergeConversation(cache, {
        id: convId,
        network: netId,
        title: cache.conversations[convId]?.title || String(target),
        to: target,
        updatedAt: at,
        messages: [message],
      });
      cache.conversations[convId].readAt = at;
      writeCache(cache);
      emit({ type: 'sent', conversationId: convId, message });
      return { ok: true, conversationId: convId, message };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  }

  async function listKdeConnectDevices() {
    try {
      const connector = createKdeConnectConnector({ settings: {}, runCommand, bin: kdeBin });
      return { ok: true, devices: await connector.listDevices() };
    } catch (error) {
      return { ok: false, error: error.message, devices: [] };
    }
  }

  // Starts `signal-cli link`, which prints a sgnl:// address to show as a QR code and
  // waits until the phone scans it (Signal > Settings > Linked devices).
  function startSignalLink({ deviceName = 'RobOS Messaging' } = {}) {
    if (signalLink && signalLink.state === 'waiting') return Promise.resolve(getOverview().signalLink);
    const spawnImpl = options.spawnImpl || spawn;
    return new Promise((resolve) => {
      let child;
      try {
        child = spawnImpl(signalBin, ['link', '-n', deviceName], { stdio: ['ignore', 'pipe', 'pipe'] });
      } catch (error) {
        signalLink = { state: 'failed', uri: null, error: error.message };
        resolve(getOverview().signalLink);
        return;
      }
      signalLink = { state: 'starting', uri: null, error: null, child };
      let settled = false;
      const settle = () => {
        if (!settled) {
          settled = true;
          resolve(getOverview().signalLink);
        }
      };
      let buffer = '';
      let errText = '';
      child.stdout.on('data', (chunk) => {
        buffer += chunk.toString();
        const match = buffer.match(/sgnl:\/\/linkdevice\?\S+|tsdevice:\/\?\S+/);
        if (match && !signalLink.uri) {
          signalLink.uri = match[0];
          signalLink.state = 'waiting';
          emit({ type: 'signal-link', signalLink: getOverview().signalLink });
          settle();
        }
      });
      child.stderr.on('data', (chunk) => { errText += chunk.toString(); });
      child.on('error', (error) => {
        signalLink = { state: 'failed', uri: null, error: error.code === 'ENOENT' ? 'signal-cli is not installed.' : error.message };
        emit({ type: 'signal-link', signalLink: getOverview().signalLink });
        settle();
      });
      child.on('close', (code) => {
        if (code === 0) {
          signalLink = { state: 'linked', uri: null, error: null };
        } else if (signalLink.state !== 'failed') {
          const detail = errText.trim().split('\n').slice(-1)[0];
          signalLink = { state: 'failed', uri: null, error: detail || `signal-cli link stopped (exit ${code}).` };
        }
        emit({ type: 'signal-link', signalLink: getOverview().signalLink });
        settle();
      });
    });
  }

  function cancelSignalLink() {
    if (signalLink?.child && signalLink.state !== 'linked') {
      try { signalLink.child.kill(); } catch {}
    }
    signalLink = null;
    return getOverview();
  }

  function onEvent(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  return {
    getOverview,
    setWebEnabled,
    connectApi,
    disconnectApi,
    refresh,
    listConversations,
    getConversation,
    markRead,
    send,
    listKdeConnectDevices,
    startSignalLink,
    cancelSignalLink,
    onEvent,
    paths: { dir, accountsPath, secretsPath, cachePath },
  };
}

module.exports = {
  NETWORKS,
  GRAPH_VERSION,
  MessagingError,
  createMessagingHub,
  parseSignalEnvelopes,
  parseKdeConnectDevices,
  graphConversations,
};

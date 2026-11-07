'use strict';
/* global browser, messenger */
// RobOS Thunderbird Bridge — background script.
// Connects to the RobOS native messaging host (thunderbird-bridge/host.cjs), which relays
// requests from local RobOS tools. Each request is { id, action, ...params }; each reply is
// { id, ok, result | error }. Sending uses Thunderbird's own MailExtension compose API, so
// mail goes out through the account's configured SMTP server and OAuth2 sign-in, and the
// sent copy lands in that account's Sent folder like any mail written by hand.

const HOST = 'robos_thunderbird_bridge';
let port = null;

async function listIdentities() {
  const accounts = await messenger.accounts.list(false);
  const out = [];
  for (const account of accounts) {
    for (const identity of account.identities || []) {
      out.push({
        id: identity.id,
        email: identity.email,
        name: identity.name,
        accountId: account.id,
        accountName: account.name,
        accountType: account.type,
      });
    }
  }
  return out;
}

async function pickIdentity(from) {
  const identities = await listIdentities();
  if (!identities.length) throw new Error('Thunderbird has no mail identities. Configure Gmail in RobOS Cloud Accounts first.');
  if (!from) {
    try {
      // The default account's first identity is the one Thunderbird's Write button uses.
      const def = await messenger.accounts.getDefault(false);
      const first = def?.identities?.[0];
      if (first) return identities.find((i) => i.id === first.id) || identities[0];
    } catch {}
    return identities[0];
  }
  const match = identities.find((i) => i.email.toLowerCase() === String(from).toLowerCase());
  if (!match) throw new Error(`No Thunderbird identity sends as ${from}. Known: ${identities.map((i) => i.email).join(', ')}`);
  return match;
}

function decodeAttachment(att) {
  const binary = atob(att.base64 || '');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { file: new File([bytes], att.name, { type: att.contentType || 'application/octet-stream' }), name: att.name };
}

async function send(msg) {
  const identity = await pickIdentity(msg.from);
  const details = {
    identityId: identity.id,
    to: msg.to || [],
    cc: msg.cc || [],
    bcc: msg.bcc || [],
    subject: msg.subject || '',
    isPlainText: !msg.html,
  };
  if (msg.html) details.body = msg.html;
  else details.plainTextBody = msg.text || '';
  if (Array.isArray(msg.attachments) && msg.attachments.length) details.attachments = msg.attachments.map(decodeAttachment);

  const tab = await messenger.compose.beginNew(details);
  try {
    const result = await messenger.compose.sendMessage(tab.id, { mode: msg.mode === 'sendLater' ? 'sendLater' : 'sendNow' });
    return {
      mode: result?.mode,
      headerMessageId: result?.headerMessageId || null,
      from: identity.email,
      sentCopies: (result?.messages || []).map((m) => ({ id: m.id, folder: m.folder?.path, subject: m.subject })),
    };
  } catch (err) {
    // A failed send leaves the compose window open; close it so retries start clean.
    try { await browser.tabs.remove(tab.id); } catch {}
    throw err;
  }
}

async function handle(msg) {
  switch (msg.action) {
    case 'ping': {
      const info = await browser.runtime.getBrowserInfo();
      return { bridge: browser.runtime.getManifest().version, thunderbird: info.version };
    }
    case 'identities':
      return listIdentities();
    case 'send':
      return send(msg);
    default:
      throw new Error(`Unknown action "${msg.action}"`);
  }
}

function connect() {
  port = browser.runtime.connectNative(HOST);
  port.onMessage.addListener(async (msg) => {
    const reply = { id: msg.id };
    try {
      reply.result = await handle(msg);
      reply.ok = true;
    } catch (err) {
      reply.ok = false;
      reply.error = String((err && err.message) || err);
    }
    try { port.postMessage(reply); } catch {}
  });
  port.onDisconnect.addListener((p) => {
    console.warn('RobOS bridge host disconnected', p?.error?.message || '');
    port = null;
    setTimeout(connect, 5000);
  });
}

connect();

'use strict';

// Unit tests for robos-lib/messaging-hub and robos-lib/messaging-cli: the Messenger
// Page and Instagram connectors against a local server that answers like Meta's Graph
// API, Signal through a fake signal-cli, SMS through a recorded kdeconnect-cli, how
// tokens are kept, and what Config Sync leaves behind.
//
// No traffic leaves the machine.

const { describe, it, after, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const libDir = path.resolve(__dirname, '..', '..', '..', 'robos-lib');
const messaging = require(path.join(libDir, 'messaging-hub'));
const cli = require(path.join(libDir, 'messaging-cli'));
const { EXCLUDE } = require(path.join(libDir, 'config-sync-catalog'));

const FAKE_SIGNAL = path.join(__dirname, 'fake-signal-cli.js');
const PAGE_TOKEN = 'EAAG-page-token-test';
const IG_TOKEN = 'IGAA-ig-token-test';
const PAGE_ID = '1122334455';
const IG_ID = '9988776655';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-messaging-'));
const cleanups = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()();
});
after(() => fs.rmSync(tmpRoot, { recursive: true, force: true }));

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(tmpRoot, `${prefix}-`));
}

const TEST_ENV = { ROBOS_TEST: '1' };

/** Answers like the Graph API for one Page (graph.facebook.com) and one IG account (graph.instagram.com). */
async function fakeGraph() {
  const requests = [];
  let conversations = [
    {
      id: 't_100',
      updated_time: '2026-11-01T10:05:00+0000',
      participants: { data: [{ id: PAGE_ID, name: 'Corner Bakery' }, { id: 'psid-ana', name: 'Ana Ruiz' }] },
      messages: { data: [
        { id: 'm_2', message: 'Thanks, see you then', from: { id: PAGE_ID, name: 'Corner Bakery' }, created_time: '2026-11-01T10:05:00+0000' },
        { id: 'm_1', message: 'Are you open Sunday?', from: { id: 'psid-ana', name: 'Ana Ruiz' }, created_time: '2026-11-01T10:00:00+0000' },
      ] },
    },
  ];
  const igConversations = [
    {
      id: 'ig_t_1',
      updated_time: '2026-11-02T09:00:00+0000',
      participants: { data: [{ id: IG_ID, username: 'cornerbakery' }, { id: 'igsid-ben', username: 'ben.k' }] },
      messages: { data: [{ id: 'ig_m_1', message: 'Do you deliver?', from: { id: 'igsid-ben', username: 'ben.k' }, created_time: '2026-11-02T09:00:00+0000' }] },
    },
  ];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const url = new URL(req.url, 'http://x');
      requests.push({ method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), auth: req.headers.authorization, body: body ? JSON.parse(body) : null });
      const send = (status, data) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      };
      const auth = req.headers.authorization;
      const ig = /\/me(\/|$)/.test(url.pathname);
      if (auth !== `Bearer ${ig ? IG_TOKEN : PAGE_TOKEN}`) {
        return send(401, { error: { code: 190, message: 'Invalid OAuth access token.' } });
      }
      const v = `/${messaging.GRAPH_VERSION}`;
      if (url.pathname === `${v}/${PAGE_ID}`) return send(200, { id: PAGE_ID, name: 'Corner Bakery' });
      if (url.pathname === `${v}/${PAGE_ID}/conversations`) return send(200, { data: conversations });
      if (url.pathname === `${v}/${PAGE_ID}/messages` && req.method === 'POST') {
        const parsed = JSON.parse(body);
        if (parsed.recipient.id === 'psid-old') {
          return send(400, { error: { code: 10, error_subcode: 2018278, message: 'outside window' } });
        }
        return send(200, { recipient_id: parsed.recipient.id, message_id: 'm_sent_1' });
      }
      if (url.pathname === `${v}/me`) return send(200, { user_id: IG_ID, username: 'cornerbakery' });
      if (url.pathname === `${v}/me/conversations`) return send(200, { data: igConversations });
      if (url.pathname === `${v}/me/messages` && req.method === 'POST') return send(200, { message_id: 'ig_sent_1' });
      return send(404, { error: { code: 803, message: `no route ${url.pathname}` } });
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  cleanups.push(() => new Promise((r) => server.close(r)));
  return {
    base,
    requests,
    addPageMessage(msg) {
      conversations = conversations.map((c) => ({ ...c, updated_time: msg.created_time, messages: { data: [msg, ...c.messages.data] } }));
    },
  };
}

function metaHub(graph, configDir = tempDir('cfg')) {
  const hub = messaging.createMessagingHub({
    configDir,
    env: { ...TEST_ENV, ROBOS_MESSAGING_GRAPH_URL: graph.base, ROBOS_MESSAGING_INSTAGRAM_URL: graph.base },
  });
  return { hub, configDir };
}

function signalHub({ accounts = ['+15550001111'], configDir = tempDir('cfg') } = {}) {
  const signalDir = tempDir('signal');
  fs.writeFileSync(path.join(signalDir, 'accounts.json'), JSON.stringify(accounts));
  process.env.FAKE_SIGNAL_DIR = signalDir;
  const hub = messaging.createMessagingHub({
    configDir,
    env: { ...TEST_ENV, ROBOS_MESSAGING_SIGNAL_BIN: FAKE_SIGNAL },
  });
  const deliver = (envelopes) => fs.appendFileSync(path.join(signalDir, 'inbox.jsonl'), envelopes.map((e) => `${JSON.stringify(e)}\n`).join(''));
  const sent = () => {
    try {
      return fs.readFileSync(path.join(signalDir, 'sent.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
    } catch { return []; }
  };
  return { hub, configDir, signalDir, deliver, sent };
}

function signalEnvelope({ from = '+15552223333', name = 'Dana', text, ts, group = null }) {
  return {
    envelope: {
      source: from, sourceNumber: from, sourceName: name, timestamp: ts,
      dataMessage: { timestamp: ts, message: text, ...(group ? { groupInfo: { groupId: group.id, groupName: group.name } } : {}) },
    },
    account: '+15550001111',
  };
}

describe('networks', () => {
  it('lists the five networks with how each can be reached', () => {
    const hub = messaging.createMessagingHub({ configDir: tempDir('cfg'), env: TEST_ENV });
    const { networks } = hub.getOverview();
    assert.deepStrictEqual(networks.map((n) => n.id), ['messenger', 'instagram', 'snapchat', 'signal', 'sms']);
    const byId = Object.fromEntries(networks.map((n) => [n.id, n]));
    assert.strictEqual(byId.snapchat.api, null, 'Snapchat has no API connector');
    assert.match(byId.snapchat.apiUnavailableReason, /no public messaging API/);
    assert.strictEqual(byId.signal.web, null, 'Signal has no web client');
    assert.ok(byId.sms.api.sendOnly);
    for (const n of networks) {
      if (n.web) assert.match(n.web.url, /^https:\/\//);
      assert.strictEqual(n.web?.enabled ?? false, false, 'nothing is on until the person turns it on');
    }
  });

  it('turns web sign-ins on and off, but not for a network without one', () => {
    const hub = messaging.createMessagingHub({ configDir: tempDir('cfg'), env: TEST_ENV });
    const on = hub.setWebEnabled('snapchat', true);
    assert.strictEqual(on.networks.find((n) => n.id === 'snapchat').web.enabled, true);
    const off = hub.setWebEnabled('snapchat', false);
    assert.strictEqual(off.networks.find((n) => n.id === 'snapchat').web.enabled, false);
    assert.throws(() => hub.setWebEnabled('signal', true), /no web client/);
  });
});

describe('Messenger Page connector', () => {
  it('rejects a bad token and saves nothing', async () => {
    const graph = await fakeGraph();
    const { hub, configDir } = metaHub(graph);
    const result = await hub.connectApi('messenger', { pageId: PAGE_ID, pageAccessToken: 'wrong' });
    assert.strictEqual(result.ok, false);
    assert.match(result.error, /rejected this access token/);
    assert.ok(!fs.existsSync(path.join(configDir, 'messaging', 'secrets.json')));
    assert.strictEqual(result.overview.networks[0].api.connected, false);
  });

  it('connects, imports conversations, and keeps the token out of everything it returns', async () => {
    const graph = await fakeGraph();
    const { hub, configDir } = metaHub(graph);
    const result = await hub.connectApi('messenger', { pageId: PAGE_ID, pageAccessToken: PAGE_TOKEN });
    assert.strictEqual(result.ok, true, result.error);
    assert.strictEqual(result.overview.networks[0].api.accountLabel, 'Corner Bakery');
    assert.ok(!JSON.stringify(result).includes(PAGE_TOKEN));

    const secretsFile = path.join(configDir, 'messaging', 'secrets.json');
    assert.strictEqual(fs.statSync(secretsFile).mode & 0o777, 0o600);
    assert.ok(fs.readFileSync(secretsFile, 'utf8').includes(PAGE_TOKEN));
    assert.ok(!fs.readFileSync(path.join(configDir, 'messaging', 'accounts.json'), 'utf8').includes(PAGE_TOKEN));

    const first = await hub.refresh();
    assert.strictEqual(first.results.messenger.ok, true);
    assert.strictEqual(first.newMessages.length, 0, 'the first sync imports history without calling it new');
    const [conv] = hub.listConversations();
    assert.strictEqual(conv.id, 'messenger:t_100');
    assert.strictEqual(conv.title, 'Ana Ruiz');
    assert.strictEqual(conv.to, 'psid-ana');
    const full = hub.getConversation(conv.id);
    assert.deepStrictEqual(full.messages.map((m) => [m.direction, m.text]), [['in', 'Are you open Sunday?'], ['out', 'Thanks, see you then']]);
    assert.strictEqual(graph.requests.find((r) => r.path.endsWith('/conversations')).query.platform, 'messenger');

    graph.addPageMessage({ id: 'm_3', message: 'Great!', from: { id: 'psid-ana', name: 'Ana Ruiz' }, created_time: '2026-11-01T10:10:00+0000' });
    const events = [];
    hub.onEvent((e) => events.push(e));
    const second = await hub.refresh();
    assert.deepStrictEqual(second.newMessages.map((m) => m.text), ['Great!']);
    assert.strictEqual(events[0].type, 'messages');
    assert.strictEqual(hub.listConversations()[0].unread, 2);
    hub.markRead(conv.id);
    assert.strictEqual(hub.listConversations()[0].unread, 0);
  });

  it('replies in a conversation as a RESPONSE and explains the 24-hour rule', async () => {
    const graph = await fakeGraph();
    const { hub } = metaHub(graph);
    await hub.connectApi('messenger', { pageId: PAGE_ID, pageAccessToken: PAGE_TOKEN });
    await hub.refresh();
    const sent = await hub.send({ conversationId: 'messenger:t_100', text: 'Yes, 8 to 2.' });
    assert.strictEqual(sent.ok, true, sent.error);
    const post = graph.requests.find((r) => r.method === 'POST');
    assert.deepStrictEqual(post.body, { recipient: { id: 'psid-ana' }, messaging_type: 'RESPONSE', message: { text: 'Yes, 8 to 2.' } });
    assert.strictEqual(post.auth, `Bearer ${PAGE_TOKEN}`);
    assert.ok(!post.query.access_token, 'the token never goes in the URL');
    const last = hub.getConversation('messenger:t_100').messages.at(-1);
    assert.deepStrictEqual([last.direction, last.text, last.id], ['out', 'Yes, 8 to 2.', 'm_sent_1']);

    const late = await hub.send({ network: 'messenger', to: 'psid-old', text: 'Hello?' });
    assert.strictEqual(late.ok, false);
    assert.match(late.error, /within 24 hours/);
  });

  it('refuses empty and overlong messages without calling Meta', async () => {
    const graph = await fakeGraph();
    const { hub } = metaHub(graph);
    await hub.connectApi('messenger', { pageId: PAGE_ID, pageAccessToken: PAGE_TOKEN });
    await hub.refresh();
    const before = graph.requests.length;
    assert.match((await hub.send({ conversationId: 'messenger:t_100', text: '   ' })).error, /Write a message/);
    assert.match((await hub.send({ conversationId: 'messenger:t_100', text: 'x'.repeat(2001) })).error, /at most 2000/);
    assert.strictEqual(graph.requests.length, before);
  });

  it('disconnecting deletes the token and the conversations', async () => {
    const graph = await fakeGraph();
    const { hub, configDir } = metaHub(graph);
    await hub.connectApi('messenger', { pageId: PAGE_ID, pageAccessToken: PAGE_TOKEN });
    await hub.refresh();
    hub.disconnectApi('messenger');
    assert.strictEqual(hub.listConversations().length, 0);
    assert.ok(!fs.readFileSync(path.join(configDir, 'messaging', 'secrets.json'), 'utf8').includes(PAGE_TOKEN));
    assert.match((await hub.send({ network: 'messenger', to: 'psid-ana', text: 'hi' })).error, /not connected/);
  });

  it('never contacts Meta in test mode unless a test server is given', async () => {
    const hub = messaging.createMessagingHub({ configDir: tempDir('cfg'), env: TEST_ENV });
    const result = await hub.connectApi('messenger', { pageId: PAGE_ID, pageAccessToken: PAGE_TOKEN });
    assert.strictEqual(result.ok, false);
    assert.match(result.error, /not contacted in test mode/);
  });
});

describe('Instagram connector', () => {
  it('connects with a token, finds the account id, reads and replies', async () => {
    const graph = await fakeGraph();
    const { hub } = metaHub(graph);
    const result = await hub.connectApi('instagram', { accessToken: IG_TOKEN });
    assert.strictEqual(result.ok, true, result.error);
    assert.strictEqual(result.overview.networks[1].api.accountLabel, '@cornerbakery');
    await hub.refresh({ network: 'instagram' });
    const [conv] = hub.listConversations({ network: 'instagram' });
    assert.strictEqual(conv.title, 'ben.k');
    assert.strictEqual(conv.lastMessage.direction, 'in');
    const sent = await hub.send({ conversationId: conv.id, text: 'Within 3 miles, yes.' });
    assert.strictEqual(sent.ok, true, sent.error);
    const post = graph.requests.find((r) => r.method === 'POST');
    assert.strictEqual(post.path, `/${messaging.GRAPH_VERSION}/me/messages`);
    assert.deepStrictEqual(post.body, { recipient: { id: 'igsid-ben' }, message: { text: 'Within 3 miles, yes.' } });
  });
});

describe('Signal connector (signal-cli)', () => {
  it('only connects a number signal-cli has linked', async () => {
    const { hub } = signalHub();
    assert.match((await hub.connectApi('signal', { number: '5550001111' })).error, /country code/);
    assert.match((await hub.connectApi('signal', { number: '+15559999999' })).error, /no account/);
    assert.strictEqual((await hub.connectApi('signal', { number: '+15550001111' })).ok, true);
  });

  it('keeps every received message, groups included, and sends to numbers and groups', async () => {
    const { hub, deliver, sent } = signalHub();
    await hub.connectApi('signal', { number: '+15550001111' });
    deliver([
      signalEnvelope({ text: 'Dinner at 7?', ts: Date.parse('2026-11-03T18:00:00Z') }),
      signalEnvelope({ text: 'Bring the board game', ts: Date.parse('2026-11-03T18:01:00Z'), from: '+15554445555', name: 'Eli', group: { id: 'R3JvdXA=', name: 'Family' } }),
    ]);
    const first = await hub.refresh({ network: 'signal' });
    assert.deepStrictEqual(first.newMessages.map((m) => m.text).sort(), ['Bring the board game', 'Dinner at 7?']);
    const second = await hub.refresh({ network: 'signal' });
    assert.strictEqual(second.newMessages.length, 0, 'signal-cli hands each message over once');
    assert.strictEqual(hub.getConversation('signal:+15552223333').messages.length, 1, 'received messages are kept after signal-cli forgets them');

    const group = hub.getConversation('signal:group:R3JvdXA=');
    assert.strictEqual(group.title, 'Family');
    assert.strictEqual((await hub.send({ conversationId: group.id, text: 'Will do' })).ok, true);
    assert.strictEqual((await hub.send({ network: 'signal', to: '+15556667777', text: 'New chat' })).ok, true);
    assert.deepStrictEqual(sent().map((s) => [s.group, s.recipient, s.message]), [
      ['R3JvdXA=', null, 'Will do'],
      [null, '+15556667777', 'New chat'],
    ]);
    assert.strictEqual(hub.getConversation('signal:+15556667777').messages[0].direction, 'out');
  });

  it('keeps a conversation name when a message you sent from your phone syncs in', () => {
    const items = messaging.parseSignalEnvelopes([
      JSON.stringify({ envelope: { sourceNumber: '+15550001111', timestamp: 5, syncMessage: { sentMessage: { destinationNumber: '+15552223333', message: 'from my phone', timestamp: 5 } } } }),
      'not json',
    ].join('\n'), '+15550001111');
    assert.strictEqual(items.length, 1);
    assert.strictEqual(items[0].title, null);
    assert.strictEqual(items[0].message.direction, 'out');
    assert.strictEqual(items[0].conversationKey, '+15552223333');
  });

  it('shows the link address that signal-cli prints and reports when linking is done', async () => {
    const { hub } = signalHub();
    const events = [];
    hub.onEvent((e) => events.push(e));
    const link = await hub.startSignalLink();
    assert.strictEqual(link.state, 'waiting');
    assert.match(link.uri, /^sgnl:\/\/linkdevice\?/);
    await new Promise((resolve) => {
      const timer = setInterval(() => {
        if (events.some((e) => e.signalLink?.state === 'linked')) {
          clearInterval(timer);
          resolve();
        }
      }, 50);
    });
    assert.strictEqual(hub.getOverview().signalLink.state, 'linked');
  });
});

describe('SMS connector (KDE Connect)', () => {
  function kdeHub() {
    const calls = [];
    const runCommand = async (bin, args) => {
      calls.push([bin, ...args]);
      if (args.includes('--id-name-only')) return { stdout: 'abc123 Pixel 8\nfff999 Old Tablet\n', stderr: '' };
      return { stdout: '', stderr: '' };
    };
    const hub = messaging.createMessagingHub({ configDir: tempDir('cfg'), env: TEST_ENV, runCommand });
    return { hub, calls };
  }

  it('lists reachable phones and sends a text through the chosen one', async () => {
    const { hub, calls } = kdeHub();
    const { devices } = await hub.listKdeConnectDevices();
    assert.deepStrictEqual(devices, [{ id: 'abc123', name: 'Pixel 8' }, { id: 'fff999', name: 'Old Tablet' }]);
    assert.match((await hub.connectApi('sms', { deviceId: 'nope' })).error, /not reachable/);
    const ok = await hub.connectApi('sms', { deviceId: 'abc123' });
    assert.strictEqual(ok.overview.networks.find((n) => n.id === 'sms').api.accountLabel, 'Pixel 8');
    const sent = await hub.send({ network: 'sms', to: '+1 (555) 222-3333', text: 'Running late' });
    assert.strictEqual(sent.ok, true, sent.error);
    assert.deepStrictEqual(calls.at(-1), ['kdeconnect-cli', '-d', 'abc123', '--send-sms', 'Running late', '--destination', '+15552223333']);
    const refresh = await hub.refresh();
    assert.deepStrictEqual(refresh.results, {}, 'SMS is send only, so refresh skips it');
  });

  it('says plainly when kdeconnect-cli is missing', async () => {
    const hub = messaging.createMessagingHub({ configDir: tempDir('cfg'), env: { ...TEST_ENV, ROBOS_MESSAGING_KDECONNECT_BIN: path.join(tmpRoot, 'no-such-kdeconnect') } });
    const result = await hub.listKdeConnectDevices();
    assert.strictEqual(result.ok, false);
    assert.match(result.error, /not installed/);
  });
});

describe('robos-messaging CLI', () => {
  it('lists networks, conversations, reads a thread and sends, with --json for agents', async () => {
    const { hub, deliver, sent } = signalHub();
    await hub.connectApi('signal', { number: '+15550001111' });
    deliver([signalEnvelope({ text: 'Can you pick up milk?', ts: Date.parse('2026-11-04T08:00:00Z') })]);
    const lines = [];
    const out = (line) => lines.push(line);

    assert.strictEqual(await cli.run(['networks', '--json'], { hub, out }), 0);
    const nets = JSON.parse(lines.pop());
    assert.deepStrictEqual(nets.find((n) => n.id === 'signal'), { id: 'signal', label: 'Signal', web: 'none', api: 'connected (+15550001111)', canSend: true, canRead: true, unread: 0 });

    assert.strictEqual(await cli.run(['refresh'], { hub, out }), 0);
    assert.match(lines.pop(), /signal: 1 new/);

    assert.strictEqual(await cli.run(['conversations', '--json'], { hub, out }), 0);
    const [conv] = JSON.parse(lines.pop());
    assert.strictEqual(conv.id, 'signal:+15552223333');
    assert.strictEqual(conv.unread, 1);

    assert.strictEqual(await cli.run(['read', conv.id], { hub, out }), 0);
    assert.match(lines.pop(), /Dana: Can you pick up milk\?/);
    assert.strictEqual(hub.listConversations()[0].unread, 0, 'reading marks it read');

    assert.strictEqual(await cli.run(['send', '--conversation', conv.id, 'On', 'it'], { hub, out }), 0);
    assert.strictEqual(sent().at(-1).message, 'On it');
    assert.strictEqual(await cli.run(['send', '--network', 'snapchat', '--to', 'x', 'hi', '--json'], { hub, out }), 2);
    assert.match(JSON.parse(lines.pop()).error, /no public messaging API/);
  });
});

describe('Config Sync', () => {
  it('never copies tokens or messages', () => {
    for (const file of ['config/messaging/secrets.json', 'config/messaging/messages-cache.json']) {
      assert.ok(EXCLUDE.includes(file), `${file} is excluded`);
    }
  });
});

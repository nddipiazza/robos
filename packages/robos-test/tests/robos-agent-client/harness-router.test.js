'use strict';

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const {
  HarnessRouterClient,
  EmbeddedHarnessRouter,
  getHarnessRouter,
  UHP_SPEC_VERSION,
  DEFAULT_UHP_URL,
} = require('../../../robos-agent-client/harness-router');

const { HarnessRouterBackend } = require('../../../robos-agent-client/harness-backend');

// ── Mock UHP HTTP Server for Testing Client ─────────────────────────────────

describe('HarnessRouterClient with UHP Server', () => {
  let server = null;
  let port = null;
  let client = null;
  let receivedRequests = [];

  before(async () => {
    return new Promise((resolve) => {
      server = http.createServer((req, res) => {
      let body = '';
      req.on('data', c => { body += c; });
      req.on('end', () => {
        receivedRequests.push({
          method: req.method,
          url: req.url,
          headers: req.headers,
          body: body ? JSON.parse(body) : null,
        });

        if (req.url === '/v1/uhp' && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json', 'UHP-Version': UHP_SPEC_VERSION });
          res.end(JSON.stringify({
            object: 'uhp_discovery',
            protocol_versions: ['2026-08-11'],
            default_version: '2026-08-11',
            conformance_class: 'Full',
            implementation: { name: 'HarnessRouter Community Edition', license: 'Apache-2.0' },
            capabilities: { sessions: true, streaming: true, idempotency: true },
          }));
        } else if (req.url === '/v1/harnesses' && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json', 'UHP-Version': UHP_SPEC_VERSION });
          res.end(JSON.stringify({
            object: 'list',
            data: [
              { id: 'chrn_claude', object: 'harness', name: 'Claude Code', base: 'claude-code' },
              { id: 'chrn_codex', object: 'harness', name: 'OpenAI Codex', base: 'codex' },
              { id: 'chrn_gemini', object: 'harness', name: 'Gemini CLI', base: 'gemini-cli' },
            ],
          }));
        } else if (req.url === '/v1/harnesses/chrn_claude' && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json', 'UHP-Version': UHP_SPEC_VERSION });
          res.end(JSON.stringify({ id: 'chrn_claude', name: 'Claude Code', base: 'claude-code' }));
        } else if (req.url === '/v1/models' && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json', 'UHP-Version': UHP_SPEC_VERSION });
          res.end(JSON.stringify({
            object: 'list',
            data: [{ id: 'claude-3-7-sonnet', provider: 'Anthropic' }],
          }));
        } else if (req.url === '/v1/responses' && req.method === 'POST') {
          const parsed = body ? JSON.parse(body) : {};
          if (parsed.stream) {
            res.writeHead(200, {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              'UHP-Version': UHP_SPEC_VERSION,
            });
            res.write('event: task.progress\ndata: {"status":"running"}\n\n');
            res.write('event: task.delta\ndata: {"delta":"Hello from UHP"}\n\n');
            res.write('event: task.completed\ndata: {"id":"resp_123","status":"completed","output":"Hello from UHP"}\n\n');
            res.end();
          } else {
            res.writeHead(200, { 'Content-Type': 'application/json', 'UHP-Version': UHP_SPEC_VERSION });
            res.end(JSON.stringify({
              id: 'resp_123',
              object: 'response',
              status: 'completed',
              output: 'Buffered response',
              metadata: { harness_id: parsed.metadata?.harness_id || 'default' },
            }));
          }
        } else if (req.url === '/v1/responses/resp_123/cancel' && req.method === 'POST') {
          res.writeHead(200, { 'Content-Type': 'application/json', 'UHP-Version': UHP_SPEC_VERSION });
          res.end(JSON.stringify({ id: 'resp_123', status: 'cancelled' }));
        } else if (req.url === '/v1/sessions' && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json', 'UHP-Version': UHP_SPEC_VERSION });
          res.end(JSON.stringify({
            object: 'list',
            data: [{ id: 'hsess_1', harness_id: 'chrn_gemini', turns: [] }],
          }));
        } else if (req.url === '/v1/sessions/hsess_1' && req.method === 'DELETE') {
          res.writeHead(200, { 'Content-Type': 'application/json', 'UHP-Version': UHP_SPEC_VERSION });
          res.end(JSON.stringify({ id: 'hsess_1', object: 'session', deleted: true }));
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { code: 'not_found', message: 'Route not found' } }));
        }
      });
    });

    server.listen(0, '127.0.0.1', () => {
      port = server.address().port;
      client = new HarnessRouterClient({ baseUrl: `http://127.0.0.1:${port}` });
      resolve();
    });
    });
  });

  after(async () => {
    return new Promise((resolve) => {
      if (server) server.close(resolve);
      else resolve();
    });
  });

  beforeEach(() => {
    receivedRequests = [];
  });

  it('correctly discovers UHP capability via getUHPInfo()', async () => {
    const res = await client.getUHPInfo();
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.default_version, '2026-08-11');
    assert.strictEqual(res.data.conformance_class, 'Full');
    assert.strictEqual(res.data.implementation.license, 'Apache-2.0');
    assert.strictEqual(client.version, UHP_SPEC_VERSION);
  });

  it('verifies server availability via isServerAvailable()', async () => {
    const available = await client.isServerAvailable();
    assert.strictEqual(available, true);

    const badClient = new HarnessRouterClient({ baseUrl: 'http://127.0.0.1:59999' });
    const badAvailable = await badClient.isServerAvailable();
    assert.strictEqual(badAvailable, false);
  });

  it('lists configured harnesses via listHarnesses()', async () => {
    const res = await client.listHarnesses();
    assert.strictEqual(res.ok, true);
    assert.ok(Array.isArray(res.data.data));
    assert.strictEqual(res.data.data.length, 3);
    assert.strictEqual(res.data.data[0].id, 'chrn_claude');
  });

  it('fetches a single harness via getHarness()', async () => {
    const res = await client.getHarness('chrn_claude');
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.data.id, 'chrn_claude');
  });

  it('lists models via listModels()', async () => {
    const res = await client.listModels();
    assert.strictEqual(res.ok, true);
    assert.ok(Array.isArray(res.data.data));
    assert.strictEqual(res.data.data[0].id, 'claude-3-7-sonnet');
  });

  it('executes buffered task via runTask()', async () => {
    const res = await client.runTask({
      input: 'Run linting check',
      harnessId: 'chrn_claude',
      model: 'claude-3-7-sonnet',
      stream: false,
    });
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.data.status, 'completed');
    assert.strictEqual(res.data.output, 'Buffered response');
    assert.strictEqual(res.data.metadata.harness_id, 'chrn_claude');
  });

  it('executes streaming task via runTask() with SSE event callbacks', async () => {
    const deltas = [];
    const events = [];

    const res = await client.runTask({
      input: 'Implement feature',
      harnessId: 'chrn_gemini',
      stream: true,
      onDelta: (d) => deltas.push(d),
      onEvent: (type, data) => events.push({ type, data }),
    });

    assert.strictEqual(res.ok, true);
    assert.ok(deltas.includes('Hello from UHP'));
    assert.ok(events.some(e => e.type === 'task.progress'));
    assert.ok(events.some(e => e.type === 'task.completed'));
  });

  it('cancels a running task via cancelTask()', async () => {
    const res = await client.cancelTask('resp_123');
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.data.status, 'cancelled');
  });

  it('lists sessions and performs canonical deletion via deleteSession() (UHP 2026-08-11 / F-08)', async () => {
    const listRes = await client.listSessions();
    assert.strictEqual(listRes.ok, true);
    assert.strictEqual(listRes.data.data.length, 1);

    const delRes = await client.deleteSession('hsess_1');
    assert.strictEqual(delRes.ok, true);
    assert.strictEqual(delRes.data.deleted, true);

    const lastReq = receivedRequests[receivedRequests.length - 1];
    assert.strictEqual(lastReq.method, 'DELETE');
    assert.strictEqual(lastReq.url, '/v1/sessions/hsess_1');
  });
});

// ── EmbeddedHarnessRouter (In-Process Fallback Engine) ───────────────────────

describe('EmbeddedHarnessRouter (100% Free & Open-Source Fallback)', () => {
  let tmpStorage = null;
  let router = null;

  before(() => {
    tmpStorage = path.join(os.tmpdir(), `robos-test-hr-${Date.now()}`);
    router = new EmbeddedHarnessRouter({ storageDir: tmpStorage });
  });

  after(() => {
    try { fs.rmSync(tmpStorage, { recursive: true, force: true }); } catch {}
  });

  it('returns valid UHP 2026-08-11 discovery info', async () => {
    const info = await router.getUHPInfo();
    assert.strictEqual(info.ok, true);
    assert.strictEqual(info.data.default_version, '2026-08-11');
    assert.strictEqual(info.data.conformance_class, 'Full');
    assert.strictEqual(info.data.implementation.open_source, true);
    assert.strictEqual(info.data.implementation.license, 'Apache-2.0');
    assert.strictEqual(info.data.implementation.free_forever, true);
  });

  it('reports server availability as true in embedded mode', async () => {
    const avail = await router.isServerAvailable();
    assert.strictEqual(avail, true);
  });

  it('lists all baseline agent harnesses with status and base IDs', async () => {
    const res = await router.listHarnesses();
    assert.strictEqual(res.ok, true);
    const harnesses = res.data.data;
    assert.ok(Array.isArray(harnesses));
    assert.ok(harnesses.length >= 5);

    const bases = harnesses.map(h => h.base);
    assert.ok(bases.includes('claude-code'), 'includes claude-code');
    assert.ok(bases.includes('codex'), 'includes codex');
    assert.ok(bases.includes('github-copilot'), 'includes github-copilot');
    assert.ok(bases.includes('gemini-cli'), 'includes gemini-cli');
    assert.ok(bases.includes('hermes'), 'includes hermes');
  });

  it('fetches existing harness and returns 404 for unknown harness', async () => {
    const found = await router.getHarness('chrn_claude');
    assert.strictEqual(found.ok, true);
    assert.strictEqual(found.data.base, 'claude-code');

    const notFound = await router.getHarness('chrn_unknown');
    assert.strictEqual(notFound.ok, false);
    assert.strictEqual(notFound.status, 404);
    assert.strictEqual(notFound.error.code, 'harness_not_found');
  });

  it('lists available models across providers', async () => {
    const res = await router.listModels();
    assert.strictEqual(res.ok, true);
    const models = res.data.data;
    assert.ok(models.some(m => m.id === 'gemini-3.8-flash'));
    assert.ok(models.some(m => m.id === 'claude-3-7-sonnet'));
  });

  it('executes task, streams UHP events, and records session turns', async () => {
    const events = [];
    const deltas = [];

    const res = await router.runTask({
      input: 'Verify KGraph SHACL conformance',
      harnessId: 'chrn_gemini',
      model: 'gemini-3.8-flash',
      stream: true,
      onEvent: (ev, data) => events.push({ ev, data }),
      onDelta: (d) => deltas.push(d),
    });

    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.status, 'completed');
    assert.ok(res.data.id.startsWith('resp_'));
    assert.ok(res.data.session_id.startsWith('hsess_'));
    assert.ok(res.data.output.includes('RobOS Embedded UHP Router'));

    assert.ok(events.some(e => e.ev === 'task.queued'));
    assert.ok(events.some(e => e.ev === 'task.completed'));
    assert.ok(deltas.length > 0);

    // Verify session persistence
    const sessRes = await router.getSession(res.data.session_id);
    assert.strictEqual(sessRes.ok, true);
    assert.strictEqual(sessRes.data.turns.length, 1);
    assert.strictEqual(sessRes.data.turns[0].status, 'completed');
  });

  it('performs canonical session deletion DELETE /v1/sessions/:id (F-08)', async () => {
    const taskRes = await router.runTask({
      input: 'Task to be deleted',
      harnessId: 'chrn_gemini',
    });
    const sessId = taskRes.data.session_id;

    // Verify session exists
    const beforeGet = await router.getSession(sessId);
    assert.strictEqual(beforeGet.ok, true);

    // Canonical delete
    const delRes = await router.deleteSession(sessId);
    assert.strictEqual(delRes.ok, true);
    assert.strictEqual(delRes.data.deleted, true);

    // Verify subsequent GET returns 404
    const afterGet = await router.getSession(sessId);
    assert.strictEqual(afterGet.ok, false);
    assert.strictEqual(afterGet.status, 404);
    assert.strictEqual(afterGet.error.code, 'session_not_found');
  });
});

// ── Smart Factory Function getHarnessRouter() ────────────────────────────────

describe('getHarnessRouter() Factory', () => {
  it('gracefully falls back to EmbeddedHarnessRouter when offline', async () => {
    const router = await getHarnessRouter({ baseUrl: 'http://127.0.0.1:59998' });
    assert.ok(router instanceof EmbeddedHarnessRouter);
    const info = await router.getUHPInfo();
    assert.strictEqual(info.data.implementation.open_source, true);
  });

  it('forces embedded router when forceEmbedded: true', async () => {
    const router = await getHarnessRouter({ forceEmbedded: true });
    assert.ok(router instanceof EmbeddedHarnessRouter);
  });
});

// ── HarnessRouterBackend Adapter for AgentSession ───────────────────────────

describe('HarnessRouterBackend Adapter', () => {
  it('parses UHP events and raw output properly', () => {
    const backend = new HarnessRouterBackend();
    const raw = `Plain log line\n{"type":"uhp_event","event":"task.delta","data":{"delta":"chunk1"}}\n{"type":"uhp_event","event":"task.completed","data":{"usage":{"input_tokens":10,"output_tokens":20}}}`;

    const parsed = backend.parseOutput(raw);
    assert.strictEqual(parsed.length, 3);
    assert.strictEqual(parsed[0].type, 'text');
    assert.strictEqual(parsed[1].type, 'task.delta');
    assert.strictEqual(parsed[2].type, 'task.completed');

    const metrics = backend.parseMetrics(raw);
    assert.deepStrictEqual(metrics.tokenUsage, { input_tokens: 10, output_tokens: 20 });
  });
});

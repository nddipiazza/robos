'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');

const voiceMain = require('../../../voice-prompt/main');

describe('Voice Prompt Agent Streaming Tests', () => {
  let server;
  const testPort = 19198;

  before(async () => {
    process.env.ROBOS_VOICE_PORT = String(testPort);
    server = voiceMain.startApiServer(testPort);
    await new Promise((res) => setTimeout(res, 200));
  });

  after(() => {
    if (server) {
      try {
        if (typeof server.closeAllConnections === 'function') {
          server.closeAllConnections();
        }
        server.close();
      } catch {}
    }
    if (voiceMain.sttEngine) {
      voiceMain.sttEngine.destroy();
    }
  });

  function httpReq(method, pathName, body = null) {
    return new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port: testPort,
        path: pathName,
        method,
        headers: { 'Content-Type': 'application/json' },
      }, (res) => {
        let data = '';
        res.on('data', c => { data += c; });
        res.on('end', () => {
          try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
          catch { resolve({ status: res.statusCode, data }); }
        });
      });
      req.on('error', reject);
      if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
      req.end();
    });
  }

  it('POST /api/agent-stream dispatches dictated text to RobOS agent and returns response', async () => {
    const res = await httpReq('POST', '/api/agent-stream', {
      text: 'Analyze memory usage in Kubernetes pods',
      agentId: 'fast-reactive',
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.ok, true);
    assert.strictEqual(res.data.agentId, 'fast-reactive');
    assert.strictEqual(res.data.text, 'Analyze memory usage in Kubernetes pods');
    assert.ok(res.data.response.includes('Processed'));
    assert.ok(res.data.context);
  });

  it('POST /api/agent-stream rejects request without text', async () => {
    const res = await httpReq('POST', '/api/agent-stream', {});
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.data.ok, false);
    assert.strictEqual(res.data.error, 'text is required');
  });

  it('GET /api/stream establishes SSE connection and receives streaming events', async () => {
    let receivedData = null;

    const ssePromise = new Promise((resolve) => {
      const sseReq = http.request({
        hostname: '127.0.0.1',
        port: testPort,
        path: '/api/stream',
        method: 'GET',
        headers: { 'Accept': 'text/event-stream' },
      }, (res) => {
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.headers['content-type'], 'text/event-stream');

        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          const lines = chunk.split('\n');
          for (const l of lines) {
            if (l.startsWith('data:')) {
              try {
                receivedData = JSON.parse(l.slice(5).trim());
                sseReq.destroy();
                resolve(receivedData);
              } catch {}
            }
          }
        });
      });
      sseReq.on('error', () => {});
      sseReq.end();
    });

    // Wait 100ms for connection to establish, then trigger an agent stream
    await new Promise((r) => setTimeout(r, 100));

    await httpReq('POST', '/api/agent-stream', {
      text: 'Create a PR review checklist',
      agentId: 'fast-reactive',
    });

    const event = await ssePromise;
    assert.ok(event);
    assert.strictEqual(event.type, 'agent_stream');
    assert.strictEqual(event.text, 'Create a PR review checklist');
  });
});

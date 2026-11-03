'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const { spawn } = require('node:child_process');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

test('native control server waits for a fragmented UTF-8 request body', { skip: !process.env.TABLETOP_TEST_BINARY, timeout: 40000 }, async () => {
  assert.ok(process.env.TABLETOP_TEST_SAVE, 'Use an isolated test save path');
  const probe = net.createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const game = spawn(process.env.TABLETOP_TEST_BINARY, ['--headless', '--quit-after', '3600', '--', '--reset'], {
    windowsHide: true, stdio: 'ignore', env: { ...process.env, TABLETOP_SERVER_PORT: String(port), TABLETOP_SAVE_PATH: process.env.TABLETOP_TEST_SAVE, TABLETOP_NO_SPELL_SELECT: '1' }
  });
  let launchError; game.on('error', error => { launchError = error; });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (launchError) throw launchError;
      try { const response = await fetch(`http://127.0.0.1:${port}/api/v1/state`, { signal: AbortSignal.timeout(500) }); if ((await response.json()).heroes?.length) { ready = true; break; } } catch {}
      await sleep(200);
    }
    assert.ok(ready, 'Exported game must reach its campaign');
    const body = Buffer.from(JSON.stringify({ action: 'has_save_game', note: 'Café ☕' }));
    const split = body.indexOf(Buffer.from('é')) + 1;
    const result = await new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: '127.0.0.1', port });
      let response = Buffer.alloc(0), sentWholeBody = false;
      const timer = setTimeout(() => finish(new Error('Incomplete HTTP response')), 5000);
      function finish(error, value) { clearTimeout(timer); socket.destroy(); error ? reject(error) : resolve(value); }
      socket.on('error', error => finish(error));
      socket.on('connect', async () => {
        try {
          socket.write(`POST /api/v1/action HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: ${body.length}\r\nConnection: close\r\n\r\n`);
          await sleep(100);
          socket.write(body.subarray(0, split));
          await sleep(100);
          sentWholeBody = true;
          socket.write(body.subarray(split));
        } catch (error) { finish(error); }
      });
      socket.on('data', chunk => {
        if (!sentWholeBody) return finish(new Error('Server responded before receiving the complete JSON body'));
        response = Buffer.concat([response, chunk]);
        const boundary = response.indexOf('\r\n\r\n');
        if (boundary < 0) return;
        const length = Number(response.subarray(0, boundary).toString().match(/content-length:\s*(\d+)/i)?.[1]);
        if (response.length < boundary + 4 + length) return;
        try { finish(null, JSON.parse(response.subarray(boundary + 4, boundary + 4 + length).toString('utf8'))); } catch (error) { finish(error); }
      });
    });
    assert.equal(result.success, true);
    assert.equal(typeof result.has_save, 'boolean');
  } finally { game.kill(); }
});

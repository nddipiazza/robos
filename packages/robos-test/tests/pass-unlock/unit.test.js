'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

// ── Extract pure logic from pass-unlock/main.js ──────────────────────────────

function getGreeting(hour) {
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function readAccessLog(logPath) {
  if (!fs.existsSync(logPath)) return { total: 0, agents: 0, user: 0, entries: [] };
  const today = todayISO();
  const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean);
  let total = 0, agents = 0, user = 0;
  const entries = [];
  for (const line of lines) {
    const [ts, caller, op, entry] = line.split('|');
    if (!ts || !ts.startsWith(today)) continue;
    total++;
    if (caller === 'agent') agents++; else user++;
    entries.push({ ts, caller, op, entry: entry || '' });
  }
  return { total, agents, user, entries };
}

function parseKeygrips(gpgOutput) {
  return gpgOutput.split('\n')
    .filter(l => l.startsWith('grp:'))
    .map(l => l.split(':')[9])
    .filter(Boolean);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('pass-unlock unit tests', () => {
  it('getGreeting: returns Good morning before noon', () => {
    assert.strictEqual(getGreeting(8), 'Good morning');
    assert.strictEqual(getGreeting(0), 'Good morning');
    assert.strictEqual(getGreeting(11), 'Good morning');
  });

  it('getGreeting: returns Good afternoon for 12-16', () => {
    assert.strictEqual(getGreeting(12), 'Good afternoon');
    assert.strictEqual(getGreeting(16), 'Good afternoon');
  });

  it('getGreeting: returns Good evening for 17+', () => {
    assert.strictEqual(getGreeting(17), 'Good evening');
    assert.strictEqual(getGreeting(23), 'Good evening');
  });

  it('readAccessLog: counts entries for today', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pu-test-'));
    const logPath = path.join(tmp, 'access.log');
    const today = todayISO();
    fs.writeFileSync(logPath, [
      `${today}T09:00:00Z|user|unlock|<daily-unlock>`,
      `${today}T10:00:00Z|agent|read|work/github`,
      `${today}T10:05:00Z|agent|read|work/jira`,
      `2020-01-01T09:00:00Z|user|unlock|<daily-unlock>`,
    ].join('\n'));

    const result = readAccessLog(logPath);
    assert.strictEqual(result.total, 3);
    assert.strictEqual(result.agents, 2);
    assert.strictEqual(result.user, 1);
    assert.strictEqual(result.entries.length, 3);
    fs.rmSync(tmp, { recursive: true });
  });

  it('readAccessLog: returns zeros for nonexistent file', () => {
    const result = readAccessLog('/tmp/nonexistent-' + Date.now());
    assert.strictEqual(result.total, 0);
    assert.strictEqual(result.agents, 0);
    assert.strictEqual(result.user, 0);
  });

  it('parseKeygrips: extracts keygrips from colons output', () => {
    const output = [
      'sec:u:4096:1:ABC:1711000000:::-:::scESC::::::23::0:',
      'fpr:::::::::ABCDEF:',
      'grp:::::::::AAAA1111BBBB2222CCCC3333DDDD4444EEEE5555:',
      'uid:u::::1711000000::0::Test <test@example.com>:',
      'ssb:u:4096:1:789:1711000000::::::e::::::23:',
      'grp:::::::::FFFF6666AAAA7777BBBB8888CCCC9999DDDD0000:',
    ].join('\n');
    const grips = parseKeygrips(output);
    assert.deepStrictEqual(grips, [
      'AAAA1111BBBB2222CCCC3333DDDD4444EEEE5555',
      'FFFF6666AAAA7777BBBB8888CCCC9999DDDD0000',
    ]);
  });

  it('parseKeygrips: returns empty for no grp lines', () => {
    assert.deepStrictEqual(parseKeygrips('sec:u:4096\nuid:test\n'), []);
  });
});

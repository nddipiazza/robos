'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');

const CLI_DIR = path.resolve(__dirname, '../../../robos-cli');

describe('robos-cli unit tests', () => {
  it('robos-active-task --help prints usage', () => {
    const out = execSync(`bash ${path.join(CLI_DIR, 'robos-active-task')} --help`, { encoding: 'utf8' });
    assert.ok(out.includes('Usage'), 'help text contains Usage');
    assert.ok(out.includes('get'), 'help mentions get command');
    assert.ok(out.includes('set'), 'help mentions set command');
    assert.ok(out.includes('clear'), 'help mentions clear command');
  });

  it('robos-active-task set/get/clear works', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-test-'));
    const env = { HOME: tmp, PATH: process.env.PATH };
    fs.mkdirSync(path.join(tmp, '.config', 'robos'), { recursive: true });

    // Set
    const setOut = execSync(`bash ${path.join(CLI_DIR, 'robos-active-task')} set JIRA-42`, { encoding: 'utf8', env });
    assert.ok(setOut.includes('JIRA-42'), 'set output confirms task');

    // Get
    const getOut = execSync(`bash ${path.join(CLI_DIR, 'robos-active-task')} get`, { encoding: 'utf8', env });
    assert.ok(getOut.trim() === 'JIRA-42', 'get returns set task');

    // Clear
    const clearOut = execSync(`bash ${path.join(CLI_DIR, 'robos-active-task')} clear`, { encoding: 'utf8', env });
    assert.ok(clearOut.includes('cleared'), 'clear confirms');

    fs.rmSync(tmp, { recursive: true });
  });

  it('robos-notify --help prints usage', () => {
    const out = execSync(`bash ${path.join(CLI_DIR, 'robos-notify')} --help`, { encoding: 'utf8' });
    assert.ok(out.includes('Usage'), 'help text contains Usage');
    assert.ok(out.includes('--category'), 'help mentions --category');
    assert.ok(out.includes('--tier'), 'help mentions --tier');
  });

  it('robos-event --help prints usage', () => {
    const out = execSync(`bash ${path.join(CLI_DIR, 'robos-event')} --help`, { encoding: 'utf8' });
    assert.ok(out.includes('Usage'), 'help text contains Usage');
    assert.ok(out.includes('emit'), 'help mentions emit');
    assert.ok(out.includes('listen'), 'help mentions listen');
    assert.ok(out.includes('history'), 'help mentions history');
  });

  it('robos-journal-append --help prints usage', () => {
    const out = execSync(`bash ${path.join(CLI_DIR, 'robos-journal-append')} --help`, { encoding: 'utf8' });
    assert.ok(out.includes('Usage'), 'help text contains Usage');
    assert.ok(out.includes('--section'), 'help mentions --section');
  });

  it('robos-notify writes to notifications file', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-test-'));
    const env = { HOME: tmp, PATH: process.env.PATH, DISPLAY: ':99' };
    fs.mkdirSync(path.join(tmp, '.config', 'robos'), { recursive: true });
    fs.writeFileSync(path.join(tmp, '.config', 'robos', 'notifications.json'), '[]');

    execSync(
      `bash ${path.join(CLI_DIR, 'robos-notify')} --silent --title "Test" --category ci_cd --tier warning "Build failed"`,
      { encoding: 'utf8', env }
    );

    const notifs = JSON.parse(fs.readFileSync(path.join(tmp, '.config', 'robos', 'notifications.json'), 'utf8'));
    assert.ok(notifs.length >= 1, 'notification was written');
    assert.strictEqual(notifs[0].category, 'ci_cd');
    assert.strictEqual(notifs[0].tier, 'warning');
    assert.ok(notifs[0].body.includes('Build failed'));

    fs.rmSync(tmp, { recursive: true });
  });

  it('robos-event emit writes to event log', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-test-'));
    const env = { HOME: tmp, PATH: process.env.PATH };
    fs.mkdirSync(path.join(tmp, '.config', 'robos', 'events'), { recursive: true });

    execSync(
      `bash ${path.join(CLI_DIR, 'robos-event')} emit ci_completed --payload '{"status":"success"}'`,
      { encoding: 'utf8', env }
    );

    const logFile = path.join(tmp, '.config', 'robos', 'events', 'event-log.jsonl');
    assert.ok(fs.existsSync(logFile), 'event log file created');
    const lines = fs.readFileSync(logFile, 'utf8').trim().split('\n');
    assert.ok(lines.length >= 1, 'event was written');
    const event = JSON.parse(lines[0]);
    assert.strictEqual(event.type, 'ci_completed');
    assert.strictEqual(event.payload.status, 'success');

    fs.rmSync(tmp, { recursive: true });
  });
});

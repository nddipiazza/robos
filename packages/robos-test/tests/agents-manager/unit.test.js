'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');

// ── Extract pure logic from agents-manager for testing ───────────────────────

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString();
  } catch { return iso; }
}

// Parse YAML-like key: value lines (from copilot workspace.yaml)
function parseSimpleYaml(text) {
  const meta = {};
  text.split('\n').forEach(line => {
    const m = line.match(/^(\w+):\s*(.+)/);
    if (m) meta[m[1]] = m[2].trim();
  });
  return meta;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('agents-manager unit tests', () => {
  it('esc: escapes HTML entities', () => {
    assert.strictEqual(esc('<script>alert("xss")</script>'),
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  });

  it('esc: handles null/undefined', () => {
    assert.strictEqual(esc(null), '');
    assert.strictEqual(esc(undefined), '');
    assert.strictEqual(esc(''), '');
  });

  it('formatDate: returns empty string for falsy input', () => {
    assert.strictEqual(formatDate(''), '');
    assert.strictEqual(formatDate(null), '');
    assert.strictEqual(formatDate(undefined), '');
  });

  it('formatDate: returns "just now" for recent timestamps', () => {
    const now = new Date().toISOString();
    assert.strictEqual(formatDate(now), 'just now');
  });

  it('formatDate: returns minutes ago for timestamps within an hour', () => {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const result = formatDate(thirtyMinAgo);
    assert.ok(result.includes('m ago'), `Expected minutes ago, got: ${result}`);
  });

  it('formatDate: returns hours ago for timestamps within a day', () => {
    const fiveHoursAgo = new Date(Date.now() - 5 * 3600 * 1000).toISOString();
    const result = formatDate(fiveHoursAgo);
    assert.ok(result.includes('h ago'), `Expected hours ago, got: ${result}`);
  });

  it('formatDate: returns date for old timestamps', () => {
    const oldDate = new Date('2020-01-15T12:00:00Z').toISOString();
    const result = formatDate(oldDate);
    assert.ok(!result.includes('ago'), `Expected date string, got: ${result}`);
  });

  it('parseSimpleYaml: parses key-value lines', () => {
    const yaml = 'summary: Fix the bug\ncwd: /home/user/project\ncreated_at: 2024-01-01';
    const meta = parseSimpleYaml(yaml);
    assert.strictEqual(meta.summary, 'Fix the bug');
    assert.strictEqual(meta.cwd, '/home/user/project');
    assert.strictEqual(meta.created_at, '2024-01-01');
  });

  it('parseSimpleYaml: handles empty input', () => {
    const meta = parseSimpleYaml('');
    assert.deepStrictEqual(meta, {});
  });

  it('parseSimpleYaml: ignores non-matching lines', () => {
    const yaml = 'this is not yaml\nsummary: Test\n   indented: value';
    const meta = parseSimpleYaml(yaml);
    assert.strictEqual(meta.summary, 'Test');
    assert.ok(!meta['this']);
  });
});

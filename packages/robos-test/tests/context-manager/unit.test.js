'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const os = require('os');

// ── Extract pure logic from context-manager for testing ──────────────────────

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function fmtSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

function localPathForSource(src) {
  if (src.type === 'local') return src.path;
  if (src.type === 'github' && src.ghRepo) {
    const parts = src.ghRepo.split('/');
    return path.join(os.homedir(), 'source', 'github.com', parts[0], parts[1]);
  }
  return null;
}

const CONTEXT_FILE_PATTERNS = [
  'README.md', 'readme.md', 'README.rst',
  'AGENTS.md', 'agents.md',
  'CLAUDE.md', 'claude.md',
  '.cursorrules',
  'ARCHITECTURE.md', 'architecture.md',
  'CONTRIBUTING.md', 'contributing.md',
  'CODEOWNERS', '.github/CODEOWNERS',
  'docs/README.md', 'docs/architecture.md', 'docs/overview.md',
  'package.json', 'pom.xml', 'build.gradle', 'Cargo.toml', 'go.mod',
  '.github/copilot-instructions.md',
];

// ── Tests ────────────────────────────────────────────────────────────────────

describe('context-manager unit tests', () => {
  it('esc: escapes HTML entities', () => {
    assert.strictEqual(esc('<b>bold</b>'), '&lt;b&gt;bold&lt;/b&gt;');
    assert.strictEqual(esc('a & b'), 'a &amp; b');
  });

  it('fmtSize: formats bytes correctly', () => {
    assert.strictEqual(fmtSize(500), '500 B');
    assert.strictEqual(fmtSize(1024), '1.0 KB');
    assert.strictEqual(fmtSize(2048), '2.0 KB');
    assert.strictEqual(fmtSize(1024 * 1024), '1.0 MB');
    assert.strictEqual(fmtSize(1024 * 1024 * 2.5), '2.5 MB');
  });

  it('fmtSize: handles zero', () => {
    assert.strictEqual(fmtSize(0), '0 B');
  });

  it('localPathForSource: resolves local source path', () => {
    const src = { type: 'local', path: '/home/user/project' };
    assert.strictEqual(localPathForSource(src), '/home/user/project');
  });

  it('localPathForSource: resolves github source path', () => {
    const src = { type: 'github', ghRepo: 'org/repo' };
    const expected = path.join(os.homedir(), 'source', 'github.com', 'org', 'repo');
    assert.strictEqual(localPathForSource(src), expected);
  });

  it('localPathForSource: returns null for unknown type', () => {
    assert.strictEqual(localPathForSource({ type: 'unknown' }), null);
  });

  it('localPathForSource: returns null for github without ghRepo', () => {
    assert.strictEqual(localPathForSource({ type: 'github' }), null);
  });

  it('CONTEXT_FILE_PATTERNS includes standard context files', () => {
    assert.ok(CONTEXT_FILE_PATTERNS.includes('README.md'));
    assert.ok(CONTEXT_FILE_PATTERNS.includes('AGENTS.md'));
    assert.ok(CONTEXT_FILE_PATTERNS.includes('CLAUDE.md'));
    assert.ok(CONTEXT_FILE_PATTERNS.includes('package.json'));
    assert.ok(CONTEXT_FILE_PATTERNS.includes('.github/copilot-instructions.md'));
  });

  it('CONTEXT_FILE_PATTERNS has reasonable length', () => {
    assert.ok(CONTEXT_FILE_PATTERNS.length >= 10, 'Should have at least 10 patterns');
    assert.ok(CONTEXT_FILE_PATTERNS.length <= 50, 'Should not be excessively long');
  });
});

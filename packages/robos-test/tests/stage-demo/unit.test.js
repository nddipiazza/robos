'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');

// ── Extract logic for testing ────────────────────────────────────────────

function generateWalkthrough(pr, changedFiles) {
  const steps = [];
  const title = pr.title || 'Untitled change';
  const totalChanges = (pr.additions || 0) + (pr.deletions || 0);

  steps.push({
    title: 'What Changed',
    description: `PR "${title}" by ${pr.author?.login || 'unknown'}: ${totalChanges} lines across ${changedFiles.length} files.`,
  });

  if (pr.body) {
    steps.push({
      title: 'PR Description',
      description: pr.body.substring(0, 500),
    });
  }

  const groups = {};
  for (const f of changedFiles) {
    const parts = f.split('/');
    const category = parts.length > 1 ? parts[0] : 'root';
    if (!groups[category]) groups[category] = [];
    groups[category].push(f);
  }

  for (const [cat, files] of Object.entries(groups)) {
    steps.push({
      title: `Changes in ${cat}/`,
      description: files.slice(0, 10).join(', ') + (files.length > 10 ? ` and ${files.length - 10} more` : ''),
    });
  }

  steps.push({
    title: 'Verification',
    description: 'Review the changes above and verify they match the expected behavior. Approve or file bugs as needed.',
  });

  return steps;
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('stage-demo unit tests', () => {
  it('generateWalkthrough: generates basic steps', () => {
    const steps = generateWalkthrough(
      { title: 'Add login page', additions: 100, deletions: 20, author: { login: 'alice' } },
      ['src/login.js', 'src/login.css', 'test/login.test.js']
    );
    assert.ok(steps.length >= 3, `Expected at least 3 steps, got ${steps.length}`);
    assert.strictEqual(steps[0].title, 'What Changed');
    assert.ok(steps[0].description.includes('120 lines'));
    assert.ok(steps[0].description.includes('3 files'));
  });

  it('generateWalkthrough: includes PR description when present', () => {
    const steps = generateWalkthrough(
      { title: 'Fix bug', body: 'This fixes a critical bug in auth', additions: 10, deletions: 5 },
      ['src/auth.js']
    );
    const descStep = steps.find(s => s.title === 'PR Description');
    assert.ok(descStep, 'Should include PR Description step');
    assert.ok(descStep.description.includes('critical bug'));
  });

  it('generateWalkthrough: omits description step when body is empty', () => {
    const steps = generateWalkthrough(
      { title: 'Quick fix', additions: 5, deletions: 2 },
      ['file.js']
    );
    const descStep = steps.find(s => s.title === 'PR Description');
    assert.strictEqual(descStep, undefined, 'Should not have description step when body is empty');
  });

  it('generateWalkthrough: groups files by directory', () => {
    const steps = generateWalkthrough(
      { title: 'Multi-dir change', additions: 50, deletions: 10 },
      ['src/a.js', 'src/b.js', 'test/c.test.js', 'docs/readme.md']
    );
    const srcStep = steps.find(s => s.title === 'Changes in src/');
    const testStep = steps.find(s => s.title === 'Changes in test/');
    assert.ok(srcStep, 'Should have src group');
    assert.ok(testStep, 'Should have test group');
    assert.ok(srcStep.description.includes('a.js'));
  });

  it('generateWalkthrough: always ends with Verification step', () => {
    const steps = generateWalkthrough({ title: 'test', additions: 1, deletions: 0 }, ['file.js']);
    const last = steps[steps.length - 1];
    assert.strictEqual(last.title, 'Verification');
  });

  it('generateWalkthrough: handles empty file list', () => {
    const steps = generateWalkthrough({ title: 'empty', additions: 0, deletions: 0 }, []);
    assert.ok(steps.length >= 2, 'Should still have What Changed and Verification');
    assert.ok(steps[0].description.includes('0 lines'));
    assert.ok(steps[0].description.includes('0 files'));
  });

  it('timeAgo: returns just now for recent', () => {
    assert.strictEqual(timeAgo(new Date().toISOString()), 'just now');
  });

  it('timeAgo: returns empty for null', () => {
    assert.strictEqual(timeAgo(null), '');
  });

  it('esc: escapes HTML characters', () => {
    assert.strictEqual(esc('<b>bold</b>'), '&lt;b&gt;bold&lt;/b&gt;');
    assert.strictEqual(esc(null), '');
  });
});

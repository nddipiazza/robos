'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');

// ── Extract renderer logic for testing ───────────────────────────────────

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

function getCIStatus(rollup) {
  if (!rollup || !rollup.length) return 'pending';
  const states = rollup.map(c => (c.state || c.conclusion || '').toUpperCase());
  if (states.some(s => s === 'FAILURE' || s === 'ERROR')) return 'failure';
  if (states.every(s => s === 'SUCCESS' || s === 'NEUTRAL' || s === 'SKIPPED')) return 'success';
  return 'pending';
}

function mapGitHubPR(raw, repo) {
  const ciStatus = getCIStatus(raw.statusCheckRollup);
  const labels = (raw.labels || []).map(l => typeof l === 'string' ? l : l.name);
  return {
    repo,
    number: raw.number,
    title: raw.title,
    state: raw.state,
    author: raw.author?.login || 'unknown',
    reviewers: (raw.reviewRequests || []).map(r => r.login || r.name || 'team').filter(Boolean),
    reviewDecision: raw.reviewDecision || null,
    ciStatus,
    isDraft: raw.isDraft || false,
    headBranch: raw.headRefName,
    baseBranch: raw.baseRefName,
    additions: raw.additions || 0,
    deletions: raw.deletions || 0,
    body: raw.body || '',
    labels,
    commentCount: (raw.comments || []).length,
    created: raw.createdAt,
    updated: raw.updatedAt,
    url: raw.url || `https://github.com/${repo}/pull/${raw.number}`,
  };
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('pr-review unit tests', () => {
  it('timeAgo: returns just now for recent', () => {
    assert.strictEqual(timeAgo(new Date().toISOString()), 'just now');
  });

  it('timeAgo: returns minutes ago', () => {
    const fiveMin = new Date(Date.now() - 5 * 60000).toISOString();
    assert.strictEqual(timeAgo(fiveMin), '5m ago');
  });

  it('timeAgo: returns hours ago', () => {
    const threeHours = new Date(Date.now() - 3 * 3600000).toISOString();
    assert.strictEqual(timeAgo(threeHours), '3h ago');
  });

  it('timeAgo: returns empty for null', () => {
    assert.strictEqual(timeAgo(null), '');
  });

  it('getCIStatus: pending when no rollup', () => {
    assert.strictEqual(getCIStatus(null), 'pending');
    assert.strictEqual(getCIStatus([]), 'pending');
  });

  it('getCIStatus: success when all pass', () => {
    assert.strictEqual(getCIStatus([
      { state: 'SUCCESS' }, { state: 'SUCCESS' },
    ]), 'success');
  });

  it('getCIStatus: failure when any fail', () => {
    assert.strictEqual(getCIStatus([
      { state: 'SUCCESS' }, { state: 'FAILURE' },
    ]), 'failure');
  });

  it('getCIStatus: pending when mixed without failure', () => {
    assert.strictEqual(getCIStatus([
      { state: 'SUCCESS' }, { state: 'PENDING' },
    ]), 'pending');
  });

  it('mapGitHubPR: maps basic fields', () => {
    const pr = mapGitHubPR({
      number: 42,
      title: 'Fix auth bug',
      state: 'OPEN',
      author: { login: 'alice' },
      reviewRequests: [{ login: 'bob' }],
      reviewDecision: 'APPROVED',
      statusCheckRollup: [{ state: 'SUCCESS' }],
      isDraft: false,
      headRefName: 'fix-auth',
      baseRefName: 'main',
      additions: 50,
      deletions: 10,
      body: 'Fixes auth timeout',
      labels: [{ name: 'bug' }],
      comments: [{ body: 'LGTM' }],
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-02T00:00:00Z',
    }, 'org/repo');

    assert.strictEqual(pr.number, 42);
    assert.strictEqual(pr.title, 'Fix auth bug');
    assert.strictEqual(pr.author, 'alice');
    assert.strictEqual(pr.ciStatus, 'success');
    assert.strictEqual(pr.reviewDecision, 'APPROVED');
    assert.strictEqual(pr.headBranch, 'fix-auth');
    assert.strictEqual(pr.additions, 50);
    assert.strictEqual(pr.deletions, 10);
    assert.strictEqual(pr.commentCount, 1);
    assert.deepStrictEqual(pr.labels, ['bug']);
    assert.deepStrictEqual(pr.reviewers, ['bob']);
    assert.strictEqual(pr.repo, 'org/repo');
  });

  it('mapGitHubPR: defaults for missing fields', () => {
    const pr = mapGitHubPR({
      number: 1,
      title: 'test',
      state: 'OPEN',
      headRefName: 'test',
      baseRefName: 'main',
    }, 'org/repo');
    assert.strictEqual(pr.author, 'unknown');
    assert.strictEqual(pr.ciStatus, 'pending');
    assert.strictEqual(pr.isDraft, false);
    assert.strictEqual(pr.additions, 0);
    assert.strictEqual(pr.commentCount, 0);
    assert.deepStrictEqual(pr.labels, []);
  });

  it('esc: escapes HTML characters', () => {
    assert.strictEqual(esc('<script>'), '&lt;script&gt;');
    assert.strictEqual(esc('"test"'), '&quot;test&quot;');
    assert.strictEqual(esc('a & b'), 'a &amp; b');
    assert.strictEqual(esc(null), '');
  });
});

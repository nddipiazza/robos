'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');

// ── Extract renderer logic for testing ───────────────────────────────────────

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

function daysAgo(dateStr) {
  if (!dateStr) return Infinity;
  return (Date.now() - new Date(dateStr).getTime()) / (24 * 3600 * 1000);
}

function computeCycleTime(prs) {
  const merged = prs.filter(p => p.mergedAt && p.createdAt);
  if (!merged.length) return null;
  const total = merged.reduce((sum, p) => {
    return sum + (new Date(p.mergedAt).getTime() - new Date(p.createdAt).getTime());
  }, 0);
  return total / merged.length / (24 * 3600 * 1000);
}

function computeVelocity(prs) {
  const byAuthor = {};
  for (const pr of prs) {
    const author = (pr.author && pr.author.login) || 'unknown';
    if (!byAuthor[author]) byAuthor[author] = 0;
    byAuthor[author]++;
  }
  return Object.entries(byAuthor)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

function groupByStage(issues) {
  const stages = new Map();
  for (const issue of issues) {
    const labels = (issue.labels || []).map(l => typeof l === 'string' ? l : l.name);
    const stateLabel = labels.find(l => l.startsWith('state:'));
    const stage = stateLabel ? stateLabel.replace('state:', '') : (issue.state || 'open');
    if (!stages.has(stage)) stages.set(stage, []);
    stages.get(stage).push(issue);
  }
  return stages;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('manager-dashboard unit tests', () => {
  it('timeAgo: returns just now for recent', () => {
    assert.strictEqual(timeAgo(new Date().toISOString()), 'just now');
  });

  it('timeAgo: returns empty for null', () => {
    assert.strictEqual(timeAgo(null), '');
  });

  it('daysAgo: returns correct number of days', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString();
    const result = daysAgo(twoDaysAgo);
    assert.ok(result >= 1.9 && result <= 2.1, `Expected ~2, got ${result}`);
  });

  it('daysAgo: returns Infinity for null', () => {
    assert.strictEqual(daysAgo(null), Infinity);
  });

  it('computeCycleTime: returns average in days', () => {
    const now = Date.now();
    const prs = [
      { createdAt: new Date(now - 2 * 86400000).toISOString(), mergedAt: new Date(now).toISOString() },
      { createdAt: new Date(now - 4 * 86400000).toISOString(), mergedAt: new Date(now).toISOString() },
    ];
    const ct = computeCycleTime(prs);
    assert.ok(ct >= 2.9 && ct <= 3.1, `Expected ~3, got ${ct}`);
  });

  it('computeCycleTime: returns null for empty', () => {
    assert.strictEqual(computeCycleTime([]), null);
  });

  it('computeVelocity: counts PRs per author', () => {
    const prs = [
      { author: { login: 'alice' } },
      { author: { login: 'bob' } },
      { author: { login: 'alice' } },
    ];
    const v = computeVelocity(prs);
    assert.strictEqual(v[0].name, 'alice');
    assert.strictEqual(v[0].count, 2);
    assert.strictEqual(v[1].name, 'bob');
    assert.strictEqual(v[1].count, 1);
  });

  it('computeVelocity: handles missing author', () => {
    const prs = [{ author: null }];
    const v = computeVelocity(prs);
    assert.strictEqual(v[0].name, 'unknown');
    assert.strictEqual(v[0].count, 1);
  });

  it('groupByStage: groups by state label', () => {
    const issues = [
      { labels: [{ name: 'state:triage' }], state: 'open' },
      { labels: [{ name: 'state:in-progress' }], state: 'open' },
      { labels: [{ name: 'state:triage' }], state: 'open' },
    ];
    const groups = groupByStage(issues);
    assert.strictEqual(groups.get('triage').length, 2);
    assert.strictEqual(groups.get('in-progress').length, 1);
  });

  it('groupByStage: falls back to issue state', () => {
    const issues = [
      { labels: [], state: 'open' },
      { labels: [], state: 'closed' },
    ];
    const groups = groupByStage(issues);
    assert.strictEqual(groups.get('open').length, 1);
    assert.strictEqual(groups.get('closed').length, 1);
  });

  it('groupByStage: handles empty list', () => {
    assert.strictEqual(groupByStage([]).size, 0);
  });
});

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

function envClass(env) {
  if (!env) return 'env-default';
  const e = env.toLowerCase();
  if (e.includes('prod')) return 'env-production';
  if (e.includes('stag')) return 'env-staging';
  if (e.includes('prev') || e.includes('dev')) return 'env-preview';
  return 'env-default';
}

function computeMTTR(deploys) {
  const sorted = [...deploys].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const recoveryTimes = [];
  let lastFailure = null;

  for (const d of sorted) {
    if (d._latestStatus === 'failure' && !lastFailure) {
      lastFailure = new Date(d.created_at);
    } else if (d._latestStatus === 'success' && lastFailure) {
      recoveryTimes.push(new Date(d.created_at).getTime() - lastFailure.getTime());
      lastFailure = null;
    }
  }

  if (!recoveryTimes.length) return null;
  const avgMs = recoveryTimes.reduce((s, t) => s + t, 0) / recoveryTimes.length;
  return avgMs / (3600 * 1000);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('deploy-tracker unit tests', () => {
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

  it('envClass: classifies production', () => {
    assert.strictEqual(envClass('production'), 'env-production');
    assert.strictEqual(envClass('prod'), 'env-production');
  });

  it('envClass: classifies staging', () => {
    assert.strictEqual(envClass('staging'), 'env-staging');
  });

  it('envClass: classifies preview/dev', () => {
    assert.strictEqual(envClass('preview'), 'env-preview');
    assert.strictEqual(envClass('development'), 'env-preview');
  });

  it('envClass: returns default for unknown', () => {
    assert.strictEqual(envClass('other'), 'env-default');
    assert.strictEqual(envClass(null), 'env-default');
  });

  it('computeMTTR: calculates recovery time', () => {
    const now = Date.now();
    const deploys = [
      { created_at: new Date(now - 4 * 3600000).toISOString(), _latestStatus: 'failure' },
      { created_at: new Date(now - 2 * 3600000).toISOString(), _latestStatus: 'success' },
    ];
    const mttr = computeMTTR(deploys);
    assert.ok(mttr >= 1.9 && mttr <= 2.1, `Expected ~2h, got ${mttr}`);
  });

  it('computeMTTR: returns null when no failures', () => {
    const deploys = [
      { created_at: new Date().toISOString(), _latestStatus: 'success' },
    ];
    assert.strictEqual(computeMTTR(deploys), null);
  });

  it('computeMTTR: handles multiple failure/recovery cycles', () => {
    const now = Date.now();
    const deploys = [
      { created_at: new Date(now - 10 * 3600000).toISOString(), _latestStatus: 'failure' },
      { created_at: new Date(now - 8 * 3600000).toISOString(), _latestStatus: 'success' },
      { created_at: new Date(now - 4 * 3600000).toISOString(), _latestStatus: 'failure' },
      { created_at: new Date(now - 1 * 3600000).toISOString(), _latestStatus: 'success' },
    ];
    const mttr = computeMTTR(deploys);
    // avg of 2h and 3h = 2.5h
    assert.ok(mttr >= 2.4 && mttr <= 2.6, `Expected ~2.5h, got ${mttr}`);
  });

  it('computeMTTR: handles empty array', () => {
    assert.strictEqual(computeMTTR([]), null);
  });
});

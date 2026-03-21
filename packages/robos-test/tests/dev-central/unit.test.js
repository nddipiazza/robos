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

function ciStatus(pr) {
  const checks = pr.statusCheckRollup || [];
  if (!checks.length) return 'pending';
  const failed = checks.some(c => c.conclusion === 'FAILURE' || c.conclusion === 'failure');
  if (failed) return 'fail';
  const pending = checks.some(c => !c.conclusion || c.conclusion === 'PENDING');
  if (pending) return 'pending';
  return 'pass';
}

function reviewStatus(pr) {
  const d = pr.reviewDecision;
  if (d === 'APPROVED') return 'approved';
  if (d === 'CHANGES_REQUESTED') return 'changes';
  return 'pending';
}

function detectBlockers(issues, prs) {
  const blockers = [];
  for (const pr of prs) {
    if (ciStatus(pr) === 'fail') {
      blockers.push({ type: 'ci', label: 'Failed CI', text: `PR #${pr.number}: ${pr.title}`, url: pr.url });
    }
  }
  for (const pr of prs) {
    if (reviewStatus(pr) === 'pending' && pr.updatedAt) {
      const age = Date.now() - new Date(pr.updatedAt).getTime();
      if (age > 24 * 3600 * 1000) {
        blockers.push({ type: 'review', label: 'Stale Review', text: `PR #${pr.number}: awaiting review ${timeAgo(pr.updatedAt)}`, url: pr.url });
      }
    }
  }
  for (const issue of issues) {
    if (issue.updatedAt) {
      const age = Date.now() - new Date(issue.updatedAt).getTime();
      if (age > 3 * 24 * 3600 * 1000) {
        blockers.push({ type: 'stuck', label: 'Stuck', text: `#${issue.number}: ${issue.title} (${timeAgo(issue.updatedAt)})`, url: issue.url });
      }
    }
  }
  return blockers;
}

function generateStandup(issues, prs) {
  const yesterday = [];
  const today = [];
  for (const pr of prs) {
    if (pr.state === 'MERGED') {
      yesterday.push(`Merged PR #${pr.number}: ${pr.title}`);
    }
  }
  for (const issue of issues) {
    if (issue.state === 'OPEN') {
      today.push(`#${issue.number}: ${issue.title}`);
    }
  }
  if (!yesterday.length) yesterday.push('No recent completions found');
  if (!today.length) today.push('No assigned tasks');
  return { yesterday, today };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('dev-central unit tests', () => {
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

  it('timeAgo: returns days ago', () => {
    const twoDays = new Date(Date.now() - 2 * 86400000).toISOString();
    assert.strictEqual(timeAgo(twoDays), '2d ago');
  });

  it('timeAgo: returns empty for null', () => {
    assert.strictEqual(timeAgo(null), '');
  });

  it('ciStatus: returns pass when all checks pass', () => {
    assert.strictEqual(ciStatus({ statusCheckRollup: [{ conclusion: 'SUCCESS' }] }), 'pass');
  });

  it('ciStatus: returns fail when any check fails', () => {
    assert.strictEqual(ciStatus({
      statusCheckRollup: [{ conclusion: 'SUCCESS' }, { conclusion: 'FAILURE' }]
    }), 'fail');
  });

  it('ciStatus: returns pending when no checks', () => {
    assert.strictEqual(ciStatus({ statusCheckRollup: [] }), 'pending');
  });

  it('ciStatus: returns pending when check has no conclusion', () => {
    assert.strictEqual(ciStatus({ statusCheckRollup: [{ conclusion: null }] }), 'pending');
  });

  it('reviewStatus: approved', () => {
    assert.strictEqual(reviewStatus({ reviewDecision: 'APPROVED' }), 'approved');
  });

  it('reviewStatus: changes requested', () => {
    assert.strictEqual(reviewStatus({ reviewDecision: 'CHANGES_REQUESTED' }), 'changes');
  });

  it('reviewStatus: pending by default', () => {
    assert.strictEqual(reviewStatus({}), 'pending');
  });

  it('detectBlockers: finds failed CI', () => {
    const prs = [{ number: 1, title: 'Fix', statusCheckRollup: [{ conclusion: 'FAILURE' }], url: 'u' }];
    const blockers = detectBlockers([], prs);
    assert.strictEqual(blockers.length, 1);
    assert.strictEqual(blockers[0].type, 'ci');
  });

  it('detectBlockers: finds stale reviews', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString();
    const prs = [{ number: 2, title: 'PR', statusCheckRollup: [], reviewDecision: null, updatedAt: twoDaysAgo, url: 'u' }];
    const blockers = detectBlockers([], prs);
    assert.ok(blockers.some(b => b.type === 'review'));
  });

  it('detectBlockers: finds stuck issues', () => {
    const fiveDaysAgo = new Date(Date.now() - 5 * 86400000).toISOString();
    const issues = [{ number: 10, title: 'Old issue', updatedAt: fiveDaysAgo, url: 'u' }];
    const blockers = detectBlockers(issues, []);
    assert.strictEqual(blockers.length, 1);
    assert.strictEqual(blockers[0].type, 'stuck');
  });

  it('detectBlockers: returns empty for healthy state', () => {
    const prs = [{ number: 1, title: 'Good', statusCheckRollup: [{ conclusion: 'SUCCESS' }], reviewDecision: 'APPROVED', updatedAt: new Date().toISOString(), url: 'u' }];
    const blockers = detectBlockers([], prs);
    assert.strictEqual(blockers.length, 0);
  });

  it('generateStandup: merged PRs become yesterday', () => {
    const prs = [{ number: 5, title: 'Feature X', state: 'MERGED' }];
    const standup = generateStandup([], prs);
    assert.ok(standup.yesterday[0].includes('Feature X'));
  });

  it('generateStandup: open issues become today', () => {
    const issues = [{ number: 3, title: 'Bug fix', state: 'OPEN' }];
    const standup = generateStandup(issues, []);
    assert.ok(standup.today[0].includes('Bug fix'));
  });

  it('generateStandup: defaults when empty', () => {
    const standup = generateStandup([], []);
    assert.ok(standup.yesterday[0].includes('No recent'));
    assert.ok(standup.today[0].includes('No assigned'));
  });
});

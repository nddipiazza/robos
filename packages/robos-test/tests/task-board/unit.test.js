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

function detectType(labels) {
  if (labels.some(l => l === 'bug')) return 'Bug';
  if (labels.some(l => l.includes('feature'))) return 'Feature';
  if (labels.some(l => l === 'chore' || l === 'task')) return 'Task';
  return 'Issue';
}

function getKanbanColumns(issues) {
  const groups = new Map();
  for (const issue of issues) {
    const status = issue.status || 'unknown';
    if (!groups.has(status)) groups.set(status, []);
    groups.get(status).push(issue);
  }
  return groups;
}

function mapGitHubIssue(raw) {
  const labels = (raw.labels || []).map(l => typeof l === 'string' ? l : l.name);
  const stateLabel = labels.find(l => l.startsWith('state:'));
  return {
    key: `#${raw.number}`,
    number: raw.number,
    summary: raw.title,
    status: stateLabel ? stateLabel.replace('state:', '') : (raw.state || 'open'),
    labels,
    assignee: raw.assignees?.[0]?.login || null,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('task-board unit tests', () => {
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

  it('detectType: identifies issue types from labels', () => {
    assert.strictEqual(detectType(['bug']), 'Bug');
    assert.strictEqual(detectType(['feature-request']), 'Feature');
    assert.strictEqual(detectType(['task']), 'Task');
    assert.strictEqual(detectType(['docs']), 'Issue');
  });

  it('getKanbanColumns: groups issues by status', () => {
    const cols = getKanbanColumns([
      { key: '#1', status: 'open' },
      { key: '#2', status: 'in-progress' },
      { key: '#3', status: 'open' },
      { key: '#4', status: 'done' },
    ]);
    assert.strictEqual(cols.size, 3);
    assert.strictEqual(cols.get('open').length, 2);
    assert.strictEqual(cols.get('in-progress').length, 1);
    assert.strictEqual(cols.get('done').length, 1);
  });

  it('getKanbanColumns: handles empty list', () => {
    assert.strictEqual(getKanbanColumns([]).size, 0);
  });

  it('mapGitHubIssue: maps basic fields', () => {
    const mapped = mapGitHubIssue({
      number: 42, title: 'Fix crash', state: 'open',
      labels: [{ name: 'bug' }, { name: 'state:triage' }],
      assignees: [{ login: 'alex' }],
    });
    assert.strictEqual(mapped.key, '#42');
    assert.strictEqual(mapped.summary, 'Fix crash');
    assert.strictEqual(mapped.status, 'triage');
    assert.strictEqual(mapped.assignee, 'alex');
  });

  it('mapGitHubIssue: falls back to state when no state: label', () => {
    const mapped = mapGitHubIssue({ number: 1, title: 'test', state: 'open', labels: [] });
    assert.strictEqual(mapped.status, 'open');
  });
});

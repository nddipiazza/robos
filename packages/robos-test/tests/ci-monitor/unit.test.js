'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');

// ── Extract main.js logic for testing ────────────────────────────────────

function analyzeFailure(log, jobName) {
  const lines = log.split('\n');
  const findings = [];
  let category = 'unknown';

  if (log.includes('FAIL') && (log.includes('test') || log.includes('Test') || log.includes('spec'))) {
    category = 'test-failure';
    findings.push({ type: 'error', text: 'Test failure detected. One or more test cases failed.' });
    const failLines = lines.filter(l => /FAIL|AssertionError|Expected|assert/i.test(l)).slice(0, 5);
    for (const fl of failLines) {
      findings.push({ type: 'detail', text: fl.trim() });
    }
  } else if (log.includes('lint') || log.includes('ESLint') || log.includes('warning') && log.includes('error')) {
    category = 'lint-error';
    findings.push({ type: 'error', text: 'Linting error detected.' });
  } else if (log.includes('TypeError') || log.includes('type error') || log.includes('TS')) {
    category = 'type-error';
    findings.push({ type: 'error', text: 'Type error detected in compilation.' });
  } else if (log.includes('build') && (log.includes('error') || log.includes('Error'))) {
    category = 'build-failure';
    findings.push({ type: 'error', text: 'Build failure detected.' });
  } else if (log.length > 0) {
    category = 'generic';
    findings.push({ type: 'error', text: 'CI failure detected. Review the log for details.' });
  } else {
    findings.push({ type: 'info', text: 'No failure log available. The run may still be in progress.' });
  }

  return {
    category,
    jobName,
    findings,
    canAutoFix: category === 'test-failure' || category === 'lint-error' || category === 'type-error',
    suggestedAction: category === 'test-failure' ? 'Review failing tests and update assertions or fix code.' :
                     category === 'lint-error' ? 'Run linter with --fix flag and commit changes.' :
                     category === 'type-error' ? 'Fix type errors in source code.' :
                     category === 'build-failure' ? 'Check build configuration and dependencies.' :
                     'Review the full log output for error details.',
  };
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

function getDuration(start, end) {
  if (!start || !end) return '';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 0) return '';
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = secs % 60;
  if (mins < 60) return `${mins}m ${remSecs}s`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ${mins % 60}m`;
}

function getStatusClass(status, conclusion) {
  if (status === 'in_progress' || status === 'queued') return 'run-in-progress';
  if (conclusion === 'success') return 'run-success';
  if (conclusion === 'failure') return 'run-failure';
  return 'run-neutral';
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('ci-monitor unit tests', () => {
  it('analyzeFailure: detects test failures', () => {
    const result = analyzeFailure('FAIL test/auth.spec.js\n  AssertionError: expected 200', 'test-job');
    assert.strictEqual(result.category, 'test-failure');
    assert.strictEqual(result.canAutoFix, true);
    assert.ok(result.findings.length >= 1);
    assert.ok(result.findings[0].text.includes('Test failure'));
  });

  it('analyzeFailure: detects lint errors', () => {
    const result = analyzeFailure('ESLint found 3 errors', 'lint-job');
    assert.strictEqual(result.category, 'lint-error');
    assert.strictEqual(result.canAutoFix, true);
  });

  it('analyzeFailure: detects type errors', () => {
    const result = analyzeFailure('TypeError: Cannot read property', 'build-job');
    assert.strictEqual(result.category, 'type-error');
    assert.strictEqual(result.canAutoFix, true);
  });

  it('analyzeFailure: detects build failures', () => {
    const result = analyzeFailure('build failed with Error: module not found', 'build-job');
    assert.strictEqual(result.category, 'build-failure');
    assert.strictEqual(result.canAutoFix, false);
  });

  it('analyzeFailure: handles empty log', () => {
    const result = analyzeFailure('', 'unknown');
    assert.strictEqual(result.category, 'unknown');
    assert.ok(result.findings[0].text.includes('No failure log'));
  });

  it('analyzeFailure: generic fallback for unknown logs', () => {
    const result = analyzeFailure('something went wrong but who knows what', 'job');
    assert.strictEqual(result.category, 'generic');
  });

  it('timeAgo: returns just now for recent', () => {
    assert.strictEqual(timeAgo(new Date().toISOString()), 'just now');
  });

  it('timeAgo: returns empty for null', () => {
    assert.strictEqual(timeAgo(null), '');
  });

  it('getDuration: formats seconds', () => {
    const start = '2024-01-01T00:00:00Z';
    const end = '2024-01-01T00:00:45Z';
    assert.strictEqual(getDuration(start, end), '45s');
  });

  it('getDuration: formats minutes and seconds', () => {
    const start = '2024-01-01T00:00:00Z';
    const end = '2024-01-01T00:03:15Z';
    assert.strictEqual(getDuration(start, end), '3m 15s');
  });

  it('getDuration: returns empty for missing dates', () => {
    assert.strictEqual(getDuration(null, null), '');
    assert.strictEqual(getDuration('2024-01-01', null), '');
  });

  it('getStatusClass: maps correctly', () => {
    assert.strictEqual(getStatusClass('in_progress', null), 'run-in-progress');
    assert.strictEqual(getStatusClass('queued', null), 'run-in-progress');
    assert.strictEqual(getStatusClass('completed', 'success'), 'run-success');
    assert.strictEqual(getStatusClass('completed', 'failure'), 'run-failure');
    assert.strictEqual(getStatusClass('completed', 'cancelled'), 'run-neutral');
  });
});

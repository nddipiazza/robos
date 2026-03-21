'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');

// ── Functions from app ──────────────────────────────────────────────────────

// Report builder is primarily UI + AI interaction, but we can test
// utility patterns used in the renderer

function sanitizeReportName(name) {
  return name.replace(/[^a-zA-Z0-9-_ ]/g, '').substring(0, 60).trim();
}

function truncateQuery(query, maxLen) {
  if (!query) return '';
  if (query.length <= maxLen) return query;
  return query.substring(0, maxLen) + '...';
}

function parseReportSections(text) {
  if (!text) return [];
  const lines = text.split('\n');
  const sections = [];
  let current = null;

  for (const line of lines) {
    if (line.startsWith('#') || line.startsWith('**')) {
      if (current) sections.push(current);
      current = { title: line.replace(/^[#*\s]+/, '').trim(), content: '' };
    } else if (current) {
      current.content += line + '\n';
    }
  }
  if (current) sections.push(current);
  return sections;
}

function exampleQueries() {
  return [
    'How many PRs did each developer merge in the last 30 days?',
    'Show me tasks stuck in review for more than 2 days',
    'Compare issue close rate this month vs last month',
    'Which developers have the most open issues assigned?',
  ];
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('report-builder unit tests', () => {
  it('sanitizeReportName: removes special characters', () => {
    assert.strictEqual(sanitizeReportName('PRs per dev!@#$%'), 'PRs per dev');
  });

  it('sanitizeReportName: truncates long names', () => {
    const long = 'a'.repeat(100);
    assert.ok(sanitizeReportName(long).length <= 60);
  });

  it('truncateQuery: returns full string if short', () => {
    assert.strictEqual(truncateQuery('short', 100), 'short');
  });

  it('truncateQuery: truncates and adds ellipsis', () => {
    assert.strictEqual(truncateQuery('hello world', 5), 'hello...');
  });

  it('truncateQuery: handles null', () => {
    assert.strictEqual(truncateQuery(null, 10), '');
  });

  it('parseReportSections: extracts markdown sections', () => {
    const text = '# Summary\nSome findings\n# Details\nMore info\n';
    const sections = parseReportSections(text);
    assert.strictEqual(sections.length, 2);
    assert.strictEqual(sections[0].title, 'Summary');
    assert.ok(sections[0].content.includes('findings'));
  });

  it('parseReportSections: handles empty text', () => {
    assert.strictEqual(parseReportSections('').length, 0);
    assert.strictEqual(parseReportSections(null).length, 0);
  });

  it('exampleQueries: returns array of strings', () => {
    const queries = exampleQueries();
    assert.ok(Array.isArray(queries));
    assert.ok(queries.length >= 4);
    queries.forEach(q => assert.strictEqual(typeof q, 'string'));
  });
});

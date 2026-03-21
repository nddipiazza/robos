'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');

// ── Extract pure logic from issue-manager for testing ────────────────────────

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderMd(md) {
  if (!md || !md.trim()) return '<em class="no-desc">No description provided.</em>';
  let html = escHtml(md);
  html = html.replace(/```[\w]*\n?([\s\S]*?)```/g, (_, c) => `<pre><code>${c}</code></pre>`);
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm,  '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm,   '<h1>$1</h1>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  html = html.replace(/^---+$/gm, '<hr/>');
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, m => `<ul>${m}</ul>`);
  html = html.replace(/\n{2,}/g, '</p><p>');
  html = '<p>' + html + '</p>';
  html = html.replace(/<p>\s*<(h[1-3]|pre|ul|hr|blockquote)/g, '<$1');
  html = html.replace(/<\/(h[1-3]|pre|ul|hr|blockquote)>\s*<\/p>/g, '</$1>');
  return html;
}

function detectIssueType(labels) {
  if (!labels || !labels.length) return null;
  const labelNames = labels.map(l => (typeof l === 'string' ? l : l.name || '').toLowerCase());
  if (labelNames.some(l => l === 'bug')) return 'bug';
  if (labelNames.some(l => l.includes('feature'))) return 'feature';
  if (labelNames.some(l => l === 'task' || l === 'chore')) return 'task';
  return null;
}

function activeTS(settings) {
  const servers = settings.task_servers || [];
  if (!servers.length) return null;
  const activeId = settings.active_task_server;
  return (activeId && servers.find(s => s.id === activeId)) || servers[0];
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('issue-manager unit tests', () => {
  it('escHtml: escapes HTML entities', () => {
    assert.strictEqual(escHtml('<script>alert("xss")</script>'),
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  });

  it('renderMd: renders empty input as no-description', () => {
    assert.ok(renderMd('').includes('No description provided'));
    assert.ok(renderMd(null).includes('No description provided'));
  });

  it('renderMd: renders headings', () => {
    assert.ok(renderMd('# Title').includes('<h1>Title</h1>'));
    assert.ok(renderMd('## Subtitle').includes('<h2>Subtitle</h2>'));
  });

  it('renderMd: renders bold and italic', () => {
    assert.ok(renderMd('**bold**').includes('<strong>bold</strong>'));
    assert.ok(renderMd('*italic*').includes('<em>italic</em>'));
  });

  it('renderMd: renders inline code', () => {
    assert.ok(renderMd('use `npm install`').includes('<code>npm install</code>'));
  });

  it('renderMd: renders links', () => {
    const result = renderMd('[click](https://example.com)');
    assert.ok(result.includes('<a href="https://example.com">click</a>'));
  });

  it('renderMd: renders code blocks', () => {
    const result = renderMd('```\nconst x = 1;\n```');
    assert.ok(result.includes('<pre><code>'));
    assert.ok(result.includes('const x = 1;'));
  });

  it('detectIssueType: detects bug from labels', () => {
    assert.strictEqual(detectIssueType([{ name: 'bug' }, { name: 'priority:high' }]), 'bug');
  });

  it('detectIssueType: detects feature from labels', () => {
    assert.strictEqual(detectIssueType([{ name: 'feature-request' }]), 'feature');
  });

  it('detectIssueType: returns null for no matching labels', () => {
    assert.strictEqual(detectIssueType([{ name: 'documentation' }]), null);
    assert.strictEqual(detectIssueType([]), null);
    assert.strictEqual(detectIssueType(null), null);
  });

  it('activeTS: returns first server when no active set', () => {
    const settings = { task_servers: [{ id: 'a' }, { id: 'b' }] };
    assert.strictEqual(activeTS(settings).id, 'a');
  });

  it('activeTS: returns active server by id', () => {
    const settings = { task_servers: [{ id: 'a' }, { id: 'b' }], active_task_server: 'b' };
    assert.strictEqual(activeTS(settings).id, 'b');
  });

  it('activeTS: returns null when no servers', () => {
    assert.strictEqual(activeTS({ task_servers: [] }), null);
    assert.strictEqual(activeTS({}), null);
  });
});

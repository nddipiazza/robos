'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { marked } = require('marked');
const { createGuideRenderer } = require('../scripts/guide-markdown');
const render = md => marked.parse(md, { renderer: createGuideRenderer() });

test('readiness checklists separate markers from complete text, including emphasis and links', () => {
  const html = render('- [ ] Open a **test ticket** and record [approval](../approval/)\n- [x] Log one conversation');
  assert.ok(html.includes('<li class="check"><span class="box" aria-hidden="true"></span><div class="check-text">Open a <strong>test ticket</strong> and record <a href="../approval/">approval</a></div></li>'));
  assert.ok(html.includes('<li class="check done"><span class="box" aria-hidden="true">✓</span><div class="check-text">Log one conversation</div></li>'));
  assert.ok(!html.includes('<input'));
});

test('ordinary bullets and nested lists keep their existing markup', () => {
  const md = '- First item with **emphasis**\n  - Nested [link](../next/)\n- Second item';
  assert.equal(render(md), marked.parse(md));
});

test('task list paragraphs and nested items stay inside the text column', () => {
  const html = render('- [ ] First paragraph\n\n  Second paragraph\n\n  - Nested item');
  assert.match(html, /<div class="check-text"><p>\s*First paragraph<\/p>/);
  assert.ok(html.includes('<p>Second paragraph</p>'));
  assert.ok(html.includes('<li>Nested item</li>'));
  assert.match(html, /<\/ul>\s*<\/div><\/li>/);
});

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const guide = require('../scripts/business-guide');
const businesses = require('../guide/businesses.json');
test('each supported business has a distinct published video and its own tutorial', () => {
  guide.validate(businesses);
  for (const b of businesses) {
    const section = guide.section(b);
    const page = guide.tutorial(b, businesses, () => null);
    assert.ok(section.includes(`/point-of-sale/${b.id}/`));
    assert.ok(section.includes(`youtube-nocookie.com/embed/${b.youtubeId}`));
    assert.ok(page.includes(`permalink: /point-of-sale/${b.id}/`));
    assert.equal((page.match(/id="step-/g) || []).length, b.steps.length);
    assert.match(page, /sample data and demo payments/);
    assert.equal((page.match(/<h1>/g) || []).length, 1);
  }
});
test('incomplete and reused video configurations fail instead of publishing placeholders', () => {
  assert.throws(() => guide.validate(businesses.map(b => ({...b,youtubeId:null}))));
  assert.throws(() => guide.validate(businesses.map(b => ({...b,youtubeId:businesses[0].youtubeId}))));
});
test('tutorial prose is escaped and absent screenshots are omitted', () => {
  const b = {...businesses[0],steps:[{title:'<script>',actions:['a & b']}]};
  const page = guide.tutorial(b,businesses,()=>null);
  assert.ok(page.includes('&lt;script&gt;'));
  assert.ok(page.includes('a &amp; b'));
  assert.ok(!page.includes('<img'));
});

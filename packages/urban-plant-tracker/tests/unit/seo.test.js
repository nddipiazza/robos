import { test } from 'node:test';
import assert from 'node:assert/strict';
import robots from '../../src/app/robots.js';
import { PRIVATE_PATHS, SITE_URL } from '../../src/lib/site.js';

test('robots.txt allows search engines and AI agents, blocks private paths, points to the sitemap', () => {
  const r = robots();
  const agents = r.rules.flatMap((x) => [].concat(x.userAgent));
  for (const a of ['Googlebot', 'Bingbot', 'OAI-SearchBot', 'ChatGPT-User', 'Claude-SearchBot', 'ClaudeBot', 'PerplexityBot', '*']) {
    assert.ok(agents.includes(a), `${a} missing`);
  }
  for (const rule of r.rules) assert.deepEqual(rule.disallow, PRIVATE_PATHS);
  assert.equal(r.sitemap, `${SITE_URL}/sitemap.xml`);
});

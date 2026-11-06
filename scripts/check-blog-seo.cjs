#!/usr/bin/env node
'use strict';
// Check Google's crawl signals on the actual Jekyll output before publication.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const output = path.resolve(process.argv[2] || '_site');
const origin = 'https://rowbose.com';
const read = name => fs.readFileSync(path.join(output, name), 'utf8');
const graph = html => [...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)]
  .flatMap(match => JSON.parse(match[1])['@graph'] || []);
const index = read('blog/index.html');
const blog = graph(index).find(node => node['@type'] === 'Blog');
assert.ok(blog?.blogPost?.length, 'The blog must identify its posts');
assert.match(read('index.html'), /<meta name="google-site-verification" content="[^"]+">/);
assert.match(read('robots.txt'), /Sitemap: https:\/\/rowbose\.com\/blog\/sitemap\.xml/);
const mainSitemap = read('sitemap.xml');
const blogSitemap = read('blog/sitemap.xml');
const urls = [...blogSitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
const sources = fs.readdirSync(path.resolve(__dirname, '../site/_blog')).filter(name => name.endsWith('.html'));
assert.equal(urls.length, sources.length, 'Every source post must be in the blog sitemap');
assert.equal(new Set(urls).size, urls.length, 'No duplicate sitemap URLs');
assert.equal(blog.blogPost.length, urls.length, 'The blog must reference every post');
for (const url of urls) {
  assert.ok(url.startsWith(`${origin}/blog/`) && url.endsWith('/'), `Noncanonical post URL: ${url}`);
  const pathname = new URL(url).pathname;
  const html = read(`${pathname.slice(1)}index.html`);
  assert.match(html, /<meta name="robots" content="index, follow/);
  assert.doesNotMatch(html, /<meta\b[^>]*content="[^"]*noindex/i);
  assert.ok(html.includes(`rel="canonical" href="${url}"`), `${url}: canonical`);
  assert.ok(index.includes(`href="${pathname}"`), `${url}: crawlable index link`);
  assert.ok(mainSitemap.includes(`<loc>${url}</loc>`), `${url}: main sitemap`);
  assert.ok(blog.blogPost.some(post => post['@id'] === `${url}#webpage`), `${url}: blog relationship`);
  const nodes = graph(html);
  const article = nodes.find(node => node['@type'] === 'BlogPosting');
  assert.equal(article?.url, url);
  assert.equal(article.mainEntityOfPage, url);
  assert.equal(article.isPartOf['@id'], `${origin}/blog/#webpage`);
  assert.ok(article.headline && article.description, `${url}: article text`);
  assert.ok(Number.isFinite(Date.parse(article.datePublished)), `${url}: publication date`);
  if (article.dateModified) assert.ok(Date.parse(article.dateModified) >= Date.parse(article.datePublished));
  assert.ok(nodes.some(node => node['@id'] === article.author['@id'] && node.name && node.url), `${url}: author`);
  assert.ok(nodes.some(node => node['@id'] === article.publisher['@id'] && node.logo), `${url}: publisher`);
  assert.ok(article.image.startsWith(`${origin}/`), `${url}: absolute article image`);
  assert.ok(fs.existsSync(path.join(output, new URL(article.image).pathname)), `${url}: image exists`);
  const crumbs = nodes.find(node => node['@type'] === 'BreadcrumbList');
  assert.deepEqual(crumbs?.itemListElement.map(item => item.position), [1, 2, 3]);
  assert.equal(crumbs.itemListElement[2].item, url);
}
console.log(`Verified crawlable links, canonicals, sitemaps and article structured data for ${urls.length} blog posts.`);

// Generic platform steps. Add your app's steps in new files under tests/e2e/support/.
// Helpers: `this.actor(name)` gives each person their own recorded phone (see world.mjs);
// `writeCameraQr(actor.cameraFile, text)` points an actor's fake camera at a QR code.
import { Given, When, Then } from '@cucumber/cucumber';
import { expect, request as pwRequest } from 'playwright/test';
import { BASE_URL, rand } from './world.mjs';

export const PASSWORD = () => `Stage-Dive-${rand(6)}-2026`;

export async function type(locator, text) {
  await locator.click();
  await locator.fill('');
  await locator.pressSequentially(text, { delay: 28 });
}

export async function pause(ms = 500) {
  await new Promise((r) => setTimeout(r, ms));
}

export async function signUp(world, name) {
  const a = await world.actor(name);
  const p = a.page;
  a.email = `e2e.${name.toLowerCase()}.${world.runId.toLowerCase()}${rand(3).toLowerCase()}@example.com`;
  a.password = PASSWORD();
  if (!p.url().includes('/signup')) await p.goto('/signup');
  const form = p.getByTestId('signup-form');
  await type(form.locator('input[name=displayName]'), name);
  await type(form.locator('input[name=email]'), a.email);
  await type(form.locator('input[name=password]'), a.password);
  await pause(300);
  await p.getByTestId('signup-submit').click();
  await p.waitForURL('**/dashboard**');
  return a;
}

async function apiCall(world, { method = 'POST', path, headers = {}, data }) {
  const ctx = await pwRequest.newContext();
  const res = await ctx.fetch(`${BASE_URL}${path}`, { method, headers: { 'content-type': 'application/json', ...headers }, data });
  const text = await res.text();
  let body = {};
  try {
    body = JSON.parse(text);
  } catch {
    body = { text: text.slice(0, 200) };
  }
  world.logApi({ method, url: path, status: res.status(), request: { headers, ...(data || {}) }, response: body });
  await ctx.dispose();
  return { status: res.status(), body, text };
}

// ------------------------------------------------------------------- auth

Given('{string} opens the site on a phone', async function (name) {
  const a = await this.actor(name);
  await a.page.goto('/');
  await expect(a.page.locator('.hero-title')).toBeVisible();
  await pause(900);
  await a.page.mouse.wheel(0, 700);
  await pause(700);
  await a.page.mouse.wheel(0, -700);
  await pause(400);
});

Given('{string} opens the sign up page on a phone', async function (name) {
  const a = await this.actor(name);
  await a.page.goto('/signup');
  await expect(a.page.getByTestId('signup-form')).toBeVisible();
});

When('{string} taps the call to action in the hero', async function (name) {
  const a = await this.actor(name);
  await a.page.getByTestId('hero-cta').click();
  await a.page.waitForURL('**/signup');
});

When('{string} signs up with a fresh email and a strong password', async function (name) {
  await signUp(this, name);
});

Then('{string} sees her/his/their dashboard', async function (name) {
  const a = await this.actor(name);
  if (!a.page.url().includes('/dashboard')) await a.page.goto('/dashboard');
  await expect(a.page.getByTestId('dashboard-title')).toContainText(name);
  await pause(600);
});

When('{string} logs out', async function (name) {
  const a = await this.actor(name);
  await a.page.getByTestId('tab-account').click();
  await a.page.waitForURL('**/account');
  await expect(a.page.getByTestId('account-email')).toHaveText(a.email);
  await pause(400);
  await a.page.getByTestId('logout').click();
  await a.page.waitForURL(BASE_URL + '/');
  await expect(a.page.getByTestId('nav-login-m')).toBeVisible();
});

When('{string} logs back in with the same credentials', async function (name) {
  const a = await this.actor(name);
  await a.page.getByTestId('nav-login-m').click();
  await a.page.waitForURL('**/login**');
  const form = a.page.getByTestId('login-form');
  await type(form.locator('input[name=email]'), a.email);
  await type(form.locator('input[name=password]'), a.password);
  await a.page.getByTestId('login-submit').click();
  await a.page.waitForURL('**/dashboard**');
});

// ------------------------------------------------------------- crawlers

Then('robots.txt welcomes search engines and AI agents but blocks private paths', async function () {
  const r = await apiCall(this, { method: 'GET', path: '/robots.txt' });
  expect(r.status).toBe(200);
  for (const agent of ['Googlebot', 'Bingbot', 'OAI-SearchBot', 'ChatGPT-User', 'Claude-SearchBot', 'ClaudeBot', 'PerplexityBot']) {
    expect(r.text).toContain(`User-Agent: ${agent}`);
  }
  expect(r.text).toContain('Disallow: /api/');
  expect(r.text).toContain('Disallow: /dashboard');
  expect(r.text).toMatch(/Sitemap: https?:\/\/\S+\/sitemap\.xml/);
  await pause(1200);
});

Then('the sitemap lists the home page', async function () {
  const r = await apiCall(this, { method: 'GET', path: '/sitemap.xml' });
  expect(r.status).toBe(200);
  expect(r.text).toMatch(/<loc>https?:\/\/[^<]+\/<\/loc>/);
  await pause(1000);
});

Then('llms.txt describes the site for AI agents', async function () {
  const r = await apiCall(this, { method: 'GET', path: '/llms.txt' });
  expect(r.status).toBe(200);
  expect(r.text.startsWith('# ')).toBeTruthy();
  await pause(1000);
});

Then('the home page has canonical, Open Graph and schema.org metadata', async function () {
  const r = await apiCall(this, { method: 'GET', path: '/' });
  expect(r.text).toContain('<link rel="canonical"');
  expect(r.text).toContain('property="og:image"');
  expect(r.text).toContain('name="twitter:card"');
  const blocks = [...r.text.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const types = blocks.flatMap((b) => (b['@graph'] || [b]).map((x) => x['@type']));
  expect(types).toEqual(expect.arrayContaining(['Organization', 'WebSite', 'WebApplication']));
  this.logApi({ method: 'CHECK', url: 'JSON-LD on /', status: 200, response: { types } });
  await pause(1200);
});

Then('private pages are marked noindex', async function () {
  const r = await apiCall(this, { method: 'GET', path: '/login' });
  expect(r.text).toMatch(/<meta name="robots" content="noindex/);
  await pause(1000);
});

// ---------------------------------------------------------- abuse controls

When('{string} tries to sign up with the password {string}', async function (name, pw) {
  const a = await this.actor(name);
  const form = a.page.getByTestId('signup-form');
  await type(form.locator('input[name=displayName]'), name);
  await type(form.locator('input[name=email]'), `e2e.${name.toLowerCase()}.${rand(5).toLowerCase()}@example.com`);
  await type(form.locator('input[name=password]'), pw);
  await a.page.getByTestId('signup-submit').click();
});

When('{string} tries to sign up with the email {string}', async function (name, email) {
  const a = await this.actor(name);
  const form = a.page.getByTestId('signup-form');
  await type(form.locator('input[name=email]'), email);
  await type(form.locator('input[name=password]'), PASSWORD());
  await a.page.getByTestId('signup-submit').click();
});

Then('{string} sees the error {string}', async function (name, text) {
  const a = await this.actor(name);
  await expect(a.page.getByTestId('form-error')).toContainText(text);
  await pause(900);
});

Then('a signup that fills the hidden honeypot field is rejected', async function () {
  const r = await apiCall(this, {
    path: '/api/auth/signup',
    data: { displayName: 'Spam Bot', email: `bot${rand(5)}@example.com`, password: PASSWORD(), website: 'http://cheap-pills.example', formStartedAt: Date.now() - 8000 },
  });
  expect(r.status).toBe(400);
  expect(r.body.error).toContain('rejected');
  await pause(1500);
});

Then('a cross-site POST to the signup API is blocked with {int}', async function (code) {
  const r = await apiCall(this, {
    path: '/api/auth/signup',
    headers: { origin: 'https://evil.example' },
    data: { displayName: 'CSRF', email: `csrf${rand(5)}@example.com`, password: PASSWORD(), formStartedAt: Date.now() - 8000 },
  });
  expect(r.status).toBe(code);
  await pause(1500);
});

Then('repeated wrong-password logins for one email are rate limited with {int}', async function (code) {
  const email = `nobody.${rand(6).toLowerCase()}@example.com`;
  let last;
  for (let i = 1; i <= 11; i++) {
    last = await apiCall(this, { path: '/api/auth/login', data: { email, password: `guess-number-${i}-xyz` } });
    if (i < 11) expect(last.status).toBe(401);
  }
  expect(last.status).toBe(code);
  await pause(1500);
});

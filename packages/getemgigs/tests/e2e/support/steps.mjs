import { Given, When, Then } from '@cucumber/cucumber';
import { expect, request as pwRequest } from 'playwright/test';
import { BASE_URL, rand } from './world.mjs';

const PASSWORD = () => `Stage-Dive-${rand(6)}-2026`;

function chicagoLocalInput(date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Chicago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

async function type(locator, text) {
  await locator.click();
  await locator.fill('');
  await locator.pressSequentially(text, { delay: 28 });
}

async function pause(ms = 500) {
  await new Promise((r) => setTimeout(r, ms));
}

async function signUp(world, name) {
  const a = await world.actor(name);
  const p = a.page;
  a.email = `e2e.${name.toLowerCase()}.${world.runId.toLowerCase()}${rand(3).toLowerCase()}@getemgigs.com`;
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

async function createBand(world, name, bandBase, hometown = 'Austin, TX') {
  const a = await world.actor(name);
  const p = a.page;
  const bandName = `${bandBase} ${world.runId}`;
  world.bands.set(bandBase, bandName);
  a.band = bandName;
  const form = p.getByTestId('band-form');
  await type(form.locator('input[name=name]'), bandName);
  await type(form.locator('input[name=genre]'), 'Indie rock');
  await type(form.locator('input[name=hometown]'), hometown);
  await p.getByTestId('band-submit').click();
  await p.waitForURL('**/dashboard?welcome=1');
  await expect(p.getByTestId('band-name')).toHaveText(bandName);
}

async function venueByName(name) {
  const ctx = await pwRequest.newContext();
  const res = await ctx.get(`${BASE_URL}/api/venues`);
  const { venues } = await res.json();
  await ctx.dispose();
  const v = venues.find((x) => x.name === name);
  if (!v) throw new Error(`Venue ${name} not found`);
  return v;
}

async function wallet(world, name) {
  const a = await world.actor(name);
  await a.page.goto('/dashboard');
  return (await a.page.getByTestId('wallet-balance').textContent()).trim();
}

// ------------------------------------------------------------------ steps

Given('{string} opens getemgigs.com on a phone', async function (name) {
  const a = await this.actor(name);
  await a.page.goto('/');
  await expect(a.page.locator('.hero-title')).toBeVisible();
  await pause(900);
  await a.page.mouse.wheel(0, 700);
  await pause(900);
  await a.page.mouse.wheel(0, -700);
  await pause(500);
});

Given('{string} opens the sign up page on a phone', async function (name) {
  const a = await this.actor(name);
  await a.page.goto('/signup');
  await expect(a.page.getByTestId('signup-form')).toBeVisible();
});

When('{string} taps the sign up button in the hero', async function (name) {
  const a = await this.actor(name);
  await a.page.getByTestId('hero-cta').click();
  await a.page.waitForURL('**/signup');
});

When('{string} signs up with a fresh email and a strong password', async function (name) {
  await signUp(this, name);
});

Then('{string} is asked to set up a band', async function (name) {
  const a = await this.actor(name);
  await expect(a.page.getByRole('heading', { name: 'Set up your band' })).toBeVisible();
});

When('{string} creates the band {string} from {string}', async function (name, band, hometown) {
  await createBand(this, name, band, hometown);
});

Then('{string} sees the dashboard for {string} with a wallet of {string}', async function (name, band, amount) {
  const a = await this.actor(name);
  if (!a.page.url().includes('/dashboard')) await a.page.goto('/dashboard');
  await expect(a.page.getByTestId('band-name')).toHaveText(this.bands.get(band));
  await expect(a.page.getByTestId('wallet-balance')).toHaveText(amount);
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

Given('{string} is signed up with the band {string}', async function (name, band) {
  const a = await this.actor(name);
  await a.page.goto('/signup');
  await signUp(this, name);
  await createBand(this, name, band);
});

When(
  '{string} lists the gig {string} at {string} starting in {int} {word} with a {string} deposit',
  async function (name, title, venue, n, unit, deposit) {
    const a = await this.actor(name);
    const p = a.page;
    const ms = unit.startsWith('minute') ? n * 60e3 : unit.startsWith('hour') ? n * 3600e3 : n * 86400e3;
    const startsAt = new Date(Date.now() + ms);
    startsAt.setSeconds(0, 0);
    await p.getByTestId('list-gig').click();
    await p.waitForURL('**/gigs/new');
    const form = p.getByTestId('gig-form');
    await type(form.locator('input[name=title]'), title);
    const sel = p.getByTestId('venue-select');
    const value = await sel.evaluate((s, v) => [...s.options].find((o) => o.text.startsWith(v + ' —'))?.value, venue);
    if (!value) throw new Error(`venue option ${venue} missing`);
    await sel.selectOption(value);
    await p.getByTestId('starts-at').fill(chicagoLocalInput(startsAt));
    await form.locator('input[name=deposit]').fill(deposit.replace('$', ''));
    await pause(300);
    await p.getByTestId('gig-submit').click();
    await p.waitForURL('**/gigs/*?created=1');
    await expect(p.getByTestId('gig-title')).toHaveText(title);
    const id = new URL(p.url()).pathname.split('/').pop();
    this.gigs.set(title, { id, startsAt, owner: name });
    await pause(400);
    await p.goto('/dashboard');
  },
);

When('{string} finds {string} in the gig list and offers a Buddy Gig', async function (name, title) {
  const a = await this.actor(name);
  const p = a.page;
  await p.getByRole('link', { name: 'Gigs', exact: true }).first().click();
  await p.waitForURL('**/gigs');
  const card = p.getByTestId('gig-card').filter({ hasText: title });
  await card.scrollIntoViewIfNeeded();
  await pause(500);
  await card.click();
  await p.waitForURL(`**/gigs/${this.gigs.get(title).id}`);
  const form = p.getByTestId('propose-form');
  await form.scrollIntoViewIfNeeded();
  const mine = [...this.gigs.entries()].find(([, g]) => g.owner === name)[0];
  const sel = p.getByTestId('my-gig-select');
  const value = await sel.evaluate((s, t) => [...s.options].find((o) => o.text.startsWith(t))?.value, mine);
  await sel.selectOption(value);
  await type(form.locator('textarea[name=message]'), 'We’ll bring the whole crew — see you up front!');
  await p.getByTestId('propose-submit').click();
  await p.waitForURL('**/deals/*?sent=1');
  await expect(p.getByTestId('deal-status')).toHaveText('Offer pending');
  this.deals.set('current', new URL(p.url()).pathname.split('/').pop());
});

Then('{string} sees the Buddy Gig offer from {string} on the dashboard', async function (name, band) {
  const a = await this.actor(name);
  await a.page.goto('/dashboard');
  const row = a.page.getByTestId('deal-row').filter({ hasText: this.bands.get(band) });
  await expect(row).toBeVisible();
  await expect(row).toContainText('Offer pending');
});

When('{string} accepts the Buddy Gig offer', async function (name) {
  const a = await this.actor(name);
  await a.page.getByTestId('deal-row').first().click();
  await a.page.waitForURL(`**/deals/${this.deals.get('current')}`);
  await pause(600);
  await a.page.getByTestId('accept-deal').click();
  await expect(a.page.getByTestId('deal-status')).toHaveText('Deposits locked');
});

Then('the deal shows {string} for {string}', async function (status, name) {
  const a = await this.actor(name);
  await expect(a.page.getByTestId('deal-status')).toHaveText(status);
  await expect(a.page.getByTestId('my-attendance')).toHaveText('Not checked in');
});

Then('{string} has a wallet of {string}', async function (name, amount) {
  expect(await wallet(this, name)).toBe(amount);
});

When('{string} arrives at {string} and checks in with GPS', async function (name, venueName) {
  const a = await this.actor(name);
  const v = await venueByName(venueName);
  await a.context.grantPermissions(['geolocation'], { origin: BASE_URL });
  // ~25m from the venue's front door.
  await a.context.setGeolocation({ latitude: v.lat + 0.0002, longitude: v.lon + 0.0001, accuracy: 12 });
  await a.page.goto(`/deals/${this.deals.get('current')}`);
  const btn = a.page.getByTestId('checkin');
  await btn.scrollIntoViewIfNeeded();
  await pause(700);
  await btn.click();
});

Then('{string} sees the check-in verified and the deposit refunded', async function (name) {
  const a = await this.actor(name);
  await expect(a.page.getByTestId('checkin-verified')).toContainText('deposit is back in your wallet');
  await expect(a.page.getByTestId('my-attendance')).toHaveText('Verified at venue');
  await a.page.getByTestId('deal-timeline').scrollIntoViewIfNeeded();
  await pause(1200);
});

When('the next-morning settlement runs for the deal after both gigs', async function () {
  const secret = process.env.CRON_SECRET;
  if (!secret) return 'pending';
  const lastStart = Math.max(...[...this.gigs.values()].map((g) => g.startsAt.getTime()));
  const asOf = new Date(lastStart + 5 * 3600e3 + 10 * 60e3).toISOString();
  const ctx = await pwRequest.newContext();
  const url = `${BASE_URL}/api/cron/settle`;
  const res = await ctx.post(url, {
    headers: { authorization: `Bearer ${secret}` },
    data: { agreementId: this.deals.get('current'), asOf },
  });
  const body = await res.json();
  this.logApi({ method: 'POST', url: '/api/cron/settle', status: res.status(), request: { agreementId: this.deals.get('current'), asOf }, response: body });
  await ctx.dispose();
  expect(res.status()).toBe(200);
  expect(body.settled).toBe(1);
  await pause(2500);
});

Then('{string} sees a no-show payout of {string} from {string}', async function (name, amount, band) {
  const a = await this.actor(name);
  await a.page.goto('/dashboard');
  const ledger = a.page.getByTestId('ledger');
  await ledger.scrollIntoViewIfNeeded();
  const row = ledger.locator('li').filter({ hasText: 'No-show payout' });
  await expect(row).toContainText(`+${amount}`);
  await expect(row).toContainText(this.bands.get(band));
  await pause(1200);
});

When('{string} opens {string} and commits {int} Stay-To-Play tickets', async function (name, title, tickets) {
  const a = await this.actor(name);
  const p = a.page;
  await p.goto(`/gigs/${this.gigs.get(title).id}`);
  const form = p.getByTestId('stay-form');
  await form.scrollIntoViewIfNeeded();
  await pause(500);
  await form.locator('input[name=tickets]').fill(String(tickets));
  await p.getByTestId('stay-submit').click();
  await expect(p.getByTestId('form-notice')).toContainText(`${tickets} tickets`);
});

Then('{string} sees {string} supporting {string}', async function (name, support, title) {
  const a = await this.actor(name);
  const [band, count] = support.match(/^(.*) \((\d+)\)$/).slice(1);
  await a.page.goto(`/gigs/${this.gigs.get(title).id}`);
  await expect(a.page.getByText(`${this.bands.get(band)} (${count})`)).toBeVisible();
  await a.page.getByText(`${this.bands.get(band)} (${count})`).scrollIntoViewIfNeeded();
  await pause(1000);
});

When('{string} tries to sign up with the password {string}', async function (name, pw) {
  const a = await this.actor(name);
  const form = a.page.getByTestId('signup-form');
  await type(form.locator('input[name=displayName]'), name);
  await type(form.locator('input[name=email]'), `e2e.${name.toLowerCase()}.${rand(5).toLowerCase()}@getemgigs.com`);
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

async function apiCall(world, { method = 'POST', path, headers = {}, data }) {
  const ctx = await pwRequest.newContext();
  const res = await ctx.fetch(`${BASE_URL}${path}`, { method, headers: { 'content-type': 'application/json', ...headers }, data });
  let body = {};
  try {
    body = await res.json();
  } catch {}
  world.logApi({ method, url: path, status: res.status(), request: { headers, ...(data || {}) }, response: body });
  await ctx.dispose();
  return { status: res.status(), body };
}

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

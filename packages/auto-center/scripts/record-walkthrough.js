'use strict';
// Records the Auto Center YouTube walkthrough: one repair from the phone call to the keys, with the mechanic
// reading the car over a Bluetooth OBD-II adapter. The adapter is the recorded 2014 Grand Caravan with
// check-engine codes (tests/fixtures/obd), so the run is repeatable. The shop is set up off camera.
//
//   node scripts/record-walkthrough.js [outDir]
//
// Writes <outDir>/auto-center-walkthrough.webm (1920x1080), .vtt captions, a chapter list for the YouTube
// description, and a still per cue in frames/ for checking the overlay.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { _electron: electron } = require('../../robos-test/node_modules/playwright-core');
const { AutoCenter } = require('../lib/service');
const fixtureCatalog = require('../tests/e2e/support/fixture-catalog');
const { GraphWorkspace } = require('../../robos-graph/lib/graph-workspace');
const { node } = require('../lib/importer');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'evidence/walkthrough'));
const SLUG = 'auto-center-walkthrough';
const sleep = ms => new Promise(r => setTimeout(r, ms));

function setUpShop(base) {
  const cache = path.join(base, 'cache'), privateRoot = path.join(base, 'private'), people = path.join(base, 'people'), groups = path.join(base, 'groups');
  for (const d of [cache, people, groups]) fs.mkdirSync(d, { recursive: true });
  fixtureCatalog.build(cache);
  // The test catalog only describes P0420; give the van's other two codes their standard descriptions too.
  const ws = new GraphWorkspace(path.join(cache, 'workspace')), doc = ws.read();
  const extra = [['P0133', 'O2 Sensor Circuit Slow Response (Bank 1, Sensor 1)'], ['P0442', 'Evaporative Emission Control System Leak Detected (small leak)']].map(([code, d]) => node('DiagnosticCode', code, `${code} · ${d}`, { 'schema:name': code, 'schema:description': d }));
  const proposal = ws.propose({ document: { ...doc, 'robos:nodes': [...doc['robos:nodes'], ...extra] }, prompt: 'Walkthrough trouble codes' }); ws.apply(proposal, { expectedProposalId: proposal.id });
  const shop = new AutoCenter({ root: cache, privateRoot });
  shop.setMode('shop');
  shop.workshop('saveSettings', { name: 'Lopez Auto Repair', phone: '(555) 010-0111', currency: 'USD', defaultRate: '120.00' });
  shop.workshop('addTeammate', { name: 'Maria Lopez', role: 'Master technician', hourlyCost: '32.00' });
  const sam = shop.workshop('addCustomer', { name: 'Sam Rivera', phone: '(555) 010-0100', email: 'sam@example.com', preferredContact: 'phone call' });
  shop.workshop('addCustomerVehicle', { customer: sam['@id'], year: '2014', make: 'Dodge', model: 'Grand Caravan', plate: 'SAM 214' });
  return { cache, privateRoot, people, groups };
}

// Styles go in through Electron's insertCSS: the app's Content-Security-Policy blocks injected <style> tags.
const OVERLAY_CSS = `
    #wt-root{position:fixed;inset:0;pointer-events:none;z-index:2147483640;font-family:Ubuntu,"Segoe UI",system-ui,sans-serif}
    #wt-banner{position:absolute;left:50%;bottom:22px;transform:translate(-50%,20px);opacity:0;max-width:1060px;width:max-content;
      background:rgba(13,17,23,.93);color:#f0f6fc;border-left:5px solid #f0883e;border-radius:10px;padding:14px 22px;
      font-size:21px;line-height:1.4;box-shadow:0 10px 30px rgba(0,0,0,.35);transition:opacity .35s,transform .35s}
    #wt-banner.on{opacity:1;transform:translate(-50%,0)}
    #wt-banner b{display:block;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#f0883e;margin-bottom:3px}
    #wt-pointer{position:absolute;left:0;top:0;width:30px;height:30px;opacity:0;transform:translate(640px,360px);
      transition:transform .7s cubic-bezier(.2,.8,.2,1),opacity .3s;filter:drop-shadow(0 3px 6px rgba(0,0,0,.45))}
    #wt-callout{position:absolute;opacity:0;background:#f0883e;color:#0d1117;font-weight:700;font-size:15px;padding:6px 12px;
      border-radius:7px;white-space:nowrap;transition:opacity .25s}
    .wt-ring{position:absolute;width:44px;height:44px;margin:-22px 0 0 -22px;border:3px solid #f0883e;border-radius:50%;
      animation:wt-ring .6s ease-out forwards}
    @keyframes wt-ring{from{transform:scale(.4);opacity:1}to{transform:scale(1.7);opacity:0}}
    .wt-target{outline:3px solid #f0883e!important;outline-offset:3px!important;border-radius:6px}
    #wt-card{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:14px;
      background:linear-gradient(135deg,#0d1117 0%,#1b2a3a 100%);color:#f0f6fc;opacity:0;transition:opacity .5s;text-align:center;padding:0 120px}
    #wt-card.on{opacity:1}
    #wt-card .eyebrow{font-size:15px;letter-spacing:.2em;text-transform:uppercase;color:#f0883e;font-weight:700}
    #wt-card h1{font-size:54px;margin:0;font-weight:700}
    #wt-card p{font-size:24px;margin:0;max-width:900px;line-height:1.45;color:#c9d1d9}`;

// On-screen narration: a banner along the bottom, a pointer that travels to what is clicked, a short
// callout above it, and full-screen title cards between chapters.
const OVERLAY = `(() => {
  if (document.getElementById('wt-root')) return;
  const root = document.createElement('div'); root.id = 'wt-root';
  root.innerHTML = '<div id="wt-card"></div><div id="wt-banner"></div><div id="wt-callout"></div>' +
    '<svg id="wt-pointer" viewBox="0 0 24 24"><path d="M4 2l16 9-7 2-3 7z" fill="#fff" stroke="#0d1117" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  document.body.appendChild(root);
})()`;

async function main() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-walkthrough-'));
  const dirs = setUpShop(base);
  fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(path.join(OUT, 'frames'), { recursive: true });
  const rawDir = path.join(OUT, 'raw');
  const app = await electron.launch({
    executablePath: require(path.join(ROOT, 'node_modules/electron')),
    args: [path.join(ROOT, 'main.js'), '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--force-device-scale-factor=1.5'],
    recordVideo: { dir: rawDir, size: { width: 1920, height: 1080 } },
    env: { ...process.env, ROBOS_AUTO_PRIVATE: dirs.privateRoot, ROBOS_AUTO_CACHE: dirs.cache, ROBOS_PEOPLE_DIR: dirs.people, ROBOS_GROUPS_DIR: dirs.groups,
      ROBOS_AUTO_OBD_REPLAY: path.join(ROOT, 'tests/fixtures/obd/grand-caravan-2014-codes.json') },
  });
  const t0 = Date.now(), page = await app.firstWindow(), errors = [], cues = [], chapters = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForFunction(() => document.querySelector('#count')?.textContent.includes('graph entries'));
  await page.evaluate(() => { try { localStorage.removeItem('auto.mechanic'); localStorage.removeItem('auto.obdAdapter'); } catch {} });
  await app.evaluate(({ BrowserWindow }, css) => BrowserWindow.getAllWindows()[0].webContents.insertCSS(css), OVERLAY_CSS);
  await page.evaluate(OVERLAY);
  const at = () => (Date.now() - t0) / 1000;
  let frame = 0;
  const still = async () => { await page.screenshot({ path: path.join(OUT, 'frames', String(++frame).padStart(2, '0') + '.jpg'), type: 'jpeg', quality: 80 }); };

  async function card(eyebrow, title, text, ms = 3800) {
    chapters.push({ at: at(), title });
    cues.push({ at: at(), text: [title, text].filter(Boolean).join(' — ') });
    await page.evaluate(([e, h, p]) => { document.getElementById('wt-pointer').style.opacity = '0'; document.getElementById('wt-banner').classList.remove('on'); const c = document.getElementById('wt-card'); c.innerHTML = `<div class="eyebrow">${e}</div><h1>${h}</h1>${p ? `<p>${p}</p>` : ''}`; c.classList.add('on'); }, [eyebrow, title, text]);
    await sleep(900); await still(); await sleep(ms - 900);
    await page.evaluate(() => document.getElementById('wt-card').classList.remove('on')); await sleep(600);
  }
  async function say(step, text, ms = 3200) {
    cues.push({ at: at(), text });
    await page.evaluate(([s, t]) => { const b = document.getElementById('wt-banner'); b.innerHTML = `<b>${s}</b>${t}`; b.classList.add('on'); }, [step, text]);
    await sleep(ms);
  }
  // Move the pointer to an element, show a callout, then click / fill / type it for real.
  async function act(locator, { callout, fill, type, hold = 450 } = {}) {
    // Keep the target clear of the narration banner along the bottom.
    let box = await locator.first().boundingBox();
    if (!box || box.y < 70 || box.y + box.height > 560) { await locator.first().evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'instant' })); await sleep(250); box = await locator.first().boundingBox(); }
    if (!box) throw new Error('Nothing on screen for ' + locator);
    const x = box.x + Math.min(box.width / 2, 60), y = box.y + box.height / 2;
    await page.evaluate(([x, y, label, sel]) => {
      const p = document.getElementById('wt-pointer'), c = document.getElementById('wt-callout');
      p.style.opacity = '1'; p.style.transform = `translate(${x - 4}px,${y - 3}px)`;
      if (label) { c.textContent = label; c.style.left = Math.max(12, Math.min(innerWidth - 320, x - 20)) + 'px'; c.style.top = Math.max(10, y - 52) + 'px'; c.style.opacity = '1'; } else c.style.opacity = '0';
    }, [x, y, callout || '']);
    await locator.first().evaluate(el => el.classList.add('wt-target'));
    await sleep(750 + hold);
    await page.evaluate(([x, y]) => { const r = document.createElement('div'); r.className = 'wt-ring'; r.style.left = x + 'px'; r.style.top = y + 'px'; document.getElementById('wt-root').appendChild(r); setTimeout(() => r.remove(), 700); }, [x, y]);
    await locator.first().evaluate(el => el.classList.remove('wt-target')).catch(() => {});
    if (fill != null) { await locator.first().click(); await locator.first().fill(''); await locator.first().pressSequentially(fill, { delay: 35 }); }
    else if (type != null) { await locator.first().pressSequentially(type, { delay: 60 }); }
    else await locator.first().click();
    await page.evaluate(() => { document.getElementById('wt-callout').style.opacity = '0'; });
    await sleep(500);
  }
  const FD = '#frontdesk', MB = '#mechanic', CO = '#checkout';
  const nav = (view, label) => act(page.locator(`[data-view="${view}"]`), { callout: label });
  const choice = (scope, text, callout) => act(page.locator(`${scope} .choice`, { hasText: text }), { callout });
  const button = (scope, text, callout) => act(page.locator(`${scope} button`, { hasText: text }).last(), { callout });
  const next = () => act(page.locator(`${FD} .wizard-nav .big-btn`).last(), { callout: 'Next' });
  const done = () => page.evaluate(() => document.getElementById('wt-banner').classList.remove('on'));

  // ---- Intro
  await page.locator('#mode').selectOption('shop');
  await page.waitForFunction(() => document.querySelector('#workspace-label')?.textContent === 'AUTO MAINTENANCE CENTER');
  await page.locator(`[data-view="frontdesk"]`).click(); await page.locator(`${FD} .choice`).first().waitFor();
  await card('RobOS Auto Center', 'From the phone call to the keys', 'One repair through a small shop, with the van’s own trouble codes read over a $30 Bluetooth OBD-II adapter.', 5200);

  // ---- Front desk
  await card('Part 1', 'Front desk', 'Take the call and open a ticket.');
  await say('Front desk', 'Sam Rivera calls: the check-engine light is on in his van. Start an intake.', 1200);
  await choice(FD, 'Start an intake', 'Start an intake');
  await say('Front desk', 'It came in by phone. Sam is already a customer, so type part of his name.', 600);
  await choice(FD, 'Phone call', 'Phone call'); await button(FD, 'Next', 'Next');
  await choice(FD, 'Existing customer', 'Existing customer');
  await act(page.locator(`${FD} [name="lookup"]`), { fill: 'sam', callout: 'Search by name or phone' }); await sleep(600);
  await act(page.locator(`${FD} #customer-results .choice`, { hasText: 'Sam Rivera' }), { callout: 'Sam Rivera' }); await next();
  await say('Front desk', 'His van is on file. Cars read make, model and year, then the customer.', 900);
  await choice(FD, 'Dodge Grand Caravan 2014 — Sam Rivera', 'Pick the car'); await next();
  await say('Front desk', 'Pick the problem and answer with one tap each.', 600);
  await choice(FD, 'check-engine light', 'Engine or check-engine light');
  const answer = (q, a) => act(page.locator(`${FD} .q-block`, { hasText: q }).locator('.chip', { hasText: a }), { callout: a, hold: 150 });
  await answer('What is the engine doing', 'Check-engine light on'); await answer('When does it happen', 'All the time'); await answer('Is the check-engine light flashing', 'Steady');
  await next();
  await say('Front desk', 'Check the summary and open the ticket. The mechanics see it straight away.', 1200); await still();
  await button(FD, 'Open ticket', 'Open ticket');
  await page.locator(`${FD} .notice.ok`, { hasText: 'RO-0001' }).waitFor(); await sleep(1800); await done();

  // ---- Mechanic bench: read the car
  await card('Part 2', 'Read the car', 'The mechanic reads the van’s check-engine codes, VIN and live data over Bluetooth.');
  await say('Mechanic bench', 'Maria picks her name at the bench, opens the ticket and takes it.', 600);
  await nav('mechanic', 'Mechanic bench');
  await choice(MB, 'Maria Lopez', 'Maria Lopez');
  await choice(MB, 'RO-0001', 'RO-0001');
  await button(MB, 'Take this ticket', 'Take this ticket');
  await say('Mechanic bench', 'A vLinker OBD-II adapter is plugged in under the dash. Read the car finds it over Bluetooth.', 800);
  await button(MB, 'Read the car (OBD)', 'Read the car (OBD)');
  await button(MB, 'Find adapters', 'Find adapters');
  await page.locator('#obd-adapters .choice').first().waitFor({ timeout: 30000 });
  await act(page.locator('#obd-adapters .choice', { hasText: 'vLinker' }), { callout: 'vLinker MC-Android' });
  await page.locator('#obd-connected').waitFor({ timeout: 30000 });
  await say('Mechanic bench', 'Connected. The van answers on CAN bus. Press Read codes.', 1600);
  await button(MB, 'Read codes', 'Read codes'); await page.locator('#obd-scan').waitFor();
  await page.locator('#obd-scan').scrollIntoViewIfNeeded();
  await say('Mechanic bench', 'The check-engine light is on: two stored codes and one pending, with descriptions, plus the VIN.', 4800); await still();
  await say('Mechanic bench', 'Save the scan on the ticket. The VIN read from the car goes onto the vehicle record.', 500);
  await button('#obd-scan', 'Save scan to ticket', 'Save scan to ticket'); await sleep(1600); await still();
  await say('Mechanic bench', 'Use codes in diagnosis fills them in. Maria writes what she found.', 500);
  await button('#obd-scan', 'Use codes in diagnosis', 'Use codes in diagnosis');
  await act(page.locator(`${MB} .bench-panel [name="findings"]`), { fill: 'Upstream O2 sensor slow to switch; catalyst efficiency low. Replace sensor, recheck.', callout: 'What did you find?' });
  await sleep(800); await still();
  await button(MB, 'Save diagnosis', 'Save diagnosis'); await sleep(900);
  await say('Mechanic bench', 'Live data shows the engine as it runs: speed, coolant, battery voltage, fuel level.', 400);
  await button(MB, 'Read the car (OBD)', 'Read the car (OBD)');
  await button(MB, 'Show live data', 'Show live data');
  await page.locator('#obd-live [data-reading]').first().waitFor(); await page.locator('#obd-live').scrollIntoViewIfNeeded();
  await sleep(3800); await still();
  await button(MB, 'Stop live data', 'Stop live data'); await done();

  // ---- Estimate and approval
  await card('Part 3', 'Estimate and approval', 'Price the repair and record how the customer said yes.');
  await say('Front desk', 'Back at the front desk, the ticket waits under Estimates to prepare.', 400);
  await nav('frontdesk', 'Front desk');
  await act(page.locator(`${FD} .row-card`, { hasText: 'RO-0001' }).first().locator('button', { hasText: 'Open' }), { callout: 'Open RO-0001' });
  await say('Front desk', 'Itemize the parts and labor.', 300);
  const form = page.locator(`${FD} form.estimate-form`);
  await act(form.locator('.est-line[data-type="part"] [name="description"]'), { fill: 'Upstream oxygen sensor', callout: 'Part' });
  await act(form.locator('.est-line[data-type="part"] [name="quantity"]'), { fill: '1' });
  await act(form.locator('.est-line[data-type="part"] [name="price"]'), { fill: '89.00', callout: 'Price' });
  await act(form.locator('.est-line[data-type="labor"] [name="description"]'), { fill: 'Replace O2 sensor and recheck', callout: 'Labor' });
  await act(form.locator('.est-line[data-type="labor"] [name="hours"]'), { fill: '1' });
  await act(form.locator('.est-line[data-type="labor"] [name="price"]'), { fill: '120.00', callout: 'Rate' });
  await act(form.locator('button').last(), { callout: 'Save the estimate' }); await sleep(800);
  await say('Front desk', 'Sam approves by phone. The approval is recorded on the ticket.', 400);
  await page.locator(`${FD} form.decision [name="channel"]`).selectOption({ label: 'Phone' });
  await act(page.locator(`${FD} form.decision [data-decision="approved"]`), { callout: 'Approved' }); await sleep(900);
  await act(page.locator(`${FD} details`, { hasText: 'Ticket history' }).locator('summary'), { callout: 'Ticket history' });
  await page.locator(`${FD} details[open] li`, { hasText: 'approved by Sam Rivera' }).first().evaluate(el => el.scrollIntoView({ block: 'center' }));
  await sleep(2200); await still(); await done();

  // ---- Repair
  await card('Part 4', 'Do the work', 'Replace the sensor, clear the codes, log the time.');
  await say('Mechanic bench', 'After the repair, Maria reads the codes again and clears them.', 400);
  await nav('mechanic', 'Mechanic bench'); await choice(MB, 'RO-0001', 'RO-0001');
  await button(MB, 'Read the car (OBD)', 'Read the car (OBD)');
  await button(MB, 'Read codes', 'Read codes'); await page.locator('#obd-scan').waitFor();
  await button('#obd-scan', 'Clear codes', 'Clear codes…');
  await page.locator('#obd-clear-confirm').scrollIntoViewIfNeeded();
  await say('Mechanic bench', 'The bench asks first: clearing also resets the emissions readiness checks.', 3600); await still();
  await button('#obd-clear-confirm', 'Yes, clear the codes', 'Yes, clear the codes');
  await page.locator('#obd-mil', { hasText: 'off' }).waitFor(); await page.locator('#obd-scan').scrollIntoViewIfNeeded();
  await say('Mechanic bench', 'Check-engine light off, no codes.', 2600); await still();
  await say('Mechanic bench', 'Log the hours and finish the job with a short summary.', 400);
  await button(MB, 'Log hours', 'Log hours');
  await act(page.locator(`${MB} .bench-panel [name="hours"]`), { fill: '1', callout: 'Hours' });
  await button(MB, 'Save hours', 'Save hours'); await sleep(600);
  await button(MB, 'Finish the job', 'Finish the job');
  await act(page.locator(`${MB} .bench-panel [name="summary"]`), { fill: 'Replaced upstream O2 sensor. Codes cleared; no codes after a test drive.', callout: 'What was done?' });
  await button(MB, 'Mark work complete', 'Mark work complete'); await sleep(900); await done();

  // ---- Checkout
  await card('Part 5', 'Checkout', 'Invoice, payment and the keys.');
  await say('Checkout', 'The finished van is waiting at checkout. Issue the invoice from the approved estimate.', 400);
  await nav('checkout', 'Checkout'); await choice(CO, 'RO-0001', 'RO-0001');
  await sleep(900); await still();
  await button(CO, 'Issue invoice', 'Issue invoice'); await sleep(700);
  await say('Checkout', 'Take payment. Card, cash or check, in one go or in parts.', 400);
  await act(page.locator(`${CO} .chip`, { hasText: 'card' }), { callout: 'Card' });
  await button(CO, 'Record payment', 'Record payment'); await sleep(700);
  await button(CO, 'Continue', 'Continue');
  await say('Checkout', 'Hand back the keys. The ticket closes.', 300);
  await act(page.locator(`${CO} [name="collectedBy"]`), { fill: 'Sam Rivera', callout: 'Who collected the car?' });
  await button(CO, 'Hand over keys', 'Hand over keys');
  await page.locator(CO, { hasText: 'RO-0001 is closed' }).waitFor(); await sleep(2400); await still(); await done();

  // ---- Outro
  await card('RobOS Auto Center', 'Every step is tested', 'Each screen in this video is covered by end-to-end tests that drive the real app. The guide: rowbose.com/auto-center', 5200);
  const end = at();

  const video = page.video(); await app.close();
  const raw = await video.path(), final = path.join(OUT, SLUG + '.webm'); fs.renameSync(raw, final); fs.rmSync(rawDir, { recursive: true, force: true });
  const ts = s => { const ms = Math.round(s * 1000), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, sec = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`; };
  fs.writeFileSync(path.join(OUT, SLUG + '.vtt'), 'WEBVTT\n\n' + cues.map((c, i) => `${ts(c.at)} --> ${ts(cues[i + 1]?.at ?? end)}\n${c.text}\n`).join('\n'));
  const mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  fs.writeFileSync(path.join(OUT, 'chapters.txt'), chapters.map((c, i) => `${i === 0 ? '0:00' : mmss(c.at)} ${c.title}`).join('\n') + '\n');
  console.log(JSON.stringify({ video: final, seconds: Math.round(end), cues: cues.length, frames: frame, pageErrors: errors }, null, 1));
  if (errors.length) process.exitCode = 1;
}
main().catch(e => { console.error(e); process.exit(1); });

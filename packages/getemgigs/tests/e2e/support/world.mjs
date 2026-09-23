import { setWorldConstructor, World, setDefaultTimeout } from '@cucumber/cucumber';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

setDefaultTimeout(90 * 1000);

const here = path.dirname(fileURLToPath(import.meta.url));
export const BASE_URL = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
export const EVIDENCE_DIR = path.resolve(process.env.EVIDENCE_DIR || 'evidence');
const OVERLAY = fs.readFileSync(path.join(here, 'overlay.js'), 'utf8');
const RECORD = process.env.E2E_RECORD !== '0';
const SLOWMO = Number(process.env.E2E_SLOWMO || 120);

export const PHONE = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
};

let browser = null;
export async function sharedBrowser() {
  if (!browser) {
    browser = await chromium.launch({
      headless: process.env.HEADED !== '1',
      slowMo: SLOWMO,
      executablePath: process.env.CHROMIUM_PATH || undefined,
    });
  }
  return browser;
}
export async function closeBrowser() {
  if (browser) await browser.close();
  browser = null;
}

export function rand(n = 4) {
  return Math.random().toString(36).slice(2, 2 + n).toUpperCase();
}

/**
 * Wall-clock-stamped screen capture via CDP screencast. Every frame carries the browser's own
 * timestamp, so multiple actors can later be aligned exactly on one shared timeline
 * (Playwright's recordVideo drifts under load). Frames are encoded by scripts/encode-frames.mjs.
 */
async function startScreencast(a, dir) {
  fs.mkdirSync(dir, { recursive: true });
  a.frameDir = dir;
  a.cdp = await a.context.newCDPSession(a.page);
  a.cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    const file = `${String(a.frames.length).padStart(6, '0')}.jpg`;
    fs.writeFileSync(path.join(dir, file), Buffer.from(data, 'base64'));
    a.frames.push({ f: file, t: Math.round(metadata.timestamp * 1000) });
    a.cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await a.cdp.send('Page.startScreencast', { format: 'jpeg', quality: 82, maxWidth: 780, maxHeight: 1688 });
}

class RobosWorld extends World {
  constructor(options) {
    super(options);
    this.actors = new Map();
    this.bands = new Map(); // base band name -> actual unique name
    this.gigs = new Map(); // gig title -> { id, url }
    this.deals = new Map();
    this.stepActors = new Set();
    this.apiLog = [];
    this.stepApiLog = [];
    this.timeline = null; // set in Before
    this.runId = rand(4);
  }

  get scenarioDir() {
    return path.join(EVIDENCE_DIR, this.timeline.slug);
  }

  /** Get or create a named actor with its own phone-sized browser context and video. */
  async actor(name) {
    this.stepActors.add(name);
    if (this.actors.has(name)) return this.actors.get(name);
    const b = await sharedBrowser();
    const videoDir = path.join(this.scenarioDir, 'raw', name.toLowerCase());
    const extraHTTPHeaders = process.env.E2E_BYPASS_KEY ? { 'x-e2e-key': process.env.E2E_BYPASS_KEY } : undefined;
    const context = await b.newContext({
      ...PHONE,
      baseURL: BASE_URL,
      extraHTTPHeaders,
      locale: 'en-US',
      timezoneId: 'America/Chicago',
    });
    await context.addInitScript(OVERLAY);
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    const a = { name, context, page, email: null, password: null, band: null, frames: [], cdp: null };
    if (RECORD) await startScreencast(a, videoDir);
    this.actors.set(name, a);
    this.timeline.actors.push({ name });
    return a;
  }

  logApi(entry) {
    const e = { t: Date.now(), ...entry };
    this.apiLog.push(e);
    this.stepApiLog.push(e);
  }
}

setWorldConstructor(RobosWorld);

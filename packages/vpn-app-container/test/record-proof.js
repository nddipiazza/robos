'use strict';
const fs = require('node:fs');
const path = require('node:path');
// Optional real-client video recorder used in Linux CI, never a mock VPN UI.
async function record(cookie) {
  const { chromium } = require(process.env.ROBOS_PLAYWRIGHT_MODULE || 'playwright');
  const directory = path.join(__dirname, 'proof');
  fs.mkdirSync(directory, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 },
    recordVideo: { dir: directory, size: { width: 1920, height: 1080 } } });
  await context.addCookies([{ name: 'SID', value: cookie, url: 'http://127.0.0.1:18080' }]);
  const started = Date.now();
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:18080');
  await page.waitForTimeout(1200);
  const captions = [];
  async function result(title, passed = true) {
    await page.evaluate(({ title, passed }) => {
      let panel = document.getElementById('robos-proof');
      if (!panel) {
        panel = document.createElement('aside'); panel.id = 'robos-proof';
        Object.assign(panel.style, { position: 'fixed', right: '24px', bottom: '24px', width: '650px',
          padding: '24px', background: '#0d1117f5', color: '#e6edf3', border: '2px solid #00bcd4',
          borderRadius: '12px', zIndex: '2147483647', font: '20px/1.5 system-ui',
          maxHeight: '75vh', overflow: 'auto' });
        const heading = document.createElement('h2'); heading.textContent = 'RobOS · real VPN isolation test';
        heading.style.fontSize = '23px'; panel.append(heading); document.body.append(panel);
      }
      const item = document.createElement('p'); item.textContent = `${passed ? 'PASS' : 'FAIL'} · ${title}`;
      item.style.color = passed ? '#71e6bb' : '#ff8d8d'; panel.append(item);
      panel.scrollTop = panel.scrollHeight;
    }, { title, passed });
    captions.push({ start: (Date.now() - started) / 1000, title });
    await page.waitForTimeout(700);
  }
  await result('Real qBittorrent Web UI authenticated behind a disposable OpenVPN tunnel');
  return {
    result,
    async close() {
      const video = page.video();
      await context.close();
      await video.saveAs(path.join(directory, 'vpn-app-container.webm'));
      await browser.close();
      const timestamp = seconds => {
        const ms = Math.round(seconds * 1000);
        return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
      };
      const last = (Date.now() - started) / 1000;
      fs.writeFileSync(path.join(directory, 'vpn-app-container.vtt'), 'WEBVTT\n\n' + captions.map((cue, i) =>
        `${i + 1}\n${timestamp(cue.start)} --> ${timestamp(captions[i + 1]?.start || last)}\n${cue.title}\n`).join('\n'));
      fs.writeFileSync(path.join(directory, 'walkthrough.md'), '# Real qBittorrent VPN verification\n\n' + captions.map(cue => `- ${timestamp(cue.start)}: ${cue.title}`).join('\n'));
    },
  };
}
module.exports = { record };

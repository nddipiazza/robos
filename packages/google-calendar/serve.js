#!/usr/bin/env node
'use strict';

/**
 * Standalone daemon for the RobOS Add Calendar Event WebApp (:19226) + Outbound HTTPS Tunnel.
 * Automatically updates the "RobOS Calendar — Add Event Access Form" Google Doc with the
 * authenticated 1-button launch link when the tunnel comes online.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const {
  loadCalendarSettings,
  updateCalendarSettings,
  promoteCustomCalendarsToGoogleContainers,
  syncNamedCalendarsToThunderbird,
} = require('./lib/named-calendars');
const { createCalendarWebServer } = require('./lib/calendar-web-server');
const { syncCalendarAccessDocWithGoogleDrive } = require('./lib/access-doc-sync');

function findCloudflaredBin() {
  const candidates = [
    process.env.CLOUDFLARED_BIN,
    path.join(os.homedir(), '.local', 'bin', 'cloudflared'),
    '/usr/local/bin/cloudflared',
    '/usr/bin/cloudflared',
  ].filter(Boolean);
  return (
    candidates.find((p) => {
      try { return fs.existsSync(p); } catch { return false; }
    }) || ''
  );
}

function startPublicHttpsTunnel(localUrl) {
  const bin = findCloudflaredBin();
  if (!bin || process.env.GOOGLE_CALENDAR_NO_TUNNEL === '1') return null;

  const child = spawn(bin, ['tunnel', '--no-autoupdate', '--url', localUrl], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let announced = false;
  const onLine = (chunk) => {
    if (announced) return;
    const text = String(chunk || '');
    const m = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
    if (!m) return;
    announced = true;
    const tunnelUrl = m[0];
    const settings = loadCalendarSettings();
    const token = settings.webAuthToken || '';
    const authedTunnelUrl = token ? `${tunnelUrl}/?auth=${token}` : tunnelUrl;
    updateCalendarSettings({
      publicTunnelUrl: tunnelUrl,
      authedWebAppUrl: authedTunnelUrl,
    });
    console.log(`  • Public HTTPS (Google-Doc Gated): ${tunnelUrl}`);
    console.log(`  • Authenticated 1-Button Link:     ${authedTunnelUrl}`);
    syncCalendarAccessDocWithGoogleDrive({ webAppUrl: authedTunnelUrl })
      .then((res) => {
        console.log(`  • Synced Google Doc Access Form:   ${res.docUrl}`);
      })
      .catch((err) => {
        console.warn(`  • Google Doc auto-sync note: ${err.message}`);
      });
  };

  child.stdout.on('data', onLine);
  child.stderr.on('data', onLine);
  return child;
}

async function main() {
  const port = Number(process.env.GOOGLE_CALENDAR_WEB_PORT || process.env.PORT || 19226);
  const host = process.env.HOST || '0.0.0.0';
  const web = createCalendarWebServer();
  const info = await web.listen(port, host);
  const settings = loadCalendarSettings();
  const token = settings.webAuthToken || '';
  const lanAuthed = `${info.lanUrl}/?auth=${token}`;
  updateCalendarSettings({ lanWebAppUrl: lanAuthed });

  console.log('RobOS Add Calendar Event WebApp Server:');
  console.log(`  • Local:     ${info.localUrl}`);
  console.log(`  • Home Wi-Fi: ${lanAuthed}`);
  startPublicHttpsTunnel(info.localUrl);

  // Periodically check if any custom calendar (e.g. "Dipiazza Kids Calendar") has been created in Google Calendar web settings
  // and automatically promote + migrate its events into the new @group.calendar.google.com container.
  setInterval(async () => {
    try {
      const res = await promoteCustomCalendarsToGoogleContainers();
      if (res.promoted && res.promoted.length > 0) {
        console.log('  • Promoted custom calendar(s) to Google Calendar container:', res.promoted);
        await syncNamedCalendarsToThunderbird().catch(() => {});
        await syncCalendarAccessDocWithGoogleDrive().catch(() => {});
      }
    } catch {}
  }, 10000);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { startPublicHttpsTunnel };

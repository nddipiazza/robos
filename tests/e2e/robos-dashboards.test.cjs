'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');

const {
  DASHBOARD_LAYOUTS,
  DASHBOARD_WIDGET_CATALOG,
  collectLatestGitCommits,
  collectTodayCalendarEvents,
  collectRunningAgentSessions,
  createDashboardEngine,
} = require('../../packages/robos-lib/dashboard-engine');
const { createTvEngine } = require('../../packages/robos-lib/tv-engine');
const RobOSDashboardUI = require('../../packages/robos-ui/robos-dashboard');
const { SHACLValidator } = require('../../packages/robos-graph/lib/shacl-validator');

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', reject);
  });
}

test('RobOS Dashboards App, Embeddable <robos-dashboard> Component, KGraph Layouts & Smart TV Cast E2E', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-dashboards-test-'));
  t.after(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  await t.test('1. Validates KGraph dashboards package (.robos/kgraphs/dashboards/package.jsonld) against SHACL shapes', () => {
    const pkgPath = path.resolve(__dirname, '..', '..', '.robos', 'kgraphs', 'dashboards', 'package.jsonld');
    assert.ok(fs.existsSync(pkgPath), 'dashboards KGraph package.jsonld must exist');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const nodes = pkg['robos:nodes'] || [];
    assert.ok(nodes.length >= 20, 'Should contain layouts, widgets, dashboards, and cards');

    const validator = new SHACLValidator();
    const report = validator.validate(nodes);
    assert.equal(report.conforms, true, `SHACL violations: ${JSON.stringify(report.violations)}`);
  });

  await t.test('2. Resolves Daily Engineering & Agent Ops Dashboard (10 latest commits, daily calendar, tailed agent sessions)', () => {
    const engine = createDashboardEngine({ configDir: tmpDir });
    const ov = engine.getOverview('daily-engineering-ops');
    assert.equal(ov.ok, true);
    assert.equal(ov.dashboard.id, 'daily-engineering-ops');
    assert.equal(ov.dashboard.layout.id, 'mission-control-3col');
    assert.equal(ov.dashboard.cards.length, 3);
    assert.equal(DASHBOARD_LAYOUTS.length, 6);
    assert.equal(DASHBOARD_WIDGET_CATALOG.length, 8);

    // Card 1: 10 latest commit messages in compact readable list format
    const commitsCard = ov.dashboard.cards.find((c) => c.widgetType === 'git-commits');
    assert.ok(commitsCard);
    assert.equal(commitsCard.componentTag, 'robos-widget-git-commits');
    assert.equal(commitsCard.liveData.commits.length, 10);
    assert.ok(commitsCard.liveData.commits[0].shortSha);
    assert.ok(commitsCard.liveData.commits[0].subject);

    // Card 2: Calendar events for the day
    const calCard = ov.dashboard.cards.find((c) => c.widgetType === 'calendar-today');
    assert.ok(calCard);
    assert.equal(calCard.componentTag, 'robos-widget-calendar-today');
    assert.ok(calCard.liveData.events.length >= 4);

    // Card 3: Running RobOS agent sessions with status lines tailed
    const agentsCard = ov.dashboard.cards.find((c) => c.widgetType === 'agent-sessions');
    assert.ok(agentsCard);
    assert.equal(agentsCard.componentTag, 'robos-widget-agent-sessions');
    assert.ok(agentsCard.liveData.sessions.length >= 3);
    for (const s of agentsCard.liveData.sessions) {
      assert.ok(Array.isArray(s.statusLines) && s.statusLines.length > 0, `Session ${s.id} should have tailed statusLines`);
    }
  });

  await t.test('3. Supports switching KGraph card layouts, adding RobOS component widgets, and live data updates', () => {
    const engine = createDashboardEngine({ configDir: tmpDir });

    // Switch layout to 10-Foot Smart TV Wallboard
    const layoutRes = engine.setDashboardLayout({
      dashboardId: 'daily-engineering-ops',
      layoutId: 'tv-wallboard-10ft',
    });
    assert.equal(layoutRes.ok, true);
    assert.equal(layoutRes.dashboard.layout.id, 'tv-wallboard-10ft');

    // Add a calendar event for today
    const evtRes = engine.addCalendarEvent({
      time: '15:15',
      title: 'Smart TV Dashboard Demo with Team',
      location: 'Living Room Roku TV',
    });
    const calCard = evtRes.dashboard.cards.find((c) => c.widgetType === 'calendar-today');
    assert.ok(calCard.liveData.events.some((e) => e.title === 'Smart TV Dashboard Demo with Team'));

    // Append a live status line to running agent session tail
    const tailRes = engine.appendAgentStatusLine({
      line: '✔ Verified <robos-dashboard> embed and Smart TV wallboard cast',
    });
    const agentsCard = tailRes.dashboard.cards.find((c) => c.widgetType === 'agent-sessions');
    assert.ok(
      agentsCard.liveData.sessions[0].statusLines.some((l) =>
        l.includes('Verified <robos-dashboard> embed and Smart TV wallboard cast')
      )
    );

    // Embeddable <robos-dashboard> HTML rendering
    const html = RobOSDashboardUI.renderDashboardHtml(tailRes.dashboard, { editable: true });
    assert.ok(html.includes('robos-embed-dashboard'));
    assert.ok(html.includes('robos-widget-git-commits'));
    assert.ok(html.includes('robos-widget-calendar-today'));
    assert.ok(html.includes('robos-widget-agent-sessions'));
    assert.ok(html.includes('Smart TV Dashboard Demo with Team'));
  });

  await t.test('4. Shows the Dashboard on RobOS Smart TV Studio (:19210/dashboard)', async () => {
    process.env.ROBOS_TEST = '1';
    const tvEngine = createTvEngine({ configDir: tmpDir, portalPort: 0 });
    const srv = await tvEngine.startPortalServer(0);
    assert.equal(srv.ok, true);

    try {
      const castRes = await tvEngine.castDashboard({
        tvId: 'tv-livingroom-tcl-roku',
        dashboardId: 'daily-engineering-ops',
        layoutId: 'tv-wallboard-10ft',
      });
      assert.equal(castRes.ok, true);
      assert.equal(castRes.castSession.active, true);
      assert.equal(castRes.castSession.dashboardId, 'daily-engineering-ops');
      assert.ok(castRes.castUrl.endsWith('/dashboard'));

      // Verify /dashboard serves the full 10-foot Smart TV dashboard with commits, calendar, and tailed agents
      const dashPage = await httpGet(`http://127.0.0.1:${srv.port}/dashboard`);
      assert.equal(dashPage.status, 200);
      assert.ok(dashPage.body.includes('Daily Engineering &amp; Agent Ops Dashboard'));
      assert.ok(dashPage.body.includes('10 Latest Commit Messages'));
      assert.ok(dashPage.body.includes('Calendar Events for the Day'));
      assert.ok(dashPage.body.includes('Running RobOS Agent Sessions (Status Tailed)'));

      // Verify /api/dashboard-cast JSON endpoint
      const apiRes = await httpGet(`http://127.0.0.1:${srv.port}/api/dashboard-cast`);
      assert.equal(apiRes.status, 200);
      const apiJson = JSON.parse(apiRes.body);
      assert.equal(apiJson.ok, true);
      assert.equal(apiJson.cast.active, true);
      assert.equal(apiJson.dashboard.id, 'daily-engineering-ops');
      assert.equal(apiJson.dashboard.cards.length, 3);

      // Verify 10-Foot Portal Home (/) shows the live dashboard cast banner
      const homeRes = await httpGet(`http://127.0.0.1:${srv.port}/`);
      assert.equal(homeRes.status, 200);
      assert.ok(homeRes.body.includes('LIVE ROBOS DASHBOARD ON TV'));
      assert.ok(homeRes.body.includes('/dashboard'));
    } finally {
      await tvEngine.stopPortalServer();
    }
  });
});

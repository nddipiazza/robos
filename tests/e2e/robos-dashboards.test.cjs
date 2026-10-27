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
    assert.equal(ov.dashboard.cards.length, 6);
    assert.equal(DASHBOARD_LAYOUTS.length, 6);
    assert.equal(DASHBOARD_WIDGET_CATALOG.length, 13);
    assert.ok(DASHBOARD_WIDGET_CATALOG.some((w) => w.type === 'live-clock'));
    assert.ok(DASHBOARD_WIDGET_CATALOG.some((w) => w.type === 'voice-dictation'));
    assert.ok(!ov.dashboard.cards.some((c) => c.widgetType === 'live-clock'));
    assert.ok(!ov.dashboard.cards.some((c) => c.widgetType === 'voice-dictation'));

    // Dedicated 3rd Page: RobOS Voice Dictation — Most Recent Chats (single-focus layout with only voice-dictation card)
    const voiceOv = engine.getOverview('robos-voice-dictation');
    assert.equal(voiceOv.ok, true);
    assert.equal(voiceOv.dashboard.id, 'robos-voice-dictation');
    assert.equal(voiceOv.dashboard.layout.id, 'single-focus');
    assert.equal(voiceOv.dashboard.cards.length, 1);
    const voiceCard = voiceOv.dashboard.cards[0];
    assert.equal(voiceCard.widgetType, 'voice-dictation');
    assert.equal(voiceCard.componentTag, 'robos-widget-voice-dictation');
    assert.ok(Array.isArray(voiceCard.liveData.bubbles));
    assert.ok(voiceCard.liveData.bubbles.length >= 3);
    assert.ok(voiceCard.liveData.bubbles[0].text);
    assert.ok(voiceCard.liveData.bubbles[0].time);

    // Music Now Playing card (RobOS Audio Player)
    const musicCard = ov.dashboard.cards.find((c) => c.widgetType === 'music-now-playing');
    assert.ok(musicCard);
    assert.equal(musicCard.componentTag, 'robos-widget-music-player');
    assert.ok(musicCard.liveData.title);
    assert.ok(musicCard.liveData.artist);
    assert.ok(musicCard.liveData.duration);

    // GitHub Repo Activity card (nddipiazza/robos commits, main CI, latest release # & running status)
    const ghCard = ov.dashboard.cards.find((c) => c.widgetType === 'github-repo');
    assert.ok(ghCard);
    assert.equal(ghCard.componentTag, 'robos-widget-github-repo');
    assert.equal(ghCard.liveData.repo, 'nddipiazza/robos');
    assert.ok(ghCard.liveData.mainCi.workflows.length >= 3);
    assert.ok(ghCard.liveData.latestRelease.tag);
    assert.equal(typeof ghCard.liveData.latestRelease.isRunningNow, 'boolean');
    assert.ok(ghCard.liveData.commits30d);
    assert.equal(ghCard.liveData.commits30d.dailySeries.length, 30);
    assert.ok(ghCard.liveData.commits30d.total > 0);

    // Countdown Until Next Meeting card
    const countdownCard = ov.dashboard.cards.find((c) => c.widgetType === 'next-meeting-countdown');
    assert.ok(countdownCard);
    assert.equal(countdownCard.componentTag, 'robos-widget-next-meeting');
    assert.ok(countdownCard.liveData.countdownLabel);
    assert.ok(countdownCard.liveData.nextMeeting.title);
    assert.ok(countdownCard.liveData.secondsUntil > 0);

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

    // Card 3: Running RobOS agent sessions (live dynamic: empty when no sessions are running, shows in-progress sessions without agent-type breakdown when active)
    const agentsCard = ov.dashboard.cards.find((c) => c.widgetType === 'agent-sessions');
    assert.ok(agentsCard);
    assert.equal(agentsCard.componentTag, 'robos-widget-agent-sessions');
    assert.ok(Array.isArray(agentsCard.liveData.sessions));

    const idleSessions = collectRunningAgentSessions({ configDir: tmpDir, scanSystemAgents: false });
    assert.equal(idleSessions.runningCount, 0);
    assert.equal(idleSessions.sessions.length, 0);
    const emptyWidgetHtml = RobOSDashboardUI.renderWidgetInnerHtml({
      widgetType: 'agent-sessions',
      liveData: idleSessions,
    });
    assert.ok(!emptyWidgetHtml.includes('robos-agent-card'), 'Should show nothing when no sessions are running');
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

    // Dynamically stream an interim RobOS Voice dictation bubble and then finalize it on Page 3 (robos-voice-dictation)
    engine.setActiveDashboard('robos-voice-dictation');
    const interimRes = engine.recordVoiceDictationBubble({
      text: 'Open the Knowledge Graph Explorer',
      isFinal: false,
    });
    assert.equal(interimRes.dashboard.id, 'robos-voice-dictation');
    const voiceCardInterim = interimRes.dashboard.cards.find((c) => c.widgetType === 'voice-dictation');
    assert.equal(voiceCardInterim.liveData.active, true);
    assert.ok(voiceCardInterim.liveData.interimBubble);
    assert.equal(voiceCardInterim.liveData.interimBubble.text, 'Open the Knowledge Graph Explorer');

    const finalRes = engine.recordVoiceDictationBubble({
      text: 'Open the Knowledge Graph Explorer and run SHACL validation',
      isFinal: true,
      commandCard: {
        typeLabel: 'Skill',
        title: 'KGraph Validate',
        statusLabel: '✓ Done',
      },
    });
    const voiceCardFinal = finalRes.dashboard.cards.find((c) => c.widgetType === 'voice-dictation');
    assert.equal(voiceCardFinal.liveData.interimBubble, null);
    assert.ok(
      voiceCardFinal.liveData.bubbles.some((b) =>
        b.text.includes('Open the Knowledge Graph Explorer and run SHACL validation')
      )
    );

    const voiceHtml = RobOSDashboardUI.renderDashboardHtml(finalRes.dashboard, { editable: true });
    assert.ok(voiceHtml.includes('robos-widget-voice-dictation'));
    assert.ok(voiceHtml.includes('Open the Knowledge Graph Explorer and run SHACL validation'));

    // Embeddable <robos-dashboard> HTML rendering for Slide 1
    const slide1Resolved = engine.resolveDashboard('daily-engineering-ops');
    const html = RobOSDashboardUI.renderDashboardHtml(slide1Resolved.dashboard, { editable: true });
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
      assert.equal(apiJson.dashboard.cards.length, 6);

      // Verify 10-Foot Portal Home (/) shows the live dashboard cast banner
      const homeRes = await httpGet(`http://127.0.0.1:${srv.port}/`);
      assert.equal(homeRes.status, 200);
      assert.ok(homeRes.body.includes('LIVE ROBOS DASHBOARD ON TV'));
      assert.ok(homeRes.body.includes('/dashboard'));

      // 5. Verify Multi-Dashboard Slideshow auto-cycling across configurable seconds (Slide 1 + Slide 2 + Slide 3)
      const dashEngine = createDashboardEngine({ configDir: tmpDir });
      const slideIds = ['daily-engineering-ops', 'github-ci-popularity', 'robos-voice-dictation'];
      const cfg1 = dashEngine.configureSlideshow({
        enabled: true,
        intervalSeconds: 10,
        dashboardIds: slideIds,
        startedEpochMs: Date.now(),
      });
      assert.equal(cfg1.ok, true);
      assert.equal(cfg1.slideshow.enabled, true);
      assert.equal(cfg1.slideshow.intervalSeconds, 10);
      assert.equal(cfg1.slideshow.totalSlides, 3);
      assert.equal(cfg1.slideshow.slideNumber, 1);
      assert.equal(cfg1.dashboard.id, 'daily-engineering-ops');
      const slide1GhCard = cfg1.dashboard.cards.find(c => c.id === 'github-repo-activity');
      assert.ok(slide1GhCard, 'Slide 1 should contain github-repo-activity card');
      assert.equal(slide1GhCard.config.showMainCi, false, 'Slide 1 should have CI status removed (showMainCi: false)');

      // Simulate 11 seconds elapsed -> should automatically resolve slide 2 (github-ci-popularity)
      const cfg2 = dashEngine.configureSlideshow({
        enabled: true,
        intervalSeconds: 10,
        dashboardIds: slideIds,
        startedEpochMs: Date.now() - 11000,
      });
      assert.equal(cfg2.slideshow.slideNumber, 2);
      assert.equal(cfg2.dashboard.id, 'github-ci-popularity');
      assert.equal(cfg2.dashboard.cards.length, 3);
      const ciCard = cfg2.dashboard.cards.find(c => c.id === 'github-ci-main-status');
      const starsCard = cfg2.dashboard.cards.find(c => c.id === 'github-stars-forks-community');
      const popCard = cfg2.dashboard.cards.find(c => c.id === 'github-popularity-traffic');
      assert.ok(ciCard && starsCard && popCard, 'Slide 2 should have CI status, Stars/Forks, and App Popularity cards');
      assert.ok(starsCard.liveData.popularity.stars >= 7, 'Stars metric should be populated');
      assert.ok(starsCard.liveData.popularity.forks >= 1, 'Forks metric should be populated');
      assert.ok(popCard.liveData.popularity.clones14d.count >= 2000, '14-day clones metric should be populated');
      assert.ok(popCard.liveData.popularity.downloads.totalDownloads >= 80, 'Release downloads metric should be populated');

      // /api/dashboard-cast should return the current slide's dashboard & slideshow metadata
      const slideApiRes = await httpGet(`http://127.0.0.1:${srv.port}/api/dashboard-cast`);
      const slideApiJson = JSON.parse(slideApiRes.body);
      assert.equal(slideApiJson.slideshow.enabled, true);
      assert.equal(slideApiJson.slideshow.slideNumber, 2);
      assert.equal(slideApiJson.dashboard.id, 'github-ci-popularity');

      // Step manually to next slide -> advances to slide 3 (robos-voice-dictation)
      const stepRes3 = dashEngine.stepSlideshow({ direction: 1 });
      assert.equal(stepRes3.ok, true);
      assert.equal(stepRes3.slideshow.slideNumber, 3);
      assert.equal(stepRes3.dashboard.id, 'robos-voice-dictation');
      assert.equal(stepRes3.dashboard.cards.length, 1);
      assert.equal(stepRes3.dashboard.cards[0].widgetType, 'voice-dictation');

      // Step manually again -> wraps back to slide 1 (daily-engineering-ops)
      const stepRes = dashEngine.stepSlideshow({ direction: 1 });
      assert.equal(stepRes.ok, true);
      assert.equal(stepRes.slideshow.slideNumber, 1);
      assert.equal(stepRes.dashboard.id, 'daily-engineering-ops');
    } finally {
      await tvEngine.stopPortalServer();
    }
  });
});

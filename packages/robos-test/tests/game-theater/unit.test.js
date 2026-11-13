'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const https = require('node:https');

const {
  loadTheaterPlayers,
  authenticatePlayerRequest,
} = require('../../../game-theater/lib/player-registry');
const {
  syncPlayerLaunchDocsWithGoogleDrive,
  invitePlayerToTheaterDoc,
  getPlayerLaunchDocTitle,
} = require('../../../game-theater/lib/player-doc-sync');
const { GameTheaterRuntime } = require('../../../game-theater/lib/game-runtime');
const { generateOrModifyGame } = require('../../../game-theater/lib/agent-builder');
const { createGameTheaterServer } = require('../../../game-theater/lib/theater-server');
const { connectWebSocketClient } = require('../../../game-theater/lib/ws-server');

function makeTempEnv() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-game-theater-test-'));
  const seedPeople = [
    {
      uid: 'alice-roe',
      displayName: 'Alice Roe',
      firstName: 'Alice',
      gamerTag: 'AliceR',
      avatar: '🧙‍♀️',
      color: '#00bcd4',
      email: 'alice@example.com',
    },
    {
      uid: 'bob-smith',
      displayName: 'Bob Smith',
      firstName: 'Bob',
      gamerTag: 'BobS',
      avatar: '🛡️',
      color: '#ec4899',
      email: 'bob@example.com',
    },
    {
      uid: 'charlie-extra',
      displayName: 'Charlie Extra',
      firstName: 'Charlie',
      gamerTag: 'CharlieX',
      avatar: '🎲',
      color: '#eab308',
      email: 'charlie@example.com',
    },
  ];
  return {
    dir,
    seedPeople,
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}

function createMockDriveApi() {
  const docs = new Map();
  const permsByFile = new Map();
  const deletedPerms = [];
  const shares = [];
  let seq = 1;
  return {
    docs,
    permsByFile,
    deletedPerms,
    shares,
    api: {
      getAboutEmail: async () => 'host@example.com',
      findFolderByName: async () => null,
      createFolder: async (name) => ({ id: `folder_${seq++}`, name }),
      listChildren: async () => [],
      createDocFromHtml: async ({ name, parentId, html }) => {
        const id = `gdoc_${seq++}`;
        docs.set(id, { id, name, parentId, html });
        return { id, name };
      },
      updateDocFromHtml: async (docId, html) => {
        const cur = docs.get(docId);
        if (!cur) throw new Error('Not found');
        cur.html = html;
        return cur;
      },
      listPermissions: async (fileId) => [...(permsByFile.get(fileId) || [])],
      deletePermission: async (fileId, permissionId) => {
        deletedPerms.push({ fileId, permissionId });
        const cur = permsByFile.get(fileId) || [];
        permsByFile.set(
          fileId,
          cur.filter((p) => p.id !== permissionId),
        );
        return null;
      },
      shareFile: async (fileId, opts) => {
        const perm = {
          id: `perm_${seq++}`,
          type: 'user',
          role: opts.role || 'reader',
          emailAddress: opts.email,
        };
        const cur = permsByFile.get(fileId) || [];
        cur.push(perm);
        permsByFile.set(fileId, cur);
        shares.push({ fileId, ...opts, id: perm.id });
        return perm;
      },
    },
  };
}

function httpsGetText(urlStr, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const req = https.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method: 'GET',
        rejectUnauthorized: false,
        headers,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          }),
        );
      },
    );
    req.on('error', reject);
    req.end();
  });
}

describe('RobOS AI Multiplayer Game Theater', () => {
  it('starts with an empty game stage (zero hardcoded games) and syncs one personal Google Doc per player', async () => {
    const env = makeTempEnv();
    try {
      const runtime = new GameTheaterRuntime({ configDir: env.dir });
      assert.equal(runtime.listGames().length, 0);
      assert.equal(runtime.getActiveGame(), null);

      const players = loadTheaterPlayers({ configDir: env.dir, seedPeople: env.seedPeople });
      assert.equal(players.length, 3);
      assert.notEqual(players[0].authToken, players[1].authToken);

      const mockDrive = createMockDriveApi();
      const syncRes = await syncPlayerLaunchDocsWithGoogleDrive({
        configDir: env.dir,
        seedPeople: env.seedPeople,
        driveApi: mockDrive.api,
        webAppUrl: 'https://theater-demo.trycloudflare.com',
      });

      assert.equal(syncRes.ok, true);
      assert.equal(syncRes.totalPlayerDocs, 3);

      for (const p of players) {
        const pDoc = syncRes.playerDocs[p.uid];
        assert.ok(pDoc, `Missing Google Doc for ${p.uid}`);
        assert.equal(pDoc.docTitle, getPlayerLaunchDocTitle(p));
        const savedDoc = mockDrive.docs.get(pDoc.docId);
        assert.ok(savedDoc.html.includes(`https://theater-demo.trycloudflare.com/?auth=${p.authToken}`));
        assert.ok(mockDrive.shares.some((s) => s.fileId === pDoc.docId && s.email === p.email));

        const authed = authenticatePlayerRequest(
          { queryAuth: p.authToken, isLoopback: false },
          { configDir: env.dir, seedPeople: env.seedPeople },
        );
        assert.equal(authed.ok, true);
        assert.equal(authed.player.uid, p.uid);
      }

      // Resending the share link removes the pre-existing reader permission first so Drive always emails
      const aliceDoc = syncRes.playerDocs['alice-roe'];
      const initialAliceShares = mockDrive.shares.filter((s) => s.fileId === aliceDoc.docId);
      assert.equal(initialAliceShares.length, 1);
      assert.equal(initialAliceShares[0].sendNotificationEmail, false);

      const resendRes = await invitePlayerToTheaterDoc(
        { uid: 'alice-roe', email: 'alice@example.com' },
        {
          configDir: env.dir,
          seedPeople: env.seedPeople,
          driveApi: mockDrive.api,
          webAppUrl: 'https://theater-demo.trycloudflare.com',
        },
      );
      assert.equal(resendRes.ok, true);
      assert.equal(resendRes.delivery, 'google-drive-share');
      assert.equal(resendRes.notificationEmailSent, true);
      assert.equal(mockDrive.deletedPerms.length, 1);
      assert.equal(mockDrive.deletedPerms[0].fileId, aliceDoc.docId);
      assert.equal(mockDrive.deletedPerms[0].permissionId, initialAliceShares[0].id);

      const postResendAliceShares = mockDrive.shares.filter((s) => s.fileId === aliceDoc.docId);
      assert.equal(postResendAliceShares.length, 2);
      assert.equal(postResendAliceShares[1].sendNotificationEmail, true);
      assert.ok(postResendAliceShares[1].emailMessage.includes(aliceDoc.docUrl));

      // When resending to the Drive owner's own address (targetEmail === ownerEmail),
      // relays through secondary Google Cloud Account so Google Drive actually dispatches an invite email!
      const altDrive = createMockDriveApi();
      altDrive.api.getAboutEmail = async () => 'secondary-relay@example.com';

      const ownerResend1 = await invitePlayerToTheaterDoc(
        { uid: 'bob-smith', email: 'host@example.com' },
        {
          configDir: env.dir,
          seedPeople: env.seedPeople,
          driveApi: mockDrive.api,
          altDriveApi: altDrive.api,
          ownerEmail: 'host@example.com',
          webAppUrl: 'https://theater-demo.trycloudflare.com',
        },
      );
      assert.equal(ownerResend1.ok, true);
      assert.equal(ownerResend1.delivery, 'google-drive-alt-account');
      assert.equal(ownerResend1.notificationEmailSent, true);
      assert.equal(altDrive.shares.length, 1);
      assert.equal(altDrive.shares[0].email, 'host@example.com');
      assert.equal(altDrive.shares[0].sendNotificationEmail, true);

      // Clicking Resend Share a second time deletes the permission on the relay doc and emails again
      const ownerResend2 = await invitePlayerToTheaterDoc(
        { uid: 'bob-smith', email: 'host@example.com' },
        {
          configDir: env.dir,
          seedPeople: env.seedPeople,
          driveApi: mockDrive.api,
          altDriveApi: altDrive.api,
          ownerEmail: 'host@example.com',
          webAppUrl: 'https://theater-demo.trycloudflare.com',
        },
      );
      assert.equal(ownerResend2.notificationEmailSent, true);
      assert.equal(altDrive.deletedPerms.length, 1);
      assert.equal(altDrive.shares.length, 2);
    } finally {
      env.cleanup();
    }
  });

  it('validates Godot 4 GDScript via headless compiler, self-repairs syntax errors, and serves over HTTPS + WSS', async () => {
    const env = makeTempEnv();
    let srv = null;
    try {
      srv = createGameTheaterServer({
        configDir: env.dir,
        seedPeople: env.seedPeople,
        autoExportGodot: false,
      });
      const ep = await srv.listen({ httpPort: 0, httpsPort: 0, host: '127.0.0.1', enableHttps: true });
      const players = loadTheaterPlayers({ configDir: env.dir, seedPeople: env.seedPeople });
      const [alice, bob, charlie] = players;

      // Unauthenticated non-loopback style token fails
      const badRes = await httpsGetText(`${ep.localHttpsUrl}/api/me?auth=wrong-token`);
      assert.equal(badRes.status, 401);

      // Alice authenticates via her Google Doc launch URL over HTTPS!
      const aliceAuthRes = await httpsGetText(`${ep.localHttpsUrl}/api/me?auth=${alice.authToken}`);
      assert.equal(aliceAuthRes.status, 200);
      const aliceJson = JSON.parse(aliceAuthRes.body);
      assert.equal(aliceJson.player.uid, 'alice-roe');

      // Test AI generation with an intentional GDScript error on attempt 1 -> auto-repaired on attempt 2!
      let callCount = 0;
      const sampleServerJs = `
        const meta = { title: 'Test Duel', description: '2-player test game', minPlayers: 2, maxPlayers: 2 };
        function createInitialState(players) {
          const starter = Math.random() < 0.5 ? 0 : 1;
          return { players, chooserIdx: starter, round: 1, secret: '', revealed: false };
        }
        function onPlayerAction(state, player, action) {
          const chooser = state.players[state.chooserIdx];
          if (action.type === 'set_secret') {
            if (player.uid !== chooser.uid) return { state, error: 'Not chooser' };
            state.secret = String(action.secret || '');
            return { state };
          }
          if (action.type === 'next_round') {
            state.round += 1;
            state.chooserIdx = (state.chooserIdx + 1) % 2;
            state.secret = '';
            return { state };
          }
          return { state };
        }
        function getPlayerView(state, viewerUid) {
          const chooser = state.players[state.chooserIdx];
          const isChooser = viewerUid === chooser.uid;
          return {
            round: state.round,
            chooserUid: chooser.uid,
            secret: isChooser ? state.secret : (state.secret ? '***' : ''),
          };
        }
        module.exports = { meta, createInitialState, onPlayerAction, getPlayerView };
      `;

      const brokenClientGd = `extends Control
var send_action: Callable
func apply_view(view: Dictionary, me: Dictionary, lobby: Dictionary) -> void:
\tTHIS_IS_INVALID_GDSCRIPT_SYNTAX $$$
`;

      const validClientGd = `extends Control
var send_action: Callable
var _lbl: Label

func _ready() -> void:
\t_lbl = Label.new()
\tadd_child(_lbl)

func apply_view(view: Dictionary, me: Dictionary, lobby: Dictionary) -> void:
\tvar r: int = int(view.get("round", 0))
\tif _lbl != null:
\t\t_lbl.text = "Round " + str(r)
`;

      const genRes = await generateOrModifyGame({
        mode: 'generate',
        runtime: srv.runtime,
        title: 'Test Duel',
        prompt: 'Create a 2-player duel',
        requestedBy: alice,
        aiAsk: async () => {
          callCount += 1;
          const gd = callCount === 1 ? brokenClientGd : validClientGd;
          return {
            ok: true,
            text: JSON.stringify({
              manifest: { id: 'test-duel', title: 'Test Duel', minPlayers: 2, maxPlayers: 2 },
              serverJs: sampleServerJs,
              clientGd: gd,
            }),
          };
        },
      });

      assert.equal(genRes.ok, true);
      assert.equal(callCount, 2, 'Should have auto-repaired GDScript error via Godot 4 headless validator');

      // Connect Alice, Bob, and Charlie over WSS (TLS WebSocket)!
      const wsBase = `wss://127.0.0.1:${ep.httpsPort}/ws`;
      const wsAlice = await connectWebSocketClient(`${wsBase}?auth=${alice.authToken}`);
      const wsBob = await connectWebSocketClient(`${wsBase}?auth=${bob.authToken}`);
      const wsCharlie = await connectWebSocketClient(`${wsBase}?auth=${charlie.authToken}`);

      const waitSnap = (ws, pred) =>
        new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Timed out waiting for WS message')), 4000);
          const handler = (raw) => {
            const msg = JSON.parse(raw);
            if (pred(msg)) {
              clearTimeout(timer);
              ws.removeListener('message', handler);
              resolve(msg);
            }
          };
          ws.on('message', handler);
        });

      const matchReadyP = waitSnap(wsBob, (m) => m.type === 'snapshot' && m.snapshot?.matchStatus === 'playing');
      wsAlice.sendJson({ type: 'join_seat' });
      wsBob.sendJson({ type: 'join_seat' });
      const bobSnapMsg = await matchReadyP;
      assert.equal(bobSnapMsg.snapshot.seats.length, 2);

      // Charlie (3rd player) tries to join seat -> strictly rejected with MAX_PLAYERS_REACHED!
      const charlieErrP = waitSnap(wsCharlie, (m) => m.type === 'action_error');
      wsCharlie.sendJson({ type: 'join_seat' });
      const charlieErr = await charlieErrP;
      assert.equal(charlieErr.code, 'MAX_PLAYERS_REACHED');

      // Bob (non-creator player!) can also dynamically modify the game!
      const modifiedRes = await generateOrModifyGame({
        mode: 'modify',
        runtime: srv.runtime,
        gameId: 'test-duel',
        prompt: 'Update description',
        requestedBy: bob,
        aiAsk: async () => ({
          ok: true,
          text: JSON.stringify({
            manifest: { id: 'test-duel', title: 'Test Duel Deluxe', description: 'Updated by Bob', minPlayers: 2, maxPlayers: 2 },
            serverJs: sampleServerJs,
            clientGd: validClientGd,
          }),
        }),
      });
      assert.equal(modifiedRes.game.version, 2);
      assert.equal(modifiedRes.game.title, 'Test Duel Deluxe');

      wsAlice.close();
      wsBob.close();
      wsCharlie.close();
    } finally {
      if (srv) await srv.close();
      env.cleanup();
    }
  });

  it('supports authoritative onTick timed round cycling, mid-match seat joins, and fast agy CLI flags', async () => {
    const aiAgent = require('../../../robos-lib/ai-agent');
    const agyArgs = aiAgent.PROVIDER_MAP.antigravity.buildArgs('Generate game', {
      resolvedBin: 'agy',
      effort: 'low',
    });
    assert.deepEqual(agyArgs, [
      '--disable-slash-commands',
      '--print-timeout',
      '0',
      '--effort',
      'low',
      '-p',
      'Generate game',
    ]);

    const env = makeTempEnv();
    const runtime = new GameTheaterRuntime({ configDir: env.dir });
    try {
      const players = loadTheaterPlayers({ configDir: env.dir, seedPeople: env.seedPeople });
      const [alice, bob, charlie] = players;

      const timedServerJs = `
        const meta = { title: 'Timed Count Quiz', minPlayers: 2, maxPlayers: 4, tickIntervalMs: 250 };
        function createInitialState(players) {
          return { players, round: 1, ticks: 0 };
        }
        function onPlayerAction(state) {
          return { state };
        }
        function onTick(state) {
          state.ticks += 1;
          if (state.ticks >= 2) {
            state.round += 1;
            state.ticks = 0;
          }
          return { state };
        }
        function onSeatsChanged(state, seats) {
          state.players = seats;
          return { state };
        }
        function getPlayerView(state) {
          return { round: state.round, playerCount: state.players.length };
        }
        module.exports = { meta, createInitialState, onPlayerAction, onTick, onSeatsChanged, getPlayerView };
      `;

      runtime.saveAndActivateGame({
        id: 'timed-count-quiz',
        manifest: { id: 'timed-count-quiz', title: 'Timed Count Quiz', minPlayers: 2, maxPlayers: 4 },
        serverJs: timedServerJs,
        clientGd: 'extends Control\nvar send_action: Callable\nfunc apply_view(_v: Dictionary, _m: Dictionary, _l: Dictionary) -> void:\n\tpass\n',
        activate: true,
      });

      runtime.joinSeat(alice);
      runtime.joinSeat(bob);
      assert.equal(runtime.matchStatus, 'playing');
      assert.equal(runtime.getPlayerViewFor(alice.uid).round, 1);

      // Charlie joins mid-match (maxPlayers = 4)
      const joinRes = runtime.joinSeat(charlie);
      assert.equal(joinRes.ok, true);
      assert.equal(runtime.getPlayerViewFor(alice.uid).playerCount, 3);

      // Wait ~620ms so two 250ms ticks advance round 1 -> round 2 automatically!
      await new Promise((r) => setTimeout(r, 620));
      assert.ok(runtime.getPlayerViewFor(alice.uid).round >= 2, 'onTick should auto-advance timed round');
    } finally {
      runtime.close();
      env.cleanup();
    }
  });

  it('resolves secret-safe RobOS Spectator Dashboard (<robos-widget-game-theater>), /tv wallboard, and Roku 1080p frame cast', async () => {
    const env = makeTempEnv();
    const { createDashboardEngine } = require('../../../robos-lib/dashboard-engine');
    const { renderDashboardHtml } = require('../../../robos-ui/robos-dashboard');
    const { createTvBridge } = require('../../../game-theater/lib/tv-bridge');
    let srv = null;
    try {
      const players = loadTheaterPlayers({ configDir: env.dir, seedPeople: env.seedPeople });
      const [alice, bob] = players;

      srv = createGameTheaterServer({
        configDir: env.dir,
        seedPeople: env.seedPeople,
        autoExportGodot: false,
      });
      const ep = await srv.listen({ httpPort: 0, enableHttps: false, host: '127.0.0.1' });

      // Load a trivia game with hidden answer until reveal
      const secretSafeTriviaJs = `
        const meta = { title: 'Guess That Count', description: '500 real-world counts', minPlayers: 1, maxPlayers: 12 };
        function createInitialState(players) {
          const map = {};
          players.forEach((p) => { map[p.uid] = { uid: p.uid, name: p.name, color: p.color, score: 3, streak: 2 }; });
          return {
            phase: 'question',
            roundNumber: 7,
            totalBankSize: 500,
            secondsLeft: 24,
            totalSeconds: 30,
            category: 'Astronomy & Space',
            subject: 'Moons orbiting Saturn (confirmed)',
            options: ['83', '146', '62', '214'],
            secretCorrectIndex: 1,
            players: map,
            answers: {}
          };
        }
        function onPlayerAction(state, player, action) {
          if (action.type === 'reveal') state.phase = 'reveal';
          return { state };
        }
        function getPlayerView(state, viewerUid) {
          const isReveal = state.phase === 'reveal';
          return {
            phase: state.phase,
            roundNumber: state.roundNumber,
            totalBankSize: state.totalBankSize,
            secondsLeft: state.secondsLeft,
            totalSeconds: state.totalSeconds,
            category: state.category,
            subject: state.subject,
            options: state.options,
            correctIndex: isReveal ? state.secretCorrectIndex : -1,
            answeredCount: Object.keys(state.answers).length,
            playerCount: Object.keys(state.players).length,
            leaderboard: Object.values(state.players)
          };
        }
        module.exports = { meta, createInitialState, onPlayerAction, getPlayerView };
      `;

      srv.runtime.saveAndActivateGame({
        id: 'guess-that-count',
        manifest: { id: 'guess-that-count', title: 'Guess That Count', minPlayers: 1, maxPlayers: 12 },
        serverJs: secretSafeTriviaJs,
        clientGd: 'extends Control\nvar send_action: Callable\nfunc apply_view(_v: Dictionary, _m: Dictionary, _l: Dictionary) -> void:\n\tpass\n',
        activate: true,
      });
      srv.runtime.joinSeat(alice);
      srv.runtime.joinSeat(bob);

      // 1. Verify live-spectator.json + dashboard-engine resolution
      const dashEng = createDashboardEngine({ configDir: env.dir });
      const resolved = dashEng.resolveDashboard('game-theater-spectator');
      assert.equal(resolved.ok, true);
      assert.equal(resolved.dashboard.id, 'game-theater-spectator');
      assert.equal(resolved.dashboard.cards.length, 3);
      const stageCard = resolved.dashboard.cards.find((c) => c.id === 'game-theater-live-stage');
      assert.equal(stageCard.liveData.spectatorView.correctIndex, -1, 'Unrevealed answer index must stay hidden on TV!');

      const renderedHtml = renderDashboardHtml(resolved.dashboard);
      assert.ok(renderedHtml.includes('Moons orbiting Saturn (confirmed)'));
      assert.ok(renderedHtml.includes('ROUND #7 · 500-Q BANK'));
      assert.ok(renderedHtml.includes('var(--gt-prompt-size,27px)'));
      assert.ok(!renderedHtml.includes('✔ CORRECT'), 'Must not highlight correct answer before reveal');

      // Also verify AI-generated trivia using `choices`, `prompt`, `remainingMs`, `totalRounds`, `answered`, and `roundDelta`
      const choicesTriviaJs = `
        const meta = { title: 'Youth Slang Quiz', minPlayers: 1, maxPlayers: 8 };
        function createInitialState(players) {
          return {
            players,
            phase: 'reveal',
            roundNumber: 4,
            totalRounds: 10,
            category: 'Gaming Lore',
            prompt: 'Which smash weapon deals more damage the higher you fall?',
            choices: ['The Mace', 'Trident', 'Crossbow', 'Axe'],
            correctIndex: 0
          };
        }
        function onPlayerAction(state) { return { state }; }
        function getPlayerView(state) {
          return {
            phase: state.phase,
            roundNumber: state.roundNumber,
            totalRounds: state.totalRounds,
            category: state.category,
            prompt: state.prompt,
            choices: state.choices,
            correctIndex: state.correctIndex,
            remainingMs: 3800,
            totalPhaseMs: 4500,
            answeredCount: 2,
            playerCount: state.players.length,
            leaderboard: state.players.map((p, idx) => ({
              uid: p.uid,
              name: p.name,
              color: p.color,
              score: idx === 0 ? 850 : 0,
              streak: idx === 0 ? 3 : 0,
              answered: true,
              roundDelta: idx === 0 ? 850 : 0,
              rankTitle: idx === 0 ? 'Grand Champion' : 'Challenger'
            }))
          };
        }
        module.exports = { meta, createInitialState, onPlayerAction, getPlayerView };
      `;
      srv.runtime.saveAndActivateGame({
        id: 'youth-slang-quiz',
        manifest: { id: 'youth-slang-quiz', title: 'Youth Slang Quiz', minPlayers: 1, maxPlayers: 8 },
        serverJs: choicesTriviaJs,
        clientGd: 'extends Control\nvar send_action: Callable\nfunc apply_view(_v: Dictionary, _m: Dictionary, _l: Dictionary) -> void:\n\tpass\n',
        activate: true,
      });
      srv.runtime.joinSeat(alice);
      srv.runtime.joinSeat(bob);
      const choicesResolved = dashEng.resolveDashboard('game-theater-spectator');
      const choicesHtml = renderDashboardHtml(choicesResolved.dashboard);
      assert.ok(choicesHtml.includes('ROUND #4 OF 10'));
      assert.ok(choicesHtml.includes('Which smash weapon deals more damage the higher you fall?'));
      assert.ok(choicesHtml.includes('The Mace'));
      assert.ok(choicesHtml.includes('✔ CORRECT'));
      assert.ok(choicesHtml.includes('+850 PTS ✔'));
      assert.ok(choicesHtml.includes('Grand Champion'));

      // Restore secret-safe unrevealed game for public /api/spectator-dashboard assertion below
      srv.runtime.selectGame('guess-that-count');
      srv.runtime.joinSeat(alice);
      srv.runtime.joinSeat(bob);

      // 2. Verify unauthenticated public /api/spectator-dashboard and /tv 10-foot wallboard endpoints
      const specRes = await fetch(`${ep.localHttpUrl}/api/spectator-dashboard`);
      assert.equal(specRes.status, 200);
      const specJson = await specRes.json();
      assert.equal(specJson.ok, true);
      assert.equal(specJson.spectator.spectatorView.correctIndex, -1);

      const tvHtmlRes = await fetch(`${ep.localHttpUrl}/tv`);
      assert.equal(tvHtmlRes.status, 200);
      const tvHtml = await tvHtmlRes.text();
      assert.ok(tvHtml.includes('class="tv-10ft"'));
      assert.ok(tvHtml.includes('<robos-dashboard id="theater-tv-dashboard"'));

      // Verify tv-engine /api/dashboard-cast fast-path emits changing frameAt/polledAt so Roku SceneGraph never freezes on frame 1
      const { createTvEngine } = require('../../../robos-lib/tv-engine');
      const tvEng = createTvEngine({ configDir: env.dir, portalPort: 0, reusePortal: false });
      const portalStarted = await tvEng.startPortalServer(0, { reuse: false });
      assert.equal(portalStarted.ok, true);
      try {
        tvEng.addOrUpdateTv({
          id: 'tv-roku-poll-test',
          name: '65" Roku Test',
          ip: '127.0.0.1',
          platformId: 'roku-os',
        });
        await tvEng.castAppToTv({
          tvId: 'tv-roku-poll-test',
          appId: 'game-theater',
          title: 'Game Theater',
          url: `${ep.localHttpUrl}/tv`,
        });
        const pollUrl = `http://127.0.0.1:${portalStarted.port}/api/dashboard-cast?tv=tv-roku-poll-test`;
        const rawPoll1 = await (await fetch(pollUrl)).text();
        await new Promise((r) => setTimeout(r, 15));
        const rawPoll2 = await (await fetch(pollUrl)).text();
        assert.notEqual(rawPoll1, rawPoll2, 'Consecutive Roku /api/dashboard-cast polls MUST differ so payloadJson observeField fires every tick!');
        const parsedPoll2 = JSON.parse(rawPoll2);
        assert.equal(parsedPoll2.cinemaLibrary, null, 'Roku appCast fast-path must skip cinemaLibrary payload bloat');

        // Verify instant afterSeq long-poll wakeup (<150ms instead of 750ms timeout) when a new frame is pushed
        const framePostUrl = `http://127.0.0.1:${portalStarted.port}/api/app-cast-frame?tv=tv-roku-poll-test`;
        await fetch(framePostUrl, { method: 'POST', body: Buffer.alloc(2048, 0xd8) });
        const baseline = await (await fetch(pollUrl)).json();
        assert.ok(baseline.frameSeq >= 1);

        const waitStart = Date.now();
        const longPollPromise = fetch(`${pollUrl}&afterSeq=${baseline.frameSeq}`).then((r) => r.json());
        setTimeout(() => {
          fetch(framePostUrl, { method: 'POST', body: Buffer.alloc(2048, 0xd9) }).catch(() => {});
        }, 35);
        const woken = await longPollPromise;
        const wakeElapsedMs = Date.now() - waitStart;
        assert.equal(woken.frameSeq, baseline.frameSeq + 1);
        assert.ok(wakeElapsedMs < 350, `Expected instant afterSeq wakeup (<350ms), took ${wakeElapsedMs}ms`);
      } finally {
        await tvEng.stopPortalServer();
      }

      // 3. Verify Roku OS 1080p live frame cast bridge
      const postedFrames = [];
      let castedPayload = null;
      class FakeOffscreenWindow {
        constructor() {
          this._destroyed = false;
          this.webContents = {
            on: (evt, cb) => {
              if (evt === 'paint') {
                setTimeout(() => {
                  cb(
                    {},
                    {},
                    {
                      getSize: () => ({ width: 1920, height: 1080 }),
                      toJPEG: () => Buffer.alloc(4096, 0xff),
                    },
                  );
                }, 20);
              }
            },
            setFrameRate: () => {},
            setAudioMuted: () => {},
            loadURL: async () => {},
            once: () => {},
          };
        }
        isDestroyed() {
          return this._destroyed;
        }
        destroy() {
          this._destroyed = true;
        }
      }

      const bridge = createTvBridge({
        BrowserWindow: FakeOffscreenWindow,
        getTheaterPort: () => ep.httpPort,
        getLanIp: () => '127.0.0.1',
        getPortalPort: () => 19210,
        postFrameImpl: async (_port, tvId, jpg) => {
          postedFrames.push({ tvId, bytes: jpg.length });
          return 200;
        },
        tvEngine: {
          startPortalServer: async () => {},
          getOverview: () => ({
            tvs: [
              {
                id: 'tv-livingroom-roku-test',
                name: '65" Roku TV Test',
                ip: '127.0.0.1',
                platformId: 'roku-os',
                platformName: 'Roku OS',
                online: true,
              },
            ],
          }),
          castAppToTv: async (payload) => {
            castedPayload = payload;
            return { ok: true, rokuChannelLaunched: true, message: 'Launched RobOS TV channel on Roku' };
          },
          stopAppCast: () => ({ ok: true }),
          listAppCasts: () => (castedPayload ? [{ ...castedPayload, active: true }] : []),
        },
      });

      const castRes = await bridge.castToTv({ tvId: 'tv-livingroom-roku-test', gameTitle: 'Guess That Count' });
      assert.equal(castRes.ok, true);
      assert.equal(castRes.mode, 'roku-live-frames');
      assert.ok(postedFrames.length >= 1, 'Should immediately capture and POST 1080p JPEG frame for Roku');
      assert.equal(castedPayload.appId, 'game-theater');
      bridge.stopCast({ tvId: 'tv-livingroom-roku-test' });
    } finally {
      if (srv) await srv.close();
      env.cleanup();
    }
  });
});

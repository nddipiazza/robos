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
  const shares = [];
  let seq = 1;
  return {
    docs,
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
      shareFile: async (fileId, opts) => {
        shares.push({ fileId, ...opts });
        return { id: `perm_${seq++}` };
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
});

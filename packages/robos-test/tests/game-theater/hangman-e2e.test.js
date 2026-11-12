'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawn } = require('node:child_process');

const { loadTheaterPlayers } = require('../../../game-theater/lib/player-registry');
const { createGameTheaterServer } = require('../../../game-theater/lib/theater-server');
const { connectWebSocketClient } = require('../../../game-theater/lib/ws-server');
const { findGodotBin, GODOT_PROJECT_DIR } = require('../../../game-theater/lib/agent-builder');

const LIVE_HANGMAN_DIR = path.join(os.homedir(), '.config', 'robos', 'game-theater', 'games', 'hangman');

function waitWsMessage(ws, predicate, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.removeListener('message', onMsg);
      reject(new Error('Timed out waiting for WebSocket message'));
    }, timeoutMs);
    function onMsg(raw) {
      const parsed = JSON.parse(raw);
      if (predicate(parsed)) {
        clearTimeout(timer);
        ws.removeListener('message', onMsg);
        resolve(parsed);
      }
    }
    ws.on('message', onMsg);
  });
}

describe('Dynamically Generated 2-Player Hangman — End-to-End Verification', () => {
  it('enforces max 2 players, randomly picks Round 1 starter, alternates Phrase Chooser, hides secret phrase, and renders in Godot 4', async (t) => {
    if (!fs.existsSync(path.join(LIVE_HANGMAN_DIR, 'server.js'))) {
      t.skip('Dynamic hangman cartridge not present in ~/.config/robos/game-theater/games/hangman');
      return;
    }

    const tmpConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-hangman-e2e-'));
    let srv = null;
    try {
      // Copy ONLY the dynamically generated hangman cartridge into an isolated E2E configDir
      const targetGameDir = path.join(tmpConfigDir, 'game-theater', 'games', 'hangman');
      fs.mkdirSync(targetGameDir, { recursive: true });
      for (const fname of ['manifest.json', 'server.js', 'client.gd']) {
        fs.copyFileSync(path.join(LIVE_HANGMAN_DIR, fname), path.join(targetGameDir, fname));
      }

      const seedPeople = [
        {
          uid: 'nicholas-dipiazza',
          displayName: 'Nicholas DiPiazza',
          firstName: 'Nicholas',
          nickname: 'Nick',
          gamerTag: 'IllusionistNick',
          avatar: '🧙‍♂️',
          color: '#00bcd4',
          email: 'nick@example.com',
        },
        {
          uid: 'diana-arrington',
          displayName: 'Diana Arrington',
          firstName: 'Diana',
          nickname: 'Diana',
          gamerTag: 'PaladinDiana',
          avatar: '🛡️',
          color: '#ec4899',
          email: 'diana@example.com',
        },
        {
          uid: 'isabella-dipiazza',
          displayName: 'Isabella DiPiazza',
          firstName: 'Bella',
          nickname: 'Bella',
          gamerTag: 'BellaD',
          avatar: '🌟',
          color: '#eab308',
          email: 'bella@example.com',
        },
      ];

      srv = createGameTheaterServer({
        configDir: tmpConfigDir,
        seedPeople,
        autoExportGodot: true,
      });
      const ep = await srv.listen({ httpPort: 0, httpsPort: 0, host: '127.0.0.1', enableHttps: true });

      const players = loadTheaterPlayers({ configDir: tmpConfigDir, seedPeople });
      const nick = players.find((p) => p.uid === 'nicholas-dipiazza');
      const diana = players.find((p) => p.uid === 'diana-arrington');
      const bella = players.find((p) => p.uid === 'isabella-dipiazza');

      // 1. Verify random starter selection across 30 fresh initial states
      const activeGame = srv.runtime.getActiveGame();
      assert.equal(activeGame.manifest.minPlayers, 2);
      assert.equal(activeGame.manifest.maxPlayers, 2);

      const startersSeen = new Set();
      for (let i = 0; i < 30; i++) {
        const st = activeGame.compiled.createInitialState([nick, diana], {});
        startersSeen.add(st.players[st.chooserIdx].uid);
      }
      assert.equal(startersSeen.size, 2, 'Both players should be randomly selected to start across matches');

      // 2. Connect Nick, Diana, and Bella over WSS using their personal Google Doc tokens!
      const wssUrl = `wss://127.0.0.1:${ep.httpsPort}/ws`;
      const wsNick = await connectWebSocketClient(`${wssUrl}?auth=${nick.authToken}`);
      const wsDiana = await connectWebSocketClient(`${wssUrl}?auth=${diana.authToken}`);
      const wsBella = await connectWebSocketClient(`${wssUrl}?auth=${bella.authToken}`);

      let nickSnap = null;
      let dianaSnap = null;
      wsNick.on('message', (raw) => {
        const m = JSON.parse(raw);
        if (m.type === 'snapshot') nickSnap = m.snapshot;
      });
      wsDiana.on('message', (raw) => {
        const m = JSON.parse(raw);
        if (m.type === 'snapshot') dianaSnap = m.snapshot;
      });

      const matchStarted = waitWsMessage(
        wsDiana,
        (m) => m.type === 'snapshot' && m.snapshot?.matchStatus === 'playing',
      );
      wsNick.sendJson({ type: 'join_seat' });
      wsDiana.sendJson({ type: 'join_seat' });
      await matchStarted;

      // 3. Verify 3rd player (Bella) is strictly blocked from joining the 2-player Hangman game!
      const bellaErrP = waitWsMessage(wsBella, (m) => m.type === 'action_error');
      wsBella.sendJson({ type: 'join_seat' });
      const bellaErr = await bellaErrP;
      assert.equal(bellaErr.code, 'MAX_PLAYERS_REACHED');
      assert.match(bellaErr.error, /No more than 2 players allowed/i);

      const wsByUid = {
        'nicholas-dipiazza': wsNick,
        'diana-arrington': wsDiana,
      };
      const snapByUid = () => ({
        'nicholas-dipiazza': nickSnap,
        'diana-arrington': dianaSnap,
      });

      // 4. Play Round 1: Chooser sets "ROBOS THEATER", Guesser solves it letter-by-letter!
      const r1ChooserUid = dianaSnap.gameView.chooserUid;
      const r1GuesserUid = dianaSnap.gameView.guesserUid;
      assert.notEqual(r1ChooserUid, r1GuesserUid);

      // Guesser trying to set_phrase is rejected
      const wrongRoleErrP = waitWsMessage(wsByUid[r1GuesserUid], (m) => m.type === 'action_error');
      wsByUid[r1GuesserUid].sendJson({ type: 'game_action', action: { type: 'set_phrase', phrase: 'NOPE' } });
      const wrongRoleErr = await wrongRoleErrP;
      assert.ok(wrongRoleErr.error);

      // Chooser sets secret phrase — wait for BOTH players to receive the updated snapshot
      const guessingPhaseP = Promise.all([
        waitWsMessage(
          wsByUid[r1GuesserUid],
          (m) => m.type === 'snapshot' && m.snapshot?.gameView?.phase === 'guessing',
        ),
        waitWsMessage(
          wsByUid[r1ChooserUid],
          (m) => m.type === 'snapshot' && m.snapshot?.gameView?.phase === 'guessing',
        ),
      ]);
      wsByUid[r1ChooserUid].sendJson({
        type: 'game_action',
        action: { type: 'set_phrase', phrase: 'ROBOS AI!' },
      });
      await guessingPhaseP;

      // Verify secret phrase is HIDDEN from Guesser and VISIBLE to Chooser!
      const snapsGuessing = snapByUid();
      assert.equal(snapsGuessing[r1GuesserUid].gameView.secretPhrase, null);
      assert.equal(snapsGuessing[r1GuesserUid].gameView.maskedPhrase, '_____ __!');
      assert.equal(snapsGuessing[r1ChooserUid].gameView.secretPhrase, 'ROBOS AI!');

      // Guesser makes 1 wrong guess ('Z') + all winning letters ('R', 'O', 'B', 'S', 'A', 'I')
      for (const ch of ['Z', 'R', 'O', 'B', 'S', 'A', 'I']) {
        const nextSnapP = waitWsMessage(
          wsByUid[r1GuesserUid],
          (m) => m.type === 'snapshot' && m.snapshot?.gameView?.guessedLetters?.includes(ch),
        );
        wsByUid[r1GuesserUid].sendJson({ type: 'game_action', action: { type: 'guess_letter', letter: ch } });
        await nextSnapP;
      }

      const r1EndView = snapByUid()[r1GuesserUid].gameView;
      assert.equal(r1EndView.phase, 'round_over');
      assert.equal(r1EndView.roundResult, 'won');
      assert.equal(r1EndView.wrongCount, 1);
      assert.equal(r1EndView.secretPhrase, 'ROBOS AI!');
      assert.equal(r1EndView.scores[r1GuesserUid], 1);

      // 5. Advance to Round 2 -> Verify Phrase Chooser strictly alternates!
      const round2P = waitWsMessage(
        wsNick,
        (m) => m.type === 'snapshot' && m.snapshot?.gameView?.round === 2,
      );
      wsNick.sendJson({ type: 'game_action', action: { type: 'next_round' } });
      await round2P;

      const r2View = nickSnap.gameView;
      assert.equal(r2View.round, 2);
      assert.equal(r2View.phase, 'choosing');
      assert.equal(r2View.chooserUid, r1GuesserUid, 'Round 2 Phrase Chooser must alternate to Round 1 Guesser!');
      assert.equal(r2View.guesserUid, r1ChooserUid, 'Round 2 Guesser must alternate to Round 1 Chooser!');

      // Play Round 2 via full phrase solve
      const r2GuessingP = waitWsMessage(
        wsByUid[r2View.guesserUid],
        (m) => m.type === 'snapshot' && m.snapshot?.gameView?.phase === 'guessing',
      );
      wsByUid[r2View.chooserUid].sendJson({
        type: 'game_action',
        action: { type: 'set_phrase', phrase: 'GODOT FOUR' },
      });
      await r2GuessingP;

      const r2OverP = Promise.all([
        waitWsMessage(
          wsNick,
          (m) => m.type === 'snapshot' && m.snapshot?.gameView?.phase === 'round_over',
        ),
        waitWsMessage(
          wsDiana,
          (m) => m.type === 'snapshot' && m.snapshot?.gameView?.phase === 'round_over',
        ),
      ]);
      wsByUid[r2View.guesserUid].sendJson({
        type: 'game_action',
        action: { type: 'guess_phrase', phrase: 'godot four' },
      });
      await r2OverP;
      assert.equal(nickSnap.gameView.roundResult, 'won');

      // 6. Advance to Round 3 -> Verify Phrase Chooser alternates back to Round 1 Chooser!
      const round3P = waitWsMessage(
        wsNick,
        (m) => m.type === 'snapshot' && m.snapshot?.gameView?.round === 3,
      );
      wsDiana.sendJson({ type: 'game_action', action: { type: 'next_round' } });
      await round3P;
      assert.equal(nickSnap.gameView.chooserUid, r1ChooserUid, 'Round 3 Phrase Chooser must alternate back!');

      // 7. Validate rendering all Hangman states inside real Godot 4 Engine!
      const godotBin = findGodotBin();
      if (godotBin) {
        const viewsFile = path.join(tmpConfigDir, 'hangman-views.json');
        fs.writeFileSync(
          viewsFile,
          JSON.stringify({
            samples: [
              { view: snapsGuessing[r1ChooserUid].gameView, me: nick, lobby: {} },
              { view: snapsGuessing[r1GuesserUid].gameView, me: diana, lobby: {} },
              { view: r1EndView, me: diana, lobby: {} },
            ],
          }),
          'utf8',
        );
        const gdOut = execFileSync(
          godotBin,
          [
            '--headless',
            '--path',
            GODOT_PROJECT_DIR,
            '-s',
            'res://scripts/validate_client.gd',
            '--',
            path.join(targetGameDir, 'client.gd'),
            viewsFile,
          ],
          { encoding: 'utf8', timeout: 15000 },
        );
        assert.match(gdOut, /VALIDATION_OK/);
      }

      wsNick.close();
      wsDiana.close();
      wsBella.close();
    } finally {
      if (srv) await srv.close();
      fs.rmSync(tmpConfigDir, { recursive: true, force: true });
    }
  });

  it('boots the exported Godot 4 HTTPS Web Client in real headless Chrome over HTTPS + WSS', async (t) => {
    let chromeBin = '';
    for (const c of ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser']) {
      if (fs.existsSync(c)) {
        chromeBin = c;
        break;
      }
    }
    if (!chromeBin || !fs.existsSync(path.join(LIVE_HANGMAN_DIR, 'server.js'))) {
      t.skip('Chrome or Hangman cartridge unavailable');
      return;
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-godot-chrome-'));
    let srv = null;
    let chromeProc = null;
    try {
      const targetGameDir = path.join(tmpDir, 'game-theater', 'games', 'hangman');
      fs.mkdirSync(targetGameDir, { recursive: true });
      for (const fname of ['manifest.json', 'server.js', 'client.gd']) {
        fs.copyFileSync(path.join(LIVE_HANGMAN_DIR, fname), path.join(targetGameDir, fname));
      }

      srv = createGameTheaterServer({ configDir: tmpDir, autoExportGodot: true });
      const ep = await srv.listen({ httpPort: 0, httpsPort: 0, host: '127.0.0.1', enableHttps: true });
      const players = loadTheaterPlayers({ configDir: tmpDir });
      const p1 = players[0];

      // Launch headless Chrome with CDP on a free port to verify Godot 4 Wasm boots over HTTPS + WSS!
      const cdpPort = 19450 + Math.floor(Math.random() * 400);
      const userData = path.join(tmpDir, 'chrome-profile');
      const targetUrl = `${ep.localHttpsUrl}/?auth=${p1.authToken}`;

      chromeProc = spawn(
        chromeBin,
        [
          '--headless=new',
          '--no-sandbox',
          '--disable-dev-shm-usage',
          '--ignore-certificate-errors',
          '--use-gl=angle',
          '--use-angle=swiftshader',
          `--user-data-dir=${userData}`,
          `--remote-debugging-port=${cdpPort}`,
          targetUrl,
        ],
        { stdio: 'ignore' },
      );

      // Wait until Godot 4 Web Client connects via WSS to our server!
      const deadline = Date.now() + 20000;
      let online = [];
      while (Date.now() < deadline) {
        online = srv.runtime.getOnlinePlayers();
        if (online.some((op) => op.uid === p1.uid)) break;
        await new Promise((r) => setTimeout(r, 250));
      }

      assert.ok(
        online.some((op) => op.uid === p1.uid),
        `Expected Godot 4 HTTPS Web Client in Chrome to authenticate & connect over WSS as ${p1.uid}`,
      );
    } finally {
      if (chromeProc) {
        try { chromeProc.kill('SIGKILL'); } catch {}
        await new Promise((r) => setTimeout(r, 250));
      }
      if (srv) await srv.close();
      fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  });
});

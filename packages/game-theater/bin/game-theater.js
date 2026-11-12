#!/usr/bin/env node
'use strict';

/**
 * RobOS AI Multiplayer Game Theater CLI
 *
 * Commands:
 *   node packages/game-theater/bin/game-theater.js players [--json]
 *   node packages/game-theater/bin/game-theater.js add-player --name "Alex" --email "alex@example.com" [--gamer-tag "AlexG"]
 *   node packages/game-theater/bin/game-theater.js sync-docs [--url https://...] [--json]
 *   node packages/game-theater/bin/game-theater.js games [--json]
 *   node packages/game-theater/bin/game-theater.js generate "<prompt>" [--title "Hangman"] [--by <uid>] [--json]
 *   node packages/game-theater/bin/game-theater.js modify <game-id> "<prompt>" [--by <uid>] [--json]
 *   node packages/game-theater/bin/game-theater.js export-godot
 */

const {
  loadRawSettings,
  loadTheaterPlayers,
  upsertTheaterPlayer,
  buildPlayerLaunchUrl,
} = require('../lib/player-registry');
const { syncPlayerLaunchDocsWithGoogleDrive } = require('../lib/player-doc-sync');
const { GameTheaterRuntime } = require('../lib/game-runtime');
const { generateOrModifyGame, ensureGodotWebClientExported } = require('../lib/agent-builder');
const { detectLanIp } = require('../lib/tls-cert');

function getFlag(args, flag) {
  const idx = args.indexOf(flag);
  if (idx === -1) return '';
  return args[idx + 1] || '';
}

async function main() {
  const args = process.argv.slice(2);
  const sub = args[0] || 'status';
  const asJson = args.includes('--json');

  if (sub === 'players') {
    const settings = loadRawSettings();
    const base =
      settings.publicTunnelUrl ||
      settings.lanHttpsUrl ||
      `https://${detectLanIp()}:${Number(process.env.GAME_THEATER_HTTPS_PORT || 19229)}`;
    const players = loadTheaterPlayers().map((p) => ({
      uid: p.uid,
      name: p.name,
      gamerTag: p.gamerTag,
      avatar: p.avatar,
      email: p.email,
      launchUrl: buildPlayerLaunchUrl(base, p),
      docUrl: p.doc?.docUrl || '',
    }));
    if (asJson) {
      console.log(JSON.stringify({ ok: true, players }, null, 2));
    } else {
      console.log(`RobOS Game Theater Players (${players.length}):`);
      for (const p of players) {
        console.log(`  • ${p.avatar} ${p.name} (@${p.gamerTag}) [${p.uid}]`);
        console.log(`      Launch URL: ${p.launchUrl}`);
        if (p.docUrl) console.log(`      Google Doc: ${p.docUrl}`);
      }
    }
    return;
  }

  if (sub === 'add-player') {
    const name = getFlag(args, '--name');
    const email = getFlag(args, '--email');
    const gamerTag = getFlag(args, '--gamer-tag');
    const avatar = getFlag(args, '--avatar') || '🎮';
    const created = upsertTheaterPlayer({ name, email, gamerTag, avatar });
    console.log(JSON.stringify({ ok: true, player: created }, null, 2));
    return;
  }

  if (sub === 'sync-docs') {
    const webAppUrl = getFlag(args, '--url') || undefined;
    const runtime = new GameTheaterRuntime();
    const active = runtime.getActiveGame();
    const res = await syncPlayerLaunchDocsWithGoogleDrive({
      webAppUrl,
      activeGameTitle: active ? active.manifest.title : '',
    });
    if (asJson) {
      console.log(JSON.stringify(res, null, 2));
    } else {
      console.log(`Synced ${res.totalPlayerDocs} per-player Google Docs in folder: ${res.folderUrl}`);
      console.log(`Host Directory Doc: ${res.hostDocUrl}`);
      for (const d of Object.values(res.playerDocs)) {
        console.log(`  • ${d.playerName}: ${d.docUrl}`);
      }
    }
    return;
  }

  if (sub === 'games') {
    const runtime = new GameTheaterRuntime();
    const games = runtime.listGames();
    if (asJson) {
      console.log(JSON.stringify({ ok: true, activeGameId: runtime.activeGameId, games }, null, 2));
    } else if (games.length === 0) {
      console.log('No dynamic games generated yet. Run `generate "<prompt>"` or create one from the Godot 4 Lobby!');
    } else {
      console.log(`Generated Multiplayer Games (${games.length}):`);
      for (const g of games) {
        const activeMark = g.id === runtime.activeGameId ? ' [ACTIVE]' : '';
        console.log(`  • ${g.title} (${g.id}, v${g.version}, ${g.minPlayers}-${g.maxPlayers} players)${activeMark} — ${g.description}`);
      }
    }
    return;
  }

  if (sub === 'generate') {
    const title = getFlag(args, '--title');
    const byUid = getFlag(args, '--by');
    const providerId = getFlag(args, '--provider');
    const positional = args.slice(1).filter((a, idx, arr) => {
      if (a.startsWith('--')) return false;
      const prev = idx > 0 ? arr[idx - 1] : '';
      if (['--title', '--by', '--provider'].includes(prev)) return false;
      return true;
    });
    const prompt = positional.join(' ').trim();
    const players = loadTheaterPlayers();
    const requester = players.find((p) => p.uid === byUid) || players[0];
    const runtime = new GameTheaterRuntime();
    const created = await generateOrModifyGame({
      mode: 'generate',
      runtime,
      title,
      prompt,
      requestedBy: requester,
      providerId,
    });
    if (asJson) {
      console.log(JSON.stringify(created, null, 2));
    } else {
      console.log(`Generated & activated "${created.game.title}" (${created.game.id}, v${created.game.version}, max ${created.game.maxPlayers} players)!`);
    }
    return;
  }

  if (sub === 'modify') {
    const gameId = args[1] || '';
    const byUid = getFlag(args, '--by');
    const providerId = getFlag(args, '--provider');
    const positional = args.slice(2).filter((a, idx, arr) => {
      if (a.startsWith('--')) return false;
      const prev = idx > 0 ? arr[idx - 1] : '';
      if (['--by', '--provider'].includes(prev)) return false;
      return true;
    });
    const prompt = positional.join(' ').trim();
    const players = loadTheaterPlayers();
    const requester = players.find((p) => p.uid === byUid) || players[0];
    const runtime = new GameTheaterRuntime();
    const modified = await generateOrModifyGame({
      mode: 'modify',
      runtime,
      gameId,
      prompt,
      requestedBy: requester,
      providerId,
    });
    if (asJson) {
      console.log(JSON.stringify(modified, null, 2));
    } else {
      console.log(`Updated "${modified.game.title}" (${modified.game.id}, v${modified.game.version})!`);
    }
    return;
  }

  if (sub === 'export-godot') {
    const res = ensureGodotWebClientExported({ asyncRebuild: false });
    console.log(JSON.stringify({ ok: true, ...res }, null, 2));
    return;
  }

  // Default: status
  const runtime = new GameTheaterRuntime();
  const players = loadTheaterPlayers();
  const settings = loadRawSettings();
  const status = {
    ok: true,
    playersCount: players.length,
    syncedDocsCount: Object.keys(settings.playerDocs || {}).length,
    hostDocUrl: settings.hostDoc?.docUrl || '',
    publicTunnelUrl: settings.publicTunnelUrl || '',
    lanHttpsUrl: settings.lanHttpsUrl || '',
    activeGameId: runtime.activeGameId,
    games: runtime.listGames(),
  };
  console.log(JSON.stringify(status, null, 2));
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}

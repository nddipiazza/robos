#!/usr/bin/env node
'use strict';

/**
 * RobOS Media MCP server (stdio): watch status and play history for any MCP client
 * (Claude Code, Codex, Gemini CLI, Copilot, RobOS Agent Chat).
 *
 *   claude mcp add robos-media -- node <robos>/packages/movie-player/bin/media-mcp.js
 *
 * Tools
 *   robos_media_watch_status      where you left off in a show ("what season of X did we leave off on")
 *   robos_media_movie_status      whether a movie was watched or how far in
 *   robos_media_continue_watching in-progress shows and movies
 *   robos_media_list_shows        shows with watched / in-progress counts
 *   robos_media_watch_history     recently watched (Movie Player) or played (Audio Player)
 *   robos_media_set_watched       mark a show, season or episode watched / unwatched
 *   robos_media_play_next_episode play the next episode in the open Movie Player
 *   robos_media_sync_now          sync both players' library and history with the backup vault
 *
 * Every answer has a `spoken` sentence when one makes sense, ready for RobOS Voice.
 */

const readline = require('node:readline');
const watch = require('./media-watch-lib')();

const PROTOCOL = '2024-11-05';
const str = description => ({ type: 'string', description });
const int = description => ({ type: 'integer', description });

const TOOLS = [
  {
    name: 'robos_media_watch_status',
    description: 'Where the user left off in a TV show: last episode watched (season, episode, title, minutes in, which computer, when), the next episode, and per-season watched counts. Use for "what season of <show> did we leave off on", "where are we in <show>", "what episode of <show> are we on". Answers from the synced watch history, so it covers every computer.',
    inputSchema: { type: 'object', properties: { show: str('Show name as the user said it, e.g. "the office", "breaking bad"') }, required: ['show'] },
    call: a => watch.watchStatus(a.show),
  },
  {
    name: 'robos_media_movie_status',
    description: 'Whether the user has watched a movie, or how far into it they are.',
    inputSchema: { type: 'object', properties: { title: str('Movie title as the user said it') }, required: ['title'] },
    call: a => watch.movieStatus(a.title),
  },
  {
    name: 'robos_media_continue_watching',
    description: 'Shows and movies the user is in the middle of, newest first (one row per show).',
    inputSchema: { type: 'object', properties: { limit: int('How many (default 10)') } },
    call: a => watch.continueWatching({ limit: a.limit || 10 }),
  },
  {
    name: 'robos_media_list_shows',
    description: 'Every TV show in the library or watch history, with how many episodes were watched or are in progress.',
    inputSchema: { type: 'object', properties: {} },
    call: () => watch.listShows(),
  },
  {
    name: 'robos_media_watch_history',
    description: 'Recently watched episodes and movies (app "movie-player", default) or recently played songs (app "audio-player"), newest first, with the computer each was played on.',
    inputSchema: { type: 'object', properties: { app: { type: 'string', enum: ['movie-player', 'audio-player'] }, kind: { type: 'string', enum: ['tv', 'movie', 'audio'] }, limit: int('How many (default 20)') } },
    call: a => watch.history(a),
  },
  {
    name: 'robos_media_set_watched',
    description: 'Marks a whole show, one season, or one episode as watched (or unwatched with watched=false). Syncs to the user\'s other computers.',
    inputSchema: { type: 'object', properties: { show: str('Show name'), season: int('Season number (omit for the whole show)'), episode: int('Episode number (needs season)'), watched: { type: 'boolean', description: 'false to mark unwatched (default true)' } }, required: ['show'] },
    call: a => watch.setWatched(a),
  },
  {
    name: 'robos_media_play_next_episode',
    description: 'Plays the next episode of a show in RobOS Movie Player (resuming the one in progress). The Movie Player must be open.',
    inputSchema: { type: 'object', properties: { show: str('Show name'), targetIp: str('Optional TV / Chromecast IP to cast to') }, required: ['show'] },
    call: a => watch.playNextEpisode(a),
  },
  {
    name: 'robos_media_sync_now',
    description: 'Syncs the Movie Player and Audio Player folders, playlists and watch history with the user\'s RobOS backup vault (for example on Google Drive) right now.',
    inputSchema: { type: 'object', properties: {} },
    call: () => watch.syncNow(),
  },
];

async function handle(req) {
  const { id, method, params } = req;
  if (method === 'initialize') return { protocolVersion: params?.protocolVersion || PROTOCOL, serverInfo: { name: 'robos-media', version: '1.0.0' }, capabilities: { tools: {} } };
  if (method === 'ping') return {};
  if (method === 'tools/list') return { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) };
  if (method === 'tools/call') {
    const tool = TOOLS.find(t => t.name === params?.name);
    if (!tool) throw Object.assign(new Error(`Unknown tool: ${params?.name}`), { code: -32602 });
    try {
      const result = await tool.call(params.arguments || {});
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], isError: result && result.ok === false ? true : undefined };
    } catch (err) {
      return { content: [{ type: 'text', text: err.message }], isError: true };
    }
  }
  if (id === undefined) return undefined; // notifications/initialized and friends
  throw Object.assign(new Error(`Method not found: ${method}`), { code: -32601 });
}

function serve() {
  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  rl.on('line', async (line) => {
    if (!line.trim()) return;
    let req;
    try { req = JSON.parse(line); } catch { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }) + '\n'); return; }
    try {
      const result = await handle(req);
      if (req.id !== undefined && result !== undefined) process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: req.id, result }) + '\n');
    } catch (err) {
      if (req.id !== undefined) process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: req.id, error: { code: err.code || -32603, message: err.message } }) + '\n');
    }
  });
}

if (require.main === module) serve();
module.exports = { TOOLS, handle };

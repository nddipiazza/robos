#!/usr/bin/env node
'use strict';

/**
 * robos watch status — where you left off in your shows, from the command line.
 *
 *   node packages/movie-player/bin/watch-status.js show "the office"        where did we leave off?
 *   node packages/movie-player/bin/watch-status.js movie "dune"             watched it yet?
 *   node packages/movie-player/bin/watch-status.js continue                 in-progress shows and movies
 *   node packages/movie-player/bin/watch-status.js shows                    every show with counts
 *   node packages/movie-player/bin/watch-status.js history [--audio] [--limit 20]
 *   node packages/movie-player/bin/watch-status.js watched "the office" --season 2 [--episode 3] [--unwatched]
 *   node packages/movie-player/bin/watch-status.js next "the office"        play the next episode (Movie Player open)
 *   node packages/movie-player/bin/watch-status.js sync                     sync library + history with the vault now
 *
 * Add --json for the full answer. Without it the spoken sentence (what RobOS Voice says) is printed.
 */

const watch = require('./media-watch-lib')();

function parse(argv) {
  const out = { _: [], json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a === '--audio') out.audio = true;
    else if (a === '--unwatched') out.unwatched = true;
    else if (a.startsWith('--')) out[a.slice(2)] = argv[++i];
    else out._.push(a);
  }
  return out;
}

function line(res) {
  if (!res) return 'No answer.';
  if (res.spoken) return res.spoken;
  if (res.error) return res.error;
  if (Array.isArray(res.items)) {
    if (!res.items.length) return 'Nothing yet.';
    return res.items.map(i => (i.kind === 'tv'
      ? `${i.show} ${i.code || `S${i.season}E${i.episode}`}${i.inProgress ? ` (${Math.round((i.positionSec || 0) / 60)} min in)` : i.completed ? ' (finished)' : ''}  ${i.lastPlayed || ''}  ${i.by || i.watchedOn || ''}`
      : `${i.artist ? `${i.artist} – ` : ''}${i.title}${i.year ? ` (${i.year})` : ''}  ${i.lastPlayed || ''}  ${i.by || i.watchedOn || ''}`).trim()).join('\n');
  }
  if (Array.isArray(res.shows)) return res.shows.map(s => `${s.name}: ${s.watched} watched${s.episodes ? ` of ${s.episodes}` : ''}${s.inProgress ? `, ${s.inProgress} in progress` : ''}`).join('\n') || 'No shows yet.';
  if (res.ok && 'pulled' in res) return `Synced with ${res.vault}: ${res.pulled.length} from the vault, ${res.pushed.length} to it, ${res.merged.length} merged.`;
  if (res.ok && res.count) return `Marked ${res.count} episode(s) of ${res.show} ${res.watched ? 'watched' : 'unwatched'}.`;
  return JSON.stringify(res);
}

async function main() {
  const args = parse(process.argv.slice(2));
  const [cmd, ...rest] = args._;
  const name = rest.join(' ');
  const num = v => (v === undefined ? null : Number(v));
  let res;
  switch (cmd) {
    case 'show': case 'status': res = await watch.watchStatus(name); break;
    case 'movie': res = await watch.movieStatus(name); break;
    case 'continue': res = await watch.continueWatching({ limit: num(args.limit) || 10 }); break;
    case 'shows': res = await watch.listShows(); break;
    case 'history': res = await watch.history({ app: args.audio ? 'audio-player' : 'movie-player', kind: args.kind, limit: num(args.limit) || 20 }); break;
    case 'watched': res = await watch.setWatched({ show: name, season: num(args.season), episode: num(args.episode), watched: !args.unwatched }); break;
    case 'next': res = await watch.playNextEpisode({ show: name }); break;
    case 'sync': res = await watch.syncNow(); break;
    default:
      process.stdout.write(require('node:fs').readFileSync(__filename, 'utf8').split('\n').filter(l => l.startsWith(' *')).map(l => l.slice(3)).join('\n') + '\n');
      process.exit(cmd ? 2 : 0);
  }
  process.stdout.write((args.json ? JSON.stringify(res, null, 2) : line(res)) + '\n');
  process.exit(res && res.ok === false ? 1 : 0);
}

main().catch(err => { console.error(err.message); process.exit(1); });

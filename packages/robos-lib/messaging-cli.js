#!/usr/bin/env node
'use strict';

// robos-messaging: read and send chat messages from the command line, for people,
// scripts and RobOS agents. Uses the connectors set up in RobOS Messaging.
//
//   robos-messaging networks                         which networks are connected
//   robos-messaging refresh [--network signal]       fetch new messages
//   robos-messaging conversations [--network X]      newest first, with unread counts
//   robos-messaging read <conversation-id> [--limit 20]
//   robos-messaging send --conversation <id> "text"
//   robos-messaging send --network signal --to +15551234567 "text"
//
// Add --json to any command for machine-readable output.

const os = require('node:os');
const path = require('node:path');
const { createMessagingHub } = require('./messaging-hub');

const HOME_DIR = process.env.HOME || os.homedir();
const CONFIG_DIR = process.env.ROBOS_CONFIG_DIR || path.join(HOME_DIR, '.config', 'robos');

const USAGE = `Usage:
  robos-messaging networks
  robos-messaging refresh [--network <id>]
  robos-messaging conversations [--network <id>]
  robos-messaging read <conversation-id> [--limit <n>]
  robos-messaging send --conversation <id> <text>
  robos-messaging send --network <signal|sms|messenger|instagram> --to <recipient> <text>

Add --json for machine-readable output.`;

function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json' || arg === '--help' || arg === '-h') {
      flags[arg.replace(/^-+/, '')] = true;
    } else if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      if (eq > 0) flags[arg.slice(2, eq)] = arg.slice(eq + 1);
      else {
        flags[arg.slice(2)] = argv[i + 1];
        i += 1;
      }
    } else {
      positional.push(arg);
    }
  }
  return { flags, positional };
}

function shortTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

async function run(argv, { hub = createMessagingHub({ configDir: CONFIG_DIR }), out = console.log } = {}) {
  const { flags, positional } = parseArgs(argv);
  const [command, ...rest] = positional;
  const json = Boolean(flags.json);
  const print = (value, text) => out(json ? JSON.stringify(value, null, 2) : text);

  if (!command || flags.help || flags.h) {
    out(USAGE);
    return command ? 0 : 1;
  }

  if (command === 'networks') {
    const { networks } = hub.getOverview();
    const rows = networks.map((n) => ({
      id: n.id,
      label: n.label,
      web: n.web ? (n.web.enabled ? 'on' : 'off') : 'none',
      api: n.api ? (n.api.connected ? `connected (${n.api.accountLabel})` : 'not connected') : 'none',
      canSend: Boolean(n.api?.connected),
      canRead: Boolean(n.api?.connected && !n.api.sendOnly),
      unread: n.unread,
    }));
    print(rows, rows.map((r) => `${r.id.padEnd(10)} web: ${r.web.padEnd(4)}  api: ${r.api}${r.unread ? `  (${r.unread} unread)` : ''}`).join('\n'));
    return 0;
  }

  if (command === 'refresh') {
    const { results, newMessages } = await hub.refresh({ network: flags.network || null });
    const lines = Object.entries(results).map(([id, r]) => (r.ok ? `${id}: ${r.newMessages} new` : `${id}: ${r.error}`));
    print({ results, newMessages }, lines.length ? lines.join('\n') : 'No network that can read is connected.');
    return Object.values(results).some((r) => !r.ok) ? 2 : 0;
  }

  if (command === 'conversations') {
    const list = hub.listConversations({ network: flags.network || null });
    print(list, list.length
      ? list.map((c) => `${c.id}\n  ${c.networkLabel} · ${c.title}${c.unread ? ` · ${c.unread} unread` : ''} · ${shortTime(c.updatedAt)}\n  ${c.lastMessage ? `${c.lastMessage.from}: ${c.lastMessage.text.split('\n')[0].slice(0, 100)}` : ''}`).join('\n')
      : 'No conversations yet. Run "robos-messaging refresh" after connecting a network.');
    return 0;
  }

  if (command === 'read') {
    const id = rest[0];
    if (!id) {
      out(USAGE);
      return 1;
    }
    const conv = hub.getConversation(id);
    if (!conv) {
      print({ ok: false, error: 'No conversation with that id.' }, 'No conversation with that id.');
      return 2;
    }
    const limit = Math.max(1, Number(flags.limit) || 20);
    const messages = conv.messages.slice(-limit);
    hub.markRead(id);
    print({ ...conv, messages }, [`${conv.networkLabel} · ${conv.title}`, ...messages.map((m) => `[${shortTime(m.at)}] ${m.from}: ${m.text}`)].join('\n'));
    return 0;
  }

  if (command === 'send') {
    const text = rest.join(' ');
    const result = await hub.send({
      conversationId: flags.conversation || null,
      network: flags.network || null,
      to: flags.to || null,
      text,
    });
    print(result, result.ok ? `Sent (${result.conversationId}).` : `Not sent: ${result.error}`);
    return result.ok ? 0 : 2;
  }

  out(USAGE);
  return 1;
}

if (require.main === module) {
  run(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { run, parseArgs };

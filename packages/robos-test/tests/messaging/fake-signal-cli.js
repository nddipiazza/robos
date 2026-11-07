#!/usr/bin/env node
'use strict';

// Stands in for signal-cli in the RobOS Messaging tests.
//   FAKE_SIGNAL_DIR/accounts.json  numbers that are "linked"
//   FAKE_SIGNAL_DIR/inbox.jsonl    envelopes handed over (once) by `receive`
//   FAKE_SIGNAL_DIR/sent.jsonl     every `send` is appended here

const fs = require('node:fs');
const path = require('node:path');

const dir = process.env.FAKE_SIGNAL_DIR;
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};

if (!dir) {
  console.error('FAKE_SIGNAL_DIR is not set');
  process.exit(1);
}

const accounts = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(dir, 'accounts.json'), 'utf8')); } catch { return []; }
})();

if (args.includes('listAccounts')) {
  process.stdout.write(`${JSON.stringify(accounts.map((number) => ({ number })))}\n`);
  process.exit(0);
}

if (args.includes('link')) {
  process.stdout.write('sgnl://linkdevice?uuid=fake-uuid&pub_key=fake-key\n');
  setTimeout(() => process.exit(0), Number(process.env.FAKE_SIGNAL_LINK_MS || 300));
  return;
}

const account = flag('-a');
if (!accounts.includes(account)) {
  console.error(`User ${account} is not registered.`);
  process.exit(1);
}

if (args.includes('receive')) {
  const inbox = path.join(dir, 'inbox.jsonl');
  let text = '';
  try { text = fs.readFileSync(inbox, 'utf8'); } catch {}
  fs.writeFileSync(inbox, '');
  process.stdout.write(text);
  process.exit(0);
}

if (args.includes('send')) {
  const message = flag('-m');
  const group = flag('-g');
  const recipient = group ? null : args[args.length - 1];
  fs.appendFileSync(path.join(dir, 'sent.jsonl'), `${JSON.stringify({ account, message, recipient, group })}\n`);
  process.stdout.write('1730000000000\n');
  process.exit(0);
}

console.error(`fake signal-cli: unsupported ${args.join(' ')}`);
process.exit(1);

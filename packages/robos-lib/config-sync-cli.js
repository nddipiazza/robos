#!/usr/bin/env node
'use strict';

/**
 * robos-config — RobOS Config Sync from the terminal (same engine as Preferences).
 *
 *   node config-sync-cli.js status
 *   node config-sync-cli.js vault create --account <google-account-id> [--name "RobOS Config Vault"]
 *   node config-sync-cli.js vault create --folder ~/Dropbox [--name "RobOS Config Vault"]
 *   node config-sync-cli.js vault connect <drive-folder-url|id|path> [--account <id>]
 *   node config-sync-cli.js vault plan [--use-vault|--use-local|--merge]
 *   node config-sync-cli.js vault sync [--use-vault|--use-local|--merge] [--keep local|remote] [--watch <seconds>]
 *   node config-sync-cli.js vault disconnect
 *   node config-sync-cli.js share publish --name <n> --template family|onboarding|coworker|custom
 *                                         [--categories a,b] [--to a@x.com,b@y.com] (--account <id> | --folder <dir>)
 *                                         [--seal-network-secret]
 *   node config-sync-cli.js share update <share-id> | share grant <share-id> --to a@x.com | share list
 *   node config-sync-cli.js join <share-url|path> [--account <id>] [--preview]
 *   node config-sync-cli.js joined check | joined update <id> | joined leave <id> [--remove-items]
 *   node config-sync-cli.js restore list | restore <restore-point-id>
 *
 * Passphrases are read from ROBOS_CONFIG_PASSPHRASE so they stay out of shell history.
 * Add --json to any command for machine-readable output.
 */

const sync = require('./config-sync');
const { SHARE_TEMPLATES } = require('./config-sync-catalog');

function parseArgs(argv) {
  const pos = [], flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) { flags[k] = next; i++; } else flags[k] = true;
    } else pos.push(a);
  }
  return { pos, flags };
}

const list = v => (typeof v === 'string' ? v.split(',').map(s => s.trim()).filter(Boolean) : []);
const strategyOf = f => (f['use-vault'] ? 'use-vault' : f['use-local'] ? 'use-local' : f.merge ? 'merge' : undefined);
const passphrase = () => process.env.ROBOS_CONFIG_PASSPHRASE || undefined;

const ICON = { push: '↑', pull: '↓', 'delete-remote': '✕↑', 'delete-local': '✕↓', conflict: '⚠' };

function printPlan(plan) {
  if (plan.firstSync) console.log(`First sync. Recommended: ${plan.recommended}. Using: ${plan.strategy}.`);
  console.log(`This machine: ${plan.local.files} files (${plan.local.removedSecrets} credentials stay local). Vault: ${plan.remote.files} files, generation ${plan.remote.generation}${plan.remote.updatedBy ? `, last pushed by ${plan.remote.updatedBy.machineName}` : ''}.`);
  if (!plan.actions.length) return console.log('Up to date.');
  for (const a of plan.actions) console.log(`  ${(ICON[a.action] || a.action).padEnd(3)} ${a.rel}  (${a.category})`);
}

async function main() {
  const { pos, flags } = parseArgs(process.argv.slice(2));
  const [cmd, sub, arg] = pos;
  const json = Boolean(flags.json);
  const out = (data, text) => (json ? console.log(JSON.stringify(data, null, 2)) : text());

  if (!cmd || cmd === 'help' || flags.help) {
    console.log(require('node:fs').readFileSync(__filename, 'utf8').split('\n').filter(l => l.startsWith(' *')).map(l => l.slice(3)).join('\n'));
    return;
  }

  if (cmd === 'status') {
    const s = sync.getStatus();
    return out(s, () => {
      console.log(`Machine: ${s.machine.name} (${s.machine.user.name})`);
      console.log(s.vault ? `Vault: ${s.vault.name} ${s.vault.url}${s.vault.encrypted ? ' [encrypted]' : ''}, last sync ${s.vault.lastSyncAt || 'never'}` : 'Vault: not connected');
      for (const sh of s.shares) console.log(`Published: ${sh.name} (gen ${sh.generation}) ${sh.url} → ${sh.recipients.map(r => r.email).join(', ') || 'nobody yet'}`);
      for (const j of s.subscriptions) console.log(`Joined: ${j.name} from ${j.publisher?.name || '?'} (gen ${j.appliedGeneration}/${j.latestGeneration})`);
    });
  }

  if (cmd === 'vault') {
    if (sub === 'create') {
      const create = flags.folder ? { kind: 'folder', path: flags.folder, name: flags.name || 'RobOS Config Vault' } : { kind: 'gdrive', accountId: flags.account, name: flags.name || 'RobOS Config Vault' };
      const r = await sync.connectVault({ create, passphrase: passphrase() });
      return out(r, () => { console.log(`Created vault ${r.vault.name}: ${r.vault.url}`); printPlan(r.plan); console.log('Run "vault sync" to upload.'); });
    }
    if (sub === 'connect') {
      const r = await sync.connectVault({ ref: arg, accountId: flags.account, passphrase: passphrase() });
      return out(r, () => { console.log(`Connected to ${r.vault.name}: ${r.vault.url}`); printPlan(r.plan); });
    }
    if (sub === 'plan') { const p = await sync.planVaultSync({ strategy: strategyOf(flags), passphrase: passphrase() }); return out(p, () => printPlan(p)); }
    if (sub === 'sync') {
      const run = async () => {
        const plan = await sync.planVaultSync({ strategy: strategyOf(flags) });
        const resolutions = {};
        if (flags.keep === 'local' || flags.keep === 'remote') for (const a of plan.actions) if (a.action === 'conflict') resolutions[a.rel] = flags.keep;
        const r = await sync.applyVaultSync({ strategy: strategyOf(flags), resolutions });
        out(r, () => console.log(`Synced generation ${r.generation}: ↑${r.pushed.length} ↓${r.pulled.length} ✕${r.deletedLocal.length + r.deletedRemote.length}${r.restorePointId ? ` (restore point ${r.restorePointId})` : ''}`));
      };
      if (!flags.watch) return run();
      const every = Math.max(30, Number(flags.watch) || 300) * 1000;
      for (;;) {
        try { await run(); } catch (err) { console.error(`${new Date().toISOString()} ${err.code || 'ERROR'}: ${err.message}`); }
        await new Promise(r => setTimeout(r, every));
      }
    }
    if (sub === 'disconnect') return out(sync.disconnectVault(), () => console.log('Disconnected. The vault folder was left as it is.'));
  }

  if (cmd === 'share') {
    if (sub === 'publish') {
      const template = SHARE_TEMPLATES.find(t => t.id === (flags.template || 'custom'));
      if (!template) throw new Error(`Unknown template. Use one of: ${SHARE_TEMPLATES.map(t => t.id).join(', ')}`);
      const r = await sync.publishShare({
        name: flags.name, template: template.id, categories: list(flags.categories).length ? list(flags.categories) : template.categories,
        recipients: list(flags.to), passphrase: passphrase(), includeNetworkSecret: Boolean(flags['seal-network-secret']),
        target: flags.folder ? { kind: 'folder', path: flags.folder } : { kind: 'gdrive', accountId: flags.account },
      });
      return out(r, () => {
        console.log(`Published "${r.share.name}": ${r.url}`);
        for (const g of r.grants) console.log(`  ${g.ok ? '✓' : '✗'} ${g.email}${g.error ? ` — ${g.error}` : ''}`);
        for (const q of r.requires) console.log(`  • ${q.detail}`);
      });
    }
    if (sub === 'update') { const r = await sync.updateShare({ shareId: arg, passphrase: passphrase() }); return out(r, () => console.log(`Published generation ${r.generation} of ${r.share.name}.`)); }
    if (sub === 'grant') { const r = await sync.grantShare({ shareId: arg, recipients: list(flags.to) }); return out(r, () => r.grants.forEach(g => console.log(`${g.ok ? '✓' : '✗'} ${g.email}${g.error ? ` — ${g.error}` : ''}`))); }
    if (sub === 'list') { const s = sync.getStatus(); return out(s.shares, () => s.shares.forEach(sh => console.log(`${sh.id}  ${sh.name}  gen ${sh.generation}  ${sh.url}`))); }
  }

  if (cmd === 'join') {
    const target = sub;
    const opts = { ref: target, accountId: flags.account, passphrase: passphrase(), categories: list(flags.categories).length ? list(flags.categories) : undefined };
    if (flags.preview) {
      const p = await sync.previewJoin(opts);
      return out(p, () => {
        console.log(`${p.share.name} from ${p.share.publisher?.name || '?'} (generation ${p.share.generation})`);
        for (const c of p.categories) for (const f of c.files) console.log(`  ${f.effect.padEnd(7)} ${f.rel}${f.stats ? `  +${f.stats.added} ~${f.stats.updated}` : ''}`);
        for (const c of p.connections) console.log(`  ⇄ ${c.name} (${c.driverType}) → ${c.mappedName || 'no matching sign-in on this machine'}`);
        for (const q of p.requires) console.log(`  • ${q.detail}`);
      });
    }
    const r = await sync.joinShare(opts);
    return out(r, () => { console.log(`Joined ${r.subscription.name}. ${r.written.length} file(s) changed.`); r.requires.forEach(q => console.log(`  • ${q.detail}`)); });
  }

  if (cmd === 'joined') {
    if (sub === 'check') { const r = await sync.checkSubscriptions(); return out(r, () => r.subscriptions.forEach(s => console.log(`${s.id}  ${s.name}  ${s.updateAvailable ? `update ${s.appliedGeneration} → ${s.latestGeneration}` : 'up to date'}${s.error ? `  (${s.error})` : ''}`))); }
    if (sub === 'update') { const r = await sync.updateSubscription({ subscriptionId: arg, passphrase: passphrase() }); return out(r, () => console.log(`Applied generation ${r.subscription.appliedGeneration}.`)); }
    if (sub === 'leave') { const r = sync.leaveShare({ subscriptionId: arg, removeItems: Boolean(flags['remove-items']) }); return out(r, () => console.log(`Left. Removed ${r.removedItems} item(s) and ${r.removedFiles} file(s).`)); }
  }

  if (cmd === 'restore') {
    if (!sub || sub === 'list') { const l = sync.listRestorePoints(); return out(l, () => l.forEach(rp => console.log(`${rp.id}  ${rp.reason}  (${rp.fileCount} files)`))); }
    const r = sync.restoreRestorePoint({ id: sub });
    return out(r, () => console.log(`Restored ${r.restored} file(s). Undo with: restore ${r.undoRestorePointId}`));
  }

  throw new Error(`Unknown command "${pos.join(' ')}". Run with --help.`);
}

main().catch(err => {
  console.error(`${err.code ? `${err.code}: ` : ''}${err.message}`);
  if (err.conflicts) for (const c of err.conflicts) console.error(`  ⚠ ${c.rel} (vault version from ${c.remote?.by || '?'}) — rerun with --keep local or --keep remote`);
  process.exit(1);
});

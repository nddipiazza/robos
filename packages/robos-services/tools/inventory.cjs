'use strict';
// Source audit: exclude tests, generated templates, dependencies and fixtures.
const fs = require('node:fs'), path = require('node:path');
const repo = path.resolve(__dirname, '../../..');
const rows = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (/^(node_modules|tests?|test-viewer|demos|fixtures|templates|manifests|\.git|vendor|build|dist|run)$/.test(entry.name)) continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (/\.(js|cjs|gd|py)$/.test(file)) {
      const text = fs.readFileSync(file, 'utf8');
      if (!/(?:createServer\(|\.listen\(|TCPServer\.new\(|StdioServerTransport|McpServer\(|serve_forever\(|uvicorn\.run\()/m.test(text)) continue;
      const source = path.relative(repo, file).replaceAll('\\', '/');
      if (source.startsWith('packages/robos-services/') || /\/robos-test\/|\/test-viewer\.|\/generate-app\./.test(source)) continue;
      const appId = source.split('/')[1];
      rows.push({ appId, name: `${appId}: ${path.basename(file)}`, source, group: source.startsWith('games/') ? 'Games' : 'Existing servers', description: 'Source-audited listener. Runtime records show active Node listeners in apps using robos-lib/dom-snapshot. Game listeners run with the game.' });
    }
  }
}
for (const dir of ['packages', 'games']) walk(path.join(repo, dir));
const snapshotSource = fs.readFileSync(path.join(repo, 'packages/robos-lib/snapshot-cli.js'), 'utf8').split('const PORT_REGISTRY = {')[1].split('};')[0];
for (const match of snapshotSource.matchAll(/'([^']+)'\s*:\s*(\d+)/g)) rows.push({ appId: match[1], name: `${match[1]}: debug server`, source: 'packages/robos-lib/snapshot-cli.js', port: Number(match[2]), group: 'App diagnostics', description: 'Registered debug port; starts with the owning app. A port assignment does not mean it is running.' });
rows.sort((a, b) => a.source.localeCompare(b.source));
fs.writeFileSync(path.resolve(__dirname, '../inventory.json'), JSON.stringify(rows, null, 2) + '\n');
console.log(`Cataloged ${rows.length} existing server source files`);

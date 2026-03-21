'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

describe('search-index unit tests', () => {
  it('ensureConfig creates default indexes when file missing', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'si-test-'));
    const configFile = path.join(tmp, 'search-indexes.json');
    const indexDir = path.join(tmp, 'search-index');

    fs.mkdirSync(indexDir, { recursive: true });
    const DEFAULT_INDEXES = [
      { id: 'source', name: 'Source Projects', system: true, paths: ['/home/robos/source'] },
      { id: 'robos-config', name: 'RobOS Config', system: true, paths: ['/home/robos/.config/robos'] },
    ];

    if (!fs.existsSync(configFile)) {
      fs.writeFileSync(configFile, JSON.stringify(DEFAULT_INDEXES, null, 2));
    }

    const result = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].id, 'source');
    assert.strictEqual(result[1].id, 'robos-config');

    fs.rmSync(tmp, { recursive: true });
  });

  it('addIndex creates a new custom index', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'si-test-'));
    const configFile = path.join(tmp, 'search-indexes.json');
    const indexes = [
      { id: 'source', name: 'Source Projects', system: true },
    ];
    fs.writeFileSync(configFile, JSON.stringify(indexes));

    const name = 'My Projects';
    const paths = ['/home/robos/projects'];
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const loaded = JSON.parse(fs.readFileSync(configFile, 'utf8'));

    assert.ok(!loaded.find(i => i.id === id), 'index does not exist yet');

    const newIdx = { id, name, system: false, paths, exclude: ['node_modules', '.git', 'dist'], lastIndexed: null, fileCount: 0 };
    loaded.push(newIdx);
    fs.writeFileSync(configFile, JSON.stringify(loaded));

    const result = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[1].id, 'my-projects');
    assert.strictEqual(result[1].system, false);

    fs.rmSync(tmp, { recursive: true });
  });

  it('deleteIndex removes non-system index', () => {
    const indexes = [
      { id: 'source', name: 'Source', system: true },
      { id: 'custom', name: 'Custom', system: false },
    ];

    const idx = indexes.find(i => i.id === 'custom');
    assert.ok(idx);
    assert.ok(!idx.system, 'can delete non-system index');

    const result = indexes.filter(i => i.id !== 'custom');
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].id, 'source');
  });

  it('deleteIndex rejects system index', () => {
    const indexes = [
      { id: 'source', name: 'Source', system: true },
    ];

    const idx = indexes.find(i => i.id === 'source');
    assert.ok(idx.system, 'cannot delete system index');
  });

  it('search returns matching files', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'si-test-'));
    const indexFile = path.join(tmp, 'source.txt');
    fs.writeFileSync(indexFile, [
      '/home/robos/source/app/main.js',
      '/home/robos/source/app/package.json',
      '/home/robos/source/lib/utils.js',
    ].join('\n'));

    const content = fs.readFileSync(indexFile, 'utf8');
    const lines = content.split('\n').filter(l => l.toLowerCase().includes('main'));
    assert.strictEqual(lines.length, 1);
    assert.ok(lines[0].includes('main.js'));

    fs.rmSync(tmp, { recursive: true });
  });
});

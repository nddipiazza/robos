'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { releaseGames, pagePath } = require('./catalog.cjs');
const { configureVariant, preset } = require('./build.cjs');

test('Midterms has its own release group and nested game page', () => {
  assert.deepEqual(Object.keys(releaseGames('midterms-2026-v')), ['midterms-2026']);
  assert.ok(!releaseGames('games-v')['midterms-2026']);
  assert.equal(pagePath('midterms-2026'), '/games/tabletop-rpg/midterms-2026/');
});

test('standalone campaign staging selects its campaign and excludes unrelated content', () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'midterms-stage-'));
  try {
    fs.mkdirSync(path.join(project, 'cartridges'));
    fs.mkdirSync(path.join(project, 'assets/movies'), { recursive: true });
    fs.writeFileSync(path.join(project, 'project.godot'), '[application]\nconfig/name="Original"\n');
    fs.writeFileSync(path.join(project, 'cartridges/election-2026-quest-1.cartridge.json'), '{"introMovie":"res://assets/movies/election.ogv"}');
    fs.writeFileSync(path.join(project, 'cartridges/custom-quest.cartridge.json'), '{}');
    fs.writeFileSync(path.join(project, 'assets/movies/election.ogv'), 'retained');
    fs.writeFileSync(path.join(project, 'assets/movies/unrelated.ogv'), 'excluded');
    configureVariant(project, { title: 'Midterms 2026', cartridge: 'election-2026-quest-1' });
    const config = fs.readFileSync(path.join(project, 'project.godot'), 'utf8');
    assert.match(config, /config\/name="Midterms 2026"/);
    assert.match(config, /standalone\/cartridge="election-2026-quest-1"/);
    assert.deepEqual(fs.readdirSync(path.join(project, 'cartridges')), ['election-2026-quest-1.cartridge.json']);
    assert.deepEqual(fs.readdirSync(path.join(project, 'assets/movies')), ['election.ogv']);
  } finally { fs.rmSync(project, { recursive: true, force: true }); }
});

test('web exports run single-threaded without cross-origin isolation', () => {
  const config = preset('web', 'midterms-2026');
  assert.match(config, /platform="Web"/);
  assert.match(config, /variant\/thread_support=false/);
  assert.match(config, /progressive_web_app\/enabled=false/);
});

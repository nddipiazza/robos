'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

const appDir = path.resolve(__dirname, '../../../robos-documentation');
const { PORT_REGISTRY } = require('../../../robos-lib/snapshot-cli');
const { BUILTIN_APPS } = require('../../../robos-icons/index');

describe('RobOS Documentation Desktop Application Package & Registrations', () => {
  it('1. Package contains all required Electron desktop files conforming to RobOS conventions', () => {
    assert.ok(fs.existsSync(path.join(appDir, 'package.json')), 'package.json must exist');
    assert.ok(fs.existsSync(path.join(appDir, 'main.js')), 'main.js must exist');
    assert.ok(fs.existsSync(path.join(appDir, 'preload.js')), 'preload.js must exist');
    assert.ok(fs.existsSync(path.join(appDir, 'renderer', 'index.html')), 'renderer/index.html must exist');
    assert.ok(fs.existsSync(path.join(appDir, 'renderer', 'app.js')), 'renderer/app.js must exist');
    assert.ok(fs.existsSync(path.join(appDir, 'renderer', 'style.css')), 'renderer/style.css must exist');
    assert.ok(fs.existsSync(path.join(appDir, 'icon.svg')), 'icon.svg must exist');
    assert.ok(fs.existsSync(path.join(appDir, 'robos-documentation.desktop')), '.desktop must exist');
    assert.ok(fs.existsSync(path.join(appDir, 'cli-export-web.js')), 'cli-export-web.js must exist');
    assert.ok(fs.existsSync(path.join(appDir, 'test-viewer.js')), 'test-viewer.js must exist');

    const pkg = JSON.parse(fs.readFileSync(path.join(appDir, 'package.json'), 'utf8'));
    assert.strictEqual(pkg.name, 'robos-documentation');
    assert.strictEqual(pkg.main, 'main.js');
  });

  it('2. Desktop file declares standard RobOS FreeDesktop properties and QEMU flags', () => {
    const desktopContent = fs.readFileSync(path.join(appDir, 'robos-documentation.desktop'), 'utf8');

    assert.ok(desktopContent.includes('X-RobOS-App=true'), 'Must declare X-RobOS-App=true');
    assert.ok(desktopContent.includes('Name=RobOS Documentation'), 'Must set human-readable app name');
    assert.ok(desktopContent.includes('--no-sandbox'), 'Must include QEMU --no-sandbox flag');
    assert.ok(desktopContent.includes('--disable-gpu'), 'Must include QEMU --disable-gpu flag');
    assert.ok(desktopContent.includes('--disable-dev-shm-usage'), 'Must include QEMU --disable-dev-shm-usage flag');
    assert.ok(desktopContent.includes('X-RobOS-Category=Dev'), 'Must set valid category Dev');
  });

  it('3. Icon is 48x48 Lucide-style SVG with RobOS color palette', () => {
    const iconSvg = fs.readFileSync(path.join(appDir, 'icon.svg'), 'utf8');

    assert.ok(iconSvg.includes('width="48"'), 'Must specify width="48"');
    assert.ok(iconSvg.includes('height="48"'), 'Must specify height="48"');
    assert.ok(iconSvg.includes('stroke="#00bcd4"'), 'Must use RobOS cyan accent');
    assert.ok(iconSvg.includes('stroke-width="1.5"'), 'Must use Lucide standard stroke-width');
  });

  it('4. Registered in RobOS icon registry and snapshot port registry', () => {
    // Port registry
    assert.strictEqual(PORT_REGISTRY['robos-documentation'], 19197, 'Must be registered on debug port 19197');

    // Icon registry
    const iconEntry = BUILTIN_APPS.find(a => a.appId === 'robos-documentation');
    assert.ok(iconEntry, 'Must be registered in BUILTIN_APPS');
    assert.strictEqual(iconEntry.label, 'RobOS Documentation');
    assert.ok(iconEntry.iconSvg.includes('<svg'), 'Must include valid SVG markup');
  });
});

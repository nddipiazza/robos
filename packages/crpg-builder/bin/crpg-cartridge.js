#!/usr/bin/env node

/**
 * CLI utility for RobOS cRPG Player Cartridge System
 * Usage:
 *   node bin/crpg-cartridge.js bundle <campaign-slug>
 *   node bin/crpg-cartridge.js bundle-all
 *   node bin/crpg-cartridge.js list
 *   node bin/crpg-cartridge.js inspect <cartridge-slug>
 */

const { CartridgeBundler } = require('../lib/cartridge-bundler');
const path = require('path');
const fs = require('fs');

const bundler = new CartridgeBundler();
const args = process.argv.slice(2);
const command = args[0] || 'list';

switch (command) {
  case 'bundle': {
    const slug = args[1];
    if (!slug) {
      console.error('Error: Please specify a campaign slug (e.g. rescue-the-princess)');
      process.exit(1);
    }
    const outPath = args[2] || null;
    try {
      const res = bundler.saveCartridge(slug, outPath);
      console.log(`\n📼 [Player Cartridge Created]`);
      console.log(`Title:       ${res.cartridge.header.title}`);
      console.log(`ID:          ${res.cartridge.cartridgeId}`);
      console.log(`Maps:        ${res.cartridge.header.mapCount}`);
      console.log(`Characters:  ${res.cartridge.header.characterCount}`);
      console.log(`Items:       ${res.cartridge.header.itemCount}`);
      console.log(`Quests:      ${res.cartridge.header.questCount}`);
      console.log(`Saved To:    ${res.targetPath}\n`);
    } catch (err) {
      console.error('Failed to bundle cartridge:', err.message);
      process.exit(1);
    }
    break;
  }

  case 'bundle-all': {
    const campaigns = bundler.listCampaigns();
    console.log(`\n📦 Bundling ${campaigns.length} campaigns into cartridges...`);
    for (const c of campaigns) {
      try {
        const res = bundler.saveCartridge(c);
        console.log(`  ✓ ${res.cartridge.header.title} -> ${path.basename(res.targetPath)}`);
      } catch (err) {
        console.warn(`  ✗ Failed ${c}: ${err.message}`);
      }
    }
    console.log('Done.\n');
    break;
  }

  case 'list': {
    console.log('\n=== Available Player Cartridges ===');
    const cartridges = bundler.listCartridges();
    if (cartridges.length === 0) {
      console.log('No bundled cartridges yet. Run `crpg-cartridge bundle-all` to generate them.');
    } else {
      cartridges.forEach((c, idx) => {
        const h = c.header;
        console.log(`[${idx + 1}] ${h.icon || '📼'} ${h.title || c.file} (${h.slug || 'custom'})`);
        console.log(`    Maps: ${h.mapCount || 0} | Chars: ${h.characterCount || 0} | Quests: ${h.questCount || 0} | Setting: ${h.setting || 'Unknown'}`);
        console.log(`    Path: ${c.path}`);
      });
    }

    console.log('\n=== Available Campaigns ===');
    const campaigns = bundler.listCampaigns();
    campaigns.forEach(c => console.log(`  - ${c}`));
    console.log('');
    break;
  }

  case 'inspect': {
    const target = args[1];
    if (!target) {
      console.error('Error: Please specify cartridge slug or path');
      process.exit(1);
    }
    let cartPath = target;
    if (!fs.existsSync(cartPath)) {
      cartPath = path.join(bundler.baseDir, 'cartridges', `${target}.cartridge.json`);
    }
    if (!fs.existsSync(cartPath)) {
      console.error(`Cartridge not found at: ${target}`);
      process.exit(1);
    }
    const cart = JSON.parse(fs.readFileSync(cartPath, 'utf8'));
    console.log('\n=== Cartridge Inspection ===');
    console.log(JSON.stringify({
      header: cart.header,
      maps: Object.keys(cart.maps || {}),
      characters: Object.keys(cart.characters || {}),
      items: Object.keys(cart.items || {}),
      quests: (cart.quests || []).map(q => ({ id: q.id, title: q.title, type: q.questType }))
    }, null, 2));
    break;
  }

  default:
    console.log('Usage: node crpg-cartridge.js [bundle <slug> | bundle-all | list | inspect <slug>]');
    break;
}

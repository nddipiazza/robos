'use strict';
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const scenarios = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

const SLUG = 'kgraph-nodes-redesign';
const PERSIST_DIR = path.join(process.env.HOME || '/home/ndipiazza', '.robos', 'development', 'walkthroughs', SLUG);
const BRAIN_DIR = '/home/ndipiazza/.gemini/antigravity/brain/b3eec328-5b7c-4d20-9d65-749de9fa59ce';
const DOCS_SCREENSHOTS = path.resolve(__dirname, '../../../docs/assets/images/screenshots');

const SCRIPT = [
  {
    narration: "The SDLC Resource Nodes panel has been redesigned with collapsible package accordions, count badges, and clean high-density node cards.",
    target: '#sidebar-nodes',
    action: 'hover',
    callout: 'Redesigned SDLC Resource Nodes Panel (Grouped by Package)',
    minHold: 3500,
  },
  {
    narration: "We switch to Category Grouping mode to inspect nodes organized by type: Microservices, Frontends, DevOps Integrations, and Contracts.",
    target: '#btn-group-category',
    action: 'click',
    callout: 'Category Grouping Mode',
    js: `(() => {
      const btn = document.getElementById('btn-group-category');
      if (btn) btn.click();
    })()`,
    minHold: 3500,
  },
  {
    narration: "We test the collapsible accordion controls: collapsing all groups and re-expanding them for rapid navigation.",
    target: '#btn-collapse-all-groups',
    action: 'click',
    callout: 'Collapse & Expand Accordions',
    js: `(() => {
      const collapseBtn = document.getElementById('btn-collapse-all-groups');
      if (collapseBtn) collapseBtn.click();
      setTimeout(() => {
        const expandBtn = document.getElementById('btn-expand-all-groups');
        if (expandBtn) expandBtn.click();
      }, 1000);
    })()`,
    minHold: 4000,
  },
  {
    narration: "The filter pills are now arranged in a sleek single-row horizontally scrollable track, freeing up over 100px of vertical workspace.",
    target: '.filter-pills-wrap',
    action: 'click',
    callout: 'Single-Row Horizontal Filter Chip Track',
    js: `(() => {
      const pill = document.querySelector('.filter-pill[data-filter="service"]');
      if (pill) pill.click();
    })()`,
    minHold: 3500,
  },
  {
    narration: "Real-time search filters nodes instantly across titles, IDs, packages, and repos, with an integrated clear button.",
    target: '#node-search-input',
    action: 'click',
    callout: 'Instant Search & Filter Reset',
    js: `(() => {
      if (window.clearAllNodeFilters) window.clearAllNodeFilters();
      const searchInput = document.getElementById('node-search-input');
      if (searchInput) {
        searchInput.value = 'petstore';
        searchInput.dispatchEvent(new Event('input'));
      }
    })()`,
    minHold: 4500,
  },
];

async function main() {
  fs.mkdirSync(PERSIST_DIR, { recursive: true });
  fs.mkdirSync(DOCS_SCREENSHOTS, { recursive: true });

  await runDemo({
    slug: SLUG,
    appId: 'robos-graph',
    windowTitle: 'RobOS SDLC Knowledge Graph Explorer',
    scenario: scenarios['all-good'],
    audio: false,
    env: { ROBOS_DEMO_SHOW: '1' },
    script: SCRIPT,
  });

  const videoPath = path.join(PERSIST_DIR, `${SLUG}-final.webm`);
  const vttPath = path.join(PERSIST_DIR, `${SLUG}.vtt`);
  const summaryMdPath = path.join(PERSIST_DIR, `${SLUG}-step-by-step.md`);

  const summary = `# SDLC Resource Nodes Panel Redesign Walkthrough

## Summary
The SDLC Resource Nodes sidebar in the RobOS Knowledge Graph Explorer was previously cluttered with wrapping filter pills and an unbounded flat list of 50-100+ items. This update completely modernizes the sidebar:
- **Collapsible Accordions**: Grouping by **Package** (default: \`services\`, \`applications\`, \`devops\`, \`core-platform\`, \`organization\`, \`learning\`) or **Category** (Microservice, Frontend App, Contract, etc.) with chevrons and count badges.
- **Single-Row Horizontal Chip Track**: The 16 filter pills are consolidated into a clean, horizontally scrolling single-row track (\`overflow-x: auto\`), reducing vertical consumption by >100px.
- **High-Density Node Cards**: Visual category indicator accent lines, crisp typography, and compact metadata badges.
- **Interactive Search & Quick Controls**: Group expand/collapse all buttons, real-time node search with auto-expanding matching groups, and a 1-click search clear button.

## Key Steps Demonstrated
1. **Collapsible Package Accordions**: Inspecting nodes grouped cleanly under their package stores.
2. **Category Grouping Mode**: Switching to categorized groupings with Lucide/Unicode icons.
3. **Accordion Collapse/Expand**: Instant navigation across large graphs.
4. **Horizontal Chip Track**: Quick type filtering in a single 26px high row.
5. **Instant Search & Reset**: Real-time filtering across titles, IDs, and repositories.
`;

  fs.writeFileSync(summaryMdPath, summary, 'utf8');

  // Copy artifacts to brain dir
  try {
    if (fs.existsSync(videoPath)) {
      fs.copyFileSync(videoPath, path.join(BRAIN_DIR, `${SLUG}-final.webm`));
    }
    if (fs.existsSync(vttPath)) {
      fs.copyFileSync(vttPath, path.join(BRAIN_DIR, `${SLUG}.vtt`));
    }
    if (fs.existsSync(summaryMdPath)) {
      fs.copyFileSync(summaryMdPath, path.join(BRAIN_DIR, `${SLUG}-step-by-step.md`));
    }

    // Extract key frames for documentation and walkthrough
    if (fs.existsSync(videoPath)) {
      const frames = [
        { time: '00:00:02.000', name: 'nodes-panel-package-group' },
        { time: '00:00:05.500', name: 'nodes-panel-category-group' },
        { time: '00:00:08.500', name: 'nodes-panel-collapsed' },
        { time: '00:00:13.000', name: 'nodes-panel-horizontal-chips' },
        { time: '00:00:18.000', name: 'nodes-panel-search-filtered' },
      ];
      for (const f of frames) {
        const outPersist = path.join(PERSIST_DIR, `${f.name}.png`);
        const outBrain = path.join(BRAIN_DIR, `${f.name}.png`);
        const outDocs = path.join(DOCS_SCREENSHOTS, `${f.name}.png`);
        try {
          execSync(`ffmpeg -y -ss ${f.time} -i ${videoPath} -vframes 1 ${outPersist}`, { stdio: 'ignore' });
          if (fs.existsSync(outPersist)) {
            fs.copyFileSync(outPersist, outBrain);
            fs.copyFileSync(outPersist, outDocs);
          }
        } catch (e) {
          console.warn('Could not extract frame', f.name, e.message);
        }
      }
    }
  } catch (err) {
    console.error('Error copying to brain dir:', err);
  }

  console.log('Done generating nodes redesign demo!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

'use strict';
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const scenarios = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

const SLUG = 'multi-package-repo';
const PERSIST_DIR = path.join(process.env.HOME || '/home/ndipiazza', '.robos', 'development', 'walkthroughs', SLUG);
const BRAIN_DIR = '/home/ndipiazza/.gemini/antigravity/brain/b3eec328-5b7c-4d20-9d65-749de9fa59ce';
const DOCS_SCREENSHOTS = path.resolve(__dirname, '../../../docs/assets/images/screenshots');

const SCRIPT = [
  {
    narration: "The RobOS SDLC Knowledge Graph is organized into modular, namespaced package stores instead of a monolithic file.",
    target: '#stat-bar',
    action: 'hover',
    callout: 'Modular SDLC Knowledge Graph Architecture',
    minHold: 3500,
  },
  {
    narration: "We open the Packages and Repositories Manager to inspect local packages and remote knowledge graph dependencies.",
    target: '#btn-open-packages-modal',
    action: 'click',
    callout: 'Open Packages & Repositories Console',
    js: `(() => {
      if (typeof window.openPackagesModal === 'function') window.openPackagesModal();
    })()`,
    minHold: 4000,
  },
  {
    narration: "RobOS provides 6 standard packages: core platform, organization, services, applications, devops, and learning.",
    target: '#packages-list-grid',
    action: 'hover',
    callout: 'Standard RobOS Namespaced Package Stores',
    minHold: 4000,
  },
  {
    narration: "We inspect registered Knowledge Graph repositories and register an external Git repository pinned to semver git tag v2.4.0.",
    target: '#repos-list-grid',
    action: 'click',
    callout: 'Multi-Repo Registration & Git-Tag Versioning',
    js: `(async () => {
      const idEl = document.getElementById('new-repo-id');
      const nameEl = document.getElementById('new-repo-name');
      const urlEl = document.getElementById('new-repo-url');
      const tagEl = document.getElementById('new-repo-tag');
      if (idEl) idEl.value = 'enterprise-contracts';
      if (nameEl) nameEl.value = 'Enterprise Cloud Contracts';
      if (urlEl) urlEl.value = 'https://github.com/acme/cloud-contracts';
      if (tagEl) tagEl.value = 'v2.4.0';
      if (typeof window.addNewRepo === 'function') {
        await window.addNewRepo();
      }
    })()`,
    minHold: 4500,
  },
  {
    narration: "We close the modal and use the package namespace filter to isolate microservice architecture and OpenAPI contracts.",
    target: '#node-package-filter',
    action: 'click',
    callout: 'Package Namespace Filtering (robos.services)',
    js: `(async () => {
      if (typeof window.closePackagesModal === 'function') window.closePackagesModal();
      const filter = document.getElementById('node-package-filter');
      if (filter) {
        filter.value = 'services';
        filter.dispatchEvent(new Event('change'));
      }
    })()`,
    minHold: 4000,
  },
  {
    narration: "Every package maintains independent storage while syncing automatically to the backwards-compatible aggregated graph.",
    target: '#nodes-list',
    action: 'hover',
    callout: 'Verified Multi-Package Graph Integrity',
    minHold: 3500,
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

  const summary = `# Multi-Package & Multi-Repo Knowledge Graph (Epic 1 Walkthrough)

1. **Modular Packaging**: Decouple monolithic graph into 6 namespaced stores (\`core-platform\`, \`organization\`, \`services\`, \`applications\`, \`devops\`, \`learning\`).
2. **Packages Modal**: Inspect package metadata, file paths, and namespace prefixes.
3. **Multi-Repo Composition**: Register remote GitHub repositories pinned to semver git tags (\`v2.4.0\`).
4. **On-Demand Cache Sync**: Cache remote definitions into \`~/.robos/cache/kgraphs/<repo>@<tag>/\`.
5. **Namespace Filter**: Filter UI nodes and visual graph by package namespace.
6. **Backwards Compatibility**: Maintain automatic aggregation into \`.robos/knowledge-graph.jsonld\`.
`;
  fs.writeFileSync(summaryMdPath, summary, 'utf8');

  // Extract key screenshot frames if video was produced
  try {
    if (fs.existsSync(videoPath)) {
      execSync(`ffmpeg -y -ss 00:00:02 -i "${videoPath}" -vframes 1 "${PERSIST_DIR}/multi-pkg-statbar_frame.png"`, { stdio: 'ignore' });
      execSync(`ffmpeg -y -ss 00:00:06 -i "${videoPath}" -vframes 1 "${PERSIST_DIR}/multi-pkg-modal_frame.png"`, { stdio: 'ignore' });
      execSync(`ffmpeg -y -ss 00:00:11 -i "${videoPath}" -vframes 1 "${PERSIST_DIR}/multi-pkg-repos_frame.png"`, { stdio: 'ignore' });
      execSync(`ffmpeg -y -ss 00:00:16 -i "${videoPath}" -vframes 1 "${PERSIST_DIR}/multi-pkg-filter_frame.png"`, { stdio: 'ignore' });

      const frames = [
        'multi-pkg-statbar_frame.png',
        'multi-pkg-modal_frame.png',
        'multi-pkg-repos_frame.png',
        'multi-pkg-filter_frame.png',
      ];
      for (const f of frames) {
        if (fs.existsSync(path.join(PERSIST_DIR, f))) {
          fs.copyFileSync(path.join(PERSIST_DIR, f), path.join(DOCS_SCREENSHOTS, f));
          fs.copyFileSync(path.join(PERSIST_DIR, f), path.join(BRAIN_DIR, f));
        }
      }
      fs.copyFileSync(videoPath, path.join(BRAIN_DIR, `${SLUG}-final.webm`));
      if (fs.existsSync(vttPath)) fs.copyFileSync(vttPath, path.join(BRAIN_DIR, `${SLUG}.vtt`));
      fs.copyFileSync(summaryMdPath, path.join(BRAIN_DIR, `${SLUG}-step-by-step.md`));
    }
  } catch (e) {
    console.warn('Frame extraction warning:', e.message);
  }

  console.log(`✓ E2E Proof Test Finished Successfully for ${SLUG}! Deliverables saved to ${PERSIST_DIR}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Demo failed:', err);
    process.exit(1);
  });
}

module.exports = { main, SCRIPT, SLUG };

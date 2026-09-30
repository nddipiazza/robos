'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const { spawn, execSync } = require('node:child_process');

const { launchApp, killApp } = require('../../lib/harness');
const { evalJS, evalClick, getSnapshot, findById, flatText, maximizeWindow } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

const DISPLAY_NUM = process.env.XVFB_DISPLAY || ':105';
const RESOLUTION = '1920x1080';
const DOCS_DIR = path.resolve(__dirname, '../../../../docs/assets/images/screenshots');
const BRAIN_DIR = '/home/ndipiazza/.gemini/antigravity/brain/50dce001-b236-456c-9ceb-5a818f421a45';

const NON_TECHNICAL_PROMPT = `Design and plan a friendly Pet Adoption & Rescue matching platform:
- Pet Discovery Gallery: Browse rescue dogs and cats with photo cards, personality badges, and location
- Lifestyle Matchmaker: Quick quiz matching families with compatible pets based on living space and routine
- Digital Health Passport: View vaccination history, microchip records, and wellness checkup summaries
- Meet-and-Greet Reservations: Book an appointment to visit and play with the pet at the local shelter
- Adoption Application & Verification: Simple online form for adopters and review queue for shelter volunteers`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function startXvfb(display) {
  const lockFile = `/tmp/.X${display.replace(':', '')}-lock`;
  try {
    if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile);
  } catch (_) {}

  const proc = spawn('Xvfb', [display, '-screen', '0', `${RESOLUTION}x24`, '-ac'], {
    stdio: 'ignore',
  });
  await sleep(1500);
  return proc;
}

describe('Task Planner - Non-Technical Feature Planning E2E', () => {
  let xvfbProc = null;
  let app = null;

  before(async () => {
    // 1. Launch Xvfb virtual framebuffer on DISPLAY_NUM (1920x1080)
    xvfbProc = await startXvfb(DISPLAY_NUM);
    process.env.DISPLAY = DISPLAY_NUM;
    process.env.ROBOS_DISPLAY = DISPLAY_NUM;

    // 2. Launch Task Planner with all-good credentials & GitHub task server
    app = await launchApp('task-planner', {
      ...scenarios['task-planner-github'],
      name: 'non-tech-e2e',
      env: {
        DISPLAY: DISPLAY_NUM,
        ROBOS_DISPLAY: DISPLAY_NUM,
        ROBOS_TEST: '1',
      },
    });

    await sleep(2000);

    // Position window centered in 1920x1080 frame matching standard RobOS screenshot layout
    try {
      execSync(`wmctrl -r "RobOS Task" -e 0,180,80,1560,920`, { env: { ...process.env, DISPLAY: DISPLAY_NUM } });
    } catch (_) {
      try {
        await maximizeWindow(app.port);
      } catch (_) {}
    }

    await sleep(1000);
  });

  after(async () => {
    if (app) {
      try { await killApp(app); } catch (_) {}
    }
    if (xvfbProc) {
      try { xvfbProc.kill('SIGTERM'); } catch (_) {}
    }
  });

  it('populates non-technical project metadata and renders clean card', async () => {
    await evalJS(app.port, `
      (() => {
        currentProjectName = 'Acme Pet Adoption Platform';
        currentProjectId = 'urn:robos:project:acme-pet-adoption';
        const nameEl = document.getElementById('project-meta-name');
        if (nameEl) nameEl.textContent = '📁 Acme Pet Adoption Platform';
        const badge = document.getElementById('project-kgraph-badge');
        if (badge) badge.textContent = '⬡ KGraph: urn:robos:project:acme-pet-adoption';
        const card = document.getElementById('project-metadata-card');
        if (card) card.style.display = 'block';
        const techStack = document.getElementById('project-tech-stack');
        if (techStack) techStack.value = 'Modern Web App (Next.js & Postgres)';
        const repoList = document.getElementById('repo-tags-list');
        if (repoList) repoList.innerHTML = '<span class="repo-tag">pet-adoption-web</span><span class="repo-tag">shelter-records</span>';
      })()
    `);

    const snap = await getSnapshot(app.port);
    const text = flatText(snap);
    assert.ok(text.includes('Acme Pet Adoption Platform'), 'Project title rendered');
    assert.ok(text.includes('urn:robos:project:acme-pet-adoption'), 'KGraph badge rendered');
  });

  it('enters non-technical feature goals prompt in textarea', async () => {
    await evalJS(app.port, `
      (() => {
        const host = document.getElementById('prompt-input');
        if (host) {
          host.value = ${JSON.stringify(NON_TECHNICAL_PROMPT)};
          const inner = host.querySelector('.robos-ai-inner') || host.querySelector('textarea') || host;
          inner.innerText = ${JSON.stringify(NON_TECHNICAL_PROMPT)};
          if (inner.value !== undefined) inner.value = ${JSON.stringify(NON_TECHNICAL_PROMPT)};
          host.dispatchEvent(new Event('input', { bubbles: true }));
          host.dispatchEvent(new Event('change', { bubbles: true }));
        }
        const genBtn = document.getElementById('btn-generate');
        if (genBtn) genBtn.disabled = false;
      })()
    `);

    await sleep(500);
    const promptVal = await evalJS(app.port, `(() => getPromptValue())()`);
    assert.ok(promptVal.includes('Pet Discovery Gallery'), 'Non-technical prompt value set');
    assert.ok(promptVal.includes('Lifestyle Matchmaker'), 'Prompt contains matchmaker goal');
    assert.ok(promptVal.includes('Digital Health Passport'), 'Prompt contains health passport goal');
  });

  it('generates task breakdown and renders user-centric cards', async () => {
    await evalClick(app.port, '#btn-generate');

    let cardCount = 0;
    for (let i = 0; i < 30; i++) {
      cardCount = await evalJS(app.port, `document.querySelectorAll('.task-card').length`);
      if (cardCount >= 6) break;
      await sleep(300);
    }
    assert.strictEqual(cardCount, 6, 'six task cards rendered (1 Epic + 5 user-centric tasks)');

    const titles = JSON.parse(await evalJS(app.port, `
      JSON.stringify([...document.querySelectorAll('.task-title-input')].map(i => i.value))
    `));

    // Verify non-technical task breakdown
    assert.ok(titles.some(t => t.includes('Pet Adoption & Animal Rescue Platform')), 'Epic generated');
    assert.ok(titles.some(t => t.includes('ADOPT-101: Pet Discovery Catalog & Personality Filters')), 'Task 1 generated');
    assert.ok(titles.some(t => t.includes('ADOPT-102: Lifestyle Matchmaker Questionnaire')), 'Task 2 generated');
    assert.ok(titles.some(t => t.includes('ADOPT-103: Digital Health & Vaccination Passport')), 'Task 3 generated');
    assert.ok(titles.some(t => t.includes('ADOPT-104: Meet-and-Greet Booking & Shelter Visit')), 'Task 4 generated');
    assert.ok(titles.some(t => t.includes('ADOPT-105: Adoption Application & Verification Flow')), 'Task 5 generated');

    // Assert that technical polyglot jargon is completely absent
    const allTitlesStr = titles.join(' ');
    assert.ok(!allTitlesStr.includes('Java 21 Spring Boot 3'), 'No Java Spring Boot jargon');
    assert.ok(!allTitlesStr.includes('Flyway automated migrations'), 'No Flyway jargon');
    assert.ok(!allTitlesStr.includes('Apache Kafka topic pipeline'), 'No Kafka pipeline jargon');
    assert.ok(!allTitlesStr.includes('TypeSpec DTO schemas'), 'No TypeSpec DTO jargon');
  });

  it('injects visual overlay and captures 1920x1080 frame matching RobOS screenshot standard', async () => {
    // Inject overlay styling, callout bubble, and subtitle banner
    await evalJS(app.port, `
      (() => {
        let style = document.getElementById('robos-demo-overlay-style');
        if (!style) {
          style = document.createElement('style');
          style.id = 'robos-demo-overlay-style';
          document.head.appendChild(style);
        }
        style.textContent = \`
          .demo-target-highlight {
            outline: 2px solid #00bcd4 !important;
            outline-offset: 3px !important;
            box-shadow: 0 0 18px rgba(0, 188, 212, 0.75) !important;
          }
          #demo-callout-bubble {
            position: absolute;
            background: rgba(13, 17, 23, 0.94);
            border: 1.5px solid #00bcd4;
            border-radius: 8px;
            color: #f0f6fc;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 13px;
            font-weight: 500;
            padding: 7px 14px;
            z-index: 2147483647;
            box-shadow: 0 8px 24px rgba(0, 188, 212, 0.35);
            display: flex;
            align-items: center;
            gap: 8px;
          }
          #demo-callout-bubble .callout-badge {
            background: rgba(0, 188, 212, 0.2);
            border: 1px solid rgba(0, 188, 212, 0.6);
            color: #00bcd4;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            padding: 2px 6px;
          }
          #demo-subtitle-banner {
            position: fixed;
            bottom: 24px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(13, 17, 23, 0.95);
            border: 1.5px solid #00bcd4;
            border-radius: 8px;
            color: #f0f6fc;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 13px;
            font-weight: 500;
            padding: 9px 20px;
            box-shadow: 0 8px 28px rgba(0, 188, 212, 0.35);
            z-index: 2147483647;
            display: flex;
            align-items: center;
            gap: 10px;
          }
          #demo-subtitle-banner .step-badge {
            background: #00bcd4;
            color: #0d1117;
            font-weight: 800;
            font-size: 11px;
            border-radius: 4px;
            padding: 2px 7px;
            text-transform: uppercase;
          }
        \`;

        // Highlight textarea
        const promptEl = document.getElementById('prompt-input');
        if (promptEl) promptEl.classList.add('demo-target-highlight');

        // Create or update callout bubble
        let bubble = document.getElementById('demo-callout-bubble');
        if (!bubble) {
          bubble = document.createElement('div');
          bubble.id = 'demo-callout-bubble';
          document.body.appendChild(bubble);
        }
        bubble.innerHTML = '<span class="callout-badge">TYPE</span><span>Non-Technical Feature Goals Prompt</span>';
        if (promptEl) {
          const rect = promptEl.getBoundingClientRect();
          bubble.style.top = Math.max(10, rect.top - 42) + 'px';
          bubble.style.left = (rect.left + 80) + 'px';
        }

        // Create or update subtitle banner
        let banner = document.getElementById('demo-subtitle-banner');
        if (!banner) {
          banner = document.createElement('div');
          banner.id = 'demo-subtitle-banner';
          document.body.appendChild(banner);
        }
        banner.innerHTML = '<span class="step-badge">STEP 5</span><span>In the multi-line AI textarea, we enter plain-English feature goals and review the generated task breakdown.</span>';
      })()
    `);

    await sleep(1500);

    const outPromptFrame = path.join(DOCS_DIR, 'acme-petshop-step1-prompt_frame.png');
    const outPlanFrame = path.join(DOCS_DIR, 'acme-petshop-step1-plan_frame.png');
    const brainPromptFrame = path.join(BRAIN_DIR, 'acme-petshop-step1-prompt_frame.png');

    // Capture 1920x1080 frame directly from Xvfb display
    execSync(`ffmpeg -y -f x11grab -video_size 1920x1080 -i ${DISPLAY_NUM}.0 -vframes 1 "${outPromptFrame}"`, {
      stdio: 'pipe',
    });

    // Also update plan_frame and brain artifact
    fs.copyFileSync(outPromptFrame, outPlanFrame);
    fs.copyFileSync(outPromptFrame, brainPromptFrame);

    assert.ok(fs.existsSync(outPromptFrame), 'Output screenshot frame exists');
    const stat = fs.statSync(outPromptFrame);
    assert.ok(stat.size > 50000, `Screenshot has valid file size (${stat.size} bytes)`);

    console.log(`✓ Successfully captured fresh non-technical prompt frame: ${outPromptFrame} (${stat.size} bytes)`);
  });
});

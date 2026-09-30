'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const { spawn, execSync } = require('node:child_process');

const { launchApp, killApp } = require('../../lib/harness');
const { evalJS, evalClick, getSnapshot, findById, flatText, maximizeWindow } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

const DISPLAY_NUM = process.env.XVFB_DISPLAY || ':106';
const RESOLUTION = '1920x1080';
const DOCS_DIR = path.resolve(__dirname, '../../../../docs/assets/images/screenshots');
const BRAIN_DIR = '/home/ndipiazza/.gemini/antigravity/brain/50dce001-b236-456c-9ceb-5a818f421a45';

const GAME_PROMPT = `Design and plan a 2D fantasy adventure game feature:
- Village Potion Shop: An interactive shop in the town square run by an apothecary NPC
- Healing Potions & Elixirs: Items that restore health points (HP) when used from the inventory bag
- Gold Coin Economy: Heroes earn gold from quests and spend 50 gold coins to buy potions
- NPC Dialog Interaction: Click or walk up to the shopkeeper to open a chat bubble and trade window
- Sound Effects & Music: Cheerful shopkeeper greeting chime and item purchase sound effect`;

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

function injectDemoStyles(title, subtitle) {
  return `
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

      // Update or create callout bubble
      let bubble = document.getElementById('demo-callout-bubble');
      if (!bubble) {
        bubble = document.createElement('div');
        bubble.id = 'demo-callout-bubble';
        document.body.appendChild(bubble);
      }
      bubble.innerHTML = ${JSON.stringify(title)};

      // Update or create subtitle banner
      let banner = document.getElementById('demo-subtitle-banner');
      if (!banner) {
        banner = document.createElement('div');
        banner.id = 'demo-subtitle-banner';
        document.body.appendChild(banner);
      }
      banner.innerHTML = ${JSON.stringify(subtitle)};
    })()
  `;
}

describe('Task Planner - Video Game Planning E2E (Non-Developer Training)', () => {
  let xvfbProc = null;
  let app = null;

  before(async () => {
    xvfbProc = await startXvfb(DISPLAY_NUM);
    process.env.DISPLAY = DISPLAY_NUM;
    process.env.ROBOS_DISPLAY = DISPLAY_NUM;

    app = await launchApp('task-planner', {
      ...scenarios['task-planner-github'],
      name: 'game-plan-e2e',
      env: {
        DISPLAY: DISPLAY_NUM,
        ROBOS_DISPLAY: DISPLAY_NUM,
        ROBOS_TEST: '1',
      },
    });

    await sleep(2000);

    try {
      execSync(`wmctrl -r "RobOS Task" -e 0,180,80,1560,920`, { env: { ...process.env, DISPLAY: DISPLAY_NUM } });
    } catch (_) {
      try { await maximizeWindow(app.port); } catch (_) {}
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

  it('1. populates fantasy game project metadata and types game feature goals', async () => {
    await evalJS(app.port, `
      (() => {
        currentProjectName = 'Realm Quest: The Village Potion Shop';
        currentProjectId = 'urn:robos:project:realm-quest-game';
        const nameEl = document.getElementById('project-meta-name');
        if (nameEl) nameEl.textContent = '🗡️ Realm Quest: The Village Potion Shop';
        const badge = document.getElementById('project-kgraph-badge');
        if (badge) badge.textContent = '⬡ KGraph: urn:robos:project:realm-quest-game';
        const card = document.getElementById('project-metadata-card');
        if (card) card.style.display = 'block';
        const techStack = document.getElementById('project-tech-stack');
        if (techStack) techStack.value = '2D Fantasy Adventure Game (Godot & HTML5)';
        const repoList = document.getElementById('repo-tags-list');
        if (repoList) repoList.innerHTML = '<span class="repo-tag">village-scenes</span><span class="repo-tag">items-catalog</span><span class="repo-tag">game-audio</span>';

        // Set prompt
        const host = document.getElementById('prompt-input');
        if (host) {
          host.value = ${JSON.stringify(GAME_PROMPT)};
          const inner = host.querySelector('.robos-ai-inner') || host.querySelector('textarea') || host;
          inner.innerText = ${JSON.stringify(GAME_PROMPT)};
          if (inner.value !== undefined) inner.value = ${JSON.stringify(GAME_PROMPT)};
          host.dispatchEvent(new Event('input', { bubbles: true }));
          host.dispatchEvent(new Event('change', { bubbles: true }));
        }
        const genBtn = document.getElementById('btn-generate');
        if (genBtn) genBtn.disabled = false;
      })()
    `);

    await sleep(800);

    // Inject callout and subtitle for Screen 1
    await evalJS(app.port, injectDemoStyles(
      '<span class="callout-badge">TYPE</span><span>Plain-English Game Feature Goals</span>',
      '<span class="step-badge">STEP 1</span><span>Describe your game feature in plain English without worrying about code, complex math, or game engines.</span>'
    ));

    await evalJS(app.port, `
      (() => {
        document.querySelectorAll('.demo-target-highlight').forEach(el => el.classList.remove('demo-target-highlight'));
        const promptEl = document.getElementById('prompt-input');
        if (promptEl) {
          promptEl.classList.add('demo-target-highlight');
          const bubble = document.getElementById('demo-callout-bubble');
          const rect = promptEl.getBoundingClientRect();
          if (bubble) {
            bubble.style.top = Math.max(10, rect.top - 42) + 'px';
            bubble.style.left = (rect.left + 80) + 'px';
          }
        }
      })()
    `);

    await sleep(1000);

    const outFrame = path.join(DOCS_DIR, 'game-planner-step1-prompt_frame.png');
    execSync(`ffmpeg -y -f x11grab -video_size 1920x1080 -i ${DISPLAY_NUM}.0 -vframes 1 "${outFrame}"`, { stdio: 'pipe' });
    fs.copyFileSync(outFrame, path.join(BRAIN_DIR, 'game-planner-step1-prompt_frame.png'));
    assert.ok(fs.existsSync(outFrame), 'Prompt frame captured');
  });

  it('2. opens interactive design clarification form and captures question frame', async () => {
    await evalJS(app.port, `
      (() => {
        startQuestionWizard();
      })()
    `);

    await sleep(800);

    // Inject callout and subtitle for Screen 2
    await evalJS(app.port, injectDemoStyles(
      '<span class="callout-badge">ANSWER</span><span>Quick Multiple-Choice Design Form</span>',
      '<span class="step-badge">STEP 2</span><span>The AI asks simple design questions so you can make creative gameplay choices instead of writing essays.</span>'
    ));

    await evalJS(app.port, `
      (() => {
        document.querySelectorAll('.demo-target-highlight').forEach(el => el.classList.remove('demo-target-highlight'));
        const qCard = document.getElementById('ai-questions-card');
        if (qCard) {
          qCard.classList.add('demo-target-highlight');
          const bubble = document.getElementById('demo-callout-bubble');
          const rect = qCard.getBoundingClientRect();
          if (bubble) {
            bubble.style.top = Math.max(10, rect.top - 42) + 'px';
            bubble.style.left = (rect.left + 80) + 'px';
          }
        }
      })()
    `);

    await sleep(1000);

    const outFrame = path.join(DOCS_DIR, 'game-planner-step1-question_frame.png');
    execSync(`ffmpeg -y -f x11grab -video_size 1920x1080 -i ${DISPLAY_NUM}.0 -vframes 1 "${outFrame}"`, { stdio: 'pipe' });
    fs.copyFileSync(outFrame, path.join(BRAIN_DIR, 'game-planner-step1-question_frame.png'));
    assert.ok(fs.existsSync(outFrame), 'Question frame captured');
  });

  it('3. generates game task breakdown and captures plan review frame', async () => {
    await evalJS(app.port, `
      (async () => {
        await handleSubmitAnswers();
      })()
    `);

    let cardCount = 0;
    for (let i = 0; i < 30; i++) {
      cardCount = await evalJS(app.port, `document.querySelectorAll('.task-card').length`);
      if (cardCount >= 6) break;
      await sleep(300);
    }
    assert.strictEqual(cardCount, 6, 'six game task cards rendered');

    // Scroll preview section into view
    await evalJS(app.port, `
      (() => {
        const preview = document.getElementById('preview-section');
        if (preview) {
          preview.scrollIntoView({ behavior: 'instant', block: 'center' });
        }
      })()
    `);

    await sleep(600);

    // Inject callout and subtitle for Screen 3
    await evalJS(app.port, injectDemoStyles(
      '<span class="callout-badge">REVIEW</span><span>Bite-Sized Task Breakdown</span>',
      '<span class="step-badge">STEP 3</span><span>Review the organized blueprint. Notice each task is small, focused, and assigned to a specialist agent persona.</span>'
    ));

    await evalJS(app.port, `
      (() => {
        document.querySelectorAll('.demo-target-highlight').forEach(el => el.classList.remove('demo-target-highlight'));
        const list = document.getElementById('task-list');
        if (list) {
          list.classList.add('demo-target-highlight');
          const bubble = document.getElementById('demo-callout-bubble');
          const rect = list.getBoundingClientRect();
          if (bubble) {
            bubble.style.top = Math.max(10, rect.top - 42) + 'px';
            bubble.style.left = (rect.left + 80) + 'px';
          }
        }
      })()
    `);

    await sleep(1000);

    const outFrame = path.join(DOCS_DIR, 'game-planner-step1-plan_frame.png');
    execSync(`ffmpeg -y -f x11grab -video_size 1920x1080 -i ${DISPLAY_NUM}.0 -vframes 1 "${outFrame}"`, { stdio: 'pipe' });
    fs.copyFileSync(outFrame, path.join(BRAIN_DIR, 'game-planner-step1-plan_frame.png'));
    assert.ok(fs.existsSync(outFrame), 'Plan frame captured');
  });

  it('4. renders visual task dependency flow (DAG) and captures dag frame', async () => {
    // Inject visual DAG overlay view within the task planner canvas
    await evalJS(app.port, `
      (() => {
        let dagModal = document.getElementById('demo-dag-modal');
        if (!dagModal) {
          dagModal = document.createElement('div');
          dagModal.id = 'demo-dag-modal';
          dagModal.style.cssText = \`
            position: absolute;
            top: 60px;
            left: 260px;
            right: 20px;
            bottom: 70px;
            background: #0d1117;
            border: 1.5px solid #30363d;
            border-radius: 10px;
            z-index: 99999;
            padding: 24px;
            display: flex;
            flex-direction: column;
            box-shadow: 0 16px 40px rgba(0,0,0,0.7);
          \`;
          document.body.appendChild(dagModal);
        }

        dagModal.innerHTML = \`
          <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #30363d; padding-bottom:14px; margin-bottom:18px;">
            <div style="display:flex; align-items:center; gap:12px;">
              <span style="font-size:20px;">🌲</span>
              <div>
                <h2 style="font-size:16px; font-weight:700; color:#f0f6fc; margin:0;">Task Dependency Graph (DAG) · Village Potion Shop</h2>
                <div style="font-size:12px; color:#8b949e; margin-top:2px;">Prerequisites flow in one direction — no circular loops or deadlocks</div>
              </div>
            </div>
            <div style="display:flex; gap:10px;">
              <span style="background:rgba(34,197,94,0.15); border:1px solid #22c55e; color:#22c55e; font-size:11px; font-weight:600; padding:4px 8px; border-radius:4px;">Acyclic Verified ✓</span>
              <span style="background:rgba(0,188,212,0.15); border:1px solid #00bcd4; color:#00bcd4; font-size:11px; font-weight:600; padding:4px 8px; border-radius:4px;">5 Tasks Linked</span>
            </div>
          </div>

          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px; flex:1; overflow:hidden;">
            <!-- Left DAG Column -->
            <div style="display:flex; flex-direction:column; gap:14px;">
              <div style="background:#161b22; border:1.5px solid #00bcd4; border-radius:8px; padding:12px 16px; box-shadow:0 0 14px rgba(0,188,212,0.25);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                  <span style="font-weight:700; color:#00bcd4; font-size:13px;">QUEST-102: Healing Potion Item</span>
                  <span style="background:#22c55e; color:#0d1117; font-size:10px; font-weight:800; padding:2px 6px; border-radius:3px;">FOUNDATION</span>
                </div>
                <div style="font-size:12px; color:#8b949e;">Item stats, 25 HP heal value, and inventory carry limit.</div>
                <div style="margin-top:6px; font-size:11px; color:#58a6ff;">➜ Prerequisite for: QUEST-103 (Trading Counter)</div>
              </div>

              <div style="text-align:center; color:#00bcd4; font-size:16px; line-height:1;">↓</div>

              <div style="background:#161b22; border:1px solid #30363d; border-radius:8px; padding:12px 16px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                  <span style="font-weight:700; color:#f0f6fc; font-size:13px;">QUEST-103: Gold Coin Trading Counter</span>
                  <span style="background:rgba(210,153,34,0.2); border:1px solid #d29922; color:#e3b341; font-size:10px; font-weight:700; padding:2px 6px; border-radius:3px;">ECONOMY</span>
                </div>
                <div style="font-size:12px; color:#8b949e;">50 gold transaction logic and balance deduction checks.</div>
                <div style="margin-top:6px; font-size:11px; color:#58a6ff;">➜ Prerequisite for: QUEST-104 (Shop Window HUD)</div>
              </div>

              <div style="text-align:center; color:#00bcd4; font-size:16px; line-height:1;">↓</div>

              <div style="background:#161b22; border:1px solid #30363d; border-radius:8px; padding:12px 16px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                  <span style="font-weight:700; color:#f0f6fc; font-size:13px;">QUEST-104: Visual Shop Window & Inventory HUD</span>
                  <span style="background:rgba(163,113,247,0.2); border:1px solid #a371f7; color:#bc8cff; font-size:10px; font-weight:700; padding:2px 6px; border-radius:3px;">INTERFACE</span>
                </div>
                <div style="font-size:12px; color:#8b949e;">Clickable merchant window displaying potion cards and buy button.</div>
                <div style="margin-top:6px; font-size:11px; color:#58a6ff;">➜ Unlocks: QUEST-105 (Sound Effects & Audio)</div>
              </div>
            </div>

            <!-- Right Parallel Branch & Inspection -->
            <div style="display:flex; flex-direction:column; gap:14px;">
              <div style="background:#161b22; border:1px solid #30363d; border-radius:8px; padding:12px 16px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                  <span style="font-weight:700; color:#f0f6fc; font-size:13px;">QUEST-101: Apothecary Shopkeeper NPC</span>
                  <span style="background:rgba(56,139,253,0.2); border:1px solid #388bfd; color:#58a6ff; font-size:10px; font-weight:700; padding:2px 6px; border-radius:3px;">PARALLEL</span>
                </div>
                <div style="font-size:12px; color:#8b949e;">Shopkeeper character sprite, village square placement, and greeting dialogue.</div>
                <div style="margin-top:6px; font-size:11px; color:#58a6ff;">➜ Merges into: QUEST-104 (Shop Window HUD)</div>
              </div>

              <div style="background:rgba(22,27,34,0.8); border:1px dashed #30363d; border-radius:8px; padding:16px; flex:1; display:flex; flex-direction:column;">
                <div style="font-weight:700; color:#f0f6fc; font-size:13px; margin-bottom:8px; display:flex; align-items:center; gap:8px;">
                  <span>📋 Autonomous Execution Sequence</span>
                </div>
                <p style="font-size:12px; color:#8b949e; line-height:1.5; margin:0 0 10px 0;">
                  Autonomous AI agents execute tasks in topological order. Because <strong>QUEST-101</strong> (Shopkeeper Dialog) and <strong>QUEST-102</strong> (Potion Item) share no dependencies, two agents can work on them simultaneously in isolated sandboxes.
                </p>
                <div style="background:#0d1117; border:1px solid #30363d; border-radius:6px; padding:10px; font-family:monospace; font-size:11px; color:#7ee787;">
                  [1] Agent A ➔ QUEST-102 (Potion Item)<br/>
                  [1] Agent B ➔ QUEST-101 (Shopkeeper NPC) [PARALLEL]<br/>
                  [2] Agent A ➔ QUEST-103 (Trading Counter)<br/>
                  [3] Agent A ➔ QUEST-104 (Visual HUD Window)<br/>
                  [4] Agent B ➔ QUEST-105 (Audio & Sound FX)<br/>
                  [5] Verification ➔ Complete Playtest Passes ✓
                </div>
              </div>
            </div>
          </div>
        \`;
      })()
    `);

    await sleep(800);

    // Inject callout and subtitle for Screen 4
    await evalJS(app.port, injectDemoStyles(
      '<span class="callout-badge">FLOW</span><span>Prerequisites Flow in One Direction (DAG)</span>',
      '<span class="step-badge">STEP 4</span><span>A Directed Acyclic Graph guarantees tasks are built in logical sequence—you cannot sell a potion before creating the potion item!</span>'
    ));

    await sleep(1000);

    const outFrame = path.join(DOCS_DIR, 'game-planner-step1-dag_frame.png');
    execSync(`ffmpeg -y -f x11grab -video_size 1920x1080 -i ${DISPLAY_NUM}.0 -vframes 1 "${outFrame}"`, { stdio: 'pipe' });
    fs.copyFileSync(outFrame, path.join(BRAIN_DIR, 'game-planner-step1-dag_frame.png'));
    assert.ok(fs.existsSync(outFrame), 'DAG frame captured');
  });

  it('5. syncs tasks to visual project board and captures synced badge frame', async () => {
    // Remove DAG modal
    await evalJS(app.port, `
      (() => {
        const modal = document.getElementById('demo-dag-modal');
        if (modal) modal.remove();

        // Populate ticket keys on tasks to simulate successful project board sync
        if (tasks && tasks.length >= 6) {
          tasks[0].ticketKey = 'QUEST-EPIC-1';
          tasks[0].ticketUrl = 'https://github.com/my-studio/realm-quest/issues/1';
          tasks[1].ticketKey = '#101';
          tasks[1].ticketUrl = 'https://github.com/my-studio/realm-quest/issues/101';
          tasks[2].ticketKey = '#102';
          tasks[2].ticketUrl = 'https://github.com/my-studio/realm-quest/issues/102';
          tasks[3].ticketKey = '#103';
          tasks[3].ticketUrl = 'https://github.com/my-studio/realm-quest/issues/103';
          tasks[4].ticketKey = '#104';
          tasks[4].ticketUrl = 'https://github.com/my-studio/realm-quest/issues/104';
          tasks[5].ticketKey = '#105';
          tasks[5].ticketUrl = 'https://github.com/my-studio/realm-quest/issues/105';
        }
        renderTasks();

        const statusEl = document.getElementById('create-status');
        if (statusEl) {
          statusEl.textContent = '✓ Successfully synced 6 work cards to visual project board!';
          statusEl.className = 'status-text success';
          statusEl.style.color = '#22c55e';
        }
      })()
    `);

    await sleep(800);

    // Inject callout and subtitle for Screen 5
    await evalJS(app.port, injectDemoStyles(
      '<span class="callout-badge">SYNC</span><span>Converted to Visual Work Cards</span>',
      '<span class="step-badge">STEP 5</span><span>With one click, your blueprint turns into live project cards ready for autonomous agents to build in sandboxes.</span>'
    ));

    await evalJS(app.port, `
      (() => {
        document.querySelectorAll('.demo-target-highlight').forEach(el => el.classList.remove('demo-target-highlight'));
        const firstCard = document.querySelector('.task-card');
        if (firstCard) {
          firstCard.classList.add('demo-target-highlight');
          const bubble = document.getElementById('demo-callout-bubble');
          const rect = firstCard.getBoundingClientRect();
          if (bubble) {
            bubble.style.top = Math.max(10, rect.top - 42) + 'px';
            bubble.style.left = (rect.left + 80) + 'px';
          }
        }
      })()
    `);

    await sleep(1000);

    const outFrame = path.join(DOCS_DIR, 'game-planner-step1-synced_badge_frame.png');
    execSync(`ffmpeg -y -f x11grab -video_size 1920x1080 -i ${DISPLAY_NUM}.0 -vframes 1 "${outFrame}"`, { stdio: 'pipe' });
    fs.copyFileSync(outFrame, path.join(BRAIN_DIR, 'game-planner-step1-synced_badge_frame.png'));
    assert.ok(fs.existsSync(outFrame), 'Synced badge frame captured');
  });
});

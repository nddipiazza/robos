/**
 * Shared demo runner — takes a demo config and produces:
 *   <out>/<slug>.webm          — silent screen capture
 *   <out>/<slug>.vtt           — captions
 *   <out>/<slug>-audio.wav     — narration timeline
 *   <out>/<slug>-final.webm    — muxed video+audio+captions
 *   <out>/cue-audio/cue-NN.wav — per-cue narration
 *
 * Config shape:
 *   {
 *     slug:        'task-board',
 *     appId:       'task-board',
 *     windowTitle: 'RobOS Task Board',
 *     scenario:    scenarios['issue-manager-github'],
 *     prelaunch:   async (app) => {}   // optional; e.g. seed files or navigate
 *     script:      [ { narration, js, minHold }, ... ]
 *     env:         { ROBOS_DEMO_SHOW: '1' } // optional env overrides
 *   }
 */
'use strict';

const path = require('path');
const fs   = require('fs');

const { launchApp, killApp } = require('./harness');
const { evalJS }             = require('./snapshot');
const {
  findWindowGeometry, startRecording, stopRecording,
  createCaptionTrack, writeVttFile,
} = require('./recorder');
const {
  synthesizeCue, getAudioDurationMs, buildTimelineAudio, muxVideoAudio,
} = require('./narrator');

const BREATHE_MS = 600;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function runDemo(config) {
  const {
    slug, appId, windowTitle, scenario, script,
    audio = false,
    prelaunch = async () => {},
    env = {},
    outRoot = path.join(__dirname, '..', 'run', 'demos'),
    postSettle = 1200,
  } = config;

  const outDir = path.join(outRoot, slug);
  fs.mkdirSync(outDir, { recursive: true });
  const outVideo   = path.join(outDir, `${slug}.webm`);
  const outCaption = path.join(outDir, `${slug}.vtt`);
  const outAudio   = path.join(outDir, `${slug}-audio.wav`);
  const outFinal   = path.join(outDir, `${slug}-final.webm`);
  const cueAudioDir = path.join(outDir, 'cue-audio');

  for (const [k, v] of Object.entries(env)) process.env[k] = v;

  const cueAudio = [];
  if (audio) {
    console.log(`[${slug}] Pre-synthesizing narration...`);
    fs.rmSync(cueAudioDir, { recursive: true, force: true });
    fs.mkdirSync(cueAudioDir, { recursive: true });
    for (let i = 0; i < script.length; i++) {
      const wav = path.join(cueAudioDir, `cue-${String(i).padStart(2, '0')}.wav`);
      process.stdout.write(`  [tts ${i+1}/${script.length}]\r`);
      await synthesizeCue(script[i].narration, wav);
      cueAudio.push({ wav, durationMs: getAudioDurationMs(wav) });
    }
    process.stdout.write('\n');
    cueAudio.forEach((a, i) => console.log(`    cue ${i+1}: ${(a.durationMs/1000).toFixed(2)}s`));
  }

  // Preserve scenario.name (used by sandbox stubs for scenario-aware behavior).
  // Only fall back to 'demo' when the scenario object has no explicit name.
  const app = await launchApp(appId, { name: 'demo', ...scenario });
  let rec = null;
  try {
    await prelaunch(app);
    await sleep(postSettle);

    // Inject visual overlay system into the renderer
    try {
      await evalJS(app.port, `
        (() => {
          if (document.getElementById('robos-demo-overlay-root')) return;

          const style = document.createElement('style');
          style.id = 'robos-demo-overlay-style';
          style.textContent = \`
            #robos-demo-overlay-root {
              position: fixed;
              top: 0;
              left: 0;
              width: 100vw;
              height: 100vh;
              pointer-events: none;
              z-index: 2147483640;
              overflow: hidden;
            }

            .demo-target-highlight {
              outline: 2px solid #00bcd4 !important;
              outline-offset: 3px !important;
              box-shadow: 0 0 16px rgba(0, 188, 212, 0.7) !important;
              transition: outline 0.25s ease, box-shadow 0.25s ease !important;
            }

            #demo-pointer-cursor {
              position: absolute;
              top: 0;
              left: 0;
              width: 26px;
              height: 26px;
              pointer-events: none;
              z-index: 2147483646;
              transition: transform 0.45s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.3s ease;
              opacity: 0;
              transform: translate(-100px, -100px);
              filter: drop-shadow(0 4px 10px rgba(0,0,0,0.6));
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
              line-height: 1.4;
              padding: 7px 14px;
              max-width: 380px;
              pointer-events: none;
              z-index: 2147483647;
              box-shadow: 0 8px 24px rgba(0, 188, 212, 0.35), 0 2px 8px rgba(0,0,0,0.6);
              backdrop-filter: blur(10px);
              display: flex;
              align-items: center;
              gap: 8px;
              transition: opacity 0.25s ease, transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
              opacity: 0;
              transform: scale(0.92);
            }

            #demo-callout-bubble.active {
              opacity: 1;
              transform: scale(1);
            }

            #demo-callout-bubble .callout-badge {
              background: rgba(0, 188, 212, 0.2);
              border: 1px solid rgba(0, 188, 212, 0.6);
              color: #00bcd4;
              border-radius: 4px;
              font-size: 11px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              padding: 2px 6px;
              white-space: nowrap;
              flex-shrink: 0;
            }

            #demo-callout-bubble .callout-text {
              color: #f0f6fc;
            }

            .demo-ripple-ring {
              position: absolute;
              border-radius: 50%;
              border: 2px solid #00bcd4;
              background: rgba(0, 188, 212, 0.35);
              pointer-events: none;
              z-index: 2147483645;
              transform: translate(-50%, -50%) scale(0.2);
              animation: demoRippleAnim 0.6s cubic-bezier(0.1, 0.8, 0.3, 1) forwards;
            }

            @keyframes demoRippleAnim {
              0% { opacity: 1; transform: translate(-50%, -50%) scale(0.2); }
              100% { opacity: 0; transform: translate(-50%, -50%) scale(2.2); }
            }

            #demo-subtitle-banner {
              position: fixed;
              bottom: 20px;
              left: 50%;
              transform: translateX(-50%) translateY(8px);
              background: rgba(13, 17, 23, 0.95);
              border: 1.5px solid #00bcd4;
              border-radius: 8px;
              color: #f0f6fc;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              font-size: 13px;
              font-weight: 500;
              line-height: 1.4;
              padding: 8px 18px;
              max-width: 85%;
              text-align: center;
              box-shadow: 0 8px 28px rgba(0, 188, 212, 0.35), 0 2px 10px rgba(0,0,0,0.8);
              backdrop-filter: blur(12px);
              z-index: 2147483647;
              opacity: 0;
              transition: opacity 0.25s ease, transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
              pointer-events: none;
            }
            #demo-subtitle-banner.active {
              opacity: 1;
              transform: translateX(-50%) translateY(0);
            }
          \`;
          document.head.appendChild(style);

          const container = document.createElement('div');
          container.id = 'robos-demo-overlay-root';
          container.innerHTML = \`
            <div id="demo-pointer-cursor">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M4 3L11 20L14 13L21 10L4 3Z" fill="#00bcd4" stroke="#ffffff" stroke-width="1.5" stroke-linejoin="round"/>
              </svg>
            </div>
            <div id="demo-callout-bubble">
              <span class="callout-badge" id="demo-callout-badge">ACTION</span>
              <span class="callout-text" id="demo-callout-text">Explanation</span>
            </div>
            <div id="demo-subtitle-banner"></div>
          \`;
          document.body.appendChild(container);

          let currentTargetEl = null;

          window.__demoShowCallout = (selectorOrEl, opts = {}) => {
            const el = typeof selectorOrEl === 'string' ? document.querySelector(selectorOrEl) : selectorOrEl;
            if (!el) return null;

            if (currentTargetEl && currentTargetEl !== el) {
              currentTargetEl.classList.remove('demo-target-highlight');
            }
            currentTargetEl = el;
            el.classList.add('demo-target-highlight');

            if (typeof el.scrollIntoView === 'function') {
              el.scrollIntoView({ behavior: 'instant', block: 'nearest', inline: 'nearest' });
            }
            const rect = el.getBoundingClientRect();
            const cursor = document.getElementById('demo-pointer-cursor');
            const bubble = document.getElementById('demo-callout-bubble');
            const badge = document.getElementById('demo-callout-badge');
            const textEl = document.getElementById('demo-callout-text');

            const targetX = rect.left + rect.width / 2;
            const targetY = rect.top + rect.height / 2;

            if (cursor) {
              cursor.style.opacity = '1';
              cursor.style.transform = \`translate(\${targetX}px, \${targetY}px)\`;
            }

            if (bubble && textEl) {
              const actionType = (opts.actionType || 'INTERACT').toUpperCase();
              badge.textContent = actionType;
              textEl.textContent = opts.text || '';
              bubble.classList.add('active');

              const bubbleHeight = 44;
              const bubbleWidth = 320;
              let top;

              const openMenu = document.querySelector('.ctx-menu, .window-picker-menu');
              if (openMenu) {
                const mRect = openMenu.getBoundingClientRect();
                if (mRect.top > bubbleHeight + 16) {
                  top = mRect.top - bubbleHeight - 10;
                } else {
                  top = Math.max(10, mRect.top);
                }
              } else if (rect.top > bubbleHeight + 16) {
                top = rect.top - bubbleHeight - 10;
              } else if (rect.bottom + bubbleHeight + 16 < window.innerHeight) {
                top = rect.bottom + 10;
              } else {
                top = Math.max(10, rect.top);
              }

              const left = Math.max(16, Math.min(window.innerWidth - bubbleWidth - 24, targetX - (bubbleWidth / 3)));
              bubble.style.top = \`\${top}px\`;
              bubble.style.left = \`\${left}px\`;
            }

            return { x: targetX, y: targetY };
          };

          window.__demoTriggerRipple = (x, y) => {
            const ripple = document.createElement('div');
            ripple.className = 'demo-ripple-ring';
            ripple.style.width = '36px';
            ripple.style.height = '36px';
            ripple.style.left = \`\${x}px\`;
            ripple.style.top = \`\${y}px\`;
            document.getElementById('robos-demo-overlay-root')?.appendChild(ripple);
            setTimeout(() => ripple.remove(), 700);
          };

          window.__demoClearCallout = () => {
            if (currentTargetEl) {
              currentTargetEl.classList.remove('demo-target-highlight');
              currentTargetEl = null;
            }
            const bubble = document.getElementById('demo-callout-bubble');
            if (bubble) bubble.classList.remove('active');
            const cursor = document.getElementById('demo-pointer-cursor');
            if (cursor) cursor.style.opacity = '0';
          };
        })()
      `);
    } catch(_) {}

    let geom;
    if (config.fullDesktop) {
      const disp = process.env.ROBOS_DISPLAY || process.env.DISPLAY || ':99';
      geom = { x: 0, y: 0, w: 1920, h: 1080, display: disp };
      console.log(`[${slug}] full desktop: ${geom.w}x${geom.h} @ (${geom.x},${geom.y})`);
    } else {
      geom = await findWindowGeometry(windowTitle);
      console.log(`[${slug}] window: ${geom.w}x${geom.h} @ (${geom.x},${geom.y})`);
    }

    rec = startRecording({ geometry: geom, outPath: outVideo });
    const captions = createCaptionTrack(rec);
    await sleep(500);

    const cueStartMs = [];
    for (let i = 0; i < script.length; i++) {
      const {
        narration, js, target, action = 'click', callout, value,
        minHold = 2500,
      } = script[i];
      process.stdout.write(`  [cue ${i+1}/${script.length}] ${narration.slice(0, 56)}...\n`);

      // Ensure demo window is raised on Linux X11
      if (process.platform === 'linux' && process.env.DISPLAY) {
        try {
          const { exec: execCmd } = require('child_process');
          execCmd(`wmctrl -r "${windowTitle}" -b add,above,sticky || xdotool search --name "${windowTitle}" windowraise 2>/dev/null`, { env: process.env }, () => {});
        } catch (_) {}
      }

      // Update bottom text narration banner
      try {
        await evalJS(app.port, `
          (() => {
            const sub = document.getElementById('demo-subtitle-banner');
            if (sub) {
              sub.innerHTML = '<span style="background:#00bcd4; color:#0d1117; font-size:11px; font-weight:800; padding:3px 8px; border-radius:4px; text-transform:uppercase; letter-spacing:0.5px; flex-shrink:0;">STEP ${i + 1}</span> <span style="color:#f0f6fc; font-size:13px; font-weight:500;">' + ${JSON.stringify(narration)} + '</span>';
              sub.classList.add('active');
            }
          })()
        `);
      } catch(_) {}

      // Targeted Element Mouseover Callout & Visual Action
      if (target) {
        try {
          const calloutText = callout || narration;
          const coords = await evalJS(app.port, `
            (() => {
              return window.__demoShowCallout(${JSON.stringify(target)}, {
                text: ${JSON.stringify(calloutText)},
                actionType: ${JSON.stringify(action)},
              });
            })()
          `);

          // Hold briefly so viewer sees the narration callout on top of the web element
          await sleep(500);

          // Trigger interaction & click ripple
          if (coords && coords.x !== undefined) {
            await evalJS(app.port, `
              (() => {
                window.__demoTriggerRipple(${coords.x}, ${coords.y});
                const el = document.querySelector(${JSON.stringify(target)});
                if (el) {
                  if (${JSON.stringify(action)} === 'click') {
                    el.click();
                  } else if (${JSON.stringify(action)} === 'contextmenu' || ${JSON.stringify(action)} === 'rightclick') {
                    el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
                  } else if (${JSON.stringify(action)} === 'type') {
                    el.focus();
                    if (${JSON.stringify(value !== undefined)}) {
                      el.value = ${JSON.stringify(value || '')};
                      el.dispatchEvent(new Event('input', { bubbles: true }));
                      el.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                  } else if (${JSON.stringify(action)} === 'hover') {
                    el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
                    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
                  }
                }
              })()
            `);
          }
        } catch(_) {}
      }

      if (script[i].actionFn || (typeof script[i].action === 'function')) {
        try { await (script[i].actionFn || script[i].action)(); } catch(e) { console.error(e); }
      }
      if (js) await evalJS(app.port, js);
      const startMs = Date.now() - rec.startedAt;
      captions.add(narration);
      cueStartMs.push(startMs);
      const hold = audio && cueAudio[i]
        ? Math.max(minHold, cueAudio[i].durationMs + BREATHE_MS)
        : minHold;
      await sleep(hold);

      // Clear callout/highlight before next cue
      if (target) {
        try {
          await evalJS(app.port, `(() => { window.__demoClearCallout(); })()`);
        } catch(_) {}
      }
    }

    const cues = captions.finalize();
    const result = await stopRecording(rec);
    rec = null;
    writeVttFile(cues, outCaption);
    console.log(`[${slug}] wrote ${result.outPath}  (${(result.durationMs/1000).toFixed(1)}s)`);

    if (audio && cueAudio.length > 0) {
      const timelineCues = cueAudio.map((a, i) => ({ wav: a.wav, startMs: cueStartMs[i] }));
      buildTimelineAudio(timelineCues, outAudio, result.durationMs);
      muxVideoAudio(outVideo, outAudio, outFinal, { captionPath: outCaption });
    } else {
      muxVideoAudio(outVideo, null, outFinal, { captionPath: outCaption });
    }
    console.log(`[${slug}] wrote ${outFinal}`);

    // ── Archive Walkthrough to ~/.robos/development/walkthroughs/<slug> ──────────
    const archiveRoot = path.join(process.env.HOME || require('os').homedir(), '.robos', 'development', 'walkthroughs', slug);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const historyDir = path.join(archiveRoot, 'history', timestamp);
    try {
      fs.mkdirSync(archiveRoot, { recursive: true });
      fs.mkdirSync(historyDir, { recursive: true });

      // Copy latest files
      const latestVideo = path.join(archiveRoot, `${slug}-final.webm`);
      const latestVtt   = path.join(archiveRoot, `${slug}.vtt`);
      fs.copyFileSync(outFinal, latestVideo);
      fs.copyFileSync(outCaption, latestVtt);

      // Copy to history snapshot
      fs.copyFileSync(outFinal, path.join(historyDir, `${slug}-final.webm`));
      fs.copyFileSync(outCaption, path.join(historyDir, `${slug}.vtt`));

      // Generate markdown summary
      const summaryMd = [
        `# Walkthrough Archive: ${slug}`,
        ``,
        `- **Date**: ${new Date().toISOString()}`,
        `- **App ID**: \`${appId}\``,
        `- **Window Title**: \`${windowTitle}\``,
        `- **Duration**: ${(result.durationMs / 1000).toFixed(1)}s`,
        `- **Audio Track**: ${audio ? 'Enabled' : 'Disabled (Text-Narrated HUD)'}`,
        `- **Video Path**: \`${latestVideo}\``,
        `- **Captions Path**: \`${latestVtt}\``,
        ``,
        `## Steps & Script Transcript`,
        ``,
        `| # | Visual Action | Text Narration |`,
        `|---|---------------|----------------|`,
        ...script.map((s, idx) => `| **Step ${idx + 1}** | \`${s.callout || s.action || 'view'}\` | ${s.narration} |`),
        ``,
      ].join('\n');

      fs.writeFileSync(path.join(archiveRoot, 'walkthrough.md'), summaryMd);
      fs.writeFileSync(path.join(historyDir, 'walkthrough.md'), summaryMd);
      console.log(`[${slug}] archived walkthrough to ${archiveRoot}`);
    } catch (archiveErr) {
      console.warn(`[${slug}] Warning: Failed to archive walkthrough:`, archiveErr.message);
    }

    return { outDir, outVideo, outCaption, outAudio: audio ? outAudio : null, outFinal, durationMs: result.durationMs, cues, archiveDir: archiveRoot };
  } catch (err) {
    if (rec) await stopRecording(rec).catch(() => {});
    throw err;
  } finally {
    await killApp(app);
  }
}

module.exports = { runDemo };

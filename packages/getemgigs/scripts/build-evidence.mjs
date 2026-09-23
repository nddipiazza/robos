#!/usr/bin/env node
// RobOS evidence video builder for Get 'Em Gigs Cucumber E2E runs.
//
// For every evidence/<scenario>/timeline.json produced by the Cucumber hooks it renders:
//   1. a Cucumber scenario splash card intro (RobOS QA overlay style)
//   2. a 1920x1080 composite where every actor's real phone recording of getemgigs.com is
//      aligned on a shared wall clock, framed by a step HUD, a step timeline and a moving playhead
// and then concatenates all scenarios into one reel.
//
// Usage: node scripts/build-evidence.mjs [evidenceDir]

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';

const EVIDENCE = path.resolve(process.argv[2] || 'evidence');
const W = 1920;
const H = 1080;
const FPS = 30;
const SPLASH_SEC = 5;
const LEFT_W = 600;
const TIMELINE_Y = 1000;
const TIMELINE_X0 = 40;
const TIMELINE_X1 = W - 40;
const PHONE_H = 860;
const PHONE_W = Math.round((PHONE_H * 390) / 844 / 2) * 2; // keep even
const FFMPEG = process.env.FFMPEG || 'ffmpeg';

const KW_COLORS = { GIVEN: '#38bdf8', WHEN: '#facc15', THEN: '#10b981', AND: '#a855f7' };

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}
function mmss(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
function ff(args, label) {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: ['ignore', 'inherit', 'inherit'] });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${label}`);
}

const BASE_CSS = `
  *{box-sizing:border-box} body{margin:0;width:${W}px;height:${H}px;overflow:hidden;
  font-family:'Inter','Segoe UI','DejaVu Sans',Arial,sans-serif;color:#e2e8f0;
  background:radial-gradient(900px 500px at 80% 0%,rgba(255,61,127,.20),transparent 60%),radial-gradient(800px 500px at 0% 100%,rgba(0,188,212,.16),transparent 60%),#060a12}
  .mono{font-family:'DejaVu Sans Mono','Consolas',monospace}
`;

function splashHtml(tl) {
  const passed = tl.steps.filter((s) => s.status === 'PASSED').length;
  const dur = mmss(tl.end - tl.start);
  const date = new Date(tl.start).toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'medium', timeStyle: 'short' });
  const status = tl.status === 'PASSED' ? '✅ PASSED' : `❌ ${tl.status}`;
  return `<!doctype html><html><head><style>${BASE_CSS}
  .back{position:fixed;inset:0;display:flex;align-items:center;justify-content:center}
  .card{width:1480px;background:linear-gradient(145deg,rgba(13,22,38,.97),rgba(6,11,20,.99));border:2px solid rgba(0,188,212,.6);
    box-shadow:0 0 70px rgba(0,188,212,.3),0 30px 60px rgba(0,0,0,.8);border-radius:22px;padding:56px 68px}
  .head{display:flex;justify-content:space-between;align-items:center;margin-bottom:18px}
  .cat{font-size:20px;font-weight:800;letter-spacing:2.4px;text-transform:uppercase;color:#38bdf8}
  .tags{display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end;max-width:640px}
  .tag{font-size:17px;font-weight:700;padding:5px 12px;border-radius:6px;background:rgba(0,188,212,.15);color:#00bcd4;border:1px solid rgba(0,188,212,.35)}
  .feat{font-size:22px;color:#ff7aa8;font-weight:800;margin:0 0 10px}
  h1{font-size:44px;font-weight:900;color:#facc15;margin:0 0 18px;line-height:1.25;text-shadow:0 2px 14px rgba(250,204,21,.25)}
  hr{border:0;height:2px;background:linear-gradient(90deg,#00bcd4,rgba(0,188,212,.4) 60%,transparent);margin:18px 0 24px}
  p{font-size:22px;color:#cbd5e1;line-height:1.6;margin:0 0 30px}
  .pills{display:flex;flex-wrap:wrap;gap:14px}
  .pill{font-size:19px;font-weight:700;padding:10px 20px;border-radius:30px}
  .c{background:rgba(0,188,212,.12);border:1px solid #00bcd4;color:#38bdf8}
  .g{background:rgba(16,185,129,.12);border:1px solid #10b981;color:#34d399}
  .o{background:rgba(245,158,11,.12);border:1px solid #f59e0b;color:#fbbf24}
  .p{background:rgba(168,85,247,.12);border:1px solid #a855f7;color:#c084fc}
  .brand{position:fixed;left:60px;bottom:40px;font-size:18px;color:#64748b;font-weight:700;letter-spacing:1px}
  </style></head><body><div class="back"><div class="card">
  <div class="head"><span class="cat">🎸 GET ’EM GIGS — BDD CUCUMBER E2E · ROBOS PROOF-OF-WORK</span>
  <div class="tags">${tl.tags.map((t) => `<span class="tag mono">${esc(t)}</span>`).join('')}</div></div>
  <div class="feat">Feature: ${esc(tl.feature)}</div>
  <h1>Scenario: ${esc(tl.scenario)}</h1><hr>
  <p>${esc(tl.featureDescription)}</p>
  <div class="pills">
    <span class="pill c">🌐 Target: ${esc(tl.baseUrl)}</span>
    <span class="pill p">📱 ${tl.actors.length ? `${tl.actors.length} real phone session${tl.actors.length > 1 ? 's' : ''}: ${tl.actors.map((a) => esc(a.name)).join(', ')}` : 'API-level checks'}</span>
    <span class="pill g">${status} · ${passed}/${tl.steps.length} steps · ${dur}</span>
    <span class="pill o">🕒 Recorded ${esc(date)} CT</span>
  </div></div></div>
  <div class="brand">RobOS · AI-First SDLC · Video Proof-of-Work</div></body></html>`;
}

function layoutActors(n) {
  const areaX = LEFT_W + 20;
  const areaW = W - areaX - 40;
  const gap = 80;
  const total = n * PHONE_W + (n - 1) * gap;
  const x0 = areaX + Math.round((areaW - total) / 2);
  return Array.from({ length: n }, (_, i) => ({ x: x0 + i * (PHONE_W + gap), y: 118 }));
}

function chromeHtml(tl, idx, t0, T, slots) {
  const step = tl.steps[idx];
  const color = KW_COLORS[step.keyword] || KW_COLORS.AND;
  const items = tl.steps
    .map((s, i) => {
      const state = i < idx ? 'done' : i === idx ? 'now' : 'next';
      const mark = s.status === 'FAILED' ? '✖' : i < idx ? '✔' : i === idx ? '▶' : '';
      return `<li class="${state}"><span class="t mono">+${mmss(s.start - t0)}</span><span class="kw" style="color:${KW_COLORS[s.keyword]}">${s.keyword}</span><span class="tx">${esc(s.text)}</span><span class="mk">${mark}</span></li>`;
    })
    .join('');
  const phones = tl.actors
    .map((a, i) => {
      const s = slots[i];
      const active = step.actors.includes(a.name);
      return `<div class="slot ${active ? 'active' : ''}" style="left:${s.x - 8}px;top:${s.y - 8}px;width:${PHONE_W + 16}px;height:${PHONE_H + 16}px"></div>
      <div class="label ${active ? 'active' : ''}" style="left:${s.x}px;top:${s.y - 46}px;width:${PHONE_W}px">📱 ${esc(a.name)}${a.band ? ` · ${esc(a.band)}` : ''}${active ? ' <b>● ACTING</b>' : ''}</div>`;
    })
    .join('');
  const apiEntries = tl.actors.length ? [] : tl.steps.slice(0, idx + 1).flatMap((s) => s.api || []).slice(-9);
  const api = tl.actors.length
    ? ''
    : `<div class="console"><div class="ch">⌨ Live API calls → ${esc(tl.baseUrl)}</div>${apiEntries
        .map(
          (e) =>
            `<div class="ce"><span class="m">${esc(e.method)}</span> <span class="u">${esc(e.url)}</span> <span class="st ${e.status < 400 ? 'ok' : 'bad'}">${e.status}</span>${e.request?.headers?.origin ? ` <span class="h">Origin: ${esc(e.request.headers.origin)}</span>` : ''}${e.request?.website ? ' <span class="h">website=(honeypot filled)</span>' : ''}<div class="r">${esc(JSON.stringify(e.response).slice(0, 150))}</div></div>`,
        )
        .join('')}</div>`;
  const ticks = tl.steps
    .map((s, i) => {
      const x = TIMELINE_X0 + ((s.start - t0) / T) * (TIMELINE_X1 - TIMELINE_X0);
      const w = Math.max(3, ((s.end - s.start) / T) * (TIMELINE_X1 - TIMELINE_X0) - 3);
      return `<div class="seg ${i === idx ? 'cur' : i < idx ? 'past' : ''}" style="left:${x}px;width:${w}px;background:${KW_COLORS[s.keyword]}"></div>`;
    })
    .join('');
  return `<!doctype html><html><head><style>${BASE_CSS}
  body{background:#060a12}
  .left{position:absolute;left:0;top:0;width:${LEFT_W}px;height:${TIMELINE_Y - 30}px;padding:26px 26px 0 30px;border-right:1px solid #1e293b;background:rgba(8,15,28,.9)}
  .brand{font-size:14px;font-weight:800;letter-spacing:2px;color:#38bdf8;text-transform:uppercase}
  .scen{font-size:21px;font-weight:800;color:#facc15;margin:10px 0 14px;line-height:1.3}
  ol{list-style:none;margin:0;padding:0;display:grid;gap:5px}
  li{display:grid;grid-template-columns:62px 58px 1fr 20px;gap:6px;font-size:14.5px;line-height:1.3;padding:6px 8px;border-radius:8px;color:#64748b}
  li.done{color:#94a3b8} li.now{background:rgba(0,188,212,.14);border:1px solid rgba(0,188,212,.55);color:#f8fafc}
  li .kw{font-weight:900;font-size:12.5px;letter-spacing:1px;padding-top:1px} li .t{font-size:12.5px;padding-top:1px} li .mk{color:#10b981}
  .hud{position:absolute;left:${LEFT_W + 30}px;right:30px;top:16px;display:flex;align-items:center;gap:14px;background:rgba(8,15,28,.96);
    border:1.5px solid #00bcd4;box-shadow:0 6px 24px rgba(0,188,212,.35);border-radius:40px;padding:10px 26px;height:56px}
  .badge{font-size:15px;font-weight:900;letter-spacing:1.4px;padding:5px 14px;border-radius:16px;color:#000;flex-shrink:0}
  .hudt{font-size:19px;font-weight:700;color:#f8fafc;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .slot{position:absolute;border-radius:26px;border:3px solid #1e293b;background:#0b1020}
  .slot.active{border-color:#00bcd4;box-shadow:0 0 38px rgba(0,188,212,.55)}
  .label{position:absolute;font-size:17px;font-weight:800;color:#94a3b8;text-align:center;white-space:nowrap}
  .label.active{color:#f8fafc} .label b{color:#00bcd4;font-size:13px;letter-spacing:1px}
  .console{position:absolute;left:${LEFT_W + 40}px;right:40px;top:100px;bottom:${H - TIMELINE_Y + 40}px;background:#020617;border:1px solid #1e293b;border-radius:16px;padding:22px 26px;font-family:'DejaVu Sans Mono',monospace;overflow:hidden}
  .ch{color:#38bdf8;font-weight:800;font-size:18px;margin-bottom:14px}
  .ce{font-size:16px;color:#e2e8f0;margin-bottom:12px;border-bottom:1px dashed #1e293b;padding-bottom:10px}
  .m{color:#c084fc;font-weight:800} .u{color:#e2e8f0} .st{font-weight:900;padding:1px 8px;border-radius:6px} .st.ok{background:#064e3b;color:#34d399} .st.bad{background:#4c0519;color:#fda4af}
  .h{color:#fbbf24} .r{color:#64748b;font-size:14px;margin-top:4px}
  .tl{position:absolute;left:${TIMELINE_X0}px;right:${W - TIMELINE_X1}px;top:${TIMELINE_Y}px;height:34px;background:#0f172a;border-radius:8px;border:1px solid #1e293b}
  .seg{position:absolute;top:${TIMELINE_Y + 6}px;height:22px;border-radius:5px;opacity:.28}
  .seg.past{opacity:.6} .seg.cur{opacity:1;box-shadow:0 0 14px currentColor}
  .tlabel{position:absolute;left:${TIMELINE_X0}px;top:${TIMELINE_Y - 26}px;font-size:13px;color:#64748b;font-weight:800;letter-spacing:1.5px}
  .tend{position:absolute;right:${W - TIMELINE_X1}px;top:${TIMELINE_Y - 26}px;font-size:13px;color:#64748b}
  </style></head><body>
  <div class="left"><div class="brand">🎸 RobOS E2E Evidence · getemgigs.com</div><div class="scen">${esc(tl.scenario)}</div><ol>${items}</ol></div>
  <div class="hud"><span class="badge" style="background:${color}">${step.keyword}</span><span class="hudt">${esc(step.text)}</span></div>
  ${phones}${api}
  <div class="tlabel">TIMELINE OF EVENTS</div><div class="tend mono">${mmss(T)}</div><div class="tl"></div>${ticks}
  </body></html>`;
}

async function buildScenario(browser, dir) {
  const tl = JSON.parse(fs.readFileSync(path.join(dir, 'timeline.json'), 'utf8'));
  if (!tl.steps.length) return null;
  // Attach band names for labels.
  const out = path.join(dir, 'build');
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const page = await browser.newPage({ viewport: { width: W, height: H } });

  // 1. Splash card.
  await page.setContent(splashHtml(tl), { waitUntil: 'load' });
  const splashPng = path.join(out, 'splash.png');
  await page.screenshot({ path: splashPng });

  // 2. Chrome frames per step on a shared wall clock.
  const t0 = tl.steps[0].start - 400;
  const tEnd = tl.steps.at(-1).end + 800;
  const T = tEnd - t0;
  const slots = layoutActors(tl.actors.length);
  const concat = [];
  for (let i = 0; i < tl.steps.length; i++) {
    await page.setContent(chromeHtml(tl, i, t0, T, slots), { waitUntil: 'load' });
    const png = path.join(out, `step-${String(i).padStart(2, '0')}.png`);
    await page.screenshot({ path: png });
    const segStart = i === 0 ? t0 : tl.steps[i].start;
    const segEnd = i === tl.steps.length - 1 ? tEnd : tl.steps[i + 1].start;
    concat.push(`file '${png}'`, `duration ${((segEnd - segStart) / 1000).toFixed(3)}`);
  }
  concat.push(`file '${path.join(out, `step-${String(tl.steps.length - 1).padStart(2, '0')}.png`)}'`);
  fs.writeFileSync(path.join(out, 'chrome.txt'), concat.join('\n'));
  await page.close();

  // 3. Composite: chrome + aligned phone recordings + playhead.
  const Tsec = (T / 1000).toFixed(3);
  const inputs = ['-f', 'concat', '-safe', '0', '-i', path.join(out, 'chrome.txt')];
  const filters = [`[0:v]fps=${FPS},scale=${W}:${H},format=yuv420p,trim=duration=${Tsec}[base0]`];
  let last = 'base0';
  tl.actors.forEach((a, i) => {
    inputs.push('-i', path.join(dir, a.video));
    const crop = '';
    const offset = Math.max(0, (a.videoStart - t0) / 1000).toFixed(3);
    filters.push(
      `[${i + 1}:v]fps=${FPS},${crop}scale=${PHONE_W}:${PHONE_H}:flags=lanczos,setsar=1,tpad=start_duration=${offset}:start_mode=add:color=0x0b1020,trim=duration=${Tsec},setpts=PTS-STARTPTS[p${i}]`,
      `[${last}][p${i}]overlay=${slots[i].x}:${slots[i].y}:eof_action=repeat[b${i}]`,
    );
    last = `b${i}`;
  });
  filters.push(
    `color=c=0x00e5ff:s=6x46:r=${FPS}[ph]`,
    `[${last}][ph]overlay=x='${TIMELINE_X0}+(t/${Tsec})*${TIMELINE_X1 - TIMELINE_X0}':y=${TIMELINE_Y - 6}:shortest=1[outv]`,
  );
  const composite = path.join(out, 'composite.mp4');
  ff(
    [...inputs, '-filter_complex', filters.join(';'), '-map', '[outv]', '-t', Tsec, '-r', String(FPS), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p', composite],
    `composite ${tl.slug}`,
  );

  // 4. Splash intro clip + concat.
  const splash = path.join(out, 'splash.mp4');
  ff(
    ['-loop', '1', '-t', String(SPLASH_SEC), '-i', splashPng, '-vf', `fps=${FPS},format=yuv420p,fade=t=in:st=0:d=0.5,fade=t=out:st=${SPLASH_SEC - 0.5}:d=0.5`, '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', splash],
    `splash ${tl.slug}`,
  );
  const final = path.join(EVIDENCE, `${tl.slug}.mp4`);
  ff(
    ['-i', splash, '-i', composite, '-filter_complex', '[0:v][1:v]concat=n=2:v=1:a=0[v]', '-map', '[v]', '-c:v', 'libx264', '-preset', 'medium', '-crf', '21', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', final],
    `final ${tl.slug}`,
  );
  ff(['-ss', String(SPLASH_SEC + Math.min(8, T / 2000)), '-i', final, '-frames:v', '1', '-q:v', '3', path.join(EVIDENCE, `${tl.slug}.jpg`)], 'poster');
  console.log(`✔ ${tl.slug}.mp4 (${mmss(T + SPLASH_SEC * 1000)})`);
  return { slug: tl.slug, file: final, tl, durationMs: T + SPLASH_SEC * 1000 };
}

async function main() {
  const dirs = fs
    .readdirSync(EVIDENCE, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(EVIDENCE, d.name, 'timeline.json')))
    .map((d) => path.join(EVIDENCE, d.name))
    .sort((a, b) => path.basename(a).slice(0, 2).localeCompare(path.basename(b).slice(0, 2)) || JSON.parse(fs.readFileSync(path.join(a, 'timeline.json'))).start - JSON.parse(fs.readFileSync(path.join(b, 'timeline.json'))).start);
  if (!dirs.length) throw new Error(`No timeline.json found under ${EVIDENCE}`);
  const browser = await chromium.launch();
  const built = [];
  for (const d of dirs) {
    const r = await buildScenario(browser, d);
    if (r) built.push(r);
  }
  await browser.close();

  // Reel of every scenario.
  const list = path.join(EVIDENCE, 'reel.txt');
  fs.writeFileSync(list, built.map((b) => `file '${b.file}'`).join('\n'));
  const reel = path.join(EVIDENCE, 'getemgigs-e2e-evidence-reel.mp4');
  ff(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', reel], 'reel');
  fs.writeFileSync(
    path.join(EVIDENCE, 'summary.json'),
    JSON.stringify(
      built.map((b) => ({
        slug: b.slug,
        scenario: b.tl.scenario,
        feature: b.tl.feature,
        status: b.tl.status,
        steps: b.tl.steps.map((s) => ({ keyword: s.keyword, text: s.text, status: s.status, atMs: s.start - b.tl.steps[0].start, actors: s.actors })),
        durationMs: b.durationMs,
        recordedAt: new Date(b.tl.start).toISOString(),
        baseUrl: b.tl.baseUrl,
      })),
      null,
      2,
    ),
  );
  console.log(`✔ reel: ${reel}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

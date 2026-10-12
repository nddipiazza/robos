#!/usr/bin/env node
'use strict';
/**
 * Turns a lifecycle recording (raw.mkv + raw.mkv.marks.json + frames/) into the hero:
 *  - hero.mp4 / hero.webm: dead time cut, a captioned progress bar on every step, sped up
 *  - slides/*.jpg + chapters.json: the self-cycling slideshow (captioned snapshots)
 *  - poster.jpg and hero-storyboard.gif (one frame per step)
 *
 *   node compose.js <recordingDir> <outDir> [--slides-only]
 */
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const STEPS = [
  { id: 'task-created', title: 'Task created', who: 'Task Explorer', text: 'The plan becomes tracked issues, with acceptance criteria and test cases' },
  { id: 'task-implemented', title: 'Task implemented', who: 'Task Implementer', text: 'An agent branches, commits and pushes. It does not open a PR' },
  { id: 'review-changes', title: 'Owner reviews the changes', who: 'Code Review Theater', text: 'A diff of the pushed branch, file by file' },
  { id: 'review-evidence', title: 'Owner checks the evidence', who: 'Code Review Theater', text: 'Before and after, captured from real runs of the code' },
  { id: 'review-walkthrough', title: 'Owner takes the walkthrough', who: 'Code Review Theater', text: 'An agent demonstrates each checkpoint while the owner stays in control' },
  { id: 'draft-pr', title: 'Draft PR created', who: 'Code Review Theater', text: 'The description is reviewed first, then published as a draft' },
  { id: 'ci', title: 'Owner watches CI', who: 'Draft PR', text: 'Checks go from pending to passing' },
  { id: 'ready', title: 'Moved to ready for review', who: 'Draft PR', text: 'Only once CI is green, with reviewers requested' },
  { id: 'reviewer-approves', title: 'Reviewer approves', who: 'PR reviewer', text: 'Reads the diff and signs off' },
  { id: 'owner-merges', title: 'Owner merges', who: 'PR author', text: 'The approved PR is merged and shows as Merged' },
  { id: 'post-merge-ci', title: 'Owner watches CI and acts', who: 'Task Explorer', text: 'contract-check fails on main, so a follow-up task is filed. Back to step 1' },
];
const W = 1280, H = 720;
const SPEED = Number(process.env.HERO_SPEED || 1.8);
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');

function barHtml(idx, caption) {
  const seg = STEPS.map((s, i) => `<i class="${i < idx ? 'done' : i === idx ? 'on' : ''}"></i>`).join('');
  const s = STEPS[idx];
  return `<!doctype html><meta charset="utf-8"><style>
  *{box-sizing:border-box}html,body{margin:0;background:transparent;width:${W}px;height:${H}px;overflow:hidden;font-family:'Plus Jakarta Sans','Inter','Segoe UI',system-ui,sans-serif}
  .bar{position:absolute;left:0;right:0;bottom:0;height:132px;padding:18px 28px 0;background:linear-gradient(rgba(7,9,15,0),rgba(7,9,15,.88) 34%,rgba(7,9,15,.97));color:#f1f5f9}
  .track{display:flex;gap:6px;margin-bottom:14px}.track i{flex:1;height:5px;border-radius:3px;background:rgba(148,163,184,.28)}.track i.done{background:#0891b2}.track i.on{background:#00e5ff;box-shadow:0 0 12px #00e5ff}
  .row{display:flex;align-items:center;gap:18px}
  .n{flex:none;width:52px;height:52px;border-radius:50%;background:#00e5ff;color:#04121a;font-weight:800;font-size:23px;display:grid;place-items:center}
  .t{font-size:30px;font-weight:800;letter-spacing:-.02em;line-height:1.1}.who{font-size:15px;color:#00e5ff;font-weight:700;letter-spacing:.06em;text-transform:uppercase;margin-bottom:3px}
  .d{font-size:18px;color:#c4cfdd;margin-top:3px}.of{margin-left:auto;font-size:15px;color:#8b98ad;font-weight:600;white-space:nowrap}
  </style><div class="bar"><div class="track">${seg}</div><div class="row"><div class="n">${idx + 1}</div><div><div class="who">${esc(s.who)}</div><div class="t">${esc(s.title)}</div><div class="d">${esc(caption || s.text)}</div></div><div class="of">Step ${idx + 1} of ${STEPS.length}</div></div></div>`;
}
function noteHtml(text) {
  return `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:transparent;width:${W}px;height:${H}px;overflow:hidden}
  .c{position:absolute;top:16px;right:24px;background:rgba(7,9,15,.92);border:1px solid #1f2a3d;border-radius:10px;padding:12px 18px;font:600 21px 'Fira Code',ui-monospace,monospace;color:#7ee787;box-shadow:0 8px 30px rgba(0,0,0,.5)}.c b{color:#8b98ad;font-weight:600}</style>
  <div class="c"><b>$</b> ${esc(text.replace(/^\$\s*/, ''))}</div>`;
}
function shoot(html, out) {
  const f = out.replace(/\.png$/, '.html');
  fs.writeFileSync(f, html);
  spawnSync(CHROME, ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--default-background-color=00000000',
    `--window-size=${W},${H}`, `--screenshot=${out}`, 'file://' + f], { stdio: 'ignore' });
}
const probe = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }));

/** Walk the marks: kept video segments and slideshow slides, each tagged with step / caption / note. */
function parse(marks) {
  const segs = [], slides = [];
  let step = null, cap = null, note = null, cutting = false, from = null;
  const flush = (t) => { if (step !== null && from !== null && t - from > 0.3) segs.push({ a: from, b: t, step, cap, note }); from = t; };
  for (const m of marks) {
    if (m.type === 'step') { if (!cutting) flush(m.t); step = STEPS.findIndex(s => s.id === m.id); cap = null; note = null; from = cutting ? null : m.t; }
    else if (m.type === 'caption') { if (!cutting) flush(m.t); cap = m.text; }
    else if (m.type === 'note') { if (!cutting) flush(m.t); note = m.text; }
    else if (m.type === 'cut-start') { if (!cutting) flush(m.t); cutting = true; from = null; }
    else if (m.type === 'cut-end') { cutting = false; from = m.t; }
    else if (m.type === 'slide') slides.push({ id: m.id, file: m.file, dwell: m.dwell, step, cap, note });
    else if (m.type === 'end') { if (!cutting) flush(m.t); }
  }
  return { segs, slides };
}

function main(recDir, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const work = path.join(outDir, 'work');
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });
  const raw = path.join(recDir, 'raw.mkv');
  const marks = JSON.parse(fs.readFileSync(raw + '.marks.json', 'utf8'));
  const { segs, slides } = parse(marks);

  const barCache = {}, noteCache = {};
  const bar = (step, cap) => {
    const key = step + '|' + (cap || '');
    if (!barCache[key]) { barCache[key] = path.join(work, `bar-${Object.keys(barCache).length}.png`); shoot(barHtml(step, cap), barCache[key]); }
    return barCache[key];
  };
  const noteImg = (text) => {
    if (!noteCache[text]) { noteCache[text] = path.join(work, `note-${Object.keys(noteCache).length}.png`); shoot(noteHtml(text), noteCache[text]); }
    return noteCache[text];
  };

  // ---- slideshow ---------------------------------------------------------------
  const dest = path.join(outDir, 'slides');
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  const slideRows = slides.map((s, n) => {
    const inputs = ['-i', path.join(recDir, 'frames', s.file), '-i', bar(s.step, s.cap)];
    let chain = `[0:v]scale=${W}:${H}:flags=lanczos[v];[v][1:v]overlay=0:0[o]`, last = 'o';
    if (s.note) { inputs.push('-i', noteImg(s.note)); chain += ';[o][2:v]overlay=0:0[o2]'; last = 'o2'; }
    const file = String(n + 1).padStart(2, '0') + '-' + s.id + '.jpg';
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', chain, '-map', `[${last}]`, '-frames:v', '1', '-q:v', '3', path.join(dest, file)]);
    return { file, step: s.step, dwell: s.dwell, alt: `${STEPS[s.step].title}. ${s.cap || STEPS[s.step].text}` };
  });

  if (process.argv.includes('--slides-only')) {
    const meta = JSON.parse(fs.readFileSync(path.join(outDir, 'chapters.json'), 'utf8'));
    meta.slides = slideRows;
    fs.writeFileSync(path.join(outDir, 'chapters.json'), JSON.stringify(meta, null, 2));
    console.log(`${slideRows.length} slides`);
    return;
  }

  // ---- video -------------------------------------------------------------------
  const parts = [];
  segs.forEach((s, n) => {
    const out = path.join(work, `seg-${String(n).padStart(3, '0')}.mp4`);
    const inputs = ['-ss', s.a.toFixed(3), '-to', s.b.toFixed(3), '-i', raw, '-i', bar(s.step, s.cap)];
    let chain = `[0:v]setpts=PTS/${SPEED},scale=${W}:${H}:flags=lanczos,format=yuv420p[v];[v][1:v]overlay=0:0[o]`, last = 'o';
    if (s.note) { inputs.push('-i', noteImg(s.note)); chain += ';[o][2:v]overlay=0:0[n]'; last = 'n'; }
    const dur = (s.b - s.a) / SPEED;
    // Only fade at step changes; within a step the segments should join seamlessly.
    const first = n === 0 || segs[n - 1].step !== s.step, lastOfStep = n === segs.length - 1 || segs[n + 1].step !== s.step;
    const fades = [first ? 'fade=t=in:st=0:d=0.25' : null, lastOfStep ? `fade=t=out:st=${Math.max(0, dur - 0.25).toFixed(3)}:d=0.25` : null].filter(Boolean);
    chain += `;[${last}]${fades.length ? fades.join(',') : 'null'}[final]`;
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', chain, '-map', '[final]', '-r', '25', '-an',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '27', '-pix_fmt', 'yuv420p', out]);
    parts.push(out);
  });
  const list = path.join(work, 'list.txt');
  fs.writeFileSync(list, parts.map(p => `file '${p}'`).join('\n'));
  const mp4 = path.join(outDir, 'hero.mp4');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', mp4]);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', mp4, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '38', '-row-mt', '1', '-an', path.join(outDir, 'hero.webm')]);

  // Chapter table: when each step starts in the final video.
  let t = 0; const chapters = [];
  segs.forEach((s, n) => {
    if (!chapters.some(c => c.step === s.step)) chapters.push({ step: s.step, id: STEPS[s.step].id, title: STEPS[s.step].title, who: STEPS[s.step].who, text: STEPS[s.step].text, start: Number(t.toFixed(2)) });
    t += probe(parts[n]);
  });
  const duration = probe(mp4);
  fs.writeFileSync(path.join(outDir, 'chapters.json'), JSON.stringify({ duration: Number(duration.toFixed(2)), chapters, slides: slideRows }, null, 2));

  // Poster = the diff slide; storyboard GIF = the first slide of every step.
  fs.copyFileSync(path.join(dest, (slideRows.find(r => /changes-diff/.test(r.file)) || slideRows[0]).file), path.join(outDir, 'poster.jpg'));
  const sdir = path.join(work, 'story');
  fs.mkdirSync(sdir, { recursive: true });
  const firsts = chapters.map(c => slideRows.find(r => r.step === c.step)).filter(Boolean);
  firsts.forEach((r, i) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(dest, r.file), '-vf', 'scale=960:-1', path.join(sdir, `s${String(i).padStart(2, '0')}.png`)]));
  fs.writeFileSync(path.join(sdir, 'list.txt'), firsts.map((_, i) => `file 's${String(i).padStart(2, '0')}.png'\nduration 1.9`).join('\n') + `\nfile 's${String(firsts.length - 1).padStart(2, '0')}.png'`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(sdir, 'list.txt'), '-vf', 'fps=10,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4', '-loop', '0', path.join(outDir, 'hero-storyboard.gif')]);
  console.log(`hero.mp4 ${duration.toFixed(1)}s, ${chapters.length} chapters, ${slideRows.length} slides`);
}
if (require.main === module) main(process.argv[2], process.argv[3]);
module.exports = { STEPS, main, parse };

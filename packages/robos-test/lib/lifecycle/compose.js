#!/usr/bin/env node
'use strict';
/**
 * Turns a lifecycle recording (raw.mkv + raw.mkv.marks.json) into the hero:
 * dead time (app launches) is cut, each step gets a captioned progress bar,
 * and the result is encoded as MP4 + WebM + poster (+ optional GIF).
 *
 *   node compose.js <recordingDir> <outDir>
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
const W = 1280, H = 720, BAR = 132;
const SPEED = Number(process.env.HERO_SPEED || 1.7);
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

function barHtml(idx, note) {
  const seg = STEPS.map((s, i) => `<i class="${i < idx ? 'done' : i === idx ? 'on' : ''}"></i>`).join('');
  const s = STEPS[idx];
  return `<!doctype html><meta charset="utf-8"><style>
  *{box-sizing:border-box}html,body{margin:0;background:transparent;width:${W}px;height:${H}px;overflow:hidden;font-family:'Plus Jakarta Sans','Inter','Segoe UI',system-ui,sans-serif}
  .bar{position:absolute;left:0;right:0;bottom:0;height:${BAR}px;padding:18px 28px 0;background:linear-gradient(rgba(7,9,15,0),rgba(7,9,15,.88) 34%,rgba(7,9,15,.97));color:#f1f5f9}
  .track{display:flex;gap:6px;margin-bottom:14px}.track i{flex:1;height:5px;border-radius:3px;background:rgba(148,163,184,.28)}.track i.done{background:#0891b2}.track i.on{background:#00e5ff;box-shadow:0 0 12px #00e5ff}
  .row{display:flex;align-items:center;gap:18px}
  .n{flex:none;width:52px;height:52px;border-radius:50%;background:#00e5ff;color:#04121a;font-weight:800;font-size:23px;display:grid;place-items:center}
  .t{font-size:30px;font-weight:800;letter-spacing:-.02em;line-height:1.1}.who{font-size:15px;color:#00e5ff;font-weight:700;letter-spacing:.06em;text-transform:uppercase;margin-bottom:3px}
  .d{font-size:18px;color:#c4cfdd;margin-top:3px}.of{margin-left:auto;font-size:15px;color:#8b98ad;font-weight:600}
  </style><div class="bar"><div class="track">${seg}</div><div class="row"><div class="n">${idx + 1}</div><div><div class="who">${s.who}</div><div class="t">${s.title}</div><div class="d">${s.text}</div></div><div class="of">Step ${idx + 1} of ${STEPS.length}</div></div></div>`;
}
function noteHtml(text) {
  return `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:transparent;width:${W}px;height:${H}px;overflow:hidden}
  .c{position:absolute;top:16px;right:24px;background:rgba(7,9,15,.92);border:1px solid #1f2a3d;border-radius:10px;padding:12px 18px;font:600 21px 'Fira Code',ui-monospace,monospace;color:#7ee787;box-shadow:0 8px 30px rgba(0,0,0,.5)}.c b{color:#8b98ad;font-weight:600}</style>
  <div class="c"><b>$</b> ${text.replace(/^\$\s*/, '')}</div>`;
}
function shoot(html, out, w, h) {
  const f = out.replace(/\.png$/, '.html');
  fs.writeFileSync(f, html);
  spawnSync(CHROME, ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--default-background-color=00000000',
    `--window-size=${w},${h}`, `--screenshot=${out}`, 'file://' + f], { stdio: 'ignore' });
}

function main(recDir, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const work = path.join(outDir, 'work');
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });
  const raw = path.join(recDir, 'raw.mkv');
  const marks = JSON.parse(fs.readFileSync(raw + '.marks.json', 'utf8'));

  // Walk the marks into kept segments [a, b] tagged with their step.
  const segs = [];
  let step = null, cutting = false, from = null, note = null;
  const flush = (t) => { if (step !== null && from !== null && t - from > 0.3) segs.push({ a: from, b: t, step, note }); from = t; };
  for (const m of marks) {
    if (m.type === 'step') { if (!cutting) flush(m.t); step = STEPS.findIndex(s => s.id === m.id); from = cutting ? null : m.t; note = null; }
    else if (m.type === 'cut-start') { if (!cutting) flush(m.t); cutting = true; from = null; }
    else if (m.type === 'cut-end') { cutting = false; from = m.t; }
    else if (m.type === 'note') { if (!cutting) flush(m.t); note = m.text; }
    else if (m.type === 'end') { if (!cutting) flush(m.t); }
  }

  const barPng = [];
  STEPS.forEach((_, i) => { const p = path.join(work, `bar-${i}.png`); shoot(barHtml(i), p, W, H); barPng[i] = p; });
  const notePng = {};
  if (process.argv.includes('--slides-only')) {   // refresh slides.json + slides/ without re-encoding the video
    const noteMark = marks.find(m => m.type === 'note');
    const meta = JSON.parse(fs.readFileSync(path.join(outDir, 'chapters.json'), 'utf8'));
    meta.slides = slides(recDir, outDir, work, barPng, noteMark && noteMark.text);
    fs.writeFileSync(path.join(outDir, 'chapters.json'), JSON.stringify(meta, null, 2));
    console.log(`${meta.slides.length} slides`);
    return;
  }
  const parts = [];
  segs.forEach((s, n) => {
    const out = path.join(work, `seg-${String(n).padStart(2, '0')}.mp4`);
    const inputs = ['-ss', s.a.toFixed(3), '-to', s.b.toFixed(3), '-i', raw, '-i', barPng[s.step]];
    let chain = `[0:v]setpts=PTS/${SPEED},scale=${W}:${H}:flags=lanczos,format=yuv420p[v];[v][1:v]overlay=0:0[o]`;
    let last = 'o';
    if (s.note) {
      const np = notePng[s.note] || (notePng[s.note] = path.join(work, `note-${Object.keys(notePng).length}.png`));
      if (!fs.existsSync(np)) shoot(noteHtml(s.note), np, W, H);
      inputs.push('-i', np);
      chain += `;[${last}][2:v]overlay=0:0[n]`; last = 'n';
    }
    const dur = (s.b - s.a) / SPEED;
    chain += `;[${last}]fade=t=in:st=0:d=0.25,fade=t=out:st=${Math.max(0, dur - 0.25).toFixed(3)}:d=0.25[final]`;
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', chain, '-map', '[final]', '-r', '25', '-an',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '27', '-pix_fmt', 'yuv420p', out]);
    parts.push(out);
  });
  const list = path.join(work, 'list.txt');
  fs.writeFileSync(list, parts.map(p => `file '${p}'`).join('\n'));
  const mp4 = path.join(outDir, 'hero.mp4');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', mp4]);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', mp4, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '38', '-row-mt', '1', '-an', path.join(outDir, 'hero.webm')]);
  const dur = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp4], { encoding: 'utf8' }));
  // Chapter table for the page: when each step starts in the final video.
  let t = 0; const chapters = [];
  segs.forEach((s, n) => {
    const d = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', parts[n]], { encoding: 'utf8' }));
    if (!chapters.some(c => c.step === s.step)) chapters.push({ step: s.step, id: STEPS[s.step].id, title: STEPS[s.step].title, who: STEPS[s.step].who, text: STEPS[s.step].text, start: Number(t.toFixed(2)) });
    t += d;
  });
  fs.writeFileSync(path.join(outDir, 'chapters.json'), JSON.stringify({ duration: Number(dur.toFixed(2)), chapters }, null, 2));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String((chapters.find(c => c.id === 'review-changes')?.start || 18) + 3.2), '-i', mp4, '-frames:v', '1', '-q:v', '3', path.join(outDir, 'poster.jpg')]);
  storyboard(mp4, chapters, outDir, work);
  const noteMark = marks.find(m => m.type === 'note');
  const slideRows = slides(recDir, outDir, work, barPng, noteMark && noteMark.text);
  const meta = JSON.parse(fs.readFileSync(path.join(outDir, 'chapters.json'), 'utf8'));
  meta.slides = slideRows;
  fs.writeFileSync(path.join(outDir, 'chapters.json'), JSON.stringify(meta, null, 2));
  console.log(`hero.mp4 ${dur.toFixed(1)}s, ${chapters.length} chapters`);
}
// Slides for the self-cycling hero: real frames from the recording, captioned like the video.
const SLIDES = [
  { step: 'task-created', frame: 'planner-created' },
  { step: 'task-implemented', frame: 'implementer-done' },
  { step: 'review-changes', frame: 'changes' },
  { step: 'review-evidence', frame: 'evidence' },
  { step: 'review-walkthrough', frame: 'walkthrough-2' },
  { step: 'draft-pr', frame: 'draft-pr' },
  { step: 'ci', frame: 'ci-pending' },
  { step: 'ci', frame: 'ci-passed' },
  { step: 'ready', frame: 'ready-dialog' },
  { step: 'ready', frame: 'in-review' },
  { step: 'reviewer-approves', frame: 'reviewer-approved' },
  { step: 'owner-merges', frame: 'merged', note: true },
  { step: 'post-merge-ci', frame: 'post-merge-ci-failed' },
  { step: 'post-merge-ci', frame: 'followup-created' },
];

function slides(recDir, outDir, work, barPng, noteText) {
  const framesDir = path.join(recDir, 'frames');
  const dest = path.join(outDir, 'slides');
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  const rows = [];
  SLIDES.forEach((sl, n) => {
    const idx = STEPS.findIndex(x => x.id === sl.step);
    const src = fs.readdirSync(framesDir).find(f => f.replace(/^\d+-/, '') === sl.frame + '.png');
    if (!src) throw new Error('Missing frame ' + sl.frame);
    const inputs = ['-i', path.join(framesDir, src), '-i', barPng[idx]];
    let chain = `[0:v]scale=${W}:${H}:flags=lanczos[v];[v][1:v]overlay=0:0[o]`;
    if (sl.note && noteText) {
      const np = path.join(work, 'note-slide.png');
      shoot(noteHtml(noteText), np, W, H);
      inputs.push('-i', np);
      chain += ';[o][2:v]overlay=0:0[o2]';
    }
    const file = String(n + 1).padStart(2, '0') + '-' + sl.frame + '.jpg';
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', chain, '-map', sl.note && noteText ? '[o2]' : '[o]', '-frames:v', '1', '-q:v', '3', path.join(dest, file)]);
    rows.push({ file, step: idx, alt: `${STEPS[idx].title}. ${STEPS[idx].text}` });
  });
  return rows;
}

/** One captioned frame per step, as a small looping GIF (fallback / social preview). */
function storyboard(mp4, chapters, outDir, work) {
  const dir = path.join(work, 'story');
  fs.mkdirSync(dir, { recursive: true });
  const total = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp4], { encoding: 'utf8' }));
  chapters.forEach((c, i) => {
    const end = i + 1 < chapters.length ? chapters[i + 1].start : total;
    const t = c.start + (end - c.start) * 0.62;
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', t.toFixed(2), '-i', mp4, '-frames:v', '1', '-vf', 'scale=960:-1', path.join(dir, `s${String(i).padStart(2, '0')}.png`)]);
  });
  const list = path.join(dir, 'list.txt');
  fs.writeFileSync(list, chapters.map((c, i) => `file 's${String(i).padStart(2, '0')}.png'\nduration 1.9`).join('\n') + `\nfile 's${String(chapters.length - 1).padStart(2, '0')}.png'`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-vf', 'fps=10,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4', '-loop', '0', path.join(outDir, 'hero-storyboard.gif')]);
}
if (require.main === module) main(process.argv[2], process.argv[3]);
module.exports = { STEPS, main };

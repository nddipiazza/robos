#!/usr/bin/env node
// Generates the /future figures as SVG, in a dark palette (rowbose.com) and a light one (PDF).
//   node scripts/future/figures.mjs            -> site/assets/future/*.svg + *-light.svg
//
// The figures are drawn, not AI-generated: every box and arrow here corresponds to a claim in
// the whitepaper, so the picture and the text cannot drift apart without a diff showing it.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PALETTES, kit } from './svg-kit.mjs';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../../site/assets/future');

// ───────────────────────────── Figure 1 · The commons map ─────────────────────────────
function commonsMap(T) {
  const k = kit(T);
  const W = 1600, H = 1030;
  let s = '';

  // header
  s += k.text(40, 62, 'THE SKILL COMMONS', { size: 22, weight: 700, fill: T.accent, ls: 3 });
  s += k.text(40, 114, 'Solve each task once. Reuse it everywhere.', { size: 48, weight: 800 });
  s += k.text(40, 156, 'One shared catalog. Every job is broken down to its base tasks, built once, and snapped together ever after.', { size: 24, fill: T.muted, weight: 500 });

  // ── left column: who adds
  s += k.text(40, 198, 'WHO ADDS TO IT', { size: 20, weight: 700, fill: T.muted, ls: 2 });
  const givers = [
    ['person', 'People', 'engineers, experts'],
    ['robot', 'AI agents', 'any model, any vendor'],
    ['building', 'Companies', 'open or private'],
  ];
  givers.forEach(([ic, title, sub], i) => {
    const y = 212 + i * 132;
    s += k.box(40, y, 270, 118, { r: 18, fill: T.panel, stroke: T.line });
    s += k.icon(ic, 155, y + 12, 40, T.accent);
    s += k.text(175, y + 78, title, { size: 24, weight: 700, anchor: 'middle' });
    s += k.text(175, y + 103, sub, { size: 19, fill: T.muted, anchor: 'middle' });
  });
  s += k.line(175, 598, 175, 626, { stroke: T.accent, sw: 3.5, arrow: 'accent' });
  s += k.box(40, 630, 270, 234, { r: 18, fill: T.accentSoft, stroke: T.accent, sw: 2.6 });
  s += k.text(64, 668, 'THE ONE RULE', { size: 20, weight: 700, fill: T.accent, ls: 2 });
  ['Not already there', 'Passes its tests', 'Built and signed'].forEach((t, i) => {
    const y = 712 + i * 44;
    s += k.icon('check', 62, y - 20, 28, T.accent);
    s += k.text(98, y, t, { size: 20, weight: 600 });
  });
  s += k.text(64, 846, 'Humans and AI alike', { size: 19, fill: T.muted });
  s += k.line(310, 746, 346, 746, { stroke: T.accent, sw: 3.5, arrow: 'accent' });

  // ── centre: the commons
  s += k.box(346, 178, 908, 686, { r: 28, fill: T.panel, stroke: T.accent, sw: 3 });
  s += k.text(378, 224, 'THE COMMONS', { size: 22, weight: 700, fill: T.accent, ls: 3 });
  s += k.text(1222, 224, 'open · searchable · every skill built once', { size: 20, fill: T.muted, anchor: 'end' });

  const cap = (y, a, b) => k.text(378, y, a, { size: 19, weight: 700, fill: T.muted, ls: 1.5, vcenter: true, lh: 1.25 }) + (b ? k.text(378, y + 36, b, { size: 17, fill: T.muted }) : '');
  s += cap(295, 'BIG JOB');
  s += cap(457, 'SMALLER\nJOBS');
  s += cap(618, 'BASE\nTASKS', 'compiled');
  s += cap(809, 'OTHER\nAPPS');

  const bx = [567, 716, 865, 1014, 1163]; // brick centres
  const bw = 134, brickY = 580, brickH = 116;
  const jobs = [
    { c: bx[0], t: 'Find who\nto remind', kids: [0] },
    { c: bx[1], t: 'Write the\nmessage', kids: [1] },
    { c: (bx[2] + bx[3]) / 2, t: 'Send a\ntext', kids: [2, 3] },
    { c: bx[4], t: 'Log what\nwas sent', kids: [4] },
  ];
  const rootC = 865, rootY = 262, rootH = 66, jobY = 424, jobH = 66;

  // edges first so boxes sit on top
  jobs.forEach((j) => {
    s += k.edge(rootC, rootY + rootH, j.c, jobY, { stroke: T.line });
    j.kids.forEach((i) => { s += k.edge(j.c, jobY + jobH, bx[i], brickY - 10, { stroke: T.line }); });
  });

  s += k.box(rootC - 160, rootY, 320, rootH, { r: 16, fill: T.panel2, stroke: T.accent, sw: 2.6 });
  s += k.text(rootC, rootY + rootH / 2, 'Clinic reminder app', { size: 25, weight: 800, anchor: 'middle', vcenter: true });
  jobs.forEach((j) => {
    s += k.box(j.c - 68, jobY, 136, jobH, { r: 14, fill: T.panel2, stroke: T.line, sw: 2.2 });
    s += k.text(j.c, jobY + jobH / 2, j.t, { size: 20, weight: 700, anchor: 'middle', vcenter: true, lh: 1.15 });
  });
  const bricks = [
    ['Convert\ntime zone', '#a41c'], ['Fill a\ntemplate', '#19be'], ['Format\nphone\nnumber', '#77d0'],
    ['Call the\ntext\nservice', '#c25a'], ['Save a\nrecord', '#3f08'],
  ];
  bricks.forEach(([label, tag], i) => {
    s += k.brick(bx[i] - bw / 2, brickY, bw, brickH, { label, tag, seal: true });
  });

  // the shelf: every other app plugs into the same pieces
  s += k.line(500, 738, 1230, 738, { stroke: T.accent, sw: 6 });
  s += k.pill(865, 738, 'REUSED, NEVER REBUILT', { size: 18, fill: T.panel, stroke: T.ok, color: T.ok, ls: 1, wide: true });
  [['Online store', 580, 150], ['Booking site', 770, 150], ['Payroll tool', 960, 150], ['+ many more', 1138, 150]].forEach(([t, cx, w]) => {
    s += k.line(cx, 741, cx, 786, { stroke: T.accent, sw: 2.5 });
    s += k.box(cx - w / 2, 786, w, 46, { r: 23, fill: T.panel2, stroke: T.line, sw: 2 });
    s += k.text(cx, 809, t, { size: 19, weight: 600, anchor: 'middle', vcenter: true });
  });

  // ── right column: who uses
  s += k.text(1290, 198, 'WHO USES IT', { size: 20, weight: 700, fill: T.muted, ls: 2 });
  s += k.box(1290, 212, 270, 140, { r: 18, fill: T.privateSoft, stroke: T.private });
  s += k.icon('graph', 1405, 222, 40, T.private);
  s += k.text(1425, 292, "Your company's\nprivate knowledge", { size: 22, weight: 700, anchor: 'middle', lh: 1.15 });
  s += k.text(1425, 340, 'never leaves your walls', { size: 18, fill: T.muted, anchor: 'middle' });
  s += k.line(1425, 354, 1425, 386, { stroke: T.private, sw: 3.5, arrow: 'private' });

  s += k.box(1290, 390, 270, 232, { r: 18, fill: T.panel, stroke: T.accent, sw: 2.6 });
  s += k.icon('laptop', 1352, 404, 48, T.accent);
  s += k.icon('chip', 1430, 404, 48, T.accent);
  s += k.text(1425, 484, 'Your computer', { size: 24, weight: 800, anchor: 'middle' });
  s += k.text(1425, 518, 'with a small AI model.\nIt searches a local copy\nof the catalog and\nsnaps pieces together.', { size: 19, fill: T.muted, anchor: 'middle', lh: 1.3 });
  s += k.line(1254, 506, 1290, 506, { stroke: T.accent, sw: 3.5, arrow: 'accent' });
  s += k.line(1425, 624, 1425, 654, { stroke: T.accent, sw: 3.5, arrow: 'accent' });

  s += k.box(1290, 658, 270, 206, { r: 18, fill: T.panel, stroke: T.line });
  s += k.text(1425, 692, 'Your finished app', { size: 22, weight: 800, anchor: 'middle' });
  const mini = [[T.accent, T.accentSoft], [T.accent, T.accentSoft], [T.accent, T.accentSoft], [T.private, T.privateSoft], [T.neu, T.neuSoft, true]];
  mini.forEach(([c, soft, dash], i) => { s += k.brick(1305 + i * 50, 722, 42, 38, { label: '', color: c, soft, dash: dash ? '5 4' : undefined, sw: 2.4 }); });
  [[T.accent, 'from the commons'], [T.private, 'from your company'], [T.neu, 'new, built once']].forEach(([c, t], i) => {
    const y = 796 + i * 28;
    s += k.box(1308, y - 13, 16, 16, { r: 4, fill: c });
    s += k.text(1334, y, t, { size: 18, fill: T.text });
  });

  // ── bottom: three rules
  const rules = [
    ['1', 'Break every job down\nto its base tasks.'],
    ['2', 'Check the shelf first.\nIf it exists, reuse it.'],
    ['3', "If it doesn't, build it once\nand add it for everyone."],
  ];
  rules.forEach(([n, t], i) => {
    const x = 40 + i * 513;
    s += k.box(x, 896, 493, 104, { r: 20, fill: T.panel, stroke: T.line });
    s += k.circle(x + 50, 948, 26, { fill: T.accent });
    s += k.text(x + 50, 948, n, { size: 28, weight: 800, anchor: 'middle', vcenter: true, fill: T.onAccent });
    s += k.text(x + 94, 948, t, { size: 24, weight: 700, vcenter: true, lh: 1.25 });
  });

  return k.svg(W, H, s,
    'The Skill Commons',
    'A shared catalog of verified, compiled skills. People, AI agents and companies add skills through one gate: not already there, passes its tests, built and signed. A job such as a clinic reminder app is broken into smaller jobs and then into base tasks. Other apps reuse the same base tasks. A small AI model on your own computer searches a local copy of the catalog and your company\'s private knowledge, then snaps the pieces together; anything missing is built once and shared.');
}

// ───────────────────────────── Figure 2 · A worked example ─────────────────────────────
function workedExample(T) {
  const k = kit(T);
  const W = 1600, H = 900;
  let s = '';
  s += k.text(40, 62, 'WORKED EXAMPLE · ILLUSTRATIVE', { size: 22, weight: 700, fill: T.accent, ls: 3 });
  s += k.text(40, 114, '“Text my patients the day before their appointment.”', { size: 42, weight: 800 });
  s += k.text(40, 154, 'What the assembler does with that one sentence.', { size: 24, fill: T.muted });

  const bx = [119, 249, 379, 509, 639, 769, 899], bw = 122, brickY = 500, brickH = 116;
  const bricks = [
    { l: 'Read clinic\nschedule', kind: 'company', tag: 'private' },
    { l: 'Convert\ntime zone', kind: 'found', tag: '#a41c' },
    { l: 'Fill a\ntemplate', kind: 'found', tag: '#19be' },
    { l: 'Format\nphone\nnumber', kind: 'found', tag: '#77d0' },
    { l: 'Call the\ntext\nservice', kind: 'found', tag: '#c25a' },
    { l: 'Respect\nquiet\nhours', kind: 'new', tag: 'missing' },
    { l: 'Save a\nrecord', kind: 'found', tag: '#3f08' },
  ];
  const style = {
    found: { c: T.accent, soft: T.accentSoft, chip: 'FOUND', chipFill: T.accentSoft },
    company: { c: T.private, soft: T.privateSoft, chip: 'COMPANY', chipFill: T.privateSoft },
    new: { c: T.neu, soft: T.neuSoft, chip: 'NEW', chipFill: T.neuSoft },
  };
  const l1 = [
    { c: 184, w: 196, t: "Find tomorrow's\nappointments", kids: [0, 1] },
    { c: 379, w: 150, t: 'Write the\nmessage', kids: [2] },
    { c: 639, w: 176, t: 'Send the\ntext', kids: [3, 4, 5] },
    { c: 899, w: 170, t: 'Record that\nit was sent', kids: [6] },
  ];
  const rootC = 541, rootY = 196, rootH = 66, l1Y = 340, l1H = 66;
  l1.forEach((n) => {
    s += k.edge(rootC, rootY + rootH, n.c, l1Y, { stroke: T.line });
    n.kids.forEach((i) => { s += k.edge(n.c, l1Y + l1H, bx[i], brickY - 10, { stroke: T.line }); });
  });
  s += k.box(rootC - 224, rootY, 448, rootH, { r: 16, fill: T.panel2, stroke: T.accent, sw: 2.6 });
  s += k.text(rootC, rootY + rootH / 2, 'Send appointment reminders', { size: 24, weight: 800, anchor: 'middle', vcenter: true });
  s += k.text(rootC + 244, rootY + 26, 'The model writes only this:', { size: 20, fill: T.muted });
  s += k.text(rootC + 244, rootY + 52, 'how the pieces connect.', { size: 20, fill: T.muted });
  l1.forEach((n) => {
    s += k.box(n.c - n.w / 2, l1Y, n.w, l1H, { r: 14, fill: T.panel2, stroke: T.line, sw: 2.2 });
    s += k.text(n.c, l1Y + l1H / 2, n.t, { size: 20, weight: 700, anchor: 'middle', vcenter: true, lh: 1.15 });
  });
  bricks.forEach((b, i) => {
    const st = style[b.kind];
    s += k.brick(bx[i] - bw / 2, brickY, bw, brickH, { label: b.l, tag: b.tag, color: st.c, soft: st.soft, seal: b.kind === 'found', dash: b.kind === 'new' ? '7 5' : undefined });
    s += k.pill(bx[i], brickY + brickH + 36, st.chip, { size: 17, fill: st.chipFill, stroke: st.c, ls: 1, wide: true });
  });

  // tally
  const stat = [
    ['5', 'reused exactly\nas they are', T.accent, T.accentSoft],
    ['1', "the clinic's own\nprivate data", T.private, T.privateSoft],
    ['1', 'missing: built\nonce, then shared', T.neu, T.neuSoft],
  ];
  stat.forEach(([n, t, c, soft], i) => {
    const x = 40 + i * 330;
    s += k.box(x, 704, 300, 140, { r: 18, fill: soft, stroke: c, sw: 2.4 });
    s += k.text(x + 28, 790, n, { size: 76, weight: 800, fill: c });
    s += k.text(x + 96, 776, t, { size: 19, weight: 600, lh: 1.3 });
  });

  // lookup log
  s += k.text(1040, 198, 'WHAT THE ASSEMBLER ASKED THE INDEX', { size: 20, weight: 700, fill: T.muted, ls: 1.5 });
  s += k.box(1040, 214, 520, 630, { r: 18, fill: T.panel, stroke: T.line });
  const log = [
    ['read-clinic-schedule', '→ found in company graph', T.private],
    ['convert-time-zone', '→ found  sha256:a41c…', T.accent],
    ['fill-template', '→ found  sha256:19be…', T.accent],
    ['format-phone-number', '→ found  sha256:77d0…', T.accent],
    ['call-text-service', '→ found  sha256:c25a…', T.accent],
    ['respect-quiet-hours', '→ not found: build once', T.neu],
    ['save-record', '→ found  sha256:3f08…', T.accent],
  ];
  log.forEach(([name, res, c], i) => {
    const y = 268 + i * 82;
    s += k.text(1068, y, name, { size: 21, mono: true, weight: 500 });
    s += k.text(1068, y + 30, res, { size: 19, mono: true, fill: c, weight: 400 });
    if (i < log.length - 1) s += k.line(1068, y + 52, 1532, y + 52, { stroke: T.line, sw: 1.5 });
  });
  return k.svg(W, H, s, 'A worked example of assembling an app from the commons',
    'The request "text my patients the day before their appointment" becomes a reminder app made of four smaller jobs and seven base tasks. Five base tasks are found in the commons and reused as they are, one comes from the clinic\'s own private knowledge graph, and one, respect quiet hours, is missing and is built once and then added for everyone. The model writes only the wiring that connects the pieces.');
}

// ───────────────────────────── Figure 3 · The assembler loop ─────────────────────────────
function assemblerLoop(T) {
  const k = kit(T);
  const W = 1600, H = 660;
  let s = '';
  s += k.text(40, 62, 'HOW A SMALL MODEL ASSEMBLES AN APP', { size: 22, weight: 700, fill: T.accent, ls: 3 });
  s += k.text(40, 114, 'The model proposes. Machines check.', { size: 46, weight: 800 });

  const stages = [
    ['person', 'You describe\nthe job', 'in plain language', T.text],
    ['chip', 'The model breaks\nit down', 'into smaller jobs', T.accent],
    ['search', 'It looks up\neach job', 'your company first,\nthen the catalog', T.accent],
    ['shield', 'Machines check\nthe fit', 'do the inputs and\noutputs match?', T.ok],
    ['check', 'Pieces run\ntheir own tests', 'every skill ships\nwith its tests', T.ok],
  ];
  const w = 270, gap = 40, x0 = 45, y = 190, h = 214;
  stages.forEach(([ic, title, sub, c], i) => {
    const x = x0 + i * (w + gap);
    s += k.box(x, y, w, h, { r: 20, fill: T.panel, stroke: c === T.text ? T.line : c, sw: 2.6 });
    s += k.circle(x + 36, y + 36, 20, { fill: c === T.text ? T.line : c });
    s += k.text(x + 36, y + 36, String(i + 1), { size: 22, weight: 800, anchor: 'middle', vcenter: true, fill: c === T.text ? T.text : T.onAccent });
    s += k.icon(ic, x + w - 72, y + 16, 44, c === T.text ? T.muted : c);
    s += k.text(x + 24, y + 106, title, { size: 25, weight: 800, lh: 1.15 });
    s += k.text(x + 24, y + 170, sub, { size: 20, fill: T.muted, lh: 1.25 });
    if (i < stages.length - 1) s += k.line(x + w + 4, y + h / 2, x + w + gap - 4, y + h / 2, { stroke: T.muted, sw: 3, arrow: 'muted' });
  });
  const xe = x0 + 4 * (w + gap) + w;
  // brackets: who does what
  const bracket = (xa, xb, label, c) => k.path(`M${xa} 424 V436 H${xb} V424`, { stroke: c, sw: 3 }) + k.text((xa + xb) / 2, 470, label, { size: 21, weight: 800, fill: c, anchor: 'middle', ls: 1.5 });
  s += bracket(x0 + (w + gap) + 6, x0 + 2 * (w + gap) + w - 6, "THE MODEL'S JOB", T.accent);
  s += bracket(x0 + 3 * (w + gap) + 6, xe - 6, 'THE MACHINES\' JOB · NO GUESSING', T.ok);
  // gap loop
  const gx = x0 + 2 * (w + gap), gy = 506;
  s += k.box(gx - 150, gy, w + 300, 108, { r: 20, fill: T.neuSoft, stroke: T.neu, sw: 2.6, dash: '9 6' });
  s += k.icon('gap', gx - 130, gy + 30, 44, T.neu);
  s += k.text(gx - 66, gy + 38, 'Nothing matches?', { size: 24, weight: 800, fill: T.neu });
  s += k.text(gx - 66, gy + 68, 'A person or an AI builds that one piece, once.', { size: 20, fill: T.text });
  s += k.text(gx - 66, gy + 92, 'It passes the gate and joins the catalog.', { size: 20, fill: T.muted });
  s += k.path(`M${gx + 135} ${gy} V${y + h + 2}`, { stroke: T.neu, sw: 3, arrow: 'neu', dash: '2 0' });
  s += k.text(gx + 150, gy - 26, 'then look again', { size: 19, fill: T.neu, weight: 600 });
  return k.svg(W, H, s, 'How a small local model assembles an app',
    'Five steps. You describe the job in plain language. The small model breaks it into smaller jobs and looks each one up, company knowledge first and then the catalog. Machines then check that the pieces fit and run each piece\'s own tests. If nothing matches, a person or an AI builds that one piece once, it passes the gate and joins the catalog, and the lookup runs again.');
}

// ───────────────────────────── Figure 4 · A skill's life ─────────────────────────────
function skillLifecycle(T) {
  const k = kit(T);
  const W = 1600, H = 660;
  let s = '';
  s += k.text(40, 62, 'HOW A SKILL ENTERS THE COMMONS', { size: 22, weight: 700, fill: T.accent, ls: 3 });
  s += k.text(40, 114, 'One gate, the same for people and AI.', { size: 46, weight: 800 });

  const steps = [
    ['person', 'Propose', 'A person or an AI submits what the skill does, its tests and its code.', T.text],
    ['search', 'Find a twin', 'Search by what it does, not only by its name.', T.accent],
    ['shield', 'Check it', 'Tests pass. It runs in a sandbox with a time and step limit.', T.ok],
    ['box', 'Build it', 'Built the same way every time, for each kind of computer.', T.ok],
    ['shield', 'Sign it', 'Signed, and the signature goes in a public log.', T.ok],
    ['cloud', 'Share it', 'Copied to mirrors: yours, your company\'s, the world\'s.', T.accent],
  ];
  const w = 232, gap = 24, x0 = 44, y = 180, h = 252;
  steps.forEach(([ic, title, sub, c], i) => {
    const x = x0 + i * (w + gap);
    const line = c === T.text ? T.line : c;
    s += k.box(x, y, w, h, { r: 20, fill: T.panel, stroke: line, sw: 2.6 });
    s += k.circle(x + 34, y + 34, 19, { fill: line });
    s += k.text(x + 34, y + 34, String(i + 1), { size: 21, weight: 800, anchor: 'middle', vcenter: true, fill: c === T.text ? T.text : T.onAccent });
    s += k.icon(ic, x + w - 64, y + 14, 42, c === T.text ? T.muted : c);
    s += k.text(x + 20, y + 100, title, { size: 25, weight: 800 });
    const words = sub.split(' '); let ln = '', lines = [];
    words.forEach((wd) => { if ((ln + ' ' + wd).trim().length > 21) { lines.push(ln.trim()); ln = wd; } else ln += ' ' + wd; });
    lines.push(ln.trim());
    s += k.text(x + 20, y + 140, lines.join('\n'), { size: 19, fill: T.muted, lh: 1.3 });
    if (i < steps.length - 1) s += k.line(x + w + 3, y + h / 2, x + w + gap - 3, y + h / 2, { stroke: T.muted, sw: 3, arrow: 'muted' });
  });
  // branches
  const branch = (i, text1, text2, c, soft) => {
    const x = x0 + i * (w + gap);
    s += k.line(x + w / 2, y + h + 4, x + w / 2, y + h + 44, { stroke: c, sw: 3, arrow: c === T.ok ? 'ok' : 'neu' });
    s += k.box(x, y + h + 48, w, 128, { r: 18, fill: soft, stroke: c, sw: 2.4 });
    s += k.text(x + w / 2, y + h + 86, text1, { size: 21, weight: 800, fill: c, anchor: 'middle' });
    s += k.text(x + w / 2, y + h + 116, text2, { size: 19, fill: T.text, anchor: 'middle', lh: 1.28 });
  };
  branch(1, 'Already exists', 'Link to it. Nothing\nnew is added.', T.ok, T.okSoft);
  branch(2, 'A test fails', 'Sent back with the\nfailing test attached.', T.neu, T.neuSoft);
  return k.svg(W, H, s, 'How a skill enters the commons',
    'Six steps. Propose a skill; look for an existing twin; check it with tests in a sandbox with time and step limits; build it reproducibly for each kind of computer; sign it and record the signature in a public log; then share it to mirrors. If a twin already exists the submission links to it instead of adding anything. If a test fails it is sent back with the failing test.');
}

// ───────────────────────────── Social preview (1200×630) ─────────────────────────────
function ogCard(T) {
  const k = kit(T);
  const W = 1200, H = 630;
  let s = '';
  s += k.text(70, 120, 'THE SKILL COMMONS', { size: 26, weight: 700, fill: T.accent, ls: 4 });
  s += k.text(70, 232, 'Solve each task once.', { size: 84, weight: 800 });
  s += k.text(70, 330, 'Reuse it everywhere.', { size: 84, weight: 800, fill: T.accent });
  s += k.text(70, 396, 'A shared catalog of finished building blocks,\nsnapped together by a small AI on your own computer.', { size: 30, fill: T.muted, lh: 1.3 });
  const xs = [70, 250, 430, 610, 790];
  const kinds = [[T.accent, T.accentSoft], [T.accent, T.accentSoft], [T.accent, T.accentSoft], [T.private, T.privateSoft], [T.neu, T.neuSoft, true]];
  xs.forEach((x, i) => { s += k.brick(x, 484, 160, 84, { label: '', color: kinds[i][0], soft: kinds[i][1], dash: kinds[i][2] ? '8 6' : undefined, seal: i < 3 }); });
  s += k.text(1130, 570, 'rowbose.com/future', { size: 26, weight: 600, fill: T.muted, anchor: 'end' });
  return k.svg(W, H, s, 'The Skill Commons: solve each task once, reuse it everywhere', 'A row of snapped-together building blocks under the headline "Solve each task once. Reuse it everywhere."');
}

const FIGURES = {
  'commons-map': commonsMap,
  'worked-example': workedExample,
  'assembler-loop': assemblerLoop,
  'skill-lifecycle': skillLifecycle,
  og: ogCard,
};

mkdirSync(OUT, { recursive: true });
for (const [name, fn] of Object.entries(FIGURES)) {
  writeFileSync(join(OUT, `${name}.svg`), fn(PALETTES.dark));
  if (name === 'og') { console.log(`wrote ${name}.svg`); continue; }
  writeFileSync(join(OUT, `${name}-light.svg`), fn(PALETTES.light));
  console.log(`wrote ${name}.svg + ${name}-light.svg`);
}

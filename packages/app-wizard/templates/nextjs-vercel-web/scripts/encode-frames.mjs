#!/usr/bin/env node
// Encode CDP screencast frames (captured by the Cucumber world) into constant-frame-rate MP4s whose
// first frame is exactly at timeline actor.videoStart. Usage: node scripts/encode-frames.mjs [evidenceDir]
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const EVIDENCE = path.resolve(process.argv[2] || 'evidence');
for (const d of fs.readdirSync(EVIDENCE, { withFileTypes: true })) {
  if (!d.isDirectory()) continue;
  const dir = path.join(EVIDENCE, d.name);
  const tlPath = path.join(dir, 'timeline.json');
  if (!fs.existsSync(tlPath)) continue;
  const tl = JSON.parse(fs.readFileSync(tlPath, 'utf8'));
  for (const a of tl.actors) {
    if (!a.frames) continue;
    const out = path.join(dir, a.video);
    if (fs.existsSync(out)) continue;
    const { dir: fdir, frames } = JSON.parse(fs.readFileSync(path.join(dir, a.frames), 'utf8'));
    const end = Math.max(tl.end || 0, frames.at(-1).t + 1000);
    const lines = [];
    frames.forEach((fr, i) => {
      const next = i + 1 < frames.length ? frames[i + 1].t : end;
      lines.push(`file '${path.join(dir, fdir, fr.f)}'`, `duration ${Math.max(0.001, (next - fr.t) / 1000).toFixed(3)}`);
    });
    lines.push(`file '${path.join(dir, fdir, frames.at(-1).f)}'`);
    const list = path.join(dir, `${a.name.toLowerCase()}-frames.txt`);
    fs.writeFileSync(list, lines.join('\n'));
    const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list,
      '-vf', 'fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', out], { stdio: 'inherit' });
    if (r.status !== 0) throw new Error(`encode failed for ${out}`);
    console.log(`✔ ${path.relative(EVIDENCE, out)} (${frames.length} frames)`);
  }
}
